#!/usr/bin/env python3
"""Snapshot of the scheduled (upcoming) MES livestreams for mes.fm/reminder's "Next stream" buttons.

Reads the Live tab of each channel in CHANNELS with yt-dlp (needs yt-dlp), keeps the entries YouTube lists as
"is_upcoming", asks each one for its scheduled start (release_timestamp) and writes mes.fm/reminder/upcoming.json:

  {"generated": "2026-10-22", "streams": [{"id", "title", "url", "start" (UTC ISO), "channel"}, ...]}   (soonest first)

The page drops streams whose start has passed, so a stale file is harmless; re-run it whenever a stream is
scheduled (or rescheduled), commit and push. Dry-runs by default; --apply writes.
"""
import datetime, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mes.fm" / "reminder" / "upcoming.json"
CHANNELS = ["@mes", "@mestruth"]
SCAN = 12          # newest entries per Live tab to look at


def ytdlp(args):
    r = subprocess.run(["yt-dlp", *args], capture_output=True, text=True)
    return r.stdout


def main():
    apply = "--apply" in sys.argv
    streams = []
    for ch in CHANNELS:
        rows = ytdlp(["--flat-playlist", "--playlist-end", str(SCAN), "--print", "%(id)s\t%(live_status)s\t%(title)s",
                      f"https://www.youtube.com/{ch}/streams"]).splitlines()
        for row in rows:
            parts = row.split("\t")
            if len(parts) != 3 or parts[1] != "is_upcoming":
                continue
            vid, _, title = parts
            ts = ytdlp(["--skip-download", "--ignore-no-formats-error", "--print", "%(release_timestamp)s",
                        f"https://www.youtube.com/watch?v={vid}"]).strip().splitlines()
            ts = ts[-1] if ts else ""
            if not ts.isdigit():
                print(f"  ? {title}: no scheduled time, skipped")
                continue
            start = datetime.datetime.fromtimestamp(int(ts), datetime.timezone.utc)
            streams.append({"id": vid, "title": title, "url": f"https://www.youtube.com/live/{vid}",
                            "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "channel": ch})
            print(f"  {start:%Y-%m-%d %H:%M} UTC  {title}  ({ch})")
    streams.sort(key=lambda s: s["start"])
    data = {"generated": datetime.date.today().isoformat(), "streams": streams}
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    old = OUT.read_text() if OUT.exists() else ""
    same = old and json.loads(old)["streams"] == streams
    print(f"{len(streams)} upcoming stream(s); {'unchanged' if same else 'changed'}")
    if apply and not same:
        OUT.write_text(text)
        print(f"wrote {OUT.relative_to(ROOT)}")
    elif not apply:
        print("dry run: --apply writes")


if __name__ == "__main__":
    main()
