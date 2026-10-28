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
CAS_JS = ["/main_js/cas/cas-client.js?v=2", "/main_js/cas/cas-ui.js?v=2"]
# the browser-extension pages (download pages of our extensions + the /browser hub) carry an "Extensions" tab right after Tools in the info bar (the burger menu has Browser Extensions on every page)
EXT_TAB = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/browser'>Extensions</a></li>"

# simulator pages whose boxes (.fl-wrap, .lm-wrap, ...) get the shared View bar from main_js/stage-ctl.js
STAGE_CTL = {"julia-set-explorer", "fluid-simulator", "light-in-a-medium", "black-hole-simulator", "mandelbrot", "buddhabrot", "time-dilation", "metric-tensor", "orbit-simulator", "double-pendulum", "electromagnetic-fields-simulator", "photoelectric-effect-simulator", "solar-system-today", "atomic-clock-simulator",
             "michelson-morley-experiment", "faster-than-light-shadow-simulator", "fountain-clock", "magnetic-isopotentials", "hutchison-effect-simulator"}

# PDF family nav (2026-10-16): Home = the PDF Tools hub, then the editor and the six tools, ahead of Calculators / Tools
PDF_NAV_INFO = '<li class="info-bar__item"><a class="info-bar__item__text" href=\'/pdf\'>Editor</a></li><li class="info-bar__item"><a class="info-bar__item__text" href=\'/merge-pdf\'>Merge</a></li><li class="info-bar__item"><a class="info-bar__item__text" href=\'/split-pdf\'>Split</a></li><li class="info-bar__item"><a class="info-bar__item__text" href=\'/organize-pdf\'>Organize</a></li><li class="info-bar__item"><a class="info-bar__item__text" href=\'/jpg-to-pdf\'>Images to PDF</a></li><li class="info-bar__item"><a class="info-bar__item__text" href=\'/pdf-to-jpg\'>PDF to images</a></li><li class="info-bar__item"><a class="info-bar__item__text" href=\'/compress-pdf\'>Compress</a></li>'
PDF_NAV_MENU = '<li class="navbar__item"><a class="navbar__link" href="/pdf">Editor</a></li><li class="navbar__item"><a class="navbar__link" href="/merge-pdf">Merge</a></li><li class="navbar__item"><a class="navbar__link" href="/split-pdf">Split</a></li><li class="navbar__item"><a class="navbar__link" href="/organize-pdf">Organize</a></li><li class="navbar__item"><a class="navbar__link" href="/jpg-to-pdf">Images to PDF</a></li><li class="navbar__item"><a class="navbar__link" href="/pdf-to-jpg">PDF to images</a></li><li class="navbar__item"><a class="navbar__link" href="/compress-pdf">Compress</a></li>'

# MES Mechanics of Materials family nav (2026-10-20): Home = /materials (all tools as tabs), then the three single-topic pages and the materials table
TR_BRAND = dict(slug="translate", title="MES Translate", tag="Translate text, photos and PDFs, on your device when it can.")
TR_NAV_INFO = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/image-to-text'>Image to Text</a></li>"
TR_NAV_MENU = "<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/image-to-text\">Image to Text (OCR)</a></li>"
MAT_BRAND = dict(slug="materials", title="MES Mechanics of Materials", tag="Stress, strain, shear and torsion, with the pictures.")
CI_NAV_INFO = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/compound-interest-explained'>Explained</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/loan-calculator'>Loan</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/mortgagecalculator'>Mortgage</a></li>"
CI_NAV_MENU = "<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/compound-interest-explained\">Compound Interest Explained</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/loan-calculator\">Loan Calculator</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/mortgagecalculator\">Mortgage Calculator</a></li>"
MAT_NAV_INFO = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/youngs-modulus-calculator'>Young's Modulus</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/tensile-test-simulator'>Tensile Test</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/shear-stress-calculator'>Shear &amp; Torsion</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/materials?tab=table'>Materials Table</a></li>"
MAT_NAV_MENU = '<li class="navbar__item"><a class="navbar__link" href="/youngs-modulus-calculator">Young\'s Modulus Calculator</a></li><li class="navbar__item"><a class="navbar__link" href="/tensile-test-simulator">Tensile Test Simulator</a></li><li class="navbar__item"><a class="navbar__link" href="/shear-stress-calculator">Shear &amp; Torsion Calculator</a></li><li class="navbar__item"><a class="navbar__link" href="/materials?tab=table">Materials Table</a></li>'

# Standard | Wide | Theatre without a sidebar (the private /ads and /search-console dashboards): the hub pages' head snippet
# (Wide by default, same saved "pageMode"), main_js/hub-theatre.js builds the switch when the page has data-page-modes="3".
PAGE3_HEAD = ('<!-- HUB-THEATRE-HEAD --><link rel="stylesheet" href="/main_js/hub-theatre.css?v=1"><script>try{var m=localStorage.getItem("pageMode")||"wide",'
              'c=document.documentElement.classList;if(m==="theatre")c.add("page-theatre");if(m!=="std")c.add("page-wide")}catch(e){}</script><!-- /HUB-THEATRE-HEAD -->')
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
                       js_v="4", pre_js=["/main_js/mes-ask.js?v=1"]),
    # 2D graphing calculator (Desmos-style): lib.js = tokenizer/parser -> compiled JS functions + key-point numerics (node-testable), app.js = canvas UI.
    # Slug keeps the capital D as requested (Vercel is case-sensitive on static paths).
    "2d-graphing-calculator": dict(title="MES 2D Graphing Calculator", page_title="2D Graphing Calculator",
                                   tag="Plot functions, equations and inequalities.", accent="#2160d0", dark="#1646a0", tint="#e3ecfb",
                                   desc="Free online 2D graphing calculator: plot functions, equations, inequalities, parametric and polar curves, use sliders, and find zeros, maximums, minimums and intersections. Zoom, pan, share a link or save a PNG.",
                                   js_v="2", pre_js=["/main_js/mes-ask.js?v=1"]),
    # 3D graphing calculator: lib.js = the 2D page's whitelist compiler extended to x,y,z,u,v,t + meshing (grid surfaces with jump detection,
    # surface nets for implicit F(x,y,z)=G, curve pieces; node-testable), app.js = UI + three.js renderer (core module imported lazily from jsDelivr).
    "3d-graphing-calculator": dict(title="MES 3D Graphing Calculator", page_title="3D Graphing Calculator",
                                   tag="Plot surfaces in 3D and rotate them", accent="#6a3fc4", dark="#4c2a94", tint="#ece6fa",
                                   desc="Free online 3D graphing calculator: plot surfaces z = f(x, y), equations in x, y and z like spheres and tori, parametric curves and surfaces, with sliders. Rotate, zoom, colour by height, share a link or save a PNG.",
                                   js_v="2", pre_js=["/main_js/mes-ask.js?v=1"]),
    # days between two dates: own lib.js (DC, date maths) + the calendar's holiday engine (MESCal) via lib_from. Real page at the keyword URL; /days etc. redirect (mes.fm/vercel.json).
    # Ovulation / period / due date: one source (tool_apps_src/ovulation-calculator: lib.js = MESCycle, app.js, app.css, content.html with {{VIEWS}} / {{SEO}}),
    # three pages; tests: node tool_apps_src/ovulation-calculator-tests.js. Dates live only in localStorage mes-cycle:v1 (shared by the three pages).
    "ovulation-calculator": dict(title="MES Ovulation Calculator", page_title="Ovulation Calculator: Fertile Window and Ovulation Date",
                                 tag="Find your fertile window, ovulation day and next period.", accent="#0d9488", dark="#0a6f66", tint="#dcf3ef",
                                 desc="Free ovulation calculator: enter your last period and cycle length to find your fertile window, ovulation day, next period and the best days to conceive. Works for any cycle length, irregular cycles and LH tests. Private, adds to your phone calendar.",
                                 js_v="3", vars={"VIEWS": "ov", "SEO": "@seo/ovulation-calculator.html"}),
    "period-calculator": dict(title="MES Period Calculator", page_title="Period Calculator and Cycle Tracker",
                              tag="Predict your next period and track your cycle.", accent="#be123c", dark="#8c0d2d", tint="#fbe3e9", src="ovulation-calculator", js_path="ovulation-calculator/js/ovulation-calculator.js",
                              desc="Free period calculator and cycle tracker: see when your next period is due, the next 12 months, your fertile days, and log your cycles to get your own average and how regular you are. Private, no sign-up, adds to your phone calendar.",
                              js_v="3", vars={"VIEWS": "per", "SEO": "@seo/period-calculator.html"}),
    "due-date-calculator": dict(title="MES Pregnancy Due Date Calculator", page_title="Pregnancy Due Date Calculator",
                                tag="Due date, weeks pregnant and key dates.", accent="#6d5bd0", dark="#4d3fa6", tint="#e8e4fa", src="ovulation-calculator", js_path="ovulation-calculator/js/ovulation-calculator.js",
                                desc="Free pregnancy due date calculator: from your last period, conception date, IVF transfer or ultrasound. See how many weeks pregnant you are, your trimester, days to go, key dates and a week-by-week calendar. Private, adds to your phone calendar.",
                                js_v="3", vars={"VIEWS": "due", "SEO": "@seo/due-date-calculator.html"}),
    "pregnancy-test-calculator": dict(title="MES When to Take a Pregnancy Test", page_title="When to Take a Pregnancy Test: Test Date Calculator",
                              tag="Find the best day to take a pregnancy test.", accent="#0284c7", dark="#075985", tint="#dcefff", src="ovulation-calculator", js_path="ovulation-calculator/js/ovulation-calculator.js",
                              desc="Free pregnancy test calculator: find out when to take a pregnancy test from your last period or ovulation date. See implantation days, the earliest sensitive test day, the day a test is dependable and your days past ovulation (DPO). Private, adds to your phone calendar.",
                              js_v="3", vars={"VIEWS": "dpo", "SEO": "@seo/pregnancy-test-calculator.html"}),
    "conception-date-calculator": dict(title="MES Conception Date Calculator", page_title="Conception Date Calculator: When Did I Conceive?",
                              tag="Work out when you conceived.", accent="#ea580c", dark="#b83f06", tint="#ffe8d9", src="ovulation-calculator", js_path="ovulation-calculator/js/ovulation-calculator.js",
                              desc="Free conception date calculator: find your most likely conception date from your due date, last period, IVF transfer or ultrasound, with the days sex could have led to the pregnancy and your estimated ovulation date. Private and quick.",
                              js_v="3", vars={"VIEWS": "conc", "SEO": "@seo/conception-date-calculator.html"}),
    "weeks-pregnant-calculator": dict(title="MES How Many Weeks Pregnant Am I? Week-by-Week Calculator", page_title="How Many Weeks Pregnant Am I? Week-by-Week Calculator",
                              tag="Weeks pregnant today and week by week.", accent="#4d7c0f", dark="#365a0a", tint="#e6f2d4", src="ovulation-calculator", js_path="ovulation-calculator/js/ovulation-calculator.js",
                              desc="Free weeks pregnant calculator: see how many weeks and days pregnant you are today, your trimester, due date and days to go, plus a week-by-week table with start dates and baby size. From your last period, conception, IVF or ultrasound. Private.",
                              js_v="3", vars={"VIEWS": "weeks", "SEO": "@seo/weeks-pregnant-calculator.html"}),
    "contraction-timer": dict(title="MES Contraction Timer", page_title="Contraction Timer for Labour (5-1-1 Rule)",
                              tag="One big button to time contractions.", accent="#c026d3", dark="#8f1b9f", tint="#f7e1fa",
                              desc="Free contraction timer: tap once when a contraction starts and again when it ends. See how long each lasted, how far apart they are, your average over the last hour and an alert when they follow the 5-1-1 rule. Saved on your phone, keeps the screen on, no sign-up.",
                              js_v="3"),
    "exif-viewer": dict(title="MES EXIF Viewer", page_title="EXIF Viewer: Photo Metadata, GPS Location and AI Flags",
                        tag="See the hidden data in a photo.", accent="#0f766e", dark="#0a5750", tint="#dcf2ef",
                        desc="Free EXIF viewer: drop a photo to see the camera, date, settings, GPS location, editing software and AI / Content Credentials flags hidden in it, and save a clean copy with all metadata removed. Private: the photo never leaves your browser.",
                        js_v="1"),
    # Domain Lookup (2026-10-14): lib.js = findings from the API answer (tests: tool_apps_src/domain-lookup-tests.js), mes.fm/api/domain-lookup.js = RDAP + DNS over HTTPS + RDAP for IPs + Internet Archive.
    "domain-lookup": dict(title="MES Domain Lookup", page_title="Domain Lookup: Whois, Domain Age, Owner and Hosting",
                          tag="Who is behind a website, and how old is it?", accent="#1d4ed8", dark="#1e3a8a", tint="#e1e9fc",
                          desc="Free domain lookup (whois / RDAP): see when a domain was registered and how old the website is, the registrar, expiry date, name servers, who hosts it, DNS and email setup, when the Internet Archive first saved it, and warning signs like a brand-new domain.",
                          js_v="1"),
    # Site Traffic & Rank: Tranco popularity rank (+30-day history), domain age / hosting (domain-lookup's lib via lib_from + its API), Wayback history, opt-in tech detection (api/site-traffic.js).
    # Rank only, never visit counts (Similarweb's numbers are proprietary). Tests: node tool_apps_src/site-traffic-tests.js.
    "site-traffic": dict(title="MES Site Traffic & Rank", page_title="Website Traffic Checker: Site Rank, Popularity and Age",
                         tag="How popular is a website, and for how long?", accent="#0f766e", dark="#134e4a", tint="#d9f2ee",
                         desc="Free website traffic checker: see a site's public popularity rank and its 30-day trend, how old the domain is, who hosts it, when the Internet Archive first saved it and what technology it uses. Rank data, never made-up visit numbers.",
                         js_v="2", lib_from=["domain-lookup"]),
    # MES Market Signals (2026-10-24, mes.fm/signals; part of MES Crypto): data = mes.fm/api/signals.js (one aggregator, keyless sources); lib.js is shared with the API
    # as mes.fm/api/_signals-lib.js (byte-identical copy). Tests: node tool_apps_src/signals-tests.js. Informational only, never advice.
    "signals": dict(title="MES Market Signals", page_title="Market Signals: Fear & Greed, Fed Rate, Yield Curve and Crypto Dashboard",
                    tag="Fear & greed, prices, rates, the Fed and the odds, free in one place.", accent="#277bb6", dark="#1b5c8a", tint="#e3eef8",
                    desc="Free market signals dashboard: the Crypto Fear & Greed Index, a stock-market fear & greed reading, Bitcoin and crypto prices, the S&P 500, gold and oil, the fed funds rate, Treasury yields and the yield curve, the next Fed meeting, prediction-market odds on the economy and on wars and ceasefires, the Doomsday Clock and the day's headlines, each explained in plain English. Not financial advice.",
                    js_v="2",
                    nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/crypto'>Crypto</a></li>",
                    menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/crypto\">MES Crypto</a></li>"),
    # MES Debt Clock (2026-10-25, mes.fm/debt-clock): US / world / Canada government debt as running estimates (last official figure + average change over a stated window).
    # Data = mes.fm/api/debt.js (one aggregator, keyless: Treasury Fiscal Data, FRED, IMF DataMapper, Statistics Canada, Bank of Canada); lib.js is shared with the API as
    # mes.fm/api/_debt-lib.js (byte-identical copy). Snapshot mes.fm/debt-clock/data/sample.json (`node mes.fm/api/debt.js --write`). Tests: node tool_apps_src/debt-clock-tests.js.
    "debt-clock": dict(title="MES Debt Clock", page_title="Debt Clock: US National Debt, World Debt and Canada's Debt, Live Estimate",
                       tag="The national debt, ticking: from official figures, with the maths shown.", accent="#9b1c31", dark="#6b1220", tint="#f9e3e6",
                       desc="Free live debt clock: a running estimate of the US national debt from the Treasury's daily figures, plus world government debt and Canada's federal debt, the share per person, household and taxpayer, debt-to-GDP, interest per second, the deficit, and charts back to 1790. Every number shows its source and how it is estimated.",
                       meta_desc="Live US national debt clock from Treasury data, plus world and Canada debt: per person, debt-to-GDP, interest per second and charts since 1790.",
                       js_v="1"),
    # MES NBA Picks (2026-10-26, mes.fm/nba-picks): predicted final standings (15 teams per conference) scored against the live standings (exact, within 1/2/3, tier, points,
    # closeness, Spearman). Standings = mes.fm/api/nba-standings.js (ESPN, keyless); leaderboard = mes.fm/api/nba-picks.js (Upstash). lib.js is shared with both as
    # mes.fm/api/_nba-lib.js (byte-identical copy). Snapshot mes.fm/nba-picks/data/sample.json (`node mes.fm/api/nba-standings.js --write`). Tests: node tool_apps_src/nba-picks-tests.js.
    "nba-picks": dict(title="MES NBA Picks", page_title="NBA Standings Predictions Tracker: How Many of Your Picks Are Right?",
                      tag="Your predicted standings vs the live table, scored every way.", accent="#c2410c", dark="#9a3412", tint="#fdeee4",
                      desc="Free NBA standings predictions tracker: put the 15 teams of the East and the West in the order you think they will finish and see how many you have right so far against the live standings: exact spots, within one to three spots, the right playoff / play-in / lottery tier, points and rank correlation, with a picture of every pick. Save several sets, share a link, compare with friends and join the leaderboard.",
                      meta_desc="Track your NBA standings predictions: see how many of your East and West picks are right against the live standings, compare with friends, join the leaderboard.",
                      js_v="1"),
    "baby-growth-percentile-calculator": dict(title="MES Baby Growth Percentile Calculator", page_title="Baby Growth Percentile Calculator (WHO Weight, Length, Head)",
                          tag="Weight, length and head percentiles on the WHO chart.", accent="#15803d", dark="#0f5f2c", tint="#dcf3e3", src="baby-growth", js_path="baby-growth/js/baby-growth.js", js_parts=["data.js"],
                          desc="Free baby growth percentile calculator using the WHO Child Growth Standards: enter age, weight, length and head circumference to see the percentile and z-score on the growth chart, corrected age for premature babies, and a private growth log that shows your baby's trend.",
                          js_v="4"),
    "baby-feeding-log": dict(title="MES Baby Feeding Log", page_title="Baby Feeding Log and Breastfeeding Timer",
                          tag="One-tap feeds, bottles and diapers.", accent="#d97706", dark="#a85b04", tint="#fdebd0",
                          desc="Free baby feeding log and breastfeeding timer: tap left or right to time each feed, get a reminder of which side is next, log bottles, pumping and wet or dirty diapers, and see today's totals and the gap between feeds. Private, saved on your phone, no sign-up.",
                          js_v="3"),
    # Archive (2026-10-14): one address -> Wayback Machine, archive.today, Ghostarchive, Megalodon, Arquivo.pt, RemovePaywall, ArcHive (Hive blockchain) + the user's own sites. lib.js = engine table (shared with the
    # MES Archive extension in mes.fm/archive/extension via build_archive_extension.py), tests: node tool_apps_src/archive-tests.js.
    "archive": dict(tools_extra=EXT_TAB, title="MES Archive", page_title="Archive Any Web Page: Wayback Machine, archive.today and More",
                    tag="Save or find any page on every web archive.", accent="#1e3a8a", dark="#152a66", tint="#e3e9fb",
                    desc="Free web archive tool: paste an address and open the Wayback Machine, archive.today, Ghostarchive, Megalodon and more at once to save a copy or find old ones, add your own archive sites, send it to the Hive blockchain, and get the one-click MES Archive browser extension.",
                    js_v="5"),
    # Time Dilation Explained: a static article (content.html is generated from source.md: $..$ inline TeX, $$..$$ display TeX, MathJax via /main_js/mes-math.js). No sidebar scripts of its own.
    "time-dilation-explained": dict(title="Time Dilation Explained", page_title="Time Dilation Explained: The Equations and Their Derivation",
                    tag="Where the Lorentz factor comes from, step by step.", accent="#be185d", dark="#9d174d", tint="#fce7f3",
                    desc="Time dilation explained step by step: derive the Lorentz factor from a light clock and Pythagoras, then length contraction, the twin paradox, constant-acceleration travel and the energy needed, with worked examples, a gamma table and practice questions.",
                    brand=dict(slug="time-dilation", title="MES Time Dilation Simulator", tag="Fast ships, slow clocks."), tab=1,
                    nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/time-dilation-explained'>Explained</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/time-dilation-explained\">Time Dilation Explained</a></li>",
                    js_v="3"),
    "days-between-dates-calculator": dict(title="MES Days Between Dates Calculator", page_title="Days Between Dates Calculator",
                                          tag="Days, weeks, months, hours and business days between two dates.", accent="#2f7d32", dark="#1f5a23", tint="#e4f2e4",
                                          desc="Free days between dates calculator: count the days, weeks, months, years, hours, minutes and seconds between any two dates, with optional end-date inclusion, business days (custom weekends and holidays), time of day and shareable links.",
                                          js_v="3", lib_from=["calendar"]),
    # the three CAS pages: SymPy running in the browser (Pyodide in a Web Worker), shared engine + UI in mes.fm/main_js/cas/ (engine.py,
    # cas-worker.js, cas-client.js, cas-ui.js; loaded via pre_js) and the shared CSS tool_apps_src/_cas.css (css_extra, inlined so the
    # derived dark theme covers it). Each page's own app.js only builds requests and renders results. Tests: tool_apps_src/cas-engine-tests.py.
    "cas-calculator": dict(title="MES CAS Calculator", page_title="CAS Calculator",
                           tag="Solve, simplify, factor, limits and series.", accent="#334155", dark="#1e293b", tint="#e8ecf1",
                           desc="Free online CAS calculator (computer algebra system): solve equations, systems and inequalities with steps, find every real root of hard equations numerically, simplify, factor, expand, partial fractions, limits, series, sums and matrices.",
                           js_v="2", pre_js=CAS_JS + ["/main_js/mes-ask.js?v=1"], css_extra=["_cas.css"]),
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
    "youtubemoney": dict(meta_desc="Free YouTube money calculator: estimate what a video or channel earns from views by topic, Shorts or long-form and viewer location.", share_img="youtubemoney/img/logo-big.png",
                  title="YouTube Money Calculator", page_title="YouTube Money Calculator",
                         tag="How much do YouTubers make?", accent="#cc1f1f", dark="#9a1515", tint="#fbe9e9",
                         desc="Free YouTube money calculator: estimate how much a video or channel earns from views, by topic, Shorts or long-form and viewer location, or work out how many views you need to hit an income goal. Uses your own RPM if you know it.",
                         js_v="2", no_ads=True,
                         nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/how-much-do-youtubers-make'>Channels</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/youtubemoney/youtubers'>YouTubers</a></li>",
                         menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/how-much-do-youtubers-make\">How much do YouTubers make? (channels)</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/youtubemoney/youtubers\">YouTuber earnings archive</a></li>"),
    "calendar": dict(title="MES Calendar", page_title="Calendar",
                     tag="Moon phases, holidays and more, month by month.", accent="#2f5fd0", dark="#1f44a0", tint="#e6edfb",
                     desc="Free online calendar for any year: month and year views with today highlighted, new and full moon times, Canada, USA, UK, Australia and Vietnam holidays, Christian, Jewish and Islamic dates, seasons, eclipses, daylight-saving changes and a days-between calculator.",
                     js_v="3"),
    # VAT Calculator 2.0 (rewritten 2026-10-03 from the 2013 jQuery page): lib.js = exact-rational maths + the country rate table (node-testable:
    # tool_apps_src/vatcalculator-tests.js), app.js = UI. Keeps ads (not an ad-free page); old /vatcalculator/s/<id> links still resolve via /api/share?calc=vat.
    "vatcalculator": dict(meta_desc="Free VAT calculator for 60+ countries: add or remove VAT, find the VAT amount or rate, and total itemised invoices with up-to-date rates.", share_img="vatcalculator/img/logo-big.png",
                  title="VAT Calculator", page_title="VAT Calculator",
                          tag="Add or remove VAT, GST and sales tax.", accent="#7a6200", dark="#574600", tint="#f6f0d6",
                          desc="Free VAT calculator for 60+ countries: add VAT to a net price, remove it from a gross price, or find the VAT amount or rate. Itemised invoices grouped by rate, UK, EU, Canada, US, India and more, with up-to-date rates, exact rounding and shareable links.",
                          js_v="2"),
    # Speed Reader 2.0 (rewritten 2026-10-03 from the 2016 jQuery/Bootstrap page; keeps its red accent + Grok logos): lib.js = pure logic (tokenising, focus letter, chunking,
    # pacing, speech chunking, voice choice; node-testable: tool_apps_src/speedreader-tests.js), app.js = RSVP + Web Speech UI. Keeps ads (like the old page).
    "speedreader": dict(meta_desc="Free speed reader and read-aloud tool: flash text one word at a time at 60 to 1500 words per minute, or listen with each word highlighted.", share_img="speedreader/img/logo-big.png",
                  title="Speed Reader and Read Aloud", page_title="Speed Reader",
                        tag="Read faster, or have any text read aloud.", accent="#e52503", dark="#bf190d", tint="#fdeceb",
                        desc="Free online speed reader and read-aloud tool: flash text one word at a time with a red focus letter at 60 to 1500 words per minute, or listen with the spoken word highlighted. Paste text or drop a file; nothing leaves your browser.",
                        js_v="4", pre_js=["/main_js/voice-picker.js?v=1"]),
    # Copy Text: a clipboard shelf (notes on boards, click to copy, localStorage only). Normal-width tool with the "More like this" sidebar.
    "copy-text": dict(title="MES Copy Text", page_title="Copy Text",
                      tag="Save text once, copy it again anytime.", accent="#a16207", dark="#7a4a05", tint="#fbf1d9",
                      desc="Free online copy and paste notepad: save the texts you paste again and again (replies, signatures, addresses, links, hashtags, prompts) on boards and copy any of them with one click. Private, stored only in your browser, with backup and restore.",
                      js_v="4"),
    # Typing Test: WPM / accuracy / consistency test (time, words, passage, own text; 5 difficulty levels; weak-key practice; challenge links). lib.js = word lists, seeded text,
    # typing state machine + results maths (node-testable: tool_apps_src/typing-test-tests.js), app.js = UI. Medium-wide page, no sidebar. localStorage "mes-typingtest:v1".
    "typing-test": dict(title="MES Typing Test", page_title="Typing Test",
                        tag="How fast and accurate is your typing?", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                        desc="Free typing speed test: measure your words per minute (WPM), accuracy and consistency. Timed, word-count, passage and your-own-text tests, five difficulty levels, a keyboard map of your weak keys, personal bests and challenge links. No sign-up.",
                        js_v="9", pre_js=["/main_js/ad-quiet.js?v=1"],
                        nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-transcribe'>Transcribe</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-voice'>Voice</a></li>",
                        menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-transcribe\">Transcription Typing Test</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-voice\">Voice Typing Test</a></li>"),
    # Transcription Typing Test (mes.fm/typing-test-transcribe): the text is spoken (Web Speech API) and you type what you hear; scored against the spoken text. A sub-page of the Typing Test
    # brand (same logo / header; brand option). lib.js = passages, chunking, pacing, alignment + scoring (node-testable: tool_apps_src/typing-transcribe-tests.js) on top of typing-test's lib (lib_from);
    # the voice list uses the shared searchable picker main_js/voice-picker.js. Ranked boards "tr-<pace>-<length>" live in api/typing-leaderboard.js.
    "typing-test-transcribe": dict(title="MES Transcription Typing Test", page_title="Transcription Typing Test",
                        tag="Type what you hear: transcription practice.", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                        desc="Free transcription typing test: listen to text read aloud and type what you hear. Scores your words per minute and accuracy against the spoken text, with adjustable pace and voice and leaderboards.",
                        js_v="5", lib_from=["typing-test"], pre_js=["/main_js/voice-picker.js?v=1", "/main_js/ad-quiet.js?v=1"], tab=1,
                        brand=dict(slug="typing-test", title="MES Typing Test", tag="Type what you hear: transcription practice."),
                        nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-transcribe'>Transcribe</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-voice'>Voice</a></li>",
                        menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-transcribe\">Transcription Typing Test</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-voice\">Voice Typing Test</a></li>"),
    # Voice Typing Test (new 2026-10-06, mes.fm/typing-test-voice; aliases /voice-typing-test /dictation-test /speech-to-text-test /voice-test): you read a passage aloud, the browser's SpeechRecognition types it, scored against
    # the passage with the transcription test's lib (lib_from). Same Typing Test brand ("Voice" tab). Boards "tv-<short|medium|long>" (+ "tv-all") live in api/typing-leaderboard.js; posted with d="v".
    "typing-test-voice": dict(title="MES Voice Typing Test", page_title="Voice Typing Speed Test",
                        tag="How fast can you talk to type?", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                        desc="Free voice typing speed test: read a passage out loud and your browser's speech recognition types it. Scores your voice-to-text words per minute and accuracy, with a leaderboard kept apart from the keyboard tests.",
                        js_v="2", lib_from=["typing-test", "typing-test-transcribe"], pre_js=["/main_js/ad-quiet.js?v=1"], tab=2,
                        brand=dict(slug="typing-test", title="MES Typing Test", tag="How fast can you talk to type?"),
                        nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-transcribe'>Transcribe</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/typing-test-voice'>Voice</a></li>",
                        menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-transcribe\">Transcription Typing Test</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/typing-test-voice\">Voice Typing Test</a></li>"),
    # Solar System Today: where the Sun, planets, Moon and Halley's Comet are on any date. lib.js = Astronomy Engine wrapper (node-testable), view.js = canvas renderer
    # (shared with the mes.fm/moon widget through the extra_js bundle), app.js = UI. Astronomy Engine itself is the copy that /moon already ships (pre_js).
    "solar-system-today": dict(title="MES Solar System Today", page_title="Solar System Today",
                               tag="Where Earth, the Moon and planets are today.", accent="#3730a3", dark="#292477", tint="#e6e5f8",
                               desc="See where Earth, the Moon, the Sun and the planets are in the solar system today, or on any date: an interactive 3D-style map you can rotate and play forward or backward in time, with distances, light travel times, retrograde planets, eclipses and oppositions.",
                               js_v="4", pre_js=["/moon/js/astronomy.browser.min.js"], js_parts=["view.js"],
                               extra_js={"orrery-embed.js": ["lib.js", "view.js", "embed.js"]}),
    # Fluid Simulator: incompressible Navier-Stokes in 2D (stable-fluids solver with MacCormack advection, node-tested: tool_apps_src/fluid-simulator-tests.js).
    # lib.js = solver + scenarios, app.js = UI + canvas. Wide page (like the graphing calculators), not in add_sidebar.py.
    "fluid-simulator": dict(title="MES Fluid Simulator", page_title="Fluid Simulator: Navier-Stokes in 2D",
                            tag="Stir, heat and block a live fluid.", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                            desc="A free 2D fluid simulator that solves the Navier-Stokes equations live in your browser: Karman vortex streets behind a cylinder, lid-driven cavity, rising hot plumes, Kelvin-Helmholtz rolls and merging vortices. Change the Reynolds number, stir with your finger, draw walls.",
                            js_v="3"),
    # Light in a Medium: 2D wave simulator with a painted refractive index (c = 1/n), mirror walls, point / beam sources and a Snell's-law ray overlay (lib.js node-tested:
    # tool_apps_src/light-in-a-medium-tests.js). Normal-width page in the tools sidebar collection, Wide by default (inline snippet), own fullscreen button.
    "light-in-a-medium": dict(title="MES Light in a Medium Simulator", page_title="Light in a Medium: Refraction and Slow Light Simulator",
                              tag="Paint glass. Watch light bend.", accent="#be185d", dark="#9d174d", tint="#fce7f3",
                              desc="A free simulator of light moving through a medium: paint glass, water or any refractive index and watch a live wave slow down, bend (Snell's law), focus in a lens, reflect inside a fibre or curve through a mirage. Compare the wave with rays, draw mirror walls for a double slit, or try a gravity-lens analogue.",
                              js_v="1"),
    # Black Hole Simulator: Schwarzschild light rays (shadow, photon sphere, optical analogue), orbits (precession, ISCO, plunge, clocks), a ray-traced picture (lensed stars + thin disk) and SI numbers
    # (lib.js node-tested: tool_apps_src/black-hole-simulator-tests.js). Four tabs. Normal-width page in the tools sidebar collection, Wide by default, own fullscreen button for the picture.
    "black-hole-simulator": dict(title="MES Black Hole Simulator", page_title="Black Hole Simulator: Light Bending, Orbits and Shadow",
                                 tag="Bend light. Orbit the dark.", accent="#6d28d9", dark="#5b21b6", tint="#ede9fe",
                                 desc="A free black hole simulator: watch light bend around a Schwarzschild black hole and find the shadow and photon sphere, follow orbits that precess, plunge or sit at the innermost stable orbit, see a ray-traced picture of a disk and lensed stars, and compute the size, tides and temperature of any black hole. Includes the optical analogue: a glass-like medium that bends light the same way.",
                                 js_v="5"),
    # Electromagnetic Fields Simulator: electric charges (field lines, equipotentials, Gauss's law, test charges), currents (Ampere, forces), a charged particle in E and B (Boris pusher, relativistic option),
    # Maxwell waves (2D FDTD Yee solver with glass / metal / absorber, slits, cavity, probe) and a 3D plane wave. (lib.js node-tested: tool_apps_src/electromagnetic-fields-simulator-tests.js.) Normal-width page in the tools sidebar collection.
    "electromagnetic-fields-simulator": dict(title="MES Electromagnetic Fields Simulator", page_title="Electromagnetic Fields Simulator: Electric, Magnetic and Light Waves",
                                             tag="See the fields. Watch the waves.", accent="#c2410c", dark="#9a3412", tint="#ffedd5",
                                             desc="A free electromagnetism simulator: place charges and see field lines, equipotentials and Gauss's law, add current-carrying wires and check Ampere's law, turn bar magnets and see their flux lines and magnetic isopotentials, steer a charged particle through electric and magnetic fields, watch Maxwell's equations make waves reflect, refract and diffract, and explore a 3D electromagnetic plane wave.",
                                             js_v="14", vars={"MAGNETS": "@panel-magnets.html"}),
    # Magnetic Isopotentials (2026-10-25): the Magnets tab of the EM Fields Simulator as its own page (own URL, text, FAQ, logos). Shares that app's source folder (src) and served script (js_path);
    # content-magnets.html carries only the magnets panel (the same panel-magnets.html, via vars) + its own text; data-only="mg" tells app.js to run just that panel.
    "magnetic-isopotentials": dict(title="MES Magnetic Isopotentials", page_title="Magnetic Isopotentials and Flux Lines of Bar Magnets",
                                   tag="Flux lines and isopotentials, live.", accent="#b91c1c", dark="#991b1b", tint="#fee2e2",
                                   desc="Free magnet simulator: drag and turn bar magnets and see their magnetic flux lines and isopotential lines (equal magnetic scalar potential) at once, with compasses, field strength colours, horseshoe and Halbach examples.",
                                   src="electromagnetic-fields-simulator", content="content-magnets.html", js_path="electromagnetic-fields-simulator/js/electromagnetic-fields-simulator.js",
                                   js_v="14", vars={"MAGNETS": "@panel-magnets.html"}),
    # Hutchison Effect Simulator (2026-10-26): top-down lab floor of John Hutchison's apparatus (Tesla coils, Van de Graaff, RF, spark gaps, tanks, inductors, field shaper ...), field superposition
    # heat maps (drive / |E| / |B| / overlap / standing waves / glitch risk / animated), samples with best-estimate effect rates (levitation, jelly metal, fracturing ...), target camera, schematic + equipment views.
    # (lib.js = MESHut, node-tested: tool_apps_src/hutchison-effect-simulator-tests.js.) Normal-width page in the tools sidebar collection, Wide by default.
    "hutchison-effect-simulator": dict(title="MES Hutchison Effect Simulator", page_title="Hutchison Effect Simulator: Tesla Coils, Fields and Levitation",
                                       tag="Cross the fields. Watch the samples.", accent="#b45309", dark="#92400e", tint="#fef3c7",
                                       desc="A free Hutchison Effect simulator: lay out John Hutchison's apparatus (Tesla coils, Van de Graaff, RF transmitters, spark gaps, tank circuits, inductors, field shaper), see where their fields cross, and watch samples levitate, bend like jelly, fracture, glow, smoke and bubble. Includes George Hathaway's LADS Phase I lab, a schematic view and an equipment guide for planning a replication.",
                                       js_v="1"),
    # Double Pendulum: live chaotic pendulum (RK4, copies for the butterfly effect, angle and divergence graphs, Lyapunov estimate) + a flip-time chaos map of every starting pair of angles
    # (lib.js node-tested: tool_apps_src/double-pendulum-tests.js). Normal-width page in the tools sidebar collection, Wide by default.
    "double-pendulum": dict(title="MES Double Pendulum", page_title="Double Pendulum Simulator: Chaos and the Butterfly Effect",
                            tag="Two arms. One butterfly effect.", accent="#7e22ce", dark="#6b21a8", tint="#f3e8ff",
                            desc="A free double pendulum simulator: drag the balls to set the start, watch the chaotic motion and its colourful trail, launch a fan of copies to see the butterfly effect, read the divergence graph, and explore the fractal chaos map of how long it takes to flip.",
                            js_v="7"),
    # Orbit Simulator: Newtonian N-body sandbox (Yoshida leapfrog, adaptive step) with 12 systems (planets, Halley, Trojans, Earth-Moon, figure-eight, gravity assist ...), launch-by-drag, Kepler's laws overlays, SI orbit calculator
    # (lib.js node-tested: tool_apps_src/orbit-simulator-tests.js). Normal-width page in the tools sidebar collection, Wide by default.
    "orbit-simulator": dict(title="MES Orbit Simulator", page_title="Orbit Simulator: Planets, Gravity and Kepler's Laws",
                            tag="Launch a planet. Watch gravity work.", accent="#9a3412", dark="#7c2d12", tint="#ffedd5",
                            desc="A free orbit and gravity simulator: launch planets and comets by dragging, watch the inner planets, Halley's comet, Jupiter's Trojans, the Moon, a gravity assist and the figure-eight three-body orbit, see Kepler's laws and equal areas live, and compute orbit speeds, periods and Hohmann transfers.",
                            js_v="6"),
    # Metric Tensor Explorer: curvature calculator (Christoffel, Riemann, Ricci, Einstein, Kretschmann, geodesic equations via SymPy in the CAS worker) + a geodesic shooter drawn on surfaces
    # (engine ops metric / geodesics in main_js/cas/engine.py, tests: tool_apps_src/metric-engine-tests.py). Normal-width page in the tools sidebar collection.
    "metric-tensor": dict(title="MES Metric Tensor Explorer", page_title="Metric Tensor Calculator: Christoffel, Riemann and Einstein Tensors",
                          tag="From metric to curvature.", accent="#0f766e", dark="#115e59", tint="#ccfbf1",
                          desc="Free metric tensor calculator for general relativity: pick Schwarzschild, de Sitter, FLRW, a wormhole or type your own metric and get the Christoffel symbols, geodesic equations, Riemann, Ricci and Einstein tensors and the Kretschmann scalar, plus geodesics drawn on spheres, tori and hyperbolic planes.",
                          js_v="2", pre_js=CAS_JS, css_extra=["_cas.css"]),
    # Mandelbrot Explorer: Mandelbrot / Burning Ship / Tricorn / Multibrot sets and their Julia sets; worker-pool rendering of smooth escape counts, instant recolouring, Julia preview, orbit overlay,
    # point calculator (lib.js node-tested: tool_apps_src/mandelbrot-tests.js). Normal-width page in the tools sidebar collection, Wide by default.
    # Julia Set Explorer (2026-10-14): the Mandelbrot Explorer's script and template in data-mode="julia" (main picture = the Julia set of c, a draggable c map in the corner, c inputs, walk c around the cardioid).
    "julia-set-explorer": dict(title="MES Julia Set Explorer", page_title="Julia Set Explorer: Drag c and Watch the Fractal Change",
                    tag="One number, infinite shapes.", accent="#0f766e", dark="#0b5a54", tint="#dcf3ef", src="mandelbrot", js_path="mandelbrot/js/mandelbrot.js",
                    desc="A free Julia set explorer: drag a point on a map of the Mandelbrot set and watch its Julia set change live, type any constant c, walk c around the cardioid, zoom and cycle the colours, save pictures and share links. Runs in your browser.",
                    nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/mandelbrot'>Mandelbrot</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/buddhabrot'>Buddhabrot</a></li>",
                    menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/mandelbrot\">Mandelbrot Explorer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/buddhabrot\">Buddhabrot Explorer</a></li>",
                    content="content.html", js_v="10", vars={"MODE": "julia", "SEO": "@seo/julia.html"}),
    "mandelbrot": dict(title="MES Mandelbrot Explorer", page_title="Mandelbrot Set Explorer: Zoom, Julia Sets and Fractals",
                       tag="Zoom into infinity.", accent="#1e40af", dark="#1e3a8a", tint="#dbeafe",
                       desc="A free Mandelbrot set explorer: drag and zoom through the famous fractal in your browser, see the Julia set of any point live, trace the orbit under the pointer, try the Burning Ship, Tricorn and Multibrot sets, cycle the colours and test any number with the point calculator.",
                       nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/julia-set-explorer'>Julia Set</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/buddhabrot'>Buddhabrot</a></li>",
                       menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/julia-set-explorer\">Julia Set Explorer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/buddhabrot\">Buddhabrot Explorer</a></li>",
                       js_v="10", vars={"MODE": "mandelbrot", "SEO": "@seo/mandelbrot.html"}),
    # Buddhabrot Explorer: density plot of the orbits of the points that ESCAPE the Mandelbrot iteration (Melinda Green's technique; Lori Gardi named it); worker-pool random sampling into
    # Uint32 count buffers (lib.js = MESBuddha, node-tested: tool_apps_src/buddhabrot-tests.js), Nebulabrot (3 limits = RGB), Anti-Buddhabrot, z^3 / z^4, instant re-toning, orbit lab.
    "buddhabrot": dict(title="MES Buddhabrot Explorer", page_title="Buddhabrot and Nebulabrot Explorer: Watch the Fractal Fill In",
                       tag="The orbits that escape.", accent="#312e81", dark="#1e1b4b", tint="#e0e7ff",
                       desc="Render the Buddhabrot fractal live in your browser: millions of random Mandelbrot orbits are traced and piled into a glowing seated figure. Try the three-colour Nebulabrot, the Anti-Buddhabrot and cubic versions, pick any point to see its orbit, and read how Melinda Green found it and Lori Gardi named it.",
                       nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/mandelbrot'>Mandelbrot</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/julia-set-explorer'>Julia Set</a></li>",
                       menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/mandelbrot\">Mandelbrot Explorer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/julia-set-explorer\">Julia Set Explorer</a></li>",
                       js_v="5"),
    # Time Dilation Simulator: two people (one at home, one on a fast ship) with year clocks, heartbeats, molecules and a life-long ageing figure; the light clock; the twin trip
    # (constant speed or constant 1 g, spacetime diagram with proper-time dots); a calculator (lib.js = MESRel, node-tested: tool_apps_src/time-dilation-tests.js). Normal-width page in the tools sidebar collection, Wide by default.
    "time-dilation": dict(title="MES Time Dilation Simulator", page_title="Time Dilation Calculator and Simulator: How Much Would You Age?",
                          tag="Fast ships, slow clocks.", accent="#be185d", dark="#9d174d", tint="#fce7f3",
                          desc="A free time dilation simulator and calculator: watch a traveller's clock, heartbeat and ageing slow down as a ship approaches the speed of light, see the light clock that explains why, fly the twin paradox at constant speed or a steady 1 g with a spacetime diagram, and calculate how much you would age.",
                          js_v="5",
                          nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/time-dilation-explained'>Explained</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/time-dilation-explained\">Time Dilation Explained</a></li>"),
    # Photo Editor: layers, selections, text labels, arrows / callouts / step badges, retouch, adjustments, PSD, all in the browser (canvas). lib.js = MESPixel (pure pixel maths, node-tested:
    # tool_apps_src/photo-editor-tests.js), js_parts = engine (core.js layers / history / selection) + tools + dialogs; lib_from = image-converter's lib (MESImg: formats, zip). Wide page, always-dark workspace.
    "photo": dict(title="MES Photo Editor", src="photo-editor", page_title="Free Online Photo Editor with Layers",
                         tag="Pro tools. No upload. No sign-up.", accent="#7c3aed", dark="#5b21b6", tint="#f1eafe",
                         desc="Free online photo editor with layers, selections, magic wand, clone stamp, levels and curves. Add text labels, arrows, callouts and blur boxes to screenshots, combine images, keep transparency, open PSD and GIMP (.xcf) files and export PNG, JPEG or WebP. Private: nothing is uploaded.",
                         js_v="26", js_parts=["core.js", "tools.js", "tools2.js", "dialogs.js", "ai.js", "aiort.js", "erase.js", "upscale.js", "equation.js", "xcf.js", "files.js", "projects.js"], lib_from=["image-converter"]),
    # Bulk Image Converter: PNG / JPEG / WebP in bulk in the browser (canvas), optional resize, ZIP download. lib.js = MESImg (formats, sizes, names, ZIP writer; node-tested: tool_apps_src/image-converter-tests.js), shared with the photo editor.
    "image-converter": dict(title="MES Bulk Image Converter", page_title="Bulk Image Converter: PNG to JPG, JPG to PNG, WebP",
                         tag="Convert many images at once. Nothing is uploaded.", accent="#0f766e", dark="#0b5a54", tint="#e2f3f1",
                         desc="Free bulk image converter: convert PNG to JPG, JPG to PNG or WebP in one go. Drop a whole folder, set the quality and size, and download everything as a ZIP. Runs in your browser, nothing is uploaded and there is no limit on files.",
                         js_v="1"),
    # Atomic Clock Simulator: caesium clock loop (quartz locked to atoms), Ramsey fringes / fountain, clock race, Allan-deviation chart, drift calculator.
    # lib.js = physics + drift maths (node-tested: tool_apps_src/atomic-clock-simulator-tests.js), app.js = UI. Wide page, dark stages, own Theatre button, no sidebar.
    "atomic-clock-simulator": dict(title="MES Atomic Clock Simulator", page_title="Atomic Clock Simulator",
                            tag="How atoms keep time.", accent="#1e4fb3", dark="#173d8a", tint="#e4ecfa",
                            desc="Free atomic clock simulator: see how a caesium clock locks a quartz oscillator to atoms, tune Ramsey fringes in a fountain clock, race quartz against rubidium, caesium and optical clocks, compare their stability, and work out how far any clock drifts.",
                            js_v="3"),
    # Michelson-Morley Experiment Simulator: interferometer on a rotating table with live fringes, the aether-frame light-path picture, a noisy 16-point turntable run + fit, the historic experiments, and a fringe-shift calculator.
    # lib.js = exact arm-time / fringe maths (node-tested: tool_apps_src/michelson-morley-tests.js), app.js = UI. Wide page, dark stages, own Theatre button, no sidebar.
    "michelson-morley-experiment": dict(title="MES Michelson-Morley Experiment Simulator", page_title="Michelson-Morley Experiment Simulator",
                            tag="Did the Earth move through the aether?", accent="#047857", dark="#065f46", tint="#dcf5ea",
                            desc="Free Michelson-Morley experiment simulator: turn an interferometer through an aether wind and watch the fringes shift, see why the two light paths take different times, run a 16-point turntable measurement with noise, compare the 1881 and 1887 experiments, and calculate the expected fringe shift.",
                            js_v="1"),
    # Faster-Than-Light Shadow Simulator: a swung torch beam or a finger's shadow on a far screen moves faster than c; the beam is drawn with true light-travel delay (history buffer), a space-time diagram shows why no message goes with it, calculator.
    # lib.js = exact spot-speed formula + parsers (node-tested: tool_apps_src/faster-than-light-shadow-tests.js), app.js = UI. Wide page, dark stages, own Theatre button, no sidebar.
    "faster-than-light-shadow-simulator": dict(title="MES Faster-Than-Light Shadow Simulator", page_title="Faster-Than-Light Shadow Simulator",
                            tag="A shadow can outrun light.", accent="#b45309", dark="#92400e", tint="#fdf0dc",
                            desc="Free faster-than-light shadow simulator: swing a torch beam or move a finger in front of a lamp and watch the spot or shadow on the Moon or a far screen move faster than the speed of light, with the real light-travel delay, and see why no message can ride on it.",
                            js_v="6"),
    # Fountain Clock: the 3D fountain tab of the Atomic Clock Simulator as its own page (own URL, title, share image and text). Shares that app's source folder (src) and its served script
    # (js_path); content-fountain.html carries only the fountain panel + its own text (data-only="fountain" tells app.js to run just that panel).
    "fountain-clock": dict(title="MES Caesium Fountain Clock", page_title="Caesium Fountain Clock Simulator (3D)",
                            tag="Toss cold atoms up and keep time.", accent="#1e4fb3", dark="#173d8a", tint="#e4ecfa",
                            desc="Watch a caesium fountain atomic clock in 3D: six lasers cool a ball of atoms, it is launched up through the microwave cavity and falls back. Change the flight time and the atom temperature and see why throwing higher stops helping.",
                            src="atomic-clock-simulator", content="content-fountain.html", js_path="atomic-clock-simulator/js/atomic-clock-simulator.js", js_v="3"),
    # Reynolds Number Calculator: Re from fluid, speed and size (any units), regime for the geometry, solve for speed / size, pipe friction, drag, shedding, boundary layer. lib.js node-tested.
    # Grounding & Ground Rod Simulator (2026-10-14): rod resistance (Dwight + mutual), shock/fault cases, lightning step voltage, static decay, regional rules. lib.js node-tested: tool_apps_src/grounding-rod-simulator-tests.js
    "grounding-rod-simulator": dict(title="MES Grounding Rod Simulator", page_title="Ground Rod Calculator: Earthing, Lightning and Shock Safety",
                            tag="See what a ground rod really does.", accent="#a16207", dark="#854d0e", tint="#fbf1d6",
                            desc="Free ground rod calculator and earthing simulator: find a rod's resistance for your soil, how many rods you need, why a rod does not trip a breaker, lightning step and touch voltages, static discharge time, and the grounding rules for the US, Canada, UK, Australia, Europe and Vietnam.",
                            js_v="12"),
    "reynolds-number-calculator": dict(title="MES Reynolds Number Calculator", page_title="Reynolds Number Calculator",
                            tag="Laminar or turbulent? Find out.", accent="#0e7490", dark="#155e75", tint="#e0f4f8",
                            desc="Free Reynolds number calculator: enter the fluid, speed and size in any units to get Re, whether the flow is laminar or turbulent, pipe friction and pressure drop, drag and vortex-shedding frequency. Or solve for the speed or size that gives a target Re.",
                            js_v="3"),
    # MES Mechanics of Materials (2026-10-20): ONE source (tool_apps_src/materials: lib.js = MESMech, node tests tool_apps_src/materials-tests.js; app.js, app.css, content.html with {{VIEWS}} / {{PAGE}} / {{SEO}},
    # seo/<slug>.html) and one served script (materials/js/materials.js) for four pages; data-views on #mt picks the tabs: axial, tensile, shear, torsion, poisson, thermal, table.
    # /materials shows all seven; the other three use the materials brand (logo, header, Home). State: localStorage mes-materials:v1 (shared). Share links are plain query strings.
    "materials": dict(title="MES Mechanics of Materials", page_title="Mechanics of Materials Calculator: Stress, Strain, Young's Modulus, Shear, Torsion",
                      tag="Stress, strain, shear and torsion, with the pictures.", accent="#2f6690", dark="#22496a", tint="#e1edf6",
                      desc="Free mechanics of materials calculators: stress and strain with Young's modulus, a tensile test simulator with the stress-strain curve, shear stress in bolts and pins, torsion of shafts, Poisson's ratio and 3D Hooke's law, thermal stress, and a table of 30 materials. SI and US units.",
                      js_v="6", vars={"VIEWS": "axial,tensile,shear,torsion,poisson,thermal,table", "PAGE": "materials", "SEO": "@seo/materials.html"}, nav_extra=MAT_NAV_INFO, menu_extra=MAT_NAV_MENU),
    "youngs-modulus-calculator": dict(title="Young's Modulus Calculator", page_title="Young's Modulus Calculator: Stress, Strain and Elongation",
                      tag="Stress, strain and stretch from any four values.", accent="#2f6690", dark="#22496a", tint="#e1edf6", src="materials", js_path="materials/js/materials.js",
                      desc="Free Young's modulus calculator: find stress, strain, elongation or the modulus of elasticity from the force, area and length, with a live picture of the stretched bar, safety factor, buckling load and 30 materials. SI and US units, every formula shown.",
                      js_v="6", vars={"VIEWS": "axial,tensile,table", "PAGE": "youngs", "SEO": "@seo/youngs-modulus-calculator.html"}, brand=MAT_BRAND, tab=1, nav_extra=MAT_NAV_INFO, menu_extra=MAT_NAV_MENU),
    "tensile-test-simulator": dict(title="Tensile Test Simulator", page_title="Tensile Test Simulator: Stress-Strain Curve, Yield, UTS and Necking",
                      tag="Pull a bar until it breaks and watch the curve.", accent="#2f6690", dark="#22496a", tint="#e1edf6", src="materials", js_path="materials/js/materials.js",
                      desc="Free tensile test simulator: pull steel, aluminium, cast iron, glass, plastics, rubber and more until they break and watch the stress-strain curve being drawn: yield, 0.2% offset, Lüders plateau, UTS, necking, unloading, true stress, resilience and toughness. Compare three materials.",
                      js_v="6", vars={"VIEWS": "tensile,table", "PAGE": "tensile", "SEO": "@seo/tensile-test-simulator.html"}, brand=MAT_BRAND, tab=2, nav_extra=MAT_NAV_INFO, menu_extra=MAT_NAV_MENU),
    "shear-stress-calculator": dict(title="Shear Stress Calculator", page_title="Shear Stress Calculator: Bolts, Pins, Punching and Shaft Torsion",
                      tag="Shear in bolts and pins, and twisted shafts.", accent="#2f6690", dark="#22496a", tint="#e1edf6", src="materials", js_path="materials/js/materials.js",
                      desc="Free shear stress calculator: shear stress and strain in bolts and pins in single or double shear, glued joints and punching, shear modulus from E and Poisson's ratio, and torsion of solid and hollow shafts with the angle of twist and motor power. Safety factors and sizes.",
                      js_v="6", vars={"VIEWS": "shear,torsion,table", "PAGE": "shear", "SEO": "@seo/shear-stress-calculator.html"}, brand=MAT_BRAND, tab=3, nav_extra=MAT_NAV_INFO, menu_extra=MAT_NAV_MENU),
    # Photoelectric Effect Simulator: light on a metal, electrons, stopping voltage, I-V and KE-vs-f graphs, and a "measure h" lab. lib.js node-tested (tool_apps_src/photoelectric-effect-tests.js). Normal-width page with the sidebar (Wide by default); opensearch.xml lets browsers add it as a search engine.
    "photoelectric-effect-simulator": dict(title="MES Photoelectric Effect Simulator", page_title="Photoelectric Effect Simulator",
                            tag="Light knocks electrons out of metal.", accent="#6d28d9", dark="#5b21b6", tint="#ede9fe",
                            desc="Free photoelectric effect simulator: change the metal, wavelength, intensity and voltage and watch electrons leave the surface. See the threshold frequency, stopping voltage, kinetic energy and current graphs, and measure Planck's constant from your own data.",
                            js_v="5"),
    # Sum of Integers & Series Calculator: 1..n, any range, k-th powers (Faulhaber, exact BigInt), odd / even, multiples, arithmetic / geometric series, Fibonacci, Sigma of a formula. lib.js node-tested (tool_apps_src/sum-of-integers-tests.js). Keyword aliases redirect in vercel.json.
    "sum-of-integers-calculator": dict(title="MES Sum of Integers Calculator", page_title="Sum of Integers, Squares & Series Calculator",
                            tag="Add up integers, squares, cubes and series.", accent="#7c3aed", dark="#5b21b6", tint="#f1eafe",
                            desc="Free sum of integers calculator: add 1 to n, any range, squares, cubes or any power, odd or even numbers, multiples, arithmetic and geometric series, Fibonacci numbers, or Σ of your own formula. Exact answers for huge numbers with the formula and worked steps.",
                            js_v="2"),
    # 3D Fluid Simulator: CPU stable-fluids solver in a 3D box (lib.js, node-tested: tool_apps_src/3d-fluid-simulator-tests.js) + WebGL2 ray-marched smoke with an orbit camera
    # (flat canvas fallback without WebGL2). Wide page like the 2D simulator (own Theatre button, no sidebar).
    "3d-fluid-simulator": dict(title="MES 3D Fluid Simulator", page_title="3D Fluid Simulator: Smoke in a Box",
                            tag="Rotate real 3D smoke, rings and wakes.", accent="#0e7490", dark="#155e75", tint="#e0f4f8",
                            desc="A free 3D fluid simulator in your browser: a rising hot smoke plume, smoke ring cannon, colliding vortex rings, wind past a sphere and a smoke tank you can stir. The Navier-Stokes equations are solved live in 3D; rotate and zoom the smoke.",
                            js_v="4"),
    # Search Engines: type one search and open it in many engines (tabs, tiled windows or same tab); sets for censorship / SEO / privacy comparisons; own engines.
    # lib.js = engine table + URL builder (node-testable: tool_apps_src/search-engines-tests.js), app.js = UI. Wide page, no sidebar.
    # Reverse Image Search (2026-10-14): companion of search-engines. lib.js = engine table + URL builder (node tests: tool_apps_src/reverse-image-search-tests.js), app.js = UI.
    "reverse-image-search": dict(title="MES Reverse Image Search", page_title="Reverse Image Search",
                                 tag="One picture, every reverse image search.", accent="#4f46e5", dark="#3730a3", tint="#e8e7fb",
                                 desc="Free reverse image search on Google Lens, Bing, TinEye, Yandex, Baidu, SauceNAO and more at once: paste an image link or upload, drop or paste a picture, search just part of it, flip it, and open every site together. Private: your picture is never uploaded to mes.fm.",
                                 js_v="4",
                                 head_extra='<link rel="search" type="application/opensearchdescription+xml" title="MES Reverse Image Search" href="https://mes.fm/reverse-image-search/opensearch.xml" />'),
    "search-engines": dict(title="MES Search Engines", page_title="Search Engines",
                           tag="One search, every search engine.", accent="#c2410c", dark="#9a3412", tint="#fdeadf",
                           desc="Type your search once and open it in Google (.com, .ca, .co.uk and more), Bing, DuckDuckGo, Brave, Yandex and 60+ other search engines, AI assistants and video sites, in tabs or tiled windows. Compare results, check censorship and bias, and add your own engines.",
                           js_v="7",
                           head_extra='<link rel="search" type="application/opensearchdescription+xml" title="MES Search Engines" href="https://mes.fm/search-engines/opensearch.xml" />'),
    # Mortgage Calculator 2.0 (rewritten 2026-10-03 from the 2013-2018 jQuery page): lib.js = exact-cents maths + the country rules tables (CMHC, minimum down payment, stress test, SDLT;
    # node-testable: tool_apps_src/mortgagecalculator-tests.js), app.js = UI. Keeps ads; old /mortgagecalculator/s/<id> links still resolve via /api/share?calc=mc.
    "mortgagecalculator": dict(meta_desc="Free mortgage calculator for the US, Canada, UK and Australia: monthly payment, taxes, PMI or CMHC, affordability and amortization schedule.", share_img="mortgagecalculator/img/logo-big.png",
                  title="Mortgage Calculator", page_title="Mortgage Calculator",
                               tag="Payments, affordability and amortization for the US, Canada and UK.", accent="#0e7490", dark="#0a5568", tint="#e0f2f7",
                               desc="Free mortgage calculator for the US, Canada, UK and Australia: monthly payment with taxes, insurance, PMI or CMHC premium, how much house you can afford, full amortization schedule and charts, extra payments, bi-weekly and accelerated payments, and side-by-side comparison.",
                               js_v="2"),
    # Grade Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page; old js/calculatorffaf.js deleted): lib.js = maths + share encoding (node-testable:
    # tool_apps_src/gradecalculator-tests.js), app.js = UI (saved courses, assignments, what-if). Keeps ads. Old /gradecalculator/s/<id> links resolve via /api/share?calc=gc.
    "gradecalculator": dict(meta_desc="Free final grade calculator: see what you need on your final exam to get the course grade you want, from your current grade or your assignments.", share_img="gradecalculator/img/share.jpg",
                  title="Grade Calculator", page_title="Final Grade Calculator",
                            tag="What do you need on your final exam?", accent="#575fab", dark="#434a8a", tint="#e9eaf6",
                            desc="Free final grade calculator: find out what grade you need on your final exam to get the course grade you want. Enter your current grade or your assignments, save all your courses, try what-if scores and share your results to another device.",
                            js_v="3",
                            nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/weighted-average-calculator'>Weighted Average</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gradecalculator/memes'>Memes</a></li>",
                            menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/weighted-average-calculator\">Weighted Average</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/memes\">Memes</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/study-tips\">Study Tips</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/tutorial\">Tutorial</a></li>"),
    # Weighted Average Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page): lives at /weighted-average-calculator (the old URL is kept: ~2,300 views / 30 days) as a sub-page of the
    # Grade Calculator brand (brand + url + out + js_path options). lib.js = maths + share encoding (tests: tool_apps_src/weighted-average-tests.js), app.js = UI. Keeps ads.
    "weighted-average-calculator": dict(meta_desc="Free weighted average calculator: enter grades with weights, credits or percentages to get the weighted average, plain average and steps.", share_img="gradecalculator/img/weighted-average-share.jpg",
                  title="Weighted Average Calculator", page_title="Weighted Average Calculator",
                            tag="Average grades that count for different amounts.", accent="#575fab", dark="#434a8a", tint="#e9eaf6",
                            desc="Free weighted average calculator: enter grades with their weights, credits or percentages and get the weighted average, the plain average and a step-by-step table. Paste from a spreadsheet, save your list and open it on any device with a link.",
                            js_v="3", url="weighted-average-calculator", out="weighted-average-calculator.html",
                            js_path="gradecalculator/js/weighted-average-calculator.js", tab=1,
                            brand=dict(slug="gradecalculator", title="Grade Calculator", tag="What do you need on your final exam?"),
                            nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/weighted-average-calculator'>Weighted Average</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gradecalculator/memes'>Memes</a></li>",
                            menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/weighted-average-calculator\">Weighted Average</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/memes\">Memes</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/study-tips\">Study Tips</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/tutorial\">Tutorial</a></li>"),
    # GPA Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page; old js/calculatorffaf.js deleted): letters or percentages (mixed) per course, 4.0 / 4.33 scales, honors / AP weighting, several terms +
    # prior GPA / credits for a cumulative GPA, "what GPA do I need next". lib.js = maths + share encoding (tests: tool_apps_src/gpa-tests.js). Keeps ads; old /gpacalculator/s/<id> links resolve via /api/share?calc=gpa.
    "gpacalculator": dict(meta_desc="Free GPA calculator: turn letter grades or percentages and credits into your GPA on a 4.0 or 4.33 scale, with weighted and cumulative GPA.", share_img="gpacalculator/img/share.jpg",
                  title="GPA Calculator", page_title="GPA Calculator",
                          tag="Grade point average, term by term.", accent="#5a812d", dark="#436022", tint="#edf3dc",
                          desc="Free GPA calculator: enter letter grades or percentages with credits and get your GPA on the 4.0 or 4.33 scale. Weighted GPA for honors and AP, a cumulative GPA across terms, a what-GPA-do-I-need-next planner, and links to save your work on any device.",
                          js_v="3",
                          nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gpacalculator/tutorial'>Tutorial</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gpacalculator/grade-point-average'>What is GPA?</a></li>",
                          menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/tutorial\">Tutorial</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/grade-point-average\">What is GPA?</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/gpa-scale-4\">4.0 GPA Scale</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/gpa-scale-433\">4.33 GPA Scale</a></li>"),
    # BMI Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page; old js/calculatorffaf.js deleted; the folder's chart / formula / what-is-BMI / health-tips / memes / sports pages are untouched):
    # kg / cm are the truth with both unit systems mirrored, WHO or Asian cut-offs, healthy range, gain / lose to normal, BMI Prime, Ponderal Index, gauge, saved measurements with a BMI-over-time chart.
    # lib.js = maths + share encoding (tests: tool_apps_src/bmi-tests.js). Keeps ads; old /bmicalculator/s/<id> links resolve via /api/share?calc=bmi.
    "bmicalculator": dict(meta_desc="Free BMI calculator in kg/cm or lb/ft/in: get your body mass index, WHO or Asian category, healthy weight range and how much to gain or lose.", share_img="bmicalculator/img/share.jpg",
                  title="BMI Calculator", page_title="BMI Calculator",
                          tag="Body mass index, healthy weight range and progress.", accent="#b3529d", dark="#8a3d79", tint="#f8e2ed",
                          desc="Free BMI calculator: enter your weight and height in kg/cm or lb/ft/in to get your body mass index, your category, your healthy weight range and how much to gain or lose. WHO or Asian cut-offs, a gauge, and saved measurements with a BMI-over-time chart.",
                          js_v="12", js_parts=["i18n.js"],
                          nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/health-tips'>Health Tips</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/memes'>Memes</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/body-mass-index'>What is BMI?</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/bmi-chart'>BMI Chart</a></li>",
                          menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/health-tips\">Health Tips</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/memes\">Memes</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/body-mass-index\">What is BMI?</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/bmi-chart\">BMI Chart</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/bmi-formula\">BMI Formula</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/sports\">Sports Articles</a></li>"),
    # BMR Calculator (2026-10-14): basal metabolic rate + TDEE + calories for a goal. Mifflin-St Jeor / revised Harris-Benedict / Katch-McArdle / Cunningham, kg/cm mirrored with lb/ft/in,
    # activity levels, goal table with a safety floor, equation comparison. lib.js = maths (tests: tool_apps_src/bmr-calculator-tests.js). Share links are plain query strings; keeps ads.
    "bmr-calculator": dict(title="BMR Calculator", page_title="BMR Calculator: Basal Metabolic Rate and Daily Calories",
                           tag="How many calories your body burns each day.", accent="#237a35", dark="#1f6a2f", tint="#e3f4e6",
                           desc="Free BMR calculator: find your basal metabolic rate and daily calories (TDEE) from your age, sex, weight and height. Mifflin-St Jeor, Harris-Benedict, Katch-McArdle and Cunningham equations, calories to lose or gain weight, kcal and kJ, no sign-up.",
                           js_v="2"),
    # TDEE Calculator (2026-10-14): the BMR calculator's script and page in a TDEE-first mode (data-mode="tdee" on #br: hero leads with maintenance calories, own text in content-tdee.html).
    "tdee-calculator": dict(title="TDEE Calculator", page_title="TDEE Calculator: Maintenance Calories and Calories to Lose Weight",
                            tag="Your maintenance calories for any goal.", accent="#b45309", dark="#8a3f07", tint="#fbebd6",
                            desc="Free TDEE calculator: find your total daily energy expenditure (maintenance calories) from your age, sex, weight, height and activity, then see the calories to lose, maintain or gain weight, with a what-if slider and week-by-week projection.",
                            src="bmr-calculator", content="content-tdee.html", js_path="bmr-calculator/js/bmr-calculator.js", js_v="2"),
    # Body Fat Calculator (2026-10-14): U.S. Navy tape method + Deurenberg BMI estimate, ACE categories, fat / lean split, goal slider (lean mass held), hands the % to the BMR calculator.
    # lib.js = maths (tests: tool_apps_src/body-fat-calculator-tests.js). Keeps ads; share links are plain query strings.
    "body-fat-calculator": dict(title="Body Fat Calculator", page_title="Body Fat Calculator: U.S. Navy Method and BMI Estimate",
                                tag="Estimate your body fat percentage with a tape measure.", accent="#5b21b6", dark="#43188a", tint="#ede7fb",
                                desc="Free body fat calculator: estimate your body fat percentage with the U.S. Navy tape-measure method (neck, waist, hips) or the BMI method. See your category, fat and lean mass, set a body-fat goal, and send the result to the BMR calculator.",
                                js_v="1"),
    # Macro Calculator (2026-10-14): BMR (lib_from the BMR calculator) -> TDEE -> goal calories -> protein / carbs / fat grams by preset split or custom sliders, donut, per-meal table, protein g/kg check.
    # lib.js = MC (tests: tool_apps_src/macro-calculator-tests.js). Keeps ads; share links are plain query strings.
    "macro-calculator": dict(title="Macro Calculator", page_title="Macro Calculator: Daily Protein, Carbs and Fat for Your Goal",
                             tag="Protein, carbs and fat for your goal.", accent="#1f6a2f", dark="#154d21", tint="#e0f1e3",
                             desc="Free macro calculator: get your daily calories and grams of protein, carbs and fat for losing, maintaining or gaining weight. Pick a balanced, high-protein, low-carb or keto split or set your own, see it per meal, and check your protein per kg.",
                             js_v="1", lib_from=["bmr-calculator"]),
    # Ideal Weight Calculator (2026-10-14): Devine / Robinson / Miller / Hamwi + the healthy BMI band, range chart, ideal weight at every height. lib.js = IW (tests: tool_apps_src/ideal-weight-calculator-tests.js).
    "ideal-weight-calculator": dict(title="Ideal Weight Calculator", page_title="Ideal Weight Calculator: Devine, Robinson, Miller and Hamwi Formulas",
                                    tag="Four formulas and your healthy weight range.", accent="#0e7490", dark="#0a5668", tint="#dff1f6",
                                    desc="Free ideal weight calculator: enter your height and sex to see your ideal body weight by the Devine, Robinson, Miller and Hamwi formulas next to the healthy BMI range, with charts of where the formulas land and ideal weight at every height.",
                                    js_v="1"),
    # Water Intake Calculator (2026-10-14): 32 ml/kg + 12 ml/min of exercise + climate + pregnancy / breastfeeding, split bar, sip plan, a daily tracker (localStorage only) with a 14-day chart and streak. lib.js = WI (tests: tool_apps_src/water-intake-calculator-tests.js).
    "water-intake-calculator": dict(title="Water Intake Calculator", page_title="Water Intake Calculator: How Much Water Should I Drink a Day?",
                                    tag="Your daily water target, with a tracker.", accent="#0369a1", dark="#075985", tint="#e0f0fb",
                                    desc="Free water intake calculator: how much water to drink a day for your weight, exercise, climate, pregnancy or breastfeeding. See where the number comes from, get an hourly sip plan, and track today's drinks with a 14-day chart.",
                                    js_v="1"),
    # Heart Rate Zone / Waist-to-Hip Ratio / Running Pace / Protein Intake calculators (2026-10-14; lib.js tests: tool_apps_src/<slug>-tests.js). Keep ads; plain-query share links.
    "heart-rate-zone-calculator": dict(title="Heart Rate Zone Calculator", page_title="Heart Rate Zone Calculator: Max Heart Rate and Training Zones",
                                    tag="Your max heart rate and five training zones.", accent="#d9453b", dark="#a8332b", tint="#fbe4e1",
                                    desc="Free heart rate zone calculator: find your maximum heart rate (Tanaka, Fox, Gellish, HUNT or your own tested max) and your five training zones, with the Karvonen method if you know your resting heart rate. Zone chart, pulse counter and zones by age.",
                                    js_v="1"),
    "waist-to-hip-ratio-calculator": dict(title="Waist-to-Hip Ratio Calculator", page_title="Waist-to-Hip Ratio Calculator: WHR, Waist-to-Height and Body Shape",
                                       tag="Waist-to-hip, waist-to-height and body shape.", accent="#7c3a8a", dark="#5d2a69", tint="#f0e4f3",
                                       desc="Free waist-to-hip ratio calculator with WHO risk levels, plus waist-to-height ratio and waist size, apple or pear shape, gauges, and a what-if slider showing how a smaller waist changes your numbers.",
                                       js_v="1"),
    "pace-calculator": dict(title="Running Pace Calculator", page_title="Running Pace Calculator: Pace, Time, Distance, Splits and Race Predictor",
                         tag="Pace, time, distance and race splits.", accent="#0f7a5a", dark="#0a5b43", tint="#dcf2ea",
                         desc="Free running pace calculator: enter any two of distance, time and pace to get the third. Get km and mile paces, even, negative or positive splits with a chart, Riegel race time predictions for 5K to marathon, and treadmill speeds.",
                         js_v="1"),
    "protein-intake-calculator": dict(title="Protein Intake Calculator", page_title="Protein Intake Calculator: How Much Protein Per Day?",
                                   tag="How much protein you need a day.", accent="#a8452b", dark="#82331f", tint="#f7e3dc",
                                   desc="Free protein intake calculator: how many grams of protein per day for your weight and goal (muscle, fat loss, endurance, over 65, pregnancy). See your range against every goal, a per-meal spread, and build your day from common foods.",
                                   js_v="1"),
    # Calories Burned (MET compendium, 85 activities, activity builder with weekly total + 150-minute guideline bar) and Sleep Calculator (90-minute cycles, hypnogram, evening plan, naps, weekly sleep debt). 2026-10-14; tests: tool_apps_src/<slug>-tests.js.
    "calories-burned-calculator": dict(title="Calories Burned Calculator", page_title="Calories Burned Calculator: Walking, Running, Gym and 80+ Activities",
                                       tag="Calories burned by activity, per session and per week.", accent="#c2410c", dark="#8f2f08", tint="#fbe6d8",
                                       desc="Free calories burned calculator: pick from 80+ activities (walking, running, cycling, swimming, gym, sports, housework) and see calories burned for your weight using MET values. Build a weekly plan, see the 150-minute guideline, and how long to burn any number of calories.",
                                       js_v="1"),
    "sleep-calculator": dict(title="Sleep Calculator", page_title="Sleep Calculator: Best Bedtime and Wake-Up Time by Sleep Cycle",
                             tag="Wake up at the end of a sleep cycle.", accent="#3730a3", dark="#28237a", tint="#e6e5f8",
                             desc="Free sleep calculator: find the best bedtime for the time you need to wake up, or the best wake-up time if you go to bed now, using 90-minute sleep cycles. See your night's sleep stages, an evening plan, nap times and your weekly sleep debt.",
                             js_v="1"),
    # One-Rep Max, Body Surface Area and Pregnancy / Breastfeeding Calorie calculators (2026-10-15; tests: tool_apps_src/<slug>-tests.js). The pregnancy page builds on the BMR calculator's lib (lib_from).
    "one-rep-max-calculator": dict(title="One-Rep Max Calculator", page_title="One-Rep Max (1RM) Calculator: 7 Formulas, Rep Chart, Plates and Strength Level",
                                   tag="Estimate your 1RM and load the bar.", accent="#b91c1c", dark="#8f1414", tint="#fbe1e1",
                                   desc="Free one-rep max calculator: enter the weight and reps of a hard set to estimate your 1RM with seven formulas (Epley, Brzycki, Lander and more). Get a rep and percentage chart, training zones, a plate loader for the barbell, and your strength level for squat, bench, deadlift and overhead press.",
                                   js_v="1"),
    "body-surface-area-calculator": dict(title="Body Surface Area Calculator", page_title="Body Surface Area (BSA) Calculator: Mosteller, Du Bois, Haycock and More",
                                         tag="BSA by ten formulas, plus clinical helpers.", accent="#0f766e", dark="#0a5750", tint="#dcf2ef",
                                         desc="Free body surface area (BSA) calculator for adults and children with ten formulas: Mosteller, Du Bois, Haycock, Gehan and George, Boyd and more. See them side by side, how BSA changes with weight, and quick helpers for dose by BSA, cardiac index and GFR.",
                                         js_v="1"),
    # Volume, Area & Surface Area calculator (2026-10-18; tests: node tool_apps_src/shapes-calculator-tests.js): 12 flat shapes + 15 solids, units, litres / gallons / acres, work-it-backwards.
    "shapes-calculator": dict(title="Volume, Area & Surface Area Calculator", page_title="Volume, Area and Surface Area Calculator: Cylinder, Sphere, Cone, Box and More",
                              tag="Volume, area and surface area of 27 shapes.", accent="#0f6cbd", dark="#0a4f8c", tint="#dcebf8",
                              desc="Free volume, area, surface area and perimeter calculator for 27 shapes: cube, box, cylinder, cone, sphere, pyramid, torus, circle, triangle, trapezoid and more. Shows every formula, converts to litres, gallons and acres, and works backwards from a target volume.",
                              js_v="9"),
    # Geometry & Angle Lab (2026-10-18; tests: node tool_apps_src/geometry-tests.js): drag triangles (similar triangles, circles, Euler line), parallel lines + transversal, circle theorems, angle types and polygon angles.
    "geometry": dict(title="Geometry & Angle Lab", page_title="Geometry Angle Calculator and Simulator: Triangles, Parallel Lines, Circles and Polygons",
                     tag="Drag shapes and watch the angles update.", accent="#6d3fd1", dark="#522ca3", tint="#ece4fb",
                     desc="Free interactive geometry lab: drag triangle corners to see angles, sides, area and similar triangles; explore parallel lines and transversals (corresponding, alternate, co-interior angles); test circle theorems; classify any angle and find polygon angle sums.",
                     js_v="3"),
    # Trigonometry Calculator (2026-10-18; tests: node tool_apps_src/trigonometry-tests.js): unit circle, six functions + exact values + inverses, triangle solver (SSS/SAS/ASA/AAS/SSA ambiguous, right triangles), sinusoid graphs, tables and identity checker.
    "trigonometry": dict(title="Trigonometry Calculator", page_title="Trigonometry Calculator: Unit Circle, Sin Cos Tan, Triangle Solver and Graphs",
                         tag="Unit circle, triangles, graphs and tables.", accent="#c2410c", dark="#9a3412", tint="#fbe6da",
                         desc="Free trigonometry calculator and simulator: drag the unit circle, get sin, cos, tan, csc, sec and cot with exact values, solve any triangle (SSS, SAS, ASA, AAS and the ambiguous SSA case), graph sinusoids, build trig tables and check identities.",
                         js_v="11"),
    "pregnancy-calorie-calculator": dict(title="Pregnancy Calorie Calculator", page_title="Pregnancy and Breastfeeding Calorie Calculator: Extra Calories and Weight Gain",
                                         tag="How many calories you need, week by week.", accent="#be185d", dark="#8f1146", tint="#fbe1ee",
                                         desc="Free pregnancy and breastfeeding calorie calculator: how many extra calories you need by trimester or baby's age, healthy weight gain by week for your BMI (with twins), a chart to plot your own weight, foods for the extra calories, and key nutrients.",
                                         js_v="1", lib_from=["bmr-calculator"]),
    # PDF Editor (2026-10-15, mes.fm/pdf; /pdf-editor, /edit-pdf, /sign-pdf ... redirect): open / sign / fill / annotate / redact / edit text / rearrange pages, all in the browser (pdf.js 3.11.174 + pdf-lib 1.17.1 from cdnjs, loaded on first open).
    # lib.js = PDM (pure: viewport maths, text wrapping and grouping, hit tests, stroke simplifying, history; tests: tool_apps_src/pdf-editor-tests.js), js_parts = core (model, rendering, history) + tools + sign + export. Wide page, always-dark workspace like the Photo Editor.
    "pdf": dict(title="MES PDF Editor", page_title="Free PDF Editor: Sign, Fill, Annotate, Redact and Edit PDFs Online",
                tag="Sign, fill in, annotate and redact PDFs in your browser.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                desc="Free online PDF editor and signer: add a typed, drawn or uploaded signature, fill in forms, draw and highlight, add comments, edit text, black out private details, and rotate, delete or reorder pages. Private: your PDF never leaves your browser.",
                js_v="5", src="pdf-editor", tab=1, nav_extra=PDF_NAV_INFO, menu_extra=PDF_NAV_MENU, home="/pdf-tools", js_parts=["core.js", "tools.js", "form.js", "sign.js", "export.js"]),
    # PDF Tools family (2026-10-15): one script (tool_apps_src/pdf-tools/app.js, helpers lib.js = PT, tests tool_apps_src/pdf-tools-tests.js) and one content template; data-mode on #pt picks merge / split / organize / images / toimg / compress, vars.SEO = seo/<mode>.html. Same brand as the PDF editor (slug pdf). pdf.js + pdf-lib from cdnjs on first use; ZIPs use MESImg (lib_from image-converter).
    "merge-pdf": dict(title="Merge PDF", page_title="Merge PDF: Combine PDF Files Online for Free", tag="Combine PDFs into one file.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free online PDF merger: combine two or more PDF files into a single document, put them in any order, and pick which pages to use from each. Private: your files never leave your browser. No sign-up, no watermark.",
                    src="pdf-tools", js_path="merge-pdf/js/merge-pdf.js", js_v="1", lib_from=["image-converter"], vars={"MODE": "merge", "SEO": "@seo/merge.html"},
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools", tab=2,
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    "split-pdf": dict(title="Split PDF", page_title="Split PDF: Separate Pages or Extract a Page Range", tag="Split a PDF or extract pages.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free online PDF splitter: cut a PDF by page range, every N pages or into single pages, or extract just the pages you pick into a new PDF. Download the pieces separately or as a ZIP. Private, no upload, no watermark.",
                    src="pdf-tools", js_path="merge-pdf/js/merge-pdf.js", js_v="1", lib_from=["image-converter"], vars={"MODE": "split", "SEO": "@seo/split.html"},
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools", tab=3,
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    "organize-pdf": dict(title="Organize PDF", page_title="Rotate, Delete and Rearrange PDF Pages Online", tag="Rotate, delete and reorder pages.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free online PDF page organizer: see every page as a thumbnail, drag pages into a new order, rotate, delete, duplicate or add blank pages, and save the new PDF. Private: your file never leaves your browser.",
                    src="pdf-tools", js_path="merge-pdf/js/merge-pdf.js", js_v="1", lib_from=["image-converter"], vars={"MODE": "organize", "SEO": "@seo/organize.html"},
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools", tab=4,
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    "jpg-to-pdf": dict(title="JPG to PDF", page_title="JPG to PDF: Convert Images to a PDF Online", tag="Turn pictures into a PDF.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free JPG to PDF converter: turn JPG, PNG, WebP, GIF or BMP pictures into one PDF. Order and rotate the pictures, choose A4, Letter or same-size pages and a margin. Private: nothing is uploaded.",
                    src="pdf-tools", js_path="merge-pdf/js/merge-pdf.js", js_v="1", lib_from=["image-converter"], vars={"MODE": "images", "SEO": "@seo/images.html"},
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools", tab=5,
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    "pdf-to-jpg": dict(title="PDF to JPG", page_title="PDF to JPG: Convert PDF Pages to Images Online", tag="Save PDF pages as pictures.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free PDF to JPG converter: save every page of a PDF, or only the pages you choose, as JPG or PNG images at 72 to 300 dpi, singly or in one ZIP. Private: your PDF stays in your browser.",
                    src="pdf-tools", js_path="merge-pdf/js/merge-pdf.js", js_v="1", lib_from=["image-converter"], vars={"MODE": "toimg", "SEO": "@seo/toimg.html"},
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools", tab=6,
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    "compress-pdf": dict(title="Compress PDF", page_title="Compress PDF: Reduce PDF File Size Online", tag="Make a PDF smaller.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free online PDF compressor: shrink a large PDF to email or upload, with a light level that keeps text selectable and stronger levels that rebuild pages as pictures. See exactly how much smaller it gets. Private, no upload.",
                    src="pdf-tools", js_path="merge-pdf/js/merge-pdf.js", js_v="1", lib_from=["image-converter"], vars={"MODE": "compress", "SEO": "@seo/compress.html"},
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools", tab=7,
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    # Timer family (rewritten 2026-10-06): ONE script (tool_apps_src/timer/app.js) + one content template; each page sets which panels it shows (`vars.VIEWS`) and its own text (`vars.SEO` = seo/<slug>.html).
    # /timer shows countdown + stopwatch + alarm together by default (customizable: add Pomodoro / Interval / Date countdown, stacked or side by side, drag to reorder); the others are one big panel.
    # All use the Timer brand (logo, header, Home link) via `brand`; timer/img + timer/audio + the quote galleries stay in mes.fm/timer/. Tests: tool_apps_src/timer-tests.js.
    "timer": dict(meta_desc="Free online timer: countdown timer, stopwatch and alarm clock on one page, plus Pomodoro, interval and date countdowns. No sign-up.", share_img="timer/img/share.jpg",
                  title="Timer by MES", page_title="Timer", tag='Online timer, stopwatch, alarm clock and inspirational quotes!', accent="#a86706", dark="#7d4c04", tint="#fdf0dc",
                  desc='Free online timer: a countdown timer, stopwatch and alarm clock all on one page, plus Pomodoro, interval and date countdowns. Run several at once, auto-fitting side by side or stacked, drag to reorder, resize and fit to a small window, full screen, sounds you choose, time in your browser tab. No sign-up.', js_v="22",
                  vars={"VIEWS": 'cd,sw,al', "CUSTOMIZE": "1", "SEO": "@seo/timer.html"},
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "countdown-timer": dict(meta_desc="Free online countdown timer: type a time or tap a preset, run several labelled timers at once, go full screen and pick your alarm sound.", share_img="timer/img/share.jpg",
                  title="Countdown Timer", page_title='Online Countdown Timer', tag='Count down anything, as many as you like.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="22",
                  desc='Free online countdown timer: type a time or press a preset, run several labelled timers at once, add a minute, go full screen and see the time left in your browser tab. Sounds you choose, share links, no sign-up.', vars={"VIEWS": 'cd', "CUSTOMIZE": "0", "SEO": "@seo/countdown-timer.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=1,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "stopwatch": dict(meta_desc="Free online stopwatch with lap times to the hundredth of a second, fastest and slowest laps marked, full screen, and it keeps going on reload.", share_img="timer/img/share.jpg",
                  title="Stopwatch", page_title='Online Stopwatch', tag='A precise stopwatch with laps.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="22",
                  desc='Free online stopwatch with lap times: hundredths of a second, fastest and slowest laps marked, copy your laps, full screen, and it keeps counting if you reload the page or switch tabs. No sign-up.', vars={"VIEWS": 'sw', "CUSTOMIZE": "0", "SEO": "@seo/stopwatch.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=2,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "alarm-clock": dict(meta_desc="Free online alarm clock: set up to six labelled alarms, repeat daily, snooze and choose your sound. Rings in your browser. No sign-up.", share_img="timer/img/share.jpg",
                  title="Alarm Clock", page_title='Online Alarm Clock', tag='Set one or more alarms for any time of day.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="22",
                  desc='Free online alarm clock: set up to six alarms with labels, repeat daily, snooze, and choose your sound. Rings from your browser while the page is open. No sign-up.', vars={"VIEWS": 'al', "CUSTOMIZE": "0", "SEO": "@seo/alarm-clock.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=3,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "pomodoro-timer": dict(meta_desc="Free Pomodoro timer: 25-minute focus sessions with short and long breaks that start by themselves, adjustable lengths and a daily count.", share_img="timer/img/share.jpg",
                  title="Pomodoro Timer", page_title='Pomodoro Timer', tag='Focus in blocks, rest in between.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="22",
                  desc='Free Pomodoro timer: 25-minute focus sessions with short and long breaks that start automatically, a count of sessions finished today, adjustable lengths, the time in your browser tab and alerts. No sign-up.', vars={"VIEWS": 'po', "CUSTOMIZE": "0", "SEO": "@seo/pomodoro-timer.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=4,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "interval-timer": dict(meta_desc="Free interval timer for HIIT, Tabata and boxing: set work, rest and rounds, with a big WORK / REST display, beeps and a 3-2-1 countdown.", share_img="timer/img/share.jpg",
                  title="Interval Timer", page_title='Interval Timer for HIIT and Tabata', tag='Work, rest, repeat.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="22",
                  desc='Free interval timer for HIIT, Tabata, boxing and circuit workouts: set get-ready, work and rest times and rounds, big WORK and REST display, beep cues and a three-second countdown, full screen. No sign-up.', vars={"VIEWS": 'iv', "CUSTOMIZE": "0", "SEO": "@seo/interval-timer.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=5,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "countdown-to-date": dict(meta_desc="Free countdown to a date: the days, hours, minutes and seconds until Christmas, a birthday, wedding, exam or any event, ticking live.", share_img="timer/img/share.jpg",
                  title="Countdown to a Date", page_title='Countdown to a Date', tag='Days, hours, minutes and seconds until your date.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="22",
                  desc='Free countdown to a date: see the days, hours, minutes and seconds until Christmas, a birthday, wedding, exam, holiday or any event, ticking live. Save up to 12 events, full-screen display, share links.', vars={"VIEWS": 'ev', "CUSTOMIZE": "0", "SEO": "@seo/countdown-to-date.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=6,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    # Clock (new 2026-10-06, mes.fm/clock; companion of the Timer): big digital / analog / both clock for any time zone, colour themes (incl. a red night mode), full screen with wake lock, up to eight
    # world clocks. lib.js = Intl-based zone maths (tests: tool_apps_src/clock-tests.js). Placeholder PIL logos until Grok art.
    # Enigma machine (new 2026-10-06, mes.fm/enigma; aliases /enigma-machine /enigma-simulator /enigma-decoder): simulator of the Enigma I, M3 and M4 (rotors I-VIII, Beta, Gamma, reflectors A/B/C and thin B/C, rings, plugboard, double step),
    # encode / decode (reciprocal), lampboard, signal-path table, and a crib search (start positions, optionally every rotor order). lib.js = pure maths (node tests: tool_apps_src/enigma-tests.js; checked against py-enigma on 270 random configs).
    "enigma": dict(title="MES Enigma Machine", page_title="Enigma Machine Simulator",
                   tag="Encode, decode and break Enigma messages.", accent="#8a5a14", dark="#5f3d0c", tint="#f6ecd9",
                   desc="Free online Enigma machine simulator: Enigma I, M3 and M4 with every rotor, ring setting, reflector and plugboard. Encode and decode messages, watch the signal path light the lamps, and use the crib search to find the settings of a coded message.",
                   js_v="1"),
    "clock": dict(title="Clock by MES", page_title="Online Clock",
                  tag="A big, clean clock for any time zone.", accent="#2563a8", dark="#1c4a80", tint="#e3eefb",
                  desc="Free online clock: a big digital, analog or both clock for your location or any city, 12 or 24 hour, with colour themes including a red night mode, a full-screen display that keeps your screen awake, and world clocks for up to eight cities.",
                  js_v="3",
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer'>Timer</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li>",
                  menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer\">Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li>"),
    # Reminder (new 2026-10-21, mes.fm/reminder; aliases /remind /remindme /reminders /notify): share link for a livestream / event (the whole event is in the query string,
    # nothing stored on a server): countdown in the viewer's zone, Google / .ics (with alarms, weekly events keep the host's TZID) / Outlook.com buttons, and in-browser alerts
    # (notification + chime while a tab is open). lib.js = RM on top of the Clock's CK (lib_from); tests: tool_apps_src/reminder-tests.js. PIL placeholder logos until Grok art.
    # MES Translate + Image to Text (new 2026-10-24, mes.fm/translate and mes.fm/image-to-text; one source tool_apps_src/translate, one served script translate/js/translate.js;
    # data-mode on #tr: "translate" = text first, "ocr" = picture first). Engines: the browser's on-device Translator / LanguageDetector APIs (Chrome 138+), else MyMemory (online, keyless).
    # OCR = Tesseract.js 6.0.1 (jsDelivr) in the browser, PDFs via pdf.js 3.11.174. lib.js = MESTr (tests: node tool_apps_src/translate-tests.js). PIL placeholder logos until Grok art.
    "translate": dict(title="MES Translate", page_title="Translate Text and Pictures",
                      tag="Translate text, photos and PDFs, on your device when it can.", accent="#0b7285", dark="#085563", tint="#e0f3f6",
                      desc="Free translator for text, photos, screenshots and PDFs in about 85 languages. Chrome and Edge translate on your own device, so nothing is sent anywhere; other browsers use a free online service. Reads the text in pictures right in your browser.",
                      meta_desc="Free translator for text, photos and PDFs in 85 languages. Chrome and Edge translate on your device; pictures are read in your browser, never uploaded.",
                      js_v="4", vars={"MODE": "translate", "SEO": "@seo/translate.html"},
                      nav_extra=TR_NAV_INFO, menu_extra=TR_NAV_MENU),
    "image-to-text": dict(title="Image to Text (OCR)", page_title="Image to Text: Free OCR in Your Browser",
                          tag="Copy the text out of photos, screenshots and PDFs.", accent="#0b7285", dark="#085563", tint="#e0f3f6", src="translate", js_path="translate/js/translate.js",
                          desc="Free image to text converter (OCR): drop a photo, screenshot, scan or PDF and copy its text, in about 80 languages. The picture is read right in your browser and never uploaded. Fix the text, save it as .txt or translate it.",
                          meta_desc="Free image to text (OCR): copy the text from photos, screenshots and scanned PDFs in 80 languages. Runs in your browser, nothing is uploaded.",
                          js_v="4", vars={"MODE": "ocr", "SEO": "@seo/image-to-text.html"}, brand=TR_BRAND, tab=1, share_img="image-to-text/img/logo-big.png",
                          nav_extra=TR_NAV_INFO, menu_extra=TR_NAV_MENU),
    # MES Pronounce (new 2026-10-26, mes.fm/pronounce; aliases /pronunciation /how-to-pronounce /syllables /ipa ...): hear words and sentences in the device's accents,
    # syllables + stress + IPA + respelling from the CMU Pronouncing Dictionary (shards in mes.fm/pronounce/data/, build_pronounce_data.py), UK forms by hand,
    # recordings via dictionaryapi.dev (Wikimedia Commons). lib.js = MESPron (tests: node tool_apps_src/pronounce-tests.js) + the Speed Reader's SRLib (voices).
    "pronounce": dict(title="MES Pronounce", page_title="How to Pronounce: Hear Words, Syllables and IPA",
                      tag="Hear any word in different accents, with syllables, stress and IPA.", accent="#9d174d", dark="#6f1037", tint="#fbe7f0",
                      desc="Free pronunciation tool: type a word or sentence and hear it in US, UK, Australian, Indian, Irish and other accents. See its syllables with the stressed one bigger, IPA, an easy respelling, US and UK forms, real recordings, slow syllable-by-syllable playback and practice with your microphone.",
                      meta_desc="Hear how to pronounce any word in US, UK, Australian and other accents, with syllables, stress, IPA, an easy respelling and slow playback.",
                      js_v="1", lib_from=["speedreader"], pre_js=["/main_js/voice-picker.js?v=1"]),
    "reminder": dict(title="Event Reminder", page_title="Livestream and Event Reminder",
                     tag="One link: a countdown and a calendar reminder in everyone's time zone.", accent="#b4235a", dark="#86183f", tint="#fbe6ee",
                     desc="Free event reminder link: make one link for a livestream, class or meeting and share it. Everyone who opens it sees a countdown and the time in their own time zone, and can add it to Google Calendar, Apple Calendar, Outlook or their phone with alerts, or get a browser notification.",
                     js_v="11", lib_from=["clock"],
                     nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer'>Timer</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/calendar'>Calendar</a></li>",
                     menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer\">Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/calendar\">Calendar</a></li>"),
    # Famous Birthdays (new 2026-10-21, mes.fm/birthday; aliases /birthdays /celebrity-birthdays /famous-birthdays /born-today ...): who shares your birthday, born today,
    # name search, filters (field / country / era / living), same date + same year + nearest. Data = mes.fm/birthday/data/MM.json + index.json from Wikidata (CC0),
    # written by build_birthdays.py (+ birthday_extras.json). lib.js = BD (helpers + loader; tests tool_apps_src/birthday-tests.js); Sun sign / Chinese animal from the
    # zodiac page's ZD (lib_from) on Astronomy Engine (pre_js). Bump nothing by hand: build_birthdays.py --apply updates BD's DATA_V cache-buster.
    "birthday": dict(title="MES Famous Birthdays", page_title="Famous Birthdays: Who Shares Your Birthday?",
                     tag="Who was born on your day?", accent="#b45309", dark="#8a3f06", tint="#fdf0e1",
                     desc="Free famous birthdays finder: see which celebrities, scientists, athletes, musicians and leaders were born today or on your birthday, who shares your exact birth date and year, with their zodiac signs. Search 10,000 famous people by name.",
                     js_v="4", pre_js=["/moon/js/astronomy.browser.min.js"], lib_from=["clock", "zodiac", "birthday-personality"],
                     nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/zodiac'>Zodiac</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/calendar'>Calendar</a></li>",
                     menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/zodiac\">Zodiac &amp; Birth Chart</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/calendar\">Calendar</a></li>"),
    # Zodiac & Birth Chart (new 2026-10-21, mes.fm/zodiac; aliases /birth-chart /natal-chart /horoscope /star-sign ...): Sun / Moon / rising sign, planets in signs + retrograde,
    # whole-sign or equal houses, Moon phase, Chinese zodiac by Lunar New Year, SVG wheel, famous people with your day / Sun sign, compare with a celebrity.
    # lib.js = ZD (tropical, Astronomy Engine; tests tool_apps_src/zodiac-tests.js); people from the birthday data via BD (lib_from).
    "zodiac": dict(title="MES Zodiac & Birth Chart", page_title="Zodiac Sign and Birth Chart Calculator",
                   tag="Sun, Moon and rising sign, for fun.", accent="#6b3fa0", dark="#4e2c78", tint="#efe8f8",
                   desc="Free birth chart calculator: find your Sun sign, Moon sign and rising sign, where the planets were when you were born, the Moon phase and your Chinese zodiac animal, with a chart wheel. Compare your signs with famous people born on your day.",
                   js_v="3", pre_js=["/moon/js/astronomy.browser.min.js"], lib_from=["clock", "birthday", "birthday-personality"],
                   nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/birthday'>Birthdays</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/moon'>Moon</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/solar-system-today'>Solar System</a></li>",
                   menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/birthday\">Famous Birthdays</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/moon\">Moon</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/solar-system-today\">Solar System Today</a></li>"),
    # Short Links (new 2026-10-06, mes.fm/go; aliases /redirects /short-links /shortlinks /urls): every redirect of vercel.json, categorized + searchable + a helper that writes the next line.
    # Data = mes.fm/go/redirects.json written by build_redirects_index.py (only `redirects`, never the private finance `rewrites`); notes in mes.fm/go/notes.json. Wide, ad-free, like Site Index.
    # Browser: recommended browser extensions / apps (moved from the "Recommended Browser Extensions" list of mes.fm/links). Static list, no app logic. Ad-free like /go.
    "browser": dict(tools_extra=EXT_TAB, title="MES Browser Extensions", page_title="Browser Extensions",
                    tag="Recommended browser extensions and apps.", accent="#2563a8", dark="#1a4a80", tint="#e3edf8",
                    desc="Recommended free browser extensions for Chrome, Brave and Edge: the MES Video Speed Controller, a volume booster, text to speech (read aloud) and a web page archiver, plus an Android reader app.",
                    js_v="2"),
    # Video Speed Controller: download + install page of MES's own browser extension (source in mes.fm/videospeed/extension/, zipped by
    # build_video_speed_extension.py; tests node tool_apps_src/videospeed-tests.js). app.js only fills in the version from the extension's manifest.
    "videospeed": dict(tools_extra=EXT_TAB, title="MES Video Speed Controller", page_title="Video Speed Controller",
                       tag="Play any video faster or slower.", accent="#d9480f", dark="#a8360a", tint="#fdece3",
                       desc="Free MES Video Speed Controller browser extension for Chrome, Brave and Edge: speed up or slow down any HTML5 video from 0.1x to 16x with keyboard shortcuts or an on-video control. Private, no tracking, with install steps.",
                       js_v="2"),
    # Read Aloud: download + install page of MES's own text-to-speech browser extension with on-page word highlighting (source in
    # mes.fm/read-aloud/extension/, zipped by build_read_aloud_extension.py, which also copies the Speed Reader's lib.js into it as srlib.js;
    # tests node tool_apps_src/read-aloud-tests.js). app.js only fills in the version from the extension's manifest.
    "read-aloud": dict(tools_extra=EXT_TAB, title="MES Read Aloud", page_title="Read Aloud",
                       tag="Listen to any page with the words highlighted.", accent="#15803d", dark="#105f2c", tint="#e3f4ea",
                       desc="Free MES Read Aloud browser extension for Chrome, Brave and Edge: reads any web page or selected text aloud and highlights the word and sentence being read, right on the page. Private, no tracking, setups for different voices and speeds.",
                       js_v="3"),
    # Dark Mode: download + install page of MES's own dark / light mode browser extension (source in mes.fm/dark-mode/extension/, zipped by
    # build_dark_mode_extension.py; tests node tool_apps_src/dark-mode-tests.js). app.js only fills in the version from the extension's manifest.
    "dark-mode": dict(tools_extra=EXT_TAB, title="MES Dark Mode", page_title="Dark Mode",
                      tag="Dark mode (or light mode) for any website.", accent="#4338ca", dark="#312e81", tint="#e9e8fb",
                      desc="Free MES Dark Mode browser extension for Chrome, Brave and Edge: dark mode for any website, or light mode for dark ones, with per-site control, a schedule, setups and brightness, sepia and contrast tweaks. Private, no tracking.",
                      js_v="3"),
    # Volume Booster / Text Size: download + install pages of MES's own browser extensions (sources in mes.fm/<slug>/extension/, zipped by
    # build_<name>_extension.py; tests node tool_apps_src/<name>-tests.js). app.js only fills in the version from the extension's manifest.
    "volume-booster": dict(tools_extra=EXT_TAB, title="MES Volume Booster", page_title="Volume Booster",
                           tag="Make quiet videos louder, up to 600%.", accent="#b45309", dark="#7c3a06", tint="#fdf0e1",
                           desc="Free MES Volume Booster browser extension for Chrome, Brave and Edge: make quiet videos (YouTube and more) louder than the site allows, up to 600%, with a soft limiter, presets, keyboard shortcuts and per-site memory. Private, no tracking.",
                           js_v="2"),
    "text-size": dict(tools_extra=EXT_TAB, title="MES Text Size", page_title="Text Size",
                      tag="Bigger or smaller text on any website.", accent="#0e7490", dark="#0b5568", tint="#e3f4f8",
                      desc="Free MES Text Size browser extension for Chrome, Brave and Edge: A- and A+ for any website, changing only the text (not pictures or layout), remembered per site, from 50% to 300%. Private, no tracking.",
                      js_v="2"),
    # Contact page (mes.fm/contact = contact.html, rebuilt 2026-10-25 from the 2016 classic page). The Zotabox form (embed in content.html,
    # widget zbwid-4d9973a2) still delivers the mail; /main_js/contact-prefill.js fills it from ?name=&email=&subject=&message= (used by the
    # rating row, the Android tester banners and the homepage suggestion link: keep that contract) and exposes window.MESContactFill for the
    # topic buttons. Assets live in contact-page/ (js_path, logo_from) so no contact/ folder sits beside contact.html. Ad-free, no sidebar.
    "contact": dict(title="Contact MES", page_title="Contact Us",
                    tag="Questions, ideas and corrections: we read everything.", accent="#1a5fb4", dark="#134a8e", tint="#e6effa",
                    desc="Contact Math Easy Solutions (MES.fm) with questions, feedback, corrections or ideas for new math videos, calculators and tools.",
                    meta_desc="Contact Math Easy Solutions (MES.fm) with questions, feedback, corrections or ideas for new math videos, calculators and tools. We read every message.",
                    js_v="1", no_ads=True, url="contact", out="contact.html", js_path="contact-page/js/contact.js", logo_from="contact-page", no_comments=True, home="/", tab=3),
    "go": dict(title="MES Short Links", page_title="Short Links",
               tag="Every mes.fm short link, searchable.", accent="#0e8a6a", dark="#0a6650", tint="#e0f4ee",
               desc="Every MES short link in one searchable list: mes.fm/pomodoro, mes.fm/physics-playlist and more. Filter by category or topic, copy any short link, and get the line for a new one.",
               js_v="1", no_ads=True),
    # Site Index: a page inventory + template audit of the whole of mes.fm. Data = mes.fm/site-index/pages.json written by build_site_index.py (fetched lazily by app.js);
    # app.js = dashboard, filterable / sortable table, group-by, URL tree, template gallery, CSV / Markdown export; tests: tool_apps_src/site-index-tests.py. Wide page, no sidebar, ad-free (an internal audit page).
    "site-index": dict(title="MES Site Index", page_title="Site Index",
                       tag="Every page on mes.fm, by template.", accent="#1d6fa5", dark="#14507a", tint="#e3f0f8",
                       desc="Complete index of every page on mes.fm, classified by the template, shell and generator it uses, with feature flags and an audit of missing descriptions, share images, canonical tags and broken references. Search, filter, group, browse the URL tree and export to CSV.",
                       js_v="2", no_ads=True),
    # MES Ads: private money page (mes.fm/ads, behind the middleware.js password like /portfolio, noindex, no card anywhere): AdSense earnings vs
    # Google Ads spend per day / page / country / device / campaign + the "do ad visitors come back?" table (moved from /stats). Data = /api/earnings
    # (pushed daily by google-ads/ads-dashboard-gads-script.js and ads-dashboard-adsense-script.js) + /api/ads-returns. Script and logos live under
    # /earnings/ (js_path, logo_from): ad blockers block anything under /ads/. Wide, ad-free, no sidebar. Tests: tool_apps_src/earnings-tests.js.
    "ads": dict(title="MES Ads", page_title="Ads: Earnings vs Spend",
                tag="AdSense earnings vs Google Ads spend.", accent="#2e7d32", dark="#1b5e20", tint="#e8f5e9",
                desc="AdSense earnings against Google Ads spend per day, landing page, country, device and campaign, and whether ad visitors come back.",
                js_v="11", no_ads=True, js_path="earnings/js/earnings.js", logo_from="earnings",
                head_extra='<meta name="robots" content="noindex, nofollow">' + PAGE3_HEAD),
    # MES Search Console (private, mes.fm/search-console, behind the middleware.js password like /ads): Google Search Console
    # (pushed by google-ads/search-console-gsc-script.js -> api/search-console-ingest.js) + Bing Webmaster API (env BING_WEBMASTER_KEY),
    # read through api/search-console.js. AI search panel = console exports imported in the browser (lib.js = MESSCAI) -> api/search-console-ai.js.
    # Wide, ad-free, no sidebar, noindex. Tests: tool_apps_src/search-console-tests.js.
    "search-console": dict(title="MES Search Console", page_title="Search Console: Google and Bing Search Performance",
                tag="Google and Bing search clicks, impressions and positions.", accent="#1a73e8", dark="#1557b0", tint="#e8f0fe",
                desc="Private dashboard: Google Search Console and Bing Webmaster clicks, impressions, CTR and average position for mes.fm, by day, query, page, country and device.",
                js_v="4", no_ads=True,
                head_extra='<meta name="robots" content="noindex, nofollow">' + PAGE3_HEAD),
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
    "pdf-tools": dict(title="PDF Tools", page_title="Free PDF Tools: Edit, Merge, Split, Compress and Convert", tag="Free, private PDF tools.", accent="#d9363e", dark="#a82a31", tint="#fbe3e4",
                    desc="Free online PDF tools that run in your browser: edit and sign, merge, split, organize pages, compress, and convert PDFs to images and images to PDF. Private: files are never uploaded. No sign-up, no watermark.",
                    src="pdf-tools-hub", js_v="1",
                    brand=dict(slug="pdf", title="MES PDF Tools", tag="Edit, sign, merge, split and convert PDFs in your browser."), home="/pdf-tools",
                    nav_extra=PDF_NAV_INFO,
                    menu_extra=PDF_NAV_MENU),
    # MES Favourites: personal groups of page tiles (drag / copy / rename / fold), stored in localStorage, moved between devices by a link that contains the list.
    # Wide + ad-free like the Site Index; the page index and search engine come from /main_js/site-search.js (pre_js).
    "fav": dict(title="MES Favourites", page_title="MES Favourites: Your Own Calculators and Tools Page",
                tag="Your favourite MES pages, your way.", accent="#a15c07", dark="#7a4505", tint="#fdf0d8",
                desc="Make your own start page of favourite mes.fm calculators, tools and tutorials: search to add, drag tiles into groups you name and fold, and take the whole list to another browser or computer with one link. Private: it stays in your browser.",
                js_v="4", pre_js=["/main_js/site-search.js?v=1"], no_ads=True),
    # MES Ratings (mes.fm/ratings): results of the "Rate this page" stars every public page carries (main_js/rating.js, loaded lazily by
    # site-search.js; votes = /api/rating, Upstash): Top rated (Bayesian average), Most rated, Recently rated, section chips, and a feedback box
    # that only sends by email / the contact form. Local preview falls back to ratings/data/sample.json. Wide, ad-free, no sidebar.
    # Tests: node tool_apps_src/rating-api-tests.js.
    "ratings": dict(title="MES Ratings", page_title="MES Ratings: Top Rated Pages and Feedback",
                tag="Top rated pages, by the people who use them.", accent="#b45309", dark="#8a3f07", tint="#fdf0dd",
                desc="The top rated, most rated and recently rated mes.fm calculators, tools and tutorials, from the Rate this page stars at the bottom of every page. Fair Bayesian ranking, filter by section, and send us feedback through the contact form.",
                js_v="1", no_ads=True),
    # MES Compressor: pictures (canvas re-encode, target size), PDFs (embedded JPEGs re-saved smaller with pdf-lib; Extreme = rasterise) and audio (decode -> MP3 with lamejs), all in the browser.
    # Decisions in lib.js (MESCmp, node tests tool_apps_src/compress-tests.js); /compress-pdf stays as the PDF-specific landing page. Video is not supported yet.
    # MES Word Viewer (2026-10-26, mes.fm/docx): .docx files as tabs, page layout view (docx-preview 0.4.1 in a shadow root), outline / find / info / comments / pictures, print / save as PDF,
    # Edit = mammoth 1.13.0 -> contentEditable, saved as a new .docx by lib.js (MESDocx.toDocxParts; node tests tool_apps_src/docx-tests.js). Nothing is uploaded.
    "docx": dict(title="MES Word Viewer", page_title="DOCX Viewer and Editor: Open Word Documents Online, No Upload",
                 tag="Open, read and edit Word documents in your browser.", accent="#2b579a", dark="#1e3f73", tint="#e3ebf7",
                 desc="Free online DOCX viewer and editor: open Word documents in your browser with the real page layout, zoom, outline, search, word count, comments and tracked changes. Print or save as PDF, edit the text and download a new .docx, or save as HTML, Markdown or text. Private: nothing is uploaded.",
                 meta_desc="Free DOCX viewer and editor: open Word files with the real page layout, search, word count and comments, edit, then save as .docx, PDF, HTML or text. No upload.",
                 js_v="1"),
    "compress": dict(title="MES Compressor", page_title="Compressor: Compress Images, PDFs and Audio Online",
                       tag="Make pictures, PDFs and audio smaller.", accent="#4338ca", dark="#3730a3", tint="#e8e9fb",
                       desc="Free online compressor for pictures, PDFs and audio: shrink JPG, PNG and WebP to a quality or file size you choose, make PDFs smaller while keeping text selectable, and save audio as smaller MP3s. Before and after preview, ZIP download. Private: nothing is uploaded.",
                       js_v="1", lib_from=["image-converter"]),
    # MES Video Compressor (2026-10-18): WebCodecs fast path (mp4box.js demux, VideoDecoder -> VideoEncoder, mp4-muxer / webm-muxer, optional File System Access streaming to disk),
    # real-time canvas + MediaRecorder fallback. Decisions in lib.js (MESVid, node tests tool_apps_src/compress-video-tests.js).
    # 2026-10-20: "Choose a quality" = constant quality (per-frame H.264 quantizer, size measured on a short probe of each video), 10 s key frames.
    "compress-video": dict(title="MES Video Compressor", page_title="Video Compressor: Make Videos Smaller Online, No Upload",
                       tag="Make videos smaller, privately.", accent="#0f766e", dark="#115e59", tint="#dcf5f1",
                       desc="Free online video compressor: shrink MP4 and MOV videos to a file size you choose (say 25 MB for email or chat) or a quality, lower the resolution and frame rate, and save as MP4 or WebM. Fast with your computer's own video encoder, a queue for several files, and nothing is uploaded.",
                       js_v="3"),
    # MES Font Preview and Finder (2026-10-19): text in every font the browser really has (+ optional Google Fonts), effects, PNG / CSS export, compare, and a picture matcher. lib.js = MESFont (node tests tool_apps_src/fonts-tests.js).
    "fonts": dict(title="MES Font Preview and Finder", page_title="Font Preview: See Your Text in Every Font, and Find a Font from a Picture",
                  tag="See your text in every font.", accent="#7c2d92", dark="#5f2070", tint="#f3e5f8",
                  desc="Free online font previewer: type your text and see it in every font on your computer at once, with size, colour, shadow, outline, gradient and glow. Make marketing text, download a transparent PNG or copy the CSS, compare fonts side by side, and find a font from a picture. Private: nothing is uploaded.",
                  js_v="4"),
    # Machine-learning teaching tools (2026-10-19): matrix calculator (lib = MESMat), neural network playground (MESNN), letter / digit recognition (MESOCR, uses MESNN), toy language model (MESLM). Node tests: tool_apps_src/<slug>-tests.js
    "matrix-calculator": dict(title="MES Matrix Calculator", page_title="Matrix Calculator with Steps: Multiply, Inverse, Determinant, Eigenvalues, SVD and Machine Learning",
                  tag="Linear algebra with the working shown, plus machine-learning tools.", accent="#0369a1", dark="#075985", tint="#e0f2fe",
                  desc="Free matrix calculator with steps: type or paste matrices into a grid (from Excel, MATLAB, NumPy or LaTeX), then multiply, invert, find the determinant, rank, RREF, eigenvalues, SVD and QR, or solve A·x = b. Also softmax, activations, a dense layer and attention for machine learning.",
                  js_v="2"),
    "neural-network-playground": dict(title="MES Neural Network Playground", page_title="Neural Network Playground: Train a Network in Your Browser and Watch It Learn",
                  tag="Train a neural network and watch it learn.", accent="#c2410c", dark="#9a3412", tint="#ffedd5",
                  desc="Free neural network playground: choose a dataset, inputs, layers, neurons and activation, then train a real network in your browser and watch the decision boundary, the loss curve and what every hidden neuron has learned. Follow one point through the maths. Private: nothing is uploaded.",
                  js_v="1"),
    "letter-recognition": dict(title="MES Letter and Digit Recognition", page_title="Letter and Digit Recognition: Train a Neural Network and Test It by Drawing",
                  tag="Teach a network to read, then test it.", accent="#6d28d9", dark="#5b21b6", tint="#ede9fe", lib_from=["neural-network-playground"],
                  desc="Train a small neural network in your browser to recognise printed digits and letters, draw a character and see what it thinks with its confidence, look at what its hidden neurons do, test it on fonts it has never seen, and teach it your handwriting. Private: nothing is uploaded.",
                  js_v="1"),
    "llm-simulator": dict(title="MES Toy Language Model Simulator", page_title="How a Language Model Works: Tokens, Next-Word Prediction, Embeddings and Attention",
                  tag="See how a language model works, in miniature.", accent="#047857", dark="#065f46", tint="#d1fae5",
                  desc="A tiny language model you can poke: see text split into tokens (words, characters or BPE pieces), how a model scores the next word, what temperature, top-k and top-p do, how words become vectors, and how attention mixes words. Paste your own text. Private: nothing is uploaded.",
                  js_v="1"),
    # Redshift & Blueshift Simulator (2026-10-16): gravity (a pulse between a place near and far from a mass, drawn as a refractive-index gradient with two clocks), Doppler (relativistic
    # wavefronts), spectrum shifter / calculator (motion x gravity x expansion), expanding universe. lib.js = MESRed (node tests tool_apps_src/redshift-simulator-tests.js).
    "redshift-simulator": dict(title="MES Redshift & Blueshift Simulator", page_title="Redshift and Blueshift Simulator: Doppler, Gravitational and Cosmological",
                               tag="Why light changes colour.", accent="#be123c", dark="#9f1239", tint="#ffe4e8",
                               desc="Free redshift and blueshift simulator: watch light shift near and far from a heavy mass (gravitational redshift, clocks and refractive-index view), moving sources with relativistic Doppler wavefronts, a spectrum shifter that combines motion, gravity and cosmic expansion, and an expanding-universe calculator with lookback time and distance.",
                               js_v="6"),
    # Round 2026-10-23: SEO checker, birthday personality, random / dice, statistics, backgammon, poker (see CLAUDE.md for each).
    "seo": dict(title="MES SEO Checker", page_title="SEO Checker: Free On-Page SEO Audit for Any Page",
                tag="What search engines see on a page.", accent="#1d4ed8", dark="#1e3a8a", tint="#e0e9ff",
                desc="Free SEO checker: enter any web page and get a clear on-page SEO audit: title and meta description length, headings, canonical, robots, Open Graph and social cards, structured data, image alt text, links, mobile viewport, HTTPS, speed hints, plus a report of every mes.fm page.",
                js_v="1"),
    "birthday-personality": dict(title="MES Birthday Personality", page_title="What Your Birthday Says About You: Birthday Personality for Every Day",
                tag="A character sketch for every day of the year.", accent="#9d174d", dark="#831843", tint="#fde7f1",
                desc="Free birthday personality reader: pick your birthday and read a playful character sketch for that exact day, its archetype name, strengths, challenges, love and work style, lucky numbers and colours, plus famous people born that day. For fun, not prediction.",
                js_v="1"),
    "random-number-generator": dict(title="MES Random Number Generator", page_title="Random Number Generator, Dice Roller, Coin Flip and Picker",
                tag="Fair random numbers, dice, coins, cards and picks.", accent="#be185d", dark="#9d174d", tint="#fde4ef", src="random",
                desc="Free random number generator: pick numbers in any range with or without repeats, roll any dice (2d6, 4d6 drop lowest, d20 with advantage), flip coins, draw cards, shuffle or pick from a list, with history and statistics. Uses your browser's secure random generator.",
                nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/dice-roller'>Dice</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/statistics-calculator'>Statistics</a></li>",
                menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/dice-roller\">Dice Roller</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/statistics-calculator\">Statistics Calculator</a></li>",
                content="content.html", js_v="3", vars={"MODE": "numbers", "SEO": "@seo/numbers.html"}),
    "dice-roller": dict(title="MES Dice Roller", page_title="Dice Roller: Roll Any Dice Online (d4, d6, d20, 2d6+3)",
                tag="Roll any dice, see the odds.", accent="#be185d", dark="#9d174d", tint="#fde4ef", src="random", js_path="random-number-generator/js/random-number-generator.js",
                brand=dict(slug="random-number-generator", title="MES Random Number Generator", tag="Fair random numbers, dice, coins, cards and picks."), tab=1,
                desc="Free online dice roller: roll d4, d6, d8, d10, d12, d20 and d100 or type dice notation like 2d6+3, 4d6 drop lowest or d20 with advantage, see every roll, totals, the exact probability of each total and a chart of your rolls.",
                nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/dice-roller'>Dice</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/statistics-calculator'>Statistics</a></li>",
                menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/dice-roller\">Dice Roller</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/statistics-calculator\">Statistics Calculator</a></li>",
                content="content.html", js_v="3", vars={"MODE": "dice", "SEO": "@seo/dice.html"}),
    "statistics-calculator": dict(title="MES Statistics Calculator", page_title="Statistics Calculator: Mean, Median, Standard Deviation, Regression",
                tag="Paste numbers, get every statistic.", accent="#4f46e5", dark="#3730a3", tint="#e7e7fd",
                desc="Free statistics calculator: paste a list of numbers to get the mean, median, mode, standard deviation, variance, quartiles, box plot, histogram and z-scores, with the working shown; linear regression and correlation for x-y data, and normal, binomial and Poisson probabilities.",
                js_v="1"),
    "backgammon": dict(title="MES Backgammon", page_title="Backgammon: Play Free Online Against the Computer",
                tag="Play backgammon, learn the odds.", accent="#7c2d12", dark="#5c210d", tint="#fbeadf",
                desc="Play backgammon free in your browser against the computer at three levels, with legal-move hints, the doubling cube, undo, a pip count, the odds of every roll and your win / loss statistics kept on your device.",
                js_v="3"),
    "poker": dict(title="MES Poker", page_title="Texas Hold'em Poker: Play Free and Calculate Your Odds",
                tag="Play Hold'em, see your odds.", accent="#166534", dark="#14532d", tint="#dcf3e3",
                desc="Play Texas Hold'em poker free against computer players with play money, plus a poker odds calculator: your chance to win against random hands, outs, pot odds and hand rankings, and your session statistics kept on your device.",
                js_v="1"),

    # Round 2026-10-23 (b): everyday calculators. compound-interest + loan share tool_apps_src/money-growth/ (data-mode), the others are standalone.
    "compound-interest-calculator": dict(title="MES Compound Interest Calculator", page_title="Compound Interest Calculator with Monthly Deposits",
                tag="Watch money grow, year by year.", accent="#047857", dark="#065f46", tint="#d9f5ea", src="money-growth",
                desc="Free compound interest calculator: starting amount, monthly or yearly deposits, any interest rate and compounding, inflation and tax, with a year-by-year table and growth chart, the rule of 72, and how much to save to reach a goal.",
                nav_extra=CI_NAV_INFO, menu_extra=CI_NAV_MENU,
                content="content.html", js_v="2", vars={"MODE": "grow", "BODY": "@grow.html", "SEO": "@seo/grow.html"}),
    "loan-calculator": dict(title="MES Loan Calculator", page_title="Loan Calculator: Monthly Payment, Interest and Payoff Schedule",
                tag="Payments, interest and payoff date.", accent="#047857", dark="#065f46", tint="#d9f5ea", src="money-growth", js_path="compound-interest-calculator/js/compound-interest-calculator.js",
                tab=1,
                desc="Free loan calculator for car loans, personal loans and student loans: monthly payment, total interest, payoff date and full amortization schedule, extra payments, how much you can borrow, and the APR of a loan with fees.",
                nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/loan-calculator'>Loan</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/mortgagecalculator'>Mortgage</a></li>",
                menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/loan-calculator\">Loan Calculator</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/mortgagecalculator\">Mortgage Calculator</a></li>",
                content="content.html", js_v="2", vars={"MODE": "loan", "BODY": "@loan.html", "SEO": "@seo/loan.html"}),
    # Compound Interest Explained (2026-10-24): a derivation article, sub-page of the Compound Interest Calculator brand (like time-dilation-explained). Static content.html with
    # MathJax (.mes-tex via /main_js/mes-math.js) + small interactive figures in app.js (lib.js = CIX, tests: node tool_apps_src/compound-interest-explained-tests.js).
    "compound-interest-explained": dict(title="Compound Interest Explained", page_title="Compound Interest Explained: The Formula and Its Derivation",
                tag="Where A = P(1 + r/n)^(nt) comes from, step by step.", accent="#047857", dark="#065f46", tint="#d9f5ea",
                desc="Compound interest explained step by step: simple vs compound interest, deriving A = P(1 + r/n)^(nt), continuous compounding and e, APY, the future value of regular deposits, solving for time with logarithms, the rule of 72, real returns after inflation, worked examples and practice questions.",
                brand=dict(slug="compound-interest-calculator", title="MES Compound Interest Calculator", tag="Watch money grow, year by year."), tab=1,
                nav_extra=CI_NAV_INFO, menu_extra=CI_NAV_MENU, js_v="1"),
    "age-calculator": dict(title="MES Age Calculator", page_title="Age Calculator: Exact Age in Years, Months and Days",
                tag="How old, exactly?", accent="#b45309", dark="#8a3f06", tint="#fdf0e1",
                desc="Free age calculator: exact age in years, months and days from a date of birth, total months, weeks, days, hours and seconds lived, next birthday countdown, the weekday you were born, age on any date and the age difference between two people.",
                js_v="1", lib_from=["days-between-dates-calculator"]),
    "tip-calculator": dict(title="MES Tip Calculator", page_title="Tip Calculator and Bill Splitter",
                tag="Tip, tax and who pays what.", accent="#0e7490", dark="#155e75", tint="#dcf2f7",
                desc="Free tip calculator and bill splitter: tip by percent or amount, before or after tax, split evenly or by what each person ordered, round up to whole amounts, and tipping customs for the US, Canada, UK, Europe, Australia and more.",
                js_v="1"),
    "time-calculator": dict(title="MES Time Calculator", page_title="Time Calculator: Hours Between Times, Add and Subtract Time",
                tag="Hours and minutes, added up.", accent="#4338ca", dark="#3730a3", tint="#e6e6fb",
                desc="Free time calculator: the hours and minutes between two times (overnight shifts included), add and subtract hours, minutes and seconds, total a list of times like a timesheet with breaks, and convert to decimal hours for payroll.",
                js_v="1"),
    "fuel-cost-calculator": dict(title="MES Fuel Cost Calculator", page_title="Fuel Cost Calculator: Trip Gas Cost and Fuel Economy",
                tag="What will the trip cost?", accent="#b91c1c", dark="#991b1b", tint="#fde2e2",
                desc="Free fuel cost calculator: the gas cost of a trip from distance, fuel economy (L/100 km, mpg US or UK, km/L) and price per litre or gallon, round trips and cost per person, fuel economy from a fill-up, and an electric car comparison.",
                js_v="1"),

}


# ---------- BMI Calculator in other languages (2026-10-20) ----------
# One calculator, many languages: every page is built from tool_apps_src/bmicalculator/ (same lib.js / app.js, one served bmicalculator/js/bmicalculator.js);
# all UI strings + page meta live in tool_apps_src/bmicalculator/i18n.js (read here through node), the explanation / FAQ in seo/<code>.html.
# Each page: own URL, <html lang>, title, description, og:locale, canonical; hreflang links to every language (x-default = English) and a language menu above the calculator.
BMI_LANG_SLUGS = {"es": "calculadora-imc", "pt-BR": "calculadora-imc-pt", "id": "kalkulator-bmi", "fr": "calcul-imc", "de": "bmi-rechner",
                  "it": "calcolo-bmi", "tr": "vucut-kitle-indeksi", "vi": "tinh-chi-so-bmi", "pl": "kalkulator-bmi-pl",
                  "ar": "hasibat-kutlat-al-jism", "hi": "bmi-calculator-hindi"}


def _bmi_i18n():
    import subprocess
    out = subprocess.run(["node", "-e", "process.stdout.write(JSON.stringify(require(process.argv[1])))", str(SRC / "bmicalculator" / "i18n.js")],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def _bmi_pages():
    I = _bmi_i18n()
    tbl = I["table"]
    codes = ["en"] + list(BMI_LANG_SLUGS)
    url = lambda c: "https://mes.fm" + tbl[c]["path"]
    hreflang = "".join('<link rel="alternate" hreflang="%s" href="%s" />' % (c, url(c)) for c in codes) + '<link rel="alternate" hreflang="x-default" href="%s" />' % url("en")

    def switcher(code):
        T = tbl[code]
        items = "".join('<li><a href="%s" hreflang="%s" lang="%s"%s>%s</a></li>' % (tbl[c]["path"], c, c, ' aria-current="page"' if c == code else "", tbl[c]["name"]) for c in codes)
        return ('\t\t<nav class="bm-lang" aria-label="%s"><details><summary>&#127760; %s</summary><ul>%s</ul></details></nav>' % (T["langLabel"], T["name"], items))

    def strings(code):
        T, E = tbl[code], tbl["en"]
        return {k: (T.get(k) if isinstance(T.get(k), str) else E[k]) for k in E if isinstance(E[k], str)}
    base = APPS["bmicalculator"]
    base.update(i18n=strings("en"), head_extra=hreflang, vars={"SEO": "@seo/en.html", "LANGSW": switcher("en")})
    for code, slug in BMI_LANG_SLUGS.items():
        T = tbl[code]
        assert T["path"] == "/" + slug, (code, T["path"])
        m = T["meta"]
        APPS[slug] = dict(title=m["title"], page_title=m["h1"], tag=m["tag"], desc=m["desc"], accent=base["accent"], dark=base["dark"], tint=base["tint"],
                          js_v=base["js_v"], js_parts=base["js_parts"], src="bmicalculator", js_path="bmicalculator/js/bmicalculator.js", logo_from="bmicalculator",
                          lang=code, og_locale=m["ogLocale"], doc_title=m["docTitle"], i18n=strings(code),
                          head_extra=hreflang, vars={"SEO": "@seo/%s.html" % code, "LANGSW": switcher(code)})


_bmi_pages()
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
    d = SRC / cfg.get("src", slug)    # `src`: share another app's source folder (the Timer family: one script, several pages)
    css = (SRC / "_shared.css").read_text(encoding="utf-8")
    for extra in cfg.get("css_extra", []):    # shared CSS of a family of apps (e.g. _cas.css), before the app's own
        css += "\n" + (SRC / extra).read_text(encoding="utf-8")
    if (d / "app.css").exists():
        css += "\n" + (d / "app.css").read_text(encoding="utf-8")
    css = (css.replace("@@ACCENT_LIGHT@@", light_accent(cfg["accent"])).replace("@@ACCENT@@", cfg["accent"]).replace("@@ACCENT_DARK@@", cfg["dark"]).replace("@@TINT@@", cfg["tint"])
           .replace("var(--tint)", cfg["tint"]))
    content = (d / cfg.get("content", "content.html")).read_text(encoding="utf-8")
    for k, v in cfg.get("vars", {}).items():       # {{KEY}} placeholders in a shared content template; a value starting with "@" is a file in the source folder
        content = content.replace("{{%s}}" % k, (d / v[1:]).read_text(encoding="utf-8").strip("\n") if v.startswith("@") else v)
    if cfg.get("i18n") is not None:   # {{t:key}} = a UI string of the page's language (the BMI pages: tool_apps_src/bmicalculator/i18n.js)
        content = re.sub(r"\{\{t:(\w+)\}\}", lambda m: cfg["i18n"][m.group(1)], content)
        assert "{{" not in content, re.findall(r"\{\{[^}]*\}\}", content)[:3]
        content = re.sub(r'<option value="[a-z]+"></option>', "", content)    # an option whose label is empty in this language is not offered (the BMI India scale)
    desc = cfg["desc"]
    ldd = {"@context": "https://schema.org", "@type": "WebApplication", "name": cfg["title"],
           "url": "https://mes.fm/" + slug, "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": desc}
    if cfg.get("lang"):
        ldd["inLanguage"] = cfg["lang"]
    ld = json.dumps(ldd, ensure_ascii=False)
    scripts = "".join('<script src="%s" defer></script>' % u for u in cfg.get("pre_js", []))
    if slug in STAGE_CTL:             # the shared View bar (Small / Medium / Large, corner grip, Fill window) above the simulation boxes
        scripts += '<script src="/main_js/stage-ctl.js?v=2" defer></script>'
    jsrel = cfg.get("js_path", "%s/js/%s.js" % (slug, slug))       # where the page script is served from (js_path: a page that lives inside another site's folder)
    scripts += '<script src="/%s?v=%s" defer></script>' % (jsrel, cfg["js_v"])
    page = tpl
    for k, v in (("@@TOOL_CSS@@", css), ("@@CONTENT@@", content.strip("\n")), ("@@LDJSON@@", ld)):
        page = page.replace(k, v)
    if cfg.get("head_extra"):
        page = page.replace("</title>", "</title>" + cfg["head_extra"], 1)
    meta_desc = cfg.get("meta_desc", desc)   # meta_desc: a shorter text for <meta name=description> / og / twitter (Google shows ~920 px); the page and JSON-LD keep desc
    for k, v in {"@@SCRIPTS@@": scripts, "@@DESC@@": meta_desc.replace('"', "&quot;"), "@@TITLE@@": cfg["title"], "@@SLUG@@": slug,
                 "@@TAGLINE@@": cfg["tag"], "@@PAGE_TITLE@@": cfg["page_title"], "@@PAGE_DESC@@": desc,
                 "@@ACCENT@@": cfg["accent"], "@@ACCENT_DARK@@": cfg["dark"]}.items():
        page = page.replace(k, v)
    if cfg.get("lang"):               # a page in another language: <html lang>, og:locale
        page = page.replace('<html lang="en">', '<html lang="%s">' % cfg["lang"], 1)
        page = page.replace('<meta property="og:description"', '<meta property="og:locale" content="%s" />        <meta property="og:description"' % cfg.get("og_locale", cfg["lang"]), 1)
    if cfg.get("doc_title"):          # <title> / og:title / twitter:title other than "<title> | Math Easy Solutions"
        dt = cfg["doc_title"].replace('"', "&quot;")
        for old_t in ("<title>%s | Math Easy Solutions</title>" % cfg["title"], '<meta property="og:title" content="%s | Math Easy Solutions" />' % cfg["title"], '<meta name="twitter:title" content="%s">' % cfg["title"]):
            assert old_t in page, old_t
        page = page.replace("<title>%s | Math Easy Solutions</title>" % cfg["title"], "<title>%s</title>" % dt, 1)
        page = page.replace('<meta property="og:title" content="%s | Math Easy Solutions" />' % cfg["title"], '<meta property="og:title" content="%s" />' % dt, 1)
        page = page.replace('<meta name="twitter:title" content="%s">' % cfg["title"], '<meta name="twitter:title" content="%s">' % dt, 1)
    if cfg.get("logo_from"):          # the same brand's logo / favicon / share image, but this page's own name, links and Home
        page = page.replace("/%s/img/logo" % slug, "/%s/img/logo" % cfg["logo_from"])
    # these are calculators: the info bar reads Home | Calculators | Tools (cross-link both ways, see add_cross_links.py)
    tools_li = "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='https://mes.fm/tools.html'>Tools</a></li>"
    page = page.replace(tools_li, "<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='https://mes.fm/calculators'>Calculators</a></li>" + tools_li.replace("tools.html", "tools"))
    if cfg.get("tools_extra"):        # an extra info-bar tab right after Tools (Extensions on the browser-extension pages)
        tools_here = tools_li.replace("tools.html", "tools")
        assert tools_here in page
        page = page.replace(tools_here, tools_here + cfg["tools_extra"], 1)
    if cfg.get("no_ads"):             # ad-free page: drop the deferred AdSense loader + the Auto-ads placement guard (they sit between the GTM block and </head>)
        a = page.find("<!-- ADSENSE-DEFERRED")
        b = page.find("</head>")
        assert a > 0 and b > a, "ad block markers not found in tool_page_template.html"
        page = page[:a] + page[b:]
        assert "adsbygoogle" not in page and "googlesyndication" not in page
    if cfg.get("no_comments"):        # no Comments bar / FastComments box (e.g. the contact page)
        page, n = re.subn(r'<div id="comments-button"[^>]*>Comments</div>\s*<div id="comments-box" class="hide">\s*<div id="fastcomments-widget"></div>\s*</div>', "", page, count=1)
        assert n == 1, "comments block not found in tool_page_template.html"
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
    elif cfg.get("tab"):
        page = page.replace("current_tab:0", "current_tab:%d" % cfg["tab"], 1)
    if cfg.get("home"):               # Home points somewhere other than the site / brand page (the PDF family: the PDF Tools hub)
        hs = cfg.get("brand", {}).get("slug", slug)
        page = page.replace("href='/%s'>Home</a>" % hs, "href='%s'>Home</a>" % cfg["home"], 1)
        page = page.replace('class="navbar__link navbar__link--first" href="/%s">Home</a>' % hs, 'class="navbar__link navbar__link--first" href="%s">Home</a>' % cfg["home"], 1)
    if cfg.get("url"):                # the public path differs from the slug (e.g. weighted-average-calculator): canonical / og:url / JSON-LD
        for old_u in ('href="https://mes.fm/%s"' % slug, 'content="https://mes.fm/%s"' % slug, '"url": "https://mes.fm/%s"' % slug):
            page = page.replace(old_u, old_u.replace("/" + slug + '"', "/" + cfg["url"] + '"'))
    if cfg.get("share_img"):          # a 1200x630 share picture (site-relative path, e.g. "timer/img/share.jpg") instead of the square logo-big.png: og:image + size, twitter:image, summary_large_image
        from set_share_images import apply_share
        page = apply_share(page, "https://mes.fm/" + cfg["share_img"])
    js_dir = (SITE / jsrel).parent
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
    return page, js, SITE / jsrel


def main():
    tpl = TEMPLATE.read_text(encoding="utf-8")
    only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)   # --only=slug,slug rebuilds just those apps
    for slug, cfg in APPS.items():
        if only and slug not in only:
            continue
        p = SITE / cfg.get("out", slug + "/index.html")
        if (SRC / cfg.get("src", slug) / cfg.get("content", "content.html")).exists():
            new, js, jsp = build_from_source(slug, cfg, tpl)
            print("%-30s source mode -> %d bytes html, %d bytes js" % (slug, len(new), len(js)))
            if APPLY:
                p.parent.mkdir(parents=True, exist_ok=True)      # a new page folder (countdown-timer, stopwatch ...)
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
    if APPLY:       # keep the "Newest calculators / tools" strip (mes.fm/newest.json) current whenever a tool page is (re)built
        import subprocess
        subprocess.run([sys.executable, str(ROOT / "build_newest.py"), "--apply"], check=False)


if __name__ == "__main__":
    main()
