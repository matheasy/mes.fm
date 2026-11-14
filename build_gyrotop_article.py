#!/usr/bin/env python3
"""Builds mes.fm/gyrotop-angular-momentum/index.html -- "GyroTop and Gyroscopes Point to Serious Flaw in Mainstream Angular
Momentum Physics" (2026-11-11, follow-up questions added 2026-11-14), from gyrotop_src/post.md (the article's markdown, as
written by MES).

Shell = the BUILT mes.fm/vector-functions-problems-plus/index.html (Jump-to sidebar + mobile "Jump to section" + search,
Collapse All, per-chapter folds, Standard | Wide | Theatre, comments, ads), like build_antigravity6_article.py, re-branded
MES Anti-Gravity (logo, header, floating bar; the info bar is copied from the antigravity hub). The page is not a Hive mirror,
so the template's Hive links / mes:hive meta / video player are removed.

Source layout: the article, then a line "---", "# Follow-up Questions", a numbered list of the questions, "---", and one
"## <n>. <title>" section per answer. Chapters: "The Article" and "Follow-up Questions" (top-level folds); each answer is a
sub-fold (#q1, #q2, ...) listed in Jump to. The questions at the top of the Follow-up chapter link to their answers, and each
answer has a "Back to the questions" link. Bare YouTube links on their own line become lazy embeds.

    python3 build_gyrotop_article.py              # dry run
    python3 build_gyrotop_article.py --apply      # write

Never hand-edit the output. After a title / description change also run build_sitemap.py and build_search_index.py.
The right-hand "More like this" rail comes from main_js/jump-aside.js (its FAMILY table lists this slug)."""
import html, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
SLUG = "gyrotop-angular-momentum"
OUT = os.path.join(MES, SLUG, "index.html")
SRC = os.path.join(ROOT, "gyrotop_src", "post.md")
TEMPLATE = os.path.join(MES, "vector-functions-problems-plus", "index.html")
HUB = os.path.join(MES, "antigravity", "index.html")
MARKED = os.path.join(MES, "vector-functions-problems-plus", "node_modules", "marked", "lib", "marked.esm.js")
TITLE = "GyroTop and Gyroscopes Point to Serious Flaw in Mainstream Angular Momentum Physics"
DATE = "November 11, 2026"
DESC = ("Owen Liang's GyroTop magnetic spinning top and MES gyroscope experiments question the friction explanation of rising "
        "tops and the mainstream idea of angular momentum.")
OG = f"https://mes.fm/{SLUG}/img/thumbnail.jpg"
BRAND_LOGO = "https://mes.fm/img/antigravity-logo.jpg"
BRAND_TITLE = "MES Anti-Gravity"
BRAND_TAG = "MES Anti-Gravity research: gyroscopes, spinning wheels and hidden science."
PARTOF = ('<p class="gt-partof">Part of <a href="/antigravity">MES Anti-Gravity</a> &middot; '
          '<a href="/experiments">MES Experiments</a> &middot; <a href="/science">MES Science</a></p>')
esc = lambda t: html.escape(t, quote=True)

CSS = r"""
    /* ---- GyroTop article (build_gyrotop_article.py) ---- */
    .post-body { overflow-wrap: anywhere; }
    .post-body img { max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 6px; }
    .post-body blockquote { margin: -0.4em auto 1.2em; text-align: center; font-style: italic; opacity: 0.85; border: 0; padding: 0; }
    .gt-yt { position: relative; width: 100%; aspect-ratio: 16 / 9; margin: 1em 0; }
    .gt-yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 6px; }
    .gt-partof { margin: 0.4em 0 1em; padding: 0.55em 0.9em; border-left: 4px solid #277bb6; background: rgba(39,123,182,0.08); border-radius: 0 6px 6px 0; }
    body.dark .gt-partof { border-left-color: #6cb6f5; background: rgba(108,182,245,0.08); }
    .gt-qs { list-style: none; padding: 0; margin: 0.6em 0 1.2em; counter-reset: q; }
    .gt-qs li { counter-increment: q; margin: 0 0 0.6em; }
    .gt-qs a { display: flex; gap: 0.7em; align-items: flex-start; padding: 0.7em 0.9em; border: 1px solid rgba(39,123,182,0.35);
      border-radius: 8px; text-decoration: none; color: inherit; background: rgba(39,123,182,0.05); line-height: 1.45; }
    .gt-qs a:hover, .gt-qs a:focus-visible { border-color: #277bb6; background: rgba(39,123,182,0.12); }
    .gt-qs a::before { content: counter(q); flex: none; width: 1.8em; height: 1.8em; border-radius: 50%; background: #277bb6; color: #fff;
      display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9em; }
    .gt-qs .gt-go { margin-left: auto; flex: none; color: #1f6aa0; font-weight: 600; white-space: nowrap; }
    body.dark .gt-qs a { border-color: rgba(108,182,245,0.35); background: rgba(108,182,245,0.06); }
    body.dark .gt-qs a:hover { border-color: #6cb6f5; background: rgba(108,182,245,0.14); }
    body.dark .gt-qs a::before { background: #3f8fd0; }
    body.dark .gt-qs .gt-go { color: #8cc8f7; }
    .gt-ask { margin: 0.2em 0 1em; padding: 0.6em 0.9em; border-radius: 6px; background: rgba(39,123,182,0.08); font-weight: 600; }
    body.dark .gt-ask { background: rgba(108,182,245,0.1); }
    .gt-back { margin: 1.2em 0 0.4em; font-size: 0.95em; }
    @media (max-width: 520px) { .gt-qs .gt-go { display: none; } }
"""


def md_to_html(md):
    js = ("import {marked} from %s; let s='';process.stdin.setEncoding('utf8');"
          "process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(marked.parse(s)));") % json.dumps("file://" + MARKED)
    return subprocess.run(["node", "--input-type=module", "-e", js], input=md, capture_output=True, text=True, check=True).stdout


def yt_id(url):
    m = re.match(r"https?://(?:www\.)?(?:youtu\.be/|youtube\.com/watch\?v=)([\w-]{11})", url)
    return m.group(1) if m else None


def render(md):
    def yt_line(m):
        vid = yt_id(m.group(1))
        return f"\n@@YT:{vid}@@\n" if vid else m.group(0)
    md = re.sub(r"^[ \t]*(https?://(?:www\.)?(?:youtu\.be|youtube\.com)/\S+)[ \t]*$", yt_line, md, flags=re.M)
    body = md_to_html(md)
    body = re.sub(r"<p>@@YT:([\w-]{11})@@</p>", lambda m:
                  f'<div class="gt-yt"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/{m.group(1)}" '
                  'title="YouTube video" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
                  'allowfullscreen></iframe></div>', body)
    if "@@YT" in body:
        raise SystemExit("a YouTube line was not turned into an embed")
    body = body.replace('alt="image.png"', 'alt=""')
    body = re.sub(r"<img (?!loading)", '<img loading="lazy" ', body)
    body = re.sub(r'<a href="(https?://(?!mes\.fm))', r'<a target="_blank" rel="noopener" href="\1', body)
    return body


def split_source(md):
    md = md.replace("\r\n", "\n")
    m = re.search(r"^---\s*\n+# Follow-up Questions\s*\n", md, re.M)
    if not m:
        raise SystemExit("source drift: '---' + '# Follow-up Questions' not found")
    article, rest = md[:m.start()].strip(), md[m.end():]
    parts = re.split(r"^---\s*$", rest, maxsplit=1, flags=re.M)
    if len(parts) != 2:
        raise SystemExit("source drift: no '---' between the question list and the answers")
    qs = [q.strip() for q in re.findall(r"^\s*\d+\.\s+(.+)$", parts[0], re.M)]
    heads = list(re.finditer(r"^##\s+(\d+)\.\s+(.+?)\s*$", parts[1], re.M))
    if not qs or len(qs) != len(heads):
        raise SystemExit(f"source drift: {len(qs)} questions but {len(heads)} '## n.' answer headings")
    answers = []
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(parts[1])
        answers.append((h.group(2), parts[1][h.end():end].strip()))
    return article, qs, answers


def fold(cid, title, inner, top):
    if top:
        return (f'<div class="chapter-toggle" id="{cid}">\n'
                f'<h2 class="chapter-toggle-header chapter-top" onclick="toggleChapter(\'{cid}-list\')"><center>{title} <span id="arrowIcon-{cid}-list" class="arrow-icon">&#9660;</span></center></h2>\n'
                f'<div id="{cid}-list" class="chapter-toggle-list">{inner}</div>\n</div>\n')
    return (f'<div class="chapter-toggle chapter-sub" id="{cid}">\n'
            f'<h2 class="chapter-toggle-header" onclick="toggleChapter(\'{cid}-list\')">{title} <span id="arrowIcon-{cid}-list" class="arrow-icon">&#9660;</span></h2>\n'
            f'<div id="{cid}-list" class="chapter-toggle-list">{inner}</div>\n</div>\n')


def content():
    article, qs, answers = split_source(open(SRC, encoding="utf-8").read())
    thumb = (f'<p><img src="/{SLUG}/img/thumbnail.jpg" width="640" height="360" '
             'alt="GyroTop magnetic spinning top rising against a magnet"></p>\n')
    toc = [("article", "The Article", False), ("questions", "Follow-up Questions", False)]
    chapters = [fold("article", "The Article", thumb + render(article), True)]
    qlist = '<ol class="gt-qs">\n' + "\n".join(
        f'<li><a class="gt-qlink" href="#q{i}"><span>{esc(q)}</span><span class="gt-go">Answer &darr;</span></a></li>'
        for i, q in enumerate(qs, 1)) + "\n</ol>\n"
    subs = ""
    for i, ((title, body), q) in enumerate(zip(answers, qs), 1):
        toc.append((f"q{i}", f"{i}. {title}", True))
        inner = (f'<p class="gt-ask">Question: {esc(q)}</p>\n' + render(body) +
                 '<p class="gt-back"><a class="gt-qlink" href="#questions">&uarr; Back to the questions</a></p>\n')
        subs += fold(f"q{i}", f"{i}. {esc(title)}", inner, False)
    chapters.append(fold("questions", "Follow-up Questions",
                         "<p>Questions I was asked about the GyroTop. Click one to jump to my answer.</p>\n" + qlist + subs, True))
    return "<hr>\n".join(chapters), toc


def sub1(pattern, repl, text, flags=re.S):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n != 1:
        raise SystemExit(f"template drift: {pattern!r} matched {n}x")
    return new


def build():
    body, toc = content()
    T = open(TEMPLATE, encoding="utf-8").read()
    hub = open(HUB, encoding="utf-8").read()
    head = f"""<meta name="description" content="{esc(DESC)}">
  <meta name="author" content="MES">
  <link rel="canonical" href="https://mes.fm/{SLUG}" />
  <!-- OG-TAGS:START -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="{BRAND_TITLE}">
  <meta property="og:url" content="https://mes.fm/{SLUG}">
  <meta property="og:title" content="{esc(TITLE)}">
  <meta property="og:description" content="{esc(DESC)}">
  <meta property="og:image" content="{OG}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@MathEasySolns">
  <meta name="twitter:title" content="{esc(TITLE)}">
  <meta name="twitter:description" content="{esc(DESC)}">
  <meta name="twitter:image" content="{OG}">
  <!-- OG-TAGS:END -->"""
    T = sub1(r'<meta name="description".*?<!-- OG-TAGS:END -->', head, T)
    T = sub1(r"<title>.*?</title>", f"<title>{esc(TITLE)} | {BRAND_TITLE}</title>", T)
    T = sub1(r'<link rel="icon"[^>]*>', f'<link rel="icon" href="{BRAND_LOGO}?v=1" type="image/jpeg" />', T)
    T = sub1(r'\s*<meta name="mes:hive" content="[^"]*">', "", T)
    i = T.index("</style>")
    T = T[:i] + CSS + T[i:]

    # brand: floating bar, header, info bar
    T = sub1(r'<a href="/math" tabindex="-1"><img class="compact-nav-logo"[^>]*></a>\s*<a class="compact-nav-title" href="/math" tabindex="-1">MES Math Tutorials</a>',
             f'<a href="/antigravity" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="{BRAND_LOGO}"></a>\n'
             f'  <a class="compact-nav-title" href="/antigravity" tabindex="-1">{BRAND_TITLE}</a>', T)
    T = sub1(r'<div class="site-brand">.*?</div>\s*</div>',
             f'<div class="site-brand">\n        <a class="site-brand-logo-link" href="/antigravity"><img class="site-brand-logo" src="{BRAND_LOGO}" width="88" height="88" alt="{BRAND_TITLE} logo"></a>\n'
             f'        <div class="site-brand-text"><a class="site-brand-title" href="/antigravity">{BRAND_TITLE}</a><p class="site-brand-tag">{esc(BRAND_TAG)}</p></div>\n      </div>', T)
    bar = re.search(r'<ul id="info-bar" class="info-bar[^"]*">.*?</ul>', hub, re.S).group(0).replace('class="info-bar shadow"', 'class="info-bar"')
    T = sub1(r'<ul id="info-bar" class="info-bar">.*?</ul>', bar, T)

    cls = ' class="toc-sub"'
    links = "\n".join(f'      <a{cls if sub else ""} href="#{i}">{esc(label)}</a>' for i, label, sub in toc)
    T = sub1(r'(?<=Collapse All</button>\n    </div>\n).*?(?=\n  </nav>)', links, T)
    T = sub1(r'(?<=<nav class="toc-links" aria-label="Table of contents">\n).*?(?=\n      </nav>)', links, T)

    T = sub1(r"<h1>.*?</h1>", f"<h1>{esc(TITLE)}</h1>", T)
    T = sub1(r'<div class="post-meta">.*?</div>', f'<div class="post-meta">\n      <span>By MES</span>\n      <span>{DATE}</span>\n    </div>', T)
    T = sub1(r'\s*<a class="peakd-link"[^>]*>Originally published on Hive &rarr;</a>', "\n    " + PARTOF, T)
    T = sub1(r'(?<=onclick="toggleAllChapters\(\)">Collapse All</button>\n</div>\n).*?(?=\n    </div>\n    <!-- FASTCOMMENTS-BLOCK)', body, T)
    T = sub1(r'\s*<a class="source-link"[^>]*>Originally published on Hive &rarr;</a>\s*<div class="retrieved-note">.*?</div>', "", T)
    T = sub1(r"<script>\s*// speak-video-hls:.*?</script>", "", T)
    T = re.sub(r'\s*<script src="https://cdn\.jsdelivr\.net/npm/hls\.js@1/dist/hls\.min\.js"></script>', "", T)
    # in-article question links reveal their (maybe collapsed) answer too, and a link to a fold opens the fold itself
    T = sub1(r"closest\('\.toc-sidebar a, \.toc-mobile a'\)", "closest('.toc-sidebar a, .toc-mobile a, a.gt-qlink')", T)
    T = sub1(r"(?<=let target = document\.getElementById\(decodeURIComponent\(hash\.slice\(1\)\)\);\n      let list;\n)",
             "      const own = target && target.classList.contains('chapter-toggle') && document.getElementById(target.id + '-list');\n"
             "      if (own && own.classList.contains('hidden')) {\n"
             "        own.classList.remove('hidden');\n"
             "        const ownArrow = document.getElementById('arrowIcon-' + own.id);\n"
             "        if (ownArrow) ownArrow.textContent = '▲';\n"
             "      }\n", T)
    bodypart = T.split("<!-- FASTCOMMENTS-BLOCK")[0].split("<body")[1]
    left = [s for s in ("vector-functions-problems-p-729", "Problems Plus", "speak-video", "MES Math Tutorials", "peakd-link") if s in bodypart]
    if left:
        raise SystemExit(f"leftover template text: {left}")
    return T, toc


YT_CLS = 'class="gt-yt"'

if __name__ == "__main__":
    out, toc = build()
    apply = "--apply" in sys.argv
    print(f"{len(out)} bytes, {out.count(YT_CLS)} video embeds, {sum(1 for t in toc if t[2])} answers -> "
          f"{os.path.relpath(OUT, ROOT)}" + ("" if apply else "   (dry run; pass --apply to write)"))
    if apply:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(out)
