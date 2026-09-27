import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {advanceShoulderCompensation,initialShoulderCompensation,validateShoulderCompensation} from '../viewer/shoulder-compensation.mjs';
import {approachPointer} from '../viewer/pointer-follow.mjs';
import {shoulderPosePoint} from '../viewer/expression-pose.mjs';
import {stanceOffset} from '../viewer/stance-field.mjs';
const version=process.env.MIMI_REVIEW_VERSION||'v59';
const root='outputs/seethrough_local/Mimi_cloud_20260927/_review/',dest=root+'motion_'+version+'/';
const rig=JSON.parse(readFileSync(dest+'rig.json')),old=JSON.parse(readFileSync(root+'motion_v58/rig.json'));
for(const k of ['pointerFollow','grounding','bustField','assemblySha256'])assert.deepEqual(rig[k],old[k]);
const p=rig.shoulderCompensation;validateShoulderCompensation(p);
const numerical=[];let minJacobian=Infinity;
for(const sign of [-1,1]){
 const l=shoulderPosePoint(420,350,0,p.field,sign,-sign,p.maxPixels);
 const r=shoulderPosePoint(660,350,0,p.field,sign,-sign,p.maxPixels);
 assert(sign===-1?l[1]>350&&r[1]<350:l[1]<350&&r[1]>350);
 for(let y=0;y<=1280;y+=10)for(let x=300;x<=850;x+=10){
  const map=(xx,yy)=>{const [a,b]=shoulderPosePoint(xx,yy,0,p.field,sign,-sign,p.maxPixels);return[a+stanceOffset(b,{body:.75*sign,torso:.12*sign,head:-.03*sign},rig.grounding),b]};
  const c=map(x,y),a=map(x+.01,y),b=map(x,y+.01);
  const det=((a[0]-c[0])*(b[1]-c[1])-(a[1]-c[1])*(b[0]-c[0]))/.0001;
  minJacobian=Math.min(minJacobian,det);assert(det>.85);
  if(y>=590)assert.equal(c[1],y);
 }
 for(const fps of [30,60,120]){
  let s=initialShoulderCompensation(),m=0;
  for(let i=0;i<fps*3;i++){m=approachPointer(m,sign,1/fps,7);s=advanceShoulderCompensation(s,m,1/fps,p)}
  let rebound=0;
  for(let i=0;i<fps*4;i++){m=approachPointer(m,0,1/fps,7);s=advanceShoulderCompensation(s,m,1/fps,p);rebound=Math.max(rebound,-sign*s.position)}
  assert(rebound>.05&&rebound<.25);assert(Math.abs(s.position)<.001);
  numerical.push({fps,sign,rebound,settled:s});
 }
}
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_'+version+'/rig.json&review_reload='+Date.now();
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
ws.send(JSON.stringify({id:99999,method:'Page.bringToFront'}));
let id=0;const q=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data),p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
const delay=ms=>ev(`new Promise(r=>setTimeout(()=>r(true),${ms}))`);
const state=()=>ev(`(()=>{__miffyMotion.redraw();return {bank:__miffyMotion.shoulderCompensation,shoulders:__miffyMotion.shoulders,body:__miffyMotion.coordinatedFollow,local:__miffyMotion.bust}})()`);
const move=x=>ev(`(()=>{const c=document.querySelector('#stage'),b=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*${x},clientY:b.top+b.height*.4}));return true})()`);
const save=(name,s)=>writeFileSync(dest+name+'.png',Buffer.from(s.split(',')[1],'base64'));
const image=async name=>save(name,await ev(`(()=>{__miffyMotion.redraw();return document.querySelector('#stage').toDataURL()})()`));
try{
 await ev(`new Promise((r,j)=>{const t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);r(true)}else if(document.querySelector('#error').textContent){clearInterval(t);j(Error(document.querySelector('#error').textContent))}},100)})`);
 const neutral=await ev(`(()=>{document.querySelector('#neutral').click();return __miffyMotion.neutralMatches})()`);assert(neutral);await image('shoulder_neutral');
 const guide=await ev(`(()=>{const c=document.querySelector('#stage'),a=c.toDataURL();document.querySelector('#show-shoulder-field').click();const image=c.toDataURL();document.querySelector('#show-shoulder-field').click();return {image,restored:a===c.toDataURL()}})()`);assert(guide.restored);save('shoulder_guide',guide.image);
 await ev(`(()=>{document.querySelector('#hair').value=0;document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;return true})()`);
 const samples=[];
 for(const [side,x,sign]of [['left',.02,-1],['right',.98,1]]){
  await move(x);await delay(3000);const held=await state();samples.push({side,held});assert(sign*held.bank.position>.99);await image('shoulder_'+side);
  await move(610/1280);
  const trace=await ev(`new Promise(r=>{const list=[];let peak=0,image=null;const start=performance.now(),timer=setInterval(()=>{__miffyMotion.redraw();const s=__miffyMotion.shoulderCompensation;list.push({time:(performance.now()-start)/1000,...s});if((-(${sign}))*s.position>peak){peak=(-(${sign}))*s.position;image=document.querySelector('#stage').toDataURL()}if(performance.now()-start>3500){clearInterval(timer);r({list,peak,image})}},30)})`);
  writeFileSync(dest+'return_trace_'+side+'.json',JSON.stringify({peak:trace.peak,list:trace.list},null,2));
  console.log('Return peak',side,trace.peak);
  assert(trace.peak>.04&&trace.peak<.3);save('shoulder_return_'+side,trace.image);delete trace.image;samples.push({side,return:trace});
 }
 await move(.02);await delay(500);await move(.98);await delay(150);const reversal=await state();samples.push({reversal});await image('shoulder_reversal');
 await ev(`(()=>{document.querySelector('#paused').checked=true;return true})()`);const paused=await state();await delay(400);assert.deepEqual((await state()).bank,paused.bank);
 await ev(`(()=>{document.querySelector('#paused').checked=false;document.querySelector('#stage').dispatchEvent(new PointerEvent('pointerleave'));return true})()`);await delay(4000);const leave=await state();assert(Math.abs(leave.bank.position)<.001);
 await move(.02);await delay(1500);await ev(`(()=>{document.querySelector('#follow').checked=false;return true})()`);await delay(4000);const off=await state();assert(Math.abs(off.bank.position)<.001);
 await ev(`(()=>{document.querySelector('#defaults').click();return true})()`);await move(.98);await delay(1500);samples.push({idleFollow:await state()});await image('shoulder_idle_follow');
 await ev(`(()=>{document.querySelector('#neutral').click();return true})()`);const reset=await state();assert.equal(reset.bank.position,0);assert.equal(reset.bank.velocity,0);
 const result={neutral,guideRestored:guide.restored,minJacobian,numerical,samples,paused,leave,off,reset,visualAcceptance:'pending'};
 writeFileSync(dest+'shoulder_qa.json',JSON.stringify(result,null,2));console.log('PASS shoulder compensation',minJacobian,samples.filter(s=>s.return).map(s=>({side:s.side,peak:s.return.peak})));
}finally{ws.close()}
