/* MES Free Kicks & Penalties: the page. Physics / rules / computer players / Hive protocol are in lib.js (MESFreeKick), the 3D view in
   view3d.js (FK3D). This file: setup, aiming, the keeper, the 2D view (goal seen from behind the ball + the pitch from above), the
   animation, guest online matches (/api/free-kick) and Hive matches.
   On localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in (localStorage "mes-free-kick:mock") is used, and Hive play
   uses a stand-in chain ("mes-free-kick:hchain") + a per-tab account, so two tabs can play each other. */
(function () {
	"use strict";
	var B = window.MESFreeKick, G = B.G;
	function $(id) { return document.getElementById(id); }
	var root = $("fk");
	if (!root || !B) return;
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function rnd() { return Math.random().toString(36).slice(2, 10); }
	function ago(ms) { var m = Math.round(ms / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; }

	/* ===================================================================== settings ===================================================================== */
	var KEY = "mes-free-kick:v1";
	var S = { mode: "PF", opp: "cpu", first: 0, lv: "medium", plv: "medium", spread: true, live: true, guide: "full", slow: 1, dim: "3d", cam: "behind", pmode: "meter", snd: true,
		power: 24, curl: 0, dip: 0, when: 180, foot: "R", map: "auto", mapBig: false, mapPos: null, mapW: 0, spot: { bx: -6, by: 21, wall: "auto", j: 0, off: 0, kx: null }, stats: {}, name: "", opub: true, ofirst: "host", omode: "P", saved: {} };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in sv) S[k] = sv[k]; } catch (e) { /* defaults */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
	var toastT = 0;
	function toast(msg, html) { var t = $("fk-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("is-on"); }, 4200); }
	function copy(text, done) {
		if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(done); }, function () { prompt("Copy this:", text); });
		else prompt("Copy this:", text);
	}

	/* ===================================================================== the match ===================================================================== */
	// M: what is being played. kind: match (P/F) | practice (PF/PP/PK) | target (T) | challenge (C..)
	var M = null;
	var ph = "aim";              // aim | keep | handover | ready | anim | result | wait | over
	var aim = { x: 2.6, z: 1.6 };
	var dive = { x: 2.4, z: 0.8 };
	var A = null;                // the animation in progress
	var last = null;             // last finished kick (to keep drawing it)
	var mode = "local";          // local | online | hive

	function modeOf(v) { return B.mode(v) || B.mode("PF"); }
	function newMatch(v) {
		var md = modeOf(v || S.mode);
		M = { v: md.id, md: md, seed: rnd(), log: [], n: 0, goals: 0, pts: 0, saves: 0, faced: 0, opp: S.opp, lv: S.lv };
		if (md.np === 2) { M.kind = "match"; M.st = B.create(md.id, M.seed); M.me = S.opp === "cpu" ? +S.first : -1; }
		else if (md.ch) { M.kind = "challenge"; M.ch = md.ch; M.lv = md.ch.gk; }
		else if (md.id === "T") { M.kind = "target"; M.lv = null; }
		else { M.kind = "practice"; M.lv = S.plv === "none" ? null : S.plv; }
		last = null; A = null;
		if (md.id === "PP" || md.id === "PK" || md.id === "C1" || md.id === "C6" || md.id === "C9") aim = { x: -2.6, z: 0.6 };
		next();
	}
	/* the set piece for the current kick */
	function curSetup() {
		if (!M) return B.penalty();
		if (mode !== "local" || M.kind === "match") return B.setupFor(M.st);
		if (M.kind === "challenge") return B.challengeSetup(M.ch);
		if (M.v === "PP" || M.v === "PK" || M.v === "T") return B.penalty();
		var sp = S.spot, n = sp.wall === "auto" ? B.autoWall(sp.bx, sp.by) : +sp.wall;
		var s = B.freeKick(sp.bx, sp.by, { n: n, off: sp.off, j: sp.j });
		if (sp.kx !== null && sp.kx !== undefined) s.kx = sp.kx;
		return s;
	}
	function humanKicks() {
		if (mode === "online") { var s = onState(); return s && B.kicker(s) === on.seat; }
		if (mode === "hive") { var R = hv.R; return !!(R && R.status === "play" && R.players[B.kicker(R.s)] === hMe()); }
		if (M.kind === "match") return M.opp === "local" || B.kicker(M.st) === M.me;
		return M.v !== "PK";
	}
	function humanKeeps() {
		if (mode !== "local") return !humanKicks();
		if (M.kind === "match") return M.opp === "local" || B.kicker(M.st) !== M.me;
		return M.v === "PK";
	}
	function kickN() { return M.kind === "match" ? M.st.kicks.length : M.n; }
	function cpuLevel() { return M.kind === "match" ? M.lv : M.lv; }

	function next() {
		hideBanner();
		A = null;
		if (mode !== "local") { onlinePhase(); render(); return; }
		if (M.kind === "match" && M.st.win) { ph = "over"; showOver(); render(); return; }
		if ((M.kind === "target" && M.n >= 10) || (M.kind === "challenge" && (M.n >= M.ch.balls || M.goals >= M.ch.need))) { ph = "over"; showOver(); render(); return; }
		if (humanKicks()) ph = "aim";
		else {
			// the computer kicks
			var setup = curSetup(), n = kickN(), intended = B.aiKick(setup, M.lv || "medium", M.seed, n);
			M.pendShot = B.applyError(intended, M.seed, n, 1);
			if (S.live) { ph = "ready"; banner('<b>You are the keeper.</b><br>Click in the goal while the ball is in the air to dive there.', "Ready ▶", function () { start(setup, M.pendShot, null, true); }); }
			else ph = "keep";
		}
		render();
	}

	/* the kicker presses Shoot */
	function shoot(power) {
		if (ph !== "aim") return;
		var setup = curSetup(), n = kickN();
		var intended = B.aimFor(setup, aim.x, aim.z, power || S.power, S.curl, S.dip);
		if (mode === "online") return onKick(intended);
		if (mode === "hive") return hiveKick(intended);
		var spreadOn = M.kind === "match" || S.spread;
		var shot = spreadOn ? B.applyError(intended, M.seed, n, 1) : intended;
		M.lastAim = intended;
		if (humanKeeps()) {
			M.pendShot = shot;
			if (S.live) { ph = "handover"; banner("<b>Keeper's turn.</b><br>Kicker, look away from the goal! Keeper: click in the goal while the ball flies to dive.", "I'm the keeper: go ▶", function () { start(setup, shot, null, true); }); }
			else { ph = "handover"; banner("<b>Keeper's turn.</b><br>Hand over: the keeper picks a dive without seeing the shot.", "I'm the keeper ▶", function () { ph = "keep"; hideBanner(); render(); }); }
			render();
			return;
		}
		var act = null, lv = M.lv;
		if (lv) act = M.ch && M.ch.early ? earlyGuess(n) : B.aiKeeper(setup, shot, lv, M.seed, n);
		start(setup, shot, act, false);
	}
	function earlyGuess(n) { var r = B.rng(M.seed + "|eg|" + n); var s = r() < 0.5 ? -1 : 1; return { tx: Math.round(s * (240 + r() * 60)), tz: 60, d: 0 }; }
	/* the keeper (guess mode) presses Ready */
	function keeperReady() {
		if (ph !== "keep") return;
		var act = S.when < 0 ? B.STAY : { tx: Math.round(dive.x * 100), tz: Math.round(dive.z * 100), d: +S.when };
		if (mode === "online") return onKeep(act);
		if (mode === "hive") return hiveKeep(act);
		start(curSetup(), M.pendShot, act, false);
	}

	/* ===================================================================== sound (made in the browser, no files) ===================================================================== */
	var AC = null, noiseBuf = null;
	function audio() {
		if (!S.snd) return null;
		try {
			if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
			if (AC.state === "suspended") AC.resume();
		} catch (e) { return null; }
		return AC;
	}
	function noise(t0, dur, type, f0, f1, q, vol, att) {
		var n = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
		n.buffer = noiseBuf; n.loop = true; fl.type = type; fl.Q.value = q;
		fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
		g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
		n.connect(fl); fl.connect(g); g.connect(AC.destination); n.start(t0); n.stop(t0 + dur + 0.05);
	}
	function tone(t0, dur, type, f0, f1, vol) {
		var o = AC.createOscillator(), g = AC.createGain(); o.type = type;
		o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
		g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
		o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.05);
	}
	function sfx(kind, power) {
		if (!S.snd || !audio()) return;
		var t = AC.currentTime;
		try {
			if (kind === "kick") { var v = 0.35 + clamp(((power || 24) - 10) / 24, 0, 1) * 0.45; tone(t, 0.13, "sine", 150, 45, v); noise(t, 0.06, "bandpass", 1800, 600, 1.2, v * 0.5); }
			else if (kind === "post" || kind === "bar") { tone(t, 0.9, "triangle", 880, 860, 0.22); tone(t, 0.6, "sine", 1760, 1740, 0.12); tone(t, 0.4, "square", 2630, 2600, 0.025); noise(t, 0.05, "highpass", 3000, 2500, 0.7, 0.2); }
			else if (kind === "keeper") { noise(t, 0.09, "lowpass", 900, 300, 0.8, 0.5); tone(t, 0.08, "sine", 110, 60, 0.3); }
			else if (kind === "wall") { noise(t, 0.08, "lowpass", 700, 250, 0.8, 0.45); tone(t, 0.1, "sine", 95, 55, 0.3); }
			else if (kind === "net") { noise(t, 0.35, "bandpass", 4200, 1500, 0.9, 0.18); }
			else if (kind === "goal") { noise(t, 2.6, "bandpass", 650, 900, 0.6, 0.42, 0.35); noise(t + 0.1, 2.3, "bandpass", 1300, 1600, 0.8, 0.18, 0.3); }
			else if (kind === "ooh") { noise(t, 1.3, "bandpass", 420, 300, 1.4, 0.3, 0.2); }
			else if (kind === "whistle") { tone(t, 0.25, "sine", 2900, 2950, 0.1); tone(t + 0.3, 0.45, "sine", 2900, 2920, 0.1); }
			else if (kind === "tick") tone(t, 0.05, "sine", 900, 900, 0.08);
		} catch (e) { /* audio is a nice-to-have */ }
	}

	/* ===================================================================== animation ===================================================================== */
	var RUN = 0.75;
	function start(setup, shot, act, live, opts) {
		opts = opts || {};
		hideBanner();
		var sim = B.simulate(setup, shot, act, { frames: true });
		A = { evI: 0, kicked: false, setup: setup, shot: shot, act: act, live: !!live && !act, sim: sim, t: -RUN, t0: performance.now(), last: performance.now(), wall: B.wallSpots(setup), done: false, onEnd: opts.onEnd, n: opts.n };
		ph = "anim";
		render();
		requestAnimationFrame(tick);
	}
	function liveDive(x, z) {
		if (!A || !A.live || A.act) return;
		var d = Math.max(0, Math.round(A.t * 1000));
		A.act = { tx: Math.round(clamp(x, -5.5, 5.5) * 100), tz: Math.round(clamp(z, 0, 3) * 100), d: d };
		A.sim = B.simulate(A.setup, A.shot, A.act, { frames: true });
		dive = { x: x, z: z };
	}
	function tick(now) {
		if (!A || A.done) return;
		var dt = Math.min(0.05, (now - A.last) / 1000); A.last = now;
		A.t += dt * (A.t < 0 ? 1 : +S.slow);
		if (!A.kicked && A.t >= 0) { A.kicked = true; sfx("kick", A.shot.spd / 100); }
		while (A.sim.ev && A.evI < A.sim.ev.length && A.sim.ev[A.evI][0] <= A.t) { var ev = A.sim.ev[A.evI++][1]; sfx(ev === "goal" ? "net" : ev); }
		if (A.t >= A.sim.t + 0.15) { A.t = A.sim.t; endKick(); return; }
		draw();
		requestAnimationFrame(tick);
	}
	function ballAt(sim, t) {
		var f = sim.frames, n = f.length / 3, u = Math.max(0, t) / B.FRAME_S, i = Math.min(n - 1, Math.floor(u)), j = Math.min(n - 1, i + 1), a = u - i;
		return [f[i * 3] + (f[j * 3] - f[i * 3]) * a, f[i * 3 + 1] + (f[j * 3 + 1] - f[i * 3 + 1]) * a, f[i * 3 + 2] + (f[j * 3 + 2] - f[i * 3 + 2]) * a];
	}
	function endKick() {
		var a = A; a.done = true;
		var r = a.sim, act = a.act || B.STAY;
		last = a;
		if (a.onEnd) { a.onEnd(r); return; }
		var who = humanKicks(), n = kickN();
		var item = { res: r.res, setup: B.setupStr(a.setup), shot: B.shotStr(a.shot), act: B.actStr(act), cross: r.cross, hk: who };
		if (M.kind === "match") {
			B.apply(M.st, a.shot, act);
			stat(M.v, who ? "kick" : "keep", r.res);
		} else {
			M.n++;
			if (r.res === "goal") M.goals++;
			if (M.kind === "target") { item.pts = B.targetPoints(r); M.pts += item.pts; }
			if (M.kind === "challenge") { item.ok = B.challengeOk(M.ch, a.shot, r); if (item.ok) M.goals += 0; }
			if (M.v === "PK") { M.faced++; if (r.res !== "goal") M.saves++; }
			stat(M.v, M.v === "PK" ? "keep" : "kick", r.res);
		}
		if (M.kind === "challenge") { M.goals = M.log.filter(function (x) { return x.ok; }).length + (item.ok ? 1 : 0); }
		M.log.push(item);
		ph = "result";
		sfx(r.res === "goal" ? "goal" : "ooh");
		var txt = B.RES_TEXT[r.res] || r.res;
		if (M.kind === "target") txt += item.pts ? " +" + item.pts : " (no target)";
		if (M.kind === "challenge" && r.res === "goal" && !item.ok) txt = "Goal, but not the way the challenge asks";
		banner('<span class="fk-res fk-res--' + r.res + '">' + esc(txt) + "</span>", null, null);
		render();
		var auto = M.kind === "match" || M.kind === "challenge" || M.kind === "target" || M.v === "PK";
		clearTimeout(nextT);
		nextT = setTimeout(function () { if (ph === "result") next(); }, auto ? 1900 : 1500);
	}
	var nextT = 0;

	/* ===================================================================== banners / status ===================================================================== */
	function banner(html, btn, fn) {
		var b = $("fk-banner");
		b.innerHTML = '<div class="fk-bin">' + html + (btn ? '<br><button type="button" class="fk-shoot fk-bbtn">' + esc(btn) + "</button>" : "") + "</div>";
		b.hidden = false;
		var x = b.querySelector(".fk-bbtn");
		if (x) { x.addEventListener("click", fn); setTimeout(function () { try { x.focus({ preventScroll: true }); } catch (e) { /* old */ } }, 30); }
		b.classList.toggle("is-plain", !btn);
	}
	function hideBanner() { $("fk-banner").hidden = true; }
	function showOver() {
		var h = "";
		if (M.kind === "match") {
			var w = M.st.win, sc = M.st.score;
			if (M.opp === "cpu") h = w.p < 0 ? "A draw after 20 kicks each!" : w.p === M.me ? "<b>You win " + Math.max(sc[0], sc[1]) + "–" + Math.min(sc[0], sc[1]) + "!</b>" : "The computer wins " + Math.max(sc[0], sc[1]) + "–" + Math.min(sc[0], sc[1]) + ".";
			else h = w.p < 0 ? "A draw!" : "<b>Player " + (w.p + 1) + " wins " + sc[w.p] + "–" + sc[1 - w.p] + "!</b>";
			if (M.opp === "cpu") stat(M.v, "match", w.p === M.me ? "w" : w.p < 0 ? "d" : "l");
		} else if (M.kind === "target") { h = "<b>" + M.pts + " points</b> from 10 balls."; var best = (S.stats.Tbest || 0); if (M.pts > best) { S.stats.Tbest = M.pts; save(); h += " A new best!"; } }
		else if (M.kind === "challenge") {
			var ok = M.goals >= M.ch.need;
			h = ok ? "<b>Challenge done!</b> ⭐" : "Not this time: " + M.goals + " of " + M.ch.need + ".";
			if (ok) { S.stats.ch = S.stats.ch || {}; S.stats.ch[M.ch.id] = 1; save(); }
		}
		banner(h, "Play again ↺", function () { newMatch(M.v); });
	}
	function statusText() {
		if (mode === "online") return onStatus();
		if (mode === "hive") return hiveStatus();
		var md = M.md, n = kickN();
		if (ph === "over") return "Finished.";
		if (M.kind === "match") {
			var k = B.kicker(M.st), who = M.opp === "cpu" ? (k === M.me ? "You" : "The computer") : "Player " + (k + 1);
			var role = ph === "keep" || ph === "ready" ? (M.opp === "cpu" ? "You are in goal" : "Player " + (2 - k) + " in goal") : who + " to kick";
			return (md.id === "F" ? "Free kick " : "Penalty ") + (Math.floor(n / 2) + 1) + (n >= 10 ? " (sudden death)" : "") + " · " + role;
		}
		if (M.kind === "target") return "Ball " + Math.min(10, M.n + 1) + " of 10 · " + M.pts + " points";
		if (M.kind === "challenge") return M.ch.name + " · ball " + Math.min(M.ch.balls, M.n + 1) + " of " + M.ch.balls + " · " + M.goals + "/" + M.ch.need;
		if (M.v === "PK") return "Goalkeeper practice · saved " + M.saves + " of " + M.faced;
		return md.name + " · " + M.goals + " goals from " + M.n;
	}
	function renderScore() {
		var box = $("fk-score");
		var st = mode === "online" ? onState() : mode === "hive" ? (hv.R && hv.R.s) : M.kind === "match" ? M.st : null;
		if (!st) { box.innerHTML = ""; box.hidden = true; return; }
		box.hidden = false;
		var names = mode === "online" ? (on.g ? on.g.names.map(function (x) { return x || "…"; }) : ["", ""]) : mode === "hive" ? hv.R.players.map(function (p) { return p ? "@" + p : "…"; }) :
			M.opp === "cpu" ? (M.me === 0 ? ["You", "Computer"] : ["Computer", "You"]) : ["Player 1", "Player 2"];
		var rows = [0, 1].map(function (p) {
			var dots = [], ks = st.kicks.filter(function (k, i) { return i % 2 === p; });
			var shown = Math.max(5, Math.ceil(st.kicks.length / 2));
			for (var i = 0; i < shown; i++) { var k = ks[i]; dots.push('<span class="fk-dot ' + (!k ? "" : k.res === "goal" ? "is-goal" : "is-miss") + '" title="' + (k ? esc(B.RES_TEXT[k.res]) : "to come") + '"></span>'); }
			return '<div class="fk-srow' + (!st.win && B.kicker(st) === p ? " is-turn" : "") + '"><span class="fk-sname">' + esc(names[p]) + '</span><span class="fk-dots">' + dots.join("") + '</span><b class="fk-snum">' + st.score[p] + "</b></div>";
		});
		box.innerHTML = rows.join("");
	}
	function renderLog() {
		var list = mode === "local" && M ? M.log : [];
		if (mode === "online") list = (on.g ? on.g.kicks : []).map(function (k, i) { return { res: k.res, shot: k.shot, hk: (i % 2) === on.seat }; });
		if (mode === "hive" && hv.R && hv.R.s) list = hv.R.s.kicks.map(function (k, i) { return { res: k.res, shot: k.shot, hk: hv.R.players[i % 2] === hMe() }; });
		$("fk-log").innerHTML = list.slice(-12).map(function (it, i) {
			var sh = B.shotParse(it.shot);
			return '<li class="fk-li fk-li--' + it.res + '"><b>' + esc(B.RES_TEXT[it.res]) + "</b>" + (it.pts ? " +" + it.pts : "") + (sh ? ' <span class="fk-lis">' + (sh.spd / 100).toFixed(1) + " m/s" + (Math.abs(sh.side) >= 10 ? " · curl " + (sh.side / 10).toFixed(1) : "") + (Math.abs(sh.top) >= 10 ? " · " + (sh.top > 0 ? "dip " : "float ") + Math.abs(sh.top / 10).toFixed(1) : "") + "</span>" : "") + "</li>";
		}).join("");
	}
	function render() {
		$("fk-status").textContent = M ? statusText() : "";
		renderScore();
		renderLog();
		var kick = ph === "aim", keep = ph === "keep";
		$("fk-kickctl").hidden = !(kick || (ph !== "keep" && !keep && humanKicksSafe()));
		$("fk-keepctl").hidden = !keep;
		var fkset = mode === "local" && M && M.kind === "practice" && M.v === "PF";
		$("fk-fkset").hidden = !fkset;
		root.classList.toggle("fk-candrag", fkset && (ph === "aim" || ph === "result"));
		if (fkset) {
			var s = curSetup();
			$("fk-spot").innerHTML = "<b>" + B.distance(s.bx, s.by).toFixed(1) + " m</b> from goal · " + Math.round(B.angleDeg(s.bx, s.by)) + "° " + (s.bx > 0.3 ? "right" : s.bx < -0.3 ? "left" : "straight on") + " · wall " + s.n;
			$("fk-wall").value = String(S.spot.wall); $("fk-jump").checked = !!S.spot.j; $("fk-shift").value = S.spot.off || 0;
			$("fk-kx").value = Math.round((s.kx || 0) * 100);
			$("fk-mapside").value = S.map;
		}
		$("fk-powerv").textContent = (+S.power).toFixed(1) + " m/s (" + Math.round(S.power * 3.6) + " km/h)";
		$("fk-curlv").textContent = S.curl === 0 ? "none" : Math.abs(S.curl).toFixed(1) + (S.curl > 0 ? " → right" : " ← left") + ((S.curl < 0) === (S.foot !== "L") ? " (inside of the foot)" : " (outside of the foot)");
		$("fk-dipv").textContent = S.dip === 0 ? "none" : S.dip > 0 ? "dip " + S.dip : "float " + (-S.dip);
		$("fk-hint").textContent = hintText();
		meter();
		$("fk-hsave").hidden = !(mode === "local" && M && M.kind === "match" && M.st.win && M.st.win.p >= -1 && !S.saved[M.seed]);
		draw();
	}
	function humanKicksSafe() { try { return M && ph !== "anim" && ph !== "result" && ph !== "over" && ph !== "wait" && humanKicks(); } catch (e) { return false; } }
	function hintText() {
		if (ph === "aim") return "Click in the goal to aim" + (root.classList.contains("fk-candrag") ? " · drag the ball to move it" : "");
		if (ph === "keep") return "Click in the goal where to dive";
		if (ph === "anim" && A && A.live && !A.act) return "Click in the goal to dive!";
		if (ph === "wait") return "Waiting for the other player…";
		return "";
	}

	/* ===================================================================== stats ===================================================================== */
	function stat(v, kind, res) {
		var s = S.stats[v] || (S.stats[v] = {});
		if (kind === "kick") { s.k = (s.k || 0) + 1; if (res === "goal") s.g = (s.g || 0) + 1; }
		if (kind === "keep") { s.f = (s.f || 0) + 1; if (res !== "goal") s.sv = (s.sv || 0) + 1; }
		if (kind === "match") s[res] = (s[res] || 0) + 1;
		save();
	}
	function renderStats() {
		var rows = B.MODES.concat(B.CHALLENGES.map(function (c) { return B.mode(c.id); })).map(function (md) {
			var s = S.stats[md.id]; if (!s) return "";
			return "<tr><td>" + esc(md.name) + "</td><td>" + (s.k ? (s.g || 0) + " / " + s.k + " (" + Math.round(100 * (s.g || 0) / s.k) + "%)" : "–") + "</td><td>" + (s.f ? (s.sv || 0) + " / " + s.f : "–") + "</td><td>" + (s.w || s.l || s.d ? (s.w || 0) + "–" + (s.l || 0) + (s.d ? "–" + s.d : "") : "–") + "</td></tr>";
		}).join("");
		var ch = S.stats.ch || {}, done = B.CHALLENGES.filter(function (c) { return ch[c.id]; }).length;
		$("fk-stats").innerHTML = (rows ? '<div class="fk-tblw"><table class="fk-tbl"><thead><tr><th>Game</th><th>Goals / kicks</th><th>Saves / shots faced</th><th>Won–lost</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="fk-sub">Nothing yet: take some kicks!</p>') +
			'<p><b>Challenges done:</b> ' + done + " of " + B.CHALLENGES.length + (S.stats.Tbest ? " · <b>Target practice best:</b> " + S.stats.Tbest + " points" : "") + '</p><p><button type="button" class="tu-btn" id="fk-sreset">Reset statistics</button></p>';
		$("fk-sreset").addEventListener("click", function () { if (confirm("Reset all statistics?")) { S.stats = {}; save(); renderStats(); } });
	}

	/* ===================================================================== 2D drawing ===================================================================== */
	var cv = $("fk-cv"), ctx = cv.getContext("2d"), mapCv = $("fk-map"), mctx = mapCv.getContext("2d");
	var L = null;                // layout of the 2D view (goal panel + pitch)
	var dark = function () { return document.body.classList.contains("dark-mode"); };
	function eye(s) {
		var dx = -s.bx, dy = G.lineY - s.by, l = Math.sqrt(dx * dx + dy * dy) || 1;
		return { x: s.bx - dx / l * 2.2, y: s.by - dy / l * 2.2, z: 1.55 };
	}
	/* perspective onto the goal plane from behind the ball: world -> goal-plane (X, Z, scale) */
	function proj(E, x, y, z) {
		var den = E.y - y; if (den < 0.3) den = 0.3;
		var s = (E.y - G.lineY) / den;
		return { X: E.x + (x - E.x) * s, Z: E.z + (z - E.z) * s, k: s };
	}
	function sizeCanvas(c, w, h) {
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
		c.style.width = w + "px"; c.style.height = h + "px";
		return dpr;
	}
	function layout() {
		var st = $("fk-stage"), w = st.clientWidth || 600, h = st.clientHeight || 420;
		var dpr = sizeCanvas(cv, w, h);
		var s = A ? A.setup : curSetup();
		var gh = S.dim === "2d" || !v3 ? Math.round(h * (w < 560 ? 0.48 : 0.52)) : h;
		// goal panel: x -5.4..5.4, z -0.3..3.4 (as seen from behind the ball)
		var gw = w - 16, sc = Math.min(gw / 10.8, (gh - 14) / 3.7);
		L = { w: w, h: h, dpr: dpr, gh: gh, gs: sc, gx: w / 2, gz: gh - 8 - 0.3 * sc, s: s };
		// pitch from above
		var ymax = Math.max(20, s.by + 6), xr = Math.max(14, Math.abs(s.bx) + 6), ph2 = h - gh - 8, pw = w - 16;
		var ps = Math.max(0.5, Math.min(pw / (2 * xr), ph2 / (ymax + 3)));
		L.ps = ps; L.px = w / 2; L.py = gh + 8 + 2.5 * ps;
		return L;
	}
	function G2S(X, Z) { return [L.gx + X * L.gs, L.gz - Z * L.gs]; }
	function S2G(px, py) { return { x: (px - L.gx) / L.gs, z: (L.gz - py) / L.gs }; }
	function P2S(x, y) { return [L.px + x * L.ps, L.py + y * L.ps]; }
	function S2P(px, py) { return { x: (px - L.px) / L.ps, y: (py - L.py) / L.ps }; }

	function guidePath(setup) {
		if (S.guide === "off" || ph !== "aim") return null;
		var pw = curPower(), key = B.setupStr(setup) + "|" + aim.x.toFixed(2) + aim.z.toFixed(2) + pw.toFixed(2) + S.curl + S.dip;
		if (guidePath.key === key) return guidePath.val;
		var sh = B.aimFor(setup, aim.x, aim.z, pw, S.curl, S.dip), r = B.simulate(setup, sh, null, { frames: true, noKeeper: true, maxT: 3 });
		var f = r.frames, pts = [], cut = S.guide === "start" ? Math.min(f.length / 3, 28) : f.length / 3;
		for (var i = 0; i < cut; i++) pts.push([f[i * 3], f[i * 3 + 1], f[i * 3 + 2]]);
		guidePath.key = key; guidePath.val = { pts: pts, res: r.res };
		return guidePath.val;
	}
	function keeperNow() {
		if (A) return B.keeperAt(A.setup, A.act, Math.max(0, A.t));
		if (last && ph === "result") return B.keeperAt(last.setup, last.act, last.sim.t);
		return B.keeperAt(curSetup(), null, 0);
	}
	function ballNow() {
		if (A) return ballAt(A.sim, A.t);
		if (last && ph === "result") return ballAt(last.sim, last.sim.t);
		var s = curSetup(); return [s.bx, s.by, G.R];
	}

	function draw() {
		if (!M && mode === "local") return;
		layout();
		var s = L.s;
		if (S.dim === "3d" && v3) { draw3d(s); drawMap(); return; }
		var c = ctx, d = dark();
		c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
		c.clearRect(0, 0, L.w, L.h);
		placeOverlays(0, 0, null);
		drawGoalPanel(c, s, d);
		drawPitch(c, s, d, P2S, L.ps, { x0: 0, y0: L.gh, w: L.w, h: L.h - L.gh });
	}
	function drawGoalPanel(c, s, d) {
		var E = eye(s), gh = L.gh;
		var sky = c.createLinearGradient(0, 0, 0, gh);
		sky.addColorStop(0, d ? "#16212e" : "#bcd9ef"); sky.addColorStop(0.55, d ? "#22303f" : "#e2eef6"); sky.addColorStop(0.56, d ? "#1d4d2b" : "#3f9a4e"); sky.addColorStop(1, d ? "#174023" : "#2f7f3c");
		c.fillStyle = sky; c.fillRect(0, 0, L.w, gh);
		// crowd strip
		var cy0 = G2S(0, 3.4)[1], cy1 = G2S(0, 2.9)[1];
		if (IMG.crowd) { var ch = cy1, cw = ch * IMG.crowd.width / IMG.crowd.height; for (var cx0 = 0; cx0 < L.w; cx0 += cw) c.drawImage(IMG.crowd, cx0, 0, cw, ch); if (d) { c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, 0, L.w, ch); } }
		else {
			c.fillStyle = d ? "#2b3340" : "#8c97a6"; c.fillRect(0, Math.max(0, cy0 - 30), L.w, cy1 - Math.max(0, cy0 - 30));
			for (var i = 0; i < L.w; i += 7) { c.fillStyle = ["#d9480f", "#1c7ed6", "#f8f9fa", "#fab005", "#2f9e44"][(i * 7 + (i >> 3)) % 5]; c.globalAlpha = 0.5; c.fillRect(i, cy1 - 10 - ((i * 13) % 9), 4, 5); }
			c.globalAlpha = 1;
		}
		// ground line
		var gl = G2S(0, 0)[1];
		c.fillStyle = d ? "#1d5a2f" : "#3a944a"; c.fillRect(0, gl, L.w, gh - gl);
		// net
		var a = G2S(-G.halfW, G.barZ), b = G2S(G.halfW, 0);
		c.fillStyle = d ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)"; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
		c.strokeStyle = d ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.55)"; c.lineWidth = 1;
		c.beginPath();
		for (var x = -G.halfW; x <= G.halfW + 0.01; x += 0.25) { var p = G2S(x, 0), q = G2S(x, G.barZ); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
		for (var z = 0; z <= G.barZ + 0.01; z += 0.25) { var p2 = G2S(-G.halfW, z), q2 = G2S(G.halfW, z); c.moveTo(p2[0], p2[1]); c.lineTo(q2[0], q2[1]); }
		c.stroke();
		// targets
		if (M && (M.kind === "target" || (M.ch && M.ch.tgt))) {
			(M.kind === "target" ? B.TARGETS : [M.ch.tgt]).forEach(function (T) {
				var p = G2S(T.x, T.z); c.beginPath(); c.arc(p[0], p[1], T.r * L.gs, 0, 7); c.fillStyle = "rgba(255,212,59,0.28)"; c.fill(); c.strokeStyle = "#ffd43b"; c.lineWidth = 3; c.stroke();
				if (T.pts) { c.fillStyle = "#fff"; c.font = "700 " + Math.round(L.gs * 0.28) + "px system-ui"; c.textAlign = "center"; c.fillText(T.pts, p[0], p[1] + L.gs * 0.1); }
			});
		}
		// keeper
		var k = keeperNow();
		drawKeeperFace(c, k);
		// posts + bar
		c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(3, G.postR * 2 * L.gs); c.lineCap = "round";
		var pl = G2S(-G.postX, 0), pt = G2S(-G.postX, G.barZ + G.postR), pr = G2S(G.postX, G.barZ + G.postR), pb = G2S(G.postX, 0);
		c.beginPath(); c.moveTo(pl[0], pl[1]); c.lineTo(pt[0], pt[1]); c.lineTo(pr[0], pr[1]); c.lineTo(pb[0], pb[1]); c.stroke();
		// wall (projected: players nearer to the eye look bigger)
		var wall = A ? A.wall : B.wallSpots(s), lift = A ? B.wallLift(s, Math.max(0, A.t)) : 0;
		c.globalAlpha = 0.62;
		wall.forEach(function (w) {
			var f = proj(E, w.x, w.y, lift), h = proj(E, w.x, w.y, lift + 1.82), rw = 0.24 * f.k * L.gs;
			var F = G2S(f.X, f.Z), Hd = G2S(h.X, h.Z);
			if (IMG["wall-player"]) { var wim = IMG["wall-player"], wh = F[1] - Hd[1], ww = wh * wim.width / wim.height; c.drawImage(wim, F[0] - ww / 2, Hd[1], ww, wh); return; }
			c.fillStyle = "rgba(28,74,160,0.9)"; c.strokeStyle = "rgba(10,20,50,0.6)"; c.lineWidth = 1;
			c.beginPath(); c.moveTo(F[0] - rw, F[1]); c.lineTo(F[0] - rw * 1.1, Hd[1] + rw * 1.6); c.lineTo(F[0] + rw * 1.1, Hd[1] + rw * 1.6); c.lineTo(F[0] + rw, F[1]); c.closePath(); c.fill(); c.stroke();
			c.fillStyle = "#e6b98f"; c.beginPath(); c.arc(Hd[0], Hd[1] + rw * 0.7, rw * 0.62, 0, 7); c.fill();
			c.fillStyle = "#f8f9fa"; c.fillRect(F[0] - rw, F[1] - (F[1] - Hd[1]) * 0.45, rw * 2, (F[1] - Hd[1]) * 0.12);
		});
		c.globalAlpha = 1;
		// guide
		var gp = guidePath(s);
		if (gp) {
			c.setLineDash([2, 6]); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2.5; c.beginPath();
			gp.pts.forEach(function (pp, i) { var q = proj(E, pp[0], pp[1], pp[2]), Q = G2S(q.X, q.Z); if (i) c.lineTo(Q[0], Q[1]); else c.moveTo(Q[0], Q[1]); });
			c.stroke(); c.setLineDash([]);
		}
		// aim / dive marks
		if (ph === "aim") cross(c, G2S(aim.x, aim.z), "#ffd43b");
		if (ph === "keep" || (A && A.act && A.act.d >= 0)) { var dt = ph === "keep" ? dive : { x: A.act.tx / 100, z: A.act.tz / 100 }; ring(c, G2S(dt.x, dt.z), "#69db7c"); }
		// ball
		var bp = ballNow(), bq = proj(E, bp[0], bp[1], bp[2]), gq = proj(E, bp[0], bp[1], 0), BQ = G2S(bq.X, bq.Z), GQ = G2S(gq.X, gq.Z), br = Math.max(3, G.R * bq.k * L.gs);
		c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(GQ[0], GQ[1], br, br * 0.35, 0, 0, 7); c.fill();
		ballSprite(c, BQ[0], BQ[1], br);
	}
	function cross(c, p, col) { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(p[0], p[1], 12, 0, 7); c.moveTo(p[0] - 18, p[1]); c.lineTo(p[0] + 18, p[1]); c.moveTo(p[0], p[1] - 18); c.lineTo(p[0], p[1] + 18); c.stroke(); }
	function ring(c, p, col) { c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([5, 4]); c.beginPath(); c.arc(p[0], p[1], 15, 0, 7); c.stroke(); c.setLineDash([]); c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], 3, 0, 7); c.fill(); }
	function ballSprite(c, x, y, r) {
		var g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
		g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c9ced6");
		c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
		if (r > 5) { c.fillStyle = "#1e2733"; c.beginPath(); c.arc(x, y, r * 0.32, 0, 7); c.fill(); }
		c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
	}
	var IMG = {};
	["keeper-ready", "keeper-dive", "wall-player", "kicker", "crowd"].forEach(function (n) { var im = new Image(); im.onload = function () { IMG[n] = im; if (!A) draw(); }; im.src = "/free-kick/img/" + n + (n === "crowd" ? ".jpg" : ".png") + "?v=1"; });
	function drawKeeperFace(c, k) {
		var A2 = G2S(k.ax, k.az), H2 = G2S(k.hx, k.hz), sc = L.gs;
		var im = k.dive && k.s > 0.15 ? IMG["keeper-dive"] : IMG["keeper-ready"];
		if (im) {
			var dx = H2[0] - A2[0], dy = H2[1] - A2[1], len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
			c.save();
			if (k.dive && k.s > 0.15) {
				c.translate((A2[0] + H2[0]) / 2, (A2[1] + H2[1]) / 2);
				if (dx < 0) { c.scale(-1, 1); c.rotate(Math.atan2(dy, -dx)); } else c.rotate(ang);
				var w = 2.15 * sc, h = w * im.height / im.width; c.drawImage(im, len / 2 - w * 0.98, -h / 2, w, h);
			} else {
				var hh = 1.95 * sc, ww = hh * im.width / im.height; c.drawImage(im, A2[0] - ww / 2, G2S(0, 0)[1] - hh, ww, hh);
			}
			c.restore();
			return;
		}
		c.strokeStyle = "#a9e34b"; c.lineWidth = 0.36 * sc; c.lineCap = "round";
		c.beginPath(); c.moveTo(A2[0], A2[1]); c.lineTo(H2[0], H2[1]); c.stroke();
		c.fillStyle = "#e6b98f"; var hx = A2[0] + (H2[0] - A2[0]) * 0.78, hy = A2[1] + (H2[1] - A2[1]) * 0.78; c.beginPath(); c.arc(hx, hy, 0.13 * sc, 0, 7); c.fill();
	}
	function drawKickerBack(c, x, y, h) {
		var im = IMG.kicker;
		if (im) { var w = h * im.width / im.height; c.drawImage(im, x - w / 2, y - h, w, h); return; }
		c.fillStyle = "#c92a2a"; c.fillRect(x - h * 0.13, y - h * 0.82, h * 0.26, h * 0.42);
		c.fillStyle = "#f8f9fa"; c.fillRect(x - h * 0.12, y - h * 0.42, h * 0.24, h * 0.14);
		c.strokeStyle = "#e6b98f"; c.lineWidth = h * 0.06; c.beginPath(); c.moveTo(x - h * 0.06, y - h * 0.28); c.lineTo(x - h * 0.08, y); c.moveTo(x + h * 0.06, y - h * 0.28); c.lineTo(x + h * 0.08, y); c.stroke();
		c.fillStyle = "#3b2a20"; c.beginPath(); c.arc(x, y - h * 0.9, h * 0.08, 0, 7); c.fill();
	}
	/* the pitch from above (also the mini map in 3D) */
	function drawPitch(c, s, d, P, ps, box) {
		c.save();
		c.beginPath(); c.rect(box.x0, box.y0, box.w, box.h); c.clip();
		c.fillStyle = d ? "#1b4a29" : "#3c9a4b"; c.fillRect(box.x0, box.y0, box.w, box.h);
		for (var y = 0; y < 60; y += 5) { var a = P(-40, y), b = P(40, y + 2.5); c.fillStyle = d ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.06)"; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
		c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = Math.max(1, 0.12 * ps);
		function rect(x0, y0, x1, y1) { var p = P(x0, y0), q = P(x1, y1); c.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); }
		var gl = P(-40, 0), gr = P(40, 0); c.beginPath(); c.moveTo(gl[0], gl[1]); c.lineTo(gr[0], gr[1]); c.stroke();
		rect(-G.boxX, 0, G.boxX, G.boxY); rect(-G.sixX, 0, G.sixX, G.sixY);
		var sp = P(0, G.penY); c.fillStyle = "#fff"; c.beginPath(); c.arc(sp[0], sp[1], Math.max(1.5, 0.15 * ps), 0, 7); c.fill();
		c.beginPath(); c.arc(sp[0], sp[1], G.arcR * ps, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
		// goal
		var g0 = P(-G.postX, 0), g1 = P(G.postX, -G.depth); c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(g0[0], g1[1], g1[0] - g0[0], g0[1] - g1[1]);
		c.strokeStyle = "#fff"; c.lineWidth = Math.max(2, 0.14 * ps); c.beginPath(); c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g0[1]); c.stroke();
		// keeper
		var k = keeperNow(), ka = P(k.ax, k.y), kh = P(k.hx, k.y);
		c.strokeStyle = "#a9e34b"; c.lineWidth = Math.max(4, 0.4 * ps); c.lineCap = "round";
		c.beginPath(); c.moveTo(ka[0], ka[1] + (k.dive ? 0 : -0.15 * ps)); c.lineTo(kh[0] + (k.dive ? 0 : 0.01), kh[1] + (k.dive ? 0 : 0.15 * ps)); c.stroke();
		if (!k.dive) { c.beginPath(); c.moveTo(ka[0] - 0.4 * ps, ka[1]); c.lineTo(ka[0] + 0.4 * ps, ka[1]); c.stroke(); }
		// wall
		var wall = A ? A.wall : B.wallSpots(s);
		wall.forEach(function (w) { var p = P(w.x, w.y); c.fillStyle = "#1c4aa0"; c.beginPath(); c.arc(p[0], p[1], Math.max(3, 0.24 * ps), 0, 7); c.fill(); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1; c.stroke(); });
		// 9.15 m ring around a free kick
		if (s.n && M && M.v === "PF" && ph === "aim") { var bp0 = P(s.bx, s.by); c.setLineDash([3, 5]); c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = 1; c.beginPath(); c.arc(bp0[0], bp0[1], G.wallDist * ps, 0, 7); c.stroke(); c.setLineDash([]); }
		// guide (from above)
		var gp = guidePath(s);
		if (gp) { c.setLineDash([2, 5]); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2; c.beginPath(); gp.pts.forEach(function (pp, i) { var q = P(pp[0], pp[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke(); c.setLineDash([]); }
		// flight trail
		var sim = A ? A.sim : (last && ph === "result" ? last.sim : null), tt = A ? A.t : sim ? sim.t : 0;
		if (sim && tt > 0) {
			c.strokeStyle = "rgba(255,212,59,0.9)"; c.lineWidth = 2; c.beginPath();
			var f = sim.frames, n = Math.min(f.length / 3, Math.floor(tt / B.FRAME_S) + 1);
			for (var i = 0; i < n; i++) { var q = P(f[i * 3], f[i * 3 + 1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }
			c.stroke();
		}
		// ball + shadow
		var bp = ballNow(), sh = P(bp[0], bp[1]), bh = P(bp[0] + bp[2] * 0.25, bp[1] - bp[2] * 0.6), br = Math.max(3.5, (0.11 + bp[2] * 0.03) * ps * 1.6);
		c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.arc(sh[0], sh[1], Math.max(2.5, 0.11 * ps * 1.4), 0, 7); c.fill();
		ballSprite(c, bh[0], bh[1], br);
		if (root.classList.contains("fk-candrag") && !A) { c.strokeStyle = "rgba(255,212,59,0.95)"; c.lineWidth = 2; c.beginPath(); c.arc(sh[0], sh[1], br + 6, 0, 7); c.stroke(); }
		c.restore();
	}
	/* the mini map in 3D mode */
	var MAP = null;
	function mapSide() { if (S.map === "left" || S.map === "right") return S.map; var s = L && L.s; return s && s.bx > 0.5 ? "left" : "right"; }
	function drawMap() {
		var can = S.dim === "3d" && v3 && mode === "local" && M && M.v === "PF", show = can && S.map !== "off";
		mapCv.hidden = !show; $("fk-mapbar").hidden = !show; $("fk-mapgrip").hidden = !show; $("fk-mapshow").hidden = !(can && S.map === "off");
		if (!show) { placeOverlays(0, 0, null); return; }
		// small on phones, a little bigger on request; never more than ~40% of the picture's height
		var w = Math.round(L.w * (S.mapBig ? 0.36 : 0.24)); w = Math.max(116, Math.min(S.mapBig ? 300 : 200, w, Math.round(L.h * (S.mapBig ? 0.55 : 0.4) / 0.8)));
		if (S.mapW) w = Math.round(clamp(S.mapW, 110, Math.min(L.w * 0.7, L.h * 0.85 / 0.8)));
		var h = Math.round(w * 0.8), dpr = sizeCanvas(mapCv, w, h), s = L.s;
		placeOverlays(w, h, S.mapPos ? "free" : mapSide());
		var ymax = Math.max(24, s.by + 5), xr = Math.max(16, Math.abs(s.bx) + 5), ps = Math.min(w / (2 * xr), h / (ymax + 3));
		MAP = { ps: ps, px: w / 2, py: 2.5 * ps };
		mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawPitch(mctx, s, dark(), function (x, y) { return [MAP.px + x * MAP.ps, MAP.py + y * MAP.ps]; }, ps, { x0: 0, y0: 0, w: w, h: h });
	}

	/* where the map, its buttons, the round Shoot button and the power bar go, so they never sit on top of each other */
	function placeOverlays(mw, mh, side) {
		var W = L.w, H = L.h, os = $("fk-oshoot"), osz = W < 700 ? 72 : 84, gap = 8, mtr = $("fk-meter");
		var mapS = mapCv.style, bar = $("fk-mapbar").style, shw = $("fk-mapshow").style;
		var mside = side === "free" ? "right" : side || mapSide(), grip = $("fk-mapgrip").style, mx, my;
		// map rectangle (left, top) in the picture: a corner, or wherever it was dragged (kept as fractions so it survives resizes)
		if (side === "free") { mx = Math.round(clamp(S.mapPos.x, 0, 1) * Math.max(0, W - mw)); my = Math.round(clamp(S.mapPos.y, 0, 1) * Math.max(0, H - mh)); }
		else { mx = mside === "left" ? gap : W - gap - mw; my = H - gap - mh; }
		MAPR = { x: mx, y: my, w: mw, h: mh };
		mapS.left = mx + "px"; mapS.top = my + "px"; mapS.right = "auto"; mapS.bottom = "auto";
		bar.left = mx + 4 + "px"; bar.right = "auto"; bar.top = my + 4 + "px"; bar.bottom = "auto";
		// the resize corner sits on the corner nearest the middle of the picture, so dragging it outwards grows the map
		var gl = mx + mw / 2 > W / 2, gt = my + mh / 2 > H / 2;
		grip.left = (gl ? mx - 2 : mx + mw - 20) + "px"; grip.top = (gt ? my - 2 : my + mh - 20) + "px";
		grip.cursor = gl === gt ? "nwse-resize" : "nesw-resize"; GRIP = { l: gl, t: gt };
		shw.left = mside === "left" ? gap + "px" : "auto"; shw.right = mside === "right" ? gap + "px" : "auto";
		// Shoot: bottom right; above the map when the map is on the right (or on the left when there is no room above it)
		var shootLeft = false, sb = 14;
		if (side === "right") { if (H - mh - gap * 2 >= osz + 60) sb = mh + gap + 12; else shootLeft = true; }
		if (side === "free") {      // moved by hand: Shoot stays bottom right unless the map is on top of it
			var sx0 = W - 14 - osz, sy0 = H - 14 - osz;
			if (mx < sx0 + osz && mx + mw > sx0 && my < sy0 + osz && my + mh > sy0) shootLeft = true;
			side = null;
		}
		os.style.right = shootLeft ? "auto" : "14px"; os.style.left = shootLeft ? "14px" : "auto"; os.style.bottom = sb + "px";
		// power bar: middle of the left edge; when the map (or Shoot) takes the bottom left, it goes to the top of the other free edge
		var trk = mtr.querySelector(".fk-mtrack"), st2 = mtr.style;
		if (side === "left" && !shootLeft) {      // map bottom left, Shoot bottom right: the bar on the right, above Shoot
			var avR = H - (sb + osz) - 40 - 26;
			trk.style.height = Math.max(70, Math.min(240, H * 0.42, avR)) + "px";
			st2.left = "auto"; st2.right = 14 + (osz - 26) / 2 + "px"; st2.top = "36px"; st2.transform = "none";
		} else if (shootLeft) {                    // map bottom right and no room above it: Shoot bottom left, the bar above it
			var avL = H - (14 + osz) - 40 - 26;
			trk.style.height = Math.max(70, Math.min(240, H * 0.42, avL)) + "px";
			st2.left = 14 + (osz - 26) / 2 + "px"; st2.right = "auto"; st2.top = "36px"; st2.transform = "none";
		} else {
			trk.style.height = Math.max(90, Math.min(260, H * 0.46)) + "px";
			st2.left = "12px"; st2.right = "auto"; st2.top = "50%"; st2.transform = "translateY(-50%)";
		}
	}
	/* move the map (drag ✥) and resize it (drag the corner) */
	var MAPR = null, GRIP = null;
	function mapDrag(el, onMove, onEnd) {
		el.addEventListener("pointerdown", function (e) {
			if (e.button > 0 || !MAPR) return;
			e.preventDefault(); e.stopPropagation();
			try { el.setPointerCapture(e.pointerId); } catch (x) { /* old */ }
			var st = { x: e.clientX, y: e.clientY, r: { x: MAPR.x, y: MAPR.y, w: MAPR.w, h: MAPR.h } };
			function mv(ev) { onMove(st, ev.clientX - st.x, ev.clientY - st.y); render(); }
			function up() { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); save(); if (onEnd) onEnd(); }
			el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
		});
	}
	function setMapRect(x, y, w, h) {
		var W = L.w, H = L.h;
		S.mapPos = { x: W - w > 0 ? clamp(x / (W - w), 0, 1) : 0, y: H - h > 0 ? clamp(y / (H - h), 0, 1) : 0 };
	}
	mapDrag($("fk-mapmove"), function (st, dx, dy) { if (S.map === "off") S.map = "auto"; setMapRect(st.r.x + dx, st.r.y + dy, st.r.w, st.r.h); });
	mapDrag($("fk-mapgrip"), function (st, dx, dy) {
		var r = st.r, g = GRIP || { l: true, t: true }, grow = Math.max(g.l ? -dx : dx, (g.t ? -dy : dy) / 0.8);
		var w = Math.round(clamp(r.w + grow, 110, Math.min(L.w * 0.7, L.h * 0.85 / 0.8))), h = Math.round(w * 0.8);
		S.mapW = w;
		// keep the far corner where it was
		setMapRect(g.l ? r.x + r.w - w : r.x, g.t ? r.y + r.h - h : r.y, w, h);
	});
	$("fk-mapgrip").addEventListener("dblclick", function () { S.mapW = 0; S.mapBig = false; save(); render(); });
	$("fk-mapflip").addEventListener("click", function () { S.mapPos = null; S.map = mapSide() === "left" ? "right" : "left"; save(); render(); });
	$("fk-maphide").addEventListener("click", function () { S.map = "off"; save(); render(); });
	$("fk-mapshow").addEventListener("click", function () { S.map = "auto"; save(); render(); });
	$("fk-mapsize").addEventListener("click", function () { S.mapBig = !S.mapBig; S.mapW = 0; save(); render(); });
	$("fk-mapside").addEventListener("change", function () { S.map = this.value; S.mapPos = null; save(); render(); });

	/* ===================================================================== 3D ===================================================================== */
	var v3 = null, v3loading = false;
	function ensure3d() {
		if (v3 || v3loading || !window.FK3D) return;
		v3loading = true; $("fk-load").hidden = false;
		window.FK3D.create($("fk-3d")).then(function (v) { v3 = v; v3loading = false; $("fk-load").hidden = true; applyDim(); render(); }, function (e) {
			v3loading = false; $("fk-load").hidden = true; S.dim = "2d"; save(); applyDim(); toast("3D is not available here (" + (e && e.message || "no WebGL") + "): showing the 2D view.");
		});
	}
	function applyDim() {
		var is3 = S.dim === "3d";
		if (is3 && !v3) ensure3d();
		$("fk-3d").hidden = !(is3 && v3);
		cv.hidden = is3 && !!v3;
		$("fk-dim").textContent = is3 ? "2D" : "3D";
		$("fk-cam").hidden = !is3;
		$("fk-cam").value = S.cam;
		draw();
	}
	function draw3d(s) {
		var st = $("fk-stage");
		v3.size(st.clientWidth, st.clientHeight);
		var gp = guidePath(s), k = keeperNow(), bp = ballNow();
		var prog = A ? clamp(1 + A.t / RUN, 0, 1) : ph === "result" ? 1 : 0;
		v3.frame({
			setup: s, wall: A ? A.wall : B.wallSpots(s), lift: A ? B.wallLift(s, Math.max(0, A.t)) : 0, ball: bp, keeper: k, kicker: prog, flying: !!(A && A.t > 0),
			guide: gp ? gp.pts : null, aim: ph === "aim" ? aim : null, dive: ph === "keep" ? dive : (A && A.act && A.act.d >= 0 ? { x: A.act.tx / 100, z: A.act.tz / 100 } : null),
			targets: M && M.kind === "target" ? B.TARGETS : M && M.ch && M.ch.tgt ? [M.ch.tgt] : null, cam: S.cam, dark: dark(), foot: S.foot,
			t: A ? A.t : ph === "result" && last ? 9 : 0, anim: !!A, run: RUN, settle: !A && ph === "result" && !!last, res: last && ph === "result" ? last.sim.res : null, charge: charge ? charge.v : 0
		});
		$("fk-camreset").hidden = !v3.isFree();
		if (!(S.dim === "3d" && v3 && mode === "local" && M && M.v === "PF")) placeOverlays(0, 0, null);
	}

	/* ===================================================================== input ===================================================================== */
	function stagePoint(e) {
		var r = $("fk-stage").getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function goalPick(e) {
		if (S.dim === "3d" && v3) return v3.pickGoal(e.clientX, e.clientY);
		var p = stagePoint(e);
		if (p.y > L.gh) return null;
		return S2G(p.x, p.y);
	}
	function onGoal(g) {
		if (!g) return false;
		var x = clamp(g.x, -5.5, 5.5), z = clamp(g.z, 0, 3.4);
		if (ph === "aim") { aim = { x: x, z: Math.max(0.11, z) }; render(); return true; }
		if (ph === "keep") { dive = { x: x, z: z }; render(); return true; }
		if (ph === "anim" && A && A.live && !A.act) { liveDive(x, z); return true; }
		return false;
	}
	/* pointers: in the goal = aim (or dive); anywhere else in 3D = orbit the camera (right / middle button or Shift = move it,
	   two fingers = pinch to zoom and move, wheel = zoom). In 2D: the pitch from above = move the free-kick spot. */
	var drag = null, ptrs = {}, pinch = null, lastScroll = 0;
	window.addEventListener("scroll", function () { lastScroll = performance.now(); }, { passive: true });
	function in3d(e) { return S.dim === "3d" && v3 && e.target.closest && e.target.closest("#fk-3d"); }
	function pinchInfo() { var ids = Object.keys(ptrs); if (ids.length < 2) return null; var a = ptrs[ids[0]], b = ptrs[ids[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
	$("fk-stage").addEventListener("pointerdown", function (e) {
		if (e.target.closest(".fk-banner") || e.target.closest("button, select, input, .fk-meter")) return;
		var p = stagePoint(e);
		ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
		if (in3d(e) && Object.keys(ptrs).length >= 2) { drag = null; pinch = pinchInfo(); e.preventDefault(); return; }
		// dragging the ball on the pitch (2D) / the mini map (3D)
		if (root.classList.contains("fk-candrag") && e.button === 0) {
			if (e.target === mapCv && MAP) { drag = { map: true }; mapCv.setPointerCapture(e.pointerId); moveSpot(e); e.preventDefault(); return; }
			if (S.dim === "2d" && p.y > L.gh) { drag = { map: false }; cv.setPointerCapture(e.pointerId); moveSpot(e); e.preventDefault(); return; }
		}
		if (e.target === mapCv) return;
		if (in3d(e) && root.classList.contains("fk-candrag") && e.button === 0 && !e.shiftKey && nearBall3d(e)) {
			drag = { ground: true }; v3.holdCam = true;
			try { e.target.setPointerCapture(e.pointerId); } catch (x) { /* old */ }
			e.preventDefault(); return;
		}
		if (in3d(e)) {
			var panIt = e.button === 1 || e.button === 2 || e.shiftKey;
			if (!panIt) { var g3 = goalPick(e); if (g3 && onGoal(g3)) { drag = { goal: true }; e.preventDefault(); return; } }
			drag = { cam: panIt ? "pan" : "orbit", x: e.clientX, y: e.clientY, moved: 0 }; v3.dragging = true;
			try { e.target.setPointerCapture(e.pointerId); } catch (x) { /* old */ }
			e.preventDefault(); return;
		}
		if (e.button > 0) return;
		var g = goalPick(e);
		if (g && onGoal(g)) { drag = { goal: true }; e.preventDefault(); }
	});
	window.addEventListener("pointermove", function (e) {
		if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
		if (pinch && v3) { var q = pinchInfo(); if (q) { if (q.d > 10 && pinch.d > 10) v3.zoom(pinch.d / q.d); v3.pan(q.x - pinch.x, q.y - pinch.y); pinch = q; draw(); } return; }
		if (!drag) { if (v3 && S.dim === "3d" && e.target.closest && e.target.closest("#fk-3d")) v3.hover(e.clientX, e.clientY, root.classList.contains("fk-candrag") && nearBall3d(e)); return; }
		if (drag.cam) {
			var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
			if (drag.cam === "pan") v3.pan(dx, dy); else v3.orbit(dx, dy);
			$("fk-camreset").hidden = false; return;
		}
		if (drag.goal) { if (ph === "aim" || ph === "keep") onGoal(goalPick(e)); return; }
		moveSpot(e);
	});
	function ptrUp(e) {
		delete ptrs[e.pointerId];
		if (pinch) { if (Object.keys(ptrs).length < 2) pinch = null; return; }
		if (drag && drag.cam) { if (v3) v3.dragging = false; drag = null; return; }
		if (drag && drag.ground && v3) { v3.holdCam = false; v3.kick(); }
		if (drag && !drag.goal) { save(); render(); }
		drag = null;
	}
	window.addEventListener("pointerup", ptrUp);
	window.addEventListener("pointercancel", ptrUp);
	$("fk-3d").addEventListener("contextmenu", function (e) { e.preventDefault(); });
	$("fk-3d").addEventListener("dblclick", function (e) { if (v3 && v3.isFree() && !goalPick(e)) resetCam(); });
	$("fk-3d").addEventListener("wheel", function (e) {
		if (!v3 || S.dim !== "3d") return;
		if (performance.now() - lastScroll < 350 && !e.ctrlKey) return;     // the page is being scrolled past the game
		e.preventDefault();
		v3.zoom(Math.exp((e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0012));
		$("fk-camreset").hidden = false;
	}, { passive: false });
	/* is the pointer on (or close to) the ball in the 3D picture? */
	function nearBall3d(e) {
		if (!v3 || A) return false;
		var bs = v3.ballScreen(); if (!bs.front) return false;
		if (Math.hypot(e.clientX - bs.x, e.clientY - bs.y) < 34) return true;
		var g = v3.pickGround(e.clientX, e.clientY), s = curSetup();
		return !!g && Math.hypot(g.x - s.bx, g.y - s.by) < 0.9;
	}
	function moveSpot(e) {
		var x, y;
		if (drag && drag.ground) { var g = v3 && v3.pickGround(e.clientX, e.clientY); if (!g) return; x = g.x; y = g.y; }
		else if (drag && drag.map) { var r = mapCv.getBoundingClientRect(); x = (e.clientX - r.left - MAP.px) / MAP.ps; y = (e.clientY - r.top - MAP.py) / MAP.ps; }
		else { var p = stagePoint(e), w = S2P(p.x, p.y); x = w.x; y = w.y; }
		x = clamp(Math.round(x * 2) / 2, -30, 30); y = clamp(Math.round(y * 2) / 2, 6, 45);
		if (B.inBox(x, y)) { if (Math.abs(x) < G.boxX - 0.01) { if (y > G.boxY - 3) y = G.boxY + 0.5; else x = x < 0 ? -G.boxX - 0.5 : G.boxX + 0.5; } }
		S.spot.bx = x; S.spot.by = y; S.spot.kx = null;
		guidePath.key = null;
		render();
	}
	/* sliders + buttons */
	function bindRange(id, key, fn) { var el = $(id); el.value = S[key]; el.addEventListener("input", function () { S[key] = +this.value; guidePath.key = null; save(); render(); if (fn) fn(); }); }
	bindRange("fk-power", "power"); bindRange("fk-curl", "curl"); bindRange("fk-dip", "dip");
	var STYLES = { place: [22, 0, 0], curl: [25, 7, 2], dip: [27, 0, 7], knuckle: [29, 0, 0], chip: [14, 0, -4], blast: [32, 0, 1] };
	root.querySelector(".fk-styles").addEventListener("click", function (e) {
		var b = e.target.closest("[data-style]"); if (!b) return;
		var st = STYLES[b.getAttribute("data-style")], s = curSetup();
		// a curler bends the way the kicking foot naturally curls it (inside of the right foot = right to left)
		S.power = st[0]; S.curl = st[1] * (b.getAttribute("data-style") === "curl" && S.foot !== "L" ? -1 : 1); S.dip = st[2];
		if (b.getAttribute("data-style") === "chip") { aim.z = Math.max(aim.z, 1.2); }
		["power", "curl", "dip"].forEach(function (k) { $("fk-" + k).value = S[k]; });
		guidePath.key = null; save(); render();
	});
	/* Shoot: hold the button (or Space) and the power bar swings up and down; let go at the power you want.
	   With "Power: slider" a press shoots at once with the slider's power. */
	var charge = null, PMIN = 10, PMAX = 34, SWEEP = 0.95;
	function curPower() { return charge ? PMIN + charge.v * (PMAX - PMIN) : +S.power; }
	function chargeStart() {
		if (ph !== "aim" || charge) return;
		audio();
		if (S.pmode === "slider") { shoot(S.power); return; }
		charge = { t0: performance.now(), v: 0 };
		root.classList.add("fk-charging");
		(function swing() {
			if (!charge) return;
			var el = (performance.now() - charge.t0) / 1000, u = el / SWEEP % 2;
			charge.v = u < 1 ? u : 2 - u;
			meter(); draw();
			requestAnimationFrame(swing);
		})();
	}
	function chargeEnd(cancel) {
		if (!charge) return;
		var c = charge, held = performance.now() - c.t0, p = PMIN + c.v * (PMAX - PMIN);
		charge = null; root.classList.remove("fk-charging"); meter();
		if (cancel) { guidePath.key = null; render(); return; }
		if (held < 110) { toast("Hold Shoot (or Space): the power bar goes up and down. Let go at the power you want."); guidePath.key = null; render(); return; }
		shoot(Math.round(p * 10) / 10);
	}
	function meter() {
		var show = ph === "aim" && S.pmode === "meter";
		$("fk-meter").hidden = !show; $("fk-oshoot").hidden = !(ph === "aim" || ph === "keep");
		$("fk-oshoot").classList.toggle("is-gk", ph === "keep");
		$("fk-oshoot").querySelector("span").textContent = ph === "keep" ? "Ready" : S.pmode === "meter" ? (charge ? "Let go!" : "Hold") : "Shoot";
		if (!show) return;
		var v = charge ? charge.v : (S.power - PMIN) / (PMAX - PMIN), pw = curPower();
		$("fk-mfill").style.height = (charge ? v * 100 : 0) + "%";
		$("fk-mfill").style.background = "hsl(" + Math.round(120 - v * 120) + ",85%,48%)";
		$("fk-mmark").style.bottom = clamp((S.power - PMIN) / (PMAX - PMIN), 0, 1) * 100 + "%";
		$("fk-mval").textContent = charge ? pw.toFixed(0) + " m/s" : "Power";
	}
	["fk-oshoot"].forEach(function (id) {
		var el = $(id);
		el.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return;
			e.preventDefault(); e.stopPropagation();
			if (ph === "keep") { keeperReady(); return; }
			try { el.setPointerCapture(e.pointerId); } catch (x) { /* old */ }
			chargeStart();
		});
		el.addEventListener("pointerup", function (e) { e.stopPropagation(); chargeEnd(false); });
		el.addEventListener("pointercancel", function () { chargeEnd(true); });
		el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	});
	segBind("fk-foot", "foot", null, function () { if (S.curl) { S.curl = -S.curl; $("fk-curl").value = S.curl; } guidePath.key = null; save(); render(); });
	segBind("fk-gl", "guide", null, function () { $("fk-guide").value = S.guide; guidePath.key = null; render(); });
	[].forEach.call(root.querySelectorAll("[data-spot]"), function (b) { b.addEventListener("click", function () { var v = b.getAttribute("data-spot").split(","); S.spot.bx = +v[0]; S.spot.by = +v[1]; S.spot.kx = null; guidePath.key = null; save(); render(); }); });
	segBind("fk-when", "when", function (v) { return +v; }, render);
	segBind("fk-opp", "opp", null, function () { syncSetup(); newMatch(); });
	segBind("fk-first", "first", function (v) { return +v; }, function () { newMatch(); });
	segBind("fk-lv", null, null, null, function (v) {
		var md = modeOf(S.mode);
		if (md.np === 2) S.lv = v === "none" ? "medium" : v; else S.plv = v;
		save(); syncSetup();
		if (M && M.kind === "match") newMatch(); else if (M) { M.lv = v === "none" ? null : v; if (M.ch) M.lv = M.ch.gk; render(); }
	});
	function segBind(id, key, conv, after, custom) {
		var box = $(id);
		box.addEventListener("click", function (e) {
			var b = e.target.closest("[data-v]"); if (!b) return;
			var v = b.getAttribute("data-v");
			if (custom) custom(v); else { S[key] = conv ? conv(v) : v; save(); }
			syncSegs();
			if (after) after();
		});
	}
	function syncSegs() {
		function set(id, val) { [].forEach.call($(id).querySelectorAll("[data-v]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(val))); }); }
		set("fk-opp", S.opp); set("fk-first", S.first); set("fk-when", S.when); set("fk-ofirst", S.ofirst); set("fk-foot", S.foot); set("fk-gl", S.guide);
		var md = modeOf(S.mode);
		set("fk-lv", md.np === 2 ? S.lv : S.plv);
		$("fk-gk").value = md.np === 2 ? S.lv : S.plv;
		$("fk-lv-l").textContent = md.np === 2 ? "Computer level (kicks and keeps)" : md.id === "PK" ? "Kicker level" : "Keeper level";
		[].forEach.call($("fk-gk").options, function (o) { o.hidden = o.value === "none" && md.np === 2; });
	}
	function syncSetup() {
		var md = modeOf(S.mode);
		$("fk-mode").value = md.id;
		root.classList.toggle("fk-ismatch", md.np === 2);
		root.classList.toggle("fk-iscpu", md.np === 2 && S.opp === "cpu");
		root.classList.toggle("fk-nolv", !!md.ch || md.id === "T" || (md.np === 2 && S.opp === "local"));
		$("fk-gkwrap").hidden = !!md.ch || md.id === "T" || md.id === "PK" || (md.np === 2 && S.opp === "local") || mode !== "local";
		root.classList.toggle("fk-ispractice", md.np === 1 && md.id !== "PK");
		$("fk-desc").textContent = md.desc + (md.ch && S.stats.ch && S.stats.ch[md.id] ? " ✓ Done before." : "");
		$("fk-spread").checked = S.spread; $("fk-live").checked = S.live; $("fk-guide").value = S.guide; $("fk-slow").value = String(S.slow);
		syncSegs();
	}
	(function fillModes() {
		var sel = $("fk-mode"), groups = {};
		B.MODES.concat(B.CHALLENGES.map(function (c) { return B.mode(c.id); })).forEach(function (md) {
			var g = groups[md.group] || (groups[md.group] = document.createElement("optgroup")); g.label = md.group;
			var o = document.createElement("option"); o.value = md.id; o.textContent = md.name; g.appendChild(o);
		});
		Object.keys(groups).forEach(function (k) { sel.appendChild(groups[k]); });
	})();
	$("fk-mode").addEventListener("change", function () { if (mode !== "local") return toast("Leave the online match first."); S.mode = this.value; save(); syncSetup(); newMatch(); });
	$("fk-spread").addEventListener("change", function () { S.spread = this.checked; save(); });
	$("fk-live").addEventListener("change", function () { S.live = this.checked; save(); if (mode === "local" && (ph === "keep" || ph === "ready")) next(); });
	$("fk-guide").addEventListener("change", function () { S.guide = this.value; guidePath.key = null; save(); syncSegs(); render(); });
	$("fk-slow").addEventListener("change", function () { S.slow = +this.value; save(); });
	$("fk-new").addEventListener("click", function () { if (mode === "online") return onLeave(); if (mode === "hive") return hiveLeave(); newMatch(); });
	$("fk-dim").addEventListener("click", function () { S.dim = S.dim === "3d" ? "2d" : "3d"; save(); applyDim(); });
	$("fk-cam").addEventListener("change", function () { S.cam = this.value; save(); if (v3) v3.resetView(); draw(); });
	function resetCam() { if (v3) v3.resetView(); draw(); }
	$("fk-camreset").addEventListener("click", resetCam);
	$("fk-pmode").value = S.pmode; $("fk-pmode").addEventListener("change", function () { S.pmode = this.value; save(); render(); });
	function syncSnd() { $("fk-snd").textContent = S.snd ? "🔊" : "🔇"; $("fk-snd").setAttribute("aria-pressed", String(!!S.snd)); }
	$("fk-snd").addEventListener("click", function () { S.snd = !S.snd; save(); syncSnd(); if (S.snd) { audio(); sfx("tick"); } });
	syncSnd();
	$("fk-gk").addEventListener("change", function () { var b2 = $("fk-lv").querySelector('[data-v="' + this.value + '"]'); if (b2) b2.click(); });
	$("fk-rand").addEventListener("click", randomSpot);
	function randomSpot() { var sp = B.randomSpot(Math.random); S.spot.bx = sp.bx; S.spot.by = sp.by; S.spot.kx = null; guidePath.key = null; save(); render(); }
	$("fk-wall").addEventListener("change", function () { S.spot.wall = this.value === "auto" ? "auto" : +this.value; S.spot.kx = null; guidePath.key = null; save(); render(); });
	$("fk-jump").addEventListener("change", function () { S.spot.j = this.checked ? 1 : 0; save(); render(); });
	$("fk-shift").addEventListener("input", function () { S.spot.off = +this.value; guidePath.key = null; save(); render(); });
	$("fk-kx").addEventListener("input", function () { S.spot.kx = +this.value / 100; save(); render(); });
	$("fk-autokx").addEventListener("click", function () { S.spot.kx = null; save(); render(); });

	document.addEventListener("keydown", function (e) {
		if (e.target.closest && e.target.closest("input, select, textarea") && e.target.type !== "range") return;
		if (!root.offsetParent && !document.fullscreenElement) return;
		var k = e.key, step = e.shiftKey ? 0.3 : 0.1;
		if (ph === "anim" && A && A.live && !A.act && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp")) {
			var s = A.setup, hi = e.shiftKey;
			liveDive(k === "ArrowLeft" ? (s.kx || 0) - 2.8 : k === "ArrowRight" ? (s.kx || 0) + 2.8 : (s.kx || 0), k === "ArrowUp" ? 2.3 : hi ? 1.9 : 0.6);
			e.preventDefault(); return;
		}
		if (k === " " && (ph === "aim" || ph === "keep")) { e.preventDefault(); if (e.repeat) return; if (ph === "aim") chargeStart(); else keeperReady(); return; }
		if (k === "Escape" && charge) { chargeEnd(true); return; }
		if (k.indexOf("Arrow") === 0 && (ph === "aim" || ph === "keep")) {
			if (e.target.type === "range") return;
			var t = ph === "aim" ? aim : dive;
			if (k === "ArrowLeft") t.x -= step; if (k === "ArrowRight") t.x += step; if (k === "ArrowUp") t.z += step; if (k === "ArrowDown") t.z = Math.max(0.11, t.z - step);
			e.preventDefault(); render(); return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (k === "v" || k === "V") $("fk-dim").click();
		else if ((k === "c" || k === "C") && S.dim === "3d") { var o = ["behind", "ball", "keeper", "tv", "high"]; S.cam = o[(o.indexOf(S.cam) + 1) % o.length]; $("fk-cam").value = S.cam; save(); draw(); }
		else if ((k === "r" || k === "R") && !$("fk-fkset").hidden) randomSpot();
		else if ((k === "0" || k === "Home") && v3 && v3.isFree()) resetCam();
		else if (k === "m" || k === "M") $("fk-snd").click();
		else if ((k === "+" || k === "=" || k === "-") && v3 && S.dim === "3d") { v3.zoom(k === "-" ? 1.15 : 0.87); }
		else if (k === "n" || k === "N") $("fk-new").click();
	});
	document.addEventListener("keyup", function (e) { if (e.key === " " && charge) { e.preventDefault(); chargeEnd(false); } });
	window.addEventListener("blur", function () { chargeEnd(true); });
	window.addEventListener("resize", function () { draw(); });
	if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe($("fk-stage"));
	new MutationObserver(function () { draw(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	/* tabs */
	$("fk-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) showTab(b.getAttribute("data-t")); });
	function showTab(t) {
		[].forEach.call($("fk-tabs").querySelectorAll("[data-t]"), function (b) { var on2 = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", String(on2)); b.tabIndex = on2 ? 0 : -1; $("fk-p-" + b.getAttribute("data-t")).hidden = !on2; });
		if (t === "stats") renderStats();
		if (t === "online") { loadLobby(); renderHiveCard(); loadHiveLobby(); loadRecent(); }
		if (t === "play") setTimeout(draw, 20);
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, timer: null, seen: 0, sending: false };
	var API = "/api/free-kick";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("fk-name").value || "").trim().slice(0, 24); return n || "Guest"; }
	$("fk-name").value = S.name || "";
	$("fk-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("fk-opub").checked = S.opub !== false;
	$("fk-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("fk-omode").value = S.omode || "P";
	$("fk-omode").addEventListener("change", function () { S.omode = this.value; save(); });
	segBind("fk-ofirst", "ofirst");
	function onState() { if (!on.g) return null; return B.replay(on.g.v, on.g.id + "r" + on.g.round, on.g.kicks.map(function (k) { return k.shot + "/" + k.act; })); }
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.seen = r.g.kicks.length;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online"; M = M || { log: [] };
		showTab("play"); onlinePhase(); render(); poll(0);
	}
	$("fk-ocreate").addEventListener("click", function () {
		if (mode !== "local") return toast("Leave the match you are in first.");
		api("POST", { act: "new", v: S.omode, name: myName(), pub: S.opub !== false, first: S.ofirst }).then(function (r) { if (r.error) return toast(r.error); startOnline(r); toast("Match made: copy the link and send it to a friend."); });
	});
	function join(id) {
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) { if (r.error) return toast(r.error); startOnline(r); });
	}
	function poll(delay) { clearTimeout(on.timer); on.timer = setTimeout(function () {
		if (mode !== "online") return;
		api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) gotGame(r.g); poll(document.hidden ? 6000 : on.g && on.g.status === "play" ? 1500 : 3000); });
	}, delay); }
	function gotGame(g) {
		var prev = on.g; on.g = g;
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Your opponent") + " joined!");
		if (prev && g.round !== prev.round) { on.seen = 0; toast("Rematch!"); }
		if (g.kicks.length > on.seen && !A) {
			var i = on.seen, k = g.kicks[i]; on.seen = i + 1;
			var st = B.replay(g.v, g.id + "r" + g.round, g.kicks.slice(0, i).map(function (x) { return x.shot + "/" + x.act; }));
			start(B.setupFor(st), B.shotParse(k.shot), B.actParse(k.act), false, { onEnd: function (r) { last = A || last; banner('<span class="fk-res fk-res--' + r.res + '">' + esc(B.RES_TEXT[r.res]) + "</span>", null, null); ph = "result"; render(); setTimeout(function () { if (ph === "result") next(); }, 1700); } });
			return;
		}
		if (!A && ph !== "result") { onlinePhase(); render(); }
	}
	function onlinePhase() {
		if (mode === "hive") return hivePhase();
		var g = on.g; if (!g) { ph = "wait"; return; }
		if (g.status === "wait") { ph = "wait"; return; }
		if (g.status === "over") { ph = "over"; var w = g.win; banner(w.p < 0 ? "A draw." : w.p === on.seat ? "<b>You win!</b>" + (w.why !== "score" ? " (" + esc(w.why) + ")" : "") : "You lose." + (w.why !== "score" ? " (" + esc(w.why) + ")" : ""), "Rematch ↺", function () { onAct("rematch"); }); return; }
		var st = onState(), ks = B.kicker(st);
		if (ks === on.seat) ph = g.pend.s ? "wait" : "aim"; else ph = g.pend.a ? "wait" : "keep";
	}
	function onKick(intended) { onSend({ act: "kick", id: on.id, key: on.key, n: on.g.kicks.length, s: B.shotStr(intended) }); }
	function onKeep(act) { onSend({ act: "keep", id: on.id, key: on.key, n: on.g.kicks.length, a: B.actStr(act) }); }
	function onSend(body) {
		ph = "wait"; render();
		api("POST", body).then(function (r) { if (r.error) toast(r.error); if (r.g) gotGame(r.g); else { onlinePhase(); render(); } });
	}
	function onAct(a) { api("POST", { act: a, id: on.id, key: on.key }).then(function (r) { if (r.error) toast(r.error); if (r.g) { hideBanner(); gotGame(r.g); } }); }
	function onLeave() {
		if (on.g && on.g.status === "play" && !confirm("Leave this match? You will lose it.")) return;
		if (on.g && on.g.status === "wait") api("POST", { act: "cancel", id: on.id, key: on.key }); else if (on.g && on.g.status === "play") api("POST", { act: "leave", id: on.id, key: on.key });
		clearTimeout(on.timer); on.g = null; S.online = null; save(); mode = "local"; $("fk-obar").hidden = true; newMatch();
	}
	function onStatus() {
		var g = on.g; if (!g) return "Connecting…";
		if (g.status === "wait") return "Waiting for someone to join…";
		var st = onState(), n = st.kicks.length;
		return (g.v === "F" ? "Free kick " : "Penalty ") + (Math.floor(n / 2) + 1) + " · " + (ph === "aim" ? "Your kick" : ph === "keep" ? "You are in goal: pick a dive" : g.status === "over" ? "Finished" : "Waiting for " + (g.names[1 - on.seat] || "the other player"));
	}
	function renderObar() {
		var box = $("fk-obar");
		if (mode === "online") {
			var g = on.g, link = location.origin + location.pathname + "?g=" + on.id;
			box.hidden = false;
			box.innerHTML = "<span>Online · " + esc(g ? g.names.map(function (x) { return x || "…"; }).join(" vs ") : "") + '</span><span class="fk-vbtns"><button type="button" class="fk-vb" data-o="copy">🔗 Copy invite link</button>' +
				(g && g.status === "play" && g.idle > 180000 ? '<button type="button" class="fk-vb" data-o="claim">Claim the win</button>' : "") + (g && g.status === "play" ? '<button type="button" class="fk-vb" data-o="resign">Resign</button>' : "") + '<button type="button" class="fk-vb" data-o="leave">Leave</button></span>';
			box.dataset.link = link;
		} else if (mode === "hive") renderHbar();
		else box.hidden = true;
	}
	$("fk-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return hbarClick(e);
		var a = b.getAttribute("data-o");
		if (a === "copy") copy(this.dataset.link, "Invite link copied.");
		else if (a === "leave") onLeave();
		else if (a === "resign") { if (confirm("Resign?")) onAct("resign"); }
		else onAct(a);
	});
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("fk-lobby");
			if (r.error) { box.innerHTML = '<p class="fk-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			box.innerHTML = list.length ? '<ul class="fk-lob">' + list.map(function (o) { return '<li><span>' + esc(o.name) + ' <span class="fk-lobv">· ' + (o.v === "F" ? "Free-kick match" : "Penalty shootout") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>'; }).join("") + "</ul>" : '<p class="fk-sub">No open matches right now. Make one above.</p>';
		});
	}
	$("fk-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) { if (mode !== "local") return toast("Leave the match you are in first."); join(b.getAttribute("data-join")); } });
	$("fk-orefresh").addEventListener("click", loadLobby);

	/* stand-in for /api/free-kick on local copies (two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-free-kick:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-free-kick:mock", JSON.stringify(db)); };
		function pub(g) { return { id: g.id, v: g.v, names: g.names, kicks: g.kicks, pend: { s: !!g.pend.s, a: !!g.pend.a }, status: g.status, win: g.win, round: g.round, idle: now - g.at }; }
		var q = query || "";
		if (method === "GET") {
			if (/lobby=1/.test(q) && !/hlobby/.test(q)) return { open: Object.keys(db).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], age: now - g.created }; }) };
			if (/hlobby|hrecent|hg=/.test(q)) return { open: [], games: [], recs: [], done: [], joiners: [] };
			var m = /id=([a-z0-9]+)/.exec(q), g0 = m && db[m[1]];
			return g0 ? { g: pub(g0) } : { error: "Game not found." };
		}
		if (/^h/.test(b.act)) return { ok: true };
		if (b.act === "new") {
			var seat = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0, key = rnd() + rnd() + rnd(), id = rnd();
			var g = { id: id, v: b.v, names: [null, null], tok: [null, null], seed: rnd(), kicks: [], pend: { s: null, a: null }, status: "wait", win: null, round: 0, pub: b.pub, created: now, at: now };
			g.names[seat] = b.name; g.tok[seat] = key; db[id] = g; put();
			return { g: pub(g), key: key, seat: seat };
		}
		var gg = db[b.id];
		if (!gg) return { error: "Game not found." };
		if (b.act === "join") {
			if (gg.status !== "wait") return { error: "Someone else already joined." };
			var s2 = gg.tok[0] ? 1 : 0, k2 = rnd() + rnd() + rnd(); gg.tok[s2] = k2; gg.names[s2] = b.name; gg.status = "play"; gg.at = now; put();
			return { g: pub(gg), key: k2, seat: s2 };
		}
		var me = gg.tok.indexOf(b.key);
		if (me < 0) return { error: "That isn't your game." };
		if (b.act === "kick" || b.act === "keep") {
			var st = B.replay(gg.v, gg.id + "r" + gg.round, gg.kicks.map(function (k) { return k.shot + "/" + k.act; })), ks = B.kicker(st);
			if (b.n !== gg.kicks.length) return { error: "Out of step.", g: pub(gg) };
			if (b.act === "kick") { if (me !== ks) return { error: "You're the keeper." }; gg.pend.s = b.s; } else { if (me === ks) return { error: "You're the kicker." }; gg.pend.a = b.a; }
			gg.at = now;
			if (gg.pend.s && gg.pend.a) {
				var shot = B.applyError(B.shotParse(gg.pend.s), gg.seed + "|" + gg.round, gg.kicks.length, 1);
				B.apply(st, shot, B.actParse(gg.pend.a));
				gg.kicks.push(st.kicks[st.kicks.length - 1]); gg.pend = { s: null, a: null };
				if (st.win) { gg.status = "over"; gg.win = st.win; }
			}
			put(); return { g: pub(gg) };
		}
		if (b.act === "resign" || b.act === "leave") { if (gg.status === "play") { gg.status = "over"; gg.win = { p: 1 - me, why: b.act }; } put(); return { g: pub(gg) }; }
		if (b.act === "rematch") { if (gg.status === "over") { gg.tok = [gg.tok[1], gg.tok[0]]; gg.names = [gg.names[1], gg.names[0]]; gg.kicks = []; gg.pend = { s: null, a: null }; gg.status = "play"; gg.win = null; gg.round++; gg.at = now; put(); } return { g: pub(gg) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		return { error: "Unknown action." };
	}

	/* ===================================================================== Hive matches =====================================================================
	   Ops are custom_json id mes_fk signed with the posting key through main_js/hive.js (MESHive). For each kick: the keeper posts a sealed
	   dive (kc), the kicker the shot (k), the keeper opens the seal (kr). The keeper's salt is kept in localStorage until it is revealed. */
	var H = B.hive;
	var hv = { host: null, gid: null, R: null, pending: [], timer: null, joiners: [], busy: false, ops: {}, seen: 0, revealing: -1 };
	var HA = MOCK ? mockHive() : realHive();
	function realHive() {
		var Mh = function () { return window.MESHive || null; };
		return {
			user: function () { var u = Mh() && Mh().user(); return u ? u.name : ""; },
			login: function (n) { return Mh() ? Mh().login(n) : Promise.reject(new Error("The Hive helpers did not load: reload the page.")); },
			logout: function () { if (Mh()) Mh().logout(); },
			onChange: function (f) { if (Mh()) Mh().onChange(f); else window.addEventListener("load", function () { if (Mh()) Mh().onChange(f); }); },
			help: function () { return Mh() ? Mh().helpHtml() : ""; },
			send: function (obj, label) {
				var me = this.user();
				return Mh().keychain().then(function (k) {
					if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); throw e; }
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
					return Mh().call("condenser_api.get_account_history", [acct, start, start < 0 ? 200 : Math.min(1000, start + 1), 262144, 0]).then(function (r) {
						r = r || []; pages++; all = r.concat(all);
						var oldest = r.length ? r[0] : null, oldT = oldest ? Date.parse(oldest[1].timestamp + "Z") : 0;
						if (oldest && oldest[0] > 0 && oldT > since && pages < 4 && r.length >= (start < 0 ? 200 : 2)) return page(oldest[0] - 1);
						return H.parse(all, acct);
					});
				}
				return page(-1);
			}
		};
	}
	function mockHive() {
		var subs = [];
		function chain() { try { return JSON.parse(localStorage.getItem("mes-free-kick:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-free-kick:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-free-kick:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-free-kick:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = rnd() + rnd() + rnd();
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19), op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-free-kick:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) { var cut = Math.floor(Date.now() / 3000); return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct)); }
		};
	}
	function hMe() { return HA.user(); }
	function txLinks(trx) { return trx ? '<a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">hivehub</a>' : ""; }
	function renderHiveCard() {
		var box = $("fk-hlogin"), me = hMe();
		$("fk-hmake").hidden = !me;
		if (me) {
			box.innerHTML = '<p class="fk-hwho">Signed in as <b>@' + esc(me) + '</b> <button type="button" class="tu-btn" id="fk-hlogout">Log out</button></p>';
			$("fk-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="fk-hrow"><input class="tu-input" id="fk-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="fk-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed." : "Keychain proves you own the account; your keys never leave Keychain.") + "</p>";
			var go = function () {
				var b = $("fk-hlogin-b"); b.disabled = true;
				HA.login($("fk-huser").value).then(function () { toast("Logged in."); }, function (e) { b.disabled = false; if (e && /keychain|signer/i.test(e.message)) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); } else toast((e && e.message) || "Could not log in."); });
			};
			$("fk-hlogin-b").addEventListener("click", go);
			$("fk-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("fk-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(); });
	function register(act, body, tries) {
		tries = tries || 0; body.act = act;
		api("POST", body).then(function (r) { if (r && r.error && /not on the chain/i.test(r.error) && tries < 6) setTimeout(function () { register(act, body, tries + 1); }, 3500); });
	}
	function pend(obj, trx) { var o = H.clean(JSON.parse(H.json(obj))); o.acct = hMe(); o.trx = trx || ("p" + Math.random()); o.block = 0; o.ts = Date.now(); o.i = 1e12 + hv.pending.length; return o; }
	$("fk-hcreate").addEventListener("click", function () {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode !== "local") return toast("Leave the match you are in first.");
		var to = ($("fk-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast("That isn't a Hive username you can challenge.");
		var obj = { a: "open", g: H.newGid(), v: S.omode, f: S.ofirst };
		if (to) obj.to = to;
		HA.send(obj, (to ? "Challenge @" + to + " to " : "Open ") + (S.omode === "F" ? "a free-kick match" : "a penalty shootout")).then(function (r) {
			hiveEnter(me, obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: me, g: obj.g });
			toast(to ? "Challenge sent: copy the link and send it to @" + to + "." : "Your match is open.");
		}, function (e) { toast(e.message); });
	});
	function hiveJoin(host, gid) {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first, then press Join again."); return; }
		if (host === me) return hiveEnter(host, gid, []);
		Promise.all([HA.ops(host, 0), HA.ops(me, 0)]).then(function (res) {
			var R = H.build(host, gid, res[0].concat(res[1]), Date.now());
			if (!R.open) return toast("That Hive match wasn't found (try again in a few seconds).");
			if (R.guest === me || R.status !== "wait") return hiveEnter(host, gid, []);
			if (R.open.to && R.open.to !== me) return toast("That match is a challenge for @" + R.open.to + ".");
			var obj = { a: "join", h: host, g: gid };
			HA.send(obj, "Join @" + host + "'s match").then(function (r) { hiveEnter(host, gid, [pend(obj, r.trx)]); register("hjoin", { host: host, g: gid, acct: me }); }, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.ops = {}; hv.seen = -1; hv.joiners = [];
		S.hive = { host: host, gid: gid }; save();
		mode = "hive"; M = M || { log: [] }; ph = "wait";
		showTab("play"); hivePoll(0); render();
	}
	function hiveLeave() { clearTimeout(hv.timer); hv.host = null; hv.R = null; S.hive = null; save(); mode = "local"; $("fk-obar").hidden = true; newMatch(); }
	function hivePoll(d) { clearTimeout(hv.timer); hv.timer = setTimeout(hiveRefresh, d); }
	function hiveRefresh() {
		if (mode !== "hive") return;
		var me = hMe(), R = hv.R, accts = [hv.host];
		if (R && R.guest) accts.push(R.guest); else hv.joiners.forEach(function (a) { if (accts.indexOf(a) < 0) accts.push(a); });
		if (me && accts.indexOf(me) < 0) accts.push(me);
		var since = R && R.open ? R.open.ts - 60000 : 0;
		var jobs = accts.map(function (a) { return HA.ops(a, since).then(function (o) { hv.ops[a] = o; }, function () {}); });
		if (!R || R.status === "wait") jobs.push(api("GET", null, "?hg=" + hv.host + "/" + hv.gid).then(function (r) { if (r && r.joiners) hv.joiners = r.joiners.slice(0, 5); }));
		Promise.all(jobs).then(function () { if (mode !== "hive") return; hiveRebuild(); hivePoll(document.hidden ? 9000 : 3500); });
	}
	function hiveRebuild() {
		var all = [], now = Date.now();
		Object.keys(hv.ops).forEach(function (a) { all = all.concat(hv.ops[a]); });
		hv.pending = hv.pending.filter(function (p) { return !all.some(function (o) { return o.trx === p.trx || (o.acct === p.acct && o.a === p.a && o.g === p.g && o.n === p.n); }) && now - p.ts < 120000; });
		var prev = hv.R, R = H.build(hv.host, hv.gid, all.concat(hv.pending), now);
		hv.R = R;
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined!");
		if (R.status === "over" && prev && prev.status === "play") register("hres", { host: hv.host, g: hv.gid });
		var nk = R.s ? R.s.kicks.length : 0;
		if (hv.seen < 0) hv.seen = nk;
		if (nk > hv.seen && !A) {
			var i = hv.seen; hv.seen = i + 1;
			var k = R.s.kicks[i], st = B.replay(R.s.v, hv.gid, R.s.kicks.slice(0, i).map(function (x) { return x.shot + "/" + x.act; }));
			start(B.setupFor(st), B.shotParse(k.shot), B.actParse(k.act), false, { onEnd: function (r) { last = A || last; banner('<span class="fk-res fk-res--' + r.res + '">' + esc(B.RES_TEXT[r.res]) + (R.results[i] && R.results[i].cheat ? " (the keeper's seal did not match)" : "") + "</span>", null, null); ph = "result"; render(); setTimeout(function () { if (ph === "result") next(); }, 1700); } });
			return;
		}
		if (!A && ph !== "result") { hivePhase(); render(); }
	}
	function saltKey(n) { return "mes-free-kick:hsalt:" + hv.host + "/" + hv.gid + "/" + n; }
	function hivePhase() {
		var R = hv.R, me = hMe();
		if (!R || R.status !== "play") { ph = R && R.status === "over" ? "over" : "wait"; if (ph === "over") banner(R.win.p < 0 ? "A draw." : R.players[R.win.p] === me ? "<b>You win!</b>" : "@" + esc(R.players[R.win.p]) + " wins.", null, null); return; }
		var mine = R.waitAcct === me;
		if (!mine || hv.busy) { ph = "wait"; return; }
		if (R.step === "commit") ph = "keep";
		else if (R.step === "kick") ph = "aim";
		else { ph = "wait"; hiveReveal(); }
	}
	function hiveSend(obj, label) {
		hv.busy = true; render();
		return HA.send(obj, label).then(function (r) { hv.busy = false; hv.pending.push(pend(obj, r.trx)); hiveRebuild(); hivePoll(2500); }, function (e) { hv.busy = false; toast(e.message); hivePhase(); render(); throw e; });
	}
	function hiveKeep(act) {
		var n = hv.R.s.kicks.length, salt = H.newSalt();
		try { localStorage.setItem(saltKey(n), JSON.stringify({ d: B.actStr(act), x: salt })); } catch (e) { /* kept in memory below */ }
		hv.mem = { n: n, d: B.actStr(act), x: salt };
		ph = "wait"; render();
		hiveSend({ a: "kc", h: hv.host, g: hv.gid, n: n, c: H.commit(act, salt) }, "Seal my dive for kick " + (n + 1)).catch(function () {});
	}
	function hiveKick(intended) { var n = hv.R.s.kicks.length; ph = "wait"; render(); hiveSend({ a: "k", h: hv.host, g: hv.gid, n: n, s: B.shotStr(intended) }, "Take kick " + (n + 1)).catch(function () {}); }
	function hiveReveal() {
		var n = hv.R.s.kicks.length;
		if (hv.revealing === n) return;
		var sv2 = null; try { sv2 = JSON.parse(localStorage.getItem(saltKey(n)) || "null"); } catch (e) { /* none */ }
		if (!sv2 && hv.mem && hv.mem.n === n) sv2 = hv.mem;
		if (!sv2) { toast("The seal of your dive is not in this browser: the kick will count as if you stood still once time runs out."); return; }
		hv.revealing = n;
		hiveSend({ a: "kr", h: hv.host, g: hv.gid, n: n, d: sv2.d, x: sv2.x }, "Open my dive for kick " + (n + 1)).then(function () { try { localStorage.removeItem(saltKey(n)); } catch (e) { /* ok */ } }, function () { hv.revealing = -1; });
	}
	function hiveStatus() {
		var R = hv.R, me = hMe();
		if (!R || !R.open) return "Reading the match from Hive…";
		if (R.status === "wait") return R.open.to ? "Waiting for @" + R.open.to + " to accept" : "Waiting for someone on Hive to join";
		if (R.status !== "play") return "Finished";
		var n = R.s.kicks.length, w = R.waitAcct === me ? "you" : "@" + R.waitAcct;
		return (R.open.v === "F" ? "Free kick " : "Penalty ") + (Math.floor(n / 2) + 1) + " · waiting for " + w + (R.step === "commit" ? " (keeper seals a dive)" : R.step === "kick" ? " (kick)" : " (keeper opens the seal)");
	}
	function renderHbar() {
		var box = $("fk-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h = "<span>On Hive · @" + esc(hv.host) + "/" + esc(hv.gid) + '</span><span class="fk-vbtns"><button type="button" class="fk-vb" data-h="copy">🔗 Copy link</button>';
		if (R && R.status === "wait" && me && me !== hv.host && (!R.open.to || R.open.to === me)) h += '<button type="button" class="fk-vb fk-vb--main" data-h="join">Join</button>';
		if (R && R.status === "wait" && me === hv.host) h += '<button type="button" class="fk-vb" data-h="cancel">Cancel</button>';
		if (R && R.status === "play" && R.players.indexOf(me) >= 0) {
			if (R.waitAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="fk-vb fk-vb--main" data-h="claim">Claim the win (away 5 min)</button>';
			h += '<button type="button" class="fk-vb" data-h="resign">Resign</button>';
		}
		box.innerHTML = h + '<button type="button" class="fk-vb" data-h="leave">Leave</button></span>';
	}
	function hbarClick(e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h");
		if (a === "copy") return copy(location.origin + location.pathname + "?hive=" + hv.host + "/" + hv.gid, "Link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open match").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive match? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign").catch(function () {}); return; }
		if (a === "claim") hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win").catch(function () {});
	}
	$("fk-hsave").addEventListener("click", function () {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab), then press Save again."); return; }
		var st = M.st, obj = { a: "rec", g: H.newGid(), v: M.v, sd: M.seed.replace(/[^a-z0-9]/g, "").slice(0, 16) || "x", k: st.kicks.map(function (k) { return k.shot + "/" + k.act; }).join("."), o: M.opp === "cpu" ? M.lv : "local", s: M.opp === "cpu" ? M.me : -1, w: st.win.p };
		if (obj.sd !== M.seed) return toast("This match can't be saved.");
		if (!H.clean(obj)) return toast("This match can't be saved (too long).");
		HA.send(obj, "Save a free-kick result (self-reported)").then(function (r) { S.saved[M.seed] = r.trx || "?"; save(); render(); toast("Saved on Hive. " + txLinks(r.trx), true); register("hrec", { acct: me, g: obj.g }); }, function (e) { toast(e.message); });
	});
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("fk-hlobby"), list = (r && r.open) || [], me = hMe();
			box.innerHTML = list.length ? '<ul class="fk-lob">' + list.map(function (o) { return '<li><span>@' + esc(o.host) + ' <span class="fk-lobv">· ' + (o.v === "F" ? "Free-kick match" : "Penalty shootout") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>"; }).join("") + "</ul>" : '<p class="fk-sub">No open Hive matches right now.</p>';
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 10);
			$("fk-hminebox").hidden = !games.length;
			$("fk-hmine").innerHTML = '<ul class="fk-lob">' + games.map(function (g) { return '<li><span>' + (g.role === "host" ? "You opened" : "You joined @" + esc(g.host)) + ' <span class="fk-lobv">· ' + new Date(g.ts).toLocaleString() + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>'; }).join("") + "</ul>";
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("fk-hrecent"), items = [];
			(r.done || []).forEach(function (o) { items.push("<li><span>@" + esc(o.players[0]) + " " + o.score[0] + "–" + o.score[1] + " @" + esc(o.players[1]) + ' <span class="fk-lobv">· ' + (o.v === "F" ? "free kicks" : "penalties") + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>"); });
			(r.games || []).forEach(function (o) { items.push('<li><span>@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="fk-lobv">· started ' + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>'); });
			(r.recs || []).forEach(function (o) { items.push("<li><span>@" + esc(o.acct) + ' saved a result <span class="fk-lobv">· ' + esc(o.res) + " · " + ago(o.age) + "</span></span></li>"); });
			box.innerHTML = items.length ? '<ul class="fk-lob">' + items.join("") + "</ul>" : '<p class="fk-sub">Nothing yet.</p>';
		});
	}
	$("fk-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		if (mode === "online") return toast("Leave the guest match first.");
		var p = b.getAttribute("data-hjoin").split("/");
		if (hMe()) hiveJoin(p[0], p[1]); else hiveEnter(p[0], p[1], []);
	});
	$("fk-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* ===================================================================== start ===================================================================== */
	var renderBase = render;
	render = function () { renderBase(); renderObar(); };
	if (window.MESPanel) window.MESPanel.add($("fk-view"), { bar: $("fk-pbar"), stage: $("fk-stage"), onChange: function () { setTimeout(draw, 30); } });
	else window.addEventListener("load", function () { if (window.MESPanel) window.MESPanel.add($("fk-view"), { bar: $("fk-pbar"), stage: $("fk-stage"), onChange: function () { setTimeout(draw, 30); } }); });
	syncSetup();
	var qs = new URLSearchParams(location.search);
	if (qs.get("mode") && B.mode(qs.get("mode"))) { S.mode = qs.get("mode"); syncSetup(); }
	newMatch();
	applyDim();
	if (qs.get("g")) join(qs.get("g"));
	else if (qs.get("hive") && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qs.get("hive"))) { var hp = qs.get("hive").split("/"); hiveEnter(hp[0], hp[1], []); }
	else if (S.online && S.online.id) { api("GET", null, "?id=" + S.online.id).then(function (r) { if (r.g && r.g.status !== "over") { on.key = S.online.key; on.seat = S.online.seat; startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); } else { S.online = null; save(); } }); }
	window.MESFreeKickDebug = { state: function () { return { M: M, ph: ph, A: A, aim: aim, dive: dive, mode: mode }; }, shoot: shoot, step: function (s) { if (A) { A.t += s; if (A.t >= A.sim.t) { A.t = A.sim.t; endKick(); } else draw(); } }, setAim: function (x, z) { aim = { x: x, z: z }; render(); }, next: next, liveDive: liveDive, B: B, view: function () { return v3; }, charge: function () { return charge; } };
})();
