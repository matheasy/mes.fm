#!/usr/bin/env python3
"""Layout switch for the karo.mes.fm mirror (run after process.js; idempotent).

Every page exists twice: desktop at /<page>, Wix's phone layout at /m/<page>.
vercel.json redirects phone user agents to /m/... on the server; this adds the
client-side half, so it also works when the user agent is not recognised:

* an inline script right after the viewport meta (id="layout-switch") that sends a narrow
  window (< 768 CSS px) on a desktop page to its /m/ twin and a wide window on a
  /m/ page back to the desktop page, keeping query + hash. ?layout=desktop /
  ?layout=mobile forces a layout (cookie karo_layout, 30 days). When the page
  settles on the desktop layout it sets karo_wide=1 (1 day), so a wide window with a
  phone-like user agent is not redirected back by the server. vercel.json skips its
  redirect when karo_layout=desktop or karo_wide=1 is present, so the two never fight;
  at most 3 client switches per 10 s (sessionStorage) stop any ping-pong anyway.
* links inside /m/ pages point at /m/... so the phone layout stays put.

Dry run by default; --apply writes.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PAGES = ['index', 'contact-8', 'food-beverage', 'hotels-airbnbs', 'investment', 'product-branding', 'video']

SCRIPT = r"""<script id="layout-switch">(function(){try{
var p=location.pathname.replace(/\/index(\.html)?$/,'/').replace(/\.html$/,'').replace(/(.)\/$/,'$1'),m=/^\/m(\/|$)/.test(p);
var f=(location.search.match(/[?&]layout=(desktop|mobile)/)||[])[1];
var c=(document.cookie.match(/(?:^|;\s*)karo_layout=(desktop|mobile)/)||[])[1];
var auto=matchMedia('(max-width: 767px)').matches?'mobile':'desktop';
var want=f||c||auto;
if(f)document.cookie='karo_layout='+f+';path=/;max-age=2592000;samesite=lax';
document.cookie='karo_wide=1;path=/;samesite=lax;max-age='+(want==='desktop'?86400:0);
if((want==='mobile')===m)return;
var n=Date.now(),g=(sessionStorage.getItem('karoSwitch')||'').split(',').filter(function(x){return n-x<10000;});
if(g.length>=3)return;g.push(n);sessionStorage.setItem('karoSwitch',g.join(','));
var rest=m?p.replace(/^\/m/,''):(p==='/'?'':p);
var q=location.search.replace(/[?&]layout=(desktop|mobile)/,'').replace(/^&/,'?');
location.replace((m?(rest||'/'):'/m'+rest)+q+location.hash);
}catch(e){}})();</script>
"""

TARGETS = {'/': '/m'}
TARGETS.update({'/' + x: '/m/' + x for x in PAGES if x != 'index'})


def fix_link(mm):
    quote, href = mm.group(1), mm.group(2)
    base, sep, frag = href.partition('#')
    if base in TARGETS:
        return 'href=' + quote + TARGETS[base] + sep + frag + quote
    return mm.group(0)


def main():
    apply = '--apply' in sys.argv
    n = 0
    for mob in (False, True):
        for page in PAGES:
            f = os.path.normpath(os.path.join(ROOT, 'm' if mob else '', page + '.html'))
            with open(f, encoding='utf-8') as fh:
                s = fh.read()
            o = s
            s = re.sub(r'<script id="layout-switch">.*?</script>\n', '', s, flags=re.S)
            # right after the viewport meta: before it, a phone measures the default
            # 980 px layout width, so the narrow-screen test would always say "desktop"
            vp = re.search(r'<meta name="viewport"[^>]*>\n?', s)
            if not vp:
                raise SystemExit('no viewport meta in ' + f)
            s = s[:vp.end()] + ('' if s[vp.end() - 1] == '\n' else '\n') + SCRIPT + s[vp.end():]
            if mob:
                s = re.sub(r'href=(["\'])([^"\']*)\1', fix_link, s)
            if s != o:
                n += 1
                if apply:
                    with open(f, 'w', encoding='utf-8') as fh:
                        fh.write(s)
            print(('changed ' if s != o else 'ok      ') + f)
    print(n, 'files', 'written' if apply else 'would change (dry run; --apply writes)')


main()
