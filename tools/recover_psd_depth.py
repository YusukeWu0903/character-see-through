"""Isolated depth-only inference from original PSD; never regenerate artwork."""
import argparse
import hashlib
import json
import os
import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]
TAGS = {'topwear', 'legwear', 'handwear', 'back hair', 'footwear', 'earwear',
        'neck', 'bottomwear', 'eyebrow', 'ears', 'face', 'nose', 'mouth',
        'eyelash', 'eyewhite', 'irides', 'front hair'}
ALIASES = {'backhair': 'back hair', 'fronthair': 'front hair'}

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')

def prepare(psd_path, source_path, out):
    out.mkdir(parents=True, exist_ok=False)
    saved = out / 'input'
    saved.mkdir()
    psd = PSDImage.open(psd_path)
    if psd.size != (1280, 1280):
        raise ValueError('This initial route requires a native 1280 square PSD')
    records = []
    seen = set()
    for layer in psd.descendants():
        if layer.is_group():
            raise ValueError('Grouped PSD requires explicit mapping')
        tag = ALIASES.get(layer.name, layer.name)
        if tag not in TAGS or tag in seen:
            raise ValueError(f'Unknown or duplicate layer: {layer.name}')
        seen.add(tag)
        im = layer.composite()
        if im is None:
            raise ValueError(f'Unrenderable layer: {tag}')
        full = Image.new('RGBA', psd.size)
        full.alpha_composite(im.convert('RGBA'), layer.offset)
        path = saved / f'{tag}.png'
        full.save(path)
        records.append({'tag': tag, 'sha256': sha(path), 'bounds': full.getbbox(),
                        'offset': list(layer.offset)})
    source = Image.open(source_path).convert('RGBA')
    scale = min(1280 / source.width, 1280 / source.height)
    size = (round(source.width * scale), round(source.height * scale))
    offset = ((1280 - size[0]) // 2, (1280 - size[1]) // 2)
    registered = Image.new('RGBA', psd.size)
    registered.alpha_composite(source.resize(size, Image.Resampling.LANCZOS), offset)
    registered.save(saved / 'src_img.png')
    write(out / 'provenance.json', {
        'status': 'prepared-experimental', 'psd': str(psd_path), 'psdSha256': sha(psd_path),
        'illustration': str(source_path), 'illustrationSha256': sha(source_path),
        'sourceRegisteredSha256': sha(saved / 'src_img.png'), 'canvas': list(psd.size),
        'registration': {'scale': scale, 'resized': size, 'offset': offset},
        'layers': records, 'excluded': ['separately supplied ground shadow'],
        'limits': ['Not cloud-run depth recovery; fresh depth inference.',
                   'Front/back hair share combined-hair inference; ownership is not certified.']})
    print(json.dumps({'prepared': str(out), 'parts': len(records), 'registration': [size, offset]}), flush=True)

def validate(out):
    saved = out / 'input'
    prov = json.loads((out / 'provenance.json').read_text(encoding='utf8'))
    source_unchanged = sha(prov['psd']).lower() == prov['psdSha256'].lower() and sha(prov['illustration']).lower() == prov['illustrationSha256'].lower()
    sheet = Image.new('RGB', (4 * 320, 4 * 350), '#242830')
    draw = ImageDraw.Draw(sheet)
    stats = []
    for index, rec in enumerate(prov['layers']):
        tag = rec['tag']
        part = np.asarray(Image.open(saved / f'{tag}.png').convert('RGBA'))
        depth_path = saved / f'{tag}_depth.png'
        depth = np.asarray(Image.open(depth_path).convert('L'))
        mask = part[..., 3] > 15
        values = depth[mask]
        item = {'tag': tag, 'canvasMatches': depth.shape == part.shape[:2],
                'inputUnchanged': sha(saved / f'{tag}.png').lower() == rec['sha256'].lower(),
                'min': int(values.min()), 'max': int(values.max()),
                'median': float(np.median(values)), 'unique': int(len(np.unique(values))),
                'depthSha256': sha(depth_path)}
        stats.append(item)
        # False-color display only. PNG depth values remain untouched.
        t = depth.astype(np.float32) / 255
        color = np.stack([255*(1-t), 210*(1-t)**2, 60+150*t], axis=-1).astype(np.uint8)
        color[~mask] = (36, 40, 48)
        tile = Image.fromarray(color).resize((320, 320))
        xy = ((index % 4)*320, (index // 4)*350)
        sheet.paste(tile, (xy[0], xy[1]+25))
        draw.text(xy, f'{tag}: {item["min"]}-{item["max"]}', fill='white')
    sheet.save(out / 'depth_contact_sheet.png')
    registered_unchanged = sha(saved/'src_img.png').lower() == prov['sourceRegisteredSha256'].lower()
    passed = source_unchanged and registered_unchanged and all(s['canvasMatches'] and s['inputUnchanged'] and s['unique'] > 1 for s in stats)
    write(out / 'depth_qa.json', {'mechanicalPass': passed, 'sourceUnchanged': source_unchanged,
          'registeredSourceUnchanged': registered_unchanged,
          'parts': stats, 'visualAcceptance': 'pending', 'ownershipAcceptance': 'not established'})
    if not passed:
        raise ValueError('Depth validation failed')
    print(json.dumps({'mechanicalPass': passed, 'parts': len(stats)}), flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--psd', type=Path)
    ap.add_argument('--source', type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--upstream', type=Path)
    ap.add_argument('--prepare-only', action='store_true')
    ap.add_argument('--infer', action='store_true')
    ap.add_argument('--validate-only', action='store_true')
    args = ap.parse_args()
    out = args.out.resolve()
    if not out.is_relative_to(ROOT):
        raise ValueError('Outputs must stay inside repository')
    if args.prepare_only:
        prepare(args.psd.resolve(), args.source.resolve(), out)
        return
    if args.validate_only:
        validate(out)
        return
    if not args.infer or not args.upstream:
        ap.error('Use --prepare-only or --infer --upstream or --validate-only')
    if list((out/'input').glob('*_depth.png')):
        raise ValueError('Refuse to overwrite existing depth')
    upstream = args.upstream.resolve()
    os.environ['HF_HOME'] = str(upstream / 'models_hf')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    sys.path.insert(0, str(upstream / 'common'))
    sys.path.insert(0, str(upstream))
    baseline = json.loads((ROOT/'viewer/quality-baseline.json').read_text())['production']['inference']
    write(out/'run_config.json', {'upstream': str(upstream),
        'implementationSha256': sha(upstream/'common/utils/inference_utils.py'),
        'model': '24yearsold/seethroughv0.0.1_marigold', 'seed': 42,
        'depthResolution': baseline['depthResolution'], 'depthSteps': 'model-default (-1)',
        'layerdiffBaselineStepsNotUsed': baseline['steps'],
        'groupOffload': True, 'layerGeneration': False})
    try:
        from utils.inference_utils import apply_marigold
        print('Starting cached Marigold depth-only inference', flush=True)
        apply_marigold(str(out/'input.png'), '24yearsold/seethroughv0.0.1_marigold',
             num_inference_steps=-1, seed=42, save_dir=str(out),
             resolution=baseline['depthResolution'], group_offload=True, disable_progressbar=True)
        validate(out)
    except Exception:
        (out/'failure.txt').write_text(traceback.format_exc(), encoding='utf8')
        raise

if __name__ == '__main__':
    main()
