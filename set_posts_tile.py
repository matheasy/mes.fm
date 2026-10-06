#!/usr/bin/env python3
"""Set the "Posts" tile image on mes.fm/911 and mes.fm/bg (img/911-posts-icon.jpg, img/bg-posts-icon.jpg).

Run it whenever a new post is mirrored into those Posts lists. Default = the FIRST IMAGE of the mirrored page,
centre-cropped to the 900x600 tile; override with --image / --index / --anchor / --box when a different
picture or crop reads better (e.g. a screenshot where the punchline sits at the bottom).

  python3 set_posts_tile.py --slug 911-revisionist-slander-mes            # first image of that page, dry run
  python3 set_posts_tile.py --slug 911-revisionist-slander-mes --apply
  python3 set_posts_tile.py --slug X --index 2 --apply                    # 2nd image in the article
  python3 set_posts_tile.py --image https://.../pic.jpg --anchor bottom --apply
  python3 set_posts_tile.py --image ~/Downloads/a.png --box 28,782,680,840 --apply   # red box (source pixels), crop follows it

--hubs 911,bg (default both). With --apply: writes the icon(s), bumps `iconVersion` of the posts page in each hub's
build.mjs (so cached tiles refresh) and runs `npm run build` there. Dry-runs by default.
"""
import argparse, io, os, re, subprocess, sys, urllib.request
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "mes.fm")
HUBS = {"911": "911-posts", "bg": "bg-posts"}
W, H = 900, 600


def fetch(src):
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
    ap.add_argument("--hubs", default="911,bg")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
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
    tile = make_tile(Image.open(io.BytesIO(fetch(src))), a.anchor, box)
    hubs = [h.strip() for h in a.hubs.split(",")]
    for h in hubs:
        if h not in HUBS:
            sys.exit(f"unknown hub {h}; choose from {', '.join(HUBS)}")
    for h in hubs:
        out = os.path.join(SITE, "img", f"{HUBS[h]}-icon.jpg")
        print(("write " if a.apply else "would write ") + os.path.relpath(out, ROOT))
        if a.apply:
            tile.save(out, quality=88)
            v = bump(os.path.join(SITE, h, "build.mjs"), HUBS[h])
            print(f"  {h}/build.mjs iconVersion -> {v}")
            subprocess.run(["npm", "run", "build"], cwd=os.path.join(SITE, h), check=True, stdout=subprocess.DEVNULL)
    if not a.apply:
        print("dry run: pass --apply to write")
    else:
        print("done: review `git diff --stat`, then commit the icons, build.mjs files and rebuilt hub pages")


if __name__ == "__main__":
    main()
