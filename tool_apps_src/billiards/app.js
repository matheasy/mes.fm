/* MES Billiards: the page (setup, table drawing, aiming, power + spin, the computer, replay, challenges, guest online games via
   /api/billiards, Hive games, statistics, rules). The same served file is also started as a Web Worker that runs the computer's thinking.
   Online: /api/billiards on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in localStorage
   "mes-billiards:mock" is used instead, and Hive play uses a stand-in chain ("mes-billiards:hchain") + a per-tab account, so two tabs can play. */
(function () {
	"use strict";
	var B = (typeof self !== "undefined" ? self : window).MESBilliards;

	if (typeof document === "undefined") {          // running as the Web Worker: the computer's shot
		self.onmessage = function (e) {
			var r = null;
			try {
				var s = e.data.s;
				s.g = B.game(s.v); s.T = B.TABLES[s.g.table];
				r = B.ai(s, e.data.level);
			} catch (err) { r = null; }
			self.postMessage({ id: e.data.id, r: r });
		};
		return;
	}

	var SCRIPT = document.currentScript && document.currentScript.src;
	var root = document.getElementById("bl");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-billiards:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var START = root.getAttribute("data-start") || "";

	/* ---------- saved settings ---------- */
	var S = { game: "8", opp: "cpu", lv: "medium", me: "first", alt: 0, guide: "full", orient: "auto", speed: "1", cloth: "green", snd: true, rel: true, nums: false,
		names: ["", ""], ovm: "auto", mus: [], mpBig: false, dim: "2d", cam: "auto", room: "bar", name: "", ofirst: "host", ong: 0, opub: true, cur: null, stats: {}, online: null, hive: null, saved: {}, chal: {}, power: 350 };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k0 in saved) S[k0] = saved[k0]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

	/* ---------- worker ---------- */
	var worker = null, wid = 0, waiting = {};
	try {
		if (SCRIPT && typeof Worker !== "undefined" && !/noworker/.test(location.search)) {
			worker = new Worker(SCRIPT);
			worker.onmessage = function (e) { var f = waiting[e.data.id]; if (f) { delete waiting[e.data.id]; f(e.data.r); } };
			worker.onerror = function () { worker = null; Object.keys(waiting).forEach(function (k) { var f = waiting[k]; delete waiting[k]; f(undefined); }); };
		}
	} catch (e) { worker = null; }
	function plain(s) { var o = {}; for (var k in s) if (k !== "g" && k !== "T") o[k] = s[k]; return JSON.parse(JSON.stringify(o)); }
	function askAi(s, level) {
		return new Promise(function (res) {
			var local = function () { setTimeout(function () { try { res(B.ai(B.clone(s), level)); } catch (e) { res(null); } }, 30); };
			if (!worker) return local();
			var id = ++wid;
			waiting[id] = function (r) { if (r === undefined) local(); else res(r); };
			worker.postMessage({ id: id, s: plain(s), level: level });
		});
	}

	/* ---------- game state ---------- */
	var st, mode = "cpu", human = 0, seed = "", busy = false, gen = 0;
	var aim = 0, power = S.power || 350, spin = { x: 0, y: 0 }, place = null, elev = 0;   // elev = cue elevation in degrees (jump shots)   // place = cue ball spot while in hand (table metres)
	var anim = null, queue = [], lastShow = null, cpuAim = null;
	var score = { p: [0, 0] };
	var LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard", pro: "Pro", expert: "Expert" };

	function newSeed() { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; for (var i = 0; i < 6; i++) s += A[(Math.random() * A.length) | 0]; return s; }
	function game() { return st.g; }
	function effOpp() { return B.game(S.game) && B.game(S.game).np === 1 ? "solo" : S.opp; }
	function newGame(keepAlt) {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		gen++; busy = false; anim = null; queue = []; cpuAim = null;
		seed = newSeed();
		st = B.create(S.game, seed) || B.create("8", seed);
		if (v3) v3.resetRoll();
		mode = effOpp();
		if (mode === "cpu") {
			if (!keepAlt && S.me === "alt") S.alt = 1 - (S.alt || 0);
			human = S.me === "second" ? 1 : S.me === "alt" ? (S.alt || 0) : 0;
		} else human = 0;
		save();
		resetAim();
		storeCur();
		render(); relayout();
		maybeCpu();
	}
	function storeCur() { S.cur = { v: st.v, seed: st.seed, hist: st.hist.slice(), mode: mode, human: human, done: !!st.win, guided: !!st._guided }; save(); }
	function isHumanTurn() {
		if (!st || st.win) return false;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		if (mode === "hive") return hv.R && hv.R.status === "play" && hv.R.players[st.turn] === hMe();
		return true;
	}
	function canShoot() { return isHumanTurn() && !anim && !queue.length && !busy && !(mode === "online" && on.sending) && !(mode === "hive" && (hv.busy || hv.pending.some(function (p) { return p.a === "sh"; }))); }

	function defaultPlace() {
		var T = st.T, tries, px, py;
		if (st.zone === "D") { px = -T.L / 2 + T.baulk - 0.06; py = T.dR * 0.45; }
		else if (st.zone === "kitchen") { px = -T.L / 4 - 0.04; py = 0; }
		else { px = -T.L / 4; py = 0; }
		if (B.placeOk(st, px, py)) return [px, py];
		for (tries = 0; tries < 400; tries++) {
			var a = tries * 0.618 * 6.283, r = 0.02 + tries * 0.004;
			var qx = px + Math.cos(a) * r, qy = py + Math.sin(a) * r;
			if (B.placeOk(st, qx, qy)) return [qx, qy];
		}
		return [px, py];
	}
	function cueXY() { return st.bih ? (place || (place = defaultPlace())) : [st.x[0], st.y[0]]; }
	function resetAim() {
		place = st.bih ? defaultPlace() : null;
		var c = cueXY(), tg = B.targets(st), best = null, bd = 1e9;
		if (st.brk && st.g.table === "pool") {   // aim at the apex of the rack
			for (var i = 1; i < st.n; i++) if (st.on[i] && st.x[i] < bd) { bd = st.x[i]; best = i; }
			if (best !== null) aim = B.angleOf(st.x[best] - c[0], st.y[best] - c[1]);
		} else autoAimNext();
		spin = { x: 0, y: 0 };
		if (st.brk && st.g.table === "pool") power = Math.max(power, 850);
		else if (power > 700) power = 380;
		drawSpin(); renderPower();
	}

	/* ---------- shooting ---------- */
	function buildShot() {
		var o = { a: aim, p: Math.max(1, Math.min(1000, Math.round(power))), sx: Math.round(spin.x), sy: Math.round(spin.y) };
		if (o.sx * o.sx + o.sy * o.sy > 10000) { var f = 100 / Math.sqrt(o.sx * o.sx + o.sy * o.sy); o.sx = Math.trunc(o.sx * f); o.sy = Math.trunc(o.sy * f); }
		if (st.bih) { var c = cueXY(); o.bx = Math.round(c[0] * 10000); o.by = Math.round(c[1] * 10000); }
		if (elev > 0) o.e = Math.max(1, Math.min(B.EMAX, Math.round(elev)));
		return o;
	}
	function shoot() {
		if (!canShoot()) { if (anim) skipAnim(); return; }
		ensureAudio();
		var shot = buildShot();
		if (!B.isLegal(st, shot)) {
			if (st.bih) return toast("The cue ball can't go there: place it " + B.zoneName(st.zone) + ", not touching another ball.");
			return toast("That shot isn't allowed.");
		}
		if (effGuide() !== "off") st._guided = true;
		if (mode === "online") return onlineShot(shot);
		if (mode === "hive") return hiveShot(shot);
		take(shot);
	}
	function take(shot) {
		var res = B.apply(st, shot, { frames: true });
		if (!res) return;
		place = null;
		storeCur();
		show(res, function () { afterShot(); });
	}
	function afterShot() {
		if (st.bih) place = defaultPlace();
		if (st.win && !st._fin) { st._fin = true; finish(); }
		else if (!st.win) autoAimNext();
		render();
		maybeCpu();
	}
	function autoAimNext() {
		// aim at the nearest legal ball the cue ball can hit straight (else just the nearest legal ball)
		var c = cueXY(), tg = B.targets(st).slice();
		tg.sort(function (a, b) { return Math.hypot(st.x[a] - c[0], st.y[a] - c[1]) - Math.hypot(st.x[b] - c[0], st.y[b] - c[1]); });
		var pick = tg[0];
		for (var i = 0; i < tg.length; i++) {
			var dx = st.x[tg[i]] - c[0], dy = st.y[tg[i]] - c[1], d = Math.hypot(dx, dy) || 1, g = B.guide(st, c[0], c[1], dx / d, dy / d);
			if (g.kind === "ball" && g.b === tg[i]) { pick = tg[i]; break; }
		}
		if (pick !== undefined) aim = B.angleOf(st.x[pick] - c[0], st.y[pick] - c[1]);
		spin = { x: 0, y: 0 }; setElev(0); drawSpin();
	}

	/* ---------- the computer ---------- */
	function maybeCpu() {
		if (mode !== "cpu" || !st || st.win || st.turn === human || busy || anim) return;
		busy = true;
		var g0 = gen, t0 = Date.now();
		$("bl-think").hidden = false;
		render();
		askAi(st, S.lv).then(function (shot) {
			if (g0 !== gen) return;
			if (!shot || !B.isLegal(st, shot)) shot = fallbackShot();
			var wait = Math.max(0, 500 - (Date.now() - t0));
			setTimeout(function () {
				if (g0 !== gen) return;
				$("bl-think").hidden = true;
				// show the computer lining up the shot
				var from = aim, to = shot.a, d = ((to - from) % 3600000 + 5400000) % 3600000 - 1800000;
				if (shot.bx !== undefined) place = [shot.bx / 10000, shot.by / 10000];
				cpuAim = { t0: performance.now(), from: from, d: d, p0: power, p1: shot.p, sx: shot.sx, sy: shot.sy };
				spin = { x: shot.sx, y: shot.sy }; drawSpin();
				var dur = 650;
				var tick = function () {
					if (g0 !== gen) return;
					var f = Math.min(1, (performance.now() - cpuAim.t0) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
					aim = (((cpuAim.from + cpuAim.d * e) % 3600000) + 3600000) % 3600000;
					power = cpuAim.p0 + (cpuAim.p1 - cpuAim.p0) * e; renderPower();
					draw();
					if (f < 1) requestAnimationFrame(tick);
					else { aim = shot.a; cpuAim = null; busy = false; take(shot); }
				};
				requestAnimationFrame(tick);
			}, wait);
		});
	}
	function fallbackShot() {
		var c = st.bih ? defaultPlace() : [st.x[0], st.y[0]], tg = B.targets(st), b = tg[0] || 1;
		var o = { a: B.angleOf(st.x[b] - c[0], st.y[b] - c[1]), p: 300, sx: 0, sy: 0 };
		if (st.bih) { o.bx = Math.round(c[0] * 10000); o.by = Math.round(c[1] * 10000); }
		return o;
	}

	/* ---------- undo ---------- */
	function undo() {
		if (mode === "online" || mode === "hive") return toast("No undo in online games.");
		if (!st.hist.length || anim) return;
		gen++; busy = false; cpuAim = null; $("bl-think").hidden = true;
		var h = st.hist.slice(), k = h.length - 1, s2 = null;
		if (mode === "cpu") {
			for (; k >= 0; k--) { s2 = B.replay(st.v, st.seed, h.slice(0, k)); if (s2 && s2.turn === human) break; }
			if (k < 0) { s2 = B.replay(st.v, st.seed, []); }
		} else s2 = B.replay(st.v, st.seed, h.slice(0, k));
		if (!s2) return;
		st = s2;
		if (v3) v3.resetRoll();
		resetAim();
		storeCur();
		toast("Shot taken back.");
		render(); draw();
		maybeCpu();
	}

	/* ===================================================================== drawing ===================================================================== */
	var cv = $("bl-cv"), ctx = cv.getContext("2d"), stage = $("bl-stage"), view = $("bl-view");
	var LY = null, staticCv = null, sprites = {};
	var CLOTH = { green: ["#1f7a46", "#155d34"], blue: ["#1f5f9e", "#174877"], red: ["#9e2a2b", "#771f20"], grey: ["#5b6670", "#434c54"] };
	var POOL_COL = { 0: "#f8f8f2", 1: "#f2c200", 2: "#1c4fd8", 3: "#d62828", 4: "#6a2c91", 5: "#f77f00", 6: "#1b7f3b", 7: "#7b1e1e", 8: "#111111" };
	var SNK_COL = { 0: "#f8f8f2", 1: "#c1121f", 2: "#f2c200", 3: "#1b8a43", 4: "#7a4a1e", 5: "#1c4fd8", 6: "#ff7eb6", 7: "#111111" };
	function ballColor(k, snooker) { return snooker ? SNK_COL[k] : POOL_COL[k > 8 ? k - 8 : k]; }
	function upright() {
		if (S.orient === "upright") return true;
		if (S.orient === "across") return false;
		var w = stage.clientWidth || window.innerWidth;
		return w < 620 && window.innerHeight > window.innerWidth * 1.15;
	}
	function relayout() {
		if (!st) return;
		var T = st.T, cush = 0.045, wood = T.id === "pool" ? 0.11 : 0.13, edge = cush + wood;
		var Lo = T.L + 2 * edge, Wo = T.W + 2 * edge, up = upright();
		var dimX = up ? Wo : Lo, dimY = up ? Lo : Wo;
		var aw = Math.max(200, stage.clientWidth - 12);
		var fill = view.classList.contains("mes-pfill");
		var ah;
		if (fill) ah = Math.max(160, stage.clientHeight - 12);
		else ah = Math.max(220, window.innerHeight - (up ? 250 : 200));
		// in 2D, keep the table clear of the on-table buttons (power bar on the right, HIT / aim strip below, the top row)
		var ovOn = ov && S.dim !== "3d" && getComputedStyle($("bl-opow")).display !== "none";
		var kk = ovOn ? Math.min((aw - 62) / dimX, (ah - 58) / dimY) : Math.min(aw / dimX, ah / dimY);
		cv.style.margin = ovOn ? "0 62px 58px 0" : "";
		var w = Math.floor(dimX * kk), h = Math.floor(dimY * kk), dpr = Math.min(2.5, window.devicePixelRatio || 1);
		cv.style.width = w + "px"; cv.style.height = h + "px";
		cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		LY = { k: kk, w: w, h: h, dpr: dpr, up: up, cx: w / 2, cy: h / 2, cush: cush, wood: wood, T: T, Lo: Lo, Wo: Wo };
		staticCv = null; sprites = {};
		if (S.dim === "3d" && v3) {
			var portrait = aw < 620 && window.innerHeight > window.innerWidth * 1.15;
			var h3 = fill ? ah : Math.min(ah, Math.round(aw * (portrait ? 1.05 : 0.58)));
			v3.size(Math.floor(aw), Math.floor(Math.max(200, h3)));
		}
		draw();
		// the on-table buttons switch to a compact layout on small tables
		if (!ov) return;
		var sr = stage.getBoundingClientRect();
		ov.classList.toggle("is-narrow", sr.width < 520);
		ov.classList.toggle("is-short", sr.height < 520);
	}
	function w2s(x, y) { return LY.up ? [LY.cx + y * LY.k, LY.cy - x * LY.k] : [LY.cx + x * LY.k, LY.cy + y * LY.k]; }
	function s2w(px, py) { return LY.up ? [(LY.cy - py) / LY.k, (px - LY.cx) / LY.k] : [(px - LY.cx) / LY.k, (py - LY.cy) / LY.k]; }
	function buildStatic() {
		var T = LY.T, G = B.geometry(T), c = document.createElement("canvas");
		c.width = cv.width; c.height = cv.height;
		var g = c.getContext("2d"), k = LY.k;
		g.scale(LY.dpr, LY.dpr);
		var rect = function (x0, y0, x1, y1) { var a = w2s(x0, y0), b = w2s(x1, y1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]; };
		var L = T.L / 2, W = T.W / 2, e = LY.cush + LY.wood;
		// wood frame
		var r0 = rect(-L - e, -W - e, L + e, W + e), wg = g.createLinearGradient(r0[0], r0[1], r0[0] + r0[2], r0[1] + r0[3]);
		wg.addColorStop(0, "#6b3a1e"); wg.addColorStop(0.5, "#8a4d27"); wg.addColorStop(1, "#5a2f17");
		g.fillStyle = wg; roundRect(g, r0[0], r0[1], r0[2], r0[3], 0.05 * k); g.fill();
		g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 2; g.stroke();
		// cloth (incl. cushions)
		var cl = CLOTH[S.cloth] || CLOTH.green;
		var r1 = rect(-L - LY.cush, -W - LY.cush, L + LY.cush, W + LY.cush);
		g.fillStyle = cl[1]; g.fillRect(r1[0], r1[1], r1[2], r1[3]);
		var r2 = rect(-L, -W, L, W), cg = g.createRadialGradient(LY.cx, LY.cy, 10, LY.cx, LY.cy, Math.max(r2[2], r2[3]) * 0.7);
		cg.addColorStop(0, shade(cl[0], 18)); cg.addColorStop(1, cl[0]);
		g.fillStyle = cg; g.fillRect(r2[0], r2[1], r2[2], r2[3]);
		// cushion noses (a darker line)
		g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = Math.max(1, 0.006 * k);
		G.segs.forEach(function (sg) { var a = w2s(sg[0], sg[1]), b = w2s(sg[2], sg[3]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
		// pockets
		G.pockets.forEach(function (q) {
			var corner = q[2], rr = (corner ? T.mc * 0.62 : T.ms * 0.55) * k;
			var ox = corner ? (q[0] > 0 ? 1 : -1) * T.mc * 0.18 : 0, oy = (q[1] > 0 ? 1 : -1) * (corner ? T.mc * 0.18 : T.ms * 0.28);
			var p = w2s(q[0] + ox, q[1] + oy);
			var pg = g.createRadialGradient(p[0], p[1], rr * 0.2, p[0], p[1], rr);
			pg.addColorStop(0, "#000"); pg.addColorStop(1, "#1a1a1a");
			g.fillStyle = pg; g.beginPath(); g.arc(p[0], p[1], rr, 0, 7); g.fill();
			g.strokeStyle = "#c0a060"; g.lineWidth = Math.max(1, 0.008 * k); g.stroke();
		});
		// diamonds (sights)
		g.fillStyle = "#f3e7c8";
		var dz = LY.cush + LY.wood * 0.5;
		for (var i = 1; i < 8; i++) if (i !== 4) { var xx = -L + T.L * i / 8; dot(xx, -W - dz); dot(xx, W + dz); }
		for (i = 1; i < 4; i++) { var yy = -W + T.W * i / 4; dot(-L - dz, yy); dot(L + dz, yy); }
		function dot(x, y) { var p = w2s(x, y); g.beginPath(); g.arc(p[0], p[1], Math.max(1.6, 0.009 * k), 0, 7); g.fill(); }
		// markings
		g.strokeStyle = "rgba(255,255,255,0.32)"; g.fillStyle = "rgba(255,255,255,0.55)"; g.lineWidth = Math.max(1, 0.003 * k);
		if (T.id === "snooker") {
			var bx = -L + T.baulk, a1 = w2s(bx, -W), a2 = w2s(bx, W);
			g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.stroke();
			var c0 = w2s(bx, 0);
			g.beginPath();
			if (LY.up) g.arc(c0[0], c0[1], T.dR * k, 0, Math.PI); else g.arc(c0[0], c0[1], T.dR * k, Math.PI / 2, Math.PI * 1.5);
			g.stroke();
			var sp = B.spots(T);
			for (var v = 2; v <= 7; v++) { var sq = w2s(sp[v][0], sp[v][1]); g.beginPath(); g.arc(sq[0], sq[1], Math.max(1.2, 0.006 * k), 0, 7); g.fill(); }
		} else {
			var hx = -T.L / 4, h1 = w2s(hx, -W), h2 = w2s(hx, W);
			g.setLineDash([4, 6]); g.beginPath(); g.moveTo(h1[0], h1[1]); g.lineTo(h2[0], h2[1]); g.stroke(); g.setLineDash([]);
			var fs = w2s(T.L / 4, 0), hs = w2s(-T.L / 4, 0);
			g.beginPath(); g.arc(fs[0], fs[1], Math.max(1.5, 0.007 * k), 0, 7); g.fill();
			g.beginPath(); g.arc(hs[0], hs[1], Math.max(1.5, 0.007 * k), 0, 7); g.fill();
		}
		// brand
		g.fillStyle = "rgba(255,255,255,0.08)"; g.font = "700 " + Math.round(0.07 * k) + "px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
		var mp = w2s(T.id === "snooker" ? 0.5 : 0.3, 0);
		g.save(); g.translate(mp[0], mp[1]); if (LY.up) g.rotate(-Math.PI / 2); g.fillText("mes.fm", 0, 0); g.restore();
		staticCv = c;
	}
	function shade(hex, amt) {
		var n = parseInt(hex.slice(1), 16), r = Math.min(255, Math.max(0, (n >> 16) + amt)), gg = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt)), b = Math.min(255, Math.max(0, (n & 255) + amt));
		return "rgb(" + r + "," + gg + "," + b + ")";
	}
	function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
	function sprite(kind) {
		var key = kind + (S.nums ? "b" : "");
		if (sprites[key]) return sprites[key];
		var snooker = st.g.table === "snooker", R = st.T.R * LY.k * LY.dpr, size = Math.ceil(R * 2 + 4), c = document.createElement("canvas");
		c.width = c.height = size;
		var g = c.getContext("2d"), m = size / 2, col = ballColor(kind, snooker);
		g.beginPath(); g.arc(m, m, R, 0, 7); g.closePath();
		if (!snooker && kind > 8) {
			g.fillStyle = "#f8f8f2"; g.fill();
			g.save(); g.clip(); g.fillStyle = col; g.fillRect(m - R, m - R * 0.55, R * 2, R * 1.1); g.restore();
		} else { g.fillStyle = col; g.fill(); }
		if (!snooker && kind > 0) {
			var nr = R * (S.nums ? 0.62 : 0.48);
			g.fillStyle = "#fff"; g.beginPath(); g.arc(m, m, nr, 0, 7); g.fill();
			g.fillStyle = "#111"; g.font = "700 " + Math.round(nr * (kind > 9 ? 1.1 : 1.3)) + "px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
			g.fillText(String(kind), m, m + nr * 0.07);
		}
		if (kind === 0 && !snooker) { g.fillStyle = "rgba(200,30,30,0.6)"; g.beginPath(); g.arc(m, m, R * 0.12, 0, 7); g.fill(); }
		// shading
		var sh = g.createRadialGradient(m - R * 0.38, m - R * 0.42, R * 0.08, m, m, R);
		sh.addColorStop(0, "rgba(255,255,255,0.75)"); sh.addColorStop(0.22, "rgba(255,255,255,0.12)"); sh.addColorStop(0.7, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.42)");
		g.beginPath(); g.arc(m, m, R, 0, 7); g.fillStyle = sh; g.fill();
		g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = Math.max(1, R * 0.05); g.stroke();
		sprites[key] = c;
		return c;
	}
	var needed = false;
	function need() { if (!needed) { needed = true; requestAnimationFrame(function () { needed = false; draw(); }); } }
	function positions() {
		if (!anim || !anim.playing) return null;
		var f = anim.frames, idx = anim.idx, i0 = Math.min(f.length - 1, Math.floor(idx)), i1 = Math.min(f.length - 1, i0 + 1), t = idx - Math.floor(idx);
		return { a: f[i0], b: f[i1], t: i0 === i1 ? 0 : t };
	}
	function ballXY() {
		var P = positions(), n = st.n, xs = [], ys = [], ons = [], zs = [], i;
		for (i = 0; i < n; i++) {
			if (P) { var ax = P.a[i * 4], bx = P.b[i * 4]; xs.push(ax + (bx - ax) * P.t); ys.push(P.a[i * 4 + 1] + (P.b[i * 4 + 1] - P.a[i * 4 + 1]) * P.t); ons.push(P.t < 0.5 ? P.a[i * 4 + 2] : P.b[i * 4 + 2]); zs.push(P.a[i * 4 + 3] + (P.b[i * 4 + 3] - P.a[i * 4 + 3]) * P.t); }
			else if (anim && anim.pre) { xs.push(anim.pre[i * 4]); ys.push(anim.pre[i * 4 + 1]); ons.push(anim.pre[i * 4 + 2]); zs.push(0); }
			else { xs.push(st.x[i]); ys.push(st.y[i]); ons.push(st.on[i]); zs.push(0); }
		}
		return { xs: xs, ys: ys, ons: ons, zs: zs };
	}
	function draw3() {
		var P = ballXY(), xs = P.xs, ys = P.ys, ons = P.ons;
		var aiming = !anim && (canShoot() || cpuAim);
		if (aiming && st.bih && place) { xs[0] = place[0]; ys[0] = place[1]; ons[0] = 1; }
		var c0 = [xs[0], ys[0]], d = B.dirOf(aim), info = { xs: xs, ys: ys, ons: ons, zs: P.zs, c0: c0, dir: [d.x, d.y], phase: anim ? "anim" : "aim" };
		if (anim && anim.shotDir) { info.shotDir = anim.shotDir; info.shotC0 = anim.shotC0; }
		if (aiming && effGuide() !== "off" && !cpuAim) info.guide = guideShapes(c0);
		if ((aiming && ons[0]) || (anim && anim.strike !== undefined)) {
			var pull = anim && anim.strike !== undefined ? (0.03 + 0.27 * power / 1000) * (1 - anim.strike) : 0.03 + 0.27 * power / 1000;
			info.cue = { x: c0[0], y: c0[1], dx: d.x, dy: d.y, pull: pull, el: elev };
		}
		if (aiming && st.bih && place) info.place = { x: place[0], y: place[1], ok: B.placeOk(st, place[0], place[1]) };
		v3.setTable(st, S.cloth, S.nums);
		v3.frame(info);
	}
	function draw() {
		if (!LY || !st) return;
		if (S.dim === "3d" && v3) return draw3();
		if (!staticCv) buildStatic();
		var g = ctx, k = LY.k, R = st.T.R;
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.clearRect(0, 0, cv.width, cv.height);
		g.drawImage(staticCv, 0, 0);
		g.setTransform(LY.dpr, 0, 0, LY.dpr, 0, 0);
		var P = positions(), n = st.n, xs = [], ys = [], ons = [], zs = [], i;
		for (i = 0; i < n; i++) {
			if (P) { var ax = P.a[i * 4], bx = P.b[i * 4]; xs.push(ax + (bx - ax) * P.t); ys.push(P.a[i * 4 + 1] + (P.b[i * 4 + 1] - P.a[i * 4 + 1]) * P.t); ons.push(P.t < 0.5 ? P.a[i * 4 + 2] : P.b[i * 4 + 2]); zs.push(P.a[i * 4 + 3] + (P.b[i * 4 + 3] - P.a[i * 4 + 3]) * P.t); }
			else if (anim && anim.pre) { xs.push(anim.pre[i * 4]); ys.push(anim.pre[i * 4 + 1]); ons.push(anim.pre[i * 4 + 2]); zs.push(0); }
			else { xs.push(st.x[i]); ys.push(st.y[i]); ons.push(st.on[i]); zs.push(0); }
		}
		var aiming = !anim && (canShoot() || cpuAim);
		if (aiming && st.bih && place) { xs[0] = place[0]; ys[0] = place[1]; ons[0] = 1; }
		// shadows
		g.fillStyle = "rgba(0,0,0,0.28)";
		for (i = 0; i < n; i++) if (ons[i]) { var p = w2s(xs[i], ys[i]), zo = zs[i] * k * 0.9, sh = 1 / (1 + zs[i] * 6); g.globalAlpha = sh; g.beginPath(); g.ellipse(p[0] + R * k * 0.22 + zo, p[1] + R * k * 0.28 + zo, R * k * 0.98, R * k * 0.9, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
		// the guide (under the balls)
		var c0 = [xs[0], ys[0]];
		if (aiming && effGuide() !== "off" && !cpuAim) drawGuide(g, c0);
		// balls
		var order = []; for (i = 0; i < n; i++) if (ons[i]) order.push(i);
		order.sort(function (a, b) { return zs[a] - zs[b]; });    // balls in the air are drawn on top, a little bigger (closer to you)
		order.forEach(function (j) {
			var q = w2s(xs[j], ys[j]), sp = sprite(st.k[j]), sz = sp.width / LY.dpr * (1 + zs[j] * 2.2);
			g.drawImage(sp, q[0] - sz / 2, q[1] - sz / 2, sz, sz);
		});
		if (aiming && st.bih && place) {
			var okp = B.placeOk(st, place[0], place[1]), qq = w2s(place[0], place[1]);
			g.strokeStyle = okp ? "rgba(255,255,255,0.85)" : "#ff4d4d"; g.lineWidth = 2; g.setLineDash([4, 4]);
			g.beginPath(); g.arc(qq[0], qq[1], R * k * 1.55, 0, 7); g.stroke(); g.setLineDash([]);
			if (st.zone !== "any") drawZone(g);
		}
		// the cue stick
		if ((aiming && ons[0]) || (anim && anim.strike !== undefined)) drawCue(g, c0);
	}
	function drawZone(g) {
		var T = st.T, k = LY.k;
		g.fillStyle = "rgba(255,255,255,0.07)";
		if (st.zone === "D") {
			var bx = -T.L / 2 + T.baulk, c = w2s(bx, 0);
			g.beginPath(); g.moveTo(c[0], c[1]);
			if (LY.up) g.arc(c[0], c[1], T.dR * k, 0, Math.PI); else g.arc(c[0], c[1], T.dR * k, Math.PI / 2, Math.PI * 1.5);
			g.closePath(); g.fill();
		} else {
			var a = w2s(-T.L / 2, -T.W / 2), b = w2s(-T.L / 4, T.W / 2);
			g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
		}
	}
	/* the aiming guide as plain shapes in table metres (drawn by the 2D canvas and by the 3D view):
	   lines [x1, y1, x2, y2, colour, width (m), dashed], rings [x, y, r, colour, dashed] */
	function guideShapes(c0) {
		var d = B.dirOf(aim), gd = B.guide(st, c0[0], c0[1], d.x, d.y), R = st.T.R, short = effGuide() === "short";
		var maxLen = short ? 0.32 : 9, out = { lines: [], rings: [] };
		var endT = gd.kind === "none" ? 0.5 : Math.min(gd.t, maxLen);
		out.lines.push([c0[0], c0[1], c0[0] + d.x * endT, c0[1] + d.y * endT, "rgba(255,255,255,0.75)", 0.004, true]);
		if (gd.kind === "ball" && gd.t <= maxLen) {
			var legal = B.targets(st).indexOf(gd.b) >= 0 || (st.brk && st.g.table === "pool");
			out.rings.push([gd.x, gd.y, R, legal ? "rgba(255,255,255,0.9)" : "#ff5c5c", false]);
			if (!short) {
				var ol = 0.18 + 0.75 * Math.max(0, gd.cut);
				out.lines.push([st.x[gd.b], st.y[gd.b], st.x[gd.b] + gd.ox * ol, st.y[gd.b] + gd.oy * ol, legal ? "rgba(255,240,120,0.95)" : "rgba(255,120,120,0.9)", 0.005, false]);
				var tl = 0.08 + 0.3 * Math.sqrt(Math.max(0, 1 - gd.cut * gd.cut));
				out.lines.push([gd.x, gd.y, gd.x + gd.tx * tl, gd.y + gd.ty * tl, "rgba(160,220,255,0.75)", 0.003, false]);
			}
		} else if (gd.kind === "rail" && !short) {
			out.lines.push([gd.x, gd.y, gd.x + gd.rx * 0.35, gd.y + gd.ry * 0.35, "rgba(255,255,255,0.45)", 0.003, true]);
			out.rings.push([gd.x, gd.y, R, "rgba(255,255,255,0.75)", false]);
		}
		return out;
	}
	function drawGuide(g, c0) {
		var sh = guideShapes(c0), k = LY.k;
		sh.lines.forEach(function (l) {
			var a = w2s(l[0], l[1]), b = w2s(l[2], l[3]);
			g.strokeStyle = l[4]; g.lineWidth = Math.max(1, l[5] * k); g.setLineDash(l[6] ? [6, 5] : []);
			g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
		});
		g.setLineDash([]); g.lineWidth = Math.max(1.2, 0.004 * k);
		sh.rings.forEach(function (r) { var p = w2s(r[0], r[1]); g.strokeStyle = r[3]; g.beginPath(); g.arc(p[0], p[1], r[2] * k, 0, 7); g.stroke(); });
	}
	function drawCue(g, c0) {
		var d = B.dirOf(aim), R = st.T.R, k = LY.k;
		var pull = anim && anim.strike !== undefined ? (0.03 + 0.27 * power / 1000) * (1 - anim.strike) : 0.03 + 0.27 * power / 1000;
		var s0 = R + 0.006 + pull, len = 1.45;
		var a = w2s(c0[0] - d.x * s0, c0[1] - d.y * s0), b = w2s(c0[0] - d.x * (s0 + len), c0[1] - d.y * (s0 + len));
		var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), w0 = 0.0065 * k, w1 = 0.015 * k;
		g.save(); g.translate(a[0], a[1]); g.rotate(ang);
		g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.moveTo(3, w0 + 3); g.lineTo(L + 3, w1 + 3); g.lineTo(L + 3, 3 - w1); g.lineTo(3, 3 - w0); g.fill();
		var cg = g.createLinearGradient(0, 0, L, 0);
		cg.addColorStop(0, "#5a7fb8"); cg.addColorStop(0.012, "#f1e6cf"); cg.addColorStop(0.03, "#f1e6cf"); cg.addColorStop(0.62, "#d8b27a"); cg.addColorStop(0.64, "#2b1a10"); cg.addColorStop(0.72, "#5b2e14"); cg.addColorStop(1, "#1d120b");
		g.fillStyle = cg; g.beginPath(); g.moveTo(0, -w0); g.lineTo(L, -w1); g.lineTo(L, w1); g.lineTo(0, w0); g.closePath(); g.fill();
		g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.stroke();
		g.restore();
	}

	/* ---------- playing a shot (animation + sound) ---------- */
	var FT = 33 * 0.0005;
	function show(res, done) {
		var f = res.sim.frames;
		var item = { frames: f, ev: res.sim.ev, done: done, msg: res.msg, res: res };
		lastShow = item;
		queue.push(item);
		if (!anim) nextAnim();
	}
	function nextAnim() {
		var it = queue.shift();
		if (!it) { anim = null; render(); draw(); return; }
		anim = { frames: it.frames, ev: it.ev, done: it.done, idx: 0, evi: 0, strike: 0, t0: performance.now(), playing: false, pre: it.frames[0], item: it };
		var f0 = it.frames[0], f2 = it.frames[Math.min(2, it.frames.length - 1)], ddx = f2[0] - f0[0], ddy = f2[1] - f0[1], dl = Math.sqrt(ddx * ddx + ddy * ddy);
		if (dl > 1e-6) { anim.shotDir = [ddx / dl, ddy / dl]; anim.shotC0 = [f0[0], f0[1]]; }
		power = power || 350;
		var spd = +S.speed || 1;
		var loop = function (now) {
			if (!anim || anim.frames !== it.frames) return;
			if (anim.strike !== undefined) {
				var sf = (now - anim.t0) / 140;
				if (sf >= 1) { delete anim.strike; anim.playing = true; anim.t1 = now; sound("cue", 0.35 + power / 1600); }
				else anim.strike = sf;
			} else {
				anim.idx = (now - anim.t1) / 1000 * spd / FT;
				var tNow = anim.idx * FT;
				while (anim.evi < anim.ev.length && anim.ev[anim.evi].t <= tNow) { playEv(anim.ev[anim.evi]); anim.evi++; }
				if (anim.idx >= anim.frames.length - 1) {
					var dn = anim.done; anim = null;
					if (dn) dn();
					if (queue.length) nextAnim(); else { render(); draw(); }
					return;
				}
			}
			draw();
			requestAnimationFrame(loop);
		};
		render();
		requestAnimationFrame(loop);
	}
	function skipAnim() {
		if (!anim) return;
		anim.t1 = (anim.t1 || performance.now()) - 1e7; delete anim.strike; anim.playing = true;
	}
	function replayLast() {
		if (!lastShow || anim || busy) return;
		anim = null;
		var it = lastShow, keep = { frames: it.frames, ev: it.ev, done: null, msg: it.msg, res: it.res };
		queue.push(keep); nextAnim();
	}

	/* sound (WebAudio, made on the fly) */
	var AC = null, noiseBuf = null, sndCount = 0, sndT = 0;
	function ensureAudio() {
		if (AC || !S.snd) return;
		try {
			AC = new (window.AudioContext || window.webkitAudioContext)();
			noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.25, AC.sampleRate);
			var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		} catch (e) { AC = null; }
	}
	function sound(kind, vol) {
		if (!S.snd || !AC || document.hidden) return;
		var now = AC.currentTime;
		if (now - sndT > 0.05) { sndT = now; sndCount = 0; }
		if (++sndCount > 4) return;
		vol = Math.max(0.03, Math.min(1, vol));
		var src = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
		src.buffer = noiseBuf;
		if (kind === "ball") { f.type = "bandpass"; f.frequency.value = 2600 + Math.random() * 600; f.Q.value = 2.2; gn.gain.setValueAtTime(vol * 0.9, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.05); }
		else if (kind === "rail") { f.type = "lowpass"; f.frequency.value = 380; gn.gain.setValueAtTime(vol * 0.9, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.09); }
		else if (kind === "cue") { f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 1.5; gn.gain.setValueAtTime(vol * 0.7, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.04); }
		else { f.type = "lowpass"; f.frequency.value = 220; gn.gain.setValueAtTime(0.0001, now); gn.gain.linearRampToValueAtTime(0.7, now + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.25); }
		src.connect(f); f.connect(gn); gn.connect(AC.destination);
		src.start(now); src.stop(now + 0.3);
	}
	function playEv(e) {
		if (e.e === "hit") sound("ball", e.v / 3);
		else if (e.e === "rail") sound("rail", e.v / 3.5);
		else if (e.e === "pot") sound("pot", 0.8);
	}

	/* ===================================================================== 3D view ===================================================================== */
	var v3 = null, v3busy = false, box3 = $("bl-3d");
	/* 2D <-> 3D: a still picture of the old view is laid over the stage, the views are swapped underneath at once (already at
	   their final size), and only that picture fades out. One flat image animating stays smooth even on phones, and nothing
	   jumps during the fade. 2D -> 3D then swoops the camera down from straight above to behind the cue. */
	var xf = 0;
	var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	function setDim(d, quiet) {
		if (d === "3d" && !window.BL3D) d = "2d";
		S.dim = d; save(); segSet("bl-dim", d);
		$("bl-cam").hidden = $("bl-room").hidden = d !== "3d";
		ovDim();
		var my = ++xf;
		if (d === "2d") {
			loadPill(false);
			if (v3 && !box3.hidden) crossTo(cv, box3);
			else { box3.hidden = true; cv.hidden = false; relayout(); }
			return;
		}
		if (v3) { in3(my); return; }
		if (v3busy) return;
		v3busy = true;
		var pillT = setTimeout(function () { if (my === xf) loadPill(true); }, 250);   // the 2D table stays on screen while 3D loads
		window.BL3D.create(box3).then(function (v) {
			v3busy = false; v3 = v; clearTimeout(pillT); loadPill(false);
			v3.setCam(S.cam);
			v3.roomName = S.room;
			if (my !== xf || S.dim !== "3d") return;
			in3(my);
			addHint();
		}, function (e) {
			v3busy = false; clearTimeout(pillT); loadPill(false); box3.innerHTML = ""; box3.hidden = true; cv.hidden = false;
			S.dim = "2d"; save(); segSet("bl-dim", "2d"); $("bl-cam").hidden = $("bl-room").hidden = true; ovDim();
			if (!quiet) toast("The 3D view could not start (" + ((e && e.message) || "no WebGL") + "). Showing 2D.");
			relayout();
		});
	}
	function loadPill(on) {
		var el = $("bl-opill"); if (!el) return;
		if (on) { el.textContent = "Loading the 3D view…"; el.hidden = false; el.dataset.load = "1"; }
		else if (el.dataset.load) { el.hidden = true; el.textContent = ""; delete el.dataset.load; }
	}
	function in3(my) {
		v3.forceTop = true;
		crossTo(box3, cv, function () {
			v3.flyFromTop(); draw();                                                    // straight above, the size of the 3D view...
			setTimeout(function () { if (my !== xf) return; v3.forceTop = false; draw(); }, REDUCED ? 0 : 240);   // ...then down behind the cue
		});
	}
	function crossTo(showEl, hideEl, done) {
		var snap = null, src = hideEl === box3 ? box3.querySelector("canvas") : cv;
		if (!REDUCED && src && !hideEl.hidden) {
			try {
				var r = src.getBoundingClientRect(), sr = stage.getBoundingClientRect();
				if (r.width > 20 && r.height > 20) {
					snap = document.createElement("canvas");
					snap.width = src.width; snap.height = src.height;
					snap.getContext("2d").drawImage(src, 0, 0);
					snap.className = "bl-snap";
					snap.style.left = (r.left - sr.left) + "px"; snap.style.top = (r.top - sr.top) + "px";
					snap.style.width = r.width + "px"; snap.style.height = r.height + "px";
				}
			} catch (e) { snap = null; }
		}
		if (snap) { stage.appendChild(snap); stage.classList.add("is-snap"); }
		hideEl.hidden = true; hideEl.style.opacity = "";
		showEl.hidden = false; showEl.style.opacity = "";
		if (showEl === box3) v3.setTable(st, S.cloth, S.nums);
		relayout();
		if (done) done();
		if (!snap) return;
		void snap.offsetWidth;
		snap.style.transition = "opacity 0.36s ease";
		snap.style.opacity = "0";
		setTimeout(function () { snap.remove(); if (!stage.querySelector(".bl-snap")) stage.classList.remove("is-snap"); }, 420);
	}
	// load the 3D library quietly once the page has settled, so the first switch to 3D is quick
	(function () {
		var c = navigator.connection;
		if (!window.BL3D || !window.BL3D.load || (c && (c.saveData || /2g/.test(c.effectiveType || "")))) return;
		var go = function () { (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(function () { window.BL3D.load().catch(function () {}); }, { timeout: 5000 }); };
		if (document.readyState === "complete") setTimeout(go, 2500); else window.addEventListener("load", function () { setTimeout(go, 2500); });
	})();
	function addHint() {
		var h = document.createElement("div"); h.className = "bl-3dhint";
		h.textContent = "Behind the cue: drag sideways to aim, up / down to tilt the view (Page Up / Down) · other cameras: press where to aim · right-drag or two fingers: turn the camera · Ctrl + wheel / pinch: zoom";
		box3.appendChild(h); setTimeout(function () { h.remove(); }, 7000);
	}
	segWire("bl-dim", function (v) { setDim(v); });
	$("bl-cam").addEventListener("change", function () { S.cam = this.value; save(); if (v3) { v3.setCam(S.cam); draw(); } });
	$("bl-room").addEventListener("change", function () { S.room = this.value; save(); if (v3) { v3.setRoom(S.room); draw(); } });
	function cycleCam() { var o = ["auto", "behind", "overhead", "side", "orbit"], i = (o.indexOf(S.cam) + 1) % o.length; S.cam = o[i]; save(); $("bl-cam").value = S.cam; if (v3) { v3.setCam(S.cam); draw(); } }
	function behindMode() { return S.cam === "behind" || S.cam === "auto"; }
	var d3 = null, pts3 = {};
	box3.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	box3.addEventListener("pointerdown", function (e) {
		if (!v3) return;
		ensureAudio();
		pts3[e.pointerId] = [e.clientX, e.clientY];
		box3.setPointerCapture(e.pointerId);
		var ids = Object.keys(pts3);
		if (ids.length === 2) { var a = pts3[ids[0]], b = pts3[ids[1]]; d3 = { kind: "two", dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; return; }
		if (anim) { skipAnim(); d3 = null; return; }
		if (e.button === 2 || e.shiftKey || !canShoot()) { d3 = { kind: "orbit", x: e.clientX, y: e.clientY }; return; }
		var w = v3.pick(e.clientX, e.clientY), c = cueXY();
		if (st.bih && w && Math.hypot(w[0] - c[0], w[1] - c[1]) < st.T.R * 3) { d3 = { kind: "ball", ox: c[0] - w[0], oy: c[1] - w[1] }; return; }
		if (onCue(w)) { d3 = pullStart(e.clientX, e.clientY); return; }
		if (behindMode() && S.cam !== "orbit") { d3 = { kind: "turn", x: e.clientX, y: e.clientY, a0: aim, moved: false, w: w }; return; }
		var onTable = w && Math.abs(w[0]) < st.T.L / 2 + 0.2 && Math.abs(w[1]) < st.T.W / 2 + 0.2;
		if (onTable) { d3 = { kind: "aim" }; setAimTo(w); }
		else d3 = { kind: "orbit", x: e.clientX, y: e.clientY };
		e.preventDefault();
	});
	box3.addEventListener("pointermove", function (e) {
		if (!v3 || !pts3[e.pointerId]) return;
		pts3[e.pointerId] = [e.clientX, e.clientY];
		if (!d3) return;
		if (!d3.faded && (d3.kind !== "turn" || d3.axis)) { d3.faded = true; viewDrag(true); }
		if (d3.kind === "two") {
			var ids = Object.keys(pts3); if (ids.length < 2) return;
			var a = pts3[ids[0]], b = pts3[ids[1]], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
			if (d3.dist > 10) v3.zoom(d3.dist / Math.max(10, dist));
			v3.orbit(mx - d3.mx, my - d3.my); syncCamSel();
			d3.dist = dist; d3.mx = mx; d3.my = my; draw(); return;
		}
		if (d3.kind === "orbit") { v3.orbit(e.clientX - d3.x, e.clientY - d3.y); d3.x = e.clientX; d3.y = e.clientY; syncCamSel(); draw(); return; }
		if (d3.kind === "ball") { var w = v3.pick(e.clientX, e.clientY); if (w) { place = clampPlace(w[0] + d3.ox, w[1] + d3.oy); draw(); } return; }
		if (d3.kind === "turn") {
			// the first clear movement decides: sideways = aim, up / down = tilt the camera
			var dx = e.clientX - d3.x, dy = e.clientY - d3.y;
			if (!d3.axis && (Math.abs(dx) > 7 || Math.abs(dy) > 7)) d3.axis = Math.abs(dy) > Math.abs(dx) * 1.2 ? "y" : "x";
			if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d3.moved = true;
			if (d3.axis === "y") { v3.tiltBy((d3.ly === undefined ? dy : dy - d3.ly) * 0.006); d3.ly = dy; draw(); return; }
			if (d3.axis !== "x") return;
			var per = (e.altKey ? 0.02 : 0.12) * 10000 * (d3.fine ? 0.25 : 1);
			aim = (((d3.a0 + Math.round(dx * per)) % 3600000) + 3600000) % 3600000; renderAim(); draw(); return;
		}
		if (d3.kind === "pull") { pullMove(d3, e.clientX, e.clientY); return; }
		if (d3.kind === "aim") { var w2 = v3.pick(e.clientX, e.clientY); if (w2) setAimTo(w2); }
	});
	function end3(e) {
		delete pts3[e.pointerId];
		if (!Object.keys(pts3).length) viewDrag(false);
		if (d3 && d3.kind === "pull") { var dp = d3; d3 = null; pullEnd(dp); render(); return; }
		if (d3 && d3.kind === "turn" && !d3.moved && d3.w) {
			// a tap on a ball aims straight at it
			var w = d3.w, best = -1, bd = 1e9;
			for (var i = 1; i < st.n; i++) if (st.on[i]) { var dd = Math.hypot(st.x[i] - w[0], st.y[i] - w[1]); if (dd < bd) { bd = dd; best = i; } }
			if (best > 0 && bd < st.T.R * 2.5) { var c = cueXY(); aim = B.angleOf(st.x[best] - c[0], st.y[best] - c[1]); renderAim(); draw(); }
		}
		d3 = null; render();
	}
	box3.addEventListener("pointerup", end3);
	box3.addEventListener("pointercancel", end3);
	box3.addEventListener("wheel", function (e) {
		if (!v3) return;
		if (!(e.ctrlKey || view.classList.contains("mes-pfill"))) return;
		e.preventDefault();
		v3.zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); draw();
	}, { passive: false });
	function syncCamSel() { if (v3 && v3.camMode === "orbit" && S.cam !== "orbit") { S.cam = "orbit"; save(); $("bl-cam").value = "orbit"; } }

	/* ===================================================================== music / video while playing ===================================================================== */
	function ytParse(u) {
		var m, id = "", list = "";
		try { var x = new URL(u); } catch (e) { return null; }
		var h = x.hostname.replace(/^(www|m|music)\./, "");
		if (h === "youtu.be") id = x.pathname.slice(1, 12);
		else if (h === "youtube.com" || h === "youtube-nocookie.com") {
			id = x.searchParams.get("v") || ((m = /^\/(shorts|live|embed)\/([\w-]{11})/.exec(x.pathname)) ? m[2] : "");
			list = x.searchParams.get("list") || "";
		} else return null;
		if (id && !/^[\w-]{11}$/.test(id)) id = "";
		if (list && !/^[\w-]{10,64}$/.test(list)) list = "";
		return id || list ? { id: id, list: list } : null;
	}
	function ytEmbed(y) {
		var base = "https://www.youtube-nocookie.com/embed/", q = "autoplay=1&rel=0&playsinline=1&modestbranding=1";
		if (y.id && y.list) return base + y.id + "?list=" + y.list + "&" + q;
		if (y.list) return base + "videoseries?list=" + y.list + "&loop=1&" + q;
		return base + y.id + "?loop=1&playlist=" + y.id + "&" + q;
	}
	function openWatch(u) {
		var w = window.open("/watch" + (u ? "?v=" + encodeURIComponent(u) : ""), "meswatch", "popup,width=600,height=440");
		if (!w) location.href = "/watch" + (u ? "?v=" + encodeURIComponent(u) : "");
		toast("MES Watch opened in its own window: leave it open and come back here to play.");
	}
	function musRender() {
		$("bl-musrec").innerHTML = (S.mus || []).map(function (r, i) { return '<button type="button" data-mi="' + i + '" title="' + esc(r.u) + '">▶ ' + esc(r.t) + "</button>"; }).join("");
	}
	function musLabel(u, y) { if (!y) { try { return new URL(u).hostname.replace(/^www\./, "") + new URL(u).pathname.slice(0, 18); } catch (e) { return u.slice(0, 30); } } return y.list && !y.id ? "YouTube playlist" : "YouTube " + y.id; }
	function musPlay(u) {
		u = String(u || "").trim();
		if (!u) return toast("Paste a link first.");
		if (!/^https?:\/\//i.test(u)) u = "https://" + u;
		var y = ytParse(u);
		S.mus = [{ u: u, t: musLabel(u, y) }].concat((S.mus || []).filter(function (r) { return r.u !== u; })).slice(0, 6); save(); musRender();
		if (!y) return openWatch(u);
		var mp = $("bl-mp");
		$("bl-mpv").innerHTML = '<iframe src="' + esc(ytEmbed(y)) + '" title="Music while you play" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
		$("bl-mpt").textContent = musLabel(u, y);
		mp.hidden = false; mp.classList.remove("is-min"); mp.classList.toggle("is-big", !!S.mpBig);
	}
	function musToggle() {
		var p = $("bl-muspanel"), open = p.hidden;
		p.hidden = !open; $("bl-mus").setAttribute("aria-expanded", open ? "true" : "false");
		if (open) { musRender(); setTimeout(function () { $("bl-musurl").focus(); }, 0); }
	}
	$("bl-mus").addEventListener("click", musToggle);
	$("bl-musform").addEventListener("submit", function (e) { e.preventDefault(); musPlay($("bl-musurl").value); });
	$("bl-muswatch").addEventListener("click", function () { openWatch(""); });
	$("bl-musrec").addEventListener("click", function (e) { var b = e.target.closest("[data-mi]"); if (b) { var r = S.mus[+b.getAttribute("data-mi")]; if (r) { $("bl-musurl").value = r.u; musPlay(r.u); } } });
	$("bl-mpclose").addEventListener("click", function () { $("bl-mpv").innerHTML = ""; $("bl-mp").hidden = true; });
	$("bl-mpmin").addEventListener("click", function () { $("bl-mp").classList.toggle("is-min"); });
	$("bl-mpsize").addEventListener("click", function () { S.mpBig = !S.mpBig; save(); $("bl-mp").classList.toggle("is-big", S.mpBig); $("bl-mp").classList.remove("is-min"); });
	(function () {   // drag the mini player by its bar
		var bar = document.querySelector("#bl .bl-mpbar"), mp = $("bl-mp"), dg = null;
		bar.addEventListener("pointerdown", function (e) {
			if (e.target.closest("button")) return;
			var r = mp.getBoundingClientRect(); dg = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); e.preventDefault();
		});
		bar.addEventListener("pointermove", function (e) {
			if (!dg) return;
			var x = Math.max(0, Math.min(window.innerWidth - mp.offsetWidth, e.clientX - dg.dx)), y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dg.dy));
			mp.style.left = x + "px"; mp.style.top = y + "px"; mp.style.right = "auto"; mp.style.bottom = "auto";
		});
		bar.addEventListener("pointerup", function () { dg = null; });
	})();

	/* ===================================================================== on-table controls (phones, Fill window, full screen) ===================================================================== */
	var ov = document.createElement("div");
	ov.className = "bl-ov"; ov.id = "bl-ov";
	ov.innerHTML = '<div class="bl-ochip" id="bl-ochip" aria-live="polite"></div>' +
		'<div class="bl-otop"><button type="button" data-ov="guide" class="bl-oguide" title="Aiming guide: full, short or off (G)">Guide</button><button type="button" data-ov="dim" title="Switch 2D / 3D (V)">3D</button><button type="button" data-ov="cam" title="Next camera (K)">🎥</button><button type="button" data-ov="help" title="How to shoot">?</button><button type="button" data-ov="fill" title="Fill the window">⤢</button></div>' +
		'<div class="bl-opow" id="bl-opow" role="slider" aria-label="Power: drag down to pull the cue back, let go to shoot" aria-valuemin="1" aria-valuemax="100"><div class="bl-opowfill" id="bl-opowfill"></div><span class="bl-opowt">PULL<br>↓</span><span class="bl-opowv" id="bl-opowv"></span></div>' +
		'<div class="bl-opill" id="bl-opill" hidden></div>' +
		'<button type="button" class="bl-ospin" id="bl-ospin" title="Spin: drag the red dot, or tap for the big picker and jump shots"><canvas class="bl-spincv" width="96" height="96"></canvas></button>' +
		'<div class="bl-jog bl-ojog" id="bl-ojog" role="slider" tabindex="0" aria-label="Aim: drag left or right to turn the cue (slow = fine, fast = big turns)"><span class="bl-jogt"></span><span class="bl-jogm"></span><span class="bl-jogl">◀ drag to aim ▶</span></div>' +
		'<button type="button" class="bl-ohit" id="bl-ohit" title="Tap to shoot at the set power, or hold to charge the power and let go">HIT<small>hold = charge</small></button>' +
		'<div class="bl-ospinpop" id="bl-ospinpop" hidden><div class="bl-sphead"><b>Spin &amp; jump</b><button type="button" data-sp="flip" title="Move this box to the other side">⇄</button><button type="button" data-sp="x" title="Close">✕</button></div>' +
		'<div class="bl-spbody"><div class="bl-spl"><canvas class="bl-spincv" width="240" height="240"></canvas><span id="bl-ospinlab"></span></div>' +
		'<div class="bl-spr"><div class="bl-ospinbtns"><button type="button" data-sp="0,0">Centre</button><button type="button" data-sp="0,60">Follow</button><button type="button" data-sp="0,-60">Draw</button><button type="button" data-sp="-60,0">Left</button><button type="button" data-sp="60,0">Right</button><button type="button" data-sp="x">Done</button></div>' +
		'<label class="bl-oelev">Cue up (jump): <b class="bl-elevv">flat</b><input type="range" class="bl-elev" min="0" max="60" step="1" value="0" aria-label="Cue elevation for jump shots"></label>' +
		'<div class="bl-jog bl-pjog" role="slider" tabindex="0" aria-label="Aim: drag left or right to turn the cue"><span class="bl-jogt"></span><span class="bl-jogm"></span><span class="bl-jogl">◀ aim ▶</span></div></div></div></div>' +
		'<div class="bl-ohelp" id="bl-ohelp" hidden><b>How to shoot</b><ol><li><b>Aim:</b> drag the <b>aim strip</b> at the bottom left or right (slowly = a hair at a time), or press on the table and drag. The dotted line shows where the white ball goes.' + '<span class="bl-o3d"> In 3D behind the cue, dragging on the table sideways also aims, up / down looks higher or lower.</span></li>' +
		'<li><b>Shoot (easiest):</b> press on the <b>cue stick</b> (or the white ball) and <b>pull back</b>. The further you pull, the harder the shot. <b>Let go to shoot</b>, or slide back to where you started to cancel.</li><li><b>Or:</b> pull the bar on the right <b>down</b> (like pulling the cue back) and <b>let go to shoot</b>. Or <b>hold HIT</b>: the power goes up and down, let go when it is right. A quick tap on HIT shoots at the power already set.</li>' +
		'<li><b>Spin:</b> drag the red dot on the little white ball (bottom left), or tap it for the big picker. Top = the white ball keeps rolling after the hit, bottom = it comes back, sides = side spin off the cushions.</li>' +
		'<li><b>Jump shot:</b> in the big spin picker raise the cue (30 to 50° jumps a ball in the way; hit firmly). Too hard and steep and the white ball can fly off the table, which is a foul.</li><li><b>Guide:</b> the Guide button top right switches the aiming line full / short / off.</li><li><b>Ball in hand:</b> after a foul, drag the white ball to where you want it first.</li></ol><button type="button" class="bl-vb bl-vb--main" data-ov="helpok">Got it</button></div>';
	stage.appendChild(ov);
	drawSpin();
	function ovDim() { if (!ov) return; var b = ov.querySelector('[data-ov="dim"]'); if (b) b.textContent = S.dim === "3d" ? "2D" : "3D"; ov.querySelector('[data-ov="cam"]').hidden = S.dim !== "3d"; }
	ovDim();
	function showHelp(on) { $("bl-ohelp").hidden = !on; if (!on) { S.helpSeen = 1; save(); } }
	ov.addEventListener("click", function (e) {
		var b = e.target.closest("[data-ov]"); if (!b) return;
		var a = b.getAttribute("data-ov");
		if (a === "dim") setDim(S.dim === "3d" ? "2d" : "3d");
		else if (a === "cam") cycleCam();
		else if (a === "guide") cycleGuide();
		else if (a === "help") showHelp($("bl-ohelp").hidden);
		else if (a === "helpok") showHelp(false);
		else if (a === "fill") panelBtn(0);
	});
	// no text selection / "Copy, Select all" menu when a button is held down (HIT charges by holding)
	ov.addEventListener("contextmenu", function (e) { if (!e.target.closest("input")) e.preventDefault(); });
	ov.addEventListener("selectstart", function (e) { if (!e.target.closest("input")) e.preventDefault(); });
	// while the table / camera is being dragged, the buttons fade and ignore touches (so a finger can't hit HIT by accident)
	function viewDrag(on) { ov.classList.toggle("is-viewdrag", !!on); }
	// the vertical power bar: drag down = more power, let go = shoot
	var opow = $("bl-opow"), opDrag = false;
	function opowFrom(e) { var r = opow.getBoundingClientRect(); power = Math.max(10, Math.min(1000, (e.clientY - r.top) / r.height * 1000)); renderPower(); need(); }
	opow.addEventListener("pointerdown", function (e) { ensureAudio(); if (!canShoot()) return; opDrag = true; opow.classList.add("is-drag"); opow.setPointerCapture(e.pointerId); opowFrom(e); e.preventDefault(); e.stopPropagation(); });
	opow.addEventListener("pointermove", function (e) { if (opDrag) opowFrom(e); });
	opow.addEventListener("pointerup", function () { if (!opDrag) return; opDrag = false; opow.classList.remove("is-drag"); S.power = Math.round(power); save(); if (S.rel && canShoot() && power > 15) shoot(); });
	opow.addEventListener("pointercancel", function () { opDrag = false; opow.classList.remove("is-drag"); });
	// HIT: a tap shoots, holding charges (the power swings up and down) and letting go shoots
	var hit = $("bl-ohit"), ch = null;
	hit.addEventListener("pointerdown", function (e) {
		ensureAudio();
		if (anim) { skipAnim(); return; }
		if (!canShoot()) return;
		hit.setPointerCapture(e.pointerId); e.preventDefault();
		ch = { t0: performance.now(), on: false };
		ch.timer = setTimeout(function () {
			if (!ch) return;
			ch.on = true; ch.start = performance.now(); hit.classList.add("is-charge");
			var tick = function () { if (!ch || !ch.on) return; var ph = ((performance.now() - ch.start) / 1500) % 2; power = 20 + 980 * (ph < 1 ? ph : 2 - ph); renderPower(); need(); requestAnimationFrame(tick); };
			tick();
		}, 230);
	});
	function hitEnd(fire) { if (!ch) return; clearTimeout(ch.timer); ch = null; hit.classList.remove("is-charge"); if (fire && canShoot()) { S.power = Math.round(power); save(); shoot(); } }
	hit.addEventListener("pointerup", function () { hitEnd(true); });
	hit.addEventListener("pointercancel", function () { hitEnd(false); });
	// spin: drag on the small ball sets the spin straight away; a tap opens the big picker (spin, jump, fine aim)
	var spop = $("bl-ospinpop"), ospin = $("bl-ospin"), osd = null;
	function spinPop(on) { spop.hidden = !on; ov.classList.toggle("is-spinpop", on); spop.classList.toggle("is-right", !!S.spRight); drawSpin(); }
	ospin.addEventListener("pointerdown", function (e) { if (e.button > 0) return; osd = { x: e.clientX, y: e.clientY, moved: false }; ospin.setPointerCapture(e.pointerId); e.preventDefault(); });
	ospin.addEventListener("pointermove", function (e) {
		if (!osd) return;
		if (!osd.moved && Math.hypot(e.clientX - osd.x, e.clientY - osd.y) > 5) osd.moved = true;
		if (osd.moved && canShoot()) spinFrom(e, ospin.querySelector("canvas"));
	});
	ospin.addEventListener("pointerup", function () { var d = osd; osd = null; if (d && !d.moved) spinPop(spop.hidden); });
	ospin.addEventListener("pointercancel", function () { osd = null; });
	ospin.addEventListener("click", function (e) { e.preventDefault(); });
	var bigSpin = spop.querySelector("canvas"), bsDrag = false;
	bigSpin.addEventListener("pointerdown", function (e) { if (!canShoot()) return; bsDrag = true; bigSpin.setPointerCapture(e.pointerId); spinFrom(e, bigSpin); e.preventDefault(); });
	bigSpin.addEventListener("pointermove", function (e) { if (bsDrag) spinFrom(e, bigSpin); });
	bigSpin.addEventListener("pointerup", function () { bsDrag = false; });
	bigSpin.addEventListener("dblclick", function () { spin = { x: 0, y: 0 }; drawSpin(); need(); });
	spop.addEventListener("click", function (e) {
		var b = e.target.closest("[data-sp]"); if (!b) return;
		var v = b.getAttribute("data-sp");
		if (v === "x") { spinPop(false); return; }
		if (v === "flip") { S.spRight = !S.spRight; save(); spinPop(true); return; }
		var p = v.split(","); spin = { x: +p[0], y: +p[1] }; drawSpin(); need();
	});

	/* ---------- the aim strip ("jog"): drag left / right to turn the cue. Slow = a hair at a time, fast = big turns. ---------- */
	function makeJog(el) {
		var jd = null, tk = el.querySelector(".bl-jogt");
		el.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return;
			ensureAudio();
			if (!canShoot()) { if (anim) skipAnim(); return; }
			jd = { x: e.clientX, t: performance.now(), acc: 0 };
			el.setPointerCapture(e.pointerId); el.classList.add("is-drag"); e.preventDefault(); e.stopPropagation();
		});
		el.addEventListener("pointermove", function (e) {
			if (!jd) return;
			var now = performance.now(), dx = e.clientX - jd.x, dt = Math.max(8, now - jd.t), v = Math.abs(dx) / dt;   // px per ms
			// 0.025 degrees per pixel when slow (40 px = 1 degree), up to ~0.4 degrees per pixel on a quick swipe
			var degPx = 0.025 + 0.38 * Math.pow(Math.min(1, v / 2.2), 2) * (e.shiftKey ? 0.2 : 1);
			nudgeAim(Math.round(dx * degPx * 10000));
			jd.acc += dx; jd.x = e.clientX; jd.t = now;
			jogPaint();
		});
		var up = function () { if (!jd) return; jd = null; el.classList.remove("is-drag"); };
		el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
		el.addEventListener("keydown", function (e) {
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault(); e.stopPropagation();
			if (canShoot()) nudgeAim((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10000 : 500));
		});
		jogs.push(tk);
	}
	var jogs = [];
	function jogPaint() { var off = ((aim / 10000) * 18) % 36; jogs.forEach(function (t) { if (t) t.style.backgroundPositionX = (-off).toFixed(1) + "px"; }); }
	root.querySelectorAll(".bl-jog").forEach(makeJog);
	if (!S.helpSeen) setTimeout(function () { showHelp(true); }, 600);

	/* ---------- grab the cue and pull it back: the further you pull, the harder; let go to shoot, slide back to cancel ---------- */
	function onCue(w) {
		if (!w || !canShoot()) return false;
		var c = cueXY(), d = B.dirOf(aim), rx = w[0] - c[0], ry = w[1] - c[1], R = st.T.R;
		if (!st.bih && Math.hypot(rx, ry) < R * 2.3) return true;              // the white ball itself
		var along = -(rx * d.x + ry * d.y), lat = Math.abs(rx * d.y - ry * d.x);   // the stick behind it
		return along > R * 1.2 && along < 1.2 && lat < Math.max(0.05, R * 1.8);
	}
	function pullStart(x, y) { ensureAudio(); return { kind: "pull", sx: x, sy: y, p0: power, dist: 0 }; }
	function pullMove(d, x, y) {
		d.dist = Math.hypot(x - d.sx, y - d.sy);
		var sz = Math.min(stage.clientWidth || 400, stage.clientHeight || 300);
		power = Math.max(10, Math.min(1000, d.dist / (0.42 * sz) * 1000));
		renderPower(); pullTip(d.dist > 12 ? "Power " + Math.round(power / 10) + "% · let go to shoot · slide back to cancel" : "Slide away from the ball to pull the cue back"); need();
	}
	function pullEnd(d) {
		pullTip("");
		if (d.dist > 12 && power >= 25 && canShoot()) { S.power = Math.round(power); save(); shoot(); }
		else { power = d.p0; renderPower(); need(); }
	}
	function pullTip(t) { var el = $("bl-opill"); if (!el) return; el.textContent = t; el.hidden = !t; }

	/* ===================================================================== input ===================================================================== */
	var drag = null;
	function evXY(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
	cv.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		ensureAudio();
		if (anim) { skipAnim(); return; }
		if (!canShoot()) return;
		var p = evXY(e), w = s2w(p[0], p[1]), c = cueXY();
		cv.setPointerCapture(e.pointerId);
		if (st.bih && Math.hypot(w[0] - c[0], w[1] - c[1]) < st.T.R * 2.4) {
			drag = { kind: "ball", ox: c[0] - w[0], oy: c[1] - w[1] };
			cv.classList.add("is-dragball");
		} else if (onCue(w)) {
			drag = pullStart(e.clientX, e.clientY);
		} else {
			drag = { kind: "aim" };
			setAimTo(w);
		}
		e.preventDefault();
	});
	cv.addEventListener("pointermove", function (e) {
		var p = evXY(e), w = s2w(p[0], p[1]);
		if (drag && !drag.faded) { drag.faded = true; viewDrag(true); }
		if (!drag) {
			if (canShoot() && st.bih && LY) { var c = cueXY(); cv.classList.toggle("is-place", Math.hypot(w[0] - c[0], w[1] - c[1]) < st.T.R * 2.4); }
			return;
		}
		if (drag.kind === "ball") {
			place = clampPlace(w[0] + drag.ox, w[1] + drag.oy);
			need();
		} else if (drag.kind === "pull") pullMove(drag, e.clientX, e.clientY);
		else setAimTo(w);
	});
	function endDrag() { viewDrag(false); if (drag) { var d0 = drag; drag = null; cv.classList.remove("is-dragball"); if (d0.kind === "pull") pullEnd(d0); render(); } }
	cv.addEventListener("pointerup", endDrag);
	cv.addEventListener("pointercancel", endDrag);
	function clampPlace(x, y) {
		var T = st.T, R = T.R, L = T.L / 2 - R * 1.01, W = T.W / 2 - R * 1.01;
		x = Math.max(-L, Math.min(L, x)); y = Math.max(-W, Math.min(W, y));
		if (st.zone === "kitchen") x = Math.min(x, -T.L / 4);
		if (st.zone === "D") {
			var bx = -T.L / 2 + T.baulk; x = Math.min(x, bx);
			var dx = x - bx, dd = Math.sqrt(dx * dx + y * y), lim = T.dR * 0.999;
			if (dd > lim) { x = bx + dx / dd * lim; y = y / dd * lim; }
		}
		return [x, y];
	}
	function setAimTo(w) {
		var c = cueXY(), dx = w[0] - c[0], dy = w[1] - c[1];
		if (dx * dx + dy * dy < 1e-6) return;
		aim = B.angleOf(dx, dy);
		renderAim(); need();
	}
	function nudgeAim(units) { aim = ((aim + units) % 3600000 + 3600000) % 3600000; renderAim(); need(); }
	function renderAim() { $("bl-aimv").textContent = (((360 - aim / 10000) % 360 + 360) % 360).toFixed(2) + "°"; jogPaint(); }
	// fine aim buttons (hold to repeat)
	root.querySelectorAll(".bl-fine").forEach(function (b) {
		var t = null, rep = function (first) { nudgeAim(+b.getAttribute("data-fine") * (window.event && window.event.shiftKey ? 5000 : 500)); t = setTimeout(rep, first ? 380 : 60); };
		b.addEventListener("pointerdown", function (e) { e.preventDefault(); if (!canShoot()) return; rep(true); });
		["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, function () { clearTimeout(t); }); });
	});

	/* power bar */
	var pow = $("bl-pow"), powDrag = false;
	function renderPower() {
		var pc = Math.max(1, Math.round(power / 10));
		$("bl-powfill").style.width = (power / 10) + "%"; $("bl-powknob").style.left = (power / 10) + "%";
		$("bl-powv").textContent = pc + "%"; pow.setAttribute("aria-valuenow", pc);
		var of = $("bl-opowfill"); if (of) { of.style.height = (power / 10) + "%"; $("bl-opowv").textContent = pc + "%"; }
	}
	function powFrom(e) { var r = pow.getBoundingClientRect(); power = Math.max(10, Math.min(1000, (e.clientX - r.left) / r.width * 1000)); renderPower(); need(); }
	pow.addEventListener("pointerdown", function (e) { ensureAudio(); if (!canShoot() && !cpuAim) { if (!canShoot()) return; } powDrag = true; pow.classList.add("is-drag"); pow.setPointerCapture(e.pointerId); powFrom(e); e.preventDefault(); });
	pow.addEventListener("pointermove", function (e) { if (powDrag) powFrom(e); });
	pow.addEventListener("pointerup", function () { if (!powDrag) return; powDrag = false; pow.classList.remove("is-drag"); S.power = Math.round(power); save(); if (S.rel && canShoot()) shoot(); });
	pow.addEventListener("pointercancel", function () { powDrag = false; pow.classList.remove("is-drag"); });
	pow.addEventListener("keydown", function (e) {
		var s = e.shiftKey ? 100 : 20;
		if (e.key === "ArrowRight" || e.key === "ArrowUp") { power = Math.min(1000, power + s); }
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { power = Math.max(10, power - s); }
		else if (e.key === "Enter") { shoot(); }
		else return;
		e.preventDefault(); e.stopPropagation(); renderPower(); need();
	});
	$("bl-shoot").addEventListener("click", function () { shoot(); });

	/* spin */
	var spinCv = $("bl-spin"), sctx = spinCv.getContext("2d"), spinDrag = false;
	function drawSpin() {
		[spinCv].concat(Array.prototype.slice.call(root.querySelectorAll(".bl-spincv"))).filter(Boolean).forEach(drawSpinOn);
		var lab = [];
		if (spin.y > 8) lab.push("Follow " + Math.round(spin.y) + "%"); else if (spin.y < -8) lab.push("Draw " + Math.round(-spin.y) + "%");
		if (spin.x > 8) lab.push("Right " + Math.round(spin.x) + "%"); else if (spin.x < -8) lab.push("Left " + Math.round(-spin.x) + "%");
		if (elev > 0) lab.push("Jump " + Math.round(elev) + "°");
		var txt = lab.length ? lab.join(", ") : "Centre (no spin)";
		$("bl-spinl").textContent = txt;
		var pl = $("bl-ospinlab"); if (pl) pl.textContent = txt;
	}
	function drawSpinOn(cvs) {
		var g = cvs.getContext("2d"), W = cvs.width, m = W / 2, R = W * 0.44;
		g.clearRect(0, 0, W, W);
		var gr = g.createRadialGradient(m - R * 0.35, m - R * 0.4, R * 0.1, m, m, R);
		gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#c9ccd1");
		g.fillStyle = gr; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
		g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2; g.stroke();
		g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1.5;
		g.beginPath(); g.moveTo(m - R, m); g.lineTo(m + R, m); g.moveTo(m, m - R); g.lineTo(m, m + R); g.stroke();
		g.beginPath(); g.arc(m, m, R * 0.5, 0, 7); g.stroke();
		var px = m + spin.x / 100 * R * 0.88, py = m - spin.y / 100 * R * 0.88;
		g.fillStyle = "#e03131"; g.beginPath(); g.arc(px, py, W * 0.075, 0, 7); g.fill();
		g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
	}
	function spinFrom(e, el) {
		var r = (el || spinCv).getBoundingClientRect(), R = r.width * 0.44 * 0.88;
		var x = (e.clientX - r.left - r.width / 2) / R * 100, y = -(e.clientY - r.top - r.height / 2) / R * 100, d = Math.hypot(x, y);
		if (d > 100) { x = x / d * 100; y = y / d * 100; }
		spin = { x: Math.trunc(x), y: Math.trunc(y) };
		drawSpin(); need();
	}
	spinCv.addEventListener("pointerdown", function (e) { if (!canShoot()) return; spinDrag = true; spinCv.setPointerCapture(e.pointerId); spinFrom(e); e.preventDefault(); });
	spinCv.addEventListener("pointermove", function (e) { if (spinDrag) spinFrom(e); });
	spinCv.addEventListener("pointerup", function () { spinDrag = false; });
	spinCv.addEventListener("dblclick", function () { spin = { x: 0, y: 0 }; drawSpin(); });
	function nudgeSpin(dx, dy) {
		var x = spin.x + dx, y = spin.y + dy, d = Math.hypot(x, y);
		if (d > 100) { x = x / d * 100; y = y / d * 100; }
		spin = { x: Math.trunc(x), y: Math.trunc(y) }; drawSpin(); need();
	}

	/* cue elevation (jump shots): the slider under the table and the one in the spin picker on the table */
	function setElev(v) {
		elev = Math.max(0, Math.min(B.EMAX, Math.round(v)));
		root.querySelectorAll(".bl-elev").forEach(function (el) { el.value = elev; });
		root.querySelectorAll(".bl-elevv").forEach(function (el) { el.textContent = elev ? elev + "°" + (elev >= 30 ? " (jump)" : elev >= 10 ? " (small hop)" : "") : "flat"; });
		if (sctx) drawSpin();
		need();
	}
	root.addEventListener("input", function (e) { if (e.target.classList && e.target.classList.contains("bl-elev")) setElev(+e.target.value); });

	/* keyboard */
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("bl-p-play").hidden || t === pow) return;
		if (t && t.closest && t.closest(".bl-tabs, .bl-setup, .tu-seo")) return;
		var k = e.key.toLowerCase();
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") { if (!canShoot()) return; e.preventDefault(); nudgeAim((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10000 : 500)); }
		else if (e.key === "ArrowUp" || e.key === "ArrowDown") { if (!canShoot()) return; e.preventDefault(); power = Math.max(10, Math.min(1000, power + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 100 : 20))); renderPower(); need(); }
		else if (e.key === " " || k === "enter") { if (t && t.tagName === "BUTTON" && k === "enter") return; e.preventDefault(); if (anim) skipAnim(); else shoot(); }
		else if (k === "w") { if (canShoot()) nudgeSpin(0, 10); }
		else if (k === "s") { if (canShoot()) nudgeSpin(0, -10); }
		else if (k === "a") { if (canShoot()) nudgeSpin(-10, 0); }
		else if (k === "d") { if (canShoot()) nudgeSpin(10, 0); }
		else if (k === "c") { spin = { x: 0, y: 0 }; setElev(0); drawSpin(); need(); }
		else if (k === "j") { if (canShoot()) setElev(elev + (e.shiftKey ? -5 : 5)); }
		else if (k === "r") replayLast();
		else if (k === "u") undo();
		else if (k === "n") { if (mode !== "online" && mode !== "hive") newGame(); }
		else if (k === "f") panelBtn(1);
		else if (k === "v") setDim(S.dim === "3d" ? "2d" : "3d");
		else if (k === "m") musToggle();
		else if (k === "g") cycleGuide();
		else if (k === "k") { if (S.dim === "3d") cycleCam(); }
		else if ((e.key === "PageUp" || e.key === "PageDown") && S.dim === "3d" && v3) { e.preventDefault(); v3.tiltBy(e.key === "PageUp" ? 0.08 : -0.08); draw(); }
	});

	/* ---------- fill window / full screen (shared panel-view.js) ---------- */
	function addPanel() {
		if (window.MESPanel && !view.__mesPanel) window.MESPanel.add(view, { bar: $("bl-pbar"), stage: stage, onChange: function () { setTimeout(relayout, 30); } });
	}
	addPanel();
	if (!view.__mesPanel) document.addEventListener("DOMContentLoaded", addPanel);
	window.addEventListener("load", addPanel);
	function panelBtn(n) { var b = view.querySelectorAll(".mes-pbtn")[n]; if (b) b.click(); }
	var roT = null;
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(relayout, 60); }).observe(stage);
	window.addEventListener("resize", function () { clearTimeout(roT); roT = setTimeout(relayout, 80); });

	/* ===================================================================== status ===================================================================== */
	function nameOf(p) {
		if (mode === "solo") return "You";
		if (mode === "cpu") return p === human ? "You" : "Computer (" + LEVEL_NAMES[S.lv] + ")";
		if (mode === "online") return (on.g && on.g.names[p]) || (p === on.seat ? "You" : "Waiting…");
		if (mode === "hive") return hv.R && hv.R.players[p] ? "@" + hv.R.players[p] : "?";
		return (S.names[p] || "").trim() || "Player " + (p + 1);
	}
	function youAre(p) { return mode === "solo" || (mode === "cpu" && p === human) || (mode === "online" && p === on.seat) || (mode === "hive" && hv.R && hv.R.players[p] === hMe()); }
	function miniBall(kind, gone) {
		var snooker = st.g.table === "snooker", col = ballColor(kind, snooker), stripe = !snooker && kind > 8;
		var bg = stripe ? "linear-gradient(#f8f8f2 0 26%, " + col + " 26% 74%, #f8f8f2 74%)" : col;
		var txt = !snooker && kind > 0 ? '<span style="background:#fff;border-radius:50%;width:0.95em;height:0.95em;display:inline-flex;align-items:center;justify-content:center;line-height:1;color:#111">' + kind + "</span>" : "";
		return '<span class="bl-mb' + (gone ? " is-gone" : "") + '" style="background:' + bg + '" title="' + (snooker ? B.SNK_NAMES[kind] : "Ball " + kind) + '">' + txt + "</span>";
	}
	/* a plain solid or striped ball (no number) for "your group": the same colour for both, so only solid vs stripe differs */
	function groupIcon(g) {
		var c = "#d62828";
		return '<svg class="bl-gic" viewBox="0 0 20 20" aria-hidden="true">' + (g === "s"
			? '<circle cx="10" cy="10" r="9" fill="' + c + '"/>'
			: '<clipPath id="blgc' + (++gicN) + '"><circle cx="10" cy="10" r="9"/></clipPath><circle cx="10" cy="10" r="9" fill="#f8f8f2"/><rect x="0" y="5.2" width="20" height="9.6" fill="' + c + '" clip-path="url(#blgc' + gicN + ')"/>') +
			'<circle cx="7" cy="6.5" r="2.4" fill="#fff" opacity="0.45"/><circle cx="10" cy="10" r="9" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.2"/></svg>';
	}
	var gicN = 0;
	function renderPlayers() {
		var box = $("bl-players"), t = st.g.type, h = "";
		if (st.np === 1) {
			var left = B.ballsLeft(st), ch = t === "C" ? st.g.ch : null;
			h = '<div class="bl-pl is-turn"><span class="bl-turnd"></span><span class="bl-pn">' + esc(st.g.name) + '</span><span class="bl-pg">' + left + " ball" + (left === 1 ? "" : "s") + " left</span>" +
				'<span class="bl-ps">' + st.shots[0] + (ch ? " / " + ch.shots : "") + '</span><span class="bl-pg">shot' + (ch ? "s" : st.shots[0] === 1 ? "" : "s") + "</span></div>";
			box.innerHTML = h; return;
		}
		var shownTurn = anim && anim.item && anim.item.res ? anim.item.res.player : st.turn;
		for (var p = 0; p < 2; p++) {
			var turn = !st.win && shownTurn === p, extra = "", sc = "";
			if (t === "8") {
				var gr = st.grp[p];
				if (gr) {
					var list = gr === "s" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
					extra = '<span class="bl-grpl">' + groupIcon(gr) + (gr === "s" ? "Solids" : "Stripes") + "</span>" + '<span class="bl-balls">' + list.map(function (kk) { var id = st.k.indexOf(kk); return miniBall(kk, id < 0 || !st.on[id]); }).join("") + miniBall(8, false) + "</span>";
				} else extra = '<span class="bl-grpl is-open">' + (st.brk ? "break" : groupIcon("s") + groupIcon("t") + "open table") + "</span>";
			} else if (t === "S") {
				sc = '<span class="bl-ps">' + st.score[p] + "</span>";
				if (turn && st.run) extra = '<span class="bl-pg">break ' + st.run + "</span>";
			} else extra = '<span class="bl-pg">' + st.pots[p] + " potted</span>";
			h += '<div class="bl-pl' + (turn ? " is-turn" : "") + '"><span class="bl-turnd"></span><span class="bl-pn">' + esc(nameOf(p)) + "</span>" + extra + sc + "</div>";
		}
		if (t === "9" || t === "10") {
			var tg = B.targets(st);
			if (tg.length && !st.win) h += '<div class="bl-pl bl-pnext"><span class="bl-grpl">Next: ' + st.k[tg[0]] + "</span>" + miniBall(st.k[tg[0]], false) + '<span class="bl-balls">' + st.k.map(function (kk, id) { return id > 0 && st.on[id] && id !== tg[0] ? miniBall(kk, false) : ""; }).join("") + "</span></div>";
		}
		if (t === "S" && !st.win) {
			var on = B.snookerOn(st), onTxt = on === "red" ? "a red" : on === "colour" ? "any colour" : "the " + B.SNK_NAMES[on];
			h += '<div class="bl-pl"><span class="bl-pg">On: <b>' + onTxt + "</b> · " + B.pointsLeft(st) + " points left</span></div>";
		}
		box.innerHTML = h;
	}
	/* what the shooter has to do, as words: stripes / solids / open table, the ball to hit first, the ball "on" in snooker */
	function targetText(p) {
		var t = st.g.type;
		if (t === "8") {
			if (st.brk) return { txt: "Break", balls: [] };
			var gr = st.grp[p];
			if (!gr) return { txt: "Open table:", after: "your first pot decides", balls: ["s", "t"], open: true };
			var left = B.ballsLeft(st, gr), name = gr === "s" ? "Solids" : "Stripes";
			if (!left) return { txt: name + " done: pot the 8", balls: [8] };
			return { txt: name + (gr === "s" ? " (1-7)" : " (9-15)") + " · " + left + " left", balls: [gr] };
		}
		if (t === "9" || t === "10") {
			var tg = B.targets(st);
			if (!tg.length) return { txt: "", balls: [] };
			var kk = st.k[tg[0]];
			return { txt: (st.brk ? "Break: hit the " : "Hit the ") + kk + " first · the " + t + " wins", balls: [kk] };
		}
		if (t === "S") {
			var on1 = B.snookerOn(st);
			return { txt: "On: " + (on1 === "red" ? "a red" : on1 === "colour" ? "any colour" : "the " + B.SNK_NAMES[on1]) + " · " + st.score[0] + "–" + st.score[1], balls: [] };
		}
		var left2 = B.ballsLeft(st);
		return { txt: left2 + " ball" + (left2 === 1 ? "" : "s") + " left", balls: [] };
	}
	function renderChip() {
		var el = $("bl-ochip"); if (!el || !st) return;
		var h = "";
		if (st.win) {
			var w = st.win.p;
			h = st.np === 1 ? esc(st.msg || "Done") : youAre(w) && mode !== "local" ? "<b>You win!</b>" : "<b>" + esc(nameOf(w)) + " wins</b>";
		} else {
			var p = anim && anim.item && anim.item.res ? anim.item.res.player : st.turn;
			var who = st.np === 1 ? "" : mode === "local" ? esc(nameOf(p)) : youAre(p) ? "You" : mode === "cpu" ? "Computer" : esc(nameOf(p));
			var tt = targetText(p);
			h = (who ? '<span class="bl-cwho' + (youAre(p) && mode !== "local" ? " is-you" : "") + '">' + who + "</span>" : "") +
				(function () {
					var ic = '<span class="bl-cic">' + tt.balls.map(function (kk) { return kk === "s" || kk === "t" ? groupIcon(kk) : miniBall(kk, false); }).join(tt.open ? "<i>or</i>" : "") + "</span>", tx = '<span class="bl-ctxt">' + esc(tt.txt) + "</span>";
					return tt.open ? tx + ic + '<span class="bl-ctxt">· ' + esc(tt.after) + "</span>" : ic + tx;
				})() +
				(st.bih && !st.brk && !anim && isHumanTurn() ? '<span class="bl-cbih">ball in hand</span>' : "");
		}
		el.innerHTML = h;
		el.hidden = !h;
	}
	function renderMsg() {
		var el = $("bl-msg"), m = st.msg || "", tail = "";
		if (anim || queue.length) { el.innerHTML = "&nbsp;"; return; }
		if (st.win) {
			var w = st.win.p;
			if (st.np === 1) tail = "";
			else if (st.win.why === "resign") tail = esc(nameOf(1 - w)) + " resigned: " + esc(nameOf(w)) + " wins.";
			else if (st.win.why === "timeout") tail = esc(nameOf(w)) + " wins (the other player was away).";
			else tail = youAre(w) && mode !== "local" ? "<b>You win!</b>" : "<b>" + esc(nameOf(w)) + " wins.</b>";
			if (st.g.type === "S") tail += " " + st.score[0] + " – " + st.score[1] + ".";
		} else if (busy || (mode === "cpu" && st.turn !== human)) tail = "The computer's shot.";
		else if (mode === "online" && on.g && on.g.status === "wait") tail = "Waiting for someone to join.";
		else if (isHumanTurn()) {
			var who = mode === "local" ? esc(nameOf(st.turn)) + ": your shot" : "Your shot";
			tail = who + (st.bih ? ". Ball in hand: drag the white ball " + B.zoneName(st.zone) + ", then aim." : ".");
			if (st.brk && st.g.table === "pool") tail = who + ": break! Place the cue ball behind the line, aim and hit it hard.";
		} else if (mode === "online" || mode === "hive") tail = "Waiting for " + esc(nameOf(st.turn)) + "'s shot.";
		var foul = /^Foul/.test(m);
		el.innerHTML = (m ? '<span class="' + (foul ? "is-foul" : "") + '">' + esc(m) + "</span> " : "") + tail;
	}
	function render() {
		if (!st) return;
		root.classList.toggle("bl-incpu", mode === "cpu" || (effOpp() === "cpu" && mode !== "online" && mode !== "hive"));
		root.classList.toggle("bl-inlocal", effOpp() === "local");
		root.classList.toggle("bl-solo", B.game(S.game) && B.game(S.game).np === 1);
		renderPlayers(); renderMsg(); renderAim(); renderPower(); renderChip(); guideBtn();
		var can = canShoot();
		$("bl-shoot").disabled = !can && !anim;
		$("bl-shoot").textContent = anim ? "Skip ▸▸" : "Shoot";
		$("bl-undo").disabled = !st.hist.length || mode === "online" || mode === "hive";
		$("bl-new").disabled = mode === "online" || mode === "hive";
		$("bl-replay").disabled = !lastShow;
		cv.classList.toggle("is-wait", !can);
		if (ov) { ov.classList.toggle("is-wait", !can && !anim); $("bl-ohit").firstChild.nodeValue = anim ? "SKIP" : "HIT"; }
		var sv = $("bl-hsave"), saveable = st.win && (mode === "cpu" || mode === "local" || mode === "solo") && st.win.p >= 0 && st.win.why !== "resign";
		var key = st.v + ":" + st.seed + ":" + st.hist.length;
		sv.hidden = !saveable; sv.disabled = !!S.saved[key];
		$("bl-hsaved").innerHTML = saveable && S.saved[key] ? "Saved on Hive: " + txLinks(S.saved[key]) : "";
		renderObar();
		need();
	}
	function finish() {
		var w = st.win.p, key = st.v + "|" + (mode === "cpu" ? S.lv : mode) + (st._guided ? "" : "|ng");
		var r = S.stats[key] || { w: 0, l: 0, g: 0, shots: 0, pots: 0, best: 0, fewest: 0 };
		r.g++;
		var me = mode === "cpu" ? human : 0;
		if (mode === "cpu") { if (w === human) r.w++; else r.l++; }
		else if (mode === "solo") { if (w === 0) { r.w++; if (!r.fewest || st.shots[0] < r.fewest) r.fewest = st.shots[0]; } else r.l++; }
		else if (mode === "online" || mode === "hive") { me = mode === "online" ? on.seat : (hv.R && hv.R.players.indexOf(hMe())); if (me === w) r.w++; else if (me >= 0) r.l++; }
		if (me >= 0) { r.shots += st.shots[me] || 0; r.pots += st.pots[me] || 0; if (st.g.type === "S" && st.best[me] > r.best) r.best = st.best[me]; }
		S.stats[key] = r;
		if (st.g.type === "C" && w === 0) { var b0 = S.chal[st.v]; if (!b0 || st.shots[0] < b0) S.chal[st.v] = st.shots[0]; }
		if (mode === "local") score.p[w] = (score.p[w] || 0) + 1;
		storeCur();
		save();
		render();
		if (st.np === 1) toast(st.msg);
		else toast((youAre(w) && mode !== "local" ? "You win! 🎱" : nameOf(w) + " wins.") + ((mode === "cpu" || mode === "local") && st.win.why !== "resign" ? " Save it to your Hive account with ⬢ Save result to Hive above the table." : ""));
	}

	/* ===================================================================== setup ===================================================================== */
	function fillGameSelect() {
		var groups = {}, order = [];
		B.GAMES.concat(B.CHALLENGES.map(function (c) { return B.game(c.id); })).forEach(function (g) { if (!groups[g.group]) { groups[g.group] = []; order.push(g.group); } groups[g.group].push(g); });
		$("bl-game").innerHTML = order.map(function (gn) { return '<optgroup label="' + gn + '">' + groups[gn].map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("") + "</optgroup>"; }).join("");
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === String(v) ? "true" : "false"); }
	function segWire(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || b.disabled) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); }); }
	function syncSetup() {
		$("bl-game").value = S.game;
		segSet("bl-opp", S.opp); segSet("bl-lv", S.lv); segSet("bl-me", S.me); segSet("bl-ofirst", S.ofirst); segSet("bl-ong", S.ong ? 1 : 0);
		segSet("bl-guide", S.guide); segSet("bl-orient", S.orient); segSet("bl-speed", S.speed); segSet("bl-cloth", S.cloth); segSet("bl-ovm", S.ovm || "auto");
		$("bl-snd").checked = S.snd; $("bl-rel").checked = S.rel; $("bl-nums").checked = S.nums;
		$("bl-n1").value = S.names[0] || ""; $("bl-n2").value = S.names[1] || "";
		$("bl-name").value = S.name || ""; $("bl-opub").checked = S.opub !== false;
		var g = B.game(S.game);
		$("bl-desc").textContent = g ? g.desc : "";
		$("bl-ovar").textContent = $("bl-hvar").textContent = g && g.online ? g.name : "8-ball (the chosen game can't be played online)";
	}
	$("bl-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("bl-opp", function (v) { S.opp = v; save(); newGame(); });
	segWire("bl-lv", function (v) { S.lv = v; save(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next shot."); render(); });
	segWire("bl-me", function (v) { S.me = v; save(); newGame(true); });
	segWire("bl-ofirst", function (v) { S.ofirst = v; save(); });
	segWire("bl-ong", function (v) { S.ong = v === "1" ? 1 : 0; save(); });
	segWire("bl-guide", function (v) { S.guide = v; save(); guideBtn(); need(); });
	var GLAB = { full: "Guide: Full", "short": "Guide: Short", off: "Guide: Off" };
	function noGuide() { return (mode === "online" && on.g && !!on.g.ng) || (mode === "hive" && hv.R && hv.R.open && !!hv.R.open.ng); }
	function effGuide() { return noGuide() ? "off" : S.guide; }
	function guideBtn() {
		var ng = noGuide(), b = $("bl-gbtn"), eg = effGuide();
		b.textContent = ng ? "Guide: off (this game)" : GLAB[S.guide] || GLAB.full; b.classList.toggle("is-off", eg === "off"); b.disabled = ng;
		b.setAttribute("aria-label", ng ? "No aiming guide in this game: both players play without it" : b.textContent + " (press to change)");
		var pg = $("bl-pguide");
		if (pg) { pg.textContent = ng ? "Guide: off (this game)" : GLAB[S.guide] || GLAB.full; pg.disabled = ng; pg.classList.toggle("is-off", eg === "off"); pg.title = ng ? "This game is played without the aiming guide, for both players (set by the player who made it)" : "Aiming guide: full, short or off (G)"; }
		var o = ov && ov.querySelector('[data-ov="guide"]');
		if (o) { o.textContent = ng ? "No guide" : eg === "short" ? "Guide: short" : eg === "off" ? "Guide: off" : "Guide"; o.classList.toggle("is-off", eg === "off"); o.disabled = ng; o.title = ng ? "No aiming guide in this game (set by the player who made it)" : "Aiming guide: full, short or off (G)"; }
		var segB = $("bl-guide").querySelectorAll("button"); for (var i = 0; i < segB.length; i++) segB[i].disabled = ng;
	}
	function cycleGuide() { if (noGuide()) return toast("This game is played without the aiming guide, for both players."); var o = ["full", "short", "off"]; S.guide = o[(o.indexOf(S.guide) + 1) % 3]; save(); segSet("bl-guide", S.guide); guideBtn(); need(); toast(S.guide === "off" ? "Guide off: aim by eye." : S.guide === "short" ? "Short guide: only the first part of the line." : "Full guide."); }
	$("bl-gbtn").addEventListener("click", cycleGuide);
	$("bl-pguide").addEventListener("click", cycleGuide);
	guideBtn();
	segWire("bl-orient", function (v) { S.orient = v; save(); relayout(); });
	segWire("bl-speed", function (v) { S.speed = v; save(); });
	segWire("bl-ovm", function (v) { S.ovm = v; save(); ovMode(); });
	function ovMode() { root.classList.toggle("bl-ov-always", S.ovm === "always"); root.classList.toggle("bl-ov-off", S.ovm === "off"); }
	ovMode();
	segWire("bl-cloth", function (v) { S.cloth = v; save(); staticCv = null; need(); });
	$("bl-snd").addEventListener("change", function () { S.snd = this.checked; save(); if (S.snd) ensureAudio(); });
	$("bl-rel").addEventListener("change", function () { S.rel = this.checked; save(); });
	$("bl-nums").addEventListener("change", function () { S.nums = this.checked; save(); sprites = {}; need(); });
	["bl-n1", "bl-n2"].forEach(function (id, i) { $(id).addEventListener("input", function () { S.names[i] = this.value.slice(0, 20); save(); render(); }); });
	$("bl-new").addEventListener("click", function () { newGame(); });
	$("bl-undo").addEventListener("click", undo);
	$("bl-replay").addEventListener("click", replayLast);

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".bl-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("bl-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") { loadLobby(); loadHiveLobby(); renderHiveCard(); loadRecent(); }
		if (name === "stats") renderStats();
		if (name === "chal") renderChals();
		if (name === "play") setTimeout(relayout, 0);
		lobbyTimer(name === "online");
	}
	$("bl-tabs").addEventListener("click", function (e) { var b = e.target.closest(".bl-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("bl-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- challenges ---------- */
	function renderChals() {
		$("bl-chals").innerHTML = B.CHALLENGES.map(function (c, i) {
			var best = S.chal[c.id];
			return '<button type="button" class="bl-ch" data-ch="' + c.id + '"><b>' + (i + 1) + ". " + esc(c.name) + '</b><span class="bl-chs">' + esc(c.tip) + '</span><span class="bl-chs">' + (c.table === "snooker" ? "Snooker table · " : "") + c.shots + " shot" + (c.shots > 1 ? "s" : "") + " allowed</span>" +
				(best ? '<span class="bl-chr">✓ Done in ' + best + " shot" + (best > 1 ? "s" : "") + "</span>" : "") + "</button>";
		}).join("");
	}
	$("bl-chals").addEventListener("click", function (e) {
		var b = e.target.closest("[data-ch]"); if (!b) return;
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-ch"); save(); syncSetup(); showTab("play"); newGame();
		view.scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("bl-stats"), keys = Object.keys(S.stats);
		var chDone = B.CHALLENGES.filter(function (c) { return S.chal[c.id]; }).length;
		if (!keys.length && !chDone) { box.innerHTML = '<p class="bl-sub">No finished games yet.</p>'; return; }
		var OPP = { easy: "vs Easy computer", medium: "vs Medium computer", hard: "vs Hard computer", pro: "vs Pro computer", expert: "vs Expert computer", local: "two players here", solo: "on your own", online: "online (guest)", hive: "on Hive" };
		var rows = keys.sort().map(function (k) {
			var r = S.stats[k], p = k.split("|"), pot = r.shots ? Math.round(r.pots * 100 / r.shots) + "%" : "–";
			return "<tr><td>" + esc(B.describe(p[0])) + ' <span class="bl-lobv">' + esc(OPP[p[1]] || p[1]) + (p[2] === "ng" ? " · no guide" : "") + "</span></td><td>" + r.g + '</td><td class="w">' + r.w + '</td><td class="l">' + (p[1] === "local" ? "–" : r.l) + "</td><td>" + pot + "</td><td>" + (r.best ? r.best : r.fewest ? r.fewest + " shots" : "–") + "</td></tr>";
		}).join("");
		box.innerHTML = '<table class="bl-stbl"><thead><tr><th>Game</th><th>Played</th><th>Won</th><th>Lost</th><th title="Balls potted per shot (yours)">Pots / shot</th><th title="Snooker: highest break. Practice: fewest shots to clear">Best</th></tr></thead><tbody>' + rows + "</tbody></table>" +
			'<p class="bl-sub" style="margin-top:0.8em">Challenges done: <b>' + chDone + " of " + B.CHALLENGES.length + '</b></p><p><button type="button" class="tu-btn" id="bl-sreset">Delete my statistics</button></p>';
		$("bl-sreset").addEventListener("click", function () { if (confirm("Delete all your billiards statistics and challenge results in this browser?")) { S.stats = {}; S.chal = {}; save(); renderStats(); } });
	}

	/* ---------- rules ---------- */
	function renderRules() {
		var R = [
			["How to play here", "<ul><li><b>Shooting</b>: press on the cue stick (or the white ball), pull back and let go: the further you pull, the harder it hits. Slide back to the start to cancel.</li><li><b>Jump shots</b>: raise the cue with the Cue up slider (J / Shift+J). From about 30° the white ball hops over a ball in its way: give it some power and room (a ball's width or two of space). Very hard and steep shots can send it off the table (a foul, ball in hand). Jump shots are allowed in every game here.</li><li><b>On a phone or in Fill window / full screen</b> the controls are on the table: pull the power bar on the right <b>down</b> and let go to shoot, or <b>hold HIT</b> (the power swings up and down) and let go; tap the little white ball for spin; 2D / 3D, camera and help sit top right.</li><li><b>Aim</b>: press on the table and drag; the cue follows your finger or mouse. Dragging far from the cue ball gives finer aim. For fine aiming drag the <b>aim strip</b> (under the table, or at the bottom of the table on a phone and in Fill window) left or right: slowly = a hair at a time, a quick swipe = a big turn. The ⟲ ⟳ buttons and the arrow keys turn it a hair at a time.</li><li><b>Power</b>: drag along the power bar and let go to shoot (or press Shoot / Space).</li><li><b>Spin</b>: drag the red dot on the little white ball. Top = follow (the cue ball keeps rolling after the hit), bottom = draw (it comes back), left / right = side spin, which changes how it comes off the cushions.</li><li><b>Ball in hand</b>: drag the white ball to where you want it, then aim.</li><li><b>The guide</b>: the dotted line shows where the cue ball goes, the circle where it touches the first ball, the yellow line where that ball goes and the blue line where the cue ball heads off (before spin). A red circle means that ball is not allowed first.</li></ul>"],
			["8-ball", "<ul><li>The first player breaks from behind the head string. If balls go in on the break the player carries on; the table stays <b>open</b>.</li><li>On an open table, the first ball you pot decides your group: <b>solids</b> (1-7) or <b>stripes</b> (9-15).</li><li>You must hit a ball of your group first, then pot one of your group or make any ball touch a cushion. Pot one of yours and you play again.</li><li>When your group is cleared, pot the <b>8</b> to win. Pot the 8 early, or in the same shot as a foul, and you lose. The 8 going in on the break is put back on its spot.</li><li><b>Fouls</b> (the cue ball goes in, no ball hit, the wrong ball first, no cushion after the hit) give the other player <b>ball in hand</b> anywhere on the table.</li><li>Here the shot is not called: any legal pot counts.</li></ul>"],
			["9-ball and 10-ball", "<ul><li>Always hit the <b>lowest numbered</b> ball on the table first. Any ball you pot after a legal hit keeps you at the table.</li><li>Pot the 9 (10 in 10-ball) on a legal shot, even in a combination or on the break, and you win.</li><li>A foul gives the other player ball in hand anywhere; a 9 or 10 potted on a foul goes back on its spot.</li><li>No push-out and no three-foul rule here.</li></ul>"],
			["Snooker", "<ul><li>15 reds (1 point each) and six colours: yellow 2, green 3, brown 4, blue 5, pink 6, black 7. Break off from the D.</li><li>Pot a red, then any colour (the colour you hit first is the one you nominate), then a red, and so on. Colours potted while reds remain come back on their spots.</li><li>When the reds are gone, pot the colours in order: yellow, green, brown, blue, pink, black.</li><li><b>Fouls</b> give the other player at least 4 points (or the value of the ball involved, up to 7): hitting the wrong ball first, potting a ball that isn't on, the cue ball going in, missing everything. After a foul the next player plays from where the cue ball stopped, or from the D if it went in.</li><li>The frame ends when the black goes in; a foul with only the black left also ends it. If the scores are level the black is re-spotted.</li><li>Not modelled here: free ball, the miss rule, touching balls and conceding (use New game).</li></ul>"],
			["Practice and challenges", "<p>Practice racks are just you and the balls: no turns, no fouls, and the cue ball comes back in hand anywhere if it goes in. The Challenges tab has set shots (straight pots, cuts, banks, combinations, draw, follow) with a limited number of shots.</p>"],
			["How the physics works", "<p>Every ball slides, then rolls, with real cloth friction: a ball hit without spin slides first and then starts to roll, which is why a stun shot stops dead on a straight hit at short range and follows through from further away. Top and back spin come from where the cue hits the cue ball, and side spin changes the angle off the cushions. Balls collide with a small loss of energy, cushions bounce at about three quarters of the speed, and the pocket jaws can rattle a ball out. The simulation runs 2,000 steps per second of table time and only uses arithmetic that gives exactly the same answer in every browser and on the server, so online and Hive games always agree.</p>"],
			["Online and Hive", "<p>Guest games: make one on the Play online tab and send the link. Pick <b>No guide for both</b> there to play without the aiming line: it is switched off for both players for the whole game (also for Hive games). Hive games: every shot is a custom_json operation (id <code>mes_pool</code>) signed with your posting key; both browsers replay the shots from the chain. A player who is away for five minutes on their turn can lose by a claim. You can also save the result of a game against the computer, a friend or a practice clear to your Hive account (self-reported, but the shots are checked by replaying them).</p>"]
		];
		$("bl-rules").innerHTML = R.map(function (r) { return '<div class="bl-rule"><h3>' + r[0] + "</h3>" + r[1] + "</div>"; }).join("");
	}

	/* ---------- toast + copy ---------- */
	var toastT = null;
	function toast(msg, html) { var t = $("bl-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, html ? 6000 : 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, fails: 0 };
	var API = "/api/billiards";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("bl-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("bl-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("bl-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("bl-ochange").addEventListener("click", function () { showTab("play"); $("bl-game").focus(); });
	function onlineV() { var g = B.game(S.game); return g && g.online ? g.id : "8"; }
	function setOnlineGame(v, sd, shots) {
		gen++; busy = false; anim = null; queue = []; cpuAim = null; $("bl-think").hidden = true;
		st = B.replay(v, sd, shots) || B.create(v, sd);
		if (v3) v3.resetRoll();
		seed = sd;
		place = st.bih ? defaultPlace() : null;
		autoAimNext();
		relayout();
	}
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		setOnlineGame(r.g.v, r.g.seed, r.g.shots);
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("bl-ocreate").addEventListener("click", function () {
		if (mode === "online" || mode === "hive") return toast("You are already in an online game.");
		S.name = ($("bl-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: onlineV(), name: myName(), pub: $("bl-opub").checked, first: S.ofirst, ng: S.ong ? 1 : 0 }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			startOnline(r);
		});
	});
	function join(id) {
		if (mode === "online" && on.id === id) { showTab("play"); return; }
		if (mode === "online" || mode === "hive") return toast("Leave your current online game first.");
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) {
			if (r.error) { toast(r.error); loadLobby(); return; }
			startOnline(r);
			toast("You joined " + (r.g.names[1 - r.seat] || "the game") + ".");
		});
	}
	function leaveOnline() {
		clearTimeout(on.timer);
		on.id = null; on.g = null; S.online = null; save();
		mode = effOpp(); newGame();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("bl-obar");
		if (mode === "hive") return renderHbar();
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="bl-dot"></span>Waiting for a player' + (g.ng ? " (no aiming guide in this game)" : "") + '. Send them this link:</span><span class="bl-vbtns"><button type="button" class="bl-vb bl-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="bl-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="bl-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var away = g.status === "play" && st.turn !== on.seat && (g.idle || 0) > 180000;
			h = '<span><span class="bl-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b> · " + esc(B.describe(g.v)) + (g.ng ? " · no guide" : "") + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="bl-vbtns">';
			if (g.status === "play") {
				if (away) h += '<button type="button" class="bl-vb bl-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="bl-vb" data-o="resign">Resign</button>';
			} else h += '<button type="button" class="bl-vb bl-vb--main" data-o="rematch">↺ Rematch</button>';
			h += '<button type="button" class="bl-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("bl-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play billiards with me", text: "Join my " + B.describe(on.g.v) + " game", url: inviteLink() }).catch(function () {});
		if (a === "cancel" || a === "leave") {
			if (a === "leave" && on.g && on.g.status === "play" && !confirm("Leave the game? It counts as resigning.")) return;
			api("POST", { act: a === "cancel" ? "cancel" : "leave", id: on.id, key: on.key });
			leaveOnline();
			return;
		}
		if (a === "resign" && !confirm("Resign this game?")) return;
		b.disabled = true;
		api("POST", { act: a, id: on.id, key: on.key }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			sync(r.g);
		});
	});
	function onlineShot(shot) {
		var n = st.hist.length, str = B.sstr(shot);
		on.sending = true;
		var res = B.apply(st, shot, { frames: true });
		place = null;
		show(res, function () { afterShot(); });
		api("POST", { act: "shot", id: on.id, key: on.key, n: n, m: str }).then(function (r) {
			on.sending = false;
			if (r.error) { toast(r.error); refetch(); return; }
			sync(r.g);
		});
	}
	function refetch() { api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) sync(r.g); }); }
	function applyServerWin() {
		var g = on.g;
		if (g && g.status === "over" && g.win && !st.win) { st.win = { p: g.win.p, why: g.win.why }; }
	}
	function sync(g) {
		if (!g || !on.id || g.id !== on.id) return;
		var prev = on.g, wasOver = st.win;
		on.g = g;
		if (!prev || prev.round !== g.round || g.shots.length < st.hist.length || g.shots.slice(0, st.hist.length).join() !== st.hist.join()) {
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! The other player breaks this time... or you, if you lost the toss."); }
			setOnlineGame(g.v, g.seed, g.shots);
			wasOver = null;
		} else {
			for (var i = st.hist.length; i < g.shots.length; i++) {
				var res = B.apply(st, g.shots[i], { frames: true });
				if (!res) { setOnlineGame(g.v, g.seed, g.shots); break; }
				show(res, afterShot);
			}
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your break!" : "They break."));
		applyServerWin();
		render();
		if (st.win && !wasOver && !st._fin && !anim && !queue.length) { st._fin = true; finish(); }
	}
	function poll(delay) {
		clearTimeout(on.timer);
		on.timer = setTimeout(function () {
			if (!on.id) return;
			api("GET", null, "?id=" + on.id).then(function (r) {
				if (!on.id) return;
				if (r.error) {
					on.fails++;
					if (/not found|expired/i.test(r.error)) { toast("This online game is no longer there."); leaveOnline(); return; }
					renderObar();
				} else { var wasBad = on.fails > 2; on.fails = 0; if (!on.sending) sync(r.g); if (wasBad) renderObar(); }
				poll(nextDelay());
			});
		}, delay);
	}
	function nextDelay() {
		var g = on.g, hidden = document.hidden;
		if (!g) return 3000;
		if (g.status === "over") return hidden ? 10000 : 3000;
		var waitingOn = g.status === "wait" || st.turn !== on.seat;
		return hidden ? 6000 : waitingOn ? 1300 : 4000;
	}
	document.addEventListener("visibilitychange", function () { if (!document.hidden && on.id) poll(50); });

	/* lobby */
	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) { loadLobby(); loadHiveLobby(); } }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
	function firstText(f) { return f === "host" ? "they break" : f === "guest" ? "you break" : "random break"; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("bl-lobby");
			if (r.error) { box.innerHTML = '<p class="bl-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="bl-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="bl-lob">' + list.map(function (o) {
				return '<li><span class="bl-lobn">' + esc(o.name || "Guest") + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · " + firstText(o.first) + (o.ng ? " · no guide" : "") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("bl-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("bl-orefresh").addEventListener("click", loadLobby);

	/* ===================================================================== Hive games ===================================================================== */
	var H = B.hive;
	var hv = { host: null, gid: null, R: null, pending: [], timer: null, joiners: [], busy: false, ops: {}, lastErr: 0, reOffer: null, listed: false };
	var HA = MOCK ? mockHive() : realHive();
	function realHive() {
		var M = function () { return window.MESHive || null; };
		return {
			user: function () { var u = M() && M().user(); return u ? u.name : ""; },
			login: function (n) { return M() ? M().login(n) : Promise.reject(new Error("The Hive helpers did not load: reload the page.")); },
			logout: function () { if (M()) M().logout(); },
			onChange: function (f) { if (M()) M().onChange(f); else window.addEventListener("load", function () { if (M()) M().onChange(f); }); },
			help: function () { return M() ? M().helpHtml() : ""; },
			send: function (obj, label) {
				var me = this.user();
				return M().keychain().then(function (k) {
					if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
					return new Promise(function (ok, no) {
						k.requestCustomJson(me, H.ID, "Posting", H.json(obj), label, function (r) {
							if (r && r.success) { var x = r.result || {}; ok({ trx: x.id || x.tx_id || x.trx_id || "" }); }
							else no(new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled in Keychain"));
						});
					});
				});
			},
			ops: function (acct, since) {
				var all = [], pages = 0;
				function page(start) {
					return M().call("condenser_api.get_account_history", [acct, start, start < 0 ? 200 : Math.min(1000, start + 1), 262144, 0]).then(function (r) {
						r = r || []; pages++;
						all = r.concat(all);
						var oldest = r.length ? r[0] : null, oldT = oldest ? Date.parse(oldest[1].timestamp + "Z") : 0;
						if (oldest && oldest[0] > 0 && oldT > since && pages < 5 && r.length >= (start < 0 ? 200 : 2)) return page(oldest[0] - 1);
						return H.parse(all, acct);
					});
				}
				return page(-1);
			}
		};
	}
	function mockHive() {
		var subs = [];
		function chain() { try { return JSON.parse(localStorage.getItem("mes-billiards:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-billiards:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-billiards:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-billiards:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12);
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19),
					op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-billiards:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) {
				var cut = Math.floor(Date.now() / 3000);
				return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct));
			}
		};
	}
	function hMe() { return HA.user(); }
	function hLink(host, gid) { return location.origin + location.pathname + "?hive=" + host + "/" + gid; }
	function txLinks(trx) { return trx ? '<a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(trx) + '" target="_blank" rel="noopener">hiveblocks</a>' : ""; }
	function renderHiveCard() {
		var box = $("bl-hlogin"), me = hMe();
		$("bl-hmake").hidden = !me;
		if (me) {
			box.innerHTML = '<p class="bl-hwho">Signed in as ' + (MOCK ? "" : '<img alt="" src="https://images.hive.blog/u/' + esc(me) + '/avatar/small">') + "<b>@" + esc(me) + '</b> <button type="button" class="tu-btn" id="bl-hlogout">Log out</button></p>';
			$("bl-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="bl-hrow"><input class="tu-input" id="bl-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="bl-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed (no Keychain on this local copy)." : "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them.") + "</p>";
			var go = function () {
				var b = $("bl-hlogin-b"); b.disabled = true; b.textContent = "Check Keychain…";
				HA.login($("bl-huser").value).then(function () { toast("Logged in."); }, function (e) {
					b.disabled = false; b.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test(e.message + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			$("bl-hlogin-b").addEventListener("click", go);
			$("bl-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("bl-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(); });

	function hiveCreate() {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode === "online" || mode === "hive") return toast("Leave the game you are in first.");
		var to = ($("bl-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast(to === me ? "You can't challenge yourself." : "That isn't a Hive username.");
		var obj = { a: "open", g: H.newGid(), v: onlineV(), f: S.ofirst };
		if (S.ong) obj.ng = 1;
		if (to) obj.to = to;
		var b = $("bl-hcreate"); b.disabled = true;
		HA.send(obj, to ? "Challenge @" + to + " to " + B.describe(obj.v) : "Open a " + B.describe(obj.v) + " game").then(function (r) {
			b.disabled = false;
			hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: hMe(), g: obj.g });
			toast(obj.to ? "Challenge sent: copy the link above the table and send it to @" + obj.to + "." : "Your game is open: it will show up under Open Hive games.");
		}, function (e) { b.disabled = false; toast(e.message); });
	}
	function register(act, body, tries) {
		tries = tries || 0;
		body.act = act;
		api("POST", body).then(function (r) {
			if (r && r.error && /not on the chain/i.test(r.error) && tries < 6) setTimeout(function () { register(act, body, tries + 1); }, 3500);
			else if (act === "hopen" && r && r.ok) hv.listed = true;
		});
	}
	function pend(obj, trx) { var o = H.clean(JSON.parse(H.json(obj))); o.acct = hMe(); o.trx = trx || ("p" + Math.random()); o.block = 0; o.ts = Date.now(); o.i = 1e12 + hv.pending.length; o.pend = true; return o; }
	function hiveJoin(host, gid) {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first, then press Join again."); return; }
		if (host === me) return hiveEnter(host, gid, []);
		toast("Checking the game on Hive…");
		Promise.all([HA.ops(host, 0), HA.ops(me, 0)]).then(function (res) {
			var R = H.build(host, gid, res[0].concat(res[1]), Date.now());
			if (!R.open) return toast("That Hive game wasn't found (it may not be in a block yet: try again in a few seconds).");
			if (R.guest === me || R.status !== "wait") return hiveEnter(host, gid, []);
			if (R.open.to && R.open.to !== me) return toast("That game is a challenge for @" + R.open.to + ".");
			var obj = { a: "join", h: host, g: gid };
			HA.send(obj, "Join @" + host + "'s " + B.describe(R.open.v) + " game").then(function (r) {
				hiveEnter(host, gid, [pend(obj, r.trx)]);
				register("hjoin", { host: host, g: gid, acct: me });
			}, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.joiners = []; hv.reOffer = null; hv.listed = false; hv.busy = false; hv.ops = {};
		S.hive = { host: host, gid: gid }; save();
		mode = "hive";
		gen++; busy = false; anim = null; queue = [];
		showTab("play");
		hivePoll(0);
		render();
	}
	function hiveLeave() {
		clearTimeout(hv.timer);
		hv.host = null; hv.R = null; S.hive = null; save();
		mode = effOpp(); newGame();
	}
	function hivePoll(delay) { clearTimeout(hv.timer); hv.timer = setTimeout(hiveRefresh, delay); }
	function hiveRefresh() {
		if (mode !== "hive" || !hv.host) return;
		var me = hMe(), R = hv.R, accts = [hv.host];
		if (R && R.guest) accts.push(R.guest);
		else hv.joiners.forEach(function (a) { if (accts.indexOf(a) < 0) accts.push(a); });
		if (me && accts.indexOf(me) < 0) accts.push(me);
		if (R && R.open && R.open.to && accts.indexOf(R.open.to) < 0) accts.push(R.open.to);
		var since = R && R.open ? R.open.ts - 60000 : 0;
		var jobs = accts.map(function (a) { return HA.ops(a, since).then(function (o) { hv.ops[a] = o; }, function () { hv.lastErr = Date.now(); }); });
		if (!R || R.status === "wait") jobs.push(api("GET", null, "?hg=" + hv.host + "/" + hv.gid).then(function (r) { if (r && r.joiners) hv.joiners = r.joiners.slice(0, 5); }));
		Promise.all(jobs).then(function () {
			if (mode !== "hive" || !hv.host) return;
			hiveRebuild();
			if (hv.R && hv.R.status === "wait" && hv.host === me && !hv.listed && !hv.R.open.to) register("hopen", { host: me, g: hv.gid });
			hivePoll(hiveDelay());
		});
	}
	function hiveDelay() {
		var R = hv.R;
		if (document.hidden) return 9000;
		if (!R || R.status === "wait") return 4000;
		if (R.status === "play") return R.turnAcct === hMe() ? 6000 : 3000;
		return 6000;
	}
	function hiveRebuild() {
		var all = [];
		Object.keys(hv.ops).forEach(function (a) { all = all.concat(hv.ops[a]); });
		var now = Date.now();
		hv.pending = hv.pending.filter(function (p) {
			var seen = all.some(function (o) { return (p.trx && o.trx === p.trx) || (o.acct === p.acct && o.a === p.a && o.g === p.g && o.n === p.n); });
			return !seen && now - p.ts < 120000;
		});
		var prev = hv.R, firstLoad = !prev || !prev.s;
		var mineShown = st && mode === "hive" && prev && prev.s ? st.hist.length : 0;
		var R = H.build(hv.host, hv.gid, all.concat(hv.pending), now, { from: prev, frames: !firstLoad });
		hv.R = R;
		if (R.s) {
			if (firstLoad || !st || st.v !== R.s.v || st.seed !== R.s.seed || R.s.hist.slice(0, st.hist.length).join() !== st.hist.join()) {
				st = B.clone(R.s); place = st.bih ? defaultPlace() : null; autoAimNext(); relayout();
			} else if (R.s.hist.length > st.hist.length) {
				// new shots from the chain (the other player's, or ours confirmed): play the ones we have not shown yet
				var newOnes = R.results.filter(function (r) { return r.n >= mineShown; });
				st = B.clone(R.s);
				newOnes.forEach(function (r) { show(r, afterShot); });
			} else if (R.status !== (prev && prev.status)) st = B.clone(R.s);
			if (R.bad) hv.badWarn = true;
		}
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined. " + (R.turnAcct === hMe() ? "Your break!" : "They break."));
		hv.reOffer = null;
		if (R.status === "over") {
			var other = R.players[0] === hMe() ? R.players[1] : R.players[0];
			var mine = H.myGames(other, hv.ops[other] || []).filter(function (g) { return g.re === hv.host + "/" + hv.gid && g.role === "host"; });
			if (mine.length) hv.reOffer = mine[0];
		}
		render();
		if (st && st.win && !st._fin && !anim && !queue.length && prev && prev.status === "play") { st._fin = true; finish(); }
	}
	function hiveSend(obj, label) {
		hv.busy = true; render();
		return HA.send(obj, label).then(function (r) {
			hv.busy = false;
			hv.pending.push(pend(obj, r.trx));
			hiveRebuild();
			hivePoll(2500);
		}, function (e) { hv.busy = false; render(); toast(e.message); throw e; });
	}
	function hiveShot(shot) {
		// show it at once; the chain confirms it a few seconds later
		var n = st.hist.length, str = B.sstr(shot), probe = B.clone(st), res = B.apply(probe, shot);
		hiveSend({ a: "sh", h: hv.host, g: hv.gid, n: n, m: str, c: B.hash(probe) }, "Billiards shot " + (n + 1) + " vs @" + hiveOther()).catch(function () {});
		void res;
	}
	function hiveOther() { var R = hv.R, me = hMe(); if (!R) return ""; return R.players[0] === me ? (R.players[1] || "") : (R.players[0] || R.open && R.open.to || ""); }
	function renderHbar() {
		var box = $("bl-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h, link = '<span class="bl-chain">On Hive · game <a href="https://hivehub.dev/@' + esc(hv.host) + '" target="_blank" rel="noopener">@' + esc(hv.host) + "</a>/" + esc(hv.gid) + "</span>";
		if (!R || !R.open) h = '<span><span class="bl-dot is-off"></span>Reading the game from Hive…</span><span class="bl-vbtns"><button type="button" class="bl-vb" data-h="leave">Leave</button></span>';
		else if (R.status === "wait") {
			h = '<span><span class="bl-dot"></span>' + (R.open.to ? "Waiting for @" + esc(R.open.to) + " to accept" : "Waiting for someone on Hive to join") + " · " + esc(B.describe(R.open.v)) + (R.open.ng ? " · no aiming guide" : "") + ".</span>" + link + '<span class="bl-vbtns">' +
				(me && me !== hv.host && (!R.open.to || R.open.to === me) ? '<button type="button" class="bl-vb bl-vb--main" data-h="join">Join this game</button>' : "") +
				'<button type="button" class="bl-vb' + (me === hv.host ? " bl-vb--main" : "") + '" data-h="copy">🔗 Copy invite link</button>' + (hv.host === me ? '<button type="button" class="bl-vb" data-h="cancel">Cancel game</button>' : "") + '<button type="button" class="bl-vb" data-h="leave">Leave</button></span>';
		} else if (R.status === "cancelled" || R.status === "expired") {
			h = "<span>This Hive game was " + (R.status === "cancelled" ? "cancelled" : "never joined (open games last an hour)") + '.</span><span class="bl-vbtns"><button type="button" class="bl-vb" data-h="leave">Close</button></span>';
		} else {
			var other = hiveOther(), mine = R.players.indexOf(me) >= 0;
			h = '<span><span class="bl-dot' + (Date.now() - hv.lastErr < 10000 ? " is-off" : "") + '"></span>' + (mine ? "Hive game vs <b>@" + esc(other) + "</b>" : "Watching <b>@" + esc(R.players[0]) + "</b> vs <b>@" + esc(R.players[1]) + "</b>") + " · " + esc(B.describe(R.open.v)) + (R.open.ng ? " · no guide" : "") + (hv.pending.some(function (p) { return p.a === "sh"; }) ? " · your shot is on its way to the chain…" : "") + "</span>" + link + '<span class="bl-vbtns">';
			if (R.status === "play" && mine) {
				if (R.turnAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="bl-vb bl-vb--main" data-h="claim">Claim the win (away 5 min)</button>';
				h += '<button type="button" class="bl-vb" data-h="resign">Resign</button>';
			} else if (R.status === "over" && mine) {
				if (hv.reOffer) h += '<button type="button" class="bl-vb bl-vb--main" data-h="accept">Accept @' + esc(other) + "'s rematch</button>";
				else h += '<button type="button" class="bl-vb bl-vb--main" data-h="rematch">↺ Offer a rematch</button>';
			}
			h += '<button type="button" class="bl-vb" data-h="leave">Leave</button></span>';
			if (hv.badWarn) h += '<span class="bl-chain">Note: a shot\'s fingerprint did not match what this browser worked out. Please tell us on the Contact page.</span>';
			if (R.status === "over" && R.trx) {
				h += '<details class="bl-trx"><summary>On the chain (' + (R.trx.moves.length + 2) + ' transactions)</summary><ul>' +
					"<li>Open: " + txLinks(R.trx.open) + "</li><li>Join: " + txLinks(R.trx.join) + "</li>" +
					R.trx.moves.map(function (t, i) { return "<li>Shot " + (i + 1) + ": " + txLinks(t) + "</li>"; }).join("") +
					(R.trx.end && R.trx.moves.indexOf(R.trx.end) < 0 ? "<li>End (" + esc(R.win ? R.win.why : "") + "): " + txLinks(R.trx.end) + "</li>" : "") + "</ul></details>";
			}
		}
		box.innerHTML = h;
	}
	$("bl-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h"), R = hv.R;
		if (a === "copy") return copy(hLink(hv.host, hv.gid), "Invite link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open billiards game").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive game? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign billiards vs @" + hiveOther()).catch(function () {}); return; }
		if (a === "claim") return hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win: @" + hiveOther() + " is away").catch(function () {});
		if (a === "accept" && hv.reOffer) return hiveJoin(hv.reOffer.host, hv.reOffer.gid);
		if (a === "rematch" && R) {
			var other = hiveOther(), iWasFirst = R.players[0] === hMe();
			var obj = { a: "open", g: H.newGid(), v: R.open.v, f: iWasFirst ? "guest" : "host", to: other, re: hv.host + "/" + hv.gid };
			if (R.open.ng) obj.ng = 1;
			HA.send(obj, "Offer @" + other + " a billiards rematch").then(function (r) { hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]); toast("Rematch offered: @" + other + " sees an Accept button."); }, function (e2) { toast(e2.message); });
		}
	});

	/* self-reported results */
	$("bl-hsave").addEventListener("click", function () {
		if (!st.win) return;
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab) and press Save again on the Play tab."); return; }
		var obj = { a: "rec", g: H.newGid(), v: st.v, sd: st.seed, m: st.hist.join("."), o: mode === "cpu" ? S.lv : "local", s: mode === "cpu" ? human : -1, w: st.win.p };
		if (!st._guided) obj.ng = 1;
		if (!H.clean(obj)) return toast("This game is too long to save on Hive.");
		var key = st.v + ":" + st.seed + ":" + st.hist.length, b = this;
		b.disabled = true;
		HA.send(obj, "Save a billiards result (self-reported)").then(function (r) {
			S.saved[key] = r.trx || "?";
			var ks = Object.keys(S.saved); if (ks.length > 80) delete S.saved[ks[0]];
			save(); render();
			if (r.trx) toast("Saved on Hive: " + txLinks(r.trx), true); else toast("Saved on Hive.");
			register("hrec", { acct: me, g: obj.g });
		}, function (e) { b.disabled = false; toast(e.message); });
	});

	/* lobby + my games + recent */
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("bl-hlobby"), me = hMe();
			if (r.error) { box.innerHTML = '<p class="bl-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			if (!list.length) { box.innerHTML = '<p class="bl-sub">No open Hive games right now.' + (me ? " Make one above." : " Log in to make one.") + "</p>"; return; }
			box.innerHTML = '<ul class="bl-lob">' + list.map(function (o) {
				return '<li><span class="bl-lobn">@' + esc(o.host) + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · " + firstText(o.f) + (o.ng ? " · no guide" : "") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>";
			}).join("") + "</ul>";
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 12), recs = H.records(ops, 12), box = $("bl-hmine");
			$("bl-hminebox").hidden = !games.length && !recs.length;
			var OPP = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", pro: "Pro computer", expert: "Expert computer", local: "pass and play / practice" };
			box.innerHTML = (games.length ? '<ul class="bl-lob">' + games.map(function (g) {
				return '<li><span class="bl-lobn">' + (g.role === "host" ? "You opened" + (g.to ? " (challenge to @" + esc(g.to) + ")" : "") : "You joined @" + esc(g.host)) + ' <span class="bl-lobv">· ' + (g.v ? esc(B.describe(g.v)) + " · " : "") + new Date(g.ts).toLocaleString() + " · " + txLinks(g.trx) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>';
			}).join("") + "</ul>" : "") +
			(recs.length ? '<h4 class="bl-h4">Saved results (self-reported, checked by replaying the shots)</h4><ul class="bl-lob">' + recs.map(function (o) {
				var res = o.result === "w" ? "Won" : o.result === "l" ? "Lost" : (B.game(o.v).np === 1 ? "Cleared" : "Player " + (o.w + 1) + " won");
				var lk = location.pathname + "?v=" + encodeURIComponent(o.v) + "&sd=" + o.sd + "&m=" + o.shots.join(".");
				return '<li><span class="bl-lobn">' + esc(res) + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · vs " + esc(OPP[o.o] || o.o) + (o.ng ? " · no guide" : "") + " · " + o.shots.length + " shots" + (B.game(o.v).type === "S" ? " · " + o.score[0] + "–" + o.score[1] : "") + " · " + new Date(o.ts).toLocaleString() + " · " + txLinks(o.trx) + '</span></span><a class="tu-btn" href="' + esc(lk) + '">Replay</a></li>';
			}).join("") + "</ul>" : "");
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("bl-hrecent");
			if (!r || r.error || (!(r.games || []).length && !(r.recs || []).length)) { box.innerHTML = '<p class="bl-sub">' + (r && r.error ? esc(r.error) : "Nothing yet.") + "</p>"; return; }
			box.innerHTML = '<ul class="bl-lob">' + (r.games || []).map(function (o) {
				return '<li><span class="bl-lobn">@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · started " + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>';
			}).join("") + (r.recs || []).map(function (o) {
				return '<li><span class="bl-lobn">@' + esc(o.acct) + " saved a result" + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · " + esc(o.res) + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>";
			}).join("") + "</ul>";
		});
	}
	$("bl-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		var p = b.getAttribute("data-hjoin").split("/");
		var watching = mode === "hive" && hv.host === p[0] && hv.gid === p[1];
		if (watching && !(hMe() && hv.R && hv.R.status === "wait" && hv.host !== hMe())) return showTab("play");
		if (mode === "online") return toast("Leave the guest game first.");
		if (hMe()) hiveJoin(p[0], p[1]); else hiveEnter(p[0], p[1], []);
	});
	$("bl-hcreate").addEventListener("click", hiveCreate);
	$("bl-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* in-browser stand-in for /api/billiards (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-billiards:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-billiards:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, seed: g.seed, names: g.names, shots: g.shots, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, ng: g.ng || 0, idle: now - g.at }; };
		if (method === "GET" && /hlobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return !g.joiners.length && !g.cancelled && !g.to && now - g.ts < 3600000; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, f: g.f, ng: g.ng || 0, age: now - g.ts }; }) };
		if (method === "GET" && /hrecent/.test(query)) return { games: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.joiners.length; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, guest: g.joiners[0], age: now - g.ts }; }), recs: (db._recs || []).map(function (o) { return { acct: o.acct, v: o.v, res: o.res, trx: o.trx, age: now - o.ts }; }) };
		if (method === "GET" && /hg=/.test(query)) { var hk = "h:" + decodeURIComponent((/hg=([^&]+)/.exec(query) || [])[1] || ""); return { joiners: db[hk] ? db[hk].joiners : [] }; }
		if (method === "POST" && b.act === "hrec") {
			return HA.ops(b.acct).then(function (ops) {
				var rec = H.records(ops).filter(function (o) { return o.g === b.g; })[0];
				if (!rec) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-billiards:mock") || "{}"); } catch (e) { db2 = {}; }
				db2._recs = [{ acct: b.acct, v: rec.v, res: rec.result === "w" ? "won" : rec.result === "l" ? "lost" : "finished", trx: rec.trx, ts: rec.ts }].concat(db2._recs || []).slice(0, 20);
				localStorage.setItem("mes-billiards:mock", JSON.stringify(db2));
				return { ok: true };
			});
		}
		if (method === "POST" && /^h(open|join|cancel)$/.test(b.act)) {
			var who = b.act === "hjoin" ? b.acct : b.host, want = b.act.slice(1);
			return HA.ops(who).then(function (ops) {
				var op = ops.filter(function (o) { return o.a === want && o.g === b.g && (want === "open" || o.h === b.host); })[0];
				if (!op) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-billiards:mock") || "{}"); } catch (e) { db2 = {}; }
				var k2 = "h:" + b.host + "/" + b.g;
				if (want === "open") db2[k2] = db2[k2] || { host: b.host, g: b.g, v: op.v, f: op.f, ng: op.ng || 0, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
				else if (db2[k2]) { if (want === "join" && db2[k2].joiners.indexOf(who) < 0) db2[k2].joiners.push(who); if (want === "cancel") db2[k2].cancelled = true; }
				localStorage.setItem("mes-billiards:mock", JSON.stringify(db2));
				return { ok: true, joiners: db2[k2] ? db2[k2].joiners : [] };
			});
		}
		if (method === "GET") {
			if (/lobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return !/^h:|^_/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub && now - g.created < 1800000; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, ng: g.ng || 0, age: now - g.created }; }) };
			var id = (/id=([a-z0-9]+)/.exec(query) || [])[1], g0 = db[id];
			return g0 ? { g: pub(g0) } : { error: "Game not found (it may have expired)." };
		}
		var g = db[b.id], seat = g ? g.tok.indexOf(b.key) : -1;
		if (b.act === "new") {
			if (!B.onlineGame(b.v)) return { error: "Unknown game." };
			var nid = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "a"), key = Math.random().toString(36).slice(2), hs = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0;
			var names = [null, null], tok = [null, null]; names[hs] = b.name; tok[hs] = key;
			db[nid] = { id: nid, v: b.v, seed: nid, names: names, tok: tok, shots: [], status: "wait", win: null, round: 0, pub: !!b.pub, first: b.first, ng: b.ng ? 1 : 0, created: now, at: now };
			put(); return { g: pub(db[nid]), key: key, seat: hs };
		}
		if (!g) return { error: "Game not found (it may have expired)." };
		if (b.act === "join") {
			if (g.status !== "wait") return { error: "Someone else already joined that game." };
			var s2 = g.tok[0] ? 1 : 0, k2 = Math.random().toString(36).slice(2);
			g.tok[s2] = k2; g.names[s2] = b.name; g.status = "play"; g.at = now; put();
			return { g: pub(g), key: k2, seat: s2 };
		}
		if (seat < 0) return { error: "That isn't your game." };
		if (b.act === "shot") {
			if (g.status !== "play") return { error: "The game isn't running." };
			if (b.n !== g.shots.length) return { error: "Out of step: the table was refreshed." };
			var s = B.replay(g.v, g.seed, g.shots);
			if (s.turn !== seat) return { error: "It's not your turn." };
			if (!B.apply(s, b.m)) return { error: "That shot isn't allowed." };
			g.shots.push(b.m); g.at = now;
			if (s.win) { g.status = "over"; g.win = { p: s.win.p, why: s.win.why }; }
			put(); return { g: pub(g) };
		}
		if (b.act === "resign" || b.act === "leave") { if (g.status === "play") { g.status = "over"; g.win = { p: 1 - seat, why: b.act === "leave" ? "left" : "resign" }; } g.at = now; put(); return { g: pub(g) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		if (b.act === "claim") { g.status = "over"; g.win = { p: seat, why: "timeout" }; put(); return { g: pub(g) }; }
		if (b.act === "rematch") {
			if (g.status !== "over") return { error: "Finish this game first." };
			g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]]; g.shots = []; g.status = "play"; g.win = null; g.round++; g.seed = g.id + "r" + g.round; g.at = now; put();
			return { g: pub(g) };
		}
		return { error: "Unknown action." };
	}
	if (MOCK) $("bl-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	fillGameSelect();
	if (START && B.game(START) && !(S.cur && S.cur.v === START && !S.cur.done)) S.game = START;
	syncSetup();
	renderRules();
	drawSpin();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qh = q.get("hive"), qv = q.get("v");
	if (joinId || qh || qv || q.get("g")) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	if (q.get("g") && B.game(q.get("g"))) { S.game = q.get("g"); syncSetup(); }
	function blank() { st = B.create(onlineV(), "x"); mode = effOpp(); relayout(); render(); }
	if (qh && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qh)) {
		blank();
		var qp = qh.split("/");
		setTimeout(function () { if (hMe()) hiveJoin(qp[0], qp[1]); else hiveEnter(qp[0], qp[1], []); }, 300);
	} else if (joinId && /^[a-z0-9]{6,12}$/.test(joinId)) {
		blank();
		if (S.online && S.online.id === joinId) api("GET", null, "?id=" + joinId).then(function (r) { if (r.g) startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); });
		else { S.online = null; join(joinId); }
	} else if (qv && B.game(qv)) {
		var sd0 = (q.get("sd") || "").slice(0, 16), mv = (q.get("m") || "").split(".").filter(Boolean);
		var s0 = B.replay(qv, sd0, mv);
		S.online = null; S.hive = null; S.game = qv; save(); syncSetup();
		mode = B.game(qv).np === 1 ? "solo" : "local";
		st = s0 || B.create(qv, sd0); seed = st.seed; human = 0;
		place = st.bih ? defaultPlace() : null;
		relayout(); render();
		toast(s0 && mv.length ? "Game loaded from the link (" + mv.length + " shots)." : "Game loaded from the link.");
	} else if (S.hive && S.hive.host) {
		blank();
		var sh = S.hive;
		setTimeout(function () { hiveEnter(sh.host, sh.gid, []); }, 0);
	} else if (S.online && S.online.id) {
		blank();
		mode = "online"; on.id = S.online.id; on.key = S.online.key; on.seat = S.online.seat;
		api("GET", null, "?id=" + on.id).then(function (r) {
			if (r.g) startOnline({ g: r.g, key: on.key, seat: on.seat });
			else { on.id = null; S.online = null; save(); mode = effOpp(); resumeOrNew(); }
		});
	} else resumeOrNew();
	renderHiveCard();
	$("bl-cam").value = S.cam;
	$("bl-room").value = S.room;
	if (S.dim === "3d") setTimeout(function () { setDim("3d", true); }, 0);
	function resumeOrNew() {
		var c = S.cur;
		if (c && !c.done && c.v === S.game && c.hist && c.hist.length && B.game(c.v)) {
			var s1 = B.replay(c.v, c.seed, c.hist);
			if (s1) {
				st = s1; st._guided = !!c.guided; seed = c.seed; mode = c.mode === "local" || c.mode === "solo" || c.mode === "cpu" ? c.mode : effOpp(); human = c.human || 0;
				place = st.bih ? defaultPlace() : null; autoAimNext();
				relayout(); render(); maybeCpu();
				return;
			}
		}
		newGame(true);
	}
	// for testing in a hidden pane: window.MESBilliardsDebug.state()
	window.MESBilliardsDebug = {
		state: function () { return { v: st.v, seed: st.seed, shots: st.hist.length, turn: st.turn, win: st.win, mode: mode, bih: st.bih, msg: st.msg, busy: busy, anim: !!anim, score: st.score, layout: LY && { w: LY.w, h: LY.h, up: LY.up } }; },
		shoot: function (a, p, sx, sy) { aim = a; power = p; spin = { x: sx || 0, y: sy || 0 }; shoot(); },
		fire: function (p) { power = p; shoot(); },
		aimAt: function (id) { var c = cueXY(); aim = B.angleOf(st.x[id] - c[0], st.y[id] - c[1]); need(); },
		finishAnim: function () { while (anim) { var dn = anim.done; anim = null; if (dn) dn(); if (queue.length) { var it = queue.shift(); anim = { done: it.done }; } } render(); draw(); },
		st: function () { return st; }
	};
})();
