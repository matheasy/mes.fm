#!/usr/bin/env python3
"""Build mes.fm/911spooks-database (the 9/11 Spooks Database) from the MES Google Sheet.

The Google Sheet is the one place the list is edited (tab "Spooks": columns "Disinfo Agent", "Notes", "Links"; optional
extra columns "Image" (a picture link), "Group" (one of the GROUPS keys or labels below) and "Aka" (other names / a regex used
to find MES posts about the person) are picked up by name if you add them). This script:

  1. --fetch   downloads the Spooks tab as CSV into mes.fm/911spooks/spooks-sheet.csv (a committed snapshot, so a build without
               --fetch gives the same page). Without --fetch the snapshot is used.
  2. merges mes.fm/911spooks/spooks-extra.json (per person: group, aka, picture file in mes.fm/911spooks-database/img/ +
               its credit). A Sheet "Image" link wins over it and is downloaded + cropped to 240x240 (needs Pillow; without
               it the link is used as is).
  3. finds the MES posts / videos about each person in the 911spooks, 911, conspiracy, bg and mh370 hub lists (full name or
               the "aka" regex in the title) and maps Hive / PeakD links to their mes.fm mirror where one exists.
  4. writes   mes.fm/911spooks-database/index.html (shell = the built mes.fm/911spooks-posts page, so header, nav, sidebar,
               comments and footer match), spooks.json, spooks.csv, and mes.fm/911spooks/spooks-hive.md = the body of the
               Hive "9/11 Spooks Database" post (@mestruth; no per-person pictures there, they live on mes.fm) (paste it into PeakD's editor when updating the post).

Usage:  python3 build_spooks_database.py --fetch            (dry run: prints what changed)
        python3 build_spooks_database.py --fetch --apply
  5. syncs the "Spooks" tab of the OneDrive Excel copy (EXCEL_PATH) to the Sheet (skip with --no-excel; skipped while the
               file is open in Excel). Only that sheet's XML is rewritten, so the workbook's other tabs, pivot table and chart stay.
Then, after a run that added people: build_sitemap.py / build_search_index.py are not needed (the page is already listed);
update the Hive post with the new spooks-hive.md. Set HIVE_POST below once the Hive post exists.
"""
import csv, html, io, json, re, subprocess, sys, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
FETCH = "--fetch" in sys.argv
SHEET_ID = "1-pBVHR4KCT2nVngaWkUhjpHOw0KoJIqehDT3ah5yCSk"
SHEET_GID = "686862064"  # the "Spooks" tab
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={SHEET_GID}"
EXCEL_URL = "https://1drv.ms/x/s!As32ynv0LoaIi6UOFw7QTWr1sVrCtA"
# Banner of the Hive post, uploaded through PeakD's image button (files.peakd.com) so it shows on Hive without mes.fm.
HIVE_BANNER = "https://files.peakd.com/file/peakd-hive/mestruth/23tGc14jFf9N7X9Tf5YhRjzfx4bxcxNeaNuftBT9pMRnsE5z7a8zw48xUyuoWG82LgDdr.jpg"
HIVE_POST = "https://peakd.com/hive-113182/@mestruth/911-spooks-database-ayc"
STREAM_PAGE = "/livestream-112-911-spooks"
SLUG = "911spooks-database"
OUT = ROOT / SLUG
SNAP = ROOT / "911spooks" / "spooks-sheet.csv"
EXTRA = ROOT / "911spooks" / "spooks-extra.json"
HIVE_MD = ROOT / "911spooks" / "spooks-hive.md"
TITLE = "9/11 Spooks Database"

GROUPS = [
    ("ae911", "AE911Truth & thermite"),
    ("truth", "9/11 Truth circles"),
    ("media", "Podcasts & alt media"),
    ("science", "UFOs, MH370 & fringe science"),
    ("flat", "Flat Earth & Moon"),
    ("debunk", "Mainstream debunkers"),
    ("online", "Online spammers"),
]
GLABEL = dict(GROUPS)
HUBS = ["911spooks", "911", "conspiracy", "bg", "mh370"]


def esc(s):
    return html.escape(s or "", quote=True)


def slugify(n):
    return re.sub(r"[^a-z0-9]+", "-", n.lower().replace("'", "")).strip("-")


# --------------------------------------------------------------------------- sheet
def read_sheet():
    if FETCH:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"
        data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mes.fm"}), timeout=30).read().decode("utf8")
        if data != (SNAP.read_text() if SNAP.exists() else ""):
            print(f"{'updated' if APPLY else 'would update'} {SNAP.relative_to(ROOT.parent)}")
            if APPLY:
                SNAP.write_text(data)
        text = data
    else:
        text = SNAP.read_text()
    rows = list(csv.reader(io.StringIO(text)))
    hi = next(i for i, r in enumerate(rows) if any(c.strip().lower() in ("disinfo agent", "name") for c in r))
    head = [c.strip().lower() for c in rows[hi]]
    col = lambda *names: next((head.index(n) for n in names if n in head), None)
    cn, cnote, clink = col("disinfo agent", "name"), col("notes", "note"), col("links", "link")
    cimg, cgrp, caka = col("image", "picture", "photo"), col("group", "type"), col("aka")
    people = []
    for r in rows[hi + 1:]:
        r = r + [""] * (len(head) - len(r))
        name = r[cn].strip()
        if not name or name.isdigit() or name.startswith("="):
            continue
        g = lambda c: r[c].strip() if c is not None else ""
        people.append({"name": name, "note": g(cnote), "links": re.findall(r"https?://\S+", g(clink)),
                       "image": g(cimg), "group": g(cgrp), "aka": g(caka)})
    return people


# --------------------------------------------------------------------------- MES posts about each person
def hub_items():
    js = ("const hubs=" + json.dumps(HUBS) + ";(async()=>{const out=[];for(const h of hubs){try{const m=await import('./'+h+'/sections.mjs');"
          "for(const s of m.SECTIONS)for(const i of s.items){if(i.standalone)continue;const href=i.href||(i.links&&((i.links.find(l=>/mes\\.fm/.test(l[1]))||i.links[0])[1]));"
          "out.push({hub:h,title:i.title,href,who:i.who||'',links:(i.links||[]).map(l=>l[1])})}}catch(e){}}console.log(JSON.stringify(out))})()")
    res = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    seen, items = set(), []
    for it in json.loads(res.stdout):
        if it["href"] and it["href"] not in seen:
            seen.add(it["href"])
            items.append(it)
    return items


def hive_key(u):
    m = re.search(r"(?:peakd\.com|hive\.blog|ecency\.com|inleo\.io)/(?:[^/@]+/)?@([\w.-]+)/([\w-]+)", u)
    return (m.group(1) + "/" + m.group(2)).lower() if m else None


def mirror_map():
    """Hive author/permlink -> mes.fm page, from every hub's committed link-meta.json."""
    out = {}
    for f in ROOT.glob("*/link-meta.json"):
        try:
            meta = json.loads(f.read_text())
        except Exception:
            continue
        for page, v in meta.items():
            if not isinstance(v, dict) or "mes.fm/" not in page:
                continue
            for l in (v.get("namedLinks") or []) + (v.get("watchLinks") or []):
                k = hive_key(l.get("href", "")) if isinstance(l, dict) else None
                if k:
                    out.setdefault(k, page.replace("https://mes.fm", ""))
    # mirror pages name their own Hive post: "Originally published on Hive", "Mirrored from the Hive blockchain", "Posted Using INLEO"
    own = re.compile(r'<a [^>]*href="([^"]+)"[^>]*>\s*(?:Originally published on Hive|Hive blockchain|INLEO)', re.I)
    for f in ROOT.glob("*/index.html"):
        if f.parent.name in (SLUG, "_http_", "_https_"):
            continue
        try:
            text = f.read_text(errors="ignore")
        except Exception:
            continue
        for u in own.findall(text):
            k = hive_key(u)
            if k:
                out.setdefault(k, "/" + f.parent.name)
    return out


SITES = [
    (r"(^/|mes\.fm)", "mes", "MES.fm"), (r"t\.me/", "telegram", "Telegram"), (r"(peakd|hive\.blog|ecency|inleo)", "hive", "Hive"),
    (r"(youtube\.com|youtu\.be)", "youtube", "YouTube"), (r"(x\.com|twitter\.com)", "x", "X"), (r"substack\.com", "", "Substack"),
    (r"wikipedia\.org", "", "Wikipedia"), (r"3speak", "3speak", "3Speak"), (r"rumble", "rumble", "Rumble"), (r"odysee", "odysee", "Odysee"),
]


def site_of(u):
    for pat, s, label in SITES:
        if re.search(pat, u):
            return s, label
    return "", re.sub(r"^https?://(www\.)?", "", u).split("/")[0]


def link_label(u):
    s, label = site_of(u)
    if s == "telegram" and "meslinkschat" in u:
        label = "Telegram chat"
    return s, label


# --------------------------------------------------------------------------- pictures
def picture(p, extra):
    if p["image"]:
        fn = OUT / "img" / (slugify(p["name"]) + ".jpg")
        if not fn.exists():
            try:
                from PIL import Image
                data = urllib.request.urlopen(urllib.request.Request(p["image"], headers={"User-Agent": "Mozilla/5.0 mes.fm"}), timeout=30).read()
                im = Image.open(io.BytesIO(data)).convert("RGB")
                w, h = im.size
                m = min(w, h)
                top = int(h * 0.04) if h - m > h * 0.04 else (h - m) // 2
                print(f"{'saved' if APPLY else 'would save'} picture for {p['name']}")
                if APPLY:
                    fn.parent.mkdir(parents=True, exist_ok=True)
                    im.crop(((w - m) // 2, top, (w - m) // 2 + m, top + m)).resize((240, 240), Image.LANCZOS).save(fn, quality=84, optimize=True)
            except ImportError:
                return p["image"], "Picture from the MES Google Sheet", p["image"]
            except Exception as e:
                print(f"  could not load the picture of {p['name']}: {e}")
                return None, None, None
        return f"/{SLUG}/img/{fn.name}", "Picture from the MES Google Sheet", p["image"]
    if extra.get("img"):
        return f"/{SLUG}/img/{extra['img']}", extra.get("credit", ""), extra.get("credit_url", "")
    return None, None, None


def group_of(p, extra):
    g = p["group"].strip().lower()
    for k, label in GROUPS:
        if g in (k, label.lower()):
            return k
    return extra.get("group") or "truth"


# --------------------------------------------------------------------------- build
def main():
    people = read_sheet()
    extras = json.loads(EXTRA.read_text()) if EXTRA.exists() else {}
    items = hub_items()
    mirrors = mirror_map()
    missing = [p["name"] for p in people if p["name"] not in extras]
    if missing:
        print("not in spooks-extra.json (group defaults to 9/11 Truth circles, no picture):", ", ".join(missing))

    recs = []
    for order, p in enumerate(people):
        ex = extras.get(p["name"], {})
        aka = p["aka"] or ex.get("aka") or ""
        pat = re.compile(r"\b" + re.escape(p["name"].rstrip("?")) + r"\b" + ("|" + aka if aka else ""), re.I)
        posts = [i for i in items if pat.search(i["title"] + " " + i["who"].replace(" ", " "))]
        links = []
        for u in p["links"]:
            k = hive_key(u)
            if k and k in mirrors and not any(l == "https://mes.fm" + mirrors[k] for l in links):
                links.append("https://mes.fm" + mirrors[k])
            links.append(u)
        img, credit, credit_url = picture(p, ex)
        recs.append({
            "id": slugify(p["name"]), "name": p["name"], "group": group_of(p, ex), "note": p["note"], "links": links,
            "img": img, "credit": credit, "credit_url": credit_url,
            "posts": [{"title": i["title"], "href": i["href"]} for i in posts], "order": order,
        })

    today = date.today().isoformat()
    write(OUT / "spooks.json", json.dumps({"title": TITLE, "updated": today, "source": SHEET_URL, "count": len(recs),
          "groups": dict(GROUPS), "people": [{k: r[k] for k in ("name", "group", "note", "links", "img", "posts")} for r in recs]},
          ensure_ascii=False, indent=1) + "\n", ignore=r'"updated": "[^"]*"')
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Name", "Group", "Notes", "Links", "Picture", "MES posts"])
    for r in recs:
        w.writerow([r["name"], GLABEL[r["group"]], r["note"], " ".join(r["links"]),
                    ("https://mes.fm" + r["img"]) if r["img"] and r["img"].startswith("/") else (r["img"] or ""),
                    " ".join(("https://mes.fm" + x["href"]) if x["href"].startswith("/") else x["href"] for x in r["posts"])])
    write(OUT / "spooks.csv", buf.getvalue())
    write(HIVE_MD, hive_md(recs, today), ignore=r"Last updated: [^\n]*")
    write(OUT / "index.html", page(recs, today), ignore=r'data-updated="[^"]*"[^<]*')
    n_img = sum(1 for r in recs if r["img"])
    print(f"{len(recs)} people, {n_img} with a picture, {sum(1 for r in recs if r['posts'])} with MES posts")
    return people


def write(path, text, ignore=None):
    old = path.read_text() if path.exists() else ""
    norm = (lambda s: re.sub(ignore, "", s)) if ignore else (lambda s: s)
    if norm(old) == norm(text):
        print(f"unchanged {path.relative_to(ROOT.parent)}")
        return
    print(f"{'wrote' if APPLY else 'would write'} {path.relative_to(ROOT.parent)}")
    if APPLY:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)


def abs_url(u):
    return "https://mes.fm" + u if u.startswith("/") else u


def linkify(text):
    out, last = [], 0
    for m in re.finditer(r"https?://\S+", text):
        out.append(esc(text[last:m.start()]))
        u = m.group(0).rstrip(".,)")
        out.append(f'<a href="{esc(u)}" target="_blank" rel="noopener">{esc(link_label(u)[1])}</a>')
        last = m.start() + len(u)
    out.append(esc(text[last:]))
    return "".join(out)


def initials(name):
    w = [x for x in re.split(r"[\s-]+", name.strip("?")) if x]
    return ((w[0][0] + (w[-1][0] if len(w) > 1 else (w[0][1] if len(w[0]) > 1 else ""))).upper()) if w else "?"


def card(r):
    hue = sum(map(ord, r["name"])) * 37 % 360
    if r["img"]:
        pic = (f'<img class="sp-img" src="{esc(r["img"])}" alt="{esc(r["name"])}" width="120" height="120" loading="lazy" decoding="async"'
               f' title="{esc("Picture: " + (r["credit"] or ""))}">')
    else:
        pic = f'<span class="sp-ini" style="--h:{hue}" aria-hidden="true">{esc(initials(r["name"]))}</span>'
    links = []
    for u in r["links"]:
        s, label = link_label(u)
        ic = f'<span class="lp-ic" data-s="{s}" aria-hidden="true"></span>' if s else ""
        ext = "" if u.startswith("https://mes.fm") else ' target="_blank" rel="noopener"'
        links.append(f'<a class="sp-l" href="{esc(u)}"{ext}>{ic}{esc(label)}</a>')
    posts = ""
    if r["posts"]:
        lis = "".join(f'<li><a href="{esc(p["href"])}">{esc(p["title"])}</a></li>' for p in r["posts"])
        n = len(r["posts"])
        posts = f'<details class="sp-posts"><summary>MES posts &amp; videos ({n})</summary><ul>{lis}</ul></details>'
    search = " ".join([r["name"], GLABEL[r["group"]], r["note"]] + [p["title"] for p in r["posts"]]).lower()
    return (f'<article class="sp-card" id="{r["id"]}" data-g="{r["group"]}" data-o="{r["order"]}" data-n="{esc(r["name"].lower())}"'
            f' data-p="{len(r["posts"])}" data-i="{1 if r["img"] else 0}" data-k="{esc(search)}">\n'
            f'  <a class="sp-pic" href="#{r["id"]}" aria-label="Link to {esc(r["name"])}">{pic}</a>\n'
            f'  <div class="sp-body">\n'
            f'    <h2 class="sp-name"><a href="#{r["id"]}">{esc(r["name"])}</a></h2>\n'
            f'    <span class="sp-grp" data-g="{r["group"]}">{esc(GLABEL[r["group"]])}</span>\n'
            + (f'    <p class="sp-note">{linkify(r["note"])}</p>\n' if r["note"] else "")
            + (f'    <div class="sp-links">{"".join(links)}</div>\n' if links else "")
            + (f"    {posts}\n" if posts else "")
            + "  </div>\n</article>")


CSS = r"""
<style id="sp-css">
/* 9/11 Spooks Database (build_spooks_database.py) */
.sp-meta { display:flex; flex-wrap:wrap; gap:.4em 1.2em; align-items:center; margin:0 0 1em; font-size:.95em; color:#555; }
.sp-meta b { color:#222; }
#main-content .sp-db { color:#333; }
body.dark-mode #main-content .sp-db { color:#ddd; }
/* the page reset paints p / b / li / span #333: let them take the container colour (pills, initials and link chips keep theirs) */
#main-content .sp-db :is(p, b, li, ul, summary, span, div, h2, label, article, details):not(.sp-grp):not(.sp-ini):not(.lp-ic):not(.sp-l):not(.sp-none) { color:inherit; }
.sp-meta a { color:#1d5f91; }
.sp-bar { display:flex; flex-wrap:wrap; gap:.6em; align-items:center; margin:.2em 0 1em; }
.sp-bar label { font-size:.92em; color:#444; }
.sp-bar select { font:inherit; font-size:.92em; padding:.3em .5em; border:1px solid #ccc; border-radius:6px; background:#fff; color:#222; }
.sp-seg { display:inline-flex; border:1px solid #ccc; border-radius:7px; overflow:hidden; }
.sp-seg button { font:inherit; font-size:.9em; border:0; background:#fff; color:#333; padding:.35em .8em; cursor:pointer; }
.sp-seg button + button { border-left:1px solid #ccc; }
.sp-seg button[aria-pressed="true"] { background:#277bb6; color:#fff; }
.sp-count { margin-left:auto; font-size:.9em; color:#666; }
.sp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(19em, 1fr)); gap:1em; }
.sp-card { display:flex; gap:.9em; align-items:flex-start; background:#fff; border:1px solid #e1e4e8; border-radius:12px; padding:.9em; box-shadow:0 1px 2px rgba(0,0,0,.05); scroll-margin-top:80px; }
.sp-card:target, .sp-card.sp-hl { border-color:#277bb6; box-shadow:0 0 0 3px rgba(39,123,182,.25); }
.sp-pic { flex:0 0 auto; display:block; width:5.4em; height:5.4em; border-radius:50%; overflow:hidden; background:#eef1f4; }
.sp-img { width:100%; height:100%; object-fit:cover; display:block; }
.sp-ini { display:flex; width:100%; height:100%; align-items:center; justify-content:center; font-size:1.7em; font-weight:600; letter-spacing:.02em;
  color:#fff; background:hsl(var(--h) 45% 34%); }
.sp-body { min-width:0; flex:1; }
.sp-name { font-size:1.12em; font-weight:600; line-height:1.25; margin:.05em 0 .25em; }
.sp-name a { color:#1a1a1a; text-decoration:none; }
.sp-name a:hover { text-decoration:underline; }
.sp-grp { display:inline-block; font-size:.76em; padding:.12em .55em; border-radius:999px; background:#eef3f8; color:#2b5d86; border:1px solid #d5e2ee; }
.sp-grp[data-g="ae911"] { background:#fdf0e6; color:#9a4a09; border-color:#f3d6bd; }
.sp-grp[data-g="media"] { background:#f2edfb; color:#5b3a99; border-color:#e0d6f3; }
.sp-grp[data-g="science"] { background:#e9f6f1; color:#1f6b51; border-color:#cbe8dc; }
.sp-grp[data-g="flat"] { background:#f6f2e3; color:#76611a; border-color:#e9dfba; }
.sp-grp[data-g="debunk"] { background:#f1f1f1; color:#4a4a4a; border-color:#ddd; }
.sp-grp[data-g="online"] { background:#fbecee; color:#9b2335; border-color:#f1cfd5; }
.sp-note { margin:.45em 0 0; line-height:1.4; color:#333; font-size:.95em; overflow-wrap:anywhere; }
.sp-links { display:flex; flex-wrap:wrap; gap:.35em; margin-top:.55em; }
.sp-l { display:inline-flex; align-items:center; gap:.3em; font-size:.82em; padding:.22em .6em; border:1px solid #d6dbe1; border-radius:999px; color:#1d5f91; text-decoration:none; background:#fafbfc; }
.sp-l:hover { border-color:#277bb6; background:#eef5fb; }
.sp-l .lp-ic { width:1.05em; height:1.05em; }
.sp-posts { margin-top:.55em; font-size:.88em; }
.sp-posts summary { cursor:pointer; color:#1d5f91; }
.sp-posts ul { margin:.35em 0 0 1.1em; padding:0; list-style:disc; }
.sp-posts li { margin:.2em 0; line-height:1.3; }
.sp-posts a { color:#1d5f91; }
/* Compact list view */
.sp-grid.sp-compact { grid-template-columns:1fr; gap:0; border:1px solid #e1e4e8; border-radius:10px; overflow:hidden; }
.sp-compact .sp-card { border:0; border-radius:0; box-shadow:none; padding:.55em .8em; align-items:center; }
.sp-compact .sp-card + .sp-card { border-top:1px solid #eceef1; }
.sp-compact .sp-pic { width:2.6em; height:2.6em; }
.sp-compact .sp-ini { font-size:.95em; }
.sp-compact .sp-body { display:grid; grid-template-columns:minmax(9em, 14em) minmax(8em, 13em) 1fr; gap:.2em 1em; align-items:center; }
.sp-compact .sp-name { margin:0; font-size:1em; }
.sp-compact .sp-note { margin:0; grid-column:3; grid-row:1; }
.sp-compact .sp-links, .sp-compact .sp-posts { grid-column:1 / -1; margin-top:.15em; }
.sp-compact .sp-grp { justify-self:start; }
@media (max-width: 700px) {
  .sp-grid { grid-template-columns:1fr; }
  .sp-compact .sp-body { grid-template-columns:1fr; }
  .sp-compact .sp-note { grid-column:auto; grid-row:auto; }
  .sp-count { margin-left:0; width:100%; }
}
/* Table view: built from the cards by the page script; no pictures */
.sp-twrap { overflow-x:auto; border:1px solid #e1e4e8; border-radius:10px; -webkit-overflow-scrolling:touch; }
.sp-twrap[hidden], .sp-grid[hidden] { display:none !important; }
.sp-table { border-collapse:collapse; width:100%; font-size:.92em; min-width:44em; }
.sp-table th, .sp-table td { text-align:left; vertical-align:top; padding:.45em .65em; border-bottom:1px solid #eceef1; }
.sp-table thead th { position:sticky; top:0; background:#f6f8fa; z-index:1; white-space:nowrap; padding:0; }
.sp-table th button { font:inherit; font-weight:600; border:0; background:none; color:#222; padding:.5em .65em; cursor:pointer; width:100%; text-align:left; }
.sp-table th button::after { content:"\2195"; opacity:.35; margin-left:.35em; font-weight:400; }
.sp-table th[aria-sort="ascending"] button::after { content:"\25B2"; opacity:.8; font-size:.75em; }
.sp-table th[aria-sort="descending"] button::after { content:"\25BC"; opacity:.8; font-size:.75em; }
.sp-table tbody tr:hover td { background:#f7fafd; }
.sp-table tr.sp-hl td { background:#e7f2fb; }
.sp-table tr[hidden] { display:none; }
.sp-table td.sp-tn { font-weight:600; white-space:nowrap; position:sticky; left:0; background:#fff; z-index:0; }
.sp-table td.sp-tn a { color:#1a1a1a; text-decoration:none; }
.sp-table td.sp-tn a:hover { text-decoration:underline; }
.sp-table td.sp-tnote { min-width:16em; line-height:1.4; overflow-wrap:anywhere; }
.sp-table td.sp-tl { min-width:9em; }
.sp-table td.sp-tl .sp-l { margin:0 .25em .25em 0; font-size:.8em; padding:.15em .5em; }
.sp-table td.sp-tp { white-space:nowrap; color:#1d5f91; }
.sp-table td.sp-tp .sp-posts { margin:0; font-size:1em; white-space:normal; min-width:12em; }
.sp-table td.sp-tp .sp-posts summary { white-space:nowrap; }
.sp-table .sp-grp { white-space:nowrap; }
.sp-table .sp-none { color:#999; }
body.dark-mode .sp-twrap { border-color:#3a3a3a; }
body.dark-mode .sp-table th, body.dark-mode .sp-table td { border-bottom-color:#333; }
body.dark-mode .sp-table thead th { background:#2a2a2a; }
body.dark-mode .sp-table th button { color:#eee; }
body.dark-mode .sp-table td.sp-tn { background:#1e1e1e; }
body.dark-mode .sp-table td.sp-tn a { color:#f1f1f1; }
body.dark-mode .sp-table tbody tr:hover td { background:#262c32; }
body.dark-mode .sp-table tr.sp-hl td { background:#22323f; }
body.dark-mode #main-content .sp-table td { color:#d6d6d6; }
body.dark-mode #main-content .sp-table td.sp-tp, body.dark-mode #main-content .sp-table td.sp-tnote a, body.dark-mode #main-content .sp-table .sp-posts a { color:#7cc0f5; }
body.dark-mode #main-content .sp-table .sp-none { color:#8a8a8a; }
.sp-card[hidden] { display:none !important; }
.sp-credits { margin-top:1.5em; font-size:.85em; color:#555; }
.sp-credits summary { cursor:pointer; }
.sp-credits ul { columns:2 20em; margin:.5em 0 0 1.1em; }
.sp-credits li { break-inside:avoid; margin:.15em 0; }
/* collage of the database's pictures (the hub tile) at the bottom of the page */
.sp-fig { margin:2em auto .5em; max-width:900px; text-align:center; }
.sp-fig img { display:block; width:100%; height:auto; border-radius:14px; box-shadow:0 6px 24px rgba(0,0,0,.18); border:1px solid #e1e4e8; }
#main-content .sp-fig figcaption { margin-top:.6em; font-size:.92em; color:#555; font-style:italic; }
body.dark-mode .sp-fig img { border-color:#3a3a3a; box-shadow:0 6px 24px rgba(0,0,0,.6); }
body.dark-mode #main-content .sp-fig figcaption { color:#bbb; }
body.dark-mode .sp-meta, body.dark-mode .sp-bar label, body.dark-mode .sp-count, body.dark-mode .sp-credits { color:#bbb; }
body.dark-mode .sp-meta b { color:#eee; }
body.dark-mode .sp-meta a, body.dark-mode .sp-posts summary, body.dark-mode .sp-posts a, body.dark-mode .sp-credits a { color:#7cc0f5; }
body.dark-mode .sp-bar select, body.dark-mode .sp-seg button { background:#2a2a2a; color:#ddd; border-color:#555; }
body.dark-mode .sp-seg { border-color:#555; }
body.dark-mode .sp-seg button + button { border-left-color:#555; }
body.dark-mode .sp-seg button[aria-pressed="true"] { background:#6cb6f5; color:#111; }
body.dark-mode .sp-card { background:#232323; border-color:#3a3a3a; box-shadow:none; }
body.dark-mode .sp-card:target, body.dark-mode .sp-card.sp-hl { border-color:#6cb6f5; box-shadow:0 0 0 3px rgba(108,182,245,.3); }
body.dark-mode .sp-grid.sp-compact { border-color:#3a3a3a; }
body.dark-mode .sp-compact .sp-card + .sp-card { border-top-color:#333; }
body.dark-mode .sp-name a { color:#f1f1f1; }
body.dark-mode .sp-note { color:#d6d6d6; }
body.dark-mode #main-content .sp-note a, body.dark-mode #main-content .sp-meta a { color:#7cc0f5; }
body.dark-mode .sp-pic { background:#333; }
body.dark-mode .sp-l { background:#2a2a2a; border-color:#4a4a4a; color:#8fcaf7; }
body.dark-mode .sp-l:hover { border-color:#6cb6f5; background:#26323d; }
body.dark-mode .sp-grp { background:#22323f; color:#9fcdf2; border-color:#34495a; }
body.dark-mode .sp-grp[data-g="ae911"] { background:#3a2a1c; color:#f2bd8d; border-color:#5a3f28; }
body.dark-mode .sp-grp[data-g="media"] { background:#2f2742; color:#c9b5f2; border-color:#463a63; }
body.dark-mode .sp-grp[data-g="science"] { background:#1d3a30; color:#94dcbf; border-color:#2d5546; }
body.dark-mode .sp-grp[data-g="flat"] { background:#3a341d; color:#e2cf86; border-color:#585030; }
body.dark-mode .sp-grp[data-g="debunk"] { background:#303030; color:#cfcfcf; border-color:#474747; }
body.dark-mode .sp-grp[data-g="online"] { background:#3c2228; color:#f2a6b3; border-color:#5d333c; }
</style>
"""

JS = r"""
<script>
/* 9/11 Spooks Database: search, group chips, sort, Cards / Compact / Table (build_spooks_database.py) */
(function () {
  var grid = document.getElementById('spGrid'); if (!grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.sp-card'));
  var q = document.getElementById('spSearch'), chips = document.getElementById('spChips');
  var sortSel = document.getElementById('spSort'), count = document.getElementById('spCount'), empty = document.getElementById('spEmpty');
  var KEY = 'mes-spooksdb:v1', st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var g = 'all';
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function apply() {
    var words = norm(q.value).split(/\s+/).filter(Boolean), shown = 0;
    cards.forEach(function (c) {
      var k = norm(c.getAttribute('data-k'));
      var ok = (g === 'all' || (g === 'pics' ? c.getAttribute('data-i') === '1' : g === 'posts' ? c.getAttribute('data-p') !== '0' : c.getAttribute('data-g') === g))
        && words.every(function (w) { return k.indexOf(w) !== -1; });
      c.hidden = !ok; if (ok) shown++;
      if (c._row) c._row.hidden = !ok;
    });
    count.textContent = shown === cards.length ? cards.length + ' people' : shown + ' of ' + cards.length + ' people';
    empty.hidden = shown !== 0;
  }
  function sort() {
    var m = sortSel.value, by = {
      az: function (a, b) { return a.getAttribute('data-n').localeCompare(b.getAttribute('data-n')); },
      za: function (a, b) { return b.getAttribute('data-n').localeCompare(a.getAttribute('data-n')); },
      posts: function (a, b) { return (+b.getAttribute('data-p')) - (+a.getAttribute('data-p')) || a.getAttribute('data-n').localeCompare(b.getAttribute('data-n')); },
      sheet: function (a, b) { return (+a.getAttribute('data-o')) - (+b.getAttribute('data-o')); }
    }[m] || null;
    if (by) cards.slice().sort(by).forEach(function (c) { grid.appendChild(c); });
    tsort = null; tOrder();
  }
  /* Table view: one row per card, no pictures; click a heading to sort */
  var twrap = document.getElementById('spTable'), tbody = null, tsort = null;
  var COLS = [['n', 'Name'], ['g', 'Group'], ['note', 'Notes'], ['l', 'Links'], ['p', 'MES posts']];
  function txt(el) { return el ? (el.textContent || '').trim() : ''; }
  function buildTable() {
    if (tbody) return;
    var t = document.createElement('table'); t.className = 'sp-table';
    var hr = '<thead><tr>' + COLS.map(function (c) { return '<th scope="col" data-k="' + c[0] + '"><button type="button">' + c[1] + '</button></th>'; }).join('') + '</tr></thead>';
    t.innerHTML = hr + '<tbody></tbody>'; tbody = t.querySelector('tbody');
    cards.forEach(function (c) {
      var tr = document.createElement('tr'); tr.setAttribute('data-id', c.id);
      var note = c.querySelector('.sp-note'), links = c.querySelectorAll('.sp-l'), posts = c.querySelector('.sp-posts'), grp = c.querySelector('.sp-grp');
      tr._s = { n: c.getAttribute('data-n'), g: txt(grp).toLowerCase(), note: txt(note).toLowerCase(), l: links.length, p: +c.getAttribute('data-p') };
      var td = function (cls, html) { var d = document.createElement('td'); d.className = cls; if (typeof html === 'string') d.innerHTML = html; else if (html) d.appendChild(html); tr.appendChild(d); return d; };
      var a = document.createElement('a'); a.href = '#' + c.id; a.textContent = txt(c.querySelector('.sp-name'));
      td('sp-tn', a);
      td('sp-tg', grp ? grp.cloneNode(true) : '');
      td('sp-tnote', note ? note.innerHTML : '<span class="sp-none">&mdash;</span>');
      var lc = td('sp-tl', '');
      if (links.length) Array.prototype.forEach.call(links, function (l) { lc.appendChild(l.cloneNode(true)); }); else lc.innerHTML = '<span class="sp-none">&mdash;</span>';
      td('sp-tp', posts ? posts.cloneNode(true) : '<span class="sp-none">0</span>');
      tr.hidden = c.hidden; c._row = tr; tbody.appendChild(tr);
    });
    t.querySelector('thead').addEventListener('click', function (e) {
      var th = e.target.closest('th'); if (!th) return;
      var k = th.getAttribute('data-k');
      var first = (k === 'l' || k === 'p') ? -1 : 1;
      tsort = (tsort && tsort.k === k) ? { k: k, d: -tsort.d } : { k: k, d: first };
      st.tsort = tsort; save(); tOrder();
    });
    twrap.appendChild(t);
  }
  function tOrder() {
    if (!tbody) return;
    var rows = cards.map(function (c) { return c._row; });
    if (tsort) {
      var k = tsort.k, d = tsort.d;
      rows.sort(function (a, b) {
        var x = a._s[k], y = b._s[k];
        var r = typeof x === 'number' ? x - y : (x === '' ? 1 : 0) - (y === '' ? 1 : 0) || x.localeCompare(y);
        if (typeof x !== 'number' && (x === '' || y === '')) return r;
        return (r * d) || a._s.n.localeCompare(b._s.n);
      });
    }
    rows.forEach(function (r) { tbody.appendChild(r); });
    Array.prototype.forEach.call(twrap.querySelectorAll('th'), function (th) {
      var on = tsort && th.getAttribute('data-k') === tsort.k;
      if (on) th.setAttribute('aria-sort', tsort.d > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    });
  }
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    g = b.getAttribute('data-c');
    Array.prototype.forEach.call(chips.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    apply();
  });
  q.addEventListener('input', apply);
  q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; apply(); } });
  sortSel.addEventListener('change', function () { st.sort = sortSel.value; sort(); st.tsort = null; save(); });
  var views = document.getElementById('spView');
  function setView(v) {
    grid.classList.toggle('sp-compact', v === 'compact');
    if (v === 'table') { buildTable(); tOrder(); }
    grid.hidden = v === 'table'; twrap.hidden = v !== 'table';
    Array.prototype.forEach.call(views.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-v') === v ? 'true' : 'false'); });
  }
  views.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.view = b.getAttribute('data-v'); save(); setView(st.view); });
  if (st.sort && sortSel.querySelector('option[value="' + st.sort + '"]')) sortSel.value = st.sort;
  if (st.tsort && st.tsort.k) tsort = st.tsort;
  var keepT = tsort;
  sort(); tsort = keepT;
  setView(st.view === 'compact' || st.view === 'table' ? st.view : 'cards');
  apply();
  function hash() {
    var id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
    var c = document.getElementById(id); if (!c || !c.classList.contains('sp-card')) return;
    if (c.hidden) { q.value = ''; g = 'all'; chips.querySelector('button[data-c="all"]').click(); }
    cards.forEach(function (x) { x.classList.remove('sp-hl'); if (x._row) x._row.classList.remove('sp-hl'); }); c.classList.add('sp-hl');
    var el = (!twrap.hidden && c._row) ? c._row : c; el.classList.add('sp-hl');
    setTimeout(function () { el.scrollIntoView({ block: 'center' }); }, 60);
  }
  window.addEventListener('hashchange', hash); hash();
})();
</script>
"""


def content(recs, today):
    n_img = sum(1 for r in recs if r["img"])
    n_posts = sum(1 for r in recs if r["posts"])
    cnt = lambda k: sum(1 for r in recs if r["group"] == k)
    chips = [f'<button type="button" data-c="all" aria-pressed="true">All ({len(recs)})</button>']
    chips += [f'<button type="button" data-c="{k}" aria-pressed="false">{esc(l)} ({cnt(k)})</button>' for k, l in GROUPS if cnt(k)]
    chips += [f'<button type="button" data-c="posts" aria-pressed="false">Has MES posts &amp; videos ({n_posts})</button>',
              f'<button type="button" data-c="pics" aria-pressed="false">Has a picture ({n_img})</button>']
    srcs = [f'<a href="{SHEET_URL}" target="_blank" rel="noopener">Google Sheet</a>',
            f'<a href="{EXCEL_URL}" target="_blank" rel="noopener">Excel (OneDrive)</a>']
    if HIVE_POST:
        srcs.append(f'<a href="{HIVE_POST}" target="_blank" rel="noopener">Hive</a>')
    credits = "".join(
        f'<li><b>{esc(r["name"])}</b>: <a href="{esc(r["credit_url"])}" target="_blank" rel="noopener">{esc(r["credit"])}</a></li>'
        for r in recs if r["img"] and r["credit"])
    d = date.fromisoformat(today)
    nice = f"{d.strftime('%B')} {d.day}, {d.year}"
    return f"""<div class="wide sp-db">
<div class="sp-meta"><span><b>{len(recs)}</b> people</span><span data-updated="{today}">Updated {nice}</span>
<span>Kept in: {' &middot; '.join(srcs)}</span><span>Download: <a href="/{SLUG}/spooks.csv" download>CSV</a> &middot; <a href="/{SLUG}/spooks.json">JSON</a></span>
<span>From <a href="{STREAM_PAGE}">MES Livestream 112</a></span></div>
<div class="ls-filter" id="spFilter">
  <input type="search" id="spSearch" placeholder="Search {len(recs)} names, notes and MES posts&hellip;" aria-label="Search the spooks" autocomplete="off">
  <div class="ls-chips" id="spChips">{''.join(chips)}</div>
</div>
<div class="sp-bar">
  <label>Sort <select id="spSort" aria-label="Sort"><option value="az">A to Z</option><option value="za">Z to A</option><option value="posts">Most MES posts</option><option value="sheet">Sheet order</option></select></label>
  <span class="sp-seg" id="spView" role="group" aria-label="View"><button type="button" data-v="cards" aria-pressed="true">Cards</button><button type="button" data-v="compact" aria-pressed="false">Compact</button><button type="button" data-v="table" aria-pressed="false">Table</button></span>
  <span class="sp-count" id="spCount" aria-live="polite">{len(recs)} people</span>
</div>
<p class="ls-empty" id="spEmpty" hidden>Nothing matches. Try fewer words or a different group.</p>
<div class="sp-grid" id="spGrid">
{chr(10).join(card(r) for r in recs)}
</div>
<div class="sp-twrap" id="spTable" hidden></div>
<p class="sp-meta" style="margin-top:1.2em">Search their names in the <a href="https://t.me/meslinks" target="_blank" rel="noopener">MES Links Telegram</a> for many more posts. Groups and pictures are added on mes.fm; names, notes and links come from the MES spreadsheet.</p>
<details class="sp-credits"><summary>Picture credits</summary><p>Wikimedia Commons photos are used under their stated licences; the others are the people's own public YouTube channel or Hive profile pictures. People without a picture show their initials.</p><ul>{credits}</ul></details>
<figure class="sp-fig"><img src="/img/{SLUG}-icon.jpg" width="900" height="600" loading="lazy" decoding="async" alt="A collage of the faces in the 9/11 Spooks Database">
<figcaption>The 9/11 Spooks Database: {len(recs)} people and counting.</figcaption></figure>
</div>"""


def page(recs, today):
    shell = (ROOT / "911spooks-posts" / "index.html").read_text()
    desc = (f"The MES 9/11 Spooks Database: {len(recs)} 9/11 disinfo agents, spooks and controlled opposition, with notes, "
            "pictures and links to the MES posts, Telegram notes and videos about each. Search it or filter by group.")
    title = TITLE
    url = f"https://mes.fm/{SLUG}"
    og = f"https://mes.fm/img/{SLUG}-share.jpg"
    s = shell
    s = s.replace('href="https://mes.fm/911spooks-posts"', f'href="{url}"')
    s = re.sub(r"<title>[^<]*</title>", f"<title>{esc(title)} | MES Truth</title>", s, 1)
    for prop in ("og:title", "twitter:title", "twitter:image:alt"):
        s = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*', lambda m: m.group(1) + esc(title), s)
    for prop in ("og:description", "twitter:description", "description"):
        s = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*', lambda m: m.group(1) + esc(desc), s)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + url, s)
    s = re.sub(r'(<meta (?:property|name)="(?:og:image|twitter:image)" content=")[^"]*', lambda m: m.group(1) + og, s)
    s = s.replace('<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">')
    s = re.sub(r'<h1 class="page-title">[^<]*</h1>', f'<h1 class="page-title">{esc(title)}</h1>', s, 1)
    s = re.sub(r'<p class="page-description">[^<]*</p>',
               '<p class="page-description">The MES list of 9/11 disinfo agents, spooks and controlled opposition, with notes, pictures and '
               'links to the MES posts about each. Search it, filter by group, or link straight to a person.</p>', s, 1)
    a = s.index('<div id="main-content">')
    b = s.index("<!-- FASTCOMMENTS-BLOCK")
    s = s[:a] + f'<div id="main-content">\n{content(recs, today)}\n' + "        </div>\n        " + s[b:]
    s = s.replace("  wireViewToggle('911spooks-posts', []);\n", "").replace("  wireFilter('911spooks-posts');\n", "")
    if "href='/911spooks-database'" not in s:  # older shells, before 911spooks/build.mjs carried the tab
      s = s.replace("<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/911spooks-videos'>Videos</a></li>",
                  "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/911spooks-videos'>Videos</a></li>\n"
                  "        <li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/911spooks-database'>Database</a></li>", 1)
    s = re.sub(r"info_bar_tab:\s*\d+", "info_bar_tab:3", s, 1)
    s = s.replace("</head>", CSS + "</head>", 1)
    s = s.replace("</body>", JS + "</body>", 1)
    ld = {"@context": "https://schema.org", "@type": "Dataset", "name": title, "description": desc, "url": url,
          "dateModified": today, "creator": {"@type": "Organization", "name": "Math Easy Solutions", "url": "https://mes.fm"},
          "distribution": [{"@type": "DataDownload", "encodingFormat": "text/csv", "contentUrl": f"{url}/spooks.csv"},
                           {"@type": "DataDownload", "encodingFormat": "application/json", "contentUrl": f"{url}/spooks.json"}]}
    s = s.replace("</head>", f'<script type="application/ld+json">{json.dumps(ld)}</script>\n</head>', 1)
    s = "<!-- Generated by build_spooks_database.py from the MES Google Sheet: never hand-edit. -->\n" + s
    return s


def md_cell(t):
    return (t or "").replace("|", "\\|").replace("\n", " ")


def hive_md(recs, today):
    """Hive post body: text only (pictures live on mes.fm), one small table per group so PeakD's column stays readable."""
    d = date.fromisoformat(today)
    nice = f"{d.strftime('%B')} {d.day}, {d.year}"
    floor = len(recs) // 10 * 10
    parts = []
    for k, label in GROUPS:
        rs = sorted((r for r in recs if r["group"] == k), key=lambda r: r["name"].lower())
        if not rs:
            continue
        lines = [f"## {label} ({len(rs)})", "", "| Name | Notes | Links |", "|---|---|---|"]
        for r in rs:
            links = [f"[{link_label(u)[1]}]({u})" for u in r["links"]]
            if r["posts"]:
                links.append(f"[MES posts ({len(r['posts'])})](https://mes.fm/{SLUG}#{r['id']})")
            lines.append(f"| **{md_cell(r['name'])}** | {md_cell(r['note'])} | {' · '.join(links)} |")
        parts.append("\n".join(lines))
    return f"""<center>

![9/11 Spooks Database]({HIVE_BANNER})

</center>

The MES list of 9/11 disinfo agents, spooks and controlled opposition: **{floor}+ and counting** ({len(recs)} as of {nice}), with notes and links. Search their names in the [MES Links Telegram](https://t.me/meslinks) for many more posts.

**Searchable version with filters, pictures and the MES posts about each person:** https://mes.fm/{SLUG}

Kept in: [Google Sheet]({SHEET_URL}) · [Excel (OneDrive)]({EXCEL_URL}) · [mes.fm](https://mes.fm/{SLUG}) · [Hive]({HIVE_POST}) · Download: [CSV](https://mes.fm/{SLUG}/spooks.csv) · [JSON](https://mes.fm/{SLUG}/spooks.json)

First shown on [MES Livestream 112: 9/11 Spooks Database](https://mes.fm/livestream-112-911-spooks). Last updated: {nice}.

{chr(10).join(chr(10) + p_ + chr(10) for p_ in parts)}
---

[MES 9/11 Spooks](https://mes.fm/911spooks) · [MES 9/11 Truth](https://mes.fm/911) · [MES Conspiracy](https://mes.fm/conspiracy)
"""


# --------------------------------------------------------------------------- the OneDrive Excel copy
EXCEL_PATH = Path.home() / "Library/CloudStorage/OneDrive-Personal/MathEasySolutions/YouTube/Video Files/MES Livestreams/55 911 Passengers/911 Passengers.xlsx"
EXCEL_SHEET = "Spooks"


def xesc(t):
    return html.escape(t, quote=False).replace('"', "&quot;")


def sync_excel(people):
    """Rewrite the Spooks table of the OneDrive workbook from the Sheet, editing only that sheet's XML (plus its hyperlink
    relationships, its table range and one calcChain entry) so the other tabs, the pivot table, chart and conditional
    formatting are left byte-for-byte alone (openpyxl would drop them). Data rows keep the first data row's cell styles."""
    import zipfile
    if not EXCEL_PATH.exists():
        print(f"Excel copy not found, skipped: {EXCEL_PATH}")
        return
    if (EXCEL_PATH.parent / ("~$" + EXCEL_PATH.name)).exists():
        print("Excel copy is open in Excel (lock file present): close it and re-run to sync it")
        return
    zin = zipfile.ZipFile(EXCEL_PATH)
    files = {i.filename: zin.read(i.filename) for i in zin.infolist()}
    infos = zin.infolist()
    zin.close()
    wb = files["xl/workbook.xml"].decode()
    m = re.search(r'<sheet name="' + EXCEL_SHEET + r'" sheetId="(\d+)"[^>]*r:id="(rId\d+)"', wb)
    sheet_id, rid = m.group(1), m.group(2)
    target = re.search(r'Id="' + rid + r'"[^>]*Target="([^"]+)"', files["xl/_rels/workbook.xml.rels"].decode()).group(1)
    sp = "xl/" + target.lstrip("/").replace("xl/", "")
    rp = sp.replace("worksheets/", "worksheets/_rels/") + ".rels"
    s, rels = files[sp].decode(), files[rp].decode()
    allrows = re.findall(r'<row r="(\d+)"[^>]*>.*?</row>', s, re.S)
    rowxml = dict(zip(allrows, re.findall(r'<row r="\d+"[^>]*>.*?</row>', s, re.S)))
    shared = files.get("xl/sharedStrings.xml", b"").decode()
    head_row = next(int(r) for r, x in rowxml.items() if ">Disinfo Agent<" in x or _is_header(x, shared))
    first = rowxml[str(head_row + 1)]
    sty = {c: (re.search(r'<c r="' + c + str(head_row + 1) + r'"[^>]*?s="(\d+)"', first) or [None, None])[1] for c in "BCD"}
    tot_old = next(r for r, x in rowxml.items() if "SUBTOTAL(" in x)
    st = lambda c: f' s="{sty[c]}"' if sty[c] else ""

    def cell(ref, c, text):
        if not text:
            return f'<c r="{ref}"{st(c)}/>'
        return f'<c r="{ref}"{st(c)} t="inlineStr"><is><t xml:space="preserve">{xesc(text)}</t></is></c>'

    new_rows, links = [], []
    for k, p in enumerate(people):
        r = head_row + 1 + k
        new_rows.append(f'<row r="{r}" spans="2:4">' + cell(f"B{r}", "B", p["name"]) + cell(f"C{r}", "C", p["note"])
                        + cell(f"D{r}", "D", "\n".join(p["links"])) + "</row>")
        if p["links"]:
            links.append((f"D{r}", p["links"][0]))
    last = head_row + len(people)
    tot = last + 1
    tot_cell = re.search(r'<c r="B' + tot_old + r'".*?</c>', rowxml[tot_old], re.S).group(0)
    tot_cell = tot_cell.replace(f'r="B{tot_old}"', f'r="B{tot}"')
    tot_cell = re.sub(r"<v>\d+</v>", f"<v>{len(people)}</v>", tot_cell)
    new_rows.append(f'<row r="{tot}" spans="2:4">{tot_cell}<c r="C{tot}"{st("C")}/></row>')
    # the info rows above the table: title row kept as is, then note / mes.fm / Hive / Google Sheet (blank row before the table)
    title_row = min(rowxml, key=int)
    info = [("Search their names in MES Links Telegram for many posts.", ""), ("mes.fm:", f"https://mes.fm/{SLUG}"),
            ("Hive:", HIVE_POST), ("Google Sheet:", SHEET_URL)]
    csty = (re.search(r'<c r="C\d+" s="(\d+)"', "".join(x for r, x in rowxml.items() if int(r) < head_row)) or [None, None])[1]
    keep = [rowxml[title_row]]
    for i, (label, url) in enumerate(info):
        r = int(title_row) + 1 + i
        if r >= head_row - 1:
            break
        c = f'<c r="C{r}"' + (f' s="{csty}"' if csty else "") + (f' t="inlineStr"><is><t>{xesc(url)}</t></is></c>' if url else "/>")
        keep.append(f'<row r="{r}" spans="2:4"><c r="B{r}" t="inlineStr"><is><t>{xesc(label)}</t></is></c>{c}</row>')
        if url:
            links.append((f"C{r}", url))
    keep.append(rowxml[str(head_row)])
    s = re.sub(r"<sheetData>.*?</sheetData>|<sheetData/>", lambda _: "<sheetData>" + "".join(keep + new_rows) + "</sheetData>", s, 1, re.S)
    s = re.sub(r'<dimension ref="[^"]*"/>', f'<dimension ref="B2:D{tot}"/>', s, 1)
    rels = re.sub(r'<Relationship Id="[^"]*" Type="[^"]*/hyperlink"[^>]*/>', "", rels)
    hl = "".join(f'<hyperlink ref="{ref}" r:id="rIdMesH{i}"/>' for i, (ref, _) in enumerate(links, 1))
    rels = rels.replace("</Relationships>", "".join(
        f'<Relationship Id="rIdMesH{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="{xesc(u)}" TargetMode="External"/>'
        for i, (_, u) in enumerate(links, 1)) + "</Relationships>")
    s = re.sub(r"<hyperlinks>.*?</hyperlinks>", "", s, 1, re.S)
    if hl:
        s = s.replace("<pageMargins", f"<hyperlinks>{hl}</hyperlinks><pageMargins", 1)
    tp = "xl/" + re.search(r'Type="[^"]*/table" Target="\.\./([^"]+)"', rels).group(1)
    t = files[tp].decode()
    t = re.sub(r'(<table [^>]*ref=")[^"]*', lambda m: m.group(1) + f"B{head_row}:D{tot}", t, 1)
    t = re.sub(r'(<autoFilter ref=")[^"]*', lambda m: m.group(1) + f"B{head_row}:D{last}", t, 1)
    t = re.sub(r'<sortState .*?</sortState>', "", t, 1, re.S)  # the Sheet's own order wins
    new = dict(files)
    new[sp], new[rp], new[tp] = s.encode(), rels.encode(), t.encode()
    if "xl/calcChain.xml" in files:
        cc = files["xl/calcChain.xml"].decode()
        new["xl/calcChain.xml"] = cc.replace(f'<c r="B{tot_old}" i="{sheet_id}"', f'<c r="B{tot}" i="{sheet_id}"').encode()
    changed = [n for n in (sp, rp, tp, "xl/calcChain.xml") if n in files and new[n] != files[n]]
    if not changed:
        print("unchanged Excel copy")
        return
    print(f"{'synced' if APPLY else 'would sync'} the Excel copy's {EXCEL_SHEET} tab ({len(people)} rows): {EXCEL_PATH.name}")
    if not APPLY:
        return
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i in infos:
            z.writestr(i, new[i.filename])
    data = buf.getvalue()
    zipfile.ZipFile(io.BytesIO(data)).testzip()
    with open(EXCEL_PATH, "wb") as f:  # write in place (same file for OneDrive and its share link)
        f.write(data)


def _is_header(rowxml, shared):
    ids = re.findall(r't="s"><v>(\d+)</v>', rowxml)
    strings = re.findall(r"<si>(.*?)</si>", shared, re.S)
    return any(re.sub("<[^>]+>", "", strings[int(i)]).strip() == "Disinfo Agent" for i in ids if int(i) < len(strings))


if __name__ == "__main__":
    ppl = main()
    if "--no-excel" not in sys.argv:
        sync_excel(ppl)
