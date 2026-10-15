/* MES Protein Intake Calculator -- mes.fm/protein-intake-calculator (UI; maths in lib.js, global PI).
 * localStorage "mes-protein-intake-calculator:v1" = { kg, goal, meals, kcal, day: { foodIndex: servings } }. Links: ?kg=&goal=&meals=&kcal= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pi"); if (!root || !window.PI) return;
	var KEY = "mes-protein-intake-calculator:v1";
	var EXAMPLES = [["80 kg, build muscle", { kg: "80", goal: "muscle", kcal: "" }], ["65 kg, lose fat", { kg: "65", goal: "cut", kcal: "1800" }], ["70 kg, over 65", { kg: "70", goal: "older", kcal: "" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { kg: "", goal: "active", meals: "0", kcal: "", diet: "all", day: {} };
	function clean(s) { var o = { kg: String(s.kg || "").slice(0, 8), goal: PI.GOALS.some(function (g) { return g.id === s.goal; }) ? s.goal : "active", meals: /^[0-6]$/.test(String(s.meals)) ? String(s.meals) : "0", kcal: String(s.kcal || "").replace(/\D/g, "").slice(0, 5), diet: PI.DIETS.some(function (d) { return d.id === s.diet; }) ? s.diet : "all", day: {} }; if (s.day && typeof s.day === "object") Object.keys(s.day).forEach(function (k) { var v = Math.round(+s.day[k]); if (PI.FOODS[+k] && v > 0 && v < 50) o.day[k] = v; }); return o; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("kg")) return false; var day = st.day; st = clean({ kg: q.get("kg"), goal: q.get("goal") || st.goal, meals: q.get("meals") || "0", kcal: q.get("kcal") || "", diet: q.get("diet") || st.diet }); st.day = day; return true; }
	function toast(msg) { var t = $("pi-toast"); if (!t) { t = document.createElement("div"); t.id = "pi-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	$("pi-diet").innerHTML = PI.DIETS.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + "</option>"; }).join("");
	$("pi-goal").innerHTML = PI.GOALS.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("");
	function fill(except) { var kg = PI.num(st.kg); if (except !== "kg") $("pi-kg").value = kg > 0 ? PI.trim(kg, 2) : ""; if (except !== "lb") $("pi-lb").value = kg > 0 ? PI.trim(PI.kgToLb(kg), 1) : ""; }
	function syncAll() { fill(); $("pi-goal").value = st.goal; $("pi-meals").value = st.meals; $("pi-diet").value = st.diet; $("pi-kcal").value = st.kcal; }
	$("pi-kg").addEventListener("input", function () { var v = PI.num(this.value); st.kg = v > 0 ? String(v) : ""; fill("kg"); save(); update(); });
	$("pi-lb").addEventListener("input", function () { var v = PI.num(this.value); st.kg = v > 0 ? String(Math.round(PI.lbToKg(v) * 1000) / 1000) : ""; fill("lb"); save(); update(); });
	$("pi-goal").addEventListener("change", function () { st.goal = this.value; save(); update(); }); $("pi-diet").addEventListener("change", function () { st.diet = this.value; save(); update(); }); $("pi-meals").addEventListener("change", function () { st.meals = this.value; save(); update(); }); $("pi-kcal").addEventListener("input", function () { st.kcal = this.value.replace(/\D/g, "").slice(0, 5); save(); update(); });
	$("pi-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("pi-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var day = st.day; st = clean(Object.assign({}, st, EXAMPLES[+b.dataset.i][1])); st.day = day; save(); syncAll(); update(); });
	$("pi-ref").innerHTML = "<thead><tr><th>Goal</th><th>g per kg</th><th>g per lb</th></tr></thead><tbody>" + PI.GOALS.map(function (g) { return "<tr id=\"pi-ref-" + g.id + "\"><td>" + esc(g.name) + "</td><td>" + g.lo + "&ndash;" + g.hi + "</td><td>" + PI.trim(g.lo * 0.4536, 2) + "&ndash;" + PI.trim(g.hi * 0.4536, 2) + "</td></tr>"; }).join("") + "</tbody>";
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function update() {
		var kg = PI.num(st.kg), N = PI.need(kg, st.goal); $("pi-empty").hidden = !!N; $("pi-out").hidden = !N; cur = null; if (!N) return;
		var G = PI.goal(st.goal), nm = +st.meals || PI.mealsNeeded(N.t, kg), pm = PI.perMeal(N.t, nm), kc = PI.num(st.kcal), pc = kc > 0 ? PI.percentCal(N.t, kc) : null; cur = { kg: kg, N: N, G: G, nm: nm, pm: pm };
		$("pi-hero").innerHTML = stat("Daily protein target", Math.round(N.t) + " <small>g</small>", PI.trim(G.t, 2) + " g per kg (" + PI.trim(G.t * 0.4536, 2) + " per lb)", "tu-stat--hero") + stat("Healthy range", Math.round(N.lo) + "&ndash;" + Math.round(N.hi) + " <small>g</small>", PI.trim(G.lo, 1) + "&ndash;" + PI.trim(G.hi, 1) + " g/kg") + stat("Per meal", Math.round(pm) + " <small>g</small>", nm + " meals" + (+st.meals ? "" : " (suggested)")) + stat(pc != null ? "Share of calories" : "Calories from protein", pc != null ? Math.round(pc) + "%" : PI.group(N.t * 4) + " <small>kcal</small>", pc != null ? "of " + PI.group(kc) + " kcal a day" : "4 kcal per gram");
		var perMealKg = pm / kg, v = "For <b>" + esc(G.name.toLowerCase()) + "</b> at <b>" + PI.trim(kg, 1) + " kg (" + PI.trim(PI.kgToLb(kg), 0) + " lb)</b>, aim for about <b>" + Math.round(N.t) + " g of protein a day</b> (range " + Math.round(N.lo) + "&ndash;" + Math.round(N.hi) + " g). " + esc(G.note);
		if (pc != null && pc < 10) v += ' <span class="pi-warn">That is under 10% of your calories: check the calorie figure.</span>'; else if (pc != null && pc > 40) v += ' <span class="pi-warn">That is over 40% of your calories, which is a lot.</span>';
		$("pi-verdict").innerHTML = v + '<br><small class="pi-small">General guidance for healthy adults, not medical advice.</small>';
		[].forEach.call(document.querySelectorAll("#pi-ref tr"), function (r) { r.classList.remove("is-on"); }); var rr = $("pi-ref-" + st.goal); if (rr) rr.classList.add("is-on");
		goals(); meals(); foods(); eq();
	}
	function goals() {
		var kg = cur.kg, all = PI.GOALS, mx = Math.ceil(Math.max.apply(null, all.map(function (g) { return g.hi * kg; })) / 20) * 20, W = 640, rowH = 30, H = 20 + all.length * rowH + 26, L = 178, R = 14, X = function (v) { return L + v / mx * (W - L - R); }, s = "";
		for (var g = 0; g <= mx; g += mx > 240 ? 50 : 20) s += '<line class="pi-gl" x1="' + X(g) + '" x2="' + X(g) + '" y1="10" y2="' + (H - 26) + '"/><text class="pi-ct" x="' + X(g) + '" y="' + (H - 10) + '" text-anchor="middle">' + g + "</text>";
		all.forEach(function (go, i) { var y = 14 + i * rowH, on = go.id === st.goal; s += '<text class="pi-lbl' + (on ? " is-on" : "") + '" x="' + (L - 8) + '" y="' + (y + 14) + '" text-anchor="end">' + esc(go.name.replace(/ \(the RDA\)/, "").replace("Active: regular exercise", "Active")) + '</text><rect class="pi-rng' + (on ? " is-on" : "") + '" x="' + X(go.lo * kg) + '" y="' + y + '" width="' + Math.max(3, X(go.hi * kg) - X(go.lo * kg)) + '" height="20" rx="5"><title>' + esc(go.name) + ": " + Math.round(go.lo * kg) + "-" + Math.round(go.hi * kg) + ' g</title></rect><circle class="pi-dot" cx="' + X(go.t * kg) + '" cy="' + (y + 10) + '" r="5"/>'; });
		s += '<text class="pi-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">grams of protein per day</text>';
		$("pi-goals").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	function meals() {
		var n = cur.nm, W = 640, H = 170, L = 40, R = 12, T = 14, B = 28, mx = Math.max(cur.pm * 1.25, 0.4 * cur.kg * 1.1), bw = (W - L - R) / n, Y = function (v) { return T + (mx - v) / mx * (H - T - B); }, s = "", thr = 0.4 * cur.kg;
		for (var g = 0; g <= mx; g += 20) s += '<line class="pi-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="pi-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + "</text>";
		for (var i = 0; i < n; i++) { var x = L + i * bw + bw * 0.15; s += '<rect class="pi-mb" x="' + x + '" y="' + Y(cur.pm) + '" width="' + bw * 0.7 + '" height="' + (Y(0) - Y(cur.pm)) + '" rx="4"><title>Meal ' + (i + 1) + ": " + Math.round(cur.pm) + ' g</title></rect><text class="pi-ct" x="' + (x + bw * 0.35) + '" y="' + (H - 10) + '" text-anchor="middle">Meal ' + (i + 1) + '</text><text class="pi-lbl" x="' + (x + bw * 0.35) + '" y="' + (Y(cur.pm) - 4) + '" text-anchor="middle">' + Math.round(cur.pm) + " g</text>"; }
		s += '<line class="pi-mark" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(thr) + '" y2="' + Y(thr) + '"/><text class="pi-ct" x="' + (W - R) + '" y="' + (Y(thr) - 4) + '" text-anchor="end">about 0.4 g/kg per meal = ' + Math.round(thr) + " g</text>";
		$("pi-meals-c").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		$("pi-mealnote").textContent = cur.pm > thr * 1.25 ? "Each meal is above the ~" + Math.round(thr) + " g that muscle can use well at once; more meals or snacks would spread it better." : cur.pm < thr * 0.5 ? "Meals are small: you could use fewer, larger protein servings." : "A good spread: each meal is close to the amount muscle uses best.";
	}
	function foods() {
		var idx = PI.foodIdx(st.diet); $("pi-dietnote").innerHTML = st.diet === "vegan" ? "Showing <b>vegan</b> foods only. Mix soy foods, legumes, grains and seeds through the day, and aim for the upper half of your range." : st.diet === "veg" ? "Showing <b>vegetarian</b> foods (no meat or fish; eggs, dairy and whey are included)." : "Showing all foods. Use the <b>Eating style</b> setting above for vegetarian or vegan lists.";
		$("pi-foods").innerHTML = idx.map(function (i) { var f = PI.FOODS[i], c = st.day[i] || 0, lab = st.diet === "all" ? PI.dietLabel(f) : ""; return '<div class="pi-food' + (c ? " has" : "") + '"><div class="pi-fn">' + esc(f[0]) + (lab ? ' <span class="pi-tag pi-tag--' + (lab === "Vegan" ? "vegan" : "veg") + '">' + lab + "</span>" : "") + "<small>" + esc(f[1]) + " &middot; " + f[2] + " g protein &middot; " + f[3] + ' kcal</small></div><div class="pi-step"><button type="button" data-i="' + i + '" data-d="-1" aria-label="Fewer ' + esc(f[0]) + '">\u2212</button><b>' + c + '</b><button type="button" data-i="' + i + '" data-d="1" aria-label="More ' + esc(f[0]) + '">+</button></div></div>'; }).join(""); prog();
	}
	function prog() {
		var T = PI.dayTotal(st.day), pct = Math.min(100, T.protein / cur.N.t * 100), left = cur.N.t - T.protein;
		$("pi-prog").innerHTML = '<div class="pi-track"><div class="pi-fill' + (T.protein >= cur.N.t ? " is-done" : "") + '" style="width:' + pct + '%"></div></div><div class="pi-progtxt"><span>' + Math.round(T.protein) + " of " + Math.round(cur.N.t) + " g protein</span><span>" + (left > 0 ? Math.round(left) + " g to go" : "Target reached") + "</span><span>" + PI.group(T.kcal) + " kcal from these foods</span></div>";
	}
	$("pi-foods").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || !cur) return; var i = b.dataset.i, c = Math.max(0, Math.min(49, (st.day[i] || 0) + +b.dataset.d)); if (c) st.day[i] = c; else delete st.day[i]; save(); foods(); });
	$("pi-clear").onclick = function () { st.day = {}; save(); if (cur) foods(); };
	function eq() {
		var t = cur.N.t, idx = PI.foodIdx(st.diet).filter(function (i) { return PI.FOODS[i][4] !== "supp" && PI.FOODS[i][2] >= 7; }).sort(function (x, y) { return PI.FOODS[y][2] / Math.max(1, PI.FOODS[y][3]) - PI.FOODS[x][2] / Math.max(1, PI.FOODS[x][3]); }).slice(0, 8);
		$("pi-eq").innerHTML = "<thead><tr><th>To get " + Math.round(t) + " g from one food</th><th>Serving</th><th>Servings needed</th><th>Calories</th></tr></thead><tbody>" + idx.map(function (i) { var f = PI.FOODS[i], s = PI.servingsFor(t, f); return "<tr><td>" + esc(f[0]) + "</td><td>" + esc(f[1]) + "</td><td>" + PI.trim(s, 1) + "</td><td>" + PI.group(s * f[3]) + " kcal</td></tr>"; }).join("") + "</tbody>";
	}
	$("pi-link").onclick = function () { if (cur) copy(location.origin + "/protein-intake-calculator?kg=" + PI.trim(cur.kg, 2) + "&goal=" + st.goal + (+st.meals ? "&meals=" + st.meals : "") + (st.kcal ? "&kcal=" + st.kcal : "") + (st.diet !== "all" ? "&diet=" + st.diet : ""), "Link copied"); };
	$("pi-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
