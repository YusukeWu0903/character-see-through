"""Source-pixel mouth transplant using the established facial-part extractor."""
from pathlib import Path
import hashlib, json, math, subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
TASK = ROOT / 'outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138'
SOURCE = ROOT / 'Character/002_Miffy/mouth_type.png'
HEAD = TASK / '_review/cheek_outline_v1/head.png'
DEST = TASK / '_review/mouth_v2'
MODES = [('closed', '閉唇'), ('slight', '微張'), ('a', '張口 A'),
         ('e', '橫向 E'), ('o', '圓唇 O'), ('u', '小幅嘟唇 U')]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()

def smooth(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    assets, registrations = {}, {}
    for index, (mode, label) in enumerate(MODES):
        ox, oy = index % 3 * 512, index // 3 * 512
        config = {
            'sourceSize': [1536, 1024], 'canvas': [1280, 1280],
            'transform': {'scale': .31, 'translateX': 626-(260+ox)*.31,
                          'translateY': 145-(363+oy)*.31},
            'anchors': {'sourceIrisCenters': [[181+ox,236+oy],[334+ox,233+oy]],
                        'targetIrisCenters': [[601,103.6],[649,102]],
                        'mouthAnchor': [626,145],
                        'note': 'Eye-span registration, then lip-midline alignment; no source skin transplanted.'},
            'parts': {'mouth': {'roi': [214+ox,338+oy,310+ox,403+oy],
                     'baselineX': [209+ox,315+ox],
                     'ellipse': [262+ox,369+oy,48,34], 'difference': [6,24]}}
        }
        config_path = DEST / f'registration_{mode}.json'
        config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
        output = DEST / f'mouth_{mode}.png'
        subprocess.run(['node', str(ROOT/'skills/character-assembly-repair/scripts/transplant_face_part.mjs'),
                        str(SOURCE), str(config_path), 'mouth', str(output)], check=True)
        assets[mode] = {'asset': output.name, 'sha256': digest(output), 'label': label}
        registrations[mode] = config
    # Same local feature-free backing principle as Eris; skin is sampled only
    # from clean cheeks on the same row. A tapered oval avoids a skin rectangle.
    head = Image.open(HEAD).convert('RGBA')
    original = head.copy()
    pixels, src = head.load(), original.load()
    bounds = [606,133,647,167]
    for y in range(bounds[1],bounds[3]):
        sample_left,sample_right = (606,646) if y<155 else (617,635)
        left, right = src[sample_left,y],src[sample_right,y]
        if left[3]<250 or right[3]<250 or min(left[:3]+right[:3])<180:
            raise ValueError(f'Contaminated skin sample row {y}')
        for x in range(bounds[0],bounds[2]):
            d = math.hypot((x-626)/19, (y-148)/18.5)
            weight = 1-smooth((d-.72)/.28)
            t=max(0,min(1,(x-sample_left)/(sample_right-sample_left)))
            skin=[left[c]*(1-t)+right[c]*t for c in range(3)]
            pixels[x,y]=tuple(round(src[x,y][c]*(1-weight)+skin[c]*weight) for c in range(3))+(src[x,y][3],)
    backing = DEST/'head_mouthless.png'
    head.save(backing)
    # Native full-canvas assets remain 1280; this labelled contact sheet is QA only.
    contact=Image.new('RGB',(600,330),(65,69,77))
    for index,mode in enumerate(['original','backing']+[mode for mode,label in MODES]):
        full=original.copy() if mode=='original' else head.copy()
        if mode not in ['original','backing']:
            full.alpha_composite(Image.open(DEST/f'mouth_{mode}.png'))
        crop=full.crop((550,40,700,185))
        tile=Image.new('RGBA',(150,165),(65,69,77,255));tile.alpha_composite(crop,(0,20))
        ImageDraw.Draw(tile).text((4,3),mode,fill='white')
        contact.paste(tile.convert('RGB'),(index%4*150,index//4*165))
    contact.save(DEST/'qa_contact.png')
    manifest = {'schemaVersion': 1, 'task': TASK.name, 'candidate': 'mouth_v2',
        'reviewStatus': 'pending', 'nonProduction': True, 'canvas': [1280,1280],
        'source': str(SOURCE.relative_to(ROOT)).replace('\\','/'), 'sourceSha256': digest(SOURCE),
        'sourceKind': 'pixel_transplant_from_user_mouth_sheet',
        'targetHead': str(HEAD.relative_to(TASK)).replace('\\','/'), 'targetHeadSha256': digest(HEAD),
        'backing': {'asset': backing.name, 'sha256': digest(backing)}, 'mouths': assets,
        'registrations': registrations, 'backingBounds': bounds,
        'drawOrder': ['head_mouthless', 'selected_mouth', 'existing_eye_rig', 'existing_head_surface_and_light'],
        'talkSequence': ['closed','slight','a','slight','e','closed','o','u','slight','closed'],
        'talkStepSeconds': .16, 'defaultMouth': 'original', 'autoTalkDefault': False,
        'rollback': '_review/motion_v43/rig.json', 'transition': 'discrete-source-art-switch'}
    (DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    chain=[]; path=TASK/'_review/motion_v43/rig.json'
    while True:
        value=json.loads(path.read_text(encoding='utf-8-sig'));chain.append(value)
        if not value.get('extends'): break
        path=TASK/value['extends']
    rig=chain.pop()
    while chain:
        newer=chain.pop(); limits=rig.get('limits',[])+newer.get('limits',[])
        rig.update(newer);rig['limits']=limits
    rig.pop('extends',None);rig.pop('extendsSha256',None)
    rig.update({'name':'Miffy six source-drawn mouths v45 · non-production',
                'candidate':'motion_v45','rollbackManifest':'_review/motion_v43/rig.json',
                'mouthRig':{'manifest':'_review/mouth_v2/manifest.json',
                            'manifestSha256':digest(DEST/'manifest.json')}})
    out=TASK/'_review/motion_v45';out.mkdir(exist_ok=True)
    (out/'rig.json').write_text(json.dumps(rig,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Built mouth_v2 and flattened motion_v45; originals preserved.')

if __name__=='__main__': main()
