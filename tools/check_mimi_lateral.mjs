import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const version=process.env.MIMI_REVIEW_VERSION||'v55',strength=Number(process.env.MIMI_REVIEW_STRENGTH||100);
assert.match(version,/^v[0-9]+$/);assert([50,100].includes(strength));
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_'+version+'/rig.json&review_reload='+Date.now();
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const q=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data),p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
const dest='outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_'+version+'/';
try{
 await ev(`new Promise((r,j)=>{const t=setInterval(()=>{if(__miffyMotion.loaded){clearInterval(t);r(true)}else if(document.querySelector('#error').textContent){clearInterval(t);j(Error(document.querySelector('#error').textContent))}},100)})`);
 const base=await ev(`(()=>{document.querySelector('#neutral').click();const c=document.querySelector('#stage');const a=c.toDataURL();document.querySelector('#show-bust-field').click();const guide=c.toDataURL();document.querySelector('#show-bust-field').click();return {neutral:__miffyMotion.neutralMatches,restored:a===c.toDataURL(),guide}})()`);
 assert(base.neutral&&base.restored);writeFileSync(dest+'guide.png',Buffer.from(base.guide.split(',')[1],'base64'));delete base.guide;
 const probes=[];
 for(const side of ['left','right']){
 const p=await ev(`new Promise(r=>{document.querySelector('#neutral').click();document.querySelector('#bust').value='${strength}';document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;const c=document.querySelector('#stage'),b=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointermove',{clientX:b.${side==='left'?'left+2':'right-2'},clientY:b.top+b.height*.4}));setTimeout(()=>{document.querySelector('#paused').checked=true;__miffyMotion.redraw();r({side:'${side}',...__miffyMotion.bust,image:c.toDataURL()})},2000)})`);
 assert.equal(p.amplitudePx,0);assert(side==='left'?p.followPx<0:p.followPx>0);writeFileSync(dest+'pointer_'+side+'.png',Buffer.from(p.image.split(',')[1],'base64'));delete p.image;probes.push(p);
 }
 const idle=await ev(`new Promise(r=>{document.querySelector('#defaults').click();document.querySelector('#follow').checked=false;let min=Infinity,max=-Infinity,vertical=0;const start=performance.now();const t=setInterval(()=>{min=Math.min(min,__miffyMotion.bust.followPx);max=Math.max(max,__miffyMotion.bust.followPx);vertical=Math.max(vertical,Math.abs(__miffyMotion.bust.amplitudePx));if(performance.now()-start>7000){clearInterval(t);document.querySelector('#neutral').click();r({min,max,vertical,reset:__miffyMotion.bust})}},100)})`);
 console.log({idle});assert(idle.max-idle.min>2);assert.equal(idle.vertical,0);assert.equal(idle.reset.followPx,0);
 const out={base,probes,idle,visualAcceptance:'pending'};writeFileSync(dest+'lateral_qa_'+strength+'.json',JSON.stringify(out,null,2));console.log(out);
}finally{ws.close()}
