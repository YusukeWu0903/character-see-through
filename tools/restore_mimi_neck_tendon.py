"""Restore source-visible neck tendon after reviewer rejected v33 over-erasure."""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import json
from build_mimi_assembly_v3 import TASK, compose, write, sha
from repair_mimi_neck_join import panel

def diagnostic():
    src=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    crop=src.crop((470,300,550,390)).resize((640,720))
    d=ImageDraw.Draw(crop)
    for x in range(470,551,10):
        d.line(((x-470)*8,0,(x-470)*8,720),fill=(0,120,0,150))
        d.text(((x-470)*8+2,2),str(x),fill='green')
    for y in range(300,391,10):
        d.line((0,(y-300)*8,640,(y-300)*8),fill=(0,120,0,150))
        d.text((2,(y-300)*8+2),str(y),fill='green')
    crop.save(TASK/'_review/assembly_v33/tendon_coordinates.png')

def build():
    dest=TASK/'_review/assembly_v34'
    if dest.exists(): raise RuntimeError('Immutable candidate exists')
    dest.mkdir()
    prior=TASK/'_review/assembly_v33'
    m=json.loads((prior/'assembly.json').read_text(encoding='utf8'))
    src=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    old=Image.open(prior/'neck.png').convert('RGBA')
    mask=Image.new('L',src.size)
    # Native coordinates measured against registered original: preserve tendon
    # down to its source-drawn fade/turn near clavicle, not the extraction U-edge.
    path=[(499,319),(505,329),(511,340),(515,351),(518,362),(519,370)]
    ImageDraw.Draw(mask).line(path,fill=255,width=11,joint='curve')
    mask=mask.filter(ImageFilter.GaussianBlur(1.8))
    sa=np.array(src); ma=np.array(mask)
    under=np.array(Image.open(TASK/'topwear.png').convert('RGBA'))
    ma[under[:,:,3]<250]=0
    patch=sa.copy();patch[:,:,3]=np.rint(sa[:,:,3].astype(float)*ma/255).astype('uint8')
    out=old.copy();out.alpha_composite(Image.fromarray(patch));out.save(dest/'neck.png')
    mask=Image.fromarray(ma);mask.save(dest/'source_tendon_mask.png')
    e=next(e for e in m['drawOrder'] if e['file']=='neck.png')
    e['asset']='_review/assembly_v34/neck.png';e['assetSha256']=sha(dest/'neck.png')
    m.pop('alphaOnlyRepairs',None)
    m['neckRepair']={'previousCandidate':'_review/assembly_v33/assembly.json','reviewerCorrection':'v33 erased source-visible tendon before clavicle','method':'Registered original pixels in narrow tendon band; no generated paint','pixelSource':'_review/assembly_v2/source_registered.png','pixelSourceSha256':sha(TASK/'_review/assembly_v2/source_registered.png'),'motionReview':'pending; neck stays torso-owned'}
    write(dest/'assembly.json',m)
    write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    result=compose(m['drawOrder']);result.save(dest/'assembled.png')
    for name,color in [('light','#f6f4f2'),('dark','#252831')]:
        bg=Image.new('RGBA',result.size,color);bg.alpha_composite(result);bg.convert('RGB').save(dest/f'assembled_{name}.png')
    prev=json.loads((prior/'assembly.json').read_text(encoding='utf8'))
    panel([('Source',src),('v33: rejected over-erasure',compose(prev['drawOrder'])),('v34: source tendon restored',result)],dest/'neck_review.png')
    a=np.array(old);b=np.array(out);changed=np.any(a!=b,axis=2);ys,xs=np.where(changed)
    assert not np.any(changed & (ma==0))
    assert np.all(under[:,:,3][changed]>=250)
    assert [e for e in m['drawOrder'] if e['file']!='neck.png']==[e for e in prev['drawOrder'] if e['file']!='neck.png']
    write(dest/'neck_qa.json',{'changedPixels':int(changed.sum()),'bounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],'outsideMaskUnchanged':True,'allOtherEntriesUnchanged':True,'originalPixelsOnly':True,'alphaIncreasedPixels':int((b[:,:,3]>a[:,:,3]).sum()),'visualAcceptance':'pending','motionAcceptance':'pending'})

if __name__=='__main__': build()
