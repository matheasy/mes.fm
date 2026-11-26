#!/usr/bin/env python3
"""Build mes.fm/hands, the "Illuminati Hand Signs Database".

Source: hands_src/hands.json (hand-maintained; first filled from the MES X thread
https://x.com/MathEasySolns/status/1054947652071239680, which mes.fm/hands-x now redirects to, on 2026-11-25).
One record per person: id (= #deep link), name, role, group (GROUPS below), date (YYYY-MM-DD of the post),
note (the MES post's own words), x (X post links), by (who posted it in the thread), gesture, pics (picture URLs:
X media, leopedia, snipboard...), alts (one per picture), links ([label, url]), mirror ([mes.fm url, title]).

Writes mes.fm/hands/index.html (shell = the built mes.fm/occult-posts page), hands.json, hands.csv and the pictures
mes.fm/hands/img/<id>-<n>.jpg (max 1400px) + <id>-<n>-t.jpg (480x360 card crop). Pictures are downloaded once
(cache ~/.cache/mes-hands) and only made when missing (--force-img remakes them).

  python3 build_hands_database.py            # dry run: report
  python3 build_hands_database.py --apply    # write

Adding a person: add a record at the end of hands.json (newest posts last is fine: the page sorts), run --apply,
then build_sitemap.py is not needed (same URL) but build_search_index.py is nice. A new hands mirror page: add its
[url, title] to "mirror" of each person in it. Never hand-edit mes.fm/hands/index.html.
"""
import csv, hashlib, html, io, json, re, sys, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
SRC = ROOT / "hands_src" / "hands.json"
SLUG = "hands"
OUT = SITE / SLUG
CACHE = Path.home() / ".cache" / "mes-hands"
APPLY = "--apply" in sys.argv
FORCE = "--force-img" in sys.argv
TITLE = "Illuminati Hand Signs Database"
XTHREAD = "/hands-x"

GROUPS = [
    ("politics", "Politicians & officials"),
    ("health", "Health & COVID"),
    ("money", "Crypto & finance"),
    ("science", "Science & tech"),
    ("media", "Media, TV & music"),
    ("epstein", "Epstein circle"),
    ("911", "9/11"),
    ("fun", "Just for fun"),
]
GLABEL = dict(GROUPS)


def esc(s):
    return html.escape(str(s or ""), quote=True)


def fetch(url):
    if url.startswith("/"):
        return (SITE / url.lstrip("/")).read_bytes()
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".img")
    if not f.exists() or f.stat().st_size < 1000:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (mes.fm hands database)"})
        f.write_bytes(urllib.request.urlopen(req, timeout=30).read())
    return f.read_bytes()


def make_images(p, report):
    from PIL import Image
    out = []
    for n, u in enumerate(p["pics"], 1):
        big = OUT / "img" / f'{p["id"]}-{n}.jpg'
        th = OUT / "img" / f'{p["id"]}-{n}-t.jpg'
        if FORCE or not big.exists() or not th.exists():
            im = Image.open(io.BytesIO(fetch(u))).convert("RGB")
            if APPLY:
                big.parent.mkdir(parents=True, exist_ok=True)
                b = im.copy(); b.thumbnail((1400, 1400), Image.LANCZOS); b.save(big, "JPEG", quality=84, optimize=True, progressive=True)
                # card crop 4:3, a little above centre (faces sit high in most of these)
                W, H = im.size; r = 4 / 3
                if W / H > r:
                    cw, ch = int(H * r), H; x0, y0 = (W - cw) // 2, 0
                else:
                    cw, ch = W, int(W / r); x0 = 0; y0 = max(0, min(H - ch, int((H - ch) * 0.3)))
                t = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((480, 360), Image.LANCZOS)
                t.save(th, "JPEG", quality=80, optimize=True, progressive=True)
            report.append(f"img {big.name}")
        w, h = (1400, 1050)
        if big.exists():
            with Image.open(big) as b:
                w, h = b.size
        out.append({"src": f"/{SLUG}/img/{big.name}", "thumb": f"/{SLUG}/img/{th.name}", "w": w, "h": h,
                    "alt": (p.get("alts") or [""] * 99)[n - 1] if n - 1 < len(p.get("alts") or []) else p["name"]})
    return out


def nice(d):
    d = date.fromisoformat(d)
    return f"{d.strftime('%b')} {d.day}, {d.year}"


SITE_ICONS = [("x.com", "x"), ("twitter.com", "x"), ("youtu", "yt"), ("peakd.com", "hive"), ("t.me", "tg"), ("mes.fm", "mes"),
              ("facebook.com", "fb"), ("reuters.com", "news"), ("npr.org", "news"), ("thecut.com", "news")]


def card(p, imgs):
    pics = imgs[0] if imgs else None
    more = f'<span class="hd-more" aria-hidden="true">+{len(imgs) - 1}</span>' if len(imgs) > 1 else ""
    pic = (f'<button type="button" class="hd-pic" data-open="0" aria-label="Show the {len(imgs)} picture{"s" if len(imgs) != 1 else ""} of {esc(p["name"])}">'
           f'<img src="{esc(pics["thumb"])}" alt="{esc(pics["alt"])}" width="480" height="360" loading="lazy" decoding="async">{more}</button>') if pics else ""
    links = []
    for m in p.get("mirror") or []:
        links.append(f'<a class="hd-l hd-lm" href="{esc(m[0])}" title="{esc(m[1])}">mes.fm post</a>')
    for i, u in enumerate(p.get("x") or []):
        who = u.split("/")[3]
        lab = "X post" if len(p["x"]) == 1 else f"X post {i + 1}"
        if who != "MathEasySolns":
            lab = f"@{who} on X"
        links.append(f'<a class="hd-l" href="{esc(u)}" target="_blank" rel="noopener">{esc(lab)}</a>')
    for lab, u in p.get("links") or []:
        ext = "" if u.startswith("https://mes.fm") else ' target="_blank" rel="noopener"'
        links.append(f'<a class="hd-l" href="{esc(u)}"{ext}>{esc(lab)}</a>')
    by = f' &middot; shared by <a href="https://x.com/{esc(p["by"])}" target="_blank" rel="noopener">@{esc(p["by"])}</a>' if p.get("by") and p["by"] != "MathEasySolns" else ""
    search = " ".join([p["name"], p["role"], GLABEL[p["group"]], p["note"], p.get("gesture", ""), p["date"][:4]]).lower()
    gal = json.dumps([{"s": i["src"], "w": i["w"], "h": i["h"], "a": i["alt"]} for i in imgs], ensure_ascii=False)
    return (f'<article class="hd-card" id="{p["id"]}" data-g="{p["group"]}" data-d="{p["date"]}" data-n="{esc(p["name"].lower())}"'
            f' data-c="{len(imgs)}" data-m="{1 if p.get("mirror") else 0}" data-k="{esc(search)}" data-gal="{esc(gal)}">\n'
            f'  {pic}\n  <div class="hd-body">\n'
            f'    <h2 class="hd-name"><a href="#{p["id"]}">{esc(p["name"])}</a></h2>\n'
            f'    <p class="hd-role">{esc(p["role"])}</p>\n'
            f'    <p class="hd-tags"><span class="hd-grp" data-g="{p["group"]}">{esc(GLABEL[p["group"]])}</span>'
            f'<time datetime="{p["date"]}">{nice(p["date"])}</time></p>\n'
            f'    <p class="hd-note">{esc(p["note"])}</p>\n'
            f'    <p class="hd-gest">Hand sign: {esc(p.get("gesture") or "")}{by}</p>\n'
            f'    <div class="hd-links">{"".join(links)}</div>\n'
            f'  </div>\n</article>')


CSS = r"""
<style id="hd-css">
/* Illuminati Hand Signs Database (build_hands_database.py) */
#main-content .hd-db { color:#333; --hd-acc:#6b3fa0; }
body.dark-mode #main-content .hd-db { color:#ddd; --hd-acc:#c4a3f0; }
#main-content .hd-db :is(p, b, span, div, h2, label, article, time, li, figure, figcaption):not(.hd-grp):not(.hd-more) { color:inherit; }
.hd-meta { display:flex; flex-wrap:wrap; gap:.4em 1.2em; align-items:center; margin:0 0 1em; font-size:.95em; }
.hd-meta a, .hd-note a, .hd-gest a { color:#5b2f96; }
.hd-filter { display:flex; flex-direction:column; gap:.6em; margin-bottom:.8em; }
.hd-filter input[type=search] { font:inherit; font-size:1.05em; padding:.6em .85em; border:1px solid #c9ccd1; border-radius:10px; width:100%; box-sizing:border-box; background:#fff; color:#222; }
.hd-filter input[type=search]:focus { outline:2px solid var(--hd-acc); outline-offset:1px; border-color:transparent; }
.hd-chips { display:flex; flex-wrap:wrap; gap:.4em; }
.hd-chips button { font:inherit; font-size:.88em; padding:.35em .8em; border:1px solid #d3d6db; border-radius:999px; background:#fff; color:#333; cursor:pointer; }
.hd-chips button[aria-pressed="true"] { background:#6b3fa0; border-color:#6b3fa0; color:#fff; }
.hd-bar { display:flex; flex-wrap:wrap; gap:.6em 1em; align-items:center; margin:.2em 0 1em; }
.hd-bar label { font-size:.92em; }
.hd-bar select { font:inherit; font-size:.92em; padding:.3em .5em; border:1px solid #ccc; border-radius:6px; background:#fff; color:#222; }
.hd-seg { display:inline-flex; border:1px solid #ccc; border-radius:7px; overflow:hidden; }
.hd-seg button { font:inherit; font-size:.88em; border:0; background:#fff; color:#333; padding:.35em .7em; cursor:pointer; min-width:2.2em; }
.hd-seg button + button { border-left:1px solid #ccc; }
.hd-seg button[aria-pressed="true"] { background:#6b3fa0; color:#fff; }
.hd-count { margin-left:auto; font-size:.9em; opacity:.8; }
.hd-grid { display:grid; grid-template-columns:repeat(var(--hd-cols, auto-fill), minmax(var(--hd-min, 15.5em), 1fr)); gap:1em; }
.hd-grid[data-cols]:not([data-cols="auto"]) { grid-template-columns:repeat(var(--hd-n), minmax(0, 1fr)); }
.hd-card { display:flex; flex-direction:column; background:#fff; border:1px solid #e1e4e8; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.06); scroll-margin-top:84px; }
.hd-card:target, .hd-card.hd-hl { border-color:#6b3fa0; box-shadow:0 0 0 3px rgba(107,63,160,.28); }
.hd-card[hidden] { display:none !important; }
.hd-pic { position:relative; display:block; border:0; padding:0; margin:0; background:#111; cursor:zoom-in; aspect-ratio:4/3; width:100%; }
.hd-pic img { display:block; width:100% !important; height:100% !important; max-width:none !important; object-fit:cover; transition:transform .25s; }
.hd-pic:hover img { transform:scale(1.03); }
.hd-more { position:absolute; right:.5em; bottom:.5em; background:rgba(0,0,0,.72); color:#fff; font-size:.8em; font-weight:600; padding:.15em .55em; border-radius:999px; }
.hd-body { padding:.75em .9em .9em; display:flex; flex-direction:column; gap:.35em; flex:1; }
.hd-name { font-size:1.12em; font-weight:600; line-height:1.25; margin:0; }
.hd-name a { color:#1a1a1a; text-decoration:none; }
.hd-name a:hover { text-decoration:underline; }
.hd-role { margin:0; font-size:.9em; opacity:.85; line-height:1.3; }
.hd-tags { margin:0; display:flex; flex-wrap:wrap; gap:.4em .7em; align-items:center; font-size:.82em; }
.hd-tags time { opacity:.8; }
.hd-grp { display:inline-block; padding:.1em .55em; border-radius:999px; background:#f1ecf9; color:#5b2f96; border:1px solid #e2d6f3; }
.hd-grp[data-g="health"] { background:#e9f6f1; color:#1f6b51; border-color:#cbe8dc; }
.hd-grp[data-g="money"] { background:#f6f2e3; color:#76611a; border-color:#e9dfba; }
.hd-grp[data-g="science"] { background:#eaf3fb; color:#1d5f91; border-color:#d1e3f2; }
.hd-grp[data-g="media"] { background:#fdf0e6; color:#9a4a09; border-color:#f3d6bd; }
.hd-grp[data-g="epstein"] { background:#fbecee; color:#9b2335; border-color:#f1cfd5; }
.hd-grp[data-g="911"] { background:#f1f1f1; color:#3f3f3f; border-color:#ddd; }
.hd-grp[data-g="fun"] { background:#eef8e6; color:#3e6b1a; border-color:#d6ecc4; }
.hd-note { margin:.15em 0 0; line-height:1.42; font-size:.94em; overflow-wrap:anywhere; }
.hd-gest { margin:0; font-size:.82em; opacity:.8; }
.hd-links { display:flex; flex-wrap:wrap; gap:.35em; margin-top:auto; padding-top:.35em; }
.hd-l { font-size:.8em; padding:.2em .6em; border:1px solid #d6dbe1; border-radius:999px; color:#1d5f91; text-decoration:none; background:#fafbfc; }
.hd-l:hover { border-color:#6b3fa0; background:#f4effb; }
.hd-l.hd-lm { background:#6b3fa0; border-color:#6b3fa0; color:#fff; font-weight:600; }
#main-content .hd-l.hd-lm { color:#fff; }
/* List view */
.hd-grid.hd-list { grid-template-columns:1fr !important; gap:0; border:1px solid #e1e4e8; border-radius:12px; overflow:hidden; }
.hd-list .hd-card { flex-direction:row; border:0; border-radius:0; box-shadow:none; }
.hd-list .hd-card + .hd-card { border-top:1px solid #eceef1; }
.hd-list .hd-pic { width:9.5em; flex:0 0 9.5em; aspect-ratio:4/3; align-self:flex-start; margin:.7em 0 .7em .7em; border-radius:8px; overflow:hidden; }
.hd-list .hd-body { padding:.7em .9em; }
.hd-list .hd-links { margin-top:.2em; }
@media (max-width: 640px) {
  .hd-grid[data-cols]:not([data-cols="auto"]) { grid-template-columns:repeat(min(var(--hd-n), 2), minmax(0, 1fr)); }
  .hd-list .hd-pic { width:6.5em; flex-basis:6.5em; }
  .hd-count { margin-left:0; width:100%; }
  .hd-colsw { display:none !important; }
}
.hd-fig { margin:2em auto .5em; max-width:900px; text-align:center; }
.hd-fig img { display:block; width:100%; height:auto; border-radius:14px; box-shadow:0 6px 24px rgba(0,0,0,.18); }
#main-content .hd-fig figcaption { margin-top:.6em; font-size:.92em; font-style:italic; opacity:.8; }
/* Picture viewer */
.hd-lb { position:fixed; inset:0; z-index:2147483000; background:rgba(8,8,10,.94); display:flex; flex-direction:column; align-items:center; justify-content:center; }
.hd-lb[hidden] { display:none; }
.hd-lb figure { margin:0; max-width:96vw; max-height:calc(100vh - 7em); display:flex; flex-direction:column; align-items:center; }
.hd-lb img { max-width:96vw !important; max-height:calc(100vh - 8em) !important; width:auto !important; height:auto !important; object-fit:contain; border-radius:6px; box-shadow:0 8px 40px rgba(0,0,0,.6); }
.hd-lb figcaption { color:#eee; font-size:.95em; margin-top:.7em; text-align:center; max-width:60em; padding:0 1em; line-height:1.4; }
.hd-lb figcaption b { color:#fff; }
.hd-lb button { position:absolute; border:0; background:rgba(255,255,255,.12); color:#fff; font-size:1.6em; width:1.9em; height:1.9em; border-radius:50%; cursor:pointer; line-height:1; }
.hd-lb button:hover { background:rgba(255,255,255,.25); }
.hd-lb .hd-x { top:.6em; right:.6em; }
.hd-lb .hd-prev { left:.6em; top:50%; transform:translateY(-50%); }
.hd-lb .hd-next { right:.6em; top:50%; transform:translateY(-50%); }
.hd-lb .hd-n { position:absolute; top:1em; left:1em; color:#ccc; font-size:.9em; }
body.hd-lbopen { overflow:hidden; }
/* dark */
body.dark-mode .hd-meta a, body.dark-mode .hd-note a, body.dark-mode .hd-gest a { color:#c4a3f0; }
body.dark-mode .hd-filter input[type=search], body.dark-mode .hd-bar select, body.dark-mode .hd-seg button, body.dark-mode .hd-chips button { background:#2a2a2a; color:#ddd; border-color:#555; }
body.dark-mode .hd-chips button[aria-pressed="true"], body.dark-mode .hd-seg button[aria-pressed="true"] { background:#c4a3f0; border-color:#c4a3f0; color:#16101f; }
body.dark-mode .hd-seg { border-color:#555; }
body.dark-mode .hd-seg button + button { border-left-color:#555; }
body.dark-mode .hd-card { background:#232323; border-color:#3a3a3a; box-shadow:none; }
body.dark-mode .hd-card:target, body.dark-mode .hd-card.hd-hl { border-color:#c4a3f0; box-shadow:0 0 0 3px rgba(196,163,240,.3); }
body.dark-mode .hd-grid.hd-list { border-color:#3a3a3a; }
body.dark-mode .hd-list .hd-card + .hd-card { border-top-color:#333; }
body.dark-mode .hd-name a { color:#f1f1f1; }
body.dark-mode .hd-l { background:#2a2a2a; border-color:#4a4a4a; color:#8fcaf7; }
body.dark-mode .hd-l:hover { border-color:#c4a3f0; background:#2f2840; }
body.dark-mode .hd-l.hd-lm { background:#7c4fc0; border-color:#7c4fc0; }
body.dark-mode .hd-grp { background:#2f2742; color:#d2bdf5; border-color:#463a63; }
body.dark-mode .hd-grp[data-g="health"] { background:#1d3a30; color:#94dcbf; border-color:#2d5546; }
body.dark-mode .hd-grp[data-g="money"] { background:#3a341d; color:#e2cf86; border-color:#585030; }
body.dark-mode .hd-grp[data-g="science"] { background:#22323f; color:#9fcdf2; border-color:#34495a; }
body.dark-mode .hd-grp[data-g="media"] { background:#3a2a1c; color:#f2bd8d; border-color:#5a3f28; }
body.dark-mode .hd-grp[data-g="epstein"] { background:#3c2228; color:#f2a6b3; border-color:#5d333c; }
body.dark-mode .hd-grp[data-g="911"] { background:#303030; color:#d6d6d6; border-color:#474747; }
body.dark-mode .hd-grp[data-g="fun"] { background:#26381a; color:#b7e195; border-color:#3a5428; }
</style>
"""

JS = r"""
<script>
/* Illuminati Hand Signs Database: search, chips, sort, columns, Cards / List, picture viewer, deep links (build_hands_database.py) */
(function () {
  var grid = document.getElementById('hdGrid'); if (!grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.hd-card'));
  var q = document.getElementById('hdSearch'), chips = document.getElementById('hdChips'), sortSel = document.getElementById('hdSort');
  var count = document.getElementById('hdCount'), empty = document.getElementById('hdEmpty');
  var KEY = 'mes-handsdb:v1', st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var g = 'all';
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function apply() {
    var words = norm(q.value).split(/\s+/).filter(Boolean), shown = 0;
    cards.forEach(function (c) {
      var k = norm(c.getAttribute('data-k'));
      var ok = (g === 'all' || (g === 'mirror' ? c.getAttribute('data-m') === '1' : c.getAttribute('data-g') === g))
        && words.every(function (w) { return k.indexOf(w) !== -1; });
      c.hidden = !ok; if (ok) shown++;
    });
    count.textContent = shown === cards.length ? cards.length + ' people' : shown + ' of ' + cards.length + ' people';
    empty.hidden = shown !== 0;
    var u = new URL(location.href);
    if (q.value) u.searchParams.set('q', q.value); else u.searchParams.delete('q');
    if (g !== 'all') u.searchParams.set('g', g); else u.searchParams.delete('g');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  function sort() {
    var m = sortSel.value, n = function (c) { return c.getAttribute('data-n'); }, d = function (c) { return c.getAttribute('data-d'); };
    var by = {
      new: function (a, b) { return d(b).localeCompare(d(a)) || n(a).localeCompare(n(b)); },
      old: function (a, b) { return d(a).localeCompare(d(b)) || n(a).localeCompare(n(b)); },
      az: function (a, b) { return n(a).localeCompare(n(b)); },
      za: function (a, b) { return n(b).localeCompare(n(a)); },
      pics: function (a, b) { return (+b.getAttribute('data-c')) - (+a.getAttribute('data-c')) || n(a).localeCompare(n(b)); }
    }[m];
    cards.slice().sort(by).forEach(function (c) { grid.appendChild(c); });
  }
  function setChip(v) {
    g = v;
    Array.prototype.forEach.call(chips.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-c') === v ? 'true' : 'false'); });
  }
  chips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setChip(b.getAttribute('data-c')); apply(); });
  q.addEventListener('input', apply);
  q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; apply(); } });
  sortSel.addEventListener('change', function () { st.sort = sortSel.value; save(); sort(); });
  var views = document.getElementById('hdView'), colsw = document.getElementById('hdCols');
  function setView(v) {
    grid.classList.toggle('hd-list', v === 'list');
    colsw.hidden = v === 'list';
    Array.prototype.forEach.call(views.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-v') === v ? 'true' : 'false'); });
  }
  function setCols(c) {
    grid.setAttribute('data-cols', c); if (c !== 'auto') grid.style.setProperty('--hd-n', c); else grid.style.removeProperty('--hd-n');
    Array.prototype.forEach.call(colsw.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-n') === c ? 'true' : 'false'); });
  }
  views.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.view = b.getAttribute('data-v'); save(); setView(st.view); });
  colsw.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.cols = b.getAttribute('data-n'); save(); setCols(st.cols); });
  if (st.sort && sortSel.querySelector('option[value="' + st.sort + '"]')) sortSel.value = st.sort;
  var p = new URLSearchParams(location.search);
  if (p.get('q')) q.value = p.get('q');
  if (p.get('g') && chips.querySelector('button[data-c="' + p.get('g') + '"]')) setChip(p.get('g'));
  sort(); setView(st.view === 'list' ? 'list' : 'cards'); setCols(st.cols || 'auto'); apply();
  /* picture viewer */
  var lb = document.getElementById('hdLb'), lbImg = lb.querySelector('img'), lbCap = lb.querySelector('figcaption'), lbN = lb.querySelector('.hd-n');
  var cur = null, gal = [], idx = 0, lastFocus = null;
  function show() {
    var it = gal[idx]; lbImg.src = it.s; lbImg.alt = it.a; lbImg.width = it.w; lbImg.height = it.h;
    lbCap.innerHTML = ''; var b = document.createElement('b'); b.textContent = cur.querySelector('.hd-name').textContent; lbCap.appendChild(b);
    lbCap.appendChild(document.createTextNode(': ' + it.a));
    lbN.textContent = gal.length > 1 ? (idx + 1) + ' / ' + gal.length : '';
    lb.querySelector('.hd-prev').hidden = lb.querySelector('.hd-next').hidden = gal.length < 2;
  }
  function open(card, i) {
    cur = card; gal = JSON.parse(card.getAttribute('data-gal') || '[]'); if (!gal.length) return;
    idx = i || 0; lastFocus = document.activeElement; lb.hidden = false; document.body.classList.add('hd-lbopen'); show(); lb.querySelector('.hd-x').focus();
  }
  function close() { lb.hidden = true; document.body.classList.remove('hd-lbopen'); lbImg.removeAttribute('src'); if (lastFocus) lastFocus.focus(); }
  function step(k) { idx = (idx + k + gal.length) % gal.length; show(); }
  grid.addEventListener('click', function (e) { var b = e.target.closest('.hd-pic'); if (b) open(b.closest('.hd-card'), 0); });
  lb.querySelector('.hd-x').addEventListener('click', close);
  lb.querySelector('.hd-prev').addEventListener('click', function () { step(-1); });
  lb.querySelector('.hd-next').addEventListener('click', function () { step(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); q.focus(); } return; }
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
  });
  var sx = null;
  lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); sx = null; });
  /* deep links */
  function hash() {
    var id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
    var c = document.getElementById(id); if (!c || !c.classList.contains('hd-card')) return;
    if (c.hidden) { q.value = ''; setChip('all'); apply(); }
    cards.forEach(function (x) { x.classList.remove('hd-hl'); }); c.classList.add('hd-hl');
    setTimeout(function () { c.scrollIntoView({ block: 'center' }); }, 60);
  }
  window.addEventListener('hashchange', hash); hash();
})();
</script>
"""


def content(people, imgs, today):
    cnt = lambda k: sum(1 for p in people if p["group"] == k)
    npics = sum(len(v) for v in imgs.values())
    nmir = sum(1 for p in people if p.get("mirror"))
    chips = [f'<button type="button" data-c="all" aria-pressed="true">All ({len(people)})</button>']
    chips += [f'<button type="button" data-c="{k}" aria-pressed="false">{esc(l)} ({cnt(k)})</button>' for k, l in GROUPS if cnt(k)]
    chips.append(f'<button type="button" data-c="mirror" aria-pressed="false">Has a mes.fm post ({nmir})</button>')
    d = date.fromisoformat(today)
    cols = "".join(f'<button type="button" data-n="{c}" aria-pressed="{"true" if c == "auto" else "false"}">{"Auto" if c == "auto" else c}</button>'
                   for c in ["auto", "1", "2", "3", "4", "5", "6"])
    return f"""<div class="wide hd-db">
<div class="hd-meta"><span><b>{len(people)}</b> people &middot; <b>{npics}</b> pictures</span><span>Updated {d.strftime('%B')} {d.day}, {d.year}</span>
<span>From the MES <a href="{XTHREAD}">X thread</a> (since 2018) and the mes.fm posts</span>
<span>Download: <a href="/{SLUG}/hands.csv" download>CSV</a> &middot; <a href="/{SLUG}/hands.json">JSON</a></span></div>
<div class="hd-filter">
  <input type="search" id="hdSearch" placeholder="Search {len(people)} names, roles and notes&hellip; (press /)" aria-label="Search the database" autocomplete="off">
  <div class="hd-chips" id="hdChips" role="group" aria-label="Filter by group">{''.join(chips)}</div>
</div>
<div class="hd-bar">
  <label>Sort <select id="hdSort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="az">A to Z</option><option value="za">Z to A</option><option value="pics">Most pictures</option></select></label>
  <span class="hd-seg" id="hdView" role="group" aria-label="View"><button type="button" data-v="cards" aria-pressed="true">Cards</button><button type="button" data-v="list" aria-pressed="false">List</button></span>
  <span class="hd-colsw" id="hdCols"><span class="hd-seg" role="group" aria-label="Columns">{cols}</span></span>
  <span class="hd-count" id="hdCount" aria-live="polite">{len(people)} people</span>
</div>
<p class="ls-empty" id="hdEmpty" hidden>Nothing matches. Try fewer words or another group.</p>
<div class="hd-grid" id="hdGrid" data-cols="auto">
{chr(10).join(card(p, imgs[p["id"]]) for p in people)}
</div>
<p class="hd-meta" style="margin-top:1.4em">Seen one we missed? Reply to the <a href="{XTHREAD}">X thread</a> or send it through <a href="/contact">contact</a>. Pictures are screenshots shared in the thread and the MES Telegram, for commentary.</p>
<figure class="hd-fig"><img src="/img/{SLUG}-icon.jpg" width="900" height="600" loading="lazy" decoding="async" alt="Illuminati hand signs: hands with fingertips pressed together in a diamond">
<figcaption>The Illuminati Hand Signs Database: {len(people)} people and counting.</figcaption></figure>
</div>
<div class="hd-lb" id="hdLb" hidden role="dialog" aria-modal="true" aria-label="Picture viewer"><span class="hd-n"></span>
<button type="button" class="hd-x" aria-label="Close">&times;</button><button type="button" class="hd-prev" aria-label="Previous picture">&#8249;</button><button type="button" class="hd-next" aria-label="Next picture">&#8250;</button>
<figure><img alt=""><figcaption></figcaption></figure></div>"""


def page(people, imgs, today):
    s = (SITE / "occult-posts" / "index.html").read_text()
    desc = (f"The MES Illuminati Hand Signs Database: {len(people)} politicians, CEOs, hosts and celebrities caught making the "
            "Merkel diamond / steeple hand sign, with pictures, dates and sources. Search it or filter by group.")
    url = f"https://mes.fm/{SLUG}"
    og = f"https://mes.fm/img/{SLUG}-share.jpg"
    s = s.replace('href="https://mes.fm/occult-posts"', f'href="{url}"')
    s = re.sub(r"<title>[^<]*</title>", f"<title>{esc(TITLE)} | MES Occult</title>", s, 1)
    for prop in ("og:title", "twitter:title", "twitter:image:alt"):
        s = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*', lambda m: m.group(1) + esc(TITLE), s)
    for prop in ("og:description", "twitter:description", "description"):
        s = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*', lambda m: m.group(1) + esc(desc), s)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + url, s)
    s = re.sub(r'(<meta (?:property|name)="(?:og:image|twitter:image)" content=")[^"]*', lambda m: m.group(1) + og, s)
    s = s.replace('<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">')
    s = re.sub(r'<h1 class="page-title">[^<]*</h1>', f'<h1 class="page-title">{esc(TITLE)}</h1>', s, 1)
    s = re.sub(r'<p class="page-description">[^<]*</p>',
               '<p class="page-description">Who makes the "Merkel diamond" / steeple hand sign? Politicians, CEOs, TV hosts and '
               'celebrities from the MES thread, with pictures, dates and sources. Search it, filter by group, or link straight to a person.</p>', s, 1)
    a = s.index('<div id="main-content">')
    b = s.index("<!-- FASTCOMMENTS-BLOCK")
    s = s[:a] + f'<div id="main-content">\n{content(people, imgs, today)}\n' + "        </div>\n        " + s[b:]
    s = s.replace("      wireViewToggle('occult-posts', []);\n", "")
    # The page's own hand logo (img/hands-logo.jpg, a square crop of the hands art) instead of the occult logo
    # in the favicon, the header and the floating bar.
    s = s.replace("https://mes.fm/img/occult-logo.jpg?v=1", f"https://mes.fm/img/{SLUG}-logo.jpg?v=1")
    s = s.replace("https://mes.fm/img/occult-logo.jpg", f"https://mes.fm/img/{SLUG}-logo.jpg?v=1")
    s = s.replace('alt="MES Occult logo"', 'alt="Illuminati Hand Signs logo"')
    s = re.sub(r"info_bar_tab:\s*\d+", "info_bar_tab:0", s, 1)
    s = s.replace("</head>", CSS + "</head>", 1)
    s = s.replace("</body>", JS + "</body>", 1)
    ld = {"@context": "https://schema.org", "@type": "Dataset", "name": TITLE, "description": desc, "url": url, "dateModified": today,
          "creator": {"@type": "Organization", "name": "Math Easy Solutions", "url": "https://mes.fm"},
          "distribution": [{"@type": "DataDownload", "encodingFormat": "text/csv", "contentUrl": f"{url}/hands.csv"},
                           {"@type": "DataDownload", "encodingFormat": "application/json", "contentUrl": f"{url}/hands.json"}]}
    s = s.replace("</head>", f'<script type="application/ld+json">{json.dumps(ld)}</script>\n</head>', 1)
    return "<!-- Generated by build_hands_database.py from hands_src/hands.json: never hand-edit. -->\n" + s


def main():
    data = json.loads(SRC.read_text())
    people = data["people"]
    ids = [p["id"] for p in people]
    assert len(ids) == len(set(ids)), "duplicate id"
    for p in people:
        assert p["group"] in GLABEL, p["id"]
        date.fromisoformat(p["date"])
    report = []
    imgs = {p["id"]: make_images(p, report) for p in people}
    today = max(p["date"] for p in people)
    today = max(today, data.get("read", today))
    html_out = page(people, imgs, today)
    pub = [{"id": p["id"], "name": p["name"], "role": p["role"], "group": GLABEL[p["group"]], "date": p["date"], "note": p["note"],
            "gesture": p.get("gesture"), "x": p.get("x"), "links": p.get("links"), "mirror": p.get("mirror"),
            "pictures": [f"https://mes.fm{i['src']}" for i in imgs[p["id"]]], "url": f"https://mes.fm/{SLUG}#{p['id']}"} for p in people]
    buf = io.StringIO(); w = csv.writer(buf, lineterminator="\n")
    w.writerow(["name", "role", "group", "date", "note", "gesture", "x posts", "mes.fm posts", "link"])
    for r in sorted(pub, key=lambda r: r["date"]):
        w.writerow([r["name"], r["role"], r["group"], r["date"], r["note"], r["gesture"], " ".join(r["x"] or []),
                    " ".join(m[0] for m in r["mirror"] or []), r["url"]])
    files = {OUT / "index.html": html_out, OUT / "hands.json": json.dumps({"title": TITLE, "updated": today, "people": pub}, ensure_ascii=False, indent=1) + "\n",
             OUT / "hands.csv": buf.getvalue()}
    for f, t in files.items():
        old = f.read_text() if f.exists() else None
        if old != t:
            report.append(f"write {f.relative_to(ROOT)}")
            if APPLY:
                f.parent.mkdir(parents=True, exist_ok=True); f.write_text(t)
    print(f"{len(people)} people, {sum(len(v) for v in imgs.values())} pictures")
    print("\n".join(report) or "nothing to change")
    if not APPLY:
        print("(dry run: --apply writes)")


if __name__ == "__main__":
    main()
