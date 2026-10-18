#!/usr/bin/env python3
"""
build-www.py -- assemble fitness-app/www/ (MES Fitness Calculators) from the live calculator pages on mes.fm.

One app, 13 calculators: for each tool it takes the page's own `<div class="tu" id="..">` block, the page's inline CSS and
its vanilla script (mes.fm/<slug>/index.html + js/<slug>.js), and puts them into one shell with a home screen (tiles) and
one pane per tool (location.hash routing, so the Android back button works). Everything web-only is dropped (site header,
ads, sidebar, comments, tracking). Per-tool accent colours are scoped to the tool's root id, because the pages all define
`.tu {--accent:..}` and the last one would win. Print buttons are removed (no window.print in a WebView), share links point
at the website, and links to other bundled tools become in-app links.

Idempotent: wipes and regenerates www/. Re-run after the web pages change (build_tool_apps.py), then `npx cap sync`.
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SITE = REPO / "mes.fm"
WWW = APP / "www"
EXT = "https://mes.fm"
VERSION = "1.0"

# slug, group, title, one-line description
TOOLS = [
    ("bmicalculator", "Body", "BMI Calculator", "BMI, healthy weight range and a history chart", "bmi body mass index weight height obesity"),
    ("body-fat-calculator", "Body", "Body Fat Calculator", "U.S. Navy tape method, lean mass and goals", "body fat navy lean mass tape"),
    ("ideal-weight-calculator", "Body", "Ideal Weight", "Four classic formulas next to the healthy range", "ideal weight devine robinson hamwi miller"),
    ("waist-to-hip-ratio-calculator", "Body", "Waist-to-Hip Ratio", "WHR, waist-to-height and body shape", "waist hip whr ratio shape apple pear"),
    ("bmr-calculator", "Food and water", "BMR and TDEE", "Daily calories to maintain, lose or gain", "bmr tdee calories metabolism maintenance mifflin"),
    ("macro-calculator", "Food and water", "Macro Calculator", "Protein, carbs and fat in grams", "macros protein carbs fat diet cutting bulking"),
    ("protein-intake-calculator", "Food and water", "Protein Intake", "How much protein for your goal", "protein grams muscle diet vegan"),
    ("water-intake-calculator", "Food and water", "Water Intake", "Daily water target and a drink tracker", "water hydration drink tracker"),
    ("heart-rate-zone-calculator", "Training", "Heart Rate Zones", "Five training zones from your max heart rate", "heart rate pulse zones karvonen max hr"),
    ("calories-burned-calculator", "Training", "Calories Burned", "85 activities, minutes and weekly totals", "calories burned exercise met activity workout"),
    ("pace-calculator", "Training", "Running Pace", "Pace, time, distance, splits and race predictions", "running pace speed marathon split race time"),
    ("one-rep-max-calculator", "Training", "One-Rep Max", "Seven formulas, percent table and plate loader", "1rm one rep max strength lifting plates barbell"),
    ("sleep-calculator", "Sleep", "Sleep Calculator", "Bedtimes and wake-up times in 90-minute cycles", "sleep bedtime wake cycles nap"),
]
SLUGS = {t[0] for t in TOOLS}
ALIAS = {"tdee-calculator": "bmr-calculator"}  # the BMR page already shows TDEE


def balanced(fragment: str) -> str:
    opens = len(re.findall(r"<div\b", fragment))
    closes = len(re.findall(r"</div>", fragment))
    while closes > opens:
        i = fragment.rfind("</div>")
        fragment = fragment[:i] + fragment[i + 6:]
        closes -= 1
    assert closes == opens, "unbalanced markup: %d open, %d close" % (opens, closes)
    return fragment


def scope_accent(css: str, rid: str) -> str:
    """`.tu {..--accent..}` and `body.dark-mode .tu {..--accent..}` rules -> scoped to #<rid>.tu"""
    def fix(m):
        sel, body = m.group(1), m.group(2)
        if "--accent" not in body and "--tint" not in body:
            return m.group(0)
        pre = "body.dark-mode " if sel.strip().startswith("body.dark-mode") else ""
        return "%s#%s.tu{%s}" % (pre, rid, body)
    return re.sub(r"(?<![\w#.-])((?:body\.dark-mode\s+)?\.tu)\s*\{([^{}]*)\}", fix, css)


def extract(slug: str):
    html = (SITE / slug / "index.html").read_text(encoding="utf-8")
    head = html.split("<body", 1)[0]
    styles = re.findall(r"<style>(.*?)</style>", head, flags=re.S)
    start = html.index('<div class="tu"')
    end = html.index("<!-- PC (Responsive/Rectangle)", start)
    tool = balanced(html[start:end].rstrip())
    rid = re.search(r'id="(\w+)"', tool[:200]).group(1)
    return styles[0], scope_accent(styles[1], rid), tool, rid


def rewrite_links(tool: str) -> str:
    def go(m):
        path = m.group(1)
        slug = path.strip("/").split("/")[0].split("?")[0]
        slug = ALIAS.get(slug, slug)
        if slug in SLUGS and path.strip("/") in (slug, ""):
            return 'href="#%s" data-go="%s"' % (slug, slug)
        if path.strip("/").split("?")[0] in ALIAS:
            return 'href="#%s" data-go="%s"' % (ALIAS[path.strip("/").split("?")[0]], ALIAS[path.strip("/").split("?")[0]])
        return 'href="%s%s" target="_blank" rel="noopener"' % (EXT, path)
    tool = re.sub(r'href="(/[^"]*)"', go, tool)
    tool = re.sub(r'<a (?![^>]*\btarget=)([^>]*href="https?://[^"]+")', r'<a target="_blank" rel="noopener" \1', tool)
    tool = re.sub(r'(<a [^>]*target="_blank"[^>]*)\s+target="_blank"', r"\1", tool)
    return tool


def clean_tool(tool: str) -> str:
    tool, n = re.subn(r'\s*<button[^>]*(?:\bbm-print\b|id="\w\w-print")[^>]*>Print</button>', "", tool)
    assert n == 1, "Print button not found"
    return tool.replace("saved in this browser", "saved on this device").replace("Saved in this browser", "Saved on this device")


def clean_js(js: str, slug: str) -> str:
    js = js.replace('location.origin + location.pathname.replace(/\\/index\\.html$/, "")', '"%s/%s"' % (EXT, slug))
    js = js.replace("location.origin", '"%s"' % EXT)
    js, n = re.subn(r"[^\n]*window\.print\(\)[^\n]*\n", "", js)
    assert n >= 1, "print handler not found in " + slug
    assert "window.print" not in js and "location.pathname.replace" not in js
    return js


APP_CSS = """
html,body{margin:0;padding:0;background:#fff;overscroll-behavior-y:none;}
html,body,button,a,input,label,summary{touch-action:manipulation;} /* no double-tap zoom when tapping A+ repeatedly */
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#222;
  -webkit-text-size-adjust:100%;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);}
#status-cover{position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);background:#237a35;z-index:2147483000;pointer-events:none;}
body.dark-mode #status-cover{background:#123d1b;}
/* full header (scrolls away) */
#app-bar{display:flex;align-items:center;gap:.8em;background:#237a35;color:#fff;
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
  background:#237a35;color:#fff;padding:.4em .6em .4em .8em;box-shadow:0 2px 8px rgba(0,0,0,.3);
  transform:translateY(-140%);transition:transform .2s ease;visibility:hidden;}
#cbar.show{transform:translateY(0);visibility:visible;}
body.dark-mode #cbar{background:#123d1b;}
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
#menu .btn.ic svg{width:20px;height:20px;stroke:#1f6a2f;}
body.dark-mode #menu .btn.ic svg{stroke:#8fe0a1;}
#ctab{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 4px);z-index:2147482000;background:#237a35;color:#fff;border-radius:0 0 10px 10px;
  padding:.2em 1.1em .3em;font-size:.95em;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);display:none;cursor:pointer;}
body.dark-mode #ctab{background:#123d1b;}
body.cbar-hidden.past #ctab{display:block;}
body.cbar-hidden #cbar{display:none;}
/* burger menu */
#menu{position:fixed;right:10px;top:calc(env(safe-area-inset-top) + 66px);z-index:2147483001;width:min(20em,calc(100vw - 20px));background:#fff;color:#222;border-radius:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.35);padding:.5em 0;display:none;max-height:calc(100vh - env(safe-area-inset-top) - 90px);overflow:auto;}
#menu.open{display:block;}
#menu .row{display:flex;align-items:center;justify-content:space-between;padding:.6em 1em;gap:.6em;font-size:.95em;color:#222;}
#menu .row b{color:#222;}
#menu .btn{border:1.5px solid #237a35;color:#1f6a2f;border-radius:999px;padding:.35em .8em;font-weight:700;}
#menu a{display:block;padding:.7em 1em;color:#1f6a2f;font-weight:600;text-decoration:none;border-top:1px solid #eee;font-size:.95em;}
#menu .sec{padding:.5em 1em .2em;font-size:.72em;letter-spacing:.06em;text-transform:uppercase;color:#777;border-top:1px solid #eee;}
#menu-scrim{position:fixed;inset:0;z-index:2147483000;display:none;}
#menu-scrim.open{display:block;}
body.dark-mode #menu{background:#23262b;color:#e6e6e6;}
body.dark-mode #menu .row,body.dark-mode #menu .row b{color:#e6e6e6;}
body.dark-mode #menu a{color:#8fe0a1;border-top-color:#3a3e45;}
body.dark-mode #menu .sec{color:#9aa0a8;border-top-color:#3a3e45;}
body.dark-mode #menu .btn{border-color:#8fe0a1;color:#8fe0a1;}
#app-main{max-width:46em;margin:0 auto;padding:1em 1em 0 1em;}
#app-foot{max-width:46em;margin:0 auto;padding:1.2em 1em calc(env(safe-area-inset-bottom) + 2em) 1em;font-size:.85em;line-height:1.5;color:#555;}
#app-foot p{margin:0 0 .8em 0;color:inherit;}
#app-foot a{color:#1f6a2f;font-weight:600;}
#app-foot .links a{margin-right:1.1em;}
body.dark-mode{background:#16181c;color:#e6e6e6;}
body.dark-mode #app-bar{background:#123d1b;}
body.dark-mode #app-foot,body.dark-mode #app-foot p{color:#b9bdc4;}
body.dark-mode #app-foot a{color:#8fe0a1;}
.tu .tu-seo{display:none;}
#app-foot strong{color:inherit;}
/* big text sizes (zoom): let table headings and cells wrap so the tables fit the card instead of scrolling sideways */
.tu .tu-table th,.tu .tu-table td{white-space:normal;padding:.5em .35em;overflow-wrap:anywhere;}
.tu .tu-table td:last-child,.tu .tu-table th:last-child{min-width:5.5em;}
.tu .tu-chip small{color:inherit;}
/* the page's reset paints every bare div/span/b/strong #333, and the web build leaves dark mode to display-controls.js;
   :where() keeps this at type-selector specificity so any class that sets its own colour (category colours, chips) still wins */
"""

MOON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
SUN = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
THEME_BTN = '<span class="moon">%s</span><span class="sun">%s</span>' % (MOON, SUN)

BURGER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

CONTROLS_JS = """
(function(){
  var b=document.body, KS="mes-fitness-app:textscale", KT="mes-fitness-app:theme", KH="mes-fitness-app:cbarhide";
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



EXTRA_CSS = """
.lead{margin:.2em 0 1em;font-size:1.02em;line-height:1.45;}
.grp{font-size:1.15em;margin:1.3em 0 .5em;color:#1f6a2f;border:0;padding:0;}
body.dark-mode .grp{color:#8fe0a1;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(10.5em,1fr));gap:.7em;}
.tile{display:flex;flex-direction:column;gap:.15em;padding:.8em;border:1.5px solid #cfe3d3;border-radius:14px;background:#fff;text-decoration:none;color:#222;touch-action:manipulation;}
.tile img{width:56px;height:56px;border-radius:13px;margin-bottom:.35em;}
.tile .tt{font-weight:700;color:#1f6a2f;font-size:1em;line-height:1.2;}
.tile .td{font-size:.8em;line-height:1.3;color:#555;}
body.dark-mode .tile{background:#202428;border-color:#37413a;}
body.dark-mode .tile .tt{color:#8fe0a1;} body.dark-mode .tile .td{color:#b9bdc4;}
.back{display:inline-block;margin:0 0 .4em;padding:.4em 0;color:#1f6a2f;font-weight:700;text-decoration:none;touch-action:manipulation;}
body.dark-mode .back{color:#8fe0a1;}
.tool-title{font-size:1.5em;margin:.1em 0 .5em;line-height:1.2;}
.tool-src{margin:1.4em 0 .2em;font-size:.9em;} .tool-src a{color:#1f6a2f;font-weight:600;} body.dark-mode .tool-src a{color:#8fe0a1;}
.promo{margin-top:1em;} .promo a{color:#1f6a2f;font-weight:700;} body.dark-mode .promo a{color:#8fe0a1;}
.pane[hidden]{display:none;}
.srch{-webkit-appearance:none;appearance:none;width:100%;box-sizing:border-box;font-size:1em;padding:.7em .9em;border:1.5px solid #9fc3a8;border-radius:12px;margin:0 0 .4em;background:#fff !important;color:#222;}
body.dark-mode .srch{background:#202428 !important;color:#e6e6e6;border-color:#37413a;}
.grp[hidden],.grid[hidden],.tile[hidden]{display:none;}
"""

def tile_img(slug: str) -> str:
    from PIL import Image
    d = SITE / slug / "img"
    src = d / "logo-512.png" if (d / "logo-512.png").exists() else d / "logo.png"
    out = WWW / "img" / ("t-%s.png" % slug)
    Image.open(src).convert("RGBA").resize((144, 144), Image.LANCZOS).save(out, optimize=True)
    return "img/t-%s.png" % slug


def page(css: str, home: str, panes: str, scripts: str) -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Fitness Calculators</title>
<style>%(css)s</style>
<style>%(app_css)s</style>
</head>
<body>
<div id="status-cover"></div>
<header id="app-bar" role="banner">
  <img src="img/logo.png" alt="" width="64" height="64">
  <div class="t"><div class="name">Fitness Calculators</div><div class="tag">BMI, calories, macros, heart rate, pace and more. Free, private, works offline.</div></div>
  <button id="menu-btn" class="hb js-menu" type="button" aria-label="Menu">%(burger)s</button>
</header>
<div id="cbar" role="toolbar" aria-label="Quick controls">
  <img src="img/logo.png" alt="" width="28" height="28">
  <div class="cn">Fitness Calculators</div>
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
  <a href="#home">All calculators</a>
  <div class="sec">About</div>
  <a href="%(ext)s/mobile-apps" target="_blank" rel="noopener">More MES apps</a>
  <a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>
  <a href="%(ext)s/contact" target="_blank" rel="noopener">Contact us</a>
</nav>
<main id="app-main">
%(home)s
%(panes)s
</main>
<div id="app-foot">
  <p><strong>Not medical advice.</strong> These calculators give general estimates from the numbers you enter. They do not measure body fat, fitness or health and are not a diagnosis or a treatment plan. Talk to a doctor, dietitian or qualified trainer before changing your diet, training or sleep, and before any medical decision.</p>
  <p><strong>How each result is worked out.</strong> Every calculator shows its formula on the screen, and the full method with sources (WHO, CDC, NIH / Institute of Medicine, American College of Sports Medicine, published equations such as Mifflin-St Jeor, Tanaka and Epley) is on its page at mes.fm, linked under the calculator.</p>
  <p><strong>Your data stays on this device.</strong> Weights, measurements and logs are stored only on this device, inside the app. There are no accounts, no ads and no tracking, and nothing you enter is sent anywhere.</p>
  <p class="links"><a href="%(ext)s/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a><a href="%(ext)s/contact" target="_blank" rel="noopener">Contact</a><a href="%(ext)s" target="_blank" rel="noopener">mes.fm</a></p>
  <p>Version %(version)s &middot; Math Easy Solutions &middot; mes.fm</p>
</div>
%(scripts)s
<script>%(controls)s</script>
<script>%(route)s</script>
</body>
</html>
""" % dict(css=css, app_css=APP_CSS + EXTRA_CSS, home=home, panes=panes, scripts=scripts, ext=EXT, version=VERSION, burger=BURGER, theme_btn=THEME_BTN, controls=CONTROLS_JS, route=ROUTE_JS)


ROUTE_JS = """
(function(){
  var panes=[].slice.call(document.querySelectorAll("section.pane")), KL="mes-fitness-app:last";
  function route(){
    var h=(location.hash||"").replace("#","")||"home", want="pane-"+h; if(h==="home") want="home";
    if(!document.getElementById(want)){ want="home"; h="home"; }
    panes.forEach(function(p){ p.hidden=(p.id!==want); });
    window.scrollTo(0,0);
    setTimeout(function(){ try{ window.dispatchEvent(new Event("resize")); }catch(e){} },30);
  }
  window.addEventListener("hashchange",route);
  document.addEventListener("click",function(e){ var a=e.target.closest&&e.target.closest("a[data-go]"); if(!a) return; e.preventDefault(); location.hash="#"+a.getAttribute("data-go"); });
  var q=document.getElementById("q");
  if(q) q.addEventListener("input",function(){
    var w=q.value.toLowerCase().split(/\s+/).filter(Boolean), any=false;
    [].slice.call(document.querySelectorAll("#home .tile")).forEach(function(t){ var k=t.getAttribute("data-k")||"", ok=w.every(function(x){ return k.indexOf(x)>-1; }); t.hidden=!ok; if(ok) any=true; });
    [].slice.call(document.querySelectorAll("#home .grid")).forEach(function(g){ var vis=g.querySelector(".tile:not([hidden])"); g.hidden=!vis; g.previousElementSibling.hidden=!vis; });
    document.getElementById("noq").hidden=any;
  });
  route();
})();
"""


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    (WWW / "js").mkdir(parents=True)
    (WWW / "img").mkdir()

    css_parts, panes, tiles, scripts, groups = [], [], {}, [], []
    base_css = None
    for slug, group, title, desc, kws in TOOLS:
        c0, c1, tool, rid = extract(slug)
        base_css = base_css or c0
        css_parts.append(c1)
        css_parts.append(":where(body.dark-mode #%s) :is(div,span,b,strong,p,li,small,label,td,th){color:#e6e6e6;}" % rid)
        tool = clean_tool(rewrite_links(tool))
        extra = ""
        if slug == "bmicalculator":
            extra = ('<div class="tu-card promo"><b>Just want BMI?</b> There is a separate, lighter <b>MES BMI Calculator</b> app with only this calculator. '
                     '<a href="%s/mobile-apps" target="_blank" rel="noopener">Get the BMI app</a></div>' % EXT)
        panes.append(
            '<section id="pane-%s" class="pane tool" hidden>\n<a class="back" href="#home" data-go="home">&#8249; All calculators</a>\n<h1 class="tool-title">%s</h1>\n%s\n%s\n'
            '<p class="tool-src"><a href="%s/%s" target="_blank" rel="noopener">Method, formulas and sources on mes.fm &rsaquo;</a></p>\n</section>'
            % (slug, title, tool, extra, EXT, slug))
        js = clean_js((SITE / slug / "js" / ("%s.js" % slug)).read_text(encoding="utf-8"), slug)
        (WWW / "js" / ("%s.js" % slug)).write_text(js, encoding="utf-8")
        scripts.append('<script src="js/%s.js"></script>' % slug)
        tiles.setdefault(group, []).append(
            '<a class="tile" href="#%s" data-go="%s" data-k="%s"><img src="%s" alt="" width="56" height="56"><span class="tt">%s</span><span class="td">%s</span></a>'
            % (slug, slug, (title + " " + desc + " " + kws).lower(), tile_img(slug), title, desc))
    home = ['<section id="home" class="pane"><p class="lead">Pick a calculator. Everything works offline and stays on your phone.</p><input id="q" class="srch" type="search" placeholder="Search: bmr, protein, pace, sleep..." autocomplete="off" autocapitalize="off" aria-label="Search calculators"><p id="noq" class="lead" hidden>No calculator matches that. <a href="https://mes.fm" target="_blank" rel="noopener">Try mes.fm</a></p>']
    for g, items in tiles.items():
        home.append('<h2 class="grp">%s</h2><div class="grid">%s</div>' % (g, "".join(items)))
    home.append("</section>")

    from PIL import Image
    Image.open(APP / "assets" / "icon.png").convert("RGB").resize((192, 192), Image.LANCZOS).save(WWW / "img" / "logo.png", optimize=True)

    css = base_css + "\n" + "\n".join(css_parts)
    (WWW / "index.html").write_text(page(css, "\n".join(home), "\n".join(panes), "\n".join(scripts)), encoding="utf-8")
    out = (WWW / "index.html").read_text(encoding="utf-8")
    bad = [p for p in ("googletagmanager", "adsbygoogle", "fastcomments", "googlesyndication", 'href="/', "data-src=") if p in out]
    ids = re.findall(r'\bid="([^"]+)"', out)
    dup = sorted({i for i in ids if ids.count(i) > 1})
    print("  index.html %d bytes, %d tools%s%s" % (len(out), len(TOOLS), ("  <-- CHECK: " + ", ".join(bad)) if bad else "", ("  <-- duplicate ids: " + ", ".join(dup)) if dup else ""))
    print("done -> %s" % WWW)


if __name__ == "__main__":
    main()
