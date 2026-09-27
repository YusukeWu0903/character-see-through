// Read-only scene diagnosis: independent offscreen renderers, no live controls changed.
import {writeFileSync,mkdirSync} from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:9337/json')).json();
const version=process.env.MIMI_REVIEW_VERSION||'v50';
const page=pages.find(p=>p.url.includes('motion_'+version+'/rig.json'));
if(!page)throw Error('v50 diagnostic browser missing');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const q=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data);const p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result.value)};
const ev=expression=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))});
try{
 const result=await ev(`(async()=>{
 const {createFieldMeshRenderer}=await import('/viewer-assets/mesh-renderer.mjs');
 const base='/layers/seethrough_local/Mimi_cloud_20260927/';
 const m=await(await fetch(base+'_review/assembly_v50/assembly.json')).json();
 const images=[];for(const name of ['face_far','face']){const e=m.drawOrder.find(e=>e.name===name);const im=new Image();im.src=base+e.asset;await im.decode();images.push(im)}
 const union=document.createElement('canvas');union.width=union.height=1280;const ug=union.getContext('2d');for(const im of images)ug.drawImage(im,0,0);
 const candidate=new Image();candidate.src=base+'_review/assembly_${version}/face.png';await candidate.decode();
 const renderer=createFieldMeshRenderer(1280,1280,true);
 const scratch=document.createElement('canvas');scratch.width=scratch.height=1280;const g=scratch.getContext('2d',{willReadFrequently:true});
 const read=()=>{g.clearRect(0,0,1280,1280);g.drawImage(renderer.canvas,0,0);return g.getImageData(0,0,1280,1280).data};
 const probes=[];for(const shift of [-.75,-.5,-.25,0,.25,.5,.75]){
 const map=(x,y)=>[x+shift,y];renderer.begin();for(const im of images)renderer.draw(im,map,{clear:false});const split=read();
 renderer.begin();renderer.draw(union,map,{clear:false});const merged=read();let maxLoss=0,count=0,browCount=0;
 for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4+3,loss=merged[i]-split[i];maxLoss=Math.max(maxLoss,loss);if(loss>16){count++;if(x>=440&&x<580&&y>=175&&y<230)browCount++}}
 renderer.begin();renderer.draw(candidate,map,{clear:false});const repaired=read();let candidateMax=0;
 for(let i=0;i<merged.length;i++)candidateMax=Math.max(candidateMax,Math.abs(merged[i]-repaired[i]));
 probes.push({shift,maxAlphaLoss:maxLoss,pixelsWithLossOver16:count,browCount,candidateMaxRgbaDifference: candidateMax});}
 return {probes,scope:'offscreen browser native1280 shared mesh renderer; live scene and assets unchanged'};
 })()`);
 const dest='outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_'+version+'/diagnostics';mkdirSync(dest,{recursive:true});writeFileSync(dest+'/depth_seam.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 if(version!=='v50'&&result.probes.some(p=>p.candidateMaxRgbaDifference!==0))throw Error('Merged face differs from complete-face reference');
}finally{ws.close()}
