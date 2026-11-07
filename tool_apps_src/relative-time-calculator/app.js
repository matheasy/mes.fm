/* MES Relative Time Calculator -- mes.fm/relative-time-calculator (UI; maths in lib.js, global RT).
 * localStorage "mes-relative-time:v1" = { m, d, a, b, k, ld, la, lb, lac, lbc, L, a0 }.
 * Links: ?m=age&d=1h&a=9w&b=70y&k=1  or  ?m=life&d=1d&la=dog&lb=human (la / lb = a lifespan id or a length like 5y). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("rt"); if (!root || !window.RT) return;
	var KEY = "mes-relative-time:v1", Y = RT.YEAR, SVGNS = "http://www.w3.org/2000/svg";
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var DEF = { m: "age", d: "1 hour", a: "9 weeks", b: "70 years", k: 1, ld: "1 day", la: "dog", lb: "human", lac: "", lbc: "", L: 80, a0: 5 };
	var st = JSON.parse(JSON.stringify(DEF));
	function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
	function clean(s) {
		var o = JSON.parse(JSON.stringify(DEF)); if (!s || typeof s !== "object") return o;
		o.m = s.m === "life" ? "life" : "age";
		["d", "a", "b", "ld", "lac", "lbc"].forEach(function (k) { if (typeof s[k] === "string") o[k] = s[k].slice(0, 60); });
		o.k = isFinite(+s.k) ? clamp(Math.round(+s.k * 100) / 100, 0, 1.5) : 1;
		var ok = function (id) { return id === "other" || !!RT.lifespan(id); };
		if (ok(s.la)) o.la = s.la; if (ok(s.lb)) o.lb = s.lb;
		o.L = isFinite(+s.L) ? clamp(Math.round(+s.L), 10, 130) : 80; o.a0 = isFinite(+s.a0) ? clamp(+s.a0, 0, 10) : 5; return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() {
		var q = new URLSearchParams(location.search); if (!q.has("d") && !q.has("m")) return;
		var s = JSON.parse(JSON.stringify(st)); s.m = q.get("m") === "life" ? "life" : "age";
		if (s.m === "age") { if (q.get("d")) s.d = q.get("d"); if (q.get("a")) s.a = q.get("a"); if (q.get("b")) s.b = q.get("b"); if (q.has("k")) s.k = q.get("k"); }
		else { if (q.get("d")) s.ld = q.get("d"); ["la", "lb"].forEach(function (k) { var v = q.get(k); if (!v) return; if (RT.lifespan(v)) s[k] = v; else { s[k] = "other"; s[k + "c"] = v; } }); }
		st = clean(s);
	}
	function toast(msg) { var t = $("rt-toast"); if (!t) { t = document.createElement("div"); t.id = "rt-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	/* log sliders */
	var RANGES = { d: [1, 100 * Y], a: [RT.DAY, 120 * Y], b: [RT.DAY, 120 * Y] };
	function toSlider(sec, r) { var l0 = Math.log10(r[0]), l1 = Math.log10(r[1]); return Math.round(clamp((Math.log10(sec) - l0) / (l1 - l0), 0, 1) * 1000); }
	function fromSlider(v, r) { var l0 = Math.log10(r[0]), l1 = Math.log10(r[1]); return Math.pow(10, l0 + v / 1000 * (l1 - l0)); }
	function niceText(sec) { return RT.fmt(sec, 2).replace(/,/g, ""); }
	var DEFU = { d: RT.HOUR, a: Y, b: Y };

	/* lifespan selects */
	function opts() { return RT.LIFESPANS.map(function (l) { return '<option value="' + l.id + '">' + esc(l.name) + " (about " + esc(RT.fmt(l.life, 3)) + ")</option>"; }).join("") + '<option value="other">Other: type a lifespan</option>'; }
	$("rt-la").innerHTML = opts(); $("rt-lb").innerHTML = opts();
	$("rt-ex").innerHTML = RT.EXAMPLES.map(function (e, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(e.label) + "</button>"; }).join("");

	function syncInputs() {
		[].forEach.call($("rt-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === st.m)); });
		$("rt-agebox").hidden = st.m !== "age"; $("rt-lifebox").hidden = st.m !== "life"; $("rt-feltcard").hidden = st.m !== "age";
		$("rt-swap").title = st.m === "age" ? "Swap the two ages" : "Swap the two animals";
		$("rt-d").value = st.d; $("rt-a").value = st.a; $("rt-b").value = st.b; $("rt-ld").value = st.ld;
		$("rt-la").value = st.la; $("rt-lb").value = st.lb; $("rt-lac").value = st.lac; $("rt-lbc").value = st.lbc;
		$("rt-lac").hidden = st.la !== "other"; $("rt-lbc").hidden = st.lb !== "other";
		$("rt-k").value = st.k; $("rt-L").value = st.L; $("rt-a0").value = st.a0; syncK(); syncSliders();
	}
	function syncK() { $("rt-ko").textContent = st.k.toFixed(2); [].forEach.call($("rt-kseg").children, function (b) { b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.k - st.k) < 1e-9)); }); }
	function syncSliders() { ["d", "a", "b"].forEach(function (k) { var s = RT.parse(st[k], DEFU[k]); if (s) $("rt-" + k + "s").value = toSlider(s, RANGES[k]); }); }

	function readOut(id, sec, prefix) { var el = $(id); if (!el) return; if (sec) { el.textContent = (prefix || "Read as ") + RT.fmt(sec, 4); el.classList.remove("is-bad"); } else { el.textContent = "Type a length like 1 hour, 9 weeks or 70 years"; el.classList.add("is-bad"); } }
	function shareText(sh) { if (!isFinite(sh)) return ""; if (sh >= 1) return RT.round(sh, 3) + "× the life so far"; if (sh >= 0.1) return RT.round(sh * 100, 3) + "% of it"; return "1/" + RT.round(1 / sh, 4) + " of it"; }
	function modelOf(k) { for (var i = 0; i < RT.MODELS.length; i++) if (Math.abs(RT.MODELS[i].k - k) < 1e-9) return RT.MODELS[i]; return null; }
	function ageWord(sec) { return RT.fmt(sec, 3); }

	var cur = null;
	function update() {
		if (st.m === "age") return updateAge();
		return updateLife();
	}
	function updateAge() {
		var d = RT.parse(st.d, RT.HOUR), a = RT.parse(st.a, Y), b = RT.parse(st.b, Y);
		readOut("rt-d-read", d); readOut("rt-a-read", a, "Age: "); readOut("rt-b-read", b, "Age: ");
		[["rt-d", d], ["rt-a", a], ["rt-b", b]].forEach(function (x) { $(x[0]).classList.toggle("rt-bad", !x[1]); });
		if (!d || !a || !b) { cur = null; $("rt-big").textContent = "—"; $("rt-sub").textContent = ""; $("rt-say").textContent = "Fill in all three boxes."; $("rt-models").innerHTML = ""; $("rt-bars").innerHTML = ""; $("rt-table").innerHTML = ""; felt(); return; }
		var res = RT.equiv(d, a, b, st.k), m = modelOf(st.k), x = res / d;
		cur = { d: d, a: a, b: b, res: res };
		$("rt-big").textContent = RT.fmt(res);
		var br = RT.breakdown(res); $("rt-sub").textContent = (br && br !== RT.fmt(res) ? br + " · " : "") + (m ? m.name : "Custom model (k = " + st.k.toFixed(2) + ")");
		var say;
		if (st.k === 1) say = "<b>" + esc(RT.fmt(d, 4)) + "</b> for someone aged <b>" + esc(ageWord(a)) + "</b> is " + esc(shareText(d / a).replace(" of it", "")) + " of their life so far. The same share of <b>" + esc(ageWord(b)) + "</b> is <b>" + esc(RT.fmt(res)) + "</b>.";
		else if (st.k === 0) say = "In clock time " + esc(RT.fmt(d, 4)) + " is the same at every age. Pick another model to see how it might <i>feel</i>.";
		else say = "With " + (m ? "the " + esc(m.name.toLowerCase()) : "this model") + ", <b>" + esc(RT.fmt(d, 4)) + "</b> at <b>" + esc(ageWord(a)) + "</b> feels like <b>" + esc(RT.fmt(res)) + "</b> at <b>" + esc(ageWord(b)) + "</b>.";
		if (st.k !== 0 && isFinite(x)) say += " " + (x >= 1 ? "That is " + RT.round(x, 3) + "× as long." : "That is 1/" + RT.round(1 / x, 3) + " as long.");
		$("rt-say").innerHTML = say;
		$("rt-models").innerHTML = RT.MODELS.map(function (mm) { var v = RT.equiv(d, a, b, mm.k), on = Math.abs(mm.k - st.k) < 1e-9; return '<button type="button" class="tu-stat rt-mcard' + (on ? " tu-stat--hero" : "") + '" data-k="' + mm.k + '" aria-pressed="' + on + '"><span class="tu-stat__label">' + esc(mm.name) + '</span><span class="tu-stat__value">' + esc(RT.fmt(v)) + '</span><span class="tu-stat__sub">' + esc(mm.who) + ". " + esc(mm.note) + "</span></button>"; }).join("");
		bars([{ label: "Age " + ageWord(a) + ": the whole life so far", slice: d, whole: a }, { label: "Age " + ageWord(b) + ": the whole life so far", slice: res, whole: b }]);
		$("rt-barsnote").textContent = st.k === 1 ? "Both slices are the same share of the life lived so far: that is the whole idea of the share-of-life rule. Tiny slices are drawn a little wider so you can see them." : "With this model the two slices are not the same share: older lives get a smaller slice than the share-of-life rule would give. Tiny slices are drawn a little wider so you can see them.";
		felt(); table();
	}
	function lifeOf(sel, custom) { if (sel === "other") return RT.parse(custom, Y); var l = RT.lifespan(sel); return l ? l.life : null; }
	function lifeName(sel) { var l = RT.lifespan(sel); return l ? l.name.replace(/ \(.*\)$/, "").toLowerCase() : "other animal"; }
	function updateLife() {
		var d = RT.parse(st.ld, RT.HOUR), la = lifeOf(st.la, st.lac), lb = lifeOf(st.lb, st.lbc);
		readOut("rt-ld-read", d); readOut("rt-la-read", st.la === "other" ? la : null, "Lifespan: "); readOut("rt-lb-read", st.lb === "other" ? lb : null, "Lifespan: ");
		if (st.la !== "other") $("rt-la-read").textContent = ""; if (st.lb !== "other") $("rt-lb-read").textContent = "";
		if (!d || !la || !lb) { $("rt-big").textContent = "—"; $("rt-sub").textContent = ""; $("rt-say").textContent = "Fill in the length and both lifespans."; $("rt-models").innerHTML = ""; $("rt-bars").innerHTML = ""; return; }
		var res = RT.lifespanEquiv(d, la, lb), na = lifeName(st.la), nb = lifeName(st.lb);
		$("rt-big").textContent = RT.fmt(res); var br = RT.breakdown(res); $("rt-sub").textContent = (br && br !== RT.fmt(res) ? br + " · " : "") + "same share of a whole lifespan";
		var who = function (sel, n, L) { return sel === "other" ? "a " + RT.fmt(L, 3).replace(/s$/, "") + " life" : "a typical " + n + "'s life (about " + RT.fmt(L, 3) + ")"; };
		$("rt-say").innerHTML = "<b>" + esc(RT.fmt(d, 4)) + "</b> is " + esc(shareText(d / la).replace(" of it", "")) + " of " + esc(who(st.la, na, la)) + ". The same share of " + esc(who(st.lb, nb, lb)) + " is <b>" + esc(RT.fmt(res)) + "</b>.";
		$("rt-models").innerHTML = "";
		bars([{ label: (st.la === "other" ? "A whole" : "A " + na + "'s whole") + " life (" + RT.fmt(la, 3) + ")", slice: d, whole: la }, { label: (st.lb === "other" ? "A whole" : "A " + nb + "'s whole") + " life (" + RT.fmt(lb, 3) + ")", slice: res, whole: lb }]);
		$("rt-barsnote").textContent = "Each bar is a whole typical lifespan; the slices are the same share of it. Lifespans are rough averages. Tiny slices are drawn a little wider so you can see them.";
	}

	function el(tag, attrs, text) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
	function bars(rows) {
		var W = Math.round(clamp($("rt-bars").clientWidth || 640, 300, 640)), x0 = 12, x1 = W - 12, bw = x1 - x0, rowH = 74, H = rows.length * rowH + 6, svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" });
		rows.forEach(function (r, i) {
			var y = 8 + i * rowH, sh = r.slice / r.whole, w = Math.min(bw, Math.max(5, sh * bw));
			svg.appendChild(el("text", { x: x0, y: y + 14, "class": "rt-bl" }, r.label));
			svg.appendChild(el("rect", { x: x0, y: y + 22, width: bw, height: 26, rx: 6, "class": "rt-bar" }));
			svg.appendChild(el("rect", { x: x1 - w, y: y + 22, width: w, height: 26, rx: w < 12 ? 2 : 6, "class": "rt-slice rt-slice--" + i }));
			var lab = RT.fmt(r.slice, 3) + " = " + shareText(sh);
			svg.appendChild(el("text", { x: x1, y: y + 64, "text-anchor": "end", "class": "rt-sl" }, lab));
		});
		var box = $("rt-bars"); box.innerHTML = ""; box.appendChild(svg); box.setAttribute("aria-label", rows.map(function (r) { return r.label + ", slice " + RT.fmt(r.slice, 3); }).join("; "));
	}

	var feltGeo = null;
	function felt() {
		var box = $("rt-felt"); if (st.m !== "age") return;
		var L = st.L, a0 = Math.min(st.a0, L - 1), W = Math.round(clamp(box.clientWidth || 640, 300, 640)), H = W < 480 ? 260 : 300, ml = 46, mr = 14, mt = 14, mb = 38, pw = W - ml - mr, ph = H - mt - mb;
		var X = function (age) { return ml + age / L * pw; }, Yp = function (f) { return mt + (1 - f) * ph; };
		var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" }), i;
		for (i = 0; i <= 4; i++) { var f = i / 4; svg.appendChild(el("line", { x1: ml, x2: W - mr, y1: Yp(f), y2: Yp(f), "class": "rt-gl" })); svg.appendChild(el("text", { x: ml - 6, y: Yp(f) + 4, "text-anchor": "end", "class": "rt-ax" }, Math.round(f * 100) + "%")); }
		var step = L > 100 || W < 480 ? 20 : 10; for (var t = 0; t <= L; t += step) svg.appendChild(el("text", { x: X(t), y: H - mb + 16, "text-anchor": "middle", "class": "rt-ax" }, String(t)));
		svg.appendChild(el("text", { x: W - mr, y: H - 4, "text-anchor": "end", "class": "rt-ax" }, "age (years)"));
		function path(k) { var p = "", n = 240; for (var j = 0; j <= n; j++) { var age = L * j / n; p += (j ? "L" : "M") + X(age).toFixed(1) + " " + Yp(RT.feltShare(age, L, k, a0)).toFixed(1); } return p; }
		RT.MODELS.forEach(function (m) { if (Math.abs(m.k - st.k) > 1e-9) svg.appendChild(el("path", { d: path(m.k), "class": "rt-c rt-c--" + m.id })); });
		svg.appendChild(el("path", { d: path(st.k), "class": "rt-c rt-c--main" }));
		var hw = RT.halfway(L, st.k, a0);
		svg.appendChild(el("line", { x1: X(hw), x2: X(hw), y1: Yp(0.5), y2: Yp(0), "class": "rt-half" })); svg.appendChild(el("line", { x1: ml, x2: X(hw), y1: Yp(0.5), y2: Yp(0.5), "class": "rt-half" }));
		svg.appendChild(el("circle", { cx: X(hw), cy: Yp(0.5), r: 4.5, "class": "rt-hdot" }));
		svg.appendChild(el("text", { x: X(hw) + 8, y: Yp(0.5) + 16, "class": "rt-hl" }, "half by " + RT.round(hw, 3)));
		if (cur) [["A", cur.a], ["B", cur.b]].forEach(function (p) { var age = p[1] / Y; if (age > L) return; var fy = RT.feltShare(age, L, st.k, a0); svg.appendChild(el("line", { x1: X(age), x2: X(age), y1: mt, y2: Yp(0), "class": "rt-mk" })); svg.appendChild(el("circle", { cx: X(age), cy: Yp(fy), r: 5, "class": "rt-mdot" })); svg.appendChild(el("text", { x: X(age) + (age > L * 0.85 ? -6 : 6), y: Yp(0) - 8 - (p[0] === "B" && Math.abs(cur.b - cur.a) / Y < L * 0.15 ? 16 : 0), "text-anchor": age > L * 0.85 ? "end" : "start", "class": "rt-ml" }, ageWord(p[1]))); });
		var guide = el("line", { x1: 0, x2: 0, y1: mt, y2: Yp(0), "class": "rt-guide", visibility: "hidden" }), gdot = el("circle", { cx: 0, cy: 0, r: 4.5, "class": "rt-gdot", visibility: "hidden" });
		svg.appendChild(guide); svg.appendChild(gdot);
		var hit = el("rect", { x: ml, y: mt, width: pw, height: ph, fill: "transparent", "class": "rt-hit" }); svg.appendChild(hit);
		box.innerHTML = ""; box.appendChild(svg);
		var lg = document.createElement("ul"); lg.className = "rt-legend"; lg.innerHTML = '<li><i class="rt-lg rt-lg--main"></i>' + esc(modelOf(st.k) ? modelOf(st.k).name : "Your model (k = " + st.k.toFixed(2) + ")") + "</li>" + RT.MODELS.filter(function (m) { return Math.abs(m.k - st.k) > 1e-9; }).map(function (m) { return '<li><i class="rt-lg"></i>' + esc(m.name) + "</li>"; }).join("") + '<li><i class="rt-lg rt-lg--half"></i>Half of your felt life</li>'; box.appendChild(lg);
		box.setAttribute("aria-label", "Share of felt life used by age, lifespan " + L + " years, memories from age " + a0 + ". Half is used by age " + RT.round(hw, 3) + ".");
		feltGeo = { svg: svg, guide: guide, gdot: gdot, X: X, Yp: Yp, L: L, a0: a0, ml: ml, pw: pw, W: W };
		readFelt(cur && cur.b / Y <= L ? cur.b / Y : null);
	}
	function readFelt(age, hover) {
		var g = feltGeo; if (!g) return; var k = st.k, hw = RT.halfway(g.L, k, g.a0), out;
		if (age == null) { out = "With a " + g.L + "-year life and memories from age " + g.a0 + ", <b>half of your felt life is used by age " + RT.round(hw, 3) + "</b> (clock time: " + RT.round(g.L / 2 + g.a0 / 2, 3) + ")."; }
		else {
			var fs = RT.feltShare(age, g.L, k, g.a0), fc = RT.feltShare(age, g.L, 0, g.a0);
			out = "At age <b>" + RT.round(age, 3) + "</b>: <b>" + Math.round(fs * 100) + "%</b> of your felt life is behind you" + (k !== 0 ? " (by the clock: " + Math.round(fc * 100) + "%)" : "") + ". Half was used by age " + RT.round(hw, 3) + ".";
		}
		$("rt-feltread").innerHTML = out;
		if (hover && age != null) { var x = g.X(age), y = g.Yp(RT.feltShare(age, g.L, k, g.a0)); g.guide.setAttribute("x1", x); g.guide.setAttribute("x2", x); g.guide.setAttribute("visibility", "visible"); g.gdot.setAttribute("cx", x); g.gdot.setAttribute("cy", y); g.gdot.setAttribute("visibility", "visible"); }
	}
	function feltMove(e) { var g = feltGeo; if (!g) return; var r = g.svg.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * g.W, age = clamp((sx - g.ml) / g.pw * g.L, 0, g.L); readFelt(age, true); }
	$("rt-felt").addEventListener("pointermove", feltMove); $("rt-felt").addEventListener("pointerdown", feltMove);
	$("rt-felt").addEventListener("pointerleave", function () { if (!feltGeo) return; feltGeo.guide.setAttribute("visibility", "hidden"); feltGeo.gdot.setAttribute("visibility", "hidden"); readFelt(cur && cur.b / Y <= feltGeo.L ? cur.b / Y : null); });

	function table() {
		if (!cur) return; var ages = [cur.a, cur.b, RT.DAY * 30, Y, 3 * Y, 6 * Y, 10 * Y, 18 * Y, 30 * Y, 45 * Y, 60 * Y, 80 * Y, 100 * Y], seen = {};
		ages = ages.filter(function (s) { var key = Math.round(s / 3600); if (seen[key]) return false; seen[key] = 1; return true; }).sort(function (x, y) { return x - y; });
		var m = modelOf(st.k);
		$("rt-table").innerHTML = "<thead><tr><th>Age</th><th>" + esc(RT.fmt(cur.d, 4)) + " at " + esc(ageWord(cur.a)) + " feels like</th><th>Share of the life so far</th></tr></thead><tbody>" + ages.map(function (s) {
			var v = RT.equiv(cur.d, cur.a, s, st.k), tag = s === cur.a ? ' <span class="rt-tag">your first age</span>' : s === cur.b ? ' <span class="rt-tag">your second age</span>' : "";
			return '<tr class="' + (tag ? "is-on" : "") + '"><td>' + esc(ageWord(s)) + tag + "</td><td><b>" + esc(RT.fmt(v)) + "</b></td><td>" + esc(shareText(v / s).replace(" of it", "")) + "</td></tr>";
		}).join("") + '</tbody><caption class="rt-cap">' + esc(m ? m.name : "Custom model, k = " + st.k.toFixed(2)) + "</caption>";
	}

	/* events */
	$("rt-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.m = b.dataset.m; save(); syncInputs(); update(); });
	["d", "a", "b"].forEach(function (k) {
		$("rt-" + k).addEventListener("input", function () { st[k] = this.value; var s = RT.parse(st[k], DEFU[k]); if (s) $("rt-" + k + "s").value = toSlider(s, RANGES[k]); save(); update(); });
		$("rt-" + k + "s").addEventListener("input", function () { st[k] = niceText(fromSlider(+this.value, RANGES[k])); $("rt-" + k).value = st[k]; save(); update(); });
	});
	$("rt-ld").addEventListener("input", function () { st.ld = this.value; save(); update(); });
	["la", "lb"].forEach(function (k) {
		$("rt-" + k).addEventListener("change", function () { st[k] = this.value; $("rt-" + k + "c").hidden = st[k] !== "other"; if (st[k] === "other") $("rt-" + k + "c").focus(); save(); update(); });
		$("rt-" + k + "c").addEventListener("input", function () { st[k + "c"] = this.value; save(); update(); });
	});
	$("rt-kseg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.k = +b.dataset.k; $("rt-k").value = st.k; syncK(); save(); update(); });
	$("rt-k").addEventListener("input", function () { st.k = +this.value; syncK(); save(); update(); });
	$("rt-models").addEventListener("click", function (e) { var b = e.target.closest(".rt-mcard"); if (!b) return; st.k = +b.dataset.k; $("rt-k").value = st.k; syncK(); save(); update(); });
	$("rt-L").addEventListener("input", function () { var v = +this.value; if (v >= 10 && v <= 130) { st.L = Math.round(v); save(); felt(); } });
	$("rt-a0").addEventListener("input", function () { var v = +this.value; if (v >= 0 && v <= 10 && this.value !== "") { st.a0 = v; save(); felt(); } });
	$("rt-swap").onclick = function () { if (st.m === "age") { var t = st.a; st.a = st.b; st.b = t; } else { var u = st.la; st.la = st.lb; st.lb = u; var c = st.lac; st.lac = st.lbc; st.lbc = c; } save(); syncInputs(); update(); };
	$("rt-reset").onclick = function () { var m = st.m; st = JSON.parse(JSON.stringify(DEF)); st.m = m; save(); syncInputs(); update(); toast("Back to the starting numbers"); };
	$("rt-ex").addEventListener("click", function (e) {
		var b = e.target.closest(".tu-chip"); if (!b) return; var x = RT.EXAMPLES[+b.dataset.i];
		if (x.m === "age") { st.m = "age"; st.d = x.d; st.a = x.a; st.b = x.b; } else { st.m = "life"; st.ld = x.d; st.la = x.la; st.lb = x.lb; }
		save(); syncInputs(); update(); $("rt-hero").scrollIntoView({ behavior: "smooth", block: "nearest" });
	});
	$("rt-link").onclick = function () {
		var q = new URLSearchParams(), base = location.origin + location.pathname;
		if (st.m === "age") { var d = RT.parse(st.d, RT.HOUR), a = RT.parse(st.a, Y), b = RT.parse(st.b, Y); if (!d || !a || !b) { toast("Fill in all three boxes first"); return; } q.set("m", "age"); q.set("d", RT.short(d)); q.set("a", RT.short(a)); q.set("b", RT.short(b)); q.set("k", String(st.k)); }
		else { var ld = RT.parse(st.ld, RT.HOUR); if (!ld) { toast("Fill in the length first"); return; } q.set("m", "life"); q.set("d", RT.short(ld)); ["la", "lb"].forEach(function (k) { if (st[k] === "other") { var s = RT.parse(st[k + "c"], Y); if (s) q.set(k, RT.short(s)); } else q.set(k, st[k]); }); }
		copy(base + "?" + q.toString(), "Link copied");
	};

	var lastW = 0; window.addEventListener("resize", function () { clearTimeout(window.__rtRs); window.__rtRs = setTimeout(function () { var w = $("rt-bars").clientWidth; if (Math.abs(w - lastW) > 20) { lastW = w; update(); } }, 150); });
	load(); fromUrl(); syncInputs(); update(); lastW = $("rt-bars").clientWidth;
	if (location.search) try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
})();
