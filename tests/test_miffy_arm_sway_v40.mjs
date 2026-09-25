import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateArmSway,armOffset} from '../viewer/arm-sway-field.mjs';

const path=new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v40/rig.json',import.meta.url);
const rig=JSON.parse(readFileSync(path));
const field=validateArmSway(rig.armSway);

test('v40 extends the reviewed v39 surface without changing its assembly',()=>{
  assert.equal(rig.extends,'_review/motion_v39/rig.json');
  assert.equal(rig.rollbackManifest,rig.extends);
  assert.equal(rig.assembly,'_review/ankle_hip_v1/assembly.json');
  assert.equal(field.owner,'handwear.png');
  assert.equal(field.sides.length,2);
});

test('upper arms stay quieter than forearms and wrists; roots remain attached',()=>{
  for(const side of field.sides){
    for(const sign of [-1,0,1]){
      assert.equal(armOffset(226,sign,side,field),0);
      assert.equal(armOffset(200,sign,side,field),0);
      assert.ok(Math.abs(armOffset(325,sign,side,field))<=1.4);
    }
    const upper=Math.abs(armOffset(325,1,side,field));
    const elbow=Math.abs(armOffset(440,1,side,field));
    const wrist=Math.abs(armOffset(635,1,side,field));
    assert.ok(upper<elbow&&elbow<wrist);
    assert.ok(wrist<=8);
    assert.equal(armOffset(635,-1,side,field),-armOffset(635,1,side,field));
    for(let y=227;y<=710;y++){
      const gradient=Math.abs(armOffset(y,1,side,field)-
        armOffset(y-1,1,side,field));
      assert.ok(gradient<.15,`arm field jumps at ${y}`);
    }
  }
  assert.ok(field.sides[0].x1<field.sides[1].x0);
});
