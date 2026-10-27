#!/usr/bin/env python3
"""Build the dictionary shards of mes.fm/pronounce from the CMU Pronouncing Dictionary (BSD licence, cmusphinx/cmudict).

Writes mes.fm/pronounce/data/<xx>.json, one file per first two letters of the word ("to.json" holds every word starting "to";
words whose first two characters are not both a-z, e.g. "a", "i", "'em", go to "_.json"). Each file is
{"word": "T AH0 M EY1 T OW2|T AH0 M AA1 T OW2", ...}: the ARPAbet pronunciations of the word, the dictionary's first one first,
separated by "|". The page (tool_apps_src/pronounce/lib.js, MESPron.shardOf) fetches only the shard it needs. Also writes
data/LICENSE-cmudict.txt (the licence has to travel with the data). Comments ("# place, danish") are dropped.

Source: --src=<path to cmudict.dict>, else downloaded from GitHub at the pinned commit below.
After a refresh bump DATA_V in tool_apps_src/pronounce/lib.js so browsers fetch the new shards.
**Dry-runs by default; `--apply` writes.**
"""
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mes.fm" / "pronounce" / "data"
COMMIT = "74790861f652b15e4ac49015a90074ad62a27690"   # cmusphinx/cmudict master, 2025-10-24
BASE = "https://raw.githubusercontent.com/cmusphinx/cmudict/%s/" % COMMIT
APPLY = "--apply" in sys.argv


def fetch(name):
    src = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--src=")), None)
    if src and name == "cmudict.dict":
        return Path(src).read_text(encoding="utf-8")
    if src and name == "LICENSE":
        p = Path(src).with_name("LICENSE")
        if p.exists():
            return p.read_text(encoding="utf-8")
    with urllib.request.urlopen(BASE + name, timeout=60) as r:
        return r.read().decode("utf-8")


def shard_of(w):
    return w[:2] if re.match(r"[a-z][a-z]", w[:2]) else "_"


def main():
    text = fetch("cmudict.dict")
    lic = fetch("LICENSE")
    shards = defaultdict(dict)
    n = 0
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        w, *ph = line.split()
        w = re.sub(r"\(\d+\)$", "", w.lower())
        if not ph or not all(re.fullmatch(r"[A-Z]{1,2}[012]?", p) for p in ph):
            print("skipped", line)
            continue
        lst = shards[shard_of(w)].setdefault(w, [])
        p = " ".join(ph)
        if p not in lst:
            lst.append(p)
            n += 1
    total = 0
    for k in sorted(shards):
        body = json.dumps({w: "|".join(v) for w, v in sorted(shards[k].items())}, separators=(",", ":"), ensure_ascii=False)
        total += len(body)
        if APPLY:
            OUT.mkdir(parents=True, exist_ok=True)
            (OUT / (k + ".json")).write_text(body, encoding="utf-8")
    if APPLY:
        (OUT / "LICENSE-cmudict.txt").write_text(lic, encoding="utf-8")
    words = sum(len(v) for v in shards.values())
    print("%d words, %d pronunciations, %d shards, %.1f MB raw%s" % (words, n, len(shards), total / 1e6, "" if APPLY else "  (dry run: --apply writes)"))


if __name__ == "__main__":
    main()
