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

CALC_DIRS = {"bmicalculator", "gradecalculator", "percentagecalculator", "mortgagecalculator", "inflationcalculator", "vatcalculator",
             "pokemongocalculator", "gpacalculator", "youtubemoney", "earth-curvature-calculator", "gematria",
             "impermanent-loss-calculator", "unit-conversion"}
TOOL_DIRS = {"timer", "speedreader", "emoji", "latex", "timezone", "symbols", "youtube-thumbnail", "stats"}
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
