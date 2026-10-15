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
