"""Reopen the assembled PSD and compare its layer pixels/order to candidate PNGs."""
from pathlib import Path
import json
import argparse
import numpy as np
from PIL import Image
from psd_tools import PSDImage
root=Path(__file__).resolve().parents[1]/'outputs/seethrough_local/Mimi_cloud_20260927'
parser=argparse.ArgumentParser();parser.add_argument('--version',default='v2');args=parser.parse_args()
dest=root/('_review/assembly_'+args.version)
manifest=json.loads((dest/'assembly.json').read_text(encoding='utf8'))
psd=PSDImage.open(dest/'Mimi_assembled_clean.psd')
assert psd.size==(1280,1280)
assert [l.name for l in psd]==[e['name'] for e in manifest['drawOrder']]
diffs=[]
for layer,e in zip(psd,manifest['drawOrder']):
    full=Image.new('RGBA',psd.size);full.paste(layer.topil().convert('RGBA'),layer.offset)
    a=np.asarray(full);b=np.asarray(Image.open(root/e.get('asset',e['file'])).convert('RGBA'))
    # Transparent RGB is not visible artwork; alpha and visible RGB must match.
    assert np.array_equal(a[:,:,3],b[:,:,3]),e['file']
    assert np.array_equal(a[:,:,:3][b[:,:,3]>0],b[:,:,:3][b[:,:,3]>0]),e['file']
    diffs.append({'file':e['file'],'visiblePixelDifferences':0,'alphaDifferences':0})
report={'size':list(psd.size),'layerCount':len(psd),'orderMatches':True,'layers':diffs}
(dest/'psd_roundtrip_qa.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(f'PASS: assembled PSD reopens with all {len(psd)} layers, identical visible RGB/alpha and draw order')
