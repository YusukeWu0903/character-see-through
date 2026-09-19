"""Register hairless expression artwork and stage reversible eyelid candidates.

Unlike the legacy importer, this uses one global crop transform, continuous
replacement masks and versioned staging. It never changes the active manifest.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from derive_eye_assets import components

ORDER = ['handwear','legwear','topwear','backhair','footwear','earwear','neck',
         'bottomwear','ears','face','nose','mouth','eyelash','eyewhite','irides',
         'eyebrow','fronthair']

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def stage(task, reference, crop, version):
    task, reference = Path(task), Path(reference)
    dest = task / '_rig_candidates' / version
    dest.mkdir(exist_ok=False)
    x,y,x1,y1 = crop
    base_path = task / '_rig_candidates' / 'head_base_open_inspect.png'
    base = np.array(Image.open(base_path).convert('RGB'))
    if base.shape[:2] != (y1-y,x1-x):
        raise ValueError('Recorded crop does not match source reference dimensions')
    generated = np.array(Image.open(reference).convert('RGB').resize((x1-x,y1-y), Image.Resampling.LANCZOS))
    layers = {n: Image.open(task / (n+'.png')).convert('RGBA') for n in ORDER}
    size = layers['face'].size
    if any(im.size != size for im in layers.values()):
        raise ValueError('All layers must preserve canvas size')
    whites = sorted(components(layers['eyewhite'].getchannel('A'))[:2], key=lambda p:p['bbox'][0])
    lashes = sorted(components(layers['eyelash'].getchannel('A'))[:2], key=lambda p:p['bbox'][0])
    if len(whites)!=2 or len(lashes)!=2:
        raise ValueError('Two separated eye regions required')
    stable = np.ones(base.shape[:2], np.uint8)*255
    boxes=[]
    for w,l in zip(whites,lashes):
        a,b,c,d = [min(w['bbox'][0],l['bbox'][0])-6,min(w['bbox'][1],l['bbox'][1])-5,
                   max(w['bbox'][2],l['bbox'][2])+6,max(w['bbox'][3],l['bbox'][3])+5]
        boxes.append([max(0,a),max(0,b),min(size[0],c),min(size[1],d)])
        stable[max(0,b-y-4):min(y1-y,d-y+4),max(0,a-x-4):min(x1-x,c-x+4)]=0
    gray=lambda im:cv2.cvtColor(im,cv2.COLOR_RGB2GRAY).astype(np.float32)/255
    warp=np.eye(2,3,dtype=np.float32)
    score,warp=cv2.findTransformECC(gray(base),gray(generated),warp,cv2.MOTION_EUCLIDEAN,
        (cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,200,1e-6),stable,3)
    if score<.9 or np.linalg.norm(warp[:,2])>4 or abs(float(warp[0,1]))>.04:
        raise ValueError(f'Unacceptable global registration: {score}, {warp}')
    aligned=cv2.warpAffine(generated,warp,(x1-x,y1-y),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REPLICATE)
    Image.fromarray(aligned).save(dest/'registered_reference.png')
    full=np.zeros((size[1],size[0],4),np.uint8)
    full[y:y1,x:x1,:3]=aligned
    brow=np.array(layers['eyebrow'].getchannel('A'))
    face=np.array(layers['face'].getchannel('A'))
    patches=[]
    stats={}
    for side,box in zip(('left','right'),boxes):
        mask=Image.new('L',size)
        ImageDraw.Draw(mask).rounded_rectangle(tuple(box),radius=4,fill=255)
        m=np.array(mask)
        # Feather only inside the edge; keep the central replacement solid.
        dist=cv2.distanceTransform(m,cv2.DIST_L2,3)
        alpha=np.clip(dist/2,0,1)*255
        alpha[brow>8]=0
        alpha[face<8]=0
        # Hair is rendered above the eyelid. Do not punch a hair-shaped hole
        # into skin: hair motion would expose that hole in a later frame.
        out=full.copy(); out[:,:,3]=alpha.astype(np.uint8)
        out[out[:,:,3]==0,:3]=0
        im=Image.fromarray(out); patches.append(im)
        name=f'eyelid_closed_{side}.png'; im.save(dest/name)
        stats[side]={'file':name,'bbox':box,'pixels':int((alpha>8).sum()),
                     'browOverlap':int(((alpha>8)&(brow>8)).sum())}
    sheet=Image.new('RGB',(600,180),(22,25,30))
    for index,blink in enumerate((0,.5,1)):
        canvas=Image.new('RGBA',size,(22,25,30,255))
        for name in ORDER:
            im=layers[name].copy()
            if name in ('eyelash','eyewhite','irides'):
                im.putalpha(im.getchannel('A').point(lambda a:round(a*(1-blink))))
            if name=='eyebrow':
                for eyelid in patches:
                    p=eyelid.copy();p.putalpha(p.getchannel('A').point(lambda a:round(a*blink)))
                    canvas.alpha_composite(p)
            canvas.alpha_composite(im)
        canvas.save(dest/f'composite_{round(blink*100):03d}.png')
        sheet.paste(canvas.crop(crop).convert('RGB'),(index*200,20))
        ImageDraw.Draw(sheet).text((index*200+8,3),f'Blink {round(blink*100)}%',fill='white')
    sheet.save(dest/'review_strip.png')
    report={'schemaVersion':3,'source':'hairless_head_artwork','visualReview':{'status':'pending'},
       'reference':str(reference),'referenceSha256':digest(reference),'baseSha256':digest(base_path),
       'crop':crop,'registration':{'score':score,'matrix':warp.tolist()},'layers':stats,
       'sourceLayers':{n:digest(task/(n+'.png')) for n in ORDER},
       'note':'Static compositing preview only; browser animation review required before promotion.'}
    (dest/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return dest

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('task',type=Path);parser.add_argument('reference',type=Path)
    parser.add_argument('--crop',type=int,nargs=4,required=True)
    parser.add_argument('--version',required=True)
    args=parser.parse_args()
    print(stage(args.task,args.reference,args.crop,args.version))
