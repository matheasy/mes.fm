#!/usr/bin/env python3
"""Add the standard site footer and the floating "compact nav" bar (CNN-
style: appears once the real header scrolls off the top) to the "Vector
Functions: Problems Plus" family of pages, which share one header/nav
template byte-for-byte:

  - problems-plus-1-projectile-origin
  - problems-plus-2-projectile-inclined-plane
  - problems-plus-3-ball-rolls-table
  - problems-plus-4-curvature-parametric-integrals
  - projectile-hits-target
  - vector-functions-problems-plus (the hub page; also has its own
    build.mjs template, patched identically)

Footer: each page already has a placeholder
  <hr>
  <p class="site-footer-note"><a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
in place of a real footer. Replaced with the standard site footer (same
links/markup as mes.fm/math and mes.fm/911), in this page family's own
#277bb6 blue (911 uses a one-off red #c9381f for its own accent) and
sized to this family's 760px .container (911 uses 1180px for its wider
card-grid layout).

Compact nav: these pages already use a clean flexbox top-bar (no
position:absolute/table-cell legacy CSS to fight, unlike mes.fm/math's
older template), so the compact bar needs no special-case fixes -- same
design as mes.fm/math's, reusing its exact link set (Calculators, Tools,
Mobile Apps, Puzzles, Memes, MES.fm; "Math Tutorials" itself is left out
since the compact bar's own title/logo already point at /math, same as
on mes.fm/math). This page family toggles body.light/body.dark (not
mes.fm/math's body.dark-mode), so the compact bar's dark-mode colors are
keyed off body.dark.

Idempotent: skips any file that already has id="compact-nav".

Usage:
    python3 add_footer_and_compact_nav_vfpp.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "mes.fm"

TARGETS = [
    "problems-plus-1-projectile-origin/index.html",
    "problems-plus-2-projectile-inclined-plane/index.html",
    "problems-plus-3-ball-rolls-table/index.html",
    "problems-plus-4-curvature-parametric-integrals/index.html",
    "projectile-hits-target/index.html",
    "vector-functions-problems-plus/index.html",
    "vector-functions-problems-plus/build.mjs",
]

FOOTER_CSS = '''/* Site footer -- same links/markup as mes.fm/math and mes.fm/911, in
       this page family's own blue accent (#277bb6, matching .hamburger-btn/
       .info-bar above) and sized to this family's 760px .container (911
       uses 1180px for its own wider card-grid page). */
    .footer { max-width: 760px; margin: 2.5em auto 0; padding: 2em; background-color: #277bb6; border-radius: 0.35em; }
    .footer__item-container { display: table; width: 100%; margin-bottom: 1.6em; }
    .footer__item { display: table-cell; }
    .footer__item--extra-padding { padding-left: 2.5em; }
    .footer .footer__text { color: #ffffff; line-height: 1.5; text-decoration: none; }
    .footer .footer__text--title { display: inline-block; margin-bottom: 1.6em; font-size: 1.3em; font-style: italic; }
    .footer__text--extra-info { float: right; }
    .footer .footer__text:not(.footer__text--copyright):hover { text-decoration: underline; cursor: pointer; }
    .footer__separator, #copyright-year { color: #ffffff; }
    @media (max-width: 600px) {
      .footer { padding: 1.25em 0.75em; }
      .footer__item-container { display: block; }
      .footer__item { display: block; margin-bottom: 0.75em; }
      .footer__item--extra-padding { padding-left: 0; }
      .footer__text--extra-info { float: none; display: block; margin-top: 0.5em; }
    }
    /* Floating compact header bar: once the real top-bar + nav scroll out of
       view, a slim fixed bar (small logo, title, as many nav links as fit)
       slides in, and the header-controls + hamburger are pinned into its
       right end. Ported from mes.fm/math's version (see its build.mjs) --
       this template's top-bar is already a clean flex row (no
       position:absolute/table-cell legacy layout to fight), so no special
       centering workarounds are needed here.

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
      padding: 0 172px 0 12px; box-sizing: border-box;
      background: #ffffff; border-bottom: 3px solid #277bb6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      transform: translateY(-110%); transition: transform 0.2s ease;
    }
    #compact-nav.is-visible { display: flex; }
    body.is-stuck #compact-nav { transform: none; }
    #compact-nav .compact-nav-logo { display: block; width: 32px; height: 32px; border-radius: 6px; flex: 0 0 auto; }
    #compact-nav .compact-nav-title {
      flex: 0 1 auto; min-width: 0; font-weight: 700; font-size: 1.05em;
      text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #compact-nav .compact-nav-links { display: flex; flex: 1 1 0; min-width: 0; overflow: hidden; margin: 0 0 0 8px; padding: 0; list-style: none; }
    #compact-nav .compact-nav-links li { flex: 0 0 auto; }
    #compact-nav .compact-nav-links a { display: block; padding: 0 10px; line-height: 52px; font-size: 0.9em; text-decoration: none; white-space: nowrap; }
    #compact-nav .compact-nav-links a:hover { background: rgba(39,123,182,0.12); }
    body.light #compact-nav .compact-nav-title { color: #1a1a1a; }
    body.dark #compact-nav { background: #1a1a1a; }
    body.dark #compact-nav .compact-nav-title { color: #eeeeee; }
    body.light #compact-nav .compact-nav-links a { color: #277bb6; }
    body.dark #compact-nav .compact-nav-links a { color: #6cb6f5; }
    body.is-stuck .header-controls { position: fixed !important; top: 13px; right: 60px; margin-left: 0; }
    body.is-stuck #navbar-button { position: fixed !important; top: 4px !important; right: 8px !important; margin: 0; }
    body.is-stuck #navbar.hide { position: fixed; top: 56px; right: 8px; }
    @media (max-width: 700px) {
      #compact-nav .compact-nav-title { display: none; }
      #compact-nav .compact-nav-logo { width: 36px; height: 36px; }
    }
    @media (max-width: 480px) {
      #compact-nav { padding-right: 160px; gap: 8px; }
      body.is-stuck .header-controls { right: 56px; }
    }
'''

FOOTER_HTML = '''<div id="footer" class="footer" role="contentinfo">
      <div class="footer__item-container">
        <div class="footer__item">
          <a class="footer__text footer__text--title" href="/calculators">Calculators</a>
        </div>
        <div class="footer__item">
          <a class="footer__text footer__text--title" href="/tools">Tools</a>
        </div>
        <div class="footer__item footer__item--extra-padding">
          <a class="footer__text footer__text--title" href="/mobile-apps">Mobile Apps</a>
        </div>
        <div class="footer__item">
          <a class="footer__text footer__text--title" href="https://mes.fm">MES.fm</a>
        </div>
      </div>
      <a class="footer__text" href="/contact">Contact Us</a><span class="footer__separator"> | </span>
      <a class="footer__text" href="/privacy-policy">Privacy Policy</a><span class="footer__separator"> | </span>
      <a class="footer__text" target="_blank" href="/donate">Donate</a><span class="footer__separator"> | </span><a class="footer__text" target="_blank" rel="nofollow" href="https://matheasy.substack.com/">Subscribe</a>
      <div class="footer__text--extra-info"><span class="footer__text footer__text--copyright">Copyright &copy; <span id="copyright-year">2013</span>&nbsp;Math Easy Solutions</span></div>
    </div>
    <script>document.getElementById('copyright-year').textContent = new Date().getFullYear();</script>'''

COMPACT_NAV_HTML = '''<div id="compact-nav" aria-hidden="true" style="display:none">
  <a href="/math" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/logo-mark.png"></a>
  <a class="compact-nav-title" href="/math" tabindex="-1">MES Math Tutorials</a>
  <ul class="compact-nav-links">
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
FOOTER_ANCHOR = '<p class="site-footer-note"><a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>'
BODY_ANCHOR = '<body class="dark">'
JS_ANCHOR = '<script src="/main_js/info-bar-fit.js" defer></script>'


def patch(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if 'id="compact-nav"' in text:
        return "already patched"

    if text.count(CSS_ANCHOR) != 1:
        return "CSS anchor not found/ambiguous"
    text = text.replace(CSS_ANCHOR, FOOTER_CSS + CSS_ANCHOR, 1)

    if text.count(FOOTER_ANCHOR) != 1:
        return "footer anchor not found/ambiguous"
    text = text.replace(FOOTER_ANCHOR, FOOTER_HTML, 1)

    if text.count(BODY_ANCHOR) != 1:
        return "body anchor not found/ambiguous"
    text = text.replace(BODY_ANCHOR, BODY_ANCHOR + "\n\n  " + COMPACT_NAV_HTML, 1)

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
