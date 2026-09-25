// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidateName=process.argv[2]||'motion_v25';
const output=resolve('outputs/seethrough_local',task,'_review',candidateName);
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
      const neutral=await hash(),neutralPixels=new Uint8ClampedArray(
        ctx.getImageData(0,0,stage.width,stage.height).data);
      const slider=document.querySelector('#yaw');
      const frames=[];
      for(const value of [-100,-50,0,50,100]){
        if(!slider.disabled){slider.value=value;slider.dispatchEvent(new Event('input'))}
        frames.push({value,hash:await hash(),image:crop(),
          degrees:window.__miffyMotion.headSurfaceDegrees});
      }
      const guide=document.querySelector('#show-head-surface');
      if(!guide.disabled){guide.checked=true;guide.dispatchEvent(new Event('change'))}
      const guideHash=await hash(),guideImage=crop();
      guide.checked=false;guide.dispatchEvent(new Event('change'));
      const turnedPixels=ctx.getImageData(0,0,stage.width,stage.height).data;
      let changedBelow=0,changedOutside=0;
      for(let y=0;y<stage.height;y++)for(let x=0;x<stage.width;x++){
        const i=(y*stage.width+x)*4;
        if(turnedPixels[i]===neutralPixels[i]&&
           turnedPixels[i+1]===neutralPixels[i+1]&&
           turnedPixels[i+2]===neutralPixels[i+2]&&
           turnedPixels[i+3]===neutralPixels[i+3])continue;
        if(y>=226)changedBelow++;
        if(x<510||x>=740)changedOutside++;
      }
      let combinedHash=null,combinedImage=null;
      if(!slider.disabled){
        for(const [id,value] of [['blink',100],['gaze-x',50],['head-roll',60]]){
          const control=document.querySelector('#'+id);
          control.value=value;control.dispatchEvent(new Event('input'));
        }
        combinedHash=await hash();combinedImage=crop();
      }
      document.querySelector('#neutral').click();
      return {candidate:window.__miffyMotion.candidate,
        compareLink:document.querySelector('#latest').getAttribute('href'),
        neutralMatches:window.__miffyMotion.neutralMatches,
        yawEnabled:!slider.disabled,guideEnabled:!guide.disabled,
        neutral,restored:frames.at(-1).hash,returnNeutral:await hash(),
        guideHash,guideImage,changedBelow,changedOutside,
        combinedHash,combinedImage,frames};
    })()`);
  }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}

const baseline=await inspect('motion_v22'),candidate=await inspect(candidateName);
assert.equal(candidate.neutralMatches,true);
assert.ok(candidate.compareLink.includes(candidateName==='motion_v26'
  ? '_review/motion_v25/rig.json':'_review/motion_v26/rig.json'));
assert.equal(candidate.neutral,baseline.neutral);
assert.equal(candidate.yawEnabled,true);
assert.equal(candidate.guideEnabled,true);
assert.deepEqual(candidate.frames.map(frame=>frame.degrees),[-8,-4,0,4,8]);
assert.equal(candidate.frames[2].hash,baseline.neutral);
assert.notEqual(candidate.frames[0].hash,baseline.neutral);
assert.notEqual(candidate.frames[4].hash,baseline.neutral);
assert.notEqual(candidate.frames[0].hash,candidate.frames[4].hash);
assert.notEqual(candidate.guideHash,candidate.restored);
assert.equal(candidate.restored,candidate.frames[4].hash);
assert.equal(candidate.returnNeutral,baseline.neutral);
assert.equal(candidate.changedBelow,0,'neck and body below field must not change');
assert.equal(candidate.changedOutside,0,'outside head crop must not change');
assert.notEqual(candidate.combinedHash,baseline.neutral);
for(const frame of candidate.frames)
  writeFileSync(resolve(output,`review_surface_${frame.value}.png`),
    Buffer.from(frame.image,'base64'));
writeFileSync(resolve(output,'review_surface_guide.png'),
  Buffer.from(candidate.guideImage,'base64'));
writeFileSync(resolve(output,'review_surface_blink_gaze_roll.png'),
  Buffer.from(candidate.combinedImage,'base64'));
console.log(JSON.stringify({candidate:candidate.candidate,
  neutralSameAsV22:true,actualPixelsMove:true,
  guideRestoresPixels:true,changedBelow:0,changedOutside:0,
  combinedBlinkGazeRoll:true,angles:candidate.frames.map(frame=>frame.degrees)}));
