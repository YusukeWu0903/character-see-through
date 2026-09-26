import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const task='Miffy_full_body_casual_rb_20260924_012138',port=process.env.MIFFY_CDP_PORT||'9348';
const candidate=process.env.MIFFY_TEST_CANDIDATE||'motion_v50';
const url=`http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=${task}&rig=_review/${candidate}/rig.json&review_reload=gpu_head_qa`;
const page=await(await fetch(`http://127.0.0.1:${port}/json/new?`+encodeURIComponent(url),{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(ok=>ws.onopen=ok);
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error||m.result?.exceptionDetails?p.reject(Error(JSON.stringify(m))):p.resolve(m.result.result.value)};
const evaluate=expression=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))});
try{
  await evaluate(`new Promise((ok,bad)=>{let n=0;const t=setInterval(()=>{if(window.__miffyMotion?.loaded){clearInterval(t);ok(true)}else if(++n>300){clearInterval(t);bad(Error('load timeout'))}},100)})`);
  const result=await evaluate(`(async()=>{
    const {createFieldMeshRenderer}=await import('/viewer-assets/mesh-renderer.mjs?review-runtime=v49-full-gpu');
    const {balancedHeadLightingColor,pitchHeadLightingColor}=await import('/viewer-assets/head-lighting.mjs?review-runtime=v37-pitch-light');
    const rig=await(await fetch('/layers/seethrough_local/${task}/_review/motion_v45/rig.json')).json();
    const mesh=createFieldMeshRenderer(),source=document.createElement('canvas');source.width=source.height=1280;
    const rgb=[245,204,187];source.getContext('2d').fillStyle='rgb('+rgb.join(',')+')';source.getContext('2d').fillRect(0,0,1280,1280);
    const gl=mesh.canvas.getContext('webgl'),states=[],points=[[606,80],[646,80],[606,148],[646,148]];
    for(const yaw of [-rig.headSurface.maxDegrees,0,rig.headSurface.maxDegrees])
      for(const pitch of [-rig.headPitch.maxDegrees,0,rig.headPitch.maxDegrees])for(const strength of [0,1]){
        mesh.draw(source,(x,y)=>[x,y],{lighting:{surface:rig.headSurface,config:rig.faceLighting,pitchConfig:rig.facePitchLighting,yaw,pitch,strength}});
        let maxDelta=0;const samples=[];
        for(const [x,y] of points){const pixel=new Uint8Array(4);gl.readPixels(x,1279-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
          let expected=balancedHeadLightingColor(x+.5,y+.5,yaw,rig.headSurface,rig.faceLighting,rgb,strength);
          expected=[...new Uint8ClampedArray(expected)];expected=pitchHeadLightingColor(x+.5,y+.5,pitch,rig.headSurface,rig.facePitchLighting,expected,strength);
          expected=[...new Uint8ClampedArray(expected)];for(let k=0;k<3;k++)maxDelta=Math.max(maxDelta,Math.abs(pixel[k]-expected[k]));
          samples.push({x,y,actual:[...pixel],expected});
        }states.push({yaw,pitch,strength,maxDelta,samples});
      }
    const $=id=>document.getElementById(id),r=window.__miffyMotion;
    $('neutral').click();$('yaw').value=50;$('yaw').dispatchEvent(new Event('input'));
    const display={gpu:r.actualCanvas.id==='gpu-stage',pointerPassThrough:r.actualCanvas.style.pointerEvents==='none',
      width:r.actualCanvas.offsetWidth,stageWidth:$('stage').offsetWidth,height:r.actualCanvas.offsetHeight,stageHeight:$('stage').offsetHeight};
    const capture=()=>{r.redraw();const c=document.createElement('canvas');c.width=300;c.height=320;c.getContext('2d').drawImage(r.actualCanvas,550,35,150,160,0,0,300,320);return c.toDataURL().split(',')[1]};
    const guideStates=[];for(const control of ['show-head-surface','show-head-pitch','show-guides','show-head-geometry']){
      $(control).checked=true;$(control).dispatchEvent(new Event('change'));guideStates.push({control,crop:capture()});
      $(control).checked=false;$(control).dispatchEvent(new Event('change'));
    }
    $('reference').checked=true;$('reference').dispatchEvent(new Event('change'));display.referenceCPU=r.actualCanvas.id==='stage'&&(!$('gpu-stage')||$('gpu-stage').hidden);
    return {states,display,guideStates};
  })()`);
  const out=`outputs/seethrough_local/${task}/_review/${candidate}`;
  for(const s of result.guideStates){writeFileSync(out+'/'+s.control+'.png',Buffer.from(s.crop,'base64'));delete s.crop;}
  writeFileSync(out+'/gpu_head_qa.json',JSON.stringify(result,null,2));
  for(const s of result.states)assert.ok(s.maxDelta<=1,JSON.stringify(s));
  assert.equal(result.display.gpu,candidate==='motion_v49');
  if(candidate==='motion_v49')assert.equal(result.display.pointerPassThrough,true);
  assert.equal(result.display.referenceCPU,true);
  assert.equal(result.display.width,result.display.stageWidth);assert.equal(result.display.height,result.display.stageHeight);
  console.log(JSON.stringify({lightingStates:result.states.length,maxDelta:Math.max(...result.states.map(s=>s.maxDelta)),display:result.display}));
}finally{ws.close();await fetch(`http://127.0.0.1:${port}/json/close/${page.id}`)}
