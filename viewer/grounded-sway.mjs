// Shared canvas-space lean: the contact row is fixed and no pixel changes y.
// This is a planted-foot preview field, not a skeletal IK solver.
export function groundShear(bodyControl,{groundY,maxDegrees}) {
  if (!Number.isFinite(groundY) || !Number.isFinite(maxDegrees) ||
      groundY<0 || maxDegrees<0 || maxDegrees>3)
    throw Error('Invalid ground shear calibration');
  const input=Number.isFinite(bodyControl)?Math.max(-1,Math.min(1,bodyControl)):0;
  const slope=Math.tan(input*maxDegrees*Math.PI/180);
  return [1,0,-slope,1,slope*groundY,0];
}
