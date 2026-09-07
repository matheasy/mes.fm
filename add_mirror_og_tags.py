#!/usr/bin/env python3
"""
Stamp Open Graph + Twitter Card meta tags onto the standalone "mirror" pages
(the ones built from the shared image-post / video-page templates -- theme
toggle, .page-subtitle "mirrored from the Hive blockchain", lightbox, etc.).

Without og:*/twitter:* tags X, Facebook, Telegram, Discord, ... render a bare
text link with no thumbnail. This derives the tags from what each page already
declares:

  og:url / og:title / og:description  <- <link rel="canonical">, <title>, <meta name="description">
  og:image                            <- first real <img> inside <article>, else a <video poster="">,
                                         resolved to an absolute https://mes.fm/... URL

The injected block is wrapped in <!-- OG-TAGS:START --> / <!-- OG-TAGS:END -->
and REGENERATED on every run (any pre-existing og:/twitter: meta lines in the
head are stripped first), so it is safe to re-run after creating a new mirror
page -- same idea as optimize_pagespeed.py.

build.mjs-generated pages (911, hutchison, vector-functions-problems-plus, ...)
are skipped here; their tags live in the build.mjs head template instead.

Run:  python3 add_mirror_og_tags.py
"""

import glob
import os
import re
import subprocess

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")
SITE = os.path.join(ROOT, "mes.fm")
SITE_ORIGIN = "https://mes.fm"

START = "<!-- OG-TAGS:START -->"
END = "<!-- OG-TAGS:END -->"

# Pages whose best share image isn't the one the heuristic below would pick
# (first <video poster>, else first real <article> <img>). Keyed by page slug
# (the directory name), value is an absolute https://mes.fm/... image URL.
OG_IMAGE_OVERRIDES = {
    "andrew-mason-clown": SITE_ORIGIN + "/andrew-mason-clown/img/andrew-mason-4.jpg",
    # two screenshots; the Alex Jones "grab your XRP" post is the on-topic one,
    # not the plain CoinMarketCap phone notification
    "alex-jones-xrp-bitcoin": SITE_ORIGIN + "/alex-jones-xrp-bitcoin/img/crypto-news-1-10Sz8k.jpg",
}

_dims_cache = {}


def _img_dims(path):
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


def esc_attr(s):
    """Escape a plain-text string for use inside a double-quoted attribute,
    leaving existing &entities; intact."""
    s = re.sub(r"&(?!#?\w+;)", "&amp;", s)
    return s.replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;").strip()


def is_mirror_page(html, path):
    if os.path.exists(os.path.join(os.path.dirname(path), "build.mjs")):
        return False
    return (
        'class="page-subtitle"' in html
        and "mirrored from" in html.lower()
        and '<link rel="canonical"' in html
    )


def pick_title(html):
    m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    if not m:
        return None
    t = re.sub(r"\s+", " ", m.group(1)).strip()
    # drop a trailing " | Site Name" / " – Site Name" branding segment
    t = re.split(r"\s+[|]\s+", t)[0].strip()
    return t or None


def pick_description(html):
    m = re.search(
        r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']\s*/?>',
        html, re.S | re.I,
    )
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else None


def pick_canonical(html):
    m = re.search(
        r'<link\s+rel=["\']canonical["\']\s+href=["\'](.*?)["\']\s*/?>',
        html, re.I,
    )
    return m.group(1).strip() if m else None


def resolve_url(src, page_url):
    src = src.strip()
    if src.startswith(("http://", "https://")):
        return src
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("/"):
        return SITE_ORIGIN + src
    # relative to the page's directory
    base = page_url.rstrip("/")
    return base + "/" + src


def pick_image(html, page_url, path):
    slug = os.path.basename(os.path.dirname(path))
    if slug in OG_IMAGE_OVERRIDES:
        return OG_IMAGE_OVERRIDES[slug]

    article = re.search(r"<article\b[^>]*>(.*?)</article>", html, re.S | re.I)
    scope = article.group(1) if article else html

    # Prefer a <video poster=""> -- it's a deliberate thumbnail, whereas the
    # first <img> on a video page is usually an incidental in-body figure.
    p = re.search(r'<video\b[^>]*\bposter=(["\'])(.*?)\1', scope, re.I)
    if p and p.group(2).strip():
        return resolve_url(p.group(2).strip(), page_url)

    for m in re.finditer(r"<img\b[^>]*>", scope, re.I):
        s = re.search(r'\bsrc=["\'](.*?)["\']', m.group(0), re.I)
        if not s:
            continue
        val = s.group(1).strip()
        if not val or val.startswith("data:"):
            continue
        return resolve_url(val, page_url)
    return None


def local_path_for(image_url):
    if not image_url.startswith(SITE_ORIGIN + "/"):
        return None
    rel = image_url[len(SITE_ORIGIN) + 1:]
    p = os.path.join(SITE, rel)
    return p if os.path.isfile(p) else None


def build_block(title, description, url, image):
    lines = [
        "  " + START,
        '  <meta property="og:type" content="article">',
        '  <meta property="og:site_name" content="MES Truth">',
        f'  <meta property="og:url" content="{esc_attr(url)}">',
        f'  <meta property="og:title" content="{esc_attr(title)}">',
    ]
    if description:
        lines.append(f'  <meta property="og:description" content="{esc_attr(description)}">')
    if image:
        lines.append(f'  <meta property="og:image" content="{esc_attr(image)}">')
        lp = local_path_for(image)
        if lp:
            d = _img_dims(lp)
            if d:
                lines.append(f'  <meta property="og:image:width" content="{d[0]}">')
                lines.append(f'  <meta property="og:image:height" content="{d[1]}">')
    lines.append('  <meta name="twitter:card" content="summary_large_image">')
    lines.append('  <meta name="twitter:site" content="@MathEasySolns">')
    lines.append(f'  <meta name="twitter:title" content="{esc_attr(title)}">')
    if description:
        lines.append(f'  <meta name="twitter:description" content="{esc_attr(description)}">')
    if image:
        lines.append(f'  <meta name="twitter:image" content="{esc_attr(image)}">')
    lines.append("  " + END)
    return "\n".join(lines)


def strip_existing(html):
    # remove a previous marked block (including its own leading indent + the
    # trailing newline, so re-runs don't drift the following line's indentation)
    html = re.sub(
        r"[ \t]*" + re.escape(START) + r".*?" + re.escape(END) + r"\n?",
        "", html, flags=re.S,
    )
    # remove stray unmarked og:/twitter: meta lines + the explainer comment
    html = re.sub(
        r"^[ \t]*<meta\s+(?:property=[\"']og:[^>]*|name=[\"']twitter:[^>]*)>\n",
        "", html, flags=re.M | re.I,
    )
    html = re.sub(
        r"^[ \t]*<!--[^\n]*Open Graph[^\n]*-->\n", "", html, flags=re.M
    )
    return html


def process(path):
    with open(path, encoding="utf-8") as fh:
        html = fh.read()
    if not is_mirror_page(html, path):
        return "skip"

    title = pick_title(html)
    canonical = pick_canonical(html)
    if not title or not canonical:
        return "no-meta"
    description = pick_description(html)
    image = pick_image(html, canonical, path)

    block = build_block(title, description, canonical, image)

    cleaned = strip_existing(html)
    m = re.search(
        r'(<link\s+rel=["\']canonical["\'][^>]*>\n)', cleaned, re.I
    )
    if not m:
        return "no-canonical-anchor"
    new = cleaned[: m.end()] + block + "\n" + cleaned[m.end():]
    # collapse any blank lines left immediately after the block (e.g. from a
    # previously hand-authored OG block that had its own surrounding blank lines)
    new = re.sub(re.escape(END) + r"\n\n+", END + "\n", new)

    if new == html:
        return "ok"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new)
    return "image" if image else "noimg"


def main():
    files = sorted(glob.glob(os.path.join(SITE, "**", "index.html"), recursive=True))
    buckets = {}
    for f in files:
        r = process(f)
        buckets.setdefault(r, []).append(os.path.relpath(f, ROOT))

    for r in ("image", "noimg", "ok", "no-meta", "no-canonical-anchor"):
        for f in buckets.get(r, []):
            print(f"{r:20} {f}")
    n_written = len(buckets.get("image", [])) + len(buckets.get("noimg", []))
    print(f"\nStamped {n_written} mirror page(s); "
          f"{len(buckets.get('ok', []))} already current, "
          f"{len(buckets.get('skip', []))} non-mirror skipped.")
    if buckets.get("noimg"):
        print("WARNING: no image found for:", ", ".join(buckets["noimg"]))


if __name__ == "__main__":
    main()
