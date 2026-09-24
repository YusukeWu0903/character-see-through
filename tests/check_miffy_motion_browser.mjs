// Browser check for the task-scoped, non-production Miffy motion candidate.
// Requires a local viewer on port 8014 and Chrome CDP on port 9337.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const task = 'Miffy_full_body_casual_rb_20260924_012138';
const output=resolve('outputs/seethrough_local',task,'_review/motion_v3');
const url = 'http://127.0.0.1:8014/viewer-assets/assembly-motion.html?local=' + task +
  '&rig=_review/motion_v3/rig.json';
const target = await fetch('http://127.0.0.1:9337/json/new?' + encodeURIComponent(url),{method:'PUT'});
if (!target.ok) throw Error('Cannot open Chrome test tab');
const page = await target.json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,fail) => {ws.onopen=ok;ws.onerror=fail;});
let nextId=1;
const pending=new Map();
ws.onmessage=event => {
  const data=JSON.parse(event.data);
  if (!data.id || !pending.has(data.id)) return;
  const {ok,fail}=pending.get(data.id);
  pending.delete(data.id);
  if (data.error) fail(Error(data.error.message)); else ok(data.result);
};
function command(method,params={}) {
  const id=nextId++;
  return new Promise((ok,fail) => {
    pending.set(id,{ok,fail});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const state=await evaluate(`new Promise((resolve,reject) => {
  const started=Date.now();
  const timer=setInterval(() => {
    if (window.__miffyMotion?.loaded) {
      clearInterval(timer);
      resolve({loaded:true,neutralMatches:window.__miffyMotion.neutralMatches,status:document.querySelector('#status').textContent});
    } else if (document.querySelector('#error').textContent || Date.now()-started>30000) {
      clearInterval(timer);
      reject(Error(document.querySelector('#error').textContent || 'load timeout'));
    }
  },100);
})`);
assert.equal(state.neutralMatches,true);
assert.equal(await evaluate("window.__miffyMotion.candidate"),'motion_v3');
const panelShot=await command('Page.captureScreenshot',{format:'png'});
writeFileSync(resolve(output,'panel.png'),Buffer.from(panelShot.data,'base64'));
const neutral=await evaluate(`(() => {
  document.querySelector('#neutral').click();
  return document.querySelector('#stage').toDataURL();
})()`);
const sample=async values => evaluate(`(() => {
  const values=${JSON.stringify(values)};
  for(const [id,value] of Object.entries(values)){
    const input=document.getElementById(id);
    input.value=String(value);
    input.dispatchEvent(new Event('input'));
  }
  return document.querySelector('#stage').toDataURL();
})()`);
const positive=await sample({body:100,torso:100,head:100,hair:0});
const soleCenters=()=>evaluate(`(() => {
  const canvas=document.querySelector('#stage');
  const image=canvas.getContext('2d').getImageData(0,1230,1280,34);
  const sum=[0,0],count=[0,0];
  for(let y=0;y<34;y++)for(let x=0;x<1280;x++){
    if(image.data[(y*1280+x)*4+3]>200){
      const side=x<630?0:1;sum[side]+=x;count[side]++;
    }
  }
  return sum.map((value,side)=>value/count[side]);
})()`);
const positiveSoles=await soleCenters();
const negative=await sample({body:-100,torso:-100,head:-100,hair:0});
const negativeSoles=await soleCenters();
assert.notEqual(positive,neutral);
assert.notEqual(negative,neutral);
assert.notEqual(positive,negative);
const soleDeltas=positiveSoles.map((value,i)=>Math.abs(value-negativeSoles[i]));
assert.ok(soleDeltas.every(delta=>delta<2),
  'both foot soles must stay planted across body extrema');
for(const [name,data] of [['neutral',neutral],['positive',positive],['negative',negative]]) {
  writeFileSync(resolve(output,'preview_'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));
}
const pausedStable=await evaluate(`new Promise(resolve => {
  const before=document.querySelector('#stage').toDataURL();
  setTimeout(() => resolve(before===document.querySelector('#stage').toDataURL()),250);
})`);
assert.equal(pausedStable,true);
const animated=await evaluate(`new Promise(resolve => {
  document.querySelector('#defaults').click();
  const before=document.querySelector('#stage').toDataURL();
  setTimeout(() => resolve(before!==document.querySelector('#stage').toDataURL()),700);
})`);
assert.equal(animated,true);
const cycle=await evaluate(`new Promise(resolve => {
  let min=Infinity,max=-Infinity;
  const started=performance.now();
  const timer=setInterval(() => {
    const angle=window.__miffyMotion.currentPose?.bodyDegrees;
    if(Number.isFinite(angle)){min=Math.min(min,angle);max=Math.max(max,angle)}
    if(performance.now()-started>4900){clearInterval(timer);resolve({min,max})}
  },80);
})`);
const defaultHeadTravelCss=(1264-100)*
  (Math.tan(cycle.max*Math.PI/180)-Math.tan(cycle.min*Math.PI/180))*.55;
assert.ok(defaultHeadTravelCss>20,'default upper-body sway must be visible at 55% zoom');
const tabCount=await evaluate(`(() => {
  document.querySelector('[data-tab="layers"]').click();
  return {tabs:document.querySelectorAll('.tab').length,layers:document.querySelectorAll('.layer-row').length};
})()`);
assert.deepEqual(tabCount,{tabs:3,layers:17});
const hiddenLayer=await evaluate(`(() => {
  const box=document.querySelector('.layer-row input[type="checkbox"]');
  box.checked=false;box.dispatchEvent(new Event('change'));
  return box.checked;
})()`);
assert.equal(hiddenLayer,false);
const settings=await evaluate(`(() => {
  document.querySelector('[data-tab="calibrate"]').click();
  return {headLimit:document.querySelector('#head-limit').value,
    exportButton:!!document.querySelector('#export'),
    importInput:!!document.querySelector('#import')};
})()`);
assert.equal(settings.headLimit,'1');
assert.equal(settings.exportButton,true);
assert.equal(settings.importInput,true);
const calibration=await evaluate(`(() => {
  const limit=document.querySelector('#head-limit');
  limit.value='1.5';limit.dispatchEvent(new Event('input'));
  document.querySelector('#save').click();
  const key=Object.keys(localStorage).find(key=>key.includes('miffy-motion:')&&key.includes('motion_v3'));
  const saved=JSON.parse(localStorage.getItem(key));
  document.querySelector('#reset-rig').click();
  return {savedLimit:saved.headLimit,resetLimit:document.querySelector('#head-limit').value,
    cleared:localStorage.getItem(key)===null};
})()`);
assert.deepEqual(calibration,{savedLimit:1.5,resetLimit:'1',cleared:true});
const views=await evaluate(`(() => {
  document.querySelector('[data-tab="motion"]').click();
  const input=document.querySelector('#view');
  input.value='upper';input.dispatchEvent(new Event('change'));
  const upper=document.querySelector('#zoom').value;
  input.value='face';input.dispatchEvent(new Event('change'));
  const face=document.querySelector('#zoom').value;
  document.querySelector('#defaults').click();
  return {upper,face,reset:document.querySelector('#view').value};
})()`);
assert.deepEqual(views,{upper:'105',face:'190',reset:'full'});
const follow=await evaluate(`(() => {
  document.querySelector('#paused').checked=true;
  document.querySelector('#auto').checked=false;
  document.querySelector('#follow').checked=true;
  const canvas=document.querySelector('#stage');
  const rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+1,clientY:rect.top+10}));
  const left=window.__miffyMotion.currentPose.bodyDegrees;
  canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.right-1,clientY:rect.top+10}));
  const right=window.__miffyMotion.currentPose.bodyDegrees;
  canvas.dispatchEvent(new PointerEvent('pointerleave'));
  return {left,right};
})()`);
assert.ok(Math.abs(follow.left-follow.right)>.7,'pointer follow must move body');
console.log(JSON.stringify({task,neutralMatches:true,positiveMoved:true,negativeMoved:true,
  soleExtremeDeltaPx:soleDeltas.map(value=>Math.round(value*100)/100),
  defaultHeadTravelCssPx:Math.round(defaultHeadTravelCss),
  pausedStable:true,animated:true,panelTabs:tabCount.tabs,layerToggles:tabCount.layers,
  settingsSavedAndReset:true,viewsTested:true,pointerFollow:true,
  previews:3,visualAcceptance:'pending'},null,2));
ws.close();
