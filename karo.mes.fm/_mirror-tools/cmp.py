import sys
from PIL import Image, ImageChops
a,b,out=sys.argv[1:4]; scale=float(sys.argv[4]) if len(sys.argv)>4 else 0.5
A=Image.open(a).convert('RGB'); B=Image.open(b).convert('RGB')
h=max(A.height,B.height); w=A.width
o=Image.new('RGB',(w*2+10,h),'red'); o.paste(A,(0,0)); o.paste(B,(w+10,0))
# diff score per 500px band
for y in range(0,min(A.height,B.height),500):
    d=ImageChops.difference(A.crop((0,y,w,min(y+500,A.height))),B.crop((0,y,w,min(y+500,B.height)))).convert('L')
    s=sum(d.histogram()[30:])/ (w*500)
    if s>0.02: print(f'band {y}: {s:.3f}')
o=o.resize((int(o.width*scale),int(o.height*scale)))
o.save(out,quality=80)
