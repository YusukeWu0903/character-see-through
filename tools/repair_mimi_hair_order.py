"""Source-supported occluding back-hair slot; preserve rejected v1 evidence."""
from pathlib import Path
import json,hashlib,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
TASK=ROOT/'outputs/seethrough_local/Mimi_cloud_20260927'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
    dest=TASK/'_review/assembly_v2';motion=TASK/'_review/motion_v2'
    if dest.exists() or motion.exists():raise ValueError('Refuse overwrite')
    dest.mkdir();motion.mkdir()
    assembly=json.loads((TASK/'_review/assembly_v1/assembly.json').read_text(encoding='utf8'))
    slots=['shadow','legwear','footwear','neck','bottomwear','topwear','handwear','face','nose','mouth','backhair','ears','eyebrow','eyewhite','irides','eyelash','fronthair']
    lookup={e['file']:e for e in assembly['drawOrder']}
    assembly['drawOrder']=[lookup[s+'.png'] for s in slots]
    assembly['constraints']=[c for c in assembly['constraints'] if c['behind']!='backhair.png']
    assembly['constraints'] += [{'behind':'face.png','inFrontOf':'backhair.png','reason':'Cloud face includes reconstructed scalp; source back hair covers this scalp region.'},{'behind':'backhair.png','inFrontOf':'ears.png','reason':'Source visible screen-right ear is in front of back hair; front hair still occludes screen-left ear.'}]
    assembly['rollback']='_review/assembly_v1/assembly.json'
    assembly['occlusion']='Back hair is an occluding slot over reconstructed scalp; ears follow above it, source PNGs unchanged.'
    ap=dest/'assembly.json';ap.write_text(json.dumps(assembly,ensure_ascii=False,indent=2),encoding='utf8')
    comp=Image.new('RGBA',(1280,1280))
    for e in assembly['drawOrder']:comp.alpha_composite(Image.open(TASK/e['file']).convert('RGBA'))
    comp.save(dest/'assembled.png')
    for bg,n in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        tile=Image.new('RGBA',comp.size,bg);tile.alpha_composite(comp);tile.convert('RGB').save(dest/('assembled_'+n+'.png'))
    (dest/'psd_order.json').write_text(json.dumps([{'name':e['name'],'file':e['file']} for e in assembly['drawOrder']],indent=2),encoding='utf8')
    shutil.copyfile(TASK/'_review/assembly_v1/source_registered.png',dest/'source_registered.png')
    rig=json.loads((TASK/'_review/motion_v1/rig.json').read_text(encoding='utf8'))
    rig.update(candidate='motion_v2',assembly='_review/assembly_v2/assembly.json',assemblySha256=sha(ap),rollbackManifest='_review/motion_v1/rig.json')
    (motion/'rig.json').write_text(json.dumps(rig,ensure_ascii=False,indent=2),encoding='utf8')
    shutil.copyfile(TASK/'_review/motion_v1/SPEC.md',motion/'SPEC.md')
    print(ap)
if __name__=='__main__':main()
