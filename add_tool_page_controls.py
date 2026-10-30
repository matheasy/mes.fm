#!/usr/bin/env python3
"""Give the tool pages (mes.fm/emoji, /latex, /timezone, /symbols, /speedreader, /timer, /youtube-thumbnail,
/stats and the four calculator apps rebuilt by build_tool_apps.py) the same floating header bar and A- / A+ / moon display controls as the hub pages and mes.fm/math.

Per page this script (idempotent; re-running refreshes the generated dark block):

  1. FLOATING BAR -- the slim fixed bar (small tool logo + title + nav links + pinned hamburger) that slides in
     once the real header scrolls away. CSS / markup / JS are reused from add_compact_nav_bar.py (imported), with
     the hub blue swapped for the tool's own shell colour (its `.info-bar,.color-box,.navbar,.footer` colour).
  2. CONTROLS -- `<script src="/main_js/display-controls.js" defer>` (A-/A+ text size, moon/sun dark mode, shared
     `articleFontScale` / `theme` localStorage keys with mes.fm/math) and `<div id="main-content" data-tool
     data-text-scale>`, which opts the tool area into text scaling and the tool-page dark treatment there.
  3. DARK MODE FOR THE WIDGET -- each tool has its own light widget CSS (white tiles, #f7f8fa inputs, dark-grey
     text ...), so a block of `body.dark-mode ...` overrides is *derived* from that page's own tool <style>
     between /* TOOL-DARK:START */ and /* TOOL-DARK:END */: every rule that sets a colour gets a mapped
     counterpart (neutrals are lightness-inverted, pastel tints darkened, saturated accents lightened just enough
     to read on dark, near-white text kept for text sitting on accent buttons). Edit the tool's CSS, re-run this.

**Dry-runs by default; `--apply` writes.**
"""
import colorsys
import re
import sys
from pathlib import Path

import add_compact_nav_bar as cnb

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv

TOOLS = [  # (directory, compact-bar title[, home path of the site the page belongs to])
    ("emoji", "Emoji Copier"),
    ("latex", "LaTeX Render"),
    ("timezone", "Timezone Converter"),
    ("symbols", "Symbol Copier"),
    ("speedreader", "Speed Reader"),
    ("timer", "Timer"),
    ("clock", "Clock"),
    ("reminder", "Reminder"),
    ("jump-start", "Jump-Start"),
    ("workout-planner", "Workout Planner"),
    ("translate", "Translate"),   # also built by build_tool_apps.py (one source, two pages)
    ("image-to-text", "Translate", "/translate"),
    ("birthday", "Famous Birthdays"),   # also built by build_tool_apps.py
    ("zodiac", "Zodiac & Birth Chart"),
    ("enigma", "Enigma Machine"),   # also built by build_tool_apps.py
    ("countdown-timer", "Timer", "/timer"),   # Timer family page (brand option in build_tool_apps.py)
    ("stopwatch", "Timer", "/timer"),   # Timer family page (brand option in build_tool_apps.py)
    ("alarm-clock", "Timer", "/timer"),   # Timer family page (brand option in build_tool_apps.py)
    ("pomodoro-timer", "Timer", "/timer"),   # Timer family page (brand option in build_tool_apps.py)
    ("interval-timer", "Timer", "/timer"),   # Timer family page (brand option in build_tool_apps.py)
    ("countdown-to-date", "Timer", "/timer"),   # Timer family page (brand option in build_tool_apps.py)   # also built by build_tool_apps.py (new 2026-10-06)
    ("youtube-thumbnail", "YouTube Thumbnail"),
    ("stats", "Stats"),
    ("earth-curvature-calculator", "Earth Curvature Calculator"),   # these four were rebuilt as tools-hub pages by build_tool_apps.py
    ("gematria", "Gematria Calculator"),
    ("impermanent-loss-calculator", "Impermanent Loss Calculator"),
    ("unit-conversion", "Unit Conversion Calculator"),
    ("calculator", "Calculator"),
    ("days-between-dates-calculator", "Days Between Dates Calculator"),
    ("ovulation-calculator", "Ovulation Calculator"),   # also built by build_tool_apps.py (one source, three pages)
    ("period-calculator", "Period Calculator"),
    ("due-date-calculator", "Pregnancy Due Date Calculator"),
    ("julia-set-explorer", "Julia Set Explorer"),
    ("time-dilation-explained", "Time Dilation Simulator", "/time-dilation"),   # tutorial: a sub-page of the Time Dilation brand (brand option in build_tool_apps.py)
    ("archive", "Archive"),
    ("baby-growth-percentile-calculator", "Baby Growth Percentile Calculator"),
    ("baby-feeding-log", "Baby Feeding Log"),
    ("domain-lookup", "Domain Lookup"),
    ("site-traffic", "Site Traffic"),
    ("ping", "Ping Test"),
    ("mic-test", "Mic Test"),
    ("file-check", "File Safety Check"),
    ("storage", "Storage Analyzer"),
    ("signals", "Market Signals"),
    ("elections", "Elections"),
    ("debt-clock", "Debt Clock"),
    ("compound-interest-calculator", "Compound Interest Calculator"),   # 2026-10-23
    ("compound-interest-explained", "Compound Interest Calculator", "/compound-interest-calculator"),   # 2026-10-24 tutorial sub-page (brand option)
    ("loan-calculator", "Loan Calculator"),   # 2026-10-23
    ("time-calculator", "Time Calculator"),   # 2026-10-23
    ("fuel-cost-calculator", "Fuel Cost Calculator"),   # 2026-10-23
    ("tip-calculator", "Tip Calculator"),   # 2026-10-23
    ("age-calculator", "Age Calculator"),   # 2026-10-23
    ("poker", "Poker"),   # 2026-10-23
    ("backgammon", "Backgammon"),   # 2026-10-23
    ("nba-picks", "NBA Picks"),   # 2026-10-26
    ("nfl-picks", "NFL Picks"),   # 2026-10-27
    ("mlb-picks", "MLB Picks"),   # 2026-10-27
    ("nhl-picks", "NHL Picks"),   # 2026-10-27
    ("la-liga-picks", "La Liga Picks"),   # 2026-10-27
    ("premier-league-picks", "Premier League Picks"),   # 2026-10-27
    ("march-madness", "March Madness"),   # 2026-10-27
    ("statistics-calculator", "Statistics Calculator"),   # 2026-10-23
    ("birthday-personality", "Birthday Personality"),   # 2026-10-23
    ("seo", "SEO Checker"),   # 2026-10-23
    ("random-number-generator", "Random Number Generator"),   # 2026-10-23
    ("dice-roller", "Dice Roller"),   # 2026-10-23
    ("exif-viewer", "EXIF Viewer"),
    ("contraction-timer", "Contraction Timer"),
    ("bmr-calculator", "BMR Calculator"),
    ("bmi-calculator-kids", "BMI Calculator", "/bmicalculator"),   # 2026-10-27 kids & teens sub-page of the BMI brand (brand option)
    ("calculadora-imc", "Calculadora IMC"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("calculadora-imc-pt", "Calculadora de IMC"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("kalkulator-bmi", "Kalkulator BMI"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("calcul-imc", "Calcul IMC"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("bmi-rechner", "BMI-Rechner"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("calcolo-bmi", "Calcolo BMI"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("vucut-kitle-indeksi", "VKİ Hesaplama"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("tinh-chi-so-bmi", "Tính chỉ số BMI"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("kalkulator-bmi-pl", "Kalkulator BMI"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("hasibat-kutlat-al-jism", "حاسبة كتلة الجسم"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("bmi-calculator-hindi", "बीएमआई कैलकुलेटर"),   # BMI Calculator in another language (build_tool_apps.py BMI_LANG_SLUGS)
    ("shear-stress-calculator", "Mechanics of Materials", "/materials"),   # MES Mechanics of Materials family page (brand option in build_tool_apps.py)
    ("bending-stress-calculator", "Mechanics of Materials", "/materials"),   # 2026-10-29: 5th page of the family (beams)
    ("tensile-test-simulator", "Mechanics of Materials", "/materials"),   # MES Mechanics of Materials family page (brand option in build_tool_apps.py)
    ("youngs-modulus-calculator", "Mechanics of Materials", "/materials"),   # MES Mechanics of Materials family page (brand option in build_tool_apps.py)
    ("materials", "Mechanics of Materials"),   # also built by build_tool_apps.py
    ("matrix-calculator", "Matrix Calculator for Machine Learning"),   # also built by build_tool_apps.py
    ("trigonometry", "Trigonometry Calculator"),   # also built by build_tool_apps.py
    ("geometry", "Geometry & Angle Lab"),   # also built by build_tool_apps.py
    ("shapes-calculator", "Volume, Area & Surface Area Calculator"),   # also built by build_tool_apps.py
    ("pregnancy-calorie-calculator", "Pregnancy Calorie Calculator"),   # also built by build_tool_apps.py
    ("body-surface-area-calculator", "Body Surface Area Calculator"),   # also built by build_tool_apps.py
    ("one-rep-max-calculator", "One-Rep Max Calculator"),   # also built by build_tool_apps.py
    ("sleep-calculator", "Sleep Calculator"),   # also built by build_tool_apps.py
    ("calories-burned-calculator", "Calories Burned Calculator"),   # also built by build_tool_apps.py
    ("protein-intake-calculator", "Protein Intake Calculator"),   # also built by build_tool_apps.py
    ("pace-calculator", "Running Pace Calculator"),   # also built by build_tool_apps.py
    ("waist-to-hip-ratio-calculator", "Waist-to-Hip Ratio Calculator"),   # also built by build_tool_apps.py
    ("heart-rate-zone-calculator", "Heart Rate Zone Calculator"),   # also built by build_tool_apps.py
    ("tdee-calculator", "TDEE Calculator"),   # also built by build_tool_apps.py
    ("water-intake-calculator", "Water Intake Calculator"),   # also built by build_tool_apps.py
    ("ideal-weight-calculator", "Ideal Weight Calculator"),   # also built by build_tool_apps.py
    ("macro-calculator", "Macro Calculator"),   # also built by build_tool_apps.py
    ("body-fat-calculator", "Body Fat Calculator"),   # also built by build_tool_apps.py   # also built by build_tool_apps.py
    ("pregnancy-test-calculator", "When to Take a Pregnancy Test"),
    ("conception-date-calculator", "Conception Date Calculator"),
    ("weeks-pregnant-calculator", "How Many Weeks Pregnant Am I? Week-by-Week Calculator"),   # also built by build_tool_apps.py
    ("2d-graphing-calculator", "2D Graphing Calculator"),   # also built by build_tool_apps.py   # also built by build_tool_apps.py
    ("3d-graphing-calculator", "3D Graphing Calculator"),   # also built by build_tool_apps.py
    ("cas-calculator", "CAS Calculator"),   # the three CAS pages, built by build_tool_apps.py
    ("derivative-calculator", "Derivative Calculator"),
    ("integral-calculator", "Integral Calculator"),
    ("share", "Share Launcher"),   # also built by build_tool_apps.py
    ("search", "Site Search"),     # also built by build_tool_apps.py
    ("calendar", "Calendar"),      # also built by build_tool_apps.py
    ("search-engines", "Search Engines"),
    ("reverse-image-search", "Reverse Image Search"),   # also built by build_tool_apps.py   # also built by build_tool_apps.py (wide page)
    ("site-index", "Site Index"),
    ("ads", "MES Ads"),
    ("search-console", "MES Search Console"),
    ("fav", "MES Favourites"),
    ("ratings", "MES Ratings"),
    ("kids", "MES Kids"),   # MES Kids hub + activities (ad-free; built by build_tool_apps.py)
    ("kids-flashcards", "MES Kids", "/kids"),
    ("kids-animal-sounds", "MES Kids", "/kids"),
    ("kids-abc", "MES Kids", "/kids"),
    ("kids-shapes", "MES Kids", "/kids"),
    ("kids-numbers", "MES Kids", "/kids"),
    ("contact.html", "Contact MES"),   # built by build_tool_apps.py (out=contact.html)
    ("compress", "MES Compressor"),
    ("compress-video", "MES Video Compressor"),
    ("video", "MES Video Editor"),
    ("convert-video", "MES Video Converter"),
    ("docx", "MES Word Viewer"),
    ("fonts", "MES Font Preview and Finder"),
    ("llm-simulator", "MES Toy Language Model Simulator"),
    ("letter-recognition", "MES Letter and Digit Recognition"),
    ("neural-network-playground", "MES Neural Network Playground"),
    ("browser", "Browser Extensions"),   # also built by build_tool_apps.py
    ("videospeed", "Video Speed Controller"),
    ("read-aloud", "Read Aloud"),
    ("dark-mode", "Dark Mode"),
    ("volume-booster", "Volume Booster"),   # download page of the MES volume booster extension
    ("text-size", "Text Size"),   # download page of the MES text size extension   # download page of the MES dark / light mode browser extension   # download page of the MES text-to-speech browser extension   # download page of the MES browser extension   # also built by build_tool_apps.py (ad-free)
    ("go", "Short Links"),   # also built by build_tool_apps.py (wide, ad-free)   # also built by build_tool_apps.py (wide page, ad-free)
    ("typing-test", "Typing Test"),   # also built by build_tool_apps.py
    ("typing-test-voice", "Typing Test", "/typing-test"),   # voice typing test: same brand, built by build_tool_apps.py
    ("typing-test-transcribe", "Typing Test", "/typing-test"),   # transcription test: a sub-page of the Typing Test brand (brand option in build_tool_apps.py)
    ("copy-text", "Copy Text"),    # also built by build_tool_apps.py
    ("pronounce", "Pronounce"),
    ("define", "Dictionary"),
    ("sum-of-integers-calculator", "Sum of Integers Calculator"),   # also built by build_tool_apps.py
    ("reynolds-number-calculator", "Reynolds Number Calculator"),   # also built by build_tool_apps.py
    ("photoelectric-effect-simulator", "Photoelectric Effect"),   # also built by build_tool_apps.py (wide page, dark apparatus stage)
    ("atomic-clock-simulator", "Atomic Clock Simulator"),   # also built by build_tool_apps.py (wide page, dark stages)
    ("fountain-clock", "Caesium Fountain Clock"),   # the 3D fountain as its own page (shares the simulator's script)   # also built by build_tool_apps.py (wide page, dark stages)
    ("michelson-morley-experiment", "Michelson-Morley Simulator"),
    ("faster-than-light-shadow-simulator", "FTL Shadow Simulator"),   # also built by build_tool_apps.py (wide page, dark stages)   # also built by build_tool_apps.py (wide page, dark stages)
    ("pdf-tools", "PDF Tools", "/pdf"),
    ("merge-pdf", "Merge PDF", "/pdf"),   # PDF Tools family page (brand option in build_tool_apps.py)
    ("split-pdf", "Split PDF", "/pdf"),   # PDF Tools family page (brand option in build_tool_apps.py)
    ("organize-pdf", "Organize PDF", "/pdf"),   # PDF Tools family page (brand option in build_tool_apps.py)
    ("jpg-to-pdf", "JPG to PDF", "/pdf"),   # PDF Tools family page (brand option in build_tool_apps.py)
    ("pdf-to-jpg", "PDF to JPG", "/pdf"),   # PDF Tools family page (brand option in build_tool_apps.py)
    ("compress-pdf", "Compress PDF", "/pdf"),   # PDF Tools family page (brand option in build_tool_apps.py)
    ("pdf", "PDF Editor"),   # also built by build_tool_apps.py (wide page, always-dark workspace, pdf.js + pdf-lib)
    ("photo", "Photo Editor"),   # also built by build_tool_apps.py (wide page, always-dark editor workspace)
    ("audio", "Audio Editor"),   # also built by build_tool_apps.py (always-dark editor workspace, MESDenoise)
    ("image-converter", "Image Converter"),   # also built by build_tool_apps.py
    ("3d-fluid-simulator", "3D Fluid Simulator"),   # also built by build_tool_apps.py (wide page, WebGL2 smoke)
    ("buddhabrot", "Buddhabrot Explorer"),
    ("time-dilation", "Time Dilation Simulator"),
    ("mandelbrot", "Mandelbrot Explorer"),   # also built by build_tool_apps.py (tools sidebar collection, worker-pool canvas)
    ("electromagnetic-fields-simulator", "Electromagnetic Fields"),
    ("magnetic-isopotentials", "Magnetic Isopotentials"),
    ("grounding-rod-simulator", "Ground Rod Simulator"),
    ("double-pendulum", "Double Pendulum"),
    ("hutchison-effect-simulator", "Hutchison Effect Simulator"),
    ("orbit-simulator", "Orbit Simulator"),
    ("redshift-simulator", "Redshift Simulator"),
    ("metric-tensor", "Metric Tensor Explorer"),
    ("black-hole-simulator", "Black Hole Simulator"),   # also built by build_tool_apps.py (tools sidebar collection, dark stages, four tabs)
    ("light-in-a-medium", "Light in a Medium"),   # also built by build_tool_apps.py (tools sidebar collection, dark stage)
    ("fluid-simulator", "Fluid Simulator"),   # also built by build_tool_apps.py (wide page, dark simulation stage)
    ("solar-system-today", "Solar System Today"),   # also built by build_tool_apps.py (wide page, dark planetarium stage)
    ("youtubemoney", "YouTube Money Calculator"),   # also built by build_tool_apps.py (ad-free)
    ("gpacalculator", "GPA Calculator"),   # also built by build_tool_apps.py (GPA Calculator 2.0)
    ("bmicalculator", "BMI Calculator"),   # also built by build_tool_apps.py (BMI Calculator 2.0)
    ("gradecalculator", "Grade Calculator"),
    ("weighted-average-calculator.html", "Grade Calculator", "/gradecalculator"),   # Weighted Average 2.0: a page inside the Grade Calculator folder   # also built by build_tool_apps.py (Grade Calculator 2.0)
    ("vatcalculator", "VAT Calculator"),   # also built by build_tool_apps.py (VAT Calculator 2.0)
    ("how-much-do-youtubers-make", "YouTube Money", "/youtubemoney"),   # a sub-page of the YouTube Money site (brand option in build_tool_apps.py); wide, ad-free
    ("mortgagecalculator", "Mortgage Calculator"),   # also built by build_tool_apps.py (Mortgage Calculator 2.0)
]

START, END = "/* TOOL-DARK:START -- generated by add_tool_page_controls.py, do not edit */", "/* TOOL-DARK:END */"
DC_TAG = '<script src="/main_js/display-controls.js?v=1.7" defer></script>'


# ------------------------------------------------------------------ colour mapping
def parse_color(tok):
    tok = tok.strip().lower()
    if tok == "white":
        return (255, 255, 255, 1.0)
    if tok == "black":
        return (0, 0, 0, 1.0)
    if tok.startswith("#"):
        h = tok[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (r, g, b, int(h[6:8], 16) / 255 if len(h) == 8 else 1.0)
    m = re.match(r"rgba?\(([^)]*)\)", tok)
    if m:
        p = [x.strip() for x in re.split(r"[,/\s]+", m.group(1).strip()) if x.strip()]
        r, g, b = (float(x) for x in p[:3])
        a = float(p[3].rstrip("%")) / (100 if p[3].endswith("%") else 1) if len(p) > 3 else 1.0
        return (r, g, b, a)
    return None


def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, round(v))) for v in (r, g, b))
    return "#%02x%02x%02x" % (r, g, b) if a >= 0.999 else "rgba(%d,%d,%d,%.2f)" % (r, g, b, a)


def map_color(tok, kind):
    """kind: text | bg | border | var"""
    c = parse_color(tok)
    if c is None:
        return tok
    r, g, b, a = c
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    neutral = s < 0.30
    if kind == "text":
        if l > 0.9:
            return tok                       # near-white text sits on an accent/dark surface: keep
        if neutral:
            l2 = min(0.95, max(0.62, 1 - l))
        else:
            l2 = max(l, 0.68)                # saturated accent text: lighten enough to read on dark
        s2 = s if not neutral else s * 0.5
    elif kind == "bg":
        if l > 0.72:                         # white / pastel tint -> dark surface
            l2 = min(0.24, max(0.10, 1 - l + 0.06))
            s2 = s * 0.45
        elif neutral:
            l2 = min(0.32, 1 - l) if l < 0.6 else 0.16
            s2 = s
        else:
            return tok                       # saturated mid/dark background (accent buttons, badges): keep
    elif kind == "border":
        if neutral:
            l2 = min(0.42, max(0.20, 1 - l + 0.06)) if l > 0.5 else max(l, 0.3)
            s2 = s
        else:
            l2 = max(l, 0.5) if l < 0.5 else min(0.4, 1 - l + 0.1)
            s2 = s
    else:  # var: custom property used as accent both for text and fills
        if neutral:
            return tok
        l2, s2 = max(l, 0.52), s
    r2, g2, b2 = colorsys.hls_to_rgb(h, l2, s2)
    return fmt(r2 * 255, g2 * 255, b2 * 255, a)


COLOR_RE = re.compile(r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b")


def prop_kind(prop):
    p = prop.strip().lower()
    if p.startswith("--"):
        return "var"
    if p in ("color", "fill"):
        return "text"
    if p in ("background", "background-color", "background-image"):
        return "bg"
    if p in ("stroke",) or p.startswith("border") or p in ("outline", "outline-color"):
        return "border"
    return None


# ------------------------------------------------------------------ css parsing
def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def blocks(css):
    """Yield (selector, body) for every top-level rule; descend into @media (skipping @media print)."""
    i, n = 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        sel = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        body = css[j + 1:k - 1]
        if sel.startswith("@media"):
            if "print" not in sel:
                yield from blocks(body)
        elif not sel.startswith("@"):
            yield sel, body
        i = k


def derive_dark(tool_css):
    out, seen = [], set()
    for sel, body in blocks(strip_comments(tool_css)):
        decls = []
        for d in re.split(r";(?![^(]*\))", body):
            if ":" not in d:
                continue
            prop, val = d.split(":", 1)
            kind = prop_kind(prop)
            if not kind or "url(" in val or "var(" in val and kind != "var" and not COLOR_RE.search(val):
                continue
            new = COLOR_RE.sub(lambda m: map_color(m.group(0), kind), val)
            if new != val:
                decls.append("%s:%s" % (prop.strip(), new.strip()))
        if not decls:
            continue
        parts = [s.strip() for s in re.split(r",(?![^(]*\))", sel) if s.strip()]
        parts = [s for s in parts if not re.match(r"^(a|body|html|\*)(?![\w-])", s) and not s.startswith(".hide")]
        if not parts:
            continue
        rule = "%s{%s}" % (",".join("body.dark-mode " + s for s in parts), ";".join(decls))
        if rule not in seen:
            seen.add(rule)
            out.append(rule)
    return out


GENERIC = (
    "body.dark-mode .page-content :where(div,span,p,li,ul,ol,h1,h2,h3,h4,h5,h6,td,th,label,summary,small,strong,b,em,i,code,pre,"
    "legend,figcaption,dl,dt,dd,blockquote,caption,cite,button,input,select,textarea){color:#d8d8d8}\n\t"
    "body.dark-mode .page-content code{background-color:#33363d;color:#f0a8bd}\n\t"   # bootstrap's pink-on-pink <code> chip
    "body.dark-mode .page-content .btn-default{background-color:#2e2e2e;background-image:none;color:#ddd;border-color:#555}"   # bootstrap default buttons (speedreader)
)


# ------------------------------------------------------------------ page patching
def accent_of(text):
    m = re.search(r"\.info-bar,\.color-box,\.navbar,\.footer\s*\{background-color:(#[0-9a-fA-F]{6});", text)
    return m.group(1) if m else None


def tool_style_span(text):
    """(start, end) of the tool-specific <style> body: the one after '</style>\\t<style>' and before fb:app_id."""
    m = re.search(r"</style>\s*<style>", text)
    if not m:
        return None
    s = m.end()
    e = text.index("</style>", s)
    return s, e


def compact_css(accent):
    css = cnb.CSS_TEMPLATE.replace("#277bb6", accent)
    r, g, b = (int(accent[i:i + 2], 16) for i in (1, 3, 5))
    css = css.replace("rgba(39,123,182,", "rgba(%d,%d,%d," % (r, g, b))
    return css.replace("this page has no #header-controls div, so there's\n   less to reserve room for.",
                       "display-controls.js pins the A-/A+/moon buttons into its right end.")


def patch(text, dirname, title, home=None):
    notes = []
    accent = accent_of(text)
    if not accent:
        return None, ["no shell accent colour found"]
    span = tool_style_span(text)
    if not span:
        return None, ["tool <style> not found"]
    logo = re.search(r'data-src="(/[^"]*/logo\.png[^"]*)"', text)
    logo = logo.group(1) if logo else "https://mes.fm/img/logo-mark.png"

    # -- 3. generated dark block (strip any previous copy first so the derivation sees only hand-written CSS)
    text = re.sub(r"\n\t" + re.escape(START) + r".*?" + re.escape(END) + r"\n", "", text, flags=re.S)
    s, e = tool_style_span(text)
    dark = derive_dark(text[s:e].replace(compact_css(accent), ""))
    block = "\n\t%s\n\t%s\n\t%s\n\t%s\n" % (START, GENERIC, "\n\t".join(dark), END)
    text = text[:e] + block + text[e:]
    notes.append("dark: %d rules" % len(dark))

    # -- 1. floating bar
    if 'id="compact-nav"' not in text:
        css = compact_css(accent)
        m = cnb.CSS_ANCHOR_RE.search(text)
        if not m:
            return None, ["compact-nav CSS anchor not found"]
        text = text[:m.start()] + css + text[m.start():]
        if text.count(cnb.HTML_ANCHOR) != 1 or text.count(cnb.JS_ANCHOR) != 1:
            return None, ["compact-nav HTML/JS anchor not found"]
        html = cnb.build_html(title, home or "/" + dirname).replace("https://mes.fm/img/logo-mark.png", logo)
        html = re.sub(r'    <li><a href="/" tabindex="-1"><b>MES.fm</b></a></li>',
                      '    <li><a href="/" tabindex="-1"><b>MES.fm</b></a></li>', html)
        text = text.replace(cnb.HTML_ANCHOR, html + cnb.HTML_ANCHOR, 1)
        text = text.replace(cnb.JS_ANCHOR, cnb.JS_ANCHOR + cnb.JS_BLOCK, 1)
        notes.append("floating bar")

    # -- 2. controls
    if DC_TAG not in text:
        if "display-controls.js" in text.split("</style>")[-1]:
            text = re.sub(r'<script src="/main_js/display-controls\.js[^"]*" defer></script>', DC_TAG, text, count=1)
        else:
            text = text.replace(cnb.JS_BLOCK, cnb.JS_BLOCK + DC_TAG, 1)
        notes.append("controls script")
    if 'id="main-content" data-tool' not in text:
        if text.count('<div id="main-content">') != 1:
            return None, ["#main-content not unique"]
        text = text.replace('<div id="main-content">', '<div id="main-content" data-tool data-text-scale>', 1)
        notes.append("data-tool")
    return text, notes


def main():
    changed = 0
    for entry in TOOLS:
        d, title = entry[0], entry[1]
        p = SITE / d if d.endswith(".html") else SITE / d / "index.html"   # "<folder>/<page>.html" = a page inside another site's folder
        old = p.read_text(encoding="utf-8")
        new, notes = patch(old, d, title, entry[2] if len(entry) > 2 else None)
        if new is None:
            print("%-18s SKIPPED: %s" % (d, "; ".join(notes)))
            continue
        print("%-18s %s%s" % (d, "; ".join(notes), "" if new != old else "  (no change)"))
        if new != old:
            changed += 1
            if APPLY:
                p.write_text(new, encoding="utf-8")
    print("%d pages %s" % (changed, "written" if APPLY else "would change (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
