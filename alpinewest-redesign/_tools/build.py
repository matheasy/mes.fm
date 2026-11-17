#!/usr/bin/env python3
"""Build the Alpine West redesign pages from _src/ into the site folder.

Source pages are plain HTML with three small helpers:

  <!--page title="..." desc="..." path="/work" og="villamil-balcony-sea" nav="work" -->
      first line of a page: <title>, description, canonical, share image, active nav item
  <x-pic name="villamil-balcony-sea" sizes="(min-width: 900px) 55vw, 100vw"
         alt="..." pos="50% 30%" class="..." eager></x-pic>
      -> <img> with a WebP srcset made by make_media.py (width/height set, lazy unless eager)
  <x-film name="villamil-film" class="..." label="..."></x-film>
      -> muted looping <video> that plays only while on screen, with a sound button
  <!--#header-->  <!--#footer-->  <!--#cta-->
      -> the shared partials in _src/_partials/

    python3 alpinewest-redesign/_tools/build.py
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_src")
SITE = "https://www.alpinewestcreative.com"
MEDIA = json.load(open(os.path.join(ROOT, "_tools", "media.json")))


def attrs(s):
    out = {}
    for m in re.finditer(r'([\w-]+)(?:="([^"]*)")?', s):
        out[m.group(1)] = html.unescape(m.group(2)) if m.group(2) is not None else ""
    return out


def pic(m):
    a = attrs(m.group(1))
    name = a["name"]
    p = MEDIA["photos"][name]
    srcset = ", ".join(f"/img/{name}-{w}.webp {w}w" for w in p["widths"])
    mid = p["widths"][min(1, len(p["widths"]) - 1)]
    out = [f'src="/img/{name}-{mid}.webp"', f'srcset="{srcset}"',
           f'sizes="{a.get("sizes", "100vw")}"', f'width="{p["w"]}"', f'height="{p["h"]}"',
           f'alt="{html.escape(a.get("alt", ""))}"']
    if "eager" in a:
        out.append('fetchpriority="high"')
    else:
        out.append('loading="lazy"')
    out.append('decoding="async"')
    if a.get("class"):
        out.append(f'class="{a["class"]}"')
    if a.get("pos"):
        out.append(f'style="object-position:{a["pos"]}"')
    return "<img " + " ".join(out) + ">"


def film(m):
    a = attrs(m.group(1))
    f = MEDIA["films"][a["name"]]
    label = html.escape(a.get("label", "Film"))
    return (f'<figure class="film {a.get("class", "")}">'
            f'<video muted loop playsinline preload="none" poster="{f["poster"]}" '
            f'data-src="{f["src"]}" aria-label="{label}"></video>'
            f'<button class="film__sound" type="button" aria-pressed="false" '
            f'aria-label="Turn the sound on">Sound off</button></figure>')


def build():
    parts = {f[:-5]: open(os.path.join(SRC, "_partials", f)).read()
             for f in os.listdir(os.path.join(SRC, "_partials")) if f.endswith(".html")}
    shell = parts.pop("shell")
    n = 0
    for dirpath, _, files in os.walk(SRC):
        if "_partials" in dirpath:
            continue
        for fn in files:
            if not fn.endswith(".html"):
                continue
            src = os.path.join(dirpath, fn)
            body = open(src).read()
            head = re.match(r"\s*<!--page(.*?)-->", body, re.S)
            meta = attrs(head.group(1)) if head else {}
            body = body[head.end():] if head else body
            body = shell.replace("{{body}}", body)
            for k, v in parts.items():
                body = body.replace(f"<!--#{k}-->", v)
            body = re.sub(r"<x-pic\s+(.*?)>\s*</x-pic>", pic, body, flags=re.S)
            body = re.sub(r"<x-film\s+(.*?)>\s*</x-film>", film, body, flags=re.S)
            nav = meta.get("nav", "")
            body = re.sub(r'data-nav="%s"' % re.escape(nav), 'data-nav="%s" aria-current="page"' % nav, body) if nav else body
            og = meta.get("og", "villamil-cabana-reading")
            page = (body.replace("{{title}}", html.escape(meta.get("title", "Alpine West Creative")))
                    .replace("{{desc}}", html.escape(meta.get("desc", "")))
                    .replace("{{canonical}}", SITE + meta.get("path", "/"))
                    .replace("{{og}}", f"{SITE}/img/{og}.jpg")
                    .replace("{{bodyclass}}", meta.get("bodyclass", ""))
                    .replace("{{robots}}", meta.get("robots", "index, follow")))
            rel = os.path.relpath(src, SRC)
            out = os.path.join(ROOT, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            open(out, "w").write(page)
            n += 1
    print(f"built {n} pages")


if __name__ == "__main__":
    build()
