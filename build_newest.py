#!/usr/bin/env python3
"""Write mes.fm/newest.json: the newest calculators and tools, newest first.

Source of truth = the cards on mes.fm/calculators.html and mes.fm/tools.html (title, icon, description) plus the
date each page was FIRST added to git (`git log --diff-filter=A`), so nothing is hand-ordered: add a card + page,
commit, re-run, and it is on top. The homepage strip ("Newest") and the "Newest" rows on /calculators and /tools
fetch this file (main_js/newest.js), so they update without touching the HTML.

JSON: {"generated": date, "calculators": [...], "tools": [...], "latest": [...]} where each item is
{"href", "title", "icon", "desc", "added"(ISO date), "kind"}; "latest" = the newest items of both lists mixed.
Pages that live inside another site's folder or have no git history are skipped. Idempotent (the `generated`
date only moves when the data changes). Dry-runs by default; --apply writes. organize_hub_cards.py --apply runs it too.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
OUT = SITE / "newest.json"
KEEP = 12                      # per list
LATEST = 8                     # homepage strip
TD = re.compile(r'<td class="[^"]*calc-container[^"]*"[^>]*>\s*<a class="calc-link" href="([^"]*)">(.*?)</td>', re.S)


def first_added(rel):
    for cand in (rel + "/index.html", rel + ".html"):
        out = subprocess.run(["git", "log", "--diff-filter=A", "--format=%aI", "--", "mes.fm/" + cand],
                             cwd=ROOT, capture_output=True, text=True).stdout.split()
        if out:
            return out[-1]
    return None


def cards(page, kind):
    text = (SITE / page).read_text(encoding="utf-8")
    seen, items = set(), []
    for m in TD.finditer(text):
        href = m.group(1).strip()
        rel = re.sub(r"^https://mes\.fm/", "", href).strip("/")
        if rel in seen or not rel or "/" in rel or rel.endswith(".html"):
            continue
        seen.add(rel)
        body = m.group(2)
        t = re.search(r'calc__text--title">(.*?)</span>', body, re.S)
        d = re.search(r'calc__text--desc">(.*?)</span>', body, re.S)
        i = re.search(r'<img[^>]*\bsrc="([^"]+)"', body)
        if not (t and i):
            continue
        icon = i.group(1).split("?")[0]
        icon = icon if icon.startswith("/") or icon.startswith("http") else "/" + icon
        when = first_added(rel)
        if not when:
            continue
        clean = lambda s: html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))).strip()
        items.append({"href": "/" + rel, "title": clean(t.group(1)), "icon": icon, "desc": clean(d.group(1)) if d else "",
                      "added": when, "kind": kind})
    items.sort(key=lambda x: x["added"], reverse=True)
    return items


def main():
    calcs, tools = cards("calculators.html", "calculator"), cards("tools.html", "tool")
    tools = [x for x in tools if x["href"] not in {c["href"] for c in calcs}]
    latest = sorted(calcs + tools, key=lambda x: x["added"], reverse=True)[:LATEST]
    for lst in (calcs, tools, latest):
        for x in lst:
            x["added"] = x["added"][:10] if lst is not latest else x["added"][:10]
    data = {"calculators": calcs[:KEEP], "tools": tools[:KEEP], "latest": latest}
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if {k: old.get(k) for k in data} == data:
        print("newest.json up to date")
        return
    from datetime import date
    data = {"generated": date.today().isoformat(), **data}
    for k in ("latest", "calculators", "tools"):
        print(k, [x["href"] for x in data[k]])
    if "--apply" in sys.argv:
        OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote", OUT)
    else:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
