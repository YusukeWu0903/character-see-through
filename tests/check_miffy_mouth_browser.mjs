import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const task='Miffy_full_body_casual_rb_20260924_012138';
const debugPort=process.env.MIFFY_CDP_PORT||'9337';
const candidate=process.env.MIFFY_TEST_CANDIDATE||'motion_v45';
const priorCandidate=['motion_v49','motion_v50'].includes(candidate)?'motion_v48':['motion_v46','motion_v47','motion_v48'].includes(candidate)?'motion_v45':'motion_v43';
const out=`outputs/seethrough_local/${task}/_review/${candidate}`;
async function inspect(candidate, full=false){
  const url=`http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=${task}&rig=_review/${candidate}/rig.json&review_reload=mouth_qa`;
  const page=await (await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
  const socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{socket.onopen=ok;socket.onerror=bad});
  let serial=0;const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;
    pending.delete(m.id);if(m.error||m.result?.exceptionDetails)p.reject(Error(JSON.stringify(m)));
    else p.resolve(m.result.result.value);};
  const evaluate=expression=>new Promise((ok,bad)=>{const id=++serial;pending.set(id,{resolve:ok,reject:bad});
    socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
  try{
    await evaluate(`new Promise((ok,bad)=>{const t=Date.now(),i=setInterval(()=>{
      if(window.__miffyMotion?.loaded){clearInterval(i);ok(true)}
      else if(document.getElementById('error')?.textContent||Date.now()-t>30000){clearInterval(i);bad(Error(document.getElementById('error')?.textContent||'timeout'))}
    },100)})`);
    return await evaluate(`(async()=>{
      const $=id=>document.getElementById(id),r=window.__miffyMotion,c=$('stage');
      const g={getImageData(x,y,w,h){const actual=r.actualCanvas||c;
        if(actual===c)return c.getContext('2d').getImageData(x,y,w,h);
        r.redraw();
        const gl=actual.getContext('webgl'),raw=new Uint8Array(w*h*4),data=new Uint8ClampedArray(raw.length);
        gl.readPixels(x,1280-y-h,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);
        for(let row=0;row<h;row++)for(let col=0;col<w;col++){
          const a=((h-1-row)*w+col)*4,b=(row*w+col)*4,alpha=raw[a+3];data[b+3]=alpha;
          for(let k=0;k<3;k++)data[b+k]=alpha?raw[a+k]*255/alpha:0;
        }return {data}}};
      const input=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new Event('input'))};
      const select=v=>{$('mouth-shape').value=v;$('mouth-shape').dispatchEvent(new Event('change'))};
      const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
      const crop=()=>{r.redraw();const t=document.createElement('canvas');t.width=150;t.height=160;t.getContext('2d').drawImage(r.actualCanvas||c,550,35,150,160,0,0,150,160);return t.toDataURL().split(',')[1]};
      $('neutral').click();const base=g.getImageData(0,0,1280,1280).data;
      const result={candidate:r.candidate,neutralMatches:r.neutralMatches,neutralHash:await hash(base),frames:[]};
      $('defaults').click();await new Promise(ok=>setTimeout(ok,500));
      const t=performance.now(),count=r.drawCount;await new Promise(ok=>setTimeout(ok,2000));
      result.playbackFps=(r.drawCount-count)*1000/(performance.now()-t);
      $('neutral').click();$('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
      let tick=0;const scrub=setInterval(()=>{input('yaw',50*Math.sin(++tick*.12));input('pitch',50*Math.cos(tick*.12))},32);
      const st=performance.now(),sc=r.drawCount;await new Promise(ok=>setTimeout(ok,2000));clearInterval(scrub);
      result.scrubFps=(r.drawCount-sc)*1000/(performance.now()-st);
      $('neutral').click();
      if(!${full})return result;
      result.autoTalkDefault=$('auto-talk').checked;
      for(const mode of ['closed','slight','a','e','o','u']){
        select(mode);const pixels=g.getImageData(0,0,1280,1280).data;let changed=0,outside=0;const outsideBounds=[1280,1280,0,0];
        for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
          const i=(y*1280+x)*4;if([0,1,2,3].some(k=>base[i+k]!==pixels[i+k])){
            changed++;if(x<606||x>=647||y<133||y>=167){outside++;outsideBounds[0]=Math.min(outsideBounds[0],x);outsideBounds[1]=Math.min(outsideBounds[1],y);outsideBounds[2]=Math.max(outsideBounds[2],x);outsideBounds[3]=Math.max(outsideBounds[3],y);}
          }
        }
        result.frames.push({mode,changed,outside,outsideBounds,hash:await hash(pixels),crop:crop()});
      }
      result.poses=[];
      for(const yaw of [-50,0,50])for(const pitch of [-50,0,50]){
        select('a');input('yaw',yaw);input('pitch',pitch);input('blink',50);
        input('gaze-x',yaw<0?-100:100);input('gaze-y',pitch<0?-100:100);
        result.poses.push({yaw,pitch,mouth:r.mouth.active,crop:crop()});
      }
      input('blink',100);result.closedEyeMouth=r.mouth.active;
      $('neutral').click();select('e');$('auto-talk').checked=true;$('auto-talk').dispatchEvent(new Event('change'));
      const pausedMode=r.mouth.active;await new Promise(ok=>setTimeout(ok,400));
      result.pauseFrozen=r.mouth.active===pausedMode;
      $('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
      const observed=new Set();const until=Date.now()+1900;
      while(Date.now()<until){await new Promise(ok=>setTimeout(ok,50));observed.add(r.mouth.active)}
      result.autoModes=[...observed];
      select('u');result.manualStopsAuto=!$('auto-talk').checked;
      $('neutral').click();result.resetMouth=r.mouth.active;
      result.resetHash=await hash(g.getImageData(0,0,1280,1280).data);
      $('defaults').click();result.defaultMouth=r.mouth.active;result.defaultTalk=$('auto-talk').checked;
      result.renderer=r.renderer;
      if(r.renderer.mode.startsWith('shared-webgl')){
        $('neutral').click();input('body',80);const beforeGuide=await hash(g.getImageData(0,0,1280,1280).data);
        result.guideChanges=[];
        for(const id of ['show-bust-field','show-arm-field','show-hair-follow','show-neck-follow']){
          $(id).checked=true;$(id).dispatchEvent(new Event('change'));
          result.guideChanges.push(beforeGuide!==await hash(g.getImageData(0,0,1280,1280).data));
          $(id).checked=false;$(id).dispatchEvent(new Event('change'));
        }
        result.guideOffRestores=beforeGuide===await hash(g.getImageData(0,0,1280,1280).data);
        const legs=document.createElement('canvas');legs.width=250;legs.height=280;
        r.redraw();
        legs.getContext('2d').drawImage(r.actualCanvas||c,500,580,250,280,0,0,250,280);
        result.legCrop=legs.toDataURL().split(',')[1];
        const baselineFoot=g.getImageData(0,1264,1280,10).data;
        result.footMaxAlphaDelta=0;
        for(const body of [-100,-50,50,100]){
          input('body',body);const pixels=g.getImageData(0,1264,1280,10).data;
          for(let i=3;i<pixels.length;i+=4)result.footMaxAlphaDelta=Math.max(result.footMaxAlphaDelta,Math.abs(pixels[i]-baselineFoot[i]));
        }
        result.bodyCrop=crop();
        const {createSharedFieldAdapter}=await import('/viewer-assets/shared-field-adapter.mjs?review-runtime=v48-final');
        const adapter=createSharedFieldAdapter();
        const field=(await(await fetch('/layers/seethrough_local/${task}/_review/motion_v45/rig.json')).json()).grounding;
        const source=document.createElement('canvas');source.width=source.height=1280;
        source.getContext('2d').fillStyle='#f5ccbb';source.getContext('2d').fillRect(400,300,500,800);
        const target=document.createElement('canvas');target.width=target.height=1280;
        result.meshSeams=[];
        for(const body of [-1,-.8,-.4,.4,.8,1]){
          adapter.stance(target,source,{body,torso:0,head:0},field);
          const pixels=target.getContext('2d').getImageData(500,500,250,350).data;
          let partial=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)partial++;
          result.meshSeams.push({body,partial});
        }
      }
      return result;
    })()`);
  }finally{socket.close();await fetch('http://127.0.0.1:'+debugPort+'/json/close/'+page.id)}
}
const prior=await inspect(priorCandidate),next=await inspect(candidate,true);
writeFileSync(`${out}/browser_diagnostic.json`,JSON.stringify({prior,next},null,2));
assert.equal(prior.neutralHash,next.neutralHash);assert.equal(next.neutralMatches,true);
assert.equal(next.autoTalkDefault,false);
for(const f of next.frames){assert.ok(f.changed>0);assert.equal(f.outside,0);
  writeFileSync(`${out}/mouth_${f.mode}.png`,Buffer.from(f.crop,'base64'));delete f.crop}
assert.equal(new Set(next.frames.map(f=>f.hash)).size,6);
for(const p of next.poses){assert.equal(p.mouth,'a');writeFileSync(`${out}/yaw_${p.yaw}_pitch_${p.pitch}.png`,Buffer.from(p.crop,'base64'));delete p.crop}
assert.equal(next.closedEyeMouth,'a');assert.equal(next.pauseFrozen,true);
assert.ok(next.autoModes.length>=5);assert.equal(next.manualStopsAuto,true);
assert.equal(next.resetMouth,'original');assert.equal(next.defaultMouth,'original');assert.equal(next.defaultTalk,false);
assert.equal(next.resetHash,next.neutralHash);
if(['motion_v46','motion_v47','motion_v48','motion_v49','motion_v50'].includes(candidate)){
  assert.ok(next.renderer.mode.startsWith('shared-webgl'));
  for(const state of next.meshSeams)assert.equal(state.partial,0);
  assert.equal(next.guideOffRestores,true);assert.ok(next.footMaxAlphaDelta<=1);
  assert.ok(next.guideChanges.every(Boolean));
  writeFileSync(`${out}/body_pose.png`,Buffer.from(next.bodyCrop,'base64'));delete next.bodyCrop;
  writeFileSync(`${out}/legs_pose.png`,Buffer.from(next.legCrop,'base64'));delete next.legCrop;
}
writeFileSync(`${out}/browser_qa.json`,JSON.stringify({prior,next,visualAcceptance:'pending user review'},null,2));
console.log(JSON.stringify({neutralIdentical:true,distinctMouths:6,ownerBoundaryPass:true,autoModes:next.autoModes,pauseFrozen:next.pauseFrozen,resetPass:true,priorFps:prior.playbackFps,nextFps:next.playbackFps,priorScrubFps:prior.scrubFps,nextScrubFps:next.scrubFps,meshSeams:next.meshSeams}));
