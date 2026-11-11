"""Replace the Monotype fonts Wix licensed only for Wix sites (Avenir, DIN Next,
Helvetica, Arial Black) with free look-alikes before the mirror goes live on
alpinewestcreative.com. Drops their @font-face rules from the captured CSS and
adds one set of rules (same family names) to assets/mirror.css. Idempotent."""
import re, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAID = re.compile(r"/fonts/(avenir|din-next|helvetica|arial-w)", re.I)
n = 0
for f in glob.glob(os.path.join(ROOT, "assets/css/*.css")):
    s = open(f).read()
    t = re.sub(r"@font-face\s*\{[^}]*\}", lambda m: "" if PAID.search(m.group(0)) else m.group(0), s)
    if t != s:
        open(f, "w").write(t); n += 1
def face(fam, src):
    return "@font-face{font-family:'%s';font-style:normal;font-weight:400;font-display:swap;src:%s}" % (fam, src)
U = lambda name: "url('/fonts/free/%s.woff2') format('woff2')" % name
L = lambda *names: ",".join("local('%s')" % x for x in names)
RULES = [
  ("avenir-lt-w01_35-light1475496", U("nunitosans-300")),
  ("avenir-lt-w05_35-light", U("nunitosans-300")),
  ("avenir-lt-w01_85-heavy1475544", U("nunitosans-800")),
  ("avenir-lt-w05_85-heavy", U("nunitosans-800")),
  ("din-next-w01-light", U("barlow-300")),
  ("din-next-w02-light", U("barlow-300")),
  ("din-next-w10-light", U("barlow-300")),
]
for w in ("w01", "w02", "w10"):
    RULES.append(("arial-%s-black" % w, L("Arial Black", "ArialBlack") + "," + U("archivoblack-400")))
for v in ("helvetica-w01", "helvetica-w02", "helvetica-lt-w10"):
    RULES.append((v + "-light", L("Helvetica Neue Light", "HelveticaNeue-Light", "Helvetica Light") + "," + U("arimo-400")))
    RULES.append((v + "-roman", L("Helvetica Neue", "Helvetica", "Arial") + "," + U("arimo-400")))
    RULES.append((v + "-bold", L("Helvetica Neue Bold", "HelveticaNeue-Bold", "Helvetica Bold", "Arial Bold") + "," + U("arimo-700")))
block = "/* FREE-FONTS: free look-alikes for Wix-only fonts (swap_fonts.py) */\n" + "\n".join(face(a, b) for a, b in RULES) + "\n/* /FREE-FONTS */\n"
mc = os.path.join(ROOT, "assets/mirror.css")
s = open(mc).read()
s = re.sub(r"/\* FREE-FONTS:.*?/\* /FREE-FONTS \*/\n", "", s, flags=re.S)
open(mc, "w").write(block + s)
print("css files changed:", n)
