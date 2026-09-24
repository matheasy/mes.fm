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
  Q/A 70/71 are not generated by this — they're the hand-built originals the template came from.

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
