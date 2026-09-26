import {createRig,multiply,identity} from './rig.mjs';
import {groundShear} from './grounded-sway.mjs';
import {validateStanceField,stanceOffset,hipTiltOffset,drawStanceField} from './stance-field.mjs?review-runtime=v39-hip-tilt';
import {validateArmSway,armOffset,drawArmSway,drawArmSwayGuide} from './arm-sway-field.mjs?review-runtime=v40-arms';
import {pointerTarget,approachPointer} from './pointer-follow.mjs';
import {validateBustField,drawBustField,drawBustOverlay,
  drawBustFieldGuide} from './bust-field.mjs';
import {advanceSpring,blinkPulse,sharedGazeTarget,chestFollowTarget} from './expression.mjs';
import {loadMouthTransplant} from './mouth-transplant.mjs';
import {createSharedFieldAdapter} from './shared-field-adapter.mjs?review-runtime=v49-full-gpu';
import {validateHeadYawField,drawHeadYawField,drawHeadYawGuide} from './head-yaw-field.mjs';
import {validateHeadGeometry,drawHeadGeometry} from './head-geometry.mjs';
import {validateHeadSurface,drawHeadSurface,drawHeadSurfaceGuide} from './head-surface-warp.mjs?review-runtime=v37-pitch-light';
import {validateHeadPitchProportion} from './head-pitch-proportion.mjs';
import {validateHeadLighting,validatePitchHeadLighting} from './head-lighting.mjs?review-runtime=v37-pitch-light';
import {validateNeckFollow,drawNeckFollow,drawNeckFollowGuide} from './neck-follow-field.mjs';
import {validateHairFollow,drawHairFollow,drawHairFollowGuide} from './hair-follow-field.mjs';
import {validateHairIdle,initialHairIdleState,advanceHairIdle} from './hair-idle-state.mjs';
import {validatePitchFollow,drawPitchFollow,drawPitchFollowGuide} from './pitch-follow-field.mjs?review-runtime=v36-directional-hair';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const task = params.get('local') || 'Miffy_full_body_casual_rb_20260924_012138';
const rigFile = params.get('rig') || '_review/motion_v50/rig.json';
const safeTask = /^[A-Za-z0-9_-]+$/.test(task);
const safeRig = /^_review\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.json$/.test(rigFile);
const base = safeTask ? new URL('../layers/seethrough_local/' + encodeURIComponent(task) + '/', import.meta.url).pathname : '';
const canvas = $('stage'), ctx = canvas.getContext('2d');
const composite = document.createElement('canvas');
const bustCanvas = document.createElement('canvas');
const bustGuideCanvas = document.createElement('canvas');
const armCanvas=document.createElement('canvas');
const armGuideCanvas=document.createElement('canvas');
const yawSourceCanvas=document.createElement('canvas');
const yawCanvas=document.createElement('canvas');
const yawGuideCanvas=document.createElement('canvas');
const yawGuideWarpCanvas=document.createElement('canvas');
const headSurfaceSource=document.createElement('canvas');
const headSurfaceCanvas=document.createElement('canvas');
const headSurfaceGuideCanvas=document.createElement('canvas');
const neckFollowCanvas=document.createElement('canvas');
const neckFollowGuideCanvas=document.createElement('canvas');
const neckFollowSource=document.createElement('canvas');
const neckPitchStage={output:document.createElement('canvas'),guide:document.createElement('canvas'),
  yawGuidePitch:document.createElement('canvas')};
const hairFollowStages=Object.fromEntries(['fronthair','backhair'].map(name=>
  [name,{source:document.createElement('canvas'),output:document.createElement('canvas'),
    guide:document.createElement('canvas'),pitch:document.createElement('canvas'),
    pitchGuide:document.createElement('canvas'),
    yawGuidePitch:document.createElement('canvas')} ]));
let neckFollowSourceImage=null,neckFollowPoseKey=null,headSurfaceCacheKey=null;
const ids = ['body','torso','head','hair'];
let layers = [], evaluate = null, elapsed = 0, lastFrame = 0, loaded = false;
let rigPreset = null, rigCurrent = null, pointerX = 0;
let pointerDesired=0,pointerEased=0,followMix=0;
let bustAmplitude=0,bustFollowPx=0,bustVelocity=0;
let bustSpring={position:0,velocity:0};
let bustFollowSpring={position:0,velocity:0};
let bustGuideSource=null;
let hairFollowStates={fronthair:{position:0,velocity:0},
  backhair:{position:0,velocity:0}};
let hairFollowDrive={fronthair:0,backhair:0};
let hairIdleState=initialHairIdleState();
let hairIdleTargets={fronthair:0,backhair:0};
let eyeAssets=null,eyeBlink=0,eyeGazeX=0,eyeGazeY=0;
let mouthAssets=null,activeMouthMode='original';
let sharedFields=null;
let gpuPresented=false;
function faceImage(layer){
  return layer.name==='face'&&mouthAssets&&activeMouthMode!=='original'
    ? mouthAssets.backing : layer.image;
}
function drawMouth(g){
  if(mouthAssets&&activeMouthMode!=='original')g.drawImage(mouthAssets.images[activeMouthMode],0,0);
}
let eyePointerDesiredX=0,eyePointerDesiredY=0,eyePointerX=0,eyePointerY=0;
const review = window.__miffyMotion = {loaded:false, neutralMatches:false, task};
review.redraw=()=>draw(); // Synchronous diagnostics capture; no retained framebuffer needed in playback.

function manualPose() {
  return Object.fromEntries(ids.map(id => [id, Number($(id).value) / 100]));
}
function controlsAt(time) {
  const controls = manualPose();
  if(rigCurrent?.hairFollow?.idleAroundYaw)controls.hair=0;
  controls.headRoll=rigCurrent?.headRoll ? Number($('head-roll').value)/100 : 0;
  controls.yaw=(rigCurrent?.headYaw||rigCurrent?.headGeometry||rigCurrent?.headSurface)
    ? Number($('yaw').value)/100 : 0;
  controls.pitch=rigCurrent?.headPitch ? Number($('pitch').value)/100 : 0;
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
    if(rigCurrent.armSway){
      const field=rigCurrent.armSway;
      const manual=Number($('arm-sway').value)/100;
      const idle=$('auto').checked?field.idleGain*strength:0;
      const follow=field.followGain*pointerEased*followMix;
      controls.left=Math.max(-1,Math.min(1,
        manual+idle*Math.sin(time*.82+field.leftPhase)-follow));
      controls.right=Math.max(-1,Math.min(1,
        manual+idle*Math.sin(time*.82+field.rightPhase)-follow));
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
function paintPitchPart(g,source,stage,control,config,key){
  const show=$('show-head-pitch').checked;
  if(Math.abs(control)<1e-8&&!show){g.drawImage(source,0,0);return;}
  if(stage.pitchKey!==key){
    if(sharedFields)sharedFields.pitch(stage.pitch||stage.output,source,control,config);
    else drawPitchFollow(stage.pitch||stage.output,source,control,config);
    stage.pitchKey=key;
  }
  const output=stage.pitch||stage.output;
  g.drawImage(output,0,0);
  if(show){
    const guideCanvas=stage.pitchGuide||stage.guide;
    const guide=guideCanvas.getContext('2d');
    guide.setTransform(1,0,0,1,0,0);
    guide.clearRect(0,0,canvas.width,canvas.height);
    drawPitchFollowGuide(guide,config,control);
    guide.globalCompositeOperation='destination-in';
    guide.drawImage(output,0,0);
    guide.globalCompositeOperation='source-over';
    g.drawImage(guideCanvas,0,0);
  }
}
function preparedHead(layer,controls){
  const angle=(controls.yaw||0)*rigCurrent.headSurface.maxDegrees;
  const pitch=(controls.pitch||0)*(rigCurrent.headPitch?.maxDegrees||0);
  const lighting=rigCurrent.faceLighting&&$('face-light').checked
    ? {config:rigCurrent.faceLighting,pitchConfig:rigCurrent.facePitchLighting||null,
       strength:Number($('face-light-strength').value)/100} : null;
  const gpu=rigCurrent.renderer?.gpuHead;
  const key=[gpu?'gpu-source':'cpu-warp',layer.image,activeMouthMode,gpu?0:angle,gpu?0:pitch,eyeBlink,eyeGazeX,eyeGazeY,
    Boolean(eyeAssets),$('show-head-surface').checked,$('show-head-pitch').checked,lighting?.strength??-1].join('|');
  if(key!==headSurfaceCacheKey){
    const g=headSurfaceSource.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1280,1280);
    g.drawImage(faceImage(layer),0,0);drawMouth(g);if(eyeAssets)drawEyes(g);
    if(gpu){headSurfaceCacheKey=key;return headSurfaceSource;}
    drawHeadSurface(headSurfaceCanvas,headSurfaceSource,angle,rigCurrent.headSurface,lighting,
      {inverseGridStep:3,pitchDegrees:pitch,pitchProfile:rigCurrent.headPitchProfile||null});
    if($('show-head-surface').checked||$('show-head-pitch').checked){
      const guide=headSurfaceGuideCanvas.getContext('2d');guide.setTransform(1,0,0,1,0,0);guide.clearRect(0,0,1280,1280);
      drawHeadSurfaceGuide(guide,rigCurrent.headSurface,angle,p=>p,pitch,rigCurrent.headPitchProfile||null);
      guide.globalCompositeOperation='destination-in';guide.drawImage(headSurfaceCanvas,0,0);guide.globalCompositeOperation='source-over';
      headSurfaceCanvas.getContext('2d').drawImage(headSurfaceGuideCanvas,0,0);
    }
    headSurfaceCacheKey=key;
  }
  return gpu?headSurfaceSource:headSurfaceCanvas;
}
function sharedGuide(layer){
  const name=layer.name;
  let image=null;
  if(name==='face'&&rigCurrent.renderer?.gpuHead&&($('show-head-surface').checked||$('show-head-pitch').checked)){
    image=headSurfaceGuideCanvas;const g=image.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1280,1280);
    drawHeadSurfaceGuide(g,rigCurrent.headSurface,0,p=>p,0,rigCurrent.headPitchProfile);
  }else if(name==='topwear'&&$('show-bust-field').checked){
    drawBustFieldGuide(bustGuideCanvas,layer.image,rigCurrent.bustField);image=bustGuideCanvas;
  }else if(name==='handwear'&&$('show-arm-field').checked){
    drawArmSwayGuide(armGuideCanvas,layer.image,{left:0,right:0},rigCurrent.armSway);image=armGuideCanvas;
  }else if(['fronthair','backhair'].includes(name)&&$('show-hair-follow').checked){
    image=hairFollowStages[name].guide;const g=image.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1280,1280);
    drawHairFollowGuide(g,rigCurrent.hairFollow.parts[name],0);
  }else if(name==='neck'&&$('show-neck-follow').checked){
    image=neckFollowGuideCanvas;const g=image.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1280,1280);
    drawNeckFollowGuide(g,rigCurrent.neckFollow,0,0);
  }
  if(image){const g=image.getContext('2d');g.globalCompositeOperation='destination-in';g.drawImage(layer.image,0,0);g.globalCompositeOperation='source-over'}
  return image;
}
function paint(target, transforms, controls={}) {
  gpuPresented=false;
  const active=['body','torso','head','left','right','yaw','pitch','headRoll'].some(id=>Math.abs(controls[id]||0)>1e-8)||
    Math.abs(bustAmplitude)+Math.abs(bustFollowPx)>1e-8||Object.values(hairFollowDrive).some(v=>Math.abs(v)>1e-8);
  if(sharedFields&&['shared-webgl-scene-stage1','shared-webgl-scene-stage2'].includes(rigCurrent.renderer.mode)&&transforms&&active){
    sharedFields.scene(target,layers,transforms,controls,rigCurrent,
      {hair:$('paused').checked?{fronthair:controls.yaw||0,backhair:controls.yaw||0}:hairFollowDrive,
       roll:(controls.headRoll||0)*(rigCurrent.headRoll?.maxDegrees||0),
       yaw:(controls.yaw||0)*rigCurrent.headSurface.maxDegrees,bustX:bustFollowPx,bustY:bustAmplitude},
      ()=>preparedHead(layers.find(l=>l.name==='face'),controls),()=>headSurfaceCacheKey,sharedGuide,
      $('face-light').checked?{surface:rigCurrent.headSurface,config:rigCurrent.faceLighting,pitchConfig:rigCurrent.facePitchLighting,
        strength:Number($('face-light-strength').value)/100,yaw:(controls.yaw||0)*rigCurrent.headSurface.maxDegrees,
        pitch:(controls.pitch||0)*rigCurrent.headPitch.maxDegrees}:null);
    gpuPresented=rigCurrent.renderer.presentation==='direct-webgl';
    if(gpuPresented){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1280,1280);}
    return;
  }
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
    if(layer.name==='handwear'&&transforms&&rigCurrent.armSway){
      const armControls={left:controls.left||0,right:controls.right||0};
      const guide=$('show-arm-field').checked;
      if(Math.abs(armControls.left)+Math.abs(armControls.right)>1e-7||guide){
        if(sharedFields)sharedFields.arm(armCanvas,layer.image,armControls,rigCurrent.armSway);
        else drawArmSway(armCanvas,layer.image,armControls,rigCurrent.armSway);
        g.drawImage(armCanvas,0,0);
        if(guide){
          drawArmSwayGuide(armGuideCanvas,armCanvas,armControls,rigCurrent.armSway);
          g.drawImage(armGuideCanvas,0,0);
        }
      }else g.drawImage(layer.image,0,0);
    }else if(transforms&&rigCurrent.hairFollow&&
       (layer.name==='fronthair'||layer.name==='backhair')){
      const stage=hairFollowStages[layer.name],part=rigCurrent.hairFollow.parts[layer.name];
      const drive=$('paused').checked?(controls.yaw||0):hairFollowDrive[layer.name];
      const sampling=rigCurrent.runtimeOptimization?.mode==='native-pixel-cache-review'
        ? 'analytic-inverse':rigCurrent.hairFollow.sampling;
      const fast=sampling==='analytic-inverse';
      let hairSource=layer.image;
      if(!(fast&&Math.abs(drive)<1e-8&&!$('show-hair-follow').checked)){
        if(!fast||stage.image!==layer.image){
          const source=stage.source.getContext('2d');
          source.setTransform(1,0,0,1,0,0);
          source.clearRect(0,0,canvas.width,canvas.height);
          source.drawImage(layer.image,0,0);
          stage.image=layer.image;
          stage.renderedDrive=null;
        }
        if(!fast||stage.renderedDrive===null||
           Math.abs(drive-stage.renderedDrive)>.0001){
          if(sharedFields)sharedFields.hair(stage.output,stage.source,drive,part);
          else drawHairFollow(stage.output,stage.source,drive,part,sampling);
          stage.renderedDrive=drive;
        }
        hairSource=stage.output;
      }
      if(rigCurrent.headPitch)
        paintPitchPart(g,hairSource,stage,controls.pitch||0,
          rigCurrent.headPitch.parts[layer.name],drive+'|'+(controls.pitch||0));
      else g.drawImage(hairSource,0,0);
      if($('show-hair-follow').checked){
        const guide=stage.guide.getContext('2d');
        guide.setTransform(1,0,0,1,0,0);
        guide.clearRect(0,0,canvas.width,canvas.height);
        drawHairFollowGuide(guide,part,drive);
        if(rigCurrent.headPitch&&Math.abs(controls.pitch||0)>1e-8){
          drawPitchFollow(stage.yawGuidePitch,stage.guide,controls.pitch,
            rigCurrent.headPitch.parts[layer.name]);
          g.drawImage(stage.yawGuidePitch,0,0);
        }else g.drawImage(stage.guide,0,0);
      }
    }else if(layer.name==='neck'&&transforms&&rigCurrent.neckFollow){
      const roll=(controls.headRoll||0)*rigCurrent.headRoll.maxDegrees;
      const yaw=(controls.yaw||0)*rigCurrent.headSurface.maxDegrees;
      const fast=rigCurrent.runtimeOptimization?.mode==='native-pixel-cache-review';
      let neckImage=layer.image;
      if(!(fast&&Math.abs(roll)+Math.abs(yaw)<1e-8&&
         !$('show-neck-follow').checked)){
        if(!fast||neckFollowSourceImage!==layer.image){
          const source=neckFollowSource.getContext('2d');
          source.setTransform(1,0,0,1,0,0);
          source.clearRect(0,0,canvas.width,canvas.height);
          source.drawImage(layer.image,0,0);
          neckFollowSourceImage=layer.image;
          neckFollowPoseKey=null;
        }
        const key=roll+'|'+yaw;
        if(!fast||neckFollowPoseKey!==key){
          if(sharedFields)sharedFields.neck(neckFollowCanvas,neckFollowSource,roll,yaw,rigCurrent.neckFollow);
          else drawNeckFollow(neckFollowCanvas,neckFollowSource,roll,yaw,
            rigCurrent.neckFollow);
          neckFollowPoseKey=key;
        }
        neckImage=neckFollowCanvas;
      }
      if(rigCurrent.headPitch)
        paintPitchPart(g,neckImage,neckPitchStage,controls.pitch||0,
          rigCurrent.headPitch.parts.neck,roll+'|'+yaw+'|'+(controls.pitch||0));
      else g.drawImage(neckImage,0,0);
      if($('show-neck-follow').checked){
        const guide=neckFollowGuideCanvas.getContext('2d');
        guide.setTransform(1,0,0,1,0,0);
        guide.clearRect(0,0,canvas.width,canvas.height);
        drawNeckFollowGuide(guide,rigCurrent.neckFollow,roll,yaw);
        if(rigCurrent.headPitch&&Math.abs(controls.pitch||0)>1e-8){
          drawPitchFollow(neckPitchStage.yawGuidePitch,neckFollowGuideCanvas,
            controls.pitch,rigCurrent.headPitch.parts.neck);
          g.drawImage(neckPitchStage.yawGuidePitch,0,0);
        }else g.drawImage(neckFollowGuideCanvas,0,0);
      }
    }else if(layer.name==='topwear'&&transforms&&
       ['topwear-local-bilateral','topwear-local-bilateral-pixel',
         'topwear-local-bilateral-pixel-xy']
         .includes(rigCurrent.bustField?.mode)&&
       Math.abs(bustAmplitude)+Math.abs(bustFollowPx)>1e-6){
      const displacement=rigCurrent.bustField.mode==='topwear-local-bilateral-pixel-xy'
        ? {vertical:bustAmplitude,horizontal:bustFollowPx}:bustAmplitude;
      if(sharedFields)sharedFields.bust(bustCanvas,layer.image,displacement,rigCurrent.bustField);
      else drawBustField(bustCanvas,layer.image,displacement,rigCurrent.bustField);
      g.drawImage(bustCanvas,0,0);
    }else if(layer.name==='face'&&transforms&&rigCurrent.headSurface){
      const angle=(controls.yaw||0)*rigCurrent.headSurface.maxDegrees;
      const pitch=(controls.pitch||0)*(rigCurrent.headPitch?.maxDegrees||0);
      const lighting=rigCurrent.faceLighting&&$('face-light').checked
        ? {config:rigCurrent.faceLighting,
            pitchConfig:rigCurrent.facePitchLighting||null,
            strength:Number($('face-light-strength').value)/100}
        : null;
      const cache=rigCurrent.runtimeOptimization?.mode==='native-pixel-cache-review';
      const key=cache?[layer.image,activeMouthMode,angle,pitch,eyeBlink,eyeGazeX,eyeGazeY,
        Boolean(eyeAssets),Boolean($('show-head-surface').checked),
        Boolean($('show-head-pitch').checked),
        lighting?.strength??-1].join('|'):null;
      if(!cache||key!==headSurfaceCacheKey){
        const sourceContext=headSurfaceSource.getContext('2d');
        sourceContext.setTransform(1,0,0,1,0,0);
        sourceContext.clearRect(0,0,canvas.width,canvas.height);
        sourceContext.drawImage(faceImage(layer),0,0);
        drawMouth(sourceContext);
        if(eyeAssets&&layer.visible)drawEyes(sourceContext);
        drawHeadSurface(headSurfaceCanvas,headSurfaceSource,angle,
          rigCurrent.headSurface,lighting,
          {inverseGridStep:cache?3:1,pitchDegrees:pitch,
            pitchProfile:rigCurrent.headPitchProfile||null});
        if($('show-head-surface').checked||$('show-head-pitch').checked){
          const guide=headSurfaceGuideCanvas.getContext('2d');
          guide.setTransform(1,0,0,1,0,0);
          guide.clearRect(0,0,canvas.width,canvas.height);
          drawHeadSurfaceGuide(guide,rigCurrent.headSurface,angle,
            point=>point,pitch,rigCurrent.headPitchProfile||null);
          guide.globalCompositeOperation='destination-in';
          guide.drawImage(headSurfaceCanvas,0,0);
          guide.globalCompositeOperation='source-over';
          headSurfaceCanvas.getContext('2d').drawImage(headSurfaceGuideCanvas,0,0);
        }
        headSurfaceCacheKey=key;
      }
      g.drawImage(headSurfaceCanvas,0,0);
    }else {
      g.drawImage(faceImage(layer),0,0);
      if(layer.name==='face')drawMouth(g);
    }
    if(layer.name==='topwear'&&$('show-bust-field').checked &&
       ['topwear-local-bilateral','topwear-local-bilateral-pixel',
         'topwear-local-bilateral-pixel-xy'].includes(rigCurrent?.bustField?.mode)){
      if(bustGuideSource!==layer.image){
        drawBustFieldGuide(bustGuideCanvas,layer.image,rigCurrent.bustField);
        bustGuideSource=layer.image;
      }
      g.drawImage(bustGuideCanvas,0,0);
    }
    if(layer.name==='face'&&eyeAssets&&layer.visible&&
       !(transforms&&rigCurrent.headSurface))drawEyes(g);
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
      if(sharedFields)sharedFields.stance(target,source,controls,rigCurrent.grounding);
      else drawStanceField(target,source,controls,rigCurrent.grounding);
    }
  }
}
function paintHeadYaw(target,value){
  if(!rigCurrent?.headYaw ||
     (Math.abs(value)<1e-6&&!$('show-head-yaw-field').checked))return;
  const sourceContext=yawSourceCanvas.getContext('2d');
  sourceContext.setTransform(1,0,0,1,0,0);
  sourceContext.clearRect(0,0,canvas.width,canvas.height);
  sourceContext.drawImage(target,0,0);
  drawHeadYawField(yawCanvas,yawSourceCanvas,value,rigCurrent.headYaw);
  const g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,canvas.width,canvas.height);
  g.drawImage(yawCanvas,0,0);
  if($('show-head-yaw-field').checked){
    drawHeadYawGuide(yawGuideCanvas,yawSourceCanvas,rigCurrent.headYaw,value);
    drawHeadYawField(yawGuideWarpCanvas,yawGuideCanvas,value,rigCurrent.headYaw);
    g.drawImage(yawGuideWarpCanvas,0,0);
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
  const tilt=rigCurrent.grounding?.hipTilt;
  if(tilt){
    ctx.strokeStyle='#ffc364';ctx.lineWidth=1.5;
    for(const y of [tilt.topY,(tilt.topY+tilt.bottomY)/2,tilt.bottomY]){
      ctx.beginPath();
      for(let x=tilt.centerX-145;x<=tilt.centerX+145;x+=10){
        const dx=stanceOffset(y,controls,rigCurrent.grounding);
        const py=y+hipTiltOffset(x,y,controls,rigCurrent.grounding);
        if(x===tilt.centerX-145)ctx.moveTo(x+dx,py);
        else ctx.lineTo(x+dx,py);
      }
      ctx.stroke();
    }
    ctx.fillStyle='#ffc364';
    ctx.fillText('臀部平移＋微傾影響範圍',
      tilt.centerX+stanceOffset((tilt.topY+tilt.bottomY)/2,controls,rigCurrent.grounding)+150,
      (tilt.topY+tilt.bottomY)/2);
  }
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
  if(rigCurrent.headRoll){
    const landmark=rigCurrent.headRoll.reviewLandmark;
    const stance=rigCurrent.grounding?.mode==='shared-stance-field';
    const samples=[-1,0,1].map(headRoll=>{
      const matrix=evaluate({...controls,headRoll},0).face;
      const point=guidePoint(multiply(groundMatrix(controls.body||0),matrix),landmark);
      if(stance)point[0]+=stanceOffset(point[1],controls,rigCurrent.grounding);
      return point;
    });
    ctx.strokeStyle='#ffca71';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(...samples[0]);ctx.quadraticCurveTo(...samples[1],...samples[2]);ctx.stroke();
    for(const point of samples){
      ctx.beginPath();ctx.arc(point[0],point[1],3,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle='#ffca71';
    ctx.fillText('頭部傾斜 ±'+rigCurrent.headRoll.maxDegrees+'°',samples[1][0]+8,samples[1][1]-8);
  }
  ctx.restore();
}
function draw(time=elapsed) {
  if (!loaded) return;
  activeMouthMode=mouthAssets&&!$('reference').checked
    ? mouthAssets.mode($('mouth-shape').value,$('auto-talk').checked,time) : 'original';
  review.mouth={active:activeMouthMode,requested:$('mouth-shape').value,
    auto:Boolean(mouthAssets&&$('auto-talk').checked),transition:'discrete-source-art-switch'};
  review.drawCount=(review.drawCount||0)+1;
  review.renderer={mode:sharedFields?rigCurrent.renderer.mode:'legacy-canvas-fields',
    gpuDraws:sharedFields?.mesh.draws||0,head:rigCurrent.renderer?.gpuHead?'shared-gpu-curved-light':'existing-native-curved-pixel-light'};
  const controls=controlsAt(time);
  review.pointer={desired:pointerDesired,eased:pointerEased,mix:followMix};
  review.bust={amplitudePx:bustAmplitude,followPx:bustFollowPx,
    strength:Number($('bust').value)};
  review.bustGuideVisible=$('show-bust-field').checked;
  review.headRollDegrees=rigCurrent.headRoll
    ? controls.headRoll*rigCurrent.headRoll.maxDegrees : 0;
  review.headYawPixels=rigCurrent.headYaw
    ? controls.yaw*rigCurrent.headYaw.maxPixels : 0;
  review.headGeometryDegrees=rigCurrent.headGeometry
    ? controls.yaw*rigCurrent.headGeometry.maxDegrees : 0;
  review.headSurfaceDegrees=rigCurrent.headSurface
    ? controls.yaw*rigCurrent.headSurface.maxDegrees : 0;
  review.headPitchDegrees=rigCurrent.headPitch
    ? controls.pitch*rigCurrent.headPitch.maxDegrees : 0;
  review.headSurfaceGuideVisible=Boolean(rigCurrent.headSurface&&
    $('show-head-surface').checked);
  review.headPitchGuideVisible=Boolean(rigCurrent.headPitch&&
    $('show-head-pitch').checked);
  review.neckGuideVisible=Boolean(rigCurrent.neckFollow&&
    $('show-neck-follow').checked);
  review.hairGuideVisible=Boolean(rigCurrent.hairFollow&&
    $('show-hair-follow').checked);
  review.hairFollow={...hairFollowDrive};
  if(rigCurrent.hairFollow?.idleAroundYaw)
    review.hairState={...hairIdleState,targets:{...hairIdleTargets}};
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
  }else{
    paint(canvas,transforms,controls);
    paintHeadYaw(canvas,controls.yaw);
  }
  if ($('show-guides').checked) drawGuides(transforms,controls);
  review.headGeometry=null;
  if(rigCurrent.headGeometry && $('show-head-geometry').checked &&
     !$('reference').checked){
    const matrix=multiply(groundMatrix(controls.body||0),transforms.face);
    const mapPoint=point=>{
      const placed=guidePoint(matrix,point);
      if(rigCurrent.grounding?.mode==='shared-stance-field')
        placed[0]+=stanceOffset(placed[1],controls,rigCurrent.grounding);
      return placed;
    };
    review.headGeometry=drawHeadGeometry(ctx,rigCurrent.headGeometry,
      review.headGeometryDegrees,mapPoint);
  }
  if(sharedFields&&rigCurrent.renderer?.presentation==='direct-webgl'){
    const gpu=sharedFields.mesh.canvas;
    gpu.hidden=!gpuPresented;canvas.style.opacity=gpuPresented?'0':'1';
    if(gpuPresented){
      if($('show-guides').checked||$('show-head-geometry').checked)
        sharedFields.mesh.draw(canvas,(x,y)=>[x,y],{clear:false});
    }
    review.actualCanvas=gpuPresented?gpu:canvas;
  }else review.actualCanvas=canvas;
  if(rigCurrent.grounding?.mode==='shared-stance-field'){
    const hip=stanceOffset(565,controls,rigCurrent.grounding);
    const face=stanceOffset(125,controls,rigCurrent.grounding);
    const arm=rigCurrent.armSway;
    const leftWrist=arm?armOffset(635,controls.left||0,arm.sides[0],arm):0;
    const rightWrist=arm?armOffset(635,controls.right||0,arm.sides[1],arm):0;
    review.currentPose={...controls,time,hipPx:hip,headPx:face,
      leftWristPx:leftWrist,rightWristPx:rightWrist};
    $('motion-readout').textContent=$('reference').checked
      ? '顯示靜態基準（動態仍可在背景播放）'
      : '目前：腰部 '+hip.toFixed(1)+' px、頭部 '+face.toFixed(1)+
        ' px'+(arm?'、左右腕 '+leftWrist.toFixed(1)+' / '+rightWrist.toFixed(1)+' px':'')+
        (rigCurrent.headRoll?'、頭部傾斜 '+review.headRollDegrees.toFixed(2)+'°':'')+
        (rigCurrent.headYaw?'、頭部微轉 '+Math.round(controls.yaw*100)+'%':'')+
        (rigCurrent.headGeometry?'、曲面推算 '+review.headGeometryDegrees.toFixed(1)+'°（僅線框）':'')+
        (rigCurrent.headSurface?'、臉部微轉 '+review.headSurfaceDegrees.toFixed(1)+'°（畫素候選）':'')+
        (rigCurrent.headPitch?'、抬低頭 '+review.headPitchDegrees.toFixed(1)+'°（2.5D 候選）':'')+
        ' · '+($('paused').checked?'已暫停':'播放中')+
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
          (node.id==='head'&&(rigPreset.headRoll
            ? node.maxDegrees!==original.maxDegrees
            : rigPreset.grounding?.mode==='shared-stance-field'
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
    schemaVersion:1,uiZoomBasis:'fit-v1',task,candidate:rigPreset.candidate,
    sourceSha256:rigPreset.sourceSha256,assemblySha256:rigPreset.assemblySha256,
    pivots:Object.fromEntries(rigCurrent.nodes.map(node=>[node.id,node.pivot])),
    headLimit:rigCurrent.nodes.find(node=>node.id==='head').maxDegrees,
    controls:Object.fromEntries([...ids,'energy','zoom',
      ...(rigCurrent.armSway?['arm-sway']:[]),
      ...(rigCurrent.headRoll?['head-roll']:[]),
      ...(rigCurrent.headYaw||rigCurrent.headGeometry||rigCurrent.headSurface?['yaw']:[]),
      ...(rigCurrent.headPitch?['pitch']:[]),
      ...(rigCurrent.bustField?['bust']:[]),
      ...(rigCurrent.faceLighting?['face-light-strength']:[]),
      ...(rigCurrent.eyeRig?['gaze-x','gaze-y','blink']:[])].map(id=>[id,Number($(id).value)])),
    toggles:Object.fromEntries(['auto','follow','paused','reference','show-guides',
      ...(rigCurrent.armSway?['show-arm-field']:[]),
      ...(rigCurrent.headYaw?['show-head-yaw-field']:[]),
      ...(rigCurrent.headGeometry?['show-head-geometry']:[]),
      ...(rigCurrent.headSurface?['show-head-surface']:[]),
      ...(rigCurrent.headPitch?['show-head-pitch']:[]),
      ...(rigCurrent.neckFollow?['show-neck-follow']:[]),
      ...(rigCurrent.hairFollow?['show-hair-follow']:[]),
      ...(rigCurrent.faceLighting?['face-light']:[]),
      ...(rigCurrent.eyeRig?['gaze-follow','auto-blink']:[])].map(id=>[id,$(id).checked])),
    view:$('view').value,
    mouth:mouthAssets?$('mouth-shape').value:'original',
    autoTalk:Boolean(mouthAssets&&$('auto-talk').checked)
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
    ...(rigCurrent.armSway?['arm-sway']:[]),
    ...(rigCurrent.headRoll?['head-roll']:[]),
    ...(rigCurrent.headYaw||rigCurrent.headGeometry||rigCurrent.headSurface?['yaw']:[]),
    ...(rigCurrent.headPitch?['pitch']:[]),
    ...(rigCurrent.bustField?['bust']:[]),
    ...(rigCurrent.faceLighting?['face-light-strength']:[]),
    ...(rigCurrent.eyeRig?['gaze-x','gaze-y','blink']:[])]) {
    const savedValue=data.controls?.[id];
    const value=id==='zoom'&&!data.uiZoomBasis&&Number.isFinite(savedValue)
      ? Math.max(Number($(id).min),Math.min(Number($(id).max),Math.round(savedValue/55*100)))
      : savedValue;
    if (!Number.isFinite(value)||value<Number($(id).min)||value>Number($(id).max))
      throw Error('控制值超出範圍：'+id);
    $(id).value=String(value);
    const out=$(id+'-value');if(out)out.textContent=id==='zoom'?value+'%':String(value);
  }
  for (const id of ['auto','follow','paused','reference','show-guides',
    ...(rigCurrent.armSway?['show-arm-field']:[]),
    ...(rigCurrent.headYaw?['show-head-yaw-field']:[]),
    ...(rigCurrent.headGeometry?['show-head-geometry']:[]),
    ...(rigCurrent.headSurface?['show-head-surface']:[]),
    ...(rigCurrent.headPitch?['show-head-pitch']:[]),
    ...(rigCurrent.neckFollow?['show-neck-follow']:[]),
    ...(rigCurrent.hairFollow?['show-hair-follow']:[]),
    ...(rigCurrent.faceLighting?['face-light']:[]),
    ...(rigCurrent.eyeRig?['gaze-follow','auto-blink']:[])]) {
    if (typeof data.toggles?.[id]!=='boolean') throw Error('開關值無效：'+id);
    $(id).checked=data.toggles[id];
  }
  if(rigCurrent.headGeometry)
    $('head-geometry-note').hidden=!$('show-head-geometry').checked;
  if (!['full','upper','face'].includes(data.view)) throw Error('檢查視角無效');
  $('view').value=data.view;
  if(mouthAssets){
    mouthAssets.mode(data.mouth||'original',false,0);
    $('mouth-shape').value=data.mouth||'original';$('auto-talk').checked=data.autoTalk===true;
  }
  setZoom();
  draw();
}
function setZoom() {
  const stage=document.querySelector('.stage');
  const availableWidth=Math.max(1,stage.clientWidth-24);
  const availableHeight=Math.max(1,stage.clientHeight-24);
  const fit=$('view').value==='full'&&innerWidth<=780
    ? Math.min(availableHeight,Math.max(availableWidth,520))
    : Math.min(availableWidth,availableHeight);
  const ratio=fit/canvas.width*Number($('zoom').value)/100;
  canvas.style.width=(canvas.width*ratio)+'px';
  $('zoom-value').textContent=$('zoom').value+'%';
  requestAnimationFrame(()=>{
    stage.scrollLeft=Math.max(0,canvas.width*ratio/2-stage.clientWidth/2);
    stage.scrollTop=$('view').value==='face'
      ? Math.max(0,220*ratio-stage.clientHeight*.24)
      : $('view').value==='upper' ? Math.max(0,170*ratio-stage.clientHeight*.15) : 0;
  });
}
addEventListener('resize',setZoom);
async function start() {
  if (!safeTask || !safeRig) throw Error('請提供有效任務名稱與候選 rig');
  const rigResponse = await fetch(base + rigFile,{cache:'no-store'});
  if (!rigResponse.ok) throw Error('讀取 Miffy rig 失敗：' + rigResponse.status);
  const chain=[await rigResponse.json()];
  while(chain.at(-1).extends){
    if(chain.length>24)throw Error('動態候選繼承層級過多');
    const child=chain.at(-1);
    if(!/^_review\/[A-Za-z0-9_-]+\/rig\.json$/.test(child.extends) ||
       !/^[0-9A-F]{64}$/.test(child.extendsSha256))
      throw Error('動態候選繼承資訊無效');
    const baseResponse=await fetch(base+child.extends,{cache:'no-store'});
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
  if(rig.headRoll){
    const node=rig.nodes?.find(item=>item.id==='head');
    if(rig.headRoll.mode!=='rigid-head-z' || !node ||
       node.motion!=='head-roll' || node.maxDegrees!==rig.headRoll.maxDegrees ||
       !Number.isFinite(node.maxDegrees) || node.maxDegrees<=0 ||
       node.maxDegrees>2 || !Array.isArray(rig.headRoll.reviewLandmark) ||
       rig.headRoll.reviewLandmark.length!==2 ||
       !rig.headRoll.reviewLandmark.every(Number.isFinite))
      throw Error('頭部傾斜候選參數無效');
  }
  if(rig.headYaw)validateHeadYawField(rig.headYaw);
  if(rig.headGeometry)validateHeadGeometry(rig.headGeometry);
  if(rig.headSurface)validateHeadSurface(rig.headSurface);
  if(rig.headPitch){
    if(rig.headPitch.mode!=='frontal-ellipsoid-pitch-review'||
       !Number.isFinite(rig.headPitch.maxDegrees)||
       rig.headPitch.maxDegrees<=0||rig.headPitch.maxDegrees>6||
       !rig.headSurface||!rig.neckFollow||!rig.hairFollow||
       !['neck','fronthair','backhair'].every(name=>rig.headPitch.parts?.[name]))
      throw Error('抬低頭候選需要既有頭、頸、髮綁定');
    for(const name of ['neck','fronthair','backhair'])
      validatePitchFollow(rig.headPitch.parts[name]);
  }
  if(rig.headPitchProfile){
    if(!rig.headPitch||rig.headPitchProfile.maxDegrees!==rig.headPitch.maxDegrees)
      throw Error('鼻樑分區俯仰需要既有抬低頭綁定');
    validateHeadPitchProportion(rig.headPitchProfile);
  }
  if(rig.faceLighting)validateHeadLighting(rig.faceLighting,rig.headSurface);
  if(rig.facePitchLighting){
    if(!rig.headPitch||!rig.faceLighting||
       rig.facePitchLighting.maxDegrees!==rig.headPitch.maxDegrees)
      throw Error('抬低頭光影需要既有臉部光影與抬低頭綁定');
    validatePitchHeadLighting(rig.facePitchLighting,rig.headSurface);
  }
  if(rig.neckFollow){
    validateNeckFollow(rig.neckFollow);
    if(!rig.headRoll||!rig.headSurface||rig.bindings?.neck!=='torso')
      throw Error('脖子連動需要已驗證的頭部傾斜、微轉及軀幹綁定');
  }
  if(rig.hairFollow){
    validateHairFollow(rig.hairFollow);
    if(rig.hairFollow.idleAroundYaw)
      validateHairIdle(rig.hairFollow.idleAroundYaw);
    if(!rig.headSurface||rig.hairFollow.maxYaw!==rig.headSurface.maxDegrees||
       rig.bindings?.fronthair!=='frontHair'||
       rig.bindings?.backhair!=='backHair')
      throw Error('頭髮連動需要已驗證的前後髮綁定與頭部微轉');
  }
  if(rig.runtimeOptimization?.mode&&
     rig.runtimeOptimization.mode!=='native-pixel-cache-review')
    throw Error('非正式效能候選模式無效');
  if(rig.bustField)validateBustField(rig.bustField);
  if(rig.armSway){
    validateArmSway(rig.armSway);
    if(rig.armSway.owner!=='handwear.png'||
       !Number.isFinite(rig.armSway.idleGain)||
       rig.armSway.idleGain<0||rig.armSway.idleGain>1||
       !Number.isFinite(rig.armSway.followGain)||
       rig.armSway.followGain<0||rig.armSway.followGain>.3||
       !Number.isFinite(rig.armSway.leftPhase)||
       !Number.isFinite(rig.armSway.rightPhase))
      throw Error('雙臂擺動參數無效');
  }
  if(rig.bustField && (!Number.isInteger(rig.bustField.defaultStrength) ||
      rig.bustField.defaultStrength<0 || rig.bustField.defaultStrength>100))
    throw Error('胸部動態預設值無效');
  if(rig.eyeRig && rig.grounding?.mode!=='shared-stance-field')
    throw Error('眼部候選需要已通過接地驗證的 Miffy 組裝');
  if (!/^_review\/[A-Za-z0-9_-]+\/assembly\.json$/.test(rig.assembly))
    throw Error('組裝配置路徑不符合候選格式');
  const assemblyResponse = await fetch(base + rig.assembly,{cache:'no-store'});
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
  armCanvas.width=canvas.width;armCanvas.height=canvas.height;
  armGuideCanvas.width=canvas.width;armGuideCanvas.height=canvas.height;
  for(const stage of [yawSourceCanvas,yawCanvas,yawGuideCanvas,yawGuideWarpCanvas]){
    stage.width=canvas.width;stage.height=canvas.height;
  }
  for(const stage of [headSurfaceSource,headSurfaceCanvas,headSurfaceGuideCanvas]){
    stage.width=canvas.width;stage.height=canvas.height;
  }
  for(const stage of [neckFollowSource,neckFollowCanvas,neckFollowGuideCanvas]){
    stage.width=canvas.width;stage.height=canvas.height;
  }
  for(const stage of Object.values(neckPitchStage)){
    stage.width=canvas.width;stage.height=canvas.height;
  }
  for(const set of Object.values(hairFollowStages))
    for(const stage of Object.values(set)){
      stage.width=canvas.width;stage.height=canvas.height;
    }
  bustGuideSource=null;
  if(rig.renderer){
    if(!['shared-webgl-fields-stage1','shared-webgl-scene-stage1','shared-webgl-scene-stage2'].includes(rig.renderer.mode))throw Error('未知的共用渲染候選');
    sharedFields=createSharedFieldAdapter(rig.renderer.presentation==='direct-webgl');
    if(rig.renderer.presentation==='direct-webgl'){
      const gpu=sharedFields.mesh.canvas;gpu.id='gpu-stage';gpu.hidden=true;
      Object.assign(gpu.style,{position:'absolute',pointerEvents:'none',margin:'0'});
      canvas.parentElement.style.position='relative';canvas.parentElement.append(gpu);
      const sync=()=>{gpu.style.left=canvas.offsetLeft+'px';gpu.style.top=canvas.offsetTop+'px';
        gpu.style.width=canvas.offsetWidth+'px';gpu.style.height=canvas.offsetHeight+'px';};
      new ResizeObserver(sync).observe(canvas);window.addEventListener('resize',sync);sync();
    }
  }
  if(rig.mouthRig){
    mouthAssets=await loadMouthTransplant(base,rig.mouthRig,getImage,sha256);
    $('mouth-shape').disabled=false;$('auto-talk').disabled=false;
    $('mouth-controls').hidden=false;
    $('mouth-title').hidden=false;
  }
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
  let settingsRestored=false;
  try {
    const saved=localStorage.getItem(storageKey);
    if (saved) {
      applySettings(JSON.parse(saved));
      settingsRestored=true;
      $('settings-status').textContent='已載入此瀏覽器的 Miffy 候選設定。';
    }
  } catch (error) {
    $('settings-status').textContent='保存設定無法載入：'+error.message;
    applyRig(rigPreset);
  }
  review.candidate=rig.candidate;
  if(rig.headRoll){
    $('head-roll').disabled=false;
    $('head-roll').parentElement.classList.remove('disabled');
    $('head-roll-value').textContent='0';
    $('face-note').textContent='這一版只試做小幅頭部左右傾斜；左右轉、抬低頭及表情尚未製作。';
    $('limits-note').textContent+=' 頭部傾斜是剛性 Z 軸候選，請檢查髮際、雙耳、下顎與頸根兩側極限；不代表完成三軸轉頭。';
  }
  if(rig.headYaw){
    $('yaw').disabled=false;$('yaw').parentElement.classList.remove('disabled');
    $('yaw-value').textContent='0';
    $('show-head-yaw-field').disabled=false;
    $('show-head-yaw-field').checked=false;
    $('face-note').textContent='小幅頭部傾斜與左右微轉可分別檢視；抬低頭及表情尚未製作。';
    $('limits-note').textContent+=' 左右微轉是現有正面圖的局部 2.5D 變形，不是側臉或真正 3D；請放大檢查兩側輪廓、眼瞼、髮際與頸根。';
  }
  if(rig.headGeometry){
    $('yaw').disabled=false;$('yaw').parentElement.classList.remove('disabled');
    document.querySelector('label[for="yaw"]').textContent='臉部曲面微轉推算';
    $('yaw-value').textContent='0';
    $('show-head-geometry').disabled=false;
    $('show-head-geometry').checked=false;
    $('face-note').textContent='這一版先檢查臉部曲面投影；滑動「頭部左右微轉」只移動線框與五官標記，角色圖像不會轉動。';
    $('limits-note').textContent+=' 曲面半徑、景深與角度皆為待核對的推算；v23 扭圖候選已否決。此版未製作頭部轉動或表情。';
  }
  if(rig.headSurface){
    $('yaw').disabled=false;$('yaw').parentElement.classList.remove('disabled');
    document.querySelector('label[for="yaw"]').textContent='頭部左右微轉（實際畫素）';
    $('yaw-value').textContent='0';
    $('show-head-surface').disabled=false;
    $('show-head-surface').checked=false;
    $('face-note').textContent='這版會讓現有頭部畫素依曲面投影微轉；前後髮仍由原圖層遮擋。請檢查兩側輪廓、耳根、眼睛與下巴。';
    $('limits-note').textContent+=' v25 只有正面素材的透視近似，沒有側面補圖或完整三軸頭部；角度僅供審查，不是正式設定。';
    if(rig.candidate==='motion_v26'){
      $('face-note').textContent='v26 只把臉部曲面的深度重心下移 13 畫素；請和 v25 用相同角度比較眼睛、鼻子、嘴巴及下巴。光影尚未改動。';
      $('limits-note').textContent+=' v26 是單一參數 A/B，並非已核准的轉頭或光影版本。';
    }
  }
  if(rig.faceLighting){
    $('face-light').disabled=false;
    $('face-light-strength').disabled=false;
    $('face-light-strength').parentElement.classList.remove('disabled');
    if(!settingsRestored){
      $('face-light').checked=true;
      $('face-light-strength').value=String(rig.faceLighting.defaultStrength);
    }
    $('face-light-strength-value').textContent=$('face-light-strength').value;
    $('face-note').textContent=rig.candidate==='motion_v29'
      ? 'v29 上半臉受光測試：−100 左暗右亮，+100 右暗左亮；額頭至鼻尖較亮，鼻尖以下亮度漸退至零，暗側仍保留。0 是原畫。'
      : rig.candidate==='motion_v28'
      ? 'v28 測試左右臉頰明暗互換：−100 左暗右亮，+100 右暗左亮；0 保留原畫。可關閉光影對照同一轉頭姿勢。'
      : 'v27 測試轉頭時的臉部明暗變化。正面維持原畫；關閉光影可與 v26 同姿勢比較。';
    $('limits-note').textContent+=' 表面方向是暫定推算，並非原畫法線圖；不會補出側臉，也未核准發布。';
  }
  if(rig.neckFollow){
    $('show-neck-follow').disabled=false;
    $('show-neck-follow').checked=false;
    $('face-note').textContent='v30 保留 v29 頭部，只測試脖子跟隨傾斜與微轉：下巴附近稍動，鎖骨端幾乎固定。';
    $('limits-note').textContent+=' 脖子為獨立圖層的局部曲面候選，請看兩側極限、髮際與鎖骨接縫；不代表已驗收。';
  }
  if(rig.hairFollow){
    $('show-hair-follow').disabled=false;
    $('show-hair-follow').checked=false;
    $('face-note').textContent='v30 保留 v29 頭部；脖子分段連動，前髮順著微轉、後髮反向，以小幅慣性跑過頭再回穩。';
    $('limits-note').textContent+=' 前後髮只由「頭部左右微轉」觸發額外慣性；原本附著頭部的傾斜保留。請檢查頭皮、耳邊與肩部遮擋。';
  }
  if(rig.hairFollow?.idleAroundYaw){
    $('face-note').textContent=rig.candidate+' 前髮微轉上限 '+
      rig.hairFollow.parts.fronthair.maxPixels+' 原圖畫素；拖動頭部時由轉向主導，停下後以目前角度為中心恢復頭髮待機擺動。';
    $('limits-note').textContent+=' 髮絲擺動滑桿只調整待機幅度；待機關閉或強度為零時，髮絲仍停在目前微轉位置。滑桿極限仍是 ±100，建議先在 ±50 檢視。';
  }
  if(rig.headPitch){
    $('pitch').disabled=false;$('pitch').parentElement.classList.remove('disabled');
    $('pitch-value').textContent='0';
    $('show-head-pitch').disabled=false;
    $('show-head-pitch').checked=false;
    $('face-note').textContent='v34 抬低頭 2.5D 試作：正面臉部以有限曲面投影移動，眼部一起取樣；頸與前後髮做較弱連動。不是 Live2D 變形器或真正立體頭模。';
    $('limits-note').textContent+=' 抬頭為正、低頭為負；只使用現有正面素材，不生成下巴底面或頭頂新畫面。請檢查鼻、眼、下巴、髮際和頸接縫，以及與左右微轉的四角組合。';
  }
  if(rig.facePitchLighting){
    $('face-note').textContent=rig.candidate+' 沿用 v36 曲面抬低頭；同一個「頭部光影」開關和強度，抬頭提亮鼻樑以上，低頭壓暗鼻樑以下。'+
      (rig.candidate==='motion_v38'?'這版亮暗幅度是 v37 的兩倍；':'')+'0 保留原畫。';
    $('limits-note').textContent+=' 光影仍是膚色圖層的審查候選，請切換開關檢查兩端、鼻樑過渡與五官是否被染到；尚未核准。';
  }
  if(rig.runtimeOptimization){
    $('limits-note').textContent+=' v31 只快取未變的原解析度頭部畫素並優化頭髮取樣；請與 v30 同角度比對邊緣畫質與播放速度。';
  }
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
  if(rig.armSway){
    $('arm-sway').disabled=false;
    $('arm-sway').parentElement.classList.remove('disabled');
    $('arm-sway-value').textContent=$('arm-sway').value;
    $('show-arm-field').disabled=false;
    $('show-arm-field').checked=false;
    $('limits-note').textContent+=' 雙手是同圖層的分側畫素擺動；上臂較小、前臂與手腕較大，並非獨立手肘骨架。請檢查肩膀及手部遮擋。';
  }
  const hasLocalBustField=['topwear-local-bilateral',
    'topwear-local-bilateral-pixel','topwear-local-bilateral-pixel-xy']
    .includes(rig.bustField?.mode);
  $('show-bust-field').disabled=!hasLocalBustField;
  $('show-bust-field').checked=false;
  $('bust-field-note').hidden=true;
  $('candidate-title').textContent='Miffy · v50 階段展示';
  $('latest').hidden=true;
  if(rig.candidate==='motion_v18'){
    $('latest').href='?local='+encodeURIComponent(task)+'&rig=_review/motion_v19/rig.json';
    $('latest').textContent='開啟 v19 下緣收窄與加強乳搖候選';
    $('latest').hidden=false;
  }
  if(rig.candidate==='motion_v25'){
    $('latest').href='?local='+encodeURIComponent(task)+'&rig=_review/motion_v26/rig.json';
    $('latest').textContent='對照 v26 曲面重心下移';
    $('latest').hidden=false;
  }else if(rig.candidate==='motion_v26'){
    $('latest').href='?local='+encodeURIComponent(task)+'&rig=_review/motion_v27/rig.json';
    $('latest').textContent='試看 v27 可關閉的轉向光影';
    $('latest').hidden=false;
  }else if(rig.candidate==='motion_v27'){
    $('latest').href='?local='+encodeURIComponent(task)+'&rig=_review/motion_v28/rig.json';
    $('latest').textContent='試看 v28 左右臉頰明暗互換';
    $('latest').hidden=false;
  }else if(rig.candidate==='motion_v28'){
    $('latest').href='?local='+encodeURIComponent(task)+'&rig=_review/motion_v29/rig.json';
    $('latest').textContent='試看 v29 上半臉受光候選';
    $('latest').hidden=false;
  }else if(rig.candidate==='motion_v29'){
    $('latest').href='?local='+encodeURIComponent(task)+'&rig=_review/motion_v28/rig.json';
    $('latest').textContent='對照 v28 全臉亮側';
    $('latest').hidden=false;
  }
  if(rig.grounding?.mode==='shared-stance-field'){
    document.querySelector('label[for="body"]').textContent='重心微移';
    document.querySelector('label[for="torso"]').textContent='胸廓補償';
    document.querySelector('label[for="head"]').textContent='頭部穩定';
    $('head-limit').disabled=true;
    $('head-limit').title='v4 不以頭部旋轉處理站姿；此項校正暫停使用';
  }
  $('status').textContent='已載入 17 層 · v50 階段展示';
  $('source-info').textContent = '來源：' + task + ' · 組裝：' + rig.assembly +
    ' · 骨架：' + rig.candidate +
    (rig.grounding?' · 共用接地變形（非腳部 IK）':'')+' · 待人工動態驗收';
  renderLayers();compactMotionPanel();setZoom();draw();
}
let motionPanelCompacted=false;
function compactMotionPanel(){
  if(!motionPanelCompacted){
    const panel=$('panel-motion');
    for(const title of [...panel.children].filter(node=>node.tagName==='H2')){
      const section=document.createElement('details');
      section.className='control-group';
      section.hidden=title.hidden;
      section.open=['姿勢與動態','口形','待機與檢視'].includes(title.textContent);
      const summary=document.createElement('summary');summary.textContent=title.textContent;
      panel.insertBefore(section,title);section.append(summary);
      let node=title.nextSibling;title.remove();
      while(node&&node.nodeName!=='H2'){
        const next=node.nextSibling;section.append(node);node=next;
      }
    }
    const review=[...panel.querySelectorAll('.control-group')].find(group=>group.querySelector('summary')?.textContent==='待機與檢視');
    const diagnostics=document.createElement('details');diagnostics.className='control-group';
    const summary=document.createElement('summary');summary.textContent='網格與錨點';diagnostics.append(summary);
    for(const id of ['show-guides','show-bust-field','show-arm-field','show-head-yaw-field','show-head-geometry','show-head-surface','show-head-pitch','show-neck-follow','show-hair-follow']){
      const input=$(id),label=input?.closest('label');
      if(label){const row=document.createElement('div');row.className='checks';row.append(label);diagnostics.append(row);}
    }
    review?.append(diagnostics);
    motionPanelCompacted=true;
  }
  for(const row of document.querySelectorAll('#panel-motion .row, #panel-calibrate .row')){
    const input=row.querySelector('input');if(input)row.hidden=input.disabled;
  }
  for(const row of document.querySelectorAll('#panel-motion .checks')){
    for(const label of row.querySelectorAll('label')){
      const input=label.querySelector('input');if(input)label.hidden=input.disabled;
    }
    row.hidden=![...row.querySelectorAll('label')].some(label=>!label.hidden);
  }
}
for (const id of [...ids,'energy','bust','arm-sway','gaze-x','gaze-y','blink','head-roll','yaw','pitch','face-light-strength']) {
  $(id).oninput = () => {
    $(id+'-value').textContent = $(id).value;
    if(id==='yaw'&&rigCurrent?.hairFollow?.idleAroundYaw&&$('paused').checked){
      const yaw=Number($('yaw').value)/100;
      hairIdleState=initialHairIdleState(yaw);
      hairIdleTargets={fronthair:yaw,backhair:yaw};
      for(const name of ['fronthair','backhair']){
        hairFollowStates[name]={position:yaw,velocity:0};
        hairFollowDrive[name]=yaw;
      }
    }
    // During playback, the existing animation frame consumes the latest yaw.
    // Avoid a second synchronous full-canvas paint for every pointer event.
    if(['yaw','pitch'].includes(id)&&rigCurrent?.runtimeOptimization&&
       !$('paused').checked)return;
    draw();
  };
}
$('zoom').oninput=setZoom;
$('mouth-shape').onchange=()=>{$('auto-talk').checked=false;draw();};
$('auto-talk').onchange=()=>draw();
$('view').onchange=()=>{
  $('zoom').value={full:100,upper:165,face:260}[$('view').value];
  setZoom();
};
$('auto').onchange = () => draw();
$('follow').onchange = () => draw();
$('reference').onchange = () => draw();
$('paused').onchange = () => {
  if(rigCurrent?.hairFollow?.idleAroundYaw&&!$('paused').checked){
    const yaw=Number($('yaw').value)/100;
    hairIdleState=initialHairIdleState(yaw);
    hairIdleTargets={fronthair:yaw,backhair:yaw};
    for(const name of ['fronthair','backhair']){
      hairFollowStates[name]={position:yaw,velocity:0};
      hairFollowDrive[name]=yaw;
    }
  }
  draw();
};
$('show-guides').onchange = () => draw();
$('show-arm-field').onchange=()=>draw();
$('show-head-yaw-field').onchange=()=>draw();
$('show-head-geometry').onchange=()=>{
  $('head-geometry-note').hidden=!$('show-head-geometry').checked;
  draw();
};
$('show-head-surface').onchange=()=>draw();
$('show-head-pitch').onchange=()=>draw();
$('show-neck-follow').onchange=()=>draw();
$('show-hair-follow').onchange=()=>draw();
$('face-light').onchange=()=>draw();
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
  $('mouth-shape').value='original';$('auto-talk').checked=false;
  for (const id of [...ids,'energy','bust',
    ...(rigCurrent?.armSway?['arm-sway']:[]),
    ...(rigCurrent?.headRoll?['head-roll']:[]),
    ...(rigCurrent?.headYaw||rigCurrent?.headGeometry||rigCurrent?.headSurface?['yaw']:[]),
    ...(rigCurrent?.headPitch?['pitch']:[]),
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
  $('show-arm-field').checked=false;
  $('show-head-yaw-field').checked=false;
  $('show-head-geometry').checked=false;$('head-geometry-note').hidden=true;
  $('show-head-surface').checked=false;
  $('show-head-pitch').checked=false;
  $('show-neck-follow').checked=false;
  $('show-hair-follow').checked=false;
  elapsed = 0;
  pointerX = 0;
  pointerDesired=0;pointerEased=0;followMix=0;
  eyePointerDesiredX=0;eyePointerDesiredY=0;eyePointerX=0;eyePointerY=0;
  eyeBlink=0;eyeGazeX=0;eyeGazeY=0;
  bustAmplitude=0;bustFollowPx=0;bustVelocity=0;
  bustSpring={position:0,velocity:0};
  bustFollowSpring={position:0,velocity:0};
  hairFollowStates={fronthair:{position:0,velocity:0},
    backhair:{position:0,velocity:0}};
  hairFollowDrive={fronthair:0,backhair:0};
  hairIdleState=initialHairIdleState();
  hairIdleTargets={fronthair:0,backhair:0};
  draw(0);
};
$('defaults').onclick=()=>{
  $('mouth-shape').value='original';$('auto-talk').checked=false;
  const defaults={body:0,torso:0,head:0,hair:55,energy:80,
    ...(rigCurrent?.armSway?{'arm-sway':0}:{}),
    ...(rigCurrent?.headRoll?{'head-roll':0}:{}),
    ...(rigCurrent?.headYaw||rigCurrent?.headGeometry||rigCurrent?.headSurface?{yaw:0}:{}),
    ...(rigCurrent?.headPitch?{pitch:0}:{}),
    ...(rigCurrent?.bustField?{bust:rigCurrent.bustField.defaultStrength}:{}),
    ...(rigCurrent?.faceLighting?{'face-light-strength':rigCurrent.faceLighting.defaultStrength}:{}),
    ...(rigCurrent?.eyeRig?{'gaze-x':0,'gaze-y':0,blink:0}:{})};
  for(const [id,value] of Object.entries(defaults)){
    $(id).value=String(value);$(id+'-value').textContent=String(value);
  }
  $('auto').checked=true;$('follow').checked=true;
  if(rigCurrent?.eyeRig){$('gaze-follow').checked=true;$('auto-blink').checked=true;}
  $('paused').checked=false;$('reference').checked=false;
  $('show-guides').checked=false;
  $('show-arm-field').checked=false;
  $('show-head-yaw-field').checked=false;
  $('show-head-geometry').checked=false;$('head-geometry-note').hidden=true;
  $('show-head-surface').checked=false;
  $('show-head-pitch').checked=false;
  $('show-neck-follow').checked=false;
  $('show-hair-follow').checked=false;
  if(rigCurrent?.faceLighting)$('face-light').checked=true;
  $('show-bust-field').checked=false;$('bust-field-note').hidden=true;
  $('view').value='full';$('zoom').value='100';
  pointerX=0;pointerDesired=0;pointerEased=0;followMix=0;
  eyePointerDesiredX=0;eyePointerDesiredY=0;eyePointerX=0;eyePointerY=0;
  eyeBlink=0;eyeGazeX=0;eyeGazeY=0;
  bustAmplitude=0;bustFollowPx=0;bustVelocity=0;
  bustSpring={position:0,velocity:0};
  bustFollowSpring={position:0,velocity:0};
  if(rigCurrent?.hairFollow?.idleAroundYaw){
    hairFollowStates={fronthair:{position:0,velocity:0},
      backhair:{position:0,velocity:0}};
    hairFollowDrive={fronthair:0,backhair:0};
    hairIdleState=initialHairIdleState();
    hairIdleTargets={fronthair:0,backhair:0};
  }
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
  const beforeHair={...hairFollowDrive};
  const beforeIdleMix=hairIdleState.idleMix;
  if(loaded&&rigCurrent?.hairFollow&&!$('paused').checked){
    const yaw=Number($('yaw').value)/100;
    if(rigCurrent.hairFollow.idleAroundYaw){
      const result=advanceHairIdle(hairIdleState,yaw,delta,elapsed,
        $('auto').checked,Number($('hair').value)/100,
        rigCurrent.hairFollow.idleAroundYaw);
      hairIdleState=result.state;
      hairIdleTargets=result.targets;
    }else hairIdleTargets={fronthair:yaw,backhair:yaw};
    for(const name of ['fronthair','backhair']){
      const part=rigCurrent.hairFollow.parts[name];
      hairFollowStates[name]=advanceSpring(hairFollowStates[name],
        hairIdleTargets[name],delta,{
        frequency:part.frequency,damping:part.damping,maxPosition:1.15});
      hairFollowDrive[name]=hairFollowStates[name].position;
    }
  }
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
  const hairChanging=rigCurrent?.hairFollow&&
    (Math.abs(hairIdleState.idleMix-beforeIdleMix)>.0002||
    ['fronthair','backhair'].some(name=>
      Math.abs(hairFollowDrive[name]-beforeHair[name])>.0002||
      Math.abs(hairIdleTargets[name]-hairFollowDrive[name])>.0002));
  if (loaded && !$('paused').checked &&
      ($('auto').checked ||
        (mouthAssets&&$('auto-talk').checked) ||
        (!rigCurrent?.hairFollow?.idleAroundYaw&&Number($('hair').value)) ||
        bustChanging ||
        hairChanging ||
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
