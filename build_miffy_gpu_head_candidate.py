from pathlib import Path
import json, hashlib
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--presentation', choices=['direct-webgl', 'canvas-copy'], default='direct-webgl')
args = parser.parse_args()
candidate = 'motion_v49' if args.presentation == 'direct-webgl' else 'motion_v50'

task = Path('outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138')
parent = task / '_review/motion_v48/rig.json'
dest = task / ('_review/' + candidate)
dest.mkdir(exist_ok=True)
rig = {'schemaVersion': 1, 'task': task.name, 'candidate': candidate,
       'name': 'Miffy shared GPU head · non-production · ' + args.presentation,
       'reviewStatus': 'pending', 'nonProduction': True,
       'extends': '_review/motion_v48/rig.json',
       'extendsSha256': hashlib.sha256(parent.read_bytes()).hexdigest().upper(),
       'rollbackManifest': '_review/motion_v48/rig.json',
       'renderer': {'mode': 'shared-webgl-scene-stage2', 'module': 'mesh-renderer.mjs',
                    'nativeTextureSize': 1280, 'gpuHead': True, 'presentation': args.presentation,
                    'migrated': ['stance', 'hip', 'arms', 'hair', 'neck', 'pitch-follow', 'bust',
                                 'head-surface', 'head-light'],
                    'remaining': [] if args.presentation == 'direct-webgl' else ['single-final-canvas-copy']}}
rig['renderer']['sourceSha256'] = {
    name: hashlib.sha256((Path('viewer') / name).read_bytes()).hexdigest().upper()
    for name in ['mesh-renderer.mjs', 'shared-field-adapter.mjs', 'assembly-motion.mjs',
                 'head-surface-warp.mjs', 'head-lighting.mjs']
}
(dest / 'rig.json').write_text(json.dumps(rig, ensure_ascii=False, indent=2), encoding='utf-8')
print(dest / 'rig.json')
