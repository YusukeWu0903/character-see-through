// Inspect detached closed-eye PNG alpha before compositing it over a face.
// This is a mechanical warning gate; the SKILL still requires visual review.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const file=process.argv[2];
if(!file)throw Error('usage: node audit_closed_alpha.mjs <eye-manifest.json>');
const path=resolve(file),folder=dirname(path),manifest=JSON.parse(readFileSync(path,'utf8'));
const [width,height]=manifest.canvas||[];
if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)
  throw Error('invalid manifest canvas');
const results=[];
for(const [side,eye] of Object.entries(manifest.eyes||{})){
  const [x0,y0,x1,y1]=eye.bounds||[];
  if(!eye.closed?.asset||![x0,y0,x1,y1].every(Number.isInteger))
    throw Error(side+': missing closed asset or bounds');
  const asset=resolve(folder,eye.closed.asset),bytes=readFileSync(asset);
  const hash=createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if(hash!==eye.closed.sha256)throw Error(side+': closed asset hash mismatch');
  const decoded=spawnSync('ffmpeg',['-v','error','-i',asset,'-frames:v','1',
    '-f','rawvideo','-pix_fmt','rgba','pipe:1'],
    {maxBuffer:width*height*4+1024});
  if(decoded.status!==0||decoded.stdout.length!==width*height*4)
    throw Error(side+': closed asset is not the declared RGBA canvas');
  let count=0,edgeCount=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const alpha=decoded.stdout[(y*width+x)*4+3];
    if(alpha<8)continue;
    count++;minX=Math.min(minX,x);minY=Math.min(minY,y);
    maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(x<x0+4||x>=x1-4||y<y0+4||y>=y1-4)edgeCount++;
  }
  const coverage=count/((x1-x0)*(y1-y0));
  const review=count===0||edgeCount>0||coverage>.55;
  results.push({side,alphaPixels:count,
    boundingBox:count?[minX,minY,maxX,maxY]:null,
    edgePixels:edgeCount,eyeBoxCoverage:Number(coverage.toFixed(3)),
    verdict:review?'review':'machine_pass'});
}
if(results.length!==2)throw Error('expected separate left and right closed eyelids');
console.log(JSON.stringify({manifest:path,results,
  reminder:'Inspect each sprite on dark/light backgrounds and open/half/closed moving frames.'},null,2));
if(results.some(result=>result.verdict!=='machine_pass'))process.exitCode=2;
