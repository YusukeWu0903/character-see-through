"""Inspect and narrowly repair the source hair/face temple boundary."""
from PIL import Image, ImageDraw
import json
from build_mimi_assembly_v3 import TASK, compose

DEST=TASK/'_review/assembly_v38'

def diagnostic():
    DEST.mkdir(exist_ok=False)
    m=json.loads((TASK/'_review/assembly_v37/assembly.json').read_text(encoding='utf8'))
    source=Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA')
    hair=Image.open(TASK/'_review/assembly_v37/visible_hair_union.png').convert('RGBA')
    face=compose([e for e in m['drawOrder'] if e['file'] in ['face.png','face_far.png']])
    tiles=[('Source',source),('v37',compose(m['drawOrder'])),('Hair solo',hair),('Face solo',face)]
    sheet=Image.new('RGB',(1760,510),'#dddddd');d=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate(tiles):
        bg=Image.new('RGBA',im.size,'#dddddd');bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB').crop((420,160,475,220)).resize((440,480)),(i*440,30))
        d.text((i*440+5,8),label,fill='black')
    sheet.save(DEST/'diagnosis.png')

if __name__=='__main__':diagnostic()
