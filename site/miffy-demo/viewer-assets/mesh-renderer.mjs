export const eyeSide=name=>name.endsWith('_left')?'left':name.endsWith('_right')?'right':null;
function meshContext(canvas,preserveDrawingBuffer=true){
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer});
  if(!gl)throw Error('此瀏覽器無法啟用共用 WebGL 網格');
  return gl;
}
function meshProgram(gl,vertexSource,fragmentSource){
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  return program;
}
function uploadMeshTexture(gl,texture,source){
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
}
export function selectEyeMask(layers,name){
  const side=eyeSide(name);
  return layers.find(layer=>layer.name===(side?`eyewhite_${side}`:'eyewhite'))?.image
    ||layers.find(layer=>layer.name==='eyewhite')?.image||null;
}
const vertex=`precision mediump float;
attribute vec2 position;
uniform mat3 body, torso, head, layer;
uniform vec4 bands;
uniform vec2 scale, center;
uniform float deform, hair, facial, eye, eyeWhite, yaw, chest, chestLayer, chestFollow, eyelashLine;
uniform vec2 eyeCenter, eyeOffset, headPivot, chestBand;
varying vec2 uv;
void main(){
  vec3 p=vec3(position,1.0);
  vec3 rigid=layer*p;
  float w=smoothstep(bands.x,bands.y,position.y);
  float n=smoothstep(bands.z,bands.w,position.y);
  vec3 shared=body*p+w*(torso*p-body*p)+n*(head*p-torso*p);
  shared+=hair*n*(layer*p-head*p);
  vec3 result=mix(rigid,shared,deform);
  // A front illustration cannot become a true three-quarter head. This small
  // screen-space compression is only a controlled micro-turn cue.
  result.x=mix(result.x,headPivot.x+(result.x-headPivot.x)*(1.0-abs(yaw)*0.07)+yaw*0.015,facial);
  if(eye>0.5){
    result.xy+=(eyeOffset*eye);
    result.y=eyeCenter.y+(result.y-eyeCenter.y)*(1.0-eyeWhite);
  }
  float vertical=smoothstep(chestBand.x,chestBand.x+.08,p.y)*(1.0-smoothstep(chestBand.y-.08,chestBand.y,p.y));
  float inner=chestLayer>1.5?.08:.14;
  float outer=chestLayer>1.5?.19:.31;
  float horizontal=1.0-smoothstep(inner,outer,abs(p.x));
  // A coherent, edge-anchored garment patch follows the pointer. There is no
  // horizontal scaling or opposing left/right motion to squeeze the center.
  // This remains restrained follow-through, not a separate oscillation.
  float chestPatch=step(.5,chestLayer)*vertical*horizontal;
  result.x+=chestPatch*chestFollow*.028;
  result.y+=chestPatch*chest*.012;
  result.y=mix(result.y,eyeCenter.y+(result.y-eyeCenter.y)*.15,eyelashLine);
  gl_Position=vec4(result.xy*scale+center,0.0,1.0);
  uv=(position+1.0)*0.5;
}`;
// Textures are uploaded premultiplied and blended with ONE / ONE_MINUS_SRC_ALPHA.
// Therefore an opacity fade must scale RGB and alpha together; scaling alpha
// alone leaves bright premultiplied RGB behind as a white card.
const fragment=`precision mediump float; varying vec2 uv; uniform sampler2D image, eyeMask; uniform float eye, eyeWhite, opacity; uniform vec2 eyeOffset; void main(){vec4 c=texture2D(image,uv);if(eye>0.5){float mask=texture2D(eyeMask,uv+eyeOffset*.5).a;c.rgb*=mask;c.a*=mask;}c.rgb*=opacity;c.a*=opacity;gl_FragColor=c;}`;
const mat3=m=>new Float32Array([m[0],m[1],0,m[2],m[3],0,m[4],m[5],1]);
export const textureUploadLimit=value=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)?Math.max(512,Math.min(1280,Math.round(parsed))):1280;
};
export function createMeshRenderer(canvas,{maxUpload=1280}={}){
  const uploadLimit=textureUploadLimit(maxUpload);
  const gl=meshContext(canvas);
  if(!gl)throw new Error('此瀏覽器無法啟用 WebGL，請使用上一階段預覽');
  const program=meshProgram(gl,vertex,fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uniforms=Object.fromEntries(['body','torso','head','layer','bands','scale','center','deform','hair','image','eyeMask','eyeCenter','eyeOffset','headPivot','facial','eye','eyeWhite','yaw','opacity','chest','chestLayer','eyelashLine','chestBand','chestFollow'].map(k=>[k,gl.getUniformLocation(program,k)]));
  const vertices=[],indices=[],cols=24,rows=80;
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)vertices.push(x/cols*2-1,y/rows*2-1);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);}
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  const textures=new WeakMap();
  function texture(image){
    if(textures.has(image))return textures.get(image);
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    // The comparison view can hold more than forty full-canvas layers. At
    // 1280px each that crosses the practical SwiftShader/WebGL memory limit
    // and loses the entire context, leaving a deceptively "loaded" blank
    // viewer. Interactive viewing stays at the source-native 1280px; only an
    // explicit validation query may request a lower-memory upload size.
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    let source=image;
    if(Math.max(width,height)>uploadLimit){
      const ratio=uploadLimit/Math.max(width,height),reduced=document.createElement('canvas');
      reduced.width=Math.max(1,Math.round(width*ratio));reduced.height=Math.max(1,Math.round(height*ratio));
      reduced.getContext('2d').drawImage(image,0,0,reduced.width,reduced.height);source=reduced;
    }
    uploadMeshTexture(gl,tex,source);
    if(source!==image){source.width=1;source.height=1;}
    textures.set(image,tex);return tex;
  }
  return {
    releaseTexture(image){
      const existing=textures.get(image);
      if(existing){gl.deleteTexture(existing);textures.delete(image);}
    },
    clear(){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);},
    draw(layers,matrices,bands,cx,cy,scale,deform=true,expression={},visibility=null){
      gl.uniformMatrix3fv(uniforms.body,false,mat3(matrices.legwear));gl.uniformMatrix3fv(uniforms.torso,false,mat3(matrices.neck));gl.uniformMatrix3fv(uniforms.head,false,mat3(matrices.face));
      gl.uniform4fv(uniforms.bands,[...bands.waist,...bands.neck]);gl.uniform2f(uniforms.scale,scale*2/canvas.width,scale*2/canvas.height);gl.uniform2f(uniforms.center,cx*2/canvas.width-1,1-cy*2/canvas.height);gl.uniform1f(uniforms.deform,deform?1:0);
      const hasClosedEyelids=layers.some(({name})=>name.replace(/_(left|right)$/,'')==='eyelid_closed');
      const faceSet=new Set(['face','mouth','nose','eyelash','eyelid_closed','eyewhite','eyebrow','irides','ears','earwear','eyewear','headwear','seam_repair_head','fronthair','backhair']);
      for(const {name,image} of layers){
        if(visibility?.[name]===false)continue;
        const baseName=name.replace(/_(left|right)$/,'');
        const side=eyeSide(name),eyeMask=baseName==='irides'?selectEyeMask(layers,name):null;
        const iris=baseName==='irides',white=baseName==='eyewhite',closedEye=baseName==='eyelid_closed',openEyelash=baseName==='eyelash'&&hasClosedEyelids,eyePart=iris||white,blink=Math.max(0,Math.min(1,expression.blink||0));
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture(image));gl.uniform1i(uniforms.image,0);
        // WebGL requires every sampler used by the linked shader to reference
        // a complete texture, even when a uniform-controlled branch will not
        // sample it for this draw. Reuse the layer texture outside the irises
        // instead of binding null, which makes Chromium reject the draw call.
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture(eyeMask||image));gl.uniform1i(uniforms.eyeMask,1);
        // Rigid mode is a layer-integrity baseline, not a fake head-turn.
        // The current decomposition has no hidden neck fill, so lock the
        // complete head group to the torso rather than displaying a false
        // broken-neck failure that flexible skinning correctly avoids.
        const layerMatrix=!deform&&faceSet.has(baseName)?matrices.neck:matrices[baseName];
        gl.uniformMatrix3fv(uniforms.layer,false,mat3(layerMatrix));gl.uniform1f(uniforms.hair,baseName==='fronthair'||baseName==='backhair'?1:0);
        gl.uniform1f(uniforms.facial,faceSet.has(baseName)?1:0);gl.uniform1f(uniforms.yaw,expression.yaw||0);gl.uniform2fv(uniforms.headPivot,expression.headPivot||[0,.48]);
        const eyeCenter=side&&expression.eyeCenters?.[side]||expression.eyeCenter||[0,.52];
        // Perceptual closure is intentionally eased: a numerical 50% keeps a
        // readable eye slit instead of looking indistinguishable from closed.
        const closure=blink*blink,openOpacity=1-closure,closedOpacity=closure;
        gl.uniform1f(uniforms.eye,iris&&eyeMask?1:0);gl.uniform1f(uniforms.eyeWhite,eyePart?closure:0);gl.uniform2fv(uniforms.eyeCenter,eyeCenter);gl.uniform2fv(uniforms.eyeOffset,iris?(expression.gaze||[0,0]):[0,0]);gl.uniform1f(uniforms.opacity,eyePart||openEyelash?openOpacity:closedEye?closedOpacity:1);
        gl.uniform1f(uniforms.chest,expression.chest||0);gl.uniform1f(uniforms.chestLayer,baseName==='topwear'?1:['handwear','seam_repair_torso'].includes(baseName)?2:0);gl.uniform1f(uniforms.eyelashLine,baseName==='eyelash'?closure:0);gl.uniform2fv(uniforms.chestBand,expression.chestBand||[.2,.5]);gl.uniform1f(uniforms.chestFollow,expression.chestFollow||0);
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
      }
    }
  };
}

// Shared native-texture triangle backend for task-owned continuous fields.
// Character geometry is supplied by the existing field evaluators, not Eris gains.
export function createFieldMeshRenderer(width=1280,height=1280,preserveDrawingBuffer=true){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const gl=meshContext(canvas,preserveDrawingBuffer),program=meshProgram(gl,
    'attribute vec2 position; attribute vec2 sampleUV; varying vec2 uv; void main(){uv=sampleUV;gl_Position=vec4(position,0.,1.);}',
    `precision highp float; varying vec2 uv; uniform sampler2D image;
    uniform vec2 size, center; uniform vec3 radii; uniform vec4 bounds, angles, lightParams, pitchParams;
    uniform float kind, neckHold, liftGain; uniform vec3 lightDirection;
    float ease(float t){t=clamp(t,0.,1.);return t*t*(3.-2.*t);}
    float skin(vec3 rgb){return ease((rgb.g-150.)/35.)*ease((rgb.r-rgb.g-4.)/18.)*ease((rgb.b-140.)/30.);}
    void main(){vec4 c=texture2D(image,uv);vec2 p=vec2(uv.x,1.-uv.y)*size;
      if(kind>0.&&(abs(angles.x)+abs(angles.y)>0.00000001)&&c.a>0.&&p.x>=bounds.x&&p.y>=bounds.y&&p.x<bounds.z&&p.y<bounds.w){
        vec2 d=p-center;float t=max(0.,1.-dot(d/radii.xy,d/radii.xy));
        float base=ease(t/.18)*(1.-ease((p.y-neckHold)/(bounds.w-neckHold)));
        vec3 rgb=c.rgb/c.a*255.;vec3 n=normalize(vec3(radii.z*1.2*pow(t,.2)*2.*d/(radii.xy*radii.xy),1.));
        float delta=-n.x*sin(angles.x)*lightParams.x;
        if(kind>2.5){vec3 l=normalize(lightDirection);float a=angles.x;
          delta=(max(0.,dot(vec3(n.x*cos(a)+n.z*sin(a),n.y,n.z*cos(a)-n.x*sin(a)),l))-max(0.,dot(n,l)))*lightParams.x;}
        delta=clamp(delta,-lightParams.y,lightParams.y)*angles.z*base*skin(rgb);
        if(kind>2.5||delta<0.)rgb*=1.+delta;
        else {float upper=kind>1.5?1.-ease((p.y-lightParams.z)/(lightParams.w-lightParams.z)):1.;
          rgb+=(255.-rgb)*(delta/lightParams.y*.45*upper*liftGain);}
        rgb=floor(clamp(rgb,0.,255.)+.5);
        float amount=clamp(abs(angles.y)/angles.w,0.,1.)*angles.z*base*skin(rgb);
        float upper=1.-ease((p.y-pitchParams.x+pitchParams.y)/(2.*pitchParams.y));
        if(angles.y>0.)rgb+=(255.-rgb)*(pitchParams.z*upper*amount);
        else rgb*=1.-pitchParams.w*(1.-upper)*amount;
        c.rgb=clamp(rgb,0.,255.)/255.*c.a;
      }gl_FragColor=c;}`);
  gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  const vertices=gl.createBuffer(),elements=gl.createBuffer(),textures=new WeakMap(),meshes=new Map();
  gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
  for(const [name,offset] of [['position',0],['sampleUV',8]]){
    const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,16,offset);
  }
  gl.uniform1i(gl.getUniformLocation(program,'image'),0);
  const u=Object.fromEntries(['size','center','radii','bounds','angles','lightParams','pitchParams','kind','neckHold','liftGain','lightDirection'].map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform2f(u.size,width,height);
  let draws=0;
  return {canvas,get draws(){return draws},
    begin(){gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)},
    draw(source,point,{step=16,stepX=step,stepY=step,xs=[],ys=[],inverse=false,clear=true,revision,lighting,domain=[0,0,width,height]}={}){
      gl.uniform1f(u.kind,0);
      if(lighting&&lighting.strength>0){
        const {surface:s,config:l,pitchConfig:p,strength,yaw,pitch}=lighting;
        gl.uniform1f(u.kind,l.mode==='upper-balanced-review'?2:l.mode==='balanced-frontal-review'?1:3);
        gl.uniform2fv(u.center,s.geometry.center);gl.uniform3fv(u.radii,s.geometry.radii);gl.uniform4fv(u.bounds,s.bounds);
        gl.uniform1f(u.neckHold,s.neckHoldY);gl.uniform1f(u.liftGain,l.upperLight?.liftGain||1);
        gl.uniform4fv(u.angles,[yaw*Math.PI/180,pitch,strength,p?.maxDegrees||1]);
        gl.uniform4fv(u.lightParams,[l.intensity,l.maxFraction,l.upperLight?.fullThroughY||0,l.upperLight?.zeroFromY||1]);
        gl.uniform4fv(u.pitchParams,[p?.axisY||0,p?.fadeHalfHeight||1,p?.upperLiftFraction||0,p?.lowerShadeFraction||0]);
        gl.uniform3fv(u.lightDirection,l.lightDirection);
      }
      if(gl.isContextLost())throw Error('共用網格 WebGL context 已失效');
      const axis=(size,extra,stride,min,max)=>[...new Set([min,max,...Array.from({length:Math.ceil(size/stride)},(_,i)=>Math.min(size,i*stride)),...extra])].filter(v=>v>=min&&v<=max).sort((a,b)=>a-b);
      const x=axis(width,xs,stepX,domain[0],domain[2]),y=axis(height,ys,stepY,domain[1],domain[3]),key=x.join(',')+'|'+y.join(',');
      let mesh=meshes.get(key);
      if(!mesh){
        const coords=[],indices=[];
        for(const yy of y)for(const xx of x)coords.push([xx,yy]);
        if(coords.length>65535)throw Error('共用網格頂點超限');
        for(let j=0;j<y.length-1;j++)for(let i=0;i<x.length-1;i++){
          const a=j*x.length+i,b=a+x.length;indices.push(a,a+1,b,a+1,b+1,b);
        }
        mesh={coords,data:new Float32Array(coords.length*4),indices:new Uint16Array(indices)};meshes.set(key,mesh);
      }
      for(let i=0;i<mesh.coords.length;i++){
        const [xx,yy]=mesh.coords[i],[px,py]=point(xx,yy);
        const ox=inverse?xx:px,oy=inverse?yy:py,sx=inverse?px:xx,sy=inverse?py:yy;
        mesh.data.set([ox/width*2-1,1-oy/height*2,sx/width,1-sy/height],i*4);
      }
      let entry=textures.get(source);
      if(!entry){entry={texture:gl.createTexture(),revision};textures.set(source,entry);uploadMeshTexture(gl,entry.texture,source)}
      else if(typeof source.getContext==='function'&&(revision===undefined||revision!==entry.revision)){
        uploadMeshTexture(gl,entry.texture,source);entry.revision=revision;
      }
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
      gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,mesh.data,gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      gl.viewport(0,0,width,height);
      if(clear){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}
      gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);draws++;
      if(clear){const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('共用網格繪製失敗：'+error)}
      return canvas;
    }
  };
}
