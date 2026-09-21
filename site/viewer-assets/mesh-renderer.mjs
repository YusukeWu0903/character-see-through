export const eyeSide=name=>name.endsWith('_left')?'left':name.endsWith('_right')?'right':null;
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
uniform float deform, hair, facial, eye, eyeWhite, yaw, chest, chestLayer, eyelashLine;
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
  float cw=smoothstep(chestBand.x,chestBand.x+.08,p.y)*(1.0-smoothstep(chestBand.y-.08,chestBand.y,p.y));
  // This is deliberately a small, coherent follow-through rather than a
  // separate oscillation.  Larger independent local deformation tears the
  // existing body and clothing layers, which have no matching hidden fill.
  result.y+=chestLayer*cw*chest*.045;
  result.x*=1.0+chestLayer*cw*chest*.050;
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
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
  if(!gl)throw new Error('此瀏覽器無法啟用 WebGL，請使用上一階段預覽');
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uniforms=Object.fromEntries(['body','torso','head','layer','bands','scale','center','deform','hair','image','eyeMask','eyeCenter','eyeOffset','headPivot','facial','eye','eyeWhite','yaw','opacity','chest','chestLayer','eyelashLine','chestBand'].map(k=>[k,gl.getUniformLocation(program,k)]));
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
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    if(source!==image){source.width=1;source.height=1;}
    textures.set(image,tex);return tex;
  }
  return {
    clear(){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);},
    draw(layers,matrices,bands,cx,cy,scale,deform=true,expression={}){
      gl.uniformMatrix3fv(uniforms.body,false,mat3(matrices.legwear));gl.uniformMatrix3fv(uniforms.torso,false,mat3(matrices.neck));gl.uniformMatrix3fv(uniforms.head,false,mat3(matrices.face));
      gl.uniform4fv(uniforms.bands,[...bands.waist,...bands.neck]);gl.uniform2f(uniforms.scale,scale*2/canvas.width,scale*2/canvas.height);gl.uniform2f(uniforms.center,cx*2/canvas.width-1,1-cy*2/canvas.height);gl.uniform1f(uniforms.deform,deform?1:0);
      const hasClosedEyelids=layers.some(({name})=>name.replace(/_(left|right)$/,'')==='eyelid_closed');
      const faceSet=new Set(['face','mouth','nose','eyelash','eyelid_closed','eyewhite','eyebrow','irides','ears','earwear','eyewear','headwear','seam_repair_head','fronthair','backhair']);
      for(const {name,image} of layers){
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
        gl.uniform1f(uniforms.chest,expression.chest||0);gl.uniform1f(uniforms.chestLayer,['topwear','neck','handwear','seam_repair_torso'].includes(baseName)?1:0);gl.uniform1f(uniforms.eyelashLine,baseName==='eyelash'?closure:0);gl.uniform2fv(uniforms.chestBand,expression.chestBand||[.2,.5]);
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
      }
    }
  };
}
