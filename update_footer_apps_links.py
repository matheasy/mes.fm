#!/usr/bin/env python3
"""Footer: add "Extensions" (-> /browser) and "All Apps" (-> /all) to the shared footer's top row (2026-11-25).

The top row of the shared <div id="footer"> was  Calculators | Tools | Mobile Apps | MES.fm ; it becomes
Calculators | Tools | Mobile Apps | Extensions | All Apps | MES.fm . The two items are inserted right after the
Mobile Apps item, with the same href style that item uses (root-relative "/browser" or "https://mes.fm/browser").

Covers every mes.fm/**/*.html (HTTrack _http* captures and node_modules skipped), every build.mjs, and the root
templates / generators that carry the footer (tool_page_template.html, hive_mirror_template.html,
math_qa_mirror_template.html, mes.fm/cubic-formula/child-template.html, *.py), so rebuilds keep it.
Files with uncommitted changes (another session's work in progress) are skipped and listed; run it again later.
--include-dirty patches those too.

Idempotent (a footer that already links /browser is left alone). Dry-runs by default (-v lists files); --apply writes.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv
DIRTY_OK = "--include-dirty" in sys.argv

ITEM = re.compile(r'(?P<ind>[ \t]*)<div class="footer__item[^"]*">(?P<sp>\s*)<a class="footer__text footer__text--title" '
                  r'href="(?P<pre>(?:https://mes\.fm)?/)mobile-apps">Mobile Apps</a>(?P<sp2>\s*)</div>')


def add(m):
    ind, sp, pre, sp2 = m.group("ind"), m.group("sp"), m.group("pre"), m.group("sp2")
    one = lambda href, text: '\n\n%s<div class="footer__item">%s<a class="footer__text footer__text--title" href="%s%s">%s</a>%s</div>' % (ind, sp, pre, href, text, sp2)
    return m.group(0) + one("browser", "Extensions") + one("all", "All Apps")


def files():
    site = ROOT / "mes.fm"
    for p in site.rglob("*"):
        if "node_modules" in p.parts or any(x.startswith("_http") for x in p.parts):
            continue
        if p.suffix == ".html" or p.name == "build.mjs":
            yield p
    for p in ROOT.glob("*"):
        if p.suffix in (".html", ".py") and p.name != Path(__file__).name:
            yield p


def main():
    dirty = set()
    if not DIRTY_OK:
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        dirty = {ROOT / l[3:].strip('"') for l in out.splitlines() if l[:2].strip() and not l.startswith("??")}
    n = skipped = 0
    for p in sorted(files()):
        try:
            s = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "mobile-apps\">Mobile Apps</a>" not in s or "footer__text--title" not in s:
            continue
        new = []
        last = 0
        for m in ITEM.finditer(s):
            tail = s[m.end():m.end() + 400]
            if re.search(r'footer__text--title" href="(?:https://mes\.fm)?/browser"', tail):
                continue
            new.append((m.start(), m.end(), add(m)))
        if not new:
            continue
        if p in dirty:
            skipped += 1
            print("skip (uncommitted changes):", p.relative_to(ROOT))
            continue
        out = []
        for a, b, rep in new:
            out.append(s[last:a]); out.append(rep); last = b
        out.append(s[last:])
        n += 1
        if VERBOSE:
            print(p.relative_to(ROOT))
        if APPLY:
            p.write_text("".join(out), encoding="utf-8")
    print("%d file(s) %s, %d skipped" % (n, "patched" if APPLY else "to patch (dry run, --apply writes)", skipped))


if __name__ == "__main__":
    main()
