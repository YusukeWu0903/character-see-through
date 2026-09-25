import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

mkdirSync('outputs/ui_review',{recursive:true});

const host='http://127.0.0.1:8014';
const task='Miffy_full_body_casual_rb_20260924_012138';
async function inspect(path,width,height,ready){
  console.log('opening',width,path);
  const response=await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(host+path),{method:'PUT'});
  assert.ok(response.ok,'browser tab creation failed');
  const target=await response.json();
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let serial=0;const pending=new Map();
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(!waiter)return;pending.delete(message.id);
    if(message.error||message.result?.exceptionDetails)
      waiter.reject(Error(message.error?.message||JSON.stringify(message.result?.exceptionDetails)));
    else waiter.resolve(message.result?.result?.value??message.result);
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=expression=>call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  try{
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    const loaded=await evaluate(`new Promise(resolve=>{const until=Date.now()+30000;const timer=setInterval(()=>{if(${ready}){clearInterval(timer);resolve(true)}else if(Date.now()>until){clearInterval(timer);resolve(false)}},100)})`);
    if(!loaded)throw Error(JSON.stringify(await evaluate(`({status:document.querySelector('#status')?.textContent,error:document.querySelector('#error')?.textContent,readyState:document.readyState})`)));
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const result=await evaluate(`(()=>{
      const canvas=document.querySelector('#stage'),stage=document.querySelector('.stage');
      const bounds=canvas.getBoundingClientRect(),box=stage?.getBoundingClientRect();
      let inkBounds=null,glStatus=null;
      if(!stage){
        const gl=canvas.getContext('webgl'),pixels=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let maxAlpha=0,maxRgb=0;
        for(let i=0;i<pixels.length;i+=4){maxAlpha=Math.max(maxAlpha,pixels[i+3]);maxRgb=Math.max(maxRgb,pixels[i],pixels[i+1],pixels[i+2]);}
        glStatus={error:gl.getError(),lost:gl.isContextLost(),canvasDataLength:canvas.toDataURL().length,maxAlpha,maxRgb};
        let left=canvas.width,right=-1,top=canvas.height,bottom=-1;
        for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2){
          if(pixels[(y*canvas.width+x)*4+3]<8)continue;
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        inkBounds=right>=0?[left,top,right,bottom]:null;
      }
      return {viewport:[innerWidth,innerHeight],canvas:[Math.round(bounds.width),Math.round(bounds.height)],
        stage:box?[Math.round(box.width),Math.round(box.height)]:null,
        inkBounds,glStatus,
        groups:[...document.querySelectorAll('summary')].map(el=>el.textContent.trim()),
        active:[...document.querySelectorAll('#panel-motion input:not([disabled])')].map(el=>el.id),
        breathHidden:document.querySelector('#breath')?.closest('.row')?.hidden,
        unavailableVisible:[...document.querySelectorAll('#panel-motion input:disabled')].filter(el=>el.getBoundingClientRect().width>0).map(el=>el.id),
        status:document.querySelector('#status')?.textContent?.slice(0,80),
        panelToggle:getComputedStyle(document.querySelector('#panelToggle')||document.querySelector('.tabs')).display,
        compareVisible:document.querySelector('#compare')?.getBoundingClientRect().width||0,
        neutralMatches:window.__miffyMotion?.neutralMatches};
    })()`);
    const shot=await call('Page.captureScreenshot',{format:'jpeg',quality:58,captureBeyondViewport:false});
    writeFileSync('outputs/ui_review/'+(path.includes('assembly-motion')?'miffy':'eris')+'_'+width+'.jpg',Buffer.from(shot.data,'base64'));
    return result;
  }finally{
    ws.close();await fetch('http://127.0.0.1:9337/json/close/'+target.id).catch(()=>{});
  }
}

for(const [width,height] of [[1440,900],[390,844]]){
  const miffy=await inspect('/viewer-assets/assembly-motion.html?local='+task+
    '&rig=_review/motion_v38/rig.json&review_reload=panel_fit',width,height,'window.__miffyMotion?.loaded');
  assert.equal(miffy.neutralMatches,true);
  assert.equal(miffy.breathHidden,true);
  assert.ok(miffy.active.includes('bust')&&miffy.active.includes('blink')&&miffy.active.includes('pitch'));
  assert.deepEqual(miffy.unavailableVisible,[]);
  assert.ok(miffy.canvas[0]>=(width<600?480:780),'full-body preview should fill available space');
  const eris=await inspect('/viewer-assets/deform.html?local=Eris_full_body_casual_20260918_113905',
    width,height,"document.querySelector('#status')?.textContent?.includes('已載入')");
  console.log('eris diagnostic',JSON.stringify(eris));
  assert.equal(eris.compareVisible,0);
  assert.ok(eris.inkBounds,'Eris must render as a visible single character');
  assert.ok(eris.groups.includes('姿勢與動態')&&eris.groups.includes('角色校正'));
  if(width<600)assert.notEqual(eris.panelToggle,'none');
  console.log(JSON.stringify({width,miffy,eris}));
}
