#!/usr/bin/env python3
"""Write mes.fm/all.html, mes.fm/games.html and mes.fm/simulators.html, and put the apps strip on the hub pages.

  /all         every calculator, tool, game, simulator, mobile app and browser extension on one page
               (chips: Calculators, Tools, Games, Simulators, Mobile Apps, Extensions; search box, List / Compact / Table views)
  /games       the "Games & Chance" (+ "Kids & Toddlers") cards of tools.html, grouped Board & arcade / Sports / Chance / Kids
  /simulators  the "Simulations" cards of tools.html + the *-simulator cards of calculators.html, grouped by subject

Nothing is hand-listed: the cards are read from the hub pages themselves, so a card added to calculators.html /
tools.html (organize_hub_cards.py), mobile-apps.html or the /browser page shows up here on the next run.
  - calculators.html, tools.html: every <section class="hub-cat"> (not the thin Popular / Newest rows), cards copied as is
  - mobile-apps.html: each .app-card (icon, h2, first paragraph, App Store link; card opens the App Store)
  - mes.fm/browser/index.html (built page): each .br-tile
An item listed in two places is shown once on /all: Games / Simulators win over Calculators / Tools.
Simulators / games are sub-grouped by slug with SIM_GROUPS / GAME_GROUPS below; an unknown slug lands in the last group.

The page shell is a copy of tools.html (header, nav, width switch, hub-filter.js, footer, comments), so the new pages
look and behave like the card hubs. The strip (main_js/apps-nav.js, NAV_HTML) is (re)written right after
<div id="main-content"> on the three new pages and on calculators.html, tools.html and mobile-apps.html; the /browser
page carries it in tool_apps_src/browser/content.html.

Idempotent; dry-runs by default (prints counts), --apply writes. The repo pre-commit hook runs it with --apply
whenever a commit touches one of the source pages.
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv

NAV_HTML = ('<!-- APPS-NAV --><nav class="mes-anav" data-cur="%s" aria-label="MES apps"><a href="/calculators">Calculators</a> '
            '<a href="/tools">Tools</a> <a href="/games">Games</a> <a href="/simulators">Simulators</a> '
            '<a href="/mobile-apps">Mobile Apps</a> <a href="/browser">Extensions</a> <a href="/all">All apps</a></nav>'
            '<script src="/main_js/apps-nav.js"></script><!-- /APPS-NAV -->')
NAV_RE = re.compile(r'<!-- APPS-NAV -->.*?<!-- /APPS-NAV -->', re.S)

GAME_GROUPS = [
    ("board", "Board, card &amp; arcade", None),   # default
    ("sports", "Sports", lambda s: s.endswith("-picks") or s in ("march-madness", "free-kick", "billiards")),
    ("chance", "Chance &amp; random", lambda s: s in ("random-number-generator", "dice-roller", "click-test")),
    ("kids", "Kids &amp; toddlers", lambda s: s.startswith("kids")),
]
SIM_GROUPS = [
    ("space", "Space, time &amp; relativity", {"black-hole-simulator", "orbit-simulator", "space-shuttle-simulator", "redshift-simulator",
        "time-dilation", "metric-tensor", "faster-than-light-shadow-simulator", "michelson-morley-experiment", "atomic-clock-simulator",
        "fountain-clock", "solar-system-today"}),
    ("fields", "Light, fields &amp; quantum", {"quantum", "quantum-computing", "quantum-cryptography", "spin-simulator", "spin-half",
        "negative-index", "hologram", "light-in-a-medium", "photoelectric-effect-simulator", "maxwell-vortices", "spin-wave-field",
        "quaternions", "electromagnetic-fields-simulator", "magnetic-isopotentials", "hutchison-effect-simulator", "grounding-rod-simulator"}),
    ("motion", "Motion, materials &amp; building", {"fluid-simulator", "3d-fluid-simulator", "double-pendulum", "gyroscope-simulator",
        "crash-physics", "bridge-builder", "car-sandbox", "brick-builder", "gta-stunt-jump-simulator", "tensile-test-simulator",
        "ductile-fracture-simulator", "luders-bands"}),
    ("life", "Body, brain &amp; AI", {"heart-simulator", "neuron-simulator", "gnm", "neural-network-playground", "letter-recognition",
        "llm-simulator"}),
    ("math", "Fractals &amp; math", {"mandelbrot", "julia-set-explorer", "buddhabrot"}),
    ("more", "More simulations", None),   # default
]

PAGES = {
    "all": dict(
        title="All Apps", doc="All Apps: Calculators, Tools, Games, Simulators | Math Easy Solutions",
        desc="Every free MES calculator, tool, game, simulator, mobile app and browser extension on one page. Search them all or pick a group.",
        noun="all MES apps"),
    "games": dict(
        title="Games", doc="Free Online Games | Math Easy Solutions",
        desc="Free online games from MES: chess, backgammon, billiards, poker, Connect Four, minesweeper, falling blocks, free kicks, sports picks and more. No sign-up.",
        noun="games"),
    "simulators": dict(
        title="Simulators", doc="Free Physics &amp; Science Simulators | Math Easy Solutions",
        desc="Free physics and science simulators that run in your browser: black holes, orbits, fluids, quantum computers, the heart, neurons, fractals and more.",
        noun="simulators"),
}

SEC_RE = re.compile(r'<section class="hub-cat" data-cat="([^"]+)" id="[^"]*">\s*<h2 class="hub-cat__title">(.*?)</h2>(.*?)</section>', re.S)
TD_RE = re.compile(r'[ \t]*<td class="calc-container[^"]*"><a class="calc-link" href="([^"]*)">.*?</td>\n?', re.S)


def slug_of(href):
    return re.sub(r"^https://mes\.fm/", "", href).strip("/").replace("/index.html", "")


def hub_sections(page):
    text = (SITE / page).read_text(encoding="utf-8")
    out = []
    for m in SEC_RE.finditer(text):
        tds = [(slug_of(t.group(1)), t.group(0).strip("\n")) for t in TD_RE.finditer(m.group(3))]
        out.append((m.group(1), m.group(2).strip(), tds))
    return out


def clean(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))).strip()


def make_td(href, img, title, desc, alt, ext=False):
    tgt = ' target="_blank" rel="noopener"' if ext else ""
    return ('\t\t\t\t<td class="calc-container"><a class="calc-link" href="%s"%s>\n'
            '\t\t\t\t\t<div class="calc__img-container"><img class="calc__img" src="%s" alt="%s" width="88" height="88" loading="lazy"></div>\n'
            '\t\t\t\t\t<div class="calc__text">\n\t\t\t\t\t\t<span class="calc__text--title">%s</span>\n'
            '\t\t\t\t\t\t<span class="calc__text--desc">%s</span>\n\t\t\t\t\t</div></a>\n\t\t        </td>'
            % (html.escape(href, True), tgt, html.escape(img, True), html.escape(alt, True), html.escape(title), html.escape(desc)))


def mobile_apps():
    text = (SITE / "mobile-apps.html").read_text(encoding="utf-8")
    items = []
    for card in text.split('<div class="app-card"')[1:]:
        h2 = re.search(r"<h2[^>]*>(.*?)</h2>", card, re.S)
        img = re.search(r'<img[^>]*\bsrc="([^"]+)"', card)
        p = re.search(r"<p[^>]*>(.*?)</p>", card, re.S)
        store = re.search(r'href="(https://apps\.apple\.com[^"]*|https://play\.google\.com[^"]*)"', card)
        if not (h2 and img):
            continue
        title = clean(re.sub(r"<span[^>]*>.*?</span>", "", h2.group(1), flags=re.S))
        href = store.group(1) if store else "/mobile-apps"
        slug = "app:" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        items.append((slug, make_td(href, img.group(1), title + " (app)", clean(p.group(1)) if p else "", title + " app icon", ext=bool(store))))
    return items


def extensions():
    text = (SITE / "browser" / "index.html").read_text(encoding="utf-8")
    items = []
    for m in re.finditer(r'<a class="br-tile" href="([^"]+)"><img class="br-img" src="([^"]+)" alt="([^"]*)"[^>]*><span class="br-t">(.*?)</span><span class="br-d">(.*?)</span></a>', text, re.S):
        href, img, alt, t, d = m.groups()
        items.append(("ext:" + slug_of(href), make_td(href, img, clean(t) + " (extension)", clean(d), html.unescape(alt))))
    return items


def rows(tds):
    out = []
    for i in range(0, len(tds), 2):
        cells = []
        for j, td in enumerate(tds[i:i + 2]):
            td = re.sub(r'class="calc-container[^"]*"', 'class="calc-container%s"' % (" calc-container--last" if j == 1 else ""), td.strip("\n"), count=1)
            cells.append(td + "\n")
        out.append('\t\t\t<tr class="calc-row">\n' + "".join(cells) + "\t\t\t</tr>\n")
    return "".join(out)


def region(noun, chips, sections, newest=False):
    """chips: [(cid, label, count)], sections: [(cid, heading, [td...])]"""
    total = sum(len(t) for _, _, t in sections)
    chip_html = '<button type="button" data-c="all" aria-pressed="true">All (%d)</button>' % total
    chip_html += "".join('<button type="button" data-c="%s" aria-pressed="false">%s (%d)</button>' % c for c in chips if c[2])
    out = ['\t\t<div class="hub-filter">\n\t\t\t<input type="search" id="hub-search" placeholder="Search %s&hellip;" aria-label="Search %s" autocomplete="off">\n'
           '\t\t\t<div class="hub-chips" id="hub-chips">%s</div>\n\t\t</div>\n' % (noun, noun, chip_html)]
    if newest:
        out.append('\t\t<section class="hub-cat hub-cat--mini hub-cat--newest" data-cat="newest" id="newest">\n\t\t\t<h2 class="hub-cat__title">Newest</h2>\n'
                   '\t\t\t<div class="mini-row mini-fit" data-newest="latest" data-count="8"></div>\n\t\t</section>\n')
    for n, (cid, head, tds) in enumerate(sections):
        if not tds:
            continue
        out.append('\t\t<section class="hub-cat" data-cat="%s" id="%s-%d">\n\t\t\t<h2 class="hub-cat__title">%s</h2>\n\t\t<table class="tbl tbl--stack">\n%s\t\t</table>\n\t\t</section>\n'
                   % (cid, cid, n, head, rows(tds)))
    out.append('\t\t<p id="hub-empty" hidden>Nothing matches that search &mdash; try a shorter word.</p>\n')
    return "".join(out)


def by_title(tds):
    def t(td):
        m = re.search(r'calc__text--title">(.*?)</span>', td, re.S)
        return clean(m.group(1)).lower() if m else ""
    return sorted(tds, key=t)


def shell(slug, cfg, body):
    text = (SITE / "tools.html").read_text(encoding="utf-8")
    a = text.index('<div class="hub-filter">')
    while text[a - 1] in " \t":
        a -= 1
    b = text.index('<p id="hub-empty"')
    b = text.index("</p>", b) + 4
    while text[b:b + 1] == "\n":
        b += 1
    text = text[:a] + body + text[b:]
    url = "https://mes.fm/" + slug
    t, d = cfg["title"], cfg["desc"]
    text = text.replace('href="https://mes.fm/tools" />', 'href="%s" />' % url, 1)
    text = re.sub(r"<title>.*?</title>", "<title>%s</title>" % cfg["doc"], text, 1)
    text = text.replace('<meta property="og:url" content="https://mes.fm/tools" />', '<meta property="og:url" content="%s" />' % url)
    text = text.replace('<meta property="og:title" content="Tools" />', '<meta property="og:title" content="%s" />' % t)
    text = re.sub(r'(<meta (?:property="og:description"|name="description"|name="twitter:description") content=")[^"]*"', lambda m: m.group(1) + d + '"', text)
    text = text.replace('<meta name="twitter:title" content="Tools">', '<meta name="twitter:title" content="%s">' % t)
    text = text.replace('<meta name="twitter:image:alt" content="Tools">', '<meta name="twitter:image:alt" content="%s">' % t)
    text = text.replace('<a href="/tools" tabindex="-1"><img class="compact-nav-logo"', '<a href="/%s" tabindex="-1"><img class="compact-nav-logo"' % slug)
    text = text.replace('<a class="compact-nav-title" href="/tools" tabindex="-1">Tools</a>', '<a class="compact-nav-title" href="/%s" tabindex="-1">%s</a>' % (slug, t))
    text = text.replace('<h1 class="page-title">Tools</h1>', '<h1 class="page-title">%s</h1>' % t, 1)
    text = re.sub(r'(<p class="page-description">).*?(</p>)', lambda m: m.group(1) + d + m.group(2), text, 1)
    text = re.sub(r"current_tab:\d+,", "current_tab:99,", text)
    text = re.sub(r"info_bar_tab:\d+", "info_bar_tab:99", text)
    text = re.sub(r'<link rel="alternate" type="application/rss\+xml" title="New MES Calculators &amp; Tools"[^>]*>\n?', "", text)
    return text


def put_nav(text, cur):
    nav = NAV_HTML % cur
    if NAV_RE.search(text):
        return NAV_RE.sub(lambda m: nav, text, 1)
    i = text.index('<div id="main-content">') + len('<div id="main-content">')
    return text[:i] + "\n\t\t" + nav + text[i:]


def main():
    calc = hub_sections("calculators.html")
    tool = hub_sections("tools.html")
    apps, exts = mobile_apps(), extensions()

    games, sims, taken = {g[0]: [] for g in GAME_GROUPS}, {g[0]: [] for g in SIM_GROUPS}, set()
    for cid, _, tds in tool:
        if cid in ("games", "kids"):
            for s, td in tds:
                if s in taken:
                    continue
                g = next((k for k, _, f in GAME_GROUPS if f and f(s)), "board")
                games[g].append(td); taken.add(s)
    for cid, _, tds in tool + calc:
        if cid == "sim" or cid == "physics":
            for s, td in tds:
                if s in taken or (cid == "physics" and not s.endswith("-simulator") and s not in ("luders-bands",)):
                    continue
                g = next((k for k, _, st in SIM_GROUPS if st and s in st), "more")
                sims[g].append(td); taken.add(s)

    taken.update(s[4:] for s, _ in exts if "#" not in s)   # extension-only pages: shown once, under Extensions (ai#browser etc. keep their tool card)
    all_secs = []
    for label, src, cid in (("Calculators", calc, "calc"), ("Tools", tool, "tools")):
        for c, head, tds in src:
            left = [td for s, td in tds if s not in taken]
            taken.update(s for s, _ in tds)
            all_secs.append((cid, "%s &middot; %s" % (label, head), left))
    all_secs += [("games", "Games &middot; %s" % h, by_title(games[k])) for k, h, _ in GAME_GROUPS]
    all_secs += [("sim", "Simulators &middot; %s" % h, by_title(sims[k])) for k, h, _ in SIM_GROUPS]
    all_secs += [("apps", "Mobile apps (iPhone &amp; Android)", [td for _, td in apps]),
                 ("ext", "Browser extensions (Chrome, Brave, Edge)", [td for _, td in exts])]
    count = lambda c: sum(len(t) for cc, _, t in all_secs if cc == c)
    all_chips = [(c, l, count(c)) for c, l in (("calc", "Calculators"), ("tools", "Tools"), ("games", "Games"), ("sim", "Simulators"),
                                                ("apps", "Mobile Apps"), ("ext", "Extensions"))]

    game_secs = [(k, h, by_title(games[k])) for k, h, _ in GAME_GROUPS]
    sim_secs = [(k, h, by_title(sims[k])) for k, h, _ in SIM_GROUPS]

    outs = {
        "all": region(PAGES["all"]["noun"], all_chips, all_secs, newest=True),
        "games": region("games", [(k, h, len(t)) for k, h, t in game_secs], game_secs),
        "simulators": region("simulators", [(k, h, len(t)) for k, h, t in sim_secs], sim_secs),
    }
    changed = 0
    for slug, body in outs.items():
        new = put_nav(shell(slug, PAGES[slug], body), slug)
        p = SITE / (slug + ".html")
        old = p.read_text(encoding="utf-8") if p.exists() else ""
        n = body.count('<td class="calc-container')
        print("%-12s %3d cards %s" % (slug, n, "unchanged" if old == new else "CHANGED"))
        if old != new:
            changed += 1
            if APPLY:
                p.write_text(new, encoding="utf-8")
    for page, cur in (("calculators.html", "calculators"), ("tools.html", "tools"), ("mobile-apps.html", "apps")):
        p = SITE / page
        old = p.read_text(encoding="utf-8")
        new = put_nav(old, cur)
        if old != new:
            changed += 1
            print("%-17s strip %s" % (page, "added" if "APPS-NAV" not in old else "updated"))
            if APPLY:
                p.write_text(new, encoding="utf-8")
    left = [s for s in sims["more"]]
    if left:
        print("note: %d simulator(s) in 'More simulations' -- add their slugs to SIM_GROUPS" % len(left))
    if changed and not APPLY:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
