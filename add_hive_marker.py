#!/usr/bin/env python3
"""Mark every mes.fm page that mirrors a Hive post with <meta name="mes:hive" content="author/permlink">.

main_js/comments.js reads that meta to turn the Comments block into two tabs, "Comments" (FastComments) and "Hive comments
(N)" (the replies of the original Hive post, main_js/hive-comments.js). Without the meta it falls back to finding the source
link at runtime, so the meta is the reliable path, and this script is how pages get it.

A page qualifies when it has the Comments block (id="comments-box") and a link to a single Hive post (peakd.com, hive.blog,
ecency.com, inleo.io incl. /threads/view/, leofinance.io, 3speak.tv/watch) in one of the places the mirror shells put the
source: the "mirrored from the Hive blockchain" subtitle (.page-subtitle), the "Originally posted on the Hive blockchain"
link (a.source-link), or a "Hive article: / Hive post:" list item. Hub / list pages never match (their Hive links are list
items without those labels). The meta goes right before </head>; a page whose source changed gets its meta updated.

Generators: build_math_qa_mirrors.py, convert_mirror_pages.py and build_em304_article.py call mark_html() on what they
write; the single-post build.mjs pages (911-alchemy, djw, ferrocell-specular-reflection, hutchison-tom-sky,
norman-patricia-ai-email, vector-functions-problems-plus, cubic-formula) end their build by running
`python3 add_hive_marker.py --apply --only=<their slugs>`. Templates (hive_mirror_template.html, math_qa_mirror_template.html,
cubic-formula/child-template.html) need nothing: the subtitle they are filled with carries the source link.

Idempotent. Dry-runs by default; -v lists every page; --apply writes; --only=slug,slug limits it.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))      # the checkout this script lives in (works in a git worktree too)
SITE = os.path.join(ROOT, "mes.fm")

URL_RE = re.compile(
    r"^https?://(?:www\.)?(?:peakd\.com|hive\.blog|ecency\.com|inleo\.io|leofinance\.io)/(?:threads/view/|[a-z0-9-]+/)?@?"
    r"([a-z][a-z0-9.-]{2,15})/([a-z0-9-]{1,255})/?(?:[?#].*)?$", re.I)
URL_3S = re.compile(r"^https?://(?:www\.)?3speak\.tv/watch\?v=([a-z][a-z0-9.-]{2,15})/([a-z0-9-]{1,255})", re.I)
A_RE = re.compile(r'<a\b([^>]*)>(.*?)</a\s*>', re.S | re.I)
HREF_RE = re.compile(r'\bhref\s*=\s*"([^"]*)"', re.I)
META_RE = re.compile(r'[ \t]*<meta name="mes:hive" content="[^"]*">\n?')
SUB_RE = re.compile(r'<div class="page-subtitle"[^>]*>(.*?)</div>', re.S)
LI_RE = re.compile(r'<li>\s*Hive (?:article|post)\s*:\s*(.*?)</li>', re.S | re.I)
SKIP_PARTS = ("_http", "node_modules", "percentagecalculator-app", "/extension/")


def parse_url(u):
    u = (u or "").replace("&amp;", "&").strip()
    m = URL_RE.match(u) or URL_3S.match(u)
    if not m:
        return None
    a, p = m.group(1).lower(), m.group(2).lower()
    if a.endswith(".") or ".." in a:
        return None
    return a + "/" + p


def _first(fragment):
    for m in A_RE.finditer(fragment):
        h = HREF_RE.search(m.group(1))
        if h:
            got = parse_url(h.group(1))
            if got:
                return got
    return None


def find_source(html):
    """author/permlink of the Hive post this page mirrors, or None."""
    if 'id="comments-box"' not in html:
        return None
    body = re.sub(r"<aside\b.*?</aside>", "", html, flags=re.S)
    body = re.sub(r'<div id="footer".*', "", body, flags=re.S)
    for m in SUB_RE.finditer(body):
        got = _first(m.group(1))
        if got:
            return got
    for m in A_RE.finditer(body):
        attrs, text = m.group(1), re.sub(r"<[^>]+>", "", m.group(2))
        if 'class="source-link"' in attrs or re.search(r"originally (posted|published) on (the )?hive", text, re.I):
            h = HREF_RE.search(attrs)
            got = h and parse_url(h.group(1))
            if got:
                return got
    for m in LI_RE.finditer(body):
        got = _first(m.group(1))
        if got:
            return got
    return None


def mark_html(html):
    """Return (new_html, source or None). Adds / updates / leaves the meta; never removes a hand-set one."""
    src = find_source(html)
    if not src:
        return html, None
    tag = '<meta name="mes:hive" content="%s">' % src
    base = META_RE.sub("", html)
    i = base.find("</head>")
    if i < 0:
        return html, None
    pre = base[:i]
    if not pre.endswith("\n"):
        pre += "\n"
    return pre + "  " + tag + "\n" + base[i:], src      # on its own line, right before </head>


def pages(only=None):
    for dirpath, dirnames, filenames in os.walk(SITE):
        rel = os.path.relpath(dirpath, SITE)
        if any(s in "/" + rel + "/" for s in SKIP_PARTS):
            dirnames[:] = []
            continue
        for fn in filenames:
            if not fn.endswith(".html") or "template" in fn:
                continue
            path = os.path.join(dirpath, fn)
            slug = rel.split(os.sep)[0] if rel != "." else fn[:-5]
            if only and slug not in only:
                continue
            yield path


def main(argv):
    apply = "--apply" in argv
    verbose = "-v" in argv
    only = None
    for a in argv:
        if a.startswith("--only="):
            only = {s.strip().strip("/") for s in a[7:].split(",") if s.strip()}
    added = updated = same = 0
    for path in pages(only):
        with open(path, encoding="utf-8", errors="surrogateescape") as f:
            html = f.read()
        new, src = mark_html(html)
        if not src:
            continue
        rel = os.path.relpath(path, SITE)
        if new == html:
            same += 1
            if verbose:
                print("  ok      %-55s %s" % (rel, src))
            continue
        kind = "updated" if 'name="mes:hive"' in html else "added"
        if kind == "added":
            added += 1
        else:
            updated += 1
        print("  %-7s %-55s %s" % (kind, rel, src))
        if apply:
            with open(path, "w", encoding="utf-8", errors="surrogateescape") as f:
                f.write(new)
    print("\n%d added, %d updated, %d already marked%s" % (added, updated, same, "" if apply else "  (dry run: --apply writes)"))


if __name__ == "__main__":
    main(sys.argv[1:])
