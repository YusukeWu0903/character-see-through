const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
export function validateExpressionPose(p){
  if(p.mode!=='smooth-expression-shoulder-pose'||p.expression!=='anxious'||
    !Number.isFinite(p.headRoll)||Math.abs(p.headRoll)>1||
    !Number.isFinite(p.responseRate)||p.responseRate<=0)throw Error('Invalid expression pose');
  const f=p.field;
  if(!f||['centerX','halfWidth','left','right','fadeX','headThroughY','shoulderY','holdY','leftY','rightY','gridStep'].some(k=>!Number.isFinite(f[k]))||
    f.halfWidth<=0||f.fadeX<=0||f.gridStep<4||f.left>=f.right||
    f.headThroughY>=f.shoulderY||f.shoulderY>=f.holdY)throw Error('Invalid shoulder field');
  return p;
}
export function advanceExpressionPose(state,target,dt,rate){
  target=clamp(target,0,1);dt=Math.max(0,dt);
  const e=state.position-target,c=state.velocity+rate*e,decay=Math.exp(-rate*dt);
  let position=target+(e+c*dt)*decay,velocity=(state.velocity-rate*c*dt)*decay;
  if(position<0||position>1){position=clamp(position,0,1);velocity=0}
  if(Math.abs(target-position)<1e-5&&Math.abs(velocity)<1e-4){position=target;velocity=0}
  return {position,velocity};
}
export function shoulderPoseWeight(x,y,f){
  return smooth((x-f.left)/f.fadeX)*smooth((f.right-x)/f.fadeX)*
    (1-smooth((y-f.shoulderY)/(f.holdY-f.shoulderY)));
}
export function shoulderPosePoint(x,y,amount,f,manualLeft=0,manualRight=0,manualPixels=0){
  if(!f||(!amount&&!manualLeft&&!manualRight))return [x,y];
  const spread=smooth((y-f.headThroughY)/(f.shoulderY-f.headThroughY));
  const side=clamp((x-f.centerX)/f.halfWidth,-1,1);
  const left=f.leftY*clamp(amount,0,1)-manualPixels*clamp(manualLeft,-1,1);
  const right=f.rightY*clamp(amount,0,1)-manualPixels*clamp(manualRight,-1,1);
  const dy=shoulderPoseWeight(x,y,f)*((left+right)/2+spread*(right-left)/2*side);
  return [x,y+dy];
}
export function drawShoulderPoseGuide(canvas,source,f,matrix){
  const g=canvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1280,1280);
  const world=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
  // Source-coordinate segments sampled from the same world field used by the GPU.
  for(let y=0;y<f.holdY+32;y+=f.gridStep)for(let x=f.left-32;x<f.right+32;x+=f.gridStep){
    const [wx,wy]=world(x,y),w=shoulderPoseWeight(wx,wy,f);if(w<.001)continue;
    g.strokeStyle=`rgba(0,225,245,${.15+.6*w})`;g.lineWidth=.8;g.beginPath();
    g.moveTo(x,y);g.lineTo(x+f.gridStep,y);g.moveTo(x,y);g.lineTo(x,y+f.gridStep);g.stroke();
  }
  g.globalCompositeOperation='destination-in';g.drawImage(source,0,0);g.globalCompositeOperation='source-over';
}
