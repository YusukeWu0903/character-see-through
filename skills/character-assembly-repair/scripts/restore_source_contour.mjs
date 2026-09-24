// Task-scoped source-pixel contour transplant when extraction kept alpha but
// washed a few painted outline pixels into skin. Never generates a new line.
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const [configArg,outputArg]=process.argv.slice(2);
if(!configArg||!outputArg)throw Error('usage: node restore_source_contour.mjs config.json output-dir');
const config=JSON.parse(readFileSync(resolve(configArg),'utf8'));
const output=resolve(outputArg),task=resolve(config.task);
if(existsSync(output)||!output.startsWith(task+'\\'))throw Error('output must be a new directory inside the named task');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const pinned=(path,expected)=>{
  const bytes=readFileSync(resolve(path));
  if(sha(bytes)!==expected)throw Error('pinned source changed: '+path);
  return bytes;
};
pinned(config.headInput,config.headSha256);
pinned(config.source,config.sourceSha256);
pinned(config.assemblyInput,config.assemblySha256);
if(!Array.isArray(config.samples)||config.samples.length<1||config.samples.length>32||
   !Array.isArray(config.allowedBounds)||config.allowedBounds.length!==4)
  throw Error('a small measured candidate and explicit bounds are required');
const decode=(path,w,h)=>{
  const run=spawnSync('ffmpeg',['-v','error','-i',resolve(path),'-frames:v','1',
    '-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:w*h*4+1024});
  if(run.status!==0||run.stdout.length!==w*h*4)
    throw Error('cannot decode '+path+': '+run.stderr);
  return run.stdout;
};
const [width,height]=config.canvas,[sourceWidth,sourceHeight]=config.sourceSize;
if(width!==1280||height!==1280||sourceWidth<width-100||sourceHeight<height-100)
  throw Error('unexpected Miffy canvas or registered source size');
const head=decode(config.headInput,width,height),source=decode(config.source,sourceWidth,sourceHeight);
const changed=[];
for(const sample of config.samples){
  const [x,y]=sample.canvas,[sx,sy]=sample.source;
  if(![x,y,sx,sy].every(Number.isInteger)||x<config.allowedBounds[0]||
     x>config.allowedBounds[2]||y<config.allowedBounds[1]||
     y>config.allowedBounds[3]||sx<0||sy<0||
     sx>=sourceWidth||sy>=sourceHeight||
     !Number.isFinite(sample.sourceWeight)||sample.sourceWeight<=0||
     sample.sourceWeight>1)throw Error('unmeasured or out-of-bounds sample');
  const i=(y*width+x)*4,j=(sy*sourceWidth+sx)*4;
  if(head[i+3]<128||source[j+3]<250)throw Error('contour source/base is not opaque enough');
  const old=[...head.subarray(i,i+3)],from=[...source.subarray(j,j+3)];
  if((from[0]+from[1]+from[2])/3>=100)
    throw Error('sample is not a dark source-painted contour');
  for(let channel=0;channel<3;channel++)
    head[i+channel]=Math.round(old[channel]*(1-sample.sourceWeight)+
      from[channel]*sample.sourceWeight);
  changed.push({canvas:[x,y],source:[sx,sy],old,from,
    next:[...head.subarray(i,i+3)],alpha:head[i+3]});
}
mkdirSync(output,{recursive:true});
const headPath=resolve(output,'head.png');
const encoded=spawnSync('ffmpeg',['-v','error','-f','rawvideo',
  '-pixel_format','rgba','-video_size',`${width}x${height}`,'-i','pipe:0',
  '-frames:v','1','-y',headPath],{input:head,maxBuffer:head.length+1024});
if(encoded.status!==0)throw Error('cannot encode repaired head: '+encoded.stderr);
const assembly=JSON.parse(readFileSync(resolve(config.assemblyInput),'utf8'));
if(assembly.task!==config.taskName||assembly.drawOrder.length!==17)
  throw Error('wrong task/assembly');
const face=assembly.drawOrder.find(layer=>layer.file==='face.png');
if(face?.asset!==config.headAsset)throw Error('unexpected face asset in assembly');
face.asset=config.outputAsset;
face.label='高解析整頭＋來源描邊三像素修補候選';
assembly.candidate=config.candidate;
assembly.reviewStatus='pending';assembly.nonProduction=true;
assembly.rollbackManifest=config.rollbackManifest;
assembly.faceContourRepair={input:config.headInput,inputSha256:config.headSha256,
  source:config.source,sourceSha256:config.sourceSha256,
  asset:config.outputAsset,assetSha256:sha(readFileSync(headPath)),
  method:'registered source RGB blend, original alpha retained',
  allowedBounds:config.allowedBounds,samples:changed};
assembly.openDefects=[...assembly.openDefects,
  '左臉頰描邊已補三個來源像素，仍待使用者看靜態與頭／髮分開運動驗收。'];
writeFileSync(resolve(output,'assembly.json'),JSON.stringify(assembly,null,2)+'\n');
console.log(JSON.stringify({output,changed,headSha256:assembly.faceContourRepair.assetSha256,
  assemblySha256:sha(readFileSync(resolve(output,'assembly.json')))}));
