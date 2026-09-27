// Non-rendering facial geometry diagnostic. No character texture is deformed.
const finite=value=>Number.isFinite(value);

export function validateHeadGeometry(config){
  if(config?.mode!=='ellipsoid-landmark-diagnostic' ||
     !Array.isArray(config.center)||config.center.length!==2||
     !config.center.every(finite)||
     !Array.isArray(config.radii)||config.radii.length!==3||
     !config.radii.every(value=>finite(value)&&value>0)||
     !finite(config.cameraDistance)||
     config.cameraDistance<=config.radii[2]*2||
     !finite(config.maxDegrees)||config.maxDegrees<=0||
     config.maxDegrees>20||
     !config.landmarks || typeof config.landmarks!=='object')
    throw Error('臉部曲面診斷設定無效');
  for(const [name,point] of Object.entries(config.landmarks)){
    if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)||
       !Array.isArray(point)||point.length!==3||
       !point.every(finite))throw Error('臉部標記無效：'+name);
  }
}

export function projectFacePoint(point,degrees,config){
  const [cx,cy]=config.center,[rx,ry,rz]=config.radii;
  const [x,y,extraDepth=0]=point;
  const dx=x-cx,dy=y-cy,u=dx/rx,v=dy/ry;
  const surface=rz*Math.sqrt(Math.max(0,1-u*u-v*v));
  const depth=surface+extraDepth;
  const angle=Math.max(-config.maxDegrees,Math.min(config.maxDegrees,degrees))*
    Math.PI/180;
  const cosine=Math.cos(angle),sine=Math.sin(angle);
  const rotatedX=dx*cosine+depth*sine;
  const rotatedZ=depth*cosine-dx*sine;
  const baselineScale=config.cameraDistance/(config.cameraDistance-depth);
  const rotatedScale=config.cameraDistance/(config.cameraDistance-rotatedZ);
  return [
    x+rotatedX*rotatedScale-dx*baselineScale,
    y+dy*rotatedScale-dy*baselineScale
  ];
}

export function projectedLandmarks(config,degrees){
  validateHeadGeometry(config);
  return Object.fromEntries(Object.entries(config.landmarks).map(
    ([name,point])=>[name,projectFacePoint(point,degrees,config)]));
}

export function drawHeadGeometry(ctx,config,degrees,mapPoint=point=>point){
  validateHeadGeometry(config);
  const [cx,cy]=config.center,[rx,ry]=config.radii;
  const transform=(x,y,extraDepth=0)=>
    mapPoint(projectFacePoint([x,y,extraDepth],degrees,config));
  ctx.save();
  ctx.lineWidth=1.5;
  ctx.strokeStyle='rgba(54,234,255,.82)';
  for(const fraction of [-.75,-.5,-.25,0,.25,.5,.75]){
    const y=cy+fraction*ry,limit=Math.sqrt(1-fraction*fraction);
    ctx.beginPath();
    for(let i=0;i<=28;i++){
      const u=-limit+2*limit*i/28;
      const point=transform(cx+u*rx,y);
      if(i===0)ctx.moveTo(...point);else ctx.lineTo(...point);
    }
    ctx.stroke();
  }
  for(const fraction of [-.75,-.5,-.25,0,.25,.5,.75]){
    const x=cx+fraction*rx,limit=Math.sqrt(1-fraction*fraction);
    ctx.beginPath();
    for(let i=0;i<=28;i++){
      const v=-limit+2*limit*i/28;
      const point=transform(x,cy+v*ry);
      if(i===0)ctx.moveTo(...point);else ctx.lineTo(...point);
    }
    ctx.stroke();
  }
  const marks=projectedLandmarks(config,degrees);
  const colors={leftEyeOuter:'#ffcb6b',leftEyeInner:'#ffcb6b',
    rightEyeInner:'#ffcb6b',rightEyeOuter:'#ffcb6b',
    noseTip:'#ff7693',mouthLeft:'#d7acff',mouthRight:'#d7acff',
    chin:'#ffffff',leftCheek:'#7dffb1',rightCheek:'#7dffb1'};
  for(const [name,point] of Object.entries(marks)){
    const placed=mapPoint(point);
    ctx.fillStyle=colors[name]||'#ffffff';
    ctx.beginPath();ctx.arc(placed[0],placed[1],3,0,Math.PI*2);ctx.fill();
  }
  for(const [a,b] of [['leftEyeOuter','leftEyeInner'],
    ['rightEyeInner','rightEyeOuter'],['mouthLeft','mouthRight']]){
    if(!marks[a]||!marks[b])continue;
    ctx.strokeStyle=a.startsWith('mouth')?'#d7acff':'#ffcb6b';
    ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(...mapPoint(marks[a]));
    ctx.lineTo(...mapPoint(marks[b]));ctx.stroke();
  }
  ctx.restore();
  return marks;
}
