import json
from build_mimi_assembly_v3 import TASK,write

dest=TASK/'_review/motion_v58'
dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v57/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v58',name='Mimi A visible slow follow with larger hip travel',rollbackManifest='_review/motion_v57/rig.json')
r['pointerFollow']['coordination'].update(bodyRate=3,bodyGain=.75,torsoGain=.12,torsoRate=3.5,headRate=3)
r['followAcceptance'].update(range='pointer-only native travel: head9.30, shoulder10.11, hip12.00px each sign',
    scope='body/hip pointer follow only; local chest config and legacy pointer signal unchanged',
    screenLeft='body/hip left; hip12px, upper body about10px; delayed torso and opposite small head contribution',
    screenRight='body/hip right; hip12px, upper body about10px; delayed torso and opposite small head contribution',
    priorVerdict='v57 rejected by user: imperceptible range and stiff jitter',
    groundContact='unchanged shared stance bands, fixed y1047 and below')
write(dest/'rig.json',r)
