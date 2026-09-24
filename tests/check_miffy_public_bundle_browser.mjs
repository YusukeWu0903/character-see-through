import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:8015/miffy-demo/';
const screenshotPath = process.argv[3];
const response = await fetch('http://127.0.0.1:9337/json/new?' + encodeURIComponent(url),
  {method: 'PUT'});
assert.ok(response.ok, 'Chrome CDP must be available on :9337');
const page = await response.json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
const failed = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400)
    failed.push(`${message.params.response.status} ${message.params.response.url}`);
  if (message.method === 'Network.loadingFailed')
    failed.push(`${message.params.errorText} ${message.params.requestId}`);
  const waiting = pending.get(message.id);
  if (!waiting) return;
  pending.delete(message.id);
  if (message.error || message.result?.exceptionDetails)
    waiting.reject(Error(message.error?.message || message.result.exceptionDetails.text));
  else waiting.resolve(message.result?.result?.value);
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id;
  pending.set(key, {resolve, reject});
  socket.send(JSON.stringify({id: key, method, params}));
});
const evaluate = expression => call('Runtime.evaluate',
  {expression, awaitPromise: true, returnByValue: true});
try {
  await call('Network.enable');
  let pageReady = false;
  for (let attempt = 0; attempt < 40 && !pageReady; attempt++) {
    try { pageReady = await evaluate('document.readyState !== "loading" && !!document.querySelector("#stage")'); }
    catch (error) { if (!/context was destroyed|Cannot find context/i.test(error.message)) throw error; }
    if (!pageReady) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(pageReady, 'Miffy page did not become ready');
  try { await evaluate(`new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{
    const error=document.querySelector('#error')?.textContent;
    if(window.__miffyMotion?.loaded){clearInterval(timer);resolve(true)}
    else if(error||Date.now()-started>30000){clearInterval(timer);reject(Error(error||'load timeout'))}
  },100)})`); }
  catch (error) {
    const diagnostic = await evaluate(`({url:location.href,ready:document.readyState,
      status:document.querySelector('#status')?.textContent,
      error:document.querySelector('#error')?.textContent,
      review:window.__miffyMotion, scripts:[...document.scripts].map(s=>s.src)})`);
    throw Error(`${error.message}\n${JSON.stringify({diagnostic,failed},null,2)}`);
  }
  const result = await evaluate(`(()=>{
    const state=window.__miffyMotion;
    const canvas=document.querySelector('#stage');
    const context=canvas.getContext('2d');
    const alpha=context.getImageData(0,0,canvas.width,canvas.height).data;
    let painted=0;for(let i=3;i<alpha.length;i+=4)if(alpha[i]>0)painted++;
    const set=(id,value)=>{const input=document.getElementById(id);input.value=value;
      input.dispatchEvent(new Event('input',{bubbles:true}))};
    document.querySelector('#paused').click();
    document.querySelector('#auto').checked=false;
    document.querySelector('#follow').checked=false;
    document.querySelector('#auto-blink').checked=false;
    document.querySelector('#gaze-follow').checked=false;
    document.querySelector('#neutral').click();
    const neutral=context.getImageData(555,85,145,130).data;
    set('blink',100);
    const blink=context.getImageData(555,85,145,130).data;
    let blinkDifference=0;for(let i=0;i<neutral.length;i++)if(neutral[i]!==blink[i])blinkDifference++;
    set('blink',0);set('gaze-x',70);
    const gaze=context.getImageData(555,85,145,130).data;
    let gazeDifference=0;for(let i=0;i<neutral.length;i++)if(neutral[i]!==gaze[i])gazeDifference++;
    document.querySelector('#defaults').click();
    return {task:state.task,candidate:state.candidate,neutralMatches:state.neutralMatches,
      painted,blinkDifference,gazeDifference,bustEnabled:!document.querySelector('#bust').disabled,
      bustDefault:document.querySelector('#bust').value,
      title:document.title,status:document.querySelector('#status').textContent};
  })()`);
  assert.equal(result.candidate, 'motion_v21');
  assert.equal(result.neutralMatches, true);
  assert.ok(result.painted > 100000, `Only ${result.painted} painted pixels`);
  assert.ok(result.blinkDifference > 0, 'Blink did not change face pixels');
  assert.ok(result.gazeDifference > 0, 'Gaze did not change face pixels');
  assert.equal(result.bustEnabled, true);
  assert.equal(Number(result.bustDefault), 50);
  assert.ok(result.title.includes('Miffy'));
  assert.deepEqual(failed, []);
  if (screenshotPath) {
    const dataUrl = await evaluate("document.querySelector('#stage').toDataURL('image/png')");
    await writeFile(screenshotPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  console.log(JSON.stringify({url, ...result, failed}, null, 2));
} finally {
  socket.close();
  await fetch('http://127.0.0.1:9337/json/close/' + page.id).catch(() => {});
}
