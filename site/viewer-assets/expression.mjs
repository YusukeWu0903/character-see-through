const clamp=(x,min,max)=>Math.max(min,Math.min(max,Number.isFinite(x)?x:0));
export function sharedGazeTarget(manual=[0,0],pointer=[0,0],follow=true,strength=.8){
  const gain=clamp(strength,0,1);
  const result=[0,1].map(i=>clamp((manual[i]||0)+(follow?(pointer[i]||0)*gain:0),-1,1));
  const length=Math.hypot(...result);
  return length>1?result.map(value=>value/length):result;
}
export function blinkPulse(time, enabled=true){
  if(!enabled||!Number.isFinite(time))return 0;
  const phase=((time%4.6)+4.6)%4.6;
  return phase>1e-8&&phase<.18-1e-8?Math.sin(Math.PI*phase/.18):0;
}
export function buildExpression(controls,time,headPivot=[0,.48],gazeLimits=[.006,.003]){
  const manual=clamp(controls.blink,0,1),auto=blinkPulse(time,controls.autoBlink);
  return {
    blink:clamp(Math.max(manual,auto),0,1),
    gaze:[clamp(controls.gazeX,-1,1)*clamp(gazeLimits[0],0,.01),clamp(controls.gazeY,-1,1)*clamp(gazeLimits[1],0,.006)],
    yaw:clamp(controls.yaw,-1,1),
    headPivot,
    eyeCenter:[0,.52],
  };
}
export function applyExpressivePose(pose, energy,time){
  const e=clamp(energy,0,1),t=Number.isFinite(time)?time:0;
  return {...pose,
    body:pose.body+.42*e*Math.sin(t*.62),
    torso:pose.torso-.62*e*Math.sin(t*.62+.12),
    head:pose.head+.48*e*Math.sin(t*.62+.36),
    hair:clamp(pose.hair+.35*e,0,1),
  };
}
export function advanceSpring(state,target,dt,{frequency=8,damping=.55}={}){
  const step=clamp(dt,0,.05),f=clamp(frequency,1,20),z=clamp(damping,.05,2);
  const position=Number.isFinite(state?.position)?state.position:0;
  const velocity=Number.isFinite(state?.velocity)?state.velocity:0;
  const acceleration=f*f*(clamp(target,-1,1)-position)-2*z*f*velocity;
  return {position:clamp(position+velocity*step,-1,1),velocity:clamp(velocity+acceleration*step,-10,10)};
}
