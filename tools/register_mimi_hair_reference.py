"""Read-source registration evidence for Mimi's supplied hair / bald references."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image
from build_mimi_assembly_v3 import ROOT, TASK, write, sha

def white(a):
    return np.rint(a[:,:,:3]*(a[:,:,3:]/255)+255*(1-a[:,:,3:]/255)).astype('uint8')

def fit(name, scales, roi, mask_box):
    a=np.asarray(Image.open(ROOT/'Character/003_Mimi'/name).convert('RGBA'))
    source=np.asarray(Image.open(TASK/'_review/assembly_v2/source_registered.png').convert('RGBA'))
    target=cv2.cvtColor(white(source),cv2.COLOR_RGB2GRAY)
    target=target[roi[1]:roi[3],roi[0]:roi[2]]
    mask=np.zeros(a.shape[:2],np.uint8)
    x0,y0,x1,y1=mask_box
    mask[y0:y1,x0:x1]=(a[y0:y1,x0:x1,3]>220).astype('uint8')*255
    x,y,w,h=cv2.boundingRect(mask)
    template=cv2.cvtColor(white(a),cv2.COLOR_RGB2GRAY)[y:y+h,x:x+w]
    mask=mask[y:y+h,x:x+w]
    scores=[]
    for s in scales:
        size=(round(w*s),round(h*s))
        t=cv2.resize(template,size,interpolation=cv2.INTER_AREA)
        m=cv2.resize(mask,size,interpolation=cv2.INTER_NEAREST)
        if size[0]>target.shape[1] or size[1]>target.shape[0]:continue
        result=cv2.matchTemplate(target,t,cv2.TM_SQDIFF_NORMED,mask=m)
        result[~np.isfinite(result)]=1e6
        score,_,loc,_=cv2.minMaxLoc(result)
        scores.append({'scale':float(s),'tx':float(loc[0]+roi[0]-x*s),'ty':float(loc[1]+roi[1]-y*s),'score':score})
    best=min(scores,key=lambda r:r['score'])
    return a,best,sorted(scores,key=lambda r:r['score'])[:8]

def warp(a,fit):
    # Resample premultiplied colour to preserve native translucent hair edges.
    alpha=a[:,:,3:]/255.
    prem=np.concatenate((a[:,:,:3]*alpha,alpha*255),axis=2).astype(np.float32)
    s,tx,ty=fit['scale'],fit['tx'],fit['ty']
    out=cv2.warpAffine(prem,np.array([[s,0,tx],[0,s,ty]],np.float32),(1280,1280),flags=cv2.INTER_CUBIC)
    out[:,:,3]=np.clip(out[:,:,3],0,255)
    rgb=np.divide(out[:,:,:3]*255,out[:,:,3:],out=np.zeros_like(out[:,:,:3]),where=out[:,:,3:]>0)
    return np.rint(np.concatenate((np.clip(rgb,0,255),out[:,:,3:]),axis=2)).astype('uint8')

def main():
    dest=TASK/'_review/hair_reference_registration'
    if dest.exists():raise ValueError('Preserve previous registration evidence')
    dest.mkdir()
    reports={}
    for name,scales,roi,box in [
        ('Mimi_hair.png',np.arange(.275,.316,.001),(330,0,705,335),(0,225,1060,1220)),
        ('Mimi_breast_bd.png',np.arange(.38,.451,.001),(400,155,645,320),(290,365,660,715))]:
        a,best,top=fit(name,scales,roi,box)
        aligned=warp(a,best)
        Image.fromarray(aligned).save(dest/(name[:-4]+'_registered.png'))
        reports[name]={'sourceSha256':sha(ROOT/'Character/003_Mimi'/name),'fit':best,'alternatives':top,
                       'method':'masked grayscale similarity search; uniform scale + translation, no aspect stretch'}
        print(name,best)
    write(dest/'registration.json',reports)

if __name__=='__main__':main()
