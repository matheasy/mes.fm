/* MES link opener -- window.MESLinkOpen: open a PDF / Word file from a pasted link (mes.fm/pdf, the PDF tools, mes.fm/docx).
   1. tidy the link: Google Docs / Drive, Dropbox and GitHub "view" links become their direct-download form
   2. the browser fetches it itself (works when the other site sends CORS headers)
   3. else mes.fm/api/image-fetch fetches it (public addresses only, 4.4 MB, no copy kept; &kind=docx for Word files)
   MESLinkOpen.get(raw, {kind: "pdf"|"docx", onStatus(msg)}) -> Promise<File>   (rejects with a readable Error)
   MESLinkOpen.fix(raw, kind) -> direct URL or ""        (pure; also works in node) */
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
      return "https://docs.google.com/document/d/" + m[2] + "/export?format=" + (kind === "docx" ? "docx" : "pdf");
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

  function nameFrom(url, kind) {
    var n = "";
    try { var u = new URL(url); n = decodeURIComponent(u.pathname.split("/").pop() || ""); if (u.hostname === "docs.google.com") n = "Google Doc"; } catch (e) {}
    n = n.replace(/[\\/:*?"<>|]+/g, " ").trim() || (kind === "docx" ? "document" : "document");
    var ext = kind === "docx" ? ".docx" : ".pdf";
    if (!new RegExp("\\" + ext + "$", "i").test(n)) n = n.replace(/\.(pdf|docx?|php|aspx?|html?)$/i, "") + ext;
    return n;
  }

  function timed(url, opts, ms) {
    var ctl = root.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts)).finally(function () { clearTimeout(tm); });
  }

  function get(raw, opt) {
    opt = opt || {};
    var kind = opt.kind === "docx" ? "docx" : "pdf", say = opt.onStatus || function () {};
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
      return timed("/api/image-fetch?url=" + encodeURIComponent(url) + (kind === "docx" ? "&kind=docx" : ""), { credentials: "omit" }, 15000).then(function (r) {
        if (r.ok) return r.arrayBuffer();
        return r.json().then(function (j) { throw new Error(j && j.error || ("mes.fm answered " + r.status)); },
          function () { throw new Error(r.status === 404 ? "The mes.fm link fetcher is not available here (it only runs on mes.fm)." : "mes.fm answered " + r.status); });
      });
    }).then(function (buf) {
      var t = sniff(buf);
      if (kind === "pdf" && t !== "pdf") throw new Error(t === "zip" || t === "doc" ? "That link is a Word file, not a PDF: open it in the Word Viewer (mes.fm/docx)." : "That link did not give a PDF (it may be a web page about the file, or need a sign-in).");
      if (kind === "docx" && t !== "zip") throw new Error(t === "doc" ? "That is an old Word .doc file: only .docx can be opened here." : t === "pdf" ? "That link is a PDF: open it in the PDF Editor (mes.fm/pdf)." : "That link did not give a Word .docx file (it may be a web page about the file, or need a sign-in).");
      var name = nameFrom(url, kind), type = kind === "docx" ? DOCX : "application/pdf", f;
      try { f = new File([buf], name, { type: type }); } catch (e) { f = new Blob([buf], { type: type }); f.name = name; }
      f.mesVia = how; f.mesHost = host; f.mesUrl = url;
      say(how === "mes" ? "Fetched through mes.fm (it kept no copy); the file is opened only in your browser." : "Opened straight from " + host + " in your browser.");
      return f;
    });
  }

  // A link typed or pasted into a box; also handy for ?url= on page load
  function fromQuery() { try { var q = new URLSearchParams(location.search); return q.get("url") || q.get("u") || ""; } catch (e) { return ""; } }
  function looksLikeLink(s) { return /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(String(s || "")); }

  var api = { fix: fix, get: get, sniff: sniff, nameFrom: nameFrom, fromQuery: fromQuery, looksLikeLink: looksLikeLink };
  root.MESLinkOpen = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
