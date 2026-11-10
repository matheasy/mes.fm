#!/usr/bin/env python3
"""Builds mes.fm/antigravity-6-rotation-defy-physics/index.html -- "#AntiGravity Part 6: Objects in Rotation Defy 'Mainstream'
Physics + MES Duality Concept", a mirror of the Hive post @mes/antigravity-part-6-video-1-objects-in-rotation-defy-mainstream-
physics-mes-duality-concept (2019-07-03; the whole "self-appointed PhD" document, ~570 KB of markdown, ~810 images).

Shell = the BUILT mes.fm/vector-functions-problems-plus/index.html (Jump-to sidebar + mobile list + search, Collapse All,
per-chapter folds, Standard | Wide | Theatre, comments, ads), like build_em304_article.py, re-branded MES Anti-Gravity (logo,
header, floating bar, info bar = the antigravity hub's). Part 6 is TWO YouTube videos (no 3Speak upload exists), so the
"Full Video" chapter has two players, each followed by its own chapter list (<script class="video-chapters"> for
main_js/video-chapters.js), and the description's timestamp lines seek the right player.

Source: ag6_src/post.md + meta.json (cached; --fetch refreshes from the Hive API). `#` headings = top-level folds, `##` =
sub-folds listed in Jump to. Every image goes through images.hive.blog (most are on ipfs.busy.org, which is dead). Bare YouTube
links on their own line become lazy embeds, as Hive shows them.

    python3 build_antigravity6_article.py              # dry run
    python3 build_antigravity6_article.py --apply      # write
    python3 build_antigravity6_article.py --fetch --apply

Never hand-edit the output. After a run: build_sitemap.py, build_search_index.py."""
import json, os, re, sys, html, subprocess, urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
SRC = os.path.join(ROOT, "ag6_src")
SLUG = "antigravity-6-rotation-defy-physics"
OUT = os.path.join(MES, SLUG, "index.html")
TEMPLATE = os.path.join(MES, "vector-functions-problems-plus", "index.html")
HUB = os.path.join(MES, "antigravity", "index.html")
MARKED = os.path.join(MES, "vector-functions-problems-plus", "node_modules", "marked", "lib", "marked.esm.js")

AUTHOR, CATEGORY = "mes", "antigravity"
PERMLINK = "antigravity-part-6-video-1-objects-in-rotation-defy-mainstream-physics-mes-duality-concept"
PEAKD_URL = f"https://peakd.com/{CATEGORY}/@{AUTHOR}/{PERMLINK}"
VIDEOS = [("VLt1dSt_r18", "Video 1"), ("dKwwJe0znpA", "Video 2")]
TITLE = "#AntiGravity Part 6: Objects in Rotation Defy 'Mainstream' Physics + MES Duality Concept"
DESC = ("MES #AntiGravity Part 6: gyroscopes and objects in rotation rise, lift and precess in ways mainstream physics "
        "does not explain. Two videos plus the full self-appointed PhD document and MES Duality concept.")
OG_IMAGE = "https://files.peakd.com/file/peakd-hive/mes/23uQvaS78hCNcSRSgDQrpoygJtyDq9j5QEnvVhEwdmdv5JCT67MzueTNMxgq6bks8siBS.jpeg"
BRAND_LOGO = "https://mes.fm/img/antigravity-logo.jpg"
BRAND_TITLE = "MES Anti-Gravity"
BRAND_TAG = "MES Anti-Gravity research: gyroscopes, spinning wheels and hidden science."
esc = lambda t: html.escape(t, quote=True)

CSS = r"""
    /* ---- AntiGravity Part 6 page (build_antigravity6_article.py) ---- */
    .post-body { overflow-wrap: anywhere; }
    .post-body a.ts-link { font-variant-numeric: tabular-nums; font-weight: 600; }
    .post-body p.ctr { text-align: center; }
    .post-body img { max-width: 100%; height: auto; }
    .ag-vlabel { font-weight: 700; font-size: 1.15em; margin: 1.2em 0 0.4em; }
    .ag-yt { position: relative; width: 100%; aspect-ratio: 16 / 9; margin: 1em 0; }
    .ag-yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 6px; }
    .ag-partof { margin: 0.4em 0 1em; padding: 0.55em 0.9em; border-left: 4px solid #277bb6; background: rgba(39,123,182,0.08); border-radius: 0 6px 6px 0; }
    body.dark .ag-partof { border-left-color: #6cb6f5; background: rgba(108,182,245,0.08); }
    .ag-ch { margin: 0.3em 0 1em; padding-left: 1.3em; }
    .ag-ch li { margin: 0.15em 0; }
"""

def hive(method, params):
    req = urllib.request.Request("https://api.hive.blog", data=json.dumps({"jsonrpc": "2.0", "method": method,
          "params": params, "id": 1}).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))["result"]

def fetch():
    r = hive("bridge.get_post", {"author": AUTHOR, "permlink": PERMLINK})
    os.makedirs(SRC, exist_ok=True)
    open(os.path.join(SRC, "post.md"), "w", encoding="utf-8").write(r["body"])
    meta = {k: r[k] for k in ("author", "permlink", "category", "title", "created", "children", "reblogs")}
    meta["votes"] = r["stats"]["total_votes"]
    json.dump(meta, open(os.path.join(SRC, "meta.json"), "w"), indent=1)
    print("fetched", PERMLINK)

def md_to_html(md):
    js = ("import {marked} from %s; let s='';process.stdin.setEncoding('utf8');"
          "process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(marked.parse(s)));") % json.dumps("file://" + MARKED)
    return subprocess.run(["node", "--input-type=module", "-e", js], input=md, capture_output=True, text=True, check=True).stdout

def slugify(plain):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", plain.lower())) or "section"

def plain_text(inner):
    return html.unescape(re.sub(r"<[^>]+>", "", inner)).strip()

def secs(stamp):
    t = 0
    for p in stamp.split(":"):
        t = t * 60 + int(p)
    return t

def proxy(url):
    if url.startswith("https://images.hive.blog/"):
        return url
    return "https://images.hive.blog/1024x0/" + url

def yt_id(url):
    m = re.match(r"https?://(?:www\.)?(?:youtu\.be/|youtube\.com/watch\?v=)([\w-]{11})(?:[?&]t=([\dhms]+))?", url)
    if not m:
        return None, 0
    t = m.group(2) or "0"
    if t.isdigit():
        s = int(t)
    else:
        s = sum(int(n) * {"h": 3600, "m": 60, "s": 1}[u] for n, u in re.findall(r"(\d+)([hms])", t))
    return m.group(1), s

def split_source(md):
    """-> (description md, [chapters video 1], [chapters video 2], document md)"""
    md = md.replace("\r\n", "\n")
    lead = re.match(r"\s*# Video 1\s*\n\s*https://youtu\.be/\S+\s*\n\s*# Video 2\s*\n\s*https://youtu\.be/\S+\s*\n", md)
    if not lead:
        raise SystemExit("template drift: post no longer starts with the two '# Video N' headings")
    md = md[lead.end():]
    a = md.index("\nIntro: 0:00")
    b = md.index("Stay tuned for #AntiGravity Part 7!")
    block = md[a:b]
    one, two = block.split("The following sections are shown in the second video.")
    def parse(txt):
        out = []
        for line in txt.strip().split("\n"):
            m = re.match(r"^(.*?):\s*((?:\d+:)?\d+:\d\d)\s*$", line.strip())
            if m:
                out.append((secs(m.group(2)), m.group(2), m.group(1).strip()))
        return out
    ch1, ch2 = parse(one), parse(two)
    if len(ch1) < 10 or len(ch2) < 10:
        raise SystemExit("could not read the timestamp lists")
    head = md[:a] + "\n\n@@CHAPTERS@@\n\n" + md[b:]
    cut = re.search(r"^# View PhD Below\s*$", head, re.M)
    if not cut:
        raise SystemExit("template drift: '# View PhD Below' not found")
    desc, doc = head[:cut.start()], head[cut.end():]
    return desc, ch1, ch2, doc

def preprocess(md):
    md = re.sub(r"^(#{1,6})[ \t]*<center>(.*?)</center>[ \t]*$", r"\1 \2", md, flags=re.M)
    # the title page's subtitle: a plain heading, not a fold of its own
    md = re.sub(r"^## (My Self-Appointed PhD & The Cheat Code to Life: MES Duality)[ \t]*$", r"### \1", md, flags=re.M)
    md = re.sub(r"^[ \t]*<center>(.*?)</center>[ \t]*$", r"§C§\1", md, flags=re.M)
    md = re.sub(r"!\[([^\]]*)\]\((https?://[^)\s]+)\)", lambda m: f"![{m.group(1)}]({proxy(m.group(2))})", md)
    def yt_line(m):
        vid, t = yt_id(m.group(1))
        return f"@@YT:{vid}:{t}@@" if vid else m.group(0)
    md = re.sub(r"^[ \t]*(https?://(?:www\.)?(?:youtu\.be|youtube\.com)/\S+)[ \t]*$", yt_line, md, flags=re.M)
    md = re.sub(r"\]\((mes\.fm/)", r"](https://\1", md)
    return md

def postprocess(body):
    body = re.sub(r"<p>§C§([\s\S]*?)</p>", r'<p class="ctr">\1</p>', body)
    body = body.replace("§C§", "")
    def yt(m):
        vid, t = m.group(1), int(m.group(2))
        return (f'<div class="ag-yt"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/{vid}'
                f'{"?start=" + str(t) if t else ""}" title="YouTube video" allow="accelerometer; clipboard-write; '
                'encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>')
    body = re.sub(r"<p>@@YT:([\w-]{11}):(\d+)@@</p>", yt, body)
    body = re.sub(r"<img (?!loading)", '<img loading="lazy" ', body)
    body = re.sub(r'<a href="(https?://)', r'<a target="_blank" rel="noopener" href="\1', body)
    return body

def video_block(i, vid, label, chapters):
    data = json.dumps([{"t": t, "title": title} for t, _, title in chapters], ensure_ascii=False).replace("</", "<\\/")
    return (f'<p class="ag-vlabel">{label}</p>\n'
            f'<div class="video-embed" id="agVideo{i}" google-side-rail-overlap="false">'
            f'<iframe src="https://www.youtube-nocookie.com/embed/{vid}?enablejsapi=1" title="{esc(TITLE)} ({label})" '
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
            '<button class="theater-toggle-btn wide-toggle-btn" type="button" aria-pressed="false" style="top:46px;">Wide View</button>'
            '<button class="theater-toggle-btn" type="button" aria-pressed="false" style="top:82px;">Theater Mode</button>'
            f'<a class="video-badge" href="https://youtu.be/{vid}" target="_blank" rel="noopener">View on YouTube &nearr;</a>'
            f'</div>\n<script type="application/json" class="video-chapters">{data}</script>\n')

def chapters_html(ch1, ch2):
    def ul(i, vid, chs):
        return '<ul class="ag-ch">\n' + "\n".join(
            f'<li><a class="ts-link" data-v="{i}" data-t="{t}" href="https://youtu.be/{vid}?t={t}">{stamp}</a> {esc(title)}</li>'
            for t, stamp, title in chs) + "\n</ul>\n"
    return ("<p>Due to YouTube video length restrictions, Part 6 is split into two videos. Sections in the first video:</p>\n"
            + ul(1, VIDEOS[0][0], ch1) + "<p>Sections in the second video:</p>\n" + ul(2, VIDEOS[1][0], ch2))

def chapterize(body, overview):
    heads = list(re.finditer(r"<h([12])>([\s\S]*?)</h\1>", body))
    seen, toc = {"overview": 1}, []
    def mkid(plain):
        s = slugify(plain); k = seen.get(s, 0) + 1; seen[s] = k
        return s if k == 1 else f"{s}-{k}"
    strip_hr = lambda s: re.sub(r"(\s*<hr>\s*)+$", "\n", re.sub(r"^(\s*<hr>\s*)+", "", s.strip()) + "\n") if s.strip() else ""
    chapters = [{"id": "overview", "title": "Full Video", "label": "Full Video", "intro": overview + body[:heads[0].start()], "subs": []}]
    for i, m in enumerate(heads):
        lvl, inner = m.group(1), m.group(2).strip()
        content = body[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)]
        plain = plain_text(inner)
        hid = mkid(plain)
        if lvl == "1" or len(chapters) == 1:
            chapters.append({"id": hid, "title": inner, "label": plain, "intro": content, "subs": []})
        else:
            chapters[-1]["subs"].append({"id": hid, "title": inner, "label": plain, "content": content})
    out = []
    for c in chapters:
        toc.append((c["id"], c["label"], False))
        subs = ""
        for s in c["subs"]:
            toc.append((s["id"], s["label"], True))
            subs += (f'<div class="chapter-toggle chapter-sub" id="{s["id"]}">\n'
                     f'<h2 class="chapter-toggle-header" onclick="toggleChapter(\'{s["id"]}-list\')">{s["title"]} <span id="arrowIcon-{s["id"]}-list" class="arrow-icon">&#9660;</span></h2>\n'
                     f'<div id="{s["id"]}-list" class="chapter-toggle-list">{strip_hr(s["content"])}</div>\n</div>\n')
        out.append(f'<div class="chapter-toggle" id="{c["id"]}">\n'
                   f'<h2 class="chapter-toggle-header chapter-top" onclick="toggleChapter(\'{c["id"]}-list\')"><center>{c["title"]} <span id="arrowIcon-{c["id"]}-list" class="arrow-icon">&#9660;</span></center></h2>\n'
                   f'<div id="{c["id"]}-list" class="chapter-toggle-list">{strip_hr(c["intro"])}{subs}</div>\n</div>\n')
    return "<hr>\n".join(out), toc

VIDEO_JS = r"""<script>
    // AntiGravity Part 6 (build_antigravity6_article.py): two YouTube players. Timestamp links (a.ts-link[data-v][data-t])
    // seek their own player through main_js/video-chapters.js, else reload that iframe at the time.
    (function () {
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a.ts-link[data-t]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        var embed = document.getElementById('agVideo' + (a.getAttribute('data-v') || '1'));
        if (!embed) return;
        e.preventDefault();
        var t = parseInt(a.getAttribute('data-t'), 10) || 0;
        var y = embed.getBoundingClientRect().top + window.pageYOffset - 70;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        if (window.MESChapters && window.MESChapters.seek(t, embed)) return;
        var f = embed.querySelector('iframe');
        if (f) f.src = f.src.replace(/[?&](start|autoplay)=\d+/g, '') + '&start=' + t + '&autoplay=1';
      });
    })();
  </script>"""

def sub1(pattern, repl, text, flags=re.S):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n != 1:
        raise SystemExit(f"template drift: {pattern!r} matched {n}x")
    return new

def build():
    meta = json.load(open(os.path.join(SRC, "meta.json"), encoding="utf-8"))
    desc_md, ch1, ch2, doc_md = split_source(open(os.path.join(SRC, "post.md"), encoding="utf-8").read())
    desc = postprocess(md_to_html(preprocess(desc_md))).replace("<p>@@CHAPTERS@@</p>", chapters_html(ch1, ch2))
    overview = video_block(1, VIDEOS[0][0], VIDEOS[0][1], ch1) + video_block(2, VIDEOS[1][0], VIDEOS[1][1], ch2) + desc
    body = postprocess(md_to_html(preprocess(doc_md)))
    content, toc = chapterize(body, overview)

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
  <meta property="og:image" content="{OG_IMAGE}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@MathEasySolns">
  <meta name="twitter:title" content="{esc(TITLE)}">
  <meta name="twitter:description" content="{esc(DESC)}">
  <meta name="twitter:image" content="{OG_IMAGE}">
  <!-- OG-TAGS:END -->"""
    T = sub1(r'<meta name="description".*?<!-- OG-TAGS:END -->', head, T)
    T = sub1(r"<title>.*?</title>", f"<title>{esc(TITLE)} | {BRAND_TITLE}</title>", T)
    T = sub1(r'<link rel="icon"[^>]*>', f'<link rel="icon" href="{BRAND_LOGO}?v=1" type="image/jpeg" />', T)
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
    d = datetime.fromisoformat(meta["created"])
    date = f"{d.strftime('%B')} {d.day}, {d.year}"
    T = sub1(r'<div class="post-meta">.*?</div>',
             f'<div class="post-meta">\n      <span>By {esc(meta["author"])}</span>\n      <span>{date}</span>\n      <span>{meta["votes"]} votes</span>\n'
             f'      <span>{meta["children"]} comments</span>\n      <span>{meta["reblogs"]} reblogs</span>\n    </div>', T)
    T = T.replace("https://peakd.com/hive-128780/@mes/vector-functions-problems-p-729", PEAKD_URL)
    T = T.replace('<meta name="mes:hive" content="mes/vector-functions-problems-p-729">', f'<meta name="mes:hive" content="{AUTHOR}/{PERMLINK}">')
    T = sub1(r'(?<=rel="noopener">Originally published on Hive &rarr;</a>)(?=\n\n    <details class="toc-mobile")',
             '\n    <p class="ag-partof">Part of <a href="/antigravity">MES Anti-Gravity</a> &middot; '
             '<a href="/antigravity-series">Anti-Gravity Series</a> &middot; <a href="/science">MES Science</a></p>', T)
    T = sub1(r'(?<=onclick="toggleAllChapters\(\)">Collapse All</button>\n</div>\n).*?(?=\n    </div>\n    <!-- FASTCOMMENTS-BLOCK)',
             content, T)
    T = sub1(r"<script>\s*// speak-video-hls:.*?</script>", VIDEO_JS, T)
    T = re.sub(r'\s*<script src="https://cdn\.jsdelivr\.net/npm/hls\.js@1/dist/hls\.min\.js"></script>', "", T)
    T = sub1(r'(?<=at build time \().*?(?=\) and are not live)', date, T)
    T = sub1(r"(?<=let target = document\.getElementById\(decodeURIComponent\(hash\.slice\(1\)\)\);\n      let list;\n)",
             "      const own = target && target.classList.contains('chapter-toggle') && document.getElementById(target.id + '-list');\n"
             "      if (own && own.classList.contains('hidden')) {\n"
             "        own.classList.remove('hidden');\n"
             "        const ownArrow = document.getElementById('arrowIcon-' + own.id);\n"
             "        if (ownArrow) ownArrow.textContent = '▲';\n"
             "      }\n", T)
    bodypart = T.split("<!-- FASTCOMMENTS-BLOCK")[0].split("<body")[1]
    left = [s for s in ("vector-functions-problems-p-729", "Problems Plus", "speak-video", "MES Math Tutorials") if s in bodypart]
    if left:
        raise SystemExit(f"leftover template text: {left}")
    return T, toc

if __name__ == "__main__":
    if "--fetch" in sys.argv or not os.path.exists(os.path.join(SRC, "post.md")):
        fetch()
    out, toc = build()
    apply = "--apply" in sys.argv
    print(f"{len(out)} bytes, {sum(1 for t in toc if not t[2])} chapters, {sum(1 for t in toc if t[2])} sub-folds -> "
          f"{os.path.relpath(OUT, ROOT)}" + ("" if apply else "   (dry run; pass --apply to write)"))
    if "-v" in sys.argv:
        for i, label, sub in toc:
            print(("    " if sub else "  ") + f"#{i}  {label}")
    if apply:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(out)
