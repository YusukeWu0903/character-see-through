const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
async function main(){
  const out=path.resolve(__dirname,'../outputs/deform_validation');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.RIG_TEST_CHROMIUM||undefined,args:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
    const errors=[],images=[];page.on('pageerror',e=>errors.push(String(e)));
    page.on('response',r=>{if(r.url().includes('/layers/'))images.push(r.status());});
    const task=process.env.RIG_TEST_TASK||'Eris_full_body_casual_20260918_113905';
    const base=process.env.RIG_TEST_BASE||'http://127.0.0.1:8011';
    await page.goto(base+'/viewer-assets/deform.html?local='+encodeURIComponent(task));
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已載入'),null,{timeout:30000});
    const frame=()=>page.locator('#stage').evaluate(c=>c.toDataURL());
    const first=await frame();await page.waitForFunction(v=>document.querySelector('#stage').toDataURL()!==v,first,{timeout:5000});
    await page.locator('#paused').check();
    await page.screenshot({path:path.join(out,'default.png')});
    await page.locator('#neutral').click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const neutral=await page.locator('#stage').evaluate(c=>{
      const gl=c.getContext('webgl'),pixels=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const w=c.width-document.querySelector('aside').getBoundingClientRect().width-24,half=Math.round(w/2);
      let changed=0,nonempty=0;for(let y=0;y<c.height;y++)for(let x=0;x<half;x++){
        const a=(y*c.width+x)*4,b=(y*c.width+x+half)*4;if(pixels[a+3])nonempty++;
        for(let k=0;k<4;k++)if(Math.abs(pixels[a+k]-pixels[b+k])>2){changed++;break;}
      }return {changed,nonempty};
    });
    assert.ok(neutral.nonempty>10000);assert.ok(neutral.changed<100,'neutral rigid and mesh must align');
    await page.screenshot({path:path.join(out,'neutral.png')});
    await page.locator('#head').fill('100');await page.locator('#torso').fill('-100');
    await page.locator('#view').selectOption('upper');
    await page.screenshot({path:path.join(out,'neck-waist-extreme.png')});
    const extreme=await frame();await page.locator('#torso').fill('100');
    await page.waitForFunction(v=>document.querySelector('#stage').toDataURL()!==v,extreme,{timeout:5000});
    await page.screenshot({path:path.join(out,'same-direction-extreme.png')});
    await page.locator('summary').click();await page.locator('#calibrate').check();
    await page.locator('#view').selectOption('full');
    await page.locator('#head-limit').fill('7');
    const click=await page.evaluate(()=>{const panel=document.querySelector('aside').getBoundingClientRect(),w=innerWidth-panel.width-24,s=Math.min(w/2,innerHeight)*.96/2.12;return {x:w*.75+s*.05,y:innerHeight/2-s*.48};});
    await page.locator('#stage').click({position:click});
    assert.match(await page.locator('#settings-status').textContent(),/錨點已調整/);
    await page.locator('#save').click();
    const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
    const exported=path.join(out,'exported-rig.json');await download.saveAs(exported);
    const doc=JSON.parse(fs.readFileSync(exported));assert.equal(doc.task,task);assert.equal(doc.rig.nodes.find(n=>n.id==='head').maxDegrees,7);
    assert.ok(Math.abs(doc.rig.nodes.find(n=>n.id==='head').pivot[0]-.05)<.01);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已載入'));
    assert.equal(await page.locator('#head-limit').inputValue(),'7');
    await page.locator('summary').click();await page.locator('#reset-rig').click();assert.equal(await page.locator('#head-limit').inputValue(),'6');
    await page.locator('#import').setInputFiles(exported);await page.waitForFunction(()=>document.querySelector('#settings-status').textContent.includes('已匯入'));assert.equal(await page.locator('#head-limit').inputValue(),'7');
    doc.task='wrong-task';await page.locator('#import').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
    await page.waitForFunction(()=>document.querySelector('#settings-status').textContent.includes('匯入失敗'));assert.equal(await page.locator('#head-limit').inputValue(),'7');
    await page.locator('#reset-rig').click();await page.locator('#defaults').click();
    const timing=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();let frames=0;function tick(){if(++frames===30)resolve({frames,elapsedMs:performance.now()-start});else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
    assert.deepEqual(errors,[]);assert.ok(images.every(s=>s===200));
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({neutral,errors,loadedImagesFirstPass:images.slice(0,32).length,timing,checks:'live motion, rendered alpha, neutral rigid/mesh match, torso, calibration, save/reload, export/import, invalid import, reset',visualAcceptance:'pending user review'},null,2));
    console.log(JSON.stringify({result:'PASS',neutral,timing,errors}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
