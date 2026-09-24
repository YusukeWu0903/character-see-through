// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v8';
assert.ok(['motion_v8','motion_v9','motion_v10','motion_v11','motion_v12','motion_v13','motion_v14','motion_v16','motion_v17','motion_v18','motion_v19'].includes(candidate));
const output=resolve('outputs/seethrough_local',task,'_review',candidate);
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/'+candidate+'/rig.json';
const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),
  {method:'PUT'});
assert.ok(response.ok);
const page=await response.json();
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let id=0;const pending=new Map();
ws.onmessage=event=>{const data=JSON.parse(event.data),waiter=pending.get(data.id);
  if(!waiter)return;pending.delete(data.id);
  if(data.error)waiter.reject(Error(data.error.message));else waiter.resolve(data.result)};
function evaluate(expression){return new Promise((resolve,reject)=>{
  const key=++id;pending.set(key,{resolve,reject});
  ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',
    params:{expression,awaitPromise:true,returnByValue:true}}));
}).then(result=>{if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value})}
const loaded=await evaluate(`new Promise((resolve,reject)=>{
  const start=Date.now();const timer=setInterval(()=>{
    if(window.__miffyMotion?.loaded){clearInterval(timer);resolve({
      candidate:window.__miffyMotion.candidate,
      neutralMatches:window.__miffyMotion.neutralMatches,
      blinkEnabled:!document.querySelector('#blink').disabled,
      gazeEnabled:!document.querySelector('#gaze-x').disabled,
      bustEnabled:!document.querySelector('#bust').disabled});}
    else if(document.querySelector('#error').textContent||Date.now()-start>30000){
      clearInterval(timer);reject(Error(document.querySelector('#error').textContent||'timeout'))}
  },100)})`);
assert.deepEqual(loaded,{candidate,neutralMatches:true,
  blinkEnabled:true,gazeEnabled:true,bustEnabled:true});
function save(name,data){writeFileSync(resolve(output,name),
  Buffer.from(data.split(',')[1],'base64'))}
const neutral=await evaluate(`(()=>{
  document.querySelector('#neutral').click();return {
    eye:window.__miffyMotion.eye,
    image:document.querySelector('#stage').toDataURL()}})()`);
save('preview_neutral.png',neutral.image);
if(['motion_v13','motion_v14','motion_v16','motion_v17','motion_v18','motion_v19'].includes(candidate)){
  const tiny=await evaluate(`(()=>{
    const input=document.querySelector('#gaze-x');input.value='1';
    input.dispatchEvent(new Event('input'));
    return document.querySelector('#stage').toDataURL()})()`);
  save('preview_tiny_gaze.png',tiny);
  await evaluate(`document.querySelector('#neutral').click()`);
}
const blink=await evaluate(`(()=>{
  const input=document.querySelector('#blink');input.value='100';
  input.dispatchEvent(new Event('input'));return {
    eye:window.__miffyMotion.eye,
    image:document.querySelector('#stage').toDataURL()}})()`);
assert.equal(blink.eye.blink,1);
assert.notEqual(blink.image,neutral.image);
save('preview_blink.png',blink.image);
const half=await evaluate(`(()=>{
  const input=document.querySelector('#blink');input.value='50';
  input.dispatchEvent(new Event('input'));return {
    eye:window.__miffyMotion.eye,
    image:document.querySelector('#stage').toDataURL()}})()`);
assert.equal(half.eye.blink,.5);
save('preview_half_blink.png',half.image);
const gaze=await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  const input=document.querySelector('#gaze-x');input.value='100';
  input.dispatchEvent(new Event('input'));return {
    eye:window.__miffyMotion.eye,
    image:document.querySelector('#stage').toDataURL()}})()`);
assert.equal(gaze.eye.gazeX,2);
assert.notEqual(gaze.image,neutral.image);
save('preview_gaze_right.png',gaze.image);
const diagonal=await evaluate(`(()=>{
  document.querySelector('#gaze-x').value='-100';
  document.querySelector('#gaze-x').dispatchEvent(new Event('input'));
  document.querySelector('#gaze-y').value='-100';
  document.querySelector('#gaze-y').dispatchEvent(new Event('input'));
  return {eye:window.__miffyMotion.eye,
    image:document.querySelector('#stage').toDataURL()}})()`);
if(['motion_v14','motion_v16','motion_v17','motion_v18','motion_v19'].includes(candidate)){
  assert.ok(Math.abs(diagonal.eye.gazeX+Math.SQRT2)<1e-6);
  assert.ok(Math.abs(diagonal.eye.gazeY+1/Math.SQRT2)<1e-6);
}else{
  assert.equal(diagonal.eye.gazeX,-2);
  assert.equal(diagonal.eye.gazeY,['motion_v12','motion_v13'].includes(candidate)?-1:-1.5);
}
save('preview_gaze_upper_left.png',diagonal.image);
if(['motion_v14','motion_v16','motion_v17','motion_v18','motion_v19'].includes(candidate)){
  for(const y of [-100,0,100])for(const x of [-100,0,100]){
    const frame=await evaluate(`(()=>{
      document.querySelector('#neutral').click();
      for(const [id,value] of [['gaze-x',${x}],['gaze-y',${y}]]){
        const input=document.getElementById(id);input.value=String(value);
        input.dispatchEvent(new Event('input'));
      }
      return document.querySelector('#stage').toDataURL()})()`);
    save(`preview_gaze_grid_${x}_${y}.png`,frame);
  }
}
const follow=await evaluate(`new Promise(resolve=>{
  document.querySelector('#neutral').click();
  document.querySelector('#gaze-follow').checked=true;
  document.querySelector('#paused').checked=false;
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.right-2,clientY:rect.top+rect.height/2}));
  setTimeout(()=>resolve({eye:window.__miffyMotion.eye,
    image:canvas.toDataURL()}),700);
})`);
assert.ok(follow.eye.gazeX>1);
save('preview_gaze_follow.png',follow.image);
const reverse=await evaluate(`new Promise(resolve=>{
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.left+2,clientY:rect.top+rect.height/2}));
  setTimeout(()=>resolve(window.__miffyMotion.eye),700);
})`);
assert.ok(reverse.gazeX< -1,'eye follow must reverse toward cursor left');
const automatic=await evaluate(`new Promise(resolve=>{
  document.querySelector('#neutral').click();
  document.querySelector('#auto-blink').checked=true;
  document.querySelector('#paused').checked=false;
  let peak=0;const timer=setInterval(()=>{
    peak=Math.max(peak,window.__miffyMotion.eye?.blink||0);
  },20);
  setTimeout(()=>{clearInterval(timer);resolve({peak})},5300);
})`);
assert.ok(automatic.peak>.8,'auto blink must produce a full closure');
const playback=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  const began=performance.now(),frames=window.__miffyMotion.drawCount;
  setTimeout(()=>resolve({seconds:(performance.now()-began)/1000,
    frames:window.__miffyMotion.drawCount-frames}),2200);
})`);
assert.ok(playback.frames>=12,'combined motion preview must keep drawing');
console.log(JSON.stringify({loaded,neutral:neutral.eye,blink:blink.eye,
  half:half.eye,gaze:gaze.eye,diagonal:diagonal.eye,
  follow:follow.eye,reverse,automatic,playback,
  artisticReview:'pending'},null,2));
ws.close();
