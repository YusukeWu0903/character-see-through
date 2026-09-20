import test from 'node:test';
import assert from 'node:assert/strict';
import {blinkPulse,buildExpression,applyExpressivePose,sharedGazeTarget} from '../viewer/expression.mjs';
import {advanceSpring} from '../viewer/expression.mjs';
test('automatic blink is bounded, periodic, and disabled explicitly',()=>{
  assert.equal(blinkPulse(0),0);assert.ok(blinkPulse(.09)>.99);assert.equal(blinkPulse(.18),0);
  assert.equal(blinkPulse(.09),blinkPulse(4.69));assert.equal(blinkPulse(.09,false),0);
});
test('expression clamps gaze, yaw and blink to safe micro-motion limits',()=>{
  const x=buildExpression({blink:5,gazeX:-5,gazeY:5,yaw:5,autoBlink:false},1);
  assert.deepEqual(x.gaze,[-.006,.003]);assert.equal(x.yaw,1);assert.equal(x.blink,1);
});
test('both eyes receive one bounded gaze target without inward bias',()=>{
  const diagonal=sharedGazeTarget([0,0],[1,-1],true,.8);
  assert.ok(Math.abs(diagonal[0]-Math.SQRT1_2)<1e-12&&Math.abs(diagonal[1]+Math.SQRT1_2)<1e-12);
  assert.ok(Math.abs(Math.hypot(...sharedGazeTarget([.5,-.5],[1,-1],true,.8))-1)<1e-12);
  assert.deepEqual(sharedGazeTarget([.3,-.2],[1,1],false),[.3,-.2]);
});
test('energy creates coordinated counter-motion without changing the neutral pose',()=>{
  const base={body:0,torso:0,head:0,hair:.1};
  assert.deepEqual(applyExpressivePose(base,0,2),base);
  const pose=applyExpressivePose(base,1,2);
  assert.ok(pose.body*pose.torso<0);assert.ok(pose.head*pose.torso<0);assert.ok(pose.hair>base.hair);
});
test('secondary spring is stable, delayed, and returns toward rest',()=>{
  let s={position:0,velocity:0},peak=0;
  for(let i=0;i<20;i++){s=advanceSpring(s,1,1/60);peak=Math.max(peak,s.position);}
  assert.ok(s.position>0&&s.position<=1);assert.ok(peak>0);
  for(let i=0;i<240;i++)s=advanceSpring(s,0,1/60);
  assert.ok(Math.abs(s.position)<.03);assert.ok(Math.abs(s.velocity)<.1);
});
