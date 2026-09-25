#!/usr/bin/env python3
"""Rebuild the four stand-alone calculator apps (listed on calculators.html) (earth-curvature-calculator, gematria, impermanent-loss-calculator,
unit-conversion) as proper tools-hub pages, like mes.fm/emoji, /latex, /stats: logo header + tool-coloured nav bar,
Site Navigation menu, standard footer, FastComments bar, and (via add_tool_page_controls.py) the floating header bar,
A-/A+/moon controls and derived dark mode. Before, they were bare pages with no header at all, so a floating bar had
nothing to float away from.

Shell = tool_page_template.html (the emoji page's shell with @@tokens@@). For each app the script lifts, from the old
page: meta description, the <style> rules (re-scoped under #main-content so they can't leak into the shell), and the
body between the ad block and the "MES Links" link (inputs, tables, inline calculator scripts stay in place, in order).
The old page's own ad divs / h1 / MES Links / footer are dropped -- the shell provides those.

Two modes per app. *Legacy*: convert the old ChatGPT-era page in place (run once; converted pages, which have an
`#info-bar`, are skipped). *Source* (preferred, used by all four now): if `tool_apps_src/<slug>/content.html` exists the
page is rebuilt from it -- `_shared.css` (the `.tu-*` widget kit, filled with the app's colours) + optional `app.css`,
`content.html` for the body and `app.js` copied to `mes.fm/<slug>/js/<slug>.js`. Source-mode apps are rebuilt every
run (`--rebuild` is implied), so edit the sources and re-run both scripts. Afterwards run
`python3 add_tool_page_controls.py --apply` (these slugs are in its TOOLS list) for the floating bar + controls + dark.
The per-app logos are placeholder artwork (mes.fm/<slug>/img/logo.png, img/<slug>-logo.png) -- replace the files, same
names, when real art exists. **Dry-runs by default; `--apply` writes.**
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
TEMPLATE = ROOT / "tool_page_template.html"
APPLY = "--apply" in sys.argv

SRC = ROOT / "tool_apps_src"
APPS = {
    "earth-curvature-calculator": dict(title="MES Earth Curvature Calculator", page_title="Earth Curvature Calculator",
                                       tag="How much does the Earth curve over a distance?", accent="#0b6f6d", dark="#075250", tint="#e2f3f2",
                                       desc="Free Earth curvature calculator: enter a distance to see the curvature drop, your horizon distance and how much of a far-away object is hidden behind the curve, with optional atmospheric refraction.",
                                       js_v="1"),
    "gematria": dict(title="MES Gematria Calculator", page_title="Gematria Calculator",
                     tag="Ordinal, reduction, Sumerian and more.", accent="#3538ab", dark="#262a80", tint="#e8e9f8",
                     desc="Free gematria calculator: type a word or phrase and get its Ordinal, Reverse, Reduction, Standard and Sumerian gematria values with a letter-by-letter breakdown.",
                     js_v="1"),
    "impermanent-loss-calculator": dict(title="MES Impermanent Loss Calculator", page_title="Impermanent Loss Calculator",
                                        tag="Impermanent loss vs. simply holding.", accent="#c2500e", dark="#933b08", tint="#fbece1",
                                        desc="Free impermanent loss calculator for constant-product liquidity pools: see your loss versus holding, the pool token amounts, break-even fees and an impermanent loss chart for any price change.",
                                        js_v="1"),
    "unit-conversion": dict(title="MES Unit Conversion Calculator", page_title="Unit Conversion Calculator",
                            tag="Convert length, weight, temperature, speed and more.", accent="#00838f", dark="#005f68", tint="#dff2f4",
                            desc="Free unit converter with search: type “10 miles to km” or pick a category to convert length, mass, temperature, area, volume, speed, time, pressure, energy, power, data and more.",
                            js_v="1"),
}
LEGACY_SEL = re.compile(r"\.outer-container|\.outer-page-content|\.side-bar|\.page-box|^img$|^table$")


def css_items(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    items, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        items.append((css[i:j].strip(), css[j + 1:k - 1]))
        i = k
    return items


def scope(css):
    out = []
    for sel, body in css_items(css):
        if sel.startswith("@media"):
            if "768" in sel and LEGACY_SEL.search(body):
                continue  # the repo-wide responsive fix block, not part of the app
            inner = scope(body)
            if inner:
                out.append("\t%s {\n%s\n\t}" % (sel, inner))
            continue
        parts = []
        for s in re.split(r",(?![^(]*\))", sel):
            s = s.strip()
            if not s or LEGACY_SEL.search(s) or s.startswith("html"):
                continue
            parts.append("#main-content" + s[4:] if re.match(r"^body\b", s) else "#main-content " + s)
        if parts:
            out.append("\t%s {%s}" % (",\n\t".join(parts), re.sub(r"\s+", " ", body).strip()))
    return "\n".join(out)


def build(slug, cfg, old, tpl):
    style = re.search(r"<style[^>]*>(.*?)</style>", old, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', old).group(1)
    body_open = re.search(r"<body[^>]*>", old).end()
    ends = [old.find(m, body_open) for m in ('<h2><a href="https://mes.fm/links/">', '<div style="clear: both;"></div>')]
    end = min(e for e in ends if e >= 0)
    content = old[body_open:end]
    # drop the old page's chrome: ad divs, header/h1, stray async ad scripts
    content = re.sub(r'<div style="text-align: center;[^"]*">\s*<script async src="https://pagead2[^<]*</script>\s*</div>', "", content, flags=re.S)
    content = re.sub(r"<script async src=\"https://pagead2[^<]*</script>", "", content, flags=re.S)
    content = re.sub(r"<header>\s*<h1>.*?</h1>\s*</header>", "", content, flags=re.S)
    # unit-conversion's h1 doubles as the expand/collapse-all toggle: keep the behaviour as a sub-heading
    content = re.sub(r'<h1 class="list-header" onclick="toggleAllLists\(\)">[^<]*(<span id="arrowIconAll"[^>]*>[^<]*</span>)\s*</h1>',
                     r'<h2 class="list-header" onclick="toggleAllLists()">All converters \1</h2>', content, flags=re.S)
    content = re.sub(r"<h1[^>]*>.*?</h1>", "", content, count=1, flags=re.S)
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebApplication", "name": cfg["title"],
                     "url": "https://mes.fm/" + slug, "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
                     "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": desc}, ensure_ascii=False)
    page = tpl
    # the shell paints every <a> white (for the nav bar / footer); inside the tool, links get the tool colour again
    link_css = "\t#main-content {overflow-x: auto;}   /* wide tables / big inputs scroll inside the tool instead of the page */\n\t#main-content a {color: %s; text-decoration: underline !important;}\n\t#main-content a:hover {color: %s;}\n" % (cfg["accent"], cfg["dark"])
    fills = {"@@TOOL_CSS@@": link_css + (scope(style.group(1)) if style else ""), "@@CONTENT@@": content.strip("\n"), "@@SCRIPTS@@": "",
             "@@LDJSON@@": ld, "@@DESC@@": desc.replace('"', "&quot;"), "@@TITLE@@": cfg["title"], "@@SLUG@@": slug,
             "@@TAGLINE@@": cfg["tag"], "@@PAGE_TITLE@@": cfg["page_title"], "@@PAGE_DESC@@": desc,
             "@@ACCENT@@": cfg["accent"], "@@ACCENT_DARK@@": cfg["dark"]}
    for k in ("@@TOOL_CSS@@", "@@CONTENT@@", "@@LDJSON@@"):     # big / unescaped ones first so their text is never re-scanned
        page = page.replace(k, fills[k])
    for k, v in fills.items():
        if k not in ("@@TOOL_CSS@@", "@@CONTENT@@", "@@LDJSON@@"):
            page = page.replace(k, v)
    # these are calculators, not tools-hub tools: the info-bar's section link goes to the calculators page
    page = page.replace("href='https://mes.fm/tools.html'>Tools</a>", "href='https://mes.fm/calculators.html'>Calculators</a>")
    return page


def build_from_source(slug, cfg, tpl):
    d = SRC / slug
    css = (SRC / "_shared.css").read_text(encoding="utf-8")
    if (d / "app.css").exists():
        css += "\n" + (d / "app.css").read_text(encoding="utf-8")
    css = (css.replace("@@ACCENT@@", cfg["accent"]).replace("@@ACCENT_DARK@@", cfg["dark"]).replace("@@TINT@@", cfg["tint"])
           .replace("var(--tint)", cfg["tint"]))
    content = (d / "content.html").read_text(encoding="utf-8")
    desc = cfg["desc"]
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebApplication", "name": cfg["title"],
                     "url": "https://mes.fm/" + slug, "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
                     "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": desc}, ensure_ascii=False)
    scripts = '<script src="/%s/js/%s.js?v=%s" defer></script>' % (slug, slug, cfg["js_v"])
    page = tpl
    for k, v in (("@@TOOL_CSS@@", css), ("@@CONTENT@@", content.strip("\n")), ("@@LDJSON@@", ld)):
        page = page.replace(k, v)
    for k, v in {"@@SCRIPTS@@": scripts, "@@DESC@@": desc.replace('"', "&quot;"), "@@TITLE@@": cfg["title"], "@@SLUG@@": slug,
                 "@@TAGLINE@@": cfg["tag"], "@@PAGE_TITLE@@": cfg["page_title"], "@@PAGE_DESC@@": desc,
                 "@@ACCENT@@": cfg["accent"], "@@ACCENT_DARK@@": cfg["dark"]}.items():
        page = page.replace(k, v)
    page = page.replace("href='https://mes.fm/tools.html'>Tools</a>", "href='https://mes.fm/calculators.html'>Calculators</a>")
    js_dir = SITE / slug / "js"
    js_dir.mkdir(parents=True, exist_ok=True)
    return page, (d / "app.js").read_text(encoding="utf-8"), js_dir / (slug + ".js")


def main():
    tpl = TEMPLATE.read_text(encoding="utf-8")
    for slug, cfg in APPS.items():
        p = SITE / slug / "index.html"
        if (SRC / slug / "content.html").exists():
            new, js, jsp = build_from_source(slug, cfg, tpl)
            print("%-30s source mode -> %d bytes html, %d bytes js" % (slug, len(new), len(js)))
            if APPLY:
                p.write_text(new, encoding="utf-8")
                jsp.write_text(js, encoding="utf-8")
            continue
        old = p.read_text(encoding="utf-8")
        if 'id="info-bar"' in old:
            print("%-30s already converted" % slug)
            continue
        new = build(slug, cfg, old, tpl)
        print("%-30s %d -> %d bytes" % (slug, len(old), len(new)))
        if APPLY:
            p.write_text(new, encoding="utf-8")
    print("" if APPLY else "(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
