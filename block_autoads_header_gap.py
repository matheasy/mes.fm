#!/usr/bin/env python3
"""Stop Google Auto ads from ever landing between the logo and the top nav bar.

Google Auto ads is account/JS-driven, not markup-driven: it scans the live
page and inserts ad containers wherever its algorithm picks, tagging each one
with the class `google-auto-placed`. Semantic HTML (e.g. wrapping the header
in a <header> tag) does NOT stop it -- confirmed by inspecting a live page,
where Google still inserted a `.google-auto-placed` div in the gap between
#header and .info-bar-container, reserving 280px of space for it.

The only reliable fix is to watch for that insertion and remove it the moment
it happens, before it paints. This injects a small MutationObserver script
that removes any `.google-auto-placed` element that lands between #header and
.info-bar-container specifically -- ads above the header or below the nav bar
are left untouched.

Idempotent: skips files that already contain the marker, so it's safe to
re-run after adding new pages.
"""

import glob
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")
SITES = ["mes.fm", "pokemongocalculator.mes.fm"]

END_MARKER = "</head>"
MARKER = "autoads-header-gap-guard"

SCRIPT = f"""<script>
/* {MARKER}: removes any Google Auto ads slot Google inserts between the logo
   header and the nav bar -- ads elsewhere on the page are left alone. */
(function () {{
    function isBetweenHeaderAndNav(el) {{
        var header = document.getElementById('header');
        var nav = document.querySelector('.info-bar-container');
        if (!header || !nav) return false;
        return !!(header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
               !!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    }}
    function purge(node) {{
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed') && isBetweenHeaderAndNav(node)) {{
            node.remove();
            return;
        }}
        if (node.querySelectorAll) {{
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {{
                if (isBetweenHeaderAndNav(n)) n.remove();
            }});
        }}
    }}
    new MutationObserver(function (mutations) {{
        mutations.forEach(function (m) {{
            m.addedNodes.forEach(purge);
        }});
    }}).observe(document.documentElement, {{childList: true, subtree: true}});
}})();
</script>
"""


def process(path):
    with open(path, encoding="utf-8", errors="surrogateescape") as fh:
        content = fh.read()

    if MARKER in content:
        return "Already guarded"

    end = content.find(END_MARKER)
    if end == -1:
        return "SKIP: no </head>"

    new_content = content[:end] + SCRIPT + content[end:]

    with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
        fh.write(new_content)

    return "Fixed"


def main():
    results = {}
    for site in SITES:
        for path in sorted(glob.glob(os.path.join(ROOT, site, "**", "*.html"), recursive=True)):
            status = process(path)
            results.setdefault(status, []).append(os.path.relpath(path, ROOT))

    for status, paths in results.items():
        print(f"\n=== {status} ({len(paths)}) ===")
        for p in paths[:10]:
            print(f"  {p}")
        if len(paths) > 10:
            print(f"  ... and {len(paths) - 10} more")


if __name__ == "__main__":
    main()
