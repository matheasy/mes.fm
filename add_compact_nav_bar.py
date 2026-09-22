#!/usr/bin/env python3
"""Add the floating "compact nav" bar (CNN-style: appears once the real
header scrolls off the top, small logo + title + nav links + hamburger)
to mes.fm's own hub pages.

This ports the design built and verified on mes.fm/math (see its
build.mjs/index.html) to the plain hub pages, which share mes.fm/math's
`#header`/`.info-bar-container`/`#navbar-button` markup byte-for-byte but
have no header-controls (text-size/dark-mode) div and a different, bigger
wordmark logo in the real header. The compact bar itself always uses the
small square mark (img/logo-mark.png), matching math's.

Each target page gets:
  - CSS for #compact-nav inserted just before the </style> that precedes
    the fb:app_id meta tag.
  - The #compact-nav markup inserted right before
    <div id="outer-container" class="outer-container">, with a per-page
    title and its own nav link omitted (it's redundant with the title).
  - The (page-independent) toggle script inserted right after the
    main_js/info-bar-fit.js <script> tag.

Idempotent: skips any file that already has id="compact-nav".

Usage:
    python3 add_compact_nav_bar.py
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent / "mes.fm"

# (filename, compact-bar title, canonical path -- whose matching nav item
# is left out of the compact bar's own link list as redundant)
TARGETS = [
    ("index.html", "MES.fm", "/"),
    ("calculators.html", "Calculators", "/calculators"),
    ("tools.html", "Tools", "/tools"),
    ("mobile-apps.html", "Mobile Apps", "/mobile-apps"),
    ("puzzles.html", "Puzzles", "/puzzles"),
    ("memes.html", "Memes", "/memes"),
]

# The same 7 core/MES.fm links mes.fm/math's compact bar draws from, in
# their usual info-bar order. (label, href, bold)
CANDIDATE_LINKS = [
    ("Math Tutorials", "/math", False),
    ("Calculators", "/calculators", False),
    ("Tools", "/tools", False),
    ("Mobile Apps", "/mobile-apps", False),
    ("Puzzles", "/puzzles", False),
    ("Memes", "/memes", False),
    ("MES.fm", "/", True),
]

CSS_ANCHOR_RE = re.compile(
    r'(</style>)(\s*(?:<link rel="publisher"[^>]*>\s*)?)(<meta property="fb:app_id")'
)
HTML_ANCHOR = '<div id="outer-container" class="outer-container">'
JS_ANCHOR = '<script src="/main_js/info-bar-fit.js" defer></script>'

CSS_TEMPLATE = '''/* Floating compact header bar: once the full header + nav scroll out of
   view, a slim fixed bar (small logo, title, as many nav links as fit)
   slides in, and the hamburger is pinned into its right end. Toggled by
   the compact-nav script below. Ported from mes.fm/math's version (see
   its build.mjs) -- this page has no #header-controls div, so there's
   less to reserve room for.

   Hidden by default via the inline style="display:none" on the element
   itself (not just this stylesheet's "display: none" below) -- some
   browser extensions strip or neutralize cosmetic-looking CSS for
   elements named "sticky-*"/"*-bar" (a common ad/cookie-bar filter
   pattern), which left an earlier version's raw unstyled markup visible
   above the real header on mes.fm/math. The inline attribute is a
   fallback the JS clears itself, independent of this stylesheet
   surviving intact. */
#compact-nav {
  position: fixed; top: 0; left: 0; right: 0; height: 52px; z-index: 15;
  display: none; align-items: center; gap: 12px;
  padding: 0 80px 0 12px; box-sizing: border-box;
  background: #ffffff; border-bottom: 3px solid #277bb6;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transform: translateY(-110%); transition: transform 0.2s ease;
}
#compact-nav.is-visible { display: flex; }
body.is-stuck #compact-nav { transform: none; }
#compact-nav .compact-nav-logo { display: block; width: 32px; height: 32px; border-radius: 6px; flex: 0 0 auto; }
#compact-nav .compact-nav-title {
  flex: 0 1 auto; min-width: 0; font-weight: 700; font-size: 1.05em; color: #1a1a1a;
  text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#compact-nav .compact-nav-links { display: flex; flex: 1 1 0; min-width: 0; overflow: hidden; margin: 0 0 0 8px; padding: 0; list-style: none; }
#compact-nav .compact-nav-links li { flex: 0 0 auto; }
#compact-nav .compact-nav-links a { display: block; padding: 0 10px; line-height: 52px; font-size: 0.9em; color: #277bb6; text-decoration: none; white-space: nowrap; }
#compact-nav .compact-nav-links a:hover { background: rgba(39,123,182,0.12); }
body.is-stuck #navbar-button { position: fixed !important; top: 4px !important; right: 8px !important; display: flex; align-items: center; }
body.is-stuck #navbar.hide { position: fixed; top: 56px; right: 8px; }
@media (max-width: 700px) {
  #compact-nav .compact-nav-title { display: none; }
  #compact-nav .compact-nav-logo { width: 36px; height: 36px; }
}
@media (max-width: 480px) {
  #compact-nav { padding-right: 70px; gap: 8px; }
}
'''

JS_BLOCK = '''<script>
  // Floating compact header bar (see #compact-nav CSS): appears once the
  // header + nav bar have scrolled off the top; nav links that don't fit
  // are dropped from the right, least important first, rather than
  // wrapping. The last link is kept longest, so drop from the one before
  // it first. Visibility is driven from here via the inline style
  // attribute (not just a CSS class) so the bar stays hidden even if the
  // stylesheet rules for it get stripped -- see the CSS comment above
  // #compact-nav. Identical across every page that has this bar.
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


def build_html(title, canonical):
    links = [l for l in CANDIDATE_LINKS if l[1] != canonical]
    li_html = "\n".join(
        '    <li><a href="{href}" tabindex="-1">{open}{label}{close}</a></li>'.format(
            href=href,
            label=label,
            open="<b>" if bold else "",
            close="</b>" if bold else "",
        )
        for label, href, bold in links
    )
    return '''<div id="compact-nav" aria-hidden="true" style="display:none">
  <a href="{canonical}" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/logo-mark.png"></a>
  <a class="compact-nav-title" href="{canonical}" tabindex="-1">{title}</a>
  <ul class="compact-nav-links">
{links}
  </ul>
</div>
'''.format(canonical=canonical, title=title, links=li_html)


def patch(path: Path, title: str, canonical: str) -> str:
    text = path.read_text(encoding="utf-8")
    if 'id="compact-nav"' in text:
        return "already patched"

    css = CSS_TEMPLATE
    m = CSS_ANCHOR_RE.search(text)
    if not m:
        return "CSS anchor not found"
    text = text[: m.start()] + css + text[m.start():]
    # re-find meta anchor is no longer needed; we inserted right before
    # the matched </style>, so the rest of the match (link/meta) follows
    # unchanged after our insertion since we spliced at m.start().

    if text.count(HTML_ANCHOR) != 1:
        return "HTML anchor not found/ambiguous"
    text = text.replace(HTML_ANCHOR, build_html(title, canonical) + HTML_ANCHOR, 1)

    if text.count(JS_ANCHOR) != 1:
        return "JS anchor not found/ambiguous"
    text = text.replace(JS_ANCHOR, JS_ANCHOR + JS_BLOCK, 1)

    path.write_text(text, encoding="utf-8")
    return "patched"


def main():
    for filename, title, canonical in TARGETS:
        path = ROOT / filename
        if not path.exists():
            print(f"{filename}: MISSING")
            continue
        result = patch(path, title, canonical)
        print(f"{filename}: {result}")


if __name__ == "__main__":
    main()
