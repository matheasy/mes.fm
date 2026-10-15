#!/usr/bin/env python3
"""Make a mes.fm page that hosts a PDF: the standard branded page shell (hive_mirror_template.html), an inline PDF viewer, a Download button and an optional alternative-download link.
Used for mes.fm/em-304-problem-1-judy-wood. Copies the PDF from ~/Downloads (or --pdf) into mes.fm/<slug>/<pdf-name>, then writes mes.fm/<slug>/index.html.
  python3 build_pdf_page.py --apply          (the page definitions are in PAGES below; add one to host another PDF)
Dry-runs by default."""
import argparse, html, os, shutil, sys
from pathlib import Path
R = Path(__file__).resolve().parent; SITE = R / "mes.fm"
PAGES = {
    "em-304-problem-1-judy-wood": dict(
        title="Space Shuttle Columbia Disaster Test Problem by Dr. Judy Wood",
        subtitle="EM 304, Clemson University &middot; test given February 6, 2003",
        desc="The EM 304 test problem on the Space Shuttle Columbia disaster that Dr. Judy Wood set at Clemson University on February 6, 2003, five days after Columbia was lost on February 1, 2003. Read the PDF here or download it.",
        pdf="space-shuttle-columbia-test-problem-judy-wood.pdf", pdf_label="Space Shuttle Columbia test problem (PDF)",
        alt_url="https://1drv.ms/b/c/88862ef47bcaf6cd/IQAQX2EbxWr_RbAMFBCkcW8uAUIElk-X46QL_S4JXPuLDj0?e=R0Arkl", alt_label="Alternative download (OneDrive)",
        partof='Part of <a href="/science">MES Science</a>',
        intro="""<p>This is the test problem on the <b>Space Shuttle Columbia disaster</b> that <b>Dr. Judy Wood</b> gave her students in <b>EM 304 at Clemson University</b> on <b>February 6, 2003</b>, just five days after Columbia was lost on <b>February 1, 2003</b>.</p>
<p>The PDF (6 pages, starting with the EM 304 Test #1 cover page) is shown below. You can also download it, or use the alternative OneDrive link if you prefer.</p>""",
        og="preview.jpg", noindex=True,   # not linked from anywhere yet (it will go into a math tutorial): keep it out of the sitemap and the site search; remove this when it is linked
        outro="""<h2>About this page</h2>
<p>Space Shuttle Columbia (mission STS-107) broke apart during re-entry on February 1, 2003, and all seven crew members were lost. For the background, see the <a href="https://en.wikipedia.org/wiki/Space_Shuttle_Columbia_disaster" target="_blank" rel="noopener">Wikipedia article on the Space Shuttle Columbia disaster</a>.</p>
<p>The test was set for the course EM 304 at Clemson University, which Dr. Wood taught.</p>"""),
}
CSS = """    .pdf-actions { display: flex; flex-wrap: wrap; gap: 0.6em; margin: 1em 0; }
    .pdf-btn { display: inline-block; padding: 0.7em 1.2em; border-radius: 8px; font-weight: 700; text-decoration: none; border: 2px solid #1a73e8; background: #1a73e8; color: #fff !important; }
    .pdf-btn.alt { background: transparent; color: #1a73e8 !important; }
    body.dark .pdf-btn.alt { color: #8ab4f8 !important; border-color: #8ab4f8; }
    .pdf-wrap { margin: 1em 0 1.4em; border: 1px solid rgba(128,128,128,0.4); border-radius: 8px; overflow: hidden; background: #fff; }
    .pdf-frame { display: block; width: 100%; height: 85vh; min-height: 480px; border: 0; }
    .pdf-fallback { padding: 2em 1em; text-align: center; color: #333; }
    @media (max-width: 700px) { .pdf-frame { height: 70vh; } }
"""
def build(slug, cfg):
    t = (R / "hive_mirror_template.html").read_text(encoding="utf-8")
    t = t.replace("@@VIDEO_SCRIPTS@@", "")
    t = t.replace("</style>", CSS + "</style>", 1)
    pdf = "/%s/%s" % (slug, cfg["pdf"])
    art = cfg["intro"] + '\n<div class="pdf-actions"><a class="pdf-btn" href="%s" download>Download the PDF</a>%s<a class="pdf-btn alt" href="%s" target="_blank" rel="noopener">Open it full screen</a></div>\n' % (
        pdf, ('<a class="pdf-btn alt" href="%s" target="_blank" rel="noopener">%s</a>' % (cfg["alt_url"], html.escape(cfg["alt_label"]))) if cfg.get("alt_url") else "", pdf)
    art += '<div class="pdf-wrap"><object class="pdf-frame" data="%s#view=FitH" type="application/pdf" aria-label="%s"><div class="pdf-fallback"><p>Your browser cannot show a PDF inside the page.</p><p><a class="pdf-btn" href="%s">Open the PDF</a></p></div></object></div>\n' % (pdf, html.escape(cfg["pdf_label"]), pdf)
    art += cfg["outro"]
    if cfg.get("noindex"): t = t.replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n  <link rel="canonical"', 1)
    for k, v in {"@@SLUG@@": slug, "@@TITLE@@": html.escape(cfg["title"], quote=False), "@@SUBTITLE@@": cfg["subtitle"], "@@DESC@@": html.escape(cfg["desc"]),
                 "@@OGIMAGE@@": ("https://mes.fm/%s/%s" % (slug, cfg["og"])) if cfg.get("og") else "https://mes.fm/img/logo-mark.png", "@@PARTOF@@": cfg["partof"],
                 "@@BRAND_HREF@@": "/", "@@BRAND_LOGO@@": "/img/logo-mark.png", "@@BRAND_LOGO_ABS@@": "https://mes.fm/img/logo-mark.png", "@@BRAND_TITLE@@": "MES.fm",
                 "@@BRAND_TAG@@": "Videos, tutorials, calculators and research by Math Easy Solutions.", "@@COMPACT_MATH_LINK@@": '<li><a href="/math" tabindex="-1">Math Tutorials</a></li>', "@@ARTICLE@@": art}.items():
        t = t.replace(k, v)
    assert "@@" not in t, "unfilled token"
    return t
ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); ap.add_argument("--pdf", help="path of the PDF to copy in (default: ~/Downloads/<name>)"); ap.add_argument("--only")
a = ap.parse_args()
for slug, cfg in PAGES.items():
    if a.only and a.only != slug: continue
    d = SITE / slug; src = Path(a.pdf) if a.pdf else Path.home() / "Downloads" / cfg["pdf"]; dst = d / cfg["pdf"]
    print(slug, "-> pdf", "present" if dst.exists() else ("will copy from %s" % src if src.exists() else "MISSING (put it at %s)" % src))
    if a.apply:
        d.mkdir(exist_ok=True)
        if src.exists() and not dst.exists(): shutil.copy(src, dst); print("  copied", dst.stat().st_size, "bytes")
        (d / "index.html").write_text(build(slug, cfg), encoding="utf-8"); print("  wrote", d / "index.html")
if not a.apply: print("dry run (use --apply)")
