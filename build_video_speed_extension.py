#!/usr/bin/env python3
"""Packages the MES Video Speed Controller browser extension (mes.fm/videospeed).

Source (plain Manifest V3, no build step) lives in mes.fm/videospeed/extension/ and is served as-is, so the code is readable
on the site. This script:
  1. makes the toolbar icons (icons/icon16|32|48|128.png) from mes.fm/videospeed/img/logo.png, so replacing that logo
     (real Grok art) and re-running refreshes the extension's icon;
  2. zips the folder to mes.fm/videospeed/mes-video-speed-controller.zip (a single top-level folder, fixed timestamps,
     so the zip only changes when the extension does).
Bump "version" in extension/manifest.json for a release (the page reads it from there).
Dry-runs by default; --apply writes.  Tests: node tool_apps_src/videospeed-tests.js
"""
import io, json, sys, zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent / "mes.fm" / "videospeed"
EXT = ROOT / "extension"
ZIP = ROOT / "mes-video-speed-controller.zip"
FOLDER = "mes-video-speed-controller"
SIZES = (16, 32, 48, 128)
EXCLUDE = {".DS_Store"}


def icons():
    logo = Image.open(ROOT / "img" / "logo.png").convert("RGBA")
    out = {}
    for s in SIZES:
        buf = io.BytesIO()
        logo.resize((s, s), Image.LANCZOS).save(buf, "PNG", optimize=True)
        out["icons/icon%d.png" % s] = buf.getvalue()
    return out


def main():
    apply = "--apply" in sys.argv
    files = {}
    for p in sorted(EXT.rglob("*")):
        if p.is_file() and p.name not in EXCLUDE and "icons" not in p.relative_to(EXT).parts:
            files[str(p.relative_to(EXT))] = p.read_bytes()
    files.update(icons())
    version = json.loads(files["manifest.json"])["version"]
    for rel, data in sorted(files.items()):
        print("  %-22s %7d bytes" % (rel, len(data)))
    print("version %s, %d files" % (version, len(files)))
    if not apply:
        print("dry run: pass --apply to write the icons and the zip")
        return
    (EXT / "icons").mkdir(exist_ok=True)
    for rel, data in icons().items():
        (EXT / rel).write_bytes(data)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data in sorted(files.items()):
            zi = zipfile.ZipInfo("%s/%s" % (FOLDER, rel), date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data)
    print("wrote %s (%d bytes)" % (ZIP.relative_to(ROOT.parent.parent), ZIP.stat().st_size))


if __name__ == "__main__":
    main()
