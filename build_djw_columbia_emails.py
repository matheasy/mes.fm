#!/usr/bin/env python3
"""Build mes.fm/djw-columbia-emails (HTML) and the PDF behind mes.fm/djw-columbia-emails-pdf (2026-11-04).

The emails between MES and Dr. Judy Wood about the Space Shuttle Columbia disaster, oldest first. The text lives in
djw_columbia_emails_src/emails.py (copied from Gmail; edit it there, never in the generated page); the pictures sent with
them are in mes.fm/djw-columbia-emails/img/.
Both pages are deliberately hidden: noindex (meta + X-Robots-Tag header in vercel.json, which also covers the PDF file),
so build_sitemap.py / build_search_index.py skip them; no ads, no comments, no rating row, no sidebar cards.
  python3 build_djw_columbia_emails.py            dry run
  python3 build_djw_columbia_emails.py --apply    writes the HTML page and the PDF (headless Google Chrome)
then  python3 build_pdf_page.py --only djw-columbia-emails-pdf --apply  (re)writes the PDF page."""
import argparse, datetime, html, re, subprocess, sys, tempfile
from pathlib import Path
R = Path(__file__).resolve().parent; SITE = R / "mes.fm"; SLUG = "djw-columbia-emails"
sys.path.insert(0, str(R / "djw_columbia_emails_src"))
from emails import EMAILS
PDF_DIR = SITE / (SLUG + "-pdf"); PDF_NAME = "djw-columbia-emails.pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TITLE = "Dr. Judy Wood and MES: the Space Shuttle Columbia Emails"
SUB = "Emails between Dr. Judy Wood and Mathiew Estepho (MES), September 19 to October 31, 2026, oldest first"

URL = re.compile(r"https?://[^\s<>\"]+[^\s<>\".,;:!?)\]]")
def text_html(s):
    out = []
    for para in s.strip().split("\n\n"):
        lines = []
        for ln in para.split("\n"):
            e = html.escape(ln, quote=False)
            e = URL.sub(lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>' % (html.unescape(m.group(0)), m.group(0)), e)
            e = e.replace("[...]", '<span class="em-cut">[&hellip;]</span>')
            lines.append(e)
        out.append("<p>" + "<br>\n".join(lines) + "</p>")
    return "\n".join(out)

def when(t):
    d = datetime.datetime.strptime(t, "%Y-%m-%d %H:%M")
    return d.strftime("%a, %b ") + str(d.day) + d.strftime(", %Y at ") + d.strftime("%I:%M %p").lstrip("0")

def article(img_prefix):
    n = sum(1 for e in EMAILS if "t" in e)
    full = sum(1 for e in EMAILS if e.get("kind") == "full")
    a = ['<div class="em-intro">',
         '<p>These are the emails between <b>Dr. Judy Wood</b> and me (<b>Mathiew Estepho, MES</b>) about the <b>Space Shuttle Columbia disaster</b> '
         'and the EM 304 test problem she gave her students at Clemson University on February 6, 2003, five days after Columbia was lost. '
         'They are in the order they were sent, from September 19 to October 31, 2026 (times are Pacific time).</p>',
         '<p>%d emails: %d in full, and %d short <b>excerpts</b> from emails about other things that also mention the shuttle video '
         '(<span class="em-cut">[&hellip;]</span> marks what was left out). The text is as written; quoted replies and signatures are left out.</p>' % (n, full, n - full),
         '<p>The video and notes: <a href="/space-shuttle-columbia">mes.fm/space-shuttle-columbia</a> &middot; Dr. Wood\'s test: '
         '<a href="/em-304-problem-1-judy-wood">mes.fm/em-304-problem-1-judy-wood</a> &middot; These emails as a PDF: '
         '<a href="/%s-pdf">mes.fm/%s-pdf</a></p>' % (SLUG, SLUG), '</div>']
    for i, e in enumerate(EMAILS):
        if "gap" in e:
            a.append('<p class="em-gap">%s</p>' % html.escape(e["gap"])); continue
        who = "judy" if e["fr"].startswith("Dr.") else "mes"
        head = ['<div class="em-from">%s</div>' % html.escape(e["fr"]),
                '<div class="em-date">%s</div>' % when(e["t"]),
                '<div class="em-meta">To: %s%s</div>' % (html.escape(e["to"]), ("<br>Cc: " + html.escape(e["cc"])) if e.get("cc") else ""),
                '<div class="em-subj">%s%s</div>' % (html.escape(e["subj"]), ' <span class="em-tag">excerpt</span>' if e["kind"] == "excerpt" else "")]
        body = text_html(e["body"])
        if e.get("note"): body = '<p class="em-note">%s</p>\n' % html.escape(e["note"]) + body
        for f, cap in e.get("img", []):
            body += '\n<figure class="em-fig"><img src="%s%s" alt="%s" loading="lazy"><figcaption>%s</figcaption></figure>' % (img_prefix, f, html.escape(cap), html.escape(cap))
        for name, size, href, cap in e.get("att", []):
            body += '\n<div class="em-att"><b>Attachment:</b> <a href="%s">%s</a> (%s). %s.</div>' % (href, html.escape(name), size, html.escape(cap))
        a.append('<section class="em em-%s" id="e%d"><div class="em-head">%s</div><div class="em-body">%s</div></section>' % (who, i + 1, "".join(head), body))
    return "\n".join(a)

CSS = """    .em-intro { margin-bottom: 1.4em; }
    .em { border: 1px solid #d0d7de; border-left: 5px solid #1a73e8; border-radius: 8px; margin: 0 0 1.2em; background: #fff; overflow: hidden; }
    .em.em-mes { border-left-color: #0f766e; }
    .em-head { padding: 0.7em 1em; background: #f3f6fa; border-bottom: 1px solid #d0d7de; display: grid; grid-template-columns: 1fr auto; gap: 0.15em 1em; }
    .em-from { font-weight: 700; }
    .em-date { color: #555; font-size: 0.9em; text-align: right; }
    .em-meta { grid-column: 1 / -1; color: #555; font-size: 0.85em; }
    .em-subj { grid-column: 1 / -1; font-weight: 600; }
    .em-tag { display: inline-block; font-size: 0.75em; font-weight: 600; padding: 0.05em 0.5em; border-radius: 99px; background: #fff4d6; color: #7a5300; border: 1px solid #e8c766; vertical-align: middle; }
    .em-body { padding: 0.4em 1em 0.6em; overflow-wrap: anywhere; }
    .em-body p { margin: 0.6em 0; }
    .em-cut { color: #777; }
    .em-note { font-style: italic; color: #555; }
    .em-gap { text-align: center; color: #666; font-style: italic; font-size: 0.92em; margin: -0.4em 0 1.2em; }
    .em-fig { margin: 0.8em 0; }
    .em-fig img { max-width: 100%; height: auto; border: 1px solid #d0d7de; border-radius: 6px; display: block; }
    .em-fig figcaption { font-size: 0.85em; color: #555; margin-top: 0.3em; }
    .em-att { margin: 0.8em 0 0.3em; padding: 0.6em 0.8em; border: 1px dashed #9aa4af; border-radius: 6px; font-size: 0.92em; }
    body.dark .em, body.dark-mode .em { background: #1e1e1e; border-color: #3a3f45; }
    body.dark .em-head, body.dark-mode .em-head { background: #262b31; border-color: #3a3f45; }
    body.dark .em-date, body.dark .em-meta, body.dark .em-note, body.dark .em-gap, body.dark .em-fig figcaption, body.dark .em-cut,
    body.dark-mode .em-date, body.dark-mode .em-meta, body.dark-mode .em-note, body.dark-mode .em-gap, body.dark-mode .em-fig figcaption, body.dark-mode .em-cut { color: #b8c0c8; }
    body.dark .em-tag, body.dark-mode .em-tag { background: #4a3a10; color: #ffe08a; border-color: #8a6d1d; }
    body.dark .em-att, body.dark-mode .em-att { border-color: #5a6470; }
"""
PAGE3_HEAD = ('<!-- HUB-THEATRE-HEAD --><link rel="stylesheet" href="/main_js/hub-theatre.css?v=1"><script>try{var m=localStorage.getItem("pageMode")||"wide",'
              'c=document.documentElement.classList;if(m==="theatre")c.add("page-theatre");if(m!=="std")c.add("page-wide")}catch(e){}</script><!-- /HUB-THEATRE-HEAD -->')

def page():
    t = (R / "hive_mirror_template.html").read_text(encoding="utf-8")
    t = t.replace("@@VIDEO_SCRIPTS@@", "").replace("</style>", CSS + "</style>", 1)
    t = re.sub(r"\s*<!-- ADSENSE-DEFERRED:.*?</script>", "", t, count=1, flags=re.S)                 # private: no ads
    t = re.sub(r"\s*<!-- FASTCOMMENTS-BLOCK.*?comments\.js[^>]*></script>", "", t, count=1, flags=re.S)  # ... and no comments
    assert "adsbygoogle" not in t and "comments-box" not in t
    t = t.replace('<link rel="canonical"', '<meta name="robots" content="noindex, nofollow">\n  ' + PAGE3_HEAD + '\n  <link rel="canonical"', 1)
    t = t.replace("<html lang=\"en\">", '<html lang="en" data-no-rating>', 1)
    t = t.replace("</body>", '<div data-page-modes="3" hidden></div>\n<script src="/main_js/hub-theatre.js?v=2" defer></script>\n</body>', 1)
    desc = "Emails between Dr. Judy Wood and MES about the Space Shuttle Columbia disaster and her EM 304 test of February 6, 2003, in the order they were sent."
    for k, v in {"@@SLUG@@": SLUG, "@@TITLE@@": html.escape(TITLE, quote=False), "@@SUBTITLE@@": SUB, "@@DESC@@": html.escape(desc),
                 "@@OGIMAGE@@": "https://mes.fm/space-shuttle-columbia/img/share.jpg",
                 "@@PARTOF@@": 'Part of <a href="/space-shuttle-columbia">Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster</a> &middot; <a href="/%s-pdf">PDF version</a>' % SLUG,
                 "@@BRAND_HREF@@": "/", "@@BRAND_LOGO@@": "/img/logo-mark.png", "@@BRAND_LOGO_ABS@@": "https://mes.fm/img/logo-mark.png", "@@BRAND_TITLE@@": "MES.fm",
                 "@@BRAND_TAG@@": "Videos, tutorials, calculators and research by Math Easy Solutions.",
                 "@@COMPACT_MATH_LINK@@": '<li><a href="/math" tabindex="-1">Math Tutorials</a></li>', "@@ARTICLE@@": article("/%s/img/" % SLUG)}.items():
        t = t.replace(k, v)
    assert "@@" not in t
    return t

def print_html():
    body = article((SITE / SLUG / "img").as_uri() + "/")
    body = body.replace('href="/', 'href="https://mes.fm/')
    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>%s</title><style>
@page { size: Letter; margin: 16mm 15mm 18mm; }
body { font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #111; }
h1 { font: 700 20pt/1.2 Helvetica, Arial, sans-serif; margin: 0 0 0.2em; } .sub { font: 11pt Helvetica, Arial, sans-serif; color: #444; margin: 0 0 1.2em; }
a { color: #1a5fb4; }
%s
.em { break-inside: auto; } .em-head { break-after: avoid; font-family: Helvetica, Arial, sans-serif; } .em-fig { break-inside: avoid; } .em-fig img { max-height: 120mm; width: auto; }
</style></head><body><h1>%s</h1><p class="sub">%s</p>%s
<p class="sub" style="margin-top:2em">Published at mes.fm/%s</p></body></html>""" % (html.escape(TITLE), CSS.replace("    ", ""), html.escape(TITLE), SUB, body, SLUG)

ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); a = ap.parse_args()
out = SITE / SLUG / "index.html"; pg = page()
print("emails:", sum(1 for e in EMAILS if "t" in e), "->", out, "(%d bytes)" % len(pg))
if not a.apply: print("dry run (use --apply)"); sys.exit()
out.parent.mkdir(exist_ok=True); out.write_text(pg, encoding="utf-8"); print("wrote", out)
PDF_DIR.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as td:
    p = Path(td) / "emails.html"; p.write_text(print_html(), encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files",
                    "--print-to-pdf=" + str(PDF_DIR / PDF_NAME), p.as_uri()], check=True, capture_output=True)
print("wrote", PDF_DIR / PDF_NAME, (PDF_DIR / PDF_NAME).stat().st_size, "bytes")
