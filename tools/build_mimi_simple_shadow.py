"""Simple single-colour transparent hair shadow; no inverse matting or strands."""
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from build_mimi_assembly_v3 import TASK, sha, write, compose, polygon

DEST=TASK/'_review/assembly_v46'
def main():
    DEST.mkdir(exist_ok=False)
    m=json.loads((TASK/'_review/assembly_v40/assembly.json').read_text(encoding='utf8'))
    # Existing local backing cleanup kept separate from the shadow construction.
    # No rejected inverse-matted hair/face assets from v41-v45 are used.
    mask=polygon([(500,125),(503,125),(484,147),(469,169),(459,189),
        (451,209),(445,230),(445,241),(441,246),(440,240),(441,227),
        (447,207),(454,187),(464,167),(479,145)])
    mask=np.array(Image.fromarray(mask).filter(ImageFilter.GaussianBlur(.7)))
    receiver=np.array(compose([e for e in m['drawOrder'] if e['file'] in ['face.png','face_far.png']]))[:,:,3]
    a=np.zeros((1280,1280,4),dtype='uint8');a[:,:,:3]=(148,98,99)
    a[:,:,3]=np.rint(mask.astype(float)/255*receiver/255*70).astype('uint8');a[a[:,:,3]==0]=0
    Image.fromarray(a).save(DEST/'front_hair_shadow.png');Image.fromarray(mask).save(DEST/'shadow_shape.png')
    e=next(e for e in m['drawOrder'] if e['file']=='front_hair_shadow.png')
    e['asset']='_review/assembly_v46/front_hair_shadow.png';e['assetSha256']=sha(DEST/'front_hair_shadow.png')
    m['shadowOwnership']={'owner':'fronthair','receivers':['face','face_far'],'method':'single constant RGB fill, source-guided thin shape, alpha-only soft edge','colourRGB':[148,98,99],'maxAlpha':70,'faceBacking':'existing local estimated cleanup from v40; not accepted or source-exact, retained only for this comparison','noHairPixelsInShadow':True,'staticReview':'pending','motionReview':'not integrated'}
    m['rollback']='_review/assembly_v37/assembly.json'
    # Shadow is behind features as well as hair, not a colour film over the eyes.
    m['drawOrder'].remove(e)
    m['drawOrder'].insert(next(i for i,x in enumerate(m['drawOrder']) if x['file']=='nose.png'),e)
    write(DEST/'assembly.json',m);write(DEST/'psd_order.json',[{'name':e['name'],'file':e.get('asset',e['file'])} for e in m['drawOrder']])
    assembled=compose(m['drawOrder']);assembled.save(DEST/'assembled.png')
    off=compose([e for e in m['drawOrder'] if e['file']!='front_hair_shadow.png']);off.save(DEST/'shadow_off.png')
    for color,name in [('#f6f4f2','light'),('#252831','dark')]:
        bg=Image.new('RGBA',assembled.size,color);bg.alpha_composite(assembled);bg.convert('RGB').save(DEST/f'assembled_{name}.png')
    source=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    tiles=[('Original',source),('Backing + hair / shadow off',off),('Simple colour shadow on',assembled),('Shadow only',Image.fromarray(a))]
    sheet=Image.new('RGB',(1360,355),'#dedede');d=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        bg=Image.new('RGBA',im.size,'#dedede');bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB').crop((340,0,680,330)),(340*i,25));d.text((340*i+3,7),label,fill='black')
    sheet.save(DEST/'simple_shadow_review.png')
    visible=a[:,:,3]>0;assert np.all(a[:,:,:3][visible]==[148,98,99]);assert np.all(receiver[visible]>0)
    write(DEST/'shadow_qa.json',{'singleColourOnly':True,'rgb':[148,98,99],'alphaMax':int(a[:,:,3].max()),'visibleShadowPixels':int(visible.sum()),'noStrandExtractionOrInverseMatting':True,'staticAcceptance':'pending','motionAcceptance':'not integrated'})

if __name__=='__main__':main()
