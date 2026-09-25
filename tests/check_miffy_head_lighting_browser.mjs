// Local viewer :8014 and Chrome CDP :9337.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v27';
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/'+candidate+'/rig.json';
const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),
  {method:'PUT'});
assert.ok(response.ok);
const page=await response.json(),ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
let id=0;const pending=new Map();
ws.onmessage=event=>{
  const result=JSON.parse(event.data),waiter=pending.get(result.id);
  if(!waiter)return;pending.delete(result.id);
  if(result.error||result.result?.exceptionDetails)
    waiter.reject(Error(result.error?.message||result.result.exceptionDetails.text));
  else waiter.resolve(result.result.result.value);
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
  const result=await evaluate(`(async()=>{
    const $=id=>document.getElementById(id),stage=$('stage'),ctx=stage.getContext('2d');
    $('neutral').click();
    const hash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
      ctx.getImageData(0,0,stage.width,stage.height).data))].
      map(x=>x.toString(16).padStart(2,'0')).join('');
    const neutral=await hash(),frames=[];
    for(const yaw of [-100,-50,50,100]){
      $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
      $('face-light').checked=false;$('face-light').dispatchEvent(new Event('change'));
      const off=ctx.getImageData(0,0,stage.width,stage.height),offHash=await hash();
      $('face-light').checked=true;$('face-light').dispatchEvent(new Event('change'));
      const on=ctx.getImageData(0,0,stage.width,stage.height),onHash=await hash();
      let changed=0,changedAlpha=0,changedOutside=0;
      let upperBrightPixels=0,lowerBrightPixels=0,lowerDarkPixels=0;
      const cheek={left:{sum:0,n:0},right:{sum:0,n:0}};
      for(let y=0;y<stage.height;y++)for(let x=0;x<stage.width;x++){
        const i=(y*stage.width+x)*4;
        const side=y>=140&&y<170&&x>=578&&x<608?'left':
          y>=140&&y<170&&x>=642&&x<672?'right':null;
        if(side&&off.data[i+3]>230&&off.data[i]>190&&
           off.data[i+1]>150&&off.data[i+2]>140){
          cheek[side].sum+=((on.data[i]-off.data[i])+
            (on.data[i+1]-off.data[i+1])+
            (on.data[i+2]-off.data[i+2]))/3;
          cheek[side].n++;
        }
        if(on.data[i+3]!==off.data[i+3])changedAlpha++;
        if(off.data[i+3]>230&&x>=510&&x<740){
          const brightness=(on.data[i]-off.data[i])+
            (on.data[i+1]-off.data[i+1])+(on.data[i+2]-off.data[i+2]);
          if(y<139&&brightness>0)upperBrightPixels++;
          if(y>=165&&brightness>0)lowerBrightPixels++;
          if(y>=165&&brightness<0)lowerDarkPixels++;
        }
        if(on.data[i]===off.data[i]&&on.data[i+1]===off.data[i+1]&&
           on.data[i+2]===off.data[i+2])continue;
        changed++;
        if(x<510||x>=740||y>=226)changedOutside++;
      }
      const crop=document.createElement('canvas');crop.width=640;crop.height=440;
      crop.getContext('2d').drawImage(stage,480,0,320,220,0,0,640,440);
      frames.push({yaw,offHash,onHash,changed,changedAlpha,changedOutside,
        upperBrightPixels,lowerBrightPixels,lowerDarkPixels,
        cheekMean:{left:cheek.left.sum/cheek.left.n,
          right:cheek.right.sum/cheek.right.n},
        image:crop.toDataURL('image/png').split(',')[1]});
    }
    $('yaw').value=0;$('yaw').dispatchEvent(new Event('input'));
    const neutralWithLight=await hash();
    $('yaw').value=50;$('yaw').dispatchEvent(new Event('input'));
    for(const [id,value] of [['blink',100],['gaze-x',50],['head-roll',60]]){
      $(id).value=value;$(id).dispatchEvent(new Event('input'));
    }
    const combinedHash=await hash();
    return {candidate:window.__miffyMotion.candidate,
      controlsEnabled:!$('face-light').disabled&&!$('face-light-strength').disabled,
      neutral,neutralWithLight,combinedHash,frames};
  })()`);
  assert.equal(result.candidate,candidate);
  assert.equal(result.controlsEnabled,true);
  assert.equal(result.neutral,result.neutralWithLight);
  assert.ok(result.combinedHash);
  for(const frame of result.frames){
    assert.notEqual(frame.onHash,frame.offHash);
    assert.ok(frame.changed>100);
    assert.equal(frame.changedAlpha,0);
    assert.equal(frame.changedOutside,0);
    if(['motion_v28','motion_v29'].includes(candidate)){
      assert.ok(frame.yaw<0?frame.cheekMean.left<0:frame.cheekMean.left>0);
      if(candidate==='motion_v28')
        assert.ok(frame.yaw<0?frame.cheekMean.right>0:frame.cheekMean.right<0);
    }
    if(candidate==='motion_v29'){
      assert.ok(frame.upperBrightPixels>50);
      assert.equal(frame.lowerBrightPixels,0);
      assert.ok(frame.lowerDarkPixels>0);
    }
  }
  const output=resolve('outputs/seethrough_local',task,'_review',candidate);
  mkdirSync(output,{recursive:true});
  for(const frame of result.frames){
    writeFileSync(resolve(output,`face_${frame.yaw}.png`),
      Buffer.from(frame.image,'base64'));
    delete frame.image;
  }
  console.log(JSON.stringify(result));
}finally{
  ws.close();
  await fetch('http://127.0.0.1:9337/json/close/'+page.id);
}
