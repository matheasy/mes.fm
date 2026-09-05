#!/usr/bin/env python3
"""
build-www.py — assemble percentagecalculator-app/www/ from the live site pages
at mes.fm/percentagecalculator/.

Idempotent: wipes and regenerates www/ (except vendor/, which is checked in)
each run. Re-run whenever the calculator, tutorial, or how-to page changes on
the site.

What it does per page (index / tutorial / how-to):
  * strips HTTrack mirror comments and <base>
  * removes Google Tag Manager, the deferred-AdSense loader, the auto-ads gap
    guard, the FastComments widget + Comments toggle, lazysizes, main.js,
    track.js  (ads come back later via the AdMob native SDK, not web AdSense)
  * de-lazyloads images  (data-src -> src, drop the .lazyload class)
  * rewrites links:
      /percentagecalculator            -> index.html
      /percentagecalculator/tutorial   -> tutorial.html
      /percentagecalculator/how-...    -> how-do-you-calculate-percentages.html
      /percentagecalculator/interesting-facts, /memes, /contact, /privacy-...,
      and every other absolute http(s) link  -> full https://mes.fm/... opened
      in the system browser (target="_blank")
  * drops the "iPhone App" / "Android App" nav items (we're already in the app)
  * swaps the script tail for local jquery + calculator.js + app-nav.js
"""

import re
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
REPO = APP.parent
SRC = REPO / "mes.fm" / "percentagecalculator"
WWW = APP / "www"
EXT = "https://mes.fm"

PAGES = ["index.html", "tutorial.html", "how-do-you-calculate-percentages.html"]

SCRIPT_TAIL = (
    '<script src="vendor/jquery.min.js"></script>\n'
    "<script>var MES_Vars={mobile:false,hide_search:true,current_tab:0};</script>\n"
    '<script src="js/calculator.js?v=2.2"></script>\n'
    '<script src="vendor/app-nav.js"></script>\n'
    '<script src="vendor/app-features.js"></script>\n'
    '<script>var _y=document.getElementById("copyright-year");'
    "if(_y)_y.textContent=new Date().getFullYear();</script>\n"
    "</body>"
)

ROOT_LINKS = ("contact", "privacy-policy", "calculators.html", "tools.html",
              "mobile-apps.html", "links", "donate.html")

# every real external link is already marked target="_blank" by the rules
# below, so one rule marks all of them as "leaves the app" -- except the
# icon-only social links, which have no visible text to attach it to.
HEAD_EXTRA = (
    "<style>a[target=\"_blank\"]:not(.social__link)"
    ":not(.info-bar__logo-container)::after"
    "{content:\"\\00a0\\2197\";font-size:0.75em;opacity:0.6;}</style>\n"
    '<link rel="stylesheet" href="vendor/app-features.css">\n'
    "</head>"
)


def strip_lazyload(cls: str) -> str:
    parts = [c for c in cls.split() if c != "lazyload"]
    return " ".join(parts)


def clean(html: str) -> str:
    # --- HTTrack cruft -------------------------------------------------------
    html = re.sub(r"<!-- Mirrored from .*?-->\s*", "", html, flags=re.S)
    html = re.sub(r"<!-- Added by HTTrack -->.*?<!-- /Added by HTTrack -->", "",
                  html, flags=re.S)
    html = re.sub(r"<base\b[^>]*>", "", html)
    html = re.sub(r'<link rel="canonical"[^>]*>', "", html)

    # the removed HTTrack block carried the only charset declaration; the app
    # WebView has no HTTP charset header, so without this it decodes UTF-8 as
    # latin-1 and mangles curly quotes / dashes in the page copy
    html = html.replace("<head>", '<head><meta charset="utf-8">', 1)

    # normalise single-quoted href/src/target attrs so the rules below (all
    # double-quote) catch the info-bar nav too
    html = re.sub(r"\bhref='([^']*)'", r'href="\1"', html)
    html = re.sub(r"\bsrc='([^']*)'", r'src="\1"', html)
    html = html.replace(" target='_blank'", ' target="_blank"')

    # --- ads / analytics / comments --------------------------------------
    # everything from the GTM comment to </head> is ad/analytics JS
    html = re.sub(r"<!-- Google Tag Manager -->.*?</head>", lambda m: HEAD_EXTRA,
                  html, count=1, flags=re.S)
    html = re.sub(r"<!-- Google Tag Manager \(noscript\) -->.*?"
                  r"<!-- End Google Tag Manager \(noscript\) -->", "",
                  html, flags=re.S)
    # Comments toggle button + FastComments box
    html = re.sub(r'<div id="comments-button"[^>]*>.*?</div>\s*'
                  r'(?=<div id="comments-box">)', "", html, flags=re.S)
    html = re.sub(r'<div id="comments-box">\s*'
                  r'<div id="fastcomments-widget"></div>\s*</div>', "",
                  html, flags=re.S)
    # inline AdSense units (tutorial / how-to carry manual <ins> slots)
    html = re.sub(r'<ins class="adsbygoogle".*?</ins>', "", html, flags=re.S)
    html = re.sub(r"<script>\s*\(adsbygoogle = window\.adsbygoogle \|\| \[\]\)"
                  r"\.push\(\{\}\);\s*</script>", "", html, flags=re.S)
    html = re.sub(r"<script[^>]*googlesyndication[^>]*>\s*</script>", "", html)
    html = re.sub(r"<!-- PC \([^)]*\)[^>]*-->", "", html)

    # --- nav: drop the store-link items ------------------------------------
    html = re.sub(r'<li class="navbar__item"><a target="_blank" '
                  r'class="navbar__link" href="https://itunes\.apple\.com[^"]*">'
                  r'iPhone App</a></li>', "", html)
    html = re.sub(r'<li class="navbar__item"><a target="_blank" '
                  r'class="navbar__link" href="https://play\.google\.com[^"]*">'
                  r'Android App</a></li>', "", html)

    # --- images: de-lazyload -------------------------------------------------
    html = html.replace(" data-src=", " src=")
    # a couple of source pages have a malformed attr: src=https://...png"
    html = re.sub(r'src=(https://mes\.fm/main_img/mes-logo-small\.png)"',
                  r'src="\1"', html)
    html = re.sub(r'class="([^"]*)"',
                  lambda m: 'class="%s"' % strip_lazyload(m.group(1)), html)

    # --- links ------------------------------------------------------------
    html = html.replace(' target="_self"', "").replace(" target='_self'", "")

    html = html.replace('href="/percentagecalculator/interesting-facts"',
                        'href="%s/percentagecalculator/interesting-facts"'
                        ' target="_blank" rel="noopener"' % EXT)
    html = html.replace('href="/percentagecalculator/memes"',
                        'href="%s/percentagecalculator/memes"'
                        ' target="_blank" rel="noopener"' % EXT)
    html = html.replace('href="/percentagecalculator/tutorial"',
                        'href="tutorial.html"')
    html = html.replace('href="/percentagecalculator/how-do-you-calculate-'
                        'percentages"',
                        'href="how-do-you-calculate-percentages.html"')
    html = re.sub(r"href=(['\"])/percentagecalculator/?\1",
                  r'href="index.html"', html)

    # remaining page-local asset refs
    html = html.replace('"/percentagecalculator/', '"')
    html = html.replace("'/percentagecalculator/", "'")
    html = html.replace("https://mes.fm/main_img/mes-logo-small.png",
                        "img/mes-logo-small.png")

    # mes.fm root pages -> full external URL, open in browser
    html = re.sub(r'href="/(%s)"' % "|".join(re.escape(x) for x in ROOT_LINKS),
                  r'href="%s/\1" target="_blank" rel="noopener"' % EXT, html)

    # every other absolute http(s) link that has no target -> new browser tab
    html = re.sub(r'<a (?![^>]*\btarget=)([^>]*href="https?://[^"]+")',
                  r'<a target="_blank" rel="noopener" \1', html)

    # --- top nav bar: internal links only -------------------------------
    # keep Home / Tutorial / Percentages How-To; drop every info-bar item
    # that now leaves the app (they stay reachable from the hamburger menu)
    html = re.sub(r'<li class="info-bar__item"><a [^>]*\btarget="_blank"[^>]*>'
                  r'[^<]*</a></li>\s*', "", html)
    # the responsive CSS hides the info-bar "Home" item on mobile (the site
    # logo links home on the web) -- the path rewrite above turned its
    # selector into a[href="index.html"]; the app wants Home visible, so drop
    # just that clause from the hide rule
    html = re.sub(r'#info-bar > \.info-bar__item:has\(a\[href="index\.html"\]\),'
                  r'\s*', "", html)

    # --- script tail ------------------------------------------------------
    html = re.sub(r'<script src="https://ajax\.googleapis\.com/ajax/libs/'
                  r"jquery.*?</body>", SCRIPT_TAIL, html, flags=re.S)

    return html


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit("source not found: %s" % SRC)

    # reset www/ but keep the checked-in vendor/ dir
    for child in WWW.iterdir():
        if child.name == "vendor":
            continue
        shutil.rmtree(child) if child.is_dir() else child.unlink()

    (WWW / "js").mkdir(exist_ok=True)
    shutil.copy(SRC / "js" / "calculator6da2.js", WWW / "js" / "calculator.js")
    (WWW / "img").mkdir(exist_ok=True)
    # mes.fm "Math Easy Solutions" header badge — checked in under vendor/
    shutil.copy(WWW / "vendor" / "mes-logo-small.png",
                WWW / "img" / "mes-logo-small.png")

    pages = {}
    for name in PAGES:
        out = clean((SRC / name).read_text(encoding="utf-8"))
        (WWW / name).write_text(out, encoding="utf-8")
        pages[name] = out

    # copy only the images the three bundled pages actually reference
    wanted = {"faviconc619.ico"}
    for out in pages.values():
        wanted.update(re.findall(r'(?:src|href)="img/([^"?]+)', out))
    for rel in sorted(wanted):
        src_img = SRC / "img" / rel
        if src_img.exists():
            dst = WWW / "img" / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src_img, dst)
        elif rel != "mes-logo-small.png":
            print("  missing image: img/%s" % rel)

    for name, out in pages.items():

        leftovers = []
        for probe in ("googletagmanager", "adsbygoogle", "fastcomments",
                      '"/percentagecalculator/', "'/percentagecalculator/",
                      " data-src=", "main_js/", "googlesyndication"):
            if probe in out:
                leftovers.append("%s x%d" % (probe, out.count(probe)))
        flag = "  <-- CHECK: " + ", ".join(leftovers) if leftovers else ""
        print("  %-42s %6d bytes%s" % (name, len(out), flag))

    print("done -> %s" % WWW)


if __name__ == "__main__":
    main()
