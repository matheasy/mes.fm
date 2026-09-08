#!/usr/bin/env python3
"""Convert the text-label light/dark toggle button ("Switch to Dark Mode" /
"Switch to Light Mode") to the compact icon version (moon/sun emoji in a
circular button, white background for the sun state, a visible border +
shadow for contrast since the emoji glyphs' own pale colors otherwise
wash out against a similarly-toned background) already used on
wdttg.mes.fm and djw.mes.fm.

Idempotent and re-runnable as the icon styling itself evolves: applies
whichever of STAGES below still matches a given file's current text (a
fresh text-label page goes through both stages in one run; a page
already on an older icon revision just picks up from there), and
already-converted-to-latest or differently-structured pages (e.g. the
handful of hub pages using a `.page-header .theme-toggle-btn` variant)
are left untouched. Each stage's OLD text was verified byte-identical
across every file it matched before being added here, not just similar.

Usage: python3 fix_theme_toggle_icon.py
"""
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

# Stage 1: original text-label button -> plain icon button (no border yet).
STAGE1_OLD_CSS = """    .theme-toggle-btn {
      flex: 0 0 auto;
      padding: 5px 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
      white-space: nowrap;
    }

    body.light .theme-toggle-btn { background-color: #dddddd; color: #000000; }
    body.dark .theme-toggle-btn { background-color: #444444; color: #ffffff; }"""

STAGE1_NEW_CSS = """    .theme-toggle-btn {
      flex: 0 0 auto;
      width: 2.25em;
      height: 2.25em;
      padding: 0;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.1em;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.light .theme-toggle-btn { background-color: #dddddd; }
    /* Dark mode shows the sun icon (offering a switch to light) -- give it
       an actual white/bright circle so it reads as "light mode preview"
       rather than sitting on the same dark chip the moon uses. */
    body.dark .theme-toggle-btn { background-color: #ffffff; }"""

STAGE1_OLD_JS_LIGHT = "themeToggle.textContent = 'Switch to Light Mode';"
STAGE1_NEW_JS = "themeToggle.textContent = '☀️';"
STAGE1_OLD_JS_DARK = "themeToggle.textContent = 'Switch to Dark Mode';"
STAGE1_NEW_JS_DARK = "themeToggle.textContent = '\U0001F319';"

# Stage 2: plain icon button -> add border + shadow for contrast (the sun/
# moon glyphs' own pale shading otherwise blends into a same-toned circle).
STAGE2_OLD_CSS = """    .theme-toggle-btn {
      flex: 0 0 auto;
      width: 2.25em;
      height: 2.25em;
      padding: 0;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.1em;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.light .theme-toggle-btn { background-color: #dddddd; }
    /* Dark mode shows the sun icon (offering a switch to light) -- give it
       an actual white/bright circle so it reads as "light mode preview"
       rather than sitting on the same dark chip the moon uses. */
    body.dark .theme-toggle-btn { background-color: #ffffff; }"""

STAGE2_NEW_CSS = """    .theme-toggle-btn {
      flex: 0 0 auto;
      width: 2.25em;
      height: 2.25em;
      padding: 0;
      border: 1.5px solid rgba(0, 0, 0, 0.15);
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.1em;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    body.light .theme-toggle-btn { background-color: #dddddd; }
    /* Dark mode shows the sun icon (offering a switch to light) -- give it
       an actual white/bright circle so it reads as "light mode preview"
       rather than sitting on the same dark chip the moon uses. A firmer
       border/shadow than the light-mode state since the sun glyph's own
       pale rays otherwise wash out against plain white. */
    body.dark .theme-toggle-btn { background-color: #ffffff; border-color: rgba(0, 0, 0, 0.3); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4); }"""

# Stage "hub": the handful of hub pages (stats, conspiracy, math, crypto,
# mathiew, science -- links/index.html was already fixed by hand) share a
# second, older text-button variant, distinct from stage 1's. Its JS uses
# the same 'Switch to Light/Dark Mode' text (handled generically by
# JS_REPLACEMENTS below), but the CSS is structured differently enough
# that it needs its own stage rather than matching STAGE1_OLD_CSS.
STAGE_HUB_OLD_CSS = """    .theme-toggle-btn {
      margin: 10px;
      padding: 5px 10px;
      border: none;
      cursor: pointer;
    }

    body.light .theme-toggle-btn {
      background-color: #dddddd;
      color: #000000;
    }

    body.dark .theme-toggle-btn {
      background-color: #555555;
      color: #ffffff;
    }"""

STAGE_HUB_NEW_CSS = """    .theme-toggle-btn {
      margin: 10px;
      width: 2.25em;
      height: 2.25em;
      padding: 0;
      border: 1.5px solid rgba(0, 0, 0, 0.15);
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.1em;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    body.light .theme-toggle-btn {
      background-color: #dddddd;
    }

    /* Dark mode shows the sun icon (offering a switch to light) -- give it
       an actual white/bright circle so it reads as "light mode preview"
       rather than sitting on the same dark chip the moon uses. */
    body.dark .theme-toggle-btn {
      background-color: #ffffff;
      border-color: rgba(0, 0, 0, 0.3);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    }"""

STAGES = [
    (STAGE1_OLD_CSS, STAGE1_NEW_CSS),
    (STAGE2_OLD_CSS, STAGE2_NEW_CSS),
    (STAGE_HUB_OLD_CSS, STAGE_HUB_NEW_CSS),
]
JS_REPLACEMENTS = [
    (STAGE1_OLD_JS_LIGHT, STAGE1_NEW_JS),
    (STAGE1_OLD_JS_DARK, STAGE1_NEW_JS_DARK),
]


def process(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()
    changed = False
    for old, new in STAGES:
        if old in content:
            content = content.replace(old, new)
            changed = True
    for old, new in JS_REPLACEMENTS:
        if old in content:
            content = content.replace(old, new)
            changed = True
    if not changed:
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


def main():
    fixed = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [
            d for d in dirnames if d not in {".git", "node_modules", "hts-cache", "__pycache__"}
        ]
        for fname in filenames:
            if fname.endswith(".html"):
                path = os.path.join(dirpath, fname)
                if process(path):
                    fixed.append(os.path.relpath(path, ROOT))
    print(f"Fixed {len(fixed)} files:")
    for p in fixed:
        print(" ", p)


if __name__ == "__main__":
    main()
