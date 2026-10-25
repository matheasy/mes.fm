/* MES Translate: pure helpers (no DOM). Node: require('./tool_apps_src/translate/lib.js'). Tests: node tool_apps_src/translate-tests.js */
(function (root) {
  "use strict";

  // [BCP 47 code, Tesseract traineddata code (null = no OCR model), right-to-left]
  var LANGS = [
    ["af", "afr"], ["sq", "sqi"], ["am", "amh"], ["ar", "ara", 1], ["hy", "hye"], ["az", "aze"], ["eu", "eus"], ["be", "bel"],
    ["bn", "ben"], ["bs", "bos"], ["bg", "bul"], ["my", "mya"], ["ca", "cat"], ["zh", "chi_sim"], ["zh-Hant", "chi_tra"],
    ["hr", "hrv"], ["cs", "ces"], ["da", "dan"], ["nl", "nld"], ["en", "eng"], ["eo", "epo"], ["et", "est"], ["fil", "tgl"],
    ["fi", "fin"], ["fr", "fra"], ["gl", "glg"], ["ka", "kat"], ["de", "deu"], ["el", "ell"], ["gu", "guj"], ["ht", "hat"],
    ["he", "heb", 1], ["hi", "hin"], ["hu", "hun"], ["is", "isl"], ["id", "ind"], ["ga", "gle"], ["it", "ita"], ["ja", "jpn"],
    ["kn", "kan"], ["kk", "kaz"], ["km", "khm"], ["ko", "kor"], ["lo", "lao"], ["la", "lat"], ["lv", "lav"], ["lt", "lit"],
    ["mk", "mkd"], ["ms", "msa"], ["ml", "mal"], ["mt", "mlt"], ["mr", "mar"], ["mn", "mon"], ["ne", "nep"], ["no", "nor"],
    ["fa", "fas", 1], ["pl", "pol"], ["pt", "por"], ["pa", "pan"], ["ro", "ron"], ["ru", "rus"], ["sr", "srp"], ["si", "sin"],
    ["sk", "slk"], ["sl", "slv"], ["es", "spa"], ["sw", "swa"], ["sv", "swe"], ["ta", "tam"], ["te", "tel"], ["th", "tha"],
    ["tr", "tur"], ["uk", "ukr"], ["ur", "urd", 1], ["uz", "uzb"], ["vi", "vie"], ["cy", "cym"], ["yi", "yid", 1],
    ["ps", "pus", 1], ["ku", null], ["so", null], ["zu", null], ["xh", null], ["yo", null], ["ha", null], ["ig", null]
  ];
  var BY = {};
  LANGS.forEach(function (l) { BY[l[0]] = l; });
  var RTL = { ar: 1, he: 1, iw: 1, fa: 1, ur: 1, yi: 1, ps: 1, dv: 1, sd: 1, ug: 1, ckb: 1 };

  // Base form of any tag we may be handed ("en-US" -> "en", "zh-TW" / "zh-Hant-HK" -> "zh-Hant", "iw" -> "he")
  function norm(code) {
    if (!code) return "";
    var c = String(code).trim().replace(/_/g, "-");
    var low = c.toLowerCase();
    if (low === "auto" || low === "autodetect") return "auto";
    if (/^zh-(hant|tw|hk|mo)\b/.test(low)) return "zh-Hant";
    if (/^zh\b/.test(low)) return "zh";
    var base = low.split("-")[0];
    var alias = { iw: "he", tl: "fil", nb: "no", nn: "no", "in": "id", ji: "yi" };
    if (alias[base]) return alias[base];
    return BY[base] ? base : (BY[c] ? c : base);
  }
  function isRtl(code) { return !!RTL[norm(code)] || !!RTL[String(code || "").toLowerCase().split("-")[0]]; }
  function known(code) { return !!BY[norm(code)]; }

  // OCR codes
  function toTess(code) { var l = BY[norm(code)]; return l ? l[1] : null; }
  function fromTess(t) {
    t = String(t || "").split("+")[0];
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][1] === t) return LANGS[i][0];
    return null;
  }
  // The Tesseract language string for a picture: the chosen language, plus English for words like brand names when asked
  function tessLangs(code, alsoEnglish) {
    var t = toTess(code) || "eng";
    if (alsoEnglish && t !== "eng") t += "+eng";
    return t;
  }

  // Codes for the online service (MyMemory wants RFC 3066 with a region for Chinese)
  function myMemoryCode(code) {
    var c = norm(code);
    if (c === "auto") return "autodetect";
    if (c === "zh") return "zh-CN";
    if (c === "zh-Hant") return "zh-TW";
    if (c === "fil") return "tl";
    return c;
  }
  // Chrome's Translator API uses BCP 47 too; it knows "zh" and "zh-Hant"
  function apiCode(code) { return norm(code); }

  function utf8Len(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  // Split one paragraph into sentences, keeping the punctuation (also CJK 。！？ and the Devanagari danda)
  function sentences(p) {
    var out = [], re = /[^.!?。！？।؟]+(?:[.!?。！？।؟]+["'”’)\]]*|$)\s*/g, m;
    while ((m = re.exec(p)) && m[0]) out.push(m[0]);
    if (!out.length && p) out.push(p);
    return out;
  }
  function splitLong(s, max, measure) {   // a single sentence longer than the limit: cut at spaces (or anywhere, for scripts without spaces)
    var out = [], cur = "";
    var words = s.split(/(\s+)/);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (measure(cur + w) <= max) { cur += w; continue; }
      if (cur) { out.push(cur); cur = ""; }
      while (measure(w) > max) {      // no spaces (Chinese, Japanese, Thai): cut by characters
        var lo = 1, hi = w.length;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (measure(w.slice(0, mid)) <= max) lo = mid; else hi = mid - 1; }
        out.push(w.slice(0, lo)); w = w.slice(lo);
      }
      cur = /^\s+$/.test(w) ? "" : w;
    }
    if (cur) out.push(cur);
    return out;
  }
  /* chunk(text, max, measure): pieces no bigger than `max` (measured by `measure`, default length), never cutting a sentence
     unless it alone is too long. Returns [{t, sep}] where t is what to translate (trimmed) and sep the whitespace that
     followed it in the original, so pieces.map(p => p.t + p.sep).join("") === text with each piece's own edges trimmed. */
  function chunk(text, max, measure) {
    measure = measure || function (s) { return s.length; };
    max = max || 500;
    var out = [];
    var parts = String(text || "").split(/(\n\s*)/);   // paragraphs and the line breaks between them
    var lead = String(text || "").match(/^\s*/)[0];
    if (lead && !/\n/.test(lead)) out.push({ t: "", sep: lead });
    for (var i = 0; i < parts.length; i += 2) {
      var para = parts[i], brk = parts[i + 1] || "";
      var trimmed = para.trim();
      if (!trimmed) { if (out.length) out[out.length - 1].sep += para + brk; else out.push({ t: "", sep: para + brk }); continue; }
      var trail = para.match(/\s*$/)[0];
      var ss = sentences(trimmed), cur = "";
      var pieces = [];
      for (var j = 0; j < ss.length; j++) {
        var s = ss[j];
        if (measure((cur + s).trim()) <= max) { cur += s; continue; }
        if (cur.trim()) pieces.push(cur.trim());
        cur = "";
        if (measure(s.trim()) > max) splitLong(s.trim(), max, measure).forEach(function (x) { pieces.push(x.trim()); });
        else cur = s;
      }
      if (cur.trim()) pieces.push(cur.trim());
      pieces.forEach(function (p, k) { out.push({ t: p, sep: k < pieces.length - 1 ? " " : trail + brk }); });
    }
    return out.filter(function (p, k) { return p.t || p.sep || k === 0; });
  }
  function join(pieces, translated) {
    return pieces.map(function (p, i) { return (p.t ? (translated[i] != null ? translated[i] : p.t) : "") + p.sep; }).join("");
  }

  /* MyMemory's answer: its top "translatedText" is sometimes a fuzzy translation-memory hit for a *different* sentence
     (punctuation dropped, other words). Prefer an exact memory match, then the machine translation, then the top answer. */
  function pickMyMemory(json, query) {
    if (!json) return { error: "No answer from the online service." };
    var st = +json.responseStatus;
    if (json.quotaFinished || st === 429) return { error: "quota", quota: true };
    if (st && st !== 200) return { error: String(json.responseDetails || "The online service said no (" + st + ").") };
    var rd = json.responseData || {};
    var text = rd.translatedText || "";
    var ms = Array.isArray(json.matches) ? json.matches : [];
    var exact = ms.filter(function (m) { return m.translation && String(m.segment).trim() === String(query).trim() && +m.match >= 1; })[0];
    var mt = ms.filter(function (m) { return m["created-by"] === "MT!" && m.translation; })[0];
    if (exact) text = exact.translation;
    else if (mt) text = mt.translation;
    if (/^MYMEMORY WARNING/i.test(text)) return { error: "quota", quota: true };
    if (/INVALID (SOURCE|TARGET) LANGUAGE|IS AN INVALID|PLEASE SELECT TWO DISTINCT/i.test(text)) return { error: text };
    var det = rd.detectedLanguage ? norm(rd.detectedLanguage) : "";
    return { text: text, detected: det };
  }

  /* Which engine to use. pref = auto | device | online; api = has self.Translator; avail = its availability() answer for
     the language pair ("available", "downloadable", "downloading", "unavailable", or "" when not asked yet). */
  function chooseEngine(pref, api, avail) {
    var deviceOk = api && avail && avail !== "unavailable";
    if (pref === "online") return { engine: "online" };
    if (pref === "device") {
      if (!api) return { engine: null, reason: "noapi" };
      if (avail === "unavailable") return { engine: null, reason: "pair" };
      return { engine: "device", download: avail === "downloadable" || avail === "downloading" };
    }
    if (deviceOk) return { engine: "device", download: avail !== "available" };
    return { engine: "online", reason: api ? "pair" : "noapi" };
  }
  // Translate as you type only when nothing leaves the device and no model download (that needs a click) is pending
  function liveOk(choice) { return !!choice && choice.engine === "device" && !choice.download; }

  function parseQuery(search) {
    var o = { from: "", to: "", q: "" };
    var s = String(search || "").replace(/^\?/, "");
    if (!s) return o;
    s.split("&").forEach(function (kv) {
      var i = kv.indexOf("="), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? "" : kv.slice(i + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return; }
      if (k === "from" || k === "sl") o.from = norm(v);
      else if (k === "to" || k === "tl") o.to = norm(v);
      else if (k === "q" || k === "text") o.q = v.slice(0, 5000);
      else if (k === "img" || k === "image") { var l = imageLink(v); if (l) o.img = l; }
    });
    if (o.from && o.from !== "auto" && !known(o.from)) o.from = "";
    if (o.to && (o.to === "auto" || !known(o.to))) o.to = "";
    return o;
  }
  function buildQuery(o, maxQ) {
    var p = [];
    if (o.from) p.push("from=" + encodeURIComponent(o.from));
    if (o.to) p.push("to=" + encodeURIComponent(o.to));
    if (o.q) p.push("q=" + encodeURIComponent(String(o.q).slice(0, maxQ || 1500)));
    return p.length ? "?" + p.join("&") : "";
  }

  // Online characters used today (MyMemory: about 5,000 a day for each visitor without a key)
  var DAILY = 5000;
  function usage(state, day, add) {
    var u = state && state.day === day ? { day: day, n: state.n || 0 } : { day: day, n: 0 };
    if (add) u.n += add;
    return u;
  }

  // A language in the browser's preferred list that we know, for the default "To"
  function pickTarget(prefs, avoid) {
    prefs = prefs || [];
    for (var i = 0; i < prefs.length; i++) { var c = norm(prefs[i]); if (known(c) && c !== avoid) return c; }
    return avoid === "en" ? "es" : "en";
  }

  // OCR words -> lines (tesseract.js v5 gives data.words / data.lines; v6 gives data.blocks only when asked)
  function ocrLines(data) {
    if (!data) return [];
    var lines = [];
    if (Array.isArray(data.blocks) && data.blocks.length) {
      data.blocks.forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { lines.push(l); }); }); });
    } else if (Array.isArray(data.lines)) lines = data.lines;
    return lines.map(function (l) {
      var words = (l.words || []).filter(function (w) { return w.text && w.text.trim(); }).map(function (w) {
        return { text: w.text, conf: Math.round(w.confidence || 0), box: w.bbox };
      });
      return { text: (l.text || words.map(function (w) { return w.text; }).join(" ")).replace(/\s+$/, ""), conf: Math.round(l.confidence || 0), box: l.bbox, words: words };
    }).filter(function (l) { return l.text.trim(); });
  }
  // Size to OCR at: shrink huge photos, enlarge small screenshots (Tesseract likes text ~20-40 px tall)
  function ocrScale(w, h, maxSide, minSide) {
    maxSide = maxSide || 2600; minSide = minSide || 1100;
    var big = Math.max(w, h);
    if (big > maxSide) return maxSide / big;
    if (big < minSide) return Math.min(3, minSide / big);
    return 1;
  }

  // A link to a picture typed / pasted / dropped on the page: the http(s) URL (hash dropped), or null.
  // data:, blob:, file:, javascript: and links with user:password@ are refused (the server refuses them too: mes.fm/api/_url-guard.js).
  function imageLink(text) {
    var s = String(text == null ? "" : text).trim();
    if (!s || s.length > 2048 || /\s/.test(s)) return null;
    if (/^\/\//.test(s)) s = "https:" + s;
    if (!/^https?:\/\//i.test(s)) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password || !u.hostname) return null;
    u.hash = "";
    return u.toString();
  }
  // File name for a fetched picture: the last part of the link's path, else "picture", plus an extension for the type when it has none.
  function linkName(url, type) {
    var ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif", "image/bmp": ".bmp", "image/tiff": ".tif", "application/pdf": ".pdf" }[type] || "";
    var name = "";
    try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch (e) {}
    name = name.replace(/[^\w.\- ()]+/g, "").slice(0, 80);
    if (!name) name = "picture";
    if (ext && !/\.[a-z0-9]{2,5}$/i.test(name)) name += ext;
    return name;
  }
  // Fill window / layout choices kept in the page's state: "side" | "stack", full width on / off
  function layoutOf(set) {
    return { lay: set && set.lay === "stack" ? "stack" : "side", full: !!(set && set.full) };
  }

  var api = {
    LANGS: LANGS, DAILY: DAILY, norm: norm, isRtl: isRtl, known: known, toTess: toTess, fromTess: fromTess, tessLangs: tessLangs,
    myMemoryCode: myMemoryCode, apiCode: apiCode, utf8Len: utf8Len, sentences: sentences, chunk: chunk, join: join,
    pickMyMemory: pickMyMemory, chooseEngine: chooseEngine, liveOk: liveOk, parseQuery: parseQuery, buildQuery: buildQuery,
    usage: usage, pickTarget: pickTarget, ocrLines: ocrLines, ocrScale: ocrScale, imageLink: imageLink, linkName: linkName, layoutOf: layoutOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MESTr = api;
})(typeof self !== "undefined" ? self : this);

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
  var store = { set: {}, hist: [], use: null };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw && typeof raw === "object") store = { set: raw.set || {}, hist: Array.isArray(raw.hist) ? raw.hist : [], use: raw.use || null }; } catch (e) {}
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
  function defaultOcrLang() {
    if (S.from !== "auto" && T.toTess(S.from)) return S.from;
    for (var i = 0; i < prefs.length; i++) if (T.toTess(prefs[i])) return T.norm(prefs[i]);
    return "en";
  }
  fill(olSel, ocrList, S.olang || defaultOcrLang());
  $("tr-oeng").checked = !!S.oeng;
  $("tr-live").checked = !!S.live;
  $("tr-hkeep").checked = !!S.keep;

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
  var inp = $("tr-in"), out = $("tr-out"), outText = "";
  function counts() {
    var n = inp.value.length;
    $("tr-count").textContent = n.toLocaleString() + (n === 1 ? " character" : " characters");
  }
  function setOut(text, lang) {
    outText = text || "";
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
    if (!text.trim()) { setOut(""); msg(""); previewBadge(); $("tr-det").textContent = ""; return Promise.resolve(); }
    var from = S.from, to = S.to;
    var step = Promise.resolve(from);
    msg("");
    if (from === "auto" && S.engine !== "online") {
      step = detectAvail().then(function (a) {
        if (a === "unavailable" || (!gesture && a !== "available")) return "";
        return within(detectOnDevice(text), a === "available" ? 6000 : 120000, "").catch(function () { return ""; });
      });
    }
    return step.then(function (src) {
      if (my !== gen) return;
      if (from === "auto") $("tr-det").textContent = src ? "Detected: " + lname(src) : "";
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
      if (from === "auto" && detected) $("tr-det").textContent = "Detected: " + lname(detected);
      if (detected && detected === to) badge("same"); else badge("online");
      remember(text, detected || from, to, "online");
    }, function (e) {
      prog("tr-prog", null); $("tr-go").disabled = false;
      if (my === gen && e && e.name !== "AbortError") msg("Could not reach the online service (" + esc(e.message || e) + "). Check your connection.", "warn");
    });
  }

  // ---------- history ----------
  function remember(q, from, to, eng) {
    if (!S.keep || !q.trim() || !outText) return;
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
      li.innerHTML = '<button type="button" class="tr-hitem" data-i="' + i + '"><span class="tr-hl">' + esc(lname(e.f)) + " → " + esc(lname(e.t)) + (e.e === "online" ? " · online" : " · on device") + '</span><span class="tr-hq" dir="auto">' + esc(e.q.slice(0, 140)) + '</span><span class="tr-ho" dir="auto">' + esc(e.o.slice(0, 140)) + '</span></button><button type="button" class="tr-ib tr-hdel" data-del="' + i + '" aria-label="Delete this one" title="Delete">&#10005;</button>';
      ul.appendChild(li);
    });
  }
  $("tr-hlist").addEventListener("click", function (ev) {
    var d = ev.target.closest("[data-del]"), it = ev.target.closest("[data-i]");
    if (d) { store.hist.splice(+d.getAttribute("data-del"), 1); save(); drawHist(); return; }
    if (it) {
      var e = store.hist[+it.getAttribute("data-i")]; if (!e) return;
      S.from = e.f; S.to = e.t; fromSel.value = e.f; toSel.value = e.t; save(); applyDirs();
      inp.value = e.q; counts(); setOut(e.o, e.t); badge(e.e === "online" ? "online" : "device", "from your history");
      $("tr-tx").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("tr-hclear").addEventListener("click", function () { if (!store.hist.length) return; if (confirm("Delete the whole translation history in this browser?")) { store.hist = []; save(); drawHist(); } });
  $("tr-hkeep").addEventListener("change", function () { S.keep = this.checked; save(); });

  // ---------- events: text ----------
  var typeT;
  inp.addEventListener("input", function () {
    counts();
    clearTimeout(typeT);
    if (!inp.value.trim()) { setOut(""); $("tr-det").textContent = ""; msg(""); return; }
    if (S.live) typeT = setTimeout(function () { translate(false, true); }, 650);
  });
  $("tr-go").addEventListener("click", function () { clearTimeout(typeT); translate(true); });
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); translate(true); } });
  fromSel.addEventListener("change", function () {
    S.from = fromSel.value; save(); applyDirs();
    if (!S.olangPicked && S.from !== "auto" && T.toTess(S.from)) { olSel.value = S.from; }
    previewBadge(); if (inp.value.trim()) translate(false, true);
  });
  toSel.addEventListener("change", function () { S.to = toSel.value; save(); previewBadge(); if (inp.value.trim()) translate(false, true); });
  engSel.addEventListener("change", function () { S.engine = engSel.value; save(); msg(""); previewBadge(); });
  $("tr-live").addEventListener("change", function () { S.live = this.checked; save(); });
  $("tr-swap").addEventListener("click", function () {
    var det = ($("tr-det").textContent.match(/^Detected: /) && sorted.filter(function (c) { return "Detected: " + lname(c) === $("tr-det").textContent; })[0]) || "";
    var src = S.from === "auto" ? (det || "") : S.from;
    if (!src) { toast("Choose the From language first"); return; }
    S.from = S.to; S.to = src; fromSel.value = S.from; toSel.value = S.to; save(); applyDirs();
    if (outText) { inp.value = outText; counts(); setOut(""); translate(true); }
    previewBadge();
  });
  $("tr-clear").addEventListener("click", function () { inp.value = ""; counts(); setOut(""); msg(""); $("tr-det").textContent = ""; inp.focus(); });
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
    var d = sorted.filter(function (c) { return "Detected: " + lname(c) === $("tr-det").textContent; })[0];
    say(inp.value, S.from === "auto" ? (d || "") : S.from, this);
  });
  $("tr-say-out").addEventListener("click", function () { say(outText, S.to, this); });
  if (!("speechSynthesis" in window)) { $("tr-say-in").hidden = true; $("tr-say-out").hidden = true; }

  // ---------- OCR ----------
  var pages = [], cur = 0, worker = null, workerLangs = "", ocrBusy = false, selected = {};
  var cv = $("tr-cv"), boxes = $("tr-boxes"), drop = $("tr-drop"), fileIn = $("tr-file");
  drop.addEventListener("click", function () { fileIn.click(); });
  drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", function () { if (fileIn.files[0]) loadFile(fileIn.files[0]); fileIn.value = ""; });
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("tr-drop--over"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("tr-drop--over"); }); });
  drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
  drop.addEventListener("drop", function (e) {   // a picture dragged from another web page arrives as a link, not a file
    var dt = e.dataTransfer; if (!dt || (dt.files && dt.files.length)) return;
    var l = T.imageLink((dt.getData("text/uri-list") || "").split(/\r?\n/).filter(function (x) { return x && x[0] !== "#"; })[0] || dt.getData("text/plain"));
    if (l) loadUrl(l);
  });
  document.addEventListener("paste", function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { e.preventDefault(); loadFile(items[i].getAsFile()); return; }
    // a pasted link to a picture: only outside the text boxes (there a link is just text), or into the link box itself
    var t = e.target, inBox = t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.id !== "tr-url") || t.isContentEditable);
    if (inBox) return;
    var l = T.imageLink(e.clipboardData && e.clipboardData.getData("text/plain"));
    if (l) { e.preventDefault(); $("tr-url").value = l; loadUrl(l); }
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
      return loadFile(f);
    }).catch(function (e) {
      if (my !== urlGen || String(e && e.message) === "stale") return;
      urlMsg("Could not open that link: " + esc(e && e.message || e) + " You can save the picture and drop the file here instead.", true);
    }).then(function () { if (my === urlGen) $("tr-urlgo").disabled = false; });
  }
  $("tr-urlform").addEventListener("submit", function (e) { e.preventDefault(); loadUrl($("tr-url").value); });
  olSel.addEventListener("change", function () { S.olang = olSel.value; S.olangPicked = true; save(); });
  $("tr-oeng").addEventListener("change", function () { S.oeng = this.checked; save(); });

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
  function toCanvas(src, w, h) {
    var k = T.ocrScale(w, h), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // transparent PNGs: text on white
    g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function loadFile(file) {
    if (ocrBusy) cancelOcr();
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    $("tr-ores").hidden = true; $("tr-oread").disabled = true;
    var job = isPdf ? loadPdf(file) : decodeImage(file).then(function (bmp) {
      var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
      var c = toCanvas(bmp, w, h); if (bmp.close) bmp.close();
      return [{ canvas: c, name: file.name || "Pasted picture", w: w, h: h }];
    });
    return job.then(function (ps) {
      pages = ps.map(function (p) { p.lines = null; return p; }); cur = 0; selected = {};
      drawPages(); showPage(0);
      $("tr-ores").hidden = false; $("tr-otext").value = ""; $("tr-ostat").textContent = isPdf ? "PDF: " + ps.length + (ps.length === 1 ? " page" : " pages") + " ready" : "";
      $("tr-oread").disabled = false;
      readOcr();
    }).catch(function (e) { toast(String(e.message || e)); $("tr-oread").disabled = !pages.length; });
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
          return pg.render({ canvasContext: g, viewport: vp }).promise.then(function () { list.push({ canvas: c, name: "Page " + num, w: c.width, h: c.height }); return next(); });
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
    var el = $("tr-pages");
    if (pages.length < 2) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = pages.map(function (p, i) { return '<button type="button" class="tu-chip" data-pg="' + i + '" aria-pressed="' + (i === cur) + '">' + esc(p.name) + "</button>"; }).join("");
  }
  $("tr-pages").addEventListener("click", function (e) { var b = e.target.closest("[data-pg]"); if (b) showPage(+b.getAttribute("data-pg")); });
  function showPage(i) {
    cur = i; var p = pages[i]; if (!p) return;
    cv.width = p.canvas.width; cv.height = p.canvas.height; cv.getContext("2d").drawImage(p.canvas, 0, 0);
    $("tr-stage").style.aspectRatio = p.canvas.width + " / " + p.canvas.height;
    drawPages(); drawBoxes();
  }
  function confClass(c) { return c >= 80 ? "ok" : c >= 55 ? "mid" : "low"; }
  function drawBoxes() {
    var p = pages[cur]; boxes.innerHTML = "";
    if (!p || !p.lines) return;
    var W = p.canvas.width, H = p.canvas.height, html = [];
    p.lines.forEach(function (l, li) {
      var items = S.level === "word" ? l.words.map(function (w, wi) { return { t: w.text, b: w.box, c: w.conf, id: cur + ":" + li + ":" + wi }; }) : [{ t: l.text, b: l.box, c: l.conf, id: cur + ":" + li }];
      items.forEach(function (it) {
        if (!it.b) return;
        var x = it.b.x0 / W * 100, y = it.b.y0 / H * 100, w = (it.b.x1 - it.b.x0) / W * 100, h = (it.b.y1 - it.b.y0) / H * 100;
        html.push('<button type="button" class="tr-box tr-box--' + confClass(it.c) + (selected[it.id] ? " tr-box--sel" : "") + '" data-id="' + it.id + '" style="left:' + x.toFixed(3) + "%;top:" + y.toFixed(3) + "%;width:" + w.toFixed(3) + "%;height:" + h.toFixed(3) + '%" title="' + esc(it.t) + " (" + it.c + '% sure)" aria-label="' + esc(it.t) + '" aria-pressed="' + !!selected[it.id] + '"></button>');
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
    $("tr-ousesel").disabled = !n;
    $("tr-ousesel").textContent = n ? "Translate the " + n + " selected " + (n === 1 ? "box" : "boxes") : "Translate only the selected boxes";
    var t = selText(), ta = $("tr-otext");
    if (t) { var at = ta.value.indexOf(t.split("\n")[0]); if (at >= 0 && document.activeElement !== ta) { try { ta.setSelectionRange(at, at + t.split("\n")[0].length); } catch (e) {} } }
  }
  boxes.addEventListener("click", function (e) {
    var b = e.target.closest(".tr-box"); if (!b) return;
    var id = b.getAttribute("data-id");
    if (selected[id]) delete selected[id]; else selected[id] = 1;
    b.classList.toggle("tr-box--sel", !!selected[id]); b.setAttribute("aria-pressed", !!selected[id]);
    selChanged();
  });
  $("tr-selall").addEventListener("click", function () {
    var p = pages[cur]; if (!p || !p.lines) return;
    p.lines.forEach(function (l, li) { if (S.level === "word") l.words.forEach(function (w, wi) { selected[cur + ":" + li + ":" + wi] = 1; }); else selected[cur + ":" + li] = 1; });
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
  function readOcr() {
    if (!pages.length || ocrBusy) return;
    ocrBusy = true; $("tr-oread").disabled = true;
    var langs = T.tessLangs(olSel.value, $("tr-oeng").checked);
    var texts = [], t0 = Date.now();
    ocrPages = pages.length;
    prog("tr-oprog", 0.01, "Loading the text reader…");
    getWorker(langs).then(function (w) {
      var i = 0;
      function next() {
        if (!ocrBusy) return;
        if (i >= pages.length) return;
        ocrPage = i;
        var p = pages[i++];
        return w.recognize(p.canvas, {}, { text: true, blocks: true }).then(function (r) {
          p.lines = T.ocrLines(r.data);
          texts.push((pages.length > 1 ? "— " + p.name + " —\n" : "") + p.lines.map(function (l) { return l.text; }).join("\n"));
          if (i - 1 === cur) drawBoxes();
          return next();
        });
      }
      return next();
    }).then(function () {
      if (!ocrBusy) return;
      ocrBusy = false; prog("tr-oprog", null); $("tr-oread").disabled = false;
      var all = texts.join("\n\n").trim(), lines = 0, conf = 0, nw = 0;
      pages.forEach(function (p) { (p.lines || []).forEach(function (l) { lines++; l.words.forEach(function (w) { conf += w.conf; nw++; }); }); });
      $("tr-otext").value = all;
      $("tr-otext").setAttribute("dir", T.isRtl(olSel.value) ? "rtl" : "auto");
      $("tr-ostat").textContent = all ? lines + " lines · " + nw + " words · " + Math.round(nw ? conf / nw : 0) + "% sure on average · " + ((Date.now() - t0) / 1000).toFixed(1) + " s" : "No text found. Try the right language, a sharper photo, or crop closer.";
      drawBoxes(); selChanged();
      if (!all) toast("No text found");
    }).catch(function (e) {
      ocrBusy = false; prog("tr-oprog", null); $("tr-oread").disabled = false;
      if (worker) { try { worker.terminate(); } catch (x) {} worker = null; }
      toast("The text reader failed: " + (e && e.message || e));
    });
  }
  function cancelOcr() {
    ocrBusy = false; prog("tr-oprog", null); $("tr-oread").disabled = !pages.length;
    if (worker) { try { worker.terminate(); } catch (e) {} worker = null; workerLangs = ""; }
  }
  $("tr-oread").addEventListener("click", function () { pages.forEach(function (p) { p.lines = null; }); selected = {}; drawBoxes(); readOcr(); });
  $("tr-ocancel").addEventListener("click", cancelOcr);
  $("tr-ocopy").addEventListener("click", function () { copyText($("tr-otext").value); });
  $("tr-otxt").addEventListener("click", function () {
    var t = $("tr-otext").value; if (!t) { toast("Nothing to save yet"); return; }
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
    a.download = ((pages[0] && pages[0].name) || "text").replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\- ]+/g, "") + ".txt";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });
  function useText(t) {
    if (!t.trim()) { toast("No text to translate yet"); return; }
    inp.value = t; counts();
    var l = olSel.value;
    if (S.from !== l) { S.from = l; fromSel.value = l; save(); applyDirs(); }
    if (S.to === S.from) { S.to = T.pickTarget(prefs, S.from); toSel.value = S.to; save(); }
    $("tr-tx").scrollIntoView({ behavior: "smooth", block: "start" });
    translate(true);
  }
  $("tr-ouse").addEventListener("click", function () { useText($("tr-otext").value); });
  $("tr-ousesel").addEventListener("click", function () { useText(selText()); });

  // ---------- layout: Side by side | Stacked, Full width, Fill window, Full screen ----------
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

  var filled = null, fsOn = false, toastHome = $("tr-toast").parentNode;
  var FILL = { tx: $("tr-tx"), ocr: $("tr-oside") };
  function fillOpen(key, focusEl, full) {
    if (filled && filled !== FILL[key]) fillClose();
    var el = FILL[key]; if (!el) return;
    filled = el; el.classList.add("tr-fill"); document.documentElement.classList.add("tr-locked");
    Array.prototype.forEach.call(el.querySelectorAll("[data-fillx]"), function (b) { b.hidden = false; });
    if (full && el.requestFullscreen) {
      el.requestFullscreen().then(function () { fsOn = true; el.appendChild($("tr-toast")); }, function () { toast("Full screen isn't allowed here, so the box fills the window instead"); });
    } else if (full) toast("This browser has no full screen for page parts, so the box fills the window instead");
    if (focusEl && focusEl.focus) setTimeout(function () { focusEl.focus({ preventScroll: true }); }, 30);
  }
  function fillClose() {
    if (!filled) return;
    var el = filled; filled = null;
    if (document.fullscreenElement === el && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    fsOn = false; toastHome.appendChild($("tr-toast"));
    el.classList.remove("tr-fill"); document.documentElement.classList.remove("tr-locked");
    Array.prototype.forEach.call(el.querySelectorAll("[data-fillx]"), function (b) { b.hidden = true; });
  }
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fill], [data-fs], [data-fillx]"); if (!b) return;
    if (b.hasAttribute("data-fillx")) { fillClose(); return; }
    var key = b.getAttribute("data-fill") || b.getAttribute("data-fs"), full = b.hasAttribute("data-fs");
    var pane = b.closest(".tr-pane, .tr-oside"), box = pane && pane.querySelector("textarea, .tr-out");
    if (filled === FILL[key] && !full) { fillClose(); return; }
    fillOpen(key, box, full);
  });
  document.addEventListener("fullscreenchange", function () { if (fsOn && !document.fullscreenElement) fillClose(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && filled && !document.fullscreenElement) { e.preventDefault(); fillClose(); } });
  root.addEventListener("click", function (e) { if (filled === FILL.ocr && e.target.closest("#tr-ouse, #tr-ousesel")) fillClose(); }, true);   // capture: closes before the button scrolls up to the translation
  applyLayout();

  // ---------- page mode + start ----------
  if (MODE === "ocr") {
    $("tr-tx-h").textContent = "Translate it (optional)";
    $("tr-ocr-h").textContent = "Image to text";
    $("tr-ocr-intro").innerHTML = "Add a photo, screenshot, scan or PDF and its text is read right here in your browser: nothing is uploaded. Fix anything it got wrong, copy it, or translate it below.";
  }
  var q = T.parseQuery(location.search);
  if (q.from) { S.from = q.from; fromSel.value = q.from; }
  if (q.to) { S.to = q.to; toSel.value = q.to; }
  applyDirs(); counts(); drawHist(); previewBadge();
  if (!hasApi) $("tr-livebox").title = "This browser can't translate on-device, so nothing is translated while you type (that would send every keystroke online)";
  if (q.img) { $("tr-url").value = q.img; if (MODE !== "ocr") $("tr-ocr").scrollIntoView({ block: "start" }); loadUrl(q.img); }
  if (q.q) {
    inp.value = q.q; counts();
    var g0 = gen + 1;
    translate(false, true).then(function () { if (!outText && gen === g0 && $("tr-msg").hidden) msg("Press <b>Translate</b> to translate the text from the link.", "info"); });
  }
})();
