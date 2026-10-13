#!/usr/bin/env python3
"""add_hub_filter.py -- search box + topic chips on the longer list pages of the hub generators (2026-10-13).

Patches the build.mjs of 911, hutchison, conspiracy and science so their long sections (mes.fm/911-spooks, 911-posts,
911-videos, 911truth, 911-observable-evidence, highlights, hutchison-interviews, conspiracy-posts, science-videos) get the
same search + chips widget as /livestreams, /math-qa and /experiments-series. The widget itself lives in
mes.fm/shared/hub-filter.mjs (FILTER_CSS, FILTER_JS, buildFilter, withCats); per-section chips are the HUB_FILTERS table
below (a title regex per chip; an item can instead carry `who: "id id"` in sections.mjs, which wins over the regexes, or
`kw: "..."` = extra searchable words). `chips: []` = search box only.

To add a person / topic: add a chip to HUB_FILTERS here, re-run this script (it rewrites the marked block) and `npm run build`
in that hub. To tag one post by hand: `who: "bob ryan"` on its item in sections.mjs. Idempotent; dry-runs by default,
`--apply` writes (then rebuild each hub: `cd mes.fm/<hub> && npm run build`, `git checkout <hub>/link-meta.json`).
"""
import re, sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv

# hub -> section id -> (placeholder, [(chip id, label, JS regex)])
HUB_FILTERS = {
    "911": {
        "911-spooks": ("Search the spooks\u2026", [
            ("bob", "Bob Greenyer", r"greenyer"),
            ("revisionist", "9/11 Revisionist", r"revisionist|norman"),
            ("abby", "Abby Martin", r"abby martin"),
            ("hughes", "David Hughes", r"hughes"),
            ("ryan", "Ryan Bannister", r"ryan ban+ister"),
            ("mason", "Andrew Mason", r"andrew mason"),
            ("offguardian", "Off Guardian", r"off ?guardian"),
        ]),
        "911-posts": ("Search the posts\u2026", [
            ("judy", "Dr. Judy Wood", r"judy wood|djw|wdttg|wdttt"),
            ("planes", "Planes", r"plane|hijacker|flight"),
            ("people", "Witnesses & Researchers", r"conlon|baron|doi |hampton|naus|kj\b|survivor"),
            ("events", "News & Documents", r"cia|csis|osama|youtube|griffin"),
        ]),
        "911-videos": ("Search the videos\u2026", [
            ("judy", "Dr. Judy Wood", r"judy wood"),
            ("weldon", "Curt Weldon", r"weldon"),
            ("dust", "Dust & Dustification", r"dust|evaporat|disintegrat|fumes"),
            ("jumpers", "Jumpers", r"jumper|launched"),
            ("trailers", "Trailers", r"trailer"),
        ]),
        "911-truth": ("Search the 9/11 Truth series\u2026", [
            ("docs", "Documentaries", r"documentary|feature|trailer"),
            ("dust", "Dust & Dustification", r"dust"),
            ("judy", "Dr. Judy Wood", r"judy"),
            ("opp", "Controlled Opposition", r"controlled opposition|ae911|alex jones"),
            ("french", "French", r"french translation"),
        ]),
        "911-observable-evidence": ("Search Observable Evidence\u2026", []),
        "911-short-videos": ("Search the short videos\u2026", []),
        "1109-keo-meteor-music": ("Search the music\u2026", []),
    },
    "hutchison": {
        "highlights": ("Search the highlights\u2026", [
            ("lev", "Levitation", r"levitat"),
            ("metal", "Metal Bends, Splits & Melts", r"steel|iron|metal|rod|bushing|cylinder|melting|clorox|composite"),
            ("water", "Water & Boat", r"water|boat"),
            ("comp", "Compilations & Trailers", r"compilation|timelapse|trailer|1109|hour of"),
        ]),
        "hutchison-interviews": ("Search the interviews\u2026", [
            ("elaine", "Elaine Smitha Show", r"elaine smitha"),
            ("brenda", "Brenda Roberts", r"brenda roberts"),
            ("tom", "Tom Sky", r"tom sky"),
            ("mes", "MES with Hutchison", r"\bmes\b"),
        ]),
    },
    "crypto": {
        "crypto-tutorials": ("Search the tutorials\u2026", []),
    },
    "bg": {
        "bg-videos": ("Search the videos\u2026", []),
    },
    "mh370": {
        "mh370-videos": ("Search the videos\u2026", []),
    },
    "antigravity": {
        "antigravity-series": ("Search the series\u2026", []),
    },
    "conspiracy": {
        "conspiracy-posts": ("Search the posts\u2026", [
            ("ashton", "Ashton Forbes", r"ashton forbes|drew ponder"),
            ("alex", "Alex Jones", r"alex jones"),
            ("bob", "Bob Greenyer", r"greenyer"),
            ("iran", "Iran & War", r"iran|ww3|ukraine|troops|war\b"),
            ("ufo", "UFOs & Aliens", r"ufo|alien|greer"),
            ("money", "Markets & Crypto", r"stock|s&p|oil|hyperliquid|crypto|debt"),
        ]),
    },
    "science": {
        "science-videos": ("Search the science videos\u2026", [
            ("tornado", "Tornadoes & Weather", r"tornado|lightning|fujita|fog"),
            ("tesla", "Tesla Coils & Plasma", r"tesla|plasma|laser|earbuds|coil"),
            ("fe", "Free Energy & Cold Fusion", r"cold fusion|over-unity|mccabe|torque|fleischmann"),
            ("wtc", "9/11 & Moon", r"wtc|9/11|moon|shadow"),
        ]),
        "physics": ("Search the physics videos\u2026", []),
    },
}

IMPORT_LINE = 'import { FILTER_CSS, FILTER_JS, buildFilter, withCats } from "../shared/hub-filter.mjs";\n'
BLOCK_RE = re.compile(r"// MES-HUB-FILTER:START.*?// MES-HUB-FILTER:END\n", re.S)


def block(hub):
    cfg = HUB_FILTERS[hub]
    obj = {}
    for sid, (ph, chips) in cfg.items():
        obj[sid] = {"placeholder": ph, "chips": [[c[0], c[1], c[2]] for c in chips]}
    return (
        "// MES-HUB-FILTER:START (generated by add_hub_filter.py: edit HUB_FILTERS there, not here)\n"
        "const HUB_FILTERS = " + json.dumps(obj, ensure_ascii=False, indent=2) + ";\n"
        "for (const [sid, cfg] of Object.entries(HUB_FILTERS)) {\n"
        "  const sec = SECTIONS.find((s) => s.id === sid);\n"
        "  if (!sec) continue;\n"
        "  const cats = cfg.chips.map(([id, label, re]) => ({ id, label, test: (t) => new RegExp(re, \"i\").test(t) }));\n"
        "  withCats(sec.items, cats);\n"
        "  sec.filter = cats.map(({ id, label }) => ({ id, label }));\n"
        "  if (cats.length) sec.filter.push({ id: \"other\", label: \"Everything else\" });\n"
        "  sec.filterPlaceholder = cfg.placeholder;\n"
        "}\n"
        "// MES-HUB-FILTER:END\n"
    )


def patch(hub):
    p = ROOT / hub / "build.mjs"
    s = p.read_text()
    orig = s
    if IMPORT_LINE not in s:
        m = re.search(r'import \{ SECTIONS[^\n]*\n', s)
        assert m, hub + ": SECTIONS import not found"
        s = s[:m.end()] + IMPORT_LINE + s[m.end():]
    if "MES-HUB-FILTER:START" in s:
        s = BLOCK_RE.sub(lambda m: block(hub), s)
    else:
        i = s.index(IMPORT_LINE) + len(IMPORT_LINE)
        s = s[:i] + "\n" + block(hub) + s[i:]
    # cards / rows carry data-cats (+ data-kw)
    if "catsAttr" not in s:
        ca = ('  const catsAttr = (item.cats !== undefined ? ` data-cats="${escapeHtml(item.cats)}"` : "") + '
              '(item.kw ? ` data-kw="${escapeHtml(item.kw)}"` : "");\n')
        for tag in ('return `<a class="link-card" href=', 'return `<div class="list-row">'):
            assert tag in s, hub + ": " + tag
        s = s.replace('  return `<a class="link-card" href=', ca + '  return `<a class="link-card"${catsAttr} href=', 1)
        s = s.replace('  return `<div class="list-row">', ca + '  return `<div class="list-row"${catsAttr}>', 1)
    # the filter bar above the view buttons (list branch, i.e. the second ${standaloneHtml})
    if "buildFilter(section, escapeHtml)" not in s:
        pat = '  ${standaloneHtml}\n    <div class="view-toggle">'
        assert pat in s, hub + ": view-toggle anchor"
        s = s.replace(pat, '  ${standaloneHtml}${section.filter ? `\\n    ${buildFilter(section, escapeHtml)}` : ""}\n    <div class="view-toggle">', 1)
    if "const hasFilter" not in s:
        pat = "  const viewToggleWiring = sections"
        assert pat in s, hub + ": viewToggleWiring"
        s = s.replace(pat, ("  const hasFilter = sections.some((s) => s.filter);\n"
                            "  const filterWiring = sections\n    .filter((s) => s.filter)\n"
                            "    .map((s) => `  wireFilter('${s.id}');`)\n    .join(\"\\n\");\n") + pat, 1)
    if "FILTER_CSS : " not in s:
        i = s.index("\n</style>")
        s = s[:i + 1] + '${hasFilter ? FILTER_CSS : ""}' + s[i + 1:]
    if "FILTER_JS}" not in s:
        assert "\n${viewToggleWiring}\n</script>" in s, hub + ": wiring tail"
        s = s.replace("\n${viewToggleWiring}\n</script>", "\n${viewToggleWiring}${hasFilter ? `\\n${FILTER_JS}${filterWiring}` : \"\"}\n</script>", 1)
    changed = s != orig
    print(f"{hub}: {'would patch' if changed and not APPLY else 'patched' if changed else 'already up to date'}")
    if changed and APPLY:
        p.write_text(s)


for h in HUB_FILTERS:
    patch(h)
