import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pitchProportionOffset,validateHeadPitchProportion} from '../viewer/head-pitch-proportion.mjs';
import {headSurfacePoint} from '../viewer/head-surface-warp.mjs';

const path='outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/';
const profile=JSON.parse(readFileSync(path+'motion_v35/rig.json')).headPitchProfile;
const surface=JSON.parse(readFileSync(path+'motion_v25/rig.json')).headSurface;
validateHeadPitchProportion(profile);
const offset=(x,y,pitch)=>pitchProportionOffset(x,y,pitch,profile);
assert.ok(offset(625,125,5).every(value=>Math.abs(value)<1e-8));
assert.ok(offset(625,70,5)[1]>0,'up: upper face compresses toward bridge');
assert.ok(offset(625,185,5)[1]<0,'up: chin rises');
assert.ok(offset(670,70,5)[0]<0,'up: upper face narrows');
assert.ok(offset(625,115,-5)[1]>0,'down: bridge/eye zone descends');
assert.ok(offset(625,185,-5)[1]>0,'down: lower face compresses');
assert.deepEqual(offset(625,205,-5),[0,0]);
assert.deepEqual(offset(625,160,0),[0,0]);
for(const yaw of [-8,0,8])for(const pitch of [-5,5])for(let x=560;x<=690;x+=10){
  let last=-Infinity;
  for(let y=60;y<=210;y+=2){
    const point=headSurfacePoint(x,y,yaw,surface,pitch,profile);
    assert.ok(point[1]>last,`fold at ${x},${y}, yaw ${yaw}, pitch ${pitch}`);
    last=point[1];
  }
}
console.log('Miffy pitch-proportion direction, landmarks, and sampled monotonicity OK');
