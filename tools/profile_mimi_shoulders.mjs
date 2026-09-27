import {writeFileSync} from 'node:fs';
const results=[];
const versions=(process.env.MIMI_PROFILE_VERSIONS||'v58,v59,v58').split(',');
for(const version of versions){
 const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=Mimi_cloud_20260927&rig=_review/motion_'+version+'/rig.json&review_reload=profile_'+Date.now();
 const page=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const q=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data),p=q.get(d.id);if(!p)return;q.delete(d.id);d.error||d.result.exceptionDetails?p.j(Error(JSON.stringify(d))):p.r(d.result.result?.value)};
 const ev=expression=>new Promise((r,j)=>{q.set(++id,{r,j});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))});
 ws.send(JSON.stringify({id:99999,method:'Page.bringToFront'}));
 try{
  await ev(`new Promise((r,j)=>{const t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);r(true)}else if(document.querySelector('#error').textContent){clearInterval(t);j(Error(document.querySelector('#error').textContent))}},100)})`);
  const fixed=await ev(`(()=>{
   document.querySelector('#neutral').click();
   const stats=window.__meshProfile={draws:0,triangles:0,vertices:0,renderer:null};
   const proto=WebGLRenderingContext.prototype,draw=proto.drawElements,buffer=proto.bufferData;
   proto.drawElements=function(mode,count,...args){stats.draws++;stats.triangles+=count/3; if(!stats.renderer){const ext=this.getExtension('WEBGL_debug_renderer_info');stats.renderer=ext?this.getParameter(ext.UNMASKED_RENDERER_WEBGL):this.getParameter(this.RENDERER)}return draw.call(this,mode,count,...args)};
   proto.bufferData=function(target,data,...args){if(target===this.ARRAY_BUFFER&&data?.BYTES_PER_ELEMENT===4)stats.vertices+=data.length/4;return buffer.call(this,target,data,...args)};
   for(let i=0;i<8;i++){document.querySelector('#body').value=String(60+i);__miffyMotion.redraw()}
   stats.draws=stats.triangles=stats.vertices=0;
   const costs=[];
   for(let i=0;i<60;i++){
    document.querySelector('#body').value=String(75*Math.sin((i+1)*.1));document.querySelector('#torso').value=String(12*Math.cos((i+1)*.1));
    const t=performance.now();__miffyMotion.redraw();costs.push(performance.now()-t);
   }
   costs.sort((a,b)=>a-b);
   return {meanMs:costs.reduce((a,b)=>a+b)/costs.length,medianMs:costs[30],p95Ms:costs[57],verticesPerFrame:stats.vertices/60,trianglesPerFrame:stats.triangles/60,drawsPerFrame:stats.draws/60,renderer:stats.renderer};
  })()`);
  const live=await ev(`new Promise(r=>{
   document.querySelector('#neutral').click();document.querySelector('#hair').value=0;document.querySelector('#follow').checked=true;document.querySelector('#paused').checked=false;
   const c=document.querySelector('#stage'),rect=c.getBoundingClientRect(),stats=__meshProfile;
   let start=performance.now(),last=start,times=[],startDraw=__miffyMotion.drawCount;
   stats.vertices=stats.triangles=stats.draws=0;
   function sample(now){
    times.push(now-last);last=now;
    c.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+rect.width*(.5+.45*Math.sin((now-start)*.004)),clientY:rect.top+rect.height*.4}));
    if(now-start<5000)requestAnimationFrame(sample);
    else {document.querySelector('#paused').checked=true;const draws=__miffyMotion.drawCount-startDraw;times.sort((a,b)=>a-b);r({durationMs:now-start,frames:times.length,renderedFrames:draws,renderFps:draws*1000/(now-start),rafMedianMs:times[Math.floor(times.length*.5)],rafP95Ms:times[Math.floor(times.length*.95)],verticesPerRenderedFrame:stats.vertices/draws,bank:__miffyMotion.shoulderCompensation})}
   }
   requestAnimationFrame(sample);
  })`);
  const result={version,fixed,live};results.push(result);console.log(JSON.stringify(result));
 }finally{ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id)}
}
const outputVersion=process.env.MIMI_PROFILE_OUTPUT||'v59';
writeFileSync('outputs/seethrough_local/Mimi_cloud_20260927/_review/motion_'+outputVersion+'/performance_qa.json',JSON.stringify({results,scope:'same CDP browser, sequential foreground tests, native1280, guides off; vertices count is uploaded coordinates, triangles count unchanged topology'},null,2));
