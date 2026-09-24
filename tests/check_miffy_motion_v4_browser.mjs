// Native-canvas browser review of Miffy's non-production stance candidate.
// Requires the local viewer on 8014 and Chrome CDP on 9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v4');
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+
  task+'&rig=_review/motion_v4/rig.json';
const target=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),
  {method:'PUT'});
if(!target.ok)throw Error('Cannot open Chrome test tab');
const page=await target.json();
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
    pending.set(id,{ok,fail});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',
    {expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const state=await evaluate(`new Promise((resolve,reject)=>{
  const began=Date.now();
  const timer=setInterval(()=>{
    if(window.__miffyMotion?.loaded){
      clearInterval(timer);
      resolve({candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches});
    }else if(document.querySelector('#error').textContent||Date.now()-began>30000){
      clearInterval(timer);
      reject(Error(document.querySelector('#error').textContent||'load timeout'));
    }
  },100);
})`);
assert.deepEqual(state,{candidate:'motion_v4',neutralMatches:true});
await evaluate("document.querySelector('#neutral').click()");
const neutral=await evaluate("document.querySelector('#stage').toDataURL()");
async function sample(body,torso,head){
  return evaluate(`(()=>{
    for(const [id,value] of Object.entries(${JSON.stringify({body,torso,head})})){
      const input=document.getElementById(id);
      input.value=String(value);input.dispatchEvent(new Event('input'));
    }
    const canvas=document.querySelector('#stage');
    const image=canvas.getContext('2d').getImageData(0,1220,1280,44);
    const sum=[0,0],count=[0,0];
    for(let y=0;y<44;y++)for(let x=0;x<1280;x++){
      if(image.data[(y*1280+x)*4+3]>200){
        const side=x<630?0:1;sum[side]+=x;count[side]++;
      }
    }
    return {image:canvas.toDataURL(),
      soles:sum.map((value,side)=>value/count[side]),
      pose:window.__miffyMotion.currentPose};
  })()`);
}
const positive=await sample(100,-40,-20);
const negative=await sample(-100,40,20);
assert.notEqual(positive.image,neutral);
assert.notEqual(negative.image,neutral);
const soleDeltas=positive.soles.map((value,i)=>Math.abs(value-negative.soles[i]));
assert.ok(soleDeltas.every(value=>value<1),'both sole contact bands must stay fixed');
assert.ok(positive.pose.hipPx>10&&negative.pose.hipPx< -10);
assert.ok(Math.abs(positive.pose.headPx)<Math.abs(positive.pose.hipPx));
for(const [name,data] of [['neutral',neutral],
  ['positive',positive.image],['negative',negative.image]]){
  writeFileSync(resolve(output,'preview_'+name+'.png'),
    Buffer.from(data.split(',')[1],'base64'));
}
const stable=await evaluate(`new Promise(resolve=>{
  const first=document.querySelector('#stage').toDataURL();
  setTimeout(()=>resolve(first===document.querySelector('#stage').toDataURL()),300);
})`);
assert.equal(stable,true);
const moving=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  const first=document.querySelector('#stage').toDataURL();
  setTimeout(()=>resolve(first!==document.querySelector('#stage').toDataURL()),700);
})`);
assert.equal(moving,true);
const cycle=await evaluate(`new Promise(resolve=>{
  let hipMin=Infinity,hipMax=-Infinity,headMin=Infinity,headMax=-Infinity;
  const began=performance.now();
  const timer=setInterval(()=>{
    const p=window.__miffyMotion.currentPose;
    if(p){hipMin=Math.min(hipMin,p.hipPx);hipMax=Math.max(hipMax,p.hipPx);
      headMin=Math.min(headMin,p.headPx);headMax=Math.max(headMax,p.headPx);}
    if(performance.now()-began>8300){
      clearInterval(timer);resolve({hipMin,hipMax,headMin,headMax});
    }
  },100);
})`);
assert.ok(cycle.hipMax-cycle.hipMin>12,'idle hip travel must be visible');
assert.ok(cycle.headMax-cycle.headMin<cycle.hipMax-cycle.hipMin,
  'head must not follow hip as one rigid board');
const shot=await command('Page.captureScreenshot',{format:'png'});
writeFileSync(resolve(output,'panel.png'),Buffer.from(shot.data,'base64'));
console.log(JSON.stringify({state,soleDeltas,cycle,
  pausedStable:stable,animated:moving,visualAcceptance:'pending'},null,2));
ws.close();
