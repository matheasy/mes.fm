#!/usr/bin/env python3
"""Report dead external links across the deployed mes.fm/ tree (read-only: nothing in the repo is changed).

Collects every `<a href="https://...">` on every page (skips HTTrack `_http*` captures, templates, node_modules),
de-duplicates, and checks each distinct URL once, politely (per-host concurrency + delay, one retry).

How a link is judged:
  * YouTube watch / shorts / live / embed / playlist / youtu.be -> oEmbed (a plain GET of a deleted or private video
    still answers 200): 404 = dead, 401 = private / embedding off ("restricted"), 200 = ok.
  * everything else -> HEAD then GET: 404 / 410 / DNS failure / refused connection / TLS failure = DEAD.
  * 401 / 403 / 429 / 999 / bot walls (x.com, facebook, instagram, linkedin...) = BLOCKED: not verifiable by a script,
    never reported as dead. 5xx and timeouts are retried, then reported as FLAKY.
  * mes.fm's own links are checked on disk first (cleanUrls aware) and only fall back to HTTP if not found.

Usage:  python3 check_external_links.py [--out report.json] [--host youtube.com] [--limit N] [--workers 24]
Prints a summary and every DEAD / RESTRICTED link with the pages that carry it; the JSON has everything.
"""
import argparse
import collections
import concurrent.futures as cf
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(REPO, "mes.fm")
HREF = re.compile(r'''<a\b[^>]*?\bhref\s*=\s*(["'])(https?://[^"']+)\1''', re.I | re.S)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 mes.fm-linkcheck"
BOT_WALLS = {"x.com", "twitter.com", "facebook.com", "m.facebook.com", "instagram.com", "linkedin.com", "pinterest.com", "tiktok.com"}
HOST_LIMIT = {"youtube.com": 4, "youtu.be": 4}      # default 2 per host
HOST_DELAY = 0.15


def collect():
    urls = collections.defaultdict(set)
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in ("node_modules", ".git") and not d.startswith("_http")]
        for f in fn:
            if not f.endswith(".html") or "template" in f:
                continue
            p = os.path.join(dp, f)
            try:
                s = open(p, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            rel = os.path.relpath(p, ROOT)
            page = "/" + re.sub(r"(/index)?\.html$", "", rel)
            for m in HREF.finditer(s):
                u = m.group(2).replace("&amp;", "&").strip()
                urls[u.split("#")[0]].add(page)
    return urls


def host_of(u):
    return urllib.parse.urlparse(u).netloc.lower().removeprefix("www.")


_locks, _glock = {}, threading.Lock()


def host_sem(h):
    with _glock:
        if h not in _locks:
            _locks[h] = threading.Semaphore(HOST_LIMIT.get(h, 2))
        return _locks[h]


def fetch(url, method="GET", timeout=20):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, url
    except Exception as e:   # DNS, refused, TLS, timeout
        return repr(e)[:90], url


def on_disk(url):
    p = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(p.path).strip("/")
    cands = [path, path + ".html", path + "/index.html"] if path else ["index.html"]
    return any(os.path.isfile(os.path.join(ROOT, c)) for c in cands)


YT_OEMBED = re.compile(r"^https?://(?:www\.|m\.)?(?:youtube\.com/(?:watch|shorts/|live/|embed/|playlist)|youtu\.be/)", re.I)


def judge(url):
    h = host_of(url)
    if h == "mes.fm":
        if on_disk(url):
            return "ok", "on disk"
    with host_sem(h):
        time.sleep(HOST_DELAY)
        if YT_OEMBED.match(url):
            code, _ = fetch("https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(url, safe=""))
            if code == 200:
                return "ok", "oembed"
            if code == 401:
                return "restricted", "401 private / embedding disabled"
            if code == 404:
                return "dead", "oembed 404 (deleted or never existed)"
            if code in (403, 429):
                return "blocked", str(code)
            return "flaky", str(code)
        code, final = fetch(url, "HEAD")
        if code in (405, 501, 403, 400) or not isinstance(code, int):
            code, final = fetch(url, "GET")
        if isinstance(code, int) and code >= 500 or (not isinstance(code, int) and "timed out" in str(code)):
            time.sleep(2)
            code, final = fetch(url, "GET")
    if isinstance(code, int):
        if 200 <= code < 400:
            return "ok", str(code)
        if code in (404, 410):
            return ("blocked", f"{code} (bot wall host)") if h in BOT_WALLS else ("dead", str(code))
        if code in (401, 403, 429, 999, 418, 400, 451) or h in BOT_WALLS:
            return "blocked", str(code)
        return "flaky", str(code)
    if re.search(r"Name or service not known|nodename nor servname|getaddrinfo|No address", code):
        return "dead", "DNS: " + code
    if "refused" in code:
        return "dead", "connection refused"
    if "CERTIFICATE" in code or "SSL" in code:
        return "dead", "TLS: " + code
    return "flaky", code


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="")
    ap.add_argument("--host", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=24)
    a = ap.parse_args()
    urls = collect()
    items = sorted(u for u in urls if not a.host or host_of(u).endswith(a.host))
    if a.limit:
        items = items[:a.limit]
    print(f"{len(items)} distinct external links on {len({p for u in items for p in urls[u]})} pages", file=sys.stderr)
    res, done = {}, 0
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(judge, u): u for u in items}
        for f in cf.as_completed(futs):
            u = futs[f]
            try:
                res[u] = f.result()
            except Exception as e:
                res[u] = ("flaky", repr(e)[:90])
            done += 1
            if done % 250 == 0:
                print(f"  {done}/{len(items)}", file=sys.stderr)
    by = collections.defaultdict(list)
    for u, (st, why) in res.items():
        by[st].append((u, why))
    print("\nsummary:", {k: len(v) for k, v in sorted(by.items())})
    for st in ("dead", "restricted"):
        rows = sorted(by.get(st, []), key=lambda x: (host_of(x[0]), x[0]))
        if rows:
            print(f"\n== {st.upper()} ({len(rows)})")
        for u, why in rows:
            pg = sorted(urls[u])
            print(f"  [{why}] {u}\n      on: {', '.join(pg[:4])}{' +%d more' % (len(pg) - 4) if len(pg) > 4 else ''}")
    if a.out:
        json.dump({u: {"status": st, "why": why, "pages": sorted(urls[u])} for u, (st, why) in res.items()}, open(a.out, "w"), indent=1)
        print("\nfull report ->", a.out)


main()
