import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const version=process.env.MIMI_REVIEW_VERSION||'v2';
assert.match(version,/^v[0-9]+$/);
const root=resolve('outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_'+version);
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_'+version+'/rig.json';
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
let id=0;const pending=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(!p)return;pending.delete(d.id);if(d.error||d.result?.exceptionDetails)p.reject(Error(JSON.stringify(d.error||d.result.exceptionDetails)));else p.resolve(d.result?.result?.value)};
function evaluate(expression){return new Promise((r,j)=>{const key=++id;pending.set(key,{resolve:r,reject:j});ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))})}
function save(name,data){writeFileSync(resolve(root,name),Buffer.from(data.split(',')[1],'base64'))}
try{
await new Promise(r=>setTimeout(r,1500));
await evaluate(`new Promise((r,j)=>{const start=Date.now(),t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);r(true)}else if(document.querySelector('#error').textContent||Date.now()-start>30000){clearInterval(t);j(Error(document.querySelector('#error').textContent||'timeout'))}},100)})`);
const initial=await evaluate(`(()=>{document.querySelector('#neutral').click();return {neutralMatches:__miffyMotion.neutralMatches,blinkDisabled:document.querySelector('#blink').disabled,autoBlinkDisabled:document.querySelector('#auto-blink').disabled,image:document.querySelector('#stage').toDataURL()}})()`);
assert.equal(initial.neutralMatches,true);assert.equal(initial.blinkDisabled,true);assert.equal(initial.autoBlinkDisabled,true);save('neutral.png',initial.image);delete initial.image;
const guide=await evaluate(`(()=>{const c=document.querySelector('#stage'),toggle=document.querySelector('#show-bust-field'),a=c.toDataURL();toggle.checked=true;toggle.dispatchEvent(new Event('change'));const image=c.toDataURL();toggle.checked=false;toggle.dispatchEvent(new Event('change'));return {restored:a===c.toDataURL(),visible:image!==a,image}})()`);
assert.equal(guide.restored,true);assert.equal(guide.visible,true);save('guide.png',guide.image);delete guide.image;
const field=await evaluate(`(async()=>{const {bustWeight}=await import('/viewer-assets/bust-field.mjs');const {stanceOffset}=await import('/viewer-assets/stance-field.mjs');const rig=await(await fetch('/layers/seethrough_local/Mimi_cloud_20260927/_review/motion_${version}/rig.json')).json();const f=rig.bustField;let minJacobian=Infinity;for(let y=360;y<=530;y+=2)for(let x=410;x<=625;x+=2){const dx=(bustWeight(x+.1,y,f)-bustWeight(x-.1,y,f))/.2,dy=(bustWeight(x,y+.1,f)-bustWeight(x,y-.1,f))/.2;for(const sx of [-12,12])for(const sy of [-12,12])minJacobian=Math.min(minJacobian,1+sx*dx+sy*dy)}return {minJacobian,feet:[1047,1100,1190,1251].map(y=>[-1,0,1].map(v=>stanceOffset(y,{body:v,torso:v,head:v},rig.grounding))),nativeTexture:rig.renderer.nativeTextureSize}})()`);
assert.ok(field.minJacobian>.3);assert.equal(field.nativeTexture,1280);assert.ok(field.feet.flat().every(x=>x===0));
const probe=async(side)=>evaluate(`new Promise(r=>{document.querySelector('#neutral').click();document.querySelector('#bust').value='100';document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;const c=document.querySelector('#stage'),rect=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.${side==='right'?'right-2':'left+2'},clientY:rect.top+rect.height*.4}));setTimeout(()=>{document.querySelector('#paused').checked=true;__miffyMotion.redraw();r({bust:__miffyMotion.bust,pose:__miffyMotion.currentPose,image:c.toDataURL()})},2000)})`);
const right=await probe('right');assert.ok(right.bust.followPx>5);assert.ok(Math.abs(right.bust.amplitudePx)<.01);save('pointer_right.png',right.image);delete right.image;
const left=await probe('left');assert.ok(left.bust.followPx<-5);save('pointer_left.png',left.image);delete left.image;
const leave=await evaluate(`new Promise(r=>{document.querySelector('#paused').checked=false;document.querySelector('#stage').dispatchEvent(new PointerEvent('pointerleave'));setTimeout(()=>r(__miffyMotion.bust),1800)})`);assert.ok(Math.abs(leave.followPx)<.2);
const playback=await evaluate(`new Promise(r=>{document.querySelector('#defaults').click();const c=document.querySelector('#stage'),rect=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.right-2,clientY:rect.top+rect.height*.4}));const start=performance.now(),draws=__miffyMotion.drawCount;let min=Infinity,max=-Infinity,minHead=Infinity,maxHead=-Infinity,minImage,maxImage;const t=setInterval(()=>{const b=__miffyMotion.bust.amplitudePx;if(b<min){min=b;minImage=c.toDataURL()}if(b>max){max=b;maxImage=c.toDataURL()}minHead=Math.min(minHead,__miffyMotion.currentPose.headPx);maxHead=Math.max(maxHead,__miffyMotion.currentPose.headPx);if(performance.now()-start>9000){clearInterval(t);r({min,max,minHead,maxHead,follow:__miffyMotion.bust.followPx,fps:(__miffyMotion.drawCount-draws)/((performance.now()-start)/1000),minImage,maxImage})}},120)})`);
assert.ok(playback.max-playback.min>5);assert.ok(playback.maxHead-playback.minHead>5);assert.ok(playback.follow>2);save('idle_min.png',playback.minImage);save('idle_max.png',playback.maxImage);delete playback.minImage;delete playback.maxImage;
const paused=await evaluate(`new Promise(r=>{document.querySelector('#paused').checked=true;__miffyMotion.redraw();const a=document.querySelector('#stage').toDataURL(),b={...__miffyMotion.bust};setTimeout(()=>r({same:a===document.querySelector('#stage').toDataURL(),before:b,after:__miffyMotion.bust}),350)})`);assert.equal(paused.same,true);assert.deepEqual(paused.before,paused.after);
const reset=await evaluate(`(()=>{document.querySelector('#neutral').click();return __miffyMotion.bust})()`);assert.equal(reset.amplitudePx,0);assert.equal(reset.followPx,0);
const output={initial,guide,field,right,left,leave,playback,paused,reset,artisticAcceptance:'pending user'};
writeFileSync(resolve(root,'browser_qa.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
}finally{ws.close()}
