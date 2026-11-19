#!/usr/bin/env python3
"""
build-www.py -- assemble copytext-app/www/ from the live MES Copy Text page (mes.fm/copy-text/index.html) and the tool's sources
(tool_apps_src/copy-text/lib.js + app.js).

Same shell as the other MES apps (polls-app, timer-app, gpacalculator-app): keeps the tool block <div class="tu" id="cp">, the
page's inline CSS and the scripts it needs (hive.js, hive-store.js, text-size.js), and writes a small app header / menu / footer
around them. Web-only parts (site header, AdSense, sidebar, comments, main.js, track.js) are left out.

App changes:
- "Save online & sync" (sync.js) is left out: its OneDrive / Dropbox / Google sign-ins return to https://mes.fm/copy-text and the
  folder file needs the File System Access API, neither of which works inside the app. The Sync button is hidden; Hive backup and
  the .json backup / restore stay (Hive signs in with the Hive Keychain phone app = HiveAuth).
- js/app-native.js routes navigator.clipboard.writeText / readText through the Capacitor Clipboard plugin (native copy and paste),
  and saves downloads (.txt / .json backups) through the share sheet.
- Everything is kept in the app's own localStorage, so boards work offline.

Idempotent: wipes and regenerates www/ each run. Re-run after build_tool_apps.py --only=copy-text, then `npx cap sync`.
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SITE = REPO / "mes.fm"
SRC = SITE / "copy-text"
TOOL_SRC = REPO / "tool_apps_src" / "copy-text"
WWW = APP / "www"
EXT = "https://mes.fm"
VERSION = "1.0"
LIBS = ["hive.js", "hive-store.js", "text-size.js"]


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
    start = html.index('<div class="tu" id="cp"')
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
#status-cover{position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);background:#a16207;z-index:2147483000;pointer-events:none;}
body.dark-mode #status-cover{background:#6b4206;}
/* full header (scrolls away) */
#app-bar{display:flex;align-items:center;gap:.8em;background:#a16207;color:#fff;
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
  background:#a16207;color:#fff;padding:.4em .6em .4em .8em;box-shadow:0 2px 8px rgba(0,0,0,.3);
  transform:translateY(-140%);transition:transform .2s ease;visibility:hidden;}
#cbar.show{transform:translateY(0);visibility:visible;}
body.dark-mode #cbar{background:#6b4206;}
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
#menu .btn.ic svg{width:20px;height:20px;stroke:#8a5300;}
body.dark-mode #menu .btn.ic svg{stroke:#f5c451;}
#ctab{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 4px);z-index:2147482000;background:#a16207;color:#fff;border-radius:0 0 10px 10px;
  padding:.2em 1.1em .3em;font-size:.95em;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);display:none;cursor:pointer;}
body.dark-mode #ctab{background:#6b4206;}
body.cbar-hidden.past #ctab{display:block;}
body.cbar-hidden #cbar{display:none;}
/* burger menu */
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 66px);z-index:2147483001;width:min(20em,calc(100vw - 20px));background:#fff;color:#222;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.35);padding:.5em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 90px);overflow:auto;}
#menu.open{display:block;}
#menu .row{display:flex;align-items:center;justify-content:space-between;padding:.6em 1em;gap:.6em;font-size:.95em;color:#222;}
#menu .row b{color:#222;}
#menu .btn{border:1.5px solid #a16207;color:#8a5300;border-radius:999px;padding:.35em .8em;font-weight:700;}
#menu a{display:block;padding:.7em 1em;color:#8a5300;font-weight:600;text-decoration:none;border-top:1px solid #eee;font-size:.95em;}
#menu .sec{padding:.5em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#777;border-top:1px solid #eee;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
body.dark-mode #menu{background:#23262b;color:#e6e6e6;}
body.dark-mode #menu .row,body.dark-mode #menu .row b{color:#e6e6e6;}
body.dark-mode #menu a{color:#f5c451;border-top-color:#3a3e45;}
body.dark-mode #menu .sec{color:#9aa0a8;border-top-color:#3a3e45;}
body.dark-mode #menu .btn{border-color:#f5c451;color:#f5c451;}
#app-main{max-width:46em;margin:0 auto;padding:1em 1em 0 1em;}
#app-foot{max-width:46em;margin:0 auto;padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#8a5300;font-weight:600;}
#app-foot .links a{margin-right:1.1em;}
body.dark-mode{background:#16181c;color:#e6e6e6;}
body.dark-mode #app-bar{background:#6b4206;}
body.dark-mode #app-foot,body.dark-mode #app-foot p{color:#b9bdc4;}
body.dark-mode #app-foot a{color:#f5c451;}
.tu .tu-seo{display:none;}
#app-foot strong{color:inherit;}
/* big text sizes (zoom): let table headings and cells wrap so the tables fit the card instead of scrolling sideways */
.tu .tu-table th,.tu .tu-table td{white-space:normal;padding:.5em .35em;overflow-wrap:anywhere;}
.tu .tu-table td:last-child,.tu .tu-table th:last-child{min-width:5.5em;}
.tu .tu-chip small{color:inherit;}
/* the page's reset paints every bare div/span/b/strong #333, and the web build leaves dark mode to display-controls.js;
   :where() keeps this at type-selector specificity so any class that sets its own colour (category colours, chips) still wins */
:where(body.dark-mode #cp) :is(div,span,b,strong,p,li,small,label,td,th,i,em,output,legend,h2,h3,h4,dt,dd){color:#e6e6e6;}
"""
MOON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
SUN = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
THEME_BTN = '<span class="moon">%s</span><span class="sun">%s</span>' % (MOON, SUN)
BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var b=document.body, KS="mes-copytext-app:textscale", KT="mes-copytext-app:theme", KH="mes-copytext-app:cbarhide";
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


APP_CSS += """
/* cloud sync is web-only (see build-www.py) */
#cp-syncbtn,#cp-sync,#cp-syncstate,.cp-menu-box [data-act="sync"]{display:none !important;}
.tu-toast span{color:inherit;}
.tu textarea{font-family:inherit;}
.cp-app-note{font-size:.88em;margin:.4em 0 .8em;opacity:.9;}
"""

NATIVE_JS = r"""
/* Native clipboard + file saving for the app (Capacitor). Loaded before copy-text.js. */
(function(){
  var C = window.Capacitor;
  function native(){ return !!(C && C.isNativePlatform && C.isNativePlatform() && C.nativePromise); }
  if (!native()) return;
  var clip = {
    writeText: function(t){ return C.nativePromise("Clipboard", "write", { string: String(t) }).then(function(){}); },
    readText: function(){ return C.nativePromise("Clipboard", "read", {}).then(function(r){ return (r && r.value) || ""; }); }
  };
  /* <a download> of a blob does nothing in the WebView: hand the file to the share sheet instead (Save to Files, Drive, mail...) */
  window.MESAppSave = function(name, text, type){
    var safe = String(name || "copy-text.txt").replace(/[\\/:*?"<>|]+/g, "-");
    C.nativePromise("Filesystem", "writeFile", { path: safe, data: String(text), directory: "CACHE", encoding: "utf8", recursive: true })
      .then(function(r){ return C.nativePromise("Share", "share", { title: safe, files: [r.uri], dialogTitle: "Save " + safe }); })
      .catch(function(e){
        var m = String(e && e.message || e || "");
        if (/cancel/i.test(m)) return;
        alert("Could not save the file here (" + m + "). Use \u201cCopy all\u201d instead.");
      });
    return true;
  };
  try { Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true }); }
  catch (e) { try { navigator.clipboard.writeText = clip.writeText; navigator.clipboard.readText = clip.readText; } catch (x) {} }
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
<title>MES Copy Text</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<div id="status-cover"></div>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="64" height="64">
  <div class="t"><div class="name">MES Copy Text</div><div class="tag">Save the texts you paste again and again. Tap a note to copy it.</div></div>
  <button id="menu-btn" class="hb js-menu" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="cbar" role="toolbar" aria-label="Quick controls">
  <img src="img/logo.png" alt="" width="28" height="28">
  <div class="cn">MES Copy Text</div>
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
  <a href="index.html#hive">Back up to Hive</a>
  <div class="sec">About</div>
  <a href="%(ext)s/copy-text" target="_blank" rel="noopener">MES Copy Text website</a>
  <a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
%(tool)s
</main>
<div id="app-foot">
  <p><strong>How it works.</strong> Paste or type a text and save it. Tap a note to copy it, then paste it anywhere. Keep notes on boards, pin the ones you use most, give them colours and drag them into order. <code>{date}</code>, <code>{time}</code> and <code>{weekday}</code> are filled in when you copy.</p>
  <p><strong>Privacy.</strong> No account and no ads. Your texts stay on this phone and work without a connection. Use <em>Back up to Hive</em> (encrypted) or <em>Export</em> to keep a copy or move them to another phone.</p>
  <p class="links"><a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s/copy-text" target="_blank" rel="noopener">Website</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
<script src="js/app-native.js"></script>
%(libs)s
<script src="js/copy-text.js"></script>
<script>%(controls)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, controls=CONTROLS_JS, burger=BURGER,
           theme_btn=THEME_BTN, libs=libs)


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    for d in ("js", "img"):
        (WWW / d).mkdir(parents=True)

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = re.sub(r'\s*<script src="/main_js/[^"]*"[^>]*></script>', "", tool)
    tool = rewrite_links(tool)
    tool = tool.replace("in this browser", "on this device").replace("this browser", "this device")
    tool, n = re.subn(r'<p class="tu-note" style="margin-bottom:0;">Press <kbd>Ctrl</kbd>.*?</p>',
                      '<p class="tu-note" style="margin-bottom:0;">Everything stays on this phone: nothing is uploaded, unless you use '
                      '<em>☁ Hive backup</em> (encrypted by default).</p>', tool, count=1, flags=re.S)
    assert n == 1, "save hint not found (page changed)"
    hive_intro = re.search(r'(<p class="cp-hive-intro">.*?</p>)', tool, flags=re.S)
    assert hive_intro, "Hive intro paragraph not found (page changed)"
    tool = tool.replace(hive_intro.group(1), hive_intro.group(1) + '\n\t\t\t<p class="tu-note cp-app-note">In the app you sign in with the '
                        '<b>Hive Keychain</b> phone app (it opens for you to approve). Encrypted backups use a passphrase you choose.</p>', 1)
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    # page script = the tool's own lib.js + app.js; sync.js (cloud sync) is left out on purpose
    js = "\n".join((TOOL_SRC / n).read_text(encoding="utf-8") for n in ("lib.js", "app.js"))
    assert "window.CTSync" in js and "CTSync = function" not in js
    old_dl = 'function download(name, text, type) {'
    assert js.count(old_dl) == 1, "download() changed in app.js"
    js = js.replace(old_dl, old_dl + ' if (window.MESAppSave && window.MESAppSave(name, text, type)) return;', 1)
    js = js.replace('href="/', 'target="_blank" rel="noopener" href="%s/' % EXT)
    js = js.replace("in this browser", "on this device").replace("this browser", "this device")
    (WWW / "js" / "copy-text.js").write_text(js, encoding="utf-8")
    (WWW / "js" / "app-native.js").write_text(NATIVE_JS.strip() + "\n", encoding="utf-8")

    for n in LIBS:
        t = (SITE / "main_js" / n).read_text(encoding="utf-8")
        if n == "hive.js":  # Hive login challenge names the site, not the app's "localhost"
            t2 = t.replace('(root.location && root.location.host) || "mes.fm"', '"mes.fm"')
            assert t2 != t, "hive.js host line changed"
            t = t2
        (WWW / "js" / n).write_text(t, encoding="utf-8")

    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((192, 192), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", 'src="/main_js/', "googlesyndication", 'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, copy-text.js %d bytes%s" % (len(out), len(js), ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


def add_update_note() -> None:
    """'Update available' note + burger-menu item (shared ../app_update.py, ../mes.fm/main_js/app-update.js)."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import app_update
    app_update.inject(Path(__file__).resolve().parent, 'copytext', '6836608312', 'fm.mes.copytext', 'index.html')


if __name__ == "__main__":
    main()
    add_update_note()
