import {advanceSpring} from './expression.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
export function skirtWeight(x,y,f){return smooth((y-f.anchorY)/(f.hemY-f.anchorY));}
export function advanceSkirt(state,target,dt,f){
  target=clamp(target,-1,1);
  let next=state;
  const n=Math.max(1,Math.ceil(Math.min(dt,.1)*120));
  for(let i=0;i<n;i++)next=advanceSpring(next,target,Math.min(dt,.1)/n,{frequency:f.frequency,damping:f.damping});
  return {...next,offset:clamp((next.position-target)*f.gainPixels,-f.maxPixels,f.maxPixels)};
}
export function validateSkirt(f){
  if(f.mode!=='anchored-horizontal-lag'||!(f.hemY>f.anchorY)||!(f.maxPixels>0&&f.maxPixels<=12)||!(f.frequency>=1&&f.frequency<=20)||!(f.damping>=.2&&f.damping<=2))throw Error('Invalid skirt sway field');
}
export function drawSkirtGuide(canvas,source,f){
  canvas.width=canvas.height=1280;const g=canvas.getContext('2d');
  for(let y=f.anchorY;y<1280;y+=8){g.fillStyle=`rgba(0,210,240,${skirtWeight(0,y,f)*.45})`;g.fillRect(0,y,1280,8)}
  g.globalCompositeOperation='destination-in';g.drawImage(source,0,0);g.globalCompositeOperation='source-over';
}
