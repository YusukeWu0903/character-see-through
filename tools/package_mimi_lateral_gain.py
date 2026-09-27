import json
from build_mimi_assembly_v3 import TASK,write
dest=TASK/'_review/motion_v56';dest.mkdir(exist_ok=False)
r=json.loads((TASK/'_review/motion_v55/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v56',name='Mimi lateral 50 equals prior100',rollbackManifest='_review/motion_v55/rig.json')
r['bustField']['horizontalGain']=2
r['strengthContract']={'new50EqualsOld100':True,'defaultStrength':50,'geometryAndSpringsUnchanged':True,'maximumHorizontalDriverPixels':24,'visualAcceptance':'pending'}
write(dest/'rig.json',r)
