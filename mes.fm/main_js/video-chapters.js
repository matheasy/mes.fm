/* video-chapters.js -- YouTube / 3Speak-style chapters for the article video players (2026-10-30).
   Loaded on every page that plays a .video-embed (add_video_chapters.py puts the tag after video-speed-hold.js). It does
   nothing unless the page has a timestamp list for a video; then it adds, right under that .video-embed:
     - a segmented chapter bar (one segment per chapter, filled as the video plays, hover = chapter title + time,
       click = jump there; keyboard: each segment is a button that jumps to its chapter's start),
     - a row with ‹ / › (previous / next chapter), the current chapter's name and a "Chapters" list (with a search box
       when there are more than 8),
     - a short "chapter" pill on the picture when a new chapter starts while playing,
     - the current entry of the page's own timestamp list gets .mes-vc-cur.
   Where the chapters come from (first match after each .video-embed, before the next one):
     1. <script type="application/json" class="video-chapters">[{"t": 0, "title": "Intro"}, ...]</script>
     2. links with a numeric data-t (a.ts-link / a.ts): their line gives the title (the page keeps its own click handler)
     3. plain lines "Title – 6:30" / "6:30 Title" in a list or a <br>-separated paragraph (3+ such lines); their times are
        turned into links that seek the player.
   Players: the <video> (hls.js / native HLS) and a YouTube iframe (fallback or YouTube-only), through the YouTube IFrame
   API (enablejsapi=1 is added to the iframe src when missing). The player inside the box can be swapped at any time
   (MutationObserver). Default / Wide / Theater: the strip follows the box (theater = full browser width, like the video).
   window.MESChapters.seek(t[, embed]) -> true when a player took the seek (pages use it for their own timestamp links). */
(function () {
  'use strict';
  if (window.MESChapters) return;

  var TIME = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}';
  var RE_START = new RegExp('^\\s*[\\[(]?(' + TIME + ')[\\])]?\\s*(?:[-–—:|.]\\s*)?(\\S.*)$');
  var RE_END = new RegExp('^\\s*(\\S.*?)\\s*(?:[-–—:|]\\s*)?[\\[(]?(' + TIME + ')[\\])]?\\s*$');
  var SEP = /^[\s\-–—:.,)\]]+|[\s\-–—:(\[,]+$/g;

  function toSec(s) { var t = 0; s.split(':').forEach(function (p) { t = t * 60 + (+p); }); return t; }
  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').replace(SEP, '').trim(); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function skip(n) { return n.closest && n.closest('nav, header, footer, aside, .toc-sidebar, .toc-mobile, .mes-vc, #footer, .mes-aside, #compact-nav, script, style'); }

  /* ---------- CSS ---------- */
  var css = el('style');
  css.id = 'mes-vc-css';
  css.textContent = [
    '.mes-vc,.mes-vc-side{--vc-a:#277bb6;--vc-t:#1f2937;--vc-m:#5b6472;--vc-bg:#f3f6f9;--vc-bd:rgba(0,0,0,.12);--vc-seg:rgba(0,0,0,.16);--vc-pop:#fff}',
    '.mes-vc{position:relative;margin:-.9em 0 1.3em;padding:.55em .7em .5em;border:1px solid var(--vc-bd);border-top:0;border-radius:0 0 6px 6px;background:var(--vc-bg);color:var(--vc-t);font:14px/1.35 Arial,Helvetica,sans-serif;box-sizing:border-box}',
    'body.dark .mes-vc,body.dark-mode .mes-vc,body.dark .mes-vc-side,body.dark-mode .mes-vc-side{--vc-a:#6cb6f5;--vc-t:#e5e7eb;--vc-m:#a5adba;--vc-bg:#1d232b;--vc-bd:rgba(255,255,255,.14);--vc-seg:rgba(255,255,255,.2);--vc-pop:#232a33}',
    '.mes-vc.th{border-radius:0;border-left:0;border-right:0}',
    '.mes-vc *{box-sizing:border-box}',
    '.mes-vc-bar{display:flex;gap:3px;align-items:center;height:16px;cursor:pointer;touch-action:manipulation}',
    '.mes-vc-seg{position:relative;flex:1 1 0;min-width:3px;height:6px;padding:0;margin:0;border:0;border-radius:2px;background:var(--vc-seg);cursor:pointer;overflow:hidden;transition:height .12s}',
    '.mes-vc-bar:hover .mes-vc-seg{height:8px}.mes-vc-seg:hover,.mes-vc-seg:focus-visible{height:12px!important}',
    '.mes-vc-seg:focus-visible{outline:2px solid var(--vc-a);outline-offset:2px}',
    '.mes-vc-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--vc-a);pointer-events:none}',
    '.mes-vc-seg.on{box-shadow:0 0 0 1px var(--vc-a) inset}',
    '.mes-vc-row{display:flex;align-items:center;gap:.4em;margin-top:.35em;min-height:34px}',
    '.mes-vc-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:.3em;min-width:34px;height:34px;padding:0 .6em;border:1px solid var(--vc-bd);border-radius:999px;background:transparent;color:var(--vc-t);font:inherit;font-weight:600;cursor:pointer}',
    '.mes-vc-btn:hover{border-color:var(--vc-a);color:var(--vc-a)}.mes-vc-btn:disabled{opacity:.35;cursor:default;border-color:var(--vc-bd);color:var(--vc-t)}',
    '.mes-vc-btn:focus-visible{outline:2px solid var(--vc-a);outline-offset:1px}',
    '.mes-vc-now{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:none;border:0;padding:0 .2em;color:var(--vc-t);font:inherit;text-align:left;cursor:pointer}',
    '.mes-vc-now b{font-weight:700}.mes-vc-now .mes-vc-at,.mes-vc-now .mes-vc-num{color:var(--vc-m);font-variant-numeric:tabular-nums}',
    '.mes-vc-list{margin-top:.5em;border-top:1px solid var(--vc-bd);padding-top:.45em}',
    '.mes-vc-list[hidden]{display:none}',
    '.mes-vc-q{width:100%;height:34px;margin:0 0 .4em;padding:0 .7em;border:1px solid var(--vc-bd);border-radius:6px;background:var(--vc-pop);color:var(--vc-t);font:inherit}',
    '.mes-vc-ol{list-style:none;margin:0;padding:0;max-height:min(22em,55vh);overflow:auto;overscroll-behavior:contain}',
    '.mes-vc .mes-vc-ol li,.mes-vc-pan .mes-vc-ol li{margin:0;padding:0;list-style:none;font-size:inherit!important;line-height:inherit}.mes-vc-ol li::before{content:none}',
    '.mes-vc-it{display:flex;gap:.7em;width:100%;padding:.4em .5em;min-height:34px;border:0;border-radius:5px;background:none;color:var(--vc-t);font:inherit;text-align:left;cursor:pointer}',
    '.mes-vc-it:hover,.mes-vc-it:focus-visible{background:rgba(127,127,127,.14);outline:none}',
    '.mes-vc-it.on{background:rgba(39,123,182,.16);font-weight:700}body.dark .mes-vc-it.on,body.dark-mode .mes-vc-it.on{background:rgba(108,182,245,.18)}',
    '.mes-vc-it .mes-vc-at{flex:0 0 4.2em;color:var(--vc-a);font-variant-numeric:tabular-nums;font-weight:600}',
    '.mes-vc-it.sub{padding-left:1.6em}',
    '.mes-vc-none{color:var(--vc-m);padding:.4em .5em}',
    '.mes-vc-tip{position:absolute;bottom:calc(100% - .2em);left:0;z-index:7;max-width:min(22em,90%);padding:.35em .6em;border-radius:5px;background:rgba(0,0,0,.85);color:#fff;font-size:13px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;transform:translateX(-50%);display:none}',
    '.mes-vc-tip.on{display:block}.mes-vc-tip span{opacity:.8;margin-right:.6em;font-weight:700;font-variant-numeric:tabular-nums}',
    '.mes-vc-pill{position:absolute;top:10px;left:10px;z-index:3;max-width:calc(100% - 190px);padding:5px 11px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.3 Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;opacity:0;transition:opacity .35s}',
    '.mes-vc-pill.on{opacity:1}',
    'a.mes-vc-ts{font-variant-numeric:tabular-nums;font-weight:600;cursor:pointer}',
    '.mes-vc-cur{background:rgba(39,123,182,.12);border-radius:4px;box-shadow:-.35em 0 0 rgba(39,123,182,.12)}',
    'body.dark .mes-vc-cur,body.dark-mode .mes-vc-cur{background:rgba(108,182,245,.14);box-shadow:-.35em 0 0 rgba(108,182,245,.14)}',
    /* chapters beside the video: the wrapper is display:contents (no box) until side mode is on */
    '.mes-vc-side{display:contents}',
    '.mes-vc-pan{display:none}',
    '.mes-vc-side.on{position:relative;display:grid;grid-template-columns:minmax(0,1fr) var(--vc-sw,320px);margin:.6em 0 1.2em;box-sizing:border-box}',
    '.mes-vc-side.on.left{grid-template-columns:var(--vc-sw,320px) minmax(0,1fr)}',
    '.mes-vc-side.on.left>.mes-vc-pan{order:-1}',
    '.mes-vc-side.on>.video-embed,.mes-vc-side.on>#videoEmbed{margin:0!important;width:auto!important;max-width:none!important;left:auto!important;right:auto!important;padding-bottom:0!important;height:auto!important;aspect-ratio:16/9;align-self:start;border-radius:4px 0 0 4px!important}',
    '.mes-vc-side.on.left>.video-embed,.mes-vc-side.on.left>#videoEmbed{border-radius:0 4px 4px 0!important}',
    '.mes-vc-side.on.th{left:50%;width:100vw;max-width:100vw;margin-left:-50vw;margin-right:-50vw;background:#000}',
    '.mes-vc-side.on.th>.video-embed,.mes-vc-side.on.th>#videoEmbed{padding-bottom:0!important;aspect-ratio:auto;height:min(85vh,calc((100vw - var(--vc-sw,320px)) * .5625))!important;border-radius:0!important}',
    '.mes-vc-side.on>.mes-vc-pan{display:block;position:relative;min-width:0;min-height:0;border:1px solid var(--vc-bd);border-left:0;border-radius:0 6px 6px 0;background:var(--vc-bg);color:var(--vc-t);font:14px/1.35 Arial,Helvetica,sans-serif}',
    '.mes-vc-side.on.left>.mes-vc-pan{border-left:1px solid var(--vc-bd);border-right:0;border-radius:6px 0 0 6px}',
    '.mes-vc-side.on.th>.mes-vc-pan{border-radius:0;border-top:0;border-bottom:0}',
    '.mes-vc-pan *{box-sizing:border-box}',
    '.mes-vc-pin{position:absolute;inset:0;display:flex;flex-direction:column;padding:.45em .5em .5em .7em}',
    '.mes-vc-side.left .mes-vc-pin{padding:.45em .7em .5em .5em}',
    '.mes-vc-ph{display:flex;align-items:center;gap:.3em;margin-bottom:.35em}',
    '.mes-vc-ph b{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px}',
    '.mes-vc-ph .mes-vc-btn{min-width:30px;height:30px;padding:0 .45em;font-weight:600}',
    '.mes-vc-pan .mes-vc-list{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;margin:0;padding:0;border:0}',
    '.mes-vc-pan .mes-vc-q{flex:0 0 auto}',
    '.mes-vc-pan .mes-vc-ol{flex:1 1 auto;min-height:0;max-height:none}',
    '.mes-vc-grip{position:absolute;top:0;bottom:0;left:-6px;width:12px;z-index:4;cursor:col-resize;touch-action:none;background:none;border:0;padding:0;margin:0}',
    '.mes-vc-side.left .mes-vc-grip{left:auto;right:-6px}',
    '.mes-vc-grip::after{content:"";position:absolute;top:50%;left:50%;width:4px;height:44px;margin:-22px 0 0 -2px;border-radius:2px;background:var(--vc-m);opacity:.45;transition:opacity .15s}',
    '.mes-vc-grip:hover::after,.mes-vc-grip:focus-visible::after,.mes-vc-grip.drag::after{opacity:1;background:var(--vc-a)}',
    '.mes-vc-grip:focus-visible{outline:2px solid var(--vc-a);outline-offset:-2px}',
    'body.mes-vc-dragging{cursor:col-resize;-webkit-user-select:none;user-select:none}',
    'body.mes-vc-dragging iframe,body.mes-vc-dragging video{pointer-events:none}',
    '.mes-vc-sb[aria-pressed=true]{border-color:var(--vc-a);color:var(--vc-a)}',
    '.mes-vc.sideon .mes-vc-open{display:none}',
    '@media (max-width:480px){.mes-vc{font-size:13px;padding:.5em .55em}.mes-vc-btn .mes-vc-lab{display:none}}'
  ].join('');

  /* ---------- reading chapters from the page ---------- */
  function ownText(node) {
    // the text of a <li> without its nested lists
    var c = node.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('ul, ol, .mes-vc'), function (x) { x.remove(); });
    return c.textContent;
  }
  function depth(li) { var d = 0, p = li.parentElement; while (p) { if (p.tagName === 'LI') d++; p = p.parentElement; } return d; }

  // the text of the line an anchor sits on: its <li> (own text) or the stretch of a <p> between <br>s
  function lineOf(a) {
    var li = a.closest('li');
    if (li) return { text: ownText(li), node: li };
    var t = '', n = a, p = a.parentElement;
    while (n && n.previousSibling && n.previousSibling.nodeName !== 'BR') n = n.previousSibling;
    for (; n && n.nodeName !== 'BR'; n = n.nextSibling) t += n.textContent || '';
    return { text: t, node: p };
  }

  function fromJson(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tagName === 'SCRIPT' && n.classList.contains('video-chapters')) {
        try {
          return JSON.parse(n.textContent).map(function (c) { return { t: +c.t || 0, title: clean(c.title), lvl: c.sub ? 1 : 0 }; });
        } catch (e) { return null; }
      }
    }
    return null;
  }

  function fromLinks(nodes) {
    var out = [];
    nodes.forEach(function (n) {
      if (n.tagName !== 'A' || !/^\d+$/.test(n.getAttribute('data-t') || '')) return;
      var label = (n.textContent || '').trim();
      if (!new RegExp('^' + TIME + '$').test(label)) return;
      var line = lineOf(n), txt = clean(line.text);
      var at = txt.indexOf(label);
      // the time must start or end its line (a time inside a sentence is a reference, not a chapter)
      if (at > 2 && at + label.length < txt.length - 2) return;
      var title = clean(txt.slice(0, Math.max(0, at)) + ' ' + txt.slice(at + label.length));
      if (!title || title.length > 180) return;
      out.push({ t: +n.getAttribute('data-t'), title: title, lvl: line.node.tagName === 'LI' ? Math.min(1, depth(line.node)) : 0, src: line.node });
    });
    return out.length >= 2 ? out : null;
  }

  function matchLine(s) {
    s = s.replace(/\s+/g, ' ').trim();
    if (!s || s.length > 220) return null;
    var m = s.match(RE_START);
    if (m && clean(m[2])) return { time: m[1], t: toSec(m[1]), title: clean(m[2]), atStart: true };
    m = s.match(RE_END);
    if (m && clean(m[1])) return { time: m[2], t: toSec(m[2]), title: clean(m[1]), atStart: false };
    return null;
  }

  // wrap the first occurrence of `time` among the direct text of `scope` (not nested lists) in a seek link
  function linkify(scope, time, t) {
    var w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: function (x) {
        var pe = x.parentElement;
        if (pe.closest('a')) return NodeFilter.FILTER_REJECT;
        if (scope.tagName === 'LI' && pe.closest('li') !== scope) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var x;
    while ((x = w.nextNode())) {
      var i = x.data.indexOf(time);
      if (i < 0) continue;
      var tail = x.splitText(i); tail.splitText(time.length);
      var a = el('a', 'mes-vc-ts', time);
      a.href = '#t=' + t; a.setAttribute('data-vc-t', t);
      a.setAttribute('aria-label', 'Play from ' + time);
      tail.parentNode.replaceChild(a, tail);
      return a;
    }
    return null;
  }

  function fromText(nodes) {
    var lists = [], paras = [];
    nodes.forEach(function (n) {
      if ((n.tagName === 'UL' || n.tagName === 'OL') && !n.parentElement.closest('li')) lists.push(n);
      else if (n.tagName === 'P' || n.tagName === 'DIV' && !n.children.length) paras.push(n);
    });
    var cands = [];
    lists.forEach(function (ul) {
      var lis = ul.querySelectorAll('li'), hits = [];
      Array.prototype.forEach.call(lis, function (li) {
        if (li.querySelector('a[data-t]')) return;
        var m = matchLine(ownText(li));
        if (m) { m.src = li; m.lvl = Math.min(1, depth(li)); hits.push(m); }
      });
      if (hits.length >= 3 && hits.length >= lis.length * 0.6) cands.push({ node: ul, hits: hits });
    });
    paras.forEach(function (p) {
      if (!/<br/i.test(p.innerHTML) || p.querySelector('a[data-t]')) return;
      var parts = p.innerHTML.split(/<br\s*\/?>/i), hits = [];
      parts.forEach(function (h) {
        var d = document.createElement('div'); d.innerHTML = h;
        var m = matchLine(d.textContent);
        if (m) { m.src = p; m.lvl = 0; hits.push(m); }
      });
      if (hits.length >= 3 && hits.length >= parts.filter(function (h) { return h.replace(/<[^>]*>|\s|&nbsp;/g, ''); }).length * 0.6) cands.push({ node: p, hits: hits });
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    var c = cands[0];
    c.hits.forEach(function (h) {
      var a = linkify(h.src, h.time, h.t);
      // one paragraph of <br> lines: the time link marks the current line
      if (c.node.tagName === 'P') h.src = a;
    });
    return c.hits.map(function (h) { return { t: h.t, title: h.title, lvl: h.lvl, src: h.src }; });
  }

  function normalize(list) {
    if (!list) return null;
    var seen = {}, out = [];
    list.sort(function (a, b) { return a.t - b.t; }).forEach(function (c) {
      if (seen[c.t] || !c.title) return;
      seen[c.t] = 1; out.push(c);
    });
    if (out.length < 2) return null;
    if (out[0].t > 0) out.unshift({ t: 0, title: 'Start', lvl: 0, implicit: true });
    return out;
  }

  /* ---------- players ---------- */
  var ytQ = [], ytLoading = false;
  function loadYT(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    ytQ.push(cb);
    if (ytLoading) return;
    ytLoading = true;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      ytQ.splice(0).forEach(function (f) { try { f(); } catch (e) {} });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  }
  function isYT(f) { return f && f.tagName === 'IFRAME' && /youtube(-nocookie)?\.com\/embed\//.test(f.src || f.getAttribute('data-src') || ''); }
  function ytSrc(src) {
    if (/[?&]enablejsapi=1/.test(src)) return src;
    return src + (src.indexOf('?') < 0 ? '?' : '&') + 'enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  }

  function Player(embed, onChange) {
    var self = this;
    self.embed = embed; self.kind = null; self.media = null; self.yt = null; self.ytReady = false; self.pending = null;
    function bind() {
      var v = embed.querySelector('video'), f = embed.querySelector('iframe');
      var next = v || (isYT(f) ? f : null);
      if (next === self.media) return;
      self.media = next; self.yt = null; self.ytReady = false;
      self.kind = v ? 'video' : next ? 'yt' : null;
      if (self.kind === 'video') {
        ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'seeked'].forEach(function (e) { v.addEventListener(e, onChange); });
      } else if (self.kind === 'yt') {
        var src = f.getAttribute('src');
        if (src && ytSrc(src) !== src) f.setAttribute('src', ytSrc(src));
        loadYT(function () {
          if (self.media !== f) return;
          try {
            self.yt = new window.YT.Player(f, {
              events: {
                onReady: function () {
                  self.ytReady = true;
                  if (self.pending != null) { var t = self.pending; self.pending = null; self.seek(t, true); }
                  onChange();
                },
                onStateChange: onChange
              }
            });
          } catch (e) {}
        });
      }
      onChange();
    }
    bind();
    new MutationObserver(bind).observe(embed, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }
  Player.prototype.time = function () {
    if (this.kind === 'video') return this.media.currentTime || 0;
    if (this.kind === 'yt' && this.ytReady && this.yt.getCurrentTime) { try { return this.yt.getCurrentTime() || 0; } catch (e) {} }
    return 0;
  };
  Player.prototype.duration = function () {
    var d = 0;
    if (this.kind === 'video') d = this.media.duration;
    else if (this.kind === 'yt' && this.ytReady && this.yt.getDuration) { try { d = this.yt.getDuration(); } catch (e) {} }
    return isFinite(d) && d > 0 ? d : 0;
  };
  Player.prototype.playing = function () {
    if (this.kind === 'video') return !this.media.paused && !this.media.ended;
    if (this.kind === 'yt' && this.ytReady && this.yt.getPlayerState) { try { return this.yt.getPlayerState() === 1; } catch (e) {} }
    return false;
  };
  Player.prototype.seek = function (t, play) {
    var v = this.media;
    if (this.kind === 'video') {
      var go = function () {
        try { v.currentTime = t; } catch (e) {}
        if (play) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      };
      if (v.readyState >= 1) go();
      else { v.addEventListener('loadedmetadata', function h() { v.removeEventListener('loadedmetadata', h); go(); }); if (play) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
      return true;
    }
    if (this.kind === 'yt') {
      if (this.ytReady) {
        try { this.yt.seekTo(t, true); if (play) this.yt.playVideo(); return true; } catch (e) {}
      }
      this.pending = t;
      return true;
    }
    return false;
  };

  /* ---------- the strip ---------- */
  function Chapters(embed, list) {
    var self = this;
    self.embed = embed; self.list = list; self.cur = -1; self.dur = 0;
    var root = self.root = el('div', 'mes-vc');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Video chapters');
    var bar = self.bar = el('div', 'mes-vc-bar');
    var tip = self.tip = el('div', 'mes-vc-tip');
    tip.setAttribute('aria-hidden', 'true');
    self.segs = list.map(function (c, i) {
      var b = el('button', 'mes-vc-seg');
      b.type = 'button';
      b.setAttribute('aria-label', 'Chapter ' + (i + 1) + ': ' + c.title + ', ' + fmt(c.t));
      b.appendChild(el('span', 'mes-vc-fill'));
      b.addEventListener('click', function (e) {
        var d = self.dur;
        if (e.detail && d) {   // a real click with a known length: the exact spot, like a progress bar
          var r = bar.getBoundingClientRect();
          self.seek(Math.max(0, Math.min(d - 0.5, (e.clientX - r.left) / r.width * d)));
        } else self.seek(c.t);
      });
      bar.appendChild(b);
      return b;
    });
    bar.addEventListener('pointermove', function (e) { self.hover(e.clientX); });
    bar.addEventListener('pointerleave', function () { tip.classList.remove('on'); });

    var row = el('div', 'mes-vc-row');
    var prev = self.prevB = el('button', 'mes-vc-btn', '‹');
    prev.type = 'button'; prev.title = 'Previous chapter'; prev.setAttribute('aria-label', 'Previous chapter');
    var next = self.nextB = el('button', 'mes-vc-btn', '›');
    next.type = 'button'; next.title = 'Next chapter'; next.setAttribute('aria-label', 'Next chapter');
    var now = self.now = el('button', 'mes-vc-now');
    now.type = 'button'; now.title = 'Show the chapters';
    var open = self.openB = el('button', 'mes-vc-btn mes-vc-open');
    open.type = 'button';
    open.innerHTML = '<span aria-hidden="true">☰</span><span class="mes-vc-lab">Chapters</span>';
    open.setAttribute('aria-expanded', 'false');
    open.setAttribute('aria-label', 'Chapters (' + list.length + ')');
    var sideB = self.sideB = el('button', 'mes-vc-btn mes-vc-sb');
    sideB.type = 'button';
    sideB.innerHTML = '<span aria-hidden="true">▥</span><span class="mes-vc-lab">Beside video</span>';
    sideB.title = 'Show the chapters beside the video';
    sideB.setAttribute('aria-pressed', 'false');
    row.appendChild(prev); row.appendChild(now); row.appendChild(next); row.appendChild(open); row.appendChild(sideB);

    var box = self.box = el('div', 'mes-vc-list');
    box.hidden = true;
    var q = null;
    if (list.length > 8) {
      q = el('input', 'mes-vc-q');
      q.type = 'search'; q.placeholder = 'Search ' + list.length + ' chapters'; q.setAttribute('aria-label', 'Search the chapters');
      box.appendChild(q);
    }
    var ol = el('ol', 'mes-vc-ol');
    var none = el('div', 'mes-vc-none', 'No chapter matches.');
    none.hidden = true;
    self.items = list.map(function (c, i) {
      var li = el('li'), b = el('button', 'mes-vc-it' + (c.lvl ? ' sub' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'mes-vc-at', fmt(c.t)));
      b.appendChild(el('span', '', c.title));
      b.addEventListener('click', function () { self.seek(c.t); });
      li.appendChild(b); ol.appendChild(li);
      return li;
    });
    box.appendChild(ol); box.appendChild(none);
    if (q) q.addEventListener('input', function () {
      var w = q.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean), n = 0;
      list.forEach(function (c, i) {
        var hay = (c.title + ' ' + fmt(c.t)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        var ok = w.every(function (x) { return hay.indexOf(x) >= 0; });
        self.items[i].hidden = !ok; if (ok) n++;
      });
      none.hidden = n > 0;
    });

    function toggle(show) {
      if (self.sideOn) {   // the list is always shown beside the video: just bring the current chapter into view
        if (self.items[self.cur]) ol.scrollTop = Math.max(0, self.items[self.cur].offsetTop - ol.offsetTop - 40);
        return;
      }
      if (show == null) show = box.hidden;
      box.hidden = !show;
      open.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show && self.items[self.cur]) {
        var it = self.items[self.cur];
        ol.scrollTop = Math.max(0, it.offsetTop - ol.offsetTop - 40);
      }
    }
    open.addEventListener('click', function () { toggle(); });
    now.addEventListener('click', function () { toggle(); });
    prev.addEventListener('click', function () {
      var t = self.player.time(), i = self.cur;
      // like a music player: back to the start of this chapter first, unless already near it
      if (i > 0 && t - list[i].t < 3) i--;
      self.seek(list[Math.max(0, i)].t);
    });
    next.addEventListener('click', function () { if (self.cur < list.length - 1) self.seek(list[self.cur + 1].t); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toggle(false); open.focus(); } });

    root.appendChild(bar); root.appendChild(row); root.appendChild(box); root.appendChild(tip);

    // the wrapper is made once, before playback (moving an iframe later would reload it); while side mode is off it is
    // display:contents, so the page's own CSS for the box is unchanged
    var wrap = self.wrap = el('div', 'mes-vc-side');
    embed.parentNode.insertBefore(wrap, embed);
    wrap.appendChild(embed);
    var pan = self.pan = el('div', 'mes-vc-pan');
    pan.setAttribute('role', 'region');
    pan.setAttribute('aria-label', 'Chapters beside the video');
    var pin = el('div', 'mes-vc-pin');
    var ph = el('div', 'mes-vc-ph');
    ph.appendChild(el('b', '', 'Chapters (' + list.length + ')'));
    var flip = el('button', 'mes-vc-btn', '⇄');
    flip.type = 'button'; flip.title = 'Move the chapters to the other side'; flip.setAttribute('aria-label', 'Move the chapters to the other side');
    var back = el('button', 'mes-vc-btn', '×');
    back.type = 'button'; back.title = 'Put the chapters back under the video'; back.setAttribute('aria-label', 'Put the chapters back under the video');
    ph.appendChild(flip); ph.appendChild(back);
    var grip = self.grip = el('button', 'mes-vc-grip');
    grip.type = 'button';
    grip.title = 'Drag to make the chapters wider or narrower (double-click: reset)';
    grip.setAttribute('aria-label', 'Chapters width: use the left and right arrow keys');
    pin.appendChild(ph);
    pan.appendChild(pin); pan.appendChild(grip);
    wrap.appendChild(pan);
    self.pin = pin;
    wrap.parentNode.insertBefore(root, wrap.nextSibling);
    self.toggleList = toggle;

    sideB.addEventListener('click', function () { setPref({ on: self.sideOn ? 0 : 1 }); });
    back.addEventListener('click', function () { setPref({ on: 0 }); sideB.focus(); });
    flip.addEventListener('click', function () { setPref({ left: PREF.left ? 0 : 1 }); });
    grip.addEventListener('dblclick', function () { setPref({ w: DEF_W }); });
    grip.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      // the grip is on the panel's inner edge: towards the video = wider
      setPref({ w: self.clampW(PREF.w + (PREF.left ? d : -d) * (e.shiftKey ? 48 : 16)) });
    });
    grip.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      var x0 = e.clientX, w0 = self.curW || PREF.w, id = e.pointerId;
      try { grip.setPointerCapture(id); } catch (er) {}
      grip.classList.add('drag'); document.body.classList.add('mes-vc-dragging');
      function mv(ev) {
        if (ev.pointerId !== id) return;
        var dx = ev.clientX - x0;
        PREF.w = self.clampW(w0 + (PREF.left ? dx : -dx));
        applyAll();
      }
      function up(ev) {
        if (ev.pointerId !== id) return;
        grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        grip.classList.remove('drag'); document.body.classList.remove('mes-vc-dragging');
        setPref({});
      }
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });

    self.pill = el('div', 'mes-vc-pill');
    self.pill.setAttribute('aria-hidden', 'true');
    embed.appendChild(self.pill);

    self.player = new Player(embed, function () { self.update(); });
    self.side();
    embed.addEventListener('transitionend', function () { self.sync(); });
    new MutationObserver(function () { self.side(); setTimeout(function () { self.side(); }, 300); }).observe(embed, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', function () { self.sync(); });
    self.layout();
    self.update();
    setInterval(function () { if (!document.hidden) self.update(); }, 400);
  }
  Chapters.prototype.est = function () {
    var L = this.list, last = L[L.length - 1].t, gap = last / Math.max(1, L.length - 1);
    return last + Math.max(60, gap);
  };
  Chapters.prototype.layout = function () {
    var d = this.player.duration();
    if (d && d !== this.dur) {
      this.dur = d;
      // chapters past the real end (a list for a different cut of the video): hide them
      var self = this;
      this.list.forEach(function (c, i) { var out = c.t >= d; self.segs[i].hidden = out; self.items[i].hidden = out; });
    }
    var D = this.dur || this.est(), L = this.list;
    for (var i = 0; i < L.length; i++) {
      var end = i + 1 < L.length ? L[i + 1].t : D;
      this.segs[i].style.flexGrow = Math.max(0.0001, end - L[i].t);
    }
  };
  Chapters.prototype.indexAt = function (t) {
    var L = this.list, i = 0;
    while (i + 1 < L.length && L[i + 1].t <= t + 0.25) i++;
    return i;
  };
  // Theater mode: the box breaks out of the column (each page's own CSS decides how, and narrow screens may keep it in
  // the column); the strip copies the box's computed geometry so it always lines up with the picture.
  Chapters.prototype.sync = function () {
    var e = this.embed, r = this.root, th = e.classList.contains('theater-mode');
    if (this.wrap && this.wrap.classList.contains('th') !== (th && this.sideOn)) this.wrap.classList.toggle('th', th && this.sideOn);
    var g = this.sideOn ? this.wrap : e;
    var cs = th ? getComputedStyle(g) : null;
    var key = th ? [cs.width, cs.left, cs.marginLeft, cs.marginRight, this.sideOn ? 's' : ''].join() : (this.sideOn ? 's' : '');
    if (key === this.geo) return;
    this.geo = key;
    r.classList.toggle('th', th);
    r.style.width = th ? cs.width : '';
    r.style.maxWidth = th ? 'none' : '';
    r.style.left = th ? cs.left : '';
    r.style.marginLeft = th ? cs.marginLeft : '';
    r.style.marginRight = th ? cs.marginRight : '';
    var pad = th ? Math.max(12, (parseFloat(cs.width) - 1280) / 2) + 'px' : '';
    r.style.paddingLeft = r.style.paddingRight = pad;
  };
  // side mode: on when chosen and there is room (otherwise the list stays under the video)
  Chapters.prototype.clampW = function (w) {
    var avail = this.availW();
    return Math.round(Math.max(MIN_W, Math.min(MAX_W, avail * 0.5, w || DEF_W)));
  };
  Chapters.prototype.availW = function () {
    if (this.embed.classList.contains('theater-mode')) return document.documentElement.clientWidth;
    var p = this.wrap.parentElement;
    return p ? p.clientWidth : 0;
  };
  Chapters.prototype.side = function () {
    var want = !!PREF.on, fits = this.availW() >= ROOM;
    var on = want && fits, w = wrapW(this, on);
    var wrap = this.wrap, was = this.sideOn;
    this.sideOn = on;
    this.sideB.hidden = !fits;
    this.sideB.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.sideB.title = on ? 'Put the chapters back under the video' : 'Show the chapters beside the video';
    wrap.classList.toggle('on', on);
    wrap.classList.toggle('left', on && !!PREF.left);
    wrap.classList.toggle('th', on && this.embed.classList.contains('theater-mode'));
    this.root.classList.toggle('sideon', on);
    if (on) { this.curW = w; wrap.style.setProperty('--vc-sw', w + 'px'); }
    if (on !== was) {
      if (on) { this.pin.appendChild(this.box); this.box.hidden = false; this.openB.setAttribute('aria-expanded', 'true'); }
      else if (was) { this.root.insertBefore(this.box, this.tip); this.toggleList(false); }
      if (on && this.items[this.cur]) { var ol = this.box.querySelector('.mes-vc-ol'), it = this.items[this.cur]; ol.scrollTop = Math.max(0, it.offsetTop - ol.offsetTop - 40); }
      this.geo = null;
      try { window.dispatchEvent(new Event('mes-vc-side')); } catch (e) {}
    }
    this.sync();
  };
  function wrapW(c, on) { return on ? c.clampW(PREF.w) : 0; }
  Chapters.prototype.update = function () {
    if (!this.player) return;   // the Player calls back while it is still being made
    this.sync();
    var p = this.player, t = p.time(), L = this.list;
    if (p.duration() !== this.dur) this.layout();
    var D = this.dur || this.est();
    var i = this.indexAt(t);
    for (var k = 0; k < L.length; k++) {
      var end = k + 1 < L.length ? L[k + 1].t : D;
      var f = t <= L[k].t ? 0 : t >= end ? 1 : (t - L[k].t) / (end - L[k].t);
      this.segs[k].firstChild.style.width = (f * 100).toFixed(2) + '%';
    }
    if (i === this.cur) return;
    var old = this.cur;
    this.cur = i;
    var c = L[i];
    this.segs.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    this.items.forEach(function (li, k) { li.firstChild.classList.toggle('on', k === i); });
    if (old >= 0 && L[old].src) L[old].src.classList.remove('mes-vc-cur');
    if (c.src) c.src.classList.add('mes-vc-cur');
    this.now.innerHTML = '';
    this.now.appendChild(el('span', 'mes-vc-num', (i + 1) + '/' + L.length + ' '));
    this.now.appendChild(el('b', '', c.title));
    this.now.appendChild(el('span', 'mes-vc-at', ' · ' + fmt(c.t)));
    this.now.setAttribute('aria-label', 'Chapter ' + (i + 1) + ' of ' + L.length + ': ' + c.title + '. Show the chapters');
    this.prevB.disabled = i === 0 && t < 3;
    this.nextB.disabled = i >= L.length - 1;
    if (old >= 0 && p.playing()) {
      var pill = this.pill;
      pill.textContent = c.title;
      pill.classList.add('on');
      clearTimeout(this.pillT);
      this.pillT = setTimeout(function () { pill.classList.remove('on'); }, 3000);
    }
  };
  Chapters.prototype.hover = function (x) {
    var r = this.bar.getBoundingClientRect(), D = this.dur || this.est();
    var f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    var t = this.dur ? f * D : null, i;
    if (t == null) {   // length unknown: the segment under the pointer
      i = 0;
      for (var k = 0; k < this.segs.length; k++) { var s = this.segs[k].getBoundingClientRect(); if (x >= s.left - 2) i = k; }
    } else i = this.indexAt(t);
    var c = this.list[i];
    this.tip.innerHTML = '';
    this.tip.appendChild(el('span', '', fmt(t == null ? c.t : t)));
    this.tip.appendChild(document.createTextNode(c.title));
    this.tip.classList.add('on');
    var rr = this.root.getBoundingClientRect(), w = this.tip.offsetWidth / 2;
    var left = Math.max(w + 4, Math.min(rr.width - w - 4, x - rr.left));
    this.tip.style.left = left + 'px';
  };
  Chapters.prototype.seek = function (t) {
    this.player.seek(t, true);
    var self = this;
    setTimeout(function () { self.update(); }, 60);
  };

  /* ---------- side-mode preference (shared by every page) ---------- */
  var DEF_W = 320, MIN_W = 190, MAX_W = 600, ROOM = 640, KEY = 'mes-vc-side';
  var PREF = { on: 0, left: 0, w: DEF_W };
  try { var sp = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sp) { PREF.on = sp.on ? 1 : 0; PREF.left = sp.left ? 1 : 0; PREF.w = +sp.w || DEF_W; } } catch (e) {}
  function applyAll() { all.forEach(function (c) { c.side(); }); }
  function setPref(p) {
    for (var k in p) PREF[k] = p[k];
    try { localStorage.setItem(KEY, JSON.stringify(PREF)); } catch (e) {}
    applyAll();
  }
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    try { var v = JSON.parse(e.newValue || 'null'); if (v) { PREF.on = v.on ? 1 : 0; PREF.left = v.left ? 1 : 0; PREF.w = +v.w || DEF_W; applyAll(); } } catch (er) {}
  });
  var sideT = 0;
  window.addEventListener('resize', function () { clearTimeout(sideT); sideT = setTimeout(applyAll, 80); });

  /* ---------- page setup ---------- */
  var all = [];
  function inView(e) { var r = e.getBoundingClientRect(); return r.bottom > 60 && r.top < window.innerHeight; }
  function seekFrom(t, embed) {
    var c = null;
    for (var i = 0; i < all.length; i++) if (!embed || all[i].embed === embed) { c = all[i]; break; }
    if (!c) return false;
    if (!inView(c.embed)) {
      var y = c.embed.getBoundingClientRect().top + window.pageYOffset - 70;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    return c.player.seek(t, true);
  }
  window.MESChapters = { seek: seekFrom, all: all, version: 1 };

  function init() {
    var embeds = Array.prototype.slice.call(document.querySelectorAll('.video-embed'));
    if (!embeds.length) return;
    // every candidate node, in document order, grouped under the .video-embed it follows
    var regions = embeds.map(function () { return []; });
    var nodes = document.querySelectorAll('script.video-chapters, a[data-t], ul, ol, p, div');
    var e = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      while (e + 1 < embeds.length && (embeds[e + 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) e++;
      if (embeds[e].contains(n) || skip(n) && n.tagName !== 'SCRIPT') continue;
      regions[e].push(n);
    }
    var made = 0;
    embeds.forEach(function (emb, k) {
      var R = regions[k];
      var list = normalize(fromJson(R)) || normalize(fromLinks(R)) || normalize(fromText(R));
      if (!list) return;
      if (!made++) document.head.appendChild(css);
      all.push(new Chapters(emb, list));
    });
    if (!made) return;
    // the time links this script made (plain-text timestamp lines) seek the player above them
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a.mes-vc-ts[data-vc-t]');
      if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return;
      ev.preventDefault();
      var t = +a.getAttribute('data-vc-t'), emb = null;
      for (var j = embeds.length - 1; j >= 0; j--) if (embeds[j].compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) { emb = embeds[j]; break; }
      var c = null;
      all.forEach(function (x) { if (x.embed === emb) c = x; });
      seekFrom(t, c ? c.embed : null);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
