// Deterministic source-pixel extraction for a pending Miffy eye experiment.
// This never edits the supplied portrait or the approved assembly assets.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const [headArg,sheetArg,outputArg]=process.argv.slice(2);
if(!headArg||!sheetArg||!outputArg)throw Error('usage: node build_miffy_eye_candidate.mjs head.png emotion_type02.png output-directory');
const headPath=resolve(headArg),sheetPath=resolve(sheetArg),output=resolve(outputArg);
const canvas=1280;
const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0',
  '-show_entries','stream=width,height','-of','json',sheetPath],{encoding:'utf8'});
if(probe.status!==0)throw Error(String(probe.stderr));
const {width:sheetWidth,height:sheetHeight}=JSON.parse(probe.stdout).streams[0];
const closedPortrait=sheetWidth===1227&&sheetHeight===1281;
if(!closedPortrait&&!(sheetWidth===1536&&sheetHeight===1024))
  throw Error('closed-eye source must be the 1227x1281 portrait or 1536x1024 expression sheet');
function decode(file,width,height){
  const run=spawnSync('ffmpeg',['-v','error','-i',file,'-frames:v','1',
    '-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:width*height*5});
  if(run.status!==0)throw Error(String(run.stderr));
  if(run.stdout.length!==width*height*4)throw Error('source size mismatch: '+file);
  return run.stdout;
}
function write(name,data){
  const path=resolve(output,name);
  const run=spawnSync('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','rgba',
    '-video_size',`${canvas}x${canvas}`,'-i','pipe:0','-frames:v','1','-y',path],
  {input:data,maxBuffer:data.length+1024});
  if(run.status!==0)throw Error(String(run.stderr));
  return {asset:name,sha256:createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()};
}
const head=decode(headPath,canvas,canvas),sheet=decode(sheetPath,sheetWidth,sheetHeight);
const blank=()=>Buffer.alloc(canvas*canvas*4);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const eyes=[
  {side:'left',bounds:[574,90,625,125],iris:[600,104],closedSource:[225,666],closedScale:.55,
    closedX:[195,255],closedCurve:[[195,672],[225,663],[255,666]],whiteSamples:[592,608]},
  {side:'right',bounds:[625,90,676,125],iris:[650,104],closedSource:[315,653],closedScale:.58,
    closedX:[290,339],closedCurve:[[290,655],[315,645],[339,648]],whiteSamples:[640,656]}
];
function sheetSample(x,y,c){
  const xx=clamp(x,0,sheetWidth-1),yy=clamp(y,0,sheetHeight-1);
  const x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(x0+1,sheetWidth-1),
    y1=Math.min(y0+1,sheetHeight-1),tx=xx-x0,ty=yy-y0;
  const at=(px,py)=>sheet[(py*sheetWidth+px)*4+c];
  return (at(x0,y0)*(1-tx)+at(x1,y0)*tx)*(1-ty)+
    (at(x0,y1)*(1-tx)+at(x1,y1)*tx)*ty;
}
mkdirSync(output,{recursive:true});
const manifest={schemaVersion:1,nonProduction:true,reviewStatus:'pending',
  sourceHead:headArg.replaceAll('\\','/'),sourceHeadSha256:createHash('sha256').update(readFileSync(headPath)).digest('hex').toUpperCase(),
  closedSource:sheetArg.replaceAll('\\','/'),closedSourceSha256:createHash('sha256').update(readFileSync(sheetPath)).digest('hex').toUpperCase(),
  canvas:[canvas,canvas],eyes:{},gazeLimit:[2,1.5],
  note:closedPortrait?
    'Closed eyes transplanted from the user-supplied aligned bald portrait; blink transitions and skin-edge review pending.':
    'Source pixels only. Closed lashes from emotion_type02 lower-left panel; artistic eye and skin review pending.'};
for(const eye of eyes){
  const [x0,y0,x1,y1]=eye.bounds,[cx,cy]=eye.iris;
  const base=blank(),open=blank(),white=blank(),iris=blank(),lash=blank(),closed=blank(),mask=blank();
  const curveY=x=>{
    const points=eye.closedCurve;
    const a=x<=points[1][0]?points[0]:points[1];
    const b=x<=points[1][0]?points[1]:points[2];
    const t=clamp((x-a[0])/(b[0]-a[0]),0,1);
    return a[1]*(1-t)+b[1]*t;
  };
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const i=(y*canvas+x)*4;
    const erasure=smooth(Math.min((x-x0)/5,(x1-1-x)/5,
      (y-y0)/5,(y1-1-y)/5));
    for(let c=0;c<3;c++){
      const skinX=clamp(x,cx-11,cx+11);
      const lower=head[(125*canvas+skinX)*4+c];
      const neighboring=head[(125*canvas+cx)*4+c];
      const skin=.82*lower+.18*neighboring;
      base[i+c]=Math.round(head[i+c]*(1-erasure)+skin*erasure);
      open[i+c]=head[i+c];
      white[i+c]=head[i+c];
    }
    base[i+3]=open[i+3]=white[i+3]=head[i+3];
    // The iris is moved only inside its own painted eyewhite aperture.
    const rx=(x-cx)/7.5,ry=(y-cy-1)/5.2,irisDistance=Math.hypot(rx,ry);
    const eyelidLimit=1-smooth((y-105)/2.5);
    const irisAlpha=(1-smooth((irisDistance-.85)/.15))*eyelidLimit;
    if(irisAlpha>0){
      const a=clamp((x-eye.whiteSamples[0])/
        (eye.whiteSamples[1]-eye.whiteSamples[0]),0,1);
      for(let c=0;c<3;c++){
        const left=head[(104*canvas+eye.whiteSamples[0])*4+c];
        const right=head[(104*canvas+eye.whiteSamples[1])*4+c];
        const target=left*(1-a)+right*a-Math.max(0,y-104)*2.5;
        white[i+c]=Math.round(head[i+c]*(1-irisAlpha)+target*irisAlpha);
        iris[i+c]=head[i+c];
      }
      const spriteDistance=Math.hypot((x-cx)/6.2,(y-cy-.2)/4.2);
      const feature=smooth((36-(head[i]-head[i+1]))/13);
      iris[i+3]=Math.round(255*(1-smooth((spriteDistance-.82)/.18))*
        feature*eyelidLimit);
    }
    const aperture=Math.hypot((x-cx)/12.2,(y-(cy+.2))/5.5);
    mask[i+3]=Math.round(255*(1-smooth((aperture-.78)/.22)));
    const luminance=.2126*head[i]+.7152*head[i+1]+.0722*head[i+2];
    const lashRegion=y<=cy+1&&y>=cy-8;
    const lashAlpha=lashRegion?smooth((140-luminance)/75):0;
    if(lashAlpha>0){
      for(let c=0;c<3;c++)lash[i+c]=head[i+c];
      lash[i+3]=Math.round(255*lashAlpha);
    }
    if(closedPortrait){
      // The registered portrait also contains brow, cheek and ear pixels
      // inside these broad eye bounds. Only eyelid artwork may cover the
      // feature-free backing during a blink.
      const dx=x-cx;
      const lidY=105.5-3*(dx/20)**2;
      const distance=Math.hypot(dx/23,(y-lidY)/8.5);
      const footprint=(1-smooth((distance-.72)/.28))*
        smooth(Math.min((x-(x0+9))/3,((x1-1-8)-x)/3));
      if(footprint>0){
        const color=[];
        for(let c=0;c<3;c++){
          let sum=0;
          for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++){
            const sx=(x+(xx+.5)/4-533.7)/.148;
            const sy=(y+(yy+.5)/4-22.2)/.148;
            sum+=sheetSample(sx,sy,c);
          }
          color[c]=Math.round(sum/16);
          closed[i+c]=color[c];
        }
        closed[i+3]=Math.round(255*footprint);
      }
    }else{
      const sx=eye.closedSource[0]+(x-cx)/eye.closedScale;
      const sy=eye.closedSource[1]+(y-cy)/eye.closedScale;
      const r=sheetSample(sx,sy,0),g=sheetSample(sx,sy,1),b=sheetSample(sx,sy,2);
      const lum=.2126*r+.7152*g+.0722*b;
      const footprint=(1-smooth((Math.abs(x-cx)-18)/5))*
        (1-smooth((Math.abs(y-cy)-8)/5));
      const alpha=sx>=eye.closedX[0]&&sx<=eye.closedX[1]&&
        Math.abs(sy-curveY(sx))<6?
        smooth((155-lum)/85)*footprint:0;
      if(alpha>0){closed[i]=r;closed[i+1]=g;closed[i+2]=b;
        closed[i+3]=Math.round(alpha*255)}
    }
  }
  manifest.eyes[eye.side]={center:eye.iris,bounds:eye.bounds,
    base:write(`${eye.side}_base.png`,base),
    open:write(`${eye.side}_open.png`,open),
    white:write(`${eye.side}_white.png`,white),
    iris:write(`${eye.side}_iris.png`,iris),
    lash:write(`${eye.side}_lash.png`,lash),
    closed:write(`${eye.side}_closed.png`,closed),
    mask:write(`${eye.side}_mask.png`,mask)};
}
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,sourceHead:manifest.sourceHeadSha256,
  closedSource:manifest.closedSourceSha256,eyes:Object.keys(manifest.eyes)},null,2));
