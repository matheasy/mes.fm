#!/usr/bin/env python3
"""
build-www.py -- assemble gradecalculator-app/www/ from the live Grade Calculator page
(mes.fm/gradecalculator/index.html + js/gradecalculator.js).

Unlike the Percentage Calculator app (which wraps the whole legacy page), the Grade page is a
tool-shell page whose calculator is one self-contained block, <div class="tu" id="gc">, plus the
page's own inline CSS and a vanilla script. So this keeps exactly those three things and writes a
small app shell around them (header with logo + title + light/dark toggle, the calculator, a
health disclaimer with the data sources, footer links). Everything web-only is left out: the site
header / info bar / side menu / floating bar, AdSense, the sidebar, bottom ad, FastComments,
Google Tag Manager, display-controls.js, site search, main.js, track.js.

Idempotent: wipes and regenerates www/ each run. Re-run whenever mes.fm/gradecalculator changes
(after build_tool_apps.py --only=gradecalculator), then `npx cap sync`.
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SRC = REPO / "mes.fm" / "gradecalculator"
WWW = APP / "www"
EXT = "https://mes.fm"
VERSION = "1.0"


def balanced(fragment: str) -> str:
    """Trim trailing </div>s the extraction picked up from the parent containers."""
    opens = len(re.findall(r"<div\b", fragment))
    closes = len(re.findall(r"</div>", fragment))
    while closes > opens:
        i = fragment.rfind("</div>")
        fragment = fragment[:i] + fragment[i + 6:]
        closes -= 1
    assert closes == opens, "unbalanced calculator markup: %d open, %d close" % (opens, closes)
    return fragment


def extract(html: str):
    head = html.split("<body", 1)[0]
    styles = re.findall(r"<style>(.*?)</style>", head, flags=re.S)
    # first two are the shell reset + the page's own CSS (tool shell, _shared.css, app.css, derived dark block);
    # later ones are the web sidebar's (MES-ASIDE-HEAD)
    css = "\n".join(styles[:2])
    start = html.index('<div class="tu" id="gc">')
    end = html.index("<!-- PC (Responsive/Rectangle)", start)
    tool = balanced(html[start:end].rstrip())
    return css, tool


def rewrite_links(tool: str) -> str:
    # site-relative links -> the real site, opened in the system browser
    tool = re.sub(r'href="/([^"]*)"', r'href="%s/\1" target="_blank" rel="noopener"' % EXT, tool)
    tool = re.sub(r"href='/([^']*)'", r'href="%s/\1" target="_blank" rel="noopener"' % EXT, tool)
    tool = re.sub(r'<a (?![^>]*\btarget=)([^>]*href="https?://[^"]+")',
                  r'<a target="_blank" rel="noopener" \1', tool)
    tool = re.sub(r'(<a [^>]*target="_blank"[^>]*)\s+target="_blank"', r"\1", tool)
    return tool


APP_CSS = """
html,body{margin:0;padding:0;background:#fff;overscroll-behavior-y:none;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#222;
  -webkit-text-size-adjust:100%;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
#status-cover{position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);background:#575fab;z-index:2147483000;pointer-events:none;}
body.dark-mode #status-cover{background:#262a5c;}
/* full header (scrolls away) */
#app-bar{display:flex;align-items:center;gap:.8em;background:#575fab;color:#fff;
  padding:calc(env(safe-area-inset-top) + .8em) 1em .9em 1em;box-shadow:0 1px 6px rgba(0,0,0,.25);}
#app-bar img{width:64px;height:64px;border-radius:15px;background:#fff;flex:none;}
#app-bar .t{flex:1;min-width:0;color:#fff;}
#app-bar .name{font-size:1.45em;font-weight:700;line-height:1.1;color:#fff;}
#app-bar .tag{font-size:.82em;line-height:1.3;margin-top:.25em;opacity:.95;color:#fff;}
.hb{all:unset;cursor:pointer;color:#fff;font-weight:600;text-align:center;box-sizing:border-box;}
#menu-btn{width:44px;height:44px;border:1.5px solid rgba(255,255,255,.75);border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none;}
#menu-btn svg{width:22px;height:22px;stroke:#fff;}
/* floating compact bar: appears once the full header has scrolled away; can be hidden */
#cbar{position:fixed;left:0;right:0;top:env(safe-area-inset-top);z-index:2147482000;display:flex;align-items:center;gap:.4em;
  background:#575fab;color:#fff;padding:.4em .6em .4em .8em;box-shadow:0 2px 8px rgba(0,0,0,.3);
  transform:translateY(-140%);transition:transform .2s ease;visibility:hidden;}
#cbar.show{transform:translateY(0);visibility:visible;}
body.dark-mode #cbar{background:#262a5c;}
#cbar img{width:28px;height:28px;border-radius:7px;background:#fff;flex:none;}
#cbar .cn{flex:1;min-width:0;font-weight:700;font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}
#cbar .hb{border:1.5px solid rgba(255,255,255,.7);border-radius:999px;padding:.35em .6em;min-width:2.1em;font-size:.88em;}
#cbar .hb.ic{padding:.3em;width:2.2em;height:2.2em;display:flex;align-items:center;justify-content:center;border-radius:10px;}
#cbar .hb.ic svg{width:18px;height:18px;stroke:#fff;}
.js-theme .sun{display:none;}
body.dark-mode .js-theme .sun{display:inline-flex;}
body.dark-mode .js-theme .moon{display:none;}
.js-theme span{display:inline-flex;align-items:center;justify-content:center;}
#menu .btn.ic{padding:.3em .75em;}
#menu .btn.ic svg{width:20px;height:20px;stroke:#3f4690;}
body.dark-mode #menu .btn.ic svg{stroke:#aab0ee;}
#ctab{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 4px);z-index:2147482000;background:#575fab;color:#fff;border-radius:0 0 10px 10px;
  padding:.2em 1.1em .3em;font-size:.95em;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);display:none;cursor:pointer;}
body.dark-mode #ctab{background:#262a5c;}
body.cbar-hidden.past #ctab{display:block;}
body.cbar-hidden #cbar{display:none;}
/* burger menu */
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 66px);z-index:2147483001;width:min(20em,calc(100vw - 20px));background:#fff;color:#222;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.35);padding:.5em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 90px);overflow:auto;}
#menu.open{display:block;}
#menu .row{display:flex;align-items:center;justify-content:space-between;padding:.6em 1em;gap:.6em;font-size:.95em;color:#222;}
#menu .row b{color:#222;}
#menu .btn{border:1.5px solid #575fab;color:#3f4690;border-radius:999px;padding:.35em .8em;font-weight:700;}
#menu a{display:block;padding:.7em 1em;color:#3f4690;font-weight:600;text-decoration:none;border-top:1px solid #eee;font-size:.95em;}
#menu .sec{padding:.5em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#777;border-top:1px solid #eee;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
body.dark-mode #menu{background:#23262b;color:#e6e6e6;}
body.dark-mode #menu .row,body.dark-mode #menu .row b{color:#e6e6e6;}
body.dark-mode #menu a{color:#aab0ee;border-top-color:#3a3e45;}
body.dark-mode #menu .sec{color:#9aa0a8;border-top-color:#3a3e45;}
body.dark-mode #menu .btn{border-color:#aab0ee;color:#aab0ee;}
#app-main{max-width:46em;margin:0 auto;padding:1em 1em 0 1em;}
#app-foot{max-width:46em;margin:0 auto;padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#3f4690;font-weight:600;}
#app-foot .links a{margin-right:1.1em;}
body.dark-mode{background:#16181c;color:#e6e6e6;}
body.dark-mode #app-bar{background:#262a5c;}
body.dark-mode #app-foot,body.dark-mode #app-foot p{color:#b9bdc4;}
body.dark-mode #app-foot a{color:#aab0ee;}
.tu .tu-seo{display:none;}
#app-foot strong{color:inherit;}
/* the page's reset paints every bare div/span/b/strong #333, and the web build leaves dark mode to display-controls.js;
   :where() keeps this at type-selector specificity so any class that sets its own colour (category colours, chips) still wins */
:where(body.dark-mode #gc) :is(div,span,b,strong,p,li,small,label,td,th){color:#e6e6e6;}
"""

MOON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
SUN = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
THEME_BTN = '<span class="moon">%s</span><span class="sun">%s</span>' % (MOON, SUN)

BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var b=document.body, KS="mes-grade-app:textscale", KT="mes-grade-app:theme", KH="mes-grade-app:cbarhide";
  var steps=[0.85,1,1.15,1.3,1.5,1.75], i=1;
  try{ var v=parseInt(localStorage.getItem(KS),10); if(v>=0&&v<steps.length) i=v; }catch(e){}
  var m=document.getElementById("app-main"), f=document.getElementById("app-foot");
  function all(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function applyScale(){ m.style.zoom=f.style.zoom=steps[i];
    all(".js-down").forEach(function(e){ e.style.opacity=i===0?".4":"1"; }); all(".js-up").forEach(function(e){ e.style.opacity=i===steps.length-1?".4":"1"; });
    try{localStorage.setItem(KS,i);}catch(e){} }
  all(".js-down").forEach(function(e){ e.addEventListener("click",function(){ if(i>0){i--;applyScale();} }); });
  all(".js-up").forEach(function(e){ e.addEventListener("click",function(){ if(i<steps.length-1){i++;applyScale();} }); });
  applyScale();
  function pref(){ try{ var v=localStorage.getItem(KT); if(v) return v; }catch(e){} return window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"; }
  function applyTheme(v){ b.classList.toggle("dark-mode",v==="dark"); b.classList.toggle("dark",v==="dark"); }
  applyTheme(pref());
  all(".js-theme").forEach(function(e){ e.addEventListener("click",function(){ var v=b.classList.contains("dark-mode")?"light":"dark"; try{localStorage.setItem(KT,v);}catch(e){} applyTheme(v); }); });
  var menu=document.getElementById("menu"), scrim=document.getElementById("menu-scrim");
  function toggleMenu(open){ menu.classList.toggle("open",open); scrim.classList.toggle("open",open); }
  all(".js-menu").forEach(function(e){ e.addEventListener("click",function(ev){ ev.stopPropagation(); toggleMenu(!menu.classList.contains("open")); }); });
  scrim.addEventListener("click",function(){ toggleMenu(false); });
  menu.addEventListener("click",function(ev){ if(ev.target.tagName==="A") toggleMenu(false); });
  var cbar=document.getElementById("cbar"), bar=document.getElementById("app-bar");
  try{ if(localStorage.getItem(KH)==="1") b.classList.add("cbar-hidden"); }catch(e){}
  document.getElementById("cbar-hide").addEventListener("click",function(){ b.classList.add("cbar-hidden"); try{localStorage.setItem(KH,"1");}catch(e){} });
  document.getElementById("ctab").addEventListener("click",function(){ b.classList.remove("cbar-hidden"); try{localStorage.setItem(KH,"0");}catch(e){} });
  function onScroll(){ var past=bar.getBoundingClientRect().bottom<0; cbar.classList.toggle("show",past); b.classList.toggle("past",past); }
  window.addEventListener("scroll",onScroll,{passive:true}); onScroll();
})();
"""


def page(css: str, tool: str) -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Grade Calculator</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<div id="status-cover"></div>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="64" height="64">
  <div class="t"><div class="name">Grade Calculator</div><div class="tag">What do I need on the final? Track every course, weight and target. Free, private, works offline.</div></div>
  <button id="menu-btn" class="hb js-menu" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="cbar" role="toolbar" aria-label="Quick controls">
  <img src="img/logo.png" alt="" width="28" height="28">
  <div class="cn">Grade Calculator</div>
  <button class="hb js-down" type="button" aria-label="Smaller text">A&minus;</button>
  <button class="hb js-up" type="button" aria-label="Larger text">A+</button>
  <button class="hb ic js-theme" type="button" aria-label="Switch between light and dark mode">%(theme_btn)s</button>
  <button class="hb ic js-menu" type="button" aria-label="Menu">%(burger)s</button>
  <button id="cbar-hide" class="hb" type="button" aria-label="Hide this bar">&#9650;</button>
</div>
<div id="ctab" role="button" aria-label="Show the quick controls bar">&#9660;</div>
<div id="menu-scrim"></div>
<nav id="menu" aria-label="Menu">
  <div class="row"><b>Text size</b><span><button class="hb btn js-down" type="button">A&minus;</button> <button class="hb btn js-up" type="button">A+</button></span></div>
  <div class="row"><b>Theme</b><button class="hb btn ic js-theme" type="button" aria-label="Switch between light and dark mode">%(theme_btn)s</button></div>
  <div class="sec">Learn more</div>
  <a href="%(ext)s/gradecalculator/tutorial" target="_blank" rel="noopener">How to calculate your grade</a>
  <a href="%(ext)s/gradecalculator/study-tips" target="_blank" rel="noopener">Study tips</a>
  <a href="%(ext)s/weighted-average-calculator" target="_blank" rel="noopener">Weighted average calculator</a>
  <a href="%(ext)s/gpacalculator" target="_blank" rel="noopener">GPA calculator</a>
  <div class="sec">About</div>
  <a href="%(ext)s/gradecalculator" target="_blank" rel="noopener">Grade Calculator website</a>
  <a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
%(tool)s
</main>
<div id="app-foot">
  <p><strong>Estimates only.</strong> Results are calculated from the grades, weights and targets you type in. Your school&rsquo;s syllabus decides how grades are weighted, rounded and dropped, so check it (or ask your teacher) before relying on a number. Letter labels use a common US scale and are only a guide.</p>
  <p><strong>How it is calculated.</strong> Grade needed on the final = (target &minus; current grade &times; (100 &minus; final weight) &divide; 100) &divide; final weight &times; 100. With individual assignments, each score (points earned &divide; points possible) is multiplied by its weight, the graded weights are added up, and the remaining weight is what is left to earn.</p>
  <p><strong>Your data stays on this device.</strong> Courses, grades and targets are stored only on this device, inside the app. There are no accounts, no ads and no tracking, and nothing you enter is sent anywhere.</p>
  <p class="links"><a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s/gradecalculator" target="_blank" rel="noopener">Website</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
<script src="js/gradecalculator.js"></script>
<script>%(controls)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, controls=CONTROLS_JS, burger=BURGER, theme_btn=THEME_BTN)


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit("source not found: %s" % SRC)
    if WWW.exists():
        shutil.rmtree(WWW)
    (WWW / "js").mkdir(parents=True)
    (WWW / "img").mkdir()

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = rewrite_links(tool)
    # window.print() and blob downloads / file pickers do nothing useful in the iOS / Android WebView (App Review 2.1):
    # drop Print, Download a backup and Restore a backup; sharing is by copying a link, and a pasted link can be imported
    tool, n_print = re.subn(r'\s*<button[^>]*\bgc-print\b[^>]*>Print</button>', "", tool)
    assert n_print == 1, "Print button not found: page markup changed"
    tool, n_bk = re.subn(r'\s*<button[^>]*id="gc-backup"[^>]*>[^<]*</button>\s*<button[^>]*id="gc-restore"[^>]*>[^<]*</button>',
                         '\n\t\t\t\t<button type="button" class="tu-btn tu-btn--ghost" id="gc-import">Open a copied link&hellip;</button>', tool)
    assert n_bk == 1, "backup buttons not found: page markup changed"
    tool = tool.replace("saved in this browser automatically", "saved on this device automatically").replace("so use a backup or a link if they matter", "so copy a link if they matter").replace("Clearing your browser&rsquo;s site data", "Deleting the app or clearing its data").replace("Everything stays in your browser (localStorage)", "Everything stays on this device")
    tool, n_fi = re.subn(r'\s*<input type="file" id="gc-file"[^>]*>', "", tool)
    assert n_fi == 1, "file input not found"
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    js = (SRC / "js" / "gradecalculator.js").read_text(encoding="utf-8")
    # share links must point at the website (the app's own origin is capacitor://localhost)
    n = js.count("location.origin")
    js = js.replace("location.origin", '"%s"' % EXT)
    # the backup / restore handlers touch buttons that no longer exist: replace them (and the print handler) with a
    # "paste a link" importer that reuses the page's own decoder
    a0 = js.index('\t$("gc-backup").onclick')
    a1 = js.index('\t// add courses that arrived by link')
    importer = (
        '\t$("gc-import").onclick = function () {\n'
        '\t\tvar t = prompt("Paste a Grade Calculator link (copied from the app or from mes.fm/gradecalculator):", "");\n'
        '\t\tif (!t) return;\n'
        '\t\tvar mm = String(t).match(/[?&]s=([A-Za-z0-9_-]+)/), dec = mm && GC.decode(mm[1]);\n'
        '\t\tif (dec) addCourses(dec.courses.map(function (c) { c.id = uid(); return c; }), dec.cur, "Opened");\n'
        '\t\telse toast("That does not look like a Grade Calculator link");\n'
        '\t};\n\n')
    js = js[:a0] + importer + js[a1:]
    js = js.replace("use <b>Download a backup</b> if the other device does not show everything", "send it in a note or email instead if the other device does not show everything")
    js = js.replace(" saved in this browser.", " saved on this device.")
    js = js.replace("Copy a link or download a backup to keep them.", "Copy a link to keep them.")
    # root-relative links inside generated text would resolve against the app, not the website
    js = js.replace('<a href="/gpacalculator">', '<a href="%s/gpacalculator" target="_blank" rel="noopener">' % EXT)
    assert "gc-backup" not in js and "gc-print" not in js and 'href="/' not in js, "script still has app-incompatible bits"
    (WWW / "js" / "gradecalculator.js").write_text(js, encoding="utf-8")

    # logo-512.png has white rounded-corner padding; the app icon master is the same art cropped full-bleed
    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((192, 192), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", "main_js/", "googlesyndication",
                       'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, js %d bytes, location.origin patched x%d%s"
          % (len(out), len(js), n, ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


if __name__ == "__main__":
    main()
