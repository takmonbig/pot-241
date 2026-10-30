from PIL import Image, ImageFilter
import numpy as np
from collections import deque
im=np.array(Image.open('logo_src.png').convert('RGB')).astype(int)
h,w,_=im.shape
mx=im.max(2); mn=im.min(2)
mean=im.mean(2); bgish=(mean>150)&(im[...,2]>0.62*im[...,0])&(mx-mn<95)
lab=np.zeros((h,w),bool); seen=np.zeros((h,w),bool)
ys0,xs0=np.nonzero(bgish)
for sy,sx in zip(ys0,xs0):
    if seen[sy,sx]: continue
    q=deque([(sy,sx)]); seen[sy,sx]=True; comp=[]; touches=False
    while q:
        y,x=q.popleft(); comp.append((y,x))
        if y==0 or x==0 or y==h-1 or x==w-1: touches=True
        for ny,nx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1)):
            if 0<=ny<h and 0<=nx<w and bgish[ny,nx] and not seen[ny,nx]:
                seen[ny,nx]=True; q.append((ny,nx))
    if touches or len(comp)>120:
        ys,xs=zip(*comp); lab[list(ys),list(xs)]=True
alpha=np.where(lab,0,255).astype(np.uint8)
a=Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
src=Image.open('logo_src.png').convert('RGBA'); src.putalpha(a)
src=src.crop(a.getbbox()); print(a.getbbox(), src.size); src.save('/tmp/logo_full.png')
