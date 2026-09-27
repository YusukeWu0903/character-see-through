"""Original-drawn visible hair; depth guides only where source geometry agrees."""
import json
import numpy as np
import cv2
from PIL import Image, ImageDraw
from build_mimi_assembly_v3 import TASK, ROOT, sha, write, compose, polygon

DEST=TASK/'_review/assembly_v37'

def main():
    DEST.mkdir(exist_ok=False)
    prev=json.loads((TASK/'_review/assembly_v34/assembly.json').read_text(encoding='utf8'))
    srcpath=TASK/'_review/assembly_v2/source_registered.png'
    src=np.array(Image.open(srcpath).convert('RGBA'))
    yy,xx=np.indices((1280,1280))
    outer=polygon([(342,0),(688,0),(688,273),(667,294),(631,314),(582,320),
        (541,287),(484,322),(423,312),(376,293),(342,275)])
    face=polygon([(500,114),(524,112),(550,121),(573,146),(591,175),
        (600,193),(613,194),(628,193),(632,201),(630,220),(620,237),
        (601,248),(587,248),(574,265),(552,284),(529,299),(493,310),
        (475,300),(458,280),(446,259),(436,234),(438,215),(444,197),
        (453,176),(466,153),(482,134)])
    dark=np.clip((175-src[:,:,:3].max(axis=2).astype(float))/20,0,1)
    mask=np.rint(outer*(1-face.astype(float)/255)*dark).astype('uint8')
    # Source jaw/neck and garment outlines are dark too, but are not hair.
    jaw_edge=np.interp(yy,[278,290,300,310,320],[555,542,525,494,480])
    mask[(yy>278)&(xx>476)&(xx<jaw_edge+4)]=0
    mask[(yy>304)&(xx<550)]=0
    mask[(yy>300)&(xx>650)]=0
    mask[(yy>306)&(xx>635)]=0
    hair=src.copy();hair[:,:,3]=np.rint(src[:,:,3].astype(float)*mask/255).astype('uint8')
    hair[hair[:,:,3]==0]=0
    Image.fromarray(hair).save(DEST/'visible_hair_union.png')
    Image.fromarray(mask).save(DEST/'source_hair_mask.png')
    # Current face unchanged: visible hair overlapping its opaque support must
    # stay in front regardless of estimated depth; distant outer locks may go rear.
    facebase=compose([e for e in prev['drawOrder'] if e['file'] in ['face.png','face_far.png','ears.png']])
    fa=np.array(facebase)[:,:,3]
    df=np.array(Image.open(TASK/'_review/depth_recovery_v2/input/front hair_depth.png')).astype(float)/255
    db=np.array(Image.open(TASK/'_review/depth_recovery_v2/input/back hair_depth.png')).astype(float)/255
    origfront=np.array(Image.open(TASK/'fronthair.png'))[:,:,3]
    d=np.where(origfront>15,df,db)
    # Depth is only a tentative guide on original PSD-supported locations.
    oldhair=np.array(Image.open(TASK/'_review/assembly_v31/cloud_hair_union.png'))
    reliable=(oldhair[:,:,3]>220)&(hair[:,:,3]>220)
    threshold=.278
    near=(d<threshold)&reliable
    near|=(fa>0)&(hair[:,:,3]>0)
    # Continuous crown/part must not become a depth-cut seam or exposed scalp.
    near|=yy<190
    front=np.where(near[:,:,None],hair,0).astype('uint8')
    rear=np.where((~near)[:,:,None],hair,0).astype('uint8')
    assert np.array_equal(front.astype('uint16')+rear.astype('uint16'),hair)
    # Hidden old pixels are retained only under fully opaque unchanged face.
    hidden=cv2.erode((fa==255).astype('uint8'),np.ones((9,9),np.uint8))>0
    hidden&=hair[:,:,3]==0
    underfill=oldhair.copy();underfill[~hidden]=0
    back=Image.fromarray(underfill);back.alpha_composite(Image.fromarray(rear))
    for name,a in [('fronthair',front),('rear_visible',rear),('rear_hidden',underfill)]:Image.fromarray(a).save(DEST/(name+'.png'))
    back.save(DEST/'backhair.png')
    m=json.loads(json.dumps(prev))
    for e in m['drawOrder']:
        if e['file'] in ['fronthair.png','backhair.png']:
            e['asset']=(DEST/e['file']).relative_to(TASK).as_posix();e['assetSha256']=sha(DEST/e['file'])
    m['hairRebuild']={'choice':'A original visible hair','pixelSource':srcpath.relative_to(TASK).as_posix(),'sourceSha256':sha(srcpath),'depthRole':'tentative guide only on PSD-supported locations; face overlap and continuous crown take precedence','hiddenUnderfill':'old PSD only inside eroded opaque unchanged face and outside visible source hair','motion':'shared head field; no independent animation acceptance'}
    m['reviewStatus']='pending';m['rollback']='_review/assembly_v34/assembly.json'
    write(DEST/'assembly.json',m)
    write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    result=compose(m['drawOrder']);result.save(DEST/'assembled.png')
    for color,name in [('#f6f4f2','light'),('#252831','dark')]:
        b=Image.new('RGBA',result.size,color);b.alpha_composite(result);b.convert('RGB').save(DEST/f'assembled_{name}.png')
    guide=hair.copy();guide[near,:3]=(40,185,230);guide[~near,:3]=(170,90,215)
    Image.fromarray(guide).save(DEST/'ownership_guide.png')
    tiles=[('Original',Image.fromarray(src)),('v34 PSD hair',compose(prev['drawOrder'])),(DEST.name+' source hair',result),('Front cyan / rear purple',Image.fromarray(guide))]
    sheet=Image.new('RGB',(1360,355),'#dedede');draw=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        bg=Image.new('RGBA',im.size,'#dedede');bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB').crop((340,0,680,330)),(i*340,25));draw.text((i*340+5,7),label,fill='black')
    sheet.save(DEST/'hair_review.png')
    for off in ['fronthair.png','backhair.png']:
        compose([e for e in m['drawOrder'] if e['file']!=off]).save(DEST/(off[:-4]+'_off.png'))
    assert [e for e in m['drawOrder'] if e['file'] not in ['fronthair.png','backhair.png']]==[e for e in prev['drawOrder'] if e['file'] not in ['fronthair.png','backhair.png']]
    assert np.all(fa[underfill[:,:,3]>0]==255)
    valid=hair[:,:,3]>0
    assert np.array_equal(hair[:,:,:3][valid],src[:,:,:3][valid])
    write(DEST/'hair_qa.json',{'visibleHairPixels':int(valid.sum()),'sourceRgbExact':True,'disjointVisibleUnionExact':True,'nonHairEntriesUnchanged':True,'hiddenPixels':int((underfill[:,:,3]>0).sum()),'hiddenUnderOpaqueFace':True,'depthReliablePixels':int(reliable.sum()),'staticVisualAcceptance':'pending','independentMotion':'not enabled'})

if __name__=='__main__':main()
