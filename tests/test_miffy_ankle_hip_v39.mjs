import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateStanceField,stanceOffset,hipTiltOffset} from '../viewer/stance-field.mjs';

const root='../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/';
const v39=JSON.parse(readFileSync(new URL(root+'motion_v39/rig.json',import.meta.url)));
const v6=JSON.parse(readFileSync(new URL(root+'motion_v6/rig.json',import.meta.url)));
const assembly=JSON.parse(readFileSync(new URL(root+'ankle_hip_v1/assembly.json',import.meta.url)));

test('v39 preserves v38 and pins only the derived footwear layer',()=>{
  assert.equal(v39.extends,'_review/motion_v38/rig.json');
  assert.equal(v39.assembly,'_review/ankle_hip_v1/assembly.json');
  assert.equal(assembly.rollbackManifest,'_review/cheek_outline_v1/assembly.json');
  assert.equal(assembly.drawOrder.find(x=>x.file==='footwear.png').asset,
    '_review/ankle_hip_v1/footwear.png');
  assert.deepEqual(assembly.ankleRepair.bounds,[595,1104,665,1119]);
  assert.equal(assembly.ankleRepair.alphaIncreases,0);
});

test('hip translation rises mildly and tilt remains local with grounded feet',()=>{
  const field=validateStanceField(v39.grounding);
  const old=validateStanceField(v6.grounding);
  assert.equal(stanceOffset(565,{body:1},old),14);
  assert.equal(stanceOffset(565,{body:1},field),17);
  for(const body of [-1,0,1]){
    for(const x of [575,625,675]){
      for(const y of [0,430,800,1100,1264])
        assert.equal(hipTiltOffset(x,y,{body},field),0);
      assert.equal(stanceOffset(1264,{body},field),0);
    }
  }
  const upper=hipTiltOffset(525,615,{body:1},field);
  const lower=hipTiltOffset(725,615,{body:1},field);
  assert.ok(upper<0 && lower>0);
  assert.ok(Math.abs(upper)<2 && Math.abs(lower)<2);
  assert.equal(hipTiltOffset(725,615,{body:-1},field),-lower);
});
