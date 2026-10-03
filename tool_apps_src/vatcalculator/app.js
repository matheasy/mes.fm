/* MES VAT Calculator 2.0 -- mes.fm/vatcalculator (UI; the maths + rate table are in lib.js, global `VC`)
 * Three-way net / VAT / gross for one amount (+ find the rate), an itemised invoice grouped by rate, country rate picker, rounding,
 * compare-two-rates, shareable query-string links (?mode=gross&gross=120&rate=20&c=DE) and the old 2013 /vatcalculator/s/<id> links
 * (stored {tax, value, rate} in Redis; still read through /api/share?calc=vat&id=<id>).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-vatcalculator:v1";
	var Q = VC.Q;
	var DEF = { view: "single", mode: "net", a: "", a2: "", c: "", g: "", cur: "", r: "", rd: "cent", how: "rate", cmp: "", items: [] };
	var DEFREG = { US: "CA", CA: "ON" };
	var LOC = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
	var st = {}, fmtCache = {}, ZERO_LABEL = "exempt / zero-rated / reverse charge";
	var lastText = "", lastSentence = "", lastCsv = "", lastInvText = "";

	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function dec() { return st.cur ? VC.currencyDigits(st.cur) : 2; }
	function step() { return VC.stepFor(st.rd, dec()); }
	function fmt(a) {
		var k = LOC + "|" + st.cur + "|" + st.rd;
		return (fmtCache[k] || (fmtCache[k] = VC.formatter(LOC, st.cur, st.rd)))(a);
	}
	function pct(rate) { return VC.trimmed(VC.mul(rate, Q(100)), 0, 4) + "%"; }
	function nk(s) { var q = VC.rateFrom(s); return q ? VC.trimmed(VC.mul(q, Q(100)), 0, 4) : ""; }
	function plain(a) { return VC.fixed(a, st.rd === "none" ? 6 : dec()); }   // locale-neutral digits for CSV
	function curCountry() { return VC.country(st.c); }
	function curRegion() { return VC.region(curCountry(), st.g); }

	/* ------------------------------------------------------------ rate options */
	function rateList() {   // [{r: "20", label}] for the current country / region, standard first, then 0
		var c = curCountry(), reg = curRegion(), out = [], seen = {};
		if (!c) [5, 10, 15, 20, 25].forEach(function (r) { seen[String(r)] = 1; out.push({ r: String(r), label: "" }); });
		VC.chipsFor(c, reg).forEach(function (x) { var k = nk(String(x.r)); if (!seen[k]) { seen[k] = 1; out.push({ r: k, label: x.label }); } });
		if (!seen["0"]) out.push({ r: "0", label: "Exempt / zero-rated" });
		return out;
	}
	function rateLabel(item) { return item.r + "%" + (item.label ? " " + item.label : ""); }

	/* ------------------------------------------------------------ controls */
	function buildCountry() {
		var h = '<option value="">Custom rate (any country)</option>';
		VC.GROUPS.forEach(function (g) {
			var list = VC.COUNTRIES.filter(function (c) { return c.group === g[0]; });
			if (!list.length) return;
			h += '<optgroup label="' + g[1] + '">' + list.map(function (c) {
				var s = c.regions ? "by " + (c.code === "US" ? "state" : "province") : c.std == null ? "see note" : VC.trimmed(VC.mul(VC.rateFrom(c.std), Q(100)), 0, 4) + "%";
				return '<option value="' + c.code + '">' + c.flag + " " + esc(c.name) + " — " + s + "</option>";
			}).join("") + "</optgroup>";
		});
		$("vc-country").innerHTML = h;
		var cur = {}; VC.COUNTRIES.forEach(function (c) { cur[c.cur] = 1; });
		["USD", "EUR", "GBP", "CAD", "AUD"].forEach(function (k) { cur[k] = 1; });
		var codes = Object.keys(cur).sort();
		var names = {};
		try { var dn = new Intl.DisplayNames([LOC], { type: "currency" }); codes.forEach(function (k) { names[k] = dn.of(k); }); } catch (e) {}
		$("vc-cur").innerHTML = '<option value="">No symbol</option>' + codes.map(function (k) { return '<option value="' + k + '">' + k + (names[k] && names[k] !== k ? " – " + esc(names[k]) : "") + "</option>"; }).join("");
		$("vc-round").innerHTML = VC.ROUNDING.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("");
		$("vc-examples").innerHTML = [["100 + VAT", { mode: "net", a: "100" }], ["120 incl. VAT", { mode: "gross", a: "120" }], ["VAT of 20", { mode: "vat", a: "20" }], ["100 → 120", { mode: "rate", a: "100", a2: "120" }]]
			.map(function (e, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + e[0] + "</button>"; }).join("");
	}
	function writeControls() {
		var c = curCountry(), reg = curRegion(), tax = c ? c.tax.replace(/ \(.*/, "") : "VAT";
		$("vc-country").value = st.c; $("vc-cur").value = st.cur; $("vc-round").value = st.rd; $("vc-how").value = st.how;
		$("vc-rate").value = st.r; $("vc-a").value = st.a; $("vc-a2").value = st.a2; $("vc-cmp").value = st.cmp;
		var rw = $("vc-region-wrap");
		rw.hidden = !(c && c.regions);
		if (c && c.regions) {
			$("vc-region-label").textContent = c.regionLabel;
			$("vc-region").innerHTML = c.regions.map(function (r) {
				return '<option value="' + r.code + '">' + esc(r.name) + " — " + VC.trimmed(VC.mul(VC.rateFrom(r.rate), Q(100)), 0, 4) + "%</option>";
			}).join("");
			$("vc-region").value = st.g;
		}
		[].forEach.call($("vc-view").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === st.view)); });
		[].forEach.call($("vc-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === st.mode)); });
		var ml = { net: "Net price (before VAT)", gross: "Gross price (with VAT)", vat: "VAT amount", rate: "Net price (before VAT)" };
		$("vc-a-label").textContent = ml[st.mode];
		$("vc-a2-wrap").hidden = st.mode !== "rate";
		$("vc-single").hidden = st.view !== "single"; $("vc-items").hidden = st.view !== "items";
		$("vc-how-wrap").hidden = st.view !== "items";
		$("vc-ratebox").hidden = st.view === "single" && st.mode === "rate";
		$("vc-rate-label").textContent = (tax === "Sales tax" ? "Sales tax" : tax.indexOf("GST") === 0 ? "GST" : tax === "Consumption tax" ? "Tax" : "VAT") + " rate";
		if (st.view === "items") $("vc-rate-label").textContent = "Default rate";
		var tags = document.querySelectorAll("#vc .vc-cur-tag");
		for (var i = 0; i < tags.length; i++) tags[i].textContent = st.cur || "";
		// chips
		var list = rateList(), cur = nk(st.r);
		$("vc-chips").innerHTML = list.map(function (x) {
			return '<button type="button" class="tu-chip" data-r="' + x.r + '" aria-pressed="' + (cur === x.r) + '">' + esc(rateLabel(x)) + "</button>";
		}).join("");
		$("vc-chips-label").textContent = c ? "Rates in " + c.name + (reg ? " — " + reg.name : "") : "Common rates";
		var note = c ? c.note : "";
		if (c && c.regions && reg) note = reg.note + ". " + c.note;
		$("vc-cnote").innerHTML = esc(note);
		$("vc-cnote").style.display = note ? "" : "none";
		$("vc-verified").innerHTML = "Rates last verified " + verifiedDate() + " &middot; <a href=\"#vc-dir-card\">all countries &amp; sources</a>";
		$("vc-cmp-chips").innerHTML = list.map(function (x) { return '<button type="button" class="tu-chip" data-r="' + x.r + '">' + esc(x.r + "%") + "</button>"; }).join("");
	}
	function verifiedDate() {
		var p = VC.RATES_VERIFIED.split("-"), m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		return +p[2] + " " + m[+p[1] - 1] + " " + p[0];
	}

	/* ------------------------------------------------------------ the single-amount calculation */
	function rateMatches(rate) {   // which countries use exactly this rate as their standard rate
		var k = VC.trimmed(VC.mul(rate, Q(100)), 0, 4), out = [];
		VC.COUNTRIES.forEach(function (c) { if (c.std != null && nk(String(c.std)) === k) out.push(c.name); });
		return out;
	}
	function renderSingle() {
		var out = $("vc-out"), empty = $("vc-empty"), mode = st.mode, rate = VC.rateFrom(st.r), a = VC.parse(st.a), a2 = VC.parse(st.a2), res = null, ok = false, steps = [];
		var stp = step();
		if (mode === "rate") {
			if (a && a2) {
				var rt = VC.rateFromAmounts(a, a2);
				if (rt && rt.n >= 0n) { ok = true; rate = rt; res = { net: a, vat: VC.sub(a2, a), gross: a2 }; }
			}
		} else if (a && rate && rate.n >= 0n) {
			res = VC.calc(mode, a, rate, stp);
			ok = !!res;
		}
		empty.hidden = ok; out.hidden = !ok;
		if (!ok) {
			lastText = lastSentence = "";
			$("vc-empty-text").textContent = mode !== "rate" && !(rate && rate.n >= 0n) ? "Pick a country or type a rate above, then enter an amount \u2014 or try an example: " : "Type an amount above and the other figures appear instantly \u2014 or try an example: ";
			renderRef(null); renderCmp(null); return;
		}
		var rp = pct(rate), mult = VC.trimmed(VC.add(Q(1), rate), 0, 6), n = fmt(res.net), v = fmt(res.vat), g = fmt(res.gross);
		var hero = mode === "net" ? "gross" : mode === "rate" ? "rate" : "net";
		var tiles = [];
		if (mode === "rate") tiles.push(["VAT rate", rp, "of the net price", "rate", null]);
		tiles.push(["Net price", n, "before VAT", "net", res.net], ["VAT amount", v, "at " + rp, "vat", res.vat], ["Gross price", g, "including VAT", "gross", res.gross]);
		$("vc-hero").innerHTML = tiles.map(function (t) {
			return '<div class="tu-stat vc-tile' + (t[3] === hero ? " tu-stat--hero" : "") + '" tabindex="0" role="button" data-copy="' + esc(t[1]) + '" title="Click to copy ' + esc(t[1]) + '"><div class="tu-stat__label">' + t[0] + '</div><div class="tu-stat__value">' + esc(t[1]) + '</div><div class="tu-stat__sub">' + t[2] + "</div></div>";
		}).join("");
		var eff = VC.div(rate, VC.add(Q(1), rate));
		$("vc-eff").innerHTML = "VAT is <strong>" + VC.trimmed(VC.mul(eff, Q(100)), 0, 2) + "%</strong> of the gross price (rate &divide; (100 + rate)), while it is " + rp + " of the net price." + (mode === "rate" ? matchText(rate) : "");
		// steps with the person's own numbers
		var ex = (mode === "net" || mode === "gross" || mode === "vat") ? VC.calc(mode, a, rate, null) : null;
		var roundNote = ex && !VC.eq(ex.vat, res.vat) ? " (rounded)" : "";
		if (mode === "net") steps = [
			"VAT = net × rate = " + n + " × " + rp + " = <strong>" + v + "</strong>" + roundNote,
			"Gross = net + VAT = " + n + " + " + v + " = <strong>" + g + "</strong>",
			"In one step: gross = net × (1 + rate) = " + n + " × " + mult];
		else if (mode === "gross") steps = [
			"Net = gross ÷ (1 + rate) = " + g + " ÷ " + mult + " = <strong>" + n + "</strong>" + roundNote,
			"VAT = gross − net = " + g + " − " + n + " = <strong>" + v + "</strong>",
			"Check: " + n + " × " + rp + " ≈ " + v];
		else if (mode === "vat") steps = [
			"Net = VAT ÷ rate = " + v + " ÷ " + rp + " = <strong>" + n + "</strong>" + roundNote,
			"Gross = net + VAT = " + n + " + " + v + " = <strong>" + g + "</strong>"];
		else steps = [
			"VAT = gross − net = " + g + " − " + n + " = <strong>" + v + "</strong>",
			"Rate = VAT ÷ net = " + v + " ÷ " + n + " = <strong>" + rp + "</strong>"];
		$("vc-steps").innerHTML = steps.map(function (s) { return "<li>" + s + "</li>"; }).join("");
		var sent = mode === "net" ? "A net price of " + n + " plus " + rp + " VAT is " + g + " (VAT " + v + ")."
			: mode === "gross" ? "A price of " + g + " including " + rp + " VAT is " + n + " before VAT (VAT " + v + ")."
			: mode === "vat" ? "VAT of " + v + " at " + rp + " means a net price of " + n + " and a gross price of " + g + "."
			: "Going from " + n + " to " + g + " is a VAT rate of " + rp + " (VAT " + v + ").";
		lastSentence = sent;
		lastText = sent + "\nNet: " + n + "\nVAT (" + rp + "): " + v + "\nGross: " + g + "\n" + location.origin + "/vatcalculator" + shareQuery();
		$("vc-sentence").textContent = sent;
		renderRef(rate);
		renderCmp(rate, res.net);
	}
	function matchText(rate) {
		var m = rateMatches(rate);
		return m.length ? " That is the standard rate in " + esc(m.slice(0, 6).join(", ")) + (m.length > 6 ? " and " + (m.length - 6) + " more" : "") + "." : "";
	}

	function renderRef(rate) {
		var t = $("vc-ref");
		if (!rate) rate = VC.rateFrom(st.r);
		if (!rate || rate.n < 0n) { t.innerHTML = ""; $("vc-ref-note").textContent = "Enter a rate to see the table."; return; }
		var amts = ["10", "25", "50", "100", "250", "500", "1000", "5000"], stp = step(), rp = pct(rate);
		t.innerHTML = '<thead><tr><th>Amount</th><th>+ VAT (' + rp + ')</th><th>= with VAT</th><th>Without VAT</th><th>VAT inside</th></tr></thead><tbody>' +
			amts.map(function (s) {
				var x = VC.parse(s), up = VC.calc("net", x, rate, stp), dn = VC.calc("gross", x, rate, stp);
				return "<tr><td>" + fmt(x) + "</td><td>" + fmt(up.vat) + "</td><td>" + fmt(up.gross) + "</td><td>" + fmt(dn.net) + "</td><td>" + fmt(dn.vat) + "</td></tr>";
			}).join("") + "</tbody>";
		$("vc-ref-note").textContent = "“With VAT” adds " + rp + " to a net amount. “Without VAT” takes the VAT out of an amount that already includes it.";
		$("vc-ref-h").textContent = "Quick reference at " + rp;
	}

	function renderCmp(rate, net) {
		var rb = VC.rateFrom(st.cmp), box = $("vc-cmp-out");
		if (!rb || rb.n < 0n || !rate) { box.hidden = true; return; }
		var base = net || VC.parse(st.a) || Q(100), stp = step();
		if (st.mode !== "net" && !net) base = Q(100);
		var A = VC.calc("net", base, rate, stp), B = VC.calc("net", base, rb, stp), diff = VC.sub(B.gross, A.gross);
		var rel = VC.isZero(A.gross) ? "" : " (" + (diff.n < 0n ? "−" : "+") + VC.trimmed(VC.mul(VC.div(diff.n < 0n ? VC.neg(diff) : diff, A.gross), Q(100)), 0, 2) + "%)";
		$("vc-cmp-table").innerHTML = "<thead><tr><th></th><th>" + pct(rate) + "</th><th>" + pct(rb) + "</th><th>Difference</th></tr></thead><tbody>" +
			"<tr><td>Net price</td><td>" + fmt(A.net) + "</td><td>" + fmt(B.net) + "</td><td>–</td></tr>" +
			"<tr><td>VAT</td><td>" + fmt(A.vat) + "</td><td>" + fmt(B.vat) + "</td><td>" + fmt(VC.sub(B.vat, A.vat)) + "</td></tr>" +
			'<tr class="is-active"><td>Gross price</td><td>' + fmt(A.gross) + "</td><td>" + fmt(B.gross) + "</td><td>" + (diff.n > 0n ? "+" : "") + fmt(diff) + rel + "</td></tr></tbody>";
		box.hidden = false;
	}

	/* ------------------------------------------------------------ itemised invoice */
	function newLine(over) { var l = { d: "", q: "1", p: "", t: "net", r: st.r || "" }; for (var k in over) l[k] = over[k]; return l; }
	function lineOptions(l) {
		var list = rateList(), key = nk(l.r), has = false, h = "";
		list.forEach(function (x) { if (x.r === key) has = true; });
		h = list.map(function (x) { return '<option value="' + x.r + '">' + esc(x.r + "% " + (x.r === "0" ? ZERO_LABEL : x.label)) + "</option>"; }).join("");
		if (!has && key !== "") h += '<option value="' + key + '">' + esc(key + "% (custom)") + "</option>";
		h += '<option value="__other">Other rate…</option>';
		return { html: h, value: key === "" ? "__other" : key };
	}
	function buildLines() {
		var box = $("vc-lines");
		box.innerHTML = st.items.map(function (l, i) {
			var o = lineOptions(l);
			return '<div class="vc-line" data-i="' + i + '">' +
				'<div class="tu-field vc-f-desc"><label>Description</label><input class="tu-input" data-f="d" type="text" autocomplete="off" placeholder="Item or service" value="' + esc(l.d) + '"></div>' +
				'<div class="tu-field vc-f-qty"><label>Qty</label><input class="tu-input" data-f="q" type="text" inputmode="decimal" autocomplete="off" value="' + esc(l.q) + '"></div>' +
				'<div class="tu-field vc-f-price"><label>Unit price</label><input class="tu-input" data-f="p" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + esc(l.p) + '"></div>' +
				'<div class="tu-field vc-f-type"><label>Price is</label><select class="tu-select" data-f="t"><option value="net"' + (l.t === "net" ? " selected" : "") + '>excl. VAT</option><option value="gross"' + (l.t === "gross" ? " selected" : "") + '>incl. VAT</option></select></div>' +
				'<div class="tu-field vc-f-rate"><label>VAT rate</label><select class="tu-select" data-f="r">' + o.html + '</select><div class="tu-suffix vc-other" hidden><input class="tu-input" data-f="ro" type="text" inputmode="decimal" autocomplete="off" placeholder="rate"><span>%</span></div></div>' +
				'<div class="vc-f-out"><span class="vc-lineout"></span></div>' +
				'<button type="button" class="tu-btn tu-btn--ghost vc-del" data-del="' + i + '" aria-label="Remove line ' + (i + 1) + '">×</button></div>';
		}).join("");
		[].forEach.call(box.querySelectorAll(".vc-line"), function (row) {
			var l = st.items[+row.getAttribute("data-i")], sel = row.querySelector('select[data-f="r"]'), o = lineOptions(l);
			sel.value = o.value;
			if (o.value === "__other") { var ot = row.querySelector(".vc-other"); ot.hidden = false; ot.querySelector("input").value = l.r; }
		});
		renderItems();
	}
	function parsedLines() {
		var out = [];
		st.items.forEach(function (l, i) {
			var p = VC.parse(l.p), q = l.q === "" ? Q(1) : VC.parse(l.q), r = VC.rateFrom(l.r);
			if (p && q && r && r.n >= 0n) out.push({ i: i, amt: VC.mul(p, q), t: l.t, rate: r, d: l.d, q: q, p: p });
		});
		return out;
	}
	function renderItems() {
		var lines = parsedLines(), stp = step(), how = st.how;
		var rows = document.querySelectorAll("#vc-lines .vc-line"), per = {};
		var inv = lines.length ? VC.invoice(lines.map(function (x) { return { amt: x.amt, t: x.t, rate: x.rate }; }), how, stp) : null;
		if (inv) lines.forEach(function (x, j) { per[x.i] = inv.perLine[j]; });
		[].forEach.call(rows, function (row, i) {
			var o = row.querySelector(".vc-lineout"), l = st.items[i], x = per[i];
			if (!x) { o.innerHTML = ""; return; }
			var amt = VC.mul(VC.parse(l.p), l.q === "" ? Q(1) : VC.parse(l.q));
			o.innerHTML = how === "line" ? "net <b>" + fmt(x.net) + "</b><br>VAT <b>" + fmt(x.vat) + "</b><br>gross <b>" + fmt(x.gross) + "</b>" : "line <b>" + fmt(amt) + "</b><br>" + (l.t === "gross" ? "incl." : "excl.") + " VAT";
		});
		$("vc-inv-empty").hidden = !!inv; $("vc-inv").hidden = !inv;
		if (!inv) { lastCsv = lastInvText = ""; return; }
		var h = "<thead><tr><th>VAT rate</th><th>Net</th><th>VAT</th><th>Gross</th></tr></thead><tbody>";
		inv.groups.forEach(function (g) {
			var zero = VC.isZero(g.rate);
			h += "<tr><td>" + pct(g.rate) + (zero ? ' <span class="tu-note">(' + ZERO_LABEL + ")</span>" : "") + "</td><td>" + fmt(g.net) + "</td><td>" + fmt(g.vat) + "</td><td>" + fmt(g.gross) + "</td></tr>";
		});
		var T = inv.total;
		h += '<tr class="is-active"><td>Total</td><td>' + fmt(T.net) + "</td><td>" + fmt(T.vat) + "</td><td>" + fmt(T.gross) + "</td></tr></tbody>";
		$("vc-inv-table").innerHTML = h;
		// text + CSV
		var cur = st.cur || "", txt = "VAT invoice summary" + (cur ? " (" + cur + ")" : "") + "\n";
		lines.forEach(function (x) {
			var l = st.items[x.i];
			txt += "- " + (l.d || "Item " + (x.i + 1)) + ": " + VC.trimmed(x.q, 0, 4) + " × " + fmt(x.p) + (x.t === "gross" ? " incl." : " excl.") + " VAT @ " + pct(x.rate) + "\n";
		});
		txt += "\nVAT by rate:\n";
		inv.groups.forEach(function (g) { txt += pct(g.rate) + ": net " + fmt(g.net) + ", VAT " + fmt(g.vat) + ", gross " + fmt(g.gross) + "\n"; });
		txt += "Total: net " + fmt(T.net) + ", VAT " + fmt(T.vat) + ", gross " + fmt(T.gross) + "\n" + location.origin + "/vatcalculator" + shareQuery();
		lastInvText = txt;
		function cs(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
		var csv = ["Description,Quantity,Unit price,Price is,VAT rate %,Line amount"];
		lines.forEach(function (x) {
			var l = st.items[x.i];
			csv.push([cs(l.d), VC.trimmed(x.q, 0, 6), VC.trimmed(x.p, 0, 6), x.t === "gross" ? "incl. VAT" : "excl. VAT", VC.trimmed(VC.mul(x.rate, Q(100)), 0, 4), plain(x.amt)].join(","));
		});
		csv.push("", "VAT rate %,Net,VAT,Gross");
		inv.groups.forEach(function (g) { csv.push([VC.trimmed(VC.mul(g.rate, Q(100)), 0, 4), plain(g.net), plain(g.vat), plain(g.gross)].join(",")); });
		csv.push("Total," + [plain(T.net), plain(T.vat), plain(T.gross)].join(","));
		lastCsv = csv.join("\n");
	}

	/* ------------------------------------------------------------ rate directory */
	function buildDir() {
		var h = "<thead><tr><th>Country</th><th>Tax</th><th>Standard</th><th>Other rates</th></tr></thead><tbody>";
		function p(x) { return VC.trimmed(VC.mul(VC.rateFrom(x), Q(100)), 0, 4) + "%"; }
		VC.COUNTRIES.forEach(function (c) {
			var std, other;
			if (c.regions) {
				var rs = c.regions.map(function (r) { return r.rate; }), mn = Math.min.apply(null, rs), mx = Math.max.apply(null, rs);
				std = p(mn) + " – " + p(mx); other = c.code === "US" ? "state base rates; local taxes extra" : "combined, by province";
			} else { std = c.std == null ? "n/a (see note)" : p(c.std); other = c.red.map(function (x) { return p(x[0]); }).join(", ") || "–"; }
			h += '<tr data-c="' + c.code + '"><td>' + c.flag + " " + esc(c.name) + "</td><td>" + esc(c.tax) + "</td><td>" + std + "</td><td>" + other + "</td></tr>";
		});
		$("vc-dir").innerHTML = h + "</tbody>";
		$("vc-dir-n").textContent = VC.COUNTRIES.length;
		$("vc-dir-date").textContent = verifiedDate();
		$("vc-sources").innerHTML = VC.SOURCES.map(function (s) { return '<a href="' + s[1] + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a>"; }).join("; ");
	}

	/* ------------------------------------------------------------ state <-> url / storage */
	function itemsParam() {
		function e(s) { return encodeURIComponent(s).replace(/~/g, "%7E"); }
		return st.items.filter(function (l) { return l.p !== "" || l.d !== ""; }).map(function (l) { return [e(l.d), e(l.q), e(l.p), l.t, e(l.r)].join("~"); }).join("|");
	}
	function shareQuery() {
		var p = [];
		function add(k, v) { if (v !== "" && v != null) p.push(k + "=" + encodeURIComponent(v)); }
		if (st.view === "items") {
			add("view", "items"); add("items", itemsParam()); if (st.how !== "rate") add("how", st.how);
		} else {
			add("mode", st.mode);
			if (st.mode === "rate") { add("net", st.a); add("gross", st.a2); } else add(st.mode, st.a);
		}
		if (!(st.view === "single" && st.mode === "rate")) add("rate", st.r);
		add("c", st.c); if (st.g) add("g", st.g);
		var c = curCountry(); if (st.cur !== (c ? c.cur : "")) add("cur", st.cur || "none");
		if (st.rd !== "cent") add("round", st.rd);
		return p.length ? "?" + p.join("&") : "";
	}
	function parseItems(s) {
		return String(s || "").split("|").map(function (row) {
			var f = row.split("~"); if (f.length < 5) return null;
			function d(x) { try { return decodeURIComponent(x); } catch (e) { return x; } }
			return { d: d(f[0]), q: d(f[1]), p: d(f[2]), t: f[3] === "gross" ? "gross" : "net", r: d(f[4]) };
		}).filter(Boolean).slice(0, 200);
	}
	function fromQuery(q) {
		var any = false, o = {};
		["mode", "net", "gross", "vat", "rate", "c", "g", "cur", "round", "how", "view", "items"].forEach(function (k) { if (q.has(k)) any = true; });
		if (!any) return null;
		var mode = q.get("mode");
		if (!/^(net|gross|vat|rate)$/.test(mode || "")) mode = q.has("gross") && !q.has("net") ? "gross" : q.has("vat") && !q.has("net") ? "vat" : q.has("net") && q.has("gross") ? "rate" : "net";
		o.mode = mode;
		if (mode === "rate") { o.a = q.get("net") || ""; o.a2 = q.get("gross") || ""; } else o.a = q.get(mode) || "";
		o.c = q.get("c") || ""; o.g = q.get("g") || "";
		if (q.has("rate")) o.r = q.get("rate");
		if (q.has("cur")) o.cur = q.get("cur") === "none" ? "" : q.get("cur").toUpperCase();
		if (/^(cent|none|unit|nickel)$/.test(q.get("round") || "")) o.rd = q.get("round");
		if (q.get("how") === "line") o.how = "line";
		if (q.get("view") === "items" || q.has("items")) { o.view = "items"; o.items = parseItems(q.get("items")); }
		return o;
	}
	function normalise() {
		if (!/^(single|items)$/.test(st.view)) st.view = "single";
		if (!/^(net|gross|vat|rate)$/.test(st.mode)) st.mode = "net";
		if (!/^(cent|none|unit|nickel)$/.test(st.rd)) st.rd = "cent";
		if (st.how !== "line") st.how = "rate";
		if (st.c && !VC.country(st.c)) st.c = "";
		var c = curCountry();
		if (c && c.regions) { if (!VC.region(c, st.g)) st.g = DEFREG[c.code] || c.regions[0].code; } else st.g = "";
		if (st.cur && !/^[A-Z]{3}$/.test(st.cur)) st.cur = "";
		if (!Array.isArray(st.items)) st.items = [];
		if (st.cur && VC.currencyDigits(st.cur) == null) st.cur = "";
	}
	function sync() {
		try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
		try { history.replaceState(null, "", location.pathname + shareQuery()); } catch (e) {}
	}
	function renderAll() {
		writeControls();
		if (st.view === "items") { if (!st.items.length) { st.items = [newLine(), newLine()]; } buildLines(); } else renderSingle();
		// the other view's text is only needed when it is shown; the reference/compare cards belong to the single view
	}
	function update() { if (st.view === "single") renderSingle(); else renderItems(); sync(); }

	function setCountry(code, keepRate) {
		var old = st.r;
		st.c = code; st.g = "";
		var c = VC.country(code);
		if (c) {
			if (c.regions) st.g = DEFREG[c.code] || c.regions[0].code;
			st.cur = c.cur;
			if (!keepRate) { var d = VC.defaultRate(c, curRegion()); st.r = d == null ? "" : String(d); }
		}
		st.items.forEach(function (l) { if (nk(l.r) === nk(old)) l.r = st.r; });
	}

	/* ------------------------------------------------------------ helpers: toast, copy */
	function toast(msg) {
		var t = $("vc-toast");
		if (!t) { t = document.createElement("div"); t.id = "vc-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1500);
	}
	function copy(text, msg) {
		function fallback() {
			var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
			document.body.appendChild(ta); ta.select();
			try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); }
			document.body.removeChild(ta);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback); else fallback();
	}
	function notice(html) { var n = $("vc-notice"); n.innerHTML = html || ""; n.hidden = !html; }

	/* ------------------------------------------------------------ old /vatcalculator/s/<id> links */
	// The 2013 page stored {tax: true|false (true = "add tax", i.e. the value is the NET price; false = "remove tax", the value is the GROSS price), value, rate}.
	function fromOldShare(d) {
		if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
		if (!d || d.value == null || d.rate == null) return null;
		var remove = d.tax === false || d.tax === "false" || d.tax === 0 || d.tax === "0";
		var o = { mode: remove ? "gross" : "net", a: String(d.value), r: String(d.rate), c: "", g: "", cur: "USD", view: "single" };
		return VC.parse(o.a) && VC.rateFrom(o.r) ? o : null;
	}
	function loadOld(id) {
		notice("Loading the calculation from your shared link…");
		var f = window.fetch ? window.fetch("/api/share?calc=vat&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) {
			var o = fromOldShare(d);
			if (!o) throw new Error("bad data");
			for (var k in o) st[k] = o[k];
			normalise(); renderAll(); sync(); notice("");
			history.replaceState(null, "", "/vatcalculator" + shareQuery());
			toast("Shared calculation loaded");
		}).catch(function () {
			notice("That old shared link could not be loaded (it may have expired). Here is a fresh calculator &mdash; type your amount and rate above.");
		});
	}

	/* ------------------------------------------------------------ init */
	function detectCountry() {
		var m = /-([A-Za-z]{2})(?:$|-)/.exec(LOC), code = m ? m[1].toUpperCase() : "";
		return VC.country(code) ? code : "GB";
	}
	function init() {
		for (var k in DEF) st[k] = DEF[k];
		st.items = [];
		buildCountry(); buildDir();
		var saved = null;
		try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
		var q = new URLSearchParams(location.search), fromUrl = fromQuery(q);
		if (fromUrl) {
			for (var key in fromUrl) st[key] = fromUrl[key];
			var cc = VC.country(st.c);
			if (cc && fromUrl.cur === undefined) st.cur = cc.cur;
			if (!cc && fromUrl.cur === undefined) st.cur = "";
		} else {
			if (saved && typeof saved === "object") for (var s in saved) if (s in DEF) st[s] = saved[s];
			if (!saved) { setCountry(detectCountry(), false); }
		}
		normalise();
		if (fromUrl && fromUrl.r === undefined) { var dr = VC.defaultRate(curCountry(), curRegion()); st.r = dr == null ? "" : String(dr); }
		var m = location.pathname.match(/^\/vatcalculator\/s\/([A-Za-z0-9]+)\/?$/);
		renderAll();
		if (m && !fromUrl) loadOld(m[1]);

		var ids = ["vc-rate", "vc-a", "vc-a2", "vc-cmp"], keys = { "vc-rate": "r", "vc-a": "a", "vc-a2": "a2", "vc-cmp": "cmp" };
		ids.forEach(function (id) {
			$(id).addEventListener("input", function () {
				st[keys[id]] = this.value;
				if (id === "vc-rate") {
					var cur = nk(st.r); [].forEach.call($("vc-chips").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-r") === cur)); });
				}
				update();
			});
		});
		$("vc-country").addEventListener("change", function () { setCountry(this.value, false); renderAll(); sync(); });
		$("vc-region").addEventListener("change", function () {
			st.g = this.value; var reg = curRegion(), old = st.r; st.r = reg ? String(reg.rate) : st.r;
			st.items.forEach(function (l) { if (nk(l.r) === nk(old)) l.r = st.r; });
			renderAll(); sync();
		});
		$("vc-cur").addEventListener("change", function () { st.cur = this.value; renderAll(); sync(); });
		$("vc-round").addEventListener("change", function () { st.rd = this.value; update(); });
		$("vc-how").addEventListener("change", function () { st.how = this.value; if (st.view === "items") buildLines(); sync(); });
		$("vc-view").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.view = b.getAttribute("data-view"); renderAll(); sync(); } });
		$("vc-mode").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var m2 = b.getAttribute("data-mode");
			if (m2 === "rate" && st.mode !== "rate" && st.a2 === "") { var A = VC.parse(st.a), r = VC.rateFrom(st.r); if (A && r && st.mode === "net") st.a2 = VC.fixed(VC.calc("net", A, r, step()).gross, dec()); }
			st.mode = m2; renderAll(); sync();
		});
		$("vc-chips").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			st.r = b.getAttribute("data-r"); writeControls(); update();
		});
		$("vc-cmp-chips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.cmp = b.getAttribute("data-r"); $("vc-cmp").value = st.cmp; update(); } });
		$("vc-examples").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var ex = [{ mode: "net", a: "100", a2: "" }, { mode: "gross", a: "120", a2: "" }, { mode: "vat", a: "20", a2: "" }, { mode: "rate", a: "100", a2: "120" }][+b.getAttribute("data-i")];
			for (var k in ex) st[k] = ex[k];
			if (!VC.rateFrom(st.r) && ex.mode !== "rate") st.r = "20";
			renderAll(); sync();
		});
		$("vc-hero").addEventListener("click", function (e) { var t = e.target.closest(".vc-tile"); if (t) copy(t.getAttribute("data-copy"), "Copied " + t.getAttribute("data-copy")); });
		$("vc-hero").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { var t = e.target.closest(".vc-tile"); if (t) { e.preventDefault(); copy(t.getAttribute("data-copy"), "Copied " + t.getAttribute("data-copy")); } } });
		$("vc-link").addEventListener("click", function () { copy(location.origin + "/vatcalculator" + shareQuery(), "Link copied"); });
		$("vc-inv-link").addEventListener("click", function () { copy(location.origin + "/vatcalculator" + shareQuery(), "Link copied"); });
		$("vc-copy").addEventListener("click", function () { copy(lastText, "Result copied"); });
		$("vc-sent").addEventListener("click", function () { copy(lastSentence, "Sentence copied"); });
		$("vc-inv-text").addEventListener("click", function () { copy(lastInvText, "Summary copied"); });
		$("vc-inv-csv").addEventListener("click", function () { copy(lastCsv, "CSV copied"); });
		[].forEach.call(document.querySelectorAll("#vc .vc-print"), function (b) { b.addEventListener("click", function () { window.print(); }); });
		$("vc-reset").addEventListener("click", function () { st.a = st.a2 = st.cmp = ""; renderAll(); sync(); });
		$("vc-dir").addEventListener("click", function (e) {
			var tr = e.target.closest("tr[data-c]"); if (!tr) return;
			setCountry(tr.getAttribute("data-c"), false); renderAll(); sync();
			window.scrollTo({ top: $("vc").getBoundingClientRect().top + window.pageYOffset - 80, behavior: "smooth" });
		});
		// itemised lines
		var box = $("vc-lines");
		box.addEventListener("input", function (e) {
			var row = e.target.closest(".vc-line"), f = e.target.getAttribute("data-f"); if (!row || !f) return;
			var l = st.items[+row.getAttribute("data-i")];
			if (f === "ro") { l.r = e.target.value; } else if (f !== "r") l[f] = e.target.value;
			renderItems(); sync();
		});
		box.addEventListener("change", function (e) {
			var row = e.target.closest(".vc-line"), f = e.target.getAttribute("data-f"); if (!row || !f) return;
			var l = st.items[+row.getAttribute("data-i")];
			if (f === "r") {
				var other = row.querySelector(".vc-other");
				if (e.target.value === "__other") { other.hidden = false; other.querySelector("input").value = l.r; other.querySelector("input").focus(); }
				else { l.r = e.target.value; other.hidden = true; }
			} else if (f === "t") l.t = e.target.value;
			renderItems(); sync();
		});
		box.addEventListener("click", function (e) {
			var b = e.target.closest("[data-del]"); if (!b) return;
			st.items.splice(+b.getAttribute("data-del"), 1); if (!st.items.length) st.items.push(newLine());
			buildLines(); sync();
		});
		$("vc-addline").addEventListener("click", function () {
			st.items.push(newLine()); buildLines(); sync();
			var rows = box.querySelectorAll(".vc-line"), last = rows[rows.length - 1]; if (last) last.querySelector("input").focus();
		});
		$("vc-clearlines").addEventListener("click", function () { st.items = [newLine(), newLine()]; buildLines(); sync(); });
	}
	init();
})();
