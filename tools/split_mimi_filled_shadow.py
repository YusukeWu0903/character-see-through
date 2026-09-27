"""Single-colour filled shadow split, preserving original PSD neutral appearance."""
import json
import numpy as np
from PIL import Image,ImageDraw
from build_mimi_assembly_v3 import TASK,sha,write,compose

DEST=TASK/'_review/assembly_v49'
def main():
    DEST.mkdir(exist_ok=False)
    m=json.loads((TASK/'_review/assembly_v47/assembly.json').read_text(encoding='utf8'))
    raw=np.array(Image.open(TASK/'_review/assembly_v47/original_psd_face.png').convert('RGBA'))
    draft=np.array(Image.open(TASK/'_review/assembly_v47/filled_shadow_shape_draft.png').convert('RGBA'))
    colour=np.array([151,103,99],dtype=float)
    # Only undo this chosen simple fill. No source hair/skin residual extraction,
    # feature transplant or generated skin. Cap avoids clipped backing channels.
    alpha=draft[:,:,3].astype(float)/255
    capacity=np.min((255-raw[:,:,:3].astype(float))/(255-colour),axis=2)
    alpha=np.floor(np.minimum(alpha,np.maximum(capacity,0))*255)/255
    alpha[raw[:,:,3]<255]=0
    backing=raw.copy();backing[:,:,:3]=np.rint((raw[:,:,:3]-alpha[:,:,None]*colour)/(1-alpha[:,:,None])).clip(0,255).astype('uint8')
    shadow=np.zeros_like(raw);shadow[:,:,:3]=colour.astype('uint8');shadow[:,:,3]=np.rint(alpha*255).astype('uint8');shadow[shadow[:,:,3]==0]=0
    Image.fromarray(shadow).save(DEST/'front_hair_shadow.png')
    # Keep original disjoint near/far masks, changing RGB only inside fill.
    for e in m['drawOrder']:
        if e['file'] in ['face.png','face_far.png']:
            a=np.array(Image.open(TASK/e['asset']).convert('RGBA'));visible=a[:,:,3]>0
            a[:,:,:3][visible]=backing[:,:,:3][visible];Image.fromarray(a).save(DEST/e['file'])
        if e['file'] in ['face.png','face_far.png','front_hair_shadow.png']:
            e['asset']=(DEST/e['file']).relative_to(TASK).as_posix();e['assetSha256']=sha(DEST/e['file'])
    m['shadowOwnership']={'owner':'fronthair','receivers':['face','face_far'],'method':'one-colour filled overlap; remove exactly that chosen fill from original FACE backing, recomposition checked before use','colourRGB':[151,103,99],'faceAlphaUnchanged':True,'visibleShadowDetachedWithinFilledRegion':True,'outsideFilledRegion':'original FACE unchanged; other shading not detached','motionIntegration':False,'reviewStatus':'pending'}
    write(DEST/'assembly.json',m);write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    result=compose(m['drawOrder']);baseline=Image.open(TASK/'_review/assembly_v47/original_face_baseline.png').convert('RGBA')
    diff=np.abs(np.array(result).astype(int)-np.array(baseline).astype(int));assert diff.max()<=2
    result.save(DEST/'assembled.png')
    off=compose([e for e in m['drawOrder'] if e['file']!='front_hair_shadow.png']);off.save(DEST/'shadow_off.png')
    for col,name in [('#f6f4f2','light'),('#252831','dark')]:
        bg=Image.new('RGBA',result.size,col);bg.alpha_composite(result);bg.convert('RGB').save(DEST/f'assembled_{name}.png')
    tiles=[('Original PSD FACE baseline',baseline),('Filled shadow split - on',result),('Shadow off',off),('Single filled colour layer',Image.fromarray(shadow))]
    sheet=Image.new('RGB',(1360,355),'#dedede');d=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        bg=Image.new('RGBA',im.size,'#dedede');bg.alpha_composite(im);sheet.paste(bg.convert('RGB').crop((340,0,680,330)),(340*i,25));d.text((340*i+3,7),label,fill='black')
    sheet.save(DEST/'filled_shadow_review.png')
    write(DEST/'split_qa.json',{'neutralVersusOriginalPsdFaceMaxDifference':int(diff.max()),'faceAlphaUnchanged':True,'singleColourRGB':[151,103,99],'shadowPixels':int((shadow[:,:,3]>0).sum()),'alphaMax':int(shadow[:,:,3].max()),'noHairInShadow':True,'motionIntegrated':False,'visualAcceptance':'pending'})

if __name__=='__main__':main()
