import json
from build_mimi_assembly_v3 import TASK,write

dest=TASK/'_review/motion_v57'
dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v56/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v57',name='Mimi A soft coordinated body follow',rollbackManifest='_review/motion_v56/rig.json')
r['pointerFollow']['coordination']={'mode':'soft-weight-follow','torsoRate':4.5,'headRate':3.5,'headGain':-0.03}
r['followAcceptance']={
    'scope':'body follow only; local chest driver/configuration unchanged',
    'screenLeft':'body left, torso follows later, small head counter-shift',
    'screenRight':'body right, torso follows later, small head counter-shift',
    'center':'all pointer contributions settle to zero',
    'groundContact':'same shared field, fixed below y1047',
    'range':'no gain increase, no new rotation or hidden art',
    'checks':['left/center/right','rapid reversal','pointer leave','follow off','pause','reset','idle plus follow'],
    'visualAcceptance':'pending'}
write(dest/'rig.json',r)
