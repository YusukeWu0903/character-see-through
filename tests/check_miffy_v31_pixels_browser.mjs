import assert from 'node:assert/strict';

const task='Miffy_full_body_casual_rb_20260924_012138';
async function open(candidate){
  const url='http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/'+candidate+'/rig.json&compare='+Date.now();
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
  await evaluate(`new Promise((ok,bad)=>{const t=Date.now(),i=setInterval(()=>{
    if(window.__miffyMotion?.loaded){clearInterval(i);ok(true)}
    else if(document.querySelector('#error').textContent||Date.now()-t>30000){
      clearInterval(i);bad(Error(document.querySelector('#error').textContent||'timeout'))}
  },100)})`);
  return {page,ws,evaluate};
}
async function close(browser){
  browser.ws.close();
  await fetch('http://127.0.0.1:9337/json/close/'+browser.page.id);
}
const poses=[[-100,0],[-50,0],[0,0],[50,0],[100,0],[-100,100],[100,-100]];
let browser=await open('motion_v30');
try{
  await browser.evaluate(`(()=>{
    const $=id=>document.getElementById(id);$('neutral').click();
    $('face-light').checked=true;$('face-light-strength').value=75;
    return true})()`);
  for(const [yaw,roll] of poses){
    await browser.evaluate(`(()=>{
      const $=id=>document.getElementById(id);
      $('head-roll').value=${roll};$('head-roll').dispatchEvent(new Event('input'));
      $('yaw').value=${yaw};$('yaw').dispatchEvent(new Event('input'));
      const crop=document.createElement('canvas');crop.width=400;crop.height=550;
      crop.getContext('2d').drawImage($('stage'),450,0,400,550,0,0,400,550);
      localStorage.setItem('miffy-v30-pixels:${yaw}:${roll}',crop.toDataURL());
      return true})()`);
  }
}finally{await close(browser)}
browser=await open('motion_v31');
try{
  await browser.evaluate(`(()=>{
    const $=id=>document.getElementById(id);$('neutral').click();
    $('face-light').checked=true;$('face-light-strength').value=75;
    return true})()`);
  const results=[];
  for(const [yaw,roll] of poses){
    const comparison=await browser.evaluate(`(async()=>{
      const $=id=>document.getElementById(id);
      $('head-roll').value=${roll};$('head-roll').dispatchEvent(new Event('input'));
      $('yaw').value=${yaw};$('yaw').dispatchEvent(new Event('input'));
      const crop=document.createElement('canvas');crop.width=400;crop.height=550;
      crop.getContext('2d').drawImage($('stage'),450,0,400,550,0,0,400,550);
      const original=new Image();
      original.src=localStorage.getItem('miffy-v30-pixels:${yaw}:${roll}');
      await original.decode();
      const ref=document.createElement('canvas');ref.width=400;ref.height=550;
      ref.getContext('2d').drawImage(original,0,0);
      const a=ref.getContext('2d').getImageData(0,0,400,550).data;
      const b=crop.getContext('2d').getImageData(0,0,400,550).data;
      let different=0,changedAlpha=0,max=0,total=0;
      for(let i=0;i<a.length;i+=4){
        const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),
          Math.abs(a[i+2]-b[i+2]),Math.abs(a[i+3]-b[i+3]));
        if(d)different++;
        if(a[i+3]!==b[i+3])changedAlpha++;
        max=Math.max(max,d);total+=d;
      }
      return {yaw:${yaw},roll:${roll},different,changedAlpha,max,
        mean:total/(400*550)};
    })()`);
    results.push(comparison);
  }
  console.log(JSON.stringify(results,null,2));
  assert.equal(results.find(item=>item.yaw===0&&item.roll===0).different,0);
  for(const item of results){
    assert.ok(item.different<1500);
    assert.ok(item.changedAlpha<=3);
    assert.ok(item.max<=15);
    assert.ok(item.mean<.01);
  }
}finally{
  await browser.evaluate(`(()=>{
    for(const [yaw,roll] of ${JSON.stringify(poses)})
      localStorage.removeItem('miffy-v30-pixels:'+yaw+':'+roll);
    return true})()`);
  await close(browser);
}
