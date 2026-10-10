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
                          js_v="2"),
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
    # Atomic Clock Simulator: caesium clock loop (quartz locked to atoms), Ramsey fringes / fountain, clock race, Allan-deviation chart, drift calculator.
    # lib.js = physics + drift maths (node-tested: tool_apps_src/atomic-clock-simulator-tests.js), app.js = UI. Wide page, dark stages, own Theatre button, no sidebar.
    "atomic-clock-simulator": dict(title="MES Atomic Clock Simulator", page_title="Atomic Clock Simulator",
                            tag="How atoms keep time.", accent="#1e4fb3", dark="#173d8a", tint="#e4ecfa",
                            desc="Free atomic clock simulator: see how a caesium clock locks a quartz oscillator to atoms, tune Ramsey fringes in a fountain clock, race quartz against rubidium, caesium and optical clocks, compare their stability, and work out how far any clock drifts.",
                            js_v="1"),
    # Michelson-Morley Experiment Simulator: interferometer on a rotating table with live fringes, the aether-frame light-path picture, a noisy 16-point turntable run + fit, the historic experiments, and a fringe-shift calculator.
    # lib.js = exact arm-time / fringe maths (node-tested: tool_apps_src/michelson-morley-tests.js), app.js = UI. Wide page, dark stages, own Theatre button, no sidebar.
    "michelson-morley-experiment": dict(title="MES Michelson-Morley Experiment Simulator", page_title="Michelson-Morley Experiment Simulator",
                            tag="Did the Earth move through the aether?", accent="#047857", dark="#065f46", tint="#dcf5ea",
                            desc="Free Michelson-Morley experiment simulator: turn an interferometer through an aether wind and watch the fringes shift, see why the two light paths take different times, run a 16-point turntable measurement with noise, compare the 1881 and 1887 experiments, and calculate the expected fringe shift.",
                            js_v="1"),
    # Reynolds Number Calculator: Re from fluid, speed and size (any units), regime for the geometry, solve for speed / size, pipe friction, drag, shedding, boundary layer. lib.js node-tested.
    "reynolds-number-calculator": dict(title="MES Reynolds Number Calculator", page_title="Reynolds Number Calculator",
                            tag="Laminar or turbulent? Find out.", accent="#0e7490", dark="#155e75", tint="#e0f4f8",
                            desc="Free Reynolds number calculator: enter the fluid, speed and size in any units to get Re, whether the flow is laminar or turbulent, pipe friction and pressure drop, drag and vortex-shedding frequency. Or solve for the speed or size that gives a target Re.",
                            js_v="1"),
    # Photoelectric Effect Simulator: light on a metal, electrons, stopping voltage, I-V and KE-vs-f graphs, and a "measure h" lab. lib.js node-tested (tool_apps_src/photoelectric-effect-tests.js). Wide page, no sidebar.
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
                            js_v="3"),
    # Search Engines: type one search and open it in many engines (tabs, tiled windows or same tab); sets for censorship / SEO / privacy comparisons; own engines.
    # lib.js = engine table + URL builder (node-testable: tool_apps_src/search-engines-tests.js), app.js = UI. Wide page, no sidebar.
    "search-engines": dict(title="MES Search Engines", page_title="Search Engines",
                           tag="One search, every search engine.", accent="#c2410c", dark="#9a3412", tint="#fdeadf",
                           desc="Type your search once and open it in Google (.com, .ca, .co.uk and more), Bing, DuckDuckGo, Brave, Yandex and 60+ other search engines, AI assistants and video sites, in tabs or tiled windows. Compare results, check censorship and bias, and add your own engines.",
                           js_v="4"),
    # Mortgage Calculator 2.0 (rewritten 2026-10-03 from the 2013-2018 jQuery page): lib.js = exact-cents maths + the country rules tables (CMHC, minimum down payment, stress test, SDLT;
    # node-testable: tool_apps_src/mortgagecalculator-tests.js), app.js = UI. Keeps ads; old /mortgagecalculator/s/<id> links still resolve via /api/share?calc=mc.
    "mortgagecalculator": dict(title="Mortgage Calculator", page_title="Mortgage Calculator",
                               tag="Payments, affordability and amortization for the US, Canada and UK.", accent="#0e7490", dark="#0a5568", tint="#e0f2f7",
                               desc="Free mortgage calculator for the US, Canada, UK and Australia: monthly payment with taxes, insurance, PMI or CMHC premium, how much house you can afford, full amortization schedule and charts, extra payments, bi-weekly and accelerated payments, and side-by-side comparison.",
                               js_v="1"),
    # Grade Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page; old js/calculatorffaf.js deleted): lib.js = maths + share encoding (node-testable:
    # tool_apps_src/gradecalculator-tests.js), app.js = UI (saved courses, assignments, what-if). Keeps ads. Old /gradecalculator/s/<id> links resolve via /api/share?calc=gc.
    "gradecalculator": dict(title="Grade Calculator", page_title="Final Grade Calculator",
                            tag="What do you need on your final exam?", accent="#575fab", dark="#434a8a", tint="#e9eaf6",
                            desc="Free final grade calculator: find out what grade you need on your final exam to get the course grade you want. Enter your current grade or your assignments, save all your courses, try what-if scores and share your results to another device.",
                            js_v="3",
                            nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/weighted-average-calculator'>Weighted Average</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gradecalculator/memes'>Memes</a></li>",
                            menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/weighted-average-calculator\">Weighted Average</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/memes\">Memes</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/study-tips\">Study Tips</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/tutorial\">Tutorial</a></li>"),
    # Weighted Average Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page): lives at /weighted-average-calculator (the old URL is kept: ~2,300 views / 30 days) as a sub-page of the
    # Grade Calculator brand (brand + url + out + js_path options). lib.js = maths + share encoding (tests: tool_apps_src/weighted-average-tests.js), app.js = UI. Keeps ads.
    "weighted-average-calculator": dict(title="Weighted Average Calculator", page_title="Weighted Average Calculator",
                            tag="Average grades that count for different amounts.", accent="#575fab", dark="#434a8a", tint="#e9eaf6",
                            desc="Free weighted average calculator: enter grades with their weights, credits or percentages and get the weighted average, the plain average and a step-by-step table. Paste from a spreadsheet, save your list and open it on any device with a link.",
                            js_v="2", url="weighted-average-calculator", out="weighted-average-calculator.html",
                            js_path="gradecalculator/js/weighted-average-calculator.js", tab=1,
                            brand=dict(slug="gradecalculator", title="Grade Calculator", tag="What do you need on your final exam?"),
                            nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/weighted-average-calculator'>Weighted Average</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gradecalculator/memes'>Memes</a></li>",
                            menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/weighted-average-calculator\">Weighted Average</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/memes\">Memes</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/study-tips\">Study Tips</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gradecalculator/tutorial\">Tutorial</a></li>"),
    # GPA Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page; old js/calculatorffaf.js deleted): letters or percentages (mixed) per course, 4.0 / 4.33 scales, honors / AP weighting, several terms +
    # prior GPA / credits for a cumulative GPA, "what GPA do I need next". lib.js = maths + share encoding (tests: tool_apps_src/gpa-tests.js). Keeps ads; old /gpacalculator/s/<id> links resolve via /api/share?calc=gpa.
    "gpacalculator": dict(title="GPA Calculator", page_title="GPA Calculator",
                          tag="Grade point average, term by term.", accent="#5a812d", dark="#436022", tint="#edf3dc",
                          desc="Free GPA calculator: enter letter grades or percentages with credits and get your GPA on the 4.0 or 4.33 scale. Weighted GPA for honors and AP, a cumulative GPA across terms, a what-GPA-do-I-need-next planner, and links to save your work on any device.",
                          js_v="3",
                          nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gpacalculator/tutorial'>Tutorial</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/gpacalculator/grade-point-average'>What is GPA?</a></li>",
                          menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/tutorial\">Tutorial</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/grade-point-average\">What is GPA?</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/gpa-scale-4\">4.0 GPA Scale</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/gpacalculator/gpa-scale-433\">4.33 GPA Scale</a></li>"),
    # BMI Calculator 2.0 (rewritten 2026-10-06 from the 2013 jQuery page; old js/calculatorffaf.js deleted; the folder's chart / formula / what-is-BMI / health-tips / memes / sports pages are untouched):
    # kg / cm are the truth with both unit systems mirrored, WHO or Asian cut-offs, healthy range, gain / lose to normal, BMI Prime, Ponderal Index, gauge, saved measurements with a BMI-over-time chart.
    # lib.js = maths + share encoding (tests: tool_apps_src/bmi-tests.js). Keeps ads; old /bmicalculator/s/<id> links resolve via /api/share?calc=bmi.
    "bmicalculator": dict(title="BMI Calculator", page_title="BMI Calculator",
                          tag="Body mass index, healthy weight range and progress.", accent="#b3529d", dark="#8a3d79", tint="#f8e2ed",
                          desc="Free BMI calculator: enter your weight and height in kg/cm or lb/ft/in to get your body mass index, your category, your healthy weight range and how much to gain or lose. WHO or Asian cut-offs, a gauge, and saved measurements with a BMI-over-time chart.",
                          js_v="6",
                          nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/health-tips'>Health Tips</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/memes'>Memes</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/bmicalculator/body-mass-index'>What is BMI?</a></li>",
                          menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/health-tips\">Health Tips</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/memes\">Memes</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/body-mass-index\">What is BMI?</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/bmi-chart\">BMI Chart</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/bmi-formula\">BMI Formula</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/bmicalculator/sports\">Sports Articles</a></li>"),
    # Timer family (rewritten 2026-10-06): ONE script (tool_apps_src/timer/app.js) + one content template; each page sets which panels it shows (`vars.VIEWS`) and its own text (`vars.SEO` = seo/<slug>.html).
    # /timer shows countdown + stopwatch + alarm together by default (customizable: add Pomodoro / Interval / Date countdown, stacked or side by side, drag to reorder); the others are one big panel.
    # All use the Timer brand (logo, header, Home link) via `brand`; timer/img + timer/audio + the quote galleries stay in mes.fm/timer/. Tests: tool_apps_src/timer-tests.js.
    "timer": dict(title="Timer by MES", page_title="Timer", tag='Online timer, stopwatch, alarm clock and inspirational quotes!', accent="#a86706", dark="#7d4c04", tint="#fdf0dc",
                  desc='Free online timer: a countdown timer, stopwatch and alarm clock all on one page, plus Pomodoro, interval and date countdowns. Run several at once, auto-fitting side by side or stacked, drag to reorder, resize and fit to a small window, full screen, sounds you choose, time in your browser tab. No sign-up.', js_v="20",
                  vars={"VIEWS": 'cd,sw,al', "CUSTOMIZE": "1", "SEO": "@seo/timer.html"},
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "countdown-timer": dict(title="Countdown Timer", page_title='Online Countdown Timer', tag='Count down anything, as many as you like.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="20",
                  desc='Free online countdown timer: type a time or press a preset, run several labelled timers at once, add a minute, go full screen and see the time left in your browser tab. Sounds you choose, share links, no sign-up.', vars={"VIEWS": 'cd', "CUSTOMIZE": "0", "SEO": "@seo/countdown-timer.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=1,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "stopwatch": dict(title="Stopwatch", page_title='Online Stopwatch', tag='A precise stopwatch with laps.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="20",
                  desc='Free online stopwatch with lap times: hundredths of a second, fastest and slowest laps marked, copy your laps, full screen, and it keeps counting if you reload the page or switch tabs. No sign-up.', vars={"VIEWS": 'sw', "CUSTOMIZE": "0", "SEO": "@seo/stopwatch.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=2,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "alarm-clock": dict(title="Alarm Clock", page_title='Online Alarm Clock', tag='Set one or more alarms for any time of day.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="20",
                  desc='Free online alarm clock: set up to six alarms with labels, repeat daily, snooze, and choose your sound. Rings from your browser while the page is open. No sign-up.', vars={"VIEWS": 'al', "CUSTOMIZE": "0", "SEO": "@seo/alarm-clock.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=3,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "pomodoro-timer": dict(title="Pomodoro Timer", page_title='Pomodoro Timer', tag='Focus in blocks, rest in between.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="20",
                  desc='Free Pomodoro timer: 25-minute focus sessions with short and long breaks that start automatically, a count of sessions finished today, adjustable lengths, the time in your browser tab and alerts. No sign-up.', vars={"VIEWS": 'po', "CUSTOMIZE": "0", "SEO": "@seo/pomodoro-timer.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=4,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "interval-timer": dict(title="Interval Timer", page_title='Interval Timer for HIIT and Tabata', tag='Work, rest, repeat.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="20",
                  desc='Free interval timer for HIIT, Tabata, boxing and circuit workouts: set get-ready, work and rest times and rounds, big WORK and REST display, beep cues and a three-second countdown, full screen. No sign-up.', vars={"VIEWS": 'iv', "CUSTOMIZE": "0", "SEO": "@seo/interval-timer.html"},
                  brand=dict(slug="timer", title="Timer by MES", tag="Online timer, stopwatch, alarm clock and inspirational quotes!"), tab=5,
                  nav_extra="<li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-timer'>Countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/stopwatch'>Stopwatch</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/alarm-clock'>Alarm</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/pomodoro-timer'>Pomodoro</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/interval-timer'>Interval</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/countdown-to-date'>Date countdown</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/clock'>Clock</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timezone'>Time Zones</a></li><li class=\"info-bar__item\"><a class=\"info-bar__item__text\" href='/timer/inspirational-quotes'>Quotes</a></li>", menu_extra="<li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-timer\">Countdown Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/stopwatch\">Stopwatch</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/alarm-clock\">Alarm Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/pomodoro-timer\">Pomodoro Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/interval-timer\">Interval Timer</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/countdown-to-date\">Countdown to a Date</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/clock\">Clock</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timezone\">Time Zone Converter</a></li><li class=\"navbar__item\"><a class=\"navbar__link\" href=\"/timer/inspirational-quotes\">Inspirational Quotes</a></li>"),
    "countdown-to-date": dict(title="Countdown to a Date", page_title='Countdown to a Date', tag='Days, hours, minutes and seconds until your date.', accent="#a86706", dark="#7d4c04", tint="#fdf0dc", src="timer", js_path="timer/js/timer.js", js_v="20",
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
    # Short Links (new 2026-10-06, mes.fm/go; aliases /redirects /short-links /shortlinks /urls): every redirect of vercel.json, categorized + searchable + a helper that writes the next line.
    # Data = mes.fm/go/redirects.json written by build_redirects_index.py (only `redirects`, never the private finance `rewrites`); notes in mes.fm/go/notes.json. Wide, ad-free, like Site Index.
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
    desc = cfg["desc"]
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebApplication", "name": cfg["title"],
                     "url": "https://mes.fm/" + slug, "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
                     "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": desc}, ensure_ascii=False)
    scripts = "".join('<script src="%s" defer></script>' % u for u in cfg.get("pre_js", []))
    jsrel = cfg.get("js_path", "%s/js/%s.js" % (slug, slug))       # where the page script is served from (js_path: a page that lives inside another site's folder)
    scripts += '<script src="/%s?v=%s" defer></script>' % (jsrel, cfg["js_v"])
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
    if cfg.get("url"):                # the public path differs from the slug (e.g. weighted-average-calculator): canonical / og:url / JSON-LD
        for old_u in ('href="https://mes.fm/%s"' % slug, 'content="https://mes.fm/%s"' % slug, '"url": "https://mes.fm/%s"' % slug):
            page = page.replace(old_u, old_u.replace("/" + slug + '"', "/" + cfg["url"] + '"'))
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


if __name__ == "__main__":
    main()
