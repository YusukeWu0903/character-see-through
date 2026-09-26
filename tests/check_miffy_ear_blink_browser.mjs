import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const out=resolve('outputs/seethrough_local',task,'_review/motion_v43');
mkdirSync(out,{recursive:true});

async function inspect(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json&review_reload=ear_blink_review';
  const response=await fetch('http://127.0.0.1:9337/json/new?'+
    encodeURIComponent(url),{method:'PUT'});
  assert.ok(response.ok,'Chrome debugging endpoint must be available');
  const page=await response.json(),socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{socket.onopen=ok;socket.onerror=bad});
  let id=0;
  const pending=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(!waiter)return;
    pending.delete(message.id);
    if(message.error||message.result?.exceptionDetails)
      waiter.reject(Error(message.error?.message||message.result.exceptionDetails.text));
    else waiter.resolve(message.result.result.value);
  };
  const evaluate=expression=>new Promise((ok,bad)=>{
    const key=++id;pending.set(key,{resolve:ok,reject:bad});
    socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',
      params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  try{
    await evaluate(`new Promise((ok,bad)=>{const t=Date.now(),i=setInterval(()=>{
      if(window.__miffyMotion?.loaded){clearInterval(i);ok(true)}
      else if(document.querySelector('#error')?.textContent||Date.now()-t>30000){
        clearInterval(i);bad(Error(document.querySelector('#error')?.textContent||'timeout'))}
    },100)})`);
    return await evaluate(`(async()=>{
      const $=id=>document.getElementById(id),stage=$('stage');
      $('neutral').click();
      const frames=[];
      for(const blink of [0,50,100]){
        $('blink').value=blink;
        $('blink').dispatchEvent(new Event('input',{bubbles:true}));
        const pixels=stage.getContext('2d').getImageData(574,90,9,35).data;
        const root=stage.getContext('2d').getImageData(583,114,6,11).data;
        const crop=document.createElement('canvas');
        crop.width=145;crop.height=100;
        crop.getContext('2d').drawImage(stage,550,60,145,100,0,0,145,100);
        frames.push({blink,ear:[...pixels],root:[...root],
          crop:crop.toDataURL('image/png').split(',')[1]});
      }
      const poses=[];
      for(const yaw of [-50,50]){
        $('yaw').value=yaw;
        $('yaw').dispatchEvent(new Event('input',{bubbles:true}));
        $('blink').value=50;
        $('blink').dispatchEvent(new Event('input',{bubbles:true}));
        const crop=document.createElement('canvas');
        crop.width=145;crop.height=100;
        crop.getContext('2d').drawImage(stage,550,60,145,100,0,0,145,100);
        poses.push({yaw,crop:crop.toDataURL('image/png').split(',')[1]});
      }
      $('yaw').value=0;$('yaw').dispatchEvent(new Event('input',{bubbles:true}));
      $('blink').value=0;$('blink').dispatchEvent(new Event('input',{bubbles:true}));
      const pixels=stage.getContext('2d').getImageData(0,0,1280,1280).data;
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))]
        .map(x=>x.toString(16).padStart(2,'0')).join('');
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,
        blinkMode:window.__miffyMotion.rig?.eyeRig?.blinkMode||null,
        neutralHash:hash,frames,poses};
    })()`);
  }finally{
    socket.close();
    await fetch('http://127.0.0.1:9337/json/close/'+page.id);
  }
}

const prior=await inspect('motion_v40'),next=await inspect('motion_v43');
assert.equal(prior.neutralMatches,true);
assert.equal(next.neutralMatches,true);
assert.equal(prior.neutralHash,next.neutralHash,'neutral face must remain unchanged');
const changed=(a,b)=>a.reduce((total,value,i)=>total+(value!==b[i]),0);
const counts=Object.fromEntries([50,100].map((blink,i)=>[blink,{
  prior:changed(prior.frames[0].ear,prior.frames[i+1].ear),
  next:changed(next.frames[0].ear,next.frames[i+1].ear),
  lowerRootPrior:changed(prior.frames[0].root,prior.frames[i+1].root),
  lowerRootNext:changed(next.frames[0].root,next.frames[i+1].root)}]));
assert.ok(counts[50].prior>0,'the prior candidate must reproduce the ear flash');
assert.equal(counts[50].next,0,'the ear must not flicker during half blink');
assert.equal(counts[100].next,0,'the ear must not flicker at full closure');
assert.equal(counts[50].lowerRootNext,0,'the lower ear root must not flicker during half blink');
assert.equal(counts[100].lowerRootNext,0,'the lower ear root must not flicker at full closure');
for(const result of [prior,next])for(const frame of result.frames)
  writeFileSync(resolve(out,`${result.candidate}_blink_${frame.blink}.png`),
    Buffer.from(frame.crop,'base64'));
for(const result of [prior,next])for(const pose of result.poses)
  writeFileSync(resolve(out,`${result.candidate}_yaw_${pose.yaw}_blink_50.png`),
    Buffer.from(pose.crop,'base64'));
const report={neutralIdentical:true,earChangedChannels:counts,
  screenshots:['motion_v40','motion_v43'].flatMap(candidate=>
    [...[0,50,100].map(blink=>`${candidate}_blink_${blink}.png`),
      ...[-50,50].map(yaw=>`${candidate}_yaw_${yaw}_blink_50.png`)]),
  visualAcceptance:'pending user review'};
writeFileSync(resolve(out,'ear_blink_browser_report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
