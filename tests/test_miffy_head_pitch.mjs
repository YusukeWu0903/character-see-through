import assert from 'node:assert/strict';
import {headSurfacePoint} from '../viewer/head-surface-warp.mjs';
import {validatePitchFollow,pitchFollowPoint} from '../viewer/pitch-follow-field.mjs';
import {readFileSync} from 'node:fs';

const task='Miffy_full_body_casual_rb_20260924_012138';
const review=new URL('../outputs/seethrough_local/'+task+'/_review/',import.meta.url);
const v26=JSON.parse(readFileSync(new URL('motion_v26/rig.json',review)));
const v34=JSON.parse(readFileSync(new URL('motion_v34/rig.json',review)));
const surface=v26.headSurface,pitch=v34.headPitch;
assert.equal(pitch.maxDegrees,5);
for(const part of Object.values(pitch.parts))validatePitchFollow(part);
for(const yaw of [-8,0,8])for(const angle of [-5,0,5]){
  for(let y=24;y<=210;y+=8){
    let previous=null;
    for(let x=525;x<=725;x+=8){
      const point=headSurfacePoint(x,y,yaw,surface,angle);
      assert.ok(point.every(Number.isFinite));
      if(previous)assert.ok(point[0]>previous[0],
        `x fold at yaw ${yaw}, pitch ${angle}, x ${x}, y ${y}`);
      previous=point;
    }
  }
  for(let x=525;x<=725;x+=8){
    let previous=null;
    for(let y=24;y<=210;y+=8){
      const point=headSurfacePoint(x,y,yaw,surface,angle);
      if(previous)assert.ok(point[1]>previous[1],
        `y fold at yaw ${yaw}, pitch ${angle}, x ${x}, y ${y}`);
      previous=point;
    }
  }
}
const noseUp=headSurfacePoint(625,139,0,surface,5)[1];
const noseDown=headSurfacePoint(625,139,0,surface,-5)[1];
assert.ok(noseUp<139&&noseDown>139);
assert.deepEqual(headSurfacePoint(625,139,0,surface,0),[625,139]);
for(const [name,part] of Object.entries(pitch.parts)){
  const x=Math.round((part.bounds[0]+part.bounds[2])/2);
  assert.deepEqual(pitchFollowPoint(x,part.bounds[1],1,part),
    [x,part.bounds[1]]);
  assert.deepEqual(pitchFollowPoint(x,part.holdY,1,part),
    [x,part.holdY]);
  const middle=part.fullY;
  assert.ok(pitchFollowPoint(x,middle,1,part)[1]<middle,name);
  assert.ok(pitchFollowPoint(x,middle,-1,part)[1]>middle,name);
  for(const control of [-1,1]){
    let last=-Infinity;
    for(let y=part.bounds[1];y<=part.holdY;y++){
      const projected=pitchFollowPoint(x,y,control,part)[1];
      assert.ok(projected>last,`${name} vertical fold at ${y}`);
      last=projected;
    }
  }
}
console.log('Miffy v34 pitch field and yaw/pitch no-fold checks passed');
