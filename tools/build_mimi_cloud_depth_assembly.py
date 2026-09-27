"""Option A: original cloud RGB only, joint existing depth, hair AND face strata."""
import json
import argparse
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from build_mimi_assembly_v3 import ROOT,TASK,sha,write,compose

DEST=TASK/'_review/assembly_v26'
DEPTH=TASK/'_review/depth_recovery_v2/input'

def rgba(p):return np.asarray(Image.open(p).convert('RGBA'))

def split(a,d,prefix,forced_near=None):
    valid=a[:,:,3]>0
    weight=(a[:,:,3]/255).astype(np.float32)
    smooth=cv2.GaussianBlur(d*weight,(5,5),0)/np.maximum(cv2.GaussianBlur(weight,(5,5),0),1e-6)
    inner=cv2.erode((a[:,:,3]>220).astype(np.uint8),np.ones((3,3),np.uint8))>0
    cv2.setRNGSeed(42)
    _,_,c=cv2.kmeans(smooth[inner,None],2,None,
       (cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_MAX_ITER,100,.0001),10,cv2.KMEANS_PP_CENTERS)
    centers=sorted(c.flatten().tolist());threshold=sum(centers)/2
    near=valid&(smooth<threshold)
    if forced_near is not None:near|=valid&forced_near
    far=valid&~near
    parts=[np.where(m[:,:,None],a,0).astype(np.uint8) for m in (near,far)]
    parts[0][~valid]=a[~valid]
    assert np.array_equal(sum(p.astype(np.uint16) for p in parts),a.astype(np.uint16))
    assert not np.any((parts[0][:,:,3]>0)&(parts[1][:,:,3]>0))
    for p,suffix in zip(parts,['near','far']):Image.fromarray(p).save(DEST/f'{prefix}_{suffix}.png')
    guide=np.zeros_like(a);guide[near,:3]=(40,185,230);guide[far,:3]=(170,90,215);guide[:,:,3]=a[:,:,3]
    uncertain=valid&(np.abs(smooth-threshold)<.2*(centers[1]-centers[0]));guide[uncertain,:3]=(255,195,35)
    Image.fromarray(guide).save(DEST/f'{prefix}_guide.png')
    return parts,{'centers':centers,'threshold':threshold,'nearPixels':int(near.sum()),
        'farPixels':int(far.sum()),'uncertainPixels':int(uncertain.sum()),
        'exactDisjointRGBAUnion':True,'medians':[float(np.median(d[m])) for m in (near,far)]}

def main():
    global DEST
    parser=argparse.ArgumentParser();parser.add_argument('--version',default='v26');parser.add_argument('--occlusion-guard',action='store_true');args=parser.parse_args()
    if not args.version.startswith('v') or not args.version[1:].isdigit():raise ValueError('Invalid version')
    DEST=TASK/('_review/assembly_'+args.version)
    DEST.mkdir(exist_ok=False)
    originals=json.loads((TASK/'_order.json').read_text())
    hashes={e['file']:sha(TASK/e['file']) for e in originals}
    rawface=rgba(DEPTH/'face.png')
    b=rgba(DEPTH/'back hair.png');f=rgba(DEPTH/'front hair.png')
    h=Image.fromarray(b);h.alpha_composite(Image.fromarray(f));hair=np.asarray(h)
    h.save(DEST/'cloud_hair_union.png')
    db=np.asarray(Image.open(DEPTH/'back hair_depth.png')).astype(np.float32)/255
    df=np.asarray(Image.open(DEPTH/'front hair_depth.png')).astype(np.float32)/255
    dh=np.where(f[:,:,3]>15,df,db)
    dface=np.asarray(Image.open(DEPTH/'face_depth.png')).astype(np.float32)/255
    # Only source foreground support can demand foreground occlusion. Hidden
    # back-layer paint must not be pulled over the cheek by a whole-union guard.
    guard=(rawface[:,:,3]>15)&(f[:,:,3]>15) if args.occlusion_guard else None
    hairparts,hqa=split(hair,dh,'hair',guard)
    hqa['sourceVisibleOcclusionGuardPixels']=int(guard.sum()) if guard is not None else 0
    faceparts,fqa=split(rawface,dface,'face')
    (Image.fromarray(rawface)).save(DEST/'face_source_union.png')
    psd=ROOT/'Character/003_Mimi/Mimi_full_body_casual.psd'
    original_psd_hash=sha(psd)
    if args.occlusion_guard:
        ear=rgba(DEPTH/'ears.png').copy()
        count,labels,stats,centroids=cv2.connectedComponentsWithStats((ear[:,:,3]>15).astype(np.uint8),8)
        candidates=[i for i in range(1,count) if stats[i,cv2.CC_STAT_AREA]>30]
        keep=max(candidates,key=lambda i:centroids[i,0])
        allowed=cv2.dilate((labels==keep).astype(np.uint8),np.ones((3,3),np.uint8))>0
        ear[:,:,3][~allowed]=0
        Image.fromarray(ear).save(DEST/'ears_source_visible.png')
    replacements={'fronthair.png':'hair_near.png','backhair.png':'hair_far.png',
                  'face.png':'face_near.png','face_far.png':'face_far.png'}
    if args.occlusion_guard:replacements['ears.png']='ears_source_visible.png'
    labels={'fronthair.png':'頭髮／近深度片','backhair.png':'頭髮／遠深度片',
            'face.png':'臉／近深度片','face_far.png':'臉／遠深度片'}
    values={'fronthair.png':hqa['medians'][0],'backhair.png':hqa['medians'][1],
            'face.png':fqa['medians'][0],'face_far.png':fqa['medians'][1]}
    features=['nose.png','mouth.png','eyebrow.png','eyewhite.png','irides.png','eyelash.png']
    # Match upstream's semantic corrections: eyes/nose/mouth before face in
    # depth, ears behind it. They are not allowed to vanish under median sorting.
    for name in features:
        a=rgba(DEPTH/name);d=np.asarray(Image.open(DEPTH/(name[:-4]+'_depth.png')))/255
        values[name]=min(float(np.median(d[a[:,:,3]>15])),min(fqa['medians'])-.004)
    values['ears.png']=max(fqa['medians'])+.004
    head=list(values)
    constraints=[('ears.png','face_far.png'),('ears.png','face.png'),
                 ('face_far.png','face.png'),('backhair.png','fronthair.png'),
                 ('eyewhite.png','irides.png'),('irides.png','eyelash.png')]
    constraints += [(face,name) for face in ['face.png','face_far.png'] for name in features]
    constraints += [(name,'fronthair.png') for name in features]
    # Topological order with pseudo-depth priority, never a single whole-face rank.
    ordered=[];remaining=set(head)
    while remaining:
        available=[n for n in remaining if not any(b==n and a in remaining for a,b in constraints)]
        if not available:raise ValueError('Cyclic head constraints')
        name=max(available,key=lambda n:(values[n],n));ordered.append(name);remaining.remove(name)
    # A concerns hair/face sources, not rollback of unrelated body repairs.
    prior=json.loads((TASK/'_review/assembly_v24/assembly.json').read_text())
    body_entries=[dict(e) for e in prior['drawOrder'] if e['file'] in
        {'shadow.png','legwear.png','footwear.png','neck.png','bottomwear.png','topwear.png','handwear.png','handwear_left.png'}]
    draw=body_entries
    for name in ordered:
        asset=DEST/replacements[name] if name in replacements else TASK/name
        draw.append({'name':name[:-4],'file':name,'asset':asset.relative_to(TASK).as_posix(),
             'assetSha256':sha(asset),'label':labels.get(name,name[:-4]),
             'group':'ground' if name=='shadow.png' else 'character',
             'parent':'root' if name=='shadow.png' else 'head' if name in head else 'torso'})
    manifest={'schemaVersion':1,'task':TASK.name,'nonProduction':True,'reviewStatus':'pending',
       'source':psd.relative_to(ROOT).as_posix(),'sourceSha256':original_psd_hash,'canvas':[1280,1280],
       'drawOrder':draw,'derivedLayers':[{'file':'handwear_left.png','sourceFiles':['handwear.png'],
          'method':'unchanged existing disjoint arm repair; unrelated to head A route'},
          {'file':'face_far.png','sourceFiles':['face.png'],
          'method':'same-batch depth K=2 exact disjoint face partition, no RGB painting'}],
       'constraints':[{'behind':a,'inFrontOf':b,'reason':'source feature ownership / depth stratum order'} for a,b in constraints],
       'rollback':'_cloud_order.json','appearanceReferencesOnly':['Character/003_Mimi/Mimi_hair.png','Character/003_Mimi/Mimi_breast_bd.png'],
       'specification':{'userChoice':'A','rgbSources':'original cloud PSD only; ground shadow unchanged',
          'depthSource':'_review/depth_recovery_v2','depthSourceSha256':sha(TASK/'_review/depth_recovery_v2/run_config.json'),
          'noHeadTransplant':True,'noHiddenPainting':True,'hair':hqa,'face':fqa,
          'hairDepthCombination':'front source depth where front alpha>15, otherwise source back depth; hidden depth remains estimated',
          'allHeadFragmentsSameMotionParent':True,'sourceVisibleHairGuard':args.occlusion_guard,
          'unsupportedLeftEarRemoved':args.occlusion_guard,'bodyOrder':'assembly_v24 non-head entries preserved byte-for-byte'},
       'occlusion':'Original hair union and original face both split; independent features retained; shared head ownership only.'}
    write(DEST/'assembly.json',manifest)
    write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in draw])
    comp=compose(draw);comp.save(DEST/'assembled.png')
    for bg,label in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        im=Image.new('RGBA',comp.size,bg);im.alpha_composite(comp);im.convert('RGB').save(DEST/f'assembled_{label}.png')
    for skip,label in [({'fronthair.png'},'front_off'),({'backhair.png'},'rear_off'),
            ({'fronthair.png','backhair.png'},'all_hair_off'),({'face.png'},'face_near_off'),
            ({'face_far.png'},'face_far_off')]:
        compose([e for e in draw if e['file'] not in skip]).save(DEST/f'{label}.png')
    box=(340,0,690,335)
    panels=[compose(json.loads((TASK/'_cloud_order.json').read_text())),comp,
            Image.open(DEST/'all_hair_off.png').convert('RGBA'),Image.fromarray(rawface),
            Image.open(DEST/'face_guide.png').convert('RGBA')]
    sheet=Image.new('RGB',(1750,360),(235,237,240));text=ImageDraw.Draw(sheet)
    for i,(p,label) in enumerate(zip(panels,['CLOUD ORIGINAL','A - JOINT DEPTH CANDIDATE','HAIR OFF','ORIGINAL FACE RGB','FACE NEAR/FAR/UNCERTAIN'])):
        bg=Image.new('RGBA',p.size,(235,237,240,255));bg.alpha_composite(p)
        sheet.paste(bg.convert('RGB').crop(box),(i*350,25));text.text((i*350+5,7),label,fill='black')
    sheet.save(DEST/'joint_depth_review.png')
    write(DEST/'joint_depth_qa.json',{'hair':hqa,'face':fqa,'headDrawOrder':ordered,
           'originalLayersUnchanged':all(sha(TASK/n)==v for n,v in hashes.items()),
           'sourcePSDUnchanged':sha(psd)==original_psd_hash,'newReferencesUsedAsPixelSources':False,
           'faceRgbRepainted':False,'independentFeaturesRepainted':False,'userVisualAcceptance':'pending',
           'limits':['Original cloud face retains painted scalp and feature remnants.',
                     'No hidden art inpainting; independent motion not accepted.',
                     'Existing assembly_v24 non-head repairs unchanged.']})
    print(DEST)

if __name__=='__main__':main()
