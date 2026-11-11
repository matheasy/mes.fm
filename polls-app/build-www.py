#!/usr/bin/env python3
"""
build-www.py -- assemble polls-app/www/ from the live MES Polls page (mes.fm/polls/index.html + js/polls.js).

Same shell as the other MES apps (gpacalculator-app, timer-app): keeps the tool block <div class="tu pl" id="pl">, the page's
inline CSS and the scripts it needs (polls.js, hive.js, panel-view.js, time-input.js, when-parse.js), and writes a small app
header / menu / footer around them. Web-only parts (site header, AdSense, sidebar, comments, main.js, track.js) are left out.

App changes to polls.js: the in-browser test stand-in is off (the app's own host is "localhost", which polls.js treats as a
local preview), API calls go to https://mes.fm/api/poll (that function allows the app origins capacitor://localhost and
https://localhost and answers their CORS pre-check), links shared with people stay https://mes.fm/v/<id> and
https://mes.fm/hp/<author>/<permlink>, and opening a poll inside the app goes to index.html?p=<id> / ?h=<author/permlink>.

Idempotent: wipes and regenerates www/ each run. Re-run after build_tool_apps.py --only=polls, then `npx cap sync`.
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SITE = REPO / "mes.fm"
SRC = SITE / "polls"
WWW = APP / "www"
EXT = "https://mes.fm"
VERSION = "1.0"
LIBS = ["hive.js", "panel-view.js", "time-input.js", "when-parse.js"]


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
    html = re.sub(r"\s*<!-- ANDROID-TESTERS-BANNER -->.*?<!-- /ANDROID-TESTERS-BANNER -->", "", html, flags=re.S)
    head = html.split("<body", 1)[0]
    styles = re.findall(r"<style>(.*?)</style>", head, flags=re.S)
    css = "\n".join(styles[:2])
    start = html.index('<div class="tu pl" id="pl"')
    end = html.index("<!-- PC (Responsive/Rectangle)", start)
    return css, balanced(html[start:end].rstrip())


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
html,body,button,a,input,label,summary{touch-action:manipulation;} /* no double-tap zoom when tapping A+ repeatedly */
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#222;
  -webkit-text-size-adjust:100%;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
#status-cover{position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);background:#3b5bdb;z-index:2147483000;pointer-events:none;}
body.dark-mode #status-cover{background:#22378a;}
/* full header (scrolls away) */
#app-bar{display:flex;align-items:center;gap:.8em;background:#3b5bdb;color:#fff;
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
  background:#3b5bdb;color:#fff;padding:.4em .6em .4em .8em;box-shadow:0 2px 8px rgba(0,0,0,.3);
  transform:translateY(-140%);transition:transform .2s ease;visibility:hidden;}
#cbar.show{transform:translateY(0);visibility:visible;}
body.dark-mode #cbar{background:#22378a;}
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
#menu .btn.ic svg{width:20px;height:20px;stroke:#2b44b0;}
body.dark-mode #menu .btn.ic svg{stroke:#a9bcff;}
#ctab{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 4px);z-index:2147482000;background:#3b5bdb;color:#fff;border-radius:0 0 10px 10px;
  padding:.2em 1.1em .3em;font-size:.95em;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);display:none;cursor:pointer;}
body.dark-mode #ctab{background:#22378a;}
body.cbar-hidden.past #ctab{display:block;}
body.cbar-hidden #cbar{display:none;}
/* burger menu */
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 66px);z-index:2147483001;width:min(20em,calc(100vw - 20px));background:#fff;color:#222;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.35);padding:.5em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 90px);overflow:auto;}
#menu.open{display:block;}
#menu .row{display:flex;align-items:center;justify-content:space-between;padding:.6em 1em;gap:.6em;font-size:.95em;color:#222;}
#menu .row b{color:#222;}
#menu .btn{border:1.5px solid #3b5bdb;color:#2b44b0;border-radius:999px;padding:.35em .8em;font-weight:700;}
#menu a{display:block;padding:.7em 1em;color:#2b44b0;font-weight:600;text-decoration:none;border-top:1px solid #eee;font-size:.95em;}
#menu .sec{padding:.5em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#777;border-top:1px solid #eee;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
body.dark-mode #menu{background:#23262b;color:#e6e6e6;}
body.dark-mode #menu .row,body.dark-mode #menu .row b{color:#e6e6e6;}
body.dark-mode #menu a{color:#a9bcff;border-top-color:#3a3e45;}
body.dark-mode #menu .sec{color:#9aa0a8;border-top-color:#3a3e45;}
body.dark-mode #menu .btn{border-color:#a9bcff;color:#a9bcff;}
#app-main{max-width:46em;margin:0 auto;padding:1em 1em 0 1em;}
#app-foot{max-width:46em;margin:0 auto;padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#2b44b0;font-weight:600;}
#app-foot .links a{margin-right:1.1em;}
body.dark-mode{background:#16181c;color:#e6e6e6;}
body.dark-mode #app-bar{background:#22378a;}
body.dark-mode #app-foot,body.dark-mode #app-foot p{color:#b9bdc4;}
body.dark-mode #app-foot a{color:#a9bcff;}
.tu .tu-seo{display:none;}
#app-foot strong{color:inherit;}
/* big text sizes (zoom): let table headings and cells wrap so the tables fit the card instead of scrolling sideways */
.tu .tu-table th,.tu .tu-table td{white-space:normal;padding:.5em .35em;overflow-wrap:anywhere;}
.tu .tu-table td:last-child,.tu .tu-table th:last-child{min-width:5.5em;}
.tu .tu-chip small{color:inherit;}
/* the page's reset paints every bare div/span/b/strong #333, and the web build leaves dark mode to display-controls.js;
   :where() keeps this at type-selector specificity so any class that sets its own colour (category colours, chips) still wins */
:where(body.dark-mode #pl) :is(div,span,b,strong,p,li,small,label,td,th,i,em,output,legend,h2,h3,h4,dt,dd){color:#e6e6e6;}
"""
MOON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
SUN = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
THEME_BTN = '<span class="moon">%s</span><span class="sun">%s</span>' % (MOON, SUN)
BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var b=document.body, KS="mes-polls-app:textscale", KT="mes-polls-app:theme", KH="mes-polls-app:cbarhide";
  var steps=[0.85,1,1.15,1.3,1.5,1.75], i=1;
  try{ var v=parseInt(localStorage.getItem(KS),10); if(v>=0&&v<steps.length) i=v; }catch(e){}
  var m=document.getElementById("app-main"), f=document.getElementById("app-foot");
  function all(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function applyScale(){ m.style.fontSize=(16*steps[i])+'px'; f.style.fontSize=(13.6*steps[i])+'px';
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
    libs = "\n".join('<script src="js/%s"></script>' % n for n in LIBS)
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>MES Polls</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<div id="status-cover"></div>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="64" height="64">
  <div class="t"><div class="name">MES Polls</div><div class="tag">Make a poll in seconds, share the link, watch the votes come in live. No sign-up for you or your voters.</div></div>
  <button id="menu-btn" class="hb js-menu" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="cbar" role="toolbar" aria-label="Quick controls">
  <img src="img/logo.png" alt="" width="28" height="28">
  <div class="cn">MES Polls</div>
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
  <a href="index.html">New poll</a>
  <div class="sec">About</div>
  <a href="%(ext)s/polls" target="_blank" rel="noopener">MES Polls website</a>
  <a href="%(ext)s/privacy-policy#polls" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
%(tool)s
</main>
<div id="app-foot">
  <p><strong>How it works.</strong> A poll is saved on mes.fm and gets a short link (mes.fm/v/&hellip;) that anyone can open in a browser to vote: your voters do not need the app. Polls are not listed anywhere and are hidden from search engines. Each phone or browser votes once.</p>
  <p><strong>Privacy.</strong> No accounts and no ads. The polls you made and the ones you voted on are remembered only on this device. Votes are stored with a random device id that is kept only as a one-way hash.</p>
  <p class="links"><a href="%(ext)s/privacy-policy#polls" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s/polls" target="_blank" rel="noopener">Website</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
%(libs)s
<script src="js/polls.js"></script>
<script>%(controls)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, controls=CONTROLS_JS, burger=BURGER,
           theme_btn=THEME_BTN, libs=libs)


def sub1(js, old, new, n=1):
    c = js.count(old)
    assert c == n, "expected %d x %r in polls.js, found %d (page script changed)" % (n, old, c)
    return js.replace(old, new)


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    for d in ("js", "img"):
        (WWW / d).mkdir(parents=True)

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = re.sub(r'\s*<script src="/main_js/[^"]*"[^>]*></script>', "", tool)  # the page's own tags for the libs; the app loads its copies
    tool = rewrite_links(tool)
    tool = tool.replace("in this browser", "on this device").replace("this browser", "this device")
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    js = (SRC / "js" / "polls.js").read_text(encoding="utf-8")
    js = re.sub(r"var MOCK = [^;]*;", "var MOCK = false;", js, count=1)
    js = sub1(js, 'fetch("/api/poll"', 'fetch("%s/api/poll"' % EXT)
    js = js.replace('(MOCK ? "/polls?p=" : "/v/")', '"index.html?p="')
    js = js.replace('MOCK ? "/polls?h=" + r.author + "/" + r.permlink : "/hp/" + r.author + "/" + r.permlink', '"index.html?h=" + r.author + "/" + r.permlink')
    js = js.replace('location.origin + "/polls?p="', '"%s/polls?p="' % EXT)
    assert '"/v/"' not in js and '"/hp/"' not in js.replace('"https://mes.fm/hp/"', ""), "unpatched in-site link left in polls.js"
    js = js.replace('href="/', 'target="_blank" rel="noopener" href="%s/' % EXT)
    js = js.replace("in this browser", "on this device")
    (WWW / "js" / "polls.js").write_text(js, encoding="utf-8")

    for n in LIBS:
        t = (SITE / "main_js" / n).read_text(encoding="utf-8")
        if n == "hive.js":  # Hive login challenge names the site, not the app's "localhost"
            t = t.replace('(root.location && root.location.host) || "mes.fm"', '"mes.fm"')
        (WWW / "js" / n).write_text(t, encoding="utf-8")

    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((192, 192), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", 'src="/main_js/', "googlesyndication", 'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, polls.js %d bytes%s" % (len(out), len(js), ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


if __name__ == "__main__":
    main()
