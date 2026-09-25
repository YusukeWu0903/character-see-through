import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pitchHeadLightingColor,validatePitchHeadLighting} from '../viewer/head-lighting.mjs';

const folder='outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/';
const light=JSON.parse(readFileSync(folder+'motion_v37/rig.json')).facePitchLighting;
const stronger=JSON.parse(readFileSync(folder+'motion_v38/rig.json')).facePitchLighting;
const surface=JSON.parse(readFileSync(folder+'motion_v25/rig.json')).headSurface;
validatePitchHeadLighting(light,surface);
validatePitchHeadLighting(stronger,surface);
assert.equal(stronger.upperLiftFraction,light.upperLiftFraction*2);
assert.equal(stronger.lowerShadeFraction,light.lowerShadeFraction*2);
assert.ok(stronger.axisY<light.axisY,'boundary follows actual nose bridge');
const skin=[245,210,200],ink=[55,35,34],eyeWhite=[252,252,252];
const sample=(y,pitch,rgb=skin,strength=.75)=>
  pitchHeadLightingColor(625,y,pitch,surface,light,rgb,strength);
const strongerSample=(y,pitch,rgb=skin,strength=.75)=>
  pitchHeadLightingColor(625,y,pitch,surface,stronger,rgb,strength);
assert.deepEqual(sample(100,0),skin);
assert.deepEqual(sample(100,5,skin,0),skin);
assert.ok(sample(100,5).every((value,i)=>value>=skin[i]));
assert.ok(sample(100,5).some((value,i)=>value>skin[i]));
assert.deepEqual(sample(170,5),skin,'up: lower half not brightened');
assert.deepEqual(sample(100,-5),skin,'down: upper half not darkened');
assert.ok(sample(170,-5).every((value,i)=>value<skin[i]));
assert.ok(sample(100,2.5)[1]<sample(100,5)[1]);
assert.ok(sample(170,-2.5)[1]>sample(170,-5)[1]);
assert.ok(strongerSample(90,5)[1]>sample(90,5)[1]);
assert.ok(strongerSample(140,-5)[1]<sample(140,-5)[1]);
assert.deepEqual(strongerSample(90,0),skin);
assert.deepEqual(strongerSample(140,-5,skin,0),skin);
for(const pigment of [ink,eyeWhite])for(const pitch of [-5,5])
  for(const draw of [sample,strongerSample])
    assert.deepEqual(draw(pitch>0?90:140,pitch,pigment),pigment);
assert.throws(()=>validatePitchHeadLighting({...light,fadeHalfHeight:40},surface));
console.log('Miffy v37/v38 signed pitch light, skin guard, neutral and half-strength OK');
