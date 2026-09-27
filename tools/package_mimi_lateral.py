import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v55';dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v54/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v55',name='Mimi clothed lateral inertia only',rollbackManifest='_review/motion_v54/rig.json')
r['bustField'].update(separateLobes=True,horizontalOnly=True)
r['limits'].append('Horizontal inertia only, no vertical local motion or inward squeeze; separate non-additive weights, leading side1/trailing0.7.')
write(dest/'rig.json',r)
