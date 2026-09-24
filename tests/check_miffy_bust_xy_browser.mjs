// Requires the local viewer on :8014 and Chrome CDP on :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v18';
assert.ok(['motion_v18','motion_v19','motion_v20','motion_v21'].includes(candidate));
const maxPixels=candidate==='motion_v18'?10:15;
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
const lowerBoundary=candidate!=='motion_v18'?await evaluate(`(async()=>{
  const {drawBustFieldGuide}=await import('/viewer-assets/bust-field.mjs');
  const source=new Image();
  source.src='/layers/seethrough_local/${task}/_review/seam_v1/topwear.png';
  await source.decode();
  const boundary=async candidate=>{
    const response=await fetch('/layers/seethrough_local/${task}/_review/'+
      candidate+'/rig.json');
    const field=await response.json();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1280;
    drawBustFieldGuide(canvas,source,field.bustField);
    const data=canvas.getContext('2d').getImageData(0,0,1280,1280).data;
    let top=Infinity,bottom=-Infinity;
    for(let y=250;y<430;y++)for(let x=560;x<705;x++){
      const i=(y*1280+x)*4;
      if(data[i]>150&&data[i+1]>100&&data[i+2]<160&&data[i+3]>30){
        top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
    }
    return {top,bottom};
  };
  return {old:await boundary('motion_v18'),new:await boundary('motion_v19')};
})()`):null;
if(lowerBoundary){
  assert.ok(Math.abs(lowerBoundary.new.top-lowerBoundary.old.top)<=2);
  assert.ok(lowerBoundary.old.bottom-lowerBoundary.new.bottom>=32&&
    lowerBoundary.old.bottom-lowerBoundary.new.bottom<=40,
  'visible yellow lower line should rise by about three 12px grid cells');
}
const guide=await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  const canvas=document.querySelector('#stage'),g=canvas.getContext('2d');
  const toggle=document.querySelector('#show-bust-field');
  const defaultOff=!toggle.checked&&!toggle.disabled;
  const before=g.getImageData(0,0,1280,1280).data;
  toggle.checked=true;toggle.dispatchEvent(new Event('change'));
  const visible=toggle.checked&&!document.querySelector('#bust-field-note').hidden;
  const image=canvas.toDataURL(),after=g.getImageData(0,0,1280,1280).data;
  let inside=0,outside=0;
  for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
    const i=(y*1280+x)*4;
    if(before[i]===after[i]&&before[i+1]===after[i+1]&&
       before[i+2]===after[i+2]&&before[i+3]===after[i+3])continue;
    if(x>=510&&x<754&&y>=255&&y<425)inside++;
    else outside++;
  }
  toggle.checked=false;toggle.dispatchEvent(new Event('change'));
  const restored=canvas.toDataURL()===
    (()=>{const copy=document.createElement('canvas');copy.width=copy.height=1280;
      copy.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(before),1280,1280),0,0);
      return copy.toDataURL()})();
  return {defaultOff,visible,inside,outside,restored,image};
})()`);
assert.equal(guide.defaultOff,true);
assert.equal(guide.visible,true);
assert.ok(guide.inside>100);
assert.equal(guide.outside,0);
assert.equal(guide.restored,true);
save('preview_bust_xy_guide_neutral.png',guide.image);delete guide.image;
const idle=await evaluate(`new Promise(resolve=>{
  document.querySelector('#neutral').click();
  const strength=document.querySelector('#bust');strength.value='50';
  strength.dispatchEvent(new Event('input'));
  const energy=document.querySelector('#energy');energy.value='80';
  energy.dispatchEvent(new Event('input'));
  document.querySelector('#auto').checked=true;
  document.querySelector('#paused').checked=false;
  let minY=Infinity,maxY=-Infinity,maxAbsX=0;
  const started=performance.now(),timer=setInterval(()=>{
    const b=window.__miffyMotion.bust;
    minY=Math.min(minY,b.amplitudePx);maxY=Math.max(maxY,b.amplitudePx);
    maxAbsX=Math.max(maxAbsX,Math.abs(b.followPx));
    if(performance.now()-started>=9000){clearInterval(timer);
      resolve({verticalScreenRange:(maxY-minY)*.55,maxAbsX,
        frame:document.querySelector('#stage').toDataURL()})}
  },100);
})`);
assert.ok(idle.verticalScreenRange>=3,'idle-only vertical motion must be visible');
if(candidate!=='motion_v18')assert.ok(idle.verticalScreenRange>6.5&&
  idle.verticalScreenRange<8.5,'v19 idle wave should be about 1.5x v18');
assert.ok(idle.maxAbsX<.001,'idle-only motion must not drive horizontal breast follow');
save('preview_bust_xy_idle.png',idle.frame);delete idle.frame;
const right=await evaluate(`new Promise(resolve=>{
  document.querySelector('#neutral').click();
  const strength=document.querySelector('#bust');strength.value='50';
  strength.dispatchEvent(new Event('input'));
  document.querySelector('#follow').checked=true;
  document.querySelector('#paused').checked=false;
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.right-2,clientY:rect.top+rect.height/2}));
  setTimeout(()=>resolve({bust:window.__miffyMotion.bust,
    pointer:window.__miffyMotion.pointer,frame:canvas.toDataURL()}),2200);
})`);
assert.ok(right.bust.followPx>2.8,'cursor right must move chest right');
if(candidate!=='motion_v18')assert.ok(right.bust.followPx>5.5&&
  right.bust.followPx<7.5,'v19 lateral wave should be about 1.5x v18');
assert.ok(Math.abs(right.bust.amplitudePx)<.2,
  'follow-only must not create unrelated vertical bounce');
save('preview_bust_xy_right.png',right.frame);delete right.frame;
const left=await evaluate(`new Promise(resolve=>{
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.left+2,clientY:rect.top+rect.height/2}));
  setTimeout(()=>resolve({bust:window.__miffyMotion.bust,
    pointer:window.__miffyMotion.pointer,frame:canvas.toDataURL()}),2200);
})`);
assert.ok(left.bust.followPx< -2.8,'cursor left must move chest left');
assert.ok(Math.abs(left.bust.amplitudePx)<.2);
save('preview_bust_xy_left.png',left.frame);delete left.frame;
const both=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.right-2,clientY:rect.top+rect.height/2}));
  let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity;
  const started=performance.now(),draws=window.__miffyMotion.drawCount;
  const timer=setInterval(()=>{
    const b=window.__miffyMotion.bust;
    minY=Math.min(minY,b.amplitudePx);maxY=Math.max(maxY,b.amplitudePx);
    minX=Math.min(minX,b.followPx);maxX=Math.max(maxX,b.followPx);
    if(performance.now()-started>=9000){clearInterval(timer);
      resolve({verticalScreenRange:(maxY-minY)*.55,minX,maxX,
        frames:window.__miffyMotion.drawCount-draws,
        seconds:(performance.now()-started)/1000,
        frame:canvas.toDataURL()})}
  },100);
})`);
assert.ok(both.verticalScreenRange>=3,'combined mode must keep vertical sway');
assert.ok(both.maxX>2.8,'combined mode must keep pointer follow');
save('preview_bust_xy_both.png',both.frame);delete both.frame;
const movingGuide=await evaluate(`(()=>{
  const toggle=document.querySelector('#show-bust-field');
  toggle.checked=true;toggle.dispatchEvent(new Event('change'));
  const image=document.querySelector('#stage').toDataURL();
  toggle.checked=false;toggle.dispatchEvent(new Event('change'));
  return image;
})()`);
save('preview_bust_xy_guide_motion.png',movingGuide);
const extreme=await evaluate(`new Promise(resolve=>{
  const strength=document.querySelector('#bust');strength.value='100';
  strength.dispatchEvent(new Event('input'));
  const canvas=document.querySelector('#stage');
  let minY=Infinity,maxY=-Infinity,minFrame=null,maxFrame=null,maxAbsX=0;
  const started=performance.now(),timer=setInterval(()=>{
    const b=window.__miffyMotion.bust;
    if(b.amplitudePx<minY-.35){minY=b.amplitudePx;minFrame=canvas.toDataURL()}
    if(b.amplitudePx>maxY+.35){maxY=b.amplitudePx;maxFrame=canvas.toDataURL()}
    maxAbsX=Math.max(maxAbsX,Math.abs(b.followPx));
    if(performance.now()-started>=9000){clearInterval(timer);
      resolve({minY,maxY,maxAbsX,minFrame,maxFrame})}
  },100);
})`);
assert.ok(extreme.maxAbsX<=maxPixels+.001);
assert.ok(Math.max(Math.abs(extreme.minY),Math.abs(extreme.maxY))<=maxPixels+.001);
save('preview_bust_xy_100_min.png',extreme.minFrame);
save('preview_bust_xy_100_max.png',extreme.maxFrame);
delete extreme.minFrame;delete extreme.maxFrame;
const off=await evaluate(`new Promise(resolve=>{
  document.querySelector('#follow').checked=false;
  setTimeout(()=>resolve(window.__miffyMotion.bust),1800);
})`);
assert.ok(Math.abs(off.followPx)<.4,'pointer follow off must ease back to zero');
const paused=await evaluate(`new Promise(resolve=>{
  document.querySelector('#paused').checked=true;
  const first=window.__miffyMotion.bust;
  setTimeout(()=>resolve({first,last:window.__miffyMotion.bust}),350);
})`);
assert.deepEqual(paused.first,paused.last);
const field=await evaluate(`(async()=>{
  const {drawBustField}=await import('/viewer-assets/bust-field.mjs');
  const rig=await(await fetch('/layers/seethrough_local/${task}/_review/${candidate}/rig.json')).json();
  const source=new Image();source.src='/layers/seethrough_local/${task}/_review/seam_v1/topwear.png';
  await source.decode();
  const original=document.createElement('canvas'),warped=document.createElement('canvas');
  original.width=warped.width=1280;original.height=warped.height=1280;
  original.getContext('2d').drawImage(source,0,0);
  drawBustField(warped,source,{vertical:${maxPixels},horizontal:${maxPixels}},rig.bustField);
  const a=original.getContext('2d').getImageData(0,0,1280,1280).data;
  const b=warped.getContext('2d').getImageData(0,0,1280,1280).data;
  let inside=0,outside=0,alphaOutside=0;
  for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
    const i=(y*1280+x)*4;
    if(a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2]&&a[i+3]===b[i+3])continue;
    if(x>=514&&x<750&&y>=258&&
       y<rig.bustField.centerY+(rig.bustField.lowerRadiusY??rig.bustField.radiusY))inside++;
    else{outside++;if(a[i+3]!==b[i+3])alphaOutside++}
  }
  const mark=document.createElement('canvas');mark.width=mark.height=1280;
  const mg=mark.getContext('2d');mg.fillStyle='#f00';mg.fillRect(627,337,6,6);
  const sample=displacement=>{
    const dest=document.createElement('canvas');dest.width=dest.height=1280;
    drawBustField(dest,mark,{vertical:0,horizontal:displacement},rig.bustField);
    const data=dest.getContext('2d').getImageData(620,330,35,20).data;
    let weight=0,sum=0;
    for(let y=0;y<20;y++)for(let x=0;x<35;x++){
      const i=(y*35+x)*4,w=data[i+3]/255;
      weight+=w;sum+=(620+x)*w;
    }
    return sum/weight;
  };
  return {inside,outside,alphaOutside,
    leftX:sample(-7),neutralX:sample(0),rightX:sample(7)};
})()`);
assert.ok(field.inside>1000);
assert.equal(field.outside,0);
assert.equal(field.alphaOutside,0);
assert.ok(field.leftX<field.neutralX&&field.neutralX<field.rightX,
  'rendered breast field must move in screen-space pointer direction');
const reset=await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  return {bust:window.__miffyMotion.bust,
    strength:Number(document.querySelector('#bust').value)};
})()`);
assert.equal(reset.bust.amplitudePx,0);
assert.equal(reset.bust.followPx,0);
assert.equal(reset.strength,0);
console.log(JSON.stringify({candidate,lowerBoundary,guide,idle,right,left,both,
  extreme,off,paused,field,reset,
  artisticReview:'pending'},null,2));
ws.close();
