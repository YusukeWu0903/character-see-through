import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertViewerDefaults,resolveQualityProfile,validateQualityBaseline} from '../viewer/quality-profile.mjs';

const baseline=JSON.parse(await readFile(new URL('../viewer/quality-baseline.json',import.meta.url),'utf8'));

test('production profile is native and cannot be silently downgraded',()=>{
  validateQualityBaseline(baseline);
  assert.deepEqual(resolveQualityProfile('',baseline),{name:'production',isProduction:true,maxUpload:1280,label:'正式畫質 · 原生 1280px'});
  assert.throws(()=>resolveQualityProfile('texture-max=768',baseline),/任意降規入口已停用/);
  assert.throws(()=>resolveQualityProfile('quality-profile=unknown',baseline),/未知或未核准/);
});

test('browser validation downgrade is named and visibly non-production',()=>{
  assert.deepEqual(resolveQualityProfile('quality-profile=browser-validation',baseline),{name:'browser-validation',isProduction:false,maxUpload:768,label:'非正式驗證模式 · 768px'});
});

test('viewer control defaults are checked against the same production baseline',()=>{
  const elements=new Map([
    ...Object.entries(baseline.production.viewer.controls).map(([name,value])=>[name,{value:String(value)}]),
    ...Object.entries(baseline.production.viewer.toggles).map(([name,checked])=>[name,{checked}]),
  ]);
  assert.doesNotThrow(()=>assertViewerDefaults(name=>elements.get(name),baseline.production.viewer));
  elements.get('breath').value='12';
  assert.throws(()=>assertViewerDefaults(name=>elements.get(name),baseline.production.viewer),/breath/);
});
