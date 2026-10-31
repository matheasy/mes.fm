#!/usr/bin/env python3
"""Build mes.fm/search/index.json, the static index behind the site search (the header magnifier on every page,
main_js/site-search.js, and the mes.fm/search page).

One record per page listed in mes.fm/sitemap.xml -- so the index covers exactly the indexable pages (no HTTrack
captures, no noindex pages, no 1.html stubs) -- plus: title (the part before the first " | "), "where" (the rest of
the title minus the site name, e.g. "Memes · Grade Calculator"), meta description (cut to ~220 chars), a category
(the chips on /search) and a small thumbnail.

Categories: the "Part of <hub>" box decides for the Hive-mirror / math-hub pages (9/11, Hutchison, Math Q/A ...),
otherwise the path: calculator folders -> Calculators (their memes / dream homes / quotes / tips sub-folders ->
Memes & Fun), tool folders -> Tools, math slugs -> Math, and so on; see category().

Thumbnails: the page's og:image, swapped for its 161px `<stem>-thumbnail-2` (or 432px `-thumbnail`) twin where the
galleries have one; Hive/PeakD images go through images.hive.blog's 320px resizer; the generic site logo is dropped.

Compact format (the browser downloads it only when someone opens the search):
  {"v": "<date>", "cats": [[key, label], ...], "p": [[path, title, where, desc, catIndex, thumb], ...]}

Re-run after build_sitemap.py whenever pages are added or removed (python3 build_sitemap.py && python3
build_search_index.py). Writes directly -- it's a generated data file; `git diff --stat` shows what changed.
"""
import datetime
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
OUT = SITE / "search" / "index.json"

CATS = [("calculators", "Calculators"), ("tools", "Tools"), ("math", "Math"), ("fun", "Memes & Fun"),
        ("puzzles", "Puzzles"), ("911", "9/11"), ("hutchison", "Hutchison Effect"), ("livestreams", "Livestreams"),
        ("articles", "Articles"), ("more", "More")]
CI = {k: i for i, (k, _) in enumerate(CATS)}

CALC_DIRS = {"compound-interest-calculator", "compound-interest-explained", "loan-calculator", "time-calculator", "fuel-cost-calculator", "tip-calculator", "age-calculator", "statistics-calculator", "sum-of-integers-calculator", "reynolds-number-calculator", "bmicalculator", "calculadora-imc", "calculadora-imc-pt", "kalkulator-bmi", "calcul-imc", "bmi-rechner", "calcolo-bmi", "vucut-kitle-indeksi", "tinh-chi-so-bmi", "kalkulator-bmi-pl", "hasibat-kutlat-al-jism", "bmi-calculator-hindi", "body-fat-calculator", "macro-calculator", "ideal-weight-calculator", "water-intake-calculator", "tdee-calculator", "heart-rate-zone-calculator", "waist-to-hip-ratio-calculator", "pace-calculator", "protein-intake-calculator", "calories-burned-calculator", "sleep-calculator", "one-rep-max-calculator", "body-surface-area-calculator", "pregnancy-calorie-calculator", "shapes-calculator", "geometry", "trigonometry", "matrix-calculator", "materials", "youngs-modulus-calculator", "tensile-test-simulator", "shear-stress-calculator", "bending-stress-calculator", "bmi-calculator-kids", "bmr-calculator", "gradecalculator", "percentagecalculator", "mortgagecalculator", "inflationcalculator",
             "vatcalculator", "pokemongocalculator", "gpacalculator", "youtubemoney", "how-much-do-youtubers-make", "earth-curvature-calculator",
             "gematria", "impermanent-loss-calculator", "unit-conversion", "calculators", "calculator", "2d-graphing-calculator", "3d-graphing-calculator", "days-between-dates-calculator", "ovulation-calculator", "period-calculator", "due-date-calculator", "baby-growth-percentile-calculator", "baby-feeding-log", "contraction-timer", "pregnancy-test-calculator", "conception-date-calculator", "weeks-pregnant-calculator", "cas-calculator", "derivative-calculator", "integral-calculator"}
TOOL_DIRS = {"kids", "kids-flashcards", "kids-animal-sounds", "kids-abc", "kids-shapes", "kids-numbers", "file-check", "jump-start", "storage", "video", "convert-video", "ping", "mic-test", "elections", "docx", "excel", "pronounce", "define", "nba-picks", "nfl-picks", "mlb-picks", "nhl-picks", "la-liga-picks", "premier-league-picks", "march-madness", "ratings", "magnetic-isopotentials", "signals", "debt-clock", "poker", "backgammon", "birthday-personality", "seo", "random-number-generator", "dice-roller", "compress", "compress-video", "fonts", "llm-simulator", "letter-recognition", "neural-network-playground", "redshift-simulator", "fav", "pdf-tools", "grounding-rod-simulator", "julia-set-explorer", "time-dilation-explained", "archive", "domain-lookup", "site-traffic", "exif-viewer", "reverse-image-search", "photo", "audio", "pdf", "merge-pdf", "split-pdf", "organize-pdf", "jpg-to-pdf", "pdf-to-jpg", "compress-pdf", "image-converter", "3d-fluid-simulator", "photoelectric-effect-simulator", "fluid-simulator", "light-in-a-medium", "black-hole-simulator", "mandelbrot", "buddhabrot", "time-dilation", "metric-tensor", "orbit-simulator", "double-pendulum", "hutchison-effect-simulator", "electromagnetic-fields-simulator", "atomic-clock-simulator", "fountain-clock", "michelson-morley-experiment", "faster-than-light-shadow-simulator", "browser", "videospeed", "read-aloud", "dark-mode", "volume-booster", "text-size", "go", "timer", "clock", "reminder", "workout-planner", "birthday", "zodiac", "enigma", "countdown-timer", "stopwatch", "alarm-clock", "pomodoro-timer", "interval-timer", "countdown-to-date", "speedreader", "emoji", "latex", "timezone", "symbols", "youtube-thumbnail", "stats", "share", "calendar", "copy-text", "translate", "image-to-text", "typing-test", "typing-test-transcribe", "typing-test-voice", "solar-system-today", "search-engines", "site-index",
             "moon", "search", "tools"}
MATH = re.compile(r"^(math|math-qa.*|problems-plus-.*|cubic-formula.*|quadratic-formula.*|cube-root-unity|vectors?|"
                  r"vector-functions.*|sequences-series|spherical-harmonics|projectile-hits-target|mathiew)$")
HUTCHISON = {"highlights", "hutchison-articles", "cold-fusion-lenr"}
PART_OF = [("Math Q/A", "math"), ("Cubic Formula", "math"), ("Vector Functions", "math"), ("9/11", "911"),
           ("Hutchison", "hutchison"), ("Livestreams", "livestreams"), ("MES Tools", "tools")]
SITE_NAMES = {"Math Easy Solutions", "MES", "MES.fm", "mes.fm"}
GENERIC_IMG = re.compile(r"^https?://mes\.fm/img/(logo-big|logo-mark|logo)\.(png|jpe?g)$")   # the site-wide MES logo


def page_file(path):
    """clean URL path ('' / 'gradecalculator/memes/x') -> file on disk"""
    for cand in ((SITE / path / "index.html") if path else SITE / "index.html", SITE / (path + ".html")):
        if cand.is_file():
            return cand
    return None


def meta(doc, attr, name):
    m = re.search(r'<meta\s+%s="%s"\s+content="([^"]*)"' % (attr, re.escape(name)), doc)
    return html.unescape(m.group(1)).strip() if m else ""


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def cut(s, n=220):
    if len(s) <= n:
        return s
    s = s[:n].rsplit(" ", 1)[0].rstrip(",.;:-–— ")
    return s + "…"


def category(path, doc):
    m = re.search(r'class="part-of">Part of <a[^>]*>([^<]*)</a>', doc)
    if m:
        for needle, cat in PART_OF:
            if needle in m.group(1):
                return cat
        return "articles"
    parts = path.split("/")
    top = parts[0]
    if top in CALC_DIRS:
        return "calculators" if len(parts) == 1 or top in ("youtubemoney", "how-much-do-youtubers-make") or parts[1] in ("br", "weighted-average-calculator") \
            or not (SITE / top / parts[1]).is_dir() else "fun"
    if top in TOOL_DIRS:
        return "tools" if len(parts) == 1 else "fun"
    if top == "memes":
        return "fun"
    if top == "puzzles":
        return "puzzles"
    if MATH.match(top):
        return "math"
    if top.startswith("911") or top in ("1109-keo-meteor-music", "bg"):
        return "911"
    if top.startswith("hutchison") or top in HUTCHISON:
        return "hutchison"
    if top.startswith("livestream") or top == "troubleshooting":
        return "livestreams"
    if top in ("science", "conspiracy", "crypto", "ama") or "<article" in doc:
        return "articles"
    return "more"


def thumb_index():
    idx = {}
    for p in SITE.rglob("*-thumbnail*.*"):
        if "_http" in p.as_posix():
            continue
        m = re.match(r"(.*)-thumbnail(-2)?\.(jpe?g|png|webp)$", p.name)
        if m:
            key = (p.relative_to(SITE).parts[0], m.group(1))
            # prefer the small -thumbnail-2 (161px) over -thumbnail (432px)
            if key not in idx or m.group(2):
                idx[key] = "/" + p.relative_to(SITE).as_posix()
    return idx


# hub pages without an og:image of their own use the tile shown on the homepage
HUB_THUMBS = {"calculators": "/img/calculators-icon.jpg", "tools": "/img/tools-icon.jpg", "memes": "/img/memes-icon.jpg", "puzzles": "/img/puzzles-icon.jpg"}


def thumbnail(path, img, thumbs):
    if not img or GENERIC_IMG.search(img):
        return ""
    local = re.match(r"https?://mes\.fm(/.*)$", img)
    if local:
        rel = local.group(1)
        # a site's 1200x630 share image (<site>/img/logo-big.png, img/<hub>-logo-big.jpg): use its square logo instead
        big = re.match(r"(.*)logo-big\.\w+$", rel)
        if big:
            for ext in ("png", "jpg", "jpeg"):
                if (SITE / (big.group(1).lstrip("/") + "logo." + ext)).is_file():
                    # the 2013-2018 sites' logo.png is only 176px (blurry at tile size): make_hires_logos.py writes a 512px twin
                    if ext == "png" and (SITE / (big.group(1).lstrip("/") + "logo-512.png")).is_file():
                        return big.group(1) + "logo-512.png"
                    return big.group(1) + "logo." + ext
        top = rel.split("/")[1]
        stem = re.sub(r"\.\w+$", "", rel.rsplit("/", 1)[-1])
        # galleries at mes.fm level (memes, puzzles) keep their images in /img/
        for key in ((top, stem), ("img", stem)):
            if key in thumbs:
                return thumbs[key]
        return rel
    if re.match(r"https://i\.ytimg\.com/vi/", img):
        return re.sub(r"/(maxresdefault|sddefault|hqdefault)\.jpg$", "/mqdefault.jpg", img)
    if re.match(r"https://(images\.hive\.blog|files\.peakd\.com|images\.ecency\.com)/", img) and "/320x0/" not in img:
        return "https://images.hive.blog/320x0/" + img
    return img


def main():
    locs = re.findall(r"<loc>https://mes\.fm/([^<]*)</loc>", (SITE / "sitemap.xml").read_text(encoding="utf-8"))
    thumbs = thumb_index()
    rows, missing, counts = [], [], {}
    for path in locs:
        path = path.strip("/")
        if re.search(r"(^|/)\d+$", path):          # numeric pagination pages duplicate their gallery
            continue
        f = page_file(path)
        if not f:
            missing.append(path)
            continue
        doc = f.read_text(encoding="utf-8", errors="replace")
        if "template" in f.name or "@@TITLE@@" in doc:     # generator templates (cubic-formula/child-template.html) are served but aren't pages
            continue
        m = re.search(r"<title>(.*?)</title>", doc, re.S)
        full = clean(m.group(1)) if m else path
        bits = [b.strip() for b in re.split(r"\s+[|–]\s+", full) if b.strip()]
        title = bits[0] if bits else full
        where = " · ".join(b for b in bits[1:] if b not in SITE_NAMES)
        if not path:
            title, where = "MES.fm", "Math Easy Solutions"
        desc = cut(clean(meta(doc, "name", "description") or meta(doc, "property", "og:description")))
        cat = category(path, doc)
        counts[cat] = counts.get(cat, 0) + 1
        img = meta(doc, "property", "og:image")
        # 3Speak's own thumbnail CIDs (ipfs-3speak.b-cdn.net/ipfs/<cid>) answer 403: a card using one shows no picture
        # (seen on /911-wtc-vehicle-massacre in the sidebar). Use the page's first Hive / Peakd image instead.
        if img and re.match(r"https?://ipfs-3speak\.b-cdn\.net/ipfs/[^/]+$", img):
            alt = re.search(r'(https://(?:files\.peakd\.com|images\.hive\.blog|images\.ecency\.com)/[^"\'\s<>)]+\.(?:jpe?g|png|webp|gif))', doc)
            img = alt.group(1) if alt else ""
        rows.append(["/" + path, title, where, desc, CI[cat], thumbnail(path, img, thumbs) or HUB_THUMBS.get(path, "")])
    data = {"v": datetime.date.today().isoformat(), "cats": [list(c) for c in CATS], "p": rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(text, encoding="utf-8")
    print("search/index.json: %d pages, %d KB" % (len(rows), len(text.encode()) // 1024))
    for k, label in CATS:
        print("  %-18s %d" % (label, counts.get(k, 0)))
    if missing:
        print("no file for %d sitemap URLs: %s" % (len(missing), ", ".join(missing[:10])))


if __name__ == "__main__":
    main()
