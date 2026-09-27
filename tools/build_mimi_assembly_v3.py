"""Source-owned Mimi assembly candidate; never overwrite the imported task.

Masks and landmarks here are Mimi-specific, not universal segmentation defaults.
"""
from pathlib import Path
import json, hashlib, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'outputs/seethrough_local/Mimi_cloud_20260927'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest().upper()

def write(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf8')

def polygon(points):
    m = Image.new('L', (5120,5120))
    ImageDraw.Draw(m).polygon([(round(x*4),round(y*4)) for x,y in points],fill=255)
    return np.asarray(m.resize((1280,1280), Image.Resampling.LANCZOS)).copy()

def masked(a, mask):
    b = a.copy()
    b[:,:,3] = np.rint(a[:,:,3].astype(float)*mask/255).astype('uint8')
    b[b[:,:,3]==0,:3] = 0
    return b

def compose(entries):
    im = Image.new('RGBA',(1280,1280))
    for e in entries:
        im.alpha_composite(Image.open(TASK/e.get('asset',e['file'])).convert('RGBA'))
    return im

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--version',default='v3');args=ap.parse_args()
    if not args.version.replace('_','').isalnum():raise ValueError('unsafe version')
    dest=TASK/('_review/assembly_'+args.version)
    motion=TASK/('_review/motion_'+args.version)
    if dest.exists() or motion.exists():raise ValueError('Refuse to overwrite candidate')
    dest.mkdir();motion.mkdir()
    srcpath=TASK/'_review/assembly_v2/source_registered.png'
    src=np.asarray(Image.open(srcpath).convert('RGBA'))
    Image.fromarray(src).crop((340,0,695,330)).resize((1065,990)).save(dest/'source_head_zoom.png')
    # Exclude all facial features before selecting dark source-owned hair paint.
    # Broad outer support is bounded above the shirt; no skin/garment inpainting.
    outer=polygon([(338,0),(691,0),(691,288),(673,319),(578,325),
                   (543,279),(485,326),(355,323),(338,280)])
    face=polygon([(548,116),(565,128),(582,148),(593,170),(601,193),
                  (598,211),(595,222),(578,248),(560,270),(534,297),
                  (493,319),(476,306),(460,291),(446,274),(438,255),(434,238),(438,223),
                  (444,199),(455,177),(466,155),(483,134),(506,119),(523,114)])
    ear=polygon([(604,207),(616,195),(625,193),(632,200),(631,220),
                 (624,236),(608,249),(595,252),(586,242),(594,229)])
    face=np.maximum(face,ear)
    brightness=src[:,:,:3].max(axis=2).astype(float)
    dark=np.clip((175-brightness)/20,0,1)
    support=outer.astype(float)/255*(1-face.astype(float)/255)
    # Solo-layer review exposed source neck/shoulder contour pigment in the
    # broad support. These task-local exclusions do not erase by global colour.
    rows,cols=np.indices((1280,1280))
    support[(rows>=310)|((cols>=650)&(rows>=294))]=0
    mask=np.rint(255*support*dark).astype('uint8')
    hair=masked(src,mask)
    # Source-visible crown is fixed to head; side strands share head motion only.
    # No independent hair driver is enabled until its hidden coverage is reviewed.
    yy,xx=np.indices((1280,1280))
    crown=yy<150
    front=(~crown)&(xx<510)
    rear=(~crown)&(~front)
    assets={
        'hair_crown':np.where(crown[:,:,None],hair,0).astype('uint8'),
        'fronthair':np.where(front[:,:,None],hair,0).astype('uint8'),
        'backhair':np.where(rear[:,:,None],hair,0).astype('uint8'),
    }
    # The cloud ear extends beyond the original contour. Restore only the
    # already-visible source ear at the hair boundary; no hidden ear is painted.
    ear_layer=Image.open(TASK/'ears.png').convert('RGBA')
    ear_array=np.asarray(ear_layer).copy();ear_array[:,580:]=0
    ear_layer=Image.fromarray(ear_array)
    ear_collar=polygon([(604,185),(635,185),(640,200),(638,235),(625,255),
                        (594,258),(583,247),(597,222),(600,202)])
    ear_layer.alpha_composite(Image.fromarray(masked(src,ear_collar)))
    assets['ears']=np.asarray(ear_layer)
    # Connected sleeve/arm islands are separated by a genuinely empty x-gap.
    arms=np.asarray(Image.open(TASK/'handwear.png').convert('RGBA'))
    assert not np.any(arms[:,500:600,3]), 'left/right arm split crosses visible pixels'
    assets['handwear_left']=arms.copy();assets['handwear_left'][:,550:]=0
    assets['handwear']=arms.copy();assets['handwear'][:,:550]=0
    assert np.array_equal(assets['handwear_left'].astype('uint16')+
                          assets['handwear'].astype('uint16'),arms)
    feet=Image.open(TASK/'footwear.png').convert('RGBA')
    # Registered original ankle paint removes the artificial cut contour.
    patch_mask=Image.new('L',(1280,1280));d=ImageDraw.Draw(patch_mask)
    d.rectangle((530,1040,600,1097),fill=255)
    d.rectangle((787,1077,870,1134),fill=255)
    patch_mask=patch_mask.filter(ImageFilter.GaussianBlur(5))
    patch=masked(src,np.asarray(patch_mask))
    feet.alpha_composite(Image.fromarray(patch))
    assets['footwear']=np.asarray(feet)
    for n,a in assets.items():Image.fromarray(a).save(dest/(n+'.png'))
    Image.fromarray(hair).save(dest/'hair_source_union.png')
    Image.fromarray(mask).save(dest/'hair_mask.png')
    Image.fromarray(patch).save(dest/'ankle_source_patch.png')
    base=json.loads((TASK/'_review/assembly_v2/assembly.json').read_text(encoding='utf8'))
    lookup={e['file'][:-4]:e for e in base['drawOrder']}
    slots=['shadow','legwear','footwear','neck','bottomwear','handwear_left',
           'topwear','handwear','face','nose','mouth','ears','eyebrow',
           'eyewhite','irides','eyelash','backhair','hair_crown','fronthair']
    entries=[]
    for n in slots:
        e=dict(lookup.get(n,{'name':n,'file':n+'.png','group':'character','parent':'head' if n=='hair_crown' else 'torso'}))
        if n in assets:e['asset']=dest.relative_to(TASK).as_posix()+'/'+n+'.png'
        e['assetSha256']=sha(TASK/e.get('asset',e['file']))
        if n=='handwear':e['label']='畫面右臂／袖'
        if n=='handwear_left':e['label']='畫面左臂／袖（上衣後方）'
        if n=='hair_crown':e['label']='原畫頭頂固定區'
        if n=='fronthair':e['label']='原畫畫面左側前景髮束'
        if n=='backhair':e['label']='原畫畫面右側髮束（局部遮臉槽）'
        entries.append(e)
    base.update(drawOrder=entries,rollback='_review/assembly_v2/assembly.json',
                constraints=[{'behind':a+'.png','inFrontOf':b+'.png','reason':r} for a,b,r in [
                ('legwear','footwear','Foot source patch covers artificial ankle boundary'),
                ('handwear_left','topwear','Screen-left sleeve is behind torso garment'),
                ('topwear','handwear','Screen-right sleeve remains foreground'),
                ('face','backhair','Visible source side hair occludes face/scalp locally'),
                ('ears','backhair','Source-mask hair occludes only source-visible ear boundary'),
                ('backhair','hair_crown','Source crown shares head transform'),
                ('hair_crown','fronthair','Source foreground strands'),
                ('eyewhite','irides','Iris above white'),('irides','eyelash','Lash above iris')]],
                derivedLayers=[{'file':'handwear_left.png','sourceFiles':['handwear.png'],'method':'disjoint x550 split; exact RGBA partition'},
                               {'file':'hair_crown.png','sourceFiles':['fronthair.png','backhair.png'],'method':'registered original visible hair mask; no hidden art'}],
                appearanceSource={'file':srcpath.relative_to(TASK).as_posix(),'sha256':sha(srcpath)},
                occlusion='Source-visible hair fragments have local draw slots, not a global backhair-behind-face rule. All hair shares head stance; no independent deformation.',
                specification={'userChoice':'A','noHiddenPainting':True,'splitBoundaryY':150,'frontSideBoundaryX':510,'hairMask':'hair_mask.png','reviewStatus':'pending'})
    write(dest/'assembly.json',base)
    write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in entries])
    comp=compose(entries);comp.save(dest/'assembled.png')
    for color,n in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        b=Image.new('RGBA',comp.size,color);b.alpha_composite(comp);b.convert('RGB').save(dest/('assembled_'+n+'.png'))
    old=Image.open(TASK/'_review/assembly_v2/assembled.png').convert('RGBA')
    crops={'head':(340,0,695,330),'shoulders':(380,250,850,455),'ankles':(480,1000,900,1260)}
    for n,box in crops.items():
        w,h=box[2]-box[0],box[3]-box[1]
        sheet=Image.new('RGBA',(w*3,h),(225,225,225,255))
        for i,im in enumerate([Image.fromarray(src),old,comp]):sheet.alpha_composite(im.crop(box),(i*w,0))
        sheet.convert('RGB').resize((w*6,h*2)).save(dest/(n+'_source_v2_candidate.png'))
    report={'sourceHash':sha(srcpath),'originalLayersUnmodified':True,'hairSourceRgbExact':True,
            'armPartitionExact':True,'newLayers':len(entries),'hairIndependentMotion':False,'changes':{}}
    for n,a in assets.items():
        p=TASK/(n+'.png')
        if p.exists():
            olda=np.asarray(Image.open(p).convert('RGBA'));diff=np.any(a!=olda,axis=2);ys,xs=np.where(diff)
            report['changes'][n]={'pixels':int(diff.sum()),'bounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)] if len(xs) else None,
                'alphaIncreases':int((a[:,:,3]>olda[:,:,3]).sum()),'alphaDecreases':int((a[:,:,3]<olda[:,:,3]).sum())}
    write(dest/'pixel_audit.json',report)
    rig=json.loads((TASK/'_review/motion_v2/rig.json').read_text(encoding='utf8'))
    rig.update(candidate='motion_'+args.version,assembly=(dest/'assembly.json').relative_to(TASK).as_posix(),
               assemblySha256=sha(dest/'assembly.json'),layerCount=len(entries),rollbackManifest='_review/motion_v2/rig.json')
    rig['bindings'].update(handwear_left='torso',hair_crown='head')
    rig['limits']=['Original visible hair only; no hidden art or independent hair motion.',
                   'Arms separated for draw order; no independent joint motion.',
                   'Idle and pointer chest unchanged; shadow and feet remain fixed; no blink.']
    write(motion/'rig.json',rig)
    print(dest)

if __name__=='__main__':main()
