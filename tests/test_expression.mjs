import test from 'node:test';
import assert from 'node:assert/strict';
import {blinkPulse,buildExpression,applyExpressivePose} from '../viewer/expression.mjs';
test('automatic blink is bounded, periodic, and disabled explicitly',()=>{
  assert.equal(blinkPulse(0),0);assert.ok(blinkPulse(.09)>.99);assert.equal(blinkPulse(.18),0);
  assert.equal(blinkPulse(.09),blinkPulse(4.69));assert.equal(blinkPulse(.09,false),0);
});
test('expression clamps gaze, yaw and blink to safe micro-motion limits',()=>{
  const x=buildExpression({blink:5,gazeX:-5,gazeY:5,yaw:5,autoBlink:false},1);
  assert.deepEqual(x.gaze,[-.006,.003]);assert.equal(x.yaw,1);assert.equal(x.blink,1);
});
test('energy creates coordinated counter-motion without changing the neutral pose',()=>{
  const base={body:0,torso:0,head:0,hair:.1};
  assert.deepEqual(applyExpressivePose(base,0,2),base);
  const pose=applyExpressivePose(base,1,2);
  assert.ok(pose.body*pose.torso<0);assert.ok(pose.head*pose.torso<0);assert.ok(pose.hair>base.hair);
});
