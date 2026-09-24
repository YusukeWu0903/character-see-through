// Trim a source-verified eye backing where its rectangular crop reaches an ear.
// Only alpha decreases; RGB, painted eye parts, and the previous candidate stay intact.
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const [priorArg,outputArg,side,startArg,endArg]=process.argv.slice(2);
if(!priorArg||!outputArg||!['left','right'].includes(side))
  throw Error('usage: node trim_eye_backing_edge.mjs prior-manifest.json output-dir left|right feather-start zero-from');
const priorPath=resolve(priorArg),output=resolve(outputArg);
if(existsSync(output))throw Error('candidate output already exists: '+output);
const priorBytes=readFileSync(priorPath),prior=JSON.parse(priorBytes);
if(prior.nonProduction!==true||prior.reviewStatus!=='pending'||
   JSON.stringify(prior.canvas)!==JSON.stringify([1280,1280]))
  throw Error('expected a pending native-canvas eye candidate');
const [x0,y0,x1,y1]=prior.eyes[side].bounds;
const start=Number(startArg),end=Number(endArg);
if(!Number.isInteger(start)||!Number.isInteger(end)||
   start<=x0||end> x1||end-start<2||end-start>8)
  throw Error('feather must be a measured, narrow band inside the eye crop');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const assetPath=(eye,key)=>resolve(dirname(priorPath),eye[key].asset);
const decode=path=>{
  const run=spawnSync('ffmpeg',['-v','error','-i',path,'-frames:v','1',
    '-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:1280*1280*4+1024});
  if(run.status!==0||run.stdout.length!==1280*1280*4)
    throw Error('cannot decode '+path+': '+run.stderr);
  return run.stdout;
};
const oldEye=prior.eyes[side];
for(const key of ['iris','lash','closed','mask']){
  const data=decode(assetPath(oldEye,key));
  for(let y=y0;y<y1;y++)for(let x=start;x<x1;x++)
    if(data[(y*1280+x)*4+3]>0)
      throw Error(`${key} has painted pixels in the proposed trimming band at ${x},${y}`);
}
const next=structuredClone(prior);
next.reviewStatus='pending';next.nonProduction=true;
next.priorManifest=priorArg.replaceAll('\\','/');
next.priorManifestSha256=sha(priorBytes);
next.edgeCleanup={side,featherStartX:start,zeroFromX:end,
  affected:['base','white','openMotion'],method:'alpha-only backing crop taper',
  note:'The neutral open asset remains unchanged; moving open has the measured eye-only edge.'};
next.note='Eye backing ear-overlap repair candidate; neutral open artwork and blink timing unchanged. Moving visual approval pending.';
mkdirSync(output,{recursive:true});
let changed=0;
for(const which of ['left','right'])for(const key of ['base','open','white','iris','lash','closed','mask']){
  const old=prior.eyes[which][key],input=assetPath(prior.eyes[which],key);
  const original=readFileSync(input);
  if(sha(original)!==old.sha256)throw Error(`source asset hash changed: ${which}/${key}`);
  const target=resolve(output,old.asset);
  if(which===side&&next.edgeCleanup.affected.includes(key)){
    const pixels=decode(input);
    for(let y=y0;y<y1;y++)for(let x=start+1;x<x1;x++){
      const i=(y*1280+x)*4,weight=Math.max(0,Math.min(1,(end-x)/(end-start)));
      const alpha=Math.round(pixels[i+3]*weight);
      if(alpha!==pixels[i+3]){pixels[i+3]=alpha;changed++}
    }
    const run=spawnSync('ffmpeg',['-v','error','-f','rawvideo',
      '-pixel_format','rgba','-video_size','1280x1280','-i','pipe:0',
      '-frames:v','1','-y',target],{input:pixels,maxBuffer:pixels.length+1024});
    if(run.status!==0)throw Error('cannot encode '+target+': '+run.stderr);
  }else copyFileSync(input,target);
  next.eyes[which][key].sha256=sha(readFileSync(target));
}
// Neutral open pixels must still reproduce the reviewed assembly exactly.
// The blink transition alone needs an eye-only backing, so store a separate
// moving-state open image rather than altering the accepted neutral open art.
const moving=decode(assetPath(oldEye,'open'));
for(let y=y0;y<y1;y++)for(let x=start+1;x<x1;x++){
  const i=(y*1280+x)*4,weight=Math.max(0,Math.min(1,(end-x)/(end-start)));
  const alpha=Math.round(moving[i+3]*weight);
  if(alpha!==moving[i+3]){moving[i+3]=alpha;changed++}
}
const movingName=side+'_open_motion.png',movingPath=resolve(output,movingName);
const encoded=spawnSync('ffmpeg',['-v','error','-f','rawvideo',
  '-pixel_format','rgba','-video_size','1280x1280','-i','pipe:0',
  '-frames:v','1','-y',movingPath],{input:moving,maxBuffer:moving.length+1024});
if(encoded.status!==0)throw Error('cannot encode '+movingPath+': '+encoded.stderr);
next.eyes[side].openMotion={asset:movingName,sha256:sha(readFileSync(movingPath))};
next.eyes[side].motionClipX=end;
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(next,null,2)+'\n');
console.log(JSON.stringify({output,side,start,end,alphaPixelsChanged:changed,
  priorManifestSha256:next.priorManifestSha256,manifestSha256:sha(readFileSync(resolve(output,'manifest.json')))}));
