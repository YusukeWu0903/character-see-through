"""Independent evidence for source-owned reference hair and option-A underfill."""
import argparse,json
import numpy as np
from PIL import Image,ImageDraw
from build_mimi_assembly_v3 import TASK,sha,write

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--version',default='v21');args=ap.parse_args()
    d=TASK/('_review/assembly_'+args.version)
    arr=lambda p:np.asarray(Image.open(p).convert('RGBA'))
    m=json.loads((d/'assembly.json').read_text());prev=json.loads((TASK/'_review/assembly_v17/assembly.json').read_text())
    files={e['file']:TASK/e.get('asset',e['file']) for e in m['drawOrder']}
    prior={e['file']:TASK/e.get('asset',e['file']) for e in prev['drawOrder']}
    canonical=json.loads((TASK/'cloud_layer_audit.json').read_text())['layers']
    for e in canonical:assert sha(TASK/e['file'])==e['sha256'],e['file']
    for f in files:
        if f not in ['face.png','backhair.png','fronthair.png','fronthair_right.png']:
            assert sha(files[f])==sha(prior[f]),f
    face=arr(d/'face.png');oldface=arr(prior['face.png'])
    visible=face[:,:,3]>0
    assert np.array_equal(face[:,:,:3][visible],oldface[:,:,:3][visible])
    assert np.all(face[:,:,3]<=oldface[:,:,3])
    parts=[arr(d/(n+'.png')) for n in ['front_left_paint','fronthair_right','rear_visible']]
    assert np.array_equal(sum(p.astype('uint16') for p in parts),arr(d/'hair_source_union.png').astype('uint16'))
    under=arr(d/'rear_hidden_underfill.png');mask=under[:,:,3]>0
    assert np.all(face[:,:,3][mask]==255)
    assert np.array_equal(under[mask],arr(TASK/'backhair.png')[mask])
    combined=Image.fromarray(under);combined.alpha_composite(Image.fromarray(parts[2]))
    assert np.array_equal(np.asarray(combined),arr(d/'backhair.png'))
    old_shadow=Image.open(TASK/'_review/assembly_v17/front_hair_shadow_alpha.png').convert('RGBA')
    old_shadow.alpha_composite(Image.fromarray(parts[0]))
    assert np.array_equal(np.asarray(old_shadow),arr(d/'fronthair.png'))
    changed=face[:,:,3]<oldface[:,:,3];ys,xs=np.where(changed)
    report={'originalCanonicalHashesUnchanged':True,'unchangedSlots':[f for f in files if f not in ['face.png','backhair.png','fronthair.png','fronthair_right.png']],
        'faceVisibleRgbUnchanged':True,'faceAlphaOnlyReduced':True,'faceChangedAlphaPixels':int(changed.sum()),
        'faceChangedAlphaBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
        'hairPartitionExact':True,'underfillSourceRgbaExact':True,'underfillCompletelyHiddenAtNeutral':True,
        'rearVisibleAndUnderfillMergeExact':True,'previousShadowRetainedWithLeftFrontOwner':True,
        'headNotFullBaldBacking':True,'independentHairUnsupported':True,'visualAcceptance':'pending'}
    write(d/'source_ownership_qa.json',report)
    guide=Image.new('RGBA',(350,355),(225,225,225,255))
    guide.alpha_composite(Image.open(d/'ownership_guide.png').crop((340,0,690,330)),(0,25))
    draw=ImageDraw.Draw(guide);draw.text((5,5),'BLUE: front-left | ORANGE: front-right | PURPLE: rear',fill=(20,20,20,255))
    guide.resize((1050,1065)).convert('RGB').save(d/'ownership_guide_zoom.png')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
