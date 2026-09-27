import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v60'
dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v59/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v60',name='Mimi identical shoulder geometry with shared GPU buffers',rollbackManifest='_review/motion_v59/rig.json')
r['renderer']['reuseSharedGeometry']=True
r['performanceRepair']={'mode':'per-scene-coordinate-and-GPU-buffer-reuse','motionAndTopologyUnchanged':True,
 'reviewStatus':'pending','comparison':'motion_v59','remainingCPU':'point evaluation once per mapping/topology group; spring integration',
 'remainingCopy':'one native GPU-to-Canvas presentation copy per scene'}
write(dest/'rig.json',r)
