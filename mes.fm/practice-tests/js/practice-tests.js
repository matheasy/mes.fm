/* MES Practice Tests (tool_apps_src/practice-tests): numeracy item generators, the literacy passage bank (passages.js), test assembly,
   answer checking and scoring. Pure, no DOM, deterministic from a seed. Runs in node: node tool_apps_src/practice-tests-tests.js
   window.MESPT = { GRADES, TOPICS, GENS, SKILLS, buildTest, checkAnswer, score, parseNum, rng, ... } */
(function (root) {
	"use strict";

	// ---------- random numbers (mulberry32, so a test code always gives the same test) ----------
	function rng(seed) {
		var a = seed >>> 0;
		return function () {
			a = (a + 0x6D2B79F5) | 0;
			var t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
	function Rand(seed) {
		var f = rng(seed);
		var R = {
			f: f,
			int: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
			pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
			chance: function (p) { return f() < p; },
			shuffle: function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(f() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
			sample: function (arr, n) { return R.shuffle(arr.slice()).slice(0, n); }
		};
		return R;
	}
	function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

	// ---------- formatting ----------
	var NB = " ", MINUS = "−";
	function fmt(n) {   // 4 728, 12 345, 0.75, −8 (a space between thousands for 5+ digits, the Canadian school style)
		var neg = n < 0, s = String(Math.abs(n));
		if (/e/.test(s)) s = Math.abs(n).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
		var p = s.split("."), w = p[0];
		if (w.length >= 5) w = w.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
		return (neg ? MINUS : "") + w + (p[1] ? "." + p[1] : "");
	}
	function money(c) { return (c < 0 ? MINUS : "") + "$" + fmt(Math.floor(Math.abs(c) / 100)) + "." + ("0" + (Math.abs(c) % 100)).slice(-2); }  // from cents
	function r2(x) { return Math.round(x * 100) / 100; }
	function r6(x) { return Math.round(x * 1e6) / 1e6; }
	function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
	function simp(n, d) { var g = gcd(n, d); if (d < 0) g = -g; return [n / g, d / g]; }
	function fr(n, d) { return '<span class="pt-fr" aria-label="' + n + ' over ' + d + '"><span>' + n + '</span><span>' + d + '</span></span>'; }
	function frS(n, d) { var s = simp(n, d); return s[1] === 1 ? fmt(s[0]) : (s[0] < 0 ? MINUS : "") + fr(Math.abs(s[0]), s[1]); }
	function frTxt(n, d) { return n + "/" + d; }
	function neg(n) { return n < 0 ? "(" + MINUS + Math.abs(n) + ")" : String(n); }
	function hm(min) {   // minutes since midnight -> "2:45 p.m."
		min = ((min % 1440) + 1440) % 1440;
		var h = Math.floor(min / 60), m = min % 60, ap = h < 12 ? "a.m." : "p.m.", hh = h % 12 || 12;
		return hh + ":" + ("0" + m).slice(-2) + " " + ap;
	}
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

	// ---------- grades / difficulty ----------
	var GRADES = { 2: "ages 7–8", 3: "ages 8–9", 4: "ages 9–10", 5: "ages 10–11", 6: "ages 11–12", 7: "ages 12–13", 8: "ages 13–14" };
	function fitLabel(g) { return "Grade " + g + " (" + (GRADES[g] || "") + ")"; }
	var DIFFS = ["easy", "medium", "hard"];
	function fitFor(grade, diff) { return grade + (diff === "easy" ? -1 : diff === "hard" ? 1 : 0); }

	// ---------- choices ----------
	// correct + wrong candidates -> 4 shuffled unique choices. key(x) decides "the same answer" (by value for numbers and fractions).
	function choose(R, correct, wrongs, opt) {
		opt = opt || {};
		var key = opt.key || function (x) { return String(x); }, show = opt.show || function (x) { return String(x); }, n = opt.n || 4;
		var seen = {}, out = [];
		seen[key(correct)] = 1;
		for (var i = 0; i < wrongs.length && out.length < n - 1; i++) {
			var w = wrongs[i];
			if (w === null || w === undefined || (typeof w === "number" && !isFinite(w))) continue;
			if (opt.ok && !opt.ok(w)) continue;
			var k = key(w);
			if (seen[k]) continue;
			seen[k] = 1; out.push(w);
		}
		if (out.length < n - 1) throw new Error("not enough distractors");
		var all = R.shuffle([correct].concat(out));
		var shown = all.map(show);
		return { choices: shown, answer: all.indexOf(correct) };
	}
	function nearNums(R, ans, extra, step) {   // plausible wrong numbers around ans
		step = step || 1;
		var c = (extra || []).slice();
		var offs = R.shuffle([1, -1, 2, -2, 10, -10, 3, -3, 5, -5]);
		offs.forEach(function (o) { c.push(r6(ans + o * step)); });
		return c;
	}
	function mcNum(R, ans, extra, opt) {
		opt = opt || {};
		return choose(R, ans, nearNums(R, ans, extra, opt.step), { key: function (x) { return String(r6(x)); }, show: opt.show || fmt, ok: opt.ok || function (x) { return x >= 0 || opt.neg; } });
	}

	// ---------- SVG helpers (colours come from CSS classes so dark mode works) ----------
	function svg(w, h, body, label) {
		return '<svg class="pt-svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(label) + '">' + body + '</svg>';
	}
	function line(x1, y1, x2, y2, cls) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="' + (cls || "pt-s-line") + '"/>'; }
	function text(x, y, s, cls, anchor) { return '<text x="' + x + '" y="' + y + '" class="' + (cls || "pt-s-text") + '" text-anchor="' + (anchor || "middle") + '">' + s + '</text>'; }

	function numberLineSvg(start, step, n, labelled, arrowAt, dec) {
		var W = 560, x0 = 30, dx = (W - 60) / n, b = "";
		b += line(x0 - 14, 40, W - 16, 40) + '<path d="M' + (W - 16) + ' 40 l-8 -5 v10 z" class="pt-s-fillline"/><path d="M' + (x0 - 14) + ' 40 l8 -5 v10 z" class="pt-s-fillline"/>';
		for (var i = 0; i <= n; i++) {
			var x = x0 + i * dx;
			b += line(x, 32, x, 48);
			if (labelled.indexOf(i) >= 0) b += text(x, 68, fmt(r6(start + i * step)));
		}
		var ax = x0 + arrowAt * dx;
		b += '<path d="M' + ax + ' 28 l-7 -14 h14 z" class="pt-s-acc"/>';
		return svg(W, 76, b, "Number line from " + fmt(start) + " to " + fmt(r6(start + n * step)) + " with " + n + " equal spaces. An arrow points at one of the marks.");
	}
	function clockSvg(h, m) {
		var c = 70, b = '<circle cx="' + c + '" cy="' + c + '" r="62" class="pt-s-face"/>';
		for (var i = 1; i <= 12; i++) {
			var a = i * Math.PI / 6;
			b += text(r2(c + 49 * Math.sin(a)), r2(c - 49 * Math.cos(a) + 5), i, "pt-s-text pt-s-small");
		}
		for (var k = 0; k < 60; k++) {
			var aa = k * Math.PI / 30, r1 = k % 5 ? 58 : 55;
			b += line(r2(c + r1 * Math.sin(aa)), r2(c - r1 * Math.cos(aa)), r2(c + 61 * Math.sin(aa)), r2(c - 61 * Math.cos(aa)), "pt-s-tick");
		}
		var ha = ((h % 12) + m / 60) * Math.PI / 6, ma = m * Math.PI / 30;
		b += '<line x1="' + c + '" y1="' + c + '" x2="' + r2(c + 30 * Math.sin(ha)) + '" y2="' + r2(c - 30 * Math.cos(ha)) + '" class="pt-s-hand pt-s-hour"/>';
		b += '<line x1="' + c + '" y1="' + c + '" x2="' + r2(c + 46 * Math.sin(ma)) + '" y2="' + r2(c - 46 * Math.cos(ma)) + '" class="pt-s-hand pt-s-min"/>';
		b += '<circle cx="' + c + '" cy="' + c + '" r="4" class="pt-s-acc"/>';
		var desc = "Analogue clock. The short hour hand is " + (m === 0 ? "on the " + (h % 12 || 12) : "between the " + (h % 12 || 12) + " and the " + ((h % 12) + 1)) + "; the long minute hand points at " + (m % 5 === 0 ? (m === 0 ? "the 12" : "the " + m / 5) : m + " minute marks past the 12") + ".";
		return svg(140, 140, b, desc);
	}
	var COINS = { 5: ["5¢", 17, "nickel"], 10: ["10¢", 15, "dime"], 25: ["25¢", 19, "quarter"], 100: ["$1", 21, "loonie"], 200: ["$2", 23, "toonie"] };
	function coinsSvg(list) {
		var x = 8, b = "", cnt = {};
		list.forEach(function (v) {
			var c = COINS[v], r = c[1];
			b += '<circle cx="' + (x + r) + '" cy="30" r="' + r + '" class="pt-s-coin pt-s-c' + v + '"/>' + text(x + r, 35, c[0], "pt-s-text pt-s-cointx");
			x += 2 * r + 8; cnt[c[2]] = (cnt[c[2]] || 0) + 1;
		});
		var desc = "Coins: " + Object.keys(cnt).map(function (k) { return cnt[k] + " " + k + (cnt[k] > 1 ? "s" : ""); }).join(", ") + ".";
		return svg(x, 60, b, desc);
	}
	function gridShapeSvg(cells, w, h, label) {   // cells: [[x,y]...] filled squares on a w x h grid
		var s = 30, b = "";
		for (var y = 0; y <= h; y++) b += line(0, y * s, w * s, y * s, "pt-s-grid");
		for (var x = 0; x <= w; x++) b += line(x * s, 0, x * s, h * s, "pt-s-grid");
		cells.forEach(function (c) { b += '<rect x="' + c[0] * s + '" y="' + c[1] * s + '" width="' + s + '" height="' + s + '" class="pt-s-fill"/>'; });
		return svg(w * s + 1, h * s + 1, '<g transform="translate(0.5 0.5)">' + b + '</g>', label);
	}
	function fracShapeSvg(n, k, kind) {
		var b = "";
		if (kind === "bar") {
			var W = 360, w = W / n;
			for (var i = 0; i < n; i++) b += '<rect x="' + r2(2 + i * w) + '" y="2" width="' + r2(w) + '" height="56" class="' + (i < k ? "pt-s-fill" : "pt-s-empty") + '"/>';
			return svg(W + 4, 60, b, "A bar cut into " + n + " equal parts. " + k + " of the parts are shaded.");
		}
		var c = 62, r = 58;
		for (var j = 0; j < n; j++) {
			var a0 = j / n * 2 * Math.PI - Math.PI / 2, a1 = (j + 1) / n * 2 * Math.PI - Math.PI / 2;
			b += '<path d="M' + c + ' ' + c + ' L' + r2(c + r * Math.cos(a0)) + ' ' + r2(c + r * Math.sin(a0)) + ' A' + r + ' ' + r + ' 0 0 1 ' + r2(c + r * Math.cos(a1)) + ' ' + r2(c + r * Math.sin(a1)) + ' Z" class="' + (j < k ? "pt-s-fill" : "pt-s-empty") + '"/>';
		}
		return svg(124, 124, b, "A circle cut into " + n + " equal parts. " + k + " of the parts are shaded.");
	}
	function barGraphSvg(cats, vals, step, title, ylab) {
		var max = Math.max.apply(null, vals), top = Math.ceil((max + step * 0.5) / step) * step;
		var W = 420, H = 230, L = 46, B = 190, T = 22, ph = B - T, bw = (W - L - 10) / cats.length, b = "";
		b += text(W / 2, 14, esc(title), "pt-s-text pt-s-bold");
		for (var v = 0; v <= top; v += step) {
			var y = r2(B - v / top * ph);
			b += line(L, y, W - 6, y, "pt-s-grid") + text(L - 6, y + 4, fmt(v), "pt-s-text pt-s-small", "end");
		}
		cats.forEach(function (c, i) {
			var h = vals[i] / top * ph, x = L + i * bw + bw * 0.18;
			b += '<rect x="' + r2(x) + '" y="' + r2(B - h) + '" width="' + r2(bw * 0.64) + '" height="' + r2(h) + '" class="pt-s-bar pt-s-bar' + (i % 5) + '"/>';
			b += text(r2(L + i * bw + bw / 2), B + 16, esc(c), "pt-s-text pt-s-small");
		});
		b += line(L, B, W - 6, B) + line(L, T - 4, L, B);
		b += '<text x="12" y="' + (T + ph / 2) + '" class="pt-s-text pt-s-small" text-anchor="middle" transform="rotate(-90 12 ' + (T + ph / 2) + ')">' + esc(ylab) + '</text>';
		return svg(W, H, b, "Bar graph: " + title + ". " + cats.map(function (c, i) { return c + " " + vals[i]; }).join(", ") + ".");
	}
	function polySvg(type, size) {   // small shape picture for choices
		size = size || 90;
		var P = {
			triangle: [[45, 8], [84, 80], [6, 80]], square: [[15, 15], [75, 15], [75, 75], [15, 75]], rectangle: [[4, 25], [86, 25], [86, 68], [4, 68]],
			pentagon: reg(5), hexagon: reg(6), octagon: reg(8), rhombus: [[45, 6], [80, 45], [45, 84], [10, 45]],
			trapezoid: [[25, 22], [65, 22], [86, 72], [4, 72]], parallelogram: [[24, 22], [86, 22], [66, 70], [4, 70]],
			"right triangle": [[12, 10], [12, 80], [84, 80]], "isosceles triangle": [[45, 6], [70, 82], [20, 82]],
			"scalene triangle": [[10, 80], [84, 80], [28, 14]], "isosceles trapezoid": [[28, 22], [62, 22], [84, 72], [6, 72]],
			"equilateral triangle": reg(3)
		}[type];
		function reg(n) { var o = []; for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / n + (n % 2 ? 0 : Math.PI / n); o.push([r2(45 + 40 * Math.cos(a)), r2(47 + 40 * Math.sin(a))]); } return o; }
		var pts = P.map(function (p) { return p[0] + "," + p[1]; }).join(" ");
		return svg(size, size, '<polygon points="' + pts + '" class="pt-s-shape"/>', "A shape with " + P.length + " straight sides");
	}
	function tableHtml(head, rows, cls) {
		return '<table class="pt-tbl' + (cls ? " " + cls : "") + '"><thead><tr>' + head.map(function (h) { return "<th scope=\"col\">" + h + "</th>"; }).join("") + '</tr></thead><tbody>' +
			rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
	}

	var NAMES = ["Maya", "Liam", "Ava", "Noah", "Priya", "Kai", "Sofia", "Jordan", "Amir", "Chloe", "Ethan", "Mei", "Lucas", "Zara", "Owen", "Nia", "Arjun", "Hana", "Mateo", "Leah", "Raj", "Emma", "Jin", "Tala"];

	// =====================================================================================
	// NUMERACY GENERATORS. Each: { id, topic, grade, make(R, diff) -> item }.
	// item: { q (html), svg?, html? (table etc.), type: mc|num|multi, choices?, answer, prefix?, unit?, tol?, alts?, explain (html), key, data }
	// =====================================================================================
	var G = [];
	function gen(id, grade, topic, title, make) { G.push({ id: id, grade: grade, topic: topic, title: title, make: make }); }
	var PLACE = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"];

	// ---------- Grade 4: number sense ----------
	gen("g4-place", 4, "number", "Place value", function (R, diff) {
		var len = diff === "easy" ? 3 : diff === "medium" ? 4 : R.pick([5, 6]), digits, n, pos, d, tries = 0;
		do {
			digits = [R.int(1, 9)]; for (var i = 1; i < len; i++) digits.push(R.int(0, 9));
			pos = R.int(1, len - 1); d = digits[len - 1 - pos]; tries++;
		} while ((d === 0 || digits.filter(function (x) { return x === d; }).length > 1) && tries < 200);
		n = +digits.join("");
		if (diff !== "easy" && R.chance(0.4)) {   // expanded form
			var parts = digits.map(function (x, i) { return x * Math.pow(10, len - 1 - i); }).filter(Boolean);
			var right = parts.map(fmt).join(" + ");
			var w1 = parts.map(function (p, i) { return fmt(i === 1 ? p / 10 : p); }).join(" + ");
			var w2 = digits.filter(Boolean).join(" + ");
			var w3 = parts.map(function (p, i) { return fmt(i === 0 ? p * 10 : p); }).join(" + ");
			var w4 = parts.slice().reverse().map(function (p, i) { return fmt(i === 0 && p >= 10 ? p / 10 : p); }).join(" + ");
			var c = choose(R, right, [w1, w2, w3, w4, parts.map(function (p) { return fmt(p * 10); }).join(" + ")]);
			return { type: "mc", q: "Which shows <b>" + fmt(n) + "</b> in expanded form?", choices: c.choices, answer: c.answer, key: "exp" + n,
				explain: "Each digit is worth its place: " + digits.map(function (x, i) { return x + " " + PLACE[len - 1 - i]; }).filter(function (s) { return s[0] !== "0"; }).join(", ") + ". So " + fmt(n) + " = " + right + ".", data: { n: n } };
		}
		var val = d * Math.pow(10, pos), wr = [];
		for (var k = 0; k < Math.max(4, len); k++) if (k !== pos) wr.push(d * Math.pow(10, k));
		var cc = choose(R, val, R.shuffle(wr), { show: fmt });
		return { type: "mc", q: "What is the value of the digit <b>" + d + "</b> in <b>" + fmt(n) + "</b>?", choices: cc.choices, answer: cc.answer, key: "pv" + n + "-" + d,
			explain: "The " + d + " is in the <b>" + PLACE[pos] + "</b> place, so it is worth " + d + " × " + fmt(Math.pow(10, pos)) + " = <b>" + fmt(val) + "</b>.", data: { n: n, d: d, val: val } };
	});
	gen("g4-round", 4, "number", "Rounding", function (R, diff) {
		var place = diff === "easy" ? 10 : diff === "medium" ? 100 : 1000, n;
		do { n = diff === "easy" ? R.int(11, 999) : diff === "medium" ? R.int(101, 9999) : R.int(1001, 99999); } while (n % place === 0);
		var ans = Math.round(n / place) * place, rd = Math.floor(n % place / (place / 10));
		return { type: "num", q: "Round <b>" + fmt(n) + "</b> to the nearest " + fmt(place) + ".", answer: ans, key: "rd" + n + "-" + place,
			explain: "Look at the digit to the right of the " + PLACE[Math.log10(place) | 0] + " place: it is " + rd + ". " + (rd >= 5 ? "5 or more, so round <b>up</b>" : "Less than 5, so round <b>down</b>") + ". " + fmt(n) + " rounds to <b>" + fmt(ans) + "</b>.", data: { n: n, place: place } };
	});
	gen("g4-compare", 4, "number", "Compare and order numbers", function (R, diff) {
		var len = diff === "easy" ? 3 : diff === "medium" ? 4 : 5, digs, set = {}, nums = [];
		do { digs = R.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], len); } while (digs.indexOf(0) >= 0 && diff === "easy");
		var tries = 0;
		while (nums.length < 4 && tries++ < 500) {
			var p = R.shuffle(digs.slice());
			if (p[0] === 0) continue;
			var v = +p.join("");
			if (!set[v]) { set[v] = 1; nums.push(v); }
		}
		var most = R.chance(0.5), ans = most ? Math.max.apply(null, nums) : Math.min.apply(null, nums);
		var c = choose(R, ans, nums.filter(function (x) { return x !== ans; }), { show: fmt });
		return { type: "mc", q: "Which number is the " + (most ? "<b>greatest</b>" : "<b>least</b>") + "?", choices: c.choices, answer: c.answer, key: "cmp" + nums.sort().join(","),
			explain: "Compare the digits from the left. The biggest place where the numbers differ decides. " + nums.slice().sort(function (a, b) { return a - b; }).map(fmt).join(" &lt; ") + ", so the " + (most ? "greatest" : "least") + " is <b>" + fmt(ans) + "</b>.", data: { nums: nums, most: most } };
	});
	gen("g4-numline", 4, "number", "Number lines", function (R, diff) {
		var start, step, n = 10, labelled;
		if (diff === "easy") { start = R.pick([0, 0, 10, 20]); step = 1; labelled = [0, 5, 10]; }
		else if (diff === "medium") { step = R.pick([2, 5, 10]); start = step * R.int(0, 8) * (step === 10 ? 1 : 2); labelled = [0, 10]; }
		else if (R.chance(0.5)) { step = R.pick([25, 50]); start = step * 2 * R.int(0, 6); labelled = [0, 10]; }
		else { step = 0.1; start = R.int(0, 9); labelled = [0, 10]; }
		var at; do { at = R.int(1, 9); } while (labelled.indexOf(at) >= 0);
		var ans = r6(start + at * step);
		return { type: "num", q: "What number is the arrow pointing to?", svg: numberLineSvg(start, step, n, labelled, at), answer: ans, key: "nl" + start + "-" + step + "-" + at,
			explain: "From " + fmt(start) + " to " + fmt(r6(start + n * step)) + " there are " + n + " equal spaces, so each space is " + fmt(r6(n * step)) + " ÷ " + n + " = " + fmt(step) + ". The arrow is " + at + " spaces from " + fmt(start) + ": " + fmt(start) + " + " + at + " × " + fmt(step) + " = <b>" + fmt(ans) + "</b>.", data: { start: start, step: step, at: at } };
	});

	// ---------- Grade 4: operations ----------
	var ADD_T = [
		["{n} has {a} stickers. A friend gives {n} {b} more. How many stickers does {n} have now?", "stickers"],
		["A school library has {a} books. It gets {b} new books. How many books does it have now?", "books"],
		["On Saturday {a} people visited the aquarium. On Sunday {b} people visited. How many people visited on the two days?", "people"],
		["{n} walked {a} steps in the morning and {b} steps in the afternoon. How many steps is that altogether?", "steps"]];
	var SUB_T = [
		["A farmer picked {a} apples and sold {b} of them. How many apples are left?", "apples"],
		["A ferry has {a} seats. {b} seats are taken. How many seats are empty?", "seats"],
		["{n} needs {a} points to win a prize and has {b} points so far. How many more points does {n} need?", "points"],
		["A box held {a} paper clips. The class used {b}. How many paper clips are still in the box?", "paper clips"]];
	function fillT(t, o) { return t.replace(/\{(\w)\}/g, function (m, k) { return o[k] === undefined ? m : (typeof o[k] === "number" ? fmt(o[k]) : o[k]); }); }
	gen("g4-addsub", 4, "ops", "Adding and subtracting", function (R, diff) {
		var nm = R.pick(NAMES), a, b, c;
		if (diff === "hard" && R.chance(0.6)) {
			a = R.int(120, 680); b = R.int(110, 590); c = R.int(150, a + b - 40);
			var ans3 = a + b - c;
			return { type: "num", q: fillT("A bakery made {a} muffins in the morning and {b} more in the afternoon. It sold {c} muffins. How many muffins are left?", { a: a, b: b, c: c }),
				answer: ans3, unit: "muffins", key: "as3-" + a + "-" + b + "-" + c, explain: "Two steps. First add what was made: " + fmt(a) + " + " + fmt(b) + " = " + fmt(a + b) + ". Then take away what was sold: " + fmt(a + b) + " − " + fmt(c) + " = <b>" + fmt(ans3) + "</b>.", data: { a: a, b: b, c: c, op: "as" } };
		}
		var add = R.chance(0.5);
		if (diff === "easy") { a = R.int(12, 68); b = R.int(11, add ? 99 - a : a - 3); }
		else if (diff === "medium") { a = R.int(140, 890); b = add ? R.int(110, 999 - a > 110 ? 999 - a : 110) : R.int(105, a - 20); if (add && b % 10 + a % 10 < 10) b += 5; }
		else { a = R.int(1200, 8900); b = add ? R.int(800, 9999 - a > 800 ? 9999 - a : 800) : R.int(600, a - 100); }
		var T = R.pick(add ? ADD_T : SUB_T), ans = add ? a + b : a - b;
		return { type: "num", q: fillT(T[0], { n: nm, a: a, b: b }), answer: ans, unit: T[1], key: (add ? "add" : "sub") + a + "-" + b,
			explain: (add ? "Put the two amounts together: " + fmt(a) + " + " + fmt(b) : "Take away: " + fmt(a) + " − " + fmt(b)) + " = <b>" + fmt(ans) + "</b>." + (add ? "" : " Check by adding back: " + fmt(ans) + " + " + fmt(b) + " = " + fmt(a) + "."), data: { a: a, b: b, op: add ? "+" : "-" } };
	});
	var MUL_T = [
		["There are {a} boxes. Each box holds {b} crayons. How many crayons are there in all?", "crayons"],
		["A theatre has {a} rows with {b} seats in each row. How many seats are there?", "seats"],
		["{n} reads {b} pages every day for {a} days. How many pages is that?", "pages"],
		["A pack has {b} juice boxes. The class buys {a} packs. How many juice boxes is that?", "juice boxes"]];
	gen("g4-mult", 4, "ops", "Multiplying", function (R, diff) {
		var a, b;
		if (diff === "easy") { a = R.int(2, 5); b = R.int(3, 9); }
		else if (diff === "medium") { a = R.int(6, 9); b = R.int(6, 9); }
		else { a = R.int(3, 9); b = R.int(12, 48); }
		var ans = a * b;
		if (diff === "easy" && R.chance(0.5)) {
			var dots = ""; for (var y = 0; y < a; y++) for (var x = 0; x < b; x++) dots += '<circle cx="' + (14 + x * 24) + '" cy="' + (14 + y * 24) + '" r="8" class="pt-s-acc"/>';
			var c = mcNum(R, ans, [a + b, a * (b + 1), (a + 1) * b, a * b - a]);
			return { type: "mc", q: "Which number sentence matches the dots, and how many dots are there?", svg: svg(b * 24 + 4, a * 24 + 4, dots, a + " rows of dots with " + b + " dots in each row"),
				choices: c.choices.map(function (s) { return a + " × " + b + " = " + s; }), answer: c.answer, key: "arr" + a + "x" + b,
				explain: "There are " + a + " rows with " + b + " dots in each row: " + a + " × " + b + " = <b>" + ans + "</b>.", data: { a: a, b: b } };
		}
		var T = R.pick(MUL_T);
		return { type: "num", q: fillT(T[0], { n: R.pick(NAMES), a: a, b: b }), answer: ans, unit: T[1], key: "mul" + a + "x" + b,
			explain: a + " groups of " + b + " is " + a + " × " + b + " = <b>" + fmt(ans) + "</b>." + (b > 10 ? " Split it up: " + a + " × " + Math.floor(b / 10) * 10 + " = " + a * Math.floor(b / 10) * 10 + " and " + a + " × " + b % 10 + " = " + a * (b % 10) + ", together " + fmt(ans) + "." : ""), data: { a: a, b: b } };
	});
	gen("g4-div", 4, "ops", "Dividing and remainders", function (R, diff) {
		var nm = R.pick(NAMES), b, q, r = 0;
		if (diff === "easy") { b = R.int(2, 5); q = R.int(2, 9); }
		else if (diff === "medium") { b = R.int(6, 9); q = R.int(3, 9); }
		else { b = R.int(3, 8); q = R.int(4, 12); r = R.int(1, b - 1); }
		var n = b * q + r;
		if (!r) {
			var ans = q;
			return { type: "num", q: nm + " shares " + n + " stickers equally among " + b + " friends. How many stickers does each friend get?", answer: ans, unit: "stickers", key: "div" + n + "/" + b,
				explain: n + " ÷ " + b + " = <b>" + q + "</b>, because " + b + " × " + q + " = " + n + ".", data: { n: n, b: b, kind: "share" } };
		}
		var kind = R.pick(["cars", "left", "packs"]), q2, ans2, ex;
		if (kind === "cars") { q2 = n + " students are going on a trip. Each van holds " + b + " students. How many vans are needed so every student can go?"; ans2 = q + 1; ex = n + " ÷ " + b + " = " + q + " remainder " + r + ". " + q + " vans hold " + b * q + " students, but " + r + " more still need a ride, so you need <b>" + ans2 + "</b> vans."; }
		else if (kind === "left") { q2 = nm + " puts " + n + " cookies into bags of " + b + ". How many cookies are left over?"; ans2 = r; ex = n + " ÷ " + b + " = " + q + " remainder " + r + ". " + q + " full bags use " + b * q + " cookies, so <b>" + r + "</b> are left over."; }
		else { q2 = "A store packs " + n + " pencils into boxes of " + b + ". How many boxes can be filled completely?"; ans2 = q; ex = n + " ÷ " + b + " = " + q + " remainder " + r + ", so <b>" + q + "</b> full boxes (the " + r + " extra pencils are not a full box)."; }
		return { type: "num", q: q2, answer: ans2, key: "dr" + kind + n + "/" + b, explain: ex, data: { n: n, b: b, kind: kind } };
	});
	gen("g4-missing", 4, "ops", "Missing numbers", function (R, diff) {
		var a, b, c, s, ans, ex;
		if (diff === "easy") { a = R.int(3, 15); b = R.int(4, 15); c = a + b; s = "☐ + " + b + " = " + c; ans = a; ex = "Think: what plus " + b + " makes " + c + "? " + c + " − " + b + " = <b>" + a + "</b>."; }
		else if (diff === "medium") { a = R.int(14, 70); b = R.int(12, 99 - a); c = a + b; if (R.chance(0.5)) { s = c + " − ☐ = " + a; ans = b; ex = "Think: what can you take away from " + c + " to leave " + a + "? " + c + " − " + a + " = <b>" + b + "</b>, and check: " + c + " − " + b + " = " + a + "."; } else { s = a + " + ☐ = " + c; ans = b; ex = "Find the missing part by subtracting: " + c + " − " + a + " = <b>" + b + "</b>. Check: " + a + " + " + b + " = " + c + "."; } }
		else { a = R.int(3, 9); b = R.int(4, 12); c = a * b; if (R.chance(0.5)) { s = "☐ × " + a + " = " + c; ans = b; ex = c + " ÷ " + a + " = <b>" + b + "</b>, because " + b + " × " + a + " = " + c + "."; } else { s = c + " ÷ ☐ = " + b; ans = a; ex = c + " ÷ " + a + " = " + b + ", so the missing number is <b>" + a + "</b>."; } }
		return { type: "num", q: "What number goes in the box?<div class=\"pt-big\">" + s + "</div>", answer: ans, key: "mis" + s, explain: ex, data: { s: s } };
	});

	// ---------- Grade 4: fractions and decimals ----------
	function fkey(x) { var s = simp(x[0], x[1]); return s[0] + "/" + s[1]; }
	function fshow(x) { return fr(x[0], x[1]); }
	gen("g4-fracshade", 4, "fractions", "Fractions of a shape", function (R, diff) {
		var n = diff === "easy" ? R.pick([2, 3, 4]) : diff === "medium" ? R.int(4, 8) : R.int(6, 12), k = R.int(1, n - 1), not = diff === "hard" && R.chance(0.5);
		var kind = R.pick(["bar", "circle"]), want = not ? n - k : k;
		var c = choose(R, [want, n], [[n - want, n], [want, n - want], [n, want], [want, n + 1], [want + 1, n], [want - 1, n], [want, n - 1]], { key: fkey, show: fshow, ok: function (x) { return x[0] > 0 && x[1] > 0; } });
		return { type: "mc", q: "What fraction of the shape is " + (not ? "<b>not</b> shaded" : "shaded") + "?", svg: fracShapeSvg(n, k, kind), choices: c.choices, answer: c.answer, key: "fs" + n + "-" + k + not,
			explain: "The shape has " + n + " equal parts and " + want + " of them " + (not ? "are not shaded" : "are shaded") + ", so the fraction is " + fr(want, n) + ". The bottom number (denominator) counts all the parts; the top number (numerator) counts the parts you want.", data: { n: n, k: k, not: not } };
	});
	var BASE_F = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [3, 8]];
	gen("g4-fraceq", 4, "fractions", "Equivalent and comparing fractions", function (R, diff) {
		if (diff === "hard") {   // greatest of four fractions
			var fs = [], seen = {};
			while (fs.length < 4) { var d = R.int(2, 12), nn = R.int(1, d - 1), k = fkey([nn, d]); if (!seen[k]) { seen[k] = 1; fs.push([nn, d]); } }
			var best = fs.slice().sort(function (x, y) { return y[0] / y[1] - x[0] / x[1]; })[0];
			var c = choose(R, best, fs.filter(function (x) { return x !== best; }), { key: fkey, show: fshow });
			return { type: "mc", q: "Which fraction is the <b>greatest</b>?", choices: c.choices, answer: c.answer, key: "fg" + fs.map(fkey).sort().join(","),
				explain: "Change each fraction to a decimal (top ÷ bottom) or picture them: " + fs.map(function (x) { return fr(x[0], x[1]) + " ≈ " + (x[0] / x[1]).toFixed(2); }).join(", ") + ". The greatest is <b>" + fr(best[0], best[1]) + "</b>.", data: { fs: fs } };
		}
		var b = R.pick(BASE_F), m = R.int(2, diff === "easy" ? 3 : 5), right = [b[0] * m, b[1] * m];
		var wr = [[b[0] + m, b[1] + m], [b[0] * m, b[1] * m + 1], [b[0] * m + 1, b[1] * m], [b[1], b[0] * m], [b[0], b[1] * m], [b[0] * m, b[1]]];
		var c2 = choose(R, right, wr, { key: fkey, show: fshow, ok: function (x) { return x[0] < x[1]; } });
		return { type: "mc", q: "Which fraction is <b>equal</b> to " + fr(b[0], b[1]) + "?", choices: c2.choices, answer: c2.answer, key: "fe" + b + "-" + m,
			explain: "Multiply the top and the bottom by the same number: " + fr(b[0], b[1]) + " = " + fr(b[0] + " × " + m, b[1] + " × " + m) + " = <b>" + fr(right[0], right[1]) + "</b>. Adding the same number to the top and bottom does <i>not</i> give an equal fraction.", data: { b: b, m: m } };
	});
	gen("g4-decimal", 4, "fractions", "Decimals", function (R, diff) {
		if (diff === "hard") {
			var whole = R.int(0, 3), t = R.int(1, 8), set = [whole + t / 10, whole + (t * 10 + R.int(1, 9)) / 100, whole + R.int(1, 9) / 100 + 0.0, whole + (t + 1) / 100];
			set = set.map(r6); var uniq = {}; set = set.filter(function (x) { if (uniq[x]) return false; uniq[x] = 1; return true; });
			while (set.length < 4) { var x = r6(whole + R.int(1, 99) / 100); if (!uniq[x]) { uniq[x] = 1; set.push(x); } }
			var mx = Math.max.apply(null, set);
			var c = choose(R, mx, set.filter(function (v) { return v !== mx; }), { show: fmt, key: String });
			return { type: "mc", q: "Which decimal is the <b>greatest</b>?", choices: c.choices, answer: c.answer, key: "dg" + set.slice().sort().join(","),
				explain: "Line the numbers up by the decimal point and add zeros so they all have hundredths: " + set.map(function (v) { return v.toFixed(2); }).join(", ") + ". The greatest is <b>" + fmt(mx) + "</b>. A longer decimal is not always bigger.", data: { set: set } };
		}
		var hund = diff === "medium", k = hund ? R.int(11, 99) : R.int(1, 9);
		if (hund && k % 10 === 0) k += 3;
		var ans = hund ? r6(k / 100) : r6(k / 10);
		var c2 = choose(R, ans, hund ? [k / 10, k, k / 1000, r6(k / 100 + 1), r6((k % 10) / 10 + Math.floor(k / 10) / 100)] : [k / 100, k, r6(k / 10 + 1), r6(1 / k)], { show: fmt, key: function (v) { return String(r6(v)); } });
		return { type: "mc", q: "Which decimal means <b>" + (hund ? fr(k, 100) : fr(k, 10)) + "</b> (" + k + (hund ? " hundredths" : " tenths") + ")?", choices: c2.choices, answer: c2.answer, key: "dc" + k + hund,
			explain: (hund ? "Hundredths are two places after the decimal point" : "Tenths are the first place after the decimal point") + ": " + k + (hund ? " hundredths" : " tenths") + " = <b>" + fmt(ans) + "</b>.", data: { k: k, hund: hund } };
	});

	// ---------- Grade 4: money ----------
	var ITEMS = [["a book", 300, 1200], ["a sandwich", 350, 900], ["a juice", 125, 325], ["a notebook", 150, 600], ["a pack of markers", 400, 1100], ["a ball", 250, 1500], ["a bus ticket", 250, 350], ["a muffin", 175, 400], ["a pencil case", 300, 900], ["a comic", 200, 700]];
	gen("g4-change", 4, "money", "Making change", function (R, diff) {
		var n = diff === "easy" ? 1 : diff === "medium" ? 2 : 3, its = R.sample(ITEMS, n), costs, tot, pay;
		costs = its.map(function (it) {
			var lo = Math.ceil(it[1] / 100), hi = Math.floor(it[2] / 100);
			if (diff === "easy") return R.int(lo, hi) * 100;
			var c = R.int(it[1], it[2]); return diff === "medium" ? Math.round(c / 25) * 25 : c;
		});
		tot = costs.reduce(function (s, x) { return s + x; }, 0);
		pay = [500, 1000, 2000, 5000].filter(function (p) { return p > tot; })[0];
		var ans = pay - tot;
		var list = its.map(function (it, i) { return it[0] + " for " + money(costs[i]); });
		var q = R.pick(NAMES) + " buys " + (list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0]) + ", and pays with a " + money(pay).replace(".00", "") + " bill. How much change should " + "they get?";
		return { type: "num", prefix: "$", q: q, answer: ans / 100, tol: 0.001, money: true, key: "chg" + costs.join("-") + "-" + pay,
			explain: (n > 1 ? "Total cost: " + costs.map(money).join(" + ") + " = " + money(tot) + ". " : "") + "Change = " + money(pay) + " − " + money(tot) + " = <b>" + money(ans) + "</b>. You can also count up from " + money(tot) + " to " + money(pay) + ".", data: { costs: costs, pay: pay } };
	});
	gen("g4-coins", 4, "money", "Counting coins", function (R, diff) {
		var kinds = diff === "easy" ? [5, 10, 100] : diff === "medium" ? [5, 10, 25, 100] : [5, 10, 25, 100, 200], count = diff === "easy" ? R.int(3, 5) : diff === "medium" ? R.int(4, 7) : R.int(6, 9), list = [];
		for (var i = 0; i < count; i++) list.push(R.pick(kinds));
		list.sort(function (a, b) { return b - a; });
		var tot = list.reduce(function (s, x) { return s + x; }, 0);
		var steps = [], run = 0; list.forEach(function (v) { run += v; steps.push(money(run)); });
		if (diff === "hard" && R.chance(0.5)) {
			var price = tot + R.int(1, 30) * 5, need = price - tot;
			return { type: "num", prefix: "$", q: "Jin has these coins. A kite costs " + money(price) + ". How much more money does Jin need?", svg: coinsSvg(list), answer: need / 100, tol: 0.001, money: true, key: "cn" + list.join(",") + "-" + price,
				explain: "Count the coins, biggest first: " + steps.join(", ") + ". Jin has " + money(tot) + ". " + money(price) + " − " + money(tot) + " = <b>" + money(need) + "</b>.", data: { list: list, price: price } };
		}
		return { type: "num", prefix: "$", q: "How much money is shown?", svg: coinsSvg(list), answer: tot / 100, tol: 0.001, money: true, key: "cn" + list.join(","),
			explain: "Count on from the biggest coin: " + steps.join(", ") + ". The total is <b>" + money(tot) + "</b>. (Loonie = $1, toonie = $2, quarter = 25¢, dime = 10¢, nickel = 5¢.)", data: { list: list } };
	});

	// ---------- Grade 4: time ----------
	function hhmm(h, m) { return h + ":" + ("0" + m).slice(-2); }
	gen("g4-clock", 4, "time", "Reading a clock", function (R, diff) {
		var h = R.int(1, 12), m = diff === "easy" ? R.pick([0, 30]) : diff === "medium" ? 5 * R.int(1, 11) : R.int(1, 59);
		if (diff === "hard" && m % 5 === 0) m += R.pick([1, 2, 3, 4]);
		m = Math.min(m, 59);
		var right = hhmm(h, m), w = [];
		if (m % 5 === 0 && m > 0) w.push(hhmm(m / 5, (h % 12) * 5));   // hands swapped
		w.push(hhmm(h % 12 + 1, m), hhmm(h === 1 ? 12 : h - 1, m));
		if (m !== 30) w.push(hhmm(h, 60 - m === 60 ? 30 : 60 - m));
		w.push(hhmm(h, (m + 5) % 60), hhmm(h, (m + 55) % 60), hhmm(h % 12 + 1, (m + 30) % 60));
		var c = choose(R, right, w, { ok: function (s) { return +s.split(":")[0] >= 1 && +s.split(":")[0] <= 12; } });
		return { type: "mc", q: "What time does the clock show?", svg: clockSvg(h, m), choices: c.choices, answer: c.answer, key: "clk" + right,
			explain: "The short hand shows the hour: it has passed the " + h + (m ? " but not reached the " + (h % 12 + 1) : "") + ", so the hour is " + h + ". The long hand shows minutes: " + (m === 0 ? "it is on the 12, so 0 minutes" : "count by 5s from the 12" + (m % 5 ? " then add single minutes" : "") + ": " + m + " minutes") + ". The time is <b>" + right + "</b>.", data: { h: h, m: m } };
	});
	gen("g4-elapsed", 4, "time", "Elapsed time", function (R, diff) {
		var start = (R.int(8, 18)) * 60 + (diff === "easy" ? R.pick([0, 30]) : 5 * R.int(0, 11)), dur, ev = R.pick([["A movie", "lasts"], ["A soccer practice", "lasts"], ["A school play", "runs for"], ["A bike ride", "takes"], ["A bread recipe", "takes"]]);
		dur = diff === "easy" ? 30 * R.int(1, 4) : diff === "medium" ? 5 * R.int(4, 11) + (R.chance(0.5) ? 60 : 0) : 5 * R.int(13, 34);
		function dtxt(d) { var h = Math.floor(d / 60), m = d % 60; return (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : ""); }
		if (diff === "hard" && R.chance(0.5)) {
			return { type: "num", unit: "minutes", q: ev[0] + " starts at " + hm(start) + " and ends at " + hm(start + dur) + ". How many minutes long is it?", answer: dur, key: "el2" + start + "-" + dur,
				explain: "Count on from " + hm(start) + ": to the next hour is " + (60 - start % 60) % 60 + " min, then on to " + hm(start + dur) + ". Altogether " + dtxt(dur) + " = <b>" + dur + " minutes</b>.", data: { start: start, dur: dur } };
		}
		var end = start + dur, right = hm(end);
		var c = choose(R, right, [hm(end + 60), hm(end - 60), hm(start + dur % 60), hm(end + 10), hm(end - 10), hm(start + Math.floor(dur / 60) * 100 % 1440)], { ok: function (s) { return true; } });
		return { type: "mc", q: ev[0] + " starts at <b>" + hm(start) + "</b> and " + ev[1] + " <b>" + dtxt(dur) + "</b>. What time does it end?", choices: c.choices, answer: c.answer, key: "el" + start + "-" + dur,
			explain: "Add the hours, then the minutes: " + hm(start) + " + " + dtxt(dur) + " = <b>" + right + "</b>." + ((start % 60) + dur % 60 >= 60 ? " The minutes go past 60, so carry one hour." : ""), data: { start: start, dur: dur } };
	});

	// ---------- Grade 4: measurement ----------
	gen("g4-perimarea", 4, "measure", "Perimeter and area", function (R, diff) {
		if (diff === "hard") {   // L-shape area
			var W = R.int(4, 7), H = R.int(3, 6), cw = R.int(1, W - 2), ch = R.int(1, H - 2), cells = [];
			for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (!(x >= W - cw && y < ch)) cells.push([x, y]);
			var ans = W * H - cw * ch;
			return { type: "num", unit: "square units", q: "Each square is 1 square unit. What is the area of the shaded shape?", svg: gridShapeSvg(cells, W, H, "An L-shaped figure on a square grid made of " + W + " columns and " + H + " rows with a " + cw + " by " + ch + " corner cut out"), answer: ans, key: "L" + W + H + cw + ch,
				explain: "Split it or subtract: the full rectangle is " + W + " × " + H + " = " + W * H + " squares and the missing corner is " + cw + " × " + ch + " = " + cw * ch + ". " + W * H + " − " + cw * ch + " = <b>" + ans + " square units</b>.", data: { W: W, H: H, cw: cw, ch: ch } };
		}
		var w = R.int(2, 8), h = R.int(2, 5), cs = [];
		if (w === h) w++;
		for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) cs.push([xx, yy]);
		var area = diff === "easy";
		var a2 = area ? w * h : 2 * (w + h);
		return { type: "num", unit: area ? "square units" : "cm", q: area ? "Each square is 1 square unit. What is the <b>area</b> of the rectangle?" : "Each square is 1 cm on a side. What is the <b>perimeter</b> of the rectangle?",
			svg: gridShapeSvg(cs, w, h, "A rectangle on a square grid, " + w + " squares long and " + h + " squares tall"), answer: a2, key: (area ? "ar" : "pe") + w + "x" + h,
			explain: area ? "Area counts the squares inside: " + h + " rows of " + w + " = " + h + " × " + w + " = <b>" + a2 + " square units</b>." : "Perimeter is the distance all the way around: " + w + " + " + h + " + " + w + " + " + h + " = <b>" + a2 + " cm</b>. (Area would be " + w * h + " squares, which is a different thing.)", data: { w: w, h: h, area: area } };
	});
	gen("g4-convert", 4, "measure", "Metric units", function (R, diff) {
		var U = diff === "easy" ? [["m", "cm", 100], ["cm", "mm", 10], ["kg", "g", 1000], ["L", "mL", 1000]] : diff === "medium" ? [["cm", "m", 0.01], ["mm", "cm", 0.1], ["g", "kg", 0.001], ["mL", "L", 0.001]] : [["m", "cm", 100], ["kg", "g", 1000], ["L", "mL", 1000], ["km", "m", 1000]];
		var u = R.pick(U), v, ans, q;
		if (diff === "easy") { v = R.int(2, 9); ans = v * u[2]; q = fmt(v) + " " + u[0] + " = ☐ " + u[1]; }
		else if (diff === "medium") { v = R.int(2, 9) / u[2]; ans = r6(v * u[2]); q = fmt(v) + " " + u[0] + " = ☐ " + u[1]; }
		else if (R.chance(0.5)) { v = r6(R.int(11, 49) / 10); ans = r6(v * u[2]); q = fmt(v) + " " + u[0] + " = ☐ " + u[1]; }
		else { var a = R.int(1, 5), b = u[2] === 100 ? R.int(5, 95) : R.int(50, 950); ans = a * u[2] + b; q = a + " " + u[0] + " " + b + " " + u[1] + " = ☐ " + u[1]; v = a; }
		return { type: "num", unit: u[1], q: "Fill in the box.<div class=\"pt-big\">" + q + "</div>", answer: ans, key: "cv" + q,
			explain: "1 " + (u[2] >= 1 ? u[0] + " = " + fmt(u[2]) + " " + u[1] : u[1] + " = " + fmt(r6(1 / u[2])) + " " + u[0]) + ". " + (u[2] >= 1 ? "Going to a smaller unit, multiply: there are more of them." : "Going to a bigger unit, divide: there are fewer of them.") + " Answer: <b>" + fmt(ans) + " " + u[1] + "</b>.", data: { q: q } };
	});

	// ---------- Grade 4: geometry ----------
	var SH2 = ["triangle", "square", "rectangle", "pentagon", "hexagon", "octagon", "rhombus", "trapezoid", "parallelogram"];
	var SOLIDS = [["cube", 6, 12, 8], ["rectangular prism", 6, 12, 8], ["triangular prism", 5, 9, 6], ["square-based pyramid", 5, 8, 5], ["triangular pyramid", 4, 6, 4], ["pentagonal prism", 7, 15, 10]];
	gen("g4-shapes", 4, "geometry", "2-D shapes and 3-D objects", function (R, diff) {
		if ((diff === "easy" && R.chance(0.7)) || (diff === "medium" && R.chance(0.5))) {
			var pool = diff === "easy" ? ["triangle", "square", "rectangle", "pentagon", "hexagon", "octagon"] : SH2, t = R.pick(pool);
			var others = R.shuffle(pool.filter(function (x) { return x !== t && !(t === "square" && x === "rhombus") && !(t === "rhombus" && x === "square") && !(t === "rectangle" && x === "square") && !(t === "parallelogram" && (x === "rectangle" || x === "square" || x === "rhombus")); }));
			var c = choose(R, t, others, { show: function (x) { return polySvg(x, 70); } });
			var SIDES = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, octagon: 8, rhombus: 4, trapezoid: 4, parallelogram: 4 };
			var hint = { triangle: "3 sides", square: "4 equal sides and 4 square corners", rectangle: "4 sides with 4 square corners (two long, two short)", pentagon: "5 sides", hexagon: "6 sides", octagon: "8 sides", rhombus: "4 equal sides, slanted, with no square corners", trapezoid: "4 sides with exactly one pair of parallel sides", parallelogram: "4 sides with two pairs of parallel sides, slanted" }[t];
			return { type: "mc", q: "Which shape is a <b>" + t + "</b>?", choices: c.choices, choiceLabels: c.choices.map(function (s, i) { return "Shape " + (i + 1); }), answer: c.answer, key: "sh" + t + c.choices.length + others.slice(0, 3).join(""),
				explain: "A " + t + " has " + hint + ". Count the sides (" + SIDES[t] + ") and look at the corners.", data: { t: t, sides: SIDES[t] } };
		}
		var s = R.pick(SOLIDS), what = diff !== "hard" ? "faces" : R.pick(["edges", "vertices (corners)"]), ans = what === "faces" ? s[1] : what === "edges" ? s[2] : s[3];
		return { type: "num", q: "How many <b>" + what + "</b> does a " + s[0] + " have?", answer: ans, key: "so" + s[0] + what,
			explain: "A " + s[0] + " has " + s[1] + " faces (flat surfaces), " + s[2] + " edges (where two faces meet) and " + s[3] + " vertices (corners). So the answer is <b>" + ans + "</b>.", data: { s: s[0], what: what } };
	});
	var SYM = [["square", 4, "easy"], ["rectangle", 2, "easy"], ["isosceles triangle", 1, "easy"], ["rhombus", 2, "easy"], ["equilateral triangle", 3, "medium"], ["isosceles trapezoid", 1, "medium"], ["scalene triangle", 0, "medium"], ["parallelogram", 0, "medium"], ["hexagon", 6, "hard"], ["pentagon", 5, "hard"], ["octagon", 8, "hard"], ["parallelogram", 0, "hard"], ["scalene triangle", 0, "hard"]];
	gen("g4-symmetry", 4, "geometry", "Lines of symmetry", function (R, diff) {
		var pool = SYM.filter(function (s) { return s[2] === diff; }), s = R.pick(pool);
		return { type: "num", q: "How many lines of symmetry does this shape have? (A line of symmetry folds the shape into two matching halves.)", svg: polySvg(s[0], 120), answer: s[1], key: "sym" + s[0],
			explain: "This is a" + (/^[aeiou]/.test(s[0]) ? "n " : " ") + s[0] + ". " + (s[1] ? "It can be folded into matching halves in <b>" + s[1] + "</b> way" + (s[1] > 1 ? "s" : "") + "." : "No fold makes the two halves match, so it has <b>0</b> lines of symmetry.") + (s[0] === "rectangle" ? " The diagonals of a rectangle are <i>not</i> lines of symmetry: folding along one does not make the halves match." : s[0] === "rhombus" ? " For a rhombus the two diagonals are the lines of symmetry." : ""), data: { s: s[0] } };
	});

	// ---------- Grade 4: patterns ----------
	gen("g4-pattern", 4, "patterns", "Number patterns", function (R, diff) {
		var a, d, seq = [], ans, ex, q;
		if (diff === "easy") { a = R.int(1, 20); d = R.int(2, 6); for (var i = 0; i < 5; i++) seq.push(a + i * d); ans = a + 5 * d; ex = "The numbers go up by " + d + " each time. " + seq[4] + " + " + d + " = <b>" + ans + "</b>."; q = seq.join(", ") + ", ☐"; }
		else if (diff === "medium") {
			if (R.chance(0.5)) { d = R.int(3, 9); a = R.int(6 * d, 80); for (var j = 0; j < 5; j++) seq.push(a - j * d); ans = a - 5 * d; ex = "The numbers go down by " + d + " each time. " + seq[4] + " − " + d + " = <b>" + ans + "</b>."; q = seq.join(", ") + ", ☐"; }
			else { a = R.int(2, 5); for (var k = 0; k < 5; k++) seq.push(a * Math.pow(2, k)); ans = a * 32; ex = "Each number is double the one before: " + seq[4] + " × 2 = <b>" + ans + "</b>."; q = seq.join(", ") + ", ☐"; }
		} else if (R.chance(0.5)) { a = R.int(2, 15); d = R.int(3, 9); for (var m = 0; m < 4; m++) seq.push(a + m * d); ans = a + 9 * d; ex = "The pattern starts at " + a + " and adds " + d + " each time. The 10th number is " + a + " + 9 × " + d + " = <b>" + ans + "</b> (from the 1st to the 10th number there are 9 jumps)."; q = seq.join(", ") + ", … What is the <b>10th</b> number?"; }
		else { a = R.int(1, 10); var cur = a; seq.push(cur); for (var s = 1; s < 5; s++) { cur += s; seq.push(cur); } ans = cur + 5; ex = "The jumps grow by 1: +1, +2, +3, +4, so the next jump is +5. " + cur + " + 5 = <b>" + ans + "</b>."; q = seq.join(", ") + ", ☐"; }
		return { type: "num", q: "What number comes next in the pattern?<div class=\"pt-big\">" + q + "</div>", answer: ans, key: "pat" + q, explain: ex, data: { seq: seq } };
	});
	function ruleTxt(m, b) { return (m === 1 ? "" : "Multiply by " + m) + (m !== 1 && b ? ", then add " + b : m === 1 ? "Add " + b : ""); }
	gen("g4-rule", 4, "patterns", "Input/output tables", function (R, diff) {
		var m = diff === "easy" ? 1 : diff === "medium" ? R.int(2, 6) : R.int(2, 4), b = diff === "easy" ? R.int(2, 12) : diff === "medium" ? 0 : R.int(1, 6), s = R.int(1, 4), rows = [];
		for (var i = 0; i < 4; i++) rows.push([s + i, m * (s + i) + b]);
		var tbl = tableHtml(["Input", "Output"], rows);
		if (diff === "medium") {
			var right = ruleTxt(m, 0), w = [ruleTxt(1, rows[0][1] - rows[0][0]), ruleTxt(1, m), ruleTxt(m + 1, 0), ruleTxt(m - 1 || 3, 0), ruleTxt(1, rows[1][1] - rows[0][1])];
			var c = choose(R, right, w);
			return { type: "mc", q: "What is the rule for this table?", html: tbl, choices: c.choices, answer: c.answer, key: "rule" + m + "-" + s,
				explain: "Check the rule on every row, not just one: " + rows.map(function (r) { return r[0] + " × " + m + " = " + r[1]; }).join(", ") + ". The rule is <b>" + right + "</b>.", data: { m: m, b: b, rows: rows } };
		}
		var x = s + R.int(5, 8), ans = m * x + b;
		return { type: "num", q: "The table follows a rule. What is the output when the input is <b>" + x + "</b>?", html: tbl, answer: ans, key: "rt" + m + "-" + b + "-" + s + "-" + x,
			explain: "The rule is \"" + ruleTxt(m, b) + "\" (check: " + rows[0][0] + " → " + rows[0][1] + "). For " + x + ": " + (m > 1 ? x + " × " + m + (b ? " + " + b : "") : x + " + " + b) + " = <b>" + ans + "</b>.", data: { m: m, b: b, x: x } };
	});

	// ---------- Grade 4: data and chance ----------
	var CATSETS = [["Favourite fruit", "Students", ["Apple", "Banana", "Grapes", "Mango", "Pear"]], ["Favourite sport", "Students", ["Soccer", "Hockey", "Swimming", "Basketball", "Tennis"]],
		["Pets in our class", "Pets", ["Dogs", "Cats", "Fish", "Birds", "Rabbits"]], ["Books read in May", "Books", ["Ana", "Ben", "Cody", "Dev", "Eli"]], ["Weather in April", "Days", ["Sunny", "Rainy", "Cloudy", "Snowy"]]];
	gen("g4-bars", 4, "data", "Reading bar graphs", function (R, diff) {
		var set = R.pick(CATSETS), n = Math.min(set[2].length, diff === "easy" ? 4 : 5), cats = set[2].slice(0, n), step = diff === "easy" ? 1 : diff === "medium" ? 2 : 5, vals = [], used = {};
		while (vals.length < n) { var v = step * R.int(1, diff === "easy" ? 9 : 10); if (!used[v]) { used[v] = 1; vals.push(v); } }
		var g = barGraphSvg(cats, vals, step, set[0], set[1]), i = R.int(0, n - 1), j, q, ans, ex;
		do { j = R.int(0, n - 1); } while (j === i);
		if (diff === "easy") { q = "How many " + (set[1] === "Students" ? "students chose " : set[1] === "Pets" ? "" : "") + "<b>" + cats[i] + "</b>" + (set[1] === "Days" ? " days were there" : set[1] === "Books" ? " read" : "") + "?"; ans = vals[i]; ex = "Go to the top of the " + cats[i] + " bar and read across to the scale: <b>" + ans + "</b>."; if (set[1] === "Books") q = "How many books did <b>" + cats[i] + "</b> read?"; if (set[1] === "Pets") q = "How many <b>" + cats[i].toLowerCase() + "</b> are there?"; if (set[1] === "Students") q = "How many students chose <b>" + cats[i] + "</b>?"; if (set[1] === "Days") q = "How many days were <b>" + cats[i].toLowerCase() + "</b>?"; }
		else if (diff === "medium") { var hi = vals[i] > vals[j] ? i : j, lo = hi === i ? j : i; q = "How many more for <b>" + cats[hi] + "</b> than for <b>" + cats[lo] + "</b>?"; ans = vals[hi] - vals[lo]; ex = "Each line on the scale counts " + step + ". " + cats[hi] + " = " + vals[hi] + " and " + cats[lo] + " = " + vals[lo] + ". " + vals[hi] + " − " + vals[lo] + " = <b>" + ans + "</b>."; }
		else { ans = vals.reduce(function (s, x) { return s + x; }, 0); q = "What is the <b>total</b> for all the bars?"; ex = "Read every bar (the scale goes up by " + step + "): " + vals.join(" + ") + " = <b>" + ans + "</b>."; }
		return { type: "num", q: q, svg: g, answer: ans, key: "bar" + set[0] + vals.join(",") + q.length, explain: ex, data: { vals: vals, cats: cats } };
	});
	gen("g4-picto", 4, "data", "Pictographs", function (R, diff) {
		var key = diff === "easy" ? 2 : diff === "medium" ? R.pick([5, 10]) : R.pick([4, 10]), days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], counts = [];
		for (var i = 0; i < 5; i++) counts.push(R.int(1, 7) + (diff === "hard" && R.chance(0.5) ? 0.5 : 0));
		var cell = function (c) { var s = ""; for (var k = 0; k < Math.floor(c); k++) s += '<circle cx="' + (12 + k * 24) + '" cy="12" r="10" class="pt-s-acc"/>'; if (c % 1) s += '<path d="M' + (12 + Math.floor(c) * 24) + ' 2 A10 10 0 0 0 ' + (12 + Math.floor(c) * 24) + ' 22 Z" class="pt-s-acc"/>'; return svg(Math.ceil(c) * 24 + 2, 24, s, c + " circles"); };
		var tbl = tableHtml(["Day", "Hot lunches sold"], days.map(function (d, i) { return [d, cell(counts[i])]; }), "pt-picto") + '<p class="pt-keyline">Key: ' + svg(24, 24, '<circle cx="12" cy="12" r="10" class="pt-s-acc"/>', "one circle") + " = " + key + " lunches" + (diff === "hard" ? " (half a circle = " + key / 2 + ")" : "") + "</p>";
		var d = R.int(0, 4), ans = counts[d] * key;
		return { type: "num", q: "How many hot lunches were sold on <b>" + days[d] + "</b>?", html: tbl, answer: ans, unit: "lunches", key: "pic" + key + counts.join(",") + d,
			explain: days[d] + " has " + counts[d] + " circles and each circle means " + key + ". " + counts[d] + " × " + key + " = <b>" + ans + "</b>.", data: { key: key, counts: counts, d: d } };
	});
	var COLS = [["red", "R"], ["blue", "B"], ["green", "G"], ["yellow", "Y"]];
	function marblesSvg(counts) {
		var b = "", x = 0, list = [];
		counts.forEach(function (n, i) { for (var k = 0; k < n; k++) list.push(i); });
		list.forEach(function (ci, k) { var cx = 16 + (k % 10) * 30, cy = 16 + Math.floor(k / 10) * 30; b += '<circle cx="' + cx + '" cy="' + cy + '" r="12" class="pt-s-m' + ci + '"/>' + text(cx, cy + 4, COLS[ci][1], "pt-s-text pt-s-small pt-s-mtx"); x = Math.max(x, cx); });
		return svg(Math.min(list.length, 10) * 30 + 4, Math.ceil(list.length / 10) * 30 + 4, b, "Marbles in a bag: " + counts.map(function (n, i) { return n + " " + COLS[i][0]; }).filter(function (s) { return s[0] !== "0"; }).join(", ") + ".");
	}
	gen("g4-chance", 4, "data", "Chance", function (R, diff) {
		var counts, tot;
		if (diff !== "hard") {
			var vals = R.sample([1, 2, 3, 4, 5, 6, 7], 4); counts = vals; tot = vals.reduce(function (s, x) { return s + x; }, 0);
			var most = diff === "easy", idx = counts.indexOf(most ? Math.max.apply(null, counts) : Math.min.apply(null, counts));
			var c = choose(R, idx, [0, 1, 2, 3].filter(function (x) { return x !== idx; }), { show: function (i) { return cap(COLS[i][0]); } });
			return { type: "mc", q: "You pick one marble from the bag without looking. Which colour are you <b>" + (most ? "most" : "least") + " likely</b> to pick?", svg: marblesSvg(counts), choices: c.choices, answer: c.answer, key: "ch" + counts.join(",") + most,
				explain: "The colour with the " + (most ? "most" : "fewest") + " marbles is the " + (most ? "most" : "least") + " likely: " + counts.map(function (n, i) { return COLS[i][0] + " " + n; }).join(", ") + ". So <b>" + COLS[idx][0] + "</b>.", data: { counts: counts, most: most } };
		}
		counts = [R.int(0, 6), R.int(0, 6), R.int(0, 5), 0]; if (counts[0] + counts[1] + counts[2] < 3) counts[0] += 3;
		tot = counts[0] + counts[1] + counts[2];
		var evs = [["a purple marble", 0], ["a red marble", counts[0]], ["a blue marble", counts[1]], ["a marble that is red, blue or green", tot], ["a marble that is not green", counts[0] + counts[1]]];
		var e = R.pick(evs.filter(function (x) { return 2 * x[1] !== tot; })), word = e[1] === 0 ? "impossible" : e[1] === tot ? "certain" : 2 * e[1] > tot ? "likely" : "unlikely";
		var c2 = choose(R, word, R.shuffle(["impossible", "unlikely", "likely", "certain"].filter(function (w) { return w !== word; })), { show: cap });
		return { type: "mc", q: "You pick one marble without looking. How likely is it that you get <b>" + e[0] + "</b>?", svg: marblesSvg(counts), choices: c2.choices, answer: c2.answer, key: "chw" + counts.join(",") + e[0],
			explain: e[1] + " of the " + tot + " marbles " + (e[1] === 1 ? "is" : "are") + " " + e[0].replace(/^an? /, "").replace(/ marble/, "") + ". " + (word === "impossible" ? "None can be picked, so it is <b>impossible</b>." : word === "certain" ? "Every marble counts, so it is <b>certain</b>." : (word === "likely" ? "More than half" : "Less than half") + " of the marbles, so it is <b>" + word + "</b>."), data: { counts: counts, e: e[0], n: e[1], tot: tot } };
	});

	// ---------- Grade 7: integers ----------
	gen("g7-int", 7, "integers", "Integers", function (R, diff) {
		var a, b, ans, q, ex;
		if (diff === "easy") {
			a = -R.int(2, 15); b = R.int(3, 25);
			var town = R.pick(["Prince George", "Fort St. John", "Whitehorse", "Kamloops", "Smithers"]);
			ans = a + b; q = "At 6 a.m. the temperature in " + town + " was " + MINUS + Math.abs(a) + " °C. By noon it had risen " + b + " degrees. What was the temperature at noon?";
			return { type: "num", unit: "°C", q: q, answer: ans, neg: true, key: "ti" + a + "+" + b, explain: "Start at " + MINUS + Math.abs(a) + " and move " + b + " up the number line: " + neg(a) + " + " + b + " = <b>" + fmt(ans) + " °C</b>.", data: { a: a, b: b } };
		}
		if (diff === "medium") {
			a = R.int(-12, 12); b = R.int(-12, 12); if (!b) b = -5;
			var sub = R.chance(0.5); ans = sub ? a - b : a + b;
			ex = sub ? "Subtracting is adding the opposite: " + neg(a) + " − " + neg(b) + " = " + neg(a) + " + " + neg(-b) + " = <b>" + fmt(ans) + "</b>." : "Combine on the number line: start at " + fmt(a) + " and move " + Math.abs(b) + (b > 0 ? " right" : " left") + " to <b>" + fmt(ans) + "</b>.";
			return { type: "num", q: "Calculate.<div class=\"pt-big\">" + neg(a) + (sub ? " − " : " + ") + neg(b) + "</div>", answer: ans, neg: true, key: "ia" + a + (sub ? "-" : "+") + b, explain: ex, data: { a: a, b: b, sub: sub } };
		}
		a = R.int(2, 9) * R.pick([1, -1]); b = R.int(2, 9) * R.pick([1, -1]); if (a > 0 && b > 0) a = -a;
		var mul = R.chance(0.5);
		if (mul) { ans = a * b; q = neg(a) + " × " + neg(b); ex = "Multiply the sizes: " + Math.abs(a) + " × " + Math.abs(b) + " = " + Math.abs(ans) + ". " + (a < 0 && b < 0 ? "Two negatives make a positive" : "One negative makes the answer negative") + ": <b>" + fmt(ans) + "</b>."; }
		else { var p = a * b; ans = a; q = neg(p) + " ÷ " + neg(b); ex = "Divide the sizes: " + Math.abs(p) + " ÷ " + Math.abs(b) + " = " + Math.abs(a) + ". " + ((p < 0) === (b < 0) ? "Same signs give a positive" : "Different signs give a negative") + ": <b>" + fmt(ans) + "</b>."; }
		return { type: "num", q: "Calculate.<div class=\"pt-big\">" + q + "</div>", answer: ans, neg: true, key: "im" + q, explain: ex, data: { q: q } };
	});
	gen("g7-intline", 7, "integers", "Integers on a number line", function (R, diff) {
		var step = diff === "easy" ? 1 : diff === "medium" ? 2 : 5, start = -step * R.int(5, 9), at;
		var labelled = diff === "easy" ? [0, 5, 10] : [0, 10];
		do { at = R.int(1, 9); } while (labelled.indexOf(at) >= 0 || start + at * step === 0);
		var ans = start + at * step;
		return { type: "num", q: "What integer is the arrow pointing to?", svg: numberLineSvg(start, step, 10, labelled, at), answer: ans, neg: true, key: "inl" + start + step + at,
			explain: "From " + fmt(start) + " to " + fmt(start + 10 * step) + " there are 10 equal spaces of " + step + ". The arrow is " + at + " spaces right of " + fmt(start) + ": " + fmt(start) + " + " + at * step + " = <b>" + fmt(ans) + "</b>.", data: { start: start, step: step, at: at } };
	});
	gen("g7-order", 7, "number", "Order of operations", function (R, diff) {
		var a = R.int(2, 9), b = R.int(2, 9), c = R.int(2, 9), d, s, ans, ex;
		if (diff === "easy") { s = a + " + " + b + " × " + c; ans = a + b * c; ex = "Multiply before adding: " + b + " × " + c + " = " + b * c + ", then " + a + " + " + b * c + " = <b>" + ans + "</b>. (Left to right would wrongly give " + (a + b) * c + ".)"; }
		else if (diff === "medium") { d = R.int(1, c - 1 > 0 ? c - 1 : 1); if (d >= c) d = 1; c += d; s = "(" + a + " + " + b + ") × (" + c + " − " + d + ")"; ans = (a + b) * (c - d); ex = "Brackets first: " + (a + b) + " and " + (c - d) + ". Then " + (a + b) + " × " + (c - d) + " = <b>" + ans + "</b>."; }
		else { d = R.int(2, 6); var e = d * R.int(2, 6), f = R.int(1, 4); s = a + "² + " + e + " ÷ " + d + " × " + f + " − " + b; ans = a * a + e / d * f - b; ex = "Exponents first: " + a + "² = " + a * a + ". Then × and ÷ from left to right: " + e + " ÷ " + d + " = " + e / d + ", × " + f + " = " + e / d * f + ". Then + and − from left to right: " + a * a + " + " + e / d * f + " − " + b + " = <b>" + ans + "</b>."; }
		return { type: "num", q: "What is the value?<div class=\"pt-big\">" + s + "</div>", answer: ans, neg: true, key: "oo" + s, explain: ex, data: { s: s } };
	});

	// ---------- Grade 7: decimals and percent ----------
	gen("g7-decimal", 7, "decimals", "Decimals in real life", function (R, diff) {
		var nm = R.pick(NAMES), ans, q, ex, k;
		if (diff === "easy") { var x = R.int(105, 899), y = R.int(105, 899); ans = (x + y) / 100; q = nm + " buys a sandwich for " + money(x) + " and a drink for " + money(y) + ". What is the total cost?"; ex = "Line up the decimal points: " + money(x) + " + " + money(y) + " = <b>" + money(x + y) + "</b>."; k = "da" + x + "-" + y; return { type: "num", prefix: "$", money: true, tol: 0.001, q: q, answer: ans, key: k, explain: ex, data: { x: x, y: y } }; }
		if (diff === "medium") { var p = R.int(115, 495), n = R.int(3, 8); ans = p * n / 100; q = "One notebook costs " + money(p) + ". How much do " + n + " notebooks cost?"; ex = money(p) + " × " + n + " = <b>" + money(p * n) + "</b>. (Estimate first: about " + money(Math.round(p / 100) * 100) + " × " + n + " = " + money(Math.round(p / 100) * 100 * n) + ".)"; return { type: "num", prefix: "$", money: true, tol: 0.001, q: q, answer: ans, key: "dm" + p + "x" + n, explain: ex, data: { p: p, n: n } }; }
		var per = R.int(125, 975), m = R.int(3, 8), tot = per * m;
		if (R.chance(0.5)) { ans = per / 100; q = m + " friends share a bill of " + money(tot) + " equally. How much does each person pay?"; ex = money(tot) + " ÷ " + m + " = <b>" + money(per) + "</b>. Check: " + money(per) + " × " + m + " = " + money(tot) + "."; return { type: "num", prefix: "$", money: true, tol: 0.001, q: q, answer: ans, key: "dd" + tot + "/" + m, explain: ex, data: { tot: tot, m: m } }; }
		var kg = R.int(12, 48) / 10, kg2 = R.int(5, 39) / 100; ans = r6(kg - kg2);
		return { type: "num", unit: "kg", q: "A bag of rice weighs " + fmt(kg) + " kg. " + nm + " uses " + fmt(kg2) + " kg. How much rice is left?", answer: ans, key: "dk" + kg + "-" + kg2,
			explain: "Write both with two decimal places: " + kg.toFixed(2) + " − " + kg2.toFixed(2) + " = <b>" + fmt(ans) + " kg</b>.", data: { kg: kg, kg2: kg2 } };
	});
	gen("g7-percent", 7, "decimals", "Percent", function (R, diff) {
		if (diff === "easy") {
			var p = R.pick([10, 20, 25, 50, 75]), base = R.int(2, 20) * (p === 25 || p === 75 ? 4 : p === 20 ? 5 : 10), ans = base * p / 100;
			return { type: "num", q: "What is <b>" + p + "%</b> of <b>" + base + "</b>?", answer: ans, key: "pc" + p + "of" + base,
				explain: p + "% means " + p + " out of 100, or " + fr(p, 100) + (p === 25 ? " = one quarter" : p === 50 ? " = one half" : p === 10 ? " = one tenth" : "") + ". " + base + " × " + p + " ÷ 100 = <b>" + fmt(ans) + "</b>.", data: { p: p, base: base } };
		}
		if (diff === "medium") {
			var off = R.pick([10, 15, 20, 25, 30, 40]), price = R.int(4, 30) * 100 * (off === 15 ? 4 : 1), save = price * off / 100, sale = price - save, item = R.pick(["hoodie", "pair of shoes", "skateboard", "board game", "backpack"]);
			return { type: "num", prefix: "$", money: true, tol: 0.001, q: "A " + item + " costs " + money(price) + ". It is on sale for <b>" + off + "% off</b>. What is the sale price?", answer: sale / 100, key: "pd" + price + "-" + off,
				explain: "The discount is " + off + "% of " + money(price) + " = " + money(save) + ". Sale price = " + money(price) + " − " + money(save) + " = <b>" + money(sale) + "</b>. (Or pay " + (100 - off) + "%: " + money(price) + " × " + (100 - off) / 100 + ".)", data: { price: price, off: off } };
		}
		if (R.chance(0.5)) {
			var pr = R.int(8, 80) * 25, tax = pr * 12 / 100, it = R.pick(["bike helmet", "pair of headphones", "lamp", "jacket"]);
			return { type: "num", prefix: "$", money: true, tol: 0.001, q: "In B.C., most things have 5% GST and 7% PST, so 12% tax altogether. A " + it + " costs " + money(pr) + " before tax. What is the total with tax?", answer: (pr + tax) / 100, key: "pt" + pr,
				explain: "Tax = 12% of " + money(pr) + " = " + money(pr) + " × 0.12 = " + money(tax) + ". Total = " + money(pr) + " + " + money(tax) + " = <b>" + money(pr + tax) + "</b>.", data: { pr: pr } };
		}
		var old = R.int(4, 40) * 5, pct = R.pick([10, 20, 30, 40, 50, 60]), nw = old + old * pct / 100;
		if (nw % 1) { old *= 2; nw = old + old * pct / 100; }
		return { type: "num", unit: "%", q: "A club had " + old + " members last year and has " + nw + " members this year. By what <b>percent</b> did it grow?", answer: pct, key: "pg" + old + "-" + nw,
			explain: "Growth = " + nw + " − " + old + " = " + (nw - old) + ". Percent = " + (nw - old) + " ÷ " + old + " × 100 = <b>" + pct + "%</b>. Always divide by the <i>starting</i> amount.", data: { old: old, nw: nw } };
	});

	// ---------- Grade 7: fractions ----------
	gen("g7-fracops", 7, "fractions", "Adding and subtracting fractions", function (R, diff) {
		var a, b, c, d, sub, rn, rd, s, ex;
		if (diff === "easy") { d = b = R.int(5, 12); a = R.int(1, b - 2); c = R.int(1, b - a - 1); sub = false; }
		else { do { b = R.int(2, 9); d = R.int(2, 9); } while (b === d); a = R.int(1, b - 1); c = R.int(1, d - 1); sub = diff === "hard" || R.chance(0.4); if (sub && a / b < c / d) { var t = a; a = c; c = t; t = b; b = d; d = t; } }
		rn = sub ? a * d - c * b : a * d + c * b; rd = b * d; s = simp(rn, rd);
		if (rn === 0) { c = Math.max(1, c - 1); return this.make(R, diff); }
		var right = [s[0], s[1]], wr = [[sub ? a - c : a + c, b + d], [sub ? a - c : a + c, b * d], [rn, rd + 1], [s[0] + 1, s[1]], [s[0], s[1] + 1], [Math.abs(s[0] - 1), s[1]], [sub ? Math.abs(a * d - c) : a * d + c, b * d]];
		var cc = choose(R, right, wr, { key: fkey, show: function (x) { return frS(x[0], x[1]); }, ok: function (x) { return x[0] > 0 && x[1] > 0; } });
		var lcd = b * d / gcd(b, d);
		ex = b === d ? "The denominators are the same, so add the numerators: " + a + " + " + c + " = " + (a + c) + ". " + fr(a + c, b) + (s[1] !== b ? " = <b>" + frS(s[0], s[1]) + "</b> in lowest terms." : " = <b>" + frS(s[0], s[1]) + "</b>.") :
			"Use a common denominator, " + lcd + ": " + fr(a, b) + " = " + fr(a * lcd / b, lcd) + " and " + fr(c, d) + " = " + fr(c * lcd / d, lcd) + ". Then " + (a * lcd / b) + (sub ? " − " : " + ") + (c * lcd / d) + " = " + (sub ? a * lcd / b - c * lcd / d : a * lcd / b + c * lcd / d) + ", so the answer is <b>" + frS(s[0], s[1]) + "</b>" + (s[1] > 0 && s[0] > s[1] ? " (an improper fraction; = " + Math.floor(s[0] / s[1]) + " and " + fr(s[0] % s[1], s[1]) + ")" : "") + ". Never add the denominators.";
		return { type: "mc", q: "What is the answer in lowest terms?<div class=\"pt-big\">" + fr(a, b) + (sub ? " − " : " + ") + fr(c, d) + "</div>", choices: cc.choices, answer: cc.answer, key: "fo" + a + "/" + b + (sub ? "-" : "+") + c + "/" + d,
			explain: ex, data: { a: a, b: b, c: c, d: d, sub: sub, ans: right } };
	});
	gen("g7-fdp", 7, "fractions", "Fractions, decimals and percents", function (R, diff) {
		var F = [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 8], [3, 8], [5, 8], [7, 8], [1, 10], [3, 10], [7, 10], [9, 10], [3, 20], [7, 20], [9, 20], [11, 20], [3, 25], [7, 25], [12, 25], [1, 20]];
		var f = R.pick(F), dec = r6(f[0] / f[1]);
		if (diff === "easy") {
			var c = choose(R, dec, [r6(f[0] / 10), r6(f[1] / 100), r6(f[0] + f[1] / 10), r6(f[0] / f[1] * 10), r6(f[1] / f[0] / 10), r6(dec + 0.1)], { show: fmt, key: function (x) { return String(r6(x)); }, ok: function (x) { return x > 0; } });
			return { type: "mc", q: "Which decimal is equal to " + fr(f[0], f[1]) + "?", choices: c.choices, answer: c.answer, key: "fd" + f,
				explain: "Divide the top by the bottom: " + f[0] + " ÷ " + f[1] + " = <b>" + fmt(dec) + "</b>." + (100 % f[1] === 0 ? " Or make the bottom 100: " + fr(f[0], f[1]) + " = " + fr(f[0] * 100 / f[1], 100) + "." : ""), data: { f: f } };
		}
		if (diff === "medium") return { type: "num", unit: "%", q: "Write " + fr(f[0], f[1]) + " as a <b>percent</b>.", answer: r6(dec * 100), key: "fp" + f,
			explain: f[0] + " ÷ " + f[1] + " = " + fmt(dec) + ", and " + fmt(dec) + " × 100 = <b>" + fmt(r6(dec * 100)) + "%</b>.", data: { f: f } };
		var pool = R.sample(F, 3), vals = [{ s: fr(pool[0][0], pool[0][1]), v: pool[0][0] / pool[0][1] }, { s: fmt(r6(pool[1][0] / pool[1][1])), v: pool[1][0] / pool[1][1] }, { s: fmt(r6(pool[2][0] / pool[2][1] * 100)) + "%", v: pool[2][0] / pool[2][1] }];
		var fourth = R.int(5, 95); vals.push({ s: fourth + "%", v: fourth / 100 });
		var uniq = {}; if (vals.some(function (x) { var k = r6(x.v); if (uniq[k]) return true; uniq[k] = 1; return false; })) return this.make(R, diff);
		var best = vals.slice().sort(function (x, y) { return y.v - x.v; })[0];
		var c3 = choose(R, best, vals.filter(function (x) { return x !== best; }), { key: function (x) { return x.s; }, show: function (x) { return x.s; } });
		return { type: "mc", q: "Which of these is the <b>greatest</b>?", choices: c3.choices, answer: c3.answer, key: "fg" + vals.map(function (x) { return x.v; }).sort().join(","),
			explain: "Change them all to percents: " + vals.map(function (x) { return x.s + " = " + fmt(r6(x.v * 100)) + "%"; }).join(", ") + ". The greatest is <b>" + best.s + "</b>.", data: { vals: vals.map(function (x) { return x.v; }) } };
	});

	// ---------- Grade 7: ratio and rate ----------
	gen("g7-ratio", 7, "ratios", "Ratios", function (R, diff) {
		if (diff === "easy") {
			var a = R.int(2, 9), b = R.int(2, 9), k = R.int(2, 4); while (gcd(a, b) !== 1 || a === b) { a = R.int(2, 9); b = R.int(2, 9); }
			var A = a * k, B = b * k, things = R.pick([["cats", "dogs"], ["red beads", "blue beads"], ["girls", "boys"], ["apples", "oranges"]]);
			var c = choose(R, a + ":" + b, [b + ":" + a, A + ":" + (A + B), a + ":" + (a + b), (a + 1) + ":" + b, a + ":" + (b + 1), A + ":" + B]
				.filter(function (s) { var p = s.split(":"); return +p[0] * b !== +p[1] * a; }));
			return { type: "mc", q: "There are " + A + " " + things[0] + " and " + B + " " + things[1] + ". What is the ratio of " + things[0] + " to " + things[1] + " in lowest terms?", choices: c.choices, answer: c.answer, key: "ra" + A + ":" + B,
				explain: things[0] + " : " + things[1] + " = " + A + " : " + B + ". Divide both by " + k + ": <b>" + a + ":" + b + "</b>. Order matters: the first word named goes first.", data: { A: A, B: B } };
		}
		var r1 = R.int(2, 7), r2_ = R.int(2, 9), m = R.int(3, 9); while (r1 === r2_) r2_ = R.int(2, 9);
		if (diff === "medium") {
			var cups = R.pick([["flour", "sugar"], ["water", "juice concentrate"], ["oats", "raisins"]]);
			return { type: "num", unit: "cups", q: "A recipe uses " + cups[0] + " and " + cups[1] + " in the ratio <b>" + r1 + ":" + r2_ + "</b>. If you use " + r2_ * m + " cups of " + cups[1] + ", how many cups of " + cups[0] + " do you need?", answer: r1 * m, key: "rr" + r1 + r2_ + m,
				explain: r2_ * m + " cups of " + cups[1] + " is " + m + " times " + r2_ + ". Multiply the other part by " + m + " too: " + r1 + " × " + m + " = <b>" + r1 * m + " cups</b>.", data: { r1: r1, r2: r2_, m: m } };
		}
		var tot = (r1 + r2_) * m;
		return { type: "num", q: "A class of " + tot + " students voted for a field-trip choice. The ratio of votes for the museum to votes for the beach was <b>" + r1 + ":" + r2_ + "</b>. How many students voted for the <b>beach</b>?", answer: r2_ * m, unit: "students", key: "rt" + r1 + r2_ + m,
			explain: "The ratio has " + r1 + " + " + r2_ + " = " + (r1 + r2_) + " parts. Each part is " + tot + " ÷ " + (r1 + r2_) + " = " + m + " students. Beach = " + r2_ + " × " + m + " = <b>" + r2_ * m + "</b>.", data: { r1: r1, r2: r2_, m: m } };
	});
	gen("g7-rate", 7, "ratios", "Unit rates and better buys", function (R, diff) {
		if (diff === "easy") {
			var n = R.int(3, 8), each = R.int(45, 380), tot = n * each, thing = R.pick(["granola bars", "pencils", "tennis balls", "bagels"]);
			return { type: "num", prefix: "$", money: true, tol: 0.001, q: "A pack of " + n + " " + thing + " costs " + money(tot) + ". What is the price of <b>one</b>?", answer: each / 100, key: "ur" + n + "-" + tot,
				explain: "Unit price = total ÷ number = " + money(tot) + " ÷ " + n + " = <b>" + money(each) + "</b> each.", data: { n: n, tot: tot } };
		}
		if (diff === "medium") {
			var n1 = R.int(3, 6), n2 = n1 + R.int(2, 6), u1 = R.int(60, 150), u2 = u1 + R.pick([-1, 1]) * R.int(4, 20);
			var p1 = n1 * u1, p2 = n2 * u2, better = u1 < u2 ? 0 : 1;
			var opts = ["Pack A: " + n1 + " for " + money(p1), "Pack B: " + n2 + " for " + money(p2), "They cost the same per item", "You can't tell without more information"];
			var c = choose(R, better, [1 - better, 2, 3], { show: function (i) { return opts[i]; } });
			return { type: "mc", q: "Juice boxes come in two packs. Which is the <b>better buy</b> (lower price for each juice box)?", choices: c.choices, answer: c.answer, key: "bb" + p1 + "-" + p2,
				explain: "Find the price for one: Pack A " + money(p1) + " ÷ " + n1 + " = " + money(u1) + ", Pack B " + money(p2) + " ÷ " + n2 + " = " + money(u2) + ". <b>Pack " + "AB"[better] + "</b> costs less per box.", data: { n1: n1, p1: p1, n2: n2, p2: p2 } };
		}
		var h = R.pick([1.5, 2, 2.5, 3, 4, 0.5]), sp = R.int(4, 22) * 5 * (h === 0.5 ? 2 : 1), dist = sp * h;
		return { type: "num", unit: "km/h", q: "A car travels " + fmt(dist) + " km in " + fmt(h) + " hours at a steady speed. What is its speed in km per hour?", answer: sp, key: "sp" + dist + "-" + h,
			explain: "Speed = distance ÷ time = " + fmt(dist) + " ÷ " + fmt(h) + " = <b>" + sp + " km/h</b>.", data: { dist: dist, h: h } };
	});

	// ---------- Grade 7: patterns and equations ----------
	gen("g7-eq", 7, "algebra", "Solving equations", function (R, diff) {
		var x = R.int(diff === "hard" ? -9 : 2, 15), a, b, c, s, ex;
		if (!x) x = 4;
		if (diff === "easy") { a = R.int(3, 30); if (R.chance(0.5)) { s = "x + " + a + " = " + (x + a); ex = "Undo + " + a + " by subtracting " + a + " from both sides: x = " + (x + a) + " − " + a + " = <b>" + x + "</b>."; } else { a = R.int(2, 9); s = a + "x = " + a * x; ex = "Undo × " + a + " by dividing both sides by " + a + ": x = " + a * x + " ÷ " + a + " = <b>" + x + "</b>."; } }
		else if (diff === "medium") { a = R.int(2, 9); b = R.int(1, 20); var minus = R.chance(0.4); s = a + "x " + (minus ? "− " : "+ ") + b + " = " + (minus ? a * x - b : a * x + b); ex = (minus ? "Add " + b : "Subtract " + b) + " from both sides: " + a + "x = " + a * x + ". Divide by " + a + ": x = <b>" + x + "</b>. Check: " + a + " × " + x + (minus ? " − " : " + ") + b + " = " + (minus ? a * x - b : a * x + b) + "."; }
		else { a = R.int(3, 9); c = R.int(1, a - 1); b = R.int(-12, 12); var rhs = a * x + b - c * x; s = a + "x " + (b < 0 ? "− " + -b : "+ " + b) + " = " + c + "x " + (rhs < 0 ? "− " + -rhs : "+ " + rhs); ex = "Get the x's on one side: subtract " + c + "x from both sides → " + (a - c) + "x " + (b < 0 ? "− " + -b : "+ " + b) + " = " + rhs + ". Then " + (a - c) + "x = " + (rhs - b) + ", so x = " + (rhs - b) + " ÷ " + (a - c) + " = <b>" + x + "</b>."; s = s.replace(/^1x/, "x"); }
		s = s.replace(/-(\d)/g, MINUS + "$1");
		return { type: "num", q: "Solve for <i>x</i>.<div class=\"pt-big\">" + s.replace(/x/g, "<i>x</i>") + "</div>", answer: x, neg: true, key: "eq" + s, explain: ex.replace(/(\d)x/g, "$1<i>x</i>").replace(/x =/g, "<i>x</i> ="), data: { s: s, x: x } };
	});
	function expr(m, b) { return (m === 1 ? "" : m) + "<i>n</i>" + (b > 0 ? " + " + b : b < 0 ? " " + MINUS + " " + (-b) : ""); }
	gen("g7-linear", 7, "algebra", "Linear patterns", function (R, diff) {
		var m = R.int(2, 7), b = R.int(-4, 9), rows = [];
		for (var n = 1; n <= 4; n++) rows.push([n, m * n + b]);
		var tbl = tableHtml(["Figure <i>n</i>", "Number of tiles"], rows.map(function (r) { return [r[0], fmt(r[1])]; }));
		if (diff === "hard") {
			var right = [m, b], wr = [[m, b + 1], [m + 1, b - 1], [1, rows[0][1] - 1], [m, 0], [b > 0 ? b : 2, m], [m - 1, b + 1], [m + 1, b]];
			var c = choose(R, right, wr, { key: function (x) { return x.join(","); }, show: function (x) { return expr(x[0], x[1]); }, ok: function (x) { return x[0] > 0 && !(x[0] * 1 + x[1] === m + b && x[0] * 2 + x[1] === 2 * m + b); } });
			return { type: "mc", q: "Which expression gives the number of tiles in Figure <i>n</i>?", html: tbl, choices: c.choices, answer: c.answer, key: "le" + m + "," + b,
				explain: "The tiles go up by " + m + " each figure, so the expression starts with " + m + "<i>n</i>. For <i>n</i> = 1, " + m + " × 1 = " + m + ", but the table says " + (m + b) + ", so " + (b >= 0 ? "add " + b : "subtract " + -b) + ": <b>" + expr(m, b) + "</b>. Check <i>n</i> = 3: " + m + " × 3 " + (b < 0 ? MINUS + " " + -b : "+ " + b) + " = " + (3 * m + b) + ".", data: { m: m, b: b } };
		}
		var x = diff === "easy" ? 5 : R.int(10, 25), ans = m * x + b;
		return { type: "num", q: "The pattern continues. How many tiles are in Figure <b>" + x + "</b>?", html: tbl, answer: ans, neg: true, key: "lv" + m + "," + b + "," + x,
			explain: "Each figure adds " + m + " tiles, and the rule is " + expr(m, b) + " (check: <i>n</i> = 1 gives " + (m + b) + "). For Figure " + x + ": " + m + " × " + x + (b ? (b > 0 ? " + " + b : " − " + -b) : "") + " = <b>" + fmt(ans) + "</b>.", data: { m: m, b: b, x: x } };
	});

	// ---------- Grade 7: geometry ----------
	function shapeFig(kind, p) {
		var b = "", W = 260, H = 160;
		if (kind === "triangle") { b = '<polygon points="20,140 230,140 ' + p.apex + ',20" class="pt-s-shape"/>' + line(p.apex, 20, p.apex, 140, "pt-s-dash") + text(125, 156, p.b + " cm") + text(p.apex + 6, 86, p.h + " cm", "pt-s-text", "start"); }
		else if (kind === "parallelogram") { b = '<polygon points="20,140 200,140 240,30 60,30" class="pt-s-shape"/>' + line(60, 30, 60, 140, "pt-s-dash") + text(110, 156, p.b + " cm") + text(66, 90, p.h + " cm", "pt-s-text", "start"); }
		else if (kind === "trapezoid") { b = '<polygon points="20,140 240,140 180,30 70,30" class="pt-s-shape"/>' + line(70, 30, 70, 140, "pt-s-dash") + text(130, 156, p.b + " cm") + text(125, 24, p.a + " cm") + text(76, 90, p.h + " cm", "pt-s-text", "start"); H = 162; }
		else if (kind === "circle") { b = '<circle cx="130" cy="80" r="66" class="pt-s-shape"/><circle cx="130" cy="80" r="3" class="pt-s-acc"/>' + (p.dia ? line(64, 80, 196, 80, "pt-s-dash") + text(130, 74, "d = " + p.v + " cm") : line(130, 80, 196, 80, "pt-s-dash") + text(163, 74, "r = " + p.v + " cm")); }
		return svg(W, H, b, kind + " " + JSON.stringify(p).replace(/[{}"]/g, "").replace(/:/g, " ") + " (not drawn to scale)");
	}
	gen("g7-area", 7, "geometry", "Area of triangles and parallelograms", function (R, diff) {
		var kind = diff === "easy" ? "parallelogram" : diff === "medium" ? "triangle" : "trapezoid", b = R.int(4, 18), h = R.int(3, 14), a = R.int(2, Math.max(2, b - 2)), ans, ex;
		if (kind === "parallelogram") { ans = b * h; ex = "Area of a parallelogram = base × height = " + b + " × " + h + " = <b>" + ans + " cm²</b>. Use the height that makes a right angle with the base, not the slanted side."; }
		else if (kind === "triangle") { ans = b * h / 2; ex = "Area of a triangle = base × height ÷ 2 = " + b + " × " + h + " ÷ 2 = <b>" + fmt(ans) + " cm²</b>. A triangle is half of a parallelogram."; }
		else { ans = (a + b) * h / 2; ex = "Area of a trapezoid = (top + bottom) ÷ 2 × height = (" + a + " + " + b + ") ÷ 2 × " + h + " = <b>" + fmt(ans) + " cm²</b>."; }
		return { type: "num", unit: "cm²", q: "What is the area of the " + kind + "? (Not drawn to scale.)", svg: shapeFig(kind, { b: b, h: h, a: a, apex: R.int(60, 190) }), answer: ans, key: "ga" + kind + b + "-" + h + "-" + a, explain: ex, data: { kind: kind, b: b, h: h, a: a } };
	});
	gen("g7-circle", 7, "geometry", "Circles", function (R, diff) {
		var dia = R.chance(0.5), v = R.int(2, 15) * (dia ? 2 : 1), r = dia ? v / 2 : v, area = diff === "hard" || (diff === "medium" && R.chance(0.5)), ans, exact, ex;
		if (diff === "easy") { ans = dia ? r : v * 2; return { type: "num", unit: "cm", q: "The " + (dia ? "diameter" : "radius") + " of a circle is " + v + " cm. What is its <b>" + (dia ? "radius" : "diameter") + "</b>?", svg: shapeFig("circle", { dia: dia, v: v }), answer: ans, key: "cr" + dia + v,
			explain: "The diameter goes all the way across; the radius goes from the centre to the edge, so the diameter is 2 × the radius. Answer: <b>" + ans + " cm</b>.", data: { dia: dia, v: v } }; }
		if (area) { ans = r2(3.14 * r * r); exact = Math.PI * r * r; ex = "Area = π × r × r. " + (dia ? "The radius is half the diameter: " + fmt(r) + " cm. " : "") + "3.14 × " + fmt(r) + " × " + fmt(r) + " = <b>" + fmt(ans) + " cm²</b>."; }
		else { ans = r2(3.14 * 2 * r); exact = Math.PI * 2 * r; ex = "Circumference = π × diameter = 3.14 × " + fmt(2 * r) + " = <b>" + fmt(ans) + " cm</b>."; }
		return { type: "num", unit: area ? "cm²" : "cm", q: "The " + (dia ? "diameter" : "radius") + " of a circle is " + v + " cm. Use π ≈ 3.14 to find its <b>" + (area ? "area" : "circumference") + "</b>.", svg: shapeFig("circle", { dia: dia, v: v }), answer: ans, tol: 0.06, alts: [r2(exact)], key: "cc" + dia + v + area, explain: ex + " (With the π button you get " + fmt(r2(exact)) + ", which is also marked right.)", data: { dia: dia, v: v, area: area } };
	});
	gen("g7-angles", 7, "geometry", "Angles", function (R, diff) {
		var a, b, ans, s, ex, q;
		if (diff === "easy") { a = R.int(25, 155); ans = 180 - a; s = svg(260, 110, line(10, 90, 250, 90) + line(130, 90, r2(130 + 90 * Math.cos(a * Math.PI / 180)), r2(90 - 90 * Math.sin(a * Math.PI / 180))) + text(r2(130 + 30 * Math.cos(a / 2 * Math.PI / 180) + 6), r2(90 - 22 * Math.sin(a / 2 * Math.PI / 180)), "x", "pt-s-text pt-s-bold") + text(r2(130 - 40 * Math.cos((180 - a) / 2 * Math.PI / 180)), r2(90 - 22 * Math.sin((180 - a) / 2 * Math.PI / 180)), (180 - a === ans ? a : a) + "°"), "Two angles on a straight line. One is " + a + " degrees and the other is x.");
			ex = "Angles on a straight line add up to 180°: x = 180° − " + a + "° = <b>" + ans + "°</b>."; q = "The two angles are on a straight line. What is <i>x</i>?"; }
		else {
			do { a = R.int(25, 100); b = R.int(25, 110); } while (a + b > 160);
			var iso = diff === "hard" && R.chance(0.6);
			if (iso) { var apex = 2 * R.int(10, 70); ans = (180 - apex) / 2; a = apex; ex = "An isosceles triangle has two equal base angles. They share 180° − " + apex + "° = " + (180 - apex) + "°, so each is " + (180 - apex) + " ÷ 2 = <b>" + ans + "°</b>."; q = "The triangle is isosceles (the two marked sides are equal). The top angle is " + apex + "°. What is <i>x</i>, one of the base angles?";
				s = svg(240, 170, '<polygon points="30,150 210,150 120,20" class="pt-s-shape"/>' + text(120, 50, apex + "°") + text(55, 142, "x", "pt-s-text pt-s-bold") + line(70, 80, 80, 90, "pt-s-line") + line(160, 80, 170, 70, "pt-s-line"), "An isosceles triangle with a top angle of " + apex + " degrees and base angle x"); }
			else { ans = 180 - a - b; ex = "The angles in a triangle add up to 180°: x = 180° − " + a + "° − " + b + "° = <b>" + ans + "°</b>."; q = "Two angles of a triangle are " + a + "° and " + b + "°. What is the third angle, <i>x</i>?";
				s = svg(240, 170, '<polygon points="30,150 210,150 130,25" class="pt-s-shape"/>' + text(58, 142, a + "°") + text(186, 142, b + "°") + text(130, 52, "x", "pt-s-text pt-s-bold"), "A triangle with angles " + a + " degrees, " + b + " degrees and x (not drawn to scale)"); }
		}
		return { type: "num", unit: "°", q: q + " (Not drawn to scale.)", svg: s, answer: ans, key: "an" + diff + a + "-" + b, explain: ex, data: { a: a, b: b } };
	});
	function coordSvg(pts, R0) {
		var s = 18, N = R0, W = (2 * N + 1) * s + 20, o = W / 2, b = "";
		for (var i = -N; i <= N; i++) { b += line(o + i * s, o - N * s, o + i * s, o + N * s, i ? "pt-s-grid" : "pt-s-line") + line(o - N * s, o + i * s, o + N * s, o + i * s, i ? "pt-s-grid" : "pt-s-line"); if (i && i % 2 === 0) b += text(o + i * s, o + 14, fmt(i), "pt-s-text pt-s-tiny") + text(o - 4, o - i * s + 3, fmt(i), "pt-s-text pt-s-tiny", "end"); }
		b += text(o + N * s + 6, o - 4, "x", "pt-s-text pt-s-small") + text(o + 6, o - N * s - 2, "y", "pt-s-text pt-s-small");
		pts.forEach(function (p) { b += '<circle cx="' + (o + p[0] * s) + '" cy="' + (o - p[1] * s) + '" r="5" class="pt-s-acc"/>' + text(o + p[0] * s + 9, o - p[1] * s - 7, p[2], "pt-s-text pt-s-bold", "start"); });
		return svg(W, W, b, "Coordinate grid from " + MINUS + N + " to " + N + " with point " + pts.map(function (p) { return p[2]; }).join(" and ") + " plotted");
	}
	function pair(p) { return "(" + fmt(p[0]) + ", " + fmt(p[1]) + ")"; }
	gen("g7-coords", 7, "geometry", "Coordinates", function (R, diff) {
		var N = diff === "easy" ? 6 : 6, x = diff === "easy" ? R.int(1, 6) : R.int(-6, 6), y = diff === "easy" ? R.int(1, 6) : R.int(-6, 6);
		if (!x) x = -3; if (!y) y = 2; if (x === y) y = -y || 4;
		if (diff === "hard") {
			var dx = R.int(-4, 4) || 3, dy = R.int(-4, 4) || -2, nx = x + dx, ny = y + dy;
			if (Math.abs(nx) > 9 || Math.abs(ny) > 9) { dx = -dx; dy = -dy; nx = x + dx; ny = y + dy; }
			var c = choose(R, [nx, ny], [[x - dx, y - dy], [x + dy, y + dx], [nx, y - dy], [x - dx, ny], [ny, nx], [nx + 1, ny]], { key: pair, show: pair });
			var mv = (dx ? Math.abs(dx) + (dx > 0 ? " right" : " left") : "") + (dx && dy ? " and " : "") + (dy ? Math.abs(dy) + (dy > 0 ? " up" : " down") : "");
			return { type: "mc", q: "Point P is moved (translated) <b>" + mv + "</b>. What are its new coordinates?", svg: coordSvg([[x, y, "P"]], N), choices: c.choices, answer: c.answer, key: "tr" + x + y + dx + dy,
				explain: "P is at " + pair([x, y]) + ". Right/left changes <i>x</i>, up/down changes <i>y</i>: (" + x + (dx < 0 ? " − " + -dx : " + " + dx) + ", " + y + (dy < 0 ? " − " + -dy : " + " + dy) + ") = <b>" + pair([nx, ny]) + "</b>.", data: { x: x, y: y, dx: dx, dy: dy } };
		}
		var c2 = choose(R, [x, y], [[y, x], [-x, y], [x, -y], [-x, -y], [x + 1, y], [x, y + 1]], { key: pair, show: pair });
		return { type: "mc", q: "What are the coordinates of point A?", svg: coordSvg([[x, y, "A"]], N), choices: c2.choices, answer: c2.answer, key: "co" + x + "," + y,
			explain: "Go across first (the <i>x</i>-coordinate) and then up or down (the <i>y</i>-coordinate). A is " + Math.abs(x) + (x > 0 ? " right" : " left") + " and " + Math.abs(y) + (y > 0 ? " up" : " down") + ", so A = <b>" + pair([x, y]) + "</b>.", data: { x: x, y: y } };
	});

	// ---------- Grade 7: data and probability ----------
	gen("g7-stats", 7, "data", "Mean, median, mode and range", function (R, diff) {
		var n = diff === "hard" ? R.int(4, 6) : 2 * R.int(2, 4) + 1, data = [], ctx = R.pick([["quiz scores", ""], ["points scored in basketball games", ""], ["minutes spent reading", " minutes"], ["daily high temperatures (°C)", ""]]);
		for (var i = 0; i < n; i++) data.push(R.int(4, 30));
		var sorted = data.slice().sort(function (a, b) { return a - b; }), sum = data.reduce(function (s, x) { return s + x; }, 0), what, ans, ex;
		if (diff === "easy") {
			what = R.pick(["range", "mode"]);
			if (what === "mode") { var v = R.pick(data); data[R.int(0, n - 1)] = v; data.push(v); n++; sorted = data.slice().sort(function (a, b) { return a - b; }); var cnt = {}; data.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; }); var mx = Math.max.apply(null, Object.keys(cnt).map(function (k) { return cnt[k]; })); var modes = Object.keys(cnt).filter(function (k) { return cnt[k] === mx; }); if (modes.length > 1) return this.make(R, diff); ans = +modes[0]; ex = "The mode is the value that appears most often. Sorted: " + sorted.join(", ") + ". " + ans + " appears " + mx + " times, so the mode is <b>" + ans + "</b>."; }
			else { ans = sorted[n - 1] - sorted[0]; ex = "Range = greatest − least = " + sorted[n - 1] + " − " + sorted[0] + " = <b>" + ans + "</b>."; }
		} else if (diff === "medium") {
			if (R.chance(0.5)) { what = "median"; ans = sorted[(n - 1) / 2]; ex = "Put the values in order: " + sorted.join(", ") + ". The middle one (number " + ((n + 1) / 2) + " of " + n + ") is <b>" + ans + "</b>."; }
			else { what = "mean"; var fix = (n - sum % n) % n; data[0] += fix; sum += fix; sorted = data.slice().sort(function (a, b) { return a - b; }); ans = sum / n; ex = "Mean = total ÷ how many = (" + data.join(" + ") + ") ÷ " + n + " = " + sum + " ÷ " + n + " = <b>" + ans + "</b>."; }
		} else {
			what = "missing"; var target = R.int(12, 24), k = n - 1, part = data.slice(0, k), ps = part.reduce(function (s, x) { return s + x; }, 0), need = target * n - ps;
			if (need < 0 || need > 60) return this.make(R, diff);
			ans = need;
			return { type: "num", q: R.pick(NAMES) + "'s first " + k + " " + ctx[0] + " are " + part.join(", ") + ". What must the next one be so that the <b>mean</b> of all " + n + " is exactly <b>" + target + "</b>?", answer: ans, key: "sm" + part.join(",") + "-" + target,
				explain: "For a mean of " + target + " over " + n + " values, the total must be " + target + " × " + n + " = " + target * n + ". The first " + k + " add to " + ps + ", so the last one is " + target * n + " − " + ps + " = <b>" + ans + "</b>.", data: { part: part, target: target } };
		}
		return { type: "num", q: "Here are some " + ctx[0] + ":<div class=\"pt-big pt-data\">" + data.join(", ") + "</div>What is the <b>" + what + "</b>?", answer: ans, key: "st" + what + data.join(","), explain: ex, data: { data: data, what: what } };
	});
	function spinnerSvg(cols) {
		var c = 70, r = 64, n = cols.length, b = "";
		cols.forEach(function (ci, j) {
			var a0 = j / n * 2 * Math.PI - Math.PI / 2, a1 = (j + 1) / n * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
			b += '<path d="M' + c + ' ' + c + ' L' + r2(c + r * Math.cos(a0)) + ' ' + r2(c + r * Math.sin(a0)) + ' A' + r + ' ' + r + ' 0 0 1 ' + r2(c + r * Math.cos(a1)) + ' ' + r2(c + r * Math.sin(a1)) + ' Z" class="pt-s-m' + ci + '"/>' + text(r2(c + 42 * Math.cos(am)), r2(c + 42 * Math.sin(am) + 4), COLS[ci][1], "pt-s-text pt-s-small pt-s-mtx");
		});
		b += line(c, c, c + 30, c - 30, "pt-s-hand") + '<circle cx="' + c + '" cy="' + c + '" r="5" class="pt-s-acc"/>';
		return svg(140, 140, b, "A spinner with " + n + " equal sections: " + [0, 1, 2, 3].map(function (i) { var k = cols.filter(function (x) { return x === i; }).length; return k ? k + " " + COLS[i][0] : ""; }).filter(Boolean).join(", "));
	}
	gen("g7-prob", 7, "data", "Probability", function (R, diff) {
		var num, den, q, ex, sv, key;
		if (diff === "easy") {
			var n = R.pick([4, 5, 6, 8]), cols = []; for (var i = 0; i < n; i++) cols.push(R.int(0, 3));
			var ci = R.pick(cols); num = cols.filter(function (x) { return x === ci; }).length; den = n; sv = spinnerSvg(cols);
			q = "The spinner has " + n + " equal sections. What is the probability of landing on <b>" + COLS[ci][0] + "</b>?"; key = "sp" + cols.join("") + ci;
			ex = num + " of the " + n + " equal sections are " + COLS[ci][0] + ", so P(" + COLS[ci][0] + ") = " + fr(num, n) + (gcd(num, n) > 1 ? " = <b>" + frS(num, n) + "</b>" : "") + ".";
		} else if (diff === "medium") {
			var EV = [["an even number", [2, 4, 6]], ["a number greater than 4", [5, 6]], ["a multiple of 3", [3, 6]], ["a number less than 3", [1, 2]], ["a prime number", [2, 3, 5]], ["a 6", [6]], ["a number that is not 1", [2, 3, 4, 5, 6]]], e = R.pick(EV);
			num = e[1].length; den = 6; q = "You roll one fair six-sided die. What is the probability of rolling <b>" + e[0] + "</b>?"; key = "die" + e[0];
			ex = "There are 6 equally likely results. The ones that count are " + e[1].join(", ") + " (" + num + " of them), so the probability is " + fr(num, 6) + (gcd(num, 6) > 1 ? " = <b>" + frS(num, 6) + "</b>" : "") + ".";
		} else {
			var s = R.int(3, 11), ways = []; for (var a = 1; a <= 6; a++) for (var b2 = 1; b2 <= 6; b2++) if (a + b2 === s) ways.push(a + "+" + b2);
			num = ways.length; den = 36; q = "You roll two fair dice and add the numbers. What is the probability that the sum is <b>" + s + "</b>?"; key = "dd" + s;
			ex = "There are 6 × 6 = 36 equally likely outcomes. A sum of " + s + " happens " + num + " ways (" + ways.join(", ") + "), so the probability is " + fr(num, 36) + (gcd(num, 36) > 1 ? " = <b>" + frS(num, 36) + "</b>" : "") + ".";
		}
		var right = [num, den], c = choose(R, right, [[den - num, den], [num, den + 1], [num + 1, den], [num, den - num], [1, num + 1], [num, 2 * den]], { key: fkey, show: function (x) { return frS(x[0], x[1]); }, ok: function (x) { return x[0] > 0 && x[1] > 0 && x[0] <= x[1]; } });
		return { type: "mc", q: q, svg: sv, choices: c.choices, answer: c.answer, key: key, explain: ex, data: { num: num, den: den } };
	});

	// ---------- topics ----------
	var TOPICS = {
		4: [["number", "Number sense"], ["ops", "Add, subtract, multiply, divide"], ["fractions", "Fractions and decimals"], ["money", "Money"], ["time", "Time"], ["measure", "Measurement"], ["geometry", "Shapes"], ["patterns", "Patterns"], ["data", "Data and chance"]],
		7: [["integers", "Integers"], ["number", "Order of operations"], ["decimals", "Decimals and percent"], ["fractions", "Fractions"], ["ratios", "Ratio and rate"], ["algebra", "Patterns and equations"], ["geometry", "Geometry"], ["data", "Data and probability"]]
	};
	function topicName(grade, t, subject) {
		if (subject === "literacy") return (SKILLS.filter(function (s) { return s[0] === t; })[0] || [t, t])[1];
		return (TOPICS[grade].filter(function (x) { return x[0] === t; })[0] || [t, t])[1];
	}
	function gensFor(grade, topics) { return G.filter(function (g) { return g.grade === grade && (!topics || !topics.length || topics.indexOf(g.topic) >= 0); }); }

	// make one numeracy item; retries on the rare "not enough distractors"
	function makeItem(g, R, diff, grade) {
		var it, err;
		for (var t = 0; t < 40; t++) {
			try { it = g.make.call(g, R, diff); break; } catch (e) { err = e; it = null; }
		}
		if (!it) throw err;
		it.gen = g.id; it.topic = g.topic; it.title = g.title; it.diff = diff; it.grade = grade; it.fit = fitFor(grade, diff); it.subject = "numeracy";
		return it;
	}

	// =====================================================================================
	// LITERACY: passage bank in passages.js (window.PT_PASSAGES / module.exports)
	// =====================================================================================
	var SKILLS = [["main", "Main idea and theme"], ["detail", "Finding details"], ["vocab", "Word meaning"], ["infer", "Inference"], ["sequence", "Order of events"], ["structure", "Text features and structure"], ["purpose", "Author's purpose and craft"], ["written", "Written response"]];
	var GENRES = { story: "Story", info: "Information text", poem: "Poem", notice: "Notice or ad", opinion: "Opinion" };
	function bank() {
		if (root.PT_PASSAGES) return root.PT_PASSAGES;
		if (typeof require === "function") { try { return require("./passages.js"); } catch (e) { } }
		return [];
	}
	function passagesFor(grade) { return bank().filter(function (p) { return p.grade === grade; }); }
	function litItem(p, qi, R) {
		var Q = p.qs[qi], it = { subject: "literacy", passage: p.id, gen: p.id + "#" + qi, key: p.id + "#" + qi, topic: Q.skill, title: topicName(p.grade, Q.skill, "literacy"), diff: Q.diff, grade: p.grade, fit: fitFor(p.grade, Q.diff), q: Q.q, explain: Q.why || Q.rubric, type: Q.type };
		if (Q.type === "mc") {
			var idx = R.shuffle(Q.c.map(function (x, i) { return i; }));
			it.choices = idx.map(function (i) { return Q.c[i]; }); it.answer = idx.indexOf(0);
		} else if (Q.type === "multi") {
			var id2 = R.shuffle(Q.c.map(function (x, i) { return i; }));
			it.choices = id2.map(function (i) { return Q.c[i]; }); it.answer = Q.right.map(function (r) { return id2.indexOf(r); }).sort(); it.need = Q.right.length;
		} else if (Q.type === "order") {
			it.items = Q.c.slice(); var sh;
			do { sh = R.shuffle(Q.c.map(function (x, i) { return i; })); } while (sh.every(function (v, i) { return v === i; }));
			it.start = sh; it.answer = Q.c.map(function (x, i) { return i; });
		} else if (Q.type === "written") { it.model = Q.model; it.keys = Q.keys; it.need = Q.need || 2; it.rubric = Q.rubric; }
		return it;
	}

	// =====================================================================================
	// TEST ASSEMBLY
	// cfg: { grade, subject: numeracy|literacy, mode: full|quick|topic, topics: [], diff: mixed|easy|medium|hard, seed }
	// =====================================================================================
	var LENGTH = { numeracy: { full: 25, quick: 10, topic: 10 }, literacy: { full: 4, quick: 2, topic: 10 } };
	function diffPlan(R, n, d) {
		if (d && d !== "mixed") { var a = []; for (var i = 0; i < n; i++) a.push(d); return a; }
		var e = Math.round(n * 0.3), h = Math.round(n * 0.25), out = [];
		for (var j = 0; j < n; j++) out.push(j < e ? "easy" : j < n - h ? "medium" : "hard");
		return out;
	}
	function buildTest(cfg) {
		var R = Rand(cfg.seed >>> 0), grade = +cfg.grade, items = [];
		if (cfg.subject === "literacy") {
			var ps = passagesFor(grade);
			if (cfg.mode === "topic") {
				var pool = [];
				ps.forEach(function (p) { p.qs.forEach(function (Q, i) { if ((!cfg.topics || !cfg.topics.length || cfg.topics.indexOf(Q.skill) >= 0) && (!cfg.diff || cfg.diff === "mixed" || Q.diff === cfg.diff)) pool.push([p, i]); }); });
				if (!pool.length) ps.forEach(function (p) { p.qs.forEach(function (Q, i) { if (!cfg.topics || !cfg.topics.length || cfg.topics.indexOf(Q.skill) >= 0) pool.push([p, i]); }); });
				R.shuffle(pool).slice(0, LENGTH.literacy.topic).sort(function (a, b) { return a[0].id < b[0].id ? -1 : a[0].id > b[0].id ? 1 : a[1] - b[1]; }).forEach(function (x) { items.push(litItem(x[0], x[1], R)); });
			} else {
				var n = LENGTH.literacy[cfg.mode] || 2, genres = R.shuffle(Object.keys(GENRES)), chosen = [];
				genres.forEach(function (g) { if (chosen.length < n) { var opts = ps.filter(function (p) { return p.genre === g && chosen.indexOf(p) < 0; }); if (opts.length) chosen.push(R.pick(opts)); } });
				R.shuffle(ps.filter(function (p) { return chosen.indexOf(p) < 0; })).forEach(function (p) { if (chosen.length < n) chosen.push(p); });
				chosen.forEach(function (p) { p.qs.forEach(function (Q, i) { items.push(litItem(p, i, R)); }); });
			}
		} else {
			var gens = gensFor(grade, cfg.mode === "topic" ? cfg.topics : null), count = LENGTH.numeracy[cfg.mode] || 10, plan = diffPlan(R, count, cfg.diff), seen = {}, order = [];
			while (order.length < count) order = order.concat(R.shuffle(gens.slice()));
			order = order.slice(0, count);
			// sort by difficulty plan position (easy first) while keeping topics mixed
			order.forEach(function (g, i) {
				var d = plan[i], it;
				var tryG = [g].concat(R.shuffle(gens.filter(function (x) { return x !== g; })));
				outer: for (var gi = 0; gi < tryG.length; gi++) for (var t = 0; t < 30; t++) { it = makeItem(tryG[gi], R, d, grade); if (!seen[it.key]) break outer; }
				seen[it.key] = 1; it.n = i; items.push(it);
			});
		}
		items.forEach(function (it, i) { it.n = i; });
		return items;
	}
	function passageById(id) { return bank().filter(function (p) { return p.id === id; })[0] || null; }

	// ---------- answers ----------
	function parseNum(s) {
		if (s === null || s === undefined) return NaN;
		s = String(s).trim().replace(/[−–—]/g, "-").replace(/[$¢,]/g, "").replace(/[   ]/g, " ");
		s = s.replace(/(\d) (?=\d{3}(\D|$))/g, "$1");
		s = s.replace(/\s*(square units?|units?|cm²|m²|cm2|cm|mm|km\/h|km|kg|g|ml|mL|l|L|°c|°C|°|degrees?|minutes?|min|%|[a-z ]+)$/i, "").trim();
		var m = s.match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/);
		if (m) return (m[1] ? -1 : 1) * (+m[2] + +m[3] / +m[4]);
		m = s.match(/^(-?\d+)\/(\d+)$/);
		if (m) return +m[2] ? +m[1] / +m[2] : NaN;
		if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
		return +s;
	}
	function writtenScore(it, txt) {   // suggested mark from key ideas found: 0, 0.5 or 1
		txt = String(txt || "").toLowerCase();
		var words = txt.split(/\s+/).filter(Boolean).length, hit = 0;
		(it.keys || []).forEach(function (grp) { if (grp.some(function (k) { return txt.indexOf(k.toLowerCase()) >= 0; })) hit++; });
		if (words < 4) return { score: 0, hit: hit, words: words };
		return { score: hit >= it.need ? 1 : hit >= 1 || words >= 15 ? 0.5 : 0, hit: hit, words: words };
	}
	// answer shapes: mc -> index, multi -> [indexes], num -> string, order -> [item indexes in chosen order], written -> {text, mark}
	function checkAnswer(it, a) {
		if (a === undefined || a === null || a === "") return { done: false, score: 0 };
		if (it.type === "mc") return { done: true, score: a === it.answer ? 1 : 0 };
		if (it.type === "multi") { var s = (a || []).slice().sort(); var ok = s.length === it.answer.length && s.every(function (v, i) { return v === it.answer[i]; }); var part = !ok && s.length && s.every(function (v) { return it.answer.indexOf(v) >= 0; }) ? 0.5 : 0; return { done: s.length > 0, score: ok ? 1 : part }; }
		if (it.type === "order") { var all = a.every(function (v, i) { return v === i; }); return { done: true, score: all ? 1 : 0 }; }
		if (it.type === "written") { var txt = a.text || ""; if (!txt.trim()) return { done: false, score: 0 }; var sug = writtenScore(it, txt); return { done: true, score: typeof a.mark === "number" ? a.mark : sug.score, suggested: sug.score, self: typeof a.mark === "number" }; }
		var v = parseNum(a);
		if (isNaN(v)) return { done: true, score: 0, bad: true };
		var tol = it.tol || 1e-9 * Math.max(1, Math.abs(it.answer)), right = Math.abs(v - it.answer) <= tol;
		if (!right && it.alts) right = it.alts.some(function (x) { return Math.abs(v - x) <= tol; });
		return { done: true, score: right ? 1 : 0 };
	}
	function answerText(it) {   // the correct answer as plain text
		if (it.type === "mc") return it.choices[it.answer];
		if (it.type === "multi") return it.answer.map(function (i) { return it.choices[i]; }).join("; ");
		if (it.type === "order") return it.answer.map(function (i, k) { return (k + 1) + ". " + it.items[i]; }).join("<br>");
		if (it.type === "written") return it.model;
		return (it.prefix || "") + (it.money ? Number(it.answer).toFixed(2) : fmt(it.answer)) + (it.unit ? " " + it.unit : "");
	}
	function score(items, answers) {
		var tot = 0, max = items.length, by = {}, done = 0;
		items.forEach(function (it, i) {
			var r = checkAnswer(it, answers[i]); tot += r.score; if (r.done) done++;
			var b = by[it.topic] || (by[it.topic] = { topic: it.topic, title: it.title, got: 0, max: 0 });
			b.got += r.score; b.max++;
		});
		return { got: tot, max: max, pct: max ? Math.round(tot / max * 100) : 0, done: done, topics: Object.keys(by).map(function (k) { return by[k]; }) };
	}
	function level(pct) { return pct >= 85 ? ["Extending", "Excellent: you're ready for harder questions."] : pct >= 65 ? ["On track", "Good work: review the ones you missed."] : pct >= 45 ? ["Emerging", "Getting there: practise the topics marked below."] : ["Not yet", "Keep going: practise one topic at a time."]; }
	function fmtTime(ms) { var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); s = s % 60; return (h ? h + ":" + ("0" + m).slice(-2) : m) + ":" + ("0" + s).slice(-2); }
	function newSeed() { return Math.floor(Math.random() * 900000) + 100000; }

	var api = {
		rng: rng, Rand: Rand, hashStr: hashStr, fmt: fmt, money: money, fr: fr, frS: frS, simp: simp, gcd: gcd, hm: hm, esc: esc,
		GRADES: GRADES, fitLabel: fitLabel, DIFFS: DIFFS, TOPICS: TOPICS, SKILLS: SKILLS, GENRES: GENRES, GENS: G, LENGTH: LENGTH,
		topicName: topicName, gensFor: gensFor, makeItem: makeItem, passagesFor: passagesFor, passageById: passageById, litItem: litItem,
		buildTest: buildTest, parseNum: parseNum, checkAnswer: checkAnswer, writtenScore: writtenScore, answerText: answerText, score: score, level: level, fmtTime: fmtTime, newSeed: newSeed
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.MESPT = api;
})(this);

/* MES Practice Tests: the literacy passage bank. Every passage and question here was written for mes.fm (original, not taken from any test).
   Passage: { id, grade, genre: story|info|poem|notice|opinion, title, html, qs: [...] }
   Question: { skill, diff, type: mc|multi|order|written, q, c: [...], why }
     mc: c[0] is the right answer (choices are shuffled when a test is made)
     multi: right = indexes into c
     order: c is listed in the correct order (shuffled for the reader)
     written: model (a full answer), keys (groups of words; one word from a group = that idea is there), need (ideas for full marks), rubric */
(function (root) {
	"use strict";
	var P = [

	// =============================== GRADE 4 ===============================
	{ id: "g4-kite", grade: 4, genre: "story", title: "The Kite with a Patch",
	  html: "<p>Ava's red kite was the best kite on Willow Street. It had a long tail made of ribbons, and when the wind was strong it climbed so high that it looked like a tiny red dot.</p>" +
		"<p>One windy Saturday, the kite dipped and dove straight into the branches of the old maple tree. When Ava finally pulled it free, there was a long rip across the middle.</p>" +
		"<p>\"It's ruined,\" Ava said. She dropped onto the porch steps and stared at the torn plastic.</p>" +
		"<p>Grandpa Joe sat down beside her. He turned the kite over in his hands. \"Ruined is a big word,\" he said. \"Let's see what we have in the garage.\"</p>" +
		"<p>They found clear tape, a pair of scissors and an old blue garbage bag. Grandpa showed Ava how to cut a patch a little bigger than the rip, so the edges would hold. Ava smoothed the tape down slowly, pressing out every bubble. It took most of the afternoon.</p>" +
		"<p>When they were done, the kite had a bright blue square right in its middle. Ava frowned. \"It looks funny now.\"</p>" +
		"<p>\"Let's find out if it flies funny,\" said Grandpa.</p>" +
		"<p>The next morning the kite rose over the park, red and blue against the grey clouds. A boy on the field pointed and shouted, \"Cool kite! I've never seen one like that!\"</p>" +
		"<p>Ava grinned. She decided the patch was her favourite part.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "What made the rip in Ava's kite?", c: ["It crashed into a maple tree.", "A dog chewed it.", "The wind tore the tail off.", "It got wet in the rain."], why: "The story says the kite \"dove straight into the branches of the old maple tree\" and had a rip when Ava pulled it free." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "Grandpa says, \"<i>Ruined</i> is a big word.\" What does he mean?", c: ["The kite is not as badly broken as Ava thinks.", "Ava should use shorter words.", "The kite is too big to fix.", "Ava should buy a new kite."], why: "Grandpa thinks \"ruined\" (broken for good) is too strong. He believes they can fix it, and they do." },
		{ skill: "sequence", diff: "medium", type: "order", q: "Put these events in the order they happened.", c: ["The kite gets stuck in the maple tree.", "Grandpa and Ava look in the garage.", "Ava presses the tape down over the patch.", "A boy at the park says he likes the kite."], why: "The kite crashes first, then they look for supplies, fix it, and fly it the next morning, when the boy sees it." },
		{ skill: "infer", diff: "medium", type: "mc", q: "How does Ava feel about the patch at the end of the story?", c: ["Proud, because it makes her kite special", "Embarrassed, because it looks funny", "Angry at Grandpa for choosing blue", "Worried that it will fall off"], why: "After the boy says he has never seen a kite like it, Ava grins and decides the patch is her favourite part." },
		{ skill: "main", diff: "hard", type: "mc", q: "What lesson does this story teach?", c: ["Something that is fixed can be even better than before.", "Kites should never be flown near trees.", "Grandparents know everything.", "It is better to buy new things than repair old ones."], why: "Ava thinks the kite is ruined, but after fixing it the patch becomes the part she likes best. The story is about seeing value in something repaired." },
		{ skill: "written", diff: "hard", type: "written", q: "How does Ava change from the beginning of the story to the end? Use two details from the story.", model: "At the beginning Ava is upset and thinks her kite is ruined after it rips in the tree. At the end she is happy and proud because the kite flies well and a boy says it is cool, so the patch becomes her favourite part.", keys: [["upset", "sad", "ruined", "frown", "dropped", "disappointed", "mad"], ["happy", "proud", "grin", "favourite", "favorite", "likes"], ["boy", "cool", "flies", "flew", "patch", "blue"]], need: 3, rubric: "Full marks: says how Ava feels at the start (upset, thinks it's ruined) AND at the end (happy, proud), with a detail from the story such as the boy saying \"cool kite\"." }
	  ] },

	{ id: "g4-power", grade: 4, genre: "story", title: "Lights Out",
	  html: "<p>The storm started at dinner. Rain slapped against the windows, and the wind made the trees bend like they were bowing. Then, with a soft click, every light in the house went out.</p>" +
		"<p>\"Nobody move,\" said Dad. He felt his way to the kitchen drawer and came back with two flashlights and a box of matches.</p>" +
		"<p>Leo was not happy. His tablet battery was almost empty, and the TV was dark. \"There's nothing to do,\" he groaned.</p>" +
		"<p>His sister Mei had an idea. She pulled the old board game out of the hall closet and blew the dust off the lid. Mom lit a candle and set it in the middle of the table, far from the edge. The family sat close together so everyone could see the board.</p>" +
		"<p>At first Leo played just to be polite. But when he landed on the space that sent Dad all the way back to the start, everyone laughed so hard that Mei snorted, and then they laughed even more.</p>" +
		"<p>They played three games. They told stories about other storms. Dad made shadow animals on the wall with the flashlight: a rabbit, a duck and a wobbly moose.</p>" +
		"<p>At nine o'clock the lights flickered and came back on. The fridge hummed. The TV woke up with a beep.</p>" +
		"<p>\"Oh,\" said Leo, a little sadly. \"Can we finish this game first?\"</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "What did Dad bring back from the kitchen drawer?", c: ["Flashlights and matches", "A board game", "Candles and a radio", "Batteries for the tablet"], why: "The story says Dad \"came back with two flashlights and a box of matches.\" Mei found the board game in the hall closet." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "\"The wind made the trees bend like they were <i>bowing</i>.\" What picture does this give you?", c: ["The trees leaning far over, the way a person bends forward", "The trees making a loud noise", "The trees falling down", "The trees shooting arrows"], why: "To bow is to bend forward from the waist. The author compares the bending trees to people bowing." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Why did Mom put the candle in the middle of the table, far from the edge?", c: ["So it would be safe and not get knocked over", "So it would last longer", "Because the board game needed it there", "So Leo could not blow it out"], why: "Candles are a fire danger. Putting it far from the edge keeps it from being knocked onto the floor. The story doesn't say this; you have to work it out." },
		{ skill: "main", diff: "medium", type: "mc", q: "What is the best summary of this story?", c: ["When the power goes out, a family finds out they can have fun together without screens.", "A storm knocks down trees in Leo's neighbourhood.", "Dad teaches the family how to make shadow animals.", "Leo's tablet battery runs out during a storm."], why: "A summary covers the whole story: the power goes out, Leo is bored at first, and the family ends up having so much fun that Leo wants to keep playing." },
		{ skill: "structure", diff: "hard", type: "mc", q: "Why does the author end with Leo asking, \"Can we finish this game first?\"", c: ["To show how much Leo has changed since the power went out", "To show that Leo is still bored", "To tell us the game is very long", "To explain why the power came back"], why: "At the start Leo groans that there's nothing to do. At the end he wants to keep playing even though the TV is back. The ending shows the change." },
		{ skill: "written", diff: "hard", type: "written", q: "Leo says there is \"nothing to do\" when the power goes out. Explain how the story shows he was wrong. Give two examples.", model: "Leo was wrong because his family found lots to do without power. They played three games of the board game by candlelight, told stories about other storms, and Dad made shadow animals on the wall. Leo even wanted to keep playing when the lights came back.", keys: [["game", "board"], ["stories", "story", "told"], ["shadow", "rabbit", "duck", "moose"], ["laugh", "fun", "finish", "keep playing"]], need: 2, rubric: "Full marks: two activities from the story (board game, telling stories, shadow animals) or one activity plus how Leo felt at the end." }
	  ] },

	{ id: "g4-otters", grade: 4, genre: "info", title: "Sea Otters: Helpers of the Kelp Forest",
	  html: "<h4>Who are sea otters?</h4><p>Sea otters are small marine mammals that live along the Pacific coast, including the coast of British Columbia. An adult can be about as long as a ten-year-old is tall. Unlike most sea mammals, sea otters have no thick layer of fat. Instead, they stay warm with the thickest fur of any animal on Earth. One small patch of their fur, the size of a postage stamp, can hold more hairs than there are on a person's whole head.</p>" +
		"<h4>Busy eaters</h4><p>Staying warm in cold water takes a lot of energy, so sea otters eat a lot. They dive to the sea floor to catch crabs, clams and sea urchins. Some otters even use tools. An otter floats on its back, puts a flat rock on its chest, and bangs a clam against the rock until the shell cracks.</p>" +
		"<h4>Why they matter</h4><p>Sea urchins are spiny animals that eat kelp, a tall seaweed. When there are too many urchins, they can eat a whole kelp forest until only bare rock is left. Sea otters eat urchins, so where otters live, kelp forests can grow. Kelp forests give shelter to fish, seals and many other animals.</p>" +
		"<h4>Holding hands</h4><p>When sea otters sleep, they sometimes wrap themselves in kelp or hold paws with other otters. This keeps them from drifting apart. A group of resting otters is called a <b>raft</b>.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "How do sea otters stay warm?", c: ["With very thick fur", "With a thick layer of fat", "By sleeping on land", "By staying in warm water"], why: "The section \"Who are sea otters?\" says they have no thick layer of fat and stay warm with the thickest fur of any animal." },
		{ skill: "structure", diff: "easy", type: "mc", q: "Which heading would help you find out what sea otters eat?", c: ["Busy eaters", "Who are sea otters?", "Why they matter", "Holding hands"], why: "Headings tell you what each part is about. \"Busy eaters\" is the part about crabs, clams and urchins." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "In the last section, what does the word <b>raft</b> mean?", c: ["A group of resting otters", "A boat made of logs", "A bed of kelp", "A flat rock otters use as a tool"], why: "The text gives the meaning right after the word: \"A group of resting otters is called a raft.\" Bold words are often explained this way." },
		{ skill: "infer", diff: "hard", type: "mc", q: "What would most likely happen to a kelp forest if all the sea otters left?", c: ["Sea urchins would increase and could eat the kelp.", "The kelp would grow even taller.", "More fish would come to live there.", "The water would get warmer."], why: "Otters eat urchins and urchins eat kelp. Without otters, the urchins could multiply and eat the forest down to bare rock." },
		{ skill: "detail", diff: "medium", type: "multi", q: "Choose <b>TWO</b> ways sea otters use other things to help them.", c: ["They crack clams on a rock.", "They wrap themselves in kelp to sleep.", "They build nests out of sticks.", "They carry water in their fur.", "They hide food in sand."], right: [0, 1], why: "The text says otters bang clams against a flat rock and wrap themselves in kelp so they don't drift. The other choices are not in the text." },
		{ skill: "written", diff: "hard", type: "written", q: "The author says sea otters are \"helpers of the kelp forest.\" Explain why, using information from the text.", model: "Sea otters help the kelp forest because they eat sea urchins. Sea urchins eat kelp, and if there are too many they can eat a whole forest. With otters eating the urchins, the kelp can grow, and the forest gives shelter to fish and seals.", keys: [["urchin"], ["eat kelp", "eats kelp", "eat the kelp", "eat all", "eat a whole", "kelp eaters"], ["grow", "shelter", "home", "fish", "seal", "survive"]], need: 2, rubric: "Full marks: otters eat sea urchins, AND urchins eat kelp (so kelp can grow / gives shelter)." }
	  ] },

	{ id: "g4-seed", grade: 4, genre: "info", title: "From Seed to Bean Plant",
	  html: "<p>A bean seed may look like a tiny brown pebble, but inside it is a baby plant waiting for the right moment to grow. Here is what happens when you plant one.</p>" +
		"<ol><li><b>Soak it up.</b> The seed takes in water from the soil. It swells and its hard coat softens and splits.</li>" +
		"<li><b>Root first.</b> A small root pushes out and grows <i>down</i>. The root holds the plant in place and drinks water.</li>" +
		"<li><b>Up and out.</b> A curved stem pushes <i>up</i> through the soil, pulling the seed halves with it.</li>" +
		"<li><b>First leaves.</b> In the sunlight, the stem straightens and the first green leaves open. Now the plant can make its own food from sunlight, air and water.</li>" +
		"<li><b>Flowers and pods.</b> After several weeks, small flowers appear. Each flower can become a bean pod with new seeds inside.</li></ol>" +
		"<p><b>Try it!</b> Put a damp paper towel inside a clear jar and slide a bean seed between the towel and the glass. Keep the towel wet. In a few days you can watch the root appear.</p>" +
		"<p class=\"pt-caption\">Did you know? A seed does not need sunlight to sprout. It needs water, air and warmth. Sunlight matters once the leaves appear.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "Which part of the plant grows out of the seed first?", c: ["The root", "The leaves", "The flower", "The bean pod"], why: "Step 2, \"Root first,\" says a small root pushes out and grows down." },
		{ skill: "sequence", diff: "easy", type: "order", q: "Put the stages in the order they happen.", c: ["The seed swells with water.", "A root grows down.", "The stem pushes up through the soil.", "Flowers appear."], why: "The numbered steps give the order: soak, root, stem, leaves, then flowers and pods." },
		{ skill: "structure", diff: "medium", type: "mc", q: "Why did the author use a numbered list?", c: ["To show the steps happen in order", "To show which step is most important", "To count how many seeds to plant", "To make the text rhyme"], why: "Numbers are used when order matters. Each stage of growing happens after the one before it." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "In step 1, the seed <b>swells</b>. What does <i>swells</i> mean?", c: ["Gets bigger", "Gets drier", "Turns green", "Falls apart"], why: "The seed takes in water and gets bigger, until its coat splits. That is what \"swells\" means." },
		{ skill: "infer", diff: "hard", type: "mc", q: "A student keeps a bean seed in a dark cupboard with a wet paper towel. What will most likely happen?", c: ["The seed will start to sprout.", "Nothing, because seeds need sunlight to sprout.", "Flowers will grow right away.", "The seed will turn into a pebble."], why: "The \"Did you know?\" box says seeds need water, air and warmth to sprout, not sunlight. Light only matters once the leaves come out." },
		{ skill: "written", diff: "medium", type: "written", q: "What three things does a seed need to start growing? Where in the text did you find this?", model: "A seed needs water, air and warmth to start growing. I found this in the \"Did you know?\" box at the end of the text.", keys: [["water", "wet", "damp"], ["air"], ["warm", "warmth", "heat"], ["did you know", "box", "end", "bottom", "last"]], need: 3, rubric: "Full marks: water, air and warmth, and where the information is (the \"Did you know?\" box)." }
	  ] },

	{ id: "g4-rain", grade: 4, genre: "poem", title: "Rain on the Roof",
	  html: "<p class=\"pt-poem\">The rain came knocking after dark,<br>a thousand tapping fingers,<br>it drummed upon the old tin shed<br>where summer's warm air lingers.</p>" +
		"<p class=\"pt-poem\">It pattered on the window glass,<br>it gurgled down the spout,<br>it whispered to the sleeping cat,<br>\"Don't you dare go out!\"</p>" +
		"<p class=\"pt-poem\">I listened, cozy in my bed,<br>my blanket to my chin,<br>the rain played music on the roof<br>and sang me softly in.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "Where is the speaker of the poem?", c: ["In bed", "In the tin shed", "Outside in the rain", "By the window with the cat"], why: "The last verse says \"I listened, cozy in my bed.\"" },
		{ skill: "purpose", diff: "medium", type: "mc", q: "\"The rain came knocking\" and \"it whispered to the sleeping cat.\" Why does the poet describe the rain this way?", c: ["To make the rain seem like a person", "To show that the rain is very loud", "To explain where rain comes from", "To show that the cat is afraid"], why: "Knocking and whispering are things people do. Giving rain human actions is called personification." },
		{ skill: "vocab", diff: "medium", type: "multi", q: "Choose <b>TWO</b> words the poet uses for the <b>sounds</b> rain makes.", c: ["pattered", "gurgled", "lingers", "cozy", "chin"], right: [0, 1], why: "\"Pattered\" and \"gurgled\" are sound words. \"Lingers,\" \"cozy\" and \"chin\" don't describe sounds." },
		{ skill: "structure", diff: "medium", type: "mc", q: "Which word rhymes with \"spout\" in the poem?", c: ["out", "glass", "cat", "dark"], why: "In verse 2 the second and fourth lines end with \"spout\" and \"out,\" which rhyme." },
		{ skill: "main", diff: "hard", type: "mc", q: "What is the mood (feeling) of the poem by the end?", c: ["Calm and comfortable", "Scary and dark", "Sad and lonely", "Excited and noisy"], why: "The speaker is \"cozy\" with a blanket to the chin, and the rain sings them \"softly\" to sleep. That feels calm and safe." },
		{ skill: "written", diff: "hard", type: "written", q: "The poem says the rain \"played music on the roof.\" Do you think this is a good way to describe rain? Explain using a detail from the poem.", model: "Yes, because rain on a roof makes a steady rhythm like a drum. The poem says the rain \"drummed upon the old tin shed\" and \"pattered\" on the glass, so it sounds like music that helps the speaker fall asleep.", keys: [["drum", "tap", "patter", "pattered", "knock", "beat", "rhythm", "sound", "noise"], ["sleep", "soft", "cozy", "calm", "relax", "song", "sang"], ["yes", "no", "good", "because", "think"]], need: 2, rubric: "Full marks: an opinion with a reason, AND a detail from the poem (drummed, pattered, tapping, sang me softly in)." }
	  ] },

	{ id: "g4-pancakes", grade: 4, genre: "poem", title: "Saturday Pancakes",
	  html: "<p class=\"pt-poem\">Flour like snow in a mountain heap,<br>an egg that cracks with a crunchy <i>cheep</i>,<br>milk that swirls in a soft white stream:<br>Dad and I are a pancake team.</p>" +
		"<p class=\"pt-poem\">The pan goes hot, the butter sings,<br>bubbles pop like tiny springs.<br>\"Wait,\" says Dad. \"Don't flip it yet.\"<br>Waiting is the hardest thing to get.</p>" +
		"<p class=\"pt-poem\">Then FLIP! It flies! It spins! It lands!<br>(Mostly in the pan. A bit on my hands.)<br>We stack them high and pour them sweet:<br>the best of Saturdays to eat.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "Who makes the pancakes with the speaker?", c: ["Dad", "Grandma", "A friend", "Mom"], why: "Verse 1 says \"Dad and I are a pancake team.\"" },
		{ skill: "purpose", diff: "medium", type: "mc", q: "\"Flour like snow in a mountain heap\" compares flour to snow. What does this help you picture?", c: ["A white, piled-up mound of flour", "Flour that is very cold", "Flour falling from the sky", "A pancake shaped like a mountain"], why: "A simile uses \"like\" to compare. Flour and snow are both white and powdery, and \"mountain heap\" shows it is piled up." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Why does the speaker say \"Waiting is the hardest thing to get\"?", c: ["They want to flip the pancake right away.", "They don't know how to cook.", "Dad is taking too long to find the pan.", "They are not hungry."], why: "Dad says not to flip it yet. The speaker finds it hard to be patient and wait for the right moment." },
		{ skill: "structure", diff: "medium", type: "mc", q: "Why are the words in line 1 of the last verse in capitals and short bursts: \"Then FLIP! It flies! It spins! It lands!\"?", c: ["To show the flip is fast and exciting", "To show that Dad is angry", "To make the poem longer", "To show the pancake is burnt"], why: "Short sentences, capital letters and exclamation marks make the moment feel quick and exciting." },
		{ skill: "infer", diff: "hard", type: "mc", q: "What does the line \"(Mostly in the pan. A bit on my hands.)\" tell you?", c: ["The flip wasn't perfect, and the speaker finds it funny.", "The speaker burned their hands.", "The pancake fell on the floor.", "Dad did the flip."], why: "The words in brackets are a funny aside: most of the pancake landed in the pan, but some batter got on the speaker's hands." },
		{ skill: "written", diff: "medium", type: "written", q: "How do you know the speaker enjoys making pancakes? Give two details from the poem.", model: "The speaker calls Dad and themselves \"a pancake team\" and says pancakes are \"the best of Saturdays.\" The exciting flip with exclamation marks also shows they are having fun.", keys: [["team"], ["best"], ["flip", "flies", "spins", "exclamation", "!"], ["sweet", "stack", "fun", "excit"]], need: 2, rubric: "Full marks: two details, e.g. \"pancake team\", \"the best of Saturdays\", the excited FLIP line." }
	  ] },

	{ id: "g4-garden", grade: 4, genre: "notice", title: "Community Garden Volunteer Day",
	  html: "<div class=\"pt-notice\"><h4>Help Our Garden Grow!</h4><p class=\"pt-sub\">Cedar Park Community Garden Volunteer Day</p>" +
		"<p><b>When:</b> Saturday, May 9, 10:00 a.m. to 1:00 p.m.<br><b>Where:</b> Cedar Park Community Garden, behind the library<br><b>Who:</b> Everyone! Children under 12 must come with an adult.</p>" +
		"<p><b>Jobs for the day:</b></p><ul><li>Planting tomatoes and beans</li><li>Pulling weeds</li><li>Painting the new garden signs</li><li>Filling the watering cans</li></ul>" +
		"<p><b>Bring:</b> gloves, a water bottle and a hat. We will supply the tools and seeds.</p>" +
		"<p>🍓 Free strawberry snacks at 11:30 a.m.!</p><p class=\"pt-small\">If it rains, we will meet on Sunday, May 10 at the same time. Questions? Email garden@cedarpark.example</p></div>",
	  qs: [
		{ skill: "purpose", diff: "easy", type: "mc", q: "What is the main purpose of this notice?", c: ["To ask people to come and help at the garden", "To sell strawberries", "To teach people how to grow tomatoes", "To tell people the library is closed"], why: "The title \"Help Our Garden Grow!\" and the list of jobs show the notice is asking for volunteers." },
		{ skill: "detail", diff: "easy", type: "mc", q: "What time do the free snacks start?", c: ["11:30 a.m.", "10:00 a.m.", "1:00 p.m.", "12:00 p.m."], why: "The strawberry line says \"Free strawberry snacks at 11:30 a.m.!\"" },
		{ skill: "detail", diff: "medium", type: "multi", q: "Choose <b>TWO</b> things volunteers should bring.", c: ["Gloves", "A water bottle", "Seeds", "Garden tools", "Paint"], right: [0, 1], why: "The \"Bring\" line lists gloves, a water bottle and a hat. The garden supplies the tools and seeds." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Nine-year-old Kai wants to help. What must Kai do?", c: ["Come with an adult", "Bring his own seeds", "Email the garden first", "Wait until Sunday"], why: "The \"Who\" line says children under 12 must come with an adult, and Kai is 9." },
		{ skill: "infer", diff: "hard", type: "mc", q: "It is pouring rain on Saturday morning. When should a volunteer go to the garden?", c: ["Sunday, May 10 at 10:00 a.m.", "Saturday at 1:00 p.m.", "Sunday, May 10 at 11:30 a.m.", "The event is cancelled."], why: "The small print says that if it rains they meet Sunday, May 10 \"at the same time,\" which is 10:00 a.m." },
		{ skill: "written", diff: "medium", type: "written", q: "Which job from the list would you choose, and why? Use information from the notice.", model: "I would choose painting the new garden signs because I like art, and the garden will supply the tools, so I only need to bring gloves, a water bottle and a hat.", keys: [["plant", "tomato", "bean", "weed", "paint", "sign", "water"], ["because", "since", "so", "like", "enjoy", "good at"]], need: 2, rubric: "Full marks: names one job from the list AND gives a reason." }
	  ] },

	{ id: "g4-library", grade: 4, genre: "notice", title: "Summer Reading Challenge",
	  html: "<div class=\"pt-notice\"><h4>📚 The Great Summer Reading Challenge</h4><p class=\"pt-sub\">Riverside Public Library · July 1 to August 31</p>" +
		"<p>Read any books you like: comics, chapter books, books about sharks or space. Every <b>20 minutes</b> of reading earns one star on your reading card.</p>" +
		"<table class=\"pt-tbl\"><thead><tr><th>Stars</th><th>Prize</th></tr></thead><tbody><tr><td>10</td><td>Bookmark</td></tr><tr><td>25</td><td>Library badge</td></tr><tr><td>50</td><td>Free book to keep</td></tr></tbody></table>" +
		"<p><b>How to join:</b> Pick up a reading card at the front desk. Bring it back each week to get your stars stamped.</p>" +
		"<p><b>Finish party:</b> Everyone who reaches 50 stars is invited to a party with a magician on Saturday, September 5.</p><p class=\"pt-small\">Free for ages 5 to 12. You need a library card. Ask us how to get one: it's free too!</p></div>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "How long must you read to earn one star?", c: ["20 minutes", "1 hour", "One whole book", "10 minutes"], why: "The notice says \"Every 20 minutes of reading earns one star.\"" },
		{ skill: "structure", diff: "easy", type: "mc", q: "Why does the notice use a table?", c: ["To show clearly which prize you get for each number of stars", "To show the library's opening hours", "To list the books you must read", "To show the party guests"], why: "The table matches each number of stars (10, 25, 50) with a prize, so it's quick to read." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Owen read for 10 hours this summer. Which prize can he get?", c: ["A library badge", "A bookmark only", "A free book", "No prize"], why: "10 hours = 600 minutes, and 600 ÷ 20 = 30 stars. 30 stars is more than 25 but less than 50, so he gets the badge (and the bookmark)." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "What does the word <b>Challenge</b> mean in the title?", c: ["A goal that takes effort to reach", "A test with right and wrong answers", "An argument", "A race against other libraries"], why: "A challenge is something hard you try to do. Here it's a reading goal that takes all summer." },
		{ skill: "purpose", diff: "hard", type: "mc", q: "Why does the notice say you can read \"comics, chapter books, books about sharks or space\"?", c: ["To show that all kinds of reading count", "To list the only books allowed", "To advertise a book about sharks", "To show the library has no other books"], why: "The examples are very different from each other, which shows readers they can pick anything they like." },
		{ skill: "written", diff: "medium", type: "written", q: "Explain the steps a child would follow to take part and get to the finish party.", model: "First they need a library card. Then they pick up a reading card at the front desk. They read, earning a star for every 20 minutes, and bring the card back each week for stamps. When they reach 50 stars they are invited to the party on September 5.", keys: [["front desk", "pick up", "reading card"], ["20 minutes", "star"], ["week", "stamp"], ["50"]], need: 3, rubric: "Full marks: gets a reading card, earns stars (20 minutes = 1 star), gets them stamped weekly, reaches 50 stars." }
	  ] },

	// =============================== GRADE 7 ===============================
	{ id: "g7-tryout", grade: 7, genre: "story", title: "The List on the Gym Door",
	  html: "<p>Kai read the list on the gym door three times, as if his name might appear if he looked hard enough. Twelve names. Not his.</p>" +
		"<p>He had practised all summer. He had dribbled in the driveway until the streetlights came on, until his neighbour leaned out the window and asked, politely, if the ball ever got tired. None of it had been enough.</p>" +
		"<p>\"Kai.\" Coach Ramirez was standing behind him with a clipboard. \"Got a minute?\"</p>" +
		"<p>Kai didn't trust his voice, so he nodded.</p>" +
		"<p>\"Your defence is the best I saw at tryouts,\" the coach said. \"Your shooting isn't there yet. I need a team manager this season: stats, practice set-up, film. You'd be at every practice. And next year, we'll see.\"</p>" +
		"<p>Kai wanted to say no. Being the manager felt like being handed the bench with a bow on it. But the word that came out of his mouth was \"Okay.\"</p>" +
		"<p>It turned out that keeping stats meant watching every shot. By November, Kai could tell which players drifted left when they were tired, and why the team lost the fourth quarter of every close game. He started staying after practice, shooting from the spots where his notes said the team missed most. Two hundred shots a night. Then three hundred.</p>" +
		"<p>In March, at the last game of the season, the team was down by one with eight seconds left. Kai, at the end of the bench with his clipboard, already knew where the ball would go.</p>" +
		"<p>He also knew, for the first time, exactly what he would work on next.</p>",
	  qs: [
		{ skill: "infer", diff: "easy", type: "mc", q: "Why does Kai read the list three times?", c: ["He is hoping he missed his name.", "The list is hard to read.", "He wants to memorize the team.", "The coach asked him to check it."], why: "\"As if his name might appear if he looked hard enough\" shows he can't believe he was left off and is hoping he missed it." },
		{ skill: "purpose", diff: "medium", type: "mc", q: "The neighbour asks \"if the ball ever got tired.\" What does this detail show?", c: ["Kai practised for a very long time", "The neighbour wanted to play too", "The ball was old and worn out", "Kai's practising was quiet"], why: "It's a polite joke that tells us Kai dribbled so long and so often that the neighbour noticed. It shows his hard work." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "Kai thinks being manager is like \"being handed the bench with a bow on it.\" What does he mean?", c: ["It feels like a disappointment dressed up as a gift.", "He is excited to get a present.", "He will have to sit on a decorated bench.", "The coach is making fun of him."], why: "A bow makes something look like a present. Kai feels the job is really just \"not playing\" made to look nice." },
		{ skill: "sequence", diff: "medium", type: "order", q: "Put these events in order.", c: ["Kai practises in his driveway all summer.", "Kai does not make the team.", "Coach Ramirez offers Kai the manager job.", "Kai starts shooting hundreds of shots after practice."], why: "Summer practice comes first (told as a flashback), then the list, then the offer, then his extra shooting during the season." },
		{ skill: "main", diff: "hard", type: "mc", q: "Which sentence best states the theme of the story?", c: ["A setback can show you what to work on and help you grow.", "Coaches always choose the best players.", "Defence is more important than shooting.", "You should never accept a job you didn't want."], why: "Kai is cut, takes a job he didn't want, learns from watching every shot and ends the season knowing exactly what to improve. That's growth after a setback." },
		{ skill: "structure", diff: "hard", type: "mc", q: "Why does the author end the story before we find out who wins the last game?", c: ["Because the story is about Kai's growth, not the score", "Because the author forgot to finish it", "To show that Kai's team lost", "So the reader will think Kai is sad"], why: "The ending focuses on Kai knowing \"exactly what he would work on next.\" The game result isn't the point." },
		{ skill: "written", diff: "hard", type: "written", q: "How does being team manager help Kai? Support your answer with two details from the story.", model: "Being manager helps Kai become a better player. Keeping stats means he watches every shot, so he learns which players drift left when tired and why the team loses close games. He uses his notes to practise from the spots where the team misses most, shooting hundreds of shots a night, so by the end he knows exactly what to work on.", keys: [["stats", "watch", "notes", "every shot"], ["drift", "fourth quarter", "close game", "missed", "miss most"], ["practi", "shots", "two hundred", "three hundred", "after practice"], ["better", "improve", "learn", "work on", "next year"]], need: 3, rubric: "Full marks: a clear point (it helps him learn / improve) with two details, e.g. watching every shot, noticing patterns, practising from the spots the team misses." }
	  ] },

	{ id: "g7-cannery", grade: 7, genre: "story", title: "The Tin in the Shed",
	  html: "<p>The shed behind Grandma Rosa's house smelled like dust and old rain. Mateo had been sent to find a garden hose, but what he found, behind a stack of clay pots, was a rusty biscuit tin.</p>" +
		"<p>Inside were photographs with soft, curled corners. A row of young people in rubber aprons stood in front of a long wooden building beside the water. Someone had written on the back in faded pencil: <i>Cannery, Steveston, 1962.</i></p>" +
		"<p>\"That's me,\" Grandma Rosa said when he brought it in. She tapped the smallest girl in the photo. \"Fifteen years old. Summer job. I smelled like fish until October.\"</p>" +
		"<p>Mateo laughed, but she wasn't joking. She told him about the whistle that blew when the boats came in, even at midnight. About the cold water and the noise of the machines, and the women who sang in three languages so the time would pass. About the friend in the photo, Etsuko, who taught her to fillet a salmon in nine seconds.</p>" +
		"<p>\"Why did you keep these in a biscuit tin in the shed?\" Mateo asked.</p>" +
		"<p>Grandma Rosa was quiet for a moment. \"I suppose I thought nobody would want them.\"</p>" +
		"<p>That evening, Mateo scanned every photo. He labelled each one with what she remembered: names, dates, the song about the river. He made a folder on the family computer called <i>Grandma's Summer</i>.</p>" +
		"<p>The garden hose stayed in the shed. Nobody seemed to mind.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "What was Mateo looking for in the shed?", c: ["A garden hose", "A biscuit tin", "Old photographs", "Clay pots"], why: "The first paragraph says Mateo \"had been sent to find a garden hose.\" He found the tin by accident." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "Based on the story, what is a <b>cannery</b>?", c: ["A place where fish is prepared and packed", "A shop that sells biscuits", "A school for young people", "A boat that catches salmon"], why: "Clues: rubber aprons, boats coming in, filleting salmon, smelling like fish. A cannery is a factory that packs fish into cans." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Why did the women sing \"so the time would pass\"?", c: ["The work was long and tiring.", "They were practising for a concert.", "The boss asked them to sing.", "They wanted to drown out the whistle."], why: "The cold, noise and long hours suggest hard, boring work. Singing helped the shifts feel shorter." },
		{ skill: "infer", diff: "hard", type: "mc", q: "Grandma Rosa says, \"I suppose I thought nobody would want them.\" What does Mateo's reaction show?", c: ["He thinks her memories are valuable and worth keeping.", "He agrees the photos aren't important.", "He wants to sell the photos.", "He is annoyed that she kept them hidden."], why: "That same evening he scans and labels every photo and makes a folder for them, showing he values her story." },
		{ skill: "structure", diff: "hard", type: "mc", q: "What is the effect of the last two sentences: \"The garden hose stayed in the shed. Nobody seemed to mind.\"?", c: ["They show that finding the photos mattered more than the chore.", "They show that Mateo is lazy.", "They tell us the family has no garden.", "They show that Grandma is still upset."], why: "The hose was the reason for the trip. Ending with it forgotten shows that what Mateo found was more important, in a gentle, slightly funny way." },
		{ skill: "detail", diff: "medium", type: "multi", q: "Choose <b>TWO</b> details that show the cannery job was hard.", c: ["The whistle blew even at midnight.", "The water was cold and the machines were noisy.", "Etsuko was her friend.", "The photos had curled corners.", "Mateo made a folder on the computer."], right: [0, 1], why: "Working at midnight and in cold, noisy conditions show the job was hard. The other details are about friendship, the photos or Mateo." },
		{ skill: "written", diff: "hard", type: "written", q: "What does Mateo learn about his grandmother? Explain using two details from the story.", model: "Mateo learns that his grandmother worked hard at a fish cannery in Steveston when she was only fifteen. She worked in cold, noisy conditions, even at midnight when the boats came in, and she made friends like Etsuko, who taught her to fillet a salmon in nine seconds. He also learns that she didn't think her memories mattered.", keys: [["cannery", "fish", "salmon", "steveston", "1962"], ["fifteen", "15", "young", "summer job"], ["midnight", "cold", "noise", "whistle", "hard"], ["etsuko", "friend", "sang", "sing", "fillet"], ["nobody would want", "didn't think", "matter"]], need: 3, rubric: "Full marks: what he learns (she worked at a cannery as a teen / her past matters) plus two supporting details." }
	  ] },

	{ id: "g7-glacier", grade: 7, genre: "info", title: "Rivers of Ice",
	  html: "<h4>How a glacier forms</h4><p>A glacier begins as snow. In high mountains, more snow falls in winter than melts in summer. Year after year, new layers pile on top and press down on the old ones, squeezing out the air until the snow becomes dense blue ice. When the ice is thick and heavy enough, usually more than about 30 metres, it begins to move downhill under its own weight. It has become a glacier.</p>" +
		"<h4>Ice that flows</h4><p>It is hard to imagine solid ice flowing, but a glacier behaves a little like very thick syrup. Most glaciers move only a few centimetres to a few metres a day. As they move, they grind the rock beneath them, carve U-shaped valleys and carry rocks the size of houses. When a glacier melts back, it leaves these rocks behind in places where they seem not to belong.</p>" +
		"<h4>Glaciers in British Columbia</h4><p>British Columbia has thousands of glaciers. Their meltwater feeds rivers that supply drinking water, generate hydroelectric power and keep streams cool for salmon in late summer, when there is little rain.</p>" +
		"<h4>A shrinking resource</h4><p>Scientists measure glaciers by comparing photographs, satellite images and markers drilled into the ice. Most glaciers in western Canada are getting smaller. When more ice melts each summer than snow adds each winter, a glacier loses mass and its front edge moves back uphill, even though the ice inside is still flowing down. This is called <b>retreat</b>.</p>" +
		"<p class=\"pt-caption\">Sidebar: The word <i>glacier</i> comes from the French word <i>glace</i>, meaning \"ice.\"</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "What does a glacier begin as?", c: ["Snow", "Rain", "Sea water", "Blue rock"], why: "The first sentence says \"A glacier begins as snow.\"" },
		{ skill: "sequence", diff: "medium", type: "order", q: "Put the steps of glacier formation in order.", c: ["More snow falls than melts.", "Layers of snow press down on older layers.", "Air is squeezed out and the snow turns into dense ice.", "The thick ice starts to move downhill."], why: "\"How a glacier forms\" describes this order: snow piles up, it is pressed down, it becomes ice, and when thick enough it flows." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "In this text, what does <b>dense</b> mean?", c: ["Tightly packed together", "Light and fluffy", "Very cold", "Easy to melt"], why: "The air is squeezed out, so the ice is packed tightly. That is what dense means." },
		{ skill: "purpose", diff: "medium", type: "mc", q: "Why does the author compare a glacier to \"very thick syrup\"?", c: ["To help readers picture solid ice slowly flowing", "To show that glaciers are sweet", "To explain why glaciers are blue", "To show that glaciers melt quickly"], why: "Syrup flows slowly even though it's thick. The comparison helps us imagine something hard to picture: ice that flows." },
		{ skill: "infer", diff: "hard", type: "mc", q: "According to the text, why could shrinking glaciers be a problem for salmon?", c: ["Less meltwater could leave streams warmer in late summer.", "Salmon eat ice.", "Glaciers block salmon from swimming upstream.", "Melting glaciers make the ocean too salty."], why: "The text says glacier meltwater keeps streams cool for salmon in late summer. Less ice would mean less cool water then." },
		{ skill: "structure", diff: "hard", type: "mc", q: "A glacier is still flowing downhill, but its front edge is moving uphill. How does the text explain this?", c: ["More ice melts each summer than snow adds each winter.", "The glacier is flowing backwards.", "Scientists drill markers that push the ice uphill.", "The glacier is getting thicker at the bottom."], why: "In \"A shrinking resource,\" retreat happens when melting is greater than snowfall: the front melts back faster than the ice flows forward." },
		{ skill: "written", diff: "hard", type: "written", q: "Explain two reasons why glaciers are important to people in British Columbia, using information from the text.", model: "Glaciers are important because their meltwater feeds rivers that supply drinking water and make hydroelectric power. They also keep streams cool for salmon in late summer when there is little rain.", keys: [["drinking", "drink"], ["hydro", "electric", "power"], ["salmon", "cool", "stream"], ["river", "meltwater"]], need: 2, rubric: "Full marks: two of: drinking water, hydroelectric power, cool water for salmon in late summer." }
	  ] },

	{ id: "g7-salmon", grade: 7, genre: "info", title: "Fish in the Forest",
	  html: "<p>Every fall, millions of salmon swim from the Pacific Ocean up the rivers of British Columbia to the streams where they hatched. They lay their eggs, and then they die. It sounds like the end of a story. For the forest, it is the beginning of one.</p>" +
		"<h4>Ocean food on land</h4><p>A salmon spends years at sea eating and growing. Its body is full of nutrients from the ocean, especially a form of nitrogen that scientists can tell apart from the nitrogen found on land. By testing trees beside salmon streams, researchers have found that a large share of the nitrogen in some trees came from salmon.</p>" +
		"<h4>How does a fish get into a tree?</h4><p>Bears are a big part of the answer. A bear may catch dozens of salmon in a day, carry each one into the forest, and eat only the best parts. The rest is left on the forest floor. Eagles, ravens, wolves and insects finish the leftovers, and what is left breaks down into the soil. The roots of nearby trees take up those nutrients.</p>" +
		"<h4>Trees that help fish</h4><p>The connection works both ways. Tall trees shade the streams and keep the water cool. Their roots hold the banks in place so mud does not cover the gravel where eggs are laid. Fallen logs make pools where young salmon can hide.</p>" +
		"<p><b>In short:</b> salmon feed the forest, and the forest protects the salmon.</p>",
	  qs: [
		{ skill: "main", diff: "medium", type: "mc", q: "What is the main idea of this text?", c: ["Salmon and forests depend on each other.", "Bears are the most important animals in B.C.", "Salmon die after they lay their eggs.", "Trees need nitrogen to grow."], why: "The text explains how salmon feed the forest and how the forest protects salmon. The last line sums it up." },
		{ skill: "detail", diff: "easy", type: "mc", q: "According to the text, which animal is \"a big part of the answer\" to how fish get into trees?", c: ["Bears", "Eagles", "Wolves", "Insects"], why: "\"How does a fish get into a tree?\" begins: \"Bears are a big part of the answer.\"" },
		{ skill: "detail", diff: "medium", type: "multi", q: "Choose <b>TWO</b> ways trees help salmon.", c: ["They shade streams and keep the water cool.", "Their roots stop mud from covering the gravel.", "They drop seeds that salmon eat.", "They make the water saltier.", "They chase away bears."], right: [0, 1], why: "\"Trees that help fish\" lists shade, roots holding the banks, and logs making pools. The others aren't in the text." },
		{ skill: "infer", diff: "hard", type: "mc", q: "How do scientists know that some nitrogen in trees came from salmon?", c: ["Ocean nitrogen can be told apart from land nitrogen.", "They watched bears carry salmon to each tree.", "The trees smell like fish.", "Salmon bones were found inside the trees."], why: "The text says salmon carry a form of nitrogen that scientists can tell apart from land nitrogen, and they test trees beside streams." },
		{ skill: "structure", diff: "medium", type: "mc", q: "The first paragraph says the salmon's death \"sounds like the end of a story. For the forest, it is the beginning of one.\" Why does the author begin this way?", c: ["To surprise the reader and lead into the main idea", "To tell a made-up story about a salmon", "To show the text is a poem", "To explain how to catch salmon"], why: "The surprising twist makes the reader curious and sets up the main idea: a salmon's death feeds the forest." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "What does <b>nutrients</b> mean in this text?", c: ["Substances living things need to grow", "Kinds of fish", "Parts of a river", "Scientific tools"], why: "Salmon carry nutrients from the ocean, and tree roots take them up to grow. Nutrients are what living things need for food and growth." },
		{ skill: "written", diff: "hard", type: "written", q: "Explain how nutrients travel from the ocean to a tree. Use at least three steps from the text.", model: "First, salmon eat and grow in the ocean, so their bodies fill with ocean nutrients. Then they swim up rivers, and bears catch them and carry them into the forest, leaving the leftovers. Eagles, wolves and insects eat the rest and it breaks down into the soil, where tree roots take up the nutrients.", keys: [["ocean", "sea"], ["swim", "river", "stream"], ["bear", "carry", "catch"], ["soil", "break down", "breaks down", "rot", "decompos"], ["root"]], need: 4, rubric: "Full marks: at least three linked steps: salmon get nutrients at sea, swim upstream, bears carry them into the forest, leftovers break down into soil, roots take them up." }
	  ] },

	{ id: "g7-lighthouse", grade: 7, genre: "poem", title: "Lighthouse",
	  html: "<p class=\"pt-poem\">All night it stands where the land runs out,<br>one eye open,<br>turning, turning,<br>while the sea throws its weight against the rocks<br>like a crowd that will not be told no.</p>" +
		"<p class=\"pt-poem\">It does not argue with the storm.<br>It does not chase the ships.<br>It only says, again and again,<br>in the one word it knows:<br><i>here</i>.</p>" +
		"<p class=\"pt-poem\">And somewhere out in the black,<br>a fisher who has never seen its face<br>turns the wheel a little left,<br>and lives.</p>",
	  qs: [
		{ skill: "purpose", diff: "medium", type: "mc", q: "The lighthouse is described as having \"one eye open.\" What is the \"eye\"?", c: ["Its light", "A window for the keeper", "The moon", "A ship's lantern"], why: "The poet describes the lighthouse like a person keeping watch. Its turning light is its open eye." },
		{ skill: "purpose", diff: "medium", type: "mc", q: "\"The sea throws its weight against the rocks / like a crowd that will not be told no.\" What does this simile suggest about the sea?", c: ["It is powerful and pushes again and again.", "It is calm and quiet.", "It is full of people.", "It is about to stop."], why: "A crowd that won't take no for an answer keeps pushing. The sea keeps crashing against the rocks with force." },
		{ skill: "infer", diff: "hard", type: "mc", q: "What is the \"one word\" the lighthouse knows, and what does it mean to the ships?", c: ["\"Here\": it tells them where the dangerous land is.", "\"Stop\": it tells them to stop sailing.", "\"Home\": it tells them they have arrived.", "\"Storm\": it warns that a storm is coming."], why: "The poem gives the word: \"here.\" The light marks where the land and rocks are so ships can steer away." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Why does the fisher turn \"the wheel a little left\"?", c: ["To steer away from the rocks after seeing the light", "To go home for the night", "To chase the lighthouse", "Because the storm is over"], why: "The fisher sees the light, knows where the land is, and steers to avoid it, which is why they \"live.\"" },
		{ skill: "main", diff: "hard", type: "mc", q: "Which is the best statement of the poem's theme?", c: ["Quiet, steady help can save lives, even when no one sees the helper.", "Storms are more powerful than people.", "Fishing is a dangerous job.", "Lighthouses are beautiful buildings."], why: "The lighthouse doesn't argue or chase; it just keeps shining. A fisher \"who has never seen its face\" is saved. The poem honours steady, unseen help." },
		{ skill: "structure", diff: "hard", type: "mc", q: "Why is the last line, \"and lives.\", so short?", c: ["It makes the most important idea stand out.", "The poet ran out of words.", "It shows the fisher is tired.", "It is the name of the boat."], why: "A very short last line after longer ones makes the reader pause on it. The poem's point, a life saved, lands with force." },
		{ skill: "written", diff: "hard", type: "written", q: "The poet describes the lighthouse as if it were a person. Give two examples and explain what they show about the lighthouse.", model: "The lighthouse has \"one eye open,\" which makes it seem like a guard keeping watch all night. It \"does not argue with the storm\" and \"says\" the word \"here,\" which shows it is patient and steady: it doesn't fight, it just keeps helping ships know where the land is.", keys: [["eye"], ["argue", "chase", "says", "word", "here", "stands"], ["watch", "guard", "steady", "patient", "calm", "help", "protect", "safe", "warn"]], need: 2, rubric: "Full marks: two examples of personification (one eye open, does not argue, says \"here\", stands) AND what they show (steady, watchful, helpful)." }
	  ] },

	{ id: "g7-summer", grade: 7, genre: "poem", title: "The Last Day of August",
	  html: "<p class=\"pt-poem\">The lake is warmer than it's been all year,<br>which seems unfair, now that we have to leave.<br>My brother counts the cabins, pier to pier,<br>my mother folds the towels on her sleeve.</p>" +
		"<p class=\"pt-poem\">I swim out to the rock one final time<br>and lie there, sun-baked, listening to the loons.<br>The new school shoes are waiting by the door,<br>still stiff, and smelling faintly of balloons.</p>" +
		"<p class=\"pt-poem\">Tomorrow there'll be lockers, bells and names<br>I'll have to learn, and maybe I'll be glad.<br>But here the water holds me like it knows<br>it's giving back the summer that I had.</p>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "What will happen tomorrow?", c: ["School starts.", "The family arrives at the lake.", "The speaker's birthday party.", "A swimming race."], why: "The last verse mentions \"lockers, bells and names I'll have to learn,\" and new school shoes wait by the door." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Why does the speaker think the warm lake \"seems unfair\"?", c: ["The water is finally perfect just when they must leave.", "The lake is too warm to swim in.", "Their brother gets to stay longer.", "The cabins are all full."], why: "The lake is the warmest it's been all year on the very last day, which feels unfair because they are leaving." },
		{ skill: "main", diff: "medium", type: "mc", q: "Which word best describes the speaker's feelings?", c: ["Mixed: sad to leave, but a little hopeful", "Angry", "Terrified", "Bored"], why: "The speaker is sad to leave the lake but says \"maybe I'll be glad\" about school. The feelings are mixed." },
		{ skill: "structure", diff: "hard", type: "mc", q: "Look at the rhymes in verse 1 (year / pier, leave / sleeve). What pattern does the poet use?", c: ["Every other line rhymes (ABAB).", "Every pair of lines rhymes (AABB).", "Nothing rhymes.", "Only the last two lines rhyme."], why: "Line 1 rhymes with line 3 (year/pier) and line 2 with line 4 (leave/sleeve): an ABAB pattern." },
		{ skill: "purpose", diff: "hard", type: "mc", q: "\"The water holds me like it knows / it's giving back the summer that I had.\" What does this suggest?", c: ["The lake seems to understand that summer is ending and offers one last good moment.", "The speaker is in danger in the water.", "The lake will give the speaker a gift.", "The speaker wants to go to school right away."], why: "The water is given feelings (it \"knows\"). The image suggests the lake is gently saying goodbye by giving one more perfect summer moment." },
		{ skill: "written", diff: "hard", type: "written", q: "Choose two details from the poem that show summer is ending. Explain how each one shows it.", model: "The mother \"folds the towels,\" which shows the family is packing up to leave the lake. The \"new school shoes are waiting by the door,\" which shows school, and the end of summer, is about to start.", keys: [["towel", "fold", "pack"], ["shoe", "school", "locker", "bell"], ["final", "last", "leave", "count"]], need: 2, rubric: "Full marks: two details (towels folded, final swim, school shoes, lockers and bells) with an explanation of how each shows summer is ending." }
	  ] },

	{ id: "g7-lunch", grade: 7, genre: "opinion", title: "Letter: Give Us a Longer Lunch",
	  html: "<p><i>From the student newspaper, The Hillside Echo</i></p><p>Dear Editor,</p>" +
		"<p>Our lunch break is 40 minutes long. That sounds like plenty until you subtract the time it takes to line up for the microwave (about 10 minutes on a busy day), find a seat, and actually eat. By the time most of us get outside, the warning bell is ringing. I am writing to ask the school to make lunch 60 minutes long.</p>" +
		"<p>First, a longer lunch would be better for our health. Many students skip finishing their food so they have time to play. Eating slowly and moving around are both good for growing bodies, and right now we have to choose one or the other.</p>" +
		"<p>Second, clubs would have time to meet. The chess club, the coding club and the garden club all meet at lunch. Their members have to choose between eating and joining in. Last year the art club stopped meeting because nobody could fit it in.</p>" +
		"<p>Some people will say that a longer lunch means school finishes later. That is true: it would end 20 minutes later. But a survey of 120 students in my grade found that 88 of them would rather stay later than rush at lunch. That is almost three out of four.</p>" +
		"<p>I hope the principal and the parent council will consider this change. A better lunch makes for a better afternoon.</p>" +
		"<p>Sincerely,<br>Nia T., Grade 7</p>",
	  qs: [
		{ skill: "main", diff: "easy", type: "mc", q: "What does Nia want the school to do?", c: ["Make lunch 60 minutes long", "Buy more microwaves", "Start a new art club", "End the school day earlier"], why: "Paragraph 2 states it directly: \"I am writing to ask the school to make lunch 60 minutes long.\"" },
		{ skill: "detail", diff: "medium", type: "multi", q: "Choose <b>TWO</b> reasons Nia gives for her opinion.", c: ["It would be better for students' health.", "Clubs would have time to meet.", "Teachers need a longer break.", "The cafeteria food is too hot.", "Students want to leave school earlier."], right: [0, 1], why: "Her \"First\" and \"Second\" paragraphs give health and clubs as her two reasons." },
		{ skill: "structure", diff: "medium", type: "mc", q: "In paragraph 5, Nia writes \"Some people will say that a longer lunch means school finishes later.\" Why does she include this?", c: ["To answer an argument against her idea", "To agree that her idea is bad", "To change the topic", "To give her third reason"], why: "This is a counter-argument. Nia names the other side's point, admits it's true, then answers it with her survey." },
		{ skill: "purpose", diff: "hard", type: "mc", q: "Why does Nia include the survey result (88 out of 120 students)?", c: ["To give evidence that most students agree with her", "To show that she is good at math", "To prove lunch is too long", "To show that the art club needs members"], why: "Numbers from a survey are evidence. They show many students would accept finishing later, which supports her request." },
		{ skill: "vocab", diff: "medium", type: "mc", q: "What does \"subtract the time\" mean in paragraph 2?", c: ["Take away the time spent on other things", "Add up all the time", "Waste time on purpose", "Measure the time with a clock"], why: "Nia means you take away the time spent lining up and finding a seat, which leaves much less than 40 minutes to eat and play." },
		{ skill: "infer", diff: "hard", type: "mc", q: "Is Nia's claim that 88 out of 120 is \"almost three out of four\" accurate?", c: ["Yes, 88 ÷ 120 is about 73%, close to 75%.", "No, it's less than half.", "No, it's more than nine out of ten.", "Yes, it is exactly three out of four."], why: "Three out of four is 90 of 120. 88 is just under that (about 73%), so \"almost three out of four\" is fair." },
		{ skill: "written", diff: "hard", type: "written", q: "Do you think Nia's letter is convincing? Give your opinion and two reasons based on the letter.", model: "Yes, I think the letter is convincing. Nia gives clear reasons, like students' health and clubs not having time to meet, with an example of the art club ending. She also answers the other side by admitting school would end 20 minutes later and using a survey showing 88 of 120 students would accept that.", keys: [["yes", "no", "convincing", "persuasive", "agree", "disagree", "think"], ["health", "eat", "food"], ["club", "chess", "coding", "art"], ["survey", "88", "120", "evidence", "three out of four", "20 minutes", "later"]], need: 3, rubric: "Full marks: a clear opinion AND two reasons that point to parts of the letter (health, clubs, survey evidence, answering the counter-argument)." }
	  ] },

	{ id: "g7-camp", grade: 7, genre: "notice", title: "Youth Coding Camp",
	  html: "<div class=\"pt-notice\"><h4>💻 Build Your Own Game: Youth Coding Camp</h4><p class=\"pt-sub\">For ages 11 to 14 · No experience needed</p>" +
		"<p>Spend a week turning your ideas into a real video game you can play and share. You will design characters, write code to make them move, add sounds and test your game with friends.</p>" +
		"<table class=\"pt-tbl\"><thead><tr><th>Session</th><th>Dates</th><th>Time</th><th>Cost</th></tr></thead><tbody>" +
		"<tr><td>A</td><td>July 6 – 10</td><td>9 a.m. – 12 p.m.</td><td>$150</td></tr><tr><td>B</td><td>July 20 – 24</td><td>1 p.m. – 4 p.m.</td><td>$150</td></tr><tr><td>C (full day)</td><td>August 10 – 14</td><td>9 a.m. – 4 p.m.</td><td>$275</td></tr></tbody></table>" +
		"<p><b>Register early!</b> Each session has only 16 spots. Register before June 1 and save $25.</p>" +
		"<p><b>Bring:</b> a lunch (full-day session only) and a water bottle. Laptops are provided.</p><p class=\"pt-small\">Financial help is available. No one will be turned away because of cost. Ask at the front desk of the Westside Community Centre.</p></div>",
	  qs: [
		{ skill: "detail", diff: "easy", type: "mc", q: "Who is this camp for?", c: ["Ages 11 to 14", "Adults", "Ages 5 to 10", "Only experienced coders"], why: "The line under the title says \"For ages 11 to 14 · No experience needed.\"" },
		{ skill: "structure", diff: "easy", type: "mc", q: "Where would you look to find the dates of each session?", c: ["In the table", "In the title", "In the \"Bring\" section", "In the small print at the bottom"], why: "The table has a \"Dates\" column for sessions A, B and C." },
		{ skill: "infer", diff: "medium", type: "mc", q: "Jordan has swimming lessons every morning in July. Which session could Jordan take in July?", c: ["Session B", "Session A", "Session C", "None of them"], why: "Session A is in the morning. Session B (July 20–24) runs 1 p.m. to 4 p.m., in the afternoon. Session C is in August." },
		{ skill: "infer", diff: "medium", type: "mc", q: "How much would Session C cost if you register on May 15?", c: ["$250", "$275", "$300", "$150"], why: "Session C is $275, and registering before June 1 saves $25: $275 − $25 = $250." },
		{ skill: "purpose", diff: "hard", type: "mc", q: "Why does the notice say \"No one will be turned away because of cost\"?", c: ["So families who can't afford it know they can still come", "To show the camp is free for everyone", "To tell people the camp is full", "To ask people to donate money"], why: "It invites families who might worry about the price to ask about financial help. The camp is not free for everyone." },
		{ skill: "detail", diff: "medium", type: "multi", q: "Choose <b>TWO</b> things that are true about the camp.", c: ["Laptops are provided.", "Each session has 16 spots.", "You must already know how to code.", "Everyone must bring a lunch.", "It is held at a school."], right: [0, 1], why: "The notice says laptops are provided and each session has only 16 spots. Lunch is only for the full-day session, no experience is needed, and it's at a community centre." },
		{ skill: "written", diff: "medium", type: "written", q: "Which session would be best for someone who wants the most time to work on their game? Explain using information from the notice.", model: "Session C would be best because it is a full day, from 9 a.m. to 4 p.m., which is 7 hours a day instead of 3. It costs more ($275), so they should register before June 1 to save $25, and remember to bring a lunch.", keys: [["session c", " c ", "c (", "full day", "full-day"], ["9", "4 p.m", "7 hours", "longer", "more time", "all day"], ["275", "250", "lunch", "june 1", "august"]], need: 2, rubric: "Full marks: chooses Session C AND explains with details (full day, 9 to 4, more hours), possibly the cost or lunch." }
	  ] }
	];
	if (typeof module !== "undefined" && module.exports) module.exports = P;
	else root.PT_PASSAGES = P;
})(this);

/* MES Practice Tests page script (tool_apps_src/practice-tests/app.js). One script for the hub (/practice-tests) and the four test pages;
   data-page / data-grade / data-subject on #pt pick the page. Questions, checking and scoring: lib.js (window.MESPT) + passages.js.
   State: localStorage "mes-practice-tests:v1" = { runs: { "4-numeracy": run }, hist: [...], prefs: {...} }. Nothing is uploaded. */
(function () {
	"use strict";
	var T = window.MESPT, root = document.getElementById("pt");
	if (!T || !root) return;
	function $(id) { return document.getElementById(id); }
	var esc = T.esc, KEY = "mes-practice-tests:v1", S;
	try { S = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { S = {}; }
	if (!S || typeof S !== "object") S = {};
	S.runs = S.runs || {}; S.hist = Array.isArray(S.hist) ? S.hist : []; S.prefs = S.prefs || {};
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
	var toastT;
	function toast(msg) { var t = $("pt-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	var PAGES = { "4-numeracy": ["/fsa-grade-4-numeracy", "Grade 4 Numeracy"], "4-literacy": ["/fsa-grade-4-literacy", "Grade 4 Literacy"], "7-numeracy": ["/fsa-grade-7-numeracy", "Grade 7 Numeracy"], "7-literacy": ["/fsa-grade-7-literacy", "Grade 7 Literacy"] };
	var MODE_NAME = { full: "Full test", quick: "Quick 10", topic: "Topic practice" };
	function histRow(h, withPage) {
		var p = PAGES[h.p] || ["#", h.p], d = new Date(h.d), pct = h.max ? Math.round(h.got / h.max * 100) : 0;
		return '<li><span class="pt-hpct" style="--p:' + pct + '">' + pct + '%</span><span class="pt-hmain">' + (withPage ? '<a href="' + p[0] + '">' + p[1] + '</a> · ' : "") + MODE_NAME[h.mode] + (h.diff && h.diff !== "mixed" ? " (" + h.diff + ")" : "") +
			'<small>' + fmtNum(h.got) + " / " + h.max + " · " + T.fmtTime(h.ms) + " · " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · code " + h.code + "</small></span></li>";
	}
	function fmtNum(x) { return Math.round(x * 2) / 2 === Math.round(x) ? String(Math.round(x)) : String(Math.round(x * 2) / 2).replace(".5", "½"); }

	// =============================== HUB ===============================
	if (root.getAttribute("data-page") === "hub") {
		var hl = S.hist.slice().reverse().slice(0, 12);
		if (hl.length) { $("pt-hubhist").hidden = false; $("pt-hubhist-list").innerHTML = '<ul class="pt-hlist">' + hl.map(function (h) { return histRow(h, true); }).join("") + "</ul>"; }
		$("pt-hubclear").addEventListener("click", function () { if (!confirm("Clear all your saved results?")) return; S.hist = []; save(); $("pt-hubhist").hidden = true; });
		Object.keys(S.runs).forEach(function (k) { var r = S.runs[k], a = document.querySelector('.pt-tile[href="' + (PAGES[k] || [""])[0] + '"]'); if (r && !r.done && a) a.insertAdjacentHTML("beforeend", '<em class="pt-tile-badge">Test in progress</em>'); });
		return;
	}

	// =============================== TEST PAGE ===============================
	var GRADE = +root.getAttribute("data-grade"), SUBJ = root.getAttribute("data-subject"), PK = GRADE + "-" + SUBJ, LIT = SUBJ === "literacy";
	var sw = document.querySelector('.pt-switch a[data-k="' + PK + '"]'); if (sw) sw.setAttribute("aria-current", "page");
	var prefs = S.prefs[PK] || (S.prefs[PK] = { mode: "full", diff: "mixed", topics: [], timer: true, fb: false });
	var params = new URLSearchParams(location.search);
	if (/^(full|quick|topic)$/.test(params.get("mode") || "")) prefs.mode = params.get("mode");
	if (/^(mixed|easy|medium|hard)$/.test(params.get("diff") || "")) prefs.diff = params.get("diff");
	if (params.get("topic")) prefs.topics = [params.get("topic")];
	if (/^\d{3,9}$/.test(params.get("code") || "")) $("pt-code").value = params.get("code");
	var topicList = LIT ? T.SKILLS : T.TOPICS[GRADE];

	// ---------- start screen ----------
	$("pt-full-len").textContent = LIT ? "4 passages, about 24 questions" : "25 questions";
	$("pt-quick-len").textContent = LIT ? "2 passages, about 12 questions" : "10 questions";
	$("pt-topics").innerHTML = topicList.map(function (t) { return '<button type="button" class="tu-chip" data-t="' + t[0] + '" aria-pressed="false">' + esc(t[1]) + "</button>"; }).join("");
	function paintStart() {
		root.querySelectorAll(".pt-modes button").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-mode") === prefs.mode)); b.tabIndex = b.getAttribute("data-mode") === prefs.mode ? 0 : -1; });
		$("pt-topics-row").hidden = prefs.mode !== "topic";
		root.querySelectorAll("#pt-topics button").forEach(function (b) { b.setAttribute("aria-pressed", String(prefs.topics.indexOf(b.getAttribute("data-t")) >= 0)); });
		root.querySelectorAll("#pt-diff button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-d") === prefs.diff)); });
		$("pt-o-timer").checked = prefs.timer !== false;
		$("pt-o-fb").checked = prefs.mode === "topic" ? prefs.fb !== false : !!prefs.fbTest;
		$("pt-go").textContent = prefs.mode === "topic" ? "Start practising" : "Start the test";
		var run = S.runs[PK];
		$("pt-resume").hidden = !(run && !run.done);
		if (run && !run.done) $("pt-resume-txt").textContent = MODE_NAME[run.cfg.mode] + ", question " + (run.cur + 1) + " of " + run.n + ", " + T.fmtTime(run.ms) + " so far.";
		var hl = S.hist.filter(function (h) { return h.p === PK; }).reverse().slice(0, 8);
		$("pt-hist").hidden = !hl.length;
		if (hl.length) $("pt-hist-list").innerHTML = '<ul class="pt-hlist">' + hl.map(function (h) { return histRow(h, false); }).join("") + "</ul>";
	}
	root.querySelector(".pt-modes").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; prefs.mode = b.getAttribute("data-mode"); save(); paintStart(); });
	root.querySelector(".pt-modes").addEventListener("keydown", function (e) {
		if (!/^Arrow/.test(e.key)) return; e.preventDefault();
		var ms = ["full", "quick", "topic"], i = ms.indexOf(prefs.mode); i = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 2)) % 3; prefs.mode = ms[i]; save(); paintStart(); root.querySelector('.pt-modes [data-mode="' + ms[i] + '"]').focus();
	});
	$("pt-topics").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var t = b.getAttribute("data-t"), i = prefs.topics.indexOf(t); if (i >= 0) prefs.topics.splice(i, 1); else prefs.topics.push(t); save(); paintStart(); });
	$("pt-diff").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; prefs.diff = b.getAttribute("data-d"); save(); paintStart(); });
	$("pt-o-timer").addEventListener("change", function () { prefs.timer = this.checked; save(); });
	$("pt-o-fb").addEventListener("change", function () { if (prefs.mode === "topic") prefs.fb = this.checked; else prefs.fbTest = this.checked; save(); });
	function cfgNow(seed) {
		var code = parseInt($("pt-code").value, 10);
		return { grade: GRADE, subject: SUBJ, mode: prefs.mode, diff: prefs.diff, topics: prefs.mode === "topic" ? prefs.topics.slice() : [], seed: seed || (code > 0 ? code : T.newSeed()) };
	}
	$("pt-go").addEventListener("click", function () {
		if (prefs.mode === "topic" && !prefs.topics.length) { toast("Pick at least one topic."); $("pt-topics").querySelector("button").focus(); return; }
		startRun(cfgNow());
	});
	$("pt-resume-go").addEventListener("click", function () { resume(S.runs[PK]); });
	$("pt-resume-drop").addEventListener("click", function () { delete S.runs[PK]; save(); paintStart(); });
	$("pt-printblank").addEventListener("click", function () {
		if (prefs.mode === "topic" && !prefs.topics.length) { toast("Pick at least one topic."); return; }
		var cfg = cfgNow(), items = T.buildTest(cfg);
		printDoc(worksheetHtml(cfg, items));
	});

	// ---------- running a test ----------
	var run = null, items = [], timer = null, lastTick = 0;
	function feedbackOn() { return run && run.fb; }
	function startRun(cfg) {
		items = T.buildTest(cfg);
		run = { cfg: cfg, n: items.length, answers: [], flags: [], checked: [], cur: 0, ms: 0, done: false, started: Date.now(), timer: prefs.timer !== false, fb: prefs.mode === "topic" ? prefs.fb !== false : !!prefs.fbTest };
		S.runs[PK] = run; save();
		history.replaceState(null, "", location.pathname);
		showRun();
	}
	function resume(r) { run = r; items = T.buildTest(r.cfg); run.n = items.length; showRun(); }
	function showScreen(id) { ["pt-start", "pt-run", "pt-res"].forEach(function (s) { $(s).hidden = s !== id; }); }
	function showRun() {
		showScreen("pt-run");
		$("pt-clock").hidden = !run.timer;
		root.classList.toggle("pt-lit", LIT);
		buildMap(); render(); startClock();
		$("pt-qn").focus({ preventScroll: true });
		$("pt-run").scrollIntoView({ block: "start", behavior: "smooth" });
	}
	function startClock() {
		clearInterval(timer); lastTick = Date.now();
		timer = setInterval(function () {
			var now = Date.now();
			if (!document.hidden && run && !run.done) { run.ms += Math.min(now - lastTick, 5000); paintClock(); if (Math.floor(run.ms / 1000) % 5 === 0) save(); }
			lastTick = now;
		}, 1000);
	}
	function paintClock() { $("pt-clock").textContent = "⏱ " + T.fmtTime(run.ms); }
	function answered(i) { return T.checkAnswer(items[i], run.answers[i]).done; }
	function buildMap() {
		$("pt-map").innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + "</button>"; }).join("");
	}
	function paintMap() {
		$("pt-map").querySelectorAll("button").forEach(function (b, i) {
			b.classList.toggle("is-done", answered(i)); b.classList.toggle("is-flag", !!run.flags[i]); b.classList.toggle("is-cur", i === run.cur);
			if (run.fb && run.checked[i]) { var sc = T.checkAnswer(items[i], run.answers[i]).score; b.classList.toggle("is-right", sc === 1); b.classList.toggle("is-wrong", sc < 1); }
			b.setAttribute("aria-label", "Question " + (i + 1) + (answered(i) ? ", answered" : ", not answered") + (run.flags[i] ? ", marked for review" : ""));
			if (i === run.cur) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
		});
		var left = items.length - items.filter(function (x, i) { return answered(i); }).length;
		$("pt-prog-txt").innerHTML = "Question <b>" + (run.cur + 1) + "</b> of " + items.length + ' <span class="pt-left">· ' + (left ? left + " left to answer" : "all answered") + "</span>";
		$("pt-prog-fill").style.width = Math.round((items.length - left) / items.length * 100) + "%";
	}
	$("pt-map").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; go(+b.getAttribute("data-i")); });
	$("pt-mapbtn").addEventListener("click", function () { var m = $("pt-map"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); });

	function metaHtml(it) {
		return '<span class="pt-badge pt-d-' + it.diff + '">' + (it.diff === "easy" ? "● Easy" : it.diff === "medium" ? "●● Medium" : "●●● Hard") + "</span>" +
			'<span class="pt-badge pt-fit">Fits ' + T.fitLabel(it.fit) + "</span>" + '<span class="pt-badge pt-topic">' + esc(it.title) + "</span>";
	}
	var curPassage = null;
	function render() {
		var i = run.cur, it = items[i], a = run.answers[i], locked = run.fb && run.checked[i];
		$("pt-meta").innerHTML = metaHtml(it);
		$("pt-qn").textContent = "Question " + (i + 1);
		$("pt-q").innerHTML = '<div class="pt-qtext">' + it.q + "</div>" + (it.svg ? '<div class="pt-fig">' + it.svg + "</div>" : "") + (it.html ? '<div class="pt-fig">' + it.html + "</div>" : "");
		// passage
		if (it.passage) {
			var p = T.passageById(it.passage);
			$("pt-passage").hidden = false;
			if (curPassage !== p.id) { curPassage = p.id; $("pt-ptitle").innerHTML = "<span>" + esc(T.GENRES[p.genre]) + "</span> " + esc(p.title); $("pt-ptext").innerHTML = p.html; $("pt-ptext").scrollTop = 0; }
		} else $("pt-passage").hidden = true;
		$("pt-layout").classList.toggle("has-passage", !!it.passage);
		// answer area
		var h = "";
		if (it.type === "mc" || it.type === "multi") {
			var multi = it.type === "multi";
			h = '<fieldset class="pt-choices' + (it.choices.some(function (c) { return /<svg/.test(c); }) ? " pt-choices--pics" : "") + '"><legend class="pt-sr">Answer choices</legend>' + (multi ? '<p class="pt-hint">Choose ' + (it.need === 2 ? "two" : it.need) + " answers.</p>" : "") +
				it.choices.map(function (c, k) {
					var on = multi ? (a || []).indexOf(k) >= 0 : a === k;
					return '<label class="pt-choice' + (on ? " is-on" : "") + '"><input type="' + (multi ? "checkbox" : "radio") + '" name="pt-a" value="' + k + '"' + (on ? " checked" : "") + (locked ? " disabled" : "") + '><span class="pt-letter">' + "ABCDEFG"[k] + '</span><span class="pt-ctext">' + c + "</span></label>";
				}).join("") + "</fieldset>";
		} else if (it.type === "num") {
			h = '<div class="pt-numrow"><label for="pt-num" class="pt-sr">Your answer</label>' + (it.prefix ? '<span class="pt-fix">' + it.prefix + "</span>" : "") +
				'<input id="pt-num" class="tu-input tu-input--big pt-num" type="text" inputmode="' + (it.neg ? "text" : "decimal") + '" autocomplete="off" spellcheck="false" placeholder="Your answer" value="' + esc(a || "") + '"' + (locked ? " disabled" : "") + ">" +
				(it.unit ? '<span class="pt-fix">' + esc(it.unit) + "</span>" : "") + "</div>" + (it.neg ? '<p class="pt-hint">Type a minus sign for a negative number, e.g. −7.</p>' : "");
		} else if (it.type === "order") {
			var ord = Array.isArray(a) ? a : it.start;
			h = '<p class="pt-hint">Use the arrows to put the events in order, first at the top.</p><ol class="pt-order">' + ord.map(function (k, pos) {
				return '<li data-k="' + k + '"><span class="pt-otext">' + esc(it.items[k]) + '</span><span class="pt-obtn"><button type="button" data-mv="-1" aria-label="Move up: ' + esc(it.items[k]) + '"' + (pos === 0 || locked ? " disabled" : "") + '>↑</button><button type="button" data-mv="1" aria-label="Move down: ' + esc(it.items[k]) + '"' + (pos === ord.length - 1 || locked ? " disabled" : "") + ">↓</button></span></li>";
			}).join("") + "</ol>";
		} else if (it.type === "written") {
			var txt = (a && a.text) || "";
			h = '<label for="pt-wr" class="pt-hint">Write your answer in full sentences. You will compare it with a model answer at the end.</label><textarea id="pt-wr" class="tu-input pt-wr" rows="5"' + (locked ? " disabled" : "") + ">" + esc(txt) + '</textarea><div class="pt-small" id="pt-wc"></div>';
		}
		$("pt-ans").innerHTML = h;
		if (it.type === "written") wc();
		// buttons
		$("pt-prev").disabled = i === 0;
		$("pt-flag").setAttribute("aria-pressed", String(!!run.flags[i]));
		$("pt-flag").textContent = run.flags[i] ? "⚑ Marked" : "⚑ Mark for review";
		$("pt-check").hidden = !run.fb || locked;
		$("pt-next").textContent = i === items.length - 1 ? "Finish →" : "Next →";
		$("pt-fb").innerHTML = locked ? fbHtml(it, a) : "";
		paintMap(); if (run.timer) paintClock();
	}
	function fbHtml(it, a) {
		var r = T.checkAnswer(it, a), good = r.score === 1;
		if (it.type === "written") return '<div class="pt-fbbox pt-fb-info"><b>Compare with a model answer:</b><p>' + esc(it.model) + "</p><p class=\"pt-small\">" + esc(it.rubric) + "</p></div>";
		return '<div class="pt-fbbox ' + (good ? "pt-fb-ok" : "pt-fb-no") + '"><b>' + (good ? "✓ Correct!" : r.score ? "Partly right." : "✗ Not quite.") + "</b>" + (good ? "" : " The answer is: <b>" + T.answerText(it) + "</b>") + "<p>" + it.explain + "</p></div>";
	}
	function wc() { var t = ($("pt-wr").value || "").trim(), n = t ? t.split(/\s+/).length : 0; $("pt-wc").textContent = n + " word" + (n === 1 ? "" : "s"); }
	function setAns(v) { run.answers[run.cur] = v; save(); paintMap(); }
	$("pt-ans").addEventListener("change", function (e) {
		var it = items[run.cur], t = e.target;
		if (t.name !== "pt-a") return;
		if (it.type === "mc") setAns(+t.value);
		else { var sel = []; $("pt-ans").querySelectorAll("input:checked").forEach(function (x) { sel.push(+x.value); }); setAns(sel.sort()); }
		$("pt-ans").querySelectorAll(".pt-choice").forEach(function (l) { l.classList.toggle("is-on", l.querySelector("input").checked); });
	});
	$("pt-ans").addEventListener("input", function (e) {
		if (e.target.id === "pt-num") setAns(e.target.value);
		if (e.target.id === "pt-wr") { var old = run.answers[run.cur] || {}; setAns({ text: e.target.value, mark: old.mark }); wc(); }
	});
	$("pt-ans").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-mv]"); if (!b) return;
		var it = items[run.cur], ord = (Array.isArray(run.answers[run.cur]) ? run.answers[run.cur] : it.start).slice(), k = +b.closest("li").getAttribute("data-k"), p = ord.indexOf(k), q = p + +b.getAttribute("data-mv");
		if (q < 0 || q >= ord.length) return;
		ord.splice(p, 1); ord.splice(q, 0, k); setAns(ord); render();
		var nb = $("pt-ans").querySelector('li[data-k="' + k + '"] button[data-mv="' + b.getAttribute("data-mv") + '"]') || $("pt-ans").querySelector('li[data-k="' + k + '"] button:not([disabled])');
		if (nb) nb.focus();
		toast("Moved to position " + (q + 1));
	});
	$("pt-ans").addEventListener("keydown", function (e) {
		if (e.key === "Enter" && e.target.id === "pt-num") { e.preventDefault(); if (run.fb && !run.checked[run.cur]) doCheck(); else next(); }
	});
	function go(i) {
		if (i < 0 || i >= items.length) return;
		run.cur = i; save(); render();
		$("pt-qn").focus({ preventScroll: true });
		var top = $("pt-run").getBoundingClientRect().top;
		if (top < 0 || top > innerHeight * 0.5) $("pt-run").scrollIntoView({ block: "start" });
	}
	function next() { if (run.cur < items.length - 1) go(run.cur + 1); else finishAsk(); }
	function doCheck() {
		if (!answered(run.cur)) { toast("Answer the question first."); return; }
		run.checked[run.cur] = true; save(); render();
		$("pt-next").focus();
	}
	$("pt-prev").addEventListener("click", function () { go(run.cur - 1); });
	$("pt-next").addEventListener("click", next);
	$("pt-check").addEventListener("click", doCheck);
	$("pt-flag").addEventListener("click", function () { run.flags[run.cur] = !run.flags[run.cur]; save(); render(); });
	$("pt-finish").addEventListener("click", finishAsk);
	function finishAsk() {
		var left = items.filter(function (x, i) { return !answered(i); }).length, fl = run.flags.filter(Boolean).length;
		if ((left || fl) && !confirm((left ? left + " question" + (left > 1 ? "s are" : " is") + " not answered. " : "") + (fl ? fl + " marked for review. " : "") + "Finish the test anyway?")) {
			var first = items.findIndex(function (x, i) { return !answered(i) || run.flags[i]; }); if (first >= 0) go(first); return;
		}
		finish();
	}
	document.addEventListener("keydown", function (e) {
		if ($("pt-run").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
		var tag = (e.target.tagName || "").toLowerCase();
		if (tag === "input" && e.target.type === "text" || tag === "textarea") return;
		var it = items[run.cur];
		if (/^[1-7]$/.test(e.key) && it && (it.type === "mc" || it.type === "multi")) {
			var inp = $("pt-ans").querySelectorAll("input")[+e.key - 1]; if (inp && !inp.disabled) { inp.click(); inp.focus(); e.preventDefault(); }
		} else if (/^[a-g]$/i.test(e.key) && it && (it.type === "mc" || it.type === "multi") && tag !== "button") {
			var inp2 = $("pt-ans").querySelectorAll("input")["abcdefg".indexOf(e.key.toLowerCase())]; if (inp2 && !inp2.disabled) { inp2.click(); inp2.focus(); e.preventDefault(); }
		}
	});

	// ---------- results ----------
	function finish() {
		run.done = true; run.finished = Date.now(); clearInterval(timer);
		var sc = T.score(items, run.answers);
		S.hist.push({ p: PK, d: Date.now(), mode: run.cfg.mode, diff: run.cfg.diff, got: sc.got, max: sc.max, ms: run.ms, code: run.cfg.seed });
		if (S.hist.length > 60) S.hist = S.hist.slice(-60);
		run.histIdx = S.hist.length - 1;
		save(); showResults();
	}
	var revFilter = "all";
	function showResults() {
		showScreen("pt-res"); paintResults();
		$("pt-res").scrollIntoView({ block: "start", behavior: "smooth" });
		var h = $("pt-score").querySelector("h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
	}
	function paintResults() {
		var sc = T.score(items, run.answers), lv = T.level(sc.pct);
		if (run.histIdx >= 0 && S.hist[run.histIdx]) { S.hist[run.histIdx].got = sc.got; save(); }
		$("pt-score").innerHTML = '<div class="pt-ring" style="--p:' + sc.pct + '"><span>' + sc.pct + "%</span></div><div>" +
			"<h2 class=\"pt-h2\">" + fmtNum(sc.got) + " out of " + sc.max + " · " + esc(lv[0]) + "</h2><p>" + esc(lv[1]) + "</p>" +
			'<p class="pt-small">' + PAGES[PK][1] + " · " + MODE_NAME[run.cfg.mode] + (run.cfg.diff !== "mixed" ? " · " + run.cfg.diff : "") + " · time " + T.fmtTime(run.ms) + " · test code <b>" + run.cfg.seed + "</b></p>" +
			(items.some(function (it) { return it.type === "written"; }) ? '<p class="pt-small">Written answers are marked by you: check the suggested mark for each one below.</p>' : "") + "</div>";
		$("pt-bytopic").innerHTML = sc.topics.map(function (t) {
			var p = Math.round(t.got / t.max * 100);
			return '<div class="pt-trow"><span class="pt-tname">' + esc(t.title) + '</span><span class="pt-tbar" aria-hidden="true"><i style="width:' + p + '%" class="' + (p >= 80 ? "is-good" : p >= 50 ? "is-mid" : "is-low") + '"></i></span><span class="pt-tnum">' + fmtNum(t.got) + "/" + t.max + '</span><button type="button" class="pt-link" data-prac="' + t.topic + '">Practise</button></div>';
		}).join("");
		paintReview();
	}
	function yourAnswer(it, a) {
		if (a === undefined || a === null || a === "" || (it.type === "written" && !(a.text || "").trim())) return "<i>No answer</i>";
		if (it.type === "mc") return it.choices[a];
		if (it.type === "multi") return a.map(function (k) { return it.choices[k]; }).join("; ");
		if (it.type === "order") return a.map(function (k, n) { return (n + 1) + ". " + esc(it.items[k]); }).join("<br>");
		if (it.type === "written") return esc(a.text).replace(/\n/g, "<br>");
		return esc((it.prefix && String(a).indexOf("$") < 0 ? it.prefix : "") + a + (it.unit && !/[a-z%°²]/i.test(a) ? " " + it.unit : ""));
	}
	function reviewItem(it, i, forPrint) {
		var a = run.answers[i], r = T.checkAnswer(it, a), cls = r.score === 1 ? "is-right" : r.score > 0 ? "is-part" : "is-wrong";
		var p = it.passage && (i === 0 || items[i - 1].passage !== it.passage) ? T.passageById(it.passage) : null;
		var h = (p && forPrint ? '<div class="pt-rpass"><h3>' + esc(p.title) + "</h3>" + p.html + "</div>" : "") + '<article class="pt-rev ' + cls + '"><header><b>' + (i + 1) + ".</b> " + (r.score === 1 ? "✓" : r.score > 0 ? "½" : "✗") + " " + metaHtml(it) + (it.passage && !forPrint ? '<span class="pt-badge">' + esc(T.passageById(it.passage).title) + "</span>" : "") + "</header>" +
			'<div class="pt-qtext">' + it.q + "</div>" + (it.svg ? '<div class="pt-fig">' + it.svg + "</div>" : "") + (it.html ? '<div class="pt-fig">' + it.html + "</div>" : "") +
			'<dl><dt>Your answer</dt><dd>' + yourAnswer(it, a) + "</dd><dt>" + (it.type === "written" ? "Model answer" : "Correct answer") + "</dt><dd>" + T.answerText(it) + "</dd>" +
			(it.type === "written" ? "<dt>How to mark it</dt><dd>" + esc(it.rubric) + "</dd>" : "<dt>Why</dt><dd>" + it.explain + "</dd>") + "</dl>";
		if (it.type === "written" && r.done && !forPrint) {
			var m = typeof a.mark === "number" ? a.mark : r.suggested;
			h += '<div class="pt-mark"><span>Your mark' + (typeof a.mark === "number" ? "" : " (suggested from key ideas found)") + ':</span><div class="tu-seg pt-seg" role="group" aria-label="Mark for question ' + (i + 1) + '">' +
				[[0, "Not yet"], [0.5, "Part"], [1, "Full"]].map(function (x) { return '<button type="button" data-mark="' + x[0] + '" data-i="' + i + '" aria-pressed="' + (m === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
		}
		return h + "</article>";
	}
	function paintReview() {
		root.querySelectorAll("#pt-revf button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === revFilter)); });
		var h = items.map(function (it, i) { if (revFilter === "wrong" && T.checkAnswer(it, run.answers[i]).score === 1) return ""; return reviewItem(it, i, false); }).join("");
		$("pt-review").innerHTML = h || "<p>Everything is right. Well done!</p>";
	}
	$("pt-revf").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; revFilter = b.getAttribute("data-f"); paintReview(); });
	$("pt-review").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-mark]"); if (!b) return;
		var i = +b.getAttribute("data-i"), a = run.answers[i] || {}; run.answers[i] = { text: a.text, mark: +b.getAttribute("data-mark") }; save();
		var y = scrollY; paintResults(); scrollTo(0, y);
	});
	$("pt-bytopic").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-prac]"); if (!b) return;
		prefs.mode = "topic"; prefs.topics = [b.getAttribute("data-prac")]; prefs.diff = "mixed"; save(); $("pt-code").value = ""; startRun(cfgNow());
	});
	$("pt-again").addEventListener("click", function () { $("pt-code").value = ""; delete S.runs[PK]; save(); showScreen("pt-start"); paintStart(); $("pt-start").scrollIntoView({ block: "start" }); });
	$("pt-retake").addEventListener("click", function () { var c = JSON.parse(JSON.stringify(run.cfg)); prefs.mode = c.mode; startRun(c); });
	$("pt-copy").addEventListener("click", function () {
		var sc = T.score(items, run.answers), txt = "MES Practice Test: " + PAGES[PK][1] + ", " + MODE_NAME[run.cfg.mode] + "\nScore: " + fmtNum(sc.got) + " / " + sc.max + " (" + sc.pct + "%) in " + T.fmtTime(run.ms) + "\n" +
			sc.topics.map(function (t) { return "  " + t.title + ": " + fmtNum(t.got) + "/" + t.max; }).join("\n") + "\nTest code " + run.cfg.seed + ": " + location.origin + location.pathname + "?mode=" + run.cfg.mode + "&code=" + run.cfg.seed;
		(navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copied."); }, function () { prompt("Copy your results:", txt); });
	});
	$("pt-print").addEventListener("click", function () {
		var sc = T.score(items, run.answers);
		printDoc('<h1>' + PAGES[PK][1] + " practice test: results</h1><p>" + MODE_NAME[run.cfg.mode] + " · score <b>" + fmtNum(sc.got) + " / " + sc.max + " (" + sc.pct + "%)</b> · time " + T.fmtTime(run.ms) + " · test code " + run.cfg.seed + " · " + new Date().toLocaleDateString() + "</p>" +
			'<table class="pt-tbl"><thead><tr><th>Topic</th><th>Score</th></tr></thead><tbody>' + sc.topics.map(function (t) { return "<tr><td>" + esc(t.title) + "</td><td>" + fmtNum(t.got) + " / " + t.max + "</td></tr>"; }).join("") + "</tbody></table>" +
			items.map(function (it, i) { return reviewItem(it, i, true); }).join(""));
	});

	// ---------- printing ----------
	function worksheetHtml(cfg, its) {
		var h = "<h1>" + PAGES[PK][1] + " practice test</h1><p>" + MODE_NAME[cfg.mode] + (cfg.diff !== "mixed" ? " · " + cfg.diff : "") + " · " + its.length + " questions · test code " + cfg.seed + "</p><p class=\"pt-pname\">Name: ______________________ &nbsp; Date: ____________</p>", last = null;
		its.forEach(function (it, i) {
			if (it.passage && it.passage !== last) { var p = T.passageById(it.passage); h += '<div class="pt-rpass"><h3>' + esc(p.title) + "</h3>" + p.html + "</div>"; last = it.passage; }
			h += '<article class="pt-wq"><b>' + (i + 1) + ".</b> <span class=\"pt-wmeta\">(" + it.diff + ", " + esc(it.title) + ")</span><div class=\"pt-qtext\">" + it.q + "</div>" + (it.svg ? '<div class="pt-fig">' + it.svg + "</div>" : "") + (it.html ? '<div class="pt-fig">' + it.html + "</div>" : "");
			if (it.type === "mc" || it.type === "multi") h += '<ol class="pt-wch" type="A">' + it.choices.map(function (c) { return "<li>" + c + "</li>"; }).join("") + "</ol>";
			else if (it.type === "order") h += '<ul class="pt-wch">' + it.start.map(function (k) { return "<li>____ " + esc(it.items[k]) + "</li>"; }).join("") + "</ul>";
			else if (it.type === "written") h += '<div class="pt-lines"></div>';
			else h += '<p class="pt-wline">Answer: ' + (it.prefix || "") + " ________________ " + (it.unit ? esc(it.unit) : "") + "</p>";
			h += "</article>";
		});
		h += '<section class="pt-key"><h2>Answer key</h2><ol>' + its.map(function (it) { return "<li><b>" + (it.type === "mc" ? "ABCDEFG"[it.answer] + ". " : it.type === "multi" ? it.answer.map(function (k) { return "ABCDEFG"[k]; }).join(" and ") + ". " : "") + "</b>" + T.answerText(it) + '<div class="pt-small">' + (it.type === "written" ? esc(it.rubric) : it.explain) + "</div></li>"; }).join("") + "</ol></section>";
		return h;
	}
	function printDoc(html) {
		var d = $("pt-print-doc");
		if (!d) { d = document.createElement("div"); d.id = "pt-print-doc"; d.className = "pt-printdoc"; document.body.appendChild(d); }
		d.innerHTML = html;
		document.body.classList.add("pt-printing");
		var done = function () { document.body.classList.remove("pt-printing"); window.removeEventListener("afterprint", done); };
		window.addEventListener("afterprint", done);
		setTimeout(function () { window.print(); setTimeout(done, 1500); }, 60);
	}

	// ---------- go ----------
	paintStart();
	var r0 = S.runs[PK];
	if (r0 && r0.done) { run = r0; items = T.buildTest(r0.cfg); if (location.hash === "#results") showResults(); }
	if (params.get("start") === "1" && !(r0 && !r0.done)) startRun(cfgNow());
})();
