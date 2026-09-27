// Miffy candidate: two visible arm regions in one source PNG. This is a
// bounded 2D image field, not independent arm bones or elbow IK.
const clamp=value=>Math.max(-1,Math.min(1,Number.isFinite(value)?value:0));
const smooth=t=>t*t*(3-2*t);

export function validateArmSway(field){
  if(field?.mode!=='bilateral-arm-strip-review'||
     !Array.isArray(field.bands)||field.bands.length<4||field.bands.length>8||
     !Array.isArray(field.sides)||field.sides.length!==2||
     !Number.isInteger(field.stripHeight)||field.stripHeight<2||field.stripHeight>16)
    throw Error('Invalid arm sway field');
  let previous=-1;
  for(const band of field.bands){
    if(!Number.isFinite(band.y)||band.y<=previous||
       !Number.isFinite(band.pixels)||band.pixels<0||band.pixels>14)
      throw Error('Invalid arm sway band');
    previous=band.y;
  }
  if(field.bands[0].pixels!==0)throw Error('Arm shoulder root must stay fixed');
  for(const side of field.sides){
    if(!['left','right'].includes(side.name)||
       !Number.isFinite(side.x0)||!Number.isFinite(side.x1)||
       side.x0<0||side.x1>1280||side.x1<=side.x0||
       !Number.isFinite(side.gain)||side.gain<=0||side.gain>1)
      throw Error('Invalid arm side region');
  }
  if(field.sides[0].x1>=field.sides[1].x0)
    throw Error('Arm side regions overlap');
  return field;
}

export function armOffset(y,drive,side,field){
  const bands=field.bands;
  if(y<=bands[0].y)return 0;
  if(y>=bands.at(-1).y)return bands.at(-1).pixels*clamp(drive)*side.gain;
  let i=0;
  while(i<bands.length-2&&y>bands[i+1].y)i++;
  const a=bands[i],b=bands[i+1];
  const t=smooth((y-a.y)/(b.y-a.y));
  return (a.pixels+(b.pixels-a.pixels)*t)*clamp(drive)*side.gain;
}

export function drawArmSway(target,source,controls,field){
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  if(field.sides.every(side=>Math.abs(controls?.[side.name]||0)<1e-7))return;
  const top=field.bands[0].y,bottom=field.bands.at(-1).y;
  for(const side of field.sides){
    const drive=controls?.[side.name]||0;
    if(Math.abs(drive)<1e-7)continue;
    const width=side.x1-side.x0;
    g.clearRect(side.x0,top,width,bottom-top);
    for(let y=top;y<bottom;y+=field.stripHeight){
      const height=Math.min(field.stripHeight,bottom-y);
      const dx=armOffset(y+height/2,drive,side,field);
      g.drawImage(source,side.x0,y,width,height,
        side.x0+dx,y,width,height);
    }
  }
}

export function drawArmSwayGuide(target,warpedArm,controls,field){
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.lineWidth=2;
  for(const side of field.sides){
    const drive=controls?.[side.name]||0;
    for(const band of field.bands){
      const dx=armOffset(band.y,drive,side,field);
      g.strokeStyle=band.pixels===0?'#ffd475':'#66dff0';
      g.beginPath();g.moveTo(side.x0+dx,band.y);
      g.lineTo(side.x1+dx,band.y);g.stroke();
    }
  }
  g.globalCompositeOperation='destination-in';
  g.drawImage(warpedArm,0,0);
  g.globalCompositeOperation='source-over';
}
