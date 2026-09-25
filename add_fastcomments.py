#!/usr/bin/env python3
"""Repo-wide FastComments pass for mes.fm. Idempotent; DRY-RUNS by default (`--apply` writes).

Two jobs, both keyed on the shared markup

    <div id="comments-button" ...>Comments</div>
    <div id="comments-box"><div id="fastcomments-widget"></div></div>

1. CONVERT -- the ~1,017 calculator / meme / tool pages that already carry a Comments toggle used a
   `class="button"` bar with a rotating up/down arrow (&#9660;/&#9650;) that main.js flipped. They now use the same
   `hide-div-button button selected` bar as "Important Notes" / "more calculations" on
   mes.fm/percentagecalculator: a filled blue bar while the comments are shown, outlined while collapsed, no
   arrows, toggled by main.js's generic `.hide-div-button` handler (the arrow-only handler was removed from
   main.js). `main.js?v=1.0.3` is bumped to `1.0.4` on those pages so a cached copy of the old handler can't
   double-toggle against the new markup.

2. ADD -- the Hive-mirror / math / list / tool pages under mes.fm/ that had no comments at all get the block
   below, which is toggled + lazy-loaded by mes.fm/main_js/comments.js (self-contained, so it works on the many
   standalone pages that don't load main.js/jQuery). Each page family has its own insertion anchor (see
   STRATEGIES); the generators' templates (`build.mjs`, `cubic-formula/child-template.html`,
   `math_qa_mirror_template.html`) get the same block so a rebuild doesn't drop it. Pages no strategy matches are
   reported, never touched -- that is how contact/privacy/donate/stats and the HTTrack `_https_` captures stay
   comment-free.

Run `python3 add_fastcomments.py` (dry run, `-v` lists every file) and `--apply` once the report looks right.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv

MARKER = "FASTCOMMENTS-BLOCK"

# ---------------------------------------------------------------- 1. CONVERT
OLD_BAR = re.compile(
    r'<div id="comments-button" class="button(?: button--active)?"(?: style="position:relative;")?>'
    r'([^<]*)(?:<span class="dropdown-symbol"[^>]*>(?:&#9660;|&#9650;)</span>)?</div>')
NEW_BAR = r'<div id="comments-button" class="hide-div-button button selected">\1</div>'
MAIN_JS_OLD, MAIN_JS_NEW = "main_js/main.js?v=1.0.3", "main_js/main.js?v=1.0.4"


def convert(text):
    new, n = OLD_BAR.subn(NEW_BAR, text)
    if n:
        new = new.replace(MAIN_JS_OLD, MAIN_JS_NEW)
    return new, n


# ---------------------------------------------------------------- 2. ADD
def block(indent, wrap=False):
    inner = [
        '<div id="comments-button" class="mes-comments-toggle selected">Comments</div>',
        '<div id="comments-box"><div id="fastcomments-widget"></div></div>',
        '<script src="/main_js/comments.js?v=1.0.0" defer></script>',
    ]
    lines = ["<!-- %s: Comments toggle + lazy FastComments widget, see main_js/comments.js -->" % MARKER]
    if wrap:
        lines.append('<div class="mes-comments-wrap">')
        lines += ["  " + l for l in inner]
        lines.append("</div>")
    else:
        lines += inner
    return "\n".join(indent + l for l in lines) + "\n"


def strat_article(text, wrap):
    """Standalone Hive-mirror pages: right after the (single) </article>."""
    if text.count("</article>") != 1:
        return None
    m = re.search(r"</article>[ \t]*\n", text)
    if not m:
        return None
    return m.end(), "    ", "\n"


def strat_postbody(text, wrap):
    """build.mjs-style Hive mirrors: after the post-body div, before <hr> + 'Originally published on Hive' link."""
    ms = list(re.finditer(
        r'(</div>[ \t]*\n)([ \t]*\n)?([ \t]*<hr>[ \t]*\n[ \t]*\n?[ \t]*<a class="(?:peakd-link|source-link)"[^>]*>Originally published)',
        text))
    if len(ms) != 1:
        return None
    return ms[0].end(1), "    ", "\n"


def strat_hub(text, wrap):
    """mes.fm/math family (page-content > #main-content): after #main-content, before .page-content closes."""
    ms = list(re.finditer(r"(\n {8}</div>\n)( {6}</div>\n {4}</div>\n\s*\n {4}<!-- side bar -->)", text))
    if len(ms) != 1:
        return None
    return ms[0].end(1), "        ", "\n"


def strat_footer_id(text, wrap):
    """science-style: a sibling block right before <div id="footer">."""
    ms = list(re.finditer(r'\n( *)<div id="footer" class="footer"', text))
    if len(ms) != 1:
        return None
    return ms[0].start() + 1, "  ", "\n"


def strat_footer_tag(text, wrap):
    """list/tool pages: just before the single <footer>."""
    ms = list(re.finditer(r"\n([ \t]*)<footer\b", text))
    if len(ms) != 1:
        return None
    return ms[0].start() + 1, ms[0].group(1) or "  ", "\n"


def strat_sitefooter_hr(text, wrap):
    """moon: before the final <hr> that precedes the site-footer-note paragraph."""
    ms = list(re.finditer(r'\n([ \t]*<hr>[ \t]*\n[ \t]*\n[ \t]*<p class="site-footer-note">)', text))
    if len(ms) != 1:
        return None
    return ms[0].start() + 1, "    ", "\n"


def strat_bg(text, wrap):
    """bg: after the post-body div, before the .container closes."""
    ms = list(re.finditer(r"(\n {4}</div>\n)( {2}</div>\n\n {2}<script>)", text))
    if not ms:  # the first hit is the end of the post body; a later one sits inside a script's template string
        return None
    return ms[0].end(1), "    ", "\n"


# per-directory (under mes.fm/) overrides; anything else is tried against STRATEGIES in order
SPECIAL = {
    "science": (strat_footer_id, True),
    "conspiracy": (strat_footer_tag, True),
    "mathiew": (strat_footer_tag, True),
    "911djw": (strat_footer_tag, True),
    "crypto": (strat_footer_tag, True),
    "links": (strat_footer_tag, True),
    "gematria": (strat_footer_tag, True),
    "earth-curvature-calculator": (strat_footer_tag, True),
    "impermanent-loss-calculator": (strat_footer_tag, True),
    "unit-conversion": (strat_footer_tag, True),
    "moon": (strat_sitefooter_hr, False),
    "bg": (strat_bg, False),
}
STRATEGIES = [strat_article, strat_postbody, strat_hub]


def add(text, rel):
    """Returns (new_text or None, strategy name or reason)."""
    if MARKER in text or 'id="comments-button"' in text:
        return None, "already has comments"
    top = rel.parts[0] if len(rel.parts) > 1 else ""
    if rel.parts[:2] == ("cubic-formula", "child-template.html") or rel.name == "math_qa_mirror_template.html":
        top = ""
    cands = [SPECIAL[top]] if top in SPECIAL and rel.name in ("index.html", "build.mjs") else [(s, False) for s in STRATEGIES]
    for fn, wrap in cands:
        hit = fn(text, wrap)
        if hit:
            pos, indent, _ = hit
            return text[:pos] + block(indent, wrap) + "\n" + text[pos:], fn.__name__
    return None, "no strategy matched"


# ---------------------------------------------------------------- driver
def tracked(pattern):
    out = subprocess.run(["git", "ls-files", pattern], cwd=ROOT, capture_output=True, text=True).stdout
    return [ROOT / l for l in out.splitlines() if l]


def main():
    conv_files, conv_bars = 0, 0
    missing_css = []
    for p in tracked("mes.fm/*.html"):
        t = p.read_text(encoding="utf-8")
        new, n = convert(t)
        if not n:
            continue
        conv_files += 1
        conv_bars += n
        if not re.search(r"\.selected\s*\{", t) or not re.search(r"\.hide\s*\{", t):
            missing_css.append(p.relative_to(ROOT))
        if VERBOSE:
            print("convert", p.relative_to(ROOT))
        if APPLY:
            p.write_text(new, encoding="utf-8")
    print("CONVERT: %d bars in %d files%s" % (conv_bars, conv_files, "" if APPLY else " (dry run)"))
    if missing_css:
        print("  WARNING -- .selected/.hide CSS not found in:", *missing_css, sep="\n    ")

    targets = [p for p in tracked("mes.fm/*.html") if not re.search(r"/_https?_/", str(p))]
    targets += [ROOT / "mes.fm/cubic-formula/child-template.html", ROOT / "math_qa_mirror_template.html"]
    targets += tracked("mes.fm/*/build.mjs")
    seen, counts, unmatched = set(), {}, []
    for p in targets:
        if p in seen or not p.exists():
            continue
        seen.add(p)
        rel = p.relative_to(SITE) if SITE in p.parents else p.relative_to(ROOT)
        new, why = add(p.read_text(encoding="utf-8"), rel)
        if new is None:
            if why != "already has comments":
                unmatched.append(str(rel))
            continue
        counts[why] = counts.get(why, 0) + 1
        if VERBOSE:
            print("add    ", why, p.relative_to(ROOT))
        if APPLY:
            p.write_text(new, encoding="utf-8")
    print("ADD: %s%s" % (counts, "" if APPLY else " (dry run)"))
    print("Left alone (no strategy matched): %d" % len(unmatched))
    if VERBOSE or len(unmatched) < 60:
        for u in unmatched:
            print("   ", u)


if __name__ == "__main__":
    main()
