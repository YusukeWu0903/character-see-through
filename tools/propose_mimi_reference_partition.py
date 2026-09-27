"""Mimi reference segmentation review only: no repainting or rig promotion."""
import argparse
import json
import shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from register_mimi_hair_reference import warp
from build_mimi_assembly_v3 import ROOT, TASK, sha, write

DEST = TASK/'_review/hair_partition_v25'

def canvas(p):
    return np.asarray(Image.open(p).convert('RGBA'))

def save(a, name):
    Image.fromarray(a).save(DEST/name)

def prepare():
    DEST.mkdir(exist_ok=False)
    staged = DEST/'input'
    staged.mkdir()
    reg = json.loads((TASK/'_review/hair_reference_registration/registration.json').read_text())
    references = []
    for name, tag in [('Mimi_hair.png','hair'), ('Mimi_breast_bd.png','face')]:
        path = ROOT/'Character/003_Mimi'/name
        original = canvas(path)
        fitted = warp(original, reg[name]['fit'])
        if tag == 'face':
            # Task-local jaw/ear silhouette only. All surviving RGB is source;
            # keep contour and anatomical shading. Reference features are for
            # depth/occlusion review, NOT transplanted independent facial assets.
            points = [(200,0),(835,0),(835,380),(765,405),(765,540),
                      (660,575),(620,612),(578,644),(533,674),(483,705),
                      (450,717),(424,704),(394,676),(369,643),(345,610),
                      (326,575),(310,537),(296,500),(292,465),(298,420),
                      (308,385),(310,355),(200,355)]
            mask = Image.new('L', Image.open(path).size)
            ImageDraw.Draw(mask).polygon(points, fill=255)
            rawhead = original.copy()
            rawhead[:,:,3] = np.minimum(rawhead[:,:,3],np.asarray(mask))
            fitted = warp(rawhead, reg[name]['fit'])
            write(DEST/'head_extraction.json', {'sourcePolygon':points,
                  'purpose':'reference-only head, retains source features and outline'})
        Image.fromarray(fitted).save(staged/(tag+'.png'))
        references.append({'file':str(path),'sha256':sha(path),'fit':reg[name]['fit']})
    layers = []
    # Existing body is depth context only; no rejected derived hair/head.
    for tag in ['legwear','footwear','neck','bottomwear','topwear','handwear']:
        shutil.copyfile(TASK/(tag+'.png'),staged/(tag+'.png'))
    for tag in ['hair','face','legwear','footwear','neck','bottomwear','topwear','handwear']:
        layers.append({'tag':tag,'sha256':sha(staged/(tag+'.png'))})
    shutil.copyfile(TASK/'_review/depth_recovery_v2/input/src_img.png',staged/'src_img.png')
    psd = ROOT/'Character/003_Mimi/Mimi_full_body_casual.psd'
    source = ROOT/'Character/003_Mimi/Mimi_full_body_casual_rb.png'
    write(DEST/'provenance.json',{'status':'reference-segmentation-review-only',
          'psd':str(psd),'psdSha256':sha(psd),'illustration':str(source),
          'illustrationSha256':sha(source),'sourceRegisteredSha256':sha(staged/'src_img.png'),
          'layers':layers,'references':references,'canvas':[1280,1280],
          'limits':['New reference-conditioned depth, not original cloud depth.',
                    'Face still contains source features: review/depth context only.',
                    'No feature transplant, paint cleanup, active assembly or rig changes.']})
    print(DEST)

def build():
    hair = canvas(DEST/'input/hair.png')
    head = canvas(DEST/'input/face.png')
    d = np.asarray(Image.open(DEST/'input/hair_depth.png')).astype(np.float32)/255
    dh = np.asarray(Image.open(DEST/'input/face_depth.png')).astype(np.float32)/255
    support = hair[:,:,3]>0
    reliable = cv2.erode((hair[:,:,3]>220).astype(np.uint8),np.ones((3,3),np.uint8))>0
    weights = (hair[:,:,3]/255).astype(np.float32)
    smooth = cv2.GaussianBlur(d*weights,(5,5),0)/np.maximum(cv2.GaussianBlur(weights,(5,5),0),1e-6)
    cv2.setRNGSeed(42)
    _,_,centers = cv2.kmeans(smooth[reliable,None],2,None,
          (cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_MAX_ITER,100,.0001),10,cv2.KMEANS_PP_CENTERS)
    centers = sorted(centers.flatten().tolist())
    threshold = sum(centers)/2
    front_depth = smooth<threshold
    # Source hair is visible hair. Do not let depth erase it behind the bald
    # reference scalp. Head-overlap pixels require a foreground visible slot.
    head_overlap = (head[:,:,3]>15)&support
    front = support&(front_depth|head_overlap)
    rear = support&~front
    uncertain = support&((np.abs(smooth-threshold)<.045)|
                (head_overlap&~front_depth)|((head[:,:,3]>15)&(np.abs(d-dh)<.04)))
    # Follow actual reference side-part, not the previous outer-edge cuts.
    reg = json.loads((TASK/'_review/hair_reference_registration/registration.json').read_text())['Mimi_hair.png']['fit']
    trace_source = [(798,315),(780,415),(747,478),(705,523),(656,568)]
    points = [(x*reg['scale']+reg['tx'],y*reg['scale']+reg['ty']) for x,y in trace_source]
    yy,xx = np.indices(support.shape)
    boundary = np.interp(yy,[p[1] for p in points],[p[0] for p in points])
    masks = [front&(xx<boundary),front&(xx>=boundary),rear]
    names = ['front_left_candidate.png','front_right_candidate.png','rear_candidate.png']
    pieces = [np.where(m[:,:,None],hair,0).astype(np.uint8) for m in masks]
    # Preserve invisible RGB bytes too; they do not belong to any visible mask.
    pieces[0][~support] = hair[~support]
    for a,name in zip(pieces,names):save(a,name)
    assert np.array_equal(sum(a.astype(np.uint16) for a in pieces),hair.astype(np.uint16))
    for mask,name in zip([front,rear,uncertain],['front_mask.png','rear_mask.png','uncertain_mask.png']):
        save(mask.astype(np.uint8)*255,name)
    # Source annotation/diagnostic figure, not painted replacement artwork.
    guide = np.zeros_like(hair)
    guide[front,:3] = (40,185,230)
    guide[rear,:3] = (170,90,215)
    guide[uncertain,:3] = (255,195,35)
    guide[:,:,3] = hair[:,:,3]
    save(guide,'ownership_guide.png')
    def preview(front_on=True,rear_on=True):
        im = Image.new('RGBA',(1280,1280))
        if rear_on:im.alpha_composite(Image.fromarray(pieces[2]))
        im.alpha_composite(Image.fromarray(head))
        if front_on:
            for a in pieces[:2]:im.alpha_composite(Image.fromarray(a))
        return im
    assembled = preview()
    assembled.save(DEST/'reference_assembled.png')
    preview(False,True).save(DEST/'front_off.png')
    preview(True,False).save(DEST/'rear_off.png')
    preview(False,False).save(DEST/'all_hair_off.png')
    guide_head=Image.fromarray(head);guide_head.alpha_composite(Image.fromarray(guide))
    box=(345,0,685,335)
    panels=[assembled,guide_head,preview(False,True),preview(False,False)]
    sheet=Image.new('RGB',(1360,360),(235,237,240));draw=ImageDraw.Draw(sheet)
    for i,(p,label) in enumerate(zip(panels,['REFERENCE ASSEMBLY','CYAN FRONT / PURPLE REAR / YELLOW REVIEW','FRONT OFF','SOURCE HEAD - UNRETOUCHED'])):
        tile=Image.new('RGBA',p.size,(235,237,240,255));tile.alpha_composite(p)
        sheet.paste(tile.convert('RGB').crop(box),(i*340,25));draw.text((i*340+4,6),label,fill='black')
    sheet.save(DEST/'partition_review.png')
    for bg,name in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        b=Image.new('RGBA',assembled.size,bg);b.alpha_composite(assembled)
        b.convert('RGB').save(DEST/('reference_'+name+'.png'))
    write(DEST/'partition_qa.json',{'exactHairUnion':True,'headRgbRetouched':False,
          'sourceReferencesUnchanged':all(sha(Path(r['file']))==r['sha256'] for r in json.loads((DEST/'provenance.json').read_text())['references']),
          'nearFarClusterCenters':centers,'threshold':threshold,'sidePartSourceTrace':trace_source,
          'frontPixels':int(front.sum()),'rearPixels':int(rear.sum()),'uncertainPixels':int(uncertain.sum()),
          'headOverlapProtectedPixels':int(head_overlap.sum()),'scope':'segmentation proposal only',
          'userAcceptance':'pending','independentMotion':'not enabled','faceFeatures':'reference-only, unchanged'})
    print(DEST/'partition_review.png')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--prepare',action='store_true');args=ap.parse_args()
    prepare() if args.prepare else build()
