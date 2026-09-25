/* MES Earth Curvature Calculator -- mes.fm/earth-curvature-calculator
 * Sphere model (R = 6371.0088 km). Everything is computed in metres internally.
 *   drop   = R (1/cos(d/R) - 1)           (~ d^2 / 2R)
 *   horizon = sqrt(2 R_e h + h^2)          R_e = R / (1 - k) when refraction is on (k = 0.13)
 *   hidden = R_e (1/cos((d - horizon)/R_e) - 1)   for d beyond the observer's horizon
 */
(function () {
	"use strict";
	var R = 6371008.8, K = 0.13;
	var $ = function (id) { return document.getElementById(id); };
	var M_PER = { km: 1000, mi: 1609.344, m: 1, ft: 0.3048 };
	var state = { du: "km", hu: "m" };

	function fmtNum(v) {
		if (!isFinite(v)) return "—";
		var a = Math.abs(v);
		if (a === 0) return "0";
		if (a >= 100000) return Math.round(v).toLocaleString("en-US");
		return Number(v.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 6 });
	}
	function fmtLen(m) {                       // metres -> "37.98 m (124.6 ft)" with smaller units for tiny values
		if (!isFinite(m)) return "—";
		if (m === 0) return "none";
		if (m < 1) return fmtNum(m * 100) + " cm (" + fmtNum(m / 0.0254) + " in)";
		if (m >= 1000) return fmtNum(m / 1000) + " km (" + fmtNum(m / 1609.344) + " mi)";
		return fmtNum(m) + " m (" + fmtNum(m / 0.3048) + " ft)";
	}
	function dropFor(dm, Re) {
		var th = dm / Re;
		return th >= Math.PI / 2 ? Infinity : Re * (1 / Math.cos(th) - 1);
	}
	function horizonFor(hm, Re) { return Math.sqrt(2 * Re * hm + hm * hm); }
	function hiddenFor(dm, hm, Re) {
		var dh = horizonFor(hm, Re);
		if (dm <= dh) return 0;
		var th = (dm - dh) / Re;
		return th >= Math.PI / 2 ? Infinity : Re * (1 / Math.cos(th) - 1);
	}

	function read() {
		var d = parseFloat($("ec-d").value), h = parseFloat($("ec-h").value), t = parseFloat($("ec-t").value);
		return {
			dm: (isNaN(d) ? NaN : Math.max(0, d)) * M_PER[state.du],
			hm: (isNaN(h) ? 0 : Math.max(0, h)) * M_PER[state.hu],
			tm: (isNaN(t) ? 0 : Math.max(0, t)) * M_PER[state.hu],
			Re: $("ec-ref").checked ? R / (1 - K) : R
		};
	}

	function draw(dropTxt, hm) {
		var svg = $("ec-svg"), cx = 320, r = 780, cy = 60 + r, phi = 0.27;
		function pt(a) { return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }
		var o = pt(-phi), tg = pt(phi), tl = 1;
		// tangent line at the observer
		var tx = Math.cos(-phi), ty = Math.sin(-phi);         // tangent direction (perpendicular to the radius)
		var x2 = 600, s = (x2 - o[0]) / tx, y2 = o[1] + s * ty;
		var sx = tg[0], sy = o[1] + ((sx - o[0]) / tx) * ty;   // tangent line at the target's x position
		var eye = 34;
		var arc = "M" + pt(-0.34)[0] + " " + pt(-0.34)[1] + " A " + r + " " + r + " 0 0 1 " + pt(0.34)[0] + " " + pt(0.34)[1];
		svg.innerHTML =
			'<path class="tu-svg-tint" d="' + arc + ' L ' + pt(0.34)[0] + ' 230 L ' + pt(-0.34)[0] + ' 230 Z"/>' +
			'<path class="tu-svg-line" d="' + arc + '"/>' +
			'<line class="tu-svg-accent" x1="' + o[0] + '" y1="' + (o[1] - eye) + '" x2="' + sx + '" y2="' + (sy - eye) + '" stroke-dasharray="6 5"/>' +
			'<line class="tu-svg-line" x1="' + o[0] + '" y1="' + o[1] + '" x2="' + o[0] + '" y2="' + (o[1] - eye) + '"/>' +
			'<circle class="tu-svg-fill" cx="' + o[0] + '" cy="' + (o[1] - eye) + '" r="5"/>' +
			'<line class="tu-svg-line" x1="' + sx + '" y1="' + tg[1] + '" x2="' + sx + '" y2="' + sy + '"/>' +
			'<circle class="tu-svg-fill" cx="' + tg[0] + '" cy="' + tg[1] + '" r="6"/>' +
			'<text class="tu-svg-text" x="' + (o[0] - 10) + '" y="' + (o[1] - eye / 2) + '" text-anchor="end">you</text>' +
			'<text class="tu-svg-text" x="' + (tg[0] - 4) + '" y="' + (tg[1] + 24) + '" text-anchor="end">object</text>' +
			'<text class="tu-svg-text" x="' + (sx + 8) + '" y="' + ((tg[1] + sy) / 2 + 4) + '">drop: ' + dropTxt + '</text>' +
			'<text class="tu-svg-text" x="' + ((o[0] + sx) / 2) + '" y="' + (o[1] - eye - 26) + '" text-anchor="middle">straight line of sight</text>' +
			'<text class="tu-svg-text" x="' + cx + '" y="222" text-anchor="middle">curved surface of the Earth</text>';
	}

	function renderTable(c) {
		var list = state.du === "km" ? [1, 2, 5, 10, 20, 30, 50, 100, 200, 500, 1000] : [1, 2, 5, 10, 20, 30, 50, 100, 200, 500];
		var body = $("ec-table").tBodyRows || $("ec-table").querySelector("tbody");
		var rows = [];
		function row(d, cls) {
			var dm = d * M_PER[state.du];
			rows.push('<tr' + (cls ? ' class="' + cls + '"' : "") + "><td>" + fmtNum(d) + " " + (state.du === "km" ? "km" : "mi") + "</td><td>" + fmtLen(dropFor(dm, R)) +
				"</td><td>" + (c.hm > 0 ? fmtLen(hiddenFor(dm, c.hm, c.Re)) : "—") + "</td></tr>");
		}
		if (!isNaN(c.dm) && c.dm > 0) row(c.dm / M_PER[state.du], "is-active");
		list.forEach(function (d) { row(d); });
		body.innerHTML = rows.join("");
	}

	function update() {
		var c = read();
		var hu = state.hu;
		if (isNaN(c.dm)) {
			["ec-drop", "ec-horizon", "ec-hidden"].forEach(function (id) { $(id).textContent = "—"; });
			return;
		}
		var drop = dropFor(c.dm, R);
		$("ec-drop").textContent = fmtLen(drop);
		var d8 = (c.dm / 1609.344);
		$("ec-drop-sub").textContent = "Approx. " + fmtNum(d8 * d8 * 7.98) + " inches by the “8 in × miles²” rule" + (c.dm > 2000000 ? " (rough — far beyond where the parabola holds)" : "") + ".";
		var hz = horizonFor(c.hm, c.Re);
		$("ec-horizon").textContent = c.hm > 0 ? fmtNum(hz / 1000) + " km" : "—";
		$("ec-horizon-sub").textContent = c.hm > 0 ? "≈ " + fmtNum(hz / 1609.344) + " miles to the horizon from " + fmtNum(c.hm / M_PER[hu]) + " " + hu + " up." : "Enter an eye height above the ground.";
		var hid = hiddenFor(c.dm, c.hm, c.Re);
		var hidTxt, sub;
		if (c.hm <= 0) { hidTxt = "—"; sub = "Enter an eye height to see what is hidden."; }
		else if (hid === 0) { hidTxt = "Nothing"; sub = "The object's base is still above your horizon."; }
		else { hidTxt = fmtLen(hid); sub = "of the object's height is below your horizon line."; }
		if (c.tm > 0 && c.hm > 0 && hid !== Infinity) {
			var vis = Math.max(0, c.tm - hid);
			sub = vis > 0 ? "Of a " + fmtNum(c.tm / M_PER[hu]) + " " + hu + " object you still see the top " + fmtNum(vis / M_PER[hu]) + " " + hu + " (" + Math.round(vis / c.tm * 100) + "%)."
			              : "The whole " + fmtNum(c.tm / M_PER[hu]) + " " + hu + " object is below your horizon.";
		}
		$("ec-hidden").textContent = hidTxt;
		$("ec-hidden-sub").textContent = sub;
		draw(fmtLen(drop).split(" (")[0], c.hm);
		renderTable(c);
	}

	function shareUrl() {   // the address bar is never touched while you type; only "Copy link" builds a ?query
		return location.origin + location.pathname + "?d=" + $("ec-d").value + state.du + "&h=" + $("ec-h").value + state.hu + ($("ec-ref").checked ? "&r=1" : "");
	}

	function toast(msg) {
		var t = document.getElementById("tu-toast-x");
		if (!t) { t = document.createElement("div"); t.id = "tu-toast-x"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1300);
	}
	function copyText(text, msg) {
		function done() { toast(msg); }
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
	}

	function setSeg(id, val) {
		var btns = $(id).querySelectorAll("button");
		Array.prototype.forEach.call(btns, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-u") === val ? "true" : "false"); });
	}
	function setDistUnit(u, convertValue) {
		if (u === state.du) return;
		var d = parseFloat($("ec-d").value);
		if (convertValue && !isNaN(d)) $("ec-d").value = Number((d * M_PER[state.du] / M_PER[u]).toPrecision(6));
		state.du = u; setSeg("ec-du", u); $("ec-d-unit").textContent = u === "km" ? "km" : "mi";
		$("ec-slider").max = u === "km" ? 100 : 60;
		syncSlider();
	}
	function setHeightUnit(u, convertValue) {
		if (u === state.hu) return;
		["ec-h", "ec-t"].forEach(function (id) {
			var v = parseFloat($(id).value);
			if (convertValue && !isNaN(v)) $(id).value = Number((v * M_PER[state.hu] / M_PER[u]).toPrecision(6));
		});
		state.hu = u; setSeg("ec-hu", u); $("ec-h-unit").textContent = u; $("ec-t-unit").textContent = u;
	}
	function syncSlider() { var d = parseFloat($("ec-d").value); $("ec-slider").value = isNaN(d) ? 0 : Math.min(d, $("ec-slider").max); }

	function init() {
		$("ec-du").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { setDistUnit(b.getAttribute("data-u"), true); update(); } });
		$("ec-hu").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { setHeightUnit(b.getAttribute("data-u"), true); update(); } });
		["ec-d", "ec-h", "ec-t"].forEach(function (id) { $(id).addEventListener("input", function () { if (id === "ec-d") syncSlider(); update(); }); });
		$("ec-ref").addEventListener("change", update);
		$("ec-link").addEventListener("click", function () { copyText(shareUrl(), "Link copied"); });
		$("ec-slider").addEventListener("input", function () { $("ec-d").value = $("ec-slider").value; update(); });
		$("ec-presets").addEventListener("click", function (e) {
			var b = e.target.closest("button");
			if (!b) return;
			setDistUnit(b.getAttribute("data-du"), false);
			setHeightUnit(b.getAttribute("data-hu"), false);
			$("ec-d").value = b.getAttribute("data-d");
			$("ec-h").value = b.getAttribute("data-h");
			$("ec-t").value = b.getAttribute("data-t") || 0;
			syncSlider(); update();
		});
		// restore from ?d=22km&h=1.7m&r=1
		try {
			var q = new URLSearchParams(location.search), m;
			if ((m = /^([\d.]+)(km|mi)$/.exec(q.get("d") || ""))) { setDistUnit(m[2], false); $("ec-d").value = m[1]; }
			if ((m = /^([\d.]+)(m|ft)$/.exec(q.get("h") || ""))) { setHeightUnit(m[2], false); $("ec-h").value = m[1]; }
			if (q.get("r") === "1") $("ec-ref").checked = true;
		} catch (e) {}
		$("ec-slider").max = state.du === "km" ? 100 : 60;
		syncSlider();
		update();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
