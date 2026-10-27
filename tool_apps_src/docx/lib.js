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
