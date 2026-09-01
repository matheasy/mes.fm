#!/usr/bin/env python3
"""Make the "Random" button on the gallery article pages actually random.

HTTrack baked the Random link as a fixed slug at capture time, and where
that target hadn't been captured it fell back to the section index -- so
pressing Random repeatedly (and every Random on a rebuilt page) dumps you
back on the gallery. Replace it with a tiny per-section script that picks
a real sibling slug at random, wired onto every page in the section
(real + rebuilt). Idempotent.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
SECTIONS = [
    ("gradecalculator", "memes"),
    ("timer", "inspirational-quotes"),
    ("percentagecalculator", "memes"),
    ("percentagecalculator", "interesting-facts"),
    ("mortgagecalculator", "dream-homes"),
    ("bmicalculator", "memes"),
    ("bmicalculator", "health-tips"),
]
MARK = "<!-- random-nav -->"


def js_for(slug, section, slugs):
    arr = ",".join(f'"{s}"' for s in slugs)
    return f"""(function(){{
  var S=[{arr}],B="/{slug}/{section}/";
  function wire(){{
    var here=(location.pathname.split("/").pop()||"").replace(/\\.html$/,"");
    [].forEach.call(document.querySelectorAll("a.btn-link"),function(a){{
      if(!/Random/.test(a.textContent))return;
      a.setAttribute("href",B+S[Math.random()*S.length|0]);
      a.addEventListener("click",function(e){{
        e.preventDefault();
        var p;do{{p=S[Math.random()*S.length|0];}}while(S.length>1&&p===here);
        location.href=B+p;
      }});
    }});
  }}
  if(document.readyState!=="loading")wire();
  else document.addEventListener("DOMContentLoaded",wire);
}})();
"""


def main():
    for slug, section in SECTIONS:
        sdir = ROOT / slug / section
        if not sdir.is_dir():
            print(f"skip {slug}/{section}")
            continue
        slugs = sorted(
            p.stem for p in sdir.glob("*.html")
            if not re.fullmatch(r"\d+", p.stem)
        )
        if len(slugs) < 2:
            print(f"skip {slug}/{section} (<2 pages)")
            continue
        js_name = f"random-{section}.js"
        (ROOT / slug / "js" / js_name).write_text(
            js_for(slug, section, slugs), encoding="utf-8"
        )
        tag = f'{MARK}<script src="/{slug}/js/{js_name}" defer></script>'
        n = 0
        for p in sdir.glob("*.html"):
            if re.fullmatch(r"\d+", p.stem):
                continue
            s = p.read_text(encoding="utf-8", errors="surrogateescape")
            if MARK in s:
                continue
            if "</body>" not in s:
                continue
            p.write_text(s.replace("</body>", tag + "</body>", 1),
                         encoding="utf-8", errors="surrogateescape")
            n += 1
        print(f"{slug}/{section}: {len(slugs)} slugs, wired {n} pages")


if __name__ == "__main__":
    main()
