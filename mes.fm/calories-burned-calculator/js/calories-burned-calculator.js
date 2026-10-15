/* MES Calories Burned Calculator -- pure maths (no DOM). Browser global `CB`; node: require('./tool_apps_src/calories-burned-calculator/lib.js'); tests: node tool_apps_src/calories-burned-calculator-tests.js
 * kcal = MET x body weight (kg) x hours. MET values are rounded from the 2011 Compendium of Physical Activities. */
(function (root) {
	"use strict";
	var LB = 0.45359237;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function group(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	var CATS = [["walk", "Walking & running"], ["cycle", "Cycling"], ["gym", "Gym & fitness"], ["water", "Water & winter"], ["sport", "Sports"], ["home", "Home & daily life"], ["mind", "Mind & body"]];
	// [id, name, MET, category]
	var ACTIVITIES = [
		["walk-slow", "Walking, slow (2 mph / 3.2 km/h)", 2.8, "walk"], ["walk-3", "Walking, moderate (3 mph / 4.8 km/h)", 3.5, "walk"], ["walk-4", "Walking, brisk (4 mph / 6.4 km/h)", 5.0, "walk"], ["walk-up", "Walking uphill", 6.0, "walk"], ["hike", "Hiking, cross-country", 6.0, "walk"], ["backpack", "Hiking with a heavy backpack", 7.8, "walk"], ["dog", "Walking the dog", 3.0, "walk"],
		["run-5", "Running, 5 mph (12:00/mile)", 8.3, "walk"], ["run-6", "Running, 6 mph (10:00/mile)", 9.8, "walk"], ["run-7", "Running, 7 mph (8:34/mile)", 11.0, "walk"], ["run-8", "Running, 8 mph (7:30/mile)", 11.8, "walk"], ["run-10", "Running, 10 mph (6:00/mile)", 14.5, "walk"], ["jog", "Jogging, general", 7.0, "walk"], ["stairs", "Climbing stairs", 8.8, "walk"], ["trail", "Trail running", 9.0, "walk"],
		["bike-easy", "Cycling, leisure (under 10 mph)", 4.0, "cycle"], ["bike-mod", "Cycling, moderate (12-14 mph)", 8.0, "cycle"], ["bike-fast", "Cycling, fast (14-16 mph)", 10.0, "cycle"], ["bike-race", "Cycling, racing (16-19 mph)", 12.0, "cycle"], ["bike-stat", "Stationary bike, moderate", 6.8, "cycle"], ["bike-stat-h", "Stationary bike, vigorous", 8.8, "cycle"], ["spin", "Spin class", 8.5, "cycle"], ["mtb", "Mountain biking", 8.5, "cycle"],
		["weights-l", "Weight lifting, light", 3.5, "gym"], ["weights-v", "Weight lifting, vigorous", 6.0, "gym"], ["circuit", "Circuit training", 8.0, "gym"], ["hiit", "HIIT / bootcamp", 8.0, "gym"], ["calis", "Calisthenics (push-ups, sit-ups), vigorous", 8.0, "gym"], ["elliptical", "Elliptical trainer", 5.0, "gym"], ["row-mod", "Rowing machine, moderate", 7.0, "gym"], ["row-v", "Rowing machine, vigorous", 8.5, "gym"], ["stairm", "Stair-climber machine", 9.0, "gym"], ["aerobics", "Aerobics, low impact", 5.0, "gym"], ["aerobics-h", "Aerobics, high impact", 7.3, "gym"], ["jump", "Jumping rope", 11.0, "gym"], ["dance", "Dancing, general", 5.0, "gym"], ["zumba", "Dance fitness (Zumba)", 6.5, "gym"], ["crossfit", "CrossFit-style workout", 8.0, "gym"],
		["swim-l", "Swimming laps, easy", 5.8, "water"], ["swim-v", "Swimming laps, vigorous", 9.8, "water"], ["swim-rec", "Swimming, leisure", 6.0, "water"], ["aqua", "Water aerobics", 5.5, "water"], ["kayak", "Kayaking", 5.0, "water"], ["sup", "Stand-up paddleboarding", 6.0, "water"], ["ski-dh", "Downhill skiing", 5.3, "water"], ["ski-xc", "Cross-country skiing", 8.0, "water"], ["skate-ice", "Ice skating", 7.0, "water"], ["snow", "Snowboarding", 5.3, "water"],
		["basket", "Basketball, game", 8.0, "sport"], ["soccer", "Soccer, casual", 7.0, "sport"], ["soccer-c", "Soccer, competitive", 10.0, "sport"], ["tennis-d", "Tennis, doubles", 6.0, "sport"], ["tennis-s", "Tennis, singles", 8.0, "sport"], ["bad", "Badminton, social", 5.5, "sport"], ["tt", "Table tennis", 4.0, "sport"], ["vball", "Volleyball, casual", 3.0, "sport"], ["golf-w", "Golf, walking", 4.8, "sport"], ["golf-c", "Golf, with a cart", 3.5, "sport"], ["box", "Boxing, sparring", 7.8, "sport"], ["martial", "Martial arts (karate, judo, taekwondo)", 10.3, "sport"], ["climb", "Rock climbing", 7.5, "sport"], ["pickle", "Pickleball", 4.5, "sport"], ["baseball", "Baseball / softball", 5.0, "sport"], ["rugby", "Rugby", 8.3, "sport"], ["hockey", "Ice hockey", 8.0, "sport"], ["squash", "Squash / racquetball", 7.3, "sport"],
		["sit", "Sitting, desk work", 1.3, "home"], ["stand", "Standing, light work", 1.8, "home"], ["cook", "Cooking", 1.8, "home"], ["clean", "Housework, general cleaning", 3.3, "home"], ["vac", "Vacuuming", 3.3, "home"], ["garden", "Gardening, general", 3.8, "home"], ["mow", "Mowing the lawn (push mower)", 5.5, "home"], ["shovel", "Shovelling snow", 6.0, "home"], ["kids", "Playing with children, active", 4.0, "home"], ["move", "Moving boxes / furniture", 5.8, "home"], ["carry", "Carrying groceries upstairs", 7.5, "home"], ["sleep", "Sleeping", 0.95, "home"], ["tv", "Watching TV", 1.3, "home"],
		["yoga", "Yoga, Hatha", 2.5, "mind"], ["yoga-p", "Yoga, power / vinyasa", 4.0, "mind"], ["pilates", "Pilates", 3.0, "mind"], ["stretch", "Stretching", 2.3, "mind"], ["taichi", "Tai chi", 3.0, "mind"], ["med", "Meditation", 1.0, "mind"]
	];
	function byId(id) { for (var i = 0; i < ACTIVITIES.length; i++) if (ACTIVITIES[i][0] === id) return ACTIVITIES[i]; return null; }
	function valid(kg) { return kg >= 20 && kg <= 400; }
	// gross: the whole burn (MET x kg x h); net: only the extra above sitting still (MET - 1)
	function kcal(met, kg, min, net) { return (net ? Math.max(0, met - 1) : met) * kg * min / 60; }
	function perHour(met, kg, net) { return kcal(met, kg, 60, net); }
	function minutesFor(target, met, kg, net) { var h = perHour(met, kg, net); return h > 0 ? target / h * 60 : null; }
	function intensity(met) { return met < 3 ? "light" : met < 6 ? "moderate" : "vigorous"; }
	// weekly activity minutes counted toward the 150-minute guideline: moderate = 1 each, vigorous = 2 each, light = 0
	function guidelineMin(met, min) { var i = intensity(met); return i === "vigorous" ? min * 2 : i === "moderate" ? min : 0; }
	function fatGrams(k) { return k / 7.7; }
	function search(q, cat) {
		var t = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
		return ACTIVITIES.filter(function (a) { return (!cat || cat === "all" || a[3] === cat) && t.every(function (w) { return a[1].toLowerCase().indexOf(w) >= 0; }); });
	}
	var CB = { num: num, fix: fix, trim: trim, group: group, lbToKg: lbToKg, kgToLb: kgToLb, CATS: CATS, ACTIVITIES: ACTIVITIES, byId: byId, valid: valid, kcal: kcal, perHour: perHour, minutesFor: minutesFor, intensity: intensity, guidelineMin: guidelineMin, fatGrams: fatGrams, search: search };
	if (typeof module !== "undefined" && module.exports) module.exports = CB; else root.CB = CB;
})(typeof window !== "undefined" ? window : this);

/* MES Calories Burned Calculator -- mes.fm/calories-burned-calculator (UI; maths in lib.js, global CB).
 * localStorage "mes-calories-burned-calculator:v1" = { kg, net, items: [{ id, min, days }] }. Links: ?kg=&net=1&a=run-6:30:3,walk-4:45:2 (id:minutes:days a week) */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("cb"); if (!root || !window.CB) return;
	var KEY = "mes-calories-burned-calculator:v1";
	var EXAMPLES = [["70 kg: run + weights", { kg: "70", items: [{ id: "run-6", min: 30, days: 3 }, { id: "weights-v", min: 45, days: 2 }] }], ["80 kg: walk + cycle", { kg: "80", items: [{ id: "walk-4", min: 40, days: 5 }, { id: "bike-mod", min: 45, days: 1 }] }], ["60 kg: yoga + swim", { kg: "60", items: [{ id: "yoga-p", min: 60, days: 3 }, { id: "swim-l", min: 30, days: 2 }] }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { kg: "", net: false, items: [], cat: "all", q: "", goal: "300" };
	function cleanItems(a) { return (Array.isArray(a) ? a : []).filter(function (x) { return x && CB.byId(x.id); }).slice(0, 30).map(function (x) { return { id: x.id, min: Math.max(1, Math.min(1440, Math.round(+x.min || 30))), days: Math.max(1, Math.min(7, Math.round(+x.days || 1))) }; }); }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { st.kg = String(s.kg || "").slice(0, 8); st.net = s.net === true; st.items = cleanItems(s.items); } } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ kg: st.kg, net: st.net, items: st.items })); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("kg")) return false; st.kg = q.get("kg").slice(0, 8); st.net = q.get("net") === "1"; st.items = cleanItems((q.get("a") || "").split(",").map(function (p) { var s = p.split(":"); return { id: s[0], min: s[1], days: s[2] }; })); return true; }
	function toast(msg) { var t = $("cb-toast"); if (!t) { t = document.createElement("div"); t.id = "cb-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	function fill(except) { var kg = CB.num(st.kg); if (except !== "kg") $("cb-kg").value = kg > 0 ? CB.trim(kg, 2) : ""; if (except !== "lb") $("cb-lb").value = kg > 0 ? CB.trim(CB.kgToLb(kg), 1) : ""; }
	function syncAll() { fill(); [].forEach.call($("cb-net").children, function (b) { b.setAttribute("aria-pressed", String((b.dataset.n === "1") === st.net)); }); }
	$("cb-kg").addEventListener("input", function () { var v = CB.num(this.value); st.kg = v > 0 ? String(v) : ""; fill("kg"); save(); update(); });
	$("cb-lb").addEventListener("input", function () { var v = CB.num(this.value); st.kg = v > 0 ? String(Math.round(CB.lbToKg(v) * 1000) / 1000) : ""; fill("lb"); save(); update(); });
	$("cb-net").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.net = b.dataset.n === "1"; save(); syncAll(); update(); });
	$("cb-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("cb-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EXAMPLES[+b.dataset.i][1]; st.kg = x.kg; st.items = cleanItems(x.items); save(); syncAll(); update(); });
	$("cb-cats").innerHTML = [["all", "All"]].concat(CB.CATS).map(function (c) { return '<button type="button" class="tu-chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === "all") + '">' + esc(c[1]) + "</button>"; }).join("");
	$("cb-cats").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.cat = b.dataset.c; [].forEach.call($("cb-cats").children, function (x) { x.setAttribute("aria-pressed", String(x.dataset.c === st.cat)); }); list(); });
	$("cb-search").addEventListener("input", function () { st.q = this.value; list(); });
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var kg = null;
	function k(met, min) { return CB.kcal(met, kg, min, st.net); }
	function update() {
		kg = CB.num(st.kg); var ok = CB.valid(kg); $("cb-empty").hidden = ok; $("cb-out").hidden = !ok; if (!ok) return; list(); rows(); chart(); howlong();
	}
	function list() {
		if (!CB.valid(kg)) return; var A = CB.search(st.q, st.cat); if (!st.q && st.cat === "all") A = A.slice();
		$("cb-list").innerHTML = A.map(function (a) { var i = CB.intensity(a[2]); return '<div class="cb-act" role="listitem"><div class="cb-an">' + esc(a[1]) + '<small>MET ' + CB.trim(a[2], 2) + ' <span class="cb-int cb-int--' + i + '">' + i + '</span></small></div><div class="cb-ak">' + CB.group(CB.perHour(a[2], kg, st.net)) + "<small>kcal / hour</small></div>" + '<button type="button" class="tu-btn tu-btn--ghost cb-add" data-id="' + a[0] + '" aria-label="Add ' + esc(a[1]) + '">+ Add</button></div>'; }).join("") || '<div class="cb-act"><div class="cb-an">No activity matches. Try another word or category.</div></div>';
		$("cb-listnote").textContent = A.length + " of " + CB.ACTIVITIES.length + " activities" + (st.net ? " (extra calories above sitting still)" : " (total calories)") + ".";
	}
	$("cb-list").addEventListener("click", function (e) { var b = e.target.closest(".cb-add"); if (!b) return; var id = b.dataset.id, ex = st.items.filter(function (x) { return x.id === id; })[0]; if (ex) ex.min = Math.min(1440, ex.min + 15); else st.items.push({ id: id, min: 30, days: 1 }); save(); rows(); chart(); toast("Added: " + CB.byId(id)[1].split(",")[0].split(" (")[0]); $("cb-rows").scrollIntoView({ block: "nearest", behavior: "smooth" }); });
	function rows() {
		var has = st.items.length > 0; $("cb-none").hidden = has; $("cb-hero").hidden = !has; $("cb-prog").hidden = !has;
		$("cb-rows").innerHTML = st.items.map(function (it, i) { var a = CB.byId(it.id), s = k(a[2], it.min); return '<div class="cb-row" data-i="' + i + '"><div class="cb-rn">' + esc(a[1]) + '<small>MET ' + CB.trim(a[2], 2) + " &middot; " + CB.intensity(a[2]) + '</small></div><div class="cb-min"><button type="button" data-d="-5" aria-label="5 minutes less">−</button><input type="text" inputmode="numeric" value="' + it.min + '" aria-label="Minutes"><button type="button" data-d="5" aria-label="5 minutes more">+</button><span class="cb-small"> min</span></div>' + '<select class="tu-select cb-days" aria-label="Times a week" style="width:auto;">' + [1, 2, 3, 4, 5, 6, 7].map(function (d) { return '<option value="' + d + '"' + (d === it.days ? " selected" : "") + ">" + d + "&times; a week</option>"; }).join("") + '</select><div class="cb-rk">' + CB.group(s) + " kcal<small>" + CB.group(s * it.days) + " a week</small></div>" + '<button type="button" class="cb-del" aria-label="Remove">✕</button></div>'; }).join("");
		if (!has) return;
		var ses = 0, wk = 0, gm = 0, mins = 0; st.items.forEach(function (it) { var a = CB.byId(it.id), s = k(a[2], it.min); ses += s; wk += s * it.days; gm += CB.guidelineMin(a[2], it.min) * it.days; mins += it.min * it.days; });
		$("cb-hero").innerHTML = stat("Calories, one of each", CB.group(ses) + " <small>kcal</small>", "all your activities once", "tu-stat--hero") + stat("Calories per week", CB.group(wk) + " <small>kcal</small>", CB.group(mins) + " active minutes a week") + stat("Fat equivalent", CB.trim(CB.fatGrams(wk), 0) + " <small>g</small>", "of body fat a week, at 7,700 kcal per kg") + stat("Per day (average)", CB.group(wk / 7) + " <small>kcal</small>", "spread over the week");
		var pct = Math.min(100, gm / 150 * 100); $("cb-prog").innerHTML = '<div class="tu-label">Weekly activity guideline: 150 moderate-equivalent minutes</div><div class="cb-track"><div class="cb-fill' + (gm >= 150 ? " is-done" : "") + '" style="width:' + pct + '%"></div></div><div class="cb-progtxt"><span>' + Math.round(gm) + " of 150 minutes</span><span>" + (gm >= 300 ? "Above the 300-minute upper guideline" : gm >= 150 ? "Guideline reached" : Math.round(150 - gm) + " minutes to go") + '</span></div><p class="tu-note" style="margin:0.4em 0 0;">Vigorous minutes count double; light activity (under 3 METs) does not count.</p>';
		cur = { ses: ses, wk: wk, gm: gm };
	}
	var cur = null;
	$("cb-rows").addEventListener("click", function (e) { var row = e.target.closest(".cb-row"); if (!row) return; var i = +row.dataset.i, it = st.items[i]; if (e.target.closest(".cb-del")) { st.items.splice(i, 1); save(); rows(); chart(); return; } var b = e.target.closest(".cb-min button"); if (b) { it.min = Math.max(1, Math.min(1440, it.min + +b.dataset.d)); save(); rows(); chart(); } });
	$("cb-rows").addEventListener("change", function (e) { var row = e.target.closest(".cb-row"); if (!row) return; var it = st.items[+row.dataset.i]; if (e.target.classList.contains("cb-days")) it.days = +e.target.value; else { var v = CB.num(e.target.value); it.min = v > 0 ? Math.min(1440, Math.round(v)) : it.min; } save(); rows(); chart(); });
	$("cb-clear").onclick = function () { st.items = []; save(); rows(); chart(); };
	function chart() {
		if (!CB.valid(kg)) return; var chosen = {}; st.items.forEach(function (it) { chosen[it.id] = true; });
		var top = CB.ACTIVITIES.slice().sort(function (a, b) { return b[2] - a[2]; }).slice(0, 12); st.items.forEach(function (it) { if (!top.some(function (a) { return a[0] === it.id; })) top.push(CB.byId(it.id)); }); top.sort(function (a, b) { return b[2] - a[2]; });
		var W = 640, rowH = 22, H = 16 + top.length * rowH + 22, L = 230, R = 50, mx = Math.max.apply(null, top.map(function (a) { return k(a[2], 30); })), X = function (v) { return L + v / mx * (W - L - R); }, s = "";
		top.forEach(function (a, i) { var y = 8 + i * rowH, v = k(a[2], 30), on = chosen[a[0]]; s += '<text class="cb-lbl' + (on ? " is-on" : "") + '" x="' + (L - 8) + '" y="' + (y + 14) + '" text-anchor="end">' + esc(a[1].length > 36 ? a[1].slice(0, 35) + "…" : a[1]) + '</text><rect class="cb-bar' + (on ? " is-on" : "") + '" x="' + L + '" y="' + y + '" width="' + Math.max(2, X(v) - L) + '" height="16" rx="4"><title>' + esc(a[1]) + ": " + CB.group(v) + ' kcal in 30 min</title></rect><text class="cb-val" x="' + (X(v) + 5) + '" y="' + (y + 13) + '">' + CB.group(v) + "</text>"; });
		s += '<text class="cb-ct" x="' + (W - 4) + '" y="' + (H - 4) + '" text-anchor="end">kcal in 30 minutes' + (st.net ? " (extra)" : "") + "</text>";
		$("cb-chart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	var GOALS = [100, 200, 300, 500, 1000]; $("cb-goalchips").innerHTML = GOALS.map(function (g) { return '<button type="button" class="tu-chip" data-g="' + g + '">' + g + "</button>"; }).join("");
	$("cb-goalchips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; $("cb-goal").value = b.dataset.g; st.goal = b.dataset.g; howlong(); });
	$("cb-goal").addEventListener("input", function () { st.goal = this.value; howlong(); });
	function howlong() {
		if (!CB.valid(kg)) return; var g = CB.num(st.goal); if (!(g > 0)) { $("cb-howlong").innerHTML = ""; $("cb-food").textContent = ""; return; }
		var ids = ["walk-3", "walk-4", "run-6", "bike-mod", "swim-l", "weights-v", "hiit", "yoga", "clean", "dance"]; st.items.forEach(function (it) { if (ids.indexOf(it.id) < 0) ids.push(it.id); });
		$("cb-howlong").innerHTML = "<thead><tr><th>Activity</th><th>Time to burn " + CB.group(g) + " kcal</th><th>kcal per hour</th></tr></thead><tbody>" + ids.map(function (id) { var a = CB.byId(id), m = CB.minutesFor(g, a[2], kg, st.net), on = st.items.some(function (x) { return x.id === id; }); return "<tr" + (on ? ' class="is-on"' : "") + "><td>" + esc(a[1]) + "</td><td>" + (m == null ? "&ndash;" : m < 90 ? Math.round(m) + " min" : Math.floor(m / 60) + " h " + Math.round(m % 60) + " min") + "</td><td>" + CB.group(CB.perHour(a[2], kg, st.net)) + "</td></tr>"; }).join("") + "</tbody>";
		var f = [["a slice of pizza", 285], ["a chocolate chip cookie", 160], ["a can of cola", 140], ["a banana", 105], ["a medium croissant", 230], ["a bagel with cream cheese", 360], ["a pint of beer", 200]]; $("cb-food").textContent = "For scale: " + CB.group(g) + " kcal is about " + f.map(function (x) { return CB.trim(g / x[1], 1) + " " + x[0].replace(/^a /, ""); }).slice(0, 4).join(", ") + ".";
	}
	function summary() { return st.items.map(function (it) { var a = CB.byId(it.id); return a[1] + ": " + it.min + " min x " + it.days + "/week = " + CB.group(k(a[2], it.min) * it.days) + " kcal a week"; }).join("\n") + (cur ? "\nTotal: " + CB.group(cur.wk) + " kcal a week (" + CB.trim(CB.kgToLb(kg), 0) + " lb / " + CB.trim(kg, 0) + " kg body weight)" : ""); }
	function link() { return location.origin + "/calories-burned-calculator?kg=" + CB.trim(kg, 2) + (st.net ? "&net=1" : "") + (st.items.length ? "&a=" + st.items.map(function (x) { return x.id + ":" + x.min + ":" + x.days; }).join(",") : ""); }
	$("cb-copy").onclick = function () { if (st.items.length) copy(summary(), "Summary copied"); else toast("Add an activity first"); }; $("cb-link").onclick = function () { copy(link(), "Link copied"); }; $("cb-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); $("cb-goal").value = st.goal; update();
})();
