#!/usr/bin/env python3
"""Snapshot the MES livestreams YouTube playlist into mes.fm/livestreams/playlist.json.

mes.fm/livestreams (built by mes.fm/livestreams/build.mjs) lists every video in the MES Truth
"livestreams" playlist: the numbered streams ("MES Livestream 140: ...") on the main tab and the
trailers on the Trailers tab. build.mjs runs offline from the snapshot this script writes, so
after a new stream / trailer goes up:

    python3 update_livestreams_playlist.py      # refresh playlist.json (needs yt-dlp)
    cd mes.fm/livestreams && npm run build      # regenerate index.html; diff before committing

Per video it stores id, title, duration (seconds), live status and the best thumbnail that
actually exists (maxresdefault where YouTube has one, else mqdefault -- older streams and some
trailers have no 1280x720 image, and a missing one would show as a grey card). Thumbnail lookups are
cached from the previous snapshot, so a refresh only checks new videos.

Deleted / private videos are dropped. Which entries are livestreams, trailers or neither is decided
in build.mjs (classify()), not here, so this file stays a faithful copy of the playlist.
Dry-runs by default; --apply writes.
"""
import json
import pathlib
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PLAYLIST = "https://www.youtube.com/playlist?list=PLai3U8-WIK0FqwyUa_ICwTlqO0S6Y3kAn"
OUT = pathlib.Path(__file__).resolve().parent / "mes.fm" / "livestreams" / "playlist.json"


def fetch_playlist():
    proc = subprocess.run(
        ["yt-dlp", "--flat-playlist", "--dump-json", PLAYLIST],
        capture_output=True, text=True, check=True,
    )
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def thumb_exists(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        return urllib.request.urlopen(req, timeout=20).status == 200
    except Exception:
        return False


def best_thumb(video_id):
    maxres = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
    return maxres if thumb_exists(maxres) else f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"


def main():
    apply = "--apply" in sys.argv
    old = {}
    if OUT.exists():
        old = {v["id"]: v for v in json.loads(OUT.read_text(encoding="utf-8"))}

    entries = []
    for r in fetch_playlist():
        title = re.sub(r"\s+", " ", r.get("title") or "").strip()
        if not title or title in ("[Private video]", "[Deleted video]"):
            continue
        entries.append({
            "id": r["id"],
            "title": title,
            "duration": r.get("duration"),
            "status": "upcoming" if r.get("live_status") == "is_upcoming" else "public",
        })

    todo = [e for e in entries if e["id"] not in old]
    with ThreadPoolExecutor(8) as pool:
        for e, thumb in zip(todo, pool.map(lambda e: best_thumb(e["id"]), todo)):
            e["thumb"] = thumb
    for e in entries:
        if "thumb" not in e:
            e["thumb"] = old[e["id"]]["thumb"]

    new_ids = [e["id"] for e in todo]
    print(f"{len(entries)} videos in the playlist ({len(new_ids)} new since the last snapshot)")
    for e in todo:
        print(f"  + {e['id']}  {e['title'][:80]}")
    if not apply:
        print("Dry run. Re-run with --apply to write", OUT)
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(entries, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
