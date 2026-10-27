#!/usr/bin/env python3
"""Builds Andrew Johnson's two 9/11 books as one long article page each, in the MES 9/11 Truth brand:

    mes.fm/911-finding-truth    9/11 Finding the Truth (3rd edition, July 2011)
    mes.fm/911-holding-truth    9/11 Holding the Truth (2017)

Andrew Johnson gave MES permission to publish both books (2026-10). The hosted PDFs are mes.fm/911-finding-truth-pdf and
mes.fm/911-holding-truth-pdf (build_pdf_page.py), and both are listed on mes.fm/911-andrew-johnson-books (911/build.mjs).

The shell is a copy of mes.fm/vector-functions-problems-plus/index.html (Jump-to sidebar + mobile "Jump to section",
Collapse All, per-chapter folds, toc-flip Side / Hide / Standard | Wide | Theatre, lightbox, Comments), re-branded MES 9/11
Truth like the 9/11 mirror pages (convert_mirror_pages.BRANDS / brand_nav), the same way build_nancy_physics_article.py
does it. Every chapter is a top-level fold (h2.chapter-top), collapsed by default; the jump-aside rail ("More like this" +
ad, from 1500px) is switched on for these slugs in main_js/jump-aside.js (family 911).

The body comes from aj_books_src/<slug>/content.html + toc.json, which aj_books_src/pdf_to_content.py writes from the PDFs
(it also writes the pictures and img/cover-page.jpg). This script also makes, from cover-page.jpg (PIL):
img/og.jpg (1200x630, the cover fitted on a blurred copy of itself; og:image and the hub cards) and
mes.fm/img/911-andrew-johnson-books-icon.jpg (900x600, both covers; the tile on mes.fm/911).

    python3 build_aj_books.py            # dry run: report only
    python3 build_aj_books.py --apply    # write the two pages + images

Never hand-edit the generated pages; edit the sources / this script and re-run. After a run: build_sitemap.py,
build_search_index.py (and `npm run build` in mes.fm/911 if a card changed)."""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
TEMPLATE = os.path.join(MES, "vector-functions-problems-plus", "index.html")
sys.path.insert(0, ROOT)
import convert_mirror_pages as cmp  # noqa: E402  (BRANDS, brand_nav)

esc = lambda t: html.escape(t, quote=True)
CTE = "https://www.checktheevidence.com"

BOOKS = {
    "911-finding-truth": dict(
        title="9/11 Finding the Truth",
        year="2011", edition="3rd edition, July 2011", pages=372, isbn="9781548827618",
        tagline="A compilation of articles by Andrew Johnson, focused around the research and evidence compiled by Dr. Judy Wood",
        desc="Read Andrew Johnson's book 9/11 Finding the Truth (2011) free online: his articles on Dr. Judy Wood's 9/11 evidence and the cover-up that followed.",
        about="<p><b>9/11 Finding the Truth</b> is Andrew Johnson's first 9/11 book: his articles from 2006 to 2011, focused around the research "
              "and evidence compiled by Dr. Judy Wood &ndash; the dustified towers, the toasted cars, Hurricane Erin and the Hutchison Effect &ndash; "
              "and his first-hand account of how the 9/11 &ldquo;truth&rdquo; movement steered people away from that evidence. The sequel is "
              "<a href=\"/911-holding-truth\">9/11 Holding the Truth</a> (2017).</p>",
        links=[
            ("Read the PDF on mes.fm", "/911-finding-truth-pdf", True),
            ("Author's book page (all formats)", CTE + "/wordpress/2009/06/15/9-11-finding-the-truth-free-download-book/", False),
            ("Buy from the author", CTE + "/wordpress/product/9-11-finding-the-truth-by-andrew-johnson/", False),
            ("Amazon (paperback / Kindle)", "https://www.amazon.com/911-Finding-Truth-Andrew-Johnson/dp/1548827614/", False),
            ("Lulu paperback", "https://www.lulu.com/shop/andrew-johnson/9-11-finding-the-truth/paperback/product-16341476.html", False),
            ("Free PDF (author's site)", "http://www.checktheevidence.co.uk/pdf/9-11%20-%20Finding%20the%20Truth.pdf", False),
            ("Kindle file (.mobi)", "http://www.checktheevidence.co.uk/911/9_11_%20Finding%20the%20Truth_%203rd%20Edition%20-%20Andrew%20Johnson.mobi", False),
            ("EPUB e-book", "http://www.checktheevidence.com/911/911%20Finding%20The%20Truth.epub", False),
            ("Audio book (chapter MP3s)", "http://www.checktheevidence.co.uk/audio/index.php?dir=911/911%20Finding%20the%20Truth%20-%20Audio%20Book/", False),
            ("Audio book (one ZIP, Google Drive)", "https://drive.google.com/file/d/0B1y4ScZkVkAtZXNNWlNRanZEd2c/view?usp=sharing", False),
        ],
        other=("911-holding-truth", "9/11 Holding the Truth (2017)"),
    ),
    "911-holding-truth": dict(
        title="9/11 Holding the Truth",
        year="2017", edition="2017", pages=247, isbn="9781979875981",
        tagline="A compilation of notes, commentary and articles by Andrew Johnson, focused around the 9/11 research and evidence compiled by Dr. Judy Wood",
        desc="Read Andrew Johnson's 9/11 Holding the Truth (2017) free online: the sequel to Finding the Truth, on how the 9/11 cover-up of Dr. Judy Wood's evidence works.",
        about="<p><b>9/11 Holding the Truth</b> (2017) is the sequel to <a href=\"/911-finding-truth\">9/11 Finding the Truth</a>. Having found "
              "the truth about the destruction of the World Trade Center through Dr. Judy Wood's evidence, Andrew Johnson documents what it takes to "
              "hold on to it: the researchers, broadcasters and &ldquo;truth&rdquo; groups who, one way or another, kept that evidence out of view.</p>",
        links=[
            ("Read the PDF on mes.fm", "/911-holding-truth-pdf", True),
            ("Author's book page (all formats)", CTE + "/wordpress/2017/11/20/9-11-holding-the-truth/", False),
            ("Buy from the author", CTE + "/wordpress/product/9-11-holding-the-truth-by-andrew-johnson/", False),
            ("Amazon (paperback / Kindle)", "https://www.amazon.com/dp/1979875987", False),
            ("Lulu paperback", "https://www.lulu.com/shop/andrew-johnson-and-nick-buchanan/911-holding-the-truth/paperback/product-23415839.html", False),
            ("Free PDF (author's site)", "http://www.checktheevidence.com/pdf/911%20Holding%20The%20Truth%20-Andrew%20Johnson%20-%202017.pdf", False),
            ("Kindle file (.mobi)", "http://www.checktheevidence.com/911/9-11%20Holding%20the%20Truth%20-%20Andrew%20Johnson.mobi", False),
            ("EPUB e-book", "http://www.checktheevidence.com/911/9-11%20Holding%20the%20Truth%20-%20Andrew%20Johnson.epub", False),
            ("Audio book (chapter MP3s)", "http://www.checktheevidence.co.uk/audio/index.php?dir=911/911%20Holding%20the%20Truth%20-%20Audio%20Book/", False),
        ],
        other=("911-finding-truth", "9/11 Finding the Truth (2011)"),
    ),
}
HIVE_POST = "https://peakd.com/hive-113182/@mes/andrew-johnsons-911-books-2011-finding-the-truth-and-2017-holding-the-truth"


def sub1(pattern, repl, text, flags=re.S):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n != 1:
        raise SystemExit(f"template drift: {pattern!r} matched {n}x")
    return new


CSS = r"""
    /* ---- Andrew Johnson's 9/11 books (build_aj_books.py) ---- */
    .part-of { margin: 14px 0 0; padding: 0.55em 0.9em; border-radius: 6px; font-size: 0.9em; border: 1px solid rgba(128, 128, 128, 0.4); }
    .part-of a { font-weight: bold; }
    .page-subtitle { font-size: calc(1rem * var(--ts, 1)); opacity: 0.9; margin: 0 0 0.4em; font-style: italic; }
    .byline { font-size: calc(0.9rem * var(--ts, 1)); opacity: 0.85; margin: 0 0 1em; }
    .post-body { overflow-wrap: break-word; }
    .post-body a { overflow-wrap: anywhere; }
    .post-body .chapter-toggle-header { cursor: pointer; }
    /* a whole book = 30-45 folds: keep the folded list compact */
    .post-body .chapter-toggle > h2.chapter-top { font-size: 1.12em; margin: 0; padding: 0.55em 0.4em; text-align: left; border-bottom: 1px solid rgba(128,128,128,0.3); }
    .post-body .chapter-toggle > h2.chapter-top .arrow-icon { float: right; margin-left: 0.5em; opacity: 0.7; }
    .post-body .chapter-toggle-list { padding: 0.3em 0 1.2em; }
    .chapter-toggle, .post-body h3, .post-body h4, .book-part, .post-body li[id], .post-body sup[id] { scroll-margin-top: 70px; }
    .post-body h3 { margin: 1.8em 0 0.4em; padding-bottom: 0.2em; border-bottom: 1px solid rgba(128,128,128,0.35); }
    .post-body h4 { margin: 1.4em 0 0.3em; font-size: 1.02em; }
    .post-body h4 a { text-decoration: none; }
    .post-body p.center { text-align: center; }
    .post-body p.li { padding-left: 1.6em; text-indent: -1.1em; }
    .post-body blockquote { margin: 1em 0 1.2em; padding: 0.5em 1em; border-left: 4px solid #b5323c; background: rgba(128,128,128,0.08); border-radius: 0 6px 6px 0; font-style: italic; }
    .post-body blockquote p { margin: 0.45em 0; }
    body.dark .post-body blockquote { border-left-color: #e0626b; background: rgba(255,255,255,0.05); }
    .post-body figure.fig { margin: 1.2em auto; text-align: center; }
    .post-body figure.fig img { max-width: 100%; height: auto; border-radius: 4px; cursor: zoom-in; }
    .post-body figure.fig-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: flex-start; }
    .post-body figure.fig-row img { flex: 1 1 140px; min-width: 0; max-width: calc(50% - 4px); object-fit: contain; }
    .post-body figure.fig-float { float: left; margin: 0.3em 1em 0.6em 0; max-width: 38%; }
    .post-body sup { line-height: 0; font-size: 0.72em; }
    .post-body sup.fn a { text-decoration: none; padding: 0 0.1em; }
    .post-body ol.refs { font-size: 0.86em; padding-left: 2.6em; }
    .post-body ol.refs li { margin: 0 0 0.35em; }
    .post-body ol.refs li.nonum { list-style: none; }
    .fn-back { text-decoration: none; margin-left: 0.2em; }
    .ch-notes { margin: 1.8em 0 0.6em; padding-top: 0.6em; border-top: 1px solid rgba(128,128,128,0.4); font-size: 0.88em; }
    .ch-notes-title { font-weight: 700; margin-bottom: 0.4em; }
    .ch-notes ol { list-style: none; padding-left: 0.2em; }
    .ch-notes li { margin: 0 0 0.4em; }
    .note-mark { display: inline-block; min-width: 1.8em; font-weight: 700; vertical-align: super; font-size: 0.75em; }
    .book-part { margin: 2.2em 0 1.2em; padding: 1em 1.2em; text-align: center; border-radius: 8px; background: rgba(181,50,60,0.10); border: 1px solid rgba(181,50,60,0.35); }
    .book-part-n { font-size: 1.35em; font-weight: 700; letter-spacing: 0.02em; }
    .book-part-t { font-style: italic; margin-top: 0.3em; }
    body.dark .book-part { background: rgba(224,98,107,0.10); border-color: rgba(224,98,107,0.4); }
    .toc-part { display: block; margin: 0.7em 0 0.25em; font-size: 0.78em; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.75; }
    /* Get the book */
    .get-book { display: flex; gap: 1.1em; align-items: flex-start; margin: 1.1em 0 1.2em; padding: 1em; border-radius: 8px; border: 1px solid rgba(128,128,128,0.4); background: rgba(128,128,128,0.06); }
    .get-book-cover { flex: 0 0 132px; }
    .get-book-cover img { display: block; width: 132px; height: auto; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.25); }
    .get-book-body { flex: 1 1 auto; min-width: 0; }
    .get-book-title { font-weight: 700; font-size: 1.08em; margin: 0 0 0.4em; }
    .get-book-body p { margin: 0 0 0.6em; }
    .get-book-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 0.4em 0 0.6em; padding: 0; list-style: none; }
    .get-book-links a { display: inline-block; padding: 0.35em 0.75em; border-radius: 999px; border: 1px solid rgba(39,123,182,0.55); text-decoration: none; font-size: 0.88em; }
    .get-book-links a.primary { background: #1f6aa5; border-color: #1f6aa5; color: #fff !important; font-weight: 700; }
    .get-book-permission { font-size: 0.86em; opacity: 0.9; margin: 0.4em 0 0; }
    .source-note { font-size: 0.85em; opacity: 0.85; margin: 1em 0; }
    @media (max-width: 600px) {
      .get-book { flex-direction: column; }
      .get-book-cover { flex: none; align-self: center; }
      .post-body figure.fig-float { float: none; max-width: 60%; margin: 1em auto; }
      .post-body blockquote { padding: 0.4em 0.7em; }
    }
"""


def links_html(links, pdf_slug):
    out = []
    for label, href, primary in links:
        ext = not href.startswith("/")
        cls = ' class="primary"' if primary else ""
        tgt = ' target="_blank" rel="noopener"' if ext else ""
        out.append(f'<li><a{cls} href="{esc(href)}"{tgt}>{esc(label)}</a></li>')
    return '<ul class="get-book-links">' + "".join(out) + "</ul>"


def toc_links(toc):
    out = []
    for e in toc:
        if e["level"] == -1:
            t = e["title"] if len(e["title"]) <= 48 else e["title"][:46].rsplit(" ", 1)[0] + "…"
            out.append(f'      <span class="toc-part">{esc(t)}</span>')
        elif e["level"] == 0:
            out.append(f'      <a href="#{e["id"]}">{esc(e["title"])}</a>')
    return "\n".join(out)


def build(slug, B):
    T = open(TEMPLATE, encoding="utf-8").read()
    src = os.path.join(ROOT, "aj_books_src", slug)
    content = open(os.path.join(src, "content.html"), encoding="utf-8").read()
    toc = json.load(open(os.path.join(src, "toc.json"), encoding="utf-8"))["toc"]
    title = f"{B['title']} by Andrew Johnson"
    og = f"https://mes.fm/{slug}/img/og.jpg"
    brand = cmp.BRANDS["/911"]
    ld = {
        "@context": "https://schema.org", "@type": "Book", "name": B["title"], "alternativeHeadline": B["tagline"],
        "author": {"@type": "Person", "name": "Andrew Johnson", "url": CTE + "/"},
        "datePublished": B["year"], "bookEdition": B["edition"], "numberOfPages": B["pages"], "inLanguage": "en",
        "isbn": B["isbn"], "image": og, "url": f"https://mes.fm/{slug}", "description": B["desc"],
        "about": [{"@type": "Event", "name": "September 11 attacks"}, {"@type": "Person", "name": "Judy Wood"}],
        "copyrightHolder": {"@type": "Person", "name": "Andrew Johnson"},
        "publisher": {"@type": "Organization", "name": "MES (Math Easy Solutions)", "url": "https://mes.fm/"},
        "workExample": [{"@type": "Book", "bookFormat": "https://schema.org/EBook", "url": f"https://mes.fm/{slug}-pdf"}],
    }
    meta = f"""  <meta name="description" content="{esc(B['desc'])}">
  <meta name="author" content="Andrew Johnson">
  <link rel="canonical" href="https://mes.fm/{slug}" />
  <!-- OG-TAGS:START -->
  <meta property="og:type" content="book">
  <meta property="og:site_name" content="MES Truth">
  <meta property="og:url" content="https://mes.fm/{slug}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(B['desc'])}">
  <meta property="og:image" content="{og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="book:author" content="Andrew Johnson">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@MathEasySolns">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(B['desc'])}">
  <meta name="twitter:image" content="{og}">
  <!-- OG-TAGS:END -->
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
"""
    T = sub1(r'  <meta name="description".*?(?=  <link rel="icon")', meta, T)
    T = sub1(r"<title>.*?</title>", f"<title>{esc(title)} | MES 9/11 Truth</title>", T)
    T = sub1(r"</style>", CSS + "</style>", T)

    # ---- 9/11 Truth branding (same strings convert_mirror_pages puts on the 9/11 mirrors)
    T = sub1(r'<a href="/math" tabindex="-1"><img class="compact-nav-logo"[^>]*></a>\s*<a class="compact-nav-title" href="/math" tabindex="-1">MES Math Tutorials</a>',
             f'<a href="/911" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm{brand["logo"]}"></a>\n'
             f'  <a class="compact-nav-title" href="/911" tabindex="-1">{brand["title"]}</a>', T)
    T = sub1(r'(<ul class="compact-nav-links">\s*)(<li><a href="/calculators")',
             '<ul class="compact-nav-links">\n    <li><a href="/math" tabindex="-1">Math Tutorials</a></li>\n    <li><a href="/calculators"', T)
    T = sub1(r'<a class="site-brand-logo-link" href="/math">.*?</p></div>',
             f'<a class="site-brand-logo-link" href="/911"><img class="site-brand-logo" src="{brand["logo"]}" width="88" height="88" alt="{brand["title"]} logo"></a>\n'
             f'        <div class="site-brand-text"><a class="site-brand-title" href="/911">{brand["title"]}</a>'
             f'<p class="site-brand-tag">{esc(brand["tag"])}</p></div>', T)
    T = cmp.brand_nav(T)

    # ---- Jump-to (sidebar + mobile): chapters (and Holding's three parts)
    links = toc_links(toc)
    T = re.sub(r'(<nav class="toc-sidebar".*?Collapse All</button>\n    </div>\n)(.*?)(\n  </nav>)', lambda m: m.group(1) + links + m.group(3), T, count=1, flags=re.S)
    T = T.replace('onclick="toggleAllChapters()">Collapse All</button>', 'onclick="toggleAllChapters()">Expand All</button>')

    other_slug, other_title = B["other"]
    from PIL import Image
    cw, ch = Image.open(os.path.join(MES, slug, "img", "cover-page.jpg")).size
    head = f"""    <div class="part-of">Part of <a href="https://mes.fm/911">MES 9/11 Truth</a> &middot; <a href="https://mes.fm/911-andrew-johnson-books">Andrew Johnson's 9/11 Books</a></div>

    <h1>{esc(B['title'])}</h1>
    <div class="page-subtitle">{esc(B['tagline'])}</div>
    <div class="byline">By <b>Andrew Johnson</b> &middot; {esc(B['edition'])} &middot; {B['pages']} pages &middot; published on mes.fm with the author's permission</div>

    <section class="get-book" id="get-the-book" aria-label="Get the book">
      <div class="get-book-cover"><a href="/{slug}/img/cover-page.jpg"><img src="/{slug}/img/cover-page.jpg" width="{cw}" height="{ch}" alt="Title page of {esc(B['title'])} by Andrew Johnson"></a></div>
      <div class="get-book-body">
        <div class="get-book-title">Get the book</div>
        {B['about']}
        {links_html(B['links'], slug)}
        <p class="get-book-permission">Text &copy; Andrew Johnson, cover graphic &copy; Nick Buchanan. Published here with Andrew Johnson's permission; visit his website <a href="{CTE}/" target="_blank" rel="noopener">checktheevidence.com</a>. Also by Andrew Johnson: <a href="/{other_slug}">{esc(other_title)}</a> &middot; <a href="{HIVE_POST}" target="_blank" rel="noopener">MES post about both books</a>.</p>
      </div>
    </section>

    <details class="toc-mobile">
      <summary>Jump to section</summary>
      <nav class="toc-links" aria-label="Table of contents">
{links}
      </nav>
    </details>

    <hr>

    <div class="post-body">
<div class="chapters-toolbar">
<button id="toggleAllChaptersBtn" class="theme-toggle-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Expand All</button>
</div>
{content}
    </div>
"""
    T = sub1(r'    <h1>Vector Functions: Problems Plus</h1>.*?(?=    <!-- FASTCOMMENTS-BLOCK)', head, T)
    T = sub1(r'    <hr>\n\n    <a class="source-link".*?</div>\n(?=    <div id="footer")',
             f'    <hr>\n\n    <div class="source-note"><i>{esc(B["title"])}</i> by Andrew Johnson ({esc(B["edition"])}), converted from the author\'s '
             f'PDF to a web page: chapters fold, the endnotes and the pictures are kept, and the text is unchanged. '
             f'<a href="/{slug}-pdf">Read the original PDF &rarr;</a> &middot; <a href="https://mes.fm/911">More on 9/11 &rarr;</a></div>\n', T)

    # ---- drop the video/playlist machinery this page doesn't use (as build_nancy_physics_article.py)
    T = sub1(r'  <script>\s*// playlist-view-toggle.*?</script>\n\n', "", T)
    T = sub1(r'  <script>\s*// view-mode:.*?</script>\n\n', "", T)
    T = sub1(r'  <script>\s*// auto-hide-controls:.*?</script>\n\n', "", T)
    T = sub1(r'  <script src="https://cdn\.jsdelivr\.net/npm/hls\.js@1/dist/hls\.min\.js"></script>\n(?:  <script src="/main_js/video-speed-hold\.js[^"]*" defer></script>\n)?  <script>\s*// speak-video-hls:.*?</script>\n\n', "", T)
    T = sub1(r"'\.toc-sidebar a, \.toc-mobile a'", "'.toc-sidebar a, .toc-mobile a, .post-body a[href^=\"#\"]'", T)
    T = sub1(r"      let list;\n      while \(target && \(list = target\.closest\('\.chapter-toggle-list'\)\)\) \{",
             "      let list;\n"
             "      const own = target && target.classList.contains('chapter-toggle') ? document.getElementById(target.id + '-list') : null;\n"
             "      if (own && own.classList.contains('hidden')) {\n"
             "        own.classList.remove('hidden');\n"
             "        const ownArrow = document.getElementById('arrowIcon-' + own.id);\n"
             "        if (ownArrow) ownArrow.textContent = '▲';\n"
             "      }\n"
             "      while (target && (list = target.closest('.chapter-toggle-list'))) {", T)
    # all chapters start folded: the Collapse/Expand All button reads the first list's state, which now starts hidden
    assert "Collapse All" not in T.split('<div class="post-body">', 1)[1].split("</div>", 1)[0]
    return T


def make_images(slug, apply):
    """og.jpg (1200x630): the printed title page fitted on a blurred, darkened copy of itself"""
    from PIL import Image, ImageFilter, ImageEnhance
    d = os.path.join(MES, slug, "img")
    cov = Image.open(os.path.join(d, "cover-page.jpg")).convert("RGB")
    bg = cov.resize((1200, int(cov.height * 1200 / cov.width))).crop((0, 300, 1200, 930)).filter(ImageFilter.GaussianBlur(28))
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    h = 590
    c = cov.resize((int(cov.width * h / cov.height), h), Image.LANCZOS)
    bg.paste(c, ((1200 - c.width) // 2, 20))
    if apply:
        bg.save(os.path.join(d, "og.jpg"), "JPEG", quality=84, optimize=True, progressive=True)
    return cov


def make_tile(covers, apply):
    """mes.fm/img/911-andrew-johnson-books-icon.jpg (900x600): both title pages side by side"""
    from PIL import Image, ImageFilter, ImageEnhance
    a, b = covers
    bg = a.resize((900, int(a.height * 900 / a.width))).crop((0, 250, 900, 850)).filter(ImageFilter.GaussianBlur(24))
    bg = ImageEnhance.Brightness(bg).enhance(0.5)
    h = 560
    for i, c in enumerate((a, b)):
        r = c.resize((int(c.width * h / c.height), h), Image.LANCZOS)
        x = 450 - r.width - 14 if i == 0 else 450 + 14
        bg.paste(r, (x, 20))
    if apply:
        bg.save(os.path.join(MES, "img", "911-andrew-johnson-books-icon.jpg"), "JPEG", quality=84, optimize=True, progressive=True)


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    covers = []
    for slug, B in BOOKS.items():
        out = build(slug, B)
        covers.append(make_images(slug, apply))
        path = os.path.join(MES, slug, "index.html")
        print(f"{len(out) // 1024} KB -> {os.path.relpath(path, ROOT)}" + ("" if apply else "   (dry run; pass --apply to write)"))
        if apply:
            open(path, "w", encoding="utf-8").write(out)
    make_tile(covers, apply)
