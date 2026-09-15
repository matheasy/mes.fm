#!/usr/bin/env python3
"""Reorder the main mes.fm site nav to: Math Tutorials, Calculators, Tools,
Mobile Apps, Puzzles, Memes (was: Puzzles, Memes, Math Tutorials,
Calculators, Tools, Mobile Apps).

Touches two places per page:
  - the header "info-bar" (6 flat <li> items)
  - the "burger"/side navbar (Puzzles/Memes/Math Tutorials as flat <li>s,
    Calculators/Tools as dropdown <li>s with a nested <ul> of sub-items;
    Mobile Apps has no navbar entry -- it was removed repo-wide by
    remove_dead_appstore_links.py, a <!-- MOBILE-APPS-DROPDOWN-REMOVED -->
    comment marks where it used to be -- so the navbar target order is just
    Math Tutorials, Calculators, Tools, Puzzles, Memes)

Only touches mes.fm's own "full site" pages (the ones carrying this whole
6-item nav -- articles, memes/puzzles pages, tools.html, calculators.html,
etc.), not the calculator/tool mini-sites under mes.fm/<slug>/ (speedreader,
timer, gradecalculator, ...), which carry their own reduced Home/Contact-Us
nav and are untouched.

Extracts each item's own <li>...</li> verbatim (so any per-file attribute
quirks survive) and splices them back in the new order at the position the
first one occupied. Idempotent: a file already in the new order is a no-op.
Skips (reports, does not touch) any file where the items aren't cleanly
contiguous, rather than guessing.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()

TARGET_ORDER = ["Math Tutorials", "Calculators", "Tools", "Mobile Apps", "Puzzles", "Memes"]
NAVBAR_TARGET_ORDER = ["Math Tutorials", "Calculators", "Tools", "Puzzles", "Memes"]  # no Mobile Apps entry

HREF = {
    "Puzzles": r"/puzzles",
    "Memes": r"/memes",
    "Math Tutorials": r"https://mes\.fm/math",
    "Calculators": r"/calculators",
    "Tools": r"/tools",
    "Mobile Apps": r"/mobile-apps",
}


def flat_li_span(s, class_name, label, href_pat):
    """<li class="CLASS..."><a ...href='HREF'...>LABEL</a></li> -- no nesting."""
    pat = re.compile(
        r'<li class="' + re.escape(class_name) + r'[^"]*">'
        r"<a[^>]*href=['\"]" + href_pat + r"['\"][^>]*>" + re.escape(label) + r"</a></li>"
    )
    m = pat.search(s)
    return (m.start(), m.end()) if m else None


def dropdown_li_span(s, label):
    """<li class="navbar__item"><span class="navbar__link navbar__link--dropdown">
    LABEL<span class="dropdown-symbol">...</span></span><ul ...>...many nested <li>...
    </ul></li> -- balanced-scan the nested <li>/</li> to find the true close."""
    m = re.search(
        r'<li class="navbar__item"><span class="navbar__link navbar__link--dropdown">'
        + re.escape(label) + r"<span",
        s,
    )
    if not m:
        return None
    start = m.start()
    i = start
    depth = 0
    n = len(s)
    while i < n:
        if s.startswith("<li", i) and (i + 3 == n or not (s[i + 3].isalnum() or s[i + 3] == "-")):
            depth += 1
            i += 3
        elif s.startswith("</li>", i):
            depth -= 1
            i += 5
            if depth == 0:
                return (start, i)
        else:
            i += 1
    return None


def splice(s, spans_by_label, order):
    """Given {label: (start,end)} and a target label order, cut every span's
    text out, verify only whitespace is left between the min/max bound, and
    reinsert the texts (in `order`) at the original leading position."""
    spans = [spans_by_label[l] for l in order]
    lo = min(a for a, _ in spans)
    hi = max(b for _, b in spans)
    texts = {l: s[a:b] for l, (a, b) in spans_by_label.items()}
    # rebuild the [lo, hi) region: original bytes, minus each matched span,
    # must be pure whitespace (i.e. the items are contiguous, nothing else
    # interleaved) -- otherwise bail rather than risk corrupting the page
    cursor = lo
    leftover = []
    for a, b in sorted(spans, key=lambda x: x[0]):
        leftover.append(s[cursor:a])
        cursor = b
    leftover.append(s[cursor:hi])
    if any(chunk.strip() for chunk in leftover):
        return None
    new_region = "".join(texts[l] for l in order)
    return s[:lo] + new_region + s[hi:]


def process(path):
    s = path.read_text(encoding="utf-8", errors="surrogateescape")
    orig = s
    changed = False

    # ---- info-bar ----
    info_spans = {}
    for label in TARGET_ORDER:
        span = flat_li_span(s, "info-bar__item", label, HREF[label])
        if not span:
            return "SKIP: info-bar item not found: " + label
        info_spans[label] = span
    # already in the target order? (Math Tutorials now precedes Puzzles)
    if info_spans["Math Tutorials"][0] > info_spans["Puzzles"][0]:
        new_s = splice(s, info_spans, TARGET_ORDER)
        if new_s is None:
            return "SKIP: info-bar items not contiguous"
        s = new_s
        changed = True

    # ---- burger/navbar ---- (re-locate: the info-bar edit shifted offsets)
    nav_spans = {}
    for label in ("Puzzles", "Memes", "Math Tutorials"):
        span = flat_li_span(s, "navbar__item", label, HREF[label])
        if not span:
            return "SKIP: navbar item not found: " + label
        nav_spans[label] = span
    for label in ("Calculators", "Tools"):
        span = dropdown_li_span(s, label)
        if not span:
            return "SKIP: navbar dropdown not found: " + label
        nav_spans[label] = span
    if nav_spans["Math Tutorials"][0] > nav_spans["Puzzles"][0]:
        new_s = splice(s, nav_spans, NAVBAR_TARGET_ORDER)
        if new_s is None:
            return "SKIP: navbar items not contiguous"
        s = new_s
        changed = True

    if not changed:
        return "already-ordered"
    if s == orig:
        return "no-op"
    path.write_text(s, encoding="utf-8", errors="surrogateescape")
    return "reordered"


def main():
    results = {}
    for p in sorted(ROOT.rglob("*.html")):
        if "node_modules" in p.parts or "_http_" in p.parts or "_https_" in p.parts:
            continue
        s = p.read_text(encoding="utf-8", errors="surrogateescape")
        if "info-bar__item\">" not in s or "Puzzles</a>" not in s:
            continue  # not a "full nav" page (a mini-site, a redirect stub, etc.)
        status = process(p)
        results.setdefault(status, []).append(str(p.relative_to(ROOT)))

    for status in sorted(results):
        files = results[status]
        print(f"{status}: {len(files)}")
        if status.startswith("SKIP") or status == "no-op":
            for f in files:
                print("   ", f)


if __name__ == "__main__":
    main()
