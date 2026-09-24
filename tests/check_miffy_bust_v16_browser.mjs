// Requires the local viewer on :8014 and Chrome CDP on :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v16';
assert.ok(['motion_v16','motion_v17'].includes(candidate));
const output=resolve('outputs/seethrough_local',task,'_review',candidate);
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/'+candidate+'/rig.json';
const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),
  {method:'PUT'});
assert.ok(response.ok);
const page=await response.json();
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let id=0;
const pending=new Map();
ws.onmessage=event=>{
  const data=JSON.parse(event.data),waiter=pending.get(data.id);
  if(!waiter)return;
  pending.delete(data.id);
  if(data.error)waiter.reject(Error(data.error.message));
  else waiter.resolve(data.result.result.value);
};
function evaluate(expression){
  return new Promise((resolve,reject)=>{
    const key=++id;
    pending.set(key,{resolve,reject});
    ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',
      params:{expression,awaitPromise:true,returnByValue:true}}));
  });
}
function save(name,data){
  writeFileSync(resolve(output,name),Buffer.from(data.split(',')[1],'base64'));
}
await evaluate(`new Promise((resolve,reject)=>{
  const start=Date.now(),timer=setInterval(()=>{
    if(window.__miffyMotion?.loaded){clearInterval(timer);resolve(true)}
    else if(document.querySelector('#error').textContent||Date.now()-start>30000){
      clearInterval(timer);reject(Error(document.querySelector('#error').textContent||'timeout'))}
  },100)})`);
const result=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  document.querySelector('#follow').checked=false;
  const canvas=document.querySelector('#stage');
  let min=Infinity,max=-Infinity,minImage=null,maxImage=null,count=0;
  const started=performance.now();
  const timer=setInterval(()=>{
    const a=window.__miffyMotion.bust.amplitudePx;
    count++;
    if(a<min-.35){min=a;minImage=canvas.toDataURL()}
    if(a>max+.35){max=a;maxImage=canvas.toDataURL()}
    if(performance.now()-started>=9000){
      clearInterval(timer);
      const zoom=Number(document.querySelector('#zoom').value)/100;
      resolve({strength:Number(document.querySelector('#bust').value),
        zoom,auto:document.querySelector('#auto').checked,
        min,max,screenRange:(max-min)*zoom,count,minImage,maxImage,
        noSmileControl:document.querySelector('#mouth-mode')===null});
    }
  },100);
})`);
assert.equal(result.strength,50);
assert.equal(result.zoom,.55);
assert.equal(result.auto,true);
assert.equal(result.noSmileControl,true);
assert.ok(result.screenRange>=3,
  'default chest motion must travel at least 3 CSS pixels peak-to-peak');
save('preview_bust_default_min.png',result.minImage);
save('preview_bust_default_max.png',result.maxImage);
delete result.minImage;
delete result.maxImage;
const strong=await evaluate(`new Promise(resolve=>{
  const input=document.querySelector('#bust');input.value='100';
  input.dispatchEvent(new Event('input'));
  const canvas=document.querySelector('#stage');
  let min=Infinity,max=-Infinity,minImage=null,maxImage=null;
  const started=performance.now();
  const timer=setInterval(()=>{
    const a=window.__miffyMotion.bust.amplitudePx;
    if(a<min-.4){min=a;minImage=canvas.toDataURL()}
    if(a>max+.4){max=a;maxImage=canvas.toDataURL()}
    if(performance.now()-started>=9000){
      clearInterval(timer);
      resolve({min,max,screenRange:(max-min)*.55,minImage,maxImage});
    }
  },100);
})`);
assert.ok(strong.screenRange>result.screenRange);
assert.ok(Math.max(Math.abs(strong.min),Math.abs(strong.max))<=10.001);
save('preview_bust_100_min.png',strong.minImage);
save('preview_bust_100_max.png',strong.maxImage);
delete strong.minImage;
delete strong.maxImage;
const localField=await evaluate(`(async()=>{
  const {drawBustField}=await import('/viewer-assets/bust-field.mjs');
  const rig=await(await fetch('/layers/seethrough_local/${task}/_review/${candidate}/rig.json')).json();
  const source=new Image();
  source.src='/layers/seethrough_local/${task}/_review/seam_v1/topwear.png';
  await source.decode();
  const original=document.createElement('canvas'),warped=document.createElement('canvas');
  original.width=warped.width=1280;original.height=warped.height=1280;
  original.getContext('2d').drawImage(source,0,0);
  drawBustField(warped,source,10,rig.bustField);
  const a=original.getContext('2d').getImageData(0,0,1280,1280).data;
  const b=warped.getContext('2d').getImageData(0,0,1280,1280).data;
  let inside=0,outside=0,alphaOutside=0;
  for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
    const i=(y*1280+x)*4;
    if(a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2]&&a[i+3]===b[i+3])continue;
    if(x>=512&&x<752&&y>=258&&y<423)inside++;
    else{outside++;if(a[i+3]!==b[i+3])alphaOutside++}
  }
  return {inside,outside,alphaOutside};
})()`);
assert.ok(localField.inside>1000);
assert.equal(localField.outside,0);
const paused=await evaluate(`new Promise(resolve=>{
  document.querySelector('#paused').checked=true;
  const first=window.__miffyMotion.bust.amplitudePx;
  setTimeout(()=>resolve({first,last:window.__miffyMotion.bust.amplitudePx}),350)
})`);
assert.equal(paused.first,paused.last);
const reset=await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  return {amplitude:window.__miffyMotion.bust.amplitudePx,
    strength:Number(document.querySelector('#bust').value)}
})()`);
assert.deepEqual(reset,{amplitude:0,strength:0});
console.log(JSON.stringify({candidate,defaultMotion:result,strongMotion:strong,
  localField,paused,reset,
  artisticReview:'pending'},null,2));
ws.close();
