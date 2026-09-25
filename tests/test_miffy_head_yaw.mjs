import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headYawOffset,headYawWeight,validateHeadYawField} from '../viewer/head-yaw-field.mjs';

const rig=JSON.parse(readFileSync(new URL(
  '../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v23/rig.json',
  import.meta.url)));
const field=rig.headYaw;

test('Miffy v23 head micro-yaw is bounded to a small source-supported region',()=>{
  validateHeadYawField(field);
  assert.equal(rig.rollbackManifest,'_review/motion_v22/rig.json');
  assert.equal(field.maxPixels,7);
  assert.equal(headYawWeight(625,80,field),1);
  for(const y of [230,300,800]){
    assert.equal(headYawOffset(625,y,1,field),0);
    assert.equal(headYawOffset(625,y,-1,field),0);
  }
  for(const x of [0,440,810,1280])
    assert.equal(headYawOffset(x,80,1,field),0);
});

test('field has opposing directions, smooth taper and no horizontal fold',()=>{
  for(const y of [0,80,135,160,190,210,229])
    for(const x of [450,500,550,625,700,750,800]){
      const positive=headYawOffset(x,y,1,field);
      const negative=headYawOffset(x,y,-1,field);
      assert.equal(positive,-negative);
      assert.ok(Math.abs(positive)<=field.maxPixels*1.5);
      const next=headYawOffset(x+1,y,1,field);
      assert.ok(1+next-positive>.85,'sample map must stay locally monotone');
    }
  assert.ok(headYawWeight(625,160,field)>headYawWeight(625,190,field));
  assert.ok(headYawWeight(625,190,field)>headYawWeight(625,220,field));
});
