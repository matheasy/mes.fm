/* MES Spreadsheet Viewer & Editor (mes.fm/excel): open .xlsx / .xlsm / .xls / .ods / .csv / .tsv in the browser, view them in a
 * virtualised grid (only the cells on screen exist in the page, so 100k-row files scroll smoothly), edit values and simple formulas
 * (our own evaluator in lib.js = MESXL; formulas with other functions keep the value saved in the file), find, sort / filter as a
 * view, add / delete rows, columns and sheets, undo / redo, save as .xlsx / .ods / .csv / .tsv, print, recent files + autosave in
 * IndexedDB. Files are read and written by SheetJS Community Edition (Apache-2.0), self-hosted in /main_js/sheetjs/ and loaded on
 * first open. Nothing is uploaded. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("xl");
	if (!root || !window.MESXL) return;
	var X = window.MESXL, KEY = "mes-excel:v1";
	var SHEETJS = "/main_js/sheetjs/0.20.3/xlsx.full.min.js";
	var RH = 24, CHH = 24, MAXH = 12e6;
	var S = { freeze: true, remember: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

	var app = $("xl-app"), grid = $("xl-grid"), scroll = $("xl-scroll"), sizer = $("xl-sizer"), cellsEl = $("xl-cells"), ed = $("xl-ed"), fxin = $("xl-fxin"), nameBox = $("xl-name"), emptyEl = $("xl-empty");
	var lib = null;
	function loadLib() {
		if (window.XLSX) return Promise.resolve(window.XLSX);
		if (!lib) lib = new Promise(function (res, rej) {
			var s = document.createElement("script"); s.src = SHEETJS; s.async = true;
			s.onload = function () { if (window.XLSX) { X.ssf = window.XLSX.SSF; res(window.XLSX); } else rej(new Error("The spreadsheet library did not start.")); };
			s.onerror = function () { lib = null; rej(new Error("Could not load the spreadsheet library. Check your connection and try again.")); };
			document.head.appendChild(s);
		});
		return lib;
	}
	function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function note(html, err) { var n = $("xl-note"); n.hidden = !html; n.innerHTML = html || ""; n.classList.toggle("is-err", !!err); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
	var nf = function (n) { return Number(n).toLocaleString(); };

	/* ---------- state ---------- */
	var wb = null, file = null, si = 0, calc = null, nRows = 0, nCols = 0;
	var views = {};        // per sheet name: {sort, filters, rows (actual row indexes, header excluded), inv}
	var stale = {};        // "si:r:c" -> unknown function names (formulas that could not be worked out again after an edit)
	var sel = { ar: 0, ac: 0, fr: 0, fc: 0, mode: "" }, editing = null;
	var undo = [], redo = [];
	var colX = [0], NR = 0, NC = 0, base = 1, HW = 44, FR = RH, FC = 0, FW = 0;
	var hits = [], hitSet = null, hitIx = -1;
	var O = window.MESXLO, dver = 0;   // dver: bumped on every edit (conditional formatting statistics and charts are recomputed)
	if (S.showHidden == null) S.showHidden = false;
	if (S.objs == null) S.objs = true;

	function ws() { return wb.Sheets[wb.SheetNames[si]]; }
	function data() { var w = ws(); if (!w["!data"]) w["!data"] = []; return w["!data"]; }
	function view() { var v = views[wb.SheetNames[si]]; return v && v.rows ? v : null; }
	function isSF(v) { v = v || view(); return !!(v && v.rows && (v.sort || (v.filters && v.filters.length))); }   // a sort / filter view (not just hidden rows left out)
	function getCell(r, c) { var row = data()[r]; return row ? row[c] : undefined; }
	function sx(w) { w = w || ws(); return w && w["!mesx"] || null; }        // what ooxml.js read for this sheet (styles, tables, charts...)
	function pkgOf() { return wb && wb["!mespkg"] || null; }
	// frozen rows / columns: chosen here, else the file's pane, else the "header row" setting
	// (an .xlsx we could read follows its own panes; other files get the "header row" setting)
	function frzOf(w) { w = w || ws(); if (w["!mesfrz"]) return w["!mesfrz"]; var x = sx(w); if (x) return x.pane ? { r: x.pane.r, c: x.pane.c } : { r: 0, c: 0 }; return { r: S.freeze ? 1 : 0, c: 0 }; }
	function setFrozen() { var f = frzOf(); base = Math.max(0, Math.min(f.r | 0, 30)); FC = Math.max(0, Math.min(f.c | 0, 30)); }
	function rowHid(r) { var m = ws()["!rows"]; return !!(m && m[r] && m[r].hidden); }
	function colHid(c) { var cs = ws()["!cols"], o = cs && cs[c]; return !!(o && o.hidden); }
	function hiddenCounts(w) { w = w || ws(); var m = w["!rows"] || [], nr = 0, nc = 0; for (var i = 0; i < m.length; i++) if (m[i] && m[i].hidden) nr++; (w["!cols"] || []).forEach(function (o) { if (o && o.hidden) nc++; }); return { r: nr, c: nc }; }
	function isDark() { return document.body.classList.contains("dark-mode"); }

	/* ---------- display text ---------- */
	function fmtNum(v, z) {
		if (z && z !== "General" && window.XLSX) { try { return window.XLSX.SSF.format(z, v); } catch (e) { /* fall through */ } }
		return X.fmtGeneral(v);
	}
	function disp(cell) {
		if (!cell) return "";
		if (cell.w != null) return cell.w;
		var t;
		switch (cell.t) {
			case "n": t = typeof cell.v === "number" ? fmtNum(cell.v, cell.z) : ""; break;
			case "b": t = cell.v ? "TRUE" : "FALSE"; break;
			case "e": t = X.ERRCODE[cell.v] || "#VALUE!"; break;
			case "s": case "str": t = cell.v == null ? "" : String(cell.v); break;
			case "d": t = cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v); break;
			default: t = "";
		}
		cell.w = t;
		return t;
	}
	function editText(cell) {
		if (!cell) return "";
		if (cell.f) return "=" + cell.f;
		if (cell.sp && wb) { var C = ensureCalc(), k = C.spilledBy[si + ":" + actualRow(sel.ar) + ":" + sel.ac], p = k && k.split(":"), an = p && C.getCell(+p[0], +p[1], +p[2]); if (an && an.f) return "=" + an.f; }
		if (cell.t === "n" && typeof cell.v === "number") {
			if (cell.z && /%/.test(cell.z) && !/"[^"]*%/.test(cell.z)) return X.fmtGeneral(+(cell.v * 100).toPrecision(15)) + "%";
			if (cell.z && /[dy]/i.test(cell.z.replace(/"[^"]*"/g, "")) && !/\[/.test(cell.z) && window.XLSX) { try { return window.XLSX.SSF.format("yyyy-mm-dd", cell.v) + (cell.v % 1 ? " " + window.XLSX.SSF.format("hh:mm:ss", cell.v) : ""); } catch (e) { /* ignore */ } }
			return String(cell.v);
		}
		if (cell.t === "s" && /^(=|'|[-+$(]?\d|TRUE$|FALSE$)/i.test(String(cell.v)) && X.parseInput(String(cell.v)).t !== "s") return "'" + cell.v;
		return disp(cell);
	}
	function fillOf(cell) {
		var s = cell && cell.s;
		if (!s || s.patternType !== "solid" || !s.fgColor || !s.fgColor.rgb) return "";
		var rgb = String(s.fgColor.rgb).slice(-6);
		return /^[0-9a-f]{6}$/i.test(rgb) && rgb.toUpperCase() !== "FFFFFF" ? "#" + rgb : "";
	}
	/* ---------- cell styles: the file's own formatting, Excel tables, conditional formatting ---------- */
	var cssCache = {};
	function xfLook(i) { var p = pkgOf(); var xf = p && i ? p.styles.xfs[i] : null; return xf && Object.keys(xf.look).length ? xf.look : null; }
	function cfCtx() {
		var d = data(), name = wb.SheetNames[si];
		var get = function (sheet, r, c) { var w = sheet && sheet !== name ? wb.Sheets[sheet] : ws(); if (!w) return null; var row = (w["!data"] || [])[r]; var v = X.cellValue(row ? row[c] : undefined); return v == null ? 0 : v; };
		return {
			value: function (r, c) { var row = d[r], v = X.cellValue(row ? row[c] : undefined); return X.isErr(v) ? null : v; },
			text: function (r, c) { var row = d[r]; return disp(row ? row[c] : undefined); },
			isErr: function (r, c) { var row = d[r], cl = row && row[c]; return !!(cl && cl.t === "e"); },
			stats: function (rule) { if (rule.__v !== dver) { rule.__v = dver; rule.__st = O.ruleStats(rule, this.value); } return rule.__st; },
			evalF: function (f, dr, dc) {
				if (f == null) return null;
				var src = O.shiftFormula(f, dr, dc), k = src;
				var c = this.__c || (this.__c = {}); if (k in c) return c[k];
				var out; try { out = X.calc(src, get, name); if (X.isErr(out)) out = null; } catch (e) { out = /^-?\d+(\.\d+)?$/.test(f) ? +f : String(f).replace(/^"|"$/g, ""); }
				return (c[k] = out);
			}
		};
	}
	var cfc = null, cfcV = -1, cfcS = -1;
	// -> {css: {css, fill, ha, wrap, va}, bar, fmtColor} | null for cell (ar, c)
	function styleAt(ar, c, cell) {
		var x = sx(), w = ws(), L = null, key = null, nt = w["!mestables"], mcf = w["!mescf"], cfs = null, ml = cell && cell.ml;
		if (x) {
			var xs = cell && cell.xs != null ? cell.xs : (x.rowXf[ar] != null ? x.rowXf[ar] : x.colXf[c]);
			L = xs ? xfLook(xs) : null; key = xs ? "x" + xs : "";
			for (var i = 0; i < x.tables.length; i++) { var t = x.tables[i]; if (t.els && ar >= t.g.s.r && ar <= t.g.e.r && c >= t.g.s.c && c <= t.g.e.c) { L = O.mergeLook(O.tableLook(t, ar, c, t.els), L); key = null; break; } }
			if (x.cf.length) cfs = x.cf;
		} else { var f = fillOf(cell); if (f) L = { fill: { c: f.slice(1) } }; key = f ? "f" + f : ""; }
		if (nt && nt.length) for (var j = 0; j < nt.length; j++) { var t2 = nt[j]; if (ar >= t2.g.s.r && ar <= t2.g.e.r && c >= t2.g.s.c && c <= t2.g.e.c) { L = O.mergeLook(O.tableLook(t2, ar, c, tableEls(t2)), L); key = null; break; } }
		if (ml) { L = withMl(L, ml); key = null; }
		if (mcf && mcf.length) cfs = cfs ? cfs.concat(mcf) : mcf;
		if (cfs && ar != null) {
			if (!cfc || cfcV !== dver || cfcS !== si) { cfc = cfCtx(); cfcV = dver; cfcS = si; }
			var res = O.cfFor(cfs, ar, c, cfc);
			if (res) { if (res.look) { L = O.mergeLook(L, res.look); key = null; } if (res.bar) { key = null; return { css: O.lookCss(L, isDark()), bar: res.bar }; } }
		}
		if (!L) return null;
		if (key) { var k2 = key + (isDark() ? "d" : ""); return cssCache[k2] || (cssCache[k2] = { css: O.lookCss(L, isDark()) }); }
		return { css: O.lookCss(L, isDark()) };
	}
	var FMTCOL = { red: "#d40000", blue: "#1f4fd8", green: "#0a8a2a", magenta: "#c0189c", cyan: "#0a8fa0", yellow: "#b38f00", white: "#ffffff", black: "#111111" };
	function fmtColor(cell) {
		if (!cell || cell.t !== "n" || !cell.z || cell.z.indexOf("[") < 0) return "";
		var secs = cell.z.replace(/"[^"]*"/g, "").split(";"), v = cell.v, s = secs.length > 1 && v < 0 ? secs[1] : secs.length > 2 && v === 0 ? secs[2] : secs[0];
		var m = /\[(Red|Blue|Green|Magenta|Cyan|Yellow|White|Black)\]/i.exec(s || "");
		return m ? FMTCOL[m[1].toLowerCase()] : "";
	}

	/* ---------- merged cells ---------- */
	function mergeInfo() {
		var w = ws(), list = w["!merges"];
		if (!list || !list.length) return null;
		if (w["!mesmerge"] && w["!mesmerge"].list === list && w["!mesmerge"].n === list.length) return w["!mesmerge"];
		var at = new Map(), cells = 0;
		list.forEach(function (g, i) { var n = (g.e.r - g.s.r + 1) * (g.e.c - g.s.c + 1); if (cells + n > 1e6) return; cells += n; for (var r = g.s.r; r <= g.e.r; r++) for (var c = g.s.c; c <= g.e.c; c++) at.set(r * 16384 + c, i); });
		return (w["!mesmerge"] = { list: list, n: list.length, at: at });
	}

	/* ---------- dimensions ---------- */
	function dims() {
		var d = data(), mc = 0;
		for (var r = 0; r < d.length; r++) if (d[r] && d[r].length > mc) { var row = d[r]; for (var c = row.length - 1; c >= mc; c--) if (row[c]) { mc = c + 1; break; } }
		var mr = d.length; while (mr > 0 && !(d[mr - 1] && d[mr - 1].some(Boolean))) mr--;
		nRows = mr; nCols = mc;
	}
	function setRef() {
		var w = ws(); w["!ref"] = nRows && nCols ? X.rangeA1({ s: { r: 0, c: 0 }, e: { r: nRows - 1, c: nCols - 1 } }) : "A1";
	}
	function colW(c) {
		var cs = ws()["!cols"], o = cs && cs[c];
		if (!o) return 88;
		if (o.hidden && !S.showHidden) return 0;
		if (o.width) return Math.max(8, Math.round(o.width * 7.2));
		if (o.wpx) return Math.max(8, Math.round(o.wpx));
		if (o.wch) return Math.max(8, Math.round(o.wch * 7 + 5));
		return 88;
	}
	// the column / row sizes Excel uses (for placing charts and pictures sized in EMUs)
	function xlColPx(c) { var cs = ws()["!cols"], o = cs && cs[c]; if (o && o.hidden) return 0; if (o && o.width) return Math.max(1, Math.round(o.width * 7)); if (o && o.wpx) return o.wpx * 64 / 88; return 64; }
	function xlRowPx(r) { var m = ws()["!rows"], o = m && m[r], x = sx(); if (o && o.hidden) return 0; if (o && o.hpx) return o.hpx; if (o && o.hpt) return o.hpt * 4 / 3; return (x ? x.defaultRowHeight : 15) * 4 / 3; }
	function layout() {
		if (!wb) return;
		setFrozen();
		var v = view();
		FR = base * RH;
		NR = v ? v.rows.length : Math.max(nRows + 60, 120) - base;
		NC = Math.max(nCols + 6, 26, FC + 6);
		colX = [0]; for (var c = 0; c < NC; c++) colX.push(colX[c] + colW(c));
		FW = colX[FC];
		var gw = grid.clientWidth || 900;
		if (FW > gw * 0.65) { FC = 0; FW = 0; }       // a frozen block wider than the screen (phones): scroll it instead
		var maxRow = v ? nRows : NR + base;
		HW = Math.max(40, 12 + 8 * String(maxRow).length);
		var sty = function (el, css) { for (var k in css) el.style[k] = typeof css[k] === "number" ? css[k] + "px" : css[k]; };
		sty($("xl-corner"), { width: HW, height: CHH });
		sty($("xl-colh"), { left: HW, height: CHH });
		sty($("xl-colhf"), { width: FW, height: CHH, display: FW ? "" : "none" });
		sty($("xl-frzh"), { top: CHH, width: HW, height: FR, display: base ? "" : "none" });
		sty($("xl-frzc"), { top: CHH, left: HW, width: FW, height: FR, display: base && FW ? "" : "none" });
		sty($("xl-frz"), { top: CHH, left: HW + FW, height: FR, display: base ? "" : "none" });
		sty($("xl-fcols"), { top: CHH + FR, left: HW, width: FW, display: FW ? "" : "none" });
		sty($("xl-rowh"), { top: CHH + FR, width: HW });
		sty(scroll, { top: CHH + FR, left: HW + FW });
		sty(sizer, { width: colX[NC] - FW + 40, height: Math.min(NR * RH, MAXH) + RH });
		toolState();
	}
	function actualRow(dr) { if (dr < 0) return dr + base; var v = view(); return v ? v.rows[dr] : dr + base; }
	function displayRow(ar) {
		if (ar < base) return ar - base;
		var v = view();
		if (v) { if (!v.inv) { v.inv = new Map(); v.rows.forEach(function (r, i) { v.inv.set(r, i); }); } return v.inv.has(ar) ? v.inv.get(ar) : null; }
		return ar - base;
	}
	// display row of an actual row, or of the next one showing (hidden rows): for merged cells and pictures
	function drNear(ar, last) { for (var r = ar; r <= Math.max(ar, last == null ? ar + 2000 : last); r++) { var d = displayRow(r); if (d != null) return d; } return null; }
	function colAt(x) { var lo = 0, hi = NC - 1; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (colX[m] <= x) lo = m; else hi = m - 1; } return lo; }
	function scrollInfo() {
		var vh = scroll.clientHeight, st = scroll.scrollTop, T = NR * RH, H = Math.min(T, MAXH);
		var P = (T > H && H > vh) ? st / (H + RH - vh) * (T + RH - vh) : st;
		return { vh: vh, vw: scroll.clientWidth, st: st, sl: scroll.scrollLeft, P: P, T: T, H: H };
	}

	/* ---------- render ---------- */
	var rq = 0;
	function render() { if (!rq) rq = requestAnimationFrame(function () { rq = 0; draw(); }); }
	function selRect() { return { r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr), c1: Math.min(sel.ac, sel.fc), c2: Math.max(sel.ac, sel.fc) }; }
	function cellHtml(cell, ar, c, left, top, width, height, extra) {
		var t = disp(cell), cls = "xl-c" + (extra || ""), st = "left:" + left + "px;top:" + top + "px;width:" + width + "px;height:" + height + "px;";
		if (cell) {
			if (cell.t === "n") cls += " n"; else if (cell.t === "b") cls += " b"; else if (cell.t === "e") cls += " e";
			if (cell.f && stale[si + ":" + ar + ":" + c]) cls += " stale";
		}
		var sa = styleAt(ar, c, cell);
		if (sa) {
			var L = sa.css;
			st += L.css;
			if (L.fill) cls += " f-fill";
			if (L.ha) cls += " ha";
			if (L.wrap) cls += " wrap";
			if (L.va && (height > RH || L.wrap)) cls += " va-" + L.va;
			if (sa.bar) { st += "background-image:linear-gradient(90deg,#" + sa.bar.color + "aa 0,#" + sa.bar.color + "33 " + sa.bar.pct.toFixed(1) + "%,transparent " + sa.bar.pct.toFixed(1) + "%);"; if (sa.bar.hideValue) t = ""; }
		}
		var fc = fmtColor(cell); if (fc) st += "color:" + fc + ";";
		var box = height > RH || (sa && sa.css.wrap);
		if (height > RH && !(sa && sa.css.wrap)) cls += " tall";
		if (hitSet && hitSet.has(ar + ":" + c)) cls += " hit";
		var tb = "";
		if (ar != null && ws()["!mestables"]) { var tt = tableAt(ar, c); if (tt && tt.header && tt.filterBtn !== false && ar === tt.g.s.r) { var vv = views[wb.SheetNames[si]], on = vv && vv.filters && vv.filters.some(function (f) { return f.c === c && f.t === tt.name; }); tb = '<button type="button" class="xl-tfb' + (on ? " is-on" : "") + '" data-tf="' + ar + ":" + c + '" aria-label="Sort and filter ' + esc(t) + '" tabindex="-1">' + (on ? "&#9660;&#8226;" : "&#9662;") + "</button>"; cls += " has-tfb"; } }
		return '<div class="' + cls + '" style="' + st + '">' + (box ? '<span class="xl-ct">' + esc(t) + "</span>" : esc(t)) + tb + "</div>";
	}
	// one quadrant of the grid. rows: [{dr, ar, y}], cols: [{c, x, w}], dom: {r0, r1 (display rows), c0, c1 (columns)} it may draw in,
	// yOf(dr) / xOf(c) give positions inside the quadrant's container
	function block(rows, cols, dom, yOf, xOf) {
		var h = [], d = data(), M = isSF() ? null : mergeInfo(), seen = {};
		if (!rows.length || !cols.length) return "";
		for (var i = 0; i < rows.length; i++) {
			var rw = rows[i], ar = rw.ar, row = ar == null ? null : d[ar], late = "";
			for (var k = 0; k < cols.length; k++) {
				var cc = cols[k], c = cc.c, cell = row ? row[c] : undefined, w = cc.w;
				if (M && ar != null) {
					var mi = M.at.get(ar * 16384 + c);
					if (mi != null) {
						if (seen[mi]) continue; seen[mi] = 1;
						var g = M.list[mi], ca = Math.max(g.s.c, dom.c0), cb = Math.min(g.e.c, dom.c1);
						var ra = drNear(Math.max(g.s.r, actualRow(dom.r0)), g.e.r), rb = null;
						for (var rr = g.e.r; rr >= g.s.r; rr--) { var dd = displayRow(rr); if (dd != null) { rb = dd; break; } }
						if (ra == null || rb == null) continue;
						ra = Math.max(ra, dom.r0); rb = Math.min(rb, dom.r1);
						var tl = row && ar === g.s.r && c === g.s.c ? cell : (d[g.s.r] || [])[g.s.c];
						var mw = colX[cb + 1] - colX[ca], d0 = displayRow(g.s.r);
						// a merge cut by the frozen line: only the part holding its top-left cell shows the text
						if (g.s.c < dom.c0 || d0 == null || d0 < dom.r0) tl = tl ? Object.assign({}, tl, { t: "z", w: "", v: null, f: null }) : { t: "z", xs: ((d[g.s.r] || [])[g.s.c] || {}).xs };
						if (mw > 0 && rb >= ra) h.push(cellHtml(tl, g.s.r, g.s.c, xOf(ca), yOf(ra), mw, (rb - ra + 1) * RH, " mg"));
						continue;
					}
				}
				// text runs on over empty cells to its right, like Excel
				if (cell && (cell.t === "s" || cell.t === "str")) {
					var tx = disp(cell), sa0 = styleAt(ar, c, cell), L0 = sa0 && sa0.css;
					if (tx.length * 7 > w && !(L0 && (L0.fill || L0.wrap || (L0.ha && L0.ha !== "left")))) {
						var c2 = c + 1, ww = w, kk = k + 1;
						while (kk < cols.length && cols[kk].c === c2 && ww < tx.length * 7.5 + 8 && ww < 2400 && !(row[c2] && disp(row[c2]) !== "") && !(M && M.at.has(ar * 16384 + c2))) { ww += cols[kk].w; c2++; kk++; }
						if (ww > w) { late += cellHtml(cell, ar, c, cc.x, rw.y, ww, RH, " ofl"); continue; }
					}
				}
				h.push(cellHtml(cell, ar, c, cc.x, rw.y, w, RH, ""));
			}
			h.push(late);
		}
		// selection inside this quadrant
		var R = selRect(), a = Math.max(R.r1, dom.r0, rows[0].dr - 1), b = Math.min(R.r2, dom.r1, rows[rows.length - 1].dr + 1);
		var c0 = Math.max(R.c1, dom.c0), c1 = Math.min(R.c2, dom.c1);
		var multi = R.r1 !== R.r2 || R.c1 !== R.c2;
		if (multi && b >= a && c1 >= c0) h.push('<div class="xl-selbox" style="left:' + xOf(c0) + "px;top:" + yOf(a) + "px;width:" + (colX[c1 + 1] - colX[c0]) + "px;height:" + ((b - a + 1) * RH) + 'px"></div>');
		if (sel.ar >= dom.r0 && sel.ar <= dom.r1 && sel.ac >= dom.c0 && sel.ac <= dom.c1 && sel.ar >= rows[0].dr - 1 && sel.ar <= rows[rows.length - 1].dr + 1) {
			var aw = colX[sel.ac + 1] - colX[sel.ac], ah = RH, ax = xOf(sel.ac), ay = yOf(sel.ar);
			var am = M && M.at.get(actualRow(sel.ar) * 16384 + sel.ac);
			if (am != null) { var gg = M.list[am]; ax = xOf(Math.max(gg.s.c, dom.c0)); aw = colX[Math.min(gg.e.c, dom.c1) + 1] - colX[Math.max(gg.s.c, dom.c0)]; var t0 = displayRow(gg.s.r), t1 = displayRow(gg.e.r); if (t0 != null && t1 != null) { ay = yOf(Math.max(t0, dom.r0)); ah = (Math.min(t1, dom.r1) - Math.max(t0, dom.r0) + 1) * RH; } }
			if (!(editing && editing.si !== si)) h.push('<div class="xl-act' + (editing && isFormulaText(edText()) ? " is-ed" : "") + '" style="left:' + ax + "px;top:" + ay + "px;width:" + aw + "px;height:" + ah + 'px"></div>');
		}
		h.push(spillBox(dom, yOf, xOf, rows), clipBox(dom, yOf, xOf, rows), refBoxes(dom, yOf, xOf, rows), fillPrevBox(dom, yOf, xOf, rows), fillHandle(dom, xOf, yOf, rows));
		return h.join("");
	}
	function draw() {
		if (!wb) return;
		var I = scrollInfo(), R = selRect();
		var r0 = Math.max(0, Math.floor(I.P / RH)), r1 = Math.min(NR - 1, Math.floor((I.P + I.vh) / RH));
		var c0 = Math.max(FC, colAt(I.sl + FW)), c1 = Math.min(NC - 1, colAt(I.sl + FW + I.vw));
		var srows = [], frows = [], scols = [], fcols = [], rh = [], hh = [], hf = [];
		for (var dr = r0; dr <= r1; dr++) srows.push({ dr: dr, ar: actualRow(dr), y: I.st + dr * RH - I.P });
		for (var fr = 0; fr < base; fr++) frows.push({ dr: fr - base, ar: fr, y: fr * RH });
		for (var c = c0; c <= c1; c++) { var w = colX[c + 1] - colX[c]; if (w) scols.push({ c: c, x: colX[c] - FW, w: w }); }
		for (var c3 = 0; c3 < FC; c3++) { var w3 = colX[c3 + 1] - colX[c3]; if (w3) fcols.push({ c: c3, x: colX[c3], w: w3 }); }
		var ySc = function (d) { return I.st + d * RH - I.P; }, yFz = function (d) { return (d + base) * RH; }, xSc = function (cc) { return colX[cc] - FW; }, xFz = function (cc) { return colX[cc]; };
		var domS = { r0: 0, r1: NR - 1, c0: FC, c1: NC - 1 }, domF = { r0: -base, r1: -1, c0: FC, c1: NC - 1 };
		cellsEl.innerHTML = block(srows, scols, domS, ySc, xSc);
		var v = views[wb.SheetNames[si]], hidShown = S.showHidden;
		var colHead = function (c2, out) {
			var w2 = colX[c2 + 1] - colX[c2]; if (!w2) return;
			var srt = v && v.sort && v.sort.c === c2 ? '<span class="xl-sorti">' + (v.sort.dir > 0 ? "▲" : "▼") + "</span>" : "";
			var flt = v && v.filters && v.filters.some(function (f) { return f.c === c2; }) ? '<span class="xl-sorti">▾</span>' : "";
			out.push('<div class="xl-ch' + (c2 >= R.c1 && c2 <= R.c2 ? " is-on" : "") + (hidShown && colHid(c2) ? " is-hid" : "") + '" data-c="' + c2 + '" style="left:' + colX[c2] + "px;width:" + w2 + "px;height:" + CHH + 'px">' + X.colName(c2) + srt + flt + '<span class="xl-rz" data-rz="' + c2 + '"></span></div>');
		};
		for (var c2 = c0; c2 <= c1; c2++) colHead(c2, hh);
		for (var c4 = 0; c4 < FC; c4++) colHead(c4, hf);
		var chIn = $("xl-colh-in"); chIn.innerHTML = hh.join(""); chIn.style.transform = "translateX(" + (-I.sl) + "px)";
		$("xl-colhf").innerHTML = hf.join("");
		srows.forEach(function (rw) { rh.push('<div class="xl-rh' + (rw.dr >= R.r1 && rw.dr <= R.r2 ? " is-on" : "") + (hidShown && rw.ar != null && rowHid(rw.ar) ? " is-hid" : "") + '" data-dr="' + rw.dr + '" style="top:' + (rw.dr * RH - I.P) + "px;width:" + HW + "px;height:" + RH + 'px">' + (rw.ar == null ? "" : rw.ar + 1) + "</div>"); });
		var rhIn = $("xl-rowh-in"); rhIn.innerHTML = rh.join(""); rhIn.style.transform = "";
		if (FW) {
			var fc = $("xl-fcols"); fc.style.height = I.vh + "px";
			$("xl-fcol-in").innerHTML = block(srows.map(function (rw) { return { dr: rw.dr, ar: rw.ar, y: rw.dr * RH - I.P }; }), fcols, { r0: 0, r1: NR - 1, c0: 0, c1: FC - 1 }, function (d) { return d * RH - I.P; }, xFz);
		}
		if (base) {
			var fIn = $("xl-frz-in"); fIn.innerHTML = block(frows, scols, domF, yFz, xSc); fIn.style.transform = "translateX(" + (-I.sl) + "px)";
			if (FW) $("xl-frzc").innerHTML = block(frows, fcols, { r0: -base, r1: -1, c0: 0, c1: FC - 1 }, yFz, xFz);
			$("xl-frzh").innerHTML = frows.map(function (rw) { return '<div class="xl-rh' + (rw.dr >= R.r1 && rw.dr <= R.r2 ? " is-on" : "") + '" data-dr="' + rw.dr + '" style="top:' + rw.y + "px;width:" + HW + "px;height:" + RH + 'px">' + (rw.ar + 1) + "</div>"; }).join("");
		}
		if (editing && editing.where === "cell") placeEditor();
	}

	/* ---------- charts and pictures (drawn into the scrolling area, redrawn only when something changes) ---------- */
	function yOfAr(ar) { if (ar < base) return (ar - base) * RH; var d = drNear(ar); return d == null ? null : d * RH; }
	// Excel position (column / row + offset in Excel pixels) -> our grid
	function gridX(c, off) { var x = c < colX.length ? colX[c] : colX[colX.length - 1], ex = xlColPx(c), ow = colX[c + 1] - colX[c]; return x + (ex ? Math.min(off, ex) / ex * ow : 0) - FW; }
	function gridY(r, off) { var y = yOfAr(r); if (y == null) return null; var ex = xlRowPx(r); return y + (ex ? Math.min(off, ex) / ex * RH : 0); }
	function walk(start, off, len, size, max) { var c = start, left = off + len; while (c < max && left > size(c)) { left -= size(c); c++; } return { c: c, off: left }; }
	function rectOf(a) {
		if (!a.from) { if (!a.pos || !a.ext) return null; var px = walk(0, 0, a.pos.x, xlColPx, NC + 200), py = walk(0, 0, a.pos.y, xlRowPx, nRows + 2000); a = { from: { c: px.c, co: px.off, r: py.c, ro: py.off }, ext: a.ext }; }
		var to = a.to;
		if (!to && a.ext) { var ec = walk(a.from.c, a.from.co, a.ext.w, xlColPx, a.from.c + 400), er = walk(a.from.r, a.from.ro, a.ext.h, xlRowPx, a.from.r + 4000); to = { c: ec.c, co: ec.off, r: er.c, ro: er.off }; }
		if (!to) return null;
		while (colX.length <= to.c + 1) colX.push(colX[colX.length - 1] + 88);
		var x1 = gridX(a.from.c, a.from.co), x2 = gridX(to.c, to.co), y1 = gridY(a.from.r, a.from.ro), y2 = gridY(to.r, to.ro);
		if (y1 == null || y2 == null) return null;
		return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
	}
	function readRef(ref, num, vis) {
		if (!ref) return [];
		var areas = ref.f ? O.parseRefs(ref.f) : [];
		if (!areas.length || !areas.every(function (a) { return wb.Sheets[a.sheet]; })) return (ref.cache || []).map(function (v) { if (v == null) return null; if (num) { var n = parseFloat(v); return isFinite(n) ? n : null; } return v; });
		var out = [];
		areas.forEach(function (a) {
			var w = wb.Sheets[a.sheet], d = w["!data"] || [], rows = w["!rows"] || [], cs = w["!cols"] || [], g = a.g;
			for (var r = g.s.r; r <= Math.min(g.e.r, g.s.r + 20000); r++) {
				if (vis && rows[r] && rows[r].hidden && g.e.r > g.s.r) continue;
				for (var c = g.s.c; c <= Math.min(g.e.c, g.s.c + 2000); c++) {
					if (vis && cs[c] && cs[c].hidden && g.e.c > g.s.c) continue;
					var cell = (d[r] || [])[c];
					if (num) { var v = X.cellValue(cell); out.push(typeof v === "number" ? v : null); }
					else out.push(cell ? disp(cell) : "");
				}
			}
		});
		return out;
	}
	function chartModel(ch) {
		var p0 = pkgOf(), theme = p0 ? p0.theme : null, n = 0, total = 0;
		ch.plots.forEach(function (p) { total += p.series.length; });
		var plots = ch.plots.map(function (p) {
			return Object.assign({}, p, { series: p.series.map(function (s, k) {
				var vals = readRef(s.val, true, ch.visOnly), cats = s.cat ? readRef(s.cat, false, ch.visOnly) : [], xs = p.type === "scatter" && s.x ? readRef(s.x, true, ch.visOnly) : null;
				if (p.type === "scatter" && s.x && !xs.some(function (v) { return v != null; })) xs = null;
				var name = s.name ? (readRef(s.name, false, false).filter(function (t) { return t !== ""; }).join(" ") || "Series " + (n + 1)) : "Series " + (n + 1);
				var lineish = p.type === "line" || p.type === "scatter" || p.type === "radar";
				var col = (lineish ? s.look.line || s.look.fill : s.look.fill || s.look.line) || O.seriesColor(s.idx != null ? s.idx : n, theme);
				var pts = [];
				if (p.vary || p.type === "pie" || p.type === "doughnut") for (var i = 0; i < vals.length; i++) pts[i] = O.seriesColor(i, theme);
				s.pts.forEach(function (d) { if (d.look.fill) pts[d.idx] = d.look.fill; });
				if (p.type !== "pie" && p.type !== "doughnut" && !p.vary) pts = pts.length ? pts : null;
				n++;
				return { name: name, values: vals, cats: cats.length ? cats : null, xs: xs, color: col, ptColors: pts, fmt: s.val && s.val.fmt, marker: s.marker, markerFill: s.markerFill, noLine: s.look.noLine, lw: s.look.lw, labels: s.labels };
			}) });
		});
		var title = ch.title;
		if (ch.titleRef) title = readRef(ch.titleRef, false, false).join(" ") || title;
		if (title == null && !ch.autoDel && total === 1) title = plots[0].series[0].name;
		return { title: title || null, plots: plots };
	}
	function fmtVal(v, code) { if (typeof v !== "number") return v == null ? "" : String(v); if (code && code !== "General" && window.XLSX) { try { return window.XLSX.SSF.format(code, v); } catch (e) { /* ignore */ } } return X.fmtGeneral(+v.toPrecision(10)); }
	function objUrl(o) { if (!o.url) { try { o.url = URL.createObjectURL(new Blob([o.bytes], { type: o.mime })); } catch (e) { o.url = ""; } } return o.url; }
	var objT = 0;
	function drawObjects(now) {
		if (!now) { clearTimeout(objT); objT = setTimeout(function () { drawObjects(true); }, 60); return; }
		var box = $("xl-objs"); if (!box) return;
		var x = wb && sx();
		var mine = ws()["!mescharts"];
		if ((!x || !x.objects.length) && !(mine && mine.length) || !S.objs || isSF() || NR * RH > MAXH) { box.innerHTML = ""; return; }
		var html = [], dark = isDark();
		(x ? x.objects : []).forEach(function (o, i) {
			if (o.hidden) return;
			var r = rectOf(o.anchor); if (!r || r.w < 6 || r.h < 6) return;
			var pos = "left:" + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + "px";
			if (o.type === "pic") { var u = objUrl(o); if (u) html.push('<img class="xl-obj xl-pic" alt="' + esc(o.name || "Picture") + '" src="' + u + '" style="' + pos + '" draggable="false">'); return; }
			var svg = "";
			try { svg = O.chartSvg(o.chart, chartModel(o.chart), { w: Math.round(r.w), h: Math.round(r.h), dark: dark, fmt: fmtVal }); } catch (e) { svg = ""; if (window.console) console.warn("[excel] chart", e); }
			if (svg) html.push('<div class="xl-obj xl-chart" data-oi="' + i + '" role="img" aria-label="' + esc((o.name || "Chart") + (o.chart.title ? ": " + o.chart.title : "")) + '" style="' + pos + '">' + svg + "</div>");
		});
		drawMyCharts(html, dark);
		box.innerHTML = html.join("");
	}
	// toolbar buttons that depend on the sheet (hidden rows / columns, charts, freeze)
	function toolState() {
		if (!wb) return;
		var hc = hiddenCounts(), hb = $("xl-hid"), ob = $("xl-objbtn"), x = sx(), f = frzOf();
		hb.hidden = !(hc.r || hc.c);
		hb.setAttribute("aria-pressed", String(!!S.showHidden));
		$("xl-hidn").textContent = (hc.r ? hc.r + " row" + (hc.r > 1 ? "s" : "") : "") + (hc.r && hc.c ? ", " : "") + (hc.c ? hc.c + " col" + (hc.c > 1 ? "s" : "") : "");
		hb.title = (S.showHidden ? "Showing" : "Show") + " the hidden rows and columns of this sheet (they stay hidden in the file)";
		ob.hidden = !((x && x.objects.length) || (ws()["!mescharts"] || []).length);
		ob.setAttribute("aria-pressed", String(!!S.objs));
		grid.classList.toggle("xl-nogrid", !!(x && x.view && x.view.showGridLines === false));
		var hd = $("xl-hdr"); hd.setAttribute("aria-pressed", String(!!(f.r || f.c)));
		$("xl-frzl").textContent = f.r || f.c ? "Frozen" + (f.r ? " " + f.r + "R" : "") + (f.c ? " " + f.c + "C" : "") : "Freeze";
		var fb = $("xl-frzfile"); if (fb) { fb.hidden = !(x && x.pane); if (x && x.pane) fb.querySelector("small").textContent = (x.pane.r ? x.pane.r + " row" + (x.pane.r > 1 ? "s" : "") : "") + (x.pane.r && x.pane.c ? " and " : "") + (x.pane.c ? x.pane.c + " column" + (x.pane.c > 1 ? "s" : "") : "") + ", as saved in the file"; }
	}

	/* ---------- selection ---------- */
	function minRow() { return -base; }
	function clampSel() {
		var lo = minRow();
		sel.ar = Math.max(lo, Math.min(NR - 1, sel.ar)); sel.fr = Math.max(lo, Math.min(NR - 1, sel.fr));
		sel.ac = Math.max(0, Math.min(NC - 1, sel.ac)); sel.fc = Math.max(0, Math.min(NC - 1, sel.fc));
	}
	function select(dr, c, extend, keepMode) {
		if (extend) { sel.fr = dr; sel.fc = c; }
		else { sel.ar = sel.fr = dr; sel.ac = sel.fc = c; }
		if (!keepMode) sel.mode = "";
		clampSel();
		reveal(sel.fr, sel.fc);
		showActive();
		render();
	}
	function reveal(dr, c) {
		var I = scrollInfo();
		if (dr >= 0) {
			var y = dr * RH, P = I.P;
			if (y < P) P = y; else if (y + RH > P + I.vh) P = y + RH - I.vh;
			if (P !== I.P) scroll.scrollTop = (I.T > I.H && I.H > I.vh) ? P * (I.H + RH - I.vh) / (I.T + RH - I.vh) : P;
		}
		if (c < FC) return;
		var x = colX[c] - FW, w = colX[c + 1] - colX[c];
		if (x < I.sl) scroll.scrollLeft = x; else if (x + w > I.sl + I.vw) scroll.scrollLeft = Math.min(x, x + w - I.vw);
	}
	function showActive() {
		if (!wb) return;
		var ar = actualRow(sel.ar), cell = getCell(ar, sel.ac), R = selRect();
		nameBox.value = R.r1 === R.r2 && R.c1 === R.c2 ? X.a1(ar, sel.ac) : X.a1(actualRow(R.r1), R.c1) + ":" + X.a1(actualRow(R.r2), R.c2);
		if (!editing) fxin.value = editText(cell);
		fxin.classList.toggle("is-ghost", !!(cell && cell.sp && !editing));
		status(); fmtState();
	}
	function selectedActualRows() { var R = selRect(), out = []; for (var r = R.r1; r <= R.r2; r++) out.push(actualRow(r)); return out; }

	/* ---------- status bar ---------- */
	function status() {
		if (!wb) { $("xl-status").innerHTML = ""; return; }
		var parts = [], v = view(), R = selRect();
		parts.push("<span><b>" + esc(wb.SheetNames[si]) + "</b> &middot; " + nf(nRows) + " rows &times; " + nf(nCols) + " columns</span>");
		if (isSF(v)) parts.push("<span>Showing <b>" + nf(v.dataN != null ? v.dataN : v.rows.length) + "</b> of " + nf(Math.max(0, nRows - base)) + " rows (sorted / filtered view)</span>");
		var hc = hiddenCounts(), fz = frzOf();
		if (hc.r || hc.c) parts.push("<span>" + (hc.r ? nf(hc.r) + " hidden row" + (hc.r > 1 ? "s" : "") : "") + (hc.r && hc.c ? ", " : "") + (hc.c ? nf(hc.c) + " hidden column" + (hc.c > 1 ? "s" : "") : "") + (S.showHidden ? " (shown, striped headers)" : " (not shown)") + "</span>");
		if (base || FC) parts.push("<span>Frozen: " + (base ? base + " row" + (base > 1 ? "s" : "") : "") + (base && FC ? " and " : "") + (FC ? FC + " column" + (FC > 1 ? "s" : "") : "") + "</span>");
		var x0 = sx(), ar0 = actualRow(sel.ar);
		if (x0) x0.tables.forEach(function (t) { if (ar0 >= t.g.s.r && ar0 <= t.g.e.r && sel.ac >= t.g.s.c && sel.ac <= t.g.e.c) parts.push("<span>Table <b>" + esc(t.name) + "</b> (" + esc(t.ref) + (t.style ? ", " + esc(t.style.replace(/^TableStyle/, "")) : "") + ")</span>"); });
		var cnt = (R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1);
		if (cnt > 1 && cnt <= 400000) {
			var sum = 0, n = 0, filled = 0, c2 = Math.min(R.c2, nCols - 1);
			for (var r = Math.max(R.r1, minRow()); r <= R.r2; r++) {
				var ar = actualRow(r); if (ar == null || ar >= nRows) { if (!view()) break; continue; }
				var row = data()[ar]; if (!row) continue;
				for (var c = R.c1; c <= c2; c++) { var cell = row[c]; if (!cell || cell.t === "z") continue; filled++; if (cell.t === "n" && typeof cell.v === "number") { sum += cell.v; n++; } }
			}
			if (n) parts.push("<span>Sum <b>" + esc(X.fmtGeneral(+sum.toPrecision(15))) + "</b> &middot; Average <b>" + esc(X.fmtGeneral(+(sum / n).toPrecision(15))) + "</b> &middot; Count <b>" + nf(filled) + "</b></span>");
			else if (filled) parts.push("<span>Count <b>" + nf(filled) + "</b></span>");
		}
		var cell1 = getCell(actualRow(sel.ar), sel.ac);
		if (cell1 && cell1.f) {
			var unk = []; try { unk = X.unknownFunctions(X.parse(cell1.f)); } catch (e) { unk = ["?"]; }
			if (unk.length) parts.push('<span class="xl-warn">' + (unk[0] === "?" ? "This formula can't be read here" : "Uses " + esc(unk.join(", ")) + ", which this page can't calculate") + ": showing the value saved in the file.</span>");
		}
		var ns = Object.keys(stale).length;
		if (ns) parts.push('<span class="xl-warn">' + nf(ns) + " formula" + (ns > 1 ? "s were" : " was") + " not recalculated (marked with a corner)</span>");
		$("xl-status").innerHTML = parts.join("");
	}

	/* ---------- editing ---------- */
	function placeEditor() {
		var I = scrollInfo(), dr = editing.dr, c = editing.c;
		ed.style.visibility = editing.si != null && editing.si !== si ? "hidden" : "";
		var top = dr < 0 ? CHH + (dr + base) * RH : CHH + FR + dr * RH - I.P, left = c < FC ? HW + colX[c] : HW + colX[c] - I.sl;
		ed.style.left = left + "px"; ed.style.top = top + "px";
		ed.style.minWidth = (colX[c + 1] - colX[c] + 1) + "px"; ed.style.height = "auto";
		ed.style.width = "1px"; ed.style.width = Math.min(grid.clientWidth - left - 4, Math.max(colX[c + 1] - colX[c] + 1, ed.scrollWidth + 6)) + "px";
		ed.style.height = Math.max(RH + 1, ed.scrollHeight + 2) + "px";
		paintEdHL();
	}
	function startEdit(text, where) {
		if (!wb) return;
		if (editing) commitEdit();
		var ar = actualRow(sel.ar), cell = getCell(ar, sel.ac);
		editing = { dr: sel.ar, c: sel.ac, ar: ar, si: si, where: where || "cell", orig: cell && cell.sp ? "" : editText(cell), mode: text != null ? "enter" : "edit", pick: null };
		if (editing.where === "cell") {
			ed.hidden = false; ed.value = text != null ? text : (cell && cell.sp ? "" : editing.orig);
			placeEditor(); ed.focus(); var n = ed.value.length; ed.setSelectionRange(n, n);
			fxin.value = ed.value;
		}
		refHL(); status();
	}
	function cancelEdit() { if (!editing) return; backToEditSheet(); var w = editing.where; editing = null; ed.hidden = true; hlRefs = []; paintEdHL(); fxin.value = editText(getCell(actualRow(sel.ar), sel.ac)); if (w === "cell") scroll.focus({ preventScroll: true }); note(""); render(); status(); }
	function commitEdit() {
		if (!editing) return true;
		var e = editing, val = e.where === "cell" ? ed.value : fxin.value;
		if (isFormulaText(val)) val = autoClose(val);
		backToEditSheet();
		if (val === e.orig) { editing = null; ed.hidden = true; hlRefs = []; paintEdHL(); render(); return true; }
		try { setCells([{ r: e.ar, c: e.c, text: val }], "Edit " + X.a1(e.ar, e.c)); }
		catch (err) { note(esc(err.message || "That formula can't be read."), true); if (e.where === "cell") ed.focus(); else fxin.focus(); return false; }
		editing = null; ed.hidden = true; hlRefs = []; paintEdHL(); note(""); render();
		return true;
	}
	function buildCell(text, old) {
		var p = X.parseInput(text), cell;
		if (p.f != null) {
			var ast;
			try { ast = X.parse(p.f); } catch (e) { throw new Error("That formula can't be read: " + e.message + " (start with an apostrophe, like '=, to type it as text)"); }
			var unk = X.unknownFunctions(ast);
			cell = unk.length ? { t: "e", v: 29, w: "#NAME?", f: p.f, da: 1 } : { t: "n", v: 0, f: p.f, da: 1 };
			if (old && old.z) cell.z = old.z;
		} else if (p.t === "z") {
			if (old && (old.s || old.xs != null || old.ml || old.z)) { var stub = { t: "z" }; if (old.s) stub.s = old.s; if (old.ml) stub.ml = old.ml; if (old.z) stub.z = old.z; if (old.xs != null) { stub.xs = old.xs; stub.xz = old.xz; } return stub; }
			return undefined;
		} else {
			cell = { t: p.t, v: p.v };
			if (p.z) cell.z = p.z;
			if (p.z && /%/.test(p.z) && old && old.z && /%/.test(old.z)) cell.z = old.z;   // "50%" typed into a 0.0% cell keeps 0.0%
			else if (p.t === "n" && old && old.z && old.t === "n") cell.z = old.z;
		}
		if (old && old.s) cell.s = old.s;
		if (old && old.ml) cell.ml = old.ml;
		if (old && old.xs != null) { cell.xs = old.xs; cell.xz = old.xz; if (!cell.z && old.xz && old.t === "z" && p.t === "n") cell.z = old.xz; }
		return cell;
	}
	function ensureCalc() {
		if (!calc) calc = new X.Calc({ sheets: wb.SheetNames.map(function (n) { return { name: n, get data() { var w = wb.Sheets[n]; if (!w["!data"]) w["!data"] = []; return w["!data"]; } }; }), names: bookNames, tables: calcTables });
		return calc;
	}
	function resetCalc() { calc = null; }
	function writeCells(s, list, which) {
		var w = wb.Sheets[wb.SheetNames[s]], d = w["!data"] || (w["!data"] = []), C = ensureCalc(), changed = [];
		list.forEach(function (x) {
			var cell = x[which];
			if (!d[x.r]) d[x.r] = [];
			d[x.r][x.c] = cell;
			if (cell && cell.f) C.add(s, x.r, x.c, cell.f); else C.remove(s, x.r, x.c);
			delete stale[s + ":" + x.r + ":" + x.c];
			changed.push({ si: s, r: x.r, c: x.c });
		});
		var res = C.recalc(changed);
		res.stale.forEach(function (p) { stale[p.si + ":" + p.r + ":" + p.c] = p.unknown; });
		if (res.cycles) { var cc = res.cycleCells[0]; note("Circular reference: a formula refers to its own cell" + (cc ? " (" + esc((cc.si !== s ? wb.SheetNames[cc.si] + "!" : "") + X.a1(cc.r, cc.c)) + ")" : "") + ", directly or through other cells, so it shows #CYCLE!.", true); }
		return res;
	}
	function setCells(list, label) {
		var s = si, ch = [];
		list.forEach(function (x) { var b = getCell(x.r, x.c); var a = buildCell(x.text, b); if (!b && !a) return; ch.push({ r: x.r, c: x.c, b: b, a: a }); });
		if (!ch.length) return;
		var res = writeCells(s, ch, "a");
		pushUndo({ k: "cells", si: s, ch: ch, label: label });
		afterChange(ch.some(function (x) { return x.r >= nRows || x.c >= nCols; }) || ch.some(function (x) { return !x.a; }) || !!(res && res.spilled.length));
	}
	function afterChange(redim) {
		if (redim) { var r0 = NR, c0 = NC; dims(); setRef(); layout(); if (NR !== r0 || NC !== c0) clampSel(); }
		dver++; file.dirty = true; file.saved = false; renderName(); showActive(); render(); drawObjects(); autosave();
		if (hits.length || $("xl-q").value) runFind(true);
	}
	function pushUndo(op) { undo.push(op); if (undo.length > 200) undo.shift(); var structs = undo.filter(function (o) { return o.k === "struct"; }); if (structs.length > 12) undo.splice(undo.indexOf(structs[0]), 1); redo = []; undoBtns(); }
	function undoBtns() { $("xl-undo").disabled = !undo.length; $("xl-redo").disabled = !redo.length; $("xl-undo").title = undo.length ? "Undo " + (undo[undo.length - 1].label || "") + " (Ctrl+Z)" : "Undo (Ctrl+Z)"; }
	function doUndo(isRedo) {
		if (editing) cancelEdit();
		var from = isRedo ? redo : undo, to = isRedo ? undo : redo, op = from.pop();
		if (!op) return;
		if (op.k === "cells") {
			if (op.si !== si) showSheet(op.si);
			if (op.nocalc) { var d0 = wb.Sheets[wb.SheetNames[op.si]]["!data"]; op.ch.forEach(function (x) { if (!d0[x.r]) d0[x.r] = []; d0[x.r][x.c] = isRedo ? x.a : x.b; }); cssCache = {}; }
			else writeCells(op.si, op.ch, isRedo ? "a" : "b");
			var f = op.ch[0], dr = displayRow(f.r);
			if (dr != null) { sel.ar = sel.fr = dr; sel.ac = sel.fc = f.c; }
		} else if (op.k === "struct") {
			restore(isRedo ? op.after : op.before);
			if (op.si != null && op.si < wb.SheetNames.length) si = op.si;
			afterStruct();
		}
		to.push(op); undoBtns();
		afterChange(true);
		toast((isRedo ? "Redo: " : "Undo: ") + (op.label || "change"));
	}

	/* ---------- structural changes (rows, columns, sheets) ---------- */
	function snapshot() {
		var snap = { names: wb.SheetNames.slice(), wbs: wb.Workbook && wb.Workbook.Sheets ? JSON.parse(JSON.stringify(wb.Workbook.Sheets)) : null, sheets: {} };
		wb.SheetNames.forEach(function (n) {
			var w = wb.Sheets[n];
			snap.sheets[n] = { ws: w, data: (w["!data"] || []).map(function (r) { return r && r.slice(); }), cols: w["!cols"] ? w["!cols"].map(function (o) { return o && Object.assign({}, o); }) : null, ref: w["!ref"],
				rows: w["!rows"] ? w["!rows"].slice() : null, merges: w["!merges"] ? w["!merges"].map(function (g) { return { s: Object.assign({}, g.s), e: Object.assign({}, g.e) }; }) : null,
				mine: JSON.stringify({ t: (w["!mestables"] || []).map(function (t) { var o = Object.assign({}, t); delete o.els; return o; }), c: (w["!mescharts"] || []).map(function (c) { return { id: c.id, m: c.m, range: c.range, byRow: c.byRow, at: c.at, name: c.name }; }), f: w["!mescf"] || [] }) };
		});
		return snap;
	}
	function restore(snap) {
		wb.SheetNames = snap.names.slice(); wb.Sheets = {};
		if (snap.wbs && wb.Workbook) wb.Workbook.Sheets = JSON.parse(JSON.stringify(snap.wbs));
		snap.names.forEach(function (n) {
			var s = snap.sheets[n], w = s.ws;
			w["!data"] = s.data.map(function (r) { return r && r.slice(); });
			if (s.cols) w["!cols"] = s.cols.map(function (o) { return o && Object.assign({}, o); }); else delete w["!cols"];
			if (s.rows) w["!rows"] = s.rows.slice(); else delete w["!rows"];
			if (s.merges) w["!merges"] = s.merges.map(function (g) { return { s: Object.assign({}, g.s), e: Object.assign({}, g.e) }; }); else delete w["!merges"];
			w["!ref"] = s.ref; wb.Sheets[n] = w;
			var mine = JSON.parse(s.mine || "{}"); w["!mestables"] = mine.t || []; w["!mescharts"] = (mine.c || []).map(function (c) { chartBuild(c); return c; }); w["!mescf"] = mine.f || [];
		});
		stale = {}; cssCache = {}; cfc = null;
	}
	function afterStruct() { resetCalc(); views = {}; si = Math.min(si, wb.SheetNames.length - 1); dims(); layout(); ensureView(); renderSheets(); clampSel(); }
	function struct(label, fn, soft) {
		if (editing) commitEdit();
		var hadView = isSF();
		if (view()) { views[wb.SheetNames[si]] = null; layout(); }
		if (file && !soft) file.structN = (file.structN || 0) + 1;
		var before = snapshot(), s0 = si;
		var changedF = fn(); stale = {};
		var after = snapshot();
		resetCalc();
		if (changedF && changedF.length) { var C = ensureCalc(), res = C.recalc(changedF); res.stale.forEach(function (p) { stale[p.si + ":" + p.r + ":" + p.c] = p.unknown; }); }
		pushUndo({ k: "struct", before: before, after: after, si: s0, label: label });
		afterStruct();
		afterChange(true);
		if (hadView) note("The sort / filter view was cleared before changing rows or columns.");
	}
	function adjustAll(op) {
		var changed = [];
		wb.SheetNames.forEach(function (n, s) {
			var d = wb.Sheets[n]["!data"] || [];
			for (var r = 0; r < d.length; r++) {
				var row = d[r]; if (!row) continue;
				for (var c = 0; c < row.length; c++) {
					var cell = row[c]; if (!cell || !cell.f) continue;
					var f2 = X.adjust(cell.f, { axis: op.axis, at: op.at, n: op.n, sheet: op.sheet, here: n });
					if (f2 !== cell.f) { var nc = Object.assign({}, cell, { f: f2 }); delete nc.w; row[c] = nc; changed.push({ s: s, r: r, c: c }); }
				}
			}
		});
		return changed;
	}
	function finalPositions(changed) { return changed.map(function (p) { return { si: p.s, r: p.r, c: p.c }; }); }
	function insertRows(at, n) {
		struct((n > 0 ? "Insert " : "Delete ") + Math.abs(n) + " row" + (Math.abs(n) > 1 ? "s" : ""), function () {
			var d = data(), name = wb.SheetNames[si];
			if (n > 0) { while (d.length < at) d.push(undefined); var add = []; for (var i = 0; i < n; i++) add.push(undefined); Array.prototype.splice.apply(d, [at, 0].concat(add)); }
			else d.splice(at, -n);
			var rm = ws()["!rows"]; if (rm && rm.length > at) { if (n > 0) Array.prototype.splice.apply(rm, [at, 0].concat(new Array(n))); else rm.splice(at, -n); }
			shiftMerges("r", at, n); shiftObjects("r", at, n, name);
			return finalPositions(adjustAll({ axis: "r", at: at, n: n, sheet: name }));
		});
	}
	function insertCols(at, n) {
		struct((n > 0 ? "Insert " : "Delete ") + Math.abs(n) + " column" + (Math.abs(n) > 1 ? "s" : ""), function () {
			var d = data(), name = wb.SheetNames[si], w = ws();
			var spl = function (arr) { if (!arr) return; if (n > 0) { if (arr.length < at) return; var add = []; for (var i = 0; i < n; i++) add.push(undefined); Array.prototype.splice.apply(arr, [at, 0].concat(add)); } else arr.splice(at, -n); };
			d.forEach(function (row, i) { if (row) spl(row); });
			if (w["!cols"]) spl(w["!cols"]);
			shiftMerges("c", at, n); shiftObjects("c", at, n, name);
			return finalPositions(adjustAll({ axis: "c", at: at, n: n, sheet: name }));
		});
	}
	function shiftMerges(axis, at, n) {
		var w = ws(), list = w["!merges"]; if (!list || !list.length) return;
		var k = axis, out = [];
		list.forEach(function (g0) {
			var g = { s: Object.assign({}, g0.s), e: Object.assign({}, g0.e) };
			if (n > 0) { if (g.s[k] >= at) g.s[k] += n; if (g.e[k] >= at) g.e[k] += n; }
			else { var a = at, b = at - n - 1; if (g.e[k] < a) { /* above */ } else if (g.s[k] > b) { g.s[k] += n; g.e[k] += n; } else { var s2 = g.s[k] < a ? g.s[k] : a, e2 = g.e[k] > b ? g.e[k] + n : a - 1; if (e2 < s2) return; g.s[k] = s2; g.e[k] = e2; } }
			if (g.e.r > g.s.r || g.e.c > g.s.c) out.push(g);
		});
		w["!merges"] = out;
	}
	function rowsCols(kind) {
		if (!wb) return;
		var R = selRect(), rows = selectedActualRows().filter(function (r) { return r != null; });
		var rmin = Math.min.apply(null, rows), rmax = Math.max.apply(null, rows);
		if (isSF()) { rmin = actualRow(Math.max(R.r1, minRow())); rmax = rmin; }
		var nrSel = rmax - rmin + 1, ncSel = R.c2 - R.c1 + 1;
		if (sel.mode === "all") { nrSel = Math.max(1, nRows); ncSel = Math.max(1, nCols); }
		if (kind === "row-above") insertRows(rmin, sel.mode === "row" ? nrSel : 1);
		else if (kind === "row-below") insertRows(rmax + 1, sel.mode === "row" ? nrSel : 1);
		else if (kind === "row-del") { if (nrSel > 1000 && !confirm("Delete " + nf(nrSel) + " rows?")) return; insertRows(rmin, -Math.min(nrSel, Math.max(1, nRows - rmin))); }
		else if (kind === "col-left") insertCols(R.c1, sel.mode === "col" ? ncSel : 1);
		else if (kind === "col-right") insertCols(R.c2 + 1, sel.mode === "col" ? ncSel : 1);
		else if (kind === "col-del") insertCols(R.c1, -ncSel);
		else if (kind === "sheet-add") addSheet();
		else if (kind === "sheet-ren") renameSheet(si);
		else if (kind === "sheet-del") deleteSheet(si);
	}
	function addSheet() {
		var name = X.safeSheetName("Sheet" + (wb.SheetNames.length + 1), wb.SheetNames);
		struct("Add sheet", function () { window.XLSX.utils.book_append_sheet(wb, { "!data": [], "!ref": "A1" }, name); si = wb.SheetNames.length - 1; return []; });
		si = wb.SheetNames.length - 1; showSheet(si);
	}
	function renameSheet(i) {
		var old = wb.SheetNames[i], nn = prompt("New name for the sheet “" + old + "”:", old);
		if (nn == null) return;
		nn = X.safeSheetName(nn, wb.SheetNames.filter(function (x, j) { return j !== i; }));
		if (nn === old) return;
		struct("Rename sheet", function () {
			var changed = [];
			wb.SheetNames[i] = nn; wb.Sheets[nn] = wb.Sheets[old]; delete wb.Sheets[old];
			if (wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]) wb.Workbook.Sheets[i].name = nn;
			wb.SheetNames.forEach(function (n, s) { var d = wb.Sheets[n]["!data"] || []; d.forEach(function (row, r) { if (row) row.forEach(function (cell, c) { if (cell && cell.f) { var f2 = X.renameSheetRefs(cell.f, old, nn); if (f2 !== cell.f) { row[c] = Object.assign({}, cell, { f: f2 }); changed.push({ si: s, r: r, c: c }); } } }); }); });
			wb.SheetNames.forEach(function (n) { (wb.Sheets[n]["!mescharts"] || []).forEach(function (ch) { if (ch.m.sheet === old) ch.m.sheet = nn; ch.m.series.forEach(function (sr) { ["name", "cat", "val"].forEach(function (k) { if (sr[k] && sr[k].sheet === old) sr[k].sheet = nn; }); }); chartBuild(ch); }); });
			return [];
		});
	}
	function deleteSheet(i) {
		if (wb.SheetNames.length < 2) { toast("A workbook needs at least one sheet."); return; }
		if (!confirm("Delete the sheet “" + wb.SheetNames[i] + "”? (Undo brings it back.)")) return;
		struct("Delete sheet", function () {
			var n = wb.SheetNames[i]; wb.SheetNames.splice(i, 1); delete wb.Sheets[n];
			if (wb.Workbook && wb.Workbook.Sheets) wb.Workbook.Sheets.splice(i, 1);
			si = Math.max(0, i - 1);
			var all = []; wb.SheetNames.forEach(function (nm, s) { (wb.Sheets[nm]["!data"] || []).forEach(function (row, r) { if (row) row.forEach(function (cell, c) { if (cell && cell.f && cell.f.indexOf(n) >= 0) all.push({ si: s, r: r, c: c }); }); }); });
			return all;
		});
	}

	/* ---------- sheets ---------- */
	function renderSheets() {
		var hidden = function (i) { var s = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]; return s && s.Hidden; };
		$("xl-stabs").innerHTML = wb.SheetNames.map(function (n, i) {
			var h = hidden(i), x = sx(wb.Sheets[n]), tc = x && x.tabColor;
			var lab = h === 2 ? "very hidden" : h ? "hidden" : "";
			return '<button type="button" class="xl-stab' + (i === si ? " is-on" : "") + (h ? " is-hid" : "") + '" role="tab" aria-selected="' + (i === si) + '" data-si="' + i + '" title="' + esc(n) + (h === 2 ? " (very hidden: Excel only shows it through VBA)" : h ? " (hidden in Excel: right-click a tab and choose Unhide there)" : "") + ' (double-click to rename)"' + (tc ? ' style="box-shadow:inset 0 -3px 0 #' + tc + '"' : "") + ">" + (h ? '<span class="xl-eye" aria-hidden="true">&#9680;</span> ' : "") + esc(n) + (lab ? ' <small class="xl-hidl">(' + lab + ")</small>" : "") + "</button>";
		}).join("");
	}
	function showSheet(i, keepEdit) {
		if (editing && !keepEdit) commitEdit();
		if (wb.SheetNames[si]) views["@" + wb.SheetNames[si]] = { st: scroll.scrollTop, sl: scroll.scrollLeft, sel: Object.assign({}, sel) };
		si = i; hits = []; hitSet = null; hitIx = -1; $("xl-qn").textContent = "";
		dims(); layout(); renderSheets();
		var back = views["@" + wb.SheetNames[si]];
		if (back) { sel = back.sel; scroll.scrollTop = back.st; scroll.scrollLeft = back.sl; } else { sel = { ar: 0, ac: 0, fr: 0, fc: 0, mode: "" }; scroll.scrollTop = 0; scroll.scrollLeft = 0; }
		ensureView();
		clampSel(); showActive(); renderFilterBar(); render(); drawObjects();
		var hs = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[si];
		if (hs && hs.Hidden) note("“" + esc(wb.SheetNames[si]) + "” is a " + (hs.Hidden === 2 ? "very hidden" : "hidden") + " sheet: Excel does not show its tab. <button type=\"button\" class=\"xl-link\" id=\"xl-unhide\">Unhide it in the saved file</button>");
		else if ($("xl-unhide")) note("");
		var ub = $("xl-unhide"); if (ub) ub.onclick = function () { var s2 = wb.Workbook.Sheets[si]; if (s2) s2.Hidden = 0; note(""); renderSheets(); file.dirty = true; file.saved = false; renderName(); autosave(); toast("The sheet will be visible when you save the file."); };
		if ($("xl-q").value) runFind(true);
		var b = $("xl-stabs").querySelector(".is-on"); if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "nearest" });
	}
	$("xl-stabs").addEventListener("pointerdown", function (e) { if (editing && isFormulaText(edText()) && e.target.closest("[data-si]")) e.preventDefault(); });
	$("xl-stabs").addEventListener("click", function (e) { var b = e.target.closest("[data-si]"); if (!b) return; var i = +b.getAttribute("data-si"); if (editing && isFormulaText(edText())) { if (i !== si) editSheetSwitch(i); else (editing.where === "bar" ? fxin : ed).focus(); return; } if (i !== si) showSheet(i); });
	$("xl-stabs").addEventListener("dblclick", function (e) { var b = e.target.closest("[data-si]"); if (b) renameSheet(+b.getAttribute("data-si")); });
	$("xl-sadd").onclick = function () { if (!wb) newBook(); else addSheet(); };

	/* ---------- sort / filter view ---------- */
	function vstate() { var n = wb.SheetNames[si]; return views[n] || (views[n] = { sort: null, filters: [], rows: null }); }
	// keep: true = leave the selection and scroll position alone (hidden rows toggled, freeze changed, file loaded)
	function computeView(keep) {
		setFrozen();
		var v = vstate(), d = data(), hid = !S.showHidden && hiddenCounts().r > 0, ar = keep ? actualRow(sel.ar) : null;
		var rows = X.viewRows({ nrows: nRows, header: base, sort: v.sort, filters: v.filters, hidden: hid ? rowHid : null,
			value: function (r, c) { var row = d[r]; return X.cellValue(row ? row[c] : undefined); },
			text: function (r, c) { var row = d[r]; return disp(row ? row[c] : undefined); } });
		if (rows && base) rows.splice(0, base);
		if (rows) { v.dataN = rows.length; if (!(v.sort || v.filters.length)) for (var r = nRows; r < nRows + 60; r++) rows.push(r); }   // room to type below the data
		v.rows = rows; v.inv = null;
		layout();
		if (keep) { var dr = ar == null ? null : displayRow(ar); if (dr == null) dr = drNear(ar || 0); sel = { ar: dr == null ? 0 : dr, ac: sel.ac, fr: dr == null ? 0 : dr, fc: sel.ac, mode: "" }; }
		else { sel = { ar: base ? -1 : 0, ac: sel.ac, fr: base ? -1 : 0, fc: sel.ac, mode: "" }; scroll.scrollTop = 0; }
		clampSel(); showActive(); renderFilterBar(); render(); drawObjects();
		if ($("xl-q").value) runFind(true);
	}
	// a view is needed for a sort / filter, or to leave hidden rows out
	function ensureView() {
		if (!wb) return;
		var v = vstate();
		if (v.sort || v.filters.length || (!S.showHidden && hiddenCounts().r > 0)) computeView(true);
		else if (v.rows) { var ar = actualRow(sel.ar); v.rows = null; v.inv = null; layout(); var dr = displayRow(ar); sel.ar = sel.fr = dr == null ? 0 : dr; clampSel(); render(); drawObjects(); }
	}
	function sortBy(dir) { if (!wb) return; var v = vstate(); v.sort = { c: sel.ac, dir: dir }; computeView(); toast("Sorted by column " + X.colName(sel.ac) + (dir > 0 ? ", A to Z" : ", Z to A") + ". The file itself is not changed."); }
	$("xl-sasc").onclick = function () { sortBy(1); };
	$("xl-sdesc").onclick = function () { sortBy(-1); };
	function colLabel(c) { var h = base ? disp(getCell(0, c)) : ""; return X.colName(c) + (h ? ": " + (h.length > 24 ? h.slice(0, 23) + "…" : h) : ""); }
	function renderFilterBar() {
		if (!wb) return;
		var v = views[wb.SheetNames[si]], bar = $("xl-filterbar");
		var on = !bar.hidden;
		$("xl-filt").setAttribute("aria-pressed", String(on || !!(v && v.filters && v.filters.length)));
		var opts = []; for (var c = 0; c < Math.max(nCols, 1) && c < 500; c++) opts.push('<option value="' + c + '"' + (c === sel.ac ? " selected" : "") + ">" + esc(colLabel(c)) + "</option>");
		$("xl-fcol").innerHTML = opts.join("");
		var chips = [];
		if (v && v.sort) chips.push('<span class="xl-chip">Sorted by ' + esc(X.colName(v.sort.c)) + (v.sort.dir > 0 ? " ↑" : " ↓") + '<button type="button" data-rm="sort" aria-label="Remove the sort">&times;</button></span>');
		(v && v.filters || []).forEach(function (f, i) { chips.push('<span class="xl-chip">' + esc(X.colName(f.c)) + " " + esc(X.FILTER_OPS[f.op]) + (f.op === "blank" || f.op === "notblank" ? "" : f.op === "in" ? " " + esc(f.v) + (f.t ? " (" + esc(f.t) + ")" : "") : " “" + esc(f.v) + "”") + '<button type="button" data-rm="' + i + '" aria-label="Remove this filter">&times;</button></span>'); });
		$("xl-fchips").innerHTML = chips.join("");
		$("xl-fclear").hidden = !chips.length;
		if (chips.length && bar.hidden) bar.hidden = false;
	}
	$("xl-filt").onclick = function () { if (!wb) return; var bar = $("xl-filterbar"); bar.hidden = !bar.hidden; renderFilterBar(); if (!bar.hidden) $("xl-fval").focus(); };
	$("xl-fop").onchange = function () { $("xl-fval").disabled = /blank/.test(this.value); };
	function addFilter() {
		var c = +$("xl-fcol").value, op = $("xl-fop").value, val = $("xl-fval").value;
		if (!/blank/.test(op) && val === "") { $("xl-fval").focus(); return; }
		vstate().filters.push({ c: c, op: op, v: val }); $("xl-fval").value = ""; computeView();
	}
	$("xl-fadd").onclick = addFilter;
	$("xl-fval").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addFilter(); } });
	$("xl-fchips").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (!b) return; var v = vstate(), w = b.getAttribute("data-rm"); if (w === "sort") v.sort = null; else v.filters.splice(+w, 1); computeView(); });
	$("xl-fclear").onclick = function () { var v = vstate(); v.sort = null; v.filters = []; computeView(); };
	// freeze panes: top row, first column, at the selected cell, as in the file, or none
	function setFreeze(kind) {
		if (!wb) return;
		if (editing) commitEdit();
		var w = ws(), ar = actualRow(sel.ar), x = sx(), was = frzOf();
		if (kind === "top") { w["!mesfrz"] = { r: 1, c: 0 }; S.freeze = true; }
		else if (kind === "col") w["!mesfrz"] = { r: 0, c: 1 };
		else if (kind === "sel") w["!mesfrz"] = { r: Math.min(30, ar == null ? 0 : ar), c: Math.min(30, sel.ac) };
		else if (kind === "file") delete w["!mesfrz"];
		else { w["!mesfrz"] = { r: 0, c: 0 }; S.freeze = false; }
		save();
		var now = frzOf();
		if (now.r !== was.r || now.c !== was.c) { file.dirty = true; file.saved = false; renderName(); autosave(); }
		if (view() || now.r !== was.r) { var v = vstate(); if (v.rows || v.sort || v.filters.length) { computeView(true); } else { layout(); var dr = displayRow(ar); select(dr == null ? 0 : dr, sel.ac); } }
		else layout();
		if (now.c && sel.ac < now.c) scroll.scrollLeft = 0;
		renderFilterBar(); render(); drawObjects(); status();
		toast(now.r || now.c ? "Frozen: " + (now.r ? now.r + " row" + (now.r > 1 ? "s" : "") : "") + (now.r && now.c ? " and " : "") + (now.c ? now.c + " column" + (now.c > 1 ? "s" : "") : "") : "Nothing frozen");
	}
	$("xl-frzmenu").addEventListener("click", function (e) { var b = e.target.closest("[data-frz]"); if (!b) return; closeMenus(); setFreeze(b.getAttribute("data-frz")); });
	$("xl-hid").onclick = function () { if (!wb) return; if (editing) commitEdit(); S.showHidden = !S.showHidden; save(); ensureView(); layout(); render(); drawObjects(); status(); };
	$("xl-objbtn").onclick = function () { if (!wb) return; S.objs = !S.objs; save(); toolState(); drawObjects(true); };

	/* ---------- find ---------- */
	var findT = 0;
	function runFind(keep) {
		var q = $("xl-q").value.trim().toLowerCase();
		hits = []; hitSet = null;
		if (!wb || !q) { $("xl-qn").textContent = ""; hitIx = -1; render(); return; }
		var d = data(), cap = 20000;
		outer: for (var r = 0; r < d.length; r++) { var row = d[r]; if (!row) continue; for (var c = 0; c < row.length; c++) { var cell = row[c]; if (!cell) continue; if (disp(cell).toLowerCase().indexOf(q) >= 0 || (cell.f && cell.f.toLowerCase().indexOf(q) >= 0)) { hits.push([r, c]); if (hits.length >= cap) break outer; } } }
		hitSet = new Set(hits.map(function (h) { return h[0] + ":" + h[1]; }));
		if (!keep) hitIx = -1;
		$("xl-qn").textContent = hits.length ? (hitIx >= 0 ? hitIx + 1 + " of " : "") + nf(hits.length) + (hits.length >= cap ? "+" : "") + (hitIx >= 0 ? "" : " found") : "No matches";
		render();
	}
	function gotoHit(step) {
		if (!hits.length) { runFind(); if (!hits.length) return; }
		hitIx = (hitIx + step + hits.length) % hits.length;
		var h = hits[hitIx], dr = displayRow(h[0]);
		$("xl-qn").textContent = (hitIx + 1) + " of " + nf(hits.length);
		if (dr == null) { note("Match " + (hitIx + 1) + " (" + esc(X.a1(h[0], h[1])) + ") is hidden by the filter. <button type=\"button\" class=\"xl-link\" id=\"xl-unf\">Clear the filter</button>"); var b = $("xl-unf"); if (b) b.onclick = function () { note(""); $("xl-fclear").click(); }; return; }
		note(""); select(dr, h[1]);
	}
	$("xl-q").addEventListener("input", function () { clearTimeout(findT); findT = setTimeout(function () { runFind(); }, 220); });
	$("xl-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(findT); if (!hits.length) runFind(); gotoHit(e.shiftKey ? -1 : 1); } else if (e.key === "Escape") { this.value = ""; runFind(); scroll.focus(); } });
	$("xl-qnext").onclick = function () { gotoHit(1); };
	$("xl-qprev").onclick = function () { gotoHit(-1); };

	/* ---------- pointer: select, drag, resize columns, headers ---------- */
	function hitCell(e, el) {
		var r = el.getBoundingClientRect(), I = scrollInfo();
		var x = e.clientX - r.left + I.sl, y = e.clientY - r.top;
		return { dr: Math.min(NR - 1, Math.max(0, Math.floor((y + I.P) / RH))), c: Math.max(FC, colAt(Math.max(0, x) + FW)) };
	}
	var drag = null;
	scroll.addEventListener("pointerdown", function (e) {
		if (!wb || e.button > 0) return;
		var p = hitCell(e, scroll);
		if (e.clientX - scroll.getBoundingClientRect().left > scroll.clientWidth || e.clientY - scroll.getBoundingClientRect().top > scroll.clientHeight) return;  // scroll bars
		if (e.target.closest && (e.target.closest(".xl-fh") || e.target.closest(".xl-tfb"))) return;
		if (editing && tryPoint(p, e)) return;
		if (editing) { if (!commitEdit()) return; }
		if (e.pointerType === "touch" || e.pointerType === "pen") { drag = { touch: true, x: e.clientX, y: e.clientY, p: p }; return; }
		e.preventDefault(); scroll.focus({ preventScroll: true });
		select(p.dr, p.c, e.shiftKey);
		drag = { el: scroll };
		try { scroll.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
	});
	scroll.addEventListener("pointermove", function (e) {
		if (!drag || drag.touch || drag.el !== scroll) return;
		var rect = scroll.getBoundingClientRect();
		if (drag.point) { if (!editing || !editing.pick) return; var pp = hitCell(e, scroll), pk = editing.pick; if (pp.dr !== pk.dr1 || pp.c !== pk.c1) pointSet(pk.dr0, pk.c0, pp.dr, pp.c); return; }
		if (e.clientY > rect.bottom - 6) scroll.scrollTop += RH; else if (e.clientY < rect.top + 6) scroll.scrollTop -= RH;
		if (e.clientX > rect.right - 6) scroll.scrollLeft += 40; else if (e.clientX < rect.left + 6) scroll.scrollLeft -= 40;
		var p = hitCell(e, scroll);
		if (p.dr !== sel.fr || p.c !== sel.fc) { sel.fr = p.dr; sel.fc = p.c; showActive(); render(); }
	});
	scroll.addEventListener("pointerup", function (e) {
		if (drag && drag.touch && Math.abs(e.clientX - drag.x) < 10 && Math.abs(e.clientY - drag.y) < 10) {
			var p = drag.p, again = p.dr === sel.ar && p.c === sel.ac && sel.ar === sel.fr && sel.ac === sel.fc;
			if (again) startEdit(); else select(p.dr, p.c);
		}
		drag = null;
	});
	scroll.addEventListener("pointercancel", function () { drag = null; });
	scroll.addEventListener("dblclick", function (e) { if (!wb) return; var p = hitCell(e, scroll); select(p.dr, p.c); startEdit(); });
	// clicks in the frozen parts: frozen rows (xl-frz), the corner block (xl-frzc) and frozen columns (xl-fcols)
	function frozenDown(e) {
		if (!wb || e.button > 0) return;
		var r = this.getBoundingClientRect(), id = this.id, x = e.clientX - r.left, y = e.clientY - r.top, dr, c;
		if (id === "xl-fcols") { dr = Math.min(NR - 1, Math.max(0, Math.floor((y + scrollInfo().P) / RH))); c = Math.min(FC - 1, colAt(x)); }
		else { dr = Math.min(-1, Math.floor(y / RH) - base); c = id === "xl-frzc" ? Math.min(FC - 1, colAt(x)) : Math.max(FC, colAt(x + scroll.scrollLeft + FW)); }
		if (editing && tryPoint({ dr: dr, c: c }, e)) return;
		if (editing && !commitEdit()) return;
		e.preventDefault(); scroll.focus({ preventScroll: true });
		if (e.detail > 1) { select(dr, c); startEdit(); return; }
		select(dr, c, e.shiftKey);
	}
	["xl-frz", "xl-frzc", "xl-fcols"].forEach(function (id) { $(id).addEventListener("pointerdown", frozenDown); });
	function rowHeadDown(e) {
		var t = e.target.closest("[data-dr]"); if (!t || !wb) return;
		if (editing && !commitEdit()) return;
		e.preventDefault(); scroll.focus({ preventScroll: true });
		var dr = +t.getAttribute("data-dr");
		if (e.shiftKey) { sel.fr = dr; } else { sel.ar = sel.fr = dr; }
		sel.ac = 0; sel.fc = Math.max(0, Math.max(nCols, 1) - 1); sel.mode = "row"; clampSel(); showActive(); render();
	}
	$("xl-rowh").addEventListener("pointerdown", rowHeadDown);
	$("xl-frzh").addEventListener("pointerdown", rowHeadDown);
	$("xl-corner").addEventListener("pointerdown", function (e) { if (!wb) return; e.preventDefault(); sel = { ar: minRow(), ac: 0, fr: Math.max(minRow(), dataN() - 1), fc: Math.max(0, nCols - 1), mode: "all" }; clampSel(); showActive(); render(); scroll.focus({ preventScroll: true }); });
	var rz = null;
	$("xl-colh").addEventListener("pointerdown", function (e) {
		if (!wb) return;
		var h = e.target.closest("[data-rz]");
		if (h) {
			e.preventDefault(); var c = +h.getAttribute("data-rz");
			rz = { c: c, x: e.clientX, w: colX[c + 1] - colX[c], h: h }; h.classList.add("is-drag");
			try { this.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			return;
		}
		var t = e.target.closest("[data-c]"); if (!t) return;
		if (editing && !commitEdit()) return;
		e.preventDefault(); scroll.focus({ preventScroll: true });
		var col = +t.getAttribute("data-c"), last = Math.max(minRow(), dataN() - 1);
		if (e.shiftKey) sel.fc = col; else { sel.ac = sel.fc = col; }
		sel.ar = minRow(); sel.fr = Math.max(last, minRow()); sel.mode = "col"; clampSel(); showActive(); render();
	});
	$("xl-colh").addEventListener("pointermove", function (e) {
		if (!rz) return;
		var w = Math.max(16, Math.round(rz.w + e.clientX - rz.x)), cs = ws()["!cols"] || (ws()["!cols"] = []);
		cs[rz.c] = Object.assign({}, cs[rz.c] || {}, { wpx: w, width: +(w / 7.2).toFixed(2) }); delete cs[rz.c].wch; delete cs[rz.c].hidden; delete cs[rz.c].MDW;
		layout(); render();
	});
	$("xl-colh").addEventListener("pointerup", function () { if (rz) { rz.h.classList.remove("is-drag"); rz = null; drawObjects(); file.dirty = true; renderName(); autosave(); } });
	$("xl-colh").addEventListener("dblclick", function (e) {
		var h = e.target.closest("[data-rz]"); if (!h) return;
		var c = +h.getAttribute("data-rz"), d = data(), mx = 4;
		for (var r = 0; r < Math.min(d.length, 3000); r++) { var row = d[r], cell = row && row[c]; if (cell) mx = Math.max(mx, disp(cell).length); }
		var cs = ws()["!cols"] || (ws()["!cols"] = []); var pxw = Math.min(600, Math.round(mx * 7.4 + 14)); cs[c] = { wpx: pxw, width: +(pxw / 7.2).toFixed(2) };
		layout(); render(); drawObjects(); file.dirty = true; renderName();
	});
	scroll.addEventListener("scroll", function () { render(); }, { passive: true });
	if (window.ResizeObserver) new ResizeObserver(function () { render(); }).observe(grid); else window.addEventListener("resize", render);

	/* ---------- keyboard ---------- */
	function dataN() { var v = view(); return v ? (v.dataN != null ? v.dataN : v.rows.length) : nRows - base; }
	function lastDataDr() { return Math.max(minRow(), dataN() - 1); }
	scroll.addEventListener("keydown", function (e) {
		if (!wb || editing) return;
		var mod = e.ctrlKey || e.metaKey, k = e.key, dr = sel.fr, c = sel.fc, page = Math.max(1, Math.floor(scroll.clientHeight / RH) - 1);
		var mv = function (r, cc, ext) { e.preventDefault(); select(r, cc, ext); };
		if (k === "ArrowDown") return mv(mod ? lastDataDr() : (e.shiftKey ? dr : sel.ar) + 1, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "ArrowUp") return mv(mod ? minRow() : (e.shiftKey ? dr : sel.ar) - 1, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "ArrowRight") { var row = data()[actualRow(sel.ar)]; return mv(e.shiftKey ? dr : sel.ar, mod ? Math.max(0, (row ? row.length : 1) - 1) : (e.shiftKey ? c : sel.ac) + 1, e.shiftKey); }
		if (k === "ArrowLeft") return mv(e.shiftKey ? dr : sel.ar, mod ? 0 : (e.shiftKey ? c : sel.ac) - 1, e.shiftKey);
		if (k === "PageDown") return mv((e.shiftKey ? dr : sel.ar) + page, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "PageUp") return mv((e.shiftKey ? dr : sel.ar) - page, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "Home") return mv(mod ? minRow() : sel.ar, 0, e.shiftKey);
		if (k === "End" && mod) return mv(lastDataDr(), Math.max(0, nCols - 1), e.shiftKey);
		if (k === "Tab") return mv(sel.ar, sel.ac + (e.shiftKey ? -1 : 1));
		if (k === "Enter") return mv(sel.ar + (e.shiftKey ? -1 : 1), sel.ac);
		if (k === "F2") { e.preventDefault(); startEdit(); return; }
		if (k === "Escape" && clip) { clip = null; render(); return; }
		if (mod && k.toLowerCase() === "d") { e.preventDefault(); fillDown(); return; }
		if (mod && k.toLowerCase() === "r") { e.preventDefault(); fillRight(); return; }
		if (k === "Delete" || k === "Backspace") { e.preventDefault(); clearSel(); return; }
		if (mod && k.toLowerCase() === "a") { e.preventDefault(); $("xl-corner").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return; }
		if (mod && (k === "-" )) { e.preventDefault(); rowsCols(sel.mode === "col" ? "col-del" : "row-del"); return; }
		if (mod && e.shiftKey && (k === "+" || k === "=")) { e.preventDefault(); rowsCols(sel.mode === "col" ? "col-left" : "row-above"); return; }
		if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(k); return; }
	});
	function clearSel() {
		var R = selRect(), list = [], max = 200000;
		for (var r = Math.max(R.r1, minRow()); r <= R.r2; r++) {
			var ar = actualRow(r); if (ar == null || ar >= nRows) { if (!view()) break; continue; }
			var row = data()[ar]; if (!row) continue;
			for (var c = R.c1; c <= Math.min(R.c2, row.length - 1); c++) if (row[c] && row[c].t !== "z") { list.push({ r: ar, c: c, text: "" }); if (list.length > max) break; }
		}
		if (list.length) setCells(list, "Clear " + list.length + " cell" + (list.length > 1 ? "s" : ""));
	}
	ed.addEventListener("keydown", function (e) {
		var k = e.key;
		if (f4Key(e)) return;
		if (editing && editing.mode === "enter" && /^Arrow(Up|Down|Left|Right)$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey && pointable()) { e.preventDefault(); e.stopPropagation(); arrowPoint(k, e.shiftKey); return; }
		if (/^(Arrow|Home|End)/.test(k) && editing) editing.pick = null;
		if (k === "Enter" && !e.altKey) { e.preventDefault(); e.stopPropagation(); var d = e.shiftKey ? -1 : 1; if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar + d, sel.ac); } return; }
		if (k === "Enter" && e.altKey) { e.preventDefault(); var s = ed.selectionStart; ed.value = ed.value.slice(0, s) + "\n" + ed.value.slice(ed.selectionEnd); ed.setSelectionRange(s + 1, s + 1); placeEditor(); return; }
		if (k === "Tab") { e.preventDefault(); e.stopPropagation(); if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar, sel.ac + (e.shiftKey ? -1 : 1)); } return; }
		if (k === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); return; }
		e.stopPropagation();
	});
	ed.addEventListener("input", function () { fxin.value = ed.value; placeEditor(); if (editing) { editing.pick = null; refHL(); } });
	ed.addEventListener("blur", function () { setTimeout(function () { if (editing && editing.where === "cell" && document.activeElement !== ed && document.activeElement !== fxin) commitEdit(); render(); }, 0); });
	fxin.addEventListener("focus", function () { if (!wb) return; if (editing && editing.where === "cell") { var v = ed.value; editing.where = "bar"; ed.hidden = true; fxin.value = v; return; } editing = { dr: sel.ar, c: sel.ac, ar: actualRow(sel.ar), si: si, where: "bar", mode: "edit", pick: null, orig: editText(getCell(actualRow(sel.ar), sel.ac)) }; refHL(); });
	fxin.addEventListener("input", function () { if (!editing) return; editing.pick = null; refHL(); });
	fxin.addEventListener("keydown", function (e) {
		if (!editing) return;
		if (f4Key(e)) return;
		if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar + (e.shiftKey ? -1 : 1), sel.ac); } }
		else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); scroll.focus({ preventScroll: true }); }
		else if (e.key === "Tab") { e.preventDefault(); if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar, sel.ac + (e.shiftKey ? -1 : 1)); } }
	});
	fxin.addEventListener("blur", function () { if (editing && editing.where === "bar") { if (!commitEdit()) { cancelEdit(); } } });
	$("xl-editbtn").onclick = function () { if (!wb) return; scroll.focus({ preventScroll: true }); startEdit(); };
	nameBox.addEventListener("keydown", function (e) {
		if (e.key !== "Enter" || !wb) return;
		e.preventDefault();
		var g = X.parseRange(this.value.replace(/^.*!/, ""));
		if (!g) { toast("Type a cell address such as B12, or a range such as A1:C10."); return; }
		var a = displayRow(g.s.r), b = displayRow(g.e.r);
		if (a == null) { toast("Row " + (g.s.r + 1) + " is hidden by the filter."); return; }
		while (g.s.r >= NR + base && !view()) { NR += 1000; }
		layout();
		sel = { ar: a, ac: g.s.c, fr: b == null ? a : b, fc: g.e.c, mode: "" }; clampSel(); reveal(sel.ar, sel.ac); showActive(); render(); scroll.focus({ preventScroll: true });
	});
	nameBox.addEventListener("focus", function () { this.select(); });

	/* ---------- clipboard (TSV, compatible with Excel and Google Sheets) ---------- */
	function selTSV() {
		var R = selRect(), rows = [];
		var r2 = Math.min(R.r2, dataN() - 1), c2 = Math.min(R.c2, Math.max(nCols - 1, R.c1));
		if ((r2 - R.r1 + 1) * (c2 - R.c1 + 1) > 500000) { toast("That is too many cells to copy at once."); return null; }
		for (var r = R.r1; r <= Math.max(r2, R.r1); r++) { var row = data()[actualRow(r)], out = []; for (var c = R.c1; c <= c2; c++) out.push(disp(row ? row[c] : undefined)); rows.push(out); }
		return X.toDelimited(rows, "\t", "\n");
	}
	function inGridFocus() { var a = document.activeElement; return a === scroll || (a && a.closest && a.closest("#xl-grid") && a !== ed); }
	function copyEvent(e, cut) {
		if (!wb || editing || !inGridFocus()) return;
		var o = doCopy(cut); if (!o) return;
		e.preventDefault(); e.clipboardData.setData("text/plain", o.text); e.clipboardData.setData("text/html", o.html);
		var R = selRect(); toast((cut ? "Cut " : "Copied ") + nf((R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1)) + " cell" + ((R.r2 - R.r1 + R.c2 - R.c1) ? "s" : "") + (cut ? ": select where it goes and paste" : ""));
	}
	document.addEventListener("copy", function (e) { copyEvent(e, false); });
	document.addEventListener("cut", function (e) { copyEvent(e, true); });
	function pasteText(text) {
		if (!wb || text == null) return;
		var rows = X.parseDelimited(text.replace(/\r?\n$/, ""), text.indexOf("\t") >= 0 || text.indexOf("\n") < 0 ? "\t" : null);
		if (!rows.length) return;
		var R = selRect(), v = view(), list = [], cut = false;
		var h = rows.length, w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
		var tile = rows.length === 1 && w === 1 && (R.r2 > R.r1 || R.c2 > R.c1);    // one value pasted into a selection fills it
		var rN = tile ? R.r2 - R.r1 + 1 : h, cN = tile ? R.c2 - R.c1 + 1 : w;
		if (rN * cN > 300000) { toast("That is too much to paste at once (" + nf(rN * cN) + " cells)."); return; }
		for (var i = 0; i < rN; i++) {
			var dr = R.r1 + i;
			if (v && dr >= v.rows.length) { cut = true; break; }
			var ar = actualRow(dr);
			for (var j = 0; j < cN; j++) { var t = tile ? rows[0][0] : rows[i][j]; if (t === undefined) continue; list.push({ r: ar, c: R.c1 + j, text: t }); }
		}
		try { setCells(list, "Paste"); } catch (err) { note(esc(err.message), true); return; }
		sel.fr = Math.min(NR - 1, R.r1 + rN - 1); sel.fc = R.c1 + cN - 1; clampSel(); showActive(); render();
		if (cut) note("Only the rows showing in the sorted / filtered view were filled.");
	}
	document.addEventListener("paste", function (e) {
		var fs = [].filter.call((e.clipboardData && e.clipboardData.files) || [], function (f) { return /\.(xlsx|xlsm|xls|ods|csv|tsv|xlsb|numbers)$/i.test(f.name || ""); });
		if (fs.length && !(document.activeElement && /input|textarea/i.test(document.activeElement.tagName) && document.activeElement !== scroll)) { e.preventDefault(); openFile(fs[0]); return; }
		if (!wb || editing || !inGridFocus()) return;
		e.preventDefault();
		var txt = e.clipboardData.getData("text/plain");
		if (clipSame(txt)) pasteInternal(); else pasteText(txt);
	});

	/* ---------- global shortcuts ---------- */
	document.addEventListener("keydown", function (e) {
		var mod = e.ctrlKey || e.metaKey;
		if (!mod || e.altKey) return;
		var inUs = root.contains(document.activeElement) || app.classList.contains("mes-pfill") || document.activeElement === document.body;
		if (!inUs) return;
		var k = e.key.toLowerCase(), typing = document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName);
		if (k === "o") { e.preventDefault(); pick(); }
		else if (k === "s" && wb) { e.preventDefault(); if (editing && !commitEdit()) return; if (!(cloud && cloud.save(file))) saveAs(wb.vbaraw ? "xlsm" : "xlsx"); }
		else if (k === "p" && wb) { e.preventDefault(); printSheet(); }
		else if (k === "f" && wb) { e.preventDefault(); $("xl-q").focus(); $("xl-q").select(); }
		else if ((k === "z" || k === "y") && wb && !typing) { e.preventDefault(); doUndo(k === "y" || e.shiftKey); }
	});

	/* ---------- opening files ---------- */
	var input = $("xl-input");
	function pick() { input.click(); }
	$("xl-open").onclick = pick; $("xl-e-open").onclick = function (e) { e.stopPropagation(); pick(); };
	$("xl-new").onclick = $("xl-e-new").onclick = function (e) { e.stopPropagation(); if (confirmLeave()) newBook(); };
	$("xl-drop").addEventListener("click", function (e) { if (!e.target.closest("button,label,input")) pick(); });
	$("xl-drop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
	input.onchange = function () { if (input.files[0]) openFile(input.files[0]); input.value = ""; };
	var hasFiles = function (e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (hasFiles(e)) { e.preventDefault(); app.classList.add("is-over"); } }); });
	document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) app.classList.remove("is-over"); });
	document.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); app.classList.remove("is-over"); var f = e.dataTransfer.files[0]; if (f) openFile(f); });
	function confirmLeave() { return !(file && file.dirty && !file.autosaved && !confirm("You have changes that are not saved. Open another file anyway?")); }
	function openFile(f) {
		if (!confirmLeave()) return;
		note("Opening " + esc(f.name) + "…");
		f.arrayBuffer().then(function (b) { return openBytes(new Uint8Array(b), f.name, {}); }).catch(function (err) { note(esc(f.name) + ": " + esc(err.message || "could not be read."), true); });
	}
	function decodeText(u8) {
		var t = new TextDecoder("utf-8").decode(u8);
		if (/�/.test(t.slice(0, 200000))) { try { t = new TextDecoder("windows-1252").decode(u8); } catch (e) { /* keep utf-8 */ } }
		return t;
	}
	function bookFromText(text, name, X2) {
		var ext = (/\.([a-z]+)$/i.exec(name) || [])[1] || "", delim = /^(tsv|tab)$/i.test(ext) ? "\t" : null;
		if (delim == null) delim = X.detectDelimiter(text);
		var rows = X.parseDelimited(text, delim), d = [], dec = delim === ";";   // semicolon files come from decimal-comma countries: 1,5 = 1.5
		for (var r = 0; r < rows.length; r++) {
			var row = rows[r], out = new Array(row.length);
			for (var c = 0; c < row.length; c++) {
				var p = row[c] === "" ? { t: "z" } : X.parseInput(dec && /^-?\d+(\.\d{3})*,\d+$/.test(row[c].trim()) ? row[c].trim().replace(/\./g, "").replace(",", ".") : row[c]);
				if (p.f != null) { try { X.parse(p.f); out[c] = { t: "z", f: p.f }; } catch (e) { out[c] = { t: "s", v: row[c] }; } }
				else if (p.t !== "z") out[c] = p.z ? { t: p.t, v: p.v, z: p.z } : { t: p.t, v: p.v };
			}
			d.push(out);
		}
		var book = X2.utils.book_new();
		X2.utils.book_append_sheet(book, { "!data": d, "!ref": "A1" }, X.safeSheetName(X.baseName(name)));
		return book;
	}
	function openBytes(u8, name, opt) {
		opt = opt || {};
		var kind = X.kindOf(name, u8);
		if (kind === "pdf") { note(esc(name) + ' is a PDF. <a href="/pdf">Open it in the PDF Editor</a>.', true); return Promise.resolve(); }
		if (/\.(docx|docm|dotx|doc)$/i.test(name)) { note(esc(name) + ' is a Word document. <a href="/docx">Open it in the Word Viewer</a>.', true); return Promise.resolve(); }
		return loadLib().then(function (XL) {
			var t0 = performance.now(), book;
			if (kind === "text") book = bookFromText(decodeText(u8), name, XL);
			else book = XL.read(u8, { type: "array", dense: true, cellFormula: true, cellNF: true, cellStyles: true, bookVBA: true, cellDates: false, WTF: false });
			if (!book.SheetNames.length) throw new Error("this file has no sheets.");
			load(book, { name: name, size: u8.length, bytes: u8, kind: kind, key: opt.key || ("x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) }, opt);
			// what SheetJS CE does not read (styles, tables, charts, pictures, freeze panes, conditional formatting): our own reader, then redraw
			readPkg(u8, kind).then(function (pkg) { if (pkg && wb === book) { try { applyPkg(book, pkg); } catch (e) { if (window.console) console.warn("[excel] package", e); } } });
			// formulas saved without a value (CSV files, files written by some libraries): work them out now
			var missing = [];
			wb.SheetNames.forEach(function (n, s) { var d = wb.Sheets[n]["!data"] || []; for (var r = 0; r < d.length && missing.length < 50000; r++) { var row = d[r]; if (row) for (var c = 0; c < row.length; c++) { var cl = row[c]; if (cl && cl.f && (cl.v == null || cl.t === "z")) missing.push({ si: s, r: r, c: c }); } } });
			if (missing.length) { var res = ensureCalc().recalc(missing); res.stale.forEach(function (p) { stale[p.si + ":" + p.r + ":" + p.c] = p.unknown; }); dims(); layout(); showActive(); render(); }
			var ms = Math.round(performance.now() - t0);
			if (!opt.quiet) note("");
			if (opt.draft) {
				note('This file has edits from earlier that you did not save. <button type="button" class="xl-link" id="xl-draftgo">Continue with my edits</button> <button type="button" class="xl-link" id="xl-draftno">Discard them</button>');
				$("xl-draftgo").onclick = function () { note(""); var keep = file; openBytes(new Uint8Array(opt.draft), name, { key: keep.key, fromDraft: true, orig: keep.bytes }).then(function () { file.dirty = true; file.autosaved = true; renderName(); }); };
				$("xl-draftno").onclick = function () { note(""); recentUpdate(file.key, function (r) { delete r.draft; delete r.draftTime; }); };
			}
			status();
			if (window.console) console.info("[excel] opened " + name + " in " + ms + " ms");
		}).catch(function (err) {
			var m = String(err && err.message || err || "");
			var msg = /password|encrypt/i.test(m) ? "this file is protected with a password. Remove the password in Excel first (File → Info → Protect Workbook)." :
				/Unsupported ZIP|zip|central|end of data|corrupt/i.test(m) ? "this file is damaged or is not a spreadsheet." : (m || "could not be opened.");
			note(esc(name) + ": " + esc(msg), true);
		});
	}
	/* ---------- the .xlsx package: our own reader for what SheetJS CE leaves out (ooxml.js) ---------- */
	function streamBytes(u8, ts) { return new Response(new Blob([u8]).stream().pipeThrough(ts)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
	function inflateRaw(u8) { return streamBytes(u8, new DecompressionStream("deflate-raw")); }
	function deflateRaw(u8) { return streamBytes(u8, new CompressionStream("deflate-raw")); }
	function canGraft() { return !!(O && window.CompressionStream && window.DecompressionStream); }
	function readPkg(u8, kind) {
		if (!canGraft() || !/^(zip|xlsx|xlsm|xltx|xltm)$/.test(kind)) return Promise.resolve(null);
		return O.readPackage(u8, inflateRaw).catch(function (e) { if (window.console) console.warn("[excel] could not read the package", e); return null; });
	}
	function applyPkg(book, pkg) {
		book["!mespkg"] = pkg;
		var xfs = pkg.styles.xfs, stubs = 0;
		pkg.sheets.forEach(function (sm) {
			var w = book.Sheets[sm.name]; if (!w) return;
			w["!mesx"] = sm;
			sm.colXf = []; sm.cols.forEach(function (c) { if (c.style) for (var i = c.min; i <= Math.min(c.max, c.min + 500); i++) sm.colXf[i] = c.style; });
			if (sm.rowsHidden.length) { var rm = w["!rows"] || (w["!rows"] = []); sm.rowsHidden.forEach(function (r) { if (!rm[r]) rm[r] = {}; rm[r].hidden = true; }); }
			// the style of every cell (empty formatted cells become stubs, so their fill and borders show and are saved)
			var d = w["!data"] || (w["!data"] = []), cs = sm.cells || [];
			for (var i = 0; i < cs.length; i += 3) {
				var r = cs[i], c = cs[i + 1], xs = cs[i + 2];
				var row = d[r] || (d[r] = []), cell = row[c];
				if (cell) { cell.xs = xs; cell.xz = cell.z; }
				else if (stubs < 2e6 && xfs[xs]) { stubs++; var code = xfs[xs].code; row[c] = code && code !== "General" ? { t: "z", xs: xs, xz: code, z: code } : { t: "z", xs: xs }; }
			}
			sm.cells = null;
		});
		cssCache = {}; dver++;
		if (wb !== book) return;
		dims(); layout(); ensureView(); renderSheets(); showActive(); render(); drawObjects(true); status();
		var n = { charts: 0, tables: 0, pics: 0 };
		pkg.sheets.forEach(function (sm) { (sm.objects || []).forEach(function (o) { if (o.type === "chart") n.charts++; else n.pics++; }); n.tables += (sm.tables || []).length; });
		if (window.console) console.info("[excel] package: " + n.charts + " charts, " + n.pics + " pictures, " + n.tables + " tables");
	}
	function load(book, f, opt) {
		if (editing) cancelEdit();
		wb = book; file = f; si = 0; calc = null; views = {}; stale = {}; undo = []; redo = []; undoBtns();
		if (opt.fromDraft && opt.orig) file.bytes = opt.orig;
		var first = 0; if (wb.Workbook && wb.Workbook.Sheets) for (var i = 0; i < wb.SheetNames.length; i++) { var s = wb.Workbook.Sheets[i]; if (!(s && s.Hidden)) { first = i; break; } }
		si = first;
		emptyEl.hidden = true;
		$("xl-save-xlsm").hidden = !wb.vbaraw;
		$("xl-save-orig").hidden = !file.bytes;
		$("xl-hdr").setAttribute("aria-pressed", String(S.freeze));
		dims(); layout(); renderSheets(); renderName();
		sel = { ar: 0, ac: 0, fr: 0, fc: 0, mode: "" }; scroll.scrollTop = 0; scroll.scrollLeft = 0; clampSel(); showActive(); renderFilterBar(); render();
		scroll.focus({ preventScroll: true });
		if (!opt.key && f.bytes) recentPut({ key: f.key, name: f.name, size: f.size, time: Date.now(), bytes: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) });
		else if (opt.key) recentUpdate(opt.key, function (r) { r.time = Date.now(); });
	}
	function newBook() {
		loadLib().then(function (XL) {
			var book = XL.utils.book_new(); XL.utils.book_append_sheet(book, { "!data": [], "!ref": "A1" }, "Sheet1");
			load(book, { name: "Untitled.xlsx", size: 0, bytes: null, kind: "new", key: "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, {});
			note("");
		}).catch(function (err) { note(esc(err.message), true); });
	}
	function renderName() {
		var n = $("xl-fname");
		if (!file) { n.textContent = "No file open"; return; }
		n.innerHTML = esc(file.name) + (file.dirty ? ' <span class="xl-dot" title="Edited">&bull;</span>' : "");
		n.title = file.name + (file.size ? " (" + X.fmtBytes(file.size) + ")" : "");
		document.title = (file.dirty ? "• " : "") + file.name + " - MES Spreadsheet Viewer";
	}
	window.addEventListener("beforeunload", function (e) { if (!window.__mesCloudLeaving && file && file.dirty && !file.autosaved && !file.saved) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- recent files + autosave (IndexedDB, this device only) ---------- */
	var idb = null;
	function db() {
		if (idb) return idb;
		idb = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(new Error("no IndexedDB"));
			var r = indexedDB.open("mes-excel", 1);
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
			return recentList().then(function (all) {          // keep the 10 newest and at most ~120 MB
				var total = 0, drop = [], seen = {};
				all.forEach(function (r, i) {
					var id = r.name + "|" + r.size;
					if (seen[id] && !r.draft) { drop.push(r.key); return; } seen[id] = 1;
					total += (r.bytes ? r.bytes.byteLength : 0) + (r.draft ? r.draft.byteLength : 0); if (i >= 10 || total > 120e6) drop.push(r.key);
				});
				if (drop.length) return store("readwrite", function (st) { drop.forEach(function (k) { st.delete(k); }); });
			});
		}).catch(function () { /* storage full or blocked: not important */ });
	}
	function recentUpdate(key, fn, create) {
		return store("readwrite", function (st) { var g = st.get(key); g.onsuccess = function () { var r = g.result || (create ? create() : null); if (r) { fn(r); st.put(r); } }; }).catch(function () { });
	}
	function recentDel(key) { return store("readwrite", function (st) { if (key) st.delete(key); else st.clear(); }).catch(function () { }); }
	var asT = 0;
	function autosave() {
		if (!file) return;
		file.autosaved = false;
		if (cloud) cloud.changed(file);
		clearTimeout(asT);
		if (!S.remember) return;
		asT = setTimeout(function () {
			if (!wb || !window.XLSX) return;
			var cellsN = 0; wb.SheetNames.forEach(function (n) { var d = wb.Sheets[n]["!data"] || []; cellsN += d.length * 12; });
			if (cellsN > 3e6) { file.autosaveSkipped = true; return; }
			var f = file;
			xlsxBytes("xlsx").then(function (res) {
			var bytes = res.bytes, buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
			recentUpdate(f.key, function (r) { r.draft = buf; r.draftTime = Date.now(); r.time = Date.now(); r.name = f.name; }, function () { return { key: f.key, name: f.name, size: f.size || buf.byteLength, time: Date.now(), bytes: null }; }).then(function () { if (f === file) f.autosaved = true; });
			}).catch(function () { /* autosave is best effort */ });
		}, 2500);
	}
	function showRecent() {
		$("xl-remember").checked = !!S.remember;
		recentList().then(function (all) {
			var box = $("xl-recent"); box.hidden = !all.length || !S.remember;
			$("xl-rlist").innerHTML = all.map(function (r) {
				return '<div class="xl-ritem"><button type="button" class="xl-ropen" data-k="' + esc(r.key) + '"><b>' + esc(r.name) + "</b><small>" + (r.size ? esc(X.fmtBytes(r.size)) + " &middot; " : "") + esc(new Date(r.time).toLocaleString()) + (r.draft ? " &middot; has unsaved edits" : "") + '</small></button><button type="button" class="xl-link" data-del="' + esc(r.key) + '" aria-label="Forget ' + esc(r.name) + '">Forget</button></div>';
			}).join("");
		});
	}
	$("xl-rlist").addEventListener("click", function (e) {
		var o = e.target.closest("[data-k]"), d = e.target.closest("[data-del]");
		if (d) { recentDel(d.getAttribute("data-del")).then(showRecent); return; }
		if (o) recentList().then(function (all) {
			var r = all.find(function (x) { return x.key === o.getAttribute("data-k"); }); if (!r) return;
			if (r.bytes) openBytes(new Uint8Array(r.bytes), r.name, { key: r.key, draft: r.draft });
			else if (r.draft) openBytes(new Uint8Array(r.draft), /\.xlsx$/i.test(r.name) ? r.name : X.baseName(r.name) + ".xlsx", { key: r.key, fromDraft: true });
		});
	});
	$("xl-rclear").onclick = function () { if (confirm("Forget all recent files and saved edits on this device?")) recentDel(null).then(showRecent); };
	$("xl-remember").onchange = function () { S.remember = this.checked; save(); if (!S.remember) recentDel(null).then(showRecent); };

	/* ---------- menus ---------- */
	function menu(btn, m) {
		btn.addEventListener("click", function (e) { e.stopPropagation(); var open = m.hidden; closeMenus(); if (open && wb) { m.hidden = false; btn.setAttribute("aria-expanded", "true"); var f = m.querySelector("button:not([hidden])"); if (f) f.focus(); } });
		m.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); closeMenus(); btn.focus(); } });
	}
	function closeMenus() { [["xl-rcbtn", "xl-rcmenu"], ["xl-insbtn", "xl-insmenu"], ["xl-save", "xl-savemenu"], ["xl-hdr", "xl-frzmenu"]].forEach(function (p) { $(p[1]).hidden = true; $(p[0]).setAttribute("aria-expanded", "false"); }); }
	document.addEventListener("click", function (e) { if (!e.target.closest(".xl-dd")) closeMenus(); });
	menu($("xl-rcbtn"), $("xl-rcmenu")); menu($("xl-insbtn"), $("xl-insmenu")); menu($("xl-save"), $("xl-savemenu")); menu($("xl-hdr"), $("xl-frzmenu"));
	$("xl-rcmenu").addEventListener("click", function (e) { var b = e.target.closest("[data-rc]"); if (!b) return; closeMenus(); rowsCols(b.getAttribute("data-rc")); });
	$("xl-savemenu").addEventListener("click", function (e) { var b = e.target.closest("[data-save]"); if (!b) return; closeMenus(); saveAs(b.getAttribute("data-save")); });
	$("xl-undo").onclick = function () { doUndo(false); };
	$("xl-redo").onclick = function () { doUndo(true); };

	/* ---------- save ---------- */
	function sheetRows() { var d = data(), out = []; for (var r = 0; r < nRows; r++) { var row = d[r], o = []; for (var c = 0; c < nCols; c++) o.push(disp(row ? row[c] : undefined)); out.push(o); } return out; }
	function saveAs(kind) {
		if (!wb) return;
		if (editing && !commitEdit()) return;
		var b = X.baseName(file.name);
		try {
			if (kind === "orig") { if (file.bytes) download(new Blob([file.bytes]), file.name); return; }
			if (kind === "csv" || kind === "tsv") {
				var txt = X.toDelimited(sheetRows(), kind === "csv" ? "," : "\t");
				download(new Blob(["﻿" + txt], { type: kind === "csv" ? "text/csv;charset=utf-8" : "text/tab-separated-values;charset=utf-8" }), b + (wb.SheetNames.length > 1 ? " - " + wb.SheetNames[si] : "") + "." + kind);
				toast("Saved this sheet as ." + kind); return;
			}
			var bt = kind === "xlsm" ? "xlsm" : kind === "ods" ? "ods" : "xlsx";
			var mime = bt === "ods" ? "application/vnd.oasis.opendocument.spreadsheet" : bt === "xlsm" ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
			var f = file;
			(bt === "ods" ? (prepWrite(), Promise.resolve({ bytes: window.XLSX.write(wb, { bookType: "ods", type: "array", compression: true }) })) : xlsxBytes(bt)).then(function (res) {
				download(new Blob([res.bytes], { type: mime }), b + "." + bt);
				if (f === file) { file.saved = true; file.dirty = false; renderName(); }
				var lost = res.lost && res.lost.length ? " Not kept, because rows, columns or sheets were changed: " + res.lost.join(", ") + ". (Save the Original file to keep them as they were.)" : "";
				if (lost) note(esc(lost.trim()));
				toast("Saved " + b + "." + bt);
			}).catch(function (err) { note("Could not save: " + esc(err && err.message || err), true); });
		} catch (err) { note("Could not save: " + esc(err.message || err), true); }
	}
	/* ---------- ☁ Cloud: open from / keep saved to OneDrive, Dropbox, Google Drive or a synced folder (/main_js/cloud-files.js) ---------- */
	var WRITABLE = { xlsx: 1, xlsm: 1, ods: 1, csv: 1, tsv: 1 };
	function cloudWriteName(n) { var e = (/\.([a-z0-9]+)$/i.exec(n || "") || [])[1]; e = e ? e.toLowerCase() : ""; if (e === "xlsm" && !(wb && wb.vbaraw)) return X.baseName(n) + ".xlsx"; return WRITABLE[e] ? n : X.baseName(n || "Untitled") + ".xlsx"; }
	function cloudBytes(f, name) {
		var e = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || "xlsx").toLowerCase();
		if (e === "csv" || e === "tsv") {
			if (wb.SheetNames.length > 1 && f.__mclCsvNote !== 1) { f.__mclCsvNote = 1; toast("A ." + e + " file holds one sheet: saving the sheet on screen"); }
			return Promise.resolve(new TextEncoder().encode("\ufeff" + X.toDelimited(sheetRows(), e === "csv" ? "," : "\t")));
		}
		if (e === "ods") { prepWrite(); return Promise.resolve(new Uint8Array(window.XLSX.write(wb, { bookType: "ods", type: "array", compression: true }))); }
		return xlsxBytes(e === "xlsm" ? "xlsm" : "xlsx").then(function (res) { return res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes); });
	}
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "excel", folder: "MES Apps/Excel", what: "spreadsheet", defExt: "xlsx", btnClass: "xl-btn", before: $("xl-fname"), replaces: true, toast: toast,
		exts: [".xlsx", ".xlsm", ".xls", ".xlsb", ".ods", ".csv", ".tsv"],
		accept: [{ description: "Spreadsheet", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"], "application/vnd.ms-excel": [".xls"], "application/vnd.oasis.opendocument.spreadsheet": [".ods"], "text/csv": [".csv"], "text/tab-separated-values": [".tsv"] } }],
		doc: function () { return wb ? file : null; },
		name: function (f) { return f.name; },
		writeName: cloudWriteName,
		bytes: function (f, name) { if (f !== file) return Promise.reject(new Error("That spreadsheet is no longer open.")); return cloudBytes(f, name); },
		open: function (u8, name) { if (editing) cancelEdit(); return openBytes(u8, name, {}).then(function () { return wb && file && file.bytes === u8 ? file : null; }); },
		dirty: function (f) { return !!f.dirty; },
		saved: function (f, name) { if (name && name !== f.name) f.name = name; f.dirty = false; f.saved = true; renderName(); recentUpdate(f.key, function (r) { delete r.draft; delete r.draftTime; r.name = f.name; }); }
	}) : null;
	// .xlsx bytes: SheetJS writes the cells, then ooxml.js grafts back the original styles, theme, freeze panes, tables, charts,
	// pictures and conditional formatting (only the last four need the rows / columns / sheets to be unchanged since opening)
	function graftInfo() {
		var pkg = pkgOf(), info = { sheets: [], extraXfs: [], structOk: !!pkg && !(file && file.structN > 0), tableHeaders: {}, active: si }, lost = {};
		var raws = pkg ? O.rawXfs(pkg.styles.raw) : [], next = raws.length, nextFmt = pkg ? O.maxFmtId(pkg.styles.raw) + 1 : 164, made = {}, fmtIds = {};
		if (pkg) { for (var id in pkg.styles.fmts) fmtIds[pkg.styles.fmts[id]] = +id; for (var bi in O.BUILTIN_FMT) if (!(O.BUILTIN_FMT[bi] in fmtIds)) fmtIds[O.BUILTIN_FMT[bi]] = +bi; }
		var xfFor = function (xs, z) {
			var key = xs + "|" + z; if (made[key] != null) return made[key];
			var src = raws[xs] || raws[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', fid = fmtIds[z], nw = false;
			if (fid == null) { fid = nextFmt++; fmtIds[z] = fid; nw = true; }
			var xs2 = src.replace(/\snumFmtId="\d+"/, "").replace(/\sapplyNumberFormat="[^"]*"/, "").replace(/<xf\b/, '<xf numFmtId="' + fid + '" applyNumberFormat="1"');
			info.extraXfs.push({ fmtId: fid, code: z, newFmt: nw, xml: xs2 });
			return (made[key] = next++);
		};
		wb.SheetNames.forEach(function (n) {
			var w = wb.Sheets[n], sm = sx(w), cells = null, stubs = [], rowAttrs = null, d = w["!data"] || [];
			if (pkg) {
				cells = new Map();
				for (var r = 0; r < d.length; r++) {
					var row = d[r]; if (!row) continue;
					for (var c = 0; c < row.length; c++) {
						var cl = row[c]; if (!cl) continue;
						var xs = cl.xs != null ? cl.xs : 0, z = cl.z, want = xs;
						if (z && z !== "General" && z !== cl.xz) want = xfFor(xs, z);
						if (cl.t === "z") { if (want) stubs.push([r, c, want]); }
						else if (want) cells.set(r + ":" + c, want);
					}
				}
				if (sm && sm.tables) sm.tables.forEach(function (t) { if (!t.header) return; var row0 = d[t.g.s.r] || [], names = []; for (var c2 = t.g.s.c; c2 <= t.g.e.c; c2++) names.push(row0[c2] ? disp(row0[c2]) : null); info.tableHeaders[t.part] = names; });
				if (sm && !info.structOk) { if (sm.objects && sm.objects.some(function (o) { return o.type === "chart"; })) lost.charts = 1; if (sm.objects && sm.objects.some(function (o) { return o.type === "pic"; })) lost.pictures = 1; if (sm.tables && sm.tables.length) lost["table formats"] = 1; if (sm.cfRaw && sm.cfRaw.length) lost["conditional formatting"] = 1; }
			}
			var rm = w["!rows"]; if (rm) for (var hr = 0; hr < rm.length; hr++) if (rm[hr] && rm[hr].hidden) (rowAttrs || (rowAttrs = {}))[hr] = ' hidden="1"';
			var add = mineParts(w, info.sheets.length);
			if (sm && sm.drawingPart && add.some(function (a) { return a.tag === "drawing"; })) { add = add.filter(function (a) { return a.tag !== "drawing"; }); lost["new charts (this sheet already has a drawing)"] = 1; }
			info.sheets.push({ model: sm, freeze: w["!mesfrz"] || (sm && sm.pane ? { r: sm.pane.r, c: sm.pane.c } : null), cells: cells, stubs: stubs, rowAttrs: rowAttrs, add: add });
		});
		info.lost = Object.keys(lost);
		return info;
	}
	// SheetJS's writer fails on a missing row inside the data (left by inserting rows): fill the holes first
	function prepWrite() { wb.SheetNames.forEach(function (n) { var d = wb.Sheets[n]["!data"]; if (d && !d.length) d.push([]); if (d) for (var r = 0; r < d.length; r++) if (!d[r]) d[r] = []; }); }
	function xlsxBytes(bt) {
		var vba = bt === "xlsm";
		prepWrite();
		if (!canGraft()) return Promise.resolve({ bytes: window.XLSX.write(wb, { bookType: bt, type: "array", compression: true, bookVBA: vba }) });
		var info = graftInfo();
		if (!pkgOf() && !info.sheets.some(function (s) { return (s.freeze && (s.freeze.r || s.freeze.c)) || (s.add && s.add.length); })) return Promise.resolve({ bytes: window.XLSX.write(wb, { bookType: bt, type: "array", compression: true, bookVBA: vba }) });
		var raw = window.XLSX.write(wb, { bookType: bt, type: "array", compression: false, bookVBA: vba });
		return O.graft(new Uint8Array(raw), pkgOf(), info, inflateRaw, deflateRaw).then(function (res) { res.lost = info.lost; return res; });
	}

	/* ---------- print ---------- */
	function printSheet() {
		if (!wb) return;
		var d = data(), v = view(), maxRows = 5000, rows = [];
		if (base && nRows) rows.push(0);
		var n = v ? v.rows.length : Math.max(0, nRows - base);
		for (var i = 0; i < n && rows.length < maxRows; i++) rows.push(v ? v.rows[i] : i + base);
		var nc = Math.min(nCols, 80), html = [];
		html.push("<table><colgroup>"); for (var c = 0; c < nc; c++) if (colW(c)) html.push('<col style="width:' + colW(c) + 'px">'); html.push("</colgroup>");
		rows.forEach(function (r, i) {
			var row = d[r], tag = base && i === 0 ? "th" : "td";
			html.push("<tr>"); for (var c2 = 0; c2 < nc; c2++) { if (!colW(c2)) continue; var cell = row ? row[c2] : undefined, sa = styleAt(r, c2, cell), css = sa ? sa.css.css.replace(/color:#([0-9A-F]{6});/i, function (m0, h) { return sa.css.fill ? m0 : (O.luminance(h) > 0.6 ? "" : m0); }) : ""; html.push("<" + tag + (cell && cell.t === "n" ? ' class="n"' : "") + (css ? ' style="' + css + '"' : "") + ">" + esc(disp(cell)) + "</" + tag + ">"); }
			html.push("</tr>");
		});
		html.push("</table>");
		var more = n + base > maxRows ? "<p>Only the first " + nf(maxRows) + " rows are printed. Save the file and print it from a spreadsheet app for all " + nf(n) + ".</p>" : "";
		var doc = "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + esc(file.name + " - " + wb.SheetNames[si]) + "</title><style>@page{margin:12mm}body{font:10pt Calibri,Carlito,Arial,sans-serif;color:#000;margin:0}h1{font-size:12pt;margin:0 0 6px}table{border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #bbb;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;font-weight:normal;text-align:left}th{background:#eef2ef;font-weight:bold}td.n{text-align:right}tr{break-inside:avoid}thead{display:table-header-group}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><h1>" + esc(file.name + " – " + wb.SheetNames[si]) + "</h1>" + html.join("") + more + "</body></html>";
		var fr = document.createElement("iframe"); fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"; document.body.appendChild(fr);
		var w = fr.contentWindow; w.document.open(); w.document.write(doc); w.document.close();
		setTimeout(function () { try { w.focus(); w.print(); } catch (e) { note("Printing is blocked here.", true); } setTimeout(function () { fr.remove(); }, 60000); }, 250);
		toast("In the print window, choose “Save as PDF” to make a PDF.");
	}
	$("xl-print").onclick = printSheet;

	/* ---------- formula entry: click / drag cells to insert references, coloured outlines, F4 ---------- */
	var hlRefs = [], hlEl = null, clip = null, fillDrag = null, tfMenuEl = null, bookNamesCache = null;
	function isFormulaText(t) { return typeof t === "string" && t.length > 0 && t.charAt(0) === "="; }
	function edEl() { return editing && editing.where === "bar" ? fxin : ed; }
	function edText() { return editing ? edEl().value : ""; }
	function autoClose(v) {
		var q = false, depth = 0;
		for (var i = 0; i < v.length; i++) { var ch = v.charAt(i); if (ch === '"') q = !q; else if (!q) { if (ch === "(") depth++; else if (ch === ")" && depth > 0) depth--; } }
		if (q) v += '"';
		while (depth-- > 0) v += ")";
		return v;
	}
	function setEdText(v, a, b) {
		var el = edEl(); el.value = v;
		if (el === fxin) ed.value = v; else fxin.value = v;
		if (a != null) { try { el.setSelectionRange(a, b == null ? a : b); } catch (e) { /* ignore */ } }
		if (editing.where === "cell") placeEditor();
		refHL();
	}
	function refHL() {
		var t = edText(), was = hlRefs.length;
		hlRefs = editing && isFormulaText(t) ? X.refSpans(t) : [];
		paintEdHL();
		if (was || hlRefs.length) render();
	}
	// the cell editor is a textarea, which cannot colour parts of its text: a copy of the text sits behind it with the references coloured
	function paintEdHL() {
		if (!hlEl) { hlEl = document.createElement("div"); hlEl.className = "xl-edhl"; hlEl.setAttribute("aria-hidden", "true"); hlEl.hidden = true; grid.appendChild(hlEl); }
		var on = !!(editing && editing.where === "cell" && !ed.hidden && hlRefs.length && editing.si === si);
		ed.classList.toggle("xl-ed--hl", on); hlEl.hidden = !on;
		if (!on) return;
		var t = ed.value, h = "", p = 0;
		hlRefs.forEach(function (s) { h += esc(t.slice(p, s.start)) + '<span style="color:' + s.color + '">' + esc(t.slice(s.start, s.end)) + "</span>"; p = s.end; });
		h += esc(t.slice(p)); if (/\n$/.test(t)) h += " ";
		hlEl.innerHTML = h;
		hlEl.style.left = ed.style.left; hlEl.style.top = ed.style.top; hlEl.style.width = ed.style.width; hlEl.style.height = ed.style.height; hlEl.style.minWidth = ed.style.minWidth;
	}
	function backToEditSheet() { if (editing && editing.si != null && editing.si !== si && editing.si < wb.SheetNames.length) showSheet(editing.si, true); }
	function editSheetSwitch(i) {
		if (editing.pick) editing.pick = null;
		showSheet(i, true);
		var el = edEl(); el.focus({ preventScroll: true });
		render();
	}
	// is a click / arrow key now "pointing" (inserting a reference) rather than ending the edit?
	function pointable() {
		if (!editing || !isFormulaText(edText())) return false;
		var el = edEl(), t = el.value, p = editing.pick;
		if (p && p.si === si && t.slice(p.start, p.end) === p.text) return true;
		var s = el.selectionStart, e = el.selectionEnd;
		return X.canPoint(t.slice(0, s) + t.slice(e), s);
	}
	function pointSet(dr0, c0, dr1, c1) {
		var el = edEl(), t = el.value, p = editing.pick, s, e;
		if (p && p.si === si && t.slice(p.start, p.end) === p.text) { s = p.start; e = p.end; } else { s = el.selectionStart; e = el.selectionEnd; }
		var a = actualRow(Math.min(dr0, dr1)), b = actualRow(Math.max(dr0, dr1));
		if (a == null || b == null) return;
		var g = { s: { r: a, c: Math.min(c0, c1) }, e: { r: b, c: Math.max(c0, c1) } };
		var text = X.refText(g, si !== editing.si ? wb.SheetNames[si] : null);
		editing.pick = { start: s, end: s + text.length, text: text, si: si, dr0: dr0, c0: c0, dr1: dr1, c1: c1 };
		setEdText(t.slice(0, s) + text + t.slice(e), s + text.length);
	}
	function tryPoint(p, e) {
		if (!pointable()) return false;
		e.preventDefault();
		edEl().focus({ preventScroll: true });
		var pk = editing.pick && editing.pick.si === si ? editing.pick : null;
		if (e.shiftKey && pk) pointSet(pk.dr0, pk.c0, p.dr, p.c); else pointSet(p.dr, p.c, p.dr, p.c);
		if (e.pointerType !== "touch") { drag = { el: scroll, point: true }; try { scroll.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
		return true;
	}
	function arrowPoint(k, shift) {
		var p = editing.pick && editing.pick.si === si ? editing.pick : null, dy = k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0, dx = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0;
		var cur = p ? { dr0: p.dr0, c0: p.c0, dr1: p.dr1, c1: p.c1 } : (editing.si === si ? { dr0: editing.dr, c0: editing.c, dr1: editing.dr, c1: editing.c } : { dr0: sel.ar, c0: sel.ac, dr1: sel.ar, c1: sel.ac });
		cur.dr1 = Math.max(minRow(), Math.min(NR - 1, cur.dr1 + dy)); cur.c1 = Math.max(0, Math.min(NC - 1, cur.c1 + dx));
		if (!shift) { cur.dr0 = cur.dr1; cur.c0 = cur.c1; }
		pointSet(cur.dr0, cur.c0, cur.dr1, cur.c1);
		reveal(cur.dr1, cur.c1);
	}
	function f4Key(e) {
		if (e.key !== "F4" || !editing || !isFormulaText(edText())) return false;
		e.preventDefault(); e.stopPropagation();
		var el = edEl(), r = X.f4At(el.value, el.selectionStart, el.selectionEnd);
		if (r) {
			var pk = editing.pick;
			if (pk) editing.pick = Object.assign({}, pk, { start: r.start, end: r.end, text: r.text.slice(r.start, r.end) });
			setEdText(r.text, r.caret);
		}
		return true;
	}
	// outlines of the references being typed, in the colours the formula text uses
	function boxOf(g, dom, yOf, xOf) {
		var r0 = g.s.r, r1 = Math.min(g.e.r, Math.max(nRows - 1, g.s.r, 0));
		var d0 = displayRow(r0), d1 = displayRow(r1);
		if (d0 == null || d1 == null) return null;
		var a = Math.max(d0, dom.r0), b = Math.min(d1, dom.r1), c0 = Math.max(g.s.c, dom.c0), c1 = Math.min(g.e.c, dom.c1);
		if (a > b || c0 > c1) return null;
		return { l: xOf(c0), t: yOf(a), w: colX[c1 + 1] - colX[c0], h: (b - a + 1) * RH };
	}
	function boxDiv(b, cls, extra) { return b ? '<div class="' + cls + '" style="left:' + b.l + "px;top:" + b.t + "px;width:" + b.w + "px;height:" + b.h + "px;" + (extra || "") + '"></div>' : ""; }
	function refBoxes(dom, yOf, xOf) {
		if (!editing || !hlRefs.length) return "";
		var out = [];
		hlRefs.forEach(function (s) {
			var onSheet = s.sheet ? String(s.sheet).toLowerCase() === wb.SheetNames[si].toLowerCase() : editing.si === si;
			if (onSheet) out.push(boxDiv(boxOf(s.g, dom, yOf, xOf), "xl-refbox", "border-color:" + s.color + ";background:" + s.color + "1f"));
		});
		return out.join("");
	}
	function spillBox(dom, yOf, xOf) {
		if (!wb || !calc || editing || sel.mode) return "";
		var ar = actualRow(sel.ar); if (ar == null) return "";
		var g = calc.spillOf(si, ar, sel.ac);
		if (!g) { var k = calc.spilledBy[si + ":" + ar + ":" + sel.ac], p = k && k.split(":"); if (p && +p[0] === si) g = calc.spillOf(si, +p[1], +p[2]); }
		if (!g || (g.s.r === g.e.r && g.s.c === g.e.c)) return "";
		return boxDiv(boxOf(g, dom, yOf, xOf), "xl-spill");
	}
	function clipBox(dom, yOf, xOf) {
		if (!clip || clip.si !== si || editing) return "";
		var g = { s: { r: Math.min.apply(null, clip.ar), c: clip.c1 }, e: { r: Math.max.apply(null, clip.ar), c: clip.c2 } };
		return boxDiv(boxOf(g, dom, yOf, xOf), "xl-clip");
	}
	function fillPrevBox(dom, yOf, xOf) {
		if (!fillDrag || !fillDrag.prev) return "";
		var p = fillDrag.prev, a = Math.max(p.r1, dom.r0), b = Math.min(p.r2, dom.r1), c0 = Math.max(p.c1, dom.c0), c1 = Math.min(p.c2, dom.c1);
		if (a > b || c0 > c1) return "";
		return boxDiv({ l: xOf(c0), t: yOf(a), w: colX[c1 + 1] - colX[c0], h: (b - a + 1) * RH }, "xl-fillprev");
	}
	function fillHandle(dom, xOf, yOf) {
		if (!wb || editing || sel.mode === "all") return "";
		var R = selRect();
		if (R.r2 < dom.r0 || R.r2 > dom.r1 || R.c2 < dom.c0 || R.c2 > dom.c1 || R.c2 >= NC) return "";
		var w = colX[R.c2 + 1] - colX[R.c2]; if (!w) return "";
		return '<div class="xl-fh" data-fh="1" title="Drag to fill (double-click: fill down to the end of the data)" style="left:' + (xOf(R.c2) + w - 5) + "px;top:" + (yOf(R.r2) + RH - 5) + 'px"></div>';
	}
	function withMl(L, ml) { return O ? O.mergeLook(L, ml) : L; }
	function fmtState() { /* cell format toolbar: not built */ }

	/* ---------- internal clipboard (copy / cut / paste keep formulas and formats; relative references shift like Excel) ---------- */
	function isDateZ(z) { return !!(z && /[dy]/i.test(String(z).replace(/"[^"]*"/g, "")) && !/\[/.test(z)); }
	function cloneFor(cell, dr, dc) {
		if (!cell) return undefined;
		var n = Object.assign({}, cell); delete n.w; delete n.sp;
		if (n.f) { n.f = X.shiftFormula(n.f, dr, dc); n.t = n.t === "e" ? "n" : n.t; }
		return n;
	}
	function setCellObjs(list, label) {
		var s = si, ch = [];
		list.forEach(function (x) { var b = getCell(x.r, x.c); if (!b && !x.a) return; ch.push({ r: x.r, c: x.c, b: b, a: x.a }); });
		if (!ch.length) return;
		var res = writeCells(s, ch, "a");
		pushUndo({ k: "cells", si: s, ch: ch, label: label });
		afterChange(ch.some(function (x) { return x.r >= nRows || x.c >= nCols; }) || ch.some(function (x) { return !x.a; }) || !!(res && res.spilled && res.spilled.length));
	}
	function doCopy(cut) {
		if (!wb) return null;
		var R = selRect(), r2 = Math.min(R.r2, Math.max(dataN() - 1, R.r1)), c2 = Math.min(R.c2, Math.max(nCols - 1, R.c1));
		if ((r2 - R.r1 + 1) * (c2 - R.c1 + 1) > 500000) { toast("That is too many cells to copy at once."); return null; }
		var ars = [], cells = [], tsv = [], htm = [];
		for (var r = R.r1; r <= Math.max(r2, R.r1); r++) {
			var ar = actualRow(r), row = ar == null ? null : data()[ar], cr = [], tr = [], hr = [];
			for (var c = R.c1; c <= c2; c++) {
				var cell = row ? row[c] : undefined, t = disp(cell), css = "";
				try { var sa = cell ? styleAt(ar, c, cell) : null; css = sa && sa.css && sa.css.css || ""; } catch (e) { css = ""; }
				cr.push(cell ? Object.assign({}, cell) : undefined); tr.push(t); hr.push({ text: t, css: css, num: !!(cell && cell.t === "n") });
			}
			ars.push(ar); cells.push(cr); tsv.push(tr); htm.push(hr);
		}
		var text = X.toDelimited(tsv, "\t", "\n");
		clip = { si: si, ar: ars, c1: R.c1, c2: c2, cells: cells, text: text, cut: !!cut };
		render();
		return { text: text, html: X.htmlTable(htm) };
	}
	function clipSame(text) { return !!clip && String(text).replace(/\r?\n$/, "") === clip.text.replace(/\r?\n$/, ""); }
	function pasteInternal() {
		var R = selRect(), h = clip.ar.length, w = clip.c2 - clip.c1 + 1;
		var tr = R.r2 - R.r1 + 1, tc = R.c2 - R.c1 + 1;
		var nH = !clip.cut && tr > h && tr % h === 0 ? tr : h, nW = !clip.cut && tc > w && tc % w === 0 ? tc : w;
		if (nH * nW > 300000) { toast("That is too much to paste at once (" + nf(nH * nW) + " cells)."); return; }
		var t0 = actualRow(R.r1); if (t0 == null) return;
		if (clip.cut) return pasteCut(R, t0);
		var list = [], cutShort = false;
		for (var i = 0; i < nH; i++) {
			var trow = actualRow(R.r1 + i); if (trow == null) { cutShort = true; break; }
			for (var j = 0; j < nW; j++) {
				var sr = clip.ar[i % h], sc = clip.c1 + (j % w), tcol = R.c1 + j;
				if (sr == null) continue;
				list.push({ r: trow, c: tcol, a: cloneFor(clip.cells[i % h][j % w], trow - sr, tcol - sc) });
			}
		}
		try { setCellObjs(list, "Paste"); } catch (err) { note(esc(err.message), true); return; }
		sel.fr = Math.min(NR - 1, R.r1 + nH - 1); sel.fc = R.c1 + nW - 1; clampSel(); showActive(); render();
		if (cutShort) note("Only the rows showing in the sorted / filtered view were filled.");
	}
	function pasteCut(R, t0) {
		var srcName = wb.SheetNames[clip.si], dstName = wb.SheetNames[si], h = clip.ar.length, w = clip.c2 - clip.c1 + 1;
		var a0 = clip.ar[0], dr = t0 - a0, dc = R.c1 - clip.c1;
		var g = { s: { r: Math.min.apply(null, clip.ar), c: clip.c1 }, e: { r: Math.max.apply(null, clip.ar), c: clip.c2 } }, from = { sheet: srcName, g: g };
		var s0 = clip.si, dst = si;
		struct("Move cells", function () {
			var changed = [];
			// references (anywhere in the book) to cells that are moving follow them
			wb.SheetNames.forEach(function (n, s) {
				var d = wb.Sheets[n]["!data"] || [];
				for (var r = 0; r < d.length; r++) { var row = d[r]; if (!row) continue; for (var c = 0; c < row.length; c++) { var cell = row[c]; if (!cell || !cell.f) continue; var f2 = X.moveRefs(cell.f, from, dr, dc, n, dstName); if (f2 !== cell.f) { var nc = Object.assign({}, cell, { f: f2 }); delete nc.w; row[c] = nc; changed.push({ si: s, r: r, c: c }); } } }
			});
			var sd = wb.Sheets[srcName]["!data"] || (wb.Sheets[srcName]["!data"] = []), dd = wb.Sheets[dstName]["!data"] || (wb.Sheets[dstName]["!data"] = []), moved = [];
			for (var i = 0; i < h; i++) { var sr = clip.ar[i]; for (var j = 0; j < w; j++) { var cc = clip.c1 + j, cell2 = sd[sr] && sd[sr][cc]; moved.push({ r: sr + dr, c: cc + dc, cell: cell2 ? Object.assign({}, cell2) : undefined }); if (sd[sr]) sd[sr][cc] = undefined; changed.push({ si: s0, r: sr, c: cc }); } }
			moved.forEach(function (m) { if (m.cell) { delete m.cell.w; delete m.cell.sp; } if (!dd[m.r]) dd[m.r] = []; dd[m.r][m.c] = m.cell; changed.push({ si: dst, r: m.r, c: m.c }); });
			return changed;
		}, true);
		clip = null;
		sel.ar = Math.max(minRow(), R.r1); sel.ac = R.c1; sel.fr = Math.min(NR - 1, R.r1 + h - 1); sel.fc = R.c1 + w - 1; clampSel(); showActive(); render();
	}

	/* ---------- fill handle, Ctrl+D / Ctrl+R ---------- */
	function seriesVals(cells, n) {
		var src = cells.map(function (c) {
			if (!c) return { v: null };
			if (c.t === "n" && typeof c.v === "number") return { v: c.v, date: isDateZ(c.z) };
			if ((c.t === "s" || c.t === "str") && c.v != null) return { v: String(c.v) };
			if (c.t === "b") return { v: !!c.v };
			return { v: null };
		});
		if (src.some(function (x) { return x.v === null; })) return null;
		return X.fillSeries(src, n, {});
	}
	function fromVal(base, r) {
		var n = Object.assign({}, base || {}); delete n.f; delete n.w; delete n.sp; delete n.da; delete n.v; delete n.t;
		if (typeof r.v === "number") { n.t = "n"; n.v = r.v; } else if (typeof r.v === "boolean") { n.t = "b"; n.v = r.v; } else { n.t = "s"; n.v = String(r.v); }
		return n;
	}
	// R: selection (display rows); dir d / u / r / l; n = how many cells to add beyond it; copy = copy instead of making a series
	function fillCells(R, dir, n, copy, label) {
		var vert = dir === "d" || dir === "u", fwd = dir === "d" || dir === "r", ch = [], rows = [];
		for (var r = R.r1; r <= R.r2; r++) rows.push(actualRow(r));
		var nLines = vert ? R.c2 - R.c1 + 1 : rows.length, m = vert ? rows.length : R.c2 - R.c1 + 1;
		for (var L = 0; L < nLines; L++) {
			var src = [], pos = [];
			for (var i = 0; i < m; i++) { var ar = vert ? rows[i] : rows[L], c = vert ? R.c1 + L : R.c1 + i; if (ar == null) continue; src.push(getCell(ar, c)); pos.push({ r: ar, c: c }); }
			if (!src.length) continue;
			m = src.length;
			var ord = fwd ? src.slice() : src.slice().reverse(), ordPos = fwd ? pos : pos.slice().reverse();
			var hasF = ord.some(function (x) { return x && x.f; }), vals = !hasF && !copy ? seriesVals(ord, n) : null;
			for (var k = 0; k < n; k++) {
				var tr, tc;
				if (vert) { tc = R.c1 + L; tr = actualRow(fwd ? R.r2 + 1 + k : R.r1 - 1 - k); } else { tr = rows[L]; tc = fwd ? R.c2 + 1 + k : R.c1 - 1 - k; }
				if (tr == null || tr < 0 || tc < 0 || tc >= 16384) continue;
				var q = k % m, a = vals ? fromVal(ord[q], vals[k]) : cloneFor(ord[q], tr - ordPos[q].r, tc - ordPos[q].c);
				ch.push({ r: tr, c: tc, a: a });
			}
		}
		if (!ch.length) return false;
		try { setCellObjs(ch, label || "Fill"); } catch (err) { note(esc(err.message), true); return false; }
		return true;
	}
	function fillDown(copy) {
		var R = selRect(); if (!wb) return;
		if (R.r2 > R.r1) fillCells({ r1: R.r1, r2: R.r1, c1: R.c1, c2: R.c2 }, "d", R.r2 - R.r1, true, "Fill down");
		else if (R.r1 > minRow()) fillCells({ r1: R.r1 - 1, r2: R.r1 - 1, c1: R.c1, c2: R.c2 }, "d", 1, true, "Fill down");
		render(); void copy;
	}
	function fillRight() {
		var R = selRect(); if (!wb) return;
		if (R.c2 > R.c1) fillCells({ r1: R.r1, r2: R.r2, c1: R.c1, c2: R.c1 }, "r", R.c2 - R.c1, true, "Fill right");
		else if (R.c1 > 0) fillCells({ r1: R.r1, r2: R.r2, c1: R.c1 - 1, c2: R.c1 - 1 }, "r", 1, true, "Fill right");
		render();
	}
	function fillTarget(p) {
		var R = fillDrag.R, dv = p.dr > R.r2 ? p.dr - R.r2 : p.dr < R.r1 ? p.dr - R.r1 : 0, dh = p.c > R.c2 ? p.c - R.c2 : p.c < R.c1 ? p.c - R.c1 : 0;
		if (!dv && !dh) return { dir: null, n: 0, prev: null };
		if (Math.abs(dv) >= Math.abs(dh) * (dh ? 1 : 1) && dv) return dv > 0 ? { dir: "d", n: dv, prev: { r1: R.r1, r2: R.r2 + dv, c1: R.c1, c2: R.c2 } } : { dir: "u", n: -dv, prev: { r1: R.r1 + dv, r2: R.r2, c1: R.c1, c2: R.c2 } };
		return dh > 0 ? { dir: "r", n: dh, prev: { r1: R.r1, r2: R.r2, c1: R.c1, c2: R.c2 + dh } } : { dir: "l", n: -dh, prev: { r1: R.r1, r2: R.r2, c1: R.c1 + dh, c2: R.c2 } };
	}
	grid.addEventListener("pointerdown", function (e) {
		if (!wb || e.button > 0) return;
		var tf = e.target.closest && e.target.closest(".xl-tfb");
		if (tf) { e.preventDefault(); e.stopPropagation(); if (editing && !commitEdit()) return; tfMenu(tf); return; }
		var fh = e.target.closest && e.target.closest(".xl-fh");
		if (fh) {
			e.preventDefault(); e.stopPropagation();
			fillDrag = { R: selRect(), prev: null, dir: null, n: 0 };
			try { fh.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			var mv = function (ev) {
				var rect = scroll.getBoundingClientRect();
				if (ev.clientY > rect.bottom - 6) scroll.scrollTop += RH; else if (ev.clientY < rect.top + 6) scroll.scrollTop -= RH;
				if (ev.clientX > rect.right - 6) scroll.scrollLeft += 40; else if (ev.clientX < rect.left + 6) scroll.scrollLeft -= 40;
				var t = fillTarget(hitCell(ev, scroll)); fillDrag.dir = t.dir; fillDrag.n = t.n; fillDrag.prev = t.prev; render();
			};
			var up = function (ev) {
				document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
				var fd = fillDrag; if (fd && !fd.dir && ev.type === "pointerup") { var t2 = fillTarget(hitCell(ev, scroll)); fd.dir = t2.dir; fd.n = t2.n; fd.prev = t2.prev; } fillDrag = null;
				if (fd && fd.dir && fd.n > 0 && ev.type === "pointerup") {
					if (fillCells(fd.R, fd.dir, fd.n, ev.ctrlKey || ev.metaKey)) { var p = fd.prev; sel.ar = p.r1; sel.fr = p.r2; sel.ac = p.c1; sel.fc = p.c2; sel.mode = ""; clampSel(); showActive(); }
				}
				render();
			};
			document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
		}
	}, true);
	grid.addEventListener("dblclick", function (e) {
		var fh = e.target.closest && e.target.closest(".xl-fh"); if (!fh || !wb) return;
		e.preventDefault(); e.stopPropagation();
		var R = selRect(), nc = R.c1 > 0 ? R.c1 - 1 : R.c2 + 1, n = 0;
		for (var dr = R.r2 + 1; dr < NR && n < 100000; dr++) { var ar = actualRow(dr); var cl = ar == null ? null : getCell(ar, nc); if (!cl || cl.t === "z" || disp(cl) === "") break; n++; }
		if (n > 0 && fillCells(R, "d", n, false)) { sel.fr = R.r2 + n; clampSel(); showActive(); render(); }
	}, true);

	/* ---------- Excel tables (Insert > Table): banded rows, header sort / filter buttons ---------- */
	function myTables(w) { w = w || ws(); return w["!mestables"] || (w["!mestables"] = []); }
	function tableEls(t) { if (!t.els) { var p = pkgOf(); t.els = O.tableElements(t, p ? p.styles : null, p ? p.theme : null) || null; } return t.els; }
	function tableAt(ar, c) {
		var l = ws()["!mestables"]; if (!l) return null;
		for (var i = 0; i < l.length; i++) { var t = l[i]; if (ar >= t.g.s.r && ar <= t.g.e.r && c >= t.g.s.c && c <= t.g.e.c) return t; }
		return null;
	}
	function allTables() {
		var out = [];
		wb.SheetNames.forEach(function (n) {
			var w = wb.Sheets[n], x = sx(w);
			(x && x.tables || []).forEach(function (t) { out.push({ name: t.name, sheet: n, g: t.g, header: t.header, totals: t.totals, cols: t.columns || [] }); });
			(w["!mestables"] || []).forEach(function (t) { out.push({ name: t.name, sheet: n, g: t.g, header: t.header, totals: t.totals, cols: t.columns || [] }); });
		});
		return out;
	}
	var calcTables = function () { return allTables(); };
	var bookNames = function () {
		var o = {}, nm = wb && wb.Workbook && wb.Workbook.Names || [];
		nm.forEach(function (n) { if (n && n.Name && n.Ref && n.Sheet == null) o[String(n.Name).toUpperCase()] = n.Ref; });
		return o;
	};
	// the block of filled cells around (r, c) (what Excel selects for a one-cell selection)
	function region(r, c) {
		var d = data(), has = function (rr, cc) { var cl = d[rr] && d[rr][cc]; return !!(cl && cl.t !== "z" && disp(cl) !== ""); };
		var r1 = r, r2 = r, c1 = c, c2 = c, grew = true, guard = 0;
		while (grew && guard++ < 500) {
			grew = false;
			var rowHas = function (rr) { for (var cc = c1 - 1; cc <= c2 + 1; cc++) if (cc >= 0 && has(rr, cc)) return true; return false; };
			var colHas = function (cc) { for (var rr = r1 - 1; rr <= r2 + 1; rr++) if (rr >= 0 && has(rr, cc)) return true; return false; };
			if (r1 > 0 && rowHas(r1 - 1)) { r1--; grew = true; }
			if (r2 + 1 < nRows && rowHas(r2 + 1)) { r2++; grew = true; }
			if (c1 > 0 && colHas(c1 - 1)) { c1--; grew = true; }
			if (c2 + 1 < nCols && colHas(c2 + 1)) { c2++; grew = true; }
		}
		return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } };
	}
	function selGrid() {
		var R = selRect(), a = actualRow(R.r1), b = actualRow(Math.min(R.r2, Math.max(dataN() - 1, R.r1)));
		if (a == null || b == null) return null;
		var g = { s: { r: Math.min(a, b), c: R.c1 }, e: { r: Math.max(a, b), c: Math.min(R.c2, Math.max(nCols - 1, R.c1)) } };
		if (g.s.r === g.e.r && g.s.c === g.e.c) { var cl = getCell(g.s.r, g.s.c); if (!cl || cl.t === "z") return null; g = region(g.s.r, g.s.c); }
		return g;
	}
	function insertTable() {
		if (!wb) return;
		var g = selGrid();
		if (!g || g.e.r === g.s.r) { toast("Select the cells for the table first (a header row and at least one row of data)."); return; }
		var clash = (ws()["!mestables"] || []).some(function (t) { return !(g.e.r < t.g.s.r || g.s.r > t.g.e.r || g.e.c < t.g.s.c || g.s.c > t.g.e.c); });
		if (clash) { toast("Those cells are already in a table."); return; }
		var names = {}; allTables().forEach(function (t) { names[String(t.name).toLowerCase()] = 1; });
		var k = 1; while (names["table" + k]) k++;
		var id = 1; wb.SheetNames.forEach(function (n) { (wb.Sheets[n]["!mestables"] || []).forEach(function (t) { id = Math.max(id, t.id + 1); }); });
		struct("Insert table", function () {
			var d = data(), texts = [], c;
			for (c = g.s.c; c <= g.e.c; c++) texts.push(disp(d[g.s.r] && d[g.s.r][c]));
			var cols = O.tableColNames(texts), changed = [];
			if (!d[g.s.r]) d[g.s.r] = [];
			cols.forEach(function (nm, i) { var cc = g.s.c + i, old = d[g.s.r][cc]; if (!old || old.t === "n" || disp(old) !== nm) { d[g.s.r][cc] = Object.assign({}, old || {}, { t: "s", v: nm }); delete d[g.s.r][cc].w; delete d[g.s.r][cc].f; changed.push({ si: si, r: g.s.r, c: cc }); } });
			myTables().push({ id: id, name: "Table" + k, g: { s: { r: g.s.r, c: g.s.c }, e: { r: g.e.r, c: g.e.c } }, header: true, totals: false, style: "TableStyleMedium2", rowStripes: true, colStripes: false, firstCol: false, lastCol: false, columns: cols, cols: cols });
			return changed;
		}, true);
		toast("Made Table" + k + ". Use the arrows in the header row to sort it.");
	}
	function sortTable(t, c, dir) {
		var first = t.g.s.r + (t.header ? 1 : 0), last = t.g.e.r - (t.totals ? 1 : 0);
		if (last <= first) return;
		struct("Sort table", function () {
			var d = data(), rows = [], changed = [], i;
			for (i = first; i <= last; i++) rows.push({ i: i, row: d[i] ? d[i].slice() : [], key: X.cellValue(d[i] ? d[i][c] : undefined) });
			var rank = function (v) { return v == null || v === "" ? 3 : typeof v === "number" ? 0 : typeof v === "boolean" ? 2 : 1; };
			rows.sort(function (a, b) {
				var ra = rank(a.key), rb = rank(b.key); if (ra === 3 || rb === 3) return ra === rb ? a.i - b.i : ra === 3 ? 1 : -1;
				if (ra !== rb) return ra - rb;
				var cmp = ra === 1 ? String(a.key).toLowerCase().localeCompare(String(b.key).toLowerCase()) : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
				return cmp ? cmp * dir : a.i - b.i;
			});
			rows.forEach(function (o, k) {
				var tr = first + k; if (!d[tr]) d[tr] = [];
				for (var cc = t.g.s.c; cc <= t.g.e.c; cc++) { var src = o.row[cc]; d[tr][cc] = o.i === tr ? src : cloneFor(src, tr - o.i, 0); changed.push({ si: si, r: tr, c: cc }); }
			});
			return changed;
		}, true);
		toast("Sorted " + t.name + " by " + (t.columns[c - t.g.s.c] || X.colName(c)) + (dir > 0 ? ", A to Z." : ", Z to A."));
	}
	function closeTf() { if (tfMenuEl) { tfMenuEl.remove(); tfMenuEl = null; } }
	function tfMenu(btn) {
		closeTf();
		var parts = btn.getAttribute("data-tf").split(":"), ar = +parts[0], c = +parts[1], t = tableAt(ar, c); if (!t) return;
		var m = document.createElement("div"); m.className = "xl-menu xl-tfmenu"; m.setAttribute("role", "menu");
		var v = views[wb.SheetNames[si]], on = v && v.filters && v.filters.some(function (f) { return f.c === c && f.t === t.name; });
		m.innerHTML = '<button type="button" role="menuitem" data-a="asc"><b>Sort A to Z</b><small>smallest first</small></button><button type="button" role="menuitem" data-a="desc"><b>Sort Z to A</b><small>largest first</small></button>' +
			'<button type="button" role="menuitem" data-a="filter"><b>Show only rows that contain…</b><small>a view: the file is not changed</small></button>' + (on ? '<button type="button" role="menuitem" data-a="clear"><b>Clear this filter</b></button>' : "");
		var r = btn.getBoundingClientRect(), ar0 = app.getBoundingClientRect();
		m.style.position = "fixed"; m.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 280)) + "px"; m.style.top = (r.bottom + 4) + "px"; m.style.width = "260px"; m.style.zIndex = 2147483000;
		(app.classList.contains("mes-pfill") ? app : document.body).appendChild(m); tfMenuEl = m; void ar0;
		m.addEventListener("click", function (e) {
			var b = e.target.closest("[data-a]"); if (!b) return; var a = b.getAttribute("data-a"); closeTf();
			if (a === "asc") sortTable(t, c, 1); else if (a === "desc") sortTable(t, c, -1);
			else if (a === "filter") { var val = window.prompt("Show only the rows where " + (t.columns[c - t.g.s.c] || X.colName(c)) + " contains:", ""); if (val) { var vs = vstate(); vs.filters.push({ c: c, op: "contains", v: val, t: t.name }); computeView(); } }
			else if (a === "clear") { var v2 = vstate(); v2.filters = v2.filters.filter(function (f) { return !(f.c === c && f.t === t.name); }); computeView(); }
		});
		setTimeout(function () { var f = m.querySelector("button"); if (f) f.focus(); }, 0);
		m.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeTf(); scroll.focus({ preventScroll: true }); } });
	}
	document.addEventListener("pointerdown", function (e) { if (tfMenuEl && !e.target.closest(".xl-tfmenu") && !e.target.closest(".xl-tfb")) closeTf(); }, true);
	// rows / columns inserted or deleted: tables and charts of this sheet follow (a table grows when rows go inside it; a deleted one goes)
	function shiftIdx(i, at, n, isEnd) {
		if (n > 0) return i >= at ? i + n : i;
		var m = -n; if (i >= at + m) return i + n; if (i >= at) return isEnd ? at - 1 : at; return i;
	}
	function shiftObjects(axis, at, n, name) {
		void name;
		var w = ws(), k = axis, tl = w["!mestables"], cl = w["!mescharts"];
		if (tl) w["!mestables"] = tl.filter(function (t) {
			var s0 = t.g.s[k], e0 = t.g.e[k], s1 = shiftIdx(s0, at, n, false), e1 = shiftIdx(e0, at, n, true);
			if (n < 0 && s0 >= at && e0 < at - n) return false;
			if (e1 < s1) return false;
			t.g = { s: Object.assign({}, t.g.s), e: Object.assign({}, t.g.e) }; t.g.s[k] = s1; t.g.e[k] = e1; delete t.els;
			if (k === "c") {
				var d = w["!data"] || [], cols = t.columns.slice();
				if (n > 0 && at > s0 && at <= e0) { for (var j = 0; j < n; j++) { var nm = "Column" + (cols.length + 1); while (cols.indexOf(nm) >= 0) nm += "x"; cols.splice(at - s0 + j, 0, nm); if (!d[t.g.s.r]) d[t.g.s.r] = []; d[t.g.s.r][at + j] = { t: "s", v: nm }; } }
				else if (n < 0) cols.splice(Math.max(0, at - s0), Math.min(cols.length, Math.max(0, Math.min(e0, at - n - 1) - Math.max(s0, at) + 1)));
				t.columns = cols; t.cols = cols;
			}
			return true;
		});
		if (cl) w["!mescharts"] = cl.filter(function (c) {
			var key = k === "r" ? "r" : "c", f = c.at.from, t2 = c.at.to;
			f[key] = shiftIdx(f[key], at, n, false); t2[key] = shiftIdx(t2[key], at, n, true); if (t2[key] < f[key]) t2[key] = f[key];
			["s", "e"].forEach(function (_) { /* data refs follow through the series ranges below */ });
			(c.m.series || []).forEach(function (s) { ["name", "cat", "val"].forEach(function (q) { var o = s[q]; if (o && o.g) { o.g = { s: Object.assign({}, o.g.s), e: Object.assign({}, o.g.e) }; o.g.s[k] = shiftIdx(o.g.s[k], at, n, false); o.g.e[k] = shiftIdx(o.g.e[k], at, n, true); } }); });
			chartBuild(c);
			return true;
		});
	}

	/* ---------- charts (Insert > Chart): drawn from the selection, saved into the .xlsx ---------- */
	function myCharts(w) { w = w || ws(); return w["!mescharts"] || (w["!mescharts"] = []); }
	function chartBuild(c) {
		c.xml = O.chartXml(c.m);
		var p = pkgOf();
		c.chart = O.parseChart(c.xml, p ? p.theme : null);
		return c;
	}
	function drawMyCharts(html, dark) {
		var l = ws()["!mescharts"]; if (!l) return;
		l.forEach(function (c, i) {
			var r = rectOf({ from: c.at.from, to: c.at.to }); if (!r || r.w < 30 || r.h < 30) return;
			var svg = "";
			try { svg = O.chartSvg(c.chart, chartModel(c.chart), { w: Math.round(r.w), h: Math.round(r.h), dark: dark, fmt: fmtVal }); } catch (e) { svg = ""; if (window.console) console.warn("[excel] chart", e); }
			if (svg) html.push('<div class="xl-obj xl-chart xl-mychart' + (i === mcSel ? " is-sel" : "") + '" data-mc="' + i + '" tabindex="0" role="img" aria-label="' + esc("Chart" + (c.m.title ? ": " + c.m.title : "")) + '" style="left:' + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + 'px">' + svg + '<button type="button" class="xl-mcx" data-mcx="' + i + '" aria-label="Delete this chart" title="Delete this chart">&times;</button></div>');
		});
	}
	var mcSel = -1;
	function numCell(c) { return !!(c && c.t === "n" && typeof c.v === "number"); }
	function textCell(c) { return !!(c && (c.t === "s" || c.t === "str") && String(c.v == null ? "" : c.v) !== ""); }
	function chartModelFor(type) {
		var g = selGrid();
		if (!g || (g.e.r === g.s.r && g.e.c === g.s.c)) { toast("Select the cells to chart first (for example a column of labels and a column of numbers)."); return null; }
		var d = data(), rows = g.e.r - g.s.r + 1, cols = g.e.c - g.s.c + 1;
		var cell = function (r, c) { return d[r] && d[r][c]; };
		// header row: the first row has text where the rows below have numbers
		var dataC0 = g.s.c, hasCat = false;
		var body0 = g.s.r + 1;
		var firstColText = 0, firstColNum = 0; for (var r = body0; r <= g.e.r; r++) { var q = cell(r, g.s.c); if (textCell(q)) firstColText++; else if (numCell(q)) firstColNum++; }
		var scatter = type === "scatter";
		if (cols > 1 && (scatter ? firstColNum > 0 && firstColText === 0 : firstColText > firstColNum || (firstColNum === 0 && firstColText === 0))) hasCat = true;
		if (hasCat) dataC0 = g.s.c + 1;
		var header = false;
		for (var c = dataC0; c <= g.e.c; c++) if (textCell(cell(g.s.r, c))) header = true;
		if (!header && rows > 1 && numCell(cell(g.s.r, dataC0)) === false && !textCell(cell(g.s.r, dataC0))) header = false;
		var r0 = header ? g.s.r + 1 : g.s.r;
		if (r0 > g.e.r) { toast("Select at least one row of numbers under the headings."); return null; }
		var series = [];
		for (var cc = dataC0; cc <= g.e.c; cc++) {
			var nums = 0; for (var rr = r0; rr <= g.e.r; rr++) if (numCell(cell(rr, cc))) nums++;
			if (!nums) continue;
			var s = { name: header && textCell(cell(g.s.r, cc)) ? { g: { s: { r: g.s.r, c: cc }, e: { r: g.s.r, c: cc } } } : "Series " + (series.length + 1), val: { g: { s: { r: r0, c: cc }, e: { r: g.e.r, c: cc } } } };
			if (hasCat) s.cat = { g: { s: { r: r0, c: g.s.c }, e: { r: g.e.r, c: g.s.c } } };
			series.push(s);
		}
		if (!series.length) { toast("No numbers in the selection to chart."); return null; }
		if (type === "pie" || type === "doughnut") series = series.slice(0, 1);
		var title = series.length === 1 && header && textCell(cell(g.s.r, dataC0)) ? String(cell(g.s.r, dataC0).v) : "";
		return { type: type, sheet: wb.SheetNames[si], title: title, legend: series.length > 1 || type === "pie" || type === "doughnut" ? "r" : null, series: series, grid: g };
	}
	function insertChart(type) {
		if (!wb) return;
		var m = chartModelFor(type); if (!m) return;
		var g = m.grid; delete m.grid;
		var from = { c: g.e.c + 2, co: 0, r: g.s.r, ro: 0 }, to = { c: g.e.c + 10, co: 0, r: g.s.r + 15, ro: 0 };
		var ch = chartBuild({ m: m, at: { from: from, to: to }, id: Date.now() });
		struct("Insert chart", function () { myCharts().push(ch); return []; }, true);
		S.objs = true; save(); toolState(); drawObjects(true);
		toast("Added a " + type + " chart. Drag it to move it; the × deletes it.");
	}
	function deleteChart(i) { struct("Delete chart", function () { myCharts().splice(i, 1); return []; }, true); mcSel = -1; drawObjects(true); }
	var mcDrag = null;
	$("xl-objs").addEventListener("pointerdown", function (e) {
		var x = e.target.closest("[data-mcx]"); if (x) { e.preventDefault(); e.stopPropagation(); deleteChart(+x.getAttribute("data-mcx")); return; }
		var o = e.target.closest("[data-mc]"); if (!o || e.button > 0) return;
		var i = +o.getAttribute("data-mc"), c = ws()["!mescharts"][i]; if (!c) return;
		mcSel = i; var p = hitCell(e, scroll);
		mcDrag = { i: i, dr: p.dr, c: p.c, from: JSON.parse(JSON.stringify(c.at)), moved: false };
		try { o.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
		e.preventDefault(); drawObjects(true);
	});
	$("xl-objs").addEventListener("pointermove", function (e) {
		if (!mcDrag) return;
		var p = hitCell(e, scroll), dr = actualRow(p.dr) - actualRow(mcDrag.dr), dc = p.c - mcDrag.c, c = ws()["!mescharts"][mcDrag.i]; if (!c) return;
		if (!dr && !dc && !mcDrag.moved) return;
		mcDrag.moved = true;
		var f0 = mcDrag.from.from, t0 = mcDrag.from.to, nr = Math.max(0, f0.r + dr), nc = Math.max(0, f0.c + dc);
		c.at = { from: { c: nc, co: f0.co, r: nr, ro: f0.ro }, to: { c: t0.c + (nc - f0.c), co: t0.co, r: t0.r + (nr - f0.r), ro: t0.ro } };
		drawObjects(true);
	});
	$("xl-objs").addEventListener("pointerup", function () { if (mcDrag && mcDrag.moved && file) { file.dirty = true; renderName(); autosave(); } mcDrag = null; });
	$("xl-objs").addEventListener("keydown", function (e) { var o = e.target.closest && e.target.closest("[data-mc]"); if (o && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deleteChart(+o.getAttribute("data-mc")); scroll.focus({ preventScroll: true }); } });
	// the editor's own tables and charts, as new parts for the .xlsx
	function mineParts(w, k) {
		var add = [], tl = w["!mestables"] || [], cl = w["!mescharts"] || [], d = w["!data"] || [];
		tl.forEach(function (t) {
			var texts = []; for (var c = t.g.s.c; c <= t.g.e.c; c++) texts.push(disp(d[t.g.s.r] && d[t.g.s.r][c]));
			t.cols = O.tableColNames(texts);
			add.push({ tag: "tablePart", relType: O.REL.table, part: "xl/tables/tableMes" + t.id + ".xml", xml: O.tableXml(t), ctType: O.CT.table });
		});
		if (cl.length) {
			var list = cl.map(function (c, i) { return { from: c.at.from, to: c.at.to, name: "Chart " + (i + 1), rid: "rId" + (i + 1) }; });
			add.push({ tag: "drawing", relType: O.REL.drawing, part: "xl/drawings/drawingMes" + (k + 1) + ".xml", xml: O.drawingXml(list), ctType: O.CT.drawing,
				rels: cl.map(function (c, i) { return { id: "rId" + (i + 1), type: O.REL.chart, target: "xl/charts/chartMes" + (k + 1) + "_" + (i + 1) + ".xml" }; }),
				sub: cl.map(function (c, i) { return { part: "xl/charts/chartMes" + (k + 1) + "_" + (i + 1) + ".xml", xml: O.chartXml(c.m), ctType: O.CT.chart }; }) });
		}
		return add;
	}

	/* ---------- Insert menu ---------- */
	if ($("xl-insmenu")) $("xl-insmenu").addEventListener("click", function (e) {
		var b = e.target.closest("[data-ins]"); if (!b) return; closeMenus();
		var w = b.getAttribute("data-ins");
		if (w === "table") insertTable(); else if (w.indexOf("chart:") === 0) insertChart(w.slice(6));
		else if (w === "fill-down") fillDown(); else if (w === "fill-right") fillRight();
	});

	/* ---------- fill window / full screen ---------- */
	function addPanel() { if (window.MESPanel) window.MESPanel.add(app, { bar: $("xl-pv"), onChange: function () { layout(); render(); } }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);

	/* ---------- start ---------- */
	$("xl-hdr").setAttribute("aria-pressed", String(S.freeze));
	showRecent();
	var q = /[?&]new=1/.test(location.search);
	if (q) newBook();
	// dark mode switched: cell colours (dark text without a fill is lightened) and charts follow
	if (window.MutationObserver) { var wasDark = isDark(); new MutationObserver(function () { var d = isDark(); if (d !== wasDark) { wasDark = d; cssCache = {}; if (wb) { render(); drawObjects(true); } } }).observe(document.body, { attributes: true, attributeFilter: ["class"] }); }
	window.MESExcelDebug = { get wb() { return wb; }, get sel() { return sel; }, openBytes: openBytes, setCells: setCells, pasteText: pasteText, get stale() { return stale; }, select: select, actualRow: actualRow,
		xlsxBytes: xlsxBytes, setFreeze: setFreeze, showSheet: showSheet, drawObjects: drawObjects, draw: draw };
})();
