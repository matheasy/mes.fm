/* MES Package Tracker page. Uses MESTrack (lib.js). Saved parcels: localStorage mes-tracking:v1 = {home, items:[{n, label, added, done, cid}], showDone} */
(function () {
  "use strict";
  var T = window.MESTrack, $ = function (id) { return document.getElementById(id); };
  var KEY = "mes-tracking:v1";
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
  var ZX_URL = "https://cdn.jsdelivr.net/npm/zxing-wasm@2.1.2/dist/iife/reader/index.js";
  var S = load();
  var current = [];   // numbers shown in the results

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    if (!Array.isArray(s.items)) s.items = [];
    if (s.home === undefined) s.home = T.guessHome(navigator.languages || [navigator.language || ""]);
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  var cn = null; try { cn = new Intl.DisplayNames([navigator.language || "en"], {type: "region"}); } catch (e) {}
  function country(cc) { try { return (cn && cn.of(cc)) || cc; } catch (e) { return cc; } }
  function flag(cc) { return /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(127397 + cc.charCodeAt(0), 127397 + cc.charCodeAt(1)) : ""; }
  function group(n) { return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(n) ? n.slice(0, 2) + " " + n.slice(2, 5) + " " + n.slice(5, 8) + " " + n.slice(8, 11) + " " + n.slice(11) : n.replace(/(.{4})(?=.)/g, "$1 "); }
  var toastT;
  function toast(msg, html) { var t = $("tk-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3200); }
  function copy(text, done) {
    var fin = function () { toast(done || "Copied"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(fin, fall); else fall();
    function fall() { var a = document.createElement("textarea"); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (e) {} a.remove(); fin(); }
  }
  function status(msg, busy) { var s = $("tk-status"); s.hidden = !msg; s.className = "tk-status" + (busy ? " is-busy" : ""); s.textContent = msg || ""; }
  function savedItem(n) { for (var i = 0; i < S.items.length; i++) if (S.items[i].n === n) return S.items[i]; return null; }

  // ---- your country
  (function () {
    var ALIAS = {US: "usa america united states", GB: "uk britain england scotland wales great britain", AE: "uae emirates dubai", KR: "korea", NL: "holland", CZ: "czechia", TR: "turkey", CH: "swiss", DE: "deutschland", ES: "espana", HK: "hongkong", TW: "taiwan", RU: "russia", VN: "viet nam"};
    var sel = $("tk-home"), homes = T.HOMES.slice().sort(function (a, b) { return country(a).localeCompare(country(b)); });
    sel.innerHTML = '<option value="">Not set</option>' + homes.map(function (cc) { return '<option value="' + cc + '" data-search="' + esc(ALIAS[cc] || "") + '">' + flag(cc) + " " + esc(country(cc)) + "</option>"; }).join("");
    sel.value = S.home || "";
    sel.addEventListener("change", function () { S.home = sel.value; save(); show(current); renderSaved(); });
    if (window.MESSelect) MESSelect.enhance(sel, {placeholder: "Search countries…", noun: "countries"});
  })();

  // ---- results
  function carrierBtn(c, n, big) {
    var conf = c.conf === "high" ? "Best match" : c.conf === "likely" ? "Likely" : c.conf === "maybe" ? "Possible" : "Universal";
    var cls = "tk-cbtn" + (big ? " tk-cbtn--big" : "") + " tk-c-" + c.conf;
    var badge = '<span class="tk-dot" style="background:' + c.color + '"></span>';
    if (!c.direct) return '<button type="button" class="' + cls + '" data-copyopen="' + esc(c.url) + '" data-n="' + esc(n) + '" title="' + esc(c.why) + '">' + badge + '<span class="tk-cname">Copy number &amp; open ' + esc(c.name) + '</span><span class="tk-conf">' + conf + "</span></button>";
    return '<a class="' + cls + '" href="' + esc(c.url) + '" target="_blank" rel="noopener" title="' + esc(c.why) + '">' + badge + '<span class="tk-cname">' + (big ? "Track on " : "") + esc(c.name) + ' &#8599;</span><span class="tk-conf">' + conf + "</span></a>";
  }
  function card(n) {
    var d = T.detect(n, {home: S.home});
    var sv = savedItem(n), h = '<article class="tu-card tk-card" data-n="' + esc(n) + '">';
    h += '<div class="tk-chead"><div class="tk-num" title="Tracking number">' + esc(group(n)) + '</div><div class="tk-cact">' +
      '<button type="button" class="tu-btn tu-btn--ghost tk-sm" data-copy="' + esc(n) + '">Copy</button>' +
      '<button type="button" class="tu-btn ' + (sv ? "tu-btn--ghost" : "tu-btn--primary") + ' tk-sm" data-save="' + esc(n) + '">' + (sv ? "&#9733; Saved" : "&#9734; Save") + "</button></div></div>";
    if (!d || d.conf === "unknown") {
      h += '<p class="tk-info">We could not tell which company this number belongs to. These universal trackers check hundreds of carriers:</p><div class="tk-others">';
      T.UNIVERSAL.forEach(function (id) { h += carrierBtn({id: id, name: T.CARRIERS[id][0], url: T.url(id, n), conf: "any", color: T.CARRIERS[id][4], direct: true, why: "Universal tracker"}, n); });
      return h + "</div></article>";
    }
    var tags = ['<span class="tk-tag">' + esc(d.info) + "</span>"];
    if (d.origin && d.origin !== "XX") tags.push('<span class="tk-tag">' + flag(d.origin) + " Posted in " + esc(country(d.origin)) + "</span>");
    if (d.check === true) tags.push('<span class="tk-tag tk-ok">&#10003; Check digit OK</span>');
    if (d.check === false) tags.push('<span class="tk-tag tk-bad">&#9888; Check digit does not match: look for a typo</span>');
    h += '<div class="tk-tags">' + tags.join("") + "</div>";
    if (d.alt) h += '<p class="tu-note">The tracking number is usually the last 12 digits: <b>' + esc(d.alt) + "</b>.</p>";
    var first = d.carriers[0], rest = d.carriers.slice(1);
    h += '<div class="tk-best">' + carrierBtn(first, n, true) + (first.why ? '<span class="tk-why">' + esc(first.why) + "</span>" : "") + "</div>";
    if (rest.length) h += '<div class="tk-others">' + rest.map(function (c) { return carrierBtn(c, n); }).join("") + "</div>";
    return h + "</article>";
  }
  function show(list) {
    current = list;
    $("tk-results").innerHTML = list.map(card).join("");
  }
  function run(text, from) {
    var found = T.extract(text, {home: S.home}).map(function (x) { return x.n; });
    if (!found.length) {
      var c = T.clean(text);
      if (c.length >= 6 && c.length <= 40 && text.split(/\n/).filter(function (l) { return l.trim(); }).length <= 1) found = [c];
    }
    if (!found.length) { show([]); status(text.trim() ? "No tracking number found in that" + (from ? " " + from : " text") + "." : ""); return []; }
    status(found.length > 1 ? found.length + " tracking numbers found." : "");
    show(found);
    setQuery(found);
    return found;
  }
  function setQuery(list) {
    try { var u = new URL(location.href); if (list.length) u.searchParams.set("n", list.join(",")); else u.searchParams.delete("n"); history.replaceState(null, "", u); } catch (e) {}
  }

  // clicks in results + saved list
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy],[data-save],[data-copyopen],[data-del],[data-open]");
    if (!b || !$("tk").contains(b)) return;
    if (b.dataset.copy) copy(b.dataset.copy, "Tracking number copied");
    else if (b.dataset.copyopen) { copy(b.dataset.n, "Number copied: paste it on the page that opened"); window.open(b.dataset.copyopen, "_blank", "noopener"); }
    else if (b.dataset.save) toggleSave(b.dataset.save);
    else if (b.dataset.del) removeSaved(b.dataset.del);
    else if (b.dataset.open) { $("tk-text").value = b.dataset.open; run(b.dataset.open); $("tk-results").scrollIntoView({behavior: "smooth", block: "start"}); }
  });

  // ---- saved parcels
  function toggleSave(n) {
    var sv = savedItem(n);
    if (sv) removeSaved(n);
    else {
      var d = T.detect(n, {home: S.home});
      S.items.unshift({n: n, label: "", added: Date.now(), done: false, cid: d && d.carriers[0] ? d.carriers[0].id : ""});
      save(); toast("Saved to My parcels");
    }
    show(current); renderSaved();
  }
  function removeSaved(n) {
    var i = S.items.findIndex(function (x) { return x.n === n; }); if (i < 0) return;
    var gone = S.items.splice(i, 1)[0]; save(); show(current); renderSaved();
    toast('Removed. <button type="button" class="tk-undo">Undo</button>', true);
    var u = document.querySelector("#tk-toast .tk-undo");
    if (u) u.onclick = function () { S.items.splice(i, 0, gone); save(); show(current); renderSaved(); toast("Back in My parcels"); };
  }
  function renderSaved() {
    var w = $("tk-savedwrap"), list = $("tk-saved");
    w.hidden = !S.items.length;
    if (!S.items.length) return;
    var open = S.items.filter(function (x) { return !x.done; }), done = S.items.length - open.length;
    $("tk-scount").textContent = open.length + " on the way" + (done ? " · " + done + " arrived" : "");
    $("tk-showdone").hidden = !done;
    $("tk-showdone").textContent = S.showDone ? "Hide arrived" : "Show arrived (" + done + ")";
    var rows = S.items.filter(function (x) { return S.showDone || !x.done; });
    list.innerHTML = rows.map(function (x) {
      var d = T.detect(x.n, {home: S.home}), c = d && d.conf !== "unknown" ? d.carriers[0] : null;
      if (x.cid && d) d.carriers.forEach(function (k) { if (k.id === x.cid) c = k; });
      var date = new Date(x.added).toLocaleDateString(undefined, {month: "short", day: "numeric", year: new Date(x.added).getFullYear() === new Date().getFullYear() ? undefined : "numeric"});
      var opts = d && d.conf !== "unknown" ? d.carriers.map(function (k) { return '<option value="' + k.id + '"' + (c && k.id === c.id ? " selected" : "") + ">" + esc(k.name) + "</option>"; }).join("") : "";
      return '<div class="tk-row' + (x.done ? " is-done" : "") + '" data-n="' + esc(x.n) + '">' +
        '<label class="tk-done" title="Arrived"><input type="checkbox" data-done="' + esc(x.n) + '"' + (x.done ? " checked" : "") + '><span class="tk-sr">Arrived</span></label>' +
        '<div class="tk-rmain"><input class="tk-label" data-label="' + esc(x.n) + '" value="' + esc(x.label) + '" placeholder="Name it (e.g. New microphone)" maxlength="60">' +
        '<div class="tk-rsub"><button type="button" class="tk-link" data-open="' + esc(x.n) + '">' + esc(group(x.n)) + '</button><span>· added ' + esc(date) + "</span></div></div>" +
        '<div class="tk-ract">' + (opts ? '<select class="tu-select tk-rsel" data-cid="' + esc(x.n) + '" aria-label="Carrier">' + opts + "</select>" : "") +
        (c ? '<a class="tu-btn tu-btn--primary tk-sm" href="' + esc(c.url) + '" target="_blank" rel="noopener" data-track="' + esc(x.n) + '">Track &#8599;</a>' : '<a class="tu-btn tu-btn--primary tk-sm" href="' + esc(T.url("t17", x.n)) + '" target="_blank" rel="noopener">Track &#8599;</a>') +
        '<button type="button" class="tu-btn tu-btn--ghost tk-sm" data-copy="' + esc(x.n) + '">Copy</button>' +
        '<button type="button" class="tk-x" data-del="' + esc(x.n) + '" aria-label="Remove">&#215;</button></div></div>';
    }).join("") || '<p class="tu-note">Everything has arrived.</p>';
  }
  $("tk-saved").addEventListener("change", function (e) {
    var t = e.target, x;
    if (t.dataset.done && (x = savedItem(t.dataset.done))) { x.done = t.checked; save(); renderSaved(); if (t.checked) toast("Marked as arrived"); }
    else if (t.dataset.cid && (x = savedItem(t.dataset.cid))) { x.cid = t.value; save(); renderSaved(); }
  });
  $("tk-saved").addEventListener("input", function (e) { var t = e.target, x; if (t.dataset.label && (x = savedItem(t.dataset.label))) { x.label = t.value.slice(0, 60); save(); } });
  $("tk-showdone").onclick = function () { S.showDone = !S.showDone; save(); renderSaved(); };
  $("tk-copyall").onclick = function () {
    copy(S.items.map(function (x) { var d = T.detect(x.n, {home: S.home}); return (x.label ? x.label + ": " : "") + x.n + (d && d.conf !== "unknown" ? " (" + d.carriers[0].name + ")" : "") + (x.done ? " - arrived" : ""); }).join("\n"), "List copied");
  };
  $("tk-sharelist").onclick = function () {
    var open = S.items.filter(function (x) { return !x.done; }).map(function (x) { return x.n; });
    copy(location.origin + location.pathname + "?n=" + (open.length ? open : S.items.map(function (x) { return x.n; })).join(","), "Link copied (numbers only, no names)");
  };

  // ---- input
  var txt = $("tk-text");
  $("tk-go").onclick = function () { run(txt.value); };
  txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(txt.value); } });
  txt.addEventListener("input", function () { txt.style.height = ""; txt.rows = Math.max(2, Math.min(10, txt.value.split("\n").length + 1)); });
  txt.addEventListener("paste", function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].type.indexOf("image/") === 0) { e.preventDefault(); readImage(items[i].getAsFile()); return; }
    setTimeout(function () { run(txt.value); }, 0);
  });
  $("tk-paste").onclick = function () {
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { txt.value = t; txt.dispatchEvent(new Event("input")); run(t); }, function () { txt.focus(); toast("Press Ctrl+V (Cmd+V on a Mac) to paste"); });
    else { txt.focus(); toast("Press Ctrl+V (Cmd+V on a Mac) to paste"); }
  };
  $("tk-clear").onclick = function () { txt.value = ""; txt.style.height = ""; show([]); status(""); setQuery([]); txt.focus(); };
  $("tk-pic").onclick = function () { $("tk-file").click(); };
  $("tk-file").onchange = function () { var f = this.files[0]; this.value = ""; if (f) readImage(f); };
  var drop = $("tk-drop");
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); }); });
  drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) return readImage(f);
    var t = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (t) { txt.value = t; run(t); }
  });

  // ---- barcodes + text from pictures
  var formats = ["code_128", "code_39", "code_93", "qr_code", "data_matrix", "pdf417", "itf", "aztec", "codabar"];
  var bd = null;
  function nativeDetector() {
    if (bd !== null) return Promise.resolve(bd);
    if (!("BarcodeDetector" in window)) return Promise.resolve(bd = false);
    return window.BarcodeDetector.getSupportedFormats().then(function (sup) {
      var f = formats.filter(function (x) { return sup.indexOf(x) >= 0; });
      bd = f.length ? new window.BarcodeDetector({formats: f}) : false; return bd;
    }, function () { return (bd = false); });
  }
  var scripts = {};
  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = function () { delete scripts[src]; rej(new Error("load")); }; document.head.appendChild(s); });
    return scripts[src];
  }
  // returns array of barcode texts found in an image source (ImageBitmap / canvas / video / Blob)
  function barcodes(src, blob) {
    return nativeDetector().then(function (det) {
      if (det) return det.detect(src).then(function (r) { return r.map(function (x) { return x.rawValue; }); }, function () { return []; });
      return loadScript(ZX_URL).then(function () {
        var input = blob;
        if (!input) { var c = toCanvas(src, 1600); input = c.getContext("2d").getImageData(0, 0, c.width, c.height); }
        return window.ZXingWASM.readBarcodes(input, {tryHarder: true, maxNumberOfSymbols: 8}).then(function (r) { return r.filter(function (x) { return x.isValid; }).map(function (x) { return x.text; }); });
      }).catch(function () { return []; });
    });
  }
  function toCanvas(src, max) {
    var w = src.videoWidth || src.width, h = src.videoHeight || src.height, k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return c;
  }
  var tessWorker = null;
  function ocr(src) {
    status("Reading the text in the picture (the first time downloads the text reader, about 5 MB)…", true);
    return loadScript(TESS_URL).then(function () {
      if (!tessWorker) tessWorker = window.Tesseract.createWorker("eng");
      return tessWorker;
    }).then(function (w) {
      var c = toCanvas(src, 2400);
      return w.recognize(c).then(function (r) { return (r && r.data && r.data.text) || ""; });
    });
  }
  function readImage(file) {
    status("Looking for a barcode…", true);
    createImageBitmap(file).then(function (bmp) {
      return barcodes(bmp, file).then(function (codes) {
        var text = codes.join("\n"), got = text ? T.extract(text, {home: S.home}) : [];
        if (!got.length && codes.length === 1) { var c = T.clean(codes[0]); if (T.detect(c)) got = [{n: c}]; }
        if (got.length) { txt.value = got.map(function (x) { return x.n; }).join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value, "barcode"); toast("Read from the barcode"); return; }
        return ocr(bmp).then(function (t) {
          var found = T.extract(t, {home: S.home});
          if (!found.length) { status("No tracking number found in the picture. Try a sharper photo, or type the number."); return; }
          txt.value = found.map(function (x) { return x.n; }).join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value, "picture");
          toast("Read from the picture: please check the number");
        });
      });
    }).catch(function (e) { status("Could not read that picture" + (e && e.message ? " (" + e.message + ")" : "") + "."); });
  }

  // ---- live camera scan
  var stream = null, scanning = false;
  function closeCam() {
    scanning = false; $("tk-cam").hidden = true; document.body.classList.remove("tk-camopen");
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
  }
  $("tk-scan").onclick = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("tk-file").setAttribute("capture", "environment"); $("tk-file").click(); return; }
    navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false}).then(function (s) {
      stream = s; var v = $("tk-video"); v.srcObject = s; v.play();
      $("tk-cam").hidden = false; document.body.classList.add("tk-camopen"); scanning = true;
      $("tk-camtext").textContent = "Point the camera at the barcode or the tracking number";
      loop();
    }, function () { toast("Camera not available: choose a photo instead"); $("tk-file").setAttribute("capture", "environment"); $("tk-file").click(); });
  };
  function found(codes) {
    var text = codes.join("\n"), got = T.extract(text, {home: S.home});
    if (!got.length) codes.forEach(function (c) { c = T.clean(c); if (T.detect(c)) got.push({n: c}); });
    if (!got.length) return false;
    closeCam();
    txt.value = got.map(function (x) { return x.n; }).join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value, "barcode");
    if (navigator.vibrate) navigator.vibrate(60);
    toast("Scanned"); return true;
  }
  function loop() {
    if (!scanning) return;
    var v = $("tk-video");
    if (v.readyState < 2) return setTimeout(loop, 200);
    barcodes(v).then(function (codes) { if (!scanning) return; if (codes.length && found(codes)) return; setTimeout(loop, 250); });
  }
  $("tk-camclose").onclick = closeCam;
  $("tk-camread").onclick = function () {
    var v = $("tk-video"); if (v.readyState < 2) return;
    var c = toCanvas(v, 2400); $("tk-camtext").textContent = "Reading the text…";
    ocr(c).then(function (t) {
      var got = T.extract(t, {home: S.home});
      if (got.length) found(got.map(function (x) { return x.n; }));
      else { $("tk-camtext").textContent = "No number found: hold it closer and keep it still"; status(""); }
    });
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && scanning) closeCam(); });

  // ---- carrier directory
  function renderDir() {
    var q = ($("tk-dirq").value || "").toLowerCase().trim(), ids = Object.keys(T.CARRIERS);
    $("tk-dircount").textContent = ids.length;
    var rows = ids.map(function (id) { var c = T.CARRIERS[id]; return {id: id, name: c[0], home: c[2], cc: c[3], color: c[4], where: c[3] === "*" ? "Universal" : c[3] ? country(c[3]) : "Worldwide"}; })
      .filter(function (r) { return !q || (r.name + " " + r.where + " " + r.cc).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    $("tk-dirlist").innerHTML = rows.map(function (r) { return '<a class="tk-dirrow" href="' + esc(r.home) + '" target="_blank" rel="noopener"><span class="tk-dot" style="background:' + r.color + '"></span><b>' + esc(r.name) + "</b><span>" + (r.cc && r.cc !== "*" ? flag(r.cc) + " " : "") + esc(r.where) + "</span></a>"; }).join("") || '<p class="tu-note">No carrier matches.</p>';
  }
  $("tk-dirq").addEventListener("input", renderDir);
  renderDir();

  // ---- start
  renderSaved();
  var q = T.parseQuery(location.search);
  if (q.length) { txt.value = q.join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value); }
  window.MESTrackDebug = {run: run, state: function () { return S; }};
})();
