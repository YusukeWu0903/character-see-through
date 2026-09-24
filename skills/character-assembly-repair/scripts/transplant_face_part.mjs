// Transfer painted pixels from a supplied high-resolution face without
// regenerating art or painting a skin-colored cover. The config holds a
// character-specific affine registration and a tight feature footprint.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [sourceArg, configArg, partName, outputArg] = process.argv.slice(2);
if (!sourceArg || !configArg || !partName || !outputArg) {
  console.error('usage: node transplant_face_part.mjs source.png registration.json part-name output.png');
  process.exit(2);
}
const sourcePath = resolve(sourceArg), outputPath = resolve(outputArg);
if (sourcePath === outputPath) throw new Error('output must not overwrite source');
const config = JSON.parse(readFileSync(resolve(configArg), 'utf8'));
const spec = config.parts?.[partName];
if (!spec) throw new Error('unknown part: ' + partName);
const [canvasWidth, canvasHeight] = config.canvas;
const { scale, translateX, translateY } = config.transform;
if (!(scale > 0 && Number.isFinite(translateX) && Number.isFinite(translateY))) {
  throw new Error('invalid registration');
}
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'json', sourcePath], { encoding: 'utf8' });
if (probe.status !== 0) throw new Error(probe.stderr || 'ffprobe failed');
const { width, height } = JSON.parse(probe.stdout).streams[0];
if (config.sourceSize[0] !== width || config.sourceSize[1] !== height) {
  throw new Error('source dimensions do not match registration');
}
const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', sourcePath, '-frames:v', '1',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: width * height * 5 });
if (decoded.status !== 0) throw new Error(String(decoded.stderr));
const src = decoded.stdout;
if (src.length !== width * height * 4) throw new Error('unexpected source RGBA size');
const out = Buffer.alloc(canvasWidth * canvasHeight * 4);
const [left, top, right, bottom] = spec.roi;
const [baselineLeft, baselineRight] = spec.baselineX;
const [cx, cy, rx, ry] = spec.ellipse;
const [low, high] = spec.difference;
if (!(left >= 0 && top >= 0 && right <= width && bottom <= height && left < right && top < bottom &&
  baselineLeft >= 0 && baselineRight < width && baselineLeft < baselineRight &&
  rx > 0 && ry > 0 && low >= 0 && high > low)) throw new Error('invalid part bounds');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function rgb(x, y) {
  x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0, ty = y - y0;
  const at = (xx, yy, c) => src[(yy * width + xx) * 4 + c];
  return [0, 1, 2].map(c =>
    (at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx) * (1 - ty) +
    (at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx) * ty);
}
function baseline(x, y) {
  const a = rgb(baselineLeft, y), b = rgb(baselineRight, y);
  const t = clamp((x - baselineLeft) / (baselineRight - baselineLeft), 0, 1);
  return a.map((v, i) => v * (1 - t) + b[i] * t);
}
function sample(x, y) {
  if (x < left || x >= right || y < top || y >= bottom) return [0, 0, 0, 0];
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
  const footprint = 1 - smooth((d - 0.72) / 0.28);
  if (!footprint) return [0, 0, 0, 0];
  const color = rgb(x, y), skin = baseline(x, y);
  const difference = Math.hypot(color[0] - skin[0], color[1] - skin[1], color[2] - skin[2]) / Math.sqrt(3);
  const alpha = smooth((difference - low) / (high - low)) * footprint;
  return [...color, alpha];
}
let visible = 0;
const minX = Math.max(0, Math.floor(left * scale + translateX) - 2);
const maxX = Math.min(canvasWidth, Math.ceil(right * scale + translateX) + 2);
const minY = Math.max(0, Math.floor(top * scale + translateY) - 2);
const maxY = Math.min(canvasHeight, Math.ceil(bottom * scale + translateY) + 2);
for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
  let alphaSum = 0, rSum = 0, gSum = 0, bSum = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const xx = (x + (sx + 0.5) / 4 - translateX) / scale;
    const yy = (y + (sy + 0.5) / 4 - translateY) / scale;
    const [r, g, b, a] = sample(xx, yy);
    alphaSum += a; rSum += r * a; gSum += g * a; bSum += b * a;
  }
  const alpha = alphaSum / 16;
  if (alpha < 1 / 255) continue;
  const i = (y * canvasWidth + x) * 4;
  out[i] = Math.round(rSum / alphaSum);
  out[i + 1] = Math.round(gSum / alphaSum);
  out[i + 2] = Math.round(bSum / alphaSum);
  out[i + 3] = Math.round(alpha * 255);
  if (out[i + 3] >= 8) visible++;
}
mkdirSync(dirname(outputPath), { recursive: true });
const encoded = spawnSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
  '-video_size', `${canvasWidth}x${canvasHeight}`, '-i', 'pipe:0', '-frames:v', '1', '-y', outputPath],
  { input: out, maxBuffer: canvasWidth * canvasHeight * 5 });
if (encoded.status !== 0) throw new Error(String(encoded.stderr));
console.log(JSON.stringify({ partName, sourcePath, outputPath, canvas: config.canvas,
  transform: config.transform, visiblePixelsAtAlpha8: visible, sourceOnly: true }));
