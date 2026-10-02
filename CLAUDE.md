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
  `share/img/logo.png` + `img/share-logo.png` at 90% fill with transparent corners, and the 1200x630 `share/img/logo-big.png`). The `tools` sidebar family no
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

- **Calendar** (2026-09-30, `mes.fm/calendar`, a tools-hub tool: card in `tools.html` "Time & Focus", blue `#2f5fd0`). Built like `share`/`search` by
  `build_tool_apps.py` from `tool_apps_src/calendar/`; new here: an optional `lib.js` in an app's source folder is prepended to `app.js` so
  one `js/calendar.js` is served. `lib.js` = pure maths, runs in node too (`require`): moon phases (Meeus ch. 49, checked against the 2026
  new/full moon table to the minute), equinoxes/solstices (ch. 27), Western Easter, Lunar New Year (the new moon falling Jan 21-Feb 20 in UTC+8,
  or +7 for Vietnam), Hebrew and Islamic (Umm al-Qura, approximate) dates by scanning the year with `Intl`'s `hebrew` / `islamic-umalqura`
  calendars (month *names* are matched, so re-check them if a browser engine changes its labels), and the per-year holiday tables for Canada / USA /
  UK / Australia / Vietnam with weekend "observed" days. The eclipse list (`EC`, 2026-2028) is hand-entered; extend it by hand. `app.js` = month /
  year views (year: per-month fold, Collapse all), filter chips (groups in `GROUPS`; state in localStorage `mes-calendar:v1`), selected-day card,
  days-between / add-days calculator, `?y=&m=&d=&v=year` links. Same-day events from several regions are merged ("Good Friday CA UK AU").
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

- **Calculator** (2026-10-01, `mes.fm/calculator`, rose `#c2255c`; card on `calculators.html` "Everyday Math & Health"). Built like `calendar` by
  `build_tool_apps.py` from `tool_apps_src/calculator/`: `lib.js` = pure maths (no `eval`: tokenizer + recursive-descent parser with `^`, `%`, `!`, implicit
  multiplication, `of`, deg/rad trig, `root`/`gcd`/`nCr`...; BigInt exact decimal multiply/divide with repeating-cycle detection; factorization, fractions,
  bases, Roman numerals, list stats; runs in node: `require('./tool_apps_src/calculator/lib.js')`), `app.js` = keypad + live result + history
  (localStorage `mes-calculator:v1`, `?q=` / `?tab=` links) + seven "More calculations" panels. It is registered in the same script lists as `unit-conversion`
  (`add_tool_page_controls`, `add_bottom_ad`, `add_cross_links` CALC_DIRS, `add_sidebar` tools family, `build_search_index`, `organize_hub_cards`).
  After editing run `build_tool_apps.py --apply`, `add_tool_page_controls.py --apply`, `add_sidebar.py --apply`, `add_bottom_ad.py --apply`. Logos are placeholders
  (PIL-drawn) until Grok art lands (`calculator/img/logo.png`, `logo-big.png` 1200x630, `img/calculator-logo.png`: same names). The "2D Graphing Calculator / 3D"
  cards at the bottom are real `<a class="mc-link">` links now that both pages exist.

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
