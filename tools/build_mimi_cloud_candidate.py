"""Import audit and task-local calibration over the established PSD export route."""
from pathlib import Path
import hashlib,json,shutil
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
TASK=ROOT/'outputs/seethrough_local/Mimi_cloud_20260927'
SOURCE=ROOT/'Character/003_Mimi/Mimi_full_body_casual.psd'
DEST=TASK/'_review/assembly_v1'
MOTION=TASK/'_review/motion_v1'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest().upper()
def write(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def compose(entries):
    im=Image.new('RGBA',(1280,1280))
    for e in entries:im.alpha_composite(Image.open(TASK/e.get('asset',e['file'])).convert('RGBA'))
    return im
def main():
    if DEST.exists() or MOTION.exists():raise ValueError('Refuse to overwrite candidates')
    DEST.mkdir(parents=True);MOTION.mkdir()
    order=json.loads((TASK/'_order.json').read_text(encoding='utf8'))
    shutil.copyfile(TASK/'_order.json',TASK/'_cloud_order.json')
    # Cloud's 1280 square uses aspect-fit 1086x1448 -> 960x1280, x offset 160.
    shadow=Image.open(ROOT/'Character/003_Mimi/Mimi_full_body_casual_shadow.png').convert('RGBA')
    full=Image.new('RGBA',(1280,1280));full.alpha_composite(shadow.resize((960,1280),Image.Resampling.LANCZOS),(160,0));full.save(TASK/'shadow.png')
    source=Image.open(ROOT/'Character/003_Mimi/Mimi_full_body_casual_rb.png').convert('RGBA')
    aligned=Image.new('RGBA',(1280,1280));aligned.alpha_composite(source.resize((960,1280),Image.Resampling.LANCZOS),(160,0));aligned.save(DEST/'source_registered.png')
    original=[{'name':'shadow','file':'shadow.png'},*order]
    write(TASK/'_order.json',original)
    byname={e['file']:e for e in original}
    names=['shadow','backhair','legwear','footwear','neck','bottomwear','topwear','handwear','ears','face','nose','mouth','eyebrow','eyewhite','irides','eyelash','fronthair']
    labels=['落地陰影','後髮','雙腿','雙腳','脖子','裙子','上衣與胸口','雙臂','耳朵','臉部','鼻子','嘴巴','眉毛','眼白','虹膜','睫毛','前髮']
    face={'ears','face','nose','mouth','eyebrow','eyewhite','irides','eyelash'}
    bindings={n:('root' if n=='shadow' else 'head' if n in face else 'frontHair' if n=='fronthair' else 'backHair' if n=='backhair' else 'body' if n in {'legwear','footwear','bottomwear'} else 'torso') for n in names}
    entries=[{**byname[n+'.png'],'label':label,'group':'ground' if n=='shadow' else 'character','parent':bindings[n],'assetSha256':sha(TASK/(n+'.png'))} for n,label in zip(names,labels)]
    manifest={'schemaVersion':1,'task':TASK.name,'nonProduction':True,'reviewStatus':'pending','source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':sha(SOURCE),'canvas':[1280,1280], 'drawOrder':entries,
      'constraints':[{'behind':'backhair.png','inFrontOf':'face.png','reason':'後髮位於臉部與耳朵後方'},{'behind':'eyewhite.png','inFrontOf':'irides.png','reason':'虹膜在眼白前方'},{'behind':'irides.png','inFrontOf':'eyelash.png','reason':'睫毛覆蓋虹膜邊緣'},{'behind':'legwear.png','inFrontOf':'bottomwear.png','reason':'裙擺覆蓋腿部上緣'}],
      'rollback':'_cloud_order.json','occlusion':'Source cloud parts; no new painted anatomy.','review':'Agent visual review and user acceptance tracked separately in QA.md'}
    ap=DEST/'assembly.json';write(ap,manifest)
    raw=compose(original);raw.save(DEST/'cloud_original_order.png')
    comp=compose(entries);comp.save(DEST/'assembled.png')
    for bg,name in [((245,245,245,255),'light'),((30,34,40,255),'dark')]:
        canvas=Image.new('RGBA',comp.size,bg);canvas.alpha_composite(comp);canvas.convert('RGB').save(DEST/('assembled_'+name+'.png'))
    audit=[]
    sheet=Image.new('RGB',(4*320,5*345),(220,225,230));d=ImageDraw.Draw(sheet)
    for i,e in enumerate(original):
        im=Image.open(TASK/e['file']).convert('RGBA');a=np.array(im)[:,:,3]
        audit.append({'name':e['name'],'file':e['file'],'sha256':sha(TASK/e['file']),'canvas':list(im.size),'alphaBounds':im.getchannel('A').getbbox(),'nonzeroPixels':int((a>0).sum())})
        tile=Image.new('RGBA',im.size,(220,225,230,255));tile.alpha_composite(im)
        sheet.paste(tile.convert('RGB').resize((320,320)),((i%4)*320,(i//4)*345+25));d.text(((i%4)*320+5,(i//4)*345+5),e['name'],fill='black')
    sheet.save(DEST/'layer_inventory.png');write(TASK/'cloud_layer_audit.json',{'cloudPartCount':16,'shadowCount':1,'missingVsLocal17':['earwear'],'allCloudPartsNonempty':all(a['nonzeroPixels']>0 for a in audit),'sourcePSD':str(SOURCE.relative_to(ROOT)),'layers':audit})
    write(DEST/'psd_order.json',[{'name':e['name'],'file':e['file']} for e in entries])
    bands=[(0,12,3,2),(200,12,3,2),(310,13,3,0),(470,15,2,0),(590,16,0,0),(820,7,0,0),(1020,1,0,0),(1047,0,0,0),(1252,0,0,0)]
    rig={'schemaVersion':1,'task':TASK.name,'candidate':'motion_v1','characterName':'Mimi','name':'Mimi cloud idle and pointer chest review','reviewStatus':'pending','nonProduction':True,'coordinateSpace':'canvas-pixels','canvas':[1280,1280],'layerCount':17,'sourceSha256':sha(SOURCE),'assembly':'_review/assembly_v1/assembly.json','assemblySha256':sha(ap),'rollbackManifest':'_review/assembly_v1/assembly.json','staticLayers':['shadow'],
      'grounding':{'mode':'shared-stance-field','groundY':1252,'stripHeight':4,'bands':[{'y':y,'body':b,'torso':t,'head':h} for y,b,t,h in bands]},
      'pointerFollow':{'mode':'smoothed-additive','centerX':610,'radius':470,'responseRate':7,'body':.18,'torso':.06,'head':.03},
      'nodes':[{'id':n,'parent':parent,'pivot':pivot,'motion':'none','maxDegrees':0,'phase':0} for n,parent,pivot in [('root',None,[0,0]),('body','root',[670,1252]),('torso','body',[650,570]),('head','torso',[525,280]),('backHair','head',[520,80]),('frontHair','head',[520,80])]],'bindings':bindings,
      'bustField':{'mode':'topwear-local-bilateral-pixel-xy','centerX':520,'centerY':445,'centers':[[480,445],[558,445]],'radiusX':64,'radiusY':84,'lowerRadiusY':70,'maxPixels':12,'followMaxPixels':12,'tileWidth':16,'tileHeight':3,'springFrequency':8,'springDamping':.6,'followSpringFrequency':7,'followSpringDamping':.65,'defaultStrength':50},
      'renderer':{'mode':'shared-webgl-scene-stage1','module':'mesh-renderer.mjs','nativeTextureSize':1280,'presentation':'canvas-copy','gpuHead':False},
      'limits':['胸口為上衣與皮膚共用的局部圖像變形；眨眼停用，尚無閉眼替換素材。','雙臂及雙腿各合併一層，待機使用共用變形保持接縫與腳部位置；未製作獨立關節。','陰影固定於地面；此版待使用者動態驗收。']}
    write(MOTION/'rig.json',rig)
    (MOTION/'SPEC.md').write_text('# Mimi motion v1\n\nUser requested assembly, idle sway and mouse-driven chest motion; no blink. Reuse shared renderer and elapsed-time pointer/spring semantics. Native 1280 textures. Pointer -100/0/+100 moves chest screen-left/neutral/screen-right. Idle adds vertical chest lag without lateral input. Feet below y1047 and shadow remain fixed. Preserve source PSD and raw cloud order. Compare separate idle/follow, both, reversal, intermediate/extreme states, pause/reset, guide restoration and light/dark backgrounds. User artistic acceptance remains pending.\n',encoding='utf8')
    print(json.dumps({'task':TASK.name,'cloudParts':16,'missing':['earwear'],'candidate':str(MOTION)},ensure_ascii=False))
if __name__=='__main__':main()
