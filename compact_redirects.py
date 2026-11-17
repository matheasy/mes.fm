#!/usr/bin/env python3
"""Keep mes.fm/vercel.json under Vercel's route limit (2,048 routes per deployment: redirects + rewrites + headers +
a few of Vercel's own). On 2026-11-17 the file reached 2,001 redirects and every deploy failed with
"Maximum number of routes ... exceeded. Max is 2048, received 2058".

Simple short links that go to the same page become one rule:
    {"source": "/bmi"}, {"source": "/bmi-hindi"}, ... -> {"source": "/:k(bmi|bmi-hindi|...)", ...}
Same behaviour for every address. Only plain one-segment sources (/word) with no has / missing condition that
appear once are merged, and never across a rule that is not plain (catch-alls, host rules, patterns, duplicates):
those split the list into segments and a merged rule takes the place of its first member in its segment, so the
first-match order Vercel uses never changes for any path. At most MAX_ALTS names per rule.

expand(redirects) turns merged rules back into one entry per short link: build_redirects_index.py (mes.fm/go)
and build_links_page.py use it, so lists of short links look the same as before.

Adding a short link: append a normal {"source": "/word", ...} line as before; re-run this when the total gets near
the limit (it prints the count). Dry run by default; --apply writes.
"""
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
VJ = os.path.join(ROOT, 'mes.fm', 'vercel.json')
LIMIT = 2048
MAX_ALTS = 40
PLAIN = re.compile(r'^/[A-Za-z0-9._~-]+$')
MERGED = re.compile(r'^/:k\(([A-Za-z0-9._~|-]+)\)$')


def expand(redirects):
    out = []
    for r in redirects:
        m = MERGED.match(r.get('source', ''))
        if m and not (set(r) - {'source', 'destination', 'permanent'}):
            out += [dict(r, source='/' + a.replace('\\.', '.')) for a in m.group(1).split('|')]
        else:
            out.append(r)
    return out


def compact(redirects):
    reds = expand(redirects)
    count = Counter(r['source'] for r in reds)

    def plain(r):
        return not (set(r) - {'source', 'destination', 'permanent'}) and PLAIN.match(r['source']) and count[r['source']] == 1

    out, seg = [], []

    def flush():
        groups, order = {}, []
        for r in seg:
            k = (r['destination'], bool(r.get('permanent')))
            if k not in groups:
                groups[k] = []
                order.append(k)
            groups[k].append(r)
        slots = []   # keep each group at its first member's position
        for r in seg:
            k = (r['destination'], bool(r.get('permanent')))
            if groups[k] and groups[k][0] is r:
                slots.append(k)
        for k in slots:
            members = groups[k]
            for i in range(0, len(members), MAX_ALTS):
                chunk = members[i:i + MAX_ALTS]
                if len(chunk) == 1:
                    out.append(chunk[0])
                else:
                    alts = '|'.join(m['source'][1:].replace('.', '\\.') for m in chunk)
                    out.append({'source': '/:k(%s)' % alts, 'destination': k[0], 'permanent': k[1]})
        seg.clear()

    for r in reds:
        if plain(r):
            seg.append(r)
        else:
            flush()
            out.append(r)
    flush()
    return out


def main():
    cfg = json.load(open(VJ, encoding='utf-8'))
    before = cfg.get('redirects', [])
    after = compact(before)
    assert expand(after) == expand(before) or sorted(map(json.dumps, expand(after))) == sorted(map(json.dumps, expand(before))), 'short links changed'
    other = len(cfg.get('rewrites', [])) + len(cfg.get('headers', []))
    print('redirect rules: %d -> %d (short links: %d); with rewrites + headers: %d of Vercel\'s %d'
          % (len(before), len(after), len(expand(before)), len(after) + other, LIMIT))
    if '--apply' in sys.argv and after != before:
        # replace only the redirects block, one rule per line like the rest of the file
        text = open(VJ, encoding='utf-8').read()
        i = text.index('"redirects": [')
        j = text.index('\n  ]', i)
        lines = ',\n'.join('    { ' + json.dumps(r, ensure_ascii=False)[1:-1] + ' }' for r in after)
        text = text[:i] + '"redirects": [\n' + lines + text[j:]
        json.loads(text)
        open(VJ, 'w', encoding='utf-8').write(text)
        print('written')
    elif '--apply' not in sys.argv:
        print('Dry run. --apply writes.')


if __name__ == '__main__':
    main()
