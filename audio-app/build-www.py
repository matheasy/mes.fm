#!/usr/bin/env python3
"""
build-www.py -- assemble audio-app/www/ from the live MES Audio Editor page (mes.fm/audio/index.html + js/audio.js).

Same idea as the other MES apps (polls-app, timer-app): keeps the tool block <div class="tu au" id="au">, the page's inline CSS
and the scripts it needs, and writes a small app header / menu / footer around them. Web-only parts (site header, AdSense,
sidebar, comments, main.js, track.js) are left out. The editor starts in its phone "simple mode" (Record, Open, trim, Remove
noise, Enhance speech, compare, Save / Share) because native.js defines window.MESAudioNative.

Offline: denoise.js (DeepFilterNet 3 noise removal), its ONNX model, the onnxruntime-web files it loads, lamejs (MP3) and
mp4-muxer (M4A) are copied into www/, so cleaning and saving work without a connection. The big binaries come from a cache
(vendor-cache/, downloaded once from jsDelivr / cdnjs) and are gitignored in www/ (they are rebuilt here).

native.js connects the page to the AudioNative plugin (native recorder that keeps going with the screen off, save / share).

Idempotent: wipes and regenerates www/ each run. Re-run after build_tool_apps.py --only=audio, then `npx cap sync`.
"""

import re
import shutil
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SITE = REPO / "mes.fm"
SRC = SITE / "audio"
WWW = APP / "www"
CACHE = APP / "vendor-cache"
EXT = "https://mes.fm"
VERSION = "1.0"
ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"
VENDOR = {
    "ort.all.min.js": ORT + "ort.all.min.js",
    "ort-wasm-simd-threaded.jsep.mjs": ORT + "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm": ORT + "ort-wasm-simd-threaded.jsep.wasm",
    "lame.min.js": "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js",
    "mp4-muxer.min.js": "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js",
}


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
    start = html.index('<div class="tu au" id="au"')
    end = html.index("<!-- PC (Responsive/Rectangle)", start)
    tool = balanced(html[start:end].rstrip())
    tool = re.sub(r'\s*<div class="tu-seo">.*$', "", tool, flags=re.S)   # the FAQ text below the editor is web-only
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
        req = urllib.request.Request(VENDOR[name], headers={"User-Agent": "mes-audio-app-build/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            f.write_bytes(r.read())
    return f


APP_CSS = """
html,body{margin:0;padding:0;background:#0f1115;overscroll-behavior-y:none;}
html,body,button,a,input,label,summary,select{touch-action:manipulation;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e7e9ee;-webkit-text-size-adjust:100%;
  padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
#app-bar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:.7em;background:#0369a1;color:#fff;
  padding:calc(env(safe-area-inset-top) + .5em) .8em .55em .8em;box-shadow:0 1px 6px rgba(0,0,0,.35);}
#app-bar img{width:36px;height:36px;border-radius:9px;flex:none;}
#app-bar .name{flex:1;min-width:0;font-size:1.2em;font-weight:700;color:#fff;}
.hb{all:unset;cursor:pointer;color:#fff;box-sizing:border-box;}
#menu-btn{width:42px;height:42px;border:1.5px solid rgba(255,255,255,.7);border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;}
#menu-btn svg{width:22px;height:22px;stroke:#fff;}
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 58px);z-index:2147483001;width:min(19em,calc(100vw - 20px));background:#1c1f26;color:#e7e9ee;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.5);padding:.4em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 80px);overflow:auto;border:1px solid #333948;}
#menu.open{display:block;}
#menu a,#menu button.mi{display:block;width:100%;text-align:left;box-sizing:border-box;padding:.75em 1em;color:#7dd3fc;font-weight:600;text-decoration:none;border:0;border-top:1px solid #2a2f3c;background:none;font-size:.97em;font-family:inherit;}
#menu .sec{padding:.55em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#a3aab8;border-top:1px solid #2a2f3c;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
#app-main{padding:0;}
#app-main .au{border-radius:0;border-left:0;border-right:0;margin:0;min-height:calc(100vh - 56px - env(safe-area-inset-top));}
#app-foot{padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#a3aab8;max-width:46em;margin:0 auto;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#7dd3fc;font-weight:600;margin-right:1.1em;}
#app-foot strong{color:#e7e9ee;}
"""
BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var menu=document.getElementById("menu"), scrim=document.getElementById("menu-scrim");
  function toggle(open){ menu.classList.toggle("open",open); scrim.classList.toggle("open",open); }
  document.getElementById("menu-btn").addEventListener("click",function(e){ e.stopPropagation(); toggle(!menu.classList.contains("open")); });
  scrim.addEventListener("click",function(){ toggle(false); });
  menu.addEventListener("click",function(e){ if(e.target.tagName==="A"||e.target.classList.contains("mi")) toggle(false); });
  var E=function(){ return window.MESAudioEditor; };
  document.getElementById("mi-simple").addEventListener("click",function(){ if(E()) E().setSimple(true,true); window.scrollTo(0,0); });
  document.getElementById("mi-full").addEventListener("click",function(){ if(E()) E().setSimple(false,true); window.scrollTo(0,0); });
  document.getElementById("mi-test").addEventListener("click",function(){ if(E()) E().testClip(); window.scrollTo(0,0); });
  document.body.classList.add("dark-mode");
})();
"""


def page(css: str, tool: str) -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>MES Audio</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="36" height="36">
  <div class="name">MES Audio</div>
  <button id="menu-btn" class="hb" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="menu-scrim"></div>
<nav id="menu" aria-label="Menu">
  <div class="sec" style="border-top:0">Editor</div>
  <button class="mi" type="button" id="mi-simple">Simple mode</button>
  <button class="mi" type="button" id="mi-full">Full editor (tracks, effects, markers)</button>
  <button class="mi" type="button" id="mi-test">Try a noisy test clip</button>
  <div class="sec">More from MES</div>
  <a href="%(ext)s/video" target="_blank" rel="noopener">Video Editor</a>
  <a href="%(ext)s/youtube-audio" target="_blank" rel="noopener">Loudness meter</a>
  <a href="%(ext)s/mic-test" target="_blank" rel="noopener">Mic test</a>
  <div class="sec">About</div>
  <a href="%(ext)s/audio" target="_blank" rel="noopener">MES Audio Editor website</a>
  <a href="%(ext)s/privacy-policy#audio-app" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
%(tool)s
</main>
<div id="app-foot">
  <p><strong>Recording keeps going with the screen off.</strong> Start recording, lock the phone or switch apps, and come back to stop it. Allow the microphone when asked.</p>
  <p><strong>Your audio stays on this device.</strong> Recording, editing, the AI noise removal (DeepFilterNet 3, MIT / Apache-2.0) and saving all happen on your phone. Nothing is uploaded. No accounts, no ads, no tracking.</p>
  <p><a href="%(ext)s/privacy-policy#audio-app" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s/audio" target="_blank" rel="noopener">Website</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
<script src="js/native.js"></script>
<script src="js/denoise.js"></script>
<script src="js/audio.js"></script>
<script>%(controls)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, controls=CONTROLS_JS, burger=BURGER)


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    for d in ("js", "img", "vendor", "models"):
        (WWW / d).mkdir(parents=True)

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = re.sub(r"\s*<script[^>]*>.*?</script>", "", tool, flags=re.S)
    tool = rewrite_links(tool)
    tool = tool.replace("Everything stays on your device.", "Everything stays on this phone.")
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    js = (SRC / "js" / "audio.js").read_text(encoding="utf-8")
    for old, new in (("https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js", "vendor/lame.min.js"),
                     ("https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js", "vendor/mp4-muxer.min.js"),
                     ('"/audio/sample-speech.mp3"', '"sample-speech.mp3"'),
                     ('"/main_js/ffmpeg/', '"/js/ffmpeg/')):
        assert old in js, "audio.js changed: " + old
        js = js.replace(old, new)
    (WWW / "js" / "audio.js").write_text(js, encoding="utf-8")

    dn = (SITE / "main_js" / "denoise.js").read_text(encoding="utf-8")
    for old, new in (('"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js"', '"vendor/ort.all.min.js"'),
                     ('ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"', 'ORT_WASM = new URL("vendor/", location.href).href'),
                     ('"/main_js/denoise/deepfilter.onnx"', '"models/deepfilter.onnx"')):
        assert old in dn, "denoise.js changed: " + old
        dn = dn.replace(old, new)
    (WWW / "js" / "denoise.js").write_text(dn, encoding="utf-8")

    shutil.copy(APP / "native.js", WWW / "js" / "native.js")
    shutil.copytree(SITE / "main_js" / "ffmpeg", WWW / "js" / "ffmpeg")
    shutil.copy(SITE / "main_js" / "denoise" / "deepfilter.onnx", WWW / "models" / "deepfilter.onnx")
    shutil.copy(SITE / "main_js" / "denoise" / "LICENSE-MIT", WWW / "models" / "LICENSE-MIT")
    shutil.copy(SRC / "sample-speech.mp3", WWW / "sample-speech.mp3")
    for n in VENDOR:
        shutil.copy(vendor(n), WWW / "vendor" / n)

    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((144, 144), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", 'src="/main_js/', "googlesyndication", 'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, audio.js %d bytes%s" % (len(out), len(js), ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


def add_update_note() -> None:
    """'Update available' note + burger-menu item (shared ../app_update.py, ../mes.fm/main_js/app-update.js)."""
    import sys
    sys.path.insert(0, str(REPO))
    import app_update
    app_update.inject(APP, "audio", IOS_ID, "fm.mes.audio", "index.html")


IOS_ID = "6837411404"   # App Store Connect app id (MES Audio Editor & Recorder)

if __name__ == "__main__":
    main()
    add_update_note()
