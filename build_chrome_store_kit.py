#!/usr/bin/env python3
"""Chrome Web Store kit for the MES browser extensions (2026-11-08).

Browsers block every extension (Claude included) from the Web Store and its developer dashboard, so the listings are
filled in by hand. This script prepares everything that goes into them, under chrome-store/<slug>/:

  store.zip            the extension with manifest.json at the top of the zip (the site's download zips keep a folder)
  screenshot-1/2/3.png 1280x800: in action (fake browser frame + page + popup), settings page, feature card
  promo-440x280.png    small promo tile (required by the store)
  listing.md           every text field of the dashboard (description, category, single purpose, permission reasons ...)
and chrome-store/index.html = all of it on one page with Copy buttons (open it in the browser).

Raw screenshots in chrome-store/raw/ come from headless Brave with the real extensions loaded (raw/shoot*.mjs, CDP; see
the comments there). Re-run this after changing texts or raw shots. Dry-runs by default; --apply writes.
"""
import html, io, json, os, re, sys, zipfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "mes.fm")
KIT = os.path.join(ROOT, "chrome-store")
RAW = os.path.join(KIT, "raw")
APPLY = "--apply" in sys.argv

F = "/System/Library/Fonts/Supplemental/"
def font(size, bold=False):
    try:
        return ImageFont.truetype(F + ("Arial Bold.ttf" if bold else "Arial.ttf"), size)
    except OSError:
        return ImageFont.load_default()

PRIVACY = "https://mes.fm/privacy-policy#browser-extensions"
SUPPORT = "https://mes.fm/contact"
NO_DATA = "None. Tick nothing under data collection, then tick the three certifications (not sold, not used for unrelated purposes, not used for credit)."

EXT = {
    "videospeed": dict(
        name="MES Video Speed Controller", accent="#d9480f", cat="Make Chrome Yours > Functionality & UI", page="/videospeed",
        page_shot="page", page_url="skynotes.localhost:8471",
        bullets=["Speed up or slow down any HTML5 video or audio", "Keyboard shortcuts: S / D / R / Z / X / G", "Small on-video control you can drag or hide", "Setups (profiles) and per-site settings"],
        desc="""Control the playback speed of any HTML5 video or audio on the web: YouTube, Vimeo, course sites, podcasts, news sites and more.

What it does
• A small control on the video shows the speed and has - / + buttons. Press and hold the speed label for a quick 2x, drag it to change the speed, hide it when you don't need it.
• Keyboard shortcuts (all changeable): S slower, D faster, R reset, G preferred speed, Z / X rewind / advance, V show / hide the control, M marker, J jump to the marker.
• Setups (profiles): keep different shortcuts and steps, for example "Default" and a study setup, and pick one per site.
• Remember the last speed, start hidden, force the speed on sites that reset it, and include audio elements.
• Export and import your settings.

Free, no ads, no account and no tracking: it collects no data and sends nothing anywhere. Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Change the playback speed of HTML5 video and audio on web pages, with keyboard shortcuts and a small on-video control.",
        perms={"storage": "Saves the person's speed settings, shortcuts and setups.",
               "activeTab": "Lets the toolbar popup read and change the speed of the video in the tab the person is looking at.",
               "Host permission (content script on all sites)": "Videos can be on any website, so the content script runs on every page to find <video>/<audio> elements, add the speed control and listen for the speed shortcuts. It reads nothing else from the page and sends nothing anywhere."},
        data=NO_DATA),
    "read-aloud": dict(
        name="MES Read Aloud", accent="#15803d", cat="Make Chrome Yours > Accessibility", page="/read-aloud",
        page_shot=None, page_url="skynotes.localhost:8471",
        bullets=["Reads any page, selection, Google Doc, PDF or Word file", "Highlights the word and sentence being read", "Searchable list of every voice, speed control", "Floating player: pause, skip, jump to any word"],
        desc="""Listen to any web page instead of reading it. MES Read Aloud finds the article text (or reads what you select) and speaks it with the voices of your browser and computer, highlighting the word and sentence as it goes.

What it does
• Reads web pages, a selection, Google Docs, PDF files and Word (.docx) files.
• Highlights the current word and sentence, and scrolls with the reading.
• Floating player you can drag or shrink: play / pause, previous / next sentence, speed, voice, double-click any word to jump there.
• Searchable voice list grouped by language; voices that fail to speak are skipped automatically.
• Setups such as Default, Study and Quick listen; keyboard shortcut Alt+Shift+R and a right-click menu.

Free, no ads, no account and no tracking. The extension sends nothing to MES; online voices offered by your browser are run by their provider (see the privacy policy). Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Read web pages, selections, Google Docs, PDFs and Word files aloud with the browser's voices, highlighting the words being read.",
        perms={"activeTab": "The extension starts only when the person clicks it, uses the shortcut or the right-click menu, and then reads the tab they are on.",
               "scripting": "Injects the reader (text finder, highlighter and player) into the current tab when the person starts reading.",
               "storage": "Saves the chosen voice, speed and setups.",
               "contextMenus": "Adds 'Read this aloud' and 'Read this PDF / Word file aloud' to the right-click menu.",
               "Host permission file:///*": "Lets the person open a PDF or Word file from their own computer in the reader (Chrome also asks them to allow file URLs).",
               "Optional host permissions (docs.google.com, *.googleusercontent.com, *://*/*)": "Asked only when needed: Google Docs draws text on a canvas, so the extension downloads the document's plain-text export with the person's own sign-in; *://*/* only to open a PDF / Word link whose site does not allow it otherwise."},
        data=NO_DATA),
    "dark-mode": dict(
        name="MES Dark Mode", accent="#4338ca", cat="Make Chrome Yours > Accessibility", page="/dark-mode",
        page_shot="page", page_url="skynotes.localhost:8471",
        bullets=["One click: this tab dark, click again for light", "Per-site Auto / Dark / Light / Off", "Schedule or follow the system theme", "Brightness, contrast and sepia sliders"],
        desc="""Dark mode for any website, or light mode for sites that are too dark. One click on the toolbar button switches the tab you are on; click again to go back.

What it does
• Smart invert: pages turn dark while photos, videos and canvases keep their real colours.
• Per tab by default, or per site (Auto / Dark / Light / Off), or every page.
• Modes: manual, always dark, always light, follow the system theme, or a schedule (for example 8 pm to 7 am).
• Brightness, contrast, sepia and greyscale sliders.
• Pages already dark are detected and left alone; keyboard shortcut Alt+Shift+D.

Free, no ads, no account and no tracking: it collects no data and sends nothing anywhere. Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Show websites in dark mode (or light mode), per tab, per site or for all pages, with brightness and sepia adjustments.",
        perms={"storage": "Saves the person's mode, per-site choices and slider values.",
               "activeTab": "Lets the toolbar button switch the tab the person clicked it on.",
               "contextMenus": "Adds 'Open the Dark Mode panel for this site' to the toolbar button's right-click menu.",
               "scripting": "After an install or update, re-adds the dark-mode style to tabs that are already open so they don't need a reload.",
               "Host permission <all_urls> (content script on all sites)": "Dark mode has to be applied before a page first paints, on whatever site the person visits, or every page flashes white. The script only adds or removes one stylesheet and checks how light the page is; it reads no page content and sends nothing anywhere."},
        data=NO_DATA),
    "volume-booster": dict(
        name="MES Volume Booster", accent="#b45309", cat="Make Chrome Yours > Functionality & UI", page="/volume-booster",
        page_shot="page", page_url="skynotes.localhost:8471",
        bullets=["Boost videos up to 600% past the site's limit", "Soft limiter to avoid harsh distortion", "Video mode or whole-tab mode", "Remembers the level per site"],
        desc="""Make quiet videos louder. MES Volume Booster raises the volume of videos and audio (YouTube and more) beyond the site's own maximum, up to 600%.

What it does
• Video mode (default): boosts the page's own video and audio, with no recording indicator.
• Whole-tab mode: boosts everything the tab plays (uses the browser's tab audio capture).
• Soft limiter rounds off peaks so loud parts don't crackle.
• Remembers the level per site; badge shows the boost; shortcuts Alt+Shift+Up / Down.

Free, no ads, no account and no tracking. Sound is processed on your device and never recorded or sent anywhere. Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Increase the volume of videos and audio in the current tab beyond the site's own maximum.",
        perms={"tabCapture": "Whole-tab mode: captures the current tab's sound (only after the person picks that mode) so it can be played back louder.",
               "offscreen": "Whole-tab mode needs an offscreen document to play the captured tab audio through the volume boost.",
               "activeTab": "The boost applies to the tab the person clicked the extension on.",
               "scripting": "Video mode: injects the small script that routes that tab's video and audio through the volume boost.",
               "storage": "Saves the boost level per site and the person's settings."},
        data=NO_DATA),
    "text-size": dict(
        name="MES Text Size", accent="#0e7490", cat="Make Chrome Yours > Accessibility", page="/text-size",
        page_shot="page", page_url="skynotes.localhost:8471",
        bullets=["A- / A+ for the text only: layout stays", "This tab, this site or every site", "50% to 300%, shortcuts Alt+Shift+Up / Down", "Back to normal in one click"],
        desc="""Make the text on any website bigger or smaller without zooming the whole page. Pictures and layout stay as they are; only the text changes size.

What it does
• A- / A+ buttons and quick sizes from 50% to 300%.
• Change the size for this tab only, this site (all its tabs) or every site.
• Keyboard shortcuts: Alt+Shift+Up / Down, Alt+Shift+0 for normal.
• Works on pages that load more text as you scroll.

Free, no ads, no account and no tracking: it collects no data and sends nothing anywhere. Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Make the text on web pages bigger or smaller for a tab, a site or all sites, without zooming the layout.",
        perms={"storage": "Saves the chosen text sizes per tab, per site or for all sites.",
               "activeTab": "Lets the popup show and change the size of the tab the person is on.",
               "Host permission (content script on all sites)": "The text size applies to any website the person chooses, and has to be applied as the page loads, so the content script runs on every page. It only changes font sizes and sends nothing anywhere."},
        data=NO_DATA),
    "archive": dict(
        name="MES Archive", accent="#1e3a8a", cat="Productivity > Tools", page="/archive",
        page_shot="mesfm", page_url="mes.fm",
        bullets=["Archive the page you're on in one click", "Wayback Machine, archive.today, Ghostarchive ...", "Find copies that already exist", "Send pages to ArcHive on the Hive blockchain"],
        desc="""Save a copy of the page you are on before it changes or disappears. One click opens the archive sites you choose with the page already filled in.

What it does
• Save a new copy on the Wayback Machine (Save Page Now), archive.today, Ghostarchive, Megalodon and more.
• Find copies that already exist: newest Wayback copy, the Wayback calendar, archive.today's newest copy, Arquivo.pt.
• Right-click any page or link: "Archive this page / link". Shortcut Alt+Shift+A.
• Retries archive.today on its other addresses when it is busy.
• Send the page to ArcHive (Hive blockchain) for a permanent copy, signed by you on the ArcHive page.
• Add your own archive sites.

Free, no ads, no account and no tracking. The page address goes only to the archive sites you pick; nothing is sent to MES. Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Save a copy of the current page (or a link) on web archive sites such as the Wayback Machine and archive.today, or find existing copies.",
        perms={"storage": "Saves which archive sites the person ticked and any sites they added.",
               "activeTab": "Reads the address of the tab the person clicked the extension on, to archive that page.",
               "contextMenus": "Adds 'Archive this page' and 'Archive this link' to the right-click menu.",
               "scripting": "For ArcHive only: when the person chooses it, reads the current page's text in that tab and hands it to the ArcHive page they opened.",
               "webRequest": "Observes (never blocks or changes) the archive.today save tabs the extension opened, so a 429 'too busy' answer can be retried on the site's next address.",
               "Host permissions (archive.ph / .is / .today / .md / .vn / .li / .fo, dhenz14.github.io)": "archive.today addresses: needed to see the status of the save tabs for the retry above. dhenz14.github.io: the ArcHive page the page text is handed to when the person chooses ArcHive."},
        data="Tick 'Web history' and 'Website content' (the address and, for ArcHive, the text of a page the person chooses to archive goes to the archive site they picked, at their request; nothing goes to MES). Then tick the three certifications."),
    "site-traffic": dict(
        name="MES Site Rank", accent="#0f766e", cat="Productivity > Tools", page="/site-traffic",
        page_shot="mesfm", page_url="mes.fm",
        bullets=["Tranco rank of the site you're on", "Rough monthly-visits range and rank trend", "Optional rank badge on the toolbar icon", "Full report: hosting, age, history"],
        desc="""How popular is the website you are on? MES Site Rank shows its public Tranco rank (a research ranking built from several traffic sources), a rough monthly-visits range worked out from it, and whether the rank is climbing or falling.

What it does
• Rank, tier (Top 1k, Top 1 million ...) and a 30-day rank line in the popup.
• A rough visits range, clearly labelled as an estimate.
• Optional badge with the rank on the toolbar icon for every site you visit (off by default).
• "Full report" opens mes.fm/site-traffic: domain age, hosting, archive history and more.

Free, no ads, no account. Only the site's domain name (never the full address) is sent to mes.fm for the lookup. Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.""",
        purpose="Show the public Tranco popularity rank and rank trend of the website in the current tab.",
        perms={"storage": "Saves whether the badge is on and caches rank answers for 6 hours.",
               "activeTab": "Reads the domain of the tab the person clicked the extension on, to look up its rank.",
               "Host permission https://mes.fm/*": "The rank lookup service (mes.fm/api/site-traffic) that returns the Tranco rank for a domain.",
               "Optional permission: tabs": "Asked only if the person switches on the toolbar badge: reads the domain of each tab they visit so the badge can show its rank."},
        data="Tick 'Web history' (domain names of sites the person looks up, or visits with the optional badge on, are sent to mes.fm to get their rank; not stored or linked to the person). Then tick the three certifications."),
}

def hexrgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)

def raw(name):
    p = os.path.join(RAW, name)
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None

def popup_img(slug):
    """The popup shot trimmed to its content (the 400x600 viewport leaves empty background below / beside it)."""
    from PIL import ImageChops
    im = raw(f"{slug}-popup2.png") or raw(f"{slug}-popup.png")
    bg = Image.new("RGBA", im.size, im.getpixel((im.width - 2, im.height - 2)))
    box = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > 18 else 0).getbbox()
    if box: im = im.crop((0, 0, min(im.width, box[2] + 24), min(im.height, box[3] + 28)))
    return im

def icon(slug, size):
    im = Image.open(os.path.join(SITE, slug, "extension", "icons", "icon128.png")).convert("RGBA")
    return im.resize((size, size), Image.LANCZOS)

def shadowed(base, im, xy, radius=18, r=12):
    """Paste im at xy with a soft drop shadow and rounded corners."""
    mask = Image.new("L", im.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    sh = Image.new("RGBA", (im.width + radius * 4, im.height + radius * 4), (0, 0, 0, 0))
    sm = Image.new("L", sh.size, 0); sm.paste(mask, (radius * 2, radius * 2 + 6))
    sh.putalpha(sm.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: int(v * 0.55)))
    base.alpha_composite(sh, (xy[0] - radius * 2, xy[1] - radius * 2))
    base.paste(im, xy, mask)

def browser_frame(page, url, slug):
    """1280x800: a plain browser toolbar (40px) over the page shot (1280x760)."""
    out = Image.new("RGBA", (1280, 800), (255, 255, 255, 255))
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, 1280, 40], fill=(53, 54, 58))
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([14 + i * 20, 14, 26 + i * 20, 26], fill=c)
    d.rounded_rectangle([90, 7, 1150, 33], 13, fill=(32, 33, 36))
    d.text((112, 12), url, font=font(14), fill=(220, 220, 220))
    out.alpha_composite(icon(slug, 22), (1200, 9))
    if page:
        out.paste(page.resize((1280, 760), Image.LANCZOS), (0, 40))
    return out

def shot_action(slug, e):
    page = raw({"page": f"{slug}-page.png", "mesfm": "mesfm-page.png"}.get(e["page_shot"]) or "demo.png") or raw("demo.png")
    out = browser_frame(page, e["page_url"], slug)
    pop = popup_img(slug)
    pop = pop.resize((pop.width // 2, pop.height // 2), Image.LANCZOS)
    pop = pop.crop((0, 0, pop.width, min(pop.height, 700)))
    shadowed(out, pop, (1280 - pop.width - 30, 50), r=10)
    return out.convert("RGB")

def shot_settings(slug, e):
    s = raw(f"{slug}-options.png")
    if s is None:   # Site Rank has no settings page: two screenshots only
        return None
    return browser_frame(s, f"chrome-extension://{e['name']} settings", slug).convert("RGB")

def wrap(d, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width: cur = t
        else: lines.append(cur); cur = w
    return lines + [cur]

def feature_card(slug, e, big_popup=False):
    acc = hexrgb(e["accent"]); W, H = 1280, 800
    out = Image.new("RGBA", (W, H))
    top, bot = shade(acc, 1.05), shade(acc, 0.55)
    for y in range(H):
        t = y / H; out.paste(tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)) + (255,), (0, y, W, y + 1))
    d = ImageDraw.Draw(out)
    out.alpha_composite(icon(slug, 120), (80, 80))
    nf = font(54, True)
    while d.textlength(e["name"], font=nf) > 600: nf = font(nf.size - 2, True)
    d.text((80, 240), e["name"], font=nf, fill="white")
    y = 330
    for b in e["bullets"]:
        d.ellipse([84, y + 14, 98, y + 28], fill="white")
        for i, line in enumerate(wrap(d, b, font(30), 560)):
            d.text((118, y + i * 38), line, font=font(30), fill="white")
        y += 38 * len(wrap(d, b, font(30), 560)) + 20
    d.text((80, H - 70), "Free · No ads · No tracking · Chrome, Brave & Edge · mes.fm", font=font(22), fill=(255, 255, 255, 220))
    pop = popup_img(slug)
    k = min(0.62, 640 / pop.height, 470 / pop.width)
    pop = pop.resize((int(pop.width * k), int(pop.height * k)), Image.LANCZOS)
    shadowed(out, pop, (W - pop.width - 80, (H - pop.height) // 2), r=14)
    return out.convert("RGB")

def promo(slug, e):
    acc = hexrgb(e["accent"]); out = Image.new("RGBA", (440, 280))
    for y in range(280):
        t = y / 280; c = tuple(int(shade(acc, 1.05)[i] * (1 - t) + shade(acc, 0.6)[i] * t) for i in range(3))
        out.paste(c + (255,), (0, y, 440, y + 1))
    d = ImageDraw.Draw(out)
    out.alpha_composite(icon(slug, 84), (178, 34))
    name = e["name"].replace("MES ", "")
    f = font(34, True)
    while d.textlength(name, font=f) > 400: f = font(f.size - 2, True)
    d.text(((440 - d.textlength(name, font=f)) / 2, 140), name, font=f, fill="white")
    sub = "by MES · free, no tracking"
    d.text(((440 - d.textlength(sub, font=font(18))) / 2, 196), sub, font=font(18), fill=(255, 255, 255, 230))
    return out.convert("RGB")

def store_zip(slug):
    src = os.path.join(SITE, slug, "extension"); buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(src):
            dirs.sort()
            for fn in sorted(files):
                if fn.startswith(".") or fn.endswith((".md", ".map")): continue
                p = os.path.join(base, fn); z.write(p, os.path.relpath(p, src))
    return buf.getvalue()

def manifest(slug):
    return json.load(open(os.path.join(SITE, slug, "extension", "manifest.json")))

def fields(slug, e):
    m = manifest(slug)
    return [
        ("Item name (from the manifest)", m["name"]),
        ("Summary (from the manifest, max 132)", m["description"]),
        ("Description", e["desc"]),
        ("Category", e["cat"]),
        ("Language", "English"),
        ("Homepage URL", "https://mes.fm" + e["page"]),
        ("Support URL", SUPPORT),
        ("Single purpose", e["purpose"]),
        *[("Permission justification: " + k, v) for k, v in e["perms"].items()],
        ("Are you using remote code?", "No, I am not using Remote code. (All code, including libraries, is inside the package.)"),
        ("Data usage", e["data"]),
        ("Privacy policy URL", PRIVACY),
        ("Distribution", "Public; all regions; free"),
    ]

def main():
    plan = []
    for slug, e in EXT.items():
        m = manifest(slug)
        assert m["name"] == e["name"], (slug, m["name"])
        assert len(m["description"]) <= 132, slug
        plan.append((slug, m["version"]))
    for slug, v in plan: print(f"{slug:15s} {v}")
    if not APPLY:
        print("dry run: --apply writes chrome-store/"); return
    cards = []
    for slug, e in EXT.items():
        out = os.path.join(KIT, slug); os.makedirs(out, exist_ok=True)
        open(os.path.join(out, "store.zip"), "wb").write(store_zip(slug))
        shot_action(slug, e).save(os.path.join(out, "screenshot-1.png"))
        for f in os.listdir(out):
            if f.startswith("screenshot-"): os.remove(os.path.join(out, f))
        shots = [x for x in (shot_action(slug, e), shot_settings(slug, e), feature_card(slug, e)) if x is not None]
        for i, im in enumerate(shots): im.save(os.path.join(out, f"screenshot-{i + 1}.png"))
        promo(slug, e).save(os.path.join(out, "promo-440x280.png"))
        icon(slug, 128).save(os.path.join(out, "icon-128.png"))
        fl = fields(slug, e)
        md = [f"# {e['name']} {manifest(slug)['version']}", "", "Upload `store.zip`; images: `icon-128.png` (store icon), `screenshot-*.png`, `promo-440x280.png`.", ""]
        for k, v in fl: md += [f"## {k}", "", v, ""]
        open(os.path.join(out, "listing.md"), "w").write("\n".join(md))
        rows = "".join(f'<div class="f"><div class="k">{html.escape(k)}<button>Copy</button></div><pre>{html.escape(v)}</pre></div>' for k, v in fl)
        imgs = "".join(f'<a href="{slug}/{n}"><img src="{slug}/{n}" alt=""></a>' for n in sorted(f for f in os.listdir(out) if f.startswith("screenshot-")) + ["promo-440x280.png", "icon-128.png"])
        cards.append(f'<section id="{slug}"><h2>{html.escape(e["name"])} <small>{manifest(slug)["version"]} · <a href="{slug}/store.zip">store.zip</a> · <a href="{slug}/">folder</a></small></h2><div class="imgs">{imgs}</div>{rows}</section>')
    nav = " · ".join(f'<a href="#{s}">{html.escape(e["name"].replace("MES ", ""))}</a>' for s, e in EXT.items())
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>MES extensions: Web Store kit</title>
<style>:root{{color-scheme:light dark}}body{{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:16px;background:#f6f7f9;color:#1b1f24}}
@media (prefers-color-scheme:dark){{body{{background:#16181c;color:#e6e6e6}}.f,section{{background:#1f2227!important;border-color:#333!important}}pre{{background:#121418!important}}a{{color:#8ab4ff}}}}
section{{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;margin:18px 0}}h2 small{{font-weight:400;font-size:14px}}
.imgs{{display:flex;gap:8px;flex-wrap:wrap}}.imgs img{{height:110px;border:1px solid #8884;border-radius:6px}}
.f{{border:1px solid #e3e3e3;border-radius:8px;margin:10px 0;padding:8px 10px;background:#fff}}.k{{font-weight:600;display:flex;justify-content:space-between;gap:8px}}
pre{{white-space:pre-wrap;margin:6px 0 0;font:14px/1.45 system-ui,sans-serif;background:#f3f4f6;padding:8px;border-radius:6px}}button{{font:inherit;cursor:pointer}}</style></head>
<body><h1>MES browser extensions: Chrome Web Store kit</h1>
<p>Developer dashboard: <a href="https://chrome.google.com/webstore/devconsole">chrome.google.com/webstore/devconsole</a>. For each extension: <b>+ New item</b> → upload <code>store.zip</code> → fill <b>Store listing</b>, <b>Privacy</b> and <b>Distribution</b> from the fields below → <b>Submit for review</b>. Before the first one: <b>Account</b> tab → add and verify the contact email (admin@mes.fm) and the publisher name (MES).</p>
<p>{nav}</p>{"".join(cards)}
<script>document.addEventListener('click',e=>{{if(e.target.tagName!=='BUTTON')return;const t=e.target.closest('.f').querySelector('pre').textContent;navigator.clipboard.writeText(t).then(()=>{{e.target.textContent='Copied';setTimeout(()=>e.target.textContent='Copy',1200)}})}})</script></body></html>"""
    open(os.path.join(KIT, "index.html"), "w").write(page)
    print("wrote chrome-store/")

if __name__ == "__main__":
    main()
