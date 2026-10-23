#!/usr/bin/env python3
"""Import Grok art for a tool: ~/Downloads/<name>-icon.jpg / -share.jpg / -tile.jpg -> mes.fm/<slug>/img/logo.png (512, rounded, transparent corners),
mes.fm/img/<slug>-logo.png (352), mes.fm/<slug>/img/logo-big.png (1200x630 centre crop of the share image), mes.fm/img/<slug>-icon.jpg (900x600 tile).
The icon JPGs often have a checkerboard 'transparency' baked in: the coloured rounded square is found by saturation / darkness and cropped out, then re-rounded.
  python3 import_grok_art.py body-fat=body-fat-calculator macro=macro-calculator ...      (download-name=slug; slug alone if they match)   Dry-runs by default, --apply writes."""
import sys, os
from PIL import Image, ImageDraw
R = os.path.dirname(os.path.abspath(__file__)); D = os.path.expanduser("~/Downloads/")
apply = "--apply" in sys.argv
def src(n):  # newest of .jpg / .jpeg / .png downloads
    c = [D + n + e for e in (".jpg", ".jpeg", ".png") if os.path.exists(D + n + e)]
    return max(c, key=os.path.getmtime) if c else D + n + ".jpg"
def square_box(im):
    W, H = im.size; px = im.load(); xs = []; ys = []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y]; mx, mn = max(r, g, b), min(r, g, b)
            if (mx - mn) > 40 or mx < 90: xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs) + 2, max(ys) + 2)
def rounded(c, n):
    im = c.resize((n, n), Image.LANCZOS).convert("RGBA"); m = Image.new("L", (n * 4, n * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, n * 4 - 1, n * 4 - 1], radius=int(n * 4 * 0.2), fill=255); im.putalpha(m.resize((n, n), Image.LANCZOS)); return im
for a in [x for x in sys.argv[1:] if not x.startswith("--")]:
    name, _, slug = a.partition("="); slug = slug or name
    ic = Image.open(src(name + "-icon")).convert("RGB"); box = square_box(ic); print(slug, "icon box", box, "size", (box[2] - box[0], box[3] - box[1]))
    if not apply: continue
    os.makedirs(f"{R}/mes.fm/{slug}/img", exist_ok=True); c = ic.crop(box); w0, h0 = c.size
    if h0 > w0 * 1.04:   # portrait rounded rectangle: drop its rounded corners, keep the whole height, and widen the sides with the edge colour (no squashing, no clipped art)
        c = c.crop((int(w0 * 0.05), int(h0 * 0.10), w0 - int(w0 * 0.05), h0 - int(h0 * 0.10))); w1, h1 = c.size
        if w1 >= h1:   # barely taller than wide after the inset: just centre-crop a square
            l = (w1 - h1) // 2; c = c.crop((l, 0, l + h1, h1)); w1 = h1
        sq = Image.new("RGB", (h1, h1)); ox = (h1 - w1) // 2; sq.paste(c, (ox, 0))
        if ox > 0: sq.paste(c.crop((0, 0, 1, h1)).resize((ox, h1)), (0, 0)); sq.paste(c.crop((w1 - 1, 0, w1, h1)).resize((h1 - ox - w1, h1)), (ox + w1, 0))
        c = sq
    elif abs(w0 - h0) > 0.04 * max(w0, h0):
        side = min(w0, h0); l = (w0 - side) // 2; t = (h0 - side) // 2; c = c.crop((l, t, l + side, t + side))
    rounded(c, 512).save(f"{R}/mes.fm/{slug}/img/logo.png"); rounded(c, 352).save(f"{R}/mes.fm/img/{slug}-logo.png")
    if os.path.exists(src(name + "-share")):
        s = Image.open(src(name + "-share")).convert("RGB"); w, h = s.size; ch = round(w * 630 / 1200); t = (h - ch) // 2
        s.crop((0, t, w, t + ch)).resize((1200, 630), Image.LANCZOS).save(f"{R}/mes.fm/{slug}/img/logo-big.png")
    else: print("  (no -share.jpg: share image left as is)")
    if not os.path.exists(src(name + "-tile")): print("  (no -tile.jpg: tile left as is)"); continue
    tl = Image.open(src(name + "-tile")).convert("RGB"); w, h = tl.size; ch = round(w * 2 / 3); t = (h - ch) // 2
    tl.crop((0, t, w, t + ch)).resize((900, 600), Image.LANCZOS).save(f"{R}/mes.fm/img/{slug}-icon.jpg", quality=88)
print("applied" if apply else "dry run (use --apply)")
