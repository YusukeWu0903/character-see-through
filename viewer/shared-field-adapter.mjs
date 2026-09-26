import {createFieldMeshRenderer} from './mesh-renderer.mjs?review-runtime=v49-full-gpu';
import {headSurfacePoint} from './head-surface-warp.mjs?review-runtime=v37-pitch-light';
import {stanceOffset,hipTiltOffset} from './stance-field.mjs';
import {armOffset} from './arm-sway-field.mjs';
import {hairFollowPoint} from './hair-follow-field.mjs';
import {neckFollowPoint} from './neck-follow-field.mjs';
import {pitchFollowPoint} from './pitch-follow-field.mjs';
import {bustWeight} from './bust-field.mjs?review-runtime=v46-shared-fields';

export function createSharedFieldAdapter(direct=false){
  const mesh=createFieldMeshRenderer(1280,1280,!direct);
  let headDomain=null;
  function sourceDomain(source){
    if(headDomain)return headDomain;
    const scratch=document.createElement('canvas');scratch.width=scratch.height=1280;
    const g=scratch.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0);
    const data=g.getImageData(0,0,1280,1280).data;let l=1280,t=1280,r=0,b=0;
    for(let y=0;y<1280;y++)for(let x=0;x<1280;x++)if(data[(y*1280+x)*4+3]){
      l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);
    }
    headDomain=[Math.max(0,l-2),Math.max(0,t-2),Math.min(1280,r+2),Math.min(1280,b+2)];return headDomain;
  }
  const axis=part=>({xs:[part.bounds[0],part.bounds[0]+5,part.bounds[2]-5,part.bounds[2]],
    ys:[part.bounds[1],part.bounds[3]]});
  function copy(target,source,point,options,active=true){
    const g=target.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);
    g.drawImage(active?mesh.draw(source,point,options):source,0,0);
  }
  return {mesh,
    scene(target,layers,matrices,controls,rig,drivers,face,revision,guideFor,headLighting){
      mesh.begin();
      for(const layer of layers){
        if(!layer.visible||layer.blank)continue;
        const name=layer.name,matrix=matrices[name];
        const hair=rig.hairFollow?.parts[name],neck=name==='neck'?rig.neckFollow:null;
        const pitch=rig.headPitch?.parts[name];
        const arm=name==='handwear'?rig.armSway:null;
        const chest=name==='topwear'?rig.bustField:null;
        const source=name==='face'?face():layer.image;
        const head=name==='face'&&rig.renderer.gpuHead?rig.headSurface:null;
        const headActive=head&&Math.abs(drivers.yaw)+Math.abs(controls.pitch||0)>1e-8;
        const boundaries=hair||neck||pitch;
        const extra=boundaries?axis(boundaries):{xs:[],ys:[]};
        if(headActive){for(let x=head.bounds[0];x<=head.bounds[2];x+=3)extra.xs.push(x);
          for(let y=head.bounds[1];y<=head.bounds[3];y+=3)extra.ys.push(y);}
        if(arm){extra.xs.push(...arm.sides.flatMap(s=>[s.x0-1,s.x0,s.x1,s.x1+1]));extra.ys.push(...arm.bands.map(b=>b.y))}
        if(chest){
          const left=Math.min(...chest.centers.map(c=>c[0]))-chest.radiusX;
          const right=Math.max(...chest.centers.map(c=>c[0]))+chest.radiusX;
          for(let x=left;x<=right;x+=8)extra.xs.push(x);
          for(let y=chest.centerY-chest.radiusY;y<=chest.centerY+(chest.lowerRadiusY??chest.radiusY);y+=8)extra.ys.push(y);
        }
        extra.ys.push(...rig.grounding.bands.map(b=>b.y),rig.grounding.groundY);
        if(rig.grounding.hipTilt)extra.ys.push(rig.grounding.hipTilt.topY,rig.grounding.hipTilt.bottomY);
        const map=(x,y)=>{
          let p=[x,y];
          if(headActive)p=headSurfacePoint(x,y,drivers.yaw,head,(controls.pitch||0)*rig.headPitch.maxDegrees,rig.headPitchProfile);
          if(arm){const side=arm.sides.find(s=>x>=s.x0&&x<=s.x1);if(side)p[0]+=armOffset(y,controls[side.name]||0,side,arm)}
          if(hair)p=hairFollowPoint(...p,drivers.hair[name],hair);
          if(neck)p=neckFollowPoint(...p,drivers.roll,drivers.yaw,neck);
          if(pitch)p=pitchFollowPoint(...p,controls.pitch||0,pitch);
          if(chest){const w=bustWeight(...p,chest);p[0]+=drivers.bustX*w;p[1]+=drivers.bustY*w}
          const xx=matrix[0]*p[0]+matrix[2]*p[1]+matrix[4],yy=matrix[1]*p[0]+matrix[3]*p[1]+matrix[5];
          const dx=stanceOffset(yy,controls,rig.grounding);
          return [xx+dx,yy+hipTiltOffset(xx+dx,yy,controls,rig.grounding)];
        };
        const options={...extra,clear:false,stepX:1280/24,stepY:16,revision:name==='face'?revision():undefined,
          ...(head?{domain:sourceDomain(source)}:{})};
        mesh.draw(source,map,{...options,lighting:headActive?headLighting:undefined});
        const guide=guideFor?.(layer);
        if(guide)mesh.draw(guide,map,{...options,revision:undefined});
      }
      if(rig.renderer.presentation!=='direct-webgl'){
        const g=target.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);g.drawImage(mesh.canvas,0,0);
      }
    },
    stance(target,source,controls,field){
      const active=['body','torso','head'].some(key=>Math.abs(controls[key]||0)>1e-8);
      copy(target,source,(x,y)=>{const dx=stanceOffset(y,controls,field);return [x+dx,y+hipTiltOffset(x+dx,y,controls,field)]},
        {ys:[...field.bands.map(b=>b.y),field.groundY,...(field.hipTilt?[field.hipTilt.topY,field.hipTilt.bottomY]:[])]},active);
    },
    arm(target,source,controls,field){
      copy(target,source,(x,y)=>{const side=field.sides.find(s=>x>=s.x0&&x<=s.x1);return [x+(side?armOffset(y,controls[side.name],side,field):0),y]},
        {xs:field.sides.flatMap(s=>[s.x0-1,s.x0,s.x1,s.x1+1]),ys:field.bands.map(b=>b.y)},
        field.sides.some(s=>Math.abs(controls[s.name]||0)>1e-8));
    },
    hair(target,source,drive,part){copy(target,source,(x,y)=>hairFollowPoint(x,y,drive,part),axis(part),Math.abs(drive)>1e-8)},
    neck(target,source,roll,yaw,part){copy(target,source,(x,y)=>neckFollowPoint(x,y,roll,yaw,part),axis(part),Math.abs(roll)+Math.abs(yaw)>1e-8)},
    pitch(target,source,control,part){copy(target,source,(x,y)=>pitchFollowPoint(x,y,control,part),axis(part),Math.abs(control)>1e-8)},
    bust(target,source,amplitude,field){
      const v=typeof amplitude==='number'?amplitude:amplitude.vertical,h=typeof amplitude==='number'?0:amplitude.horizontal;
      copy(target,source,(x,y)=>{const w=bustWeight(x,y,field);return [x-h*w,y-v*w]},
        {inverse:true,step:8,ys:[field.centerY-field.radiusY,field.centerY+(field.lowerRadiusY??field.radiusY)]},Math.abs(v)+Math.abs(h)>1e-8);
    }
  };
}
