#!/usr/bin/env python3
"""Packages the MES Read Aloud browser extension (mes.fm/read-aloud).

Source (plain Manifest V3, no build step) lives in mes.fm/read-aloud/extension/ and is served as-is, so the code is readable on the site.
This script:
  1. copies tool_apps_src/speedreader/lib.js to extension/srlib.js (the extension reuses the Speed Reader's tested sentence / word /
     voice logic, so there is one source of truth);
  2. makes the toolbar icons (icons/icon16|32|48|128.png) from mes.fm/read-aloud/img/logo.png;
  3. zips the folder to mes.fm/read-aloud/mes-read-aloud.zip (one top-level folder, fixed timestamps).
Bump "version" in extension/manifest.json for a release (the page reads it from there).
Dry-runs by default; --apply writes.  Tests: node tool_apps_src/read-aloud-tests.js
"""
import io, json, sys, zipfile
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent
ROOT = REPO / "mes.fm" / "read-aloud"
EXT = ROOT / "extension"
ZIP = ROOT / "mes-read-aloud.zip"
FOLDER = "mes-read-aloud"
SIZES = (16, 32, 48, 128)
SRLIB_SRC = REPO / "tool_apps_src" / "speedreader" / "lib.js"
HEADER = "/* Copied from tool_apps_src/speedreader/lib.js by build_read_aloud_extension.py: do not edit here. */\n"


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
    srlib = (HEADER + SRLIB_SRC.read_text(encoding="utf-8")).encode("utf-8")
    files = {}
    for p in sorted(EXT.rglob("*")):
        rel = p.relative_to(EXT)
        if p.is_file() and p.name != ".DS_Store" and "icons" not in rel.parts and str(rel) != "srlib.js":
            files[str(rel)] = p.read_bytes()
    files["srlib.js"] = srlib
    files.update(icons())
    version = json.loads(files["manifest.json"])["version"]
    for rel, data in sorted(files.items()):
        print("  %-22s %7d bytes" % (rel, len(data)))
    print("version %s, %d files" % (version, len(files)))
    if not apply:
        print("dry run: pass --apply to write srlib.js, the icons and the zip")
        return
    (EXT / "icons").mkdir(exist_ok=True)
    (EXT / "srlib.js").write_bytes(srlib)
    for rel, data in icons().items():
        (EXT / rel).write_bytes(data)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data in sorted(files.items()):
            zi = zipfile.ZipInfo("%s/%s" % (FOLDER, rel), date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data)
    print("wrote %s (%d bytes)" % (ZIP.relative_to(REPO / "mes.fm"), ZIP.stat().st_size))


if __name__ == "__main__":
    main()
