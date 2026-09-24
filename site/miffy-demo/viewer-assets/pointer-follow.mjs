// Match Eris's pointer-target and time-based easing semantics. Character
// gains belong in each rig; this module does not choose their art direction.
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));

export function pointerTarget(nativeX,centerX,radius){
  if(![nativeX,centerX,radius].every(Number.isFinite)||radius<=0)
    throw Error('Invalid pointer calibration');
  return clamp((nativeX-centerX)/radius,-1,1);
}

export function approachPointer(current,target,dt,rate=7){
  if(![current,target,dt,rate].every(Number.isFinite)||rate<0)
    throw Error('Invalid pointer easing');
  const step=clamp(dt,0,.05);
  return current+(target-current)*(1-Math.exp(-rate*step));
}
