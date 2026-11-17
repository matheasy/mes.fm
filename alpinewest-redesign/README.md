# Alpine West Creative: redesign

The hospitality-focused redesign of alpinewestcreative.com, built from Karolina's brief (Nov 2026).
**Not live.** The live site is still `../karo.mes.fm/` (the Wix mirror), and no Vercel project deploys this folder yet.

## Pages
`/` · `/work` · `/work/secrets-mallorca-villamil` · `/work/hyatt-ziva-puerto-vallarta` · `/work/hyatt-regency-calgary` ·
`/services` · `/about` · `/inquire` · `/travel-collaborations` (footer only, noindex) · `404`

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
`_src/inquire.html` has `data-key="WEB3FORMS_KEY"`. Replace it with the real Web3Forms access key (free, made at
web3forms.com with info@alpinewestcreative.com) and the form sends straight from the page. Until then it opens the
visitor's email app with the message filled in.

Tracking: clicks on every "Inquire about a shoot" button (`inquire_click`, with where it was) and form events
(`inquiry_start`, `inquiry_submit`) go to Vercel Web Analytics and/or Google Analytics if either is added to the page.

## Going live (only after approval)
1. In Vercel, project for alpinewestcreative.com: Settings → Build and Deployment → Root Directory: change
   `karo.mes.fm` to `alpinewest-redesign`. The old mirror stays in `karo.mes.fm/` as the backup.
2. `vercel.json` here already redirects every old URL (`/hotels-airbnbs`, `/food-beverage`, `/video`,
   `/product-branding`, `/investment`, `/contact-8`, the `/m/...` phone pages) to its new page.
3. Submit the new `sitemap.xml` in Google Search Console.
