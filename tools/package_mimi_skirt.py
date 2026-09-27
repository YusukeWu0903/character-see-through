import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v62'
dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v61/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v62',name='Mimi anchored skirt follow-through A',rollbackManifest='_review/motion_v61/rig.json')
r['skirtSway']={'mode':'anchored-horizontal-lag','anchorY':480,'hemY':620,'frequency':4.5,'damping':.55,'gainPixels':10,'maxPixels':8}
r['skirtAcceptance']={'owner':'bottomwear','choice':'A','waist':'local zero through y480; existing shared body follow retained','left':'body left; hem initially lags right, then catches up','right':'mirrored','return':'small follow-through then settle','verticalOffset':0,'sourceArtUnchanged':True,'visualAcceptance':'pending'}
write(dest/'rig.json',r)
