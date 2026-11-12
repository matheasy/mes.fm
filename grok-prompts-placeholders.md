# Grok prompts: pages that still have placeholder art

Pages below still use PIL-drawn placeholder logos (flat shapes, no polish). Checked by looking at every `mes.fm/<slug>/img/logo.png` on 2026-10-31 and comparing with the CLAUDE.md "placeholder until Grok art lands" notes. Ordered roughly by traffic / importance. Every tool needs two images: an icon and a share image.

## How to import

1. Generate each image in Grok and save it to `~/Downloads/` with the exact file name shown above its prompt (`<slug>-icon.jpg`, `<slug>-share.jpg`).
2. Run `python3 import_grok_art.py <slug> --apply` (it writes `mes.fm/<slug>/img/logo.png` 512, `logo-big.png` 1200x630 and `mes.fm/img/<slug>-logo.png` 352; dry-runs without `--apply`).
3. Bump the `?v=` on the tool's card in `mes.fm/calculators.html` or `mes.fm/tools.html`, then commit.

Style for every prompt: bold, flat-ish modern app-icon look, one strong symbol, rounded-square tile filled edge to edge with the tool's brand colour, about 90% fill, centred, no text on icons.

## MES Geometry and Angle Lab: https://mes.fm/geometry

`~/Downloads/geometry-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat blue background (hex #2563eb, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white triangle with a circle through its corners and a small angle arc marked at one corner. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/geometry-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid blue background (hex #2563eb) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white triangle with a circle through its corners and a small angle arc marked at one corner, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Geometry and Angle Lab" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/geometry" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

