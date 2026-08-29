#!/usr/bin/env python3
"""Repair mojibake (UTF-8 text that was decoded as Windows-1252 and re-saved as
UTF-8) across every HTML file in the repo.

Symptom: emoji and punctuation render as garbage, e.g.
    Happy Tetrahedral 2024 New Year!!! ðŸ¤¯ðŸ“2ï¸âƒ£0ï¸âƒ£...
    slow and steady wins the raceâ€
    El PeÃ±Ã³n de GuatapÃ©

Cause: at some point in the HTTrack capture / hosting chain the original UTF-8
bytes were interpreted through Windows-1252 (the WHATWG variant, where the five
undefined slots 0x81/0x8D/0x8F/0x90/0x9D pass through as U+0081 etc.) and then
written back out as UTF-8, so every non-ASCII byte became two-or-more bytes of
nonsense.

Fix: find maximal runs of the characters such a mis-decode can produce, reverse
the Windows-1252 step to recover the original bytes, and UTF-8-decode them. A run
is only rewritten when it round-trips to valid UTF-8, so plain accented text that
was never corrupted is left untouched.

Idempotent: re-running on already-fixed files is a no-op (fixed text no longer
matches the mojibake character class). Safe to run from anywhere.
"""

import os
import re

REPO_ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

# HTTrack's captures of external links - leave them alone (see CLAUDE.md).
SKIP_DIR_NAMES = {"_http_", "_https_"}

# Windows-1252 slots that Python's "cp1252" codec refuses but the WHATWG variant
# maps to the C1 control char of the same value. The real data uses these
# (e.g. U+0090 is the 4th byte of the triangular-ruler emoji).
_PASSTHROUGH = {0x81: 0x81, 0x8D: 0x8D, 0x8F: 0x8F, 0x90: 0x90, 0x9D: 0x9D}

# Every character a UTF-8-byte-through-Windows-1252 mis-decode can emit:
# the Latin-1 supplement (U+00A0..U+00FF) plus Windows-1252's printable
# additions in 0x80..0x9F and the five C1 pass-throughs above.
_MOJIBAKE_CHARS = (
    "".join(chr(c) for c in range(0xA0, 0x100))
    + "".join(chr(c) for c in _PASSTHROUGH)
    + "€‚ƒ„…†‡ˆ‰Š‹Œ"
    + "Ž‘’“”•–—˜™š›"
    + "œžŸ"
)
_RUN_RE = re.compile("[" + re.escape(_MOJIBAKE_CHARS) + "]{2,}")


def _demojibake_run(run):
    """Reverse the Windows-1252 step for one run; return None if it isn't mojibake."""
    raw = bytearray()
    for ch in run:
        o = ord(ch)
        if o in _PASSTHROUGH:
            raw.append(_PASSTHROUGH[o])
        elif o < 0x80 or 0xA0 <= o < 0x100:
            raw.append(o)
        else:
            try:
                raw += ch.encode("cp1252")
            except UnicodeEncodeError:
                return None
    try:
        fixed = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    # A genuine repair must actually change something and must not itself still
    # look like mojibake.
    if fixed == run:
        return None
    return fixed


def fix_text(text):
    changes = 0

    def repl(match):
        nonlocal changes
        fixed = _demojibake_run(match.group(0))
        if fixed is None:
            return match.group(0)
        changes += 1
        return fixed

    return _RUN_RE.sub(repl, text), changes


def main():
    scanned = fixed_files = 0
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES and d != ".git"]
        for name in filenames:
            if not name.endswith(".html"):
                continue
            path = os.path.join(dirpath, name)
            scanned += 1
            with open(path, encoding="utf-8") as fh:
                original = fh.read()
            new_text, changes = fix_text(original)
            rel = os.path.relpath(path, REPO_ROOT)
            if changes and new_text != original:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(new_text)
                fixed_files += 1
                print(f"Fixed    ({changes:3d} run(s))  {rel}")
    print(f"\nScanned {scanned} HTML files; fixed {fixed_files}.")


if __name__ == "__main__":
    main()
