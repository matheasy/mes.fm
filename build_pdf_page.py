#!/usr/bin/env python3
"""Make a mes.fm page that hosts a PDF: the standard branded page shell (hive_mirror_template.html), an inline PDF viewer, a Download button and an optional alternative-download link.
Used for mes.fm/em-304-problem-1-judy-wood, mes.fm/space-shuttle-columbia-pdf and Andrew Johnson's two 9/11 books (mes.fm/911-finding-truth-pdf, 911-holding-truth-pdf).
Copies the PDF from ~/Downloads (or the page's own `src`, or --pdf) into mes.fm/<slug>/<pdf-name>, then writes mes.fm/<slug>/index.html.
  python3 build_pdf_page.py --apply          (the page definitions are in PAGES below; add one to host another PDF)
Per-page options: `brand="911"` (a key of convert_mirror_pages.BRANDS without the slash: that hub's logo / title / tab instead of
MES.fm), `src` (where the PDF comes from), `meta` (Title / Author / Subject / Keywords written into the copied PDF, with
DisplayDocTitle, so a browser's PDF viewer shows a real title: needs pymupdf (`pip install pymupdf`) when the PDF is copied in;
CHECK every hosted PDF's metadata before publishing), `og_abs` (absolute og:image URL), `sidebar=False`.
Dry-runs by default."""
import argparse, html, os, shutil, sys
from pathlib import Path
R = Path(__file__).resolve().parent; SITE = R / "mes.fm"
PAGES = {
    "em-304-problem-1-judy-wood": dict(
        title="Space Shuttle Columbia Disaster Test Problem by Dr. Judy Wood",
        subtitle="EM 304 (Engineering Mechanics), Clemson University &middot; test given February 6, 2003",
        desc="The EM 304 test problem on the Space Shuttle Columbia disaster that Dr. Judy Wood set at Clemson University on February 6, 2003, five days after Columbia was lost on February 1, 2003. Read the PDF here or download it.",
        pdf="space-shuttle-columbia-test-problem-judy-wood.pdf", pdf_label="Space Shuttle Columbia test problem (PDF)",
        alt_url="https://1drv.ms/b/c/88862ef47bcaf6cd/IQAQX2EbxWr_RbAMFBCkcW8uAUIElk-X46QL_S4JXPuLDj0?e=R0Arkl", alt_label="Alternative download (OneDrive)",
        partof='Part of <a href="/math">MES Math</a> &middot; <a href="/space-shuttle-columbia">Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster</a>',
        intro="""<p>This is the test problem on the <b>Space Shuttle Columbia disaster</b> that <b>Dr. Judy Wood</b> gave her students in <b>EM 304 at Clemson University</b> (EM stands for <b>Engineering Mechanics</b>, the mechanics of engineering structures and machines: forces, equilibrium, stresses and motion) on <b>February 6, 2003</b>, just five days after Columbia was lost on <b>February 1, 2003</b>.</p>
<p>Dr. Wood's problem is solved step by step, with the video, at <a href="/space-shuttle-columbia"><b>mes.fm/space-shuttle-columbia</b></a>. The PDF (6 pages, starting with the EM 304 Test #1 cover page) is shown below. You can also download it, or use the alternative OneDrive link if you prefer.</p>""",
        og="preview.jpg",   # indexable (sitemap, Google, site search) but not linked from other pages yet: add_sidebar_math.UNLINKED keeps it out of the sidebar cards until the user links it from a math tutorial
        outro="""<h2>About this page</h2>
<p>Space Shuttle Columbia (mission STS-107) broke apart during re-entry on February 1, 2003, and all seven crew members were lost. For the background, see the <a href="https://en.wikipedia.org/wiki/Space_Shuttle_Columbia_disaster" target="_blank" rel="noopener">Wikipedia article on the Space Shuttle Columbia disaster</a>.</p>
<p>The test was set for the course EM 304 at Clemson University, which Dr. Wood taught. <b>EM</b> is the course prefix for <b>Engineering Mechanics</b>: the applied mechanics that engineers use to analyse structures, machines and materials under load. The cover page of the test reminds students to draw free-body diagrams and show their equilibrium equations.</p>"""),
    "space-shuttle-columbia-pdf": dict(
        title="Space Shuttle Columbia Exam Problem: Notes (PDF)",
        subtitle="Notes for the EM 304 exam problem by Dr. Judy Wood &middot; 36 pages &middot; free PDF",
        desc="Read or download the PDF notes for MES's video on Dr. Judy Wood's EM 304 exam problem (February 6, 2003) on the Space Shuttle Columbia disaster: thermal stress in the wing tube, the solution and the CAIB findings.",
        pdf="space-shuttle-columbia-notes-mes.pdf", pdf_label="Space Shuttle Columbia exam problem notes (PDF)",
        src=Path.home() / "Library/CloudStorage/OneDrive-Personal/MathEasySolutions/YouTube/Video Files/1060 Space Shuttle Columbia/Space Shuttle Columbia.pdf",
        meta=dict(title="Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster (notes)", author="MES (Math Easy Solutions)",
                  subject="Notes for the MES video on the EM 304 test problem Dr. Judy Wood set at Clemson University on February 6, 2003, on the Space Shuttle Columbia disaster",
                  keywords="Space Shuttle Columbia, Dr. Judy Wood, EM 304, thermal expansion, mechanics of materials, CAIB", creator="Microsoft OneNote (published on mes.fm)"),
        alt_url="https://1drv.ms/b/c/88862ef47bcaf6cd/IQCO44JbFMHoSq-0IV9jIx7EAekmcSOuZB4jUhNL6RgYx58", alt_label="Alternative download (OneDrive)",
        partof='Part of <a href="/math">MES Math</a> &middot; <a href="/space-shuttle-columbia">Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster</a>',
        og_abs="https://mes.fm/space-shuttle-columbia/img/share.jpg",
        intro="""<p>These are the notes for the MES video <a href="/space-shuttle-columbia"><b>Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster</b></a>, as a PDF: the EM 304 test problem Dr. Judy Wood set at Clemson University on February 6, 2003, the review of mechanics of materials, the full solution, and the Columbia Accident Investigation Board's findings.</p>
<p><b>Prefer a web page?</b> The same notes, with the video, are at <a href="/space-shuttle-columbia"><b>mes.fm/space-shuttle-columbia</b></a>. The PDF (36 pages) is shown below; you can also download it, or use the OneDrive link.</p>""",
        outro="""<h2>About these notes</h2>
<p>Dr. Judy Wood's original test is on its own page: <a href="/em-304-problem-1-judy-wood">mes.fm/em-304-problem-1-judy-wood</a>. Try the numbers yourself with the <a href="/materials">MES Mechanics of Materials calculators</a> (thermal stress, Young's modulus, shear).</p>"""),
}
AJ_CREDIT = """<h2>About this book</h2>
<p><b>Andrew Johnson</b> has kept the evidence of what happened to the World Trade Center on 9/11 in front of people for two decades, centred on the research of <b>Dr. Judy Wood</b>. He gave MES permission to publish both of his 9/11 books on mes.fm. The PDF is the author's own free edition, as published on his website <a href="https://www.checktheevidence.com/" target="_blank" rel="noopener">checktheevidence.com</a>; the text is &copy; Andrew Johnson and the cover graphic &copy; Nick Buchanan.</p>"""
AJ_PARTOF = 'Part of <a href="/911">MES 9/11 Truth</a> &middot; <a href="/911-andrew-johnson-books">Andrew Johnson\'s 9/11 Books</a>'
PAGES.update({
    "911-finding-truth-pdf": dict(
        title="9/11 Finding the Truth by Andrew Johnson (PDF)",
        subtitle="Andrew Johnson &middot; 3rd edition, July 2011 &middot; 372 pages &middot; free PDF",
        desc="Read or download the free PDF of 9/11 Finding the Truth (2011, 3rd edition), Andrew Johnson's book on the evidence compiled by Dr. Judy Wood.",
        pdf="9-11-finding-the-truth-andrew-johnson.pdf", pdf_label="9/11 Finding the Truth by Andrew Johnson (PDF)",
        src=Path.home() / "Library/CloudStorage/OneDrive-Personal/MathEasySolutions/YouTube/Video Files/MES 911Truth/Other Uploads/Andrew Johnson/911 finding and holding the truth/9-11 - Finding the Truth.pdf",
        meta=dict(title="9/11 Finding the Truth", author="Andrew Johnson", subject="A compilation of articles by Andrew Johnson, focused around the research and evidence compiled by Dr. Judy Wood (3rd edition, July 2011)",
                  keywords="9/11, World Trade Center, Dr. Judy Wood, Andrew Johnson, directed energy, Hurricane Erin"),
        alt_url="http://www.checktheevidence.co.uk/pdf/9-11%20-%20Finding%20the%20Truth.pdf", alt_label="Download from checktheevidence.com",
        brand="911", partof=AJ_PARTOF, og_abs="https://mes.fm/911-finding-truth/img/og.jpg",
        intro="""<p><b>9/11 Finding the Truth</b> is Andrew Johnson's first 9/11 book: a compilation of his articles from 2006 to 2011, focused around the research and evidence compiled by Dr. Judy Wood, and his account of how the 9/11 &ldquo;truth&rdquo; movement steered people away from that evidence.</p>
<p><b>Prefer a web page?</b> The whole book is also on mes.fm as one article with a chapter list and folding chapters: <a href="/911-finding-truth"><b>read 9/11 Finding the Truth online</b></a>. The PDF (372 pages) is shown below.</p>""",
        outro=AJ_CREDIT + """
<p>More formats (Kindle, EPUB, audio book, paperback) are listed on <a href="/911-finding-truth#get-the-book">the online edition's Get the book box</a> and on the author's <a href="https://www.checktheevidence.com/wordpress/2009/06/15/9-11-finding-the-truth-free-download-book/" target="_blank" rel="noopener">book page</a>. The sequel is <a href="/911-holding-truth-pdf">9/11 Holding the Truth (PDF)</a>.</p>"""),
    "911-holding-truth-pdf": dict(
        title="9/11 Holding the Truth by Andrew Johnson (PDF)",
        subtitle="Andrew Johnson &middot; 2017 &middot; 247 pages &middot; free PDF",
        desc="Read or download the free PDF of 9/11 Holding the Truth (2017), Andrew Johnson's sequel to 9/11 Finding the Truth, on Dr. Judy Wood's 9/11 evidence.",
        pdf="9-11-holding-the-truth-andrew-johnson.pdf", pdf_label="9/11 Holding the Truth by Andrew Johnson (PDF)",
        src=Path.home() / "Library/CloudStorage/OneDrive-Personal/MathEasySolutions/YouTube/Video Files/MES 911Truth/Other Uploads/Andrew Johnson/911 finding and holding the truth/911 Holding The Truth -Andrew Johnson - 2017.pdf",
        meta=dict(title="9/11 Holding the Truth", author="Andrew Johnson", subject="A compilation of notes, commentary and articles by Andrew Johnson, focused around the 9/11 research and evidence compiled by Dr. Judy Wood (2017)",
                  keywords="9/11, World Trade Center, Dr. Judy Wood, Andrew Johnson, directed energy, 9/11 truth movement"),
        alt_url="http://www.checktheevidence.com/pdf/911%20Holding%20The%20Truth%20-Andrew%20Johnson%20-%202017.pdf", alt_label="Download from checktheevidence.com",
        brand="911", partof=AJ_PARTOF, og_abs="https://mes.fm/911-holding-truth/img/og.jpg",
        intro="""<p><b>9/11 Holding the Truth</b> (2017) is the sequel to <a href="/911-finding-truth">9/11 Finding the Truth</a>: Andrew Johnson's notes, commentary and articles on what it took to hold on to the truth about the destruction of the World Trade Center once it had been found.</p>
<p><b>Prefer a web page?</b> The whole book is also on mes.fm as one article with a chapter list and folding chapters: <a href="/911-holding-truth"><b>read 9/11 Holding the Truth online</b></a>. The PDF (247 pages) is shown below.</p>""",
        outro=AJ_CREDIT + """
<p>More formats (Kindle, EPUB, audio book, paperback) are listed on <a href="/911-holding-truth#get-the-book">the online edition's Get the book box</a> and on the author's <a href="https://www.checktheevidence.com/wordpress/2017/11/20/9-11-holding-the-truth/" target="_blank" rel="noopener">book page</a>. The first book is <a href="/911-finding-truth-pdf">9/11 Finding the Truth (PDF)</a>.</p>"""),
})
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
    br = dict(href="/", logo="/img/logo-mark.png", title="MES.fm", tag="Videos, tutorials, calculators and research by Math Easy Solutions.")
    if cfg.get("brand"):
        sys.path.insert(0, str(R)); import convert_mirror_pages as cmp
        br = cmp.BRANDS["/" + cfg["brand"]]
    og = cfg.get("og_abs") or (("https://mes.fm/%s/%s" % (slug, cfg["og"])) if cfg.get("og") else "https://mes.fm/img/logo-mark.png")
    for k, v in {"@@SLUG@@": slug, "@@TITLE@@": html.escape(cfg["title"], quote=False), "@@SUBTITLE@@": cfg["subtitle"], "@@DESC@@": html.escape(cfg["desc"]),
                 "@@OGIMAGE@@": og, "@@PARTOF@@": cfg["partof"],
                 "@@BRAND_HREF@@": br["href"], "@@BRAND_LOGO@@": br["logo"], "@@BRAND_LOGO_ABS@@": "https://mes.fm" + br["logo"], "@@BRAND_TITLE@@": br["title"],
                 "@@BRAND_TAG@@": br["tag"], "@@COMPACT_MATH_LINK@@": '<li><a href="/math" tabindex="-1">Math Tutorials</a></li>', "@@ARTICLE@@": art}.items():
        t = t.replace(k, v)
    assert "@@" not in t, "unfilled token"
    if cfg.get("brand"):
        t = cmp.brand_nav(t)
    return t
def copy_pdf(src, dst, meta):
    """copy the PDF in; with `meta`, rewrite its document info (Title / Author / ...) and ask viewers to show the title"""
    if not meta:
        shutil.copy(src, dst); return
    try:
        import fitz
    except ImportError:
        raise SystemExit("this page sets PDF metadata: run with a python that has pymupdf (pip install pymupdf)")
    d = fitz.open(src)
    d.set_metadata(dict(d.metadata or {}, title=meta["title"], author=meta["author"], subject=meta.get("subject", ""), keywords=meta.get("keywords", ""),
                        creator=meta.get("creator", "Microsoft Word (published on mes.fm with the author's permission)"), producer="mes.fm build_pdf_page.py"))
    d.xref_set_key(d.pdf_catalog(), "ViewerPreferences", "<</DisplayDocTitle true>>")
    d.save(str(dst), garbage=3, deflate=True)
    print("  metadata:", fitz.open(str(dst)).metadata.get("title"), "/", fitz.open(str(dst)).metadata.get("author"))
def sidebar(slug):
    """the usual 'More like this' sidebar + Standard / Wide / Theatre switch + bottom ad, for this one page only (add_sidebar_math.py / add_bottom_ad.py would rewrite ~190 others)"""
    sys.path.insert(0, str(R))
    import add_sidebar_math as m, add_bottom_ad as b, add_sidebar as base
    items, groups = m.catalog(); it = [x for x in items if x["url"] == "/" + slug]
    if not it: print("  (sidebar: page is not eligible)"); return
    it = it[0]; old = base.read(it["path"]); mm = base.SLOT_RE.search(old); slot = mm.group(1) if mm else base.DEFAULT_SLOT
    new = m.patch_page(old, m.aside_html(it["group"], m.recs_for(it, groups), slot), False)
    if new: new2, _ = b.patch(new, b.RESPONSIVE_SLOT, False, True, False); Path(it["path"]).write_text(new2 or new, encoding="utf-8"); print("  sidebar + bottom ad added")
ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); ap.add_argument("--pdf", help="path of the PDF to copy in (default: ~/Downloads/<name>)"); ap.add_argument("--only")
a = ap.parse_args()
for slug, cfg in PAGES.items():
    if a.only and a.only != slug: continue
    d = SITE / slug; src = Path(a.pdf) if a.pdf else Path(cfg["src"]) if cfg.get("src") else Path.home() / "Downloads" / cfg["pdf"]; dst = d / cfg["pdf"]
    print(slug, "-> pdf", "present" if dst.exists() else ("will copy from %s" % src if src.exists() else "MISSING (put it at %s)" % src))
    if a.apply:
        d.mkdir(exist_ok=True)
        if src.exists() and not dst.exists(): copy_pdf(src, dst, cfg.get("meta")); print("  copied", dst.stat().st_size, "bytes")
        (d / "index.html").write_text(build(slug, cfg), encoding="utf-8"); print("  wrote", d / "index.html")
        if cfg.get("sidebar", True): sidebar(slug)
if not a.apply: print("dry run (use --apply)")
