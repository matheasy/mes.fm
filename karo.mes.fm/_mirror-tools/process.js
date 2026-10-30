/*
How this static copy of alpinewestcreative.com (Wix) was made. Not deployed (.vercelignore).
Run from a scratch folder with puppeteer-core + cheerio@1.0.0 installed (npm i puppeteer-core@23 cheerio@1.0.0):
  1. node capture.js cap_d d "" contact-8 food-beverage hotels-airbnbs investment product-branding video   (desktop DOM after scrolling, every slideshow slide)
     node capture.js cap_m m ...same pages...                                                                (mobile layout, iPhone user agent)
  2. node process.js        strips the Wix runtime, rewrites links/assets, bundles CSS, writes the pages + jobs.json
  3. python3 fetch_assets.py  downloads original images from static.wixstatic.com and makes the exact sizes (WebP), fonts, videos
  4. python3 add_ratio.py     image aspect ratios for the masonry gallery re-flow
  5. node serve.js (port 8441, mimics cleanUrls + the mobile rewrite), node shoot.js / cmp.py to compare screenshots.
Behaviour Wix did with JavaScript is re-implemented in /assets/mirror.js.
*/
// Turns the captured Wix DOMs (cap_d = desktop, cap_m = mobile) into static pages in OUT.
// Asset jobs (images / fonts / videos) are written to jobs.json for fetch_assets.py.
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = '/Users/mes/Documents/GitHub/mes.fm/karo.mes.fm';
const ORIGIN = 'https://www.alpinewestcreative.com';
const PAGES = ['home', 'contact-8', 'food-beverage', 'hotels-airbnbs', 'investment', 'product-branding', 'video'];
const SITE_URL = 'https://karo.mes.fm';

const jobs = {}; // local path -> job
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

// ---------- URL mapping ----------
function mapImage(u) {
  // https://static.wixstatic.com/media/<file>[/v1/<ops>/<name>]
  let m = u.match(/^(?:https?:)?\/\/static\.wixstatic\.com\/media\/([^/?#]+)(\/v1\/(.+)\/[^/]*)?$/);
  if (!m) return null;
  const file = decodeURIComponent(m[1]);
  const opsStr = m[3] || '';
  const ops = {};
  for (const seg of opsStr.split('/').filter(Boolean)) {
    // seg like "fill" followed by params? Wix: /v1/crop/x_0,y_1,w_2,h_3/fill/w_..,h_..,al_c,q_85/
    // handled below by pairing
  }
  const parts = opsStr.split('/').filter(Boolean);
  const chain = [];
  for (let i = 0; i < parts.length; i += 2) {
    const name = parts[i], params = {};
    for (const kv of (parts[i + 1] || '').split(',')) {
      const j = kv.indexOf('_'); if (j > 0) params[kv.slice(0, j)] = kv.slice(j + 1);
    }
    chain.push({ name, params });
  }
  const ext = path.extname(file).toLowerCase();
  const stem = file.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]/g, '_');
  if (ext === '.svg' || ext === '.gif') {
    const out = `media/${stem}${ext}`;
    jobs[out] = { kind: 'raw', url: `https://static.wixstatic.com/media/${file}`, out };
    return '/' + out;
  }
  let sig = '';
  const simple = [];
  for (const c of chain) {
    const p = c.params;
    if (c.name === 'crop') simple.push({ op: 'crop', x: +p.x, y: +p.y, w: +p.w, h: +p.h });
    else if (c.name === 'fill' || c.name === 'fit') simple.push({ op: c.name, w: +p.w, h: +p.h, al: p.fp ? 'fp' + p.fp : (p.al || 'c') });
  }
  for (const s of simple) sig += s.op === 'crop' ? `c${s.x}.${s.y}.${s.w}.${s.h}` : `${s.op === 'fit' ? 'fit' : 'f'}${s.w}x${s.h}${s.al}`;
  const name = simple.length ? `${stem}-${sig.length > 40 ? md5(sig).slice(0, 10) : sig}` : `${stem}-orig`;
  const out = `media/${name}.webp`;
  jobs[out] = { kind: 'img', file, ops: simple, out };
  return '/' + out;
}
function mapOther(u) {
  let x = u.trim();
  if (x.startsWith('//')) x = 'https:' + x;
  let m;
  if ((m = x.match(/^https:\/\/static\.wixstatic\.com\/ufonts\/([^/]+)\/(woff2|woff|ttf|eot)\/file\.\w+/))) {
    const out = `fonts/${m[1]}.${m[2]}`; jobs[out] = { kind: 'raw', url: x, out }; return '/' + out;
  }
  if ((m = x.match(/^https:\/\/static\.parastorage\.com\/fonts\/[^?#]*\/([^/?#]+\.(woff2|woff|ttf|eot|svg))/))) {
    const out = `fonts/${m[1]}`; jobs[out] = { kind: 'raw', url: x.split('#')[0].split('?')[0], out }; return '/' + out;
  }
  if ((m = x.match(/^https:\/\/static\.parastorage\.com\/tag-bundler\/api\/v1\/fonts-cache\/googlefont\/woff2\/s\/([^/]+)\/[^/]+\/([^/?#]+)/))) {
    const out = `fonts/${m[1]}-${m[2]}`; jobs[out] = { kind: 'raw', url: x, out }; return '/' + out;
  }
  if ((m = x.match(/^https:\/\/static\.wixstatic\.com\/shapes\/([^/?#]+)/))) {
    const out = `media/shapes/${m[1]}`; jobs[out] = { kind: 'raw', url: x, out }; return '/' + out;
  }
  if ((m = x.match(/^https:\/\/video\.wixstatic\.com\/video\/([^/]+)\/(\d+p)\/mp4\/file\.mp4/))) {
    const out = `video/${m[1]}.mp4`; jobs[out] = { kind: 'raw', url: x, out }; return '/' + out;
  }
  return null;
}
function mapUrl(u) {
  if (!u) return u;
  let x = u.trim();
  if (x.startsWith('//')) x = 'https:' + x;
  return mapImage(x) || mapOther(x) || null;
}
function rewriteCss(css, unmapped) {
  css = css.replace(/\/\*#\s*sourceMappingURL=[^*]*\*\//g, '');
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, u) => {
    if (u.startsWith('data:') || u.startsWith('#')) return all;
    const r = mapUrl(u);
    if (r) return `url(${q}${r}${q})`;
    unmapped.add(u); return all;
  });
}
function rewriteSrcset(ss, unmapped) {
  if (ss.trim().startsWith('/')) return ss;
  // keep 1x and 2x only
  return ss.split(/,\s+(?=https?:|\/\/)/).map(s => s.trim()).filter(Boolean).map(s => {
    const [u, d] = s.split(/\s+/);
    if (d && /^[3-9]x$/.test(d)) return null;
    const r = mapUrl(u); if (!r) unmapped.add(u);
    return (r || u) + (d ? ' ' + d : '');
  }).filter(Boolean).join(', ');
}
function localHref(h, anchors) {
  if (!h) return h;
  if (h.startsWith(ORIGIN)) {
    let p = h.slice(ORIGIN.length) || '/';
    return p;
  }
  if (h.startsWith('./#')) return h.slice(1);
  return h;
}

// ---------- per page ----------
const unmappedAll = new Set();
const styleSeqs = { d: {}, m: {} };
const built = { d: {}, m: {} };
const bodyStyles = {};

for (const mode of ['d', 'm']) {
  for (const page of PAGES) {
    const html = fs.readFileSync(`cap_${mode}/${page}.html`, 'utf8');
    const slides = JSON.parse(fs.readFileSync(`cap_${mode}/${page}.slides.json`, 'utf8'));
    const $ = cheerio.load(html, { decodeEntities: false });
    const unmapped = new Set();

    // slideshows: put every slide in the DOM, first one visible
    for (const [id, list] of Object.entries(slides)) {
      const w = $(`#${id} [data-testid=slidesWrapper]`);
      w.empty();
      list.forEach((h, i) => {
        const el = $(h); el.attr('data-mslide', String(i));
        if (i > 0) el.attr('data-mslide-hidden', '');
        w.append(el);
      });
      $(`#${id}`).attr('data-mslideshow', '');
    }

    // remove Wix runtime
    $('script').each((i, e) => { if ($(e).attr('type') !== 'application/ld+json') $(e).remove(); });
    $('link').each((i, e) => {
      const rel = ($(e).attr('rel') || '').toLowerCase();
      if (rel !== 'canonical') $(e).remove();
    });
    $('meta[name=generator],meta[http-equiv],meta[name=skype_toolbar],meta[name=google-site-verification],meta[name=format-detection]').remove();
    $('iframe').remove();
    $('#WIX_ADS, #wix-dataBinding').remove();
    // vertical galleries: the scroll-position indicator would keep items hidden without Wix's JS
    $('[data-hook=css-scroll-indicator]').each((i, e) => {
      const g = $(e).closest('[id^=pro-gallery-comp]');
      if (!g.find('.gallery-horizontal-scroll').length) $(e).remove();
    });
    $('*').contents().filter((i, n) => n.type === 'comment').remove();
    // the mobile tag manager / sentry leftovers
    $('[id^=sentry]').remove();
    $('[data-image-info]').removeAttr('data-image-info');
    $('[data-video-info]').removeAttr('data-video-info');
    $('[data-ssr-src-done]').removeAttr('data-ssr-src-done');
    $('[data-has-ssr-src]').removeAttr('data-has-ssr-src');

    // robots + note
    $('head').prepend('\n<meta name="robots" content="noindex, nofollow">\n<link rel="icon" href="data:,">\n');
    $('head').prepend('<!-- Static test copy of alpinewestcreative.com (mirrored from Wix, 2026-10-29) for karo.mes.fm. Not indexed. -->\n');

    // og/twitter images -> local absolute
    $('meta[property="og:image"],meta[name="twitter:image"]').each((i, e) => {
      const r = mapUrl($(e).attr('content')); if (r) $(e).attr('content', SITE_URL + r);
    });
    $('meta[property="og:url"]').each((i, e) => { /* keep original */ });

    // links
    $('a[href]').each((i, e) => {
      const a = $(e); const h = a.attr('href');
      const anchor = a.attr('data-anchor');
      let n = localHref(h);
      if (anchor) {
        // Wix anchor data item -> element it scrolls to (found by clicking the links on the live site)
        const ANCHORS = { 'dataItem-jdk6a5nl1': 'comp-jdk6a5nl', 'anchors-loafnzjk2': 'comp-loafmslz', 'anchors-lziwpgdh3': 'comp-lziwpgd7' };
        if (ANCHORS[anchor]) n = n + '#' + ANCHORS[anchor]; else console.warn('unknown anchor', anchor);
      }
      a.attr('href', n);
    });

    // lightbox: a large version of every gallery image
    $('img[data-hook=gallery-item-image-img]').each((i, e) => {
      const el = $(e); const src = el.attr('src') || '';
      const m = src.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/]+)/);
      if (m) el.attr('data-full', mapImage(`https://static.wixstatic.com/media/${m[1]}/v1/fit/w_2000,h_2000,al_c/x.jpg`));
    });
    // background images: Wix requested a crop for the exact window size with JS; use the whole
    // picture at a few widths and let CSS (object-fit: cover + object-position) crop it like Wix does
    $('wow-image.bgImage img, .bgImage img').each((i, e) => {
      const el = $(e); const src = el.attr('src') || '';
      const m = src.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/]+)(?:\/v1\/(crop\/[^/]+)\/)?/);
      if (!m || /\.(svg|gif)$/i.test(m[1])) return;
      const crop = m[2] ? m[2] + '/' : '';
      const u = w => `https://static.wixstatic.com/media/${m[1]}/v1/${crop}fit/w_${w},h_${w * 2},al_c/x.jpg`;
      el.attr('src', mapImage(u(1920)));
      el.attr('srcset', [1280, 1920, 2560].map(w => mapImage(u(w)) + ` ${w}w`).join(', '));
      el.attr('sizes', '100vw');
    });
    // media attributes
    $('[src],[srcset],[poster],[data-src],[style],image,use').each((i, e) => {
      const el = $(e);
      for (const at of ['src', 'data-src', 'poster', 'href', 'xlink:href']) {
        const v = el.attr(at);
        if (!v || v.startsWith('data:') || v.startsWith('#') || v.startsWith('/')) continue;
        if (at === 'href' && e.tagName === 'a') continue;
        const r = mapUrl(v); if (r) el.attr(at, r); else if (/wixstatic|parastorage/.test(v)) unmapped.add(v);
      }
      if (el.attr('srcset')) el.attr('srcset', rewriteSrcset(el.attr('srcset'), unmapped));
      const st = el.attr('style'); if (st && st.includes('url(')) el.attr('style', rewriteCss(st, unmapped));
    });
    // <source type=image/jpeg> with avif urls: type no longer right -> drop type
    $('picture source').removeAttr('type');

    // background images sized in px by Wix JS -> fill their box
    $('wow-image.bgImage img, wow-image[class*=bgImage] img, .bgImage img').each((i, e) => {
      const el = $(e); let st = el.attr('style') || '';
      st = st.replace(/width:\s*[\d.]+px;?/, 'width: 100%;').replace(/height:\s*[\d.]+px;?/, 'height: 100%;');
      el.attr('style', st);
    });
    // videos: local + no autoplay (Wix plays on hover/click)
    $('video').each((i, e) => { const el = $(e); el.removeAttr('crossorigin'); el.attr('preload', 'none'); });

    // inline <svg> with remote <image>
    // styles
    const seq = [], bodySeq = [], bodySeen = new Set();
    $('style').each((i, e) => {
      const el = $(e);
      const css = rewriteCss(el.html(), unmapped);
      el.html(css);
      if (el.parents('head').length) seq.push(css);
      else { if (!bodySeen.has(css)) { bodySeen.add(css); bodySeq.push(css); } el.remove(); }
    });
    styleSeqs[mode][page] = seq; bodyStyles[mode + page] = bodySeq;

    // remaining text references to wix in attributes (e.g. data-*)
    unmapped.forEach(u => unmappedAll.add(`${mode}/${page}: ${u}`));
    built[mode][page] = $;
  }
}

// ---------- CSS bundling: common prefix -> site css, rest -> page css ----------
fs.mkdirSync(`${OUT}/assets/css`, { recursive: true });
const cssFiles = new Set();
for (const mode of ['d', 'm']) {
  const seqs = PAGES.map(p => styleSeqs[mode][p]);
  let k = 0;
  while (seqs.every(s => k < s.length && s[k] === seqs[0][k])) k++;
  const common = seqs[0].slice(0, k).join('\n');
  const commonName = `site-${mode}-${md5(common).slice(0, 8)}.css`;
  fs.writeFileSync(`${OUT}/assets/css/${commonName}`, common); cssFiles.add(commonName);
  for (const page of PAGES) {
    const $ = built[mode][page];
    const rest = styleSeqs[mode][page].slice(k).concat(bodyStyles[mode + page]).join('\n');
    const pageName = `${page}-${mode}-${md5(rest).slice(0, 8)}.css`;
    fs.writeFileSync(`${OUT}/assets/css/${pageName}`, rest); cssFiles.add(pageName);
    $('head style').remove();
    const t = $('head title');
    const links = `<link rel="stylesheet" href="/assets/css/${commonName}">\n<link rel="stylesheet" href="/assets/css/${pageName}">\n<link rel="stylesheet" href="/assets/mirror.css">\n`;
    if (t.length) t.before(links); else $('head').append(links);
    $('body').append('\n<script src="/assets/mirror.js" defer></script>\n');
    let out = $.html();
    out = out.replace(/\n\s*\n+/g, '\n');
    const file = mode === 'd' ? (page === 'home' ? 'index.html' : `${page}.html`) : (page === 'home' ? 'm/index.html' : `m/${page}.html`);
    fs.mkdirSync(path.dirname(`${OUT}/${file}`), { recursive: true });
    fs.writeFileSync(`${OUT}/${file}`, out);
    console.log(file, (out.length / 1024).toFixed(0) + 'KB');
  }
}
// remove stale css bundles
for (const f of fs.readdirSync(`${OUT}/assets/css`)) if (!cssFiles.has(f)) fs.unlinkSync(`${OUT}/assets/css/${f}`);
fs.writeFileSync('jobs.json', JSON.stringify(Object.values(jobs), null, 1));
fs.writeFileSync('unmapped.txt', [...unmappedAll].join('\n'));
console.log('jobs', Object.keys(jobs).length, 'unmapped', unmappedAll.size);
