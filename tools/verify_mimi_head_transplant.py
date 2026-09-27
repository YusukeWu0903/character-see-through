"""Independent invariants for Mimi's head-only transplant candidate."""
import argparse,json
import cv2
import numpy as np
from PIL import Image
from build_mimi_assembly_v3 import ROOT,TASK,sha,write

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--version',default='v24');args=ap.parse_args()
    d=TASK/('_review/assembly_'+args.version)
    read=lambda p:np.asarray(Image.open(p).convert('RGBA'))
    m=json.loads((d/'assembly.json').read_text());old=json.loads((TASK/'_review/assembly_v21/assembly.json').read_text())
    prior={e['file']:TASK/e.get('asset',e['file']) for e in old['drawOrder']}
    changed=[]
    for e in m['drawOrder']:
        if sha(TASK/e.get('asset',e['file']))!=sha(prior[e['file']]):changed.append(e['file'])
    assert changed==['face.png'],changed
    for e in json.loads((TASK/'cloud_layer_audit.json').read_text())['layers']:
        assert sha(TASK/e['file'])==e['sha256']
    src=read(ROOT/'Character/003_Mimi/Mimi_breast_bd.png');repaired=read(d/'source_skin_features_removed.png')
    mask=np.asarray(Image.open(d/'feature_removal_mask_source_canvas.png'))
    assert np.array_equal(src[:,:,3],repaired[:,:,3])
    assert np.array_equal(src[mask==0],repaired[mask==0])
    face=read(d/'face.png');before=read(d/'head_registered_features_before.png');old_face=read(prior['face.png'])
    assert np.array_equal(face[:,:,3],before[:,:,3]),'Generated work altered source head alpha'
    info=m['specification']['headTransplant'];fit=info['uniformRegistration'];s=fit['scale']
    native_mask=cv2.warpAffine(mask,np.array([[s,0,fit['tx']],[0,s,fit['ty']]],np.float32),(1280,1280),flags=cv2.INTER_CUBIC)
    support=cv2.dilate((native_mask>0).astype('uint8'),np.ones((7,7),np.uint8))>0
    visible=(face[:,:,3]>0)&~support
    assert np.array_equal(face[:,:,:3][visible],before[:,:,:3][visible])
    restored=int(((face[:,:,3]>240)&(old_face[:,:,3]==0)).sum())
    assert restored>3000 and face[95,535,3]>240,'Scalp remains incomplete'
    report={'onlyChangedSlot':changed,'unchangedSlots':[e['file'] for e in m['drawOrder'] if e['file'] not in changed],
        'sourceAlphaExactBeforeExtraction':True,'nativeSourceHeadAlphaExact':True,'sourceRgbOutsideFeatureMaskExact':True,
        'nativeExteriorRgbExactOutsideResamplingMargin':True,'scalpRestoredOpaquePixelsVsV21':restored,
        'sourceCanvasFeatureRemovalBounds':json.loads((d/'head_transplant_qa.json').read_text())['generatedChangedBounds'],
        'faceAlphaBounds':Image.fromarray(face[:,:,3]).getbbox(),'originalCanonicalHashesUnchanged':True,
        'existingHairReview':'rejected, unchanged pending annotation','userHeadAcceptance':'pending'}
    write(d/'head_independent_qa.json',report);print(json.dumps(report,indent=2))

if __name__=='__main__':main()
