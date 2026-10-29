#!/usr/bin/env python3
"""Cross-link calculators and tools in the horizontal info bar.

People using a calculator may like the tools, and vice-versa, so:
  * calculator pages (the calculator mini-sites and the four rebuilt apps) get a "Tools" item -> /tools
  * tool pages (timer, speedreader, emoji, latex, timezone, symbols, youtube-thumbnail, stats, ...) get "Calculators" -> /calculators (and "Tools" if their bar lacked it)
  * the four calculator apps and the tool pages therefore read  Home | Calculators | Tools | ...  like the hub nav.
The item goes in front of the first Donate / Subscribe / Contact Us item (else in front of MES.fm), so the section links stay
first and the bold MES.fm stays last. main.js highlights the active tab by position (`:eq(N)`), so any page whose active
index is at or after the insertion point (contact / donate pages) gets an explicit `info_bar_tab` one higher.
Idempotent (skips pages that already have the link). **Dry-runs by default; `--apply` writes.**
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv

CALC_DIRS = {"compound-interest-calculator", "compound-interest-explained", "loan-calculator", "time-calculator", "fuel-cost-calculator", "tip-calculator", "age-calculator", "statistics-calculator", "sum-of-integers-calculator", "reynolds-number-calculator", "bmicalculator", "calculadora-imc", "calculadora-imc-pt", "kalkulator-bmi", "calcul-imc", "bmi-rechner", "calcolo-bmi", "vucut-kitle-indeksi", "tinh-chi-so-bmi", "kalkulator-bmi-pl", "hasibat-kutlat-al-jism", "bmi-calculator-hindi", "body-fat-calculator", "macro-calculator", "ideal-weight-calculator", "water-intake-calculator", "tdee-calculator", "heart-rate-zone-calculator", "waist-to-hip-ratio-calculator", "pace-calculator", "protein-intake-calculator", "calories-burned-calculator", "sleep-calculator", "one-rep-max-calculator", "body-surface-area-calculator", "pregnancy-calorie-calculator", "shapes-calculator", "geometry", "trigonometry", "matrix-calculator", "materials", "youngs-modulus-calculator", "tensile-test-simulator", "shear-stress-calculator", "bmi-calculator-kids", "bmr-calculator", "gradecalculator", "percentagecalculator", "mortgagecalculator", "inflationcalculator", "vatcalculator",
             "pokemongocalculator", "gpacalculator", "youtubemoney", "how-much-do-youtubers-make", "earth-curvature-calculator", "gematria",
             "impermanent-loss-calculator", "unit-conversion", "calculator", "2d-graphing-calculator", "3d-graphing-calculator", "days-between-dates-calculator", "ovulation-calculator", "period-calculator", "due-date-calculator", "baby-growth-percentile-calculator", "baby-feeding-log", "contraction-timer", "pregnancy-test-calculator", "conception-date-calculator", "weeks-pregnant-calculator", "cas-calculator", "derivative-calculator", "integral-calculator"}
TOOL_DIRS = {"video", "convert-video", "ping", "mic-test", "elections", "docx", "pronounce", "define", "nba-picks", "nfl-picks", "mlb-picks", "nhl-picks", "la-liga-picks", "premier-league-picks", "march-madness", "ratings", "magnetic-isopotentials", "signals", "debt-clock", "poker", "backgammon", "birthday-personality", "seo", "random-number-generator", "dice-roller", "compress", "compress-video", "fonts", "llm-simulator", "letter-recognition", "neural-network-playground", "redshift-simulator", "fav", "pdf-tools", "grounding-rod-simulator", "julia-set-explorer", "time-dilation-explained", "archive", "domain-lookup", "site-traffic", "exif-viewer", "reverse-image-search", "photo", "audio", "pdf", "merge-pdf", "split-pdf", "organize-pdf", "jpg-to-pdf", "pdf-to-jpg", "compress-pdf", "image-converter", "3d-fluid-simulator", "photoelectric-effect-simulator", "fluid-simulator", "light-in-a-medium", "black-hole-simulator", "mandelbrot", "buddhabrot", "time-dilation", "metric-tensor", "orbit-simulator", "double-pendulum", "hutchison-effect-simulator", "electromagnetic-fields-simulator", "atomic-clock-simulator", "fountain-clock", "michelson-morley-experiment", "faster-than-light-shadow-simulator", "browser", "videospeed", "read-aloud", "dark-mode", "volume-booster", "text-size", "go", "timer", "clock", "reminder", "birthday", "zodiac", "enigma", "countdown-timer", "stopwatch", "alarm-clock", "pomodoro-timer", "interval-timer", "countdown-to-date", "speedreader", "emoji", "latex", "timezone", "symbols", "youtube-thumbnail", "stats", "share", "search", "calendar", "copy-text", "translate", "image-to-text", "typing-test", "typing-test-transcribe", "typing-test-voice", "solar-system-today", "search-engines", "site-index"}
LINKS = {"tools": ("Tools", "https://mes.fm/tools", "/tools"), "calculators": ("Calculators", "https://mes.fm/calculators", "/calculators")}
ITEM = re.compile(r'<li class="info-bar__item([^"]*)"[^>]*>\s*<a[^>]*href=["\']([^"\']*)["\'][^>]*>([^<]*)</a>\s*</li>', re.S)
UTILITY_LABELS = {"donate", "subscribe", "contact us"}


def patch(text, want):
    label, href, short = LINKS[want]
    m = re.search(r'<ul id="info-bar" class="info-bar[^"]*">(.*?)</ul>', text, re.S)
    if not m:
        return text, "no info bar"
    ul = m.group(1)
    items = list(ITEM.finditer(ul))
    if not items:
        return text, "no items"
    for it in items:
        if re.sub(r"\s+", " ", it.group(3)).strip().lower() == label.lower() or it.group(2).rstrip("/").endswith(short):
            return text, "already"
    labels = [re.sub(r"\s+", " ", it.group(3)).strip().lower() for it in items]
    pos = next((i for i, (it, l) in enumerate(zip(items, labels)) if l in UTILITY_LABELS or "utility" in it.group(1)), None)
    if pos is None:
        pos = next((i for i, l in enumerate(labels) if l == "mes.fm"), len(items) - 1)
    if want == "calculators":   # read Home | Calculators | Tools like the hub nav
        tools_pos = next((i for i, l in enumerate(labels) if l == "tools"), None)
        if tools_pos is not None:
            pos = tools_pos
    li = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='%s'>%s</a></li>" % (href, label)
    start = m.start(1) + items[pos].start()
    new = text[:start] + li + text[start:]
    # keep main.js's positional active-tab index pointing at the same item
    mv = re.search(r"var MES_Vars\s*=\s*\{[^}]*\}", new)
    if mv:
        body = mv.group(0)
        cur = re.search(r"current_tab:\s*(-?\d+)", body)
        ib = re.search(r"info_bar_tab:\s*(-?\d+)", body)
        idx = int(ib.group(1)) if ib else (int(cur.group(1)) if cur else None)
        if idx is not None and idx >= pos:
            if ib:
                nb = body.replace(ib.group(0), "info_bar_tab: %d" % (idx + 1))
            else:
                nb = body.rstrip("}").rstrip() + ", info_bar_tab: %d }" % (idx + 1)
            new = new.replace(body, nb, 1)
    return new, "added"


def main():
    files = subprocess.run(["git", "ls-files", "mes.fm/*.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    counts = {}
    for rel in files:
        parts = rel.split("/")
        top = parts[1] if len(parts) > 2 else None
        if top in CALC_DIRS:
            wants = ["tools"]
        elif top in TOOL_DIRS:
            wants = ["tools", "calculators"]      # Tools first, so Calculators lands in front of it: Home | Calculators | Tools
        else:
            continue
        if "/_http" in rel:
            continue
        p = ROOT / rel
        t = p.read_text(encoding="utf-8", errors="surrogateescape")
        new, why = t, "already"
        for want in wants:
            new, w = patch(new, want)
            if w == "added":
                why = "added"
        counts[(top, why)] = counts.get((top, why), 0) + 1
        if why == "added" and APPLY:
            p.write_text(new, encoding="utf-8", errors="surrogateescape")
    # the four apps also want Calculators before Tools (they had Calculators only, see build_tool_apps.py)
    for (top, why), n in sorted(counts.items(), key=lambda x: (x[0][0], x[0][1])):
        print("%-30s %-10s %d" % (top, why, n))
    print("(dry run -- pass --apply)" if not APPLY else "applied")


if __name__ == "__main__":
    main()
