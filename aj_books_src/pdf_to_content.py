#!/usr/bin/env python3
"""Converts Andrew Johnson's two 9/11 books (the PDFs he publishes, exported from his Word files) into the
body HTML of mes.fm/911-finding-truth and mes.fm/911-holding-truth.

    pip install pymupdf pillow            (in a venv; the page builder build_aj_books.py needs neither)
    python3 aj_books_src/pdf_to_content.py            # dry run: report chapters / sections / images
    python3 aj_books_src/pdf_to_content.py --apply    # write aj_books_src/<slug>/content.html + toc.json
                                                      #   and the pictures to mes.fm/<slug>/img/

Why the PDFs and not the Word files: the author's sources are old binary .doc files (Word 97-2003); textutil
cannot read them and no .doc converter is installed here, while the PDFs are clean Word exports with real fonts.
Roles are recovered from the fonts (same idea as nancy_physics_src/pdf_to_content.py):
  bold >= 15.5 pt          chapter title  -> top-level fold (h2.chapter-top), "N. Title" -> id ch-N
  bold 13.5-15 pt          section        -> h3 (front matter before chapter 1: its own top-level fold)
  all-bold 10.5-12 pt line(s)              -> h4
  italic + indented, or <= 9.5 pt italic   -> blockquote (quoted e-mails, articles)
  tiny digits (< 0.7 x the line size)      -> endnote reference, linked to the "References" chapter
  running header (top 38 pt) / page number -> dropped; the printed Table of Contents pages -> dropped (Jump to)
Paragraphs: a new one starts when the gap to the previous line is > 1.38 x the font size, or the style /
indent changes; a paragraph carries over a page break when the last line on the page runs to the margin.
Pictures are rendered from the page at their own size (<= 220 dpi, <= 1000 px wide) to JPEG (PNG for flat
line art) so crops / masks come out as printed. Link annotations become <a>; bare URLs are linked too;
"chapter 13" in the text links to that chapter's fold."""
import html, io, json, os, re, sys
from collections import Counter

import fitz  # pymupdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MES = os.path.join(ROOT, "mes.fm")
BOOKS = {
    "911-finding-truth": dict(pdf=os.path.join(MES, "911-finding-truth-pdf", "9-11-finding-the-truth-andrew-johnson.pdf"),
                              title_page=3, skip_pages={1, 2}),
    "911-holding-truth": dict(pdf=os.path.join(MES, "911-holding-truth-pdf", "9-11-holding-the-truth-andrew-johnson.pdf"),
                              title_page=1, skip_pages={2}),
}
esc = lambda t: html.escape(t, quote=False)
attr = lambda t: html.escape(t, quote=True)
CHAR_FIX = {"": "•", "": "▪", "": "➢", "": "✓", " ": " ", "": " "}


def slugify(t, n=48):
    s = re.sub(r"[^a-z0-9]+", "-", t.lower().replace("’", "").replace("'", "")).strip("-")
    return s[:n].strip("-") or "s"


def fix(t):
    for a, b in CHAR_FIX.items():
        t = t.replace(a, b)
    return t


def is_bold(f): return "Bold" in f or "Black" in f
def is_ital(f): return "Italic" in f or "Oblique" in f


class Line:
    def __init__(self, spans, bbox, page):
        self.spans, self.bbox, self.page = spans, bbox, page
        txt = [s for s in spans if s["text"].strip()]
        self.text = "".join(s["text"] for s in spans)
        sizes = Counter()
        for s in txt:
            sizes[round(s["size"], 1)] += len(s["text"])
        self.size = sizes.most_common(1)[0][0] if sizes else 0
        main = [s for s in txt if s["size"] >= self.size * 0.7]
        n = sum(len(s["text"]) for s in main) or 1
        self.bold = sum(len(s["text"]) for s in main if is_bold(s["font"])) / n > 0.9
        self.ital = sum(len(s["text"]) for s in main if is_ital(s["font"])) / n > 0.6
        self.x0, self.y0, self.x1, self.y1 = bbox
        self.blank = not self.text.strip()


RUNNING_HEADERS = set()   # the chapter titles printed at the top of the pages; stray copies of them in the body are dropped


def page_lines(page):
    """text lines + image blocks of one page, top to bottom, header / footer removed"""
    d = page.get_text("dict")
    H = page.rect.height
    links = [(fitz.Rect(l["from"]), l.get("uri")) for l in page.get_links() if l.get("kind") == fitz.LINK_URI and l.get("uri")]
    items = []
    for b in d["blocks"]:
        if b["type"] == 1:
            r = fitz.Rect(b["bbox"])
            if r.width < 6 or r.height < 6:
                continue
            items.append(("img", r))
            continue
        for l in b["lines"]:
            spans = []
            for s in l["spans"]:
                s = dict(s)
                s["text"] = fix(s["text"])
                c = fitz.Rect(s["bbox"])
                mid = fitz.Point((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2)
                s["href"] = next((u for r, u in links if r.contains(mid)), None)
                spans.append(s)
            ln = Line(spans, l["bbox"], page.number + 1)
            if ln.y0 < 38:                                     # running header
                RUNNING_HEADERS.add(ln.text.strip())
                continue
            if ln.y0 > H - 50 and re.fullmatch(r"\s*[0-9ivxlc]+\s*", ln.text):   # page number
                continue
            items.append(("line", ln))
    items.sort(key=lambda it: (round(it[1].y0 if it[0] == "line" else it[1].y0), it[1].x0 if it[0] == "line" else it[1].x0))
    # pieces of one printed row (a bullet glyph and its text, a transcript's speaker and words) -> one line
    out = []
    for it in items:
        if it[0] == "line" and out and out[-1][0] == "line":
            a, b = out[-1][1], it[1]
            ov = min(a.y1, b.y1) - max(a.y0, b.y0)
            if ov > 0.6 * min(a.y1 - a.y0, b.y1 - b.y0) and b.x0 >= a.x1 - 1 and not a.blank and not b.blank and abs(a.size - b.size) < 3:
                sp = dict(b.spans[0]); sp["text"] = " "; sp["href"] = None
                m = Line(a.spans + [sp] + b.spans, (min(a.x0, b.x0), min(a.y0, b.y0), max(a.x1, b.x1), max(a.y1, b.y1)), a.page)
                out[-1] = ("line", m)
                continue
        out.append(it)
    return out


def body_x(items):
    c = Counter(round(it[1].x0) for it in items if it[0] == "line" and not it[1].blank and 10.5 <= it[1].size <= 11.5)
    return c.most_common(1)[0][0] if c else 54


class Book:
    def __init__(self, slug, cfg, apply):
        self.slug, self.cfg, self.apply = slug, cfg, apply
        self.doc = fitz.open(cfg["pdf"])
        self.blocks = []          # ("h1"|"h2"|"h3"|"p"|"quote"|"li"|"center"|"img"|"ref", payload)
        self.imgdir = os.path.join(MES, slug, "img")
        self.nimg = 0
        self.img_bytes = 0

    # ---------- pictures
    def save_img(self, page, rect):
        self.nimg += 1
        # native resolution of the biggest image drawn in this rect
        dpi = 150
        for info in page.get_image_info(xrefs=True):
            r = fitz.Rect(info["bbox"])
            if r.intersects(rect) and info.get("width"):
                dpi = max(96, min(220, info["width"] / max(r.width, 1) * 72))
                break
        if rect.width * dpi / 72 > 1000:
            dpi = 1000 * 72 / rect.width
        pix = page.get_pixmap(clip=rect, dpi=int(dpi), alpha=False)
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        colours = len(im.getcolors(256) or []) if im.getcolors(256) else 999
        name = f"{self.slug[4:]}-{self.nimg:03d}"
        if colours <= 64:
            name += ".png"; buf = io.BytesIO(); im.quantize(colours).save(buf, "PNG", optimize=True)
        else:
            name += ".jpg"; buf = io.BytesIO(); im.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
        self.img_bytes += buf.tell()
        if self.apply:
            os.makedirs(self.imgdir, exist_ok=True)
            open(os.path.join(self.imgdir, name), "wb").write(buf.getvalue())
        return dict(src=f"/{self.slug}/img/{name}", w=im.width, h=im.height)

    # ---------- runs (inline formatting) of a group of lines
    def runs(self, lines, base_ital=False):
        out = []
        prev_text = None
        for ln in lines:
            if prev_text is not None:
                if prev_text.endswith("-") and not prev_text.endswith(" -") or not re.search(r"\s$", prev_text):
                    pass                                      # word / URL broken over the line: no space
                else:
                    out.append(("", " ", None))
            main = ln.size
            for s in ln.spans:
                t = s["text"]
                if not t:
                    continue
                st = ""
                if s["size"] < main * 0.76 and (re.fullmatch(r"\s*\d{1,3}\s*", t) or re.fullmatch(r"[a-z]{1,3}\s*", t)):
                    st = "sup"
                else:
                    if is_bold(s["font"]): st += "b"
                    if is_ital(s["font"]) and not base_ital: st += "i"
                out.append((st, t, s["href"]))
            prev_text = ln.text
        # merge
        m = []
        for st, t, h in out:
            if m and st == m[-1][0] and h == m[-1][2] and st != "sup":
                m[-1] = (st, m[-1][1] + t, h)
            elif m and not t.strip() and st != "sup" and t:
                m[-1] = (m[-1][0], m[-1][1] + t, m[-1][2]) if m[-1][0] != "sup" else m[-1]
                if m[-1][0] == "sup": m.append(("", t, None))
            else:
                m.append((st, t, h))
        return m

    def read(self):
        doc = self.doc
        skip = set(self.cfg["skip_pages"]) | {self.cfg["title_page"]}
        toc_pages = set()
        for p in doc:
            t = p.get_text()
            if re.search(r"^\s*Table of Contents\s*$", t, re.M):
                toc_pages.add(p.number + 1)
                n = p.number + 1
                while n < len(doc):
                    nxt = page_lines(doc[n])
                    if any(it[0] == "line" and it[1].bold and it[1].size >= 13.5 and it[1].text.strip() for it in nxt):
                        break
                    toc_pages.add(n + 1); n += 1
                break
        self.toc_pages = toc_pages
        for p in doc:
            page_lines(p)                                    # fills RUNNING_HEADERS
        cur = None          # current paragraph: dict(kind, lines, x)
        seen_ch1 = False
        pend_head = None    # heading being assembled over several lines
        in_refs = False

        pend_floats = []

        def flush():
            nonlocal cur
            if cur and cur["lines"]:
                for im in cur.get("floats", []):
                    self.blocks.append(("img", dict(page=0, y0=0, imgs=[im], float=True)))
                if cur["kind"] in ("p", "center"):   # a caption's lines have different indents: majority decides
                    cur["kind"] = "center" if 2 * sum(getattr(l, "k", "p") == "center" for l in cur["lines"]) >= len(cur["lines"]) else "p"
                self.blocks.append((cur["kind"], cur))
            cur = None

        def flush_head():
            nonlocal pend_head, seen_ch1, in_refs
            if not pend_head:
                return
            text = re.sub(r"\s+", " ", " ".join(l.text.strip() for l in pend_head["lines"])).strip()
            lvl = pend_head["lvl"]
            if lvl == "h1" and re.match(r"\d+\.", text):
                seen_ch1 = True
            if lvl == "h2" and not seen_ch1:
                lvl = "h1"                                   # front matter: its own fold
            in_refs = lvl == "h1" and re.fullmatch(r"(\d+\.\s*)?(References|Endnotes|Notes)", text) is not None
            if len(text) > 220 or (lvl == "h3" and (len(text) > 110 or re.search(r"[.,;]$", text))):
                self.blocks.append(("p", dict(kind="p", lines=pend_head["lines"], x=0)))
            else:
                self.blocks.append((lvl, text))
            pend_head = None

        for p in doc:
            pn = p.number + 1
            if pn in skip or pn in toc_pages:
                continue
            items = page_lines(p)
            bx = body_x(items)
            right = max([it[1].x1 for it in items if it[0] == "line" and 10 <= it[1].size <= 12] or [bx + 320])
            first_on_page = True
            # pictures with text beside them (author photo ...) float next to the paragraph instead of splitting it
            text_lines = [it for k2, it in items if k2 == "line" and not it.blank]
            floats = set()
            for k2, r in items:
                if k2 == "img" and r.width < (right - bx) * 0.6:
                    beside = [l for l in text_lines if l.y0 < r.y1 - 4 and l.y1 > r.y0 + 4 and (l.x0 >= r.x1 - 3 or l.x1 <= r.x0 + 3)]
                    if len(beside) >= 2:
                        floats.add(id(r))
            for kind, it in items:
                if kind == "img" and id(it) in floats:
                    pend_floats.append(self.save_img(p, it))
                    continue
                if kind == "img":
                    flush_head(); flush()
                    im = self.save_img(p, it)
                    # side-by-side pictures: same row as the previous picture block
                    if self.blocks and self.blocks[-1][0] == "img" and self.blocks[-1][1]["page"] == pn and abs(self.blocks[-1][1]["y0"] - it.y0) < 30:
                        self.blocks[-1][1]["imgs"].append(im)
                    else:
                        self.blocks.append(("img", dict(page=pn, y0=it.y0, imgs=[im])))
                    first_on_page = False
                    continue
                ln = it
                if ln.ital and ln.size <= 9.5 and ln.text.strip() in RUNNING_HEADERS and len(ln.text.strip()) < 60:
                    continue                                 # a running header Word left in the body (Finding, ch. 6 transcript)
                if ln.blank:
                    if cur and ln.y0 - cur["lines"][-1].y1 > 2:
                        flush()
                    continue
                # ----- headings
                # ----- part dividers ("Part 2" + subtitle, 20-48 pt)
                if ln.size >= 19 and pn != self.cfg["title_page"]:
                    flush_head(); flush()
                    if ln.bold and re.match(r"\s*Part\s+\d+", ln.text):
                        self.blocks.append(("part", dict(title=ln.text.strip(), sub=[], page=pn)))
                    elif self.blocks and self.blocks[-1][0] == "part" and self.blocks[-1][1]["page"] == pn:
                        self.blocks[-1][1]["sub"].append(ln.text.strip())
                    continue
                # ----- the commentator's lettered footnotes at the foot of a page (Finding, ch. 6)
                if 7.5 <= ln.size <= 9.5 and ln.y0 > p.rect.height * 0.55 and not in_refs and not ln.ital:
                    mk = re.match(r"\s*([a-z]{1,3})\s+(\S.*)", ln.text)
                    if mk:                                   # (does not end the paragraph above: notes are printed at the chapter's end)
                        flush_head()
                        self.blocks.append(("note", dict(mark=mk.group(1), lines=[ln])))
                        continue
                    if self.blocks and self.blocks[-1][0] == "note" and self.blocks[-1][1]["lines"][-1].page == pn:
                        self.blocks[-1][1]["lines"].append(ln)
                        continue
                lvl = None
                if ln.bold and 15.5 <= ln.size < 17: lvl = "h1"
                elif ln.bold and 13.5 <= ln.size < 15.5: lvl = "h2"
                elif ln.bold and 10.5 <= ln.size <= 12 and not in_refs and len(ln.text.strip()) < 120: lvl = "h3"
                if lvl:
                    if pend_head and pend_head["lvl"] == lvl and ln.y0 - pend_head["lines"][-1].y1 < ln.size * 0.9 and pend_head["lines"][-1].page == pn:
                        pend_head["lines"].append(ln); continue
                    flush_head(); flush()
                    pend_head = dict(lvl=lvl, lines=[ln]); first_on_page = False
                    continue
                flush_head()
                # ----- references chapter: an entry starts with a tiny number
                if in_refs:
                    s0 = next((s for s in ln.spans if s["text"].strip()), None)
                    starts = s0 is not None and s0["size"] < 6.5 and re.match(r"\s*\d+", s0["text"]) and (ln.size >= 6 or len(ln.text.strip()) > 4)
                    if starts or not (cur and cur["kind"] == "ref"):
                        flush(); cur = dict(kind="ref", lines=[ln], x=ln.x0)
                    else:
                        cur["lines"].append(ln)
                    continue
                # ----- body / quote / list / centred
                x_ind = ln.x0 - bx
                width = ln.x1 - ln.x0
                r_ind = right - ln.x1
                centred = x_ind > 20 and r_ind > 20 and abs(x_ind - r_ind) < 14
                if ln.ital and (x_ind > 8 or ln.size <= 9.5):
                    k = "quote"
                elif re.match(r"\s*(\(?\d{1,2}[\).]|\(?[a-z][\)]|[•▪➢✓\-–·o§])\s", ln.text) and 6 < x_ind < 45:
                    k = "li"
                elif centred:
                    k = "center"
                else:
                    k = "p"
                ln.k = k
                if cur:
                    last = cur["lines"][-1]
                    gap = ln.y0 - last.y0
                    same_page = last.page == pn
                    cont = False
                    if same_page:
                        lim = max(last.size, ln.size) * 1.38
                        if gap <= lim and gap > 0:
                            if k == cur["kind"] or {k, cur["kind"]} == {"p", "center"}: cont = True
                            elif cur["kind"] == "li" and k in ("p", "quote", "center") and ln.x0 > bx + 6: cont = True   # wrapped list item
                    elif first_on_page and last.y1 > cur["H"] * 0.62:
                        # carried over the page break: the page's last line ends mid-sentence, or this line starts in lower case
                        if k in (cur["kind"], "p", "center") and not re.search(r"[.!?:”\"]\s*$", last.text):
                            cont = True
                        elif k == cur["kind"] and k in ("p", "quote", "li") and re.match(r"\s*[a-z(]", ln.text):
                            cont = True
                    if cont:
                        cur["lines"].append(ln); cur["right"] = right; cur["H"] = p.rect.height; first_on_page = False
                        cur["floats"] += pend_floats; pend_floats = []
                        continue
                    flush()
                cur = dict(kind=k, lines=[ln], x=ln.x0, right=right, H=p.rect.height, floats=pend_floats)
                pend_floats = []
                first_on_page = False
        flush_head(); flush()

    # ---------- HTML
    def render(self):
        out, toc = [], []
        ids = set()
        refs_seen = set()
        chap_list = []

        def uid(base):
            i, b = base, 2
            while i in ids:
                i = f"{base}-{b}"; b += 1
            ids.add(i); return i

        # chapter ids first (cross references need them)
        for k, v in self.blocks:
            if k == "h1":
                m = re.match(r"(\d+)\.\s*(.*)", v)
                chap_list.append((v, uid(f"ch-{m.group(1)}" if m else slugify(v, 40))))
        chap_iter = iter(chap_list)
        norm = lambda t: re.sub(r"[^a-z0-9]+", "", re.sub(r"^\d+\.\s*", "", t.lower()))
        by_title = {norm(t): i for t, i in chap_list if re.match(r"\d+\.", t)}
        ids_ch = {re.match(r"(\d+)\.", t).group(1): i for t, i in chap_list if re.match(r"(\d+)\.", t)}
        cur_cid = "front"
        notes_buf = []

        def link_text(t):
            """escape plain text; link bare URLs and 'chapter N'"""
            parts = re.split(r"((?:https?://|www\.)[^\s<>\"]+)", t)
            o = []
            for j, s in enumerate(parts):
                if j % 2:
                    tail = re.search(r"[.,;:!?)\]”’'\"]+$", s)
                    tail = tail.group(0) if tail else ""
                    u = s[:len(s) - len(tail)] if tail else s
                    href = u if u.startswith("http") else "http://" + u
                    o.append(f'<a href="{attr(href)}" target="_blank" rel="noopener nofollow">{esc(u)}</a>{esc(tail)}')
                else:
                    e = esc(s)
                    e = re.sub(r"\b([Cc]hapters?)\s+(\d{1,2})\b", lambda m: f'<a href="#{ids_ch[m.group(2)]}">{m.group(1)} {m.group(2)}</a>' if m.group(2) in ids_ch else m.group(0), e)
                    o.append(e)
            return "".join(o)

        def inline(runs):
            o = []
            for st, t, h in runs:
                if st == "sup":
                    n = t.strip()
                    if n.isalpha():                       # lettered footnote of this chapter
                        rid = f"fnref-{cur_cid}-{n}"
                        a = f' id="{rid}"' if rid not in refs_seen else ""
                        refs_seen.add(rid)
                        o.append(f'<sup class="fn fn-l"{a}><a href="#fn-{cur_cid}-{n}">{n}</a></sup>')
                        continue
                    rid = f"fnref-{n}"
                    a = f' id="{rid}"' if rid not in refs_seen else ""
                    refs_seen.add(rid)
                    o.append(f'<sup class="fn"{a}><a href="#fn-{n}">{n}</a></sup>')
                    continue
                body = esc(t) if h else link_text(t)
                if h:
                    body = f'<a href="{attr(h)}" target="_blank" rel="noopener nofollow">{body}</a>'
                if "b" in st and t.strip(): body = f"<b>{body}</b>"
                if "i" in st and t.strip(): body = f"<i>{body}</i>"
                o.append(body)
            s = "".join(o)
            s = re.sub(r"</b>(\s*)<b>", r"\1", s); s = re.sub(r"</i>(\s*)<i>", r"\1", s)
            return re.sub(r"[ \t]{2,}", " ", s).strip()

        open_ch = False
        quote_buf, list_buf, ref_buf = [], [], []

        def close_chapter():
            nonlocal open_ch, notes_buf
            if notes_buf:
                lis = []
                for cid, mk, body in notes_buf:
                    back = f' <a class="fn-back" href="#fnref-{cid}-{mk}" aria-label="Back to the text">&#8617;</a>' if f"fnref-{cid}-{mk}" in refs_seen else ""
                    lis.append(f'<li id="fn-{cid}-{mk}"><span class="note-mark">{mk}</span> {body}{back}</li>')
                out.append('<div class="ch-notes"><div class="ch-notes-title">Notes</div><ol class="notes-list">' + "".join(lis) + "</ol></div>")
                notes_buf = []
            if open_ch:
                out.append("</div>\n</div>")
            open_ch = False

        def close_bufs():
            nonlocal quote_buf, list_buf, ref_buf
            if quote_buf:
                out.append("<blockquote>" + "".join(quote_buf) + "</blockquote>"); quote_buf = []
            if ref_buf:
                out.append('<ol class="refs">' + "".join(ref_buf) + "</ol>"); ref_buf = []

        for k, v in self.blocks:
            if k not in ("quote", "note") and quote_buf or k not in ("ref", "note") and ref_buf:
                close_bufs()
            if k == "part":
                close_chapter()
                pid = uid(slugify(v["title"], 20))
                sub = " ".join(v["sub"]).strip()
                out.append(f'<div class="book-part" id="{pid}"><div class="book-part-n">{esc(v["title"])}</div>' + (f'<div class="book-part-t">{esc(sub)}</div>' if sub else "") + "</div>")
                toc.append(dict(id=pid, title=v["title"] + (": " + sub if sub else ""), level=-1))
            elif k == "note":
                body = inline(self.runs(v["lines"]))
                body = re.sub(r"^\s*" + v["mark"] + r"\s+", "", body)
                notes_buf.append((cur_cid, v["mark"], body))
            elif k == "h1":
                close_chapter()
                cid = next(chap_iter)[1]; cur_cid = cid
                out.append(f'<div class="chapter-toggle" id="{cid}">\n<h2 class="chapter-toggle-header chapter-top" onclick="toggleChapter(\'{cid}-list\')">'
                           f'{esc(v)} <span id="arrowIcon-{cid}-list" class="arrow-icon">&#9660;</span></h2>\n<div id="{cid}-list" class="chapter-toggle-list hidden">')
                toc.append(dict(id=cid, title=v, level=0))
                open_ch = True
            elif k in ("h2", "h3"):
                tag = "h3" if k == "h2" else "h4"
                sid = uid(slugify(v, 40))
                ch = by_title.get(norm(v))
                inner = f'<a href="#{ch}">{esc(v)}</a>' if ch and tag == "h4" else link_text(v)   # synopsis entries link to their chapter
                out.append(f'<{tag} id="{sid}">{inner}</{tag}>')
                if k == "h2":
                    toc.append(dict(id=sid, title=v, level=1))
            elif k == "img":
                imgs = v["imgs"]
                cls = "fig" + (" fig-row" if len(imgs) > 1 else "") + (" fig-float" if v.get("float") else "")
                tags = "".join(f'<img src="{i["src"]}" width="{i["w"]}" height="{i["h"]}" alt="" loading="lazy" decoding="async">' for i in imgs)
                out.append(f'<figure class="{cls}">{tags}</figure>')
            elif k == "quote":
                quote_buf.append(f"<p>{inline(self.runs(v['lines'], base_ital=True))}</p>")
            elif k == "ref":
                runs = self.runs(v["lines"])
                n = None
                if runs and runs[0][0] == "sup":
                    n = runs[0][1].strip(); runs = runs[1:]
                else:
                    m = re.match(r"\s*(\d+)\s+", runs[0][1]) if runs else None
                    if m:
                        n = m.group(1); runs[0] = (runs[0][0], runs[0][1][m.end():], runs[0][2])
                back = f' <a class="fn-back" href="#fnref-{n}" aria-label="Back to the text">&#8617;</a>' if n and f"fnref-{n}" in refs_seen else ""
                body = inline(runs)
                if not body:
                    continue
                if n:
                    ref_buf.append(f'<li id="fn-{n}" value="{n}">{body}{back}</li>')
                else:
                    ref_buf.append(f"<li class=\"nonum\">{body}</li>")
            else:
                cls = {"li": ' class="li"', "center": ' class="center"'}.get(k, "")
                body = inline(self.runs(v["lines"]))
                if body:
                    out.append(f"<p{cls}>{body}</p>")
        close_bufs()
        close_chapter()
        doc_html = "\n".join(out)
        # a superscript with no note to point at (ordinals like 21st, an exponent) stays a plain superscript
        have = set(re.findall(r'<li id="(fn-[^"]+)"', doc_html))
        doc_html = re.sub(r'<sup class="fn[^"]*"(?: id="[^"]+")?><a href="#([^"]+)">([^<]+)</a></sup>',
                          lambda m: m.group(0) if m.group(1) in have else f"<sup>{m.group(2)}</sup>", doc_html)
        return doc_html + "\n", toc

    def cover(self):
        """the printed title page -> cover.jpg (book page shape) for the Get-the-book box, og image and tiles"""
        p = self.doc[self.cfg["title_page"] - 1]
        pix = p.get_pixmap(dpi=200, alpha=False, clip=fitz.Rect(0, 0, p.rect.width, p.rect.height - 48))   # without the page number
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        if self.apply:
            os.makedirs(self.imgdir, exist_ok=True)
            im.save(os.path.join(self.imgdir, "cover-page.jpg"), "JPEG", quality=85, optimize=True, progressive=True)
        return im.size


def main():
    apply = "--apply" in sys.argv
    for slug, cfg in BOOKS.items():
        if not os.path.exists(cfg["pdf"]):
            print(slug, "MISSING PDF", cfg["pdf"]); continue
        b = Book(slug, cfg, apply)
        b.read()
        html_, toc = b.render()
        cs = b.cover()
        kinds = Counter(k for k, _ in b.blocks)
        print(f"{slug}: {len(b.doc)} pages (TOC pages dropped: {sorted(b.toc_pages)}), blocks {dict(kinds)}, "
              f"{sum(1 for t in toc if t['level'] == 0)} chapters, {sum(1 for t in toc if t['level'] == 1)} sections, "
              f"{b.nimg} pictures ({b.img_bytes // 1024} KB), {len(html_) // 1024} KB html, cover {cs}")
        if apply:
            d = os.path.join(ROOT, "aj_books_src", slug)
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, "content.html"), "w", encoding="utf-8").write(html_)
            json.dump(dict(toc=toc), open(os.path.join(d, "toc.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    if not apply:
        print("dry run (pass --apply to write)")


if __name__ == "__main__":
    main()
