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
