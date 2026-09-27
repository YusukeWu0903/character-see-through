import {advanceExpressionPose} from './expression-pose.mjs';
// Reuse the reviewed critically damped pose timing, with a convex library state.
export function advanceExpressionBlend(state,target,dt,rate){
  const {weights,velocities}=state;
  if(!Array.isArray(weights)||!Number.isInteger(target)||target<0||target>=weights.length||weights.some(w=>!Number.isFinite(w)||w<0)||Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-6||!Number.isFinite(rate)||rate<=0||!Number.isFinite(dt))throw Error('Invalid expression blend');
  if(!Array.isArray(velocities)||velocities.length!==weights.length||velocities.some(v=>!Number.isFinite(v)))throw Error('Invalid expression velocity');
  if(dt<=0)return {weights:[...weights],velocities:[...velocities]};
  const steps=weights.map((position,i)=>advanceExpressionPose({position,velocity:velocities[i]},i===target?1:0,dt,rate));
  const sum=steps.reduce((a,s)=>a+s.position,0),sumVelocity=steps.reduce((a,s)=>a+s.velocity,0);
  return {weights:steps.map(s=>s.position/sum),velocities:steps.map(s=>(s.velocity*sum-s.position*sumVelocity)/(sum*sum))};
}
