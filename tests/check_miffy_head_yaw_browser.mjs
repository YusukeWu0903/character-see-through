// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v23');
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
      const lowerHash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
        ctx.getImageData(0,230,stage.width,stage.height-230).data))].
        map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const crop=()=>{
        const image=document.createElement('canvas');
        image.width=640;image.height=700;
        image.getContext('2d').drawImage(stage,480,0,320,350,0,0,640,700);
        return image.toDataURL('image/png').split(',')[1];
      };
      const frames=[];
      for(const value of [0,-100,-50,50,100]){
        const slider=document.querySelector('#yaw');
        if(!slider.disabled){slider.value=value;slider.dispatchEvent(new Event('input'))}
        frames.push({value,hash:await hash(),lowerHash:await lowerHash(),image:crop(),
          bust:window.__miffyMotion.bust,
          yaw:window.__miffyMotion.headYawPixels});
      }
      const slider=document.querySelector('#yaw');
      if(!slider.disabled){
        slider.value=100;slider.dispatchEvent(new Event('input'));
        document.querySelector('#blink').value=100;
        document.querySelector('#blink').dispatchEvent(new Event('input'));
      }
      const blinkHash=await hash(),blinkImage=crop();
      document.querySelector('#blink').value=0;
      document.querySelector('#blink').dispatchEvent(new Event('input'));
      if(!slider.disabled){
        document.querySelector('#head-roll').value=100;
        document.querySelector('#head-roll').dispatchEvent(new Event('input'));
        document.querySelector('#gaze-x').value=100;
        document.querySelector('#gaze-x').dispatchEvent(new Event('input'));
      }
      const combinedHash=await hash(),combinedImage=crop();
      document.querySelector('#head-roll').value=0;
      document.querySelector('#head-roll').dispatchEvent(new Event('input'));
      document.querySelector('#gaze-x').value=0;
      document.querySelector('#gaze-x').dispatchEvent(new Event('input'));
      const guide=document.querySelector('#show-head-yaw-field');
      guide.checked=!guide.disabled;guide.dispatchEvent(new Event('change'));
      const guideHash=await hash();
      guide.checked=false;guide.dispatchEvent(new Event('change'));
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,
        yawEnabled:!slider.disabled,guideEnabled:!guide.disabled,
        guideHash,restoredHash:await hash(),blinkHash,blinkImage,
        combinedHash,combinedImage,frames};
    })()`);
  }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}

const old=await inspect('motion_v22'),next=await inspect('motion_v23');
assert.equal(old.neutralMatches,true);
assert.equal(next.neutralMatches,true);
assert.equal(next.yawEnabled,true);
assert.equal(next.guideEnabled,true);
assert.equal(old.frames[0].hash,next.frames[0].hash,'neutral must match v22');
assert.notEqual(next.frames[1].hash,next.frames[0].hash);
assert.notEqual(next.frames[4].hash,next.frames[0].hash);
assert.notEqual(next.frames[1].hash,next.frames[4].hash);
assert.ok(next.frames.every(frame=>frame.lowerHash===next.frames[0].lowerHash),
  'the lower body and neckline below y=230 must remain pixel-identical');
assert.equal(next.frames[1].yaw,-7);
assert.equal(next.frames[4].yaw,7);
assert.notEqual(next.blinkHash,next.frames[4].hash);
assert.notEqual(next.combinedHash,next.frames[4].hash);
assert.notEqual(next.guideHash,next.restoredHash);
assert.equal(next.restoredHash,next.frames[4].hash);
for(const frame of next.frames)
  writeFileSync(resolve(output,`review_head_yaw_${frame.value}.png`),
    Buffer.from(frame.image,'base64'));
writeFileSync(resolve(output,'review_head_yaw_blink.png'),
  Buffer.from(next.blinkImage,'base64'));
writeFileSync(resolve(output,'review_head_yaw_roll_gaze.png'),
  Buffer.from(next.combinedImage,'base64'));
console.log(JSON.stringify({candidate:next.candidate,neutralSameAsV22:true,
  yawPixels:next.frames.map(frame=>frame.yaw),blinkWithYaw:true,
  rollAndGazeWithYaw:true,
  guideRestoresPixels:true}));
