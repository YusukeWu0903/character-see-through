// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/cheek_outline_v1');
async function inspect(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json';
  const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),
    {method:'PUT'});assert.ok(response.ok);
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
    const result=await evaluate(`(()=>{
      document.querySelector('#neutral').click();
      const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d');
      const poses=[{name:'neutral',head:0,hair:0},
        {name:'head_right',head:80,hair:0},
        {name:'head_left',head:-80,hair:0},
        {name:'hair_only',head:0,hair:80}];
      const frames=[];
      for(const pose of poses){
        for(const key of ['head','hair']){
          const slider=document.querySelector('#'+key);slider.value=pose[key];
          slider.dispatchEvent(new Event('input'));
        }
        const pixels=Array.from(ctx.getImageData(575,130,55,55).data);
        const crop=document.createElement('canvas');crop.width=680;crop.height=580;
        crop.getContext('2d').drawImage(canvas,550,75,170,145,0,0,680,580);
        frames.push({name:pose.name,pixels,image:crop.toDataURL('image/png')});
      }
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,frames};
    })()`);
    assert.equal(result.candidate,candidate);
    assert.equal(result.neutralMatches,true);
    return result;
  }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}
const old=await inspect('motion_v20'),next=await inspect('motion_v21');
const comparisons=[];
for(let j=0;j<next.frames.length;j++){
  const a=old.frames[j],b=next.frames[j];assert.equal(a.name,b.name);
  let changed=0;let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;
  for(let k=0;k<a.pixels.length;k+=4){
    if(a.pixels.slice(k,k+4).every((v,i)=>v===b.pixels[k+i]))continue;
    const x=575+(k/4)%55,y=130+Math.floor(k/4/55);
    changed++;minX=Math.min(minX,x);minY=Math.min(minY,y);
    maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  comparisons.push({pose:a.name,changed,bounds:[minX,minY,maxX,maxY]});
  for(const [prefix,frame] of [['prior',a],['repaired',b]])
    writeFileSync(resolve(output,`${prefix}_${frame.name}.png`),
      Buffer.from(frame.image.split(',')[1],'base64'));
}
assert.equal(comparisons[0].changed,3,'neutral repair should change exactly three contour pixels');
assert.deepEqual(comparisons[0].bounds,[598,151,600,153]);
assert.ok(comparisons.slice(1).every(frame=>frame.changed>0),
  'the cheek repair must remain attached through head and hair movement');
console.log(JSON.stringify(comparisons));
