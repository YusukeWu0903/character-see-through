import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pitchProportionOffset,validateHeadPitchProportion} from '../viewer/head-pitch-proportion.mjs';
import {headSurfacePoint} from '../viewer/head-surface-warp.mjs';
import {pitchFollowPoint,validatePitchFollow} from '../viewer/pitch-follow-field.mjs';

const root='outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/';
const rig=JSON.parse(readFileSync(root+'motion_v36/rig.json'));
const profile=rig.headPitchProfile;
const surface=JSON.parse(readFileSync(root+'motion_v25/rig.json')).headSurface;
const geometry=surface.geometry;
validateHeadPitchProportion(profile);
const offset=(x,y,pitch)=>pitchProportionOffset(x,y,pitch,profile,geometry)[1];
const landmarks=[54,104,139,169,194];
const up=landmarks.map(y=>offset(625,y,5));
const down=landmarks.map(y=>offset(625,y,-5));
assert.ok(Math.abs(up[0])<1e-8,'up: crown held');
assert.ok(Math.abs(down.at(-1))<1e-8,'down: chin held');
for(let i=1;i<landmarks.length;i++){
  assert.ok(up[i]<up[i-1],`up: lower landmark ${i} pushes further upward`);
  assert.ok(down[i]<down[i-1],`down: upper landmark ${i-1} pushes further downward`);
}
assert.ok(up[1]<0&&down[0]>down[1]&&down[1]>0,
  'both signs reduce visible forehead height');
assert.ok(Math.abs(offset(625,139,5))>Math.abs(offset(690,139,5)),
  'vertical displacement follows the same rounded face cross-section');
assert.equal(offset(625,139,0),0);
for(const name of ['fronthair','backhair']){
  const part=rig.headPitch.parts[name];
  validatePitchFollow(part);
  const upShift=75-pitchFollowPoint(625,75,1,part)[1];
  const downShift=pitchFollowPoint(625,75,-1,part)[1]-75;
  assert.ok(downShift>upShift,`${name}: crown-led down follow exceeds up follow`);
  assert.equal(pitchFollowPoint(625,part.holdY,1,part)[1],part.holdY);
  assert.equal(pitchFollowPoint(625,part.holdY,-1,part)[1],part.holdY);
}
for(const yaw of [-8,0,8])for(const pitch of [-5,5])for(let x=560;x<=690;x+=10){
  let last=-Infinity;
  for(let y=55;y<=214;y+=2){
    const p=headSurfacePoint(x,y,yaw,surface,pitch,profile);
    assert.ok(p[1]>last,`fold at ${x},${y}, yaw ${yaw}, pitch ${pitch}`);
    last=p[1];
  }
}
console.log(JSON.stringify({up,down,noFold:true,directionalHair:true}));
