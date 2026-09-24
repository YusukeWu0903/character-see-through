import {createRig,multiply,identity} from './rig.mjs';
import {groundShear} from './grounded-sway.mjs';
import {validateStanceField,stanceOffset,drawStanceField} from './stance-field.mjs';
import {pointerTarget,approachPointer} from './pointer-follow.mjs';
import {validateBustField,drawBustField,drawBustOverlay,
  drawBustFieldGuide} from './bust-field.mjs';
import {advanceSpring,blinkPulse,sharedGazeTarget,chestFollowTarget} from './expression.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const task = params.get('local') || 'Miffy_full_body_casual_rb_20260924_012138';
const rigFile = params.get('rig') || '_review/motion_v21/rig.json';
const safeTask = /^[A-Za-z0-9_-]+$/.test(task);
const safeRig = /^_review\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.json$/.test(rigFile);
const base = safeTask ? '/miffy-demo/layers/seethrough_local/' + encodeURIComponent(task) + '/' : '';
const canvas = $('stage'), ctx = canvas.getContext('2d');
const composite = document.createElement('canvas');
const bustCanvas = document.createElement('canvas');
const bustGuideCanvas = document.createElement('canvas');
const ids = ['body','torso','head','hair'];
let layers = [], evaluate = null, elapsed = 0, lastFrame = 0, loaded = false;
let rigPreset = null, rigCurrent = null, pointerX = 0;
let pointerDesired=0,pointerEased=0,followMix=0;
let bustAmplitude=0,bustFollowPx=0,bustVelocity=0;
let bustSpring={position:0,velocity:0};
let bustFollowSpring={position:0,velocity:0};
let bustGuideSource=null;
let eyeAssets=null,eyeBlink=0,eyeGazeX=0,eyeGazeY=0;
let eyePointerDesiredX=0,eyePointerDesiredY=0,eyePointerX=0,eyePointerY=0;
const review = window.__miffyMotion = {loaded:false, neutralMatches:false, task};

function manualPose() {
  return Object.fromEntries(ids.map(id => [id, Number($(id).value) / 100]));
}
function controlsAt(time) {
  const controls = manualPose();
  const strength = Number($('energy').value) / 100;
  if (rigCurrent?.grounding?.mode==='shared-stance-field') {
    // A narrow stance needs modest hip travel and a quieter, compensating
    // upper body. The shared field, not separate part rotations, does the pose.
    if ($('auto').checked) {
      const phase=time*.82;
      controls.body += .82*strength*Math.sin(phase);
      controls.torso -= .42*strength*Math.sin(phase-.24);
      controls.head -= .22*strength*Math.sin(phase-.52);
    }
    if(rigCurrent.pointerFollow){
      const mouse=pointerEased*followMix;
      controls.body += rigCurrent.pointerFollow.body*mouse;
      controls.torso += rigCurrent.pointerFollow.torso*mouse;
      controls.head += rigCurrent.pointerFollow.head*mouse;
    } else if ($('follow').checked) {
      controls.body -= .22*strength*pointerX;
      controls.head += .12*strength*pointerX;
    }
    return controls;
  }
  if ($('auto').checked) {
    controls.body += .95 * strength * Math.sin(time * 1.1);
    controls.torso += .65 * strength * Math.sin(time * 1.1 - .45);
    controls.head += .65 * strength * Math.sin(time * 1.1 - .75);
  }
  if ($('follow').checked) {
    controls.body -= .3 * strength * pointerX;
    controls.head -= .28 * strength * pointerX;
  }
  return controls;
}
function groundMatrix(bodyControl=0) {
  const grounded=rigCurrent?.grounding;
  if(!grounded || grounded.mode==='shared-stance-field')return identity();
  return groundShear(bodyControl,grounded);
}
function drawEyes(g){
  const erisBlend=rigCurrent.eyeRig?.blinkMode==='layer-crossfade';
  for(const eye of Object.values(eyeAssets.eyes)){
    const [x0,y0,x1,y1]=eye.bounds,w=x1-x0,h=y1-y0;
    g.drawImage(eye.base,x0,y0,w,h,x0,y0,w,h);
    if(eyeBlink>=.995&&!erisBlend){
      g.drawImage(eye.closed,x0,y0,w,h,x0,y0,w,h);continue;
    }
    if(eyeBlink<.005 && Math.abs(eyeGazeX)+Math.abs(eyeGazeY)<.005){
      g.drawImage(eye.open,x0,y0,w,h,x0,y0,w,h);continue;
    }
    const stage=eye.stage,sg=stage.getContext('2d');
    sg.setTransform(1,0,0,1,0,0);sg.clearRect(0,0,w,h);
    if(Math.abs(eyeGazeX)+Math.abs(eyeGazeY)<.005){
      sg.drawImage(eye.openMotion||eye.open,x0,y0,w,h,0,0,w,h);
    }else{
      sg.drawImage(eye.white,x0,y0,w,h,0,0,w,h);
      const iris=eye.irisStage,ig=iris.getContext('2d');
      ig.setTransform(1,0,0,1,0,0);ig.clearRect(0,0,w,h);
      ig.drawImage(eye.iris,x0-eyeGazeX,y0-eyeGazeY,w,h,0,0,w,h);
      ig.globalCompositeOperation='destination-in';
      ig.drawImage(eye.mask,x0,y0,w,h,0,0,w,h);
      ig.globalCompositeOperation='source-over';
      sg.drawImage(iris,0,0);
      sg.drawImage(eye.lash,x0,y0,w,h,0,0,w,h);
    }
    if(erisBlend){
      // Match Eris's eased open/closed layer weights while keeping Miffy's
      // task-scoped eye art and its own measured registration.
      const closure=eyeBlink*eyeBlink;
      const scale=1-.85*closure;
      g.save();
      if(eye.motionClipX){
        g.beginPath();g.rect(x0,y0,eye.motionClipX-x0,h);g.clip();
      }
      g.save();g.globalAlpha=1-closure;
      g.drawImage(stage,x0,eye.center[1]+(y0-eye.center[1])*scale,w,h*scale);
      g.restore();
      g.save();g.globalAlpha=closure;
      g.drawImage(eye.closed,x0,y0,w,h,x0,y0,w,h);
      g.restore();
      g.restore();
      continue;
    }
    const scale=Math.max(.03,1-eyeBlink*.97);
    g.drawImage(stage,x0,eye.center[1]+(y0-eye.center[1])*scale,w,h*scale);
    if(eyeBlink>.65){
      g.save();g.globalAlpha=(eyeBlink-.65)/.35;
      g.drawImage(eye.closed,x0,y0,w,h,x0,y0,w,h);g.restore();
    }
  }
}
function paint(target, transforms, controls={}) {
  const stance=transforms && rigCurrent?.grounding?.mode==='shared-stance-field';
  const surface=stance?composite:target;
  const g = surface.getContext('2d');
  const bodyControl=typeof controls==='number'?controls:controls.body||0;
  const ground=groundMatrix(bodyControl);
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,surface.width,surface.height);
  for (const layer of layers) {
    if (!layer.visible || layer.blank) continue;
    if (transforms) {
      const matrix = transforms[layer.name];
      if (!matrix) throw Error('缺少運動綁定：' + layer.name);
      g.setTransform(...multiply(ground,matrix));
    }
    if(layer.name==='topwear'&&transforms&&
       ['topwear-local-bilateral','topwear-local-bilateral-pixel',
         'topwear-local-bilateral-pixel-xy']
         .includes(rigCurrent.bustField?.mode)&&
       Math.abs(bustAmplitude)+Math.abs(bustFollowPx)>1e-6){
      const displacement=rigCurrent.bustField.mode==='topwear-local-bilateral-pixel-xy'
        ? {vertical:bustAmplitude,horizontal:bustFollowPx}:bustAmplitude;
      drawBustField(bustCanvas,layer.image,displacement,rigCurrent.bustField);
      g.drawImage(bustCanvas,0,0);
    }else g.drawImage(layer.image,0,0);
    if(layer.name==='topwear'&&$('show-bust-field').checked &&
       ['topwear-local-bilateral','topwear-local-bilateral-pixel',
         'topwear-local-bilateral-pixel-xy'].includes(rigCurrent?.bustField?.mode)){
      if(bustGuideSource!==layer.image){
        drawBustFieldGuide(bustGuideCanvas,layer.image,rigCurrent.bustField);
        bustGuideSource=layer.image;
      }
      g.drawImage(bustGuideCanvas,0,0);
    }
    if(layer.name==='face'&&eyeAssets&&layer.visible)drawEyes(g);
  }
  g.setTransform(1,0,0,1,0,0);
  if(stance){
    if(rigCurrent.bustField?.mode==='composite-chest-overlay')
      drawBustOverlay(target,composite,controls,rigCurrent.grounding,
        bustAmplitude,rigCurrent.bustField);
    else{
      let source=composite;
      if(rigCurrent.bustField?.mode==='composite-chest-field'){
        drawBustField(bustCanvas,source,bustAmplitude,rigCurrent.bustField);
        source=bustCanvas;
      }
      drawStanceField(target,source,controls,rigCurrent.grounding);
    }
  }
}
function guidePoint(matrix, point) {
  return [matrix[0]*point[0]+matrix[2]*point[1]+matrix[4],
    matrix[1]*point[0]+matrix[3]*point[1]+matrix[5]];
}
function drawGuides(transforms,controls={}) {
  const bodyControl=typeof controls==='number'?controls:controls.body||0;
  const bindings = {body:'legwear',torso:'topwear',head:'face',
    frontHair:'fronthair',backHair:'backhair'};
  ctx.save();
  ctx.font='13px system-ui';
  for (const node of rigCurrent.nodes) {
    if (!(node.id in bindings)) continue;
    const point=guidePoint(multiply(groundMatrix(bodyControl),
      transforms[bindings[node.id]]),node.pivot);
    if(rigCurrent.grounding?.mode==='shared-stance-field')
      point[0]+=stanceOffset(point[1],controls,rigCurrent.grounding);
    ctx.fillStyle=node.id===$('anchor').value?'#ffc364':'#60e8ff';
    ctx.beginPath();ctx.arc(point[0],point[1],5,0,Math.PI*2);ctx.fill();
    ctx.fillText(node.id,point[0]+8,point[1]-7);
  }
  ctx.restore();
}
function draw(time=elapsed) {
  if (!loaded) return;
  review.drawCount=(review.drawCount||0)+1;
  const controls=controlsAt(time);
  review.pointer={desired:pointerDesired,eased:pointerEased,mix:followMix};
  review.bust={amplitudePx:bustAmplitude,followPx:bustFollowPx,
    strength:Number($('bust').value)};
  review.bustGuideVisible=$('show-bust-field').checked;
  const transforms=evaluate(controls,time);
  if(eyeAssets){
    if(rigCurrent.eyeRig?.gazeMode==='shared-unit-circle'){
      const gaze=sharedGazeTarget(
        [Number($('gaze-x').value)/100,Number($('gaze-y').value)/100],
        [eyePointerX,eyePointerY],$('gaze-follow').checked,.8);
      eyeGazeX=gaze[0]*eyeAssets.gazeLimit[0];
      eyeGazeY=gaze[1]*eyeAssets.gazeLimit[1];
    }else{
      eyeGazeX=Math.max(-1,Math.min(1,Number($('gaze-x').value)/100+
        ($('gaze-follow').checked?eyePointerX:0)))*eyeAssets.gazeLimit[0];
      eyeGazeY=Math.max(-1,Math.min(1,Number($('gaze-y').value)/100+
        ($('gaze-follow').checked?eyePointerY:0)))*eyeAssets.gazeLimit[1];
    }
    const pulse=blinkPulse(time,$('auto-blink').checked,
      rigCurrent.eyeRig.autoBlinkIntervalSeconds);
    eyeBlink=Math.max(Number($('blink').value)/100,pulse);
    review.eye={blink:eyeBlink,gazeX:eyeGazeX,gazeY:eyeGazeY};
  }
  if ($('reference').checked){
    const active=eyeAssets;eyeAssets=null;paint(canvas,null);eyeAssets=active;
  }else paint(canvas,transforms,controls);
  if ($('show-guides').checked) drawGuides(transforms,controls);
  if(rigCurrent.grounding?.mode==='shared-stance-field'){
    const hip=stanceOffset(565,controls,rigCurrent.grounding);
    const face=stanceOffset(125,controls,rigCurrent.grounding);
    review.currentPose={...controls,time,hipPx:hip,headPx:face};
    $('motion-readout').textContent=$('reference').checked
      ? '顯示靜態基準（動態仍可在背景播放）'
      : '目前：腰部 '+hip.toFixed(1)+' px、頭部 '+face.toFixed(1)+
        ' px · '+($('paused').checked?'已暫停':'播放中')+
        ' · 雙腳接地候選（非腳部 IK）';
    return;
  }
  const body=rigCurrent.grounding?.maxDegrees ??
    rigCurrent.nodes.find(node=>node.id==='body').maxDegrees;
  const head=rigCurrent.nodes.find(node=>node.id==='head').maxDegrees;
  review.currentPose={...controls,time,bodyDegrees:Math.max(-1,Math.min(1,controls.body))*body,
    headDegrees:Math.max(-1,Math.min(1,controls.head))*head};
  $('motion-readout').textContent=$('reference').checked
    ? '顯示靜態基準（動態仍可在背景播放）'
    : '目前：'+(rigCurrent.grounding?'接地側傾 ':'全身 ')+
      review.currentPose.bodyDegrees.toFixed(2)+'°、頭部 '+
      review.currentPose.headDegrees.toFixed(2)+'° · '+($('paused').checked?'已暫停':'播放中');
}
function verifyNeutral() {
  const reference = document.createElement('canvas');
  reference.width = canvas.width; reference.height = canvas.height;
  const active=eyeAssets;eyeAssets=null;paint(reference,null);eyeAssets=active;
  paint(canvas,evaluate({body:0,torso:0,head:0,hair:0},0));
  const a = reference.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const b = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let differences = 0;
  for (let i=0;i<a.length;i++) if (a[i] !== b[i]) differences++;
  review.neutralMatches = differences === 0;
  if (differences) throw Error('歸零畫面與組裝基準不一致：' + differences + ' 個通道值');
}
async function sha256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2,'0')).join('').toUpperCase();
}
async function getImage(url) {
  return new Promise((resolve,reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error('圖層讀取失敗：' + url));
    image.src = url;
  });
}
async function loadEyeRig(config){
  if(!/^_review\/eyes_v[0-9]+\/manifest\.json$/.test(config.manifest) ||
     !/^[0-9A-F]{64}$/.test(config.manifestSha256) ||
     !Number.isFinite(config.gazeResponseRate) || config.gazeResponseRate<1 ||
     config.gazeResponseRate>15 ||
     !Number.isFinite(config.autoBlinkIntervalSeconds) ||
     config.autoBlinkIntervalSeconds<2 || config.autoBlinkIntervalSeconds>12)
    throw Error('眼部候選設定無效');
  const response=await fetch(base+config.manifest);
  if(!response.ok)throw Error('讀取眼部素材清單失敗');
  const bytes=await response.arrayBuffer();
  if(await sha256(bytes)!==config.manifestSha256)
    throw Error('眼部素材清單指紋不符');
  const manifest=JSON.parse(new TextDecoder().decode(bytes));
  if(manifest.nonProduction!==true || manifest.reviewStatus!=='pending' ||
     JSON.stringify(manifest.canvas)!==JSON.stringify([1280,1280]) ||
     !Array.isArray(manifest.gazeLimit) || manifest.gazeLimit.length!==2 ||
     manifest.gazeLimit[0]<=0 || manifest.gazeLimit[0]>2.5 ||
     manifest.gazeLimit[1]<=0 || manifest.gazeLimit[1]>2 ||
     !manifest.eyes?.left || !manifest.eyes?.right)
    throw Error('眼部素材清單無效');
  const dir=config.manifest.slice(0,config.manifest.lastIndexOf('/'));
  const eyeSet={gazeLimit:manifest.gazeLimit,eyes:{}};
  const headResponse=await fetch(base+'_review/full_head_v8/head.png');
  if(!headResponse.ok || await sha256(await headResponse.arrayBuffer())!==manifest.sourceHeadSha256)
    throw Error('眼部素材所依據的光頭原畫已變動');
  for(const side of ['left','right']){
    const spec=manifest.eyes[side];
    if(!Array.isArray(spec.bounds)||spec.bounds.length!==4 ||
       !spec.bounds.every(Number.isInteger) ||
       !Array.isArray(spec.center)||spec.center.length!==2 ||
       !spec.center.every(Number.isFinite))throw Error('眼部座標無效：'+side);
    const [x0,y0,x1,y1]=spec.bounds;
    if(x0<0||y0<0||x1>1280||y1>1280||x1-x0>80||y1-y0>60)
      throw Error('眼部範圍無效：'+side);
    const eye={bounds:spec.bounds,center:spec.center};
    if(spec.motionClipX!==undefined){
      if(!Number.isInteger(spec.motionClipX)||spec.motionClipX<=x0||
         spec.motionClipX>x1)throw Error('眼部動態裁切界線無效：'+side);
      eye.motionClipX=spec.motionClipX;
    }
    for(const key of ['base','open','white','iris','lash','closed','mask']){
      const asset=spec[key];
      if(!asset || !/^[A-Za-z0-9_-]+\.png$/.test(asset.asset) ||
         !/^[0-9A-F]{64}$/.test(asset.sha256))
        throw Error('眼部素材路徑無效：'+side+'/'+key);
      const url=base+dir+'/'+asset.asset;
      const data=await fetch(url);
      if(!data.ok || await sha256(await data.arrayBuffer())!==asset.sha256)
        throw Error('眼部素材指紋不符：'+side+'/'+key);
      eye[key]=await getImage(url);
      if(eye[key].naturalWidth!==1280||eye[key].naturalHeight!==1280)
        throw Error('眼部素材尺寸不符：'+side+'/'+key);
    }
    if(spec.openMotion){
      const asset=spec.openMotion;
      if(!/^[A-Za-z0-9_-]+\.png$/.test(asset.asset)||
         !/^[0-9A-F]{64}$/.test(asset.sha256))
        throw Error('眨眼過渡素材無效：'+side);
      const url=base+dir+'/'+asset.asset,data=await fetch(url);
      if(!data.ok||await sha256(await data.arrayBuffer())!==asset.sha256)
        throw Error('眨眼過渡素材指紋不符：'+side);
      eye.openMotion=await getImage(url);
      if(eye.openMotion.naturalWidth!==1280||eye.openMotion.naturalHeight!==1280)
        throw Error('眨眼過渡素材尺寸不符：'+side);
    }
    eye.stage=document.createElement('canvas');eye.stage.width=x1-x0;eye.stage.height=y1-y0;
    eye.irisStage=document.createElement('canvas');
    eye.irisStage.width=x1-x0;eye.irisStage.height=y1-y0;
    eyeSet.eyes[side]=eye;
  }
  return eyeSet;
}
function applyRig(candidate) {
  const next=structuredClone(candidate);
  createRig(next);
  if (rigPreset) {
    if(JSON.stringify(next.grounding)!==JSON.stringify(rigPreset.grounding))
      throw Error('校正資料不得更改接地模型');
    if (next.nodes.length!==rigPreset.nodes.length ||
        Object.keys(next.bindings).join('|')!==Object.keys(rigPreset.bindings).join('|'))
      throw Error('校正資料不得變更零件綁定');
    for (let i=0;i<next.nodes.length;i++) {
      const node=next.nodes[i],original=rigPreset.nodes[i];
      if (node.id!==original.id || node.parent!==original.parent ||
          node.motion!==original.motion || node.phase!==original.phase ||
          node.pivot.some(value=>value<0||value>1280) ||
          (node.id!=='head'&&node.maxDegrees!==original.maxDegrees) ||
          (node.id==='head'&&(rigPreset.grounding?.mode==='shared-stance-field'
            ? node.maxDegrees!==0 : node.maxDegrees<.2||node.maxDegrees>3)))
        throw Error('校正資料超出 Miffy 候選允許範圍');
    }
  }
  rigCurrent=next;
  evaluate=createRig(next);
  $('head-limit').value=String(next.nodes.find(node=>node.id==='head').maxDegrees);
  $('head-limit-value').textContent=$('head-limit').value+'°';
  draw();
}
function renderLayers() {
  const list=$('layer-list');
  list.replaceChildren();
  for (const layer of [...layers].reverse()) {
    const row=document.createElement('div');row.className='layer-row';
    const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=layer.visible;
    toggle.setAttribute('aria-label','顯示 '+layer.label);
    toggle.onchange=()=>{layer.visible=toggle.checked;draw()};
    const label=document.createElement('span');label.textContent=layer.label;
    const name=document.createElement('small');name.textContent=layer.name;
    const solo=document.createElement('button');solo.textContent='獨';
    solo.title='只顯示此層';
    solo.onclick=()=>{for(const item of layers)item.visible=item===layer;renderLayers();draw()};
    row.append(toggle,label,name,solo);list.append(row);
  }
}
function collectSettings() {
  return {
    schemaVersion:1,task,candidate:rigPreset.candidate,
    sourceSha256:rigPreset.sourceSha256,assemblySha256:rigPreset.assemblySha256,
    pivots:Object.fromEntries(rigCurrent.nodes.map(node=>[node.id,node.pivot])),
    headLimit:rigCurrent.nodes.find(node=>node.id==='head').maxDegrees,
    controls:Object.fromEntries([...ids,'energy','zoom',
      ...(rigCurrent.bustField?['bust']:[]),
      ...(rigCurrent.eyeRig?['gaze-x','gaze-y','blink']:[])].map(id=>[id,Number($(id).value)])),
    toggles:Object.fromEntries(['auto','follow','paused','reference','show-guides',
      ...(rigCurrent.eyeRig?['gaze-follow','auto-blink']:[])].map(id=>[id,$(id).checked])),
    view:$('view').value
  };
}
function applySettings(data) {
  if (data.schemaVersion!==1 || data.task!==task || data.candidate!==rigPreset.candidate ||
      data.sourceSha256!==rigPreset.sourceSha256 ||
      data.assemblySha256!==rigPreset.assemblySha256 || !data.pivots)
    throw Error('設定與此 Miffy 候選不相符');
  const candidate=structuredClone(rigPreset);
  for (const node of candidate.nodes) {
    const point=data.pivots[node.id];
    if (!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))
      throw Error('錨點座標無效');
    node.pivot=point;
    if (node.id==='head') node.maxDegrees=Number(data.headLimit);
  }
  applyRig(candidate);
  for (const id of [...ids,'energy','zoom',
    ...(rigCurrent.bustField?['bust']:[]),
    ...(rigCurrent.eyeRig?['gaze-x','gaze-y','blink']:[])]) {
    const value=data.controls?.[id];
    if (!Number.isFinite(value)||value<Number($(id).min)||value>Number($(id).max))
      throw Error('控制值超出範圍：'+id);
    $(id).value=String(value);
    const out=$(id+'-value');if(out)out.textContent=id==='zoom'?value+'%':String(value);
  }
  for (const id of ['auto','follow','paused','reference','show-guides',
    ...(rigCurrent.eyeRig?['gaze-follow','auto-blink']:[])]) {
    if (typeof data.toggles?.[id]!=='boolean') throw Error('開關值無效：'+id);
    $(id).checked=data.toggles[id];
  }
  if (!['full','upper','face'].includes(data.view)) throw Error('檢查視角無效');
  $('view').value=data.view;
  setZoom();
  draw();
}
function setZoom() {
  const ratio=Number($('zoom').value)/100;
  canvas.style.width=(canvas.width*ratio)+'px';
  $('zoom-value').textContent=$('zoom').value+'%';
  const stage=document.querySelector('.stage');
  requestAnimationFrame(()=>{
    stage.scrollLeft=Math.max(0,canvas.width*ratio/2-stage.clientWidth/2);
    stage.scrollTop=$('view').value==='face'
      ? Math.max(0,220*ratio-stage.clientHeight*.24)
      : $('view').value==='upper' ? Math.max(0,170*ratio-stage.clientHeight*.15) : 0;
  });
}
async function start() {
  if (!safeTask || !safeRig) throw Error('請提供有效任務名稱與候選 rig');
  const rigResponse = await fetch(base + rigFile);
  if (!rigResponse.ok) throw Error('讀取 Miffy rig 失敗：' + rigResponse.status);
  const chain=[await rigResponse.json()];
  while(chain.at(-1).extends){
    if(chain.length>4)throw Error('動態候選繼承層級過多');
    const child=chain.at(-1);
    if(!/^_review\/[A-Za-z0-9_-]+\/rig\.json$/.test(child.extends) ||
       !/^[0-9A-F]{64}$/.test(child.extendsSha256))
      throw Error('動態候選繼承資訊無效');
    const baseResponse=await fetch(base+child.extends);
    if(!baseResponse.ok)throw Error('讀取前版動態失敗');
    const baseBytes=await baseResponse.arrayBuffer();
    if(await sha256(baseBytes)!==child.extendsSha256)
      throw Error('前版動態已變動，停止載入此候選');
    chain.push(JSON.parse(new TextDecoder().decode(baseBytes)));
  }
  let rig=chain.pop();
  while(chain.length){
    const newer=chain.pop();
    rig={...rig,...newer,limits:[...(rig.limits||[]),...(newer.limits||[])]};
  }
  if (rig.task !== task || rig.nonProduction !== true || rig.reviewStatus !== 'pending' ||
      rig.schemaVersion !== 1 || !rig.assembly || !rig.assemblySha256 ||
      !Array.isArray(rig.canvas) || rig.canvas.length !== 2)
    throw Error('Rig 任務、版本或審查狀態不符');
  if(rig.grounding?.mode==='shared-stance-field')
    validateStanceField(rig.grounding,rig.canvas[1]);
  else if(rig.grounding && (rig.grounding.mode!=='shared-ground-shear' ||
      !Number.isFinite(rig.grounding.groundY) ||
      rig.grounding.groundY<1100 || rig.grounding.groundY>1280 ||
      !Number.isFinite(rig.grounding.maxDegrees) ||
      rig.grounding.maxDegrees<0 || rig.grounding.maxDegrees>3))
    throw Error('接地模型參數無效');
  if(rig.pointerFollow && (rig.pointerFollow.mode!=='smoothed-additive' ||
      rig.grounding?.mode!=='shared-stance-field' ||
      !Number.isFinite(rig.pointerFollow.centerX) ||
      !Number.isFinite(rig.pointerFollow.radius) ||
      rig.pointerFollow.radius<200 || rig.pointerFollow.radius>1280 ||
      !Number.isFinite(rig.pointerFollow.responseRate) ||
      rig.pointerFollow.responseRate<1 || rig.pointerFollow.responseRate>12 ||
      !['body','torso','head'].every(key=>
        Number.isFinite(rig.pointerFollow[key]) &&
        Math.abs(rig.pointerFollow[key])<=.5)))
    throw Error('滑鼠跟隨參數無效');
  if(rig.bustField)validateBustField(rig.bustField);
  if(rig.bustField && (!Number.isInteger(rig.bustField.defaultStrength) ||
      rig.bustField.defaultStrength<0 || rig.bustField.defaultStrength>100))
    throw Error('胸部動態預設值無效');
  if(rig.eyeRig && rig.grounding?.mode!=='shared-stance-field')
    throw Error('眼部候選需要已通過接地驗證的 Miffy 組裝');
  if (!/^_review\/[A-Za-z0-9_-]+\/assembly\.json$/.test(rig.assembly))
    throw Error('組裝配置路徑不符合候選格式');
  const assemblyResponse = await fetch(base + rig.assembly);
  if (!assemblyResponse.ok) throw Error('讀取組裝候選失敗：' + assemblyResponse.status);
  const assemblyBytes = await assemblyResponse.arrayBuffer();
  if (await sha256(assemblyBytes) !== rig.assemblySha256.toUpperCase())
    throw Error('組裝候選已變動，請重新產生動態候選');
  const assembly = JSON.parse(new TextDecoder().decode(assemblyBytes));
  if (assembly.task !== task || assembly.sourceSha256.toUpperCase() !== rig.sourceSha256.toUpperCase() ||
      assembly.nonProduction !== true || !Array.isArray(assembly.drawOrder) ||
      assembly.drawOrder.length !== 17)
    throw Error('組裝圖層與 Miffy rig 不相符');
  rigPreset=structuredClone(rig);
  applyRig(rig);
  const seen = new Set();
  layers = await Promise.all(assembly.drawOrder.map(async entry => {
    const name = entry.file.replace(/\.png$/,'');
    const asset = entry.asset || entry.file;
    if (!/^[A-Za-z0-9_-]+\.png$/.test(entry.file) ||
        !/^(?:_review\/[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.png$/.test(asset) ||
        seen.has(name) || !rig.bindings[name]) throw Error('圖層或運動綁定無效：' + entry.file);
    seen.add(name);
    return {name,label:entry.label||name,visible:true,blank:/\/blank\.png$/.test(asset),
      image:await getImage(base + asset)};
  }));
  canvas.width = rig.canvas[0]; canvas.height = rig.canvas[1];
  composite.width=canvas.width;composite.height=canvas.height;
  bustCanvas.width=canvas.width;bustCanvas.height=canvas.height;
  bustGuideCanvas.width=canvas.width;bustGuideCanvas.height=canvas.height;
  bustGuideSource=null;
  if (layers.some(layer => layer.image.naturalWidth !== canvas.width ||
      layer.image.naturalHeight !== canvas.height))
    throw Error('圖層尺寸與 Miffy rig 不符');
  if(rig.eyeRig){
    eyeAssets=await loadEyeRig(rig.eyeRig);
    for(const id of ['gaze-x','gaze-y','blink']){
      $(id).disabled=false;$(id).parentElement.classList.remove('disabled');
    }
    for(const id of ['gaze-follow','auto-blink'])$(id).disabled=false;
    $('gaze-follow').checked=true;$('auto-blink').checked=true;
    $('face-note').textContent=['motion_v14','motion_v16','motion_v17',
      'motion_v18','motion_v19','motion_v20','motion_v21'].includes(rig.candidate)
      ? '此版依原始眼白、眼珠、睫毛圖層量測視線範圍，再將其 alpha 對位到高解析頭像；請檢查九方向、細微移動與閉眼畫素。'
      : rig.candidate==='motion_v13'
      ? '此版沿用原始拆圖的眼白、眼珠、睫毛 alpha，對位到新高解析頭像；請放大檢查追視時有無殘留眼珠與雙重輪廓。'
      : rig.candidate==='motion_v12'
      ? '此版按既有眼部 SKILL 使用原始拆圖的眼白、眼珠和睫毛；閉眼仍來自 Miffy_face_eyeclose_bd.png。請特別檢查追視時是否殘留原眼珠。'
      : ['motion_v10','motion_v11'].includes(rig.candidate)
      ? '眨眼與視線可操作；閉眼眼瞼移植自 Miffy_face_eyeclose_bd.png。請放大檢查開眼、半閉眼與閉眼。'
      : '眨眼與視線可操作；閉眼線條移植自舊表情圖。無眼基底、眼白與虹膜分離仍需臉部放大驗收。';
    $('limits-note').textContent='胸部與眼部都是非正式審查候選。閉眼線、眼下膚色、左右視線極限及衣領／肩帶須看動態中間幀；表情與口型尚未製作。';
    if(rig.bustField?.mode==='topwear-local-bilateral-pixel-xy')
      $('limits-note').textContent='乳搖包含待機上下起伏與滑鼠左右跟隨；兩個開關獨立，強度滑桿控制兩者幅度。只變形上衣圖層胸口區域，並非獨立乳房或布料物理；請檢查衣領、肩帶與中間幀。表情與口型未製作。';
    else if(['topwear-local-bilateral','topwear-local-bilateral-pixel']
      .includes(rig.bustField?.mode))
      $('limits-note').textContent='此版乳搖主要是上下起伏，尚無滑鼠左右晃動。只變形上衣圖層胸口區域，並非獨立乳房或布料物理；請檢查衣領、肩帶與中間幀。表情與口型未製作。';
  }
  verifyNeutral();
  loaded = review.loaded = true;
  const storageKey='miffy-motion:'+task+':'+rig.candidate;
  try {
    const saved=localStorage.getItem(storageKey);
    if (saved) {
      applySettings(JSON.parse(saved));
      $('settings-status').textContent='已載入此瀏覽器的 Miffy 候選設定。';
    }
  } catch (error) {
    $('settings-status').textContent='保存設定無法載入：'+error.message;
    applyRig(rigPreset);
  }
  review.candidate=rig.candidate;
  if(rig.bustField){
    $('bust').disabled=false;
    $('bust').parentElement.classList.remove('disabled');
    $('bust').value=String(rig.bustField.defaultStrength);
    $('bust-value').textContent=$('bust').value;
    if(!rig.eyeRig){
      $('face-note').textContent='頭部側傾可操作；視線與眨眼仍需先從高解析整頭拆出獨立五官。';
      $('limits-note').textContent='胸部起伏是白色上衣與膚色共用的局部變形候選；肩帶、胸口與兩側輪廓仍需動態人工驗收。眼睛目前仍畫在整頭上，不能假裝可眨眼或追視。';
    }
  }
  const hasLocalBustField=['topwear-local-bilateral',
    'topwear-local-bilateral-pixel','topwear-local-bilateral-pixel-xy']
    .includes(rig.bustField?.mode);
  $('show-bust-field').disabled=!hasLocalBustField;
  $('show-bust-field').checked=false;
  $('bust-field-note').hidden=true;
  $('candidate-title').textContent='Miffy 全身動態 '+rig.candidate+' · 非正式審查候選';

  if(rig.grounding?.mode==='shared-stance-field'){
    document.querySelector('label[for="body"]').textContent='重心微移';
    document.querySelector('label[for="torso"]').textContent='胸廓補償';
    document.querySelector('label[for="head"]').textContent='頭部穩定';
    $('head-limit').disabled=true;
    $('head-limit').title='v4 不以頭部旋轉處理站姿；此項校正暫停使用';
  }
  $('status').textContent = '已載入 17 層；歸零畫面與接縫候選逐像素一致。'+
    (rig.eyeRig?' 左右眼素材與閉眼線條已載入（待視覺驗收）。':'')+
    (rig.grounding?.mode==='shared-stance-field'?' 雙腳接地的分段站姿已啟用。':
      rig.grounding?' 腳底接地側傾已啟用。':'');
  $('source-info').textContent = '來源：' + task + ' · 組裝：' + rig.assembly +
    ' · 骨架：' + rig.candidate +
    (rig.grounding?' · 共用接地變形（非腳部 IK）':'')+' · 待人工動態驗收';
  renderLayers();setZoom();draw();
}
for (const id of [...ids,'energy','bust','gaze-x','gaze-y','blink']) {
  $(id).oninput = () => {
    $(id+'-value').textContent = $(id).value;
    draw();
  };
}
$('zoom').oninput=setZoom;
$('view').onchange=()=>{
  $('zoom').value={full:55,upper:105,face:190}[$('view').value];
  setZoom();
};
$('auto').onchange = () => draw();
$('follow').onchange = () => draw();
$('reference').onchange = () => draw();
$('paused').onchange = () => draw();
$('show-guides').onchange = () => draw();
$('show-bust-field').onchange=()=>{
  $('bust-field-note').hidden=!$('show-bust-field').checked;
  draw();
};
$('gaze-follow').onchange=()=>draw();
$('auto-blink').onchange=()=>draw();
$('show-all').onclick=()=>{
  for(const layer of layers)layer.visible=true;
  renderLayers();draw();
};
for(const tab of document.querySelectorAll('.tab')) tab.onclick=()=>{
  for(const item of document.querySelectorAll('.tab'))item.classList.toggle('active',item===tab);
  for(const panel of document.querySelectorAll('.panel'))
    panel.classList.toggle('active',panel.id==='panel-'+tab.dataset.tab);
};
canvas.addEventListener('pointermove',event=>{
  const rect=canvas.getBoundingClientRect();
  const nativeX=(event.clientX-rect.left)*canvas.width/rect.width;
  const nativeY=(event.clientY-rect.top)*canvas.height/rect.height;
  if(rigCurrent?.eyeRig){
    eyePointerDesiredX=pointerTarget(nativeX,625,330);
    eyePointerDesiredY=pointerTarget(nativeY,105,260);
  }
  if(rigCurrent?.pointerFollow){
    pointerDesired=pointerTarget(nativeX,rigCurrent.pointerFollow.centerX,
      rigCurrent.pointerFollow.radius);
  }else{
    pointerX=Math.max(-1,Math.min(1,((event.clientX-rect.left)/rect.width-.5)*2));
    if($('follow').checked)draw();
  }
});
canvas.addEventListener('pointerleave',()=>{
  eyePointerDesiredX=0;eyePointerDesiredY=0;
  if(rigCurrent?.pointerFollow)pointerDesired=0;
  else{pointerX=0;draw();}
});
$('neutral').onclick = () => {
  for (const id of [...ids,'energy','bust',
    ...(rigCurrent?.eyeRig?['gaze-x','gaze-y','blink']:[])]) {
    $(id).value = 0;
    $(id+'-value').textContent = '0';
  }
  $('auto').checked = false;
  $('follow').checked = false;
  $('gaze-follow').checked=false;$('auto-blink').checked=false;
  $('paused').checked = true;
  $('reference').checked = false;
  $('show-bust-field').checked=false;$('bust-field-note').hidden=true;
  elapsed = 0;
  pointerX = 0;
  pointerDesired=0;pointerEased=0;followMix=0;
  eyePointerDesiredX=0;eyePointerDesiredY=0;eyePointerX=0;eyePointerY=0;
  eyeBlink=0;eyeGazeX=0;eyeGazeY=0;
  bustAmplitude=0;bustFollowPx=0;bustVelocity=0;
  bustSpring={position:0,velocity:0};
  bustFollowSpring={position:0,velocity:0};
  draw(0);
};
$('defaults').onclick=()=>{
  const defaults={body:0,torso:0,head:0,hair:55,energy:80,
    ...(rigCurrent?.bustField?{bust:rigCurrent.bustField.defaultStrength}:{}),
    ...(rigCurrent?.eyeRig?{'gaze-x':0,'gaze-y':0,blink:0}:{})};
  for(const [id,value] of Object.entries(defaults)){
    $(id).value=String(value);$(id+'-value').textContent=String(value);
  }
  $('auto').checked=true;$('follow').checked=true;
  if(rigCurrent?.eyeRig){$('gaze-follow').checked=true;$('auto-blink').checked=true;}
  $('paused').checked=false;$('reference').checked=false;
  $('show-guides').checked=false;
  $('show-bust-field').checked=false;$('bust-field-note').hidden=true;
  $('view').value='full';$('zoom').value='55';
  pointerX=0;pointerDesired=0;pointerEased=0;followMix=0;
  eyePointerDesiredX=0;eyePointerDesiredY=0;eyePointerX=0;eyePointerY=0;
  eyeBlink=0;eyeGazeX=0;eyeGazeY=0;
  bustAmplitude=0;bustFollowPx=0;bustVelocity=0;
  bustSpring={position:0,velocity:0};
  bustFollowSpring={position:0,velocity:0};
  elapsed=0;setZoom();draw();
};
$('calibrate').onchange=()=>{
  if($('calibrate').checked){
    $('neutral').click();
    $('show-guides').checked=true;
    $('settings-status').textContent='請點選畫布設定 '+$('anchor').selectedOptions[0].textContent+' 錨點。';
  }
  canvas.style.cursor=$('calibrate').checked?'crosshair':'default';
  draw();
};
$('anchor').onchange=()=>draw();
canvas.addEventListener('click',event=>{
  if(!$('calibrate').checked||!rigCurrent)return;
  const rect=canvas.getBoundingClientRect();
  const x=(event.clientX-rect.left)*canvas.width/rect.width;
  const y=(event.clientY-rect.top)*canvas.height/rect.height;
  try{
    const candidate=structuredClone(rigCurrent);
    candidate.nodes.find(node=>node.id===$('anchor').value).pivot=[Math.round(x),Math.round(y)];
    applyRig(candidate);
    $('settings-status').textContent='錨點已調整為 '+Math.round(x)+', '+Math.round(y)+'；尚未保存。';
  }catch(error){$('settings-status').textContent='錨點無法套用：'+error.message}
});
$('head-limit').oninput=()=>{
  if(!rigCurrent)return;
  try{
    const candidate=structuredClone(rigCurrent);
    candidate.nodes.find(node=>node.id==='head').maxDegrees=Number($('head-limit').value);
    applyRig(candidate);
    $('settings-status').textContent='頭部上限已調整，尚未保存。';
  }catch(error){$('settings-status').textContent='頭部上限無法套用：'+error.message}
};
$('save').onclick=()=>{
  if(!rigPreset)return;
  try{
    localStorage.setItem('miffy-motion:'+task+':'+rigPreset.candidate,
      JSON.stringify(collectSettings()));
    $('settings-status').textContent='已保存到此瀏覽器；候選檔未改動。';
  }catch(error){$('settings-status').textContent='保存失敗：'+error.message}
};
$('export').onclick=()=>{
  if(!rigPreset)return;
  const blob=new Blob([JSON.stringify(collectSettings(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=task+'_'+rigPreset.candidate+'_settings.json';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onchange=async()=>{
  const file=$('import').files?.[0];
  if(!file)return;
  try{
    if(file.size>100000)throw Error('檔案太大');
    applySettings(JSON.parse(await file.text()));
    $('settings-status').textContent='已匯入此候選設定；按「保存設定」才能跨重新載入保留。';
  }catch(error){$('settings-status').textContent='匯入失敗：'+error.message}
  $('import').value='';
};
$('reset-rig').onclick=()=>{
  if(!rigPreset)return;
  localStorage.removeItem('miffy-motion:'+task+':'+rigPreset.candidate);
  applyRig(rigPreset);
  $('settings-status').textContent='已恢復此候選的角色錨點與頭部上限。';
};
function frame(now) {
  if (!lastFrame) lastFrame = now;
  // Phase-based motion can advance by real wall time even if rendering is slow.
  const delta = Math.max(0,(now-lastFrame)/1000);
  lastFrame = now;
  if(loaded && rigCurrent?.pointerFollow && !$('paused').checked){
    const rate=rigCurrent.pointerFollow.responseRate;
    pointerEased=approachPointer(pointerEased,pointerDesired,delta,rate);
    followMix=approachPointer(followMix,$('follow').checked?1:0,delta,rate);
  }
  if(loaded && rigCurrent?.eyeRig && !$('paused').checked){
    const rate=rigCurrent.eyeRig.gazeResponseRate;
    eyePointerX=approachPointer(eyePointerX,eyePointerDesiredX,delta,rate);
    eyePointerY=approachPointer(eyePointerY,eyePointerDesiredY,delta,rate);
  }
  const beforeBust=[bustAmplitude,bustFollowPx];
  if(loaded && rigCurrent?.bustField && !$('paused').checked){
    const strength=Number($('bust').value)/100;
    if(['topwear-local-bilateral','topwear-local-bilateral-pixel',
      'topwear-local-bilateral-pixel-xy']
      .includes(rigCurrent.bustField.mode)){
      const pose=controlsAt(elapsed);
      const horizontalMode=rigCurrent.bustField.mode===
        'topwear-local-bilateral-pixel-xy';
      const pointer=pointerEased*followMix;
      const body=horizontalMode?pose.body-rigCurrent.pointerFollow.body*pointer
        :pose.body;
      const torso=horizontalMode?pose.torso-rigCurrent.pointerFollow.torso*pointer
        :pose.torso;
      const target=Math.max(-1,Math.min(1,
        (body*.95-torso*.75)*strength));
      bustSpring=advanceSpring(bustSpring,target,delta,{
        frequency:rigCurrent.bustField.springFrequency,
        damping:rigCurrent.bustField.springDamping});
      bustAmplitude=bustSpring.position*rigCurrent.bustField.maxPixels;
      if(horizontalMode){
        const followTarget=chestFollowTarget(pointer,strength,true);
        bustFollowSpring=advanceSpring(bustFollowSpring,followTarget,delta,{
          frequency:rigCurrent.bustField.followSpringFrequency,
          damping:rigCurrent.bustField.followSpringDamping});
        bustFollowPx=bustFollowSpring.position*
          rigCurrent.bustField.followMaxPixels;
      }
    }else{
      const idle=$('auto').checked ?
        Math.sin(elapsed*.82-.65)*.7+Math.sin(elapsed*1.64-.95)*.3 : 0;
      const follow=$('follow').checked ? pointerEased*followMix*.27 : 0;
      const target=(idle-follow)*strength*rigCurrent.bustField.maxPixels;
      bustVelocity+=(target-bustAmplitude)*30*delta;
      bustVelocity*=Math.exp(-11*delta);
      bustAmplitude+=bustVelocity*delta;
      bustAmplitude=Math.max(-rigCurrent.bustField.maxPixels,
        Math.min(rigCurrent.bustField.maxPixels,bustAmplitude));
    }
  }
  const pointerActive=$('follow').checked || followMix>.001;
  const pointerChanging=pointerActive &&
    (Math.abs(pointerDesired-pointerEased)>.001 ||
      Math.abs(followMix-($('follow').checked?1:0))>.001);
  const bustChanging=Math.abs(bustAmplitude-beforeBust[0])>.001||
    Math.abs(bustFollowPx-beforeBust[1])>.001;
  if (loaded && !$('paused').checked &&
      ($('auto').checked || Number($('hair').value) ||
        bustChanging ||
        (rigCurrent?.pointerFollow && pointerChanging) ||
        (rigCurrent?.eyeRig && ($('auto-blink').checked ||
          ($('gaze-follow').checked &&
            (Math.abs(eyePointerDesiredX-eyePointerX)>.001 ||
             Math.abs(eyePointerDesiredY-eyePointerY)>.001)))))){
    elapsed += delta;
    draw();
  }
  requestAnimationFrame(frame);
}
$('zoom').dispatchEvent(new Event('input'));
start().catch(error => {
  $('status').textContent = '無法載入動態候選';
  $('error').textContent = error.message;
});
requestAnimationFrame(frame);
