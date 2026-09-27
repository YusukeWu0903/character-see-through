import {advanceSpring} from './expression.mjs';
import {validateExpressionPose} from './expression-pose.mjs?review-runtime=v67-independent-shoulders';
export const initialShoulderCompensation=()=>({position:0,velocity:0});
export function validateShoulderCompensation(p){
 if(p.mode!=='pointer-bank-rebound'||!Number.isFinite(p.maxPixels)||p.maxPixels<=0||p.maxPixels>6||
   !Number.isFinite(p.frequency)||p.frequency<2||p.frequency>10||
   !Number.isFinite(p.damping)||p.damping<.3||p.damping>=1)throw Error('Invalid shoulder compensation');
 validateExpressionPose({mode:'smooth-expression-shoulder-pose',expression:'anxious',headRoll:0,responseRate:1,field:p.field});
}
export function advanceShoulderCompensation(state,target,dt,p){
 return advanceSpring(state,target,dt,{frequency:p.frequency,damping:p.damping,maxPosition:1.25});
}
