// Verify the displayed Miffy follows cursor direction, not just gain signs.
// Requires local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v6');
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+
  task+'&rig=_review/motion_v6/rig.json';
const target=await fetch('http://127.0.0.1:9337/json/new?'+
  encodeURIComponent(url),{method:'PUT'});
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
      clearInterval(timer);resolve({candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches});
    }else if(document.querySelector('#error').textContent||Date.now()-began>30000){
      clearInterval(timer);reject(Error(
        document.querySelector('#error').textContent||'load timeout'));
    }
  },100);
})`);
assert.deepEqual(state,{candidate:'motion_v6',neutralMatches:true});
await evaluate(`(()=>{
  document.querySelector('#neutral').click();
  document.querySelector('#paused').checked=false;
  document.querySelector('#follow').checked=true;
})()`);
async function side(which){
  return evaluate(`new Promise(resolve=>{
    const canvas=document.querySelector('#stage'),rect=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointermove',{
      clientX:${which==='right'?'rect.right-2':'rect.left+2'},
      clientY:rect.top+20}));
    setTimeout(()=>{
      const ctx=canvas.getContext('2d');
      function centroid(y,height){
        const data=ctx.getImageData(0,y,1280,height).data;
        let sum=0,count=0;
        for(let row=0;row<height;row++)for(let x=450;x<810;x++){
          if(data[(row*1280+x)*4+3]>200){sum+=x;count++;}
        }
        return sum/count;
      }
      resolve({pose:window.__miffyMotion.currentPose,
        pointer:window.__miffyMotion.pointer,
        headX:centroid(100,80),hipX:centroid(520,90),
        footX:centroid(1220,44),image:canvas.toDataURL()});
    },850);
  })`);
}
const right=await side('right');
const left=await side('left');
assert.ok(right.pointer.eased>.95&&left.pointer.eased<-.95);
assert.ok(right.pose.hipPx>0&&left.pose.hipPx<0);
assert.ok(right.pose.headPx>0&&left.pose.headPx<0);
assert.ok(right.hipX-left.hipX>3,'rendered hip must move toward cursor');
assert.ok(right.headX-left.headX>3,'rendered head must move toward cursor');
assert.ok(Math.abs(right.footX-left.footX)<.5,'feet must remain planted');
for(const [name,data] of [['right',right.image],['left',left.image]])
  writeFileSync(resolve(output,'preview_follow_'+name+'.png'),
    Buffer.from(data.split(',')[1],'base64'));
const paused=await evaluate(`new Promise(resolve=>{
  document.querySelector('#paused').checked=true;
  const canvas=document.querySelector('#stage'),first=canvas.toDataURL();
  const rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',
    {clientX:rect.right-2,clientY:rect.top+20}));
  setTimeout(()=>resolve(first===canvas.toDataURL()),250);
})`);
assert.equal(paused,true);
const playback=await evaluate(`new Promise(resolve=>{
  document.querySelector('#defaults').click();
  const began=performance.now(),frames=window.__miffyMotion.drawCount;
  setTimeout(()=>resolve({seconds:(performance.now()-began)/1000,
    frames:window.__miffyMotion.drawCount-frames}),2200);
})`);
console.log(JSON.stringify({state,
  headCenterDeltaPx:right.headX-left.headX,
  hipCenterDeltaPx:right.hipX-left.hipX,
  footCenterDeltaPx:right.footX-left.footX,
  rightPose:{hipPx:right.pose.hipPx,headPx:right.pose.headPx},
  leftPose:{hipPx:left.pose.hipPx,headPx:left.pose.headPx},
  pausedStable:paused,playback,visualAcceptance:'pending'},null,2));
ws.close();
