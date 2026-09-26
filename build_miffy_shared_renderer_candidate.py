from pathlib import Path
import json,hashlib
task=Path('outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138')
parent=task/'_review/motion_v45/rig.json'
dest=task/'_review/motion_v48';dest.mkdir(exist_ok=True)
rig={'schemaVersion':1,'task':task.name,'candidate':'motion_v48',
     'name':'Miffy shared WebGL field migration stage 1 · non-production',
     'reviewStatus':'pending','nonProduction':True,
     'extends':'_review/motion_v45/rig.json',
     'extendsSha256':hashlib.sha256(parent.read_bytes()).hexdigest().upper(),
     'rollbackManifest':'_review/motion_v45/rig.json',
     'renderer':{'mode':'shared-webgl-scene-stage1','module':'mesh-renderer.mjs',
                 'nativeTextureSize':1280,'migrated':['stance','hip','arms','hair','neck','pitch-follow','bust'],
                 'remaining':['head-surface-and-light','final-canvas-presentation']}}
(dest/'rig.json').write_text(json.dumps(rig,ensure_ascii=False,indent=2),encoding='utf-8')
print(dest/'rig.json')
