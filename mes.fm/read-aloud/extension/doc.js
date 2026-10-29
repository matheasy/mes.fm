/* MES Read Aloud: the file reader page (doc.html). The browser's own PDF viewer cannot be scripted by an extension, and a .docx just
   downloads, so this page opens the file itself (pdf.js / mammoth, both bundled: an extension may not load code from the web), shows its text
   as a reading view and reads it with the same player and highlighting as on web pages (reader.js, through window.__mesraSource).
   doc.html?src=<address of a PDF or .docx>  opens that file (http(s) or file://); without it, drop or choose a file. Nothing is uploaded. */
(function () {
  'use strict';
  var R = MESRA, $ = function (id) { return document.getElementById(id); };
  var doc = $('doc'), msg = $('msg'), srcUrl = '', tf = 1;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  function say(t, err) { msg.textContent = t || ''; msg.className = 'msg' + (err ? ' err' : ''); }
  function show(id) { ['drop', 'fileaccess', 'siteaccess'].forEach(function (k) { $(k).hidden = k !== id; }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // reader.js reads what is in #doc, starting at the first paragraph on screen (or the one you clicked last)
  var startAt = null;
  window.__mesraSource = {
    roots: function () { return doc.hidden ? [] : [doc]; },
    start: function () {
      if (startAt && startAt.isConnected) { var s = startAt; startAt = null; return s; }
      var blocks = doc.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,td,blockquote,pre');
      for (var i = 0; i < blocks.length; i++) { var r = blocks[i].getBoundingClientRect(); if (r.bottom > 80) return i === 0 ? null : blocks[i]; }
      return null;
    }
  };
  doc.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('p,li,h1,h2,h3,h4,h5,h6,td,blockquote,pre'); if (b) startAt = b; });

  // ---- PDF: text of every page, lines grouped, then paragraphs ----
  function linesOf(items) {
    var it = items.filter(function (i) { return i && typeof i.str === 'string' && i.transform; }).map(function (i) {
      return { s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, size: Math.hypot(i.transform[2], i.transform[3]) || i.height || 10, eol: !!i.hasEOL };
    });
    var lines = [], cur = null;
    it.forEach(function (i) {
      if (!i.s.trim()) { if (cur && i.eol) cur.done = true; return; }
      if (cur && !cur.done && Math.abs(cur.y - i.y) < 0.5 * Math.max(cur.size, i.size)) {
        var gap = i.x - (cur.x + cur.w);
        cur.text += (gap > 0.12 * cur.size && !/\s$/.test(cur.text) && !/^\s/.test(i.s) ? ' ' : '') + i.s; cur.w = Math.max(cur.w, i.x + i.w - cur.x); cur.size = Math.max(cur.size, i.size);
      } else { cur = { text: i.s, x: i.x, y: i.y, w: i.w, size: i.size }; lines.push(cur); }
      if (i.eol) cur.done = true;
    });
    return lines;
  }
  async function openPdf(data, name) {
    if (!window.pdfjsLib) throw new Error('The PDF reader did not load.');
    var pdf = await pdfjsLib.getDocument({ data: data, isEvalSupported: false, useSystemFonts: true }).promise;
    var frag = document.createDocumentFragment(), words = 0;
    var title = name;
    try { var meta = await pdf.getMetadata(); if (meta && meta.info && meta.info.Title && !/^microsoft word/i.test(meta.info.Title)) title = meta.info.Title; } catch (e) { /* ignore */ }
    frag.appendChild(el('h1', 'title', title));
    var pages = [];
    for (var n = 1; n <= pdf.numPages; n++) {
      if (n % 5 === 1) say('Reading page ' + n + ' of ' + pdf.numPages + '\u2026');
      var page = await pdf.getPage(n), tc = await page.getTextContent();
      pages.push(linesOf(tc.items));
      page.cleanup();
    }
    var rep = R.pdfRepeats(pages);   // running headers and footers are left out (they would be read on every page)
    pages.forEach(function (ls, i) {
      var paras = R.pdfParas(ls.filter(function (l) { return !rep(l); }));
      var sec = el('section', 'pg'); sec.setAttribute('data-page', i + 1);
      var lab = el('span', 'pgn', 'Page ' + (i + 1)); lab.setAttribute('aria-hidden', 'true'); sec.appendChild(lab);
      paras.forEach(function (t) { sec.appendChild(el('p', '', t)); words += t.split(/\s+/).length; });
      frag.appendChild(sec);
    });
    if (words < 3) throw new Error('This PDF has no text to read: it is probably a scan (pictures of pages). mes.fm/image-to-text can turn a picture of text into text.');
    return { frag: frag, info: pdf.numPages + (pdf.numPages === 1 ? ' page' : ' pages') + ', about ' + words.toLocaleString() + ' words' };
  }

  // ---- Word (.docx): mammoth turns it into plain HTML (headings, lists, tables, pictures); nothing in it can run code ----
  async function openDocx(data, name) {
    if (!window.mammoth) throw new Error('The Word reader did not load.');
    var res = await mammoth.convertToHtml({ arrayBuffer: data });
    var tpl = document.createElement('template'); tpl.innerHTML = res.value;
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(function (x) { x.remove(); });
    tpl.content.querySelectorAll('*').forEach(function (x) {
      Array.prototype.slice.call(x.attributes).forEach(function (a) { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) x.removeAttribute(a.name); });
      if (x.tagName === 'A') { x.target = '_blank'; x.rel = 'noopener'; }
    });
    var frag = document.createDocumentFragment();
    if (!tpl.content.querySelector('h1')) frag.appendChild(el('h1', 'title', name));
    frag.appendChild(tpl.content);
    var words = (res.value.replace(/<[^>]*>/g, ' ').match(/\S+/g) || []).length;
    if (!words) throw new Error('This Word file has no text to read.');
    return { frag: frag, info: 'about ' + words.toLocaleString() + ' words' };
  }
  function openText(data, name) {
    var t = new TextDecoder().decode(data), frag = document.createDocumentFragment();
    frag.appendChild(el('h1', 'title', name));
    t.split(/\r?\n\s*\r?\n/).forEach(function (p) { if (/\S/.test(p)) frag.appendChild(el('p', '', p.replace(/\s*\r?\n\s*/g, ' ').trim())); });
    return { frag: frag, info: '' };
  }

  function kindOf(name, type, bytes) {
    var b = new Uint8Array(bytes.slice(0, 5));
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';               // %PDF
    if (b[0] === 0x50 && b[1] === 0x4b) return /\.docx$/i.test(name) || /wordprocessingml/.test(type) || !/\.(xlsx|pptx|zip|odt)$/i.test(name) ? 'docx' : 'other';   // PK (zip)
    if (b[0] === 0xd0 && b[1] === 0xcf) return 'doc';                                                       // old binary Word / Office
    if (/\.(txt|md|text)$/i.test(name) || /^text\//.test(type)) return 'txt';
    return 'other';
  }
  async function openBytes(data, name, type) {
    try { if (window.__mesraStop) window.__mesraStop(); } catch (e) { /* ignore */ }
    var kind = kindOf(String(name || ''), type || '', data), out;
    name = String(name || 'Document').replace(/\.(pdf|docx|txt|md)$/i, '') || 'Document';
    document.title = name + ' · MES Read Aloud';
    say('Opening ' + name + '…');
    try {
      if (kind === 'pdf') out = await openPdf(data, name);
      else if (kind === 'docx') out = await openDocx(data, name);
      else if (kind === 'txt') out = openText(data, name);
      else if (kind === 'doc') throw new Error('This is an old Word file (.doc). Open it in Word, LibreOffice or Google Docs and save it as .docx, then open that.');
      else throw new Error('That is not a PDF, a Word (.docx) or a text file.');
    } catch (e) { doc.hidden = true; show('drop'); say(e && e.message ? e.message : 'The file could not be opened.', true); $('play').disabled = true; return; }
    doc.innerHTML = ''; doc.appendChild(out.frag); doc.hidden = false; show(null);
    doc.lang = '';
    say(name + (out.info ? ' · ' + out.info : '') + '. Press “Read aloud” (or Alt+Shift+R). Click a paragraph first to start there; double-click a word while it reads to jump to it.');
    $('play').disabled = false; $('play').focus();
    window.scrollTo(0, 0);
  }

  // ---- getting the file ----
  function readFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { openBytes(rd.result, f.name, f.type); };
    rd.onerror = function () { say('The file could not be read.', true); };
    rd.readAsArrayBuffer(f);
  }
  function nameFromUrl(u) { try { return decodeURIComponent(new URL(u).pathname.split('/').pop()) || 'Document'; } catch (e) { return 'Document'; } }
  function xhr(u) {   // fetch() does not do file:// URLs; XMLHttpRequest does, for an extension allowed to open files
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest(); x.open('GET', u); x.responseType = 'arraybuffer';
      x.onload = function () { if (x.status === 0 || (x.status >= 200 && x.status < 300)) res({ data: x.response, type: x.getResponseHeader('content-type') || '' }); else rej(new Error('HTTP ' + x.status)); };
      x.onerror = function () { rej(new Error('blocked')); };
      x.send();
    });
  }
  function originPattern(u) { try { var x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; } catch (e) { return ''; } }
  async function openUrl(u) {
    srcUrl = u;
    var name = nameFromUrl(u);
    if (/^file:/i.test(u)) {
      var allowed = await new Promise(function (res) { try { chrome.extension.isAllowedFileSchemeAccess(res); } catch (e) { res(false); } });
      if (!allowed) { show('fileaccess'); say(name + ' is a file on this computer.'); return; }
      say('Opening ' + name + '…');
      try { var r = await xhr(u); openBytes(r.data, name, r.type); } catch (e) { show('fileaccess'); say('The file could not be opened (' + e.message + '). Check that it still exists, or choose it instead.', true); }
      return;
    }
    if (!/^https?:/i.test(u)) { say('That address cannot be opened here.', true); return; }
    say('Downloading ' + name + '…');
    try {
      var resp = await fetch(u, { credentials: 'include' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      openBytes(await resp.arrayBuffer(), name, resp.headers.get('content-type') || '');
    } catch (e) {
      var pat = originPattern(u), has = await new Promise(function (res) { try { chrome.permissions.contains({ origins: [pat] }, res); } catch (x) { res(false); } });
      if (has) { show('drop'); say('The file could not be downloaded (' + e.message + '). Download it and choose it here instead.', true); return; }
      Array.prototype.forEach.call(document.querySelectorAll('.org'), function (n) { n.textContent = new URL(u).hostname; });
      show('siteaccess'); say('');
    }
  }

  $('allow').onclick = function () {
    var pat = originPattern(srcUrl);
    chrome.permissions.request({ origins: [pat] }, function (ok) { if (ok) openUrl(srcUrl); else say('Not allowed. You can still download the file and choose it here.', true); });
  };
  $('openext').onclick = function () { chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }); };
  $('retry').onclick = function () { openUrl(srcUrl); };
  ['pick', 'pick2', 'pick3', 'pick4'].forEach(function (id) { $(id).onclick = function () { $('file').click(); }; });
  $('file').onchange = function () { readFile($('file').files[0]); $('file').value = ''; };
  $('play').onclick = function () { if (window.__mesraBegin) window.__mesraBegin('auto'); };
  function setTf(k) { tf = Math.round(Math.min(2, Math.max(0.7, k)) * 10) / 10; document.documentElement.style.setProperty('--tf', tf); try { localStorage.setItem('mesra-doc-tf', tf); } catch (e) { /* ignore */ } }
  try { setTf(Number(localStorage.getItem('mesra-doc-tf')) || 1); } catch (e) { /* ignore */ }
  $('smaller').onclick = function () { setTf(tf - 0.1); };
  $('bigger').onclick = function () { setTf(tf + 0.1); };

  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); if (t === 'drop' || e.target === drop) drop.classList.remove('over'); }); });
  document.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) readFile(f); });
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.key === 'R' || e.key === 'r' || e.code === 'KeyR') && !$('play').disabled) { e.preventDefault(); window.__mesraBegin && window.__mesraBegin('auto'); }
  });

  try { chrome.tabs.getCurrent(function (t) { if (t) window.__mesraTabId = t.id; }); } catch (e) { /* ignore */ }
  var q = new URLSearchParams(location.search).get('src');
  if (q) openUrl(q); else show('drop');
})();
