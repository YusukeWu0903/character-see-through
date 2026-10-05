import {createFieldMeshRenderer} from './mesh-renderer.mjs?review-runtime=v61-skirt-owner-follower';
import {headSurfacePoint} from './head-surface-warp.mjs?review-runtime=v37-pitch-light';
import {stanceOffset,hipTiltOffset} from './stance-field.mjs';
import {armVector} from './arm-sway-field.mjs?review-runtime=v41-directed-arm-vector';
import {skirtWeight} from './skirt-sway-field.mjs';
import {hairFollowPoint} from './hair-follow-field.mjs?review-runtime=mimi-hair-tips-v77';
import {neckFollowPoint} from './neck-follow-field.mjs';
import {pitchFollowPoint} from './pitch-follow-field.mjs';
import {bustWeight,bustHorizontalWeight} from './bust-field.mjs?review-runtime=mimi-chest-lobes-v78';
import {shoulderPosePoint} from './expression-pose.mjs?review-runtime=v67-independent-shoulders';
import {legKneeOffset} from './leg-knee-field.mjs';
import {legSwayOffset} from './leg-sway-field.mjs';

const smoothArmEdge=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t)};

export function createSharedFieldAdapter(direct=false){
  const mesh=createFieldMeshRenderer(1280,1280,!direct);
  let headDomain=null;
  const staticDomains=new WeakMap();
  let domainContext=null;
  function alphaDomain(source){
    if(staticDomains.has(source))return staticDomains.get(source);
    if(!domainContext){const scratch=document.createElement('canvas');scratch.width=scratch.height=1280;
      domainContext=scratch.getContext('2d',{willReadFrequently:true})}
    const g=domainContext;g.clearRect(0,0,1280,1280);g.drawImage(source,0,0);
    const data=g.getImageData(0,0,1280,1280).data;let l=1280,t=1280,r=0,b=0;
    for(let y=0;y<1280;y++)for(let x=0;x<1280;x++)if(data[(y*1280+x)*4+3]){
      l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);
    }
    const domain=r?[Math.max(0,l-2),Math.max(0,t-2),Math.min(1280,r+2),Math.min(1280,b+2)]:[0,0,1280,1280];
    staticDomains.set(source,domain);return domain;
  }
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
    ys:[part.bounds[1],...[part.rootY,part.tipY].filter(Number.isFinite),part.bounds[3]]});
  function copy(target,source,point,options,active=true){
    const g=target.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);
    g.drawImage(active?mesh.draw(source,point,options):source,0,0);
  }
  return {mesh,
    prepareDomains(layers){for(const layer of layers)if(layer.name!=='face'&&layer.visible&&!layer.blank)alphaDomain(layer.image)},
    scene(target,layers,matrices,controls,rig,drivers,face,revision,guideFor,headLighting,layerSource){
      mesh.begin();
      // Tokens live for one scene only: never reuse a prior pose or stale guide geometry.
      const mappingGroups=new Map();
      const skirtOwnerVisible=!rig.skirtSway||
        layers.find(layer=>layer.name===(rig.skirtSway.owner||'bottomwear'))?.visible!==false;
      const renderLayers=[];
      for(const layer of layers){
        if(!layer.visible||layer.blank)continue;
        const override=layer.name==='face'?null:layerSource?.(layer);
        if(override?.variants)
          for(const variant of override.variants)
            renderLayers.push({layer:{...layer,name:variant.name,image:variant.image,
              sourceOwner:layer.name,componentBounds:variant.bounds},
              override:{revision:'fixed-leg-component:'+variant.name}});
        else renderLayers.push({layer,override});
      }
      for(const {layer,override} of renderLayers){
        if(!layer.visible||layer.blank)continue;
        const name=layer.name,matrix=matrices[layer.sourceOwner||name];
        if(!skirtOwnerVisible&&rig.skirtSway?.followers?.includes(name))continue;
        const hair=rig.hairFollow?.parts[name],neck=name==='neck'?rig.neckFollow:null;
        const pitch=rig.headPitch?.parts[name];
        const arm=rig.armSway&&(name==='handwear'||rig.armSway.followers?.includes(name+'.png')||
          rig.armSway.followersByLayer?.[name]?.length)?rig.armSway:null;
        const armSides=arm?(name==='topwear'&&rig.armSway.followersByLayer?.[name]?
          arm.sides.filter(side=>rig.armSway.followersByLayer[name].includes(side.name)):arm.sides):[];
        const armFollowerRegions=name==='topwear'?rig.armSway?.followerRegionsByLayer?.topwear:null;
        const compositeChest=rig.bustField?.mode==='composite-chest-field';
        const chestCandidate=compositeChest?rig.bustField:
          name==='topwear'?rig.bustField:null;
        let chest=null,chestDomain=null;
        if(chestCandidate){
          const centers=chestCandidate.centers||[[chestCandidate.centerX,chestCandidate.centerY]];
          const bounds=alphaDomain(layer.image);
          const left=Math.min(...centers.map((c,i)=>c[0]-(chestCandidate.radiiX?.[i]??chestCandidate.radiusX)));
          const right=Math.max(...centers.map((c,i)=>c[0]+(chestCandidate.radiiX?.[i]??chestCandidate.radiusX)));
          const top=chestCandidate.centerY-chestCandidate.radiusY;
          const bottom=chestCandidate.centerY+(chestCandidate.lowerRadiusY??chestCandidate.radiusY);
          if(bounds[0]<right&&bounds[2]>left&&bounds[1]<bottom&&bounds[3]>top){
            chest=chestCandidate;chestDomain=bounds;
          }
        }
        const skirt=rig.skirtSway&&
          (name===(rig.skirtSway.owner||'bottomwear')||rig.skirtSway.followers?.includes(name))?rig.skirtSway:null;
        const leg=layer.sourceOwner==='legwear'?rig.legKnee?.parts[name]:null;
        const legSway=layer.sourceOwner==='legwear'?rig.legSway:null;
        const sourceOverride=override;
        const source=name==='face'?face():(sourceOverride?.source||layer.image);
        const head=name==='face'&&rig.renderer.gpuHead?rig.headSurface:null;
        const headActive=head&&Math.abs(drivers.yaw)+Math.abs(controls.pitch||0)>1e-8;
        const boundaries=hair||neck||pitch;
        const extra=boundaries?axis(boundaries):{xs:[],ys:[]};
        const shoulderField=rig.expressionPose?.field||rig.shoulderCompensation?.field;
        if(shoulderField){
          const f=shoulderField;
          for(let x=f.left;x<=f.right;x+=f.gridStep)extra.xs.push(x);
          for(let y=f.headThroughY;y<=f.holdY;y+=f.gridStep)extra.ys.push(y);
          extra.ys.push(f.headThroughY,f.shoulderY,f.holdY);
        }
        if(headActive){for(let x=head.bounds[0];x<=head.bounds[2];x+=3)extra.xs.push(x);
          for(let y=head.bounds[1];y<=head.bounds[3];y+=3)extra.ys.push(y);}
        if(arm){extra.xs.push(...armSides.flatMap(s=>[s.x0-1,s.x0,s.x1,s.x1+1]));
          extra.ys.push(...armSides.flatMap(s=>(s.bands||arm.bands).map(b=>b.y)))}
        if(armFollowerRegions)for(const region of Object.values(armFollowerRegions))
          extra.xs.push(...(region.fadeX||[]),...(region.plateauX||[]));
        if(chest){
          const centers=chest.centers||[[chest.centerX,chest.centerY]];
          const left=Math.min(...centers.map((c,i)=>c[0]-(chest.radiiX?.[i]??chest.radiusX)));
          const right=Math.max(...centers.map((c,i)=>c[0]+(chest.radiiX?.[i]??chest.radiusX)));
          for(let x=left;x<=right;x+=8)extra.xs.push(x);
          for(let y=chest.centerY-chest.radiusY;y<=chest.centerY+(chest.lowerRadiusY??chest.radiusY);y+=8)extra.ys.push(y);
        }
        if(leg)extra.ys.push(...leg.bands.map(b=>b[0]));
        if(legSway)extra.ys.push(...legSway.bands.map(b=>b[0]));
        extra.ys.push(...rig.grounding.bands.map(b=>b.y),rig.grounding.groundY);
        if(rig.grounding.hipTilt)extra.ys.push(rig.grounding.hipTilt.topY,rig.grounding.hipTilt.bottomY);
        const map=(x,y)=>{
          if(rig.staticLayers?.includes(name))return [x,y];
          let p=[x,y];
          if(headActive)p=headSurfacePoint(x,y,drivers.yaw,head,(controls.pitch||0)*rig.headPitch.maxDegrees,rig.headPitchProfile);
        if(arm){const side=armSides.find(s=>armFollowerRegions?.[s.name]?.allX||x>=s.x0&&x<=s.x1);if(side){
          let weight=1;const region=armFollowerRegions?.[side.name];
          if(region&&!region.allX){const [fade0,fade1]=region.fadeX,[full0,full1]=region.plateauX;
            weight=x<full0?smoothArmEdge((x-fade0)/(full0-fade0)):
              x>full1?smoothArmEdge((fade1-x)/(fade1-full1)):1;}
          const [dx,dy]=armVector(y,controls[side.name]||0,side,arm);p[0]+=dx*weight;p[1]+=dy*weight}}
          if(hair)p=hairFollowPoint(...p,drivers.hair[name],hair);
          if(neck)p=neckFollowPoint(...p,drivers.roll,drivers.yaw,neck);
          if(pitch)p=pitchFollowPoint(...p,controls.pitch||0,pitch);
          if(skirt)p[0]+=(drivers.skirtX||0)*skirtWeight(...p,skirt);
          if(leg)p[0]+=legKneeOffset(y,controls.knee||0,leg,rig.legKnee.maxPixels);
          if(legSway)p[0]+=legSwayOffset(y,controls.legSway||0,legSway);
          if(chest&&!compositeChest){const w=bustWeight(...p,chest);p[0]+=drivers.bustX*bustHorizontalWeight(...p,drivers.bustX,chest);p[1]+=drivers.bustY*w}
          let mx=matrix[0]*p[0]+matrix[2]*p[1]+matrix[4];
          let my=matrix[1]*p[0]+matrix[3]*p[1]+matrix[5];
          if(chest&&compositeChest){const w=bustWeight(mx,my,chest);mx-=drivers.bustX*bustHorizontalWeight(mx,my,drivers.bustX,chest);my+=drivers.bustY*w}
          const [xx,yy]=shoulderPosePoint(mx,my,controls.expressionPose,shoulderField,
            controls.shoulderLeft,controls.shoulderRight,rig.shoulderControls?.maxPixels||rig.shoulderCompensation?.maxPixels||0);
          const dx=stanceOffset(yy,controls,rig.grounding);
          return [xx+dx,yy+hipTiltOffset(xx+dx,yy,controls,rig.grounding)];
        };
        const options={...extra,clear:false,stepX:leg?16:1280/24,stepY:leg?8:16,
          revision:name==='face'?revision():sourceOverride?.revision,
          ...(head?{domain:sourceDomain(source)}:
            (hair||neck||pitch||leg||legSway)?{domain:alphaDomain(source)}:
            (chestDomain||skirt||rig.expressionPose?.cropTransparentMesh)?{domain:chestDomain||alphaDomain(source)}:{})};
        if(rig.renderer.reuseSharedGeometry){
          const key=rig.staticLayers?.includes(name)?'static':
            (hair||neck||pitch||arm||chest||skirt||leg||legSway||headActive)?'part:'+name:'shared:'+matrix.join(',');
          if(!mappingGroups.has(key))mappingGroups.set(key,{});
          options.mappingToken=mappingGroups.get(key);
          options.reuseGpuBuffers=rig.renderer.reuseGpuBuffers!==false;
        }
        mesh.draw(source,map,{...options,lighting:headActive?headLighting:undefined});
        const guide=guideFor?.(layer,matrix);
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
      copy(target,source,(x,y)=>{const side=field.sides.find(s=>x>=s.x0&&x<=s.x1);if(!side)return [x,y];
          const [dx,dy]=armVector(y,controls[side.name]||0,side,field);return [x+dx,y+dy]},
        {xs:field.sides.flatMap(s=>[s.x0-1,s.x0,s.x1,s.x1+1]),ys:field.sides.flatMap(s=>(s.bands||field.bands).map(b=>b.y))},
        field.sides.some(s=>Math.abs(controls[s.name]||0)>1e-8));
    },
    hair(target,source,drive,part){copy(target,source,(x,y)=>hairFollowPoint(x,y,drive,part),axis(part),Math.abs(drive)>1e-8)},
    neck(target,source,roll,yaw,part){copy(target,source,(x,y)=>neckFollowPoint(x,y,roll,yaw,part),axis(part),Math.abs(roll)+Math.abs(yaw)>1e-8)},
    pitch(target,source,control,part){copy(target,source,(x,y)=>pitchFollowPoint(x,y,control,part),axis(part),Math.abs(control)>1e-8)},
    bust(target,source,amplitude,field){
      const v=typeof amplitude==='number'?amplitude:amplitude.vertical,h=typeof amplitude==='number'?0:amplitude.horizontal;
      copy(target,source,(x,y)=>{const w=bustWeight(x,y,field);return [x-h*bustHorizontalWeight(x,y,h,field),y-v*w]},
        {inverse:true,step:8,ys:[field.centerY-field.radiusY,field.centerY+(field.lowerRadiusY??field.radiusY)]},Math.abs(v)+Math.abs(h)>1e-8);
    }
  };
}
