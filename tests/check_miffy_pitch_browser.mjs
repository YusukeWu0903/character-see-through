import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const oldCandidate=process.argv[2]||'motion_v33';
const nextCandidate=process.argv[3]||'motion_v34';
const output=resolve('outputs/seethrough_local',task,'_review',nextCandidate);
mkdirSync(output,{recursive:true});
async function inspect(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json&review_reload='+nextCandidate+'_pitch_test';
  const response=await fetch('http://127.0.0.1:9337/json/new?'+
    encodeURIComponent(url),{method:'PUT'});
  assert.ok(response.ok);
  const page=await response.json(),ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
  let id=0;const pending=new Map();
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(!waiter)return;pending.delete(message.id);
    if(message.error||message.result?.exceptionDetails)
      waiter.reject(Error(message.error?.message||message.result.exceptionDetails.text));
    else waiter.resolve(message.result.result.value);
  };
  const evaluate=expression=>new Promise((ok,bad)=>{
    const key=++id;pending.set(key,{resolve:ok,reject:bad});
    ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',
      params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  try{
    await evaluate(`new Promise((ok,bad)=>{const t=Date.now(),i=setInterval(()=>{
      if(window.__miffyMotion?.loaded){clearInterval(i);ok(true)}
      else if(document.querySelector('#error').textContent||Date.now()-t>30000){
        clearInterval(i);bad(Error(document.querySelector('#error').textContent||'timeout'))}
    },100)})`);
    return await evaluate(`(async()=>{
      const $=id=>document.getElementById(id),stage=$('stage');
      $('neutral').click();
      const hash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
        stage.getContext('2d').getImageData(0,0,1280,1280).data))]
        .map(x=>x.toString(16).padStart(2,'0')).join('');
      const frames=[];
      for(const [yaw,pitch] of [[0,0],[0,-100],[0,-50],[0,50],[0,100],
        [-50,-100],[-50,100],[50,-100],[50,100]]){
        $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
        if(!$('pitch').disabled){
          $('pitch').value=pitch;$('pitch').dispatchEvent(new Event('input'));
        }
        const image=document.createElement('canvas');
        image.width=320;image.height=290;
        image.getContext('2d').drawImage(stage,480,0,320,290,0,0,320,290);
        const lower=stage.getContext('2d').getImageData(0,550,1280,730).data;
        const lowerHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',lower))]
          .map(x=>x.toString(16).padStart(2,'0')).join('');
        frames.push({yaw,pitch,hash:await hash(),
          lowerHash,
          image:image.toDataURL('image/png').split(',')[1]});
      }
      $('yaw').value=0;$('yaw').dispatchEvent(new Event('input'));
      $('pitch').value=100;$('pitch').dispatchEvent(new Event('input'));
      const guideOff=await hash();
      if(!$('show-head-pitch').disabled){
        $('show-head-pitch').checked=true;
        $('show-head-pitch').dispatchEvent(new Event('change'));
      }
      const guideOn=await hash();
      const guideImage=document.createElement('canvas');
      guideImage.width=320;guideImage.height=290;
      guideImage.getContext('2d').drawImage(stage,480,0,320,290,0,0,320,290);
      $('show-head-pitch').checked=false;
      $('show-head-pitch').dispatchEvent(new Event('change'));
      const guideRestored=await hash();
      $('yaw').value=50;$('yaw').dispatchEvent(new Event('input'));
      $('pitch').value=50;$('pitch').dispatchEvent(new Event('input'));
      const openPose=await hash();
      $('blink').value=100;$('blink').dispatchEvent(new Event('input'));
      $('gaze-x').value=80;$('gaze-x').dispatchEvent(new Event('input'));
      $('gaze-y').value=-50;$('gaze-y').dispatchEvent(new Event('input'));
      const blinkGazePose=await hash();
      $('blink').value=0;$('blink').dispatchEvent(new Event('input'));
      $('gaze-x').value=0;$('gaze-x').dispatchEvent(new Event('input'));
      $('gaze-y').value=0;$('gaze-y').dispatchEvent(new Event('input'));
      $('pitch').value=100;$('pitch').dispatchEvent(new Event('input'));
      $('auto').checked=true;$('auto').dispatchEvent(new Event('change'));
      $('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
      await new Promise(ok=>setTimeout(ok,500));
      const start=performance.now(),draws=window.__miffyMotion.drawCount;
      await new Promise(ok=>setTimeout(ok,2500));
      const fps=(window.__miffyMotion.drawCount-draws)/
        ((performance.now()-start)/1000);
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,
        pitchEnabled:!$('pitch').disabled,
        guideEnabled:!$('show-head-pitch').disabled,
        guideOff,guideOn,guideRestored,
        guideImage:guideImage.toDataURL('image/png').split(',')[1],
        openPose,blinkGazePose,
        backgroundFpsAtYaw50Pitch100:fps,frames};
    })()`);
  }finally{
    ws.close();
    await fetch('http://127.0.0.1:9337/json/close/'+page.id);
  }
}
const old=await inspect(oldCandidate),next=await inspect(nextCandidate);
assert.equal(old.neutralMatches,true);
assert.equal(next.neutralMatches,true);
assert.equal(old.pitchEnabled,oldCandidate!=='motion_v33');
assert.equal(next.pitchEnabled,true);
assert.equal(next.guideEnabled,true);
assert.equal(old.frames[0].hash,next.frames[0].hash);
if(old.pitchEnabled){
  assert.notEqual(old.frames[4].hash,next.frames[4].hash);
  assert.notEqual(old.frames[1].hash,next.frames[1].hash);
}
assert.notEqual(next.guideOff,next.guideOn);
assert.equal(next.guideOff,next.guideRestored);
assert.notEqual(next.openPose,next.blinkGazePose);
for(const frame of next.frames.slice(1))
  assert.notEqual(frame.hash,next.frames[0].hash);
for(const frame of next.frames)
  assert.equal(frame.lowerHash,next.frames[0].lowerHash);
for(const frame of next.frames)
  writeFileSync(resolve(output,`pitch_y${frame.yaw}_p${frame.pitch}.png`),
    Buffer.from(frame.image,'base64'));
writeFileSync(resolve(output,'pitch_y0_p100_guide.png'),
  Buffer.from(next.guideImage,'base64'));
console.log(JSON.stringify({neutralSame:true,guideRestored:true,
  oldFps:old.backgroundFpsAtYaw50Pitch100,
  nextFps:next.backgroundFpsAtYaw50Pitch100,
  frames:next.frames.map(frame=>({yaw:frame.yaw,pitch:frame.pitch,
    hash:frame.hash}))},null,2));
