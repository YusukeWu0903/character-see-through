import assert from 'node:assert/strict';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v30';
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/'+candidate+'/rig.json';
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
  const result=await evaluate(`(async()=>{
    const $=id=>document.getElementById(id),stage=$('stage'),ctx=stage.getContext('2d');
    $('neutral').click();
    const hash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
      ctx.getImageData(0,0,stage.width,stage.height).data))].
      map(x=>x.toString(16).padStart(2,'0')).join('');
    const neutral=await hash(),frames=[];
    for(const [roll,yaw] of [[-100,0],[100,0],[0,-100],[0,100],
      [-100,-100],[100,100]]){
      $('head-roll').value=roll;$('head-roll').dispatchEvent(new Event('input'));
      $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
      frames.push({roll,yaw,hash:await hash()});
    }
    $('head-roll').value=0;$('head-roll').dispatchEvent(new Event('input'));
    $('yaw').value=0;$('yaw').dispatchEvent(new Event('input'));
    const reset=await hash();
    $('yaw').value=100;$('yaw').dispatchEvent(new Event('input'));
    const guideOff=await hash();
    $('show-neck-follow').checked=true;
    $('show-neck-follow').dispatchEvent(new Event('change'));
    $('show-hair-follow').checked=true;
    $('show-hair-follow').dispatchEvent(new Event('change'));
    const guideOn=await hash();
    $('show-neck-follow').checked=false;
    $('show-neck-follow').dispatchEvent(new Event('change'));
    $('show-hair-follow').checked=false;
    $('show-hair-follow').dispatchEvent(new Event('change'));
    const guideRestored=await hash();
    $('yaw').value=0;$('yaw').dispatchEvent(new Event('input'));
    return {loaded:window.__miffyMotion.loaded,
      neutralMatches:window.__miffyMotion.neutralMatches,
      candidate:window.__miffyMotion.candidate,
      neckEnabled:!$('show-neck-follow').disabled,
      hairEnabled:!$('show-hair-follow').disabled,
      guidesDefaultOff:!$('show-neck-follow').checked&&!$('show-hair-follow').checked,
      neutral,reset,guideOff,guideOn,guideRestored,frames};
  })()`);
  assert.equal(result.candidate,candidate);
  assert.equal(result.neutralMatches,true);
  assert.equal(result.neckEnabled,true);
  assert.equal(result.hairEnabled,true);
  assert.equal(result.guidesDefaultOff,true);
  assert.equal(result.neutral,result.reset);
  assert.notEqual(result.guideOff,result.guideOn);
  assert.equal(result.guideOff,result.guideRestored);
  for(const frame of result.frames)assert.notEqual(frame.hash,result.neutral);
  const spring=await evaluate(`(async()=>{
    const $=id=>document.getElementById(id);
    $('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
    $('yaw').value=100;$('yaw').dispatchEvent(new Event('input'));
    await new Promise(ok=>setTimeout(ok,1200));
    const positive={...window.__miffyMotion.hairFollow};
    $('yaw').value=-100;$('yaw').dispatchEvent(new Event('input'));
    await new Promise(ok=>setTimeout(ok,1200));
    const negative={...window.__miffyMotion.hairFollow};
    return {positive,negative};
  })()`);
  for(const name of ['fronthair','backhair']){
    assert.ok(spring.positive[name]>.85);
    assert.ok(spring.negative[name]<-.85);
  }
  console.log(JSON.stringify(result,null,2));
  console.log(JSON.stringify(spring,null,2));
}finally{
  ws.close();
  await fetch('http://127.0.0.1:9337/json/close/'+page.id);
}
