// Drive semantic parents, never individual facial layers. The rig clamps
// combined input to its existing limits after manual and automatic offsets.
export function drivePose(controls, time, mouseX, {idle=true, follow=true}={}) {
  return {
    ...controls,
    body: controls.body + (idle ? .45*Math.sin(time*.65) : 0) + (follow ? -.45*mouseX : 0),
    head: controls.head + (idle ? .35*Math.sin(time*.65-.5) : 0) + (follow ? -.5*mouseX : 0),
  };
}
