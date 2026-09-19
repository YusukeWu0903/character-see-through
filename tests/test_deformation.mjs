import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRig} from '../viewer/rig.mjs';
import {validateDeformation,deformPoint,transformPoint,serializeSettings,parseSettings} from '../viewer/deformation.mjs';
const rig=JSON.parse(readFileSync(new URL('../viewer/eris-deform.json',import.meta.url)));
const evaluate=createRig(rig),near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9));
test('neutral shared deformation preserves original coordinates for every layer',()=>{
  const matrices=evaluate({});
  for(const layer of Object.keys(rig.bindings))for(const p of [[0,0],[-.7,.41],[.2,-.4],[.1,.65]])near(deformPoint(p,matrices,rig.deformation,layer),p);
});
test('below waist follows legs and above neck follows head exactly',()=>{
  const m=evaluate({torso:1,head:-1,body:.5});
  near(deformPoint([.1,-.3],m,rig.deformation),transformPoint(m.legwear,[.1,-.3]));
  near(deformPoint([.1,.65],m,rig.deformation),transformPoint(m.face,[.1,.65]));
});
test('overlapping neck and clothing pixels share continuous coordinates',()=>{
  const m=evaluate({torso:1,head:1});
  for(let y=-.2;y<.7;y+=.01){
    const p=[.12,y],a=deformPoint(p,m,rig.deformation,'neck');
    for(const layer of ['face','mouth','topwear','handwear','legwear'])near(a,deformPoint(p,m,rig.deformation,layer));
    const b=deformPoint([.12,y+1e-6],m,rig.deformation,'neck');
    assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5);
  }
});
test('torso bends independently of legs while head inherits torso',()=>{
  const a=evaluate({}),b=evaluate({torso:1});
  near(a.legwear,b.legwear);assert.notDeepEqual(a.face,b.face);near(b.face,b.mouth);
});
test('settings round-trip and task isolation',()=>{
  const copy=parseSettings(serializeSettings('task-a',rig),'task-a');assert.deepEqual(copy,rig);
  assert.throws(()=>parseSettings(serializeSettings('task-a',rig),'task-b'));
});
test('invalid, overlapping and folding calibrations are rejected without mutating input',()=>{
  validateDeformation(rig);
  for(const mutate of [r=>r.deformation.neck=[.5,.2],r=>r.deformation.neck=[.1,.5],r=>r.nodes.find(n=>n.id==='head').pivot=[5,0],r=>r.deformation.neck=[.4,.46],r=>r.bindings.face='legs']){
    const r=structuredClone(rig);mutate(r);assert.throws(()=>validateDeformation(r));
  }
  assert.equal(rig.nodes.find(n=>n.id==='head').pivot[0],0);
});
