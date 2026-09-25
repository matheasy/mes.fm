#!/usr/bin/env python3
"""Add the floating "compact nav" bar (CNN-style: appears once the real
header scrolls off the top) to mes.fm/911, porting the design already
shipped on mes.fm/math (see its build.mjs) and on the "Vector Functions:
Problems Plus" page family (add_footer_and_compact_nav_vfpp.py).

mes.fm/911 already has its own top-bar / .header-controls (A-/A+/theme,
a *class* not math's #header-controls id) / #navbar-button hamburger
markup -- the same clean flexbox layout as the VFPP family, not math's
older position:absolute template -- so no special centering workarounds
are needed here, same as VFPP. Two differences from VFPP's version:

  - 911 already has its own footer, so this script only adds the compact
    bar (no footer touched).
  - The compact bar uses 911's own logo (img/911-truth-logo.jpg, already
    300x300) and title ("MES 9/11 Truth"), linking to /911 itself (911 is
    a topic hub page, not a math sub-page pointing back at /math), and
    its accent colour is 911's own red (#c9381f light / #ff7a5f dark,
    matching .hamburger-btn) instead of math's/VFPP's blue.

Patches both 911/build.mjs (the template) and 911/index.html (its
generated output), so a future `npm run build` re-run keeps the bar.

Idempotent: skips any file that already has id="compact-nav".

Usage:
    python3 add_compact_nav_bar_911.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "mes.fm" / "911"

TARGETS = ["build.mjs", "index.html"]

CSS_TEMPLATE = '''    /* Floating compact header bar: once the real top-bar + nav scroll out
       of view, a slim fixed bar (small logo, title, as many nav links as
       fit) slides in, and the header-controls + hamburger are pinned into
       its right end. Ported from mes.fm/math's version (see its
       build.mjs) -- this page's top-bar is already a clean flex row (no
       position:absolute/table-cell legacy layout to fight), same as the
       Vector Functions: Problems Plus family. Uses 911's own red accent
       (#c9381f light / #ff7a5f dark) instead of math's blue, matching
       .hamburger-btn above.

       Hidden by default via the inline style="display:none" on the
       element itself (not just this stylesheet's "display: none" below)
       -- some browser extensions strip or neutralize cosmetic-looking CSS
       for elements named "sticky-*"/"*-bar" (a common ad/cookie-bar
       filter pattern), which left an earlier version's raw unstyled
       markup visible above the real header on mes.fm/math. The inline
       attribute is a fallback the JS clears itself, independent of this
       stylesheet surviving intact. */
    #compact-nav {
      position: fixed; top: 0; left: 0; right: 0; height: 52px; z-index: 15;
      display: none; align-items: center; gap: 12px;
      padding: 0 172px 0 12px; box-sizing: border-box;
      background: #ffffff; border-bottom: 3px solid #c9381f;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      transform: translateY(-110%); transition: transform 0.2s ease;
    }
    #compact-nav.is-visible { display: flex; }
    body.is-stuck #compact-nav { transform: none; }
    #compact-nav .compact-nav-logo { display: block; width: 32px; height: 32px; border-radius: 6px; flex: 0 0 auto; object-fit: cover; }
    #compact-nav .compact-nav-title {
      flex: 0 1 auto; min-width: 0; font-weight: 700; font-size: 1.05em;
      text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #compact-nav .compact-nav-links { display: flex; flex: 1 1 0; min-width: 0; overflow: hidden; margin: 0 0 0 8px; padding: 0; list-style: none; }
    #compact-nav .compact-nav-links li { flex: 0 0 auto; }
    #compact-nav .compact-nav-links a { display: block; padding: 0 10px; line-height: 52px; font-size: 0.9em; text-decoration: none; white-space: nowrap; }
    #compact-nav .compact-nav-links a:hover { background: rgba(201,56,31,0.12); }
    body.light #compact-nav .compact-nav-title { color: #1a1a1a; }
    body.dark #compact-nav { background: #1a1a1a; }
    body.dark #compact-nav .compact-nav-title { color: #eeeeee; }
    body.light #compact-nav .compact-nav-links a { color: #c9381f; }
    body.dark #compact-nav .compact-nav-links a { color: #ff7a5f; }
    body.is-stuck .header-controls { position: fixed !important; top: 13px; right: 60px; margin-left: 0; z-index: 20; }
    body.is-stuck #navbar-button { position: fixed !important; top: 4px !important; right: 8px !important; margin: 0; z-index: 20; }
    body.is-stuck #navbar.hide { position: fixed; top: 56px; right: 8px; }
    @media (max-width: 700px) {
      #compact-nav .compact-nav-title { display: none; }
      #compact-nav .compact-nav-logo { width: 36px; height: 36px; }
    }
    @media (max-width: 480px) {
      #compact-nav { padding-right: 160px; gap: 8px; }
      body.is-stuck .header-controls { right: 56px; }
    }
    /* MOBILE-HEADER-CONTROLS-ROW: on phones the A-/A+/moon controls sit on their own row
       under the brand (absolute, so sticking into the floating bar doesn't reflow), which
       leaves the title/tagline the full width instead of a ~130px sliver. */
    /* Also: a long unbroken URL in the article text (e.g. a 70-char grok.com share link on
       Problems Plus 5) made the whole page wider than a phone, so it scrolled sideways. */
    article { overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      .top-bar { padding-bottom: 44px; }
      .header-controls { position: absolute; right: 8px; bottom: 0; margin-left: 0; }
      body.is-stuck .header-controls { bottom: auto; }
    }
'''

COMPACT_NAV_HTML = '''<div id="compact-nav" aria-hidden="true" style="display:none">
  <a href="/911" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/911-truth-logo.jpg"></a>
  <a class="compact-nav-title" href="/911" tabindex="-1">MES 9/11 Truth</a>
  <ul class="compact-nav-links">
    <li><a href="/math" tabindex="-1">Math Tutorials</a></li>
    <li><a href="/calculators" tabindex="-1">Calculators</a></li>
    <li><a href="/tools" tabindex="-1">Tools</a></li>
    <li><a href="/mobile-apps" tabindex="-1">Mobile Apps</a></li>
    <li><a href="/puzzles" tabindex="-1">Puzzles</a></li>
    <li><a href="/memes" tabindex="-1">Memes</a></li>
    <li><a href="/" tabindex="-1"><b>MES.fm</b></a></li>
  </ul>
</div>

'''

JS_BLOCK = '''<script>
  // Floating compact header bar (see #compact-nav CSS): appears once the
  // header + nav bar have scrolled off the top; nav links that don't fit
  // are dropped from the right, least important first, rather than
  // wrapping. The last link (MES.fm) is kept longest, so drop from the one
  // before it first. Visibility is driven from here via the inline style
  // attribute (not just a CSS class) so the bar stays hidden even if the
  // stylesheet rules for it get stripped -- see the CSS comment above
  // #compact-nav. Identical to mes.fm/math's version.
  (function () {
    var bar = document.getElementById('compact-nav');
    var nav = document.querySelector('.info-bar-container');
    var links = bar && bar.querySelector('.compact-nav-links');
    if (!bar || !nav || !links) return;
    var items = Array.prototype.slice.call(links.children);
    var stuck = false, ticking = false, hideTimer;

    function fit() {
      items.forEach(function (li) { li.style.display = ''; });
      var order = items.slice(0, -1).reverse();
      for (var i = 0; i < order.length && links.scrollWidth > links.clientWidth; i++) {
        order[i].style.display = 'none';
      }
      if (links.scrollWidth > links.clientWidth) items[items.length - 1].style.display = 'none';
    }

    function update() {
      ticking = false;
      var now = nav.getBoundingClientRect().bottom < 0;
      if (now === stuck) return;
      stuck = now;
      bar.setAttribute('aria-hidden', stuck ? 'false' : 'true');
      Array.prototype.forEach.call(bar.querySelectorAll('a'), function (a) {
        a.tabIndex = stuck ? 0 : -1;
      });
      if (stuck) {
        clearTimeout(hideTimer);
        bar.style.display = 'flex';
        fit();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { document.body.classList.add('is-stuck'); });
        });
      } else {
        document.body.classList.remove('is-stuck');
        hideTimer = setTimeout(function () { bar.style.display = 'none'; }, 220);
      }
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', function () { if (stuck) fit(); });
    update();
  })();
</script>'''

CSS_ANCHOR = "</style>"
BODY_ANCHOR = '<body class="dark">'
JS_ANCHOR = '<script src="/main_js/info-bar-fit.js" defer></script>'


def patch(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if 'id="compact-nav"' in text:
        return "already patched"

    if text.count(CSS_ANCHOR) != 1:
        return "CSS anchor not found/ambiguous"
    text = text.replace(CSS_ANCHOR, CSS_TEMPLATE + CSS_ANCHOR, 1)

    if text.count(BODY_ANCHOR) != 1:
        return "body anchor not found/ambiguous"
    text = text.replace(BODY_ANCHOR, BODY_ANCHOR + "\n  " + COMPACT_NAV_HTML, 1)

    if text.count(JS_ANCHOR) != 1:
        return "JS anchor not found/ambiguous"
    text = text.replace(JS_ANCHOR, JS_ANCHOR + JS_BLOCK, 1)

    path.write_text(text, encoding="utf-8")
    return "patched"


def main():
    for rel in TARGETS:
        path = ROOT / rel
        if not path.exists():
            print(f"{rel}: MISSING")
            continue
        print(f"{rel}: {patch(path)}")


if __name__ == "__main__":
    main()
