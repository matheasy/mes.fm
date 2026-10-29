/* MES Read Aloud: a searchable voice list. Turns a native <select> (options, optionally inside <optgroup>s, values = voiceURI) into a button
   plus a panel with a search box (name, language, country, "online") and a list grouped by language, with a play button per voice.
   The <select> stays the source of truth: the code keeps filling it, reading .value and listening for "change"; this only mirrors it.
   Works in a page and inside a shadow root (the player): the CSS goes into the select's own root.
   MESRAPick.attach(select, { up: true|false|function, sample: 'text', voice: function (value) -> SpeechSynthesisVoice })
   Colours: --rap-bg, --rap-fg, --rap-mut, --rap-line, --rap-acc, --rap-hi (defaults = the dark player). */
(function (root) {
  'use strict';
  if (root.MESRAPick) return;
  var CSS = '.rap{position:relative;display:inline-block;max-width:100%;vertical-align:middle}' +
    '.rap-native{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;opacity:0!important}' +
    '.rap-btn{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:6px;max-width:100%;width:100%;height:34px;padding:0 8px;border-radius:8px;border:1px solid var(--rap-line,#3a3c41);background:var(--rap-bg,#2c2e33);color:var(--rap-fg,#f2f2f2);font:inherit;cursor:pointer;text-align:left;justify-content:flex-start;min-width:0}' +
    '.rap-btn:hover,.rap-btn:focus-visible,.rap-btn[aria-expanded=true]{border-color:var(--rap-acc,#4cc38a);outline:none}' +
    '.rap-btn span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rap-btn i{font-style:normal;opacity:.65;flex:none}' +
    '.rap-panel{position:absolute;z-index:2147483647;left:0;width:min(340px,calc(100vw - 24px));box-sizing:border-box;background:var(--rap-panel,#1f2023);color:var(--rap-fg,#f2f2f2);border:1px solid var(--rap-line,#3a3c41);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);padding:8px;color-scheme:var(--rap-scheme,dark);font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:left}' +
    '.rap-panel.down{top:calc(100% + 4px)}.rap-panel.up{bottom:calc(100% + 4px)}.rap-panel[hidden]{display:none}' +
    '.rap-search{all:unset;box-sizing:border-box;display:block;width:100%;padding:7px 9px;border:1px solid var(--rap-line,#3a3c41);border-radius:7px;background:var(--rap-bg,#2c2e33);color:var(--rap-fg,#f2f2f2);font:inherit;cursor:text}' +
    '.rap-search:focus{border-color:var(--rap-acc,#4cc38a)}.rap-search::placeholder{color:var(--rap-mut,#aab0b8)}' +
    '.rap-count{font-size:12px;color:var(--rap-mut,#aab0b8);margin:5px 2px}' +
    '.rap-list{max-height:min(260px,45vh);overflow:auto;margin:0;padding:0;list-style:none;overscroll-behavior:contain}' +
    '.rap-group{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--rap-mut,#aab0b8);padding:7px 5px 2px;position:sticky;top:0;background:var(--rap-panel,#1f2023)}' +
    '.rap-opt{display:flex;align-items:center;gap:6px;padding:4px 5px;border-radius:6px;cursor:pointer}' +
    '.rap-opt:hover,.rap-opt.act{background:var(--rap-hi,rgba(76,195,138,.18))}.rap-opt[aria-selected=true]{font-weight:700}.rap-opt[aria-selected=true]::before{content:"\\2713";color:var(--rap-acc,#4cc38a)}' +
    '.rap-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rap-tag{font-size:11px;color:var(--rap-mut,#aab0b8);flex:none}' +
    '.rap-play{all:unset;box-sizing:border-box;flex:none;width:24px;height:24px;border-radius:12px;border:1px solid var(--rap-line,#3a3c41);text-align:center;line-height:22px;font-size:10px;cursor:pointer;color:var(--rap-fg,#f2f2f2);min-width:0;padding:0;display:inline-block;background:transparent}' +
    '.rap-play:hover,.rap-play:focus-visible{border-color:var(--rap-acc,#4cc38a);color:var(--rap-acc,#4cc38a)}' +
    '.rap-empty{padding:8px 5px;color:var(--rap-mut,#aab0b8);font-style:italic}';

  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  function addCss(node) {
    var host = node.nodeType === 11 ? node : (node.head || node.documentElement);
    if (!host || (host.querySelector && host.querySelector('style[data-rap]'))) return;
    var s = (node.ownerDocument || node).createElement('style'); s.setAttribute('data-rap', '1'); s.textContent = CSS; host.appendChild(s);
  }

  function attach(sel, opts) {
    if (!sel || sel.__rap) return sel && sel.__rap;
    opts = opts || {};
    var doc = sel.ownerDocument, rootNode = sel.getRootNode ? sel.getRootNode() : doc;
    addCss(rootNode.nodeType === 11 ? rootNode : doc);
    var wrap = el(doc, 'div', 'rap'), btn = el(doc, 'button', 'rap-btn'), txt = el(doc, 'span'), caret = el(doc, 'i', '', '▾');
    btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.title = sel.title || 'Voice';
    btn.appendChild(txt); btn.appendChild(caret);
    var panel = el(doc, 'div', 'rap-panel down'); panel.hidden = true;
    var search = el(doc, 'input', 'rap-search'); search.type = 'search'; search.placeholder = 'Search voices: name, language, country…'; search.setAttribute('aria-label', 'Search voices'); search.autocomplete = 'off'; search.spellcheck = false;
    var count = el(doc, 'div', 'rap-count'), list = el(doc, 'ul', 'rap-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Voices');
    panel.appendChild(search); panel.appendChild(count); panel.appendChild(list);
    wrap.appendChild(btn); wrap.appendChild(panel);
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    wrap.insertBefore(sel, btn);            // keep the select inside the wrapper (hidden) so a parent's layout rules still find one element
    sel.classList.add('rap-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    if (sel.style.maxWidth) wrap.style.maxWidth = sel.style.maxWidth;

    var rows = [], active = -1;
    function label() { var o = sel.options[sel.selectedIndex]; txt.textContent = o ? o.textContent : 'Loading voices…'; btn.title = (sel.title || 'Voice') + (o ? ': ' + o.textContent : ''); }
    function build() {
      rows = [];
      Array.prototype.forEach.call(sel.children, function (c) {
        if (c.tagName === 'OPTGROUP') Array.prototype.forEach.call(c.children, function (o) { rows.push({ v: o.value, t: o.textContent, g: c.label, d: o.disabled, k: o.getAttribute('data-k') || '' }); });
        else if (c.tagName === 'OPTION') rows.push({ v: c.value, t: c.textContent, g: '', d: c.disabled, k: c.getAttribute('data-k') || '' });
      });
      label(); if (!panel.hidden) render();
    }
    function render() {
      var q = fold(search.value).trim(), words = q ? q.split(/\s+/) : [], shown = 0, lastG = null, total = 0;
      list.innerHTML = ''; active = -1;
      rows.forEach(function (r) {
        if (r.d) return;
        var isAuto = r.v === '' || r.v === 'auto';
        if (!isAuto) total++;
        if (words.length && (isAuto || !words.every(function (w) { return fold(r.t + ' ' + r.g + ' ' + r.k).indexOf(w) >= 0; }))) return;
        if (r.g && r.g !== lastG) { lastG = r.g; var g = el(doc, 'li', 'rap-group', r.g); g.setAttribute('role', 'presentation'); list.appendChild(g); }
        var li = el(doc, 'li', 'rap-opt'); li.setAttribute('role', 'option'); li.setAttribute('data-v', r.v); li.setAttribute('aria-selected', String(r.v === sel.value));
        li.appendChild(el(doc, 'span', 'rap-name', r.t));
        if (!isAuto && opts.voice) { var p = el(doc, 'button', 'rap-play', '▶'); p.type = 'button'; p.title = 'Hear this voice'; p.setAttribute('aria-label', 'Hear ' + r.t); p.setAttribute('data-v', r.v); li.appendChild(p); }
        list.appendChild(li); if (!isAuto) shown++;
      });
      count.textContent = total ? (words.length ? shown + ' of ' + total + ' voices match' : total + ' voices') : 'No voices on this device yet.';
      if (words.length && !shown && total) list.appendChild(el(doc, 'li', 'rap-empty', 'No voice matches “' + search.value + '”.'));
    }
    function place() {
      var up = typeof opts.up === 'function' ? opts.up() : opts.up;
      if (up == null) { var r = btn.getBoundingClientRect(), vh = (doc.defaultView || window).innerHeight; up = r.top > vh - r.bottom; }
      panel.classList.toggle('up', !!up); panel.classList.toggle('down', !up);
      // keep the panel inside the window: shift it left as far as needed (never past the window's left edge)
      panel.style.left = '0px';
      var br = btn.getBoundingClientRect(), vw = (doc.defaultView || window).innerWidth, w = panel.offsetWidth || 340, z = (wrap.getBoundingClientRect().width / (wrap.offsetWidth || 1)) || 1;
      var shift = Math.min(0, vw - 8 - (br.left + w * z));
      shift = Math.max(shift, 8 - br.left);
      panel.style.left = Math.round(shift / z) + 'px';
    }
    function toggle(open) {
      if (open === undefined) open = panel.hidden;
      panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) {
        search.value = ''; render(); place();
        var cur = list.querySelector('[aria-selected="true"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
        search.focus({ preventScroll: true });
      } else if (previewing) { previewing = false; try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    }
    function choose(v) {
      sel.value = v; label(); toggle(false);
      sel.dispatchEvent(new Event('change', { bubbles: true })); btn.focus();
    }
    var previewing = false;
    function preview(v) {
      if (!opts.voice || typeof speechSynthesis === 'undefined') return;
      var voice = opts.voice(v); try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      var u = new SpeechSynthesisUtterance(opts.sample || 'Hello, this is how I sound.');
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      previewing = true;
      if (opts.onPreview) opts.onPreview();
      try { speechSynthesis.speak(u); } catch (e) { /* ignore */ }
    }
    btn.addEventListener('click', function () { toggle(); });
    search.addEventListener('input', function () { render(); list.scrollTop = 0; });
    list.addEventListener('click', function (e) {
      var p = e.target.closest && e.target.closest('.rap-play'); if (p) { e.stopPropagation(); preview(p.getAttribute('data-v')); return; }
      var li = e.target.closest && e.target.closest('.rap-opt'); if (li) choose(li.getAttribute('data-v'));
    });
    function move(d) {
      var all = Array.prototype.slice.call(list.querySelectorAll('.rap-opt')); if (!all.length) return;
      if (active >= 0 && all[active]) all[active].classList.remove('act');
      active = Math.max(0, Math.min(all.length - 1, active + d)); all[active].classList.add('act'); all[active].scrollIntoView({ block: 'nearest' });
    }
    panel.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); toggle(false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); var o = list.querySelectorAll('.rap-opt')[active >= 0 ? active : 0]; if (o) choose(o.getAttribute('data-v')); }
    });
    panel.addEventListener('keyup', function (e) { e.stopPropagation(); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); toggle(true); } });
    function outside(e) { if (!panel.hidden && !(e.composedPath ? e.composedPath().indexOf(wrap) >= 0 : wrap.contains(e.target))) toggle(false); }
    (rootNode.nodeType === 11 ? rootNode : doc).addEventListener('pointerdown', outside, true);
    if (rootNode.nodeType === 11) doc.addEventListener('pointerdown', function (e) { if (!panel.hidden && e.composedPath().indexOf(wrap) < 0) toggle(false); }, true);
    var queued = false;
    new MutationObserver(function () { if (queued) return; queued = true; setTimeout(function () { queued = false; build(); }, 0); }).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['selected', 'disabled', 'label'] });
    sel.addEventListener('change', label);
    // a script setting .value changes nothing in the DOM: wrap the setter so the button follows
    try {
      var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      Object.defineProperty(sel, 'value', { configurable: true, get: function () { return d.get.call(sel); }, set: function (v) { d.set.call(sel, v); label(); if (!panel.hidden) render(); } });
    } catch (e) { /* ignore */ }
    build();
    var api = { wrap: wrap, button: btn, panel: panel, open: function () { toggle(true); }, close: function () { toggle(false); }, isOpen: function () { return !panel.hidden; }, refresh: build };
    sel.__rap = api;
    return api;
  }
  // fill a voice <select> with optgroups by language (text language first, then the browser's, then the rest). o = { textLang, auto: 'label for
  // the automatic choice' (omit for none), value, bad: function (voice) -> true if it did not speak here }. Returns a signature string.
  var dnL = null, dnR = null;
  try { dnL = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }); dnR = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }); } catch (e) { /* old browser */ }
  function langName(code) { var c = String(code || '').replace('_', '-').split('-')[0]; if (!c) return 'Other'; try { return (dnL && dnL.of(c)) || c; } catch (e) { return c; } }
  function region(code) { var r = String(code || '').replace('_', '-').split('-')[1]; if (!r) return ''; try { return (dnR && dnR.of(r.toUpperCase())) || r; } catch (e) { return r; } }
  function fillVoices(sel, voices, o) {
    o = o || {};
    var RA = root.MESRA, bad = o.bad || function () { return false; };
    var groups = RA.voiceGroups(voices || [], o.textLang || '', navigator.language || '', langName, bad);
    var doc = sel.ownerDocument;
    sel.innerHTML = '';
    if (o.auto) { var a = doc.createElement('option'); a.value = ''; a.textContent = o.auto; sel.appendChild(a); }
    groups.forEach(function (g) {
      var og = doc.createElement('optgroup'); og.label = g.label;
      g.voices.forEach(function (v) {
        var op = doc.createElement('option'), b = bad(v), rg = region(v.lang);
        op.value = v.voiceURI;
        op.textContent = (b ? '⚠ ' : '') + v.name + (rg && v.name.indexOf(rg) < 0 ? ' (' + rg + ')' : '') + (v.localService === false ? ' · online' : '') + (b ? ' · did not speak here' : '');
        op.setAttribute('data-k', v.lang + ' ' + langName(v.lang) + ' ' + rg + (v.localService === false ? ' online' : ' on device'));
        og.appendChild(op);
      });
      sel.appendChild(og);
    });
    if (o.value != null) sel.value = o.value;
    if (sel.value !== (o.value || '') && o.auto) sel.value = '';
  }
  root.MESRAPick = { attach: attach, css: CSS, fillVoices: fillVoices, langName: langName };
})(typeof self !== 'undefined' ? self : this);
