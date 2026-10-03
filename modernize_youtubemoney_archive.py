#!/usr/bin/env python3
"""youtubemoney's YouTuber-earnings gallery (mes.fm/youtubemoney/youtubers + the ten meme pages under youtubers/) is a 2016 snapshot:
the pictures state each channel's earnings as of then and can't be regenerated. 2026-10-02 pass, alongside the calculator rewrite
(tool_apps_src/youtubemoney/, built by build_tool_apps.py):
  - every page gets an "archive" note (`ymc-archive-note`) at the top of #main-content pointing to the new calculator;
  - the info-bar / Site Navigation label "How much do YouTuber's make?" becomes "YouTubers" (matches the calculator's own nav);
  - the gallery page is retitled "YouTuber earnings archive (2016 estimates)" with a fresh description (it had typos).
Idempotent; dry-runs by default, --apply writes. These pages carry no ads and must never get any.
"""
import glob
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm" / "youtubemoney"
APPLY = "--apply" in sys.argv
NOTE = ('<div class="ymc-archive-note" style="margin:0 0 1.2em;padding:0.8em 1em;border-left:0.3em solid #cc1f1f;background:#fbe9e9;'
        'line-height:1.45;font-size:0.95em;"><strong>Archive.</strong> The earnings on this page were estimated in 2016 from the view and '
        'subscriber counts of the time, so today&rsquo;s numbers are different. To estimate what a video or channel earns now, '
        'use the <a href="/youtubemoney" style="color:#cc1f1f;font-weight:700;text-decoration:underline;">YouTube Money Calculator</a>.</div>')
DESC = ("An archive of 2016 estimates of how much YouTubers such as PewDiePie, Dude Perfect, Vsauce and Game Theorists earned from YouTube, "
        "kept for reference. For current numbers use the YouTube Money Calculator.")
TITLE = "YouTuber Earnings Archive (2016 estimates) | YouTube Money Calculator"


def patch(path):
    t = old = path.read_text(encoding="utf-8")
    t = t.replace("How much do YouTuber&#039;s make?</a>", "YouTubers</a>").replace("How much do YouTuber's make?</a>", "YouTubers</a>")
    if "ymc-archive-note" not in t:
        t = t.replace('<div id="main-content">', '<div id="main-content">\n\t\t' + NOTE, 1)
    if path.name == "youtubers.html":
        t = re.sub(r"<title>.*?</title>", "<title>%s</title>" % TITLE, t, count=1, flags=re.S)
        t = re.sub(r'(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*(")', lambda m: m.group(1) + DESC + m.group(2), t)
        t = re.sub(r'(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*(")', lambda m: m.group(1) + "YouTuber Earnings Archive (2016 estimates)" + m.group(2), t)
        t = re.sub(r'<h1 class="page-title">[^<]*</h1>(\s*)<p class="page-description">.*?</p>',
                   lambda m: '<h1 class="page-title">How much did YouTubers make? (2016 archive)</h1>' + m.group(1) + '<p class="page-description">' + DESC + "</p>", t, count=1, flags=re.S)
    return old, t


def main():
    files = [SITE / "youtubers.html"] + [Path(p) for p in sorted(glob.glob(str(SITE / "youtubers" / "*.html"))) if not re.match(r"\d+\.html$", Path(p).name)]
    n = 0
    for f in files:
        old, new = patch(f)
        if new != old:
            n += 1
            if APPLY:
                f.write_text(new, encoding="utf-8")
    print("%d of %d pages %s" % (n, len(files), "written" if APPLY else "would change (pass --apply)"))


if __name__ == "__main__":
    main()
