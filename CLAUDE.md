# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a collection of static websites for the `mes.fm` domain and its calculator subdomains (e.g.
`gradecalculator.mes.fm`, `mortgagecalculator.mes.fm`, `bmicalculator.mes.fm`, `percentagecalculator.mes.fm`,
`inflationcalculator.mes.fm`, `vatcalculator.mes.fm`, `pokemongocalculator.mes.fm`, `speedreader.mes.fm`,
`timer.mes.fm`, `youtubemoney.mes.fm`, `gpacalculator.mes.fm`, `chinchatcomics.mes.fm`). Each top-level directory
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

Three one-off Python repair scripts live at the repo root and operate across the **entire repo** (they hardcode
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

Run any of them with `python3 <script>.py` from anywhere (they resolve the repo root themselves). They print a
per-file report; read the output rather than assuming success.

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
