import {validateHeadGeometry} from './head-geometry.mjs';
import {headLightingFactor,balancedHeadLightingColor,pitchHeadLightingColor} from './head-lighting.mjs?review-runtime=v37-pitch-light';
import {pitchProportionOffset,validateHeadPitchProportion} from './head-pitch-proportion.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t)};
const maps=new WeakMap();

export function validateHeadSurface(config){
  if(config?.mode!=='projected-head-texture-candidate' ||
     !Array.isArray(config.bounds)||config.bounds.length!==4||
     !config.bounds.every(Number.isInteger)||
     config.bounds[0]<0||config.bounds[1]<0||
     config.bounds[2]>1280||config.bounds[3]>1280||
     config.bounds[2]-config.bounds[0]<120||
     config.bounds[3]-config.bounds[1]<120||
     !Number.isFinite(config.maxDegrees)||config.maxDegrees<=0||
     config.maxDegrees>12||
     !Number.isFinite(config.edgeFade)||config.edgeFade<4||
     config.edgeFade>40||
     !Number.isFinite(config.neckHoldY)||
     config.neckHoldY<=config.bounds[1]||
     config.neckHoldY>=config.bounds[3]||
     !config.geometry)
    throw Error('頭部曲面畫素候選設定無效');
  validateHeadGeometry(config.geometry);
}

export function headSurfacePoint(x,y,degrees,config,pitchDegrees=0,pitchProfile=null){
  const [left,top,right,bottom]=config.bounds;
  const edge=config.edgeFade;
  const weight=smooth((x-left)/edge)*smooth((right-x)/edge)*
    smooth((y-top)/edge)*(1-smooth((y-config.neckHoldY)/(bottom-config.neckHoldY)));
  if(weight<=0||Math.abs(degrees)+Math.abs(pitchDegrees)<1e-8)return [x,y];
  const geometry=config.geometry;
  const [cx,cy]=geometry.center,[rx,ry,rz]=geometry.radii;
  const dx=x-cx,dy=y-cy,u=dx/rx,v=dy/ry;
  // A regularized face dome keeps the centre depth of the ellipsoid while
  // making its rim slope finite, so inverse texture sampling cannot fold.
  const depth=rz*Math.pow(Math.max(0,1-u*u-v*v),1.2);
  const angle=clamp(degrees,-config.maxDegrees,config.maxDegrees)*Math.PI/180;
  const cosine=Math.cos(angle),sine=Math.sin(angle);
  const rotatedX=dx*cosine+depth*sine;
  const rotatedZ=depth*cosine-dx*sine;
  const baselineScale=geometry.cameraDistance/(geometry.cameraDistance-depth);
  let rotatedY=dy,projectedZ=rotatedZ;
  if(!pitchProfile&&Math.abs(pitchDegrees)>1e-8){
    const pitch=clamp(pitchDegrees,-6,6)*Math.PI/180;
    rotatedY=dy*Math.cos(pitch)-rotatedZ*Math.sin(pitch);
    projectedZ=rotatedZ*Math.cos(pitch)+dy*Math.sin(pitch);
  }
  const rotatedScale=geometry.cameraDistance/(geometry.cameraDistance-projectedZ);
  const target=[x+rotatedX*rotatedScale-dx*baselineScale,
    y+rotatedY*rotatedScale-dy*baselineScale];
  if(pitchProfile){
    const offset=pitchProportionOffset(x,y,pitchDegrees,pitchProfile,geometry);
    target[0]+=offset[0];target[1]+=offset[1];
  }
  return [x+(target[0]-x)*weight,y+(target[1]-y)*weight];
}

function inverseMap(target,degrees,config,gridStep=1,pitchDegrees=0,pitchProfile=null){
  let entry=maps.get(target);
  const key=degrees.toFixed(3)+'|'+pitchDegrees.toFixed(3)+'|'+gridStep+'|'+JSON.stringify(config)+'|'+JSON.stringify(pitchProfile);
  if(entry?.key===key)return entry;
  const [left,top,right,bottom]=config.bounds,w=right-left,h=bottom-top;
  const sx=new Float32Array(w*h),sy=new Float32Array(w*h);
  if(gridStep===1){
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      let px=x,py=y;
      for(let n=0;n<6;n++){
        const projected=headSurfacePoint(px,py,degrees,config,pitchDegrees,pitchProfile);
        px+=x-projected[0];py+=y-projected[1];
      }
      const i=(y-top)*w+x-left;sx[i]=px;sy[i]=py;
    }
  }else{
    const nx=Math.ceil(w/gridStep)+1,ny=Math.ceil(h/gridStep)+1;
    const nodeX=new Float32Array(nx*ny),nodeY=new Float32Array(nx*ny);
    for(let gy=0;gy<ny;gy++)for(let gx=0;gx<nx;gx++){
      const x=Math.min(right,left+gx*gridStep);
      const y=Math.min(bottom,top+gy*gridStep);
      let px=x,py=y;
      for(let n=0;n<6;n++){
        const projected=headSurfacePoint(px,py,degrees,config,pitchDegrees,pitchProfile);
        px+=x-projected[0];py+=y-projected[1];
      }
      const i=gy*nx+gx;nodeX[i]=px;nodeY[i]=py;
    }
    for(let y=top;y<bottom;y++){
      const gy=Math.floor((y-top)/gridStep);
      const y0=top+gy*gridStep;
      const fy=(y-y0)/(Math.min(bottom,y0+gridStep)-y0);
      for(let x=left;x<right;x++){
        const gx=Math.floor((x-left)/gridStep);
        const x0=left+gx*gridStep;
        const fx=(x-x0)/(Math.min(right,x0+gridStep)-x0);
        const a=gy*nx+gx,b=a+1,c=a+nx,d=c+1;
        const w00=(1-fx)*(1-fy),w10=fx*(1-fy);
        const w01=(1-fx)*fy,w11=fx*fy;
        const i=(y-top)*w+x-left;
        sx[i]=nodeX[a]*w00+nodeX[b]*w10+nodeX[c]*w01+nodeX[d]*w11;
        sy[i]=nodeY[a]*w00+nodeY[b]*w10+nodeY[c]*w01+nodeY[d]*w11;
      }
    }
  }
  entry={key,sx,sy};maps.set(target,entry);return entry;
}

export function drawHeadSurface(target,source,degrees,config,lighting=null,options={}){
  validateHeadSurface(config);
  const g=target.getContext('2d',{willReadFrequently:true});
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);
  const pitchDegrees=options.pitchDegrees||0;
  const pitchProfile=options.pitchProfile||null;
  if(pitchProfile)validateHeadPitchProportion(pitchProfile);
  if(Math.abs(degrees)+Math.abs(pitchDegrees)<1e-8){g.drawImage(source,0,0);return;}
  g.drawImage(source,0,0);
  const [left,top,right,bottom]=config.bounds,w=right-left,h=bottom-top;
  const pad=Math.ceil(config.geometry.radii[2]*Math.sin(config.maxDegrees*Math.PI/180))+5;
  const sampleLeft=left-pad,sampleTop=Math.max(0,top-pad);
  const sampleW=w+pad*2,sampleH=Math.min(source.height-sampleTop,bottom-top+pad*2);
  const pixels=source.getContext('2d',{willReadFrequently:true}).
    getImageData(sampleLeft,sampleTop,sampleW,sampleH).data;
  const out=g.createImageData(w,h),dst=out.data;
  const map=inverseMap(target,degrees,config,options.inverseGridStep||1,pitchDegrees,pitchProfile);
  const pitchLightingActive=Boolean(lighting?.pitchConfig&&Math.abs(pitchDegrees)>1e-8);
  for(let i=0;i<w*h;i++){
    const x=map.sx[i]-sampleLeft,y=map.sy[i]-sampleTop;
    const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
    if(x0<0||y0<0||x0>=sampleW-1||y0>=sampleH-1)continue;
    const p00=(y0*sampleW+x0)*4,p10=p00+4;
    const p01=p00+sampleW*4,p11=p01+4;
    const sources=[p00,p10,p01,p11];
    const weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];
    let alpha=0;
    for(let k=0;k<4;k++)alpha+=weights[k]*pixels[sources[k]+3]/255;
    const di=i*4;dst[di+3]=alpha*255;
    if(alpha>0)for(let channel=0;channel<3;channel++){
      let color=0;
      for(let k=0;k<4;k++)
        color+=weights[k]*pixels[sources[k]+3]/255*pixels[sources[k]+channel];
      dst[di+channel]=color/alpha;
    }
    if(alpha>0&&lighting?.strength>0){
      const color=[dst[di],dst[di+1],dst[di+2]];
      if(['balanced-frontal-review','upper-balanced-review'].includes(lighting.config.mode)){
        const balanced=balancedHeadLightingColor(map.sx[i],map.sy[i],degrees,
          config,lighting.config,color,lighting.strength);
        for(let channel=0;channel<3;channel++)dst[di+channel]=balanced[channel];
      }else{
        const factor=headLightingFactor(map.sx[i],map.sy[i],degrees,config,
          lighting.config,color,lighting.strength);
        for(let channel=0;channel<3;channel++)dst[di+channel]*=factor;
      }
      if(pitchLightingActive){
        const pitched=pitchHeadLightingColor(map.sx[i],map.sy[i],pitchDegrees,
          config,lighting.pitchConfig,[dst[di],dst[di+1],dst[di+2]],
          lighting.strength);
        for(let channel=0;channel<3;channel++)dst[di+channel]=pitched[channel];
      }
    }
  }
  g.putImageData(out,left,top);
}

export function drawHeadSurfaceGuide(ctx,config,degrees,mapPoint=point=>point,pitchDegrees=0,pitchProfile=null){
  validateHeadSurface(config);
  const [left,top,right,bottom]=config.bounds;
  const put=(x,y)=>mapPoint(headSurfacePoint(x,y,degrees,config,pitchDegrees,pitchProfile));
  ctx.save();ctx.lineWidth=1.3;ctx.strokeStyle='rgba(70,235,255,.9)';
  for(let y=top+12;y<bottom;y+=16){
    ctx.beginPath();
    for(let x=left;x<=right;x+=4){const p=put(x,y);
      if(x===left)ctx.moveTo(...p);else ctx.lineTo(...p)}
    ctx.stroke();
  }
  for(let x=left+12;x<right;x+=16){
    ctx.beginPath();
    for(let y=top;y<=bottom;y+=4){const p=put(x,y);
      if(y===top)ctx.moveTo(...p);else ctx.lineTo(...p)}
    ctx.stroke();
  }
  ctx.strokeStyle='#ffd16b';ctx.lineWidth=2;
  for(const point of Object.values(config.geometry.landmarks)){
    const p=put(point[0],point[1]);
    ctx.beginPath();ctx.arc(p[0],p[1],2.8,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
