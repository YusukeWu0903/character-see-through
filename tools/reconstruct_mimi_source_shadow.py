"""Original-pixel neutral shadow recovery, not a guessed blur or strength."""
import json
import numpy as np
from PIL import Image, ImageDraw
from build_mimi_assembly_v3 import TASK, sha, write, compose, polygon

DEST=TASK/'_review/assembly_v45'

def main():
    DEST.mkdir(exist_ok=False)
    olddir=TASK/'_review/assembly_v40'
    m=json.loads((olddir/'assembly.json').read_text(encoding='utf8'))
    source=TASK/'_review/assembly_v2/source_registered.png'
    src=np.array(Image.open(source).convert('RGBA'))
    clean=np.array(compose([e for e in m['drawOrder'] if e['file'] in ['face.png','face_far.png']]))
    protect=np.array(compose([e for e in m['drawOrder'] if e['file'] in ['eyebrow.png','eyelash.png','eyewhite.png','irides.png','nose.png','mouth.png']]))[:,:,3]>0
    yy,xx=np.indices((1280,1280))
    # Native-source measured narrow fringe corridor, not whole-face shadow.
    corridor=polygon([(476,145),(468,160),(461,175),(455,190),(450,207),
        (445,225),(441,245),(432,245),(436,225),(442,207),(448,190),
        (453,175),(460,160),(469,145)])>0
    # Include adjacent strand gaps as well as the strand itself. A polygon-only
    # matte left discontinuous old backing outside its zigzag contour.
    corridor=(xx>=425)&(xx<480)&(yy>=145)&(yy<245)&(src[:,:,3]>=250)
    missing=corridor&(clean[:,:,3]<255)&(~protect)&(src[:,:,3]>=250)
    for y in range(145,246):
        clean[y,missing[y],:3]=np.median(clean[y,510:531,:3],axis=0).astype('uint8')
    clean[:,:,3][missing]=255
    skin=corridor&(clean[:,:,3]==255)&(~protect)
    base=clean[:,:,:3].astype(float)
    target=src[:,:,:3].astype(float)
    # An unshadowed backing must not be darker than its intended shadowed pixel.
    base[skin]=np.maximum(base[skin],target[skin])
    clean[:,:,:3]=np.rint(base).astype('uint8')
    # Solve source-over directly per pixel; no guessed global cap/blur/colour.
    deficit=np.max((base-target)/np.maximum(base,1),axis=2)
    alpha=np.ceil(np.clip(deficit,0,1)*255)/255
    alpha*=skin
    colour=np.zeros_like(base)
    valid=alpha>0
    colour[valid]=(target[valid]-(1-alpha[valid,None])*base[valid])/alpha[valid,None]
    shadow=np.zeros_like(clean);shadow[:,:,:3]=np.rint(np.clip(colour,0,255)).astype('uint8');shadow[:,:,3]=np.rint(alpha*255).astype('uint8');shadow[~valid]=0
    darkstrand=skin&(src[:,:,:3].max(axis=2)<175)
    hair_patch=shadow.copy();hair_patch[~darkstrand]=0
    shadow[darkstrand]=0
    Image.fromarray(shadow).save(DEST/'front_hair_shadow.png')
    Image.fromarray(skin.astype('uint8')*255).save(DEST/'original_shadow_support.png')
    # Restore source-drawn wisps within the same corridor, without importing eyes.
    frontentry=next(e for e in m['drawOrder'] if e['file']=='fronthair.png')
    front=np.array(Image.open(TASK/frontentry['asset']).convert('RGBA'))
    strand=darkstrand
    front[skin]=0
    patch_mask=skin&(hair_patch[:,:,3]>0)
    front[patch_mask]=hair_patch[patch_mask]
    Image.fromarray(front).save(DEST/'fronthair.png')
    for e in m['drawOrder']:
        if e['file'] in ['face.png','face_far.png']:
            a=np.array(Image.open(TASK/e['asset']).convert('RGBA'))
            present=a[:,:,3]>0;a[:,:,:3][present]=clean[:,:,:3][present]
            if e['file']=='face.png':a[missing]=clean[missing]
            else:a[missing]=0
            Image.fromarray(a).save(DEST/e['file'])
        if e['file'] in ['face.png','face_far.png','front_hair_shadow.png','fronthair.png']:
            e['asset']=(DEST/e['file']).relative_to(TASK).as_posix();e['assetSha256']=sha(DEST/e['file'])
    m['shadowOwnership'].update(method='Exact per-pixel source-over solve in measured source corridor; no global colour/cap/blur',originalSourceSha256=sha(source),staticReview='pending',motionReview='not connected; no animation claims')
    m['rollback']='_review/assembly_v37/assembly.json'
    write(DEST/'assembly.json',m);write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    reconstructed=Image.fromarray(clean);reconstructed.alpha_composite(Image.fromarray(shadow));reconstructed.alpha_composite(Image.fromarray(hair_patch))
    error=np.abs(np.array(reconstructed)[:,:,:3].astype(int)-src[:,:,:3].astype(int))
    assert error[valid].max()<=1
    result=compose(m['drawOrder']);result.save(DEST/'assembled.png')
    for color,name in [('#f6f4f2','light'),('#252831','dark')]:
        bg=Image.new('RGBA',result.size,color);bg.alpha_composite(result);bg.convert('RGB').save(DEST/f'assembled_{name}.png')
    off=compose([e for e in m['drawOrder'] if e['file'] not in ['fronthair.png','front_hair_shadow.png']]);off.save(DEST/'front_and_shadow_off.png')
    tiles=[('Original',Image.fromarray(src)),('v40 rejected',compose(json.loads((olddir/'assembly.json').read_text(encoding='utf8'))['drawOrder'])),(DEST.name+' source recovery',result)]
    for box,name,scale in [((340,0,680,330),'shadow_review.png',1),((425,145,480,250),'temple_zoom.png',4)]:
        w=(box[2]-box[0])*scale;h=(box[3]-box[1])*scale
        sheet=Image.new('RGB',(w*3,h+25),'#dedede');d=ImageDraw.Draw(sheet)
        for i,(label,im) in enumerate(tiles):
            bg=Image.new('RGBA',im.size,'#dedede');bg.alpha_composite(im)
            sheet.paste(bg.convert('RGB').crop(box).resize((w,h)),(i*w,25));d.text((i*w+3,6),label,fill='black')
        sheet.save(DEST/name)
    final_error=np.abs(np.array(result)[:,:,:3].astype(int)-src[:,:,:3].astype(int))
    write(DEST/'shadow_qa.json',{'solvedShadowPixels':int(valid.sum()),'sourceReconstructionMaxError':int(error[valid].max()),'finalCorridorMaxError':int(final_error[skin].max()),'sourceReconstructionMeanError':float(error[valid].mean()),'restoredStrandPixels':int(strand.sum()),'localMissingBackingPixels':int(missing.sum()),'featurePixelsProtected':True,'visualAcceptance':'pending','limits':'Exact metric applies only measured temple corridor, not whole face'})

if __name__=='__main__':main()
