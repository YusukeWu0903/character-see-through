"""Extend the task-local right lower breast footprint; no dynamics change."""
import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v54';dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v53/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v54',name='Mimi complete right lower-bust range review',rollbackManifest='_review/motion_v53/rig.json')
r['bustField'].update(centers=[[495,510],[625,510]],radiusX=90)
# Left support stays405; right support now715 rather than635.
r['rangeReview'].update(supportBounds=[405,370,715,600],
    reviewerCorrection='v53 cut across right breast; right support extended80px',visualAcceptance='pending')
write(dest/'rig.json',r)
