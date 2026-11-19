/* MES Expense Splitter -- mes.fm/expense-splitter (UI; maths in lib.js, global MESSplit).
 * localStorage "mes-expense-splitter:v1" = {cur: trip id, order: [ids], trips: {id: trip}}.
 * Share link ?s=2<base64url deflate-raw> (or 1<base64url JSON>) = one packed trip; opening it adds the trip and clears the query.
 */
(function () {
	"use strict";
	var S = window.MESSplit, $ = function (id) { return document.getElementById(id); }, root = $("xs");
	if (!root || !S) return;
	var KEY = "mes-expense-splitter:v1";
	var PCOL = ["#2f6fd6", "#d9480f", "#2b8a3e", "#ae3ec9", "#e8590c", "#0c8599", "#c2255c", "#5c940d", "#7048e8", "#a07400", "#1971c2", "#d6336c"];
	var CCOL = { stay: "#4c6ef5", food: "#f08c00", groc: "#40c057", drink: "#be4bdb", fuel: "#868e96", fun: "#15aabf", other: "#a9764a" };
	var TAGL = {}; S.TAGS.forEach(function (t) { TAGL[t[0]] = t[1]; });
	var store = { cur: "", order: [], trips: {} }, trip, openExp = "", openPerson = "", focusP = "", chartMode = "bars", res;

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function defCur() {
		var l = ((navigator.languages && navigator.languages[0]) || navigator.language || "en-US").toLowerCase();
		var m = { "en-ca": "CAD", "fr-ca": "CAD", "en-gb": "GBP", "en-au": "AUD", "en-nz": "NZD", "en-in": "INR", "ja": "JPY", "vi": "VND", "ko": "KRW", "es-mx": "MXN", "pt-br": "BRL", "de-ch": "CHF" };
		if (m[l]) return m[l]; if (m[l.slice(0, 2)]) return m[l.slice(0, 2)];
		if (/^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt)/.test(l)) return "EUR"; return "USD";
	}
	function load() {
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.trips) store = s; } catch (e) {}
		if (!store.order || !store.order.length) store = { cur: "", order: [], trips: {} };
		store.order = store.order.filter(function (id) { return store.trips[id]; });
		if (!store.trips[store.cur]) store.cur = store.order[0];
		trip = store.cur ? S.normalize(store.trips[store.cur]) : null;
	}
	function save() { store.trips[store.cur] = trip; try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
	function addTrip(t, quiet) { var id = S.uid(); store.trips[id] = S.normalize(t); store.order.unshift(id); store.cur = id; trip = store.trips[id]; if (!quiet) save(); return id; }
	function toast(msg) {
		var t = $("xs-toast"); if (!t) { t = document.createElement("div"); t.id = "xs-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1900);
	}
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function money(m, o) { return S.fmt(m, trip.cur, o); }
	function pcol(id) { var i = trip.people.findIndex(function (p) { return p.id === id; }); return PCOL[(i < 0 ? 0 : i) % PCOL.length]; }
	function pname(id) { return S.nameOf(trip, id); }
	function tagLabel(t) { return TAGL[t] || t; }
	function catOf(k) { return S.CATS.filter(function (c) { return c[0] === k; })[0] || S.CATS[6]; }
	function curOpts(sel) { return S.CURRENCIES.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === sel ? " selected" : "") + ">" + c[0] + " " + esc(c[1]) + " · " + esc(c[3]) + "</option>"; }).join(""); }
	function personOpts(sel, blank) { return (blank ? '<option value="">' + blank + "</option>" : "") + trip.people.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join(""); }
	function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
	function initials(n) { var w = String(n).trim().split(/\s+/); return ((w[0] || "?").charAt(0) + (w[1] ? w[1].charAt(0) : (w[0] || "").charAt(1) || "")).toUpperCase(); }
	function tagsInUse() { var t = []; trip.people.forEach(function (p) { p.tags.forEach(function (x) { if (t.indexOf(x) < 0) t.push(x); }); }); return t; }
	function changed(full) { trip = S.normalize(trip); save(); if (full) { renderTop(); renderPeople(); renderExps(); } renderResults(); }

	/* ---------- top: trips, currency, length ---------- */
	function renderTop() {
		$("xs-trips").innerHTML = store.order.map(function (id) { var t = store.trips[id]; return '<option value="' + id + '"' + (id === store.cur ? " selected" : "") + ">" + esc(t.name || "Untitled trip") + "</option>"; }).join("");
		$("xs-cur").innerHTML = curOpts(trip.cur);
		$("xs-days").value = trip.days;
	}
	$("xs-trips").addEventListener("change", function () { store.cur = this.value; trip = S.normalize(store.trips[store.cur]); openExp = openPerson = focusP = ""; save(); changed(true); });
	$("xs-new").addEventListener("click", function () {
		var name = prompt("Name of the trip", "My trip"); if (name == null) return;
		var t = S.blank(trip.cur); t.name = name.trim().slice(0, 80) || "My trip"; addTrip(t); openExp = openPerson = focusP = ""; changed(true); $("xs-pname").focus();
	});
	$("xs-more").addEventListener("click", function (e) { e.stopPropagation(); var m = $("xs-menu"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); });
	document.addEventListener("click", function (e) { if (!e.target.closest("#xs-menu")) { $("xs-menu").hidden = true; $("xs-more").setAttribute("aria-expanded", "false"); } });
	$("xs-menu").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-act]"); if (!b) return; var a = b.dataset.act; $("xs-menu").hidden = true;
		if (a === "rename") { var n = prompt("Name of the trip", trip.name); if (n != null) { trip.name = n.trim().slice(0, 80); changed(true); } }
		else if (a === "dup") { var c = JSON.parse(JSON.stringify(trip)); c.name = (trip.name || "Trip") + " (copy)"; addTrip(c); changed(true); toast("Copy made"); }
		else if (a === "example") { addTrip(S.example()); openExp = ""; changed(true); toast("Example trip added"); }
		else if (a === "export") {
			var blob = new Blob([JSON.stringify({ app: "mes-expense-splitter", v: 1, trips: store.order.map(function (id) { return store.trips[id]; }) }, null, 1)], { type: "application/json" });
			var u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = "mes-trips.json"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
		}
		else if (a === "import") $("xs-file").click();
		else if (a === "del") {
			if (!confirm("Delete “" + (trip.name || "this trip") + "”? This can't be undone.")) return;
			delete store.trips[store.cur]; store.order = store.order.filter(function (id) { return id !== store.cur; });
			if (!store.order.length) { addTrip(Object.assign(S.blank(trip.cur), { name: "My trip" }), true); }
			store.cur = store.order[0]; trip = S.normalize(store.trips[store.cur]); changed(true);
		}
	});
	$("xs-file").addEventListener("change", function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (txt) {
			var d = JSON.parse(txt), list = Array.isArray(d) ? d : (d.trips || [d]), k = 0;
			list.forEach(function (t) { if (t && t.people) { addTrip(t, true); k++; } });
			save(); changed(true); toast(k ? k + " trip" + (k > 1 ? "s" : "") + " restored" : "No trips found in that file");
		}).catch(function () { toast("That file could not be read"); });
	});
	$("xs-cur").addEventListener("change", function () {
		var old = trip.cur; trip.cur = this.value;
		trip.exps.forEach(function (e) { if (e.cur === old && !trip.exps.some(function (x) { return x.cur !== old; })) e.cur = trip.cur; });
		trip.pays.forEach(function (p) { if (p.cur === old) p.cur = trip.cur; });
		changed(true);
	});
	function setDays(v) {
		var old = trip.days; trip.days = Math.max(1, Math.min(365, v || 1));
		trip.people.forEach(function (p) { if (p.n === old && p.a === 1) p.n = trip.days; });
		changed(true);
	}
	root.querySelector(".xs-daysf").addEventListener("click", function (e) { var b = e.target.closest("button[data-d]"); if (b) setDays(trip.days + +b.dataset.d); });
	$("xs-days").addEventListener("change", function () { setDays(parseInt(this.value, 10)); });

	/* ---------- people ---------- */
	function renderPeople() {
		var box = $("xs-people");
		if (!trip.people.length) { box.innerHTML = '<p class="xs-empty">Nobody yet. Add the people on the trip below.</p>'; return; }
		var many = trip.days > 1;
		box.innerHTML = trip.people.map(function (p) {
			var nightSel = "";
			if (many) { for (var k = 1; k <= trip.days; k++) nightSel += '<option value="' + k + '"' + (p.a === k ? " selected" : "") + ">" + k + "</option>"; }
			var chips = S.TAGS.map(function (t) { var on = p.tags.indexOf(t[0]) >= 0; return '<button type="button" class="xs-tag" data-tag="' + t[0] + '" aria-pressed="' + on + '">' + esc(t[1]) + "</button>"; }).join("")
				+ p.tags.filter(function (t) { return !TAGL[t]; }).map(function (t) { return '<button type="button" class="xs-tag" data-tag="' + esc(t) + '" aria-pressed="true" title="Click to remove">' + esc(t) + " ×</button>"; }).join("")
				+ '<input class="xs-newtag" type="text" placeholder="+ own tag" aria-label="Add your own tag for ' + esc(p.name) + '" maxlength="24">';
			return '<div class="xs-person" data-id="' + p.id + '" style="--pc:' + pcol(p.id) + '">'
				+ '<div class="xs-prow"><span class="xs-dot" aria-hidden="true">' + esc(initials(p.name)) + '</span>'
				+ '<input class="tu-input xs-pn" data-f="name" type="text" value="' + esc(p.name) + '" aria-label="Name" maxlength="40">'
				+ '<div class="xs-nights"><span class="xs-lab">Nights</span><div class="xs-step xs-step--sm"><button type="button" data-n="-1" aria-label="One night less">−</button><input class="tu-input" data-f="n" type="text" inputmode="numeric" value="' + p.n + '" aria-label="Nights ' + esc(p.name) + ' stayed"><button type="button" data-n="1" aria-label="One night more">+</button></div></div>'
				+ (many && p.n < trip.days ? '<label class="xs-from"><span class="xs-lab">From night</span><select class="tu-select" data-f="a">' + nightSel + "</select></label>" : "")
				+ '<button type="button" class="xs-del" data-del="1" aria-label="Remove ' + esc(p.name) + '" title="Remove">×</button></div>'
				+ '<div class="xs-tags">' + chips + "</div></div>";
		}).join("");
	}
	$("xs-addp").addEventListener("submit", function (e) {
		e.preventDefault(); var inp = $("xs-pname"), names = inp.value.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
		if (!names.length) { inp.focus(); return; }
		names.forEach(function (n) { trip.people.push({ id: S.uid(), name: n, n: trip.days, a: 1, w: 1, tags: [] }); });
		inp.value = ""; changed(true); inp.focus();
	});
	$("xs-people").addEventListener("input", function (e) {
		var row = e.target.closest(".xs-person"), f = e.target.dataset.f; if (!row || !f) return; var p = byId(trip.people, row.dataset.id); if (!p) return;
		if (f === "name") { p.name = e.target.value.slice(0, 40); row.querySelector(".xs-dot").textContent = initials(p.name || "?"); save(); renderExps(); renderResults(); }
		else if (f === "n") { var v = parseInt(e.target.value, 10); if (v >= 0) { p.n = Math.min(v, 365); save(); renderResults(); } }
	});
	$("xs-people").addEventListener("change", function (e) {
		var row = e.target.closest(".xs-person"), f = e.target.dataset.f; if (!row) return; var p = byId(trip.people, row.dataset.id); if (!p) return;
		if (f === "a") { p.a = parseInt(e.target.value, 10) || 1; changed(); }
		else if (f === "n") changed(true);
		else if (e.target.classList.contains("xs-newtag")) addTag(p, e.target.value);
	});
	$("xs-people").addEventListener("keydown", function (e) {
		if (e.key === "Enter" && e.target.classList.contains("xs-newtag")) { e.preventDefault(); var row = e.target.closest(".xs-person"); addTag(byId(trip.people, row.dataset.id), e.target.value); }
	});
	function addTag(p, v) { v = String(v || "").trim().toLowerCase().slice(0, 24); if (!p || !v) return; if (p.tags.indexOf(v) < 0) p.tags.push(v); changed(true); }
	$("xs-people").addEventListener("click", function (e) {
		var row = e.target.closest(".xs-person"); if (!row) return; var p = byId(trip.people, row.dataset.id); if (!p) return;
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.n) { p.n = Math.max(0, Math.min(365, p.n + +b.dataset.n)); changed(true); }
		else if (b.dataset.tag) { var t = b.dataset.tag, i = p.tags.indexOf(t); if (i >= 0) p.tags.splice(i, 1); else p.tags.push(t); changed(true); }
		else if (b.dataset.del) {
			var used = trip.exps.some(function (x) { return x.payer === p.id; }) || trip.pays.some(function (x) { return x.from === p.id || x.to === p.id; });
			if (used && !confirm(p.name + " paid for something or has payments. Remove anyway? Those expenses will need a new payer.")) return;
			trip.people = trip.people.filter(function (x) { return x !== p; }); changed(true);
		}
	});

	/* ---------- expenses ---------- */
	function ruleSummary(e) {
		var bits = [];
		var R = { equal: "equally", nights: "by nights", shares: "by shares", exact: "exact amounts" };
		bits.push(R[e.rule]);
		if (e.who.length && e.who.length < trip.people.length) bits.push(e.who.length + " people");
		if (e.day) bits.push("night " + e.day);
		if (e.skip.length) bits.push("not " + e.skip.map(tagLabel).join(", ").toLowerCase());
		return bits.join(" · ");
	}
	var ERR = { amount: "The amount can't be read.", empty: "Type the amount.", rate: "Add the exchange rate below.", payer: "Choose who paid.", nobody: "Nobody is left to share this.", exact: "One of the exact amounts can't be read.", exactsum: "The exact amounts don't add up to the total." };
	function expCard(e, i) {
		var r = res && res.exps[i], open = openExp === e.id, cat = catOf(e.cat);
		var amt = S.parseAmount(e.amt), shown = amt ? S.fmt(S.toMinor(amt, S.dec(e.cur)), e.cur, { code: e.cur !== trip.cur }) : "—";
		var h = '<div class="xs-exp' + (open ? " is-open" : "") + (r && r.err && r.err !== "empty" ? " is-bad" : "") + '" data-id="' + e.id + '">'
			+ '<button type="button" class="xs-esum" data-tog="1" aria-expanded="' + open + '"><span class="xs-cat" style="--cc:' + CCOL[e.cat] + '" aria-hidden="true">' + cat[2] + "</span>"
			+ '<span class="xs-ewhat"><b>' + esc(e.what || "Expense " + (i + 1)) + "</b><small>" + (e.payer ? esc(pname(e.payer)) + " paid" : "who paid?") + " · " + esc(ruleSummary(e)) + "</small></span>"
			+ '<span class="xs-eamt">' + esc(shown) + (e.cur !== trip.cur && r && !r.err ? "<small>" + esc(money(r.base)) + "</small>" : "") + '</span><span class="xs-chev" aria-hidden="true">▾</span></button>';
		if (r && r.err && r.err !== "empty" && !open) h += '<p class="xs-err">' + ERR[r.err] + "</p>";
		if (open) h += expEditor(e, r);
		return h + "</div>";
	}
	function expEditor(e, r) {
		var tags = tagsInUse(), sharers = S.sharers(trip, e).map(function (s) { return s.p.id; });
		var nightOpts = '<option value="0">Whole trip</option>'; for (var k = 1; k <= trip.days; k++) nightOpts += '<option value="' + k + '"' + (e.day === k ? " selected" : "") + ">Night " + k + " only</option>";
		var h = '<div class="xs-eed">'
			+ '<div class="tu-row"><div class="tu-field"><label>What</label><input class="tu-input" data-f="what" type="text" value="' + esc(e.what) + '" placeholder="e.g. Cabin, groceries, gas" maxlength="80"></div>'
			+ '<div class="tu-field tu-field--sm" style="flex-basis:11em;"><label>Category</label><select class="tu-select" data-f="cat">' + S.CATS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === e.cat ? " selected" : "") + ">" + c[2] + " " + esc(c[1]) + "</option>"; }).join("") + "</select></div></div>"
			+ '<div class="tu-row"><div class="tu-field" style="flex-basis:9em;"><label>Amount</label><input class="tu-input xs-amt" data-f="amt" type="text" inputmode="decimal" value="' + esc(e.amt) + '" placeholder="0.00" autocomplete="off"></div>'
			+ '<div class="tu-field tu-field--sm" style="flex-basis:10em;"><label>Currency</label><select class="tu-select" data-f="cur">' + curOpts(e.cur) + "</select></div>"
			+ '<div class="tu-field" style="flex-basis:10em;"><label>Paid by</label><select class="tu-select" data-f="payer">' + personOpts(e.payer, "Choose…") + "</select></div></div>"
			+ '<div class="xs-lab xs-lab--b">Split</div><div class="tu-seg xs-rules" role="group" aria-label="How to split">' + S.RULES.map(function (x) { return '<button type="button" data-rule="' + x[0] + '" aria-pressed="' + (e.rule === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>"
			+ '<div class="xs-lab xs-lab--b">Shared by <button type="button" class="xs-link" data-all="1">' + (e.who.length ? "everyone" : "") + "</button></div>"
			+ '<div class="xs-who">' + trip.people.map(function (p) {
				var picked = !e.who.length || e.who.indexOf(p.id) >= 0, inn = sharers.indexOf(p.id) >= 0;
				return '<button type="button" class="xs-pchip' + (picked && !inn ? " is-out" : "") + '" data-who="' + p.id + '" aria-pressed="' + picked + '" style="--pc:' + pcol(p.id) + '" title="' + (picked && !inn ? esc(p.name) + " is left out by the night or tag below" : "") + '">' + esc(p.name) + "</button>";
			}).join("") + "</div>"
			+ '<div class="tu-row xs-ruleopts">' + (trip.days > 1 ? '<div class="tu-field tu-field--sm" style="flex-basis:11em;"><label>When</label><select class="tu-select" data-f="day">' + nightOpts + "</select></div>" : "")
			+ (tags.length ? '<div class="xs-skip"><span class="xs-lab">Leave out</span>' + tags.map(function (t) { return '<button type="button" class="xs-tag" data-skip="' + esc(t) + '" aria-pressed="' + (e.skip.indexOf(t) >= 0) + '">' + esc(tagLabel(t)) + "</button>"; }).join("") + "</div>"
				: '<p class="tu-note xs-skiphint">Tag people (such as <i>No alcohol</i>) to leave them out of a bill.</p>') + "</div>";
		if (e.rule === "shares" || e.rule === "exact") {
			h += '<div class="xs-per">' + S.sharers(trip, e).map(function (s) {
				var v = e.rule === "shares" ? (e.sh[s.p.id] != null ? e.sh[s.p.id] : 1) : (e.ex[s.p.id] || "");
				return '<label class="xs-perrow"><span style="--pc:' + pcol(s.p.id) + '">' + esc(s.p.name) + '</span><input class="tu-input" data-per="' + s.p.id + '" type="text" inputmode="decimal" value="' + esc(v) + '" placeholder="' + (e.rule === "exact" ? "rest" : "1") + '"></label>';
			}).join("") + "</div>"
				+ '<p class="tu-note">' + (e.rule === "shares" ? "2 shares pay twice as much as 1. Use 0 to leave someone out." : "Type amounts in " + e.cur + " for the people with a fixed part. Anyone left blank shares the rest equally.") + "</p>";
		}
		h += '<div class="xs-prev" data-prev="1">' + previewHtml(r) + "</div>"
			+ '<div class="xs-eacts"><button type="button" class="tu-btn tu-btn--primary" data-tog="1">Done</button><button type="button" class="tu-btn tu-btn--ghost" data-dupe="1">Duplicate</button><button type="button" class="tu-btn tu-btn--ghost xs-danger" data-edel="1">Delete</button></div></div>';
		return h;
	}
	function previewHtml(r) {
		if (!r) return "";
		if (r.err) return '<p class="xs-err">' + ERR[r.err] + (r.err === "exactsum" ? " Off by " + esc(money(r.diff)) + "." : "") + "</p>";
		var ids = Object.keys(r.alloc);
		return '<div class="xs-lab">Each person pays</div><div class="xs-prevlist">' + ids.map(function (id) {
			return '<span style="--pc:' + pcol(id) + '"><i aria-hidden="true"></i>' + esc(pname(id)) + " <b>" + esc(money(r.alloc[id])) + "</b></span>";
		}).join("") + "</div>";
	}
	function renderExps() {
		var box = $("xs-exps");
		if (!res) res = S.compute(trip);
		box.innerHTML = trip.exps.length ? trip.exps.map(expCard).join("") : '<p class="xs-empty">No expenses yet.' + (trip.people.length ? "" : " Add the people first.") + "</p>";
		renderRates();
	}
	function expOf(el) { var c = el.closest(".xs-exp"); return c ? byId(trip.exps, c.dataset.id) : null; }
	function refreshExp(e) {
		res = S.compute(trip);
		var i = trip.exps.indexOf(e), card = $("xs-exps").querySelector('.xs-exp[data-id="' + e.id + '"]');
		if (card) { var sum = card.querySelector(".xs-esum"), tmp = document.createElement("div"); tmp.innerHTML = expCard(e, i); sum.replaceWith(tmp.firstChild.querySelector(".xs-esum")); var pv = card.querySelector("[data-prev]"); if (pv) pv.innerHTML = previewHtml(res.exps[i]); }
		renderRates(); renderResults(true);
	}
	$("xs-adde").addEventListener("click", function () {
		if (!trip.people.length) { toast("Add the people first"); $("xs-pname").focus(); return; }
		var last = trip.exps[trip.exps.length - 1];
		var e = { id: S.uid(), what: "", cat: "food", payer: last ? last.payer : trip.people[0].id, amt: "", cur: last ? last.cur : trip.cur, rule: "equal", who: [], day: 0, skip: [], sh: {}, ex: {} };
		trip.exps.push(e); openExp = e.id; changed(true);
		var inp = $("xs-exps").querySelector('.xs-exp[data-id="' + e.id + '"] [data-f="what"]'); if (inp) inp.focus();
	});
	$("xs-exps").addEventListener("input", function (ev) {
		var e = expOf(ev.target); if (!e) return; var t = ev.target;
		if (t.dataset.f === "what" || t.dataset.f === "amt") { e[t.dataset.f] = t.value; save(); refreshExp(e); }
		else if (t.dataset.per) {
			if (e.rule === "shares") { var v = S.parseAmount(t.value); if (t.value.trim() === "") delete e.sh[t.dataset.per]; else if (v != null && v >= 0) e.sh[t.dataset.per] = v; }
			else { if (t.value.trim() === "") delete e.ex[t.dataset.per]; else e.ex[t.dataset.per] = t.value; }
			save(); refreshExp(e);
		}
	});
	$("xs-exps").addEventListener("change", function (ev) {
		var e = expOf(ev.target); if (!e) return; var f = ev.target.dataset.f;
		if (!f || f === "what" || f === "amt") return;
		var v = ev.target.value;
		if (f === "day") e.day = parseInt(v, 10) || 0; else e[f] = v;
		if (f === "cat") {
			if (v === "stay" && e.rule === "equal") e.rule = "nights";
			if (v === "drink" && tagsInUse().indexOf("noalc") >= 0 && e.skip.indexOf("noalc") < 0) e.skip.push("noalc");
			if (!e.what.trim()) e.what = catOf(v)[1];
		}
		changed(true);
	});
	$("xs-exps").addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target.matches("input[data-f], input[data-per]")) { ev.preventDefault(); openExp = ""; renderExps(); } });
	$("xs-exps").addEventListener("click", function (ev) {
		var b = ev.target.closest("button"); if (!b) return; var e = expOf(b); if (!e) return;
		if (b.dataset.tog) { openExp = openExp === e.id ? "" : e.id; renderExps(); var c = $("xs-exps").querySelector('.xs-exp[data-id="' + e.id + '"]'); if (c && openExp && !c.querySelector('[data-f="amt"]').value) c.querySelector('[data-f="amt"]').focus(); return; }
		if (b.dataset.rule) e.rule = b.dataset.rule;
		else if (b.dataset.all) e.who = [];
		else if (b.dataset.who) {
			var id = b.dataset.who, all = trip.people.map(function (p) { return p.id; }), cur = e.who.length ? e.who.slice() : all.slice(), i = cur.indexOf(id);
			if (i >= 0) cur.splice(i, 1); else cur.push(id);
			e.who = cur.length === all.length ? [] : (cur.length ? cur : [id]);
		}
		else if (b.dataset.skip) { var t = b.dataset.skip, j = e.skip.indexOf(t); if (j >= 0) e.skip.splice(j, 1); else e.skip.push(t); }
		else if (b.dataset.dupe) { var c2 = JSON.parse(JSON.stringify(e)); c2.id = S.uid(); c2.what = e.what ? e.what + " (copy)" : ""; trip.exps.splice(trip.exps.indexOf(e) + 1, 0, c2); openExp = c2.id; }
		else if (b.dataset.edel) {
			var idx = trip.exps.indexOf(e); trip.exps.splice(idx, 1); openExp = ""; changed(true);
			undoToast("Expense deleted", function () { trip.exps.splice(idx, 0, e); changed(true); }); return;
		}
		else return;
		changed(true);
	});
	function undoToast(msg, undo) {
		toast(msg); var t = $("xs-toast"), b = document.createElement("button"); b.type = "button"; b.className = "xs-undo"; b.textContent = "Undo";
		t.appendChild(b); t.style.pointerEvents = "auto"; clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); t.style.pointerEvents = ""; }, 5000);
		b.onclick = function () { undo(); t.classList.remove("tu-toast--show"); t.style.pointerEvents = ""; };
	}

	/* ---------- exchange rates ---------- */
	function renderRates() {
		var used = []; trip.exps.forEach(function (e) { if (e.cur !== trip.cur && used.indexOf(e.cur) < 0) used.push(e.cur); });
		trip.pays.forEach(function (p) { if (p.cur !== trip.cur && used.indexOf(p.cur) < 0) used.push(p.cur); });
		var box = $("xs-rates"); box.hidden = !used.length; if (!used.length) return;
		var act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.rate : null;
		if (act && used.indexOf(act) >= 0 && box.querySelector('[data-rate="' + act + '"]')) return;
		$("xs-ratelist").innerHTML = used.map(function (c) {
			var r = trip.rates[c];
			return '<div class="xs-rate' + (r ? "" : " is-bad") + '"><span>1 ' + c + " =</span><input class=\"tu-input\" data-rate=\"" + c + '" type="text" inputmode="decimal" value="' + (r ? +r.toPrecision(8) : "") + '" placeholder="rate" aria-label="' + trip.cur + " for 1 " + c + '"><span>' + trip.cur + '</span><button type="button" class="tu-btn tu-btn--ghost" data-fetch="' + c + '">Today\'s rate</button></div>';
		}).join("");
	}
	$("xs-ratelist").addEventListener("input", function (e) {
		var c = e.target.dataset.rate; if (!c) return; var v = S.parseAmount(e.target.value);
		if (v > 0) trip.rates[c] = v; else delete trip.rates[c];
		e.target.parentNode.classList.toggle("is-bad", !(v > 0)); save(); res = S.compute(trip); renderResults(); refreshSums();
	});
	$("xs-ratelist").addEventListener("click", function (e) {
		var b = e.target.closest("[data-fetch]"); if (!b) return; var c = b.dataset.fetch; b.disabled = true; b.textContent = "…";
		fetch("https://open.er-api.com/v6/latest/" + c).then(function (r) { return r.json(); }).then(function (d) {
			var v = d && d.rates && d.rates[trip.cur]; if (!(v > 0)) throw 0;
			trip.rates[c] = +v.toPrecision(6); changed(true); toast("1 " + c + " = " + trip.rates[c] + " " + trip.cur + " today");
		}).catch(function () { toast("Couldn't get the rate. Type it in."); b.disabled = false; b.textContent = "Today's rate"; });
	});
	function refreshSums() { trip.exps.forEach(function (e) { var card = $("xs-exps").querySelector('.xs-exp[data-id="' + e.id + '"]'); if (card) { var tmp = document.createElement("div"); tmp.innerHTML = expCard(e, trip.exps.indexOf(e)); card.querySelector(".xs-esum").replaceWith(tmp.firstChild.querySelector(".xs-esum")); } }); }

	/* ---------- results ---------- */
	function renderResults(keepExps) {
		res = S.compute(trip);
		var t = trip, people = res.people;
		$("xs-etotal").textContent = res.total ? money(res.total) : "";
		var pn = 0; t.people.forEach(function (p) { pn += p.n * S.weight(p); });
		var stats = [["Total spent", money(res.total), t.exps.length + " expense" + (t.exps.length === 1 ? "" : "s")],
			["Per person-night", pn ? money(Math.round(res.total / pn)) : "—", pn ? +pn.toFixed(1) + " person-nights" : ""],
			["Payments to settle", String(res.settle.length), res.settle.length ? "fewest possible" : "everyone is even"]];
		if (t.mode === "hub") stats[2][2] = "through " + pname(t.hub);
		$("xs-stats").innerHTML = stats.map(function (s, i) { return '<div class="tu-stat' + (i === 0 ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + s[0] + '</div><div class="tu-stat__value">' + esc(s[1]) + '</div><div class="tu-stat__sub">' + esc(s[2]) + "</div></div>"; }).join("");
		// mode
		root.querySelectorAll("#xs-mode button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === t.mode)); });
		var hub = $("xs-hub"); hub.hidden = t.mode !== "hub"; hub.innerHTML = personOpts(t.hub, "Choose who collects…");
		// settle list
		var list = res.settle.filter(function (s) { return !focusP || s.from === focusP || s.to === focusP; });
		$("xs-settle").innerHTML = !t.people.length ? '<li class="xs-empty">Add people and expenses to see who pays whom.</li>' : !res.settle.length ? '<li class="xs-even">🎉 Everyone is even. Nothing to pay.</li>'
			: list.map(function (s) {
				var k = res.settle.indexOf(s);
				return '<li><span class="xs-sp" style="--pc:' + pcol(s.from) + '">' + esc(pname(s.from)) + '</span><span class="xs-arrow" aria-hidden="true">→</span><span class="xs-pays">pays</span><span class="xs-sp" style="--pc:' + pcol(s.to) + '">' + esc(pname(s.to)) + '</span><b class="xs-samt">' + esc(money(s.amt)) + '</b><button type="button" class="tu-btn tu-btn--ghost xs-paid" data-paid="' + k + '">Mark paid</button></li>';
			}).join("") + (focusP ? '<li class="xs-focus">Showing ' + esc(pname(focusP)) + '\'s payments. <button type="button" class="xs-link" data-unfocus="1">Show all</button></li>' : "");
		drawFlow(); drawChart(); drawTable(); drawPays();
		if (!keepExps && document.activeElement && !$("xs-exps").contains(document.activeElement)) { /* keep summaries fresh */ refreshSums(); }
	}
	$("xs-mode").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-m]"); if (!b) return; trip.mode = b.dataset.m;
		if (trip.mode === "hub" && !trip.hub && trip.people.length) { var best = res.people.slice().sort(function (a, b2) { return b2.paid - a.paid; })[0]; trip.hub = best ? best.id : trip.people[0].id; }
		changed();
	});
	$("xs-hub").addEventListener("change", function () { trip.hub = this.value; changed(); });
	function markPaid(k) {
		var s = res.settle[k]; if (!s) return; var d = S.dec(trip.cur);
		var p = { id: S.uid(), from: s.from, to: s.to, amt: (s.amt / Math.pow(10, d)).toFixed(d), cur: trip.cur };
		trip.pays.push(p); changed();
		undoToast(pname(s.from) + " paid " + pname(s.to) + " " + money(s.amt), function () { trip.pays = trip.pays.filter(function (x) { return x !== p; }); changed(); });
	}
	$("xs-settle").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.paid != null) markPaid(+b.dataset.paid); else if (b.dataset.unfocus) { focusP = ""; renderResults(); }
	});
	$("xs-copy").addEventListener("click", function () {
		var head = (trip.name ? trip.name + ": " : "") + "who pays whom (" + money(res.total) + " total)\n";
		copy(head + S.settleText(res) + "\n\nWorked out with mes.fm/expense-splitter", "Copied");
	});
	$("xs-csv").addEventListener("click", function () {
		var blob = new Blob(["﻿" + S.csv(res)], { type: "text/csv" }), u = URL.createObjectURL(blob), l = document.createElement("a");
		l.href = u; l.download = (trip.name || "trip").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() + "-expenses.csv"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
	});

	/* share link: deflate-raw when the browser has CompressionStream */
	function deflate(bytes, mode) {
		var cs = mode === "c" ? new CompressionStream("deflate-raw") : new DecompressionStream("deflate-raw");
		var stream = new Blob([bytes]).stream().pipeThrough(cs);
		return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
	}
	function encodeLink(t) {
		var plain = S.encodePlain(t);
		if (typeof CompressionStream === "undefined") return Promise.resolve(plain);
		return deflate(S.utf8(JSON.stringify(S.pack(t))), "c").then(function (b) { var z = "2" + S.b64u(b); return z.length < plain.length ? z : plain; }, function () { return plain; });
	}
	function decodeLink(s) {
		if (s.charAt(0) === "1") return Promise.resolve(S.decodePlain(s));
		if (s.charAt(0) === "2" && typeof DecompressionStream !== "undefined") return deflate(S.unb64u(s.slice(1)), "d").then(function (b) { return S.unpack(JSON.parse(S.unutf8(b))); }).catch(function () { return null; });
		return Promise.resolve(null);
	}
	$("xs-share").addEventListener("click", function () {
		var p = encodeLink(trip).then(function (z) { return location.origin + "/expense-splitter?s=" + z; });
		if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
			try {
				navigator.clipboard.write([new ClipboardItem({ "text/plain": p.then(function (u) { return new Blob([u], { type: "text/plain" }); }) })]).then(function () { toast("Share link copied"); }, function () { p.then(function (u) { copy(u, "Share link copied"); }); });
				return;
			} catch (e) {}
		}
		p.then(function (u) { copy(u, "Share link copied"); });
	});

	/* settle-up arrow diagram */
	function drawFlow() {
		var box = $("xs-flow"), P = trip.people;
		if (P.length < 2) { box.innerHTML = '<p class="xs-empty">Add at least two people.</p>'; return; }
		var W = Math.max(300, Math.min(620, box.clientWidth || 520)), nr = W < 420 ? 19 : 24, H = Math.round(Math.min(W, 460) * (W < 420 ? 1.05 : P.length > 6 ? 0.95 : 0.86)), cx = W / 2, cy = H / 2, R = Math.min(W * (W < 420 ? 0.88 : 0.8), H) / 2 - (W < 420 ? 50 : 58), pos = {};
		P.forEach(function (p, i) { var a = -Math.PI / 2 + 2 * Math.PI * i / P.length; pos[p.id] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
		var maxA = Math.max.apply(null, res.settle.map(function (s) { return s.amt; }).concat([1]));
		var bal = {}; res.people.forEach(function (p) { bal[p.id] = p.bal; });
		var defs = '<defs>' + P.map(function (p) { return '<marker id="xsa-' + p.id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' + pcol(p.id) + '"/></marker>'; }).join("") + "</defs>";
		var arrows = res.settle.map(function (s, k) {
			var a = pos[s.from], b = pos[s.to], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, rr = nr + 3;
			var x1 = a[0] + ux * rr, y1 = a[1] + uy * rr, x2 = b[0] - ux * (rr + 6), y2 = b[1] - uy * (rr + 6);
			var mx = (x1 + x2) / 2 - uy * L * 0.14, my = (y1 + y2) / 2 + ux * L * 0.14;
			var w = 2 + 6 * s.amt / maxA, dim = focusP && s.from !== focusP && s.to !== focusP;
			var lx = 0.25 * x1 + 0.5 * mx + 0.25 * x2, ly = 0.25 * y1 + 0.5 * my + 0.25 * y2, label = money(s.amt), lw = label.length * 7.2 + 14;
			return '<g class="xs-arr' + (dim ? " is-dim" : "") + '" data-paid="' + k + '" tabindex="0" role="button" aria-label="' + esc(pname(s.from) + " pays " + pname(s.to) + " " + label + ". Mark as paid") + '">'
				+ '<title>' + esc(pname(s.from) + " pays " + pname(s.to) + " " + label + " (click when paid)") + "</title>"
				+ '<path d="M' + x1.toFixed(1) + "," + y1.toFixed(1) + " Q" + mx.toFixed(1) + "," + my.toFixed(1) + " " + x2.toFixed(1) + "," + y2.toFixed(1) + '" stroke="' + pcol(s.from) + '" stroke-width="' + w.toFixed(1) + '" fill="none" marker-end="url(#xsa-' + s.from + ')" stroke-linecap="round"/>'
				+ '<path class="xs-hit" d="M' + x1.toFixed(1) + "," + y1.toFixed(1) + " Q" + mx.toFixed(1) + "," + my.toFixed(1) + " " + x2.toFixed(1) + "," + y2.toFixed(1) + '" stroke="transparent" stroke-width="18" fill="none"/>'
				+ '<rect class="xs-albl" x="' + (lx - lw / 2).toFixed(1) + '" y="' + (ly - 11).toFixed(1) + '" width="' + lw.toFixed(1) + '" height="22" rx="11"/><text class="xs-atxt" x="' + lx.toFixed(1) + '" y="' + (ly + 4.5).toFixed(1) + '" text-anchor="middle">' + esc(label) + "</text></g>";
		}).join("");
		var nodes = P.map(function (p) {
			var q = pos[p.id], b = bal[p.id] || 0, dim = focusP && focusP !== p.id && !res.settle.some(function (s) { return (s.from === focusP && s.to === p.id) || (s.to === focusP && s.from === p.id); });
			var below = q[1] > cy + 5, ty = below ? q[1] + nr + 17 : q[1] - nr - 8, by = below ? ty + 16 : ty - 16;
			return '<g class="xs-node' + (dim ? " is-dim" : "") + (focusP === p.id ? " is-on" : "") + '" data-focus="' + p.id + '" tabindex="0" role="button" aria-label="Show only ' + esc(p.name) + '\'s payments">'
				+ '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + nr + '" fill="' + pcol(p.id) + '"/>'
				+ '<text class="xs-ni" x="' + q[0].toFixed(1) + '" y="' + (q[1] + 5).toFixed(1) + '" text-anchor="middle">' + esc(initials(p.name)) + "</text>"
				+ '<text class="xs-nn" x="' + q[0].toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="middle">' + esc(p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name) + "</text>"
				+ '<text class="xs-nb ' + (b > 0 ? "is-pos" : b < 0 ? "is-neg" : "") + '" x="' + q[0].toFixed(1) + '" y="' + by.toFixed(1) + '" text-anchor="middle">' + (b ? esc(money(b, { plus: true })) : "even") + "</text></g>";
		}).join("");
		box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Who pays whom">' + defs + arrows + nodes + "</svg>";
	}
	function flowAct(e) {
		var a = e.target.closest(".xs-arr"), n = e.target.closest(".xs-node");
		if (a) { var s = res.settle[+a.dataset.paid]; if (s && confirm("Mark as paid: " + pname(s.from) + " paid " + pname(s.to) + " " + money(s.amt) + "?")) markPaid(+a.dataset.paid); }
		else if (n) { focusP = focusP === n.dataset.focus ? "" : n.dataset.focus; renderResults(); }
	}
	$("xs-flow").addEventListener("click", flowAct);
	$("xs-flow").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flowAct(e); } });

	/* paid vs share bars */
	function drawChart() {
		var box = $("xs-chart"), P = res.people;
		root.querySelectorAll("#xs-cm button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.c === chartMode)); });
		if (!P.length || !res.total) { box.innerHTML = '<p class="xs-empty">The chart appears once there are expenses.</p>'; $("xs-legend").innerHTML = ""; return; }
		var W = Math.max(300, box.clientWidth || 560), lw = W < 420 ? 76 : 96, rw = chartMode === "bars" ? 120 : 86, bw = W - lw - rw, rowH = chartMode === "bars" ? 46 : 34, top = 8, H = top + P.length * rowH + 8, out = "";
		if (chartMode === "bars") {
			var max = Math.max.apply(null, P.map(function (p) { return Math.max(p.paid + p.sent, p.owed + p.recv); }).concat([1]));
			P.forEach(function (p, i) {
				var y = top + i * rowH, dim = focusP && focusP !== p.id ? " is-dim" : "";
				out += '<g class="xs-crow' + dim + '" data-focus="' + p.id + '"><text class="xs-cl" x="' + (lw - 8) + '" y="' + (y + 22) + '" text-anchor="end">' + esc(p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name) + "</text>";
				var pw = bw * p.paid / max;
				out += '<rect x="' + lw + '" y="' + (y + 3) + '" width="' + Math.max(pw, p.paid ? 1.5 : 0).toFixed(1) + '" height="15" rx="3" fill="' + pcol(p.id) + '"><title>' + esc(p.name + " paid " + money(p.paid)) + "</title></rect>";
				out += '<text class="xs-cv" x="' + (lw + pw + 5).toFixed(1) + '" y="' + (y + 15) + '">paid ' + esc(money(p.paid)) + "</text>";
				var x = lw;
				S.CATS.forEach(function (c) {
					var v = p.byCat[c[0]] || 0; if (v <= 0) return; var w = bw * v / max;
					out += '<rect x="' + x.toFixed(1) + '" y="' + (y + 21) + '" width="' + w.toFixed(1) + '" height="15" fill="' + CCOL[c[0]] + '"><title>' + esc(p.name + ": " + c[1] + " " + money(v)) + "</title></rect>"; x += w;
				});
				out += '<text class="xs-cv" x="' + (x + 5).toFixed(1) + '" y="' + (y + 33) + '">share ' + esc(money(p.owed)) + "</text></g>";
			});
			var cats = S.CATS.filter(function (c) { return res.byCat[c[0]]; });
			$("xs-legend").innerHTML = '<span><i style="background:repeating-linear-gradient(90deg,#2f6fd6 0 33%,#d9480f 33% 66%,#2b8a3e 66%)"></i>Paid (person\'s colour)</span>'
				+ cats.map(function (c) { return '<span><i style="background:' + CCOL[c[0]] + '"></i>' + esc(c[1]) + " " + esc(money(res.byCat[c[0]])) + "</span>"; }).join("");
		} else {
			var mb = Math.max.apply(null, P.map(function (p) { return Math.abs(p.bal); }).concat([1])), mid = lw + bw / 2;
			out += '<line class="xs-axis" x1="' + mid + '" x2="' + mid + '" y1="2" y2="' + (H - 2) + '"/>';
			P.forEach(function (p, i) {
				var y = top + i * rowH, w = (bw / 2 - 4) * Math.abs(p.bal) / mb, pos = p.bal >= 0, dim = focusP && focusP !== p.id ? " is-dim" : "";
				out += '<g class="xs-crow' + dim + '" data-focus="' + p.id + '"><text class="xs-cl" x="' + (lw - 8) + '" y="' + (y + 20) + '" text-anchor="end">' + esc(p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name) + "</text>"
					+ '<rect class="' + (pos ? "xs-gpos" : "xs-gneg") + '" x="' + (pos ? mid : mid - w).toFixed(1) + '" y="' + (y + 6) + '" width="' + Math.max(w, p.bal ? 1.5 : 0).toFixed(1) + '" height="20" rx="3"><title>' + esc(p.name + (pos ? " gets back " : " owes ") + money(Math.abs(p.bal))) + "</title></rect>"
					+ '<text class="xs-cv ' + (p.bal > 0 ? "is-pos" : p.bal < 0 ? "is-neg" : "") + '" x="' + (W - 4) + '" y="' + (y + 21) + '" text-anchor="end">' + (p.bal ? esc(money(p.bal, { plus: true })) : "even") + "</text></g>";
			});
			$("xs-legend").innerHTML = '<span><i class="xs-gpos-i"></i>Gets money back</span><span><i class="xs-gneg-i"></i>Owes money</span>';
		}
		box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + (chartMode === "bars" ? "Paid versus share per person" : "Balance per person") + '">' + out + "</svg>";
	}
	$("xs-cm").addEventListener("click", function (e) { var b = e.target.closest("button[data-c]"); if (b) { chartMode = b.dataset.c; drawChart(); } });
	$("xs-chart").addEventListener("click", function (e) { var g = e.target.closest("[data-focus]"); if (g) { focusP = focusP === g.dataset.focus ? "" : g.dataset.focus; renderResults(); } });

	/* per-person table */
	function drawTable() {
		var tb = $("xs-ptable");
		if (!res.people.length) { tb.innerHTML = ""; return; }
		var h = "<thead><tr><th>Person</th><th>Nights</th><th>Paid</th><th>Share</th><th>Balance</th></tr></thead><tbody>";
		res.people.forEach(function (p) {
			var open = openPerson === p.id, adj = p.sent - p.recv;
			h += '<tr class="xs-prow2' + (open ? " is-open" : "") + '"><td><button type="button" class="xs-link xs-pbtn" data-pp="' + p.id + '" aria-expanded="' + open + '" style="--pc:' + pcol(p.id) + '"><i aria-hidden="true"></i>' + esc(p.name) + "</button></td><td>" + p.n + "</td><td>" + esc(money(p.paid)) + "</td><td>" + esc(money(p.owed)) + '</td><td class="' + (p.bal > 0 ? "tu-pos" : p.bal < 0 ? "tu-neg" : "") + '"><b>' + (p.bal ? esc(money(p.bal, { plus: true })) : "even") + "</b>" + (adj ? '<small class="xs-adj">incl. payments ' + esc(money(adj, { plus: true })) + "</small>" : "") + "</td></tr>";
			if (open) {
				var rows = trip.exps.map(function (e, i) { var r = res.exps[i]; return r.err || r.alloc[p.id] == null ? "" : "<li><span>" + catOf(e.cat)[2] + " " + esc(e.what || "Expense " + (i + 1)) + (e.payer === p.id ? ' <em>(paid ' + esc(money(r.base)) + ")</em>" : "") + "</span><b>" + esc(money(r.alloc[p.id])) + "</b></li>"; }).join("");
				h += '<tr class="xs-pdet"><td colspan="5"><ul>' + (rows || "<li>Not part of any expense.</li>") + "</ul></td></tr>";
			}
		});
		tb.innerHTML = h + "</tbody>";
	}
	$("xs-ptable").addEventListener("click", function (e) { var b = e.target.closest("[data-pp]"); if (b) { openPerson = openPerson === b.dataset.pp ? "" : b.dataset.pp; drawTable(); } });

	/* payments already made */
	function drawPays() {
		var box = $("xs-pays"), err = res.payErr || [];
		box.innerHTML = trip.pays.length ? trip.pays.map(function (p) {
			return '<div class="xs-pay' + (err.indexOf(p.id) >= 0 ? " is-bad" : "") + '" data-id="' + p.id + '"><select class="tu-select" data-pf="from" aria-label="From">' + personOpts(p.from) + '</select><span>paid</span><select class="tu-select" data-pf="to" aria-label="To">' + personOpts(p.to) + '</select>'
				+ '<input class="tu-input" data-pf="amt" type="text" inputmode="decimal" value="' + esc(p.amt) + '" aria-label="Amount"><select class="tu-select xs-paycur" data-pf="cur" aria-label="Currency">' + S.CURRENCIES.map(function (c) { return '<option' + (c[0] === p.cur ? " selected" : "") + ">" + c[0] + "</option>"; }).join("") + '</select><button type="button" class="xs-del" data-pdel="1" aria-label="Delete payment">×</button></div>';
		}).join("") : '<p class="tu-note" style="margin-top:0;">None yet. "Mark paid" adds one here.</p>';
	}
	$("xs-addpay").addEventListener("click", function () {
		if (trip.people.length < 2) { toast("Add at least two people"); return; }
		trip.pays.push({ id: S.uid(), from: trip.people[0].id, to: trip.people[1].id, amt: "", cur: trip.cur });
		trip = S.normalize(trip); save(); drawPays(); var l = $("xs-pays").querySelectorAll('[data-pf="amt"]'); if (l.length) l[l.length - 1].focus();
	});
	function payOf(el) { var r = el.closest(".xs-pay"); return r ? byId(trip.pays, r.dataset.id) : null; }
	$("xs-pays").addEventListener("input", function (e) { var p = payOf(e.target); if (p && e.target.dataset.pf === "amt") { p.amt = e.target.value; save(); res = S.compute(trip); var keep = document.activeElement; renderResultsSoft(); if (keep) keep.focus(); } });
	$("xs-pays").addEventListener("change", function (e) {
		var p = payOf(e.target), f = e.target.dataset.pf; if (!p || !f || f === "amt") return; p[f] = e.target.value;
		if (p.from === p.to) { toast("Choose two different people"); drawPays(); return; } changed(); renderRates();
	});
	$("xs-pays").addEventListener("click", function (e) { var b = e.target.closest("[data-pdel]"); if (!b) return; var p = payOf(b); trip.pays = trip.pays.filter(function (x) { return x !== p; }); changed(); });
	function renderResultsSoft() { var f = drawPays; drawPays = function () {}; renderResults(); drawPays = f; }

	/* two columns once the tool itself is wide enough; charts follow the width */
	var lastW = 0;
	function onWidth() {
		var w = root.clientWidth; root.classList.toggle("xs-two", w >= 900);
		if (res && Math.abs(w - lastW) > 4) { lastW = w; drawFlow(); drawChart(); }
	}
	if (window.ResizeObserver) new ResizeObserver(onWidth).observe(root);
	window.addEventListener("resize", onWidth);
	/* ---------- start ---------- */
	function fromLink() {
		var q = new URLSearchParams(location.search), s = q.get("s"); if (!s) return Promise.resolve();
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
		return decodeLink(s).then(function (t) {
			if (!t) { setTimeout(function () { toast("That share link could not be read"); }, 300); return; }
			var same = store.order.filter(function (id) { return JSON.stringify(S.pack(store.trips[id])) === JSON.stringify(S.pack(t)); })[0];
			if (same) { store.cur = same; trip = S.normalize(store.trips[same]); save(); toast("Opened “" + (t.name || "trip") + "”"); }
			else { addTrip(t); toast("Shared trip added: " + (t.name || "Untitled trip")); }
		});
	}
	load();
	fromLink().then(function () {
		if (!trip) addTrip(S.example());
		root.classList.toggle("xs-two", root.clientWidth >= 900); lastW = root.clientWidth;
		res = S.compute(trip); renderTop(); renderPeople(); renderExps(); renderResults();
		window.MESSplitDebug = { trip: function () { return trip; }, res: function () { return res; }, set: function (t) { trip = S.normalize(t); changed(true); } };
	});
})();
