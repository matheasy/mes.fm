#!/usr/bin/env python3
"""Write mes.fm/hub-meta.json: per card of mes.fm/calculators.html and mes.fm/tools.html, the date its page was first
added to git, the date it was last really updated, and a type (Calculator, Tool, Simulation, Game, Browser extension).

Read by main_js/hub-filter.js for the List / Compact / Table views of the two hubs (the Table's "Added" and "Updated"
columns and the "Type" column). Everything comes from one `git log --name-status` pass over mes.fm/, so it takes about
a second.

"Updated" = the newest commit that touched the page file or anything in its own folder (its js/, css, images) AND changed
at most MAX_FILES files under mes.fm/ -- repo-wide passes (a new nav link on 1,300 pages, a footer tweak) would otherwise
make every page look updated on the same day. Staged changes count as a commit made today (so the pre-commit hook gets the
commit it is part of right), and a page with no history yet counts as added today.

JSON: {"generated": date, "pages": {"/slug": {"added": "YYYY-MM-DD", "updated": "YYYY-MM-DD", "type": "Calculator"}}}.
Idempotent (`generated` only moves when the data changes). Dry-runs by default; --apply writes. organize_hub_cards.py
--apply and the pre-commit hook (.githooks/pre-commit) run it.
"""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
OUT = SITE / "hub-meta.json"
MAX_FILES = 80
TD = re.compile(r'<td class="[^"]*calc-container[^"]*"[^>]*>\s*<a class="calc-link" href="([^"]*)">', re.S)
EXTENSIONS = {"videospeed", "read-aloud", "dark-mode", "volume-booster", "text-size"}
HUBS = {"browser", "pdf-tools", "kids", "materials"}


def norm(href):
    rel = re.sub(r"^https?://mes\.fm/", "", href.strip()).strip("/")
    rel = re.sub(r"(^|/)index\.html$", "", rel)
    return re.sub(r"\.html$", "", rel)


def page_file(rel):
    for cand in (rel + "/index.html", rel + ".html"):
        if (SITE / cand).exists():
            return "mes.fm/" + cand
    return None


def categories(page):
    """slug -> category id, read from the generated <section class="hub-cat" data-cat=...> blocks"""
    text = (SITE / page).read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r'<section class="hub-cat" data-cat="([^"]+)"(.*?)</section>', text, re.S):
        for h in TD.finditer(m.group(2)):
            out.setdefault(norm(h.group(1)), m.group(1))
    return out


def kind_of(rel, cat, page):
    slug = rel.split("/")[0]
    if slug in EXTENSIONS:
        return "Browser extension"
    if slug in HUBS:
        return "Collection"
    if cat == "sim" or re.search(r"simulat|playground|explorer|isopotential|fountain-clock|time-dilation$|mandelbrot|buddhabrot|metric-tensor|llm-|letter-recognition", slug):
        return "Simulation"
    if cat in ("games",):
        return "Game"
    return "Calculator" if page == "calculators.html" else "Tool"


def git_log():
    """[(date, set_of_paths)] newest first, one entry per commit, paths under mes.fm/"""
    out = subprocess.run(["git", "log", "--format=%x01%aI", "--name-status", "--no-renames", "--", "mes.fm"],
                         cwd=ROOT, capture_output=True, text=True).stdout
    commits = []
    for block in out.split("\x01")[1:]:
        lines = block.strip("\n").split("\n")
        when = lines[0][:10]
        files = {}
        for ln in lines[1:]:
            if "\t" in ln:
                st, path = ln.split("\t", 1)
                files[path] = st[:1]
        commits.append((when, files))
    staged = subprocess.run(["git", "diff", "--cached", "--name-status", "--no-renames", "--", "mes.fm"],
                            cwd=ROOT, capture_output=True, text=True).stdout
    sfiles = {}
    for ln in staged.splitlines():
        if "\t" in ln:
            st, path = ln.split("\t", 1)
            sfiles[path] = st[:1]
    if sfiles:
        commits.insert(0, (date.today().isoformat(), sfiles))
    return commits


def main():
    commits = git_log()
    today = date.today().isoformat()
    pages = {}
    for page in ("calculators.html", "tools.html"):
        cats = categories(page)
        for rel, cat in cats.items():
            key = "/" + rel
            f = page_file(rel)
            entry = pages.get(key) or {}
            if f:
                folder = f[:-len("index.html")] if f.endswith("/index.html") else None
                added = updated = None
                for when, files in commits:
                    if files.get(f) == "A":
                        added = when            # oldest wins (log is newest first)
                    if updated is None and len(files) <= MAX_FILES and (f in files or (folder and any(p.startswith(folder) for p in files))):
                        updated = when
                entry["added"] = added or entry.get("added") or today
                entry["updated"] = max(updated or entry["added"], entry["added"])
            k = kind_of(rel, cat, page)
            if entry.get("type") not in ("Simulation", "Browser extension", "Collection", "Game"):
                entry["type"] = k              # a card on both hubs: the more specific type wins
            pages[key] = entry
    data = {"pages": dict(sorted(pages.items()))}
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if old.get("pages") == data["pages"]:
        print("hub-meta.json up to date (%d pages)" % len(pages))
        return
    data = {"generated": today, **data}
    print("%d pages, e.g. %s" % (len(pages), list(data["pages"].items())[:3]))
    if "--apply" in sys.argv:
        OUT.write_text(json.dumps(data, indent=0, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print("wrote", OUT)
    else:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
