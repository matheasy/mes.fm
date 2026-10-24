#!/usr/bin/env python3
"""Interim 1200x630 share images for the classic calculator sites (2026-10-24): brand-colour background, the site's logo-512.png, the name in big
Helvetica Neue Bold, a tagline and the mes.fm address. Writes <site>/img/share.jpg (and gradecalculator/img/weighted-average-share.jpg); used as og:image by
set_share_images.py / build_tool_apps.py share_img. Replace with Grok art via import_grok_art.py --share-only. Dry-runs by default, --apply writes (overwrites)."""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),"mes.fm")+"/"
APPLY="--apply" in sys.argv
HN='/System/Library/Fonts/HelveticaNeue.ttc'
def font(sz, idx): return ImageFont.truetype(HN, sz, index=idx)
SITES=[ # site, out, bg, title lines, tagline, url
 ('percentagecalculator','percentagecalculator/img/share.jpg','#1d6fa8',['Percentage','Calculator'],'Percent of, % change, increase and decrease','mes.fm/percentagecalculator'),
 ('gradecalculator','gradecalculator/img/share.jpg','#3d4389',['Final Grade','Calculator'],'What do you need on your final exam?','mes.fm/gradecalculator'),
 ('gradecalculator','gradecalculator/img/weighted-average-share.jpg','#3d4389',['Weighted Average','Calculator'],'Grades, weights and credits, step by step','mes.fm/weighted-average-calculator'),
 ('gpacalculator','gpacalculator/img/share.jpg','#4a7a1c',['GPA','Calculator'],'Term and cumulative GPA, 4.0 or 4.33 scale','mes.fm/gpacalculator'),
 ('bmicalculator','bmicalculator/img/share.jpg','#8b3d7a',['BMI','Calculator'],'Body mass index and healthy weight range','mes.fm/bmicalculator'),
 ('inflationcalculator','inflationcalculator/img/share.jpg','#b63a17',['Inflation','Calculator'],'What money from any year is worth today','mes.fm/inflationcalculator'),
 ('timer','timer/img/share.jpg','#9a5e05',['Online Timer'],'Countdown, stopwatch and alarm on one page','mes.fm/timer'),
 ('pokemongocalculator','pokemongocalculator/img/share.jpg','#1d3d7a',['Pokemon Go','Calculator'],'Get the most XP from every Lucky Egg','mes.fm/pokemongocalculator'),
]
def hexrgb(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
for site,out,bg,lines,tag,url in SITES:
    if not APPLY: print("would write", out); continue
    W,H=1200,630; c=hexrgb(bg)
    im=Image.new('RGB',(W,H),c); d=ImageDraw.Draw(im)
    for y in range(H):   # gentle vertical gradient: lighter top, darker bottom
        k=0.12*(0.5-y/H)
        d.line([(0,y),(W,y)],fill=tuple(max(0,min(255,int(v+ (255-v)*k if k>0 else v*(1+k)))) for v in c))
    L=Image.open(R+site+'/img/logo-512.png').convert('RGBA').resize((360,360),Image.LANCZOS)
    m=Image.new('L',(360,360),0); ImageDraw.Draw(m).rounded_rectangle([0,0,359,359],radius=56,fill=255)
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([80,145+14,80+360,145+14+360],radius=56,fill=(0,0,0,110))
    im=Image.alpha_composite(im.convert('RGBA'),sh.filter(ImageFilter.GaussianBlur(18))).convert('RGB')
    im.paste(L,(80,135),m); d=ImageDraw.Draw(im)
    ImageDraw.Draw(im).rounded_rectangle([80,135,439,494],radius=56,outline=(255,255,255),width=4)
    x=500; maxw=W-x-60
    sz=104
    while any(d.textlength(t,font=font(sz,1))>maxw for t in lines): sz-=2
    tf=font(sz,1); ts=36
    while d.textlength(tag,font=font(ts,0))>maxw: ts-=1
    tg=font(ts,0)
    lh=int(sz*1.08); th=lh*len(lines)+30+44
    y=(H-th)//2-10
    for t in lines: d.text((x,y),t,font=tf,fill='white'); y+=lh
    y+=30; d.text((x,y),tag,font=tg,fill=(255,255,255,230) if False else (240,244,250))
    d.text((x,H-70),url,font=font(30,1),fill=(255,255,255)); 
    q=88
    while True:
        im.save(R+out,'JPEG',quality=q,optimize=True,progressive=True)
        import os
        if os.path.getsize(R+out)<150000 or q<60: break
        q-=4
    print(out, os.path.getsize(R+out), q)
