"""Pin latest static assembly to the existing unchanged Mimi motion evaluator."""
import json
from build_mimi_assembly_v3 import TASK,sha,write

dest=TASK/'_review/motion_v50'
dest.mkdir(exist_ok=False)
assembly=TASK/'_review/assembly_v50/assembly.json'
m=json.loads(assembly.read_text(encoding='utf8'))
r=json.loads((TASK/'_review/motion_v24/rig.json').read_text(encoding='utf8'))
r.update(candidate='motion_v50',name='Mimi v50 latest assembly — dynamic review',
    assembly='_review/assembly_v50/assembly.json',assemblySha256=sha(assembly),
    layerCount=len(m['drawOrder']),rollbackManifest='_review/motion_v24/rig.json')
r['bindings']={e['file'].removesuffix('.png'):r['bindings'].get(e['file'].removesuffix('.png'),e['parent']) for e in m['drawOrder']}
r['bindings']['front_hair_shadow']='frontHair'
r['bindings']['face_far']='head'
r['limits']=['Latest v50 assembly is pending user review; ear repair not accepted.',
    'Existing Mimi idle/pointer chest evaluator unchanged; no new head transplant.',
    'All head fragments share the head motion field; independent hair remains disabled.',
    'Hair shadow is a separate layer; FACE retains residual baked shadow; owner-toggle clipping not integrated.',
    'No blink assets; blink remains disabled. No production default changed.']
write(dest/'rig.json',r)
