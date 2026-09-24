// Locally blend a residual inpaint mark into intact skin on the same face row.
// Keep the alpha silhouette and every pixel outside the configured band exact.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [inputArg, configArg, outputArg] = process.argv.slice(2);
if (!inputArg || !configArg || !outputArg) {
  console.error('usage: node even_face_base.mjs face.png config.json candidate-face.png');
  process.exit(2);
}
const inputPath = resolve(inputArg), outputPath = resolve(outputArg);
if (inputPath === outputPath) throw new Error('candidate must not overwrite source');
const config = JSON.parse(readFileSync(resolve(configArg), 'utf8'));
const { width, height, centerX, top, bottom, edgeInset, strength } = config;
if (![width, height, centerX, top, bottom, edgeInset, strength].every(Number.isFinite) ||
  width < 1 || height < 1 || centerX < 0 || centerX >= width ||
  top < 0 || bottom > height || bottom <= top || edgeInset < 1 ||
  strength <= 0 || strength > 1) throw new Error('invalid retouch config');
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'json', inputPath], { encoding: 'utf8' });
if (probe.status !== 0) throw new Error(String(probe.stderr));
const size = JSON.parse(probe.stdout).streams[0];
if (size.width !== width || size.height !== height) throw new Error('input size does not match config');
const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', inputPath, '-frames:v', '1',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: width * height * 5 });
if (decoded.status !== 0) throw new Error(String(decoded.stderr));
const original = decoded.stdout;
if (original.length !== width * height * 4) throw new Error('unexpected RGBA size');
const out = Buffer.from(original);
let changed = 0, maxChannelChange = 0, bounds = [width, height, -1, -1];
for (let y = Math.ceil(top); y < Math.floor(bottom); y++) {
  let left = centerX, right = centerX;
  while (left > 0 && original[(y * width + left - 1) * 4 + 3] >= 245) left--;
  while (right + 1 < width && original[(y * width + right + 1) * 4 + 3] >= 245) right++;
  const span = right - left;
  if (span < 2 * edgeInset + 6) continue;
  const lx = left + edgeInset, rx = right - edgeInset;
  const leftRgb = [0, 1, 2].map(c => original[(y * width + lx) * 4 + c]);
  const rightRgb = [0, 1, 2].map(c => original[(y * width + rx) * 4 + c]);
  const yy = (y + 0.5 - top) / (bottom - top);
  const vertical = Math.sin(Math.PI * yy) ** 2;
  for (let x = lx + 1; x < rx; x++) {
    const xx = (x - lx) / (rx - lx);
    const weight = strength * vertical * Math.sin(Math.PI * xx) ** 2;
    const i = (y * width + x) * 4;
    if (original[i + 3] < 245) continue;
    for (let c = 0; c < 3; c++) {
      const target = leftRgb[c] * (1 - xx) + rightRgb[c] * xx;
      const value = Math.round(original[i + c] * (1 - weight) + target * weight);
      maxChannelChange = Math.max(maxChannelChange, Math.abs(value - original[i + c]));
      out[i + c] = value;
    }
    if (out[i] !== original[i] || out[i + 1] !== original[i + 1] || out[i + 2] !== original[i + 2]) {
      changed++;
      bounds = [Math.min(bounds[0], x), Math.min(bounds[1], y),
        Math.max(bounds[2], x), Math.max(bounds[3], y)];
    }
  }
}
mkdirSync(dirname(outputPath), { recursive: true });
const encoded = spawnSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
  '-video_size', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-y', outputPath],
  { input: out, maxBuffer: width * height * 5 });
if (encoded.status !== 0) throw new Error(String(encoded.stderr));
console.log(JSON.stringify({ inputPath, outputPath, changed, bounds,
  maxChannelChange, alphaUnchanged: true, sourceOnly: true }));
