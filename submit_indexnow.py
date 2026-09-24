#!/usr/bin/env python3
"""Tell IndexNow (Bing, Yandex, Naver, Seznam, ...) which mes.fm URLs changed.

IndexNow is a push protocol: instead of waiting for a crawl, POST the changed URLs to
https://api.indexnow.org/indexnow and every participating engine is notified. Google does not use it (rely on
sitemap.xml + Search Console there). Spec: https://www.indexnow.org/documentation

Ownership is proven by the key file mes.fm/<key>.txt (the file's name and its contents are both the key), served at
https://mes.fm/<key>.txt. The key is a random 32-hex string, safe to commit -- it only authorises submissions for
hosts that serve the matching file.

Workflow after a deploy that changes pages:
    python3 build_sitemap.py            # refresh <lastmod> from git
    git add/commit/push, wait for Vercel to deploy (the key file and pages must be live first)
    python3 submit_indexnow.py          # dry run: shows what would be sent
    python3 submit_indexnow.py --send

Which URLs: by default, those whose sitemap <lastmod> is the newest date in the sitemap (i.e. what your last commit
touched). --since YYYY-MM-DD widens that; --all sends every URL in the sitemap (only worth doing once, or after a
site-wide pass -- IndexNow asks for changed URLs only, so don't run it on a schedule). --url URL adds/overrides.
Dry-runs by default; --send posts. Up to 10,000 URLs per request.
"""
import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

SITE = pathlib.Path(__file__).resolve().parent / "mes.fm"
HOST = "mes.fm"
ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH = 10000
ENTRY_RE = re.compile(r"<url>\s*<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?", re.S)


def find_key():
    keys = [p for p in SITE.glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}", p.stem)]
    if len(keys) != 1:
        sys.exit(f"expected exactly one mes.fm/<32-hex>.txt key file, found {len(keys)}")
    key = keys[0].read_text().strip()
    if key != keys[0].stem:
        sys.exit(f"{keys[0].name}: file contents must equal its name")
    return key


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--since", help="only URLs with sitemap lastmod >= this date (YYYY-MM-DD)")
    ap.add_argument("--all", action="store_true", help="every URL in the sitemap")
    ap.add_argument("--url", action="append", default=[], help="extra URL to submit (repeatable)")
    ap.add_argument("--send", action="store_true", help="actually POST (default is a dry run)")
    args = ap.parse_args()

    key = find_key()
    entries = ENTRY_RE.findall((SITE / "sitemap.xml").read_text(encoding="utf-8"))
    if not entries:
        sys.exit("no <url> entries found in mes.fm/sitemap.xml")
    newest = max(d for _, d in entries if d)
    since = None if args.all else (args.since or newest)
    urls = [u for u, d in entries if since is None or (d and d >= since)]
    urls += [u for u in args.url if u not in urls]
    bad = [u for u in urls if not u.startswith(f"https://{HOST}/") and u != f"https://{HOST}"]
    if bad:
        sys.exit(f"URLs outside https://{HOST}/ can't be submitted: {bad[:3]}")

    print(f"key {key[:6]}...  {len(urls)} URLs "
          f"({'all' if since is None else 'lastmod >= ' + since}) of {len(entries)} in the sitemap")
    if not args.send:
        for u in urls[:5]:
            print("  ", u)
        print("Dry run. Re-run with --send to submit.")
        return
    if not urls:
        return

    ok = True
    for i in range(0, len(urls), BATCH):
        body = json.dumps({
            "host": HOST, "key": key, "keyLocation": f"https://{HOST}/{key}.txt", "urlList": urls[i:i + BATCH],
        }).encode()
        req = urllib.request.Request(ENDPOINT, body, {"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(f"batch {i // BATCH + 1}: HTTP {r.status} ({len(urls[i:i + BATCH])} URLs)")
        except urllib.error.HTTPError as e:
            ok = False
            print(f"batch {i // BATCH + 1}: HTTP {e.code} {e.read().decode(errors='replace')[:200]}")
            print("  (403 = key file not live yet at keyLocation; 422 = URL/host mismatch; 429 = rate limited)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
