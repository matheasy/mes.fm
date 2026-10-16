#!/usr/bin/env python3
"""Hub art from Grok's portrait icon (784x1168, a rounded-square icon on a flat or gradient background): writes the 900x600 tile, the 512 square logo and the 1200x630 share
image for a hub. The tile and share image extend the picture's own background sideways (each row repeats its left-edge colour), so the icon sits centred with no seam.
  python3 make_hub_art.py <downloads-name>=<tile-file>[,<logo-file>,<share-file>] ... --apply
  e.g. pg-icon=mes.fm/img/pg-icon.jpg,mes.fm/img/pg-logo.jpg,mes.fm/img/pg-logo-big.jpg      (leave a part empty to skip it). Dry-runs by default."""
import sys, os
from PIL import Image
R = os.path.dirname(os.path.abspath(__file__)); D = os.path.expanduser("~/Downloads/")
def card_box(im):
    W, H = im.size; px = im.load(); xs = []; ys = []
    for y in range(0, H, 3):
        bg = px[3, y]
        for x in range(8, W - 8, 3):
            p = px[x, y]
            if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > 70: xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)
def widen(im, w, h, box, fill=0.8):
    x0, y0, x1, y1 = box; s = h * fill / (y1 - y0); art = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    cx, cy = (x0 + x1) / 2 * s, (y0 + y1) / 2 * s; ox = round(w / 2 - cx); oy = round(h / 2 - cy)
    out = Image.new("RGB", (w, h)); px = art.load()
    for y in range(h):
        yy = min(art.size[1] - 1, max(0, y - oy)); c = px[1, yy]
        for x in range(w): out.putpixel((x, y), c)
    out.paste(art, (ox, oy)); return out
apply = "--apply" in sys.argv
for a in [x for x in sys.argv[1:] if not x.startswith("--")]:
    name, _, outs = a.partition("="); parts = (outs.split(",") + ["", "", ""])[:3]
    im = Image.open(D + name + ".jpg").convert("RGB"); x0, y0, x1, y1 = card_box(im); print(name, "card", (x0, y0, x1, y1))
    if not apply: continue
    if parts[0]: widen(im, 900, 600, (x0, y0, x1, y1)).save(os.path.join(R, parts[0]), quality=90)
    if parts[1]:
        side = max(x1 - x0, y1 - y0) + 40; cx, cy = (x0 + x1) // 2, (y0 + y1) // 2; sq = im.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)); sq.resize((512, 512), Image.LANCZOS).save(os.path.join(R, parts[1]), quality=90)
    if parts[2]: widen(im, 1200, 630, (x0, y0, x1, y1), 0.74).save(os.path.join(R, parts[2]), quality=90)
print("applied" if apply else "dry run (use --apply)")
