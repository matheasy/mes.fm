#!/usr/bin/env python3
"""Karo's private dashboard for alpinewestcreative.com: Stats, Search Console and SEO pages.

The pages are copies of mes.fm's own /stats, /search-console and /seo tools (their built index.html and their scripts),
put in a small Alpine West Creative shell and pointed at her data:

  mes.fm/awc/{stats,search-console,seo}/index.html   the pages
  mes.fm/awc/assets/*.js                             the tools' scripts with /api/<x> -> /api/awc/<x>
  mes.fm/awc/seo/pages.json                          SEO report of her pages (same format as mes.fm/site-index/pages.json)

/api/awc/<x> (mes.fm/api/awc/*.js) runs the normal mes.fm handler for site 'awc' (api/_site.js: keys awc:*, her Bing
site). middleware.js puts /awc/* and /api/awc/* behind the login karo / rome. www.alpinewestcreative.com proxies
/stats, /search-console, /seo, /awc/* and /api/awc/* to mes.fm (karo.mes.fm/vercel.json), so she uses them on her own
domain. Page views are counted by karo.mes.fm/assets/track.js -> mes.fm/api/track (site www.alpinewestcreative.com).

Re-run after the mes.fm tools change (it copies whatever is built there now). Never hand-edit the output.
Dry run by default; --apply writes.
"""
import html
import json
import os
import re
import sys
import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, 'mes.fm')
KARO = os.path.join(ROOT, 'karo.mes.fm')
OUT = os.path.join(MES, 'awc')
HOST = 'www.alpinewestcreative.com'
NAME = 'Alpine West Creative'
APIS = r"(stats|stats-series|search-console|search-console-ai|chart-notes|seo)"

PAGES = {
    'stats': {
        'title': 'Stats',
        'h1': 'Stats',
        'desc': 'Which pages of alpinewestcreative.com people are viewing: most viewed pages, views over time, and how the views split by device and where the visitors came from. Counted by a small privacy-friendly beacon on each page (no cookies, nothing personal kept).',
        'script': 'stats/js/stats.js',
        'drop': [r'<p class="st-xlinks">.*?</p>'],
        'swap': [('placeholder="Search every page, e.g. grade, /memes, calculadora"', 'placeholder="Search every page, e.g. /video, food"')],
    },
    'search-console': {
        'title': 'Search Console',
        'h1': 'Search Console: Google and Bing',
        'desc': 'How alpinewestcreative.com does in Google and Bing search: clicks, impressions, click rate and average position, by day, search words, page, country and device.',
        'script': 'search-console/js/search-console.js',
        'drop': [],
        'swap': [(re.compile(r'<span class="gs-links">.*?</span>', re.S), '<span class="gs-links"><a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> · <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a></span>')],
    },
    'seo': {
        'title': 'SEO Checker',
        'h1': 'SEO Checker',
        'desc': 'Check any page of the site (or any other site) for the on-page basics search engines look at: title and description length, headings, canonical, social cards, structured data, image alt text, links, mobile and HTTPS, plus a report of every page of alpinewestcreative.com.',
        'script': 'seo/js/seo.js',
        'drop': [r'<p class="tu-note sx-xlinks">.*?</p>'],
        'swap': [('>mes.fm site report<', '>Site report<')],
    },
}
EXTRA_JS = ['main_js/chart-notes.js', 'main_js/panel-view.js']   # loaded by the Search Console page

SHELL_CSS = """
/* AWC-SHELL */
:root { --awc-w: 1100px; }
html.awc-wide { --awc-w: 1500px; }
html.awc-theatre { --awc-w: 98vw; }
body.awc { background:#f4f2ee; margin:0; }
body.awc.dark-mode { background:#141414; }
.awc-top { display:flex; flex-wrap:wrap; align-items:center; gap:.6em 1.2em; padding:.7em max(16px, calc((100vw - var(--awc-w)) / 2)); background:#1f2a2e; color:#fff; font-family:Helvetica, Arial, sans-serif; position:sticky; top:0; z-index:50; }
.awc-brand { color:#fff !important; font-weight:700; letter-spacing:.06em; text-transform:uppercase; text-decoration:none !important; font-size:1.05em; }
.awc-nav { display:flex; flex-wrap:wrap; gap:.3em; }
.awc-nav a { color:#dfe7ea !important; text-decoration:none !important; padding:.35em .75em; border-radius:999px; font-size:.95em; }
.awc-nav a:hover { background:rgba(255,255,255,.12); }
.awc-nav a[aria-current] { background:#fff; color:#1f2a2e !important; font-weight:700; }
.awc-ctl { margin-left:auto; display:flex; gap:.4em; align-items:center; }
.awc-ctl button { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.35); border-radius:999px; padding:.3em .7em; font:inherit; font-size:.85em; cursor:pointer; }
.awc-ctl button[aria-pressed="true"] { background:#fff; color:#1f2a2e; }
.awc-modes { display:inline-flex; gap:0; }
.awc-modes button { border-radius:0; margin-left:-1px; }
.awc-modes button:first-child { border-radius:999px 0 0 999px; }
.awc-modes button:last-child { border-radius:0 999px 999px 0; }
@media (max-width: 1199px) { .awc-modes { display:none; } }
.outer-container.awc-page { width:auto !important; max-width:var(--awc-w) !important; margin:1.2em auto !important; padding:0 16px !important; box-sizing:border-box; }
.awc-page .inner-container { overflow:visible !important; }
.awc-page .outer-page-content { width:100% !important; display:block !important; }
.awc-foot { text-align:center; font:13px Helvetica, Arial, sans-serif; color:#777; padding:1.5em 16px 2.5em; }
.awc-foot a { color:inherit !important; }
body.dark-mode .awc-page .inner-container { background:#1d1d1d !important; box-shadow:none !important; }
body.dark-mode .awc-page .page-title, body.dark-mode .awc-page .page-description { color:#eee !important; }
@media (max-width: 600px) { .awc-ctl { margin-left:0; } .awc-page .inner-container { padding:1em .75em !important; } }
"""

HEAD_JS = """<script>try{var m=localStorage.getItem('awc-mode');if(m==='wide'||m==='theatre')document.documentElement.classList.add('awc-'+m);if(localStorage.getItem('awc-theme')==='dark')document.documentElement.classList.add('awc-dark')}catch(e){}</script>"""

SHELL_JS = r"""<script>
(function () {
  // on www.alpinewestcreative.com the pages are /stats ...; reached directly at mes.fm they are /awc/stats ...
  var base = /^\/awc(\/|$)/.test(location.pathname) ? '/awc' : '';
  document.querySelectorAll('[data-awc-link]').forEach(function (a) { a.href = base + a.getAttribute('data-awc-link'); });
  var root = document.documentElement, body = document.body;
  if (root.classList.contains('awc-dark')) body.classList.add('dark-mode');
  var tb = document.getElementById('awc-theme');
  function paintTheme() { var d = body.classList.contains('dark-mode'); tb.textContent = d ? '☀ Light' : '☾ Dark'; tb.setAttribute('aria-pressed', d ? 'true' : 'false'); }
  tb.onclick = function () { body.classList.toggle('dark-mode'); try { localStorage.setItem('awc-theme', body.classList.contains('dark-mode') ? 'dark' : 'light'); } catch (e) {} paintTheme(); window.dispatchEvent(new Event('resize')); };
  paintTheme();
  var btns = document.querySelectorAll('.awc-modes button');
  function mode() { return root.classList.contains('awc-theatre') ? 'theatre' : root.classList.contains('awc-wide') ? 'wide' : 'std'; }
  function paintMode() { btns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === mode() ? 'true' : 'false'); }); }
  btns.forEach(function (b) { b.onclick = function () { root.classList.remove('awc-wide', 'awc-theatre'); if (b.dataset.mode !== 'std') root.classList.add('awc-' + b.dataset.mode); try { localStorage.setItem('awc-mode', b.dataset.mode); } catch (e) {} paintMode(); window.dispatchEvent(new Event('resize')); }; });
  paintMode();
})();
</script>"""


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def fix_api(js):
    js = re.sub(r"(['\"])/api/" + APIS + r"\b", r"\1/api/awc/\2", js)
    # page links in the tables open her site, not mes.fm
    js = js.replace("'https://mes.fm' + r.k", "'https://" + HOST + "' + r.k")
    js = js.replace("'https://mes.fm' + b.getAttribute('data-check')", "'https://" + HOST + "' + b.getAttribute('data-check')")
    js = js.replace("return 'https://mes.fm' + r.url", "return 'https://" + HOST + "' + r.url")
    js = js.replace("'/site-index/pages.json'", "'/awc/seo/pages.json'")
    # the "not set up yet" cards: plain words for Karo instead of mes.fm's setup steps
    js = re.sub(r"if \(!g\.setup\) out \+= '<div class=\"tu-card gs-setup\">.*?</ol></div>';",
                "if (!g.setup) out += '<div class=\"tu-card gs-setup\"><h2>Google: numbers on the way</h2><p>Google Search Console is being connected for this site. Its numbers appear here within a day of that, with up to 16 months of history.</p></div>';",
                js, count=1, flags=re.S)
    js = re.sub(r"if \(!b\.setup\) out \+= '<div class=\"tu-card gs-setup\">.*?</ol></div>';",
                "if (!b.setup) out += '<div class=\"tu-card gs-setup\"><h2>Bing: numbers on the way</h2><p>Bing Webmaster Tools is being connected for this site.</p></div>';",
                js, count=1, flags=re.S)
    return js


def head_styles(src):
    head = src[:src.index('</head>')]
    return '\n'.join(re.findall(r'<style[^>]*>.*?</style>', head, re.S))


def content_of(src, cfg):
    i = src.index('<h1 class="page-title">')
    j = src.index('<!-- PC (Responsive/Rectangle) Matched Content -->', i)
    c = src[i:j]
    c = re.sub(r'<h1 class="page-title">.*?</h1>', '<h1 class="page-title">' + html.escape(cfg['h1']) + '</h1>', c, count=1, flags=re.S)
    c = re.sub(r'<p class="page-description">.*?</p>', '<p class="page-description">' + html.escape(cfg['desc']) + '</p>', c, count=1, flags=re.S)
    for pat in cfg['drop']:
        c = re.sub(pat, '', c, flags=re.S)
    for a, b in cfg['swap']:
        c = a.sub(b, c) if hasattr(a, 'sub') else c.replace(a, b)
    # scripts the content loads itself (chart notes, panel view): her copies; the width switch is the shell's
    c = re.sub(r'<script src="/main_js/hub-theatre\.js[^"]*"[^>]*></script>', '', c)
    c = re.sub(r'<script src="/main_js/(chart-notes|panel-view)\.js[^"]*"', r'<script src="/awc/assets/\1.js?v=1"', c)
    # remaining text mentions of mes.fm (not inside attributes) are about "this site"
    parts = re.split(r'(<[^>]+>)', c)
    c = ''.join(x if x.startswith('<') else x.replace('mes.fm', 'alpinewestcreative.com') for x in parts)
    return c


def page(slug, cfg):
    src = read(os.path.join(MES, slug, 'index.html'))
    nav = ''.join(
        '<a data-awc-link="/%s" href="/%s"%s>%s</a>' % (s, s, ' aria-current="page"' if s == slug else '', html.escape(c['title']))
        for s, c in PAGES.items())
    script = os.path.basename(cfg['script'])
    return f"""<!DOCTYPE html>
<html lang="en">
<!-- GENERATED by build_awc_dashboard.py from mes.fm/{slug}: do not edit by hand -->
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{html.escape(cfg['title'])} | {NAME}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">
{HEAD_JS}
{head_styles(src)}
<style>{SHELL_CSS}</style>
</head>
<body class="awc">
<header class="awc-top">
  <a class="awc-brand" href="https://{HOST}/">{NAME}</a>
  <nav class="awc-nav" aria-label="Dashboard">{nav}</nav>
  <span class="awc-ctl">
    <span class="awc-modes" role="group" aria-label="Page width"><button type="button" data-mode="std">Standard</button><button type="button" data-mode="wide">Wide</button><button type="button" data-mode="theatre">Theatre</button></span>
    <button type="button" id="awc-theme" aria-pressed="false">☾ Dark</button>
  </span>
</header>
<div id="outer-container" class="outer-container awc-page"><div class="inner-container"><div class="outer-page-content"><div class="page-content">
{content_of(src, cfg)}
</div></div></div></div>
<footer class="awc-foot">Private dashboard for <a href="https://{HOST}/">{NAME}</a> · made by <a href="https://mes.fm/" rel="nofollow">MES.fm</a></footer>
{SHELL_JS}
<script src="/awc/assets/{script}?v=1" defer></script>
</body>
</html>
"""


# ---------- SEO report of her pages (format of mes.fm/site-index/pages.json) ----------
ISSUES = [['nodesc', 'No meta description', 1], ['shortdesc', 'Description under 120 chars', 0], ['longdesc', 'Description over 320 chars', 0],
          ['noog', 'No og:image', 0], ['notw', 'No twitter:image', 0], ['nocanon', 'No canonical', 1], ['canonbad', 'Canonical differs from the URL', 1],
          ['notitle', 'No title', 1], ['noh1', 'No h1', 1], ['multih1', 'More than one h1', 0], ['nolang', 'No lang attribute', 0], ['novp', 'No viewport meta', 0],
          ['noindex', 'noindex', 0]]
BIT = {x[0]: 1 << i for i, x in enumerate(ISSUES)}


def meta(s, name, attr='name'):
    m = re.search(r'<meta[^>]+%s=["\']%s["\'][^>]*>' % (attr, re.escape(name)), s, re.I)
    if not m:
        return None
    c = re.search(r'content=["\']([^"\']*)', m.group(0), re.I)
    return html.unescape(c.group(1)) if c else ''


def seo_report():
    rows = []
    for fn in sorted(os.listdir(KARO)):
        if not fn.endswith('.html') or fn.startswith('google'):
            continue
        s = read(os.path.join(KARO, fn))
        url = '/' if fn == 'index.html' else '/' + fn[:-5]
        t = re.search(r'<title>(.*?)</title>', s, re.S | re.I)
        title = html.unescape(t.group(1).strip()) if t else ''
        desc = meta(s, 'description')
        h1 = len(re.findall(r'<h1[\s>]', s, re.I))
        body = s[s.lower().find('<body'):]
        text = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', body, flags=re.S | re.I)
        words = len(re.findall(r'[A-Za-z]{2,}', html.unescape(re.sub(r'<[^>]+>', ' ', text))))
        canon = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', s, re.I)
        iss = 0
        if desc is None or not desc.strip(): iss |= BIT['nodesc']
        elif len(desc) < 120: iss |= BIT['shortdesc']
        elif len(desc) > 320: iss |= BIT['longdesc']
        if not meta(s, 'og:image', 'property'): iss |= BIT['noog']
        if not meta(s, 'twitter:image') and not meta(s, 'twitter:card'): iss |= BIT['notw']
        if not canon: iss |= BIT['nocanon']
        elif canon.group(1).rstrip('/').replace('://alpine', '://www.alpine') != ('https://' + HOST + url).rstrip('/'): iss |= BIT['canonbad']
        if not title: iss |= BIT['notitle']
        if h1 == 0: iss |= BIT['noh1']
        if h1 > 1: iss |= BIT['multih1']
        if not re.search(r'<html[^>]+lang=', s, re.I): iss |= BIT['nolang']
        if not meta(s, 'viewport'): iss |= BIT['novp']
        if re.search(r'noindex', meta(s, 'robots') or '', re.I): iss |= BIT['noindex']
        rows.append([url, title, 0, 0, 0, 0, iss, len(desc or ''), h1, words, len(s.encode()), '', 0])
    return {
        'v': 1, 'cols': ['url', 'title', 'section', 'template', 'generator', 'features', 'issues', 'desc_len', 'h1', 'words', 'bytes', 'date', 'file_kind'],
        'templates': [['page', 'Page', '', []]], 'sections': [['site', 'Site pages']], 'generators': [['none', 'Hand-made']],
        'features': [], 'issues': ISSUES, 'bad': [], 'p': rows,
        'generated': datetime.date.today().isoformat(),
    }


def main():
    apply = '--apply' in sys.argv
    out = {}
    for slug, cfg in PAGES.items():
        out[os.path.join(OUT, slug, 'index.html')] = page(slug, cfg)
        out[os.path.join(OUT, 'assets', os.path.basename(cfg['script']))] = fix_api(read(os.path.join(MES, cfg['script'])))
    for p in EXTRA_JS:
        out[os.path.join(OUT, 'assets', os.path.basename(p))] = fix_api(read(os.path.join(MES, p)))
    rep = seo_report()
    old = os.path.join(OUT, 'seo', 'pages.json')
    if os.path.exists(old):  # keep the date when nothing else changed
        try:
            o = json.load(open(old))
            if o.get('p') == rep['p']:
                rep['generated'] = o.get('generated', rep['generated'])
        except Exception:
            pass
    out[old] = json.dumps(rep, separators=(',', ':'))
    for path, text in out.items():
        cur = read(path) if os.path.exists(path) else None
        state = 'same' if cur == text else ('new' if cur is None else 'changed')
        print(f'{state:8} {os.path.relpath(path, ROOT)}  ({len(text):,} bytes)')
        if apply and state != 'same':
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text)
    if not apply:
        print('\nDry run. --apply writes.')


if __name__ == '__main__':
    main()
