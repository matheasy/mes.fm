#!/usr/bin/env python3
"""Makes the explanation / FAQ block at the bottom of the tool and calculator pages (`<div class="tu-seo">`) easier to scan (2026-10-14, after a reader said the
questions and headlines blend into one block of text): bigger, bold headlines with an accent bar, bold questions, slightly larger body text. The rules are also in
tool_apps_src/_shared.css (so rebuilt pages have them); this script adds the same `<style id="seo-headings">` block to every already-built page that has a tu-seo block and
lacks it. Idempotent; dry-runs by default (-v lists pages), --apply writes."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "mes.fm"
CSS = """/* SEO-HEADINGS */
body .tu-seo {font-size:1.04em;line-height:1.65;}
body .tu-seo h2 {font-size:1.45em;font-weight:800;line-height:1.25;margin:0 0 0.6em;color:#1e2733;border-bottom:0;padding-bottom:0;}
body .tu-seo h3 {font-size:1.2em;font-weight:800;line-height:1.3;margin:1.6em 0 0.5em;padding:0.15em 0 0.15em 0.65em;border-left:5px solid var(--accent,#4a6fa5);color:#1e2733;}
body .tu-seo h4, body .tu-seo dt {font-size:1.08em;font-weight:700;font-style:normal;line-height:1.35;margin:1.3em 0 0.3em;color:#1e2733;}
body .tu-seo dd {margin:0 0 0.6em;} body .tu-seo p, body .tu-seo li, body .tu-seo dd {line-height:1.65;}
body.dark-mode .tu-seo h2, body.dark-mode .tu-seo h3, body.dark-mode .tu-seo h4, body.dark-mode .tu-seo dt {color:#f2f2f2;}
"""
BLOCK = '<style id="seo-headings">\n' + CSS + '</style>\n'

def main():
    apply = "--apply" in sys.argv; verbose = "-v" in sys.argv; n = skipped = 0
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT)
        if "_http" in str(rel) or "/extension/" in str(rel) or "node_modules" in rel.parts: continue
        try: s = p.read_text(encoding="utf-8")
        except Exception: continue
        if 'class="tu-seo"' not in s or "</head>" not in s: continue
        if 'id="seo-headings"' in s or "SEO-HEADINGS" in s: skipped += 1; continue
        n += 1
        if verbose: print("  ", rel)
        if apply: p.write_text(s.replace("</head>", BLOCK + "</head>", 1), encoding="utf-8")
    print(("APPLIED" if apply else "dry run") + ": %d pages to patch, %d already have it" % (n, skipped))
    if not apply: print("pass --apply to write")
main()
