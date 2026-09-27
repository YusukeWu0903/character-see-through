import {approachPointer} from './pointer-follow.mjs';

export const initialCoordinatedFollow=()=>({body:0,torso:0,head:0});
export function validateCoordinatedFollow(profile){
  if(!profile)return;
  if(profile.mode!=='soft-weight-follow' ||
    !['torsoRate','headRate'].every(k=>Number.isFinite(profile[k])&&profile[k]>=1&&profile[k]<=12))
    throw Error('協調跟隨參數無效');
  if(profile.bodyRate!==undefined&&(!Number.isFinite(profile.bodyRate)||profile.bodyRate<1||profile.bodyRate>12))
    throw Error('身體跟隨時序無效');
  for(const key of ['bodyGain','torsoGain'])
    if(profile[key]!==undefined&&(!Number.isFinite(profile[key])||profile[key]<0||profile[key]>1))
      throw Error('協調跟隨幅度無效');
}
// The already eased body leads; torso and head settle without overshoot.
export function advanceCoordinatedFollow(state,body,dt,profile){
  validateCoordinatedFollow(profile);
  const easedBody=profile.bodyRate===undefined?body:
    approachPointer(state.body??0,body,dt,profile.bodyRate);
  const torso=approachPointer(state.torso,easedBody,dt,profile.torsoRate);
  const head=approachPointer(state.head,torso,dt,profile.headRate);
  return {body:easedBody,torso,head};
}
