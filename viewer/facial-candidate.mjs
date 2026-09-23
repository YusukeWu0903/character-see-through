// A task-scoped vector study based on the three facial reference sheets.
// The neutral artwork remains the original mouth and eyebrow PNGs.
const SIZE=1280;
const CENTER_X=640;
const MOUTH_Y=197;

export const MOUTH_OPTIONS=[
  ['neutral','原本閉嘴'],['smile','微笑'],['slight','小開口'],
  ['wide','大開口'],['round','圓口'],['teeth','露齒'],
];
export const EMOTION_OPTIONS=[
  ['neutral','中性'],['joy','開心'],['sad','難過'],
  ['angry','生氣'],['surprise','驚訝'],['shy','害羞'],
];
export const TALK_SEQUENCE=['neutral','slight','wide','slight','round','slight','teeth','smile'];

function canvas(draw){
  const image=document.createElement('canvas');
  image.width=image.height=SIZE;
  draw(image.getContext('2d'));
  return image;
}

function mouthArt(mode){
  if(mode==='neutral')return null;
  return canvas(ctx=>{
    ctx.translate(CENTER_X,MOUTH_Y);
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='#693f3c';ctx.lineWidth=1.25;
    if(mode==='smile'){
      ctx.beginPath();ctx.moveTo(-8,-1);ctx.quadraticCurveTo(0,4.5,8,-1);ctx.stroke();
      ctx.fillStyle='#a76a66';ctx.beginPath();ctx.arc(-8,-1,1,0,Math.PI*2);ctx.arc(8,-1,1,0,Math.PI*2);ctx.fill();
      return;
    }
    const shapes={slight:[7,2.5],wide:[8,5.5],round:[4.5,5.5],teeth:[8,3]};
    const [rx,ry]=shapes[mode]||shapes.slight;
    ctx.fillStyle='#5e3038';ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(mode==='teeth'||mode==='slight'){
      ctx.fillStyle='#fff0e8';ctx.beginPath();ctx.ellipse(0,-ry*.43,rx*.78,Math.max(1.3,ry*.42),0,0,Math.PI);ctx.fill();
    }
    if(mode==='wide'||mode==='round'){
      ctx.fillStyle='#c76f80';ctx.beginPath();ctx.ellipse(0,ry*.55,rx*.62,Math.max(1.4,ry*.27),0,Math.PI,Math.PI*2);ctx.fill();
    }
    if(mode==='slight'||mode==='teeth'){ctx.strokeStyle='#bc8380';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-rx*.48,-ry-.5);ctx.quadraticCurveTo(0,-ry-1,rx*.48,-ry-.5);ctx.stroke();}
  });
}

function brow(ctx,x,y,innerOffset,arch){
  ctx.beginPath();ctx.moveTo(x-17,y+arch);ctx.quadraticCurveTo(x,y-2,x+17,y+innerOffset);
  ctx.stroke();
}
function blush(ctx,x,y,strength){
  const gradient=ctx.createRadialGradient(x,y,1,x,y,18);
  gradient.addColorStop(0,`rgba(223,84,112,${strength})`);
  gradient.addColorStop(1,'rgba(223,84,112,0)');
  ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();
}
function tear(ctx,x,y){
  ctx.fillStyle='rgba(112,177,209,.42)';ctx.strokeStyle='rgba(58,120,151,.24)';ctx.lineWidth=.5;
  ctx.beginPath();ctx.moveTo(x,y-2);ctx.quadraticCurveTo(x+3,y+3,x+1,y+7);ctx.quadraticCurveTo(x-2,y+7,x-2,y+3);ctx.closePath();ctx.fill();ctx.stroke();
}
function expressionArt(mode){
  if(mode==='neutral')return null;
  return canvas(ctx=>{
    ctx.lineCap='round';ctx.strokeStyle='#86605a';ctx.lineWidth=3.4;
    const browPos={joy:[129,0,0],sad:[130,-7,4],angry:[126,9,-4],surprise:[118,0,-3],shy:[130,-2,2]};
    const [y,inner,arch]=browPos[mode]||browPos.joy;
    brow(ctx,609,y,inner,arch);
    ctx.save();ctx.translate(1280,0);ctx.scale(-1,1);brow(ctx,609,y,inner,arch);ctx.restore();
    if(mode==='joy'||mode==='shy'){
      blush(ctx,605,181,mode==='shy'?.28:.12);
      blush(ctx,674,181,mode==='shy'?.28:.12);
    }
    if(mode==='sad'){
      tear(ctx,612,174);tear(ctx,666,174);
    }
  });
}

function decodedImage(art){
  const image=new Image();
  image.src=art.toDataURL('image/png');
  return image.decode().then(()=>image);
}

export function createFacialCandidate(layers,renderer){
  const mouth=layers.find(layer=>layer.name==='mouth');
  const brows=layers.find(layer=>layer.name==='eyebrow');
  if(!mouth||!brows)throw new Error('口型候選需要原本的 mouth 與 eyebrow 圖層');
  const originals={mouth:mouth.image,brows:brows.image};
  window.__facialCandidateDebug={mouth,brows};
  const mouthCache=new Map(),emotionCache=new Map();
  let requestedMouth='neutral',requestedEmotion='neutral';
  const swap=(layer,next,original)=>{
    if(layer.image!==original)renderer.releaseTexture(layer.image);
    layer.image=next;
  };
  return {
    update(mouthMode,emotionMode){
      if(!MOUTH_OPTIONS.some(([id])=>id===mouthMode)||!EMOTION_OPTIONS.some(([id])=>id===emotionMode))throw new Error('未知的口型或表情');
      if(mouthMode!==requestedMouth){
        requestedMouth=mouthMode;
        if(mouthMode==='neutral')swap(mouth,originals.mouth,originals.mouth);
        else {
          if(!mouthCache.has(mouthMode))mouthCache.set(mouthMode,decodedImage(mouthArt(mouthMode)));
          mouthCache.get(mouthMode).then(image=>{if(requestedMouth===mouthMode)swap(mouth,image,originals.mouth);});
        }
      }
      if(emotionMode!==requestedEmotion){
        requestedEmotion=emotionMode;
        if(emotionMode==='neutral')swap(brows,originals.brows,originals.brows);
        else {
          if(!emotionCache.has(emotionMode))emotionCache.set(emotionMode,decodedImage(expressionArt(emotionMode)));
          emotionCache.get(emotionMode).then(image=>{if(requestedEmotion===emotionMode)swap(brows,image,originals.brows);});
        }
      }
    },
  };
}
