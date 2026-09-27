#!/usr/bin/env python3
"""Give every mirror page's video a Default / Wide / Theater view-mode toggle instead of the old
Default / Theater one, and stop Wide/Theater from floating over the "More like this" sidebar.

The old single "Theater Mode" button (full browser width, #videoEmbed/#theaterToggle, breaking out via
`left:50%;margin-left:-50vw`) visually overlapped the sticky sidebar on any page with one (add_sidebar.py /
add_sidebar_math.py's .has-aside/.mes-cols two-column layout): the video's breakout paints over the sidebar's
own grid column instead of sitting behind/beside it. Reported live on mes.fm/911truth-29-... (any Hive-mirror
page with a sidebar) in theater mode.

Fix, in two parts:
1. (This script) Duplicate the single button into two -- "Wide View" and "Theater Mode" -- and replace the
   boolean theater-mode IIFE with a 3-state one (default/wide/theater; only one active). Wide sets
   `body.video-wide`, Theater sets `body.video-theater` (and keeps `.theater-mode` on the video itself for
   its existing 100vw-breakout CSS) -- no new per-page CSS needed, since both buttons share the existing
   `.theater-toggle-btn` pill styling (positioned via an inline `style="top:...px"` to stack them).
2. main_js/aside.css (hand-edited once, not by this script) collapses `.has-aside`/`.mes-cols` to a single
   column whenever `body.video-wide` or `body.video-theater` is set, so the sidebar drops below the content
   instead of sharing a row with the widened video -- exactly like the page's own <1200px layout already
   does. Wide's width comes for free once that collapse happens (the video is already `width:100%` of its
   column); Theater's existing 100vw breakout is unaffected. A page with no sidebar simply doesn't have
   `.has-aside`/`.mes-cols` to collapse, so Wide there just matches the page's own width, no styling needed.

This only covers the single-video, ID-based pages (#videoEmbed/#theaterToggle) -- the vast majority. The
handful of multi-video pages (cubic-formula's own index.html and the Problems Plus generator's *intended*
delegated pattern) use a different, class-based (no id) button/JS shape and are fixed by hand where they
still matter; see CLAUDE.md.

Targets: every mes.fm/*/index.html this script finds the OLD button+JS pair in, plus the shared templates/
generators that produce future pages the same way (hive_mirror_template.html, math_qa_mirror_template.html,
mes.fm/cubic-formula/child-template.html, mes.fm/cubic-formula/build.mjs, build_math_qa_mirrors.py).

Idempotent (checks for the new `id="wideToggle"` first); dry-runs by default, `--apply` writes.
"""
import argparse
import glob
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

OLD_BUTTON = '        <button class="theater-toggle-btn" id="theaterToggle" type="button" aria-pressed="false">Theater Mode</button>'
NEW_BUTTON = (
    '        <button class="theater-toggle-btn" id="wideToggle" type="button" aria-pressed="false" style="top:46px;">Wide View</button>\n'
    '        <button class="theater-toggle-btn" id="theaterToggle" type="button" aria-pressed="false" style="top:82px;">Theater Mode</button>'
)

OLD_JS_RE = re.compile(
    r"    // theater-mode: expands the video embed to the full browser width \(breaking out of\n"
    r"    // the \.container's 760px max-width\), like YouTube's theater mode\. Height is capped at\n"
    r"    // min\(85vh, 56\.25vw\) so ultra-wide viewports don't get a comically tall player\.\n"
    r"    \(function \(\) \{\n"
    r"      var embed = document\.getElementById\('videoEmbed'\);\n"
    r"      var toggle = document\.getElementById\('theaterToggle'\);\n"
    r"\n"
    r"      function setTheater\(on\) \{\n"
    r"        embed\.classList\.toggle\('theater-mode', on\);\n"
    r"        toggle\.textContent = on \? 'Default View' : 'Theater Mode';\n"
    r"        toggle\.setAttribute\('aria-pressed', on \? 'true' : 'false'\);\n"
    r"        // AdSense's side rail ads only re-check google-side-rail-overlap exclusion\n"
    r"        // zones on scroll/resize, not on a plain class-driven layout change, so nudge\n"
    r"        // it to recompute once the width/height transition above has settled\.\n"
    r"        setTimeout\(function \(\) \{\n"
    r"          window\.dispatchEvent\(new Event\('resize'\)\);\n"
    r"        \}, 300\);\n"
    r"      \}\n"
    r"\n"
    r"      toggle\.addEventListener\('click', function \(\) \{\n"
    r"        setTheater\(!embed\.classList\.contains\('theater-mode'\)\);\n"
    r"      \}\);\n"
    r"\n"
    r"      document\.addEventListener\('keydown', function \(e\) \{\n"
    r"        if \(e\.key === 'Escape' && embed\.classList\.contains\('theater-mode'\)\) \{\n"
    r"          setTheater\(false\);\n"
    r"        \}\n"
    r"      \}\);\n"
    r"    \}\)\(\);"
)

NEW_JS = """    // view-mode: Default / Wide (fills the page width -- the "More like this" sidebar moves below,
    // see main_js/aside.css) / Theater (fills the browser width, like YouTube's theater mode; also
    // moves the sidebar below). Height is capped at min(85vh, 56.25vw) in theater mode so ultra-wide
    // viewports don't get a comically tall player. Only one mode is active at a time.
    (function () {
      var embed = document.getElementById('videoEmbed');
      var wideBtn = document.getElementById('wideToggle');
      var theaterBtn = document.getElementById('theaterToggle');
      if (!embed || !wideBtn || !theaterBtn) return;
      var mode = 'default';

      function apply() {
        embed.classList.toggle('theater-mode', mode === 'theater');
        document.body.classList.toggle('video-wide', mode === 'wide');
        document.body.classList.toggle('video-theater', mode === 'theater');
        wideBtn.textContent = mode === 'wide' ? 'Default View' : 'Wide View';
        wideBtn.setAttribute('aria-pressed', mode === 'wide' ? 'true' : 'false');
        theaterBtn.textContent = mode === 'theater' ? 'Default View' : 'Theater Mode';
        theaterBtn.setAttribute('aria-pressed', mode === 'theater' ? 'true' : 'false');
        // AdSense's side rail ads only re-check google-side-rail-overlap exclusion
        // zones on scroll/resize, not on a plain class-driven layout change, so nudge
        // it to recompute once the width/height transition above has settled.
        setTimeout(function () {
          window.dispatchEvent(new Event('resize'));
        }, 300);
      }

      function setMode(next) {
        mode = mode === next ? 'default' : next;
        apply();
      }

      wideBtn.addEventListener('click', function () { setMode('wide'); });
      theaterBtn.addEventListener('click', function () { setMode('theater'); });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mode !== 'default') setMode(mode);
      });
    })();"""

# Extra files (outside mes.fm/**/index.html) that carry their own literal copy of the CSS/JS/button.
EXTRA_FILES = [
    "hive_mirror_template.html",
    "math_qa_mirror_template.html",
    "mes.fm/cubic-formula/child-template.html",
    "mes.fm/cubic-formula/build.mjs",
    # build_math_qa_mirrors.py's copy of the button lives inside a Python string literal (one line per
    # HTML line, each individually quoted) -- NEW_BUTTON's raw embedded newline would corrupt that syntax,
    # so it's fixed by hand instead of by this script. See the note at the bottom of this file.
]


def candidates():
    paths = sorted(glob.glob(os.path.join(ROOT, "mes.fm", "*", "index.html")))
    paths += [os.path.join(ROOT, p) for p in EXTRA_FILES]
    return paths


def patch(text):
    """(new_text, changed_button, changed_js). new_text is the input unchanged if nothing matched."""
    if 'id="wideToggle"' in text:
        return text, False, False  # already patched

    changed_button = False
    if OLD_BUTTON in text:
        text = text.replace(OLD_BUTTON, NEW_BUTTON, 1)
        changed_button = True

    changed_js = False
    new_text, n = OLD_JS_RE.subn(NEW_JS, text, count=1)
    if n:
        text = new_text
        changed_js = True

    return text, changed_button, changed_js


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every file")
    args = ap.parse_args()

    total = changed = 0
    skipped = []
    for path in candidates():
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8", newline="") as f:
            old = f.read()
        new, cb, cj = patch(old)
        if new == old:
            if "wideToggle" not in old and ("theaterToggle" in old or "theater-mode:" in old):
                skipped.append(path)
            continue
        # Applying the button and JS replacements is independent and safe even when only one is present
        # (e.g. build_math_qa_mirrors.py-style generators keep the button in one file and the JS in
        # another; mes.fm/troubleshooting has the JS boilerplate but no video/button at all).
        total += 1
        changed += 1
        if args.verbose:
            print("  %s %s" % ("write" if args.apply else "would write", os.path.relpath(path, ROOT)))
        if args.apply:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(new)

    print("%d pages %s" % (changed, "changed" if args.apply else "would change (dry run -- pass --apply)"))
    if skipped:
        print("%d file(s) had theater-mode markup this script didn't recognize (left alone):" % len(skipped))
        for p in skipped:
            print("  " + os.path.relpath(p, ROOT))


if __name__ == "__main__":
    main()
