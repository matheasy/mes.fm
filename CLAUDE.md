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
  4-column grid so the icons are ~2x bigger, and a `srcset` picking the 432px `-thumbnail.jpeg` where it exists.
  Reuses `widen_hub_pages.py`'s `THUMB_GRID`. Idempotent (`HUB-WIDE-LAYOUT`); **dry-runs by default, `--apply` writes.**

- `convert_mirror_pages.py` — puts the bare Hive-mirror / link-hub pages (dark page, "<- mes.fm/911" back link, plain
  footer) in the math-hub page format used by `911`/`hutchison`/`science`/the Q/A pages: branded header (logo, title,
  tagline by hub: 911, hutchison, science, conspiracy, else the MES.fm mark), A-/A+/moon, hamburger nav, blue nav bar,
  floating compact bar, "Part of <hub>" box, standard footer. Shell = `hive_mirror_template.html` (a copy of
  `cubic-formula/child-template.html` with `@@BRAND_*@@` tokens). Three modes, picked per page: *standard* (rebuild from the
  template, lifting h1 / subtitle / `<article>` / video scripts and any page-specific CSS rules out of the old page),
  *chrome swap* (chaptered / multi-article pages: keep the body, swap only top bar, footer and scripts) and *hub swap*
  (conspiracy / mathiew / crypto link hubs; also sets the conspiracy favicon + og:image). `moon` gets its own brand (`PAGE_BRANDS`: moon logo, "Part of MES Tools · MES Science", favicon + og image from
  `moon/img/`); never touches `bg`; `links`, `911djw` and `chatgpt` don't match and are left as they were. **Generators:** `911-alchemy`, `djw`,
  `ferrocell-specular-reflection`, `hutchison-tom-sky`, `norman-patricia-ai-email`, `conspiracy` and `mathiew` still emit the
  bare shell from `build.mjs`, so each `build.mjs` now ends by running `convert_mirror_pages.py --apply --only=<slug>` —
  a rebuild re-applies the shell instead of reverting it (new mirrors cloned from those templates: same one-liner).
  Idempotent (converted pages have an `#info-bar`); **dry-runs by default, `-v` lists pages, `--apply` writes.**
  `mes.fm/img/conspiracy-{icon,logo,logo-big}.jpg` (tile 900x600, favicon/brand 512 square, og 1200x630) come from one
  source image; the conspiracy tile sits last in the homepage `icon-grid`.

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

- `organize_hub_cards.py` — organises the card hubs `calculators.html` and `tools.html` into categories with a search
  box: cards are grouped by the `PAGES` table (calculators: School & Grades, Money & Finance, Everyday Math & Health,
  Science & Fun; tools: Text & Symbols, Time & Focus, Media & Web, Sky & Space), sorted A-Z inside a category, and emitted
  as one `<section class="hub-cat">` (heading + its own `.tbl` grid) per category under a search input and category chips
  (with counts). `main_js/hub-filter.js` filters live (every word must match title + description; `#<category>` in the URL
  preselects a chip; Esc clears). A **★ Popular** section (3 cards, duplicates) comes first, from the `popular` list in `PAGES` — picked from mes.fm/stats (`curl "https://mes.fm/api/stats?range=30d"`): Grade, Percentage, Weighted Average; Timer, Speed Reader, Moon — it shows only on the plain overview (hidden while searching or on another chip) so a search never lists a card twice; re-check the stats occasionally. **To add a calculator or tool:** put its `<td class="calc-container">` card anywhere in
  the page's last table, add its slug to the right category in `PAGES` (unmapped cards land in a trailing "More" section
  and are reported) and re-run. Idempotent; **dry-runs by default, `--apply` writes.**

- `widen_hub_pages.py` — brings `calculators.html`, `tools.html`, `mobile-apps.html`, `puzzles.html` and `memes.html` up to
  the wide `mes.fm` / `mes.fm/math` page format (`.outer-container` 50em -> 75em). Calculators/tools/mobile-apps become 3
  columns of taller stacked cards on >=900px; puzzles/memes stay 4 columns but fluid (thumbnails fill the page, `srcset`
  picks the 432px `-thumbnail.jpeg` over the 161px `-thumbnail-2.jpeg`). Also adds
  `main_js/display-controls.js` to those pages **and `index.html`**: it injects the A-/A+/moon controls (left of the
  hamburger, pinned into the floating compact bar), the text-size handlers and page-scoped dark mode, sharing the
  `articleFontScale`/`theme` localStorage keys with `mes.fm/math` (whose build.mjs has its own inline copy — keep the two
  visually in step). Idempotent; **dry-runs by default, `--apply` writes.**

Run any of them with `python3 <script>.py` from anywhere (they resolve the repo root themselves). They print a
per-file report; read the output rather than assuming success — `fix_broken_internal_links.py` additionally needs
`--apply` to write anything, and reading its dry run first is the point.

Note that other agent sessions sometimes have a repo-wide pass of their own sitting uncommitted in this same working
tree. Before committing one of these, compare `git status --porcelain | wc -l` against the file count your script
reported; if there is a large gap, stage only your own paths rather than `git add -A`.

### `build.mjs` pages: never rebuild without diffing first

Several pages (currently `911`, `911-alchemy`, `conspiracy`, `cubic-formula`, `djw`, `ferrocell-specular-reflection`,
`hutchison`, `hutchison-tom-sky`, `math`, `mathiew`, `norman-patricia-ai-email`, `science`, `vector-functions-problems-plus`, all
under `mes.fm/`) have their own `build.mjs` (`npm run build`, usually fetching a Hive post) that regenerates
`index.html` from scratch. The repo-wide scripts above (`add_lightbox_zoom.py`, `add_image_lightbox.py`, and several
`optimize_pagespeed.py` transforms — the deferred-AdSense loader, the WCAG brand-blue darkening, and the `<img>`
lazy-loading pass) patch the *generated* `index.html` directly; they don't know `build.mjs` exists, so those patches
never land back in the template. **Running `npm run build` regenerates index.html purely from build.mjs and
silently reverts any patch that only ever lived in the generated HTML** — this has already happened for real more
than once (e.g. commit `cb410eb1` had to re-apply a dropped PageSpeed pass to `mes.fm/911`, and `mes.fm/911`'s
lightbox-zoom feature was silently lost the day after it shipped, by the very next Hive-mirror rebuild, and stayed
lost for a week before anyone noticed).

As of this writing, `911`, `911-alchemy`, `djw`, `ferrocell-specular-reflection`, `hutchison-tom-sky`, `hutchison`,
`norman-patricia-ai-email`, and `vector-functions-problems-plus` all have `addImageLazyLoading()` back-ported into
`build.mjs`, applied to the whole generated page right before `writeFileSync` — it's a line-for-line JS port of
`optimize_pagespeed.py`'s `transform_images` lazy-loading rule (skip the first non-`data:` image on the page so LCP
isn't hurt, lazy-load every other `<img>` whose `src` is an `http(s)` URL not on `mes.fm`), verified by round-
tripping each page's committed `index.html` (strip `loading="lazy"` back out, rerun the new function, diff against
the original — all reproduce exactly). `911`, `ferrocell-specular-reflection`, `hutchison-tom-sky`, `hutchison`,
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
