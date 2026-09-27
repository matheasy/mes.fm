#!/usr/bin/env python3
"""The "More like this" side column (300x250 ad slot + related-article cards) for the individual MES article pages in the math-hub
shell -- Problems Plus 1-5, MES Math Q/A mirrors, cubic-formula step pages, the 9/11 / Hutchison / conspiracy / crypto / science Hive
mirrors: every mes.fm/<slug>/index.html with <div class="container">, a "Part of ..." box, an <article> and the AdSense loader.
NOT touched: pages with a Jump-to menu (911, cubic-formula, vector-functions-problems-plus, hutchison-tom-sky, moon, ferrocell,
norman-patricia), the hub / tile pages (no <article>: conspiracy, crypto, mathiew, science, djw), and the ad-free pages (no AdSense
loader: youtubemoney, the graphic 9/11 jumper clips, contact / privacy / donate). Classic-shell pages use add_sidebar.py instead.

This shell has no .outer-page-content, so the page's main blocks (from the "Part of" box to the Comments box) are wrapped in
    <!-- MES-COLS-START --><div class="mes-cols"><div class="mes-col-main"> ... </div><aside id="mes-aside">...</aside></div><!-- /MES-COLS-END -->
and main_js/aside.css turns .mes-cols into two columns from 1200px (below that the cards just sit under the comments, no ad). The
aside itself, the ad slot, the flip button and the random card are the same as on the classic pages (aside.js / aside.css). Cards are
text-only (no thumbnails -- these pages' images are big video posters) and come from the page's own group: the first link of its
"Part of" box (Math Q/A, 9/11, Hutchison, cubic formula ...), rotated so inbound links spread evenly, plus that group's hub.

Per page, marker-delimited and idempotent: MES-ASIDE-HEAD (css + saved side), has-aside on the container, MES-COLS-START / MES-COLS-END,
MES-ASIDE-JS. The generators (build.mjs, build_math_qa_mirrors.py, convert_mirror_pages.py, build_tool_apps ...) emit these pages
without any of this: after regenerating one, re-run this script (and add_bottom_ad.py).
**Dry-runs by default (-v lists pages), --apply writes.**  --remove strips it again.
"""
import argparse
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import add_sidebar as base  # noqa: E402  (shared markup, head/js blocks, title/read helpers)

SITE = base.SITE
LOADER = "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"

PART_RE = re.compile(r'<div class="part-of">(.*?)</div>', re.S)
COMMENTS_RE = re.compile(r'<div id="comments-box"[^>]*>\s*<div id="fastcomments-widget"></div>\s*</div>')
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
COLS_START = '<!-- MES-COLS-START --><div class="mes-cols"><div class="mes-col-main">'
COLS_START_RE = re.compile(re.escape(COLS_START))
COLS_END_RE = re.compile(r"<!-- MES-COLS-END -->.*?<!-- /MES-COLS-END -->\n?", re.S)
CONTAINER_ANY_RE = re.compile(r'<div class="container(?: has-aside)?">')
CONTAINER_RE = re.compile(r'(<div class="container)( has-aside)?(">)')
BOTTOM_END = "<!-- /MES-BOTTOM-AD -->"

# short card label per group (first "Part of" link), and the hub card each group points at
LABELS = {
    "/math-qa": "Math Q/A", "/911": "9/11 Truth", "/conspiracy": "Conspiracy", "/hutchison": "Hutchison Effect",
    "/cubic-formula": "Cubic Formula", "/vector-functions-problems-plus": "Problems Plus", "/crypto": "Crypto",
    "/links": "Article", "/science": "Science", "/mathiew": "Mathiew", "/": "Article", "/livestreams": "Livestream", "/ufo": "Science",
}
FALLBACK = [
    {"url": "/math", "title": "MES Math Tutorials", "kind": "Explore"},
    {"url": "/calculators", "title": "Free Online Calculators", "kind": "Explore"},
    {"url": "/tools", "title": "Free Online Tools", "kind": "Explore"},
]


def group_of(part_html):
    m = re.search(r'href="([^"]*)"[^>]*>(.*?)</a>', part_html, re.S)
    if not m:
        return None, None
    href = re.sub(r"^https?://mes\.fm", "", m.group(1)).split("#")[0] or "/"
    return href, re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(2))).strip()


def eligible(path, text):
    return (LOADER in text and "<article" in text and len(CONTAINER_ANY_RE.findall(text)) == 1 and 'id="compact-nav"' in text
            and "jump-to" not in text and "Jump to" not in text and PART_RE.search(text) and COMMENTS_RE.search(text))


def catalog():
    items, pages = [], {}
    for path in sorted(glob.glob(os.path.join(SITE, "*", "index.html"))):
        text = base.read(path)
        m = PART_RE.search(text)
        if not (m and eligible(path, text)):
            continue
        href, hub_title = group_of(m.group(1))
        if not href:
            continue
        slug = os.path.basename(os.path.dirname(path))
        h1 = H1_RE.search(text)
        title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else slug
        it = {"path": path, "url": "/" + slug, "title": title, "group": href, "hub_title": hub_title,
              "kind": LABELS.get(href, "Article")}
        items.append(it)
    groups = {}
    for it in items:
        groups.setdefault(it["group"], []).append(it)
    return items, groups


def recs_for(page, groups):
    peers = groups[page["group"]]
    i = peers.index(page)
    n = len(peers)
    cards = base.rot(peers, i, (1, max(2, n // 5), max(3, 2 * n // 5)), (page["url"],))[:3]
    hub = {"url": page["group"], "title": page["hub_title"] or "More like this", "kind": "Collection"}
    cards.append(hub)
    for fb in FALLBACK:
        if len(cards) >= 4:
            break
        if fb["url"] != page["group"]:
            cards.append(fb)
    return cards


def card_html(c):
    return ('<li><a class="mes-aside__card" href="{u}"><span class="mes-aside__text"><span class="mes-aside__name">{t}</span>'
            '<span class="mes-aside__tag">{k}</span></span></a></li>').format(
        u=html.escape(c["url"], quote=True), t=c["title"], k=c["kind"])


def aside_html(group, cards, slot):
    return (
        '<aside id="mes-aside" class="mes-aside" data-aside-family="{fam}" aria-label="More like this">'
        '<div class="mes-aside__sticky">'
        '<div class="mes-aside__ad" data-ad-slot="{slot}"></div>'
        '<div class="mes-aside__head"><h2 class="mes-aside__title-h">More like this</h2>'
        '<button type="button" class="mes-aside__flip" aria-label="Move this sidebar to the other side" '
        'title="Move sidebar to the other side">&#8644;</button></div>'
        '<ul class="mes-aside__list">{cards}</ul>'
        "</div></aside>"
    ).format(fam=group.strip("/") or "home", slot=html.escape(slot, quote=True), cards="".join(card_html(c) for c in cards))


def patch_page(text, aside, remove):
    text = COLS_START_RE.sub("", COLS_END_RE.sub("", text))
    text = base.HEAD_RE.sub("", text)
    text = base.JS_RE.sub("", text)
    text = CONTAINER_RE.sub(lambda m: m.group(1) + m.group(3), text)
    if remove:
        return text
    if "</head>" not in text or "</body>" not in text or not eligible(None, text):
        return None
    part = text.find('<div class="part-of">')
    cm = COMMENTS_RE.search(text)
    end = cm.end()
    if text.startswith("\n<!-- MES-BOTTOM-AD -->", end):  # keep the bottom ad inside the main column
        bot = text.find(BOTTOM_END, end)
        end = bot + len(BOTTOM_END)
        if text[end:end + 1] == "\n":
            end += 1
    block = "<!-- MES-COLS-END --></div>" + aside + "</div><!-- /MES-COLS-END -->\n"
    new = text[:end] + block + text[end:]
    new = new[:part] + COLS_START + new[part:]
    new = new.replace("</head>", base.HEAD_BLOCK.format(v=base.ASSET_V) + "</head>", 1)
    anchor = "<!-- MES-BOTTOM-AD-JS -->" if "<!-- MES-BOTTOM-AD-JS -->" in new else "</body>"
    new = new.replace(anchor, base.JS_BLOCK.format(v=base.ASSET_V) + anchor, 1)
    new, n = re.subn(r'<div class="container">', '<div class="container has-aside">', new, count=1)
    return new if n else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("-v", "--verbose", action="store_true")
    ap.add_argument("--ad-slot", default=None, help="AdSense data-ad-slot (default: keep each page's, else the Sidebar 300x250 unit)")
    ap.add_argument("--remove", action="store_true")
    args = ap.parse_args()

    items, groups = catalog()
    print("%d article pages in %d groups: %s" % (len(items), len(groups),
          ", ".join("%s %d" % (g, len(v)) for g, v in sorted(groups.items(), key=lambda x: -len(x[1])))))
    changed = 0
    skipped = []
    for it in items:
        old = base.read(it["path"])
        if args.ad_slot is not None:
            slot = args.ad_slot
        else:
            m = base.SLOT_RE.search(old)
            slot = m.group(1) if m else base.DEFAULT_SLOT
        aside = "" if args.remove else aside_html(it["group"], recs_for(it, groups), slot)
        new = patch_page(old, aside, args.remove)
        if new is None:
            skipped.append(it["path"])
            continue
        if new != old:
            changed += 1
            if args.verbose:
                print("  %s %s" % ("write" if args.apply else "would write", os.path.relpath(it["path"], ROOT)))
            if args.apply:
                with open(it["path"], "w", encoding="utf-8", newline="") as f:
                    f.write(new)
    if not args.remove:
        out = os.path.join(SITE, "main_js", "aside-random.json")
        rj = {}
        for g, peers in groups.items():
            rj[g.strip("/") or "home"] = [{"u": p["url"], "t": html.unescape(p["title"]), "k": p["kind"]} for p in peers]  # aside.js sets textContent: decode entities
        merged = json.loads(base.read(out)) if os.path.exists(out) else {}
        merged.update(rj)
        payload = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
        if base.read(out) != payload:
            print("aside-random.json: %s" % ("written" if args.apply else "would change"))
            if args.apply:
                with open(out, "w", encoding="utf-8") as f:
                    f.write(payload)
    print("%s: %d of %d pages %s" % ("APPLIED" if args.apply else "DRY RUN", changed, len(items), "changed" if args.apply else "would change"))
    if skipped:
        print("Skipped: %d" % len(skipped))
        for p in skipped[:10]:
            print("  " + os.path.relpath(p, ROOT))
    if not args.apply:
        print("(dry run -- pass --apply to write)")


if __name__ == "__main__":
    sys.exit(main())
