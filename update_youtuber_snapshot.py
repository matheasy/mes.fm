#!/usr/bin/env python3
"""Refresh the dated YouTube channel snapshot behind mes.fm/how-much-do-youtubers-make.

Writes mes.fm/how-much-do-youtubers-make/data/channels.json: for ~55 of the biggest / most popular channels the subscriber
count, lifetime views and video count (API only), and a "recent uploads" summary (median views of the last ~15 long-form
uploads older than 7 days, uploads per month). The page turns that into an ad-revenue *estimate* with the RPM tables of
mes.fm/youtubemoney (see tool_apps_src/how-much-do-youtubers-make/lib.js); nothing here is real income.

Two data sources, picked automatically:
  1. YouTube Data API v3, when the env var YOUTUBE_API_KEY is set (never commit a key). Quota: channels.list (50 ids = 1 unit)
     + playlistItems.list (1 unit per channel, the 25 newest uploads) + videos.list (50 ids = 1 unit) = ~110 units for 55
     channels, against the free 10,000/day. Gives exact subscribers (YouTube still rounds them to 3 significant figures),
     total views, video count, channel creation date, exact view counts and durations. mes.fm/api/youtuber-stats.js does
     the same thing live (edge-cached 24 h).
  2. yt-dlp (no key), as in update_livestreams_playlist.py: `--flat-playlist` on /@handle and /@handle/videos. Subscribers
     are the rounded figure on the channel page; the view counts in the flat listing are the *rounded* "5.9M views" text
     (2-3 significant figures); upload dates are day-level approximations. totalViews / videoCount / publishedAt are NOT
     available this way and stay null (flagged in `missing`), never guessed.

The channel list (handle, topic key from the calculator's NICHES table, assumed audience region) is CHANNELS below; ids are
resolved once and then reused from the committed snapshot. Add a channel = add a line and re-run. Idempotent; **dry-runs by
default (prints a table), `--apply` writes.** `--only=handle,handle` refreshes a subset (others kept as they were).
After applying: rebuild is NOT needed (the page fetches the JSON), just commit data/channels.json.
"""
import json
import os
import statistics
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mes.fm" / "how-much-do-youtubers-make" / "data" / "channels.json"
APPLY = "--apply" in sys.argv
ONLY = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()

# geo = audience-location factor of the calculator (1 = mostly high-income countries, 0.7 = a mix, 0.35 = Asia / Africa / Latin America).
# It is an ASSUMPTION about where the audience lives, not measured data. topic = key of NICHES in tool_apps_src/youtubemoney/app.js.
CHANNELS = [
    # handle, topic, geo, country label (assumed audience / home market)
    ("MrBeast", "entertainment", "1", "Global, mostly high-income"),
    ("tseries", "music", "0.35", "India"),
    ("cocomelon", "kids", "0.7", "Global mix"),
    ("SETIndia", "entertainment", "0.35", "India"),
    ("VladandNiki", "kids", "0.7", "Global mix"),
    ("KidsDianaShow", "kids", "0.7", "Global mix"),
    ("LikeNastyaofficial", "kids", "0.7", "Global mix"),
    ("PewDiePie", "gaming", "1", "Global, mostly high-income"),
    ("MarkRober", "education", "1", "Global, mostly high-income"),
    ("DudePerfect", "sports", "1", "US"),
    ("mkbhd", "tech", "1", "Global, mostly high-income"),
    ("LinusTechTips", "tech", "1", "Global, mostly high-income"),
    ("veritasium", "education", "1", "Global, mostly high-income"),
    ("kurzgesagt", "education", "1", "Global, mostly high-income"),
    ("3blue1brown", "education", "1", "Global, mostly high-income"),
    ("vsauce", "education", "1", "Global, mostly high-income"),
    ("TED", "education", "1", "Global, mostly high-income"),
    ("natgeo", "education", "1", "Global, mostly high-income"),
    ("CNN", "news", "1", "US"),
    ("BBCNews", "news", "1", "UK / global"),
    ("dhruvrathee", "news", "0.35", "India"),
    ("espn", "sports", "1", "US"),
    ("NBA", "sports", "1", "Global mix"),
    ("ufc", "sports", "1", "Global mix"),
    ("WWE", "sports", "0.7", "Global mix"),
    ("JamieOliver", "food", "1", "UK / global"),
    ("bingingwithbabish", "food", "1", "US"),
    ("buzzfeedtasty", "food", "1", "Global, mostly high-income"),
    ("nishamadhulika", "food", "0.35", "India"),
    ("GrahamStephan", "finance", "1", "US"),
    ("AndreiJikh", "finance", "1", "US"),
    ("MeetKevin", "finance", "1", "US"),
    ("AlexHormozi", "business", "1", "US"),
    ("garyvee", "business", "1", "US"),
    ("athleanx", "health", "1", "US"),
    ("JeffNippard", "health", "1", "Global, mostly high-income"),
    ("nikkietutorials", "beauty", "1", "Global, mostly high-income"),
    ("markiplier", "gaming", "1", "US"),
    ("jacksepticeye", "gaming", "1", "Global, mostly high-income"),
    ("dream", "gaming", "1", "US"),
    ("SSSniperWolf", "entertainment", "1", "US"),
    ("TechnoGamerzOfficial", "gaming", "0.35", "India"),
    ("JuegaGerman", "gaming", "0.35", "Latin America"),
    ("CarryMinati", "comedy", "0.35", "India"),
    ("smosh", "comedy", "1", "US"),
    ("BLACKPINK", "music", "0.7", "Global mix"),
    ("ZeeMusicCompany", "music", "0.35", "India"),
    ("TaylorSwift", "music", "1", "Global, mostly high-income"),
    ("EdSheeran", "music", "1", "Global, mostly high-income"),
    ("eminem", "music", "1", "Global, mostly high-income"),
    ("Pinkfong", "kids", "0.7", "Global mix"),
    ("ChuChuTV", "kids", "0.7", "Global mix"),
    ("KaraandNate", "travel", "1", "Global, mostly high-income"),
    ("YesTheory", "travel", "1", "Global, mostly high-income"),
]

LONG_MIN_SECONDS = 181   # Shorts can be up to 3 minutes; anything longer is long-form (a 2-3 minute normal video is miscounted as a Short in API mode)
SAMPLE = 15              # median over up to this many newest long-form uploads
MIN_AGE_DAYS = 7         # skip uploads younger than this: their views are still climbing
RATE_WINDOW_DAYS = 90
DAY = 86400


def now_ts():
    return time.time()


def recent_summary(vids, now=None):
    """vids = [{ts, views, dur}] newest first, long-form only. -> the `recent` object (same rule as lib.js `recentSummary`)."""
    now = now or now_ts()
    old = [v for v in vids if v.get("views") is not None and now - v["ts"] >= MIN_AGE_DAYS * DAY][:SAMPLE]
    med = int(round(statistics.median([v["views"] for v in old]))) if old else None
    ts = sorted(v["ts"] for v in vids)
    rate = None
    if len(ts) >= 2:
        cutoff = now - RATE_WINDOW_DAYS * DAY
        n90 = sum(1 for t in ts if t >= cutoff)
        if n90 >= 3 and ts[0] < cutoff:
            rate = n90 / (RATE_WINDOW_DAYS / 30.4375)
        else:    # rare uploaders, or a sample that does not reach back 90 days: use the sample's own span (dates are day-level, so at least 1 day)
            span = max((ts[-1] - ts[0]) / DAY, 1.0)
            rate = (len(ts) - 1) / span * 30.4375
    return {"videosSampled": len(old), "medianViews": med,
            "uploadsPerMonth": round(rate, 1) if rate is not None else None,
            "shortsShare": None, "windowDays": RATE_WINDOW_DAYS}


# ---------------------------------------------------------------- yt-dlp
def ytdlp(url, end):
    cmd = ["yt-dlp", "--no-update", "--flat-playlist", "--playlist-end", str(end), "--extractor-args", "youtubetab:approximate_date", "-J", url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    return json.loads(r.stdout)


def via_ytdlp(handle):
    head = ytdlp("https://www.youtube.com/@%s" % handle, 1)
    for end in (120, 500):   # channels that upload dozens of clips a day need a deeper listing before 15 uploads are a week old
        vids = ytdlp("https://www.youtube.com/@%s/videos" % handle, end)
        items = []
        for e in vids.get("entries") or []:
            if e.get("timestamp") and e.get("view_count") is not None and (e.get("duration") or 0) >= LONG_MIN_SECONDS and e.get("live_status") not in ("is_upcoming", "is_live"):
                items.append({"ts": e["timestamp"], "views": e["view_count"], "dur": e["duration"]})
        if recent_summary(items)["videosSampled"] >= SAMPLE:
            break
    return {"id": head["channel_id"], "name": head.get("channel"), "subscribers": head.get("channel_follower_count"),
            "totalViews": None, "videoCount": None, "publishedAt": None, "recent": recent_summary(items)}


# ---------------------------------------------------------------- YouTube Data API v3
def api(endpoint, **params):
    params["key"] = KEY
    url = "https://www.googleapis.com/youtube/v3/%s?%s" % (endpoint, urllib.parse.urlencode(params))
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def iso_seconds(d):
    import re
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d)
    g = [int(x or 0) for x in m.groups()] if m else [0, 0, 0, 0]
    return g[0] * 86400 + g[1] * 3600 + g[2] * 60 + g[3]


def via_api(ids):
    out = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        for c in api("channels", part="snippet,statistics,contentDetails", id=",".join(chunk), maxResults=50).get("items", []):
            s = c["statistics"]
            out[c["id"]] = {"id": c["id"], "name": c["snippet"]["title"],
                            "subscribers": None if s.get("hiddenSubscriberCount") else int(s.get("subscriberCount", 0)),
                            "totalViews": int(s.get("viewCount", 0)), "videoCount": int(s.get("videoCount", 0)),
                            "publishedAt": c["snippet"]["publishedAt"][:10],
                            "_uploads": c["contentDetails"]["relatedPlaylists"]["uploads"]}
    for cid, row in out.items():
        pl = api("playlistItems", part="contentDetails", playlistId=row.pop("_uploads"), maxResults=25).get("items", [])
        vid = [p["contentDetails"]["videoId"] for p in pl]
        when = {p["contentDetails"]["videoId"]: p["contentDetails"].get("videoPublishedAt") for p in pl}
        items = []
        if vid:
            for v in api("videos", part="statistics,contentDetails", id=",".join(vid), maxResults=50).get("items", []):
                dur = iso_seconds(v["contentDetails"]["duration"])
                if dur >= LONG_MIN_SECONDS and when.get(v["id"]) and "viewCount" in v["statistics"]:
                    ts = datetime.fromisoformat(when[v["id"]].replace("Z", "+00:00")).timestamp()
                    items.append({"ts": ts, "views": int(v["statistics"]["viewCount"]), "dur": dur})
            items.sort(key=lambda x: -x["ts"])
        row["recent"] = recent_summary(items)
    return out


def main():
    old = {}
    if OUT.exists():
        for c in json.loads(OUT.read_text()).get("channels", []):
            old[c["handle"].lower()] = c
    todo = [c for c in CHANNELS if not ONLY or c[0].lower() in [o.lower() for o in ONLY]]
    source = "youtube-data-api" if KEY else "yt-dlp"
    fresh = {}
    if KEY:
        ids = [old[h.lower()]["id"] for h, *_ in todo if h.lower() in old]
        res = via_api(ids) if ids else {}
        for h, *_ in todo:
            if h.lower() in old and old[h.lower()]["id"] in res:
                fresh[h.lower()] = res[old[h.lower()]["id"]]
        miss = [h for h, *_ in todo if h.lower() not in fresh]
        if miss:   # new channels: resolve handle -> id with the API (1 unit each)
            newids = []
            for h in miss:
                it = api("channels", part="id", forHandle="@" + h).get("items", [])
                if it:
                    newids.append((h, it[0]["id"]))
            res = via_api([i for _, i in newids]) if newids else {}
            for h, i in newids:
                if i in res:
                    fresh[h.lower()] = res[i]
    else:
        def one(c):
            try:
                return c[0].lower(), via_ytdlp(c[0])
            except Exception as e:
                print("FAILED %s: %s" % (c[0], e), file=sys.stderr)
                return c[0].lower(), None
        with ThreadPoolExecutor(6) as ex:
            for h, r in ex.map(one, todo):
                if r:
                    fresh[h] = r
    rows = []
    for handle, topic, geo, country in CHANNELS:
        r = fresh.get(handle.lower())
        prev = old.get(handle.lower())
        if r is None and prev is None:
            print("no data for", handle, "-> left out")
            continue
        if r is None:
            rows.append(prev)
            continue
        missing = [k for k in ("subscribers", "totalViews", "videoCount", "publishedAt") if r.get(k) is None]
        rec = r["recent"]
        missing += [k for k in ("medianViews", "uploadsPerMonth") if rec.get(k) is None]
        rows.append({"id": r["id"], "handle": handle, "name": r["name"], "topic": topic, "geo": geo, "country": country,
                     "subscribers": r["subscribers"], "totalViews": r["totalViews"], "videoCount": r["videoCount"],
                     "publishedAt": r["publishedAt"], "recent": rec, "missing": missing})
    rows.sort(key=lambda c: -(c["subscribers"] or 0))
    METHOD = {
        "youtube-data-api": "YouTube Data API v3: channels.list statistics (subscribers rounded to 3 significant figures by YouTube), the 25 newest uploads of each channel with exact view counts and durations.",
        "yt-dlp": "Public channel pages read with yt-dlp (no API key): subscriber counts as shown on the channel page (rounded by YouTube to 3 significant figures), and the view counts of the newest uploads on the channel's Videos tab as displayed (rounded, e.g. 5.9M). Lifetime views, video count and channel age are not available this way and are left empty.",
    }
    doc = {"v": 1, "generated": datetime.now().strftime("%Y-%m-%d"), "source": source, "method": METHOD[source],
           "notes": ["recent.medianViews = median views of up to %d of the newest long-form uploads (over %d seconds) that are at least %d days old."
                     % (SAMPLE, LONG_MIN_SECONDS - 1, MIN_AGE_DAYS),
                     "recent.uploadsPerMonth = long-form uploads per month over the last %d days when that has 3+ uploads, otherwise over the span of the sampled uploads." % RATE_WINDOW_DAYS,
                     "topic = key of the calculator's topic table; geo = ASSUMED audience-location factor (1 / 0.7 / 0.35), not measured.",
                     "Shorts, live streams' watch time, back-catalogue views, sponsorships, merchandise and memberships are not part of these numbers."],
           "channels": rows}
    print("source: %s   channels: %d   date: %s" % (source, len(rows), doc["generated"]))
    for c in rows:
        r = c["recent"]
        print("%-22s %-14s subs %-10s median %-10s /mo %-5s n=%-3s missing=%s" % (c["handle"], c["topic"], c["subscribers"], r["medianViews"], r["uploadsPerMonth"], r["videosSampled"], ",".join(c["missing"]) or "-"))
    if APPLY:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
        print("wrote", OUT)
    else:
        print("(dry run: pass --apply to write)")


if __name__ == "__main__":
    main()
