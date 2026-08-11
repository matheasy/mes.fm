#!/usr/bin/env python3
"""Stop Google Auto ads from ever landing between the logo and the top nav bar,
without starving the page of ads entirely.

Google Auto ads is account/JS-driven, not markup-driven: it scans the live
page and inserts ad containers wherever its algorithm picks, tagging each one
with the class `google-auto-placed`. Semantic HTML (e.g. wrapping the header
in a <header> tag) does NOT stop it -- confirmed by inspecting a live page,
where Google still inserted a `.google-auto-placed` div in the gap between
#header and .info-bar-container, reserving 280px of space for it.

First attempt deleted that element outright (node.remove()). That backfired:
Google Auto ads computes one designated in-page slot per page load and
doesn't appear to retry elsewhere when it disappears, so deleting it meant no
ad showed anywhere near the top of the page at all -- including above the
logo, which is an allowed position.

Second attempt relocated instead of deleting, moving the node to
`nav.after(node)`. That also backfired, just more subtly: on this template,
`.info-bar-container` (the nav) and the small `.info-bar__logo-container`
"MES.fm" badge right after it are BOTH `display: table-cell`, so the browser
groups adjacent table-cell siblings into one anonymous table row -- that's
why the nav bar and the little logo badge render side by side as one visual
row. Inserting a plain block ad div between them split that pairing apart,
so the ad appeared wedged into/above the nav row instead of cleanly below it.

Third attempt relocated to `.outer-page-content` (`.before(node)`) instead of
`nav.after(node)`. `.outer-page-content` is the element that always follows
the *entire* header+nav+logo-badge complex on this template (confirmed
across the mes.fm and pokemongocalculator.mes.fm page templates), so
inserting before it lands the ad below the whole nav row -- nav bar and logo
badge stay paired, and the ad shows as its own row underneath, matching the
existing native look on sites like percentagecalculator.mes.fm. This got the
position right, but on a real pageview where the slot doesn't fill, Google's
own placeholder-collapse logic (which shrinks the reserved space back to 0
when no ad loads) stopped kicking in once we moved the node out from under
it -- leaving a permanent empty reserved box sitting below the nav bar.

Fourth attempt fixed both of the above (relocate before .outer-page-content,
collapse-if-unfilled via a ~2s iframe poll). That's the desktop behavior we
keep. Two more requirements came in after seeing it live on mobile:

- On mobile, no ad should show below the nav bar at all -- not relocated,
  not even if it fills. Desktop keeps the "can fill and show below nav"
  behavior; mobile (`max-width: 768px`, this repo's existing responsive
  breakpoint) just hides anything caught in the header/nav gap outright.
- A second, unrelated gap needed the same treatment: Google was also
  inserting ads between the "Comments" toggle button (#comments-button) and
  the actual comment widget (#comments-box), on every device. That gap gets
  the same relocate-below + collapse-if-unfilled treatment as the header/nav
  gap on desktop (moved to right after #comments-box), just without the
  mobile-hide special case since this one was asked to be blocked
  everywhere.

Idempotent: re-running replaces an already-installed guard with the current
version (matched by exact prior script text), so it's safe to re-run after
this script itself is updated or after adding new pages.
"""

import glob
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")
SITES = ["mes.fm", "pokemongocalculator.mes.fm"]

END_MARKER = "</head>"
MARKER = "autoads-header-gap-guard"

DELETE_SCRIPT = f"""<script>
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

NAV_AFTER_SCRIPT = f"""<script>
/* {MARKER}: relocates (never deletes) any Google Auto ads slot Google inserts
   between the logo header and the nav bar, moving it to just below the nav
   instead. Ads placed above the header or elsewhere below the nav are left
   completely untouched. */
(function () {{
    function isBetweenHeaderAndNav(el) {{
        var header = document.getElementById('header');
        var nav = document.querySelector('.info-bar-container');
        if (!header || !nav) return false;
        return !!(header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
               !!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    }}
    function relocate(node) {{
        var nav = document.querySelector('.info-bar-container');
        if (nav) nav.after(node);
    }}
    function handle(node) {{
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed') && isBetweenHeaderAndNav(node)) {{
            relocate(node);
            return;
        }}
        if (node.querySelectorAll) {{
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {{
                if (isBetweenHeaderAndNav(n)) relocate(n);
            }});
        }}
    }}
    new MutationObserver(function (mutations) {{
        mutations.forEach(function (m) {{
            m.addedNodes.forEach(handle);
        }});
    }}).observe(document.documentElement, {{childList: true, subtree: true}});
}})();
</script>
"""

BEFORE_OUTER_SCRIPT = f"""<script>
/* {MARKER}: relocates (never deletes) any Google Auto ads slot Google inserts
   between the logo header and the nav bar, moving it to below the entire
   header+nav+logo-badge complex (right before .outer-page-content) instead.
   Ads placed above the header, or anywhere below the nav, are left
   completely untouched. */
(function () {{
    function isBetweenHeaderAndNav(el) {{
        var header = document.getElementById('header');
        var nav = document.querySelector('.info-bar-container');
        if (!header || !nav) return false;
        return !!(header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
               !!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    }}
    function relocate(node) {{
        var target = document.querySelector('.outer-page-content');
        if (target) {{
            target.before(node);
            return;
        }}
        var nav = document.querySelector('.info-bar-container');
        if (nav) nav.after(node);
    }}
    function handle(node) {{
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed') && isBetweenHeaderAndNav(node)) {{
            relocate(node);
            return;
        }}
        if (node.querySelectorAll) {{
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {{
                if (isBetweenHeaderAndNav(n)) relocate(n);
            }});
        }}
    }}
    new MutationObserver(function (mutations) {{
        mutations.forEach(function (m) {{
            m.addedNodes.forEach(handle);
        }});
    }}).observe(document.documentElement, {{childList: true, subtree: true}});
}})();
</script>
"""

COLLAPSE_IF_UNFILLED_SCRIPT = f"""<script>
/* {MARKER}: relocates (never deletes) any Google Auto ads slot Google inserts
   between the logo header and the nav bar, moving it to below the entire
   header+nav+logo-badge complex (right before .outer-page-content) instead.
   Ads placed above the header, or anywhere below the nav, are left
   completely untouched. Google's own placeholder-collapse doesn't reliably
   fire once we've moved the node, so we also poll it: if no real ad iframe
   shows up within ~2s, we force the reserved space to 0 ourselves, so an
   unfilled slot never leaves a blank gap. */
(function () {{
    function isBetweenHeaderAndNav(el) {{
        var header = document.getElementById('header');
        var nav = document.querySelector('.info-bar-container');
        if (!header || !nav) return false;
        return !!(header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
               !!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    }}
    function relocate(node) {{
        var target = document.querySelector('.outer-page-content');
        if (target) {{
            target.before(node);
            return;
        }}
        var nav = document.querySelector('.info-bar-container');
        if (nav) nav.after(node);
    }}
    function collapseIfUnfilled(node) {{
        var attempts = 0;
        var poll = setInterval(function () {{
            attempts++;
            if (!node.isConnected) {{
                clearInterval(poll);
                return;
            }}
            if (node.querySelector('iframe')) {{
                clearInterval(poll);
                return;
            }}
            if (attempts >= 10) {{
                node.style.setProperty('display', 'none', 'important');
                clearInterval(poll);
            }}
        }}, 200);
    }}
    function handle(node) {{
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed') && isBetweenHeaderAndNav(node)) {{
            relocate(node);
            collapseIfUnfilled(node);
            return;
        }}
        if (node.querySelectorAll) {{
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {{
                if (isBetweenHeaderAndNav(n)) {{
                    relocate(n);
                    collapseIfUnfilled(n);
                }}
            }});
        }}
    }}
    new MutationObserver(function (mutations) {{
        mutations.forEach(function (m) {{
            m.addedNodes.forEach(handle);
        }});
    }}).observe(document.documentElement, {{childList: true, subtree: true}});
}})();
</script>
"""

SCRIPT = f"""<script>
/* {MARKER}: guards two gaps against Google Auto ads.
   1) Logo header <-> nav bar: on desktop, any ad caught here is relocated to
      just below the whole header+nav+logo-badge complex (before
      .outer-page-content) and allowed to show if it fills; on mobile
      (max-width: 768px, this repo's existing responsive breakpoint) it is
      hidden outright instead -- no ad shows below the nav bar on mobile at
      all. 2) Comments toggle (#comments-button) <-> comments widget
      (#comments-box): on every device, any ad caught here is relocated to
      just after the comments box and allowed to show if it fills.
   In both cases Google's own placeholder-collapse doesn't reliably fire once
   we've moved the node, so we poll it: if no real ad iframe shows up within
   ~2s, we force the reserved space to 0 ourselves, so an unfilled slot never
   leaves a blank gap. */
(function () {{
    function isMobile() {{
        return window.matchMedia('(max-width: 768px)').matches;
    }}
    function isBetween(before, after, el) {{
        if (!before || !after) return false;
        return !!(before.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
               !!(after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    }}
    function collapseIfUnfilled(node) {{
        var attempts = 0;
        var poll = setInterval(function () {{
            attempts++;
            if (!node.isConnected) {{
                clearInterval(poll);
                return;
            }}
            if (node.querySelector('iframe')) {{
                clearInterval(poll);
                return;
            }}
            if (attempts >= 10) {{
                node.style.setProperty('display', 'none', 'important');
                clearInterval(poll);
            }}
        }}, 200);
    }}
    function handleHeaderNavZone(node) {{
        var header = document.getElementById('header');
        var nav = document.querySelector('.info-bar-container');
        if (!isBetween(header, nav, node)) return false;
        if (isMobile()) {{
            node.style.setProperty('display', 'none', 'important');
            return true;
        }}
        var target = document.querySelector('.outer-page-content');
        if (target) {{
            target.before(node);
        }} else if (nav) {{
            nav.after(node);
        }}
        collapseIfUnfilled(node);
        return true;
    }}
    function handleCommentsZone(node) {{
        var button = document.getElementById('comments-button');
        var box = document.getElementById('comments-box');
        if (!isBetween(button, box, node)) return false;
        box.after(node);
        collapseIfUnfilled(node);
        return true;
    }}
    function handle(node) {{
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed')) {{
            if (handleHeaderNavZone(node)) return;
            handleCommentsZone(node);
            return;
        }}
        if (node.querySelectorAll) {{
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {{
                if (handleHeaderNavZone(n)) return;
                handleCommentsZone(n);
            }});
        }}
    }}
    new MutationObserver(function (mutations) {{
        mutations.forEach(function (m) {{
            m.addedNodes.forEach(handle);
        }});
    }}).observe(document.documentElement, {{childList: true, subtree: true}});
}})();
</script>
"""


def process(path):
    with open(path, encoding="utf-8", errors="surrogateescape") as fh:
        content = fh.read()

    if DELETE_SCRIPT in content:
        new_content = content.replace(DELETE_SCRIPT, SCRIPT)
        with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
            fh.write(new_content)
        return "Upgraded (delete -> relocate-before-outer-page-content)"

    if NAV_AFTER_SCRIPT in content:
        new_content = content.replace(NAV_AFTER_SCRIPT, SCRIPT)
        with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
            fh.write(new_content)
        return "Upgraded (nav.after -> before-outer-page-content + collapse-if-unfilled)"

    if BEFORE_OUTER_SCRIPT in content:
        new_content = content.replace(BEFORE_OUTER_SCRIPT, SCRIPT)
        with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
            fh.write(new_content)
        return "Upgraded (added collapse-if-unfilled + mobile hide + comments zone)"

    if COLLAPSE_IF_UNFILLED_SCRIPT in content:
        new_content = content.replace(COLLAPSE_IF_UNFILLED_SCRIPT, SCRIPT)
        with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
            fh.write(new_content)
        return "Upgraded (added mobile hide + comments zone)"

    if MARKER in content:
        return "Already guarded (current version)"

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
