#!/usr/bin/env python3
"""Convert the bare Hive-mirror pages (dark page, '<- mes.fm/911' back link, small controls, plain footer) to the
math-hub page format -- the narrow topic-branded shell used by mes.fm/911, /hutchison, /science and the Q/A pages:
logo header + A-/A+/moon + hamburger nav, blue nav bar, floating compact bar, 'Part of <hub>' box, standard footer.

Each page is rebuilt from hive_mirror_template.html (a copy of cubic-formula/child-template.html with brand tokens):
  * head: the page's own head is kept verbatim (metas, OG tags, its AdSense on/off state) -- only the <style> is
    replaced by the template's, plus the page's own *extra* CSS rules (.post-image, .quoted-post, .video-embed video,
    .screenshot-grid, .spec-table ...) minus the legacy top-bar / theme-button / responsive-fix rules
  * body: h1, subtitle, <article> and any page-specific scripts (video players ...) are lifted from the old page;
    the back link becomes the 'Part of' box; brand (logo/title/tagline) comes from BRANDS by the back link's target
  * standard scripts (theme, text size, image lightbox + zoom, compact bar, main.js) come from the template; the
    theater-mode script is dropped on pages with no #videoEmbed

Pages it can't convert safely (custom apps, chaptered hubs ...) are listed as SKIPPED and left alone.
**Dry-runs by default; `--apply` writes.** Idempotent (converted pages have an #info-bar and are skipped).
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
TEMPLATE = ROOT / "hive_mirror_template.html"
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv
# custom apps with their own theme/layout logic -- left alone
NEVER = {"bg"}
ONLY = {a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")}

GENERIC = dict(logo="/img/logo-mark.png", title="MES.fm", tag="Videos, tutorials, calculators and research by Math Easy Solutions.", href="/")
BRANDS = {
    "/911": dict(logo="/img/911-truth-logo.jpg", title="MES 9/11 Truth", tag="Videos, livestreams and research on 9/11.", href="/911", label="MES 9/11 Truth"),
    "/hutchison": dict(logo="/img/hutchison-logo.jpg", title="MES Hutchison Effect", tag="Antigravity, materials transmutation, and John Hutchison's demonstrations.", href="/hutchison", label="MES Hutchison Effect"),
    "/science": dict(logo="/img/science-logo.png", title="MES Science", tag="Links, videos and posts on science topics.", href="/science", label="MES Science"),
    "/crypto": dict(logo="/img/crypto-logo.jpg", title="MES Crypto", tag="Blockchain and crypto: news, tutorials, Hive, tools and posts.", href="/crypto", label="MES Crypto"),
    "/conspiracy": dict(logo="/img/conspiracy-logo.jpg", title="MES Conspiracy", tag="Alt-news checkups, videos and posts on conspiracies.", href="/conspiracy", label="MES Conspiracy"),
}
# pages that get their own brand / "Part of" box instead of the one implied by their back link
PAGE_BRANDS = {
    "moon": (dict(logo="/moon/img/logo.png", title="MES Moon", tag="Live sky dashboard: moon phase, sun, planets and astronomy.", href="/moon"),
             'Part of <a href="/tools">MES Tools</a> &middot; <a href="/science">MES Science</a>'),
}
LEGACY = re.compile(r"theme-toggle-btn|text-size|top-bar-controls|^\.outer-|\.page-box|\.side-bar|^img$|^table$|site-footer-note|^hr$")


def css_items(css):
    """Top-level (selector_text, full_text) items of a stylesheet; at-rule blocks keep their whole text."""
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
        items.append((css[i:j].strip(), css[i:k].strip()))
        i = k
    return items


def selectors(sel):
    return {re.sub(r"\s+", " ", s.strip()) for s in sel.split(",") if s.strip()}


def extra_css(old_css, new_css):
    have = set()
    for sel, _ in css_items(new_css):
        have |= selectors(sel)
    out = []
    for sel, text in css_items(old_css):
        if sel.startswith("@"):
            continue  # responsive-fix / mobile blocks are covered by the template
        sels = selectors(sel)
        keep = {s for s in sels if s not in have and not LEGACY.search(s)}
        if keep:
            out.append(text)
    return out


def scripts(body):
    """[(start, end, text)] for every <script>...</script> in body."""
    return [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"<script\b[^>]*>.*?</script>", body, re.S)]


STANDARD = ("const themeToggle", "theater-mode:", "image-lightbox:", "lightbox-zoom:", "text-size-control:")


# The hubs' own `li { margin-bottom: 10px }` and the mirror shell's 1.6 body line-height made the blue nav bar ~53px tall
# (mes.fm/math's is ~35px): reset both for the bar so it matches.
NAV_BAR_FIX = ("    /* blue nav bar: same height as mes.fm/math (hub li margin + 1.6 body line-height made it ~53px) */\n"
               "    .info-bar-container li { margin-bottom: 0; }\n"
               "    .info-bar { line-height: 16px; }\n")


# The hubs' base CSS caps .top-bar at 900px but nothing capped the nav bar / "Part of" box, so on a wide window the header
# was a narrow logo row over an edge-to-edge blue bar. Cap the whole chrome to the same 1180px band as the card grids
# (.wide), footer included, like mes.fm/hutchison.
HUB_WIDTH_FIX = ("    /* header + nav bar: same 1180px band as the card grids, not a 900px logo row over a full-width bar */\n"
                 "    .container { max-width: 1180px; margin: 0 auto; }\n"
                 "    .container .top-bar { max-width: none; }\n"
                 "    .footer { max-width: 1180px; box-sizing: border-box; }\n")


CHROME_SEL = re.compile(r"\.top-bar|\.site-brand|\.header-|\.hamburger|#navbar|\.navbar|\.info-bar|#info-bar|\.social|\.part-of|\.footer|#footer|#copyright|compact-nav|is-stuck|is-visible|\.dropdown")


def block(text, start_marker):
    """text of the <div ...> starting at start_marker through its matching </div>"""
    i = text.index(start_marker)
    depth, pos = 0, i
    for m in re.finditer(r"<(/?)div\b[^>]*>", text[i:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return text[i: i + m.end()]
    raise ValueError("unbalanced div")


def brand_and_partof(links):
    def norm(h):
        return re.sub(r"^https://mes\.fm", "", h).rstrip("/") or "/"
    brand = BRANDS.get(norm(links[0][0]))
    partof = "Part of " + " &middot; ".join(
        '<a href="%s">%s</a>' % (h, BRANDS[norm(h)]["label"] if norm(h) in BRANDS else l) for h, l in links)
    return (brand or GENERIC), partof


def fill_brand(s, b, partof):
    for k, v in {
        "@@BRAND_HREF@@": b["href"], "@@BRAND_LOGO@@": b["logo"], "@@BRAND_LOGO_ABS@@": "https://mes.fm" + b["logo"],
        "@@BRAND_TITLE@@": b["title"], "@@BRAND_TAG@@": b["tag"], "@@PARTOF@@": partof,
        "@@COMPACT_MATH_LINK@@": '<li><a href="/math" tabindex="-1">Math Tutorials</a></li>',
    }.items():
        s = s.replace(k, v)
    return s


def site_links(old):
    m1 = re.search(r'<a class="site-link" href="([^"]*)">([^<]*)</a>', old)
    m2 = re.search(r'<span class="site-link">(.*?)</span>', old, re.S)
    if m1:
        return [(m1.group(1), re.sub(r"^&larr;\s*", "", m1.group(2)).strip())]
    if m2:  # mirror linked from several hubs: '&larr; <a>hub</a> &middot; <a>hub</a>'
        return re.findall(r'<a href="([^"]*)">([^<]*)</a>', m2.group(1))
    return []


def chrome_swap(old, template):
    """For chaptered / custom-layout mirrors (no standard <article> body): keep the whole page, swap only the chrome --
    top bar -> branded header + nav + 'Part of' box, plain footer -> site footer, add compact-bar + main.js scripts."""
    links = site_links(old)
    style = re.search(r"<style>(.*?)</style>", old, re.S)
    if not (links and style and 'class="top-bar"' in old and "const themeToggle" in old):
        return None, "no standard chrome to swap"
    b, partof = brand_and_partof(links)
    cm = re.search(r'<link rel="canonical" href="https://mes\.fm/([^"/]*)', old)
    if cm and cm.group(1) in PAGE_BRANDS:
        b, partof = PAGE_BRANDS[cm.group(1)]
    tpl = template
    compact = fill_brand(block(tpl, '<div id="compact-nav"'), b, partof)
    top = fill_brand(block(tpl, '<div class="top-bar">'), b, partof)
    nav = block(tpl, '<div class="info-bar-container"')
    part = block(tpl, '<div class="part-of">').replace("@@PARTOF@@", partof)
    footer = tpl[tpl.index('<div id="footer"'): tpl.index("getFullYear();</script>") + len("getFullYear();</script>")]
    tail = fill_brand(tpl[tpl.index('<script src="https://ajax.googleapis.com/ajax/libs/jquery'): tpl.index("</body>")], b, partof)
    # A-/A+ scale the page through zoom-text-size.js (no <article> here); pages with a table of contents also get the
    # floating bar's "Jump to" button
    extra = '<script src="/main_js/zoom-text-size.js?v=1" defer></script>'
    if "toc-mobile" in old:
        extra += '<script src="/main_js/jump-to.js?v=2" defer></script>'
    tail = tail.replace('<script src="/main_js/info-bar-fit.js" defer></script>', '<script src="/main_js/info-bar-fit.js" defer></script>' + extra, 1)
    tcss = re.search(r"<style>(.*?)</style>", tpl, re.S).group(1)
    chrome = [txt for sel, txt in css_items(tcss) if CHROME_SEL.search(sel) or (sel.startswith("@media") and CHROME_SEL.search(txt))]
    css = style.group(1).rstrip() + "\n\n    /* site chrome (branded header, nav bar, floating bar, footer) */\n    " + "\n    ".join(chrome) + "\n"

    new = old[: style.start()] + "<style>" + css + "</style>" + old[style.end():]
    if cm and cm.group(1) in PAGE_BRANDS:  # own artwork: favicon + social preview image
        big = "https://mes.fm%s-big.png" % b["logo"][:-4]
        new = re.sub(r'<link rel="icon"[^>]*>', '<link rel="icon" href="https://mes.fm%s?v=1.0" type="image/png" />' % b["logo"], new, count=1)
        if "og:image" in new:
            new = re.sub(r'(<meta property="og:image" content=")[^"]*', lambda mm: mm.group(1) + big, new, count=1)
            new = re.sub(r'(<meta name="twitter:image" content=")[^"]*', lambda mm: mm.group(1) + big, new, count=1)
        else:
            new = new.replace("</head>", '  <meta property="og:image" content="%s">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:image" content="%s">\n</head>' % (big, big), 1)
    new = new.replace(block(new, '<div class="top-bar">'), top + "\n    " + nav + "\n    " + part, 1)
    new = new.replace('<div class="container">', compact + '\n\n  <div class="container">', 1)
    new, n = re.subn(r'(<hr>\s*)?<p class="site-footer-note">.*?</p>', lambda mm: footer, new, count=1, flags=re.S)
    if not n:  # no footer note (e.g. djw): put the footer right after the container, before the theme script
        anchor = "\n  </div>\n\n  <script>\n    const body = document.body;"
        if anchor not in new:
            return None, "footer anchor not found"
        new = new.replace(anchor, "\n  </div>\n\n  " + footer + "\n\n  <script>\n    const body = document.body;", 1)
    new = new.replace('<!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script>', "")
    new = new.replace("</body>", tail + "</body>", 1)
    return new, "ok (chrome swap)"


def social_tags(html, slug, big):
    """Open Graph / Twitter card tags for a branded hub: image plus type, url, title and description (taken from the
    page's own <title> and meta description) so shares and search snippets aren't image-only."""
    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1).strip()
    m = re.search(r'<meta name="description" content="([^"]*)"', html)
    desc = m.group(1) if m else ""
    tags = ['<meta property="og:type" content="website">', '<meta property="og:site_name" content="MES.fm">',
            '<meta property="og:url" content="https://mes.fm/%s">' % slug, '<meta property="og:title" content="%s">' % title]
    if desc:
        tags.append('<meta property="og:description" content="%s">' % desc)
    tags += ['<meta property="og:image" content="%s">' % big, '<meta property="og:image:width" content="1200">',
             '<meta property="og:image:height" content="630">', '<meta name="twitter:card" content="summary_large_image">',
             '<meta name="twitter:title" content="%s">' % title]
    if desc:
        tags.append('<meta name="twitter:description" content="%s">' % desc)
    tags.append('<meta name="twitter:image" content="%s">' % big)
    return "".join("  %s\n" % t for t in tags)


def hub_swap(old, template):
    """Hand-authored link hubs (conspiracy, mathiew, crypto): '<- MES Links' top bar + centred collapsible <h1> header +
    plain <footer>. Same chrome swap as chrome_swap(), inside a .container so the page's own wide card grid / link lists
    below keep their layout."""
    style = re.search(r"<style>(.*?)</style>", old, re.S)
    bl = re.search(r'<a class="back-link" href="([^"]*)">([^<]*)</a>', old)
    hdr = re.search(r'<header class="page-header">\s*(<h1.*?</h1>)\s*<button id="themeToggle".*?</button>\s*</header>', old, re.S)
    foot = re.search(r'<footer style="text-align: center;">.*?</footer>', old, re.S)
    if not (style and bl and hdr and foot and "const themeToggle" in old):
        return None, "no standard hub chrome"
    slug = None
    m = re.search(r'<link rel="canonical" href="https://mes\.fm/([^"/]*)', old)
    if m:
        slug = m.group(1)
    links = [(bl.group(1), re.sub(r"^&larr;\s*", "", bl.group(2)).strip())]
    _, partof = brand_and_partof(links)
    b = BRANDS.get("/" + (slug or ""), GENERIC)
    tpl = template
    compact = fill_brand(block(tpl, '<div id="compact-nav"'), b, partof)
    top = fill_brand(block(tpl, '<div class="top-bar">'), b, partof)
    if "articleFontScale" not in old:  # hubs that carry their own text-size script (conspiracy) keep the A-/A+ buttons
        top = re.sub(r'\s*<button id="textSize(Down|Up)"[^>]*>[^<]*</button>', "", top)
    nav = block(tpl, '<div class="info-bar-container"')
    part = block(tpl, '<div class="part-of">').replace("@@PARTOF@@", partof)
    footer = tpl[tpl.index('<div id="footer"'): tpl.index("getFullYear();</script>") + len("getFullYear();</script>")]
    tail = fill_brand(tpl[tpl.index('<script src="https://ajax.googleapis.com/ajax/libs/jquery'): tpl.index("</body>")], b, partof)
    tcss = re.search(r"<style>(.*?)</style>", tpl, re.S).group(1)
    chrome = [txt for sel, txt in css_items(tcss) if CHROME_SEL.search(sel) or (sel.startswith("@media") and CHROME_SEL.search(txt))]
    css = (style.group(1).rstrip() + "\n\n    /* site chrome (branded header, nav bar, floating bar, footer) */\n    " + "\n    ".join(chrome)
           + "\n    /* the hub pages predate the sans-serif mirror shell; match it */\n    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; }\n"
           + NAV_BAR_FIX + HUB_WIDTH_FIX)
    new = old[: style.start()] + "<style>" + css + "</style>" + old[style.end():]
    if "/" + (slug or "") in BRANDS:  # topic hub with its own artwork: favicon + social preview image
        big = "https://mes.fm/img/%s-logo-big.jpg" % slug
        new = re.sub(r'<link rel="icon"[^>]*>', '<link rel="icon" href="https://mes.fm%s?v=1.0" type="image/jpeg" />' % b["logo"], new, count=1)
        if "og:image" not in new:
            new = new.replace("</head>", social_tags(new, slug, big) + "</head>", 1)
    head_block = block(new, '<div class="top-bar">')
    new = new.replace(head_block, "", 1)
    new = re.sub(r'<header class="page-header">.*?</header>', lambda mm: compact + '\n\n  <div class="container">\n    ' + top + "\n    " + nav + "\n    " + part
                 + '\n    <header class="page-header">\n      ' + hdr.group(1) + "\n    </header>\n  </div>", new, count=1, flags=re.S)
    new = new.replace(foot.group(0), footer, 1)
    new = new.replace('<!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script>', "")
    new = new.replace("</body>", tail + "</body>", 1)
    return new, "ok (hub chrome)"


def convert(old, template):
    if 'id="info-bar"' in old:
        return None, "already converted"
    if 'class="back-link"' in old and '<header class="page-header">' in old:
        return hub_swap(old, template)
    links = site_links(old)
    m = links
    art = re.search(r"<article[^>]*>\n?(.*?)\n?\s*</article>", old, re.S)
    h1 = re.search(r"<h1>(.*?)</h1>", old, re.S)
    sub = re.search(r'<div class="page-subtitle">(.*?)</div>', old, re.S)
    style = re.search(r"<style>(.*?)</style>", old, re.S)
    if not (m and art and h1 and sub and style and "const themeToggle" in old) or old.count("<article") > 1:
        return chrome_swap(old, template)
    head_pre = old[: style.start()]
    head_post = old[style.end(): old.index("</head>")]
    body = old[old.index("<body"):]

    b, partof = brand_and_partof(links)

    # -- scripts: keep the page-specific ones (video players ...), the template supplies the standard ones
    custom = [s[2] for s in scripts(body)
              if not any(k in s[2] for k in STANDARD) and "track.js" not in s[2] and "comments.js" not in s[2]]
    has_video = 'id="videoEmbed"' in old
    tpl = template
    if not has_video:
        i = tpl.index("  <script>\n    // theater-mode")
        j = tpl.index("</script>", i) + len("</script>\n")
        tpl = tpl[:i] + tpl[j:]
    if "@@VIDEO_SCRIPTS@@" not in tpl:
        return None, "template lost @@VIDEO_SCRIPTS@@"
    tpl = tpl.replace("@@VIDEO_SCRIPTS@@", "\n\n".join("  " + c.strip() for c in custom))

    new_css_m = re.search(r"<style>(.*?)</style>", tpl, re.S)
    extras = extra_css(style.group(1), new_css_m.group(1))
    css = new_css_m.group(1).rstrip() + ("\n\n    /* page-specific rules carried over from the previous layout */\n    " + "\n    ".join(extras) + "\n" if extras else "\n")

    page = tpl
    # head: old head verbatim + template style + old head remainder
    page = page[page.index("<body"):] if False else page
    body_tpl = page[page.index("</head>"):]
    page = head_pre + "<style>" + css + "</style>" + head_post + body_tpl
    for k, v in {
        "@@BRAND_HREF@@": b["href"], "@@BRAND_LOGO@@": b["logo"], "@@BRAND_LOGO_ABS@@": "https://mes.fm" + b["logo"],
        "@@BRAND_TITLE@@": b["title"], "@@BRAND_TAG@@": b["tag"], "@@PARTOF@@": partof,
        "@@COMPACT_MATH_LINK@@": '<li><a href="/math" tabindex="-1">Math Tutorials</a></li>',
        "@@TITLE@@": h1.group(1), "@@SUBTITLE@@": sub.group(1), "@@ARTICLE@@": art.group(1),
    }.items():
        page = page.replace(k, v)
    # the template's <h1>@@TITLE@@</h1> is the only place the old h1 lands; SLUG/DESC/OGIMAGE tokens live in the
    # template head which we replaced, so none should remain
    if "@@" in page:
        return None, "unfilled token: " + re.search(r"@@\w+@@", page).group(0)
    return page, "ok%s%s" % (" +video" if has_video else "", " +%d css" % len(extras) if extras else "")


def main():
    template = TEMPLATE.read_text(encoding="utf-8")
    files = subprocess.run(["git", "ls-files", "mes.fm/*/index.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    done = skipped = 0
    for rel in files:
        p = ROOT / rel
        old = p.read_text(encoding="utf-8")
        if 'class="site-link"' not in old and 'class="back-link"' not in old:
            continue
        new, why = convert(old, template)
        name = rel.split("/")[1]
        if (ONLY and name not in ONLY) or name in NEVER:
            continue
        if new is None:
            if why != "already converted":
                skipped += 1
                print("SKIPPED %-45s %s" % (name, why))
            continue
        done += 1
        if VERBOSE:
            print("convert %-45s %s" % (name, why))
        if APPLY:
            p.write_text(new, encoding="utf-8")
    print("%d pages %s, %d skipped" % (done, "converted" if APPLY else "would be converted (dry run -- pass --apply)", skipped))


if __name__ == "__main__":
    main()
