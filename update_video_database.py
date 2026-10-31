#!/usr/bin/env python3
"""Build mes.fm/database/data.json, the data of the MES Video Database page (mes.fm/database), and add single videos to it.

Sources, merged per YouTube id:
  * the owner's spreadsheet "MES Video Info Database.xlsx" (OneDrive, sheet "Video Infos and Links"; read from a temporary COPY, never written
    unless --add ... --xlsx is given): running number, series code, date, length, title, and the Rumble / Telegram / BitChute / 3Speak / Odysee /
    notes / Hive links. Columns that are private or dead are never read into the page (see PRIVATE_NOTE below);
  * mes.fm/math/youtube-videos.json (the public @mes Videos tab: title, length, views), mes.fm/livestreams/playlist.json (livestreams),
    mes.fm/math/youtube-hive-links.json (YouTube id -> Hive post);
  * the mes.fm mirror pages themselves (a page whose player / "Watch on" line names exactly one YouTube id is that video's mes.fm page);
  * yt-dlp per video (upload date, length, views, availability), cached in tool_apps_src/database/yt-cache.json. Videos that are unlisted or
    private on YouTube are left out of the page completely, and the cache keeps them only as a hash, so their ids never reach the repo;
    a video YouTube removed stays in (without a YouTube link) when it has other links;
  * tool_apps_src/database/added.json: videos added with --add (kept on every import).

  python3 update_video_database.py                     dry run: read everything, print what would change
  python3 update_video_database.py --apply             write mes.fm/database/data.json
  python3 update_video_database.py --refresh --apply   also re-read views / dates from YouTube for every video (~5 minutes)
  python3 update_video_database.py --add https://youtu.be/ID --apply            one new video: yt-dlp metadata, Hive post (youtube-hive-links.json,
         else a search of @mes / @mestruth's recent posts), 3Speak, Rumble / Odysee / BitChute / Telegram links from the YouTube description
         and the Hive post, the mes.fm page if one exists. Also takes a mes.fm page or a Hive (peakd / hive.blog / ecency / 3speak) link.
  python3 update_video_database.py --add URL --xlsx --apply                     ... and append the same row to the spreadsheet (backup first:
         "MES Video Info Database.backup-<date>.xlsx" beside it). The row is written into the xlsx XML directly (Table2 grows by one row,
         the formulas of the row above are copied, the rows under the table move down one), so the chart, styles and hyperlinks survive;
         openpyxl would drop the chart sheet. --xlsx-path FILE writes another copy instead (for testing).

Needs openpyxl to read the spreadsheet (pip install openpyxl). Without it (or with --no-xlsx) the spreadsheet's fields are kept from the current
data.json. Dry-runs by default.
"""
import argparse, concurrent.futures as cf, datetime, hashlib, html, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from pathlib import Path

R = Path(__file__).resolve().parent
SITE = R / "mes.fm"
OUT = SITE / "database" / "data.json"
SRCD = R / "tool_apps_src" / "database"
CACHE = SRCD / "yt-cache.json"
ADDED = SRCD / "added.json"
LISTS = SRCD / "yt-lists.json"   # snapshot of the public channel tabs the repo has no other copy of (livestreams, @mestruth)
TABS = ["https://www.youtube.com/@mes/streams", "https://www.youtube.com/@mestruth/videos", "https://www.youtube.com/@mestruth/streams"]
XLSX = Path.home() / "Library/CloudStorage/OneDrive-Personal/MathEasySolutions/YouTube/Stats/MES Video Info Database.xlsx"
SHEET = "Video Infos and Links"
HIVE_API = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"]

PRIVATE_NOTE = """Left out of the page on purpose: Video Description beyond a short opening, Tags, Post to subscribers comment, Article HTML,
Embed / Name + Embed code, Forum Caption, Article in video info, Post + Dtube / Post + Hive (copy-paste texts), More Info required??,
Video Specific Links (Dropbox files), the Dropbox copy-paste columns, Word Notes (old OneDrive Word files), Excel notes, the "Checklist"
and "Gplus Data" sheets (private process notes, Google Drive file ids), dead platforms (VidMe, LiveLeak, BitTube, Blurt, DTube, the old
WordPress Article Link), the scratch maths under the table, and every unlisted / private YouTube video."""

# ---- series / topics -------------------------------------------------------------------------------------------------
# (key, label, group, title regex, spreadsheet "Local Count" regex). A video can be in several. group "series" = MES series and
# subjects, "math" = math topics. Order = chip order.
SERIES = [
    ("911", "9/11 Truth", "series", r"#?911Truth|9/11|\b911\b|Observable Evidence|Twin Towers|\bWTC\b|Keor Meteor|Where Did the Towers|Judy Wood(?!.*Space Shuttle)", r"✈"),
    ("hutchison", "Hutchison Effect", "series", r"Hutchison", r"\d+U?HEI?$"),
    ("experiments", "MES Experiments", "series", r"#MESExperiments", r"MESX"),
    ("mes-science", "MES Science", "series", r"#MESScience", r"#MS"),
    ("antigravity", "Anti-Gravity", "series", r"#AntiGravity|Laithwaite", r"#AG"),
    ("free-energy", "Free Energy & Cold Fusion", "series", r"#FreeEnergy|Cold Fusion|Fleischmann|\bLENR\b", r"#FE|^FEO?\d"),
    ("physics", "Physics", "series", r"Physics|Magnetic|Aether|Michelson|Relativ|Kepler|Gyro|Electromagnet|Isopotential|Projectile|Newton|Blackbody|Planck|Optics|Centripetal|Lightning|Tornado|Tesla Coil|Plasma|Velocity|Acceleration|Momentum|Energy\b|Force\b|Exam Problem|Engineering|Aharonov|Hall Sensor|Flying Saucer", r"Physics"),
    ("bg", "Bob Greenyer", "series", r"Greenyer", None),
    ("pizzagate", "PizzaGate", "series", r"PizzaGate", r"#PG"),
    ("tengri", "Tengri137", "series", r"Tengri137", r"#TN"),
    ("mh370", "MH370", "series", r"MH370", None),
    ("moon", "Moon & Space", "series", r"\bMoon\b|Apollo|NASA|Space Shuttle|Lunar|Flat Earth|Earth\b|Orbit|Planet", r"Moon"),
    ("occult", "Occult & Symbolism", "series", r"Occult|Vatican|\bPope\b|Symbolism|Coincidence", r"👁"),
    ("mes-truth", "MES Truth", "series", r"$^", r"^Truth\d"),
    ("nba", "NBA & Sports", "series", r"\bNBA\b|Basketball|Hack-a-Shaq|Soccer|Football|Olympic", r"mfa"),
    ("crypto", "Crypto & Hive", "series", r"Steem|\bHive\b|Bitcoin|Crypto|Blockchain|DTube|3Speak|Impermanent Loss|\bXRP\b", r"^Topic"),
    ("livestreams", "MES Livestreams", "series", r"MES Livestream|Livestream \d", None),
    ("math-qa", "MES Math Q/A", "series", r"Math Q/?A", None),
    ("problems-plus", "Problems Plus", "series", r"Problems Plus", None),
    ("math", "Math tutorials", "series", None, None),   # filled in by classify(): any math topic, or a plain-number spreadsheet code
    ("other", "Other videos", "series", None, None),    # filled in by classify(): no other series matched
    ("derivatives", "Derivatives", "math", r"Derivative|Differentiat|Related Rates|Tangent Line|Linear Approximation|Curve Sketching|Optimization|Mean Value|L.?Hospital|Newton.?s Method|Leibniz", None),
    ("integrals", "Integrals", "math", r"Integra|Antiderivative|Fundamental Theorem|Riemann|Volumes?\b|Areas? Between|Arc Length|Surface Area|Partial Fraction", None),
    ("limits", "Limits & Continuity", "math", r"\bLimits?\b|Continuity|Squeeze Theorem", None),
    ("series-seq", "Sequences & Series", "math", r"Sequence|\bSeries\b|Taylor|Maclaurin|Convergen|Power Series|Ratio Test|Comparison Test", None),
    ("diff-eq", "Differential Equations", "math", r"Differential Equation|Population Growth|Predator-Prey|Logistic|Exponential Growth|Direction Field|Euler.?s Method", None),
    ("parametric-polar", "Parametric & Polar", "math", r"Parametric|Polar|Conic", None),
    ("vectors", "Vectors & 3D", "math", r"Vector|Dot Product|Cross Product|Planes?\b|Geometry of Space|Quadric|Cylinders?|Curvature|3D|Ellipsoid|Paraboloid|Hyperboloid|Distance Formula|Space Curve|Lines?\b|Spheres?\b|Trefoil|Spherical Harmonic|Laplac", None),
    ("linear-algebra", "Matrices & Linear Algebra", "math", r"Matri(?:x|ces)|Linear Algebra|Determinant|Eigen|Complex Number", None),
    ("trig", "Trigonometry", "math", r"Trig|\bSine\b|Cosine|Hyperbolic|Unit Circle|\bsin\b|\bcos\b|\btan\b", None),
    ("algebra", "Algebra", "math", r"Quadratic|Cubic|Polynomial|Factor|Algebra|Logarithm|Exponent|Square Roots?|Completing the Square|Complete the Square|Inequalit|Absolute Value|Functions?\b", None),
    ("probability", "Probability & Statistics", "math", r"Probabilit|Statistic|Expected Value|Normal Distribution|Variance|Standard Deviation|Odds", None),
    ("number-theory", "Numbers & Vortex Math", "math", r"Vortex|Modul[oa]|Number System|Prime|Digit|Hexadecimal|Binary|Divisib|Fibonacci|Magic Square", None),
    ("geometry", "Geometry", "math", r"Pythag|Triangle|Circles?\b|Geometry|Polygon|Golden Ratio", None),
    ("biology", "Biology & Chemistry", "math", r"Animal Form|Ecology|Organic Compound|Biology|\bCells?\b|Cellular|Chemistry|Evolution|Genetic|Plant|Photosynthesis|Macromolecule|Protein|Virus|Viruses|Vaccin|COVID|Virology|Diversity|Fungi|Metabolism|Acids and Bases|Bacteria", None),
]
TRUTHY = {"911", "hutchison", "experiments", "mes-science", "antigravity", "free-energy", "pizzagate", "tengri", "mh370", "occult", "mes-truth", "nba", "crypto", "livestreams", "moon"}


def classify(title, code="", channel="", live=False):
    t, code = title or "", str(code or "")
    out = []
    for key, _lab, _g, tre, cre in SERIES:
        if key in ("math", "other"):
            continue
        if (tre and re.search(tre, t, re.I)) or (cre and re.search(cre, code)):
            out.append(key)
    if channel == "mestruth" and "mes-truth" not in out:
        out.append("mes-truth")
    if live and "livestreams" not in out:
        out.append("livestreams")
    mathy = [k for k in out if k in {s[0] for s in SERIES if s[2] == "math"}] or [k for k in out if k in ("math-qa", "problems-plus")]
    truthy = [k for k in out if k in TRUTHY]
    if (mathy and not truthy) or (re.fullmatch(r"\d+", code.strip()) and not truthy) or ("math-qa" in out or "problems-plus" in out):
        if not truthy:
            out = [k for k in out if k != "physics"] + (["physics"] if "physics" in out else [])
        out.insert(0, "math")
    else:
        # math topic words in a non-math video (e.g. "Magic Squares" in Tengri137) are not math tutorials
        out = [k for k in out if k not in {s[0] for s in SERIES if s[2] == "math"}] if truthy else out
    order = [s[0] for s in SERIES]
    return sorted(set(out), key=order.index) or ["other"]


# ---- link normalisers (each returns the short form stored in data.json, or "") ------------------------------------------
def s(v):
    return "" if v is None else str(v).strip()


def yt_id(v):
    v = s(v)
    m = re.search(r"New:\s*\S*?(?:youtu\.be/|v=|/shorts/|/live/|/embed/)([\w-]{11})", v)
    if m:
        return m.group(1)
    m = re.search(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:[^ ]*&)?v=|shorts/|live/|embed/))([\w-]{11})", v)
    return m.group(1) if m else ""


def n_rumble(v):
    m = re.search(r"rumble\.com/(v[\w.-]+?\.html)", s(v))
    return m.group(1) if m else ""


def n_odysee(v):
    m = re.search(r"odysee\.com/((?:@[\w.-]+:\w+/)?[\w.,'%-]+(?::\w+)?)(?=https?://|[\s\"<)\]]|$)", s(v))
    return m.group(1).rstrip(".,") if m else ""


def n_bitchute(v):
    m = re.search(r"bitchute\.com/(?:video|update_video|embed)/([\w-]{6,20})", s(v))
    return m.group(1) if m else ""


def n_3speak(v):
    v = s(v)
    m = re.search(r"3speak\.(?:tv|co|online)/(?:watch|embed)\?v=([\w.-]+/[\w-]+)", v) or re.search(r"3speak\.(?:tv|co|online)/@([\w.-]+)/([\w-]+)", v)
    if not m:
        return ""
    return m.group(1) if len(m.groups()) == 1 else m.group(1) + "/" + m.group(2)


def n_telegram(v):
    m = re.search(r"t\.me/([A-Za-z]\w{3,}/\d+)", s(v))
    return m.group(1) if m else ""


def n_hive(v):
    m = re.search(r"(?:peakd\.com|hive\.blog|ecency\.com|steemit\.com|inleo\.io|leofinance\.io)/(?:[\w-]+/)?@([\w.-]+)/([\w-]+)", s(v))
    return "@%s/%s" % (m.group(1), m.group(2)) if m else ""


def page_exists(slug):
    return bool(slug) and ((SITE / slug / "index.html").exists() or (SITE / (slug + ".html")).exists())


def n_mesfm(v):
    m = re.search(r"(?:^|//|\s)(?:www\.)?mes\.fm/([\w.-]+)/?(?:[\s?#]|$)", " " + s(v) + " ")
    return m.group(1) if m and page_exists(m.group(1)) else ""


def n_pdf(v):
    v = s(v)
    if n_mesfm(v):
        return "mes.fm/" + n_mesfm(v)
    m = re.search(r"https://1drv\.ms/b/[\w!/.?=&%-]+", v)   # OneDrive PDF share links (the "Download the notes" links in the descriptions)
    return m.group(0) if m else ""


def short_desc(v, n=170):
    v = re.sub(r"https?://\S+", "", s(v))
    v = re.sub(r"\s+", " ", v).strip()
    if v in ("#N/A", "0") or len(v) < 8:
        return ""
    if len(v) <= n:
        return v
    cut = v[:n]
    m = re.search(r"^(.{70,}[.!?])\s", cut)
    return m.group(1) if m else cut.rsplit(" ", 1)[0] + "…"


def hid(i):
    return "h:" + hashlib.sha1(i.encode()).hexdigest()[:16]


# ---- spreadsheet ------------------------------------------------------------------------------------------------------
COLS = {"n": "Global Count", "code": "Local Count", "date": "Date Uploaded", "dur": "Video Duration (mm:ss)", "title": "Video Title",
        "yt": "Youtube Link", "rumble": "Rumble", "tg": "Telegram", "bitchute": "BitChute Link", "sp": "3Speak", "odysee": "Odysee",
        "pdf": "PDF (or other) Notes", "hive": "Hive Notes", "desc": "Video Description"}


def dur_seconds(v):
    if v is None:
        return 0
    if isinstance(v, datetime.time):
        return v.hour * 3600 + v.minute * 60 + v.second
    if isinstance(v, datetime.timedelta):
        return int(v.total_seconds())
    if isinstance(v, datetime.datetime):
        return v.hour * 3600 + v.minute * 60 + v.second
    m = re.fullmatch(r"(?:(\d+):)?(\d+):(\d+)", s(v))
    return (int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + int(m.group(3))) if m else 0


def read_xlsx(path):
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl is needed to read the spreadsheet: pip install openpyxl (or run with --no-xlsx)")
    tmp = Path(tempfile.mkdtemp()) / "copy.xlsx"
    shutil.copy2(path, tmp)            # read a copy: the OneDrive file may be open in Excel
    wb = openpyxl.load_workbook(tmp, read_only=True, data_only=True)
    ws = wb[SHEET]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    shutil.rmtree(tmp.parent, ignore_errors=True)
    hi = next(i for i, r in enumerate(rows) if r and "Global Count" in [s(x) for x in r])
    head = [s(x) for x in rows[hi]]
    ix = {k: head.index(v) for k, v in COLS.items()}
    out = []
    for r in rows[hi + 1:]:
        if not r or not re.fullmatch(r"\d+", s(r[ix["n"]])):
            continue
        g = lambda k: r[ix[k]]
        y = yt_id(g("yt"))
        if not y:
            continue
        d = g("date")
        d = d.strftime("%Y-%m-%d") if isinstance(d, datetime.datetime) else (s(d)[:10] if re.match(r"\d{4}-\d\d-\d\d", s(d)) else "")
        out.append(dict(y=y, n=int(s(g("n"))), code=s(g("code")), d=d, u=dur_seconds(g("dur")), t=s(g("title")),
                        r=n_rumble(g("rumble")), tg=n_telegram(g("tg")), b=n_bitchute(g("bitchute")), sp=n_3speak(g("sp")),
                        o=n_odysee(g("odysee")), pdf=n_pdf(g("pdf")), h=n_hive(g("hive")), m=n_mesfm(g("hive")), x=short_desc(g("desc"))))
    return out


# ---- YouTube metadata (yt-dlp, cached) ----------------------------------------------------------------------------------
TPL = "%(.{id,upload_date,duration,view_count,availability,uploader_id,live_status,title})j"


def ytdlp_batch(ids):
    p = subprocess.run(["yt-dlp", "--skip-download", "--no-update", "--ignore-errors", "--no-warnings", "--print", TPL]
                       + ["https://www.youtube.com/watch?v=" + i for i in ids], capture_output=True, text=True)
    res = {}
    for line in p.stdout.splitlines():
        try:
            j = json.loads(line)
            res[j["id"]] = j
        except (ValueError, KeyError):
            pass
    for line in p.stderr.splitlines():
        for i in ids:
            if i in line and "ERROR" in line and i not in res:
                res[i] = {"id": i, "error": line[-200:]}
    return res


def fetch_lists():
    """flat lists of the public channel tabs in TABS -> {tab: [{id, title, dur, views}]} (Shorts are left out on purpose)"""
    out = {}
    for tab in TABS:
        p = subprocess.run(["yt-dlp", "--flat-playlist", "--dump-json", "--no-update", "--no-warnings", tab], capture_output=True, text=True)
        rows = []
        for line in p.stdout.splitlines():
            try:
                j = json.loads(line)
            except ValueError:
                continue
            rows.append({"id": j["id"], "title": s(j.get("title")), "dur": int(j.get("duration") or 0),
                         "views": j.get("view_count") if j.get("view_count") is not None else -1})
        out[tab] = rows
        print("  %s: %d videos" % (tab, len(rows)))
    return out


def meta_entry(j):
    """yt-dlp json -> cache entry {a: public|unlisted|private|removed|signin|upcoming, d, u, v, c, live, t, f (fetched)}"""
    today = datetime.date.today().isoformat()
    if "error" in j:
        e = j["error"]
        a = "private" if "Private video" in e else "signin" if "cookies" in e or "Sign in" in e else "upcoming" if "will begin" in e else "removed"
        return {"a": a, "f": today}
    d = s(j.get("upload_date"))
    return {"a": j.get("availability") or "public", "d": "%s-%s-%s" % (d[:4], d[4:6], d[6:8]) if len(d) == 8 else "",
            "u": int(j.get("duration") or 0), "v": j.get("view_count") if j.get("view_count") is not None else -1,
            "c": s(j.get("uploader_id")).lstrip("@").lower(), "live": j.get("live_status") in ("was_live", "is_live", "is_upcoming", "post_live"),
            "t": s(j.get("title")), "f": today}


def put_cache(cache, yid, e):
    """public videos are stored under their id; anything else only as a hash (unlisted / private ids must never reach the repo)"""
    cache.pop(yid, None)
    cache.pop(hid(yid), None)
    if e["a"] in ("public", "signin", "upcoming"):
        cache[yid] = e
    else:
        cache[hid(yid)] = {"a": e["a"], "f": e["f"]}


def get_cache(cache, yid):
    return cache.get(yid) or cache.get(hid(yid))


def fetch_meta(cache, ids, workers=10):
    ids = list(ids)
    if not ids:
        return
    print("  yt-dlp: %d videos ..." % len(ids), flush=True)
    chunks = [ids[k:k + 25] for k in range(0, len(ids), 25)]
    with cf.ThreadPoolExecutor(workers) as ex:
        for res in ex.map(ytdlp_batch, chunks):
            for yid, j in res.items():
                put_cache(cache, yid, meta_entry(j))


# ---- mes.fm mirror pages ----------------------------------------------------------------------------------------------
def scan_mirrors():
    """YouTube id -> (slug, 3Speak id) for every mes.fm page whose player / Watch-on line names exactly one YouTube id"""
    pat = re.compile(r"YT_ID\s*=\s*['\"]([\w-]{11})['\"]|youtube(?:-nocookie)?\.com/embed/([\w-]{11})|data-yt(?:-id)?=\"([\w-]{11})\"")
    watch = re.compile(r"Watch on:.{0,600}?youtu\.be/([\w-]{11})", re.S)
    found = {}
    for f in sorted(SITE.glob("*/index.html")):
        slug = f.parent.name
        if slug.startswith(("_", ".")) or slug in ("database", "youtube", "livestreams", "math-qa"):
            continue
        try:
            t = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        ids = {next(g for g in m.groups() if g) for m in pat.finditer(t)}
        wids = {m.group(1) for m in watch.finditer(t)}
        ids |= wids
        if len(ids) != 1:
            continue
        yid = ids.pop()
        sp = n_3speak(t) or ""
        m = re.search(r"SLUG\s*=\s*['\"]([\w.-]+/[\w-]+)['\"]", t)
        if m:
            sp = m.group(1)
        hv = n_hive(t)
        strong = "YT_ID" in t or bool(wids)       # a player variable or a "Watch on" line: a real mirror; a bare embed may be a post quoting a video
        tm = re.search(r"<title>(.*?)</title>", t, re.S)
        title = html.unescape(tm.group(1)).split(" | ")[0].strip() if tm else ""
        prev = found.get(yid)
        # several pages for one video (a mirror and its PDF page ...): keep the one with a player
        if prev is None or ("YT_ID" in t and not prev[3]):
            found[yid] = (slug, sp, hv, "YT_ID" in t, strong, title)
    return {k: (v[0], v[1], v[2], v[4], v[5]) for k, v in found.items()}


# ---- Hive ------------------------------------------------------------------------------------------------------------
def hive_call(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    last = None
    for api in HIVE_API:
        try:
            req = urllib.request.Request(api, data=body, headers={"Content-Type": "application/json", "User-Agent": "mes.fm-video-database/1.0"})
            r = json.load(urllib.request.urlopen(req, timeout=20))
            if "result" in r:
                return r["result"]
            last = r.get("error")
        except Exception as e:   # try the next node
            last = e
    raise RuntimeError("Hive API failed: %s" % last)


def hive_post(path):
    a, p = path.lstrip("@").split("/", 1)
    return hive_call("bridge.get_post", {"author": a, "permlink": p})


def hive_find(yid, accounts=("mes", "mestruth"), pages=4):
    """search the accounts' newest posts for one that names the YouTube id"""
    for acc in accounts:
        start = {}
        for _ in range(pages):
            res = hive_call("bridge.get_account_posts", dict({"sort": "posts", "account": acc, "limit": 20}, **start)) or []
            for p in res:
                if p.get("author") == acc and yid in (p.get("body") or ""):
                    return p
            if len(res) < 20:
                break
            start = {"start_author": res[-1]["author"], "start_permlink": res[-1]["permlink"]}
    return None


def links_in(text):
    return {k: f(text) for k, f in (("r", n_rumble), ("o", n_odysee), ("b", n_bitchute), ("tg", n_telegram), ("sp", n_3speak)) if f(text)}


# ---- merge ------------------------------------------------------------------------------------------------------------
LINK_KEYS = ("m", "h", "sp", "r", "o", "b", "tg", "pdf")


def similar(a, b):
    """do two titles share most of their words? (for a page that only embeds a video)"""
    wa, wb = (set(re.findall(r"[a-z0-9]{3,}", x.lower())) for x in (a, b))
    return bool(wa and wb) and len(wa & wb) >= 0.5 * min(len(wa), len(wb))


def load_json(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def build(xrows, cache, added, old):
    yt_list = {v["id"]: v for v in load_json(SITE / "math/youtube-videos.json", [])}
    for tab, rows in load_json(LISTS, {}).items():
        for v in rows:
            yt_list.setdefault(v["id"], v)
    pl = {v["id"]: v for v in load_json(SITE / "livestreams/playlist.json", [])}
    hive_links = load_json(SITE / "math/youtube-hive-links.json", {})
    mirrors = scan_mirrors()
    xl = {r["y"]: r for r in xrows}
    ids = list(dict.fromkeys(list(xl) + list(yt_list) + list(pl) + list(hive_links) + [a["y"] for a in added if a.get("y")]))
    addm = {a["y"]: a for a in added if a.get("y")}
    out, dropped = [], {"unlisted": 0, "private": 0, "removed, no other link": 0, "no info": 0}
    for yid in ids:
        x, a, c = xl.get(yid, {}), addm.get(yid, {}), get_cache(cache, yid) or {}
        listed = yid in yt_list or (yid in pl and pl[yid].get("status") in ("public", "upcoming"))
        avail = c.get("a", "") if c.get("a") in ("unlisted", "private") else "public" if listed else c.get("a", "")   # YouTube's current answer wins over an older list
        if avail in ("unlisted", "private"):
            dropped[avail] += 1
            continue
        if not avail:
            dropped["no info"] += 1
            continue
        on_yt = avail in ("public", "signin", "upcoming")
        rec = {"y": yid if on_yt else ""}
        rec["t"] = s(c.get("t")) or s(yt_list.get(yid, {}).get("title")) or s(pl.get(yid, {}).get("title")) or a.get("t") or x.get("t", "")
        if not rec["t"]:
            dropped["no info"] += 1
            continue
        rec["d"] = c.get("d") or a.get("d") or x.get("d", "")
        rec["u"] = c.get("u") or yt_list.get(yid, {}).get("dur") or pl.get(yid, {}).get("duration") or a.get("u") or x.get("u") or 0
        views = [v for v in (c.get("v"), yt_list.get(yid, {}).get("views"), a.get("v")) if isinstance(v, int) and v >= 0]
        rec["v"] = max(views) if views and on_yt else -1
        ch = c.get("c") or s(pl.get(yid, {}).get("channel")).lstrip("@").lower() or a.get("c") or ("mes" if yid in yt_list else "")
        rec["c"] = ch
        live = bool(c.get("live")) or yid in pl or a.get("k")
        rec["k"] = 2 if (avail == "upcoming" or pl.get(yid, {}).get("status") == "upcoming") else 1 if live else 0
        rec["n"] = x.get("n", 0) or a.get("n", 0)
        rec["x"] = x.get("x") or a.get("x", "")
        L = {}
        mi = mirrors.get(yid)
        if mi and not mi[3] and not similar(mi[4], rec["t"]):
            mi = None
        for k in LINK_KEYS:
            v = (a.get("L") or {}).get(k) or x.get(k, "")
            if k == "m" and mi:
                v = mi[0]
            if k == "h":
                v = n_hive(hive_links.get(yid, "")) or v or (mi[2] if mi else "")
            if k == "sp" and not v and mi:
                v = mi[1]
            if v:
                L[k] = v
        rec["L"] = L
        if not on_yt and not L:
            dropped["removed, no other link"] += 1
            continue
        rec["s"] = classify(rec["t"], x.get("code", ""), ch, bool(live))
        if x.get("s_old"):    # no spreadsheet this run: keep what its series codes gave last time
            rec["s"] = [k for k in x["s_old"] if k in {q[0] for q in SERIES}] or rec["s"]
        out.append(rec)
    out.sort(key=lambda r: (r["d"] or "0000", r["n"]), reverse=True)
    return out, dropped


def compact(rec):
    r = {k: v for k, v in rec.items() if v not in ("", 0, -1, None, {}, []) or k in ("t",)}
    if rec.get("v", -1) == 0:
        r["v"] = 0
    return r


def payload(videos, old_generated=None, old_videos=None):
    vids = [compact(v) for v in videos]
    gen = old_generated if (old_generated and vids == old_videos) else datetime.date.today().isoformat()
    return {"v": 1, "generated": gen, "count": len(vids), "series": [[k, lab, g] for k, lab, g, _t, _c in SERIES], "videos": vids}


def write_out(data, apply):
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    print("  %s: %d videos, %.0f KB%s" % (OUT.relative_to(R), data["count"], len(txt.encode()) / 1024, "" if txt != old else " (unchanged)"))
    if apply and txt != old:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(txt, encoding="utf-8")


def save_cache(cache, apply):
    if apply:
        SRCD.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


# ---- --add --------------------------------------------------------------------------------------------------------------
def resolve_add(url):
    """any of: YouTube link, mes.fm page link, Hive / 3Speak link -> (YouTube id, {links found}, hive post or None)"""
    found, post = {}, None
    yid = yt_id(url)
    m = re.search(r"mes\.fm/([\w.-]+)", url)
    if not yid and m and page_exists(m.group(1)):
        slug = m.group(1)
        f = SITE / slug / "index.html" if (SITE / slug / "index.html").exists() else SITE / (slug + ".html")
        t = f.read_text(encoding="utf-8", errors="ignore")
        mm = re.search(r"YT_ID\s*=\s*['\"]([\w-]{11})['\"]", t)
        yid = mm.group(1) if mm else yt_id(t)
        found["m"] = slug
        if n_hive(t):
            found["h"] = n_hive(t)
    hp = n_hive(url) or ("@" + n_3speak(url) if n_3speak(url) else "")
    if hp:
        post = hive_post(hp)
        if post:
            found["h"] = "@%s/%s" % (post["author"], post["permlink"])
            yid = yid or yt_id(post.get("body", ""))
    if not yid:
        sys.exit("No YouTube id found for %s" % url)
    return yid, found, post


def add_video(url, cache, args):
    yid, found, post = resolve_add(url)
    print("  YouTube id:", yid)
    p = subprocess.run(["yt-dlp", "-J", "--skip-download", "--no-update", "--no-warnings", "https://www.youtube.com/watch?v=" + yid], capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit("yt-dlp could not read the video: " + p.stderr.strip()[-300:])
    j = json.loads(p.stdout)
    e = meta_entry(j)
    put_cache(cache, yid, e)
    if e["a"] not in ("public", "signin"):
        sys.exit("The video is %s on YouTube: not added (the database lists public videos only)." % e["a"])
    desc = s(j.get("description"))
    L = links_in(desc)
    hive_links = load_json(SITE / "math/youtube-hive-links.json", {})
    if not post:
        hp = found.get("h") or n_hive(hive_links.get(yid, ""))
        try:
            post = hive_post(hp) if hp else hive_find(yid)
        except Exception as ex:
            print("  (Hive lookup failed: %s)" % ex)
    if post:
        L["h"] = "@%s/%s" % (post["author"], post["permlink"])
        for k, v in links_in(post.get("body", "")).items():
            L.setdefault(k, v)
        jm = post.get("json_metadata") or {}
        if isinstance(jm, str):
            jm = load_json_str(jm)
        if str(jm.get("app", "")).startswith("3speak") or jm.get("video"):
            L["sp"] = "%s/%s" % (post["author"], post["permlink"])
    L.update({k: v for k, v in found.items()})
    mi = scan_mirrors().get(yid)
    if mi:
        L["m"] = mi[0]
        L.setdefault("sp", mi[1]) if mi[1] else None
    rec = {"y": yid, "t": e["t"], "d": e["d"], "u": e["u"], "v": e["v"], "c": e["c"], "k": 1 if e.get("live") else 0,
           "x": short_desc(desc), "L": {k: v for k, v in L.items() if v}}
    return rec


def load_json_str(t):
    try:
        return json.loads(t)
    except ValueError:
        return {}


# ---- writing one row into the spreadsheet (raw XML, so charts / styles / hyperlinks survive) ------------------------------
CELL_RE = re.compile(r"(\$?)([A-Z]{1,3})(\$?)(\d+)")


def shift_refs(formula, at, sheet=None):
    """move every reference to a row >= at down one row (what Excel does on an inserted row). Text in quotes is left alone.
    sheet: only shift references qualified with that sheet name (used for other sheets' formulas)."""
    parts = re.split(r'("(?:[^"]|"")*")', formula)
    for i in range(0, len(parts), 2):
        seg = parts[i]

        def rep(m):
            pre = seg[max(0, m.start() - 1):m.start()]
            if pre and (pre.isalnum() or pre in "_.[]"):
                return m.group(0)
            if sheet is not None:
                q = seg[:m.start()]
                if not (q.endswith("'%s'!" % sheet) or q.endswith("%s!" % sheet)):
                    return m.group(0)
            row = int(m.group(4))
            return "%s%s%s%d" % (m.group(1), m.group(2), m.group(3), row + 1 if row >= at else row)
        parts[i] = re.sub(r"(?<![A-Za-z0-9_\]])" + CELL_RE.pattern + r"(?![A-Za-z0-9_(\[])", rep, seg)
    return "".join(parts)


def col_letter(n):
    t = ""
    while n:
        n, r = divmod(n - 1, 26)
        t = chr(65 + r) + t
    return t


def col_num(c):
    n = 0
    for ch in c:
        n = n * 26 + ord(ch) - 64
    return n


def xml_esc(v):
    return html.escape(str(v), quote=False)


def xlsx_append(path, rec):
    """append one video row to Table2 of the sheet, in place (caller makes the backup)"""
    with zipfile.ZipFile(path) as z:
        files = {n: z.read(n) for n in z.namelist()}
        infos = {i.filename: i for i in z.infolist()}
    wbx = files["xl/workbook.xml"].decode()
    rid = re.search(r'<sheet name="%s"[^>]*r:id="(rId\d+)"' % re.escape(SHEET), wbx).group(1)
    rels = files["xl/_rels/workbook.xml.rels"].decode()
    target = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % rid, rels) or re.search(r'Target="([^"]+)"[^>]*Id="%s"' % rid, rels)
    sheet_path = "xl/" + target.group(1).lstrip("/").replace("xl/", "")
    srels_path = sheet_path.replace("worksheets/", "worksheets/_rels/") + ".rels"
    sx = files[sheet_path].decode()
    srels = files.get(srels_path, b"").decode()
    # the table on this sheet
    tpath = None
    for m in re.finditer(r'<Relationship [^>]*Target="\.\./tables/(table\d+\.xml)"', srels):
        tx = files["xl/tables/" + m.group(1)].decode()
        if "Video Title" in tx:
            tpath = "xl/tables/" + m.group(1)
            break
    tx = files[tpath].decode()
    ref = re.search(r'<table [^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"', tx)
    c0, r0, c1, r1 = ref.group(1), int(ref.group(2)), ref.group(3), int(ref.group(4))
    totals = int((re.search(r'totalsRowCount="(\d+)"', tx) or [0, 0])[1]) if re.search(r'totalsRowCount="(\d+)"', tx) else 0
    last = r1 - totals            # last data row
    at = last + 1                 # the new row goes here; everything from `at` moves down one
    # header names -> column letters
    hdr_cols = {}
    for m in re.finditer(r'<tableColumn [^>]*name="([^"]+)"', tx):
        hdr_cols[html.unescape(m.group(1))] = col_letter(col_num(c0) + len(hdr_cols))
    if rec["y"] and rec["y"] in sx_text_ids(files):
        return "already in the spreadsheet"
    # 1. move rows >= at down one
    sx = re.sub(r'<row r="(\d+)".*?</row>|<row r="(\d+)"[^>]*/>', lambda m: move_row_any(m, at), sx, flags=re.S)
    # 2. shift references inside every formula of this sheet
    sx = re.sub(r"(<f(?:\s[^>]*)?(?<!/)>)(.*?)(</f>)", lambda m: m.group(1) + xml_esc(shift_refs(html.unescape(m.group(2)), at)) + m.group(3), sx, flags=re.S)
    sx = re.sub(r'(<f\s[^>]*\bref=")([^"]+)(")', lambda m: m.group(1) + shift_refs(m.group(2), at) + m.group(3), sx)
    for tag in ("hyperlink", "mergeCell", "conditionalFormatting", "dataValidation", "selection"):
        attr = "sqref" if tag in ("conditionalFormatting", "dataValidation", "selection") else "ref"
        sx = re.sub(r'(<%s [^>]*\b%s=")([^"]+)(")' % (tag, attr), lambda m: m.group(1) + shift_refs(m.group(2), at) + m.group(3), sx)
    sx = re.sub(r'(<dimension ref=")([^"]+)(")', lambda m: m.group(1) + shift_refs(m.group(2), at) + m.group(3), sx)
    # 3. the new row = a copy of the last data row: same styles, formulas moved one row down, our values
    tmpl = re.search(r'<row r="%d"[^>]*>.*?</row>' % last, sx, flags=re.S).group(0)
    from openpyxl.formula.translate import Translator
    vals = {COLS["date"]: ("date", rec.get("d")), COLS["dur"]: ("dur", rec.get("u")), COLS["title"]: ("s", rec.get("t")),
            COLS["yt"]: ("s", "https://youtu.be/" + rec["y"]), COLS["n"]: None,
            COLS["rumble"]: ("s", url_of("r", rec)), COLS["tg"]: ("s", url_of("tg", rec)), COLS["bitchute"]: ("s", url_of("b", rec)),
            COLS["sp"]: ("s", url_of("sp", rec)), COLS["odysee"]: ("s", url_of("o", rec)),
            COLS["hive"]: ("s", url_of("m", rec) or url_of("h", rec)), COLS["desc"]: ("s", rec.get("x_full") or rec.get("x"))}
    letter_val = {hdr_cols[k]: v for k, v in vals.items() if k in hdr_cols}
    new_links = []

    def new_cell(m):
        attrs, inner = m.group(1), m.group(2) or ""
        col = re.match(r'r="([A-Z]+)\d+"', attrs).group(1)
        style = (re.search(r'\bs="(\d+)"', attrs) or [None, None])[1]
        sa = ' s="%s"' % style if style else ""
        ref = "%s%d" % (col, at)
        fm = re.search(r"<f[^>]*>(.*?)</f>", inner, re.S)
        if fm:
            f = Translator("=" + html.unescape(fm.group(1)), origin="%s%d" % (col, last)).translate_formula(ref)[1:]
            tattr = ' t="str"' if 't="str"' in attrs else ""
            return '<c r="%s"%s%s><f>%s</f></c>' % (ref, sa, tattr, xml_esc(f))
        v = letter_val.get(col)
        if v and v[1] not in (None, "", 0):
            kind, val = v
            if kind == "date":   # the column stores Excel serial dates
                d = datetime.date.fromisoformat(val)
                return '<c r="%s"%s><v>%d</v></c>' % (ref, sa, (d - datetime.date(1899, 12, 30)).days)
            if kind == "dur":
                return '<c r="%s"%s><v>%s</v></c>' % (ref, sa, repr(val / 86400.0))
            if str(val).startswith("http"):
                new_links.append((ref, str(val)))
            return '<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (ref, sa, xml_esc(val))
        return '<c r="%s"%s/>' % (ref, sa)
    row_open = re.match(r"<row [^>]*>", tmpl).group(0)
    inner_row = tmpl[len(row_open):-len("</row>")]
    row_open = re.sub(r'r="%d"' % last, 'r="%d"' % at, row_open, 1)
    cells = re.sub(r'<c (r="[A-Z]+%d"[^>]*?)(?:/>|>(.*?)</c>)' % last, new_cell, inner_row, flags=re.S)
    new_row = row_open + cells + "</row>"
    sx = sx.replace(tmpl, tmpl + new_row, 1)
    # hyperlinks for the new URL cells
    if new_links:
        ids = [int(x) for x in re.findall(r'Id="rId(\d+)"', srels)] or [0]
        nxt = max(ids) + 1
        add_rel, add_h = "", ""
        for ref, u in new_links:
            add_rel += '<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="%s" TargetMode="External"/>' % (nxt, html.escape(u))
            add_h += '<hyperlink ref="%s" r:id="rId%d"/>' % (ref, nxt)
            nxt += 1
        srels = srels.replace("</Relationships>", add_rel + "</Relationships>")
        if "<hyperlinks>" in sx:
            sx = sx.replace("</hyperlinks>", add_h + "</hyperlinks>", 1)
        else:
            sx = re.sub(r"(</sheetData>(?:<sheetProtection[^>]*/>)?(?:<autoFilter[^>]*/>)?(?:<mergeCells.*?</mergeCells>)?)", r"\1<hyperlinks>" + add_h.replace("\\", "\\\\") + "</hyperlinks>", sx, 1, flags=re.S)
    files[sheet_path] = sx.encode()
    files[srels_path] = srels.encode()
    # 4. the table grows by one row
    tx = tx.replace('ref="%s%d:%s%d"' % (c0, r0, c1, r1), 'ref="%s%d:%s%d"' % (c0, r0, c1, r1 + 1), 1)
    tx = re.sub(r'(<autoFilter ref="%s%d:%s)(\d+)"' % (c0, r0, c1), lambda m: '%s%d"' % (m.group(1), int(m.group(2)) + 1), tx, 1)
    files[tpath] = tx.encode()
    # 5. other sheets / charts / defined names that point below the new row
    for name in list(files):
        if name == sheet_path or not name.endswith(".xml") or not (name.startswith("xl/worksheets/") or name.startswith("xl/charts/") or name == "xl/workbook.xml"):
            continue
        t = files[name].decode()
        t2 = re.sub(r"(<(?:f|c:f|definedName)(?:\s[^>]*)?(?<!/)>)(.*?)(</(?:f|c:f|definedName)>)", lambda m: m.group(1) + xml_esc(shift_refs(html.unescape(m.group(2)), at, sheet=SHEET)) + m.group(3), t, flags=re.S)
        if t2 != t:
            files[name] = t2.encode()
    # 6. Excel rebuilds the calculation chain and recalculates on open
    files.pop("xl/calcChain.xml", None)
    files["xl/_rels/workbook.xml.rels"] = re.sub(r'<Relationship [^>]*Target="calcChain\.xml"/>', "", files["xl/_rels/workbook.xml.rels"].decode()).encode()
    files["[Content_Types].xml"] = re.sub(r'<Override [^>]*PartName="/xl/calcChain\.xml"[^>]*/>', "", files["[Content_Types].xml"].decode()).encode()
    w = files["xl/workbook.xml"].decode()
    w = re.sub(r"<calcPr([^>]*?)(\s*fullCalcOnLoad=\"\d\")?(/?)>", r'<calcPr\1 fullCalcOnLoad="1"\3>', w, 1)
    files["xl/workbook.xml"] = w.encode()
    tmp = Path(str(path) + ".writing")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in files.items():
            zi = zipfile.ZipInfo(n, date_time=infos[n].date_time if n in infos else (1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, b)
    os.replace(tmp, path)
    return "row %d added to %s (Table2 now ends at row %d)" % (at, Path(path).name, r1 + 1)


def move_row_any(m, at):
    n = int(m.group(1) or m.group(2))
    if n < at:
        return m.group(0)
    body = re.sub(r'^<row r="%d"' % n, '<row r="%d"' % (n + 1), m.group(0), 1)
    return re.sub(r'(<c r="[A-Z]+)%d"' % n, lambda mm: '%s%d"' % (mm.group(1), n + 1), body)


def sx_text_ids(files):
    """YouTube ids already in the spreadsheet (in its shared strings / inline strings)"""
    t = files.get("xl/sharedStrings.xml", b"").decode(errors="ignore")
    for n, b in files.items():
        if n.startswith("xl/worksheets/sheet"):
            t += b.decode(errors="ignore")
    return set(re.findall(r"youtu\.be/([\w-]{11})", t))


def url_of(k, rec):
    if k == "y":
        return "https://youtu.be/" + rec["y"]
    v = (rec.get("L") or {}).get(k, "")
    if not v:
        return ""
    return {"m": "https://mes.fm/" + v, "h": "https://peakd.com/" + v, "sp": "https://3speak.tv/watch?v=" + v, "r": "https://rumble.com/" + v,
            "o": "https://odysee.com/" + v, "b": "https://www.bitchute.com/video/%s/" % v, "tg": "https://t.me/" + v,
            "pdf": v if v.startswith("http") else "https://" + v}[k]


# ---- main ---------------------------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write the files (default: dry run)")
    ap.add_argument("--xlsx-in", default=str(XLSX), help="spreadsheet to read (default: the OneDrive file)")
    ap.add_argument("--no-xlsx", action="store_true", help="don't read the spreadsheet: keep its fields from the current data.json")
    ap.add_argument("--no-fetch", action="store_true", help="never call yt-dlp (videos missing from the cache are left out)")
    ap.add_argument("--refresh", action="store_true", help="re-read every video's views / date / availability from YouTube")
    ap.add_argument("--meta-json", help="a saved yt-dlp dump {id: {...}} to seed the cache with instead of fetching")
    ap.add_argument("--add", metavar="URL", help="add one video (YouTube, mes.fm or Hive / 3Speak link)")
    ap.add_argument("--xlsx", action="store_true", help="with --add: also append the row to the spreadsheet (backup first)")
    ap.add_argument("--xlsx-path", help="with --add --xlsx: write this file instead of the OneDrive spreadsheet")
    a = ap.parse_args()
    cache = load_json(CACHE, {})
    added = load_json(ADDED, [])
    old = load_json(OUT, {})
    if a.meta_json:
        for yid, j in load_json(a.meta_json, {}).items():
            put_cache(cache, yid, meta_entry(j))
    if a.add:
        rec = add_video(a.add, cache, a)
        print(json.dumps(rec, ensure_ascii=False, indent=1))
        added = [x for x in added if x.get("y") != rec["y"]] + [rec]
        if a.xlsx:
            target = Path(a.xlsx_path) if a.xlsx_path else Path(a.xlsx_in)
            with zipfile.ZipFile(target) as z:
                already = rec["y"] in sx_text_ids({n: z.read(n) for n in z.namelist() if n == "xl/sharedStrings.xml" or n.startswith("xl/worksheets/sheet")})
            if already:
                print("  spreadsheet: already has this video, not changed")
            elif a.apply:
                if not a.xlsx_path:
                    bak = target.with_name(target.stem + ".backup-%s.xlsx" % datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
                    shutil.copy2(target, bak)
                    print("  backup:", bak)
                print("  spreadsheet:", xlsx_append(target, rec))
            else:
                print("  spreadsheet: would append a row to", target)
        if a.apply:
            ADDED.write_text(json.dumps(added, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    # the merged list
    xrows = None
    if not a.no_xlsx and Path(a.xlsx_in).exists():
        try:
            xrows = read_xlsx(a.xlsx_in)
            print("  spreadsheet: %d video rows" % len(xrows))
        except SystemExit as e:
            print(" ", e)
    if xrows is None:   # no spreadsheet here: keep its fields from the current data.json
        print("  spreadsheet not read: its fields come from the current data.json")
        xrows = [dict(y=v["y"], n=v.get("n", 0), code="", d=v.get("d", ""), u=v.get("u", 0), t=v.get("t", ""), x=v.get("x", ""), s_old=v.get("s", []), **(v.get("L") or {}))
                 for v in old.get("videos", []) if v.get("y")]
        keep_noyt = [v for v in old.get("videos", []) if not v.get("y")]     # videos YouTube removed: no id to merge on, kept as they are
    if not a.no_fetch and (a.refresh or not LISTS.exists()):
        lists = fetch_lists()
        if a.apply and all(lists.values()):
            SRCD.mkdir(parents=True, exist_ok=True)
            LISTS.write_text(json.dumps(lists, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        elif not all(lists.values()):
            print("  (a channel tab came back empty: yt-lists.json kept as it was)")
    if not a.no_fetch:
        ids = {r["y"] for r in xrows} | {v["id"] for rows in load_json(LISTS, {}).values() for v in rows} | {v["id"] for v in load_json(SITE / "math/youtube-videos.json", [])} \
            | {v["id"] for v in load_json(SITE / "livestreams/playlist.json", [])} | set(load_json(SITE / "math/youtube-hive-links.json", {}))
        need = ids if a.refresh else {i for i in ids if not get_cache(cache, i)}
        fetch_meta(cache, need)
    videos, dropped = build(xrows, cache, added, old)
    if xrows and "s_old" in xrows[0]:
        videos = sorted(videos + keep_noyt, key=lambda r: (r.get("d") or "0000", r.get("n", 0)), reverse=True)
    print("  left out:", ", ".join("%d %s" % (v, k) for k, v in dropped.items() if v) or "none")
    data = payload(videos, old.get("generated"), old.get("videos"))
    write_out(data, a.apply)
    save_cache(cache, a.apply)
    if not a.apply:
        print("  dry run: nothing written (add --apply)")


if __name__ == "__main__":
    main()
