import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const version=process.env.MIMI_REVIEW_VERSION||'v16';assert.match(version,/^v[0-9]+$/);
const pages=await(await fetch('http://127.0.0.1:9337/json')).json();
const page=pages.find(p=>p.url.includes('local=Mimi_cloud_20260927')&&p.url.includes('motion_'+version+'/'));assert.ok(page);
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
let id=0;const queue=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data),p=queue.get(d.id);if(!p)return;queue.delete(d.id);if(d.error||d.result?.exceptionDetails)p.j(Error(JSON.stringify(d.error||d.result.exceptionDetails)));else p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{queue.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
const root=resolve('outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_'+version);
try{
const result=await ev(`(async()=>{
 document.querySelector('#neutral').click();const canvas=document.querySelector('#stage');
 const initial=canvas.toDataURL();
 const rows=Array.from(document.querySelectorAll('.layer-row'));
 const frontNames=['fronthair','fronthair_right'];
 const toggles=rows.filter(r=>frontNames.includes(r.querySelector('small')?.textContent)).map(r=>r.querySelector('input'));
 if(!toggles.length)throw Error('front hair row missing');
 for(const toggle of toggles){toggle.checked=false;toggle.dispatchEvent(new Event('change'));}
 const off=canvas.toDataURL();
 const im=new Image();im.src='/layers/seethrough_local/Mimi_cloud_20260927/_review/assembly_${version}/front_off.png';await im.decode();
 const expected=document.createElement('canvas');expected.width=expected.height=1280;expected.getContext('2d').drawImage(im,0,0);
 const a=canvas.getContext('2d').getImageData(0,0,1280,1280).data,b=expected.getContext('2d').getImageData(0,0,1280,1280).data;
 let max=0,alphaMax=0,premultipliedRgbMax=0,opaqueRgbMax=0;
 for(let i=0;i<a.length;i+=4){alphaMax=Math.max(alphaMax,Math.abs(a[i+3]-b[i+3]));
 for(let c=0;c<3;c++){max=Math.max(max,Math.abs(a[i+c]-b[i+c]));
 premultipliedRgbMax=Math.max(premultipliedRgbMax,Math.abs(a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255));
 if(a[i+3]===255&&b[i+3]===255)opaqueRgbMax=Math.max(opaqueRgbMax,Math.abs(a[i+c]-b[i+c]));}}
 const manifest=await(await fetch('/layers/seethrough_local/Mimi_cloud_20260927/_review/assembly_${version}/assembly.json')).json();
 const g=expected.getContext('2d');g.clearRect(0,0,1280,1280);
 for(const e of manifest.drawOrder){if(frontNames.includes(e.file.replace('.png','')))continue;
 const layer=new Image();layer.src='/layers/seethrough_local/Mimi_cloud_20260927/'+(e.asset||e.file);await layer.decode();g.drawImage(layer,0,0);}
 const sameBackend=expected.getContext('2d').getImageData(0,0,1280,1280).data;
 let sameBackendMax=0;for(let i=0;i<a.length;i++)sameBackendMax=Math.max(sameBackendMax,Math.abs(a[i]-sameBackend[i]));
 const rearRow=rows.find(r=>r.querySelector('small')?.textContent==='hair_back_left')||rows.find(r=>r.querySelector('small')?.textContent==='backhair');
 const rear=rearRow.querySelector('input');rear.checked=false;rear.dispatchEvent(new Event('change'));const rearOff=canvas.toDataURL();
 rear.checked=true;rear.dispatchEvent(new Event('change'));
 for(const toggle of toggles){toggle.checked=true;toggle.dispatchEvent(new Event('change'));}
 return {rawRgbMax:max,alphaMax,premultipliedRgbMax,opaqueRgbMax,sameBackendMax,rearVisibleDifference:off!==rearOff,restored:initial===canvas.toDataURL(),off,rearOff};
})()`);
// Keep Pillow-vs-Canvas deltas as diagnostic evidence. Exact visibility gating
// is tested against independent native layer composition on the same Canvas
// backend, avoiding cumulative compositor-rounding differences.
console.log(JSON.stringify({...result,off:undefined,rearOff:undefined}));
assert.equal(result.sameBackendMax,0);
assert.equal(result.rearVisibleDifference,true);assert.equal(result.restored,true);
for(const [key,name] of [['off','front_off_browser.png'],['rearOff','front_and_rear_off_browser.png']]){
writeFileSync(resolve(root,name),Buffer.from(result[key].split(',')[1],'base64'));delete result[key];}
writeFileSync(resolve(root,'hair_visibility_browser_qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{ws.close()}
