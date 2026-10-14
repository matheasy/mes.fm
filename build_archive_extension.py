#!/usr/bin/env python3
"""Packages the MES Archive browser extension (mes.fm/archive).

Source (plain Manifest V3, no build step) lives in mes.fm/archive/extension/ and is served as-is, so the code is readable on the site. This script:
  1. copies the engine table tool_apps_src/archive/lib.js to extension/engines.js (the page and the extension share one table);
  2. makes the toolbar icons (icons/icon16|32|48|128.png) from mes.fm/archive/img/logo.png;
  3. zips the folder to mes.fm/archive/mes-archive.zip (one top-level folder, fixed timestamps).
Bump "version" in extension/manifest.json for a release (the page reads it from there). Dry-runs by default; --apply writes.  Tests: node tool_apps_src/archive-tests.js
"""
import io, json, sys, zipfile
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent
ROOT = REPO / "mes.fm" / "archive"
EXT = ROOT / "extension"
ZIP = ROOT / "mes-archive.zip"
FOLDER = "mes-archive"
SIZES = (16, 32, 48, 128)
LIB = REPO / "tool_apps_src" / "archive" / "lib.js"
HEADER = "/* Copied from tool_apps_src/archive/lib.js by build_archive_extension.py: do not edit here. */\n"

def icons():
    logo = Image.open(ROOT / "img" / "logo.png").convert("RGBA"); out = {}
    for s in SIZES:
        buf = io.BytesIO(); logo.resize((s, s), Image.LANCZOS).save(buf, "PNG", optimize=True); out["icons/icon%d.png" % s] = buf.getvalue()
    return out

def main():
    apply = "--apply" in sys.argv
    engines = (HEADER + LIB.read_text(encoding="utf-8")).encode("utf-8")
    files = {}
    for p in sorted(EXT.rglob("*")):
        rel = p.relative_to(EXT)
        if p.is_file() and p.name != ".DS_Store" and "icons" not in rel.parts: files[str(rel)] = p.read_bytes()
    files["engines.js"] = engines; files.update(icons())
    version = json.loads(files["manifest.json"])["version"]
    for rel, data in sorted(files.items()): print("  %-22s %7d bytes" % (rel, len(data)))
    print("version %s, %d files" % (version, len(files)))
    if not apply: print("dry run: pass --apply to write engines.js, the icons and the zip"); return
    (EXT / "icons").mkdir(exist_ok=True); (EXT / "engines.js").write_bytes(engines)
    for rel, data in icons().items(): (EXT / rel).write_bytes(data)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data in sorted(files.items()):
            zi = zipfile.ZipInfo("%s/%s" % (FOLDER, rel), date_time=(2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16; z.writestr(zi, data)
    print("wrote %s (%d bytes)" % (ZIP.relative_to(REPO / "mes.fm"), ZIP.stat().st_size))

main()
