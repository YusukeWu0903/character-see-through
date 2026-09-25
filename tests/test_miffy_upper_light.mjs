import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {balancedHeadLightingColor,validateHeadLighting} from '../viewer/head-lighting.mjs';

const folder='outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/';
const older=JSON.parse(readFileSync(folder+'motion_v28/rig.json','utf8'));
const newer=JSON.parse(readFileSync(folder+'motion_v29/rig.json','utf8'));
const surface=JSON.parse(readFileSync(folder+'motion_v26/rig.json','utf8')).headSurface;
const rgb=[245,210,200],strength=.75;
validateHeadLighting(newer.faceLighting,surface);
assert.equal(newer.faceLighting.upperLight.fullThroughY,
  surface.geometry.landmarks.noseTip[1]);
const sample=(x,y,angle,config)=>balancedHeadLightingColor(
  x,y,angle,surface,config,rgb,strength);
for(const angle of [-8,8]){
  assert.deepEqual(sample(590,110,0,newer.faceLighting),rgb);
  const brightX=angle<0?660:590,darkX=angle<0?590:660;
  const upper=sample(brightX,110,angle,newer.faceLighting);
  const oldUpper=sample(brightX,110,angle,older.faceLighting);
  assert.ok(upper.every((value,i)=>value>=oldUpper[i]));
  assert.ok(upper.some((value,i)=>value>oldUpper[i]));
  assert.deepEqual(sample(brightX,153,angle,newer.faceLighting),rgb);
  assert.deepEqual(sample(brightX,175,angle,newer.faceLighting),rgb);
  assert.deepEqual(sample(darkX,175,angle,newer.faceLighting),
    sample(darkX,175,angle,older.faceLighting));
}
assert.throws(()=>validateHeadLighting({...newer.faceLighting,upperLight:null},surface));
console.log('PASS: upper lift strengthens only the lit upper face; lower lift zero, lower shade unchanged');
