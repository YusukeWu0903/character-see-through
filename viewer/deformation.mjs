import {validateRig,createRig} from './rig.mjs';
export function validateDeformation(rig) {
  validateRig(rig);
  const d=rig.deformation;
  for(const key of ['waist','neck']) {
    const b=d?.[key];
    if(!Array.isArray(b)||b.length!==2||!b.every(Number.isFinite)||b[0]<-1||b[1]>1||b[1]-b[0]<.05)
      throw new Error('過渡區域必須在畫布內，且高度至少 0.05');
  }
  if(d.waist[1]>=d.neck[0]) throw new Error('腰部與頸部過渡區域不能重疊');
  for(const n of rig.nodes) if(n.pivot.some(x=>Math.abs(x)>1)) throw new Error('錨點超出畫布');
  const required={legwear:'legs',neck:'torso',face:'head',mouth:'head',nose:'head',eyelash:'head',eyewhite:'head',eyebrow:'head',irides:'head',fronthair:'frontHair',backhair:'backHair'};
  for(const [layer,node] of Object.entries(required)) if(rig.bindings[layer]!==node) throw new Error('設定缺少必要圖層對應：'+layer);
  const expected={root:[null,'none'],body:['root','body'],legs:['body','none'],torso:['body','torso'],head:['torso','head'],frontHair:['head','hair'],backHair:['head','hair']};
  for(const [id,[parent,motion]] of Object.entries(expected)) {
    const n=rig.nodes.find(n=>n.id===id);
    if(!n||n.parent!==parent||n.motion!==motion) throw new Error('第二階段設定需要標準父子結構');
  }
  if(rig.nodes.find(n=>n.id==='head').maxDegrees>8||rig.nodes.find(n=>n.id==='torso').maxDegrees>6)
    throw new Error('超出實驗版側傾上限');
  const evaluate=createRig(rig);
  for(const head of [-1,1])for(const torso of [-1,1]){
    const m=evaluate({head,torso});
    for(let j=0;j<80;j++)for(let i=0;i<8;i++){
      const p=deformPoint([-1+i/4,-1+j/40],m,d),x=deformPoint([-1+(i+1)/4,-1+j/40],m,d),y=deformPoint([-1+i/4,-1+(j+1)/40],m,d);
      if((x[0]-p[0])*(y[1]-p[1])-(x[1]-p[1])*(y[0]-p[0])<=0)throw new Error('極限姿勢會折疊網格，請降低角度或將錨點移回角色中央');
    }
  }
  return rig;
}
export const transformPoint=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function weight(y,[low,high]){const t=Math.max(0,Math.min(1,(y-low)/(high-low)));return t*t*(3-2*t);}
// All overlapping non-hair pixels share the same field, avoiding joint seams
// caused by separate per-layer bone weights. Hair adds a local residual only.
export function deformPoint(point, matrices, bands, layer='face') {
  const b=transformPoint(matrices.legwear,point),t=transformPoint(matrices.neck,point),h=transformPoint(matrices.face,point);
  const w=weight(point[1],bands.waist),n=weight(point[1],bands.neck);
  const extra=layer==='fronthair'||layer==='backhair'?transformPoint(matrices[layer],point):h;
  return b.map((v,i)=>v+w*(t[i]-v)+n*(h[i]-t[i])+n*(extra[i]-h[i]));
}
export function serializeSettings(task,rig){validateDeformation(rig);return JSON.stringify({format:'see-through-rig-v2',task,rig},null,2);}
export function parseSettings(text,task){
  if(text.length>100000) throw new Error('設定檔過大');
  const doc=JSON.parse(text);
  if(doc.format!=='see-through-rig-v2'||doc.task!==task) throw new Error('設定格式或角色任務不符');
  return validateDeformation(doc.rig);
}
