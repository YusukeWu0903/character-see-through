import {advanceExpressionBlend} from './expression-blend.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};

export function createExpressionSequenceState(target=0){
  if(!Number.isInteger(target)||target<0)throw Error('Invalid expression sequence target');
  return {requestedTarget:target,phase:'idle',elapsed:0,eyeClosure:0,eyeStart:0};
}

function settled(blend,target){
  return blend.weights[target]>1-1e-5&&Math.abs(blend.velocities[target])<1e-4;
}

// Optional candidate-only sequencing: close the eyes before blending to the
// named expression, and keep them closed while returning to neutral.
export function advanceSequentialExpression(state,blend,requestedTarget,dt,rate,sequence,names){
  if(!state||!Array.isArray(blend?.weights)||!Array.isArray(blend?.velocities)||
    !Array.isArray(names)||!Number.isInteger(requestedTarget)||requestedTarget<0||
    requestedTarget>=names.length||!Number.isFinite(dt)||dt<0||
    !Number.isFinite(rate)||rate<=0||sequence?.mode!=='eyes-before-expression'||
    !Number.isFinite(sequence.eyeCloseSeconds)||sequence.eyeCloseSeconds<=0||
    !Number.isFinite(sequence.eyeOpenSeconds)||sequence.eyeOpenSeconds<=0)
    throw Error('Invalid sequential expression configuration');
  const expressionIndex=names.indexOf(sequence.expression);
  const neutralIndex=names.indexOf(sequence.neutral||'neutral');
  if(expressionIndex<0||neutralIndex<0||expressionIndex===neutralIndex||
    blend.weights.length!==names.length||blend.velocities.length!==names.length)
    throw Error('Sequential expression names do not match the blend');

  let next={...state};
  let current={weights:[...blend.weights],velocities:[...blend.velocities]};
  if(requestedTarget!==state.requestedTarget){
    if(requestedTarget===expressionIndex){
      next.phase=next.eyeClosure>=1-1e-5?'to-expression':'close-eyes';
      next.eyeStart=next.eyeClosure;
      next.elapsed=0;
      if(current.weights[expressionIndex]>1e-5){next.phase='to-expression';next.eyeClosure=1;}
    }else if(requestedTarget===neutralIndex){
      if(current.weights[expressionIndex]>1e-5){
        next.phase='to-neutral';next.eyeClosure=1;next.elapsed=0;
      }else if(next.eyeClosure>1e-5){
        next.phase='open-eyes';next.eyeStart=next.eyeClosure;next.elapsed=0;
      }else next.phase='idle';
    }else{
      next.phase='direct';next.eyeClosure=0;next.elapsed=0;
    }
    next.requestedTarget=requestedTarget;
  }

  if(dt===0)return {blend:current,state:next};
  if(next.phase==='close-eyes'){
    next.elapsed+=dt;
    next.eyeClosure=next.eyeStart+(1-next.eyeStart)*smooth(next.elapsed/sequence.eyeCloseSeconds);
    if(next.elapsed>=sequence.eyeCloseSeconds){next.eyeClosure=1;next.phase='to-expression';next.elapsed=0;}
  }else if(next.phase==='to-expression'){
    current=advanceExpressionBlend(current,expressionIndex,dt,rate);
    next.eyeClosure=1;
    if(settled(current,expressionIndex)){next.phase='idle';next.eyeClosure=0;next.elapsed=0;}
  }else if(next.phase==='to-neutral'){
    current=advanceExpressionBlend(current,neutralIndex,dt,rate);
    next.eyeClosure=1;
    if(settled(current,neutralIndex)){next.phase='open-eyes';next.eyeStart=1;next.elapsed=0;}
  }else if(next.phase==='open-eyes'){
    next.elapsed+=dt;
    next.eyeClosure=next.eyeStart*(1-smooth(next.elapsed/sequence.eyeOpenSeconds));
    if(next.elapsed>=sequence.eyeOpenSeconds){next.phase='idle';next.eyeClosure=0;next.elapsed=0;}
  }else{
    current=advanceExpressionBlend(current,requestedTarget,dt,rate);
  }
  next.eyeClosure=clamp(next.eyeClosure,0,1);
  return {blend:current,state:next};
}
