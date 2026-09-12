#!/usr/bin/env python3
"""Give the fixed toc-sidebar a discreet scrollbar and stop its content
(notably the "Collapse All" button) from touching the browser's native
scrollbar.

Adds padding-right to .toc-sidebar plus a thin/low-contrast custom scrollbar
(WebKit + Firefox) inside its `overflow-y: auto` rule. Applies to every page
using the collapsible-chapter + "Jump to section" TOC pattern, including
mes.fm/norman-patricia-ai-email (which isn't part of the sidebar-collapse-all
cohort script since it shipped with that feature already).

Idempotent / safe to re-run -- skips a file that already has the
toc-sidebar-scrollbar marker. Patches both the committed index.html (for
immediate live effect) and the generating build.mjs (so a future rebuild
doesn't regress it).

Run with: python3 fix_toc_sidebar_scrollbar.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = [
    "mes.fm/911",
    "mes.fm/hutchison",
    "mes.fm/hutchison-tom-sky",
    "mes.fm/ferrocell-specular-reflection",
    "mes.fm/vector-functions-problems-plus",
    "mes.fm/norman-patricia-ai-email",
]

MARKER = "toc-sidebar-scrollbar"

OLD = """        overflow-y: auto;
        font-size: 0.85em;
      }"""

NEW = """        overflow-y: auto;
        font-size: 0.85em;
        padding-right: 10px;
        scrollbar-width: thin;
        scrollbar-color: rgba(128, 128, 128, 0.4) transparent;
      }

      /* toc-sidebar-scrollbar */
      .toc-sidebar::-webkit-scrollbar {
        width: 6px;
      }

      .toc-sidebar::-webkit-scrollbar-track {
        background: transparent;
      }

      .toc-sidebar::-webkit-scrollbar-thumb {
        background: rgba(128, 128, 128, 0.4);
        border-radius: 3px;
      }"""


def patch(path: Path) -> str:
    text = path.read_text()
    if MARKER in text:
        return "skip (already applied)"
    if text.count(OLD) != 1:
        return f"UNRESOLVED (expected exactly 1 match, found {text.count(OLD)})"
    path.write_text(text.replace(OLD, NEW, 1))
    return "patched"


def main():
    for page in PAGES:
        for fname in ("index.html", "build.mjs"):
            path = ROOT / page / fname
            if not path.exists():
                print(f"{page}/{fname}: MISSING")
                continue
            print(f"{page}/{fname}: {patch(path)}")


if __name__ == "__main__":
    main()
