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
