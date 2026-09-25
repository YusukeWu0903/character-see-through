// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v22');
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
      const crop=()=>{
        const image=document.createElement('canvas');
        image.width=640;image.height=700;
        image.getContext('2d').drawImage(stage,480,0,320,350,0,0,640,700);
        return image.toDataURL('image/png').split(',')[1];
      };
      const frames=[];
      for(const value of [0,-100,100]){
        const slider=document.querySelector('#head-roll');
        if(!slider.disabled){slider.value=value;slider.dispatchEvent(new Event('input'))}
        frames.push({value,hash:await hash(),image:crop(),
          degrees:window.__miffyMotion.headRollDegrees});
      }
      const guide=document.querySelector('#show-guides');
      guide.checked=true;guide.dispatchEvent(new Event('change'));
      const guideHash=await hash();
      guide.checked=false;guide.dispatchEvent(new Event('change'));
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,
        enabled:!document.querySelector('#head-roll').disabled,
        guideHash,guideRestoredHash:await hash(),frames};
    })()`);
  }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}

const old=await inspect('motion_v21'),next=await inspect('motion_v22');
assert.equal(old.neutralMatches,true);
assert.equal(next.neutralMatches,true);
assert.equal(old.enabled,false);
assert.equal(next.enabled,true);
assert.equal(old.frames[0].hash,next.frames[0].hash,'neutral must match v21');
assert.notEqual(next.frames[1].hash,next.frames[0].hash,'left tilt must move pixels');
assert.notEqual(next.frames[2].hash,next.frames[0].hash,'right tilt must move pixels');
assert.notEqual(next.frames[1].hash,next.frames[2].hash,'tilt directions must differ');
assert.equal(next.frames[0].degrees,0);
assert.equal(next.frames[1].degrees,-1.5);
assert.equal(next.frames[2].degrees,1.5);
assert.notEqual(next.guideHash,next.guideRestoredHash);
assert.equal(next.guideRestoredHash,next.frames[2].hash);
for(const frame of next.frames)
  writeFileSync(resolve(output,`review_head_roll_${frame.value}.png`),
    Buffer.from(frame.image,'base64'));
console.log(JSON.stringify({candidate:next.candidate,neutralMatches:true,
  neutralSameAsV21:true,angles:next.frames.map(frame=>frame.degrees),
  guideRestoresPixels:true,images:next.frames.map(frame=>`review_head_roll_${frame.value}.png`)}));
