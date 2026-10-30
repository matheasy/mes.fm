# Adds data-ratio (original height/width) to gallery images, used by mirror.js to re-flow the masonry gallery.
import re, json, hashlib, os, glob
from PIL import Image
OUT='/Users/mes/Documents/GitHub/mes.fm/karo.mes.fm'
jobs={j['out']:j for j in json.load(open('jobs.json'))}
def ratio(out):
    j=jobs.get(out.lstrip('/'))
    if not j or j['kind']!='img': return None
    fn='cache/'+hashlib.md5(('https://static.wixstatic.com/media/'+j['file']).encode()).hexdigest()
    w,h=Image.open(fn).size
    return h/w
for f in glob.glob(OUT+'/*.html')+glob.glob(OUT+'/m/*.html'):
    s=open(f).read()
    def rep(m):
        t=m.group(0)
        if 'data-ratio' in t: return t
        r=ratio(m.group(1))
        return t if r is None else t.replace(' data-full=', f' data-ratio="{r:.6f}" data-full=',1)
    s2=re.sub(r'<img [^>]*data-full="([^"]+)"[^>]*>', rep, s)
    if s2!=s: open(f,'w').write(s2); print('ratio', os.path.basename(f))
