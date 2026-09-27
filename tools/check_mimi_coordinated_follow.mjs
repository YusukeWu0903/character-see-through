import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {advanceCoordinatedFollow,initialCoordinatedFollow} from '../viewer/coordinated-follow.mjs';
import {stanceOffset} from '../viewer/stance-field.mjs';
const version=process.env.MIMI_REVIEW_VERSION||'v57';
const root='outputs/seethrough_local/Mimi_cloud_20260927/_review/';
const dest=root+'motion_'+version+'/';
const rig=JSON.parse(readFileSync(dest+'rig.json'));
const old=JSON.parse(readFileSync(root+'motion_v56/rig.json'));
assert.deepEqual(rig.bustField,old.bustField);assert.deepEqual(rig.grounding,old.grounding);
for(const sign of [-1,1]){
 const profile=rig.pointerFollow.coordination||{mode:'soft-weight-follow',torsoRate:4.5,headRate:3.5,headGain:-.03};
 let s=initialCoordinatedFollow();
 s=advanceCoordinatedFollow(s,sign,1/60,profile);
 assert(Math.abs(s.head)<Math.abs(s.torso)&&Math.abs(s.torso)<1);
 for(let i=0;i<600;i++){
  s=advanceCoordinatedFollow(s,sign,1/60,profile);
  for(let y=0;y<=1280;y++){
   const dx=stanceOffset(y,{body:(profile.bodyGain??.18)*s.body,torso:(profile.torsoGain??.06)*s.torso,head:-.03*s.head},rig.grounding);
   const bound=version==='v58'?12:stanceOffset(y,{body:.18,torso:.06,head:.03},old.grounding);
   assert(Math.abs(dx)<=bound+1e-12);
   if(y>=1047)assert.equal(dx,0);
  }
 }
 if(version==='v58'){
  const c={body:.75*sign,torso:.12*sign,head:-.03*sign};
  assert(Math.abs(stanceOffset(590,c,rig.grounding)-12*sign)<1e-12);
  assert(Math.abs(stanceOffset(310,c,rig.grounding)-10.11*sign)<1e-12);
 }
 for(let i=0;i<600;i++)s=advanceCoordinatedFollow(s,0,1/60,profile);
 assert(Math.abs(s.torso)+Math.abs(s.head)<1e-8);
}
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_'+version+'/rig.json&review_reload='+Date.now();
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const q=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data),p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
const delay=ms=>ev(`new Promise(r=>setTimeout(()=>r(true),${ms}))`);
const state=()=>ev(`(()=>{__miffyMotion.redraw();return {p:__miffyMotion.pointer,c:__miffyMotion.coordinatedFollow,local:__miffyMotion.bust}})()`);
const move=x=>ev(`(()=>{const c=document.querySelector('#stage'),b=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*${x},clientY:b.top+b.height*.4}));return true})()`);
const image=async name=>{const s=await ev(`(()=>{__miffyMotion.redraw();return document.querySelector('#stage').toDataURL()})()`);writeFileSync(dest+name+'.png',Buffer.from(s.split(',')[1],'base64'))};
try{
 await ev(`new Promise((r,j)=>{const t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);r(true)}else if(document.querySelector('#error').textContent){clearInterval(t);j(Error(document.querySelector('#error').textContent))}},100)})`);
 const neutral=await ev(`(()=>{document.querySelector('#neutral').click();document.querySelector('#hair').value=0;document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;return __miffyMotion.neutralMatches})()`);assert(neutral);
 const samples=[];
 await move(.98);await delay(150);samples.push({phase:'right-transient',...await state()});
 await delay(2300);const right=await state();samples.push({phase:'right-held',...right});await image('body_right');
 assert(right.c.controls.body>0&&right.c.controls.torso>0);
 assert(version!=='v56'?right.c.controls.head<0:right.c.controls.head>0);
 await move(.02);await delay(120);samples.push({phase:'reversal',...await state()});await image('body_reversal');
 await delay(2400);const left=await state();samples.push({phase:'left-held',...left});await image('body_left');assert(left.c.controls.body<0);
 await move(610/1280);await delay(4000);const center=await state();samples.push({phase:'center',...center});assert(Math.abs(center.c.controls.body)<.001);await image('body_center');
 await move(.98);await delay(1700);
 await ev(`(()=>{document.querySelector('#stage').dispatchEvent(new PointerEvent('pointerleave'));return true})()`);await delay(4000);
 const leave=await state();samples.push({phase:'leave',...leave});assert(Math.abs(leave.c.controls.head)<.001);
 await move(.02);await delay(1700);
 await ev(`(()=>{document.querySelector('#follow').checked=false;return true})()`);await delay(4000);
 const off=await state();samples.push({phase:'follow-off',...off});assert(Math.abs(off.c.controls.torso)<.001);
 await ev(`(()=>{document.querySelector('#follow').checked=true;return true})()`);await delay(1700);
 await ev(`(()=>{document.querySelector('#paused').checked=true;return true})()`);const pause=await state();await delay(500);assert.deepEqual((await state()).c,pause.c);
 await ev(`(()=>{document.querySelector('#defaults').click();return true})()`);await move(.98);await delay(1200);samples.push({phase:'idle-plus-follow',...await state()});await image('body_idle_follow');
 await ev(`(()=>{document.querySelector('#neutral').click();return true})()`);const reset=await state();assert.equal(reset.c.controls.body,0);assert.equal(reset.c.torso,0);
 const guide=await ev(`(()=>{const c=document.querySelector('#stage'),a=c.toDataURL();document.querySelector('#show-guides').click();const g=c.toDataURL();document.querySelector('#show-guides').click();return {restored:a===c.toDataURL(),image:g}})()`);assert(guide.restored);writeFileSync(dest+'body_guide.png',Buffer.from(guide.image.split(',')[1],'base64'));
 const result={neutral,guideRestored:guide.restored,samples,pause,reset,numericalRangeAndContact:'pass',visualAcceptance:'pending'};
 writeFileSync(dest+'body_follow_qa.json',JSON.stringify(result,null,2));console.log('PASS browser follow checks',version,JSON.stringify(samples));
}finally{ws.close()}
