#!/usr/bin/env python3
"""Make the Android launcher icons + Play 512 icon from assets/icon.png (square art).
Dry run by default; --apply writes. Adaptive icon = the art as background (full bleed), monochrome = ic_stat."""
import sys, os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "icon.png")
RES = os.path.join(HERE, "android/app/src/main/res")
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
apply = "--apply" in sys.argv
im = Image.open(SRC).convert("RGB")
w, h = im.size; s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
out = []
for d, px in SIZES.items():
    base = os.path.join(RES, "mipmap-" + d)
    bg = im.resize((px * 108 // 48,) * 2, Image.LANCZOS)          # adaptive layer is 108dp
    sq = im.resize((px, px), Image.LANCZOS)
    m = Image.new("L", (px * 4, px * 4), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, px * 4 - 1, px * 4 - 1), px * 4 // 5, 255)
    leg = sq.copy().convert("RGBA"); leg.putalpha(m.resize((px, px), Image.LANCZOS))
    r = Image.new("L", (px * 4, px * 4), 0); ImageDraw.Draw(r).ellipse((0, 0, px * 4 - 1, px * 4 - 1), 255)
    rnd = sq.copy().convert("RGBA"); rnd.putalpha(r.resize((px, px), Image.LANCZOS))
    out += [(bg, base + "/ic_bg_img.png"), (leg, base + "/ic_launcher.png"), (rnd, base + "/ic_launcher_round.png")]
out.append((im.resize((512, 512), Image.LANCZOS), os.path.join(HERE, "store/play-icon-512.png")))
xml = ('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
       '  <background android:drawable="@mipmap/ic_bg_img"/>\n  <foreground android:drawable="@android:color/transparent"/>\n'
       '  <monochrome android:drawable="@drawable/ic_stat"/>\n</adaptive-icon>\n')
for img, p in out: print(("write " if apply else "would write ") + os.path.relpath(p, HERE))
if apply:
    for img, p in out:
        os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p, optimize=True)
    os.makedirs(os.path.join(RES, "mipmap-anydpi-v26"), exist_ok=True)
    for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
        open(os.path.join(RES, "mipmap-anydpi-v26", n), "w").write(xml)
