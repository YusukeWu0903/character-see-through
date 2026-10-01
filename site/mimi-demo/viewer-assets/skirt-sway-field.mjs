import {advanceSpring} from './expression.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
const sourcePixels=new WeakMap();
const fieldMaps=new WeakMap();
const frameBuffers=new WeakMap();
function horizontalWeight(x,y,f){
  const p=f.pinnedX;
  const rightFixed=p?.rightPin?
    p.rightPin.rootFixed+(p.rightFixed-p.rightPin.rootFixed)*
      smooth((y-p.rightPin.rootY)/(p.rightPin.freeY-p.rightPin.rootY)):
    p?.rightFixed;
  return p?smooth((x-p.leftFixed)/(p.leftFull-p.leftFixed))*
    smooth((rightFixed-x)/(rightFixed-p.rightFull)):1;
}
function bandWeight(x,y,b){
  const horizontal=smooth((x-b.left)/(b.leftFull-b.left))*
    smooth((b.right-x)/(b.right-b.rightFull));
  const rise=smooth((y-b.top)/(b.fullY-b.top));
  const fall=b.bottom===undefined?1:smooth((b.bottom-y)/(b.bottom-b.bottomFull));
  return horizontal*rise*fall*(b.strength??1);
}
export function skirtWeight(x,y,f){
  const hem=smooth((y-f.anchorY)/(f.hemY-f.anchorY))*horizontalWeight(x,y,f);
  return clamp(hem+(f.freeBands||[]).reduce((sum,b)=>sum+bandWeight(x,y,b),0),0,1);
}
export function advanceSkirt(state,target,dt,f){
  target=clamp(target,-1,1);
  let next=state;
  const n=Math.max(1,Math.ceil(Math.min(dt,.1)*120));
  for(let i=0;i<n;i++)next=advanceSpring(next,target,Math.min(dt,.1)/n,{frequency:f.frequency,damping:f.damping});
  return {...next,offset:clamp((next.position-target)*f.gainPixels*(f.responseSign??1),-f.maxPixels,f.maxPixels)};
}
export function validateSkirt(f){
  if(f.mode!=='anchored-horizontal-lag'||!(f.hemY>f.anchorY)||!(f.maxPixels>0&&f.maxPixels<=12)||!(f.frequency>=1&&f.frequency<=20)||!(f.damping>=.2&&f.damping<=2)||!(f.stripHeight===undefined||Number.isInteger(f.stripHeight)&&f.stripHeight>=1&&f.stripHeight<=8))throw Error('Invalid skirt sway field');
  if(f.followers!==undefined&&(!Array.isArray(f.followers)||
      f.followers.some(name=>typeof name!=='string'||!name||name===f.owner)||
      new Set(f.followers).size!==f.followers.length))throw Error('Invalid skirt sway followers');
  if(f.pinnedX){
    const p=f.pinnedX;
    if(![p.leftFixed,p.leftFull,p.rightFull,p.rightFixed].every(Number.isFinite)||
      !(0<=p.leftFixed&&p.leftFixed<p.leftFull&&p.leftFull<p.rightFull&&
        p.rightFull<p.rightFixed&&p.rightFixed<=1280))throw Error('Invalid skirt sway pinnedX');
    if(p.rightPin&&(![p.rightPin.rootFixed,p.rightPin.rootY,p.rightPin.freeY].every(Number.isFinite)||
      !(p.rightFull<p.rightPin.rootFixed&&p.rightPin.rootFixed<=p.rightFixed&&
        0<=p.rightPin.rootY&&p.rightPin.rootY<p.rightPin.freeY&&p.rightPin.freeY<=1280)))
      throw Error('Invalid skirt sway right pin');
  }
  if(f.responseSign!==undefined&&f.responseSign!==1&&f.responseSign!==-1)
    throw Error('Invalid skirt sway response sign');
  if(f.freeBands!==undefined){
    if(!Array.isArray(f.freeBands)||f.freeBands.length>4)throw Error('Invalid garment free bands');
    for(const b of f.freeBands){
      if(![b.left,b.leftFull,b.rightFull,b.right,b.top,b.fullY,b.strength].every(Number.isFinite)||
        !(0<=b.left&&b.left<b.leftFull&&b.leftFull<=b.rightFull&&b.rightFull<b.right&&b.right<=1280)||
        !(0<=b.top&&b.top<b.fullY&&b.fullY<=1280)||!(b.strength>0&&b.strength<=1)||
        (b.bottom!==undefined&&(!Number.isFinite(b.bottomFull)||!Number.isFinite(b.bottom)||
          !(b.fullY<=b.bottomFull&&b.bottomFull<b.bottom&&b.bottom<=1280))))
        throw Error('Invalid garment free band');
    }
  }
}
export function drawSkirtGuide(canvas,source,f){
  canvas.width=canvas.height=1280;const g=canvas.getContext('2d');
  const top=Math.min(f.anchorY,...(f.freeBands||[]).map(b=>b.top));
  for(let y=top;y<1280;y+=8){
    const step=f.pinnedX||f.freeBands?.length?4:1280;
    for(let x=0;x<1280;x+=step){
      g.fillStyle=`rgba(0,210,240,${skirtWeight(x+step/2,y+4,f)*.45})`;
      g.fillRect(x,y,step,8);
    }
  }
  g.globalCompositeOperation='destination-in';g.drawImage(source,0,0);g.globalCompositeOperation='source-over';
}
function cachedPixels(source,width,height){
  let found=sourcePixels.get(source);
  if(found&&found.width===width&&found.height===height)return found;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0);
  const data=g.getImageData(0,0,width,height).data;
  let left=width,top=height,right=0,bottom=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){
    left=Math.min(left,x);top=Math.min(top,y);
    right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  found={width,height,data,bounds:{left,top,right,bottom}};
  sourcePixels.set(source,found);return found;
}
function fieldMap(f,width,height){
  let found=fieldMaps.get(f);
  if(found&&found.width===width&&found.height===height)return found;
  const bands=f.freeBands||[],p=f.pinnedX;
  const x0=Math.max(0,Math.floor(Math.min(p?.leftFixed??0,...bands.map(b=>b.left))));
  const x1=Math.min(width,Math.ceil(Math.max(p?.rightFixed??width,...bands.map(b=>b.right))));
  const y0=Math.max(0,Math.floor(Math.min(f.anchorY,...bands.map(b=>b.top))));
  const w=x1-x0,h=height-y0,weights=new Float32Array(w*h);
  for(let y=y0;y<height;y++)for(let x=x0;x<x1;x++)
    weights[(y-y0)*w+x-x0]=skirtWeight(x,y,f);
  found={width,height,x0,x1,y0,w,weights};fieldMaps.set(f,found);return found;
}
export function prepareSkirtSway(sources,f,width,height){
  if(!f.pinnedX&&!f.freeBands?.length)return;
  fieldMap(f,width,height);
  for(const source of sources)cachedPixels(source,width,height);
}
function drawPinnedSway(canvas,source,offset,f){
  const g=canvas.getContext('2d',{willReadFrequently:true});
  const width=canvas.width,height=canvas.height;
  g.drawImage(source,0,0);
  const cached=cachedPixels(source,width,height),input=cached.data,map=fieldMap(f,width,height);
  const pad=Math.ceil(f.maxPixels)+2,b=cached.bounds;
  const x0=Math.max(map.x0,b.left-pad),x1=Math.min(map.x1,b.right+pad);
  const y0=Math.max(map.y0,b.top-pad),y1=Math.min(height,b.bottom+pad);
  if(x1<=x0||y1<=y0)return;
  const roiWidth=x1-x0,roiHeight=y1-y0;
  let buffer=frameBuffers.get(source);
  if(!buffer||buffer.width!==roiWidth||buffer.height!==roiHeight||buffer.x0!==x0||buffer.y0!==y0){
    buffer={width:roiWidth,height:roiHeight,x0,y0,image:g.createImageData(roiWidth,roiHeight)};
    frameBuffers.set(source,buffer);
  }
  const target=buffer.image,out=target.data;
  for(let y=y0;y<y1;y++){
    const from=(y*width+x0)*4,to=((y-y0)*roiWidth)*4;
    out.set(input.subarray(from,from+roiWidth*4),to);
    const mapRow=(y-map.y0)*map.w,sourceRow=y*width*4,outRow=(y-y0)*roiWidth*4;
    for(let x=x0;x<x1;x++){
      const weight=map.weights[mapRow+x-map.x0];
      if(weight<1e-7)continue;
      let sx=x-offset*weight;
      let mx=sx-map.x0;
      if(mx<0)mx=0;else if(mx>map.w-1)mx=map.w-1;
      const m0=Math.floor(mx),m1=m0+1<map.w?m0+1:m0,mix=mx-m0;
      sx=x-offset*(map.weights[mapRow+m0]*(1-mix)+map.weights[mapRow+m1]*mix);
      if(sx<0)sx=0;else if(sx>width-1)sx=width-1;
      const left=Math.floor(sx),right=left+1<width?left+1:left,fraction=sx-left;
      const i0=sourceRow+left*4,i1=sourceRow+right*4;
      const j=outRow+(x-x0)*4;
      const a0=input[i0+3]*(1-fraction),a1=input[i1+3]*fraction,alpha=a0+a1;
      if(alpha){
        const k0=a0/alpha,k1=a1/alpha;
        out[j]=Math.round(input[i0]*k0+input[i1]*k1);
        out[j+1]=Math.round(input[i0+1]*k0+input[i1+1]*k1);
        out[j+2]=Math.round(input[i0+2]*k0+input[i1+2]*k1);
      }else out[j]=out[j+1]=out[j+2]=0;
      out[j+3]=Math.round(alpha);
    }
  }
  g.putImageData(target,x0,y0);
}
export function drawSkirtSway(canvas,source,offset,f){
  const g=canvas.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,canvas.width,canvas.height);
  if(Math.abs(offset)<1e-6){g.drawImage(source,0,0);return;}
  if(f.pinnedX||f.freeBands?.length){drawPinnedSway(canvas,source,offset,f);return;}
  const step=f.stripHeight||4;
  for(let y=0;y<canvas.height;y+=step){
    const h=Math.min(step,canvas.height-y);
    const dx=offset*skirtWeight(0,y+h/2,f);
    g.drawImage(source,0,y,canvas.width,h,dx,y,canvas.width,h);
  }
}
