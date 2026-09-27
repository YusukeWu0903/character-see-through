const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
const imageCanvases=new WeakMap();

export function validatePitchFollow(config){
  if(config?.mode!=='bounded-vertical-pitch-follow-review'||
     !Array.isArray(config.bounds)||config.bounds.length!==4||
     !config.bounds.every(Number.isInteger)||
     config.bounds[0]<10||config.bounds[1]<0||
     config.bounds[2]>1270||config.bounds[3]>1270||
     config.bounds[2]<=config.bounds[0]||config.bounds[3]<=config.bounds[1]||
     !Number.isFinite(config.fullY)||config.fullY<=config.bounds[1]||
     !Number.isFinite(config.fadeStartY)||config.fadeStartY<config.fullY||
     !Number.isFinite(config.holdY)||config.holdY<=config.fadeStartY||
     config.holdY>config.bounds[3]||
     !Number.isFinite(config.maxPixels)||config.maxPixels<0||config.maxPixels>4||
     (config.upMaxPixels!==undefined&&
       (!Number.isFinite(config.upMaxPixels)||config.upMaxPixels<0||config.upMaxPixels>7))||
     (config.downMaxPixels!==undefined&&
       (!Number.isFinite(config.downMaxPixels)||config.downMaxPixels<0||config.downMaxPixels>7)))
    throw Error('抬低頭次層連動設定無效');
}

export function pitchFollowPoint(x,y,control,config){
  const [left,top,right,bottom]=config.bounds;
  if(x<left||x>=right||y<top||y>=bottom)return [x,y];
  const edge=smooth((x-left)/5)*smooth((right-x)/5);
  const rise=smooth((y-top)/(config.fullY-top));
  const fall=1-smooth((y-config.fadeStartY)/
    (config.holdY-config.fadeStartY));
  const amplitude=control>=0
    ? config.upMaxPixels??config.maxPixels
    : config.downMaxPixels??config.maxPixels;
  return [x,y-clamp(control,-1,1)*amplitude*rise*fall*edge];
}

function canvasFor(source){
  if(typeof source.getContext==='function')return source;
  let canvas=imageCanvases.get(source);
  if(!canvas){
    canvas=document.createElement('canvas');
    canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
    canvas.getContext('2d').drawImage(source,0,0);
    imageCanvases.set(source,canvas);
  }
  return canvas;
}

export function drawPitchFollow(target,source,control,config){
  validatePitchFollow(config);
  const g=target.getContext('2d',{willReadFrequently:true});
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  if(Math.abs(control)<1e-8)return;
  const [left,top,right,bottom]=config.bounds,w=right-left,h=bottom-top;
  const pad=Math.max(6,Math.ceil(Math.max(config.maxPixels,
    config.upMaxPixels??0,config.downMaxPixels??0))+2);
  const sx=left-pad,sy=Math.max(0,top-pad),sw=w+pad*2;
  const sh=h+pad*2;
  const pixels=canvasFor(source).getContext('2d',{willReadFrequently:true})
    .getImageData(sx,sy,sw,sh).data;
  const out=g.createImageData(w,h),dst=out.data;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    let py=y;
    for(let i=0;i<3;i++)py+=y-pitchFollowPoint(x,py,control,config)[1];
    const ix=x-sx,fy=py-sy,y0=Math.floor(fy),t=fy-y0;
    if(y0<0||y0>=sh-1)continue;
    const a=(y0*sw+ix)*4,b=a+sw*4,di=((y-top)*w+x-left)*4;
    const alpha0=pixels[a+3]*(1-t),alpha1=pixels[b+3]*t;
    const alpha=alpha0+alpha1;
    dst[di+3]=alpha;
    if(alpha>0)for(let c=0;c<3;c++)
      dst[di+c]=(pixels[a+c]*alpha0+pixels[b+c]*alpha1)/alpha;
  }
  g.putImageData(out,left,top);
}

export function drawPitchFollowGuide(ctx,config,control){
  validatePitchFollow(config);
  const [left,top,right,bottom]=config.bounds;
  ctx.save();ctx.strokeStyle='rgba(95,235,255,.86)';ctx.lineWidth=1.2;
  for(let y=top+8;y<bottom;y+=20){
    ctx.beginPath();
    for(let x=left;x<right;x+=5){
      const point=pitchFollowPoint(x,y,control,config);
      if(x===left)ctx.moveTo(...point);else ctx.lineTo(...point);
    }
    ctx.stroke();
  }
  ctx.strokeStyle='#ffd16b';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(left,config.holdY);ctx.lineTo(right,config.holdY);
  ctx.stroke();ctx.restore();
}
