#!/usr/bin/env python3
"""Add a "Collapse All" control inside the TOC sidebar itself (in addition to
the existing chapters-toolbar one) on every page using the collapsible-chapter
+ "Jump to section" TOC pattern.

Applies to both the committed index.html (for immediate live effect) and the
generating build.mjs (so a future rebuild doesn't regress it) for each page in
PAGES below. Idempotent / safe to re-run -- skips a file that already has the
toc-collapse-all-btn marker.

Run with: python3 add_sidebar_collapse_all.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = [
    "mes.fm/911",
    "mes.fm/hutchison",
    "mes.fm/hutchison-tom-sky",
    "mes.fm/ferrocell-specular-reflection",
    "mes.fm/vector-functions-problems-plus",
]

OLD_NAV = '''  <nav class="toc-sidebar" aria-label="Table of contents">
    <div class="toc-title">Jump to</div>'''

NEW_NAV = '''  <nav class="toc-sidebar" aria-label="Table of contents">
    <div class="toc-sidebar-header">
      <div class="toc-title">Jump to</div>
      <button type="button" class="toc-collapse-all-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>
    </div>'''

OLD_CSS = '''      .toc-sidebar .toc-title {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.6;
        margin: 0 0 0.7em;
      }'''

NEW_CSS = '''      .toc-sidebar-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.6em;
        margin: 0 0 0.7em;
      }

      .toc-sidebar .toc-title {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.6;
        margin: 0;
      }

      .toc-collapse-all-btn {
        font-size: 0.8em;
        opacity: 0.65;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        text-decoration: underline;
        color: inherit;
        font-family: inherit;
        white-space: nowrap;
      }

      .toc-collapse-all-btn:hover {
        opacity: 1;
      }'''

OLD_BTN = '<button id="toggleAllChaptersBtn" class="theme-toggle-btn" onclick="toggleAllChapters()">Collapse All</button>'
NEW_BTN = '<button id="toggleAllChaptersBtn" class="theme-toggle-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>'

OLD_JS = '''    function toggleAllChapters() {
      const lists = document.querySelectorAll('.chapter-toggle-list');
      const btn = document.getElementById('toggleAllChaptersBtn');
      const collapse = lists.length === 0 || !lists[0].classList.contains('hidden');
      lists.forEach((list) => {
        list.classList.toggle('hidden', collapse);
        const arrowIcon = document.getElementById('arrowIcon-' + list.id);
        if (arrowIcon) arrowIcon.textContent = collapse ? '▼' : '▲';
      });
      btn.textContent = collapse ? 'Expand All' : 'Collapse All';
    }'''

NEW_JS = '''    function toggleAllChapters() {
      const lists = document.querySelectorAll('.chapter-toggle-list');
      const buttons = document.querySelectorAll('.toggle-all-chapters-btn');
      const collapse = lists.length === 0 || !lists[0].classList.contains('hidden');
      lists.forEach((list) => {
        list.classList.toggle('hidden', collapse);
        const arrowIcon = document.getElementById('arrowIcon-' + list.id);
        if (arrowIcon) arrowIcon.textContent = collapse ? '▼' : '▲';
      });
      buttons.forEach((btn) => { btn.textContent = collapse ? 'Expand All' : 'Collapse All'; });
    }'''


def patch(path: Path) -> str:
    text = path.read_text()
    if "toc-collapse-all-btn" in text:
        return "skip (already applied)"

    missing = []
    for label, needle in (("nav", OLD_NAV), ("css", OLD_CSS), ("btn", OLD_BTN), ("js", OLD_JS)):
        if text.count(needle) != 1:
            missing.append(f"{label}={text.count(needle)}")
    if missing:
        return f"UNRESOLVED (expected exactly 1 match each): {', '.join(missing)}"

    text = text.replace(OLD_NAV, NEW_NAV, 1)
    text = text.replace(OLD_CSS, NEW_CSS, 1)
    text = text.replace(OLD_BTN, NEW_BTN, 1)
    text = text.replace(OLD_JS, NEW_JS, 1)
    path.write_text(text)
    return "patched"


def main():
    for page in PAGES:
        for fname in ("index.html", "build.mjs"):
            path = ROOT / page / fname
            if not path.exists():
                print(f"{page}/{fname}: MISSING")
                continue
            result = patch(path)
            print(f"{page}/{fname}: {result}")


if __name__ == "__main__":
    main()
