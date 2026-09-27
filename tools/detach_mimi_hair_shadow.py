"""Local estimated backing and independent original-guided hair shadow candidate."""
import json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from build_mimi_assembly_v3 import TASK, sha, write, compose

DEST=TASK/'_review/assembly_v40'

def main():
    DEST.mkdir(exist_ok=False)
    prev=json.loads((TASK/'_review/assembly_v37/assembly.json').read_text(encoding='utf8'))
    src=np.array(Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA'))
    union=compose([e for e in prev['drawOrder'] if e['file'] in ['face.png','face_far.png']])
    old=np.array(union);clean=old.copy();roi=np.zeros((1280,1280),dtype='uint8')
    protect=np.array(compose([e for e in prev['drawOrder'] if e['file'] in ['eyebrow.png','eyelash.png','eyewhite.png','irides.png','nose.png','mouth.png']]))[:,:,3]>0
    palette=np.array([np.median(old[y-2:y+3,510:531,:3].reshape(-1,3),axis=0) for y in range(125,240)],dtype='uint8')
    palette=np.array(Image.fromarray(palette[:,None,:]).filter(ImageFilter.GaussianBlur(2)))[:,0,:]
    edges=[(125,497),(155,474),(175,463),(195,455),(215,448),(235,440),(239,438)]
    for y in range(125,240):
        edge=np.interp(y,[p[0] for p in edges],[p[1] for p in edges])
        for x in range(420,int(edge)+9):
            if old[y,x,3]<245 or protect[y,x] or old[y,x,:3].max()<160:continue
            w=np.clip((edge+8-x)/8,0,1)*min(1,(y-124)/5,(240-y)/5)
            clean[y,x,:3]=np.rint(old[y,x,:3]*(1-w)+palette[y-125]*w).astype('uint8');roi[y,x]=round(w*255)
    Image.fromarray(roi).save(DEST/'backing_repair_mask.png')
    for name in ['face.png','face_far.png']:
        e=next(e for e in prev['drawOrder'] if e['file']==name)
        a=np.array(Image.open(TASK/e.get('asset',name)).convert('RGBA'))
        a[:,:,:3][a[:,:,3]>0]=clean[:,:,:3][a[:,:,3]>0]
        Image.fromarray(a).save(DEST/name)
    # Transparent cast shadow only near original thin strands, excluding all
    # independent features and source dark hair. Backing is estimated, not drawn.
    shadow=np.zeros_like(old);yy,xx=np.indices(roi.shape)
    strand=np.interp(yy,[125,155,175,195,215,239],[499,475,457,448,443,438])
    support=(roi>0)&(xx>strand-2)&(xx<strand+7)&(~protect)
    support&=(src[:,:,:3].min(axis=2)>130)&(src[:,:,:3].max(axis=2)>175)
    base=clean[:,:,:3].astype(float);target=src[:,:,:3].astype(float)
    # Fixed chromatic shadow plus alpha solved from local luminance deficit.
    colour=np.maximum(base-110,0)
    alpha=np.clip(np.mean(base-target,axis=2)/110,0,.38)*support
    alpha=np.array(Image.fromarray(np.rint(alpha*255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))).astype(float)/255
    alpha*=((old[:,:,3]>=245)&(~protect)&(roi>0))
    shadow[:,:,:3]=np.rint(colour).astype('uint8');shadow[:,:,3]=np.rint(alpha*255).astype('uint8');shadow[shadow[:,:,3]==0]=0
    Image.fromarray(shadow).save(DEST/'front_hair_shadow.png')
    m=json.loads(json.dumps(prev))
    for e in m['drawOrder']:
        if e['file'] in ['face.png','face_far.png']:
            e['asset']=(DEST/e['file']).relative_to(TASK).as_posix();e['assetSha256']=sha(DEST/e['file'])
    entry={'file':'front_hair_shadow.png','name':'front_hair_shadow','asset':(DEST/'front_hair_shadow.png').relative_to(TASK).as_posix(),'assetSha256':sha(DEST/'front_hair_shadow.png'),'label':'前髮投影／透明獨立層','group':'character','parent':'frontHair','linkedShadow':{'owner':'fronthair','receivers':['face','face_far'],'clip':'receiver-alpha'}}
    m['drawOrder'].insert(next(i for i,e in enumerate(m['drawOrder']) if e['file']=='fronthair.png'),entry)
    m['derivedLayers'].append({'file':'front_hair_shadow.png','sourceFiles':['face.png','fronthair.png'],'method':'local backing estimate plus original-guided transparent hair shadow; frontHair owner and face-alpha clipping'})
    m['constraints'].append({'behind':'front_hair_shadow.png','inFrontOf':'fronthair.png','reason':'Hair paint occludes its transparent shadow'})
    m['shadowOwnership']={'owner':'fronthair','receivers':['face','face_far'],'backing':'local skin estimate, not original hidden drawing','faceAlphaUnchanged':True,'featureAssetsUnchanged':True,'staticReview':'pending','motionReview':'module probes only; no active rig promotion'}
    write(DEST/'assembly.json',m);write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    # Neutral PSD receiver mask is preclipped; moving renderer must reclip after
    # applying owner motion. Exact neutral mask equals original face alpha.
    assert np.all(shadow[:,:,3][old[:,:,3]==0]==0)
    result=compose(m['drawOrder']);result.save(DEST/'assembled.png')
    for color,name in [('#f6f4f2','light'),('#252831','dark')]:
        bg=Image.new('RGBA',result.size,color);bg.alpha_composite(result);bg.convert('RGB').save(DEST/f'assembled_{name}.png')
    without=compose([e for e in m['drawOrder'] if e['file'] not in ['fronthair.png','front_hair_shadow.png']]);without.save(DEST/'front_and_shadow_off.png')
    tiles=[('Original',Image.fromarray(src)),('v37 baked shadow',compose(prev['drawOrder'])),(DEST.name+' detached shadow',result),('Front and shadow off',without)]
    sheet=Image.new('RGB',(1360,355),'#dedede');d=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        bg=Image.new('RGBA',im.size,'#dedede');bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB').crop((340,0,680,330)),(340*i,25));d.text((340*i+4,7),label,fill='black')
    sheet.save(DEST/'shadow_review.png')
    changed=np.any(old[:,:,:3]!=clean[:,:,:3],axis=2);ys,xs=np.where(changed)
    assert not np.any(changed&protect);assert np.array_equal(old[:,:,3],clean[:,:,3])
    assert not np.any(changed&(roi==0))
    write(DEST/'shadow_qa.json',{'changedBackingPixels':int(changed.sum()),'bounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],'faceAlphaUnchanged':True,'protectedFeaturePixelsUnchanged':True,'shadowPixels':int((shadow[:,:,3]>0).sum()),'shadowAlphaMax':int(shadow[:,:,3].max()),'visualAcceptance':'pending'})

if __name__=='__main__':main()
