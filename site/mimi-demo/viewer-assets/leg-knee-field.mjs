const clamp01=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp01(value);return t*t*(3-2*t)};

export function validateLegKnee(field){
  if(field?.mode!=='bilateral-component-mesh'||!Number.isFinite(field.maxPixels)||
     field.maxPixels<=0||field.maxPixels>20||
     !Number.isFinite(field.cycleSeconds)||field.cycleSeconds<1||field.cycleSeconds>5||
     !field.parts||Object.keys(field.parts).length!==2)
    throw Error('雙膝網格設定無效');
  for(const [name,part] of Object.entries(field.parts)){
    if(!['legwear_screen_left','legwear_screen_right'].includes(name)||
       !Array.isArray(part.seed)||part.seed.length!==2||!part.seed.every(Number.isInteger)||
       ![1,-1].includes(part.direction)||!Array.isArray(part.bands)||part.bands.length<4||
       part.bands.some((band,i)=>!Array.isArray(band)||band.length!==2||
         !band.every(Number.isFinite)||band[1]<0||band[1]>1||
         (i>0&&band[0]<=part.bands[i-1][0]))||
       part.bands[0][1]!==0||part.bands.at(-1)[1]!==0)
      throw Error('雙膝部件設定無效：'+name);
  }
}

export function legKneeWeight(y,part){
  const bands=part.bands;
  if(y<=bands[0][0]||y>=bands.at(-1)[0])return 0;
  for(let i=1;i<bands.length;i++)if(y<=bands[i][0]){
    const [y0,w0]=bands[i-1],[y1,w1]=bands[i];
    return w0+(w1-w0)*smooth((y-y0)/(y1-y0));
  }
  return 0;
}

export function legKneeOffset(y,control,part,maxPixels){
  return part.direction*maxPixels*clamp01(control)*legKneeWeight(y,part);
}

export function legKneePlayback(time,cycleSeconds){
  return smooth((1-Math.cos(2*Math.PI*time/cycleSeconds))/2);
}

// The source contains two disconnected opaque regions. Keep the original PNG
// untouched, and use a separate native-size source texture for each mesh.
export function splitLegwear(source,field){
  validateLegKnee(field);
  const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0);
  const rgba=g.getImageData(0,0,width,height);
  const labels=new Uint8Array(width*height),queue=new Int32Array(width*height);
  const parts={};let label=0,total=0;
  for(const [name,part] of Object.entries(field.parts)){
    label++;
    const [sx,sy]=part.seed,start=sy*width+sx;
    if(sx<0||sx>=width||sy<0||sy>=height||
       rgba.data[start*4+3]===0||labels[start])throw Error('雙膝分區種子無效：'+name);
    let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;
    queue[0]=start;labels[start]=label;
    while(head<tail){
      const pixel=queue[head++],x=pixel%width,y=Math.floor(pixel/width);
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const n=ny*width+nx;
        if(!labels[n]&&rgba.data[n*4+3]){labels[n]=label;queue[tail++]=n}
      }
    }
    if(tail<10000)throw Error('雙膝分區過小：'+name);
    total+=tail;
    const output=document.createElement('canvas');output.width=width;output.height=height;
    const pixels=new ImageData(width,height);
    for(let i=0;i<width*height;i++)if(labels[i]===label)
      pixels.data.set(rgba.data.subarray(i*4,i*4+4),i*4);
    output.getContext('2d').putImageData(pixels,0,0);
    parts[name]={name,image:output,bounds:[minX,minY,maxX+1,maxY+1],pixels:tail};
  }
  let sourcePixels=0;
  for(let i=0;i<width*height;i++)if(rgba.data[i*4+3])sourcePixels++;
  if(sourcePixels!==total)throw Error('雙腿分區未完整覆蓋原圖');
  return parts;
}

export function drawLegKneeGuide(target,source,part,field){
  target.width=source.width;target.height=source.height;
  const g=target.getContext('2d');
  const bounds=part.bounds;
  g.strokeStyle='rgba(20,215,239,.78)';g.lineWidth=1.3;
  for(let x=Math.ceil(bounds[0]/16)*16;x<bounds[2];x+=16){
    g.beginPath();g.moveTo(x,bounds[1]);g.lineTo(x,bounds[3]);g.stroke();
  }
  for(let y=Math.ceil(bounds[1]/16)*16;y<bounds[3];y+=16){
    const w=legKneeWeight(y,field);
    g.strokeStyle=`rgba(20,215,239,${(.18+.75*w).toFixed(3)})`;
    g.beginPath();g.moveTo(bounds[0],y);g.lineTo(bounds[2],y);g.stroke();
  }
  g.globalCompositeOperation='destination-in';g.drawImage(source,0,0);
  g.globalCompositeOperation='source-over';
}
