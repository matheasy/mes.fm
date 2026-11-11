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
`#` chapter = sub-folds (listed in Jump to); `###` stay plain headings. Timestamp links seek the video on the page, and main_js/video-chapters.js (inherited from the shell's
script tags) turns them into a chapter bar + Chapters list under the player.
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

# Short clips cut from the full video (YouTube playlist PLAYLIST). Each gets its own mirror page (child-template.html shell,
# like the cubic-formula step pages): the clip's own Hive / 3Speak post + the matching sections of the full article's notes
# (`notes` = the `##` headings of em304_src/post.md), and a card in the Playlist chapter of the main page. `permlink` is
# found by title among @mes's posts on --fetch when empty; the post is cached in em304_src/children/<slug>.md / .json.
PLAYLIST = "https://www.youtube.com/playlist?list=PLEJOImrX4SIc"
CHILD_TEMPLATE = os.path.join(MES, "cubic-formula", "child-template.html")
CHILDREN = [
    dict(slug="columbia-disaster-introduction", permlink="introduction-and-space-shut-435", youtube="Gto7JxSO0rg",
         title="Introduction and Space Shuttle Columbia Disaster News Footage",
         notes=["Introduction: EM 304 Test Problem 1", "Live Footage of the Space Shuttle Columbia Disaster"],
         fix={"resident's house being shook on Ear\n": "resident's house being shook on Earth\n"},
         links=[("Rumble", "https://rumble.com/v7hu8xs-introduction-and-space-shuttle-columbia-disaster-news-footage.html"),
                ("Odysee", "https://odysee.com/@mes:8/Columbia-Disaster-Introduction:2"),
                ("BitChute", "https://www.bitchute.com/video/mfS5XRG5O9mz/"),
                ("Telegram", "https://t.me/meslinks/35675")]),
    dict(slug="mechanics-materials-review", permlink="review-of-mechanics-of-mate-789", youtube="IgncLmqQRQc",
         title="Review of Mechanics of Materials: Strain, Stress, Shear, Thermal Expansion",
         notes=["Solution: Review of Mechanics of Materials"],
         fix={"divided by that cross section\n": "divided by that cross section area\n",
              "divided by the axial strain (a negative sign is\n": "divided by the axial strain (a negative sign is included so the ratio is positive)\n"},
         links=[("Rumble", "https://rumble.com/v7hzf0m-review-of-mechanics-of-materials-strain-stress-shear-thermal-expansion.html"),
                ("Odysee", "https://odysee.com/@mes:8/mechanics-materials-review:1"),
                ("BitChute", "https://www.bitchute.com/video/m8QRoHi2RV9p/"),
                ("Telegram", "https://t.me/meslinks/35686")]),
    dict(slug="em-304-failure-temperature-columbia", permlink="em-304-exam-problem-failure-698", youtube="bHyGhXQw2zM",
         title="EM 304 Exam Problem: Failure Temperature of the Space Shuttle Columbia",
         notes=["Problem 1 of EM 304 – Test #1 – February 6, 2003",
                "Solution to Part (a): Maximum temperature without failure",
                "Solution to part (b): Where it fails first",
                "Solution to part (c): Stress state at the failure temperature",
                "Solution to part (d): Volume-element sketches",
                "Summary of the Engineering Logic"],
         fix={
              'Three questions: Determine maximum temperature of the aluminum tube before failure, first failure lo\n': 'Three questions: Determine maximum temperature of the aluminum tube before failure, first failure location, stress states at the three volume elements, and draw these stress state diagrams.\n',
              'Location descriptions: Point A is inside the top plate, B is the surface between the plate and tube,\n': 'Location descriptions: Point A is inside the top plate, B is the surface between the plate and tube, Point C is the outer surface of the aluminum tube.\n',
              'Thermal expansion properties: Support plates are idealized as perfectly rigid and non-expanding, whi\n': 'Thermal expansion properties: Support plates are idealized as perfectly rigid and non-expanding, while the aluminum tube uses the 2014-T6 aluminum alloy properties.\n',
              'The aluminum tube is assumed to be of constant length, which means the thermal expansion displacemen\n': 'The aluminum tube is assumed to be of constant length, which means the thermal expansion displacement is equal to the resulting compressive displacement.\n',
              'Plates are idealized as rigid and non-expanding, so we have to scale up the temperature of the alumi\n': 'Plates are idealized as rigid and non-expanding, so we have to scale up the temperature of the aluminum tube by the ratio of the plate to tube compressive strength limits and obtain failure temperature of 515.9 °F at point B.\n',
              'By equilibrium, we obtain a formula for the compressive stress in the tube as a function of the shea\n': 'By equilibrium, we obtain a formula for the compressive stress in the tube as a function of the shear stress in the plate and the ratio of the shear area to compressive area\n',
              'Solution to (b): It fails at point A first, shear in the plate, because its failure temperature is t\n': 'Solution to (b): It fails at point A first, shear in the plate, because its failure temperature is the lowest\n',
              'Obtain compressive stress in the aluminum from the shear stress in the plate using our earlier deriv\n': 'Obtain compressive stress in the aluminum from the shear stress in the plate using our earlier derived formula, and get 27.8 ksi, which is also the uniaxial compressive stress at point C and bearing stress at point B. This stress is well below the plate and tube allowable compressive stresses\n',
              'Summary of the Engineering Logic: Compressive stress in the tube causes failure in shear at the plat\n': 'Summary of the Engineering Logic: Compressive stress in the tube causes failure in shear at the plate, even though the compressive stress is far below its strength limit\n'},
         links=[("Rumble", "https://rumble.com/v7i69g0-em-304-exam-problem-failure-temperature-of-the-space-shuttle-columbia.html"),
                ("Odysee", "https://odysee.com/@mes:8/em-304-failure-temperature-columbia:c"),
                ("BitChute", "https://www.bitchute.com/video/398VBStUrIHX/"),
                ("Telegram", "https://t.me/meslinks/35702")]),
]
CHILD_SRC = os.path.join(SRC, "children")

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
    os.makedirs(CHILD_SRC, exist_ok=True)
    for c in CHILDREN:
        pl = c["permlink"]
        if not pl:
            posts = hive("bridge.get_account_posts", {"account": AUTHOR, "sort": "posts", "limit": 20})
            pl = next((p["permlink"] for p in posts if p["title"].strip() == c["title"]), "")
            if not pl:
                print(f"  {c['slug']}: no Hive post titled {c['title']!r} yet -- skipped")
                continue
        p = hive("bridge.get_post", {"author": AUTHOR, "permlink": pl})
        open(os.path.join(CHILD_SRC, c["slug"] + ".md"), "w", encoding="utf-8").write(p["body"])
        jm = p["json_metadata"]
        meta = {k: p[k] for k in ("author", "permlink", "category", "title", "created")}
        meta["image"] = (jm.get("image") or [""])[0]
        meta["speak"] = (jm.get("video") or {}).get("info", {}).get("permlink") or ""
        json.dump(meta, open(os.path.join(CHILD_SRC, c["slug"] + ".json"), "w"), indent=1)
        print("fetched", c["slug"], "<-", pl)

def hive(method, params):
    req = urllib.request.Request("https://api.hive.blog", data=json.dumps({"jsonrpc": "2.0", "method": method,
          "params": params, "id": 1}).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))["result"]

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
        // enablejsapi: main_js/video-chapters.js drives this iframe through the YouTube IFrame API (chapter bar, seeking)
        frame.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID + '?enablejsapi=1&origin=' + encodeURIComponent(location.origin) +
          (start ? '&start=' + start + '&autoplay=1' : '');
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
        // video-chapters.js seeks whichever player is showing (the <video> or the YouTube iframe, without reloading it)
        if (window.MESChapters && window.MESChapters.seek(t, embed)) return;
        var y = embed.getBoundingClientRect().top + window.pageYOffset - 70;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        if (fellBack) {
          if (frame) frame.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID + '?enablejsapi=1&start=' + t + '&autoplay=1';
          return;
        }
        try { video.currentTime = t; } catch (err) {}
        var p = video.play(); if (p && p.catch) p.catch(function () {});
      });
    })();
  </script>""".replace("@@SPEAK@@", SPEAK).replace("@@YT@@", YT_ID)

def child_data(c):
    """The cached Hive post of a clip, or None before it has been fetched."""
    mp = os.path.join(CHILD_SRC, c["slug"] + ".json")
    if not os.path.exists(mp):
        return None
    meta = json.load(open(mp, encoding="utf-8"))
    body = open(os.path.join(CHILD_SRC, c["slug"] + ".md"), encoding="utf-8").read()
    m = re.search(r"3speak\.tv/(?:embed|watch)\?v=([\w.-]+/[\w-]+)", body)
    meta["speak"] = m.group(1) if m else ""
    return meta, body

def notes_md(main_md, headings):
    """The `#` / `## heading` sections of the full article (each up to the next `#`/`##` heading), joined."""
    out = []
    for h in headings:
        m = re.search(r"^#{1,2}\s+" + re.escape(h) + r"\s*$([\s\S]*?)(?=^#{1,2}\s)", main_md, re.M)
        if not m:
            raise SystemExit(f"notes section not found in em304_src/post.md: {h!r}")
        out.append(f"## {h}\n" + re.sub(r"(\s*^---\s*)+\Z", "", m.group(1).rstrip(), flags=re.M) + "\n")
    return "\n".join(out)

CHILD_CSS = r"""
    /* build_em304_article.py clip pages */
    .em-notes h2 { margin-top: 1.2em; }
    .em-notes img { max-width: 100%; height: auto; border-radius: 4px; }
    .em-notes blockquote { margin: 1em 0; padding: 0.4em 1em; border-left: 4px solid #277bb6; background: rgba(39,123,182,0.07); }
    body.dark .em-notes blockquote { border-left-color: #6cb6f5; background: rgba(108,182,245,0.08); }
    article a.ts-link { font-variant-numeric: tabular-nums; font-weight: 600; }
    article { overflow-wrap: anywhere; }
"""

# the clip player: same runtime-3Speak / YouTube-fallback / timestamp-seek logic as VIDEO_JS, on the child template's ids
CHILD_JS = ('  <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>\n'
            '  <script src="/main_js/video-speed-hold.js?v=1" defer></script>\n'
            '  <script src="/main_js/video-chapters.js?v=1" defer></script>\n  ')

def child_scripts(c, speak):
    js = VIDEO_JS.replace("'" + SPEAK + "'", "'" + speak + "'").replace("'" + YT_ID + "'", "'" + c["youtube"] + "'")
    js = js.replace("getElementById('emVideoEmbed')", "getElementById('videoEmbed')").replace("getElementById('speak-video-1')", "getElementById('qVideo')")
    js = js.replace("// speak-video-hls (build_em304_article.py)", "// clip player (build_em304_article.py)")
    return CHILD_JS + js

def child_article(c, meta, desc, notes, imgs, main_title):
    speak, poster = meta["speak"], meta["poster"]
    watch_html = " &middot; ".join(f'<a href="{esc(h)}" target="_blank" rel="noopener">{esc(l)}</a>' for l, h in meta["watch"])
    thumb = "".join(f'\n      <img loading="lazy" src="{esc(u)}" alt="{esc(meta["title"])}" style="max-width:100%;height:auto;border-radius:4px;display:block;margin:1.2em 0;">' for u in imgs)
    return (f'      <div class="video-embed" id="videoEmbed" google-side-rail-overlap="false">\n'
            f'        <video id="qVideo" controls playsinline preload="metadata" poster="{esc(poster)}"></video>\n'
            '        <button class="theater-toggle-btn" id="wideToggle" type="button" aria-pressed="false" style="top:46px;">Wide View</button>\n'
            '        <button class="theater-toggle-btn" id="theaterToggle" type="button" aria-pressed="false" style="top:82px;">Theater Mode</button>\n'
            f'        <a class="video-badge" href="https://3speak.tv/watch?v={speak}" target="_blank" rel="noopener">View on 3Speak &nearr;</a>\n'
            '      </div>\n\n' + desc +
            '\n      <details class="written-solution em-notes" open>\n'
            f'        <summary>Notes: {esc(", ".join(c["notes"]))}</summary>\n'
            f'        <p class="ws-note">Written notes &mdash; mirrored from <a href="/{SLUG}">{esc(main_title)}</a>, which has the full video and the complete solution.</p>\n'
            + notes + '      </details>\n\n      <ul class="source-list">\n'
            f'        <li>Watch on: {watch_html}</li>\n'
            f'        <li>Full video and written notes: <a href="/{SLUG}">{esc(main_title)}</a></li>\n'
            f'        <li>Playlist: <a href="{PLAYLIST}" target="_blank" rel="noopener">Space Shuttle Columbia Disaster YouTube playlist</a></li>\n'
            '        <li>More math: <a href="https://mes.fm/math">mes.fm/math</a></li>\n      </ul>\n'
            + thumb + '\n      <hr>\n\n'
            f'      <a class="source-link" href="{meta["peakd"]}" target="_blank" rel="noopener">Originally posted on the Hive blockchain &rarr;</a>\n'
            f'      <div class="retrieved-note">Text and image retrieved from the Hive blockchain on {meta["date"]}.</div>')

def build_child(c, main_md, main_title):
    got = child_data(c)
    if not got:
        return None
    meta, body = got
    if f"mes.fm/{c['slug']}" not in body:
        raise SystemExit(f"{c['slug']}: the Hive post @{meta['author']}/{meta['permlink']} does not link mes.fm/{c['slug']} (wrong post?)")
    md = re.split(r"\n---+\s*\n\s*▶", body)[0]                        # 3Speak's "Watch on 3speak.tv" footer
    md = re.sub(r"^#### Video Links\n(?:\[[^\n]*\]\([^)\n]*\)\s*\n)*", "", md, flags=re.M)   # repeats the Watch on links
    md = re.sub(r"^#### Video Chapters\s*\n", "", md, flags=re.M)    # 3Speak's heading under our own "Timestamps:"
    for a, b in c.get("fix", {}).items():                              # chapter titles 3Speak cut short
        md = md.replace(a, b)
    md = "\n".join(l for l in md.split("\n") if not re.match(r"^\s*https?://(play\.)?3speak\.tv/(embed|watch)\?v=", l))
    imgs = re.findall(r"^!\[[^\]]*\]\((https?://[^)\s]+)\)\s*$", md, re.M)
    md = re.sub(r"^!\[[^\]]*\]\((https?://[^)\s]+)\)\s*$\n?", "", md, flags=re.M)      # the thumbnail goes to the bottom
    desc = md_to_html(md)
    def ts(m):
        t = secs(m.group(1))
        return f'<li><a class="ts-link" data-t="{t}" href="https://youtu.be/{c["youtube"]}?t={t}">{m.group(1)}</a>'
    desc = re.sub(r"<li>(\d+:\d\d(?::\d\d)?)(?=\s)", ts, desc)
    def ts3(m):                                                        # 3Speak chapter links -> seek this page's player
        t = int(m.group(1) or 0)
        return f'<li><a class="ts-link" data-t="{t}" href="https://youtu.be/{c["youtube"]}?t={t}">{m.group(2)}</a>'
    desc = re.sub(r'<li><a href="https://3speak\.tv/watch\?v=[\w./-]+?(?:&(?:amp;)?t=(\d+))?">(\d+:\d\d(?::\d\d)?)</a>', ts3, desc)
    notes = md_to_html(notes_md(main_md, c["notes"]))
    notes = re.sub(r"<img (?!loading)", '<img loading="lazy" ', notes)
    notes = re.sub(r'<a href="(https?://)', r'<a target="_blank" rel="noopener" href="\1', notes)
    meta["poster"] = meta.get("image") or (imgs[0] if imgs else "")
    first = plain_text((re.search(r"<p>([\s\S]*?)</p>", desc) or [None, ""])[1])
    blurb = first if len(first) <= 190 else (first[:190].rsplit(" ", 1)[0].rstrip(",;:") + "...")
    from datetime import datetime
    d = datetime.fromisoformat(meta["created"])
    meta["date"] = f"{d.strftime('%B')} {d.day}, {d.year}"
    meta["peakd"] = f"https://peakd.com/{meta['category']}/@{meta['author']}/{meta['permlink']}"
    speak = meta["speak"]
    meta["watch"] = [("3Speak", f"https://3speak.tv/watch?v={speak}" if speak else meta["peakd"]),
                     ("YouTube", f"https://youtu.be/{c['youtube']}")] + c["links"]
    note_links = " &middot; ".join(f'<a href="/{SLUG}#{slugify(h)}">{esc(h)}</a>' for h in c["notes"])
    og = (f"https://mes.fm/{c['slug']}/img/share.jpg" if os.path.exists(os.path.join(MES, c["slug"], "img", "share.jpg"))
          else meta["poster"])
    T = open(CHILD_TEMPLATE, encoding="utf-8").read()
    rep = {"@@DESC@@": esc(f"{meta['title']}. {blurb}"), "@@SLUG@@": c["slug"], "@@TITLE@@": esc(meta["title"]),
           "@@OGIMAGE@@": esc(og),
           "@@PARTOF@@": f'Part of <a href="/{SLUG}">{esc(main_title)}</a> &middot; {note_links}',
           "@@SUBTITLE@@": f'Video &middot; {meta["date"]} &middot; mirrored from the <a href="{meta["peakd"]}">Hive blockchain</a>',
           "@@VIDEO_SCRIPTS@@": child_scripts(c, speak),
           "@@ARTICLE@@": child_article(c, meta, desc, notes, imgs, main_title)}
    for k, v in rep.items():
        T = T.replace(k, v)
    if "@@" in T:
        raise SystemExit(f"unfilled placeholder in {c['slug']}")
    i = T.index("</style>")
    T = T[:i] + CHILD_CSS + T[i:]
    return T, {"title": meta["title"], "image": meta["poster"], "watch": meta["watch"], "url": f"https://mes.fm/{c['slug']}"}

LP_SITES = ("youtube", "3speak", "rumble", "odysee", "bitchute", "telegram")

def playlist_chapter(cards):
    """Grid View / List View of the clip pages, in the markup the Problems Plus shell already styles and wires."""
    grid, rows = [], []
    for k in cards:
        attrs = f'data-lp-def="mes" data-l-mes="{esc(k["url"])}"' + "".join(
            f' data-l-{l.lower()}="{esc(h)}"' for l, h in k["watch"] if l.lower() in LP_SITES)
        grid.append(f'<a class="link-card lp-a" {attrs} href="{esc(k["url"])}">\n'
                    f'  <span class="link-card-thumb" style="background-image:url(\'{esc(k["image"])}\')"></span>\n'
                    '  <span class="link-card-body">\n'
                    f'    <span class="link-card-title">{esc(k["title"])}</span>\n'
                    '    <span class="link-card-readmore"><span class="lp-ic" data-s="mes" aria-hidden="true"></span><span class="lp-name">View on MES.fm</span> &rarr;</span>\n'
                    '  </span>\n</a>')
        links = [("Notes", k["url"])] + k["watch"]
        rows.append(f'<h2><a class="lp-a" href="{esc(k["url"])}" {attrs}>{esc(k["title"])}<span class="lp-ic" data-s="mes" aria-hidden="true"></span></a></h2>\n'
                    "<p>" + " - ".join(f'<a href="{esc(h)}" target="_blank" rel="noopener">{esc(l)}</a>' for l, h in links) + "</p>\n"
                    f'<img loading="lazy" class="playlist-row-thumb" src="{esc(k["image"])}" alt="">')
    return ('<div class="chapter-toggle" id="playlist">\n'
            '<h2 class="chapter-toggle-header chapter-top" onclick="toggleChapter(\'playlist-list\')"><center>Playlist <span id="arrowIcon-playlist-list" class="arrow-icon">&#9660;</span></center></h2>\n'
            '<div id="playlist-list" class="chapter-toggle-list">\n'
            f'<p>Short clips from the full video, each with its own page and notes. YouTube playlist: <a href="{PLAYLIST}" target="_blank" rel="noopener">Space Shuttle Columbia Disaster</a></p>\n'
            '<div class="view-toggle">\n  <button type="button" class="view-toggle-btn active" id="playlistGridBtn">Grid View</button>\n'
            '  <button type="button" class="view-toggle-btn" id="playlistListBtn">List View</button>\n</div>\n'
            '<div class="card-grid" id="playlistGrid">\n' + "\n".join(grid) + '\n</div>\n'
            '<div class="playlist-list-view view-hidden" id="playlistList">\n' + "\n".join(rows) + '\n</div>\n</div>\n</div>\n')

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
    children = [r for r in (build_child(c, md, TITLE) for c in CHILDREN) if r]
    if children:
        content = playlist_chapter([k for _, k in children]) + "<hr>\n" + content
        toc.insert(0, ("playlist", "Playlist", False))

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

    left = [s for s in ("vector-functions-problems-p-729", "Problems Plus", "speak-video-2") if s in T.split("<!-- FASTCOMMENTS-BLOCK")[0].split("<body")[1]]
    if left:
        raise SystemExit(f"leftover template text: {left}")
    return T, toc, children

if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch()
    out, toc, children = build()
    sys.path.insert(0, ROOT)
    from add_hive_marker import mark_html
    out = mark_html(out)[0]                # <meta name="mes:hive"> for the Hive comments tab
    apply = "--apply" in sys.argv
    print(f"{len(out)} bytes, {sum(1 for t in toc if not t[2])} chapters, {sum(1 for t in toc if t[2])} sub-folds -> "
          f"{os.path.relpath(OUT, ROOT)}" + ("" if apply else "   (dry run; pass --apply to write)"))
    if "-v" in sys.argv:
        for i, label, sub in toc:
            print(("    " if sub else "  ") + f"#{i}  {label}")
    for c, (page, k) in zip([c for c in CHILDREN if child_data(c)], children):
        dest = os.path.join(MES, c["slug"], "index.html")
        print(f"  clip page {len(page)} bytes -> {os.path.relpath(dest, ROOT)}")
        if apply:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, "w", encoding="utf-8").write(mark_html(page)[0])
    if apply:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(out)
