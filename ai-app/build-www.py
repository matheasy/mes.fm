#!/usr/bin/env python3
"""
build-www.py -- assemble ai-app/www/ from the live MES AI page (mes.fm/ai/index.html + js/ai.js), English version.

Same idea as the other MES apps: keeps the tool block <div class="tu ai" id="ai">, the page's inline CSS and the scripts,
and writes a small app header / menu / footer around them. Web-only parts (site header, AdSense, sidebar, comments, the FAQ,
the language menu) are left out.

THE APP IS FREE-ONLY. Apple's guideline 3.1.1 forbids unlocking features with cryptocurrency, and Google Play requires its own
billing for paid digital services, so paying per message in HBD stays on the website. In the app:
- only the models marked free (the cheap DeepSeek / Qwen / Llama ones, 10 free messages a day with a Hive login) and the free
  picture model (A.FREE.picModel, 3 free pictures a day) are offered: app-mode.js deletes every other entry of MESAI.MODELS /
  MESAI.IMAGES before the page script runs; the Video tab, the "how paying works" box, cost tables, the "use my free messages"
  ticks and the cloud-file row are hidden;
- the paid send paths stop with "no free messages left today" instead of asking for a price;
- mes.fm/api/ai itself only answers the app origins for status / free / freepic (paid ops are refused there too);
- the free "on this device" models (WebLLM) are left out: a WebView gives them no reliable WebGPU / memory.

Hive login = HiveAuth with the Keychain phone app (has:// deep link; no browser extension in an app), from mes.fm's own hive.js.
The once-a-day free-message signature goes through the same HiveAuth session (challenge_req).

Idempotent: wipes and regenerates www/ each run. Re-run after build_tool_apps.py --only=ai, then `npx cap sync`.
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SITE = REPO / "mes.fm"
SRC = SITE / "ai"
WWW = APP / "www"
EXT = "https://mes.fm"
VERSION = "1.0"
IOS_ID = "6838930248"   # App Store Connect app id (MES AI: Free Chat & Pictures)
MAIN_JS = ["hive.js", "hive-store.js", "link-open.js", "omml.js"]


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
    head = html.split("<body", 1)[0]
    styles = re.findall(r"<style>(.*?)</style>", head, flags=re.S)
    css = "\n".join(styles[:2])
    start = html.index('<div class="tu ai" id="ai"')
    end = html.index("<!-- PC (Responsive/Rectangle)", start)
    tool = html[start:end].rstrip()
    tool = re.sub(r"\s*<script[^>]*>.*?</script>", "", tool, flags=re.S)
    tool = re.sub(r'\s*<div class="tu-seo">.*?</dl>\s*</div>', "", tool, flags=re.S)
    tool = re.sub(r'\s*<nav class="ai-lang".*?</nav>', "", tool, flags=re.S)
    tool = re.sub(r'\s*<div class="ai-lang".*?</details>\s*</div>', "", tool, flags=re.S)
    return css, balanced(tool)


def rewrite_links(tool: str) -> str:
    tool = re.sub(r'href="/([^"]*)"', r'href="%s/\1" target="_blank" rel="noopener"' % EXT, tool)
    tool = re.sub(r'<a (?![^>]*\btarget=)([^>]*href="https?://[^"]+")', r'<a target="_blank" rel="noopener" \1', tool)
    return tool


APP_MODE_JS = r"""
/* MES AI app: free tiers only (see ai-app/build-www.py). Runs after MESAI (lib.js) and before the page script: the saved
   model / picture model are set to free ones; the pickers only ever list the free ones (APP_PRUNE_JS after the page script). */
(function () {
	var A = window.MESAI; if (!A) return;
	window.MES_AI_APP = true;
	A.DEFAULT_MODEL = "qwen";
	var K = "mes-ai:v1", s = {};
	try { s = JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch (e) {}
	if (!A.MODELS[s.model] || !A.MODELS[s.model].free) s.model = "qwen";
	s.imod = A.FREE.picModel; s.tab = s.tab === "vid" ? "chat" : s.tab;
	try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) {}
})();
"""
APP_PRUNE_JS = r"""
(function () {
	var A = window.MESAI; if (!A) return;
	function ok(sel, k) { return sel.id === "ai-model" ? !!(A.MODELS[k] && A.MODELS[k].free) : k === A.FREE.picModel; }
	function prune(sel) {
		if (!sel) return;
		[].slice.call(sel.querySelectorAll("option")).forEach(function (o) { if (!ok(sel, o.value)) o.remove(); });
		[].slice.call(sel.querySelectorAll("optgroup")).forEach(function (g) { if (!g.children.length) g.remove(); });
	}
	["ai-model", "ai-imod"].forEach(function (id) {
		var sel = document.getElementById(id); prune(sel);
		if (sel) new MutationObserver(function () { prune(sel); }).observe(sel, { childList: true, subtree: true });
	});
})();
"""

APP_CSS = """
html,body{margin:0;padding:0;overscroll-behavior-y:none;}
html,body,button,a,input,label,summary,select{touch-action:manipulation;}
body{background:#f3f3fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;
  padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
body.dark-mode{background:#131320;color:#e6e6f0;}
#app-bar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:.7em;background:#4f46e5;color:#fff;
  padding:calc(env(safe-area-inset-top) + .5em) .8em .55em .8em;box-shadow:0 1px 6px rgba(0,0,0,.3);}
#app-bar img{width:36px;height:36px;border-radius:9px;flex:none;}
#app-bar .name{flex:1;min-width:0;font-size:1.2em;font-weight:700;color:#fff;}
.hb{all:unset;cursor:pointer;color:#fff;box-sizing:border-box;}
#menu-btn{width:42px;height:42px;border:1.5px solid rgba(255,255,255,.7);border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;}
#menu-btn svg{width:22px;height:22px;stroke:#fff;}
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 58px);z-index:2147483001;width:min(19em,calc(100vw - 20px));background:#fff;color:#222;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.3);padding:.4em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 80px);overflow:auto;border:1px solid #dcdaf5;}
body.dark-mode #menu{background:#1f1f2e;color:#e6e6f0;border-color:#36364e;}
#menu.open{display:block;}
#menu a,#menu button.mi{display:block;width:100%;text-align:left;box-sizing:border-box;padding:.75em 1em;color:#4338ca;font-weight:600;text-decoration:none;border:0;border-top:1px solid #ebeaf8;background:none;font-size:.97em;font-family:inherit;}
body.dark-mode #menu a,body.dark-mode #menu button.mi{color:#c7c4ff;border-top-color:#30304a;}
#menu .sec{padding:.55em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#777;border-top:1px solid #ebeaf8;}
body.dark-mode #menu .sec{color:#a3a3b8;border-top-color:#30304a;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
#app-main{padding:.7em .6em 0 .6em;max-width:62em;margin:0 auto;}
#app-intro{margin:0 0 .7em;padding:.75em .9em;border-radius:12px;background:#fff;border:1px solid #dcdaf5;font-size:.93em;line-height:1.45;color:#333;}
body.dark-mode #app-intro{background:#1f1f2e;border-color:#36364e;color:#d8d8e6;}
#app-intro b{color:inherit;}
#app-foot{padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;max-width:46em;margin:0 auto;}
body.dark-mode #app-foot{color:#a3a3b8;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#4f46e5;font-weight:600;margin-right:1.1em;}
body.dark-mode #app-foot a{color:#c7c4ff;}
#app-foot strong{color:inherit;}
/* free tiers only */
#ai-pay,#ai-payshow,#ai-help,#ai-tab-vid,#ai-vid,#ai-cloudrow,#ai-open-text,#ai-cost,#ai-typ,#ai-freeuse,#ai-ifreeuse,[data-det],.ai-det,#ai-attach,#ai-iattach,#ai-irefs,#ai-files{display:none !important;}
.tu-toast{z-index:2147483647 !important;bottom:calc(env(safe-area-inset-bottom) + 1.5em) !important;}
#as-scrim{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;}
#as-box{background:#fff;color:#222;width:min(30em,100%);border-radius:16px 16px 0 0;padding:.6em .7em calc(env(safe-area-inset-bottom) + .8em) .7em;box-sizing:border-box;}
body.dark-mode #as-box{background:#1f1f2e;color:#e6e6f0;}
#as-box .t{font-size:.85em;color:#777;text-align:center;padding:.4em .5em .7em;word-break:break-all;}
#as-box button{display:block;width:100%;margin:.35em 0;padding:.85em;border-radius:12px;border:0;font:inherit;font-weight:700;font-size:1.02em;background:#ecebfd;color:#3730a3;}
#as-box button.p{background:#4f46e5;color:#fff;}
body.dark-mode #as-box button{background:#2c2b48;color:#d6d3ff;}
body.dark-mode #as-box button.p{background:#4f46e5;color:#fff;}
"""
BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var menu=document.getElementById("menu"), scrim=document.getElementById("menu-scrim");
  function toggle(open){ menu.classList.toggle("open",open); scrim.classList.toggle("open",open); }
  document.getElementById("menu-btn").addEventListener("click",function(e){ e.stopPropagation(); toggle(!menu.classList.contains("open")); });
  scrim.addEventListener("click",function(){ toggle(false); });
  menu.addEventListener("click",function(e){ if(e.target.tagName==="A"||e.target.classList.contains("mi")) toggle(false); });
  function tab(id){ var b=document.getElementById(id); if(b) b.click(); window.scrollTo(0,0); }
  document.getElementById("mi-chat").addEventListener("click",function(){ tab("ai-tab-chat"); });
  document.getElementById("mi-img").addEventListener("click",function(){ tab("ai-tab-img"); });
  var mq=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)");
  function th(){ document.body.classList.toggle("dark-mode",!!(mq&&mq.matches)); }
  th(); if(mq&&mq.addEventListener) mq.addEventListener("change",th);
})();
"""


def page(css: str, tool: str) -> str:
    scripts = "\n".join('<script src="js/%s"></script>' % n for n in MAIN_JS if n != "omml.js")
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>MES AI</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="36" height="36">
  <div class="name">MES AI</div>
  <button id="menu-btn" class="hb" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="menu-scrim"></div>
<nav id="menu" aria-label="Menu">
  <button class="mi" type="button" id="mi-chat" style="border-top:0">💬 Chat</button>
  <button class="mi" type="button" id="mi-img">🖼️ Picture</button>
  <div class="sec">Help</div>
  <a href="https://hive-keychain.com" target="_blank" rel="noopener">Get Hive Keychain (to log in)</a>
  <a href="https://signup.hive.io" target="_blank" rel="noopener">Make a free Hive account</a>
  <div class="sec">About</div>
  <a href="%(ext)s/privacy-policy#ai-app" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
<div id="app-intro"><b>Free AI chat and pictures.</b> Log in with your Hive account (through the Hive Keychain app) to get 10 free messages and 3 free pictures every day. No payment, no subscription.</div>
%(tool)s
</main>
<div id="app-foot">
  <p><strong>How it works.</strong> Your messages are sent to mes.fm, which passes them to the AI model you picked (DeepSeek, Qwen or Llama, through OpenRouter) and sends the answer back. Your chats are kept only on this phone. Logging in uses HiveAuth: your Hive keys stay in the Keychain app, MES never sees them.</p>
  <p><a href="%(ext)s/privacy-policy#ai-app" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
<script src="js/native.js"></script>
%(scripts)s
<script src="js/ai.js"></script>
<script>%(prune)s</script>
<script>%(controls)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, controls=CONTROLS_JS, prune=APP_PRUNE_JS, burger=BURGER, scripts=scripts)


def patch(s: str, pairs, what: str) -> str:
    for old, new in pairs:
        assert old in s, "%s changed: %s" % (what, old[:90])
        s = s.replace(old, new)
    return s


APP_PRICE = """		if (window.MES_AI_APP) { var u0 = who();
			if (!freeApplies()) { $("ai-price").innerHTML = !u0 ? T("Log in with Hive above for 10 free messages a day") : FREEST.left === 0 ? T("No free messages left today: they come back at 00:00 UTC") : T("Checking your free messages…"); $("ai-send").textContent = T("Send"); }
			if (!picsApplies()) { $("ai-iprice").innerHTML = !u0 ? T("Log in with Hive above for 3 free pictures a day") : PICST.left === 0 ? T("No free pictures left today: they come back at 00:00 UTC") : T("Checking your free pictures…"); $("ai-make").textContent = T("Create"); }
		}
		$("ai-iattach").hidden ="""


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    for d in ("js", "img"):
        (WWW / d).mkdir(parents=True)

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = tool.replace("  (Ctrl+Enter sends)", "").replace(" (Ctrl+Enter sends)", "")
    tool = rewrite_links(tool)
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    js = (SRC / "js" / "ai.js").read_text(encoding="utf-8")
    cut = js.index("/* MES AI -- mes.fm/ai: AI chat")
    js = js[:cut] + APP_MODE_JS + "\n" + js[cut:]
    js = patch(js, [
        ("var mock = /^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname) || /[?&]mock=1\\b/.test(location.search);",
         "var mock = (!window.MES_AI_APP && /^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)) || /[?&]mock=1\\b/.test(location.search);"),
        ('fetch("/api/ai"', 'fetch("https://mes.fm/api/ai"'),
        ('fetch("/api/ai?op=free&acct="', 'fetch("https://mes.fm/api/ai?op=free&acct="'),
        ('fetch("/api/ai?op=status"', 'fetch("https://mes.fm/api/ai?op=status"'),
        ('"/api/ai?op=vfile&id="', '"https://mes.fm/api/ai?op=vfile&id="'),
        ('"/main_js/omml.js?v=1"', '"js/omml.js"'),
        ('(function () { // "Typical costs" table', '(function () { if (window.MES_AI_APP) return; // "Typical costs" table'),
        ("Each message is paid on its own; the price is next to the Send button.", "Free with your Hive login: 10 messages a day, short answers."),
        ("video: !!j.video, known: true", "video: !!j.video && !window.MES_AI_APP, known: true"),
        ('\t\tsetBusy(true);\n\t\tmsg(T("Getting the exact price…"));',
         '\t\tif (window.MES_AI_APP) { msg(FREEST.left === 0 ? T("No free messages left today: they come back at 00:00 UTC.") : T("Free messages are not ready yet: log in with Hive above and try again."), "err"); return; }\n\t\tsetBusy(true);\n\t\tmsg(T("Getting the exact price…"));'),
        ('\t\t$("ai-iattach").hidden =', APP_PRICE),
        ("""o.innerHTML = T('<b>MES AI is coming soon.</b> The page is ready; the AI services are being connected. <a href="?mock=1">Try the demo</a> (simulated payment and answer).');""",
         """o.innerHTML = window.MES_AI_APP ? T("<b>Can't reach MES AI right now.</b> Check your internet connection, then close and reopen the app.") : T('<b>MES AI is coming soon.</b> The page is ready; the AI services are being connected. <a href="?mock=1">Try the demo</a> (simulated payment and answer).');"""),
    ], "ai.js")
    # the paid picture path (right after the free-picture branch)
    i = js.index('msg(T("Done. Your free picture is shown (kept in this browser)."), "ok");')
    j = js.index("\t\tvar sendRefs = refs.map(", i)
    js = js[:j] + '\t\tif (window.MES_AI_APP) { setBusy(false); msg(PICST.left === 0 ? T("No free pictures left today: they come back at 00:00 UTC.") : T("Free pictures are 1k, made from your words only: log in with Hive above."), "err"); return; }\n' + js[j:]
    assert 'fetch("/api/ai' not in js, "a relative /api/ai call is left"
    (WWW / "js" / "ai.js").write_text(js, encoding="utf-8")

    for n in MAIN_JS:
        shutil.copy(SITE / "main_js" / n, WWW / "js" / n)
    shutil.copy(APP / "native.js", WWW / "js" / "native.js")

    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((144, 144), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", 'src="/main_js/', "googlesyndication", 'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, ai.js %d bytes%s" % (len(out), len(js), ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


def add_update_note() -> None:
    """'Update available' note + burger-menu item (shared ../app_update.py, ../mes.fm/main_js/app-update.js)."""
    import sys
    sys.path.insert(0, str(REPO))
    import app_update
    app_update.inject(APP, "ai", IOS_ID, "fm.mes.ai", "index.html")


if __name__ == "__main__":
    main()
    add_update_note()
