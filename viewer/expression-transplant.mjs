// Named source-part combinations, matching the established Eris expression route.
export async function loadExpressionTransplant(base,config,getImage,sha256,loadEyeRig){
  if(!/^_review\/[A-Za-z0-9_-]+\/manifest\.json$/.test(config.manifest))throw Error('表情清單路徑無效');
  const response=await fetch(base+config.manifest),bytes=await response.arrayBuffer();
  if(!response.ok||await sha256(bytes)!==config.manifestSha256)throw Error('表情清單指紋不符');
  const manifest=JSON.parse(new TextDecoder().decode(bytes));
  if(!['anxious','displeased'].includes(manifest.mode)||manifest.reviewStatus!=='pending'||manifest.nonProduction!==true||
     JSON.stringify(manifest.canvas)!=='[1280,1280]')throw Error('表情清單規格無效');
  const dir=config.manifest.slice(0,config.manifest.lastIndexOf('/'));
  const asset=async spec=>{
    if(!/^[A-Za-z0-9_-]+\.png$/.test(spec?.asset||''))throw Error('表情素材路徑無效');
    const url=base+dir+'/'+spec.asset,data=await fetch(url);
    if(!data.ok||await sha256(await data.arrayBuffer())!==spec.sha256)throw Error('表情素材指紋不符：'+spec.asset);
    const image=await getImage(url);if(image.naturalWidth!==1280||image.naturalHeight!==1280)throw Error('表情素材尺寸不符');return image;
  };
  return {manifest,backing:await asset(manifest.backing),eyes:await loadEyeRig(manifest.eyeRig),
    parts:Object.fromEntries(await Promise.all(['brow_left','brow_right','mouth','blush_left','blush_right','sweat'].map(async name=>[name,await asset(manifest.parts[name])])))};
}
