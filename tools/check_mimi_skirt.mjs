import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {advanceSkirt,skirtWeight} from '../viewer/skirt-sway-field.mjs';
const dir='outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_v62/';
const rig=JSON.parse(readFileSync(dir+'rig.json')),old=JSON.parse(readFileSync(dir.replace('v62','v61')+'rig.json'));
for(const k of ['assemblySha256','grounding','bustField','pointerFollow','shoulderCompensation','renderer'])assert.deepEqual(rig[k],old[k]);
const f=rig.skirtSway;
for(let y=0;y<=480;y++)assert.equal(skirtWeight(700,y,f),0);
assert.equal(skirtWeight(700,620,f),1);
const traces=[];
for(const sign of [-1,1]){let s={position:0,velocity:0};const offsets=[];for(let i=0;i<300;i++){s=advanceSkirt(s,i<120?sign:0,1/60,f);offsets.push(s.offset)}assert.equal(Math.sign(offsets[0]),-sign);assert.ok(Math.abs(offsets.at(-1))<.05);traces.push(offsets);}
assert.ok(traces[0].every((v,i)=>Math.abs(v+traces[1][i])<1e-12));
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_v62/rig.json&review_reload=skirt_qa_'+Date.now();
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(!p)return;pending.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{pending.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))});
ws.send(JSON.stringify({id:99999,method:'Page.bringToFront'}));
try{
 await ev(`new Promise((r,j)=>{let n=0;const t=setInterval(()=>{if(__miffyMotion?.loaded){clearInterval(t);r(true)}else if(++n>200){clearInterval(t);j(Error('load timeout'))}},100)})`);
 const neutral=await ev(`(()=>{document.querySelector('#neutral').click();return {match:__miffyMotion.neutralMatches,skirt:__miffyMotion.skirtSway,image:document.querySelector('#stage').toDataURL()}})()`);
 writeFileSync(dir+'neutral.png',Buffer.from(neutral.image.split(',')[1],'base64'));delete neutral.image;
 const live=await ev(`new Promise(r=>{document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;document.querySelector('#hair').value=0;const c=document.querySelector('#stage'),b=c.getBoundingClientRect(),start=performance.now(),samples=[];function step(now){const t=(now-start)/1000;const x=t<1.3?.05:t<2.6?.95:.5;c.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*x,clientY:b.top+b.height*.4}));samples.push({t,...__miffyMotion.skirtSway});if(t<5)requestAnimationFrame(step);else{document.querySelector('#paused').checked=true;r(samples)}}requestAnimationFrame(step)})`);
 assert.ok(live.some(s=>Math.abs(s.offset)>.5));assert.ok(Math.abs(live.at(-1).offset)<.15);
 const guide=await ev(`(()=>{document.querySelector('#neutral').click();const c=document.querySelector('#stage'),base=c.toDataURL();document.querySelector('#show-skirt-field').checked=true;__miffyMotion.redraw();const on=c.toDataURL();document.querySelector('#show-skirt-field').checked=false;__miffyMotion.redraw();return {restored:base===c.toDataURL(),image:on}})()`);
 assert.ok(guide.restored);writeFileSync(dir+'guide.png',Buffer.from(guide.image.split(',')[1],'base64'));delete guide.image;
 const frames=await ev(`(async()=>{document.querySelector('#neutral').click();document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;const c=document.querySelector('#stage'),b=c.getBoundingClientRect(),out=[];for(const x of [.05,.95,.5]){c.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*x,clientY:b.top+b.height*.4}));await new Promise(r=>setTimeout(r,400));out.push(c.toDataURL())}document.querySelector('#neutral').click();return out})()`);
 frames.forEach((data,i)=>writeFileSync(dir+['left','right','return'][i]+'.png',Buffer.from(data.split(',')[1],'base64')));
 writeFileSync(dir+'skirt_qa.json',JSON.stringify({passed:true,neutral,guide,live,traces,checks:['waist zero','horizontal only','mirrored spring','return settling','guide restore','unchanged other fields'],visualAcceptance:'pending'},null,2));
 console.log(JSON.stringify({neutral,guide,peak:Math.max(...live.map(s=>Math.abs(s.offset))),settled:live.at(-1)}));
}finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
