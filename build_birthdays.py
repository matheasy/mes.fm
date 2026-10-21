#!/usr/bin/env python3
"""Build the famous-birthdays data of mes.fm/birthday (also read by mes.fm/zodiac) from Wikidata (CC0).

  python3 build_birthdays.py            dry run: query, report counts, write nothing
  python3 build_birthdays.py --apply    write mes.fm/birthday/data/{01..12}.json + index.json
  options: --top N (default 10000 people kept, ranked by Wikidata sitelinks = how many Wikipedias / Wikimedia
           projects have a page on them), --cache (reuse scratch results of an earlier run in /tmp)

Source: query.wikidata.org SPARQL (CC0 data, polite User-Agent, one query at a time, retries with backoff).
  1. humans (P31 Q5) with >= MIN_SL sitelinks and a birth date (P569, best rank) of DAY precision (year- or month-only
     dates are skipped), fetched in birth-year batches so no query times out;
  2. the top --top by sitelinks get details in batches of ids: English label + description, English Wikipedia title,
     death date (day precision, else year), country of citizenship, occupations (-> a field), Julian-calendar flag;
  3. birthday_extras.json (repo root, hand-maintained) is merged on top: people kept regardless of rank. An entry with a
     "qid" gets its date and details from Wikidata too (so dates are verified, never typed by hand); fields given in the
     extras file override. An entry without a qid must carry its own "dob" AND a "source" (URL) for that date.
Dates are as Wikidata's RDF gives them: proleptic Gregorian (a Julian-calendar date is converted; such people carry os=1).

Output (compact arrays, `cols` header): data/MM.json = people born in month MM sorted by day, then rank;
data/index.json = every person's [qid, name, "YYYY-MM-DD"] for the name search (the month file has the rest).
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mes.fm" / "birthday" / "data"
EXTRAS = ROOT / "birthday_extras.json"
APPLY = "--apply" in sys.argv
TOP = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--top=")), 10000)
CACHE = Path("/tmp/mes-birthdays-cache.json")
UA = "MESfm-birthday-builder/1.0 (https://mes.fm/birthday; python urllib)"
EP = "https://query.wikidata.org/sparql"
MIN_SL = 38
RANGES = [(1000, 1700), (1700, 1800), (1800, 1850), (1850, 1880), (1880, 1900), (1900, 1915), (1915, 1930), (1930, 1940), (1940, 1947),
          (1947, 1953), (1953, 1960), (1960, 1966), (1966, 1972), (1972, 1978), (1978, 1985), (1985, 1992), (1992, 2030)]


def sparql(q, tries=6):
    data = urllib.parse.urlencode({"query": q}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(EP, data=data, headers={"User-Agent": UA, "Accept": "application/sparql-results+json",
                                                                  "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode())["results"]["bindings"]
        except Exception as e:
            wait = 5 * (i + 1)
            print("    query failed (%s), retry in %ds" % (str(e)[:80], wait))
            time.sleep(wait)
    raise SystemExit("SPARQL kept failing")


def qid(uri):
    return uri.rsplit("/", 1)[-1]


def candidates():
    found = {}
    for a, b in RANGES:
        q = """SELECT ?p ?sl ?dob ?cal WHERE {
  ?p wikibase:sitelinks ?sl . FILTER(?sl >= %d)
  ?p wdt:P31 wd:Q5 .
  ?p p:P569 ?st . ?st a wikibase:BestRank ; psv:P569 ?v .
  ?v wikibase:timeValue ?dob ; wikibase:timePrecision 11 ; wikibase:timeCalendarModel ?cal .
  FILTER(?dob >= "%04d-01-01T00:00:00Z"^^xsd:dateTime && ?dob < "%04d-01-01T00:00:00Z"^^xsd:dateTime)
}""" % (MIN_SL, a, b)
        t = time.time()
        rows = sparql(q)
        print("  %d-%d: %d rows (%.0fs)" % (a, b, len(rows), time.time() - t))
        for r in rows:
            k = qid(r["p"]["value"])
            d = r["dob"]["value"][:10]
            julian = r["cal"]["value"].endswith("Q1985786")
            e = found.setdefault(k, {"sl": int(r["sl"]["value"]), "dobs": set(), "os": False})
            e["dobs"].add(d)
            e["os"] = e["os"] or julian
        time.sleep(1)
    return found


# portraits: Wikidata P18 (a Commons file). Stored as "<md5 prefix>|<file name>" so the page can build a direct
# upload.wikimedia.org thumbnail URL (/thumb/a/ab/<file>/<w>px-<file>[.png|.jpg]) without the Special:FilePath redirect.
IMG_EXT = {"jpg", "jpeg", "png", "gif", "svg", "tif", "tiff", "webp"}


def img_code(fname):
    import hashlib
    f = fname.replace(" ", "_")
    ext = f.rsplit(".", 1)[-1].lower() if "." in f else ""
    if ext not in IMG_EXT or "|" in f or len(f) > 160:
        return ""
    return hashlib.md5(f.encode("utf-8")).hexdigest()[:2] + "|" + f


def images(ids):
    out = {}
    for i in range(0, len(ids), 400):
        chunk = ids[i:i + 400]
        q = """SELECT ?p (SAMPLE(?img) AS ?i) WHERE { VALUES ?p { %s } ?p p:P18 ?st . ?st a wikibase:BestRank ; ps:P18 ?img . } GROUP BY ?p""" % " ".join("wd:" + x for x in chunk)
        for r in sparql(q):
            out[qid(r["p"]["value"])] = urllib.parse.unquote(r["i"]["value"].rsplit("/Special:FilePath/", 1)[-1])
        for k in chunk:
            out.setdefault(k, "")
        print("  images %d/%d" % (min(i + 400, len(ids)), len(ids)))
        time.sleep(1)
    return out


def details(ids):
    out = {}
    for i in range(0, len(ids), 300):
        chunk = ids[i:i + 300]
        q = """SELECT ?p ?label ?ml ?desc ?wiki ?dod ?dodp (SAMPLE(?cL) AS ?country) (GROUP_CONCAT(DISTINCT ?oL; separator="|") AS ?occ) (SAMPLE(?g) AS ?gender) WHERE {
  VALUES ?p { %s }
  OPTIONAL { ?p rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?p rdfs:label ?ml FILTER(LANG(?ml) = "mul") }
  OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?wiki schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?p p:P570 ?ds . ?ds a wikibase:BestRank ; psv:P570 ?dv . ?dv wikibase:timeValue ?dod ; wikibase:timePrecision ?dodp }
  OPTIONAL { ?p wdt:P27 ?c . ?c rdfs:label ?cL FILTER(LANG(?cL) = "en") }
  OPTIONAL { ?p wdt:P106 ?o . ?o rdfs:label ?oL FILTER(LANG(?oL) = "en") }
  OPTIONAL { ?p wdt:P21 ?g }
} GROUP BY ?p ?label ?ml ?desc ?wiki ?dod ?dodp""" % " ".join("wd:" + x for x in chunk)
        rows = sparql(q)
        for r in rows:
            k = qid(r["p"]["value"])
            e = out.setdefault(k, {})
            v = lambda n: r.get(n, {}).get("value", "")
            if not e.get("name"):
                e["name"] = v("label") or v("ml")    # many items now carry their name only as the language-neutral "mul" label
            e.setdefault("desc", v("desc"))
            if v("wiki") and "wiki" not in e:
                e["wiki"] = urllib.parse.unquote(v("wiki").split("/wiki/", 1)[1])
            if v("dod") and "dod" not in e:
                p = int(v("dodp") or 0)
                e["dod"] = v("dod")[:10] if p >= 11 else (v("dod")[:4] if p == 9 else "")
                if e["dod"].startswith("-"): e["dod"] = ""
            if v("country") and "country" not in e:
                e["country"] = v("country")
            occ = [o for o in v("occ").split("|") if o]
            e["occ"] = sorted(set(e.get("occ", []) + occ))
            g = v("gender")
            if g and "g" not in e:
                e["g"] = "f" if g.endswith("Q6581072") else ("m" if g.endswith("Q6581097") else "")
        print("  details %d/%d" % (min(i + 300, len(ids)), len(ids)))
        time.sleep(1)
    return out


# occupation / description words -> one field (first rule that matches wins)
FIELDS = [
    ("royalty", r"\b(monarch|king|queen|emperor|empress|prince|princess|sultan|pharaoh|tsar|czar|duke|duchess|royal|aristocrat|noble)"),
    ("religion", r"\b(pope|saint|bishop|cardinal|priest|theolog|rabbi|imam|religious|monk|nun|missionary|prophet|spiritual|cleric|guru|preacher|pastor)"),
    ("sports", r"(footballer|soccer|basketball|baseball|tennis|cricket|athlete|boxer|wrestler|racing|racer|driver|cyclist|swimmer|golfer|skier|sport|player|olympi|coach|martial art|chess|skater|gymnast|jockey|runner|mixed martial|hockey|rugby|volleyball|sprinter|motorcycle|formula one|mountaineer|bodybuilder|darts|snooker|figure skat|esports)"),
    ("music", r"(singer|musician|composer|rapper|guitarist|pianist|drummer|songwriter|conductor|\bdj\b|disc jockey|record producer|bassist|violinist|band|opera|music)"),
    ("film", r"(actor|actress|film|director|television|presenter|comedian|screenwriter|model|youtuber|streamer|influencer|host|voice|entertainer|dancer|magician|stunt|producer|showrunner|broadcaster|cinematographer|animator|cartoonist|podcaster|judge show|internet personality)"),
    ("politics", r"(politician|president|prime minister|minister|senator|governor|diplomat|lawyer|judge|jurist|activist|revolutionary|statesman|mayor|chancellor|first lady|political|dictator|civil servant|ambassador|monarchist|trade union|attorney)"),
    ("military", r"(military|general|admiral|soldier|officer|commander|marshal|pilot|astronaut|cosmonaut|spy|explorer|aviator|navigator)"),
    ("science", r"(physicist|chemist|mathematic|scientist|biologist|astronomer|engineer|inventor|physician|doctor|surgeon|psychologist|economist|computer|philosopher|geologist|botanist|naturalist|zoologist|astrophysic|researcher|programmer|neurolog|psychiatr|geneticist|anthropolog|archaeolog|historian|sociolog|linguist|academic|professor|nurse|statistician)"),
    ("business", r"(business|entrepreneur|executive|investor|industrialist|banker|founder|chief executive|ceo|merchant|magnate|billionaire|financier|philanthropist|chef|designer|fashion)"),
    ("writing", r"(writer|novelist|poet|author|journalist|playwright|essayist|screenwriter|editor|columnist|blogger|literary|biographer|lyricist|translator|critic)"),
    ("art", r"(painter|sculptor|artist|architect|photographer|illustrator|printmaker|art\b|comics)"),
]
FIELD_NAMES = {"music": "Music", "film": "Film, TV & internet", "sports": "Sports", "politics": "Politics & law", "science": "Science & ideas",
               "writing": "Writing", "art": "Art & design", "business": "Business", "religion": "Religion", "royalty": "Royalty",
               "military": "Military & exploration", "other": "Other"}


def field_of(desc, occ):
    # the description says what someone is best known for: the field whose word comes FIRST in it wins
    # ("novelist and spy" -> writing, "writer and diplomat" -> writing); then the occupations the same way
    for src in (desc.lower(), " | ".join(occ).lower()):
        best = None
        for f, rx in FIELDS:
            m = re.search(rx, src)
            if m and (best is None or m.start() < best[0]):
                best = (m.start(), f)
        if best:
            return best[1]
    return "other"


def clean_desc(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s[:1].upper() + s[1:] if s else ""


def main():
    if "--cache" in sys.argv and CACHE.exists():
        cache = json.loads(CACHE.read_text())
        cand = {k: {"sl": v["sl"], "dobs": set(v["dobs"]), "os": v["os"]} for k, v in cache["cand"].items()}
        det = cache["det"]
        imgs = cache.get("imgs", {})
        print("cache: %d candidates, %d details" % (len(cand), len(det)))
    else:
        print("querying candidates (sitelinks >= %d, day-precision birth date)" % MIN_SL)
        cand, det, imgs = candidates(), {}, {}
    # people whose best-rank birth dates disagree on the day are left out (no guessing)
    clash = [k for k, v in cand.items() if len(v["dobs"]) > 1]
    for k in clash:
        del cand[k]
    print("candidates: %d (%d left out: conflicting birth dates)" % (len(cand), len(clash)))
    ranked = sorted(cand, key=lambda k: -cand[k]["sl"])[:TOP]
    extras = json.loads(EXTRAS.read_text()) if EXTRAS.exists() else []
    ex_ids = [e["qid"] for e in extras if e.get("qid")]
    # extras with a qid: their own birth date query (no sitelinks threshold)
    missing_ex = [k for k in ex_ids if k not in cand]
    if missing_ex:
        q = """SELECT ?p ?sl ?dob ?cal WHERE { VALUES ?p { %s } ?p wikibase:sitelinks ?sl .
  ?p p:P569 ?st . ?st a wikibase:BestRank ; psv:P569 ?v . ?v wikibase:timeValue ?dob ; wikibase:timePrecision 11 ; wikibase:timeCalendarModel ?cal . }""" % " ".join("wd:" + x for x in missing_ex)
        for r in sparql(q):
            k = qid(r["p"]["value"])
            e = cand.setdefault(k, {"sl": int(r["sl"]["value"]), "dobs": set(), "os": False})
            e["dobs"].add(r["dob"]["value"][:10])
            e["os"] = e["os"] or r["cal"]["value"].endswith("Q1985786")
    need = [k for k in ranked + ex_ids if (k not in det or not det[k].get("name")) and k in cand]
    for k in need:
        det.pop(k, None)
    if need:
        print("fetching details for %d people" % len(need))
        det.update(details(need))
    need_img = [k for k in ranked + ex_ids if k in cand and k not in imgs]
    if need_img:
        print("fetching portraits (P18) for %d people" % len(need_img))
        imgs.update(images(need_img))
    CACHE.write_text(json.dumps({"cand": {k: {"sl": v["sl"], "dobs": sorted(v["dobs"]), "os": v["os"]} for k, v in cand.items()}, "det": det, "imgs": imgs}))
    people = {}
    for k in ranked + ex_ids:
        if k not in cand or len(cand[k]["dobs"]) != 1:
            if k in ex_ids:
                print("  EXTRA %s: no single day-precision birth date on Wikidata, left out" % k)
            continue
        d = det.get(k, {})
        name = d.get("name") or ""
        if not name or re.match(r"^Q\d+$", name):
            continue
        dob = next(iter(cand[k]["dobs"]))
        if dob.startswith("-") or int(dob[:4]) < 1000:
            continue
        people[k] = {"id": k, "name": name, "dob": dob, "dod": d.get("dod", ""), "desc": clean_desc(d.get("desc", "")),
                     "country": d.get("country", ""), "field": field_of(d.get("desc", ""), d.get("occ", [])),
                     "wiki": d.get("wiki", ""), "sl": cand[k]["sl"], "os": 1 if cand[k]["os"] else 0, "g": d.get("g", ""), "x": 0, "img": img_code(imgs.get(k, ""))}
    # extras: overrides, and people without a Wikidata item (need dob + source)
    for e in extras:
        k = e.get("qid") or ("X" + re.sub(r"[^a-z0-9]+", "-", e["name"].lower()).strip("-"))
        if k not in people:
            if e.get("qid"):
                continue
            if not (e.get("dob") and e.get("source")):
                print("  EXTRA %s: no dob + source, left out" % e.get("name"))
                continue
            people[k] = {"id": k, "name": e["name"], "dob": e["dob"], "dod": "", "desc": "", "country": "", "field": "other",
                         "wiki": "", "sl": 0, "os": 0, "g": "", "x": 1, "img": ""}
        p = people[k]
        p["x"] = 1
        if e.get("image"):          # a Commons file name chosen by hand
            p["img"] = img_code(e["image"])
        for f in ("name", "desc", "country", "field", "wiki", "dod"):
            if e.get(f):
                p[f] = e[f]
        if e.get("dob") and e.get("qid") and e["dob"] != p["dob"]:
            print("  NOTE %s: extras dob %s differs from Wikidata %s; Wikidata kept" % (p["name"], e["dob"], p["dob"]))
        if e.get("link"):
            p["link"] = e["link"]
    # rank = order by sitelinks (extras without a rank go last but stay in)
    order = sorted(people.values(), key=lambda p: (-p["sl"], p["name"]))
    for i, p in enumerate(order):
        p["rank"] = i + 1
    cols = ["id", "name", "dob", "dod", "desc", "country", "field", "wiki", "rank", "sl", "os", "g", "x", "link", "img"]
    months = {m: [] for m in range(1, 13)}
    for p in order:
        months[int(p["dob"][5:7])].append(p)
    total = 0
    if APPLY:
        OUT.mkdir(parents=True, exist_ok=True)
    for m, lst in months.items():
        lst.sort(key=lambda p: (p["dob"][8:10], p["rank"]))
        rows = [[p.get(c, "") for c in cols] for p in lst]
        txt = json.dumps({"cols": cols, "fields": FIELD_NAMES, "rows": rows}, ensure_ascii=False, separators=(",", ":"))
        total += len(txt.encode())
        if APPLY:
            (OUT / ("%02d.json" % m)).write_text(txt, encoding="utf-8")
    idx = json.dumps({"cols": ["id", "name", "dob", "rank"], "generated": time.strftime("%Y-%m-%d"), "source": "Wikidata (CC0), query.wikidata.org",
                      "rows": [[p["id"], p["name"], p["dob"], p["rank"]] for p in order]}, ensure_ascii=False, separators=(",", ":"))
    if APPLY:
        (OUT / "index.json").write_text(idx, encoding="utf-8")
        lib = ROOT / "tool_apps_src" / "birthday" / "lib.js"     # cache-buster of the data files, shared by /birthday and /zodiac
        ls = lib.read_text(encoding="utf-8")
        today, cur = time.strftime("%Y-%m-%d"), re.search(r'var DATA_V = "([^"]*)"', ls).group(1)
        ver = today if not cur.startswith(today) else today + "." + str(int(cur.split(".")[1]) + 1 if "." in cur else 2)   # a second run on the same day still busts caches
        ls2 = re.sub(r'var DATA_V = "[^"]*"', 'var DATA_V = "%s"' % ver, ls, count=1)
        if ls2 != ls:
            lib.write_text(ls2, encoding="utf-8")
            print("DATA_V updated in tool_apps_src/birthday/lib.js: rebuild with build_tool_apps.py --only=birthday,zodiac --apply")
    fc = {}
    for p in order:
        fc[p["field"]] = fc.get(p["field"], 0) + 1
    print("portraits: %d of %d people" % (sum(1 for p in order if p.get("img")), len(order)))
    print("people: %d (%d extras); month files %d KB total, index %d KB" % (len(order), sum(p["x"] for p in order), total // 1024, len(idx.encode()) // 1024))
    print("fields:", ", ".join("%s %d" % kv for kv in sorted(fc.items(), key=lambda kv: -kv[1])))
    for e in extras:
        k = e.get("qid")
        if k in people:
            p = people[k]
            print("  extra: %-28s %s  (%s)  rank %d" % (p["name"], p["dob"], k, p["rank"]))
    print("" if APPLY else "(dry run -- pass --apply to write %s)" % OUT)


if __name__ == "__main__":
    main()
