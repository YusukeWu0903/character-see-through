// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v20';
assert.ok(['motion_v20','motion_v21'].includes(candidate));
const output=resolve('outputs/seethrough_local',task,'_review',candidate);
async function inspect(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json';
  const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),
    {method:'PUT'});
  assert.ok(response.ok);
  const page=await response.json(),ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
  let id=0;const pending=new Map();
  ws.onmessage=event=>{
    const result=JSON.parse(event.data),waiter=pending.get(result.id);
    if(!waiter)return;
    pending.delete(result.id);
    if(result.error||result.result?.exceptionDetails)
      waiter.reject(Error(result.error?.message||result.result.exceptionDetails.text));
    else waiter.resolve(result.result.result.value);
  };
  const evaluate=expression=>new Promise((ok,bad)=>{
    const key=++id;pending.set(key,{resolve:ok,reject:bad});
    ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',
      params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  try{
    await evaluate(`new Promise((ok,bad)=>{const start=Date.now(),timer=setInterval(()=>{
      if(window.__miffyMotion?.loaded){clearInterval(timer);ok(true)}
      else if(document.querySelector('#error').textContent||Date.now()-start>30000){
        clearInterval(timer);bad(Error(document.querySelector('#error').textContent||'timeout'))}
    },100)})`);
    const result=await evaluate(`(()=>{
      document.querySelector('#neutral').click();
      const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d');
      const ref=document.querySelector('#reference');ref.checked=true;
      ref.dispatchEvent(new Event('change'));
      const reference=ctx.getImageData(0,0,1280,1280).data;
      ref.checked=false;ref.dispatchEvent(new Event('change'));
      const states=[];
      for(const value of [0,50,100]){
        const slider=document.querySelector('#blink');slider.value=String(value);
        slider.dispatchEvent(new Event('input'));
        const now=ctx.getImageData(0,0,1280,1280).data;
        let earDifference=0;const earByX={};
        for(let y=90;y<125;y++)for(let x=670;x<676;x++){
          const i=(y*1280+x)*4;
          if(now[i]!==reference[i]||now[i+1]!==reference[i+1]||
             now[i+2]!==reference[i+2]||now[i+3]!==reference[i+3]){
            earDifference++;earByX[x]=(earByX[x]||0)+1;
          }
        }
        const crop=document.createElement('canvas');crop.width=600;crop.height=480;
        crop.getContext('2d').drawImage(canvas,570,60,150,120,0,0,600,480);
        states.push({blink:value,earDifference,earByX,image:crop.toDataURL('image/png')});
      }
      return {candidate:window.__miffyMotion.candidate,states};
    })()`);
    assert.equal(result.candidate,candidate);
    return result;
  }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}
const old=await inspect('motion_v19'),next=await inspect(candidate);
for(const state of old.states)
  writeFileSync(resolve(output,`prior_blink_${state.blink}.png`),
    Buffer.from(state.image.split(',')[1],'base64'));
for(const state of next.states){
  writeFileSync(resolve(output,`blink_${state.blink}.png`),
    Buffer.from(state.image.split(',')[1],'base64'));
}
console.log(JSON.stringify({old:old.states.map(({blink,earDifference,earByX})=>({blink,earDifference,earByX})),
  repaired:next.states.map(({blink,earDifference,earByX})=>({blink,earDifference,earByX}))}));
for(const state of next.states)
  assert.equal(state.earDifference,0,`ear backing still changes source pixels at blink ${state.blink}`);
assert.ok(old.states.some(state=>state.earDifference>0),
  'old eye backing did not reproduce the ear-root overlap');
