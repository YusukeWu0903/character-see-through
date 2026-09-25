import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task='Miffy_full_body_casual_rb_20260924_012138';
const oldCandidate=process.argv[2]||'motion_v36';
const nextCandidate=process.argv[3]||'motion_v37';
const output=resolve('outputs/seethrough_local',task,'_review',nextCandidate);
mkdirSync(output,{recursive:true});
async function inspect(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json&review_reload='+nextCandidate+'_pitch_light_test';
  const response=await fetch('http://127.0.0.1:9337/json/new?'+
    encodeURIComponent(url),{method:'PUT'});
  assert.ok(response.ok);
  const page=await response.json(),ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
  let id=0;const pending=new Map();
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(!waiter)return;pending.delete(message.id);
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
      const ctx=stage.getContext('2d');$('neutral').click();
      const hash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
        ctx.getImageData(0,0,1280,1280).data))]
        .map(v=>v.toString(16).padStart(2,'0')).join('');
      const frames=[];
      for(const [yaw,pitch] of [[0,0],[0,50],[0,100],[0,-50],[0,-100],
        [-50,100],[50,-100]]){
        $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
        $('pitch').value=pitch;$('pitch').dispatchEvent(new Event('input'));
        $('face-light').checked=false;$('face-light').dispatchEvent(new Event('change'));
        const off=ctx.getImageData(0,0,1280,1280),offHash=await hash();
        $('face-light').checked=true;$('face-light').dispatchEvent(new Event('change'));
        const on=ctx.getImageData(0,0,1280,1280),onHash=await hash();
        let alphaChanged=0,outsideChanged=0,upperBright=0,upperDark=0,
          lowerBright=0,lowerDark=0,upperDeltaSum=0,lowerDeltaSum=0,
          midDark=0,midDeltaSum=0;
        for(let y=0;y<226;y++)for(let x=510;x<740;x++){
          const i=(y*1280+x)*4;
          if(on.data[i+3]!==off.data[i+3])alphaChanged++;
          const delta=(on.data[i]-off.data[i])+
            (on.data[i+1]-off.data[i+1])+(on.data[i+2]-off.data[i+2]);
          // Forehead/eye region stays protected even when pitch moves the
          // soft bridge boundary a few screen pixels from its source row.
          if(y<95){
            if(delta>0)upperBright++;if(delta<0)upperDark++;
            upperDeltaSum+=delta;
          }
          if(y>155){
            if(delta>0)lowerBright++;if(delta<0)lowerDark++;
            lowerDeltaSum+=delta;
          }
          if(y>=125&&y<=155){if(delta<0)midDark++;midDeltaSum+=delta}
        }
        for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
          if(x>=510&&x<740&&y<226)continue;
          const i=(y*1280+x)*4;
          if(on.data[i]!==off.data[i]||on.data[i+1]!==off.data[i+1]||
            on.data[i+2]!==off.data[i+2]||on.data[i+3]!==off.data[i+3])
            outsideChanged++;
        }
        const crop=document.createElement('canvas');crop.width=640;crop.height=440;
        crop.getContext('2d').drawImage(stage,480,0,320,220,0,0,640,440);
        frames.push({yaw,pitch,offHash,onHash,alphaChanged,outsideChanged,
          upperBright,upperDark,lowerBright,lowerDark,
          upperDeltaSum,lowerDeltaSum,midDark,midDeltaSum,
          image:crop.toDataURL('image/png').split(',')[1]});
      }
      return {candidate:window.__miffyMotion.candidate,frames};
    })()`);
  }finally{
    ws.close();await fetch('http://127.0.0.1:9337/json/close/'+page.id);
  }
}
const old=await inspect(oldCandidate),next=await inspect(nextCandidate);
assert.equal(old.candidate,oldCandidate);
assert.equal(next.candidate,nextCandidate);
for(let i=0;i<next.frames.length;i++){
  const frame=next.frames[i];
  assert.equal(frame.offHash,old.frames[i].offHash,'light-off identity');
  if(frame.yaw===0&&oldCandidate==='motion_v36')
    assert.equal(old.frames[i].offHash,old.frames[i].onHash,
      'v36 yaw-zero light remains inert');
  assert.equal(frame.alphaChanged,0);
  assert.equal(frame.outsideChanged,0);
  if(frame.pitch===0)assert.equal(frame.offHash,frame.onHash);
  if(frame.yaw===0&&frame.pitch>0){
    assert.notEqual(frame.offHash,frame.onHash);
    assert.ok(frame.upperBright>100);
    assert.equal(frame.lowerBright,0);
    assert.equal(frame.lowerDark,0);
  }
  if(frame.yaw===0&&frame.pitch<0){
    assert.notEqual(frame.offHash,frame.onHash);
    assert.ok(frame.lowerDark>100);
    assert.equal(frame.upperBright,0);
    assert.equal(frame.upperDark,0);
  }
  if(nextCandidate==='motion_v38'&&frame.yaw===0&&frame.pitch>0)
    assert.ok(frame.upperDeltaSum>old.frames[i].upperDeltaSum*1.5,
      'upper brightening grows perceptibly versus v37');
  if(nextCandidate==='motion_v38'&&frame.yaw===0&&frame.pitch<0)
    assert.ok(frame.lowerDeltaSum<old.frames[i].lowerDeltaSum*1.5,
      'lower darkening grows perceptibly versus v37');
  if(nextCandidate==='motion_v38'&&frame.yaw===0&&frame.pitch<0)
    assert.ok(frame.midDeltaSum<old.frames[i].midDeltaSum*1.3,
      'corrected bridge boundary expands cheek/nose shading versus v37');
  writeFileSync(resolve(output,`pitch_light_y${frame.yaw}_p${frame.pitch}.png`),
    Buffer.from(frame.image,'base64'));
  delete frame.image;
}
console.log(JSON.stringify(next.frames));
