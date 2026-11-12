#!/usr/bin/env python3
"""Builds mes.fm/gyrotop-angular-momentum/index.html -- "GyroTop and Gyroscopes Point to Serious Flaw in Mainstream Angular
Momentum Physics" (2026-11-11), from gyrotop_src/post.md (the article's markdown, as written by MES).

Shell = hive_mirror_template.html (standard article shell: header, A-/A+/moon, floating bar, comments, ads), branded MES
Anti-Gravity (logo, header, floating bar; the info bar is copied from the antigravity hub). Bare YouTube links on their own
line become lazy embeds, as Hive shows them. Thumbnail (og:image + top of the article) = img/thumbnail.jpg; the hub tiles on
/experiments and /antigravity use mes.fm/img/gyrotop-angular-momentum-icon.jpg (3:2 crop of it).

    python3 build_gyrotop_article.py              # dry run
    python3 build_gyrotop_article.py --apply      # write

Never hand-edit the output. After a run: add_sidebar_math.py --only=gyrotop-angular-momentum --apply,
add_bottom_ad.py --only=gyrotop-angular-momentum --apply, build_sitemap.py, build_search_index.py."""
import html, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
SLUG = "gyrotop-angular-momentum"
OUT = os.path.join(MES, SLUG, "index.html")
SRC = os.path.join(ROOT, "gyrotop_src", "post.md")
MARKED = os.path.join(MES, "vector-functions-problems-plus", "node_modules", "marked", "lib", "marked.esm.js")
TITLE = "GyroTop and Gyroscopes Point to Serious Flaw in Mainstream Angular Momentum Physics"
SUBTITLE = "Owen Liang's magnetic spinning top, rising gyroscopes and ice-block experiments &middot; November 11, 2026"
DESC = ("Owen Liang's GyroTop magnetic spinning top and MES gyroscope experiments question the friction explanation of rising "
        "tops and the mainstream idea of angular momentum.")
OG = f"https://mes.fm/{SLUG}/img/thumbnail.jpg"
BRAND = dict(href="/antigravity", logo="/img/antigravity-logo.jpg", title="MES Anti-Gravity",
             tag="MES Anti-Gravity research: gyroscopes, spinning wheels and hidden science.")
PARTOF = ('Part of <a href="/antigravity">MES Anti-Gravity</a> &middot; <a href="/experiments">MES Experiments</a> &middot; '
          '<a href="/science">MES Science</a>')
CSS = """
    /* ---- GyroTop article (build_gyrotop_article.py) ---- */
    article { overflow-wrap: anywhere; }
    article img { max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 6px; }
    .gt-yt { position: relative; width: 100%; aspect-ratio: 16 / 9; margin: 1em 0; }
    .gt-yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 6px; }
"""


def md_to_html(md):
    js = ("import {marked} from %s; let s='';process.stdin.setEncoding('utf8');"
          "process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(marked.parse(s)));") % json.dumps("file://" + MARKED)
    return subprocess.run(["node", "--input-type=module", "-e", js], input=md, capture_output=True, text=True, check=True).stdout


def yt_id(url):
    m = re.match(r"https?://(?:www\.)?(?:youtu\.be/|youtube\.com/watch\?v=)([\w-]{11})", url)
    return m.group(1) if m else None


def article():
    md = open(SRC, encoding="utf-8").read().replace("\r\n", "\n")
    def yt_line(m):
        vid = yt_id(m.group(1))
        return f"\n@@YT:{vid}@@\n" if vid else m.group(0)
    md = re.sub(r"^[ \t]*(https?://(?:www\.)?(?:youtu\.be|youtube\.com)/\S+)[ \t]*$", yt_line, md, flags=re.M)
    body = md_to_html(md)
    body = re.sub(r"<p>@@YT:([\w-]{11})@@</p>", lambda m:
                  f'<div class="gt-yt"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/{m.group(1)}" '
                  'title="YouTube video" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
                  'allowfullscreen></iframe></div>', body)
    if "@@YT" in body:
        raise SystemExit("a YouTube line was not turned into an embed")
    # bare links in the text -> clickable (marked's GFM autolink does most; this is a safety net for none left)
    body = re.sub(r'alt="image\.png"', 'alt=""', body)
    body = re.sub(r"<img (?!loading)", '<img loading="lazy" ', body)
    body = re.sub(r'<a href="(https?://(?!mes\.fm))', r'<a target="_blank" rel="noopener" href="\1', body)
    thumb = (f'<p><img src="/{SLUG}/img/thumbnail.jpg" width="640" height="360" '
             'alt="GyroTop magnetic spinning top rising against a magnet"></p>\n')
    return thumb + body


def build():
    t = open(os.path.join(ROOT, "hive_mirror_template.html"), encoding="utf-8").read()
    t = t.replace("@@VIDEO_SCRIPTS@@", "").replace("</style>", CSS + "</style>", 1)
    for k, v in {"@@SLUG@@": SLUG, "@@TITLE@@": html.escape(TITLE, quote=False), "@@SUBTITLE@@": SUBTITLE,
                 "@@DESC@@": html.escape(DESC), "@@OGIMAGE@@": OG, "@@PARTOF@@": PARTOF,
                 "@@BRAND_HREF@@": BRAND["href"], "@@BRAND_LOGO@@": BRAND["logo"], "@@BRAND_LOGO_ABS@@": "https://mes.fm" + BRAND["logo"],
                 "@@BRAND_TITLE@@": BRAND["title"], "@@BRAND_TAG@@": BRAND["tag"],
                 "@@COMPACT_MATH_LINK@@": '<li><a href="/antigravity" tabindex="-1">Anti-Gravity</a></li>',
                 "@@ARTICLE@@": article()}.items():
        t = t.replace(k, v)
    assert "@@" not in t, "unfilled token"
    hub = open(os.path.join(MES, "antigravity", "index.html"), encoding="utf-8").read()
    bar = re.search(r'<ul id="info-bar" class="info-bar[^"]*">.*?</ul>', hub, re.S).group(0).replace('class="info-bar shadow"', 'class="info-bar"')
    t, n = re.subn(r'<ul id="info-bar" class="info-bar">.*?</ul>', lambda m: bar, t, count=1, flags=re.S)
    assert n == 1, "info bar not found in the template"
    t = t.replace("current_tab: 99, info_bar_tab: -1", "current_tab: 99, info_bar_tab: 0", 1)
    return t


if __name__ == "__main__":
    out = build()
    apply = "--apply" in sys.argv
    print(f"{len(out)} bytes, {out.count('gt-yt')//1} video embeds -> {os.path.relpath(OUT, ROOT)}"
          + ("" if apply else "   (dry run; pass --apply to write)"))
    if apply:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(out)
