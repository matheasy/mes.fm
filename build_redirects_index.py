#!/usr/bin/env python3
"""
Build mes.fm/go/redirects.json -- the data behind the "Short Links" page (mes.fm/go): every redirect in mes.fm/vercel.json, categorized and searchable.

Only the `redirects` array is listed. The `rewrites` array (the password-protected finance apps under /mfa, /ai, /portfolio, /taxes ... and the /s/<id> share-link
rewrites) is deliberately NOT published.

Per redirect: short link (source), destination, kind (internal = a page on mes.fm, external = another site, wild = a path pattern such as /pc/:path*), category
(by where it goes: the destination's section for internal ones, the site for external ones), topic (keyword match on the names), a title (the destination page's title from the
Site Index, or the host), an optional hand-written note / category from mes.fm/go/notes.json ({"/source": {"note": "...", "category": "...", "topic": "..."}}), and checks:
  dup    the same source is listed twice (Vercel uses the first)
  chain  the destination is itself a redirect source
  loop   a redirect that points back at itself
  gone   an internal destination that is not a page in the Site Index / on disk
  shadow a real page exists at the source address, so the redirect hides it
Refresh after editing vercel.json:   python3 build_redirects_index.py --apply     (dry-runs by default; -v lists the checks)
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv
OUT = SITE / "go" / "redirects.json"

HOSTS = [  # (substring of the host, category)
    ("youtube.com", "YouTube"), ("youtu.be", "YouTube"), ("bitchute.com", "Video sites"), ("odysee.com", "Video sites"), ("rumble.com", "Video sites"),
    ("1drv.ms", "Files & folders"), ("onedrive.", "Files & folders"), ("drive.google.com", "Files & folders"), ("docs.google.com", "Files & folders"),
    ("play.google.com", "Apps & extensions"), ("itunes.apple.com", "Apps & extensions"), ("apps.apple.com", "Apps & extensions"), ("chrome.google.com", "Apps & extensions"),
    ("twitter.com", "Social & chat"), ("x.com", "Social & chat"), ("linkedin.com", "Social & chat"), ("plus.google.com", "Social & chat"), ("discord", "Social & chat"), ("facebook.com", "Social & chat"), ("t.me", "Social & chat"),
    ("teespring.com", "Shop & referrals"), ("ledger.com", "Shop & referrals"), ("goldmoney.com", "Shop & referrals"), ("gofund.me", "Shop & referrals"), ("substack.com", "Shop & referrals"), ("amazon.", "Shop & referrals"),
    ("steemit.com", "Articles & posts"), ("voat.co", "Articles & posts"), ("peakd.com", "Articles & posts"), ("wheredidthetowersgo.com", "Articles & posts"),
]
TOPICS = [  # (topic, regex on source + destination)
    ("9/11", r"911|towers|judywood|tlbnawki"), ("Hutchison Effect", r"hutchison"), ("Pizzagate", r"pizzagate"), ("Free energy & antigravity", r"freeenergy|antigravity"),
    ("Science & physics", r"science|physics|experiments|tesla"), ("Blockchain", r"blockchain|crypto|nano|ledger"), ("Bob Greenyer", r"(^|/)bg-|wildin"), ("Moon landing", r"moonlanding"),
    ("Occult", r"occult"), ("Typing", r"typing|wpm|transcri"), ("Timers & clocks", r"timer|clock|stopwatch|alarm|pomodoro|hiit|tabata|interval|countdown"), ("Graphing", r"graphing|(^|/)[23]d$"),
    ("School & grades", r"grade|gpa|^/gc|^/gpa"), ("Health", r"bmi"), ("Money", r"mortgage|inflation|vat|^/mc|^/ic|goldmoney|youtubemoney|ymc|youtuber"),
    ("Apps", r"hashtag|speech|extension|android|ios"),
]


def norm(p):
    p = p.split("#")[0].split("?")[0]
    return (p.rstrip("/") or "/")


def base_path(p):
    """/percentagecalculator/:path* -> /percentagecalculator"""
    return norm(re.sub(r"/:[A-Za-z_]+[*+?]?.*$", "", p)) if ":" in p else norm(p)


def main():
    cfg = json.loads((SITE / "vercel.json").read_text(encoding="utf-8"))
    reds = cfg.get("redirects", [])
    notes = {}
    nf = SITE / "go" / "notes.json"
    if nf.exists():
        notes = json.loads(nf.read_text(encoding="utf-8"))
    pages = {}
    try:
        si = json.loads((SITE / "site-index" / "pages.json").read_text(encoding="utf-8"))
        ix = {c: i for i, c in enumerate(si["cols"])}
        for r in si["p"]:
            pages[norm(r[ix["url"]])] = (r[ix["title"]].split(" | ")[0], si["sections"][r[ix["section"]]][1] if isinstance(si["sections"][r[ix["section"]]], list) else si["sections"][r[ix["section"]]])
    except Exception as e:
        print("Site Index not available (%s): internal titles fall back to the path" % e)
    sources = {}
    for r in reds:
        sources.setdefault(norm(r["source"]), 0)
        sources[norm(r["source"])] += 1
    out, issues = [], {"dup": 0, "chain": 0, "loop": 0, "gone": 0, "shadow": 0}
    seen = set()
    for r in reds:
        s, d = r["source"], r["destination"]
        u = urlparse(d)
        external = bool(u.netloc) and u.netloc not in ("mes.fm", "www.mes.fm")
        wild = ":" in s
        e = {"s": s, "d": d, "p": bool(r.get("permanent")), "k": "wild" if wild else ("external" if external else "internal")}
        checks = []
        if not wild and s in seen or (not wild and sources.get(norm(s), 0) > 1 and s in seen):
            checks.append("dup")
        seen.add(s)
        if external:
            host = u.netloc.replace("www.", "")
            e["h"] = host
            cat = next((c for sub, c in HOSTS if sub in host), "Other sites")
            if "youtube.com" in host:
                e["title"] = ("Channel " + u.path.lstrip("/")) if u.path.startswith("/@") else "Playlist" if "playlist" in u.path else "YouTube"
            else:
                e["title"] = host + (u.path if len(u.path) > 1 else "")
        else:
            dp = base_path(u.path or d if not u.netloc else u.path)
            t = pages.get(dp)
            e["title"] = t[0] if t else (dp.lstrip("/") or "Home")
            cat = (t[1] if t else None) or "Pages"
            if "Calculator" in cat: cat = "Calculators"
            e["dp"] = dp
            if not wild:
                if norm(s) == dp and not u.fragment:
                    checks.append("loop")
                if dp != "/" and dp not in pages and not (SITE / dp.lstrip("/") / "index.html").exists() and not (SITE / (dp.lstrip("/") + ".html")).exists():
                    checks.append("gone")
                if dp in sources and dp != norm(s):
                    checks.append("chain")
        if not wild and norm(s) != "/" and ((SITE / norm(s).lstrip("/") / "index.html").exists() or (SITE / (norm(s).lstrip("/") + ".html")).exists()):
            checks.append("shadow")
        if wild:
            cat = "Path redirects"
        note = notes.get(s) or notes.get(norm(s)) or {}
        if note.get("category"):
            cat = note["category"]
        e["c"] = cat
        topic = note.get("topic")
        if not topic:
            hay = (s + " " + d).lower()
            topic = next((t for t, rx in TOPICS if re.search(rx, hay)), "")
        e["t"] = topic
        if note.get("note"):
            e["n"] = note["note"]
        if checks:
            e["x"] = checks
            for c in checks:
                issues[c] += 1
        out.append(e)
    data = {"v": 1, "generated": __import__("datetime").date.today().isoformat(), "count": len(out), "r": out}
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    kinds = {k: sum(1 for e in out if e["k"] == k) for k in ("internal", "external", "wild")}
    cats = {}
    for e in out:
        cats[e["c"]] = cats.get(e["c"], 0) + 1
    print("%d redirects: %s; checks: %s" % (len(out), kinds, issues))
    print("categories:", ", ".join("%s %d" % kv for kv in sorted(cats.items(), key=lambda kv: -kv[1])))
    if VERBOSE:
        for e in out:
            if e.get("x"):
                print("  %-44s %-10s %s" % (e["s"], ",".join(e["x"]), e["d"][:70]))
    print("redirects.json: %.1f KB" % (len(text) / 1024))
    if APPLY:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if old and json.loads(old).get("r") == out:
            print("unchanged")
        else:
            OUT.write_text(text, encoding="utf-8")
            print("wrote", OUT)
    else:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
