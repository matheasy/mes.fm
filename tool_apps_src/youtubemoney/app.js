/* MES YouTube Money Calculator -- mes.fm/youtubemoney
 * Estimates ad revenue from views using creator RPM (what the creator earns per 1,000 views, after YouTube's cut):
 * topic table x audience-location factor, long-form vs Shorts, or the person's own RPM. Two modes: views -> earnings,
 * and goal ($) -> views needed. State lives in the query string so a result can be shared; old /youtubemoney/s/<id>
 * links (stored in Redis by the 2016 version) are still read through /api/share.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-youtubemoney:v1";
	var DAYS = 365.25 / 12;

	// [id, name, low, typical, high] -- creator RPM in USD per 1,000 views, long-form, mostly high-income audience
	var NICHES = [
		["mix", "Not sure / typical channel", 1.0, 2.5, 5.0],
		["entertainment", "Entertainment & vlogs", 1.0, 2.0, 3.5],
		["gaming", "Gaming", 0.8, 1.6, 3.0],
		["music", "Music", 0.5, 1.2, 2.5],
		["comedy", "Comedy & memes", 1.0, 2.0, 3.5],
		["kids", "Kids & family", 0.5, 1.2, 2.5],
		["sports", "Sports", 1.5, 2.8, 4.5],
		["news", "News & politics", 2.0, 3.5, 6.0],
		["beauty", "Beauty & fashion", 2.0, 3.5, 6.0],
		["food", "Food & cooking", 2.0, 3.5, 6.0],
		["travel", "Travel & lifestyle", 2.0, 3.5, 6.0],
		["education", "Education, science & math", 3.0, 4.5, 8.0],
		["health", "Health & fitness", 3.0, 5.0, 9.0],
		["tech", "Tech & reviews", 4.0, 6.0, 12.0],
		["business", "Business & marketing", 6.0, 10.0, 18.0],
		["finance", "Personal finance & investing", 8.0, 14.0, 30.0]
	];
	var SHORTS = [0.01, 0.035, 0.07];
	var GEO_NAMES = { "1": "high-income countries", "0.7": "a mix of regions", "0.35": "Asia, Africa and Latin America" };
	var EXAMPLES = [
		{ label: "10,000 views", s: { v: "10000", f: "long", per: "video" } },
		{ label: "100,000 views", s: { v: "100000", f: "long", per: "video" } },
		{ label: "1M views / month", s: { v: "1000000", f: "long", per: "month" } },
		{ label: "5M Shorts views / month", s: { v: "5000000", f: "shorts", per: "month" } }
	];

	var DEF = { mode: "earn", f: "long", v: "", per: "video", vpm: "4", n: "mix", geo: "1", rpm: "", g: "", gp: "month", gr: "0" };
	var st = {};

	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(s) {
		s = String(s == null ? "" : s).trim().toLowerCase().replace(/[,\s$]/g, "");
		var m = /^(\d*\.?\d+)([kmb]?)$/.exec(s);
		if (!m) return NaN;
		return parseFloat(m[1]) * { "": 1, k: 1e3, m: 1e6, b: 1e9 }[m[2]];
	}
	function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }
	function money(n) {
		if (!isFinite(n)) return "—";
		if (n < 100) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return "$" + Math.round(n).toLocaleString("en-US");
	}
	function views(n) { return n >= 100 ? fmtInt(n) : n >= 1 ? String(Math.round(n * 10) / 10) : "< 1"; }
	function nicheOf(id) { for (var i = 0; i < NICHES.length; i++) if (NICHES[i][0] === id) return NICHES[i]; return NICHES[0]; }

	function rpmRange() {
		var c = num(st.rpm);
		if (st.rpm !== "" && isFinite(c) && c > 0) return { lo: c, mid: c, hi: c, custom: true };
		var geo = parseFloat(st.geo) || 1, b;
		if (st.f === "shorts") b = SHORTS; else { var n = nicheOf(st.n); b = [n[2], n[3], n[4]]; }
		return { lo: b[0] * geo, mid: b[1] * geo, hi: b[2] * geo, custom: false };
	}

	/* ---------- results ---------- */
	function periodsEarn(monthlyViews, perVideoViews, vpm) {
		var rows = [];
		if (perVideoViews != null) rows.push({ k: "Per video", v: perVideoViews });
		rows.push({ k: "Per day", v: monthlyViews / DAYS }, { k: "Per month", v: monthlyViews }, { k: "Per year", v: monthlyViews * 12 });
		return rows;
	}
	function render() {
		var r = rpmRange(), out = $("ym-out"), empty = $("ym-empty"), hero = $("ym-hero"), table = $("ym-table");
		var goal = st.mode === "goal", ok = false, rows = [], title, basis;
		cd = null;
		var tail = r.custom ? "your RPM of " + money(r.mid) + " per 1,000 views"
			: (st.f === "shorts" ? "Shorts" : esc(nicheOf(st.n)[1])) + " &middot; " + GEO_NAMES[st.geo] + ": " + money(r.lo) + "&ndash;" + money(r.hi) + " per 1,000 views (typical " + money(r.mid) + ")";

		if (!goal) {
			var v = num(st.v), vpm = Math.max(1, parseFloat(st.vpm) || 1);
			if (isFinite(v) && v >= 0 && st.v !== "") {
				ok = true;
				var monthly = st.per === "video" ? v * vpm : st.per === "day" ? v * DAYS : st.per === "year" ? v / 12 : v;
				var pv = st.per === "video" ? v : null;
				rows = periodsEarn(monthly, pv, vpm).map(function (p) {
					return { k: p.k, views: p.v, lo: p.v * r.lo / 1000, mid: p.v * r.mid / 1000, hi: p.v * r.hi / 1000 };
				});
				title = "Earnings by period";
					cd = { mode: "earn", rows: rows, r: r, monthly: monthly };
				basis = "Based on " + fmtInt(v) + " views " + (st.per === "video" ? "per video, " + fmtInt(vpm) + " video" + (vpm === 1 ? "" : "s") + " a month" : "per " + st.per) + ". RPM used: " + tail + ".";
				var h = rows.slice(0, 1).concat(rows.slice(-2)); // first row (per video / per day), per month, per year
				if (st.per !== "video") h = [rows[0], rows[1], rows[2]];
				hero.innerHTML = h.map(function (p, i) {
					return '<div class="tu-stat' + (p.k === "Per month" ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + p.k + (st.per === "video" && p.k !== "Per video" ? " (" + fmtInt(vpm) + " videos/mo)" : "") + '</div><div class="tu-stat__value">' + money(p.mid) + '</div>' +
						'<div class="tu-stat__sub">' + (r.custom ? "at your RPM" : money(p.lo) + " – " + money(p.hi)) + '</div></div>';
				}).join("");
				table.innerHTML = '<thead><tr><th>Period</th><th>Views</th>' + (r.custom ? "" : "<th>Low</th>") + '<th>' + (r.custom ? "Earnings" : "Typical") + '</th>' + (r.custom ? "" : "<th>High</th>") + '</tr></thead><tbody>' +
					rows.map(function (p) {
						return '<tr' + (p.k === "Per month" ? ' class="is-active"' : "") + '><td>' + p.k + '</td><td>' + fmtInt(p.views) + '</td>' + (r.custom ? "" : "<td>" + money(p.lo) + "</td>") + '<td>' + money(p.mid) + '</td>' + (r.custom ? "" : "<td>" + money(p.hi) + "</td>") + '</tr>';
					}).join("") + '</tbody>';
				summary = rows.map(function (p) { return p.k + ": " + (r.custom ? money(p.mid) : money(p.lo) + " – " + money(p.hi) + " (typical " + money(p.mid) + ")"); }).join("\n");
				summary = "YouTube money estimate for " + fmtInt(v) + " views " + (st.per === "video" ? "per video" : "per " + st.per) + "\n" + summary + "\n" + location.origin + "/youtubemoney" + shareQuery();
			}
		} else {
			var g = num(st.g);
			if (isFinite(g) && g > 0) {
				ok = true; cd = { mode: "goal", g: g, gp: st.gp, r: r };
				var need = function (rpm) { return g / rpm * 1000; };
				var perMonth = st.gp === "video" ? null : st.gp === "year" ? 1 / 12 : 1; // factor from goal-per-period to per-month
								var list = [];
				if (st.gp === "video") list.push({ k: "Views per video", m: 1 });
				else {
					var f = perMonth;
					list.push({ k: "Views per day", m: f / DAYS }, { k: "Views per month", m: f }, { k: "Views per year", m: f * 12 });
				}
				rows = list.map(function (p) { return { k: p.k, lo: need(r.hi) * p.m, mid: need(r.mid) * p.m, hi: need(r.lo) * p.m }; });
				title = "Views needed";
				basis = "To earn " + money(g) + " per " + st.gp + ". RPM used: " + tail + ". " + (r.custom ? "" : "The low figure assumes the high RPM, the high figure the low RPM.");
				var hs = st.gp === "video" ? [rows[0]] : [rows[1], rows[0], rows[2]];
				hero.innerHTML = hs.map(function (p, i) {
					return '<div class="tu-stat' + (i === 0 ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + p.k + '</div><div class="tu-stat__value">' + views(p.mid) + '</div><div class="tu-stat__sub">' + (r.custom ? "at your RPM" : views(p.lo) + " – " + views(p.hi)) + '</div></div>';
				}).join("");
				table.innerHTML = '<thead><tr><th>Period</th>' + (r.custom ? "<th>Views needed</th>" : "<th>Fewest</th><th>Typical</th><th>Most</th>") + '</tr></thead><tbody>' +
					rows.map(function (p) {
						return '<tr><td>' + p.k + '</td>' + (r.custom ? "<td>" + views(p.mid) + "</td>" : "<td>" + views(p.lo) + "</td><td>" + views(p.mid) + "</td><td>" + views(p.hi) + "</td>") + '</tr>';
					}).join("") + '</tbody>';
				summary = "To earn " + money(g) + " per " + st.gp + " on YouTube you need about " + views(rows[0].mid) + " " + rows[0].k.toLowerCase().replace("per", "per") + " (range " + views(rows[0].lo) + " – " + views(rows[0].hi) + ").\n" + location.origin + "/youtubemoney" + shareQuery();
			}
		}
		$("ym-table-title").textContent = title || "";
		$("ym-basis").innerHTML = ok ? basis : "";
		out.hidden = !ok; empty.hidden = ok;
		if (!ok) { hero.innerHTML = ""; table.innerHTML = ""; }
		var empt = empty.firstChild; if (empt && empt.nodeType === 3) empt.nodeValue = goal ? "Enter the amount you want to earn above to see how many views you need — or try an example: " : "Enter a number of views above to see an estimate — or try an example: ";
		if (goal) $("ym-examples").style.display = "none"; else $("ym-examples").style.display = "inline-flex";
		$("ym-rpm-table").querySelectorAll("tbody tr").forEach(function (tr) { tr.classList.toggle("is-active", tr.getAttribute("data-n") === st.n && st.f === "long" && !(st.rpm !== "" && num(st.rpm) > 0)); });
		drawCharts();
	}
	var cd = null;

	/* ---------- charts (dependency-free inline SVG, redrawn at the container's real pixel width) ---------- */
	var drawn = {}, lastW = 0;
	function cmoney(n) { return n >= 1e6 ? "$" + (Math.round(n / 1e5) / 10) + "M" : n >= 1e4 ? "$" + Math.round(n / 1e3) + "k" : n >= 1e3 ? "$" + (Math.round(n / 100) / 10) + "k" : n >= 100 ? "$" + Math.round(n) : money(n); }
	function cviews(n) { return n >= 1e9 ? (Math.round(n / 1e8) / 10) + "B" : n >= 1e6 ? (Math.round(n / 1e5) / 10) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (Math.round(n / 100) / 10) + "k" : views(n); }
	function niceTicks(max, n) {
		if (!(max > 0)) return { step: 1, top: 1 };
		var raw = max / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), nm = raw / mag;
		var step = (nm <= 1 ? 1 : nm <= 2 ? 2 : nm <= 5 ? 5 : 10) * mag;
		return { step: step, top: Math.ceil(max / step - 1e-9) * step };
	}
	function srTable(cap, head, rows) {
		return '<table class="ym-sr"><caption>' + esc(cap) + '</caption><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
			rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
	}
	function put(id, svg, table) {
		var el = $(id); el.innerHTML = svg + table;
		if (!drawn[id]) { drawn[id] = 1; el.classList.add("ym-anim"); }
	}
	function svgOpen(W, H, label) { return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label) + '">'; }

	function drawRange(W) {
		var rows = cd.rows.filter(function (p) { return p.k !== "Per day"; }), r = cd.r, RH = 74, H = rows.length * RH, x0 = 6, x1 = W - 6, o = "";
		rows.forEach(function (p, i) {
			var y = i * RH, hi = r.custom ? p.mid : p.hi, sc = function (v) { return x0 + (x1 - x0) * (hi > 0 ? v / hi : 0); };
			o += '<g><title>' + esc(p.k + ": " + (r.custom ? money(p.mid) : money(p.lo) + " to " + money(p.hi) + ", typical " + money(p.mid))) + '</title>' +
				'<text class="ymc-t ymc-sel" x="' + x0 + '" y="' + (y + 13) + '">' + esc(p.k) + '</text>' +
				'<rect class="ymc-track" x="' + x0 + '" y="' + (y + 38) + '" width="' + (x1 - x0) + '" height="12" rx="6"/>';
			if (r.custom) o += '<rect class="ymc-bar--on ymc-bar ymc-grow" x="' + x0 + '" y="' + (y + 38) + '" width="' + (x1 - x0) + '" height="12" rx="6"/><text class="ymc-t" text-anchor="end" x="' + x1 + '" y="' + (y + 30) + '">' + money(p.mid) + ' at your RPM</text>';
			else {
				var ma = sc(p.mid) > x1 - 60 ? "end" : sc(p.mid) < x0 + 60 ? "start" : "middle", mx = ma === "end" ? x1 : ma === "start" ? x0 : sc(p.mid);
				o += '<rect class="ymc-band ymc-grow" x="' + sc(p.lo) + '" y="' + (y + 38) + '" width="' + Math.max(2, sc(p.hi) - sc(p.lo)) + '" height="12"/>' +
					'<line class="ymc-tick" x1="' + sc(p.mid) + '" x2="' + sc(p.mid) + '" y1="' + (y + 33) + '" y2="' + (y + 55) + '"/>' +
					'<text class="ymc-t" text-anchor="' + ma + '" x="' + mx + '" y="' + (y + 28) + '">Typical ' + money(p.mid) + '</text>' +
					'<text class="ymc-m" text-anchor="' + (sc(p.lo) < x0 + 24 ? "start" : "middle") + '" x="' + Math.max(x0, sc(p.lo)) + '" y="' + (y + 68) + '">Low ' + money(p.lo) + '</text>' +
					'<text class="ymc-m" text-anchor="end" x="' + x1 + '" y="' + (y + 68) + '">High ' + money(p.hi) + '</text>';
			}
			o += "</g>";
		});
		var label = "Estimated earnings range. " + rows.map(function (p) { return p.k + " " + (r.custom ? money(p.mid) : money(p.lo) + " to " + money(p.hi) + ", typical " + money(p.mid)); }).join("; ") + ".";
		put("ymc-range", svgOpen(W, H, label) + o + "</svg>", srTable("Estimated earnings by period", ["Period", "Low", "Typical", "High"], rows.map(function (p) { return [p.k, money(p.lo), money(p.mid), money(p.hi)]; })));
	}

	function drawNiche(W) {
		var r = rpmRange(), geo = parseFloat(st.geo) || 1, list = NICHES.slice(1).map(function (n) { return { id: n[0], name: n[1], lo: n[2] * geo, mid: n[3] * geo, hi: n[4] * geo }; });
		list.sort(function (a, b) { return b.mid - a.mid; });
		list.push({ id: "shorts", name: "YouTube Shorts (any topic)", lo: SHORTS[0] * geo, mid: SHORTS[1] * geo, hi: SHORTS[2] * geo });
		var max = 0; list.forEach(function (n) { if (n.hi > max) max = n.hi; });
		if (r.custom && r.mid > max) max = r.mid * 1.05;
		var T = niceTicks(max, 4), top = T.top, RH = 40, padT = r.custom ? 22 : 6, padB = 24, x0 = 6, x1 = W - 6, H = padT + list.length * RH + padB, o = "";
		var sc = function (v) { return x0 + (x1 - x0) * v / top; };
		for (var t = 0; t <= top + 1e-9; t += T.step) o += '<line class="ymc-grid" x1="' + sc(t) + '" x2="' + sc(t) + '" y1="' + padT + '" y2="' + (H - padB) + '"/><text class="ymc-m" text-anchor="' + (t === 0 ? "start" : t >= top - 1e-9 ? "end" : "middle") + '" x="' + sc(t) + '" y="' + (H - 8) + '">' + (t === 0 ? "$0" : cmoney(t)) + '</text>';
		list.forEach(function (n, i) {
			var y = padT + i * RH, on = !r.custom && ((n.id === "shorts" && st.f === "shorts") || (n.id === st.n && st.f === "long")), tip = n.name + ": typical " + money(n.mid) + " per 1,000 views, low " + money(n.lo) + ", high " + money(n.hi);
			o += '<g class="ymc-row" data-n="' + n.id + '" role="button" tabindex="0" aria-pressed="' + on + '" aria-label="' + esc(tip + ". Use this topic.") + '"><title>' + esc(tip) + '</title>' +
				'<rect class="ymc-hit" x="0" y="' + y + '" width="' + W + '" height="' + (RH - 2) + '"/>' +
				'<text class="ymc-t' + (on ? " ymc-sel" : "") + '" x="' + x0 + '" y="' + (y + 13) + '">' + esc(n.name) + '</text>' +
				'<text class="ymc-m" text-anchor="end" x="' + x1 + '" y="' + (y + 13) + '">' + money(n.mid) + (W < 440 ? '' : ' (' + money(n.lo) + '–' + money(n.hi) + ')') + '</text>' +
				'<rect class="ymc-bar' + (on ? " ymc-bar--on" : "") + ' ymc-grow" x="' + x0 + '" y="' + (y + 19) + '" width="' + Math.max(2, sc(n.mid) - x0) + '" height="12" rx="2"/>' +
				'<line class="ymc-whisk" x1="' + sc(n.lo) + '" x2="' + sc(n.hi) + '" y1="' + (y + 25) + '" y2="' + (y + 25) + '"/>' +
				'<line class="ymc-whisk" x1="' + sc(n.lo) + '" x2="' + sc(n.lo) + '" y1="' + (y + 20) + '" y2="' + (y + 30) + '"/>' +
				'<line class="ymc-whisk" x1="' + sc(n.hi) + '" x2="' + sc(n.hi) + '" y1="' + (y + 20) + '" y2="' + (y + 30) + '"/></g>';
		});
		if (r.custom) {
			var mx = sc(r.mid), anc = mx > x1 - 90 ? "end" : "start";
			o += '<line class="ymc-mine" x1="' + mx + '" x2="' + mx + '" y1="' + (padT - 4) + '" y2="' + (H - padB) + '"/><text class="ymc-minet" text-anchor="' + anc + '" x="' + (anc === "end" ? mx - 4 : mx + 4) + '" y="12">Your RPM ' + money(r.mid) + '</text>';
		}
		var label = "Typical RPM by channel topic, per 1,000 views, highest first: " + list.map(function (n) { return n.name + " " + money(n.mid); }).join(", ") + "." + (r.custom ? " Your own RPM is " + money(r.mid) + "." : "");
		put("ymc-niche", svgOpen(W, H, label) + o + "</svg>", srTable("Typical RPM by topic (per 1,000 views)", ["Topic", "Low", "Typical", "High"], list.map(function (n) { return [n.name, money(n.lo), money(n.mid), money(n.hi)]; })));
	}

	function drawProj(W) {
		var r = cd.r, gr = Math.max(0, Math.min(20, parseFloat(st.gr) || 0)) / 100, ser = { lo: [0], mid: [0], hi: [0] }, rowsT = [], mv = cd.monthly;
		for (var m = 1; m <= 12; m++) {
			var vv = mv * Math.pow(1 + gr, m - 1);
			["lo", "mid", "hi"].forEach(function (k) { ser[k].push(ser[k][m - 1] + vv * r[k] / 1000); });
			rowsT.push(["Month " + m, fmtInt(vv), money(ser.lo[m]), money(ser.mid[m]), money(ser.hi[m])]);
		}
		var T = niceTicks(ser.hi[12], 4), padL = 50, padR = 10, padT = 10, padB = 26, H = 250, w = W - padL - padR, h = H - padT - padB, o = "";
		var X = function (m) { return padL + w * m / 12; }, Y = function (v) { return padT + h - h * v / T.top; };
		for (var t = 0; t <= T.top + 1e-9; t += T.step) o += '<line class="ymc-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="ymc-m" text-anchor="end" x="' + (padL - 6) + '" y="' + (Y(t) + 4) + '">' + (t === 0 ? "$0" : cmoney(t)) + '</text>';
		for (var mm = 0; mm <= 12; mm += (W < 420 ? 3 : 1)) o += '<text class="ymc-m" text-anchor="middle" x="' + X(mm) + '" y="' + (H - 8) + '">' + (mm === 0 ? "Now" : "M" + mm) + '</text>';
		var pts = function (a) { return a.map(function (v, i) { return X(i) + "," + Y(v); }); };
		if (!r.custom) o += '<polygon class="ymc-band" points="' + pts(ser.hi).concat(pts(ser.lo).reverse()).join(" ") + '"><title>Low to high range</title></polygon>';
		o += '<polyline class="ymc-line" points="' + pts(ser.mid).join(" ") + '"/>';
		for (var i = 1; i <= 12; i++) o += '<circle class="ymc-dot" cx="' + X(i) + '" cy="' + Y(ser.mid[i]) + '" r="3"><title>' + esc("Month " + i + ": " + money(ser.mid[i]) + " typical" + (r.custom ? "" : " (" + money(ser.lo[i]) + " to " + money(ser.hi[i]) + ")")) + '</title></circle>';
		o += '<line class="ymc-axis" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
		var label = "Cumulative earnings over 12 months with " + (gr * 100) + "% assumed monthly growth: " + (r.custom ? money(ser.mid[12]) + " at your RPM" : money(ser.mid[12]) + " typical, between " + money(ser.lo[12]) + " and " + money(ser.hi[12])) + " after 12 months.";
		put("ymc-proj", svgOpen(W, H, label) + o + "</svg>", srTable("Cumulative earnings by month", ["Month", "Views that month", "Low", "Typical", "High"], rowsT));
	}

	function drawGoal(W) {
		var r = cd.r, gp = cd.gp, base = gp === "video" ? [10, 50, 100, 500, 1000, 5000] : gp === "year" ? [1000, 5000, 10000, 50000, 100000, 500000] : [100, 500, 1000, 5000, 10000, 50000];
		var goals = base.slice(), found = false; goals.forEach(function (x) { if (Math.abs(x - cd.g) < 1e-9) found = true; });
		if (!found) goals.push(cd.g); goals.sort(function (a, b) { return a - b; });
		var rows = goals.map(function (x) { return { g: x, lo: x / r.hi * 1000, mid: x / r.mid * 1000, hi: x / r.lo * 1000, on: Math.abs(x - cd.g) < 1e-9 }; });
		var max = rows[rows.length - 1].mid, RH = 40, padB = 4, x0 = 6, x1 = W - 6, H = rows.length * RH + padB, o = "", unit = gp === "video" ? "per video" : "per " + gp;
		rows.forEach(function (p, i) {
			var y = i * RH, tip = money(p.g) + " " + unit + ": about " + views(p.mid) + " views" + (r.custom ? "" : " (" + views(p.lo) + " to " + views(p.hi) + ")");
			o += '<g><title>' + esc(tip) + '</title><text class="ymc-t' + (p.on ? " ymc-sel" : "") + '" x="' + x0 + '" y="' + (y + 13) + '">' + money(p.g) + " " + unit + (p.on ? " (your goal)" : "") + '</text>' +
				'<text class="ymc-m" text-anchor="end" x="' + x1 + '" y="' + (y + 13) + '">' + cviews(p.mid) + ' views' + (r.custom || W < 440 ? "" : " (" + cviews(p.lo) + '–' + cviews(p.hi) + ")") + '</text>' +
				'<rect class="ymc-track" x="' + x0 + '" y="' + (y + 19) + '" width="' + (x1 - x0) + '" height="12" rx="2"/>' +
				'<rect class="ymc-bar' + (p.on ? " ymc-bar--on" : "") + ' ymc-grow" x="' + x0 + '" y="' + (y + 19) + '" width="' + Math.max(2, (x1 - x0) * p.mid / max) + '" height="12" rx="2"/></g>';
		});
		var label = "Views needed " + unit + " for income goals at " + (r.custom ? "your RPM" : "the typical RPM") + ": " + rows.map(function (p) { return money(p.g) + " needs about " + views(p.mid) + " views"; }).join("; ") + ".";
		put("ymc-goal", svgOpen(W, H, label) + o + "</svg>", srTable("Views needed by income goal (" + unit + ")", ["Goal", "Fewest views", "Typical views", "Most views"], rows.map(function (p) { return [money(p.g), views(p.lo), views(p.mid), views(p.hi)]; })));
	}

	function drawCharts() {
		var box = $("ym-charts"); if (!box) return;
		box.hidden = !cd;
		if (!cd || !box.open) return;
		var W = Math.floor($("ymc-niche").clientWidth || box.clientWidth - 40);
		if (W < 40) return;
		lastW = W;
		var goal = cd.mode === "goal";
		$("ymc-range-wrap").hidden = goal; $("ymc-proj-wrap").hidden = goal; $("ymc-goal-wrap").hidden = !goal;
		$("ym-growth-val").textContent = Math.max(0, Math.min(20, parseFloat(st.gr) || 0)) + "%";
		if (goal) drawGoal(W); else { drawRange(W); drawProj(W); }
		drawNiche(W);
	}
	var summary = "";

	/* ---------- state <-> controls / url ---------- */
	function readControls() {
		st.v = $("ym-views").value; st.per = $("ym-per").value; st.vpm = $("ym-vpm").value; st.n = $("ym-niche").value; st.geo = $("ym-geo").value;
		st.rpm = $("ym-rpm").value; st.g = $("ym-goal").value; st.gp = $("ym-goalper").value; st.gr = $("ym-growth").value;
	}
	function writeControls() {
		$("ym-views").value = st.v; $("ym-per").value = st.per; $("ym-vpm").value = st.vpm; $("ym-niche").value = st.n; $("ym-geo").value = st.geo;
		$("ym-rpm").value = st.rpm; $("ym-goal").value = st.g; $("ym-goalper").value = st.gp;
			st.gr = String(Math.max(0, Math.min(20, parseFloat(st.gr) || 0))); $("ym-growth").value = st.gr;
		[].forEach.call($("ym-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === st.mode)); });
		[].forEach.call($("ym-format").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-format") === st.f)); });
		$("ym-earn-in").hidden = st.mode === "goal"; $("ym-goal-in").hidden = st.mode !== "goal";
		$("ym-vpm-wrap").hidden = st.per !== "video" && st.mode !== "goal";
		if (st.mode === "goal") { $("ym-vpm-wrap").hidden = true; }
		var shorts = st.f === "shorts";
		$("ym-niche").disabled = shorts; $("ym-niche-wrap").style.opacity = shorts ? "0.5" : "";
	}
	function shareQuery() {
		var p = [], k;
		function add(key, val) { if (val !== "" && val != null && val !== DEF[key]) p.push(key + "=" + encodeURIComponent(val)); }
		add("mode", st.mode); add("f", st.f);
		if (st.mode === "goal") { add("g", st.g); add("gp", st.gp); } else { add("v", st.v); add("per", st.per); if (st.per === "video") add("vpm", st.vpm); add("gr", st.gr); }
		if (st.f === "long") add("n", st.n); add("geo", st.geo); add("rpm", st.rpm);
		return p.length ? "?" + p.join("&") : "";
	}
	function sync() {
		readControls(); writeControls(); render();
		try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
		try { history.replaceState(null, "", location.pathname + shareQuery()); } catch (e) {}
	}
	function setState(o) { for (var k in o) st[k] = o[k]; writeControls(); sync(); }

	function toast(msg) {
		var t = $("ym-toast");
		if (!t) { t = document.createElement("div"); t.id = "ym-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
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

	function init() {
		for (var k in DEF) st[k] = DEF[k];
		$("ym-niche").innerHTML = NICHES.map(function (n) { return '<option value="' + n[0] + '">' + esc(n[1]) + "</option>"; }).join("");
		$("ym-rpm-table").innerHTML = '<thead><tr><th>Topic</th><th>Low</th><th>Typical</th><th>High</th></tr></thead><tbody>' +
			NICHES.slice(1).map(function (n) { return '<tr data-n="' + n[0] + '"><td>' + esc(n[1]) + "</td><td>" + money(n[2]) + "</td><td>" + money(n[3]) + "</td><td>" + money(n[4]) + "</td></tr>"; }).join("") +
			'<tr data-n="shorts"><td>YouTube Shorts (any topic)</td><td>' + money(SHORTS[0]) + "</td><td>" + money(SHORTS[1]) + "</td><td>" + money(SHORTS[2]) + "</td></tr></tbody>";
		$("ym-examples").innerHTML = EXAMPLES.map(function (e, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + e.label + "</button>"; }).join("");

		// saved settings, then the URL (the URL wins)
		try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var s in saved) if (s in DEF) st[s] = saved[s]; } catch (e) {}
		var q = new URLSearchParams(location.search), fromUrl = false;
		for (var key in DEF) if (q.has(key)) { st[key] = q.get(key); fromUrl = true; }
		if (fromUrl) { /* a shared link replaces, not mixes with, saved values */
			var base = {}; for (var d in DEF) base[d] = DEF[d];
			for (var k2 in DEF) if (q.has(k2)) base[k2] = q.get(k2);
			st = base;
		}
		if (!/^(earn|goal)$/.test(st.mode)) st.mode = "earn";
		if (!/^(long|shorts)$/.test(st.f)) st.f = "long";
		if (!GEO_NAMES[st.geo]) st.geo = "1";
		if (!/^(video|day|month|year)$/.test(st.per)) st.per = "video";
		if (!/^(video|month|year)$/.test(st.gp)) st.gp = "month";
		writeControls(); render();

		// old share links: /youtubemoney/s/<id> (the 2016 version stored {views, rpm} per id)
		var m = location.pathname.match(/^\/youtubemoney\/s\/([A-Za-z0-9]+)\/?$/);
		if (m && !fromUrl && window.fetch) {
			fetch("/api/share?calc=ymc&id=" + m[1]).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
				if (typeof d === "string") d = JSON.parse(d);
				if (d && d.views) { setState({ mode: "earn", f: "long", v: String(d.views), per: "video", vpm: "1", rpm: d.rpm ? String(d.rpm) : "" }); }
			}).catch(function () {});
		}

		["ym-views", "ym-vpm", "ym-rpm", "ym-goal", "ym-growth"].forEach(function (id) { $(id).addEventListener("input", sync); });
		["ym-per", "ym-niche", "ym-geo", "ym-goalper"].forEach(function (id) { $(id).addEventListener("change", sync); });
		$("ym-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setState({ mode: b.getAttribute("data-mode") }); });
		$("ym-format").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setState({ f: b.getAttribute("data-format") }); });
		$("ym-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { var ex = EXAMPLES[+b.getAttribute("data-i")].s; setState({ mode: "earn", v: ex.v, f: ex.f, per: ex.per, rpm: "" }); } });
		$("ym-rpm-table").addEventListener("click", function (e) {
			var tr = e.target.closest("tr[data-n]"); if (!tr) return;
			var n = tr.getAttribute("data-n");
			setState(n === "shorts" ? { f: "shorts", rpm: "" } : { f: "long", n: n, rpm: "" });
			window.scrollTo({ top: $("ym").getBoundingClientRect().top + window.pageYOffset - 80, behavior: "smooth" });
		});
		function pickTopic(g) { var n = g && g.getAttribute("data-n"); if (n) setState(n === "shorts" ? { f: "shorts", rpm: "" } : { f: "long", n: n, rpm: "" }); }
		$("ymc-niche").addEventListener("click", function (e) { pickTopic(e.target.closest("[data-n]")); });
		$("ymc-niche").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { var g = e.target.closest("[data-n]"); if (g) { e.preventDefault(); var id = g.getAttribute("data-n"); pickTopic(g); var again = $("ymc-niche").querySelector('[data-n="' + id + '"]'); if (again) again.focus(); } } });
		$("ym-charts").addEventListener("toggle", drawCharts);
		if (window.ResizeObserver) new ResizeObserver(function () { var w = Math.floor($("ymc-niche").clientWidth); if (w > 40 && w !== lastW) drawCharts(); }).observe($("ym-charts"));
		else window.addEventListener("resize", drawCharts);
		$("ym-link").addEventListener("click", function () { copy(location.origin + "/youtubemoney" + shareQuery(), "Link copied"); });
		$("ym-copy").addEventListener("click", function () { copy(summary, "Summary copied"); });
		$("ym-reset").addEventListener("click", function () { var keep = { f: st.f, mode: st.mode }; for (var k in DEF) st[k] = DEF[k]; st.f = keep.f; st.mode = keep.mode; writeControls(); sync(); });
	}
	init();
})();
