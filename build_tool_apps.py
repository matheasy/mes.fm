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
names, when real art exists. `--only=slug,slug` rebuilds just those apps (the default rebuilds all). **Dry-runs by default; `--apply` writes.**
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
CAS_JS = ["/main_js/cas/cas-client.js?v=1", "/main_js/cas/cas-ui.js?v=1"]
APPS = {
    "earth-curvature-calculator": dict(title="MES Earth Curvature Calculator", page_title="Earth Curvature Calculator",
                                       tag="How much does the Earth curve over a distance?", accent="#0b6f6d", dark="#075250", tint="#e2f3f2",
                                       desc="Free Earth curvature calculator: enter a distance to see the curvature drop, your horizon distance and how much of a far-away object is hidden behind the curve, with optional atmospheric refraction.",
                                       js_v="3"),
    "gematria": dict(title="MES Gematria Calculator", page_title="Gematria Calculator",
                     tag="Ordinal, reduction, Sumerian and more.", accent="#3538ab", dark="#262a80", tint="#e8e9f8",
                     desc="Free gematria calculator: type a word or phrase and get its Ordinal, Reverse, Reduction, Standard and Sumerian gematria values with a letter-by-letter breakdown.",
                     js_v="2"),
    "impermanent-loss-calculator": dict(title="MES Impermanent Loss Calculator", page_title="Impermanent Loss Calculator",
                                        tag="Impermanent loss vs. simply holding.", accent="#c2500e", dark="#933b08", tint="#fbece1",
                                        desc="Free impermanent loss calculator for constant-product liquidity pools: see your loss versus holding, the pool token amounts, break-even fees and an impermanent loss chart for any price change.",
                                        js_v="2"),
    "unit-conversion": dict(title="MES Unit Conversion Calculator", page_title="Unit Conversion Calculator",
                            tag="Convert length, weight, temperature, speed and more.", accent="#00838f", dark="#005f68", tint="#dff2f4",
                            desc="Free unit converter with search: type “10 miles to km” or pick a category to convert length, mass, temperature, area, volume, speed, time, pressure, energy, power, data and more.",
                            js_v="2"),
    # a tools-hub tool, not a calculator (listed on tools.html), but built the same way
    "share": dict(title="MES Share Launcher", page_title="Share Launcher",
                  tag="Cross-post one video or link to 30+ sites.", accent="#5b3cc4", dark="#43299a", tint="#eeeafb",
                  desc="Free social media share launcher: paste your post once and get ready-to-paste text for X, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky, Reddit and 20+ more sites, with the link placed where each site wants it.",
                  js_v="10"),
    # site search: the page is only the results UI; the engine + index loader is /main_js/site-search.js (also the header
    # magnifier on every page), loaded first via pre_js. The index itself comes from build_search_index.py.
    "search": dict(title="MES Site Search", page_title="Site Search",
                   tag="Search every page on mes.fm.", accent="#0f766e", dark="#0b5a54", tint="#e2f3f1",
                   desc="Search all of mes.fm in one place: calculators, tools, math tutorials and Math Q/A livestreams, memes, quotes, puzzles, and the 9/11, Hutchison Effect, science and crypto posts, with section filters and shareable results.",
                   js_v="1", pre_js=["/main_js/site-search.js?v=1"]),
    # the calendar: lib.js (moon phases, seasons, holiday tables; pure functions) is prepended to app.js into one mes.fm/calendar/js/calendar.js
    # the general-purpose calculator: expression parser + keypad, plus multiply/divide, squares, fractions, factors, bases, list stats panels
    # (lib.js = pure maths, node-testable; app.js = UI). A calculator, so it gets the Home | Calculators | Tools info bar like unit-conversion.
    "calculator": dict(title="MES Calculator", page_title="Calculator",
                       tag="Multiply, divide, squares, roots and more.", accent="#c2255c", dark="#8f1a43", tint="#fbe6ee",
                       desc="Free online calculator: type any expression or use the keypad for multiplication, division, squares, square roots, powers, percentages, fractions, factorials, logarithms and trigonometry, plus exact big-number maths, prime factors, GCD, LCM and more.",
                       js_v="1"),
    # 2D graphing calculator (Desmos-style): lib.js = tokenizer/parser -> compiled JS functions + key-point numerics (node-testable), app.js = canvas UI.
    # Slug keeps the capital D as requested (Vercel is case-sensitive on static paths).
    "2d-graphing-calculator": dict(title="MES 2D Graphing Calculator", page_title="2D Graphing Calculator",
                                   tag="Plot functions, equations and inequalities.", accent="#2160d0", dark="#1646a0", tint="#e3ecfb",
                                   desc="Free online 2D graphing calculator: plot functions, equations, inequalities, parametric and polar curves, use sliders, and find zeros, maximums, minimums and intersections. Zoom, pan, share a link or save a PNG.",
                                   js_v="1"),
    # 3D graphing calculator: lib.js = the 2D page's whitelist compiler extended to x,y,z,u,v,t + meshing (grid surfaces with jump detection,
    # surface nets for implicit F(x,y,z)=G, curve pieces; node-testable), app.js = UI + three.js renderer (core module imported lazily from jsDelivr).
    "3d-graphing-calculator": dict(title="MES 3D Graphing Calculator", page_title="3D Graphing Calculator",
                                   tag="Plot surfaces in 3D and rotate them", accent="#6a3fc4", dark="#4c2a94", tint="#ece6fa",
                                   desc="Free online 3D graphing calculator: plot surfaces z = f(x, y), equations in x, y and z like spheres and tori, parametric curves and surfaces, with sliders. Rotate, zoom, colour by height, share a link or save a PNG.",
                                   js_v="1"),
    # days between two dates: own lib.js (DC, date maths) + the calendar's holiday engine (MESCal) via lib_from. Real page at the keyword URL; /days etc. redirect (mes.fm/vercel.json).
    "days-between-dates-calculator": dict(title="MES Days Between Dates Calculator", page_title="Days Between Dates Calculator",
                                          tag="Days, weeks, months, hours and business days between two dates.", accent="#2f7d32", dark="#1f5a23", tint="#e4f2e4",
                                          desc="Free days between dates calculator: count the days, weeks, months, years, hours, minutes and seconds between any two dates, with optional end-date inclusion, business days (custom weekends and holidays), time of day and shareable links.",
                                          js_v="1", lib_from=["calendar"]),
    # the three CAS pages: SymPy running in the browser (Pyodide in a Web Worker), shared engine + UI in mes.fm/main_js/cas/ (engine.py,
    # cas-worker.js, cas-client.js, cas-ui.js; loaded via pre_js) and the shared CSS tool_apps_src/_cas.css (css_extra, inlined so the
    # derived dark theme covers it). Each page's own app.js only builds requests and renders results. Tests: tool_apps_src/cas-engine-tests.py.
    "cas-calculator": dict(title="MES CAS Calculator", page_title="CAS Calculator",
                           tag="Solve, simplify, factor, limits and series.", accent="#334155", dark="#1e293b", tint="#e8ecf1",
                           desc="Free online CAS calculator (computer algebra system): solve equations, systems and inequalities with steps, find every real root of hard equations numerically, simplify, factor, expand, partial fractions, limits, series, sums and matrices.",
                           js_v="1", pre_js=CAS_JS, css_extra=["_cas.css"]),
    "derivative-calculator": dict(title="MES Derivative Calculator", page_title="Derivative Calculator",
                                  tag="Derivatives with every step explained.", accent="#c026d3", dark="#86198f", tint="#fae8ff",
                                  desc="Free derivative calculator with steps: differentiate any function using the power, product, quotient and chain rules, get higher-order, partial and implicit derivatives, evaluate at a point and plot f and f′.",
                                  js_v="1", pre_js=CAS_JS, css_extra=["_cas.css"]),
    "integral-calculator": dict(title="MES Integral Calculator", page_title="Integral Calculator",
                                tag="Antiderivatives and definite integrals with steps.", accent="#b45309", dark="#7c3a06", tint="#fdf0d9",
                                desc="Free integral calculator with steps: indefinite and definite integrals by substitution, integration by parts, partial fractions and trig rules, improper integrals with infinite bounds, numeric values when there is no closed form, and a plot of the area.",
                                js_v="1", pre_js=CAS_JS, css_extra=["_cas.css"]),
    # YouTube Money Calculator (rewritten 2026-10-02 from the 2016 jQuery page; youtubemoney must NEVER carry ads, so no_ads strips the
    # AdSense loader + Auto-ads guard from the shell and tags the sidebar no-ads; the old meme gallery lives on at /youtubemoney/youtubers).
    "youtubemoney": dict(title="YouTube Money Calculator", page_title="YouTube Money Calculator",
                         tag="How much do YouTubers make?", accent="#cc1f1f", dark="#9a1515", tint="#fbe9e9",
                         desc="Free YouTube money calculator: estimate how much a video or channel earns from views, by topic, Shorts or long-form and viewer location, or work out how many views you need to hit an income goal. Uses your own RPM if you know it.",
                         js_v="2", no_ads=True,
                         nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/how-much-do-youtubers-make'>Channels</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/youtubemoney/youtubers'>YouTubers</a></li>",
                         menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/how-much-do-youtubers-make\">How much do YouTubers make? (channels)</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/youtubemoney/youtubers\">YouTuber earnings archive</a></li>"),
    "calendar": dict(title="MES Calendar", page_title="Calendar",
                     tag="Moon phases, holidays and more, month by month.", accent="#2f5fd0", dark="#1f44a0", tint="#e6edfb",
                     desc="Free online calendar for any year: month and year views with today highlighted, new and full moon times, Canada, USA, UK, Australia and Vietnam holidays, Christian, Jewish and Islamic dates, seasons, eclipses, daylight-saving changes and a days-between calculator.",
                     js_v="1"),
    # VAT Calculator 2.0 (rewritten 2026-10-03 from the 2013 jQuery page): lib.js = exact-rational maths + the country rate table (node-testable:
    # tool_apps_src/vatcalculator-tests.js), app.js = UI. Keeps ads (not an ad-free page); old /vatcalculator/s/<id> links still resolve via /api/share?calc=vat.
    "vatcalculator": dict(title="VAT Calculator", page_title="VAT Calculator",
                          tag="Add or remove VAT, GST and sales tax.", accent="#7a6200", dark="#574600", tint="#f6f0d6",
                          desc="Free VAT calculator for 60+ countries: add VAT to a net price, remove it from a gross price, or find the VAT amount or rate. Itemised invoices grouped by rate, UK, EU, Canada, US, India and more, with up-to-date rates, exact rounding and shareable links.",
                          js_v="1"),
    # Speed Reader 2.0 (rewritten 2026-10-03 from the 2016 jQuery/Bootstrap page; keeps its red accent + Grok logos): lib.js = pure logic (tokenising, focus letter, chunking,
    # pacing, speech chunking, voice choice; node-testable: tool_apps_src/speedreader-tests.js), app.js = RSVP + Web Speech UI. Keeps ads (like the old page).
    "speedreader": dict(title="Speed Reader and Read Aloud", page_title="Speed Reader",
                        tag="Read faster, or have any text read aloud.", accent="#e52503", dark="#bf190d", tint="#fdeceb",
                        desc="Free online speed reader and read-aloud tool: flash text one word at a time with a red focus letter at 60 to 1500 words per minute, or listen with the spoken word highlighted. Paste text or drop a file; nothing leaves your browser.",
                        js_v="2", pre_js=["/main_js/voice-picker.js?v=1"]),
    # Copy Text: a clipboard shelf (notes on boards, click to copy, localStorage only). Normal-width tool with the "More like this" sidebar.
    "copy-text": dict(title="MES Copy Text", page_title="Copy Text",
                      tag="Save text once, copy it again anytime.", accent="#a16207", dark="#7a4a05", tint="#fbf1d9",
                      desc="Free online copy and paste notepad: save the texts you paste again and again (replies, signatures, addresses, links, hashtags, prompts) on boards and copy any of them with one click. Private, stored only in your browser, with backup and restore.",
                      js_v="1"),
    # Typing Test: WPM / accuracy / consistency test (time, words, passage, own text; 5 difficulty levels; weak-key practice; challenge links). lib.js = word lists, seeded text,
    # typing state machine + results maths (node-testable: tool_apps_src/typing-test-tests.js), app.js = UI. Medium-wide page, no sidebar. localStorage "mes-typingtest:v1".
    "typing-test": dict(title="MES Typing Test", page_title="Typing Test",
                        tag="How fast and accurate is your typing?", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                        desc="Free typing speed test: measure your words per minute (WPM), accuracy and consistency. Timed, word-count, passage and your-own-text tests, five difficulty levels, a keyboard map of your weak keys, personal bests and challenge links. No sign-up.",
                        js_v="4",
                        nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-transcribe'>Transcribe</a></li>",
                        menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-transcribe\">Transcription Typing Test</a></li>"),
    # Transcription Typing Test (mes.fm/typing-test-transcribe): the text is spoken (Web Speech API) and you type what you hear; scored against the spoken text. A sub-page of the Typing Test
    # brand (same logo / header; brand option). lib.js = passages, chunking, pacing, alignment + scoring (node-testable: tool_apps_src/typing-transcribe-tests.js) on top of typing-test's lib (lib_from);
    # the voice list uses the shared searchable picker main_js/voice-picker.js. Ranked boards "tr-<pace>-<length>" live in api/typing-leaderboard.js.
    "typing-test-transcribe": dict(title="MES Transcription Typing Test", page_title="Transcription Typing Test",
                        tag="Type what you hear: transcription practice.", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                        desc="Free transcription typing test: listen to text read aloud and type what you hear. Measures words per minute and accuracy against the spoken text, with adjustable pace, voice, phrase length, a wait-for-me mode, a word-by-word diff and daily, weekly and all-time leaderboards. Practice for transcription, court reporting, captioning and meeting minutes.",
                        js_v="1", lib_from=["typing-test"], pre_js=["/main_js/voice-picker.js?v=1"], tab=1,
                        brand=dict(slug="typing-test", title="MES Typing Test", tag="Type what you hear: transcription practice."),
                        nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-transcribe'>Transcribe</a></li>",
                        menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-transcribe\">Transcription Typing Test</a></li>"),
    # Solar System Today: where the Sun, planets, Moon and Halley's Comet are on any date. lib.js = Astronomy Engine wrapper (node-testable), view.js = canvas renderer
    # (shared with the mes.fm/moon widget through the extra_js bundle), app.js = UI. Astronomy Engine itself is the copy that /moon already ships (pre_js).
    "solar-system-today": dict(title="MES Solar System Today", page_title="Solar System Today",
                               tag="Where Earth, the Moon and planets are today.", accent="#3730a3", dark="#292477", tint="#e6e5f8",
                               desc="See where Earth, the Moon, the Sun and the planets are in the solar system today, or on any date: an interactive 3D-style map you can rotate and play forward or backward in time, with distances, light travel times, retrograde planets, eclipses and oppositions.",
                               js_v="4", pre_js=["/moon/js/astronomy.browser.min.js"], js_parts=["view.js"],
                               extra_js={"orrery-embed.js": ["lib.js", "view.js", "embed.js"]}),
    # Search Engines: type one search and open it in many engines (tabs, tiled windows or same tab); sets for censorship / SEO / privacy comparisons; own engines.
    # lib.js = engine table + URL builder (node-testable: tool_apps_src/search-engines-tests.js), app.js = UI. Wide page, no sidebar.
    "search-engines": dict(title="MES Search Engines", page_title="Search Engines",
                           tag="One search, every search engine.", accent="#c2410c", dark="#9a3412", tint="#fdeadf",
                           desc="Type your search once and open it in Google (.com, .ca, .co.uk and more), Bing, DuckDuckGo, Brave, Yandex and 60+ other search engines, AI assistants and video sites, in tabs or tiled windows. Compare results, check censorship and bias, and add your own engines.",
                           js_v="3"),
    # Mortgage Calculator 2.0 (rewritten 2026-10-03 from the 2013-2018 jQuery page): lib.js = exact-cents maths + the country rules tables (CMHC, minimum down payment, stress test, SDLT;
    # node-testable: tool_apps_src/mortgagecalculator-tests.js), app.js = UI. Keeps ads; old /mortgagecalculator/s/<id> links still resolve via /api/share?calc=mc.
    "mortgagecalculator": dict(title="Mortgage Calculator", page_title="Mortgage Calculator",
                               tag="Payments, affordability and amortization for the US, Canada and UK.", accent="#0e7490", dark="#0a5568", tint="#e0f2f7",
                               desc="Free mortgage calculator for the US, Canada, UK and Australia: monthly payment with taxes, insurance, PMI or CMHC premium, how much house you can afford, full amortization schedule and charts, extra payments, bi-weekly and accelerated payments, and side-by-side comparison.",
                               js_v="1"),
    # Site Index: a page inventory + template audit of the whole of mes.fm. Data = mes.fm/site-index/pages.json written by build_site_index.py (fetched lazily by app.js);
    # app.js = dashboard, filterable / sortable table, group-by, URL tree, template gallery, CSV / Markdown export; tests: tool_apps_src/site-index-tests.py. Wide page, no sidebar, ad-free (an internal audit page).
    "site-index": dict(title="MES Site Index", page_title="Site Index",
                       tag="Every page on mes.fm, by template.", accent="#1d6fa5", dark="#14507a", tint="#e3f0f8",
                       desc="Complete index of every page on mes.fm, classified by the template, shell and generator it uses, with feature flags and an audit of missing descriptions, share images, canonical tags and broken references. Search, filter, group, browse the URL tree and export to CSV.",
                       js_v="2", no_ads=True),
    # How much do YouTubers make?: leaderboard of big channels with ESTIMATED ad revenue (companion of /youtubemoney, ad-free like it). Data = mes.fm/how-much-do-youtubers-make/data/channels.json
    # (update_youtuber_snapshot.py), live refresh = mes.fm/api/youtuber-stats.js; lib.js = maths + a copy of the calculator's RPM tables (node-testable:
    # tool_apps_src/how-much-do-youtubers-make-tests.js), app.js = UI. Wide page, no sidebar.
    "how-much-do-youtubers-make": dict(title="How Much Do YouTubers Make?", page_title="How Much Do YouTubers Make?",
                                       tag="Estimated YouTube earnings of the biggest channels.", accent="#cc1f1f", dark="#9a1515", tint="#fbe9e9",
                                       desc="How much do YouTubers make? Estimated YouTube ad earnings per month and per year for 50+ of the biggest channels, from subscribers and recent views, by topic and viewer location. Sortable, searchable and clearly labelled estimates.",
                                       js_v="2", no_ads=True, tab=1,
                                       brand=dict(slug="youtubemoney", title="YouTube Money Calculator", tag="How much do YouTubers make?"),
                                       nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/how-much-do-youtubers-make'>Channels</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/youtubemoney/youtubers'>YouTubers</a></li>",
                                       menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/how-much-do-youtubers-make\">How much do YouTubers make? (channels)</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/youtubemoney/youtubers\">YouTuber earnings archive</a></li>"),
}
LEGACY_SEL = re.compile(r"\.outer-container|\.outer-page-content|\.side-bar|\.page-box|^img$|^table$")


def light_accent(hex_color, bg="#1a1a1a", target=6.0):
    """The accent lightened (same hue) until it reads on the dark-mode page background: used for links, outlines and filled buttons in dark mode."""
    import colorsys

    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    def lum(rgb):
        return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    bgc = tuple(int(bg.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    while ll < 0.95:
        rr, gg, bb = (round(v * 255) for v in colorsys.hls_to_rgb(hh, ll, ss))
        if (lum((rr, gg, bb)) + 0.05) / (lum(bgc) + 0.05) >= target:
            break
        ll += 0.01
    return "#%02x%02x%02x" % (rr, gg, bb)


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
    for extra in cfg.get("css_extra", []):    # shared CSS of a family of apps (e.g. _cas.css), before the app's own
        css += "\n" + (SRC / extra).read_text(encoding="utf-8")
    if (d / "app.css").exists():
        css += "\n" + (d / "app.css").read_text(encoding="utf-8")
    css = (css.replace("@@ACCENT_LIGHT@@", light_accent(cfg["accent"])).replace("@@ACCENT@@", cfg["accent"]).replace("@@ACCENT_DARK@@", cfg["dark"]).replace("@@TINT@@", cfg["tint"])
           .replace("var(--tint)", cfg["tint"]))
    content = (d / "content.html").read_text(encoding="utf-8")
    desc = cfg["desc"]
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebApplication", "name": cfg["title"],
                     "url": "https://mes.fm/" + slug, "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
                     "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": desc}, ensure_ascii=False)
    scripts = "".join('<script src="%s" defer></script>' % u for u in cfg.get("pre_js", []))
    scripts += '<script src="/%s/js/%s.js?v=%s" defer></script>' % (slug, slug, cfg["js_v"])
    page = tpl
    for k, v in (("@@TOOL_CSS@@", css), ("@@CONTENT@@", content.strip("\n")), ("@@LDJSON@@", ld)):
        page = page.replace(k, v)
    for k, v in {"@@SCRIPTS@@": scripts, "@@DESC@@": desc.replace('"', "&quot;"), "@@TITLE@@": cfg["title"], "@@SLUG@@": slug,
                 "@@TAGLINE@@": cfg["tag"], "@@PAGE_TITLE@@": cfg["page_title"], "@@PAGE_DESC@@": desc,
                 "@@ACCENT@@": cfg["accent"], "@@ACCENT_DARK@@": cfg["dark"]}.items():
        page = page.replace(k, v)
    # these are calculators: the info bar reads Home | Calculators | Tools (cross-link both ways, see add_cross_links.py)
    tools_li = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='https://mes.fm/tools.html'>Tools</a></li>"
    page = page.replace(tools_li, "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='https://mes.fm/calculators'>Calculators</a></li>" + tools_li.replace("tools.html", "tools"))
    if cfg.get("no_ads"):             # ad-free page: drop the deferred AdSense loader + the Auto-ads placement guard (they sit between the GTM block and </head>)
        a = page.find("<!-- ADSENSE-DEFERRED")
        b = page.find("</head>")
        assert a > 0 and b > a, "ad block markers not found in tool_page_template.html"
        page = page[:a] + page[b:]
        assert "adsbygoogle" not in page and "googlesyndication" not in page
    if cfg.get("nav_extra"):          # extra info-bar tab after Home, and an entry in the Site Navigation menu
        home = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/%s'>Home</a></li>" % slug
        assert home in page
        page = page.replace(home, home + cfg["nav_extra"], 1)
        nav_home = re.search(r'<li class="navbar__item"><a class="navbar__link navbar__link--first" href="/%s">Home</a></li>' % slug, page)
        assert nav_home
        page = page[:nav_home.end()] + cfg["menu_extra"] + page[nav_home.end():]
    if cfg.get("brand"):              # a sub-page of another site (e.g. the channels page of YouTube Money): the other site's logo, name, tagline and Home link
        b = cfg["brand"]
        for pat in ("/%s/img/logo" % slug,):                      # favicon, header logo, og:image / twitter:image
            page = page.replace(pat, "/%s/img/logo" % b["slug"])
        page = page.replace('<p class="calculator-title">%s</p>' % cfg["title"], '<p class="calculator-title">%s</p>' % b["title"], 1)
        page = page.replace('<p class="tag-line">%s</p>' % cfg["tag"], '<p class="tag-line">%s</p>' % b["tag"], 1)
        page = page.replace("<a class=\"calculator-title-link\" href='/%s'>" % slug, "<a class=\"calculator-title-link\" href='/%s'>" % b["slug"], 1)
        page = page.replace("<a class=\"logo-image-container\" href='/%s'>" % slug, "<a class=\"logo-image-container\" href='/%s'>" % b["slug"], 1)
        page = page.replace("href='/%s'>Home</a>" % slug, "href='/%s'>Home</a>" % b["slug"], 1)
        page = page.replace('class="navbar__link navbar__link--first" href="/%s">Home</a>' % slug, 'class="navbar__link navbar__link--first" href="/%s">Home</a>' % b["slug"], 1)
        page = page.replace("current_tab:0", "current_tab:%d" % cfg.get("tab", 0), 1)
    js_dir = SITE / slug / "js"
    js_dir.mkdir(parents=True, exist_ok=True)
    js = (d / "app.js").read_text(encoding="utf-8")
    for part in reversed(cfg.get("js_parts", [])):   # more of the app's own source files (e.g. a canvas renderer), between lib.js and app.js
        js = (d / part).read_text(encoding="utf-8") + "\n" + js
    if (d / "lib.js").exists():       # optional shared/pure code (e.g. calendar maths), prepended so one file is served
        js = (d / "lib.js").read_text(encoding="utf-8") + "\n" + js
    for other in reversed(cfg.get("lib_from", [])):   # another app's lib.js (e.g. the calendar's holiday engine), prepended before our own
        js = (SRC / other / "lib.js").read_text(encoding="utf-8") + "\n" + js
    for out_name, parts in cfg.get("extra_js", {}).items():   # additional bundles served next to the page script (e.g. the mes.fm/moon widget)
        bundle = "\n".join((d / x).read_text(encoding="utf-8") for x in parts)
        if APPLY:
            (js_dir / out_name).write_text(bundle, encoding="utf-8")
    return page, js, js_dir / (slug + ".js")


def main():
    tpl = TEMPLATE.read_text(encoding="utf-8")
    only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)   # --only=slug,slug rebuilds just those apps
    for slug, cfg in APPS.items():
        if only and slug not in only:
            continue
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
