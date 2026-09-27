import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v61'
dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v60/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v61',name='Mimi identical shoulder geometry with CPU coordinate reuse',rollbackManifest='_review/motion_v59/rig.json')
r['renderer']['reuseGpuBuffers']=False
r['performanceRepair'].update(mode='per-scene-coordinate-reuse-original-GPU-upload-order',trial='_review/motion_v60/rig.json',
 reason='GPU-buffer trial changes a few rendered channels by1-2 levels despite identical uploaded Float32 data')
write(dest/'rig.json',r)
