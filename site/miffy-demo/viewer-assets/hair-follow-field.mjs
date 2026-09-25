const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const fastSources=new WeakMap(),fastTargets=new WeakMap();

export function validateHairFollow(config){
  if(config?.mode!=='opposed-curved-yaw-spring-review'||
     !Number.isFinite(config.maxYaw)||config.maxYaw<=0||config.maxYaw>12||
     !config.parts||!['fronthair','backhair'].every(name=>{
       const part=config.parts[name];
       return part&&Array.isArray(part.bounds)&&part.bounds.length===4&&
         part.bounds.every(Number.isInteger)&&part.bounds[0]>=0&&
         part.bounds[1]>=0&&part.bounds[2]<=1280&&part.bounds[3]<=1280&&
         part.bounds[2]>part.bounds[0]&&part.bounds[3]>part.bounds[1]&&
         Number.isFinite(part.rootY)&&part.rootY>=part.bounds[1]&&
         part.rootY<part.tipY&&part.tipY<=part.bounds[3]&&
         Number.isFinite(part.maxPixels)&&Math.abs(part.maxPixels)<=7.5&&
         Number.isFinite(part.frequency)&&part.frequency>=1&&part.frequency<=20&&
         Number.isFinite(part.damping)&&part.damping>=.5&&part.damping<=1.2;
     }))throw Error('前後髮慣性候選設定無效');
  if(config.parts.fronthair.maxPixels<=0||config.parts.backhair.maxPixels>=0)
    throw Error('前髮與後髮必須朝相反方向');
  if(config.sampling!==undefined&&config.sampling!=='analytic-inverse')
    throw Error('頭髮取樣模式無效');
}

export function hairFollowPoint(x,y,drive,part){
  const [left,top,right,bottom]=part.bounds;
  if(x<left||x>=right||y<top||y>=bottom)return [x,y];
  const t=smooth((y-part.rootY)/(part.tipY-part.rootY));
  const edge=smooth((x-left)/5)*smooth((right-x)/5);
  const motion=clamp(drive,-1.15,1.15)*part.maxPixels*t*edge;
  // A root-anchored curved field bends the mid-strand slightly; the temporal
  // spring supplies the restrained overshoot and return at direction changes.
  const arc=motion*.12*Math.sin(Math.PI*t);
  return [x+motion,y+arc];
}

export function drawHairFollow(target,source,drive,part,sampling='legacy'){
  if(sampling==='analytic-inverse')
    return drawHairFollowFast(target,source,drive,part);
  const g=target.getContext('2d',{willReadFrequently:true});
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  if(Math.abs(drive)<1e-8)return;
  const [left,top,right,bottom]=part.bounds,w=right-left,h=bottom-top;
  const pad=9,sourceX=left-pad,sourceY=Math.max(0,top-pad);
  const sourceW=w+pad*2,sourceH=h+pad*2;
  const pixels=source.getContext('2d',{willReadFrequently:true})
    .getImageData(sourceX,sourceY,sourceW,sourceH).data;
  const out=g.createImageData(w,h),dst=out.data;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    let px=x,py=y;
    for(let iteration=0;iteration<4;iteration++){
      const point=hairFollowPoint(px,py,drive,part);
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

function drawHairFollowFast(target,source,drive,part){
  const g=target.getContext('2d',{willReadFrequently:true});
  if(fastTargets.get(target)?.source!==source){
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,target.width,target.height);
    g.drawImage(source,0,0);
    fastTargets.set(target,{source,image:null});
  }
  if(Math.abs(drive)<1e-8)return;
  const [left,top,right,bottom]=part.bounds,w=right-left,h=bottom-top;
  const pad=9,sourceX=left-pad,sourceY=Math.max(0,top-pad);
  const sourceW=w+pad*2,sourceH=h+pad*2;
  let cached=fastSources.get(source);
  if(!cached||cached.part!==part){
    cached={part,pixels:source.getContext('2d',{willReadFrequently:true})
      .getImageData(sourceX,sourceY,sourceW,sourceH).data};
    fastSources.set(source,cached);
  }
  const pixels=cached.pixels;
  let out=fastTargets.get(target).image;
  if(!out||out.width!==w||out.height!==h){
    out=g.createImageData(w,h);
    fastTargets.get(target).image=out;
  }
  const dst=out.data;
  for(let y=top;y<bottom;y++){
    // Across the occupied interior the horizontal taper is exactly one.
    // Solve that row once, leaving the narrow edge bands on the original
    // four-iteration inverse to keep the field boundary continuous.
    let px=(left+right)/2,py=y;
    for(let iteration=0;iteration<4;iteration++){
      const point=hairFollowPoint(px,py,drive,part);
      px+=(left+right)/2-point[0];py+=y-point[1];
    }
    const rowShift=(left+right)/2-px,rowSourceY=py-sourceY;
    for(let x=left;x<right;x++){
      let sx=x-rowShift-sourceX,sy=rowSourceY;
      if(x<left+10||x>=right-10){
        let ex=x,ey=y;
        for(let iteration=0;iteration<4;iteration++){
          const point=hairFollowPoint(ex,ey,drive,part);
          ex+=x-point[0];ey+=y-point[1];
        }
        sx=ex-sourceX;sy=ey-sourceY;
      }
      const x0=Math.floor(sx),y0=Math.floor(sy);
      const di=((y-top)*w+x-left)*4;
      if(x0<0||y0<0||x0>=sourceW-1||y0>=sourceH-1){
        dst[di]=dst[di+1]=dst[di+2]=dst[di+3]=0;
        continue;
      }
      const tx=sx-x0,ty=sy-y0;
      const w00=(1-tx)*(1-ty),w10=tx*(1-ty);
      const w01=(1-tx)*ty,w11=tx*ty;
      const p00=(y0*sourceW+x0)*4,p10=p00+4;
      const p01=p00+sourceW*4,p11=p01+4;
      const a00=pixels[p00+3]/255,a10=pixels[p10+3]/255;
      const a01=pixels[p01+3]/255,a11=pixels[p11+3]/255;
      const q00=w00*a00,q10=w10*a10,q01=w01*a01,q11=w11*a11;
      const alpha=q00+q10+q01+q11;
      dst[di+3]=alpha*255;
      if(alpha>0){
        dst[di]=(q00*pixels[p00]+q10*pixels[p10]+
          q01*pixels[p01]+q11*pixels[p11])/alpha;
        dst[di+1]=(q00*pixels[p00+1]+q10*pixels[p10+1]+
          q01*pixels[p01+1]+q11*pixels[p11+1])/alpha;
        dst[di+2]=(q00*pixels[p00+2]+q10*pixels[p10+2]+
          q01*pixels[p01+2]+q11*pixels[p11+2])/alpha;
      }else dst[di]=dst[di+1]=dst[di+2]=0;
    }
  }
  g.putImageData(out,left,top);
}

export function drawHairFollowGuide(g,part,drive){
  const [left,top,right,bottom]=part.bounds;
  g.save();g.lineWidth=1.2;g.strokeStyle='rgba(89,232,255,.85)';
  for(let y=top+8;y<bottom;y+=28){
    g.beginPath();
    for(let x=left;x<=right;x+=6){
      const point=hairFollowPoint(x,y,drive,part);
      if(x===left)g.moveTo(...point);else g.lineTo(...point);
    }
    g.stroke();
  }
  g.strokeStyle='#ffce6a';g.lineWidth=2;
  g.beginPath();g.moveTo(left,part.rootY);g.lineTo(right,part.rootY);g.stroke();
  g.restore();
}
