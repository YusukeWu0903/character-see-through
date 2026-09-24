// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v7';
assert.ok(['motion_v7','motion_v9'].includes(candidate));
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
ws.onmessage=event=>{const data=JSON.parse(event.data);const waiter=pending.get(data.id);
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
      bustEnabled:!document.querySelector('#bust').disabled});}
    else if(document.querySelector('#error').textContent||Date.now()-start>30000){
      clearInterval(timer);reject(Error(document.querySelector('#error').textContent||'timeout'))}
  },100)})`);
assert.deepEqual(loaded,{candidate,neutralMatches:true,bustEnabled:true});
const moving=await evaluate(`new Promise(resolve=>{
  document.querySelector('#neutral').click();
  const canvas=document.querySelector('#stage');
  window.__bustBaseline=canvas.getContext('2d').getImageData(0,0,1280,1280).data;
  document.querySelector('#bust').value='100';
  document.querySelector('#auto').checked=true;
  document.querySelector('#paused').checked=false;
  setTimeout(()=>{
    const now=canvas.getContext('2d').getImageData(0,0,1280,1280).data;
    let inside=0,outside=0;
    for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
      const i=(y*1280+x)*4;
      if(now[i]===window.__bustBaseline[i]&&
         now[i+1]===window.__bustBaseline[i+1]&&
         now[i+2]===window.__bustBaseline[i+2]&&
         now[i+3]===window.__bustBaseline[i+3])continue;
      if(x>=520&&x<744&&y>=246&&y<438)inside++;else outside++;
    }
    resolve({amplitude:window.__miffyMotion.bust.amplitudePx,
    foot:window.__miffyMotion.currentPose.hipPx,
    readout:document.querySelector('#motion-readout').textContent,
    changedInside:inside,changedOutside:outside,image:canvas.toDataURL()});
  },1800);
})`);
assert.ok(Math.abs(moving.amplitude)>.02,'bust motion must be visible in native pixels');
assert.ok(moving.changedInside>100,'chest area must visibly change');
assert.equal(moving.changedOutside,0,'shoulders, straps and feet outside field must stay unchanged');
writeFileSync(resolve(output,'preview_bust.png'),
  Buffer.from(moving.image.split(',')[1],'base64'));
delete moving.image;
const frozen=await evaluate(`new Promise(resolve=>{
  document.querySelector('#paused').checked=true;
  const first=window.__miffyMotion.bust.amplitudePx;
  setTimeout(()=>resolve({first,last:window.__miffyMotion.bust.amplitudePx}),300);
})`);
assert.equal(frozen.first,frozen.last,'pause must freeze the chest response');
const reset=await evaluate(`(()=>{document.querySelector('#neutral').click();return {
  amplitude:window.__miffyMotion.bust.amplitudePx,
  strength:document.querySelector('#bust').value,
  neutral:window.__miffyMotion.neutralMatches}})()`);
assert.deepEqual(reset,{amplitude:0,strength:'0',neutral:true});
console.log(JSON.stringify({loaded,moving,frozen,reset,artisticReview:'pending'},null,2));
ws.close();
