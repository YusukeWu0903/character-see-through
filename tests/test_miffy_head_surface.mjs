import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headSurfacePoint,validateHeadSurface} from '../viewer/head-surface-warp.mjs';

const task='Miffy_full_body_casual_rb_20260924_012138';
const candidate=process.argv[2]||'motion_v25';
const manifest=JSON.parse(readFileSync(
  `outputs/seethrough_local/${task}/_review/${candidate}/rig.json`));
const config=manifest.headSurface;
validateHeadSurface(config);
assert.equal(manifest.nonProduction,true);
assert.equal(manifest.reviewStatus,'pending');
assert.equal(manifest.rollbackManifest,candidate==='motion_v26'
  ? '_review/motion_v25/rig.json':'_review/motion_v22/rig.json');
if(candidate==='motion_v26'){
  const previous=JSON.parse(readFileSync(
    `outputs/seethrough_local/${task}/_review/motion_v25/rig.json`));
  const compared=structuredClone(manifest.headSurface);
  compared.geometry.center[1]=previous.headSurface.geometry.center[1];
  compared.note=previous.headSurface.note;
  assert.deepEqual(compared,previous.headSurface,
    'v26 may change only the surface y centre and explanatory note');
  assert.equal(manifest.headSurface.geometry.center[1],135);
}
for(const angle of [-8,-4,0,4,8]){
  let minHorizontal=Infinity,minVertical=Infinity;
  let faceHorizontal=Infinity,faceVertical=Infinity;
  for(let y=0;y<226;y++)for(let x=510;x<740;x++){
    const p=headSurfacePoint(x,y,angle,config);
    if(angle===0)assert.deepEqual(p,[x,y]);
    if(x<739){
      const q=headSurfacePoint(x+1,y,angle,config);
      minHorizontal=Math.min(minHorizontal,q[0]-p[0]);
      if(x>=550&&x<=700&&y>=30&&y<=200)
        faceHorizontal=Math.min(faceHorizontal,q[0]-p[0]);
    }
    if(y<225){
      const q=headSurfacePoint(x,y+1,angle,config);
      minVertical=Math.min(minVertical,q[1]-p[1]);
      if(x>=550&&x<=700&&y>=30&&y<=200)
        faceVertical=Math.min(faceVertical,q[1]-p[1]);
    }
  }
  assert.ok(minHorizontal>0,`horizontal fold at ${angle}: ${minHorizontal}`);
  assert.ok(minVertical>0,`vertical fold at ${angle}: ${minVertical}`);
  assert.ok(faceHorizontal>.7,`visible-face horizontal squeeze at ${angle}: ${faceHorizontal}`);
  assert.ok(faceVertical>.7,`visible-face vertical squeeze at ${angle}: ${faceVertical}`);
}
for(const angle of [-8,8]){
  for(const point of [[510,100],[740,100],[625,0],[625,226]]){
    const result=headSurfacePoint(...point,angle,config);
    assert.ok(Math.abs(result[0]-point[0])<1e-9,
      `field boundary x moved at ${point}`);
    assert.ok(Math.abs(result[1]-point[1])<1e-9,
      `field boundary y moved at ${point}`);
  }
}
console.log('PASS: neutral identity, pinned boundaries, no horizontal/vertical folds');
