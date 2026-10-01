import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),task='Mimi_cloud_20260927',rigPath='_review/motion_v78/rig.json';
const input=path.join(root,'outputs/seethrough_local',task),output=path.join(root,'site/mimi-demo');
const assets=new Map(),modules=new Set();
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
async function asset(file,hash){
 if(!/^(?:_review\/[\w-]+\/)?[\w-]+\.(json|png)$/.test(file))throw Error('Unsafe asset '+file);
 const bytes=await readFile(path.join(input,file));if(hash&&sha(bytes)!==hash.toUpperCase())throw Error('Hash mismatch '+file);
 const target=path.join(output,'layers/seethrough_local',task,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(input,file),target);assets.set(file,sha(bytes));return JSON.parse(file.endsWith('.json')?bytes:'null');
}
async function eyeRig(config){
 const manifest=await asset(config.manifest,config.manifestSha256);
 await asset(manifest.sourceHeadAsset,manifest.sourceHeadSha256);
 const dir=config.manifest.slice(0,config.manifest.lastIndexOf('/'));
 for(const side of Object.values(manifest.eyes))
  for(const spec of Object.values(side))
   if(spec?.asset&&spec?.sha256)await asset(dir+'/'+spec.asset,spec.sha256);
}
async function expressionRig(config){
 const manifest=await asset(config.manifest,config.manifestSha256);
 const dir=config.manifest.slice(0,config.manifest.lastIndexOf('/'));
 await asset(dir+'/'+manifest.backing.asset,manifest.backing.sha256);
 for(const spec of Object.values(manifest.parts))
  await asset(dir+'/'+spec.asset,spec.sha256);
 await eyeRig(manifest.eyeRig);
}
async function module(name){
 if(modules.has(name))return;modules.add(name);
 let code=await readFile(path.join(root,'viewer',name),'utf8');
 for(const m of code.matchAll(/from\s+['"]\.\/([\w-]+\.mjs)(?:\?[^'"]*)?['"]/g))await module(m[1]);
 if(name==='assembly-motion.mjs'){
  const substitutions=[
   ["const task = params.get('local') || '';",`const task = params.get('local') || '${task}';`],
   ["const rigFile = params.get('rig') || '_review/motion_v3/rig.json';",`const rigFile = params.get('rig') || '${rigPath}';`],
   ["const base = safeTask ? '/layers/seethrough_local/' + encodeURIComponent(task) + '/' : '';","const base = safeTask ? new URL('../layers/seethrough_local/' + encodeURIComponent(task) + '/', import.meta.url).pathname : '';"],
   ["$('candidate-title').textContent=rig.candidateTitle||rig.characterName+' 待機與滑鼠動態 · 待驗收';","$('candidate-title').textContent=rig.characterName+' · v78 階段展示';"],
   ["$('status').textContent='已載入 '+layers.length+' 層 · '+rig.candidate+' 待審';","$('status').textContent='已載入 '+layers.length+' 層 · v78 階段展示';"]
  ];for(const [before,after]of substitutions){if(!code.includes(before))throw Error('Template changed '+before);code=code.replace(before,after)}
 }
 await mkdir(path.join(output,'viewer-assets'),{recursive:true});await writeFile(path.join(output,'viewer-assets',name),code.trimEnd()+'\n');
}
const rig=await asset(rigPath);
if(rig.task!==task||rig.candidate!=='motion_v78')throw Error('Wrong task');
const assembly=await asset(rig.assembly,rig.assemblySha256);
for(const entry of assembly.drawOrder)await asset(entry.asset||entry.file,entry.assetSha256);
if(rig.eyeRig)await eyeRig(rig.eyeRig);
if(rig.expressionRig)await expressionRig(rig.expressionRig);
await module('assembly-motion.mjs');
let html=await readFile(path.join(root,'viewer/assembly-motion.html'),'utf8');
html=html.replace('<title>Miffy 全身動態候選 · 非正式</title>','<title>Mimi · 互動階段展示</title>')
 .replace('Miffy 全身動態 · 非正式審查候選','Mimi · v78 階段展示')
 .replace('本機預覽，不改正式圖層與設定','原生 1280 · 身體、肩膀、裙襬與髮梢動態 · 眨眼／嘟嘴')
 .replace('頭部側傾可操作；微轉、視線、眨眼與表情需要先從高解析整頭拆出獨立五官。','眨眼與閉眼嘟嘴可操作；視線跟隨仍停用。')
 .replace('手臂、腿仍各自合併一層，沒有獨立關節；肩膀、腰際、髮際需檢查動作中間幀。未完成的呼吸、胸部、視線與表情不會假裝可用。','Mimi v78 階段展示；手臂與腿仍各自合併一層，沒有獨立關節。')
 .replace(/<script type="module" src="\.\/assembly-motion\.mjs[^\"]*"><\/script>/,'<script type="module">const base=location.pathname.replace(/\\/index\\.html$/, "").replace(/\\/$/, "");await import(base+"/viewer-assets/assembly-motion.mjs?v=mimi78");</script>');
await writeFile(path.join(output,'index.html'),html.trimEnd()+'\n');
await writeFile(path.join(output,'release.json'),JSON.stringify({task,candidate:rig.candidate,stageCheckpoint:true,approval:'User requested Mimi-only Git and portfolio update on 2026-10-01',nativeTextureSize:1280,remaining:['minor hair edge detail deferred','gaze disabled','final visual acceptance of v78 pending','one final Canvas copy'],assets:Object.fromEntries(assets),modules:[...modules].sort()},null,2));
console.log(JSON.stringify({output,assets:assets.size,modules:modules.size}));
