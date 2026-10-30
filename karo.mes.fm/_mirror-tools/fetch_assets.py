import json, os, sys, hashlib, urllib.request, concurrent.futures as cf
from PIL import Image, ImageOps
OUT='/Users/mes/Documents/GitHub/mes.fm/karo.mes.fm'
CACHE='cache'; os.makedirs(CACHE, exist_ok=True)
jobs=json.load(open('jobs.json'))
UA={'User-Agent':'Mozilla/5.0 (Macintosh) static-mirror'}
def get(url):
    fn=os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest())
    if not os.path.exists(fn):
        req=urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r, open(fn+'.tmp','wb') as f: f.write(r.read())
        os.rename(fn+'.tmp', fn)
    return fn
def align(al, sw, sh, tw, th):
    al=al or 'c'
    x=(sw-tw)/2; y=(sh-th)/2
    if al.startswith('fp'):
        fx,fy=[float(v) for v in al[2:].split('_')]
        return min(max(fx*sw-tw/2,0),sw-tw), min(max(fy*sh-th/2,0),sh-th)
    if 't' in al: y=0
    if 'b' in al: y=sh-th
    if al in ('l','tl','bl'): x=0
    if al in ('r','tr','br'): x=sw-tw
    return x,y
def do(j):
    out=os.path.join(OUT, j['out'])
    if os.path.exists(out): return None
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if j['kind']=='raw':
        fn=get(j['url']); import shutil; shutil.copy(fn, out); return None
    fn=get('https://static.wixstatic.com/media/'+j['file'])
    im=Image.open(fn); im=ImageOps.exif_transpose(im)
    has_alpha = im.mode in ('RGBA','LA','P') and ('transparency' in im.info or im.mode!='P')
    im=im.convert('RGBA' if has_alpha else 'RGB')
    for op in j['ops']:
        if op['op']=='crop':
            im=im.crop((op['x'],op['y'],op['x']+op['w'],op['y']+op['h']))
        elif op['op']=='fill':
            tw,th=op['w'],op['h']; sw,sh=im.size
            s=max(tw/sw, th/sh); nw,nh=max(tw,round(sw*s)),max(th,round(sh*s))
            im=im.resize((nw,nh), Image.LANCZOS)
            x,y=align(op['al'],nw,nh,tw,th); im=im.crop((round(x),round(y),round(x)+tw,round(y)+th))
        elif op['op']=='fit':
            tw,th=op['w'],op['h']; sw,sh=im.size
            s=min(tw/sw, th/sh, 1.0)
            if s<1: im=im.resize((max(1,round(sw*s)),max(1,round(sh*s))), Image.LANCZOS)
    im.save(out, 'WEBP', quality=82, method=5)
    return None
errs=[]
urls=sorted(set(('https://static.wixstatic.com/media/'+j['file']) if j['kind']=='img' else j['url'] for j in jobs))
with cf.ThreadPoolExecutor(12) as ex:
    for u,f in zip(urls, ex.map(lambda u: (lambda: get(u))() if True else None, urls)): pass
with cf.ThreadPoolExecutor(12) as ex:
    futs={ex.submit(do,j):j for j in jobs}
    for f in cf.as_completed(futs):
        try: f.result()
        except Exception as e: errs.append((futs[f]['out'], repr(e)))
print('done', len(jobs), 'errors', len(errs)); [print(e) for e in errs[:30]]
