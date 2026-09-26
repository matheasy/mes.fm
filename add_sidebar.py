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

FAMILIES = {
    "percentagecalculator": {
        "name": "Percentage Calculator",
        "calc": "index.html",
        "articles": ["how-do-you-calculate-percentages.html", "tutorial.html"],
        "memes": "memes",
        "facts": "interesting-facts",
        "thumbs": "img/memes-thumbnail",
        "logo": "/percentagecalculator/img/logo.png",
        # other calculators offered as a cross-link (title, url, logo), rotated through
        "others": [
            ("Grade Calculator", "/gradecalculator", "/gradecalculator/img/logo.png"),
            ("GPA Calculator", "/gpacalculator", "/gpacalculator/img/logo.png"),
            ("BMI Calculator", "/bmicalculator", "/bmicalculator/img/logo.png"),
            ("Mortgage Calculator", "/mortgagecalculator", "/mortgagecalculator/img/logo.png"),
        ],
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
NUMERIC_STUB = re.compile(r"^\d+\.html$")  # 1.html, 2.html ... are "Page Not Found" pagination stubs


def read(path):
    with open(path, encoding="utf-8", newline="") as f:  # newline="": keep CRLF pages byte-for-byte
        return f.read()


def title_of(text, fallback):
    m = TITLE_RE.search(text)
    t = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""
    return re.sub(r"\s+", " ", t) or fallback


def thumb_for(fam_dir, cfg, slug):
    """161px thumbnail for a meme slug, preferring the small -thumbnail-2 file (the aside shows it at 56px)."""
    d = os.path.join(fam_dir, cfg["thumbs"])
    for suffix in ("-thumbnail-2", "-thumbnail"):
        hits = glob.glob(os.path.join(d, glob.escape(slug) + suffix + ".*"))
        if hits:
            return "/%s/%s/%s" % (os.path.basename(fam_dir), cfg["thumbs"], os.path.basename(sorted(hits)[0]))
    return None


def build_catalog(family, cfg):
    fam_dir = os.path.join(SITE, family)
    cat = {"calc": None, "articles": [], "memes": [], "facts": []}
    text = read(os.path.join(fam_dir, cfg["calc"]))
    cat["calc"] = {"path": os.path.join(fam_dir, cfg["calc"]), "url": "/" + family, "title": title_of(text, cfg["name"]),
                   "img": cfg["logo"], "logo": True, "kind": "Calculator"}
    for a in cfg["articles"]:
        p = os.path.join(fam_dir, a)
        if os.path.exists(p):
            cat["articles"].append({"path": p, "url": "/%s/%s" % (family, a[:-5]), "title": title_of(read(p), a[:-5]),
                                    "img": cfg["logo"], "logo": True, "kind": "Tutorial"})
    for key, kind in (("memes", "Meme"), ("facts", "Interesting fact")):
        for p in sorted(glob.glob(os.path.join(fam_dir, cfg[key], "*.html"))):
            fn = os.path.basename(p)
            if NUMERIC_STUB.match(fn):
                continue
            slug = fn[:-5]
            img = thumb_for(fam_dir, cfg, slug) if key == "memes" else None
            cat[key].append({"path": p, "url": "/%s/%s/%s" % (family, cfg[key], slug), "title": title_of(read(p), slug),
                             "img": img or cfg["logo"], "logo": img is None, "kind": kind})
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


def other_calc(cfg, i, count):
    others = [{"url": u, "title": t, "img": lg, "logo": True, "kind": "Calculator"} for t, u, lg in cfg["others"]]
    return [others[(i + k) % len(others)] for k in range(count)]


MAX_STATIC = 4  # + 1 random card added client-side: keeps the sticky aside (ad + list) shorter than a laptop viewport


def recs_for(page, cat, cfg):
    """The static related cards for one page (the extra random one is added by aside.js)."""
    calc = cat["calc"]
    self_url = page["url"]
    kind = page["kind"]
    memes, facts, arts = cat["memes"], cat["facts"], cat["articles"]
    idx = {k: {p["url"]: n for n, p in enumerate(cat[k])} for k in ("memes", "facts")}
    if kind == "Meme":
        i = idx["memes"][self_url]
        cards = rot(memes, i, (1, 13), (self_url,)) + [calc] + other_calc(cfg, i, 1)
    elif kind == "Interesting fact":
        i = idx["facts"][self_url]
        cards = rot(facts, i, (1, 7), (self_url,)) + [calc] + other_calc(cfg, i, 1)
    else:  # the calculator itself, or a tutorial/article page
        base = len(self_url)  # arbitrary but stable spread for the few pages of this kind
        cards = [a for a in arts if a["url"] != self_url]
        if page is not calc:
            cards.append(calc)
        cards += other_calc(cfg, base, 1) + rot(memes, base, (0,))
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
    new = new.replace("</body>", JS_BLOCK.format(v=ASSET_V) + "</body>", 1)
    new, n = re.subn(r'(<div id="outer-container" class="outer-container)(")', r"\1 has-aside\2", new, count=1)
    return new if n else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every page")
    ap.add_argument("--family", action="append", help="only this family (repeatable); default all in FAMILIES")
    ap.add_argument("--ad-slot", default=None, help="AdSense data-ad-slot for the 300x250 unit (default: keep each page's)")
    ap.add_argument("--remove", action="store_true", help="strip the aside from the selected families")
    args = ap.parse_args()

    total = changed = 0
    skipped = []
    random_json = {}
    for family, cfg in FAMILIES.items():
        if args.family and family not in args.family:
            continue
        cat = build_catalog(family, cfg)
        random_json[family] = [{"u": c["url"], "t": c["title"], "i": c["img"], "k": c["kind"]} for c in cat["memes"] + cat["facts"]]
        pages = [cat["calc"]] + cat["articles"] + cat["memes"] + cat["facts"]
        print("%s: %d pages (%d memes, %d facts, %d articles), %d memes without a thumbnail" % (
            family, len(pages), len(cat["memes"]), len(cat["facts"]), len(cat["articles"]),
            sum(1 for m in cat["memes"] if m["logo"])))
        for page in pages:
            total += 1
            old = read(page["path"])
            if args.ad_slot is not None:
                slot = args.ad_slot
            else:
                m = SLOT_RE.search(old)
                slot = m.group(1) if m else ""
            block = "" if args.remove else aside_html(family, cfg, recs_for(page, cat, cfg), slot)
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
