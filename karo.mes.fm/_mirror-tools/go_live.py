"""Make the mirror the real alpinewestcreative.com: drop noindex, point absolute
URLs at the real domain, tie desktop pages to their /m phone twins (separate
mobile URLs: rel=alternate on desktop, canonical on mobile already set), write
sitemap.xml and robots.txt. Idempotent."""
import re, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.alpinewestcreative.com"
PAGES = ["", "product-branding", "food-beverage", "hotels-airbnbs", "investment", "video", "contact-8"]
def page_of(rel):
    b = os.path.basename(rel)[:-5]
    return "" if b == "index" else b
for f in glob.glob(os.path.join(ROOT, "*.html")) + glob.glob(os.path.join(ROOT, "m/*.html")):
    rel = os.path.relpath(f, ROOT); s = open(f).read(); o = s
    s = s.replace('<meta name="robots" content="noindex, nofollow">', "")
    s = re.sub(r"<!-- Static test copy of alpinewestcreative\.com[^>]*-->", "", s)
    s = s.replace("https://karo.mes.fm", SITE)
    if not rel.startswith("m/") and 'rel="alternate" media=' not in s:
        p = page_of(rel)
        tag = '<link rel="alternate" media="only screen and (max-width: 640px)" href="%s/m%s">' % (SITE, "/" + p if p else "")
        s = re.sub(r'(<link rel="canonical"[^>]*>)', r"\1\n  " + tag, s, count=1)
    if s != o: open(f, "w").write(s); print("updated", rel)
urls = "".join("  <url><loc>%s%s</loc></url>\n" % (SITE, "/" + p if p else "/") for p in PAGES)
open(os.path.join(ROOT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n")
open(os.path.join(ROOT, "robots.txt"), "w").write("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % SITE)
