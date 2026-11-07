#!/usr/bin/env python3
"""Build the letter index of MES Font Finder (mes.fm/font-finder).

Every free font of Fontsource (the open-licence Google Fonts plus ~120 other open fonts) is drawn letter by letter;
each letter becomes a small "fingerprint" (the ink cropped, fitted into 32x32, blurred, then reduced to K numbers by
PCA computed for that letter). The browser fetches only the files for the letters in the user's picture.

Output (mes.fm/font-finder/data/):
  fonts.json      families + styles list (the order of the records in every letter file)
  g/<code>.bin    one file per character (A-Z a-z 0-9 & ? !): mean, PCA basis, then one record per style

Needs: ~/.cache/mes-ff-venv (fonttools brotli numpy pillow), e.g.
  python3.14 -m venv ~/.cache/mes-ff-venv && ~/.cache/mes-ff-venv/bin/pip install fonttools brotli numpy pillow
Run:  ~/.cache/mes-ff-venv/bin/python build_font_finder_data.py            (dry run: counts + accuracy check)
      ~/.cache/mes-ff-venv/bin/python build_font_finder_data.py --apply    (writes the files)
      --download   fetch missing font files first (cache ~/.cache/mes-font-finder/woff2)
      --redraw     draw every letter again (otherwise drawings are cached in ~/.cache/mes-font-finder/rows.pkl)
      --meta       re-read the Fontsource font list (api.fontsource.org/v1/fonts)
The same maths is in tool_apps_src/font-finder/lib.js (MESFF.fingerprint): keep the two in step (tests compare them).
"""
import json, os, pickle, sys, struct, time, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.expanduser("~/.cache/mes-font-finder")
OUT = os.path.join(ROOT, "mes.fm", "font-finder", "data")
CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?!"
G = 32          # fingerprint grid
K = 40          # PCA numbers kept per letter
SIZE = 160      # font size the letters are drawn at
DUP = 1.5e-3    # mean squared fingerprint difference under which two styles count as the same letters
CAT = {"sans-serif": "sans", "serif": "serif", "display": "display", "handwriting": "hand", "monospace": "mono", "other": "display"}


def near(ws, t):
    return min(ws, key=lambda w: (abs(w - t), w))


def styles_of(x):
    w, s = x["weights"], x["styles"]
    base = near(w, 400)
    E = [(base, 0)]
    if 700 in w and base != 700:
        E.append((700, 0))
    if "italic" in s:
        E.append((base, 1))
    if max(w) >= 800 and max(w) not in (base, 700):
        E.append((max(w), 0))
    if min(w) <= 200 and min(w) != base:
        E.append((min(w), 0))
    return E


def load_meta(refresh):
    p = os.path.join(CACHE, "meta.json")
    if refresh or not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        r = urllib.request.urlopen(urllib.request.Request("https://api.fontsource.org/v1/fonts", headers={"User-Agent": "mes.fm-font-finder/1.0"}), timeout=60).read()
        open(p, "wb").write(r)
    d = json.load(open(p))
    return [x for x in d if "latin" in x["subsets"] and x["category"] != "icons"]


def wpath(fid, w, it):
    return os.path.join(CACHE, "woff2", "%s-%d-%s.woff2" % (fid, w, "italic" if it else "normal"))


def download(meta):
    jobs = [(x["id"], w, it) for x in meta for (w, it) in styles_of(x)]
    os.makedirs(os.path.join(CACHE, "woff2"), exist_ok=True)

    def get(j):
        p = wpath(*j)
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return 0
        u = "https://cdn.jsdelivr.net/fontsource/fonts/%s@latest/latin-%d-%s.woff2" % (j[0], j[1], "italic" if j[2] else "normal")
        for _ in range(3):
            try:
                open(p, "wb").write(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "mes.fm-font-finder/1.0"}), timeout=30).read())
                return 0
            except Exception:
                time.sleep(1)
        print("could not download", u)
        return 1
    with cf.ThreadPoolExecutor(16) as ex:
        print("download failures:", sum(ex.map(get, jobs)), "of", len(jobs))


# ---------- the fingerprint (same maths as MESFF.fingerprint in lib.js) ----------
def cover_matrix(n, s, off):
    """rows = G target cells, cols = n source pixels: area of source pixel i (scaled by s, shifted by off) inside cell j"""
    M = np.zeros((G, n))
    for i in range(n):
        a, b = i * s + off, (i + 1) * s + off
        for j in range(max(0, int(np.floor(a))), min(G, int(np.ceil(b)))):
            M[j, i] = max(0.0, min(b, j + 1) - max(a, j))
    return M


KER = np.array([1, 4, 6, 4, 1], float) / 16


def blur(g):
    p = np.pad(g, 2)
    h = sum(KER[k] * p[:, k:k + G] for k in range(5))
    return sum(KER[k] * h[k:k + G, :] for k in range(5))


def fingerprint(B):
    """B = binary ink array cropped to its ink box -> blurred 32x32 vector (1024)"""
    h, w = B.shape
    s = G / max(w, h)
    ox, oy = (G - w * s) / 2, (G - h * s) / 2
    g = cover_matrix(h, s, oy) @ B.astype(float) @ cover_matrix(w, s, ox).T
    return blur(np.minimum(g, 1.0)).ravel()


def render_style(path, size=SIZE):
    """-> dict char -> (fingerprint, (w/em, h/em, top/em)) or None when the font has no such glyph"""
    try:
        font = ImageFont.truetype(path, size)
        cmap = TTFont(path, lazy=True).getBestCmap() or {}
    except Exception:
        return None
    out = {}
    W, H, bx, by = int(size * 3.2), int(size * 2.4), int(size * 0.6), int(size * 1.6)
    for ch in CHARS:
        if ord(ch) not in cmap:
            out[ch] = None
            continue
        im = Image.new("L", (W, H), 0)
        try:
            ImageDraw.Draw(im).text((bx, by), ch, font=font, fill=255, anchor="ls")
        except Exception:
            out[ch] = None
            continue
        a = np.asarray(im) > 127
        ys, xs = np.nonzero(a)
        if not len(xs):
            out[ch] = None
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        B = a[y0:y1 + 1, x0:x1 + 1]
        out[ch] = (fingerprint(B), ((x1 - x0 + 1) / size, (y1 - y0 + 1) / size, (by - y0) / size))
    return out


def qmet(m):
    w, h, top = m
    return [int(min(255, max(0, round(w * 120)))), int(min(255, max(0, round(h * 120)))), int(min(255, max(0, round((top + 0.5) * 120))))]


def main():
    apply = "--apply" in sys.argv
    meta = load_meta("--meta" in sys.argv)
    if "--download" in sys.argv:
        download(meta)
    fams, styles, rows = [], [], []
    t0 = time.time()
    jobs = []
    for x in meta:
        E = [(w, it) for (w, it) in styles_of(x) if os.path.exists(wpath(x["id"], w, it))]
        if not E:
            continue
        fi = len(fams)
        fams.append([x["id"], x["family"], CAT.get(x["category"], "display"), 1 if x["type"] == "google" else 0, x["weights"], 1 if "italic" in x["styles"] else 0, x.get("license", "")])
        for (w, it) in E:
            jobs.append((fi, w, it, wpath(x["id"], w, it)))
    print(len(fams), "families,", len(jobs), "styles; drawing letters...")
    pk = os.path.join(CACHE, "rows.pkl")
    old = pickle.load(open(pk, "rb")) if os.path.exists(pk) and "--redraw" not in sys.argv else {}
    todo = [j[3] for j in jobs if j[3] not in old]
    if todo:
        with cf.ProcessPoolExecutor() as ex:
            for p, r in zip(todo, ex.map(render_style, todo, chunksize=8)):
                old[p] = r
        pickle.dump(old, open(pk, "wb"))
    res = [old[j[3]] for j in jobs]
    for j, r in zip(jobs, res):
        if r is None or sum(1 for c in CHARS if r.get(c)) < 20:
            continue
        styles.append([j[0], j[1], j[2]])
        rows.append(r)
    print(len(styles), "styles drawn in %.0f s" % (time.time() - t0))
    N = len(styles)
    shards = {}
    for ch in CHARS:
        have = [i for i in range(N) if rows[i][ch]]
        X = np.array([rows[i][ch][0] for i in have], np.float32)
        mean = X.mean(0)
        U, S, Vt = np.linalg.svd(X - mean, full_matrices=False)
        basis = Vt[:K]
        coef = (X - mean) @ basis.T
        shards[ch] = (have, mean, basis, coef, (S[:K] ** 2).sum() / (S ** 2).sum())
    # same Latin letters (Noto Sans and Noto Sans Telugu, Anek Bangla and Anek Odia ...): keep one, list the others as "same letters"
    C = np.zeros((N, len(CHARS) * K), np.float32)
    mask = np.zeros((N, len(CHARS)), bool)
    for k, ch in enumerate(CHARS):
        have, _, _, coef, _ = shards[ch]
        C[have, k * K:(k + 1) * K] = coef
        mask[have, k] = True
    sq = (C ** 2).sum(1)
    D = (sq[:, None] + sq[None, :] - 2 * C @ C.T) / (len(CHARS) * G * G)
    # which copy is shown first: the family made for Latin (most writing systems, no script name), then the shorter name
    subs = {x["id"]: len(x["subsets"]) for x in meta}
    scr = ("telugu", "tamil", "bengali", "bangla", "khmer", "thai", "lao", "arabic", "hebrew", "devanagari", "gujarati", "gurmukhi", "kannada", "malayalam", "odia", "sinhala", "hk", "tc", "sc", "jp", "kr", "myanmar", "georgian", "armenian", "ethiopic")
    order = sorted(range(N), key=lambda i: (any(w in fams[styles[i][0]][0].split("-") for w in scr), -subs.get(fams[styles[i][0]][0], 0), len(fams[styles[i][0]][1]), fams[styles[i][0]][1]))
    dup = [-1] * N
    for a in order:
        if dup[a] >= 0:
            continue
        for b in np.nonzero(D[a] < DUP)[0]:
            b = int(b)
            if b != a and dup[b] < 0 and styles[b][1:] == styles[a][1:] and (mask[a] == mask[b]).all():
                dup[b] = a
    for i in range(N):
        styles[i].append(dup[i])
    prim = [i for i in range(N) if dup[i] < 0]
    print(len(prim), "styles after merging look-alike copies (", N - len(prim), "copies )")
    print("PCA variance kept (K=%d): min %.3f, mean %.3f" % (K, min(v[4] for v in shards.values()), np.mean([v[4] for v in shards.values()])))
    if not apply:
        print("dry run: add --apply to write", OUT)
        return
    os.makedirs(os.path.join(OUT, "g"), exist_ok=True)
    total = 0
    for ch, (have, mean, basis, coef, _) in shards.items():
        cs = float(np.abs(coef).max() / 127) or 1.0
        bs = float(np.abs(basis).max() / 127) or 1.0
        rec = bytearray()
        idx = {i: k for k, i in enumerate(have)}
        for i in prim:
            if i in idx:
                q = np.clip(np.round(coef[idx[i]] / cs), -127, 127).astype(np.int8).tobytes()
                rec += q + bytes(qmet(rows[i][ch][1])) + b"\x00"
            else:
                rec += bytes(K) + b"\x00\x00\x00\x01"
        head = b"MFF1" + struct.pack("<BBHIIff", 1, K, G, len(prim), ord(ch), cs, bs)
        body = head + np.clip(np.round(mean * 255), 0, 255).astype(np.uint8).tobytes() + np.clip(np.round(basis / bs), -127, 127).astype(np.int8).tobytes() + bytes(rec)
        open(os.path.join(OUT, "g", "%d.bin" % ord(ch)), "wb").write(body)
        total += len(body)
    json.dump({"v": 1, "built": time.strftime("%Y-%m-%d"), "chars": CHARS, "K": K, "G": G,
               "cols": ["id", "family", "cat", "google", "weights", "italic", "license"], "fams": fams,
               "scols": ["fam", "weight", "italic", "copyOf"], "styles": styles, "prim": prim},
              open(os.path.join(OUT, "fonts.json"), "w"), separators=(",", ":"))
    print("wrote %d letter files, %.1f MB, + fonts.json" % (len(shards), total / 1e6))


if __name__ == "__main__":
    main()
