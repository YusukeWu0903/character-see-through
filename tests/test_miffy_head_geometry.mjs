import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectedLandmarks,validateHeadGeometry} from '../viewer/head-geometry.mjs';

const task='Miffy_full_body_casual_rb_20260924_012138';
const manifest=JSON.parse(readFileSync(
  `outputs/seethrough_local/${task}/_review/motion_v24/rig.json`));
const config=manifest.headGeometry;
validateHeadGeometry(config);
assert.equal(manifest.extends,'_review/motion_v22/rig.json');
assert.equal(manifest.nonProduction,true);
assert.equal(manifest.reviewStatus,'pending');
const zero=projectedLandmarks(config,0);
for(const [name,point] of Object.entries(config.landmarks)){
  assert.ok(Math.abs(zero[name][0]-point[0])<1e-10,name+' neutral x');
  assert.ok(Math.abs(zero[name][1]-point[1])<1e-10,name+' neutral y');
}
const left=projectedLandmarks(config,-12),right=projectedLandmarks(config,12);
const width=(marks,a,b)=>marks[b][0]-marks[a][0];
assert.ok(width(right,'leftEyeOuter','leftEyeInner')>
  width(right,'rightEyeInner','rightEyeOuter'),
  'right yaw must widen near eye and compress far eye');
assert.ok(width(left,'leftEyeOuter','leftEyeInner')<
  width(left,'rightEyeInner','rightEyeOuter'),
  'left yaw must reverse near/far eye relationship');
assert.ok(right.noseTip[0]>zero.noseTip[0]);
assert.ok(left.noseTip[0]<zero.noseTip[0]);
assert.ok(Math.abs(right.noseTip[0]-zero.noseTip[0])>
  Math.abs(right.chin[0]-zero.chin[0]),
  'projected nose depth must travel more than chin');
console.log('PASS: neutral registration, opposed near/far eye perspective, nose depth');
