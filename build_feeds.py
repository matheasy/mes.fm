#!/usr/bin/env python3
"""
build_feeds.py -- RSS feeds for mes.fm (2026-11-23), with Podcasting 2.0 channel tags so Podping can announce them.

Writes mes.fm/feeds/<id>.xml, mes.fm/feeds/index.json (the /feeds page and its Podping button read it) and keeps
mes.fm/feeds/dates.json (a cache of YouTube upload dates, never thrown away).

Feeds (FEEDS below):
  everything   the newest items of every feed below
  tools        every calculator / tool card on calculators.html + tools.html; date = when its page was first added to git
  posts        every mes.fm page listed in a hub's sections.mjs (911, 9/11 Spooks, Hutchison, Conspiracy, Science,
               Crypto, BG, MH370, Mathiew), one feed per hub too; date = when the page was first added to git
  livestreams  MES Livestreams (livestreams/playlist.json), linking the mes.fm mirror when one exists
  youtube      MES (Math Easy Solutions) YouTube videos (math/youtube-videos.json)
  mestruth     MES Truth YouTube videos (math/youtube-mestruth-videos.json)

Dates are real, never guessed: git add dates for pages, and for YouTube the channel's own RSS feed (exact, newest 15) or
yt-dlp (--fetch-dates, slow, ~4 s a video), both cached in dates.json. A YouTube item with no known date is left out.

These are feeds for RSS readers (and Podcast Index's directory as `blog` / `video` feeds). They carry no <enclosure>,
so podcast apps cannot play them: a playable podcast needs hosted audio files.

Usage:  python3 build_feeds.py                 dry run (prints what would change)
        python3 build_feeds.py --apply         write the files
        python3 build_feeds.py --fetch-dates --apply   also ask yt-dlp for missing YouTube dates
The repo pre-commit hook re-runs it (no network) whenever a commit touches one of the sources.
"""
import html
import json
import re
import subprocess
import sys
import uuid
import urllib.request
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
OUT = SITE / "feeds"
BASE = "https://mes.fm"
APPLY = "--apply" in sys.argv
FETCH = "--fetch-dates" in sys.argv
NO_NET = "--offline" in sys.argv
KEEP = 50            # items per feed
KEEP_ALL = 80        # items in the "everything" feed
PODCAST_NS = uuid.UUID("ead4c236-bf58-58c6-a2c6-a6b28d128cb6")   # Podcasting 2.0 podcast:guid namespace
CHANNELS = {"mes": "UCUUBq1GPBvvGNz7dpgO14Ow", "mestruth": None}  # mestruth id read from api/yt-latest.js

HUBS = [  # (feed id, folder with sections.mjs, title)
    ("911", "911", "9/11 Truth"),
    ("911spooks", "911spooks", "9/11 Spooks"),
    ("hutchison", "hutchison", "Hutchison Effect"),
    ("conspiracy", "conspiracy", "Conspiracy"),
    ("science", "science", "Science"),
    ("crypto", "crypto", "Crypto"),
    ("bg", "bg", "Bob Greenyer"),
    ("mh370", "mh370", "MH370"),
    ("mathiew", "mathiew", "Mathiew"),
]


def esc(s):
    return html.escape(str(s or ""), quote=True)


def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", str(s or "")))
    return re.sub(r"\s+", " ", s).strip()


# ---------- dates ----------
def git_add_dates():
    """Path (relative to the repo) -> earliest git add date, in one git call."""
    out = subprocess.run(["git", "log", "--diff-filter=A", "--name-only", "--format=@%aI", "--",
                          "mes.fm/*index.html", "mes.fm/*.html"], cwd=ROOT, capture_output=True, text=True).stdout
    dates, cur = {}, None
    for line in out.splitlines():
        if line.startswith("@"):
            cur = line[1:]
        elif line.strip():
            dates[line.strip()] = cur          # log is newest first: the last one seen is the earliest
    return dates


def page_date(slug, dates):
    for cand in (f"mes.fm/{slug}/index.html", f"mes.fm/{slug}.html"):
        if cand in dates:
            return dates[cand]
    return None


def load_cache():
    try:
        return json.loads((OUT / "dates.json").read_text())
    except Exception:
        return {}


def rss_dates(cache):
    """Exact upload dates of each channel's newest 15 videos from YouTube's own RSS feed."""
    if NO_NET:
        return
    js = (SITE / "api" / "yt-latest.js").read_text()
    m = re.search(r"mestruth\s*:\s*['\"](UC[\w-]{22})", js)
    if m:
        CHANNELS["mestruth"] = m.group(1)
    for ch, cid in CHANNELS.items():
        if not cid:
            continue
        try:
            req = urllib.request.Request(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}",
                                         headers={"User-Agent": "mes.fm-feeds/1.0"})
            xml = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
        except Exception as e:
            print(f"  ({ch} RSS not reachable: {e})")
            continue
        for vid, pub in re.findall(r"<yt:videoId>([\w-]{11})</yt:videoId>.*?<published>([^<]+)</published>", xml, re.S):
            cache.setdefault("yt:" + vid, pub)


def ytdlp_dates(ids, cache):
    """Upload dates from yt-dlp for videos the RSS feed no longer lists (slow; only with --fetch-dates)."""
    need = [i for i in ids if "yt:" + i not in cache]
    if not need:
        return
    print(f"  yt-dlp: {len(need)} upload dates to look up")
    for k in range(0, len(need), 10):
        part = need[k:k + 10]
        r = subprocess.run(["yt-dlp", "--no-update", "--skip-download", "--ignore-errors", "--print",
                            "%(id)s %(timestamp)s %(upload_date)s"] + [f"https://www.youtube.com/watch?v={i}" for i in part],
                           capture_output=True, text=True)
        for line in r.stdout.splitlines():
            p = line.split()
            if len(p) == 3 and re.fullmatch(r"[\w-]{11}", p[0]):
                if p[1].isdigit():
                    cache["yt:" + p[0]] = datetime.fromtimestamp(int(p[1]), timezone.utc).isoformat()
                elif re.fullmatch(r"\d{8}", p[2]):
                    cache["yt:" + p[0]] = f"{p[2][:4]}-{p[2][4:6]}-{p[2][6:]}T12:00:00+00:00"


# ---------- sources ----------
def read_page(slug):
    """Title, description and picture of a local mes.fm page."""
    for cand in (SITE / slug / "index.html", SITE / f"{slug}.html"):
        if cand.exists():
            t = cand.read_text(encoding="utf-8", errors="replace")
            break
    else:
        return None

    def meta(rx):
        m = re.search(rx, t, re.I | re.S)
        return clean(m.group(1)) if m else ""
    title = meta(r'<meta\s+property="og:title"\s+content="([^"]*)"') or meta(r"<title>(.*?)</title>")
    title = re.split(r"\s+\|\s+", title)[0]
    desc = meta(r'<meta\s+name="description"\s+content="([^"]*)"')
    img = meta(r'<meta\s+property="og:image"\s+content="([^"]*)"')
    return {"title": title, "desc": desc, "img": img}


def hub_items(folder):
    js = f"const m=await import('file://{SITE / folder / 'sections.mjs'}');" \
         "console.log(JSON.stringify((m.SECTIONS||[]).map(s=>(s.items||[]).map(i=>({h:i.href||((i.links||[]).find(l=>/mes\\.fm\\//.test(l[1]))||[])[1]||'',t:i.title||''})))))"
    r = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True)
    try:
        groups = json.loads(r.stdout)
    except Exception:
        print(f"  ! could not read {folder}/sections.mjs: {r.stderr[:200]}")
        return []
    out = []
    for g in groups:
        for it in g:
            m = re.fullmatch(r"(?:https?://mes\.fm)?/([a-z0-9][\w.-]*)/?", it["h"].strip())
            if m:
                out.append((m.group(1), it["t"]))
    return out


def iso_to_dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def tools_feed(dates):
    sys.path.insert(0, str(ROOT))
    import build_newest as bn
    items = []
    for page, kind in (("calculators.html", "calculator"), ("tools.html", "tool")):
        for c in bn.cards(page, kind):
            slug = c["href"].strip("/")
            d = page_date(slug, dates)
            if not d:
                continue
            img = c.get("icon") or ""
            items.append({"title": clean(c["title"]), "link": BASE + c["href"], "desc": clean(c.get("desc")),
                          "date": d, "img": BASE + img if img.startswith("/") else img,
                          "cat": "Calculators" if kind == "calculator" else "Tools"})
    seen, uniq = set(), []
    for it in items:
        if it["link"] not in seen:
            seen.add(it["link"])
            uniq.append(it)
    return uniq


def posts_feed(folder, hub_title, dates):
    items = []
    for slug, title in hub_items(folder):
        d = page_date(slug, dates)
        p = read_page(slug)
        if not d or not p:
            continue
        img = p["img"]
        items.append({"title": clean(title) or p["title"], "link": f"{BASE}/{slug}", "desc": p["desc"], "date": d,
                      "img": BASE + img if img.startswith("/") else img, "cat": hub_title})
    return items


def yt_feed(path, cache, cat, filt=None, want=KEEP):
    vids = json.loads((SITE / path).read_text())
    vids = [v for v in vids if v.get("status") != "upcoming" and (not filt or filt(v))]
    top = vids[:want + 10]
    if FETCH:
        ytdlp_dates([v["id"] for v in top], cache)
    items = []
    for v in top:
        d = cache.get("yt:" + v["id"])
        if not d:
            continue
        link = f"https://www.youtube.com/watch?v={v['id']}"
        m = re.match(r"MES Livestream (\d+)\b", v["title"])
        if m:
            mirror = sorted(SITE.glob(f"livestream-{m.group(1)}-*/index.html")) or sorted(SITE.glob(f"livestream-{m.group(1)}/index.html"))
            mirror = [x for x in mirror if "stats" not in x.parent.name]
            if mirror:
                link = f"{BASE}/{mirror[0].parent.name}"
        items.append({"title": clean(v["title"]), "link": link, "desc": clean(v["title"]), "date": d,
                      "img": f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg", "cat": cat, "yt": v["id"]})
    return items


# ---------- XML ----------
def rfc822(iso):
    return format_datetime(iso_to_dt(iso).astimezone(timezone.utc), usegmt=True)


def build_xml(fid, title, desc, page, medium, items):
    url = f"{BASE}/feeds/{fid}.xml"
    guid = uuid.uuid5(PODCAST_NS, url.split("://", 1)[1])
    newest = items[0]["date"] if items else "2026-11-23T00:00:00+00:00"
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" '
           'xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:media="http://search.yahoo.com/mrss/">',
           "<channel>",
           f"  <title>{esc(title)}</title>",
           f"  <link>{esc(page)}</link>",
           f"  <description>{esc(desc)}</description>",
           "  <language>en</language>",
           f"  <lastBuildDate>{rfc822(newest)}</lastBuildDate>",
           f'  <atom:link href="{url}" rel="self" type="application/rss+xml"/>',
           f"  <image><url>{BASE}/img/logo-mark.png</url><title>{esc(title)}</title><link>{esc(page)}</link></image>",
           f"  <podcast:guid>{guid}</podcast:guid>",
           f"  <podcast:medium>{medium}</podcast:medium>",
           '  <podcast:funding url="https://mes.fm/donate">Support MES</podcast:funding>',
           "  <generator>mes.fm build_feeds.py</generator>"]
    for it in items:
        out += ["  <item>",
                f"    <title>{esc(it['title'])}</title>",
                f"    <link>{esc(it['link'])}</link>",
                f'    <guid isPermaLink="{"false" if it.get("yt") else "true"}">{esc("yt:" + it["yt"] if it.get("yt") else it["link"])}</guid>',
                f"    <pubDate>{rfc822(it['date'])}</pubDate>",
                f"    <category>{esc(it['cat'])}</category>"]
        if it.get("desc"):
            out.append(f"    <description>{esc(it['desc'])}</description>")
        if it.get("img"):
            out.append(f'    <media:thumbnail url="{esc(it["img"])}"/>')
        out.append("  </item>")
    out += ["</channel>", "</rss>", ""]
    return "\n".join(out)


def main():
    dates = git_add_dates()
    cache = load_cache()
    rss_dates(cache)

    feeds = []  # (id, title, desc, page, medium, group, items)
    feeds.append(("tools", "New MES Calculators & Tools", "New free calculators and tools on mes.fm.",
                  BASE + "/tools", "blog", "site", tools_feed(dates)))
    all_posts = []
    hub_feeds = []
    for fid, folder, t in HUBS:
        if not (SITE / folder / "sections.mjs").exists():
            continue
        items = posts_feed(folder, t, dates)
        all_posts += items
        hub_feeds.append((fid, f"MES {t} Posts", f"New MES {t} posts on mes.fm.", f"{BASE}/{folder}", "blog", "hub", items))
    seen, uniq = set(), []
    for it in sorted(all_posts, key=lambda i: i["date"], reverse=True):
        if it["link"] not in seen:
            seen.add(it["link"])
            uniq.append(it)
    feeds.append(("posts", "MES Posts", "Every new post on mes.fm: 9/11, Hutchison Effect, conspiracy, science and crypto.",
                  BASE + "/feeds", "blog", "site", uniq))
    feeds.append(("livestreams", "MES Livestreams", "New MES livestreams.", BASE + "/livestreams", "video", "video",
                  yt_feed("livestreams/playlist.json", cache, "Livestreams", lambda v: "Trailer" not in v["title"])))
    feeds.append(("youtube", "MES YouTube (Math Easy Solutions)", "New videos on the Math Easy Solutions YouTube channel.",
                  BASE + "/youtube", "video", "video", yt_feed("math/youtube-videos.json", cache, "YouTube")))
    feeds.append(("mestruth", "MES Truth YouTube", "New videos on the MES Truth YouTube channel.",
                  BASE + "/youtube-mestruth", "video", "video", yt_feed("math/youtube-mestruth-videos.json", cache, "MES Truth")))
    feeds += hub_feeds

    every = []
    for f in feeds:
        if f[5] != "hub":
            every += f[6]
    seen, uniq = set(), []
    for it in sorted(every, key=lambda i: i["date"], reverse=True):
        if it["link"] not in seen:
            seen.add(it["link"])
            uniq.append(it)
    feeds.insert(0, ("everything", "Everything new on MES", "New calculators, tools, posts, livestreams and videos from MES.",
                     BASE, "blog", "site", uniq[:KEEP_ALL]))

    index, changed = [], 0
    OUT.mkdir(exist_ok=True) if APPLY else None
    for fid, title, desc, page, medium, group, items in feeds:
        items = sorted(items, key=lambda i: i["date"], reverse=True)[:KEEP_ALL if fid == "everything" else KEEP]
        xml = build_xml(fid, title, desc, page, medium, items)
        p = OUT / f"{fid}.xml"
        old = p.read_text() if p.exists() else None
        if old != xml:
            changed += 1
            print(f"  {'write' if APPLY else 'would write'} feeds/{fid}.xml ({len(items)} items)")
            if APPLY:
                p.write_text(xml)
        index.append({"id": fid, "title": title, "desc": desc, "page": page, "medium": medium, "group": group,
                      "url": f"{BASE}/feeds/{fid}.xml", "count": len(items),
                      "updated": items[0]["date"] if items else None,
                      "newest": items[0]["title"] if items else None,
                      "latest": [{"t": i["title"], "l": i["link"], "d": i["date"][:10]} for i in items[:5]]})
    for name, data in (("index.json", {"feeds": index}), ("dates.json", dict(sorted(cache.items())))):
        p = OUT / name
        txt = json.dumps(data, ensure_ascii=False, indent=1 if name == "index.json" else None) + "\n"
        if (p.read_text() if p.exists() else None) != txt:
            changed += 1
            print(f"  {'write' if APPLY else 'would write'} feeds/{name}")
            if APPLY:
                p.write_text(txt)
    print(f"{len(feeds)} feeds, {changed} file(s) {'changed' if APPLY else 'would change'}"
          + ("" if APPLY else " (dry run: add --apply to write)"))


if __name__ == "__main__":
    main()
