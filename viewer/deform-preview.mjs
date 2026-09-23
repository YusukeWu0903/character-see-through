import {createRig} from './rig.mjs';
import {drivePose} from './motion.mjs';
import {createMeshRenderer} from './mesh-renderer.mjs?v=31';
import {validateDeformation,serializeSettings,parseSettings,deformPoint} from './deformation.mjs';
import {buildExpression,applyExpressivePose,advanceSpring,sharedGazeTarget,chestFollowTarget} from './expression.mjs?v=26';
import {assertViewerDefaults,resolveQualityProfile} from './quality-profile.mjs?v=21';
const $=id=>document.getElementById(id);
const task=new URLSearchParams(location.search).get('local');
$('legacy').href='/preview-rig?local='+encodeURIComponent(task||'');
const REF=['backhair','handwear','legwear','topwear','neck','bottomwear','earwear','ears','face','mouth','eyelash','nose','eyebrow','irides','fronthair'];
const LOC=['handwear','legwear','topwear','backhair','footwear','earwear','neck','bottomwear','eyebrow','ears','face','nose','mouth','eyelash','eyewhite','irides','fronthair'];
const controls={};
let cloud=null,cloudPromise=null;
for(const name of ['body','torso','head','breath','hair','energy','bust','yaw','gaze-x','gaze-y','blink']){
  const el=$(name),update=()=>{controls[name]=Number(el.value)/100;el.nextElementSibling.value=el.value;};
  el.addEventListener('input',update);update();
}
const inspection=new URLSearchParams(location.search);
function values(v){for(const [key,value] of Object.entries(v)){$(key).value=value;$(key).dispatchEvent(new Event('input'));}}
function neutral(){values({body:0,torso:0,head:0,breath:0,hair:0,energy:0,bust:0,yaw:0,'gaze-x':0,'gaze-y':0,blink:0});$('idle').checked=false;$('follow').checked=false;$('gaze-follow').checked=false;$('auto-blink').checked=false;}
$('neutral').onclick=neutral;
let productionViewer=null;
$('defaults').onclick=()=>{if(!productionViewer)return;values(productionViewer.controls);for(const [name,value] of Object.entries(productionViewer.toggles))$(name).checked=value;};
$('blink-now').onclick=()=>{values({blink:100});setTimeout(()=>values({blink:0}),180);};
$('compare').onchange=async()=>{
  $('left-title').textContent=$('compare').value==='cloud'?'雲端素材 · 柔性':'本機素材 · 剛性';
  if($('compare').value==='cloud')try{await ensureCloud();}catch(e){$('status').textContent='雲端對照素材載入失敗：'+e.message;}
};
// ===== 面板開關 =====
(function(){
  const sp=document.getElementById('sidePanel');
  const tg=document.getElementById('panelToggle');
  if(sp && tg){
    tg.addEventListener('click',()=>{
      sp.classList.toggle('open');
      tg.setAttribute('aria-expanded', sp.classList.contains('open'));
    });
  } else {
    console.warn('面板元素未找到');
  }
})();

// ===== 分頁切換 =====
(function(){
  document.querySelectorAll('.panel-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.panel-tab').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false');});
      document.querySelectorAll('.panel-content').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');btn.setAttribute('aria-selected','true');
      const p=document.getElementById('tab-'+btn.dataset.tab);
      if(p)p.classList.add('active');
    });
  });
})();

const canvas=$('stage'),guides=$('guides'),g=guides.getContext('2d');
let mx=0,my=0,tx=0,ty=0,layout=null;
canvas.addEventListener('pointermove',e=>{
  tx=e.clientX/innerWidth*2-1;
  ty=1-e.clientY/innerHeight*2;
  if(layout){
    const radius=Math.max(layout.s/layout.dpr,.001),cx=layout.cx/layout.dpr,cy=layout.cy/layout.dpr;
    tx=Math.max(-1,Math.min(1,(e.clientX-cx)/radius));
    ty=Math.max(-1,Math.min(1,(cy-e.clientY)/radius));
  }
});
canvas.addEventListener('pointerleave',()=>{tx=0;ty=0;});
function resize(){const d=Math.min(devicePixelRatio,2);canvas.width=guides.width=Math.round(innerWidth*d);canvas.height=guides.height=Math.round(innerHeight*d);}
addEventListener('resize',resize);resize();
async function load(names,prefix){return Promise.all(names.map(async name=>{const image=new Image();image.src=prefix+name+'.png';try{await image.decode();}catch{throw new Error('圖層載入失敗：'+name);}return {name,image};}));}
async function ensureCloud(){
  if(!cloudPromise)cloudPromise=load(REF,'/layers/seethrough/').then(layers=>(cloud=layers));
  return cloudPromise;
}
async function loadEyeAssets(prefix){
  const response=await fetch(prefix+'_rig_assets/eye_assets.json',{cache:'no-store'});
  if(!response.ok)return null;
  const manifest=await response.json();
  if(![1,2].includes(manifest.schemaVersion)||!Number.isFinite(manifest.limits?.gazeX)||!Number.isFinite(manifest.limits?.gazeY)||!Array.isArray(manifest.eyeCenter)||manifest.eyeCenter.length!==2||!manifest.eyeCenter.every(Number.isFinite))throw new Error('眼部素材描述格式無效');
  const names=['eyewhite_left','eyewhite_right','irides_left','irides_right',...(manifest.schemaVersion>=2?['eyelash_left','eyelash_right']:[])];
  // Generated fallbacks are not accepted as art.  They must be explicitly
  // marked after visual approval; otherwise preserve the safe lash-line
  // fallback and never cover the eye socket with an inpainted face patch.
  const accepted=manifest.closedEyelids;
  const approvedEyelids=accepted?.schemaVersion===3&&accepted.source==='hairless_head_artwork'&&accepted.visualReview?.status==='passed'&&/^[a-zA-Z0-9_-]+$/.test(accepted.assetDirectory||'');
  const layers=await load(names,prefix+'_rig_assets/');
  if(approvedEyelids)layers.push(...await load(['eyelid_closed_left','eyelid_closed_right'],prefix+'_rig_assets/'+accepted.assetDirectory+'/'));
  const candidate=new URLSearchParams(location.search).get('eyelid-candidate');
  if(candidate){
    if(!/^[a-zA-Z0-9_-]+$/.test(candidate))throw new Error('Invalid eyelid candidate name');
    const candidatePrefix=prefix+'_rig_candidates/'+candidate+'/';
    const candidateResponse=await fetch(candidatePrefix+'report.json');
    if(!candidateResponse.ok)throw new Error('Eyelid candidate report unavailable');
    const report=await candidateResponse.json();
    if(report.schemaVersion!==3||report.source!=='hairless_head_artwork')throw new Error('Unsupported eyelid candidate');
    const candidateLayers=await load(['eyelid_closed_left','eyelid_closed_right'],candidatePrefix);
    return {layers:[...layers.filter(x=>!x.name.startsWith('eyelid_closed_')),...candidateLayers],limits:[manifest.limits.gazeX,manifest.limits.gazeY],eyeCenter:manifest.eyeCenter,eyeCenters:manifest.eyeCenters,closedEyelids:true,candidate};
  }
  return {layers,limits:[manifest.limits.gazeX,manifest.limits.gazeY],eyeCenter:manifest.eyeCenter,eyeCenters:manifest.eyeCenters,closedEyelids:approvedEyelids};
}
async function loadSeamAssets(prefix){
  const response=await fetch(prefix+'_rig_assets/seam_assets.json',{cache:'no-store'});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('肩頸修補描述載入失敗');
  const manifest=await response.json();
  const approved=manifest.schemaVersion===1&&manifest.source==='registered_original'&&manifest.visualReview?.status==='passed'&&/^[a-zA-Z0-9_-]+$/.test(manifest.assetDirectory||'');
  if(!approved||manifest.layers?.join(',')!=='seam_repair_head,seam_repair_torso')throw new Error('肩頸修補描述格式無效');
  return {manifest,layers:await load(manifest.layers,prefix+'_rig_assets/'+manifest.assetDirectory+'/')};
}
try{
  if(!task)throw new Error('請提供 local 任務名稱');
  const [response,baselineResponse]=await Promise.all([fetch('/viewer-assets/eris-deform.json'),fetch('/viewer-assets/quality-baseline.json',{cache:'no-store'})]);
  if(!response.ok)throw new Error('角色設定載入失敗');
  if(!baselineResponse.ok)throw new Error('正式規格基準載入失敗');
  const preset=validateDeformation(await response.json());
  const baseline=await baselineResponse.json();
  const quality=resolveQualityProfile(inspection,baseline);
  productionViewer=baseline.production.viewer;
  assertViewerDefaults($,productionViewer);
  for(const name of ['blink','bust','gaze-x','gaze-y']){
    if(!inspection.has(name))continue;
    const value=Math.max(0,Math.min(100,Number(inspection.get(name))));
    if(Number.isFinite(value)){ $(name).value=String(value);$(name).dispatchEvent(new Event('input')); }
  }
  if(inspection.get('paused')==='1')$('paused').checked=true;
  if(inspection.get('view')==='upper')$('view').value='upper';
  window.__viewerQuality=quality;
  let rig=structuredClone(preset),evaluate=createRig(rig);
  const storageKey='see-through-rig-v2:'+task;
  function apply(candidate){
    validateDeformation(candidate);
    rig=structuredClone(candidate);evaluate=createRig(rig);
    $('head-limit').value=rig.nodes.find(n=>n.id==='head').maxDegrees;
    $('head-limit').nextElementSibling.value=$('head-limit').value+'°';
  }
  try{const saved=localStorage.getItem(storageKey);if(saved){apply(parseSettings(saved,task));$('settings-status').textContent='已載入此任務的瀏覽器設定。';}}
  catch(e){$('settings-status').textContent='保存設定無法載入，改用預設：'+e.message;}
  const renderer=createMeshRenderer(canvas,{maxUpload:quality.maxUpload});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('status').textContent='繪圖環境中斷，請重新整理頁面。';});
  const localPrefix='/layers/seethrough_local/'+encodeURIComponent(task)+'/';
  // The cloud comparison is optional and expensive: decoding it alongside the
  // local rig can exceed Chromium's renderer memory before the first frame.
  // Load it only if the user explicitly switches the comparison selector.
  const [baseLocal,eyeAssets,seamAssets]=await Promise.all([load(LOC,localPrefix),loadEyeAssets(localPrefix),loadSeamAssets(localPrefix)]);
  let local=eyeAssets?baseLocal.flatMap(layer=>{
    if(layer.name==='eyewhite')return eyeAssets.layers.filter(x=>x.name.startsWith('eyewhite_'));
    if(layer.name==='irides')return eyeAssets.layers.filter(x=>x.name.startsWith('irides_'));
    if(layer.name==='eyelash'){
      const splitLashes=eyeAssets.layers.filter(x=>x.name.startsWith('eyelash_'));
      const open=splitLashes.length?splitLashes:[layer];
      return eyeAssets.closedEyelids?[...open,...eyeAssets.layers.filter(x=>x.name.startsWith('eyelid_closed_'))]:open;
    }
    return [layer];
  }):baseLocal;
  if(seamAssets)local.push(...seamAssets.layers);
  const seamCandidate=new URLSearchParams(location.search).get('seam-candidate');
  if(seamCandidate){
    if(!/^[a-zA-Z0-9_-]+$/.test(seamCandidate))throw new Error('Invalid seam candidate name');
    const seamPrefix=localPrefix+'_rig_candidates/'+seamCandidate+'/';
    const response=await fetch(seamPrefix+'report.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Seam candidate report unavailable');
    const report=await response.json();
    if(report.schemaVersion!==2||report.source!=='registered_original'||report.status!=='candidate')throw new Error('Unsupported seam candidate');
    local=local.filter(layer=>!['seam_repair_head','seam_repair_torso'].includes(layer.name));
    local.push(...await load(['seam_repair_head','seam_repair_torso'],seamPrefix));
  }
  // Runtime eye order is explicit: sclera and iris sit below the open lash;
  // the approved closed-eye paint then occludes the entire opening, brows stay
  // above it, and front hair remains the final foreground layer.
  if(eyeAssets){
    const eyeOrder=['eyewhite','irides','eyelash','eyelid_closed','eyebrow'];
    const eyeLayers=eyeOrder.flatMap(base=>local.filter(layer=>layer.name.replace(/_(left|right)$/,'')===base));
    local=local.filter(layer=>!eyeOrder.includes(layer.name.replace(/_(left|right)$/,'')));
    const insertAt=local.findIndex(layer=>layer.name==='fronthair');
    local.splice(insertAt<0?local.length:insertAt,0,...eyeLayers);
  }
  const facialCandidateName=inspection.get('face-candidate');
  let faceCandidate=null,facialOptions=null;
  if(facialCandidateName){
    const sheetCandidate=['facial_sheet_v1','facial_sheet_v2'].includes(facialCandidateName);
    const happyCandidate=facialCandidateName==='facial_happy_v1';
    const angryCandidate=['facial_angry_v1','facial_angry_v2','facial_angry_v3'].includes(facialCandidateName);
    const comboCandidate=facialCandidateName==='facial_showcase_v1';
    if(!sheetCandidate&&!happyCandidate&&!angryCandidate&&!comboCandidate&&facialCandidateName!=='facial_v1')throw new Error('未知的口型表情候選版本');
    const response=await fetch(localPrefix+'_rig_candidates/'+facialCandidateName+'/report.json',{cache:'no-store'});
    if(!response.ok)throw new Error('口型表情候選報告載入失敗');
    const report=await response.json();
    const expectedSchema=comboCandidate?4:happyCandidate||angryCandidate?3:sheetCandidate?2:1;
    const expectedSource=comboCandidate?'hairless_combined_feature_transplant':angryCandidate?'hairless_angry_feature_transplant':happyCandidate?'hairless_happy_feature_transplant':sheetCandidate?'pixel_transplant_from_user_mouth_sheet':null;
    if(report.schemaVersion!==expectedSchema||report.status!=='candidate'||report.task!==task||expectedSource&&report.source!==expectedSource)throw new Error('口型表情候選報告格式無效');
    facialOptions=await import(comboCandidate?'./facial-showcase-candidate.mjs?v=1':angryCandidate?'./facial-angry-candidate.mjs?v=1':happyCandidate?'./facial-happy-candidate.mjs?v=1':sheetCandidate?'./facial-sheet-candidate.mjs?v=2':'./facial-candidate.mjs?v=8');
    // The approved head seam patch overlaps the mouth. Only in this opt-in
    // candidate, draw it behind the replacement mouth for visual review.
    const seamHeadIndex=local.findIndex(layer=>layer.name==='seam_repair_head');
    const mouthIndex=local.findIndex(layer=>layer.name==='mouth');
    if(seamHeadIndex>=0&&mouthIndex>=0){
      const [seamHead]=local.splice(seamHeadIndex,1);
      local.splice(local.findIndex(layer=>layer.name==='mouth'),0,seamHead);
    }
    faceCandidate=sheetCandidate||happyCandidate||angryCandidate||comboCandidate
      ?await facialOptions.createFacialCandidate(local,renderer,localPrefix+'_rig_candidates/'+facialCandidateName+'/')
      :facialOptions.createFacialCandidate(local,renderer);
    for(const [id,label] of facialOptions.MOUTH_OPTIONS)$('face-mouth').add(new Option(label,id));
    for(const [id,label] of facialOptions.EMOTION_OPTIONS)$('face-emotion').add(new Option(label,id));
    if(sheetCandidate){
      $('face-candidate-controls').querySelector('h2').textContent='原圖口型移植 · 候選預覽';
      $('face-candidate-controls').querySelector('small').textContent='六種口型取自 mouth_type.jfif；表情暫保留原始版本，尚未核准。';
    }
    if(happyCandidate){
      $('face-candidate-controls').querySelector('h2').textContent='開心／微笑 · 無髮原圖候選';
      $('face-candidate-controls').querySelector('small').textContent='只替換無髮圖的眉部；已核准的眼睛、眨眼和視線不變，口型仍可獨立切換。';
      $('face-emotion').addEventListener('change',()=>{
        $('face-mouth').value=$('face-emotion').value==='happy'?'smile':'neutral';
      });
    }
    if(angryCandidate){
      $('face-candidate-controls').querySelector('h2').textContent='生氣／憤怒 · 無髮原圖候選';
      $('face-candidate-controls').querySelector('small').textContent='移植無髮圖的怒眉與抿嘴；已核准的眼睛、眨眼和視線不變，口型仍可獨立切換。';
      $('face-emotion').addEventListener('change',()=>{
        $('face-mouth').value=$('face-emotion').value==='angry'?'angry':'neutral';
      });
      $('face-emotion').value='angry';
      $('face-mouth').value='angry';
    }
    if(comboCandidate){
      $('face-candidate-controls').querySelector('h2').textContent='原始／開心／生氣 · 整合候選';
      $('face-candidate-controls').querySelector('small').textContent='原圖移植眉毛和口型；眼睛、眨眼與視線保持獨立，尚待使用者動態驗收。';
      $('face-emotion').addEventListener('change',()=>{
        $('face-mouth').value={neutral:'neutral',happy:'smile',angry:'angry'}[$('face-emotion').value];
      });
      $('face-emotion').value='angry';
      $('face-mouth').value='angry';
    }
    $('face-candidate-controls').hidden=false;
    $('view').add(new Option('臉部放大','face'));
    if(inspection.get('view')==='face')$('view').value='face';
  }
  else {
    const response=await fetch(localPrefix+'_rig_assets/expression_assets.json',{cache:'no-store'});
    if(!response.ok)throw new Error('正式表情素材描述載入失敗');
    const manifest=await response.json();
    if(manifest.schemaVersion!==1||manifest.source!=='hairless_combined_feature_transplant'||manifest.visualReview?.status!=='passed'||!/^[a-zA-Z0-9_-]+$/.test(manifest.assetDirectory||''))throw new Error('正式表情素材描述格式無效');
    facialOptions=await import('./facial-showcase-candidate.mjs?v=2');
    const seamHeadIndex=local.findIndex(layer=>layer.name==='seam_repair_head');
    const mouthIndex=local.findIndex(layer=>layer.name==='mouth');
    if(seamHeadIndex>=0&&mouthIndex>=0){
      const [seamHead]=local.splice(seamHeadIndex,1);
      local.splice(local.findIndex(layer=>layer.name==='mouth'),0,seamHead);
    }
    faceCandidate=await facialOptions.createFacialCandidate(local,renderer,localPrefix+'_rig_assets/'+manifest.assetDirectory+'/');
    for(const [id,label] of facialOptions.MOUTH_OPTIONS)$('face-mouth').add(new Option(label,id));
    for(const [id,label] of facialOptions.EMOTION_OPTIONS)$('face-emotion').add(new Option(label,id));
    $('face-candidate-controls').querySelector('h2').textContent='表情與口型';
    $('face-candidate-controls').querySelector('small').textContent='原圖移植的開心、生氣與七種口型；眼睛、眨眼與視線保持獨立。';
    $('face-emotion').addEventListener('change',()=>{
      $('face-mouth').value={neutral:'neutral',happy:'smile',angry:'angry'}[$('face-emotion').value];
    });
    $('face-candidate-controls').hidden=false;
    $('view').add(new Option('臉部放大','face'));
    if(inspection.get('view')==='face')$('view').value='face';
  }
  for(const {name} of local)if(!evaluate()[name.replace(/_(left|right)$/,'')])throw new Error('圖層尚未配對：'+name);
  $('status').textContent=`已載入：雲端 ${REF.length} 層（需要時載入）／本機 ${local.length} 層\n${eyeAssets?.closedEyelids?'同步雙眼、眼白裁切與左右閉眼眼瞼已啟用':eyeAssets?'同步雙眼與眼白裁切已啟用':'未找到左右眼素材，使用合併眼部圖層'}\n第六階段 · 品質檢查中`;
  if(eyeAssets?.candidate)$('status').textContent+='\n候選預覽：'+eyeAssets.candidate+'（半閉眼重影待修正，尚未核准）';
  if(eyeAssets?.closedEyelids)$('status').textContent='已載入：新版眼瞼、同步雙眼與眼白裁切 · 已經使用者核准\n自動眨眼與其他動作可正常使用';
  if(seamCandidate)$('status').textContent+='\n肩頸接縫候選：'+seamCandidate+'（待人工驗收）';
  else if(seamAssets)$('status').textContent+='\n肩頸接縫修補：已經使用者核准並預設啟用';
  $('status').textContent+='\n'+(quality.isProduction?quality.label:'⚠ '+quality.label+'（不可作為交付畫面）');
  if(faceCandidate)$('status').textContent+='\n口型：'+(facialCandidateName?facialCandidateName+' 候選預覽（待人工驗收）':'開心／生氣與七種口型已核准');

  // ===== 圖層開關清單 =====
  const layerVisKey='see-through-layer-vis:'+task;
  let layerVis={};
  try{const saved=localStorage.getItem(layerVisKey);if(saved)layerVis=JSON.parse(saved);}catch{}
  for(const {name} of local){if(!(name in layerVis))layerVis[name]=true;}
  const persistVis=()=>{localStorage.setItem(layerVisKey,JSON.stringify(layerVis));};
  const setLayerVis=(name,vis)=>{layerVis[name]=vis;persistVis();};
  const baseLayers=REF;
  const rigLayersSuffix=['eyewhite_left','eyewhite_right','irides_left','irides_right','eyelash_left','eyelash_right','eyelid_closed_left','eyelid_closed_right','seam_repair_head','seam_repair_torso'];
  const baseListEl=document.getElementById('layer-list-base');
  const rigListEl=document.getElementById('layer-list-rig');
  function makeLayerItem(name){
    const div=document.createElement('div');
    div.className='layer-item';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=layerVis[name]!==false;
    cb.addEventListener('change',()=>{setLayerVis(name,cb.checked);});
    const span=document.createElement('span');span.className='layer-name';span.textContent=name;
    const badge=document.createElement('span');badge.className='layer-badge';
    badge.textContent=(baseLayers.includes(name.replace(/_(left|right)$/,''))?'基礎':'Rig');
    div.append(cb,span,badge);
    return div;
  }
  for(const {name} of [...local].sort((a,b)=>a.name.localeCompare(b.name))){
    const isBase=baseLayers.includes(name.replace(/_(left|right)$/,''));
    const target=isBase?baseListEl:rigListEl;
    if(target)target.appendChild(makeLayerItem(name));
  }

  $('head-limit').oninput=()=>{
    try{const candidate=structuredClone(rig);candidate.nodes.find(n=>n.id==='head').maxDegrees=Number($('head-limit').value);apply(candidate);$('settings-status').textContent='設定已調整，尚未保存。';}
    catch(e){$('settings-status').textContent=e.message;apply(rig);}
  };
  $('calibrate').onchange=()=>{if($('calibrate').checked){neutral();$('paused').checked=true;$('show-guides').checked=true;}canvas.style.cursor=$('calibrate').checked?'crosshair':'default';};
  canvas.addEventListener('click',e=>{
    if(!$('calibrate').checked||!layout)return;
    const {cx,cy,s,dpr,w}=layout;
    const px=e.clientX*dpr,py=e.clientY*dpr;
    if(px<w/2||px>w)return;
    const pivot=[(px-cx)/s,(cy-py)/s];
    if(pivot.some(v=>Math.abs(v)>1))return;
    try{
      const candidate=structuredClone(rig),id=$('anchor').value;
      candidate.nodes.find(n=>n.id===id).pivot=pivot;
      if(id==='head')candidate.deformation.neck=[pivot[1]-.18,pivot[1]+.08];
      if(id==='torso')candidate.deformation.waist=[pivot[1]-.18,pivot[1]+.18];
      apply(candidate);$('settings-status').textContent='錨點已調整，尚未保存。';
    }catch(e){$('settings-status').textContent='無法套用：'+e.message;}
  });
  $('save').onclick=()=>{try{localStorage.setItem(storageKey,serializeSettings(task,rig));$('settings-status').textContent='已保存此任務設定；同一瀏覽器重新開啟會還原。';}catch(e){$('settings-status').textContent='保存失敗：'+e.message;}};
  $('export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([serializeSettings(task,rig)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=task+'_rig_v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('import').onchange=async()=>{
    try{const file=$('import').files[0];if(!file)return;if(file.size>100000)throw new Error('設定檔過大');apply(parseSettings(await file.text(),task));$('settings-status').textContent='已匯入，請按保存設定以記住。';}
    catch(e){$('settings-status').textContent='匯入失敗：'+e.message;}finally{$('import').value='';}
  };
  $('reset-rig').onclick=()=>{try{localStorage.removeItem(storageKey);apply(preset);$('settings-status').textContent='已恢復角色預設並清除瀏覽器保存設定。';}catch(e){$('settings-status').textContent=e.message;}};
  let t=0,last=performance.now(),chestSpring={position:0,velocity:0},chestFollowSpring={position:0,velocity:0};
  function animate(now){
    const dt=Math.min(Math.max((now-last)/1000,0),.05);last=now;
    if(!$('paused').checked){
      t+=dt;mx+=(tx-mx)*(1-Math.exp(-7*dt));my+=(ty-my)*(1-Math.exp(-7*dt));
    }
    let pose=drivePose(controls,t,mx,{idle:$('idle').checked,follow:$('follow').checked});
    pose.torso=controls.torso+($('idle').checked?.2*Math.sin(t*.65-.25):0)+($('follow').checked?-.2*mx:0);
    pose=applyExpressivePose(pose,controls.energy,t);
    if(!$('paused').checked){
      // The chest only follows a real body-weight shift or the enabled
      // pointer-follow pose.  The slider changes the amount of follow-through
      // instead of creating an unrelated periodic bounce.
      const chestTarget=Math.max(-.85,Math.min(.85,controls.bust*(-pose.torso*1.45-pose.body*.70-($('follow').checked?mx*.75:0))));
      chestSpring=advanceSpring(chestSpring,chestTarget,dt,{frequency:7,damping:.72});
      // Both sides follow the pointer in the same direction; no inward squeeze.
      const followTarget=chestFollowTarget(mx,controls.bust,$('follow').checked);
      chestFollowSpring=advanceSpring(chestFollowSpring,followTarget,dt,{frequency:7,damping:.72});
    }
    const matrices=evaluate(pose,t);
    const gaze=sharedGazeTarget([controls['gaze-x'],controls['gaze-y']],[mx,my],$('gaze-follow').checked,.8);
    const expression=buildExpression({blink:controls.blink,gazeX:gaze[0],gazeY:gaze[1],yaw:controls.yaw,autoBlink:$('auto-blink').checked},t,rig.nodes.find(n=>n.id==='head').pivot,eyeAssets?.limits);
    expression.eyeCenter=eyeAssets?.eyeCenter||rig.expression?.eyeCenter||[0,.755];
    expression.eyeCenters=eyeAssets?.eyeCenters||null;
    expression.chest=chestSpring.position;
    expression.chestFollow=chestFollowSpring.position;
    expression.chestBand=rig.expression?.chestBand||[.2,.5];
    expression.hasClosedEyelids=Boolean(eyeAssets?.closedEyelids);
    // Keep the original open eyes until a rendered blink has passed review.
    // Alpha-overlap tests alone cannot certify the artwork or its alignment.
    if(!expression.hasClosedEyelids)expression.blink=0;
    const dpr=canvas.width/innerWidth,panel=(document.querySelector('#sidePanel')||document.querySelector('aside')).getBoundingClientRect();
    const w=canvas.width-(innerWidth>900?(panel.width+24)*dpr:0),h=canvas.height-(innerWidth<=900?(panel.height+24)*dpr:0);
    const faceView=$('view').value==='face';
    const zoom=faceView?4.8:$('view').value==='upper'?1.9:1,s=Math.min(w/2,h)*.96/2.12*zoom;
    const cy=h/2+(faceView?s*.692:$('view').value==='upper'?s*.4:0);
    layout={cx:w*.75,cy,s,dpr,w};
    document.querySelector('header').style.right=innerWidth>900?(panel.width+24)+'px':'12px';
    if(faceCandidate){
      if($('face-talk').checked&&!$('paused').checked){
        const mode=facialOptions.TALK_SEQUENCE[Math.floor(t/.24)%facialOptions.TALK_SEQUENCE.length];
        $('face-mouth').value=mode;
      }
      faceCandidate.update($('face-mouth').value,$('face-emotion').value);
    }
    renderer.clear();
    const leftLayers=$('compare').value==='cloud'&&cloud?cloud:local;
    renderer.draw(leftLayers,matrices,rig.deformation,w/4,cy,s,$('compare').value==='cloud'&&Boolean(cloud),expression,layerVis);
    renderer.draw(local,matrices,rig.deformation,w*.75,cy,s,true,expression,layerVis);
    g.clearRect(0,0,guides.width,guides.height);
    if($('show-guides').checked){
      g.font=`${12*dpr}px system-ui`;g.lineWidth=dpr;
      for(const [band,color] of [['waist','#68e8ff'],['neck','#ffcc68']]){
        g.strokeStyle=color;
        for(const y of rig.deformation[band]){g.beginPath();for(let i=0;i<=24;i++){const p=deformPoint([-.35+i*.7/24,y],matrices,rig.deformation);const x=layout.cx+p[0]*s,sy=cy-p[1]*s;if(i===0)g.moveTo(x,sy);else g.lineTo(x,sy);}g.stroke();}
      }
      for(const n of rig.nodes.filter(n=>['body','head','torso','frontHair','backHair'].includes(n.id))){
        const p=deformPoint(n.pivot,matrices,rig.deformation),x=layout.cx+p[0]*s,y=cy-p[1]*s;
        g.fillStyle=n.id===$('anchor').value?'#ffcc68':'#68e8ff';g.beginPath();g.arc(x,y,4*dpr,0,Math.PI*2);g.fill();g.fillText(n.id,x+6*dpr,y-6*dpr);
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}catch(e){$('status').textContent=e.message;console.error(e);}
