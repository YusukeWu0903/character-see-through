import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v40');
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/motion_v40/rig.json&review_reload=v40_arm_sway_r2';
const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'});
assert.ok(response.ok,'browser test tab must open');
const page=await response.json();
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
let id=0;const pending=new Map();
ws.onmessage=event=>{
  const data=JSON.parse(event.data),waiter=pending.get(data.id);
  if(!waiter)return;
  pending.delete(data.id);
  if(data.error||data.result?.exceptionDetails)
    waiter.fail(Error(data.error?.message||data.result.exceptionDetails.text));
  else waiter.ok(data.result);
};
const command=(method,params={})=>new Promise((ok,fail)=>{
  const key=++id;pending.set(key,{ok,fail});
  ws.send(JSON.stringify({id:key,method,params}));
});
const evaluate=async expression=>(await command('Runtime.evaluate',
  {expression,awaitPromise:true,returnByValue:true})).result.value;

const loaded=await evaluate(`new Promise((resolve,reject)=>{
  const start=Date.now();const timer=setInterval(()=>{
    if(window.__miffyMotion?.loaded){clearInterval(timer);resolve({
      candidate:window.__miffyMotion.candidate,
      neutralMatches:window.__miffyMotion.neutralMatches,
      panelGroups:document.querySelectorAll('details.control-group').length,
      armEnabled:!document.querySelector('#arm-sway').disabled,
      guideDefaultOff:!document.querySelector('#show-arm-field').checked,
      error:document.querySelector('#error').textContent});}
    else if(Date.now()-start>30000){clearInterval(timer);reject(Error(
      document.querySelector('#error').textContent||'load timeout'));}
  },100);
})`);
assert.equal(loaded.candidate,'motion_v40');
assert.equal(loaded.neutralMatches,true);
assert.equal(loaded.error,'');
assert.ok(loaded.panelGroups>=3&&loaded.armEnabled&&loaded.guideDefaultOff);
await command('Page.bringToFront');
const panel=await command('Page.captureScreenshot',{format:'png'});
writeFileSync(resolve(output,'panel.png'),Buffer.from(panel.data,'base64'));

const frames=[];
for(const value of [0,100,-100]){
  const state=await evaluate(`(()=>{
    document.querySelector('#neutral').click();
    const slider=document.querySelector('#arm-sway');slider.value='${value}';
    slider.dispatchEvent(new Event('input'));
    const canvas=document.querySelector('#stage');
    const pose=window.__miffyMotion.currentPose;
    return {png:canvas.toDataURL(),left:pose.leftWristPx,right:pose.rightWristPx,
      shoulder:Array.from(canvas.getContext('2d').getImageData(430,226,390,8).data),
      feet:Array.from(canvas.getContext('2d').getImageData(560,1210,140,60).data)};
  })()`);
  writeFileSync(resolve(output,`arm_${value}.png`),
    Buffer.from(state.png.split(',')[1],'base64'));
  frames.push({...state,png:undefined});
}
assert.equal(frames[0].left,0);assert.equal(frames[0].right,0);
assert.ok(frames[1].left>6&&frames[1].right>5);
assert.ok(frames[2].left< -6&&frames[2].right< -5);
assert.deepEqual(frames[1].shoulder,frames[0].shoulder);
assert.deepEqual(frames[2].shoulder,frames[0].shoulder);
assert.deepEqual(frames[1].feet,frames[0].feet);
assert.deepEqual(frames[2].feet,frames[0].feet);
const guide=await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  const slider=document.querySelector('#arm-sway');slider.value='100';
  slider.dispatchEvent(new Event('input'));
  const canvas=document.querySelector('#stage');
  const before=canvas.toDataURL();
  const box=document.querySelector('#show-arm-field');
  box.checked=true;box.dispatchEvent(new Event('change'));
  const during=canvas.toDataURL();
  box.checked=false;box.dispatchEvent(new Event('change'));
  return {changed:during!==before,restored:canvas.toDataURL()===before,
    png:during};
})()`);
assert.ok(guide.changed&&guide.restored);
writeFileSync(resolve(output,'arm_guide.png'),
  Buffer.from(guide.png.split(',')[1],'base64'));
const idle=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  document.querySelector('#follow').checked=false;
  let min=Infinity,max=-Infinity;
  const start=performance.now();
  const timer=setInterval(()=>{
    const value=window.__miffyMotion.currentPose?.leftWristPx;
    if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
    if(performance.now()-start>2300){clearInterval(timer);resolve({min,max,span:max-min});}
  },90);
})`);
assert.ok(idle.span>3,'default idle arm motion should be visible');
console.log(JSON.stringify({loaded,wristOffsets:frames.map(x=>
  ({left:x.left,right:x.right})),guide:{changed:guide.changed,
    restored:guide.restored},idle},null,2));
ws.close();
