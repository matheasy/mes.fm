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
