const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

async function main(){
  const out=path.resolve(__dirname,'../outputs/eye_rig_browser_validation');
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.RIG_TEST_CHROMIUM||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
    const errors=[],imageStatuses=[],layerUrls=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('response',response=>{if(response.url().includes('/layers/')){imageStatuses.push(response.status());layerUrls.push(response.url());}});
    const task=process.env.RIG_TEST_TASK||'Eris_full_body_casual_20260918_113905';
    const base=process.env.RIG_TEST_BASE||'http://127.0.0.1:8011';
    await page.goto(base+'/preview-deform?local='+encodeURIComponent(task)+'&quality-profile=browser-validation');
    try{
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已載入'),null,{timeout:30000});
    }catch(error){
      throw new Error(`viewer did not finish loading; status=${await page.locator('#status').textContent()}; pageErrors=${errors.join(' | ')}`,{cause:error});
    }
    await page.locator('#neutral').click();
    await page.locator('#paused').check();
    await page.locator('#view').selectOption('upper');
    const capture=async filename=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(out,filename)});
      return page.locator('#stage').evaluate(canvas=>canvas.toDataURL());
    };

    const gazeFrames=[];
    for(const y of [100,0,-100])for(const x of [-100,0,100]){
      await page.locator('#gaze-x').fill(String(x));
      await page.locator('#gaze-y').fill(String(y));
      gazeFrames.push(await capture(`gaze_${x}_${y}.png`));
    }
    assert.equal(new Set(gazeFrames).size,9,'all nine gaze states should render distinctly');

    await page.locator('#gaze-x').fill('0');
    await page.locator('#gaze-y').fill('0');
    const blinkFrames=[];
    for(const blink of [0,50,100]){
      await page.locator('#blink').fill(String(blink));
      blinkFrames.push(await capture(`blink_${String(blink).padStart(3,'0')}.png`));
    }
    assert.equal(new Set(blinkFrames).size,3,'open, half, and closed blink states should render distinctly');

    await page.locator('#blink').fill('0');
    await page.locator('#paused').uncheck();
    await page.locator('#gaze-follow').check();
    await page.mouse.move(780,180);
    await page.waitForTimeout(350);
    const pointerA=await capture('pointer_follow_top.png');
    await page.mouse.move(1200,760);
    await page.waitForTimeout(350);
    const pointerB=await capture('pointer_follow_bottom.png');
    assert.notEqual(pointerA,pointerB,'pointer movement should drive the shared gaze');

    assert.deepEqual(errors,[]);
    const quality=await page.evaluate(()=>window.__viewerQuality);
    assert.deepEqual(quality,{name:'browser-validation',isProduction:false,maxUpload:768,label:'非正式驗證模式 · 768px'});
    assert.match(await page.locator('#status').textContent(),/非正式驗證模式 · 768px（不可作為交付畫面）/);
    assert.ok(imageStatuses.length>=23&&imageStatuses.every(status=>status===200));
    assert.ok(['seam_repair_head.png','seam_repair_torso.png'].every(name=>layerUrls.some(url=>url.endsWith('/'+name))),'approved shoulder/neck seam layers should load by default');
    const report={
      result:'PASS',task,
      checks:{nineDistinctGazeFrames:true,threeDistinctBlinkFrames:true,pointerFollowChangesFrame:true,noPageErrors:true,allLayerRequests200:true,approvedSeamLayersLoaded:true,nonProductionProfileVisible:true},
      screenshots:{gaze:9,blink:3,pointer:2},
      loadedLayerRequests:imageStatuses.length,
      qualityProfile:quality.name,
      textureUploadMax:quality.maxUpload,
      visualAcceptance:'pending manual inspection of generated PNGs'
    };
    fs.writeFileSync(path.join(out,'browser_eye_rig_report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
