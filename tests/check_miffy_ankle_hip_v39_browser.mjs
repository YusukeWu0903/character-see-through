import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v39');
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/motion_v39/rig.json&review_reload=v39_cache_fix';
const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'});
if(!response.ok)throw Error('Cannot open browser test tab');
const page=await response.json();
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
let nextId=1;
const pending=new Map();
ws.onmessage=event=>{
  const data=JSON.parse(event.data);
  if(!data.id||!pending.has(data.id))return;
  const {ok,fail}=pending.get(data.id);pending.delete(data.id);
  if(data.error)fail(Error(data.error.message));else ok(data.result);
};
function command(method,params={}){
  const id=nextId++;
  return new Promise((ok,fail)=>{
    pending.set(id,{ok,fail});ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const loaded=await evaluate(`new Promise((resolve,reject)=>{
  const start=Date.now();const timer=setInterval(()=>{
    if(window.__miffyMotion?.loaded){clearInterval(timer);
      const pixels=document.querySelector('#stage').getContext('2d')
        .getImageData(520,60,240,920).data;
      let ink=0;
      for(let i=3;i<pixels.length;i+=4)if(pixels[i]>100)ink++;
      resolve({
      candidate:window.__miffyMotion.candidate,
      neutralMatches:window.__miffyMotion.neutralMatches,
      error:document.querySelector('#error').textContent,
      panelGroups:document.querySelectorAll('details.control-group').length,
      visiblePixels:ink});}
    else if(Date.now()-start>30000){clearInterval(timer);reject(Error('load timeout'));}
  },100);
})`);
assert.equal(loaded.candidate,'motion_v39');
assert.equal(loaded.neutralMatches,true);
assert.equal(loaded.error,'');
assert.ok(loaded.panelGroups>=3,'grouped panel must be active');
assert.ok(loaded.visiblePixels>5000,'character canvas must not be blank');
await command('Page.bringToFront');
const panelShot=await command('Page.captureScreenshot',{format:'png'});
writeFileSync(resolve(output,'panel_cache_fix.png'),Buffer.from(panelShot.data,'base64'));
const samples=[];
for(const body of [0,100,-100]){
  const state=await evaluate(`(()=>{
    document.querySelector('#paused').checked=true;
    document.querySelector('#auto').checked=false;
    document.querySelector('#follow').checked=false;
    document.querySelector('#body').value='${body}';
    document.querySelector('#body').dispatchEvent(new Event('input'));
    const canvas=document.querySelector('#stage');
    const image=canvas.getContext('2d').getImageData(0,1230,1280,34);
    const sum=[0,0],count=[0,0];
    for(let y=0;y<34;y++)for(let x=0;x<1280;x++){
      if(image.data[(y*1280+x)*4+3]>200){
        const side=x<630?0:1;sum[side]+=x;count[side]++;
      }
    }
    return {png:canvas.toDataURL(),soles:sum.map((v,i)=>v/count[i]),
      hip:window.__miffyMotion.currentPose?.hipPx};
  })()`);
  writeFileSync(resolve(output,`pose_${body}.png`),Buffer.from(state.png.split(',')[1],'base64'));
  samples.push({body,soles:state.soles,hip:state.hip});
}
for(const side of [0,1]){
  assert.ok(Math.abs(samples[1].soles[side]-samples[2].soles[side])<2,
    `sole ${side} should stay planted`);
}
assert.ok(samples[1].hip>samples[0].hip&&samples[2].hip<samples[0].hip);
console.log(JSON.stringify({loaded,samples},null,2));
ws.close();
