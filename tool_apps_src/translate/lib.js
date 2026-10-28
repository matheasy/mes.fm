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

  // the source tabs above the text box: Translate = text first, Image to Text = the picture tabs only; Camera only where a camera can be used
  function sourceTabs(mode, camera) {
    var t = mode === "ocr" ? ["file", "link", "cam"] : ["text", "file", "link", "cam"];
    return camera ? t : t.filter(function (k) { return k !== "cam"; });
  }
  // roving keys of a tab list: the tab to move to, or null when the key is not a tab key
  function nextTab(list, cur, key) {
    var i = list.indexOf(cur), n = list.length;
    if (!n) return null;
    if (key === "ArrowRight" || key === "ArrowDown") return list[(i + 1 + n) % n];
    if (key === "ArrowLeft" || key === "ArrowUp") return list[(i - 1 + n * 2) % n];
    if (key === "Home") return list[0];
    if (key === "End") return list[n - 1];
    return null;
  }
  // "Edit pictures before reading them": off on a computer, on for touch screens (phone photos usually want a crop)
  function editDefault(coarse) { return !!coarse; }


  // ---------- language guess without a network (used when the browser has no LanguageDetector): script first, then common words ----------
  function fold(s) { return String(s || "").normalize ? String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : String(s || "").toLowerCase(); }
  var SCRIPTS = [
    ["ja", /[぀-ヿ]/g], ["ko", /[가-힯ᄀ-ᇿ㄰-㆏]/g], ["zh", /[一-鿿㐀-䶿]/g], ["th", /[฀-๿]/g],
    ["he", /[֐-׿]/g], ["ar", /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g], ["hi", /[ऀ-ॿ]/g], ["bn", /[ঀ-৿]/g],
    ["pa", /[਀-੿]/g], ["gu", /[઀-૿]/g], ["ta", /[஀-௿]/g], ["te", /[ఀ-౿]/g], ["kn", /[ಀ-೿]/g],
    ["ml", /[ഀ-ൿ]/g], ["si", /[඀-෿]/g], ["ka", /[Ⴀ-ჿ]/g], ["hy", /[԰-֏]/g], ["am", /[ሀ-፿]/g],
    ["km", /[ក-៿]/g], ["lo", /[຀-໿]/g], ["my", /[က-႟]/g], ["el", /[Ͱ-Ͽἀ-῿]/g], ["ru", /[Ѐ-ӿ]/g],
    ["la_", /[a-zA-ZÀ-ɏḀ-ỿ]/g]
  ];
  var TRAD = "這們個來說國時會對發後過還為與學經點體關門開問題實現樣麼見長書車東電話氣", SIMP = "这们个来说国时会对发后过还为与学经点体关门开问题实现样么见长书车东电话气";
  var WORDS = {
    en: "the and of to in is that it for you was with on are this be have not your will can from they we at by or what all if",
    es: "el la de que y en los las un una es por con para no se del al lo como mas pero su sus le ya esta este tu solo muy hay tras",
    fr: "le la les de des et est un une que qui pas pour dans sur avec ce il je vous au du ne se sont plus mais elle nous cette",
    de: "der die das und ist nicht ein eine zu mit den von sie ich es auf fur im dem auch sich wird werden oder aber wir",
    it: "il di che la e un una per non sono gli le del della con mi ma ho questo si da al nel come anche piu sei",
    pt: "o a os as de que e nao um uma para com do da em no na voce mas por se dos das ao seu sua isso esta foi",
    nl: "de het een en van is dat niet je op te zijn met voor ik er die wat ook naar maar bij uit",
    sv: "och att det ar som en pa for av med jag inte har till den de om ett var men sig",
    da: "og at det er som en pa for af med jeg ikke har til den de om et var men sig",
    no: "og at det er som en pa for av med jeg ikke har til den de om et var men seg ikkje",
    pl: "i w nie sie na ze to z jest do jak co ale o tak po sa dla od",
    cs: "a je se na v to ze s z do jako ale jsem by o pro jsou tak",
    ro: "si de la in nu este care o un cu pe sa mai din pentru se ca",
    tr: "ve bir bu da de icin ile ne cok degil var ben sen o gibi daha",
    id: "dan yang di ini itu dengan untuk tidak ada dari saya kamu akan ke dalam bisa",
    vi: "va cua la co khong duoc nhung mot nguoi cho nay trong voi da cac",
    ca: "el la i de que els les per amb no es una un al del com",
    fi: "ja on ei se etta han mutta kun niin olen oli ovat tama",
    hu: "a az es hogy nem egy is van de meg ez el mint"
  };
  var WSET = {};
  Object.keys(WORDS).forEach(function (k) { WSET[k] = {}; WORDS[k].split(" ").forEach(function (w) { WSET[k][w] = 1; }); });
  var MARKS = { es: /[ñ¿¡]/g, pt: /[ãõ]/g, de: /ß/g, pl: /[łąężźśćń]/g, cs: /[řůěď]/g, ro: /[ășț]/g, tr: /[ğış]/g, vi: /[ơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g, hu: /[őű]/g, da: /[æø]/g, sv: /[å]/g, fr: /[œèêëàùç]/g };
  // guessLang(text) -> {lang, conf (0..1), by: "script"|"words"} or null when it can't tell
  function guessLang(text) {
    var s = String(text || "").slice(0, 4000);
    var counts = {}, total = 0;
    SCRIPTS.forEach(function (sc) { var m = s.match(sc[1]); counts[sc[0]] = m ? m.length : 0; total += counts[sc[0]]; });
    if (!total) return null;
    var lat = counts.la_;
    if (lat / total < 0.5) {
      var cjk = counts.zh + counts.ja;
      if (counts.ja && counts.ja >= cjk * 0.1) return { lang: "ja", conf: 0.9, by: "script" };
      var best = "", bn = 0;
      Object.keys(counts).forEach(function (k) { if (k !== "la_" && counts[k] > bn) { bn = counts[k]; best = k; } });
      if (!best || bn < 2) return null;
      var low = s.toLowerCase();
      if (best === "zh") { var tr = 0, si = 0; for (var i = 0; i < s.length; i++) { if (TRAD.indexOf(s[i]) >= 0) tr++; else if (SIMP.indexOf(s[i]) >= 0) si++; } if (tr > si) best = "zh-Hant"; }
      else if (best === "ar") { if (/[ٹڈڑںےۓ]/.test(s)) best = "ur"; else if (/[پچژگکی]/.test(s)) best = "fa"; }
      else if (best === "ru") { if (/[іїєґ]/.test(low)) best = "uk"; else if (/[ђћџљњ]/.test(low)) best = "sr"; else if (/[ѓќѕ]/.test(low)) best = "mk"; else if (/ў/.test(low)) best = "be"; else if (/[әғқңөұһ]/.test(low)) best = "kk"; else if (/ъ/.test(low) && !/[ыэё]/.test(low)) best = "bg"; }
      else if (best === "he" && /[װױײ]/.test(s)) best = "yi";
      return { lang: best, conf: Math.min(1, 0.6 + bn / total * 0.4), by: "script" };
    }
    var toks = fold(s).match(/[a-z]+/g) || [];
    if (toks.length < 3) return null;
    var sc = {}, raw = s.toLowerCase();
    Object.keys(WSET).forEach(function (k) {
      var h = 0; toks.forEach(function (t) { if (WSET[k][t]) h++; });
      var m = MARKS[k] ? (raw.match(MARKS[k]) || []).length : 0;
      sc[k] = h + Math.min(m, 6) * 0.75;
    });
    var order = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; });
    var a = order[0], b = order[1];
    if (sc[a] < 2 || sc[a] < toks.length * 0.08) return null;
    var margin = (sc[a] - sc[b]) / sc[a];
    if (margin < 0.15) return null;
    return { lang: a, conf: Math.min(1, 0.4 + margin), by: "words" };
  }

  // Picture language: the first pass reads with the chosen language, else the From language, else the browser's; then the text is
  // guessed, and if it is clearly another language with a reading model the picture is read again in that language.
  function ocrFirst(choice, from, prefs) {
    if (choice && choice !== "auto" && toTess(choice)) return norm(choice);
    if (from && from !== "auto" && toTess(from)) return norm(from);
    prefs = prefs || [];
    for (var i = 0; i < prefs.length; i++) if (toTess(prefs[i])) return norm(prefs[i]);
    return "en";
  }
  function ocrRecheck(passLang, guess) {
    if (!guess || !guess.lang || guess.conf < 0.5) return null;
    var g = norm(guess.lang);
    return g !== norm(passLang) && toTess(g) ? g : null;
  }
  // After reading a picture: the new From / To. To flips to the person's language (or English) when it equals the picture's language.
  function afterOcrLangs(detected, to, prefs, prevFrom) {
    if (!detected) return null;
    var t = to;
    if (!t || norm(t) === norm(detected)) t = pickTarget((prevFrom && prevFrom !== "auto" ? [prevFrom] : []).concat(prefs || [], ["en"]), norm(detected));
    return { from: norm(detected), to: t };
  }


  // OCR text keeps the picture's line breaks; a sentence wrapped over several lines translates badly line by line. Join a line to the
  // next when it does not end a sentence and the next one carries on (starts in lower case), or when it is a long wrapped line.
  function ocrParagraphs(text) {
    var L = String(text || "").split("\n"), out = [];
    for (var i = 0; i < L.length; i++) {
      var line = L[i].replace(/\s+$/, ""), prev = out.length ? out[out.length - 1] : null;
      if (prev && prev.trim() && line.trim() && !/^—.*—$/.test(line.trim()) && !/^—.*—$/.test(prev.trim())) {
        var ends = /[.!?:;。！？…»"”)\]]$/.test(prev), next = line.trim();
        var lower = /^[a-zà-ÿа-я«"“(]/.test(next) && !/^[A-ZÀ-Þ]/.test(next);
        var hyph = /[a-zà-ÿ]-$/i.test(prev);
        if (hyph) { out[out.length - 1] = prev.slice(0, -1) + next; continue; }
        if (!ends && (lower || (prev.length >= 28 && /[\w,]$/.test(prev)))) { out[out.length - 1] = prev + " " + next; continue; }
      }
      out.push(line);
    }
    return out.join("\n");
  }

  // ---------- searchable language picker ----------
  var COMMON = ["en", "es", "fr", "de", "zh", "ja", "ar", "pt", "ru", "hi", "ko", "it", "vi"];
  // items [{c: code, n: name in the page's language, e: English name}]; returns the matching items, best first
  function langFilter(q, items, boost) {
    var f = fold(q).trim(), B = {};
    (boost || COMMON).forEach(function (c, i) { c = norm(c); if (!(c in B)) B[c] = i; });
    if (!f) return items.slice();
    var out = [];
    items.forEach(function (it, i) {
      var best = 9;
      [it.n, it.e].forEach(function (name) {
        var x = fold(name);
        if (!x) return;
        if (x === f) best = Math.min(best, 0);
        else if (x.indexOf(f) === 0) best = Math.min(best, 1);
        else if (new RegExp("(^|[\\s(\\-])" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(x)) best = Math.min(best, 2);
        else if (x.indexOf(f) >= 0) best = Math.min(best, 3);
      });
      if (fold(it.c) === f) best = Math.min(best, 0);
      if (best < 9) out.push({ it: it, s: best, i: i });
    });
    var bo = function (x) { return x.it.c in B ? B[x.it.c] : 999; };
    out.sort(function (a, b) { return a.s - b.s || bo(a) - bo(b) || a.i - b.i; });
    return out.map(function (x) { return x.it; });
  }
  // groups shown before anything is typed: Recent (max 5), Common (max 8, not repeating Recent), All (A-Z, everything)
  function langGroups(codes, recent, prefs) {
    var has = {}; codes.forEach(function (c) { has[c] = 1; });
    var r = [], seen = {};
    (recent || []).forEach(function (c) { c = norm(c); if (has[c] && !seen[c] && r.length < 5) { r.push(c); seen[c] = 1; } });
    var cm = [];
    (prefs || []).map(norm).concat(COMMON).forEach(function (c) { if (has[c] && !seen[c] && cm.length < 8) { cm.push(c); seen[c] = 1; } });
    var g = [];
    if (r.length) g.push({ title: "Recent", codes: r });
    if (cm.length) g.push({ title: "Common", codes: cm });
    g.push({ title: "All languages", codes: codes.slice() });
    return g;
  }
  function pushRecent(list, code, max) {
    list = (list || []).filter(function (c) { return c !== code; }); if (code && code !== "auto") list.unshift(code);
    return list.slice(0, max || 6);
  }

  // ---------- Saved translations (pinned with the star; never pruned, not touched by Clear history) ----------
  var SAVED_MAX = 1000;
  function savedSame(a, b) { return !!a && !!b && a.q === b.q && a.o === b.o && a.t === b.t; }
  function savedIndex(list, e) { for (var i = 0; i < (list || []).length; i++) if (savedSame(list[i], e)) return i; return -1; }
  // a clean copy of one entry {q, o, f, t, e, d}; null when there is nothing to keep
  function savedEntry(e, now) {
    if (!e || typeof e.q !== "string" || typeof e.o !== "string" || !e.q.trim() || !e.o.trim()) return null;
    return { q: e.q.slice(0, 20000), o: e.o.slice(0, 30000), f: String(e.f || "auto").slice(0, 20), t: String(e.t || "").slice(0, 20), e: e.e === "online" ? "online" : "device", d: +e.d || now || 0, s: now || +e.d || 0 };
  }
  // star / un-star: returns {list, on}
  function toggleSaved(list, e, now) {
    list = (list || []).slice(); var i = savedIndex(list, e);
    if (i >= 0) { list.splice(i, 1); return { list: list, on: false }; }
    var c = savedEntry(e, now); if (!c) return { list: list, on: false };
    list.unshift(c); if (list.length > SAVED_MAX) list.length = SAVED_MAX; return { list: list, on: true };
  }
  // merge an imported file (array, or {saved: [...]}) into the list; duplicates skipped
  function mergeSaved(list, data, now) {
    var arr = Array.isArray(data) ? data : data && Array.isArray(data.saved) ? data.saved : null; if (!arr) return null;
    list = (list || []).slice(); var added = 0;
    arr.forEach(function (x) { var c = savedEntry(x, now); if (c && savedIndex(list, c) < 0) { if (x.s) c.s = +x.s || c.s; list.push(c); added++; } });
    list.sort(function (a, b) { return (b.s || 0) - (a.s || 0); }); if (list.length > SAVED_MAX) list.length = SAVED_MAX;
    return { list: list, added: added };
  }
  function savedText(list, lname) {
    lname = lname || function (c) { return c; };
    return (list || []).map(function (e) {
      var dt = e.s || e.d ? new Date(e.s || e.d).toISOString().slice(0, 10) : "";
      return lname(e.f) + " → " + lname(e.t) + (dt ? " · " + dt : "") + "\n" + e.q + "\n---\n" + e.o;
    }).join("\n\n==========\n\n") + "\n";
  }
  function savedJson(list) { return JSON.stringify({ app: "mes.fm/translate", v: 1, saved: list || [] }, null, 1); }

  var api = {
    savedSame: savedSame, savedIndex: savedIndex, savedEntry: savedEntry, toggleSaved: toggleSaved, mergeSaved: mergeSaved, savedText: savedText, savedJson: savedJson, SAVED_MAX: SAVED_MAX,
    COMMON: COMMON, guessLang: guessLang, ocrParagraphs: ocrParagraphs, ocrFirst: ocrFirst, ocrRecheck: ocrRecheck, afterOcrLangs: afterOcrLangs, langFilter: langFilter, langGroups: langGroups, pushRecent: pushRecent, fold: fold,
    sourceTabs: sourceTabs, nextTab: nextTab, editDefault: editDefault,
    LANGS: LANGS, DAILY: DAILY, norm: norm, isRtl: isRtl, known: known, toTess: toTess, fromTess: fromTess, tessLangs: tessLangs,
    myMemoryCode: myMemoryCode, apiCode: apiCode, utf8Len: utf8Len, sentences: sentences, chunk: chunk, join: join,
    pickMyMemory: pickMyMemory, chooseEngine: chooseEngine, liveOk: liveOk, parseQuery: parseQuery, buildQuery: buildQuery,
    usage: usage, pickTarget: pickTarget, ocrLines: ocrLines, ocrScale: ocrScale, imageLink: imageLink, linkName: linkName, layoutOf: layoutOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MESTr = api;
})(typeof self !== "undefined" ? self : this);
