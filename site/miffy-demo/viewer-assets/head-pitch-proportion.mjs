const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};

export function validateHeadPitchProportion(profile){
  if(profile?.mode==='curved-terminal-push-review'){
    if(![profile.maxDegrees,profile.topY,profile.chinY,profile.holdY,
      profile.upPushPx,profile.downPushPx,profile.arcPower,
      profile.sideFalloff].every(Number.isFinite)||
      profile.maxDegrees<=0||profile.maxDegrees>6||
      profile.topY<0||!(profile.topY<profile.chinY&&profile.chinY<profile.holdY)||
      profile.upPushPx<=0||profile.upPushPx>12||
      profile.downPushPx<=0||profile.downPushPx>12||
      profile.arcPower<1||profile.arcPower>2||
      profile.sideFalloff<0||profile.sideFalloff>.4)
      throw Error('曲面端點推擠候選設定無效');
    return;
  }
  if(profile?.mode!=='nose-bridge-proportion-review'||
     ![profile.maxDegrees,profile.topY,profile.bridgeY,profile.chinY,profile.holdY,
       profile.centerX,profile.upUpperCompressionPx,profile.upChinRisePx,
       profile.upUpperWidthNarrowing,profile.downUpperDropPx].every(Number.isFinite)||
     profile.maxDegrees<=0||profile.maxDegrees>6||
     !(profile.topY<profile.bridgeY&&profile.bridgeY<profile.chinY&&
       profile.chinY<profile.holdY)||
     profile.upUpperCompressionPx<0||profile.upUpperCompressionPx>8||
     profile.upChinRisePx<0||profile.upChinRisePx>10||
     profile.upUpperWidthNarrowing<0||profile.upUpperWidthNarrowing>.08||
     profile.downUpperDropPx<0||profile.downUpperDropPx>9)
    throw Error('鼻樑分區俯仰比例候選設定無效');
}

// Art-directed frontal texture proportions, not an anatomical 3D reconstruction.
// The bridge stays continuous; the jaw fades back to the neck's fixed edge.
export function pitchProportionOffset(x,y,pitchDegrees,profile,geometry=null){
  const amount=clamp(Math.abs(pitchDegrees)/profile.maxDegrees,0,1);
  if(amount<1e-8)return [0,0];
  if(profile.mode==='curved-terminal-push-review'){
    if(!geometry)throw Error('曲面端點推擠需要既有頭部曲面幾何');
    const [cx,cy]=geometry.center,[rx,ry]=geometry.radii;
    const arc=y0=>Math.asin(clamp((y0-cy)/ry,-.98,.98));
    const topArc=arc(profile.topY),chinArc=arc(profile.chinY);
    const t=clamp((arc(clamp(y,profile.topY,profile.chinY))-topArc)/
      (chinArc-topArc),0,1);
    const side=1-profile.sideFalloff*
      Math.pow(clamp(Math.abs(x-cx)/rx,0,1),2);
    if(pitchDegrees>0){
      const fade=1-smooth((y-profile.chinY)/(profile.holdY-profile.chinY));
      return [0,-profile.upPushPx*amount*Math.pow(t,profile.arcPower)*side*fade];
    }
    const crownFade=smooth(y/profile.topY);
    return [0,profile.downPushPx*amount*
      Math.pow(1-t,profile.arcPower)*side*crownFade];
  }
  const {topY,bridgeY,chinY,holdY,centerX}=profile;
  if(pitchDegrees>0){
    const upper=1-smooth((y-topY)/(bridgeY-topY));
    const lower=smooth((y-bridgeY)/(chinY-bridgeY)) *
      (1-smooth((y-chinY)/(holdY-chinY)));
    return [-(x-centerX)*profile.upUpperWidthNarrowing*upper*amount,
      (profile.upUpperCompressionPx*upper-profile.upChinRisePx*lower)*amount];
  }
  const upper=smooth((y-topY)/(bridgeY-topY));
  const lower=1-smooth((y-bridgeY)/(chinY-bridgeY));
  const span=y<=bridgeY?upper:y<=chinY?lower:0;
  return [0,profile.downUpperDropPx*span*amount];
}
