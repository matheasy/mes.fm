#!/usr/bin/env python3
"""Find the Hive post (peakd.com) linked from each YouTube video's description.

Reads the video ids of mes.fm/math/youtube-videos.json (snapshot of @mes/videos, see update_youtube_lists.py), fetches every
description with yt-dlp (one request per video, a few in parallel) and keeps the first post link of the form
peakd.com/<category>/@<user>/<permlink> or steemit.com/... (a Steem link is rewritten to peakd.com: Steem forked into Hive, so the
same author / permlink resolves there). Profile-only links (peakd.com/@mes) and tag / community pages are ignored.

Result: mes.fm/math/youtube-hive-links.json = {"<video id>": "https://peakd.com/...", ...}, read by mes.fm/math/build.mjs, where a
video with a Hive link opens that post from its tile and lists both the Hive and YouTube links in List View.

Videos already checked are remembered in mes.fm/math/youtube-hive-checked.json, so a re-run only fetches new uploads
(--recheck forgets that; --limit N tries only the first N unchecked ones).

    python3 update_youtube_hive_links.py             # dry run: report only, writes nothing
    python3 update_youtube_hive_links.py --apply     # write both JSON files
    cd mes.fm/math && npm run build                  # then diff, and `git checkout math/link-meta.json`

Needs yt-dlp. Failed fetches (rate limit, private video) are not marked checked, so they are retried next run.
"""
import json
import pathlib
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

MATH = pathlib.Path(__file__).resolve().parent / "mes.fm" / "math"
VIDEOS = MATH / "youtube-videos.json"
LINKS = MATH / "youtube-hive-links.json"
CHECKED = MATH / "youtube-hive-checked.json"

URL_RE = re.compile(r"https?://(?:www\.)?(peakd\.com|steemit\.com)/([^\s<>\"')\]]+)", re.I)
POST_RE = re.compile(r"^(?:[\w-]+/)?@([\w.-]+)/([\w%-]+)/?$")


def find_post(desc):
    """First peakd / steemit post link in a description, as a peakd.com URL (or None)."""
    for m in URL_RE.finditer(desc or ""):
        path = m.group(2).split("#")[0].split("?")[0].rstrip(".,;:!")
        pm = POST_RE.match(path)
        if pm:
            return f"https://peakd.com/{path.rstrip('/')}"
    return None


def description(vid):
    p = subprocess.run(["yt-dlp", "--no-update", "--skip-download", "--print", "%(description)j",
                        f"https://www.youtube.com/watch?v={vid}"], capture_output=True, text=True)
    if p.returncode != 0 or not p.stdout.strip():
        return None
    return json.loads(p.stdout.strip().splitlines()[-1]) or ""


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    videos = load(VIDEOS, [])
    links = {} if "--recheck" in args else load(LINKS, {})
    checked = set() if "--recheck" in args else set(load(CHECKED, []))
    todo = [v["id"] for v in videos if v["id"] not in checked][:limit]
    print(f"{len(videos)} videos, {len(checked)} already checked, fetching {len(todo)}")
    failed = 0
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = {ex.submit(description, vid): vid for vid in todo}
        for n, f in enumerate(as_completed(futs), 1):
            vid = futs[f]
            try:
                d = f.result()
            except Exception:
                d = None
            if d is None:
                failed += 1
                continue
            checked.add(vid)
            url = find_post(d)
            if url:
                links[vid] = url
            else:
                links.pop(vid, None)
            if n % 100 == 0:
                print(f"  {n}/{len(todo)} (links so far: {len(links)})", flush=True)
                if apply:
                    LINKS.write_text(json.dumps(links, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
                    CHECKED.write_text(json.dumps(sorted(checked)) + "\n", encoding="utf-8")
    ids = {v["id"] for v in videos}
    links = {k: v for k, v in links.items() if k in ids}
    print(f"{len(links)} of {len(videos)} videos have a Hive post link; {failed} fetches failed (retried next run)")
    if apply:
        LINKS.write_text(json.dumps(links, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
        CHECKED.write_text(json.dumps(sorted(checked)) + "\n", encoding="utf-8")
    else:
        print("dry run: pass --apply to write")


if __name__ == "__main__":
    main()
