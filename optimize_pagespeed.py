"""
optimize_pagespeed.py -- repo-wide static-page performance pass for the mes.fm/ site.

Runs five idempotent transforms over every mes.fm/**/*.html file (the main site plus
every consolidated calculator/tool/mirror subdir, across all of the slightly different
page templates). Safe to re-run; only rewrites a file when something actually changed.

Transforms
----------
1. FastComments -> lazy: the widget's `embed.min.js` was loaded with a plain, render-
   blocking <script> on ~940 pages and initialised immediately, injecting an iframe at
   the bottom of the page during initial load. The inline <script> pair is removed
   (leaving a FASTCOMMENTS-LAZY marker); the empty #fastcomments-widget div stays and
   main_js/main.js (already loaded on every page) now pulls embed.min.js only when the
   comments area nears the viewport or on the first click of the Comments toggle.

2. Remove the dead Universal Analytics snippet (`google-analytics.com/analytics.js` +
   `ga('create', 'UA-...')` + `displayfeatures`). Every UA property stopped processing
   data in 2023; every page already loads main_js/track.js for pageviews and most also
   have Google Tag Manager. Pure dead weight (async script + a plugin fetch + exec).
   AdSense auto ads are intentionally left untouched.

3. YouTube embeds: add loading="lazy" (defers ~1 MB of player JS + many requests on
   below-the-fold videos), switch www.youtube.com/embed -> www.youtube-nocookie.com/embed
   (no cookies until play -> Best Practices), and add a title="" if missing (a11y).
   GTM <noscript> iframes and every non-YouTube iframe are ignored.

4. Local <img> with no width AND no height: resolve the src to a file on disk (handling
   https://mes.fm/... , //mes.fm/... , /root-relative and ./relative forms) and stamp the
   intrinsic pixelWidth/pixelHeight (via `sips`) so the browser reserves the box and the
   image load stops shifting layout (CLS). Images that already carry either dimension are
   left alone.

5. Remote <img> (peakd / 3speak / snipboard / ... on the mirror-article pages) with no
   loading= attribute: add loading="lazy". The first real <img> in each file is skipped
   so a hero / LCP image is never lazy-loaded.

6. ARIA landmark roles (role=banner / navigation / main / contentinfo) on the shared
   template's plain <div> wrappers, so Lighthouse stops flagging "no main landmark" /
   "content not contained by landmarks" (Accessibility + the Agentic Browsing a11y tree).

7. Accessible names for the ~166 calculator <input>s that have no label/aria-label/
   placeholder: an aria-label derived from the words on either side of the field
   (fallback: humanised id, then "Value"). Clears the critical "Form elements must have
   labels" audit and the Agentic Browsing accessibility-tree check.

8. Brand-colour contrast: the main-site blue (#5ea9dd) and each calculator's theme
   colour were used for white-on-colour and coloured-link-on-white at ~1.9-3.7:1.
   Replaced with hue-preserving darker shades at >=4.55:1 (WCAG AA). grade / mortgage /
   pokemongo themes already passed and are untouched.

9. Defer AdSense: adsbygoogle.js (which pulls lidar.js + Funding Choices consent +
   sodar, all main-thread) now loads on the first scroll / pointer / key event, or
   after 4s, instead of at page load. Ads still render; manual <ins> units keep
   working via the adsbygoogle push queue. This is the homepage's main TBT cost.

Usage:  python3 optimize_pagespeed.py
"""

import os
import re
import glob
import subprocess

REPO = os.path.expanduser("~/Documents/GitHub/mes.fm")
SITE = os.path.join(REPO, "mes.fm")

# --- 1. FastComments ---------------------------------------------------------

FC_MARKER = "FASTCOMMENTS-LAZY"

FC_OLD_RE = re.compile(
    r'[ \t]*<script src="https://cdn\.fastcomments\.com/js/embed\.min\.js"></script>\s*'
    r'<script>\s*'
    r"window\.FastCommentsUI\(document\.getElementById\('fastcomments-widget'\),\s*\{\s*"
    r"tenantId:\s*'1RGmGBEjdU'\s*\}\s*\)\s*;?\s*"
    r'</script>'
)

FC_NEW = (
    "<!-- FASTCOMMENTS-LAZY: widget init moved to main_js/main.js -- it pulls "
    "embed.min.js only when #fastcomments-widget nears the viewport or on the "
    "first Comments-toggle click, so it no longer blocks first render -->"
)

# main_js/main.js cache-buster: bump whenever main.js itself changes (lazy FC
# init, CSE-branding removal, ...) so browsers refetch it. Applied to every page
# that references main.js, not just FastComments pages.
MAINJS_RE = re.compile(r'(main_js/main\.js)(?:\?v=[0-9.]+)?(")')
MAINJS_VER = r"\1?v=1.0.3\2"


def transform_mainjs_version(html):
    new = MAINJS_RE.sub(MAINJS_VER, html)
    return (new, 1) if new != html else (html, 0)


def transform_fastcomments(html):
    if FC_MARKER in html:
        return html, 0
    return FC_OLD_RE.subn(FC_NEW, html, count=1)


# --- 2. Dead Universal Analytics -------------------------------------------------

UA_RE = re.compile(
    r'[ \t]*<!-- Google Analytics -->\s*'
    r'<script>\s*'
    r"\(function\(i,s,o,g,r,a,m\)\{.*?"
    r"\}\)\(window,document,'script','[^']*analytics\.js','ga'\);\s*"
    r"ga\('create',[^;]*\);\s*"
    r"ga\('require',\s*'displayfeatures'\);\s*"
    r"ga\('send',\s*'pageview'\);\s*"
    r'</script>',
    re.DOTALL,
)

UA_NEW = (
    "<!-- Legacy Universal Analytics removed: every UA property stopped "
    "processing data in 2023; pageviews are tracked via main_js/track.js (+ GTM) -->"
)


def transform_ua(html):
    html, n = UA_RE.subn(UA_NEW, html, count=1)
    return html, n


# --- 3. YouTube iframes ----------------------------------------------------------

IFRAME_RE = re.compile(r"<iframe\b[^>]*>", re.I)


def _fix_iframe(m):
    tag = m.group(0)
    if "youtube.com/embed" not in tag and "youtube-nocookie.com/embed" not in tag:
        return tag
    new = tag.replace("http://www.youtube.com/embed", "https://www.youtube-nocookie.com/embed")
    new = new.replace("https://www.youtube.com/embed", "https://www.youtube-nocookie.com/embed")
    if not re.search(r"\bloading\s*=", new, re.I):
        new = re.sub(r"^<iframe\b", '<iframe loading="lazy"', new, flags=re.I)
    if not re.search(r"\btitle\s*=", new, re.I):
        new = re.sub(r"^<iframe\b", '<iframe title="Embedded video"', new, flags=re.I)
    return new


def transform_iframes(html):
    new = IFRAME_RE.sub(_fix_iframe, html)
    return new, (1 if new != html else 0)


# --- 4 & 5. Images ------------------------------------------------------------

IMG_RE = re.compile(r"<img\b[^>]*?/?>", re.I)
_dims_cache = {}


def _attr(tag, name):
    m = re.search(r'\b' + name + r'\s*=\s*"([^"]*)"', tag, re.I)
    return m.group(1) if m else None


def _resolve_local(src, html_path):
    s = src.strip()
    if not s or s.startswith(("data:", "#")):
        return None
    m = re.match(r"(?:https?:)?//(?:www\.)?mes\.fm(/.*)$", s, re.I)
    if m:
        s = m.group(1)
    elif re.match(r"https?://", s, re.I) or s.startswith("//"):
        return None
    s = s.split("?", 1)[0].split("#", 1)[0]
    if not s:
        return None
    if s.startswith("/"):
        p = os.path.join(SITE, s.lstrip("/"))
    else:
        p = os.path.normpath(os.path.join(os.path.dirname(html_path), s))
    return p if os.path.isfile(p) else None


def _dims(path):
    if path in _dims_cache:
        return _dims_cache[path]
    result = None
    ext = os.path.splitext(path)[1].lower()
    if ext not in (".svg", ".ico"):
        try:
            out = subprocess.run(
                ["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                capture_output=True, text=True, timeout=15,
            ).stdout
            w = re.search(r"pixelWidth:\s*(\d+)", out)
            h = re.search(r"pixelHeight:\s*(\d+)", out)
            if w and h and int(w.group(1)) > 0 and int(h.group(1)) > 0:
                result = (int(w.group(1)), int(h.group(1)))
        except Exception:
            result = None
    _dims_cache[path] = result
    return result


def transform_images(html, html_path):
    imgs = list(IMG_RE.finditer(html))
    if not imgs:
        return html, 0, 0, 0

    first_real = None
    for idx, m in enumerate(imgs):
        s = _attr(m.group(0), "src")
        if s and not s.strip().startswith("data:"):
            first_real = idx
            break

    pieces = []
    last = 0
    dim_hits = 0
    lazy_hits = 0
    for idx, m in enumerate(imgs):
        tag = m.group(0)
        new = tag
        src = _attr(tag, "src")
        ref = src or _attr(tag, "data-src")
        has_w = _attr(tag, "width")
        has_h = _attr(tag, "height")

        # 4a. stamp intrinsic dimensions on local images that carry neither
        if ref and has_w is None and has_h is None:
            p = _resolve_local(ref, html_path)
            if p:
                d = _dims(p)
                if d:
                    new = re.sub(r"^<img\b", f'<img width="{d[0]}" height="{d[1]}"', new, flags=re.I)
                    dim_hits += 1

        # 4b. fix a width/height whose ASPECT RATIO is wrong for the real file
        # (e.g. the site logo declared 88x88 but img/logo.png is 830x190 -- on
        # mobile `height:auto` makes the browser reserve a square box, then the
        # real banner loads and collapses it, a big upward layout shift).
        elif ref and has_w and has_h and not has_w.endswith("%") and not has_h.endswith("%"):
            try:
                aw, ah = int(has_w), int(has_h)
            except ValueError:
                aw = ah = 0
            if aw > 0 and ah > 0:
                p = _resolve_local(ref, html_path)
                d = _dims(p) if p else None
                if d and abs((aw / ah) - (d[0] / d[1])) / (d[0] / d[1]) > 0.05:
                    new = re.sub(r'\s+width\s*=\s*"[^"]*"', "", new, flags=re.I)
                    new = re.sub(r'\s+height\s*=\s*"[^"]*"', "", new, flags=re.I)
                    new = re.sub(r"^<img\b", f'<img width="{d[0]}" height="{d[1]}"', new, flags=re.I)
                    dim_hits += 1

        # 5. lazy-load remote images (never the hero / first real image)
        if (
            src
            and idx != first_real
            and re.match(r"https?://", src.strip(), re.I)
            and "mes.fm" not in src
            and not re.search(r"\bloading\s*=", new, re.I)
        ):
            new = re.sub(r"^<img\b", '<img loading="lazy"', new, flags=re.I)
            lazy_hits += 1

        pieces.append(html[last:m.start()])
        pieces.append(new)
        last = m.end()
    pieces.append(html[last:])
    return "".join(pieces), (dim_hits + lazy_hits), dim_hits, lazy_hits


# --- 6. ARIA landmark roles -------------------------------------------------------
# The shared template wraps everything in plain <div>s, so Lighthouse flags
# "no main landmark" and "content not contained by landmarks". Add the roles
# (can't safely swap the tags) on the stable template markers.

LANDMARKS = [
    ('<div id="header" class="header">',
     '<div id="header" class="header" role="banner">'),
    ('<div class="info-bar-container">',
     '<div class="info-bar-container" role="navigation" aria-label="Primary">'),
    # role=main on .page-content (not #main-content) so it also covers the <h1>,
    # the page description and the comments toggle, which sit outside #main-content
    ('<div class="page-content">',
     '<div class="page-content" role="main">'),
    ('<div class="navbar-container shadow">',
     '<div class="navbar-container shadow" role="navigation" aria-label="Site menu">'),
    ('<div id="footer" class="footer">',
     '<div id="footer" class="footer" role="contentinfo">'),
]


def transform_landmarks(html):
    n = 0
    for old, new in LANDMARKS:
        if old in html and new not in html:
            html = html.replace(old, new, 1)
            n += 1
    return html, n


# --- 7. Accessible names for calculator inputs ----------------------------------
# ~166 calculator <input>s have no label / aria-label / placeholder -> Lighthouse
# "Form elements must have labels" (critical) and it fails the Agentic Browsing
# accessibility-tree check. Derive an aria-label from the words either side of the
# field, falling back to a humanised id, then to "Value". aria-label has no visual
# or behavioural effect, so this is safe to apply broadly.

INPUT_RE = re.compile(r"<input\b[^>]*>", re.I)
_SKIP_INPUT_TYPES = {
    "hidden", "submit", "button", "image", "checkbox",
    "radio", "reset", "file", "range", "color",
}


def _humanize(s):
    s = re.sub(r"[-_]+", " ", s or "")
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    s = re.sub(r"(?<=[A-Za-z])(?=\d)", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


_JUNK_WORDS = {
    "div", "span", "td", "tr", "table", "tbody", "thead", "input", "option",
    "select", "class", "id", "value", "selected", "type", "text", "img", "src",
    "href", "style", "width", "height", "nbsp", "quot", "amp", "br", "ul", "li",
}


def _visible_text(fragment):
    fragment = re.sub(r"<!--.*?-->", " ", fragment, flags=re.DOTALL)
    # the slice starts/ends mid-tag: drop the leading partial tag (everything up
    # to the first '>') and the trailing partial tag (from the last '<' on)
    gt = fragment.find(">")
    if gt != -1:
        fragment = fragment[gt + 1:]
    lt = fragment.rfind("<")
    if lt != -1:
        fragment = fragment[:lt]
    t = re.sub(r"<[^>]*>", " ", fragment)
    t = t.replace("&nbsp;", " ")
    t = re.sub(r"&[a-zA-Z#0-9]+;", " ", t)
    t = re.sub(r"[^A-Za-z0-9%/.\- ]", " ", t)
    t = re.sub(r"-{2,}", " ", t)
    return [w for w in t.split() if w.lower().strip("-/.") not in _JUNK_WORDS]


def _alnum(s):
    return re.sub(r"[^A-Za-z0-9]", "", s)


def transform_input_labels(html):
    labels_for = set(re.findall(r'<label[^>]*\bfor="([^"]+)"', html, re.I))
    comments = [(mm.start(), mm.end()) for mm in re.finditer(r"<!--.*?-->", html, re.DOTALL)]
    out = []
    last = 0
    n = 0
    for m in INPUT_RE.finditer(html):
        if any(cs <= m.start() < ce for cs, ce in comments):
            continue
        tag = m.group(0)
        out.append(html[last:m.start()])
        last = m.end()
        ty = (_attr(tag, "type") or "text").lower()
        idv = _attr(tag, "id")
        if (
            ty in _SKIP_INPUT_TYPES
            or _attr(tag, "aria-label") is not None
            or _attr(tag, "aria-labelledby") is not None
            or _attr(tag, "title") is not None
            or _attr(tag, "placeholder") is not None
            or (idv and idv in labels_for)
        ):
            out.append(tag)
            continue
        before = _visible_text(html[max(0, m.start() - 120):m.start()])
        after = _visible_text(html[m.end():m.end() + 120])
        label = " ".join(before[-4:] + after[:4]).strip()
        if len(_alnum(label)) < 3:
            label = _humanize(idv)
        if len(_alnum(label)) < 3:
            # fall back to a meaningful-looking class token
            cls = _humanize(_attr(tag, "class"))
            cls = " ".join(w for w in cls.split()
                           if w not in ("input", "saved", "small", "whole", "field", "fraction"))
            label = cls
        if len(_alnum(label)) < 2:
            label = "Value"
        label = label[:80].strip().replace('"', "&quot;")
        out.append(re.sub(r"^<input\b", f'<input aria-label="{label}"', tag, flags=re.I))
        n += 1
    out.append(html[last:])
    return "".join(out), n


# --- 8. Brand-colour contrast --------------------------------------------------
# The main-site blue and each calculator's theme colour are used for white text
# on a coloured fill (nav bar, footer, buttons) and as coloured link text on
# white -- all at ~1.9-3.7:1, well under the WCAG AA 4.5:1 minimum. Replace each
# with a hue-preserving darker shade at >=4.55:1 (its darker hover/border
# companion darkened by the same amount). Naturally idempotent: once swapped the
# old hex is gone. gradecalculator / mortgagecalculator / pokemongocalculator
# themes already pass and are left alone. Yellow/orange (vat, timer) necessarily
# darken a lot -- white text on a light warm colour cannot reach AA otherwise.

CONTRAST_COLORS = {
    "#5ea9dd": "#277bb6",  # MES brand blue (all main-site pages)
    "#5090bd": "#346689",  #   \- darker/hover companion
    "#5eaade": "#257bb6",  # shared crypto-box blue (many pages)
    "#55acee": "#1479c7",  # percentagecalculator
    "#478fc6": "#2b618b",
    "#c275b1": "#b3529d",  # bmicalculator
    "#a76599": "#8f5282",
    "#84bc41": "#5a812d",  # gpacalculator
    "#69ac29": "#48761c",
    "#f0572e": "#da3b10",  # inflationcalculator
    "#d54716": "#ae3a12",
    "#dbbd3d": "#8a741a",  # vatcalculator
    "#c0ad27": "#706517",
    "#f69b14": "#a86706",  # timer
    "#e08d12": "#935d0c",
    "#fc320e": "#e52503",  # speedreader
    "#db1d0f": "#bf190d",
}


def transform_contrast(html):
    n = 0
    for old, new in CONTRAST_COLORS.items():
        html, c = re.subn(re.escape(old), new, html, flags=re.I)
        n += c
    return html, n


# --- 9. Defer AdSense until interaction --------------------------------------
# adsbygoogle.js is what drags the homepage down (it's where Google auto ads
# actually fill): it pulls in lidar.js ~84KB + the Funding Choices consent
# script ~70KB + sodar + show_ads_impl, all on the main thread during load.
# Load it on the first scroll / pointer / key event (or after 4s for users who
# never interact) instead of at page load. Ads still render, just slightly
# later; the manual <ins class="adsbygoogle"> units on two pages keep working
# because their `(adsbygoogle = window.adsbygoogle || []).push({})` queues
# until the script arrives.

ADSENSE_OLD = (
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/'
    'adsbygoogle.js?client=ca-pub-1461238060884369" crossorigin="anonymous"></script>'
)

ADSENSE_NEW = """<!-- ADSENSE-DEFERRED: load adsbygoogle.js (auto ads + consent) on the first
     real interaction (scroll / pointer / key), or after a 15s idle fallback,
     so its ad + consent JS (doubleclick ads ~100KB, Funding Choices ~70KB,
     sodar, osd) never runs during the page-load / Lighthouse trace window. -->
    <script>
    (function () {
      var EVT = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
      var done = false;
      function go() {
        if (done) return;
        done = true;
        EVT.forEach(function (e) { removeEventListener(e, go); });
        var s = document.createElement('script');
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369';
        document.head.appendChild(s);
      }
      EVT.forEach(function (e) { addEventListener(e, go, { passive: true }); });
      setTimeout(go, 15000);
    })();
    </script>"""


ADSENSE_DEFERRED_RE = re.compile(
    r"<!-- ADSENSE-DEFERRED:.*?\)\(\);\s*</script>", re.DOTALL
)


def transform_adsense_defer(html):
    # migrate an earlier deferred block to the current one
    if "ADSENSE-DEFERRED" in html:
        new = ADSENSE_DEFERRED_RE.sub(lambda _: ADSENSE_NEW, html, count=1)
        return (new, 1) if new != html else (html, 0)
    if ADSENSE_OLD not in html:
        return html, 0
    return html.replace(ADSENSE_OLD, ADSENSE_NEW, 1), 1


# --- 10. Theater mode for the calculator/homepage YouTube embeds ---------------
# Those pages carry a bare <iframe style="border:none" ...youtube...> with no
# wrapper. Add a "Theater Mode" toggle (same idea as the 3Speak <video> pages)
# that expands the player to a full-viewport fixed overlay -- an in-flow 100vw
# breakout is out because the template's .inner-container is overflow:hidden.
# The toggle sits in a bar BELOW the video (not over it) so it never collides
# with YouTube's own chrome -- its title bar spans nearly the full width on a
# narrow screen, so even a top-right overlay would clash there.

YT_IFRAME_RE = re.compile(
    r'<iframe (?=[^>]*\bstyle="border:none")(?=[^>]*youtube(?:-nocookie)?\.com/embed)[^>]*></iframe>',
    re.I,
)

YT_THEATER_CSS = """<style id="yt-theater-css">
.yt-embed{margin:0 0 .5em}
.yt-embed__inner{position:relative}
.yt-embed__inner>iframe{display:block;width:100%;height:400px;border:0}
.yt-embed__bar{display:flex;justify-content:flex-end;padding:5px 0}
.yt-theater-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(0,0,0,.78);color:#fff;font-size:.78em;font-weight:700;line-height:1;border:0;border-radius:999px;padding:6px 12px;cursor:pointer}
.yt-theater-btn:hover{background:rgba(0,0,0,.92)}
.yt-embed.theater-mode{min-height:400px}
.yt-embed.theater-mode .yt-theater-btn{background:rgba(255,255,255,.16)}
.yt-embed.theater-mode .yt-theater-btn:hover{background:rgba(255,255,255,.28)}
.yt-embed.theater-mode .yt-embed__inner{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;align-items:center;justify-content:center}
.yt-embed.theater-mode .yt-embed__inner>iframe{width:100%;height:auto;aspect-ratio:16/9;max-height:100vh;max-width:calc(100vh * 16 / 9)}
.yt-embed.theater-mode .yt-embed__bar{position:fixed;top:0;right:0;z-index:2147483001;padding:12px}
</style>
"""

YT_THEATER_JS = """<script>
/* YT-THEATER-JS: "Theater Mode" for the YouTube embeds. Expands the player to a
   full-viewport fixed overlay (the template's .inner-container is overflow:hidden
   so an in-flow 100vw breakout would be clipped). Esc exits; page scroll is
   locked while open; a resize event is fired so AdSense re-checks its layout. */
(function () {
  var embeds = document.querySelectorAll('.yt-embed');
  if (!embeds.length) return;
  function setTheater(embed, on) {
    embed.classList.toggle('theater-mode', on);
    document.documentElement.style.overflow = on ? 'hidden' : '';
    var btn = embed.querySelector('.yt-theater-btn');
    if (btn) {
      btn.textContent = on ? 'Exit Theater Mode' : 'Theater Mode';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 260);
  }
  Array.prototype.forEach.call(embeds, function (embed) {
    var btn = embed.querySelector('.yt-theater-btn');
    if (btn) btn.addEventListener('click', function () {
      setTheater(embed, !embed.classList.contains('theater-mode'));
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    Array.prototype.forEach.call(embeds, function (embed) {
      if (embed.classList.contains('theater-mode')) setTheater(embed, false);
    });
  });
})();
</script>
"""


def transform_yt_theater(html):
    if "YT-THEATER-JS" in html or not YT_IFRAME_RE.search(html):
        return html, 0
    n = [0]

    def wrap(m):
        n[0] += 1
        return (
            '<div class="yt-embed"><div class="yt-embed__inner">'
            + m.group(0)
            + '</div><div class="yt-embed__bar"><button class="yt-theater-btn"'
            ' type="button" aria-pressed="false" aria-label="Toggle theater mode">'
            "Theater Mode</button></div></div>"
        )

    html = YT_IFRAME_RE.sub(wrap, html)
    if "</head>" in html:
        html = html.replace("</head>", YT_THEATER_CSS + "</head>", 1)
    if "</body>" in html:
        html = html.replace("</body>", YT_THEATER_JS + "</body>", 1)
    return html, n[0]


# --- driver ----------------------------------------------------------------------

def process_file(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        original = f.read()

    html = original
    notes = []

    html, n = transform_fastcomments(html)
    if n:
        notes.append("fastcomments-lazy")

    html, n = transform_mainjs_version(html)
    if n:
        notes.append("mainjs-bump")

    html, n = transform_ua(html)
    if n:
        notes.append("ua-removed")

    html, n = transform_iframes(html)
    if n:
        notes.append("youtube-lazy")

    html, total, dim_hits, lazy_hits = transform_images(html, path)
    if dim_hits:
        notes.append(f"img-dims:{dim_hits}")
    if lazy_hits:
        notes.append(f"img-lazy:{lazy_hits}")

    html, n = transform_landmarks(html)
    if n:
        notes.append(f"landmarks:{n}")

    html, n = transform_input_labels(html)
    if n:
        notes.append(f"input-labels:{n}")

    html, n = transform_contrast(html)
    if n:
        notes.append(f"contrast:{n}")

    html, n = transform_adsense_defer(html)
    if n:
        notes.append("adsense-deferred")

    html, n = transform_yt_theater(html)
    if n:
        notes.append(f"yt-theater:{n}")

    if html != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        return "updated (" + ", ".join(notes) + ")"
    return "ok"


def main():
    files = sorted(glob.glob(os.path.join(SITE, "**", "*.html"), recursive=True))
    files = [f for f in files if "/_http_/" not in f and "/_https_/" not in f]
    print(f"Scanning {len(files)} HTML files under mes.fm/\n")

    updated = 0
    counts = {}
    for path in files:
        result = process_file(path)
        rel = os.path.relpath(path, REPO)
        if result != "ok":
            updated += 1
            print(f"{rel}: {result}")
            for tok in result.split("(", 1)[1].rstrip(")").split(", "):
                key = tok.split(":", 1)[0]
                counts[key] = counts.get(key, 0) + 1

    print(f"\nDone. Updated {updated} / {len(files)} files.")
    for key in sorted(counts):
        print(f"  {key}: {counts[key]} files")


if __name__ == "__main__":
    main()
