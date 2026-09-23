export const MOUTH_OPTIONS=[
  ['neutral','自然閉嘴 · 原圖 12'],['angry','抿嘴 · 無髮憤怒原圖'],
  ['smile','笑／張嘴 · 原圖 9'],['slight','微開 · 原圖 2'],
  ['wide','大開口 · 原圖 4'],['round','小圓口 · 原圖 5'],
  ['teeth','齒唇音 · 原圖 7'],
];
export const EMOTION_OPTIONS=[['neutral','原始表情'],['angry','生氣／憤怒 · 無髮原圖']];
export const TALK_SEQUENCE=['neutral','slight','wide','slight','round','slight','teeth','smile'];
function loadImage(url){
  const image=new Image();
  image.src=url;
  return image.decode().then(()=>image);
}
export async function createFacialCandidate(layers,renderer,assetPrefix){
  const mouth=layers.find(layer=>layer.name==='mouth');
  const brows=layers.find(layer=>layer.name==='eyebrow');
  const seam=layers.find(layer=>layer.name==='seam_repair_head');
  if(!mouth||!brows||!seam)throw new Error('生氣表情候選需要 mouth、eyebrow 與 seam_repair_head 圖層');
  const originalBrows=brows.image;
  const [mouthImages,mouthlessSeam,angryBrows]=await Promise.all([
    Promise.all(MOUTH_OPTIONS.map(async([mode])=>[mode,await loadImage(assetPrefix+'mouth_'+mode+'.png')])),
    loadImage(assetPrefix+'seam_repair_head_mouthless.png'),
    loadImage(assetPrefix+'eyebrow_angry.png'),
  ]);
  const images=new Map(mouthImages);
  mouth.image=images.get('neutral');
  seam.image=mouthlessSeam;
  let activeMouth='neutral',activeEmotion='neutral';
  return {
    update(mode,emotion){
      if(!images.has(mode)||!EMOTION_OPTIONS.some(([name])=>name===emotion))throw new Error('未知的口型或生氣表情');
      if(mode!==activeMouth){mouth.image=images.get(mode);activeMouth=mode;}
      if(emotion!==activeEmotion){
        brows.image=emotion==='angry'?angryBrows:originalBrows;
        activeEmotion=emotion;
      }
    },
  };
}