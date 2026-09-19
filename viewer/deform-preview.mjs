import {createRig} from './rig.mjs';
import {drivePose} from './motion.mjs';
import {createMeshRenderer} from './mesh-renderer.mjs';
import {validateDeformation,serializeSettings,parseSettings,deformPoint} from './deformation.mjs';
const $=id=>document.getElementById(id);
const task=new URLSearchParams(location.search).get('local');
$('legacy').href='/preview-rig?local='+encodeURIComponent(task||'');
const REF=['backhair','handwear','legwear','topwear','neck','bottomwear','earwear','ears','face','mouth','eyelash','nose','eyebrow','irides','fronthair'];
const LOC=['handwear','legwear','topwear','backhair','footwear','earwear','neck','bottomwear','eyebrow','ears','face','nose','mouth','eyelash','eyewhite','irides','fronthair'];
const controls={};
for(const name of ['body','torso','head','breath','hair']){
  const el=$(name),update=()=>{controls[name]=Number(el.value)/100;el.nextElementSibling.value=el.value;};
  el.addEventListener('input',update);update();
}
function values(v){for(const [key,value] of Object.entries(v)){$(key).value=value;$(key).dispatchEvent(new Event('input'));}}
function neutral(){values({body:0,torso:0,head:0,breath:0,hair:0});$('idle').checked=false;$('follow').checked=false;}
$('neutral').onclick=neutral;
$('defaults').onclick=()=>{values({body:0,torso:0,head:0,breath:30,hair:10});$('idle').checked=true;$('follow').checked=true;$('paused').checked=false;$('calibrate').checked=false;};
$('compare').onchange=()=>{$('left-title').textContent=$('compare').value==='cloud'?'雲端素材 · 柔性':'本機素材 · 剛性';};
const canvas=$('stage'),guides=$('guides'),g=guides.getContext('2d');
let mx=0,tx=0,layout=null;
canvas.addEventListener('pointermove',e=>{tx=e.clientX/innerWidth*2-1;});
canvas.addEventListener('pointerleave',()=>{tx=0;});
function resize(){const d=Math.min(devicePixelRatio,2);canvas.width=guides.width=Math.round(innerWidth*d);canvas.height=guides.height=Math.round(innerHeight*d);}
addEventListener('resize',resize);resize();
async function load(names,prefix){return Promise.all(names.map(async name=>{const image=new Image();image.src=prefix+name+'.png';try{await image.decode();}catch{throw new Error('圖層載入失敗：'+name);}return {name,image};}));}
try{
  if(!task)throw new Error('請提供 local 任務名稱');
  const response=await fetch('/viewer-assets/eris-deform.json');
  if(!response.ok)throw new Error('角色設定載入失敗');
  const preset=validateDeformation(await response.json());
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
  const renderer=createMeshRenderer(canvas);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('status').textContent='繪圖環境中斷，請重新整理頁面。';});
  const [cloud,local]=await Promise.all([load(REF,'/layers/seethrough/'),load(LOC,'/layers/seethrough_local/'+encodeURIComponent(task)+'/')]);
  for(const {name} of [...cloud,...local])if(!evaluate()[name])throw new Error('圖層尚未配對：'+name);
  $('status').textContent=`已載入：雲端 ${cloud.length} 層／本機 ${local.length} 層\n第二階段 · 待人工驗收`;
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
  let t=0,last=performance.now();
  function animate(now){
    const dt=Math.min(Math.max((now-last)/1000,0),.05);last=now;
    if(!$('paused').checked){t+=dt;mx+=(tx-mx)*(1-Math.exp(-5*dt));}
    const pose=drivePose(controls,t,mx,{idle:$('idle').checked,follow:$('follow').checked});
    pose.torso=controls.torso+($('idle').checked?.2*Math.sin(t*.65-.25):0)+($('follow').checked?-.2*mx:0);
    const matrices=evaluate(pose,t);
    const dpr=canvas.width/innerWidth,panel=document.querySelector('aside').getBoundingClientRect();
    const w=canvas.width-(innerWidth>900?(panel.width+24)*dpr:0),h=canvas.height-(innerWidth<=900?(panel.height+24)*dpr:0);
    const zoom=$('view').value==='upper'?1.9:1,s=Math.min(w/2,h)*.96/2.12*zoom;
    const cy=h/2+($('view').value==='upper'?s*.4:0);
    layout={cx:w*.75,cy,s,dpr,w};
    document.querySelector('header').style.right=innerWidth>900?(panel.width+24)+'px':'12px';
    renderer.clear();
    renderer.draw($('compare').value==='cloud'?cloud:local,matrices,rig.deformation,w/4,cy,s,$('compare').value==='cloud');
    renderer.draw(local,matrices,rig.deformation,w*.75,cy,s,true);
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
