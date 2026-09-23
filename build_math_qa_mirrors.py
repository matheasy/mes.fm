#!/usr/bin/env python3
"""Generate the mes.fm/math-qa-<N>-<topic> mirror pages for the MES Math Q/A livestreams.

Input : math_qa_mirrors.json   (one record per stream -- see below)
        math_qa_mirror_template.html  (page shell, cut from mes.fm/math-qa-71-...)
Output: mes.fm/math-qa-<N>-<slug>/index.html for every record
        mes.fm/math/link-meta.json  (seeds each page's List View thumbnail + "Watch on"
                                     links, because a page that isn't deployed yet can't
                                     be scraped by mes.fm/math/build.mjs)

Each record in math_qa_mirrors.json:
  n, slug, title              stream number, URL slug (after "math-qa-<n>-"), topic title
  youtube_id                  the YouTube video (also the thumbnail source)
  source                      "hive"  -> text/images mirrored from a Hive post
                              "youtube" -> no Hive post exists, text from the YouTube description
  hive_permlink               (hive only) @mes/<permlink>
  text                        raw markdown body (Hive post) or plain description (YouTube)
  player                      "3speak" or "youtube"  -- what plays in the page's video box
  threespeak_slug             3Speak video slug (mes/<slug>), when the video exists there
  threespeak_api              true if play.3speak.tv/api/embed resolves it (newest streams)
  manifest                    verified HLS manifest URL used as the runtime fallback

Idempotent: re-running rewrites the same files.  Dry-run by default, pass --apply to write.
Never touches mes.fm/math/index.html / math-qa/index.html -- run `npm run build` in
mes.fm/math afterwards (see CLAUDE.md, "build.mjs pages").
"""
import html
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
DATA = ROOT / "math_qa_mirrors.json"
TEMPLATE = ROOT / "math_qa_mirror_template.html"
LINK_META = SITE / "math" / "link-meta.json"

RETRIEVED = "September 23, 2026"
PLAYLIST = "https://www.youtube.com/playlist?list=PLai3U8-WIK0F1GgkU63uA9NIncxDS2q0-"
PLATFORM_ORDER = ["3Speak", "YouTube", "Telegram", "BitChute", "Odysee", "Rumble", "X", "Twitch"]
LIST_VIEW_PLATFORMS = ["3Speak", "YouTube", "Telegram", "BitChute", "Odysee", "Rumble"]  # math/build.mjs

esc = html.escape


def esc_attr(s):
    return html.escape(s, quote=True)


# --------------------------------------------------------------------------- text parsing

DATE_RE = re.compile(
    r"^[#*\s]*([A-Z][a-z]+ \d{1,2}, \d{4})\s+[A-Za-z]+\s+at\s+(\d{1,2}:\d\d\s*[AP]M)\s*(?:P[SD]T)?[*\s]*$"
)
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
IMG_RE = re.compile(r"^!\[[^\]]*\]\((https?://[^)\s]+)\)\s*$")
PLATFORM_LABELS = {"YouTube", "Rumble", "Odysee", "BitChute", "X", "Twitch", "Telegram"}
# List items that the page already covers with its own "See more" row, or that are pure boilerplate.
DROP_BULLET_RE = re.compile(r"^(MES Math Q/A playlist|All Streams|MES Links)\b", re.I)


def cut_boilerplate(text):
    """Everything above the ---- separator / 'Become a MES Super Fan' footer block."""
    m = re.search(r"^-{8,}\s*$", text, re.M)
    cut = m.start() if m else len(text)
    m2 = re.search(r"^.{0,4}Become a MES Super Fan", text, re.M)
    if m2:
        cut = min(cut, m2.start())
    return text[:cut]


def inline(s):
    """Escape, then turn [t](u), **b** and bare URLs into HTML."""
    s = MD_LINK_RE.sub(lambda m: "\x00%s\x01%s\x02" % (m.group(2), m.group(1)), s)
    s = esc(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(
        r"(?<![\x00\x01\"'>=])(https?://[^\s<)\x00\x01\x02]+?)([.,;:!?]*)(?=\s|$|<)",
        lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>%s' % (m.group(1), m.group(1), m.group(2)),
        s,
    )
    s = re.sub(
        r"\x00(.+?)\x01(.+?)\x02",
        lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>' % (m.group(1), m.group(2)),
        s,
    )
    return s


def parse_content(text):
    """-> dict(paragraphs, date_line, images, extra_links, summary, platform_links)"""
    seg = cut_boilerplate(text)
    seg = re.sub(r"<center>.*?</center>", "", seg, flags=re.S)
    seg = re.sub(r"^https://play\.3speak\.tv/embed\?v=\S+\s*$", "", seg, flags=re.M)
    out = dict(paragraphs=[], date=None, images=[], extra=[], summary=None, platforms=[])
    for raw in seg.split("\n"):
        line = raw.strip()
        if not line or re.fullmatch(r"-{3,}", line) or re.fullmatch(r"\*{3,}", line):
            continue
        if re.fullmatch(r"(#\w+\s*)+", line):  # hashtag-only line
            continue
        if line.startswith("▶️") or "3speak.tv/watch" in line:  # the 3Speak player header
            continue
        m = DATE_RE.match(line)
        if m:
            out["date"] = (m.group(1), m.group(2))
            continue
        m = IMG_RE.match(line)
        if m:
            out["images"].append(m.group(1))
            continue
        # The "[YouTube](..) - [Rumble](..) - ... - https://mes.fm/math" row: platform links joined
        # by dashes, possibly ending in a bare URL.
        links = MD_LINK_RE.findall(line)
        rest = re.sub(r"https?://\S+", "", MD_LINK_RE.sub("", line))
        if links and links[0][0] in PLATFORM_LABELS and not re.sub(r"[\s-]", "", rest):
            out["platforms"] += [(lab, u) for lab, u in links if lab in PLATFORM_LABELS]
            continue
        if DROP_BULLET_RE.match(line):  # same rows, when the post didn't bullet them
            continue
        b = re.match(r"^[-*]\s+(.*)$", line)
        if b:
            item = b.group(1).strip()
            if DROP_BULLET_RE.match(item):
                continue
            m2 = re.match(r"^([^:]{2,60}):\s*(https?://\S+?)\s*\.?$", item)
            if m2:
                label, url = m2.group(1).strip(), m2.group(2)
                if label.lower() == "summary":
                    out["summary"] = url
                else:
                    out["extra"].append((label, url))
                continue
            if re.match(r"^summary:\s*soon", item, re.I):
                continue
            # unrecognised bullet: keep as prose
        out["paragraphs"].append(line)
    return out


def format_date(date_tuple):
    """('December 31, 2025', '10:00 AM') -> ('December 31, 2025', 'Wednesday, December 31, 2025 at 10:00 AM PST')
    Weekday and PST/PDT are computed, not copied -- the source posts have both wrong in places."""
    day, tm = date_tuple
    dt = datetime.strptime(day, "%B %d, %Y")
    t = datetime.strptime(tm.replace(" ", ""), "%I:%M%p")
    dt = dt.replace(hour=t.hour, minute=t.minute, tzinfo=ZoneInfo("America/Vancouver"))
    long = "%s, %s at %s %s" % (dt.strftime("%A"), day, tm.replace("  ", " "), dt.tzname())
    return day, long


# --------------------------------------------------------------------------- page assembly


def first_sentences(paragraphs, limit=180):
    for p in paragraphs:
        plain = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", p)
        plain = re.sub(r"[*#]", "", plain).strip()
        if plain.lower().startswith("if you have math related"):
            continue
        if len(plain) <= limit:
            return plain
        cut = plain[:limit].rsplit(" ", 1)[0]
        for i in range(limit, 60, -1):  # prefer ending on a sentence boundary
            if plain[i - 1] in ".?!" and i < len(plain):
                cut = plain[:i]
                break
        return cut.rstrip(",;: ") + ("" if cut.endswith((".", "?", "!")) else "...")
    return ""


def video_player_scripts(rec):
    """Only the 3Speak player needs scripts; a YouTube page is a plain iframe."""
    if rec["player"] != "3speak":
        return ""
    slug = rec["threespeak_slug"]
    api = "'mes/%s'" % slug if rec.get("threespeak_api") else "null"
    return (
        '  <script>\n'
        '    // auto-hide-controls: fades the theater-mode toggle and video badge out while\n'
        '    // the video is playing and the pointer is idle, and shows them again on any\n'
        '    // mouse movement or pause. Rebinds if the player falls back to YouTube.\n'
        '    (function () {\n'
        "      var embed = document.getElementById('videoEmbed');\n"
        '      var hideTimer = null;\n'
        "      function showControls() { embed.classList.remove('controls-hidden'); }\n"
        '      function scheduleHide() {\n'
        '        clearTimeout(hideTimer);\n'
        "        var video = document.getElementById('qVideo');\n"
        '        if (!video || video.paused || video.ended) return;\n'
        "        hideTimer = setTimeout(function () { embed.classList.add('controls-hidden'); }, 2000);\n"
        '      }\n'
        "      var v = document.getElementById('qVideo');\n"
        "      v.addEventListener('play', scheduleHide);\n"
        "      v.addEventListener('pause', showControls);\n"
        "      v.addEventListener('ended', showControls);\n"
        "      embed.addEventListener('mousemove', function () { showControls(); scheduleHide(); });\n"
        "      embed.addEventListener('mouseleave', scheduleHide);\n"
        '    })();\n'
        '  </script>\n\n'
        '  <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>\n'
        '  <script>\n'
        '    // q-video: plays the 3Speak-hosted HLS stream for this livestream directly (via hls.js),\n'
        '    // like mes.fm/math-qa-71-conservation-angular-momentum. The manifest URL is resolved at\n'
        "    // runtime from 3Speak's public embed API where it exists (newer streams); older videos\n"
        '    // 404 there, so FALLBACK_SRC -- the manifest from the Hive post\'s own video metadata,\n'
        '    // verified at build time -- is used. If playback fails outright the player swaps itself\n'
        '    // for the YouTube embed of the same stream.\n'
        '    (function () {\n'
        "      var video = document.getElementById('qVideo');\n"
        "      var embed = document.getElementById('videoEmbed');\n"
        '      var SLUG = %s;\n'
        "      var FALLBACK_SRC = '%s';\n"
        "      var YT_ID = '%s';\n"
        '      var fellBack = false;\n\n'
        '      function toYouTube() {\n'
        '        if (fellBack) return;\n'
        '        fellBack = true;\n'
        "        var frame = document.createElement('iframe');\n"
        "        frame.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID;\n"
        "        frame.title = 'YouTube video';\n"
        "        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';\n"
        '        frame.allowFullscreen = true;\n'
        '        embed.replaceChild(frame, video);\n'
        "        var badge = embed.querySelector('.video-badge');\n"
        "        badge.href = 'https://www.youtube.com/watch?v=' + YT_ID;\n"
        "        badge.innerHTML = 'View on YouTube &nearr;';\n"
        "        embed.classList.remove('controls-hidden');\n"
        '      }\n\n'
        '      function play(src) {\n'
        "        if (video.canPlayType('application/vnd.apple.mpegurl')) {\n"
        '          video.src = src;\n'
        "          video.addEventListener('error', toYouTube);\n"
        '        } else if (window.Hls && Hls.isSupported()) {\n'
        '          var hls = new Hls();\n'
        '          hls.loadSource(src);\n'
        '          hls.attachMedia(video);\n'
        '          hls.on(Hls.Events.ERROR, function (e, data) { if (data && data.fatal) toYouTube(); });\n'
        '        } else {\n'
        '          toYouTube();\n'
        '        }\n'
        '      }\n\n'
        '      if (!SLUG) { play(FALLBACK_SRC); return; }\n'
        "      fetch('https://play.3speak.tv/api/embed?v=' + SLUG)\n"
        '        .then(function (r) { return r.ok ? r.json() : null; })\n'
        '        .then(function (d) { play((d && d.videoUrl) || FALLBACK_SRC); })\n'
        '        .catch(function () { play(FALLBACK_SRC); });\n'
        '    })();\n'
        '  </script>'
    ) % (api, rec.get("manifest") or "", rec["youtube_id"])


def watch_links(rec, parsed):
    """[(label, href)] for the 'Watch on:' row, in PLATFORM_ORDER."""
    found = {}
    if rec.get("threespeak_ok"):
        found["3Speak"] = "https://3speak.tv/watch?v=mes/%s" % rec["threespeak_slug"]
    found["YouTube"] = "https://www.youtube.com/watch?v=%s" % rec["youtube_id"]
    for label, url in parsed["platforms"]:
        if label == "YouTube":
            found["YouTube"] = url  # the post's own link (youtube.com/live/...)
        else:
            found.setdefault(label, url)
    return [(lab, found[lab]) for lab in PLATFORM_ORDER if lab in found]


def build_page(rec, template):
    parsed = parse_content(rec["text"])
    n, title = rec["n"], rec["title"]
    full_title = "MES Math Q/A %d: %s" % (n, title)
    slug = "math-qa-%d-%s" % (n, rec["slug"])
    hive = rec["source"] == "hive"
    yt_url = "https://www.youtube.com/watch?v=%s" % rec["youtube_id"]
    thumb = "https://i.ytimg.com/vi/%s/maxresdefault.jpg" % rec["youtube_id"]
    hive_url = "https://peakd.com/hive-128780/@mes/%s" % rec["hive_permlink"] if hive else None

    date_short = date_long = None
    if parsed["date"]:
        date_short, date_long = format_date(parsed["date"])

    blurb = first_sentences(parsed["paragraphs"]) or "Math and physics questions answered live."
    desc = "MES Math Q/A %d livestream: %s %s Mirrored from %s." % (
        n, title if title.endswith("?") else title + ".", blurb, "the Hive blockchain" if hive else "YouTube",
    )
    desc = re.sub(r"\s+", " ", desc).strip()

    origin = (
        'mirrored from the <a href="%s">Hive blockchain</a>' % esc_attr(hive_url)
        if hive
        else 'mirrored from <a href="%s">YouTube</a>' % esc_attr(yt_url)
    )
    subtitle = "Livestream Q/A &middot; %s%s" % ((esc(date_short) + " &middot; ") if date_short else "", origin)

    # ---- video box
    if rec["player"] == "3speak":
        video_box = (
            '      <div class="video-embed" id="videoEmbed" google-side-rail-overlap="false">\n'
            '        <video id="qVideo" controls playsinline preload="metadata" poster="%s"></video>\n'
            '        <button class="theater-toggle-btn" id="theaterToggle" type="button" aria-pressed="false">Theater Mode</button>\n'
            '        <a class="video-badge" href="https://3speak.tv/watch?v=mes/%s" target="_blank" rel="noopener">View on 3Speak &nearr;</a>\n'
            "      </div>"
        ) % (esc_attr(thumb), esc_attr(rec["threespeak_slug"]))
    else:
        video_box = (
            '      <div class="video-embed" id="videoEmbed" google-side-rail-overlap="false">\n'
            '        <iframe src="https://www.youtube-nocookie.com/embed/%s" title="YouTube video" '
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
            'allowfullscreen loading="lazy"></iframe>\n'
            '        <button class="theater-toggle-btn" id="theaterToggle" type="button" aria-pressed="false">Theater Mode</button>\n'
            '        <a class="video-badge" href="%s" target="_blank" rel="noopener">View on YouTube &nearr;</a>\n'
            "      </div>"
        ) % (esc_attr(rec["youtube_id"]), esc_attr(yt_url))

    # ---- article body
    parts = [video_box, ""]
    for p in parsed["paragraphs"]:
        parts.append("      <p>%s</p>\n" % inline(p))
    if date_long:
        parts.append("      <p>Livestreamed on %s.</p>\n" % esc(date_long))
    for img in parsed["images"]:
        parts.append(
            '      <img src="%s" alt="" style="max-width:100%%;height:auto;border-radius:4px;display:block;margin:0.6em 0 1.4em;">\n'
            % esc_attr(img)
        )

    wl = watch_links(rec, parsed)
    li = [
        "        <li>Watch on: %s</li>"
        % " &middot; ".join('<a href="%s" target="_blank" rel="noopener">%s</a>' % (esc_attr(h), esc(l)) for l, h in wl)
    ]
    if parsed["summary"]:
        li.append(
            '        <li>Summary: <a href="%s" target="_blank" rel="noopener">%s</a></li>'
            % (esc_attr(parsed["summary"]), esc("MES Math Q/A %d summary" % n))
        )
    for label, url in parsed["extra"]:
        li.append('        <li>%s: <a href="%s" target="_blank" rel="noopener">%s</a></li>' % (esc(label), esc_attr(url), esc(url)))
    li.append(
        '        <li>See more: <a href="%s" target="_blank" rel="noopener">MES Math Q/A YouTube Playlist</a></li>' % esc_attr(PLAYLIST)
    )
    li.append('        <li>More math: <a href="https://mes.fm/math">mes.fm/math</a></li>')
    parts.append('      <ul class="source-list">\n%s\n      </ul>\n' % "\n".join(li))
    parts.append("      <hr>\n")
    if hive:
        parts.append(
            '      <a class="source-link" href="%s" target="_blank" rel="noopener">Originally posted on the Hive blockchain &rarr;</a>\n'
            '      <div class="retrieved-note">Text and image retrieved from the Hive blockchain on %s.</div>'
            % (esc_attr(hive_url), RETRIEVED)
        )
    else:
        parts.append(
            '      <a class="source-link" href="%s" target="_blank" rel="noopener">Originally streamed on YouTube &rarr;</a>\n'
            '      <div class="retrieved-note">Text retrieved from YouTube on %s.</div>' % (esc_attr(yt_url), RETRIEVED)
        )

    page = (
        template.replace("@@DESC@@", esc_attr(desc))
        .replace("@@SLUG@@", slug)
        .replace("@@TITLE@@", esc_attr(full_title))
        .replace("@@OGIMAGE@@", esc_attr(thumb))
        .replace("@@SUBTITLE@@", subtitle)
        .replace("@@VIDEO_SCRIPTS@@", video_player_scripts(rec))
        .replace("@@ARTICLE@@", "\n".join(parts))
    )
    assert "@@" not in page
    meta = {
        "image": thumb,
        "watchLinks": [{"label": l, "href": h} for l, h in wl if l in LIST_VIEW_PLATFORMS or l in ("X", "Twitch")],
        "namedLinks": [
            {"label": "See more", "href": PLAYLIST},
            {"label": "More math", "href": "https://mes.fm/math"},
        ],
    }
    return slug, page, meta


def main():
    apply = "--apply" in sys.argv
    records = json.loads(DATA.read_text(encoding="utf8"))
    template = TEMPLATE.read_text(encoding="utf8")
    link_meta = json.loads(LINK_META.read_text(encoding="utf8"))
    written = unchanged = 0
    for rec in sorted(records, key=lambda r: -r["n"]):
        slug, page, meta = build_page(rec, template)
        path = SITE / slug / "index.html"
        old = path.read_text(encoding="utf8") if path.exists() else None
        link_meta["https://mes.fm/" + slug] = meta
        if old == page:
            unchanged += 1
            continue
        written += 1
        print("%s %s (%s player, %s)" % ("write " if apply else "would write", slug, rec["player"], rec["source"]))
        if apply:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(page, encoding="utf8")
    if apply:
        LINK_META.write_text(json.dumps(link_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print("%d written/would-write, %d unchanged%s" % (written, unchanged, "" if apply else "  (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
