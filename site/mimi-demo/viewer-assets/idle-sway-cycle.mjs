const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smoothTurnProgress=z=>6*z**3-8*z**4+3*z**5;

// Near-constant travel with a short, smooth turn around each extreme.
// Unlike clipping an oversized sine, this has no flat top or bottom.
export function quickTurnSway(phase,turnFraction=.06){
  if(!Number.isFinite(phase))return 0;
  const turn=clamp(Number.isFinite(turnFraction)?turnFraction:.06,.01,.2);
  const cycle=((phase%TAU)+TAU)%TAU;
  const half=cycle/Math.PI;
  const rising=half<1;
  const h=rising?half:half-1;
  let progress;
  if(h<turn){
    const z=h/turn;
    progress=turn*smoothTurnProgress(z);
  }else if(h>1-turn){
    const z=(1-h)/turn;
    progress=1-turn*smoothTurnProgress(z);
  }else progress=h;
  return rising?-1+2*progress:1-2*progress;
}

// A smooth periodic curve that accelerates through center and eases naturally
// into each reversal. Unlike a clipped over-range sine, its extrema have no
// flat dwell.
export function curvedSway(phase){
  return Number.isFinite(phase)?Math.sin(phase):0;
}
