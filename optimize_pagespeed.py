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

# main_js/main.js cache-buster bump so browsers pick up the new lazy-init code
MAINJS_RE = re.compile(r'(main_js/main\.js)(?:\?v=[0-9.]+)?(")')
MAINJS_VER = r"\1?v=1.0.2\2"


def transform_fastcomments(html):
    n = 0
    if FC_MARKER not in html:
        html, n = FC_OLD_RE.subn(FC_NEW, html, count=1)
    if n or FC_MARKER in html:
        html = MAINJS_RE.sub(MAINJS_VER, html)
    return html, n


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
        has_w = _attr(tag, "width")
        has_h = _attr(tag, "height")

        # 4. stamp intrinsic dimensions on local images that carry neither
        if src and has_w is None and has_h is None:
            p = _resolve_local(src, html_path)
            if p:
                d = _dims(p)
                if d:
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


# --- driver ----------------------------------------------------------------------

def process_file(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        original = f.read()

    html = original
    notes = []

    html, n = transform_fastcomments(html)
    if n:
        notes.append("fastcomments-lazy")

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
