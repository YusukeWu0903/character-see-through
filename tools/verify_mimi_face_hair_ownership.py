"""Check the user's ear/rear-hair/shadow ownership contract, not visual acceptance."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from build_mimi_assembly_v3 import TASK,write
parser=argparse.ArgumentParser();parser.add_argument('--version',default='v16');args=parser.parse_args()
dest=TASK/('_review/assembly_'+args.version);prev=TASK/'_review/assembly_v11'
load=lambda p:np.asarray(Image.open(p).convert('RGBA'))
ears=load(dest/'ears.png');old=load(prev/'ears.png')
assert not np.any(ears[:,:550,3])
assert np.array_equal(ears[:,550:],old[:,550:])
face=load(dest/'face.png');base=load(TASK/'face.png')
assert np.array_equal(face[:,:,3],base[:,:,3])
diff=np.any(face[:,:,:3]!=base[:,:,:3],axis=2);ys,xs=np.where(diff)
assert ys.min()>=125 and ys.max()<240 and xs.min()>=420 and xs.max()<510
shadow=load(dest/'front_hair_shadow_alpha.png')
assert shadow[:,:,3].max()<=46 and shadow[:,:,3].max()>0
assert not np.any((shadow[:,:,3]>0)&(base[:,:,3]<245))
merged=Image.open(dest/'front_hair_shadow_alpha.png').convert('RGBA')
merged.alpha_composite(Image.open(dest/'front_hair_paint.png').convert('RGBA'))
assert np.array_equal(np.asarray(merged),load(dest/'fronthair.png'))
rear=load(dest/'hair_back_left.png');src=load(TASK/'_review/assembly_v2/source_registered.png')
assert np.array_equal(rear[:,:,:3][rear[:,:,3]>0],src[:,:,:3][rear[:,:,3]>0])
m=json.loads((dest/'assembly.json').read_text(encoding='utf8'))
slots=[e['file'] for e in m['drawOrder']]
assert slots.index('hair_back_left.png')<slots.index('face.png')
assert not any('shadow' in e['file'] and e['file']!='shadow.png' for e in m['drawOrder'])
assert next(e for e in m['drawOrder'] if e['file']=='fronthair.png')['parent']=='frontHair'
original=json.loads((TASK/'_review/assembly_v2/assembly.json').read_text(encoding='utf8'))
for e in original['drawOrder']:assert hashlib.sha256((TASK/e['file']).read_bytes()).hexdigest().upper()==e['assetSha256']
report={'inventedEarRemoved':True,'visibleEarUnchangedVsV11':True,'headAlphaUnchanged':True,
        'rearHairRgbOriginalSource':True,'rearHairBehindFace':True,'shadowPackedIntoFrontHairExactly':True,
        'shadowAlphaMax':int(shadow[:,:,3].max()),'changedHeadRgbPixels':int(diff.sum()),
        'original17AssetHashesUnchanged':True,'wholeHairMotionAccepted':False,'userAcceptance':'pending'}
write(dest/'ownership_contract_qa.json',report);print(json.dumps(report,indent=2))
