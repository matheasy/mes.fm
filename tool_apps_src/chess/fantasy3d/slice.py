"""slice.py sheet.png outdir prefix  -> outdir/<prefix><K,Q,R,B,N,P>.png (512x640, transparent, feet bottom-centre)
Background = near-white or light grey/checker reached from the image edges (flood fill), so white armour inside a figure is kept."""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, out, pre = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert("RGB"); a = np.asarray(im).astype(int)
mx, mn = a.max(2), a.min(2)
bgish = (mn > 200) & (mx - mn < 26)          # light and grey-ish
lab, n = ndimage.label(bgish)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
# enclosed holes (between an arm and the body, inside a horse's legs): flat near-white patches of some size are background too
flat = (mn > 236) & (mx - mn < 14)
hl, hn = ndimage.label(flat & ~bg)
hs = ndimage.sum(np.ones_like(hl), hl, range(1, hn + 1))
for i, sz in enumerate(hs):
    if sz > 500: bg |= hl == i + 1
fg = ~bg
fg = ndimage.binary_opening(fg, iterations=2)
fl, k = ndimage.label(fg)
sizes = ndimage.sum(fg, fl, range(1, k + 1))
order = np.argsort(sizes)[::-1][:6] + 1
objs = []
for o in order:
    ys, xs = np.where(fl == o); objs.append((ys.min(), ys.max(), xs.min(), xs.max(), o))
H = a.shape[0]
objs.sort(key=lambda b: (0 if (b[0] + b[1]) / 2 < H / 2 else 1, b[2]))
alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
rgba = im.copy(); rgba.putalpha(alpha)
for name, (y0, y1, x0, x1, o) in zip("KQRBNP", objs):
    mask = Image.fromarray(((fl == o) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    piece = im.copy(); piece.putalpha(Image.fromarray(np.minimum(np.asarray(mask), np.asarray(alpha))))
    piece = piece.crop((x0, y0, x1 + 1, y1 + 1))
    W, Hh = 512, 640; s = min((W * 0.96) / piece.width, (Hh * 0.98) / piece.height)
    piece = piece.resize((max(1, round(piece.width * s)), max(1, round(piece.height * s))), Image.LANCZOS)
    c = Image.new("RGBA", (W, Hh), (0, 0, 0, 0)); c.paste(piece, ((W - piece.width) // 2, Hh - piece.height), piece)
    c.save(f"{out}/{pre}{name}.png", optimize=True); print(name, x0, y0, x1, y1)
