import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

const url=process.env.MIFFY_SHOWCASE_URL||'http://127.0.0.1:8015/miffy-demo/';
const opened=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(url),{method:'PUT'});
assert.ok(opened.ok,'Chrome CDP tab');
const page=await opened.json();
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;
const pending=new Map();
const failures=[];
const requests=new Map();
ws.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Network.requestWillBeSent')
    requests.set(message.params.requestId,message.params.request.url);
  if(message.method==='Network.loadingFailed'){
    const requestUrl=requests.get(message.params.requestId)||'';
    if(requestUrl.startsWith(url))failures.push(message.params.errorText+' '+requestUrl);
  }
  if(message.method==='Network.responseReceived'&&message.params.response.status>=400&&
     message.params.response.url.startsWith(url)&&!message.params.response.url.endsWith('/favicon.ico'))
    failures.push(message.params.response.status+' '+message.params.response.url);
  if(message.method==='Runtime.exceptionThrown')
    failures.push('JS '+message.params.exceptionDetails.text+' '+
      (message.params.exceptionDetails.exception?.description||''));
  const waiter=pending.get(message.id);
  if(!waiter)return;
  pending.delete(message.id);
  if(message.error||message.result?.exceptionDetails)
    waiter.reject(Error(message.error?.message||message.result.exceptionDetails.text));
  else waiter.resolve(message.result);
};
const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial;pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>(await command('Runtime.evaluate',
  {expression,awaitPromise:true,returnByValue:true})).result.value;

try{
  await command('Network.enable');
  await command('Runtime.enable');
  await new Promise(resolve=>setTimeout(resolve,1800));
  const result=await evaluate(`new Promise(resolve=>{
    const deadline=Date.now()+30000;
    const timer=setInterval(()=>{
      if(window.__miffyMotion?.loaded||Date.now()>deadline||document.querySelector('#error')?.textContent){
        clearInterval(timer);
        const canvas=document.querySelector('#stage');
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let ink=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>20)ink++;
        resolve({loaded:!!window.__miffyMotion?.loaded,candidate:window.__miffyMotion?.candidate,
          neutralMatches:window.__miffyMotion?.neutralMatches,ink,
          error:document.querySelector('#error')?.textContent||'',
          status:document.querySelector('#status')?.textContent||'',
          readyState:document.readyState,
          review:window.__miffyMotion&&{loaded:window.__miffyMotion.loaded,candidate:window.__miffyMotion.candidate},
          armEnabled:!document.querySelector('#arm-sway')?.disabled,
          title:document.querySelector('#candidate-title')?.textContent});
      }
    },100);
  })`);
  console.log('load result',JSON.stringify({result,failures}));
  assert.equal(result.error,'');
  assert.equal(result.loaded,true);
  assert.equal(result.candidate,'motion_v40');
  assert.equal(result.neutralMatches,true);
  assert.ok(result.ink>10000,'visible character pixels');
  assert.equal(result.armEnabled,true);
  assert.match(result.title,/階段展示/);
  const controls=await evaluate(`(()=>{
    document.querySelector('#neutral').click();
    const neutral=document.querySelector('#stage').toDataURL();
    const arm=document.querySelector('#arm-sway');arm.value='100';arm.dispatchEvent(new Event('input'));
    const moved=document.querySelector('#stage').toDataURL();
    document.querySelector('#neutral').click();
    const reset=document.querySelector('#stage').toDataURL();
    return {moved:moved!==neutral,reset:reset===neutral};
  })()`);
  assert.equal(controls.moved,true);
  assert.equal(controls.reset,true);
  const core=await evaluate(`(()=>{
    const canvas=document.querySelector('#stage');
    const neutral=canvas.toDataURL();
    const changed={};
    for(const [id,value] of [['body','60'],['gaze-x','60'],['blink','100']]){
      const input=document.querySelector('#'+id);input.value=value;
      input.dispatchEvent(new Event('input'));
      changed[id]=canvas.toDataURL()!==neutral;
      document.querySelector('#neutral').click();
    }
    return changed;
  })()`);
  assert.ok(core.body&&core['gaze-x']&&core.blink,'body/gaze/blink controls must render');
  await command('Emulation.setDeviceMetricsOverride',
    {width:390,height:844,deviceScaleFactor:1,mobile:true});
  const mobile=await evaluate(`(()=>({
    stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),
    canvas:document.querySelector('#stage').getBoundingClientRect().toJSON(),
    controls:document.querySelector('aside').getBoundingClientRect().toJSON()
  }))()`);
  console.log('mobile layout',JSON.stringify(mobile));
  assert.ok(mobile.canvas.width>=480,'mobile preview retains an enlarged scrollable character');
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync('outputs/ui_review/miffy_v40_public_mobile.png',Buffer.from(shot.data,'base64'));
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({url,result,controls,core,mobile,networkFailures:failures},null,2));
}finally{
  ws.close();
  await fetch('http://127.0.0.1:9337/json/close/'+page.id).catch(()=>{});
}
