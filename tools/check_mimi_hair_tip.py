import cv2,numpy as np
from PIL import Image
from build_mimi_assembly_v3 import TASK,write
report=[]
for v in [37,52]:
    p=TASK/f'_review/assembly_v{v}'
    a=np.array(Image.open(p/'fronthair.png'))[:,:,3].astype('float32')/255
    b=np.array(Image.open(p/'backhair.png'))[:,:,3].astype('float32')/255
    for shift in [-.75,-.5,-.25,0,.25,.5,.75]:
        M=np.float32([[1,0,shift],[0,1,0]])
        wa=cv2.warpAffine(a,M,(1280,1280));wb=cv2.warpAffine(b,M,(1280,1280))
        d=cv2.warpAffine(a+b,M,(1280,1280))-wa-wb*(1-wa)
        roi=d[235:315,385:475]
        report.append({'version':v,'shift':shift,'lossOver0_1':int((roi>.1).sum()),'maxLoss':float(roi.max())})
write(TASK/'_review/assembly_v52/filtering_qa.json',report)
print(report)
