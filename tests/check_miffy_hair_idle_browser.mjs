import assert from 'node:assert/strict';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v32';
const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
  '&rig=_review/'+candidate+'/rig.json&review_reload=hair_idle_check';
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
    const $=id=>document.getElementById(id),sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
    const sample=()=>({mode:window.__miffyMotion.hairState.mode,
      mix:window.__miffyMotion.hairState.idleMix,
      target:{...window.__miffyMotion.hairState.targets},
      drive:{...window.__miffyMotion.hairFollow}});
    $('neutral').click();
    $('hair').value=55;$('hair').dispatchEvent(new Event('input'));
    $('auto').checked=true;$('auto').dispatchEvent(new Event('change'));
    $('yaw').value=50;$('yaw').dispatchEvent(new Event('input'));
    $('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
    await sleep(140);
    const turning=sample();
    await sleep(1200);
    const idleA=sample();
    await sleep(620);
    const idleB=sample();
    $('yaw').value=-50;$('yaw').dispatchEvent(new Event('input'));
    await sleep(140);
    const reversing=sample();
    await sleep(1100);
    const reverseIdle=sample();
    $('auto').checked=false;$('auto').dispatchEvent(new Event('change'));
    await sleep(1600);
    const held=sample();
    return {turning,idleA,idleB,reversing,reverseIdle,held,
      candidate:window.__miffyMotion.candidate,
      neutralMatches:window.__miffyMotion.neutralMatches};
  })()`);
  assert.equal(result.candidate,candidate);
  assert.equal(result.neutralMatches,true);
  assert.equal(result.turning.mode,'turn');
  assert.equal(result.turning.mix,0);
  assert.equal(result.idleA.mode,'idle');
  assert.equal(result.idleB.mode,'idle');
  assert.ok(result.idleB.mix>.8);
  assert.ok(Math.abs(result.idleA.drive.fronthair-.5)<.25);
  assert.ok(Math.abs(result.idleB.drive.fronthair-.5)<.25);
  assert.ok(Math.abs(result.idleA.target.fronthair-result.idleB.target.fronthair)>.005);
  assert.equal(result.reversing.mode,'turn');
  assert.equal(result.reversing.mix,0);
  assert.equal(result.reverseIdle.mode,'idle');
  assert.ok(Math.abs(result.reverseIdle.drive.fronthair+.5)<.25);
  assert.equal(result.held.mode,'held');
  assert.ok(Math.abs(result.held.target.fronthair+.5)<.005);
  assert.ok(Math.abs(result.held.drive.fronthair+.5)<.03);
  console.log(JSON.stringify(result,null,2));
}finally{
  ws.close();
  await fetch('http://127.0.0.1:9337/json/close/'+page.id);
}
