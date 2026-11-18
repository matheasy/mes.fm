# Alpine West Creative: redesign

The hospitality-focused redesign of alpinewestcreative.com, built from Karolina's brief (Nov 2026).
**Not live (2026-11-18):** www.alpinewestcreative.com went back to the original Wix mirror (`karo.mes.fm/`, Vercel root directory = that folder) while Karolina works through her edits. To relaunch this redesign, follow "Going live" below; `karo.mes.fm/vercel.json` then needs nothing (its temporary 302s for `/work`, `/services`, `/inquire`, `/about` only matter while the mirror is live).

## Pages
`/` · `/work` · `/work/secrets` · `/work/hyatt-ziva` · `/work/hyatt-regency` ·
`/work/marriott` · `/services` · `/about` · `/inquire` · `/travel-collaborations` (footer only, noindex) · `404`

## Editing
- Pages live in `_src/` (plain HTML). Header, footer and the closing "Your next story starts here" banner are in `_src/_partials/`.
- After any edit: `python3 _tools/build.py` (writes the real pages next to this README).
- Preview: `python3 _tools/serve.py` then open http://127.0.0.1:8483
- Styles: `assets/site.css`, behaviour: `assets/site.js`. Bump `?v=` in `_src/_partials/shell.html` after changing either.

## Photos and films
- Every picture has a name (`villamil-balcony-sea`, `ziva-lantern-walk`, ...), listed in `_tools/make_media.py`
  with the Wix id of its full-size original. Pages refer to pictures by name: `<x-pic name="..." alt="...">`.
- **To swap a picture:** point its name at another Wix id (or add a new name), then run
  `python3 _tools/make_media.py --apply` and `python3 _tools/build.py`. To regenerate an existing name, delete its
  `img/<name>-*.webp` first.
- Originals are cached in `~/.cache/alpinewest-originals` (not in git).

## Inquiry form
Sends through Web3Forms with Karolina's access key (`data-key` in `_src/inquire.html`; the key is public by design).
Messages go to the Gmail address her Web3Forms account was made with; she can change that in the Web3Forms
dashboard. If the service can't be reached the form shows the email address instead.

Tracking: clicks on every "Request a Custom Proposal" button (`proposal_click`, with where it was) and form events
(`inquiry_start`, `inquiry_submit`) go to Vercel Web Analytics and/or Google Analytics if either is added to the page.

## Going live (only after approval)
1. In Vercel, project for alpinewestcreative.com: Settings → Build and Deployment → Root Directory: change
   `karo.mes.fm` to `alpinewest-redesign`. The old mirror stays in `karo.mes.fm/` as the backup.
2. `vercel.json` here already redirects every old URL (`/hotels-airbnbs`, `/food-beverage`, `/video`,
   `/product-branding`, `/investment`, `/contact-8`, the `/m/...` phone pages) to its new page.
3. Submit the new `sitemap.xml` in Google Search Console.

## Karo's private dashboard
`/stats`, `/search-console` and `/seo` (login karo / rome) are proxied to mes.fm by the `rewrites` in `vercel.json`;
the pages and data live in mes.fm (`build_awc_dashboard.py`, see the repo's CLAUDE.md). Every page loads
`/assets/track.js` (the anonymous view counter) and carries the Google / Bing verification tags, both from
`_src/_partials/shell.html`. `/privacy` explains the counter.

## Brand (Nov 2026 update)
- Logo: `assets/logo.png` / `.webp` = Karolina's own logo, transparency rebuilt from the JPG she sent (the Wix PNG had hard 1-bit edges that showed white on dark), 2x size, colours unchanged. Never recolour it.
- Colours: Ivory `#F5F2EB`, Alpine Sage `#78947F`, Deep Forest `#2B4E38`, Midnight Pine `#0F2A1E`, Natural Beige `#D5C29D` (tokens at the top of `site.css` and the "Brand refresh" block at its end).
- Type: Bodoni Moda (headlines) + Jost (everything else), Google Fonts.
- Primary button text everywhere: "Request a Custom Proposal" (Deep Forest on light, Natural Beige on dark).
- Visitor-facing hotel names are brand names only (Secrets, Hyatt Ziva, Hyatt Regency, Marriott), no locations. Old project URLs redirect.
