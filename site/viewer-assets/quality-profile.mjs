export function validateQualityBaseline(baseline){
  if(baseline?.schemaVersion!==1)throw new Error('正式規格基準版本無效');
  const inference=baseline.production?.inference,viewer=baseline.production?.viewer;
  if(!inference||!viewer)throw new Error('正式規格基準缺少 production 設定');
  for(const [name,value] of Object.entries({...inference,textureUploadMax:viewer.textureUploadMax,maxDevicePixelRatio:viewer.maxDevicePixelRatio})){
    if(!Number.isFinite(value)||value<=0)throw new Error(`正式規格 ${name} 無效`);
  }
  if(viewer.textureUploadMode!=='native'||viewer.textureUploadMax!==inference.layerResolution)throw new Error('正式預覽必須使用推論原生解析度');
  if(viewer.approvedSeamsRequired!==true)throw new Error('正式預覽不可停用已核准接縫修補');
  if(!viewer.controls||!viewer.toggles)throw new Error('正式預覽缺少控制項基準');
  for(const [name,value] of Object.entries(viewer.controls))if(!Number.isFinite(value))throw new Error(`正式控制項 ${name} 無效`);
  for(const [name,value] of Object.entries(viewer.toggles))if(typeof value!=='boolean')throw new Error(`正式開關 ${name} 無效`);
  for(const [name,profile] of Object.entries(baseline.nonProductionProfiles||{})){
    if(profile.nonProduction!==true||!Number.isFinite(profile.textureUploadMax)||profile.textureUploadMax<=0||profile.textureUploadMax>=viewer.textureUploadMax||!profile.visibleLabel)throw new Error(`非正式 profile ${name} 格式無效`);
  }
  return baseline;
}

export function assertViewerDefaults(getElement,viewer){
  for(const [name,value] of Object.entries(viewer.controls))if(Number(getElement(name)?.value)!==value)throw new Error(`畫面初始值偏離正式基準：${name}`);
  for(const [name,value] of Object.entries(viewer.toggles))if(getElement(name)?.checked!==value)throw new Error(`畫面初始開關偏離正式基準：${name}`);
}

export function resolveQualityProfile(search,baseline){
  validateQualityBaseline(baseline);
  const params=search instanceof URLSearchParams?search:new URLSearchParams(search);
  if(params.has('texture-max'))throw new Error('texture-max 任意降規入口已停用；請使用明確的非正式 quality-profile');
  const name=params.get('quality-profile')||'production';
  if(name==='production')return {name,isProduction:true,maxUpload:baseline.production.viewer.textureUploadMax,label:`正式畫質 · 原生 ${baseline.production.viewer.textureUploadMax}px`};
  const profile=baseline.nonProductionProfiles?.[name];
  if(!profile||profile.nonProduction!==true)throw new Error(`未知或未核准的 quality-profile：${name}`);
  return {name,isProduction:false,maxUpload:profile.textureUploadMax,label:profile.visibleLabel};
}
