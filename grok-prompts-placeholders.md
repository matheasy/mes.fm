# Grok prompts: pages that still have placeholder art

Pages below still use PIL-drawn placeholder logos (flat shapes, no polish). Checked by looking at every `mes.fm/<slug>/img/logo.png` on 2026-10-31 and comparing with the CLAUDE.md "placeholder until Grok art lands" notes. Ordered roughly by traffic / importance. Every tool needs two images: an icon and a share image.

## How to import

1. Generate each image in Grok and save it to `~/Downloads/` with the exact file name shown above its prompt (`<slug>-icon.jpg`, `<slug>-share.jpg`).
2. Run `python3 import_grok_art.py <slug> --apply` (it writes `mes.fm/<slug>/img/logo.png` 512, `logo-big.png` 1200x630 and `mes.fm/img/<slug>-logo.png` 352; dry-runs without `--apply`).
3. Bump the `?v=` on the tool's card in `mes.fm/calculators.html` or `mes.fm/tools.html`, then commit.

Style for every prompt: bold, flat-ish modern app-icon look, one strong symbol, rounded-square tile filled edge to edge with the tool's brand colour, about 90% fill, centred, no text on icons.

## MES Calculator: https://mes.fm/calculator

`~/Downloads/calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat rose background (hex #c2255c, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a chunky handheld calculator seen from the front: a white display strip on top and a grid of rounded white keys with plus, minus, multiply and equals signs. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid rose background (hex #c2255c) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a chunky handheld calculator seen from the front: a white display strip on top and a grid of rounded white keys with plus, minus, multiply and equals signs, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Sleep Calculator: https://mes.fm/sleep-calculator

`~/Downloads/sleep-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat indigo background (hex #4338ca, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a bold white crescent moon with two small sparkling stars and a tiny floating 'z', over a faint row of sleep-cycle waves. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/sleep-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid indigo background (hex #4338ca) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a bold white crescent moon with two small sparkling stars and a tiny floating 'z', over a faint row of sleep-cycle waves, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Sleep Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/sleep-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES BMI Calculator for Kids and Teens: https://mes.fm/bmi-calculator-kids

`~/Downloads/bmi-calculator-kids-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat magenta-purple background (hex #b3529d, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a friendly rounded child figure standing beside a simple growth-chart curve with a small dot on it, soft and kind in feel. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/bmi-calculator-kids-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid magenta-purple background (hex #b3529d) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a friendly rounded child figure standing beside a simple growth-chart curve with a small dot on it, soft and kind in feel, drawn large and flat-ish in white and one accent colour. On the right, the words "MES BMI Calculator for Kids and Teens" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/bmi-calculator-kids" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES CAS Calculator: https://mes.fm/cas-calculator

`~/Downloads/cas-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat dark slate background (hex #334155, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a large white 'x' with an equals sign and a small sparkle beside it, as if solving an equation. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/cas-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid dark slate background (hex #334155) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a large white 'x' with an equals sign and a small sparkle beside it, as if solving an equation, drawn large and flat-ish in white and one accent colour. On the right, the words "MES CAS Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/cas-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Derivative Calculator: https://mes.fm/derivative-calculator

`~/Downloads/derivative-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat fuchsia background (hex #c026d3, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a smooth white curve with a straight tangent line touching it at one glowing point. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/derivative-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid fuchsia background (hex #c026d3) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a smooth white curve with a straight tangent line touching it at one glowing point, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Derivative Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/derivative-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Integral Calculator: https://mes.fm/integral-calculator

`~/Downloads/integral-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat amber-brown background (hex #b45309, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a large white integral sign over a curve with the area under it softly shaded. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/integral-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid amber-brown background (hex #b45309) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a large white integral sign over a curve with the area under it softly shaded, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Integral Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/integral-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES 2D Graphing Calculator: https://mes.fm/2d-graphing-calculator

`~/Downloads/2d-graphing-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat blue background (hex #2160d0, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: white x and y axes with a smooth sine wave and a parabola crossing, a few grid lines. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/2d-graphing-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid blue background (hex #2160d0) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: white x and y axes with a smooth sine wave and a parabola crossing, a few grid lines, drawn large and flat-ish in white and one accent colour. On the right, the words "MES 2D Graphing Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/2d-graphing-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Matrix Calculator: https://mes.fm/matrix-calculator

`~/Downloads/matrix-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat sky blue background (hex #0369a1, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a big white square matrix bracket pair enclosing a 3 by 3 grid of dots with one dot highlighted in yellow. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/matrix-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid sky blue background (hex #0369a1) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a big white square matrix bracket pair enclosing a 3 by 3 grid of dots with one dot highlighted in yellow, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Matrix Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/matrix-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Geometry and Angle Lab: https://mes.fm/geometry

`~/Downloads/geometry-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat blue background (hex #2563eb, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white triangle with a circle through its corners and a small angle arc marked at one corner. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/geometry-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid blue background (hex #2563eb) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white triangle with a circle through its corners and a small angle arc marked at one corner, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Geometry and Angle Lab" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/geometry" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Trigonometry: https://mes.fm/trigonometry

`~/Downloads/trigonometry-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat burnt orange background (hex #c2410c, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white unit circle with a radius, a right triangle inside it and a small sine wave rising from the right side. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/trigonometry-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid burnt orange background (hex #c2410c) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white unit circle with a radius, a right triangle inside it and a small sine wave rising from the right side, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Trigonometry" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/trigonometry" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Body Surface Area Calculator: https://mes.fm/body-surface-area-calculator

`~/Downloads/body-surface-area-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat teal background (hex #0f766e, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white human silhouette seen from the front, slightly transparent, with a thin measuring-grid wrapped around it. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/body-surface-area-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid teal background (hex #0f766e) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white human silhouette seen from the front, slightly transparent, with a thin measuring-grid wrapped around it, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Body Surface Area Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/body-surface-area-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Mechanics of Materials: https://mes.fm/materials

`~/Downloads/materials-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat steel blue background (hex #2f6690, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a grey dog-bone tensile test specimen with a white-and-orange stress-strain curve rising and bending over it. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/materials-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid steel blue background (hex #2f6690) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a grey dog-bone tensile test specimen with a white-and-orange stress-strain curve rising and bending over it, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Mechanics of Materials" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/materials" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Bending Stress Calculator: https://mes.fm/bending-stress-calculator

`~/Downloads/bending-stress-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat steel blue background (hex #2f6690, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white beam resting on two triangular supports, bending slightly downward under a red arrow, with a faint bending-moment curve below. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/bending-stress-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid steel blue background (hex #2f6690) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white beam resting on two triangular supports, bending slightly downward under a red arrow, with a faint bending-moment curve below, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Bending Stress Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/bending-stress-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Young's Modulus Calculator: https://mes.fm/youngs-modulus-calculator

`~/Downloads/youngs-modulus-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat steel blue background (hex #2f6690, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a vertical steel rod being stretched by a downward red arrow with small tick marks showing elongation, and a straight stress-strain line beside it. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/youngs-modulus-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid steel blue background (hex #2f6690) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a vertical steel rod being stretched by a downward red arrow with small tick marks showing elongation, and a straight stress-strain line beside it, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Young's Modulus Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/youngs-modulus-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Shear Stress Calculator: https://mes.fm/shear-stress-calculator

`~/Downloads/shear-stress-calculator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat steel blue background (hex #2f6690, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: two grey plates slid in opposite directions by a bolt between them, with white opposing arrows. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/shear-stress-calculator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid steel blue background (hex #2f6690) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: two grey plates slid in opposite directions by a bolt between them, with white opposing arrows, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Shear Stress Calculator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/shear-stress-calculator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Letter Recognition: https://mes.fm/letter-recognition

`~/Downloads/letter-recognition-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat violet background (hex #6d28d9, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a pixelated white letter 'A' on a small grid with a glowing neural-network node pattern forming behind it. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/letter-recognition-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid violet background (hex #6d28d9) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a pixelated white letter 'A' on a small grid with a glowing neural-network node pattern forming behind it, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Letter Recognition" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/letter-recognition" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES LLM Simulator: https://mes.fm/llm-simulator

`~/Downloads/llm-simulator-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat emerald green background (hex #047857, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a row of white word blocks with a probability bar chart above them and one highlighted next-word block. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/llm-simulator-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid emerald green background (hex #047857) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a row of white word blocks with a probability bar chart above them and one highlighted next-word block, drawn large and flat-ish in white and one accent colour. On the right, the words "MES LLM Simulator" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/llm-simulator" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Read Aloud: https://mes.fm/read-aloud

`~/Downloads/read-aloud-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat green background (hex #15803d, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white text page with two lines of text, one highlighted in yellow, and a speaker with sound waves. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/read-aloud-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid green background (hex #15803d) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white text page with two lines of text, one highlighted in yellow, and a speaker with sound waves, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Read Aloud" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/read-aloud" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Volume Booster: https://mes.fm/volume-booster

`~/Downloads/volume-booster-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat amber background (hex #b45309, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a big white speaker cone with three sound waves growing larger and a small upward arrow with a plus sign. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/volume-booster-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid amber background (hex #b45309) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a big white speaker cone with three sound waves growing larger and a small upward arrow with a plus sign, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Volume Booster" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/volume-booster" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Text Size: https://mes.fm/text-size

`~/Downloads/text-size-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat teal background (hex #0e7490, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a large white capital 'A' next to a smaller 'A' with a small up-and-down arrow between them. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/text-size-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid teal background (hex #0e7490) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a large white capital 'A' next to a smaller 'A' with a small up-and-down arrow between them, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Text Size" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/text-size" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Page Ratings: https://mes.fm/ratings

`~/Downloads/ratings-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat amber background (hex #b45309, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a big golden five-pointed star above a row of five smaller stars, four filled and one half filled. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/ratings-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid amber background (hex #b45309) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a big golden five-pointed star above a row of five smaller stars, four filled and one half filled, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Page Ratings" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/ratings" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES Search Console: https://mes.fm/search-console

`~/Downloads/search-console-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat Google blue background (hex #1a73e8, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white bar chart with a rising line and a small magnifying glass over the tallest bar. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/search-console-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid Google blue background (hex #1a73e8) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white bar chart with a rising line and a small magnifying glass over the tallest bar, drawn large and flat-ish in white and one accent colour. On the right, the words "MES Search Console" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/search-console" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

## MES YouTube Audio Analyzer: https://mes.fm/youtube-audio

`~/Downloads/youtube-audio-icon.jpg`

```
Square 1:1 app icon, 1024 x 1024. A rounded-square tile filled edge to edge with a flat burnt orange background (hex #c2410c, with a very subtle lighter gradient toward the top). In the centre, filling about 90% of the tile, one bold modern symbol: a white audio waveform made of rounded vertical bars, with a small white play triangle on its left and a thin loudness meter line running across the top. Clean flat-ish app-icon style with soft shading, crisp edges, high contrast, white and one accent colour only. No text, no letters unless part of the symbol described, no border, no drop shadow outside the tile, no watermark.
```

`~/Downloads/youtube-audio-share.jpg`

```
Wide social share image, 1200 x 630 pixels (aspect ratio 1.91:1). Solid burnt orange background (hex #c2410c) with a subtle darker gradient at the edges. On the left, the same bold app-icon symbol: a white audio waveform made of rounded vertical bars with a small play triangle and a thin loudness meter line across the top, drawn large and flat-ish in white and one accent colour. On the right, the words "YouTube Audio Analyzer" in very large, clear, bold white sans-serif text, left aligned, with the line "mes.fm/youtube-audio" in smaller white text underneath. Everything inside safe margins, plenty of contrast, no photos, no other text, no watermark.
```

`~/Downloads/youtube-audio-tile.jpg`

```
Wide 3:2 illustration, 900 x 600 pixels, no text at all. A glowing audio waveform stretched across a dark warm background, its bars turning into a colourful spectrogram (deep purple to orange to pale yellow) toward the right, with a thin horizontal loudness line and a few soft orange highlights. Burnt orange (hex #c2410c) as the main accent colour. Modern, clean, high contrast, no letters, no logos, no watermark.
```
