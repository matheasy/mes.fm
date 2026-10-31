#!/usr/bin/env python3
"""Adds main_js/video-chapters.js (YouTube / 3Speak-style chapters under an article's video: segmented chapter bar,
previous / next, current chapter name, searchable Chapters list, works for the hls.js <video> and the YouTube iframe) to
every page that already loads main_js/video-speed-hold.js, i.e. every page that plays a .video-embed through hls.js, plus
the build.mjs generators and the HTML templates (hive_mirror_template.html, math_qa_mirror_template.html,
cubic-formula/child-template.html) in one pass. The tag goes right after the video-speed-hold tag. The script finds the
chapters itself (a timestamp list after the video) and does nothing on pages without one, so the tag is harmless there.
build_math_qa_mirrors.py builds the tag inside a Python string: it carries the line by hand (not touched here).
Bump V when the JS changes and run with --refresh --apply. Idempotent; **dry-runs by default (-v lists files), --apply writes.**"""
import re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
V = "1"
APPLY, VERBOSE, REFRESH = "--apply" in sys.argv, "-v" in sys.argv, "--refresh" in sys.argv
HOLD = re.compile(r'^([ \t]*)<script src="/main_js/video-speed-hold\.js\?v=[0-9.]+" defer></script>[ \t]*$', re.M)
TAG = f'<script src="/main_js/video-chapters.js?v={V}" defer></script>'
OLD = re.compile(r'<script src="/main_js/video-chapters\.js\?v=[0-9.]+" defer></script>')
files = subprocess.run(["git", "ls-files", "*.html", "*.mjs"], cwd=ROOT, capture_output=True, text=True).stdout.split()
changed = 0
for f in files:
    if "node_modules/" in f or "/_http" in f: continue
    p = ROOT / f
    try: s = p.read_text(encoding="utf-8")
    except Exception: continue
    if "video-speed-hold.js" not in s: continue
    if "video-chapters.js" in s:
        if not REFRESH: continue
        n = OLD.sub(TAG, s)
    else:
        n = HOLD.sub(lambda m: m.group(0) + "\n" + m.group(1) + TAG, s)
    if n == s: continue
    changed += 1
    if VERBOSE: print(f)
    if APPLY: p.write_text(n, encoding="utf-8")
print(f"{changed} file(s) {'patched' if APPLY else 'would be patched (use --apply)'}")
