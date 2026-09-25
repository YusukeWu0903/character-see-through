// Reversible, differential lighting review for a source-painted frontal head.
// This is not a recovered normal map or a physically complete face material.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const x=clamp(value,0,1);return x*x*(3-2*x)};
const normalize=([x,y,z])=>{
  const length=Math.hypot(x,y,z);
  return [x/length,y/length,z/length];
};

export function validateHeadLighting(lighting,surface){
  if(!['differential-diffuse-review','balanced-frontal-review',
        'upper-balanced-review'].includes(lighting?.mode) ||
     !surface ||
     !Array.isArray(lighting.lightDirection) ||
     lighting.lightDirection.length!==3 ||
     !lighting.lightDirection.every(Number.isFinite) ||
     Math.hypot(...lighting.lightDirection)<.5 ||
     !Number.isFinite(lighting.intensity) ||
     lighting.intensity<=0 || lighting.intensity>2 ||
     !Number.isFinite(lighting.maxFraction) ||
     lighting.maxFraction<=0 || lighting.maxFraction>.2 ||
     !Number.isInteger(lighting.defaultStrength) ||
     lighting.defaultStrength<0 || lighting.defaultStrength>100 ||
     (lighting.mode==='upper-balanced-review' &&
       (!Number.isFinite(lighting.upperLight?.fullThroughY) ||
        !Number.isFinite(lighting.upperLight?.zeroFromY) ||
        lighting.upperLight.fullThroughY>=lighting.upperLight.zeroFromY ||
        !Number.isFinite(lighting.upperLight?.liftGain) ||
        lighting.upperLight.liftGain<1 || lighting.upperLight.liftGain>2)))
    throw Error('臉部光影候選設定無效');
}

export function headSurfaceNormal(x,y,surface){
  const [cx,cy]=surface.geometry.center;
  const [rx,ry,rz]=surface.geometry.radii;
  const dx=x-cx,dy=y-cy;
  const t=Math.max(0,1-dx*dx/(rx*rx)-dy*dy/(ry*ry));
  if(t<=0)return [0,0,1];
  // Same regularized dome (power 1.2) as head-surface-warp.mjs.
  const slope=rz*1.2*Math.pow(t,.2);
  const dzdx=-slope*2*dx/(rx*rx);
  const dzdy=-slope*2*dy/(ry*ry);
  return normalize([-dzdx,-dzdy,1]);
}

export function headLightingFactor(x,y,degrees,surface,lighting,rgb,strength=1){
  if(Math.abs(degrees)<1e-8||strength<=0)return 1;
  const [cx,cy]=surface.geometry.center;
  const [rx,ry]=surface.geometry.radii;
  const dx=(x-cx)/rx,dy=(y-cy)/ry;
  const t=Math.max(0,1-dx*dx-dy*dy);
  if(t<=0)return 1;
  const [r,g,b]=rgb;
  // Keep pale skin, soft blush and ear skin responsive while avoiding most
  // baked line art, white eyes, brows and lip pigment.
  const skin=smooth((g-150)/35)*smooth((r-g-4)/18)*smooth((b-140)/30);
  const mask=skin*smooth(t/.18)*
    (1-smooth((y-surface.neckHoldY)/(surface.bounds[3]-surface.neckHoldY)));
  if(mask<=0)return 1;
  const [nx,ny,nz]=headSurfaceNormal(x,y,surface);
  const radians=clamp(degrees,-surface.maxDegrees,surface.maxDegrees)*Math.PI/180;
  const cosine=Math.cos(radians),sine=Math.sin(radians);
  const [lx,ly,lz]=normalize(lighting.lightDirection);
  const before=Math.max(0,nx*lx+ny*ly+nz*lz);
  const after=Math.max(0,(nx*cosine+nz*sine)*lx+ny*ly+
    (nz*cosine-nx*sine)*lz);
  const delta=clamp((after-before)*lighting.intensity,
    -lighting.maxFraction,lighting.maxFraction);
  return 1+delta*clamp(strength,0,1)*mask;
}

// Artist-directed frontal-light balance: unlike v27's side-biased fixed light,
// remove the common whole-face bright/dark component. The yaw sign then
// exchanges the near/far cheek shading while retaining the painted neutral.
export function balancedHeadLightingColor(x,y,degrees,surface,lighting,rgb,strength=1){
  if(Math.abs(degrees)<1e-8||strength<=0)return rgb;
  const [cx,cy]=surface.geometry.center;
  const [rx,ry]=surface.geometry.radii;
  const dx=(x-cx)/rx,dy=(y-cy)/ry;
  const t=Math.max(0,1-dx*dx-dy*dy);
  if(t<=0)return rgb;
  const [r,g,b]=rgb;
  const skin=smooth((g-150)/35)*smooth((r-g-4)/18)*smooth((b-140)/30);
  const mask=skin*smooth(t/.18)*
    (1-smooth((y-surface.neckHoldY)/(surface.bounds[3]-surface.neckHoldY)));
  if(mask<=0)return rgb;
  const [nx]=headSurfaceNormal(x,y,surface);
  const radians=clamp(degrees,-surface.maxDegrees,surface.maxDegrees)*Math.PI/180;
  // Front light after yaw: -nx*sin(yaw) is the left/right difference;
  // the common nz*(cos(yaw)-1) dimming is deliberately removed.
  const delta=clamp(-nx*Math.sin(radians)*lighting.intensity,
    -lighting.maxFraction,lighting.maxFraction)*clamp(strength,0,1)*mask;
  if(delta<0)return rgb.map(channel=>channel*(1+delta));
  // Approach white rather than multiplying pale pixels into clipped white.
  // v29 only: preserve v28's dark side while tapering positive light out
  // just below the registered nose tip, with no lower-chin brightening.
  const upper=lighting.mode==='upper-balanced-review'
    ? (1-smooth((y-lighting.upperLight.fullThroughY)/
        (lighting.upperLight.zeroFromY-lighting.upperLight.fullThroughY)))
    : 1;
  const gain=lighting.mode==='upper-balanced-review'
    ? lighting.upperLight.liftGain:1;
  const lift=delta/lighting.maxFraction*.45*upper*gain;
  return rgb.map(channel=>channel+(255-channel)*lift);
}

export function validatePitchHeadLighting(lighting,surface){
  if(lighting?.mode!=='nose-axis-pitch-light-review'||!surface||
    ![lighting.maxDegrees,lighting.axisY,lighting.fadeHalfHeight,
      lighting.upperLiftFraction,lighting.lowerShadeFraction].every(Number.isFinite)||
    lighting.maxDegrees<=0||lighting.maxDegrees>6||
    lighting.axisY<=surface.bounds[1]||lighting.axisY>=surface.neckHoldY||
    lighting.fadeHalfHeight<3||lighting.fadeHalfHeight>30||
    lighting.upperLiftFraction<0||lighting.upperLiftFraction>.25||
    lighting.lowerShadeFraction<0||lighting.lowerShadeFraction>.2)
    throw Error('抬低頭光影候選設定無效');
}

// Signed pitch lighting uses the same skin/owner mask as the reviewed yaw light.
// At zero pitch it is exactly inert; it does not infer hidden-plane artwork.
export function pitchHeadLightingColor(x,y,pitchDegrees,surface,lighting,rgb,strength=1){
  if(!lighting||Math.abs(pitchDegrees)<1e-8||strength<=0)return rgb;
  const [cx,cy]=surface.geometry.center,[rx,ry]=surface.geometry.radii;
  const dx=(x-cx)/rx,dy=(y-cy)/ry;
  const t=Math.max(0,1-dx*dx-dy*dy);
  if(t<=0)return rgb;
  const [r,g,b]=rgb;
  const skin=smooth((g-150)/35)*smooth((r-g-4)/18)*smooth((b-140)/30);
  const mask=skin*smooth(t/.18)*
    (1-smooth((y-surface.neckHoldY)/(surface.bounds[3]-surface.neckHoldY)));
  if(mask<=0)return rgb;
  const amount=clamp(Math.abs(pitchDegrees)/lighting.maxDegrees,0,1)*
    clamp(strength,0,1)*mask;
  const upper=1-smooth((y-lighting.axisY+lighting.fadeHalfHeight)/
    (2*lighting.fadeHalfHeight));
  if(pitchDegrees>0){
    const lift=lighting.upperLiftFraction*upper*amount;
    return rgb.map(channel=>channel+(255-channel)*lift);
  }
  const shade=lighting.lowerShadeFraction*(1-upper)*amount;
  return rgb.map(channel=>channel*(1-shade));
}
