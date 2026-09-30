#!/usr/bin/env python3
"""Builds mes.fm/hutchison-nancy-physics-system/index.html -- Nancy Hutchison's report "John Hutchison and
the Physics of the System" (Final Draft 7, Sept 2026) as an article with Jump-to sidebar, collapsible
chapters and MathJax equations.

The shell is a copy of mes.fm/vector-functions-problems-plus/index.html (the long-article layout with the
"Jump to" sidebar, Collapse All and per-chapter folds) re-branded MES Hutchison Effect like
mes.fm/hutchison-cancer-treatment. The body comes from nancy_physics_src/content.html + toc.json, which
nancy_physics_src/pdf_to_content.py generates from the PDF (equations: nancy_physics_src/equations.py).

    python3 build_nancy_physics_article.py            # dry run: report only
    python3 build_nancy_physics_article.py --apply    # write the page

Never hand-edit the generated index.html; edit the sources and re-run. After a run, also re-run
build_sitemap.py, build_search_index.py (and `npm run build` in mes.fm/hutchison if the card changed)."""
import json, os, re, sys, html

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
SRC = os.path.join(ROOT, "nancy_physics_src")
SLUG = "hutchison-nancy-physics-system"
OUT = os.path.join(MES, SLUG, "index.html")
TEMPLATE = os.path.join(MES, "vector-functions-problems-plus", "index.html")

TITLE = "John Hutchison and the Physics of the System"
DESC = ("Nancy Hutchison's report comparing John Hutchison's reflective RF, interferometer and high-voltage "
        "apparatus with the Project's physics of reflection, return and phase.")
OG_IMAGE = f"https://mes.fm/{SLUG}/img/physics-of-the-system.jpg"
esc = lambda t: html.escape(t, quote=True)

def sub1(pattern, repl, text, flags=re.S, count_ok=(1,)):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n not in count_ok:
        raise SystemExit(f"template drift: {pattern!r} matched {n}x")
    return new

CSS = r"""
    /* ---- Nancy Hutchison physics report (build_nancy_physics_article.py) ---- */
    .part-of { margin: 14px 0 0; padding: 0.55em 0.9em; border-radius: 6px; font-size: 0.9em; border: 1px solid rgba(128, 128, 128, 0.4); }
    .part-of a { font-weight: bold; }
    .page-subtitle { font-size: calc(1rem * var(--ts, 1)); opacity: 0.9; margin: 0 0 0.4em; font-style: italic; }
    .byline { font-size: calc(0.9rem * var(--ts, 1)); opacity: 0.85; margin: 0 0 1.2em; }
    .post-body .chapter-toggle-header { cursor: pointer; }
    /* Parts are the top-level folds; sections inside them are the sub-folds that Jump to lists */
    .chapter-toggle { scroll-margin-top: 70px; }
    .post-body h3 { scroll-margin-top: 70px; }
    .part-sub { font-style: italic; text-align: center; opacity: 0.85; margin: -0.2em 0 1.2em; }
    .post-body h3 { margin: 1.9em 0 0.3em; padding-bottom: 0.2em; border-bottom: 1px solid rgba(128,128,128,0.35); }
    .post-body h4.tag-heading { font-size: 0.82em; letter-spacing: 0.04em; text-transform: uppercase; margin: 1.6em 0 0.5em; padding: 0.3em 0.7em; border-left: 4px solid #277bb6; background: rgba(39,123,182,0.10); border-radius: 0 4px 4px 0; }
    .tag { display: inline-block; font-size: 0.68em; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.2em 0.65em; margin: 0.3em 0 0.5em; border-radius: 999px; background: rgba(39,123,182,0.14); border: 1px solid rgba(39,123,182,0.4); }
    body.dark .tag { background: rgba(108,182,245,0.14); border-color: rgba(108,182,245,0.45); }
    .lead { font-weight: 700; }
    .post-body li > a, .xref-list a { text-decoration: none; }
    .xref-list { columns: 1; list-style: none; padding-left: 0.3em; }
    .xref-list li { margin: 0 0 0.3em; }
    .xref-list a::before { content: "\2192\00a0"; opacity: 0.6; }
    .post-body ul.doc-list { margin: 0.6em 0 1.2em; }
    /* callouts (the PDF's shaded boxes) */
    .callout { margin: 1.3em 0; padding: 0.9em 1.15em 0.4em; border-radius: 6px; border-left: 5px solid #277bb6; background: rgba(39,123,182,0.09); }
    .callout.callout-key { border-left-color: #3f8f4e; background: rgba(63,143,78,0.10); }
    body.dark .callout { background: rgba(108,182,245,0.09); }
    body.dark .callout.callout-key { background: rgba(120,200,140,0.10); border-left-color: #62b574; }
    .callout-title { font-weight: 700; font-size: calc(0.92rem * var(--ts, 1)); margin-bottom: 0.45em; letter-spacing: 0.01em; }
    /* display equations */
    .eq { margin: 1.1em 0; padding: 0.55em 0.8em; overflow-x: auto; overflow-y: hidden; text-align: center; font-size: calc(1.05rem * var(--ts, 1));
          border-radius: 6px; background: rgba(128,128,128,0.08); border: 1px solid rgba(128,128,128,0.22); }
    .eq mjx-container { margin: 0 !important; }
    .eq.eq-not { border-color: rgba(200,60,60,0.55); background: rgba(200,60,60,0.07); position: relative; }
    .eq.eq-not::after { content: "\2717 not to be written"; position: absolute; top: 2px; right: 8px; font-size: 0.6em; color: #c03c3c; font-family: Arial, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
    .callout .eq { background: rgba(255,255,255,0.45); }
    body.dark .callout .eq { background: rgba(0,0,0,0.25); }
    /* tables */
    .table-wrap { overflow-x: auto; margin: 1.3em 0; }
    .post-body table.doc-table { width: 100%; margin: 0; font-size: 0.92em; }
    .post-body table.doc-table :is(th, td) { vertical-align: top; text-align: left; border-color: rgba(128,128,128,0.4); padding: 7px 10px; }
    .post-body table.doc-table thead th { background: rgba(39,123,182,0.16); font-weight: 700; }
    .post-body table.doc-table tbody tr:nth-child(even) td { background: rgba(128,128,128,0.06); }
    .post-body table.doc-table td:first-child { font-weight: 700; white-space: nowrap; }
    /* figures */
    .post-body figure.fig { margin: 1.4em 0; }
    .post-body figure.fig img { display: block; width: 100%; margin: 0 auto; border-radius: 6px; }
    .post-body figure.fig figcaption { font-size: 0.85em; opacity: 0.85; text-align: center; margin-top: 0.5em; font-style: italic; }
    .source-note { font-size: 0.85em; opacity: 0.85; margin: 1em 0; }
    @media (max-width: 600px) {
      .eq { padding: 0.45em 0.4em; }
      .callout { padding-left: 0.85em; padding-right: 0.85em; }
      .post-body table.doc-table td:first-child { white-space: normal; }
    }
"""

MATHJAX = """
  <script>
    window.MathJax = {
      tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']], processEscapes: true },
      options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] },
      chtml: { displayOverflow: 'linebreak', linebreaks: { inline: true } }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js"></script>
"""

def build():
    T = open(TEMPLATE, encoding="utf-8").read()
    data = json.load(open(os.path.join(SRC, "toc.json"), encoding="utf-8"))
    content = open(os.path.join(SRC, "content.html"), encoding="utf-8").read()
    toc = data["toc"]

    # ---- head: meta, title
    meta = f"""  <meta name="description" content="{esc(DESC)}">
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
  <!-- OG-TAGS:END -->
"""
    T = sub1(r'  <meta name="description".*?(?=  <link rel="icon")', meta, T)
    T = sub1(r"<title>.*?</title>", f"<title>{esc(TITLE)} | Math Easy Solutions</title>", T)

    # ---- CSS + MathJax
    T = sub1(r"</style>", CSS + "</style>", T)
    T = sub1(r"</head>", MATHJAX + "</head>", T)

    # ---- Hutchison branding (same strings mes.fm/hutchison-cancer-treatment carries)
    T = sub1(r'<a href="/math" tabindex="-1"><img class="compact-nav-logo"[^>]*></a>\s*<a class="compact-nav-title" href="/math" tabindex="-1">MES Math Tutorials</a>',
             '<a href="/hutchison" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/hutchison-logo.jpg"></a>\n'
             '  <a class="compact-nav-title" href="/hutchison" tabindex="-1">MES Hutchison Effect</a>', T)
    T = sub1(r'(<ul class="compact-nav-links">\s*)(<li><a href="/calculators")',
             '<ul class="compact-nav-links">\n    <li><a href="/math" tabindex="-1">Math Tutorials</a></li>\n    <li><a href="/calculators"', T)
    T = sub1(r'<a class="site-brand-logo-link" href="/math">.*?</p></div>',
             '<a class="site-brand-logo-link" href="/hutchison"><img class="site-brand-logo" src="/img/hutchison-logo.jpg" width="88" height="88" alt="MES Hutchison Effect logo"></a>\n'
             '        <div class="site-brand-text"><a class="site-brand-title" href="/hutchison">MES Hutchison Effect</a>'
             '<p class="site-brand-tag">Antigravity, materials transmutation, and John Hutchison\'s demonstrations.</p></div>', T)
    T = sub1(r'(<a class="navbar__link navbar__link--first" href="/">Home</a></li>\s*)',
             '<a class="navbar__link navbar__link--first" href="/">Home</a></li>\n        <li class="navbar__item"><a target="_self" class="navbar__link" href="/hutchison">Hutchison Effect</a></li>\n        ', T)
    T = sub1(r'<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="https://mes.fm/math">Math Tutorials</a></li>',
             '<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="/hutchison">Hutchison Effect</a></li>', T)

    # ---- Jump-to (sidebar + mobile)
    links = "\n".join(f'      <a{" class=\"toc-sub\"" if e["level"] else ""} href="#{e["id"]}">{esc(e["title"])}</a>' for e in toc)
    T = re.sub(r'(<nav class="toc-sidebar".*?Collapse All</button>\n    </div>\n)(.*?)(\n  </nav>)', lambda m: m.group(1) + links + m.group(3), T, count=1, flags=re.S)
    T = re.sub(r'(<nav class="toc-links" aria-label="Table of contents">\n)(.*?)(\n      </nav>)', lambda m: m.group(1) + links + m.group(3), T, count=1, flags=re.S)

    # ---- title block + body
    head = f"""    <div class="part-of">Part of <a href="https://mes.fm/hutchison">MES Hutchison Effect</a> &middot; <a href="https://mes.fm/articles">Articles</a></div>

    <h1>{esc(TITLE)}</h1>
    <div class="page-subtitle">{esc(data["tagline"])}</div>
    <div class="byline">Report by Nancy Hutchison &middot; Final Draft 7 &middot; September 2026</div>

    <details class="toc-mobile">
      <summary>Jump to section</summary>
      <nav class="toc-links" aria-label="Table of contents">
{links}
      </nav>
    </details>

    <hr>

    <div class="post-body">
<div class="chapters-toolbar">
<button id="toggleAllChaptersBtn" class="theme-toggle-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>
</div>
{content}
    </div>
"""
    T = sub1(r'    <h1>Vector Functions: Problems Plus</h1>.*?(?=    <!-- FASTCOMMENTS-BLOCK)', head, T)
    T = sub1(r'    <hr>\n\n    <a class="source-link".*?</div>\n(?=    <div id="footer")',
             '    <hr>\n\n    <div class="source-note">Report by Nancy Hutchison, <i>John Hutchison and the Physics of the System</i> '
             '(Final Draft 7, September 2026). Converted from the original PDF to a web article with the equations typeset '
             'in LaTeX; the wording is unchanged. <a href="https://mes.fm/hutchison">More on the Hutchison Effect &rarr;</a></div>\n', T)

    # ---- drop the video/playlist machinery this page doesn't use
    T = sub1(r'  <script>\s*// playlist-view-toggle.*?</script>\n\n', "", T)
    T = sub1(r'  <script>\s*// view-mode:.*?</script>\n\n', "", T)
    T = sub1(r'  <script>\s*// auto-hide-controls:.*?</script>\n\n', "", T)
    T = sub1(r'  <script src="https://cdn\.jsdelivr\.net/npm/hls\.js@1/dist/hls\.min\.js"></script>\n  <script>\s*// speak-video-hls:.*?</script>\n\n', "", T)
    # Jump-to / in-page links must also unfold a collapsed chapter
    T = sub1(r"'\.toc-sidebar a, \.toc-mobile a'", "'.toc-sidebar a, .toc-mobile a, .post-body a[href^=\"#\"]'", T)
    # Jumping to a folded section should open the section itself too, not just its ancestors
    T = sub1(r"      let list;\n      while \(target && \(list = target\.closest\('\.chapter-toggle-list'\)\)\) \{",
             "      let list;\n"
             "      const own = target && target.classList.contains('chapter-toggle') ? document.getElementById(target.id + '-list') : null;\n"
             "      if (own && own.classList.contains('hidden')) {\n"
             "        own.classList.remove('hidden');\n"
             "        const ownArrow = document.getElementById('arrowIcon-' + own.id);\n"
             "        if (ownArrow) ownArrow.textContent = '\u25b2';\n"
             "      }\n"
             "      while (target && (list = target.closest('.chapter-toggle-list'))) {", T)
    return T

if __name__ == "__main__":
    out = build()
    apply = "--apply" in sys.argv
    print(f"{len(out)} bytes -> {os.path.relpath(OUT, ROOT)}" + ("" if apply else "   (dry run; pass --apply to write)"))
    if apply:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(out)
