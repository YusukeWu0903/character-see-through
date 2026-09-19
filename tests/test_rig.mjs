import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRig,identity,validateRig} from '../viewer/rig.mjs';
const profile=JSON.parse(readFileSync(new URL('../viewer/eris-rig.json',import.meta.url)));
const evaluate=createRig(profile);
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-10,`${v} != ${b[i]}`));
const point=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
test('neutral pose preserves all rest-canvas pixels at every time',()=>{
  for(const t of [0,1,11,100]) for(const matrix of Object.values(evaluate({},t))) near(matrix,identity());
});
test('facial attachments and footwear cannot drift from their parents',()=>{
  for(const body of [-1,0,1]) for(const head of [-1,0,1]) for(const t of [0,.7,2,7]){
    const pose=evaluate({body,head,breath:1,hair:1},t);
    for(const name of ['mouth','nose','eyelash','eyewhite','eyebrow','irides','ears']) near(pose[name],pose.face);
    near(pose.footwear,pose.legwear);
  }
});
test('head pivot remains attached through combined parent/child rotation',()=>{
  const pose=evaluate({body:1,head:-1});
  near(point(pose.face,[0,.48]),point(pose.neck,[0,.48]));
  assert.ok(Math.abs(Math.atan2(pose.face[1],pose.face[0])*180/Math.PI-(-.5))<1e-10);
});
test('hair root remains fixed relative to head while tips rotate',()=>{
  const pose=evaluate({body:1,head:1,hair:1},2);
  near(point(pose.fronthair,[0,.77]),point(pose.face,[0,.77]));
  assert.notDeepEqual(point(pose.fronthair,[0,.6]),point(pose.face,[0,.6]));
});
test('input limits, invalid numbers and explicit time are deterministic',()=>{
  assert.deepEqual(evaluate({head:100,body:-100,breath:100,hair:100},7),evaluate({head:1,body:-1,breath:1,hair:1},7));
  assert.deepEqual(evaluate({head:NaN,body:Infinity},NaN),evaluate({},0));
  assert.deepEqual(evaluate({head:.3},5),evaluate({head:.3},5));
});
test('invalid hierarchy and schema are rejected',()=>{
  for(const mutate of [r=>r.schemaVersion=2,r=>r.nodes[1].parent='missing',r=>r.nodes[1].parent='head',r=>r.nodes[2].pivot=[NaN,0],r=>r.bindings.face='missing',r=>r.nodes.push({...r.nodes[0]})]){
    const r=structuredClone(profile);mutate(r);assert.throws(()=>validateRig(r));
  }
});
test('node declaration order does not affect hierarchy evaluation',()=>{
  const r=structuredClone(profile);r.nodes.reverse();
  assert.deepEqual(createRig(r)({head:1,body:.5,hair:.6},3),evaluate({head:1,body:.5,hair:.6},3));
});
