/* MES Spreadsheet Viewer & Editor (mes.fm/excel): the worksheet function library (about 250 Excel functions) for the formula engine in
   lib.js. install(MESXL) registers them in MESXL.FN (arguments already worked out) and MESXL.LAZY (arguments worked out on demand:
   IF, IFS, IFERROR, SWITCH, CHOOSE, LET, AND / OR short cuts...). Results are checked against Excel in tool_apps_src/excel-tests.js.
   Conventions: an argument is a Range (a reference), an Arr (an array) or a scalar (number, text, boolean, null = blank, Err).
   Functions that take single values are "lifted": given a range or array they work on every cell and return an array (spill). */
(function (root) {
	"use strict";
	function install(X) {
		var FN = X.FN, LAZY = X.LAZY, E = X.E, isErr = X.isErr, Range = X.Range, Arr = X.Arr, num = X.num, txt = X.txt, bool = X.bool;
		var scalar = X.scalar, isMulti = X.isMulti, toArr = X.toArr, mapArr = X.mapArr, broadcast = X.broadcast, numbersOf = X.numbersOf;
		var compare = X.compare, parseNumberText = X.parseNumberText, roundHalfAway = X.roundHalfAway, fmtGeneral = X.fmtGeneral;
		var NA = E["#N/A"], VAL = E["#VALUE!"], NUM = E["#NUM!"], DIV = E["#DIV/0!"], REF = E["#REF!"];

		/* ---------- helpers ---------- */
		// lift(fn, n): fn(a, b, ...) gets single values; when any of the first n arguments (all when n is omitted) is a range / array the
		// result is an array of fn over every cell (sizes broadcast like Excel).
		function lift(fn, n) {
			return function (args, ctx) {
				var m = n == null ? args.length : Math.min(n, args.length), multi = false;
				for (var i = 0; i < m; i++) if (isMulti(args[i])) { multi = true; break; }
				if (!multi) return fn.apply(ctx, args.map(function (a, i2) { return i2 < m || !(a instanceof Range || a instanceof Arr) ? scalar(a) : a; }));
				var lifted = [], pos = [];
				for (var j = 0; j < m; j++) if (isMulti(args[j])) { lifted.push(args[j]); pos.push(j); }
				return broadcast(lifted, function () {
					var vals = arguments, a2 = args.map(function (a, i3) { var p = pos.indexOf(i3); return p >= 0 ? vals[p] : (i3 < m ? scalar(a) : a); });
					return fn.apply(ctx, a2);
				});
			};
		}
		function N1(x) { var v = num(x); return v; }
		function optNum(x, d) { return x === undefined || x === null && false ? d : (x === undefined ? d : num(x)); }
		function firstErr() { for (var i = 0; i < arguments.length; i++) if (isErr(arguments[i])) return arguments[i]; return null; }
		function isBlank(v) { return v == null; }
		function flat(args, keep) {   // every value of every argument (ranges / arrays read cell by cell), keep(v) filters
			var out = [];
			args.forEach(function (a) { if (a instanceof Range || a instanceof Arr) a.each(function (v) { if (!keep || keep(v)) out.push(v); }); else if (a !== undefined && (!keep || keep(a))) out.push(a); });
			return out;
		}
		function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
		function nums(args) { return numbersOf(args); }
		function statNums(args) { var n = numbersOf(args); return n; }
		function mean(a) { return sum(a) / a.length; }
		function variance(a, sample) { if (a.length < (sample ? 2 : 1)) return DIV; var m = mean(a), s = 0; a.forEach(function (x) { s += (x - m) * (x - m); }); return s / (a.length - (sample ? 1 : 0)); }
		function sortNum(a) { return a.slice().sort(function (x, y) { return x - y; }); }
		function percentile(a, p, exc) {
			var s = sortNum(a), n = s.length;
			if (!n) return NUM;
			if (exc) { var h = p * (n + 1) - 1; if (h < 0 || h > n - 1) return NUM; var lo = Math.floor(h); return s[lo] + (h - lo) * ((s[lo + 1] != null ? s[lo + 1] : s[lo]) - s[lo]); }
			if (p < 0 || p > 1) return NUM;
			var x = p * (n - 1), l = Math.floor(x); return l + 1 < n ? s[l] + (x - l) * (s[l + 1] - s[l]) : s[l];
		}
		function int(x) { return x < 0 ? Math.ceil(x) : Math.floor(x); }
		function ret(v) { return typeof v === "number" && !isFinite(v) ? NUM : v; }
		function arrOf(x) { return x instanceof Range || x instanceof Arr ? toArr(x) : new Arr([[x]]); }
		function dimsOf(x) { if (x instanceof Range) { var b = x.box(); return { h: b.r2 - b.r1 + 1, w: b.c2 - b.c1 + 1 }; } if (x instanceof Arr) return { h: x.h, w: x.w }; return { h: 1, w: 1 }; }

		/* ---------- criteria (COUNTIF, SUMIF ...) ---------- */
		function wild(s) { return new RegExp("^" + s.replace(/~([*?~])|([*?])|([.+^${}()|[\]\\\/])/g, function (m, esc, w, sp) { return esc ? "\\" + esc : w ? (w === "*" ? "[\\s\\S]*" : "[\\s\\S]") : "\\" + sp; }) + "$", "i"); }
		function criterion(c) {
			if (c instanceof Range || c instanceof Arr) c = scalar(c);
			if (isErr(c)) return function (v) { return isErr(v) && v.code === c.code; };
			if (typeof c === "number") return function (v) { if (typeof v === "number") return v === c; if (typeof v === "string") { var n = parseNumberText(v); return !!n && n.v === c; } return false; };
			if (typeof c === "boolean") return function (v) { return v === c; };
			if (c == null) return function (v) { return v === 0; };
			var s = String(c), m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s), op = m[1] || "=", rest = m[2];
			if (rest === "") { if (op === "=") return function (v) { return v == null || v === ""; }; if (op === "<>") return function (v) { return !(v == null || v === ""); }; }
			var n = parseNumberText(rest), d = n ? null : X.dateText(rest);
			var target = n ? n.v : d;
			var up = rest.toUpperCase();
			if (target != null) {
				return function (v) {
					var x = typeof v === "number" ? v : null;
					if (x == null && typeof v === "string" && (op === "=" || op === "<>")) { var pv = parseNumberText(v); x = pv ? pv.v : null; }
					if (op === "<>") return x == null || x !== target;
					if (x == null) return false;
					return op === "=" ? x === target : op === "<" ? x < target : op === ">" ? x > target : op === "<=" ? x <= target : x >= target;
				};
			}
			if (up === "TRUE" || up === "FALSE") { var bv = up === "TRUE"; return function (v) { return op === "<>" ? v !== bv : op === "=" ? v === bv : false; }; }
			if (/^#/.test(up)) return function (v) { var same = isErr(v) && v.code === up; return op === "<>" ? !same : same; };
			if (op === "=" || op === "<>") {
				var re = /[*?~]/.test(rest) ? wild(rest) : null, low = rest.toLowerCase();
				return function (v) { var same = typeof v === "string" && (re ? re.test(v) : v.toLowerCase() === low); return op === "<>" ? !same : same; };
			}
			return function (v) { if (typeof v !== "string") return false; var k = compare(v, rest); return op === "<" ? k < 0 : op === ">" ? k > 0 : op === "<=" ? k <= 0 : k >= 0; };
		}
		// [range, criteria] pairs -> array of booleans over the shape of the first range (other ranges are read at the same offsets)
		function matches(pairs, ctx) {
			var first = pairs[0][0];
			if (!(first instanceof Range || first instanceof Arr)) first = new Arr([[first]]);
			var D = first instanceof Range ? first.box() : { r1: 0, r2: first.h - 1, c1: 0, c2: first.w - 1 }, h = D.r2 - D.r1 + 1, w = D.c2 - D.c1 + 1;
			var tests = pairs.map(function (p) { return criterion(p[1]); }), ok = [];
			var readers = pairs.map(function (p) {
				var rg = p[0];
				if (rg instanceof Range) { var r0 = rg.g.s.r, c0 = rg.g.s.c; return function (i, j) { return rg.ctx.get(rg.sheet, r0 + i, c0 + j); }; }
				if (rg instanceof Arr) return function (i, j) { return i < rg.h && j < rg.w ? rg.rows[i][j] : null; };
				return function () { return rg; };
			});
			for (var i = 0; i < h; i++) { var row = []; for (var j = 0; j < w; j++) { var all = true; for (var t = 0; t < tests.length && all; t++) if (!tests[t](readers[t](i, j))) all = false; row.push(all); } ok.push(row); }
			return { ok: ok, h: h, w: w };
		}
		function pairsOf(args, from) { var p = []; for (var i = from; i + 1 < args.length; i += 2) p.push([args[i], args[i + 1]]); return p; }
		function valuesAt(rg, ok) {   // the cells of rg (from its top-left) where ok is true
			var out = [];
			for (var i = 0; i < ok.h; i++) for (var j = 0; j < ok.w; j++) if (ok.ok[i][j]) {
				var v = rg instanceof Range ? rg.ctx.get(rg.sheet, rg.g.s.r + i, rg.g.s.c + j) : rg instanceof Arr ? (i < rg.h && j < rg.w ? rg.rows[i][j] : null) : rg;
				out.push(v);
			}
			return out;
		}
		function numsOnly(vals) { var out = []; for (var i = 0; i < vals.length; i++) { if (isErr(vals[i])) return vals[i]; if (typeof vals[i] === "number") out.push(vals[i]); } return out; }
		X.criterion = criterion;

		/* ---------- dates ---------- */
		var EPOCH = Date.UTC(1899, 11, 30);
		function toDate(s) { s = Math.floor(s); if (s < 61) s += 1; return new Date(EPOCH + s * 864e5); }       // 1900 leap-year bug: serial 60 = 29 Feb 1900
		function fromYMD(y, m, d) { var t = Date.UTC(y, m - 1, d), s = Math.round((t - EPOCH) / 864e5); return s < 61 ? s - 1 : s; }
		function serialArg(x) { var v = num(x); if (isErr(v)) return v; if (v < 0) return NUM; return v; }
		function ymd(s) { if (s === 60) return { y: 1900, m: 2, d: 29 }; var dt = toDate(s); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() }; }
		function wdOf(s) { return toDate(s).getUTCDay(); }
		function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
		function holidaySet(h) { var set = {}; if (h === undefined) return set; flat([h]).forEach(function (v) { if (typeof v === "number") set[Math.floor(v)] = 1; }); return set; }
		function weekendMask(w) {   // NETWORKDAYS.INTL / WORKDAY.INTL weekend: 1 = Sat+Sun ... or "0000011"
			if (w === undefined || w == null) w = 1;
			if (typeof w === "string") { if (!/^[01]{7}$/.test(w) || w === "1111111") return null; return [w[6], w[0], w[1], w[2], w[3], w[4], w[5]].map(function (c) { return c === "1"; }); }
			var m = { 1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6], 11: [0], 12: [1], 13: [2], 14: [3], 15: [4], 16: [5], 17: [6] }[w];
			if (!m) return null;
			var out = [false, false, false, false, false, false, false]; m.forEach(function (d) { out[d] = true; }); return out;
		}
		function networkdays(a, b, hol, wk) {
			a = Math.floor(a); b = Math.floor(b);
			var sign = 1; if (b < a) { var t = a; a = b; b = t; sign = -1; }
			var n = 0; for (var s = a; s <= b; s++) if (!wk[wdOf(s)] && !hol[s]) n++;
			return sign * n;
		}
		function workday(a, days, hol, wk) {
			var s = Math.floor(a), step = days < 0 ? -1 : 1, left = Math.abs(Math.trunc(days)), guard = 0;
			while (left > 0 && guard++ < 1e6) { s += step; if (!wk[wdOf(s)] && !hol[s]) left--; }
			return s;
		}
		function addMonths(s, m) { var d = ymd(Math.floor(s)), y = d.y, mo = d.m + m; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return fromYMD(y, mo, Math.min(d.d, lastDay(y, mo))); }
		function days360(a, b, eu) {
			var A = ymd(a), B = ymd(b), d1 = A.d, d2 = B.d;
			if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
			else { var lastFebA = A.m === 2 && A.d === lastDay(A.y, 2); if (lastFebA) d1 = 30; if (d1 === 31) d1 = 30; if (d2 === 31 && d1 === 30) d2 = 30; if (lastFebA && B.m === 2 && B.d === lastDay(B.y, 2)) d2 = 30; }
			return (B.y - A.y) * 360 + (B.m - A.m) * 30 + d2 - d1;
		}
		function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
		X.ymd = ymd; X.fromYMD = fromYMD;

		/* ---------- number formatting for TEXT() (SheetJS's SSF when the page has loaded it) ---------- */
		function textFormat(v, fmt) {
			if (X.ssf && typeof v === "number") { try { return X.ssf.format(fmt, v); } catch (e) { /* fall back */ } }
			if (typeof v !== "number") return txt(v);
			var f = String(fmt);
			if (/^general$/i.test(f)) return fmtGeneral(v);
			if (/[ymdhs]/i.test(f.replace(/"[^"]*"/g, "")) && !/[0#]/.test(f.replace(/"[^"]*"/g, ""))) return dateFormat(v, f);
			var secs = f.split(";"), sec = v < 0 && secs[1] != null ? secs[1] : v === 0 && secs[2] != null ? secs[2] : secs[0], neg = v < 0 && secs[1] == null;
			var a = Math.abs(v), pct = /%/.test(sec.replace(/"[^"]*"/g, ""));
			if (pct) a *= 100;
			var core = /[0#?,.]+/.exec(sec.replace(/"[^"]*"/g, "")); if (!core) return sec.replace(/"/g, "");
			var p = core[0], dp = p.indexOf("."), decs = dp >= 0 ? p.slice(dp + 1).replace(/[^0#]/g, "").length : 0, comma = p.indexOf(",") >= 0 && /,[0#]/.test(p);
			var minDec = dp >= 0 ? (p.slice(dp + 1).match(/0/g) || []).length : 0;
			var s = roundHalfAway(a, decs).toFixed(decs);
			if (decs > minDec) { s = s.replace(/0+$/, function (z) { return z.slice(0, Math.max(0, z.length - (decs - minDec))); }); s = s.replace(/\.$/, minDec ? "." : ""); }
			var ip = s.split(".")[0], dpart = s.split(".")[1];
			var minInt = ((dp >= 0 ? p.slice(0, dp) : p).match(/0/g) || []).length;
			while (ip.length < minInt) ip = "0" + ip;
			if (ip === "0" && minInt === 0) ip = "";
			if (comma) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			var body = ip + (dpart != null && dpart !== "" ? "." + dpart : "");
			var out = sec.replace(/"([^"]*)"/g, "\u0001$1\u0002"), idx = out.search(/[0#?,.]+/);
			out = out.slice(0, idx) + body + out.slice(idx).replace(/^[0#?,.]+/, "");
			out = out.replace(/\u0001([^\u0002]*)\u0002/g, "$1").replace(/\\(.)/g, "$1").replace(/_./g, " ").replace(/\[[^\]]*\]/g, "");
			return (neg ? "-" : "") + out;
		}
		var DAYN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MONN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		function dateFormat(v, f) {
			var d = ymd(Math.floor(v)), secs = Math.round((v - Math.floor(v)) * 86400), H = Math.floor(secs / 3600), Mi = Math.floor(secs % 3600 / 60), Se = secs % 60, ampm = /AM\/PM|A\/P/i.test(f);
			var hh = ampm ? (H % 12 || 12) : H, pad = function (n) { return (n < 10 ? "0" : "") + n; };
			var toks = f.match(/"[^"]*"|\\.|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|am\/pm|A\/P|a\/p|[^"\\ymdhsAa]+|./gi) || [], out = "", lastH = false;
			toks.forEach(function (t, i) {
				var low = t.toLowerCase();
				if (t[0] === '"') out += t.slice(1, -1); else if (t[0] === "\\") out += t[1];
				else if (low === "yyyy") out += d.y; else if (low === "yy") out += pad(d.y % 100);
				else if (low === "mmmmm") out += MONN[d.m - 1][0]; else if (low === "mmmm") out += MONN[d.m - 1]; else if (low === "mmm") out += MONN[d.m - 1].slice(0, 3);
				else if (low === "mm" || low === "m") { var next = toks.slice(i + 1).join("").toLowerCase(); var isMin = lastH || /^[^a-z]*s/.test(next); out += isMin ? (low === "mm" ? pad(Mi) : Mi) : (low === "mm" ? pad(d.m) : d.m); }
				else if (low === "dddd") out += DAYN[wdOf(Math.floor(v))]; else if (low === "ddd") out += DAYN[wdOf(Math.floor(v))].slice(0, 3);
				else if (low === "dd") out += pad(d.d); else if (low === "d") out += d.d;
				else if (low === "hh") out += pad(hh); else if (low === "h") out += hh;
				else if (low === "ss") out += pad(Se); else if (low === "s") out += Se;
				else if (low === "am/pm") out += H < 12 ? "AM" : "PM"; else if (low === "a/p") out += H < 12 ? "A" : "P";
				else out += t;
				if (/^[a-z]/i.test(t)) lastH = low === "hh" || low === "h";
			});
			return out;
		}
		X.textFormat = textFormat;

		/* ---------- math and statistics ---------- */
		var M = {
			SUM: function (a) { var n = nums(a); return isErr(n) ? n : sum(n); },
			SUMSQ: function (a) { var n = nums(a); if (isErr(n)) return n; var s = 0; n.forEach(function (x) { s += x * x; }); return s; },
			AVERAGE: function (a) { var n = nums(a); if (isErr(n)) return n; return n.length ? mean(n) : DIV; },
			AVERAGEA: function (a) { var v = flat(a, function (x) { return x != null; }), n = []; for (var i = 0; i < v.length; i++) { if (isErr(v[i])) return v[i]; n.push(typeof v[i] === "number" ? v[i] : v[i] === true ? 1 : 0); } return n.length ? mean(n) : DIV; },
			MIN: function (a) { var n = nums(a); if (isErr(n)) return n; return n.length ? Math.min.apply(null, n) : 0; },
			MAX: function (a) { var n = nums(a); if (isErr(n)) return n; return n.length ? Math.max.apply(null, n) : 0; },
			MINA: function (a) { var v = flat(a, function (x) { return x != null; }).map(function (x) { return typeof x === "number" ? x : x === true ? 1 : 0; }); return v.length ? Math.min.apply(null, v) : 0; },
			MAXA: function (a) { var v = flat(a, function (x) { return x != null; }).map(function (x) { return typeof x === "number" ? x : x === true ? 1 : 0; }); return v.length ? Math.max.apply(null, v) : 0; },
			PRODUCT: function (a) { var n = nums(a); if (isErr(n)) return n; if (!n.length) return 0; var s = 1; n.forEach(function (x) { s *= x; }); return ret(s); },
			COUNT: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (typeof v === "number") k++; }); else if (typeof x === "number" || typeof x === "boolean" || (typeof x === "string" && parseNumberText(x))) k++; }); return k; },
			COUNTA: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (v != null) k++; }); else if (x !== undefined) k++; }); return k; },
			COUNTBLANK: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range) { var g = x.g, B = x.box(); var total = (B.r2 - B.r1 + 1) * (B.c2 - B.c1 + 1); var filled = 0; x.each(function (v) { if (v != null && v !== "") filled++; }); k += total - filled; } else if (x instanceof Arr) x.each(function (v) { if (v == null || v === "") k++; }); }); return k; },
			MEDIAN: function (a) { var n = nums(a); if (isErr(n)) return n; if (!n.length) return NUM; var s = sortNum(n), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; },
			MODE: function (a) { var n = nums(a); if (isErr(n)) return n; var cnt = {}, best = null, bc = 1; n.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; if (cnt[x] > bc) { bc = cnt[x]; best = x; } }); return best == null ? NA : best; },
			"STDEV.S": function (a) { var n = nums(a); if (isErr(n)) return n; var v = variance(n, true); return isErr(v) ? v : Math.sqrt(v); },
			"STDEV.P": function (a) { var n = nums(a); if (isErr(n)) return n; var v = variance(n, false); return isErr(v) ? v : Math.sqrt(v); },
			"VAR.S": function (a) { var n = nums(a); return isErr(n) ? n : variance(n, true); },
			"VAR.P": function (a) { var n = nums(a); return isErr(n) ? n : variance(n, false); },
			LARGE: function (a) { var n = nums([a[0]]), k = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(k)) return k; k = Math.ceil(k); if (k < 1 || k > n.length) return NUM; return sortNum(n)[n.length - k]; },
			SMALL: function (a) { var n = nums([a[0]]), k = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(k)) return k; k = Math.ceil(k); if (k < 1 || k > n.length) return NUM; return sortNum(n)[k - 1]; },
			"RANK.EQ": lift(function (x, ref, ord) { x = num(x); if (isErr(x)) return x; var n = nums([ref]); if (isErr(n)) return n; if (n.indexOf(x) < 0) return NA; var o = ord === undefined ? 0 : num(ord); var k = 1; n.forEach(function (y) { if (o ? y < x : y > x) k++; }); return k; }, 1),
			"RANK.AVG": lift(function (x, ref, ord) { x = num(x); if (isErr(x)) return x; var n = nums([ref]); if (isErr(n)) return n; var o = ord === undefined ? 0 : num(ord), k = 1, same = 0; n.forEach(function (y) { if (o ? y < x : y > x) k++; if (y === x) same++; }); return same ? k + (same - 1) / 2 : NA; }, 1),
			"PERCENTILE.INC": function (a) { var n = nums([a[0]]), p = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(p)) return p; return percentile(n, p, false); },
			"PERCENTILE.EXC": function (a) { var n = nums([a[0]]), p = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(p)) return p; return percentile(n, p, true); },
			"QUARTILE.INC": function (a) { var n = nums([a[0]]), q = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(q)) return q; q = Math.floor(q); if (q < 0 || q > 4) return NUM; return percentile(n, q / 4, false); },
			"QUARTILE.EXC": function (a) { var n = nums([a[0]]), q = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(q)) return q; q = Math.floor(q); if (q < 1 || q > 3) return NUM; return percentile(n, q / 4, true); },
			CORREL: function (a) { var x = arrOf(a[0]), y = arrOf(a[1]), xs = [], ys = []; x.each(function (v, i, j) { var w = y.at(i, j); if (typeof v === "number" && typeof w === "number") { xs.push(v); ys.push(w); } }); if (xs.length < 2) return DIV; var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0, syy = 0; xs.forEach(function (v, i) { sxy += (v - mx) * (ys[i] - my); sxx += (v - mx) * (v - mx); syy += (ys[i] - my) * (ys[i] - my); }); return sxx && syy ? sxy / Math.sqrt(sxx * syy) : DIV; },
			SUMPRODUCT: function (a) {
				if (!a.length) return VAL;
				var arrs = a.map(arrOf), h = arrs[0].h, w = arrs[0].w;
				if (arrs.some(function (x) { return x.h !== h || x.w !== w; })) return VAL;
				var s = 0;
				for (var i = 0; i < h; i++) for (var j = 0; j < w; j++) {
					var p = 1;
					for (var k = 0; k < arrs.length; k++) { var v = arrs[k].rows[i][j]; if (isErr(v)) return v; p *= typeof v === "number" ? v : 0; }
					s += p;
				}
				return s;
			},
			SUBTOTAL: function (a, ctx) {
				var f = num(scalar(a[0])); if (isErr(f)) return f;
				var fn = { 1: "AVERAGE", 2: "COUNT", 3: "COUNTA", 4: "MAX", 5: "MIN", 6: "PRODUCT", 7: "STDEV.S", 8: "STDEV.P", 9: "SUM", 10: "VAR.S", 11: "VAR.P" }[f % 100];
				if (!fn) return VAL;
				var rest = a.slice(1).map(function (x) {
					if (!(x instanceof Range) || !ctx.cellAt) return x;
					var B = x.box(), rows = [];
					for (var r = B.r1; r <= B.r2; r++) { var row = []; for (var c = B.c1; c <= B.c2; c++) { var cl = ctx.cellAt(x.sheet, r, c); row.push(cl && cl.f && /SUBTOTAL\s*\(|AGGREGATE\s*\(/i.test(cl.f) ? null : x.ctx.get(x.sheet, r, c)); } rows.push(row); }
					return new Arr(rows);
				});
				return FN[fn](rest, ctx);
			},
			ROUND: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); return firstErr(x, d) || roundHalfAway(x, d); }),
			ROUNDUP: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); if (firstErr(x, d)) return firstErr(x, d); var f = Math.pow(10, Math.trunc(d)), y = Math.abs(x) * f; y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : Math.ceil(y); return (x < 0 ? -1 : 1) * y / f; }),
			ROUNDDOWN: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); if (firstErr(x, d)) return firstErr(x, d); var f = Math.pow(10, Math.trunc(d)), y = Math.abs(x) * f; y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : Math.floor(y); return (x < 0 ? -1 : 1) * y / f; }),
			TRUNC: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); if (firstErr(x, d)) return firstErr(x, d); var f = Math.pow(10, Math.trunc(d)); return int(roundHalfAway(x * f, 9)) / f; }),
			MROUND: lift(function (x, m) { x = num(x); m = num(m); if (firstErr(x, m)) return firstErr(x, m); if (m === 0) return 0; if (x * m < 0) return NUM; return roundHalfAway(x / m, 0) * m; }),
			CEILING: lift(function (x, s) { x = num(x); s = s === undefined ? 1 : num(s); if (firstErr(x, s)) return firstErr(x, s); if (s === 0) return 0; if (x > 0 && s < 0) return NUM; return Math.ceil(roundHalfAway(x / s, 9)) * s; }),
			"CEILING.MATH": lift(function (x, s, mode) { x = num(x); s = s === undefined ? 1 : Math.abs(num(s)); mode = mode === undefined ? 0 : num(mode); if (firstErr(x, s, mode)) return firstErr(x, s, mode); if (s === 0) return 0; var q = roundHalfAway(x / s, 9); return (x < 0 && mode ? Math.floor(q) : Math.ceil(q)) * s; }),
			FLOOR: lift(function (x, s) { x = num(x); s = s === undefined ? 1 : num(s); if (firstErr(x, s)) return firstErr(x, s); if (s === 0) return DIV; if (x > 0 && s < 0) return NUM; return Math.floor(roundHalfAway(x / s, 9)) * s; }),
			"FLOOR.MATH": lift(function (x, s, mode) { x = num(x); s = s === undefined ? 1 : Math.abs(num(s)); mode = mode === undefined ? 0 : num(mode); if (firstErr(x, s, mode)) return firstErr(x, s, mode); if (s === 0) return 0; var q = roundHalfAway(x / s, 9); return (x < 0 && mode ? Math.ceil(q) : Math.floor(q)) * s; }),
			INT: lift(function (x) { x = num(x); return isErr(x) ? x : Math.floor(x); }),
			MOD: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (y === 0) return DIV; var r = x - y * Math.floor(x / y); return Math.abs(r) < 1e-12 ? 0 : roundHalfAway(r, 12); }),
			QUOTIENT: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (y === 0) return DIV; return int(x / y); }),
			POWER: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (x === 0 && y === 0) return NUM; var r = Math.pow(x, y); return isFinite(r) ? r : (x === 0 ? DIV : NUM); }),
			ABS: lift(function (x) { x = num(x); return isErr(x) ? x : Math.abs(x); }),
			SIGN: lift(function (x) { x = num(x); return isErr(x) ? x : x > 0 ? 1 : x < 0 ? -1 : 0; }),
			SQRT: lift(function (x) { x = num(x); if (isErr(x)) return x; return x < 0 ? NUM : Math.sqrt(x); }),
			SQRTPI: lift(function (x) { x = num(x); if (isErr(x)) return x; return x < 0 ? NUM : Math.sqrt(x * Math.PI); }),
			EXP: lift(function (x) { x = num(x); return isErr(x) ? x : ret(Math.exp(x)); }),
			LN: lift(function (x) { x = num(x); if (isErr(x)) return x; return x <= 0 ? NUM : Math.log(x); }),
			LOG: lift(function (x, b) { x = num(x); b = b === undefined ? 10 : num(b); if (firstErr(x, b)) return firstErr(x, b); if (x <= 0 || b <= 0) return NUM; if (b === 1) return DIV; return Math.log(x) / Math.log(b); }),
			LOG10: lift(function (x) { x = num(x); if (isErr(x)) return x; return x <= 0 ? NUM : Math.log10(x); }),
			PI: function () { return Math.PI; },
			SIN: lift(function (x) { x = num(x); return isErr(x) ? x : Math.sin(x); }), COS: lift(function (x) { x = num(x); return isErr(x) ? x : Math.cos(x); }),
			TAN: lift(function (x) { x = num(x); return isErr(x) ? x : Math.tan(x); }),
			ASIN: lift(function (x) { x = num(x); if (isErr(x)) return x; return Math.abs(x) > 1 ? NUM : Math.asin(x); }), ACOS: lift(function (x) { x = num(x); if (isErr(x)) return x; return Math.abs(x) > 1 ? NUM : Math.acos(x); }),
			ATAN: lift(function (x) { x = num(x); return isErr(x) ? x : Math.atan(x); }),
			ATAN2: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (x === 0 && y === 0) return DIV; return Math.atan2(y, x); }),
			SINH: lift(function (x) { x = num(x); return isErr(x) ? x : Math.sinh(x); }), COSH: lift(function (x) { x = num(x); return isErr(x) ? x : Math.cosh(x); }), TANH: lift(function (x) { x = num(x); return isErr(x) ? x : Math.tanh(x); }),
			DEGREES: lift(function (x) { x = num(x); return isErr(x) ? x : x * 180 / Math.PI; }), RADIANS: lift(function (x) { x = num(x); return isErr(x) ? x : x * Math.PI / 180; }),
			FACT: lift(function (x) { x = num(x); if (isErr(x)) return x; x = Math.floor(x); if (x < 0) return NUM; var r = 1; for (var i = 2; i <= x; i++) r *= i; return ret(r); }),
			FACTDOUBLE: lift(function (x) { x = num(x); if (isErr(x)) return x; x = Math.floor(x); if (x < -1) return NUM; var r = 1; for (var i = x; i > 1; i -= 2) r *= i; return ret(r); }),
			COMBIN: lift(function (n, k) { n = num(n); k = num(k); if (firstErr(n, k)) return firstErr(n, k); n = Math.floor(n); k = Math.floor(k); if (n < 0 || k < 0 || k > n) return NUM; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }),
			PERMUT: lift(function (n, k) { n = num(n); k = num(k); if (firstErr(n, k)) return firstErr(n, k); n = Math.floor(n); k = Math.floor(k); if (n < 0 || k < 0 || k > n) return NUM; var r = 1; for (var i = 0; i < k; i++) r *= n - i; return r; }),
			GCD: function (a) { var n = nums(a); if (isErr(n)) return n; if (n.some(function (x) { return x < 0; })) return NUM; var g = function (x, y) { x = Math.floor(x); y = Math.floor(y); while (y) { var t = y; y = x % y; x = t; } return x; }; return n.reduce(g, 0); },
			LCM: function (a) { var n = nums(a); if (isErr(n)) return n; if (n.some(function (x) { return x < 0; })) return NUM; var g = function (x, y) { while (y) { var t = y; y = x % y; x = t; } return x; }; return n.reduce(function (acc, x) { x = Math.floor(x); return acc === 0 || x === 0 ? 0 : acc * x / g(acc, x); }, 1); },
			EVEN: lift(function (x) { x = num(x); if (isErr(x)) return x; var s = x < 0 ? -1 : 1, a = Math.ceil(Math.abs(x)); return s * (a % 2 ? a + 1 : a); }),
			ODD: lift(function (x) { x = num(x); if (isErr(x)) return x; var s = x < 0 ? -1 : 1, a = Math.ceil(Math.abs(x)); return s * (a % 2 ? a : a + 1); }),
			RAND: function () { return Math.random(); },
			RANDBETWEEN: function (a) { var lo = num(scalar(a[0])), hi = num(scalar(a[1])); if (firstErr(lo, hi)) return firstErr(lo, hi); lo = Math.ceil(lo); hi = Math.floor(hi); if (hi < lo) return NUM; return lo + Math.floor(Math.random() * (hi - lo + 1)); }
		};
		M.MEDIAN = M.MEDIAN; M["MODE.SNGL"] = M.MODE; M.STDEV = M["STDEV.S"]; M.STDEVP = M["STDEV.P"]; M.VAR = M["VAR.S"]; M.VARP = M["VAR.P"]; M.RANK = M["RANK.EQ"];
		M.PERCENTILE = M["PERCENTILE.INC"]; M.QUARTILE = M["QUARTILE.INC"]; M.PEARSON = M.CORREL; M["CEILING.PRECISE"] = M["CEILING.MATH"]; M["FLOOR.PRECISE"] = M["FLOOR.MATH"]; M["ISO.CEILING"] = M["CEILING.MATH"];

		/* ---------- conditional sums and counts ---------- */
		M.COUNTIF = function (a) { var m = matches([[a[0], a[1]]]), k = 0; m.ok.forEach(function (r) { r.forEach(function (x) { if (x) k++; }); }); return k; };
		M.COUNTIFS = function (a) { if (a.length < 2 || a.length % 2) return VAL; var m = matches(pairsOf(a, 0)), k = 0; m.ok.forEach(function (r) { r.forEach(function (x) { if (x) k++; }); }); return k; };
		M.SUMIF = function (a) { var m = matches([[a[0], a[1]]]), v = numsOnly(valuesAt(a.length > 2 && a[2] !== undefined ? a[2] : a[0], m)); return isErr(v) ? v : sum(v); };
		M.SUMIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : sum(v); };
		M.AVERAGEIF = function (a) { var m = matches([[a[0], a[1]]]), v = numsOnly(valuesAt(a.length > 2 && a[2] !== undefined ? a[2] : a[0], m)); return isErr(v) ? v : v.length ? mean(v) : DIV; };
		M.AVERAGEIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : v.length ? mean(v) : DIV; };
		M.MAXIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : v.length ? Math.max.apply(null, v) : 0; };
		M.MINIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : v.length ? Math.min.apply(null, v) : 0; };

		/* ---------- logic and information ---------- */
		function logic(a, op) {
			var any = false, res = op === "and", cnt = 0, e = null;
			a.forEach(function (x) {
				if (e) return;
				if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (isErr(v)) { e = v; return false; } if (typeof v === "number" || typeof v === "boolean") { any = true; if (op === "and" && !v) res = false; if (op === "or" && v) res = true; if (v) cnt++; } });
				else if (x !== undefined) { var b = bool(x); if (isErr(b)) e = b; else { any = true; if (op === "and" && !b) res = false; if (op === "or" && b) res = true; if (b) cnt++; } }
			});
			if (e) return e; if (!any) return VAL;
			return op === "xor" ? cnt % 2 === 1 : res;
		}
		M.AND = function (a) { return logic(a, "and"); }; M.OR = function (a) { return logic(a, "or"); }; M.XOR = function (a) { return logic(a, "xor"); };
		M.NOT = lift(function (x) { var b = bool(x); return isErr(b) ? b : !b; });
		M.TRUE = function () { return true; }; M.FALSE = function () { return false; };
		M.NA = function () { return NA; };
		M.ISBLANK = lift(function (x) { return x == null; });
		M.ISNUMBER = lift(function (x) { return typeof x === "number"; });
		M.ISTEXT = lift(function (x) { return typeof x === "string"; });
		M.ISNONTEXT = lift(function (x) { return typeof x !== "string"; });
		M.ISLOGICAL = lift(function (x) { return typeof x === "boolean"; });
		M.ISERROR = lift(function (x) { return isErr(x); });
		M.ISERR = lift(function (x) { return isErr(x) && x.code !== "#N/A"; });
		M.ISNA = lift(function (x) { return isErr(x) && x.code === "#N/A"; });
		M.ISEVEN = lift(function (x) { x = num(x); return isErr(x) ? x : Math.floor(Math.abs(x)) % 2 === 0; });
		M.ISODD = lift(function (x) { x = num(x); return isErr(x) ? x : Math.floor(Math.abs(x)) % 2 === 1; });
		M.ISREF = function (a) { return a[0] instanceof Range; };
		M.ISFORMULA = function (a, ctx) { var r = a[0]; if (!(r instanceof Range)) return VAL; var cl = ctx.cellAt ? ctx.cellAt(r.sheet, r.g.s.r, r.g.s.c) : null; return !!(cl && cl.f); };
		M.N = function (a) { var x = scalar(a[0]); return typeof x === "number" ? x : x === true ? 1 : isErr(x) ? x : 0; };
		M.T = function (a) { var x = scalar(a[0]); return typeof x === "string" ? x : isErr(x) ? x : ""; };
		M.TYPE = function (a) { var x = a[0]; if (x instanceof Arr || isMulti(x)) return 64; x = scalar(x); return typeof x === "number" || x == null ? 1 : typeof x === "string" ? 2 : typeof x === "boolean" ? 4 : isErr(x) ? 16 : 1; };
		M["ERROR.TYPE"] = function (a) { var x = scalar(a[0]); if (!isErr(x)) return NA; return { "#NULL!": 1, "#DIV/0!": 2, "#VALUE!": 3, "#REF!": 4, "#NAME?": 5, "#NUM!": 6, "#N/A": 7, "#SPILL!": 9, "#CALC!": 14 }[x.code] || NA; };

		/* ---------- text ---------- */
		function T1(fn) { return lift(function () { for (var i = 0; i < arguments.length; i++) if (isErr(arguments[i])) return arguments[i]; return fn.apply(null, arguments); }); }
		M.LEN = T1(function (s) { return txt(s).length; });
		M.UPPER = T1(function (s) { return txt(s).toUpperCase(); });
		M.LOWER = T1(function (s) { return txt(s).toLowerCase(); });
		M.PROPER = T1(function (s) { return txt(s).toLowerCase().replace(/(^|[^A-Za-zÀ-ÿ'])([a-zà-ÿ])/g, function (m, p, c) { return p + c.toUpperCase(); }).replace(/([A-Za-zÀ-ÿ])'([a-z])/g, function (m, a, b) { return a + "'" + b.toUpperCase(); }); });
		M.TRIM = T1(function (s) { return txt(s).replace(/ +/g, " ").trim(); });
		M.CLEAN = T1(function (s) { return txt(s).replace(/[\x00-\x1f]/g, ""); });
		M.LEFT = T1(function (s, n) { n = n === undefined ? 1 : num(n); if (isErr(n)) return n; if (n < 0) return VAL; return txt(s).slice(0, Math.floor(n)); });
		M.RIGHT = T1(function (s, n) { n = n === undefined ? 1 : num(n); if (isErr(n)) return n; if (n < 0) return VAL; var t = txt(s); n = Math.floor(n); return n ? t.slice(-n) : ""; });
		M.MID = T1(function (s, st, n) { st = num(st); n = num(n); if (firstErr(st, n)) return firstErr(st, n); if (st < 1 || n < 0) return VAL; return txt(s).substr(Math.floor(st) - 1, Math.floor(n)); });
		M.REPT = T1(function (s, n) { n = num(n); if (isErr(n)) return n; if (n < 0) return VAL; var t = txt(s); if (t.length * n > 32767) return VAL; return new Array(Math.floor(n) + 1).join(t); });
		M.EXACT = T1(function (a, b) { return txt(a) === txt(b); });
		M.FIND = T1(function (f, s, st) { st = st === undefined ? 1 : num(st); if (isErr(st)) return st; var t = txt(s); if (st < 1 || st > t.length + 1) return VAL; var i = t.indexOf(txt(f), Math.floor(st) - 1); return i < 0 ? VAL : i + 1; });
		M.SEARCH = T1(function (f, s, st) {
			st = st === undefined ? 1 : num(st); if (isErr(st)) return st;
			var t = txt(s), q = txt(f); if (st < 1 || st > t.length + 1) return VAL;
			if (/[*?]/.test(q)) { var re = new RegExp(wild(q).source.slice(1, -1), "i"), sub = t.slice(Math.floor(st) - 1), m = re.exec(sub); return m ? m.index + Math.floor(st) : VAL; }
			var i = t.toLowerCase().indexOf(q.toLowerCase(), Math.floor(st) - 1); return i < 0 ? VAL : i + 1;
		});
		M.SUBSTITUTE = T1(function (s, o, n, inst) {
			var t = txt(s), a = txt(o), b = txt(n); if (a === "") return t;
			if (inst === undefined) return t.split(a).join(b);
			inst = num(inst); if (isErr(inst)) return inst; if (inst < 1) return VAL;
			var i = -1; for (var k = 0; k < Math.floor(inst); k++) { i = t.indexOf(a, i + 1); if (i < 0) return t; }
			return t.slice(0, i) + b + t.slice(i + a.length);
		});
		M.REPLACE = T1(function (s, st, n, nw) { st = num(st); n = num(n); if (firstErr(st, n)) return firstErr(st, n); if (st < 1 || n < 0) return VAL; var t = txt(s); return t.slice(0, Math.floor(st) - 1) + txt(nw) + t.slice(Math.floor(st) - 1 + Math.floor(n)); });
		M.CHAR = T1(function (n) { n = num(n); if (isErr(n)) return n; n = Math.floor(n); if (n < 1 || n > 255) return VAL; return n < 128 ? String.fromCharCode(n) : new TextDecoder("windows-1252").decode(new Uint8Array([n])); });
		M.UNICHAR = T1(function (n) { n = num(n); if (isErr(n)) return n; n = Math.floor(n); if (n < 1 || n > 0x10FFFF) return VAL; return String.fromCodePoint(n); });
		M.CODE = T1(function (s) { var t = txt(s); return t ? t.charCodeAt(0) : VAL; });
		M.UNICODE = T1(function (s) { var t = txt(s); return t ? t.codePointAt(0) : VAL; });
		M.VALUE = T1(function (s) { if (typeof s === "number") return s; if (typeof s === "boolean") return VAL; var t = txt(s).trim(); if (t === "") return 0; var n = parseNumberText(t); if (n) return n.v; var d = X.dateText(t); return d != null ? d : VAL; });
		M.NUMBERVALUE = T1(function (s, dec, grp) { var t = txt(s).replace(/\s/g, ""), d = dec === undefined ? "." : txt(dec), g = grp === undefined ? "," : txt(grp); if (g) t = t.split(g).join(""); if (d !== ".") t = t.split(d).join("."); var pct = 0; while (/%$/.test(t)) { pct++; t = t.slice(0, -1); } if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return VAL; return +t / Math.pow(100, pct); });
		M.TEXT = T1(function (v, f) { var x = v; if (typeof x === "string") { var n = parseNumberText(x); if (n) x = n.v; else { var d = X.dateText(x); if (d != null) x = d; } } if (typeof x === "boolean") return txt(x); return textFormat(x, txt(f)); });
		M.FIXED = T1(function (v, d, nc) { v = num(v); d = d === undefined ? 2 : num(d); if (firstErr(v, d)) return firstErr(v, d); var r = roundHalfAway(v, d), s = Math.abs(r).toFixed(Math.max(0, d)); if (!(nc !== undefined && bool(nc) === true)) s = s.replace(/^(\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }); return (r < 0 ? "-" : "") + s; });
		M.DOLLAR = T1(function (v, d) { v = num(v); d = d === undefined ? 2 : num(d); if (firstErr(v, d)) return firstErr(v, d); var r = roundHalfAway(v, d), s = Math.abs(r).toFixed(Math.max(0, d)).replace(/^(\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }); return r < 0 ? "($" + s + ")" : "$" + s; });
		M.CONCATENATE = function (a) { var s = ""; for (var i = 0; i < a.length; i++) { if (isMulti(a[i])) return lift(function () { return Array.prototype.map.call(arguments, txt).join(""); })(a); var t = txt(a[i]); if (isErr(t)) return t; s += t; } return s; };
		M.CONCAT = function (a) { var s = "", e = null; a.forEach(function (x) { if (e) return; if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (isErr(v)) { e = v; return false; } s += txt(v); }); else if (x !== undefined) { var t = txt(x); if (isErr(t)) e = t; else s += t; } }); return e || (s.length > 32767 ? VAL : s); };
		M.TEXTJOIN = function (a) {
			var d = arrOf(a[0]), ign = bool(scalar(a[1])); if (isErr(ign)) return ign;
			var parts = [], e = null;
			a.slice(2).forEach(function (x) { if (e) return; if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (isErr(v)) { e = v; return false; } var t = txt(v); if (!(ign && t === "")) parts.push(t); }); else if (x !== undefined) { if (isErr(x)) { e = x; return; } var t = txt(x); if (!(ign && t === "")) parts.push(t); } });
			if (e) return e;
			var ds = []; d.each(function (v) { ds.push(txt(v)); }); if (!ds.length) ds = [""];
			var out = ""; parts.forEach(function (p, i) { out += (i ? ds[(i - 1) % ds.length] : "") + p; });
			return out.length > 32767 ? VAL : out;
		};
		function beforeAfter(after) {
			return lift(function (s, dl, inst, mm, me, nf) {
				var t = txt(s), d = txt(dl), n = inst === undefined ? 1 : num(inst), ci = mm !== undefined && num(mm) === 1, end = me !== undefined && num(me) === 1;
				if (isErr(n)) return n; if (n === 0) return VAL;
				var hay = ci ? t.toLowerCase() : t, nd = ci ? d.toLowerCase() : d, pos = -1;
				if (n > 0) { var from = 0; for (var k = 0; k < n; k++) { pos = hay.indexOf(nd, from); if (pos < 0) break; from = pos + Math.max(1, nd.length); } if (pos < 0 && end && k === n - 1) pos = t.length; }
				else { var from2 = hay.length; for (var k2 = 0; k2 < -n; k2++) { pos = hay.lastIndexOf(nd, from2); if (pos < 0) break; from2 = pos - 1; } if (pos < 0 && end && k2 === -n - 1) pos = 0; }
				if (pos < 0) return nf === undefined ? NA : nf;
				return after ? t.slice(pos + d.length) : t.slice(0, pos);
			}, 1);
		}
		M.TEXTBEFORE = beforeAfter(false); M.TEXTAFTER = beforeAfter(true);
		M.TEXTSPLIT = function (a) {
			var t = txt(scalar(a[0])); if (isErr(t)) return t;
			var cd = a[1] === undefined ? [] : flat([a[1]]).map(txt), rd = a[2] === undefined ? [] : flat([a[2]]).map(txt), ign = a[3] !== undefined && bool(scalar(a[3])) === true, pad = a[5] === undefined ? NA : scalar(a[5]);
			var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
			var split = function (s, ds) { if (!ds.length) return [s]; var parts = s.split(new RegExp(ds.filter(Boolean).map(esc).join("|"))); return ign ? parts.filter(function (p) { return p !== ""; }) : parts; };
			var rows = split(t, rd).map(function (r) { return split(r, cd); }), w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
			return new Arr(rows.map(function (r) { while (r.length < w) r.push(pad); return r; }));
		};

		/* ---------- dates and times ---------- */
		M.DATE = lift(function (y, m, d) {
			y = num(y); m = num(m); d = num(d); if (firstErr(y, m, d)) return firstErr(y, m, d);
			y = Math.floor(y); m = Math.floor(m); d = Math.floor(d);
			if (y < 1900) y += 1900; if (y < 1900 || y > 9999) return NUM;
			var t = Date.UTC(y, m - 1, 1) + (d - 1) * 864e5, dt = new Date(t), s = fromYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
			return s < 0 ? NUM : s;
		});
		M.TIME = lift(function (h, mi, s) { h = num(h); mi = num(mi); s = num(s); if (firstErr(h, mi, s)) return firstErr(h, mi, s); var t = (Math.floor(h) * 3600 + Math.floor(mi) * 60 + Math.floor(s)) / 86400; return t < 0 ? NUM : t - Math.floor(t); });
		M.TODAY = function (a, ctx) { var d = new Date(ctx && ctx.now != null ? ctx.now : Date.now()); return fromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
		M.NOW = function (a, ctx) { var d = new Date(ctx && ctx.now != null ? ctx.now : Date.now()); return fromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; };
		M.YEAR = lift(function (s) { s = serialArg(s); return isErr(s) ? s : ymd(Math.floor(s)).y; });
		M.MONTH = lift(function (s) { s = serialArg(s); return isErr(s) ? s : ymd(Math.floor(s)).m; });
		M.DAY = lift(function (s) { s = serialArg(s); return isErr(s) ? s : ymd(Math.floor(s)).d; });
		M.HOUR = lift(function (s) { s = serialArg(s); return isErr(s) ? s : Math.floor(Math.round((s - Math.floor(s)) * 86400) / 3600) % 24; });
		M.MINUTE = lift(function (s) { s = serialArg(s); return isErr(s) ? s : Math.floor(Math.round((s - Math.floor(s)) * 86400) % 3600 / 60); });
		M.SECOND = lift(function (s) { s = serialArg(s); return isErr(s) ? s : Math.round((s - Math.floor(s)) * 86400) % 60; });
		M.WEEKDAY = lift(function (s, t) {
			s = serialArg(s); t = t === undefined ? 1 : num(t); if (firstErr(s, t)) return firstErr(s, t);
			var w = wdOf(Math.floor(s));
			if (t === 1 || t === 17) return w + 1; if (t === 2 || t === 11) return (w + 6) % 7 + 1; if (t === 3) return (w + 6) % 7;
			if (t >= 12 && t <= 16) return (w - (t - 10) + 7) % 7 + 1;
			return NUM;
		});
		M.WEEKNUM = lift(function (s, t) {
			s = serialArg(s); t = t === undefined ? 1 : num(t); if (firstErr(s, t)) return firstErr(s, t);
			if (t === 21) return M.ISOWEEKNUM([s]);
			var start = { 1: 0, 17: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6 }[t]; if (start == null) return NUM;
			var d = ymd(Math.floor(s)), jan1 = fromYMD(d.y, 1, 1), off = (wdOf(jan1) - start + 7) % 7;
			return Math.floor((Math.floor(s) - jan1 + off) / 7) + 1;
		});
		M.ISOWEEKNUM = lift(function (s) { s = serialArg(s); if (isErr(s)) return s; var dt = toDate(Math.floor(s)), day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); var fy = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); return 1 + Math.round(((dt - fy) / 864e5 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7); });
		M.EOMONTH = lift(function (s, m) { s = serialArg(s); m = num(m); if (firstErr(s, m)) return firstErr(s, m); var d = ymd(Math.floor(s)), mo = d.m + Math.trunc(m), y = d.y + Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return fromYMD(y, mo, lastDay(y, mo)); });
		M.EDATE = lift(function (s, m) { s = serialArg(s); m = num(m); if (firstErr(s, m)) return firstErr(s, m); return addMonths(s, Math.trunc(m)); });
		M.DAYS = lift(function (b, a) { b = num(b); a = num(a); if (firstErr(a, b)) return firstErr(a, b); return Math.floor(b) - Math.floor(a); });
		M.DAYS360 = lift(function (a, b, m) { a = num(a); b = num(b); if (firstErr(a, b)) return firstErr(a, b); return days360(Math.floor(a), Math.floor(b), m !== undefined && bool(m) === true); });
		M.DATEVALUE = T1(function (s) { var d = X.dateText(txt(s)); return d == null ? VAL : Math.floor(d); });
		M.TIMEVALUE = T1(function (s) { var t = txt(s).trim(), d = X.timeText(t); if (d == null) { var dd = X.dateText(t); if (dd == null) return VAL; d = dd - Math.floor(dd); } return d; });
		M.NETWORKDAYS = function (a) { var s = num(scalar(a[0])), e = num(scalar(a[1])); if (firstErr(s, e)) return firstErr(s, e); return networkdays(s, e, holidaySet(a[2]), weekendMask(1)); };
		M["NETWORKDAYS.INTL"] = function (a) { var s = num(scalar(a[0])), e = num(scalar(a[1])); if (firstErr(s, e)) return firstErr(s, e); var w = weekendMask(a[2] === undefined ? 1 : scalar(a[2])); if (!w) return NUM; return networkdays(s, e, holidaySet(a[3]), w); };
		M.WORKDAY = function (a) { var s = num(scalar(a[0])), d = num(scalar(a[1])); if (firstErr(s, d)) return firstErr(s, d); return workday(s, d, holidaySet(a[2]), weekendMask(1)); };
		M["WORKDAY.INTL"] = function (a) { var s = num(scalar(a[0])), d = num(scalar(a[1])); if (firstErr(s, d)) return firstErr(s, d); var w = weekendMask(a[2] === undefined ? 1 : scalar(a[2])); if (!w) return NUM; return workday(s, d, holidaySet(a[3]), w); };
		M.DATEDIF = lift(function (a, b, u) {
			a = num(a); b = num(b); if (firstErr(a, b)) return firstErr(a, b); a = Math.floor(a); b = Math.floor(b); if (b < a) return NUM;
			var A = ymd(a), B = ymd(b), unit = txt(u).toUpperCase();
			var months = (B.y - A.y) * 12 + B.m - A.m - (B.d < A.d ? 1 : 0);
			if (unit === "D") return b - a; if (unit === "M") return months; if (unit === "Y") return Math.floor(months / 12);
			if (unit === "YM") return months % 12;
			if (unit === "MD") { var pm = B.m - 1, py = B.y; if (pm < 1) { pm = 12; py--; } return B.d >= A.d ? B.d - A.d : (lastDay(py, pm) - A.d + B.d < 0 ? 0 : Math.max(0, lastDay(py, pm) - A.d) + B.d); }
			if (unit === "YD") { var y2 = B.m > A.m || (B.m === A.m && B.d >= A.d) ? B.y : B.y - 1; return b - fromYMD(y2, A.m, Math.min(A.d, lastDay(y2, A.m))); }
			return NUM;
		});
		M.YEARFRAC = lift(function (a, b, basis) {
			a = num(a); b = num(b); basis = basis === undefined ? 0 : Math.floor(num(basis)); if (firstErr(a, b, basis)) return firstErr(a, b, basis);
			a = Math.floor(a); b = Math.floor(b); if (a > b) { var t = a; a = b; b = t; }
			if (basis === 0) return days360(a, b, false) / 360;
			if (basis === 2) return (b - a) / 360; if (basis === 3) return (b - a) / 365; if (basis === 4) return days360(a, b, true) / 360;
			if (basis === 1) {
				var A = ymd(a), B = ymd(b);
				if (A.y === B.y) return (b - a) / (isLeap(A.y) ? 366 : 365);
				var oneYear = B.y === A.y + 1 && (B.m < A.m || (B.m === A.m && B.d <= A.d));
				if (oneYear) { var leap = (isLeap(A.y) && (A.m < 3)) || (isLeap(B.y) && (B.m > 2 || (B.m === 2 && B.d === 29))); return (b - a) / (leap ? 366 : 365); }
				var total = 0; for (var y = A.y; y <= B.y; y++) total += isLeap(y) ? 366 : 365;
				return (b - a) / (total / (B.y - A.y + 1));
			}
			return NUM;
		});

		/* ---------- financial ---------- */
		function pmt(r, n, pv, fv, t) { if (r === 0) return -(pv + fv) / n; var q = Math.pow(1 + r, n); return -(r * (fv + pv * q)) / ((1 + r * t) * (q - 1)); }
		function fvf(r, n, p, pv, t) { if (r === 0) return -(pv + p * n); var q = Math.pow(1 + r, n); return -(pv * q + p * (1 + r * t) * (q - 1) / r); }
		function pvf(r, n, p, fv, t) { if (r === 0) return -(fv + p * n); var q = Math.pow(1 + r, n); return -(fv + p * (1 + r * t) * (q - 1) / r) / q; }
		function ipmt(r, per, n, pv, fv, t) { var p = pmt(r, n, pv, fv, t), i; if (per === 1) i = t === 1 ? 0 : -pv; else i = t === 1 ? fvf(r, per - 2, p, pv, 1) - p : fvf(r, per - 1, p, pv, 0); return i * r; }
		function fin(fn, req) { return lift(function () { var a = []; for (var i = 0; i < arguments.length; i++) { if (arguments[i] === undefined) { a.push(undefined); continue; } var v = num(arguments[i]); if (isErr(v)) return v; a.push(v); } if (a.length < req) return VAL; var r = fn.apply(null, a); return typeof r === "number" && !isFinite(r) ? NUM : r; }); }
		M.PMT = fin(function (r, n, pv, fv, t) { return n === 0 ? NUM : pmt(r, n, pv, fv || 0, t ? 1 : 0); }, 3);
		M.FV = fin(function (r, n, p, pv, t) { return fvf(r, n, p, pv || 0, t ? 1 : 0); }, 3);
		M.PV = fin(function (r, n, p, fv, t) { return pvf(r, n, p, fv || 0, t ? 1 : 0); }, 3);
		M.NPER = fin(function (r, p, pv, fv, t) { fv = fv || 0; t = t ? 1 : 0; if (r === 0) return p === 0 ? NUM : -(pv + fv) / p; var a = p * (1 + r * t) - fv * r, b = pv * r + p * (1 + r * t); if (a / b <= 0) return NUM; return Math.log(a / b) / Math.log(1 + r); }, 3);
		M.IPMT = fin(function (r, per, n, pv, fv, t) { t = t ? 1 : 0; if (per < 1 || per > n) return NUM; return ipmt(r, per, n, pv, fv || 0, t); }, 4);
		M.PPMT = fin(function (r, per, n, pv, fv, t) { t = t ? 1 : 0; fv = fv || 0; if (per < 1 || per > n) return NUM; return pmt(r, n, pv, fv, t) - ipmt(r, per, n, pv, fv, t); }, 4);
		M.RATE = fin(function (n, p, pv, fv, t, g) {
			fv = fv || 0; t = t ? 1 : 0; var r = g === undefined ? 0.1 : g;
			for (var i = 0; i < 100; i++) {
				var f = r === 0 ? pv + p * n + fv : pv * Math.pow(1 + r, n) + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / r + fv;
				var h = 1e-7 * Math.max(1, Math.abs(r)), r2 = r + h, f2 = r2 === 0 ? pv + p * n + fv : pv * Math.pow(1 + r2, n) + p * (1 + r2 * t) * (Math.pow(1 + r2, n) - 1) / r2 + fv;
				var d = (f2 - f) / h; if (!d || !isFinite(d)) return NUM;
				var nr = r - f / d; if (!isFinite(nr)) return NUM;
				if (Math.abs(nr - r) < 1e-10) return nr;
				r = nr; if (r <= -1) r = -0.999999;
			}
			return NUM;
		}, 3);
		M.NPV = function (a) { var r = num(scalar(a[0])); if (isErr(r)) return r; var n = nums(a.slice(1)); if (isErr(n)) return n; var s = 0; n.forEach(function (v, i) { s += v / Math.pow(1 + r, i + 1); }); return s; };
		function irr(vals, guess) {
			var npv = function (r) { var s = 0; for (var i = 0; i < vals.length; i++) s += vals[i] / Math.pow(1 + r, i); return s; };
			var dnpv = function (r) { var s = 0; for (var i = 1; i < vals.length; i++) s -= i * vals[i] / Math.pow(1 + r, i + 1); return s; };
			var r = guess;
			for (var k = 0; k < 100; k++) { var f = npv(r), d = dnpv(r); if (!d) break; var nr = r - f / d; if (!isFinite(nr)) break; if (Math.abs(nr - r) < 1e-12) return nr; r = nr <= -1 ? (r - 1) / 2 : nr; }
			var lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi); if (flo * fhi > 0) return NUM;
			for (var j = 0; j < 300; j++) { var mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-10) return mid; if (fm * flo < 0) { hi = mid; } else { lo = mid; flo = fm; } }
			return (lo + hi) / 2;
		}
		M.IRR = function (a) { var n = nums([a[0]]); if (isErr(n)) return n; var g = a[1] === undefined ? 0.1 : num(scalar(a[1])); if (!n.some(function (v) { return v > 0; }) || !n.some(function (v) { return v < 0; })) return NUM; return irr(n, g); };
		function xnpv(r, v, d) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i] / Math.pow(1 + r, (d[i] - d[0]) / 365); return s; }
		M.XNPV = function (a) { var r = num(scalar(a[0])), v = nums([a[1]]), d = nums([a[2]]); if (firstErr(r, v, d)) return firstErr(r, v, d); if (v.length !== d.length) return NUM; return xnpv(r, v, d.map(Math.floor)); };
		M.XIRR = function (a) {
			var v = nums([a[0]]), d = nums([a[1]]); if (firstErr(v, d)) return firstErr(v, d); if (v.length !== d.length) return NUM; d = d.map(Math.floor);
			var r = a[2] === undefined ? 0.1 : num(scalar(a[2]));
			for (var k = 0; k < 100; k++) { var f = xnpv(r, v, d), h = 1e-7, df = (xnpv(r + h, v, d) - f) / h; if (!df) break; var nr = r - f / df; if (Math.abs(nr - r) < 1e-12) return nr; r = nr <= -1 ? -0.99 : nr; }
			return NUM;
		};
		M.SLN = fin(function (c, s, l) { return l === 0 ? DIV : (c - s) / l; }, 3);
		M.SYD = fin(function (c, s, l, p) { return l === 0 ? DIV : (c - s) * (l - p + 1) * 2 / (l * (l + 1)); }, 4);
		M.DDB = fin(function (c, s, l, p, f) { f = f === undefined ? 2 : f; var v = c, d = 0; for (var i = 1; i <= p; i++) { d = Math.min(v * f / l, Math.max(0, v - s)); v -= d; } return d; }, 4);
		M.EFFECT = fin(function (r, n) { n = Math.floor(n); if (r <= 0 || n < 1) return NUM; return Math.pow(1 + r / n, n) - 1; }, 2);
		M.NOMINAL = fin(function (r, n) { n = Math.floor(n); if (r <= 0 || n < 1) return NUM; return n * (Math.pow(1 + r, 1 / n) - 1); }, 2);
		M.RRI = fin(function (n, pv, fv) { if (n <= 0) return NUM; return Math.pow(fv / pv, 1 / n) - 1; }, 3);
		M.CUMIPMT = fin(function (r, n, pv, s, e, t) { var x = 0; for (var p = Math.ceil(s); p <= Math.floor(e); p++) x += ipmt(r, p, n, pv, 0, t ? 1 : 0); return x; }, 6);
		M.CUMPRINC = fin(function (r, n, pv, s, e, t) { var x = 0, P = pmt(r, n, pv, 0, t ? 1 : 0); for (var p = Math.ceil(s); p <= Math.floor(e); p++) x += P - ipmt(r, p, n, pv, 0, t ? 1 : 0); return x; }, 6);

		/* ---------- lookup and reference ---------- */
		function lookCmp(a, b) { return compare(a, b); }
		function eqLook(needle, wildOk) {
			if (typeof needle === "string" && wildOk && /[*?~]/.test(needle)) { var re = wild(needle); return function (v) { return typeof v === "string" && re.test(v); }; }
			return function (v) { if (v == null) v = typeof needle === "string" ? null : v; return v != null && typeRank0(v) === typeRank0(needle) && lookCmp(v, needle) === 0; };
		}
		function typeRank0(x) { return typeof x === "number" ? 0 : typeof x === "string" ? 1 : typeof x === "boolean" ? 2 : 3; }
		function vector(x) { var a = arrOf(x); if (a.h === 1) return a.rows[0].slice(); if (a.w === 1) return a.rows.map(function (r) { return r[0]; }); return null; }
		// sorted (approximate) search like Excel: the last position whose value is <= needle (asc) / >= needle (desc), same type only
		function approx(vals, needle, desc) {
			var lo = 0, hi = vals.length - 1, best = -1, t = typeRank0(needle);
			while (lo <= hi) {
				var mid = (lo + hi) >> 1, v = vals[mid], m2 = mid;
				while (m2 >= lo && (v == null || typeRank0(v) !== t)) { m2--; v = vals[m2]; }
				if (m2 < lo) { lo = mid + 1; continue; }
				var c = lookCmp(v, needle);
				if (desc ? c >= 0 : c <= 0) { best = m2; lo = mid + 1; } else hi = m2 - 1;
			}
			return best;
		}
		function findIn(vals, needle, mode, search) {   // XLOOKUP / XMATCH: mode 0 exact, -1 exact or next smaller, 1 exact or next larger, 2 wildcard
			var n = vals.length, order = [];
			if (search === 2 || search === -2) {
				var asc = search === 2, lo = 0, hi = n - 1, hit = -1;
				while (lo <= hi) { var mid = (lo + hi) >> 1, c = lookCmp(vals[mid], needle); if (c === 0) { hit = mid; if (asc) hi = mid - 1; else lo = mid + 1; } else if (asc ? c < 0 : c > 0) lo = mid + 1; else hi = mid - 1; }
				if (hit >= 0 || mode === 0 || mode === 2) return hit;
				// next smaller / larger in a sorted list
				var cand = -1; for (var q = 0; q < n; q++) { var v = vals[q]; if (v == null || typeRank0(v) !== typeRank0(needle)) continue; var cc = lookCmp(v, needle); if ((mode === -1 && cc < 0 && (cand < 0 || lookCmp(v, vals[cand]) > 0)) || (mode === 1 && cc > 0 && (cand < 0 || lookCmp(v, vals[cand]) < 0))) cand = q; } return cand;
			}
			for (var i = 0; i < n; i++) order.push(search === -1 ? n - 1 - i : i);
			var eq = eqLook(needle, mode === 2), best = -1;
			for (var k = 0; k < n; k++) { var j = order[k], x = vals[j]; if (eq(x)) return j; if (mode === -1 || mode === 1) { if (x == null || typeRank0(x) !== typeRank0(needle)) continue; var c2 = lookCmp(x, needle); if ((mode === -1 && c2 < 0 && (best < 0 || lookCmp(x, vals[best]) > 0)) || (mode === 1 && c2 > 0 && (best < 0 || lookCmp(x, vals[best]) < 0))) best = j; } }
			return best;
		}
		function sliceOf(x, i, byRow) {   // row i (byRow) or column i of x, as a Range when x is one
			if (x instanceof Range) { var g = x.g, B = x.box(); return byRow ? new Range(x.sheet, { s: { r: g.s.r + i, c: g.s.c }, e: { r: g.s.r + i, c: B.c2 } }, x.ctx) : new Range(x.sheet, { s: { r: g.s.r, c: g.s.c + i }, e: { r: B.r2, c: g.s.c + i } }, x.ctx); }
			var a = arrOf(x); return byRow ? new Arr([a.rows[i]]) : new Arr(a.rows.map(function (r) { return [r[i]]; }));
		}
		function cellOf(x, i, j) { if (x instanceof Range) return new Range(x.sheet, { s: { r: x.g.s.r + i, c: x.g.s.c + j }, e: { r: x.g.s.r + i, c: x.g.s.c + j } }, x.ctx); var a = arrOf(x); return i < a.h && j < a.w ? a.rows[i][j] : REF; }
		function lookupRV(horiz) {
			return lift(function (needle, table, idx, rl) {
				if (isErr(needle)) return needle;
				idx = num(idx); if (isErr(idx)) return idx;
				var exact = rl !== undefined && rl !== null && !(bool(rl) === true), t = arrOf(table);
				if (idx < 1) return VAL;
				var keys = horiz ? t.rows[0] : t.rows.map(function (r) { return r[0]; }), lim = horiz ? t.h : t.w;
				if (Math.floor(idx) > lim) return REF;
				var pos = exact ? findIn(keys, needle, 2, 1) : approx(keys, needle, false);
				if (pos < 0) return NA;
				var v = horiz ? t.rows[Math.floor(idx) - 1][pos] : t.rows[pos][Math.floor(idx) - 1];
				return v == null ? 0 : v;
			}, 1);
		}
		M.VLOOKUP = lookupRV(false); M.HLOOKUP = lookupRV(true);
		M.LOOKUP = function (a) {
			var needle = scalar(a[0]); if (isErr(needle)) return needle;
			var lv = vector(a[0 + 1]), rv = a[2] !== undefined ? vector(a[2]) : null;
			if (!lv) { var t = arrOf(a[1]); var horiz = t.w > t.h; lv = horiz ? t.rows[0] : t.rows.map(function (r) { return r[0]; }); rv = horiz ? t.rows[t.h - 1] : t.rows.map(function (r) { return r[t.w - 1]; }); }
			var pos = approx(lv, needle, false); if (pos < 0) return NA;
			var out = (rv || lv)[pos]; return out == null ? 0 : out;
		};
		M.MATCH = lift(function (needle, arr, type) {
			if (isErr(needle)) return needle;
			var t = type === undefined ? 1 : num(type), v = vector(arr); if (!v) return NA; if (isErr(t)) return t;
			var pos = t === 0 ? findIn(v, needle, 2, 1) : approx(v, needle, t < 0);
			return pos < 0 ? NA : pos + 1;
		}, 1);
		M.XMATCH = lift(function (needle, arr, mode, search) {
			if (isErr(needle)) return needle;
			var v = vector(arr); if (!v) return VAL;
			var m = mode === undefined ? 0 : num(mode), s = search === undefined ? 1 : num(search);
			var pos = findIn(v, needle, m, s); return pos < 0 ? NA : pos + 1;
		}, 1);
		M.XLOOKUP = function (a) {
			var la = a[1], ra = a[2], nf = a[3], mode = a[4] === undefined ? 0 : num(scalar(a[4])), search = a[5] === undefined ? 1 : num(scalar(a[5]));
			var D = dimsOf(la), byRow = D.h === 1 && D.w > 1, keys = vector(la); if (!keys) return VAL;
			var one = function (needle) {
				if (isErr(needle)) return needle;
				var pos = findIn(keys, needle, mode, search);
				if (pos < 0) return nf === undefined ? NA : scalar(nf);
				var R = dimsOf(ra);
				if (byRow ? R.w !== keys.length : R.h !== keys.length) return VAL;
				return byRow ? sliceOf(ra, pos, false) : sliceOf(ra, pos, true);
			};
			if (isMulti(a[0])) return mapArr(toArr(a[0]), function (v) { var r = one(v); return r instanceof Range || r instanceof Arr ? scalar(r) : r; });
			var r = one(scalar(a[0]));
			if (r instanceof Range && r.isCell()) return r;
			return r;
		};
		M.INDEX = function (a) {
			var x = a[0], D = dimsOf(x), r = a[1] === undefined ? 0 : num(scalar(a[1])), c = a[2] === undefined ? (D.h === 1 && a[1] !== undefined ? null : 0) : num(scalar(a[2]));
			if (firstErr(r, c)) return firstErr(r, c);
			if (c === null) { c = r; r = 1; }
			if (D.w === 1 && a[2] === undefined) c = 1;
			r = Math.floor(r); c = Math.floor(c);
			if (r < 0 || c < 0) return VAL;
			if (x instanceof Range) { if (r > x.g.e.r - x.g.s.r + 1 || c > x.g.e.c - x.g.s.c + 1) return REF; }
			else if (r > D.h || c > D.w) return REF;
			if (r === 0 && c === 0) return x;
			if (r === 0) return sliceOf(x, c - 1, false);
			if (c === 0) return sliceOf(x, r - 1, true);
			return cellOf(x, r - 1, c - 1);
		};
		M.ROW = function (a, ctx) { var x = a[0]; if (x === undefined) return ctx.cur ? ctx.cur.r + 1 : VAL; if (!(x instanceof Range)) return VAL; if (x.g.s.r === x.g.e.r || !ctx.dyn) return x.g.s.r + 1; var rows = []; for (var r = x.g.s.r; r <= x.g.e.r; r++) rows.push([r + 1]); return new Arr(rows); };
		M.COLUMN = function (a, ctx) { var x = a[0]; if (x === undefined) return ctx.cur ? ctx.cur.c + 1 : VAL; if (!(x instanceof Range)) return VAL; if (x.g.s.c === x.g.e.c || !ctx.dyn) return x.g.s.c + 1; var row = []; for (var c = x.g.s.c; c <= x.g.e.c; c++) row.push(c + 1); return new Arr([row]); };
		M.ROWS = function (a) { var x = a[0]; if (x instanceof Range) return x.g.e.r - x.g.s.r + 1; if (x instanceof Arr) return x.h; return isErr(x) ? x : 1; };
		M.COLUMNS = function (a) { var x = a[0]; if (x instanceof Range) return x.g.e.c - x.g.s.c + 1; if (x instanceof Arr) return x.w; return isErr(x) ? x : 1; };
		M.OFFSET = function (a) {
			var x = a[0]; if (!(x instanceof Range)) return VAL;
			var dr = num(scalar(a[1])), dc = num(scalar(a[2])), h = a[3] === undefined ? x.g.e.r - x.g.s.r + 1 : num(scalar(a[3])), w = a[4] === undefined ? x.g.e.c - x.g.s.c + 1 : num(scalar(a[4]));
			if (firstErr(dr, dc, h, w)) return firstErr(dr, dc, h, w);
			h = Math.floor(h); w = Math.floor(w); if (h === 0 || w === 0) return REF;
			var r1 = x.g.s.r + Math.floor(dr), c1 = x.g.s.c + Math.floor(dc), r2 = r1 + h - (h > 0 ? 1 : -1), c2 = c1 + w - (w > 0 ? 1 : -1);
			var g = { s: { r: Math.min(r1, r2), c: Math.min(c1, c2) }, e: { r: Math.max(r1, r2), c: Math.max(c1, c2) } };
			if (g.s.r < 0 || g.s.c < 0 || g.e.r >= X.MAXR || g.e.c >= X.MAXC) return REF;
			return new Range(x.sheet, g, x.ctx);
		};
		M.INDIRECT = function (a, ctx) {
			var t = txt(scalar(a[0])); if (isErr(t)) return t;
			var a1 = a[1] === undefined || bool(scalar(a[1])) === true;
			t = t.trim();
			var sheet = ctx.sheet, m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
			if (m) { sheet = m[1] != null ? m[1].replace(/''/g, "'") : m[2]; t = m[3]; }
			if (ctx.hasSheet && !ctx.hasSheet(sheet)) return REF;
			var g = null;
			if (a1) g = X.parseRange(t.replace(/\$/g, ""));
			else { var rc = /^R(\d+)C(\d+)(?::R(\d+)C(\d+))?$/i.exec(t); if (rc) g = { s: { r: +rc[1] - 1, c: +rc[2] - 1 }, e: { r: +(rc[3] || rc[1]) - 1, c: +(rc[4] || rc[2]) - 1 } }; }
			if (!g && a1 && ctx.name) { var nv = ctx.name(t, ctx); if (nv instanceof Range) return nv; }
			if (!g && a1 && ctx.sref) { var mm = /^([A-Za-z_][\w.]*)\[(.*)\]$/.exec(t); if (mm) { var sr = ctx.sref(mm[1], mm[2], ctx); if (sr) return new Range(sr.sheet, sr.g, ctx); } }
			return g ? new Range(sheet, g, ctx) : REF;
		};
		M.ADDRESS = lift(function (r, c, abs, a1, sh) {
			r = num(r); c = num(c); abs = abs === undefined ? 1 : num(abs); if (firstErr(r, c, abs)) return firstErr(r, c, abs);
			r = Math.floor(r); c = Math.floor(c); if (r < 1 || c < 1) return VAL;
			var style = a1 === undefined || bool(a1) === true, out;
			if (style) out = (abs === 1 || abs === 3 ? "$" : "") + X.colName(c - 1) + (abs === 1 || abs === 2 ? "$" : "") + r;
			else out = "R" + (abs === 1 || abs === 2 ? r : "[" + r + "]") + "C" + (abs === 1 || abs === 3 ? c : "[" + c + "]");
			if (sh !== undefined && sh !== null) { var s = txt(sh); out = (/^[A-Za-z_][\w.]*$/.test(s) ? s : "'" + s.replace(/'/g, "''") + "'") + "!" + out; }
			return out;
		});
		M.TRANSPOSE = function (a) { var x = arrOf(a[0]), rows = []; for (var j = 0; j < x.w; j++) { var row = []; for (var i = 0; i < x.h; i++) row.push(x.rows[i][j]); rows.push(row); } return new Arr(rows); };
		M.SINGLE = function (a, ctx) { var x = a[0]; return x instanceof Range && !x.isCell() ? scalar(x) : x instanceof Arr ? scalar(x) : x; };
		M.ANCHORARRAY = function (a, ctx) { var x = a[0]; if (!(x instanceof Range)) return REF; var g = ctx.spillRange ? ctx.spillRange(x.sheet, x.g.s.r, x.g.s.c) : null; return g ? new Range(x.sheet, g, x.ctx) : REF; };

		/* ---------- dynamic arrays ---------- */
		function rowsOf(a, byCol) { return byCol ? a.rows[0].map(function (_, j) { return a.rows.map(function (r) { return r[j]; }); }) : a.rows.map(function (r) { return r.slice(); }); }
		function fromRows(list, byCol) { if (!byCol) return new Arr(list); var rows = []; for (var i = 0; i < (list[0] || []).length; i++) rows.push(list.map(function (c) { return c[i]; })); return new Arr(rows); }
		function keyOf(r) { return r.map(function (v) { return v == null ? "\u0000" : isErr(v) ? "#" + v.code : typeof v === "string" ? "s" + v.toLowerCase() : typeof v + String(v); }).join("\u0001"); }
		M.UNIQUE = function (a) {
			var x = arrOf(a[0]), byCol = a[1] !== undefined && bool(scalar(a[1])) === true, once = a[2] !== undefined && bool(scalar(a[2])) === true;
			var list = rowsOf(x, byCol), cnt = {}, first = [];
			list.forEach(function (r) { var k = keyOf(r); if (!(k in cnt)) { cnt[k] = 0; first.push(r); } cnt[k]++; });
			var out = first.filter(function (r) { return !once || cnt[keyOf(r)] === 1; });
			return out.length ? fromRows(out, byCol) : E["#CALC!"];
		};
		function sortCmp(a, b) { var ea = a == null, eb = b == null; if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; if (isErr(a) || isErr(b)) return isErr(a) === isErr(b) ? 0 : isErr(a) ? 1 : -1; return compare(a, b); }
		M.SORT = function (a) {
			var x = arrOf(a[0]), idx = a[1] === undefined ? [1] : flat([a[1]]).map(function (v) { return num(v); }), ord = a[2] === undefined ? [1] : flat([a[2]]).map(function (v) { return num(v); }), byCol = a[3] !== undefined && bool(scalar(a[3])) === true;
			var list = rowsOf(x, byCol), w = list[0] ? list[0].length : 0;
			for (var i = 0; i < idx.length; i++) if (isErr(idx[i]) || idx[i] < 1 || idx[i] > w) return VAL;
			var keyed = list.map(function (r, i) { return { r: r, i: i }; });
			keyed.sort(function (p, q) { for (var k = 0; k < idx.length; k++) { var o = ord[k] != null ? ord[k] : ord[0], c = sortCmp(p.r[idx[k] - 1], q.r[idx[k] - 1]); if (c) return o < 0 ? -c : c; } return p.i - q.i; });
			return fromRows(keyed.map(function (k) { return k.r; }), byCol);
		};
		M.SORTBY = function (a) {
			var x = arrOf(a[0]), list = x.rows.map(function (r, i) { return { r: r, i: i }; }), keys = [];
			for (var i = 1; i < a.length; i += 2) { var by = arrOf(a[i]), o = a[i + 1] === undefined ? 1 : num(scalar(a[i + 1])); if (by.h !== x.h && by.w === x.h && by.h === 1) by = new Arr(by.rows[0].map(function (v) { return [v]; })); if (by.h !== x.h) return VAL; keys.push({ v: by.rows.map(function (r) { return r[0]; }), o: o }); }
			list.sort(function (p, q) { for (var k = 0; k < keys.length; k++) { var c = sortCmp(keys[k].v[p.i], keys[k].v[q.i]); if (c) return keys[k].o < 0 ? -c : c; } return p.i - q.i; });
			return new Arr(list.map(function (p) { return p.r; }));
		};
		M.FILTER = function (a) {
			var x = arrOf(a[0]), inc = arrOf(a[1]), out;
			if (inc.w === 1 && inc.h === x.h) { out = []; for (var i = 0; i < x.h; i++) { var v = inc.rows[i][0]; if (isErr(v)) return v; if (bool(v) === true) out.push(x.rows[i]); } if (!out.length) return a[2] === undefined ? E["#CALC!"] : a[2]; return new Arr(out); }
			if (inc.h === 1 && inc.w === x.w) { var keep = []; for (var j = 0; j < x.w; j++) { var v2 = inc.rows[0][j]; if (isErr(v2)) return v2; if (bool(v2) === true) keep.push(j); } if (!keep.length) return a[2] === undefined ? E["#CALC!"] : a[2]; return new Arr(x.rows.map(function (r) { return keep.map(function (j2) { return r[j2]; }); })); }
			return VAL;
		};
		M.SEQUENCE = function (a) {
			var r = num(scalar(a[0])), c = a[1] === undefined ? 1 : num(scalar(a[1])), s = a[2] === undefined ? 1 : num(scalar(a[2])), st = a[3] === undefined ? 1 : num(scalar(a[3]));
			if (firstErr(r, c, s, st)) return firstErr(r, c, s, st);
			r = Math.floor(r); c = Math.floor(c); if (r < 1 || c < 1) return E["#CALC!"]; if (r * c > 1e6) return NUM;
			var rows = []; for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(s + (i * c + j) * st); rows.push(row); }
			return new Arr(rows);
		};
		M.RANDARRAY = function (a) {
			var r = a[0] === undefined ? 1 : num(scalar(a[0])), c = a[1] === undefined ? 1 : num(scalar(a[1])), lo = a[2] === undefined ? 0 : num(scalar(a[2])), hi = a[3] === undefined ? 1 : num(scalar(a[3])), whole = a[4] !== undefined && bool(scalar(a[4])) === true;
			if (firstErr(r, c, lo, hi)) return firstErr(r, c, lo, hi); if (hi < lo) return VAL; if (r * c > 1e6) return NUM;
			var rows = []; for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(whole ? Math.ceil(lo) + Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + Math.random() * (hi - lo)); rows.push(row); }
			return new Arr(rows);
		};
		function stack(a, horiz) {
			var parts = a.filter(function (x) { return x !== undefined; }).map(arrOf), rows = [];
			if (horiz) { var h = Math.max.apply(null, parts.map(function (p) { return p.h; })); for (var i = 0; i < h; i++) { var row = []; parts.forEach(function (p) { for (var j = 0; j < p.w; j++) row.push(i < p.h ? p.rows[i][j] : NA); }); rows.push(row); } }
			else { var w = Math.max.apply(null, parts.map(function (p) { return p.w; })); parts.forEach(function (p) { p.rows.forEach(function (r) { var row = r.slice(); while (row.length < w) row.push(NA); rows.push(row); }); }); }
			return new Arr(rows);
		}
		M.HSTACK = function (a) { return stack(a, true); }; M.VSTACK = function (a) { return stack(a, false); };
		function takeDrop(drop) {
			return function (a) {
				var x = arrOf(a[0]), r = a[1] === undefined ? null : num(scalar(a[1])), c = a[2] === undefined ? null : num(scalar(a[2])); if (firstErr(r, c)) return firstErr(r, c);
				var rs = 0, re = x.h, cs = 0, ce = x.w;
				if (r != null) { r = Math.trunc(r); if (drop) { if (r >= 0) rs = Math.min(x.h, r); else re = Math.max(0, x.h + r); } else { if (r >= 0) re = Math.min(x.h, r); else rs = Math.max(0, x.h + r); } }
				if (c != null) { c = Math.trunc(c); if (drop) { if (c >= 0) cs = Math.min(x.w, c); else ce = Math.max(0, x.w + c); } else { if (c >= 0) ce = Math.min(x.w, c); else cs = Math.max(0, x.w + c); } }
				if (re <= rs || ce <= cs) return E["#CALC!"];
				return new Arr(x.rows.slice(rs, re).map(function (row) { return row.slice(cs, ce); }));
			};
		}
		M.TAKE = takeDrop(false); M.DROP = takeDrop(true);
		function choose(cols) {
			return function (a) {
				var x = arrOf(a[0]), n = cols ? x.w : x.h, idx = flat(a.slice(1)).map(function (v) { return num(v); }), out = [];
				for (var i = 0; i < idx.length; i++) { if (isErr(idx[i])) return idx[i]; var k = Math.trunc(idx[i]); if (k < 0) k = n + k + 1; if (k < 1 || k > n) return VAL; out.push(k - 1); }
				return cols ? new Arr(x.rows.map(function (r) { return out.map(function (k) { return r[k]; }); })) : new Arr(out.map(function (k) { return x.rows[k].slice(); }));
			};
		}
		M.CHOOSECOLS = choose(true); M.CHOOSEROWS = choose(false);
		M.TOCOL = function (a) { var x = arrOf(a[0]), out = []; x.each(function (v) { out.push([v]); }); return new Arr(out); };
		M.TOROW = function (a) { var x = arrOf(a[0]), out = []; x.each(function (v) { out.push(v); }); return new Arr([out]); };

		Object.keys(M).forEach(function (k) { FN[k] = M[k]; });

		/* ---------- functions whose arguments are worked out only when needed ---------- */
		var LZ = {
			IF: function (args, ev, ctx, env) {
				if (!args.length) return VAL;
				var c0 = ev(args[0]);
				if (isMulti(c0)) {
					var thenV = args.length > 1 && args[1].k !== "missing" ? ev(args[1]) : (args.length > 1 ? 0 : true), elseV = args.length > 2 ? (args[2].k === "missing" ? 0 : ev(args[2])) : false;
					return broadcast([c0, thenV, elseV], function (c, t, e) { var b = bool(c); return isErr(b) ? b : b ? t : e; });
				}
				var c = bool(scalar(c0));
				if (isErr(c)) return c;
				if (c) return args.length > 1 && args[1].k !== "missing" ? ev(args[1]) : (args.length > 1 ? 0 : true);
				return args.length > 2 ? (args[2].k === "missing" ? 0 : ev(args[2])) : false;
			},
			IFS: function (args, ev) {
				for (var i = 0; i + 1 < args.length; i += 2) { var c = bool(scalar(ev(args[i]))); if (isErr(c)) return c; if (c) return ev(args[i + 1]); }
				return NA;
			},
			IFERROR: function (args, ev) { var v0 = ev(args[0]); if (isMulti(v0)) { var alt = args.length > 1 ? ev(args[1]) : 0; return broadcast([v0, alt], function (v, a) { return isErr(v) ? a : v; }); } var v = scalar(v0); return isErr(v) ? (args.length > 1 ? ev(args[1]) : 0) : v0; },
			IFNA: function (args, ev) { var v0 = ev(args[0]); if (isMulti(v0)) { var alt = ev(args[1]); return broadcast([v0, alt], function (v, a) { return isErr(v) && v.code === "#N/A" ? a : v; }); } var v = scalar(v0); return isErr(v) && v.code === "#N/A" ? ev(args[1]) : v0; },
			SWITCH: function (args, ev) {
				var x = scalar(ev(args[0])); if (isErr(x)) return x;
				var i = 1; for (; i + 1 < args.length; i += 2) { var v = scalar(ev(args[i])); if (!isErr(v) && compare(x, v) === 0 && typeRank0(x == null ? 0 : x) === typeRank0(v == null ? 0 : v)) return ev(args[i + 1]); }
				return i < args.length ? ev(args[i]) : NA;
			},
			CHOOSE: function (args, ev) {
				var i0 = ev(args[0]);
				if (isMulti(i0)) { var opts = args.slice(1).map(function (a) { return ev(a); }); return mapArr(toArr(i0), function (v) { var k = num(v); if (isErr(k)) return k; k = Math.floor(k); return k < 1 || k > opts.length ? VAL : scalar(opts[k - 1]); }); }
				var i = num(scalar(i0)); if (isErr(i)) return i; i = Math.floor(i);
				if (i < 1 || i >= args.length) return VAL;
				return ev(args[i]);
			},
			LET: function (args, ev, ctx, env) {
				if (args.length < 3 || args.length % 2 === 0) return VAL;
				var e = new X.Env(env);
				for (var i = 0; i + 1 < args.length; i += 2) { if (args[i].k !== "name") return VAL; e.v[args[i].v.toUpperCase()] = ev(args[i + 1], e); }
				return ev(args[args.length - 1], e);
			}
		};
		Object.keys(LZ).forEach(function (k) { LAZY[k] = LZ[k]; });
		X.refreshFunctions();
		X.lift = lift;
	}
	if (typeof module === "object" && module.exports) module.exports = { install: install };
	else if (root.MESXL) install(root.MESXL);
})(typeof window !== "undefined" ? window : this);
