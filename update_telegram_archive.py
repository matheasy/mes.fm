#!/usr/bin/env python3
"""Snapshot the public Telegram channel @meslinks (t.me/meslinks) for mes.fm/telegram.

Reads the channel's public web preview https://t.me/s/meslinks?before=<id> (no login, no API key, ~20 posts a
page), newest page first, and writes mes.fm/telegram/data/index.json + c<k>.json (2,000 posts each, oldest first).
Parsing and the data files are done by tool_apps_src/telegram/lib.js (through cli.js), the same parser the page and
mes.fm/api/tg-latest.js use.

  python3 update_telegram_archive.py              dry run: fetch posts newer than the snapshot, print what would change
  python3 update_telegram_archive.py --apply      write the data files (+ thumbnails)
  python3 update_telegram_archive.py --all --apply    re-read the whole channel (views / edits of old posts); resumable
  --delay 1.0     seconds between pages (polite; a 429 waits for Retry-After)
  --thumbs 800    keep small WebP thumbnails for the newest N posts that have a picture and no YouTube link
  --max-pages N   stop after N pages (testing)

Incremental runs stop at the first page that reaches the snapshot's newest post (that page also refreshes the views of
the latest ~20 posts). A full run saves its progress to tool_apps_src/telegram/.progress.json every 25 pages and picks
up from there if it is started again with --all; the file is deleted when the run completes.

Pictures: the CDN addresses on t.me/s (cdn*.telesco.pe/file/...) are signed per page view and stop working after a
while, so they are never stored. Posts with a YouTube link get the video's thumbnail from i.ytimg.com on the page; for
the newest --thumbs other picture posts a 160px-wide WebP is saved to mes.fm/telegram/thumbs/<id>.webp (older ones show a
"Photo" / "Video" placeholder and link to Telegram). The live top-up (api/tg-latest.js) shows the CDN pictures directly.
"""
import argparse, io, json, os, random, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "tool_apps_src", "telegram")
CLI = os.path.join(SRC, "cli.js")
DATA = os.path.join(ROOT, "mes.fm", "telegram", "data")
THUMBS = os.path.join(ROOT, "mes.fm", "telegram", "thumbs")
PROGRESS = os.path.join(SRC, ".progress.json")
URL = "https://t.me/s/meslinks"
UA = "Mozilla/5.0 (compatible; mes.fm archive; +https://mes.fm/telegram)"


def fetch(url, tries=6):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get("Retry-After") or 0) or (20 * (k + 1))
            if e.code in (429, 500, 502, 503, 504):
                print(f"  HTTP {e.code}, waiting {wait}s", file=sys.stderr); time.sleep(wait); continue
            raise
        except Exception as e:  # network blip
            print(f"  {e}, retrying", file=sys.stderr); time.sleep(10 * (k + 1))
    raise RuntimeError("giving up on " + url)


def parse(html):
    out = subprocess.run(["node", CLI, "parse"], input=html, capture_output=True, check=True)
    return json.loads(out.stdout)


def load_snapshot():
    posts = {}
    idx = os.path.join(DATA, "index.json")
    if not os.path.exists(idx):
        return posts
    index = json.load(open(idx))
    for c in index["chunks"]:
        for p in json.load(open(os.path.join(DATA, c["f"])))["posts"]:
            posts[p["i"]] = p
    return posts


def yt(p):
    import re
    s = (p.get("t") or "") + " " + ((p.get("pv") or {}).get("u") or "")
    return re.search(r"youtu\.be/[\w-]{11}|youtube\.com/(watch\?[^\s]*v=|shorts/|live/|embed/)[\w-]{11}", s)


def make_thumb(url, dest):
    from PIL import Image
    raw = fetch(url, tries=3)
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    w = 160
    h = max(1, round(im.height * w / im.width))
    if h > 240:  # tall pictures: keep the top part, 2:3 at most
        im = im.crop((0, 0, im.width, round(im.width * 1.5)))
        h = 240
    im = im.resize((w, h), Image.LANCZOS)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im.save(dest, "WEBP", quality=58, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--delay", type=float, default=1.0)
    ap.add_argument("--thumbs", type=int, default=800)
    ap.add_argument("--max-pages", type=int, default=0)
    a = ap.parse_args()

    snap = load_snapshot()
    newest = max(snap) if snap else 0
    fresh, before, pages = {}, None, 0
    if a.all and os.path.exists(PROGRESS):
        pr = json.load(open(PROGRESS))
        fresh = {int(k): v for k, v in pr["posts"].items()}
        before = pr["before"]
        print(f"Resuming a full run at before={before} ({len(fresh)} posts so far)")
    print(f"Snapshot: {len(snap)} posts, newest {newest}. Mode: {'all' if a.all or not snap else 'incremental'}")
    eligible = sum(1 for p in fresh.values() if p.get("th"))
    while True:
        url = URL + (f"?before={before}" if before else "")
        page = parse(fetch(url))
        pages += 1
        got = page["posts"]
        if not got:
            break
        for p in sorted(got, key=lambda x: -x["i"]):
            img = p.pop("img", None)
            fresh[p["i"]] = p
            if img and not yt(p):
                eligible += 1
                dest = os.path.join(THUMBS, f"{p['i']}.webp")
                if eligible <= a.thumbs:
                    if os.path.exists(dest):
                        p["th"] = 1
                    elif a.apply:
                        try:
                            make_thumb(img, dest); p["th"] = 1
                        except Exception as e:
                            print(f"  thumb {p['i']}: {e}", file=sys.stderr)
        lo = min(x["i"] for x in got)
        if pages % 10 == 0 or lo <= 50:
            print(f"  page {pages}: posts {lo}-{max(x['i'] for x in got)} ({len(fresh)} read)")
        if not (a.all or not snap) and lo <= newest:
            break
        if a.max_pages and pages >= a.max_pages:
            break
        if page.get("before") is None or page["before"] >= (before or 10**12) or lo <= 1:
            break
        before = lo
        if a.all and a.apply and pages % 25 == 0:
            json.dump({"before": before, "posts": fresh}, open(PROGRESS, "w"))
        time.sleep(a.delay * random.uniform(0.8, 1.3))

    # merge: a fresh read replaces the stored post (views, edits); posts kept from the snapshot keep their thumbnail flag
    merged = dict(snap)
    for i, p in fresh.items():
        old = merged.get(i)
        if old and old.get("th") and "th" not in p and os.path.exists(os.path.join(THUMBS, f"{i}.webp")):
            p["th"] = 1
        merged[i] = p
    # keep thumbnails only for the newest --thumbs posts that have one
    with_th = sorted((i for i, p in merged.items() if p.get("th")), reverse=True)
    drop = with_th[a.thumbs:]
    new_ids = sorted(i for i in fresh if i > newest)
    print(f"Read {pages} pages, {len(fresh)} posts; {len(new_ids)} newer than the snapshot"
          + (f" ({new_ids[0]}-{new_ids[-1]})" if new_ids else "") + f"; total {len(merged)}; thumbnails kept {min(len(with_th), a.thumbs)}, dropped {len(drop)}")
    if not a.apply:
        print("Dry run: nothing written (use --apply).")
        return
    for i in drop:
        merged[i].pop("th", None)
        f = os.path.join(THUMBS, f"{i}.webp")
        if os.path.exists(f):
            os.remove(f)
    if os.path.isdir(THUMBS):  # stray files (posts no longer flagged)
        flagged = {f"{i}.webp" for i, p in merged.items() if p.get("th")}
        for f in os.listdir(THUMBS):
            if f.endswith(".webp") and f not in flagged:
                os.remove(os.path.join(THUMBS, f))
    tmp = os.path.join(SRC, ".posts-tmp.json")
    json.dump(list(merged.values()), open(tmp, "w"))
    out = subprocess.run(["node", CLI, "write", tmp, DATA], capture_output=True, text=True, check=True)
    os.remove(tmp)
    if os.path.exists(PROGRESS):
        os.remove(PROGRESS)
    print("Wrote", out.stdout.strip())


if __name__ == "__main__":
    main()
