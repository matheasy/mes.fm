"""Shared by the MES apps' build-www.py: copy main_js/app-update.js into www/js and return its <script> tag with this app's
store ids and the version numbers read from the Android / iOS projects (so the 'Update available' note compares against the
build being made)."""
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "mes.fm" / "main_js" / "app-update.js"


def tag(app_dir, www, key, ios_id, android_pkg):
    app_dir, www = Path(app_dir), Path(www)
    g = (app_dir / "android" / "app" / "build.gradle").read_text(encoding="utf-8")
    code = re.search(r"versionCode\s+(\d+)", g).group(1)
    name = re.search(r"versionName\s+['\"]([^'\"]+)", g).group(1)
    pbx = (app_dir / "ios" / "App" / "App.xcodeproj" / "project.pbxproj").read_text(encoding="utf-8")
    vios = re.search(r"MARKETING_VERSION = \"?([\d.]+)", pbx).group(1)
    (www / "js").mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC, www / "js" / "app-update.js")
    return ('<script src="js/app-update.js" data-app="%s" data-ios="%s" data-android="%s" data-v-ios="%s" '
            'data-v-android="%s" data-code-android="%s"></script>' % (key, ios_id, android_pkg, vios, name, code))


def inject(app_dir, key, ios_id, android_pkg, page="index.html"):
    """Add the tag to www/<page> (or every top-level page with page="*") right before </body> (idempotent)."""
    www = Path(app_dir) / "www"
    for f in (sorted(www.glob("*.html")) if page == "*" else [www / page]):
        _one(f, app_dir, www, key, ios_id, android_pkg)


def _one(f, app_dir, www, key, ios_id, android_pkg):
    html = f.read_text(encoding="utf-8")
    html = re.sub(r'<script src="js/app-update\.js"[^>]*></script>\n?', "", html)
    i = html.rfind("</body>")
    html = html[:i] + tag(app_dir, www, key, ios_id, android_pkg) + "\n" + html[i:]
    f.write_text(html, encoding="utf-8")
