// Miffy-only non-production chest follow-through. Legacy composite fields
// remain available for rollback; the newer local mode deforms only topwear.
import {drawStanceField,stanceOffset} from './stance-field.mjs';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const sourcePixels=new WeakMap();
const bilateralMode=mode=>['topwear-local-bilateral',
  'topwear-local-bilateral-pixel','topwear-local-bilateral-pixel-xy'].includes(mode);

export function validateBustField(field){
  if(!['composite-chest-field','composite-chest-overlay',
        'topwear-local-bilateral','topwear-local-bilateral-pixel',
        'topwear-local-bilateral-pixel-xy'].includes(field?.mode) ||
     ![field.centerX,field.centerY,field.radiusX,field.radiusY,field.maxPixels]
       .every(Number.isFinite) ||
     field.centerX<450 || field.centerX>800 || field.centerY<260 || field.centerY>430 ||
     field.radiusX<50 || field.radiusX>170 || field.radiusY<45 || field.radiusY>140 ||
     field.maxPixels<=0 ||
     field.maxPixels>(field.mode==='topwear-local-bilateral-pixel-xy'?16:
       bilateralMode(field.mode)?12:4) ||
     !Number.isInteger(field.tileWidth) || field.tileWidth<8 || field.tileWidth>32 ||
     !Number.isInteger(field.tileHeight) || field.tileHeight<1 || field.tileHeight>8)
    throw Error('胸部變形範圍無效');
  if(bilateralMode(field.mode) &&
     (!Array.isArray(field.centers)||field.centers.length!==2||
      !field.centers.every(center=>Array.isArray(center)&&center.length===2&&
        center.every(Number.isFinite)&&center[0]>500&&center[0]<760&&
        center[1]>270&&center[1]<400)||
      !Number.isFinite(field.springFrequency)||field.springFrequency<4||
      field.springFrequency>12||!Number.isFinite(field.springDamping)||
      field.springDamping<.3||field.springDamping>1.2))
    throw Error('胸部左右權重或彈性設定無效');
  if(field.lowerRadiusY!==undefined &&
     (!bilateralMode(field.mode)||!Number.isFinite(field.lowerRadiusY)||
      field.lowerRadiusY<35||field.lowerRadiusY>field.radiusY))
    throw Error('胸部下緣權重範圍無效');
  if(field.mode==='topwear-local-bilateral-pixel-xy' &&
     (!Number.isFinite(field.followMaxPixels)||field.followMaxPixels<=0||
      field.followMaxPixels>16||
      !Number.isFinite(field.followSpringFrequency)||
      field.followSpringFrequency<4||field.followSpringFrequency>12||
      !Number.isFinite(field.followSpringDamping)||
      field.followSpringDamping<.3||field.followSpringDamping>1.2))
    throw Error('胸部左右跟隨範圍無效');
  return field;
}

export function bustWeight(x,y,field){
  const radiusY=y>=field.centerY?(field.lowerRadiusY??field.radiusY):field.radiusY;
  const yy=Math.abs((y-field.centerY)/radiusY);
  if(yy>=1)return 0;
  if(bilateralMode(field.mode)){
    const lateral=field.centers.reduce((weight,center)=>{
      const xx=Math.abs((x-center[0])/field.radiusX);
      return weight+(xx>=1?0:1-smooth(xx));
    },0);
    return Math.min(1,lateral)*(1-smooth(yy));
  }
  const xx=Math.abs((x-field.centerX)/field.radiusX);
  if(xx>=1)return 0;
  return (1-smooth(xx))*(1-smooth(yy));
}

// A review-only picture of the exact local weight function, not a second rig.
// It is drawn at topwear's own draw slot so later hair/arms occlude it.
export function drawBustFieldGuide(target,source,field){
  if(!bilateralMode(field.mode))throw Error('此候選沒有上衣局部變形範圍');
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  const left=Math.max(0,Math.floor(
    Math.min(...field.centers.map(center=>center[0]))-field.radiusX));
  const right=Math.min(target.width,Math.ceil(
    Math.max(...field.centers.map(center=>center[0]))+field.radiusX));
  const top=Math.max(0,Math.floor(field.centerY-field.radiusY));
  const bottom=Math.min(target.height,Math.ceil(
    field.centerY+(field.lowerRadiusY??field.radiusY)));
  const cell=12;
  for(let y=top;y<bottom;y+=cell)for(let x=left;x<right;x+=cell){
    const w=bustWeight(x+Math.min(cell,right-x)/2,
      y+Math.min(cell,bottom-y)/2,field);
    if(w<.02)continue;
    const width=Math.min(cell,right-x),height=Math.min(cell,bottom-y);
    g.fillStyle=`rgba(35,219,255,${.09+.38*w})`;
    g.fillRect(x,y,width,height);
    g.strokeStyle=`rgba(105,246,255,${.18+.62*w})`;
    g.lineWidth=1;
    g.strokeRect(x+.5,y+.5,width-1,height-1);
  }
  // Exact small-weight envelope, sampled from the same function as the warp.
  const rows=[];
  for(let y=top;y<bottom;y+=3){
    let first=null,last=null;
    for(let x=left;x<right;x+=2){
      if(bustWeight(x+.5,y+.5,field)>=.02){
        if(first===null)first=x;
        last=x;
      }
    }
    if(first!==null)rows.push([first,y,last+2]);
  }
  if(rows.length){
    g.beginPath();
    g.moveTo(rows[0][0],rows[0][1]);
    for(const row of rows)g.lineTo(row[0],row[1]);
    for(let i=rows.length-1;i>=0;i--)g.lineTo(rows[i][2],rows[i][1]);
    g.closePath();
    g.strokeStyle='rgba(255,210,103,.96)';g.lineWidth=2.5;g.stroke();
  }
  g.globalCompositeOperation='destination-in';
  g.drawImage(source,0,0);
  g.globalCompositeOperation='source-over';
}

export function bustOffset(x,y,amplitude,field){
  return clamp(amplitude,-field.maxPixels,field.maxPixels)*bustWeight(x,y,field);
}

function drawBustPixelField(g,source,amplitude,field,width,height){
  let cached=sourcePixels.get(source);
  if(!cached||cached.width!==width||cached.height!==height){
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(source,0,0);
    cached={width,height,pixels:context.getImageData(0,0,width,height).data};
    sourcePixels.set(source,cached);
  }
  const left=Math.max(0,Math.floor(
    Math.min(...field.centers.map(center=>center[0]))-field.radiusX));
  const right=Math.min(width,Math.ceil(
    Math.max(...field.centers.map(center=>center[0]))+field.radiusX));
  const top=Math.max(0,Math.floor(field.centerY-field.radiusY));
  const bottom=Math.min(height,Math.ceil(
    field.centerY+(field.lowerRadiusY??field.radiusY)));
  const output=g.createImageData(right-left,bottom-top);
  const pixels=cached.pixels,dest=output.data;
  const vertical=typeof amplitude==='number'?amplitude:amplitude.vertical;
  const horizontal=typeof amplitude==='number'?0:amplitude.horizontal;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const weight=bustWeight(x+.5,y+.5,field);
    const sy=clamp(y-clamp(vertical,-field.maxPixels,field.maxPixels)*weight,
      0,height-1);
    const y0=Math.floor(sy),y1=Math.min(height-1,y0+1),t=sy-y0;
    const di=((y-top)*(right-left)+x-left)*4;
    if(Math.abs(horizontal)<1e-6){
      const i0=(y0*width+x)*4,i1=(y1*width+x)*4;
      const a0=pixels[i0+3]/255,a1=pixels[i1+3]/255;
      const w0=a0*(1-t),w1=a1*t,a=w0+w1;
      dest[di+3]=a*255;
      if(a>0){
        for(let channel=0;channel<3;channel++)
          dest[di+channel]=(pixels[i0+channel]*w0+
            pixels[i1+channel]*w1)/a;
      }
      continue;
    }
    const sx=clamp(x-clamp(horizontal,-field.followMaxPixels,
      field.followMaxPixels)*weight,0,width-1);
    const x0=Math.floor(sx),x1=Math.min(width-1,x0+1),u=sx-x0;
    const samples=[
      [(y0*width+x0)*4,(1-u)*(1-t)],
      [(y0*width+x1)*4,u*(1-t)],
      [(y1*width+x0)*4,(1-u)*t],
      [(y1*width+x1)*4,u*t]
    ];
    let alpha=0,red=0,green=0,blue=0;
    for(const [i,w] of samples){
      const aw=w*pixels[i+3]/255;
      alpha+=aw;
      red+=aw*pixels[i];green+=aw*pixels[i+1];blue+=aw*pixels[i+2];
    }
    dest[di+3]=alpha*255;
    if(alpha>0){dest[di]=red/alpha;dest[di+1]=green/alpha;
      dest[di+2]=blue/alpha;}
  }
  g.putImageData(output,left,top);
}

export function drawBustField(target,source,amplitude,field){
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  const vertical=typeof amplitude==='number'?amplitude:amplitude.vertical;
  const horizontal=typeof amplitude==='number'?0:amplitude.horizontal;
  if(Math.abs(vertical)+Math.abs(horizontal)<1e-6)return;
  if(['topwear-local-bilateral-pixel',
      'topwear-local-bilateral-pixel-xy'].includes(field.mode)){
    drawBustPixelField(g,source,amplitude,field,target.width,target.height);
    return;
  }
  const xMin=bilateralMode(field.mode)
    ? Math.min(...field.centers.map(center=>center[0]))-field.radiusX
    : field.centerX-field.radiusX;
  const xMax=bilateralMode(field.mode)
    ? Math.max(...field.centers.map(center=>center[0]))+field.radiusX
    : field.centerX+field.radiusX;
  const left=Math.max(0,Math.floor(xMin/field.tileWidth)*field.tileWidth);
  const right=Math.min(target.width,Math.ceil(xMax/field.tileWidth)*field.tileWidth);
  const top=Math.max(0,Math.floor((field.centerY-field.radiusY)/field.tileHeight)*field.tileHeight);
  const bottom=Math.min(target.height,Math.ceil(
    (field.centerY+(field.lowerRadiusY??field.radiusY))/field.tileHeight)*field.tileHeight);
  if(field.mode==='topwear-local-bilateral')
    g.clearRect(left,top,right-left,bottom-top);
  for(let y=top;y<bottom;y+=field.tileHeight){
    const h=Math.min(field.tileHeight,bottom-y);
    for(let x=left;x<right;x+=field.tileWidth){
      const w=Math.min(field.tileWidth,right-x);
      const dy=bustOffset(x+w/2,y+h/2,amplitude,field);
      if(Math.abs(dy)<.005&&field.mode!=='topwear-local-bilateral')continue;
      // Inverse sampling covers every destination pixel; no exposed strip.
      g.drawImage(source,x,y-dy,w,h,x,y,w,h);
    }
  }
}

export function drawBustOverlay(target,source,controls,stanceField,amplitude,field){
  // The planted stance remains the base image. Chest tiles sample directly
  // from the same composite; no second full-canvas intermediate is required.
  drawStanceField(target,source,controls,stanceField);
  if(Math.abs(amplitude)<1e-6)return;
  const g=target.getContext('2d');
  const left=Math.max(0,Math.floor((field.centerX-field.radiusX)/field.tileWidth)*field.tileWidth);
  const right=Math.min(target.width,Math.ceil((field.centerX+field.radiusX)/field.tileWidth)*field.tileWidth);
  const top=Math.max(0,Math.floor((field.centerY-field.radiusY)/field.tileHeight)*field.tileHeight);
  const bottom=Math.min(target.height,Math.ceil(
    (field.centerY+(field.lowerRadiusY??field.radiusY))/field.tileHeight)*field.tileHeight);
  for(let y=top;y<bottom;y+=field.tileHeight){
    const h=Math.min(field.tileHeight,bottom-y),
      stanceX=stanceOffset(y+h/2,controls,stanceField);
    for(let x=left;x<right;x+=field.tileWidth){
      const w=Math.min(field.tileWidth,right-x);
      const dy=bustOffset(x+w/2,y+h/2,amplitude,field);
      if(Math.abs(dy)<.005)continue;
      g.drawImage(source,x,y-dy,w,h,x+stanceX,y,w,h);
    }
  }
}
