// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v24');
mkdirSync(output,{recursive:true});

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
    if(!waiter)return;pending.delete(result.id);
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
    return await evaluate(`(async()=>{
      document.querySelector('#neutral').click();
      const stage=document.querySelector('#stage'),ctx=stage.getContext('2d');
      const hash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
        ctx.getImageData(0,0,stage.width,stage.height).data))].
        map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const crop=()=>{const image=document.createElement('canvas');
        image.width=640;image.height=440;
        image.getContext('2d').drawImage(stage,480,0,320,220,0,0,640,440);
        return image.toDataURL('image/png').split(',')[1]};
      const neutral=await hash(),slider=document.querySelector('#yaw');
      const frames=[];
      for(const value of [-100,100]){
        slider.value=value;slider.dispatchEvent(new Event('input'));
        const unmarked=await hash();
        const toggle=document.querySelector('#show-head-geometry');
        toggle.checked=true;toggle.dispatchEvent(new Event('change'));
        const marked=await hash();
        frames.push({value,unmarked,marked,image:crop(),
          degrees:window.__miffyMotion.headGeometryDegrees,
          marks:window.__miffyMotion.headGeometry});
        toggle.checked=false;toggle.dispatchEvent(new Event('change'));
      }
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,
        yawEnabled:!slider.disabled,
        guideEnabled:!document.querySelector('#show-head-geometry').disabled,
        guideDefaultOff:!document.querySelector('#show-head-geometry').defaultChecked,
        neutral,restored:await hash(),frames};
    })()`);
  }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}

const baseline=await inspect('motion_v22'),candidate=await inspect('motion_v24');
assert.equal(candidate.neutralMatches,true);
assert.equal(candidate.neutral,baseline.neutral);
assert.equal(candidate.yawEnabled,true);
assert.equal(candidate.guideEnabled,true);
assert.equal(candidate.guideDefaultOff,true);
for(const frame of candidate.frames){
  assert.equal(frame.unmarked,baseline.neutral,'slider must not alter character art');
  assert.notEqual(frame.marked,baseline.neutral,'wireframe must be visible when enabled');
  assert.ok(frame.marks?.noseTip);
  assert.equal(frame.degrees,frame.value<0?-12:12);
  writeFileSync(resolve(output,`review_geometry_${frame.value}.png`),
    Buffer.from(frame.image,'base64'));
}
assert.equal(candidate.restored,baseline.neutral);
assert.notEqual(candidate.frames[0].marked,candidate.frames[1].marked);
console.log(JSON.stringify({candidate:candidate.candidate,neutralSameAsV22:true,
  sliderDoesNotChangeArt:true,overlayRestoresPixels:true,
  angles:candidate.frames.map(frame=>frame.degrees)}));
