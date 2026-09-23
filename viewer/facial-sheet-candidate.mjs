const MOUTH_OPTIONS=[
  ['neutral','自然閉嘴 · 原圖 12'],['smile','笑／張嘴 · 原圖 9'],
  ['slight','微開 · 原圖 2'],['wide','大開口 · 原圖 4'],
  ['round','小圓口 · 原圖 5'],['teeth','齒唇音 · 原圖 7'],
];
export {MOUTH_OPTIONS};
export const EMOTION_OPTIONS=[['neutral','原始表情（尚未移植）']];
export const TALK_SEQUENCE=['neutral','slight','wide','slight','round','slight','teeth','smile'];

function loadImage(url){
  const image=new Image();
  image.src=url;
  return image.decode().then(()=>image);
}

export async function createFacialCandidate(layers,renderer,assetPrefix){
  const mouth=layers.find(layer=>layer.name==='mouth');
  const seam=layers.find(layer=>layer.name==='seam_repair_head');
  if(!mouth||!seam)throw new Error('口型移植需要 mouth 與 seam_repair_head 圖層');
  const [mouthImages,mouthlessSeam]=await Promise.all([
    Promise.all(MOUTH_OPTIONS.map(async([mode])=>[mode,await loadImage(assetPrefix+'mouth_'+mode+'.png?v=2')])),
    loadImage(assetPrefix+'seam_repair_head_mouthless.png'),
  ]);
  const images=new Map(mouthImages);
  // Only task-scoped candidate layer objects change. Approved PNGs remain untouched.
  mouth.image=images.get('neutral');
  seam.image=mouthlessSeam;
  let active='neutral';
  return {
    update(mode,emotion){
      if(!images.has(mode)||emotion!=='neutral')throw new Error('未知的移植口型');
      if(mode!==active){mouth.image=images.get(mode);active=mode;}
    },
  };
}