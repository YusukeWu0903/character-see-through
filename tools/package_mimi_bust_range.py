"""Range-only chest influence review; leave amplitude and springs untouched."""
import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v53';dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v52/rig.json').read_text(encoding='utf8'))
old=r['bustField'].copy()
r.update(candidate='motion_v53',name='Mimi lower-bust influence range only',rollbackManifest='_review/motion_v52/rig.json')
r['bustField'].update(centerY=510,centers=[[480,510],[560,510]],radiusX=75,radiusY=140,lowerRadiusY=90)
r['rangeReview']={'scope':'geometry only; no increased amplitude or bilateral phase',
    'supportBounds':[405,370,635,600], 'upperChest':'smooth zero taper near y370',
    'peakWeightY':510,'owner':'topwear','priorField':old,'visualAcceptance':'pending'}
write(dest/'rig.json',r)
