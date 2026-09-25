import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRig,identity} from '../viewer/rig.mjs';
import {groundShear} from '../viewer/grounded-sway.mjs';
import {validateStanceField,stanceOffset} from '../viewer/stance-field.mjs';
import {pointerTarget,approachPointer} from '../viewer/pointer-follow.mjs';
import {validateBustField,bustOffset} from '../viewer/bust-field.mjs';

const rig=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v1/rig.json',import.meta.url)));
const rigV2=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v2/rig.json',import.meta.url)));
const rigV3=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v3/rig.json',import.meta.url)));
const rigV4=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v4/rig.json',import.meta.url)));
const rigV5=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v5/rig.json',import.meta.url)));
const rigV6=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v6/rig.json',import.meta.url)));
const rigV18=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v18/rig.json',import.meta.url)));
const rigV19=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v19/rig.json',import.meta.url)));
const rigV22=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/motion_v22/rig.json',import.meta.url)));
const assembly=JSON.parse(readFileSync(new URL('../outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138/_review/seam_v2/assembly.json',import.meta.url)));
const pose=createRig(rig);
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9,`matrix index ${i}: ${v} != ${b[i]}`));
const point=(matrix,[x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];

test('v22 small head roll owns face and hair without moving torso or feet',()=>{
  assert.equal(rigV22.candidate,'motion_v22');
  assert.equal(rigV22.rollbackManifest,'_review/motion_v21/rig.json');
  assert.equal(rigV22.headRoll.maxDegrees,1.5);
  const evaluate=createRig({...rigV6,nodes:rigV22.nodes});
  const neutral=evaluate({headRoll:0,hair:0},0);
  for(const matrix of Object.values(neutral))near(matrix,identity());
  const left=evaluate({headRoll:-1,hair:0},0);
  const right=evaluate({headRoll:1,hair:0},0);
  for(const name of ['topwear','neck','legwear','footwear']){
    near(left[name],identity());
    near(right[name],identity());
  }
  for(const result of [left,right]){
    for(const name of ['eyebrow','nose','mouth','eyelash','eyewhite','irides'])
      near(result[name],result.face);
    near(point(result.fronthair,[625,48]),point(result.face,[625,48]));
    near(point(result.backhair,[625,48]),point(result.face,[625,48]));
    near(point(result.face,[625,220]),[625,220]);
  }
  assert.ok(point(left.face,[625,70])[0]<625);
  assert.ok(point(right.face,[625,70])[0]>625);
});

test('Miffy rig binds every assembly slot without borrowing Eris assets',()=>{
  assert.equal(rig.task,assembly.task);
  assert.equal(rig.assembly,'_review/seam_v2/assembly.json');
  assert.equal(rig.coordinateSpace,'canvas-pixels');
  assert.deepEqual(Object.keys(rig.bindings).sort(),
    assembly.drawOrder.map(layer=>layer.file.replace(/\.png$/,'')).sort());
});
test('Miffy neutral matrices preserve the exact rest canvas',()=>{
  for(const time of [0,1,5,20]) for(const matrix of Object.values(pose({},time)))
    near(matrix,identity());
});
test('head parts and both hair roots inherit body and torso motion',()=>{
  for(const controls of [{body:1,torso:-1,head:1,hair:0},
    {body:-1,torso:1,head:-1,hair:1}]) {
    const result=pose(controls,2);
    for(const name of ['ears','eyebrow','nose','mouth','eyelash','eyewhite','irides','earwear'])
      near(result[name],result.face);
    near(point(result.fronthair,[625,48]),point(result.face,[625,48]));
    near(point(result.backhair,[625,48]),point(result.face,[625,48]));
    near(result.legwear,result.footwear);
    near(result.handwear,result.topwear);
    near(result.neck,result.topwear);
  }
});
test('single arm/leg source files do not acquire independent bones',()=>{
  assert.equal(rig.bindings.handwear,'torso');
  assert.equal(rig.bindings.legwear,'body');
  assert.equal(rig.bindings.footwear,'body');
  assert.ok(!rig.nodes.some(node=>/leftArm|rightArm|leftLeg|rightLeg/i.test(node.id)));
});
test('v2 is a separate, visibly stronger candidate with the same pinned source and safe bindings',()=>{
  assert.equal(rigV2.candidate,'motion_v2');
  assert.equal(rigV2.assemblySha256,rig.assemblySha256);
  assert.equal(rigV2.sourceSha256,rig.sourceSha256);
  assert.deepEqual(rigV2.bindings,rig.bindings);
  const v1Body=rig.nodes.find(node=>node.id==='body').maxDegrees;
  const v2Body=rigV2.nodes.find(node=>node.id==='body').maxDegrees;
  assert.ok(v2Body>v1Body*3);
  const v2=createRig(rigV2);
  for(const matrix of Object.values(v2({body:0,torso:0,head:0,hair:0},3)))
    near(matrix,identity());
  near(v2({body:1}).legwear,v2({body:1}).footwear);
});
test('v3 grounds both sole points while upper body still sways',()=>{
  assert.equal(rigV3.candidate,'motion_v3');
  assert.equal(rigV3.grounding.mode,'shared-ground-shear');
  assert.equal(rigV3.assemblySha256,rigV2.assemblySha256);
  assert.deepEqual(rigV3.bindings,rigV2.bindings);
  const evaluateV3=createRig(rigV3);
  for(const matrix of Object.values(evaluateV3({},4))) near(matrix,identity());
  for(const input of [-1,0,1]){
    const field=groundShear(input,rigV3.grounding);
    for(const sole of [[574,1264],[686,1264]]) near(point(field,sole),sole);
    for(const y of [20,220,565,1000,1250]) assert.equal(point(field,[625,y])[1],y);
    if(input)assert.ok(Math.abs(point(field,[625,100])[0]-625)>30);
    assert.ok(Math.abs(point(field,[625,1250])[0]-625)<1);
  }
  near(groundShear(0,rigV3.grounding),identity());
});
test('v4 preserves the source and pins both feet while hip and head move differently',()=>{
  assert.equal(rigV4.candidate,'motion_v4');
  assert.equal(rigV4.assemblySha256,rigV3.assemblySha256);
  assert.deepEqual(rigV4.bindings,rigV3.bindings);
  validateStanceField(rigV4.grounding,1280);
  const evaluateV4=createRig(rigV4);
  for(const matrix of Object.values(evaluateV4({body:0,torso:0,head:0,hair:0},0)))
    near(matrix,identity());
  for(const input of [-1,0,1]){
    const controls={body:input,torso:-input*.4,head:-input*.2};
    for(const y of [1180,1220,1264,1280])
      assert.equal(stanceOffset(y,controls,rigV4.grounding),0);
    assert.ok(Math.abs(stanceOffset(565,controls,rigV4.grounding))<=14);
    assert.ok(Math.abs(stanceOffset(125,controls,rigV4.grounding))<
      Math.abs(stanceOffset(565,controls,rigV4.grounding)) || input===0);
  }
  assert.equal(rigV4.nodes.find(node=>node.id==='head').maxDegrees,0);
});
test('v5 keeps v4 motion and uses Eris-style time-smoothed additive pointer follow',()=>{
  assert.equal(rigV5.candidate,'motion_v5');
  assert.equal(rigV5.rollbackManifest,'_review/motion_v4/rig.json');
  assert.equal(rigV5.assemblySha256,rigV4.assemblySha256);
  assert.deepEqual(rigV5.grounding,rigV4.grounding);
  assert.deepEqual(rigV5.nodes,rigV4.nodes);
  assert.deepEqual(rigV5.bindings,rigV4.bindings);
  assert.equal(rigV5.pointerFollow.responseRate,7);
  assert.ok(['body','torso','head'].every(key=>rigV5.pointerFollow[key]<0));
  assert.equal(pointerTarget(630,630,520),0);
  assert.equal(pointerTarget(-1000,630,520),-1);
  assert.equal(pointerTarget(2000,630,520),1);
  let position=0;
  for(let i=0;i<12;i++){
    const next=approachPointer(position,1,1/60,7);
    assert.ok(next>position&&next<1);
    position=next;
  }
  assert.ok(position>.6&&position<.9);
  assert.equal(approachPointer(position,-1,0,7),position);
});
test('v6 preserves v5 easing and moves the rendered character toward pointer x',()=>{
  assert.equal(rigV6.candidate,'motion_v6');
  assert.equal(rigV6.rollbackManifest,'_review/motion_v5/rig.json');
  assert.equal(rigV6.assemblySha256,rigV5.assemblySha256);
  assert.deepEqual(rigV6.grounding,rigV5.grounding);
  assert.deepEqual(rigV6.nodes,rigV5.nodes);
  assert.deepEqual(rigV6.bindings,rigV5.bindings);
  assert.equal(rigV6.pointerFollow.responseRate,rigV5.pointerFollow.responseRate);
  assert.ok(['body','torso','head'].every(key=>
    rigV6.pointerFollow[key]===-rigV5.pointerFollow[key]));
  for(const mouse of [-1,1]){
    const controls=Object.fromEntries(['body','torso','head']
      .map(key=>[key,rigV6.pointerFollow[key]*mouse]));
    for(const y of [125,350,565]){
      const dx=stanceOffset(y,controls,rigV6.grounding);
      assert.ok(Math.sign(dx)===mouse,`wrong screen direction at y=${y}`);
    }
    assert.equal(stanceOffset(1264,controls,rigV6.grounding),0);
  }
});
test('v19 raises only the lower chest field and remains non-folding at stronger extrema',()=>{
  const old=validateBustField(rigV18.bustField);
  const field=validateBustField(rigV19.bustField);
  assert.equal(rigV19.rollbackManifest,'_review/motion_v18/rig.json');
  assert.equal(field.centerY,old.centerY);
  assert.equal(field.radiusY,old.radiusY);
  assert.equal(field.lowerRadiusY,43);
  assert.equal(field.maxPixels,old.maxPixels*1.5);
  assert.equal(field.followMaxPixels,old.followMaxPixels*1.5);
  assert.equal(bustOffset(632,field.centerY+field.lowerRadiusY,15,field),0);
  let minimumJacobian=Infinity;
  for(let y=258;y<383;y++)for(let x=514;x<750;x++){
    const gx=bustOffset(x+.5,y,1,field)-bustOffset(x-.5,y,1,field);
    const gy=bustOffset(x,y+.5,1,field)-bustOffset(x,y-.5,1,field);
    for(const amplitudeX of [-15,15])for(const amplitudeY of [-15,15])
      minimumJacobian=Math.min(minimumJacobian,
        1-amplitudeX*gx-amplitudeY*gy);
  }
  assert.ok(minimumJacobian>.35,`local field may fold: ${minimumJacobian}`);
});
