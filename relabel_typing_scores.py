#!/usr/bin/env python3
"""One-off: relabel a typist's leaderboard scores as voice typing (device 'v', the microphone icon).

mes.fm/api/typing-leaderboard.js stores the device in the fraction of each sorted-set score
(+0.125 keyboard, +0.25 phone, +0.375 tablet, +0.4375 voice; +0.5 more when accuracy is exactly 100).
This finds the person's id by name (hash ttlb:names), then for every ttlb:* sorted set that holds them
rewrites the fraction to voice (the speed + accuracy digits are untouched) and does the same to their
history list (ttlb:h:<id>), so "Only mine" shows the icon too.

Needs the Upstash credentials in the environment (the same two the Vercel function uses):
    export UPSTASH_REDIS_REST_URL=...  UPSTASH_REDIS_REST_TOKEN=...
    python3 relabel_typing_scores.py --name EyesIsCheatin            # dry run: lists what would change
    python3 relabel_typing_scores.py --name EyesIsCheatin --apply
    --min-wpm 120   only relabel scores at or above that speed (default: all of the person's scores)
Idempotent: scores already marked voice are skipped. The credentials are never printed.
"""
import argparse, json, math, os, sys, urllib.request

def redis(cmds):
    url, tok = os.environ.get("UPSTASH_REDIS_REST_URL"), os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not url or not tok: sys.exit("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN first.")
    req = urllib.request.Request(url.rstrip("/") + "/pipeline", json.dumps(cmds).encode(), {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    out = json.load(urllib.request.urlopen(req, timeout=30))
    for o in out:
        if isinstance(o, dict) and o.get("error"): sys.exit("redis error: " + str(o["error"]))
    return [o["result"] for o in out]

def voice_score(s):
    base = math.floor(s); half = (s - base) >= 0.5
    return base + (0.5 if half else 0) + 0.4375

def wpm_of(s): return math.floor(s / 1000) / 10   # score = round(wpm*10)*1000 + accuracy digits

ap = argparse.ArgumentParser(); ap.add_argument("--name", required=True); ap.add_argument("--apply", action="store_true"); ap.add_argument("--min-wpm", type=float, default=0)
a = ap.parse_args()

names = redis([["HGETALL", "ttlb:names"]])[0]
pairs = dict(zip(names[0::2], names[1::2]))
ids = [p for p, n in pairs.items() if n.lower() == a.name.lower()]
if len(ids) != 1: sys.exit(f"Found {len(ids)} typists named {a.name!r}: {ids}")
pid = ids[0]; print("typist", a.name, "->", pid)

keys, cur = [], "0"
while True:
    cur, batch = redis([["SCAN", cur, "MATCH", "ttlb:*", "COUNT", "500"]])[0]
    keys += batch
    if cur == "0": break
keys = [k for k in keys if k.count(":") >= 2 and not k.startswith(("ttlb:names", "ttlb:h:", "ttlb:rl:", "ttlb:tok:"))]
types = redis([["TYPE", k] for k in keys]); keys = [k for k, t in zip(keys, types) if t == "zset"]
scores = redis([["ZSCORE", k, pid] for k in keys])
todo = []
for k, s in zip(keys, scores):
    if s is None: continue
    s = float(s); frac = s - math.floor(s)
    if (frac - (0.5 if frac >= 0.5 else 0)) >= 0.4375 - 1e-9: continue          # already voice
    if wpm_of(s) < a.min_wpm: continue
    todo.append((k, s, voice_score(s)))
for k, s, n in todo: print(f"  {k:42} {wpm_of(s):6.1f} wpm  {s} -> {n}")
hk = f"ttlb:h:{pid}"; hist = redis([["LRANGE", hk, "0", "-1"]])[0] or []
hnew = []
for i, h in enumerate(hist):
    o = json.loads(h)
    if o.get("d") != "v" and o.get("w", 0) >= a.min_wpm: o["d"] = "v"; hnew.append((i, json.dumps(o, separators=(",", ":"))))
print(f"{len(todo)} leaderboard entries and {len(hnew)} history entries to relabel")
if not a.apply: print("Dry run. Add --apply to write."); sys.exit()
cmds = [["ZADD", k, str(n), pid] for k, s, n in todo] + [["LSET", hk, str(i), v] for i, v in hnew]
if cmds: redis(cmds)
print("Done.")
