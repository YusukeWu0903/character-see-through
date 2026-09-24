// Deterministic, non-generative alpha cleanup for a small extracted feature.
// It removes only dark pixels next to the existing alpha silhouette; it never
// paints replacement skin or changes the original RGB values.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [inputArg, outputArg, radiusArg = '2', modeArg = 'edge'] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('usage: node attenuate_outline.mjs input.png output.png [radius=2] [edge|all-dark]');
  process.exit(2);
}
const input = resolve(inputArg), output = resolve(outputArg);
const radius = Number(radiusArg);
if (input === output || !Number.isInteger(radius) || radius < 1 || radius > 3) {
  throw new Error('input and output must differ; radius must be 1..3');
}
if (!['edge', 'all-dark'].includes(modeArg)) throw new Error('mode must be edge or all-dark');
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'json', input], { encoding: 'utf8' });
if (probe.status !== 0) throw new Error(probe.stderr || 'ffprobe failed');
const { width, height } = JSON.parse(probe.stdout).streams[0];
const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', input, '-frames:v', '1',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: width * height * 5 });
if (decoded.status !== 0) throw new Error(String(decoded.stderr));
const src = decoded.stdout, dst = Buffer.from(src);
if (src.length !== width * height * 4) throw new Error('unexpected RGBA byte count');

const hasOutside = (x, y, distance) => {
  for (let dy = -distance; dy <= distance; dy++) {
    for (let dx = -distance; dx <= distance; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) return true;
      if (src[(yy * width + xx) * 4 + 3] < 8) return true;
    }
  }
  return false;
};

let changed = 0, removed = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, alpha = src[i + 3];
    if (alpha === 0) continue;
    if (alpha < 8) { dst[i + 3] = 0; changed++; removed++; continue; }
    const luma = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
    // Light highlights and skin-like fill stay intact; only dark contour
    // pixels near transparency can be attenuated.
    const darkness = modeArg === 'all-dark'
      ? Math.max(0, Math.min(1, (210 - luma) / 35))
      : Math.max(0, Math.min(1, (200 - luma) / 30));
    if (!darkness) continue;
    let edgeWeight = modeArg === 'all-dark' ? 1 : 0;
    if (modeArg === 'edge') {
      for (let d = 1; d <= radius; d++) {
        if (hasOutside(x, y, d)) { edgeWeight = d === 1 ? 1 : d === 2 ? 0.58 : 0.25; break; }
      }
    }
    if (!edgeWeight) continue;
    const nextAlpha = Math.round(alpha * (1 - darkness * edgeWeight));
    if (nextAlpha !== alpha) {
      dst[i + 3] = nextAlpha; changed++;
      if (nextAlpha === 0) removed++;
    }
  }
}
mkdirSync(dirname(output), { recursive: true });
const encoded = spawnSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
  '-video_size', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-y', output],
  { input: dst, maxBuffer: width * height * 5 });
if (encoded.status !== 0) throw new Error(String(encoded.stderr));
console.log(JSON.stringify({ input, output, width, height, radius, mode: modeArg, changed, removed,
  rgbPreserved: true, method: 'dark-pixel alpha attenuation' }));
