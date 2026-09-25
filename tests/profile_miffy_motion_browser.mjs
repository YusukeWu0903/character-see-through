// Read-only local diagnostic. Requires the :8014 viewer and Chrome CDP :9337.
import assert from 'node:assert/strict';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidates=process.argv.slice(2).length?process.argv.slice(2):
  ['motion_v29','motion_v30'];
for(const candidate of candidates){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json&profile='+Date.now();
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
    else waiter.resolve(message.result);
  };
  const send=(method,params={})=>new Promise((ok,bad)=>{
    const key=++id;pending.set(key,{resolve:ok,reject:bad});
    ws.send(JSON.stringify({id:key,method,params}));
  });
  const evalPage=async expression=>(await send('Runtime.evaluate',
    {expression,awaitPromise:true,returnByValue:true})).result.value;
  try{
    await send('Page.bringToFront');
    await evalPage(`new Promise((ok,bad)=>{const t=Date.now(),i=setInterval(()=>{
      if(window.__miffyMotion?.loaded){clearInterval(i);ok(true)}
      else if(document.querySelector('#error').textContent||Date.now()-t>30000){
        clearInterval(i);bad(Error(document.querySelector('#error').textContent||'timeout'))}
    },100)})`);
    const poses=[];
    for(const yaw of [0,100]){
      const result=await evalPage(`(async()=>{
        const $=id=>document.getElementById(id);
        $('auto').checked=true;$('follow').checked=false;
        $('hair').value=0;$('hair').dispatchEvent(new Event('input'));
        $('auto-blink').checked=false;$('gaze-follow').checked=false;
        $('bust').value=0;$('bust').dispatchEvent(new Event('input'));
        $('yaw').value=${yaw};$('yaw').dispatchEvent(new Event('input'));
        $('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
        await new Promise(ok=>setTimeout(ok,500));
        const start=performance.now(),count=window.__miffyMotion.drawCount;
        await new Promise(ok=>setTimeout(ok,2500));
        const seconds=(performance.now()-start)/1000;
        return {yaw:${yaw},frames:window.__miffyMotion.drawCount-count,
          seconds,fps:(window.__miffyMotion.drawCount-count)/seconds};
      })()`);
      poses.push(result);
    }
    const scrub=await evalPage(`(()=>{
      const $=id=>document.getElementById(id);
      $('paused').checked=true;$('paused').dispatchEvent(new Event('change'));
      const samples=[];
      for(let yaw=-100;yaw<=100;yaw+=10){
        const start=performance.now();
        $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
        samples.push(performance.now()-start);
      }
      return {meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,
        maxMs:Math.max(...samples),samples};
    })()`);
    const activeDrag=await evalPage(`(async()=>{
      const $=id=>document.getElementById(id);
      $('paused').checked=false;$('paused').dispatchEvent(new Event('change'));
      const start=performance.now(),before=window.__miffyMotion.drawCount;
      const eventMs=[];
      for(let i=0;i<=20;i++){
        $('yaw').value=-100+i*10;
        const t=performance.now();
        $('yaw').dispatchEvent(new Event('input'));
        eventMs.push(performance.now()-t);
        await new Promise(ok=>setTimeout(ok,10));
      }
      await new Promise(ok=>setTimeout(ok,1800));
      return {meanInputMs:eventMs.reduce((a,b)=>a+b,0)/eventMs.length,
        maxInputMs:Math.max(...eventMs),
        renderedFrames:window.__miffyMotion.drawCount-before,
        seconds:(performance.now()-start)/1000,
        finalYaw:window.__miffyMotion.currentPose?.yaw,
        sliderYaw:Number($('yaw').value)/100,
        auto:$('auto').checked,paused:$('paused').checked,
        viewerError:$('error').textContent};
    })()`);
    await send('Profiler.enable');
    await send('Profiler.start');
    await evalPage(`(()=>{const $=id=>document.getElementById(id);
      for(let yaw=100;yaw>=-100;yaw-=5){
        $('yaw').value=yaw;$('yaw').dispatchEvent(new Event('input'));
      }return true})()`);
    const profile=(await send('Profiler.stop')).profile;
    const names=new Map(profile.nodes.map(node=>[node.id,node.callFrame.functionName]));
    const counts=new Map();
    for(const sample of profile.samples||[]){
      const name=names.get(sample)||'(unknown)';
      counts.set(name,(counts.get(name)||0)+1);
    }
    console.log(JSON.stringify({candidate,poses,scrub,activeDrag,
      topSamples:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,15)},null,2));
  }finally{
    ws.close();
    await fetch('http://127.0.0.1:9337/json/close/'+page.id);
  }
}
