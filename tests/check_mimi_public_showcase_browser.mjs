import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const url=process.env.MIMI_SHOWCASE_URL||'http://127.0.0.1:8016/mimi-demo/';
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const q=new Map(),failures=[],responses=[];
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.method==='Network.responseReceived'){const s=d.params.response;responses.push({url:s.url,status:s.status});if(s.status>=400&&!s.url.endsWith('favicon.ico'))failures.push(s.url)}if(d.method==='Runtime.exceptionThrown')failures.push(JSON.stringify(d.params.exceptionDetails));const p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result)};
const cmd=(method,params={})=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>(await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
try{
 await cmd('Network.enable');await cmd('Runtime.enable');await cmd('Page.bringToFront');await cmd('Network.setCacheDisabled',{cacheDisabled:true});await cmd('Page.reload');
 const result=await ev(`new Promise((r,j)=>{let n=0;const t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);r({candidate:__miffyMotion.candidate,neutral:__miffyMotion.neutralMatches,error:document.querySelector('#error').textContent,title:document.querySelector('#candidate-title').textContent,blinkDisabled:document.querySelector('#blink').disabled,skirt:__miffyMotion.skirtSway.enabled})}else if(++n>250){clearInterval(t);j(Error(document.querySelector('#error').textContent||'Timeout'))}},100)})`);
 assert.equal(result.candidate,'motion_v62');assert.equal(result.neutral,true);assert.equal(result.error,'');assert.equal(result.skirt,true);assert.equal(result.blinkDisabled,true);
 const controls=await ev(`(()=>{document.querySelector('#neutral').click();const c=document.querySelector('#stage'),base=c.toDataURL(),p=c.getContext('2d').getImageData(0,0,1280,1280).data;let ink=0;for(let i=3;i<p.length;i+=4)if(p[i]>20)ink++;const input=document.querySelector('#body');input.value=60;input.dispatchEvent(new Event('input'));const changed=c.toDataURL()!==base;document.querySelector('#neutral').click();const reset=c.toDataURL()===base;document.querySelector('#show-skirt-field').checked=true;__miffyMotion.redraw();const guide=c.toDataURL()!==base;document.querySelector('#show-skirt-field').checked=false;__miffyMotion.redraw();return {ink,changed,reset,guide,restored:c.toDataURL()===base}})()`);
 assert.ok(controls.ink>10000&&controls.changed&&controls.reset&&controls.guide&&controls.restored);
 const live=await ev(`new Promise(r=>{document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;const c=document.querySelector('#stage'),b=c.getBoundingClientRect(),start=performance.now(),samples=[];function step(now){const t=(now-start)/1000;c.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*(t<1?.05:t<2?.95:.5),clientY:b.top+b.height*.4}));samples.push(__miffyMotion.skirtSway.offset);if(t<4)requestAnimationFrame(step);else{document.querySelector('#neutral').click();r({peak:Math.max(...samples.map(Math.abs)),settled:samples.at(-1)})}}requestAnimationFrame(step)})`);
 assert.ok(live.peak>.5);
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const mobile=await ev(`({canvas:document.querySelector('#stage').getBoundingClientRect().toJSON(),width:document.documentElement.scrollWidth})`);assert.ok(mobile.canvas.width>300);
 const shot=await cmd('Page.captureScreenshot',{format:'png'});writeFileSync('outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_v62/public_mobile.png',Buffer.from(shot.data,'base64'));
 assert.deepEqual(failures,[]);
 const evidence={url,result,controls,live,mobile,responses,failures};writeFileSync('outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_v62/public_release_qa.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({url,result,controls,live,requests:responses.length}));
}finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
