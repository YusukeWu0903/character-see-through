// Bounded arm fields for two visible arm regions in one source PNG.
// This is a sampled 2D image field, not independent elbow bones or IK.
const clamp=value=>Math.max(-1,Math.min(1,Number.isFinite(value)?value:0));
const clampUnit=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const smooth=t=>t*t*(3-2*t);

export function validateArmSway(field){
  const vector=field?.mode==='bilateral-arm-vector-review';
  if((!vector&&field?.mode!=='bilateral-arm-strip-review')||
     (!vector&&(!Array.isArray(field.bands)||field.bands.length<4||field.bands.length>8))||
     !Array.isArray(field.sides)||field.sides.length!==2||
     !Number.isInteger(field.stripHeight)||field.stripHeight<2||field.stripHeight>24)
    throw Error('Invalid arm sway field');
  if(vector&&field.driveMode!=='directed-reach')throw Error('Vector arm field needs directed reach controls');
  if(!vector){
    let previous=-1;
    for(const band of field.bands){
      if(!Number.isFinite(band.y)||band.y<=previous||
         !Number.isFinite(band.pixels)||band.pixels<0||band.pixels>14)
        throw Error('Invalid arm sway band');
      previous=band.y;
    }
    if(field.bands[0].pixels!==0)throw Error('Arm shoulder root must stay fixed');
  }
  for(const side of field.sides){
    if(!['left','right'].includes(side.name)||
       !Number.isFinite(side.x0)||!Number.isFinite(side.x1)||
       side.x0<0||side.x1>1280||side.x1<=side.x0||
       (!vector&&(!Number.isFinite(side.gain)||side.gain<=0||side.gain>1)))
      throw Error('Invalid arm side region');
    if(vector){
      const bands=side.bands;
      if(!Array.isArray(bands)||bands.length<4||bands.length>8||
         !bands.every(b=>Number.isFinite(b.y)&&Number.isFinite(b.dx)&&Number.isFinite(b.dy)&&
           Math.hypot(b.dx,b.dy)<=14))
        throw Error('Invalid vector arm profile');
      const delta=bands.at(-1).y-bands[0].y;
      if(!delta||bands.some((b,i)=>i&&Math.sign(b.y-bands[i-1].y)!==Math.sign(delta)))
        throw Error('Vector arm anchors must follow one measured direction');
      if(Math.hypot(bands[0].dx,bands[0].dy)>.001)
        throw Error('Arm shoulder root must stay fixed');
    }
  }
  if(field.sides[0].x1>=field.sides[1].x0)
    throw Error('Arm side regions overlap');
  return field;
}

export function armVector(y,drive,side,field){
  const vector=field.mode==='bilateral-arm-vector-review';
  const bands=vector?side.bands:field.bands;
  const sorted=[...bands].sort((a,b)=>a.y-b.y);
  const gain=vector&&field.driveMode==='directed-reach'?clampUnit(drive):clamp(drive);
  const sample=band=>vector?[band.dx,band.dy]:[band.pixels*side.gain,0];
  let offset;
  if(y<=sorted[0].y)offset=sample(sorted[0]);
  else if(y>=sorted.at(-1).y)offset=sample(sorted.at(-1));
  else{
    let i=0;while(i<sorted.length-2&&y>sorted[i+1].y)i++;
    const a=sorted[i],b=sorted[i+1],t=smooth((y-a.y)/(b.y-a.y));
    const av=sample(a),bv=sample(b);offset=av.map((v,k)=>v+(bv[k]-v)*t);
  }
  return [offset[0]*gain,offset[1]*gain].map(v=>Math.abs(v)<1e-12?0:v);
}

export function armOffset(y,drive,side,field){
  return armVector(y,drive,side,field)[0];
}

export function drawArmSway(target,source,controls,field){
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  if(field.sides.every(side=>Math.abs(controls?.[side.name]||0)<1e-7))return;
  for(const side of field.sides){
    const drive=controls?.[side.name]||0;
    if(Math.abs(drive)<1e-7)continue;
    const bands=field.mode==='bilateral-arm-vector-review'?side.bands:field.bands;
    const top=Math.min(...bands.map(b=>b.y)),bottom=Math.max(...bands.map(b=>b.y));
    const width=side.x1-side.x0;
    g.clearRect(side.x0,top,width,bottom-top);
    for(let y=top;y<bottom;y+=field.stripHeight){
      const height=Math.min(field.stripHeight,bottom-y);
      const [dx,dy]=armVector(y+height/2,drive,side,field);
      g.drawImage(source,side.x0,y,width,height,
        side.x0+dx,y+dy,width,height);
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
    const bands=field.mode==='bilateral-arm-vector-review'?side.bands:field.bands;
    let prior=null;
    for(const band of bands){
      const [dx,dy]=armVector(band.y,drive,side,field);
      const root=field.mode==='bilateral-arm-vector-review'?
        Math.hypot(band.dx,band.dy)<.001:band.pixels===0;
      g.strokeStyle=root?'#ffd475':'#66dff0';
      g.beginPath();g.moveTo(side.x0+dx,band.y+dy);
      g.lineTo(side.x1+dx,band.y+dy);g.stroke();
      if(prior){
        g.beginPath();g.moveTo(side.x0+prior.dx,prior.y+prior.dy);
        g.lineTo(side.x0+dx,band.y+dy);g.stroke();
        g.beginPath();g.moveTo(side.x1+prior.dx,prior.y+prior.dy);
        g.lineTo(side.x1+dx,band.y+dy);g.stroke();
      }
      prior={y:band.y,dx,dy};
    }
  }
  g.globalCompositeOperation='destination-in';
  g.drawImage(warpedArm,0,0);
  g.globalCompositeOperation='source-over';
}
