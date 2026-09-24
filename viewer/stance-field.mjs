// A small shared standing-pose field in native canvas pixels. This is a
// visual weight-transfer cue, not an anatomical skeleton or foot IK solver.
const clamp = value => Math.max(-1,Math.min(1,Number.isFinite(value)?value:0));
const smooth = t => t*t*(3-2*t);

export function validateStanceField(field,canvasHeight=1280) {
  if (field?.mode!=='shared-stance-field' || !Array.isArray(field.bands) ||
      field.bands.length<3 || field.bands.length>16 ||
      !Number.isFinite(field.groundY) || field.groundY<1100 ||
      field.groundY>canvasHeight || !Number.isInteger(field.stripHeight) ||
      field.stripHeight<1 || field.stripHeight>8) throw Error('Invalid stance field');
  let previous=-1;
  for(const band of field.bands){
    if(!Number.isFinite(band.y)||band.y<=previous||band.y>canvasHeight ||
       !['body','torso','head'].every(key=>Number.isFinite(band[key])&&
         Math.abs(band[key])<=24)) throw Error('Invalid stance band');
    previous=band.y;
  }
  if(field.bands[0].y!==0 || field.bands.at(-1).y!==field.groundY ||
     ['body','torso','head'].some(key=>field.bands.at(-1)[key]!==0))
    throw Error('Stance ground contact must be fixed');
  return field;
}

export function stanceOffset(y,controls,field) {
  const bands=field.bands;
  const position=Math.max(0,Math.min(field.groundY,y));
  let i=0;
  while(i<bands.length-2 && position>bands[i+1].y)i++;
  const a=bands[i],b=bands[i+1];
  const t=smooth(Math.max(0,Math.min(1,(position-a.y)/(b.y-a.y))));
  return ['body','torso','head'].reduce((sum,key)=>
    sum+clamp(controls?.[key])*((1-t)*a[key]+t*b[key]),0);
}

export function drawStanceField(target,source,controls,field) {
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  const inactive=['body','torso','head'].every(key=>!clamp(controls?.[key]));
  if(inactive){g.drawImage(source,0,0);return;}
  // Warp a single composited image. All layer overlaps therefore share the
  // same displacement and cannot open seams because of different parents.
  const step=field.stripHeight;
  for(let y=0;y<target.height;y+=step){
    const height=Math.min(step,target.height-y);
    const dx=stanceOffset(y+height/2,controls,field);
    g.drawImage(source,0,y,target.width,height,dx,y,target.width,height);
  }
}
