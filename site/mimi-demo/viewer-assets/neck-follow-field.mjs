const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};

export function validateNeckFollow(config){
  if(config?.mode!=='anchored-neck-cylinder-review'||
     !Array.isArray(config.bounds)||config.bounds.length!==4||
     !config.bounds.every(Number.isInteger)||
     config.bounds[0]<0||config.bounds[1]<0||
     config.bounds[2]>1280||config.bounds[3]>1280||
     config.bounds[2]<=config.bounds[0]||config.bounds[3]<=config.bounds[1]||
     !Array.isArray(config.center)||config.center.length!==2||
     !config.center.every(Number.isFinite)||
     !Number.isFinite(config.radius)||config.radius<=0||config.radius>60||
     !Number.isFinite(config.depth)||config.depth<=0||config.depth>40||
     !Number.isFinite(config.rollGain)||config.rollGain<0||config.rollGain>1||
     !Number.isFinite(config.yawGain)||config.yawGain<0||config.yawGain>1||
     !Number.isFinite(config.fullThroughY)||
     config.fullThroughY<config.bounds[1]||
     config.fullThroughY>=config.holdY||
     !Number.isFinite(config.holdY)||config.holdY<=config.bounds[1]||
     config.holdY>config.bounds[3])
    throw Error('脖子連動候選設定無效');
}

export function neckFollowPoint(x,y,rollDegrees,yawDegrees,config){
  const [left,top,right,bottom]=config.bounds;
  if(x<left||x>=right||y<top||y>=bottom)return [x,y];
  const hold=1-smooth((y-config.fullThroughY)/
    (config.holdY-config.fullThroughY));
  const edge=smooth((x-left)/5)*smooth((right-x)/5);
  const roll=rollDegrees*Math.PI/180*config.rollGain;
  const yaw=yawDegrees*Math.PI/180*config.yawGain;
  const dx=x-config.center[0];
  const normalized=clamp(dx/config.radius,-1,1);
  const depth=config.depth*Math.sqrt(Math.max(0,1-normalized*normalized));
  // The crown follows the rigid head roll; the clavicle remains anchored.
  // A shallow cylindrical projection makes yaw strongest toward the head.
  const rollShift=(config.center[1]-y)*Math.sin(roll);
  const curvedShift=dx*(Math.cos(yaw)-1)+depth*Math.sin(yaw);
  return [x+(rollShift+curvedShift)*hold*edge,y];
}

export function drawNeckFollow(target,source,rollDegrees,yawDegrees,config){
  validateNeckFollow(config);
  const g=target.getContext('2d',{willReadFrequently:true});
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  if(Math.abs(rollDegrees)+Math.abs(yawDegrees)<1e-8)return;
  const [left,top,right,bottom]=config.bounds,w=right-left,h=bottom-top;
  const pad=8,sourceX=left-pad,sourceY=top-pad;
  const sourceW=w+pad*2,sourceH=h+pad*2;
  const pixels=source.getContext('2d',{willReadFrequently:true})
    .getImageData(sourceX,sourceY,sourceW,sourceH).data;
  const out=g.createImageData(w,h),dst=out.data;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    let px=x,py=y;
    for(let iteration=0;iteration<4;iteration++){
      const point=neckFollowPoint(px,py,rollDegrees,yawDegrees,config);
      px+=x-point[0];py+=y-point[1];
    }
    const sx=px-sourceX,sy=py-sourceY,x0=Math.floor(sx),y0=Math.floor(sy);
    if(x0<0||y0<0||x0>=sourceW-1||y0>=sourceH-1)continue;
    const tx=sx-x0,ty=sy-y0;
    const indexes=[(y0*sourceW+x0)*4,(y0*sourceW+x0+1)*4,
      ((y0+1)*sourceW+x0)*4,((y0+1)*sourceW+x0+1)*4];
    const weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];
    const di=((y-top)*w+x-left)*4;
    let alpha=0;
    for(let k=0;k<4;k++)alpha+=weights[k]*pixels[indexes[k]+3]/255;
    dst[di+3]=alpha*255;
    if(alpha>0)for(let channel=0;channel<3;channel++){
      let premultiplied=0;
      for(let k=0;k<4;k++)
        premultiplied+=weights[k]*pixels[indexes[k]+3]/255*
          pixels[indexes[k]+channel];
      dst[di+channel]=premultiplied/alpha;
    }
  }
  g.putImageData(out,left,top);
}

export function drawNeckFollowGuide(g,config,rollDegrees,yawDegrees){
  validateNeckFollow(config);
  const [left,top,right,bottom]=config.bounds;
  g.save();g.lineWidth=1.3;g.strokeStyle='rgba(88,237,255,.9)';
  for(let y=top+5;y<bottom;y+=12){
    g.beginPath();
    for(let x=left;x<=right;x+=4){
      const point=neckFollowPoint(x,y,rollDegrees,yawDegrees,config);
      if(x===left)g.moveTo(...point);else g.lineTo(...point);
    }
    g.stroke();
  }
  g.strokeStyle='#ffc864';g.lineWidth=2;
  g.beginPath();g.moveTo(left,config.holdY);g.lineTo(right,config.holdY);g.stroke();
  g.restore();
}
