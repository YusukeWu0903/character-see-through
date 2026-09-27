import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),task='Mimi_cloud_20260927',rigPath='_review/motion_v62/rig.json';
const input=path.join(root,'outputs/seethrough_local',task),output=path.join(root,'site/mimi-demo');
const assets=new Map(),modules=new Set();
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
async function asset(file,hash){
 if(!/^(?:_review\/[\w-]+\/)?[\w-]+\.(json|png)$/.test(file))throw Error('Unsafe asset '+file);
 const bytes=await readFile(path.join(input,file));if(hash&&sha(bytes)!==hash.toUpperCase())throw Error('Hash mismatch '+file);
 const target=path.join(output,'layers/seethrough_local',task,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(input,file),target);assets.set(file,sha(bytes));return JSON.parse(file.endsWith('.json')?bytes:'null');
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
   ["$('candidate-title').textContent=rig.characterName+' 待機與滑鼠胸部動態 · 待驗收';","$('candidate-title').textContent=rig.characterName+' · v62 階段展示';"],
   ["$('status').textContent='已載入 '+layers.length+' 層 · '+rig.candidate+' 待審';","$('status').textContent='已載入 '+layers.length+' 層 · v62 階段展示';"]
  ];for(const [before,after]of substitutions){if(!code.includes(before))throw Error('Template changed '+before);code=code.replace(before,after)}
 }
 await mkdir(path.join(output,'viewer-assets'),{recursive:true});await writeFile(path.join(output,'viewer-assets',name),code);
}
const rig=await asset(rigPath);
if(rig.task!==task||rig.candidate!=='motion_v62')throw Error('Wrong task');
const assembly=await asset(rig.assembly,rig.assemblySha256);
for(const entry of assembly.drawOrder)await asset(entry.asset||entry.file,entry.assetSha256);
await module('assembly-motion.mjs');
let html=await readFile(path.join(root,'viewer/assembly-motion.html'),'utf8');
html=html.replace('<title>Miffy 全身動態候選 · 非正式</title>','<title>Mimi · 互動階段展示</title>')
 .replace('本機預覽，不改正式圖層與設定','原生 1280 · 身體、肩膀與裙襬動態 · 眨眼／表情尚未製作')
 .replace(/<script type="module" src="\.\/assembly-motion\.mjs[^\"]*"><\/script>/,'<script type="module">const base=location.pathname.replace(/\\/index\\.html$/, "").replace(/\\/$/, "");await import(base+"/viewer-assets/assembly-motion.mjs?v=mimi62");</script>');
await writeFile(path.join(output,'index.html'),html);
await writeFile(path.join(output,'release.json'),JSON.stringify({task,candidate:rig.candidate,stageCheckpoint:true,approval:'User accepted current Mimi stage and requested portfolio publication on 2026-09-28',nativeTextureSize:1280,remaining:['minor hair edge detail deferred','no blink or expression assets','no independent hair animation','one final Canvas copy'],assets:Object.fromEntries(assets),modules:[...modules].sort()},null,2));
console.log(JSON.stringify({output,assets:assets.size,modules:modules.size}));
