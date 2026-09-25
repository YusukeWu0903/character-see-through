import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNeckFollow,neckFollowPoint} from '../viewer/neck-follow-field.mjs';
import {validateHairFollow,hairFollowPoint} from '../viewer/hair-follow-field.mjs';
import {advanceSpring} from '../viewer/expression.mjs';

const rig=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/'+
  'Miffy_full_body_casual_rb_20260924_012138/_review/motion_v30/rig.json',
import.meta.url)));
const neck=rig.neckFollow,hair=rig.hairFollow;
validateNeckFollow(neck);validateHairFollow(hair);
const same=(a,b)=>assert.deepEqual(a,b);
same(neckFollowPoint(628,185,0,0,neck),[628,185]);
same(neckFollowPoint(628,224,1.5,8,neck),[628,224]);
const left=neckFollowPoint(628,185,-1.5,-8,neck)[0];
const right=neckFollowPoint(628,185,1.5,8,neck)[0];
assert.ok(left<628&&right>628);
assert.ok(Math.abs(right-628)<3);
assert.ok(Math.abs(neckFollowPoint(628,213,1.5,8,neck)[0]-628)<
  Math.abs(right-628)*.2);

const front=hair.parts.fronthair,back=hair.parts.backhair;
same(hairFollowPoint(580,front.rootY,1,front),[580,front.rootY]);
same(hairFollowPoint(620,back.rootY,1,back),[620,back.rootY]);
const f=hairFollowPoint(550,470,1,front);
const b=hairFollowPoint(620,470,1,back);
assert.ok(f[0]>550&&b[0]<620);
assert.ok(Math.abs(f[0]-550)<3&&Math.abs(b[0]-620)<4);
assert.ok(Math.abs(f[1]-470)<.2);

for(const part of [front,back]){
  let state={position:0,velocity:0},peak=0;
  for(let i=0;i<180;i++){
    state=advanceSpring(state,1,1/60,{frequency:part.frequency,
      damping:part.damping,maxPosition:1.15});
    peak=Math.max(peak,state.position);
  }
  assert.ok(peak>1&&peak<1.15,'bounded overshoot');
  assert.ok(Math.abs(state.position-1)<.01,'settles at target');
  for(let i=0;i<180;i++)state=advanceSpring(state,-1,1/60,{
    frequency:part.frequency,damping:part.damping,maxPosition:1.15});
  assert.ok(Math.abs(state.position+1)<.01,'reverses and settles');
}
console.log('Miffy neck/hair field and restrained spring checks passed');
