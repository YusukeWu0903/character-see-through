// Bounded canvas-pixel micro-yaw for one assembled head surface. This is a
// source-faithful 2.5D review warp, not generated side anatomy or a 3D turn.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smoothstep=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const scratchStages=new WeakMap();

export function validateHeadYawField(field){
  if(field?.mode!=='head-micro-yaw-pixel' ||
     !Array.isArray(field.bounds) || field.bounds.length!==4 ||
     !field.bounds.every(Number.isInteger) ||
     field.bounds[0]<0 || field.bounds[1]<0 ||
     field.bounds[2]>1280 || field.bounds[3]>1280 ||
     field.bounds[2]-field.bounds[0]<100 ||
     field.bounds[3]-field.bounds[1]<100 ||
     !Number.isFinite(field.centerX) ||
     Math.abs(field.centerX-(field.bounds[0]+field.bounds[2])/2)>1 ||
     !Number.isFinite(field.holdY) ||
     field.holdY<field.bounds[1] || field.holdY>=field.bounds[3] ||
     !Number.isFinite(field.maxPixels) ||
     field.maxPixels<=0 || field.maxPixels>8 ||
     !Number.isFinite(field.asymmetry) ||
     Math.abs(field.asymmetry)>.5)
    throw Error('頭部微轉變形範圍無效');
}

export function headYawWeight(x,y,field){
  const [left,top,right,bottom]=field.bounds;
  if(x<=left||x>=right||y<top||y>=bottom)return 0;
  const radius=(right-left)/2,u=(x-field.centerX)/radius;
  const horizontal=Math.max(0,1-u*u);
  const vertical=y<=field.holdY?1:
    1-smoothstep((y-field.holdY)/(bottom-field.holdY));
  return horizontal*vertical;
}

export function headYawOffset(x,y,value,field){
  const strength=clamp(value,-1,1);
  const weight=headYawWeight(x,y,field);
  if(weight===0||strength===0)return 0;
  const radius=(field.bounds[2]-field.bounds[0])/2;
  const u=clamp((x-field.centerX)/radius,-1,1);
  return strength*field.maxPixels*weight*
    (1+field.asymmetry*u);
}

export function drawHeadYawField(target,source,value,field){
  validateHeadYawField(field);
  const g=target.getContext('2d',{willReadFrequently:true});
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,target.width,target.height);
  g.drawImage(source,0,0);
  if(Math.abs(value)<1e-6)return;
  const [left,top,right,bottom]=field.bounds;
  const padding=Math.ceil(field.maxPixels)+2;
  const sampleLeft=left-padding,sampleWidth=right-left+2*padding;
  let sourceStage=scratchStages.get(target);
  if(!sourceStage){
    sourceStage=document.createElement('canvas');
    scratchStages.set(target,sourceStage);
  }
  if(sourceStage.width!==sampleWidth)sourceStage.width=sampleWidth;
  if(sourceStage.height!==bottom-top)sourceStage.height=bottom-top;
  const sourceContext=sourceStage.getContext('2d',{willReadFrequently:true});
  sourceContext.setTransform(1,0,0,1,0,0);
  sourceContext.clearRect(0,0,sampleWidth,bottom-top);
  sourceContext.drawImage(source,-sampleLeft,-top);
  const pixels=sourceContext.getImageData(0,0,sampleWidth,bottom-top).data;
  const output=g.createImageData(right-left,bottom-top),dest=output.data;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const sx=x-headYawOffset(x,y,value,field)-sampleLeft;
    const x0=clamp(Math.floor(sx),0,sampleWidth-1);
    const x1=Math.min(sampleWidth-1,x0+1),t=clamp(sx-x0,0,1);
    const i0=((y-top)*sampleWidth+x0)*4,i1=((y-top)*sampleWidth+x1)*4;
    const di=((y-top)*(right-left)+x-left)*4;
    const a0=pixels[i0+3]/255,a1=pixels[i1+3]/255;
    const w0=a0*(1-t),w1=a1*t,alpha=w0+w1;
    dest[di+3]=alpha*255;
    if(alpha>0)for(let channel=0;channel<3;channel++)
      dest[di+channel]=(pixels[i0+channel]*w0+pixels[i1+channel]*w1)/alpha;
  }
  g.putImageData(output,left,top);
}

export function drawHeadYawGuide(target,source,field,value){
  validateHeadYawField(field);
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);
  const [left,top,right,bottom]=field.bounds,cell=12;
  for(let y=top;y<bottom;y+=cell)for(let x=left;x<right;x+=cell){
    const w=headYawWeight(x+cell/2,y+cell/2,field);
    if(w<.025)continue;
    g.fillStyle=`rgba(35,219,255,${.07+.25*w})`;
    g.fillRect(x,y,Math.min(cell,right-x),Math.min(cell,bottom-y));
    g.strokeStyle=`rgba(105,246,255,${.15+.55*w})`;
    g.strokeRect(x+.5,y+.5,Math.min(cell,right-x)-1,Math.min(cell,bottom-y)-1);
  }
  g.strokeStyle='rgba(255,210,103,.96)';g.lineWidth=2;
  for(const y of [65,125,185]){
    const x=field.centerX,dx=headYawOffset(x,y,value,field);
    g.beginPath();g.moveTo(x,y);g.lineTo(x+dx,y);g.stroke();
    g.beginPath();g.arc(x+dx,y,3,0,Math.PI*2);g.fillStyle='#ffd267';g.fill();
  }
  g.globalCompositeOperation='destination-in';
  g.drawImage(source,0,0);
  g.globalCompositeOperation='source-over';
}
