#!/usr/bin/env python3
"""Fix image references whose filename differs from the file on disk only by letter case.

macOS ignores filename case, Vercel (Linux) does not: `eyebrows.jpg` in an og:image or a gallery
thumbnail 404s live when the file is `eyebrows.JPG`. Found via the Site Index "og:image file missing"
and "broken local reference" issues (2026-10-05: ~37 meme pages' og:image, 19 gallery list pages' thumbnails).

For every local image reference (src / data-src / srcset / content / href, root-relative, relative or
https://mes.fm/...) that has no exact file on disk but exactly one case-insensitive match in the same
directory, the reference is rewritten to the on-disk name. The files are NOT renamed, so any external link
to the current image URLs keeps working. Only the filename part changes.

Idempotent. Dry-runs by default (-v lists every change); --apply writes.
"""
import os, re, sys
from urllib.parse import unquote

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mes.fm')
APPLY = '--apply' in sys.argv
VERBOSE = '-v' in sys.argv

TOKEN = re.compile(
    r'(?<=["\'\s,(])((?:https://mes\.fm)?(?:\.\./|\./)*/?[A-Za-z0-9_%./~@+-]+\.(?:jpe?g|png|gif|webp))(?=["\'\s,)?#])',
    re.I)

_dir_cache = {}


def listdir(d):
    if d not in _dir_cache:
        try:
            _dir_cache[d] = os.listdir(d)
        except OSError:
            _dir_cache[d] = None
    return _dir_cache[d]


def to_disk(ref, html_path):
    """Return (disk_path, prefix_len) for a reference, or None if not local."""
    p = ref
    if p.startswith('https://mes.fm'):
        p = p[len('https://mes.fm'):]
    elif re.match(r'[a-z]+:', p) or p.startswith('//'):
        return None
    p = unquote(p)
    if p.startswith('/'):
        return os.path.normpath(os.path.join(ROOT, p.lstrip('/')))
    return os.path.normpath(os.path.join(os.path.dirname(html_path), p))


def fixed_ref(ref, html_path):
    disk = to_disk(ref, html_path)
    if not disk or not disk.startswith(ROOT):
        return None
    names = listdir(os.path.dirname(disk))
    base = os.path.basename(disk)
    # exact-name test via the listing: os.path.exists() is case-insensitive on macOS
    if not names or base in names:
        return None
    hits = [n for n in names if n.lower() == base.lower() and n != base]
    if len(hits) != 1:
        return None
    # keep the reference's own spelling of everything but the filename
    ref_base = ref.rsplit('/', 1)[-1]
    new = hits[0]
    if '%' in ref_base:
        from urllib.parse import quote
        new = quote(new)
    return ref[:len(ref) - len(ref_base)] + new


def main():
    files = changed_refs = 0
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in ('node_modules', '.git') and not d.startswith('_http')]
        if os.path.relpath(dp, ROOT).split(os.sep)[0] == 'percentagecalculator-app':
            continue
        for f in fn:
            if not f.endswith('.html'):
                continue
            path = os.path.join(dp, f)
            try:
                s = open(path, encoding='utf-8').read()
            except (UnicodeDecodeError, OSError):
                continue
            n = 0

            def sub(m):
                nonlocal n
                new = fixed_ref(m.group(1), path)
                if new is None:
                    return m.group(0)
                n += 1
                if VERBOSE:
                    print(f'  {os.path.relpath(path, ROOT)}: {m.group(1)} -> {new.rsplit("/", 1)[-1]}')
                return new

            out = TOKEN.sub(sub, s)
            if n:
                files += 1
                changed_refs += n
                if APPLY:
                    open(path, 'w', encoding='utf-8').write(out)
    print(f'{"Fixed" if APPLY else "Would fix"} {changed_refs} references in {files} files'
          + ('' if APPLY else ' (dry run: pass --apply to write)'))


main()
