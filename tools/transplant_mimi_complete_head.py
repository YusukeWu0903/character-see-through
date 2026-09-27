"""Complete source-head transplant; generated removal pixels limited to features.

Only face.png changes. Hair/ear/feature/body PNGs remain byte-identical to v21.
"""
import argparse,json,shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from build_mimi_assembly_v3 import ROOT,TASK,sha,write,compose
from register_mimi_hair_reference import warp,white

def source_mask(size,points):
    mask=Image.new('L',(size[0]*4,size[1]*4))
    ImageDraw.Draw(mask).polygon([(round(x*4),round(y*4)) for x,y in points],fill=255)
    return mask.resize(size,Image.Resampling.LANCZOS)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--generated',type=Path,required=True);ap.add_argument('--version',default='v22');args=ap.parse_args()
    assert args.version.startswith('v') and args.version[1:].isdigit()
    d=TASK/('_review/assembly_'+args.version);motion=TASK/('_review/motion_'+args.version)
    if d.exists() or motion.exists():raise ValueError('Never overwrite a review candidate')
    d.mkdir();motion.mkdir()
    srcpath=ROOT/'Character/003_Mimi/Mimi_breast_bd.png'
    src=np.asarray(Image.open(srcpath).convert('RGBA')).copy();h,w=src.shape[:2]
    shutil.copyfile(args.generated,d/'feature_removal_generated.png')
    generated=np.asarray(Image.open(args.generated).convert('RGBA').resize((w,h),Image.Resampling.LANCZOS))
    # Align generated interior patches only; original head silhouette never uses
    # generated alpha or a generated outline. Keep the complete source scalp.
    stable=(src[:,:,3]>245).astype('uint8')*255
    stable[340:730,280:770]=0
    a=cv2.resize(cv2.cvtColor(white(src),cv2.COLOR_RGB2GRAY).astype('float32')/255,(w//2,h//2))
    b=cv2.resize(cv2.cvtColor(white(generated),cv2.COLOR_RGB2GRAY).astype('float32')/255,(w//2,h//2))
    matrix=np.array([[1,0,0],[0,1,0]],np.float32)
    score,matrix=cv2.findTransformECC(a,b,matrix,cv2.MOTION_AFFINE,
        (cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,150,1e-6),cv2.resize(stable,(w//2,h//2)),5)
    matrix[:,2]*=2
    assert .85<float(np.linalg.det(matrix[:,:2]))<1.15 and np.max(np.abs(matrix[:,2]))<100,'Generated geometry drift; needs review'
    aligned=cv2.warpAffine(generated,matrix,(w,h),flags=cv2.INTER_CUBIC|cv2.WARP_INVERSE_MAP)
    Image.fromarray(aligned).save(d/'feature_removal_aligned_source_canvas.png')
    head_points=[(200,0),(830,0),(830,360),(748,400),(730,428),(711,448),(695,474),
        (678,502),(665,535),(647,572),(622,602),(590,631),(553,659),(516,683),
        (480,702),(450,713),(425,699),(397,669),(373,638),(350,609),(329,574),
        (316,540),(306,502),(304,464),(310,429),(315,394),(320,359),(200,359)]
    head_mask=np.asarray(source_mask((w,h),head_points))
    # Interior inpainting supports encompass eyebrows/lashes/eye shadows, nasal
    # pigment and mouth; never replace the scalp or jaw contour with generated art.
    supports=[[(306,346),(455,375),(472,440),(451,506),(316,490),(301,440)],
        [(478,385),(666,393),(689,473),(656,540),(478,531),(467,442)],
        [(388,505),(463,505),(479,604),(391,611)],
        [(380,593),(493,593),(507,670),(380,676)]]
    masks=[np.asarray(source_mask((w,h),p)) for p in supports]
    feature_mask=np.maximum.reduce(masks)
    feature_mask=np.asarray(Image.fromarray(feature_mask).filter(ImageFilter.GaussianBlur(7))).copy()
    interior=cv2.erode(((src[:,:,3]>245)&(head_mask>245)).astype('uint8'),np.ones((9,9),np.uint8))>0
    # Source eye paint touches the left silhouette. Keep source alpha, but let
    # the generated removal patch clear its tiny lash tip (v23 retained it).
    rows,cols=np.indices((h,w))
    eye_edge=(rows>=390)&(rows<=475)&(cols>=295)&(cols<=340)&(src[:,:,3]>245)&(head_mask>245)
    interior|=eye_edge
    feature_mask[~interior]=0
    weights=feature_mask[:,:,None]/255.
    assert np.all(aligned[:,:,3][feature_mask>30]>240),'Generated skin missing inside patch'
    # Match global skin palette using unchanged cheek/forehead samples; this is
    # colour registration, not wholesale generated head substitution.
    yy,xx=np.indices((h,w));skin=(src[:,:,3]>245)&(feature_mask==0)&(head_mask>245)&(xx>335)&(xx<690)&(yy>230)&(yy<640)
    assert skin.sum()>1000,'Insufficient unaffected skin samples'
    offset=np.median(src[:,:,:3][skin].astype(float)-aligned[:,:,:3][skin].astype(float),axis=0)
    offset=np.clip(offset,-20,20)
    repaired=src.copy()
    repaired[:,:,:3]=np.rint(src[:,:,:3]*(1-weights)+np.clip(aligned[:,:,:3].astype(float)+offset,0,255)*weights).astype('uint8')
    assert np.array_equal(repaired[:,:,3],src[:,:,3])
    assert np.array_equal(repaired[feature_mask==0],src[feature_mask==0])
    Image.fromarray(feature_mask).save(d/'feature_removal_mask_source_canvas.png')
    Image.fromarray(repaired).save(d/'source_skin_features_removed.png')
    head=repaired.copy();head[:,:,3]=np.rint(head[:,:,3].astype(float)*head_mask/255).astype('uint8');head[head[:,:,3]==0,:3]=0
    _,labels,stats,_=cv2.connectedComponentsWithStats((head[:,:,3]>32).astype('uint8'),8)
    main_label=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
    main_support=cv2.dilate((labels==main_label).astype('uint8'),np.ones((3,3),np.uint8))>0
    head[~main_support]=0
    original_head=src.copy();original_head[:,:,3]=head[:,:,3];original_head[original_head[:,:,3]==0,:3]=0
    Image.fromarray(head).save(d/'head_source_canvas.png')
    Image.fromarray(original_head).save(d/'head_source_features_before.png')
    reg=json.loads((TASK/'_review/hair_reference_registration/registration.json').read_text())['Mimi_breast_bd.png']['fit']
    face=warp(head,reg);Image.fromarray(face).save(d/'face.png')
    registered_before=warp(original_head,reg);Image.fromarray(registered_before).save(d/'head_registered_features_before.png')
    olddir=TASK/'_review/assembly_v21';m=json.loads((olddir/'assembly.json').read_text())
    old_manifest=json.loads((olddir/'assembly.json').read_text())
    for e in m['drawOrder']:
        if e['file']=='face.png':e.update(asset=(d/'face.png').relative_to(TASK).as_posix(),assetSha256=sha(d/'face.png'),label='完整頭形／新圖皮膚底層（去五官）')
    m.update(rollback='_review/assembly_v21/assembly.json')
    for r in m['appearanceReferences']:
        if r['file'].endswith('Mimi_breast_bd.png'):r['role']='complete head silhouette and skin RGB transplant; feature-removal interior patches only'
    m['specification'].update(headTransplant={'source':srcpath.relative_to(ROOT).as_posix(),'sourceSha256':sha(srcpath),
        'uniformRegistration':reg,'headExtractionPolygon':head_points,'featureRemovalSupports':supports,
        'featureRemoval':'built-in imagegen; generated RGB limited to interior masked feature regions; original source alpha and exterior RGB retained',
        'generatedSha256':sha(d/'feature_removal_generated.png'),'generatedAlignmentScore':float(score),'generatedAlignmentMatrix':matrix.tolist(),
        'skinColourOffset':offset.tolist(),'headCompleteScalp':True,'sourceFeaturesNotTransplanted':True,'existingFeatureLayersUnchanged':True,
        'existingHairLayersUnchanged':True,'earsSeparateAndUnchanged':True},
        hairReviewStatus='v21 rejected; waiting user hair annotation; no split changes in this head-only candidate')
    write(d/'assembly.json',m);write(d/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    comp=compose(m['drawOrder']);comp.save(d/'assembled.png')
    for color,name in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        bg=Image.new('RGBA',comp.size,color);bg.alpha_composite(comp);bg.convert('RGB').save(d/('assembled_'+name+'.png'))
    for skip,name in [({'fronthair.png','fronthair_right.png'},'front_off'),({'fronthair.png','fronthair_right.png','backhair.png'},'all_hair_off'),
        ({'nose.png','mouth.png','eyebrow.png','eyewhite.png','irides.png','eyelash.png','ears.png','fronthair.png','fronthair_right.png','backhair.png'},'head_backing_in_body')]:
        compose([e for e in m['drawOrder'] if e['file'] not in skip]).save(d/(name+'.png'))
    # Compare unchanged-feature old/new heads with all hair hidden.
    box=(410,60,650,325);sheet=Image.new('RGBA',(720,265),(225,225,225,255))
    oldhead=compose([e for e in old_manifest['drawOrder'] if e['file'] not in {'fronthair.png','fronthair_right.png','backhair.png'}])
    newhead=Image.open(d/'all_hair_off.png').convert('RGBA')
    for i,im in enumerate([Image.fromarray(registered_before),oldhead,newhead]):sheet.alpha_composite(im.crop(box),(i*240,0))
    sheet.resize((1440,530)).convert('RGB').save(d/'source_old_new_head.png')
    panel=Image.new('RGBA',(480,265),(225,225,225,255))
    for i,im in enumerate([Image.fromarray(registered_before),Image.fromarray(face)]):panel.alpha_composite(im.crop(box),(i*240,0))
    panel.resize((960,530)).convert('RGB').save(d/'source_feature_free_head.png')
    rig=json.loads((TASK/'_review/motion_v21/rig.json').read_text())
    rig.update(candidate='motion_'+args.version,assembly=(d/'assembly.json').relative_to(TASK).as_posix(),assemblySha256=sha(d/'assembly.json'),rollbackManifest='_review/motion_v21/rig.json')
    rig['limits'].append('Head-only source transplant; v21 hair segmentation rejected and frozen pending annotation. Feature-removal backing awaits user approval.')
    write(motion/'rig.json',rig)
    diff=np.any(repaired[:,:,:3]!=src[:,:,:3],axis=2);ys,xs=np.where(diff)
    write(d/'head_transplant_qa.json',{'onlyFaceAssetChanged':True,'originalHeadSourceAlphaUnchangedBeforeExtraction':True,
        'generatedChangesInsideFeatureMaskOnly':True,'sourceRgbOutsideMaskExact':True,
        'generatedRgbChangedPixels':int(diff.sum()),'generatedChangedBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
        'faceAlphaBounds':Image.fromarray(face[:,:,3]).getbbox(),'reconstruction':'source scalp contour, masked interior feature removal; not a fully generated head',
        'userVisualAcceptance':'pending','hairSplitting':'rejected and awaiting user marks'})
    print(d)

if __name__=='__main__':main()
