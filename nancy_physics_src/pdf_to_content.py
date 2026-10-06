#!/usr/bin/env python3
"""One-off converter: Nancy Hutchison's "John Hutchison and the Physics of the System" (Final Draft 7)
PDF -> nancy_physics_src/content.html (+ toc.json). Needs PyMuPDF + Pillow (`pip install pymupdf pillow`), which are
only used for this extraction step; build_nancy_physics_article.py (repo root) wraps the result in
the page shell and has no dependencies.

    python3 pdf_to_content.py "/path/to/John_Hutchison_and_the_Physics_of_the_System_(final)_Draft_7.pdf"

The PDF is LibreOffice output with no structural tags, so block roles are recovered from fonts:
Carlit-Bold 17/13.5/11.5 = section / subsection / label headings, DejaVuSerif = display equation,
filled rectangles = callout boxes, Symbol font = bullets. Display equations that contain
subscripts/Greek/functions come from equations.py (hand-checked); plain word chains
("a -> b -> c") are converted here."""
import sys, re, json, html, os
import pymupdf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from equations import EQ, FORBIDDEN, INLINE

HERE = os.path.dirname(os.path.abspath(__file__))
esc = lambda t: html.escape(t, quote=False)

# ---------------------------------------------------------------- extraction
def extract(pdf):
    d = pymupdf.open(pdf)
    nodes = []
    for pi, p in enumerate(d):
        fills = [(dr["rect"], tuple(round(x, 2) for x in dr["fill"])) for dr in p.get_drawings()
                 if dr.get("fill") and dr["rect"].width > 300 and dr["rect"].height > 8]
        for img in p.get_images(full=True):
            for r in p.get_image_rects(img[0]):
                nodes.append(dict(page=pi + 1, y=r.y0, kind="figure", xref=img[0], doc=d))
        tabs = p.find_tables().tables
        trects = [t.bbox for t in tabs]
        for t in tabs:
            nodes.append(dict(page=pi + 1, y=t.bbox[1], kind="table", rows=t.extract()))
        for b in p.get_text("dict")["blocks"]:
            if "lines" not in b:
                continue
            bb = b["bbox"]
            if any(bb[0] >= r[0] - 2 and bb[1] >= r[1] - 2 and bb[2] <= r[2] + 2 and bb[3] <= r[3] + 2 for r in trects):
                continue
            lines = [[dict(t=s["text"], font=s["font"], size=round(s["size"], 1)) for s in l["spans"]] for l in b["lines"]]
            first = lines[0][0]
            flat = "".join(s["t"] for l in lines for s in l)
            if first["size"] == 8.0 and flat.startswith("JOHN HUTCHISON AND THE PHYSICS"):
                continue  # running header
            if flat.startswith("Final Draft 7 ·"):
                continue  # running footer
            fill = None
            for r, c in fills:
                if bb[0] >= r[0] - 3 and bb[1] >= r[1] - 3 and bb[2] <= r[2] + 3 and bb[3] <= r[3] + 3:
                    fill = (c, round(r[1]), pi)
            nodes.append(dict(page=pi + 1, y=bb[1], kind="block", lines=lines, fill=fill))
    nodes.sort(key=lambda n: (n["page"], n["y"]))
    return nodes

# ---------------------------------------------------------------- text helpers
def span_html(s):
    t = esc(s["t"])
    if not t.strip():
        return t
    if "Bold" in s["font"]:
        t = f"<b>{t}</b>"
    if "Italic" in s["font"]:
        t = f"<i>{t}</i>"
    return t

def line_join(lines, html_mode=True):
    out = []
    for l in lines:
        seg = "".join(span_html(s) if html_mode else s["t"] for s in l)
        out.append(seg.strip())
    return re.sub(r"\s+", " ", " ".join(out)).strip()

def smart(text):
    """straight -> typographic quotes/apostrophes, ASCII arrows/!= -> symbols (text nodes only)."""
    text = text.replace("->", "→").replace("!=", "≠")
    text = re.sub(r"(?<=\w)'(?=\w)", "’", text)
    out, opened = [], False
    in_tag = False
    for i, ch in enumerate(text):
        if ch == "<": in_tag = True
        if ch == ">": in_tag = False
        if ch == '"' and not in_tag:
            prev = text[i - 1] if i else " "
            if not opened and (prev in " ([>—–-" or i == 0):
                out.append("“"); opened = True
            else:
                out.append("”"); opened = False
        else:
            out.append(ch)
    text = "".join(out)
    text = re.sub(r"(^|[\s(>])'(?=\w)", r"\1‘", text)
    return text

def inline_math(h):
    """wrap PDF plain-text math tokens in \\( \\) for MathJax."""
    holders = []
    def hold(tex):
        holders.append(tex)
        return f"\x00{len(holders) - 1}\x00"
    for k in sorted(INLINE, key=len, reverse=True):
        h = h.replace(esc(k), hold(INLINE[k]))
    def simple(m):
        b, s = m.group(1), m.group(2)
        return hold(f"{b}_{s}")
    h = re.sub(r"(?<![\w\\\x00])([A-Za-z])_([A-Za-z0-9])(?![\w(])", simple, h)
    return re.sub(r"\x00(\d+)\x00", lambda m: r"\(" + esc(holders[int(m.group(1))]) + r"\)", h)

LABELS = ["John alignment.", "RF translation.", "Physics distinction.", "Physics translation.", "Physical translation.",
          "General-physics translation.", "RF/Physics reading.", "RF/Physics reason.", "RF/Physics status.",
          "RF/Physics consequence.", "RF analogue.", "RF / control translation.", "RF / control failure modes.",
          "Control-systems analogue.", "Direct image-generator source.", "Firsthand event history."]
CAPS_LABEL = re.compile(r"^((?:[A-Z0-9][A-Z0-9 /’'&+\-–—:,()≠_]*?[A-Z0-9)])\.)(?= )")
def lead_label(h):
    """bold run-in labels ("DRAFT 6 SOURCE CORRECTION.", "John alignment.")."""
    plain = re.sub(r"<[^>]+>", "", h)
    if h.startswith("<b>"):
        return h
    m = CAPS_LABEL.match(plain)
    lab = None
    if m and len(m.group(1)) >= 10 and re.search(r"[A-Z]{3}", m.group(1)):
        lab = m.group(1)
    else:
        for L in LABELS:
            if plain.startswith(L):
                lab = L
    if lab and h.startswith(esc(lab)):
        return f'<span class="lead">{h[:len(esc(lab))]}</span>{h[len(esc(lab)):]}'
    return h

FIG_DASH = re.compile(r'^Figure\s*-')
REV_LABEL = re.compile(r'^(<b>)?FINAL DRAFT 7 REVISION NOTE\.\s*(</b>)?')

def para_html(h):
    return inline_math(lead_label(smart(h)))

# ---------------------------------------------------------------- equations
OPS = [("→/→", r"\not\to"), ("→", r"\to"), ("⇒", r"\Rightarrow"), ("↔", r"\leftrightarrow"), ("≠", r"\neq"),
       ("≈", r"\approx"), ("=", "="), ("+", "+")]
def text_tex(t):
    t = t.strip()
    if not t: return ""
    for a in "&%$#{}": t = t.replace(a, "\\" + a)
    t = t.replace("\\", r"\textbackslash ")
    return r"\text{" + t + "}"
def chain_tex(s):
    if re.search(r"[_ΣΓΔδτθ²₁₂₃₄₅]", s):
        raise SystemExit(f"equation needs a hand-written entry in equations.py:\n  {s!r}")
    parts = re.split(r"(→/→|→|⇒|↔|≠|≈|=|\+)", s)
    units, cur = [], None
    for i, p in enumerate(parts):
        if i % 2 == 0:
            seg = text_tex(p)
            if cur is None: cur = [seg, len(p.strip())]
            else: cur[0] += (r"\;" if cur[0] else "") + seg; cur[1] += len(p.strip())
        else:
            units.append(cur); 
            op = dict(OPS)[p]
            cur = [op, 0]
    units.append(cur)
    # regroup: each unit after the first is "op + seg"; build lines of ~60 chars
    lines, cur_l, cur_len = [], [], 0
    for u in units:
        if cur_l and cur_len + u[1] > 100000:
            lines.append(cur_l); cur_l, cur_len = [], 0
        cur_l.append(u[0]); cur_len += u[1] + 3
    lines.append(cur_l)
    # a unit that starts with an operator keeps it; add spacing
    def j(l): return r"\;".join(l)
    if len(lines) == 1: return j(lines[0])
    return r"\begin{aligned}&" + r"\\&".join(j(l) for l in lines) + r"\end{aligned}"
def eq_html(raw):
    s = re.sub(r"\s+", " ", raw).strip()
    if s in EQ: tex = EQ[s]
    else: tex = chain_tex(s)
    cls = "eq eq-not" if s in FORBIDDEN else "eq"
    return f'<div class="{cls}">\\[{esc(tex)}\\]</div>'

# ---------------------------------------------------------------- classify
FIGURES = {  # PDF image xref -> (file stem, alt text)
    383: ("shard-projects-4d-constraint", "Diagram “The Shard Projects 4D Constraint”: a crystal shard (information seed) projects into 4D motion (living geometry); four candidates, A. Form, B. Pattern, C. Phase relation, D. Constraint, with the answer: Constraint. The shard projects a rule or equation into 4D motion, and form, pattern and phase relation emerge from that constraint."),
    412: ("shard-grammar-of-form", "Diagram “The Shard’s Grammar of Form”: the shard projects a constraint grammar that tells the local Spirals how to close together into a standing Form. Steps: receive, interpret, adjust, close together. Many Spirals, one grammar, a standing Form."),
}
IMG_DIR = os.path.join(HERE, "..", "mes.fm", "hutchison-nancy-physics-system", "img")

def classify(n):
    if n["kind"] == "figure":
        stem, alt = FIGURES[n["xref"]]
        if not os.path.exists(os.path.join(IMG_DIR, stem + ".jpg")):
            os.makedirs(IMG_DIR, exist_ok=True)
            pix = pymupdf.Pixmap(n["doc"], n["xref"])
            if pix.n > 3: pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            pix.save(os.path.join(IMG_DIR, stem + ".jpg"), jpg_quality=88)
            print(f"  wrote {stem}.jpg {pix.width}x{pix.height}", file=sys.stderr)
        return dict(kind="figure", stem=stem, alt=alt, w=None, page=n["page"])
    if n["kind"] == "table":
        return dict(kind="table", rows=n["rows"], page=n["page"])
    l0 = n["lines"][0][0]
    f, sz = l0["font"], l0["size"]
    flat_html = line_join(n["lines"])
    flat = line_join(n["lines"], False)
    k = dict(page=n["page"], fill=n["fill"], raw=flat, h=flat_html)
    if f.startswith("DejaVu"): k["kind"] = "eq"
    elif f == "Carlito-Bold" and sz == 22: k["kind"] = "title"
    elif f == "Carlito-Bold" and sz == 17: k["kind"] = "sec"
    elif f == "Carlito-Bold" and sz == 13.5: k["kind"] = "sub"
    elif f == "Carlito-Bold" and sz == 11.5: k["kind"] = "taghead"
    elif f == "Arial-BoldMT" and sz == 20: k["kind"] = "part"
    elif f == "Arial-ItalicMT" and sz == 11.5: k["kind"] = "tagline"
    elif f == "Arial-ItalicMT" and sz == 11.0: k["kind"] = "partsub"
    elif f == "Arial-BoldItalicMT": k["kind"] = "tag"
    elif re.match(r"Figure\s*[—-]", flat): k["kind"] = "figcap"
    elif f == "Symbol" or flat.startswith("•"): k["kind"] = "li"
    elif n["fill"] and f == "Arial-BoldMT" and len(n["lines"]) == 1: k["kind"] = "ctitle"
    else:
        k["kind"] = "p"
        if n["page"] <= 3 and len(flat) < 130 and not flat.endswith(".") and re.match(r"\d+(?:\.\d+)*[A-Z]?\.?\s+[A-Z]", flat):
            k["kind"] = "xref"  # expansion-map entry: a numbered section title on its own line
        elif re.fullmatch(r"[A-Z0-9 /’'&+\-–—:,()≠.]{12,}", flat) and not flat.endswith(".") and re.search(r"[A-Z]{4}", flat):
            k["kind"] = "tag"  # e.g. "DRAFT 7 CONTROLLING SECTION — PROJECT SOURCE + RF/PHYSICS TRANSLATION"
    return k

def slug_num(title):
    m = re.match(r"(\d+(?:\.\d+)*[A-Z]?)\.?\s", title)
    return "s" + m.group(1).lower().replace(".", "-") if m else None

def build(pdf):
    raw = extract(pdf)
    ks = [classify(n) for n in raw]
    # drop title-page TOC (from "TABLE OF CONTENTS" until the "Reading discipline" callout)
    start = next(i for i, k in enumerate(ks) if k["kind"] == "sec" and k["raw"].startswith("TABLE OF CONTENTS"))
    end = next(i for i, k in enumerate(ks) if i > start and k["kind"] == "ctitle")
    title_i = next(i for i, k in enumerate(ks) if k["kind"] == "title")
    tagline = " ".join(k["raw"] for k in ks if k["kind"] == "tagline" and k["page"] == 1)
    rev = ks[title_i + 1:start]
    rev = [k for k in rev if k["kind"] == "p"]
    body = ks[end:]
    body = [dict(k) for k in body]
    # page-break paragraph merge
    merged = []
    for k in body:
        if (merged and k["kind"] == "p" and merged[-1]["kind"] == "p" and k["page"] == merged[-1]["page"] + 1
                and not k["fill"] and not merged[-1]["fill"]
                and (not re.search(r"[.!?:)”\"’]\s*(?:</[bi]>)*$", merged[-1]["h"]) or k["raw"][:1].islower())):
            merged[-1]["h"] += " " + k["h"]; merged[-1]["raw"] += " " + k["raw"]; merged[-1]["page"] = k["page"]
            print(f"  merged paragraph across p{k['page'] - 1}/{k['page']}: …{merged[-1]['raw'][:60]!r}", file=sys.stderr)
        else:
            merged.append(k)
    body = merged

    out, toc = [], []
    state = dict(part=None, sub=False, nodes=[])
    def chap_open(cid, title, sub=False):
        tag, cls = ("h2", "chapter-toggle chapter-sub") if sub else ("h2", "chapter-toggle")
        out.append(f'<div class="{cls}" id="{cid}">')
        out.append(f'<{tag} class="chapter-toggle-header{" chapter-top" if not sub else ""}" onclick="toggleChapter(\'{cid}-list\')">'
                   + ("" if sub else "<center>") + f'{esc(title)} <span id="arrowIcon-{cid}-list" class="arrow-icon">&#9650;</span>'
                   + ("" if sub else "</center>") + f'</{tag}>')
        out.append(f'<div id="{cid}-list" class="chapter-toggle-list">')
    def chap_close(): out.append("</div>\n</div>")
    def close_sub():
        if state["sub"]: chap_close(); state["sub"] = False
    def close_part():
        close_sub()
        if state["part"]: chap_close(); state["part"] = None
    def open_part(cid, title):
        close_part(); chap_open(cid, title); state["part"] = cid
        toc.append(dict(id=cid, title=title, level=0))
    def headcase(t): return t
    # ---- front matter chapter
    open_part("about-this-draft", "About This Draft")
    lead_html = "".join(f"<p>{para_html(k['h'])}</p>" for k in rev)
    callout = None  # (fill_key, [html parts], cls)
    def flush_callout():
        nonlocal callout
        if callout:
            _, parts, cls = callout
            out.append(f'<aside class="callout {cls}">' + "".join(parts) + "</aside>")
            callout = None
    if rev:
        out.append('<aside class="callout callout-note"><div class="callout-title">Final Draft 7 revision note</div>'
                   + "".join(f"<p>{para_html(REV_LABEL.sub('', k['h']))}</p>" for k in rev) + "</aside>")
    li_open = False
    xref_open = False
    def close_li():
        nonlocal li_open
        if li_open: out.append("</ul>"); li_open = False
    def tbl(rows):
        head, rest = rows[0], rows[1:]
        c = lambda x: para_html(esc((x or "").replace("\n", " ").strip()).replace("&amp;", "&amp;"))
        s = ('<div class="table-block"><div class="tbl-modes"><button type="button" data-mode="wide" aria-pressed="false">Wide View</button>'
             '<button type="button" data-mode="theater" aria-pressed="false">Theater Mode</button></div>'
             '<div class="table-wrap"><table class="doc-table"><thead><tr>' + "".join(f"<th>{c(x)}</th>" for x in head) + "</tr></thead><tbody>")
        for r in rest: s += "<tr>" + "".join(f"<td>{c(x)}</td>" for x in r) + "</tr>"
        return s + "</tbody></table></div></div>"
    pending_tbl = None
    def flush_tbl():
        nonlocal pending_tbl
        if pending_tbl: out.append(tbl(pending_tbl)); pending_tbl = None
    for idx, k in enumerate(body):
        kind = k["kind"]
        if kind != "table": flush_tbl()
        # callouts: consecutive blocks inside the same filled rectangle
        if k.get("fill") and kind in ("ctitle", "p", "eq", "li", "tag", "sub"):
            key = k["fill"][1:]  # (rect top, page)
            c0 = k["fill"][0]
            cls = "callout-note" if c0[1] > 0.93 else "callout-key"
            close_li()
            if callout is None or callout[0] != key:
                flush_callout(); callout = (key, [], cls)
            if kind == "ctitle": callout[1].append(f'<div class="callout-title">{para_html(k["h"])}</div>')
            elif kind == "eq": callout[1].append(eq_html(k["raw"]))
            else: callout[1].append(f"<p>{para_html(k['h'])}</p>")
            continue
        flush_callout()
        if kind != "li": close_li()
        if kind != "xref" and xref_open: out.append("</ul>"); xref_open = False
        if kind == "part":
            title = "Part One — The Physics of the System"
            open_part("part-one", title)
            out.append(f'<p class="part-sub">')  # filled by following partsub
            state["await_partsub"] = True
        elif kind == "partsub":
            txt = para_html(k["h"])
            if k["raw"].startswith("John Hutchison’s apparatus"):
                open_part("part-two", "Part Two — John’s Work"); out.append(f'<p class="part-sub">{txt}</p>')
            elif k["raw"].startswith("Where the physical doings"):
                open_part("part-three", "Part Three — John’s Work and the Project: Direct Comparison"); out.append(f'<p class="part-sub">{txt}</p>')
            else:
                if out and out[-1] == '<p class="part-sub">': out[-1] = f'<p class="part-sub">{txt}</p>'
                else: out.append(f'<p class="part-sub">{txt}</p>')
        elif kind == "sec":
            title = re.sub(r"\s+", " ", k["raw"]).strip()
            if title.startswith("Appendix A"):
                close_part(); cid = "appendix-a"; chap_open(cid, title); state["part"] = cid
                toc.append(dict(id=cid, title=title, level=0))
            else:
                close_sub()
                cid = slug_num(title)
                chap_open(cid, title, sub=True); state["sub"] = True
                toc.append(dict(id=cid, title=title, level=1))
        elif kind == "sub":
            title = re.sub(r"\s+", " ", k["raw"]).strip()
            cid = slug_num(title)
            idattr = f' id="{cid}"' if cid else ""
            if not cid and title.isupper():
                title = " ".join(w.capitalize() if not re.fullmatch(r"\d+", w) else w for w in title.replace(" - ", " — ").split(" "))
            out.append(f"<h3{idattr}>{esc(smart(title))}</h3>")
        elif kind == "figure":
            from PIL import Image
            im = Image.open(os.path.join(IMG_DIR, k["stem"] + ".jpg"))
            out.append(f'<figure class="fig"><img src="/hutchison-nancy-physics-system/img/{k["stem"]}.jpg" width="{im.width}" height="{im.height}" loading="lazy" alt="{html.escape(k["alt"])}">')
        elif kind == "figcap":
            out.append(f"<figcaption>{para_html(FIG_DASH.sub('Figure —', k['h']))}</figcaption></figure>")
        elif kind == "tag":
            out.append(f'<div class="tag">{esc(smart(k["raw"]))}</div>')
        elif kind == "taghead":
            out.append(f'<h4 class="tag-heading">{esc(smart(k["raw"]))}</h4>')
        elif kind == "xref":
            title = re.sub(r"\s+", " ", k["raw"]).strip()
            if not xref_open: out.append('<ul class="doc-list xref-list">'); xref_open = True
            out.append(f'<li><a href="#{slug_num(title)}">{esc(smart(title))}</a></li>')
        elif kind == "eq":
            out.append(eq_html(k["raw"]))
        elif kind == "li":
            parts = [x.strip() for x in re.split(r"[•]", k["raw"]) if x.strip()]
            hs = [para_html(esc(x)) for x in parts]
            if not li_open: out.append('<ul class="doc-list">'); li_open = True
            for x in hs: out.append(f"<li>{x}</li>")
        elif kind == "table":
            if pending_tbl and pending_tbl[0] == k["rows"][0]: pending_tbl += k["rows"][1:]
            else:
                flush_tbl(); pending_tbl = list(k["rows"])
        elif kind == "p":
            h = k["h"]
            if k["page"] <= 3 and not h.startswith("<b>"):
                h = re.sub(r"^([^:.<]{3,60}?):(?= )", lambda m: "<b>" + m.group(1) + ":</b>", h, count=1)
            for piece in re.split(r"(?<=[.!?”\"] )(?=<b>[^<]{3,45}\.\s*</b>)", h):
                out.append(f"<p>{para_html(piece)}</p>")
        elif kind in ("title", "tagline"):
            pass
        else:
            raise SystemExit(f"unhandled {kind}: {k.get('raw')}")
    flush_tbl(); flush_callout(); close_li(); close_part()
    if xref_open: out.append("</ul>")
    text = "\n".join(out)
    ids = set(re.findall(r'id="(s[0-9a-z-]+)"', text))
    def link_refs(m):
        body = re.sub(r"(?<![\w.])(\d+(?:\.\d+)*[A-Z]?)(?![\w.]*\d)", lambda n: (f'<a href="#s{n.group(1).lower().replace(".", "-")}">{n.group(1)}</a>'
                      if f's{n.group(1).lower().replace(".", "-")}' in ids else n.group(1)), m.group(2))
        return m.group(1) + body
    text = re.sub(r"(§§?)(\d+(?:\.\d+)*[A-Z]?(?:(?:, (?:and )?)\d+(?:\.\d+)*[A-Z]?)*)", link_refs, text)
    return text, toc, tagline

if __name__ == "__main__":
    pdf = sys.argv[1]
    content, toc, tagline = build(pdf)
    open(os.path.join(HERE, "content.html"), "w").write(content + "\n")
    json.dump(dict(toc=toc, tagline=tagline), open(os.path.join(HERE, "toc.json"), "w"), indent=1, ensure_ascii=False)
    print(len(content), "bytes,", len(toc), "toc entries")
