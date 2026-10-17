#!/usr/bin/env python3
"""
build-www.py -- assemble bmicalculator-app/www/ from the live BMI Calculator page
(mes.fm/bmicalculator/index.html + js/bmicalculator.js).

Unlike the Percentage Calculator app (which wraps the whole legacy page), the BMI page is a
tool-shell page whose calculator is one self-contained block, <div class="tu" id="bm">, plus the
page's own inline CSS and a vanilla script. So this keeps exactly those three things and writes a
small app shell around them (header with logo + title + light/dark toggle, the calculator, a
health disclaimer with the data sources, footer links). Everything web-only is left out: the site
header / info bar / side menu / floating bar, AdSense, the sidebar, bottom ad, FastComments,
Google Tag Manager, display-controls.js, site search, main.js, track.js.

Idempotent: wipes and regenerates www/ each run. Re-run whenever mes.fm/bmicalculator changes
(after build_tool_apps.py --only=bmicalculator), then `npx cap sync`.
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SRC = REPO / "mes.fm" / "bmicalculator"
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
    start = html.index('<div class="tu" id="bm">')
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
html,body{margin:0;padding:0;background:#fff;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#222;
  -webkit-text-size-adjust:100%;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
#app-bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:.7em;background:#b3529d;color:#fff;
  padding:calc(env(safe-area-inset-top) + .55em) 1em .55em 1em;box-shadow:0 1px 6px rgba(0,0,0,.25);}
#app-bar img{width:36px;height:36px;border-radius:9px;background:#fff;}
#app-bar .t{flex:1;font-size:1.15em;font-weight:700;color:#fff;line-height:1.15;}
#app-bar .t small{display:block;font-weight:400;font-size:.68em;opacity:.9;color:#fff;}
#app-bar button{all:unset;cursor:pointer;color:#fff;font-size:.9em;font-weight:600;padding:.45em .8em;border:1.5px solid rgba(255,255,255,.7);border-radius:999px;}
#app-main{max-width:46em;margin:0 auto;padding:1em 1em 0 1em;}
#app-foot{max-width:46em;margin:0 auto;padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#8a3d79;font-weight:600;}
#app-foot .links a{margin-right:1.1em;}
body.dark-mode{background:#16181c;color:#e6e6e6;}
body.dark-mode #app-bar{background:#5b2a50;}
body.dark-mode #app-foot,body.dark-mode #app-foot p{color:#b9bdc4;}
body.dark-mode #app-foot a{color:#e7a5d7;}
.tu .tu-seo{display:none;}
#app-foot strong{color:inherit;}
/* the page's reset paints every bare div/span/b/strong #333, and the web build leaves dark mode to display-controls.js;
   :where() keeps this at type-selector specificity so any class that sets its own colour (category colours, chips) still wins */
:where(body.dark-mode #bm) :is(div,span,b,strong,p,li,small,label,td,th){color:#e6e6e6;}
"""

THEME_JS = """
(function(){
  var KEY="mes-bmi-app:theme", b=document.body, btn=document.getElementById("theme-btn");
  function pref(){ try{ var v=localStorage.getItem(KEY); if(v) return v; }catch(e){} return window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"; }
  function apply(v){ b.classList.toggle("dark-mode",v==="dark"); b.classList.toggle("dark",v==="dark"); btn.textContent=v==="dark"?"Light":"Dark"; }
  apply(pref());
  btn.addEventListener("click",function(){ var v=b.classList.contains("dark-mode")?"light":"dark"; try{localStorage.setItem(KEY,v);}catch(e){} apply(v); });
})();
"""


def page(css: str, tool: str) -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>BMI Calculator</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<div id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="36" height="36">
  <div class="t">BMI Calculator<small>Body mass index, healthy range and progress</small></div>
  <button id="theme-btn" type="button" aria-label="Switch between light and dark">Dark</button>
</div>
<main id="app-main">
%(tool)s
</main>
<div id="app-foot">
  <p><strong>Not medical advice.</strong> BMI is a screening number, not a diagnosis: it does not measure body fat, muscle, age, sex or fitness. Talk to a doctor or dietitian before starting a diet or exercise plan, and before making any medical decision. Children and teens (2&ndash;19) are judged with BMI-for-age percentiles, not these cut-offs.</p>
  <p><strong>How it is calculated.</strong> BMI = weight (kg) &divide; height (m)&sup2;. Categories follow the World Health Organization adult classification (underweight below 18.5, normal 18.5&ndash;24.9, overweight 25&ndash;29.9, obese 30 and over) or, if you choose it, the WHO Asia-Pacific cut-offs (overweight from 23, obese from 27.5). Healthy weight range = the weights that give a BMI of 18.5 to 24.9 at your height. Source: <a href="https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index" target="_blank" rel="noopener">WHO Body mass index</a>; <a href="https://www.cdc.gov/bmi/adult-calculator/index.html" target="_blank" rel="noopener">CDC adult BMI</a>.</p>
  <p><strong>Your data stays on this device.</strong> Weight, height and saved measurements are stored only in the app on your phone. There are no accounts, no ads and no tracking, and nothing you enter is sent anywhere.</p>
  <p class="links"><a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s/bmicalculator" target="_blank" rel="noopener">Website</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
<script src="js/bmicalculator.js"></script>
<script>%(theme)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS, tool=tool, ext=EXT, version=VERSION, theme=THEME_JS)


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit("source not found: %s" % SRC)
    if WWW.exists():
        shutil.rmtree(WWW)
    (WWW / "js").mkdir(parents=True)
    (WWW / "img").mkdir()

    css, tool = extract((SRC / "index.html").read_text(encoding="utf-8"))
    tool = rewrite_links(tool)
    (WWW / "index.html").write_text(page(css, tool), encoding="utf-8")

    js = (SRC / "js" / "bmicalculator.js").read_text(encoding="utf-8")
    # share links must point at the website (the app's own origin is capacitor://localhost)
    n = js.count("location.origin")
    js = js.replace("location.origin", '"%s"' % EXT)
    (WWW / "js" / "bmicalculator.js").write_text(js, encoding="utf-8")

    shutil.copy(SRC / "img" / "logo-512.png", WWW / "img" / "logo.png")

    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", "main_js/", "googlesyndication",
                       'href="/', "data-src=") if p in out]
    print("  index.html  %d bytes, js %d bytes, location.origin patched x%d%s"
          % (len(out), len(js), n, ("  <-- CHECK: " + ", ".join(bad)) if bad else ""))
    print("done -> %s" % WWW)


if __name__ == "__main__":
    main()
