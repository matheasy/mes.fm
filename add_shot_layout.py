#!/usr/bin/env python3
"""add_shot_layout.py -- gives every screenshot gallery on mes.fm the Auto / 1 / 2 / 3 column switch of mes.fm/hive-crypto-tutorial.

A "gallery" is a run of 4 or more images (bare <img>, or <p><img></p>) inside the page's <article>, separated only by whitespace / <br>.
Each run becomes <div class="screenshot-grid" data-cols="auto">...</div> (the images keep their src / alt / loading; the old post-image class
and inline sizing are dropped so the grid controls the size), and a pages that already had <div class="screenshot-grid"> galleries just gets data-cols="auto".
One <div class="shot-layout"> bar (Layout: Auto | 1 column | 2 columns | 3 columns) goes before the first gallery; on pages with several galleries it is
sticky, so it stays in view. The bar, the CSS (main_js/shot-layout.css) and the JS (main_js/shot-layout.js, remembers the choice in localStorage
'shotCols', the key hive-crypto-tutorial already uses) are shared; the page only gets a <link> and a <script> tag.

Pages that already carry a .shot-layout bar (hive-crypto-tutorial, with its own inline CSS / JS) are skipped. Idempotent.
Dry-runs by default (-v lists every page and gallery); --apply writes.  New pages with a screenshots section: write the images as a run and run this.
"""
import glob
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mes.fm")
MIN_RUN = 4
BAR = ('<div class="shot-layout%s" role="group" aria-label="Screenshot layout">\n'
       '        <span>Layout:</span>\n'
       '        <button type="button" data-cols="auto" aria-pressed="true">Auto</button>\n'
       '        <button type="button" data-cols="1" aria-pressed="false">1 column</button>\n'
       '        <button type="button" data-cols="2" aria-pressed="false">2 columns</button>\n'
       '        <button type="button" data-cols="3" aria-pressed="false">3 columns</button>\n'
       '      </div>')
LINK = '  <link rel="stylesheet" href="/main_js/shot-layout.css?v=1">\n'
SCRIPT = '  <script src="/main_js/shot-layout.js?v=1" defer></script>\n'

IMG = r'<img\b[^>]*>'
ITEM = r'(?:<p>\s*)?' + IMG + r'(?:\s*</p>)?'
def run_re(n):
    return re.compile(r'(?:' + ITEM + r'[ \t\r\n]*(?:<br\s*/?>[ \t\r\n]*)?){%d,}' % n)


RUN = run_re(MIN_RUN)
RUN_SHORT = run_re(2)   # after a "Screenshots" heading even a pair or a trio belongs in the grid
SKIP = {'tesla-coil', 'problems-plus-5-projectile-total-distance'}   # photos / formula images, not screenshots
EXISTING = re.compile(r'<div class="screenshot-grid">.*?</div>', re.S)


def clean_img(tag):
    tag = re.sub(r'\sclass="post-image"', '', tag)
    tag = re.sub(r'\sstyle="[^"]*"', '', tag)
    if ' alt=' not in tag:
        tag = tag.replace('<img', '<img alt=""', 1)
    return tag


def convert(html):
    """returns (new_html, galleries_converted, existing_grids_marked)"""
    a = html.find('<article')
    b = html.find('</article>')
    if a < 0 or b < 0:
        return html, 0, 0
    head, body, tail = html[:a], html[a:b], html[b:]
    n_new = [0]
    held = []

    def hold(m):
        held.append(m.group(0).replace('<div class="screenshot-grid">', '<div class="screenshot-grid" data-cols="auto">'))
        return '@@GRID%d@@' % (len(held) - 1)
    body = EXISTING.sub(hold, body)   # galleries that are already grids: leave their images alone

    def repl(m):
        imgs = re.findall(IMG, m.group(0))
        n_new[0] += 1
        return ('<div class="screenshot-grid" data-cols="auto">\n' + '\n'.join('        ' + clean_img(i) for i in imgs) + '\n      </div>\n\n')
    h = re.search(r'<h[1-6][^>]*>[^<]*[Ss]creenshot', body)
    cut = h.start() if h else len(body)
    body = RUN.sub(repl, body[:cut]) + (RUN_SHORT.sub(repl, body[cut:]) if h else '')
    n_old = len(held)
    for i, g in enumerate(held):
        body = body.replace('@@GRID%d@@' % i, g)
    return head + body + tail, n_new[0], n_old


def patch(html):
    if 'class="shot-layout' in html or 'id="shotLayout"' in html:
        return html, None
    out, n_new, n_old = convert(html)
    total = n_new + n_old
    if not total:
        return html, None
    first = out.find('<div class="screenshot-grid"')
    sticky = ' shot-layout--sticky' if total > 1 else ''
    out = out[:first] + BAR % sticky + '\n      ' + out[first:]
    if '/main_js/shot-layout.css' not in out:
        out = out.replace('</head>', LINK + '</head>', 1)
    if '/main_js/shot-layout.js' not in out:
        out = out.replace('</body>', SCRIPT + '</body>', 1)
    return out, (n_new, n_old)


def targets():
    for p in sorted(glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)):
        rel = os.path.relpath(p, ROOT)
        if any(x in rel for x in ('_http', 'node_modules', 'extension', 'template', 'percentagecalculator-app')) or rel == 'index.html':
            continue
        yield p, rel


def main():
    apply = '--apply' in sys.argv
    verbose = '-v' in sys.argv
    changed = 0
    for p, rel in targets():
        try:
            html = open(p, encoding='utf-8').read()
        except Exception:
            continue
        if '<article' not in html or rel.split(os.sep)[0] in SKIP:
            continue
        new, info = patch(html)
        if info is None:
            continue
        changed += 1
        print('%s%s: %d gallery run(s) converted, %d existing grid(s)' % ('' if verbose or True else '', rel, info[0], info[1]))
        if apply:
            open(p, 'w', encoding='utf-8').write(new)
    print('%d page(s) %s' % (changed, 'patched' if apply else 'would change (dry run; --apply writes)'))


if __name__ == '__main__':
    main()
