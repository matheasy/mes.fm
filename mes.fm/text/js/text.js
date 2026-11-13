/* MES Text Viewer -- pure helpers (window.MESText; node: require). Used by app.js on mes.fm/text.
   decode(bytes, enc?)  -> {text, enc, bom}    UTF-8 / UTF-16 by byte-order mark, else UTF-8 if it decodes, else windows-1252
   info(name, text)     -> {kind, lang, label} kind: rtf | md | html | csv | tsv | json | code | text; lang = highlight.js language
   rtfToHtml(rtf)       -> {html, text}      own RTF reader: paragraphs, bold / italic / underline / strike / super / sub, sizes,
                                             colours, alignment, tables, \uN and \'hh characters; skips fonts, styles, pictures, info
   parseCsv(text, sep)  -> rows (array of arrays), RFC 4180 quotes; guessSep(text)
   stats(text)          -> {lines, words, chars}
   shouldUnwrap(text)   -> true when the lines look hard-wrapped (an old e-text, an email): the reading view then joins them
   splitHtmlLines(html) -> array of HTML strings, one per line, with open <span>s closed and reopened (highlighted code with line numbers)
   escapeHtml, linkify */
(function (root) {
  "use strict";

  // ---------- decoding ----------
  var CP1252 = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
  function cp1252(b) { var out = ""; for (var i = 0; i < b.length; i += 8192) { var chunk = []; for (var j = i; j < Math.min(b.length, i + 8192); j++) chunk.push(CP1252[b[j]] || b[j]); out += String.fromCharCode.apply(null, chunk); } return out; }
  function td(enc, b, fatal) { return new TextDecoder(enc, { fatal: !!fatal }).decode(b); }
  function decode(bytes, enc) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? "utf-8" : b[0] === 0xff && b[1] === 0xfe ? "utf-16le" : b[0] === 0xfe && b[1] === 0xff ? "utf-16be" : "";
    if (enc && enc !== "auto") {
      if (enc === "windows-1252") return { text: cp1252(b), enc: enc, bom: bom };
      try { return { text: td(enc, bom && enc === bom ? b.subarray(bom === "utf-8" ? 3 : 2) : b), enc: enc, bom: bom }; } catch (e) { /* unknown label: fall through */ }
    }
    if (bom) return { text: td(bom, b.subarray(bom === "utf-8" ? 3 : 2)), enc: bom, bom: bom };
    try { return { text: td("utf-8", b, true), enc: "utf-8", bom: "" }; } catch (e) { return { text: cp1252(b), enc: "windows-1252", bom: "" }; }
  }

  // ---------- what kind of file ----------
  var LANG = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", json: "json", jsonl: "json", ndjson: "json", geojson: "json",
    py: "python", pyw: "python", rb: "ruby", php: "php", java: "java", kt: "kotlin", kts: "kotlin", c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
    cs: "csharp", go: "go", rs: "rust", swift: "swift", m: "objectivec", mm: "objectivec", scala: "scala", sql: "sql", sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
    ps1: "powershell", psm1: "powershell", bat: "dos", cmd: "dos", pl: "perl", pm: "perl", r: "r", lua: "lua", dart: "dart", vue: "xml", svelte: "xml",
    yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", cfg: "ini", conf: "ini", properties: "properties", env: "bash", xml: "xml", svg: "xml", xhtml: "xml", plist: "xml",
    rss: "xml", atom: "xml", opml: "xml", kml: "xml", gpx: "xml", html: "xml", htm: "xml", css: "css", scss: "scss", sass: "scss", less: "less", tex: "latex", bib: "latex",
    diff: "diff", patch: "diff", dockerfile: "dockerfile", makefile: "makefile", mk: "makefile", gradle: "gradle", cmake: "cmake", asm: "x86asm", s: "x86asm",
    hs: "haskell", elm: "elm", ex: "elixir", exs: "elixir", erl: "erlang", clj: "clojure", cljs: "clojure", lisp: "lisp", scm: "scheme", ml: "ocaml", fs: "fsharp",
    jl: "julia", nim: "nim", zig: "zig", pas: "delphi", f: "fortran", f90: "fortran", vb: "vbnet", vbs: "vbscript", graphql: "graphql", gql: "graphql", proto: "protobuf",
    tf: "ini", hcl: "ini", nix: "nix", v: "verilog", vhd: "vhdl", vhdl: "vhdl", md: "markdown", markdown: "markdown", log: "accesslog", srt: "plaintext", vtt: "plaintext", reg: "ini", inf: "ini", ics: "plaintext", vcf: "plaintext"
  };
  var KIND_LABEL = { rtf: "Rich text (RTF)", md: "Markdown", html: "Web page (HTML)", csv: "Spreadsheet (CSV)", tsv: "Spreadsheet (TSV)", json: "JSON data", code: "Code", text: "Plain text" };
  function extOf(name) { var n = String(name || "").toLowerCase(), base = n.split(/[\\/]/).pop(); if (/^(dockerfile|makefile)$/.test(base)) return base; var m = /\.([a-z0-9]+)$/.exec(base); return m ? m[1] : ""; }
  function info(name, text) {
    var ext = extOf(name), t = String(text || ""), head = t.slice(0, 2000), kind, lang = LANG[ext] || "";
    if (/^\s*\{\\rtf/.test(head) || ext === "rtf") kind = "rtf";
    else if (ext === "md" || ext === "markdown" || ext === "mdown" || ext === "mkd") kind = "md";
    else if (ext === "html" || ext === "htm" || ext === "xhtml" || (!ext && /^\s*(<!doctype html|<html)/i.test(head))) kind = "html";
    else if (ext === "csv") kind = "csv";
    else if (ext === "tsv" || ext === "tab") kind = "tsv";
    else if (ext === "json" || ext === "geojson" || (!ext && /^\s*[\[{]/.test(head) && isJson(t))) kind = "json";
    else if (lang && lang !== "plaintext" && lang !== "accesslog") kind = "code";
    else if (!ext && /^#!/.test(head)) { kind = "code"; lang = /python/.test(head.split("\n")[0]) ? "python" : /node/.test(head.split("\n")[0]) ? "javascript" : "bash"; }
    else if (!ext && looksMarkdown(head)) kind = "md";
    else kind = "text";
    if (kind === "md") lang = "markdown"; if (kind === "json") lang = "json"; if (kind === "html") lang = "xml";
    return { kind: kind, lang: lang, ext: ext, label: kind === "code" ? (lang ? (NICE[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)) + " code" : "Code") : KIND_LABEL[kind] };
  }
  var NICE = { javascript: "JavaScript", typescript: "TypeScript", csharp: "C#", cpp: "C++", objectivec: "Objective-C", php: "PHP", sql: "SQL", css: "CSS", scss: "SCSS", xml: "XML", yaml: "YAML", ini: "Settings (INI)", bash: "Shell", powershell: "PowerShell", dos: "Batch", x86asm: "Assembly", latex: "LaTeX", vbnet: "VB.NET", graphql: "GraphQL", fsharp: "F#", ocaml: "OCaml" };
  function isJson(t) { if (t.length > 5e6) return false; try { JSON.parse(t); return true; } catch (e) { return false; } }
  function looksMarkdown(h) { var n = 0; if (/^#{1,6} \S/m.test(h)) n++; if (/^\s*[-*] \S/m.test(h)) n++; if (/\[[^\]]+\]\([^)]+\)/.test(h)) n++; if (/^```/m.test(h)) n++; if (/\*\*[^*]+\*\*/.test(h)) n++; return n >= 2; }

  // ---------- RTF ----------
  var SKIP = { fonttbl: 1, colortbl: 0, stylesheet: 1, info: 1, pict: 1, object: 1, header: 1, headerl: 1, headerr: 1, headerf: 1, footer: 1, footerl: 1, footerr: 1, footerf: 1,
    themedata: 1, datastore: 1, latentstyles: 1, xmlnstbl: 1, listtable: 1, listoverridetable: 1, rsidtbl: 1, generator: 1, mmathPr: 1, filetbl: 1, revtbl: 1, pgdsctbl: 1,
    colorschememapping: 1, fldinst: 1, field: 0, fldrslt: 0, bkmkstart: 1, bkmkend: 1, protusertbl: 1, xe: 1, tc: 1, private: 1, blipuid: 1, wgrffmtfilter: 1, docvar: 1,
    footnote: 1, annotation: 1, atnid: 1, atnauthor: 1, nonshppict: 1, shppict: 0, shpinst: 1, sp: 1, sn: 1, sv: 1, title: 1, author: 1, operator: 1, company: 1, listpicture: 1, defchp: 1, defpap: 1, ftnsep: 1, ftnsepc: 1, aftnsep: 1, aftnsepc: 1 };
  var SYM = { emdash: "—", endash: "–", lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”", bullet: "•", emspace: " ", enspace: " ", qmspace: " ", zwj: "‍", zwnj: "‌", ltrmark: "‎", rtlmark: "‏" };
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function byteDecoder(cp) {
    if (!cp || cp === 1252) return function (n) { return String.fromCharCode(CP1252[n] || n); };
    var dec = null; try { dec = new TextDecoder("windows-" + cp); } catch (e) { try { dec = new TextDecoder(cp === 10000 ? "macintosh" : "cp" + cp); } catch (e2) { dec = null; } }
    return function (n) { return dec ? dec.decode(new Uint8Array([n])) : String.fromCharCode(n); };
  }
  function rtfToHtml(src) {
    src = String(src || "");
    var st = { b: 0, i: 0, u: 0, s: 0, sup: 0, sub: 0, fs: 24, cf: 0, skip: 0, uc: 1, dest: "" }, stack = [], colors = [], colorBuf = null, cp = 1252, bytes = byteDecoder(1252);
    var paras = [], runs = [], para = { align: "" }, plainOut = [], ucSkip = 0;
    var table = null, row = null, cell = null, inTbl = false, rowsDone = [];
    function push(text) {
      if (st.skip || !text) return;
      if (st.dest === "colortbl") return;
      var last = runs[runs.length - 1], key = st.b + "|" + st.i + "|" + st.u + "|" + st.s + "|" + st.sup + "|" + st.sub + "|" + st.fs + "|" + st.cf;
      if (last && last.key === key) last.t += text; else runs.push({ key: key, t: text, b: st.b, i: st.i, u: st.u, s: st.s, sup: st.sup, sub: st.sub, fs: st.fs, cf: st.cf });
    }
    function runHtml(r) {
      var h = escapeHtml(r.t).replace(/\t/g, " ").replace(/\n/g, "<br>"), sty = [];
      if (r.fs && r.fs !== 24) sty.push("font-size:" + (Math.round(r.fs / 24 * 100) / 100) + "em");
      if (r.cf && colors[r.cf]) sty.push("color:" + colors[r.cf]);
      if (sty.length) h = '<span style="' + sty.join(";") + '">' + h + "</span>";
      if (r.b) h = "<b>" + h + "</b>"; if (r.i) h = "<i>" + h + "</i>"; if (r.u) h = "<u>" + h + "</u>"; if (r.s) h = "<s>" + h + "</s>";
      if (r.sup) h = "<sup>" + h + "</sup>"; else if (r.sub) h = "<sub>" + h + "</sub>";
      return h;
    }
    function endPara(force) {
      var text = runs.map(function (r) { return r.t; }).join("");
      if (!force && !runs.length) { if (!inTbl) { if (table) flushTable(); paras.push({ html: "", text: "" }); } return; }
      var maxFs = runs.reduce(function (m, r) { return /\S/.test(r.t) ? Math.max(m, r.fs || 24) : m; }, 0), allBold = runs.every(function (r) { return r.b || !/\S/.test(r.t); });
      var tag = "p";
      if (text.length < 120 && /\S/.test(text) && (maxFs >= 36 || (maxFs >= 28 && allBold))) tag = maxFs >= 40 ? "h1" : maxFs >= 32 ? "h2" : "h3";
      var html = runs.map(function (r) { return tag === "p" ? runHtml(r) : runHtml(Object.assign({}, r, { fs: 24, b: 0 })); }).join("");   // a heading takes its size from the heading style
      var al = para.align ? ' style="text-align:' + para.align + '"' : "";
      var p = { html: "<" + tag + al + ">" + (html || "&nbsp;") + "</" + tag + ">", text: text };
      if (inTbl) { cell = cell || []; cell.push(p); } else { if (table) flushTable(); paras.push(p); }
      plainOut.push(text); runs = [];
    }
    var i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === "{") { stack.push(Object.assign({}, st)); i++; continue; }
      if (c === "}") { if (st.dest === "colortbl" && colorBuf) colorBuf = null; st = stack.pop() || st; i++; continue; }
      if (c === "\\") {
        var nx = src[i + 1];
        if (nx === "'") { var hx = parseInt(src.substr(i + 2, 2), 16); i += 4; if (ucSkip > 0) { ucSkip--; continue; } if (!isNaN(hx)) push(bytes(hx)); continue; }
        if (nx === "\\" || nx === "{" || nx === "}") { i += 2; if (ucSkip > 0) { ucSkip--; continue; } push(nx); continue; }
        if (nx === "~") { i += 2; push(" "); continue; }
        if (nx === "_") { i += 2; push("‑"); continue; }
        if (nx === "-") { i += 2; continue; }
        if (nx === "*") { st.skip = 1; i += 2; continue; }
        if (nx === "\n" || nx === "\r") { i += 2; if (!st.skip) endPara(); continue; }
        var m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(src.substr(i + 1, 48));
        if (!m) { i += 2; continue; }
        i += 1 + m[0].length;
        var w = m[1], arg = m[2] !== undefined ? parseInt(m[2], 10) : null;
        if (ucSkip > 0 && w !== "u") { ucSkip--; continue; }
        if (SKIP[w] === 1) { st.skip = 1; continue; }
        if (w === "colortbl") { st.dest = "colortbl"; colorBuf = {}; continue; }
        if (st.dest === "colortbl") { if (w === "red") colorBuf.r = arg; else if (w === "green") colorBuf.g = arg; else if (w === "blue") colorBuf.b = arg; continue; }
        if (st.skip) continue;
        switch (w) {
          case "ansicpg": cp = arg; bytes = byteDecoder(arg); break;
          case "mac": cp = 10000; bytes = byteDecoder(10000); break;
          case "par": case "sect": case "page": endPara(); break;
          case "line": push("\n"); break;
          case "tab": push("\t"); break;
          case "pard": para = { align: "" }; inTbl = false; break;
          case "intbl": inTbl = true; break;
          case "ql": para.align = ""; break; case "qc": para.align = "center"; break; case "qr": para.align = "right"; break; case "qj": para.align = "justify"; break;
          case "plain": st.b = st.i = st.u = st.s = st.sup = st.sub = 0; st.fs = 24; st.cf = 0; break;
          case "b": st.b = arg === 0 ? 0 : 1; break;
          case "i": st.i = arg === 0 ? 0 : 1; break;
          case "ul": case "uld": case "uldb": case "ulw": st.u = arg === 0 ? 0 : 1; break;
          case "ulnone": st.u = 0; break;
          case "strike": case "striked": st.s = arg === 0 ? 0 : 1; break;
          case "super": st.sup = 1; st.sub = 0; break; case "sub": st.sub = 1; st.sup = 0; break; case "nosupersub": st.sup = st.sub = 0; break;
          case "fs": if (arg > 0) st.fs = arg; break;
          case "cf": st.cf = arg || 0; break;
          case "uc": st.uc = arg || 0; break;
          case "u": { var cc = arg < 0 ? arg + 65536 : arg; push(String.fromCharCode(cc)); ucSkip = st.uc; break; }
          case "cell": endPara(true); row = row || []; row.push(cell || []); cell = null; break;
          case "row": if (row) { table = table || []; table.push(row); row = null; } inTbl = false; break;
          default: if (SYM[w]) push(SYM[w]);
        }
        // a table ends at the first paragraph that is not in it
        continue;
      }
      if (c === "\r" || c === "\n") { i++; continue; }
      if (st.dest === "colortbl") { if (c === ";") { colors.push(colorBuf && colorBuf.r != null ? "rgb(" + (colorBuf.r | 0) + "," + (colorBuf.g | 0) + "," + (colorBuf.b | 0) + ")" : null); colorBuf = {}; } i++; continue; }
      // plain text up to the next special character
      var j = i; while (j < n && src[j] !== "\\" && src[j] !== "{" && src[j] !== "}" && src[j] !== "\r" && src[j] !== "\n") j++;
      var txt = src.slice(i, j); i = j;
      if (ucSkip > 0) { var k = Math.min(ucSkip, txt.length); txt = txt.slice(k); ucSkip -= k; }
      push(txt);
    }
    function flushTable() {
      if (!table) return;
      var h = "<table>" + table.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c.map(function (p) { return p.html; }).join("") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
      paras.push({ html: h, text: table.map(function (r) { return r.map(function (c) { return c.map(function (p) { return p.text; }).join(" "); }).join("\t"); }).join("\n") }); table = null;
    }
    if (runs.length) endPara();
    flushTable();
    // drop the run of empty paragraphs at the end and collapse 3+ empty ones in a row
    var out = [], empties = 0;
    paras.forEach(function (p) { if (!p.text && !/<table/.test(p.html)) { empties++; if (empties <= 1) out.push(p); } else { empties = 0; out.push(p); } });
    while (out.length && !out[out.length - 1].text && !/<table/.test(out[out.length - 1].html)) out.pop();
    var colorsUsed = colors.some(Boolean);
    return { html: out.map(function (p) { return p.html || "<p>&nbsp;</p>"; }).join("\n"), text: out.map(function (p) { return p.text; }).join("\n"), colors: colorsUsed, codepage: cp };
  }

  // ---------- CSV ----------
  function guessSep(t) { var line = String(t || "").split(/\r?\n/).slice(0, 5).join("\n"), best = ",", bn = -1; [",", ";", "\t", "|"].forEach(function (s) { var n = line.split(s).length; if (n > bn) { bn = n; best = s; } }); return best; }
  function parseCsv(t, sep, max) {
    t = String(t || ""); sep = sep || guessSep(t); max = max || 1e6;
    var rows = [], row = [], f = "", q = false, i = 0, n = t.length;
    while (i < n) {
      var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; } f += c; i++; continue; }
      if (c === '"' && f === "") { q = true; i++; continue; }
      if (c === sep) { row.push(f); f = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; i++; if (rows.length >= max) return rows; continue; }
      f += c; i++;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  // ---------- text helpers ----------
  function stats(t) { t = String(t || ""); var m = t.match(/\S+/g); return { lines: t ? t.split(/\r\n|\r|\n/).length : 0, words: m ? m.length : 0, chars: t.length }; }
  function shouldUnwrap(t) {
    var lines = String(t || "").split(/\r?\n/).slice(0, 400).filter(function (l) { return l.trim(); });
    if (lines.length < 12) return false;
    var lens = lines.map(function (l) { return l.length; }).sort(function (a, b) { return a - b; }), med = lens[lens.length >> 1];
    if (med < 50 || med > 90) return false;
    var band = lines.filter(function (l) { return l.length >= med - 18 && l.length <= med + 6; }).length;
    return band / lines.length > 0.6;
  }
  // paragraphs for the reading view: blank lines split paragraphs; single line breaks kept, or joined when unwrap
  function paragraphs(t, unwrap) {
    return String(t || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map(function (p) {
      p = p.replace(/^\n+|\n+$/g, "");
      if (!unwrap) return p;
      // keep breaks before list-like lines and very short lines (headings, poems)
      return p.split("\n").reduce(function (acc, l, k, arr) { if (!k) return l; var prev = arr[k - 1]; return acc + (/^\s*([-*•]|\d+[.)])\s/.test(l) || prev.trim().length < 40 ? "\n" : " ") + l.replace(/^\s+/, ""); }, "");
    }).filter(function (p) { return p !== ""; });
  }
  function linkify(escaped) { return escaped.replace(/\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener nofollow ugc">$1</a>'); }
  // hljs output can open a <span> on one line and close it on another: close the open ones at each line end and reopen them on the next line
  function splitHtmlLines(html) {
    var out = [], open = [], cur = "", re = /<span[^>]*>|<\/span>|\n|[^<\n]+|</g, m;
    while ((m = re.exec(html))) {
      var tk = m[0];
      if (tk === "\n") { out.push(cur + "</span>".repeat(open.length)); cur = open.join(""); continue; }
      if (tk.charAt(0) === "<" && tk.charAt(1) === "s") open.push(tk); else if (tk === "</span>") open.pop();
      cur += tk;
    }
    out.push(cur + "</span>".repeat(open.length));
    return out;
  }

  var api = { decode: decode, info: info, extOf: extOf, rtfToHtml: rtfToHtml, parseCsv: parseCsv, guessSep: guessSep, stats: stats, shouldUnwrap: shouldUnwrap, paragraphs: paragraphs, linkify: linkify, splitHtmlLines: splitHtmlLines, escapeHtml: escapeHtml, isJson: isJson, LANG: LANG };
  root.MESText = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Text Viewer -- mes.fm/text. Opens text-based files (txt, md, rtf, csv, json, html, logs, code ...) from a file, a drop, a paste,
   a link (?url=, /main_js/link-open.js), another MES page (?handoff=) or the MES Read Aloud extension (?ext=&k=), and shows them in a
   Reading view (formatted) or a Code view (line numbers, highlight.js colours). Helpers in lib.js (MESText). Nothing is uploaded.
   Libraries, loaded only when needed: marked 12.0.2 + DOMPurify 3.1.6 (Markdown / HTML), highlight.js 11.9.0 (code colours). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("tx"), T = window.MESText;
	if (!root || !T) return;
	var LO = window.MESLinkOpen, KEY = "mes-text:v1";
	var LIB = { marked: "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js", purify: "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js", hljs: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" };
	var S = { fs: 1, look: "auto", width: "normal", font: "sans", unwrap: "auto", wrap: false, nums: true, colors: true, views: {} };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var D = null;   // the open document: {name, bytes, text, enc, info, view, src, dirty}
	var readV = $("tx-readv"), codeV = $("tx-codev"), editor = $("tx-editor"), empty = $("tx-empty"), stage = $("tx-stage"), infoEl = $("tx-info");
	var scripts = {};
	function loadScript(u) {
		if (!scripts[u]) scripts[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.async = true; s.onload = res; s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a helper library. Check your connection.")); }; document.head.appendChild(s); });
		return scripts[u];
	}
	function esc(s) { return T.escapeHtml(s == null ? "" : s); }
	function toast(msg, ms) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2600); }
	function info(msg, err) { infoEl.textContent = msg || ""; infoEl.classList.toggle("is-err", !!err); }
	function fmtSize(n) { return n < 1024 ? n + " bytes" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }

	// ---------- settings ----------
	function applyLook() {
		root.dataset.look = S.look; root.dataset.width = S.width; root.dataset.font = S.font;
		root.style.setProperty("--tf", S.fs); root.classList.toggle("tx-wrap", !!S.wrap); root.classList.toggle("tx-nonums", !S.nums);
		readV.classList.toggle("tx-nocolor", !S.colors);
		$("tx-theme").value = S.look; $("tx-width").value = S.width; $("tx-font").value = S.font; $("tx-unwrap").value = S.unwrap;
		$("tx-wrap").checked = !!S.wrap; $("tx-nums").checked = !!S.nums; $("tx-colors").checked = !!S.colors;
	}
	applyLook();
	[["tx-theme", "look"], ["tx-width", "width"], ["tx-font", "font"]].forEach(function (p) { $(p[0]).onchange = function () { S[p[1]] = this.value; save(); applyLook(); }; });
	$("tx-unwrap").onchange = function () { S.unwrap = this.value; save(); if (D) render(); };
	$("tx-wrap").onchange = function () { S.wrap = this.checked; save(); applyLook(); };
	$("tx-nums").onchange = function () { S.nums = this.checked; save(); applyLook(); };
	$("tx-colors").onchange = function () { S.colors = this.checked; save(); applyLook(); };
	$("tx-enc").onchange = function () { if (!D || !D.bytes) return; if (D.dirty && !confirm("Re-reading the file with other characters drops your edits. Go on?")) { this.value = D.encPick || "auto"; return; } D.encPick = this.value; var r = T.decode(D.bytes, this.value); D.text = r.text; D.enc = r.enc; D.dirty = false; D.info = T.info(D.name, D.text); render(); };
	function setFs(v) { S.fs = Math.round(Math.max(0.6, Math.min(2.6, v)) * 100) / 100; save(); applyLook(); }
	$("tx-smaller").onclick = function () { setFs(S.fs - 0.1); }; $("tx-bigger").onclick = function () { setFs(S.fs + 0.1); };
	$("tx-more").onclick = function () { var m = $("tx-menu"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); };

	// ---------- opening ----------
	function confirmDrop() { return !D || !D.dirty || confirm("You have unsaved edits. Open another file and drop them?"); }
	function openBytes(buf, name, opt) {
		opt = opt || {};
		var bytes = new Uint8Array(buf), r = T.decode(bytes);
		D = { name: name || "Untitled.txt", bytes: bytes, text: r.text, enc: r.enc, encPick: "auto", info: T.info(name, r.text), src: opt.src || "", dirty: false, size: bytes.length };
		D.view = S.views[D.info.kind] || (D.info.kind === "code" || D.info.kind === "json" ? "code" : "read");
		$("tx-enc").value = "auto";
		document.title = D.name + " · MES Text Viewer";
		render();
		stage.scrollTop = 0;
	}
	function openFile(f) {
		if (!f) return;
		var kind = LO ? LO.kindOf(f.name, f.type) : "text";
		if (kind === "pdf" || kind === "docx") return LO.sendTo(kind, f, { busy: !!D });
		f.arrayBuffer().then(function (b) {
			var k2 = LO ? LO.kindOf(f.name, f.type, b) : "text";
			if (k2 === "pdf" || k2 === "docx") return LO.sendTo(k2, f, { busy: !!D });
			if (k2 === "doc") return info("That is an old Word .doc file. Open it in Word or Google Docs and save it as .docx (then open it in the Word Viewer).", true);
			if (k2 === "other") return info((f.name || "That file") + " is not a text file (it has binary data in it).", true);
			if (!confirmDrop()) return;
			openBytes(b, f.name, { src: f.mesUrl });
			if (f.mesFromExt) toast("Opened from MES Read Aloud. Press Read aloud to listen.", 4500);
		}, function () { info("The file could not be read.", true); });
	}
	function openText(text, name) { if (!confirmDrop()) return; openBytes(new TextEncoder().encode(text), name || "Pasted text.txt"); }
	$("tx-open").onclick = $("tx-e-open").onclick = function (e) { e.stopPropagation(); $("tx-file").click(); };
	$("tx-drop").onclick = function () { $("tx-file").click(); };
	$("tx-drop").onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("tx-file").click(); } };
	$("tx-file").onchange = function () { openFile(this.files[0]); this.value = ""; };
	$("tx-pastego").onclick = function () { var v = $("tx-pastein").value; if (v.trim()) openText(v); };
	var depth = 0, hasFiles = function (e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; };
	document.addEventListener("dragenter", function (e) { if (hasFiles(e)) { depth++; root.classList.add("is-over"); } });
	document.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) root.classList.remove("is-over"); });
	document.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
	document.addEventListener("drop", function (e) { depth = 0; root.classList.remove("is-over"); if (!hasFiles(e)) return; e.preventDefault(); openFile(e.dataTransfer.files[0]); });
	document.addEventListener("paste", function (e) {
		var t = e.target; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
		var cd = e.clipboardData; if (!cd) return;
		if (cd.files && cd.files.length) { e.preventDefault(); openFile(cd.files[0]); return; }
		var x = cd.getData("text/plain"); if (!x) return;
		e.preventDefault();
		if (LO && LO.looksLikeLink(x)) openLink(x.trim()); else openText(x);
	});
	// links
	var linkTip = $("tx-linknote").textContent;
	function linkNote(m, err) { var n = $("tx-linknote"); n.textContent = m || linkTip; n.classList.toggle("is-err", !!err); }
	function openLink(raw) {
		if (!LO) return toast("Could not load the link opener");
		$("tx-linkgo").disabled = true; info("Fetching the file…");
		return LO.get(raw, { kind: "text", onStatus: function (m) { linkNote(m); info(m); } }).then(function (f) {
			linkNote(""); info(""); $("tx-link").value = "";
			if (f.mesKind === "pdf" || f.mesKind === "docx") return LO.sendTo(f.mesKind, f, { busy: false });
			if (!confirmDrop()) return;
			return f.arrayBuffer().then(function (b) { openBytes(b, f.name, { src: f.mesUrl }); });
		}).catch(function (e) { var m = (e && e.message || String(e)) + " You can also download the file and drop it here."; linkNote(m, true); info(m, true); })
			.then(function () { $("tx-linkgo").disabled = false; });
	}
	$("tx-linkform").onsubmit = function (e) { e.preventDefault(); openLink($("tx-link").value); };
	$("tx-openlink").onclick = function () { var v = prompt("Link to a text file (https://…)\nGitHub, Google Docs, Drive and Dropbox links work when the file is public.", ""); if (v) openLink(v); };

	// ---------- rendering ----------
	function setView(v) {
		if (!D) return;
		if (D.editing) finishEdit();
		D.view = v; S.views[D.info.kind] = v; save(); render();
	}
	$("tx-vread").onclick = function () { setView("read"); }; $("tx-vcode").onclick = function () { setView("code"); };
	function enable(on) { ["tx-read", "tx-edit", "tx-copy", "tx-dl", "tx-dltxt", "tx-print", "tx-close"].forEach(function (id) { $(id).disabled = !on; }); }
	var renderGen = 0;
	function render() {
		var my = ++renderGen;
		enable(!!D); empty.hidden = !!D;
		if (!D) { readV.hidden = codeV.hidden = editor.hidden = true; $("tx-name").textContent = "No file open"; info(""); $("tx-share").hidden = true; return; }
		$("tx-name").textContent = D.name + (D.dirty ? " •" : "");
		$("tx-vread").setAttribute("aria-pressed", String(D.view === "read")); $("tx-vcode").setAttribute("aria-pressed", String(D.view === "code"));
		$("tx-share").hidden = !/^https?:/.test(D.src || "");
		var st = T.stats(D.text);
		info(D.info.label + " · " + st.lines.toLocaleString() + " lines · " + st.words.toLocaleString() + " words · " + fmtSize(D.size || D.text.length) + " · " + (D.enc || "utf-8").toUpperCase());
		editor.hidden = true;
		if (D.view === "code") { readV.hidden = true; codeV.hidden = false; renderCode(my); }
		else { codeV.hidden = true; readV.hidden = false; renderRead(my).catch(function (e) { if (my === renderGen) readV.innerHTML = "<p>" + esc(e.message || e) + "</p>"; }); }
	}
	function purify(html, keepStyle) {
		return window.DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "link", "meta", "base", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "script"], FORBID_ATTR: keepStyle ? [] : ["style", "class", "id"], ALLOW_DATA_ATTR: false });
	}
	function fixLinks(el) { el.querySelectorAll("a[href]").forEach(function (a) { if (/^\s*javascript:/i.test(a.getAttribute("href"))) a.removeAttribute("href"); else if (!/^#/.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener nofollow ugc"; } }); }
	function renderRead(my) {
		var k = D.info.kind, t = D.text;
		if (k === "md" || k === "html") {
			readV.innerHTML = '<p class="tx-morenote">Formatting…</p>';
			return Promise.all([loadScript(LIB.purify), k === "md" ? loadScript(LIB.marked) : null]).then(function () {
				if (my !== renderGen) return;
				var html = k === "md" ? window.marked.parse(t, { gfm: true, breaks: false }) : t.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
				readV.innerHTML = purify(html); fixLinks(readV);
				readV.querySelectorAll("table").forEach(function (tb) { var w = document.createElement("div"); w.className = "tx-tablewrap"; tb.parentNode.insertBefore(w, tb); w.appendChild(tb); });
			});
		}
		if (k === "rtf") { var r = T.rtfToHtml(t); readV.innerHTML = r.html || "<p>(This RTF file has no text.)</p>"; return Promise.resolve(); }
		if (k === "csv" || k === "tsv") {
			var rows = T.parseCsv(t, k === "tsv" ? "\t" : null, 5001), MAX = 5000, more = rows.length > MAX; rows = rows.slice(0, MAX);
			var head = rows.shift() || [];
			readV.innerHTML = '<div class="tx-tablewrap"><table class="tx-csv"><thead><tr>' + head.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
				rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
				(more ? '<p class="tx-morenote">Showing the first ' + MAX.toLocaleString() + ' rows. Open it in <a href="/excel">MES Excel</a> to see them all.</p>' : "");
			return Promise.resolve();
		}
		if (k === "json" || k === "code") {   // code read as a page: monospace, coloured, no line numbers
			var src = t; if (k === "json") { try { src = JSON.stringify(JSON.parse(t), null, 2); } catch (e) { /* keep as written */ } }
			readV.innerHTML = '<pre><code>' + esc(src) + "</code></pre>";
			return highlight(src, D.info.lang).then(function (h) { if (my === renderGen && h) readV.querySelector("code").innerHTML = h; });
		}
		// plain text: paragraphs, links, comfortable lines; hard-wrapped e-texts joined back when asked (or found automatically)
		var unwrap = S.unwrap === "join" || (S.unwrap === "auto" && T.shouldUnwrap(t)), paras = T.paragraphs(t, unwrap), MAXP = 20000;
		var art = /[ ]{3,}\S|[─-╿]|^\s*[|+][-=+]{3,}/m.test(t.slice(0, 6000));   // tables / ASCII art: keep the spacing
		var html = paras.slice(0, MAXP).map(function (p) { return '<p' + (art ? ' class="tx-pre"' : "") + '>' + T.linkify(esc(p)).replace(/\n/g, "<br>") + "</p>"; }).join("");
		if (paras.length > MAXP) html += '<p class="tx-morenote">Showing the first ' + MAXP.toLocaleString() + " paragraphs. The Code view shows the whole file.</p>";
		readV.innerHTML = html || "<p>(Empty file)</p>";
		if (art && S.font === "sans") readV.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace"; else readV.style.fontFamily = "";
		return Promise.resolve();
	}
	function highlight(src, lang) {
		if (!src || src.length > 1.5e6) return Promise.resolve(null);
		return loadScript(LIB.hljs).then(function () {
			var H = window.hljs; if (!H) return null;
			try { if (lang && H.getLanguage(lang)) return H.highlight(src, { language: lang, ignoreIllegals: true }).value; if (src.length < 200000 && !lang) return null; } catch (e) { /* fall through */ }
			return null;
		}, function () { return null; });
	}
	var BATCH = 5000, codeLines = null, codeShown = 0;
	function renderCode(my) {
		var src = D.text, lang = D.info.kind === "text" ? "" : D.info.lang;
		codeLines = esc(src).split(/\r\n|\r|\n/); codeShown = 0; codeV.innerHTML = ""; addLines();
		highlight(src, lang).then(function (h) { if (my !== renderGen || !h) return; codeLines = T.splitHtmlLines(h.replace(/\r\n?/g, "\n")); var n = codeShown; codeShown = 0; codeV.innerHTML = ""; addLines(Math.max(n, Math.min(BATCH, codeLines.length))); });
	}
	function addLines(n) {
		var old = codeV.querySelector(".tx-moreb"); if (old) old.remove();
		var end = Math.min(codeLines.length, codeShown + (n || BATCH)), out = [];
		for (var i = codeShown; i < end; i++) out.push('<div class="tx-l"><span class="tx-n">' + (i + 1) + '</span><span class="tx-c">' + (codeLines[i] || " ") + "</span></div>");
		codeV.insertAdjacentHTML("beforeend", out.join("")); codeShown = end;
		if (codeShown < codeLines.length) { var b = document.createElement("button"); b.type = "button"; b.className = "tx-btn tx-moreb"; b.textContent = "Show more lines (" + (codeLines.length - codeShown).toLocaleString() + " left)"; b.onclick = function () { addLines(); }; codeV.appendChild(b); }
	}
	stage.addEventListener("scroll", function () { if (D && D.view === "code" && codeLines && codeShown < codeLines.length && stage.scrollTop + stage.clientHeight > stage.scrollHeight - 600) addLines(); });

	// ---------- edit / save ----------
	function startEdit() {
		if (!D) return; D.editing = true; readV.hidden = codeV.hidden = true; editor.hidden = false; editor.value = D.text; editor.focus();
		$("tx-edit").textContent = "Done editing"; $("tx-edit").setAttribute("aria-pressed", "true");
	}
	function finishEdit() {
		if (!D || !D.editing) return; D.editing = false;
		if (editor.value !== D.text) { D.text = editor.value; D.dirty = true; D.bytes = null; D.size = new Blob([D.text]).size; D.enc = "utf-8"; D.info = T.info(D.name, D.text); }
		$("tx-edit").textContent = "Edit"; $("tx-edit").setAttribute("aria-pressed", "false"); render();
	}
	$("tx-edit").onclick = function () { if (D && D.editing) finishEdit(); else startEdit(); };
	editor.addEventListener("keydown", function (e) { if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); var a = editor.selectionStart, b = editor.selectionEnd; editor.setRangeText("\t", a, b, "end"); } else if (e.key === "Escape") finishEdit(); });
	function download(asTxt) {
		if (!D) return; if (D.editing) finishEdit();
		var name = asTxt ? D.name.replace(/\.[a-z0-9]+$/i, "") + ".txt" : D.name, text = D.text;
		if (asTxt && D.info.kind === "rtf") text = T.rtfToHtml(D.text).text;
		var blob = !asTxt && !D.dirty && D.bytes ? new Blob([D.bytes]) : new Blob([text], { type: "text/plain;charset=utf-8" });
		var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
		D.dirty = false; $("tx-name").textContent = D.name;
	}
	$("tx-dl").onclick = function () { download(false); }; $("tx-dltxt").onclick = function () { download(true); };
	$("tx-copy").onclick = function () { if (!D) return; var t = D.info.kind === "rtf" ? T.rtfToHtml(D.text).text : D.text; navigator.clipboard.writeText(t).then(function () { toast("Copied"); }, function () { toast("The browser did not allow copying"); }); };
	$("tx-share").onclick = function () { if (!D || !D.src) return; var u = location.origin + "/text?url=" + encodeURIComponent(D.src); navigator.clipboard.writeText(u).then(function () { toast("Link copied: it opens this file here"); }, function () { prompt("Copy this link:", u); }); };
	$("tx-print").onclick = function () { if (D && D.editing) finishEdit(); window.print(); };
	$("tx-close").onclick = function () { if (!confirmDrop()) return; D = null; document.title = "MES Text Viewer"; render(); };
	window.addEventListener("beforeunload", function (e) { if (!window.__mesCloudLeaving && D && (D.dirty || (D.editing && editor.value !== D.text))) { e.preventDefault(); e.returnValue = ""; } });

	// ---------- ☁ Cloud: keep the file saved to a synced folder, Dropbox, OneDrive or Google Drive (main_js/cloud-files.js) ----------
	function syncEdit() {   // typed text counts at once (not only when "Done editing" is pressed), so auto-save sees it
		if (!D || !D.editing || editor.value === D.text) return;
		D.text = editor.value; D.dirty = true; D.bytes = null; D.size = new Blob([D.text]).size; D.enc = "utf-8"; $("tx-name").textContent = D.name + " •";
	}
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "text", folder: "MES Apps/Text", what: "text file", title: "Text", defExt: "txt", btnClass: "tx-btn", before: $("tx-read"), toast: toast,
		exts: [".txt", ".md", ".markdown", ".rtf", ".csv", ".tsv", ".json", ".html", ".htm", ".xml", ".log", ".srt", ".vtt", ".ini", ".cfg", ".conf", ".yaml", ".yml", ".toml", ".js", ".mjs", ".ts", ".css", ".py", ".sh", ".bat", ".ps1", ".c", ".h", ".cpp", ".java", ".cs", ".go", ".rs", ".php", ".rb", ".sql", ".tex"],
		accept: [{ description: "Text file", accept: { "text/plain": [".txt", ".md", ".rtf", ".csv", ".tsv", ".json", ".html", ".log", ".xml", ".srt"] } }],
		doc: function () { return D; },
		name: function (d) { return d.name; },
		bytes: function (d) { if (d !== D) return Promise.reject(new Error("That file was closed.")); syncEdit(); return Promise.resolve(!d.dirty && d.bytes ? d.bytes : new TextEncoder().encode(d.text)); },
		open: function (u8, name) { openBytes(u8, name); return D; },
		dirty: function (d) { if (d === D) syncEdit(); return !!d.dirty; },
		markDirty: function (d) { d.dirty = true; render(); },
		saved: function (d, name) { if (name && name !== d.name) { d.name = name; document.title = d.name + " · MES Text Viewer"; } d.dirty = false; if (d === D) $("tx-name").textContent = d.name; },
		replaces: true
	}) : null;
	editor.addEventListener("input", function () { if (!D || !cloud || !cloud.linked(D)) return; syncEdit(); cloud.changed(D); });

	// ---------- read aloud: the MES Read Aloud engine (main_js/site-read-aloud.js) reads the reading or code view ----------
	function activeRoot() { return !D ? null : D.view === "code" ? codeV : readV; }
	function readStart() {
		var r = activeRoot(); if (!r) return null;
		try { var sel = window.getSelection(); if (sel && !sel.isCollapsed && sel.anchorNode && r.contains(sel.anchorNode)) return sel.anchorNode; } catch (e) { /* ignore */ }
		var vr = stage.getBoundingClientRect(), ps = r.querySelectorAll(D.view === "code" ? ".tx-c" : "p,li,h1,h2,h3,h4,td,pre");
		for (var i = 0; i < ps.length; i++) { var b = ps[i].getBoundingClientRect(); if (b.height && b.bottom > vr.top + 10) return i ? ps[i] : null; }
		return null;
	}
	window.__mesraSource = { roots: function () { var r = activeRoot(); return r ? [r] : []; }, start: readStart };
	var raLoading = false;
	function readAloud() {
		if (!D) return; if (D.editing) finishEdit();
		if (window.MESReadAloud) { if (window.MESReadAloud.isActive && window.MESReadAloud.isActive()) window.MESReadAloud.toggle(); else window.MESReadAloud.read(); return; }
		if (raLoading) return; raLoading = true;
		var sc = document.createElement("script"); sc.src = "/main_js/site-read-aloud.js?v=1";
		sc.onload = function () { raLoading = false; if (window.MESReadAloud) window.MESReadAloud.read(); };
		sc.onerror = function () { raLoading = false; toast("Read aloud could not load. Check your connection and try again."); };
		document.head.appendChild(sc);
	}
	$("tx-read").onclick = readAloud;

	// ---------- fill window / full screen ----------
	function setFill(on) { root.classList.toggle("tx-fill", on); document.body.classList.toggle("tx-filling", on); $("tx-fill").setAttribute("aria-pressed", String(on)); $("tx-fill").title = on ? "Back to the normal page (W or Esc)" : "Fill the browser window (W)"; }
	$("tx-fill").onclick = function () { setFill(!root.classList.contains("tx-fill")); };
	$("tx-fs").onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); };

	// ---------- keys ----------
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
		if (mod && k === "o") { e.preventDefault(); $("tx-file").click(); return; }
		if (mod && k === "s" && D) { e.preventDefault(); if (!(cloud && cloud.save(D))) download(false); return; }
		if (e.altKey && e.shiftKey && e.code === "KeyR" && D) { e.preventDefault(); readAloud(); return; }
		if (typing || mod || e.altKey) return;
		if (e.key === "Escape" && root.classList.contains("tx-fill")) { setFill(false); return; }
		if (k === "w") setFill(!root.classList.contains("tx-fill")); else if (k === "f") $("tx-fs").click();
		else if (k === "+" || k === "=") setFs(S.fs + 0.1); else if (k === "-") setFs(S.fs - 0.1); else if (k === "0") setFs(1);
		else if (k === "e" && D) { e.preventDefault(); startEdit(); }
		else if (k === "v" && D) setView(D.view === "code" ? "read" : "code");
	});

	render();
	// a file handed over by another MES page or the Read Aloud extension, else ?url=
	if (LO) LO.receive().then(function (f) { if (f) openFile(f); else if (LO.fromQuery()) { $("tx-link").value = LO.fromQuery(); openLink(LO.fromQuery()); } }, function (e) { info(e.message, true); });
	window.MESTextDebug = { open: openBytes, openText: openText, get doc() { return D; }, render: render, setView: setView };
})();
