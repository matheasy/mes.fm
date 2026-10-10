#!/usr/bin/env python3
"""Snapshot two YouTube lists into the JSON files read by the hub generators.

  * https://www.youtube.com/@mes/videos            -> mes.fm/math/youtube-videos.json      (page mes.fm/youtube, built by mes.fm/math/build.mjs)
  * playlist PLai3U8-WIK0FfZ_7hUuyO7xN8lp5oaDiu    -> mes.fm/experiments/draft-videos.json (page mes.fm/experiments-draft, mes.fm/experiments/build.mjs;
                                                      an unlisted "DRAFT experiments" playlist)

Per video: id, title, duration (seconds), views. Order is YouTube's own, newest first (channel Videos tab; the draft playlist is kept newest first
too, which was checked on 2026-10-09). Private / deleted entries are dropped. The build scripts run offline from these snapshots, so after new
uploads:

    python3 update_youtube_lists.py --apply      # refresh both JSON files (needs yt-dlp)
    cd mes.fm/math && npm run build              # then diff, and `git checkout math/link-meta.json`
    cd mes.fm/experiments && npm run build

Dry-runs by default (prints counts and what changed); --apply writes.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent / "mes.fm"
LISTS = [
    ("https://www.youtube.com/@mes/videos", ROOT / "math" / "youtube-videos.json"),
    ("https://www.youtube.com/playlist?list=PLai3U8-WIK0FfZ_7hUuyO7xN8lp5oaDiu", ROOT / "experiments" / "draft-videos.json"),
]


def fetch(url):
    p = subprocess.run(["yt-dlp", "--flat-playlist", "--dump-json", "--no-update", url], capture_output=True, text=True, check=True)
    out, seen = [], set()
    for line in p.stdout.splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        title = re.sub(r"\s+", " ", r.get("title") or "").strip()
        if not title or title in ("[Private video]", "[Deleted video]"):
            continue
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        out.append({"id": r["id"], "title": title, "dur": int(r.get("duration") or 0), "views": int(r.get("view_count") or 0)})
    return out


def main():
    apply = "--apply" in sys.argv
    for url, path in LISTS:
        new = fetch(url)
        old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        oi = {v["id"] for v in old}; ni = {v["id"] for v in new}
        print(f"{path.relative_to(ROOT.parent)}: {len(new)} videos (was {len(old)}; +{len(ni - oi)} -{len(oi - ni)})")
        if apply:
            path.write_text(json.dumps(new, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    if not apply:
        print("dry run: pass --apply to write")


if __name__ == "__main__":
    main()
