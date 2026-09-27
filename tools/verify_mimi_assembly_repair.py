"""Verify source ownership, exact splits, canonical preservation and review masks."""
from pathlib import Path
import argparse, json, hashlib
import numpy as np
from PIL import Image, ImageDraw
parser=argparse.ArgumentParser();parser.add_argument('--version',default='v10');args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'outputs/seethrough_local/Mimi_cloud_20260927'
dest=root/('_review/assembly_'+args.version)
load=lambda p:np.asarray(Image.open(p).convert('RGBA'))
src=load(root/'_review/assembly_v2/source_registered.png')
hair=load(dest/'hair_source_union.png')
parts=[load(dest/(n+'.png')) for n in ('hair_crown','fronthair','backhair')]
assert np.array_equal(sum(p.astype('uint16') for p in parts),hair)
assert np.array_equal(hair[:,:,:3][hair[:,:,3]>0],src[:,:,:3][hair[:,:,3]>0])
arm=load(root/'handwear.png')
assert np.array_equal(load(dest/'handwear_left.png').astype('uint16')+load(dest/'handwear.png').astype('uint16'),arm)
old=json.loads((root/'_review/assembly_v2/assembly.json').read_text(encoding='utf8'))
for e in old['drawOrder']:
    assert hashlib.sha256((root/e['file']).read_bytes()).hexdigest().upper()==e['assetSha256']
sheet=Image.new('RGB',(1400,660),(240,240,240))
for i,n in enumerate(('hair_crown','fronthair','backhair','ears')):
    a=Image.open(dest/(n+'.png')).convert('RGBA').crop((340,0,695,330))
    for row,color in enumerate(((245,245,245,255),(30,34,40,255))):
        tile=Image.new('RGBA',a.size,color);tile.alpha_composite(a)
        sheet.paste(tile.convert('RGB'),(350*i,330*row))
sheet.save(dest/'hair_parts_light_dark.png')
report={'canonicalLayerHashesPreserved':17,'armsRecomposeOriginalExactly':True,
        'hairFragmentsRecomposeUnionExactly':True,'hairVisibleRgbMatchesRegisteredSourceExactly':True,
        'sourceOwnershipIsNotVisualAcceptance':True,'userReview':'pending'}
(dest/'source_ownership_qa.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
