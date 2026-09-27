"""Immutable Mimi neck-order diagnosis and source-owned seam candidate."""
import json
import numpy as np
import cv2
from pathlib import Path
from PIL import Image, ImageDraw
from build_mimi_assembly_v3 import TASK, compose, sha, write

DEST = TASK / '_review/assembly_v32'
BOX = (425, 270, 640, 405)

def panel(images, path):
    out = Image.new('RGB', (len(images)*645, 435), 'white')
    draw = ImageDraw.Draw(out)
    for i, (label, im) in enumerate(images):
        bg = Image.new('RGBA', im.size, '#dedede')
        bg.alpha_composite(im)
        out.paste(bg.convert('RGB').crop(BOX).resize((645,405)), (i*645,30))
        draw.text((i*645+10,8),label, fill='black')
    out.save(path)

def main():
    if DEST.exists():
        raise RuntimeError('Immutable candidate exists')
    DEST.mkdir()
    m=json.loads((TASK/'_review/assembly_v31/assembly.json').read_text(encoding='utf8'))
    old=m['drawOrder']
    order=[e.copy() for e in old if e['file']!='neck.png']
    neck=next(e.copy() for e in old if e['file']=='neck.png')
    order.insert(next(i for i,e in enumerate(order) if e['file']=='topwear.png')+1,neck)
    source=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    panel([('Source',source),('v31',compose(old)),('Neck above topwear',compose(order))],DEST/'order_diagnosis.png')
    panel([('neck solo',Image.open(TASK/'neck.png').convert('RGBA')),('topwear solo',Image.open(TASK/'topwear.png').convert('RGBA')),('pair corrected',compose([e for e in order if e['file'] in ['neck.png','topwear.png']]))],DEST/'owner_diagnosis.png')
    write(DEST/'order_only.json',m|{'drawOrder':order})

if __name__=='__main__': main()

def repair():
    dest=TASK/'_review/assembly_v33'
    if dest.exists(): raise RuntimeError('Immutable candidate exists')
    dest.mkdir()
    m=json.loads((DEST/'order_only.json').read_text(encoding='utf8'))
    a=np.array(Image.open(TASK/'neck.png').convert('RGBA'))
    under=np.array(Image.open(TASK/'topwear.png').convert('RGBA'))
    yy,xx=np.indices(a.shape[:2])
    distance=cv2.distanceTransform((a[:,:,3]>127).astype('uint8'),cv2.DIST_L2,5)
    # Task-specific lower join only: preserve the source-like left neck tendon.
    lower=np.clip((yy-326)/12,0,1)
    right=np.clip((xx-545)/10,0,1)*np.clip((yy-290)/15,0,1)
    support=np.maximum(lower,right)*(under[:,:,3]>=250)
    fade=np.clip((distance-2)/12,0,1)
    factor=1-support*(1-fade)
    b=a.copy(); b[:,:,3]=np.rint(a[:,:,3]*factor).astype('uint8')
    Image.fromarray(b).save(dest/'neck.png')
    e=next(e for e in m['drawOrder'] if e['file']=='neck.png')
    e['asset']='_review/assembly_v33/neck.png';e['assetSha256']=sha(dest/'neck.png')
    m['reviewStatus']='pending';m['nonProduction']=True
    m['constraints'].append({'behind':'topwear.png','inFrontOf':'neck.png','reason':'User requested neck above upper clothing/chest'})
    m['alphaOnlyRepairs']=[{'file':'neck.png','underlay':'topwear.png','allowedBounds':[502,291,575,368],'minUnderlayAlpha':250}]
    m['neckRepair']={'previousCandidate':'_review/assembly_v31/assembly.json','orderOnly':'_review/assembly_v32/order_only.json','method':'Lower/right cut-edge alpha attenuation over opaque topwear; unchanged RGB','motionReview':'Not yet rigged or visually accepted'}
    write(dest/'assembly.json',m)
    write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    result=compose(m['drawOrder']);result.save(dest/'assembled.png')
    for name,color in [('light','#f6f4f2'),('dark','#252831')]:
        bg=Image.new('RGBA',result.size,color);bg.alpha_composite(result);bg.convert('RGB').save(dest/f'assembled_{name}.png')
    source=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    before=compose(json.loads((DEST/'order_only.json').read_text(encoding='utf8'))['drawOrder'])
    panel([('Source',source),('Order only',before),('Edge alpha repair',result)],dest/'neck_review.png')
    changed=b[:,:,3]!=a[:,:,3]; ys,xs=np.where(changed)
    assert np.array_equal(a[:,:,:3],b[:,:,:3])
    assert np.all(b[:,:,3]<=a[:,:,3])
    assert np.all(under[:,:,3][changed]>=250)
    old=json.loads((TASK/'_review/assembly_v31/assembly.json').read_text(encoding='utf8'))
    assert [e for e in m['drawOrder'] if e['file']!='neck.png']==[e for e in old['drawOrder'] if e['file']!='neck.png']
    write(dest/'neck_qa.json',{'changedAlphaPixels':int(changed.sum()),'changedBounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],'rgbUnchanged':True,'alphaOnlyDecreased':True,'opaqueTopwearUnderChangedPixels':True,'allOtherEntriesUnchanged':True,'motionAcceptance':'pending'})
