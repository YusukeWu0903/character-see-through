// Browser behavior check for non-production Miffy v5 pointer follow.
// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v5');
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+
  task+'&rig=_review/motion_v5/rig.json';
const target=await fetch('http://127.0.0.1:9337/json/new?'+
  encodeURIComponent(url),{method:'PUT'});
if(!target.ok)throw Error('Cannot open Chrome test tab');
const page=await target.json();
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
let nextId=1;
const pending=new Map();
ws.onmessage=event=>{
  const data=JSON.parse(event.data);
  if(!data.id||!pending.has(data.id))return;
  const {ok,fail}=pending.get(data.id);pending.delete(data.id);
  if(data.error)fail(Error(data.error.message));else ok(data.result);
};
function command(method,params={}){
  const id=nextId++;
  return new Promise((ok,fail)=>{
    pending.set(id,{ok,fail});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',
    {expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const state=await evaluate(`new Promise((resolve,reject)=>{
  const began=Date.now();
  const timer=setInterval(()=>{
    if(window.__miffyMotion?.loaded){
      clearInterval(timer);
      resolve({candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches});
    }else if(document.querySelector('#error').textContent||Date.now()-began>30000){
      clearInterval(timer);
      reject(Error(document.querySelector('#error').textContent||'load timeout'));
    }
  },100);
})`);
assert.deepEqual(state,{candidate:'motion_v5',neutralMatches:true});
const immediate=await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  document.querySelector('#paused').checked=false;
  document.querySelector('#follow').checked=true;
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  const before=canvas.toDataURL();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.right-2,clientY:rect.top+20}));
  return {sameFrame:before===canvas.toDataURL(),
    samePose:window.__miffyMotion.currentPose.body===0};
})()`);
assert.deepEqual(immediate,{sameFrame:true,samePose:true},
  'pointer event must not directly redraw the deforming canvas');
const early=await evaluate(`new Promise(resolve=>setTimeout(()=>{
  resolve({pointer:window.__miffyMotion.pointer,
    pose:window.__miffyMotion.currentPose});
},90))`);
assert.ok(early.pointer.desired>.9);
assert.ok(early.pointer.eased>0&&early.pointer.eased<.8);
assert.ok(early.pointer.mix>0&&early.pointer.mix<.8);
const settled=await evaluate(`new Promise(resolve=>setTimeout(()=>{
  resolve({pointer:window.__miffyMotion.pointer,
    pose:window.__miffyMotion.currentPose});
},600))`);
assert.ok(settled.pointer.eased>early.pointer.eased);
assert.ok(settled.pointer.mix>early.pointer.mix);
assert.ok(settled.pointer.eased>.9);
const screenshot=await command('Page.captureScreenshot',{format:'png'});
writeFileSync(resolve(output,'panel_follow.png'),
  Buffer.from(screenshot.data,'base64'));
const paused=await evaluate(`new Promise(resolve=>{
  const canvas=document.querySelector('#stage');
  document.querySelector('#paused').checked=true;
  const first=canvas.toDataURL(),rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.left+2,clientY:rect.top+20}));
  setTimeout(()=>resolve({unchanged:first===canvas.toDataURL(),
    pointer:window.__miffyMotion.pointer}),250);
})`);
assert.equal(paused.unchanged,true,'pause must freeze the image under pointer motion');
const resumed=await evaluate(`new Promise(resolve=>{
  document.querySelector('#paused').checked=false;
  setTimeout(()=>resolve(window.__miffyMotion.pointer),600);
})`);
assert.ok(resumed.eased<-.8,'pointer must ease toward the opposite side');
const additive=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  document.querySelector('#follow').checked=false;
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.right-2,clientY:rect.top+20}));
  setTimeout(()=>{
    const idleOnly=window.__miffyMotion.currentPose;
    document.querySelector('#follow').checked=true;
    setTimeout(()=>{
      const both=window.__miffyMotion.currentPose;
      const pointer=window.__miffyMotion.pointer;
      const phase=both.time*.82,strength=.8,mouse=pointer.eased*pointer.mix;
      resolve({idleOnly,both,pointer,
        expectedBody:.82*strength*Math.sin(phase)-.18*mouse,
        expectedTorso:-.42*strength*Math.sin(phase-.24)-.22*mouse,
        expectedHead:-.22*strength*Math.sin(phase-.52)-.18*mouse});
    },550);
  },350);
})`);
assert.ok(additive.idleOnly.time>0,'idle-only mode must still animate');
assert.ok(additive.pointer.mix>.8,'follow must fade in without disabling idle');
assert.ok(Math.abs(additive.both.body-additive.expectedBody)<.001);
assert.ok(Math.abs(additive.both.torso-additive.expectedTorso)<.001);
assert.ok(Math.abs(additive.both.head-additive.expectedHead)<.001);
const bothShot=await command('Page.captureScreenshot',{format:'png'});
writeFileSync(resolve(output,'panel_idle_and_follow.png'),
  Buffer.from(bothShot.data,'base64'));
const leaving=await evaluate(`new Promise(resolve=>{
  const canvas=document.querySelector('#stage'),before=canvas.toDataURL();
  canvas.dispatchEvent(new PointerEvent('pointerleave'));
  const immediate=before===canvas.toDataURL();
  setTimeout(()=>resolve({immediate,pointer:window.__miffyMotion.pointer}),600);
})`);
assert.equal(leaving.immediate,true);
assert.ok(Math.abs(leaving.pointer.eased)<.1,'pointer leave must ease back to neutral');
const followOff=await evaluate(`new Promise(resolve=>{
  document.querySelector('#follow').checked=false;
  const before=window.__miffyMotion.currentPose.time;
  setTimeout(()=>resolve({before,after:window.__miffyMotion.currentPose.time,
    pointer:window.__miffyMotion.pointer}),550);
})`);
assert.ok(followOff.pointer.mix<.1,'follow contribution must fade out');
assert.ok(followOff.after>followOff.before,'idle must continue after follow is disabled');
const feet=await evaluate(`(()=>{
  const canvas=document.querySelector('#stage');
  const image=canvas.getContext('2d').getImageData(0,1220,1280,44);
  const sum=[0,0],count=[0,0];
  for(let y=0;y<44;y++)for(let x=0;x<1280;x++){
    if(image.data[(y*1280+x)*4+3]>200){
      const side=x<630?0:1;sum[side]+=x;count[side]++;
    }
  }
  return sum.map((value,side)=>value/count[side]);
})()`);
assert.ok(feet.every(Number.isFinite));
console.log(JSON.stringify({state,immediate,
  pointerAfter90ms:early.pointer,pointerSettled:settled.pointer,
  pausedStable:paused.unchanged,resumedPointer:resumed,
  idleAndFollowAdditive:true,pointerLeave:leaving.pointer,
  followOff:followOff.pointer,feetCenters:feet,
  visualAcceptance:'pending'},null,2));
ws.close();
