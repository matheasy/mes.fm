#!/usr/bin/env python3
"""Adds the "More like this" side column (300x250 ad slot + a short list of related pages) to individual
calculator / article / meme / fact pages -- NOT the wide gallery/hub pages.

Layout (main_js/aside.css, behaviour main_js/aside.js):
  >= 1200px  two columns: the usual content column + a 300px aside, sticky under the floating bar, with a small
             button that moves it to the other side (remembered in localStorage).
  <  1200px  no columns, no ad -- the related-pages list just sits under the content.

Each page gets, all delimited by markers so a re-run replaces rather than duplicates:
  * <!-- MES-ASIDE-HEAD -->  aside.css link + a tiny inline script applying the saved side before first paint
  * class `has-aside` on #outer-container
  * <!-- MES-ASIDE -->       the <aside> itself, just before the .outer-page-content close (right after .page-content)
  * <!-- MES-ASIDE-JS -->    aside.js (flip button, ad injection, one random card from main_js/aside-random.json)

Related pages are static links (crawlable, so they double as internal linking), picked deterministically by rotating
through the family's list so every page gets about the same number of inbound links; one extra random card is added
client-side.

AD SLOT: it is a placeholder until you create a 300x250 display ad unit in AdSense and run
    python3 add_sidebar.py --apply --ad-slot 1234567890
(re-running without --ad-slot keeps whatever slot each page already has). With no slot the ad box is hidden and
nothing is requested; append ?aside-debug to any page URL to see where it will sit. Never put the slot on pages that
must stay ad-free (youtubemoney, contact/privacy/donate, graphic 9/11 mirrors) -- they are not in FAMILIES.

Pilot family: percentagecalculator. Add a family to FAMILIES to roll it out.
Idempotent; **dry-runs by default (-v lists every page), --apply writes.**  --remove strips the aside again.
"""
import argparse
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "mes.fm")
ASSET_V = "1"  # bump when aside.css / aside.js change (cache-busting ?v=)

DEFAULT_SLOT = "8429975111"  # AdSense display unit "Sidebar 300x250" (fixed 300x250)

# Calculators offered as the cross-link card (the family's own is left out); logo is /<slug>/img/logo.png.
CALCS = [
    ("Percentage Calculator", "/percentagecalculator"),
    ("Grade Calculator", "/gradecalculator"),
    ("GPA Calculator", "/gpacalculator"),
    ("BMI Calculator", "/bmicalculator"),
    ("Mortgage Calculator", "/mortgagecalculator"),
]

# A family = one calculator/tool mini-site under mes.fm/<slug>. `sections` are its gallery-item folders (dir, card label,
# ring offsets or None for the default); the top-level pages that are not galleries (tutorials, formulas ...) become
# the "articles". Gallery/list pages (HUB-WIDE-LAYOUT), numeric pagination pages, tool-shell pages (data-tool) and `skip`
# files never get an aside. Left out on purpose: vatcalculator / pokemongocalculator (a page or two each, own layouts),
# timer + speedreader tool pages, youtubemoney (never any ads), and the build.mjs / Hive-mirror pages.
FAMILIES = {
    "percentagecalculator": {
        "name": "Percentage Calculator",
        "article_kind": "Tutorial",
        "sections": [("memes", "Meme", (1, 13)), ("interesting-facts", "Interesting fact", (1, 7))],
    },
    "gradecalculator": {
        "name": "Grade Calculator",
        "article_kind": "Tutorial",
        "skip": ["br.html"],  # the Portuguese page
        "sections": [("memes", "Meme", None), ("study-tips", "Study tip", None)],
    },
    "gpacalculator": {"name": "GPA Calculator", "article_kind": "Guide", "sections": []},
    "bmicalculator": {
        "name": "BMI Calculator",
        "article_kind": "Guide",
        "sections": [("memes", "Meme", None), ("health-tips", "Health tip", None), ("sports", "Sports BMI list", None)],
    },
    "mortgagecalculator": {
        "name": "Mortgage Calculator",
        "article_kind": "Guide",
        "sections": [("dream-homes", "Dream home", None), ("financial-advice", "Financial advice", None)],
    },
    "inflationcalculator": {
        "name": "Inflation Calculator",
        "article_kind": "Guide",
        "sections": [("money-facts", "Money fact", None)],
    },
    # mes.fm-level galleries: no calculator of their own -- the "calc" card is the gallery hub, thumbnails live in mes.fm/img/
    "memes": {
        "name": "MES Memes",
        "hub": {"url": "/memes", "title": "More Math Memes", "kind": "Gallery", "img": "/img/memes-icon.jpg"},
        "thumb_dir": "img/memes-thumbnail",
        "articles": False,
        "sections": [("", "Meme", None)],
    },
    "puzzles": {
        "name": "MES Puzzles",
        "hub": {"url": "/puzzles", "title": "More Math Puzzles", "kind": "Gallery", "img": "/img/puzzles-icon.jpg"},
        "thumb_dir": "img/memes-thumbnail",  # puzzle thumbnails share the memes folder
        "articles": False,
        "hide_files": ["solution.html"],  # solution pages get the aside but are never recommended
        "sections": [("", "Puzzle", None)],
    },
    "vatcalculator": {"name": "VAT Calculator", "article_kind": "Guide", "sections": []},
    "pokemongocalculator": {"name": "Pokemon Go Calculator", "article_kind": "Guide", "sections": []},
    "timer": {  # only the inspirational-quotes pages: the Timer page itself is a tool shell
        "name": "Timer",
        "calc_title": "Timer",
        "calc_kind": "Tool",
        "calc_patch": False,
        "article_kind": "Guide",
        "sections": [("inspirational-quotes", "Quote", None)],
    },
}

HEAD_BLOCK = (
    '<!-- MES-ASIDE-HEAD --><link rel="stylesheet" href="/main_js/aside.css?v={v}">'
    "<script>try{{if(localStorage.getItem('asideSide')==='left')document.documentElement.classList.add('aside-left')}}catch(e){{}}</script>"
    "<!-- /MES-ASIDE-HEAD -->"
)
JS_BLOCK = '<!-- MES-ASIDE-JS --><script src="/main_js/aside.js?v={v}" defer></script><!-- /MES-ASIDE-JS -->'

BLOCK_RE = re.compile(r"<!-- MES-ASIDE -->.*?<!-- /MES-ASIDE -->\n?", re.S)
HEAD_RE = re.compile(r"<!-- MES-ASIDE-HEAD -->.*?<!-- /MES-ASIDE-HEAD -->", re.S)
JS_RE = re.compile(r"<!-- MES-ASIDE-JS -->.*?<!-- /MES-ASIDE-JS -->", re.S)
SLOT_RE = re.compile(r'class="mes-aside__ad" data-ad-slot="([^"]*)"')
OUTER_RE = re.compile(r'(<div id="outer-container" class="outer-container)( has-aside)?(")')
TITLE_RE = re.compile(r'<h1 class="page-title">(.*?)</h1>', re.S)
MAIN_IMG_RE = re.compile(r'data-src="[^"]*/img/memes/([^"/]+)\.[A-Za-z]+"')
NUMERIC_STUB = re.compile(r"^\d+\.html$")  # 1.html, 2.html ... are "Page Not Found" pagination stubs


def read(path):
    with open(path, encoding="utf-8", newline="") as f:  # newline="": keep CRLF pages byte-for-byte
        return f.read()


def title_of(text, fallback):
    m = TITLE_RE.search(text)
    t = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""
    return re.sub(r"\s+", " ", t) or fallback


def is_gallery(text):
    return "HUB-WIDE-LAYOUT" in text


def thumb_index(fam_dir, thumb_dir=None):
    """{stem: url} of every *-thumbnail(-2) image under the family's img/ folder (or under SITE/<thumb_dir>)."""
    if thumb_dir:
        base, prefix = os.path.join(SITE, thumb_dir), "/" + thumb_dir
    else:
        base, prefix = os.path.join(fam_dir, "img"), "/%s/img" % os.path.basename(fam_dir)
    idx = {}
    for p in glob.glob(os.path.join(base, "**", "*-thumbnail*.*"), recursive=True):
        stem = os.path.splitext(os.path.basename(p))[0]
        idx.setdefault(stem, prefix + "/" + os.path.relpath(p, base).replace(os.sep, "/"))
    return idx


def page_url(family, path):
    rel = os.path.relpath(path, os.path.join(SITE, family)).replace(os.sep, "/")[:-5]
    return "/" + family + ("" if rel == "index" else "/" + rel)


def build_catalog(family, cfg):
    fam_dir = os.path.join(SITE, family)
    logo = "/%s/img/logo.png" % family
    thumbs = thumb_index(fam_dir, cfg.get("thumb_dir"))
    if cfg.get("hub"):  # no calculator page: the "calc" card is a gallery hub and nothing is patched for it
        h = cfg["hub"]
        calc = {"path": None, "url": h["url"], "title": h["title"], "img": h["img"], "logo": False, "kind": h["kind"], "patch": False}
        logo = h["img"]
    else:
        index_path = os.path.join(fam_dir, "index.html")
        calc = {"path": index_path, "url": "/" + family, "title": cfg.get("calc_title") or title_of(read(index_path), cfg["name"]),
                "img": logo, "logo": True, "kind": cfg.get("calc_kind", "Calculator"), "patch": cfg.get("calc_patch", True)}
    cat = {"calc": calc, "articles": [], "sections": []}
    hide_files = cfg.get("hide_files", [])
    if cfg.get("articles", True):
        for path in sorted(glob.glob(os.path.join(fam_dir, "*.html"))):
            fn = os.path.basename(path)
            text = read(path)
            if fn == "index.html" or fn in cfg.get("skip", []) or NUMERIC_STUB.match(fn) or is_gallery(text) or "data-tool" in text:
                continue
            cat["articles"].append({"path": path, "url": page_url(family, path), "title": title_of(text, fn[:-5]),
                                    "img": logo, "logo": True, "kind": cfg["article_kind"]})
    for d, kind, _ in cfg["sections"]:
        items = []
        for path in sorted(glob.glob(os.path.join(fam_dir, d, "**", "*.html"), recursive=True)):
            fn = os.path.basename(path)
            text = read(path)
            if NUMERIC_STUB.match(fn) or is_gallery(text) or "data-tool" in text:
                continue
            slug = fn[:-5]
            img = thumbs.get(slug + "-thumbnail-2") or thumbs.get(slug + "-thumbnail")
            if not img:  # slug differs from the image name (double hyphens ...): go by the page's own main image
                m = MAIN_IMG_RE.search(text)
                if m:
                    img = thumbs.get(m.group(1) + "-thumbnail-2") or thumbs.get(m.group(1) + "-thumbnail")
            items.append({"path": path, "url": page_url(family, path), "title": title_of(text, slug),
                          "img": img or logo, "logo": img is None, "kind": kind, "section": len(cat["sections"]),
                          "hide": fn in hide_files})
        cat["sections"].append(items)
    return cat


def rot(items, i, offsets, exclude=()):
    """Pick one item per offset from a ring, starting after index i, skipping self / duplicates."""
    out, n = [], len(items)
    if not n:
        return out
    for off in offsets:
        for step in range(n):
            cand = items[(i + off + step) % n]
            if cand["url"] not in exclude and cand not in out:
                out.append(cand)
                break
    return out


def other_calc(family, i, count):
    others = [{"url": u, "title": t, "img": u + "/img/logo.png", "logo": True, "kind": "Calculator"}
              for t, u in CALCS if u != "/" + family]
    return [others[(i + k) % len(others)] for k in range(count)]


MAX_STATIC = 4  # + 1 random card added client-side: keeps the sticky aside (ad + list) shorter than a laptop viewport


def recs_for(family, page, cat, cfg):
    """The static related cards for one page (the extra random one is added by aside.js)."""
    calc = cat["calc"]
    self_url = page["url"]
    if page.get("section") is not None:
        items = [it for it in cat["sections"][page["section"]] if not it.get("hide")]
        offs = cfg["sections"][page["section"]][2] or (1, max(2, len(items) // 7))
        i = items.index(page) if page in items else len(self_url)  # hidden (e.g. solution) pages: stable spread
        cards = rot(items, i, offs, (self_url,)) + [calc] + other_calc(family, i, 1)
    else:  # the calculator itself, or a tutorial/article page
        arts = cat["articles"]
        j = arts.index(page) if page in arts else -1
        ordered = arts[j + 1:] + arts[:j] if j >= 0 else arts
        base = len(self_url)  # arbitrary but stable spread for the few pages of this kind
        first = [it for it in next((sec for sec in cat["sections"] if sec), []) if not it.get("hide")]
        cards = ordered[:2] + ([calc] if page is not calc else []) + other_calc(family, base, 1 if first else 3)
        cards += rot(first, base, (0,))
    seen, out = set(), []
    for c in cards:
        if c["url"] != self_url and c["url"] not in seen:
            seen.add(c["url"])
            out.append(c)
    return out[:MAX_STATIC]


def card_html(c):
    return (
        '<li><a class="mes-aside__card" href="{u}"><img class="mes-aside__img{lg}" src="{i}" width="56" height="56" '
        'loading="lazy" alt=""><span class="mes-aside__text"><span class="mes-aside__name">{t}</span>'
        '<span class="mes-aside__tag">{k}</span></span></a></li>'
    ).format(u=html.escape(c["url"], quote=True), i=html.escape(c["img"], quote=True),
             lg=" mes-aside__img--logo" if c.get("logo") else "", t=c["title"], k=c["kind"])


def aside_html(family, cfg, cards, slot):
    return (
        "<!-- MES-ASIDE -->\n"
        '<aside id="mes-aside" class="mes-aside" data-aside-family="{fam}" aria-label="More from {name}">'
        '<div class="mes-aside__sticky">'
        '<div class="mes-aside__ad" data-ad-slot="{slot}"></div>'
        '<div class="mes-aside__head"><h2 class="mes-aside__title-h">More like this</h2>'
        '<button type="button" class="mes-aside__flip" aria-label="Move this sidebar to the other side" '
        'title="Move sidebar to the other side">&#8644;</button></div>'
        '<ul class="mes-aside__list">{cards}</ul>'
        "</div></aside>\n"
        "<!-- /MES-ASIDE -->\n"
    ).format(fam=family, name=cfg["name"], slot=html.escape(slot, quote=True), cards="".join(card_html(c) for c in cards))


def insert_aside(text, block):
    """Put the block just before the </div> that closes .outer-page-content (the last </div> before <!-- side bar -->)."""
    marker = text.find("<!-- side bar -->")
    if marker == -1:
        return None
    end = text.rfind("</div>", 0, marker)
    if end == -1 or 'class="outer-page-content"' not in text[:marker]:
        return None
    return text[:end] + block + text[end:]


def patch_page(text, block, remove):
    """Return new text, or None when the page has no anchor to insert at."""
    text = BLOCK_RE.sub("", text)
    text = HEAD_RE.sub("", text)
    text = JS_RE.sub("", text)
    text = OUTER_RE.sub(lambda m: m.group(1) + m.group(3), text)
    if remove:
        return text
    if "</head>" not in text or "</body>" not in text or '<div id="outer-container" class="outer-container"' not in text:
        return None
    new = insert_aside(text, block)
    if new is None:
        return None
    new = new.replace("</head>", HEAD_BLOCK.format(v=ASSET_V) + "</head>", 1)
    # keep a stable order with add_bottom_ad.py's script tag (aside first, bottom ad last) so either can be re-run
    anchor = "<!-- MES-BOTTOM-AD-JS -->" if "<!-- MES-BOTTOM-AD-JS -->" in new else "</body>"
    new = new.replace(anchor, JS_BLOCK.format(v=ASSET_V) + anchor, 1)
    new, n = re.subn(r'(<div id="outer-container" class="outer-container)(")', r"\1 has-aside\2", new, count=1)
    return new if n else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every page")
    ap.add_argument("--family", action="append", help="only this family (repeatable); default all in FAMILIES")
    ap.add_argument("--ad-slot", default=None, help="AdSense data-ad-slot for the 300x250 unit (default: keep each page's, else the Sidebar 300x250 unit)")
    ap.add_argument("--remove", action="store_true", help="strip the aside from the selected families")
    args = ap.parse_args()

    total = changed = 0
    skipped = []
    random_json = {}
    for family, cfg in FAMILIES.items():
        if args.family and family not in args.family:
            continue
        cat = build_catalog(family, cfg)
        items = [it for sec in cat["sections"] for it in sec]
        random_json[family] = [{"u": c["url"], "t": c["title"], "i": c["img"], "k": c["kind"]} for c in items if not c.get("hide")]
        pages = ([cat["calc"]] if cat["calc"]["patch"] else []) + cat["articles"] + items
        print("%s: %d pages (%s; %d articles), %d section items without a thumbnail" % (
            family, len(pages), ", ".join("%d %s" % (len(sec), cfg["sections"][n][0]) for n, sec in enumerate(cat["sections"])) or "no sections",
            len(cat["articles"]), sum(1 for m in items if m["logo"])))
        for page in pages:
            total += 1
            old = read(page["path"])
            if args.ad_slot is not None:
                slot = args.ad_slot
            else:
                m = SLOT_RE.search(old)
                slot = m.group(1) if m else DEFAULT_SLOT
            block = "" if args.remove else aside_html(family, cfg, recs_for(family, page, cat, cfg), slot)
            new = patch_page(old, block, args.remove)
            if new is None:
                skipped.append(os.path.relpath(page["path"], ROOT))
                continue
            if new != old:
                changed += 1
                if args.verbose:
                    print("  %s %s" % ("write" if args.apply else "would write", os.path.relpath(page["path"], ROOT)))
                if args.apply:
                    with open(page["path"], "w", encoding="utf-8", newline="") as f:
                        f.write(new)
    if not args.remove:
        out = os.path.join(SITE, "main_js", "aside-random.json")
        payload = json.dumps(random_json, ensure_ascii=False, separators=(",", ":"))
        existing = read(out) if os.path.exists(out) else None
        if existing is not None and args.family:  # merge so a partial run doesn't drop other families
            merged = json.loads(existing)
            merged.update(random_json)
            payload = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
        if existing != payload:
            print("aside-random.json: %s" % ("written" if args.apply else "would change"))
            if args.apply:
                with open(out, "w", encoding="utf-8") as f:
                    f.write(payload)
    print("%s: %d of %d pages %s" % ("APPLIED" if args.apply else "DRY RUN", changed, total,
                                     "changed" if args.apply else "would change"))
    if skipped:
        print("Skipped (no insertion anchor): %d" % len(skipped))
        for s in skipped[:20]:
            print("  " + s)
    if not args.apply:
        print("(dry run -- pass --apply to write)")


if __name__ == "__main__":
    sys.exit(main())
