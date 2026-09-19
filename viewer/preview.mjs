import {createRig} from './rig.mjs';
import {drivePose} from './motion.mjs';
const $ = id => document.getElementById(id);
const task = new URLSearchParams(location.search).get('local');
$('legacy').href = '/preview' + (task ? '?local='+encodeURIComponent(task) : '');
const REF = ['backhair','handwear','legwear','topwear','neck','bottomwear','earwear','ears','face','mouth','eyelash','nose','eyebrow','irides','fronthair'];
const LOC = ['handwear','legwear','topwear','backhair','footwear','earwear','neck','bottomwear','eyebrow','ears','face','nose','mouth','eyelash','eyewhite','irides','fronthair'];
// Preserve the milestone's local legacy motion coefficients for A/B comparison.
const OLD = [[.7,.8,.1],[.55,.7,0],[.55,.7,0],[.4,.6,.6],[.55,.6,0],[.8,.8,.3],[.78,.8,0],[.7,.8,0],[1.05,.9,.1],[.85,.8,.2],[.9,1,0],[1.08,1,0],[1.1,.9,0],[1.06,1,.1],[1.12,1,.05],[1.15,1,.05],[1.18,1,1]];
const controls = {};
for (const name of ['body','head','breath','hair']) {
  const input = $(name);
  const update = () => { controls[name] = Number(input.value)/100; input.nextElementSibling.value = input.value; };
  input.addEventListener('input', update); update();
}
function setControls(values) {
  for (const [key,value] of Object.entries(values)) { $(key).value = value; $(key).dispatchEvent(new Event('input')); }
}
$('neutral').onclick = () => {
  setControls({body:0,head:0,breath:0,hair:0});
  $('idle').checked=false; $('follow').checked=false;
};
$('defaults').onclick = () => {
  setControls({body:0,head:0,breath:30,hair:10});
  $('idle').checked=true; $('follow').checked=true; $('paused').checked=false;
};
$('compare').onchange = () => {$('left-title').textContent = $('compare').value === 'cloud' ? '雲端素材 · 協調動作' : '本機素材 · 舊動作';};
async function load(names, prefix) {
  return Promise.all(names.map(async name => {
    const image = new Image();
    image.src = prefix + name + '.png';
    try { await image.decode(); } catch { throw new Error('圖層載入失敗：'+image.src); }
    return {name,image};
  }));
}
const canvas = $('stage'), ctx = canvas.getContext('2d');
let mx=0,my=0,tx=0,ty=0;
canvas.addEventListener('pointermove', e=>{tx=e.clientX/innerWidth*2-1;ty=1-e.clientY/innerHeight*2;});
canvas.addEventListener('pointerleave',()=>{tx=0;ty=0;});
function resize(){const d=Math.min(devicePixelRatio,2);canvas.width=Math.round(innerWidth*d);canvas.height=Math.round(innerHeight*d);}
addEventListener('resize',resize);resize();
try {
  if (!task) throw new Error('請在網址提供 local 任務名稱');
  const response = await fetch('/viewer-assets/eris-rig.json');
  if (!response.ok) throw new Error('角色設定載入失敗');
  const evaluate = createRig(await response.json());
  const [cloud,local] = await Promise.all([load(REF,'/layers/seethrough/'),load(LOC,'/layers/seethrough_local/'+encodeURIComponent(task)+'/')]);
  for (const {name} of [...cloud,...local]) if (!evaluate()[name]) throw new Error('尚未配對圖層：'+name);
  $('status').textContent = `已載入：雲端 ${cloud.length} 層／本機 ${local.length} 層\n${task}\n實驗版：待人工驗收`;
  let t=0,last=performance.now();
  function draw(layers,matrices,cx,cy,scale){
    for(const {name,image} of layers){
      const [a,b,c,d,x,y]=matrices[name];
      ctx.setTransform(scale*a,-scale*b,-scale*c,scale*d,cx+scale*x,cy-scale*y);
      ctx.drawImage(image,-1,-1,2,2);
    }
  }
  function animate(now){
    const dt=Math.min(Math.max((now-last)/1000,0),.05);last=now;
    if(!$('paused').checked){t+=dt;const k=1-Math.exp(-5*dt);mx+=(tx-mx)*k;my+=(ty-my)*k;}
    const pose=drivePose(controls,t,mx,{idle:$('idle').checked,follow:$('follow').checked});
    const matrices=evaluate(pose,t), old={};
    LOC.forEach((name,i)=>{const [par,br,sway]=OLD[i],ph=i*.25;old[name]=[1,0,0,1,mx*.03*par+sway*Math.sin(t*.8+ph*2)*.06*.035,my*.03*.5*par+(.6+.4*br*Math.sin(t*1.4+ph))*.18*.02];});
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    const dpr=canvas.width/innerWidth, panel=document.querySelector('aside').getBoundingClientRect();
    const w=canvas.width-(innerWidth>900?(panel.width+24)*dpr:0);
    const h=canvas.height-(innerWidth<=900?(panel.height+24)*dpr:0);
    const s=Math.min(w/2,h)*.96/2.12;
    const labels=document.querySelector('header');
    labels.style.right=innerWidth>900?(panel.width+24)+'px':'12px';
    draw($('compare').value==='cloud'?cloud:local,$('compare').value==='cloud'?matrices:old,w/4,h/2,s);
    draw(local,matrices,w*3/4,h/2,s);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
} catch(error){$('status').textContent=error.message; console.error(error);}
