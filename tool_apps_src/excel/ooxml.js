/* MES Spreadsheet Viewer (mes.fm/excel): the parts of an .xlsx that SheetJS Community Edition does not read or write.
   Pure logic, no DOM: window.MESXLO in the page, require()-able in node (tests: node tool_apps_src/excel-tests.js).
   - zip: read the central directory, inflate entries through an injected async inflate(u8) (DecompressionStream in the
     browser, zlib in node), write a zip (stored, or deflated through an injected deflate)
   - a small XML parser (xml, kid, kids, att, txt) good enough for the package parts (never used on sheetData, which is
     scanned with regular expressions so a 50 MB sheet stays fast)
   - readPackage: theme colours, styles (fonts, fills, borders, alignment, number formats, dxfs, custom table styles),
     per sheet: state (hidden / veryHidden), frozen pane, columns (width, hidden, style), hidden rows, row styles, the
     style index of every cell, conditional formatting, tables (xl/tables/*), drawings with chart / picture anchors,
     charts (xl/charts/*: bar, column, line, area, pie, doughnut, scatter, radar; stacked / percent; secondary axis)
   - looks: cell xf -> look {fill, color, b, i, u, s, sz, ha, va, wrap, bd}, built-in TableStyleLight1-21 / Medium1-28 /
     Dark1-11 (approximated from Excel's presets) and custom table styles -> per-cell look, look -> CSS
   - conditional formatting: cellIs, text rules, blanks / errors, top / bottom N, above / below average, duplicates,
     expressions (through an injected evaluator), colour scales, data bars
   - chartSvg: an SVG drawing of a parsed chart with live values
   - graft: patch the .xlsx SheetJS writes so it keeps the original styles, theme, freeze panes, conditional formatting,
     tables, charts and pictures. */
(function (root) {
	"use strict";
	var EMU = 9525;

	/* ---------- bytes / text ---------- */
	function utf8(u8) {
		if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(u8);
		return Buffer.from(u8).toString("utf8");
	}
	function enc(s) {
		if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
		return new Uint8Array(Buffer.from(s, "utf8"));
	}
	var CRC = null;
	function crc32(u8) {
		if (!CRC) { CRC = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
		var crc = -1; for (var i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
		return (crc ^ -1) >>> 0;
	}

	/* ---------- zip ---------- */
	function unzip(u8) {
		var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1;
		for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
		if (eocd < 0) throw new Error("not a zip file");
		var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), out = {}, order = [];
		if (p === 0xFFFFFFFF) {   // zip64
			var loc = dv.getUint32(eocd - 20, true) === 0x07064b50 ? Number(dv.getBigUint64(eocd - 12, true)) : -1;
			if (loc >= 0) { n = Number(dv.getBigUint64(loc + 32, true)); p = Number(dv.getBigUint64(loc + 48, true)); }
		}
		for (var k = 0; k < n; k++) {
			if (dv.getUint32(p, true) !== 0x02014b50) break;
			var method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true);
			var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
			var name = utf8(u8.subarray(p + 46, p + 46 + nl));
			if (cs === 0xFFFFFFFF || us === 0xFFFFFFFF || lo === 0xFFFFFFFF) {
				var x = p + 46 + nl, xe = x + xl;
				while (x + 4 <= xe) { var id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true), q = x + 4;
					if (id === 1) { if (us === 0xFFFFFFFF) { us = Number(dv.getBigUint64(q, true)); q += 8; } if (cs === 0xFFFFFFFF) { cs = Number(dv.getBigUint64(q, true)); q += 8; } if (lo === 0xFFFFFFFF) lo = Number(dv.getBigUint64(q, true)); }
					x += 4 + sz; }
			}
			var lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true), d0 = lo + 30 + lnl + lxl;
			out[name] = { name: name, method: method, crc: crc, csize: cs, usize: us, raw: u8.subarray(d0, d0 + cs) };
			order.push(name);
			p += 46 + nl + xl + cl;
		}
		return { files: out, order: order };
	}
	function entryBytes(z, name, inflate) {
		var e = z.files[name];
		if (!e) return Promise.resolve(null);
		if (e.method === 0) return Promise.resolve(e.raw);
		if (e.method !== 8) return Promise.reject(new Error("unsupported zip compression"));
		return Promise.resolve(inflate(e.raw));
	}
	function entryText(z, name, inflate) { return entryBytes(z, name, inflate).then(function (b) { return b ? utf8(b) : null; }); }
	// files: [{name, data: Uint8Array}] (compressed here if deflate is given) or [{name, raw, method, crc, usize}] (copied as is)
	function zipWrite(files, deflate) {
		return Promise.all(files.map(function (f) {
			if (f.raw) return { name: f.name, raw: f.raw, method: f.method, crc: f.crc, usize: f.usize };
			var data = f.data, crc = crc32(data);
			if (!deflate || data.length < 64) return { name: f.name, raw: data, method: 0, crc: crc, usize: data.length };
			return Promise.resolve(deflate(data)).then(function (d) { return d.length < data.length ? { name: f.name, raw: d, method: 8, crc: crc, usize: data.length } : { name: f.name, raw: data, method: 0, crc: crc, usize: data.length }; });
		})).then(function (list) {
			var parts = [], cen = [], off = 0;
			list.forEach(function (f) {
				var nm = enc(f.name), h = new Uint8Array(30 + nm.length), dv = new DataView(h.buffer);
				dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, f.method, true);
				dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, f.crc, true); dv.setUint32(18, f.raw.length, true); dv.setUint32(22, f.usize, true);
				dv.setUint16(26, nm.length, true); h.set(nm, 30);
				var c = new Uint8Array(46 + nm.length), cv = new DataView(c.buffer);
				cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, f.method, true);
				cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, f.crc, true); cv.setUint32(20, f.raw.length, true); cv.setUint32(24, f.usize, true);
				cv.setUint16(28, nm.length, true); cv.setUint32(42, off, true); c.set(nm, 46);
				parts.push(h, f.raw); cen.push(c); off += h.length + f.raw.length;
			});
			var cs = 0; cen.forEach(function (c) { cs += c.length; });
			var e = new Uint8Array(22), ev = new DataView(e.buffer);
			ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, list.length, true); ev.setUint16(10, list.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
			var all = parts.concat(cen, [e]), total = 0; all.forEach(function (a) { total += a.length; });
			var out = new Uint8Array(total), o = 0; all.forEach(function (a) { out.set(a, o); o += a.length; });
			return out;
		});
	}

	/* ---------- XML ---------- */
	var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
	function unesc(s) { return s.indexOf("&") < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) { return e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()]; }); }
	function escX(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function local(q) { var i = q.indexOf(":"); return i < 0 ? q : q.slice(i + 1); }
	// -> {n: local name, q: qualified name, a: {qualified attr: value}, c: [children], t: text}
	function xml(s) {
		var rootN = { n: "#root", q: "#root", a: {}, c: [], t: "" }, st = [rootN], re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s>\/]+)((?:\s+[^\s=>\/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g, m;
		var ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
		while ((m = re.exec(s))) {
			var top = st[st.length - 1];
			if (m[6] != null) { top.t += unesc(m[6]); continue; }
			if (m[1] != null) { top.t += m[1]; continue; }
			if (m[2]) { if (st.length > 1) st.pop(); continue; }
			if (m[3]) {
				var a = {}, am; ar.lastIndex = 0;
				if (m[4]) while ((am = ar.exec(m[4]))) a[am[1]] = unesc(am[2] != null ? am[2] : am[3]);
				var nd = { n: local(m[3]), q: m[3], a: a, c: [], t: "" };
				top.c.push(nd);
				if (!m[5]) st.push(nd);
			}
		}
		return rootN.c[0] || rootN;
	}
	function kid(n, name) { if (!n) return null; for (var i = 0; i < n.c.length; i++) if (n.c[i].n === name) return n.c[i]; return null; }
	function kids(n, name) { return n ? n.c.filter(function (x) { return x.n === name; }) : []; }
	function path(n) { for (var i = 1; i < arguments.length && n; i++) n = kid(n, arguments[i]); return n; }
	function att(n, name) { if (!n) return undefined; if (n.a[name] != null) return n.a[name]; for (var k in n.a) if (local(k) === name) return n.a[k]; return undefined; }
	function val(n) { return n ? att(n, "val") : undefined; }
	function all(n, name, out) { out = out || []; if (!n) return out; n.c.forEach(function (x) { if (x.n === name) out.push(x); all(x, name, out); }); return out; }
	function txt(n) { if (!n) return ""; return all(n, "t").map(function (t) { return t.t; }).join(""); }
	function on(v, def) { if (v == null) return def; return v === "1" || v === "true" || v === true; }

	/* ---------- paths / rels ---------- */
	function dirOf(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i + 1); }
	function resolve(base, target) {
		if (/^[a-z]+:/i.test(target)) return target;
		var parts = (target[0] === "/" ? target.slice(1) : dirOf(base) + target).split("/"), out = [];
		parts.forEach(function (p) { if (p === "..") out.pop(); else if (p !== "." && p !== "") out.push(p); });
		return out.join("/");
	}
	function relsPath(part) { return dirOf(part) + "_rels/" + part.slice(dirOf(part).length) + ".rels"; }
	function parseRels(s, part) {
		var out = {}; if (!s) return out;
		kids(xml(s), "Relationship").forEach(function (r) { out[r.a.Id] = { id: r.a.Id, type: (r.a.Type || "").replace(/^.*\//, ""), target: r.a.TargetMode === "External" ? r.a.Target : resolve(part, r.a.Target), ext: r.a.TargetMode === "External" }; });
		return out;
	}

	/* ---------- colours ---------- */
	var DEFAULT_THEME = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];
	var INDEXED = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
		"800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080", "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
		"000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF", "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
		"3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696", "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333"];
	function parseTheme(s) {
		var t = DEFAULT_THEME.slice(), fonts = { major: "Calibri Light", minor: "Calibri" };
		if (!s) return { colors: t, fonts: fonts };
		var x = xml(s), cs = all(x, "clrScheme")[0];
		if (cs) {
			var get = function (name) { var n = kid(cs, name); if (!n || !n.c[0]) return null; var c = n.c[0]; return (c.a.lastClr || c.a.val || "").slice(-6).toUpperCase() || null; };
			var order = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
			order.forEach(function (k, i) { var v = get(k); if (v && /^[0-9A-F]{6}$/.test(v)) t[i] = v; });
		}
		var mj = all(x, "majorFont")[0], mn = all(x, "minorFont")[0];
		if (mj && kid(mj, "latin")) fonts.major = kid(mj, "latin").a.typeface || fonts.major;
		if (mn && kid(mn, "latin")) fonts.minor = kid(mn, "latin").a.typeface || fonts.minor;
		return { colors: t, fonts: fonts };
	}
	function hexRgb(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
	function rgbHex(r, g, b) { return [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase(); }
	function toHls(h) {
		var c = hexRgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hu = 0;
		if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hu = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hu /= 6; }
		return [hu, l, s];
	}
	function fromHls(hu, l, s) {
		if (!s) return rgbHex(l * 255, l * 255, l * 255);
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
		var f = function (t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
		return rgbHex(f(hu + 1 / 3) * 255, f(hu) * 255, f(hu - 1 / 3) * 255);
	}
	// Excel tint: < 0 darkens (lum * (1 + tint)), > 0 lightens (lum + (1 - lum) * tint)
	function tint(h, t) { if (!t) return h; var x = toHls(h), l = t < 0 ? x[1] * (1 + t) : x[1] + (1 - x[1]) * t; return fromHls(x[0], Math.max(0, Math.min(1, l)), x[2]); }
	function lumMod(h, mod, off) { var x = toHls(h); return fromHls(x[0], Math.max(0, Math.min(1, x[1] * mod + off)), x[2]); }
	function luminance(h) { var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
	// <color rgb|theme|indexed|auto tint/> -> "RRGGBB" | null
	function color(n, theme, indexed) {
		if (!n) return null;
		var a = n.a || n, h = null;
		if (a.rgb) h = String(a.rgb).slice(-6).toUpperCase();
		else if (a.theme != null) h = (theme || DEFAULT_THEME)[+a.theme] || null;
		else if (a.indexed != null) { var i = +a.indexed; h = i === 64 ? "000000" : i === 65 ? "FFFFFF" : ((indexed || INDEXED)[i] || null); }
		else if (on(a.auto)) return null;
		if (!h || !/^[0-9A-F]{6}$/.test(h)) return null;
		return a.tint ? tint(h, +a.tint) : h;
	}
	var SCHEME = { lt1: 0, bg1: 0, dk1: 1, tx1: 1, lt2: 2, bg2: 2, dk2: 3, tx2: 3, accent1: 4, accent2: 5, accent3: 6, accent4: 7, accent5: 8, accent6: 9, hlink: 10, folHlink: 11 };
	// DrawingML colour: <a:solidFill><a:srgbClr val/> | <a:schemeClr val><a:lumMod val/><a:lumOff val/></a:schemeClr> ...
	function dmlColor(fill, theme) {
		if (!fill) return null;
		var c = fill.c.filter(function (x) { return /Clr$/.test(x.n); })[0];
		if (!c) return null;
		var h = null;
		if (c.n === "srgbClr") h = String(c.a.val || "").toUpperCase();
		else if (c.n === "schemeClr") { var i = SCHEME[c.a.val]; h = i != null ? (theme || DEFAULT_THEME)[i] : null; }
		else if (c.n === "sysClr") h = String(c.a.lastClr || (c.a.val === "window" ? "FFFFFF" : "000000")).toUpperCase();
		else if (c.n === "prstClr") h = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080" }[c.a.val] || null;
		if (!h || !/^[0-9A-F]{6}$/.test(h)) return null;
		var mod = kid(c, "lumMod"), off = kid(c, "lumOff"), sh = kid(c, "shade"), tn = kid(c, "tint");
		if (mod || off) h = lumMod(h, mod ? +mod.a.val / 1e5 : 1, off ? +off.a.val / 1e5 : 0);
		if (sh) { var s = +sh.a.val / 1e5, rgb = hexRgb(h); h = rgbHex(rgb[0] * s, rgb[1] * s, rgb[2] * s); }
		if (tn) { var tt = +tn.a.val / 1e5, rg = hexRgb(h); h = rgbHex(255 - (255 - rg[0]) * tt, 255 - (255 - rg[1]) * tt, 255 - (255 - rg[2]) * tt); }
		return h;
	}

	/* ---------- styles ---------- */
	var BUILTIN_FMT = { 0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??", 14: "m/d/yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
		18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@" };
	var BW = { hair: 1, thin: 1, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1, medium: 2, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2, slantDashDot: 2, thick: 3, double: 3 };
	function parseFont(n, theme, indexed) {
		if (!n) return null;
		var f = {}, b = kid(n, "b"), i = kid(n, "i"), u = kid(n, "u"), s = kid(n, "strike"), sz = kid(n, "sz"), nm = kid(n, "name"), c = kid(n, "color");
		if (b) f.b = on(val(b), true); if (i) f.i = on(val(i), true); if (s) f.s = on(val(s), true);
		if (u) f.u = val(u) !== "none";
		if (sz) f.sz = +val(sz); if (nm) f.name = val(nm);
		if (c) { var h = color(c, theme, indexed); if (h) f.color = h; }
		var va = kid(n, "vertAlign"); if (va) f.va = val(va);
		return f;
	}
	function parseFill(n, theme, indexed, dxf) {
		if (!n) return null;
		var p = kid(n, "patternFill");
		if (p) {
			var pt = p.a.patternType || (dxf ? "solid" : "none");
			if (pt === "none") return null;
			var fg = color(kid(p, "fgColor"), theme, indexed), bg = color(kid(p, "bgColor"), theme, indexed);
			if (dxf && pt === "solid") return bg || fg ? { c: bg || fg } : null;
			if (pt === "solid") return fg ? { c: fg } : (bg ? { c: bg } : null);
			if (pt === "gray125" || pt === "gray0625") return dxf ? null : { c: fg || "D9D9D9", pat: pt };
			return { c: fg || bg || "D9D9D9", pat: pt };
		}
		var g = kid(n, "gradientFill");
		if (g) { var stops = kids(g, "stop").map(function (s) { return color(kid(s, "color"), theme, indexed); }).filter(Boolean); return stops.length ? { c: stops[0], grad: stops, deg: +(g.a.degree || 0) } : null; }
		return null;
	}
	function parseBorder(n, theme, indexed) {
		if (!n) return null;
		var out = {}, any = false;
		[["left", "l"], ["right", "r"], ["top", "t"], ["bottom", "b"], ["start", "l"], ["end", "r"], ["horizontal", "h"], ["vertical", "v"]].forEach(function (p) {
			var e = kid(n, p[0]); if (!e || !e.a.style || e.a.style === "none") return;
			out[p[1]] = { w: BW[e.a.style] || 1, st: e.a.style, c: color(kid(e, "color"), theme, indexed) || "000000" }; any = true;
		});
		return any ? out : null;
	}
	function parseStyles(s, theme) {
		var st = { xfs: [], dxfs: [], fmts: {}, tableStyles: {}, defaultTableStyle: "TableStyleMedium2", indexed: INDEXED, raw: s || "" };
		if (!s) return st;
		var x = xml(s);
		var ic = path(x, "colors", "indexedColors");
		if (ic) { var list = kids(ic, "rgbColor").map(function (c) { return String(c.a.rgb || "").slice(-6).toUpperCase(); }); if (list.length) st.indexed = list.concat(INDEXED.slice(list.length)); }
		kids(kid(x, "numFmts"), "numFmt").forEach(function (f) { st.fmts[+f.a.numFmtId] = f.a.formatCode; });
		var fonts = kids(kid(x, "fonts"), "font").map(function (f) { return parseFont(f, theme, st.indexed); });
		var fills = kids(kid(x, "fills"), "fill").map(function (f) { return parseFill(f, theme, st.indexed); });
		var borders = kids(kid(x, "borders"), "border").map(function (b) { return parseBorder(b, theme, st.indexed); });
		st.font0 = fonts[0] || {};
		kids(kid(x, "cellXfs"), "xf").forEach(function (xf) {
			var a = xf.a, al = kid(xf, "alignment"), o = { fmt: +(a.numFmtId || 0), font: +(a.fontId || 0), fill: +(a.fillId || 0), border: +(a.borderId || 0) };
			var look = {};
			var f = fonts[o.font];
			if (f && o.font !== 0) { ["b", "i", "u", "s", "va"].forEach(function (k) { if (f[k]) look[k] = f[k]; }); if (f.color) look.color = f.color; if (f.sz) look.sz = f.sz; if (f.name) look.font = f.name; }
			var fl = fills[o.fill]; if (fl) look.fill = fl;
			var bd = borders[o.border]; if (bd) look.bd = bd;
			if (al) {
				if (al.a.horizontal && al.a.horizontal !== "general") look.ha = al.a.horizontal;
				if (al.a.vertical) look.vaAlign = al.a.vertical;
				if (on(al.a.wrapText)) look.wrap = true;
				if (al.a.indent) look.indent = +al.a.indent;
				if (al.a.textRotation && +al.a.textRotation) look.rot = +al.a.textRotation;
			}
			o.look = look; o.code = st.fmts[o.fmt] || BUILTIN_FMT[o.fmt] || "General";
			st.xfs.push(o);
		});
		kids(kid(x, "dxfs"), "dxf").forEach(function (d) {
			var look = {}, f = parseFont(kid(d, "font"), theme, st.indexed), fl = parseFill(kid(d, "fill"), theme, st.indexed, true), bd = parseBorder(kid(d, "border"), theme, st.indexed);
			if (f) { ["b", "i", "u", "s"].forEach(function (k) { if (f[k] != null) look[k] = f[k]; }); if (f.color) look.color = f.color; }
			if (fl) look.fill = fl; if (bd) look.bd = bd;
			var nf = kid(d, "numFmt"); if (nf) look.code = nf.a.formatCode;
			st.dxfs.push(look);
		});
		var ts = kid(x, "tableStyles");
		if (ts) {
			if (ts.a.defaultTableStyle) st.defaultTableStyle = ts.a.defaultTableStyle;
			kids(ts, "tableStyle").forEach(function (t) {
				var els = {};
				kids(t, "tableStyleElement").forEach(function (e) { var d = st.dxfs[+e.a.dxfId]; if (d) els[e.a.type] = Object.assign({ size: +(e.a.size || 1) }, d); });
				st.tableStyles[t.a.name] = els;
			});
		}
		return st;
	}

	/* ---------- built-in table styles (approximations of Excel's presets) ---------- */
	function TS(theme) {
		var T = theme || DEFAULT_THEME;
		return {
			key: function (k) { return k === "dk1" ? T[1] : k === "lt1" ? T[0] : T[4 + (+k.slice(6) - 1)]; },
			t: function (k, v) { return tint(this.key(k), v); }
		};
	}
	function line(c, w) { return { w: w || 1, st: w === 3 ? "double" : "thin", c: c }; }
	function builtinTableStyle(name, theme) {
		var m = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(name || "");
		if (!m) return null;
		var kind = m[1], n = +m[2], H = TS(theme), white = H.key("lt1"), black = H.key("dk1");
		var gi = function (size) { return (n - 1) % size; }, grp = function (size) { return Math.floor((n - 1) / size); };
		var acc = function (i) { return i === 0 ? "dk1" : "accent" + i; };
		var E = {};
		if (kind === "Light" && n <= 21) {
			var k = acc(gi(7)), K = H.key(k), g = grp(7), stripe = k === "dk1" ? tint(K, 0.85) : H.t(k, 0.8), tx = k === "dk1" ? black : H.t(k, -0.25);
			if (g === 0) {
				E.wholeTable = { color: tx, bd: { t: line(K), b: line(K) } };
				E.headerRow = { b: true, bd: { b: line(K) } }; E.totalRow = { b: true, bd: { t: line(K) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: stripe } }; E.firstColumnStripe = { fill: { c: stripe } };
			} else if (g === 1) {
				E.wholeTable = { bd: { t: line(K), b: line(K), l: line(K), r: line(K) } };
				E.headerRow = { b: true, color: white, fill: { c: K } }; E.totalRow = { b: true, bd: { t: line(K, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true };
				E.firstRowStripe = { bd: { t: line(K), b: line(K) } }; E.firstColumnStripe = { bd: { l: line(K), r: line(K) } };
			} else {
				E.wholeTable = { bd: { t: line(K), b: line(K), l: line(K), r: line(K), h: line(K), v: line(K) } };
				E.headerRow = { b: true, bd: { b: line(K, 2) } }; E.totalRow = { b: true, bd: { t: line(K, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: stripe } }; E.firstColumnStripe = { fill: { c: stripe } };
			}
		} else if (kind === "Medium" && n <= 28) {
			var k2 = acc(gi(7)), K2 = H.key(k2), g2 = grp(7), neutral = k2 === "dk1";
			var t8 = neutral ? tint(black, 0.85) : H.t(k2, 0.8), t6 = neutral ? tint(black, 0.65) : H.t(k2, 0.6), t4 = neutral ? tint(black, 0.5) : H.t(k2, 0.4);
			if (g2 === 0) {
				E.wholeTable = { color: black, bd: { t: line(t4), b: line(t4), l: line(t4), r: line(t4), h: line(t4) } };
				E.headerRow = { b: true, color: white, fill: { c: K2 } }; E.totalRow = { b: true, bd: { t: line(K2, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: t8 } }; E.firstColumnStripe = { fill: { c: t8 } };
			} else if (g2 === 1) {
				E.wholeTable = { color: black, fill: { c: t8 }, bd: { h: line(white), v: line(white) } };
				E.headerRow = { b: true, color: white, fill: { c: K2 }, bd: { b: line(white, 3) } }; E.totalRow = { b: true, color: white, fill: { c: K2 }, bd: { t: line(white, 3) } };
				E.firstColumn = { b: true, color: white, fill: { c: K2 } }; E.lastColumn = { b: true, color: white, fill: { c: K2 } };
				E.firstRowStripe = { fill: { c: t6 } }; E.firstColumnStripe = { fill: { c: t6 } };
			} else if (g2 === 2) {
				var gray = tint(black, 0.85);
				E.wholeTable = { color: black, bd: { t: line(black, 2), b: line(black, 2), h: line(tint(black, 0.5)) } };
				E.headerRow = { b: true, color: white, fill: { c: K2 }, bd: { b: line(black, 2) } }; E.totalRow = { b: true, bd: { t: line(black, 3) } };
				E.firstColumn = { b: true, color: white, fill: { c: K2 } }; E.lastColumn = { b: true, color: white, fill: { c: K2 } };
				E.firstRowStripe = { fill: { c: gray } }; E.firstColumnStripe = { fill: { c: gray } };
			} else {
				E.wholeTable = { color: black, fill: { c: t8 }, bd: { t: line(t4), b: line(t4), l: line(t4), r: line(t4), h: line(t4), v: line(t4) } };
				E.headerRow = { b: true }; E.totalRow = { b: true, bd: { t: line(K2, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: t6 } }; E.firstColumnStripe = { fill: { c: t6 } };
			}
		} else if (kind === "Dark" && n <= 11) {
			if (n <= 7) {
				var k3 = acc(n - 1), K3 = n === 1 ? tint(black, 0.45) : H.key(k3), dk = n === 1 ? tint(black, 0.25) : tint(K3, -0.25), dd = n === 1 ? tint(black, 0.15) : tint(K3, -0.5);
				E.wholeTable = { color: white, fill: { c: K3 } };
				E.headerRow = { b: true, color: white, fill: { c: black }, bd: { b: line(white, 2) } }; E.totalRow = { b: true, color: white, fill: { c: dd }, bd: { t: line(white, 3) } };
				E.firstColumn = { b: true, color: white, fill: { c: dk } }; E.lastColumn = { b: true, color: white, fill: { c: dk } };
				E.firstRowStripe = { fill: { c: dk } }; E.firstColumnStripe = { fill: { c: dk } };
			} else {
				var a1 = n === 8 ? null : "accent" + ((n - 9) * 2 + 1), a2 = n === 8 ? null : "accent" + ((n - 9) * 2 + 2);
				var rowsC = a1 ? H.t(a1, 0.8) : tint(black, 0.85), band = a1 ? H.t(a1, 0.6) : tint(black, 0.75), head = a2 ? H.key(a2) : black;
				E.wholeTable = { color: black, fill: { c: rowsC } };
				E.headerRow = { b: true, color: white, fill: { c: head } }; E.totalRow = { b: true, bd: { t: line(black, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: band } }; E.firstColumnStripe = { fill: { c: band } };
			}
		} else return null;
		return E;
	}
	// the look of cell (r, c) inside table t ({ref g, header, totals, style info}); els = element map
	function tableLook(t, r, c, els) {
		if (!els) return null;
		var g = t.g, inT = r >= g.s.r && r <= g.e.r && c >= g.s.c && c <= g.e.c;
		if (!inT) return null;
		var hdr = t.header && r === g.s.r, tot = t.totals && r === g.e.r, look = {}, bd = {};
		var put = function (e, edges) {
			if (!e) return;
			["fill", "color", "b", "i", "u"].forEach(function (k) { if (e[k] != null) look[k] = e[k]; });
			if (e.bd) edges.forEach(function (p) { var src = e.bd[p[0]]; if (src) bd[p[1]] = src; });
		};
		var first = g.s.r + (t.header ? 1 : 0), last = g.e.r - (t.totals ? 1 : 0);
		var outer = function (rTop, rBot) { var ed = []; if (r === rTop) ed.push(["t", "t"]); else ed.push(["h", "t"]); if (r === rBot) ed.push(["b", "b"]); else ed.push(["h", "b"]); if (c === g.s.c) ed.push(["l", "l"]); else ed.push(["v", "l"]); if (c === g.e.c) ed.push(["r", "r"]); else ed.push(["v", "r"]); return ed; };
		put(els.wholeTable, outer(g.s.r, g.e.r));
		var bodyRow = !hdr && !tot, edgesBox = [["t", "t"], ["b", "b"], ["l", "l"], ["r", "r"]];
		if (bodyRow && t.colStripes) { var ci = c - g.s.c, sz1 = (els.firstColumnStripe && els.firstColumnStripe.size) || 1, sz2 = (els.secondColumnStripe && els.secondColumnStripe.size) || 1; if (ci % (sz1 + sz2) < sz1) put(els.firstColumnStripe, edgesBox); else put(els.secondColumnStripe, edgesBox); }
		if (bodyRow && t.rowStripes) { var ri = r - first, s1 = (els.firstRowStripe && els.firstRowStripe.size) || 1, s2 = (els.secondRowStripe && els.secondRowStripe.size) || 1; if (ri % (s1 + s2) < s1) put(els.firstRowStripe, edgesBox); else put(els.secondRowStripe, edgesBox); }
		if (t.firstCol && c === g.s.c) put(els.firstColumn, edgesBox);
		if (t.lastCol && c === g.e.c) put(els.lastColumn, edgesBox);
		if (hdr) put(els.headerRow, edgesBox);
		if (tot) put(els.totalRow, edgesBox);
		if (hdr && t.firstCol && c === g.s.c) put(els.firstHeaderCell, edgesBox);
		if (hdr && t.lastCol && c === g.e.c) put(els.lastHeaderCell, edgesBox);
		if (tot && t.firstCol && c === g.s.c) put(els.firstTotalCell, edgesBox);
		if (tot && t.lastCol && c === g.e.c) put(els.lastTotalCell, edgesBox);
		void last;
		if (Object.keys(bd).length) look.bd = bd;
		return look;
	}
	function tableElements(t, styles, theme) {
		var name = t.style || "";
		if (!name) return null;
		return (styles && styles.tableStyles[name]) || builtinTableStyle(name, theme) || null;
	}
	function parseTable(s) {
		var x = xml(s), g = parseRange(x.a.ref), si = kid(x, "tableStyleInfo");
		if (!g) return null;
		return {
			name: x.a.displayName || x.a.name, g: g, ref: x.a.ref,
			header: x.a.headerRowCount !== "0", totals: on(x.a.totalsRowCount) || +(x.a.totalsRowCount || 0) > 0 || on(x.a.totalsRowShown, false) && +(x.a.totalsRowCount || 0) > 0,
			style: si ? si.a.name : "", rowStripes: si ? on(si.a.showRowStripes, false) : false, colStripes: si ? on(si.a.showColumnStripes, false) : false,
			firstCol: si ? on(si.a.showFirstColumn, false) : false, lastCol: si ? on(si.a.showLastColumn, false) : false,
			columns: kids(kid(x, "tableColumns"), "tableColumn").map(function (c) { return c.a.name; })
		};
	}

	/* ---------- A1 (a copy of the bits needed here, so this file stands alone) ---------- */
	function colIndex(s) { s = s.replace(/\$/g, "").toUpperCase(); var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
	function colName(c) { var s = ""; c = Math.floor(c); while (c >= 0) { s = String.fromCharCode(65 + c % 26) + s; c = Math.floor(c / 26) - 1; } return s; }
	function cellRef(s) { var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s); return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null; }
	function parseRange(s) {
		if (!s) return null; var p = String(s).split(":"), a = cellRef(p[0]), b = p[1] ? cellRef(p[1]) : a;
		if (!a || !b) { var cm = /^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})$/i.exec(s); if (cm) return { s: { r: 0, c: colIndex(cm[1]) }, e: { r: 1048575, c: colIndex(cm[2]) } }; var rm = /^\$?(\d+):\$?(\d+)$/.exec(s); if (rm) return { s: { r: +rm[1] - 1, c: 0 }, e: { r: +rm[2] - 1, c: 16383 } }; return null; }
		return { s: { r: Math.min(a.r, b.r), c: Math.min(a.c, b.c) }, e: { r: Math.max(a.r, b.r), c: Math.max(a.c, b.c) } };
	}
	function sqref(s) { return String(s || "").trim().split(/\s+/).map(parseRange).filter(Boolean); }
	// chart / CF references: "'My sheet'!$B$2:$B$9", "(Sheet1!$A$1,Sheet1!$A$3)", "Sheet1!B1"
	function parseRefs(f) {
		if (!f) return [];
		f = String(f).trim().replace(/^\(|\)$/g, "");
		var out = [], re = /(?:'((?:[^']|'')+)'|([^!,'()]+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)/g, m;
		while ((m = re.exec(f))) { var g = parseRange(m[3]); if (g) out.push({ sheet: m[1] != null ? m[1].replace(/''/g, "'") : m[2].trim(), g: g }); }
		return out;
	}
	// shift the relative parts of the A1 references in a formula by (dr, dc) (conditional formatting formulas are written for the top-left cell)
	function shiftFormula(f, dr, dc) {
		if (!dr && !dc) return f;
		return String(f).replace(/("[^"]*")|(\b[A-Za-z_][\w.]*\()|(\$?)\b([A-Z]{1,3})(\$?)(\d+)\b/g, function (m, str, fn, ac, col, ar, row) {
			if (str || fn) return m;
			var c = colIndex(col), r = +row - 1;
			if (!ac) c += dc; if (!ar) r += dr;
			if (c < 0 || r < 0) return "#REF!";
			return ac + colName(c) + ar + (r + 1);
		});
	}

	/* ---------- sheet XML (sheetData scanned with regular expressions) ---------- */
	function parseSheet(s, styles) {
		var out = { pane: null, view: {}, cols: [], rowsHidden: [], rowXf: {}, cells: [], cf: [], cfRaw: [], tableRids: [], drawingRid: null, tabColor: null, defaultRowHeight: 15, merges: [] };
		var i0 = s.indexOf("<sheetData"), i1 = s.indexOf("</sheetData>");
		var selfClose = i0 >= 0 && i1 < 0;
		var head, tail, body = "";
		if (i0 < 0) { head = s; tail = ""; }
		else if (selfClose) { var e0 = s.indexOf(">", i0); head = s.slice(0, i0); tail = s.slice(e0 + 1); }
		else { head = s.slice(0, i0); body = s.slice(i0, i1); tail = s.slice(i1 + 12); }
		var hx = xml(head.replace(/<worksheet\b[^>]*>/, "<worksheet>") + "</worksheet>");
		var tc = path(hx, "sheetPr", "tabColor"); if (tc) out.tabColor = color(tc, styles && styles.theme, styles && styles.indexed);
		var sv = path(hx, "sheetViews", "sheetView");
		if (sv) {
			out.view = { showGridLines: sv.a.showGridLines !== "0" && sv.a.showGridLines !== "false", rtl: on(sv.a.rightToLeft), zoom: +(sv.a.zoomScale || 100), tabSelected: on(sv.a.tabSelected) };
			var pn = kid(sv, "pane");
			if (pn && (pn.a.state === "frozen" || pn.a.state === "frozenSplit")) out.pane = { r: Math.round(+(pn.a.ySplit || 0)), c: Math.round(+(pn.a.xSplit || 0)), top: pn.a.topLeftCell || "" };
		}
		var fp = kid(hx, "sheetFormatPr"); if (fp && fp.a.defaultRowHeight) out.defaultRowHeight = +fp.a.defaultRowHeight;
		kids(kid(hx, "cols"), "col").forEach(function (c) {
			out.cols.push({ min: +c.a.min - 1, max: +c.a.max - 1, width: c.a.width != null ? +c.a.width : null, hidden: on(c.a.hidden), style: c.a.style != null ? +c.a.style : null });
		});
		// rows and cells: hidden rows, row styles, cell style indexes ([r, c, xf] triples in a flat array)
		var rr = /<row\b([^>]*)>|<c\b([^>]*?)(\/?)>/g, m, row = -1, cells = [];
		while ((m = rr.exec(body))) {
			if (m[1] != null) {
				var ra = m[1], rn = /\br="(\d+)"/.exec(ra); row = rn ? +rn[1] - 1 : row + 1;
				if (/\bhidden="(1|true)"/.test(ra)) out.rowsHidden.push(row);
				var rs = /\bs="(\d+)"/.exec(ra); if (rs && /\bcustomFormat="(1|true)"/.test(ra)) out.rowXf[row] = +rs[1];
				continue;
			}
			var ca = m[2], cs = /\bs="(\d+)"/.exec(ca);
			if (!cs || cs[1] === "0") continue;
			var cr = /\br="([A-Z]+)(\d+)"/.exec(ca);
			var c = cr ? colIndex(cr[1]) : -1, r = cr ? +cr[2] - 1 : row;
			if (c >= 0) cells.push(r, c, +cs[1]);
		}
		out.cells = cells;
		var tx = xml("<worksheet>" + tail.replace(/<\/worksheet>\s*$/, "") + "</worksheet>");
		kids(kid(tx, "mergeCells"), "mergeCell").forEach(function (mc) { var g = parseRange(mc.a.ref); if (g) out.merges.push(g); });
		var cfRe = /<(?:\w+:)?conditionalFormatting\b[\s\S]*?<\/(?:\w+:)?conditionalFormatting>/g, cm;
		var tailNoExt = tail.replace(/<extLst>[\s\S]*<\/extLst>/, "");
		while ((cm = cfRe.exec(tailNoExt))) out.cfRaw.push(cm[0]);
		kids(tx, "conditionalFormatting").forEach(function (cf) {
			var ranges = sqref(cf.a.sqref);
			kids(cf, "cfRule").forEach(function (rule) { var p = parseRule(rule, styles); if (p) { p.ranges = ranges; out.cf.push(p); } });
		});
		var dr = kid(tx, "drawing"); if (dr) out.drawingRid = att(dr, "id");
		kids(kid(tx, "tableParts"), "tablePart").forEach(function (t) { out.tableRids.push(att(t, "id")); });
		return out;
	}
	function parseRule(n, styles) {
		var a = n.a, r = { type: a.type, priority: +(a.priority || 0), stop: on(a.stopIfTrue), op: a.operator, text: a.text, dxf: a.dxfId != null && styles ? styles.dxfs[+a.dxfId] || null : null,
			formulas: kids(n, "formula").map(function (f) { return f.t; }), rank: +(a.rank || 10), percent: on(a.percent), bottom: on(a.bottom), above: a.aboveAverage !== "0", equal: on(a.equalAverage), stdDev: +(a.stdDev || 0) };
		var th = styles && styles.theme;
		var cs = kid(n, "colorScale");
		if (cs) { r.cfvo = kids(cs, "cfvo").map(function (v) { return { type: v.a.type, val: v.a.val }; }); r.colors = kids(cs, "color").map(function (c) { return color(c, th, styles && styles.indexed) || "FFFFFF"; }); }
		var db = kid(n, "dataBar");
		if (db) { r.cfvo = kids(db, "cfvo").map(function (v) { return { type: v.a.type, val: v.a.val }; }); r.color = color(kid(db, "color"), th, styles && styles.indexed) || "638EC6"; r.showValue = db.a.showValue !== "0"; }
		if (kid(n, "iconSet")) r.type = "iconSet";
		return r;
	}

	/* ---------- drawings + charts ---------- */
	function anchorOf(a) {
		var pos = function (n) { return n ? { c: +txt0(kid(n, "col")), co: +txt0(kid(n, "colOff")) / EMU, r: +txt0(kid(n, "row")), ro: +txt0(kid(n, "rowOff")) / EMU } : null; };
		var out = { kind: a.n, from: pos(kid(a, "from")), to: pos(kid(a, "to")) };
		var ext = kid(a, "ext"); if (ext) out.ext = { w: +ext.a.cx / EMU, h: +ext.a.cy / EMU };
		var p = kid(a, "pos"); if (p) out.pos = { x: +p.a.x / EMU, y: +p.a.y / EMU };
		if (!out.ext) { var x = all(a, "xfrm")[0], e2 = x && kid(x, "ext"); if (e2 && e2.a.cx) out.ext = { w: +e2.a.cx / EMU, h: +e2.a.cy / EMU }; }
		return out;
	}
	function txt0(n) { return n ? n.t.trim() || "0" : "0"; }
	function parseDrawing(s, rels) {
		var x = xml(s), out = [], list = [];
		// Excel wraps newer objects in <mc:AlternateContent>: use the first anchor of the Choice, else of the Fallback
		x.c.forEach(function (a) { if (a.n === "AlternateContent") { var ch0 = kid(a, "Choice"), fb = kid(a, "Fallback"); var an = (ch0 && ch0.c.filter(function (y) { return /Anchor$/.test(y.n); })[0]) || (fb && fb.c.filter(function (y) { return /Anchor$/.test(y.n); })[0]); if (an) list.push(an); } else list.push(a); });
		list.forEach(function (a) {
			if (!/Anchor$/.test(a.n)) return;
			var an = anchorOf(a), ch = all(a, "chart")[0], pic = kid(a, "pic") || all(a, "pic")[0];
			var name = (all(a, "cNvPr")[0] || { a: {} }).a.name || "";
			var hidden = on((all(a, "cNvPr")[0] || { a: {} }).a.hidden);
			if (ch && att(ch, "id") && rels[att(ch, "id")]) out.push({ type: "chart", anchor: an, target: rels[att(ch, "id")].target, name: name, hidden: hidden });
			else if (pic) { var bl = all(pic, "blip")[0], id = bl && (att(bl, "embed")); if (id && rels[id]) out.push({ type: "pic", anchor: an, target: rels[id].target, name: name, hidden: hidden }); }
		});
		return out;
	}
	function richText(n) { if (!n) return ""; return all(n, "p").map(function (p) { return all(p, "t").map(function (t) { return t.t; }).join(""); }).join("\n"); }
	function dataRef(n) {
		if (!n) return null;
		var ref = kid(n, "numRef") || kid(n, "strRef") || kid(n, "multiLvlStrRef"), lit = kid(n, "numLit") || kid(n, "strLit");
		var src = ref || lit; if (!src && kid(n, "v")) return { f: null, cache: [kid(n, "v").t], fmt: null };
		if (!src) return null;
		var cache = kid(src, "numCache") || kid(src, "strCache") || kid(src, "multiLvlStrCache") || src, pts = [], cnt = +(val(kid(cache, "ptCount")) || 0);
		all(cache, "pt").forEach(function (p) { var i = +p.a.idx, v = kid(p, "v"); if (v) pts[i] = v.t; });
		if (cnt > pts.length) pts.length = cnt;
		var fc = kid(cache, "formatCode");
		return { f: ref && kid(ref, "f") ? kid(ref, "f").t : null, cache: pts, fmt: fc ? fc.t : null, num: src.n === "numRef" || src.n === "numLit" };
	}
	var CHART_TYPES = { barChart: "bar", bar3DChart: "bar", lineChart: "line", line3DChart: "line", areaChart: "area", area3DChart: "area", pieChart: "pie", pie3DChart: "pie", ofPieChart: "pie", doughnutChart: "doughnut", scatterChart: "scatter", bubbleChart: "scatter", radarChart: "radar", stockChart: "line" };
	function serColor(ser, theme) {
		var sp = kid(ser, "spPr"); if (!sp) return {};
		var o = {}, sf = kid(sp, "solidFill"), ln = kid(sp, "ln");
		if (sf) o.fill = dmlColor(sf, theme);
		if (kid(sp, "noFill")) o.noFill = true;
		if (ln) { var lf = kid(ln, "solidFill"); if (lf) o.line = dmlColor(lf, theme); if (kid(ln, "noFill")) o.noLine = true; if (ln.a.w) o.lw = +ln.a.w / 12700; }
		var gf = kid(sp, "gradFill"); if (gf && !o.fill) { var gs = all(gf, "gs")[0]; if (gs) o.fill = dmlColor(gs, theme); }
		return o;
	}
	function parseChart(s, theme) {
		var x = xml(s), ch = kid(x, "chart");
		if (!ch) return null;
		var out = { title: null, autoDel: on(val(kid(ch, "autoTitleDeleted"))), legend: null, plots: [], axes: {}, visOnly: val(kid(ch, "plotVisOnly")) !== "0" };
		var t = kid(ch, "title");
		if (t) { out.title = richText(path(t, "tx", "rich")) || null; var tr = path(t, "tx", "strRef"); if (tr) out.titleRef = dataRef(path(t, "tx")); if (!out.title && !tr) out.title = ""; }
		var lg = kid(ch, "legend"); if (lg) out.legend = val(kid(lg, "legendPos")) || "r";
		var cs = kid(x, "spPr"); if (cs) { var csf = kid(cs, "solidFill"); if (csf) out.bg = dmlColor(csf, theme); if (kid(cs, "noFill")) out.noBg = true; }
		var pa = kid(ch, "plotArea"); if (!pa) return out;
		pa.c.forEach(function (p) {
			var type = CHART_TYPES[p.n];
			if (type) {
				var dl = kid(p, "dLbls");
				var plot = { type: type, dir: val(kid(p, "barDir")) || "col", grouping: val(kid(p, "grouping")) || (type === "bar" ? "clustered" : "standard"), vary: on(val(kid(p, "varyColors"))),
					hole: +(val(kid(p, "holeSize")) || (type === "doughnut" ? 50 : 0)), axes: kids(p, "axId").map(function (a) { return a.a.val; }), gap: +(val(kid(p, "gapWidth")) || 150), overlap: +(val(kid(p, "overlap")) || 0),
					style: val(kid(p, "scatterStyle")) || val(kid(p, "radarStyle")) || "", labels: dl ? { val: on(val(kid(dl, "showVal"))), pct: on(val(kid(dl, "showPercent"))), cat: on(val(kid(dl, "showCatName"))) } : null,
					firstAngle: +(val(kid(p, "firstSliceAng")) || 0), series: [] };
				if (type === "bar" && plot.grouping !== "clustered" && !kid(p, "overlap")) plot.overlap = 100;
				kids(p, "ser").forEach(function (sr) {
					var sdl = kid(sr, "dLbls"), mk = kid(sr, "marker");
					var se = { idx: +(val(kid(sr, "idx")) || 0), order: +(val(kid(sr, "order")) || 0), name: dataRef(kid(sr, "tx")), cat: dataRef(kid(sr, "cat")), val: dataRef(kid(sr, "val")), x: dataRef(kid(sr, "xVal")), y: dataRef(kid(sr, "yVal")),
						smooth: on(val(kid(sr, "smooth"))), marker: mk ? (val(kid(mk, "symbol")) || "auto") : null, look: serColor(sr, theme),
						pts: kids(sr, "dPt").map(function (d) { return { idx: +val(kid(d, "idx")), look: serColor(d, theme) }; }),
						labels: sdl ? { val: on(val(kid(sdl, "showVal"))), pct: on(val(kid(sdl, "showPercent"))), cat: on(val(kid(sdl, "showCatName"))) } : null };
					if (mk && kid(mk, "spPr")) { var mlook = serColor(mk, theme); se.markerFill = mlook.fill; }
					if (se.y && !se.val) se.val = se.y;
					plot.series.push(se);
				});
				plot.series.sort(function (a, b) { return a.order - b.order; });
				out.plots.push(plot);
				return;
			}
			if (/Ax$/.test(p.n)) {
				var id = val(kid(p, "axId")), sc = kid(p, "scaling"), nf = kid(p, "numFmt"), at = kid(p, "title");
				out.axes[id] = { id: id, kind: p.n.replace(/Ax$/, ""), pos: val(kid(p, "axPos")) || "b", deleted: on(val(kid(p, "delete"))), cross: val(kid(p, "crossAx")),
					min: sc && kid(sc, "min") ? +val(kid(sc, "min")) : null, max: sc && kid(sc, "max") ? +val(kid(sc, "max")) : null, rev: sc && val(kid(sc, "orientation")) === "maxMin",
					log: sc && kid(sc, "logBase") ? +val(kid(sc, "logBase")) : null, grid: !!kid(p, "majorGridlines"), fmt: nf ? nf.a.formatCode : null, linked: nf ? on(nf.a.sourceLinked) : true,
					title: at ? richText(path(at, "tx", "rich")) || "" : null, crosses: val(kid(p, "crosses")) || null, lbl: val(kid(p, "tickLblPos")) || "nextTo" };
			}
		});
		return out;
	}

	/* ---------- the whole package ---------- */
	// -> Promise<{u8, theme, fonts, styles, sheets: [{name, state, part, rels, ...parseSheet, tables, objects}], ct (content types)}>
	function readPackage(u8, inflate, opt) {
		opt = opt || {};
		var z = unzip(u8), T = function (n) { return entryText(z, n, inflate); };
		var model = { u8: u8, zip: z, sheets: [], media: {} };
		return T("_rels/.rels").then(function (r0) {
			var rr = parseRels(r0, ""), wbPart = "xl/workbook.xml";
			for (var k in rr) if (rr[k].type === "officeDocument") wbPart = rr[k].target;
			model.wbPart = wbPart;
			return Promise.all([T(wbPart), T(relsPath(wbPart)), T("[Content_Types].xml")]);
		}).then(function (r) {
			var wx = xml(r[0] || "<workbook/>"), wrel = parseRels(r[1], model.wbPart);
			model.ct = r[2] || "";
			model.wbRels = wrel;
			var themeT = null, stylesT = null;
			for (var k in wrel) { if (wrel[k].type === "theme") themeT = wrel[k].target; if (wrel[k].type === "styles") stylesT = wrel[k].target; }
			model.themePart = themeT; model.stylesPart = stylesT;
			kids(kid(wx, "sheets"), "sheet").forEach(function (s) { var rel = wrel[att(s, "id")]; model.sheets.push({ name: s.a.name, state: s.a.state || "visible", part: rel ? rel.target : null }); });
			return Promise.all([themeT ? T(themeT) : null, stylesT ? T(stylesT) : null]);
		}).then(function (r) {
			var th = parseTheme(r[0]);
			model.theme = th.colors; model.fonts = th.fonts; model.themeRaw = r[0];
			model.styles = parseStyles(r[1], model.theme); model.styles.theme = model.theme;
			return Promise.all(model.sheets.map(function (sh) {
				if (!sh.part) return null;
				return Promise.all([T(sh.part), T(relsPath(sh.part))]).then(function (x) {
					if (x[0] == null) return;
					var big = x[0].length > (opt.maxSheetChars || 80e6);
					Object.assign(sh, parseSheet(big ? x[0].replace(/<sheetData[\s\S]*<\/sheetData>/, "<sheetData/>") : x[0], model.styles));
					sh.rels = parseRels(x[1], sh.part); sh.relsRaw = x[1];
					sh.tables = []; sh.objects = [];
					var jobs = sh.tableRids.map(function (id) { var rel = sh.rels[id]; if (!rel) return null; return T(rel.target).then(function (s) { if (!s) return; var t = parseTable(s); if (t) { t.part = rel.target; t.els = tableElements(t, model.styles, model.theme); sh.tables.push(t); } }); });
					var drel = sh.drawingRid && sh.rels[sh.drawingRid];
					if (drel) { sh.drawingPart = drel.target; jobs.push(Promise.all([T(drel.target), T(relsPath(drel.target))]).then(function (d) {
						if (!d[0]) return;
						var objs = parseDrawing(d[0], parseRels(d[1], drel.target));
						return Promise.all(objs.map(function (o) {
							if (o.type === "chart") return T(o.target).then(function (cs) { try { o.chart = cs ? parseChart(cs, model.theme) : null; } catch (e) { o.chart = null; } if (o.chart) sh.objects.push(o); });
							if (o.type === "pic") return entryBytes(z, o.target, inflate).then(function (b) { if (b) { o.bytes = b; o.mime = /\.png$/i.test(o.target) ? "image/png" : /\.gif$/i.test(o.target) ? "image/gif" : /\.svg$/i.test(o.target) ? "image/svg+xml" : /\.(jpe?g)$/i.test(o.target) ? "image/jpeg" : /\.emf$/i.test(o.target) ? "" : "image/" + (o.target.split(".").pop() || "png"); if (o.mime) sh.objects.push(o); } });
						}));
					})); }
					return Promise.all(jobs);
				});
			}));
		}).then(function () { return model; });
	}

	/* ---------- looks -> CSS ---------- */
	function mergeLook(base, top) { if (!top) return base; if (!base) return top; var o = Object.assign({}, base); for (var k in top) { if (k === "bd") o.bd = Object.assign({}, base.bd || {}, top.bd); else if (top[k] != null) o[k] = top[k]; } return o; }
	function lightFor(h) { var x = toHls(h); return fromHls(x[0], Math.max(0.72, 1 - x[1]), x[2]); }
	// look -> {css, fill: bool}. dark: page in dark mode (dark text with no fill under it is lightened so it stays readable)
	function lookCss(L, dark) {
		if (!L) return { css: "", fill: false, ha: null };
		var css = "", fill = L.fill && L.fill.c, fg = L.color;
		if (fill) {
			if (L.fill.grad && L.fill.grad.length > 1) css += "background:linear-gradient(" + (90 + (L.fill.deg || 0)) + "deg,#" + L.fill.grad.join(",#") + ");";
			else css += "background:#" + fill + ";";
			if (!fg) fg = luminance(fill) < 0.22 ? "FFFFFF" : "111111";
		} else if (fg && dark && luminance(fg) < 0.12) fg = lightFor(fg);
		if (fg) css += "color:#" + fg + ";";
		if (L.b) css += "font-weight:700;";
		if (L.i) css += "font-style:italic;";
		if (L.u || L.s) css += "text-decoration:" + (L.u ? "underline " : "") + (L.s ? "line-through" : "") + ";";
		if (L.sz && L.sz !== 11) css += "font-size:" + Math.max(7, Math.min(20, L.sz * 96 / 72 * 0.92)).toFixed(1) + "px;";
		if (L.font && !/^(Calibri|Aptos( Narrow)?|Arial)$/i.test(L.font)) css += "font-family:'" + L.font.replace(/'/g, "") + "',Calibri,Carlito,sans-serif;";
		if (L.ha) { var ha = { center: "center", centerContinuous: "center", right: "right", left: "left", justify: "justify", distributed: "center", fill: "left" }[L.ha]; if (ha) css += "text-align:" + ha + ";"; }
		if (L.indent) css += "padding-left:" + (4 + L.indent * 9) + "px;";
		if (L.bd) {
			var sh = [], b = L.bd, col = function (e) { var c = e.c || "000000"; if (dark && !fill && luminance(c) < 0.05) c = "9AA59E"; return "#" + c; };
			if (b.l) sh.push("inset " + b.l.w + "px 0 0 0 " + col(b.l));
			if (b.r) sh.push("inset -" + b.r.w + "px 0 0 0 " + col(b.r));
			if (b.t) sh.push("inset 0 " + b.t.w + "px 0 0 " + col(b.t));
			if (b.b) sh.push("inset 0 -" + b.b.w + "px 0 0 " + col(b.b));
			if (sh.length) css += "box-shadow:" + sh.join(",") + ";";
		}
		return { css: css, fill: !!fill, ha: L.ha || null, wrap: !!L.wrap, va: L.vaAlign || null, shadow: !!(L.bd && (L.bd.l || L.bd.r || L.bd.t || L.bd.b)) };
	}

	/* ---------- conditional formatting ---------- */
	function isNum(v) { return typeof v === "number" && isFinite(v); }
	function percentileOf(sorted, p) { if (!sorted.length) return 0; var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
	// stats over a rule's ranges; value(r, c) -> cell value
	function ruleStats(rule, value) {
		var nums = [], counts = new Map(), cap = 400000, n = 0;
		rule.ranges.forEach(function (g) {
			for (var r = g.s.r; r <= Math.min(g.e.r, g.s.r + 100000); r++) for (var c = g.s.c; c <= Math.min(g.e.c, g.s.c + 200); c++) {
				if (++n > cap) return;
				var v = value(r, c);
				if (isNum(v)) nums.push(v);
				if (v != null && v !== "") { var k = typeof v === "string" ? "s" + v.toLowerCase() : "n" + v; counts.set(k, (counts.get(k) || 0) + 1); }
			}
		});
		var sorted = nums.slice().sort(function (a, b) { return a - b; }), sum = 0; nums.forEach(function (v) { sum += v; });
		var mean = nums.length ? sum / nums.length : 0, sd = 0;
		if (nums.length > 1) { var q = 0; nums.forEach(function (v) { q += (v - mean) * (v - mean); }); sd = Math.sqrt(q / (nums.length - 1)); }
		return { sorted: sorted, mean: mean, sd: sd, counts: counts, min: sorted[0], max: sorted[sorted.length - 1] };
	}
	function cfvoValue(v, st, evalF) {
		if (!v) return null;
		switch (v.type) {
			case "min": return st.min; case "max": return st.max;
			case "num": return +v.val;
			case "percent": return st.min + (st.max - st.min) * (+v.val / 100);
			case "percentile": return percentileOf(st.sorted, +v.val / 100);
			case "formula": { var x = evalF ? evalF(v.val, 0, 0) : +v.val; return isNum(x) ? x : +v.val; }
			case "autoMin": return Math.min(0, st.min); case "autoMax": return Math.max(0, st.max);
		}
		return null;
	}
	function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
	function inRanges(rule, r, c) { for (var i = 0; i < rule.ranges.length; i++) { var g = rule.ranges[i]; if (r >= g.s.r && r <= g.e.r && c >= g.s.c && c <= g.e.c) return g; } return null; }
	// -> {look, bar: {pct, color}} | null.  ctx: {value(r,c), text(r,c), stats(rule), evalF(formula, dr, dc) -> value}
	function cfFor(rules, r, c, ctx) {
		var look = null, bar = null, done = {};
		for (var i = 0; i < rules.length; i++) {
			var R = rules[i], g = inRanges(R, r, c);
			if (!g) continue;
			var v = ctx.value(r, c), hit = false;
			switch (R.type) {
				case "cellIs": {
					var a = ctx.evalF(R.formulas[0], r - g.s.r, c - g.s.c, g), b = R.formulas[1] != null ? ctx.evalF(R.formulas[1], r - g.s.r, c - g.s.c, g) : null;
					if (v == null || v === "") v = isNum(a) ? 0 : "";
					var cmp = function (x, y) { if (typeof x === "string" || typeof y === "string") { x = String(x).toLowerCase(); y = String(y == null ? "" : y).toLowerCase(); } return x < y ? -1 : x > y ? 1 : 0; };
					var k = cmp(v, a);
					hit = { equal: k === 0, notEqual: k !== 0, greaterThan: k > 0, greaterThanOrEqual: k >= 0, lessThan: k < 0, lessThanOrEqual: k <= 0,
						between: b != null && cmp(v, Math.min(a, b)) >= 0 && cmp(v, Math.max(a, b)) <= 0, notBetween: b != null && (cmp(v, Math.min(a, b)) < 0 || cmp(v, Math.max(a, b)) > 0) }[R.op] || false;
					break;
				}
				case "containsText": hit = ctx.text(r, c).toLowerCase().indexOf(String(R.text || "").toLowerCase()) >= 0; break;
				case "notContainsText": hit = ctx.text(r, c).toLowerCase().indexOf(String(R.text || "").toLowerCase()) < 0; break;
				case "beginsWith": hit = ctx.text(r, c).toLowerCase().indexOf(String(R.text || "").toLowerCase()) === 0; break;
				case "endsWith": { var tx = ctx.text(r, c).toLowerCase(), q = String(R.text || "").toLowerCase(); hit = tx.length >= q.length && tx.slice(tx.length - q.length) === q; break; }
				case "containsBlanks": hit = v == null || String(v).trim() === ""; break;
				case "notContainsBlanks": hit = !(v == null || String(v).trim() === ""); break;
				case "containsErrors": hit = /^#/.test(ctx.text(r, c)) && ctx.isErr(r, c); break;
				case "notContainsErrors": hit = !ctx.isErr(r, c); break;
				case "top10": {
					if (!isNum(v)) break;
					var s = ctx.stats(R), n = R.percent ? Math.max(1, Math.floor(s.sorted.length * R.rank / 100)) : R.rank;
					if (!s.sorted.length) break;
					hit = R.bottom ? v <= s.sorted[Math.min(n, s.sorted.length) - 1] : v >= s.sorted[Math.max(0, s.sorted.length - n)];
					break;
				}
				case "aboveAverage": {
					if (!isNum(v)) break;
					var s2 = ctx.stats(R), lim = s2.mean + (R.stdDev ? (R.above ? 1 : -1) * R.stdDev * s2.sd : 0);
					hit = R.above ? (R.equal ? v >= lim : v > lim) : (R.equal ? v <= lim : v < lim);
					break;
				}
				case "duplicateValues": case "uniqueValues": {
					if (v == null || v === "") break;
					var cnt = ctx.stats(R).counts.get(typeof v === "string" ? "s" + v.toLowerCase() : "n" + v) || 0;
					hit = R.type === "duplicateValues" ? cnt > 1 : cnt === 1;
					break;
				}
				case "expression": { var x = ctx.evalF(R.formulas[0], r - g.s.r, c - g.s.c, g); hit = x === true || (isNum(x) && x !== 0); break; }
				case "colorScale": {
					if (!isNum(v) || done.scale) break;
					var s3 = ctx.stats(R), pts = R.cfvo.map(function (o) { return cfvoValue(o, s3, ctx.evalF); }), cols = R.colors, out;
					if (pts.length === 2) { var t = pts[1] === pts[0] ? 0.5 : (v - pts[0]) / (pts[1] - pts[0]); out = mix(cols[0], cols[1], Math.max(0, Math.min(1, t))); }
					else { if (v <= pts[1]) { var t1 = pts[1] === pts[0] ? 1 : (v - pts[0]) / (pts[1] - pts[0]); out = mix(cols[0], cols[1], Math.max(0, Math.min(1, t1))); } else { var t2 = pts[2] === pts[1] ? 0 : (v - pts[1]) / (pts[2] - pts[1]); out = mix(cols[1], cols[2], Math.max(0, Math.min(1, t2))); } }
					done.scale = true; if (!look || !look.fill) look = mergeLook({ fill: { c: out } }, look);
					continue;
				}
				case "dataBar": {
					if (!isNum(v) || bar) break;
					var s4 = ctx.stats(R), lo = cfvoValue(R.cfvo[0], s4, ctx.evalF), hi = cfvoValue(R.cfvo[1], s4, ctx.evalF);
					if (lo == null) lo = s4.min; if (hi == null) hi = s4.max;
					var p = hi === lo ? 1 : (v - lo) / (hi - lo);
					bar = { pct: Math.max(0.03, Math.min(1, p)) * 100, color: R.color, hideValue: R.showValue === false };
					continue;
				}
			}
			if (hit && R.dxf) { look = mergeLook(R.dxf, look); }
			if (hit && R.stop) break;
		}
		return look || bar ? { look: look, bar: bar } : null;
	}

	/* ---------- chart SVG ---------- */
	var PALETTE_K = [4, 5, 6, 7, 8, 9];
	function seriesColor(i, theme) {
		var T = theme || DEFAULT_THEME, base = T[PALETTE_K[i % 6]], round = Math.floor(i / 6);
		return round === 0 ? base : round === 1 ? lumMod(base, 0.6, 0) : round === 2 ? lumMod(base, 0.8, 0.2) : lumMod(base, 0.5, 0);
	}
	function nice(lo, hi, n) {
		if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
		if (lo === hi) { if (lo === 0) hi = 1; else if (lo > 0) lo = 0; else hi = 0; }
		var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = n / span * step;
		if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
		var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
		var ticks = []; for (var v = a; v <= b + step / 2; v += step) ticks.push(+v.toPrecision(12));
		return { lo: a, hi: b, step: step, ticks: ticks };
	}
	function fmtShort(v) {
		if (!isNum(v)) return "";
		var a = Math.abs(v);
		if (a >= 1e9) return +(v / 1e9).toPrecision(3) + "B"; if (a >= 1e6) return +(v / 1e6).toPrecision(3) + "M"; if (a >= 1e4) return +(v / 1e3).toPrecision(3) + "K";
		return String(+v.toPrecision(6));
	}
	function svgEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function clipText(s, maxCh) { s = String(s == null ? "" : s); return s.length > maxCh ? s.slice(0, Math.max(1, maxCh - 1)) + "…" : s; }
	// data: {title, plots: [{type, ..., series: [{name, color, values: [num|null], cats: [str], xs: [num]}]}]} built by the page from parseChart + live cells
	// opts: {w, h, dark, fmt(v, code) -> text, theme}
	function chartSvg(ch, data, opts) {
		var W = Math.max(60, opts.w), H = Math.max(40, opts.h), dark = !!opts.dark, fmt = opts.fmt || function (v) { return fmtShort(v); };
		var bg = ch.noBg ? "none" : (ch.bg ? "#" + ch.bg : (dark ? "#20262299" : "#ffffff"));
		if (ch.bg && dark) bg = "#" + ch.bg;
		var ink = ch.bg ? (luminance(ch.bg) < 0.3 ? "#e8ece9" : "#404040") : (dark ? "#d5ddd7" : "#404040"), mute = ch.bg ? ink : (dark ? "#9aa59e" : "#595959"), gridC = dark && !ch.bg ? "#3a443d" : "#d9d9d9";
		var o = [], fs = Math.max(9, Math.min(13, Math.round(Math.min(W, H) / 26)));
		o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" font-family="Calibri,Carlito,Segoe UI,sans-serif" font-size="' + fs + '">');
		o.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" fill="' + bg + '" stroke="' + (dark ? "#3a443d" : "#d9d9d9") + '" rx="2"/>');
		var top = 8, left = 10, right = W - 10, bottom = H - 8;
		var title = data.title;
		if (title) { var tfs = Math.round(fs * 1.35); o.push('<text x="' + W / 2 + '" y="' + (top + tfs) + '" text-anchor="middle" font-size="' + tfs + '" fill="' + ink + '">' + svgEsc(clipText(title, Math.floor(W / (tfs * 0.52)))) + "</text>"); top += tfs + 8; }
		var plots = data.plots.filter(function (p) { return p.series.length; });
		if (!plots.length) { o.push('<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="' + mute + '">(no data)</text></svg>'); return o.join(""); }
		var isPie = plots[0].type === "pie" || plots[0].type === "doughnut";
		// legend
		var items = [];
		if (ch.legend) {
			if (isPie) { var p0 = plots[0], s0 = p0.series[0]; (s0.cats || []).forEach(function (c, i) { if (s0.values[i] != null) items.push({ name: c, color: s0.ptColors[i] }); }); }
			else plots.forEach(function (p) { p.series.forEach(function (s) { items.push({ name: s.name, color: s.color, line: p.type === "line" || p.type === "scatter" || p.type === "radar" }); }); });
		}
		var lp = ch.legend;
		if (items.length) {
			var maxW = Math.min(W * 0.32, 12 + fs * 0.55 * Math.max.apply(null, items.map(function (it) { return String(it.name).length; })) + 14);
			if (lp === "r" || lp === "l" || lp === "tr") {
				var lx = lp === "l" ? left : right - maxW, ly0 = (top + bottom) / 2 - items.length * (fs + 5) / 2;
				items.slice(0, Math.floor((bottom - top) / (fs + 5))).forEach(function (it, i) { var y = Math.max(top, ly0) + i * (fs + 5); o.push(legendItem(lx, y, it, fs, ink, Math.floor((maxW - 18) / (fs * 0.55)))); });
				if (lp === "l") left += maxW + 6; else right -= maxW + 6;
			} else {
				var rowY = lp === "t" ? top + 2 : bottom - fs - 2, x = left, perRow = [];
				var widths = items.map(function (it) { return 18 + Math.min(String(it.name).length, 28) * fs * 0.55 + 10; }), total = widths.reduce(function (a, b) { return a + b; }, 0);
				x = Math.max(left, (W - total) / 2);
				items.forEach(function (it, i) { if (x + widths[i] > right && perRow.length) return; o.push(legendItem(x, rowY, it, fs, ink, 28)); x += widths[i]; perRow.push(i); });
				if (lp === "t") top += fs + 10; else bottom -= fs + 10;
			}
		}
		if (isPie) { o.push(pieSvg(plots[0], left, top, right, bottom, ink, fs, fmt, bg)); o.push("</svg>"); return o.join(""); }
		if (plots[0].type === "radar") { o.push(radarSvg(plots[0], left, top, right, bottom, ink, mute, gridC, fs, fmt)); o.push("</svg>"); return o.join(""); }
		// value scales: primary + optional secondary
		var axisOf = function (p, kind) { var ax = p.axes.map(function (id) { return ch.axes[id]; }).filter(Boolean); return ax.filter(function (a) { return kind === "val" ? a.kind === "val" : a.kind !== "val"; })[0] || (kind === "val" ? ax[ax.length - 1] : ax[0]) || {}; };
		var scatter = plots[0].type === "scatter", horiz = plots[0].type === "bar" && plots[0].dir === "bar";
		var prim = axisOf(plots[0], "val"), groups = [{ ax: prim, plots: [] }, { ax: null, plots: [] }];
		plots.forEach(function (p) { var va = axisOf(p, "val"); if (va && prim && va.id !== prim.id && p !== plots[0]) { groups[1].ax = va; groups[1].plots.push(p); } else groups[0].plots.push(p); });
		var extent = function (g) {
			var lo = Infinity, hi = -Infinity;
			g.plots.forEach(function (p) {
				var n = Math.max.apply(null, p.series.map(function (s) { return s.values.length; }));
				if ((p.grouping === "stacked" || p.grouping === "percentStacked") && p.type !== "scatter") {
					for (var i = 0; i < n; i++) { var pos = 0, neg = 0; p.series.forEach(function (s) { var v = s.values[i]; if (isNum(v)) { if (v >= 0) pos += v; else neg += v; } }); if (p.grouping === "percentStacked") { lo = Math.min(lo, neg < 0 ? -100 : 0); hi = Math.max(hi, pos > 0 ? 100 : 0); } else { lo = Math.min(lo, neg); hi = Math.max(hi, pos); } }
				} else p.series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
			});
			if (lo === Infinity) { lo = 0; hi = 1; }
			var bars = g.plots.some(function (p) { return p.type === "bar" || p.type === "area"; });
			if (bars || lo > 0 && lo < hi * 0.6) lo = Math.min(lo, 0);
			if (g.ax && g.ax.min != null) lo = g.ax.min; if (g.ax && g.ax.max != null) hi = g.ax.max;
			var nc = nice(lo, hi, Math.max(3, Math.min(8, Math.floor((horiz ? right - left : bottom - top) / 42))));
			if (g.ax && g.ax.min != null) nc.lo = g.ax.min; if (g.ax && g.ax.max != null) nc.hi = g.ax.max;
			nc.ticks = nc.ticks.filter(function (t) { return t >= nc.lo - 1e-9 && t <= nc.hi + 1e-9; });
			return nc;
		};
		var sc0 = extent(groups[0]), sc1 = groups[1].plots.length ? extent(groups[1]) : null;
		var pct0 = groups[0].plots.some(function (p) { return p.grouping === "percentStacked"; });
		var axFmt = function (ax, pct) { return function (v) { if (pct) return Math.round(v) + "%"; return ax && ax.fmt && ax.fmt !== "General" && !ax.linked ? fmt(v, ax.fmt) : (ax && ax.fmt && ax.fmt !== "General" ? fmt(v, ax.fmt) : fmtShort(v)); }; };
		var f0 = axFmt(prim, pct0), f1 = sc1 ? axFmt(groups[1].ax, false) : null;
		// categories
		var cats = [], nCat = 0;
		plots.forEach(function (p) { p.series.forEach(function (s) { nCat = Math.max(nCat, s.values.length); if (!cats.length && s.cats && s.cats.length) cats = s.cats; }); });
		var xsc = null;
		if (scatter) { var xl = Infinity, xh = -Infinity; plots[0].series.forEach(function (s) { (s.xs || []).forEach(function (v) { if (isNum(v)) { xl = Math.min(xl, v); xh = Math.max(xh, v); } }); }); if (xl === Infinity) { xl = 1; xh = nCat; } var xa = axisOf(plots[0], "cat"); if (xa.min != null) xl = xa.min; if (xa.max != null) xh = xa.max; xsc = nice(xl, xh, Math.max(3, Math.floor((right - left) / 70))); }
		var valAxW = Math.max.apply(null, sc0.ticks.map(function (t) { return String(f0(t)).length; })) * fs * 0.55 + 8;
		var catLabelW = horiz ? Math.min(W * 0.3, Math.max.apply(null, [3].concat(cats.map(function (c) { return String(c == null ? "" : c).length; }))) * fs * 0.55 + 8) : 0;
		var vTitle = prim && prim.title, cTitle = (axisOf(plots[0], "cat") || {}).title;
		if (vTitle && !horiz) left += fs + 6; if (cTitle && !horiz) bottom -= fs + 6;
		if (vTitle && horiz) bottom -= fs + 6; if (cTitle && horiz) left += fs + 6;
		var pl = left + (horiz ? catLabelW : (prim && prim.deleted ? 4 : valAxW)), pr = right - (sc1 ? Math.max.apply(null, sc1.ticks.map(function (t) { return String(f1(t)).length; })) * fs * 0.55 + 8 : 6), pt = top + 4, pb = bottom - (horiz ? fs + 6 : (fs + 8));
		var rotate = false;
		if (!horiz && !scatter && nCat) { var slot = (pr - pl) / nCat, longest = Math.max.apply(null, [1].concat(cats.map(function (c) { return String(c == null ? "" : c).length; }))); if (longest * fs * 0.55 > slot * 1.05) { rotate = true; pb -= Math.min(H * 0.25, longest * fs * 0.4); } }
		if (pr - pl < 20 || pb - pt < 20) { o.push("</svg>"); return o.join(""); }
		var vy = function (sc, v) { var t = (v - sc.lo) / (sc.hi - sc.lo || 1); return horiz ? pl + t * (pr - pl) : pb - t * (pb - pt); };
		// grid + value axis labels
		sc0.ticks.forEach(function (t) {
			var p = vy(sc0, t);
			if (!prim || prim.grid !== false) { if (horiz) o.push('<line x1="' + p + '" y1="' + pt + '" x2="' + p + '" y2="' + pb + '" stroke="' + gridC + '"/>'); else if (!prim || prim.grid) o.push('<line x1="' + pl + '" y1="' + p + '" x2="' + pr + '" y2="' + p + '" stroke="' + gridC + '"/>'); }
			if (prim && prim.deleted) return;
			if (horiz) o.push('<text x="' + p + '" y="' + (pb + fs + 3) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(f0(t)) + "</text>");
			else o.push('<text x="' + (pl - 5) + '" y="' + (p + fs * 0.35) + '" text-anchor="end" fill="' + mute + '">' + svgEsc(f0(t)) + "</text>");
		});
		if (sc1) sc1.ticks.forEach(function (t) { var p = vy(sc1, t); o.push('<text x="' + (pr + 5) + '" y="' + (p + fs * 0.35) + '" fill="' + mute + '">' + svgEsc(f1(t)) + "</text>"); });
		var zeroY = vy(sc0, Math.max(sc0.lo, Math.min(sc0.hi, 0)));
		if (horiz) o.push('<line x1="' + zeroY + '" y1="' + pt + '" x2="' + zeroY + '" y2="' + pb + '" stroke="' + mute + '" stroke-width="0.8"/>');
		else o.push('<line x1="' + pl + '" y1="' + zeroY + '" x2="' + pr + '" y2="' + zeroY + '" stroke="' + mute + '" stroke-width="0.8"/>');
		if (vTitle) { if (horiz) o.push('<text x="' + (pl + pr) / 2 + '" y="' + (H - 8) + '" text-anchor="middle" fill="' + ink + '">' + svgEsc(vTitle) + "</text>"); else o.push('<text transform="translate(' + (left - 4) + "," + (pt + pb) / 2 + ') rotate(-90)" text-anchor="middle" fill="' + ink + '">' + svgEsc(vTitle) + "</text>"); }
		if (cTitle) { if (horiz) o.push('<text transform="translate(' + (left - 4) + "," + (pt + pb) / 2 + ') rotate(-90)" text-anchor="middle" fill="' + ink + '">' + svgEsc(cTitle) + "</text>"); else o.push('<text x="' + (pl + pr) / 2 + '" y="' + (H - 8) + '" text-anchor="middle" fill="' + ink + '">' + svgEsc(cTitle) + "</text>"); }
		// category axis
		var slotW = nCat ? (horiz ? pb - pt : pr - pl) / nCat : 1;
		var catRev = !!(axisOf(plots[0], "cat") || {}).rev;
		// horizontal bars: the first category sits at the bottom, like Excel (unless the axis is reversed)
		var catPos = function (i, area) { if (horiz) return catRev ? pt + (i + 0.5) * slotW : pb - (i + 0.5) * slotW; return area ? pl + (nCat > 1 ? i * (pr - pl) / (nCat - 1) : (pr - pl) / 2) : pl + (i + 0.5) * slotW; };
		var lineMode = plots.every(function (p) { return p.type === "line" || p.type === "area"; }) && plots.some(function (p) { return p.type === "area"; });
		if (scatter) {
			xsc.ticks.forEach(function (t) { var x = pl + (t - xsc.lo) / (xsc.hi - xsc.lo || 1) * (pr - pl); o.push('<text x="' + x + '" y="' + (pb + fs + 3) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(fmtShort(t)) + "</text>"); if ((axisOf(plots[0], "cat") || {}).grid) o.push('<line x1="' + x + '" y1="' + pt + '" x2="' + x + '" y2="' + pb + '" stroke="' + gridC + '"/>'); });
		} else if (!(axisOf(plots[0], "cat") || {}).deleted) {
			var every = Math.max(1, Math.ceil(nCat / Math.max(1, Math.floor((horiz ? pb - pt : pr - pl) / (rotate ? fs * 1.3 : fs * 2.2)))));
			for (var ci = 0; ci < nCat; ci += every) {
				var lab = cats[ci] != null ? cats[ci] : String(ci + 1), cp = catPos(ci, lineMode);
				if (horiz) o.push('<text x="' + (pl - 5) + '" y="' + (cp + fs * 0.35) + '" text-anchor="end" fill="' + mute + '">' + svgEsc(clipText(lab, Math.floor(catLabelW / (fs * 0.55)))) + "</text>");
				else if (rotate) o.push('<text transform="translate(' + (cp + fs * 0.3) + "," + (pb + 6) + ') rotate(-45)" text-anchor="end" fill="' + mute + '">' + svgEsc(clipText(lab, 18)) + "</text>");
				else o.push('<text x="' + cp + '" y="' + (pb + fs + 3) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(clipText(lab, Math.max(3, Math.floor(slotW * every / (fs * 0.55))))) + "</text>");
			}
		}
		// series
		groups.forEach(function (g, gi) {
			var sc = gi ? sc1 : sc0; if (!sc) return;
			var barPlots = g.plots.filter(function (p) { return p.type === "bar"; });
			barPlots.forEach(function (p) {
				var stacked = p.grouping === "stacked" || p.grouping === "percentStacked", ns = p.series.length, inner = slotW / (1 + p.gap / 100);
				var bw = stacked ? inner : inner / Math.max(1, ns - (ns - 1) * Math.max(0, p.overlap) / 100), posS = [], negS = [];
				p.series.forEach(function (s, si) {
					for (var i = 0; i < s.values.length; i++) {
						var v = s.values[i]; if (!isNum(v)) continue;
						var tot = 0; if (p.grouping === "percentStacked") p.series.forEach(function (x) { if (isNum(x.values[i])) tot += Math.abs(x.values[i]); });
						var vv = p.grouping === "percentStacked" ? (tot ? v / tot * 100 : 0) : v, b0 = 0;
						if (stacked) { if (vv >= 0) { b0 = posS[i] || 0; posS[i] = b0 + vv; } else { b0 = negS[i] || 0; negS[i] = b0 + vv; } }
						var c0 = (horiz ? pt : pl) + i * slotW + (slotW - inner) / 2 + (stacked ? 0 : si * bw * (1 - Math.max(0, p.overlap) / 100));
						var a = vy(sc, Math.max(sc.lo, Math.min(sc.hi, b0))), b = vy(sc, Math.max(sc.lo, Math.min(sc.hi, b0 + vv)));
						var col = s.ptColors && s.ptColors[i] || s.color;
						if (horiz) o.push('<rect x="' + Math.min(a, b) + '" y="' + (horiz && !catRev ? (pb - (c0 - pt) - bw) : c0) + '" width="' + Math.max(0.5, Math.abs(b - a)) + '" height="' + Math.max(0.5, bw - 0.6) + '" fill="#' + col + '"><title>' + svgEsc(s.name + ": " + (cats[i] != null ? cats[i] + ", " : "") + fmt(v, s.fmt)) + "</title></rect>");
						else o.push('<rect x="' + c0 + '" y="' + Math.min(a, b) + '" width="' + Math.max(0.5, bw - 0.6) + '" height="' + Math.max(0.5, Math.abs(b - a)) + '" fill="#' + col + '"><title>' + svgEsc(s.name + ": " + (cats[i] != null ? cats[i] + ", " : "") + fmt(v, s.fmt)) + "</title></rect>");
						if ((s.labels || p.labels) && (s.labels || p.labels).val) { var lx = horiz ? Math.max(a, b) + 3 : c0 + bw / 2, ly = horiz ? ((catRev ? c0 + bw / 2 : pb - (c0 - pt) - bw / 2) + fs * 0.35) : Math.min(a, b) - 3; o.push('<text x="' + lx + '" y="' + ly + '"' + (horiz ? "" : ' text-anchor="middle"') + ' fill="' + ink + '" font-size="' + (fs - 1) + '">' + svgEsc(fmt(v, s.fmt)) + "</text>"); }
					}
				});
			});
			g.plots.filter(function (p) { return p.type === "area"; }).forEach(function (p) {
				var stacked = p.grouping !== "standard", acc = [];
				p.series.forEach(function (s) {
					var top2 = [], bot = [];
					for (var i = 0; i < nCat; i++) {
						var v = isNum(s.values[i]) ? s.values[i] : 0, tot = 0;
						if (p.grouping === "percentStacked") p.series.forEach(function (x) { if (isNum(x.values[i])) tot += Math.abs(x.values[i]); });
						var vv = p.grouping === "percentStacked" ? (tot ? v / tot * 100 : 0) : v, b0 = stacked ? (acc[i] || 0) : 0;
						if (stacked) acc[i] = b0 + vv;
						var x = catPos(i, true);
						top2.push(x + "," + vy(sc, b0 + vv)); bot.unshift(x + "," + vy(sc, b0));
					}
					o.push('<polygon points="' + top2.concat(bot).join(" ") + '" fill="#' + s.color + '" fill-opacity="' + (stacked ? 0.9 : 0.6) + '" stroke="#' + s.color + '"><title>' + svgEsc(s.name) + "</title></polygon>");
				});
			});
			g.plots.filter(function (p) { return p.type === "line" || p.type === "scatter"; }).forEach(function (p) {
				var stacked = p.grouping === "stacked" || p.grouping === "percentStacked", acc = [];
				p.series.forEach(function (s) {
					var pts = [], noLine = s.noLine || p.style === "marker" || p.style === "lineMarker" && s.noLine;
					for (var i = 0; i < s.values.length; i++) {
						var v = s.values[i]; if (!isNum(v)) { pts.push(null); continue; }
						var vv = v; if (stacked) { vv = (acc[i] || 0) + v; acc[i] = vv; }
						var x = scatter ? pl + ((isNum(s.xs && s.xs[i]) ? s.xs[i] : i + 1) - xsc.lo) / (xsc.hi - xsc.lo || 1) * (pr - pl) : catPos(i, lineMode);
						pts.push([x, vy(sc, vv), v, i]);
					}
					if (!noLine) {
						var segs = [], cur = [];
						pts.forEach(function (q) { if (q) cur.push(q[0].toFixed(1) + "," + q[1].toFixed(1)); else { if (cur.length) segs.push(cur); cur = []; } });
						if (cur.length) segs.push(cur);
						segs.forEach(function (sg) { o.push('<polyline points="' + sg.join(" ") + '" fill="none" stroke="#' + s.color + '" stroke-width="' + (s.lw || 2.2) + '" stroke-linejoin="round" stroke-linecap="round"/>'); });
					}
					var mk = s.marker && s.marker !== "none" || (scatter && s.marker !== "none") || noLine;
					if (mk && pts.length < 400) pts.forEach(function (q) { if (q) o.push('<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + Math.max(2.5, fs * 0.28) + '" fill="#' + (s.markerFill || s.color) + '"><title>' + svgEsc(s.name + ": " + (scatter ? fmtShort(s.xs && s.xs[q[3]]) + ", " : cats[q[3]] != null ? cats[q[3]] + ", " : "") + fmt(q[2], s.fmt)) + "</title></circle>"); });
					else if (pts.length < 400) pts.forEach(function (q) { if (q) o.push('<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="5" fill="transparent"><title>' + svgEsc(s.name + ": " + (cats[q[3]] != null ? cats[q[3]] + ", " : "") + fmt(q[2], s.fmt)) + "</title></circle>"); });
					if ((s.labels || p.labels) && (s.labels || p.labels).val) pts.forEach(function (q) { if (q) o.push('<text x="' + q[0] + '" y="' + (q[1] - 6) + '" text-anchor="middle" fill="' + ink + '" font-size="' + (fs - 1) + '">' + svgEsc(fmt(q[2], s.fmt)) + "</text>"); });
				});
			});
		});
		o.push("</svg>");
		return o.join("");
	}
	function legendItem(x, y, it, fs, ink, maxCh) {
		var sw = it.line ? '<line x1="' + x + '" y1="' + (y + fs * 0.45) + '" x2="' + (x + 12) + '" y2="' + (y + fs * 0.45) + '" stroke="#' + it.color + '" stroke-width="2.5"/>' : '<rect x="' + x + '" y="' + (y + 1) + '" width="10" height="' + (fs - 2) + '" fill="#' + it.color + '"/>';
		return sw + '<text x="' + (x + 16) + '" y="' + (y + fs * 0.85) + '" fill="' + ink + '">' + svgEsc(clipText(it.name, maxCh)) + "</text>";
	}
	function pieSvg(p, l, t, r, b, ink, fs, fmt, bg) {
		var s = p.series[0], vals = s.values.map(function (v) { return isNum(v) && v > 0 ? v : 0; }), tot = vals.reduce(function (a, v) { return a + v; }, 0);
		var cx = (l + r) / 2, cy = (t + b) / 2, R = Math.max(5, Math.min(r - l, b - t) / 2 - 6), hole = p.type === "doughnut" ? R * Math.max(10, p.hole || 50) / 100 : 0, o = [];
		if (!tot) return '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" fill="' + ink + '">(no data)</text>';
		var a = (p.firstAngle || 0) / 180 * Math.PI - Math.PI / 2, lab = s.labels || p.labels;
		vals.forEach(function (v, i) {
			if (!v) return;
			var a2 = a + v / tot * Math.PI * 2, large = a2 - a > Math.PI ? 1 : 0, col = s.ptColors[i];
			var P = function (ang, rad) { return (cx + Math.cos(ang) * rad).toFixed(2) + "," + (cy + Math.sin(ang) * rad).toFixed(2); };
			var d = v === tot ? "M" + P(a, R) + " A" + R + "," + R + " 0 1 1 " + P(a + Math.PI * 1.999, R) + "Z" : "M" + (hole ? P(a, hole) : cx + "," + cy) + " L" + P(a, R) + " A" + R + "," + R + " 0 " + large + " 1 " + P(a2, R) + (hole ? " L" + P(a2, hole) + " A" + hole + "," + hole + " 0 " + large + " 0 " + P(a, hole) : "") + "Z";
			o.push('<path d="' + d + '" fill="#' + col + '" stroke="' + (bg === "none" ? "#fff" : bg) + '" stroke-width="1"><title>' + svgEsc((s.cats[i] != null ? s.cats[i] + ": " : "") + fmt(s.values[i], s.fmt) + " (" + Math.round(v / tot * 1000) / 10 + "%)") + "</title></path>");
			if (lab && (lab.val || lab.pct || lab.cat) && v / tot > 0.03) {
				var m = (a + a2) / 2, rr = hole ? (R + hole) / 2 : R * 0.65, txt = [lab.cat ? s.cats[i] : null, lab.val ? fmt(s.values[i], s.fmt) : null, lab.pct ? Math.round(v / tot * 100) + "%" : null].filter(function (x) { return x != null; }).join("; ");
				o.push('<text x="' + (cx + Math.cos(m) * rr).toFixed(1) + '" y="' + (cy + Math.sin(m) * rr + fs * 0.35).toFixed(1) + '" text-anchor="middle" fill="' + (luminance(col) < 0.3 ? "#fff" : "#111") + '" font-size="' + (fs - 1) + '">' + svgEsc(txt) + "</text>");
			}
			a = a2;
		});
		return o.join("");
	}
	function radarSvg(p, l, t, r, b, ink, mute, gridC, fs, fmt) {
		var cx = (l + r) / 2, cy = (t + b) / 2 + 4, R = Math.max(5, Math.min(r - l, b - t) / 2 - fs * 1.6), o = [], n = 0, hi = 0;
		p.series.forEach(function (s) { n = Math.max(n, s.values.length); s.values.forEach(function (v) { if (isNum(v)) hi = Math.max(hi, v); }); });
		if (n < 3) return "";
		var sc = nice(0, hi || 1, 4), P = function (i, v) { var ang = -Math.PI / 2 + i / n * Math.PI * 2, rad = (v - sc.lo) / (sc.hi - sc.lo) * R; return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]; };
		sc.ticks.forEach(function (tk) { var pts = []; for (var i = 0; i < n; i++) pts.push(P(i, tk).map(function (x) { return x.toFixed(1); }).join(",")); o.push('<polygon points="' + pts.join(" ") + '" fill="none" stroke="' + gridC + '"/>'); });
		var cats = p.series[0].cats || [];
		for (var i = 0; i < n; i++) { var e = P(i, sc.hi), q = P(i, sc.hi * 1.12); o.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="' + gridC + '"/><text x="' + q[0] + '" y="' + (q[1] + fs * 0.35) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(clipText(cats[i] != null ? cats[i] : i + 1, 14)) + "</text>"); }
		p.series.forEach(function (s) { var pts = []; for (var i = 0; i < n; i++) pts.push(P(i, isNum(s.values[i]) ? s.values[i] : 0).map(function (x) { return x.toFixed(1); }).join(",")); o.push('<polygon points="' + pts.join(" ") + '" fill="' + (p.style === "filled" ? "#" + s.color : "none") + '" fill-opacity="0.35" stroke="#' + s.color + '" stroke-width="2"><title>' + svgEsc(s.name) + "</title></polygon>"); });
		return o.join("");
	}

	/* ---------- saving: graft the original parts onto SheetJS's output ---------- */
	function paneXml(fr) {
		if (!fr || (!fr.r && !fr.c)) return "";
		var tl = colName(fr.c) + (fr.r + 1), ap = fr.r && fr.c ? "bottomRight" : fr.r ? "bottomLeft" : "topRight";
		return '<pane' + (fr.c ? ' xSplit="' + fr.c + '"' : "") + (fr.r ? ' ySplit="' + fr.r + '"' : "") + ' topLeftCell="' + tl + '" activePane="' + ap + '" state="frozen"/><selection pane="' + ap + '" activeCell="' + tl + '" sqref="' + tl + '"/>';
	}
	function sheetViewsXml(fr, view, selected) {
		var a = ' workbookViewId="0"' + (selected ? ' tabSelected="1"' : "") + (view && view.showGridLines === false ? ' showGridLines="0"' : "") + (view && view.rtl ? ' rightToLeft="1"' : "") + (view && view.zoom && view.zoom !== 100 ? ' zoomScale="' + view.zoom + '"' : "");
		var p = paneXml(fr);
		return "<sheetViews><sheetView" + a + (p ? ">" + p + "</sheetView>" : "/>") + "</sheetViews>";
	}
	// add empty formatted cells ([r, c, s] triples, SheetJS does not write cells without a value) and rows that must exist
	// (rowAttrs: {r: ' hidden="1"'}) into a sheet's <sheetData>, keeping rows and cells in order
	function addStubCells(s, stubs, rowAttrs) {
		rowAttrs = rowAttrs || {};
		if (!stubs.length && !Object.keys(rowAttrs).length) return s;
		var by = {}; stubs.forEach(function (t) { (by[t[0]] || (by[t[0]] = [])).push(t); });
		Object.keys(rowAttrs).forEach(function (r) { if (!by[r]) by[r] = []; });
		var i0 = s.indexOf("<sheetData"), e0 = s.indexOf(">", i0);
		if (i0 < 0) return s;
		var self = s[e0 - 1] === "/", i1 = self ? e0 + 1 : s.indexOf("</sheetData>");
		var body = self ? "" : s.slice(e0 + 1, i1), out = [], rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, m, last = 0;
		var keys = Object.keys(by).map(Number).sort(function (a, b) { return a - b; }), ki = 0;
		var cellXml = function (t) { return '<c r="' + colName(t[1]) + (t[0] + 1) + '" s="' + t[2] + '"/>'; };
		var newRow = function (r) { var list = by[r].slice().sort(function (a, b) { return a[1] - b[1]; }); return '<row r="' + (r + 1) + '"' + (rowAttrs[r] || "") + (list.length ? ">" + list.map(cellXml).join("") + "</row>" : "/>"); };
		while ((m = rowRe.exec(body))) {
			out.push(body.slice(last, m.index)); last = rowRe.lastIndex;
			var rn = /\br="(\d+)"/.exec(m[1]), r = rn ? +rn[1] - 1 : -1;
			while (ki < keys.length && keys[ki] < r) out.push(newRow(keys[ki++]));
			if (ki < keys.length && keys[ki] === r) {
				ki++;
				var attrs = m[1].replace(/\/$/, ""); if (rowAttrs[r] && !/\bhidden=/.test(attrs)) attrs += rowAttrs[r];
				var list = by[r].slice().sort(function (a, b) { return a[1] - b[1]; }), inner = m[3] || "", cells = [], cre = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, cm, have = {};
				while ((cm = cre.exec(inner))) { var cr = /\br="([A-Z]+)\d+"/.exec(cm[0]), cc = cr ? colIndex(cr[1]) : cells.length; have[cc] = 1; cells.push([cc, cm[0]]); }
				list.forEach(function (t) { if (!have[t[1]]) cells.push([t[1], cellXml(t)]); });
				cells.sort(function (a, b) { return a[0] - b[0]; });
				out.push("<row" + attrs + ">" + cells.map(function (x) { return x[1]; }).join("") + "</row>");
			} else out.push(m[0]);
		}
		out.push(body.slice(last));
		while (ki < keys.length) out.push(newRow(keys[ki++]));
		return s.slice(0, i0) + "<sheetData>" + out.join("") + "</sheetData>" + s.slice(self ? e0 + 1 : i1 + 12);
	}
	function insertBefore(s, tags, frag) {
		var best = -1;
		tags.forEach(function (t) { var i = s.indexOf("<" + t); if (i >= 0 && (best < 0 || i < best)) best = i; });
		if (best < 0) best = s.lastIndexOf("</worksheet>");
		return s.slice(0, best) + frag + s.slice(best);
	}
	var AFTER_CF = ["dataValidations", "hyperlinks", "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing", "legacyDrawing", "legacyDrawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"];
	var AFTER_DRAWING = ["legacyDrawing", "legacyDrawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"];
	// styles.xml with extra cellXfs appended (clones of existing xfs with another number format)
	function stylesWithXfs(raw, extra) {
		if (!extra.length) return raw;
		var fmts = [], xfs = [];
		extra.forEach(function (e) { if (e.newFmt) fmts.push('<numFmt numFmtId="' + e.fmtId + '" formatCode="' + escX(e.code) + '"/>'); xfs.push(e.xml); });
		var s = raw;
		if (fmts.length) {
			if (/<numFmts\b[^>]*\/>/.test(s)) s = s.replace(/<numFmts\b[^>]*\/>/, "<numFmts>" + fmts.join("") + "</numFmts>");
			else if (/<numFmts\b/.test(s)) s = s.replace(/<\/numFmts>/, fmts.join("") + "</numFmts>");
			else s = s.replace(/(<styleSheet\b[^>]*>)/, "$1<numFmts>" + fmts.join("") + "</numFmts>");
			s = s.replace(/<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/, function (m, inner) { var n = (inner.match(/<numFmt\b/g) || []).length; return "<numFmts count=\"" + n + "\">" + inner + "</numFmts>"; });
		}
		s = s.replace(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/, function (m, inner) { var n = (inner.match(/<xf\b/g) || []).length + xfs.length; return '<cellXfs count="' + n + '">' + inner + xfs.join("") + "</cellXfs>"; });
		return s;
	}
	// append fonts / fills / borders / dxfs (XML strings) to styles.xml: more = {fonts: [], fills: [], borders: [], dxfs: []}
	function stylesAdd(raw, more) {
		if (!more) return raw;
		var s = raw;
		[["fonts", "font"], ["fills", "fill"], ["borders", "border"], ["dxfs", "dxf"]].forEach(function (p) {
			var list = more[p[0]]; if (!list || !list.length) return;
			var re = new RegExp("<" + p[0] + "\\b[^>]*?(?:/>|>([\\s\\S]*?)</" + p[0] + ">)");
			if (re.test(s)) s = s.replace(re, function (m, inner) { inner = (inner || "") + list.join(""); return "<" + p[0] + ' count="' + (inner.match(new RegExp("<" + p[1] + "\\b", "g")) || []).length + '">' + inner + "</" + p[0] + ">"; });
			else {
				var after = { fonts: /<\/numFmts>|(<styleSheet\b[^>]*>)/, fills: /<\/fonts>/, borders: /<\/fills>/, dxfs: /<\/cellStyles>|<\/cellXfs>/ }[p[0]];
				s = s.replace(after, function (m) { return m + "<" + p[0] + ' count="' + list.length + '">' + list.join("") + "</" + p[0] + ">"; });
			}
		});
		return s;
	}
	function countOf(raw, tag) { var m = new RegExp("<" + tag + "s\\b[^>]*?(?:/>|>([\\s\\S]*?)</" + tag + "s>)").exec(raw || ""); return m && m[1] ? (m[1].match(new RegExp("<" + tag + "\\b", "g")) || []).length : 0; }
	function rawList(raw, tag) { var m = new RegExp("<" + tag + "s\\b[^>]*>([\\s\\S]*?)</" + tag + "s>").exec(raw || ""); if (!m) return []; return m[1].match(new RegExp("<" + tag + "\\b[^>]*/>|<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">", "g")) || []; }
	function rawXfs(raw) { var m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(raw || ""); if (!m) return []; return m[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || []; }
	function maxFmtId(raw) { var mx = 163, re = /numFmtId="(\d+)"/g, m; while ((m = re.exec(raw || ""))) mx = Math.max(mx, +m[1]); return mx; }
	function ctAdd(ct, part, type) {
		if (ct.indexOf('PartName="/' + part + '"') >= 0) return ct;
		return ct.replace("</Types>", '<Override PartName="/' + part + '" ContentType="' + type + '"/></Types>');
	}
	function ctDefault(ct, ext, type) {
		if (new RegExp('Extension="' + ext + '"', "i").test(ct)) return ct;
		return ct.replace(/(<Types\b[^>]*>)/, '$1<Default Extension="' + ext + '" ContentType="' + type + '"/>');
	}
	function ctTypeOf(origCt, part) {
		var m = new RegExp('<Override[^>]*PartName="/' + part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*ContentType="([^"]+)"', "i").exec(origCt) || new RegExp('<Override[^>]*ContentType="([^"]+)"[^>]*PartName="/' + part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "i").exec(origCt);
		return m ? m[1] : null;
	}
	function relRel(from, to) {
		var a = dirOf(from).split("/").filter(Boolean), b = to.split("/");
		var i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
		var up = []; for (var k = i; k < a.length; k++) up.push("..");
		return up.concat(b.slice(i)).join("/");
	}
	/* outU8: what SheetJS wrote (any compression). model: readPackage of the original (or null). info: {sheets: [{model (original sheet
	   model or null), freeze {r, c} | null, cells: Map "r:c" -> s index for the output}], extraXfs, structOk (rows / columns / sheets
	   unchanged since opening, so tables, charts and conditional formatting still point at the right cells), tableHeaders: {part: [names]}} */
	function graft(outU8, model, info, inflate, deflate) {
		var z = unzip(outU8), files = {}, order = z.order.slice();
		var T = function (n) { return entryText(z, n, inflate); };
		var O = model ? function (n) { return entryBytes(model.zip, n, inflate); } : null;
		var write = {};   // name -> Uint8Array (new or changed)
		var copy = {};    // name -> original zip entry (copied as is)
		var ct, wbRelsP, report = { charts: 0, tables: 0, cf: 0, pics: 0, styles: !!(model && model.styles.raw) };
		return Promise.all([T("[Content_Types].xml"), T("_rels/.rels")]).then(function (r) {
			ct = r[0];
			var rr = parseRels(r[1], ""), wbPart = "xl/workbook.xml"; for (var k in rr) if (rr[k].type === "officeDocument") wbPart = rr[k].target;
			wbRelsP = relsPath(wbPart);
			return Promise.all([T(wbPart), T(wbRelsP)]).then(function (x) { return { wbPart: wbPart, wbx: xml(x[0]), rels: parseRels(x[1], wbPart), relsRaw: x[1] }; });
		}).then(function (W) {
			var sheetParts = kids(kid(W.wbx, "sheets"), "sheet").map(function (s) { var rel = W.rels[att(s, "id")]; return rel ? rel.target : null; });
			var stylesPart = null, themePart = null; for (var k in W.rels) { if (W.rels[k].type === "styles") stylesPart = W.rels[k].target; if (W.rels[k].type === "theme") themePart = W.rels[k].target; }
			var jobs = [];
			// styles + theme
			if (model && model.styles.raw && stylesPart) write[stylesPart] = enc(stylesAdd(stylesWithXfs(model.styles.raw, info.extraXfs || []), info.moreStyles));
			if (model && model.themeRaw && themePart) write[themePart] = enc(model.themeRaw);
			sheetParts.forEach(function (part, i) {
				var si = info.sheets[i]; if (!part || !si) return;
				jobs.push(Promise.all([T(part), T(relsPath(part))]).then(function (x) {
					var s = x[0], relsRaw = x[1], newRels = [];
					// cell styles
					if (si.cells) s = s.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, function (m, col, row, rest, sl) {
						var want = si.cells.get((+row - 1) + ":" + colIndex(col));
						rest = rest.replace(/\s+s="\d+"/, "");
						return '<c r="' + col + row + '"' + (want ? ' s="' + want + '"' : "") + rest + sl + ">";
					});
					if ((si.stubs && si.stubs.length) || si.rowAttrs) s = addStubCells(s, si.stubs || [], si.rowAttrs);
					// freeze panes + view
					var sv = sheetViewsXml(si.freeze, si.model && si.model.view, i === (info.active || 0));
					if (/<sheetViews>[\s\S]*?<\/sheetViews>|<sheetViews\/>/.test(s)) s = s.replace(/<sheetViews>[\s\S]*?<\/sheetViews>|<sheetViews\/>/, sv);
					else s = s.replace(/(<sheetFormatPr|<cols|<sheetData)/, sv + "$1");
					var sm = si.model;
					if (sm && model && info.structOk) {
						if (sm.cfRaw && sm.cfRaw.length) { s = insertBefore(s, AFTER_CF, sm.cfRaw.join("")); report.cf += sm.cfRaw.length; }
						var relN = 0, rid = function () { var id; do { id = "rIdMes" + (++relN); } while (relsRaw && relsRaw.indexOf('Id="' + id + '"') >= 0); return id; };
						if (sm.drawingPart) {
							var id = rid(); newRels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="' + relRel(part, sm.drawingPart) + '"/>');
							s = insertBefore(s, AFTER_DRAWING, '<drawing r:id="' + id + '"/>');
							copyTree(sm.drawingPart);
							report.charts += sm.objects.filter(function (o) { return o.type === "chart"; }).length; report.pics += sm.objects.filter(function (o) { return o.type === "pic"; }).length;
						}
						if (sm.tables && sm.tables.length) {
							var tp = sm.tables.map(function (t) {
								var id2 = rid(); newRels.push('<Relationship Id="' + id2 + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="' + relRel(part, t.part) + '"/>');
								var names = info.tableHeaders && info.tableHeaders[t.part];
								jobs.push(O(t.part).then(function (b) {
									var tx = utf8(b), k2 = 0;
									if (names) tx = tx.replace(/(<(?:\w+:)?tableColumn\b[^>]*?\bname=")([^"]*)(")/g, function (m, a, nm, c) { var n = names[k2++]; return a + (n != null && n !== "" ? escX(n) : nm) + c; });
									write[t.part] = enc(tx); ct = ctAdd(ct, t.part, "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml");
								}));
								return '<tablePart r:id="' + id2 + '"/>';
							});
							s = insertBefore(s, ["extLst"], '<tableParts count="' + tp.length + '">' + tp.join("") + "</tableParts>");
							report.tables += tp.length;
						}
						if (newRels.length && !/xmlns:r=/.test(s.slice(0, 600))) s = s.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
					}
					// parts made in the editor: new tables, a new drawing with its charts, new conditional formatting (si.add / si.cfXml)
					if (si.cfXml) s = insertBefore(s, AFTER_CF, si.cfXml);
					(si.add || []).forEach(function (a, k) {
						var id = "rIdMesN" + (k + 1);
						while (relsRaw && relsRaw.indexOf('Id="' + id + '"') >= 0) id += "x";
						newRels.push('<Relationship Id="' + id + '" Type="' + a.relType + '" Target="' + relRel(part, a.part) + '"/>');
						write[a.part] = enc(a.xml); ct = ctAdd(ct, a.part, a.ctType);
						(a.sub || []).forEach(function (sb) { write[sb.part] = enc(sb.xml); ct = ctAdd(ct, sb.part, sb.ctType); });
						if (a.rels) write[relsPath(a.part)] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + a.rels.map(function (r) { return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + relRel(a.part, r.target) + '"/>'; }).join("") + "</Relationships>");
						if (a.tag === "tablePart") {
							if (/<tableParts\b[^>]*>/.test(s)) s = s.replace(/<tableParts\b[^>]*>([\s\S]*?)<\/tableParts>/, function (m, inner) { inner += '<tablePart r:id="' + id + '"/>'; return '<tableParts count="' + (inner.match(/<tablePart\b/g) || []).length + '">' + inner + "</tableParts>"; });
							else s = insertBefore(s, ["extLst"], '<tableParts count="1"><tablePart r:id="' + id + '"/></tableParts>');
						} else if (a.tag === "drawing" && !/<drawing\b/.test(s)) s = insertBefore(s, AFTER_DRAWING, '<drawing r:id="' + id + '"/>');
					});
					if (newRels.length && !/xmlns:r=/.test(s.slice(0, 600))) s = s.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
					write[part] = enc(s);
					if (newRels.length) {
						var rr2 = relsRaw || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
						write[relsPath(part)] = enc(rr2.replace("</Relationships>", newRels.join("") + "</Relationships>"));
					}
				}));
			});
			// copy a part and everything its .rels points at (drawings -> charts -> chart styles / colours / images)
			var seen = {};
			function copyTree(p) {
				if (seen[p] || !model) return; seen[p] = 1;
				var e = model.zip.files[p]; if (!e) return;
				copy[p] = e;
				var t = ctTypeOf(model.ct, p);
				if (t) ct = ctAdd(ct, p, t);
				else { var ext = (p.split(".").pop() || "").toLowerCase(), dm = new RegExp('<Default[^>]*Extension="' + ext + '"[^>]*ContentType="([^"]+)"', "i").exec(model.ct); if (dm) ct = ctDefault(ct, ext, dm[1]); }
				var rp = relsPath(p);
				if (model.zip.files[rp]) { copy[rp] = model.zip.files[rp]; jobs.push(O(rp).then(function (b) { var rels = parseRels(utf8(b), p); for (var k in rels) if (!rels[k].ext) copyTree(rels[k].target); })); }
			}
			var settle = function () { var n = jobs.length; return Promise.all(jobs).then(function () { return jobs.length > n ? settle() : null; }); };
			return settle();
		}).then(function () {
			write["[Content_Types].xml"] = enc(ct);
			Object.keys(copy).concat(Object.keys(write)).forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
			return Promise.all(order.map(function (n) {
				if (write[n]) return { name: n, data: write[n] };
				if (copy[n]) return { name: n, raw: copy[n].raw, method: copy[n].method, crc: copy[n].crc, usize: copy[n].usize };
				var e = z.files[n];
				if (e.method === 0) return { name: n, data: e.raw };
				return { name: n, raw: e.raw, method: e.method, crc: e.crc, usize: e.usize };
			}));
		}).then(function (list) { return zipWrite(list, deflate); }).then(function (u8) { return { bytes: u8, report: report }; });
	}

	var api = {
		EMU: EMU, unzip: unzip, entryBytes: entryBytes, entryText: entryText, zipWrite: zipWrite, crc32: crc32, utf8: utf8, enc: enc,
		xml: xml, kid: kid, kids: kids, att: att, txt: txt, resolve: resolve, relsPath: relsPath, parseRels: parseRels,
		DEFAULT_THEME: DEFAULT_THEME, parseTheme: parseTheme, color: color, dmlColor: dmlColor, tint: tint, lumMod: lumMod, luminance: luminance,
		BUILTIN_FMT: BUILTIN_FMT, parseStyles: parseStyles, builtinTableStyle: builtinTableStyle, tableLook: tableLook, tableElements: tableElements, parseTable: parseTable,
		parseRange: parseRange, sqref: sqref, parseRefs: parseRefs, shiftFormula: shiftFormula, colName: colName, colIndex: colIndex,
		parseSheet: parseSheet, parseDrawing: parseDrawing, parseChart: parseChart, readPackage: readPackage,
		mergeLook: mergeLook, lookCss: lookCss, ruleStats: ruleStats, cfFor: cfFor, seriesColor: seriesColor, nice: nice, chartSvg: chartSvg,
		addStubCells: addStubCells, paneXml: paneXml, sheetViewsXml: sheetViewsXml, stylesWithXfs: stylesWithXfs, stylesAdd: stylesAdd, countOf: countOf, rawList: rawList, rawXfs: rawXfs, escX: escX, maxFmtId: maxFmtId, graft: graft
	};
	if (typeof module === "object" && module.exports) { module.exports = api; require("./parts.js").install(api); }
	else root.MESXLO = api;
})(typeof window !== "undefined" ? window : this);
