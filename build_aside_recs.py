#!/usr/bin/env python3
"""Recommendations for the "More like this" sidebar (2026-10-02): writes mes.fm/main_js/aside-recs.json from mes.fm/search/index.json.

Contents (consumed by main_js/aside.js section 4, also the Jump-to pages' rail):
  calc    calculators and tools (each with topic tags `g`)             -> "Related calculators & tools" / "Calculators for this topic"
  math    curated math video tutorials (tags)                           -> "Free math video tutorials" on calculator-world pages
  mathall every math-category page except the Math Q/A livestreams     -> filler "More math tutorials" on math pages
  qa      the Math Q/A livestream replays                               -> only on other Math Q/A pages ("More Math Q/A livestreams"); never on any other page
  tags    {fam: {data-aside-family: [tags]}, pat: [[path regex, [tags]]]} -> the *page's* topic tags; items are ranked by tag overlap (+ a little randomness)
  ctx     {page path: [deep-link "Try it" cards]}                       -> calculators opened with this page's own example already typed in (?q= / ?f=)
Titles and thumbnails come from the search index, so **run build_search_index.py first**. Edit the tables below to change what is recommended / how pages are
matched. Idempotent; dry-runs by default, `--apply` writes.
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv

CALC = {   # path -> (kind, tags)
    "/calculator": ("Calculator", ["everyday", "algebra", "school"]),
    "/derivative-calculator": ("Calculator", ["calculus", "school", "algebra"]),
    "/integral-calculator": ("Calculator", ["calculus", "school"]),
    "/cas-calculator": ("Calculator", ["algebra", "calculus", "equations", "school"]),
    "/2d-graphing-calculator": ("Calculator", ["graphing", "algebra", "calculus", "school"]),
    "/3d-graphing-calculator": ("Calculator", ["graphing", "calculus", "vectors", "physics"]),
    "/percentagecalculator": ("Calculator", ["percent", "everyday", "money", "school"]),
    "/gradecalculator": ("Calculator", ["school", "percent"]),
    "/gpacalculator": ("Calculator", ["school"]),
    "/unit-conversion": ("Calculator", ["everyday", "science", "physics"]),
    "/days-between-dates-calculator": ("Calculator", ["time", "everyday"]),
    "/mortgagecalculator": ("Calculator", ["money", "finance"]),
    "/inflationcalculator": ("Calculator", ["money", "finance", "percent"]),
    "/vatcalculator": ("Calculator", ["money", "percent"]),
    "/bmicalculator": ("Calculator", ["health", "everyday"]),
    "/impermanent-loss-calculator": ("Calculator", ["crypto", "finance", "money"]),
    "/earth-curvature-calculator": ("Calculator", ["science", "physics", "math"]),
    "/latex": ("Tool", ["math", "school", "notation"]),
    "/symbols": ("Tool", ["math", "school", "notation"]),
    "/calendar": ("Tool", ["time", "astronomy", "everyday"]),
    "/moon": ("Tool", ["astronomy", "science", "time"]),
    "/timer": ("Tool", ["focus", "time", "school"]),
    "/speedreader": ("Tool", ["focus", "school"]),
    "/timezone": ("Tool", ["time", "everyday"]),
}
MATH = ["/problems-plus-6-cable-wound-spool", "/problems-plus-5-projectile-total-distance", "/problems-plus-4-curvature-parametric-integrals",
        "/problems-plus-3-ball-rolls-table", "/problems-plus-2-projectile-inclined-plane", "/problems-plus-1-projectile-origin",
        "/cubic-formula", "/quadratic-formula-complete-square", "/quadratic-formula-pq-substitution", "/cube-root-unity", "/vector-functions-problems-plus",
        "/vectors", "/sequences-series", "/spherical-harmonics", "/vector-functions", "/math"]
MATH_TAGS = [(r"cubic|quadratic|cube-root", ["algebra", "equations", "math"]), (r"problems-plus|vector|spherical|projectile|curvature", ["calculus", "vectors", "physics", "graphing", "math"]),
             (r"sequences", ["calculus", "series", "math"]), (r"math-qa", ["physics", "science", "math"])]
KIND = {"/math": "Math tutorials", "/math-qa": "Livestreams", "/vectors": "Math tutorials", "/sequences-series": "Math tutorials",
        "/spherical-harmonics": "Math tutorials", "/vector-functions": "Math tutorials"}
PAGE_TAGS = {
    "fam": {"percentagecalculator": ["percent", "everyday", "money", "school"], "gradecalculator": ["school", "percent"], "gpacalculator": ["school"],
            "mortgagecalculator": ["money", "finance"], "inflationcalculator": ["money", "finance", "percent"], "vatcalculator": ["money", "percent"],
            "bmicalculator": ["health", "everyday"], "memes": ["fun"], "puzzles": ["fun", "math", "school"], "timer": ["focus", "time", "school"], "tools": ["everyday"],
            "pokemongocalculator": ["fun"], "crypto": ["money", "finance", "crypto"], "science": ["science", "physics", "astronomy"], "graphing": ["graphing", "calculus", "algebra", "school"], "math-qa": ["physics", "science", "math"], "cubic-formula": ["algebra", "equations", "math"],
            "vector-functions-problems-plus": ["calculus", "vectors", "physics", "graphing", "math"]},
    "pat": [["problems-plus-[1-6]|projectile|curvature|spool", ["calculus", "graphing", "physics", "vectors"]], ["cubic|quadratic|cube-root", ["algebra", "equations"]],
            ["^/moon", ["astronomy", "time", "science"]], ["^/calendar", ["time", "astronomy"]], ["^/timer", ["focus", "time"]],
            ["percent", ["percent"]], ["mortgage|dream-homes", ["money", "finance"]], ["bmi|health", ["health"]], ["grade|gpa|study", ["school"]],
            ["electro|faraday|maxwell|lorentz|emf|aharonov", ["physics", "electromagnetism", "science"]]],
}
EQ = "0 = 2 - sin(alpha)*ln((1+sin(alpha))/(1-sin(alpha)))"
CTX = {   # page path regex -> [(target, title, kind-label, logo path)]
    r"^/2d-graphing-calculator": [("/derivative-calculator?q=" + quote("x^2*sin(x)"), "Find the slope of x² sin x, step by step", "/derivative-calculator"),
                                  ("/integral-calculator?q=" + quote("x^2*sin(x)"), "Find the area under it with an integral", "/integral-calculator"),
                                  ("/cas-calculator?q=" + quote("x^2 - 4 = 0"), "Solve the equation you graphed in the CAS", "/cas-calculator")],
    r"^/3d-graphing-calculator": [("/derivative-calculator?q=" + quote("x^2*y + sin(x*y)"), "Partial derivatives of a surface, step by step", "/derivative-calculator"),
                                  ("/2d-graphing-calculator", "Slice it: plot a cross-section in 2D", "/2d-graphing-calculator")],
    r"^/problems-plus-5-": [("/cas-calculator?q=" + quote(EQ), "Solve this page's launch-angle equation in the CAS", "/cas-calculator"),
                            ("/2d-graphing-calculator?f=" + quote("y = 2 - sin(x)*ln((1+sin(x))/(1-sin(x)))"), "Graph it and watch it cross zero near 0.9855", "/2d-graphing-calculator")],
    r"^/problems-plus-6-": [("/3d-graphing-calculator?f=" + quote("(cos(t), sin(t), t/4)"), "See a helix (the cable on the spool) in 3D", "/3d-graphing-calculator"),
                            ("/derivative-calculator?q=" + quote("sqrt((r*cos(t))^2 + (r*sin(t))^2 + h^2)"), "Differentiate a speed formula, step by step", "/derivative-calculator")],
    r"^/problems-plus-4-": [("/derivative-calculator?q=" + quote("x*sqrt(1 + x^2)"), "Try a chain-rule derivative with steps", "/derivative-calculator"),
                            ("/integral-calculator?q=" + quote("sqrt(1 + x^2)"), "Integrate an arc-length integrand with steps", "/integral-calculator")],
    r"^/problems-plus-[123]-": [("/2d-graphing-calculator?f=" + quote("x*tan(a) - x^2/(2*cos(a)^2)"), "Graph a projectile's path and drag the angle slider", "/2d-graphing-calculator"),
                                ("/cas-calculator?q=" + quote("x*tan(a) - x^2/(2*cos(a)^2) = 0"), "Solve for where it lands", "/cas-calculator")],
    r"^/(cubic-formula|cube-root-unity)": [("/cas-calculator?q=" + quote("x^3 - 6*x - 9 = 0"), "Solve a cubic with the CAS (exact roots + steps)", "/cas-calculator"),
                                         ("/2d-graphing-calculator?f=" + quote("y = x^3 - 6x - 9"), "Graph the cubic and see its real root", "/2d-graphing-calculator")],
    r"^/quadratic-formula": [("/cas-calculator?q=" + quote("x^2 - 5*x + 6 = 0"), "Solve a quadratic with steps", "/cas-calculator"),
                             ("/2d-graphing-calculator?f=" + quote("y = x^2 - 5x + 6"), "Graph the parabola and its roots", "/2d-graphing-calculator")],
    r"^/vector-functions-problems-plus": [("/3d-graphing-calculator?f=" + quote("(cos(t), sin(t), t/4)"), "Plot a vector function r(t) in 3D", "/3d-graphing-calculator"),
                                          ("/derivative-calculator?q=" + quote("sin(t)*cos(t)"), "Differentiate component functions step by step", "/derivative-calculator")],
    r"^/(vectors|spherical-harmonics|vector-functions)$": [("/3d-graphing-calculator", "Plot surfaces and curves in 3D", "/3d-graphing-calculator")],
    r"^/sequences-series": [("/cas-calculator", "Sums, limits and series in the CAS calculator", "/cas-calculator")],
    r"^/moon": [("/calendar", "Moon phases for any month in the Calendar", "/calendar")],
    r"^/inflationcalculator/money-facts/": [("/inflationcalculator?c=United+States&s=FRED&from=1980&amt=100", "What $100 from 1980 is worth today", "/inflationcalculator"),
                                            ("/inflationcalculator?c=United+Kingdom&s=UK+ONS&from=1950&amt=100", "What 100 pounds from 1950 is worth in the UK", "/inflationcalculator")],
    r"^/percentagecalculator$": [("/vatcalculator?mode=gross&gross=120&rate=20&c=GB", "Take 20% VAT out of a price that includes it", "/vatcalculator"),
                                 ("/vatcalculator?mode=net&net=250&rate=13&c=CA&g=ON", "Add Ontario's 13% HST to a $250 price", "/vatcalculator")],
    r"^/gradecalculator$": [("/gradecalculator?target=90&current=82&weight=30", "What you need on a 30% final to finish with an A-", "/gradecalculator"),
                            ("/gradecalculator?target=70&current=65&weight=50", "A 50% final: can you still get a 70?", "/gradecalculator")],
    r"^/mortgagecalculator$": [("/mortgagecalculator?r=ca&p=650000&dp=10&i=4.5&y=25", "Canada: 10% down on $650,000, with the CMHC premium", "/mortgagecalculator"),
                               ("/mortgagecalculator?r=us&p=450000&dp=20&i=6.5&y=30&cy=15&cr=5.75", "Compare a 30-year and a 15-year US mortgage", "/mortgagecalculator"),
                               ("/mortgagecalculator?r=us&p=450000&dp=20&i=6.5&y=30&xm=250", "See what an extra $250 a month does", "/mortgagecalculator")],
    r"^/inflationcalculator$": [("/inflationcalculator?c=United+States&from=1960&to=2025&cmp=Japan|Germany|Turkiye", "Compare US inflation with Japan, Germany and Turkiye", "/inflationcalculator"),
                                ("/inflationcalculator?c=Canada&s=StatCan&from=1990&amt=1000", "What 1,000 Canadian dollars from 1990 is worth today", "/inflationcalculator")],
}


def main():
    idx = json.loads((SITE / "search" / "index.json").read_text(encoding="utf-8"))
    by = {x[0]: x for x in idx["p"]}
    out = {}
    calc = []
    for u, (kind, tags) in CALC.items():
        x = by.get(u)
        if not x:
            print("missing from the search index (run build_search_index.py?):", u)
            continue
        calc.append({"u": u, "t": x[1], "i": (x[5] if len(x) > 5 and x[5] else u + "/img/logo.png"), "k": kind, "g": tags})
    out["calc"] = calc

    def mtags(u):
        for pat, tags in MATH_TAGS:
            if re.search(pat, u):
                return tags
        return ["math"]
    math = []
    for u in MATH:
        x = by.get(u)
        if x:
            math.append({"u": u, "t": x[1], "i": (x[5] if len(x) > 5 else ""), "k": KIND.get(u, "Math video"), "g": mtags(u)})
        else:
            print("missing:", u)
    out["math"] = math
    skip = set(MATH) | set(CALC) | {"/math", "/math-qa", "/livestreams"}
    allm = []
    qa = []
    for x in idx["p"]:
        u, title, cat = x[0], x[1], x[4]
        if cat == 2 and u not in skip and u.count("/") == 1 and not u.startswith("/911") and "hutchison" not in u:   # category 2 = Math
            if u.startswith("/math-qa"):        # the livestream Q/A replays are only recommended on other Math Q/A pages (pool "qa"), never as general math content
                if not u.endswith("-stats"):
                    qa.append({"u": u, "t": title, "i": (x[5] if len(x) > 5 else ""), "k": "Math Q/A livestream", "g": mtags(u)})
                continue
            allm.append({"u": u, "t": title, "i": (x[5] if len(x) > 5 else ""), "k": "Math video", "g": mtags(u)})
    out["mathall"] = allm
    out["qa"] = qa
    # the 9/11 / Hutchison / conspiracy cluster (2026-10-02): these pages recommend each other only (own family first, then the other two), never calculators or math.
    # Families come from each page's own data-aside-family; hubs and the graphic jumper clips are left out (thumbnails of the latter are not for cards).
    HUBS = {"911", "911-posts", "911-videos", "911truth", "911-short-videos", "911-observable-evidence", "1109-keo-meteor-music", "hutchison", "hutchison-posts", "hutchison-videos",
            "highlights", "articles", "hutchison-debunking-debunkers", "hutchison-news", "hutchison-unedited-footage", "hutchison-interviews", "cold-fusion-lenr",
            "conspiracy", "conspiracy-posts", "conspiracy-videos", "crypto", "science", "science-posts", "science-videos"}
    BAD = re.compile(r"jumper|jumping|falling-man|eyesiswatchin|coat-jumper")
    LABEL = {"911": "9/11 Truth", "hutchison": "Hutchison Effect", "conspiracy": "Conspiracy", "crypto": "Crypto", "science": "Science"}
    fam_re = re.compile(r'data-aside-family="([^"]+)"')
    cl = {"911": [], "hutchison": [], "conspiracy": [], "crypto": [], "science": []}   # crypto + science: their own pages (shown with calculators and math videos, see aside.js)
    for d in sorted(p for p in SITE.iterdir() if p.is_dir()):
        f = d / "index.html"
        if not f.exists() or d.name in HUBS or BAD.search(d.name):
            continue
        m = fam_re.search(f.read_text(encoding="utf-8", errors="ignore"))
        if not m or m.group(1) not in cl:
            continue
        x = by.get("/" + d.name)
        if x:
            cl[m.group(1)].append({"u": "/" + d.name, "t": x[1], "i": (x[5] if len(x) > 5 else ""), "k": LABEL[m.group(1)]})
    out["cl"] = cl
    print("cluster pools:", {k: len(v) for k, v in cl.items()})
    # livestreams (2026-10-02): the numbered MES livestreams from livestreams/playlist.json, tagged by topic from their titles; only shown on the 9/11 / Hutchison / conspiracy /
    # science / crypto pages (aside.js LS_PREFS decides which topics each family gets), never on math / calculator / tool pages. Cards go to the YouTube video (new tab) or to the
    # stream's mes.fm mirror page when it has one.
    TOPIC = [
        ("hutchison", r"hutchison|beneficence|radiant energy|free energy|lenr|\bevos?\b|exotic vacuum|electrogravitics|depalma|n-machine|zero point|experimental science|orgone|vortex coil|induction|energy recycling|greenyer|tom sky"),
        ("911", r"9/11|\bwtc\b|towers|judy wood|building 7|planes|mystery (objects|flashes)|ufos on 9|disinfo|blue bacon|clowns|nist|mystic bazaar|wings|chris shak|avengers|revisionist|morgan reynolds|andrew johnson|1109"),
        ("conspiracy", r"deep dive|predictive programming|assassination|jfk|epstein|pizzagate|january 6|jan 6|insurrection|moon|apollo|flat earth|mh370|blue beam|agenda 2030|clown world|controlled opposition|\bufo|buga|psyop|geoengineering|who runs the world|emergency broadcast|ww3|iran|trump|hollow|crop circles|doomsday|covid|kaufman|malthouse|hoffe|nagase|voice to skull|targeted individuals|okc"),
        ("science", r"physics|electro|gyroscope|n-machine|crop circles|vortex|moon landing|geoengineering|hollow|near death|lightning|evo|vacuum|free energy|zero point|harmonics|reich|orgone|radiant|field (effects|interference)|hurricane|eclipse|methylminer|biodigital|teleportation|virology"),
        ("crypto", r"blockchain|\bhive\b|taxation|\bai\b|artificial intelligence|biodigital|infocrypt|bitcoin|crypto|deep fakes"),
    ]
    mirrors = {}
    try:
        bm = (SITE / "livestreams" / "build.mjs").read_text(encoding="utf-8")
        for mm in re.finditer(r'(\w{11}):\s*\{\s*href:\s*"(https://mes\.fm/[^"]+)"', bm):
            mirrors[mm.group(1)] = mm.group(2)[len("https://mes.fm"):]
    except OSError:
        pass
    lsl = []
    for v in json.loads((SITE / "livestreams" / "playlist.json").read_text(encoding="utf-8")):
        m = re.match(r"^MES Livestream (\d+):\s*(.+)$", v["title"])
        if not m or v.get("status") not in ("public", "upcoming"):
            continue
        topics = [name for name, rx in TOPIC if re.search(rx, v["title"], re.I)]
        if not topics:
            continue
        mir = mirrors.get(v["id"])
        lsl.append({"u": mir or "https://www.youtube.com/watch?v=" + v["id"], "t": "%s: %s" % (m.group(1), m.group(2)),
                    "i": (v.get("thumb") or "").replace("maxresdefault", "mqdefault"), "k": "Livestream" + (" (upcoming)" if v.get("status") == "upcoming" else ""),
                    "g": topics, "x": 0 if mir else 1})
    out["ls"] = lsl
    print("livestreams %d (%s)" % (len(lsl), ", ".join("%s %d" % (n, sum(1 for x in lsl if n in x["g"])) for n, _ in TOPIC)))
    out["tags"] = PAGE_TAGS
    ctx = {}
    logos = {c["u"]: c["i"] for c in calc}
    for pat, cards in CTX.items():
        ctx[pat] = [{"u": u, "t": t, "i": logos.get(lg, lg + "/img/logo.png"), "k": "Try it"} for u, t, lg in cards]
    out["ctx"] = ctx
    print("calc %d, math %d, mathall %d, qa %d, ctx patterns %d" % (len(calc), len(math), len(allm), len(qa), len(ctx)))
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    if APPLY:
        (SITE / "main_js" / "aside-recs.json").write_text(text, encoding="utf-8")
    print("%d bytes %s" % (len(text), "written" if APPLY else "(dry run, pass --apply)"))


if __name__ == "__main__":
    main()
