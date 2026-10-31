#!/usr/bin/env python3
"""Ad-free guard for the AdSense loaders (mes.fm/premium: 1 HBD a month, paid on the Hive blockchain).

When a visitor has paid, mes.fm/premium writes localStorage "mes-adfree" = {"user", "until" (ms), "how", "checked", "off"?}.
This script makes every AdSense loader respect it: while `until` is in the future (and the visitor has not pressed "Show
ads again", which sets off: true) adsbygoogle.js is never requested, so no Auto ads, no consent banner, no ad units; the
loader adds class "mes-adfree" to <html> instead. main_js/aside.js and main_js/bottom-ad.js do their own check (no ad
slot, no bottom box) and main_js/site-search.js re-checks the payment once a day through /api/premium (expired -> ads back).

Two loader forms exist:
  1. the ADSENSE-DEFERRED block (optimize_pagespeed.py's ADSENSE_NEW, on ~1,470 pages, the root templates
     hive_mirror_template.html / math_qa_mirror_template.html / tool_page_template.html, cubic-formula/child-template.html and
     22 build.mjs generators): the guard goes first inside its IIFE, marked MES-ADFREE.
  2. a plain <script async src="...adsbygoogle.js?client=..."> tag (3 hand-made pages): swapped for a tiny guarded loader.
optimize_pagespeed.py's ADSENSE_NEW is patched too, so re-running that script keeps the guard.

Idempotent (MES-ADFREE marker). Dry-runs by default; -v lists every file; --apply writes.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MARK = "MES-ADFREE"
GUARD = ("      /* MES-ADFREE: paid ad-free on mes.fm/premium (localStorage mes-adfree = {user, until}): never load AdSense */\n"
         "      try { var af = JSON.parse(localStorage.getItem('mes-adfree') || 'null'); if (af && !af.off && +af.until > Date.now()) "
         "{ document.documentElement.classList.add('mes-adfree'); return; } } catch (e) {}\n")
BLOCK_RE = re.compile(r"(<!-- ADSENSE-DEFERRED:.*?<script>\s*\(function \(\) \{\n)", re.S)
CLIENT = "ca-pub-1461238060884369"
PLAIN_RE = re.compile(r'<script async src="https://pagead2\.googlesyndication\.com/pagead/js/adsbygoogle\.js\?client=' + CLIENT +
                      r'"\s*(?:crossorigin="anonymous")?\s*></script>')
PLAIN_NEW = ("<script>/* " + MARK + " guarded AdSense loader (see add_adfree_guard.py) */(function () {\n" + GUARD +
             "      var s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous';\n"
             "      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + CLIENT + "';\n"
             "      document.head.appendChild(s);\n    })();</script>")
SKIP = ("/_http", "/node_modules/", "/percentagecalculator-app/", "/.git/", "/.claude/")
EXT = (".html", ".mjs", ".py")


def patch(text):
    n = 0
    if "ADSENSE-DEFERRED" in text:
        def add(m):
            nonlocal n
            tail = text[m.end():m.end() + 400]
            if MARK in tail.split("function go")[0]:
                return m.group(1)
            n += 1
            return m.group(1) + GUARD
        text = BLOCK_RE.sub(add, text)
    text, k = PLAIN_RE.subn(PLAIN_NEW, text)
    return text, n + k


def files():
    for dp, dn, fn in os.walk(ROOT):
        rel = "/" + os.path.relpath(dp, ROOT).replace(os.sep, "/") + "/"
        if any(s in rel for s in SKIP):
            dn[:] = []
            continue
        for f in fn:
            if f.endswith(EXT) and f != os.path.basename(__file__):
                yield os.path.join(dp, f)


def main(argv):
    apply, verbose = "--apply" in argv, "-v" in argv
    changed = blocks = 0
    for p in files():
        try:
            with open(p, encoding="utf-8", errors="surrogateescape") as f:
                old = f.read()
        except OSError:
            continue
        if "adsbygoogle" not in old:
            continue
        new, n = patch(old)
        if new == old:
            continue
        changed += 1
        blocks += n
        if verbose:
            print("  %-70s %d loader(s)" % (os.path.relpath(p, ROOT), n))
        if apply:
            with open(p, "w", encoding="utf-8", errors="surrogateescape") as f:
                f.write(new)
    print("%d files, %d loaders guarded%s" % (changed, blocks, "" if apply else "  (dry run: --apply writes)"))


if __name__ == "__main__":
    main(sys.argv[1:])
