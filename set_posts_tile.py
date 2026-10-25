#!/usr/bin/env python3
"""Set the "Posts" tile image of a hub: mes.fm/911, mes.fm/911spooks, mes.fm/bg, mes.fm/conspiracy, mes.fm/mh370
(img/<hub>-posts-icon.jpg, 900x600).

Run it whenever a new post is mirrored into those Posts lists. Default = the FIRST IMAGE of the mirrored page,
centre-cropped to the 900x600 tile; override with --image / --index / --anchor / --box when a different
picture or crop reads better (e.g. a screenshot where the punchline sits at the bottom).

  python3 set_posts_tile.py --slug 911-revisionist-slander-mes            # first image of that page, dry run
  python3 set_posts_tile.py --slug 911-revisionist-slander-mes --apply
  python3 set_posts_tile.py --slug X --index 2 --apply                    # 2nd image in the article
  python3 set_posts_tile.py --image https://.../pic.jpg --anchor bottom --apply
  python3 set_posts_tile.py --image ~/Downloads/a.png --box 28,782,680,840 --apply   # red box (source pixels), crop follows it

--hubs 911,bg (default both; also 911spooks, conspiracy, mh370). --fit shows the whole picture on a blurred copy of itself
instead of cropping (for a wide multi-panel meme whose sides would be cut off). With --apply: writes the icon(s), bumps `iconVersion` of the posts
page in each hub's build.mjs (so cached tiles refresh) and runs `npm run build` there. Dry-runs by default.

Automatic mode (used by mes.fm/conspiracy/build.mjs on every build):
  python3 set_posts_tile.py --auto --hubs conspiracy --key <newest item url> (--slug S | --image URL) --apply
remakes the tile only when <key> differs from the one recorded in mes.fm/img/posts-tiles.json ({hub: {key, src, v}}),
records the new key and a bumped version `v` there, and does NOT edit build.mjs or rebuild (the build reads `v` itself
and uses max(iconVersion, v)). A manual run with --slug also records that page as the key, so a hand-picked crop of the
newest post is kept until a newer post arrives.
"""
import argparse, io, json, os, re, subprocess, sys, urllib.request
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "mes.fm")
HUBS = {"911": "911-posts", "911spooks": "911spooks-posts", "bg": "bg-posts", "conspiracy": "conspiracy-posts", "mh370": "mh370-posts"}
STAMP = os.path.join(SITE, "img", "posts-tiles.json")


def load_stamp():
    try:
        return json.load(open(STAMP, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_stamp(d):
    with open(STAMP, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(d.items())), f, indent=2)
        f.write("\n")


def icon_version(build, slug):
    m = re.search(r'slug:\s*"%s".*?iconVersion:\s*(\d+)' % re.escape(slug), open(build, encoding="utf-8").read(), re.S)
    return int(m.group(1)) if m else 0
W, H = 900, 600


def fetch(src):
    # mes.fm images (root-relative or https://mes.fm/...) are read from the working tree, so a page that is not
    # deployed yet works too
    local = re.sub(r"^https?://(www\.)?mes\.fm(?=/)", "", src.split("?")[0])
    if local.startswith("/") and os.path.isfile(os.path.join(SITE, local.lstrip("/"))):
        return open(os.path.join(SITE, local.lstrip("/")), "rb").read()
    if re.match(r"https?://", src):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        return urllib.request.urlopen(req, timeout=30).read()
    return open(os.path.expanduser(src), "rb").read()


def article_images(slug):
    p = os.path.join(SITE, slug, "index.html")
    if not os.path.exists(p):
        sys.exit(f"no page at mes.fm/{slug}/index.html")
    html = open(p, encoding="utf-8").read()
    art = html[html.index("<article>"):] if "<article>" in html else html
    return re.findall(r'<img[^>]*\bsrc="([^"]+)"', art)


def fit_tile(img):
    """the whole picture, centred on a blurred, stretched copy of itself (nothing cropped)"""
    img = img.convert("RGB")
    bg = img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(24))
    s = min(W / img.width, H / img.height)
    fg = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    return bg


def make_tile(img, anchor, box):
    img = img.convert("RGB")
    w, h = img.size
    if box:
        d = ImageDraw.Draw(img)
        x0, y0, x1, y1 = box
        t = max(3, round(w / 160))
        for i in range(t):
            d.rounded_rectangle((x0 - i, y0 - i, x1 + i, y1 + i), radius=max(8, t * 2), outline=(235, 32, 32))
    # largest 3:2 window
    cw, ch = (w, round(w * H / W)) if w * H <= h * W else (round(h * W / H), h)
    ch = min(ch, h); cw = min(cw, w)
    left = (w - cw) // 2
    if box:
        top = round((box[1] + box[3]) / 2 - ch / 2)
    else:
        top = {"top": 0, "center": (h - ch) // 2, "bottom": h - ch}[anchor]
    top = max(0, min(top, h - ch))
    return img.crop((left, top, left + cw, top + ch)).resize((W, H), Image.LANCZOS)


def bump(build, slug):
    s = open(build, encoding="utf-8").read()
    m = re.search(r'(slug:\s*"%s".*?iconVersion:\s*)(\d+)' % re.escape(slug), s, re.S)
    if not m:
        sys.exit(f"iconVersion for {slug} not found in {build}")
    new = int(m.group(2)) + 1
    open(build, "w", encoding="utf-8").write(s[:m.start(2)] + str(new) + s[m.end(2):])
    return new


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slug", help="mirror page whose first image is used (default source)")
    ap.add_argument("--index", type=int, default=1, help="which image of the page (1 = first)")
    ap.add_argument("--image", help="URL or local file instead of a page image")
    ap.add_argument("--anchor", choices=["top", "center", "bottom"], default="center")
    ap.add_argument("--box", help="x0,y0,x1,y1 in source pixels: draw a red highlight box and centre the crop on it")
    ap.add_argument("--fit", action="store_true", help="fit the whole picture on a blurred background instead of cropping")
    ap.add_argument("--hubs", default="911,bg")
    ap.add_argument("--auto", action="store_true", help="only when --key changed since the last run (see posts-tiles.json); no build.mjs edit, no rebuild")
    ap.add_argument("--key", help="id of the newest Posts item (its URL); default https://mes.fm/<slug>")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    key = a.key or (f"https://mes.fm/{a.slug}" if a.slug else None)
    stamp = load_stamp()
    if a.auto:
        if not key:
            ap.error("--auto needs --key or --slug")
        todo = [h.strip() for h in a.hubs.split(",") if stamp.get(HUBS.get(h.strip(), ""), {}).get("key") != key]
        if not todo:
            print(f"posts tile up to date ({key})")
            return
        a.hubs = ",".join(todo)
    if not (a.slug or a.image):
        ap.error("give --slug (first image of a mirrored page) or --image")
    if a.image:
        src = a.image
    else:
        imgs = article_images(a.slug)
        if len(imgs) < a.index:
            sys.exit(f"mes.fm/{a.slug} has {len(imgs)} article image(s), asked for #{a.index}")
        src = imgs[a.index - 1]
    print("source:", src)
    box = tuple(int(v) for v in a.box.split(",")) if a.box else None
    pic = Image.open(io.BytesIO(fetch(src)))
    tile = fit_tile(pic) if a.fit else make_tile(pic, a.anchor, box)
    hubs = [h.strip() for h in a.hubs.split(",")]
    for h in hubs:
        if h not in HUBS:
            sys.exit(f"unknown hub {h}; choose from {', '.join(HUBS)}")
    for h in hubs:
        out = os.path.join(SITE, "img", f"{HUBS[h]}-icon.jpg")
        print(("write " if a.apply else "would write ") + os.path.relpath(out, ROOT))
        if a.apply:
            tile.save(out, quality=88)
            build = os.path.join(SITE, h, "build.mjs")
            if a.auto:
                v = max(icon_version(build, HUBS[h]), stamp.get(HUBS[h], {}).get("v", 0)) + 1
                print(f"  {HUBS[h]} tile version -> {v} (posts-tiles.json)")
            else:
                v = bump(build, HUBS[h])
                print(f"  {h}/build.mjs iconVersion -> {v}")
            if key:
                stamp[HUBS[h]] = {"key": key, "src": src, "v": v}
                save_stamp(stamp)
            if not a.auto:
                subprocess.run(["npm", "run", "build"], cwd=os.path.join(SITE, h), check=True, stdout=subprocess.DEVNULL)
    if not a.apply:
        print("dry run: pass --apply to write")
    else:
        print("done: review `git diff --stat`, then commit the icons, build.mjs files and rebuilt hub pages")


if __name__ == "__main__":
    main()
