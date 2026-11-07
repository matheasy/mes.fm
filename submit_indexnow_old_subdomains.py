#!/usr/bin/env python3
"""Tell Bing (via IndexNow) to re-crawl the OLD calculator subdomain URLs, so it sees their 308s.

Why (2026-11-07): two months after the subdomains moved to mes.fm/<slug>, Bing still had 187
URLs indexed under percentagecalculator.mes.fm (and grade, bmi, timer, ...). Bing's Site Move
tool is not offered for mes.fm because it is a whole-domain (DNS) property, so this is the way to
get it to re-crawl them.

IndexNow checks for the key file on each host, so every redirect-only subdomain folder
(<slug>.mes.fm/) carries a copy of mes.fm/<key>.txt and its vercel.json catch-all redirect skips
that one file. Each host is submitted in its own request (IndexNow wants one host per request).

The old URLs are worked out from mes.fm/sitemap.xml: https://mes.fm/<slug>/<path> was
https://<slug>.mes.fm/<path>. Before sending, the key file is fetched on every host; a host whose
file isn't live yet (not deployed) is skipped and reported.

Dry-runs by default; --send submits. Run it again only after another real change (IndexNow wants
changed URLs, not repeats).
"""
import argparse, json, pathlib, re, sys, urllib.error, urllib.request

REPO = pathlib.Path(__file__).resolve().parent
SITE = REPO / "mes.fm"
ENDPOINT = "https://api.indexnow.org/indexnow"
SLUGS = ["bmicalculator", "gpacalculator", "gradecalculator", "inflationcalculator", "mortgagecalculator",
         "percentagecalculator", "pokemongocalculator", "sjwkeyboard", "speedreader", "timer",
         "vatcalculator", "youtubemoney"]


def key():
    ks = [p.stem for p in SITE.glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}", p.stem)]
    if len(ks) != 1:
        sys.exit("expected exactly one mes.fm/<32-hex>.txt key file")
    return ks[0]


def live(host, k):
    try:
        req = urllib.request.Request(f"https://{host}/{k}.txt", headers={"User-Agent": "mes.fm-indexnow/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.geturl() == f"https://{host}/{k}.txt" and r.read().decode().strip() == k
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--send", action="store_true", help="actually POST (default is a dry run)")
    args = ap.parse_args()
    k = key()
    locs = re.findall(r"<loc>([^<]+)</loc>", (SITE / "sitemap.xml").read_text(encoding="utf-8"))
    ok = True
    total = 0
    for slug in SLUGS:
        host = f"{slug}.mes.fm"
        if not (REPO / host / f"{k}.txt").exists():
            print(f"{host}: no key file in the repo folder, skipped")
            continue
        urls = [f"https://{host}/"]
        for u in locs:
            m = re.match(rf"https://mes\.fm/{slug}/(.+)$", u)
            if m:
                urls.append(f"https://{host}/{m.group(1)}")
        total += len(urls)
        if not args.send:
            print(f"{host}: {len(urls)} URLs  e.g. {urls[1] if len(urls) > 1 else urls[0]}")
            continue
        if not live(host, k):
            ok = False
            print(f"{host}: key file not live yet (deploy first), skipped")
            continue
        body = json.dumps({"host": host, "key": k, "keyLocation": f"https://{host}/{k}.txt",
                           "urlList": urls}).encode()
        req = urllib.request.Request(ENDPOINT, body, {"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(f"{host}: HTTP {r.status} ({len(urls)} URLs)")
        except urllib.error.HTTPError as e:
            ok = False
            print(f"{host}: HTTP {e.code} {e.read().decode(errors='replace')[:200]}")
    print(f"{total} old URLs on {len(SLUGS)} hosts")
    if not args.send:
        print("Dry run. Re-run with --send to submit (after the subdomain projects have deployed).")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
