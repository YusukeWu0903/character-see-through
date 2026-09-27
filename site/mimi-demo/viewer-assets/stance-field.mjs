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
  if(field.hipTilt){
    const t=field.hipTilt;
    if(!Number.isFinite(t.centerX)||!Number.isFinite(t.topY)||
       !Number.isFinite(t.bottomY)||!Number.isFinite(t.maxDegrees)||
       t.topY<300||t.bottomY>1050||t.topY>=t.bottomY||
       t.maxDegrees<0||t.maxDegrees>2||
       !Number.isInteger(t.stripHeight)||t.stripHeight<2||t.stripHeight>16)
      throw Error('Invalid hip tilt field');
  }
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

export function hipTiltOffset(x,y,controls,field){
  const t=field?.hipTilt;
  if(!t||y<=t.topY||y>=t.bottomY)return 0;
  const progress=(y-t.topY)/(t.bottomY-t.topY);
  const weight=Math.sin(Math.PI*progress)**2;
  return (x-t.centerX)*Math.tan(t.maxDegrees*Math.PI/180)*
    clamp(controls?.body)*weight;
}

let tiltSource=null;
function drawHipTilt(target,field,controls){
  const t=field.hipTilt;
  if(!t||!clamp(controls?.body))return;
  if(!tiltSource||tiltSource.width!==target.width||
     tiltSource.height!==target.height){
    tiltSource=document.createElement('canvas');
    tiltSource.width=target.width;tiltSource.height=target.height;
  }
  const from=tiltSource.getContext('2d');
  from.setTransform(1,0,0,1,0,0);
  from.clearRect(0,0,target.width,target.height);
  from.drawImage(target,0,0);
  const g=target.getContext('2d');
  // The source art occupies only the central body band here. Sampling a
  // cropped pelvis tile avoids redrawing the full 1280px texture per strip.
  const left=Math.max(0,Math.floor(t.centerX-245));
  const right=Math.min(target.width,Math.ceil(t.centerX+255));
  const width=right-left;
  const pad=12;
  for(let y=t.topY;y<t.bottomY;y+=t.stripHeight){
    const height=Math.min(t.stripHeight,t.bottomY-y);
    const centerY=y+height/2;
    const shear=hipTiltOffset(t.centerX+1,centerY,controls,field);
    g.save();
    g.beginPath();g.rect(left,y,width,height);g.clip();
    g.clearRect(left,y,width,height);
    g.transform(1,shear,0,1,0,-shear*t.centerX);
    const sourceY=Math.max(0,y-pad);
    const sourceHeight=Math.min(target.height-sourceY,height+pad*2);
    g.drawImage(tiltSource,left,sourceY,width,sourceHeight,
      left,sourceY,width,sourceHeight);
    g.restore();
  }
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
  drawHipTilt(target,field,controls);
}
