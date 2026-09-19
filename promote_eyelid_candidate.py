"""Promote a user-reviewed candidate via an atomic manifest switch."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
from PIL import Image


def promote(task, candidate, approval):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', candidate) or not approval.strip():
        raise ValueError('A safe candidate name and explicit approval record are required')
    task = Path(task).resolve()
    source = task / '_rig_candidates' / candidate
    report = json.loads((source / 'report.json').read_text(encoding='utf-8'))
    if report.get('schemaVersion') != 3 or report.get('source') != 'hairless_head_artwork':
        raise ValueError('Only hairless-head candidates may be promoted')
    for name, expected in report['sourceLayers'].items():
        if not re.fullmatch(r'[A-Za-z0-9_-]+', name):
            raise ValueError('Invalid source layer name')
        if hashlib.sha256((task / (name + '.png')).read_bytes()).hexdigest() != expected:
            raise ValueError('Source layers changed since review: ' + name)
    active = task / '_rig_assets' / 'eye_assets.json'
    manifest = json.loads(active.read_text(encoding='utf-8'))
    for side in ('left', 'right'):
        path = source / f'eyelid_closed_{side}.png'
        with Image.open(path) as im:
            if im.mode != 'RGBA' or list(im.size) != manifest['canvas'] or not im.getchannel('A').getbbox():
                raise ValueError('Invalid candidate RGBA: ' + side)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    version = candidate + '_' + stamp
    destination = active.parent / version
    destination.mkdir()
    for side in ('left', 'right'):
        name = f'eyelid_closed_{side}.png'
        shutil.copy2(source / name, destination / name)
    promoted = dict(report)
    promoted.update(assetDirectory=version, visualReview={'status':'passed',
        'reviewer':'user', 'approval':approval, 'acceptedAt':stamp},
        knownLimitations=['Intermediate blink frames use crossfade and can show ghosting.'])
    promoted['assetSha256'] = {p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in destination.glob('*.png')}
    (destination / 'report.json').write_text(json.dumps(promoted, indent=2, ensure_ascii=False), encoding='utf-8')
    backup = active.parent / ('eye_assets.before_' + stamp + '.json')
    shutil.copy2(active, backup)
    manifest['closedEyelids'] = promoted
    pending = active.with_name('eye_assets.' + stamp + '.tmp')
    pending.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    pending.replace(active)
    return {'active':str(active), 'assets':str(destination), 'rollbackManifest':str(backup)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('task', type=Path)
    parser.add_argument('candidate')
    parser.add_argument('--approval', required=True)
    args = parser.parse_args()
    print(json.dumps(promote(args.task,args.candidate,args.approval), indent=2))
