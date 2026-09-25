import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const task = 'Miffy_full_body_casual_rb_20260924_012138';
const input = path.join(root, 'outputs', 'seethrough_local', task);
const output = path.join(root, 'site', 'miffy-demo');
const runtime = path.join(output, 'layers', 'seethrough_local', task);
const rigPath = '_review/motion_v40/rig.json';
const copied = new Set();

function checkedRelative(value) {
  if (typeof value !== 'string' || !/^(?:_review\/[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.(?:png|json)$/.test(value)) {
    throw new Error(`Unexpected runtime asset path: ${value}`);
  }
  return value;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function copyAsset(relative, expectedHash) {
  checkedRelative(relative);
  const bytes = await readFile(path.join(input, relative));
  if (expectedHash && hash(bytes) !== expectedHash.toUpperCase()) {
    throw new Error(`Source hash mismatch: ${relative}`);
  }
  if (!copied.has(relative)) {
    const target = path.join(runtime, relative);
    await mkdir(path.dirname(target), {recursive: true});
    await copyFile(path.join(input, relative), target);
    copied.add(relative);
  }
  return bytes;
}

async function main() {
  const chain = [];
  let next = rigPath;
  let expected;
  while (next) {
    if (chain.length > 24) throw new Error('Rig inheritance is too deep');
    const rig = JSON.parse(await copyAsset(next, expected));
    chain.push(rig);
    next = rig.extends;
    expected = rig.extendsSha256;
  }
  const newest = chain[0];
  const resolved = Object.assign({}, ...chain.toReversed());
  if (newest.task !== task || newest.candidate !== 'motion_v40' ||
      newest.nonProduction !== true || newest.reviewStatus !== 'pending') {
    throw new Error('Unexpected Miffy candidate or review state');
  }
  const assembly = JSON.parse(await copyAsset(resolved.assembly, resolved.assemblySha256));
  if (assembly.task !== task || assembly.drawOrder?.length !== 17) {
    throw new Error('Unexpected assembly');
  }
  for (const entry of assembly.drawOrder) await copyAsset(entry.asset || entry.file);
  const eye = JSON.parse(await copyAsset(resolved.eyeRig.manifest, resolved.eyeRig.manifestSha256));
  await copyAsset('_review/full_head_v8/head.png', eye.sourceHeadSha256);
  const eyeDir = path.posix.dirname(resolved.eyeRig.manifest);
  for (const side of ['left', 'right']) {
    for (const key of ['base', 'open', 'white', 'iris', 'lash', 'closed', 'mask', 'openMotion']) {
      const asset = eye.eyes[side][key];
      if (asset) await copyAsset(`${eyeDir}/${asset.asset}`, asset.sha256);
    }
  }

  const modules = ['assembly-motion', 'rig', 'grounded-sway', 'stance-field',
    'pointer-follow', 'bust-field', 'expression', 'head-yaw-field', 'head-geometry',
    'head-surface-warp', 'head-pitch-proportion', 'head-lighting', 'neck-follow-field', 'hair-follow-field',
    'hair-idle-state', 'pitch-follow-field', 'arm-sway-field'];
  const moduleDir = path.join(output, 'viewer-assets');
  await mkdir(moduleDir, {recursive: true});
  for (const name of modules) {
    let code = await readFile(path.join(root, 'viewer', `${name}.mjs`), 'utf8');
    if (name === 'assembly-motion') {
      const substitutions = [
        ["const task = params.get('local') || '';", `const task = params.get('local') || '${task}';`],
        ["const rigFile = params.get('rig') || '_review/motion_v3/rig.json';", `const rigFile = params.get('rig') || '${rigPath}';`],
        ["const base = safeTask ? '/layers/seethrough_local/' + encodeURIComponent(task) + '/' : '';", "const base = safeTask ? '/miffy-demo/layers/seethrough_local/' + encodeURIComponent(task) + '/' : '';"],
        ["$('candidate-title').textContent='Miffy 全身動態 '+rig.candidate+' · 非正式審查候選';", "$('candidate-title').textContent='Miffy · v40 階段展示';"],
        ["$('status').textContent='已載入 17 層 · '+rig.candidate+' 待審';", "$('status').textContent='已載入 17 層 · v40 階段展示';"]
      ];
      for (const [before, after] of substitutions) {
        if (!code.includes(before)) throw new Error(`Viewer template changed: ${before.slice(0, 70)}`);
        code = code.replace(before, after);
      }
    }
    await writeFile(path.join(moduleDir, `${name}.mjs`), code);
  }

  let html = await readFile(path.join(root, 'viewer', 'assembly-motion.html'), 'utf8');
  const htmlSubstitutions = [
    ['<title>Miffy 全身動態候選 · 非正式</title>', '<title>Miffy · 互動展示（製作中）</title>'],
    ['<strong id="candidate-title">Miffy 全身動態 · 非正式審查候選</strong> <small>本機預覽，不改正式圖層與設定</small><a id="latest" hidden>開啟新版動態</a>', '<strong id="candidate-title">Miffy · v40 階段展示</strong> <small>手臂、頭部與胸部動態為階段成果；表情與效能仍將持續改善。</small><a id="latest" hidden></a>'],
    ['<script type="module" src="./assembly-motion.mjs?review-runtime=v40-arm-sway-r2"></script>', '<script type="module" src="/miffy-demo/viewer-assets/assembly-motion.mjs?v=40"></script>']
  ];
  for (const [before, after] of htmlSubstitutions) {
    if (!html.includes(before)) throw new Error(`HTML template changed: ${before.slice(0, 70)}`);
    html = html.replace(before, after);
  }
  await writeFile(path.join(output, 'index.html'), html);
  console.log(JSON.stringify({task, rigPath, files: copied.size + modules.length + 1,
    assets: [...copied].sort(), output}, null, 2));
}

await main();
