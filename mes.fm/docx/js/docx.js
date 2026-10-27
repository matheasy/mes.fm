/* MESDocx: pure helpers of the Word document viewer / editor (mes.fm/docx).
   - sniff(): what kind of file the bytes are (.docx, old .doc, RTF, ODT, PDF ...)
   - parseProps() / parseComments() / headingStyles() / pageSetup() / docText() / docStats(): read the XML parts of a .docx
   - countText(), findAll(): word count and search
   - fromDom(): an edited HTML tree (any DOM-like object) -> a small block model
   - toDocxParts(): block model -> the files of a valid .docx (zip them with JSZip or MESImg.zipStore)
   - toMarkdown() / toText() / toHtml(): the same model as other formats
   Node tests: node tool_apps_src/docx-tests.js */
var MESDocx = (function () {
	"use strict";

	/* ---------- small helpers ---------- */
	function xmlEsc(s) {
		return String(s == null ? "" : s)
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
			.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1")
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	function htmlEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function xmlUnesc(s) {
		return String(s || "").replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
			.replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(+d); })
			.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
	}
	function attr(tag, name) {
		var m = new RegExp("\\s" + name.replace(/:/g, "\\:") + "=\"([^\"]*)\"").exec(tag) || new RegExp("\\s" + name.replace(/:/g, "\\:") + "='([^']*)'").exec(tag);
		return m ? xmlUnesc(m[1]) : null;
	}
	function utf8(s) {
		if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
		return Uint8Array.from(Buffer.from(s, "utf8"));
	}
	function b64decode(s) {
		s = s.replace(/[^A-Za-z0-9+/]/g, "");
		var map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", out = new Uint8Array(Math.floor(s.length * 3 / 4)), o = 0, buf = 0, bits = 0;
		for (var i = 0; i < s.length; i++) {
			buf = (buf << 6) | map.indexOf(s[i]); bits += 6;
			if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
		}
		return out.subarray(0, o);
	}
	/* data:image/png;base64,... -> {mime, data}; null when it is not a base64 data URI */
	function dataUri(src) {
		var m = /^data:([\w.+\/-]+)?(;[^,]*)?,(.*)$/i.exec(String(src || ""));
		if (!m || !/;base64/i.test(m[2] || "")) return null;
		return { mime: (m[1] || "application/octet-stream").toLowerCase(), data: b64decode(m[3]) };
	}
	var IMG_EXT = { "image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/gif": "gif", "image/bmp": "bmp" };

	/* ---------- what kind of file is it ---------- */
	function sniff(u8, name) {
		u8 = u8 || new Uint8Array(0);
		var head = ""; for (var i = 0; i < Math.min(u8.length, 120); i++) head += String.fromCharCode(u8[i]);
		var ext = String(name || "").toLowerCase().replace(/^.*\./, "");
		if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return "doc";        // old Word 97-2003 (OLE compound file)
		if (head.indexOf("{\\rtf") === 0) return "rtf";
		if (head.indexOf("%PDF") === 0) return "pdf";
		if (u8[0] === 0x50 && u8[1] === 0x4B) {
			if (head.indexOf("mimetypeapplication/vnd.oasis.opendocument.text") >= 0) return "odt";
			if (head.indexOf("mimetypeapplication/vnd.oasis.opendocument") >= 0) return "odf";
			return "zip";        // a .docx is a ZIP; whether it has word/document.xml is checked after unzipping
		}
		if (/^\s*<(\?xml|w:document|pkg:package)/.test(head) && /pkg:package|w:wordDocument/.test(head + (ext === "xml" ? "pkg:package" : ""))) return "flatxml";
		if (ext === "doc") return "doc";
		return "unknown";
	}
	var SNIFF_MSG = {
		doc: "This is an old Word 97-2003 .doc file. Only .docx can be opened here: open it in Word, LibreOffice or Google Docs and save it as .docx first.",
		rtf: "This is an RTF file. Only .docx can be opened here: open it in Word, LibreOffice or WordPad and save it as .docx first.",
		odt: "This is an OpenDocument (.odt) file. Only .docx can be opened here: open it in LibreOffice or Google Docs and save it as .docx.",
		odf: "This is an OpenDocument file (spreadsheet or presentation), not a Word document.",
		pdf: "This is a PDF. Open it in the PDF Editor instead.",
		flatxml: "This is a Word XML file (Flat OPC). Open it in Word and save it as .docx first.",
		zip: "This ZIP file is not a Word document (it has no word/document.xml). Excel and PowerPoint files are not supported here.",
		unknown: "This does not look like a Word .docx file."
	};

	/* ---------- reading the XML parts ---------- */
	function tagText(xml, tag) {
		var m = new RegExp("<" + tag.replace(/:/g, "\\:") + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag.replace(/:/g, "\\:") + ">").exec(xml || "");
		return m ? xmlUnesc(m[1]).trim() : "";
	}
	/* docProps/core.xml + docProps/app.xml -> plain object (empty strings dropped) */
	function parseProps(core, app) {
		var p = {
			title: tagText(core, "dc:title"), subject: tagText(core, "dc:subject"), author: tagText(core, "dc:creator"),
			keywords: tagText(core, "cp:keywords"), description: tagText(core, "dc:description"), category: tagText(core, "cp:category"),
			lastModifiedBy: tagText(core, "cp:lastModifiedBy"), revision: tagText(core, "cp:revision"),
			created: tagText(core, "dcterms:created"), modified: tagText(core, "dcterms:modified"), lastPrinted: tagText(core, "cp:lastPrinted"),
			application: tagText(app, "Application"), appVersion: tagText(app, "AppVersion"), company: tagText(app, "Company"), manager: tagText(app, "Manager"),
			template: tagText(app, "Template"), pages: tagText(app, "Pages"), words: tagText(app, "Words"), characters: tagText(app, "Characters"),
			totalTime: tagText(app, "TotalTime")
		};
		Object.keys(p).forEach(function (k) { if (p[k] === "") delete p[k]; });
		return p;
	}
	/* w:p ... -> text, one line per paragraph (used by comments + word count) */
	function paraTexts(xml) {
		var out = [], re = /<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g, m;
		while ((m = re.exec(xml || ""))) out.push(runText(m[0]));
		return out;
	}
	function runText(x) {
		var s = "", re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:br\s[^>]*\/>|<w:noBreakHyphen\/>|<w:cr\/>/g, m;
		while ((m = re.exec(x))) {
			if (m[1] != null) s += xmlUnesc(m[1]);
			else if (/tab/.test(m[0])) s += "\t";
			else if (/noBreakHyphen/.test(m[0])) s += "\u2011";
			else s += "\n";
		}
		return s;
	}
	function docText(docXml) {
		var body = /<w:body>([\s\S]*)<\/w:body>/.exec(docXml || "");
		return paraTexts(body ? body[1] : docXml).join("\n");
	}
	function parseComments(xml) {
		var out = [], re = /<w:comment\s([^>]*)>([\s\S]*?)<\/w:comment>/g, m;
		while ((m = re.exec(xml || ""))) {
			var t = "<x " + m[1] + ">";
			out.push({ id: attr(t, "w:id"), author: attr(t, "w:author") || "", initials: attr(t, "w:initials") || "", date: attr(t, "w:date") || "", text: paraTexts(m[2]).join("\n").trim() });
		}
		return out;
	}
	/* styles.xml -> {styleId: level} for paragraph styles that are headings (0 = Title, 1-9 = Heading 1-9) */
	function headingStyles(xml) {
		var out = {}, re = /<w:style\s([^>]*)>([\s\S]*?)<\/w:style>/g, m;
		while ((m = re.exec(xml || ""))) {
			var t = "<x " + m[1] + ">";
			if ((attr(t, "w:type") || "paragraph") !== "paragraph") continue;
			var id = attr(t, "w:styleId"); if (!id) continue;
			var nm = /<w:name\s[^>]*w:val="([^"]*)"/.exec(m[2]), name = nm ? xmlUnesc(nm[1]).toLowerCase() : "";
			var ol = /<w:outlineLvl\s[^>]*w:val="(\d+)"/.exec(m[2]);
			var hm = /^heading\s*(\d)$/.exec(name);
			if (name === "title") out[id] = 0;
			else if (hm) out[id] = +hm[1];
			else if (ol && +ol[1] < 9) out[id] = +ol[1] + 1;
		}
		return out;
	}
	/* the class name docx-preview gives a paragraph of a style (escapeClassName in docx-preview) */
	function styleClass(prefix, id) { return prefix + "_" + String(id).replace(/[ .]+/g, "-").replace(/[&]+/g, "and").toLowerCase(); }
	/* page size + margins of the last section, in twips (1/1440 inch) */
	function pageSetup(docXml) {
		var secs = String(docXml || "").match(/<w:sectPr[\s>][\s\S]*?<\/w:sectPr>/g), s = secs ? secs[secs.length - 1] : "";
		var sz = /<w:pgSz\s[^>]*>/.exec(s), mg = /<w:pgMar\s[^>]*>/.exec(s);
		var num = function (t, n, d) { var v = t ? attr(t[0], n) : null; return v != null && isFinite(+v) && +v > 0 ? Math.round(+v) : d; };
		var r = { w: num(sz, "w:w", 12240), h: num(sz, "w:h", 15840), top: num(mg, "w:top", 1440), right: num(mg, "w:right", 1440), bottom: num(mg, "w:bottom", 1440), left: num(mg, "w:left", 1440) };
		if (sz && attr(sz[0], "w:orient") === "landscape") r.landscape = true;
		if (r.w < 2880 || r.w > 31680) r.w = 12240;
		if (r.h < 2880 || r.h > 31680) r.h = 15840;
		if (r.left + r.right > r.w - 1440) { r.left = r.right = 1440; }
		return r;
	}
	function paperName(ps) {
		var w = Math.min(ps.w, ps.h), h = Math.max(ps.w, ps.h), near = function (a, b) { return Math.abs(a - b) < 60; };
		var n = near(w, 12240) && near(h, 15840) ? "Letter" : near(w, 11906) && near(h, 16838) ? "A4" : near(w, 12240) && near(h, 20160) ? "Legal" : near(w, 8391) && near(h, 11906) ? "A5" : "Custom";
		return n + (ps.w > ps.h ? " (landscape)" : "");
	}
	function count(re, s) { var m = String(s || "").match(re); return m ? m.length : 0; }
	function docStats(docXml, commentsXml) {
		return {
			insertions: count(/<w:ins\s/g, docXml), deletions: count(/<w:del\s/g, docXml),
			moves: count(/<w:moveTo\s/g, docXml), formatChanges: count(/<w:rPrChange\s|<w:pPrChange\s/g, docXml),
			comments: count(/<w:comment\s/g, commentsXml), tables: count(/<w:tbl>/g, docXml), pictures: count(/<w:drawing>|<w:pict>/g, docXml),
			sections: Math.max(1, count(/<w:sectPr[\s>]/g, docXml)), pageBreaks: count(/<w:br\s[^>]*w:type="page"/g, docXml),
			footnotes: count(/<w:footnoteReference\s/g, docXml), equations: count(/<m:oMath>/g, docXml), fields: count(/<w:fldSimple\s|<w:fldChar\s[^>]*w:fldCharType="begin"/g, docXml)
		};
	}

	/* ---------- counting + searching ---------- */
	var CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g;
	function countText(text) {
		text = String(text || "");
		var cjk = count(CJK, text), rest = text.replace(CJK, " ");
		var words = count(/[\p{L}\p{N}]+(?:['\u2019.\-][\p{L}\p{N}]+)*/gu, rest) + cjk;
		var paras = text.split(/\n/).filter(function (l) { return /\S/.test(l); }).length;
		var chars = Array.from(text.replace(/\n/g, "")).length;
		return { words: words, chars: chars, charsNoSpaces: Array.from(text.replace(/\s/g, "")).length, paragraphs: paras,
			sentences: count(/[^.!?\n]*[\p{L}\p{N}][^.!?\n]*(?:[.!?]+|$)/gmu, text),
			readMin: words / 230, speakMin: words / 130 };
	}
	function minutes(m) { if (m < 1) return m * 60 < 1 ? "0 s" : Math.max(1, Math.round(m * 60)) + " s"; if (m < 60) return Math.round(m) + " min"; return Math.floor(m / 60) + " h " + Math.round(m % 60) + " min"; }
	/* every match of q in hay -> [[start, end], ...]; opts.caseSensitive, opts.wholeWord */
	function findAll(hay, q, opts) {
		opts = opts || {}; hay = String(hay || ""); q = String(q || "");
		if (!q) return [];
		var h = opts.caseSensitive ? hay : hay.toLowerCase(), n = opts.caseSensitive ? q : q.toLowerCase(), out = [], i = 0;
		if (h.length !== hay.length) { h = hay; n = q; var flags = opts.caseSensitive ? "g" : "gi"; var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags), m; while ((m = re.exec(hay))) { if (!m[0].length) { re.lastIndex++; continue; } push(m.index); } return out; }
		while ((i = h.indexOf(n, i)) >= 0) { push(i); i += n.length; if (out.length > 5000) break; }
		return out;
		function push(at) {
			var end = at + q.length;
			if (opts.wholeWord && (/[\p{L}\p{N}_]/u.test(hay.charAt(at - 1)) || /[\p{L}\p{N}_]/u.test(hay.charAt(end)))) return;
			out.push([at, end]);
		}
	}

	/* ---------- DOM -> block model ----------
	   block: {t:"p", style:"Normal"|"Title"|"Heading1".."Heading6"|"Quote"|"Code", align, list:{type:"ul"|"ol", level, id, cont}, runs:[run]}
	          {t:"table", rows:[{head, cells:[{span, blocks:[block]}]}]}   {t:"hr"}
	   run:   {text, b, i, u, s, sup, sub, code, mark, href}  {br:true}  {img:{src, w, h, alt}} */
	var BLOCK = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, TABLE: 1, HR: 1, SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1, FIGURE: 1, FIGCAPTION: 1, ADDRESS: 1, DL: 1, DT: 1, DD: 1, MAIN: 1, ASIDE: 1, NAV: 1 };
	var SKIP = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, SVG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1 };
	function gattr(n, a) { return n.getAttribute ? n.getAttribute(a) : (n.attrs && n.attrs[a] != null ? n.attrs[a] : null); }
	function styleOf(n) { var s = gattr(n, "style") || "", o = {}; s.split(";").forEach(function (d) { var i = d.indexOf(":"); if (i > 0) o[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim().toLowerCase(); }); return o; }
	function hasClass(n, c) { return (" " + (gattr(n, "class") || "") + " ").indexOf(" " + c + " ") >= 0; }
	function alignOf(n) {
		var a = styleOf(n)["text-align"] || (gattr(n, "align") || "").toLowerCase();
		return a === "center" || a === "right" || a === "justify" ? a : a === "left" || a === "start" ? "left" : a === "end" ? "right" : null;
	}
	function safeHref(h) {
		h = String(h || "").trim();
		if (/^#[\w\-.:]+$/.test(h)) return h;
		if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
		return null;
	}
	function fromDom(root) {
		var blocks = [], cur = null, listSeq = 0;
		function open(ctx, explicit) {
			if (cur) return cur;
			cur = { t: "p", style: ctx.style || "Normal", runs: [] };
			if (ctx.align) cur.align = ctx.align;
			if (ctx.list) {
				cur.list = { type: ctx.list.type, level: ctx.list.level, id: ctx.list.id };
				if (ctx.li) { if (ctx.li.used) cur.list.cont = true; ctx.li.used = true; }
			}
			if (explicit) cur.explicit = true;
			return cur;
		}
		function flush() {
			if (!cur) return;
			var p = cur; cur = null;
			while (p.runs.length && p.runs[p.runs.length - 1].br) p.runs.pop();      // the <br> contentEditable leaves at the end of a line
			if (p.style !== "Code") {
				var first = p.runs.find(function (r) { return r.text != null; }), last = null;
				for (var i = p.runs.length - 1; i >= 0; i--) if (p.runs[i].text != null) { last = p.runs[i]; break; }
				if (first && p.runs.indexOf(first) === 0) first.text = first.text.replace(/^\s+/, "");
				if (last && p.runs.indexOf(last) === p.runs.length - 1) last.text = last.text.replace(/\s+$/, "");
			}
			p.runs = p.runs.filter(function (r) { return r.text == null || r.text !== ""; });
			if (!p.runs.length && !p.explicit) return;
			delete p.explicit;
			blocks.push(p);
		}
		function inline(n, f, ctx) {
			var r = {}, k; for (k in f) r[k] = f[k];
			var tag = n.nodeName.toUpperCase(), st = styleOf(n);
			if (tag === "B" || tag === "STRONG" || st["font-weight"] === "bold" || +st["font-weight"] >= 600) r.b = true;
			if (st["font-weight"] === "normal" || st["font-weight"] === "400") delete r.b;
			if (tag === "I" || tag === "EM" || tag === "CITE" || tag === "DFN" || st["font-style"] === "italic") r.i = true;
			if (tag === "U" || tag === "INS" || /underline/.test(st["text-decoration"] || st["text-decoration-line"] || "")) r.u = true;
			if (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(st["text-decoration"] || st["text-decoration-line"] || "")) r.s = true;
			if (tag === "SUP" || st["vertical-align"] === "super") r.sup = true;
			if (tag === "SUB" || st["vertical-align"] === "sub") r.sub = true;
			if (tag === "CODE" || tag === "KBD" || tag === "SAMP" || tag === "TT") r.code = true;
			if (tag === "MARK") r.mark = true;
			if (tag === "A") { var h = safeHref(gattr(n, "href")); if (h) r.href = h; else delete r.href; }
			return r;
		}
		function walk(n, f, ctx) {
			if (n.nodeType === 3) {
				var t = n.nodeValue != null ? n.nodeValue : n.textContent || "";
				if (ctx.style !== "Code") t = t.replace(/[\t\n\r\f ]+/g, " ");
				if (!cur && !/\S/.test(t) && ctx.style !== "Code") return;
				var p = open(ctx), prev = p.runs[p.runs.length - 1];
				if (ctx.style !== "Code" && prev && prev.text != null && /\s$/.test(prev.text)) t = t.replace(/^ /, "");
				if (ctx.style !== "Code" && !p.runs.length) t = t.replace(/^ /, "");
				if (!t) return;
				var run = { text: t }, k; for (k in f) run[k] = f[k];
				if (prev && prev.text != null && same(prev, run)) prev.text += t; else p.runs.push(run);
				return;
			}
			if (n.nodeType !== 1 && n.nodeType !== 11 && n.nodeType !== 9) return;
			var tag = (n.nodeName || "").toUpperCase();
			if (SKIP[tag]) return;
			if (tag === "BR") { open(ctx).runs.push({ br: true }); return; }
			if (tag === "IMG") {
				var src = gattr(n, "src") || ""; if (!src) return;
				var w = +(gattr(n, "width") || n.naturalWidth || 0), h = +(gattr(n, "height") || n.naturalHeight || 0);
				var st = styleOf(n); if (!w && /px$/.test(st.width || "")) w = parseFloat(st.width); if (!h && /px$/.test(st.height || "")) h = parseFloat(st.height);
				open(ctx).runs.push({ img: { src: src, w: w || 0, h: h || 0, alt: gattr(n, "alt") || "" } });
				return;
			}
			var kids = n.childNodes || [], i;
			if (n.nodeType === 11 || n.nodeType === 9 || n === root) { for (i = 0; i < kids.length; i++) walk(kids[i], f, ctx); return; }
			if (!BLOCK[tag]) { var nf = inline(n, f, ctx); for (i = 0; i < kids.length; i++) walk(kids[i], nf, ctx); return; }
			flush();
			var c = { style: ctx.style, align: alignOf(n) || ctx.align, list: ctx.list, li: ctx.li };
			if (/^H[1-6]$/.test(tag)) c.style = tag === "H1" && hasClass(n, "dx-title") ? "Title" : "Heading" + tag.charAt(1);
			else if (tag === "BLOCKQUOTE") c.style = "Quote";
			else if (tag === "PRE") c.style = "Code";
			else if (tag === "P" && ctx.style !== "Quote" && ctx.style !== "Code") c.style = hasClass(n, "dx-title") ? "Title" : "Normal";
			if (tag === "UL" || tag === "OL") {
				var level = ctx.list ? Math.min(8, ctx.list.level + (ctx.li ? 1 : 0)) : 0;
				c.list = { type: tag === "OL" ? "ol" : "ul", level: level, id: (ctx.list && ctx.list.type === (tag === "OL" ? "ol" : "ul") && tag === "UL") ? ctx.list.id : ++listSeq };
				if (tag === "OL" && gattr(n, "start")) c.list.start = Math.max(1, +gattr(n, "start") || 1);
				c.li = null;
				for (i = 0; i < kids.length; i++) { if ((kids[i].nodeName || "").toUpperCase() === "LI" || kids[i].nodeType === 1) walk(kids[i], f, c); }
				flush(); return;
			}
			if (tag === "LI") {
				c.list = ctx.list || { type: "ul", level: 0, id: ++listSeq };
				c.li = { used: false };
				open(c, true);
				for (i = 0; i < kids.length; i++) walk(kids[i], f, c);
				flush(); return;
			}
			if (tag === "TABLE") { blocks.push(table(n, f)); return; }
			if (tag === "HR") { blocks.push({ t: "hr" }); return; }
			if ((tag === "P" || /^H[1-6]$/.test(tag) || tag === "PRE" || tag === "DT" || tag === "DD" || tag === "FIGCAPTION" || tag === "DIV") && !hasBlockKid(n)) open(c, true);
			var ff = f;
			if (tag === "DT") { ff = {}; for (var k in f) ff[k] = f[k]; ff.b = true; }
			for (i = 0; i < kids.length; i++) walk(kids[i], ff, c);
			flush();
			if (c.list && cur === null && ctx.li) { /* keep the list item's continuation state */ }
		}
		function hasBlockKid(n) { var k = n.childNodes || []; for (var i = 0; i < k.length; i++) if (k[i].nodeType === 1 && BLOCK[(k[i].nodeName || "").toUpperCase()]) return true; return false; }
		function table(n, f) {
			var rows = [];
			(function collect(x) {
				var k = x.childNodes || [];
				for (var i = 0; i < k.length; i++) {
					var tg = (k[i].nodeName || "").toUpperCase();
					if (tg === "TR") {
						var row = { cells: [], head: (x.nodeName || "").toUpperCase() === "THEAD" }, cs = k[i].childNodes || [], allTh = true, any = false;
						for (var j = 0; j < cs.length; j++) {
							var ct = (cs[j].nodeName || "").toUpperCase();
							if (ct !== "TD" && ct !== "TH") continue;
							any = true; if (ct !== "TH") allTh = false;
							var sub = fromDom(cs[j]);
							if (ct === "TH") sub.forEach(function (b) { (b.runs || []).forEach(function (r) { if (r.text != null) r.b = true; }); });
							row.cells.push({ span: Math.max(1, Math.min(63, +(gattr(cs[j], "colspan") || 1) || 1)), blocks: sub, align: alignOf(cs[j]) });
						}
						if (any && allTh) row.head = true;
						if (row.cells.length) rows.push(row);
					} else if (tg === "THEAD" || tg === "TBODY" || tg === "TFOOT") collect(k[i]);
				}
			})(n);
			return { t: "table", rows: rows };
		}
		walk(root, {}, { style: "Normal" });
		flush();
		return blocks;
	}
	function same(a, b) { var ks = ["b", "i", "u", "s", "sup", "sub", "code", "mark", "href"]; for (var i = 0; i < ks.length; i++) if ((a[ks[i]] || null) !== (b[ks[i]] || null)) return false; return true; }

	/* ---------- block model -> .docx ---------- */
	var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
	var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
	function w3c(d) { return (d || new Date()).toISOString().replace(/\.\d+Z$/, "Z"); }

	function toDocxParts(model, meta) {
		meta = meta || {};
		var ps = meta.page || { w: 12240, h: 15840, top: 1440, right: 1440, bottom: 1440, left: 1440 };
		var textW = Math.max(1440, ps.w - ps.left - ps.right);          // twips
		var rels = [], media = [], nums = [], imgSeq = 0, numMap = {};
		function rel(type, target, ext) { var id = "rId" + (rels.length + 10); rels.push({ id: id, type: type, target: target, ext: ext }); return id; }
		function numFor(list) {
			var key = list.id + ":" + list.type;
			if (numMap[key]) return numMap[key];
			var id = nums.length + 1; nums.push({ id: id, type: list.type, start: list.start || 1 }); numMap[key] = id; return id;
		}
		function rPr(r) {
			var s = "";
			if (r.href) s += '<w:rStyle w:val="Hyperlink"/>';
			if (r.code) s += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
			if (r.b) s += "<w:b/><w:bCs/>";
			if (r.i) s += "<w:i/><w:iCs/>";
			if (r.s) s += "<w:strike/>";
			if (r.mark) s += '<w:highlight w:val="yellow"/>';
			if (r.u && !r.href) s += '<w:u w:val="single"/>';
			if (r.sup) s += '<w:vertAlign w:val="superscript"/>'; else if (r.sub) s += '<w:vertAlign w:val="subscript"/>';
			return s ? "<w:rPr>" + s + "</w:rPr>" : "";
		}
		function textRun(r) {
			var parts = String(r.text).split(/(\t|\n)/), body = "";
			parts.forEach(function (p) { if (p === "\t") body += "<w:tab/>"; else if (p === "\n") body += "<w:br/>"; else if (p) body += '<w:t xml:space="preserve">' + xmlEsc(p) + "</w:t>"; });
			return body ? "<w:r>" + rPr(r) + body + "</w:r>" : "";
		}
		function imgRun(r) {
			var im = r.img, d = im.data ? { mime: im.mime, data: im.data } : dataUri(im.src);
			if (!d || !IMG_EXT[d.mime] || !d.data.length) return "";
			imgSeq++;
			var name = "image" + imgSeq + "." + IMG_EXT[d.mime];
			media.push({ name: "word/media/" + name, data: d.data, mime: d.mime });
			var id = rel("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", "media/" + name);
			var wpx = im.w || 300, hpx = im.h || Math.round(wpx * 0.66), maxPx = textW / 15;     // 96 dpi: 1 px = 15 twips
			if (wpx > maxPx) { hpx = Math.round(hpx * maxPx / wpx); wpx = maxPx; }
			var cx = Math.max(1, Math.round(wpx * 9525)), cy = Math.max(1, Math.round(hpx * 9525)), alt = xmlEsc(im.alt || "");
			return "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"" + cx + "\" cy=\"" + cy + "\"/><wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/>" +
				"<wp:docPr id=\"" + imgSeq + "\" name=\"Picture " + imgSeq + "\" descr=\"" + alt + "\"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect=\"1\"/></wp:cNvGraphicFramePr>" +
				"<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic><pic:nvPicPr><pic:cNvPr id=\"" + imgSeq + "\" name=\"" + name + "\" descr=\"" + alt + "\"/><pic:cNvPicPr/></pic:nvPicPr>" +
				"<pic:blipFill><a:blip r:embed=\"" + id + "\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"" + cx + "\" cy=\"" + cy + "\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";
		}
		function runs(list) {
			var out = "", i = 0;
			while (i < list.length) {
				var r = list[i];
				if (r.href) {
					var href = r.href, grp = "";
					while (i < list.length && list[i].href === href) { grp += one(list[i]); i++; }
					if (href.charAt(0) === "#") out += '<w:hyperlink w:anchor="' + xmlEsc(href.slice(1)) + '" w:history="1">' + grp + "</w:hyperlink>";
					else out += '<w:hyperlink r:id="' + rel("http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", href, true) + '" w:history="1">' + grp + "</w:hyperlink>";
					continue;
				}
				out += one(r); i++;
			}
			return out;
		}
		function one(r) { return r.br ? "<w:r><w:br/></w:r>" : r.img ? imgRun(r) : r.text != null ? textRun(r) : ""; }
		function para(b, cellAlign) {
			var pp = "";
			var style = b.list ? "ListParagraph" : { Normal: "", Title: "Title", Quote: "Quote", Code: "CodeBlock" }[b.style];
			if (style === undefined) style = /^Heading[1-6]$/.test(b.style) ? b.style : "";
			if (style) pp += '<w:pStyle w:val="' + style + '"/>';
			if (b.list && !b.list.cont) pp += '<w:numPr><w:ilvl w:val="' + b.list.level + '"/><w:numId w:val="' + numFor(b.list) + '"/></w:numPr>';
			if (b.list && b.list.cont) pp += '<w:ind w:left="' + (720 * (b.list.level + 1)) + '"/>';
			var al = b.align || cellAlign;
			if (al && al !== "left") pp += '<w:jc w:val="' + (al === "justify" ? "both" : al) + '"/>';
			return "<w:p>" + (pp ? "<w:pPr>" + pp + "</w:pPr>" : "") + runs(b.runs || []) + "</w:p>";
		}
		function tbl(t, width) {
			var cols = 0;
			t.rows.forEach(function (r) { var n = 0; r.cells.forEach(function (c) { n += c.span || 1; }); cols = Math.max(cols, n); });
			if (!cols) return "";
			var cw = Math.floor(width / cols), x = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="' + (cw * cols) + '" w:type="dxa"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>';
			for (var i = 0; i < cols; i++) x += '<w:gridCol w:w="' + cw + '"/>';
			x += "</w:tblGrid>";
			t.rows.forEach(function (r) {
				x += "<w:tr>" + (r.head ? "<w:trPr><w:tblHeader/></w:trPr>" : "");
				var used = 0;
				r.cells.forEach(function (c) {
					var span = Math.min(c.span || 1, cols - used); if (span < 1) return; used += span;
					x += cell(c.blocks, cw * span, span, c.align);
				});
				while (used < cols) { x += cell([], cw, 1); used++; }
				x += "</w:tr>";
			});
			return x + "</w:tbl>";
		}
		function cell(bl, width, span, al) {
			var x = '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : "") + "</w:tcPr>";
			var body = blocksXml(bl, width - 216, al);
			if (!/<\/w:p>$/.test(body)) body += "<w:p/>";        // a cell must end with a paragraph
			return x + body + "</w:tc>";
		}
		function blocksXml(bl, width, al) {
			var s = "";
			(bl || []).forEach(function (b) {
				if (b.t === "table") s += tbl(b, width);
				else if (b.t === "hr") s += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
				else s += para(b, al);
			});
			return s;
		}
		var body = blocksXml(model, textW);
		var sect = '<w:sectPr><w:pgSz w:w="' + ps.w + '" w:h="' + ps.h + '"' + (ps.w > ps.h ? ' w:orient="landscape"' : "") + '/><w:pgMar w:top="' + ps.top + '" w:right="' + ps.right + '" w:bottom="' + ps.bottom + '" w:left="' + ps.left + '" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>';
		var doc = XMLH + "<w:document " + NS + "><w:body>" + body + sect + "</w:body></w:document>";

		var drels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
			'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
			'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
			rels.map(function (r) { return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + xmlEsc(r.target) + '"' + (r.ext ? ' TargetMode="External"' : "") + "/>"; }).join("") + "</Relationships>";
		var exts = {}; media.forEach(function (m) { exts[IMG_EXT[m.mime]] = m.mime === "image/jpg" ? "image/jpeg" : m.mime; });
		var ct = XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
			Object.keys(exts).map(function (e) { return '<Default Extension="' + e + '" ContentType="' + exts[e] + '"/>'; }).join("") +
			'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
			'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
			'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
			'<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
			'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
			'<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
		var rootRels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
			'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
			'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
		var now = w3c(meta.now), created = meta.created && /^\d{4}-\d\d-\d\dT/.test(meta.created) ? meta.created : now;
		var core = XMLH + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
			(meta.title ? "<dc:title>" + xmlEsc(meta.title) + "</dc:title>" : "") + (meta.subject ? "<dc:subject>" + xmlEsc(meta.subject) + "</dc:subject>" : "") +
			(meta.author ? "<dc:creator>" + xmlEsc(meta.author) + "</dc:creator>" : "") + (meta.keywords ? "<cp:keywords>" + xmlEsc(meta.keywords) + "</cp:keywords>" : "") +
			(meta.description ? "<dc:description>" + xmlEsc(meta.description) + "</dc:description>" : "") +
			"<cp:lastModifiedBy>" + xmlEsc(meta.modifiedBy || "MES Word Viewer") + "</cp:lastModifiedBy>" +
			'<dcterms:created xsi:type="dcterms:W3CDTF">' + created + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified></cp:coreProperties>";
		var app = XMLH + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MES Word Viewer (mes.fm/docx)</Application><DocSecurity>0</DocSecurity></Properties>';
		var settings = XMLH + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';

		var files = [
			{ name: "[Content_Types].xml", data: ct }, { name: "_rels/.rels", data: rootRels },
			{ name: "docProps/core.xml", data: core }, { name: "docProps/app.xml", data: app },
			{ name: "word/document.xml", data: doc }, { name: "word/_rels/document.xml.rels", data: drels },
			{ name: "word/styles.xml", data: stylesXml() }, { name: "word/numbering.xml", data: numberingXml(nums) }, { name: "word/settings.xml", data: settings }
		];
		files = files.map(function (f) { return { name: f.name, data: typeof f.data === "string" ? utf8(f.data) : f.data }; });
		return files.concat(media.map(function (m) { return { name: m.name, data: m.data }; }));
	}
	function stylesXml() {
		var h = function (n, sz, before) {
			return '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>' +
				'<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + before + '" w:after="80"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr>' +
				'<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/>' + (n >= 3 ? "<w:b/><w:bCs/>" : "") + (n >= 5 ? "<w:i/>" : "") + '<w:color w:val="1F3864"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr></w:style>';
		};
		return XMLH + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
			'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
			'<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
			'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
			'<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>' +
			'<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
			'<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>' +
			'<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:kern w:val="28"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>' +
			h(1, 40, 360) + h(2, 32, 160) + h(3, 28, 160) + h(4, 24, 80) + h(5, 22, 80) + h(6, 22, 40) +
			'<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:spacing w:before="160"/><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="404040"/></w:rPr></w:style>' +
			'<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>' +
			'<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
			'<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
			'<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>' +
			"</w:styles>";
	}
	function numberingXml(nums) {
		var BUL = ["\u2022", "o", "\u25AA"], ORD = [["decimal", "%L."], ["lowerLetter", "%L."], ["lowerRoman", "%L."]];
		function lvls(ordered) {
			var s = "";
			for (var l = 0; l < 9; l++) {
				var left = 720 * (l + 1);
				if (ordered) { var o = ORD[l % 3]; s += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="' + o[0] + '"/><w:lvlText w:val="' + o[1].replace("L", l + 1) + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + left + '" w:hanging="360"/></w:pPr></w:lvl>'; }
				else { var b = BUL[l % 3]; s += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + b + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + left + '" w:hanging="360"/></w:pPr>' + (b === "o" ? '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/></w:rPr>' : "") + "</w:lvl>"; }
			}
			return s;
		}
		var x = XMLH + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
			'<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + lvls(false) + "</w:abstractNum>" +
			'<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' + lvls(true) + "</w:abstractNum>";
		nums.forEach(function (n) {
			x += '<w:num w:numId="' + n.id + '"><w:abstractNumId w:val="' + (n.type === "ol" ? 1 : 0) + '"/>';
			if (n.type === "ol") for (var l = 0; l < 9; l++) x += '<w:lvlOverride w:ilvl="' + l + '"><w:startOverride w:val="' + (l === 0 ? n.start : 1) + '"/></w:lvlOverride>';
			x += "</w:num>";
		});
		return x + "</w:numbering>";
	}

	/* ---------- other formats ---------- */
	function plainRuns(rs) { return (rs || []).map(function (r) { return r.br ? "\n" : r.img ? (r.img.alt ? "[" + r.img.alt + "]" : "[picture]") : r.text || ""; }).join(""); }
	function toText(model) {
		var out = [], prevList = false;
		function walk(bl, indent) {
			bl.forEach(function (b) {
				if (b.t === "hr") { out.push(indent + "----------"); prevList = false; return; }
				if (b.t === "table") { b.rows.forEach(function (r) { out.push(indent + r.cells.map(function (c) { return c.blocks.map(function (x) { return x.runs ? plainRuns(x.runs).replace(/\s*\n\s*/g, " ") : ""; }).join(" "); }).join("\t")); }); out.push(""); prevList = false; return; }
				var t = plainRuns(b.runs), pre = indent;
				if (b.list) { pre += new Array(b.list.level + 1).join("    "); if (!b.list.cont) pre += b.list.type === "ol" ? (b.list.n || 1) + ". " : "\u2022 "; else pre += "  "; }
				if ((!b.list && prevList) || (b.list && b.list.level === 0 && prevList && prevList !== b.list.id + b.list.type)) out.push("");
				out.push(pre + t.replace(/\n/g, "\n" + pre.replace(/./g, " ")));
				if (!b.list) out.push("");
				prevList = b.list ? (b.list.level === 0 ? b.list.id + b.list.type : prevList) : false;
			});
		}
		walk(numberLists(model), "");
		return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
	}
	/* gives every ordered list item its number (b.list.n) so text / Markdown can print it */
	function numberLists(model) {
		var counters = {};
		(function walk(bl) {
			bl.forEach(function (b) {
				if (b.t === "table") { b.rows.forEach(function (r) { r.cells.forEach(function (c) { walk(c.blocks); }); }); return; }
				if (!b.list || b.list.cont || b.list.type !== "ol") return;
				var k = b.list.id + ":" + b.list.level;
				Object.keys(counters).forEach(function (kk) { var p = kk.split(":"); if (p[0] === String(b.list.id) && +p[1] > b.list.level) delete counters[kk]; });
				counters[k] = counters[k] ? counters[k] + 1 : (b.list.start || 1);
				b.list.n = counters[k];
			});
		})(model);
		return model;
	}
	function mdEsc(s) { return String(s).replace(/([\\`*_\[\]<>|])/g, "\\$1"); }
	function mdRuns(rs, imgN) {
		var s = "";
		(rs || []).forEach(function (r) {
			if (r.br) { s += "  \n"; return; }
			if (r.img) { var d = dataUri(r.img.src); s += "![" + mdEsc(r.img.alt || "") + "](" + (d ? "image-" + (++imgN.n) + "." + (IMG_EXT[d.mime] || "png") : r.img.src) + ")"; return; }
			var t = r.code ? "`" + r.text.replace(/`/g, "\u02CB") + "`" : mdEsc(r.text);
			var lead = /^\s*/.exec(t)[0], trail = /\s*$/.exec(t)[0]; t = t.trim();
			if (!t) { s += lead + trail; return; }
			if (r.b) t = "**" + t + "**";
			if (r.i) t = "*" + t + "*";
			if (r.s) t = "~~" + t + "~~";
			if (r.sup) t = "<sup>" + t + "</sup>"; else if (r.sub) t = "<sub>" + t + "</sub>";
			if (r.href) t = "[" + t + "](" + r.href.replace(/[()\s]/g, encodeURIComponent) + ")";
			s += lead + t + trail;
		});
		return s.replace(/\*\*\*\*/g, "");
	}
	function toMarkdown(model) {
		var out = [], imgN = { n: 0 }, prevList = false;
		numberLists(model).forEach(function (b) {
			if (b.t === "hr") { out.push("", "---", ""); prevList = false; return; }
			if (b.t === "table") {
				if (!b.rows.length) return;
				var cols = 0; b.rows.forEach(function (r) { var n = 0; r.cells.forEach(function (c) { n += c.span || 1; }); cols = Math.max(cols, n); });
				var line = function (r) { var cells = []; r.cells.forEach(function (c) { cells.push(c.blocks.map(function (x) { return x.runs ? mdRuns(x.runs, imgN).replace(/\s*\n\s*/g, " ") : ""; }).join("<br>")); for (var i = 1; i < (c.span || 1); i++) cells.push(""); }); while (cells.length < cols) cells.push(""); return "| " + cells.join(" | ") + " |"; };
				out.push("", line(b.rows[0]), "|" + new Array(cols + 1).join(" --- |"));
				b.rows.slice(1).forEach(function (r) { out.push(line(r)); });
				out.push(""); prevList = false; return;
			}
			var t = mdRuns(b.runs, imgN);
			if (b.list) {
				var ind = new Array(b.list.level + 1).join(b.list.type === "ol" ? "   " : "  ");
				if (!prevList || (b.list.level === 0 && prevList !== b.list.id + b.list.type)) out.push("");
				out.push(ind + (b.list.cont ? "  " : b.list.type === "ol" ? (b.list.n || 1) + ". " : "- ") + t.replace(/\n/g, "\n" + ind + "  "));
				if (b.list.level === 0) prevList = b.list.id + b.list.type; return;
			}
			if (prevList) out.push("");
			prevList = false;
			if (b.style === "Code") { out.push("```", plainRuns(b.runs), "```", ""); return; }
			var hm = /^Heading([1-6])$/.exec(b.style);
			if (hm) { out.push(new Array(+hm[1] + 1).join("#") + " " + t.replace(/\s*\n\s*/g, " "), ""); return; }
			if (b.style === "Title") { out.push("# " + t.replace(/\s*\n\s*/g, " "), ""); return; }
			if (!t.trim()) return;
			t = t.replace(/^(#{1,6}\s|[-+]\s|\d+[.)]\s)/, "\\$1");
			if (b.style === "Quote") { out.push("> " + t.replace(/\n/g, "\n> "), ""); return; }
			out.push(t, "");
		});
		return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
	}
	function htmlRuns(rs) {
		var s = "";
		(rs || []).forEach(function (r) {
			if (r.br) { s += "<br>"; return; }
			if (r.img) { var src = /^(data:image\/|https?:)/i.test(r.img.src) ? r.img.src : ""; if (src) s += '<img src="' + htmlEsc(src) + '" alt="' + htmlEsc(r.img.alt) + '"' + (r.img.w ? ' width="' + Math.round(r.img.w) + '"' : "") + ">"; return; }
			var t = htmlEsc(r.text);
			if (r.code) t = "<code>" + t + "</code>";
			if (r.b) t = "<strong>" + t + "</strong>";
			if (r.i) t = "<em>" + t + "</em>";
			if (r.u) t = "<u>" + t + "</u>";
			if (r.s) t = "<s>" + t + "</s>";
			if (r.mark) t = "<mark>" + t + "</mark>";
			if (r.sup) t = "<sup>" + t + "</sup>"; else if (r.sub) t = "<sub>" + t + "</sub>";
			if (r.href) t = '<a href="' + htmlEsc(r.href) + '">' + t + "</a>";
			s += t;
		});
		return s;
	}
	function blocksHtml(bl) {
		var s = "", stack = [];
		function closeTo(level) { while (stack.length > level) s += "</li></" + stack.pop().type + ">"; }
		bl.forEach(function (b) {
			if (!b.list) closeTo(0);
			if (b.t === "hr") { s += "<hr>\n"; return; }
			if (b.t === "table") {
				s += "<table>\n" + b.rows.map(function (r) { return "<tr>" + r.cells.map(function (c) { var tg = r.head ? "th" : "td"; return "<" + tg + (c.span > 1 ? ' colspan="' + c.span + '"' : "") + ">" + blocksHtml(c.blocks) + "</" + tg + ">"; }).join("") + "</tr>"; }).join("\n") + "\n</table>\n";
				return;
			}
			var al = b.align && b.align !== "left" ? ' style="text-align:' + b.align + '"' : "";
			var inner = htmlRuns(b.runs);
			if (b.list) {
				var lv = b.list.level;
				if (b.list.cont && stack.length) { s += "<p>" + inner + "</p>"; return; }
				while (stack.length > lv + 1) s += "</li></" + stack.pop().type + ">";
				if (stack.length === lv + 1) {
					var top = stack[lv];
					if (top.type === b.list.type && top.id === b.list.id) { s += "</li><li" + al + ">" + inner; return; }
					s += "</li></" + stack.pop().type + ">";
				}
				while (stack.length < lv + 1) { s += "<" + b.list.type + (b.list.type === "ol" && b.list.start > 1 && stack.length === lv ? ' start="' + b.list.start + '"' : "") + "><li" + (stack.length === lv ? al : "") + ">"; stack.push({ type: b.list.type, id: b.list.id }); }
				s += inner;
				return;
			}
			var hm = /^Heading([1-6])$/.exec(b.style);
			if (hm) s += "<h" + hm[1] + al + ">" + inner + "</h" + hm[1] + ">\n";
			else if (b.style === "Title") s += '<h1 class="title"' + al + ">" + inner + "</h1>\n";
			else if (b.style === "Quote") s += "<blockquote><p" + al + ">" + inner + "</p></blockquote>\n";
			else if (b.style === "Code") s += "<pre>" + inner + "</pre>\n";
			else s += "<p" + al + ">" + (inner || "<br>") + "</p>\n";
		});
		closeTo(0);
		return s;
	}
	function toHtml(model, title) {
		return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + htmlEsc(title || "Document") + "</title>\n" +
			"<style>body{font:16px/1.55 Calibri,Carlito,'Segoe UI',Arial,sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#1a1a1a}h1,h2,h3,h4{color:#1f3864;line-height:1.25}h1.title{font-size:2.4em;font-weight:400}" +
			"table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #999;padding:4px 8px;vertical-align:top}td p,th p{margin:0}img{max-width:100%;height:auto}blockquote{margin:1em 2em;color:#404040;font-style:italic}pre{background:#f2f2f2;padding:.6em;overflow:auto}</style>\n</head>\n<body>\n" +
			blocksHtml(model) + "</body>\n</html>\n";
	}
	function modelStats(model) {
		var s = { paragraphs: 0, headings: 0, lists: 0, tables: 0, images: 0, links: 0 };
		(function walk(bl) {
			bl.forEach(function (b) {
				if (b.t === "table") { s.tables++; b.rows.forEach(function (r) { r.cells.forEach(function (c) { walk(c.blocks); }); }); return; }
				if (b.t === "hr") return;
				s.paragraphs++; if (/^Heading|Title/.test(b.style)) s.headings++; if (b.list) s.lists++;
				(b.runs || []).forEach(function (r) { if (r.img) s.images++; if (r.href) s.links++; });
			});
		})(model);
		return s;
	}
	function baseName(n) { return String(n || "document").replace(/^.*[\\/]/, "").replace(/\.(docx|docm|dotx|dotm|doc)$/i, "") || "document"; }
	function fmtBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }

	var api = {
		xmlEsc: xmlEsc, xmlUnesc: xmlUnesc, dataUri: dataUri, b64decode: b64decode, sniff: sniff, SNIFF_MSG: SNIFF_MSG,
		parseProps: parseProps, parseComments: parseComments, headingStyles: headingStyles, styleClass: styleClass, pageSetup: pageSetup, paperName: paperName,
		docText: docText, docStats: docStats, countText: countText, minutes: minutes, findAll: findAll, safeHref: safeHref,
		fromDom: fromDom, toDocxParts: toDocxParts, toText: toText, toMarkdown: toMarkdown, toHtml: toHtml, modelStats: modelStats,
		baseName: baseName, fmtBytes: fmtBytes
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();

/* MES Word Viewer (mes.fm/docx): open .docx files in the browser (several as tabs), page layout view with docx-preview,
 * outline / find / info / comments / pictures panel, print / save as PDF, and an Edit mode (mammoth.js -> contentEditable)
 * that saves a new .docx written by MESDocx.toDocxParts (lib.js). Nothing is uploaded.
 * Libraries (loaded on first use): JSZip 3.10.1 + mammoth 1.13.0 (cdnjs), docx-preview 0.4.1 (jsDelivr). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("dx");
	if (!root || !window.MESDocx) return;
	var D = window.MESDocx, KEY = "mes-docx:v1";
	var JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
		DOCXP = "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js",
		MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js";
	var S = { side: window.innerWidth > 760, tab: "outline", comments: true, changes: true, dark: false, remember: true, zoom: 0 };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	if (window.innerWidth <= 760) S.side = false;
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var app = $("dx-app"), view = $("dx-view"), empty = $("dx-empty"), docs = [], cur = null, uid = 0;
	var scripts = {};
	function loadScript(u) {
		if (!scripts[u]) scripts[u] = new Promise(function (res, rej) {
			var s = document.createElement("script"); s.src = u; s.async = true; s.onload = res;
			s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a helper library. Check your connection and try again.")); };
			document.head.appendChild(s);
		});
		return scripts[u];
	}
	var libZip = function () { return loadScript(JSZIP); };
	var libView = function () { return libZip().then(function () { return loadScript(DOCXP); }); };
	var libMammoth = function () { return loadScript(MAMMOTH); };
	function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function note(html, err) { var n = $("dx-note"); n.hidden = !html; n.innerHTML = html || ""; n.classList.toggle("is-err", !!err); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
	var debounce = function (fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; };
	var DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

	/* ---------- recent files (IndexedDB, this device only) ---------- */
	var idb = null;
	function db() {
		if (idb) return idb;
		idb = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(new Error("no IndexedDB"));
			var r = indexedDB.open("mes-docx", 1);
			r.onupgradeneeded = function () { r.result.createObjectStore("files", { keyPath: "key" }); };
			r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
		});
		idb.catch(function () { idb = null; });
		return idb;
	}
	function store(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction("files", mode), st = tx.objectStore("files"), out = fn(st); tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; tx.onerror = function () { rej(tx.error); }; }); }); }
	function recentList() { return store("readonly", function (st) { return st.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return y.time - x.time; }); }).catch(function () { return []; }); }
	function recentPut(rec) {
		if (!S.remember) return Promise.resolve();
		return store("readwrite", function (st) { st.put(rec); }).then(function () {
			return recentList().then(function (all) {          // keep the 8 newest and at most ~60 MB
				var total = 0, drop = [];
				var seen = {};
				all.forEach(function (r, i) {
					var id = r.name + "|" + r.size;               // the same file opened again: keep only the newest copy
					if (seen[id] && !r.draft) { drop.push(r.key); return; } seen[id] = 1;
					total += r.bytes ? r.bytes.byteLength : 0; if (i >= 8 || total > 60e6) drop.push(r.key);
				});
				if (drop.length) return store("readwrite", function (st) { drop.forEach(function (k) { st.delete(k); }); });
			});
		}).catch(function () { /* storage full or blocked: not important */ });
	}
	function recentDel(key) { return store("readwrite", function (st) { if (key) st.delete(key); else st.clear(); }).catch(function () { }); }
	function recentDraft(d) {
		if (!S.remember || !d.key || !d.editEl) return;
		store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r) { r.draft = d.editEl.innerHTML; r.draftTime = Date.now(); st.put(r); } }; }).catch(function () { });
	}
	function showRecent() {
		$("dx-remember").checked = !!S.remember;
		recentList().then(function (all) {
			var box = $("dx-recent"); box.hidden = !all.length || !S.remember;
			$("dx-rlist").innerHTML = all.map(function (r) {
				return '<div class="dx-ritem"><button type="button" class="dx-ropen" data-k="' + esc(r.key) + '"><b>' + esc(r.name) + "</b><small>" + esc(D.fmtBytes(r.size || 0)) + " &middot; " + esc(new Date(r.time).toLocaleString()) + (r.draft ? " &middot; has unsaved edits" : "") + '</small></button><button type="button" class="dx-link" data-del="' + esc(r.key) + '" aria-label="Forget ' + esc(r.name) + '">Forget</button></div>';
			}).join("");
		});
	}
	$("dx-rlist").addEventListener("click", function (e) {
		var o = e.target.closest("[data-k]"), d = e.target.closest("[data-del]");
		if (d) { recentDel(d.getAttribute("data-del")).then(showRecent); return; }
		if (o) recentList().then(function (all) { var r = all.find(function (x) { return x.key === o.getAttribute("data-k"); }); if (r) openBytes(new Uint8Array(r.bytes), r.name, { key: r.key, draft: r.draft }); });
	});
	$("dx-rclear").onclick = function () { if (confirm("Forget all recent files on this device?")) recentDel(null).then(showRecent); };
	$("dx-remember").onchange = function () { S.remember = this.checked; save(); if (!S.remember) recentDel(null).then(showRecent); };

	/* ---------- opening files ---------- */
	var input = $("dx-input");
	function pick() { input.click(); }
	$("dx-open").onclick = pick; $("dx-e-open").onclick = function (e) { e.stopPropagation(); pick(); };
	$("dx-new").onclick = $("dx-e-new").onclick = function (e) { e.stopPropagation(); newDoc(); };
	$("dx-drop").addEventListener("click", function (e) { if (!e.target.closest("button")) pick(); });
	$("dx-drop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
	input.onchange = function () { addFiles([].slice.call(input.files)); input.value = ""; };
	var hasFiles = function (e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (hasFiles(e)) { e.preventDefault(); app.classList.add("is-over"); } }); });
	document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) app.classList.remove("is-over"); });
	document.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); app.classList.remove("is-over"); addFiles([].slice.call(e.dataTransfer.files || [])); });
	document.addEventListener("paste", function (e) {
		if (cur && cur.mode === "edit" && cur.editEl && cur.editEl.contains(document.activeElement)) return;      // the editor handles its own paste
		var fs = []; [].forEach.call((e.clipboardData && e.clipboardData.items) || [], function (it) { if (it.kind === "file") { var f = it.getAsFile(); if (f && /\.(docx|docm|dotx|dotm|doc)$/i.test(f.name || "") || (f && f.type === DOCX_MIME)) fs.push(f); } });
		if (fs.length) { e.preventDefault(); addFiles(fs); }
	});
	function addFiles(list) {
		var chain = Promise.resolve();
		list.forEach(function (f) { chain = chain.then(function () { return f.arrayBuffer().then(function (b) { return openBytes(new Uint8Array(b), f.name, { size: f.size, lastModified: f.lastModified }); }); }); });
		return chain;
	}
	function mainPath(zip) {
		var rel = zip.file("_rels/.rels");
		return (rel ? rel.async("string") : Promise.resolve("")).then(function (x) {
			var m = /<Relationship\b[^>]*Type="[^"]*\/officeDocument"[^>]*>/.exec(x || ""), t = m && /Target="([^"]+)"/.exec(m[0]);
			var p = t ? t[1].replace(/^\//, "") : "word/document.xml";
			return zip.file(p) ? p : zip.file("word/document.xml") ? "word/document.xml" : null;
		});
	}
	function openBytes(u8, name, opt) {
		opt = opt || {};
		var kind = D.sniff(u8, name);
		if (kind !== "zip") { note(esc(name) + ": " + esc(D.SNIFF_MSG[kind] || D.SNIFF_MSG.unknown) + (kind === "pdf" ? ' <a href="/pdf">Open the PDF Editor</a>.' : ""), true); return Promise.resolve(); }
		note("Opening " + esc(name) + "&hellip;");
		return libView().then(function () { return window.JSZip.loadAsync(u8); }).then(function (zip) {
			return mainPath(zip).then(function (mp) {
				if (!mp) throw new Error(D.SNIFF_MSG.zip);
				var dir = mp.replace(/[^/]*$/, ""), get = function (p) { var f = zip.file(p); return f ? f.async("string") : Promise.resolve(""); };
				return Promise.all([get(mp), get("docProps/core.xml"), get("docProps/app.xml"), get(dir + "styles.xml"), get(dir + "comments.xml")]).then(function (x) {
					var d = { id: ++uid, name: name || "document.docx", size: u8.length, bytes: u8, zip: zip, dir: dir, mode: "view", src: "orig",
						props: D.parseProps(x[1], x[2]), page: D.pageSetup(x[0]), heads: D.headingStyles(x[3]), comments: D.parseComments(x[4]),
						stats: D.docStats(x[0], x[4]), text: D.docText(x[0]), key: opt.key || ("f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), zoom: S.zoom || 0 };
					d.media = Object.keys(zip.files).filter(function (p) { return p.indexOf(dir + "media/") === 0 && !zip.files[p].dir; });
					docs.push(d);
					if (!opt.key) recentPut({ key: d.key, name: d.name, size: d.size, time: Date.now(), bytes: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });
					else store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r) { r.time = Date.now(); st.put(r); } }; }).catch(function () { });
					showDoc(d);
					note("");
					if (opt.draft) {
						note('This file has edits you did not download yet. <button type="button" class="dx-link" id="dx-draftgo">Continue editing them</button> <button type="button" class="dx-link" id="dx-draftno">Discard them</button>');
						$("dx-draftgo").onclick = function () { note(""); setMode(d, "edit", opt.draft).then(function () { d.dirty = d.everEdited = true; d.src = "edited"; renderTabs(); status(); }); };
						$("dx-draftno").onclick = function () { note(""); store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r) { delete r.draft; st.put(r); } }; }).catch(function () { }); };
					}
					return d;
				});
			});
		}).catch(function (err) { note(esc(name) + ": " + esc(err && err.message ? (/zip|central|end of data/i.test(err.message) ? "this file is damaged or is not a real .docx." : err.message) : "could not be opened."), true); });
	}
	function newDoc() {
		var d = { id: ++uid, name: "Untitled.docx", size: 0, bytes: null, mode: "edit", src: "edited", props: {}, page: D.pageSetup(""), heads: {}, comments: [], stats: null, text: "", media: [], key: null, zoom: S.zoom || 0, blank: true };
		docs.push(d);
		showDoc(d, true);
		setMode(d, "edit", "<p><br></p>");
	}

	/* ---------- tabs ---------- */
	function renderTabs() {
		$("dx-tabs").innerHTML = docs.map(function (d) {
			return '<div class="dx-tab' + (d === cur ? " is-on" : "") + '" role="tab" aria-selected="' + (d === cur) + '" data-id="' + d.id + '" title="' + esc(d.name) + '"><span class="dx-tn">' + esc(d.name) + "</span>" + (d.dirty ? '<span class="dx-tdot" title="Edited">&bull;</span>' : "") + '<button type="button" class="dx-tx" data-x="' + d.id + '" aria-label="Close ' + esc(d.name) + '">&times;</button></div>';
		}).join("");
	}
	$("dx-tabs").addEventListener("click", function (e) {
		var x = e.target.closest("[data-x]"), t = e.target.closest("[data-id]");
		if (x) { closeDoc(docs.find(function (d) { return d.id === +x.getAttribute("data-x"); })); return; }
		if (t) showDoc(docs.find(function (d) { return d.id === +t.getAttribute("data-id"); }));
	});
	function closeDoc(d) {
		if (!d) return;
		if (d.dirty && !confirm("Close " + d.name + "? Your edits have not been downloaded.")) return;
		if (d.host) d.host.remove(); if (d.edwrap) d.edwrap.remove();
		(d.fontStyles || []).forEach(function (s) { s.remove(); });
		docs.splice(docs.indexOf(d), 1);
		if (cur === d) { cur = null; if (docs.length) showDoc(docs[docs.length - 1]); else { empty.hidden = false; refreshUi(); showRecent(); } }
		renderTabs();
	}
	function showDoc(d, noRender) {
		if (cur && cur !== d) { cur.scroll = view.scrollTop; if (cur.host) cur.host.hidden = true; if (cur.edwrap) cur.edwrap.hidden = true; }
		cur = d; empty.hidden = true;
		renderTabs();
		clearFind();
		if (d.mode === "edit" && d.edwrap) { d.edwrap.hidden = false; modeNote(d); refreshUi(); applyZoom(); view.scrollTop = d.scroll || 0; return; }
		if (noRender) { refreshUi(); return; }
		if (d.host && d.rendered === d.src) { d.host.hidden = false; modeNote(d); refreshUi(); applyZoom(); view.scrollTop = d.scroll || 0; return; }
		renderView(d);
	}

	/* ---------- page layout view (docx-preview inside a shadow root) ---------- */
	var SHADOW_CSS = ":host{display:block;color:#000;contain:content}" +
		".sty{display:none}" +
		"[data-dxw]{background:transparent!important;padding:16px!important;padding-bottom:4px!important}" +
		"[data-dxw]>section{box-shadow:0 1px 4px rgba(0,0,0,.35)!important;margin-bottom:16px!important}" +
		":host(.is-dark) [data-dxw]>section{filter:invert(1) hue-rotate(180deg)}" +
		":host(.is-dark) [data-dxw]>section img,:host(.is-dark) [data-dxw]>section svg,:host(.is-dark) [data-dxw]>section canvas{filter:invert(1) hue-rotate(180deg)}" +
		"::highlight(dx-hit){background-color:#fde047;color:#000}::highlight(dx-cur){background-color:#f97316;color:#fff}" +
		"a[href]{cursor:pointer}";
	function renderView(d) {
		var bytes = d.src === "edited" ? d.editedBytes : d.bytes;
		if (!bytes) { refreshUi(); return Promise.resolve(); }
		if (!d.host) {
			d.host = document.createElement("div"); d.host.className = "dx-host"; view.appendChild(d.host);
			d.shadow = d.host.attachShadow({ mode: "open" });
		}
		d.host.hidden = false; d.host.classList.toggle("is-dark", !!S.dark);
		d.shadow.innerHTML = "<style>" + SHADOW_CSS + '</style><div class="sty"></div><div class="body"></div>';
		var sty = d.shadow.querySelector(".sty"), body = d.shadow.querySelector(".body"), cls = "d" + d.id;
		note("Laying out the pages&hellip;");
		var opts = { className: cls, inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, experimental: true, renderAltChunks: false,
			renderComments: !!S.comments && !!window.Highlight, renderChanges: !!S.changes, useBase64URL: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true };
		return libView().then(function () {
			return window.docx.renderAsync(bytes, body, sty, opts).catch(function (err) {
				if (!opts.renderComments && !opts.renderChanges) throw err;     // the experimental comments / changes code failed: try once without it
				body.innerHTML = ""; sty.innerHTML = ""; opts.renderComments = opts.renderChanges = false;
				return window.docx.renderAsync(bytes, body, sty, opts);
			});
		}).then(function () {
			modeNote(d);
			var w = body.querySelector("." + cls + "-wrapper"); if (w) w.setAttribute("data-dxw", "");
			// list bullets from the Symbol / Wingdings fonts are private-use characters most computers can't draw: use the Unicode look-alikes
			var PUA = { "\uF0B7": "\u2022", "\uF0A7": "\u25AA", "\uF0D8": "\u27A2", "\uF0FC": "\u2714", "\uF076": "\u2756", "\uF06E": "\u25A0", "\uF071": "\u2751", "\uF0A8": "\u25A1", "\uF0E0": "\u2794", "\uF0D2": "\u00AE", "\uF0E8": "\u2794", "\uF06C": "\u25CF", "\uF0B2": "\u2606" };
			[].forEach.call(sty.querySelectorAll("style"), function (s) { if (/[\uF000-\uF0FF]/.test(s.textContent)) s.textContent = s.textContent.replace(/[\uF000-\uF0FF]/g, function (c) { return PUA[c] || "\u2022"; }); });
			// fonts declared inside the shadow root are ignored by browsers: copy @font-face rules to the page
			(d.fontStyles || []).forEach(function (s) { s.remove(); }); d.fontStyles = [];
			[].forEach.call(sty.querySelectorAll("style"), function (s) { if (/@font-face/.test(s.textContent)) { var c = document.createElement("style"); c.textContent = s.textContent; document.head.appendChild(c); d.fontStyles.push(c); } });
			// links from the file: only http(s) / mailto / tel / in-document anchors, opened in a new tab
			[].forEach.call(body.querySelectorAll("a"), function (a) {
				var h = a.getAttribute("href") || "", safe = D.safeHref(h);
				if (!safe) { a.removeAttribute("href"); return; }
				if (safe.charAt(0) !== "#") { a.target = "_blank"; a.rel = "noopener noreferrer"; }
			});
			body.addEventListener("click", function (e) {
				var a = e.target.closest("a[href^='#']"); if (!a) return;
				var t = body.querySelector("[id='" + CSS.escape(a.getAttribute("href").slice(1)) + "'], a[name='" + CSS.escape(a.getAttribute("href").slice(1)) + "']");
				e.preventDefault(); if (t) scrollToEl(t);
			});
			d.rendered = d.src;
			d.pages = body.querySelectorAll("section." + cls).length;
			refreshUi(); applyZoom();
		}).catch(function (err) { note("Could not lay out " + esc(d.name) + ": " + esc(err && err.message || err) + ". You can still try Edit, or download it as text.", true); refreshUi(); });
	}
	function modeNote(d) {
		if (d !== cur) return;
		if (d.mode === "edit") { note(d.blank ? "" : "<b>Edit mode:</b> a simplified copy of the document. Words, headings, bold / italic / underline, lists, links, tables and pictures are kept; page design (fonts, colours, spacing, page breaks, columns, text boxes, headers, footers, comments, tracked changes) is simplified. Your original file is not changed. <a href=\"#dx-lossy\" id=\"dx-why\">Details</a>"); var why = $("dx-why"); if (why) why.onclick = function (e) { e.preventDefault(); var t = $("dx-lossy"); if (t) t.scrollIntoView({ behavior: "smooth" }); }; return; }
		note(d.src === "edited" ? 'You are looking at your <b>edited</b> version, laid out the way it will be saved. <button type="button" class="dx-link" id="dx-showorig">Show the original</button>' : (d.everEdited ? 'You are looking at the <b>original</b>. <button type="button" class="dx-link" id="dx-showed">Show my edited version</button>' : ""));
		var so = $("dx-showorig"), se = $("dx-showed");
		if (so) so.onclick = function () { d.src = "orig"; renderView(d); };
		if (se) se.onclick = function () { buildEdited(d).then(function () { d.src = "edited"; renderView(d); }); };
	}
	function activeRoot() { if (!cur) return null; if (cur.mode === "edit") return cur.editEl; return cur.shadow ? cur.shadow.querySelector(".body") : null; }

	/* ---------- zoom ---------- */
	function pagePx(d) { return Math.round(d.page.w / 15); }
	function fitZoom(d) { var w = view.clientWidth - 34; return Math.max(0.25, Math.min(2, w / pagePx(d))); }
	function zoomOf(d) { return d.zoom ? d.zoom : fitZoom(d); }
	function applyZoom() {
		if (!cur) return;
		var z = zoomOf(cur), r = activeRoot();
		$("dx-zoom").textContent = Math.round(z * 100) + "%";
		$("dx-fit").setAttribute("aria-pressed", String(!cur.zoom));
		if (cur.mode === "edit" && cur.editEl) cur.editEl.style.zoom = z;
		else if (r) { var w = r.querySelector("[data-dxw]"); if (w) w.style.zoom = z; }
	}
	function setZoom(z) { if (!cur) return; cur.zoom = z ? Math.max(0.25, Math.min(4, Math.round(z * 100) / 100)) : 0; S.zoom = cur.zoom; save(); applyZoom(); }
	var STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
	function stepZoom(dir) { if (!cur) return; var z = zoomOf(cur), n = dir > 0 ? STEPS.find(function (s) { return s > z + 0.001; }) : STEPS.slice().reverse().find(function (s) { return s < z - 0.001; }); setZoom(n || z); }
	$("dx-zin").onclick = function () { stepZoom(1); }; $("dx-zout").onclick = function () { stepZoom(-1); };
	$("dx-zoom").onclick = $("dx-fit").onclick = function () { setZoom(0); };
	if (window.ResizeObserver) new ResizeObserver(debounce(function () { if (cur && !cur.zoom) applyZoom(); }, 80)).observe(view);
	view.addEventListener("wheel", function (e) { if ((e.ctrlKey || e.metaKey) && cur) { e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });

	/* ---------- panel ---------- */
	function setSide(on) { S.side = on; save(); app.classList.toggle("no-side", !on); $("dx-side").setAttribute("aria-pressed", String(on)); if (cur && !cur.zoom) setTimeout(applyZoom, 30); }
	$("dx-side").onclick = function () { setSide(!S.side); };
	function setTab(t) {
		S.tab = t; save();
		[].forEach.call(root.querySelectorAll(".dx-stab"), function (b) { var on = b.getAttribute("data-tab") === t; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", String(on)); });
		[].forEach.call(root.querySelectorAll(".dx-spane"), function (p) { p.hidden = p.getAttribute("data-pane") !== t; });
		if (t === "find") setTimeout(function () { $("dx-q").focus(); $("dx-q").select(); }, 20);
		fillPane();
	}
	[].forEach.call(root.querySelectorAll(".dx-stab"), function (b) { b.onclick = function () { setTab(b.getAttribute("data-tab")); }; });
	function fillPane() {
		if (S.tab === "outline") fillOutline();
		else if (S.tab === "info") fillInfo();
		else if (S.tab === "notes") fillNotes();
		else if (S.tab === "pics") fillPics();
		else if (S.tab === "find") { $("dx-repl").hidden = !(cur && cur.mode === "edit"); $("dx-qhint").hidden = !(cur && cur.mode !== "edit"); }
	}
	function headings() {
		var r = activeRoot(), out = []; if (!r || !cur) return out;
		if (cur.mode === "edit") { [].forEach.call(r.querySelectorAll("h1,h2,h3,h4,h5,h6"), function (h) { out.push({ el: h, lv: h.classList.contains("dx-title") ? 0 : +h.tagName.charAt(1), t: h.textContent }); }); return out; }
		var heads = cur.src === "edited" ? { Title: 0, Heading1: 1, Heading2: 2, Heading3: 3, Heading4: 4, Heading5: 5, Heading6: 6 } : cur.heads, map = {};
		Object.keys(heads).forEach(function (id) { map[D.styleClass("d" + cur.id, id)] = heads[id]; });
		[].forEach.call(r.querySelectorAll("section > article p, section > article h1, section > article h2, section > article h3, section > article h4, section > article h5, section > article h6"), function (p) {
			for (var i = 0; i < p.classList.length; i++) { var lv = map[p.classList[i]]; if (lv != null) { if (/\S/.test(p.textContent)) out.push({ el: p, lv: lv, t: p.textContent }); return; } }
		});
		return out;
	}
	function fillOutline() {
		var hs = headings(), box = $("dx-outline");
		if (!cur) { box.innerHTML = '<p class="dx-hint">Open a document to see its headings here.</p>'; return; }
		if (!hs.length) { box.innerHTML = '<p class="dx-hint">This document has no headings. Headings made with Word\'s Heading styles (Heading 1, Heading 2&hellip;) are listed here so you can jump to them.</p>'; return; }
		var minLv = Math.min.apply(null, hs.map(function (h) { return h.lv; }));
		box.innerHTML = hs.map(function (h, i) { var lv = h.lv - minLv; return '<a href="#" data-i="' + i + '" class="l' + Math.min(lv, 1) + '" style="padding-left:' + (6 + Math.min(lv, 6) * 14) + 'px">' + esc(h.t.trim().slice(0, 140)) + "</a>"; }).join("");
		box.onclick = function (e) { var a = e.target.closest("[data-i]"); if (!a) return; e.preventDefault(); var h = headings()[+a.getAttribute("data-i")]; if (h) { scrollToEl(h.el); if (window.innerWidth <= 760) setSide(false); } };
	}
	function scrollToEl(el) { var vr = view.getBoundingClientRect(), er = el.getBoundingClientRect(); view.scrollTo({ top: view.scrollTop + er.top - vr.top - 24, behavior: "smooth" }); }
	function docTextNow() {
		if (!cur) return "";
		if (cur.mode === "edit" && cur.editEl) { if (cur.edText == null) cur.edText = cur.editEl.innerText || ""; return cur.edText; }
		return cur.src === "edited" && cur.editedText != null ? cur.editedText : cur.text;
	}
	function kv(rows) { return '<table class="dx-kv">' + rows.filter(function (r) { return r[1] !== "" && r[1] != null; }).map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</table>"; }
	function dt(s) { var d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleString() : ""; }
	function fillInfo() {
		var box = $("dx-info");
		if (!cur) { box.innerHTML = '<p class="dx-hint">Open a document to see its word count and properties.</p>'; return; }
		var c = D.countText(docTextNow()), p = cur.props, st = cur.stats, ps = cur.page, n = function (x) { return x.toLocaleString(); };
		var h = '<div class="dx-h">Counts</div>' + kv([["Words", n(c.words)], ["Characters", n(c.chars)], ["Characters (no spaces)", n(c.charsNoSpaces)], ["Paragraphs", n(c.paragraphs)], ["Sentences", n(c.sentences)],
			["Pages", cur.mode === "view" && cur.pages ? cur.pages + " as laid out here" + (p.pages ? " (Word saved " + p.pages + ")" : "") : (p.pages ? p.pages + " (as Word saved it)" : "")],
			["Reading time", D.minutes(c.readMin)], ["Speaking time", D.minutes(c.speakMin)]]);
		h += '<div class="dx-h">File</div>' + kv([["Name", cur.name], ["Size", cur.size ? D.fmtBytes(cur.size) : "not saved yet"], ["Page", D.paperName(ps) + ", " + (ps.w / 1440 * 2.54).toFixed(1) + " \u00D7 " + (ps.h / 1440 * 2.54).toFixed(1) + " cm"],
			["Margins", [ps.top, ps.right, ps.bottom, ps.left].map(function (t) { return (t / 1440 * 2.54).toFixed(1); }).join(" / ") + " cm (top / right / bottom / left)"]]);
		if (Object.keys(p).length) h += '<div class="dx-h">Properties</div>' + kv([["Title", p.title], ["Subject", p.subject], ["Author", p.author], ["Last saved by", p.lastModifiedBy], ["Company", p.company], ["Manager", p.manager], ["Keywords", p.keywords], ["Category", p.category], ["Comments", p.description],
			["Created", dt(p.created)], ["Last saved", dt(p.modified)], ["Last printed", dt(p.lastPrinted)], ["Revision", p.revision], ["Editing time", p.totalTime ? p.totalTime + " min" : ""], ["Made with", [p.application, p.appVersion].filter(Boolean).join(" ")], ["Template", p.template]]);
		if (st) h += '<div class="dx-h">Inside</div>' + kv([["Tables", st.tables], ["Pictures", cur.media.length || st.pictures], ["Comments", st.comments], ["Tracked insertions", st.insertions], ["Tracked deletions", st.deletions], ["Formatting changes", st.formatChanges], ["Footnotes", st.footnotes], ["Equations", st.equations], ["Sections", st.sections], ["Manual page breaks", st.pageBreaks]].map(function (r) { return [r[0], r[1] ? String(r[1]) : ""]; }));
		if (cur.mode === "edit") h += '<p class="dx-hint">Counts follow your edits. Properties and the &ldquo;Inside&rdquo; list describe the file you opened.</p>';
		box.innerHTML = h;
	}
	function fillNotes() {
		var box = $("dx-notes");
		$("dx-ocom").checked = !!S.comments; $("dx-ochg").checked = !!S.changes;
		if (!cur) { box.innerHTML = ""; return; }
		var st = cur.stats, h = "";
		if (st && (st.insertions || st.deletions)) h += '<p class="dx-hint">' + st.insertions + " tracked insertion" + (st.insertions === 1 ? "" : "s") + " and " + st.deletions + " deletion" + (st.deletions === 1 ? "" : "s") + (S.changes ? " are shown in the pages (deleted text struck through)." : " are hidden: the pages show the text with every change accepted.") + "</p>";
		if (!cur.comments.length) h += '<p class="dx-hint">No comments in this document.</p>';
		else h += cur.comments.map(function (c) { return '<div class="dx-com"><div class="dx-com-a">' + esc(c.author || "Unknown") + '</div><div class="dx-com-d">' + esc(dt(c.date)) + '</div><div class="dx-com-t">' + esc(c.text) + "</div></div>"; }).join("");
		if (cur.mode === "edit") h += '<p class="dx-hint">Comments and tracked changes are not kept when you edit.</p>';
		box.innerHTML = h;
	}
	$("dx-ocom").onchange = function () { S.comments = this.checked; save(); rerenderAll(); };
	$("dx-ochg").onchange = function () { S.changes = this.checked; save(); rerenderAll(); };
	function rerenderAll() { docs.forEach(function (d) { d.rendered = null; }); if (cur && cur.mode === "view") renderView(cur); fillNotes(); }
	var picUrls = [];
	function fillPics() {
		var box = $("dx-pics");
		picUrls.forEach(URL.revokeObjectURL); picUrls = [];
		if (!cur || !cur.zip || !cur.media.length) { box.innerHTML = '<p class="dx-hint">' + (cur ? "No pictures in this document." : "Open a document to list its pictures.") + "</p>"; return; }
		box.innerHTML = '<p><button type="button" class="dx-btn" id="dx-picall">Download all (' + cur.media.length + ') as ZIP</button></p><div class="dx-pics" id="dx-picgrid"></div>';
		var grid = $("dx-picgrid"), d = cur;
		d.media.forEach(function (p, i) {
			var nm = p.replace(/^.*\//, ""), b = document.createElement("button"); b.type = "button"; b.className = "dx-pic"; b.title = "Download " + nm;
			b.innerHTML = /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(nm) ? '<img alt="" loading="lazy">' : '<div class="dx-noimg">' + esc(nm.replace(/^.*\./, "").toUpperCase()) + "</div>";
			b.appendChild(document.createTextNode(nm));
			grid.appendChild(b);
			d.zip.file(p).async("uint8array").then(function (u) {
				var type = /\.svg$/i.test(nm) ? "image/svg+xml" : /\.png$/i.test(nm) ? "image/png" : /\.gif$/i.test(nm) ? "image/gif" : /\.bmp$/i.test(nm) ? "image/bmp" : /\.webp$/i.test(nm) ? "image/webp" : /\.jpe?g$/i.test(nm) ? "image/jpeg" : "application/octet-stream";
				var blob = new Blob([u], { type: type }), url = URL.createObjectURL(blob); picUrls.push(url);
				var im = b.querySelector("img"); if (im && type !== "image/svg+xml") im.src = url; else if (im) im.replaceWith(Object.assign(document.createElement("div"), { className: "dx-noimg", textContent: "SVG" }));
				b.onclick = function () { download(blob, nm); };
			});
		});
		$("dx-picall").onclick = function () {
			var z = new window.JSZip(), base = D.baseName(d.name);
			Promise.all(d.media.map(function (p) { return d.zip.file(p).async("uint8array").then(function (u) { z.file(p.replace(/^.*\//, ""), u); }); }))
				.then(function () { return z.generateAsync({ type: "blob" }); }).then(function (b) { download(b, base + " pictures.zip"); });
		};
	}

	/* ---------- find ---------- */
	var hits = [], hitAt = -1;
	function textIndex(rootEl) {
		var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode; return !p || /^(STYLE|SCRIPT)$/.test(p.nodeName) || (p.closest && p.closest("[class$='-comment-popover']")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
		var nodes = [], s = "", n;
		while ((n = walker.nextNode())) { nodes.push({ n: n, at: s.length }); s += n.nodeValue; }
		return { s: s, nodes: nodes };
	}
	function rangeAt(ix, a, b) {
		var r = document.createRange(), i = 0;
		function pos(o) { while (i < ix.nodes.length - 1 && ix.nodes[i + 1].at <= o) i++; return ix.nodes[i]; }
		var na = pos(a); r.setStart(na.n, a - na.at);
		var nb = pos(b); if (b - nb.at === 0 && i > 0 && nb.at === b) { nb = ix.nodes[i - 1]; r.setEnd(nb.n, nb.n.nodeValue.length); } else r.setEnd(nb.n, Math.min(nb.n.nodeValue.length, b - nb.at));
		return r;
	}
	function clearFind() { hits = []; hitAt = -1; if (window.CSS && CSS.highlights) { CSS.highlights.delete("dx-hit"); CSS.highlights.delete("dx-cur"); } $("dx-qn").textContent = ""; $("dx-qlist").innerHTML = ""; }
	function runFind(keep) {
		var q = $("dx-q").value, r = activeRoot();
		var was = hitAt; clearFind();
		if (!q || !r) return;
		var ix = textIndex(r), found = D.findAll(ix.s, q, { caseSensitive: $("dx-qcase").checked, wholeWord: $("dx-qword").checked });
		hits = found.slice(0, 2000).map(function (m) { return { r: rangeAt(ix, m[0], m[1]), a: m[0], b: m[1] }; });
		if (window.Highlight && CSS.highlights) { var hl = new Highlight(); hits.forEach(function (h) { hl.add(h.r); }); CSS.highlights.set("dx-hit", hl); }
		$("dx-qlist").innerHTML = hits.slice(0, 200).map(function (h, i) { var a = Math.max(0, h.a - 30), pre = ix.s.slice(a, h.a), post = ix.s.slice(h.b, h.b + 40); return '<button type="button" data-i="' + i + '">' + (a > 0 ? "&hellip;" : "") + esc(pre) + "<mark>" + esc(ix.s.slice(h.a, h.b)) + "</mark>" + esc(post) + "</button>"; }).join("");
		if (!hits.length) { $("dx-qn").textContent = "No matches"; return; }
		go(keep && was >= 0 ? Math.min(was, hits.length - 1) : 0);
	}
	function go(i) {
		if (!hits.length) return;
		hitAt = (i + hits.length) % hits.length;
		var h = hits[hitAt];
		if (window.Highlight && CSS.highlights) CSS.highlights.set("dx-cur", new Highlight(h.r));
		else { var sel = getSelection(); sel.removeAllRanges(); sel.addRange(h.r); }
		$("dx-qn").textContent = (hitAt + 1) + " of " + hits.length + (hits.length >= 2000 ? "+" : "");
		[].forEach.call($("dx-qlist").children, function (b, k) { b.classList.toggle("is-on", k === hitAt); });
		var vr = view.getBoundingClientRect(), rr = h.r.getBoundingClientRect();
		if (rr.top < vr.top + 20 || rr.bottom > vr.bottom - 20) view.scrollTo({ top: view.scrollTop + rr.top - vr.top - vr.height / 3 });
	}
	$("dx-q").addEventListener("input", debounce(function () { runFind(false); }, 180));
	$("dx-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (!hits.length) runFind(false); else go(hitAt + (e.shiftKey ? -1 : 1)); } if (e.key === "Escape") { this.value = ""; clearFind(); } });
	$("dx-qcase").onchange = $("dx-qword").onchange = function () { runFind(false); };
	$("dx-qnext").onclick = function () { if (!hits.length) runFind(false); else go(hitAt + 1); };
	$("dx-qprev").onclick = function () { if (!hits.length) runFind(false); else go(hitAt - 1); };
	$("dx-qlist").onclick = function (e) { var b = e.target.closest("[data-i]"); if (b) go(+b.getAttribute("data-i")); };
	function replaceHit(h, text) {
		var sel = getSelection(); sel.removeAllRanges(); sel.addRange(h.r);
		cur.editEl.focus({ preventScroll: true });
		sel.removeAllRanges(); sel.addRange(h.r);
		if (!document.execCommand("insertText", false, text)) { h.r.deleteContents(); h.r.insertNode(document.createTextNode(text)); }
	}
	$("dx-r1").onclick = function () { if (!cur || cur.mode !== "edit") return; if (!hits.length) runFind(false); if (!hits.length) return; replaceHit(hits[hitAt], $("dx-r").value); markDirty(); runFind(true); };
	$("dx-rall").onclick = function () {
		if (!cur || cur.mode !== "edit") return; runFind(false); var n = hits.length; if (!n) return;
		for (var i = hits.length - 1; i >= 0; i--) replaceHit(hits[i], $("dx-r").value);
		markDirty(); clearFind(); $("dx-qn").textContent = n + " replaced";
	};

	/* ---------- edit mode ---------- */
	var ALLOW = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, LI: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, SUP: 1, SUB: 1, A: 1, BR: 1, IMG: 1, TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1, BLOCKQUOTE: 1, PRE: 1, CODE: 1, HR: 1, SPAN: 1, MARK: 1 };
	var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, SVG: 1, MATH: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1, NOSCRIPT: 1, TEMPLATE: 1 };
	var STYLE_OK = { "text-align": /^(left|right|center|justify)$/, "font-weight": /^(bold|[6-9]00|normal|400)$/, "font-style": /^italic$/, "text-decoration": /^(underline|line-through)/, "vertical-align": /^(super|sub)$/ };
	function cleanHtml(html) {
		var doc = new DOMParser().parseFromString("<body>" + html, "text/html");
		(function walk(el) {
			[].slice.call(el.childNodes).forEach(function (n) {
				if (n.nodeType === 8) { n.remove(); return; }
				if (n.nodeType !== 1) return;
				var tag = n.nodeName.toUpperCase();
				if (DROP[tag]) { n.remove(); return; }
				walk(n);
				if (!ALLOW[tag]) {
					if (/^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|FIGURE|FIGCAPTION|DT|DD|ADDRESS)$/.test(tag) && ![].some.call(n.children, function (c) { return /^(P|DIV|H\d|UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(c.nodeName); })) {
						var p = doc.createElement("p"); while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p);
					} else { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
					return;
				}
				[].slice.call(n.attributes).forEach(function (a) {
					var nm = a.name.toLowerCase(), v = a.value, keep = false;
					if (tag === "A" && nm === "href") { var h = D.safeHref(v); if (h) { n.setAttribute("href", h); keep = true; } }
					else if (tag === "IMG" && nm === "src") keep = /^(data:image\/(png|jpe?g|gif|bmp|webp);|blob:|https:)/i.test(v);
					else if (tag === "IMG" && (nm === "alt" || nm === "width" || nm === "height")) keep = true;
					else if ((tag === "TD" || tag === "TH") && nm === "colspan") keep = true;
					else if (tag === "OL" && nm === "start") keep = true;
					else if (nm === "class" && tag === "H1" && /\bdx-title\b/.test(v)) { n.setAttribute("class", "dx-title"); keep = true; }
					else if (nm === "style") {
						var ok = []; v.split(";").forEach(function (dcl) { var i = dcl.indexOf(":"); if (i < 0) return; var p = dcl.slice(0, i).trim().toLowerCase(), val = dcl.slice(i + 1).trim().toLowerCase(); if (STYLE_OK[p] && STYLE_OK[p].test(val)) ok.push(p + ":" + val); });
						if (ok.length) { n.setAttribute("style", ok.join(";")); keep = true; }
					}
					if (!keep) n.removeAttribute(a.name);
				});
				if (tag === "A" && !n.getAttribute("href")) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
				else if (tag === "IMG" && !n.getAttribute("src")) n.remove();
				else if (tag === "SPAN" && !n.attributes.length) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
			});
		})(doc.body);
		return doc.body.innerHTML;
	}
	var STYLE_MAP = ["p[style-name='Title'] => h1.dx-title:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote > p:fresh", "p[style-name='Intense Quote'] => blockquote > p:fresh", "u => u", "strike => s"];
	function setMode(d, mode, html) {
		if (!d) return;
		if (mode === "edit") {
			var ready = d.editEl ? Promise.resolve() : (html != null ? Promise.resolve(html) : (note("Preparing the editor&hellip;"), libMammoth().then(function () {
				return window.mammoth.convertToHtml({ arrayBuffer: d.bytes.buffer.slice(d.bytes.byteOffset, d.bytes.byteOffset + d.bytes.byteLength) }, { styleMap: STYLE_MAP });
			}).then(function (res) { d.mWarn = (res.messages || []).filter(function (m) { return m.type === "warning"; }).length; return res.value; }))).then(function (h) { if (h != null) makeEditor(d, h); });
			return ready.then(function () {
				d.scroll = view.scrollTop; d.mode = "edit"; if (d.host) d.host.hidden = true; d.edwrap.hidden = false;
				clearFind();
				modeNote(d);
				refreshUi(); applyZoom(); view.scrollTop = 0;
				setTimeout(function () { d.editEl.focus({ preventScroll: true }); }, 30);
			}).catch(function (err) { note("Could not open the editor: " + esc(err && err.message || err), true); });
		}
		// back to the page view: lay out the edited version the way it will be saved
		var go = d.dirty || d.blank ? buildEdited(d).then(function () { d.src = "edited"; }) : Promise.resolve();
		return go.then(function () {
			d.mode = "view"; if (d.edwrap) d.edwrap.hidden = true; hideImgBar(); clearFind();
			if (d.host && d.rendered === d.src) { d.host.hidden = false; modeNote(d); refreshUi(); applyZoom(); }
			else renderView(d);
		});
	}
	function makeEditor(d, html) {
		d.edwrap = document.createElement("div"); d.edwrap.className = "dx-edwrap"; d.edwrap.classList.toggle("is-dark", !!S.dark);
		var ed = document.createElement("div"); ed.className = "dx-ed"; ed.contentEditable = "true"; ed.spellcheck = true; ed.setAttribute("role", "textbox"); ed.setAttribute("aria-multiline", "true"); ed.setAttribute("aria-label", "Document text");
		var ps = d.page; ed.style.width = Math.round(ps.w / 15) + "px"; ed.style.minHeight = Math.round(ps.h / 15) + "px";
		ed.style.padding = Math.round(ps.top / 15) + "px " + Math.round(ps.right / 15) + "px " + Math.round(ps.bottom / 15) + "px " + Math.round(ps.left / 15) + "px";
		ed.innerHTML = cleanHtml(html) || "<p><br></p>";
		d.edwrap.appendChild(ed); view.appendChild(d.edwrap); d.editEl = ed;
		try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* old browsers */ }
		ed.addEventListener("input", function () { markDirty(); });
		ed.addEventListener("paste", function (e) {
			var cd = e.clipboardData; if (!cd) return;
			var file = [].find.call(cd.items || [], function (it) { return it.kind === "file" && /^image\//.test(it.type); });
			if (file) { e.preventDefault(); insertImageFile(file.getAsFile()); return; }
			var h = cd.getData("text/html");
			if (h) { e.preventDefault(); document.execCommand("insertHTML", false, cleanHtml(h.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, ""))); markDirty(); }
		});
		ed.addEventListener("keydown", function (e) {
			if (e.key === "Tab") { var li = sel().anchorNode; li = li && (li.nodeType === 1 ? li : li.parentNode); li = li && li.closest ? li.closest("li") : null; if (li) { e.preventDefault(); document.execCommand(e.shiftKey ? "outdent" : "indent"); markDirty(); } }
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); cmd("link"); }
		});
		ed.addEventListener("click", function (e) { if (e.target.nodeName === "IMG") showImgBar(e.target); else hideImgBar(); });
		ed.addEventListener("keyup", syncBar); ed.addEventListener("mouseup", syncBar);
	}
	function sel() { return getSelection(); }
	var saveDraft = debounce(function () { if (cur && cur.dirty) recentDraft(cur); }, 2500);
	var refreshSoon = debounce(function () { if (cur) cur.edText = null; if (S.tab === "outline" || S.tab === "info") fillPane(); status(); }, 600);
	function markDirty() { if (!cur) return; var was = cur.dirty; cur.dirty = cur.everEdited = true; cur.src = cur.mode === "edit" ? "edited" : cur.src; cur.editedBytes = null; if (!was) renderTabs(); saveDraft(); refreshSoon(); }
	function inEditor(node) { return cur && cur.editEl && node && cur.editEl.contains(node.nodeType === 1 ? node : node.parentNode); }
	function syncBar() {
		if (!cur || cur.mode !== "edit") return;
		["bold", "italic", "underline", "strikeThrough", "superscript", "subscript", "insertUnorderedList", "insertOrderedList"].forEach(function (c) { var b = root.querySelector('[data-cmd="' + c + '"]'); try { b.classList.toggle("is-on", document.queryCommandState(c)); } catch (e) { /* ignore */ } });
		var n = sel().anchorNode; if (!inEditor(n)) return;
		var blk = (n.nodeType === 1 ? n : n.parentNode).closest("h1,h2,h3,h4,h5,h6,blockquote,pre,p,li,td,th");
		var v = !blk ? "p" : blk.matches("h1.dx-title") ? "title" : /^H[1-4]$/.test(blk.nodeName) ? blk.nodeName.toLowerCase() : blk.closest("blockquote") ? "blockquote" : blk.closest("pre") ? "pre" : "p";
		$("dx-block").value = v;
	}
	document.addEventListener("selectionchange", debounce(function () { syncBar(); status(); }, 120));
	function cmd(c) {
		if (!cur || cur.mode !== "edit") return;
		var ed = cur.editEl; ed.focus({ preventScroll: true });
		if (c === "link") {
			var s = sel(), a = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest("a");
			var u = prompt("Link address (https://\u2026 or mailto:\u2026):", a ? a.getAttribute("href") : "https://");
			if (u == null) return; u = u.trim(); if (!u) { document.execCommand("unlink"); markDirty(); return; }
			if (!/^[a-z]+:/i.test(u) && !/^#/.test(u)) u = (/@/.test(u) && !/\//.test(u) ? "mailto:" : "https://") + u;
			if (!D.safeHref(u)) { toast("Only web, email and phone links can be added."); return; }
			if (s.isCollapsed && !a) document.execCommand("insertHTML", false, '<a href="' + esc(u) + '">' + esc(u) + "</a>");
			else if (a && s.isCollapsed) a.setAttribute("href", u); else document.execCommand("createLink", false, u);
		} else if (c === "image") { $("dx-imgin").click(); return; }
		else if (c === "table") {
			var r = prompt("Table size: columns x rows", "3 x 3"); if (!r) return;
			var m = /(\d+)\D+(\d+)/.exec(r) || [0, 3, 3], cols = Math.max(1, Math.min(12, +m[1])), rows = Math.max(1, Math.min(60, +m[2]));
			var h = "<table><tbody>"; for (var i = 0; i < rows; i++) { h += "<tr>"; for (var j = 0; j < cols; j++) h += "<td><br></td>"; h += "</tr>"; } h += "</tbody></table><p><br></p>";
			document.execCommand("insertHTML", false, h);
		} else if (c === "hilite") {
			var sl = sel(); if (sl.isCollapsed) return;
			var an = sl.anchorNode && (sl.anchorNode.nodeType === 1 ? sl.anchorNode : sl.anchorNode.parentNode).closest("mark");
			if (an) { while (an.firstChild) an.parentNode.insertBefore(an.firstChild, an); an.remove(); }
			else { var rg = sl.getRangeAt(0), mk = document.createElement("mark"); try { rg.surroundContents(mk); } catch (e) { mk.appendChild(rg.extractContents()); rg.insertNode(mk); } }
		} else document.execCommand(c, false, null);
		markDirty(); syncBar();
	}
	[].forEach.call(root.querySelectorAll("[data-cmd]"), function (b) { b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.onclick = function () { cmd(b.getAttribute("data-cmd")); }; });
	$("dx-block").onchange = function () {
		if (!cur || cur.mode !== "edit") return;
		cur.editEl.focus({ preventScroll: true });
		var v = this.value;
		document.execCommand("formatBlock", false, v === "title" ? "h1" : v);
		var n = sel().anchorNode, b = n && (n.nodeType === 1 ? n : n.parentNode).closest("h1");
		if (b) b.classList.toggle("dx-title", v === "title");
		markDirty();
	};
	function insertImageFile(f) {
		if (!f || !/^image\//.test(f.type)) return;
		var rd = new FileReader();
		rd.onload = function () {
			toPngIfNeeded(rd.result).then(function (src) {
				if (!cur || cur.mode !== "edit") return;
				cur.editEl.focus({ preventScroll: true });
				document.execCommand("insertHTML", false, '<img src="' + esc(src) + '" alt="' + esc(f.name.replace(/\.[^.]*$/, "")) + '">'); markDirty();
			});
		};
		rd.readAsDataURL(f);
	}
	$("dx-imgin").onchange = function () { insertImageFile(this.files[0]); this.value = ""; };
	function toPngIfNeeded(src) {
		if (/^data:image\/(png|jpe?g|gif);/i.test(src)) return Promise.resolve(src);
		return new Promise(function (res) {
			var im = new Image(); im.onload = function () { try { var c = document.createElement("canvas"); c.width = im.naturalWidth || 300; c.height = im.naturalHeight || 200; c.getContext("2d").drawImage(im, 0, 0); res(c.toDataURL("image/png")); } catch (e) { res(""); } };
			im.onerror = function () { res(""); }; im.src = src;
		});
	}
	var imgSel = null, imgBar = $("dx-imgbar");
	function showImgBar(img) {
		if (imgSel) imgSel.classList.remove("is-sel"); imgSel = img; img.classList.add("is-sel");
		var ar = app.getBoundingClientRect(), r = img.getBoundingClientRect();
		imgBar.hidden = false; imgBar.style.left = Math.max(6, r.left - ar.left) + "px"; imgBar.style.top = Math.max(6, r.top - ar.top - 40) + "px";
	}
	function hideImgBar() { imgBar.hidden = true; if (imgSel) imgSel.classList.remove("is-sel"); imgSel = null; }
	imgBar.addEventListener("mousedown", function (e) { e.preventDefault(); });
	imgBar.onclick = function (e) {
		var b = e.target.closest("[data-w]"); if (!b || !imgSel || !cur) return;
		var w = +b.getAttribute("data-w");
		if (!w) { imgSel.remove(); hideImgBar(); markDirty(); return; }
		var text = Math.round((cur.page.w - cur.page.left - cur.page.right) / 15), nw = imgSel.naturalWidth || text, nh = imgSel.naturalHeight || text * 0.66, px = Math.round(text * w / 100);
		imgSel.removeAttribute("style"); imgSel.setAttribute("width", px); imgSel.setAttribute("height", Math.round(px * nh / nw));
		markDirty(); showImgBar(imgSel);
	};
	view.addEventListener("scroll", function () { if (!imgBar.hidden) hideImgBar(); });

	/* ---------- building the edited .docx ---------- */
	function editModel(d) {
		var clone = d.editEl.cloneNode(true), live = d.editEl.querySelectorAll("img"), imgs = clone.querySelectorAll("img"), text = Math.round((d.page.w - d.page.left - d.page.right) / 15);
		return Promise.all([].map.call(imgs, function (im, i) {
			var src = live[i] ? live[i] : im, w = +im.getAttribute("width") || Math.min(src.naturalWidth || text, text), h = +im.getAttribute("height") || (src.naturalWidth ? Math.round(w * src.naturalHeight / src.naturalWidth) : 0);
			im.setAttribute("width", w); if (h) im.setAttribute("height", h);
			if (/^data:image\/(png|jpe?g|gif);/i.test(im.getAttribute("src"))) return null;
			return toPngIfNeeded(im.getAttribute("src")).then(function (u) { if (u) im.setAttribute("src", u); else im.replaceWith(document.createTextNode(im.getAttribute("alt") ? "[" + im.getAttribute("alt") + "]" : "")); });
		})).then(function () { return D.fromDom(clone); });
	}
	function buildEdited(d) {
		if (d.editedBytes) return Promise.resolve(d.editedBytes);
		if (!d.editEl) return Promise.resolve(d.bytes);
		return Promise.all([libZip(), editModel(d)]).then(function (x) {
			var model = x[1], p = d.props;
			var parts = D.toDocxParts(model, { title: p.title || (d.blank ? "" : D.baseName(d.name)), subject: p.subject, author: p.author, keywords: p.keywords, description: p.description, created: p.created, page: d.page });
			var z = new window.JSZip(); parts.forEach(function (f) { z.file(f.name, f.data, { createFolders: false }); });
			return z.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: DOCX_MIME }).then(function (u8) {
				d.editedBytes = u8; d.editedText = D.toText(model); d.model = model; return u8;
			});
		});
	}

	/* ---------- export / download / print ---------- */
	function currentModel(d) {
		if (d.editEl) return editModel(d);
		return libMammoth().then(function () { return window.mammoth.convertToHtml({ arrayBuffer: d.bytes.buffer.slice(d.bytes.byteOffset, d.bytes.byteOffset + d.bytes.byteLength) }, { styleMap: STYLE_MAP }); })
			.then(function (res) { var box = document.createElement("div"); box.innerHTML = cleanHtml(res.value); return D.fromDom(box); });
	}
	var menu = $("dx-menu"), dlBtn = $("dx-dl");
	dlBtn.onclick = function (e) { e.stopPropagation(); var open = menu.hidden; menu.hidden = !open; dlBtn.setAttribute("aria-expanded", String(open)); if (open) { $("dx-dl-docx-s").textContent = cur && (cur.everEdited || cur.blank) ? "your edited version" : "the document as opened"; $("dx-dl-orig").hidden = !(cur && cur.bytes && cur.everEdited); var f = menu.querySelector("button:not([hidden])"); if (f) f.focus(); } };
	document.addEventListener("click", function (e) { if (!menu.hidden && !e.target.closest(".dx-dlwrap")) { menu.hidden = true; dlBtn.setAttribute("aria-expanded", "false"); } });
	menu.addEventListener("keydown", function (e) { if (e.key === "Escape") { menu.hidden = true; dlBtn.focus(); } });
	menu.onclick = function (e) {
		var b = e.target.closest("[data-dl]"); if (!b) return;
		menu.hidden = true; dlBtn.setAttribute("aria-expanded", "false");
		if (!cur) { toast("Open a document first."); return; }
		var d = cur, kind = b.getAttribute("data-dl"), base = D.baseName(d.name);
		if (kind === "orig") { download(new Blob([d.bytes], { type: DOCX_MIME }), d.name); return; }
		if (kind === "pdf") { printDoc(); return; }
		if (kind === "docx") {
			if (!d.everEdited && !d.blank) { download(new Blob([d.bytes], { type: DOCX_MIME }), d.name); return; }
			buildEdited(d).then(function (u8) { download(new Blob([u8], { type: DOCX_MIME }), base + (d.blank ? "" : " (edited)") + ".docx"); d.dirty = false; renderTabs(); recentClearDraft(d); toast("Saved " + base + ".docx to your downloads"); }).catch(fail);
			return;
		}
		currentModel(d).then(function (model) {
			if (kind === "html") download(new Blob([D.toHtml(model, d.props.title || base)], { type: "text/html;charset=utf-8" }), base + ".html");
			else if (kind === "md") download(new Blob([D.toMarkdown(model)], { type: "text/markdown;charset=utf-8" }), base + ".md");
			else if (kind === "txt") download(new Blob([D.toText(model)], { type: "text/plain;charset=utf-8" }), base + ".txt");
			else if (kind === "copy") { var t = D.toText(model); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copied " + D.countText(t).words.toLocaleString() + " words"); }, function () { toast("Copy was blocked by the browser."); }); }
		}).catch(fail);
	};
	function recentClearDraft(d) { if (!d.key) return; store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r && r.draft) { delete r.draft; st.put(r); } }; }).catch(function () { }); }
	function fail(err) { note("Something went wrong: " + esc(err && err.message || err), true); }
	function printDoc() {
		if (!cur) { toast("Open a document first."); return; }
		var d = cur, ps = d.page, fr = document.createElement("iframe");
		fr.setAttribute("aria-hidden", "true"); fr.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
		document.body.appendChild(fr);
		var w = fr.contentWindow, doc = w.document, html;
		if (d.mode === "edit") {
			html = "<style>@page{size:" + (ps.w / 1440) + "in " + (ps.h / 1440) + "in;margin:" + [ps.top, ps.right, ps.bottom, ps.left].map(function (t) { return t / 1440 + "in"; }).join(" ") + "}body{margin:0;font:11pt/1.45 Calibri,Carlito,'Segoe UI',Arial,sans-serif;color:#000}" +
				"h1,h2,h3,h4{color:#1f3864;font-weight:400;margin:14pt 0 4pt}h1{font-size:20pt}h1.dx-title{font-size:28pt;color:#000}h2{font-size:16pt}h3{font-size:14pt;font-weight:700}p{margin:0 0 8pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #7a7a7a;padding:3pt 5pt;vertical-align:top}td p,th p{margin:0}img{max-width:100%;height:auto}blockquote{margin:8pt .5in;font-style:italic}pre{background:#f2f2f2;padding:6pt;white-space:pre-wrap;font:10pt Consolas,monospace}a{color:#0563c1}</style>" + d.editEl.innerHTML;
		} else {
			var r = activeRoot(); if (!r) return;
			var sty = d.shadow.querySelector(".sty").innerHTML, body = r.innerHTML;
			html = sty + "<style>@page{size:" + (ps.w / 1440) + "in " + (ps.h / 1440) + "in;margin:0}html,body{margin:0;padding:0;background:#fff}[data-dxw]{background:none!important;padding:0!important;display:block!important;zoom:1!important}[data-dxw]>section{box-shadow:none!important;margin:0 auto!important;break-after:page;page-break-after:always}[data-dxw]>section:last-child{break-after:auto;page-break-after:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>" + body;
		}
		doc.open(); doc.write("<!doctype html><html><head><meta charset='utf-8'><title>" + esc(D.baseName(d.name)) + "</title></head><body>" + html + "</body></html>"); doc.close();
		var imgs = [].slice.call(doc.images), done = false;
		var fire = function () { if (done) return; done = true; try { w.focus(); w.print(); } catch (e) { fail(e); } setTimeout(function () { fr.remove(); }, 60000); };
		Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (res) { im.onload = im.onerror = res; }); })).then(function () { setTimeout(fire, 150); });
		setTimeout(fire, 4000);
		toast("In the print window, choose \u201CSave as PDF\u201D to make a PDF.");
	}
	$("dx-print").onclick = printDoc;

	/* ---------- mode / dark paper / fill window / full screen ---------- */
	$("dx-mview").onclick = function () { if (cur && cur.mode !== "view") setMode(cur, "view"); };
	$("dx-medit").onclick = function () { if (cur && cur.mode !== "edit") setMode(cur, "edit"); };
	$("dx-paper").onclick = function () { S.dark = !S.dark; save(); docs.forEach(function (d) { if (d.host) d.host.classList.toggle("is-dark", S.dark); if (d.edwrap) d.edwrap.classList.toggle("is-dark", S.dark); }); this.setAttribute("aria-pressed", String(S.dark)); };
	function setFill(on) { app.classList.toggle("is-fill", on); document.body.classList.toggle("dx-filled", on); $("dx-fill").setAttribute("aria-pressed", String(on)); if (cur && !cur.zoom) setTimeout(applyZoom, 30); }
	$("dx-fill").onclick = function () { setFill(!app.classList.contains("is-fill")); };
	function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else if (app.requestFullscreen) app.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); }
	$("dx-fs").onclick = toggleFs;
	document.addEventListener("fullscreenchange", function () { if (cur && !cur.zoom) setTimeout(applyZoom, 60); });
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.nodeName)), inApp = app.contains(t) || app.classList.contains("is-fill");
		var mod = e.ctrlKey || e.metaKey;
		if (e.key === "Escape" && app.classList.contains("is-fill") && !document.fullscreenElement) { setFill(false); return; }
		if (!inApp) return;
		if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pick(); return; }
		if (!cur) return;
		if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); if (!S.side) setSide(true); setTab("find"); return; }
		if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); menu.querySelector('[data-dl="docx"]').click(); return; }
		if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); printDoc(); return; }
		if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); stepZoom(1); return; }
		if (mod && e.key === "-") { e.preventDefault(); stepZoom(-1); return; }
		if (mod && e.key === "0") { e.preventDefault(); setZoom(1); return; }
		if (typing || mod || e.altKey) return;
		if (e.key === "w" || e.key === "W") setFill(!app.classList.contains("is-fill"));
		else if (e.key === "f" || e.key === "F") toggleFs();
	});

	/* ---------- status line + toolbar state ---------- */
	function status() {
		var el = $("dx-status");
		if (!cur) { el.textContent = docs.length ? "" : "No document open"; return; }
		var c = D.countText(docTextNow()), bits = [];
		bits.push("<b>" + (cur.mode === "edit" ? "Editing" : cur.src === "edited" ? "Page view (edited)" : "Page view") + "</b>");
		if (cur.mode === "view" && cur.pages) bits.push(cur.pages + " page" + (cur.pages === 1 ? "" : "s"));
		bits.push(c.words.toLocaleString() + " word" + (c.words === 1 ? "" : "s"), c.chars.toLocaleString() + " characters");
		var s = cur.shadow && cur.mode === "view" && cur.shadow.getSelection ? cur.shadow.getSelection() : getSelection(), st = s && !s.isCollapsed ? String(s) : "";
		if (st && (cur.mode === "edit" ? inEditor(s.anchorNode) : true)) { var sc = D.countText(st); if (sc.words) bits.push(sc.words.toLocaleString() + " selected"); }
		if (cur.dirty) bits.push("edited, not downloaded yet");
		el.innerHTML = bits.join(" &middot; ");
	}
	function refreshUi() {
		var on = !!cur, edit = on && cur.mode === "edit";
		$("dx-mview").setAttribute("aria-pressed", String(!edit)); $("dx-medit").setAttribute("aria-pressed", String(edit));
		$("dx-edbar").hidden = !edit;
		["dx-mview", "dx-medit", "dx-zin", "dx-zout", "dx-zoom", "dx-fit", "dx-print", "dx-dl"].forEach(function (id) { $(id).disabled = !on; });
		$("dx-medit").disabled = !on || (!cur.bytes && !cur.editEl);
		$("dx-paper").setAttribute("aria-pressed", String(!!S.dark));
		if (!on) $("dx-zoom").textContent = "100%";
		fillPane(); status();
	}
	window.addEventListener("beforeunload", function (e) { if (docs.some(function (d) { return d.dirty; })) { e.preventDefault(); e.returnValue = ""; } });

	setSide(S.side); setTab(S.tab); refreshUi(); showRecent();
	window.MESDocxApp = { docs: docs, open: openBytes, build: buildEdited, current: function () { return cur; }, setMode: setMode };     // for testing in the console
})();
