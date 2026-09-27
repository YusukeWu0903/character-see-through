"""Remove unnecessary face depth partition; retain independent shadow."""
import json
import numpy as np
from PIL import Image
from build_mimi_assembly_v3 import TASK,sha,write,compose

dest=TASK/'_review/assembly_v51';dest.mkdir(exist_ok=False)
m=json.loads((TASK/'_review/assembly_v50/assembly.json').read_text(encoding='utf8'))
face_entries=[e for e in m['drawOrder'] if e['file'] in ('face_far.png','face.png')]
parts=[np.array(Image.open(TASK/e['asset']).convert('RGBA')) for e in face_entries]
assert not np.any((parts[0][:,:,3]>0)&(parts[1][:,:,3]>0))
union=np.zeros_like(parts[0])
for a in parts:union[a[:,:,3]>0]=a[a[:,:,3]>0]
Image.fromarray(union).save(dest/'face.png')
prior=compose(m['drawOrder'])
m['drawOrder']=[e for e in m['drawOrder'] if e['file']!='face_far.png']
e=next(e for e in m['drawOrder'] if e['file']=='face.png')
e.update(asset='_review/assembly_v51/face.png',assetSha256=sha(dest/'face.png'),label='完整臉／不作深度切片')
m['derivedLayers']=[e for e in m['derivedLayers'] if e['file']!='face_far.png']
m['constraints']=[e for e in m['constraints'] if 'face_far.png' not in (e['behind'],e['inFrontOf'])]
shadow=next(e for e in m['drawOrder'] if e['file']=='front_hair_shadow.png')
shadow['linkedShadow']['receivers']=['face']
m['shadowOwnership']['receivers']=['face']
m['shadowOwnership']['motionIntegration']='shared head field only; independent owner clipping unchanged'
m['rollback']='_review/assembly_v50/assembly.json'
m['facePartitionRemoval']={'method':'exact visible RGBA disjoint union of v50 face fragments',
    'sourceAssets':[e['asset'] for e in face_entries],'noRepainting':True,
    'depthRole':'reference only; no runtime face partition','visualAcceptance':'pending'}
m['specification']['face']['runtimePartitionEnabled']=False
m['occlusion']='Single complete face behind independent features and hair shadow; hair fragments unchanged.'
write(dest/'assembly.json',m)
write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
result=compose(m['drawOrder']);delta=np.abs(np.array(result).astype(int)-np.array(prior).astype(int))
assert delta.max()==0
result.save(dest/'assembled.png')
for col,name in [('#f6f4f2','light'),('#252831','dark')]:
    bg=Image.new('RGBA',result.size,col);bg.alpha_composite(result);bg.convert('RGB').save(dest/f'assembled_{name}.png')
compose([e for e in m['drawOrder'] if e['file']!='front_hair_shadow.png']).save(dest/'shadow_off.png')
write(dest/'merge_qa.json',{'neutralRgbaMaxDifference':int(delta.max()),'noFaceFar':True,
    'shadowAssetUnchanged':True,'otherRasterAssetsUnchanged':True,'visualAcceptance':'pending'})
r=json.loads((TASK/'_review/motion_v50/rig.json').read_text(encoding='utf8'))
motion=TASK/'_review/motion_v51';motion.mkdir(exist_ok=False)
r.update(candidate='motion_v51',name='Mimi single FACE — depth seam repair review',
    assembly='_review/assembly_v51/assembly.json',assemblySha256=sha(dest/'assembly.json'),
    layerCount=len(m['drawOrder']),rollbackManifest='_review/motion_v50/rig.json')
r['bindings'].pop('face_far')
r['limits']=[s.replace('Latest v50 assembly','Latest v51 single-face assembly') for s in r['limits']]
r['limits'].append('face_far removed by user request; full FACE sampled once; other controls unchanged.')
write(motion/'rig.json',r)
