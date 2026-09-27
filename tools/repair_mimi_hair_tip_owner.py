"""Move complete task-local visible hair fragments, never repaint their pixels."""
import json,cv2
import numpy as np
from PIL import Image
from build_mimi_assembly_v3 import TASK,sha,write,compose
dest=TASK/'_review/assembly_v52';dest.mkdir(exist_ok=False)
m=json.loads((TASK/'_review/assembly_v51/assembly.json').read_text(encoding='utf8'))
entries={e['file']:e for e in m['drawOrder']}
front=np.array(Image.open(TASK/entries['fronthair.png']['asset']).convert('RGBA'))
back=np.array(Image.open(TASK/entries['backhair.png']['asset']).convert('RGBA'))
_,labels,stats,_=cv2.connectedComponentsWithStats((back[:,:,3]>0).astype('uint8'),8)
# Whole separated visible lower-left fragments, not a rectangular cut through hair.
ids=[21,29,35,39]
move=np.isin(labels,ids)
assert not np.any((front[:,:,3]>0)&move)
old_union=front.astype('uint16')+back.astype('uint16')
front[move]=back[move];back[move]=0
assert np.array_equal(front.astype('uint16')+back.astype('uint16'),old_union)
prior=compose(m['drawOrder'])
for name,a in [('fronthair',front),('backhair',back)]:
    Image.fromarray(a).save(dest/(name+'.png'))
    entries[name+'.png'].update(asset='_review/assembly_v52/'+name+'.png',assetSha256=sha(dest/(name+'.png')))
result=compose(m['drawOrder'])
delta=np.abs(np.array(result).astype(int)-np.array(prior).astype(int))
assert delta.max()==0,'Ownership transfer changes visible occlusion; candidate rejected'
m['rollback']='_review/assembly_v51/assembly.json'
m['hairTipOwnerRepair']={'method':'whole disconnected rear fragments moved to front owner',
    'componentStats':[stats[i].tolist() for i in ids],'pixelsMoved':int(move.sum()),
    'unionExact':True,'neutralRgbaMaxDifference':0,'noRepainting':True,'visualAcceptance':'pending'}
write(dest/'assembly.json',m);write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
result.save(dest/'assembled.png')
for colour,name in [('#252831','dark'),('#f6f4f2','light')]:
    bg=Image.new('RGBA',result.size,colour);bg.alpha_composite(result);bg.convert('RGB').save(dest/f'assembled_{name}.png')
write(dest/'ownership_qa.json',m['hairTipOwnerRepair'])
r=json.loads((TASK/'_review/motion_v51/rig.json').read_text(encoding='utf8'))
motion=TASK/'_review/motion_v52';motion.mkdir(exist_ok=False)
r.update(candidate='motion_v52',name='Mimi complete lower-left hair strand review',assembly='_review/assembly_v52/assembly.json',assemblySha256=sha(dest/'assembly.json'),rollbackManifest='_review/motion_v51/rig.json')
write(motion/'rig.json',r)
