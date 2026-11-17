#!/usr/bin/env python3
"""Make the web copies of the photos and films used by the Alpine West redesign.

Every picture on the site is listed in PHOTOS below: a readable name -> the Wix
media id of the original (the full-size file Karolina uploaded to Wix). The script
downloads the original once into ~/.cache/alpinewest-originals, then writes
img/<name>-<width>.webp at a few widths (never upscaled) plus img/<name>.jpg for
social share cards.

To swap a picture later: drop a new file in img/ under the same name (or point the
name at another Wix id / local file here) and re-run. Pages never need editing.

    python3 alpinewest-redesign/_tools/make_media.py          # dry run
    python3 alpinewest-redesign/_tools/make_media.py --apply
"""
import json, os, subprocess, sys, urllib.request
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.expanduser("~/.cache/alpinewest-originals")
WIDTHS = [640, 1080, 1600, 2400]

# name -> Wix id (fb73f6_<id>~mv2.*). Grouped by property.
PHOTOS = {
    # Secrets Mallorca Villamil Resort & Spa (Paguera, Mallorca, Spain)
    "villamil-cabana-reading":   "e4e637ab",
    "villamil-balcony-sea":      "28478b1a",
    "villamil-cabana-wine":      "d2500806",
    "villamil-terrace-palm":     "7f7e119a",
    "villamil-evening-stairs":   "7481872a",
    "villamil-cocktails-marble": "bb0a455b",
    "villamil-indoor-pool":      "7f735a49",
    "villamil-caprese":          "72f15fbf",
    "villamil-terrace-view":     "694cec4a",
    "villamil-sunlit-cocktail":  "1b6ee997",
    "villamil-bar-pour":         "f9c869f3",
    "villamil-garden-stairs":    "931275a7",
    "villamil-pool-swimmer":     "156484e7",
    "villamil-pool-glass":       "17d4ee88",
    "villamil-lunch-table":      "833a0bfa",
    "villamil-poolside-dessert": "3c2a3d37",
    "villamil-golden-cocktail":  "6f06e0f3",
    "villamil-rose-pillow":      "d485a370",
    "villamil-suite-lamp":       "fa6f4830",
    # Hyatt Ziva Puerto Vallarta (Mexico)
    "ziva-cabana-cocktail":      "be0b4f78",
    "ziva-coconut-pool":         "b3947367",
    "ziva-lantern-walk":         "479531b5",
    "ziva-sunset-cabanas":       "3fe6d512",
    "ziva-yoga-terrace":         "28321faa",
    "ziva-fitness-ocean":        "0c9f5752",
    "ziva-folk-dancers":         "3db284e7",
    "ziva-fire-mask":            "27946ba4",
    "ziva-fire-performer":       "740895c0",
    # Hyatt Regency Calgary (The Grain Bar)
    "calgary-grain-cocktails":   "b0107e78",
    "calgary-grain-toast":       "7e81ae30",
    "calgary-grain-cocoa":       "45f57264",
    "calgary-grain-guest":       "c02c9aa5",
    "calgary-grain-cheers":      "7a32f024",
    "calgary-grain-sour":        "446ba23f",
    "calgary-winter-dining":     "e9a00d92",
    "calgary-loft-lounge":       "f9d07321",
    # One18 Empire (restaurant & bar, labelled on the old Food & Beverage page)
    "one18-torch":               "84948f2e",
    "one18-pour":                "9a34f829",
    "one18-scallops":            "d228f8f4",
    "one18-brunch":              "0fef6911",
    # Karolina
    "karolina-portrait":         "746ae3b8",
}

# name -> (Wix video id, start seconds for the poster frame)
FILMS = {
    "villamil-film":   ("1812e31a553749a084f9e204069b452e", 1.0),
    "villamil-reel":   ("2d3d75867ee44d6fab31365419e2eb2e", 4.0),
    "spa-reel":        ("da7611427c4e4d2484c145000cba0761", 6.5),
}


def original(short):
    for f in os.listdir(CACHE):
        if f[7:15] == short:
            return os.path.join(CACHE, f)
    # fetch from Wix (the full id is needed; look it up from the old site's media folder)
    media = os.path.join(os.path.dirname(ROOT), "karo.mes.fm", "media")
    full = next((f.split("_mv2")[0] for f in os.listdir(media) if f[7:15] == short), None)
    if not full:
        sys.exit(f"no original for {short}")
    for ext in ("jpg", "jpeg", "png", "webp"):
        try:
            with urllib.request.urlopen(f"https://static.wixstatic.com/media/{full}~mv2.{ext}", timeout=60) as r:
                out = os.path.join(CACHE, f"{full}.{ext}")
                open(out, "wb").write(r.read())
                return out
        except Exception:
            pass
    sys.exit(f"could not download {short}")


def main(apply):
    os.makedirs(CACHE, exist_ok=True)
    img = os.path.join(ROOT, "img")
    os.makedirs(img, exist_ok=True)
    meta = {}
    for name, short in PHOTOS.items():
        src = original(short)
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        w, h = im.size
        widths = [x for x in WIDTHS if x < w] + ([w] if w < WIDTHS[-1] else [])
        widths = sorted(set(min(x, w) for x in widths))[:4] or [w]
        meta[name] = {"w": w, "h": h, "widths": widths}
        if not apply:
            continue
        for x in widths:
            out = os.path.join(img, f"{name}-{x}.webp")
            if os.path.exists(out):
                continue
            r = im.resize((x, round(h * x / w)), Image.LANCZOS)
            r.save(out, "WEBP", quality=80, method=6)
        jpg = os.path.join(img, f"{name}.jpg")
        if not os.path.exists(jpg):
            r = im.copy(); r.thumbnail((1600, 1600), Image.LANCZOS)
            r.save(jpg, "JPEG", quality=82, optimize=True, progressive=True)
    films = {}
    vid = os.path.join(ROOT, "video")
    os.makedirs(vid, exist_ok=True)
    for name, (vid_id, t) in FILMS.items():
        src = os.path.join(CACHE, "video", f"{vid_id}.mp4")
        films[name] = {"src": f"/video/{name}.mp4", "poster": f"/img/{name}-poster.webp"}
        if not apply:
            continue
        out = os.path.join(vid, f"{name}.mp4")
        if not os.path.exists(out):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", "scale=720:-2",
                            "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-profile:v", "high",
                            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                            "-c:a", "aac", "-b:a", "96k", out], check=True)
        poster = os.path.join(img, f"{name}-poster.webp")
        if not os.path.exists(poster):
            png = poster[:-5] + ".tmp.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", src,
                            "-frames:v", "1", "-vf", "scale=720:-2", png], check=True)
            Image.open(png).convert("RGB").save(poster, "WEBP", quality=80, method=6)
            os.remove(png)
    print(f"{len(meta)} photos, {len(films)} films" + ("" if apply else " (dry run: --apply writes)"))
    if apply:
        json.dump({"photos": meta, "films": films}, open(os.path.join(ROOT, "_tools", "media.json"), "w"), indent=1)


if __name__ == "__main__":
    main("--apply" in sys.argv)
