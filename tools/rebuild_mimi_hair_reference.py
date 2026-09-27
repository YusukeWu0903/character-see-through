"""Mimi source-owned hair rebuild, option A; no feature transplant or painting."""
import argparse,json
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from build_mimi_assembly_v3 import TASK,ROOT,sha,write,compose,polygon,masked

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--version',default='v18');args=ap.parse_args()
    assert args.version.startswith('v') and args.version[1:].isdigit()
    dest=TASK/('_review/assembly_'+args.version);motion=TASK/('_review/motion_'+args.version)
    if dest.exists() or motion.exists():raise ValueError('Immutable candidate already exists')
    dest.mkdir();motion.mkdir()
    prev=TASK/'_review/assembly_v17';reg=TASK/'_review/hair_reference_registration'
    m=json.loads((prev/'assembly.json').read_text(encoding='utf8'))
    hair=np.asarray(Image.open(reg/'Mimi_hair_registered.png').convert('RGBA')).copy()
    n,labels,stats,_=cv2.connectedComponentsWithStats((hair[:,:,3]>32).astype('uint8'),8)
    component=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
    support=cv2.dilate((labels==component).astype('uint8'),np.ones((5,5),np.uint8))>0
    hair[~support]=0
    yy,xx=np.indices((1280,1280))
    # Curved side-part trace measured on the newly registered hair source.
    part=[(0,589),(40,588),(60,582),(80,573),(100,560),(120,551),(320,551)]
    part_x=np.interp(yy,[p[0] for p in part],[p[1] for p in part])
    left=xx<part_x
    # Lower outer strands lie behind cheek/jaw. Upper/lateral fringe stays front.
    left_trace=[(0,350),(80,355),(150,373),(200,400),(230,415),(250,421),(270,433),(290,451),(310,476)]
    right_trace=[(0,600),(40,621),(80,642),(120,644),(145,638),(175,639),(195,633),(215,618),(240,597),(270,577),(310,552)]
    left_edge=np.interp(yy,[p[0] for p in left_trace],[p[1] for p in left_trace])
    left_rear=left&(xx<left_edge)
    right_edge=np.interp(yy,[p[0] for p in right_trace],[p[1] for p in right_trace])
    right_rear=(~left)&(xx>=right_edge)
    back=left_rear|right_rear
    lf=left&~back;rf=(~left)&~back
    parts=[np.where(mask[:,:,None],hair,0).astype('uint8') for mask in (lf,rf,back)]
    assert np.array_equal(sum(p.astype('uint16') for p in parts),hair.astype('uint16'))
    for name,a in zip(['front_left_paint','fronthair_right','rear_visible'],parts):Image.fromarray(a).save(dest/(name+'.png'))
    Image.fromarray(hair).save(dest/'hair_source_union.png')
    # The bald reference is geometry only: never copy its face, eyes or torso.
    face=np.asarray(Image.open(prev/'face.png').convert('RGBA')).copy()
    bald=np.asarray(Image.open(reg/'Mimi_breast_bd_registered.png').convert('RGBA'))
    head_roi=polygon([(443,168),(453,118),(488,84),(537,73),(583,89),(617,133),
        (628,170),(633,199),(641,216),(617,249),(582,277),(538,305),(495,318),
        (474,304),(456,284),(443,261),(438,232),(438,194)])
    head_alpha=np.minimum(bald[:,:,3],head_roi)
    face[:,:,3]=np.minimum(face[:,:,3],head_alpha)
    # Imported head includes painted scalp hair, not skin. Remove only that
    # occluded upper support; no fabricated bald scalp or reference face RGB.
    visible_face=polygon([(500,115),(523,113),(551,122),(576,147),(594,178),
        (603,201),(596,226),(578,251),(559,273),(534,296),(494,316),
        (475,304),(456,282),(443,257),(437,235),(443,210),(451,187),
        (467,156),(483,136)])
    # This mask owns only the legacy scalp region. Do not use a hairline trace
    # to cut the intact cheek/jaw: that over-tight crop failed the v20 review.
    expanded=np.asarray(Image.fromarray(visible_face).filter(ImageFilter.MaxFilter(5)))
    face[:,:,3]=np.where(yy<220,np.minimum(face[:,:,3],expanded),face[:,:,3])
    face[face[:,:,3]==0,:3]=0
    Image.fromarray(face).save(dest/'face.png')
    Image.fromarray(head_alpha).save(dest/'head_geometry_mask.png')
    # Preserve old hair solely in the fully hidden head interior, with margin.
    old=np.asarray(Image.open(TASK/'backhair.png').convert('RGBA'))
    hidden=np.asarray(Image.fromarray(face[:,:,3]).filter(ImageFilter.MinFilter(9)))==255
    underfill=np.where(hidden[:,:,None],old,0).astype('uint8')
    Image.fromarray(underfill).save(dest/'rear_hidden_underfill.png')
    rear=Image.fromarray(underfill);rear.alpha_composite(Image.fromarray(parts[2]));rear.save(dest/'backhair.png')
    # Keep the previously detached transparent cast-shadow with its front owner.
    shadow=Image.open(prev/'front_hair_shadow_alpha.png').convert('RGBA')
    front=shadow.copy();front.alpha_composite(Image.fromarray(parts[0]));front.save(dest/'fronthair.png')
    entries={e['file'][:-4]:dict(e) for e in m['drawOrder']}
    order=['shadow','legwear','footwear','neck','bottomwear','handwear_left','topwear','handwear',
           'backhair','face','nose','mouth','ears','eyebrow','eyewhite','irides','eyelash','fronthair','fronthair_right']
    draw=[]
    for name in order:
        e=entries.get(name,{'name':name,'file':name+'.png','group':'character','parent':'frontHair'})
        if name in ['face','backhair','fronthair','fronthair_right']:
            e.update(asset=(dest/(name+'.png')).relative_to(TASK).as_posix(),assetSha256=sha(dest/(name+'.png')))
        if name in ['backhair','fronthair','fronthair_right']:
            e['name']=name;e['label']={'backhair':'後髮／可見髮尾與隱藏底襯','fronthair':'前髮／畫面左側（含透明髮影）','fronthair_right':'前髮／畫面右側'}[name]
        draw.append(e)
    m.update(drawOrder=draw,rollback='_review/assembly_v17/assembly.json',
        derivedLayers=[{'file':'handwear_left.png','sourceFiles':['handwear.png'],'method':'unchanged exact disjoint cloud arm split'},
            {'file':'fronthair_right.png','sourceFiles':['fronthair.png','backhair.png'],'method':'new user hair reference registration; curved side-part and occlusion partition'}],
        constraints=[{'behind':a+'.png','inFrontOf':b+'.png','reason':reason} for a,b,reason in [
            ('legwear','footwear','Existing ankle repair retained'),('handwear_left','topwear','Left arm behind top'),
            ('backhair','face','Rear hair behind head, not a local foreground workaround'),
            ('backhair','ears','Rear hair behind visible source ear'),('face','fronthair','Front fringe occludes face'),
            ('ears','fronthair_right','Front temple fringe occludes ear only where painted'),
            ('eyewhite','irides','Independent eye draw slots preserved'),('irides','eyelash','Lashes above iris')]],
        occlusion='One rear layer behind head; two front layers follow curved part line. No horizontal crown slot. Shared head field; independent hair not enabled.',
        appearanceReferences=[{'file':(ROOT/'Character/003_Mimi'/n).relative_to(ROOT).as_posix(),'sha256':sha(ROOT/'Character/003_Mimi'/n),'role':role} for n,role in [('Mimi_hair.png','visible hair paint'),('Mimi_breast_bd.png','registration/head silhouette only; no RGB transplant')]],
        specification={'userChoice':'A: new visible hair + old hidden rear underfill','noHiddenPainting':True,
            'noFeatureTransplant':True,'partTrace':part,'leftRearBoundary':left_trace,
            'rightRearBoundary':right_trace,
            'hiddenMarginPixels':4,'reviewStatus':'pending','registration':json.loads((reg/'registration.json').read_text())})
    write(dest/'assembly.json',m)
    write(dest/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in draw])
    comp=compose(draw);comp.save(dest/'assembled.png')
    for color,name in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        bg=Image.new('RGBA',comp.size,color);bg.alpha_composite(comp);bg.convert('RGB').save(dest/('assembled_'+name+'.png'))
    for skip,name in [({'fronthair.png','fronthair_right.png'},'front_off'),({'face.png','nose.png','mouth.png','ears.png','eyebrow.png','eyewhite.png','irides.png','eyelash.png'},'head_off'),({'backhair.png'},'rear_off')]:
        compose([e for e in draw if e['file'] not in skip]).save(dest/(name+'.png'))
    colors=[(45,150,245),(245,110,50),(140,80,220)]
    guide=np.zeros_like(hair)
    for mask,color in zip((lf,rf,back),colors):guide[mask,:3]=color;guide[mask,3]=hair[mask,3]
    guide[guide[:,:,3]==0,:3]=0
    Image.fromarray(guide).save(dest/'ownership_guide.png')
    # Source / rollback / candidate at equal canvas scale, no screenshot scaling tricks.
    sheet=Image.new('RGBA',(1050,330),(225,225,225,255));box=(340,0,690,330)
    for i,im in enumerate([Image.open(TASK/m['appearanceSource']['file']),Image.open(prev/'assembled.png'),comp]):sheet.alpha_composite(im.convert('RGBA').crop(box),(i*350,0))
    sheet.resize((1575,495)).convert('RGB').save(dest/'source_v17_candidate.png')
    protected=['nose','mouth','ears','eyebrow','eyewhite','irides','eyelash']
    before={e['file']:e for e in json.loads((prev/'assembly.json').read_text())['drawOrder']}
    assert all(sha(TASK/e.get('asset',e['file']))==sha(TASK/before[e['file']].get('asset',e['file'])) for e in draw if e['file'][:-4] in protected)
    write(dest/'hair_rebuild_qa.json',{'exactDisjointHairPartition':True,'facialPartsByteIdenticalToV17':protected,
        'baldReferenceRgbImported':False,'hiddenUnderfillPixels':int((underfill[:,:,3]>0).sum()),
        'hiddenUnderfillNeutralVisiblePixels':int(((underfill[:,:,3]>0)&(face[:,:,3]<255)).sum()),
        'legacyCrownRemoved':True,'legacyRearPatchRemoved':True,'nativeCanvas':[1280,1280],
        'independentHairMotion':False,'userVisualAcceptance':'pending'})
    rig=json.loads((TASK/'_review/motion_v17/rig.json').read_text())
    rig.update(candidate='motion_'+args.version,assembly=(dest/'assembly.json').relative_to(TASK).as_posix(),
        assemblySha256=sha(dest/'assembly.json'),layerCount=len(draw),rollbackManifest='_review/motion_v17/rig.json')
    rig['bindings'].pop('hair_crown',None);rig['bindings'].pop('hair_back_left',None);rig['bindings']['fronthair_right']='frontHair'
    rig['limits'][0]='User reference hair re-partitioned; old rear only hidden underfill. Same shared head field, no independent hair motion.'
    write(motion/'rig.json',rig)
    print(dest)

if __name__=='__main__':main()
