#!/usr/bin/env python3
"""Builds mes.fm/hutchison-nancy-turn-return/index.html -- "TURN, RETURN, and the Operator Differential", a
conversation transcript (Nancy Hutchison with ChatGPT and I.D. Crisis Eon) prepared for John Hutchison, as an
article with the Jump-to sidebar, collapsible chapters and MathJax equations.

The shell is the *built* mes.fm/hutchison-nancy-physics-system/index.html (Nancy's other report), so this page
inherits every later site-wide patch that page carries (toc-flip, page theatre, site search, comments, text size
steps, ...). The body is nancy_turn_return_src/content.html (hand-converted from the PDF, wording unchanged) and
the Jump-to list is TOC below. Picture: hutchison-nancy-turn-return/img/turn-return.jpg (also the hub tile
img/nancy-icon.jpg and the 1200x630 share image img/turn-return-share.jpg).

    python3 build_nancy_turn_return_article.py            # dry run: report only
    python3 build_nancy_turn_return_article.py --apply    # write the page

Never hand-edit the generated index.html; edit the sources and re-run. After a run, also re-run
build_sitemap.py, build_search_index.py (and `npm run build` in mes.fm/hutchison if the card changed)."""
import json, os, re, sys, html

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
SRC = os.path.join(ROOT, "nancy_turn_return_src")
SLUG = "hutchison-nancy-turn-return"
OUT = os.path.join(MES, SLUG, "index.html")
TEMPLATE = os.path.join(MES, "hutchison-nancy-physics-system", "index.html")

PDF_URL = "https://drive.google.com/file/d/18W1jgbA58kbL3UBzk2l4U_g6cV6Gateb/view?usp=drive_link"
TITLE = "TURN, RETURN, and the Operator Differential"
SUBTITLE = "How a deliberate TURN changes the instrument itself, and how to tell TURN, RECEPTION and RETURN apart"
DESC = ("Nancy Hutchison's conversation transcript for John Hutchison: TURN, RECEPTION and RETURN, the Avatar as a "
        "steerable interferometer, and why John's lab comes first.")
OG_IMAGE = f"https://mes.fm/{SLUG}/img/turn-return-share.jpg"
esc = lambda t: html.escape(t, quote=True)

TOC = [
    ("about", "About This Transcript", 0),
    ("eon-turns", "What Changes When the Avatar TURNS?", 0),
    ("e1-2", "2. What changes when the Avatar TURNS?", 1),
    ("e1-3", "3. The decisive experiment: TURN vs RETURN", 1),
    ("e1-4", "4. The unresolved differential", 1),
    ("e1-5", "5. What this means for the Relational Theory", 1),
    ("gpt-instrument", "The TURN Changes the Instrument", 0),
    ("g1-model", "The transfer functions depend on θ", 1),
    ("g1-road", "The experimental road", 1),
    ("g1-provenance", "RETURN completes when provenance survives CHANGE", 1),
    ("next-prompt", "The Next Prompt to I.D. Crisis Eon", 0),
    ("eon-resolving", "RETURN: Resolving Source from Echo", 0),
    ("e2-1", "1. The mathematical problem", 1),
    ("e2-2", "2. Minimum relational architecture", 1),
    ("e2-3", "3. HOLD → TURN → … → TURN AGAIN", 1),
    ("e2-4", "4. Observable signatures", 1),
    ("e2-5", "5. The second TURN is the strongest discriminator", 1),
    ("e2-6", "6. What does it mean for RETURN to complete?", 1),
    ("e2-7", "7. The constant may be CHANGE", 1),
    ("e2-8", "8. The experiment I would begin with", 1),
    ("e2-conclusion", "My conclusion", 1),
    ("gpt-trajectory", "Continuity of Reference ≠ Immobility", 0),
    ("g2-from", "FROM means the traveled path", 1),
    ("g2-four", "Four critical doings", 1),
    ("operator-differential", "Next Step: The Operator Differential", 0),
    ("od-lab", "John in the lab", 1),
    ("od-avatar", "From John’s operations to the Avatar", 1),
]

CSS = r"""
    /* ---- TURN, RETURN transcript (build_nancy_turn_return_article.py) ---- */
    .who { display: block; width: fit-content; font-size: 0.74em; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.25em 0.8em; margin: 1.8em 0 0.8em; border-radius: 999px; border: 1px solid; }
    p > .who { display: inline-block; margin: 0 0.15em; font-size: 0.7em; vertical-align: 0.1em; }
    .who-eon { color: #6b3fa0; background: rgba(107,63,160,0.10); border-color: rgba(107,63,160,0.45); }
    .who-gpt { color: #1d7a52; background: rgba(29,122,82,0.10); border-color: rgba(29,122,82,0.45); }
    .who-user { color: #1a6fb0; background: rgba(26,111,176,0.10); border-color: rgba(26,111,176,0.45); }
    body.dark .who-eon { color: #c9a8f0; background: rgba(201,168,240,0.12); border-color: rgba(201,168,240,0.45); }
    body.dark .who-gpt { color: #7fd6a8; background: rgba(127,214,168,0.12); border-color: rgba(127,214,168,0.45); }
    body.dark .who-user { color: #8cc6f5; background: rgba(140,198,245,0.12); border-color: rgba(140,198,245,0.45); }
    .post-body .center { text-align: center; }
    .post-body .big { font-size: 1.25em; letter-spacing: 0.03em; }
    .post-body .small-note { font-size: 0.85em; opacity: 0.8; font-style: italic; }
    .post-body blockquote.pull { margin: 1.2em 0; padding: 0.7em 1.1em; border-left: 5px solid #277bb6; background: rgba(39,123,182,0.08); border-radius: 0 6px 6px 0; font-weight: 700; }
    body.dark .post-body blockquote.pull { background: rgba(108,182,245,0.09); border-left-color: #6cb6f5; }
    .eq.eq-text { font-weight: 700; font-family: inherit; }
    dl.doings { margin: 1em 0 1.3em; display: grid; grid-template-columns: max-content 1fr; gap: 0.45em 1em; }
    dl.doings dt { font-weight: 700; letter-spacing: 0.03em; }
    dl.doings dd { margin: 0; }
    @media (max-width: 520px) { dl.doings { grid-template-columns: 1fr; gap: 0.1em; } dl.doings dd { margin-bottom: 0.6em; } }
    ol.road { margin: 0.8em 0 1.3em; }
    ol.road li { margin: 0 0 0.35em; }
    ol.road li b { display: inline-block; min-width: 9.5em; }
    .post-body table.op-table td:first-child, .post-body table.op-table th:first-child { width: 50%; font-weight: 400; }
    .post-body figure.fig-hero img { max-width: 560px; }
"""

def sub1(pattern, repl, text, flags=re.S):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n != 1:
        raise SystemExit(f"template drift: {pattern!r} matched {n}x")
    return new

def build():
    T = open(TEMPLATE, encoding="utf-8").read()
    content = open(os.path.join(SRC, "content.html"), encoding="utf-8").read().rstrip() + "\n"

    meta = f"""<meta name="description" content="{esc(DESC)}">
  <meta name="author" content="MES">
  <link rel="canonical" href="https://mes.fm/{SLUG}" />
  <!-- OG-TAGS:START -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="MES Truth">
  <meta property="og:url" content="https://mes.fm/{SLUG}">
  <meta property="og:title" content="{esc(TITLE)}">
  <meta property="og:description" content="{esc(DESC)}">
  <meta property="og:image" content="{OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@MathEasySolns">
  <meta name="twitter:title" content="{esc(TITLE)}">
  <meta name="twitter:description" content="{esc(DESC)}">
  <meta name="twitter:image" content="{OG_IMAGE}">
  <!-- OG-TAGS:END -->"""
    T = sub1(r'<meta name="description".*?<!-- OG-TAGS:END -->', meta, T)
    T = sub1(r"<title>.*?</title>", f"<title>{esc(TITLE)} | Math Easy Solutions</title>", T)

    # CSS after the physics report's own block (same <style>), so these rules win ties
    i = T.index("/* ---- Nancy Hutchison physics report")
    j = T.index("</style>", i)
    T = T[:j] + CSS + T[j:]

    sub = ' class="toc-sub"'
    links = "\n".join(f'      <a{sub if lvl else ""} href="#{i}">{esc(t)}</a>' for i, t, lvl in TOC)
    T = sub1(r'(?<=Collapse All</button>\n    </div>\n).*?(?=\n  </nav>)', links, T)
    T = sub1(r'(?<=<nav class="toc-links" aria-label="Table of contents">\n).*?(?=\n      </nav>)', links, T)

    T = sub1(r'<div class="part-of">.*?</div>',
             '<div class="part-of">Part of <a href="https://mes.fm/hutchison">MES Hutchison Effect</a> &middot; '
             '<a href="https://mes.fm/nancy">Nancy Hutchison</a></div>', T)
    T = sub1(r"<h1>.*?</h1>", f"<h1>{esc(TITLE)}</h1>", T)
    T = sub1(r'<div class="page-subtitle">.*?</div>', f'<div class="page-subtitle">{esc(SUBTITLE)}</div>', T)
    T = sub1(r'<div class="byline">.*?</div>',
             '<div class="byline">Conversation transcript prepared for John Hutchison by Nancy Hutchison &middot; October 2026 &middot; '
             f'<a href="{PDF_URL}" target="_blank" rel="noopener">Download the PDF</a></div>', T)
    T = sub1(r'(?<=toggleAllChapters\(\)">Collapse All</button>\n</div>\n).*?(?=    </div>\n    <!-- FASTCOMMENTS-BLOCK)', content, T)
    T = sub1(r'<div class="source-note">.*?</div>',
             '<div class="source-note">Conversation excerpt prepared for John Hutchison, <i>TURN, RETURN, and the Operator Differential</i> '
             '(October 2026). Converted from the original PDF to a web article with the equations typeset in LaTeX; the wording is unchanged. '
             f'<a href="{PDF_URL}" target="_blank" rel="noopener">Download the PDF &rarr;</a> &middot; '
             '<a href="https://mes.fm/nancy">More from Nancy Hutchison &rarr;</a></div>', T)

    left = [s for s in ("physics-system", "Physics of the System", "hutchison-articles") if s in T]
    if left:
        raise SystemExit(f"leftover template text: {left}")
    return T

if __name__ == "__main__":
    out = build()
    apply = "--apply" in sys.argv
    print(f"{len(out)} bytes -> {os.path.relpath(OUT, ROOT)}" + ("" if apply else "   (dry run; pass --apply to write)"))
    if apply:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(out)
