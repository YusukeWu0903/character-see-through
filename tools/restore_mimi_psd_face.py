"""Restore untouched PSD face and prepare overlapped hair-shadow underfill."""
import json
import numpy as np
from PIL import Image,ImageDraw
from build_mimi_assembly_v3 import TASK,sha,write,compose,polygon

DEST=TASK/'_review/assembly_v47'
def main():
    DEST.mkdir(exist_ok=False)
    m=json.loads((TASK/'_review/assembly_v37/assembly.json').read_text(encoding='utf8'))
    # v37 face strata recompose original PSD face exactly; no rejected backing.
    face=np.array(compose([e for e in m['drawOrder'] if e['file'] in ['face.png','face_far.png']]))
    raw=np.array(Image.open(TASK/'_review/depth_recovery_v2/input/face.png').convert('RGBA'))
    assert np.array_equal(face[:,:,3],raw[:,:,3]);assert np.array_equal(face[:,:,:3][face[:,:,3]>0],raw[:,:,:3][face[:,:,3]>0])
    Image.fromarray(raw).save(DEST/'original_psd_face.png')
    f=next(e for e in m['drawOrder'] if e['file']=='fronthair.png')
    front=np.array(Image.open(TASK/f['asset']).convert('RGBA'))
    # One filled colour area extends well inside the hair, never a floating line.
    full=polygon([(410,112),(503,112),(503,128),(484,150),(470,171),
        (460,193),(452,216),(444,240),(435,257),(410,257)])
    draft=np.zeros_like(raw);draft[:,:,:3]=(151,103,99)
    draft[:,:,3]=np.rint(full.astype(float)/255*raw[:,:,3]/255*90).astype('uint8');draft[draft[:,:,3]==0]=0
    Image.fromarray(draft).save(DEST/'filled_shadow_shape_draft.png')
    # Original FACE still owns its visible shadow. Do not shade it twice.
    # Only concealed overlap is enabled until visible detachment matches FACE.
    enabled=draft.copy();enabled[:,:,3][front[:,:,3]<250]=0;enabled[enabled[:,:,3]==0]=0
    Image.fromarray(enabled).save(DEST/'front_hair_shadow.png')
    e={'name':'front_hair_shadow','file':'front_hair_shadow.png','asset':'_review/assembly_v47/front_hair_shadow.png','assetSha256':sha(DEST/'front_hair_shadow.png'),'label':'髮影／前髮下填色餘量（可見髮影仍在原 FACE）','group':'character','parent':'frontHair','linkedShadow':{'owner':'fronthair','receivers':['face','face_far'],'clip':'receiver-alpha'}}
    m['drawOrder'].insert(next(i for i,x in enumerate(m['drawOrder']) if x['file']=='nose.png'),e)
    m['derivedLayers'].append({'file':'front_hair_shadow.png','sourceFiles':['face.png','fronthair.png'],'method':'one-colour filled concealed overlap; original visible FACE shadow deliberately retained to prevent double shadow'})
    m['constraints'].append({'behind':'front_hair_shadow.png','inFrontOf':'fronthair.png','reason':'Filled overlap remains beneath casting hair'})
    m['shadowOwnership']={'originalFaceRestoredExact':True,'visibleShadowStillBakedInOriginalFace':True,'filledDraft':'filled_shadow_shape_draft.png','enabledRegion':'near-opaque front-hair concealed overlap only','noRejectedFaceCleanup':True,'visibleDetachment':'not complete; must preserve original FACE appearance before activation'}
    m['rollback']='_review/assembly_v37/assembly.json'
    write(DEST/'assembly.json',m);write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    baseline=compose([e for e in m['drawOrder'] if e['file']!='front_hair_shadow.png']);baseline.save(DEST/'original_face_baseline.png')
    result=compose(m['drawOrder']);result.save(DEST/'assembled.png')
    delta=np.abs(np.array(result).astype(int)-np.array(baseline).astype(int))
    assert delta.max()<=2
    for col,name in [('#f6f4f2','light'),('#252831','dark')]:
        bg=Image.new('RGBA',result.size,col);bg.alpha_composite(result);bg.convert('RGB').save(DEST/f'assembled_{name}.png')
    source=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    prior=Image.open(TASK/'_review/assembly_v46/assembled.png').convert('RGBA')
    tiles=[('Original illustration',source),('v46 rejected',prior),('v47 original PSD FACE',result),('Filled shadow draft - not enabled',Image.fromarray(draft))]
    sheet=Image.new('RGB',(1360,355),'#dedede');d=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        bg=Image.new('RGBA',im.size,'#dedede');bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB').crop((340,0,680,330)),(i*340,25));d.text((i*340+3,7),label,fill='black')
    sheet.save(DEST/'face_restore_review.png')
    write(DEST/'restore_qa.json',{'originalPsdFaceExactVisibleRgbAlpha':True,'neutralOverlapMaxDelta':int(delta.max()),'enabledOverlapPixels':int((enabled[:,:,3]>0).sum()),'visibleShadowDetached':False,'visualAcceptance':'pending','motionIntegration':False})

if __name__=='__main__':main()
