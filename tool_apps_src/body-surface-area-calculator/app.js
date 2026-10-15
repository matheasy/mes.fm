/* MES Body Surface Area Calculator -- mes.fm/body-surface-area-calculator (UI; maths in lib.js, global BS).
 * Stored in kg / cm; localStorage "mes-body-surface-area-calculator:v1" = { kg, cm, f, sex }. Links: ?kg=&cm=&f=&sex= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bs"); if (!root || !window.BS) return;
	var KEY = "mes-body-surface-area-calculator:v1";
	var EXAMPLES = [["Man, 80 kg, 180 cm", { kg: "80", cm: "180", sex: "m" }], ["Woman, 60 kg, 165 cm", { kg: "60", cm: "165", sex: "f" }], ["Child, 25 kg, 120 cm", { kg: "25", cm: "120", sex: "m" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { kg: "", cm: "", f: "mosteller", sex: "m" };
	function clean(s) { return { kg: String(s.kg || "").slice(0, 8), cm: String(s.cm || "").slice(0, 8), f: BS.FORMULAS[s.f] ? s.f : "mosteller", sex: s.sex === "f" ? "f" : "m" }; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("kg") && !q.has("cm")) return false; st = clean({ kg: q.get("kg"), cm: q.get("cm"), f: q.get("f") || "mosteller", sex: q.get("sex") || st.sex }); return true; }
	function toast(msg) { var t = $("bs-toast"); if (!t) { t = document.createElement("div"); t.id = "bs-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	$("bs-f").innerHTML = BS.ORDER.map(function (id) { return '<option value="' + id + '">' + esc(BS.FORMULAS[id].name) + "</option>"; }).join("");
	function fill(except) { var kg = BS.num(st.kg), cm = BS.num(st.cm); if (except !== "m") { $("bs-kg").value = kg > 0 ? BS.trim(kg, 2) : ""; $("bs-cm").value = cm > 0 ? BS.trim(cm, 1) : ""; } if (except !== "i") { $("bs-lb").value = kg > 0 ? BS.trim(BS.kgToLb(kg), 1) : ""; if (cm > 0) { var f = BS.cmToFtIn(cm); $("bs-ft").value = String(f.ft); $("bs-in").value = BS.trim(f.inch, 1); } else { $("bs-ft").value = ""; $("bs-in").value = ""; } } }
	function syncAll() { fill(); $("bs-f").value = st.f; [].forEach.call($("bs-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); }); }
	["bs-kg", "bs-cm"].forEach(function (id) { $(id).addEventListener("input", function () { var kg = BS.num($("bs-kg").value), cm = BS.num($("bs-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fill("m"); save(); update(true); }); });
	["bs-lb", "bs-ft", "bs-in"].forEach(function (id) { $(id).addEventListener("input", function () { var lb = BS.num($("bs-lb").value), ft = BS.num($("bs-ft").value), inch = BS.num($("bs-in").value); st.kg = lb > 0 ? String(Math.round(BS.lbToKg(lb) * 1000) / 1000) : ""; st.cm = (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BS.ftInToCm(ft, inch) * 100) / 100) : ""; fill("i"); save(); update(true); }); });
	$("bs-f").addEventListener("change", function () { st.f = this.value; save(); update(); });
	$("bs-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); syncAll(); update(); });
	$("bs-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("bs-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(Object.assign({}, st, EXAMPLES[+b.dataset.i][1])); save(); syncAll(); update(true); });
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function update(resetSlide) {
		var kg = BS.num(st.kg), cm = BS.num(st.cm), ok = BS.valid(cm, kg); $("bs-empty").hidden = ok; $("bs-out").hidden = !ok; cur = null; if (!ok) return;
		var a = BS.bsa(st.f, cm, kg, st.sex), avg = BS.mean(cm, kg, st.sex), F = BS.FORMULAS[st.f]; cur = { kg: kg, cm: cm, a: a, avg: avg };
		$("bs-hero").innerHTML = stat("Body surface area", BS.fix(a, 2) + " <small>m&sup2;</small>", esc(F.name), "tu-stat--hero") + stat("Average of 10 formulas", BS.fix(avg, 2) + " <small>m&sup2;</small>", "range " + BS.fix(Math.min.apply(null, BS.ORDER.map(function (i) { return BS.bsa(i, cm, kg, st.sex); })), 2) + "&ndash;" + BS.fix(Math.max.apply(null, BS.ORDER.map(function (i) { return BS.bsa(i, cm, kg, st.sex); })), 2)) + stat("In other units", BS.trim(a * 10.7639, 1) + " <small>ft&sup2;</small>", BS.group ? "" : BS.trim(a * 10000, 0) + " cm&sup2;") + stat("Compared with average", Math.round(a / (cm >= 140 ? BS.REFERENCE.adult : BS.REFERENCE.adult) * 100) + "%", "of the 1.73 m&sup2; reference adult");
		$("bs-hero").children[2].querySelector(".tu-stat__sub").textContent = BS.trim(a * 10000, 0) + " cm²"; 
		$("bs-verdict").innerHTML = "Your body surface area is about <b>" + BS.fix(a, 2) + " m&sup2;</b> by the " + esc(F.name.split(" (")[0]) + " formula (average of all ten: " + BS.fix(avg, 2) + " m&sup2;): <b>" + BS.category(a) + "</b> (average adult man 1.9 m&sup2;, woman 1.6 m&sup2;).";
		cmp(); var sl = $("bs-slide"); if (resetSlide || sl._k !== cm) { sl.min = Math.max(5, Math.round(kg * 0.5)); sl.max = Math.round(kg * 1.8); sl.step = 0.5; sl.value = kg; sl._k = cm; } curve(); table(); clin();
	}
	function table() { $("bs-ref").innerHTML = "<thead><tr><th>Formula</th><th>Equation</th><th>BSA for you</th></tr></thead><tbody>" + BS.ORDER.map(function (id) { var F = BS.FORMULAS[id]; return "<tr" + (id === st.f ? ' class="is-on"' : "") + "><td><b>" + esc(F.name) + "</b><br><span class=\"bs-small\">" + esc(F.cite) + "</span></td><td>" + esc(F.note) + "</td><td>" + BS.fix(BS.bsa(id, cur.cm, cur.kg, st.sex), 3) + " m&sup2;</td></tr>"; }).join("") + "</tbody>"; }
	function cmp() {
		var A = BS.all(cur.cm, cur.kg, st.sex), ids = BS.ORDER.slice().sort(function (x, y) { return A[y] - A[x]; }), W = 640, rowH = 26, H = 12 + ids.length * rowH + 22, L = 150, R = 56, mn = Math.min.apply(null, ids.map(function (i) { return A[i]; })) * 0.85, mx = Math.max.apply(null, ids.map(function (i) { return A[i]; })) * 1.04, X = function (v) { return L + (v - mn) / (mx - mn) * (W - L - R); }, s = "";
		ids.forEach(function (id, i) { var y = 6 + i * rowH; s += '<text class="bs-lbl" x="' + (L - 8) + '" y="' + (y + 14) + '" text-anchor="end">' + esc(BS.FORMULAS[id].name.split(" (")[0]) + '</text><rect class="bs-bar' + (id === st.f ? " is-sel" : "") + '" x="' + L + '" y="' + y + '" width="' + Math.max(2, X(A[id]) - L) + '" height="18" rx="4"><title>' + esc(BS.FORMULAS[id].name) + ": " + BS.fix(A[id], 3) + ' m2</title></rect><text class="bs-val" x="' + (X(A[id]) + 6) + '" y="' + (y + 14) + '">' + BS.fix(A[id], 2) + "</text>"; });
		s += '<line class="bs-avg" x1="' + X(cur.avg) + '" x2="' + X(cur.avg) + '" y1="2" y2="' + (H - 20) + '"/><text class="bs-ct" x="' + X(cur.avg) + '" y="' + (H - 6) + '" text-anchor="middle">average ' + BS.fix(cur.avg, 2) + " m²</text>"; $("bs-cmp").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	function curve() {
		var kg = +$("bs-slide").value, a = BS.bsa(st.f, cur.cm, kg, st.sex), d = kg - cur.kg;
		$("bs-slideo").textContent = BS.trim(kg, 1) + " kg (" + BS.trim(BS.kgToLb(kg), 0) + " lb)" + (Math.abs(d) > 0.2 ? ", " + (d > 0 ? "+" : "−") + BS.trim(Math.abs(d), 1) + " kg" : ""); $("bs-what").innerHTML = "At <b>" + BS.trim(kg, 1) + " kg</b> and " + BS.trim(cur.cm, 0) + " cm, your BSA would be <b>" + BS.fix(a, 2) + " m&sup2;</b>" + (Math.abs(d) > 0.2 ? " (" + (a - cur.a >= 0 ? "+" : "−") + BS.fix(Math.abs(a - cur.a), 2) + " m&sup2;)" : "") + ".";
		var W = 640, H = 220, L = 44, R = 12, T = 12, B = 30, w0 = +$("bs-slide").min, w1 = +$("bs-slide").max, pts = [], ys = []; for (var w = w0; w <= w1; w += (w1 - w0) / 40) { var v = BS.bsa(st.f, cur.cm, w, st.sex); pts.push([w, v]); ys.push(v); }
		var lo = Math.floor(Math.min.apply(null, ys) * 10) / 10 - 0.1, hi = Math.ceil(Math.max.apply(null, ys) * 10) / 10 + 0.1, X = function (v) { return L + (v - w0) / (w1 - w0) * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); }, s = "";
		var ra = [1.5, 2.1], ba = Math.max(lo, ra[0]), bb = Math.min(hi, ra[1]); if (bb > ba) s += '<rect class="bs-band" x="' + L + '" y="' + Y(bb) + '" width="' + (W - L - R) + '" height="' + (Y(ba) - Y(bb)) + '"/><text class="bs-ct" x="' + (L + 6) + '" y="' + (Y(bb) + 13) + '">typical adult range 1.5–2.1</text>';
		for (var g = Math.ceil(lo * 5) / 5; g <= hi; g += 0.2) s += '<line class="bs-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="bs-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g.toFixed(1) + "</text>";
		var step = (w1 - w0) > 100 ? 20 : 10; for (var t = Math.ceil(w0 / step) * step; t <= w1; t += step) s += '<text class="bs-ct" x="' + X(t) + '" y="' + (H - 10) + '" text-anchor="middle">' + t + "</text>";
		s += '<polyline class="bs-line" points="' + pts.map(function (p) { return X(p[0]) + "," + Y(p[1]); }).join(" ") + '"/><circle class="bs-dot" cx="' + X(cur.kg) + '" cy="' + Y(cur.a) + '" r="5"><title>now</title></circle><line class="bs-cross" x1="' + X(kg) + '" x2="' + X(kg) + '" y1="' + T + '" y2="' + (H - B) + '"/><circle class="bs-dot" style="fill:#1e2733" cx="' + X(kg) + '" cy="' + Y(a) + '" r="6"/><text class="bs-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">weight (kg) → BSA (m²) at ' + BS.trim(cur.cm, 0) + " cm</text>";
		$("bs-curve").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	$("bs-slide").addEventListener("input", function () { if (cur) curve(); });
	function clin() {
		if (!cur) return; var a = cur.a, dpm = BS.num($("bs-dpm").value), cap = BS.num($("bs-cap").value), ix = BS.num($("bs-idx").value), gf = BS.num($("bs-gfr").value), ad = BS.num($("bs-adult").value);
		$("bs-dres").innerHTML = dpm > 0 ? BS.trim(BS.dose(dpm, a, cap), 1) + " mg" + (cap > 0 && a > cap ? "<br><small class=\"bs-small\">BSA capped at " + cap + " m²</small>" : "<br><small class=\"bs-small\">" + BS.trim(dpm, 1) + " × " + BS.fix(a, 2) + " m²</small>") : "";
		$("bs-ires").innerHTML = ix > 0 ? BS.trim(BS.indexed(ix, a), 2) + " per m²<br><small class=\"bs-small\">e.g. cardiac index (normal 2.5–4.0 L/min/m²)</small>" : "";
		$("bs-gres").innerHTML = gf > 0 ? BS.trim(BS.deindexGfr(gf, a), 0) + " mL/min absolute<br><small class=\"bs-small\">for your BSA of " + BS.fix(a, 2) + " m²</small>" : "";
		$("bs-cres").innerHTML = ad > 0 ? BS.trim(BS.pediatricDose(ad, a), 1) + "<br><small class=\"bs-small\">adult dose × " + BS.fix(a, 2) + " ÷ 1.73</small>" : "";
	}
	["bs-dpm", "bs-cap", "bs-idx", "bs-gfr", "bs-adult"].forEach(function (id) { $(id).addEventListener("input", clin); });
	$("bs-link").onclick = function () { if (cur) copy(location.origin + "/body-surface-area-calculator?kg=" + BS.trim(cur.kg, 2) + "&cm=" + BS.trim(cur.cm, 1) + (st.f !== "mosteller" ? "&f=" + st.f : "") + (st.f === "schlich" ? "&sex=" + st.sex : ""), "Link copied"); }; $("bs-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update(true);
})();
