"""Task-local candidate: remove invented ear, recover rear hair, detach hair shadow."""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from build_mimi_assembly_v3 import TASK, sha, write, polygon, masked, compose

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--version',default='v12');args=parser.parse_args()
    assert args.version.startswith('v') and args.version[1:].isdigit()
    dest=TASK/('_review/assembly_'+args.version);motion=TASK/('_review/motion_'+args.version)
    if dest.exists() or motion.exists():raise ValueError('Refuse overwrite')
    dest.mkdir();motion.mkdir()
    prev=TASK/'_review/assembly_v11'
    m=json.loads((prev/'assembly.json').read_text(encoding='utf8'))
    src=np.asarray(Image.open(TASK/m['appearanceSource']['file']).convert('RGBA'))
    ears=np.asarray(Image.open(prev/'ears.png').convert('RGBA')).copy()
    ears[:,:550,3]=0;ears[ears[:,:,3]==0,:3]=0
    Image.fromarray(ears).save(dest/'ears.png')
    face=np.asarray(Image.open(TASK/'face.png').convert('RGBA')).copy()
    # Diagnostic crop is saved before any colour repair.
    Image.fromarray(face).crop((410,155,490,290)).resize((400,675)).save(dest/'face_shadow_before.png')
    roi=polygon([(395,228),(439,225),(437,241),(444,261),(455,280),
                 (464,291),(478,307),(458,307),(446,299),(436,306),
                 (420,294),(410,302),(402,288),(395,273)])
    dark=np.clip((165-src[:,:,:3].max(axis=2).astype(float))/15,0,1)
    hairmask=np.rint(roi.astype(float)*dark).astype('uint8')
    rear=masked(src,hairmask)
    Image.fromarray(rear).save(dest/'hair_back_left.png')
    Image.fromarray(hairmask).save(dest/'rear_source_mask.png')
    # Transfer the source-visible lower hair out of the foreground slot.
    front=np.asarray(Image.open(prev/'fronthair.png').convert('RGBA')).copy()
    front[:,:,3][(hairmask==255)&(src[:,:,3]==255)]=0
    front[front[:,:,3]==0,:3]=0
    original=face.copy()
    shadow=np.zeros_like(face)
    interior=np.asarray(Image.fromarray(face[:,:,3]).filter(ImageFilter.MinFilter(3)))>=245
    boundary_points=[(125,497),(130,493),(155,474),(175,463),(195,455),(215,448),(235,440),(239,438)]
    clean_targets=[]
    # Fixed intact central-skin band avoids sampling faint baked eye pixels as
    # the diagonal shadow narrows; smooth estimates vertically to avoid stripes.
    palette=np.array([np.median(original[max(0,y-2):y+3,510:531,:3].reshape(-1,3),axis=0)
                      for y in range(125,240)],dtype='uint8')
    palette=np.asarray(Image.fromarray(palette[:,None,:]).filter(ImageFilter.GaussianBlur(2)))[:,0,:]
    for y in range(125,240):
        edge=int(round(np.interp(y,[p[0] for p in boundary_points],[p[1] for p in boundary_points])))
        clean=palette[y-125].astype(float)
        clean_targets.append({'y':y,'edge':edge,'rgb':clean.tolist()})
        for x in range(420,edge+9):
            if not interior[y,x]:continue
            old=original[y,x,:3].astype(float)
            # The measured diagonal shadow band, with an eight-pixel taper into
            # intact skin; colour-threshold retouch left a ghost diagonal in v14.
            weight=float(np.clip((edge+8-x)/8,0,1))
            weight*=min(1,(y-124)/5,(240-y)/5)
            target=old+(clean-old)*weight
            face[y,x,:3]=np.rint(target).clip(0,255).astype('uint8')
            cleaned=face[y,x,:3].astype(float)
            delta=np.maximum(cleaned-old,0)
            if delta.max()<1:continue
            full_alpha=float(np.max(delta/np.maximum(cleaned-60,1)))
            alpha=min(.18,full_alpha*.55)
            if alpha<1/255:continue
            colour=cleaned+(old-cleaned)*.55/alpha
            shadow[y,x,:3]=np.rint(colour).clip(0,255).astype('uint8')
            shadow[y,x,3]=round(alpha*255)
    # Crown is a fixed earlier draw slot; the cloud head alpha also contains
    # reconstructed scalp. Never paint a facial cast shadow over that crown.
    crown_alpha=np.asarray(Image.open(prev/'hair_crown.png').convert('RGBA'))[:,:,3]
    shadow[:,:,3]=np.rint(shadow[:,:,3].astype(float)*(1-crown_alpha/255)).astype('uint8')
    shadow[shadow[:,:,3]==0,:3]=0
    Image.fromarray(shadow).save(dest/'front_hair_shadow_alpha.png')
    Image.fromarray(front).save(dest/'front_hair_paint.png')
    merged=Image.fromarray(shadow);merged.alpha_composite(Image.fromarray(front))
    merged.save(dest/'fronthair.png')
    Image.fromarray(face).save(dest/'face.png')
    Image.fromarray(face).crop((410,155,490,290)).resize((400,675)).save(dest/'face_shadow_after.png')
    changed=np.any(face[:,:,:3]!=original[:,:,:3],axis=2);ys,xs=np.where(changed)
    write(dest/'shadow_ownership_qa.json',{'faceAlphaUnchanged':bool(np.array_equal(face[:,:,3],original[:,:,3])),
        'changedFaceRgbPixels':int(changed.sum()),'changedBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)] if len(xs) else None,
        'shadowAlphaMax':int(shadow[:,:,3].max()),'shadowOwner':'fronthair','noIndependentShadowSlot':True,
        'sampling':clean_targets,'method':'measured row-local clean skin sampling; residual shadow at55%, alpha cap18%; candidate, not source-exact clean skin'})
    entries=[]
    for e in m['drawOrder']:
        e=dict(e)
        if e['file']=='face.png':
            entries.append({'name':'hair_back_left','file':'hair_back_left.png',
                'asset':dest.relative_to(TASK).as_posix()+'/hair_back_left.png',
                'label':'後髮／畫面左下臉旁','group':'character','parent':'backHair',
                'assetSha256':sha(dest/'hair_back_left.png')})
        n=e['file'][:-4]
        if n in ('ears','fronthair','face'):
            e['asset']=dest.relative_to(TASK).as_posix()+'/'+n+'.png';e['assetSha256']=sha(dest/(n+'.png'))
        entries.append(e)
    m.update(drawOrder=entries,rollback='_review/assembly_v11/assembly.json')
    m['specification'].update(removedInventedEar='screen-left / character-right',
        rearHairOwner='hair_back_left / backHair',shadowOwner='fronthair / frontHair',
        shadowBacking='local same-row skin estimate; not claimed original hidden paint')
    m['derivedLayers'].append({'file':'hair_back_left.png','sourceFiles':['backhair.png','fronthair.png'],
                              'method':'source-visible left lower strands transferred to rear draw slot'})
    m['constraints'].append({'behind':'hair_back_left.png','inFrontOf':'face.png','reason':'left lower rear hair is behind the face, not a foreground skin cover'})
    write(dest/'assembly.json',m)
    write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in entries])
    candidate=compose(entries);candidate.save(dest/'assembled.png')
    for color,n in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        bg=Image.new('RGBA',candidate.size,color);bg.alpha_composite(candidate);bg.convert('RGB').save(dest/('assembled_'+n+'.png'))
    for hidden,n in [({'fronthair.png'},'front_off'),({'fronthair.png','hair_crown.png'},'front_crown_off')]:
        compose([e for e in entries if e['file'] not in hidden]).save(dest/(n+'.png'))
    box=(380,150,655,335);w,h=275,185
    strip=Image.new('RGBA',(w*3,h),(220,220,220,255))
    for i,im in enumerate([Image.fromarray(src),Image.open(prev/'assembled.png').convert('RGBA'),candidate]):strip.alpha_composite(im.crop(box),(i*w,0))
    strip.resize((1650,370)).convert('RGB').save(dest/'source_v11_candidate.png')
    rig=json.loads((TASK/'_review/motion_v11/rig.json').read_text(encoding='utf8'))
    rig.update(candidate='motion_'+args.version,assembly=(dest/'assembly.json').relative_to(TASK).as_posix(),
        assemblySha256=sha(dest/'assembly.json'),layerCount=len(entries),rollbackManifest='_review/motion_v11/rig.json')
    rig['bindings']['hair_back_left']='backHair'
    write(motion/'rig.json',rig)
    print(dest)

if __name__=='__main__':main()
