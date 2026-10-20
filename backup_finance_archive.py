#!/usr/bin/env python3
"""
Downloads the finance app's permanent transaction archive (crypto/src/lib/store) to this Mac, as one
dated JSON file in ~/Documents/MES Finance Archive/ - outside this repo on purpose (the repo is public
website code; the archive holds your labels and notes).

What it contains: every stored transaction of every wallet and account (the rows the Taxes page is
computed from), every label / note / entered cost, and every report saved "as filed".

    python3 backup_finance_archive.py            # download now
    python3 backup_finance_archive.py --out DIR  # somewhere else

Read-only: it never changes anything on the site. Run it after filing each year (and now and then).
"""
import base64
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

BASE = "https://mes.fm/finance"
AUTH = "Basic " + base64.b64encode(b"mes:911").decode()


def get(path):
    req = urllib.request.Request(BASE + path, headers={"Authorization": AUTH, "User-Agent": "mes-finance-backup/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main():
    out_dir = os.path.expanduser("~/Documents/MES Finance Archive")
    if "--out" in sys.argv:
        out_dir = os.path.expanduser(sys.argv[sys.argv.index("--out") + 1])
    index = get("/api/archive")
    if "sources" not in index:
        sys.exit(f"no archive: {index.get('error')}")
    sources = []
    for s in index["sources"]:
        part = get("/api/archive?source=" + urllib.parse.quote(s["id"]))
        print(f"  {s['id']:<22} {len(part.get('tax', [])):>6} tax rows {len(part.get('tx', [])):>6} transactions")
        sources.append(part)
    filed = [get("/api/taxes/filed?id=" + urllib.parse.quote(f["id"])) for f in index.get("filed", [])]
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"mes-finance-archive-{datetime.date.today().isoformat()}.json")
    with open(path, "w") as f:
        json.dump({**index, "sources": sources, "filedReports": filed}, f)
    print(f"saved {path} ({os.path.getsize(path) / 1e6:.1f} MB, {len(filed)} saved reports, {len(index.get('labels', {}))} labels)")


if __name__ == "__main__":
    main()
