#!/usr/bin/env python3
"""Adds main_js/video-speed-hold.js (press-and-hold = 2x playback, drag left/right to change the speed: 0.1x steps up to 4x,
then 1x steps up to 10x) to every page that plays 3Speak video through hls.js. The tag goes right after the hls.js
<script>, so it lands on all ~125 pages, the build.mjs generators and the HTML templates (hive_mirror_template.html,
math_qa_mirror_template.html, cubic-formula/child-template.html) in one pass. The shared script attaches itself to every
<video> inside a .video-embed, so there is no per-page code. Bump V when the JS changes and run with --refresh --apply.
build_math_qa_mirrors.py builds the tag inside a Python string: it carries the line by hand (not touched here).
Idempotent; **dry-runs by default (-v lists files), --apply writes.**"""
import re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
V = "1"
APPLY, VERBOSE, REFRESH = "--apply" in sys.argv, "-v" in sys.argv, "--refresh" in sys.argv
HLS = re.compile(r'^([ \t]*)<script src="https://cdn\.jsdelivr\.net/npm/hls\.js@1/dist/hls\.min\.js"></script>[ \t]*$', re.M)
TAG = f'<script src="/main_js/video-speed-hold.js?v={V}" defer></script>'
OLD = re.compile(r'<script src="/main_js/video-speed-hold\.js\?v=[0-9.]+" defer></script>')
files = subprocess.run(["git", "ls-files", "*.html", "*.mjs"], cwd=ROOT, capture_output=True, text=True).stdout.split()
changed = 0
for f in files:
    p = ROOT / f
    try: s = p.read_text(encoding="utf-8")
    except Exception: continue
    if "hls.min.js" not in s: continue
    if "video-speed-hold.js" in s:
        if not REFRESH: continue
        n = OLD.sub(TAG, s)
    else:
        n = HLS.sub(lambda m: m.group(0) + "\n" + m.group(1) + TAG, s)
    if n == s: continue
    changed += 1
    if VERBOSE: print(f)
    if APPLY: p.write_text(n, encoding="utf-8")
print(f"{changed} file(s) {'patched' if APPLY else 'would be patched (use --apply)'}")
