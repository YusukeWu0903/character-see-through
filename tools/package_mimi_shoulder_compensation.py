import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v59'
dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v58/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v59',name='Mimi shoulder bank with bounded return rebound',rollbackManifest='_review/motion_v58/rig.json')
r['shoulderCompensation']={'mode':'pointer-bank-rebound','maxPixels':4,'frequency':6,'damping':.5,
 'field':{'centerX':540,'halfWidth':120,'left':320,'right':820,'fadeX':60,'headThroughY':260,'shoulderY':350,'holdY':590,'leftY':0,'rightY':0,'gridStep':16}}
r['shoulderAcceptance']={'screenLeft':'left shoulder down/right up','screenRight':'left shoulder up/right down',
 'returnCenter':'brief opposite bank then settle','reference':'screen sides, not anatomical sides',
 'unchanged':'v58 body/hip follow, local chest configuration, assembly, fixed feet',
 'scope':'continuous shared upper-body field, not independent layer translations','visualAcceptance':'pending',
 'baselineVerdict':'v58 body follow acceptable per user; retained as rollback'}
write(dest/'rig.json',r)
