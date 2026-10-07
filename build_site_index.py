#!/usr/bin/env python3
"""Build mes.fm/site-index/pages.json, the data behind mes.fm/site-index (the MES Site Index: a page inventory and
template audit of the whole site).

READ-ONLY on the pages: it scans every deployable HTML page under mes.fm/ (plus HTTrack's `_http_` / `_https_`
captures, flagged non-deployed), works out for each one

  * its clean URL (Vercel cleanUrls: `foo.html` and `foo/index.html` -> `/foo`; `index.html` -> `/`),
  * title (the part before the first " | "), meta description length, <h1> count, approximate visible word count,
  * a SECTION (which part of the site it belongs to),
  * a TEMPLATE (which page shell / layout it is built on) and a GENERATOR (which script / build.mjs / source folder
    produces it, or "hand-built"),
  * feature flags detected from the HTML (AdSense, "More like this" sidebar, bottom ad, Comments, floating bar ...),
  * issues (missing description / og:image / canonical, broken local references, jQuery / Bootstrap still loaded ...),
  * last git commit date and size

and writes one compact JSON file (arrays, not objects; ~300 KB, ~60 KB gzipped). Idempotent (the `generated` date only
moves when the data changes), dry-run by default, `--apply` writes. `-v` lists every page per template; `--unclassified`
lists the pages no rule matched; `--check PATH` explains one page's classification.

Refresh (re-run after structural passes, new pages, rebuilds):
    python3 build_sitemap.py            # optional: refreshes sitemap.xml <lastmod>s
    python3 build_site_index.py --apply

---------------------------------------------------------------------------------------------------------------
HOW PAGES ARE CLASSIFIED -- ordered rules, the first match wins (TEMPLATES below is the single source of truth;
the page's "How pages are classified" section is generated from it). A page that matches no rule is "Unclassified"
and is shown on its own on the page, on purpose.

  1  httrack          path inside a `_http_` / `_https_` folder: HTTrack's capture of an external page, not deployed
  2  redirect-stub    tiny page that only redirects (meta refresh / location.replace); none today
  3  not-found-stub   title "Page Not Found" / "404" (old pagination stubs, e.g. money-facts/1.html)
  4  gallery-page     numeric pagination page `N.html` of a thumbnail gallery (page 1 duplicates the gallery root)
  5  tool-shell       tool-page shell (tool_page_template.html): has the generated `TOOL-DARK` dark-theme block
  6  jump-to          Jump-to long-article shell: `<nav class="toc-sidebar">` (cubic formula, Problems Plus, Nancy ...)
  7  qa-mirror        math-hub shell + a Math Q/A "Part of" box (the math-qa-N-* livestream mirrors)
  8  mirror-article   math-hub shell (info-bar + compact bar + `.container`, no `#outer-container`) with a video
                      embed / article / "Part of" box: Hive and Math pages, cubic-formula steps, 9/11 and Hutchison posts
  9  hub-tiles        classic header + `.icon-grid` tiles: the homepage, /math, /hutchison, /911, /science, /conspiracy
 10  hub-section      `#header-controls` + `.card-grid` / article, no sidebar: build.mjs section pages (Grid / List view)
 11  hub-links        math-hub shell + `.card-grid`, no video / article: crypto, mathiew
 12  hub-cards        `.calc-container` card hubs: calculators.html, tools.html, mobile-apps.html
 13  gallery-list     classic shell + `<table class="memes">` thumbnail gallery root (memes, puzzles, quotes, dream homes ...)
 14  puzzle-item      classic shell page under /puzzles (puzzle or solution)
 15  gallery-item     classic shell page whose URL sits under a gallery root (meme, quote, dream home, tip, fact)
 16  classic-calc     classic shell with the "More like this" sidebar or `#left-side-container` (calculator mini-site pages)
 17  classic-info     classic shell, top-level page or one-page folder without sidebar (contact, donate, privacy policy, sjwkeyboard)
 18  legacy-bare      no info-bar and no outer container (links, bg, 911djw, chatgpt)
 19  (no rule)        "Unclassified" -- including a classic-shell page below the top level with neither sidebar nor
                      calculator container (that is drift worth looking at, not a default bucket)

GENERATOR is learned from the repo, not guessed: `APPS` in build_tool_apps.py (+ tool_apps_src/ folders), every
directory and `slug: "x"` of each `build.mjs`, math_qa_mirrors.json (math-qa-<n>-<slug>), the Nancy report builder;
otherwise it follows the template (organize_hub_cards.py for card hubs, convert_mirror_pages.py for Hive mirrors,
"hand-built ..." for classic / tool-shell / math-hub pages nothing generates). A page whose shell is not one its
generator emits gets the red `mismatch` issue (EXPECTS), e.g. a build_tool_apps.py page missing the tool shell.

SECTION: calculator mini-site folder (grade, percentage, bmi, ...), else the hub card it sits on (Calculators /
Tools), memes, puzzles, the "Part of" box of a mirror (Math Q/A, 9/11, Hutchison, ...), else the path.

ISSUES: red (hard) = no description, og:image file missing on disk, no / wrong canonical, no title or h1, broken local
img/script/css reference, duplicate URL, unclassified, shell does not match generator; amber (minor) = short (<120)
or long (>320) description, no og:image / twitter:image, relative canonical, several h1, no lang / viewport, jQuery /
Bootstrap loaded, noindex, assets from a retired *.mes.fm subdomain. HTTrack captures get no issues.

The detailed predicates live in classify() so they can be unit-tested (tool_apps_src/site-index-tests.py).
---------------------------------------------------------------------------------------------------------------
"""
import argparse
import datetime
import html as htmlmod
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
OUT = SITE / "site-index" / "pages.json"
SIZE_BUDGET = 500 * 1024


# ---------------------------------------------------------------------------------------------------------------
# Taxonomy. Order matters: classify() tries the rules in this order (the first match wins).
# ---------------------------------------------------------------------------------------------------------------
TEMPLATES = [
    # (id, label, what it is / the rule in words)
    ("httrack", "HTTrack capture", "A page under `_http_` / `_https_`: HTTrack's snapshot of an external link. Legacy, not deployed on purpose."),
    ("redirect-stub", "Redirect stub", "A tiny page that only redirects (meta refresh / location.replace). None exist today; redirects live in vercel.json."),
    ("not-found-stub", "'Page Not Found' stub", "A page titled Page Not Found / 404 (old HTTrack pagination stubs). None exist today."),
    ("gallery-page", "Gallery pagination page", "Numeric `N.html` page of a thumbnail gallery (`2.html`, `3.html` ...). `1.html` duplicates the gallery root and is left out of sitemap.xml."),
    ("tool-shell", "Tool page shell", "tool_page_template.html: classic header + floating bar + A-/A+/moon controls + the generated `TOOL-DARK` dark-theme block. Calculators / tools rebuilt as apps."),
    ("jump-to", "Jump-to long article", "Long article with the fixed 'Jump to' sidebar (`<nav class=\"toc-sidebar\">`): Problems Plus, cubic formula, Hutchison reports, Moon."),
    ("qa-mirror", "Math Q/A mirror", "Math-hub shell + a 'Part of MES Math Q/A Livestreams' box: one page per Math Q/A livestream (video + Hive notes)."),
    ("mirror-article", "Math-hub article / Hive mirror", "Math-hub shell (info-bar, floating compact bar, blue nav, `.container`, 'Part of' box, no `#outer-container`) with an article and/or video: Hive mirrors, cubic-formula steps, 9/11 and Hutchison posts."),
    ("hub-tiles", "Tile hub", "Icon-tile hub (`.icon-grid`): the homepage, /math, /hutchison, /911, /science, /conspiracy."),
    ("hub-section", "Hub section page", "`build.mjs` section page of a tile hub: Grid / List view of posts and videos (`.card-grid` or list, `#header-controls`, no sidebar)."),
    ("hub-links", "Link hub", "Bare `.container` link / card hub made by convert_mirror_pages.py (crypto, mathiew)."),
    ("hub-cards", "Card hub", "calculators.html / tools.html / mobile-apps.html: category-organised `.calc-container` card grids with search and chips."),
    ("gallery-list", "Gallery list", "Thumbnail gallery root (`<table class=\"memes\">`): memes, puzzles, quotes, dream homes, tips, facts."),
    ("puzzle-item", "Puzzle page", "A page inside /puzzles (puzzle or its solution) on the classic shell."),
    ("gallery-item", "Gallery item", "Classic-shell page inside a gallery folder: a meme, quote, dream home, tip, fact or YouTuber page."),
    ("classic-calc", "Classic calculator page", "Classic calculator shell (info-bar + `#outer-container` + side nav): calculator mini-site home, formula / tutorial pages."),
    ("classic-info", "Classic info page", "Classic shell, site page with no sidebar: contact, donate, privacy policy, and one-page folders like sjwkeyboard."),
    ("legacy-bare", "Bare legacy page", "Pre-shell page with no info-bar or outer container: links, bg, 911djw, chatgpt."),
]
TPL = {t[0]: i for i, t in enumerate(TEMPLATES)}
UNCLASSIFIED = len(TEMPLATES)          # template index of "Unclassified"
TEMPLATES.append(("unclassified", "Unclassified", "No rule matched. Look at these first: either a new kind of page (add a rule) or a page that drifted away from every shell."))

SECTIONS = [
    ("site", "Site pages & hubs"), ("grade", "Grade Calculator"), ("percentage", "Percentage Calculator"), ("bmi", "BMI Calculator"),
    ("gpa", "GPA Calculator"), ("inflation", "Inflation Calculator"), ("mortgage", "Mortgage Calculator"), ("vat", "VAT Calculator"),
    ("pokemongo", "Pokemon GO Calculator"), ("youtubemoney", "YouTube Money Calculator"), ("calculators", "Calculators (apps)"),
    ("tools", "Tools"), ("memes", "Memes"), ("puzzles", "Puzzles"), ("math", "Math tutorials"), ("math-qa", "Math Q/A livestreams"),
    ("911", "9/11"), ("hutchison", "Hutchison Effect"), ("science", "Science"), ("crypto", "Crypto"), ("conspiracy", "Conspiracy"),
    ("livestreams", "Livestreams"), ("mathiew", "Mathiew"), ("other", "Other"), ("httrack", "HTTrack captures"),
]
SEC = {k: i for i, (k, _) in enumerate(SECTIONS)}

FEATURES = [  # (key, label, how it is detected)
    ("ads", "AdSense", "adsbygoogle / pagead2.googlesyndication in the page"),
    ("aside", "Sidebar", "'More like this' column (`#mes-aside`)"),
    ("bad", "Bottom ad", "bottom-ad.js tag / MES-BOTTOM-AD block"),
    ("com", "Comments", "Comments bar (`#comments-button`)"),
    ("cbar", "Floating bar", "`#compact-nav` floating compact bar (or display-controls.js, which builds it at run time)"),
    ("ctl", "A-/A+/moon", "display-controls.js or the math-hub inline `#header-controls` / articleFontScale script"),
    ("srch", "Site search", "site-search.js tag (display-controls.js loads it at run time)"),
    ("sw", "Width switch", "Standard | Wide | Theatre switch (aside.js, hub-theatre.js, toc-flip.js, jump-aside.js)"),
    ("th", "Theatre restore", "head snippet that restores the saved `pageMode` before first paint"),
    ("dark", "Dark mode", "display-controls.js (derives it) or a body.dark / dark-mode ruleset in the page"),
]
FEAT = {k: 1 << i for i, (k, _, _) in enumerate(FEATURES)}

ISSUES = [  # (key, label, hard?)
    ("nodesc", "No meta description", 1), ("shortdesc", "Description under 120 chars", 0), ("longdesc", "Description over 320 chars", 0),
    ("noog", "No og:image", 0), ("ogmiss", "og:image file missing on disk", 1), ("notw", "No twitter:image", 0),
    ("nocanon", "No canonical", 1), ("canonbad", "Canonical differs from the URL", 1), ("canonrel", "Canonical is not absolute", 0),
    ("notitle", "No title", 1), ("noh1", "No h1", 1), ("multih1", "More than one h1", 0), ("nolang", "No lang attribute", 0),
    ("novp", "No viewport meta", 0), ("broken", "Broken local img/script/css reference", 1), ("jq", "jQuery still loaded", 0),
    ("bs", "Bootstrap still loaded", 0), ("noindex", "noindex", 0), ("unclass", "Unclassified", 1), ("dupurl", "Another file serves the same URL", 1),
    ("oldsub", "Assets from a retired *.mes.fm subdomain", 0), ("mismatch", "Shell does not match its generator", 1),
]
ISS = {k: 1 << i for i, (k, _, _) in enumerate(ISSUES)}

# which shells each generator is supposed to emit: a page whose structure says otherwise has drifted (or was never regenerated)
EXPECTS = {
    "build_tool_apps.py": {"tool-shell"}, "build_math_qa_mirrors.py": {"qa-mirror"}, "build_nancy_physics_article.py": {"jump-to"},
    "organize_hub_cards.py": {"hub-cards"},
    "build.mjs": {"hub-tiles", "hub-section", "hub-links", "jump-to", "mirror-article", "qa-mirror"},
}

# generator labels (index into meta.generators); order = display order
GENERATORS = [
    "build_tool_apps.py", "build.mjs", "build_math_qa_mirrors.py", "build_nancy_physics_article.py", "organize_hub_cards.py",
    "convert_mirror_pages.py / hive_mirror_template.html", "hand-built tool shell", "hand-built hub / math-hub page", "hand-built classic page",
    "HTTrack mirror (not deployed)", "unknown",
]
GEN = {g: i for i, g in enumerate(GENERATORS)}

CALC_SITES = {"gradecalculator": "grade", "percentagecalculator": "percentage", "bmicalculator": "bmi", "gpacalculator": "gpa",
              "inflationcalculator": "inflation", "mortgagecalculator": "mortgage", "vatcalculator": "vat",
              "pokemongocalculator": "pokemongo", "youtubemoney": "youtubemoney"}
SITE_PAGES = {"", "contact", "donate", "privacy-policy", "calculators", "tools", "mobile-apps"}
MATH_RE = re.compile(r"^(math|problems-plus-.*|cubic-formula.*|quadratic-formula.*|cube-root-unity|vectors?|vector-functions.*|"
                     r"sequences-series|spherical-harmonics|projectile-hits-target)$")
PART_OF = [("Math Q/A", "math-qa"), ("Cubic Formula", "math"), ("Vector Functions", "math"), ("9/11", "911"), ("Hutchison", "hutchison"),
           ("Conspiracy", "conspiracy"), ("Crypto", "crypto"), ("Science", "science"), ("Livestreams", "livestreams"), ("mathiew", "mathiew")]


# ---------------------------------------------------------------------------------------------------------------
# Reading pages
# ---------------------------------------------------------------------------------------------------------------
def url_of(rel):
    """file path relative to mes.fm/ -> clean URL path ('/', '/gradecalculator/memes/x')"""
    u = re.sub(r"\.html$", "", rel)
    u = re.sub(r"(^|/)index$", "", u)
    return "/" + u


def meta(doc, attr, name):
    # content may hold the other quote character (an apostrophe in "MES's"), so match the opening quote
    m = (re.search(r'<meta\s+[^>]*%s=["\']%s["\'][^>]*content=(["\'])(.*?)\1' % (attr, re.escape(name)), doc, re.I | re.S)
         or re.search(r'<meta\s+[^>]*content=(["\'])(.*?)\1[^>]*%s=["\']%s["\']' % (attr, re.escape(name)), doc, re.I | re.S))
    return htmlmod.unescape(m.group(2)).strip() if m else None


def strip_noise(doc):
    d = re.sub(r"<!--.*?-->", " ", doc, flags=re.S)
    d = re.sub(r"<(script|style|svg|noscript|template)\b.*?</\1>", " ", d, flags=re.S | re.I)
    return d


def word_count(doc):
    d = strip_noise(doc)
    start = min([i for i in (d.find('id="main-content"'), d.find("<article"), d.find('class="page-content"'), d.find("<main")) if i >= 0] or [-1])
    if start < 0:
        m = re.search(r"<body[^>]*>", d)
        start = m.end() if m else 0
    end = len(d)
    for marker in ('id="comments-button"', 'id="footer"', 'id="mes-aside"', "MES-ASIDE", "</article>"):
        j = d.find(marker, start + 1)
        if j > 0:
            end = min(end, j)
    text = re.sub(r"<[^>]+>", " ", d[start:end])
    return len(re.findall(r"[^\W_]+(?:['’-][^\W_]+)*", htmlmod.unescape(text)))


def read_facts(rel, doc):
    """Everything classify() and the feature / issue detectors need, from one page."""
    ids = set(re.findall(r'\bid=["\']([^"\']+)', doc))
    classes = set()
    for m in re.findall(r'\bclass=["\']([^"\']*)', doc):
        classes.update(m.split())
    srcs = [re.sub(r"[?#].*", "", s).rsplit("/", 1)[-1] for s in re.findall(r'<script[^>]+src=["\']([^"\']+)', doc, re.I)]
    po = re.search(r'class="part-of">Part of <a[^>]*>([^<]*)</a>', doc)
    tm = re.search(r"<title[^>]*>(.*?)</title>", doc, re.S | re.I)
    return dict(
        rel=rel, ids=ids, classes=classes, scripts=set(srcs), partof=po.group(1) if po else "",
        title=re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", "", tm.group(1)))).strip() if tm else "",
        tool_dark="TOOL-DARK:START" in doc, table_memes=bool(re.search(r'<table[^>]*class="[^"]*\bmemes\b', doc)),
        article="<article" in doc, video=("videoEmbed" in ids or "video-embed" in classes),
        redirect=bool(re.search(r'<meta[^>]+http-equiv=["\']refresh', doc, re.I)) or
        (len(doc) < 2500 and bool(re.search(r"location\.(replace|href)", doc))),
    )


def classify(f, gallery_roots):
    """-> template id. f = read_facts(); gallery_roots = set of clean paths ('/memes') of gallery list pages."""
    rel, ids, cl = f["rel"], f["ids"], f["classes"]
    parts = rel.split("/")
    url = url_of(rel)
    name = parts[-1]
    classic = "info-bar" in ids and "outer-container" in ids          # classic header + #outer-container
    mathhub = "info-bar" in ids and "outer-container" not in ids and "container" in cl   # math-hub shell
    if any(p.startswith("_http") for p in parts):
        return "httrack"
    if f["redirect"]:
        return "redirect-stub"
    if re.search(r"page not found|^404", f["title"], re.I):
        return "not-found-stub"
    if re.fullmatch(r"\d+\.html", name):
        return "gallery-page"
    if f["tool_dark"]:
        return "tool-shell"
    if "toc-sidebar" in cl:
        return "jump-to"
    if mathhub and "Math Q/A" in f["partof"]:
        return "qa-mirror"
    if mathhub and (f["video"] or f["article"] or "part-of" in cl) and "card-grid" not in cl:
        return "mirror-article"
    if classic and "icon-grid" in cl:
        return "hub-tiles"
    if classic and "header-controls" in ids and ("card-grid" in cl or f["article"]) and "mes-aside" not in ids:
        return "hub-section"
    if mathhub and "card-grid" in cl:
        return "hub-links"
    if classic and "calc-container" in cl and "hub-cat" in cl or (classic and "calc-container" in cl and not f["table_memes"] and url in ("/calculators", "/tools", "/mobile-apps")):
        return "hub-cards"
    if classic and f["table_memes"]:
        return "gallery-list"
    if classic and parts[0] == "puzzles" and len(parts) > 1 and url != "/puzzles":
        return "puzzle-item"
    if classic and any(url.startswith(r + "/") for r in gallery_roots):
        return "gallery-item"
    if classic and ("mes-aside" in ids or "left-side-container" in ids):
        return "classic-calc"
    if classic and (len(parts) == 1 or (len(parts) == 2 and name == "index.html")):   # donate.html, or a one-page folder (sjwkeyboard)
        return "classic-info"
    if "info-bar" not in ids and "outer-container" not in ids:
        return "legacy-bare"
    return "unclassified"


# ---------------------------------------------------------------------------------------------------------------
# Generators and sections
# ---------------------------------------------------------------------------------------------------------------
def generator_maps():
    """(slug -> generator label) for everything a script produces, learned from the repo itself."""
    owned = {}
    # tool apps: keys of APPS in build_tool_apps.py (+ source folders)
    src = (ROOT / "build_tool_apps.py").read_text(encoding="utf-8")
    apps = set(re.findall(r'^    "([a-z0-9-]+)": dict\(', src, re.M)) | {p.name for p in (ROOT / "tool_apps_src").iterdir() if p.is_dir()}
    for a in apps:
        owned.setdefault(a, "build_tool_apps.py")
    # build.mjs: its own directory + every `slug: "x"` it emits (tile hubs list their section pages that way)
    for b in sorted(SITE.glob("*/build.mjs")):
        d = b.parent.name
        owned[d] = "build.mjs"
        for slug in re.findall(r'\bslug:\s*"([a-z0-9-]+)"', b.read_text(encoding="utf-8", errors="replace"), re.M):
            if (SITE / slug).is_dir() and owned.get(slug) in (None, "build.mjs"):
                owned.setdefault(slug, "build.mjs")
    # Math Q/A mirrors 1-69
    qa = ROOT / "math_qa_mirrors.json"
    if qa.is_file():
        for r in json.loads(qa.read_text(encoding="utf-8")):
            owned["math-qa-%s-%s" % (r["n"], r["slug"])] = "build_math_qa_mirrors.py"
    owned["hutchison-nancy-physics-system"] = "build_nancy_physics_article.py"
    return owned


def hub_cards(name):
    """slugs whose card sits on calculators.html / tools.html"""
    p = SITE / name
    if not p.is_file():
        return set()
    return set(re.findall(r'class="calc-link"[^>]*href="(?:https://mes\.fm)?/([a-z0-9-]+)', p.read_text(encoding="utf-8", errors="replace")))


def generator_of(tpl, slug_top, rel, owned):
    # the page's own directory first, then its top folder
    d = rel.split("/")[0] if "/" in rel else ""
    if tpl == "httrack":
        return "HTTrack mirror (not deployed)"
    own = owned.get(rel[: -len("/index.html")] if rel.endswith("/index.html") else "")   # slug/index.html is produced by its owner whatever shell it ended up on
    own = own or (owned.get(d) if d and tpl in ("tool-shell", "jump-to", "hub-tiles", "hub-section", "hub-links", "mirror-article") else None)
    if own:
        return own
    if tpl == "hub-cards":
        return "organize_hub_cards.py"
    if tpl == "tool-shell":
        return "hand-built tool shell"
    if tpl in ("mirror-article", "qa-mirror", "jump-to", "hub-tiles", "hub-section", "hub-links"):
        return "convert_mirror_pages.py / hive_mirror_template.html" if tpl in ("mirror-article", "hub-links") else "hand-built hub / math-hub page"
    if tpl in ("gallery-list", "gallery-page", "not-found-stub", "redirect-stub", "gallery-item", "puzzle-item", "classic-calc", "classic-info", "legacy-bare"):
        return "hand-built classic page"
    return "unknown"


def section_of(url, tpl, f, tool_slugs, calc_slugs):
    top = url.strip("/").split("/")[0]
    if tpl == "httrack":
        return "httrack"
    if url.strip("/") in SITE_PAGES and top not in CALC_SITES:
        return "site"
    if top in CALC_SITES:
        return CALC_SITES[top]
    if top == "memes" or url == "/memes":
        return "memes"
    if top == "puzzles":
        return "puzzles"
    if top in calc_slugs:
        return "calculators"
    if top in tool_slugs or top in ("timer",):
        return "tools"
    for needle, sec in PART_OF:
        if needle in f["partof"]:
            return sec
    if top.startswith("math-qa"):
        return "math-qa"
    if MATH_RE.match(top):
        return "math"
    if top.startswith("911") or top in ("1109-keo-meteor-music", "bg", "stanley-praimnath-jumpers", "eyesiswatchin-donate"):
        return "911"
    if top.startswith("hutchison") or top in ("highlights", "hutchison-articles", "cold-fusion-lenr", "ferrocell-specular-reflection", "norman-patricia-ai-email"):
        return "hutchison"
    if top.startswith("livestream") or top == "troubleshooting":
        return "livestreams"
    if top.startswith("science") or top in ("moon",):
        return "science" if top.startswith("science") else "tools"
    for k in ("conspiracy", "crypto", "mathiew"):
        if top.startswith(k):
            return k
    return "other"


# ---------------------------------------------------------------------------------------------------------------
# Features and issues
# ---------------------------------------------------------------------------------------------------------------
def features_of(doc, f):
    sc, ids = f["scripts"], f["ids"]
    bits = 0
    if "adsbygoogle" in doc or "pagead2.googlesyndication" in doc:
        bits |= FEAT["ads"]
    if "mes-aside" in ids:
        bits |= FEAT["aside"]
    if "bottom-ad.js" in sc or "MES-BOTTOM-AD" in doc:
        bits |= FEAT["bad"]
    if "comments-button" in ids:
        bits |= FEAT["com"]
    if "compact-nav" in ids or "display-controls.js" in sc:      # display-controls.js builds the bar at run time
        bits |= FEAT["cbar"]
    if "display-controls.js" in sc or "header-controls" in ids or "header-controls" in f["classes"] or "articleFontScale" in doc:
        bits |= FEAT["ctl"]
    if "site-search.js" in sc or "display-controls.js" in sc:
        bits |= FEAT["srch"]
    if sc & {"aside.js", "hub-theatre.js", "toc-flip.js", "jump-aside.js"}:
        bits |= FEAT["sw"]
    if "pageMode" in doc:
        bits |= FEAT["th"]
    if "display-controls.js" in sc or re.search(r"body\.(dark-mode|dark)\b|prefers-color-scheme: dark", doc) or re.search(r'<body[^>]*class="[^"]*\bdark', doc):
        bits |= FEAT["dark"]
    return bits


class Resolver:
    """Does a local src/href point at a file that exists? Relative refs resolve against the clean URL's parent (cleanUrls: no trailing slash)."""

    def __init__(self):
        self.files = {p.relative_to(SITE).as_posix() for p in SITE.rglob("*") if p.is_file() and "node_modules" not in p.parts}

    def exists(self, path):
        path = path.strip("/")
        return path in self.files or (path + ".html") in self.files or (path + "/index.html") in self.files or not path

    def check(self, url, ref):
        """-> 'ok' | 'broken' | 'skip' | 'oldsub'"""
        ref = ref.strip()
        if not ref or ref.startswith(("#", "data:", "mailto:", "tel:", "javascript:", "blob:")) or "{{" in ref or "@@" in ref or "${" in ref:
            return "skip"
        m = re.match(r"(?:https?:)?//([^/]+)(/.*)?$", ref)
        if m:
            host, path = m.group(1).lower(), m.group(2) or "/"
            if host in ("mes.fm", "www.mes.fm"):
                ref = path
            elif host.endswith(".mes.fm"):
                return "oldsub"
            else:
                return "skip"
        ref = re.sub(r"[?#].*", "", ref)
        if not ref.startswith("/"):
            base = url.rsplit("/", 1)[0] if url != "/" else ""
            segs = (base + "/" + ref).split("/")
            out = []
            for s in segs:
                if s == "..":
                    if out:
                        out.pop()
                elif s not in ("", "."):
                    out.append(s)
            ref = "/" + "/".join(out)
        from urllib.parse import unquote
        return "ok" if self.exists(unquote(ref)) else "broken"


ASSET_RE = re.compile(r'<(?:img|script|source|video|audio)\b[^>]*?\bsrc=["\']([^"\']+)|<link\b[^>]*?\brel=["\'](?:stylesheet|icon|shortcut icon|apple-touch-icon)[^>]*?\bhref=["\']([^"\']+)', re.I)


def issues_of(doc, f, url, tpl, resolver):
    bits, broken = 0, []
    desc = meta(doc, "name", "description")
    if desc is None or not desc.strip():
        bits |= ISS["nodesc"]
    else:
        n = len(desc)
        bits |= ISS["shortdesc"] if n < 120 else (ISS["longdesc"] if n > 320 else 0)
    og = meta(doc, "property", "og:image")
    if not og:
        bits |= ISS["noog"]
    else:
        m = re.match(r"https?://(?:www\.)?mes\.fm(/.*)$", og)
        local = m.group(1) if m else (og if og.startswith("/") else None)
        if local and not resolver.exists(re.sub(r"[?#].*", "", local)):
            bits |= ISS["ogmiss"]
    if not meta(doc, "name", "twitter:image") and not meta(doc, "property", "twitter:image"):
        bits |= ISS["notw"]
    cm = re.search(r'<link\b[^>]*\brel=["\']canonical["\'][^>]*\bhref=["\']([^"\']*)', doc, re.I) or \
        re.search(r'<link\b[^>]*\bhref=["\']([^"\']*)["\'][^>]*\brel=["\']canonical', doc, re.I)
    if not cm:
        bits |= ISS["nocanon"]
    else:
        c = cm.group(1).strip()
        if not re.match(r"https?://", c):
            bits |= ISS["canonrel"]
        norm = re.sub(r"^https?://(www\.)?mes\.fm", "", c).rstrip("/") or ""
        # `<gallery>/1` pagination page duplicates the gallery root, so canonicalising to the parent is correct
        page1_of = re.sub(r"/1$", "", url) if re.search(r"/1$", url) else None
        if norm != (url if url != "/" else "") and norm != page1_of:
            bits |= ISS["canonbad"]
    if not f["title"]:
        bits |= ISS["notitle"]
    h1 = len(re.findall(r"<h1\b", strip_noise(doc), re.I))
    if h1 == 0:
        bits |= ISS["noh1"]
    elif h1 > 1:
        bits |= ISS["multih1"]
    if not re.search(r"<html[^>]*\blang=", doc, re.I):
        bits |= ISS["nolang"]
    if not re.search(r'<meta[^>]+name=["\']viewport', doc, re.I):
        bits |= ISS["novp"]
    if re.search(r"<script[^>]+src=[\"'][^\"']*jquery", doc, re.I):
        bits |= ISS["jq"]
    if re.search(r"bootstrap(?:\.min)?\.(?:css|js)|bootstrapcdn", doc, re.I):
        bits |= ISS["bs"]
    rb = meta(doc, "name", "robots")
    if rb and "noindex" in rb.lower():
        bits |= ISS["noindex"]
    old = False
    for m in ASSET_RE.finditer(strip_noise_keep_tags(doc)):
        ref = m.group(1) or m.group(2)
        r = resolver.check(url, ref)
        if r == "broken":
            broken.append(ref)
        elif r == "oldsub":
            old = True
    if broken:
        bits |= ISS["broken"]
    if old:
        bits |= ISS["oldsub"]
    if tpl == "unclassified":
        bits |= ISS["unclass"]
    return bits, desc, h1, broken


def strip_noise_keep_tags(doc):
    """comments and inline script bodies out (so a `src=` inside a string in JS is not a reference); tags stay."""
    d = re.sub(r"<!--.*?-->", " ", doc, flags=re.S)
    return re.sub(r"(<script\b[^>]*>).*?(</script>)", r"\1\2", d, flags=re.S | re.I)


def git_dates():
    out = subprocess.run(["git", "log", "--format=%cd", "--date=short", "--name-only", "--", "mes.fm"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    seen, cur = {}, None
    for line in out.splitlines():
        if not line:
            continue
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            cur = line
        elif cur and line not in seen:
            seen[line] = cur
    return seen


# ---------------------------------------------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------------------------------------------
def page_files():
    for p in sorted(SITE.rglob("*.html")):
        rel = p.relative_to(SITE).as_posix()
        if "node_modules" in p.parts or "template" in p.name:
            continue
        yield p, rel


def scan():
    owned = generator_maps()
    tool_slugs, calc_slugs = hub_cards("tools.html"), hub_cards("calculators.html")
    resolver = Resolver()
    dates = git_dates()
    docs = {}
    for p, rel in page_files():
        docs[rel] = p.read_text(encoding="utf-8", errors="replace")
    facts = {rel: read_facts(rel, d) for rel, d in docs.items()}
    # gallery roots: thumbnail-table pages that are not numeric pagination pages
    roots = {url_of(rel) for rel, f in facts.items()
             if f["table_memes"] and not re.fullmatch(r"\d+\.html", rel.rsplit("/", 1)[-1]) and "_http" not in rel}
    rows, by_url = [], {}
    for rel, doc in docs.items():
        f = facts[rel]
        url = url_of(rel)
        tpl = classify(f, roots)
        gen = generator_of(tpl, url, rel, owned)
        sec = section_of(url, tpl, f, tool_slugs, calc_slugs)
        feat = features_of(doc, f)
        if tpl == "httrack":
            iss, desc, h1, broken = 0, meta(doc, "name", "description"), len(re.findall(r"<h1\b", doc, re.I)), []
        else:
            iss, desc, h1, broken = issues_of(doc, f, url, tpl, resolver)
        if gen in EXPECTS and tpl not in EXPECTS[gen]:
            iss |= ISS["mismatch"]
        title = f["title"].split(" | ")[0].strip()
        kind = 1 if rel.endswith("/index.html") else 0
        row = [url, title, SEC[sec], TPL[tpl] if tpl in TPL else UNCLASSIFIED, GEN.get(gen, GEN["unknown"]), feat, iss,
               len(desc or ""), h1, word_count(doc), len(doc.encode("utf-8", "replace")), dates.get(f"mes.fm/{rel}", ""), kind]
        by_url.setdefault(url, []).append((row, broken))
    bad = {}
    for url, lst in by_url.items():
        lst.sort(key=lambda x: x[0][12])      # flat file first (that is the one the canonical tags point at)
        for k, (row, broken) in enumerate(lst):
            if len(lst) > 1:
                row[6] |= ISS["dupurl"]
            if broken:
                bad[url] = broken[:4]
            rows.append(row)
    rows.sort(key=lambda r: (r[0], r[12]))
    return rows, bad, roots


COLS = ["url", "title", "section", "template", "generator", "features", "issues", "desc_len", "h1", "words", "bytes", "date", "file_kind"]


def build_data(rows, bad):
    tc = {}
    for r in rows:
        tc[r[3]] = tc.get(r[3], 0) + 1
    examples = {}
    for r in rows:      # up to 3 examples per template: prefer index pages near the top of the tree, with the most features
        examples.setdefault(r[3], []).append(r)
    ex = {}
    for t, lst in examples.items():
        lst = sorted(lst, key=lambda r: (r[0].count("/"), -bin(r[5]).count("1"), r[0]))
        ex[t] = [r[0] for r in lst[:3]]
    return {
        "v": 1,
        "cols": COLS,
        "templates": [[t[0], t[1], t[2], ex.get(i, [])] for i, t in enumerate(TEMPLATES)],
        "sections": [list(s) for s in SECTIONS],
        "generators": GENERATORS,
        "features": [[k, l, d] for k, l, d in FEATURES],
        "issues": [[k, l, h] for k, l, h in ISSUES],
        "bad": bad,
        "p": rows,
    }


def dumps(d):
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser(description="Build mes.fm/site-index/pages.json (dry run unless --apply)")
    ap.add_argument("--apply", action="store_true", help="write the file")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every page per template")
    ap.add_argument("--unclassified", action="store_true", help="list the pages no rule matched")
    ap.add_argument("--check", metavar="PATH", help="print the record of one page (clean URL or file path)")
    a = ap.parse_args()
    rows, bad, roots = scan()
    data = build_data(rows, bad)
    tnames = [t[1] for t in TEMPLATES]
    print("%d pages" % len(rows))
    counts = {}
    for r in rows:
        counts[r[3]] = counts.get(r[3], 0) + 1
    for i, t in enumerate(TEMPLATES):
        print("  %-28s %5d   %s" % (t[1], counts.get(i, 0), ", ".join(data["templates"][i][3])))
        if a.verbose:
            for r in rows:
                if r[3] == i:
                    print("        ", r[0], "|", GENERATORS[r[4]], "|", SECTIONS[r[2]][1])
    print("generators:")
    gc = {}
    for r in rows:
        gc[r[4]] = gc.get(r[4], 0) + 1
    for i, g in enumerate(GENERATORS):
        print("  %-52s %5d" % (g, gc.get(i, 0)))
    print("sections:")
    sc = {}
    for r in rows:
        sc[r[2]] = sc.get(r[2], 0) + 1
    for i, s in enumerate(SECTIONS):
        print("  %-30s %5d" % (s[1], sc.get(i, 0)))
    ic = {}
    for r in rows:
        for i, (k, l, h) in enumerate(ISSUES):
            if r[6] & (1 << i):
                ic[k] = ic.get(k, 0) + 1
    print("issues:", {k: ic.get(k, 0) for k, _, _ in ISSUES})
    if a.unclassified or counts.get(UNCLASSIFIED):
        print("UNCLASSIFIED:")
        for r in rows:
            if r[3] == UNCLASSIFIED:
                print("   ", r[0])
    if a.check:
        want = "/" + a.check.strip("/").replace(".html", "").replace("/index", "")
        for r in rows:
            if r[0] == want:
                print(dict(zip(COLS, r)), "->", TEMPLATES[r[3]][0], GENERATORS[r[4]], SECTIONS[r[2]][0])
    # idempotent: keep the old `generated` date when nothing but it changed
    today = datetime.date.today().isoformat()
    data["generated"] = today
    if OUT.is_file():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            same = dict(old, generated=today) == data
            if same:
                data["generated"] = old.get("generated", today)
        except ValueError:
            pass
    text = dumps(data)
    size = len(text.encode("utf-8"))
    import gzip
    print("pages.json: %d KB, %d KB gzipped (budget %d KB)" % (size // 1024, len(gzip.compress(text.encode())) // 1024, SIZE_BUDGET // 1024))
    if size > SIZE_BUDGET:
        sys.exit("over the size budget")
    if a.apply:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != text:
            OUT.write_text(text, encoding="utf-8")
            print("wrote", OUT.relative_to(ROOT))
        else:
            print("unchanged")
    else:
        print("(dry run: use --apply to write)")


if __name__ == "__main__":
    main()
