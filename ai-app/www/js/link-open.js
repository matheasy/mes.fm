/* MES link opener -- window.MESLinkOpen: open a PDF / Word file from a pasted link (mes.fm/pdf, the PDF tools, mes.fm/docx).
   1. tidy the link: Google Docs / Drive, Dropbox and GitHub "view" links become their direct-download form
   2. the browser fetches it itself (works when the other site sends CORS headers)
   3. else mes.fm/api/image-fetch fetches it (public addresses only, 4.4 MB, no copy kept; &kind=docx for Word files)
   MESLinkOpen.get(raw, {kind: "pdf"|"docx", onStatus(msg)}) -> Promise<File>   (rejects with a readable Error)
   MESLinkOpen.fix(raw, kind) -> direct URL or ""        (pure; also works in node)
   MESLinkOpen.kindOf(name, type, bytes) -> "pdf" | "docx" | "doc" | "text" | "other"   which MES page should show a file
   MESLinkOpen.sendTo(kind, file, {busy}) -> hands the file to /pdf, /docx or /text in this browser (IndexedDB "mes-handoff", same format as MESImg)
   MESLinkOpen.receive() -> Promise<File|null>: a file handed to this page by another MES page (?handoff=) or by the MES Read Aloud extension (?ext=&k=)
   With kind "pdf" / "docx" / "text", get() does not reject a file of another kind: it resolves with file.mesKind set, so the page can sendTo() it. */
(function (root) {
  "use strict";
  var DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  function fix(raw, kind) {
    var s = String(raw || "").trim().replace(/^<|>$/g, "");
    if (!s) return "";
    if (/^www\./i.test(s)) s = "https://" + s;
    var u;
    try { u = new URL(s); } catch (e) { return ""; }
    if (!/^https?:$/.test(u.protocol)) return "";
    var h = u.hostname.toLowerCase(), m;
    if (h === "docs.google.com" && (m = u.pathname.match(/^\/(?:a\/[^/]+\/)?(document|spreadsheets|presentation)\/d\/([\w-]{10,})/)) && m[1] === "document")
      return "https://docs.google.com/document/d/" + m[2] + "/export?format=" + (kind === "docx" ? "docx" : kind === "text" ? "txt" : "pdf");
    if (h === "drive.google.com") {
      m = u.pathname.match(/\/file\/d\/([\w-]{10,})/) || [null, u.searchParams.get("id")];
      if (m[1]) return "https://drive.google.com/uc?export=download&id=" + m[1];
    }
    if (/(^|\.)dropbox\.com$/.test(h)) { u.searchParams.delete("dl"); u.searchParams.set("dl", "1"); return u.toString(); }
    if (h === "github.com" && (m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/))) return "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/" + m[3];
    return u.toString();
  }

  function sniff(bytes) {
    var b = new Uint8Array(bytes.slice ? bytes.slice(0, 8) : bytes);
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";        // %PDF
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) return "zip";              // PK.. (docx)
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "doc";         // old Word .doc
    return "";
  }

  var TEXT_EXT = /\.(txt|text|md|markdown|mdown|mkd|rtf|csv|tsv|tab|json|jsonl|ndjson|geojson|xml|svg|html?|xhtml|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|py|pyw|rb|php|java|kt|kts|c|h|cc|cpp|cxx|hpp|hh|cs|go|rs|swift|m|mm|scala|sql|sh|bash|zsh|fish|ps1|psm1|bat|cmd|pl|pm|r|lua|dart|vue|svelte|yaml|yml|toml|ini|cfg|conf|config|env|properties|log|srt|vtt|sub|tex|bib|diff|patch|gitignore|gitattributes|editorconfig|dockerfile|makefile|mk|gradle|cmake|asm|s|v|vhd|vhdl|hs|elm|ex|exs|erl|clj|cljs|lisp|scm|ml|fs|jl|nim|zig|pas|f|f90|for|vb|vbs|ahk|nfo|me|1st|readme|license|lst|opml|rss|atom|plist|reg|inf|htaccess|ics|vcf|gpx|kml|po|pot|strings|graphql|gql|proto|tf|hcl|nix|cue|rst|adoc|asciidoc|org|wiki|textile)$/i;
  function kindOf(name, type, bytes) {
    name = String(name || ""); type = String(type || "").toLowerCase();
    var t = bytes ? sniff(bytes) : "";
    if (t === "pdf" || (!t && (/\.pdf$/i.test(name) || type === "application/pdf"))) return "pdf";
    if (t === "doc" || (!t && /\.doc$/i.test(name))) return "doc";
    if (t === "zip" || (!bytes && /\.(docx|docm|dotx|dotm)$/i.test(name))) return /\.(xlsx|pptx|zip|odt|ods|odp|epub|jar|apk)$/i.test(name) ? "other" : "docx";
    if (bytes) {
      var b = new Uint8Array(bytes.slice ? bytes.slice(0, 4096) : bytes), utf16 = (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff);
      if (!utf16) for (var i = 0; i < b.length; i++) if (b[i] === 0) return "other";       // NUL bytes: a binary file
      return "text";
    }
    if (TEXT_EXT.test(name) || /^text\//.test(type) || /json|xml|javascript|rtf|yaml|csv/.test(type) || /^(readme|license|makefile|dockerfile|changelog)$/i.test(name)) return "text";
    return "other";
  }

  function nameFrom(url, kind) {
    var n = "";
    try { var u = new URL(url); n = decodeURIComponent(u.pathname.split("/").pop() || ""); if (u.hostname === "docs.google.com") n = "Google Doc"; } catch (e) {}
    n = n.replace(/[\\/:*?"<>|]+/g, " ").trim() || "document";
    if (kind === "text") return /\.[a-z0-9]{1,10}$/i.test(n) && !/\.(php|aspx?|cgi)$/i.test(n) ? n : n.replace(/\.(php|aspx?|cgi)$/i, "") + ".txt";
    var ext = kind === "docx" ? ".docx" : ".pdf";
    if (!new RegExp("\\" + ext + "$", "i").test(n)) n = n.replace(/\.(pdf|docx?|php|aspx?|html?|txt)$/i, "") + ext;
    return n;
  }

  function timed(url, opts, ms) {
    var ctl = root.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts)).finally(function () { clearTimeout(tm); });
  }

  function get(raw, opt) {
    opt = opt || {};
    var kind = opt.kind === "docx" || opt.kind === "text" ? opt.kind : "pdf", say = opt.onStatus || function () {};
    var url = fix(raw, kind);
    if (!url) return Promise.reject(new Error("That is not a web link (it should start with https://)."));
    var host = ""; try { host = new URL(url).hostname; } catch (e) {}
    var how = "direct";
    say("Opening the file from " + host + "…");
    return timed(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" }, 20000).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).catch(function () {
      how = "mes";
      say(host + " doesn't let other sites load its files directly, so mes.fm is fetching it for you…");
      return timed("/api/image-fetch?url=" + encodeURIComponent(url) + (kind === "docx" || kind === "text" ? "&kind=" + kind : ""), { credentials: "omit" }, 15000).then(function (r) {
        if (r.ok) return r.arrayBuffer();
        return r.json().then(function (j) { throw new Error(j && j.error || ("mes.fm answered " + r.status)); },
          function () { throw new Error(r.status === 404 ? "The mes.fm link fetcher is not available here (it only runs on mes.fm)." : "mes.fm answered " + r.status); });
      });
    }).then(function (buf) {
      var got = kindOf(nameFrom(url, "text"), "", buf);
      if (got === "doc") throw new Error("That is an old Word .doc file: only .docx can be opened. Open it in Word or Google Docs and save it as .docx.");
      if (got === "other") throw new Error("That link did not give a PDF, Word or text file (it may need a sign-in).");
      // a web page instead of the file (a sign-in or "download" page) is text too: say so instead of showing its HTML as the PDF
      if (got === "text" && kind !== "text" && /^\s*(<!doctype html|<html)/i.test(new TextDecoder().decode(new Uint8Array(buf.slice(0, 400))))) throw new Error("That link gave a web page, not the file (it may need a sign-in, or be a page about the file).");
      var name = nameFrom(url, got), type = got === "docx" ? DOCX : got === "pdf" ? "application/pdf" : "text/plain", f;
      try { f = new File([buf], name, { type: type }); } catch (e) { f = new Blob([buf], { type: type }); f.name = name; }
      f.mesVia = how; f.mesHost = host; f.mesUrl = url; f.mesKind = got;
      say(how === "mes" ? "Fetched through mes.fm (it kept no copy); the file is opened only in your browser." : "Opened straight from " + host + " in your browser.");
      return f;
    });
  }

  // A link typed or pasted into a box; also handy for ?url= on page load
  function fromQuery() { try { var q = new URLSearchParams(location.search); return q.get("url") || q.get("u") || ""; } catch (e) { return ""; } }
  function looksLikeLink(s) { return /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(String(s || "")); }

  // ---- hand a file to another MES page in this browser (same IndexedDB format as MESImg.handoffPut, so pages can share it) ----
  var PAGE = { pdf: "/pdf", docx: "/docx", text: "/text" }, NAME = { pdf: "the PDF Editor", docx: "the Word Viewer", text: "the Text Viewer" };
  function hdb() { return new Promise(function (res, rej) { if (typeof indexedDB === "undefined") return rej(new Error("no IndexedDB")); var r = indexedDB.open("mes-handoff", 1); r.onupgradeneeded = function () { r.result.createObjectStore("h"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function htx(mode, fn) { return hdb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction("h", mode), out = fn(t.objectStore("h")); t.oncomplete = function () { db.close(); res(out); }; t.onerror = function () { db.close(); rej(t.error); }; }); }); }
  function put(file) {
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return htx("readwrite", function (st) { var c = st.openCursor(); c.onsuccess = function () { var cur = c.result; if (!cur) return; if (!cur.value || Date.now() - cur.value.t > 3600e3) cur.delete(); cur.continue(); }; st.put({ t: Date.now(), files: [{ name: file.name || "file", type: file.type || "", blob: file }], src: file.mesUrl || "" }, id); }).then(function () { return id; });
  }
  // busy = this page has a document open: try a new tab (works inside a click / drop), else ask before leaving this page
  function sendTo(kind, file, opt) {
    opt = opt || {}; var to = PAGE[kind]; if (!to) return Promise.reject(new Error("no page for that file"));
    var w = null;
    if (opt.busy) { try { w = window.open("about:blank", "_blank"); } catch (e) {} if (!w && !window.confirm("Open " + (file.name || "this file") + " in " + NAME[kind] + "? This page's document will close.")) return Promise.resolve(false); }
    return put(file).then(function (id) { var url = to + "?handoff=" + encodeURIComponent(id); if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; } else location.href = url; return true; }, function (e) { if (w) w.close(); throw e; });
  }
  function cleanQuery(keys) { try { var u = new URL(location.href); keys.forEach(function (k) { u.searchParams.delete(k); }); history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash); } catch (e) {} }
  function takeHandoff(id) {
    var got = null;
    return htx("readwrite", function (st) { var g = st.get(String(id)); g.onsuccess = function () { got = g.result || null; if (got) st.delete(String(id)); }; }).then(function () {
      var f0 = got && got.files && got.files[0]; if (!f0) return null; var f;
      try { f = new File([f0.blob], f0.name, { type: f0.type }); } catch (e) { f = f0.blob; f.name = f0.name; }
      if (got.src) f.mesUrl = got.src; return f;
    });
  }
  // the MES Read Aloud extension opens /pdf, /docx or /text with ?ext=<extension id>&k=<token> and answers chrome.runtime.sendMessage
  // (its manifest lists mes.fm in externally_connectable) with the file in base64 pieces of 4 MB
  function fromExtension(ext, k) {
    var rt = window.chrome && chrome.runtime && chrome.runtime.sendMessage ? chrome.runtime : null;
    if (!rt || !/^[a-p]{32}$/.test(ext) || !/^[\w-]{8,64}$/.test(k)) return Promise.resolve(null);
    function ask(m) { return new Promise(function (res, rej) { try { rt.sendMessage(ext, m, function (r) { var le = chrome.runtime.lastError; if (le || !r) rej(new Error(le ? le.message : "no answer")); else if (r.error) rej(new Error(r.error)); else res(r); }); } catch (e) { rej(e); } }); }
    return ask({ mesra: "file", k: k, part: 0 }).then(function (h) {
      var parts = [h.data], n = h.parts || 1, chain = Promise.resolve();
      for (var i = 1; i < n; i++) (function (i) { chain = chain.then(function () { return ask({ mesra: "file", k: k, part: i }).then(function (r) { parts[i] = r.data; }); }); })(i);
      return chain.then(function () {
        var bufs = parts.map(function (b64) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j); return u; }), f;
        try { f = new File(bufs, h.name || "file", { type: h.type || "" }); } catch (e) { f = new Blob(bufs, { type: h.type || "" }); f.name = h.name || "file"; }
        if (h.src) f.mesUrl = h.src; f.mesFromExt = true; return f;
      });
    });
  }
  function receive() {
    if (typeof location === "undefined") return Promise.resolve(null);
    var q = new URLSearchParams(location.search), id = q.get("handoff"), ext = q.get("ext"), k = q.get("k");
    if (id) { cleanQuery(["handoff"]); return takeHandoff(id).catch(function () { return null; }); }
    if (ext && k) { cleanQuery(["ext", "k"]); return fromExtension(ext, k).catch(function (e) { var er = new Error("The MES Read Aloud extension could not hand the file over (" + (e && e.message || e) + "). Open the file again from the extension, or drop it here."); throw er; }); }
    return Promise.resolve(null);
  }

  var api = { fix: fix, get: get, kindOf: kindOf, sendTo: sendTo, receive: receive, PAGE: PAGE, NAME: NAME, sniff: sniff, nameFrom: nameFrom, fromQuery: fromQuery, looksLikeLink: looksLikeLink };
  root.MESLinkOpen = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
