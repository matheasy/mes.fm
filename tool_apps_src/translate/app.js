/* MES Translate + Image to Text (tool_apps_src/translate; one script for mes.fm/translate and mes.fm/image-to-text).
   Engines: the browser's own Translator / LanguageDetector APIs (on this device) or MyMemory (online, keyless).
   OCR: Tesseract.js in the browser; PDFs through pdf.js. Pure helpers are MESTr (lib.js). */
(function () {
  "use strict";
  var T = window.MESTr, root = document.getElementById("tr");
  if (!T || !root) return;
  var $ = function (id) { return document.getElementById(id); };
  var MODE = root.getAttribute("data-mode") === "ocr" ? "ocr" : "translate";
  var KEY = "mes-translate:v1";
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
  var PDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var MM_URL = "https://api.mymemory.translated.net/get";

  // ---------- state ----------
  var store = { set: {}, hist: [], use: null, saved: [] };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw && typeof raw === "object") store = { set: raw.set || {}, hist: Array.isArray(raw.hist) ? raw.hist : [], use: raw.use || null, saved: Array.isArray(raw.saved) ? raw.saved : [] }; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  var S = store.set;
  var prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"]).slice();
  if (!S.from) S.from = "auto";
  if (!S.to) S.to = T.pickTarget(prefs.filter(function (c) { return T.norm(c) !== "en"; }).concat(["en"]), "");
  if (!S.engine) S.engine = "auto";
  if (S.live == null) S.live = true;
  if (S.keep == null) S.keep = true;
  if (S.oeng == null) S.oeng = true;
  if (!S.level) S.level = "line";
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };

  // ---------- language lists ----------
  var dn = null;
  try { dn = new Intl.DisplayNames([navigator.language || "en", "en"], { type: "language" }); } catch (e) {}
  function lname(c) {
    if (c === "auto") return "Detect language";
    var n = "";
    try { n = dn ? dn.of(c === "zh" ? "zh-Hans" : c) : ""; } catch (e) {}
    if (!n || n === c) n = c;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  var sorted = T.LANGS.map(function (l) { return l[0]; }).sort(function (a, b) { return lname(a).localeCompare(lname(b)); });
  function fill(sel, list, val) {
    sel.innerHTML = "";
    list.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = lname(c); sel.appendChild(o); });
    sel.value = val;
    if (sel.value !== val) sel.value = list[0];
  }
  var fromSel = $("tr-from"), toSel = $("tr-to"), engSel = $("tr-engine");
  fill(fromSel, ["auto"].concat(sorted), S.from);
  fill(toSel, sorted, S.to);
  engSel.value = S.engine;
  var olSel = $("tr-olang");
  var ocrList = sorted.filter(function (c) { return T.toTess(c); });
  if (!S.olangPicked) S.olang = "auto";
  fill(olSel, ["auto"].concat(ocrList), S.olang || "auto");

  // ---------- searchable language pickers: a button + a popover with a search box and a list (the <select> stays, hidden, as the value) ----------
  var pickers = {}, pickN = 0;
  var selValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  function makePicker(sel, opts) {
    var id = "tr-pk" + (++pickN), lab = document.querySelector('label[for="' + sel.id + '"]');
    var wrap = document.createElement("div"); wrap.className = "tr-pick" + (opts.end ? " tr-pick--end" : "");
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "tr-pickb"; btn.id = id + "-b";
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<span class="tr-pickn"></span><span class="tr-picks"></span><svg class="tr-ic tr-pickc" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    if (lab) { lab.id = lab.id || id + "-l"; lab.setAttribute("for", btn.id); btn.setAttribute("aria-labelledby", lab.id + " " + btn.id); }
    var pop = document.createElement("div"); pop.className = "tr-pickpop"; pop.hidden = true;
    pop.innerHTML = '<input type="text" class="tr-pickq" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="' + id + '-l1" placeholder="Search languages" autocomplete="off" spellcheck="false" aria-label="Search languages"><ul class="tr-pickl" id="' + id + '-l1" role="listbox" aria-label="Languages"></ul>';
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(btn); wrap.appendChild(pop); wrap.appendChild(sel); sel.hidden = true; sel.tabIndex = -1;
    var q = pop.querySelector("input"), ul = pop.querySelector("ul"), act = -1, opts2 = [];
    function codes() { return Array.prototype.map.call(sel.options, function (o) { return o.value; }); }
    function item(c) { return { c: c, n: lname(c), e: ename(c) }; }
    function refresh() {
      var v = selValue.get.call(sel);
      btn.querySelector(".tr-pickn").textContent = opts.name ? opts.name(v) : lname(v);
      var sub = opts.sub ? opts.sub(v) : "";
      btn.querySelector(".tr-picks").textContent = sub ? " (" + sub + ")" : "";
    }
    Object.defineProperty(sel, "value", { configurable: true, get: function () { return selValue.get.call(sel); }, set: function (v) { selValue.set.call(sel, v); refresh(); } });
    function render() {
      var all = codes(), v = sel.value, text = q.value, html = [], n = 0, special = all.filter(function (c) { return c === "auto"; }), rest = all.filter(function (c) { return c !== "auto"; });
      opts2 = [];
      function li(c) { opts2.push(c); var on = c === v; return '<li role="option" id="' + id + "-o" + (n++) + '" data-v="' + esc(c) + '" aria-selected="' + on + '"' + (on ? ' class="on"' : "") + ">" + esc(opts.name ? opts.name(c) : lname(c)) + (c !== "auto" && ename(c) !== lname(c) ? ' <span class="tr-dim">' + esc(ename(c)) + "</span>" : "") + "</li>"; }
      if (text.trim()) {
        var hit = T.langFilter(text, special.concat(rest).map(item), (S.recent || []).concat(prefs, T.COMMON));
        if (!hit.length) html.push('<li class="tr-pickh" role="presentation">No language matches “' + esc(text) + "”</li>");
        hit.forEach(function (it) { html.push(li(it.c)); });
      } else {
        special.forEach(function (c) { html.push(li(c)); });
        T.langGroups(rest, S.recent, prefs).forEach(function (g) {
          html.push('<li class="tr-pickh" role="presentation">' + esc(g.title) + "</li>");
          g.codes.forEach(function (c) { html.push(li(c)); });
        });
      }
      ul.innerHTML = html.join("");
      setAct(text.trim() ? 0 : Math.max(0, opts2.indexOf(v)), true);
    }
    function setAct(i, scroll) {
      var lis = ul.querySelectorAll("[role=option]"); if (!lis.length) { act = -1; q.removeAttribute("aria-activedescendant"); return; }
      act = Math.max(0, Math.min(lis.length - 1, i));
      Array.prototype.forEach.call(lis, function (l, k) { l.classList.toggle("act", k === act); });
      q.setAttribute("aria-activedescendant", lis[act].id);
      if (scroll) lis[act].scrollIntoView({ block: "nearest" });
    }
    function open(seed) {
      if (!pop.hidden) return;
      Object.keys(pickers).forEach(function (k) { if (pickers[k] !== api) pickers[k].close(); });
      pop.hidden = false; btn.setAttribute("aria-expanded", "true"); wrap.classList.add("open");
      q.value = seed || ""; render();
      setTimeout(function () { q.focus(); if (seed) q.setSelectionRange(seed.length, seed.length); }, 0);
    }
    function close(focus) { if (pop.hidden) return; pop.hidden = true; btn.setAttribute("aria-expanded", "false"); wrap.classList.remove("open"); if (focus) btn.focus(); }
    function pick(c) {
      close(true);
      if (c === sel.value) return;
      sel.value = c; if (c !== "auto") { S.recent = T.pushRecent(S.recent, c); save(); }
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    btn.addEventListener("click", function () { if (pop.hidden) open(); else close(); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
      else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(e.key); }
    });
    q.addEventListener("input", render);
    q.addEventListener("keydown", function (e) {
      var lis = ul.querySelectorAll("[role=option]");
      if (e.key === "ArrowDown") { e.preventDefault(); setAct(act + 1, true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setAct(act - 1, true); }
      else if (e.key === "PageDown") { e.preventDefault(); setAct(act + 8, true); }
      else if (e.key === "PageUp") { e.preventDefault(); setAct(act - 8, true); }
      else if (e.key === "Enter") { e.preventDefault(); if (lis[act]) pick(lis[act].getAttribute("data-v")); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "Tab") close();
    });
    ul.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep focus in the search box
    ul.addEventListener("click", function (e) { var l = e.target.closest("[role=option]"); if (l) pick(l.getAttribute("data-v")); });
    document.addEventListener("pointerdown", function (e) { if (!pop.hidden && !wrap.contains(e.target)) close(); });
    var api = { refresh: refresh, open: open, close: close, btn: btn };
    refresh();
    return api;
  }
  var dnEn = null;
  try { dnEn = new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) {}
  function ename(c) { if (c === "auto") return ""; var n = ""; try { n = dnEn ? dnEn.of(c === "zh" ? "zh-Hans" : c) : ""; } catch (e) {} return n || c; }
  if (!Array.isArray(S.recent)) S.recent = [];
  $("tr-oeng").checked = !!S.oeng;
  $("tr-live").checked = !!S.live;
  $("tr-hkeep").checked = !!S.keep;
  pickers.from = makePicker(fromSel, { sub: function (v) { return v === "auto" && detLang ? lname(detLang) : ""; } });
  pickers.to = makePicker(toSel, { end: true });
  pickers.olang = makePicker(olSel, { name: function (v) { return v === "auto" ? "Automatic" : lname(v); }, sub: function (v) { return v === "auto" && picLang ? lname(picLang) : ""; } });

  // ---------- small UI helpers ----------
  var toastT;
  function toast(msg) { var t = $("tr-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
  function msg(text, kind) { var m = $("tr-msg"); if (!text) { m.hidden = true; return; } m.hidden = false; m.className = "tu-note tr-msg" + (kind ? " tr-msg--" + kind : ""); m.innerHTML = text; }
  function prog(id, frac, label) {
    var box = $(id); if (frac == null) { box.hidden = true; return; }
    box.hidden = false; $(id + "-i").style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%"; $(id + "-t").textContent = label || "";
  }
  function copyText(s) {
    if (!s) { toast("Nothing to copy yet"); return; }
    var done = function () { toast("Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, fallback); else fallback();
    function fallback() { var ta = document.createElement("textarea"); ta.value = s; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Could not copy"); } ta.remove(); }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function loadScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = url; s.async = true; s.crossOrigin = "anonymous";
      s.onload = res; s.onerror = function () { rej(new Error("Could not load " + url.split("/")[2] + ". Check your connection or ad blocker.")); };
      document.head.appendChild(s);
    });
  }

  // ---------- text pane ----------
  var inp = $("tr-in"), out = $("tr-out"), outText = "", detLang = "";
  function setDet(c) { detLang = c || ""; $("tr-det").textContent = detLang ? "Detected: " + lname(detLang) : ""; if (pickers.from) pickers.from.refresh(); }
  function counts() {
    var n = inp.value.length;
    $("tr-count").textContent = n.toLocaleString() + (n === 1 ? " character" : " characters");
  }
  function setOut(text, lang) {
    outText = text || "";
    if (cur && cur.o !== outText) cur = null; starState();
    if (!outText) { out.innerHTML = '<span class="tr-ph">The translation appears here</span>'; out.removeAttribute("dir"); out.removeAttribute("lang"); $("tr-ocount").textContent = ""; return; }
    out.textContent = outText;
    out.setAttribute("dir", T.isRtl(lang) ? "rtl" : "ltr");
    out.setAttribute("lang", lang);
    $("tr-ocount").textContent = outText.length.toLocaleString() + " characters";
  }
  function applyDirs() {
    if (S.from !== "auto") inp.setAttribute("dir", T.isRtl(S.from) ? "rtl" : "ltr"); else inp.setAttribute("dir", "auto");
  }

  // ---------- engines ----------
  var hasApi = typeof self.Translator !== "undefined" && self.Translator && typeof self.Translator.create === "function";
  var hasDet = typeof self.LanguageDetector !== "undefined" && self.LanguageDetector && typeof self.LanguageDetector.create === "function";
  var availCache = {}, translators = {}, detector = null, detAvail = "";
  function pairKey(a, b) { return a + ">" + b; }
  // Some Chromium builds expose the APIs but never answer availability(): give up after a few seconds and use the other engine
  function within(p, ms, fallback) { return Promise.race([Promise.resolve(p), new Promise(function (res) { setTimeout(function () { res(fallback); }, ms); })]); }
  function availability(a, b) {
    if (!hasApi) return Promise.resolve("");
    var k = pairKey(a, b);
    if (availCache[k] === "available") return Promise.resolve("available");
    return within(self.Translator.availability({ sourceLanguage: T.apiCode(a), targetLanguage: T.apiCode(b) }), 4000, "unavailable")
      .then(function (v) { availCache[k] = v; return v; }, function () { availCache[k] = "unavailable"; return "unavailable"; });
  }
  function getTranslator(a, b) {
    var k = pairKey(a, b);
    if (translators[k]) return translators[k];
    translators[k] = self.Translator.create({
      sourceLanguage: T.apiCode(a), targetLanguage: T.apiCode(b),
      monitor: function (m) { m.addEventListener("downloadprogress", function (e) { prog("tr-prog", e.loaded, "Downloading the " + lname(a) + " → " + lname(b) + " language pack (one time): " + Math.round(e.loaded * 100) + "%"); }); }
    }).then(function (t) { availCache[k] = "available"; prog("tr-prog", null); return t; }, function (e) { delete translators[k]; prog("tr-prog", null); throw e; });
    return translators[k];
  }
  function detectAvail() {
    if (!hasDet) return Promise.resolve("unavailable");
    if (detAvail === "available") return Promise.resolve(detAvail);
    return within(self.LanguageDetector.availability ? self.LanguageDetector.availability() : "available", 4000, "unavailable").then(function (v) { detAvail = v; return v; }, function () { return "unavailable"; });
  }
  function detectOnDevice(text) {
    if (!detector) detector = self.LanguageDetector.create({ monitor: function (m) { m.addEventListener("downloadprogress", function (e) { prog("tr-prog", e.loaded, "Downloading the language detector (one time): " + Math.round(e.loaded * 100) + "%"); }); } })
      .then(function (d) { detAvail = "available"; prog("tr-prog", null); return d; }, function (e) { detector = null; prog("tr-prog", null); throw e; });
    return detector.then(function (d) { return d.detect(text.slice(0, 1200)); }).then(function (r) {
      var best = (r || []).filter(function (x) { return x.detectedLanguage && x.detectedLanguage !== "und"; })[0];
      return best && best.confidence > 0.35 ? T.norm(best.detectedLanguage) : "";
    });
  }
  function badge(kind, extra) {
    var b = $("tr-badge");
    if (kind === "device") { b.className = "tr-badge tr-badge--dev"; b.innerHTML = "&#128274; On this device · nothing was sent" + (extra ? " · " + extra : ""); }
    else if (kind === "online") { b.className = "tr-badge tr-badge--net"; b.innerHTML = "&#127760; Online (MyMemory) · your text was sent to translated.net" + (extra ? " · " + extra : ""); }
    else if (kind === "same") { b.className = "tr-badge"; b.textContent = "Same language: nothing to translate"; }
    else { b.className = "tr-badge"; b.innerHTML = extra || ""; }
  }
  function previewBadge() {   // before translating: say which engine *will* be used
    var to = S.to, from = S.from;
    if (S.engine === "online") { badge("", "&#127760; Will use the online service (text is sent to MyMemory)"); return; }
    if (!hasApi) { badge("", S.engine === "device" ? "This browser has no on-device translator" : "&#127760; This browser can't translate on-device: the online service will be used"); return; }
    if (from === "auto") { badge("", hasDet ? "&#128274; On this device when the language pair is supported" : "Pick the From language to translate on this device"); return; }
    availability(from, to).then(function (a) {
      var c = T.chooseEngine(S.engine, hasApi, a);
      if (c.engine === "device") badge("", "&#128274; On this device" + (c.download ? " (a one-time language-pack download first)" : " · nothing is sent"));
      else if (c.engine === "online") badge("", "&#127760; " + lname(from) + " → " + lname(to) + " isn't on this device: the online service will be used");
      else badge("", lname(from) + " → " + lname(to) + " can't be translated on this device");
    });
  }

  // Online (MyMemory, 500 bytes a request: chunked by sentence)
  function mmOne(q, from, to, signal) {
    var url = MM_URL + "?q=" + encodeURIComponent(q) + "&langpair=" + encodeURIComponent(T.myMemoryCode(from) + "|" + T.myMemoryCode(to));
    return fetch(url, { signal: signal, credentials: "omit", referrerPolicy: "no-referrer" }).then(function (r) {
      if (r.status === 429) return { error: "quota", quota: true };
      return r.json().then(function (j) { return T.pickMyMemory(j, q); });
    });
  }

  var gen = 0, ctl = null;
  function translate(gesture, auto) {
    var text = inp.value, my = ++gen;
    if (ctl) { try { ctl.abort(); } catch (e) {} ctl = null; }
    if (!text.trim()) { setOut(""); msg(""); previewBadge(); setDet(""); return Promise.resolve(); }
    var from = S.from, to = S.to;
    var step = Promise.resolve(from);
    msg("");
    if (from === "auto" && S.engine !== "online") {
      step = detectAvail().then(function (a) {
        var g = T.guessLang(text), local = g && g.conf >= 0.6 ? g.lang : "";
        if (a === "unavailable" || (!gesture && a !== "available")) return local;
        return within(detectOnDevice(text), a === "available" ? 6000 : 120000, "").catch(function () { return ""; }).then(function (r) { return r || local; });
      });
    } else if (from === "auto") { var g0 = T.guessLang(text); if (g0 && g0.conf >= 0.6) step = Promise.resolve(g0.lang); }
    return step.then(function (src) {
      if (my !== gen) return;
      if (from === "auto") setDet(src);
      if (src && src === to) { setOut(text, to); badge("same"); return; }
      var deviceTry = src && src !== "auto" ? availability(src, to) : Promise.resolve(hasApi ? "unavailable" : "");
      return deviceTry.then(function (a) {
        if (my !== gen) return;
        var choice = S.engine === "online" ? { engine: "online" } : (src ? T.chooseEngine(S.engine, hasApi, a) : (S.engine === "device" ? { engine: null, reason: hasApi ? "detect" : "noapi" } : { engine: "online", reason: "detect" }));
        if (auto && choice.engine !== "device") { previewBadge(); return; }   // typing: only translate when nothing leaves the device (a pending download says "press Translate" below)
        if (!choice.engine) {
          msg(choice.reason === "noapi" ? "This browser has no on-device translator (Chrome and Edge on a computer have one). Choose <b>Auto</b> or <b>Online</b> as the engine." :
            choice.reason === "detect" ? "Choose the <b>From</b> language: this browser can't detect it on-device." :
            "This browser can't translate " + esc(lname(src)) + " → " + esc(lname(to)) + " on-device. Choose <b>Auto</b> or <b>Online</b> as the engine.", "warn");
          badge("", ""); return;
        }
        if (choice.engine === "device") {
          if (choice.download && !gesture) { msg("Press <b>Translate</b> to download the " + esc(lname(src)) + " → " + esc(lname(to)) + " language pack (one time, then it works offline).", "info"); return; }
          return runDevice(text, src, to, my);
        }
        return runOnline(text, from === "auto" ? (src || "auto") : from, to, my);
      });
    }).catch(function (e) { if (my === gen && e && e.name !== "AbortError") { msg("Translation failed: " + esc(e.message || e), "warn"); } });
  }
  function runDevice(text, from, to, my) {
    $("tr-go").disabled = true;
    return getTranslator(from, to).then(function (tr) {
      var pieces = T.chunk(text, 1500), outs = [], i = 0;
      function next() {
        if (my !== gen) return;
        while (i < pieces.length && !pieces[i].t) { outs[i] = ""; i++; }
        if (i >= pieces.length) return;
        var k = i++;
        return tr.translate(pieces[k].t).then(function (r) { outs[k] = r; if (my === gen) setOut(T.join(pieces.slice(0, i), outs) + (i < pieces.length ? " …" : ""), to); return next(); });
      }
      return next().then(function () {
        if (my !== gen) return;
        setOut(T.join(pieces, outs), to); badge("device"); remember(text, from, to, "device");
      });
    }).catch(function (e) {
      if (my !== gen) return;
      var m = String(e && e.message || e);
      if (/activation|gesture/i.test(m)) msg("Press <b>Translate</b> to download the language pack.", "info");
      else if (S.engine === "auto") { msg("The on-device translator failed (" + esc(m) + "); using the online service.", "info"); return runOnline(text, from, to, my); }
      else msg("The on-device translator failed: " + esc(m), "warn");
    }).then(function () { $("tr-go").disabled = false; });
  }
  function runOnline(text, from, to, my) {
    var pieces = T.chunk(text, 480, T.utf8Len), outs = [], detected = "";
    var u = T.usage(store.use, today(), 0), need = text.length;
    if (u.n + need > T.DAILY) msg("The free online service allows about " + T.DAILY.toLocaleString() + " characters a day for each visitor; you have used about " + u.n.toLocaleString() + " today, so it may stop. On-device translation (Chrome or Edge on a computer) has no limit.", "info");
    ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var signal = ctl ? ctl.signal : undefined, idx = 0, failed = null, total = pieces.filter(function (p) { return p.t; }).length, done = 0;
    $("tr-go").disabled = true;
    if (total > 2) prog("tr-prog", 0, "Translating online: 0 of " + total + " pieces");
    function worker(once) {
      if (my !== gen || failed) return Promise.resolve();
      while (idx < pieces.length && !pieces[idx].t) { outs[idx] = ""; idx++; }
      if (idx >= pieces.length) return Promise.resolve();
      var k = idx++;
      var src = from === "auto" && detected ? detected : from;
      return mmOne(pieces[k].t, src, to, signal).then(function (r) {
        if (r.error) { failed = r; return; }
        if (r.detected && !detected) detected = r.detected;
        outs[k] = r.text; done++;
        if (total > 2) prog("tr-prog", done / total, "Translating online: " + done + " of " + total + " pieces");
        return once ? null : worker();
      });
    }
    // the first piece alone (it tells us the language when detecting), then three at a time
    return worker(true).then(function () { return Promise.all([worker(), worker(), worker()]); }).then(function () {
      prog("tr-prog", null); $("tr-go").disabled = false;
      if (my !== gen) return;
      store.use = T.usage(store.use, today(), need); save();
      if (failed) {
        msg(failed.quota ? "The free online service's daily limit for your connection is used up (about " + T.DAILY.toLocaleString() + " characters a day). Try again tomorrow, or use Chrome or Edge on a computer, which translate on-device with no limit." : "The online service said: " + esc(failed.error), "warn");
        if (!outs.some(Boolean)) return;
      }
      setOut(T.join(pieces, outs), to);
      if (from === "auto" && detected) setDet(detected);
      if (detected && detected === to) badge("same"); else badge("online");
      remember(text, detected || from, to, "online");
    }, function (e) {
      prog("tr-prog", null); $("tr-go").disabled = false;
      if (my === gen && e && e.name !== "AbortError") msg("Could not reach the online service (" + esc(e.message || e) + "). Check your connection.", "warn");
    });
  }

  // ---------- history ----------
  function remember(q, from, to, eng) {
    if (!q.trim() || !outText) return;
    cur = { q: q, o: outText, f: from, t: to, e: eng, d: Date.now() }; starState();
    if (MODE === "translate" && pages && pages.length && !$("tr-onote").hidden) onote(picLang ? "Read as <b>" + esc(lname(picLang)) + "</b> and translated into " + esc(lname(to)) + ". You can fix the text and translate again." : "");
    if (!S.keep) return;
    var h = store.hist, e = { q: q.slice(0, 2000), o: outText.slice(0, 3000), f: from, t: to, e: eng, d: Date.now() };
    var last = h[0];
    if (last && last.f === e.f && last.t === e.t && (q.indexOf(last.q) === 0 || last.q.indexOf(q) === 0) && Date.now() - last.d < 120000) h[0] = e;
    else h.unshift(e);
    store.hist = h.slice(0, 30); save(); drawHist();
  }
  function drawHist() {
    var ul = $("tr-hlist"), h = store.hist;
    $("tr-hcount").textContent = h.length ? "(" + h.length + ")" : "";
    ul.innerHTML = h.length ? "" : '<li class="tr-dim">Nothing yet.</li>';
    h.forEach(function (e, i) {
      var li = document.createElement("li");
      var on = T.savedIndex(store.saved, e) >= 0;
      li.innerHTML = '<button type="button" class="tr-ib tr-hstar' + (on ? " on" : "") + '" data-star="' + i + '" aria-pressed="' + on + '" aria-label="' + (on ? "Saved: remove from Saved" : "Save this translation") + '" title="' + (on ? "Saved (click to remove from Saved)" : "Save it: kept even when the history is cleared") + '">' + (on ? "&#9733;" : "&#9734;") + '</button><button type="button" class="tr-hitem" data-i="' + i + '"><span class="tr-hl">' + esc(lname(e.f)) + " → " + esc(lname(e.t)) + (e.e === "online" ? " · online" : " · on device") + '</span><span class="tr-hq" dir="auto">' + esc(e.q.slice(0, 140)) + '</span><span class="tr-ho" dir="auto">' + esc(e.o.slice(0, 140)) + '</span></button><button type="button" class="tr-ib tr-hdel" data-del="' + i + '" aria-label="Delete this one" title="Delete">&#10005;</button>';
      ul.appendChild(li);
    });
  }
  $("tr-hlist").addEventListener("click", function (ev) {
    var d = ev.target.closest("[data-del]"), it = ev.target.closest("[data-i]"), sv = ev.target.closest("[data-star]");
    if (sv) { var he = store.hist[+sv.getAttribute("data-star")]; if (he) starToggle(he); return; }
    if (d) { store.hist.splice(+d.getAttribute("data-del"), 1); save(); drawHist(); return; }
    if (it) {
      var e = store.hist[+it.getAttribute("data-i")]; if (!e) return; showEntry(e, "from your history");
    }
  });
  function showEntry(e, how) {
      S.from = e.f; S.to = e.t; fromSel.value = e.f; toSel.value = e.t; save(); applyDirs();
      inp.value = e.q; counts(); setOut(e.o, e.t); cur = { q: e.q, o: e.o, f: e.f, t: e.t, e: e.e, d: e.d }; starState(); badge(e.e === "online" ? "online" : "device", how);
      $("tr-tx").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- saved translations (the star): never pruned, not cleared with the history, kept when "Keep a history" is off ----------
  var cur = null;   // the translation now in the box: {q, o, f, t, e, d}
  function starState() {
    var b = $("tr-star"); if (!b) return; var on = !!cur && T.savedIndex(store.saved, cur) >= 0;
    b.disabled = !cur; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.title = !cur ? "Save this translation (translate something first)" : on ? "Saved: click to remove it from Saved" : "Save this translation (kept until you delete it)";
    b.innerHTML = on ? "&#9733;" : "&#9734;";
  }
  function starToggle(e) {
    var r = T.toggleSaved(store.saved, e, Date.now()); store.saved = r.list; save(); drawSaved(); drawHist(); starState();
    toast(r.on ? "Saved: find it under Saved translations" : "Removed from Saved");
    if (r.on) $("tr-savebox").open = true;
  }
  function drawSaved() {
    var ul = $("tr-slist"), L = store.saved, box = $("tr-savebox");
    $("tr-scount").textContent = L.length ? "(" + L.length + ")" : "";
    ["tr-sexptxt", "tr-sexpjson", "tr-scopyall"].forEach(function (id) { $(id).disabled = !L.length; });
    ul.innerHTML = L.length ? "" : '<li class="tr-dim tr-sempty">Nothing saved yet. Press &#9734; on a translation (or on a history row) to keep it here.</li>';
    L.forEach(function (e, i) {
      var li = document.createElement("li");
      li.innerHTML = '<button type="button" class="tr-hitem" data-si="' + i + '"><span class="tr-hl">' + esc(lname(e.f)) + " → " + esc(lname(e.t)) + " · " + esc(new Date(e.s || e.d).toLocaleDateString()) + '</span><span class="tr-hq" dir="auto">' + esc(e.q.slice(0, 200)) + '</span><span class="tr-ho" dir="auto">' + esc(e.o.slice(0, 200)) + '</span></button>' +
        '<button type="button" class="tr-ib" data-scopy="' + i + '" aria-label="Copy the translation" title="Copy the translation"><svg class="tr-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button>' +
        '<button type="button" class="tr-ib tr-hdel" data-sdel="' + i + '" aria-label="Delete from Saved" title="Delete from Saved">&#10005;</button>';
      ul.appendChild(li);
    });
    box.classList.toggle("is-empty", !L.length);
  }
  var lastDel = null;
  $("tr-slist").addEventListener("click", function (ev) {
    var c = ev.target.closest("[data-scopy]"), d = ev.target.closest("[data-sdel]"), it = ev.target.closest("[data-si]");
    if (c) { var ce = store.saved[+c.getAttribute("data-scopy")]; if (ce) copyText(ce.o); return; }
    if (d) { var k = +d.getAttribute("data-sdel"); lastDel = { e: store.saved[k], i: k }; store.saved.splice(k, 1); save(); drawSaved(); drawHist(); starState(); $("tr-sundo").hidden = false; toast("Deleted from Saved"); return; }
    if (it) { var e = store.saved[+it.getAttribute("data-si")]; if (e) showEntry(e, "from Saved"); }
  });
  $("tr-sundo").addEventListener("click", function () { if (!lastDel || !lastDel.e) return; store.saved.splice(Math.min(lastDel.i, store.saved.length), 0, lastDel.e); lastDel = null; this.hidden = true; save(); drawSaved(); drawHist(); starState(); });
  $("tr-star").addEventListener("click", function () { if (cur) starToggle(cur); });
  function dlFile(text, name, type) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
  var stamp = function () { return new Date().toISOString().slice(0, 10); };
  $("tr-sexptxt").addEventListener("click", function () { dlFile(T.savedText(store.saved, lname), "saved-translations-" + stamp() + ".txt", "text/plain;charset=utf-8"); });
  $("tr-sexpjson").addEventListener("click", function () { dlFile(T.savedJson(store.saved), "saved-translations-" + stamp() + ".json", "application/json"); });
  $("tr-scopyall").addEventListener("click", function () { copyText(T.savedText(store.saved, lname)); });
  $("tr-simp").addEventListener("click", function () { $("tr-simpf").click(); });
  $("tr-simpf").addEventListener("change", function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    f.text().then(function (t) { var r = null; try { r = T.mergeSaved(store.saved, JSON.parse(t), Date.now()); } catch (e) {} if (!r) { toast("That is not a saved-translations file"); return; } store.saved = r.list; save(); drawSaved(); drawHist(); starState(); toast(r.added ? "Added " + r.added + " saved translation" + (r.added === 1 ? "" : "s") : "Nothing new in that file"); });
  });
  window.addEventListener("storage", function (ev) { if (ev.key !== KEY) return; try { var r = JSON.parse(ev.newValue || "null"); if (r && Array.isArray(r.saved)) { store.saved = r.saved; drawSaved(); drawHist(); starState(); } } catch (e) {} });
  $("tr-hclear").addEventListener("click", function () { if (!store.hist.length) return; if (confirm("Delete the whole translation history in this browser?")) { store.hist = []; save(); drawHist(); } });
  $("tr-hkeep").addEventListener("change", function () { S.keep = this.checked; save(); });

  // ---------- events: text ----------
  var typeT;
  inp.addEventListener("input", function () {
    counts();
    clearTimeout(typeT);
    if (!inp.value.trim()) { setOut(""); setDet(""); msg(""); return; }
    if (S.live) typeT = setTimeout(function () { translate(false, true); }, 650);
  });
  $("tr-go").addEventListener("click", function () {
    clearTimeout(typeT); this.classList.remove("tr-go--pulse");
    if (MODE === "translate" && srcKey !== "text" && pages.length && unread()) { readOcr(true); return; }
    translate(true);
  });
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); translate(true); } });
  fromSel.addEventListener("change", function () {
    S.from = fromSel.value; save(); applyDirs();
    previewBadge(); if (inp.value.trim()) translate(false, true);
  });
  toSel.addEventListener("change", function () { S.to = toSel.value; save(); previewBadge(); if (inp.value.trim()) translate(false, true); });
  engSel.addEventListener("change", function () { S.engine = engSel.value; save(); msg(""); previewBadge(); });
  $("tr-live").addEventListener("change", function () { S.live = this.checked; save(); });
  $("tr-swap").addEventListener("click", function () {
    var src = S.from === "auto" ? detLang : S.from;
    if (!src) { toast("Choose the From language first"); return; }
    S.from = S.to; S.to = src; fromSel.value = S.from; toSel.value = S.to; save(); applyDirs();
    if (outText) { inp.value = outText; counts(); setOut(""); translate(true); }
    previewBadge();
  });
  $("tr-clear").addEventListener("click", function () { inp.value = ""; counts(); setOut(""); msg(""); setDet(""); inp.focus(); });
  $("tr-paste").addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { toast("Press Ctrl/⌘ + V in the box to paste"); inp.focus(); return; }
    navigator.clipboard.readText().then(function (t) { if (t) { inp.value = t; counts(); translate(true); } }, function () { toast("Press Ctrl/⌘ + V in the box to paste"); inp.focus(); });
  });
  $("tr-copy").addEventListener("click", function () { copyText(outText); });
  $("tr-link").addEventListener("click", function () {
    var q = T.buildQuery({ from: S.from, to: S.to, q: inp.value });
    copyText("https://mes.fm/" + (MODE === "ocr" ? "image-to-text" : "translate") + q);
    if (inp.value.length > 1500) toast("Copied (the link carries the first 1,500 characters)");
  });

  // read aloud
  var speaking = null;
  function say(text, lang, btn) {
    if (!("speechSynthesis" in window)) { toast("This browser can't read aloud"); return; }
    var ss = window.speechSynthesis;
    if (speaking === btn) { ss.cancel(); speaking = null; btn.classList.remove("tr-ib--on"); return; }
    ss.cancel(); document.querySelectorAll(".tr-ib--on").forEach(function (b) { b.classList.remove("tr-ib--on"); });
    if (!text.trim()) { toast("Nothing to read"); return; }
    var u = new SpeechSynthesisUtterance(text.slice(0, 4000));
    if (lang && lang !== "auto") {
      u.lang = lang === "zh-Hant" ? "zh-TW" : lang;
      var vs = ss.getVoices(), base = u.lang.toLowerCase().split("-")[0];
      var v = vs.filter(function (x) { return x.lang && x.lang.toLowerCase().replace("_", "-") === u.lang.toLowerCase(); })[0] || vs.filter(function (x) { return x.lang && x.lang.toLowerCase().split(/[-_]/)[0] === base && x.localService; })[0] || vs.filter(function (x) { return x.lang && x.lang.toLowerCase().split(/[-_]/)[0] === base; })[0];
      if (v) u.voice = v; else if (vs.length) toast("No " + lname(lang) + " voice on this device: it may sound wrong");
    }
    u.onend = u.onerror = function () { if (speaking === btn) { speaking = null; btn.classList.remove("tr-ib--on"); } };
    speaking = btn; btn.classList.add("tr-ib--on"); ss.speak(u);
  }
  $("tr-say-in").addEventListener("click", function () {
    say(inp.value, S.from === "auto" ? detLang : S.from, this);
  });
  $("tr-say-out").addEventListener("click", function () { say(outText, S.to, this); });
  if (!("speechSynthesis" in window)) { $("tr-say-in").hidden = true; $("tr-say-out").hidden = true; }


  // ---------- where the text comes from: Type or paste | Photo / file | Link | Camera ----------
  var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  var canLive = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (S.editFirst == null) S.editFirst = T.editDefault(coarse);
  if (S.camEdit == null) S.camEdit = true;
  $("tr-editfirst").checked = !!S.editFirst;
  $("tr-camedit").checked = !!S.camEdit;
  var TABS = T.sourceTabs(MODE, coarse || canLive);
  var srcBox = $("tr-src"), srcKey = "";
  if (MODE === "ocr") {   // picture first: the source switcher sits at the top of the picture card, the text box stays in the Translate card
    var after = $("tr-ocr-intro");
    [srcBox, root.querySelector(".tr-srcpanels"), $("tr-pics"), $("tr-picset")].forEach(function (el) { after.insertAdjacentElement("afterend", el); after = el; });
  }
  Array.prototype.forEach.call(srcBox.querySelectorAll("[role=tab]"), function (b) { if (TABS.indexOf(b.getAttribute("data-src")) < 0) b.remove(); });
  function setSrc(key, focus) {
    if (TABS.indexOf(key) < 0) key = TABS[0];
    if (srcKey === "cam" && key !== "cam") stopLive();
    srcKey = key;
    Array.prototype.forEach.call(srcBox.querySelectorAll("[role=tab]"), function (b) {
      var on = b.getAttribute("data-src") === key;
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    ["file", "link", "cam"].forEach(function (k) { $("tr-p-" + k).hidden = k !== key; });
    syncInput();
  }
  // what the input column shows: the text box for Text (and, in Translate, under a picture once one is added); a source panel until a picture is added
  function syncInput() {
    var key = srcKey, has = !!(pages && pages.length), pic = key !== "text";
    ["file", "link", "cam"].forEach(function (k) { $("tr-p-" + k).hidden = k !== key || (has && k !== "cam") || (has && k === "cam" && !stream); });
    $("tr-pics").hidden = !has || (MODE === "translate" && !pic);
    $("tr-picset").hidden = !pic;
    if (MODE === "translate") {
      $("tr-p-text").hidden = pic && !has;
      inp.placeholder = pic ? "The text in your picture appears here" : "Type or paste text here, or add a picture";
    }
    $("tr-livebox").hidden = MODE === "translate" && pic;
    goLabel();
  }
  function unread() { return (pages || []).some(function (p) { return !p.lines; }); }
  function goLabel() {
    var b = $("tr-go"), pic = MODE === "translate" && srcKey !== "text" && pages && pages.length;
    if (ocrBusy) { b.textContent = "Reading the picture…"; b.disabled = true; return; }
    b.disabled = false;
    b.textContent = pic && unread() ? "Read & translate" : "Translate";
  }
  srcBox.querySelector("[role=tablist]").addEventListener("click", function (e) {
    var b = e.target.closest("[role=tab]"); if (!b) return;
    setSrc(b.getAttribute("data-src"));
    var k = b.getAttribute("data-src");
    if (k === "link") setTimeout(function () { $("tr-url").focus(); }, 0);
    if (k === "text") setTimeout(function () { inp.focus(); }, 0);
  });
  srcBox.querySelector("[role=tablist]").addEventListener("keydown", function (e) {
    var k = T.nextTab(TABS, srcKey, e.key); if (k === null) return;
    e.preventDefault(); setSrc(k, true);
  });
  $("tr-editfirst").addEventListener("change", function () { S.editFirst = this.checked; save(); });
  $("tr-camedit").addEventListener("change", function () { S.camEdit = this.checked; save(); });

  // camera: a phone opens its own camera app (capture="environment"); a computer gets a live preview + Take the photo
  var camFile = $("tr-camfile"), stream = null;
  $("tr-camgo").addEventListener("click", function () { if (coarse || !canLive) camFile.click(); else startLive(); });
  camFile.addEventListener("change", function () { if (camFile.files[0]) loadFile(camFile.files[0], "cam"); camFile.value = ""; });
  function startLive() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (s) {
      stream = s; var v = $("tr-video"); v.srcObject = s; v.play().catch(function () {});
      $("tr-camview").hidden = false; syncInput();
    }, function (e) {
      toast(/NotFound|Overconstrained/i.test(e && e.name) ? "No camera found on this device" : /NotAllowed|Security/i.test(e && e.name) ? "The browser did not allow the camera" : "Could not start the camera");
    });
  }
  function stopLive() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    var v = $("tr-video"); if (v) v.srcObject = null; $("tr-camview").hidden = true;
    if (srcKey) syncInput();
  }
  $("tr-camstop").addEventListener("click", stopLive);
  $("tr-snap").addEventListener("click", function () {
    var v = $("tr-video"); if (!v.videoWidth) { toast("The camera is still starting"); return; }
    var c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
    stopLive();
    c.toBlob(function (b) { var f; try { f = new File([b], "Camera photo.jpg", { type: "image/jpeg" }); } catch (e) { f = b; f.name = "Camera photo.jpg"; } loadFile(f, "cam"); }, "image/jpeg", 0.92);
  });

  // ---------- OCR ----------
  var pages = [], pgi = 0, worker = null, workerLangs = "", ocrBusy = false, selected = {};
  var cv = $("tr-cv"), boxes = $("tr-boxes"), drop = $("tr-drop"), fileIn = $("tr-file");
  drop.addEventListener("click", function () { fileIn.click(); });
  drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", function () { if (fileIn.files[0]) loadFile(fileIn.files[0], "file"); fileIn.value = ""; });
  // drop a file (or a picture dragged from another page) anywhere on the tool
  function isFileDrag(e) { var t = e.dataTransfer && e.dataTransfer.types; return t && Array.prototype.indexOf.call(t, "Files") >= 0; }
  ["dragenter", "dragover"].forEach(function (t) { root.addEventListener(t, function (e) { if (!isFileDrag(e) && !(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "text/uri-list") >= 0)) return; e.preventDefault(); if (srcKey !== "file") setSrc("file"); drop.classList.add("tr-drop--over"); }); });
  ["dragleave", "drop"].forEach(function (t) { root.addEventListener(t, function (e) { if (t === "dragleave" && root.contains(e.relatedTarget)) return; drop.classList.remove("tr-drop--over"); }); });
  root.addEventListener("drop", function (e) {
    var dt = e.dataTransfer; if (!dt) return;
    var f = dt.files && dt.files[0];
    if (f) { e.preventDefault(); loadFile(f, "drop"); return; }
    var l = T.imageLink((dt.getData("text/uri-list") || "").split(/\r?\n/).filter(function (x) { return x && x[0] !== "#"; })[0] || dt.getData("text/plain"));
    if (l) { e.preventDefault(); $("tr-url").value = l; setSrc("link"); loadUrl(l); }
  });
  document.addEventListener("paste", function (e) {
    if (document.getElementById("mes-pp")) return;   // the picture editor is open
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { e.preventDefault(); if (srcKey === "text" && MODE === "translate") setSrc("file"); loadFile(items[i].getAsFile(), "paste"); return; }
    // a pasted link to a picture: only outside the text boxes (there a link is just text), or into the link box itself
    var t = e.target, inBox = t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.id !== "tr-url") || t.isContentEditable);
    if (inBox) return;
    var l = T.imageLink(e.clipboardData && e.clipboardData.getData("text/plain"));
    if (l) { e.preventDefault(); $("tr-url").value = l; setSrc("link"); loadUrl(l); }
  });

  // ---------- picture from a link ----------
  // First the browser fetches it itself (works when the other site allows it with CORS headers); if that fails, mes.fm/api/image-fetch
  // fetches it (public addresses only, 8 s, 4.4 MB) and the note under the box says so.
  var urlNote = $("tr-urlnote"), urlGen = 0;
  function urlMsg(html, warn) { if (!html) { urlNote.hidden = true; return; } urlNote.hidden = false; urlNote.className = "tu-note tr-urlnote" + (warn ? " tr-urlnote--warn" : ""); urlNote.innerHTML = html; }
  function okType(t) { return /^image\//.test(t) && t !== "image/svg+xml" || t === "application/pdf"; }
  function timed(url, opts, ms) {
    var ctl = window.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts)).finally(function () { clearTimeout(tm); });
  }
  function direct(url) {
    return timed(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" }, 9000).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function (b) {
      var ty = (b.type || "").split(";")[0].toLowerCase();
      if (!okType(ty) && !(ty === "" || ty === "application/octet-stream")) throw new Error("not a picture");
      return b;
    });
  }
  function viaMes(url) {
    return timed("/api/image-fetch?url=" + encodeURIComponent(url), { credentials: "omit" }, 12000).then(function (r) {
      if (r.ok) return r.blob();
      return r.json().then(function (j) { throw new Error(j && j.error || ("mes.fm answered " + r.status)); }, function () { throw new Error(r.status === 404 ? "The mes.fm link fetcher is not available here." : "mes.fm answered " + r.status); });
    });
  }
  function loadUrl(raw) {
    var url = T.imageLink(raw);
    if (!url) { urlMsg("That is not a web link to a picture (it should start with https://).", true); return Promise.resolve(); }
    var my = ++urlGen, how = "direct", host = "";
    try { host = new URL(url).hostname; } catch (e) {}
    urlMsg("Opening the picture from " + esc(host) + "…");
    $("tr-urlgo").disabled = true;
    return direct(url).catch(function () {
      if (my !== urlGen) throw new Error("stale");
      how = "mes";
      urlMsg(esc(host) + " doesn't let other sites load its pictures directly, so mes.fm is fetching it for you…");
      return viaMes(url);
    }).then(function (b) {
      if (my !== urlGen) return;
      var ty = (b.type || "").split(";")[0].toLowerCase();
      if (!okType(ty)) ty = /\.pdf(\?|$)/i.test(url) ? "application/pdf" : (ty || "image/png");
      var name = T.linkName(url, ty), f;
      try { f = new File([b], name, { type: ty }); } catch (e) { f = b; f.name = name; }
      urlMsg(how === "mes"
        ? "Fetched through mes.fm because " + esc(host) + " doesn't allow pictures to be loaded straight into other sites. mes.fm passed the file on and kept no copy; the picture itself is still read only in your browser."
        : "Opened straight from " + esc(host) + " in your browser.");
      return loadFile(f, "link");
    }).catch(function (e) {
      if (my !== urlGen || String(e && e.message) === "stale") return;
      urlMsg("Could not open that link: " + esc(e && e.message || e) + " You can save the picture and drop the file here instead.", true);
    }).then(function () { if (my === urlGen) $("tr-urlgo").disabled = false; });
  }
  $("tr-urlform").addEventListener("submit", function (e) { e.preventDefault(); loadUrl($("tr-url").value); });
  function reread() { if (!pages.length) return; if (ocrBusy) cancelOcr(); pages.forEach(function (p) { p.lines = null; }); readLangs = ""; selected = {}; drawBoxes(); readOcr(false); }
  olSel.addEventListener("change", function () { S.olang = olSel.value; S.olangPicked = true; save(); reread(); });
  $("tr-oeng").addEventListener("change", function () { S.oeng = this.checked; save(); reread(); });

  function decodeImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); }).catch(viaImg);
    }
    return viaImg();
    function viaImg() {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), im = new Image();
        im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
        im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("This picture can't be opened in this browser (HEIC works only in Safari).")); };
        im.src = url;
      });
    }
  }
  // the picture as decoded (upright, at most 4000 px): what the editor starts from
  function srcCanvas(bmp) {
    var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, 4000 / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }
  // the copy that is read: shrunk or enlarged to a size Tesseract likes, on white
  function toCanvas(src, w, h) {
    var k = T.ocrScale(w, h), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // transparent PNGs: text on white
    g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  var prepP = null;
  function photoPrep() {
    if (window.MESPhotoPrep) return Promise.resolve(window.MESPhotoPrep);
    if (!prepP) prepP = loadScript("/main_js/photo-prep.js?v=1").then(function () { return window.MESPhotoPrep; }, function (e) { prepP = null; throw e; });
    return prepP;
  }
  function editCanvas(c, name) {
    return photoPrep().then(function (P) {
      return P.open(c, { title: "Edit picture" + (name ? ": " + name : ""), done: "Use this picture", mime: "image/png", maxSide: 4000 });
    });
  }
  function pageFrom(c, name) { return { src: c, canvas: toCanvas(c, c.width, c.height), name: name, w: c.width, h: c.height, lines: null, text: "", edited: false }; }
  var loadGen = 0;
  function loadFile(file, how) {
    if (ocrBusy) cancelOcr();
    var my = ++loadGen;
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (srcKey === "text") setSrc("file");
    var name = file.name || (how === "cam" ? "Camera photo" : "Pasted picture"), wantEdit = !isPdf && (how === "cam" ? S.camEdit : S.editFirst), skipRead = false;
    var job = isPdf ? loadPdf(file).then(function (ps) { return ps.map(function (p) { return pageFrom(p.canvas, p.name); }); }) : decodeImage(file).then(function (bmp) {
      var c = srcCanvas(bmp); if (bmp.close) bmp.close();
      if (!wantEdit) return [pageFrom(c, name)];
      return editCanvas(c, name).then(function (r) {
        if (!r) { skipRead = true; return [pageFrom(c, name)]; }
        var p = pageFrom(r.canvas, name); p.edited = r.edited; return [p];
      }, function () { toast("The picture editor could not load: reading the picture as it is"); return [pageFrom(c, name)]; });
    });
    return job.then(function (ps) {
      if (my !== loadGen) return;
      pages = ps; pgi = 0; selected = {}; picLang = ""; onote("");
      $("tr-otext").value = ""; $("tr-ostat").textContent = isPdf ? "PDF: " + ps.length + (ps.length === 1 ? " page" : " pages") + " ready" : "";
      if (MODE === "translate") { inp.value = ""; counts(); setOut(""); setDet(""); msg(""); }
      drawPages(); showPage(0); syncInput();
      if (skipRead) { onote("Press <b>Read &amp; translate</b> when the picture is ready.", "info"); return; }
      readOcr(false);
    }).catch(function (e) { toast(String(e.message || e)); syncInput(); });
  }
  function loadPdf(file) {
    var p = window.pdfjsLib ? Promise.resolve() : loadScript(PDF_URL);
    prog("tr-oprog", 0.02, "Opening the PDF…");
    return p.then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return file.arrayBuffer();
    }).then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; }).then(function (doc) {
      var n = Math.min(doc.numPages, 5), list = [], i = 1;
      function next() {
        if (i > n) return list;
        var num = i++;
        return doc.getPage(num).then(function (pg) {
          var v0 = pg.getViewport({ scale: 1 }), k = Math.min(3, 2200 / Math.max(v0.width, v0.height)), vp = pg.getViewport({ scale: k });
          var c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
          prog("tr-oprog", num / n * 0.9, "Drawing page " + num + " of " + n + "…");
          return pg.render({ canvasContext: g, viewport: vp }).promise.then(function () { list.push({ canvas: c, name: "Page " + num }); return next(); });
        });
      }
      return Promise.resolve(next()).then(function (l) {
        prog("tr-oprog", null);
        if (doc.numPages > n) toast("The first " + n + " of " + doc.numPages + " pages are read");
        return l;
      });
    }).catch(function (e) { prog("tr-oprog", null); throw new Error(/password/i.test(String(e && e.name || e)) ? "This PDF has a password." : "Could not open this PDF (" + (e.message || e) + ")."); });
  }
  function drawPages() {
    var el = $("tr-thumbs"); el.innerHTML = "";
    pages.forEach(function (p, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "tr-thumb"; b.setAttribute("data-pg", i); b.setAttribute("aria-pressed", i === pgi ? "true" : "false");
      b.title = "Edit " + p.name; b.setAttribute("aria-label", "Edit " + p.name);
      var k = Math.min(1, 168 / Math.max(p.src.width, p.src.height)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(p.src.width * k)); c.height = Math.max(1, Math.round(p.src.height * k)); c.getContext("2d").drawImage(p.src, 0, 0, c.width, c.height);
      c.setAttribute("aria-hidden", "true");
      var s = document.createElement("span"); s.textContent = p.name;
      b.appendChild(c); b.appendChild(s);
      var e2 = document.createElement("span"); e2.className = "tr-thumbed"; e2.setAttribute("aria-hidden", "true"); e2.textContent = p.edited ? "✎ Edited" : "✎ Edit"; b.appendChild(e2);
      el.appendChild(b);
    });
    $("tr-oedit").textContent = pages.length > 1 ? "✎ Edit this page" : "✎ Edit";
  }
  $("tr-thumbs").addEventListener("click", function (e) { var b = e.target.closest("[data-pg]"); if (!b) return; showPage(+b.getAttribute("data-pg")); editPage(); });
  $("tr-oedit").addEventListener("click", editPage);
  $("tr-oother").addEventListener("click", function () { if (srcKey === "cam") $("tr-camgo").click(); else fileIn.click(); });
  $("tr-oclear").addEventListener("click", function () {
    if (ocrBusy) cancelOcr();
    pages = []; selected = {}; picLang = ""; onote(""); $("tr-thumbs").innerHTML = ""; $("tr-ocr").hidden = MODE === "translate"; $("tr-ores").hidden = true; $("tr-otext").value = ""; $("tr-ostat").textContent = "";
    if (MODE === "translate") { inp.value = ""; counts(); setOut(""); setDet(""); msg(""); }
    if (pickers.olang) pickers.olang.refresh();
    syncInput();
  });
  function onote(html, kind) { var n = $("tr-onote"); if (!html) { n.hidden = true; return; } n.hidden = false; n.className = "tr-onote" + (kind ? " tr-onote--" + kind : ""); n.innerHTML = html; }
  function editPage() {
    var p = pages[pgi]; if (!p) return;
    if (ocrBusy) cancelOcr();
    var at = pgi;
    editCanvas(p.src, p.name).then(function (r) {
      if (!r || !pages[at]) return;
      if (!r.edited) { toast("No changes"); return; }
      var np = pageFrom(r.canvas, p.name); np.edited = true; pages[at] = np; selected = {};
      drawPages(); showPage(at); readOcr(false);
    }, function (e) { toast(String(e && e.message || e)); });
  }
  function showPage(i) {
    pgi = i; var p = pages[i]; if (!p) return;
    $("tr-ocr").hidden = false; $("tr-ores").hidden = false;
    cv.width = p.canvas.width; cv.height = p.canvas.height; cv.getContext("2d").drawImage(p.canvas, 0, 0);
    $("tr-stage").style.aspectRatio = p.canvas.width + " / " + p.canvas.height;
    Array.prototype.forEach.call($("tr-thumbs").querySelectorAll("[data-pg]"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-pg") === i ? "true" : "false"); });
    drawBoxes();
  }
  function confClass(c) { return c >= 80 ? "ok" : c >= 55 ? "mid" : "low"; }
  function drawBoxes() {
    var p = pages[pgi]; boxes.innerHTML = "";
    if (!p || !p.lines) return;
    var W = p.canvas.width, H = p.canvas.height, html = [];
    p.lines.forEach(function (l, li) {
      var items = S.level === "word" ? l.words.map(function (w, wi) { return { t: w.text, b: w.box, c: w.conf, id: pgi + ":" + li + ":" + wi }; }) : [{ t: l.text, b: l.box, c: l.conf, id: pgi + ":" + li }];
      items.forEach(function (it) {
        if (!it.b) return;
        var x = it.b.x0 / W * 100, y = it.b.y0 / H * 100, w = (it.b.x1 - it.b.x0) / W * 100, h = (it.b.y1 - it.b.y0) / H * 100;
        html.push('<button type="button" class="tr-b tr-b--' + confClass(it.c) + (selected[it.id] ? " tr-b--sel" : "") + '" data-id="' + it.id + '" style="left:' + x.toFixed(3) + "%;top:" + y.toFixed(3) + "%;width:" + w.toFixed(3) + "%;height:" + h.toFixed(3) + '%" title="' + esc(it.t) + " (" + it.c + '% sure)" aria-label="' + esc(it.t) + '" aria-pressed="' + !!selected[it.id] + '"></button>');
      });
    });
    boxes.innerHTML = html.join("");
  }
  function selText() {
    var parts = [];
    pages.forEach(function (p, pi) {
      if (!p.lines) return;
      p.lines.forEach(function (l, li) {
        if (selected[pi + ":" + li]) { parts.push(l.text); return; }
        var ws = l.words.filter(function (w, wi) { return selected[pi + ":" + li + ":" + wi]; }).map(function (w) { return w.text; });
        if (ws.length) parts.push(ws.join(" "));
      });
    });
    return parts.join("\n");
  }
  function selChanged() {
    var n = Object.keys(selected).length;
    ["tr-ousesel", "tr-ousesel2"].forEach(function (id) {
      $(id).disabled = !n;
      $(id).textContent = n ? "Translate the " + n + " selected " + (n === 1 ? "box" : "boxes") : "Translate only the selected boxes";
    });
    var t = selText(), ta = $("tr-otext");
    if (t && MODE === "ocr") { var at = ta.value.indexOf(t.split("\n")[0]); if (at >= 0 && document.activeElement !== ta) { try { ta.setSelectionRange(at, at + t.split("\n")[0].length); } catch (e) {} } }
  }
  boxes.addEventListener("click", function (e) {
    var b = e.target.closest(".tr-b"); if (!b) return;
    var id = b.getAttribute("data-id");
    if (selected[id]) delete selected[id]; else selected[id] = 1;
    b.classList.toggle("tr-b--sel", !!selected[id]); b.setAttribute("aria-pressed", !!selected[id]);
    selChanged();
  });
  $("tr-selall").addEventListener("click", function () {
    var p = pages[pgi]; if (!p || !p.lines) return;
    p.lines.forEach(function (l, li) { if (S.level === "word") l.words.forEach(function (w, wi) { selected[pgi + ":" + li + ":" + wi] = 1; }); else selected[pgi + ":" + li] = 1; });
    drawBoxes(); selChanged();
  });
  $("tr-selnone").addEventListener("click", function () { selected = {}; drawBoxes(); selChanged(); });
  $("tr-level").addEventListener("click", function (e) {
    var b = e.target.closest("[data-v]"); if (!b) return;
    S.level = b.getAttribute("data-v"); save(); selected = {};
    Array.prototype.forEach.call(this.querySelectorAll("[data-v]"), function (x) { x.setAttribute("aria-pressed", x === b); });
    drawBoxes(); selChanged();
  });
  Array.prototype.forEach.call($("tr-level").querySelectorAll("[data-v]"), function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-v") === S.level); });

  function getWorker(langs) {
    var p = window.Tesseract ? Promise.resolve() : loadScript(TESS_URL);
    return p.then(function () {
      if (worker && workerLangs === langs) return worker;
      var old = worker; worker = null; if (old) old.terminate();
      workerLangs = langs;
      return window.Tesseract.createWorker(langs.split("+"), 1, { logger: logOcr, errorHandler: function () {} }).then(function (w) { worker = w; return w; });
    });
  }
  var ocrPage = 0, ocrPages = 1;
  function logOcr(m) {
    if (!m || !m.status) return;
    var base = ocrPages > 1 ? "Page " + (ocrPage + 1) + " of " + ocrPages + ": " : "";
    if (/loading language|loading tesseract|initializ/i.test(m.status)) prog("tr-oprog", (m.progress || 0) * 0.3, base + (/language/i.test(m.status) ? "Downloading the " + lname(T.fromTess(workerLangs) || "en") + " reading data (cached after the first time)…" : "Starting the text reader…"));
    else if (/recogniz/i.test(m.status)) prog("tr-oprog", 0.3 + (m.progress || 0) * 0.7, base + "Reading the text: " + Math.round((m.progress || 0) * 100) + "%");
  }
  var readLangs = "", picLang = "";
  // Read every page not read yet. "Automatic" picture language: read with the From language (else the browser's), guess the
  // language of what came out, and read again in that language when it is clearly another one (so a Spanish picture keeps its accents).
  function readOcr(gesture) {
    if (!pages.length || ocrBusy) return;
    var auto = olSel.value === "auto";
    runPass(T.ocrFirst(olSel.value, S.from, prefs), gesture, auto, 0);
  }
  function runPass(lang, gesture, mayRecheck, t0) {
    var langs = T.tessLangs(lang, $("tr-oeng").checked);
    if (langs !== readLangs) pages.forEach(function (p) { p.lines = null; });
    readLangs = langs;
    ocrBusy = true; goLabel();
    t0 = t0 || Date.now();
    var todo = pages.filter(function (p) { return !p.lines; });
    ocrPages = pages.length;
    prog("tr-oprog", 0.01, "Loading the text reader…");
    getWorker(langs).then(function (w) {
      var i = 0;
      function next() {
        if (!ocrBusy || i >= todo.length) return;
        var p = todo[i++]; ocrPage = pages.indexOf(p);
        return w.recognize(p.canvas, {}, { text: true, blocks: true }).then(function (r) {
          p.lines = T.ocrLines(r.data);
          p.text = p.lines.map(function (l) { return l.text; }).join("\n");
          if (pages[pgi] === p) drawBoxes();
          return next();
        });
      }
      return next();
    }).then(function () {
      if (!ocrBusy) return;
      var all = pages.map(function (p) { return (pages.length > 1 ? "— " + p.name + " —\n" : "") + (p.text || ""); }).join("\n\n").trim();
      if (!all) return done(all, lang, null);
      prog("tr-oprog", 0.98, "Working out the language…");
      return detectText(all, gesture).then(function (g) {
        if (!ocrBusy) return;
        var again = mayRecheck ? T.ocrRecheck(lang, g) : null;
        if (again) {
          ocrBusy = false;
          onote("The text looks like " + esc(lname(again)) + ": reading it again in " + esc(lname(again)) + "…", "info");
          return runPass(again, gesture, false, t0);
        }
        done(all, lang, g);
      });
    }).catch(function (e) {
      ocrBusy = false; prog("tr-oprog", null); goLabel();
      if (worker) { try { worker.terminate(); } catch (x) {} worker = null; workerLangs = ""; }
      onote("The text reader failed: " + esc(e && e.message || e), "warn");
    });
    function done(all, lang, g) {
      ocrBusy = false; prog("tr-oprog", null);
      var lines = 0, conf = 0, nw = 0;
      pages.forEach(function (p) { (p.lines || []).forEach(function (l) { lines++; l.words.forEach(function (w) { conf += w.conf; nw++; }); }); });
      picLang = olSel.value !== "auto" ? olSel.value : g && g.conf >= 0.5 ? T.norm(g.lang) : "";
      if (pickers.olang) pickers.olang.refresh();
      $("tr-otext").value = all;
      $("tr-otext").setAttribute("dir", T.isRtl(picLang || lang) ? "rtl" : "auto");
      $("tr-ostat").textContent = all ? lines + " lines · " + nw + " words · " + Math.round(nw ? conf / nw : 0) + "% sure · " + ((Date.now() - t0) / 1000).toFixed(1) + " s" : "";
      drawBoxes(); selChanged(); goLabel();
      if (!all) {
        onote("No text was found. Choose the <b>Language in the picture</b> under Reading options, or press <b>Edit picture</b> to crop, straighten or <i>Make text clearer</i>.", "warn");
        if (MODE === "translate") $("tr-picset").open = true;
        return;
      }
      if (MODE === "translate") textToInput(all, picLang, gesture);
      else {
        var r = setLangsFor(picLang);
        onote(picLang ? "Read as " + esc(lname(picLang)) + (olSel.value === "auto" ? " (detected)" : "") + "." + (r ? " Translating below would go " + esc(lname(S.from)) + " → " + esc(lname(S.to)) + "." : "") : langUnknownNote(nw ? conf / nw : 0), picLang ? "" : "info");
      }
    }
  }
  function langUnknownNote(avg) {
    return "Couldn't tell the language of the text" + (avg < 60 ? " (the reading looks unsure)" : "") + ". If it isn't in the Latin alphabet, choose the <b>Language in the picture</b> under Reading options.";
  }
  function detectText(text, gesture) {
    var local = T.guessLang(text);
    if (!hasDet) return Promise.resolve(local);
    return detectAvail().then(function (a) {
      if (a === "unavailable" || (!gesture && a !== "available")) return local;
      return within(detectOnDevice(text).then(function (c) { return c ? { lang: c, conf: 0.9, by: "device" } : local; }), 8000, local).catch(function () { return local; });
    });
  }
  // the picture's language becomes From; To moves away from it when they are the same. Returns true when anything changed.
  function setLangsFor(lang) {
    var r = T.afterOcrLangs(lang, S.to, prefs, S.from); if (!r) return false;
    var ch = r.from !== S.from || r.to !== S.to;
    S.from = r.from; S.to = r.to; fromSel.value = S.from; toSel.value = S.to; S.recent = T.pushRecent(S.recent, S.from); save(); applyDirs(); setDet("");
    return ch;
  }
  function cancelOcr() {
    ocrBusy = false; prog("tr-oprog", null); goLabel();
    if (worker) { try { worker.terminate(); } catch (e) {} worker = null; workerLangs = ""; }
  }
  $("tr-ocancel").addEventListener("click", cancelOcr);
  $("tr-ocopy").addEventListener("click", function () { copyText($("tr-otext").value); });
  $("tr-otxt").addEventListener("click", function () {
    var t = $("tr-otext").value; if (!t) { toast("Nothing to save yet"); return; }
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
    a.download = ((pages[0] && pages[0].name) || "text").replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\- ]+/g, "") + ".txt";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });
  // text from the picture goes into the box you translate; its language becomes From (and To moves away from it)
  function textToInput(t, lang, gesture) {
    if (!t.trim()) { toast("No text to translate yet"); return false; }
    inp.value = T.ocrParagraphs(t); counts();
    if (lang) setLangsFor(lang);
    var head = lang ? "Read as <b>" + esc(lname(lang)) + "</b>" + (olSel.value === "auto" ? " (detected)" : "") + ". " : "";
    if (!lang) onote(langUnknownNote(100), "info");
    if (gesture) { onote(head + "Translating into " + esc(lname(S.to)) + "…"); translate(true).then(function () { if (outText) onote(head + "Translated into " + esc(lname(S.to)) + ". You can fix the text and translate again."); }); return true; }
    var g0 = gen + 1;
    translate(false, true).then(function () {
      if (outText && gen === g0) onote(head + "Translated into " + esc(lname(S.to)) + " on this device.");
      else if (gen === g0 && lang) onote(head + "Press <b>Translate</b> to translate it into " + esc(lname(S.to)) + ".", "info");
      if (!outText) $("tr-go").classList.add("tr-go--pulse");
    });
    return true;
  }
  function useText(t) {
    if (!textToInput(t, picLang, true)) return;
    $("tr-tx").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("tr-ouse").addEventListener("click", function () { useText($("tr-otext").value); });
  $("tr-ousesel").addEventListener("click", function () { useText(selText()); });
  $("tr-ousesel2").addEventListener("click", function () { useText(selText()); });

  // ---------- layout: Side by side | Stacked, Full width ----------
  function applyLayout() {
    var L = T.layoutOf(S);
    root.classList.toggle("tr-stack", L.lay === "stack");
    document.body.classList.toggle("tr-wide", L.full);
    Array.prototype.forEach.call($("tr-lay").querySelectorAll("[data-v]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === L.lay); });
    $("tr-fullw").setAttribute("aria-pressed", L.full);
    window.dispatchEvent(new Event("resize"));      // the sidebar script re-checks its column / ad slot
  }
  $("tr-lay").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; S.lay = b.getAttribute("data-v"); save(); applyLayout(); });
  $("tr-fullw").addEventListener("click", function () { S.full = !T.layoutOf(S).full; save(); applyLayout(); });

  // ---------- Fill window / Full screen: only the box whose button was pressed, with its own bar (copy, read aloud, full screen, close) ----------
  var filled = null, toastHome = $("tr-toast").parentNode;
  var BOX = { in: $("tr-p-text"), out: root.querySelector(".tr-pane--out"), ocr: $("tr-obox") };
  function boxText(key) { return key === "in" ? inp.value : key === "out" ? outText : $("tr-otext").value; }
  function boxEdit(key) { return key === "in" ? inp : key === "out" ? out : $("tr-otext"); }
  function keyOf(el) { return el && el.getAttribute("data-box"); }
  function fsOf() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function goFull(el) {
    var f = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!f) { toast("This browser has no full screen for page parts, so the box fills the window instead"); return; }
    var r = f.call(el); if (r && r.then) r.then(function () { el.appendChild($("tr-toast")); el.classList.add("tr-fs-on"); }, function () { toast("Full screen isn't allowed here, so the box fills the window instead"); });
    else { el.appendChild($("tr-toast")); el.classList.add("tr-fs-on"); }
  }
  function exitFull() { var x = document.exitFullscreen || document.webkitExitFullscreen; if (fsOf() && x) { var r = x.call(document); if (r && r.catch) r.catch(function () {}); } }
  function fillOpen(key, full) {
    var el = BOX[key]; if (!el) return;
    if (filled && filled !== el) fillClose();
    filled = el; el.classList.add("tr-fill"); document.documentElement.classList.add("tr-locked");
    var sayBtn = el.querySelector('[data-fb="say"]'); if (sayBtn) sayBtn.hidden = !("speechSynthesis" in window);
    if (full) goFull(el);
    var ed = boxEdit(key); setTimeout(function () { if (ed && ed.focus) ed.focus({ preventScroll: true }); }, 30);
  }
  function fillClose() {
    if (!filled) return;
    var el = filled; filled = null;
    if (fsOf() === el) exitFull();
    el.classList.remove("tr-fs-on"); toastHome.appendChild($("tr-toast"));
    el.classList.remove("tr-fill"); document.documentElement.classList.remove("tr-locked");
    var b = el.querySelector("[data-fill]"); if (b) b.focus({ preventScroll: true });
  }
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fill], [data-fs], [data-fillx], [data-fb]"); if (!b) return;
    if (b.hasAttribute("data-fillx")) { fillClose(); return; }
    var box = b.closest(".tr-box"), key = b.getAttribute("data-fill") || b.getAttribute("data-fs") || keyOf(box);
    var fb = b.getAttribute("data-fb");
    if (fb === "copy") { copyText(boxText(key)); return; }
    if (fb === "say") { ($(key === "in" ? "tr-say-in" : key === "out" ? "tr-say-out" : "") || { click: function () { say($("tr-otext").value, olSel.value, b); } }).click(); return; }
    if (fb === "fs") { if (fsOf() === filled) { exitFull(); } else goFull(filled); return; }
    var full = b.hasAttribute("data-fs");
    if (filled === BOX[key] && !full) { fillClose(); return; }
    fillOpen(key, full);
  });
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (filled && !fsOf()) { filled.classList.remove("tr-fs-on"); if (filled.contains($("tr-toast"))) toastHome.appendChild($("tr-toast")); }
    });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && filled && !fsOf() && !document.getElementById("mes-pp")) { e.preventDefault(); fillClose(); } });
  root.addEventListener("click", function (e) { if (filled === BOX.ocr && e.target.closest("#tr-ouse, #tr-ousesel")) fillClose(); }, true);   // capture: closes before the button scrolls up to the translation
  applyLayout();

  // ---------- text size of the boxes (A- / A+ in a filled / full-screen box, and in the tool rows with Full width) ----------
  var FZ = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.4, 3];
  function applyFz() {
    if (FZ.indexOf(S.fz) < 0) S.fz = 1;
    root.style.setProperty("--tr-fz", String(S.fz));
    Array.prototype.forEach.call(root.querySelectorAll("[data-fz]"), function (b) { var d = +b.getAttribute("data-fz"); b.disabled = d < 0 ? S.fz === FZ[0] : S.fz === FZ[FZ.length - 1]; });
  }
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fz]"); if (!b) return;
    var i = FZ.indexOf(S.fz) + (+b.getAttribute("data-fz")); S.fz = FZ[Math.max(0, Math.min(FZ.length - 1, i))]; save(); applyFz();
    toast("Text size " + Math.round(S.fz * 100) + "%");
  });
  applyFz();

  // ---------- page mode + start ----------
  if (MODE === "ocr") {
    $("tr-tx-h").textContent = "Translate the text (optional)";
    $("tr-ocr-h").textContent = "Image to text";
    $("tr-ocr-intro").innerHTML = "Add a photo, screenshot, scan or PDF: its text is read right here in your browser (nothing is uploaded) and its language is detected. Click the picture to crop or clean it up.";
  } else {
    $("tr-ocr").hidden = true;   // shown once a picture has been added
  }
  setSrc(TABS[0]);
  var q = T.parseQuery(location.search);
  if (q.from) { S.from = q.from; fromSel.value = q.from; }
  if (q.to) { S.to = q.to; toSel.value = q.to; }
  applyDirs(); counts(); drawSaved(); if (store.saved.length) $("tr-savebox").open = true; drawHist(); starState(); previewBadge();
  if (!hasApi) $("tr-livebox").title = "This browser can't translate on-device, so nothing is translated while you type (that would send every keystroke online)";
  if (q.img) { $("tr-url").value = q.img; setSrc("link"); loadUrl(q.img); }
  if (q.q) {
    inp.value = q.q; counts(); if (MODE === "translate") setSrc("text");
    var g0 = gen + 1;
    translate(false, true).then(function () { if (!outText && gen === g0 && $("tr-msg").hidden) msg("Press <b>Translate</b> to translate the text from the link.", "info"); });
  }
})();
