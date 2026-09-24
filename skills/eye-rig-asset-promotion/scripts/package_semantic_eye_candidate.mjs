// Reuse the established derive_eye_assets.py output for a reviewed task's
// moving eyes, while preserving its separate base, neutral and closed art.
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const [priorArg,derivedArg,outputArg,headArg,colorGapArg,lashAlphaArg]=process.argv.slice(2);
if(!priorArg||!derivedArg||!outputArg)
  throw Error('usage: node package_semantic_eye_candidate.mjs prior-eye-manifest.json task/_rig_assets/eye_assets.json output-dir [replacement-head.png color-gap-max lash-alpha-max]');
if(headArg&&(!colorGapArg||!lashAlphaArg))
  throw Error('replacement-head mode requires explicit, source-inspected color-gap and lash-alpha limits');
const colorGapMax=Number(colorGapArg),lashAlphaMax=Number(lashAlphaArg);
if(headArg&&(!Number.isFinite(colorGapMax)||colorGapMax<0||colorGapMax>80||
   !Number.isFinite(lashAlphaMax)||lashAlphaMax<0||lashAlphaMax>255))
  throw Error('replacement-head calibration limits are invalid');
const priorPath=resolve(priorArg),derivedPath=resolve(derivedArg),output=resolve(outputArg);
if(existsSync(output))throw Error('candidate output already exists: '+output);
const prior=JSON.parse(readFileSync(priorPath,'utf8'));
const derivedBytes=readFileSync(derivedPath);
const derived=JSON.parse(derivedBytes.toString('utf8'));
if(prior.nonProduction!==true||prior.reviewStatus!=='pending'||
   JSON.stringify(prior.canvas)!==JSON.stringify(derived.canvas)||
   derived.schemaVersion!==2||derived.mask?.source!=='eyewhite_alpha')
  throw Error('incompatible reviewed eye sources');
const sha=data=>createHash('sha256').update(data).digest('hex').toUpperCase();
const canvas=prior.canvas[0];
if(prior.canvas[0]!==prior.canvas[1])throw Error('square canvas required');
const decode=source=>{
  const run=spawnSync('ffmpeg',['-v','error','-i',source,'-frames:v','1',
    '-f','rawvideo','-pix_fmt','rgba','pipe:1'],
    {maxBuffer:canvas*canvas*4+1024});
  if(run.status!==0||run.stdout.length!==canvas*canvas*4)
    throw Error('could not decode RGBA source: '+source);
  return run.stdout;
};
const take=(source,name)=>{
  const bytes=readFileSync(source);
  copyFileSync(source,resolve(output,name));
  return {asset:name,sha256:sha(bytes)};
};
const write=(pixels,name)=>{
  const path=resolve(output,name);
  const run=spawnSync('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','rgba',
    '-video_size',`${canvas}x${canvas}`,'-i','pipe:0','-frames:v','1','-y',path],
    {input:pixels,maxBuffer:pixels.length+1024});
  if(run.status!==0)throw Error('could not encode '+name+': '+run.stderr);
  return {asset:name,sha256:sha(readFileSync(path))};
};
mkdirSync(output,{recursive:true});
const result={schemaVersion:1,nonProduction:true,reviewStatus:'pending',
  sourceHead:prior.sourceHead,sourceHeadSha256:prior.sourceHeadSha256,
  closedSource:prior.closedSource,closedSourceSha256:prior.closedSourceSha256,
  semanticSource:derivedArg.replaceAll('\\','/'),semanticSourceSha256:sha(derivedBytes),
  canvas:prior.canvas,eyes:{},
  gazeLimit:[derived.limits.pixels.x,derived.limits.pixels.y],
  maskContract:'same-side eyewhite alpha at iris destination',
  registration:headArg?{
    method:'canonical-semantic-alpha + replacement-head RGB',
    colorGapMax,lashAlphaMax,
    sourceHeadSha256:prior.sourceHeadSha256,
    irisBacking:'exact canonical iris pixels only'
  }:null,
  note:headArg?
    'Canonical derived eye alphas registered to the replacement head RGB; no freehand ellipse. Iris-free backing and moving-state quality need visual review.':
    'Open-eye white, irides and lashes come directly from derive_eye_assets.py on this task’s canonical semantic layers; artwork compatibility with the replacement head needs moving visual review.'};
const headPath=headArg?resolve(headArg):null;
const head=headPath?decode(headPath):null;
if(headPath&&sha(readFileSync(headPath))!==prior.sourceHeadSha256)
  throw Error('replacement head differs from pinned prior eye manifest');
for(const side of ['left','right']){
  const old=prior.eyes[side],irisBox=derived.layers.irides[side].bbox;
  const eye={center:[(irisBox[0]+irisBox[2])/2,(irisBox[1]+irisBox[3])/2],
    bounds:old.bounds};
  for(const key of ['base','open','closed'])
    eye[key]=take(resolve(dirname(priorPath),old[key].asset),side+'_'+key+'.png');
  const semantic={};
  for(const [key,stem] of [['white','eyewhite'],['iris','irides'],['lash','eyelash']])
    semantic[key]=resolve(dirname(derivedPath),stem+'_'+side+'.png');
  if(!head){
    for(const key of ['white','iris','lash'])
      eye[key]=take(semantic[key],side+'_'+key+'.png');
    eye.mask=eye.white;
  }else{
    const whiteSource=decode(semantic.white),irisSource=decode(semantic.iris),
      lashSource=decode(semantic.lash);
    const white=Buffer.alloc(head.length),iris=Buffer.alloc(head.length),
      lash=Buffer.alloc(head.length);
    const [x0,y0,x1,y1]=old.bounds;
    const pupil=new Uint8Array((x1-x0)*(y1-y0));
    const local=(x,y)=>(y-y0)*(x1-x0)+(x-x0);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*canvas+x)*4;
      const colorGap=head[i]-head[i+1];
      pupil[local(x,y)]=irisSource[i+3]>8&&
        whiteSource[i+3]>8&&colorGap<colorGapMax&&
        lashSource[i+3]<lashAlphaMax?1:0;
    }
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*canvas+x)*4;
      const fill=pupil[local(x,y)];
      for(let c=0;c<3;c++){
        white[i+c]=Math.round(head[i+c]*(1-fill)+whiteSource[i+c]*fill);
        iris[i+c]=lash[i+c]=head[i+c];
      }
      white[i+3]=head[i+3];
      iris[i+3]=Math.round(255*pupil[local(x,y)]);
      lash[i+3]=lashSource[i+3];
    }
    eye.white=write(white,side+'_white.png');
    eye.iris=write(iris,side+'_iris.png');
    eye.lash=write(lash,side+'_lash.png');
    eye.mask=take(semantic.white,side+'_mask.png');
  }
  result.eyes[side]=eye;
}
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,derivedSha256:result.semanticSourceSha256,
  gazeLimit:result.gazeLimit,centers:Object.fromEntries(
    Object.entries(result.eyes).map(([side,eye])=>[side,eye.center]))},null,2));
