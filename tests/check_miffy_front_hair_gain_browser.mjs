import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v33');
mkdirSync(output,{recursive:true});
async function inspect(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json&review_reload=front_hair_gain';
  const response=await fetch('http://127.0.0.1:9337/json/new?'+
    encodeURIComponent(url),{method:'PUT'});
  assert.ok(response.ok);
  const page=await response.json(),ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
  let id=0;const pending=new Map();
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(!waiter)return;
    pending.delete(message.id);
    if(message.error||message.result?.exceptionDetails)
      waiter.reject(Error(message.error?.message||message.result.exceptionDetails.text));
    else waiter.resolve(message.result.result.value);
  };
  const evaluate=expression=>new Promise((ok,bad)=>{
    const key=++id;pending.set(key,{resolve:ok,reject:bad});
    ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',
      params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  try{
    await evaluate(`new Promise((ok,bad)=>{const t=Date.now(),i=setInterval(()=>{
      if(window.__miffyMotion?.loaded){clearInterval(i);ok(true)}
      else if(document.querySelector('#error').textContent||Date.now()-t>30000){
        clearInterval(i);bad(Error(document.querySelector('#error').textContent||'timeout'))}
    },100)})`);
    return await evaluate(`(async()=>{
      const $=id=>document.getElementById(id),stage=$('stage');
      $('neutral').click();
      const frames=[];
      for(const yaw of [0,-50,50,-100,100]){
        $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
        const image=document.createElement('canvas');
        image.width=350;image.height=550;
        image.getContext('2d').drawImage(stage,450,0,350,550,0,0,350,550);
        const pixels=stage.getContext('2d').getImageData(0,0,1280,1280).data;
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))]
          .map(x=>x.toString(16).padStart(2,'0')).join('');
        frames.push({yaw,hash,image:image.toDataURL('image/png').split(',')[1]});
      }
      return {candidate:window.__miffyMotion.candidate,
        neutralMatches:window.__miffyMotion.neutralMatches,frames};
    })()`);
  }finally{
    ws.close();
    await fetch('http://127.0.0.1:9337/json/close/'+page.id);
  }
}
const old=await inspect('motion_v32'),next=await inspect('motion_v33');
assert.equal(old.neutralMatches,true);
assert.equal(next.neutralMatches,true);
assert.equal(old.frames[0].hash,next.frames[0].hash);
for(let i=1;i<next.frames.length;i++)
  assert.notEqual(old.frames[i].hash,next.frames[i].hash);
for(const frame of next.frames)
  writeFileSync(resolve(output,`front_hair_${frame.yaw}.png`),
    Buffer.from(frame.image,'base64'));
console.log(JSON.stringify({neutralSame:true,
  changedAngles:next.frames.slice(1).map(frame=>frame.yaw),
  screenshots:next.frames.map(frame=>`front_hair_${frame.yaw}.png`)}));
