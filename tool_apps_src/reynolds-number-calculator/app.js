/* MES Reynolds Number Calculator -- UI (maths in lib.js, global MESRe). State: localStorage "mes-reynolds-number-calculator:v1"; links ?f=&t=&g=&v=&vu=&l=&lu=&s=&target=&mat= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("re"); if (!root) return;
	var R = window.MESRe, KEY = "mes-reynolds-number-calculator:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function num(s) { s = String(s).trim().replace(/\s/g, ""); if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); else s = s.replace(",", "."); var x = Number(s); return isFinite(x) && s !== "" ? x : NaN; }
	function fmt(x, sig) {
		if (x === 0) return "0"; if (!isFinite(x)) return "–"; var a = Math.abs(x); sig = sig || 4;
		if (a >= 1e6 || a < 1e-3) { var e = x.toExponential(sig - 1).split("e"); return e[0] + " × 10" + sup(+e[1]); }
		return Number(x.toPrecision(sig)).toLocaleString(undefined, { maximumFractionDigits: 8 });
	}
	function sup(n) { var m = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }; return String(n).split("").map(function (c) { return m[c] || c; }).join(""); }
	function opts(sel, items, cur) { sel.innerHTML = items.map(function (k) { return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + ">" + esc(k) + "</option>"; }).join(""); }

	var q = new URLSearchParams(location.search), saved = sget(), fromLink = !!q.get("g") || !!q.get("f");
	function pick(k, sk, ok, d) { var v = fromLink ? q.get(k) : null; if (v == null && !fromLink) v = saved[sk || k]; return v != null && ok(v) ? v : d; }
	var S = {
		f: pick("f", "f", function (v) { return !!R.FLUIDS.filter(function (x) { return x.id === v; })[0]; }, "water"),
		t: pick("t", "t", function (v) { return isFinite(+v); }, "20"), g: pick("g", "g", function (v) { return !!R.GBY[v]; }, "pipe"),
		v: pick("v", "v", function (v) { return isFinite(num(v)); }, "1"), vu: pick("vu", "vu", function (v) { return R.SPEED[v]; }, "m/s"),
		l: pick("l", "l", function (v) { return isFinite(num(v)); }, "5"), lu: pick("lu", "lu", function (v) { return R.LEN[v]; }, "cm"),
		s: pick("s", "s", function (v) { return /^(re|v|l)$/.test(v); }, "re"), target: pick("target", "target", function (v) { return isFinite(num(v)); }, "2300"),
		mat: pick("mat", "mat", function (v) { return isFinite(+v); }, "0"), rho: saved.rho || "1000", mu: saved.mu || "1", rhou: saved.rhou || "kg/m³", muu: saved.muu || "Pa·s"
	};
	var MATS = [["Smooth (drawn tubing, plastic, PVC)", 0.0015e-3], ["Commercial steel", 0.045e-3], ["Galvanized iron", 0.15e-3], ["Cast iron", 0.26e-3], ["Concrete", 1e-3], ["Riveted steel", 3e-3]];

	$("re-fluid").innerHTML = R.FLUIDS.map(function (f) { return '<option value="' + f.id + '">' + esc(f.name) + "</option>"; }).join("");
	$("re-geom").innerHTML = R.GEOM.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("");
	opts($("re-v-u"), Object.keys(R.SPEED), S.vu); opts($("re-l-u"), Object.keys(R.LEN), S.lu); opts($("re-rho-u"), Object.keys(R.DENS), S.rhou); opts($("re-mu-u"), Object.keys(R.VISC), S.muu);
	$("re-rough").innerHTML = MATS.map(function (m, i) { return '<option value="' + i + '">' + esc(m[0]) + "</option>"; }).join("");
	$("re-examples").querySelector("tbody").innerHTML = R.EXAMPLES.map(function (e) { return "<tr><td>" + esc(e[0]) + "</td><td>" + fmt(e[1], 2) + "</td></tr>"; }).join("");

	function read() { S.f = $("re-fluid").value; S.t = $("re-temp").value; S.g = $("re-geom").value; S.v = $("re-v").value; S.vu = $("re-v-u").value; S.l = $("re-l").value; S.lu = $("re-l-u").value; S.target = $("re-target").value; S.mat = $("re-rough").value; S.rho = $("re-rho").value; S.mu = $("re-mu").value; S.rhou = $("re-rho-u").value; S.muu = $("re-mu-u").value; }
	function write() { $("re-fluid").value = S.f; $("re-temp").value = S.t; $("re-geom").value = S.g; $("re-v").value = S.v; $("re-v-u").value = S.vu; $("re-l").value = S.l; $("re-l-u").value = S.lu; $("re-target").value = S.target; $("re-rough").value = S.mat; $("re-rho").value = S.rho; $("re-mu").value = S.mu; $("re-rho-u").value = S.rhou; $("re-mu-u").value = S.muu; }

	function scale(gid, Re) {
		var g = R.GBY[gid], lo = -5, hi = 10, W = 760, H = 96, padL = 14, padR = 14, X = function (lg) { return padL + (lg - lo) / (hi - lo) * (W - padL - padR); }, svg = "", prev = lo;
		g.zones.forEach(function (z, i) {
			var top = Math.min(hi, Math.log10(z[0])); if (top <= prev) return;
			var x0 = X(prev), x1 = X(top), w = x1 - x0;
			svg += '<rect class="re-zone-' + z[2] + '" x="' + x0.toFixed(1) + '" y="26" width="' + w.toFixed(1) + '" height="34"><title>' + esc(z[1]) + "</title></rect>";
			var label = z[1].replace(/ \(.*\)/, ""), maxc = Math.floor(w / 6.2); if (maxc >= 6) svg += '<text class="re-zl" x="' + (x0 + w / 2).toFixed(1) + '" y="47" text-anchor="middle">' + esc(label.length > maxc ? label.slice(0, maxc - 1) + "…" : label) + "</text>";
			prev = top;
		});
		svg += '<line class="re-ax" x1="' + X(lo) + '" x2="' + X(hi) + '" y1="60" y2="60"/>';
		for (var e = lo; e <= hi; e += 1) svg += '<line class="re-ax" x1="' + X(e) + '" x2="' + X(e) + '" y1="60" y2="65"/>' + (e % 1 === 0 && (e + 5) % 1 === 0 ? '<text class="re-ax-t" x="' + X(e) + '" y="78">10' + sup(e) + "</text>" : "");
		var lg = Math.max(lo, Math.min(hi, Math.log10(Math.max(1e-30, Re)))), mx = X(lg);
		svg += '<line class="re-mark" x1="' + mx + '" x2="' + mx + '" y1="14" y2="60"/><text class="re-mark-t" x="' + Math.max(40, Math.min(W - 40, mx)) + '" y="10" text-anchor="middle">Re = ' + esc(fmt(Re, 3)) + "</text>";
		$("re-scale").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' + svg + "</svg>";
	}

	function calc() {
		read(); var tC = num(S.t), g = R.GBY[S.g], custom = S.f === "custom";
		$("re-temp-f").hidden = !(S.f === "water" || S.f === "air"); $("re-custom").hidden = !custom; $("re-rough-f").hidden = S.g !== "pipe";
		$("re-v-f").hidden = S.s === "v"; $("re-l-f").hidden = S.s === "l"; $("re-target-f").hidden = S.s === "re";
		$("re-l-l").textContent = g.lname; [].forEach.call($("re-solve").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === S.s)); });
		var cust = custom ? { rho: num(S.rho) * R.DENS[S.rhou], mu: num(S.mu) * R.VISC[S.muu] } : null;
		if (!isFinite(tC)) tC = 20; if (tC < 0 && S.f === "water") tC = 0; if (tC > 100 && S.f === "water") tC = 100;
		var p = R.props(S.f, tC, cust), ok = isFinite(p.rho) && p.rho > 0 && isFinite(p.mu) && p.mu > 0;
		$("re-nu").textContent = ok ? fmt(p.nu, 4) + " m²/s" : "–"; $("re-nu-s").textContent = ok ? "ρ = " + fmt(p.rho, 4) + " kg/m³ · μ = " + fmt(p.mu, 4) + " Pa·s" : "enter a density and viscosity above zero";
		var v = num(S.v) * R.SPEED[S.vu], L = num(S.l) * R.LEN[S.lu], target = num(S.target), Re = NaN, shownV = v, shownL = L;
		if (!ok) { $("re-main").textContent = "–"; return; }
		if (S.s === "re") Re = R.reynolds(p.rho, v, L, p.mu);
		else if (S.s === "v") { Re = target; shownV = R.solveSpeed(target, L, p); v = shownV; }
		else { Re = target; shownL = R.solveLength(target, v, p); L = shownL; }
		if (!isFinite(Re) || Re <= 0 || !isFinite(v) || !isFinite(L) || v <= 0 || L <= 0) { $("re-main").textContent = "–"; $("re-main-s").textContent = "Enter positive numbers for every box."; $("re-regime").textContent = "–"; $("re-regime-s").textContent = ""; $("re-scale").innerHTML = ""; $("re-extra-card").hidden = true; return; }
		if (S.s === "re") { $("re-main-l").textContent = "Reynolds number"; $("re-main").textContent = fmt(Re, 4); $("re-main-s").textContent = "Re = ρ v L / μ = " + fmt(v, 3) + " m/s × " + fmt(L, 3) + " m ÷ " + fmt(p.nu, 3) + " m²/s"; }
		else if (S.s === "v") { $("re-main-l").textContent = "Speed for Re = " + fmt(Re, 4); $("re-main").textContent = fmt(shownV / R.SPEED[S.vu], 4) + " " + S.vu; $("re-main-s").textContent = "= " + fmt(shownV, 4) + " m/s = " + fmt(shownV * 3.6, 4) + " km/h = " + fmt(shownV / 0.44704, 4) + " mph"; }
		else { $("re-main-l").textContent = g.lname + " for Re = " + fmt(Re, 4); $("re-main").textContent = fmt(shownL / R.LEN[S.lu], 4) + " " + S.lu; $("re-main-s").textContent = "= " + fmt(shownL, 4) + " m = " + fmt(shownL * 100, 4) + " cm = " + fmt(shownL / 0.0254, 4) + " in"; }
		var rg = R.regime(S.g, Re); $("re-regime").textContent = rg.label; $("re-regime-s").textContent = rg.note;
		scale(S.g, Re);
		var ex = R.extras(S.g, Re, v, L, p, { rough: MATS[+S.mat] ? MATS[+S.mat][1] : 0 }).filter(function (r) { return r[1] != null; });
		$("re-extra-card").hidden = !ex.length;
		$("re-extra").querySelector("tbody").innerHTML = ex.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + fmt(r[1], 4) + "</b> " + esc(r[2]) + "</td><td>" + esc(r[3]) + "</td></tr>"; }).join("");
		var pre = S.g === "plate" || S.g === "airfoil" ? "plate" : S.g === "pipe" || S.g === "channel" ? "cavity" : "cylinder", c = Math.max(10, Math.min(5000, Re));
		$("re-sim").href = "/fluid-simulator?p=" + pre + "&re=" + Math.round(c);
		$("re-sim-s").textContent = Re > 5000 ? "The simulator goes up to Re 5,000 (your flow is " + fmt(Re, 3) + "); it opens at the top of its range." : Re < 10 ? "The simulator starts at Re 10 (your flow is " + fmt(Re, 3) + "); it opens at the bottom of its range." : "Opens a scenario at Re " + Math.round(c) + ".";
		sset({ f: S.f, t: S.t, g: S.g, v: S.v, vu: S.vu, l: S.l, lu: S.lu, s: S.s, target: S.target, mat: S.mat, rho: S.rho, mu: S.mu, rhou: S.rhou, muu: S.muu });
	}
	write(); calc();
	root.addEventListener("input", calc); root.addEventListener("change", calc);
	$("re-solve").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.s = b.dataset.s; calc(); });
	$("re-link").onclick = function () {
		read(); var o = new URLSearchParams({ f: S.f, t: S.t, g: S.g, v: S.v, vu: S.vu, l: S.l, lu: S.lu, s: S.s, target: S.target, mat: S.mat }), url = location.origin + location.pathname + "?" + o.toString();
		function done() { var t = $("re-toast"); if (!t) { t = document.createElement("div"); t.id = "re-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = "Link copied"; t.classList.add("tu-toast--show"); setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};
	if (fromLink) history.replaceState(null, "", location.pathname);
})();
