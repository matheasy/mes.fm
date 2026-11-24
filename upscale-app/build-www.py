#!/usr/bin/env python3
"""
build-www.py -- assemble upscale-app/www/ from the live MES Upscale page (mes.fm/upscale/index.html + js/upscale.js).

Same idea as the other MES apps (audio-app, polls-app): keeps the tool block <div class="tu up" id="up">, the page's inline CSS
and the script, and writes a small app header / menu / footer around them. Web-only parts (site header, AdSense, sidebar,
comments, main.js, track.js, the FAQ text) are left out.

Offline: both Real-ESRGAN ONNX models (BSD-3-Clause, from mes.fm/upscale/models/) and the onnxruntime-web 1.22.0 files are copied
into www/, so upscaling works without a connection. The engine tries WebGPU first (iOS 26 WKWebView, Android WebView where Chrome
has it) and falls back to the processor (wasm, one thread: a WebView is not cross-origin isolated) by itself.

App-only patches to upscale.js (string replacements, asserted so a web change can't silently break them):
- ORT script, wasm folder and model files point at the bundled copies;
- download() goes through window.MESAppSave (native.js: Save to Photos / gallery, or the share sheet);
- "Download all (ZIP)" saves every result into Photos one by one (MESAppSaveAll);
- the Edit button (hand-off to mes.fm/photo, a different origin) is left out.

Idempotent: wipes and regenerates www/ each run. Re-run after build_tool_apps.py --only=upscale, then `npx cap sync`.
"""

import re
import shutil
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SITE = REPO / "mes.fm"
SRC = SITE / "upscale"
WWW = APP / "www"
CACHE = APP / "vendor-cache"
EXT = "https://mes.fm"
VERSION = "1.0"
ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"
VENDOR = {
    "ort.all.min.js": ORT + "ort.all.min.js",
    "ort-wasm-simd-threaded.jsep.mjs": ORT + "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm": ORT + "ort-wasm-simd-threaded.jsep.wasm",
}
IOS_ID = "6838918132"   # App Store Connect app id (MES Upscale: AI Photo Enhancer)


def balanced(fragment: str) -> str:
    opens = len(re.findall(r"<div\b", fragment))
    closes = len(re.findall(r"</div>", fragment))
    while closes > opens:
        i = fragment.rfind("</div>")
        fragment = fragment[:i] + fragment[i + 6:]
        closes -= 1
    assert closes == opens, "unbalanced markup: %d open, %d close" % (opens, closes)
    return fragment


def extract(html: str):
    html = re.sub(r"\s*<!-- ANDROID-TESTERS-BANNER -->.*?<!-- /ANDROID-TESTERS-BANNER -->", "", html, flags=re.S)
    head = html.split("<body", 1)[0]
    styles = re.findall(r"<style>(.*?)</style>", head, flags=re.S)
    css = "\n".join(styles[:2])
    start = html.index('<div class="tu up" id="up"')
    end = html.index("<!-- PC (Responsive/Rectangle)", start)
    tool = html[start:end].rstrip()
    tool = re.sub(r'\s*<div class="tu-seo">.*?</dl>\s*</div>', "", tool, flags=re.S)   # FAQ text is web-only
    return css, balanced(tool)


def rewrite_links(tool: str) -> str:
    tool = re.sub(r'href="/([^"]*)"', r'href="%s/\1" target="_blank" rel="noopener"' % EXT, tool)
    tool = re.sub(r'<a (?![^>]*\btarget=)([^>]*href="https?://[^"]+")', r'<a target="_blank" rel="noopener" \1', tool)
    return tool


def vendor(name: str) -> Path:
    CACHE.mkdir(exist_ok=True)
    f = CACHE / name
    if not f.exists() or f.stat().st_size < 1000:
        print("  downloading", VENDOR[name])
        req = urllib.request.Request(VENDOR[name], headers={"User-Agent": "mes-upscale-app-build/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            f.write_bytes(r.read())
    return f


APP_CSS = """
html,body{margin:0;padding:0;overscroll-behavior-y:none;}
html,body,button,a,input,label,summary,select{touch-action:manipulation;}
body{background:#f4f2fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;
  padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
body.dark-mode{background:#14121c;color:#e7e5ef;}
#app-bar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:.7em;background:#6d28d9;color:#fff;
  padding:calc(env(safe-area-inset-top) + .5em) .8em .55em .8em;box-shadow:0 1px 6px rgba(0,0,0,.3);}
#app-bar img{width:36px;height:36px;border-radius:9px;flex:none;}
#app-bar .name{flex:1;min-width:0;font-size:1.2em;font-weight:700;color:#fff;}
.hb{all:unset;cursor:pointer;color:#fff;box-sizing:border-box;}
#menu-btn{width:42px;height:42px;border:1.5px solid rgba(255,255,255,.7);border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;}
#menu-btn svg{width:22px;height:22px;stroke:#fff;}
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 58px);z-index:2147483001;width:min(19em,calc(100vw - 20px));background:#fff;color:#222;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.3);padding:.4em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 80px);overflow:auto;border:1px solid #ddd6f3;}
body.dark-mode #menu{background:#201d2b;color:#e7e5ef;border-color:#3a3550;}
#menu.open{display:block;}
#menu a,#menu button.mi{display:block;width:100%;text-align:left;box-sizing:border-box;padding:.75em 1em;color:#5b21b6;font-weight:600;text-decoration:none;border:0;border-top:1px solid #ece8f7;background:none;font-size:.97em;font-family:inherit;}
body.dark-mode #menu a,body.dark-mode #menu button.mi{color:#c4b5fd;border-top-color:#322d45;}
#menu .sec{padding:.55em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#777;border-top:1px solid #ece8f7;}
body.dark-mode #menu .sec{color:#a5a0b8;border-top-color:#322d45;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
#app-main{padding:.8em .7em 0 .7em;max-width:60em;margin:0 auto;}
#app-foot{padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;max-width:46em;margin:0 auto;}
body.dark-mode #app-foot{color:#a5a0b8;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#6d28d9;font-weight:600;margin-right:1.1em;}
body.dark-mode #app-foot a{color:#c4b5fd;}
#app-foot strong{color:inherit;}
.up-drop-s .pc-only{display:none;}
.up-cmp{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
.tu-toast{z-index:2147483647 !important;bottom:calc(env(safe-area-inset-bottom) + 1.5em) !important;}
/* save sheet (native.js) */
#as-scrim{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;}
#as-box{background:#fff;color:#222;width:min(30em,100%);border-radius:16px 16px 0 0;padding:.6em .7em calc(env(safe-area-inset-bottom) + .8em) .7em;box-sizing:border-box;}
body.dark-mode #as-box{background:#201d2b;color:#e7e5ef;}
#as-box .t{font-size:.85em;color:#777;text-align:center;padding:.4em .5em .7em;word-break:break-all;}
#as-box button{display:block;width:100%;margin:.35em 0;padding:.85em;border-radius:12px;border:0;font:inherit;font-weight:700;font-size:1.02em;background:#efe9fb;color:#5b21b6;}
#as-box button.p{background:#6d28d9;color:#fff;}
body.dark-mode #as-box button{background:#2e2842;color:#ddd3ff;}
body.dark-mode #as-box button.p{background:#6d28d9;color:#fff;}
"""
BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var menu=document.getElementById("menu"), scrim=document.getElementById("menu-scrim");
  function toggle(open){ menu.classList.toggle("open",open); scrim.classList.toggle("open",open); }
  document.getElementById("menu-btn").addEventListener("click",function(e){ e.stopPropagation(); toggle(!menu.classList.contains("open")); });
  scrim.addEventListener("click",function(){ toggle(false); });
  menu.addEventListener("click",function(e){ if(e.target.tagName==="A"||e.target.classList.contains("mi")) toggle(false); });
  document.getElementById("mi-sample").addEventListener("click",function(){ var b=document.getElementById("up-sample"); if(b) b.click(); });
  var mq=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)");
  function th(){ document.body.classList.toggle("dark-mode",!!(mq&&mq.matches)); }
  th(); if(mq&&mq.addEventListener) mq.addEventListener("change",th);
})();
"""


def page(css: str, tool: str) -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>MES Upscale</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="36" height="36">
  <div class="name">MES Upscale</div>
  <button id="menu-btn" class="hb" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="menu-scrim"></div>
<nav id="menu" aria-label="Menu">
  <button class="mi" type="button" id="mi-sample" style="border-top:0">Try a sample picture</button>
  <div class="sec">More from MES</div>
  <a href="%(ext)s/photo" target="_blank" rel="noopener">Photo Editor</a>
  <a href="%(ext)s/compress" target="_blank" rel="noopener">Compressor</a>
  <a href="%(ext)s/image-converter" target="_blank" rel="noopener">Image Converter</a>
  <div class="sec">About</div>
  <a href="%(ext)s/upscale" target="_blank" rel="noopener">MES Upscale website</a>
  <a href="%(ext)s/privacy-policy#upscale-app" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
%(tool)s
</main>
<div id="app-foot">
  <p><strong>Your pictures stay on this phone.</strong> The AI (Real-ESRGAN, BSD-3-Clause) runs on your device, on the graphics chip when the phone allows it, otherwise on the processor. Nothing is uploaded. No accounts, no ads, no tracking.</p>
  <p><a href="%(ext)s/privacy-policy#upscale-app" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s/upscale" target="_blank" rel="noopener">Website</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
<script src="js/native.js"></script>
<script src="js/upscale.js"></script>
<script>%(controls)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, controls=CONTROLS_JS, burger=BURGER)


def patch(s: str, pairs, what: str) -> str:
    for old, new in pairs:
        assert old in s, "%s changed: %s" % (what, old[:80])
        s = s.replace(old, new)
    return s


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    for d in ("js", "img", "vendor", "models"):
        (WWW / d).mkdir(parents=True)

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = re.sub(r"\s*<script[^>]*>.*?</script>", "", tool, flags=re.S)
    tool = patch(tool, [
        ("· you can also paste (Ctrl+V)", '<span class="pc-only">· you can also paste (Ctrl+V)</span>'),
        ("⬇ Download all (ZIP)", "⬇ Save all"),
        ("<b>Drop pictures here</b> or click to choose", "<b>Make a picture bigger and sharper</b>"),
        ("Drag the line to compare · wheel or pinch to zoom · drag to move · Esc closes", "Drag the line to compare · pinch to zoom · drag to move"),
        ("⬇ Download</button>", "⬇ Save</button>"),
        ("Your pictures are upscaled inside your browser with an AI model that runs on your own computer or phone (on the graphics chip when the browser allows it). Nothing is uploaded. Want to touch it up afterwards? Every result has an <b>Edit</b> button that opens it in the <a href=\"/photo\">MES Photo Editor</a>.",
         "Your pictures are upscaled on this phone with an AI model that runs on the phone itself (on the graphics chip when it can). Nothing is uploaded."),
    ], "upscale index.html")
    tool = rewrite_links(tool)
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    js = (SRC / "js" / "upscale.js").read_text(encoding="utf-8")
    js = patch(js, [
        ('"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js"', '"vendor/ort.all.min.js"'),
        ("window.ort.env.wasm.numThreads = 1;", 'window.ort.env.wasm.numThreads = 1; window.ort.env.wasm.wasmPaths = new URL("vendor/", location.href).href;'),
        ('"/upscale/models/" + m.file', '"models/" + m.file'),
        ('fetch("/upscale/img/sample.jpg")', 'fetch("img/sample.jpg")'),
        ("function download(blob, name) {", "function download(blob, name) { if (window.MESAppSave) return window.MESAppSave(blob, name);"),
        ("if (done.length === 1) { download(", "if (window.MESAppSaveAll) { window.MESAppSaveAll(done.map(function (it) { return it.out; })); return; } if (done.length === 1) { download("),
        ('<button type="button" data-a="ed" title="Open the result in the MES Photo Editor">Edit</button>', ""),
        ("your browser did not offer the graphics chip (WebGPU), so big pictures take a while. Chrome, Edge or Brave on a computer are fastest.", "this phone did not offer its graphics chip to the app, so big pictures take a while. Small pictures and 2× are quickest."),
        ('"Downloading the AI model… "', '"Loading the AI model… "'),
        ("The first AI upscale downloads a small model (5 MB or less) and keeps it in your browser.", "The AI model is built into the app, so it works offline."),
    ], "upscale.js")
    (WWW / "js" / "upscale.js").write_text(js, encoding="utf-8")

    shutil.copy(APP / "native.js", WWW / "js" / "native.js")
    for f in (SRC / "models").iterdir():
        shutil.copy(f, WWW / "models" / f.name)
    shutil.copy(SRC / "img" / "sample.jpg", WWW / "img" / "sample.jpg")
    for n in VENDOR:
        shutil.copy(vendor(n), WWW / "vendor" / n)

    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((144, 144), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", 'src="/main_js/', "googlesyndication", 'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, upscale.js %d bytes%s" % (len(out), len(js), ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


def add_update_note() -> None:
    """'Update available' note + burger-menu item (shared ../app_update.py, ../mes.fm/main_js/app-update.js)."""
    import sys
    sys.path.insert(0, str(REPO))
    import app_update
    app_update.inject(APP, "upscale", IOS_ID, "fm.mes.upscale", "index.html")


if __name__ == "__main__":
    main()
    add_update_note()
