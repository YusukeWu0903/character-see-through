import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const version=process.env.MIMI_REVIEW_VERSION||'v2';assert.match(version,/^v[0-9]+$/);
const task='Mimi_cloud_20260927',root=resolve('outputs/seethrough_local',task,'_review/motion_'+version);
const pages=await(await fetch('http://127.0.0.1:9337/json')).json();
const page=pages.find(p=>p.url.includes('local='+task)&&p.url.includes('motion_'+version+'/'));assert.ok(page);
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
let id=0;const queue=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data),p=queue.get(d.id);if(!p)return;queue.delete(d.id);if(d.result?.exceptionDetails||d.error)p.j(Error(JSON.stringify(d.result?.exceptionDetails||d.error)));else p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{queue.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
ws.onclose=()=>{for(const p of queue.values())p.j(Error('Browser diagnostic connection closed'));queue.clear()};
try{
const rendered=await ev(`(async()=>{
 const {createSharedFieldAdapter}=await import('/viewer-assets/shared-field-adapter.mjs');
 const rig=await(await fetch('/layers/seethrough_local/${task}/_review/motion_${version}/rig.json')).json();
 const source=document.createElement('canvas'),dest=document.createElement('canvas');source.width=source.height=dest.width=dest.height=1280;
 const g=source.getContext('2d');g.fillStyle='#f00';g.fillRect(478,443,6,6);
 const shared=createSharedFieldAdapter();
 const sample=x=>{shared.scene(dest,[{name:'topwear',visible:true,image:source}],{topwear:[1,0,0,1,0,0]},{body:0,torso:0,head:0},rig,{bustX:x,bustY:0,hair:{}},()=>source,()=>null);
 const a=dest.getContext('2d').getImageData(450,425,75,40).data;let weight=0,sum=0;for(let y=0;y<40;y++)for(let xx=0;xx<75;xx++){const w=a[(y*75+xx)*4+3];weight+=w;sum+=(450+xx)*w}return sum/weight};
 const centroid=[sample(-12),sample(0),sample(12)];
 const probe=new Image();probe.src='/layers/seethrough_local/${task}/topwear.png';await probe.decode();
 const before=document.createElement('canvas');before.width=before.height=1280;before.getContext('2d').drawImage(probe,0,0);
 shared.bust(dest,probe,{vertical:12,horizontal:12},rig.bustField);
 const a=before.getContext('2d').getImageData(0,0,1280,1280).data,b=dest.getContext('2d').getImageData(0,0,1280,1280).data;
 let outsideAlpha=0,outsideMax=0;for(let y=0;y<1280;y++)for(let x=0;x<1280;x++)if(x<416||x>622||y<361||y>515){const i=(y*1280+x)*4;outsideAlpha=Math.max(outsideAlpha,Math.abs(a[i+3]-b[i+3]));if(a[i+3]===255&&b[i+3]===255)for(let c=0;c<3;c++)outsideMax=Math.max(outsideMax,Math.abs(a[i+c]-b[i+c]))}
 return {centroid,outsideAlphaMax:outsideAlpha,outsideOpaqueRgbMax:outsideMax};
})()`);
assert.ok(rendered.centroid[0]<rendered.centroid[1]&&rendered.centroid[1]<rendered.centroid[2]);
// GPU texture interpolation can round an unchanged channel by one byte.
assert.ok(rendered.outsideAlphaMax<=1);assert.ok(rendered.outsideOpaqueRgbMax<=1);
const pixelFeet=await ev(`(async()=>{const load=async file=>{const im=new Image();im.src='/layers/seethrough_local/${task}/_review/motion_${version}/'+file;await im.decode();const c=document.createElement('canvas');c.width=c.height=1280;c.getContext('2d').drawImage(im,0,0);return c.getContext('2d').getImageData(0,1047,1280,233).data};const a=await load('pointer_left.png'),b=await load('pointer_right.png');let diff=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff++;return {differentChannels:diff}})()`);assert.equal(pixelFeet.differentChannels,0);
await ev(`document.querySelector('#defaults').click();true`);
const frames=[];
for(let i=0;i<14;i++){
 const f=await ev(`new Promise(r=>setTimeout(()=>{__miffyMotion.redraw();r({time:__miffyMotion.currentPose.time,bust:{...__miffyMotion.bust},image:document.querySelector('#stage').toDataURL()})},400))`);
 writeFileSync(resolve(root,'cycle_'+String(i).padStart(2,'0')+'.png'),Buffer.from(f.image.split(',')[1],'base64'));delete f.image;frames.push(f);
}
const output={rendered,pixelFeet,continuousSamples:frames,userAcceptance:'pending'};
writeFileSync(resolve(root,'extra_browser_qa.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({rendered,pixelFeet,frames:frames.length},null,2));
}finally{ws.close()}
