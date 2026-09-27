import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
const version=process.env.MIMI_REVIEW_VERSION||'v61';
const dest='outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_'+version+'/';
if(existsSync(dest+'geometry_equivalence.json')&&!existsSync(dest+'geometry_equivalence_strict_trial.json'))
 writeFileSync(dest+'geometry_equivalence_strict_trial.json',readFileSync(dest+'geometry_equivalence.json'));
const a=JSON.parse(readFileSync(dest+'rig.json')),b=JSON.parse(readFileSync('outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_v59/rig.json'));
for(const k of ['pointerFollow','shoulderCompensation','grounding','bustField','assemblySha256'])assert.deepEqual(a[k],b[k]);
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_'+version+'/rig.json&review_reload=equivalence_'+Date.now();
const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const q=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data),p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result?.value)};
const ev=expression=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
ws.send(JSON.stringify({id:99999,method:'Page.bringToFront'}));
try{
 await ev(`new Promise((r,j)=>{const t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);document.querySelector('#neutral').click();r(true)}else if(document.querySelector('#error').textContent){clearInterval(t);j(Error(document.querySelector('#error').textContent))}},100)})`);
 const result=await ev(`(async()=>{
  const {createSharedFieldAdapter}=await import('/viewer-assets/shared-field-adapter.mjs?review-runtime=v60-shared-geometry');
  const {drawShoulderPoseGuide}=await import('/viewer-assets/expression-pose.mjs?review-runtime=v67-independent-shoulders');
  const base='/layers/seethrough_local/Mimi_cloud_20260927/';
  const rig=await(await fetch(base+'_review/motion_v59/rig.json')).json();
  rig.renderer.reuseGpuBuffers=${a.renderer.reuseGpuBuffers!==false};
  const manifest=await(await fetch(base+rig.assembly)).json();
  const layers=await Promise.all(manifest.drawOrder.map(async entry=>{const image=new Image();image.src=base+(entry.asset||entry.file);await image.decode();return {...entry,image,visible:true,blank:false}}));
  const matrices=Object.fromEntries(layers.map(l=>[l.name,[1,0,0,1,0,0]]));
  const adapter=createSharedFieldAdapter(false),canvas=document.createElement('canvas');canvas.width=canvas.height=1280;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),guides=new Map();
  const guideFor=(layer,matrix)=>{if(!['neck','topwear','handwear','handwear_left'].includes(layer.name))return null;if(!guides.has(layer.name)){const c=document.createElement('canvas');c.width=c.height=1280;drawShoulderPoseGuide(c,layer.image,rig.shoulderCompensation.field,matrix);guides.set(layer.name,c)}return guides.get(layer.name)};
  const results=[];
  const proto=WebGLRenderingContext.prototype,originalBind=proto.bindBuffer,originalBuffer=proto.bufferData,originalDraw=proto.drawElements;
  let bound=null,uploads=new Map(),drawGeometry=[];
  proto.bindBuffer=function(target,buffer){if(target===this.ARRAY_BUFFER)bound=buffer;return originalBind.call(this,target,buffer)};
  proto.bufferData=function(target,data,...args){if(target===this.ARRAY_BUFFER&&data?.BYTES_PER_ELEMENT===4){let hash=2166136261;const words=new Uint32Array(data.buffer,data.byteOffset,data.byteLength/4);for(const v of words)hash=Math.imul(hash^v,16777619);uploads.set(bound,{hash:hash>>>0,length:data.length})}return originalBuffer.call(this,target,data,...args)};
  proto.drawElements=function(...args){drawGeometry.push(uploads.get(bound));return originalDraw.apply(this,args)};
  for(const guide of [false,true])for(const [pose,bank]of [[0,0],[-1,-1],[-.5,-.5],[.5,.5],[1,1],[0,.18],[0,-.18]]){
   const controls={body:.75*pose,torso:.12*pose,head:-.03*pose,expressionPose:0,shoulderLeft:bank,shoulderRight:-bank};
   const drivers={yaw:0,roll:0,hair:{fronthair:0,backhair:0},bustX:pose*10.2,bustY:0};
   const face=()=>layers.find(l=>l.name==='face').image;
   drawGeometry=[];rig.renderer.reuseSharedGeometry=false;adapter.scene(canvas,layers,matrices,controls,rig,drivers,face,()=>0,guide?guideFor:null);
   const oldGeometry=JSON.stringify(drawGeometry);
   const old=ctx.getImageData(0,0,1280,1280).data;
   drawGeometry=[];rig.renderer.reuseSharedGeometry=true;adapter.scene(canvas,layers,matrices,controls,rig,drivers,face,()=>0,guide?guideFor:null);
   const sameGeometry=oldGeometry===JSON.stringify(drawGeometry);
   const next=ctx.getImageData(0,0,1280,1280).data;let max=0,changed=0;
   for(let i=0;i<old.length;i++){const d=Math.abs(old[i]-next[i]);max=Math.max(max,d);if(d)changed++}
   rig.renderer.reuseSharedGeometry=false;adapter.scene(canvas,layers,matrices,controls,rig,drivers,face,()=>0,guide?guideFor:null);
   const repeat=ctx.getImageData(0,0,1280,1280).data;let repeatMax=0;
   for(let i=0;i<old.length;i++)repeatMax=Math.max(repeatMax,Math.abs(old[i]-repeat[i]));
   results.push({guide,pose,bank,maxRGBA:max,changedChannels:changed,sameGeometry,baselineRepeatMax:repeatMax});
  }
  proto.bindBuffer=originalBind;proto.bufferData=originalBuffer;proto.drawElements=originalDraw;
  return {neutral:__miffyMotion.neutralMatches,results,native:[canvas.width,canvas.height],image:canvas.toDataURL()};
 })()`);
 console.log('Image/geometry evidence',result.results);
 writeFileSync(dest+'geometry_equivalence.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 writeFileSync(dest+'geometry_equivalence.json',JSON.stringify(result,null,2));
 // Float32 geometry is exact. Native GPU->Canvas roundoff is measured separately:
 // the unoptimized path itself varied by1 channel level on repeated captures.
 // Neutral must stay exact; moving frames may differ by1 in at most0.001% of channels.
 for(const p of result.results){assert(p.sameGeometry);if(p.pose===0&&p.bank===0)assert.equal(p.maxRGBA,0);
  else{assert(p.maxRGBA<=1);assert(p.changedChannels/(1280*1280*4)<=.00001)}}assert(result.neutral);
 console.log('PASS exact geometry/neutral, bounded native GPU rounding at14 poses/guide states');
}finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
