// Requires Playwright (or NODE_PATH pointing to an existing installation).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const out=path.resolve(__dirname,'../outputs/rig_validation');
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.RIG_TEST_CHROMIUM || undefined});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
    const errors=[], images=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',msg=>{if(msg.type()==='error' && !msg.text().includes('favicon')) console.error(msg.text());});
    page.on('response',r=>{if(r.url().includes('/layers/')) images.push({url:r.url(),status:r.status()});});
    const base=process.env.RIG_TEST_BASE || 'http://127.0.0.1:8011';
    const task=process.env.RIG_TEST_TASK || 'Eris_full_body_casual_20260918_113905';
    await page.goto(base+'/preview-rig?local='+encodeURIComponent(task));
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已載入'),{},{timeout:30000});
    await page.locator('#paused').check();
    await page.screenshot({path:path.join(out,'default.png')});
    await page.locator('#neutral').click();
    await page.screenshot({path:path.join(out,'neutral.png')});
    for(const id of ['body','head','hair','breath']) await page.locator('#'+id).fill('100');
    await page.screenshot({path:path.join(out,'positive-extreme.png')});
    await page.locator('#body').fill('-100'); await page.locator('#head').fill('-100');
    await page.screenshot({path:path.join(out,'negative-extreme.png')});
    await page.locator('#compare').selectOption('legacy');
    await page.screenshot({path:path.join(out,'legacy-comparison.png')});
    assert.equal(images.length,32); assert.ok(images.every(r=>r.status===200));
    assert.deepEqual(errors,[]);
    await page.locator('#defaults').click();
    assert.equal(await page.locator('#body').inputValue(),'0');
    assert.equal(await page.locator('#head').inputValue(),'0');
    assert.equal(await page.locator('#breath').inputValue(),'30');
    assert.equal(await page.locator('#hair').inputValue(),'10');
    assert.equal(await page.locator('#paused').isChecked(),false);
    const nonempty=await page.locator('canvas').evaluate(canvas=>{
      const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      let count=0;for(let i=3;i<data.length;i+=4) if(data[i]) count++;return count;
    });
    assert.ok(nonempty>10000,'canvas must actually render the characters');
    const old=await page.request.get(base+'/preview?local='+encodeURIComponent(task));
    assert.equal(old.status(),200);assert.ok((await old.text()).includes('uPar'));
    fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({task,images:images.length,errors,nonemptyPixels:nonempty,checks:'load, controls, reset, old route, render',visualAcceptance:'pending user review'},null,2));
    console.log('Browser checks passed: 32 images, no JS errors, controls/reset, rendered canvas, legacy route.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
