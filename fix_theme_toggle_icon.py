#!/usr/bin/env python3
"""Convert the text-label light/dark toggle button ("Switch to Dark Mode" /
"Switch to Light Mode") to the compact icon version (moon/sun emoji in a
circular button, white background for the sun state) already used on
wdttg.mes.fm and djw.mes.fm.

Idempotent: matches on the exact CSS/JS text carried over from the shared
mirror-page template; already-converted or differently-structured pages
(e.g. the handful of hub pages using a `.page-header .theme-toggle-btn`
variant) won't match and are left untouched -- verified byte-identical
across all matches before this script was written, not just similar.

Usage: python3 fix_theme_toggle_icon.py
"""
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

OLD_CSS = """    .theme-toggle-btn {
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

NEW_CSS = """    .theme-toggle-btn {
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

OLD_JS_LIGHT = "themeToggle.textContent = 'Switch to Light Mode';"
NEW_JS_LIGHT = "themeToggle.textContent = '☀️';"
OLD_JS_DARK = "themeToggle.textContent = 'Switch to Dark Mode';"
NEW_JS_DARK = "themeToggle.textContent = '\U0001F319';"


def process(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if OLD_CSS not in content:
        return False
    content = content.replace(OLD_CSS, NEW_CSS)
    content = content.replace(OLD_JS_LIGHT, NEW_JS_LIGHT)
    content = content.replace(OLD_JS_DARK, NEW_JS_DARK)
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
