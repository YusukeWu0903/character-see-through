import assert from 'node:assert/strict';
import {validateHairIdle,initialHairIdleState,advanceHairIdle} from '../viewer/hair-idle-state.mjs';

const config={mode:'yaw-centered-idle-state-review',settleSeconds:.28,
  resumeRate:3.5,parts:{fronthair:{amplitude:.42,phase:.2},
    backhair:{amplitude:.5,phase:1.4}}};
validateHairIdle(config);
let state=initialHairIdleState();
let target;
function step(yaw,time,enabled=true,strength=.55){
  const result=advanceHairIdle(state,yaw,.05,time,enabled,strength,config);
  state=result.state;target=result.targets;
  for(const value of Object.values(target))assert.ok(Number.isFinite(value));
}
for(let i=0;i<40;i++)step(0,i*.05);
assert.equal(state.mode,'idle');
assert.ok(state.idleMix>.9);
step(.5,2.05);
assert.equal(state.mode,'turn');
assert.equal(state.idleMix,0);
assert.deepEqual(target,{fronthair:.5,backhair:.5});
for(let i=0;i<50;i++)step(.5,2.1+i*.05);
assert.equal(state.mode,'idle');
assert.ok(Math.abs(target.fronthair-.5)<.24);
assert.ok(Math.abs(target.backhair-.5)<.28);
step(-.5,4.65);
assert.equal(state.mode,'turn');
assert.deepEqual(target,{fronthair:-.5,backhair:-.5});
for(let i=0;i<40;i++)step(-.5,4.7+i*.05);
step(-.5,6.75,false);
assert.equal(state.mode,'held');
for(let i=0;i<80;i++)step(-.5,6.8+i*.05,false);
assert.ok(Math.abs(target.fronthair+.5)<1e-5);
assert.ok(Math.abs(target.backhair+.5)<1e-5);
step(.5,10.85,true,0);
for(let i=0;i<30;i++)step(.5,10.9+i*.05,true,0);
assert.equal(state.mode,'held');
assert.deepEqual(target,{fronthair:.5,backhair:.5});
console.log('Miffy yaw-centred hair idle state: pass');
