// Reuse source-art switching semantics: feature-free head + one source mouth.
export async function loadMouthTransplant(base, config, getImage, sha256) {
  if(!/^_review\/[A-Za-z0-9_-]+\/manifest\.json$/.test(config.manifest)||
     !/^[0-9A-F]{64}$/.test(config.manifestSha256))throw Error('口形清單路徑無效');
  const response=await fetch(base+config.manifest,{cache:'no-store'});
  const bytes=await response.arrayBuffer();
  if(!response.ok||await sha256(bytes)!==config.manifestSha256)throw Error('口形清單指紋不符');
  const manifest=JSON.parse(new TextDecoder().decode(bytes));
  const modes=['closed','slight','a','e','o','u'];
  if(manifest.nonProduction!==true||manifest.reviewStatus!=='pending'||
     manifest.sourceKind!=='pixel_transplant_from_user_mouth_sheet'||
     JSON.stringify(manifest.canvas)!=='[1280,1280]'||
     !Array.isArray(manifest.talkSequence)||!manifest.talkSequence.length||
     !manifest.talkSequence.every(mode=>modes.includes(mode))||
     !(manifest.talkStepSeconds>=.1&&manifest.talkStepSeconds<=1))throw Error('口形清單規格無效');
  const head=await fetch(base+manifest.targetHead);
  if(!head.ok||await sha256(await head.arrayBuffer())!==manifest.targetHeadSha256)
    throw Error('口形所依據的頭部已變更');
  const dir=config.manifest.slice(0,config.manifest.lastIndexOf('/'));
  async function asset(spec){
    if(!spec||!/^[A-Za-z0-9_-]+\.png$/.test(spec.asset)||
       !/^[0-9A-F]{64}$/.test(spec.sha256))throw Error('口形素材路徑無效');
    const url=base+dir+'/'+spec.asset,response=await fetch(url);
    if(!response.ok||await sha256(await response.arrayBuffer())!==spec.sha256)
      throw Error('口形素材指紋不符：'+spec.asset);
    const image=await getImage(url);
    if(image.naturalWidth!==1280||image.naturalHeight!==1280)throw Error('口形素材尺寸不符');
    return image;
  }
  const backing=await asset(manifest.backing);
  const images=Object.fromEntries(await Promise.all(modes.map(async mode=>[mode,await asset(manifest.mouths[mode])])));
  return {backing,images,manifest,
    mode(requested,auto,time){
      if(auto)return manifest.talkSequence[Math.floor(time/manifest.talkStepSeconds)%manifest.talkSequence.length];
      if(requested!=='original'&&!modes.includes(requested))throw Error('未知口形');
      return requested;
    }};
}
