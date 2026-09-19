const vertex=`
attribute vec2 position;
uniform mat3 body, torso, head, layer;
uniform vec4 bands;
uniform vec2 scale, center;
uniform float deform, hair;
varying vec2 uv;
void main(){
  vec3 p=vec3(position,1.0);
  vec3 rigid=layer*p;
  float w=smoothstep(bands.x,bands.y,position.y);
  float n=smoothstep(bands.z,bands.w,position.y);
  vec3 shared=body*p+w*(torso*p-body*p)+n*(head*p-torso*p);
  shared+=hair*n*(layer*p-head*p);
  gl_Position=vec4(mix(rigid,shared,deform).xy*scale+center,0.0,1.0);
  uv=(position+1.0)*0.5;
}`;
const fragment=`precision mediump float; varying vec2 uv; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,uv);}`;
const mat3=m=>new Float32Array([m[0],m[1],0,m[2],m[3],0,m[4],m[5],1]);
export function createMeshRenderer(canvas){
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
  if(!gl)throw new Error('此瀏覽器無法啟用 WebGL，請使用上一階段預覽');
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uniforms=Object.fromEntries(['body','torso','head','layer','bands','scale','center','deform','hair','image'].map(k=>[k,gl.getUniformLocation(program,k)]));
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
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);textures.set(image,tex);return tex;
  }
  return {
    clear(){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);},
    draw(layers,matrices,bands,cx,cy,scale,deform=true){
      gl.uniformMatrix3fv(uniforms.body,false,mat3(matrices.legwear));gl.uniformMatrix3fv(uniforms.torso,false,mat3(matrices.neck));gl.uniformMatrix3fv(uniforms.head,false,mat3(matrices.face));
      gl.uniform4fv(uniforms.bands,[...bands.waist,...bands.neck]);gl.uniform2f(uniforms.scale,scale*2/canvas.width,scale*2/canvas.height);gl.uniform2f(uniforms.center,cx*2/canvas.width-1,1-cy*2/canvas.height);gl.uniform1f(uniforms.deform,deform?1:0);
      for(const {name,image} of layers){gl.bindTexture(gl.TEXTURE_2D,texture(image));gl.uniformMatrix3fv(uniforms.layer,false,mat3(matrices[name]));gl.uniform1f(uniforms.hair,name==='fronthair'||name==='backhair'?1:0);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);}
    }
  };
}
