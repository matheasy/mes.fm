#!/usr/bin/env python3
"""mes.fm/reminder/upcoming.json -- the "Next MES stream" card and fill-in chips on mes.fm/reminder.

No YouTube: the source is the pre-stream mes.fm pages themselves. A page for an upcoming stream
(mes.fm/math-qa-<N>-<slug>/ or mes.fm/livestream-<N>-<slug>/, e.g. math-qa-73-thermal-expansion) carries a
"Get a reminder" link  https://mes.fm/reminder?title=...&t=2026-10-28T10:00&tz=America/Vancouver&u=...
and that link is read here: title, start (wall time + zone -> UTC) the watch link (u, else the page),
length (len) and notes (d, else the page's meta description).
Streams that started more than 2 h ago are dropped (the page also hides them once they have passed).

Runs by itself: .githooks/pre-commit re-runs it and stages the JSON whenever a commit touches one of those
pages (so making the pre-stream page is all that is needed). Dry-runs by default; --apply writes.
"""
import datetime, html, json, re, sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
OUT = SITE / "reminder" / "upcoming.json"
PAGES = ["math-qa-*/index.html", "livestream-*/index.html"]
LINK = re.compile(r'href="https://mes\.fm/reminder\?([^"#]+)"')


def streams(now):
    out = []
    for pat in PAGES:
        for f in sorted(SITE.glob(pat)):
            text = f.read_text(errors="ignore")
            m = LINK.search(text)
            if not m:
                continue
            q = {k: v[0] for k, v in parse_qs(html.unescape(m.group(1))).items()}
            try:
                start = datetime.datetime.fromisoformat(q["t"])
                start = start.replace(tzinfo=ZoneInfo(q.get("tz") or "America/Vancouver")) if start.tzinfo is None else start
            except (KeyError, ValueError):
                print(f"  ? {f.parent.name}: reminder link without a usable time, skipped")
                continue
            if start < now - datetime.timedelta(hours=2):
                continue
            page = f"https://mes.fm/{f.parent.name}"
            url = q.get("u") or page
            if urlsplit(url).scheme not in ("http", "https"):
                url = page
            # notes for the Notes box: the reminder link's own d=, else the page's meta description
            desc = re.search(r'<meta name="description" content="([^"]*)"', text)
            notes = q.get("d") or (html.unescape(desc.group(1)) if desc else "")
            item = {"title": q.get("title") or f.parent.name, "url": url, "page": page,
                    "start": start.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "notes": notes[:600]}
            if q.get("len", "").isdigit():
                item["len"] = int(q["len"])
            out.append(item)
    out.sort(key=lambda s: s["start"])
    return out


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    found = streams(now)
    for s in found:
        print(f"  {s['start']}  {s['title']}  ({s['page']})")
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    same = old.get("streams") == found
    print(f"{len(found)} upcoming stream(s); {'unchanged' if same else 'changed'}")
    if "--apply" in sys.argv and not same:
        OUT.write_text(json.dumps({"generated": now.date().isoformat(), "streams": found}, ensure_ascii=False, indent=1) + "\n")
        print(f"wrote {OUT.relative_to(ROOT)}")
    elif "--apply" not in sys.argv:
        print("dry run: --apply writes")


if __name__ == "__main__":
    main()
