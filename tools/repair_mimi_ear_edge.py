"""Task-local alpha-only ear fringe candidate; preserve source-painted RGB."""
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw
from build_mimi_assembly_v3 import TASK, sha, write, compose

DEST = TASK / '_review/assembly_v50'

def main():
    DEST.mkdir(exist_ok=False)
    m = json.loads((TASK/'_review/assembly_v49/assembly.json').read_text(encoding='utf8'))
    entry = next(e for e in m['drawOrder'] if e['file']=='ears.png')
    old_path = TASK/entry['asset']
    old = np.array(Image.open(old_path).convert('RGBA'))
    new = old.copy()
    # Only the source-visible viewer-right ear. Do not change the hidden side.
    x0,y0,x1,y1 = 580,185,640,257
    a = old[y0:y1,x0:x1,3]
    inner = cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
    softened = cv2.GaussianBlur(inner,(5,5),0.55)
    new[y0:y1,x0:x1,3] = np.minimum(a,softened)
    assert np.array_equal(new[:,:,:3],old[:,:,:3])
    assert np.all(new[:,:,3]<=old[:,:,3])
    changed = new[:,:,3]!=old[:,:,3]
    ys,xs = np.where(changed)
    Image.fromarray(new).save(DEST/'ears.png')
    entry.update(asset='_review/assembly_v50/ears.png',assetSha256=sha(DEST/'ears.png'))
    m['rollback']='_review/assembly_v49/assembly.json'
    m['earEdgeRepair']={'sourceAsset':str(old_path.relative_to(TASK)).replace('\\','/'),
        'method':'local one-pixel alpha inset with soft antialias; RGB unchanged',
        'region':[x0,y0,x1,y1], 'scope':'viewer-right ear exterior only',
        'motionReview':'not integrated; static candidate', 'visualAcceptance':'pending'}
    write(DEST/'assembly.json',m)
    write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    result=compose(m['drawOrder']); result.save(DEST/'assembled.png')
    for colour,name in [('#f6f4f2','light'),('#252831','dark')]:
        bg=Image.new('RGBA',result.size,colour);bg.alpha_composite(result)
        bg.convert('RGB').save(DEST/f'assembled_{name}.png')
    hair_off=compose([e for e in m['drawOrder'] if e['file'] not in ('fronthair.png','backhair.png','front_hair_shadow.png')])
    hair_off.save(DEST/'hair_off.png')
    source=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    prior=Image.open(TASK/'_review/assembly_v49/assembled.png').convert('RGBA')
    sheet=Image.new('RGB',(960,385),'#252831'); draw=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate([('Original',source),('v49 before',prior),('v50 candidate',result),('v50 ear solo',Image.fromarray(new))]):
        bg=Image.new('RGBA',im.size,'#252831');bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB').crop((583,185,631,257)).resize((240,360),Image.Resampling.NEAREST),(i*240,25))
        draw.text((i*240+5,7),label,fill='white')
    sheet.save(DEST/'ear_edge_review.png')
    baseline=np.array(prior); output=np.array(result)
    outside=np.ones(changed.shape,bool);outside[y0:y1,x0:x1]=False
    assert np.array_equal(baseline[outside],output[outside])
    write(DEST/'ear_edge_qa.json',{'changedAlphaPixels':int(changed.sum()),
        'changedBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
        'rgbUnchanged':True,'alphaNeverIncreased':True,'compositeOutsideRegionIdentical':True,
        'allOtherLayerEntriesUnchanged':True,'visualAcceptance':'pending','motionIntegrated':False})

if __name__=='__main__':main()
