/* MES Spreadsheet Viewer & Editor (mes.fm/excel): pure editing helpers, installed into MESXL (node tests: tool_apps_src/excel-tests.js).
   - shiftFormula: copy / paste / fill a formula by (dr, dc): relative references move, $ parts stay, references pushed off the
     sheet become #REF! (like Excel)
   - moveRefs: after cutting and pasting a block, references to cells inside it follow it
   - formula entry: refSpans (references with their position, for the coloured outlines), canPoint (is the caret where a click inserts
     a reference?), cycleAbs / f4At (F4: A1 -> $A$1 -> A$1 -> $A1), refText (a range as text, with the sheet when needed)
   - fillSeries: what the fill handle writes (1, 2, 3 / dates / "Item 1", "Item 2" / Mon, Tue / Jan, Feb / copies)
   - clipboard: htmlTable (an Excel / Google Sheets compatible HTML table) and parseHtmlTable (cells from a pasted HTML table)
   - futureFns / toFile / fromFile: _xlfn. prefixes for the newer functions when a formula is written to .xlsx */
(function (root) {
	"use strict";
	function install(X) {
		var MAXR = X.MAXR, MAXC = X.MAXC, colName = X.colName, colIndex = X.colIndex;

		/* ---------- reference text <-> parts ---------- */
		// one side of a reference: {c, r, ac, ar} (c or r null for whole rows / columns)
		function partsOf(t) {
			var m = /^(\$?)([A-Za-z]{1,3})?(\$?)(\d+)?$/.exec(t);
			if (!m || (!m[2] && !m[4])) return null;
			return { c: m[2] ? colIndex(m[2]) : null, ac: !!m[1] && !!m[2], r: m[4] ? +m[4] - 1 : null, ar: m[2] ? !!m[3] && !!m[4] : !!m[1] && !!m[4] };
		}
		function partText(p) { return (p.c != null ? (p.ac ? "$" : "") + colName(p.c) : "") + (p.r != null ? (p.ar ? "$" : "") + (p.r + 1) : ""); }
		function sheetPrefix(name) { if (name == null) return ""; return (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !X.parseA1(name) && !/^(TRUE|FALSE|R\d*C\d*)$/i.test(name) ? name : "'" + String(name).replace(/'/g, "''") + "'") + "!"; }
		// a range as typed in a formula: refText({s, e}, sheet?) -> "A5" / "A5:C9" / "Sheet2!B3"
		function refText(g, sheet) {
			var body;
			if (g.s.r === 0 && g.e.r === MAXR - 1) body = colName(g.s.c) + ":" + colName(g.e.c);
			else if (g.s.c === 0 && g.e.c === MAXC - 1) body = (g.s.r + 1) + ":" + (g.e.r + 1);
			else { var a = colName(g.s.c) + (g.s.r + 1), b = colName(g.e.c) + (g.e.r + 1); body = a === b ? a : a + ":" + b; }
			return sheetPrefix(sheet) + body;
		}

		/* ---------- copy / fill: shift relative references ---------- */
		function shiftPart(p, dr, dc) {
			var q = { c: p.c, r: p.r, ac: p.ac, ar: p.ar };
			if (q.c != null && !q.ac) q.c += dc;
			if (q.r != null && !q.ar) q.r += dr;
			if ((q.c != null && (q.c < 0 || q.c >= MAXC)) || (q.r != null && (q.r < 0 || q.r >= MAXR))) return null;
			return q;
		}
		function shiftFormula(f, dr, dc) {
			if (!dr && !dc) return f;
			var toks; try { toks = X.tokenize(f); } catch (e) { return f; }
			return toks.map(function (t) {
				if (t.type !== "ref") return t.raw;
				var text = t.v.text, prefix = t.raw.slice(0, t.raw.length - text.length), hash = /#$/.test(text) ? "#" : "";
				if (hash) text = text.slice(0, -1);
				var sides = text.split(":"), out = [];
				for (var i = 0; i < sides.length; i++) { var p = partsOf(sides[i]); if (!p) return t.raw; var q = shiftPart(p, dr, dc); if (!q) return prefix + "#REF!"; out.push(partText(q)); }
				return prefix + out.join(":") + hash;
			}).join("");
		}
		// cut + paste: every reference to a range entirely inside `from` (sheet name + {s, e}) moves by (dr, dc) to `toSheet`
		// (absolute or not). here = the sheet of the formula being rewritten.
		function moveRefs(f, from, dr, dc, here, toSheet) {
			var toks; try { toks = X.tokenize(f); } catch (e) { return f; }
			var changed = false;
			var out = toks.map(function (t) {
				if (t.type !== "ref") return t.raw;
				var sheet = t.v.sheet == null ? here : t.v.sheet;
				if (String(sheet).toLowerCase() !== String(from.sheet).toLowerCase()) return t.raw;
				var text = t.v.text, hash = /#$/.test(text) ? "#" : ""; if (hash) text = text.slice(0, -1);
				var sides = text.split(":").map(partsOf); if (sides.some(function (p) { return !p || p.r == null || p.c == null; })) return t.raw;
				var r1 = Math.min.apply(null, sides.map(function (p) { return p.r; })), r2 = Math.max.apply(null, sides.map(function (p) { return p.r; }));
				var c1 = Math.min.apply(null, sides.map(function (p) { return p.c; })), c2 = Math.max.apply(null, sides.map(function (p) { return p.c; }));
				if (r1 < from.g.s.r || r2 > from.g.e.r || c1 < from.g.s.c || c2 > from.g.e.c) return t.raw;
				var moved = sides.map(function (p) { return partText({ c: p.c + dc, r: p.r + dr, ac: p.ac, ar: p.ar }); });
				changed = true;
				var ts = toSheet == null ? sheet : toSheet, pre = t.v.sheet != null || ts !== here ? sheetPrefix(ts) : "";
				return pre + moved.join(":") + hash;
			});
			return changed ? out.join("") : f;
		}

		/* ---------- formula entry ---------- */
		var PALETTE = ["#1f6feb", "#d1242f", "#7b3fe4", "#1a7f37", "#bf5af2", "#c4570f", "#0a8fa0", "#b0186d"];
		// the references in a formula ("=..." with the "=") with their character positions and a colour each (same text = same colour)
		function refSpans(text) {
			var s = String(text || ""); if (s[0] !== "=") return [];
			var toks; try { toks = X.tokenize(s.slice(1)); } catch (e) { toks = tolerant(s.slice(1)); }
			var out = [], colors = {}, n = 0;
			toks.forEach(function (t) {
				if (t.type !== "ref") return;
				var text2 = t.v.text.replace(/#$/, ""), g = X.parseRange(text2.replace(/\$/g, ""));
				if (!g) { var m = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(text2), m2 = /^\$?(\d+):\$?(\d+)$/.exec(text2); if (m) g = { s: { r: 0, c: Math.min(colIndex(m[1]), colIndex(m[2])) }, e: { r: MAXR - 1, c: Math.max(colIndex(m[1]), colIndex(m[2])) } }; else if (m2) g = { s: { r: +m2[1] - 1, c: 0 }, e: { r: +m2[2] - 1, c: MAXC - 1 } }; }
				if (!g) return;
				var key = (t.v.sheet || "").toLowerCase() + "!" + X.rangeA1(g);
				if (!(key in colors)) colors[key] = PALETTE[n++ % PALETTE.length];
				out.push({ start: t.pos + 1, end: t.pos + 1 + t.raw.length, text: t.raw, sheet: t.v.sheet, g: g, color: colors[key] });
			});
			return out;
		}
		// tokenize as far as the formula can be read (while typing, "=SUM(A1:B2" is not finished)
		function tolerant(s) {
			for (var cut = s.length; cut > 0; cut--) { try { return X.tokenize(s.slice(0, cut)); } catch (e) { /* shorter */ } }
			return [];
		}
		// is the caret at a place where clicking a cell should insert its reference? (after =, an operator, "(", "," ...)
		function canPoint(text, caret) {
			var s = String(text || ""); if (s[0] !== "=") return false;
			if (caret == null) caret = s.length;
			var before = s.slice(0, caret).replace(/\s+$/, ""), after = s.slice(caret);
			if (/^[A-Za-z0-9_$("']/.test(after)) return false;
			var q = (before.match(/"/g) || []).length; if (q % 2) return false;
			var last = before[before.length - 1];
			return before.length === 1 || /[=+\-*\/^&(,;<>:%{]/.test(last);
		}
		// F4: A1 -> $A$1 -> A$1 -> $A1 -> A1 (a range changes both ends together)
		function cycleAbs(ref) {
			var m = /^((?:'(?:[^']|'')+'|[^'!]+)!)?(.+)$/.exec(ref), pre = m[1] || "", body = m[2], hash = /#$/.test(body) ? "#" : "";
			if (hash) body = body.slice(0, -1);
			var sides = body.split(":").map(partsOf); if (sides.some(function (p) { return !p; })) return ref;
			var p0 = sides[0], state = p0.c != null && p0.r != null ? (p0.ac && p0.ar ? 1 : p0.ar ? 2 : p0.ac ? 3 : 0) : ((p0.c != null ? p0.ac : p0.ar) ? 1 : 0);
			var next = p0.c != null && p0.r != null ? (state + 1) % 4 : (state + 1) % 2;
			sides.forEach(function (p) {
				if (p.c != null && p.r != null) { p.ac = next === 1 || next === 3; p.ar = next === 1 || next === 2; }
				else if (p.c != null) p.ac = next === 1; else p.ar = next === 1;
			});
			return pre + sides.map(partText).join(":") + hash;
		}
		// F4 in a formula being typed: the reference at / just before the caret -> {text, caret} (null when there is none)
		function f4At(text, caret, selEnd) {
			var spans = refSpans(text), hit = null;
			for (var i = 0; i < spans.length; i++) { var sp = spans[i]; if (caret >= sp.start && caret <= sp.end) { hit = sp; break; } if (selEnd != null && sp.start >= caret && sp.end <= selEnd) { hit = sp; break; } }
			if (!hit) return null;
			var nt = cycleAbs(hit.text);
			return { text: text.slice(0, hit.start) + nt + text.slice(hit.end), caret: hit.start + nt.length, start: hit.start, end: hit.start + nt.length };
		}

		/* ---------- fill handle ---------- */
		var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		function listMatch(s) {
			var t = String(s), low = t.toLowerCase(), lists = [DAYS, MONTHS];
			for (var l = 0; l < lists.length; l++) for (var i = 0; i < lists[l].length; i++) {
				var full = lists[l][i], short = full.slice(0, 3);
				if (low === full.toLowerCase()) return { list: lists[l], i: i, form: "full", cap: caseOf(t) };
				if (low === short.toLowerCase()) return { list: lists[l], i: i, form: "short", cap: caseOf(t) };
			}
			var q = /^(Q|Qtr|Quarter )([1-4])$/i.exec(t);
			if (q) return { quarter: q[1], i: +q[2] - 1 };
			return null;
		}
		function caseOf(t) { return t === t.toUpperCase() ? "up" : t === t.toLowerCase() ? "low" : "title"; }
		function applyCase(s, c) { return c === "up" ? s.toUpperCase() : c === "low" ? s.toLowerCase() : s; }
		// src: [{v (number | string | boolean | null), date: bool}] in fill order; n: how many to make.
		// opts.copy: copy instead of making a series (Ctrl while dragging, like Excel). Returns [{v, date}]
		function fillSeries(src, n, opts) {
			opts = opts || {};
			var out = [];
			if (!src.length) return out;
			if (opts.copy) { for (var k = 0; k < n; k++) out.push(src[k % src.length]); return out; }
			var allNum = src.every(function (x) { return typeof x.v === "number"; });
			if (allNum) {
				var isDate = src[0].date, step;
				if (src.length === 1) step = isDate ? 1 : 0;
				else if (isDate && src.length >= 2 && monthStep(src)) return monthSeries(src, n);
				else {   // least-squares line like Excel's linear trend (exact for an even step)
					var m = src.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
					src.forEach(function (p, i) { sx += i; sy += p.v; sxx += i * i; sxy += i * p.v; });
					step = (m * sxy - sx * sy) / (m * sxx - sx * sx);
					var b = (sy - step * sx) / m;
					for (var j = 0; j < n; j++) out.push({ v: clean(b + step * (m + j)), date: isDate });
					return out;
				}
				for (var j2 = 0; j2 < n; j2++) out.push({ v: clean(src[src.length - 1].v + step * (j2 + 1)), date: isDate });
				return out;
			}
			// text with a number at the end ("Item 1", "Week 2"), or day / month names; otherwise the cells repeat
			var lm = src.map(function (x) { return typeof x.v === "string" ? listMatch(x.v) : null; });
			if (lm.every(Boolean)) {
				var last = lm[lm.length - 1], st = src.length > 1 ? ((lm[lm.length - 1].i - lm[lm.length - 2].i) || 1) : 1;
				for (var a = 0; a < n; a++) {
					if (last.quarter) { var qi = ((last.i + st * (a + 1)) % 4 + 4) % 4; out.push({ v: last.quarter + (qi + 1) }); continue; }
					var len = last.list.length, idx = ((last.i + st * (a + 1)) % len + len) % len, word = last.list[idx];
					out.push({ v: applyCase(last.form === "short" ? word.slice(0, 3) : word, last.cap) });
				}
				return out;
			}
			var tn = src.map(function (x) { return typeof x.v === "string" ? /^(.*?)(\d+)(\D*)$/.exec(x.v) : null; });
			if (tn.every(Boolean) && tn.every(function (m) { return m[1] === tn[0][1] && m[3] === tn[0][3]; })) {
				var lastN = +tn[tn.length - 1][2], width = tn[tn.length - 1][2].length, st2 = src.length > 1 ? (lastN - +tn[tn.length - 2][2]) || 1 : 1;
				for (var b2 = 0; b2 < n; b2++) { var v = Math.abs(lastN + st2 * (b2 + 1)), s = String(v); if (/^0/.test(tn[0][2]) && s.length < width) s = new Array(width - s.length + 1).join("0") + s; out.push({ v: tn[0][1] + s + tn[0][3] }); }
				return out;
			}
			for (var c = 0; c < n; c++) out.push(src[c % src.length]);
			return out;
		}
		function clean(v) { return +v.toPrecision(15); }
		function monthStep(src) {   // dates on the same day of the month, a whole number of months apart
			if (!X.ymd) return false;
			var d = src.map(function (x) { return X.ymd(Math.floor(x.v)); });
			if (d.some(function (x) { return x.d !== d[0].d; }) || d[0].d === 1 && false) return false;
			var steps = []; for (var i = 1; i < d.length; i++) steps.push((d[i].y - d[i - 1].y) * 12 + d[i].m - d[i - 1].m);
			return steps.length && steps.every(function (s) { return s === steps[0] && s !== 0; }) && d.some(function (x, i) { return i && Math.floor(src[i].v) - Math.floor(src[i - 1].v) !== 7 && Math.floor(src[i].v) - Math.floor(src[i - 1].v) !== 1; });
		}
		function monthSeries(src, n) {
			var d = src.map(function (x) { return X.ymd(Math.floor(x.v)); }), step = (d[1].y - d[0].y) * 12 + d[1].m - d[0].m, last = d[d.length - 1], out = [];
			for (var i = 1; i <= n; i++) { var m = last.m + step * i, y = last.y + Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; var ld = new Date(Date.UTC(y, m, 0)).getUTCDate(); out.push({ v: X.fromYMD(y, m, Math.min(d[0].d, ld)), date: true }); }
			return out;
		}

		/* ---------- clipboard HTML ---------- */
		function escH(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
		// rows: [[{text, css, num, f}]] -> an HTML table Excel and Google Sheets read (styles inline)
		function htmlTable(rows) {
			var h = ['<meta charset="utf-8"><table style="border-collapse:collapse">'];
			rows.forEach(function (r) {
				h.push("<tr>");
				r.forEach(function (c) { var st = (c && c.css ? c.css.replace(/box-shadow:[^;]*;/g, "") : "") + (c && c.num ? "text-align:right;" : ""); h.push("<td" + (st ? ' style="' + escH(st) + '"' : "") + (c && c.span ? ' colspan="' + c.span[1] + '" rowspan="' + c.span[0] + '"' : "") + ">" + escH(c ? c.text : "").replace(/\n/g, "<br>") + "</td>"); });
				h.push("</tr>");
			});
			h.push("</table>");
			return h.join("");
		}
		var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
		function unent(s) { return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) { if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)); return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m; }); }
		// a pasted HTML table (from Excel, Google Sheets, a web page) -> [[{text, style: {b, i, u, color, fill, ha}}]] | null
		function parseHtmlTable(html) {
			var s = String(html || ""), t0 = s.search(/<table\b/i); if (t0 < 0) return null;
			var t1 = s.search(/<\/table>/i); var body = s.slice(t0, t1 < 0 ? s.length : t1);
			var classes = {}; (s.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).forEach(function (st) { var re = /\.([\w-]+)\s*\{([^}]*)\}/g, m; while ((m = re.exec(st))) classes[m[1]] = m[2]; });
			var rows = [], occupied = {}, ri = 0, trRe = /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|$)/gi, tm;
			while ((tm = trRe.exec(body))) {
				var cellRe = /<t([dh])\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|<\/tr>|$)/gi, cm, ci = 0, row = rows[ri] || (rows[ri] = []);
				while ((cm = cellRe.exec(tm[1]))) {
					while (occupied[ri + ":" + ci]) ci++;
					var attrs = cm[2], inner = cm[3].replace(/<\/t[dh]>[\s\S]*$/i, "");
					var cls = /class\s*=\s*"?([\w-]+)/i.exec(attrs), css = ((/style\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || "") + ";" + (cls && classes[cls[1]] || "");
					var text = unent(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n+$/, "").replace(/ /g, " ");
					if (/<b\b|<strong\b/i.test(inner)) css += ";font-weight:bold";
					var cs = +((/colspan\s*=\s*"?(\d+)/i.exec(attrs) || [])[1] || 1), rs = +((/rowspan\s*=\s*"?(\d+)/i.exec(attrs) || [])[1] || 1);
					row[ci] = { text: text, style: styleOf(css, cm[1] === "h") };
					if (cs > 1 || rs > 1) { row[ci].span = [rs, cs]; for (var a = 0; a < rs; a++) for (var b = 0; b < cs; b++) if (a || b) occupied[(ri + a) + ":" + (ci + b)] = 1; }
					ci += cs;
				}
				ri++;
			}
			var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
			return rows.length ? rows.map(function (r) { var o = []; for (var i = 0; i < w; i++) o.push(r[i] || { text: "" }); return o; }) : null;
		}
		function hexOf(c) {
			c = String(c || "").trim().toLowerCase(); var m;
			if ((m = /^#([0-9a-f]{6})$/.exec(c))) return m[1].toUpperCase();
			if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c))) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
			if ((m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c))) { if (m[4] != null && +m[4] === 0) return null; return [m[1], m[2], m[3]].map(function (v) { v = (+v).toString(16); return v.length < 2 ? "0" + v : v; }).join("").toUpperCase(); }
			var named = { black: "000000", white: "FFFFFF", red: "FF0000", blue: "0000FF", green: "008000", yellow: "FFFF00" };
			return named[c] || null;
		}
		function styleOf(css, th) {
			var st = {}, get = function (k) { var re = new RegExp("(?:^|;)\\s*" + k + "\\s*:\\s*([^;]+)", "i"), m = re.exec(css); return m ? m[1].trim() : null; };
			var fw = get("font-weight"); if ((fw && (/bold/i.test(fw) || +fw >= 600)) || (th && !fw)) st.b = true;
			if (/italic/i.test(get("font-style") || "")) st.i = true;
			if (/underline/i.test(get("text-decoration") || "")) st.u = true;
			var col = hexOf(get("color")); if (col && col !== "000000") st.color = col;
			var bg = hexOf(get("background-color") || get("background")); if (bg && bg !== "FFFFFF") st.fill = bg;
			var ta = get("text-align"); if (ta && /^(center|right|left)$/i.test(ta)) st.ha = ta.toLowerCase();
			return Object.keys(st).length ? st : null;
		}

		/* ---------- formulas written to .xlsx: newer functions need the _xlfn. prefix or Excel shows #NAME? ---------- */
		var FUTURE = ("XLOOKUP XMATCH CONCAT TEXTJOIN IFS SWITCH MAXIFS MINIFS IFNA UNIQUE SEQUENCE RANDARRAY LET SORTBY XOR DAYS ISOWEEKNUM " +
			"STDEV.S STDEV.P VAR.S VAR.P MODE.SNGL PERCENTILE.INC PERCENTILE.EXC QUARTILE.INC QUARTILE.EXC RANK.EQ RANK.AVG CEILING.MATH FLOOR.MATH " +
			"CEILING.PRECISE FLOOR.PRECISE ISO.CEILING NETWORKDAYS.INTL WORKDAY.INTL NUMBERVALUE UNICHAR UNICODE TEXTBEFORE TEXTAFTER TEXTSPLIT " +
			"HSTACK VSTACK TAKE DROP CHOOSECOLS CHOOSEROWS TOCOL TOROW ISFORMULA RRI SHEET SHEETS ANCHORARRAY SINGLE").split(" ");
		var XLWS = { SORT: 1, FILTER: 1 };
		function toFile(f) {
			var toks; try { toks = X.tokenize(f); } catch (e) { return f; }
			return toks.map(function (t) {
				if (t.type === "func") { if (/^_XL/i.test(t.v)) return t.raw; var n = X.normFn(t.v); if (XLWS[n]) return "_xlfn._xlws." + t.raw; if (FUTURE.indexOf(n) >= 0) return "_xlfn." + t.raw; return t.raw; }
				if (t.type === "ref" && /#$/.test(t.v.text)) return "_xlfn.ANCHORARRAY(" + t.raw.slice(0, -1) + ")";
				return t.raw;
			}).join("");
		}
		function fromFile(f) { return String(f).replace(/_xlfn\.ANCHORARRAY\(((?:'(?:[^']|'')+'!|[A-Za-z_][\w.]*!)?\$?[A-Za-z]{1,3}\$?\d+)\)/gi, "$1#").replace(/_xlfn\.(_xlws\.)?/gi, ""); }

		X.shiftFormula = shiftFormula; X.moveRefs = moveRefs; X.refSpans = refSpans; X.canPoint = canPoint; X.cycleAbs = cycleAbs; X.f4At = f4At;
		X.refText = refText; X.sheetPrefix = sheetPrefix; X.fillSeries = fillSeries; X.htmlTable = htmlTable; X.parseHtmlTable = parseHtmlTable;
		X.REF_COLORS = PALETTE; X.toFile = toFile; X.fromFile = fromFile; X.hexOf = hexOf;
	}
	if (typeof module === "object" && module.exports) module.exports = { install: install };
	else if (root.MESXL) install(root.MESXL);
})(typeof window !== "undefined" ? window : this);
