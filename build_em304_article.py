#!/usr/bin/env python3
"""Builds mes.fm/space-shuttle-columbia/index.html -- "Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster",
a mirror of the Hive post @mes/exam-problem-by-dr-judy-woo-59 (2026-10-30) in the Problems Plus shell: MES Math Tutorials
brand, Jump-to sidebar + mobile "Jump to section" + search, Collapse All, per-chapter folds, Standard | Wide | Theatre,
the "More like this" rail, comments and ads. The shell is the BUILT mes.fm/vector-functions-problems-plus/index.html (so every
later site-wide patch on that page carries over), minus its Grid/List "Playlist" chapter (short clips are added later).

Source: em304_src/post.md (the Hive markdown, cached so the build works offline) + em304_src/meta.json. Markdown -> HTML with
the same `marked` the Problems Plus build.mjs uses (mes.fm/vector-functions-problems-plus/node_modules; needs node).
Structure: everything before the first heading = the "Full Video" chapter (3Speak video, "The original test (PDF)" box,
description, timestamps, links); `##` headings before the first `#` and every `#` heading = top-level folds; `##` inside a
`#` chapter = sub-folds (listed in Jump to); `###` stay plain headings. Timestamp links seek the video on the page.
Video: 3Speak mes/ta0jgic7, its HLS manifest resolved at RUNTIME from play.3speak.tv/api/embed (hls.js), falling back to
the YouTube embed (zNdifMfnqcs) if 3Speak fails. The box links Dr. Judy Wood's original test PDF page, mes.fm/em-304-problem-1-judy-wood
(build_pdf_page.py), and its preview.jpg. Images: img/share.jpg (1200x630 og:image) and mes.fm/img/space-shuttle-columbia-icon.jpg
(900x600 /math tile), both crops of the video thumbnail.

    python3 build_em304_article.py              # dry run: report only
    python3 build_em304_article.py --apply      # write the page
    python3 build_em304_article.py --fetch      # refresh em304_src/ from the Hive API first (combine with --apply)

Never hand-edit the generated index.html; edit this script / the sources and re-run. After a run, also re-run
build_sitemap.py and build_search_index.py."""
import json, os, re, sys, html, subprocess, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
MES = os.path.join(ROOT, "mes.fm")
SRC = os.path.join(ROOT, "em304_src")
SLUG = "space-shuttle-columbia"
TEST_SLUG = "em-304-problem-1-judy-wood"   # build_pdf_page.py's page for Dr. Judy Wood's original test PDF
OUT = os.path.join(MES, SLUG, "index.html")
TEMPLATE = os.path.join(MES, "vector-functions-problems-plus", "index.html")
MARKED = os.path.join(MES, "vector-functions-problems-plus", "node_modules", "marked", "lib", "marked.esm.js")

AUTHOR, PERMLINK, COMMUNITY = "mes", "exam-problem-by-dr-judy-woo-59", "hive-128780"
PEAKD_URL = f"https://peakd.com/{COMMUNITY}/@{AUTHOR}/{PERMLINK}"
SPEAK = "mes/ta0jgic7"
YT_ID = "zNdifMfnqcs"
TITLE = "Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster"
DESC = ("Dr. Judy Wood's EM 304 exam problem from February 6, 2003: the Space Shuttle Columbia disaster as a thermal "
        "expansion problem. Full video solution and notes.")
OG_IMAGE = f"https://mes.fm/{SLUG}/img/share.jpg"
TEST_PDF = f"/{TEST_SLUG}"
NOTES_PDF = "https://mes.fm/space-shuttle-columbia-pdf"
esc = lambda t: html.escape(t, quote=True)

CSS = r"""
    /* ---- EM 304 / Columbia page (build_em304_article.py) ---- */
    .pdf-box { display: flex; align-items: center; gap: 0.9em; flex-wrap: wrap; margin: 1em 0 1.3em; padding: 0.75em 1em; border: 1px solid rgba(39,123,182,0.45); border-left: 5px solid #277bb6; border-radius: 0 8px 8px 0; background: rgba(39,123,182,0.07); }
    .pdf-box img { width: 96px; height: auto; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); margin: 0; }
    .pdf-box .pdf-box-text { flex: 1 1 14em; min-width: 0; }
    .pdf-box .pdf-box-title { display: block; font-weight: 700; margin-bottom: 0.25em; }
    .pdf-box a.pdf-box-link { display: inline-block; margin: 0.15em 1.1em 0.15em 0; font-weight: 600; }
    body.dark .pdf-box { background: rgba(108,182,245,0.08); border-color: rgba(108,182,245,0.4); border-left-color: #6cb6f5; }
    body.dark .pdf-box img { border-color: rgba(255,255,255,0.2); }
    .post-body a.ts-link { font-variant-numeric: tabular-nums; font-weight: 600; }
    .post-body { overflow-wrap: anywhere; }
"""

def fetch():
    req = urllib.request.Request("https://api.hive.blog", data=json.dumps({"jsonrpc": "2.0", "method": "bridge.get_post",
          "params": {"author": AUTHOR, "permlink": PERMLINK}, "id": 1}).encode(), headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=30))["result"]
    os.makedirs(SRC, exist_ok=True)
    open(os.path.join(SRC, "post.md"), "w", encoding="utf-8").write(r["body"])
    meta = {k: r[k] for k in ("author", "permlink", "category", "title", "created", "children", "reblogs")}
    meta["votes"] = r["stats"]["total_votes"]
    meta["image"] = r["json_metadata"]["image"][0]
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

def preprocess(md):
    lines = md.split("\n")
    # the post's first line is the bare 3Speak embed: the page puts its own player there
    lines = [l for l in lines if not re.match(r"^\s*https?://(play\.)?3speak\.tv/(embed|watch)\?v=" + re.escape(SPEAK) + r"\s*$", l)]
    md = "\n".join(lines)
    md = re.sub(r"\]\((mes\.fm/)", r"](https://\1", md)          # "[PDF Notes](mes.fm/...)" would be a relative link
    return md

def postprocess(body):
    # timestamp links: [2:19](https://3speak.tv/watch?v=mes/<permlink>&t=139) -> seek the player on this page
    def ts(m):
        href, text = m.group(1), m.group(2)
        if PERMLINK not in href or not re.fullmatch(r"\d+(:\d\d){1,2}", text):
            return m.group(0)
        tm = re.search(r"[?&]t=(\d+)", html.unescape(href))
        t = int(tm.group(1)) if tm else secs(text)
        return f'<a class="ts-link" data-t="{t}" href="{href}">{text}</a>'
    body = re.sub(r'<a href="([^"]+)">([^<]+)</a>', ts, body)
    # every post image lazy-loads except the first
    n = [0]
    def lazy(m):
        n[0] += 1
        return m.group(0) if n[0] == 1 or "loading=" in m.group(0) else m.group(0).replace("<img ", '<img loading="lazy" ', 1)
    body = re.sub(r"<img\b[^>]*>", lazy, body)
    return body

def video_html(poster):
    return ('<div class="video-embed" id="emVideoEmbed" google-side-rail-overlap="false">'
            f'<video id="speak-video-1" controls playsinline preload="metadata" poster="{esc(poster)}"></video>'
            '<button class="theater-toggle-btn wide-toggle-btn" type="button" aria-pressed="false" style="top:46px;">Wide View</button>'
            '<button class="theater-toggle-btn" type="button" aria-pressed="false" style="top:82px;">Theater Mode</button>'
            f'<a class="video-badge" href="https://3speak.tv/watch?v={SPEAK}" target="_blank" rel="noopener">View on 3Speak &nearr;</a>'
            '</div>\n')

PDF_BOX = (f'<div class="pdf-box"><a href="{TEST_PDF}"><img src="/{TEST_SLUG}/preview.jpg" width="96" height="50" alt="First page of the test"></a>'
           '<div class="pdf-box-text"><span class="pdf-box-title">The original test (PDF)</span>'
           f'<a class="pdf-box-link" href="{TEST_PDF}">View Dr. Judy Wood\'s test (PDF)</a>'
           f'<a class="pdf-box-link" href="{NOTES_PDF}">These notes as a PDF</a></div></div>\n')

def chapterize(body, poster):
    """Split the marked HTML at <h1>/<h2> into folds. Returns (html, toc[(id, label, sub)])."""
    heads = list(re.finditer(r"<h([12])>([\s\S]*?)</h\1>", body))
    seen, toc = {}, []
    def mkid(plain):
        s = slugify(plain); k = seen.get(s, 0) + 1; seen[s] = k
        return s if k == 1 else f"{s}-{k}"
    strip_hr = lambda s: re.sub(r"(\s*<hr>\s*)+$", "\n", s.strip() + "\n") if s.strip() else ""
    # chapters: list of dicts {id, title, intro, subs:[{id,title,content}]}
    chapters = [{"id": "overview", "title": "Full Video", "intro": video_html(poster) + PDF_BOX + body[:heads[0].start()] if heads else body, "subs": []}]
    seen["overview"] = 1
    seen_h1 = False
    for i, m in enumerate(heads):
        lvl, inner = m.group(1), m.group(2).strip()
        content = body[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)]
        plain = plain_text(inner)
        hid = mkid(plain)
        if lvl == "1" or not seen_h1:
            if lvl == "1":
                seen_h1 = True
            chapters.append({"id": hid, "title": inner, "label": plain, "intro": content, "subs": []})
        else:
            chapters[-1]["subs"].append({"id": hid, "title": inner, "label": plain, "content": content})
    out = []
    for ci, c in enumerate(chapters):
        toc.append((c["id"], c.get("label", c["title"]), False))
        inner = strip_hr(c["intro"]) if c["subs"] else strip_hr(c["intro"])
        subs = ""
        for s in c["subs"]:
            toc.append((s["id"], s["label"], True))
            subs += (f'<div class="chapter-toggle chapter-sub" id="{s["id"]}">\n'
                     f'<h2 class="chapter-toggle-header" onclick="toggleChapter(\'{s["id"]}-list\')">{s["title"]} <span id="arrowIcon-{s["id"]}-list" class="arrow-icon">&#9660;</span></h2>\n'
                     f'<div id="{s["id"]}-list" class="chapter-toggle-list">{strip_hr(s["content"])}</div>\n</div>\n')
        out.append((f'<div class="chapter-toggle" id="{c["id"]}">\n'
                    f'<h2 class="chapter-toggle-header chapter-top" onclick="toggleChapter(\'{c["id"]}-list\')"><center>{c["title"]} <span id="arrowIcon-{c["id"]}-list" class="arrow-icon">&#9660;</span></center></h2>\n'
                    f'<div id="{c["id"]}-list" class="chapter-toggle-list">{inner}{subs}</div>\n</div>\n'))
    return "<hr>\n".join(out), toc

VIDEO_JS = r"""<script>
    // speak-video-hls (build_em304_article.py): the 3Speak manifest is resolved at RUNTIME from play.3speak.tv/api/embed
    // (a re-upload keeps working without a rebuild); if 3Speak fails, the player swaps itself for the YouTube embed.
    // Timestamp links (a.ts-link[data-t]) seek whichever player is showing.
    (function () {
      var SLUG = '@@SPEAK@@', YT_ID = '@@YT@@';
      var embed = document.getElementById('emVideoEmbed');
      var video = document.getElementById('speak-video-1');
      if (!embed || !video) return;
      var fellBack = false, frame = null;
      function toYouTube(start) {
        if (fellBack) return;
        fellBack = true;
        frame = document.createElement('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID + (start ? '?start=' + start + '&autoplay=1' : '');
        frame.title = 'YouTube video';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        embed.replaceChild(frame, video);
        var badge = embed.querySelector('.video-badge');
        if (badge) { badge.href = 'https://youtu.be/' + YT_ID; badge.innerHTML = 'View on YouTube &nearr;'; }
        embed.classList.remove('controls-hidden');
      }
      function play(src) {
        if (!src) { toYouTube(); return; }
        if (window.Hls && Hls.isSupported()) {
          var hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, function (e, data) { if (data && data.fatal) toYouTube(); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
          video.addEventListener('error', function () { toYouTube(); });
        } else {
          toYouTube();
        }
      }
      fetch('https://play.3speak.tv/api/embed?v=' + SLUG)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { play(d && d.success !== false && d.videoUrl); })
        .catch(function () { toYouTube(); });

      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a.ts-link[data-t]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        var t = parseInt(a.getAttribute('data-t'), 10) || 0;
        var y = embed.getBoundingClientRect().top + window.pageYOffset - 70;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        if (fellBack) {
          if (frame) frame.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID + '?start=' + t + '&autoplay=1';
          return;
        }
        try { video.currentTime = t; } catch (err) {}
        var p = video.play(); if (p && p.catch) p.catch(function () {});
      });
    })();
  </script>""".replace("@@SPEAK@@", SPEAK).replace("@@YT@@", YT_ID)

def sub1(pattern, repl, text, flags=re.S):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n != 1:
        raise SystemExit(f"template drift: {pattern!r} matched {n}x")
    return new

def build():
    meta = json.load(open(os.path.join(SRC, "meta.json"), encoding="utf-8"))
    md = open(os.path.join(SRC, "post.md"), encoding="utf-8").read()
    body = postprocess(md_to_html(preprocess(md)))
    content, toc = chapterize(body, meta["image"])

    T = open(TEMPLATE, encoding="utf-8").read()
    head = f"""<meta name="description" content="{esc(DESC)}">
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
    T = sub1(r'<meta name="description".*?<!-- OG-TAGS:END -->', head, T)
    T = sub1(r"<title>.*?</title>", f"<title>{esc(TITLE)} | Math Easy Solutions</title>", T)
    i = T.index("</style>")
    T = T[:i] + CSS + T[i:]

    cls = ' class="toc-sub"'
    links = "\n".join(f'      <a{cls if sub else ""} href="#{i}">{esc(label)}</a>' for i, label, sub in toc)
    T = sub1(r'(?<=Collapse All</button>\n    </div>\n).*?(?=\n  </nav>)', links, T)
    T = sub1(r'(?<=<nav class="toc-links" aria-label="Table of contents">\n).*?(?=\n      </nav>)', links, T)

    T = sub1(r"<h1>.*?</h1>", f"<h1>{esc(TITLE)}</h1>", T)
    from datetime import datetime
    d = datetime.fromisoformat(meta["created"])
    date = f"{d.strftime('%B')} {d.day}, {d.year}"
    T = sub1(r'<div class="post-meta">.*?</div>',
             f'<div class="post-meta">\n      <span>By {esc(meta["author"])}</span>\n      <span>{date}</span>\n      <span>{meta["votes"]} votes</span>\n'
             f'      <span>{meta["children"]} comments</span>\n      <span>{meta["reblogs"]} reblogs</span>\n    </div>', T)
    T = T.replace("https://peakd.com/hive-128780/@mes/vector-functions-problems-p-729", PEAKD_URL)
    T = sub1(r'(?<=onclick="toggleAllChapters\(\)">Collapse All</button>\n</div>\n).*?(?=\n    </div>\n    <!-- FASTCOMMENTS-BLOCK)',
             content, T)
    T = sub1(r"<script>\s*// speak-video-hls:.*?</script>", VIDEO_JS, T)
    T = sub1(r'(?<=at build time \().*?(?=\) and are not live)', date, T)
    # a Jump-to link also unfolds the target's own fold (the shell only opened its ancestors, so a collapsed sub-fold
    # stayed shut after the jump)
    T = sub1(r"(?<=let target = document\.getElementById\(decodeURIComponent\(hash\.slice\(1\)\)\);\n      let list;\n)",
             "      const own = target && target.classList.contains('chapter-toggle') && document.getElementById(target.id + '-list');\n"
             "      if (own && own.classList.contains('hidden')) {\n"
             "        own.classList.remove('hidden');\n"
             "        const ownArrow = document.getElementById('arrowIcon-' + own.id);\n"
             "        if (ownArrow) ownArrow.textContent = '▲';\n"
             "      }\n", T)

    left = [s for s in ("vector-functions-problems-p-729", "Problems Plus", "playlistGrid\"", "speak-video-2") if s in T.split("<!-- FASTCOMMENTS-BLOCK")[0].split("<body")[1]]
    if left:
        raise SystemExit(f"leftover template text: {left}")
    return T, toc

if __name__ == "__main__":
    if "--fetch" in sys.argv:
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
