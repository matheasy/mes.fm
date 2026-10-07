# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a collection of static websites for the `mes.fm` domain and its calculator subdomains (e.g.
`gradecalculator.mes.fm`, `mortgagecalculator.mes.fm`, `bmicalculator.mes.fm`, `percentagecalculator.mes.fm`,
`inflationcalculator.mes.fm`, `vatcalculator.mes.fm`, `pokemongocalculator.mes.fm`, `speedreader.mes.fm`,
`timer.mes.fm`, `youtubemoney.mes.fm`, `gpacalculator.mes.fm`). Each top-level directory
is one subdomain and is a self-contained static site: plain HTML pages with local `js/` and `img/` folders.

These sites were originally captured from a live GoDaddy-hosted deployment using **HTTrack** (a website mirror
tool), then are being progressively repaired and modernized in this repo. Artifacts of that origin are still
present and are expected, not bugs to "clean up" wholesale:
- Root `index.html` and per-site pages carry HTTrack mirror metadata/comments.
- Folders named `_http_` / `_https_` inside some site directories are HTTrack's captures of external links — leave
  them alone unless a task specifically concerns them.
- Some asset filenames have HTTrack-appended hash suffixes (e.g. `foo2c70.js`); several past commits
  (`Fix stale main_js references...`, `Fix main_js filenames (remove httrack hash suffix)`) exist specifically to
  detect and resolve these.

There is no build system, package manager, bundler, or test suite — every page is served as-is. Do not introduce
a build step or dependency manager unless explicitly asked.

## Deployment

- `mes.fm/vercel.json` and `pokemongocalculator.mes.fm/vercel.json` define per-site Vercel redirect rules (e.g.
  canonicalizing `/index.html` → `/`). Each subdomain directory deploys as its own Vercel project rooted at that
  directory. If you add a redirect or rewrite for a site, check whether that site already has a `vercel.json`
  before assuming it needs a new one.
- There is no CI config in this repo; verification is manual (open the HTML file / preview deployment in a
  browser).

## Common maintenance scripts

Several one-off Python repair scripts live at the repo root and operate across the **entire repo** (they hardcode
`~/Documents/GitHub/mes.fm` as the root and glob all `*.html` files). They are idempotent/safe to re-run and are
the established pattern for repo-wide fixes — prefer extending/re-running one of these over hand-editing dozens
of HTML files individually:

- `fix_malformed_urls.py` — repairs HTTrack-mangled URLs, e.g. stray `../` prefixes glued onto absolute URLs
  (`../https://...` → `https://...`) and doubled protocols (`httpshttps://` → `https://`).
- `fix_asset_references.py` — scans every HTML file for `src=`/`href=`/`data-src=` references to local assets
  (`.js/.css/.png/.jpg/.jpeg/.gif/.ico/.svg/.webp`), resolves each to where it *should* live on disk (handling
  absolute, protocol-relative, root-relative, and relative URLs, inferring the subdomain folder from the HTML
  file's own location), and if the expected file is missing but a single HTTrack-hash-renamed variant exists in
  the same directory, copies it into place under the expected name. Reports "Already OK" / "Fixed" / "Ambiguous"
  (multiple candidates — needs manual judgment) / "Unresolved" (genuinely missing) buckets.
- `add_responsive_css.py` — injects a fixed mobile-responsive `@media (max-width: 768px)` CSS block just before
  `</style>` in every HTML file, guarded by an `/* RESPONSIVE-FIX-INSERTED */` marker so it never double-applies.
  If you need to change the responsive rules repo-wide, edit `RESPONSIVE_CSS` in this script and re-run it rather
  than editing pages individually (existing pages already have the marker, so re-running only touches new/reset
  pages — you'd need to strip the marker+block first to refresh already-patched pages).
- `remove_dead_appstore_links.py` — strips links to dead App Store / Play Store listings (the iOS apps' Apple
  Developer account lapsed years ago; the matching Android package IDs 404 too). Removes the shared "Mobile Apps"
  side-nav dropdown repo-wide (leaves a `MOBILE-APPS-DROPDOWN-REMOVED` HTML comment marker in its place), each
  site's own "iPhone App"/"Android App" top-nav items, the app table on `mes.fm/mobile-apps.html` (swapped for a
  placeholder message), and the hand-curated dead entries on `mes.fm/links/index.html`. As each app is rebuilt and
  republished (see `percentagecalculator-app/`), add its real link back by hand next to the marker comment — this
  script only ever removes, never re-adds, so re-running it after an update is safe (idempotent, no-op on already
  fixed pages) and won't clobber a link you just restored elsewhere.

- `add_mes_home_link.py` — appends an always-visible bold "MES.fm" link (to `/`) as the right-most item of the header
  info-bar on every page except the `mes.fm` homepage (~1,000 pages, incl. calculator mini-sites where the bar's own
  "Home" goes to that calculator). Not tagged `info-bar__item--utility`, so `main_js/info-bar-fit.js` never hides it;
  appended last so `main.js`'s `:eq(N)` active-tab index is unaffected. Also patches the `math` and
  `vector-functions-problems-plus` `build.mjs` templates. Idempotent (`info-bar__item--mes` marker).

- `fix_broken_internal_links.py` — repairs broken internal `href`s repo-wide, in two passes. (1) Shared nav/footer
  links that carry a spurious section prefix: commit `1e22b96c` resolved bare-relative hrefs like `calculators.html`
  against each page's *own* directory instead of the site root, so `mes.fm/memes/` and `mes.fm/puzzles/` pages linked
  their footers at `/memes/calculators`, `/puzzles/<slug>/donate` and similar (168 dead URLs across 209 pages, found
  via Search Console's "Not found (404)" report). Any `/<section>/<shared-target>` that is missing on disk while
  `/<shared-target>` resolves is rewritten to the root path — written against the general shape, not a memes/puzzles
  allowlist, so the same breakage elsewhere is swept up too. (2) Malformed href values: doubled scheme leader
  (`hhttps://`), schemeless bare-domain self-links (`href="mes.fm/hutchison"`, which the browser resolves against the
  current directory), and *leading* whitespace inside the quotes — trailing whitespace is deliberately left alone,
  since browsers strip both ends per the URL spec and trimming it churns unrelated files. Both passes are guarded by
  on-disk existence checks (allowing for Vercel `cleanUrls`), which keeps them safe and makes the script naturally
  idempotent: a corrected link no longer matches. **Dry-runs by default — pass `--apply` to write.** Skips HTTrack's
  non-deployed root `index.html` and `percentagecalculator-app/` (generated by its own `build-www.py`).

- `update_footer_links.py` — site-wide footer tweak: the bottom-row "MES Links" title link becomes "MES.fm" (→
  `https://mes.fm`), and the company name in the copyright line is plain text instead of a link. Patches every
  `*.html` (and `build.mjs` template) with the shared `<div id="footer">`; idempotent.

- `fix_compact_nav_controls_zindex.py` — the floating compact-nav bar (`#compact-nav`, z-index 15) hid its own
  A-/A+/theme buttons and hamburger on every page using the class-based `.header-controls` header (Problems Plus,
  cubic formula and its video pages, ...): the `body.is-stuck` rules that pin those controls into the bar had no
  z-index, so the bar painted over them. Adds `z-index: 20` (as `911`/`hutchison`/`science` already had, and as the
  math-hub family's `#header-controls` has in its base CSS) to those pages, the generators' `build.mjs` and
  `cubic-formula/child-template.html`, so a rebuild can't bring it back. Idempotent; **dry-runs by default, `--apply`
  writes.** If you clone a new page from one of these templates, run it (or copy the `z-index: 20`).

- `fix_mobile_header_controls.py` — phone-width header fixes for the math-hub page family (2026-09-25). (1) At <=480px the
  A-/A+/moon controls take their own row under the brand (`position:absolute; bottom:0`, header/top-bar reserves the space
  with padding-bottom so sticking into the floating bar doesn't reflow) so the title/tagline get the full width instead of
  a ~130px sliver ("MES / Math / Tutorials"). (2) `mes.fm/math` and its five sibling hubs: stuck controls kept the 768px
  rule's `transform: translateY(-50%)`, lifting the A-/A+/moon buttons ~14px so their tops were clipped — stuck state now
  resets it. (3) `article { overflow-wrap: anywhere }` — a long unbroken URL (Problems Plus 5's grok.com link) made the page
  scroll sideways on phones. Patches ~175 generated pages plus every generator/template carrying the 480px compact-nav block
  (`build.mjs`, `child-template.html`, mirror templates, `add_compact_nav_bar_911.py`, ...). Idempotent
  (`MOBILE-HEADER-CONTROLS-ROW`); **dry-runs by default, `--apply` writes.** New pages cloned from those templates get it free.

- `build_math_qa_mirrors.py` — generates the `mes.fm/math-qa-<N>-<slug>/index.html` mirror pages for MES Math Q/A
  livestreams 1–69 from `math_qa_mirrors.json` (one record per stream: Hive post body or, where no Hive post exists,
  the YouTube description; which player to use; the verified 3Speak manifest) and `math_qa_mirror_template.html`
  (the page shell, cut from the hand-built Q/A 71 page). Also seeds each page's entry in `mes.fm/math/link-meta.json`,
  because `math/build.mjs` can't scrape a page that isn't deployed yet. **Dry-runs by default, `--apply` writes.**
  Player rule: 3Speak (hls.js, runtime manifest from `play.3speak.tv/api/embed` for newer streams, else the manifest
  from the Hive post's own `video_v2` metadata via `ipfs-3speak.b-cdn.net`) when the video was verified playable at
  build time; otherwise the YouTube embed (Q/A 34 and 35, whose IPFS content is unreachable, and the six streams
  with no Hive post: 12, 28, 38, 39, 41, 42). If a 3Speak video fails at runtime the page swaps itself for the
  YouTube embed. After a run, rebuild `mes.fm/math` (`npm run build`, diff first) so the list points at the pages.
  The page shell is a copy of `cubic-formula/child-template.html` (narrow MES Math Tutorials header + blue nav + compact bar + footer, `@@PARTOF@@` box linking to `/math-qa`), so Q/A pages match the Problems Plus look. Q/A 70, 71 and 71-stats are not generated by this — they're hand-built, converted to the same shell by filling the template from their own title/subtitle/article/video scripts. The script also rewrites `math/link-meta.json` without the extra named links `math/build.mjs` had scraped; `git checkout` that file after a run.

- `build_nancy_physics_article.py` — builds `mes.fm/hutchison-nancy-physics-system` (2026-09-30): Nancy Hutchison's 46-page report
  "John Hutchison and the Physics of the System" (Final Draft 7) as a long article, listed first in the `articles` section of
  `mes.fm/hutchison/sections.mjs` (so on `mes.fm/articles`; the hub's own `img/articles-icon.jpg` tile was deliberately left alone).
  Shell = a copy of `vector-functions-problems-plus/index.html` (Jump-to sidebar + mobile "Jump to section", Collapse All, per-chapter folds)
  re-branded MES Hutchison Effect like `hutchison-cancer-treatment`; no sidebar ad column (Jump-to pages are excluded from
  `add_sidebar_math.py`). Chapters: About This Draft, Part One/Two/Three, Appendix A (top-level folds); every numbered section
  is a sub-fold listed in Jump to (`#s7`, `#s17-3`, ... are also deep-link ids; Jump-to links and `§6.2.2` cross-references unfold
  whatever they target). The body is `nancy_physics_src/content.html` + `toc.json`, generated from the PDF by
  `nancy_physics_src/pdf_to_content.py` (needs `pip install pymupdf pillow`; roles recovered from fonts: Carlito-Bold sizes = headings,
  DejaVuSerif = display equation, filled rectangles = callouts, Symbol = bullets; also exports the report's two figures to
  `hutchison-nancy-physics-system/img/`). Equations are MathJax 4 (jsDelivr, `displayOverflow: linebreak` so long arrow chains wrap
  on phones instead of scrolling): plain word chains are converted automatically, anything with subscripts/Greek/functions has a
  hand-checked TeX entry in `nancy_physics_src/equations.py` (the converter stops and names any that is missing; `1420 MHz = Hydrogen_Form`
  is the one the text says must NOT be written, so it gets a red "not to be written" accent). Never hand-edit the generated page: edit the
  sources, re-run `pdf_to_content.py` then `python3 build_nancy_physics_article.py --apply`. After adding/changing it re-run
  `build_sitemap.py` and `build_search_index.py`. The card thumbnail/og:image is `img/physics-of-the-system.jpg` (top of figure 1, 1200x630);
  `mes.fm/hutchison/link-meta.json` has its entry seeded by hand because the build can't scrape a page that isn't deployed yet.

- `add_toc_flip.py` — options for the fixed "Jump to" sidebar (`<nav class="toc-sidebar">`, >=1300px): pills under its title —
  **⇄ Side** (other side of the article) and **Hide ›**, plus **↔ Wide / Narrow** at the top right of the article (inside the "Part of" box on the same line when the page has one, else on its own right-aligned row above
  the `<h1>`, like the calculator pages' pill, so it stays reachable while the sidebar is hidden; it falls back into the sidebar row if a page has no
  `.container > h1`): Wide = (article column up to 1100px, `--toc-w` in `toc-flip.css`; the sidebar moves out with
  it instead of hiding, and shrinks back to 760px on screens too narrow to fit both); Hide = (sidebar collapses to a "‹ Jump to"
  tab where it was; click to restore; `jump-to.js` then offers its floating-bar button). Preferences are the "More like this" pages' own
  (`asideSide`, `pageWide`) plus `tocHidden`, restored before first paint by the `TOC-FLIP-HEAD` inline script (so Wide on a calculator
  carries over to the Jump-to pages and back). Files: `main_js/toc-flip.css` + `main_js/toc-flip.js` (`?v=5`). The script (re)writes the
  head block and script tag on the 12 pages that really contain the nav (cubic-formula, ferrocell, hutchison-tom-sky, moon,
  norman-patricia, vector-functions-problems-plus, the Nancy physics report) *and* their `build.mjs`, so it also upgrades older
  versions; the math/911/hutchison/livestreams hubs only carry the sidebar's CSS, not the nav, so they are skipped. New pages cloned from the
  vector-functions-problems-plus shell inherit it. Idempotent; **dry-runs by default, `--apply` writes.**

- `improve_meta_descriptions.py` — lengthens too-short `<meta name="description">` text under `mes.fm/` (Bing Webmaster
  Tools' "Meta descriptions on many of your pages are too short", 281 pages flagged 2026-09-24; Bing wants ~150-160
  chars, the script's floor is 120). ~800 templated calculator-site pages (memes, quotes, dream homes, articles) get
  the page's own description (or, when it is just the "Title – Category – Site." boilerplate, title + category
  phrase) plus a site-specific tail sentence; ~50 standalone pages have hand-written copy in `HAND_WRITTEN`. Keeps
  `og:description`/`twitter:description` in sync and inserts a missing description. Also repairs four pages whose
  description attribute HTTrack corrupted (whole article stuffed in, closing quote missing, so the tag swallowed the
  next `<meta>`). Skips generated pages (`GENERATED` set) — for those the description lives in the generator
  (`build.mjs` / `build_math_qa_mirrors.py`), and the short ones were fixed there *and* in the output by hand, with no
  rebuild. Idempotent; **dry-runs by default (`-v` lists every change), `--apply` writes.** Not touched: ~130 article
  pages whose description is the whole article body (>320 chars; Google truncates, Bing doesn't flag) and the
  `1.html` "Page Not Found" pagination stubs.

- `shorten_long_descriptions.py` -- shortens `<meta name="description">` text over 320 characters (Site Index "Description over 320 chars": ~133 BMI health-tip / puzzle / YouTubers article pages had the whole article in the description, repeated in og: and twitter:description). New text = the page's opening cut at the last sentence end between 120 and ~158 characters, else at a word boundary + "…" (Bing wants >= 120, Google cuts at ~155). Skips `build.mjs` pages (`improve_meta_descriptions.GENERATED`) and `build_tool_apps.py` pages (`TOOL-DARK` marker: edit the APPS `desc`). Idempotent; **dry-runs by default (`-v` lists), `--apply` writes.** After it run `build_site_index.py --apply`: as of 2026-10-06 the Site Index shows 0 red issues and no short / long descriptions; the only amber left are jQuery (1,268 pages; `main.js` needs it) and the Bootstrap 3 stylesheet on the 35 tool-shell pages (it also supplies `box-sizing:border-box` and heading line-heights, so dropping it shifts layouts: needs a careful pass, not a flag fix).
- `submit_indexnow.py` — pushes changed URLs to IndexNow (`api.indexnow.org`), so Bing/Yandex/etc. learn about them
  without waiting for a crawl (Google doesn't support it; it relies on `sitemap.xml` + Search Console). Ownership key
  is `mes.fm/<32-hex>.txt` (name == contents; committed on purpose, it's not a secret). Run *after* the deploy is live:
  `python3 build_sitemap.py` (refreshes `<lastmod>` from git), push, wait for Vercel, then `python3
  submit_indexnow.py` (dry run) / `--send`. Default selection is the sitemap's newest `<lastmod>` date; `--since DATE`,
  `--all` (one-off after a site-wide pass) and `--url` adjust it. Dry-runs by default. Don't run it on a schedule —
  IndexNow wants changed URLs only. Set up 2026-09-24 after Bing Webmaster Tools' "Set up IndexNow" recommendation.

- `add_fastcomments.py` — FastComments pass, two jobs. (1) The ~1,017 calculator/meme/tool pages that already had a
  Comments toggle used a `class="button"` bar with a rotating up/down arrow; they now use the same
  `hide-div-button button` bar as "Important Notes" / "more calculations" on `mes.fm/percentagecalculator`
  (filled blue while shown, outlined while collapsed, no arrows), toggled by `main.js`'s generic `.hide-div-button`
  handler (its arrow-only `#comments-button` handler was removed) — `main.js?v=` is bumped to `1.0.4` on those pages so
  a cached old handler can't double-toggle. (2) The Hive-mirror / math-hub / list / tool pages that had no comments now
  carry `<div id="comments-button" class="mes-comments-toggle">` + `<div id="comments-box" class="hide">` + `/main_js/comments.js`
  (self-contained, works without jQuery/main.js; injects its own CSS; lazy-loads FastComments tenant `1RGmGBEjdU`).
  Per-family insertion anchors live in `STRATEGIES`/`SPECIAL`; the same block is patched into every `build.mjs`,
  `cubic-formula/child-template.html` and `math_qa_mirror_template.html`, so a rebuild keeps it (new mirror pages cloned
  from those templates get it for free; for other new pages run the script). Pages no strategy matches (contact,
  `_https_` captures, pagination stubs) are left comment-free on purpose. Idempotent (`FASTCOMMENTS-BLOCK`
  marker); **dry-runs by default, `-v` lists every file, `--apply` writes.**

- `collapse_comments_default.py` — the Comments block now starts **collapsed** on every page (decided 2026-09-24): bar
  outlined (`hide-div-button button` / `mes-comments-toggle`, no `selected`) and `<div id="comments-box" class="hide">`.
  Collapsed means FastComments' embed + iframe load only on the first click of the bar (the IntersectionObserver in
  `main.js`/`comments.js` can't fire on a `display:none` target), so readers who never comment don't download it, and
  there's no layout shift at the footer. Patched across ~1,220 pages, every `build.mjs`, `child-template.html` and
  `math_qa_mirror_template.html`; `add_fastcomments.py`'s block() and `percentagecalculator-app/build-www.py`'s
  comment-stripper (now `[^>]*` on the box tag) were updated to match. Idempotent; **dry-runs by default, `--apply`
  writes.** New pages: use the collapsed markup above.
  Because a collapsed widget never loads, the bar shows the count itself: `main.js` / `comments.js` fetch
  `fastcomments.com/widgets/comment-count/<tenant>?urlId=<page URL>` (the endpoint FastComments' own count widget uses,
  CORS-open, ~100 bytes) when the bar nears the viewport and turn "Comments" into "Comments (N)" when N > 0 (nothing
  shown for 0; fails silently). `main.js?v=1.0.5` / `comments.js?v=1.0.1` carry it, bumped on every page that loads them.

- `add_tool_page_controls.py` — gives the eight tools-hub pages (`emoji`, `latex`, `timezone`, `symbols`, `speedreader`,
  `timer`, `youtube-thumbnail`, `stats`) the same floating header bar and A-/A+/moon controls as the hub pages and
  `mes.fm/math`: the `#compact-nav` CSS/markup/JS is imported from `add_compact_nav_bar.py` (hub blue swapped for the
  tool's own shell colour, tool logo + title), `main_js/display-controls.js` is loaded, and `#main-content` becomes
  `data-tool data-text-scale` (text size scales the whole tool area; `<body>` gets `.tool-page`, which switches off the
  hub-specific dark text/link rules in display-controls.js). Each tool's widget is light-only CSS, so the dark theme is
  *derived* from that page's own tool `<style>` into a `TOOL-DARK` block (every colour-setting rule gets a mapped
  `body.dark-mode ...` twin: neutrals lightness-inverted, pastels darkened, accents lightened; near-white text kept) —
  re-run it after editing a tool's CSS to refresh the block. Idempotent; **dry-runs by default, `--apply` writes.** New
  tool pages: add them to `TOOLS` and run it. `display-controls.js?v=` is bumped in the script's `DC_TAG` when the JS changes.

- `add_floating_bar_everywhere.py` — loads `main_js/display-controls.js` (with `data-scale="main" data-dark="derive"`) on the
  ~1,000 classic-shell calculator / meme / quote / dream-home / tip / puzzle pages that had no floating bar. That one script
  builds the floating compact bar at runtime (title from `.calculator-title` minus "by MES", logo from `#logo`, colour
  from the computed `#info-bar` background, home link from the logo's link), adds A-/A+/moon, scales `#main-content`, and
  **derives the dark theme from the page's own stylesheets** (CSSOM walk: every colour rule gets a mapped `body.dark-mode`
  twin; `style=""` attributes are mapped in place and restored for light mode) so calculator widgets go dark without a
  hand-written rule per site. Bump `VERSION` (and `DC_TAG` in `add_tool_page_controls.py`, the hubs' tags) when the JS
  changes and run with `--refresh --apply`. Idempotent; **dry-runs by default, `--apply` writes.**

- `widen_gallery_pages.py` — the `<table class="memes">` thumbnail-gallery list pages (dream homes, grade/percent/bmi
  memes, quotes, interesting facts, tips, money facts; 57 pages) get the wide hub look: `.outer-container` 75em, a fluid
  4-column grid so the icons are ~2x bigger, and a `srcset` picking the 432px `-thumbnail.jpeg` where it exists. Below 600px the grid is 2 columns (`GALLERY-MOBILE-2COL`, same rule as `mes.fm/memes`) instead of four tiny thumbnails.
  Reuses `widen_hub_pages.py`'s `THUMB_GRID`. Idempotent (`HUB-WIDE-LAYOUT`); **dry-runs by default, `--apply` writes.**

- `convert_mirror_pages.py` — puts the bare Hive-mirror / link-hub pages (dark page, "<- mes.fm/911" back link, plain
  footer) in the math-hub page format used by `911`/`hutchison`/`science`/the Q/A pages: branded header (logo, title,
  tagline by hub: 911, hutchison, science, conspiracy, else the MES.fm mark), A-/A+/moon, hamburger nav, blue nav bar,
  floating compact bar, "Part of <hub>" box, standard footer. Shell = `hive_mirror_template.html` (a copy of
  `cubic-formula/child-template.html` with `@@BRAND_*@@` tokens). Three modes, picked per page: *standard* (rebuild from the
  template, lifting h1 / subtitle / `<article>` / video scripts and any page-specific CSS rules out of the old page),
  *chrome swap* (chaptered / multi-article pages: keep the body, swap only top bar, footer and scripts) and *hub swap*
  (conspiracy / mathiew / crypto link hubs; also sets the favicon + og:image for hubs with a `BRANDS` entry -- conspiracy, crypto). `moon` gets its own brand (`PAGE_BRANDS`: moon logo, "Part of MES Tools · MES Science", favicon + og image from
  `moon/img/`); never touches `bg`; `links`, `911djw` and `chatgpt` don't match and are left as they were. **Generators:** `911-alchemy`, `djw`,
  `ferrocell-specular-reflection`, `hutchison-tom-sky`, `norman-patricia-ai-email`, `conspiracy`, `crypto` and `mathiew` still emit the
  bare shell from `build.mjs`, so each `build.mjs` now ends by running `convert_mirror_pages.py --apply --only=<slug>` —
  a rebuild re-applies the shell instead of reverting it (new mirrors cloned from those templates: same one-liner).
  Idempotent (converted pages have an `#info-bar`); **dry-runs by default, `-v` lists pages, `--apply` writes.**
  `hub_swap` strips the header's A-/A+ buttons unless the page carries its own text-size script (`articleFontScale`); `conspiracy/build.mjs`
  does, and also has Collapse All / per-section fold buttons (a bare `.hidden` lost to `.card-grid`'s `display:grid`, so folds never worked
  until it became `.collapsible.hidden`) and re-runs `fix_mobile_header_controls.py` after converting, since that patch only lives in the output.
  `mes.fm/img/conspiracy-{icon,logo,logo-big}.jpg` (tile 900x600, favicon/brand 512 square, og 1200x630) come from one
  source image; the conspiracy tile sits last in the homepage `icon-grid`. `mes.fm/crypto` (2026-09-25) is the same kind of
  hub (own `build.mjs`, Posts card grid, `BRANDS['/crypto']`, `img/crypto-{icon,logo,logo-big}.jpg`; its tile sits between Science
  and Hutchison Effect, and its five post mirrors carry the Crypto brand + "Part of MES Crypto"). The art is one ChatGPT-made
  scene (a Bitcoin coin beside a red Hive-hexagon coin over a blockchain-node network), cut three ways: the 3:2 image resized
  to the 900x600 tile, a square crop around the coins for the logo, and a second wide render cropped to 1200x630 for og:image.

- `build_tool_apps.py` — builds the four stand-alone calculators (`earth-curvature-calculator`, `gematria`,
  `impermanent-loss-calculator`, `unit-conversion`; cards on `calculators.html`) as tools-hub pages from
  `tool_page_template.html` (the emoji page's shell with `@@tokens@@`). They were bare ChatGPT-era pages pasted into
  GoDaddy, so they were **rewritten from scratch** (2026-09-25): sources live in `tool_apps_src/<slug>/` —
  `content.html` (body), `app.js` (copied to `mes.fm/<slug>/js/<slug>.js`, cache-busted by `js_v` in the script's `APPS`
  table), optional `app.css`, plus `tool_apps_src/_shared.css`, the `.tu-*` widget kit (cards, fields, chips, stat tiles,
  tables, toast; `@@ACCENT@@`/`@@TINT@@` filled from `APPS`). Edit the sources, then run **both** `python3
  build_tool_apps.py --apply` (source-mode apps are rebuilt every run) and `python3 add_tool_page_controls.py --apply`
  (floating bar, A-/A+/moon, derived dark block; the four are in its `TOOLS` list). Dark-mode gotchas: colours must be
  literals (the derive step skips `var(--tint)`, so the builder inlines it) and *selected* states (`aria-pressed` /
  `aria-selected`) need hand-written `body.dark-mode` rules — see the end of `_shared.css`. What each app does: Earth
  Curvature (drop, horizon, hidden height, refraction, diagram, table), Gematria (7 English ciphers + Hebrew, letter
  breakdown, per-word table, `?q=` links), Impermanent Loss (same maths as before: IL vs hold / hold-A / hold-B, fee
  break-even, IL curve, scenario table), Unit Conversion (15 categories, "10 miles to km" search, all-units table, `?c=&v=&f=&t=`).
  The original apps' spreadsheet links are kept (gematria, impermanent-loss, unit-conversion each have their own).
  Artwork: Grok icons/share images from `~/Downloads` (`<slug>/img/logo.png` + `img/<short>-logo.png` at 90% fill with
  the corners cut transparent, `<slug>/img/logo-big.png`); all four share images are real Grok art now. Start a new tool
  page from `tool_page_template.html` the same way.
  **`share`** (2026-09-28, `mes.fm/share`, the MES Share Launcher) is built the same way but is a *tool* (card on `tools.html`,
  Media & Web): paste a post once and get per-site text for ~33 social sites (link in post / in reply / in description / "link in
  bio"), Open copies + opens the compose page. All state is localStorage (`mes-share:*`). Its art is Grok's (one combined image cut into
  `share/img/logo.png` + `img/share-logo.png` at 90% fill with transparent corners, and the 1200x630 `share/img/logo-big.png`).
  **Parsed-field copy icons** (2026-10-06): every field in Share's "Parsed fields" (title, link, description, hashtags, video link, thumbnail, Odysee slug, extra links = `F` in `app.js`) is wrapped in `.sl-iw` with a two-sheets SVG
  `.sl-fcopy` button inside its top-right corner (input gets `padding-right:2.6em`; a first version used absolutely-positioned "Copy" text pills that overlapped labels / borders). Empty field -> "Nothing to copy yet". Dark rule is `body.dark-mode #sl .sl-fcopy`. The `tools` sidebar family no
  longer lists `stats` (its wide table has no sidebar, commit 7d9da3f98), so `add_sidebar.py --family tools` can't re-add it.

- **Site search** (2026-09-28, `mes.fm/search` + a magnifier button left of A-/A+/moon on every page). Three parts:
  `build_search_index.py` writes `mes.fm/search/index.json` (~405 KB, ~90 KB gzipped) from the pages in `sitemap.xml`: title
  (before the first " | "), "where" (rest of the title), meta description (cut to ~220 chars), a category (the chips: Calculators,
  Tools, Math, Memes & Fun, Puzzles, 9/11, Hutchison Effect, Livestreams, Articles, More -- the "Part of" box decides for mirror pages,
  else the path) and a thumbnail (the gallery `-thumbnail-2` twin of og:image, a site's square `img/logo.png` instead of its
  `logo-big`, YouTube `mqdefault`, Hive images via the 320px resizer). **Re-run it after `build_sitemap.py`** whenever pages are
  added/removed/retitled. `main_js/site-search.js` = the engine (`window.MESSearch`: every word must match, word-prefix, title >
  where > URL > description, calculators/tools boosted, falls back to closest partial matches) + the header button + quick-search
  overlay (↑/↓/Enter/Esc, "/" or Ctrl/Cmd+K anywhere); the index is fetched only when search is opened. It widens the headers'
  reserved `padding-right` (header / floating bar) by the button's width at runtime. Loading: `display-controls.js` appends it on
  its ~1,000 pages; the ~207 inline-controls pages (math-hub shell, mirrors, Q/A, cubic formula, 9/11 / Hutchison / livestreams hubs)
  carry the tag, added by `add_site_search.py` (also patches the ten generators/templates, so rebuilds keep it; re-run it after
  `convert_mirror_pages.py` or any new shell page -- idempotent, dry-runs by default, `--apply` writes). The page itself is a
  `build_tool_apps.py` app (`tool_apps_src/search/`, teal `#0f766e`, `pre_js` loads site-search.js first): chips with counts, `?q=`
  / `&c=` in the URL, empty query + chip browses a section A-Z. Wired in like `share` (tools.html Media & Web card, Tools dropdown,
  cross-links, tools sidebar family, bottom ad). No `?v=` bump of display-controls.js was needed: Vercel serves `main_js/` with
  `max-age=0, must-revalidate`. Not covered: the 4 pages with no header controls (`links`, `bg`, `911djw`, `chatgpt/calculator`).

- `build_site_index.py` — **Site Index** (2026-10-03, `mes.fm/site-index`, blue `#1d6fa5`; a tools-hub page, card in `tools.html` "Media & Web", ad-free like an internal page, wide, built by
  `build_tool_apps.py` from `tool_apps_src/site-index/` like `search-engines`). A living page inventory + template audit. The script scans every HTML page under `mes.fm/` (read-only;
  skips `build.mjs` / `*template*` files; cleanUrls mapping `foo.html` / `foo/index.html` -> `/foo`; the single `_https_` HTTrack capture is kept as a flagged "HTTrack capture") and writes
  `mes.fm/site-index/pages.json` (~175 KB, ~48 KB gzipped, arrays + a `cols` header; budget 500 KB) with per page: title, description length, **section**, **template**, **generator**,
  10 feature bits (AdSense, sidebar, bottom ad, Comments, floating bar, A-/A+/moon, site search, Standard|Wide|Theatre switch, theatre restore snippet, dark mode), 21 issue bits (red = no
  description / og:image file missing on disk / no or wrong canonical / no title or h1 / broken local img-script-css ref / duplicate URL / unclassified / **shell does not match its generator**;
  amber = short or long description, no og/twitter image, relative canonical, several h1, no lang / viewport, jQuery, Bootstrap, noindex, old-subdomain assets), words, size, last git
  commit date (one `git log --name-only` pass). **Taxonomy** (ordered rules in `TEMPLATES` / `classify()`, first match wins, documented in the script docstring and on the page's
  "How pages are classified" tab): httrack, redirect-stub, not-found-stub, gallery-page (`N.html`), tool-shell (has `TOOL-DARK`), jump-to (`toc-sidebar`), qa-mirror, mirror-article (math-hub
  shell), hub-tiles (`.icon-grid`), hub-section, hub-links (crypto, mathiew), hub-cards, gallery-list (`table.memes`), puzzle-item, gallery-item, classic-calc, classic-info, legacy-bare,
  and **Unclassified** (a page no rule matches, surfaced on purpose: today `sjwkeyboard`). Generators are learned from the repo (`APPS` keys, each `build.mjs` dir + its `slug:` entries,
  `math_qa_mirrors.json`, the Nancy builder), not guessed; `EXPECTS` says which shells each generator emits. The app (`app.js`, vanilla, fetches the JSON after load) has a dashboard
  (clickable bars by template / section / generator, feature coverage with has / lacks, issue counters, "Start here" shortcuts), a filterable sortable paginated table, Grouped view, URL
  tree, Template gallery (examples per template), CSV export, Copy as Markdown, and shareable `?q=&s=&t=&g=&f=has:ads&i=attention&v=&gb=&sort=&dir=&p=&n=` URLs; cards instead of the table
  under 700px; hand-written dark rules are `body.dark-mode #si.si` (a bare `#si` loses to the generated TOOL-DARK block, which also mangles light custom properties).
  **Refresh after structural passes, new pages, rebuilds or shell changes:** `python3 build_sitemap.py` (optional), `python3 build_site_index.py --apply`, commit
  `mes.fm/site-index/pages.json`; `-v` lists pages per template, `--unclassified` lists the stragglers, `--check /path` explains one page. Idempotent (the `generated` date only moves when
  the data changes); **dry-runs by default, `--apply` writes.** Self-check: `python3 tool_apps_src/site-index-tests.py` (50 known pages must classify as expected, the unclassified bucket
  must stay <= 10, pages.json must be in budget and fresh). A new page family or shell needs a `TEMPLATES` entry + a rule in `classify()` and a line in the tests. Registered like `search-engines`
  (`add_tool_page_controls` TOOLS, `add_cross_links` / `build_search_index` TOOL_DIRS, `organize_hub_cards` media; deliberately NOT in `add_bottom_ad` / `add_sidebar`);
  redirects `/sitemap-pro`, `/site-map`, `/pages` in `mes.fm/vercel.json`. Logos are PIL placeholders (`site-index/img/logo.png`, `logo-big.png` 1200x630, `img/site-index-logo.png`).
  First run's findings: `https://mes.fm/img/logo-big.png` (og:image of the homepage, the hubs, contact/donate...) does not exist (20 pages) and ~36 meme pages point og:image at missing full-size
  images; `youtubemoney` is built by `build_tool_apps.py` but has no tool shell (`add_tool_page_controls.py` skips it: "compact-nav anchor not found" because of `no_ads`); jQuery is loaded on 99.6% of pages.
- **Calendar** (2026-09-30, `mes.fm/calendar`, a tools-hub tool: card in `tools.html` "Time & Focus", blue `#2f5fd0`). Built like `share`/`search` by
  `build_tool_apps.py` from `tool_apps_src/calendar/`; new here: an optional `lib.js` in an app's source folder is prepended to `app.js` so
  one `js/calendar.js` is served. `lib.js` = pure maths, runs in node too (`require`): moon phases (Meeus ch. 49, checked against the 2026
  new/full moon table to the minute), equinoxes/solstices (ch. 27), Western Easter, Lunar New Year (the new moon falling Jan 21-Feb 20 in UTC+8,
  or +7 for Vietnam), Hebrew and Islamic (Umm al-Qura, approximate) dates by scanning the year with `Intl`'s `hebrew` / `islamic-umalqura`
  calendars (month *names* are matched, so re-check them if a browser engine changes its labels), and the per-year holiday tables for Canada / USA /
  UK / Australia / Vietnam with weekend "observed" days. The eclipse list (`EC`, 2026-2028) is hand-entered; extend it by hand. `app.js` = month /
  year views (year: per-month fold, Collapse all), filter chips (groups in `GROUPS`; state in localStorage `mes-calendar:v1`), selected-day card,
  days-between / add-days calculator, `?y=&m=&d=&v=year` links. Year view has a month-size switch (A / A / A = Small, Medium, Large; `state.ys`, default Medium: the `.cl-year` font-size is 1 / 1.25 / 1.6em and the grid's `14.5em` column minimum scales with it, so Large is ~2x and gives more columns in Wide / Theatre). Same-day events from several regions are merged ("Good Friday CA UK AU").
  After editing the sources run `build_tool_apps.py --apply`, `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`,
  `add_bottom_ad.py --apply` (the first strips what the other three add), then `build_search_index.py`. Logo files are placeholders until Grok art lands
  (`calendar/img/logo.png`, `calendar/img/logo-big.png` 1200x630, `img/calendar-logo.png`: same names).
- `organize_hub_cards.py` — organises the card hubs `calculators.html` and `tools.html` into categories with a search
  box: cards are grouped by the `PAGES` table (calculators: School & Grades, Money & Finance, Everyday Math & Health,
  Science & Fun; tools: Text & Symbols, Time & Focus, Media & Web, Sky & Space), sorted A-Z inside a category, and emitted
  as one `<section class="hub-cat">` (heading + its own `.tbl` grid) per category under a search input and category chips
  (with counts). `main_js/hub-filter.js` filters live (every word must match title + description; `#<category>` in the URL
  preselects a chip; Esc clears). A **★ Popular** section (4 cards, duplicates) comes first, from the `popular` list in `PAGES` — picked from mes.fm/stats (`curl "https://mes.fm/api/stats?range=30d"`): Grade, Percentage, Weighted Average, GPA; Timer, Speed Reader, Moon, Emoji. The 4th card carries `hub-pop-extra` and is hidden from 900px up (three-column grid) so both the 2-column and 3-column layouts fill their rows with no hole — it shows only on the plain overview (hidden while searching or on another chip) so a search never lists a card twice; re-check the stats occasionally. **To add a calculator or tool:** put its `<td class="calc-container">` card anywhere in
  the page's last table, add its slug to the right category in `PAGES` (unmapped cards land in a trailing "More" section
  and are reported) and re-run. Idempotent; **dry-runs by default, `--apply` writes.**

- **Speed Reader 2.0** (2026-10-03, `mes.fm/speedreader`, red `#e52503` + its old Grok logos, kept; `/sr` still 308s to it) -- rewritten from the 2016 jQuery/Bootstrap page (the app code has no jQuery /
  Bootstrap; the shared tool shell still loads them for `main.js`). Built by `build_tool_apps.py` from `tool_apps_src/speedreader/` (`lib.js` + `app.js` -> one `js/speedreader.js`, `content.html`, `app.css`); title
  "Speed Reader and Read Aloud" (search index / `aside-recs.json` / the two `tools.html` cards were refreshed for it). `lib.js` (`SRLib`, pure, node-tested by `node tool_apps_src/speedreader-tests.js`, 21 tests) =
  cleaning + HTML/Markdown to text, tokenising (sentence ends skip `Mr.` / initials / `"Why?" she said`, em dashes split), focus letter (`orpIndex`), chunking (never across a sentence), pacing (`chunkFactors` for smart
  pauses is speed-independent so a slider drag only redoes `timelineFrom`; slow start is applied at play time), ETA, `speechChunk` (whole sentences up to ~200 chars, offsets into the cleaned text), `wordAtChar`,
  `detectLang` + `pickVoice` (prefers local voices: they send word-boundary events, many online ones don't), `?wpm=&chunk=&mode=` params. Three modes: **Speed read** (silent RSVP: word placed by measuring the pre-focus
  width and `translateX`/`scale` about the focus letter, so every word's red letter sits on the guide and long words shrink to fit a phone), **Read aloud** (Web Speech API, text view highlights word + sentence), **Read + listen**
  (RSVP driven by the voice). Speech notes: pause = cancel and resume = restart from the current word (Chrome's pause/resume is unreliable); the next sentence is queued at `onstart` of the current one (no gap); a few utterances are
  kept referenced (Chrome GC bug); a 3.5 s watchdog retries a speak() that never starts; if a voice sends no `boundary` events within ~0.8 s the highlight / RSVP word follows `speechDelay` estimates and a note says so; no
  speechSynthesis -> the two speech modes are disabled with a message. State is localStorage `mes-speedreader:v1` (text, settings, position; nothing is uploaded; settings link carries no text). Dark mode: stage colours
  (`data-th` light/dark/sepia/night, Auto follows `body.dark-mode`) are literals restated under `body.dark-mode #sr ...` -- **hand-written dark rules must use the `#sr` id prefix**: the derived `TOOL-DARK` block keeps `.tu`
  and is emitted later at equal specificity, so a plain `body.dark-mode .tu .x` rule silently loses (the Play button went dark). Gotchas while building: `build_tool_apps.py` rebuilds every app and `add_sidebar`/`add_bottom_ad`
  rewrite other sessions' pages, so a one-slug rebuild script (`build_from_source` + `add_tool_page_controls.patch` + `add_sidebar.patch_page`/`aside_html` + `add_bottom_ad.patch`, speedreader only) avoids churn; and the
  shared scratchpad dir is shared between agents (name scratch files uniquely). Logos: unchanged (`speedreader/img/logo.png` 176 px and `logo-big.png` 250 px square, Grok art; the og:image is therefore the small square, not a
  1200x630 card -- replace the same file names when a wide share image exists).
- **Calculator** (2026-10-01, `mes.fm/calculator`, rose `#c2255c`; card on `calculators.html` "Everyday Math & Health"). Built like `calendar` by
  `build_tool_apps.py` from `tool_apps_src/calculator/`: `lib.js` = pure maths (no `eval`: tokenizer + recursive-descent parser with `^`, `%`, `!`, implicit
  multiplication, `of`, deg/rad trig, `root`/`gcd`/`nCr`...; BigInt exact decimal multiply/divide with repeating-cycle detection; factorization, fractions,
  bases, Roman numerals, list stats; runs in node: `require('./tool_apps_src/calculator/lib.js')`), `app.js` = keypad + live result + history
  (localStorage `mes-calculator:v1`, `?q=` / `?tab=` links) + seven "More calculations" panels. It is registered in the same script lists as `unit-conversion`
  (`add_tool_page_controls`, `add_bottom_ad`, `add_cross_links` CALC_DIRS, `add_sidebar` tools family, `build_search_index`, `organize_hub_cards`).
  After editing run `build_tool_apps.py --apply`, `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply`. Logos are placeholders
  (PIL-drawn) until Grok art lands (`calculator/img/logo.png`, `logo-big.png` 1200x630, `img/calculator-logo.png`: same names). The "2D Graphing Calculator / 3D"
  cards at the bottom are real `<a class="mc-link">` links now that both pages exist.

  **Phone UX** (2026-10-03): at <=700px wide or <=800px tall the display (`#mc-display`: expression + live result) is `position:sticky; top:52px` (just under the 52px `#compact-nav`; `.inner-container{overflow:clip}` is forced there because its `overflow:hidden` breaks sticky) with a shadow and a card-coloured background (dark rule uses the `#mc` id prefix). A "Scientific keys" chip above the keypad toggles the x²/sin/... block; default = hidden when display + full keypad don't fit the viewport, and the choice is saved in `mes-calculator:v1` only once the person toggles (`sciPick`; the old `sci` flag alone is ignored). On `(pointer: coarse)` the field is `readOnly` + `inputmode=none` so keypad taps don't raise the system keyboard; the "Keyboard" chip (or tapping the field) enables it. Keypad keys are >=44px with `touch-action:manipulation`; the expression scrolls to its end while typing.
- **2D Graphing Calculator** (2026-10-01, `mes.fm/2d-graphing-calculator`, capital D as requested; blue `#2160d0`) -- Desmos-style, built by
  `build_tool_apps.py` from `tool_apps_src/2d-graphing-calculator/`. `lib.js` = tokenizer + parser that emits JS source from a whitelist only (no raw user text
  is executed): functions, `x=`, implicit `F(x,y)=G`, inequalities (shaded), parametric `(x(t),y(t))`, polar `r=`, `{restrictions}` / `{0<=t<=6π}` ranges, sliders for
  free letters or `a = 2` rows, user functions `f(x)=...`, `⌊x⌋`/`⌈x⌉`/`|x|`; plus key-point numerics (zeros, extrema, intersections; node-testable).
  `app.js` = canvas renderer (grid, marching squares, adaptive function sampling that breaks at jumps/asymptotes, pan/zoom/pinch, trace, PNG, `?s=`/`?f=` links,
  localStorage `mes-graph2d:v1`). It is a wide page (`.outer-container` 80em override in `app.css`), so it is NOT in the `add_sidebar.py` collection.
  Run the same four scripts as the calculator after edits.
- **3D Graphing Calculator** (2026-10-01, `mes.fm/3d-graphing-calculator`, capital D like 2D; purple `#6a3fc4`; card on `calculators.html` "Everyday Math & Health",
  Grok art `3d-graphing-calculator/img/{logo,logo-big}.png` + `img/graphing-calculator-3d-logo.png`). Desmos-3D-lite, built by `build_tool_apps.py` from
  `tool_apps_src/3d-graphing-calculator/`. `lib.js` (`G3`, node-testable: `require('./tool_apps_src/3d-graphing-calculator/lib.js')`) = the 2D page's whitelist
  tokenizer/parser copied and extended: compiled functions take `(x, y, z, u, v, t)`, `θ` = `t`, sliders `P["a"]`, user functions `f(x, y) = ...` (1-3 args; a 2-arg one
  is also drawn). Row kinds: `surface` (`z = f(x,y)`, bare `f(x,y)`, also `x = f(y,z)` / `y = f(x,z)`), `implicit` (`F(x,y,z) = G`), `curve` `(x(t), y(t), z(t))`,
  `psurface` `(x(u,v), ...)` (ranges from `{0<=u<=2π, -1<=v<=1}`, default 0..2π), `point`, `param`, `def`; `{z < 3}` restrictions; inequalities are rejected with a hint.
  Meshing is in lib.js too, in data coordinates: `gridMesh` drops quads with a missing corner and **breaks edges that cross a jump** (bisects towards the bigger gap;
  a continuous piece shrinks, a jump / asymptote doesn't -- so `tan x`, `1/x`, `⌊x⌋` leave gaps instead of walls) and nudges removable holes (`sin(r)/r` at 0);
  implicit surfaces use **naive surface nets** (one vertex per sign-changing cell, consistent winding, checked against the gradient in the tests). `app.js` = rows / sliders /
  box inputs UI (mirrors 2D) + renderer: **three.js 0.170.0 core** (`three.module.min.js`, self-contained) is `import()`ed from jsDelivr (unpkg fallback) only after the page
  is interactive (`requestIdleCallback`), via `new Function('u','return import(u)')` so the classic deferred script still parses; no OrbitControls add-on -- the
  orbit / pan (right- or Shift-drag, two fingers) / zoom (wheel, pinch) controls are our own. If WebGL or the CDN is missing, the stage shows a message and the rows still
  work. The box is mapped to a ~10-unit scene cube (true proportions unless the x/y/z ranges differ by >4x, then each axis is stretched) and every surface is cut at the box
  by six `clippingPlanes`. Surfaces: Phong + hemisphere light + a head light that follows the camera; per row (⚙) solid or **by height** (viridis vertex colours),
  grid lines (on by default except implicit, where it is a faint wireframe) and opacity. Curves are `TubeGeometry` pieces. Labels (ticks, axis names, point coordinates) are
  HTML spans projected each frame (box mode puts them on the box edges nearest the camera); PNG export re-renders and copies the WebGL canvas in the same task, then draws
  the labels on top. Resolution drops while a slider is dragged / animated (rebuild ~260 ms later at full res); only shape changes rebuild geometry (`geoKey`), colour /
  style / opacity just restyle. Hover = raycast readout `(x, y, z)`. Also: top/front/side/iso views (tweened), Spin, Box/Axes, Grid, Deg/Rad (examples reset to Rad),
  Theatre toggle (same as 2D: `pageMode` / `pageWide`, restore snippet as `content.html`'s first line), fullscreen, `?s=` (base64 JSON incl. box + camera) / `?f=` links,
  localStorage `mes-graph3d:v1`, dark mode via a `body.dark-mode` MutationObserver. Wide page (`.outer-container` override in `app.css`), NOT in the `add_sidebar.py`
  collection. Registered in the same lists as 2D (`add_tool_page_controls` TOOLS, `add_bottom_ad` TOOL_DIRS, `add_cross_links` CALC_DIRS, `build_search_index`,
  `organize_hub_cards`). After editing run `build_tool_apps.py --apply`, `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply`,
  `add_cross_links.py --apply` (the first rebuilds every app and strips what the others add). Gotcha: re-running `add_bottom_ad.py` currently also re-orders its
  `MES-BOTTOM-AD-JS` tag after the `HUB-THEATRE-JS` block on 9 gallery pages (`bmicalculator/memes.html`, `timer/inspirational-quotes.html`, ...): harmless churn, don't commit it
  with unrelated work.
- **Graphing equation inputs** (2026-10-03, 2D + 3D): the row input is now an auto-growing `<textarea rows=1>` (`.gc-in` / `.g3-in`; `autosize()` on input, render, slider-driven text and a ResizeObserver; newlines are stripped, Enter still adds a row), so a long equation wraps instead of being cut off. >=16px font (1.1em desktop, 1.2em phones). <=640px: the row wraps, colour dot + eye/gear/X (40px targets) sit on a line above and the field spans the full row. Side panel 22em -> 27em (Theatre 24 -> 29). Symbol keys / `§` caret logic unchanged (works on textarea selection). At 375px the field is 304px wide (was ~150px beside the buttons); at 1280px 264-301px (was ~190-230px).
- **Days Between Dates** (2026-10-01, canonical `mes.fm/days-between-dates-calculator`, green `#2f7d32`; `/days`, `/days-between`, `/days-calculator`,
  `/days-between-calculator`, `/days-between-dates` 308-redirect to it in `mes.fm/vercel.json`). `build_tool_apps.py` got a `lib_from` option: the page's js is the
  calendar's `lib.js` (holiday engine `MESCal`, used for the business-day holiday regions) + its own `lib.js` (`DC`, date maths on "naive" wall-clock ms: calendar
  months with end-of-month clamping, user-chosen unit combinations `breakdown()`, weekday counts, business days, ISO week, DST-aware elapsed via Intl) + `app.js`.
  Inclusive-end option, time of day, weekend picker, custom days off, shareable `?start=&end=&u=` links. Logos are PIL placeholders until Grok art lands.
- **CAS / Derivative / Integral calculators** (2026-10-02; `mes.fm/cas-calculator` slate `#334155`, `mes.fm/derivative-calculator` fuchsia `#c026d3`,
  `mes.fm/integral-calculator` amber `#b45309`; cards in the new **"Algebra & Calculus"** category of `calculators.html` together with `calculator` and the 2D / 3D
  graphing calculators; Grok art `<slug>/img/{logo,logo-big}.png` + `img/<slug>-logo.png`). A real computer algebra system: **SymPy running in the browser via Pyodide**,
  in a Web Worker shared by all three pages. Built by `build_tool_apps.py` from `tool_apps_src/<slug>/` (`content.html` + `app.js`, which only builds requests and renders
  results) with two new `APPS` options: `pre_js=CAS_JS` (loads the shared client + UI first) and `css_extra=["_cas.css"]` (shared CSS, *inlined* so
  `add_tool_page_controls.py` derives its dark theme too). Normal-width pages with the "More like this" sidebar (in `add_sidebar.py`'s tools collection, so they get
  Standard | Wide | Theatre), registered in the same lists as `calculator` (`add_tool_page_controls` TOOLS, `add_bottom_ad` TOOL_DIRS, `add_cross_links` CALC_DIRS,
  `build_search_index`, `organize_hub_cards`). Shared files in `mes.fm/main_js/cas/`:
  - `engine.py` -- *all* the maths, one entry point `handle(json) -> json` (ops `parse`, `diff`, `integrate`, `solve`, `cas` (simplify/factor/expand/apart/together/
    trigsimp/cancel/rationalize, evaluate, limit, series, sum, product, matrix), `plot`, `ping`). Input normaliser for student syntax (`2x`, `sin x`, `sin^2 x`, `sin^-1 x`,
    `sinx`, `|x|`, `log_2(x)`, `e^x`, `√ × ÷ − · π ∞ ° ²`, Greek letters as variables -- `γ β ζ λ` typed as letters become symbols, not SymPy's gamma/beta/zeta functions,
    via `Gk_*` placeholders), then `parse_expr` with implicit multiplication / application / `^` / function-exponent transformations in a **whitelisted namespace**
    (`GLOBALS`, `__builtins__` empty; dunders, `.attr`, quotes, `:` `;`... rejected before parsing; 600-char cap). Derivative steps = our own rule-based `Differ` (constant,
    constant multiple, sum/difference, power, product, quotient, chain rule naming inner/outer function, exp / a^x / ln / log_a, trig, inverse trig, hyperbolic, `|u|`,
    logarithmic differentiation for f^g; every result checked against `sympy.diff`; real-valued symbols so `|x|' = sign x`), higher orders / partial / mixed partial,
    evaluation at a point + tangent line, implicit dy/dx for equations in x and y. Integral steps = a renderer of `sympy.integrals.manualintegrate.integral_steps`
    (`IntRender`: u-substitution, by parts incl. cyclic, partial fractions, trig substitution, rewrites...; `ln|u|` in the final answer); `DontKnowRule` anywhere ->
    no steps, `sympy.integrate` result + an honest note; definite = `F(b) - F(a)` (limits at ±oo) cross-checked against `integrate((f, a, b))` and `mpmath.quad`,
    numeric-only value when there is no closed form; verification by differentiating. Solve: polynomial path (linear isolate, quadratic with discriminant / factoring
    / formula, rational root theorem + factor + Cardano / numeric, denominators cleared + excluded values checked), **transcendental path = numeric scan first**
    (`numeric_roots`: 1,500 samples, sign changes refined by Illinois at 30 digits, touching roots via secant, poles rejected, de-duplicated; default interval [0, 2π]
    when trig, else [-10, 10]; user-editable), substitution insight (`s = sin α` when the variable only appears through one function, with the
    `ln((1+s)/(1-s)) = 2 artanh s` note), `periodicity()` for the general solution; then exact forms (`solveset` on the interval / reals, `solve`, the other Lambert-W
    branch) matched to the numeric roots. That second, slower stage is *after* an `emit({"partial": ...})`, so the page shows the numeric answer immediately and keeps it
    if the exact search times out. Systems: substitution narrative for 2 equations, Gauss-Jordan (augmented matrix rref) for linear ones, `nsolve` from several starts
    when `solve` fails. Inequalities: `solveset` + critical points / test-value table, `|u| < c` rewrite.
  - `cas-worker.js` -- `importScripts` Pyodide **0.27.7 (pinned)** from jsDelivr, `loadPackage(['mpmath','sympy'])` (SymPy 1.13.3, mpmath 1.3.0), writes `engine.py`
    (fetched as text) into the Pyodide FS, imports it, warms the parser / differentiator, installs the `emit` callback (partial results).
  - `cas-client.js` (`window.MESCAS`) -- starts the worker on first use, one request at a time, progress events, `call(req, {timeout, onPartial})`; on timeout (25 s
    default) or Cancel the worker is **terminated** (the only way to stop busy Python) and a fresh one starts on the next call (from the HTTP cache: ~2.5 s).
    WebAssembly / Worker / CDN failures reject with a friendly message. `V` in this file cache-busts `cas-worker.js` and `engine.py` -- bump it when either changes.
  - `cas-ui.js` (`window.CASUI`) -- MathJax 4 loader (jsDelivr, configured like the Nancy physics page, loaded on first use), step-tree renderer, canvas plot from
    engine samples (shaded area, roots, dark-mode aware), and `page(cfg)`: input + live preview (plain echo until the engine is up, then SymPy's reading as LaTeX;
    typing starts the engine download), symbol chips, examples, localStorage history (`mes-cas:v1`, `mes-derivative:v1`, `mes-integral:v1`), `?q=` share links that
    run on load, Copy answer / LaTeX / link, status line with progress bar and Cancel. Nothing heavy loads until the person types or presses a button.
  **Tests:** `python3 tool_apps_src/cas-engine-tests.py` (60 cases, native Python; needs `pip install sympy==1.13.3 mpmath` in a venv -- the Pyodide versions) imports
  the same `engine.py` through `handle()`; includes the Problems Plus 5 launch-angle equation `0 = 2 - sin α · ln((1+sin α)/(1−sin α))` -> α ≈ 0.9855147379 rad
  (56.4658°), 2.156077916, 4.127107391, 5.297670569 in [0, 2π]. **Rebuild:** edit `tool_apps_src/<slug>/` or `_cas.css`, then `build_tool_apps.py --apply`,
  `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply`; engine changes need no rebuild (served as-is, but bump `V` in
  `cas-client.js`). **Measured** (2026-10-02, desktop, fast connection): download ~10.1 MB compressed (18.4 MB raw: wasm 3.0, stdlib 2.3, SymPy wheel 4.1, mpmath 0.4,
  JS 0.25) + MathJax ~0.3 MB; network ~1.2 s, engine ready ~3 s after the first click when cached (cold ≈ download time + ~3 s); typical requests 3 ms-1 s (launch-angle
  equation ~1 s incl. the exact-form search). **Limitations:** SymPy can't integrate everything (non-elementary integrands give special functions or no closed form; some
  integrals time out after 25 s); integral steps exist only where `manualintegrate` has a rule; derivative steps fall back to SymPy for unusual functions; transcendental
  roots are only those inside the search interval; systems of inequalities aren't supported; `log` is the natural log (use `log10` / `log_b`).
- **YouTube Money Calculator 2.0** (2026-10-02, `mes.fm/youtubemoney`, YouTube red `#cc1f1f`) -- rewritten from the 2016 jQuery page; **still ad-free, never add ads**. Built by
  `build_tool_apps.py` from `tool_apps_src/youtubemoney/` (`content.html` + `app.js` -> `youtubemoney/js/youtubemoney.js`) with two new `APPS` options: `no_ads` (strips the template's
  deferred AdSense loader + Auto-ads guard and asserts no `adsbygoogle`/`googlesyndication` is left) and `nav_extra`/`menu_extra` (a "YouTubers" tab). The old Insticator / dclick /
  GTM-MR4PFN3 / jQuery code is gone. Maths: creator RPM (USD per 1,000 views after YouTube's cut) = topic table (`NICHES`, low/typical/high; Shorts `SHORTS` 0.01-0.07) x viewer-location
  factor, or the person's own RPM; two modes (views -> earnings per video/day/month/year with low-typical-high, and goal $ -> views needed); `?mode=&f=&v=&per=&vpm=&n=&geo=&rpm=&g=&gp=`
  share links (no Redis any more) and localStorage `mes-youtubemoney:v1`; old `/youtubemoney/s/<id>` links still resolve through `/api/share?calc=ymc`. The RPM/CPM, 55% / 45% split and Partner
  Program thresholds are written into the page text -- re-check them against YouTube Help now and then. The 2016 meme gallery stays as an **archive**
  (`modernize_youtubemoney_archive.py`: archive note on `youtubers.html` + the ten pages, "YouTubers" nav label; idempotent, `--apply`). Sidebar / recommendations: the calculator is in the
  `tools` collection of `add_sidebar.py`, the archive pages are the `youtubemoney` family; both pass through `NO_AD_DIRS` (empty top-ad slot + `data-no-ads`, which `aside.js` honours so the
  300x600 second unit is skipped too). Not in `add_bottom_ad.py`'s `TOOL_DIRS` on purpose. Registered in `add_tool_page_controls` TOOLS (floating bar, dark theme). Logos are PIL placeholders
  (`youtubemoney/img/logo.png`, `logo-big.png` 1200x630, `img/ymc-logo.png`) until Grok art lands. After editing run `build_tool_apps.py --apply` (rebuilds every app; `git checkout` the
  other apps' pages, or re-run the other scripts), then `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`.
- **VAT Calculator 2.0** (2026-10-03, `mes.fm/vatcalculator`, olive-gold `#7a6200`; card on `calculators.html` "Money & Finance", `img/vatcalculator-logo.png`) -- rewritten from the 2013 jQuery
  page (old `js/calculatorf9e3.js` deleted). Built by `build_tool_apps.py` from `tool_apps_src/vatcalculator/` (`lib.js` + `app.js` + `app.css` + `content.html`, one served `js/vatcalculator.js`); **keeps ads**
  (AdSense, sidebar, bottom ad) unlike youtubemoney: it is in `add_sidebar.py`'s `tools` collection (its old one-page FAMILIES entry was removed), `add_bottom_ad.py` `TOOL_DIRS`, `add_tool_page_controls` TOOLS,
  `build_aside_recs.py` CALC + a `CTX` "Try it" pair on `/percentagecalculator` (VAT out of 120 in the UK, Ontario HST); `add_cross_links` / `build_search_index` / `organize_hub_cards` already listed it.
  Modes: net -> gross, gross -> net, VAT amount -> both, net + gross -> the rate; itemised invoice (qty x unit price, net or gross, per-line rate, 0% = exempt / zero-rated / reverse charge) totalled **per rate**
  (VAT rounded once per rate, the usual invoice method, or per line); country + province/state picker, rate chips, currency, rounding (cent / none / whole unit / 0.05), compare two rates, quick-reference table,
  worked steps, copy sentence / text / CSV, print, click a result tile to copy. **Maths is exact**: every amount is a BigInt rational in `lib.js`, rounded only where the tax is derived (half away from zero);
  number parsing accepts `1,234.56` / `1.234,56` / `1 234,56`. Tests: `node tool_apps_src/vatcalculator-tests.js` (12 groups; run after touching lib.js).
  **Rate table = `COUNTRIES` / `CA_ROWS` / `US_ROWS` at the top of `lib.js`** (row = code, name, group, currency, tax name, standard %, [[reduced %, label]], note); to refresh, update the rows, set `RATES_VERIFIED`
  (shown on the page + in the "all countries" table, with `SOURCES`), run the tests and `build_tool_apps.py --apply` (+ the follow-up scripts below). Verified 2026-10-03 against Tax Foundation (Jan 2026 Europe table; 1 Jul 2026 US
  state table), PwC Worldwide Tax Summaries (reviewed Jun-Sep 2026), TaxTips.ca (Canada) and news checks: Thailand stays at 7% (extended to 30 Sep 2027, statutory 10%), Russia is 22% since 1 Jan 2026, Vietnam 8% temporary
  to 31 Dec 2026, India GST 2.0 = 5 / 18 / 40, Indonesia effective 11% (12% statutory on 11/12 of the base; 12% on luxury goods), Estonia 24, Finland 25.5 / 13.5, Romania 21 / 11, Slovakia 23, Nova Scotia HST 14. Brazil has no single
  rate (note only); US = state base rates only (local taxes extra, said on the page). **Share links are plain query strings**: `?mode=net|gross|vat|rate&net=|gross=|vat=&rate=&c=<ISO>&g=<province/state>&cur=<ISO|none>&round=cent|none|unit|nickel`
  and `?view=items&items=<desc~qty~price~net|gross~rate rows split by |, each field URL-encoded>&how=line`; localStorage `mes-vatcalculator:v1`. **Old `/vatcalculator/s/<id>` links**: `vercel.json` rewrites them to the page, `fromOldShare()` fetches
  `/api/share?calc=vat&id=<id>` and maps the stored `{tax, value, rate}` (tax true = "add tax", value is the net price; false / `"false"` = gross) to a mode + rate in USD (the old page showed `$`), then rewrites the URL to the query form; a
  dead id shows a notice and a fresh calculator. `/vat` 308-redirects to it (already in `vercel.json`). Logos are PIL placeholders (`vatcalculator/img/logo.png` 512, `logo-big.png` 1200x630, `img/vatcalculator-logo.png` 512) until Grok art lands.
  After editing run `build_tool_apps.py --apply` (rebuilds every app: `git checkout` other apps' pages), `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply`, then `build_search_index.py` and `build_aside_recs.py --apply`.
- **Mortgage Calculator 2.0** (2026-10-03, `mes.fm/mortgagecalculator`, cyan `#0e7490`; card on `calculators.html` "Money & Finance", `img/mc-logo.png`; `/mc` still 308s to it) -- rewritten from the 2013-2018 jQuery page
  (old `js/calculator2048.js` deleted; the folder's tutorial / formulas / dream-homes / financial-advice pages are untouched and keep their `mortgagecalculator` sidebar family). Built by `build_tool_apps.py` from `tool_apps_src/mortgagecalculator/`
  (`lib.js` + `app.js` + `app.css` + `content.html`, one served `js/mortgagecalculator.js`); **keeps ads**: in `add_sidebar.py`'s `tools` collection, `add_bottom_ad.py` `TOOL_DIRS`, `add_tool_page_controls` TOOLS, plus three "Try it" `CTX` cards in
  `build_aside_recs.py` (Canada 10% down, 30 vs 15 years, extra $250 a month). Three modes: **My payment**, **How much can I afford?** (US 28/36; Canada GDS 39 / TDS 44 at the stress-test rate, bisection on the price, legal minimum down payment respected;
  generic 28/36 elsewhere, labelled a guideline), **Payment -> loan size**; both of the latter have an "Open in the payment calculator" button. Country presets (US / Canada / UK / Australia / Other: switching only replaces fields still at the old preset's
  example value): US PITI + PMI (charged while the balance is above 80% of the original price, 0.6% placeholder, 0.3-1.5% typical; HPA 80% request / 78% automatic noted) + jumbo note above the 2026 conforming limit $832,750; **Canada** CMHC premium on the base loan
  by LTV (80.01-85 2.80%, 85.01-90 3.10%, 90.01-95 4.00%, +0.20% over 25 years) added to the mortgage, minimum down 5% of the first $500k + 10% up to $1.5M, 20% from $1.5M (insured cap), 25-year insured amortization (30 for first-time / new-build box),
  fixed = semi-annual compounding / variable = monthly, stress test = max(rate + 2, 5.25) shown with the qualifying payment, "term" (balance at the end of it) + renewal-rate scenario; **UK** repayment / interest-only (= balloon of the whole loan) and an optional
  England / NI SDLT (bands from 1 April 2025, first-time buyer relief up to GBP 500k, +5% additional property); all six frequencies (monthly, semi-monthly, bi-weekly, accelerated bi-weekly = monthly/2, weekly, accelerated weekly = monthly/4), balloon,
  extra monthly / yearly (paid at each anniversary) / lump sum on a date, one-time rate change (ARM after N years; Canada renewal), full schedule (yearly roll-up with expandable payments, or every payment), balance + cumulative-interest SVG chart with hover readout and
  "principal overtakes interest" marker, stacked yearly bars, compare two scenarios (rate / term / frequency), +/-1% sensitivity table, copy sentence / CSV / link, print. **Maths is whole cents**: payment from the annuity formula rounded to the cent, interest rounded half-up
  on every payment with exact BigInt arithmetic (nominal rate / payments per year); only Canadian semi-annual compounding uses a double periodic rate; the last payment clears the balance to exactly 0.00. Tests: `node tool_apps_src/mortgagecalculator-tests.js` (21 groups,
  incl. $300,000 at 6% / 30y = $1,798.65, FCAC's $100,000 / 5% / 25y semi-annual = $581.60, CMHC tiers, SDLT, affordability). **Rules tables = top of `lib.js`** (`RULES_VERIFIED`, `SOURCES`, `cmhcBp`, `minDownCA`, `qualifyingRateCA`, `SDLT_*`, `CONFORMING_2026`); verified 2026-10-03 against
  CMHC's premium table page (its own "last updated" stamp reads 2018, the 0.20% surcharge appears there), Canada.ca's 15 Dec 2024 reform release ($1.5M cap, 30-year amortization), OSFI's MQR page (re-confirmed Jan 2026), GOV.UK SDLT rates, FHFA 2026 limits and the CFPB PMI page.
  Not modelled: Scotland LBTT / Wales LTT, non-resident SDLT, provincial sales tax on the CMHC premium (cash at closing), Canadian land-transfer tax, prepayment limits, daily-accrual interest. **Share links are plain query strings** (`?r=ca&p=650000&dp=10&du=d&i=4.5&y=25&f=accbiweekly&xm=200&rs=1&ry=5&rr=6&cy=15&cr=5 ...`;
  keys in `QMAP`/`QBOOL` in `app.js`); localStorage `mes-mortgagecalculator:v1`. **Old `/mortgagecalculator/s/<id>` links**: `vercel.json` rewrites them to the page, `fromOldShare()` fetches `/api/share?calc=mc&id=<id>` and maps the stored `{value, dp-percent, loan (term in years), date, rate, tax, pmi,
  pmi-months (ignored: PMI now ends by LTV), balloon}` to a US / USD calculation, then rewrites the URL; a dead id shows a notice. Hand-written dark rules are prefixed `body.dark-mode #mc` (the generated TOOL-DARK block would win otherwise). Logos are PIL placeholders
  (`mortgagecalculator/img/logo.png` 512, `logo-big.png` 1200x630, `img/mc-logo.png` 512) until Grok art lands. After editing run `build_tool_apps.py --apply` (`--only=mortgagecalculator`), `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply`, then `build_search_index.py` and `build_aside_recs.py --apply`.
- **Grade Calculator 2.0** (2026-10-06, `mes.fm/gradecalculator`, indigo `#575fab` = the old brand colour; one of the five most visited pages, ~5,100 views / 30 days) -- rewritten from the 2013 jQuery page (old `js/calculatorffaf.js` deleted; the folder's memes / study-tips /
  tutorial / weighted-average / `br` pages are untouched and keep their `gradecalculator` sidebar family). Built by `build_tool_apps.py` from `tool_apps_src/gradecalculator/` (`lib.js` + `app.js` + `app.css` + `content.html`, one served `js/gradecalculator.js`); **keeps ads**: in
  `add_sidebar.py`'s `tools` collection, `add_bottom_ad.py` `TOOL_DIRS`, `add_tool_page_controls` TOOLS, two "Try it" `CTX` cards in `build_aside_recs.py`; info bar `Home | Weighted Average | Memes | Calculators | Tools` (`nav_extra` / `menu_extra`). **Model:** a *course* =
  name, target %, mode (`known`: current grade + final weight, or `items`: rows of name / score / out of / weight), several courses per person as tabs (+ Course, duplicate, clear, delete with Undo). Needed on the final = (target - base) / remaining * 100 where base = sum(w*g)/100 over *graded* rows and
  remaining = 100 - sum of graded weights (a row with a weight but no score is "still to come" and stays inside the remaining weight, labelled "what is left"). Statuses: ok / secure (needed <= 0) / impossible (> 100) / nofinal / over (weights > 100). Also: target chips with letter labels (common US scale, only a label),
  course-grade range meter, what-if slider, needed-for-each-target table (40-100 step 5), "All my courses" overview (click a row), Even weights, grade % typed directly back-fills score / out of. **Persistence + switching devices:** localStorage `mes-gradecalculator:v1`; "Copy link to all my courses / this course" =
  `/gradecalculator?s=1<base64url of [cur,[[name,target,mode,cur,fw,[[n,s,o,w]...]]...]]>` (no server, no account; opening one *adds* the courses, skips exact duplicates, replaces a still-blank starting course, then clears the query), plus JSON backup / restore. Simple links `?target=&current=&weight=` open a known-mode course.
  **Old `/gradecalculator/s/<id>` links**: `vercel.json` already rewrites them to the page; `loadOld()` fetches `/api/share?calc=gc&id=` and `GC.fromOldShare()` maps `{desired, current, weight}` or `{desired, ass: [[score, outOf, weight]...]}` to a course. Tests: `node tool_apps_src/gradecalculator-tests.js` (49 checks, incl. the
  42.10% case from the old page). Dark rules are `body.dark-mode #gc ...`. Logos are the old Grade Calculator art (`gradecalculator/img/logo.png`, `logo-big.png`). After editing run `build_tool_apps.py --only=gradecalculator --apply`, `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply` (each rewrites other
  tool pages: `git checkout` the churn), then `build_search_index.py` and `build_aside_recs.py --apply`. Percentage and BMI followed the same day (see below).
- **Weighted Average Calculator 2.0** (2026-10-06, `mes.fm/gradecalculator/weighted-average-calculator`, URL kept: ~2,300 views / 30 days) -- a sub-page of the Grade Calculator brand built by `build_tool_apps.py` from `tool_apps_src/weighted-average-calculator/`
  (`lib.js` maths + share encoding, `app.js`, `app.css`, `content.html`; tests `node tool_apps_src/weighted-average-tests.js`). New `APPS` options for a page that lives *inside another site's folder*: `out` (html path), `js_path` (served script, here
  `gradecalculator/js/weighted-average-calculator.js`), `url` (public path for canonical / og:url / JSON-LD) next to `brand` + `tab`; `add_tool_page_controls.py` TOOLS and `add_sidebar.py`'s tools collection / `add_bottom_ad.py` TOOL_DIRS accept `"<folder>/<page>.html"` entries for such pages.
  Rows of name / grade / weight; weighted + plain average, share of total per row, "how it is worked out" table, Equal weights, paste from a spreadsheet (tab / comma / space, optional name), decimals, copy result / spreadsheet table. localStorage `mes-weighted-average:v1`;
  `?s=<encoded list>` links (no server) and `?g=90,80&w=3,4`. Dark rules `body.dark-mode #wa ...`. The old page had no share feature, so no old-link mapping exists.
- **GPA Calculator 2.0** (2026-10-06, `mes.fm/gpacalculator`, green `#5a812d`; old `js/calculatorffaf.js` deleted, the folder's tutorial / grade-point-average / gpa-scale-4 / gpa-scale-433 pages are untouched) -- built from `tool_apps_src/gpacalculator/` (`lib.js`, `app.js`, `app.css`, `content.html`; tests `node tool_apps_src/gpa-tests.js`, 54
  checks). One Grade box per course takes a **letter or a percentage** (mixed is fine; percentages are rounded to a whole number first, the old tables: 4.0 = 93/90/87/83/80/77/73/70/67/65, 4.33 = 90/85/80/77/73/70/67/63/60/55/50), credits (blank = 1), optional Honors +0.5 / AP-IB +1.0 (never on an F) with the
  "Weighted GPA" tick, 4.0 / 4.33 scales (letters incl. D-), several **terms** as tabs, optional prior GPA + credits for a **cumulative GPA**, an "all terms" table, and a **what GPA do I need next** planner (cumulative target + next credits). localStorage `mes-gpacalculator:v1`; `?s=` links (everything or this term);
  old `/gpacalculator/s/<id>` links: `loadOld()` -> `/api/share?calc=gpa` -> `GP.fromOldShare()` (stored `{type, scale, grades:[[percent | letter points, credits]]}`; letter points map back to the scale's letter, 4.00 = A). Dark rules `body.dark-mode #gp ...`. Registered like the Grade Calculator (tools collection, bottom ad, TOOLS).
- **BMI Calculator 2.0** (2026-10-06, `mes.fm/bmicalculator`, magenta `#b3529d`; old `js/calculatorffaf.js` deleted, the folder's bmi-chart / bmi-formula / body-mass-index / health-tips / memes / sports pages untouched) -- built from `tool_apps_src/bmicalculator/` (`lib.js`, `app.js`, `app.css`, `content.html`; tests `node tool_apps_src/bmi-tests.js`, 50 checks).
  **kg / cm are the stored truth** and both unit systems (kg, cm and lb, ft, in) mirror each other as you type; default units from the browser locale (en-US = US). BMI is rounded to 1 decimal before the category (24.95 counts as overweight, as before). Scales: **WHO** (severe / moderate / mild thinness < 16 / 17 / 18.5, normal 18.5-24.9, overweight 25-29.9,
  obese I / II / III from 30 / 35 / 40) or **Asian (WHO Asia-Pacific)** (overweight from 23, obese from 27.5). Shows the healthy weight range for the height (BMI 18.5 to 24.9 / 22.9), how much to gain / lose to reach it (same formulas as the old page), BMI Prime, Ponderal Index, a gauge and a category list. "Save this measurement" keeps dated entries (kg + cm + note)
  with a BMI-over-time SVG chart over the category bands, CSV copy, delete with Undo. localStorage `mes-bmicalculator:v1`; links `?kg=&cm=` (or `?lb=&ft=&in=`, `&scale=asia`) for one result and `?s=` with the whole history; old `/bmicalculator/s/<id>` links -> `/api/share?calc=bmi` -> `BM.fromOldShare()` (`{weight kg, height cm}`).
  Not for under-20s (the page says so and links the CDC child calculator). Dark rules `body.dark-mode #bm ...`. Registered like the Grade Calculator (tools collection, bottom ad, TOOLS); the BMI sidebar family keeps its other pages.
- **Percentage Calculator** (2026-10-06, `mes.fm/percentagecalculator`) -- deliberately *evolved*, not rewritten: ~4,900 of its ~5,300 monthly views are direct / bookmark traffic, so the page markup, the ten sentence-style calculations, the "?" formula boxes, "+" extra rows and the Custom layout (drag to reorder / collapse, localStorage `pcLayout`) are unchanged.
  Only the script changed: `js/calculator6da2.js` -> **`js/percentagecalculator.js`** (`?v=3.0`). New: input parsing accepts `1,234.50`, `1.234,5`, `12,5`, `$1 200`, `15%` and **negative numbers** (the old code stripped everything but digits and dots, so `-20` became 20); a row shows no answer until its inputs are filled (it used to show `0.00` for a half-filled row);
  one delegated handler for every row; the values are **saved in localStorage `mes-percentagecalculator:v1`** (including extra rows) and restored on the next visit; **Share Calculations is now a plain link** `/percentagecalculator?s=1<base64url of the 10 equations' raw input rows>` (no server; the box shows it and copies it); old `/percentagecalculator/s/<id>` links still load through `/api/share?calc=pc`;
  click an answer to copy it; a **Clear all** link in the layout toolbar; `inputmode=decimal` + `aria-live` answers; half-up rounding on trusted decimal digits (15% of 1200.5 = 180.08, not the float 180.07). **Labels + Save** (same day, ported from the app's `www/vendor/app-features.js`; script `?v=3.1`): toolbar links **Labels** (shows a text field above each calculation, e.g. "Personal taxes"; the label also prefixes the collapsed summary) and **Save** (names the current numbers + labels, up to 20 characters, shown as chips under the toolbar: click to open, x to delete with a click-to-undo toast); localStorage `mes-percentagecalculator:labels`, `:labels-shown`, `:saves`. Share links carry the labels when there are any (`{d: rows, l: labels}`; a plain rows array is still read, so earlier links keep working). Open replaces the current rows (`clearRows()` then `apply()`).
  **The Capacitor app** (`percentagecalculator-app/`) is built from a *pinned copy* of the old page and script in `percentagecalculator-app/site-legacy/`
  (`build-www.py` reads index.html and calculator6da2.js from there; tutorial / how-to still come from the live site) because its rewrite rules and `app-nav.js` assume the old markup and no `/api`; re-pin deliberately after testing an app build. (iOS build 8 is in review: nothing about the app changed.)
- **Timer family** (2026-10-06; `mes.fm/timer` + `/countdown-timer`, `/stopwatch`, `/alarm-clock`, `/pomodoro-timer`, `/interval-timer`, `/countdown-to-date`; Timer brand `#a86706` + the old timer logo; `timer/img`, `timer/audio` and the inspirational-quote galleries stay in `mes.fm/timer/`; old `js/calculator3661.js` deleted).
  **One script, seven pages:** `tool_apps_src/timer/` (`lib.js` pure helpers, `app.js`, `app.css`, `content.html` template with `{{VIEWS}}` / `{{CUSTOMIZE}}` / `{{SEO}}`, `seo/<slug>.html` per-page text). `build_tool_apps.py` got `src` (share another app's source folder), `content` and `vars` (`{{KEY}}` placeholders; a value starting `@` = a file) options and creates new page folders; the six sub-pages use
  `src="timer"`, `js_path="timer/js/timer.js"`, `brand=dict(slug="timer", ...)` and `tab=N` (info bar `Home | Countdown | Stopwatch | Alarm | Pomodoro | Interval | Date countdown | Clock | Time Zones | Quotes`; the Time Zone Converter's bar got `Clock | Timer` the same day). `<div id="tm" data-views="cd,sw,al" data-customize="1">` decides what a page shows: **`/timer` shows countdown + stopwatch + alarm all at once by default** (the user's requirement; timer-tab.com does not do this),
  a "Show:" bar adds Pomodoro, Interval timer and Date countdown, a Layout switch picks **Stacked** or **Side by side** (CSS grid `repeat(auto-fit, minmax(20em, 1fr))`), and the grip handle on every panel header, countdown card and stopwatch card **drags to reorder** (`sortable()`: pointer events, FLIP animation, autoscroll near the screen edge, Arrow keys on the focused grip; slot swaps when the pointer
  passes the first 70 px of a tall panel). The other pages show one panel big, plus a "Also show this on the All Timers page" switch (they all share localStorage `mes-timer:v1`, so a timer made on one page is the same one on another). **Panels:** Countdown (up to 8 labelled timers, presets 30 s - 1 h, h/m/s boxes, +1 min, full screen per card), Stopwatch (up to 6 labelled stopwatches, laps with fastest / slowest marked once there are 3,
  copy laps), Alarm (up to 6 labelled alarms, daily, snooze 5 / 10, only rings while the page is open: said on the page), **Pomodoro** (focus / short / long, rounds, auto-advance, sessions finished today, label; `TM.pomoNext`), **Interval** (get-ready / work / rest / rounds, presets Tabata, 30/15, 40/20, EMOM, boxing; WORK / REST colours, beep cues and a 3-2-1; `TM.itvPlan` / `itvAt`),
  **Date countdown** (up to 12 events with name + date + optional time, live d / h / m / s, Quick-add Christmas etc., `?date=2026-12-25&name=Christmas`). **All timing is from `Date.now()` timestamps** so a background tab, reload or throttled interval never drifts; running timers survive a reload and anything that finished while the page was closed is reported. Sounds: the two old mp3s + WebAudio beeps / chime, volume, once / 3 times / until
  stopped (audio is unlocked by the first click), tab-title time, Wake Lock, notifications, tenths. Keys: Space, L (lap), F (full screen). **Display mode** (`📺 Display` in the bar, key `D`, `?display=1`): a full-screen overlay (`#tm-dp`, appended to `<body>`) with just the times of the selected timers as big tiles (label, time, progress bar, running / paused / done border, WORK / REST colours); "Choose timers" lists every countdown, stopwatch, alarm, Pomodoro, interval and date event (`S.display` = selected keys, default = whatever is active); wake lock while open; works from every timer page. Links: `?t=25m&label=Focus&start=1`, `?show=cd,po`. Tests: `node tool_apps_src/timer-tests.js` (47). Short aliases in `vercel.json`: `/timers`, `/countdown`, `/alarm`, `/sw`, `/pomodoro`, `/hiit`, `/tabata`, `/interval`, `/days-until`.
  Registered everywhere the tools are (`add_tool_page_controls` TOOLS with home `/timer`, tools sidebar collection, bottom ad, cross links, search index, hub cards "Time & Focus" with PIL-drawn icons `img/<slug>-logo.png`). The A+ text-size overflow of the old page is gone (flex-wrap layout). Dark rules `body.dark-mode #tm ...`.
  **Window view, size and fit** (2026-10-06, for big screens used in a browser window rather than full screen): the bar has `⤢ Window view` (key `W`, `?window=1`, remembered as `S.win`: `body.tm-win` turns `#tm` into a fixed full-window layer showing only the bar + panels; Esc / the button exits), a size group `− 100% + ⤡ Fit` (`S.zoom` 0.4-2.5 = `font-size` in em on `#tm-secs`, deliberately *not* CSS `zoom`, so the drag-reorder maths stays right; keys `+ - 0`) and, in window view, a bottom-right corner grip (drag up-left = smaller, down-right = bigger; touch pinch and Ctrl+scroll / trackpad pinch work too). **Fit** (`S.fit`) binary-searches the largest zoom whose content fits the window and re-fits on window resize and when the panels' height changes (MutationObserver, so adding a timer re-fits). Layout is now **Auto** (default: `repeat(auto-fit, minmax(20em, 1fr))` in em, so shrinking the size fits more columns) or **Stacked**; saved `row` = Auto. Full screen is now *opt-in*: a card's ⤢ / key `F` and the 📺 Display fill the browser window; while one is open a `#tm-fsbar` (and Display's own bar) offers `⛶ Full screen` (real Fullscreen API on `<html>`) and Close, and the choice is remembered (`S.fs` = `win` | `screen`). Esc leaves real full screen first, then closes the overlay. `js_v` bumped to 4 on all seven timer pages.
- **Short Links** (new 2026-10-06, `mes.fm/go`; `/redirects`, `/short-links`, `/shortlinks`, `/urls` 308 to it; card in `tools.html` "Media & Web"; wide + **ad-free** like Site Index, not in the sidebar / bottom-ad lists; green `#0e8a6a`, Grok art logos since 2026-10-06 (`go/img/logo.png`, `logo-big.png`, `img/go-logo.png`)) -- lists every entry of the **`redirects`** array of `mes.fm/vercel.json`, categorized and searchable.
  **`build_redirects_index.py`** (dry-runs by default, `-v` lists the checks, `--apply` writes `mes.fm/go/redirects.json`; re-run it after editing `vercel.json`, after `build_site_index.py` so destination titles are fresh) reads vercel.json + the Site Index (titles / sections of internal destinations) + the optional hand-written `mes.fm/go/notes.json` (`{"/source": {"note": "", "category": "", "topic": ""}}`).
  Per redirect: kind (internal = a mes.fm page, external, wild = `:path*` pattern), category (internal: the destination's Site Index section, calculators folded into "Calculators"; external: by host: YouTube, Video sites, Files & folders, Apps & extensions, Social & chat, Shop & referrals, Articles & posts, Other sites; wild: "Path redirects"), topic (keyword regexes in `TOPICS`),
  and **checks**: `dup` (same source twice: Vercel uses the first; `/blockchain-playlist` is listed twice today), `chain` (destination is itself a source), `loop`, `gone` (internal destination not a page), `shadow` (a real page sits at the source address). **The `rewrites` array is deliberately never published**: it holds the password-protected finance apps (/mfa, /ai, /portfolio, /taxes, /sov, /assets ...) and the `/s/<id>` share-link rewrites.
  The page (`tool_apps_src/go/`: `content.html`, `app.js`, `app.css`, no lib): stats, search over short name + destination + title + category + topic + note (`/` focuses it), category chips with counts, Topic / Sort selects, Inside mes.fm / Other websites / Path patterns chips, "Need a look" (click = only the flagged ones), Copy per row, copy the filtered list as Markdown or a spreadsheet table, URL state (`?q=&c=&t=&k=&sort=&x=1`), and an **Add a short link** helper (checks the name is free, flags self-loops and two-hop chains, prints the exact `{ "source": ..., "destination": ..., "permanent": true },` line to paste into vercel.json).
- **Clock** (new 2026-10-06, `mes.fm/clock`, blue `#2563a8`; card in `tools.html` "Time & Focus", `/online-clock` 308s to it) -- built from `tool_apps_src/clock/` (`lib.js` Intl-based zone maths, `app.js`, `app.css`, `content.html`; tests `node tool_apps_src/clock-tests.js`, 33 checks). Digital / analog (SVG face, smooth second hand via animation frames) / both, 12 / 24 h (default from the browser locale),
  seconds, date, week number + day of the year, any IANA time zone typed as a city (`resolveZone`: "tokyo" -> Asia/Tokyo), up to 8 world clocks (day / night icon, offset, hours ahead / behind the main clock), colour themes Auto / Dark / Night red / Green / Amber / Blue (custom properties on `.ck-main[data-theme]`; hand-written `body.dark-mode #ck .ck-main ...` rules are needed or the page's dark text colour wins),
  full screen (button, `F`, or double-click) with Wake Lock, optional time in the tab title. Links: `?tz=Asia/Tokyo&mode=analog&h=24&theme=night&sec=0`. localStorage `mes-clock:v1`. Registered like the other tools (TOOLS, tools sidebar collection, bottom ad, cross links, search index). Logo = Grok art (2026-10-06: `clock/img/logo.png` 512, `img/clock-logo.png` 352); `clock/img/logo-big.png` is the Grok share image too, and the six timer-page tile logos (`img/<slug>-logo.png`: hourglass, stopwatch, alarm clock, tomato, interval bars, calendar) are Grok art on the Timer brown.
- **Enigma Machine** (new 2026-10-06, `mes.fm/enigma`, brass `#8a5a14`; `/enigma-machine`, `/enigma-simulator`, `/enigma-decoder`, `/enigma-cipher` 308 to it; card in `tools.html` "Text & Symbols") -- built by `build_tool_apps.py` from `tool_apps_src/enigma/` (`lib.js` + `app.js` + `app.css` + `content.html`, one served `js/enigma.js`). Simulates **Enigma I** (rotors I-V, reflectors A/B/C), **M3** (I-VIII, B/C) and **M4** (Beta / Gamma + thin B/C), with ring settings, start positions, a 10-cable plugboard, and the middle rotor's **double step**. `lib.js` (`EN`, pure, node-testable) is checked against the independent `py-enigma` library on 270 random configs (0 mismatches; py-enigma has no reflector A) and `node tool_apps_src/enigma-tests.js` (AAAAA -> BDZGO, ADU->ADV->AEW->BFX->BFY stepping, reciprocity, never-itself, M4 Beta+B-thin == M3 B, crib search). UI: model / reflector / rotor columns (select + typeable window letter + ring), plugboard as text *and* clickable sockets (colour per pair), Input -> Output (groups of 5 / 4 / plain / keep punctuation; non-letters never step the machine), lampboard + keyboard (QWERTZ, click or type anywhere), "rotors now" read-out, **signal-path table** for the last letter, examples (test vector, hello, weather report, "Break a message"), and a **crib search** (all 17,576 start positions with the rings / reflector / plugboard as set; optional every rotor order = 5.9M settings, ~15 s with a progress bar; crib at start / at letter N / anywhere = first 60 places that do not make a letter equal itself). The plugboard must be known (the real Bombe used loops for that; not modelled). State localStorage `mes-enigma:v1`; share links `?m=M3&r=I,II,III&rg=AAA&p=AAA&u=B&pl=AB.CD&t=TEXT&f=5`. Dark-mode colours of the panel are custom properties (`--en-*`, restated under `body.dark-mode #en`). Registered like the other tools (`add_tool_page_controls` TOOLS, tools sidebar collection, bottom ad, cross links, search index, hub cards). Logos are Grok art since 2026-10-06 (`enigma/img/logo.png` 512 with transparent rounded corners, `logo-big.png` 1200x630 share image, `img/enigma-logo.png` 352). After editing run `build_tool_apps.py --only=enigma --apply`, `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply` (each rewrites other tool pages: `git checkout` the churn), then `build_search_index.py`, `build_aside_recs.py --apply`.
- **Voice Typing Test** (new 2026-10-06, `mes.fm/typing-test-voice`; `/voice-typing-test`, `/dictation-test`, `/speech-to-text-test`, `/voice-test` 308 to it; card in `tools.html` "Time & Focus", Typing Test brand with a **Voice** tab next to Transcribe on all three pages) -- the speaking twin of the Typing Test: read the on-screen passage aloud, the browser's `SpeechRecognition` (Chrome / Edge / Safari; Firefox has none) types it, scored with the transcription test's `lib.js` (`TC.score`: accuracy by character edit distance, WPM = correct characters / 5 / minutes from the first recognised word to the last result). Built by `build_tool_apps.py` from `tool_apps_src/typing-test-voice/` (`lib_from=["typing-test", "typing-test-transcribe"]`, own `app.js` + `content.html`, `app.css` = the transcription page's plus a few `.tv-*` rules). Ends on Done / Ctrl+Enter, or by itself 2.6 s after ~90% of the passage was heard; Chrome ends "continuous" sessions after pauses, so `onend` restarts and keeps the text. **Boards** `tv-short|medium|long` and `tv-all` in `api/typing-leaderboard.js` (`?summary=1&set=tv`, `mine`, admin delete all aware); scores post with `d="v"` (microphone icon), >= 90% accuracy, same token / rate-limit rules. Person id + name shared with the Typing Test (`mes-typingtest:v1`); own state `mes-voicetest:v1`. Mic access can't be scripted: it was tested with a mocked `SpeechRecognition`, so check on a real Chrome desktop, Chrome Android and iOS Safari. Grok icon / share image (`typing-test-voice/img/logo.png` 512 transparent corners, `logo-big.png`, `img/typing-test-voice-logo.png` 352). Don't run `add_tool_page_controls.py` output over `typing-test/index.html` without diffing: the rebuild strips its compact-nav block (the Voice tab was patched into it by hand).
- **MES Science sections** (2026-10-06): `science/sections.mjs` + `science/build.mjs` now emit the hub plus `science-posts`, `science-videos`, `science-tutorials` (the "MES Science Tutorials" playlist `PLai3U8-WIK0GhjCHmTw1XbqMD_EdVKdd9`, newest first, Hive links where they exist) and `physics` (the first 9 videos of the "MES Physics" playlist `PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N`, playlist order; `science-videos` keeps the last 14 of the same list). Tile-only entries (no page written) link the Earth Curvature Calculator, Moon and Solar System Today. Same recipe as the other hubs: icon = 900x600 crop of the newest / first thumbnail, `iconVersion` to refresh. `mes.fm/math` got the same tile-only entries for the math tools.
- **Stats icon dark-mode fringe** (2026-10-06): `stats/img/logo.png` / `img/stats-logo.png` had a grey / whitish rim baked in around the blue shapes (anti-aliased against a light background), visible as jagged edges on dark pages. Fixed without new art: every pixel recoloured to the icon's flat blue (53,155,253), alpha smoothed (blur + levels), tile logo remade at 352 px from the 512 original. Same recipe for any flat one-colour icon with a halo.
- **YouTube Money charts** (2026-10-03, `tool_apps_src/youtubemoney/`): a collapsible "Charts" `<details open>` under the results (`#ym-charts`), dependency-free inline SVG redrawn at the container's pixel width (`drawCharts()` in `app.js`, ResizeObserver; ad-free as ever): low/typical/high range per period, 12-month cumulative projection with the person's own growth assumption (`gr` state / `&gr=` link param, 0-20%/month, earn mode only), RPM-by-topic bars with whiskers (click or Enter selects the topic; dashed line = typed RPM; Shorts row), and in goal mode views needed for $100-$50k goals (entered goal highlighted). Each chart has `role="img"` + aria-label summary, per-element `<title>` and a `.ym-sr` data table. Dark rules are `body.dark-mode #ym svg .ymc-*` (the extra `svg` beats the generated TOOL-DARK twin). Charts only read `rpmRange()` / the render rows; the maths is unchanged.
- **How much do YouTubers make?** (2026-10-03, `mes.fm/how-much-do-youtubers-make`, red `#cc1f1f`; **a sub-page of the YouTube Money site, no tools-page card and no logo of its own** (its header, favicon and og:image are youtubemoney's: the new `brand=dict(slug, title, tag)` + `tab` options in `build_tool_apps.py`; Home goes to `/youtubemoney`, info bar `Home | Channels | YouTubers | ...` with Channels active, the same two tabs on the calculator; the floating bar's 3rd `TOOLS` element in `add_tool_page_controls.py` points it at `/youtubemoney`); `/youtubers-earnings`, `/youtuber-earnings`, `/youtuber-income` 308 to it in `vercel.json`) -- a
  leaderboard of 54 big channels (MrBeast, T-Series, Cocomelon, SET India, Vlad and Niki, Kids Diana Show, Like Nastya, PewDiePie, Mark Rober, MKBHD ... across kids, music, gaming, news, sports, food, finance, tech, science) with
  **estimated ad revenue** (low / typical / high, per month and per year), companion of `/youtubemoney` and **ad-free like it** (`no_ads`). Wide tool page built in source mode by `build_tool_apps.py` from
  `tool_apps_src/how-much-do-youtubers-make/` (`lib.js` maths, `app.js` UI, `app.css`, `content.html` with the disclaimer, method, FAQ + FAQPage JSON-LD); not in `add_sidebar` / `add_bottom_ad`; registered in `add_tool_page_controls`
  TOOLS, `add_cross_links` / `build_search_index` CALC_DIRS (like youtubemoney). Tests: `node tool_apps_src/how-much-do-youtubers-make-tests.js` (estimate maths, geo, Shorts blend, sort/filter/CSV/query, snapshot schema, the Vercel
  function with a mocked fetch, and that the RPM tables still equal `youtubemoney/app.js`'s `NICHES`/`SHORTS`). **Model:** monthly views = median views of the last ~15 long-form uploads older than 7 days x uploads per month (last 90 days, else
  the sample's span); RPM = the calculator's topic low/typical/high x audience-location factor (`geo`, an *assumption* per channel), blended with the Shorts RPM by the page's "share of views that are Shorts" select (default 0); yearly = x12.
  Back-catalogue views, Shorts, sponsorships, merch, memberships and Premium are *not* included (said on the page). `lib.js` holds a **copy** of the calculator's RPM tables: when `youtubemoney/app.js` changes them, copy them over (the test fails until you do).
  "Calculate this channel" links use the calculator's own share query (`/youtubemoney?mode=earn&f=long&v=<monthly views>&per=month&n=<topic>&geo=<factor>`). State in the URL: `?q=&t=&sort=&dir=&geo=&sh=`.
  **Data:** `mes.fm/how-much-do-youtubers-make/data/channels.json`, a dated snapshot written by `python3 update_youtuber_snapshot.py --apply` (dry run by default; `--only=handle,...`; the channel list, topic key and assumed
  audience are the `CHANNELS` table at its top; ids resolved once, then reused). Source = YouTube Data API v3 when env `YOUTUBE_API_KEY` is set (adds exact subscribers, lifetime views, video count, channel age, exact views; ~110 quota units
  of the free 10,000/day), else **yt-dlp** (what the first snapshot, 2026-10-03, used: subscribers as shown on the channel page = 3 significant figures; views of the newest uploads as displayed = rounded, e.g. 5.9M; upload dates day-level;
  lifetime views / video count / channel age are not available this way and are `null`, listed in each channel's `missing`; the page then shows "not in this snapshot" and no lifetime cross-check). HYBE LABELS and Aaj Tak were tried and dropped
  (no view counts on the Videos tab / no long-form uploads in the listing); BabyBus read 2 subscribers. Shorts share is not collected (`shortsShare: null`). **Refresh workflow:** `python3 update_youtuber_snapshot.py --apply`, `node tool_apps_src/how-much-do-youtubers-make-tests.js`,
  commit `data/channels.json` (no rebuild needed: the page fetches it). **Live refresh:** `mes.fm/api/youtuber-stats.js` (CommonJS like `api/inflation.js`; same JSON shape; `s-maxage=86400, stale-while-revalidate=604800`) re-reads the committed
  snapshot's channels from the API; no input from the client; no key -> HTTP 503 `{"error":"no key"}`; API failure -> 502; both `no-store`; the key is never echoed. The page's "Refresh live numbers" button replaces the numbers on 200 and says
  "Live refresh is not set up yet" on 503/404. **To switch it on:** (1) Google Cloud Console -> new project -> enable "YouTube Data API v3" -> Credentials -> Create API key; (2) restrict the key to the YouTube Data API v3 (API restrictions; no HTTP referrer
  restriction, the call is server-side); (3) Vercel -> the mes.fm project -> Settings -> Environment Variables -> add `YOUTUBE_API_KEY` as a plain **project-level** variable (Shared Environment Variables do not reach functions on this account), Production;
  (4) redeploy. Then run `update_youtuber_snapshot.py` locally with the same key exported to upgrade the committed snapshot too. It has no artwork of its own (uses the YouTube Money logo). After editing the sources run `build_tool_apps.py --only=how-much-do-youtubers-make --apply` and `add_tool_page_controls.py --apply` (`git checkout` the churn it causes on `calculator` / `search-engines`), then `build_search_index.py` and `build_sitemap.py`.
- **Inflation Calculator 2.0** (2026-10-02, `mes.fm/inflationcalculator`) -- rewritten; the 2018/2019 MySQL-era snapshot and the Google Charts / jQuery code are gone.
  **Data is live:** `mes.fm/api/inflation.js` (Vercel function, edge-cached `s-maxage=12h` + `stale-while-revalidate=7d`) pulls World Bank `FP.CPI.TOTL` (annual, ~190 countries),
  FRED `CPIAUCNS` (US BLS CPI-U, monthly since 1913), StatCan vector 41690973 (Canada, monthly since 1914) and ONS `D7BT` (UK CPI, monthly since 1988) and returns one JSON
  (`v:2`, per country `{iso, cur, a:{s,v}, m:{s,v}}`; `a` = complete years only, the client derives the current year's YTD average from `m`; BLS skipped Oct 2025, so an annual mean needs >= 11 months).
  If one publisher fails its source is filled from the committed snapshot `inflationcalculator/data/inflation-data.json` (flagged `stale`); refresh that snapshot with
  `node mes.fm/api/inflation.js --write` (exits non-zero if any source failed). UK years before 1988 come from `data/uk-long-run-pre-1989.json` (the old retail-price-based long-run series),
  scaled to join the CPI in 1988 -- disclosed on the page. `data/legacy-cpi-2019.json` is the *old* snapshot, kept only so old `/inflationcalculator/s/<id>` share links (which stored CPI values, not years)
  can be mapped to the closest year; new share links are plain query strings (`?c=&s=&from=&to=&amt=`, `from`/`to` = `2000` or `2000-03`), no Redis. Front end = `js/inflation.js` (vanilla) + Chart.js 4 from jsDelivr
  (unpkg fallback): charts are `responsive` so Standard / Wide / Theatre resize them live (the old Google charts needed a refresh), each card has Expand (fixed full-screen overlay, Esc closes),
  PNG, range select and log scale; the data table has filter, newest-first, CSV, Expand. Don't use `container-type` on `#ic-app` -- it would become the containing block of the fixed Expand card;
  a ResizeObserver sets `data-w` instead. Page-level CSS is inline in `index.html` (so `display-controls.js` derives the dark theme); chart colours follow `body.dark-mode` via a MutationObserver.
  **Compare countries** (same day): the inflation chart card has a "+ Compare with..." select (up to 4 countries, removable chips, `&cmp=A|B` in share links). Each compared country uses its
  best source (monthly when the main chart is monthly and it has monthly data, else annual; an annual-only country on a monthly chart shows its year's rate); lines get their own colours
  (`cmpColors()`), a legend appears, and the main line's red/blue sign colouring and fill switch off while comparing.
  The inflation chart also has a **Log scale** toggle: rates can be negative, so it is a symmetric log (`y = sign(v)*log10(1+|v|)`; data plotted transformed, ticks from `SL_TICKS`, tooltips read the untransformed `dataset.raw`).
  **Money Facts links** (`add_inflation_fact_links.py`, idempotent, `--apply` writes): the eight facts that state an old price (bread, soup, gasoline, household income, first cell phone / PC, 1970 house, 1896 speeding ticket)
  get an "Adjust it for inflation" box after `#main-content`; `js/fact-cta.js` fills in today's value from `data/inflation-data.json` and the button opens the calculator pre-filled (`?c=&s=&from=&amt=`; `to` omitted = latest).
  Add a page to `FACTS` to extend it. The sidebar's "Try it" cards for the calculator and Money Facts pages are `CTX` entries in `build_aside_recs.py`.
  Bump `?v=` on the `inflation.js` tag when it changes.
- `add_page_theatre.py` -- **page-width switch** (2026-10-01): the "Wide page" pill on the sidebar pages (`aside.js`) and the Wide pill on the Jump-to pages
  (`toc-flip.js`) became a **Standard | Wide | Theatre** segmented control (>=1200px / >=1300px only). Saved as localStorage `pageMode` (`std|wide|theatre`);
  theatre also writes `pageWide=1` and sets `html.page-theatre` *in addition to* `html.page-wide`, so every Wide rule still applies and theatre just adds "use nearly
  the whole window" (`aside.css`: `.outer-container.has-aside` / `.container.has-aside` -> `min(98vw, 2400px)`, 6-column "More like this" grid; `toc-flip.css`:
  `--toc-w` up to 2000px with the Jump-to sidebar kept beside the article -- on screens under ~1800px that equals Wide, since the centred article has to leave room
  for the sidebar). The script back-fills the early `<head>` restore snippet (1,100+ pages, the Jump-to `build.mjs` generators, `add_sidebar.py` HEAD_BLOCK,
  `add_toc_flip.py`); re-run it after cloning an old page. Idempotent; dry-runs by default, `--apply` writes. Pages with their own wide logic (`2d-graphing-calculator`,
  `stats`) and the sidebar-less hubs do not have the switch. The calendar also got sticky side arrows (previous / next month or year), left/right arrow keys and swipe.
- **Wide / Theatre keep the sidebar + ad on any widescreen** (2026-10-02, `aside.css` end + `aside.js`; thresholds lowered the same day after "shouldn't the sidebar still show on widescreens by default
  unless they hide it?"): from **1360px** up the "More like this" column (ad + cards) sits *beside* the content in all three width modes unless the person hides it -- Wide: frame `min(98vw, 1492px)`
  (content ~1096px on 1560px+, ~976px at 1400px); Theatre: frame `min(98vw, 2400px)` (content 1231px at 1660px). Only at 1200-1359px do Wide / Theatre fall back to one column with the
  sidebar as a 4/6-column card grid under the content (ad neither shown nor requested). `aside.js` calls `loadAd()` after every mode change and (debounced) on window resize and only requests
  the ad when its slot is visible. Rationale: the people who pick Wide / Theatre are on big monitors, i.e. the most valuable ad impressions.
- **Sidebar rework** (2026-10-02, `aside.js` sections 1 / 2b / 4, `aside.css`, `build_aside_recs.py`): (1) the column is **no longer sticky** -- ad first, then the related cards run down the side with the
  page. (2) **Cross recommendations**: calculator / meme / puzzle / tool / timer pages get a "Free math video tutorials" block, the math-hub article pages (`math-qa`, `cubic-formula`,
  `vector-functions-problems-plus`) a "Free calculators" block, appended by JS from `main_js/aside-recs.json` (curated slug lists in `build_aside_recs.py`, titles/thumbnails from
  `search/index.json` -- run it after `build_search_index.py`); it keeps adding cards until the column is as tall as the content next to it (3-100 cards, so it ends at the footer, re-checked when the content grows or shrinks via a ResizeObserver; extra cards are trimmed again) -- block 1 = the cross-family recommendations, block 2 = filler (more of the page's own family from `aside-random.json`, or the 77-page `mathall` pool for math pages) -- or one row of four when the sidebar sits under the content.
  Not shown on the 9/11 / Hutchison / science / conspiracy / crypto / mathiew / livestreams mirrors. (3) **Hide**: a `›` button next to the switch-sides arrow hides the sidebar (the content takes
  the full width; "Show sidebar" appears as a 4th segment of the Standard | Wide | Theatre switch); saved as localStorage `asideHidden`, restored before first paint by the head snippet
  (`add_page_theatre.py` second pass, also in `add_sidebar.py` HEAD_BLOCK). Only >= 1200px where the sidebar sits beside the content.
- **Smart recommendations + Jump-to rail** (2026-10-02, `build_aside_recs.py` -> `main_js/aside-recs.json`, `aside.js` section 4, `jump-aside.js/css`, `add_jump_aside.py`): the sidebar blocks are
  *context-aware*: every page gets topic tags (`tags.fam` by `data-aside-family` + `tags.pat` path regexes) and items carry tags `g`; blocks are ranked by overlap (ties shuffled).
  Calculator-world pages: "Try it with MES tools" (only where a page has `ctx` deep links) / "Related calculators & tools" (ranked: the percentage calculator gets Grade, Inflation, VAT
  first), "Free math video tutorials", "More from MES" (own family), "More free calculators & tools". Math pages: "Try it with MES tools" -- **deep links that open a calculator with
  the page's own example typed in** (`CTX` in the script: Problems Plus 5 -> CAS with the launch-angle equation + 2D graph of it; Problems Plus 6 -> a 3D helix; cubic formula -> CAS cubic
  + 2D graph; ...) -- then "Calculators for this topic", "More math tutorials" and "Math memes & puzzles". **Math Q/A livestream replays are only ever recommended on other
  `/math-qa*` pages** (pool `qa`, never in `math` / `mathall`; decided 2026-10-02: they look poor outside their own section). Jump-to pages (`cubic-formula`, `vector-functions-problems-plus`,
  `moon`; the Hutchison / ferrocell / Norman Patricia / Nancy reports are left alone on purpose) get the sidebar as a **fixed rail on the side opposite the "Jump to" list from 1500px**
  (`jump-aside.js` builds the markup and loads `aside.js`; Wide / Theatre shrink the article by the rail's width via `--toc-w`; hide / show shares `asideHidden`). Re-run
  `build_search_index.py` then `build_aside_recs.py --apply` after adding pages.
- **Second sidebar ad (300x600)** (2026-10-02, `aside.js` `AD2_SLOT`, `aside.css` end): after the 7th card in the column (counted over the page's own related cards + ours) a labelled, fenced-off
  "Advertisement" box with a responsive Vertical AdSense unit (300x600 / 160x600), only when the content is at least ~760px taller than the column at that point (so short pages never get it), never on the Jump-to rail,
  requested lazily (IntersectionObserver, 300px margin) and collapsed by the same blocker/unfilled watcher as the top ad (more cards then fill the space). **On since 2026-10-02: `AD2_SLOT` = `2932057652`** (the unit; was off until it was set) -- the
  slot id of the AdSense unit "Sidebar Half Page 300x600" (Display, Vertical, Responsive); `?aside-debug` shows a hatched placeholder where it would go (checked: 7 cards, ad, then 40 more cards down to the footer).
- **Cluster + graphing recommendations + "Show sidebar" after an automatic collapse** (2026-10-02): (1) the 9/11, Hutchison and conspiracy pages recommend only each other (`aside.js` `CLUSTER`: 9/11 pages ->
  9/11, Hutchison, conspiracy in that order; Hutchison -> Hutchison, 9/11, conspiracy; conspiracy -> conspiracy, 9/11, Hutchison), never calculators or math; pool `cl` in `aside-recs.json` is built
  from each page's own `data-aside-family`, minus hubs and the graphic jumper clips (`BAD` in `build_aside_recs.py`). **crypto** and **science** pages get the full mix (their own family first -- `cl.crypto` / `cl.science`, tiny pools -- then ranked related calculators/tools (Impermanent Loss first for crypto), math videos, more tools); **mathiew** pages (humour) recommend only math memes (`aside-random.json` `memes`); `livestreams` still gets none. (2) The 2D / 3D
  graphing calculators (wide pages, no column) carry `<aside class="mes-aside mes-aside--inline" data-aside-family="graphing">` in their `content.html` + `aside.css` / `aside.js` tags: a 4-column card grid
  under the tool (up to 12: "Try it with MES tools" deep links like the derivative of x² sin x, related calculators, math videos). (3) When Wide / Theatre collapse the sidebar below the content (1200-1359px),
  "Show sidebar" appears in the width switch and brings it back beside the content (`html.aside-force`, localStorage `asideForce`; choosing any width resets it).
- **Livestream recommendations** (2026-10-02): `build_aside_recs.py` also writes pool `ls` = the numbered MES livestreams from `livestreams/playlist.json` (public + upcoming), tagged by topic from their
  titles (`TOPIC` regexes: hutchison / 911 / conspiracy / science / crypto-AI), with the stream's mes.fm mirror page as the target where one exists (140, 141) and the YouTube video otherwise (opens in a new
  tab, `x: 1`). `aside.js` `LS_PREFS` decides who gets which: Hutchison -> hutchison, science; 9/11 -> 9/11, hutchison, conspiracy; conspiracy -> conspiracy, 9/11, hutchison; science -> hutchison, science;
  crypto -> crypto, science, hutchison -- as a "Related MES livestreams" block (up to 8, best topic match first) right after the page's own family block. **Never on math, calculator, tool, meme or mathiew
  pages.** Also new: blocks are now *mixed in proportion* (3 : 2 : 2 : 1 ...) instead of filled one after the other, so a short page's column still shows a bit of everything.
- `add_hub_theatre.py` -- the **Standard | Theatre** switch on the sidebar-less hub pages (2026-10-01; `calculators`, `tools`, `mobile-apps`, `puzzles`, `memes`
  and the thumbnail-gallery / quote list pages: every page with the `HUB-WIDE-LAYOUT` marker and no "More like this" sidebar, 62 pages). `main_js/hub-theatre.css` + `.js`;
  same saved `pageMode`/`pageWide` preference as `add_page_theatre.py`'s switch, so Theatre carries across the whole site. Theatre = `.outer-container` up to
  `min(98vw, 2400px)` and the card grid / thumbnail grid switching to `auto-fill` columns (calculators page: 3 -> 5 columns at 1700px). Head block `HUB-THEATRE-HEAD`
  restores it before first paint. **Math-hub family too** (added later the same day): `math`, `math-qa` and the other `math/build.mjs` section pages, `hutchison` + its 9 section pages, `911` + 6, `conspiracy` + 2, `science` + 2, `livestreams`, and the `mes.fm` homepage -- detected by the `.outer-page-content` + `.page-title` + `.icon-grid`/`.card-grid` shape (no Jump-to nav); their six `build.mjs` generators (`math`, `hutchison`, `911`, `conspiracy`, `science`, `livestreams`) carry the head/script blocks so a rebuild keeps the switch. Theatre there also lifts `.wide { max-width: 75em }` and makes `.icon-grid` / `.card-grid` `auto-fill` (math hub 3 -> 5 tile columns, Hutchison posts 3 -> 6 cards at 1800px). `crypto`, `mathiew` and `djw` (bare `.container` shells made by `convert_mirror_pages.py`) are covered too via the `EXTRA` list in `add_hub_theatre.py`: `hub-theatre.js` falls back to the first `.container` (class `hub-host-container`), and their `build.mjs` re-runs `add_hub_theatre.py --apply` right after the conversion so a rebuild keeps the switch. The four sidebar-less math-shell Hive mirrors (`911-coat-jumper`, `911-jumper-launched`, `stanley-praimnath-jumpers`, `eyesiswatchin-donate`: ad-free graphic 9/11 clips + a donate page) are in the same `EXTRA` list; every other Hive mirror already has the sidebar pages' Standard | Wide | Theatre switch. Not covered: the bare pages `911djw`, `links`, `bg`, `sjwkeyboard`, `chatgpt`, `contact`/`donate`/`privacy-policy`, `youtubemoney`, and the Hive-mirror article pages (they have the sidebar switch) and the Jump-to pages (their own switch).
  Idempotent; dry-runs by default, `--apply` writes. Run it after `widen_hub_pages.py` / `widen_gallery_pages.py` for any new hub page.
- **Dark-mode contrast pass** (2026-10-02, after "text in Tips is hard to read"): (1) `tool_apps_src/_shared.css` ends with `body.dark-mode .tu {--accent:@@ACCENT_LIGHT@@ !important}` where
  `build_tool_apps.py`'s `light_accent()` lightens each app's accent (same hue) until it has >=6:1 contrast on the dark page, so links / outlines / filled-button text no longer use a
  dark purple (3D) or slate (CAS) that vanished on `#1a1a1a`; `.tu-seo dd/dt` and the unit converter's selected category now have explicit dark colours. (2) `main_js/site-search.js`:
  the pages' CSS reset paints every `span` `#333`, so the search overlay's result titles / key hints were unreadable in dark mode -- `#mes-search span,kbd,mark{color:inherit}` fixes it
  site-wide. (3) `display-controls.js`: an expanded `.hide-div-button.selected` bar (Comments, Important Notes...) is white on blue in dark mode. (4) Hand-written rules after the
  `TOOL-DARK:END` marker (outside the generated block, so `add_tool_page_controls.py` keeps them) on `timer` (selected gray / blue buttons), `youtube-thumbnail` (Get Thumbnail) and
  `timezone` (links). To audit a tool page: toggle `body.dark-mode` and compute text-vs-background contrast for every text node under `#main-content` (flag < 3.5); the scan found
  nothing left on the calculator, graphing, days, CAS/derivative/integral, calendar, search, share, unit, gematria, earth, impermanent, emoji, latex, symbols, speedreader, stats pages.
- `add_cross_links.py` — cross-links calculators and tools in the horizontal info bar: calculator pages (the calculator
  mini-sites and the four rebuilt apps) get a **Tools** item (-> `/tools`), tool pages (timer incl. its quote galleries,
  speedreader, emoji, latex, timezone, symbols, youtube-thumbnail, stats) get **Calculators** (and Tools where missing),
  so the apps and tools read `Home | Calculators | Tools | ...`. The item is inserted in front of the first Donate /
  Subscribe / Contact Us item (MES.fm stays last); `main.js` highlights the active tab by position, so pages whose active
  index is at/after the insertion point get an explicit `info_bar_tab` one higher. `build_tool_apps.py` /
  `tool_page_template.html` emit both links for the apps; `percentagecalculator-app/build-www.py` strips the Tools item
  from the app build. Idempotent; **dry-runs by default, `--apply` writes.** New calculator / tool directories: add them to
  `CALC_DIRS` / `TOOL_DIRS`.

- `widen_hub_pages.py` — brings `calculators.html`, `tools.html`, `mobile-apps.html`, `puzzles.html` and `memes.html` up to
  the wide `mes.fm` / `mes.fm/math` page format (`.outer-container` 50em -> 75em). Calculators/tools/mobile-apps become 3
  columns of taller stacked cards on >=900px; puzzles/memes stay 4 columns but fluid (thumbnails fill the page, `srcset`
  picks the 432px `-thumbnail.jpeg` over the 161px `-thumbnail-2.jpeg`). Also adds
  `main_js/display-controls.js` to those pages **and `index.html`**: it injects the A-/A+/moon controls (left of the
  hamburger, pinned into the floating compact bar), the text-size handlers and page-scoped dark mode, sharing the
  `articleFontScale`/`theme` localStorage keys with `mes.fm/math` (whose build.mjs has its own inline copy — keep the two
  visually in step). Idempotent; **dry-runs by default, `--apply` writes.**

- `add_sidebar.py` — the "More like this" side column (2026-09-25: piloted on `percentagecalculator`, then rolled out the same day to
  `gradecalculator`, `gpacalculator`, `bmicalculator`, `mortgagecalculator`, `inflationcalculator`, the `timer` quote pages, then
  `vatcalculator`, `pokemongocalculator` and the mes.fm-level `memes/` and `puzzles/` galleries = 925 pages; the two galleries have no
  calculator, so their `hub` card links the gallery and thumbnails come from `mes.fm/img/memes-thumbnail` (found via each page's main image when
  the slug differs); puzzle `solution.html` pages get the aside but are never recommended (`hide_files`); never the gallery/hub pages,
  numeric pagination pages or tool-shell pages; timer/speedreader/emoji/... tool pages, youtubemoney and the build.mjs / Hive-mirror
  pages are deliberately left out). `FAMILIES` is config-driven: per family its
  gallery-item `sections` (folder, card label), tutorial-type top-level pages become the articles; thumbnails are found by
  `<slug>-thumbnail[-2]` anywhere under the family's `img/`. At >=1200px `.outer-page-content` becomes a
  grid: the usual 46em content column + a 300px sticky `<aside id="mes-aside">` (300x250 ad slot + 4 related-page cards + 1
  random card from `main_js/aside-random.json`), with a button to move it to the other side (`html.aside-left`, localStorage
  `asideSide`). Below 1200px there is no ad and no columns — the cards just sit under the content. Assets: `main_js/aside.css`,
  `main_js/aside.js`. Per page, marker-delimited: `MES-ASIDE-HEAD` (css link + saved-side script), `has-aside` on
  `#outer-container`, `MES-ASIDE` (the aside, inserted before the `</div>` that closes `.outer-page-content`), `MES-ASIDE-JS`.
  Cards are static links (crawlable internal links), picked by rotating through the family list so inbound links spread evenly. The random card's title comes from `aside-random.json` and is set with `textContent`, so both generators store it HTML-*decoded* (`html.unescape`); the static cards keep the page's encoded title, which the browser decodes (a title with `&#128591;` / `&#039;` used to show the raw code in the random card).
  The ad slot is AdSense unit "Sidebar 300x250" (`8429975111`, `DEFAULT_SLOT`; `--ad-slot` overrides, re-runs keep each page's own slot);
  with an empty slot the box is hidden and no ad is requested (`?aside-debug` shows where it will sit). `.inner-container`
  gets `overflow: clip` at >=1200px because its template `overflow:hidden` would otherwise stop `position: sticky` working. To
  roll out to another family add it to `FAMILIES` (needs the same `<!-- side bar -->` + `outer-page-content` markup). Keep the
  ad off `youtubemoney`, contact/privacy/donate and the graphic 9/11 mirrors. `percentagecalculator-app/build-www.py` strips the
  aside from the app build. `--remove` strips it again. Idempotent; **dry-runs by default (`-v` lists pages), `--apply` writes.**
  Same session: the percentage calculator's equation rows became wrapping flex lines (`.eq-text` sentence + Answer box) so the
  Answer no longer overlaps the inputs at larger A+ sizes.

  **Wide page option** (2026-09-30): `aside.js` ("2b") puts a "↔ Wide page" pill at the right end of the content column's title row (classic
  `.page-content`; in the math shell inside the "Part of" box), >=1200px only. On = `html.page-wide` (localStorage `pageWide`, shared by every
  sidebar page; restored before first paint by the `MES-ASIDE-HEAD` inline script, back-filled onto the ~1,100 existing pages by
  `add_page_wide.py`, emitted for new ones by `add_sidebar.py`'s `HEAD_BLOCK`): one column (content ~1070-1090px), the sidebar ad hidden
  and never requested (turning Wide off requests it then; the bottom ad is unaffected), the "More like this" cards a 4-column grid under the
  content, the ⇄ side switch hidden. CSS at the end of `aside.css`.
- `add_sidebar_math.py` — the same "More like this" column for the individual MES **article pages in the math-hub shell** (162 pages:
  Problems Plus 1-5, the MES Math Q/A mirrors, cubic-formula step pages, the 9/11 / Hutchison / conspiracy / crypto / science Hive
  mirrors; every `mes.fm/<slug>/index.html` with `<div class="container">`, a "Part of ..." box, an `<article>`, the AdSense loader and
  a Comments block). NOT the Jump-to-menu pages (911, cubic-formula, vector-functions-problems-plus, hutchison-tom-sky, moon, ferrocell,
  norman-patricia), the tile hubs (no `<article>`: conspiracy, crypto, mathiew, science, djw) or ad-free pages. This shell has no
  `.outer-page-content`, so the blocks from the "Part of" box to the Comments box are wrapped in `<!-- MES-COLS-START --><div class="mes-cols">
  <div class="mes-col-main">` ... `</div><aside id="mes-aside">...</aside></div><!-- /MES-COLS-END -->` and `aside.css` makes `.mes-cols` two columns
  from 1200px (`.container.has-aside` widens 760 -> 1092px, footer included); below that the cards sit under the comments, no ad. Cards are
  text-only (the pages' images are big video posters), taken from the page's group = the first link of its "Part of" box, plus that group's hub.
  Same aside.js/aside.css/ad slot as the classic pages (dark rules also match the shell's `body.dark`). **These pages are regenerated by
  build.mjs / build_math_qa_mirrors.py / convert_mirror_pages.py without any of this: re-run `add_sidebar_math.py` and `add_bottom_ad.py`
  after rebuilding one.** Idempotent; **dry-runs by default (`-v` lists pages), `--apply` writes**; `--remove` strips it.
- Tool pages: `add_sidebar.py`'s `tools` family (a "collection": emoji, latex, timezone, symbols, stats, speedreader, timer, youtube-thumbnail
  and the four rebuilt calculators, each recommending the others + the All Tools hub + a calculator) and `add_bottom_ad.py`'s `TOOL_DIRS`
  cover the tool-shell pages. `build_tool_apps.py` regenerates four of them: re-run both scripts after it.

- `fix_video_view_modes.py` — every video-embed page's single "Theater Mode" button becomes a Default / Wide /
  Theater trio (2026-09-27). Wide fills the page's own width (the article column, or the article+sidebar width
  on a page with the "More like this" sidebar); Theater is the existing 100vw browser-width breakout. Bug this
  fixed: Wide/Theater used to paint the widened video straight over a sticky sidebar (`.has-aside`/`.mes-cols`),
  since the video's breakout isn't in the same stacking context -- reported live on a 9/11 mirror page in
  theater mode. Fix has two parts: **(1)** this script duplicates the single `#theaterToggle` button into
  `#wideToggle` + `#theaterToggle` (stacked via inline `top:46px`/`82px`, same `.theater-toggle-btn` pill style,
  no new CSS) and replaces the boolean theater-mode IIFE with a 3-state one -- `body.video-wide` /
  `body.video-theater` track which mode is active, `.theater-mode` stays on the video itself for its existing
  CSS; **(2)** `main_js/aside.css` (hand-edited, `?v=2`, bumped repo-wide + in `add_sidebar.py`'s `ASSET_V`)
  collapses `.has-aside`/`.mes-cols` to one column whenever either body class is set, so the sidebar drops below
  the content instead of sharing a row with the widened video -- exactly the page's own <1200px shape. Wide's
  width comes free once that collapse happens (the video is already `width:100%` of its now-full-width column);
  a page with no sidebar has nothing to collapse, so Wide there just matches the page's own width. Only the
  single-video, ID-based pages (`#videoEmbed`/`#theaterToggle`) go through this script -- idempotent (checks for
  `#wideToggle` first), covers ~120 already-generated pages plus `hive_mirror_template.html`,
  `math_qa_mirror_template.html`, `cubic-formula/child-template.html` and `cubic-formula/build.mjs`'s child-page
  button. `build_math_qa_mirrors.py`'s two button-generating lines needed a hand fix instead (they live inside a
  Python string literal; the script's HTML replacement text would have broken that syntax). The handful of
  multi-video, class-delegated pages (`cubic-formula/index.html`, `vector-functions-problems-plus/index.html` +
  its `build.mjs`, `ferrocell-specular-reflection`, `hutchison-tom-sky`, `norman-patricia-ai-email`) use a
  different no-id, `.closest('.theater-toggle-btn')`-delegated JS shape (one video-embed can hold several
  players) and were fixed by hand the same way, each embed independently Default/Wide/Theater. Dry-runs by
  default, `--apply` writes.

- `add_bottom_ad.py` — a fixed 300x250 AdSense unit ("Bottom 300x250", slot `8852646945`) after the Comments block, just above the
  footer, on individual pages (started on `gradecalculator`, then rolled out 2026-09-25 to percentage, gpa, bmi,
  mortgage, inflation, the timer quote pages, vat, pokemongo and the mes.fm `memes/` + `puzzles/` galleries = 936 pages; sidebar + bottom ad share a page, the two scripts keep their `<script>` tags in a
  fixed order so either can be re-run). Per page: `MES-BOTTOM-AD` (an "Advertisement" label + a reserved 250px holder, so no layout shift) and
  `MES-BOTTOM-AD-JS` (`main_js/bottom-ad.js`: creates the `<ins>` and requests the ad only when the box is within ~300px of the
  viewport, so an unscrolled bottom ad never counts as an unseen impression). Both ad boxes (this and the sidebar's, `aside.js`) collapse
  themselves when the ad is blocked (ad blocker) or unfilled, so no empty hole is left (`watchAd()` polls ~30s). **Only pages that already carry the AdSense loader are
  touched**, which keeps it off the ad-free pages (youtubemoney, contact/privacy/donate, graphic 9/11 mirrors); numeric
  pagination stubs (`1.html`) are skipped too. Add a family to `FAMILIES` to roll out. **Two units:** the fixed "Bottom 300x250" (`8852646945`) everywhere, and "Bottom Square Responsive" (`1532113018`, responsive unit asked for `data-ad-format="rectangle"` / `data-full-width-responsive="false"` by `bottom-ad.js` via `data-ad-mode="rect"`, 310px reserved (a wide ~810x308 rectangle was served live)) on `RESPONSIVE_FAMILIES` (percentage, grade, gpa, and since 2026-09-26 `math` = the 164 article pages in the wide math-hub shell, where a fixed 300x250 looked lost in the column) so the two could be compared per ad unit in AdSense; since 2026-09-28 every family (all calculators, tools, timer, memes, puzzles, math) uses the responsive unit, and the fixed unit is only reachable via `--ad-slot`. Idempotent, `--remove` restores the pages
  byte-for-byte; **dry-runs by default (`-v` lists pages), `--apply` writes.**

- `remove_gtm.py` — removes the dead Google Tag Manager container (`GTM-T7H6J87`) from the 140 `mes.fm/percentagecalculator` pages that still
  loaded it (head snippet + body `<noscript>`). The container only held a Universal Analytics event tag (`UA-18189318-5`, dead since 2023), a
  scroll-depth listener and a custom-HTML tag pushing a `calculation` dataLayer event that only fed that dead tag: a ~390 KB `gtm.js` per page
  (and a "tracker" flag in Brave/uBlock) for no data; page views come from `main_js/track.js`. `percentagecalculator-app/build-www.py` now
  anchors its head-strip on the "Legacy Universal Analytics removed" comment that follows the old snippet (app output unchanged apart from
  whitespace). Idempotent; **dry-runs by default (`-v` lists pages), `--apply` writes.**

Run any of them with `python3 <script>.py` from anywhere (they resolve the repo root themselves). They print a
per-file report; read the output rather than assuming success — `fix_broken_internal_links.py` additionally needs
`--apply` to write anything, and reading its dry run first is the point.

Note that other agent sessions sometimes have a repo-wide pass of their own sitting uncommitted in this same working
tree. Before committing one of these, compare `git status --porcelain | wc -l` against the file count your script
reported; if there is a large gap, stage only your own paths rather than `git add -A`.

- **Copy Text** (2026-10-03, `mes.fm/copy-text`, note-yellow `#a16207`; `/copy`, `/clipboard` 308 to it; card in `tools.html` "Text & Symbols"). A clipboard shelf built by
  `build_tool_apps.py` from `tool_apps_src/copy-text/`: notes on boards, click a note to copy, pin / colour / drag-reorder, search across boards, `{date}` `{time}` `{weekday}` `{year}` `{iso}`
  placeholders filled in at copy time (`{{date}}` = literal), undo for deletes, .txt / .json export, JSON restore (merges, skips duplicates), cross-tab sync via the `storage` event. All state is
  localStorage `mes-copytext:v1` (draft in `:draft`); nothing is uploaded. Normal-width page in `add_sidebar.py`'s tools collection. `mes.fm/share` got a small "My own text" card (same idea, own
  storage `mes-share:snippets`, links to Copy Text).
  **Split into texts** (2026-10-06): the "✂ Split into texts" button beside Save runs `splitParts()` in `tool_apps_src/copy-text/app.js` on the pasted text and shows a preview list (`#cp-splitbox`) before
  saving anything: Full text (as pasted), Title (first line minus URLs / markdown, leading `#`s and trailing separators), each URL as Link / Link N (markdown links count), Description (the other paragraphs, minus URL-only lines,
  hashtag-only paragraphs and a trailing hashtag run), Hashtags (de-duplicated, as typed) are ticked by default; Title + link, each Paragraph N (when more than one) and Hashtags (no #) start unticked. Rows have an editable name + text, a tick
  box and their own Copy button; "Save ticked" adds them to the current board in list order (`addNote(..., atTop)` run in reverse). One-piece text says "Nothing to split". Same parsing idea as `share`'s `parse()` but kept separate
  (no "split the title at ` - `"); change both by hand if the rules should stay in step. Logos are PIL placeholders (`copy-text/img/logo.png`, `logo-big.png` 1200x630, `img/copy-text-logo.png`) until Grok art lands.
- **Transcription Typing Test** (2026-10-05, `mes.fm/typing-test-transcribe`; `/transcribe`, `/transcription`, `/transcription-typing-test`, `/typing-test-listen` 308 to it; card in `tools.html` "Time & Focus"). The Typing Test's
  listening twin: the text is *spoken* (Web Speech API) a phrase at a time and you type what you hear, never seeing the words. A sub-page of the Typing Test brand (the `brand` option in `build_tool_apps.py`: same logo / header /
  favicon / og:image, info bar `Home | Transcribe`, the Typing Test page carries the same tab). Built by `build_tool_apps.py` from `tool_apps_src/typing-test-transcribe/` (`lib.js` = spoken passages (3 per length), chunking, pacing
  (`rateFor` keeps the voice near natural speed, `gapAfter` pads the pauses so the text arrives at the chosen 80-180 WPM), word alignment + scoring; it uses typing-test's `lib.js` (`lib_from`) for random-word dictation; node tests:
  `node tool_apps_src/typing-transcribe-tests.js`). Scoring: accuracy = 1 - character edit distance / characters said, on lowercase letter/digit/apostrophe words unless *Strict*; net WPM = correct characters / 5 / minutes from the
  first sound to Done. Modes: Live (audio keeps its pace) or *Wait for me* (next phrase only when you have typed nearly all of the last); *Captions*; Tab replays (counted); auto-finish 2.5 s after you have typed at least as many
  words as were said. **Ranked** = passage, Live, no captions, not Strict, accuracy >= 90%: boards `tr-<pace>-<short|medium|long>` in `api/typing-leaderboard.js` (kept apart from the typing boards; `board=tr-all` merges them,
  `?summary=1&set=tr`, `?mine=` honours `tr-all`), same token / rate-limit / name rules, same popup + Only mine + sortable table as the Typing Test. The person's id and name are shared with the Typing Test through localStorage
  `mes-typingtest:v1`. **Device label (both typing pages):** a posted score carries `d` = `k` keyboard / `p` phone / `t` tablet (`myDevice()`: iPad / iPadOS-as-Mac / Android without "Mobile" with touch = tablet; other touch = phone; the rest = keyboard); the API stores it
  in the score's fraction (+0.125 / +0.25 / +0.375; none = posted before it existed), rows return `d`, `GET ?dev=k|p|t` filters server-side (ranks renumbered), the table shows a ⌨ / 📱 / tablet icon and has an All / Keyboard / Phone / Tablet filter. Self-reported.
  **Voice label** (2026-10-06): a score can also carry `d` = `v` (🎤, stored as +0.4375 in the fraction): the Typing Test flags a run as voice typing when the input box gets an `insertFromDictation` event or two or more events that add several words at once (a keyboard, even a swipe one, commits one word at a time); the post box says it will be marked, the board has a Voice chip + `?dev=v`. Self-reported and heuristic, like the other labels; old scores can only be relabelled with a one-off Redis script. Scores posted before the label existed were backfilled on 2026-10-05 (all Keyboard except two known phone scores) with a one-off script run against Redis, not kept in the repo.
  `mes-typingtest:v1`. **Searchable voice list:** `main_js/voice-picker.js` (`MESVoicePicker.enhance(select)`) turns a native voice `<select>` into a button + panel with a search box (name, language, country, online), a preview
  button per voice and keyboard support, mirroring the select (so the page's own code is unchanged); used here and on `/speedreader` (`pre_js` + one `enhance` call). Registered in `add_tool_page_controls` (floating bar
  returns to `/typing-test`), `add_cross_links`, `build_search_index`, `organize_hub_cards`; deliberately NOT given the bottom ad (the Typing Test has none either, though `add_bottom_ad.py` lists both: strip
  `MES-BOTTOM-AD` after running it). Logos are the Typing Test's (`img/typing-test-transcribe-logo.png` is a copy). After editing run `build_tool_apps.py --only=typing-test-transcribe,typing-test --apply` then
  `add_tool_page_controls.py --apply` (`git checkout` the churn on other tool pages).
- **Solar System Today** (2026-10-03, `mes.fm/solar-system-today`, indigo `#3730a3`; `/earth-today`, `/solar-system`, `/orrery`, `/planets` 308 to it; card in `tools.html` "Sky & Space"). Where the Sun,
  planets, Pluto, the Moon and Halley's Comet are on any date (clamped 1000-3000), with playback from real time to 100 years/s. Built by `build_tool_apps.py` from `tool_apps_src/solar-system-today/`;
  the page script is `lib.js` + `view.js` + `app.js` (new `js_parts` option) and `extra_js` also writes `mes.fm/solar-system-today/js/orrery-embed.js` = `lib.js` + `view.js` + `embed.js`, the limited
  widget on `mes.fm/moon` ("Earth, Moon & the Solar System Right Now": Earth & Moon / inner / whole system, play, +-1 day, Now; Ctrl+scroll zooms so the page still scrolls). **All astronomy is Astronomy
  Engine** (the copy `mes.fm/moon/js/astronomy.browser.min.js` already ships; the page loads it via `pre_js`, so don't move that file): `lib.js` = positions (heliocentric ecliptic J2000),
  geocentric view (constellation, elongation, magnitude, retrograde), Moon info, `events()` (next moon quarters, lunar/solar eclipse, equinoxes/solstices, Earth perihelion/aphelion, oppositions, greatest
  elongations -- each a "Jump" row), Halley (two-body from 1986 elements, good to a few months), zodiac boundaries. Node tests: `node tool_apps_src/solar-system-tests.js`. `view.js` = canvas renderer: orrery
  (drag = rotate/tilt, shift/right-drag pan, wheel/pinch zoom, "Squeeze distances" = r^p with p = 1-0.62*c so every planet fits, trails computed live, belts / Trojans as Kepler-moving particles, Saturn
  rings, procedural Earth/Moon/Jupiter), Earth & Moon (Sun fixed on the left so phases read in order; no shadow cone on purpose -- the 5 degree orbit tilt would imply an eclipse every full moon; "True
  scale" toggle; phase inset with maria) and the zodiac band. Wide page like the graphing calculators (not in `add_sidebar.py`), Theatre via `pageMode`. Dark-theme gotcha: the planetarium stage colours are
  custom properties (`--ss-bg`...) because `add_tool_page_controls.py` would lighten a literal near-black background. Logos are PIL placeholders (`solar-system-today/img/logo.png`, `logo-big.png`,
  `img/solar-system-today-logo.png`) until Grok art lands. `build_tool_apps.py --only=slug,slug` now rebuilds just those apps.

- **Search Engines** (2026-10-03, `mes.fm/search-engines`, burnt orange `#c2410c`; `/searchengines`, `/engines`, `/multisearch`, `/search-all` 308 to it; card in `tools.html` "Media & Web").
  One search typed once, opened in many engines. Built by `build_tool_apps.py` from `tool_apps_src/search-engines/` (`lib.js` = the 71-engine table + URL builder, node tests in
  `tool_apps_src/search-engines-tests.js`; `app.js` = UI). Templates use `{q}` and `{v}` (a variant: Google domains .com/.ca/.co.uk..., Bing market, DuckDuckGo region, Yahoo host, Yandex,
  Amazon, Wikipedia languages; every ticked variant is its own target). Search type (web / images / news / videos) and time range append per-engine params; engines that can't do a type
  are skipped and listed. `site:` / exact phrase / `-site:` are added only to engines flagged `ops`. Open modes: new tabs, **tiled windows** (`window.open` popup features computed by
  `tile()` from `screen.avail*`), same tab (individual links become normal anchors, so middle-click works). `window.open` is called synchronously in the click and its null return is the
  popup-blocker detector (browsers allow ONE popup per click until the site is allowed pop-ups: blocked targets go into a queue shown with a big "Open next" button, one click per engine, plus allow-pop-ups instructions; the "One at a time" mode does that on purpose) (so `noopener` is NOT passed; `w.opener = null` instead): blocked links are listed. Sets (main, privacy, censorship & bias, video censorship, SEO, AI,
  social, research, everything) + the user's own named sets (shift-click deletes), own engines (`%s` / `{q}`, http(s) only), recent searches, JSON backup/restore, `?q=&e=&t=&w=&m=` share
  links (`&a=google:images+news` = the per-card extras). Each engine card with image/news/video searches has an "Also: Images / News / Videos" row of chips (`S.extra`, `targets(..., extra)`): ticking one opens that search IN ADDITION to the page-wide type (so Google web + Google Images together; every ticked variant gets each type). localStorage `mes-search-engines:v1`. Engine URL formats drift: re-check a few now and then (the table is the only place to fix). Wide page (not in `add_sidebar.py`).

- `set_posts_tile.py` -- sets the **Posts tile** image of `mes.fm/911` and `mes.fm/bg` (`img/911-posts-icon.jpg`, `img/bg-posts-icon.jpg`, 900x600) to a new post. **Standing rule (2026-10-06): whenever you mirror a post into those Posts lists, run it with `--slug <new-mirror-slug> --apply` so the tiles use that page's FIRST image (centre-cropped), unless the user names another image / crop** (`--index N`, `--image URL|file`, `--anchor top|center|bottom`, `--box x0,y0,x1,y1` = red highlight box in source pixels, crop centres on it, e.g. a "has blocked you" screenshot). Also bumps `iconVersion` of the posts page in each hub's `build.mjs` and runs `npm run build` there (`--hubs 911,bg` to limit). Dry-runs by default; `--apply` writes. The mirror's own og:image / list-card thumbnail is separate (set in the page + `sections.mjs`).
- `fix_image_case_references.py` -- rewrites image references (src / data-src / srcset / og:image / twitter:image, root-relative, relative or `https://mes.fm/...`) whose filename differs from the file on disk only by letter case (`eyebrows.jpg` vs `eyebrows.JPG`): macOS ignores case so it looked fine locally, Vercel (Linux) 404ed (2026-10-05: 255 refs in 54 meme / dream-home / quote pages; found via Site Index "og:image file missing" + "broken local reference"). Only the filename part changes; files are not renamed, so external links to the current URLs keep working. Uses directory listings, not `os.path.exists()` (case-insensitive on macOS). Idempotent; **dry-runs by default (`-v` lists), `--apply` writes.**
- `make_hires_logos.py` -- crisp 512px tile thumbnails for the legacy 2013-2018 calculator sites (percentage, grade, gpa, bmi, inflation, pokemongo, timer): their square `img/logo.png` is only 176px, so the homepage Popular tiles, search results and sidebar cards (all drawn at 180-370 CSS px) showed it 2-4x enlarged and blurry beside the 512px logos of the newer tools. Upscales `img/logo-big.png` (250px, the only larger copy of the art) to `<site>/img/logo-512.png` (Lanczos x2, unsharp mask, Lanczos down; alpha dropped so the tile is a full colour square). `logo.png` / `logo-big.png` are untouched (headers, favicons, og:image). `build_search_index.py` prefers `logo-512.png` over `logo.png` when present; after running this re-run `build_search_index.py` then `build_aside_recs.py --apply`. `sjwkeyboard` is skipped (photographic, ~200 KB). Replace a `logo-512.png` with real hi-res art any time (same name; `--force` re-makes it). Idempotent; **dry-runs by default, `--apply` writes.**
- `fix_chapter_headings.py` -- the top-level chapter folds of the long collapsible articles (Problems Plus, cubic formula, ferrocell, Tom Sky, Norman-Patricia, Nancy physics report: all clones of the vector-functions-problems-plus shell) were `<h1 class="chapter-toggle-header">`, so a page had 4-20 `<h1>`s beside its title (Site Index "More than one h1"). Now `<h2 class="chapter-toggle-header chapter-top">`, with the shell's `.post-body h1` declarations copied to `.post-body h2.chapter-top` so the look is unchanged (verified: identical computed size / alignment / margins); the extra `chapter-top` class is needed because the *sub*-section folds are already plain `h2.chapter-toggle-header` with their own look. Patches the six pages, the five `build.mjs` generators, `nancy_physics_src/content.html` and `pdf_to_content.py` (top level emits h2 + chapter-top), so rebuilds keep it; `build_nancy_physics_article.py` inherits the CSS from the vector-functions shell. New pages cloned from those shells: run it. `911-wtc-vehicle-massacre`'s stray second h1 ("Screenshots of Video") was fixed by hand. Idempotent; **dry-runs by default, `--apply` writes.**
- `check_external_links.py` -- **read-only** dead-link report (2026-10-05: 2,577 distinct external links on 1,270 pages, ~3 min). Judges per platform: YouTube watch / shorts / live / playlist / youtu.be via oEmbed (a plain GET of a deleted video still says 200; 404 = dead, 401 = private / embedding off = "restricted"), everything else HEAD then GET (404 / 410 / DNS / refused / TLS = dead), bot walls (x.com, facebook, instagram, linkedin, pinterest, tiktok) and 401 / 403 / 429 = "blocked" (never called dead), 5xx / timeouts retried then "flaky"; mes.fm's own links are checked on disk first. Per-host concurrency + delay, so it is polite. `--out report.json`, `--host`, `--limit`. **Re-test every DEAD hit with `curl -L` before acting**: first run had false positives (Python's cert store on news.gov.bc.ca, Google help / Wolfram answering a script 404, OneDrive share links that redirect to a sign-in page and can't be verified). Run it now and then; don't schedule it.
- `fix_pagination_dead_ends.py` -- Previous / Next Page buttons (and `<link rel=next|prev>`) pointing at pages that don't exist: the paginated bmicalculator/sports "Top 10 ... Player BMI" articles' last page offered "Next Page" -> `/3` or `/4`, and page 2's "Previous Page" -> `<article>/1` (page 1 is the article page itself). `/1` Previous becomes the parent page when it exists, any other dead button is removed (5 pages, 10 links). Cleanurls aware; idempotent; **dry-runs by default (`-v`), `--apply` writes.**
- `fix_relative_canonicals.py` -- rewrites root-relative `<link rel="canonical" href="/path">` to `https://mes.fm/path` (211 pages on 2026-10-03: all puzzles, the memes/ gallery items, the card hubs, contact / donate / privacy-policy, the homepage; found by the Site Index "Canonical is not absolute" issue). Only the href changes. HTTrack `_http*` folders skipped; idempotent; **dry-runs by default (-v lists pages), `--apply` writes.** New classic pages should carry an absolute canonical from the start.

### `build.mjs` pages: never rebuild without diffing first

Several pages (currently `911`, `911-alchemy`, `conspiracy`, `crypto`, `cubic-formula`, `djw`, `ferrocell-specular-reflection`,
`hutchison`, `hutchison-tom-sky`, `livestreams`, `math`, `mathiew`, `norman-patricia-ai-email`, `science`, `vector-functions-problems-plus`, all
under `mes.fm/`) have their own `build.mjs` (`npm run build`, usually fetching a Hive post) that regenerates
`index.html` from scratch. The repo-wide scripts above (`add_lightbox_zoom.py`, `add_image_lightbox.py`, and several
`optimize_pagespeed.py` transforms — the deferred-AdSense loader, the WCAG brand-blue darkening, and the `<img>`
lazy-loading pass) patch the *generated* `index.html` directly; they don't know `build.mjs` exists, so those patches
never land back in the template. **Running `npm run build` regenerates index.html purely from build.mjs and
silently reverts any patch that only ever lived in the generated HTML** — this has already happened for real more
than once (e.g. commit `cb410eb1` had to re-apply a dropped PageSpeed pass to `mes.fm/911`, and `mes.fm/911`'s
lightbox-zoom feature was silently lost the day after it shipped, by the very next Hive-mirror rebuild, and stayed
lost for a week before anyone noticed).

As of this writing, `911-alchemy`, `djw`, `ferrocell-specular-reflection`, `hutchison-tom-sky`,
`norman-patricia-ai-email`, and `vector-functions-problems-plus` all have `addImageLazyLoading()` back-ported into
`build.mjs`, applied to the whole generated page right before `writeFileSync` — it's a line-for-line JS port of
`optimize_pagespeed.py`'s `transform_images` lazy-loading rule (skip the first non-`data:` image on the page so LCP
isn't hurt, lazy-load every other `<img>` whose `src` is an `http(s)` URL not on `mes.fm`), verified by round-
tripping each page's committed `index.html` (strip `loading="lazy"` back out, rerun the new function, diff against
the original — all reproduce exactly). `ferrocell-specular-reflection`, `hutchison-tom-sky`,
`norman-patricia-ai-email`, and `vector-functions-problems-plus` additionally have the lightbox-zoom CSS/JS and the
darkened brand-blue back-ported (each carries a `NOTE:` comment right above its `return \`<!DOCTYPE html>`
explaining this — keep it in sync if you change a source script's template). `911-alchemy` has **no lightbox markup
at all** in `build.mjs` (added straight to `index.html` by `add_image_lightbox.py`/`add_lightbox_zoom.py`); `djw`
has neither the lightbox nor a color scheme that needs the contrast fix. Both carry a `WARNING:` comment about the
still-missing lightbox. `conspiracy`, `math`, `mathiew`, and `science` were authored recently enough that their
`build.mjs` was already in sync with the lightbox/AdSense/contrast patches as of this writing. (`math` did turn out to
be missing the lazy-loading pass -- its List View thumbnails lost `loading="lazy"` on a rebuild -- so it has
`addImageLazyLoading()` back-ported too, and its AdSense block matches the committed `index.html` byte for byte, so
`npm run build` in `mes.fm/math` now reproduces the committed page exactly, apart from any new entries.)

Note `mes.fm/math/build.mjs` emits **six** pages, not one: the tile hub `mes.fm/math/index.html` plus
`mes.fm/{math-qa,sequences-series,spherical-harmonics,vectors,vector-functions}/index.html` (one section each, from
its `PAGES` array) — never hand-edit those generated files, and `git status` after a build will show all six. (The
`cubic-formula` tile is also in `PAGES`, but flagged `ownBuild`: that page is generated by its own build, below.)
`mes.fm/math-qa` also has the search box + category chips of `/livestreams` (2026-09-26): `QA_CATEGORIES` in `math/build.mjs` (title regexes:
Aether -- Ionel Dinu's series, "What is the Aether?", Michelson-Morley, stellar aberration; Electromagnetism; Free Energy; Moon; 9/11), items
get `data-cats`, and the CSS/JS (`FILTER_CSS`/`FILTER_JS`, a copy of the widget in `livestreams/build.mjs` -- keep the two in step) are emitted
only for a section that sets `filter`, so the other five pages stay byte-identical. After a `math` build, `git checkout math/link-meta.json`.

`mes.fm/hutchison/build.mjs` (2026-09-26) is **no longer a Hive mirror**: it was re-cloned from `math/build.mjs`, so `mes.fm/hutchison`
is a tile hub like `mes.fm/math` (10 icon tiles + an "Important Links" list) and emits **ten** pages -- the hub plus
`mes.fm/{hutchison-posts,hutchison-videos,highlights,articles,hutchison-debunking-debunkers,hutchison-news,hutchison-unedited-footage,
hutchison-interviews,cold-fusion-lenr}/index.html` (nine), one section each (Grid View / List View, "← Hutchison Effect"
breadcrumb), from its `PAGES` array. The Hive post `@mes/hutchisoneffect` is not fetched any more: the content (formerly its sections) lives in
`mes.fm/hutchison/sections.mjs`, hand-maintained, newest first -- to add something drop an entry at the TOP of the right section and
`npm run build`. An item is either `{ title, image, links: [[label, href], ...] }` (no network; the card goes to its first mes.fm link, else
Hive/peakd, else the first link) or `{ href, title }` for a mes.fm mirror page (thumbnail + "Watch on:" row scraped and cached in
`link-meta.json`). `mes.fm/img/<slug>-icon.jpg` (900x600) is each tile's art: for now a crop of that section's newest thumbnail --
overwrite the file with custom art (same name) any time, no rebuild needed. Never hand-edit the generated pages; their slugs are in
`improve_meta_descriptions.py`'s `GENERATED` set. The tenth tile, "MES Livestreams", is **tile-only** (`tileOnly` + `href` in `PAGES`): it
links to `/livestreams#hutchison` (the Hutchison Effect chip of mes.fm/livestreams) -- the separate `hutchison-livestreams` page was folded
into `/livestreams` (2026-09-26) and `vercel.json` permanently (308) redirects the old URL there, fragment kept; its per-stream Hive/Rumble/Odysee/Summary links live on in
`livestreams/extra-links.json`. Its icon is a hand-made crop of the newest Hutchison Effect livestream thumbnail (bump `iconVersion` when
you refresh it). The lightbox/PageSpeed back-ports listed below describe the *old* mirror build.mjs;
the new one has `math`'s shell (and `addImageLazyLoading()`).

`mes.fm/911/build.mjs` (2026-09-26) got the same treatment as `hutchison` and is **no longer a Hive mirror** (the old lightbox / PageSpeed back-port
notes for it no longer apply): a tile hub (7 tiles + an "Important Links" block) cloned from `hutchison/build.mjs`, emitting the hub plus
`mes.fm/{911-posts,911-videos,911truth,911-observable-evidence,911-short-videos,1109-keo-meteor-music}/index.html`, from `sections.mjs` (same item
shapes as hutchison's; hand-maintained, newest first; `standalone` = the reference-links line above the Grid/List buttons). The Hive post `@mes/911`
is not fetched any more. "Observable Evidence" was the one chapter not in the original brief; it got its own page rather than being dropped (its
Parts 20-22 are part of the numbered series). The last tile, MES 9/11 Livestreams, is tile-only -> `/livestreams#911`; the old section's per-stream
Hive / Rumble / Odysee / BitChute / X / Twitch / trailer links were merged into `livestreams/extra-links.json`. `PAGES[].icon` overrides the icon
filename because `img/911-truth-icon.jpg` is the *homepage's* 9/11 tile (the series tile uses `911-truth-series-icon.jpg`; don't reuse a slug's
default icon name without checking). The slug `1109-keo-meteor-music` is as requested (the artist is spelled Keor). The 43 911-branded mirror pages
got the highlighted "9/11 Truth" tab and section links in their "Part of" boxes (`brand_nav()` in `convert_mirror_pages.py`, which now handles
both the Hutchison and 9/11 brands).

`mes.fm/conspiracy/build.mjs` (2026-10-01) got the same treatment as `911` and is **no longer a flat link hub**: it was cloned from `911/build.mjs`, so
`mes.fm/conspiracy` is a tile hub (Posts, Videos tiles + the old link list as "Important Links") and emits **three** pages -- the hub plus
`mes.fm/{conspiracy-posts,conspiracy-videos}/index.html` -- from `conspiracy/sections.mjs` (hand-maintained, newest first: add a `{ href, title }`
entry at the TOP of the right section and `npm run build`). Tile art is `img/conspiracy-{posts,videos}-icon.jpg` (900x600 crops of the newest item's
thumbnail; bump `iconVersion` in `PAGES` when refreshed). The "Part of MES Links" box is gone with the old shell. A not-yet-deployed new mirror
page must be seeded by hand in `conspiracy/link-meta.json` (image) until it is live, since the scrape 404s.

`mes.fm/bg/build.mjs` (2026-10-06, cloned from `mh370/build.mjs`) emits **three** pages: the tile hub `mes.fm/bg` ("Bob Greenyer (BG)": Videos + Posts tiles and an Important Links list) plus `mes.fm/{bg-videos,bg-posts}/index.html`, from `bg/sections.mjs` (hand-maintained, newest first; items with explicit
`image` + `links` need no network). **Videos** mirror the YouTube playlist `PLdwkvCI5-tzw` ("Bob Greenyer says the darnedest things", short URL `mes.fm/bg-wildin` -> `vercel.json`) in playlist order; **Posts** are the mes.fm mirrors `bob-greenyer-con-man-subscriber`, `911-revisionist-spammer`, `911-spammer-dust-baggie` (their "Part of" boxes gain `Bob Greenyer · Posts`
via `add_bg_links.py`, which reads the Posts list; re-run it after adding a post). Tile art = the newest item of each section: `img/bg-videos-icon.jpg` (3:2 crop of the newest video's maxres thumbnail), `img/bg-posts-icon.jpg` (the Telegram screenshot fitted whole onto a matching dark 900x600 tile, since a 3:2 crop cut the message off),
`img/bg-logo.jpg` / `bg-logo-big.jpg` (512 square favicon / header logo and 1200x630 og:image = crops of the "Buzzword Bobby's Bowl of Babble" word-salad image, **for every bg page**: hub, `bg-videos`, `bg-posts` (their og:image is the big logo, not their tile icon) and `bg-notes`); replace those files (same names) for real art. `bg-notes` was converted to the standard branded mirror shell (`convert_mirror_pages.py`: `BRANDS['/bg']`, `PAGE_BRANDS['bg-notes']` with its own "Part of Bob Greenyer · Posts · Videos" box, a `BRAND_TABS` entry `BG | Posts | Videos`, and favicon + og:image from the bg logo; the converter now handles `.jpg` brand art). The **old `mes.fm/bg` page** ("BG & NS Links": Bob Greenyer's claims about Dr. Judy Wood and 9/11) moved to `mes.fm/bg-notes`; every link to it (911-posts, 911 `sections.mjs` + `link-meta.json`,
the Amaterasu mirror, sitemap) was repointed, and the hub shows it as a tile "BG & NS Links" (`img/bg-notes-icon.jpg` = 3:2 crop of the "Buzzword Bobby's Bowl of Babble" word-salad image from the article itself), next to a tile-only "MH370 Teleportation Psyop" tile (`img/mh370-icon.jpg`) like `/conspiracy`'s. Registered like mh370: `improve_meta_descriptions.GENERATED`, `add_hub_theatre.GENERATORS`.

`mes.fm/science/build.mjs` (2026-10-01) was converted the same way (cloned from `conspiracy/build.mjs`): tile hub + `mes.fm/{science-posts,science-videos}/index.html`
from `science/sections.mjs`, tile art `img/science-{posts,videos}-icon.jpg`. It now uses the shared blue family look, not its old amber accent. Its Videos are external
YouTube playlists (scraped for their thumbnail). The info-bar of the conspiracy and science families shows `Conspiracy|Science | Posts | Videos` (hub builds, and
`convert_mirror_pages.py`'s `BRAND_TABS` extras for the mirrors); the mirrors' "Part of" box links the matching section page via `add_conspiracy_section_links.py`
(both hubs; idempotent, `--apply` writes -- re-run after adding a mirror to a section list).

`mes.fm/livestreams/build.mjs` (2026-09-26) is the `math-qa` idea for *all* MES livestreams: one page, Grid View / List View of every
numbered stream (newest first) plus two more tabs -- **Stats** (the stats-screen pages, now `mes.fm/livestream-140-stats`, mirrored from the
Hive/Telegram post; add new ones to `STATS`) and **Trailers** (card grid). Cloned from `hutchison/build.mjs`. The list comes from
`livestreams/playlist.json`, a snapshot of the YouTube livestreams playlist written by `python3 update_livestreams_playlist.py --apply`
(needs yt-dlp; also picks each video's best existing thumbnail, maxres else mqdefault, caching earlier lookups) -- after a new stream/trailer:
run that, then `npm run build` in `mes.fm/livestreams` and diff. `classify()` in build.mjs sorts playlist entries into livestream
(`MES Livestream N`, plus `EXTRA_LIVESTREAM_IDS`), trailer (title has "trailer", or "UPCOMING LIVESTREAM") or skipped (short clips and the
"BLANK" placeholder -- each build prints what it left out). Cards go to YouTube (new tab) unless the video has a mes.fm mirror in `MIRRORS`
(livestream 140 and its two trailers, livestream 66's trailer); those mirrors' "Part of" boxes link back to `/livestreams`. The
unnumbered "INTERVIEW: All Things 9/11 with TLBNAWKI" is on the main tab by id. Stats-page thumbnails/links are scraped from the live page,
so a *new* stats page must be seeded by hand in `livestreams/link-meta.json` (image + Hive/Telegram `namedLinks`) until it is deployed.
Above the tabs is a search box + category chips with counts (like `/calculators`): `CATEGORIES` in build.mjs (Hutchison Effect, 9/11 Truth and
BeneficenceTV are title regexes; "MES Truth" is a *channel* filter on `playlist.json`'s `channel` = `@mestruth`, i.e. videos uploaded to
youtube.com/@mestruth, the rest being on Math Easy Solutions). Items carry `data-cats`; the inline `wireFilter()` filters Grid, List and
Trailers together, recounts the chips for the showing tab, hides itself on Stats, honours `#<category>` and Esc. To add a chip add one entry.
Above the search box is one line of reference links (`standalone` on the section: "Playlist" and "Troubleshooting Notes" -> the hand-built
Hive mirror `mes.fm/troubleshooting`, built from `hive_mirror_template.html` with the MES Livestreams brand). `livestreams/extra-links.json` maps a stream number to extra platform links (shown after YouTube in List View). Titles are shortened to
"N: rest" like math-qa. No per-stream mirror pages are generated (unlike `build_math_qa_mirrors.py`).

`mes.fm/cubic-formula/build.mjs` (cloned from `vector-functions-problems-plus/build.mjs`, so it carries the same
lazy-loading / lightbox / AdSense / contrast back-ports) emits **nine** pages: `mes.fm/cubic-formula/index.html`
(mirror of Hive `@mes/dzekfnxh`, plus a Playlist Grid/List section) and the 8 supporting video pages
`mes.fm/{quadratic-formula-complete-square,quadratic-formula-pq-substitution,cubic-formula-step-1-pq-substitution,
cubic-formula-step-2-vieta-substitution,cubic-formula-step-3-first-solution-y,cube-root-unity,
cubic-formula-step-4-solutions-y-cube-root-unity,cubic-formula-step-5-solve-x}/index.html` (from its `CHILDREN`
array and `child-template.html`, which was cut from `problems-plus-4-curvature-parametric-integrals`). Each child
page mirrors its own Hive video post plus the matching "## Step N" section of the main article's written notes;
edit the notes in the Hive article and rebuild, don't hand-edit. The `youtube`/`telegram` ids in `CHILDREN` are
deliberate overrides: the Hive posts' link rows are wrong (Step 2's YouTube link is Completing-the-Square's, and
every Telegram link is the previous video's). Child pages play 3Speak via hls.js and swap themselves for the
YouTube embed if playback fails. The main page's Jump-to menu also lists the seven `## Step N` headings (nested
under "Derivation of Cubic Formula"), and Jump-to links expand a collapsed chapter before scrolling. `git status`
after a build shows the 9 pages plus `playlist-meta.json`.

Before running `npm run build` on any of these pages, `git diff --stat` (or a full diff) the result against the
previously committed `index.html` and confirm you're not losing lines you don't recognize — don't assume success.
If a rebuild does drop a patch that isn't back-ported into that page's `build.mjs`, re-run the matching repo-wide
script afterward (e.g. `python3 add_lightbox_zoom.py`) rather than hand-editing the generated HTML.

## Site structure conventions

Within a given subdomain directory:
- `index.html` is the homepage; other `*.html` files are individual content/tool pages.
- `js/` holds that site's calculator/interactive logic (vanilla JS, no framework).
- `img/` holds that site's images.
- `contact.html`, `privacy-policy.html` are boilerplate pages duplicated with site-specific branding across nearly
  every subdomain — when fixing one (e.g. a broken asset link), check whether the same issue exists in the other
  subdomains' copies.
- `mes.fm/main_js/` and `mes.fm/main_img/` hold shared assets for the main `mes.fm` site itself (nav, ads loader,
  disqus loader, lazysizes) — distinct from the per-subdomain `js/`/`img/` folders.
- `mes.fm/links/index.html` (a link directory page, "MES Links") is edited frequently and directly for small link
  additions/updates — most recent commit history is exactly this ("Add Vector Functions Review link" and its
  follow-up revisions).

When fixing something broken on one page, check whether the same broken pattern (stale asset path, malformed
URL, missing responsive fix) recurs across the other subdomain directories before considering the task done —
the repair scripts above exist because these issues are systemic (copy-pasted boilerplate across ~12 near-
identical sites), not isolated to one file.
