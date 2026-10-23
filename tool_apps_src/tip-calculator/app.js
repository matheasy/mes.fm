/* MES Tip Calculator -- mes.fm/tip-calculator (UI; money maths in lib.js, global TP).
 * localStorage "mes-tip-calculator:v1" = the whole form (both modes).
 * Links: ?b=<bill>&t=<tip %>|&ta=<tip amount>&p=<people>[&tax=<rate %>|&taxa=<amount>][&r=total|person&s=<step minor units>][&c=<currency>]
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tp");
	if (!root || !window.TP) return;
	var KEY = "mes-tip-calculator:v1", CHIPS = [10, 15, 18, 20, 22, 25];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function defCur() { var l = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US"; return TP.curForLocale(l); }
	function fresh() {
		return { mode: "even", cur: defCur(), bill: "", tipMode: "pct", tipPct: "18", tipAmt: "", pre: false, taxMode: "pct", tax: "", people: 1, round: "none", step: 100,
			up: [{ name: "Person 1", items: "" }, { name: "Person 2", items: "" }], us: [], utaxMode: "pct", utax: "", tipOnTax: false, country: "" };
	}
	var st = fresh();
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") st = Object.assign(fresh(), s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function sane() {
		st.mode = st.mode === "uneven" ? "uneven" : "even";
		st.people = Math.max(1, Math.min(100, parseInt(st.people, 10) || 1));
		if (!Array.isArray(st.up) || !st.up.length) st.up = fresh().up;
		st.up = st.up.slice(0, 30).map(function (p, i) { return { name: String(p && p.name || "Person " + (i + 1)).slice(0, 40), items: String(p && p.items || "").slice(0, 300) }; });
		if (!Array.isArray(st.us)) st.us = [];
		st.us = st.us.slice(0, 30).map(function (s) { return { name: String(s && s.name || "").slice(0, 40), amt: String(s && s.amt || "").slice(0, 20), who: Array.isArray(s && s.who) ? s.who.filter(function (x) { return typeof x === "number"; }) : [] }; });
		if (["none", "total", "person"].indexOf(st.round) < 0) st.round = "none";
		if (st.mode === "uneven" && st.round === "total") st.round = "person";
		if (!TP.CURRENCIES.some(function (c) { return c.code === st.cur; })) st.cur = "USD";
		var steps = TP.steps(TP.cur(st.cur)).map(function (x) { return x[0]; });
		if (steps.indexOf(+st.step) < 0) st.step = steps[0]; else st.step = +st.step;
	}
	function fromUrl() {
		var q = new URLSearchParams(location.search);
		if (!q.has("b") && !q.has("t") && !q.has("p")) return;
		st.mode = "even";
		if (q.get("c")) st.cur = q.get("c").toUpperCase();
		if (q.has("b")) st.bill = q.get("b").slice(0, 20);
		if (q.has("ta")) { st.tipMode = "amt"; st.tipAmt = q.get("ta").slice(0, 20); } else if (q.has("t")) { st.tipMode = "pct"; st.tipPct = q.get("t").slice(0, 8); }
		if (q.has("p")) st.people = parseInt(q.get("p"), 10) || 1;
		if (q.has("tax")) { st.pre = true; st.taxMode = "pct"; st.tax = q.get("tax").slice(0, 8); } else if (q.has("taxa")) { st.pre = true; st.taxMode = "amt"; st.tax = q.get("taxa").slice(0, 20); } else st.pre = false;
		st.round = q.get("r") || "none"; if (q.get("s")) st.step = +q.get("s");
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
	}
	function toast(msg) {
		var t = $("tp-toast"); if (!t) { t = document.createElement("div"); t.id = "tp-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function cur() { return TP.cur(st.cur); }
	function money(v) { return TP.fmt(v, cur()); }
	function m(s) { return TP.parseMoney(s, cur().dec); }
	function sumItems(s) {
		var parts = String(s || "").split(/[+;\n]/), tot = 0, bad = false, any = false;
		parts.forEach(function (p) { if (!p.trim()) return; var v = m(p); if (v == null || v < 0) bad = true; else { tot += v; any = true; } });
		return { v: tot, bad: bad, any: any };
	}
	function seg(el, val) { [].forEach.call(el.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === String(val) || b.dataset.m === String(val))); }); }

	/* ---------- static parts ---------- */
	$("tp-cur").innerHTML = TP.CURRENCIES.map(function (c) { return '<option value="' + c.code + '">' + (c.code === "NONE" ? "No symbol" : esc(c.code + (c.sym ? " " + c.sym : ""))) + "</option>"; }).join("");
	$("tp-chips").innerHTML = CHIPS.map(function (p) { return '<button type="button" class="tp-chip" data-p="' + p + '" aria-pressed="false">' + p + "%</button>"; }).join("");
	$("tp-round").innerHTML = '<option value="none">No rounding (exact)</option><option value="total">Round the total up</option><option value="person">Round each person\'s share up</option>';
	var REG = TP.regionOf((navigator.languages && navigator.languages[0]) || navigator.language || "");
	$("tp-country").innerHTML = TP.COUNTRIES.map(function (c) { return '<option value="' + c.c + '">' + esc(c.name) + "</option>"; }).join("");
	$("tp-ctab").innerHTML = "<thead><tr><th>Country</th><th>Restaurants</th></tr></thead><tbody>" + TP.COUNTRIES.map(function (c) { return "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.rest) + "</td></tr>"; }).join("") + "</tbody>";
	$("tp-stab").innerHTML = "<thead><tr><th>Service</th><th>Typical tip</th></tr></thead><tbody>" + TP.SERVICES.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody>";

	/* ---------- uneven lists ---------- */
	function drawPeople() {
		$("tp-people").innerHTML = st.up.map(function (p, i) {
			return '<div class="tp-prow" data-i="' + i + '"><input class="tu-input tp-pname" type="text" value="' + esc(p.name) + '" aria-label="Name of person ' + (i + 1) + '" maxlength="40">' +
				'<div class="tp-money tp-money--mid tp-pitems"><span class="tp-sym" aria-hidden="true"></span><input class="tu-input tp-mid tp-pit" type="text" inputmode="decimal" autocomplete="off" placeholder="12.50 + 4" value="' + esc(p.items) + '" aria-label="What ' + esc(p.name) + ' had"></div>' +
				'<span class="tp-psum" aria-hidden="true"></span>' +
				'<button type="button" class="tp-x" aria-label="Remove ' + esc(p.name) + '"' + (st.up.length < 2 ? " disabled" : "") + '>&times;</button></div>';
		}).join("");
		drawShared();
	}
	function drawShared() {
		$("tp-shared").innerHTML = st.us.map(function (s, k) {
			var who = st.up.map(function (p, i) { var on = !s.who.length || s.who.indexOf(i) >= 0; return '<button type="button" class="tp-who" data-i="' + i + '" aria-pressed="' + on + '">' + esc(p.name || "Person " + (i + 1)) + "</button>"; }).join("");
			return '<div class="tp-srow" data-k="' + k + '"><div class="tp-sline"><input class="tu-input tp-sname" type="text" placeholder="e.g. Pizza" value="' + esc(s.name) + '" aria-label="Shared item ' + (k + 1) + ' name" maxlength="40">' +
				'<div class="tp-money tp-money--mid"><span class="tp-sym" aria-hidden="true"></span><input class="tu-input tp-mid tp-samt" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + esc(s.amt) + '" aria-label="Price of shared item ' + (k + 1) + '"></div>' +
				'<button type="button" class="tp-x" aria-label="Remove shared item ' + (k + 1) + '">&times;</button></div>' +
				'<div class="tp-whos" role="group" aria-label="Shared by"><span class="tp-light">Shared by:</span> ' + who + "</div></div>";
		}).join("");
		syms();
	}
	function syms() { [].forEach.call(root.querySelectorAll(".tp-sym"), function (e) { e.textContent = cur().sym; e.parentNode.classList.toggle("tp-money--nosym", !cur().sym); e.parentNode.classList.toggle("tp-money--long", cur().sym.length > 1); }); }

	/* ---------- sync form from state ---------- */
	function syncForm() {
		seg($("tp-mode"), st.mode);
		[].forEach.call(root.querySelectorAll("[data-only]"), function (e) { e.hidden = e.getAttribute("data-only") !== st.mode; });
		$("tp-cur").value = st.cur; $("tp-bill").value = st.bill;
		seg($("tp-tipm"), st.tipMode); $("tp-pctbox").hidden = st.tipMode !== "pct"; $("tp-amtbox").hidden = st.tipMode !== "amt";
		$("tp-tipamt").value = st.tipAmt;
		var isChip = CHIPS.indexOf(Number(st.tipPct)) >= 0 && /^\d+$/.test(String(st.tipPct));
		$("tp-pct").value = isChip ? "" : st.tipPct;
		[].forEach.call($("tp-chips").children, function (b) { b.setAttribute("aria-pressed", String(isChip && Number(b.dataset.p) === Number(st.tipPct))); });
		$("tp-pre").checked = !!st.pre; $("tp-taxrow").hidden = !st.pre; seg($("tp-taxm"), st.taxMode); $("tp-tax").value = st.tax;
		$("tp-taxlab").textContent = st.taxMode === "pct" ? "Tax rate (%)" : "Tax amount"; $("tp-tax").placeholder = st.taxMode === "pct" ? "e.g. 13" : "e.g. 6.50";
		$("tp-taxnote").hidden = st.taxMode !== "pct";
		$("tp-people-n").value = st.people;
		seg($("tp-utaxm"), st.utaxMode); $("tp-utax").value = st.utax; $("tp-utaxlab").textContent = st.utaxMode === "pct" ? "Tax rate (%)" : "Tax amount";
		$("tp-tipontax").checked = !!st.tipOnTax;
		var ro = $("tp-round"); ro.querySelector('option[value="total"]').hidden = st.mode === "uneven"; ro.value = st.round;
		$("tp-step").innerHTML = TP.steps(cur()).map(function (x) { return '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (x[0] === st.step) + '">' + esc(x[1]) + "</button>"; }).join("");
		$("tp-stepbox").hidden = st.round === "none";
		$("tp-steplab").textContent = st.round === "total" ? "Total up to the next" : "Each share up to the next";
		drawPeople();
	}

	/* ---------- calculate ---------- */
	function tipOpts() {
		var pm = TP.parsePct(st.tipPct), ta = m(st.tipAmt);
		return { tipMode: st.tipMode, tipPct: pm || 0, tipAmt: ta && ta > 0 ? ta : 0, badTip: st.tipMode === "pct" ? (st.tipPct !== "" && pm == null) : (st.tipAmt !== "" && (ta == null || ta < 0)) };
	}
	function tile(label, value, sub, hero, id) { return '<div class="tp-tile' + (hero ? " tp-tile--hero" : "") + '"' + (id ? ' id="' + id + '"' : "") + '><div class="tp-tlab">' + label + '</div><div class="tp-tval">' + value + "</div>" + (sub ? '<div class="tp-tsub">' + sub + "</div>" : "") + "</div>"; }
	var last = null;
	function calc() {
		var T = tipOpts(), res = $("tp-res"), msg = [], c = cur();
		if (st.mode === "even") {
			var bill = m(st.bill), badBill = st.bill !== "" && (bill == null || bill < 0);
			$("tp-bill").classList.toggle("tp-bad", badBill);
			var taxV = st.taxMode === "pct" ? TP.parsePct(st.tax) : m(st.tax);
			var r = TP.even({ bill: bill > 0 ? bill : 0, tipMode: T.tipMode, tipPct: T.tipPct, tipAmt: T.tipAmt, preTax: st.pre, taxMode: st.taxMode, tax: st.taxMode === "amt" ? taxV || 0 : 0, taxPct: st.taxMode === "pct" ? taxV || 0 : 0, people: st.people, round: st.round, step: st.step });
			last = r;
			var each = r.people > 1;
			res.innerHTML = tile("Tip", money(r.tip), r.effPct != null ? TP.fmtPct(r.effPct) + " of " + money(r.base) : "", false) + tile("Total", money(r.total), r.people > 1 ? "for " + r.people + " people" : "", false) +
				(each ? tile("Each person pays", money(r.uneven ? r.perPersonMax : r.perPerson), r.uneven ? "(" + r.extraCents + " pay" + (r.extraCents === 1 ? "s" : "") + " " + money(r.perPersonMax) + ", the rest " + money(r.perPerson) + ")" : "tip " + money(r.tipEach[r.tipEach.length - 1]) + " each", true, "tp-each") : "");
			res.className = "tp-results" + (each ? " tp-results--3" : "");
			if (badBill) msg.push("That bill amount does not look like a number.");
			else if (!(bill > 0)) msg.push("Type the bill amount to start.");
			if (T.badTip) msg.push("Check the tip: it is not a number.");
			if (st.pre && r.tax > 0) msg.push("Tip worked out on " + money(r.base) + " (the bill minus " + money(r.tax) + " tax).");
			if (st.pre && st.taxMode === "amt" && taxV > (bill || 0)) msg.push("The tax is more than the bill, so it was capped at the bill.");
			if (r.uneven) msg.push(money(r.total) + " does not split evenly by " + r.people + ": " + r.extraCents + " " + (r.extraCents === 1 ? "person pays" : "people pay") + " one " + (c.dec ? "cent" : "unit") + " more so it adds up exactly.");
			if (st.round !== "none" && bill > 0) msg.push(r.rounded ? "Rounded up: the tip becomes " + money(r.tip) + ", that is " + TP.fmtPct(r.effPct) + "." : "Already a round amount, nothing added.");
			drawQuick(r);
		} else {
			var people = st.up.map(function (p) { var s = sumItems(p.items); return { name: p.name, items: [s.v], bad: s.bad, any: s.any }; });
			var shared = st.us.map(function (s) { var a = m(s.amt); return { name: s.name, amount: a > 0 ? a : 0, who: s.who.length ? s.who.filter(function (i) { return i < st.up.length; }) : [] }; });
			var tv = st.utaxMode === "pct" ? TP.parsePct(st.utax) : m(st.utax);
			var u = TP.uneven({ people: people, shared: shared, taxMode: st.utaxMode, tax: st.utaxMode === "amt" ? tv || 0 : 0, taxPct: st.utaxMode === "pct" ? tv || 0 : 0, tipMode: T.tipMode, tipPct: T.tipPct, tipAmt: T.tipAmt, tipOnTax: st.tipOnTax, round: st.round, step: st.step });
			last = u;
			[].forEach.call($("tp-people").children, function (row, i) { var p = people[i]; row.querySelector(".tp-pit").classList.toggle("tp-bad", p.bad); row.querySelector(".tp-psum").textContent = p.any ? money(u.rows[i].sub) : ""; });
			res.className = "tp-results";
			res.innerHTML = tile("Food and drink", money(u.subtotal), u.tax ? "+ " + money(u.tax) + " tax" : "", false) + tile("Tip", money(u.tip), u.effPct != null && u.subtotal ? TP.fmtPct(u.effPct) + " of " + money(u.base) : "", false) + tile("Total", money(u.total), "", true);
			var tb = "<thead><tr><th>Person</th><th>Had</th><th>Tax</th><th>Tip</th><th>Pays</th></tr></thead><tbody>" + u.rows.map(function (r, i) {
				return "<tr><td>" + esc(r.name || "Person " + (i + 1)) + "</td><td>" + money(r.sub) + "</td><td>" + money(r.tax) + "</td><td>" + money(r.tip) + '</td><td class="tp-pay">' + money(r.pay) + "</td></tr>";
			}).join("") + '</tbody><tfoot><tr><td>Total</td><td>' + money(u.subtotal) + "</td><td>" + money(u.tax) + "</td><td>" + money(u.tip) + '</td><td class="tp-pay">' + money(u.total) + "</td></tr></tfoot>";
			$("tp-utab").innerHTML = tb;
			if (!u.subtotal) msg.push("Type what each person had to start.");
			if (people.some(function (p) { return p.bad; })) msg.push("Some prices are not numbers (outlined in red); they were left out.");
			if (T.badTip) msg.push("Check the tip: it is not a number.");
			if (u.subtotal) msg.push("Tax and tip are shared in proportion to what each person had" + (st.us.length ? ", shared items split equally between the people ticked" : "") + ". Leftover cents go to whoever was closest to the next cent, so it adds up exactly.");
			if (st.round === "person" && u.subtotal) msg.push(u.rounded ? "Each share rounded up: the tip becomes " + money(u.tip) + " (" + TP.fmtPct(u.effPct) + ")." : "Every share is already a round amount.");
		}
		$("tp-msg").innerHTML = msg.map(esc).join("<br>");
		save();
	}
	function drawQuick(r) {
		var rows = TP.table(r.bill, r.base, r.people, [10, 12, 15, 18, 20, 22, 25]);
		var pm = st.tipMode === "pct" ? TP.parsePct(st.tipPct) : null;
		$("tp-qt").innerHTML = "<thead><tr><th>Tip</th><th>Tip amount</th><th>Total</th>" + (r.people > 1 ? "<th>Each</th>" : "") + "</tr></thead><tbody>" + rows.map(function (x) {
			return '<tr tabindex="0" data-p="' + x.pct + '"' + (pm === x.pct * 1000 ? ' class="is-active"' : "") + "><td>" + x.pct + "%</td><td>" + money(x.tip) + "</td><td>" + money(x.total) + "</td>" + (r.people > 1 ? "<td>" + money(x.each) + "</td>" : "") + "</tr>";
		}).join("") + "</tbody>";
	}
	function drawCountry() {
		var c = TP.COUNTRIES.filter(function (x) { return x.c === st.country; })[0] || TP.COUNTRIES[0];
		$("tp-country").value = c.c;
		$("tp-custom").innerHTML = '<p class="tp-crest"><b>Restaurants:</b> ' + esc(c.rest) + '</p><p class="tp-cnotes">' + esc(c.notes) + "</p>" +
			(c.pct > 0 ? '<button type="button" class="tu-btn" id="tp-usec" data-p="' + c.pct + '">Use ' + c.pct + "%</button>" : '<button type="button" class="tu-btn" id="tp-usec" data-p="0">Use 0% (no tip)</button>');
	}

	/* ---------- events ---------- */
	function setTip(p) { st.tipMode = "pct"; st.tipPct = String(p); syncForm(); calc(); }
	$("tp-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.mode = b.dataset.m; sane(); syncForm(); calc(); });
	$("tp-cur").addEventListener("change", function () { st.cur = this.value; sane(); syncForm(); calc(); });
	$("tp-bill").addEventListener("input", function () { st.bill = this.value; calc(); });
	$("tp-tipm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.tipMode = b.dataset.v; syncForm(); calc(); });
	$("tp-chips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setTip(b.dataset.p); });
	$("tp-pct").addEventListener("input", function () { st.tipPct = this.value.trim() === "" ? "18" : this.value.trim(); if (this.value.trim() === "") { syncForm(); } else [].forEach.call($("tp-chips").children, function (b) { b.setAttribute("aria-pressed", "false"); }); calc(); });
	$("tp-tipamt").addEventListener("input", function () { st.tipAmt = this.value; calc(); });
	$("tp-pre").addEventListener("change", function () { st.pre = this.checked; syncForm(); calc(); });
	$("tp-taxm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.taxMode = b.dataset.v; st.tax = ""; syncForm(); calc(); });
	$("tp-tax").addEventListener("input", function () { st.tax = this.value; calc(); });
	function setPeople(n) { st.people = Math.max(1, Math.min(100, n)); $("tp-people-n").value = st.people; calc(); }
	$("tp-pminus").onclick = function () { setPeople(st.people - 1); };
	$("tp-pplus").onclick = function () { setPeople(st.people + 1); };
	$("tp-people-n").addEventListener("input", function () { var n = TP.parseInt(this.value); if (n) { st.people = Math.max(1, Math.min(100, n)); calc(); } });
	$("tp-people-n").addEventListener("blur", function () { this.value = st.people; });
	$("tp-round").addEventListener("change", function () { st.round = this.value; syncForm(); calc(); });
	$("tp-step").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.step = +b.dataset.v; seg($("tp-step"), st.step); calc(); });
	$("tp-utaxm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.utaxMode = b.dataset.v; st.utax = ""; syncForm(); calc(); });
	$("tp-utax").addEventListener("input", function () { st.utax = this.value; calc(); });
	$("tp-tipontax").addEventListener("change", function () { st.tipOnTax = this.checked; calc(); });
	$("tp-people").addEventListener("input", function (e) {
		var row = e.target.closest(".tp-prow"); if (!row) return; var i = +row.dataset.i;
		if (e.target.classList.contains("tp-pname")) { st.up[i].name = e.target.value.slice(0, 40); [].forEach.call(root.querySelectorAll('.tp-who[data-i="' + i + '"]'), function (b) { b.textContent = st.up[i].name || "Person " + (i + 1); }); }
		else st.up[i].items = e.target.value;
		calc();
	});
	$("tp-people").addEventListener("click", function (e) {
		var x = e.target.closest(".tp-x"); if (!x || st.up.length < 2) return; var i = +x.closest(".tp-prow").dataset.i;
		st.up.splice(i, 1);
		st.us.forEach(function (s) { s.who = s.who.filter(function (w) { return w !== i; }).map(function (w) { return w > i ? w - 1 : w; }); });
		drawPeople(); calc();
	});
	$("tp-addp").onclick = function () { if (st.up.length >= 30) return; st.up.push({ name: "Person " + (st.up.length + 1), items: "" }); drawPeople(); calc(); var ins = $("tp-people").querySelectorAll(".tp-pit"); ins[ins.length - 1].focus(); };
	$("tp-adds").onclick = function () { if (st.us.length >= 30) return; st.us.push({ name: "", amt: "", who: [] }); drawShared(); calc(); var ins = $("tp-shared").querySelectorAll(".tp-sname"); ins[ins.length - 1].focus(); };
	$("tp-shared").addEventListener("input", function (e) { var row = e.target.closest(".tp-srow"); if (!row) return; var s = st.us[+row.dataset.k]; if (e.target.classList.contains("tp-sname")) s.name = e.target.value.slice(0, 40); else s.amt = e.target.value; calc(); });
	$("tp-shared").addEventListener("click", function (e) {
		var row = e.target.closest(".tp-srow"); if (!row) return; var k = +row.dataset.k, s = st.us[k];
		if (e.target.closest(".tp-x")) { st.us.splice(k, 1); drawShared(); calc(); return; }
		var w = e.target.closest(".tp-who"); if (!w) return;
		var all = st.up.map(function (_, i) { return i; }), sel = s.who.length ? s.who.slice() : all.slice(), i = +w.dataset.i, at = sel.indexOf(i);
		if (at >= 0) { if (sel.length === 1) { toast("At least one person shares it"); return; } sel.splice(at, 1); } else sel.push(i);
		sel.sort(function (a, b) { return a - b; });
		s.who = sel.length === all.length ? [] : sel;
		drawShared(); calc();
	});
	$("tp-qt").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-p]"); if (tr) setTip(tr.dataset.p); });
	$("tp-qt").addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== " ") return; var tr = e.target.closest("tr[data-p]"); if (tr) { e.preventDefault(); setTip(tr.dataset.p); } });
	$("tp-country").addEventListener("change", function () { st.country = this.value; drawCountry(); save(); });
	$("tp-custom").addEventListener("click", function (e) { var b = e.target.closest("#tp-usec"); if (!b) return; setTip(b.dataset.p); toast("Tip set to " + b.dataset.p + "%"); });
	function link() {
		var q = new URLSearchParams(), c = cur();
		if (st.bill) q.set("b", st.bill.trim());
		if (st.tipMode === "amt") q.set("ta", st.tipAmt.trim()); else q.set("t", st.tipPct);
		q.set("p", st.people);
		if (st.pre && st.tax) q.set(st.taxMode === "pct" ? "tax" : "taxa", st.tax.trim());
		if (st.round !== "none") { q.set("r", st.round); q.set("s", st.step); }
		if (c.code !== defCur()) q.set("c", c.code);
		return location.origin + location.pathname + "?" + q.toString();
	}
	$("tp-link").onclick = function () {
		if (st.mode !== "even") { copy(location.origin + location.pathname, "Link copied (the uneven list stays on this device)"); return; }
		copy(link(), "Link copied");
	};
	$("tp-copy").onclick = function () {
		var r = last, lines = [];
		if (!r) return;
		if (st.mode === "even") {
			lines.push("Bill: " + money(r.bill), "Tip: " + money(r.tip) + (r.effPct != null ? " (" + TP.fmtPct(r.effPct) + ")" : ""), "Total: " + money(r.total));
			if (r.people > 1) lines.push("Each of " + r.people + ": " + (r.uneven ? money(r.perPersonMax) + " / " + money(r.perPerson) : money(r.perPerson)));
		} else {
			r.rows.forEach(function (x, i) { lines.push((x.name || "Person " + (i + 1)) + ": " + money(x.pay) + " (had " + money(x.sub) + ", tax " + money(x.tax) + ", tip " + money(x.tip) + ")"); });
			lines.push("Total: " + money(r.total) + " (tip " + money(r.tip) + ")");
		}
		copy(lines.join("\n"), "Summary copied");
	};
	$("tp-reset").onclick = function () {
		var keep = { cur: st.cur, country: st.country, tipPct: st.tipPct, mode: st.mode };
		st = Object.assign(fresh(), keep); sane(); syncForm(); calc(); $("tp-bill").focus();
	};

	/* ---------- start ---------- */
	load(); fromUrl();
	if (!st.country) st.country = TP.COUNTRIES.some(function (c) { return c.c === REG; }) ? REG : "US";
	sane(); syncForm(); drawCountry(); calc();
})();
