/* MES Chess: the page (setup, 2D board, 3D board via view3d.js, computer, clocks, analysis, replay, PGN / FEN, guest online games via /api/chess,
   Hive games, results and posts on Hive, statistics, rules). The same served file is also started as a Web Worker that runs the computer's thinking.
   Online: /api/chess on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in localStorage "mes-chess:mock" is
   used instead, and Hive play uses a stand-in chain ("mes-chess:hchain") + a per-tab account, so two tabs can play. */
(function () {
	"use strict";
	var C = (typeof self !== "undefined" ? self : window).MESChess;

	function compute(q) {
		var s = C.replay(C.parseCode(q.code), q.moves);
		if (!s) return null;
		if (q.type === "analyze") return C.analyze(s, q.ms);
		var r = C.think(s, q.level, { ms: q.ms });
		return r ? { m: C.mstr(r.m), how: r.how, depth: r.depth, v: r.v } : null;
	}
	if (typeof document === "undefined") {          // running as the Web Worker
		self.onmessage = function (e) {
			var r = null;
			try { r = compute(e.data); } catch (err) { r = null; }
			self.postMessage({ id: e.data.id, r: r });
		};
		return;
	}

	var SCRIPT = document.currentScript && document.currentScript.src;
	var root = document.getElementById("ch");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-chess:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/* ---------- saved settings ---------- */
	var S = { game: "standard", opp: "cpu", lv: "medium", me: "white", alt: 0, clock: "", dots: true, anal: false, autoflip: false, sound: true,
		dim: "2d", room: "club", set: "wood", cam: "auto", theme: "green", pcol: "auto", flipX: false, show: null,
		name: "", ofirst: "host", opub: true, ht: 5, cur: null, stats: {}, online: null, orec: {}, hive: null, saved: {} };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) {}
	S.show = Object.assign({ names: true, btns: true, moves: true, type: true }, S.show || {});
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
	function ask(q) {
		return new Promise(function (res) {
			var local = function () { setTimeout(function () { try { res(compute(q)); } catch (e) { res(null); } }, 20); };
			if (!worker) return local();
			var id = ++wid;
			waiting[id] = function (r) { if (r === undefined) local(); else res(r); };
			worker.postMessage({ id: id, type: q.type, code: q.code, moves: q.moves, level: q.level, ms: q.ms });
		});
	}

	/* ---------- game state ---------- */
	var cfg, code, st, mode = "cpu", human = 0, vi = null, busy = false, gen = 0, sel = -1, kcur = -1, kbd = false, anim = null, hintMv = null, assisted = false;
	var score = { w: 0, d: 0, l: 0, p: [0, 0] };
	var anal = { key: "", r: null, busy: false };
	var clk = null;   // {base, inc, t: [ms, ms], on: side running or -1, last}

	function setupCfg() {
		var p = C.preset(S.game) || C.PRESETS[0];
		if (p.code === "F") return { v: "F", n: C.random960() };
		return C.parseCode(p.code);
	}
	function setGame(newCfg, moves, opts) {
		opts = opts || {};
		cfg = newCfg; code = C.cfgCode(cfg);
		st = C.replay(cfg, moves || []) || C.create(cfg);
		vi = null; busy = false; gen++; sel = -1; anim = null; hintMv = null;
		if (!opts.keepMode) mode = S.opp;
		if (opts.human !== undefined) human = opts.human;
		if (!opts.keepClock) clk = mode === "cpu" || mode === "local" ? newClock() : null;
		if (!opts.keepAssist) assisted = false;
		storeCur();
		render();
		maybeCpu();
	}
	function newClock() {
		var m = /^(\d+)\+(\d+)$/.exec(S.clock || "");
		if (!m) return null;
		var base = +m[1] * 60000;
		return { base: base, inc: +m[2] * 1000, t: [base, base], on: -1, last: 0 };
	}
	function newGame() {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first (button above the board).");
		var c = setupCfg();
		mode = S.opp;
		if (mode === "cpu") {
			if (S.me === "white") human = 0;
			else if (S.me === "black") human = 1;
			else if (S.me === "random") human = Math.random() < 0.5 ? 0 : 1;
			else { human = S.alt % 2; S.alt++; }
		} else human = 0;
		setGame(c, [], { human: human });
	}
	function storeCur() {
		if (mode === "online" || mode === "hive") return;
		S.cur = { code: code, moves: st.hist.slice(), mode: mode, human: human, done: !!st.win, clk: clk ? { base: clk.base, inc: clk.inc, t: clk.t.slice() } : null, as: assisted };
		save();
	}
	function viewState() { return vi === null ? st : C.replay(cfg, st.hist.slice(0, vi)); }
	function mySeat() {
		if (mode === "cpu") return human;
		if (mode === "online") return on.seat;
		if (mode === "hive") return hv.R ? hv.R.players.indexOf(hMe()) : -1;
		return -1;
	}
	function isHumanTurn() {
		if (mode === "local") return true;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		if (mode === "hive") return hv.R && hv.R.status === "play" && hv.R.turnAcct === hMe();
		return false;
	}
	function canInput() { return !st.win && vi === null && !busy && isHumanTurn() && !(mode === "online" && on.sending) && !(mode === "hive" && (hv.busy || hv.pending.some(function (p) { return p.a === "mv"; }))); }
	/** which colour sits at the bottom of the board */
	function bottom() {
		var b = 0;
		if (mode === "cpu") b = human;
		else if (mode === "online") b = on.seat || 0;
		else if (mode === "hive") { var s = mySeat(); b = s > 0 ? 1 : 0; }
		else if (mode === "local" && S.autoflip) b = (vi === null ? st : viewState()).turn;
		return S.flipX ? 1 - b : b;
	}

	/* ---------- the computer ---------- */
	var LV_MS = { easy: 120, medium: 350, hard: 1200, expert: 3500 };
	function maybeCpu() {
		if (mode !== "cpu" || st.win || st.turn === human || busy) return;
		busy = true;
		var g = gen, t0 = Date.now();
		render();
		ask({ code: code, moves: st.hist.slice(), level: S.lv, ms: LV_MS[S.lv] }).then(function (r) {
			var wait = Math.max(0, 380 - (Date.now() - t0));
			setTimeout(function () {
				if (g !== gen) return;
				busy = false;
				var m = r && C.mparse(r.m);
				if (!m || !C.isLegal(st, m)) { var L = C.legal(st); m = L[(Math.random() * L.length) | 0]; }
				if (m) commit(m);
			}, wait);
		});
	}

	/* ---------- moves ---------- */
	function humanMove(m) {
		if (!canInput()) {
			if (vi !== null) toast("You are looking back at an earlier move: press ⏭ to return.");
			else if (!st.win && !isHumanTurn()) toast(busy ? "The computer is thinking…" : "It's not your turn.");
			return false;
		}
		var o = C.find(st, m);
		if (!o) { toast("That move isn't allowed."); return false; }
		sel = -1; hintMv = null;
		if (mode === "online") { onlineMove(o); return true; }
		if (mode === "hive") { hiveMove(o); return true; }
		commit(o);
		return true;
	}
	function commit(m) {
		var mover = st.turn;
		if (!C.apply(st, m)) return;
		vi = null;
		clockAfterMove(mover);
		animFor();
		sound();
		storeCur();
		render();
		if (st.win) finish(); else maybeCpu();
	}
	function animFor() { anim = st.last ? { n: st.hist.length, t0: Date.now(), f: st.last.f, t: st.last.t, rf: st.last.rf, rt: st.last.rt } : null; anim3n = -1; }
	function finish() {
		if (st._fin) return;
		st._fin = true;
		stopClock();
		var w = st.win, msg;
		if (mode === "local") {
			if (w.p < 0) score.d++; else score.p[w.p]++;
			msg = w.p < 0 ? "Draw." : C.playerName(cfg, w.p) + " wins!";
		} else {
			var me = mySeat(), res = w.p < 0 ? "d" : w.p === me ? "w" : "l";
			if (me < 0) { toast(w.p < 0 ? "Draw." : C.playerName(cfg, w.p) + " wins."); render(true); return; }
			score[res]++;
			var key = cfg.v + "|" + (mode === "cpu" ? S.lv : mode);
			var rec = true;
			if (mode === "online" || mode === "hive") { var tag = mode === "hive" ? "h:" + hv.host + "/" + hv.gid : on.id + ":" + (on.g ? on.g.round : 0); if (S.orec[tag]) rec = false; else S.orec[tag] = 1; pruneOrec(); }
			if (rec) { var a = S.stats[key] || [0, 0, 0]; a[res === "w" ? 0 : res === "d" ? 1 : 2]++; S.stats[key] = a; }
			msg = res === "w" ? "You win! 🎉" : res === "d" ? "Draw." : (mode === "cpu" ? "The computer wins." : "You lost this one.");
			save();
		}
		sound("end");
		toast(msg);
		render(true);
		renderStats();
	}
	function pruneOrec() { var k = Object.keys(S.orec); if (k.length > 60) k.slice(0, k.length - 60).forEach(function (x) { delete S.orec[x]; }); }
	function undo() {
		if (mode === "online" || mode === "hive" || !st.hist.length) return;
		var h = st.hist.slice();
		if (mode === "cpu") {
			h.pop();
			var t = C.replay(cfg, h);
			while (h.length && t && t.turn !== human) { h.pop(); t = C.replay(cfg, h); }
		} else h.pop();
		gen++; busy = false;
		setGame(cfg, h, { human: human, keepMode: true, keepClock: true, keepAssist: true });
		if (clk) { clk.on = st.hist.length ? st.turn : -1; clk.last = Date.now(); }
	}
	function resign() {
		if (st.win) return;
		if (mode === "online" || mode === "hive") return toast("Use Resign in the bar above the board.");
		if (!st.hist.length) return toast("No moves yet: just start a new game.");
		if (!confirm(mode === "local" ? C.playerName(cfg, st.turn) + " resigns?" : "Resign this game?")) return;
		var loser = mode === "cpu" ? human : st.turn;
		st.win = { p: 1 - loser, why: "resign", line: null, lines: [] };
		storeCur();
		finish();
	}

	/* ---------- clocks (computer + pass and play) ---------- */
	function clockAfterMove(mover) {
		if (!clk) return;
		var now = Date.now();
		if (clk.on === mover) clk.t[mover] = Math.max(0, clk.t[mover] - (now - clk.last)) + clk.inc;
		clk.on = st.win ? -1 : st.turn; clk.last = now;
	}
	function stopClock() { if (clk && clk.on >= 0) { clk.t[clk.on] = Math.max(0, clk.t[clk.on] - (Date.now() - clk.last)); clk.on = -1; } }
	function clockLeft(side) { if (!clk) return 0; return clk.on === side ? Math.max(0, clk.t[side] - (Date.now() - clk.last)) : clk.t[side]; }
	function fmtClock(ms) {
		var s = Math.ceil(ms / 1000);
		if (ms < 10000) return (ms / 1000).toFixed(1);
		var m = Math.floor(s / 60), r = s % 60;
		return m + ":" + (r < 10 ? "0" : "") + r;
	}
	setInterval(function () {
		if (!clk || clk.on < 0 || st.win) return;
		var side = clk.on;
		if (clockLeft(side) <= 0) {
			clk.t[side] = 0; clk.on = -1;
			// losing on time against a bare king is a draw
			var other = 1 - side, b = C.board64(st), hasMat = b.some(function (p) { return p && p !== (other ? "k" : "K") && (other ? p === p.toLowerCase() : p === p.toUpperCase()); });
			gen++; busy = false;
			st.win = hasMat ? { p: other, why: "flag", line: null, lines: [] } : { p: -1, why: "flag-draw", line: null, lines: [] };
			storeCur(); finish();
			return;
		}
		renderPlayers();
	}, 200);

	/* ---------- analysis + hints ---------- */
	function analysisAllowed() { return mode === "cpu" || mode === "local" || st.win; }
	function wantAnalysis() { return S.anal && analysisAllowed() && !(mode === "cpu" && st.turn !== human && !st.win && vi === null); }
	function runAnalysis() {
		var s = viewState();
		if (!wantAnalysis() || s.win) { anal.r = null; anal.key = ""; return; }
		var key = code + ":" + s.hist.join(".");
		if (anal.key === key) return;
		anal.key = key; anal.r = null; anal.busy = true;
		ask({ type: "analyze", code: code, moves: s.hist.slice(), ms: 1400 }).then(function (r) {
			if (anal.key !== key) return;
			anal.busy = false; anal.r = r; anal.turn = s.turn;
			render(true);
		});
	}
	function hint() {
		if (!(mode === "cpu" || mode === "local")) return toast("Hints are only for games against the computer or a friend here.");
		if (!canInput()) return;
		var g = gen;
		toast("Thinking…");
		ask({ code: code, moves: st.hist.slice(), level: "hard", ms: 1200 }).then(function (r) {
			if (g !== gen || !r) return;
			var m = C.mparse(r.m);
			if (!m) return;
			hintMv = m; assisted = true;
			toast("Hint: " + C.san(st, m));
			render(true);
		});
	}

	/* ---------- sounds ---------- */
	var actx = null;
	function sound(kind) {
		if (!S.sound) return;
		try {
			actx = actx || new (window.AudioContext || window.webkitAudioContext)();
			if (actx.state === "suspended") actx.resume();
			var l = st.last || {}, chk = C.inCheck(st), now = actx.currentTime;
			var tones = kind === "end" ? [[523, 0], [659, 0.12], [784, 0.24]] : chk ? [[880, 0], [660, 0.09]] : l.cap ? [[220, 0]] : [[330, 0]];
			tones.forEach(function (t) {
				var o = actx.createOscillator(), g = actx.createGain();
				o.type = kind === "end" ? "sine" : "triangle"; o.frequency.value = t[0];
				g.gain.setValueAtTime(0.0001, now + t[1]); g.gain.exponentialRampToValueAtTime(0.18, now + t[1] + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + t[1] + (kind === "end" ? 0.35 : 0.13));
				o.connect(g); g.connect(actx.destination); o.start(now + t[1]); o.stop(now + t[1] + 0.4);
			});
		} catch (e) {}
	}

	/* ---------- 2D board ---------- */
	var PIECE_PATHS = {   // original silhouettes in a 45 x 45 box
		base: "M10.5 39.5h24a1.5 1.5 0 0 0 1.5-1.5v-.5a1.5 1.5 0 0 0-1.5-1.5h-24A1.5 1.5 0 0 0 9 37.5v.5a1.5 1.5 0 0 0 1.5 1.5z",
		P: ["M13 36C14 29 17 25 19.5 21.5h6C28 25 31 29 32 36z", "M17.5 21.5h10a1.5 1.5 0 0 0 0-3h-10a1.5 1.5 0 0 0 0 3z", "c22.5,13,5"],
		R: ["M14 36l1.5-19h14l1.5 19z", "M12 17V9h4v3h3.5V9h6v3H29V9h4v8z", "M13 36h19v-2.5H13z", "l15.5,20.5,29.5,20.5"],
		B: ["c22.5,7,2.2", "M22.5 9.5C16 14 15 20 17.5 24h10C30 20 29 14 22.5 9.5z", "M16.5 24h12v3h-12z", "M17 27c0 4-2 7-3 9h17c-1-2-3-5-3-9z", "l24.6,13.4,20.6,19.2"],
		N: ["M14 36c0-6 3-9 5-12-2 0-5 1-7-.5-1.5-1.5-1-3.5.5-5C15 16 18 13 19 10l-1-3.5 3.5 2.5c1.5-.5 3-.5 4.5 0 5 2 8 8 7.5 16-.3 4-1.5 8-1.5 11z", "c20.5,13.5,1.1", "l26,10.5,30,17"],
		Q: ["c9,13,2", "c15.5,10,2", "c22.5,9,2", "c29.5,10,2", "c36,13,2", "M11 27L9 14l6 9 .5-11.5L20 22l2.5-11.5L25 22l4.5-10.5L30 23l6-9-2 13z", "M11 27c3 2 20 2 23 0l-1 4c-4 1.5-17 1.5-21 0z", "M12 31c1 2 0 4-1 5h23c-1-1-2-3-1-5z"],
		K: ["M21 3.5h3v3h3v3h-3v4h-3v-4h-3v-3h3z", "M22.5 13.5C17 13.5 13 17 13 21c0 3 2 5 3 6h13c1-1 3-3 3-6 0-4-4-7.5-9.5-7.5z", "M15.5 27h14l.5 4h-15z", "M15 31c0 2-2 4-3 5h21c-1-1-3-3-3-5z"]
	};
	var pieceCache = {};
	function pieceSvg(letter) {
		if (pieceCache[letter]) return pieceCache[letter];
		var white = letter === letter.toUpperCase(), L = letter.toUpperCase(), cls = white ? "ch-pw" : "ch-pb", out = '<g class="' + cls + '">';
		out += '<path class="ch-pf" d="' + PIECE_PATHS.base + '"/>';
		PIECE_PATHS[L].forEach(function (d) {
			if (d.charAt(0) === "c") { var c = d.slice(1).split(","); out += '<circle class="ch-pf" cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; }
			else if (d.charAt(0) === "l") { var q = d.slice(1).split(","); out += '<path class="ch-pd" d="M' + q[0] + " " + q[1] + "L" + q[2] + " " + q[3] + '"/>'; }
			else out += '<path class="ch-pf" d="' + d + '"/>';
		});
		out += "</g>";
		return (pieceCache[letter] = out);
	}
	var SQ = 100;
	function sqXY(i, flip) { var f = i & 7, r = i >> 3; return flip ? { x: (7 - f) * SQ, y: r * SQ } : { x: f * SQ, y: (7 - r) * SQ }; }
	function targetsFrom(s, from) {
		var out = {};
		if (from < 0) return out;
		C.legal(s).forEach(function (o) { if (o.f !== from) return; out[o.t] = 1; if (o.c) out[o.k] = 1; });
		return out;
	}
	var drag = null;   // {from, x, y, moved, wasSel}
	function drawBoard() {
		var s = viewState(), flip = bottom() === 1, b = C.board64(s), out = [], i, live = canInput() && vi === null;
		var last = s.last, chk = C.inCheck(s) && !s.win ? C.kingSq(s, s.turn) : (s.win && s.win.why === "mate" ? C.kingSq(s, s.turn) : -1);
		var tg = live && sel >= 0 ? targetsFrom(s, sel) : {};
		for (i = 0; i < 64; i++) {
			var p = sqXY(i, flip), dark = ((i & 7) + (i >> 3)) % 2 === 0;
			out.push('<rect class="ch-sq ' + (dark ? "d" : "l") + '" x="' + p.x + '" y="' + p.y + '" width="' + SQ + '" height="' + SQ + '"/>');
			if (last && (i === last.f || i === last.t)) out.push('<rect class="ch-last" x="' + p.x + '" y="' + p.y + '" width="' + SQ + '" height="' + SQ + '"/>');
			if (i === sel) out.push('<rect class="ch-sel" x="' + p.x + '" y="' + p.y + '" width="' + SQ + '" height="' + SQ + '"/>');
			if (i === chk) out.push('<circle class="ch-chk" cx="' + (p.x + 50) + '" cy="' + (p.y + 50) + '" r="52"/>');
			if (kbd && i === kcur) out.push('<rect class="ch-kc" x="' + (p.x + 3) + '" y="' + (p.y + 3) + '" width="' + (SQ - 6) + '" height="' + (SQ - 6) + '"/>');
		}
		// coordinates on the edge squares
		for (i = 0; i < 8; i++) {
			var fx = flip ? 7 - i : i, ry = flip ? i : 7 - i, botR = flip ? 7 : 0, leftF = flip ? 7 : 0;   // a label sits in the light colour on a dark square and the other way round
			out.push('<text class="ch-co ' + ((fx + botR) % 2 ? "d" : "l") + '" x="' + (i * SQ + 94) + '" y="795">' + "abcdefgh"[fx] + "</text>");
			out.push('<text class="ch-co ' + ((leftF + ry) % 2 ? "d" : "l") + '" x="5" y="' + (i * SQ + 20) + '">' + (ry + 1) + "</text>");
		}
		var el = anim ? Date.now() - anim.t0 : 1e9, doAnim = anim && vi === null && anim.n === s.hist.length && el < 280 && !REDUCED;
		for (i = 0; i < 64; i++) {
			if (!b[i]) continue;
			if (drag && drag.moved && i === drag.from) continue;
			var q = sqXY(i, flip), inner = pieceSvg(b[i]), style = "";
			if (doAnim && (i === anim.t || i === anim.rt)) {
				var from = sqXY(i === anim.t ? anim.f : anim.rf, flip);
				style = ' style="--dx:' + (from.x - q.x) + "px;--dy:" + (from.y - q.y) + "px;animation-delay:-" + el + 'ms"';
				inner = '<g class="ch-anim"' + style + ">" + inner + "</g>";
			}
			out.push('<g transform="translate(' + q.x + "," + q.y + ') scale(' + (SQ / 45) + ')">' + inner + "</g>");
		}
		Object.keys(tg).forEach(function (t) {
			t = +t; var q = sqXY(t, flip);
			if (b[t]) out.push('<circle class="ch-tc" cx="' + (q.x + 50) + '" cy="' + (q.y + 50) + '" r="44"/>');
			else if (S.dots) out.push('<circle class="ch-td" cx="' + (q.x + 50) + '" cy="' + (q.y + 50) + '" r="15"/>');
		});
		// arrows: hint, or the computer's best move when analysis is on
		var arrows = [];
		if (hintMv && vi === null) arrows.push([hintMv.f, hintMv.t, "ch-arh"]);
		if (anal.r && anal.r.best && wantAnalysis() && anal.key === code + ":" + s.hist.join(".")) { var bm = C.mparse(anal.r.best); if (bm) arrows.push([bm.f, bm.t, "ch-ara"]); }
		arrows.forEach(function (a) { out.push(arrow(sqXY(a[0], flip), sqXY(a[1], flip), a[2])); });
		if (drag && drag.moved && b[drag.from]) out.push('<g id="ch-dragp" transform="translate(' + (drag.x - 50) + "," + (drag.y - 60) + ') scale(' + (SQ / 45 * 1.12) + ')">' + pieceSvg(b[drag.from]) + "</g>");
		var bd = $("ch-board");
		bd.innerHTML = '<svg viewBox="0 0 800 800" role="img" aria-label="' + esc(boardLabel(s)) + '"><defs><marker id="ch-ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L10 5L0 10z" class="ch-ahp"/></marker></defs>' + out.join("") + "</svg>";
		bd.classList.toggle("is-live", live);
		if (doAnim) setTimeout(function () { if (anim && Date.now() - anim.t0 >= 280) drawBoard(); }, 300);
	}
	function arrow(a, b, cls) {
		var x1 = a.x + 50, y1 = a.y + 50, x2 = b.x + 50, y2 = b.y + 50, dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
		x2 -= dx / L * 22; y2 -= dy / L * 22;
		return '<line class="ch-arrow ' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#ch-ah)"/>';
	}
	function boardLabel(s) {
		var b = C.board64(s), parts = [];
		["K", "Q", "R", "B", "N", "P"].forEach(function (L) {
			var w = [], bl = [];
			b.forEach(function (p, i) { if (p === L) w.push(C.sqName(i)); if (p === L.toLowerCase()) bl.push(C.sqName(i)); });
			var nm = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" }[L];
			if (w.length) parts.push("White " + nm + (w.length > 1 ? "s " : " ") + w.join(" "));
			if (bl.length) parts.push("Black " + nm + (bl.length > 1 ? "s " : " ") + bl.join(" "));
		});
		return parts.join(", ") + ". " + C.playerName(cfg, s.turn) + " to move.";
	}
	var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

	/* clicks + dragging on the 2D board */
	var board = $("ch-board");
	function sqAt(e) {
		var svg = board.querySelector("svg"); if (!svg) return -1;
		var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 800, y = (e.clientY - r.top) / r.height * 800;
		if (x < 0 || y < 0 || x >= 800 || y >= 800) return -1;
		var f = Math.floor(x / SQ), rr = 7 - Math.floor(y / SQ);
		if (bottom() === 1) { f = 7 - f; rr = 7 - rr; }
		return rr * 8 + f;
	}
	function svgXY(e) { var r = board.querySelector("svg").getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 800, y: (e.clientY - r.top) / r.height * 800 }; }
	function ownPiece(i) { var p = C.board64(st)[i]; return p && (p === p.toUpperCase() ? 0 : 1) === st.turn; }
	/** a square was chosen (click / tap / keyboard / 3D pick) -> select, move or deselect; returns true when it moved */
	function chooseSquare(i) {
		if (i < 0) return false;
		if (!canInput()) {
			if (vi !== null) toast("You are looking back at an earlier move: press ⏭ to return.");
			return false;
		}
		if (sel >= 0 && i !== sel) {
			var tg = targetsFrom(st, sel);
			if (tg[i] && !(ownPiece(i) && !castleTo(sel, i))) return tryMove(sel, i);
		}
		if (ownPiece(i)) { sel = sel === i ? -1 : i; render(true); return false; }
		if (sel >= 0) { sel = -1; render(true); }
		return false;
	}
	function castleTo(f, t) { return C.legal(st).some(function (o) { return o.f === f && o.c && o.t === t; }); }
	function tryMove(f, t) {
		var L = C.legal(st).filter(function (o) { return o.f === f && (o.t === t || (o.c && o.k === t)); });
		if (!L.length) return false;
		var exact = L.filter(function (o) { return o.t === t; });
		if (exact.length) L = exact;
		if (L.some(function (o) { return o.pr; })) { askPromo(f, t); return false; }
		return humanMove(L[0]);
	}
	function askPromo(f, t) {
		var box = $("ch-promo"), white = st.turn === 0, flip = bottom() === 1, q = sqXY(t, flip);
		box.innerHTML = ["q", "r", "b", "n"].map(function (p) {
			var L = white ? p.toUpperCase() : p;
			return '<button type="button" data-pr="' + p + '" title="' + { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[p] + '"><svg viewBox="0 0 45 45">' + pieceSvg(L) + "</svg></button>";
		}).join("") + '<button type="button" data-pr="" class="ch-promox" title="Cancel">✕</button>';
		box.style.left = (q.x / 8) + "%";
		box.style.top = (q.y < 400 ? q.y / 8 : Math.max(0, q.y / 8 - 37.5)) + "%";
		box.hidden = false;
		box.dataset.f = f; box.dataset.t = t;
		var b0 = box.querySelector("button"); if (b0) b0.focus();
	}
	$("ch-promo").addEventListener("click", function (e) {
		var b = e.target.closest("[data-pr]"); if (!b) return;
		var box = $("ch-promo"), pr = b.getAttribute("data-pr");
		box.hidden = true;
		if (!pr) { sel = -1; render(true); return; }
		humanMove({ f: +box.dataset.f, t: +box.dataset.t, pr: pr });
	});
	board.addEventListener("pointerdown", function (e) {
		if (e.button !== 0) return;
		kbd = false;
		var i = sqAt(e); if (i < 0) return;
		$("ch-promo").hidden = true;
		if (canInput() && ownPiece(i) && !(sel >= 0 && sel !== i && castleTo(sel, i))) {
			var wasSel = sel === i;
			sel = i;
			var p = svgXY(e);
			drag = { from: i, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, moved: false, wasSel: wasSel, id: e.pointerId };
			try { board.setPointerCapture(e.pointerId); } catch (er) {}
			render(true);
			e.preventDefault();
		} else chooseSquare(i);
	});
	board.addEventListener("pointermove", function (e) {
		if (!drag || e.pointerId !== drag.id) return;
		var p = svgXY(e);
		drag.x = p.x; drag.y = p.y;
		if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) { drag.moved = true; drawBoard(); return; }
		if (drag.moved) { var g = $("ch-dragp"); if (g) g.setAttribute("transform", "translate(" + (p.x - 50) + "," + (p.y - 60) + ") scale(" + (SQ / 45 * 1.12) + ")"); else drawBoard(); }
	});
	function endDrag(e) {
		if (!drag || (e && e.pointerId !== drag.id)) return;
		var d = drag; drag = null;
		if (d.moved) {
			var i = e ? sqAt(e) : -1;
			if (i >= 0 && i !== d.from && targetsFrom(st, d.from)[i]) { if (!tryMove(d.from, i)) render(true); return; }
			render(true);
		} else if (d.wasSel) { sel = -1; render(true); }
	}
	board.addEventListener("pointerup", endDrag);
	board.addEventListener("pointercancel", function () { drag = null; render(true); });
	board.addEventListener("keydown", function (e) {
		var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
		if (dir) {
			e.preventDefault(); kbd = true;
			if (kcur < 0) kcur = sel >= 0 ? sel : (bottom() ? 52 : 12);
			var fl = bottom() === 1 ? -1 : 1, f = (kcur & 7) + dir[0] * fl, r = (kcur >> 3) + dir[1] * fl;
			if (f >= 0 && f < 8 && r >= 0 && r < 8) kcur = r * 8 + f;
			render(true);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault(); kbd = true;
			if (kcur >= 0) chooseSquare(kcur);
		} else if (e.key === "Escape" && sel >= 0) { sel = -1; render(true); }
	});
	board.addEventListener("blur", function () { if (kbd) { kbd = false; render(true); } });
	function typeKey(e) {
		if (e.key !== "Enter") return;
		var txt = this.value.trim(); if (!txt) return;
		if (!canInput()) { toast(vi !== null ? "Return to the current move first (⏭)." : "It's not your turn."); return; }
		var o = C.parseSan(st, txt);
		if (!o) { toast("\"" + txt + "\" isn't a legal move here (examples: e4, Nf3, exd5, O-O, e8=Q)."); return; }
		this.value = "";
		humanMove(o);
	}
	$("ch-type").addEventListener("keydown", typeKey);
	$("ch-otype").addEventListener("keydown", typeKey);

	/* ---------- piece colours (2D and 3D) ---------- */
	var PCOL = { auto: null, cream: ["#f3e2bf", "#5b3a20"], red: ["#f5f5f5", "#b3261e"], blueorange: ["#ffae42", "#1f5fbf"], yellowpurple: ["#ffd84d", "#6a3fb5"], goldsilver: ["#e3b84a", "#9aa6b2"], green: ["#f5f5f5", "#1f7a3a"] };
	function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
	function applyPcol() {
		var c = PCOL[S.pcol] || null, st2 = root.style;
		["--ch-pwf", "--ch-pws", "--ch-pbf", "--ch-pbs", "--ch-pbd", "--ch-pwd"].forEach(function (k) { st2.removeProperty(k); });
		if (c) {
			st2.setProperty("--ch-pwf", c[0]); st2.setProperty("--ch-pbf", c[1]);
			st2.setProperty("--ch-pws", lum(c[0]) > 0.55 ? "#1c1c1c" : "#0b0b0b");
			st2.setProperty("--ch-pbs", lum(c[1]) > 0.55 ? "#2a2a2a" : "#0b0b0b");
			st2.setProperty("--ch-pbd", lum(c[1]) > 0.55 ? "#1c1c1c" : "#ececec");
		}
		pieceCache = {};
		if (v3 && v3.setPieceColors) v3.setPieceColors(c);
	}

	/* ---------- 3D board ---------- */
	var v3 = null, v3loading = false, anim3n = -1, box3 = $("ch-3d");
	function use3d() { return S.dim === "3d"; }
	function ensure3d() {
		if (v3 || v3loading) return;
		if (!window.CH3D) { $("ch-3dmsg").textContent = "3D isn't available here."; return; }
		v3loading = true;
		window.CH3D.create(box3).then(function (v) {
			v3 = v; v3loading = false;
			$("ch-3dmsg").hidden = true;
			v.setRoom(S.room); v.setSet(S.set); v.setCam(S.cam);
			if (PCOL[S.pcol] && v.setPieceColors) v.setPieceColors(PCOL[S.pcol]);
			size3d(); draw3d(true);
		}, function () {
			v3loading = false;
			$("ch-3dmsg").textContent = "3D needs WebGL, which this browser or device doesn't offer. Showing the 2D board.";
			setTimeout(function () { S.dim = "2d"; save(); segSet("ch-dim", "2d"); render(true); }, 2500);
		});
	}
	function size3d() { if (!v3) return; var r = box3.getBoundingClientRect(); if (r.width > 10 && r.height > 10) v3.size(Math.round(r.width), Math.round(r.height)); }
	function draw3d(noAnim) {
		if (!v3) return;
		var s = viewState(), live = canInput() && vi === null, tg = live && sel >= 0 ? targetsFrom(s, sel) : {};
		var chk = C.inCheck(s) ? C.kingSq(s, s.turn) : -1, a = null;
		if (!noAnim && anim && vi === null && anim.n === s.hist.length && anim3n !== anim.n) { a = { f: anim.f, t: anim.t, rf: anim.rf >= 0 ? anim.rf : undefined, rt: anim.rt >= 0 ? anim.rt : undefined }; anim3n = anim.n; }
		v3.setPosition({ b: C.board64(s), flip: bottom() === 1, last: s.last ? { f: s.last.f, t: s.last.t } : null, check: chk, sel: live ? sel : -1, targets: Object.keys(tg).map(Number), anim: a });
	}
	if (window.ResizeObserver) new ResizeObserver(function () { size3d(); }).observe(box3);
	var p3 = { pts: {}, drag: null };
	box3.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	box3.addEventListener("pointerdown", function (e) {
		p3.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
		try { box3.setPointerCapture(e.pointerId); } catch (er) {}
		var n = Object.keys(p3.pts).length;
		p3.drag = { x: e.clientX, y: e.clientY, look: e.button === 2 || e.shiftKey || n > 1, moved: false, d0: 0 };
		if (n === 2) { var a = Object.values(p3.pts); p3.drag.d0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
		e.preventDefault();
	});
	box3.addEventListener("pointermove", function (e) {
		if (!p3.pts[e.pointerId] || !p3.drag || !v3) return;
		var prev = p3.pts[e.pointerId]; p3.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
		var pts = Object.values(p3.pts);
		if (pts.length === 2 && p3.drag.d0) { var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); if (d > 0) { v3.zoom(p3.drag.d0 / d); p3.drag.d0 = d; } }
		if (Math.abs(e.clientX - p3.drag.x) + Math.abs(e.clientY - p3.drag.y) > 6) p3.drag.moved = true;
		if (p3.drag.look) v3.orbit((e.clientX - prev.x) / (pts.length > 1 ? 2 : 1), (e.clientY - prev.y) / (pts.length > 1 ? 2 : 1));
		else if (p3.drag.moved) v3.orbit(e.clientX - prev.x, e.clientY - prev.y);   // a plain drag looks around the board in every camera mode
	});
	function up3(e) {
		var d = p3.drag; delete p3.pts[e.pointerId];
		if (Object.keys(p3.pts).length === 0) p3.drag = null;
		if (!d || d.look || !v3 || e.type === "pointercancel") return;
		if (!d.moved) chooseSquare(v3.pick(e.clientX, e.clientY));
	}
	box3.addEventListener("pointerup", up3);
	box3.addEventListener("pointercancel", up3);
	box3.addEventListener("wheel", function (e) {
		if (!v3) return;
		var full = view.classList.contains("mes-pfill") || document.fullscreenElement;
		if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !full) return;
		// Shift + wheel arrives as a sideways scroll on Macs (deltaX), so use whichever axis moved
		var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
		if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= 400;
		e.preventDefault(); if (!d) return;
		v3.zoom(Math.exp(Math.max(-0.3, Math.min(0.3, d * 0.0015))));
	}, { passive: false });
	box3.addEventListener("dblclick", function () { if (v3) v3.resetView(); });

	/* ---------- render ---------- */
	function nameOf(p) {
		var base = C.playerName(cfg, p);
		if (mode === "cpu") return p === human ? "You" : "Computer (" + C.LEVELS[S.lv].name + ")";
		if (mode === "online" && on.g) { var nm = on.g.names[p]; return p === on.seat ? "You" : nm ? esc(nm) : "waiting…"; }
		if (mode === "hive" && hv.R) { var hn = hv.R.players[p]; return hn && hn === hMe() ? "You (@" + esc(hn) + ")" : hn ? "@" + esc(hn) : "waiting…"; }
		return base;
	}
	function youAre(p) { return mySeat() === p; }
	function chip(p) { return '<span class="ch-chip p' + p + '" aria-hidden="true"></span>'; }
	function renderPlayers() {
		var s = viewState(), mat = C.material(s), bot = bottom();
		[[1 - bot, "ch-ptop"], [bot, "ch-pbot"]].forEach(function (q) {
			var p = q[0], el = $(q[1]), lostOther = mat.lost[1 - p], diff = p === 0 ? mat.diff : -mat.diff;
			var caps = lostOther.map(function (L) { return '<svg class="ch-cap" viewBox="0 0 45 45">' + pieceSvg(p === 0 ? L.toLowerCase() : L) + "</svg>"; }).join("");
			var turn = !s.win && s.turn === p, clockHtml = "";
			if (clk && (mode === "cpu" || mode === "local")) {
				var left = clockLeft(p);
				clockHtml = '<span class="ch-clock' + (clk.on === p ? " is-on" : "") + (left < 20000 && clk.on === p ? " is-low" : "") + '">' + fmtClock(left) + "</span>";
			}
			var extra = cfg.v === "T" ? '<span class="ch-checks" title="Checks given">' + s.checks[p] + "/3 checks</span>" : "";
			el.innerHTML = '<span class="ch-pname' + (turn ? " is-turn" : "") + '">' + chip(p) + nameOf(p) + "</span>" + extra + '<span class="ch-caps">' + caps + (diff > 0 ? '<b class="ch-diff">+' + diff + "</b>" : "") + "</span>" + clockHtml;
		});
	}
	function statusText(s) {
		if (mode === "online" && on.g && on.g.status === "wait") return "Waiting for someone to join…";
		if (mode === "hive") {
			if (!hv.R || !hv.R.open) return "Reading the game from Hive…";
			if (hv.R.status === "wait") return "Waiting for a player (Hive game)…";
			if (hv.busy) return "Approve it in Hive Keychain…";
			if (!s.win && hv.pending.length) return "Sent: waiting for the next Hive block…";
		}
		if (s.win) {
			var why = s.win.why, p = s.win.p;
			if (p < 0) return { stalemate: "Draw by stalemate.", fifty: "Draw: 50 moves without a capture or pawn move.", repeat: "Draw: the same position three times.", material: "Draw: not enough material to checkmate.", agreed: "Draw agreed.", "flag-draw": "Draw: time ran out, but the other side can't checkmate." }[why] || "Draw.";
			var W = function (x) { return youAre(x) ? chip(x) + "<b>You win</b>" : chip(x) + nameOf(x) + (mode === "local" || mode === "cpu" && x !== human ? " wins" : " wins"); };
			var other = function (x) { return youAre(x) ? "you" : mode === "cpu" ? "the computer" : C.playerName(cfg, x); };
			if (why === "mate") return W(p) + " by checkmate" + (youAre(p) ? "! 🎉" : ".");
			if (why === "resign") return W(p) + " (" + other(1 - p) + " resigned).";
			if (why === "timeout") return W(p) + " (" + other(1 - p) + (youAre(1 - p) ? " were" : " was") + " away too long).";
			if (why === "flag") return W(p) + " on time.";
			if (why === "left") return W(p) + " (" + other(1 - p) + " left).";
			if (why === "hill") return W(p) + ": the king reached the hill!";
			if (why === "checks") return W(p) + ": three checks!";
			return W(p) + ".";
		}
		if (vi !== null) return "Looking back: move " + vi + " of " + st.hist.length + ".";
		if (busy) return chip(s.turn) + "The computer is thinking…";
		var who = mode === "local" ? C.playerName(cfg, s.turn) : (youAre(s.turn) ? "Your move" : nameOf(s.turn) + " to move");
		return chip(s.turn) + (mode === "local" ? who + " to move" : who) + (C.inCheck(s) ? ": <b>check!</b>" : ".");
	}
	function renderMoves() {
		var ol = $("ch-moves"), h = st.hist, at = vi === null ? h.length : vi, startBlack = /\sb\s/.test(st.fen0), full = parseInt(st.fen0.split(" ")[5], 10) || 1;
		var items = [];
		for (var i = 0; i < h.length; i++) {
			var ply = i + (startBlack ? 1 : 0), num = full + Math.floor(ply / 2);
			var tx = mode === "hive" && hv.R && hv.R.trx.moves[i] ? ' title="Hive transaction ' + esc(hv.R.trx.moves[i]) + '"' : "";
			var btn = '<button type="button" data-mi="' + (i + 1) + '" class="' + (i + 1 === at ? "is-cur" : "") + '"' + tx + ">" + esc(st.sans[i]) + "</button>";
			if (ply % 2 === 0) items.push('<li><span class="ch-mn">' + num + ".</span>" + btn);
			else if (i === 0) items.push('<li><span class="ch-mn">' + num + "…</span>" + btn);
			else items[items.length - 1] += btn;
		}
		ol.innerHTML = items.map(function (x) { return x + "</li>"; }).join("") + (st.win ? '<li class="ch-res">' + C.resultText(st) + "</li>" : "");
		$("ch-rpos").textContent = h.length ? (at === h.length ? "Move " + Math.ceil(at / 2) + " (now)" : "Half-move " + at + " of " + h.length) : "No moves yet";
		var bs = root.querySelectorAll("[data-r]");
		for (i = 0; i < bs.length; i++) { var r = bs[i].getAttribute("data-r"); bs[i].disabled = r === "first" || r === "prev" ? at === 0 : at === h.length; }
		var cur = ol.querySelector(".is-cur");
		if (cur && ol.scrollHeight > ol.clientHeight) cur.scrollIntoView({ block: "nearest" });
	}
	function renderEval() {
		var bar = $("ch-evbar"), show = S.anal && analysisAllowed();
		bar.hidden = !show;
		var note = "";
		if (show) {
			var s = viewState(), r = anal.key === code + ":" + s.hist.join(".") ? anal.r : null;
			if (s.win) { $("ch-evfill").style.height = (s.win.p === 0 ? 100 : s.win.p === 1 ? 0 : 50) + "%"; $("ch-evtxt").textContent = C.resultText(s); }
			else if (r) {
				var vw = s.turn === 0 ? r.v : -r.v, mw = r.mate ? (s.turn === 0 ? r.mate : -r.mate) : 0;
				var pct = mw ? (mw > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-vw / 260)) - 1);
				$("ch-evfill").style.height = pct + "%";
				$("ch-evtxt").textContent = C.evalLabel(vw, mw);
				var st2 = C.replay(cfg, s.hist), bm = r.best && C.san(st2, r.best);
				note = "Computer: " + C.evalLabel(vw, mw) + " for White" + (bm ? " · best move " + bm : "") + (r.pv && r.pv.length > 1 ? " · line " + pvSan(st2, r.pv) : "") + " (" + r.depth + " half-moves deep).";
			} else if (!(mode === "cpu" && s.turn !== human && !s.win)) note = "The computer is looking at the position…";
		}
		$("ch-anote").textContent = note;
	}
	function pvSan(s, pv) { var w = C.replay(cfg, s.hist), out = []; pv.slice(0, 6).forEach(function (m) { if (w && C.isLegal(w, m)) { out.push(C.san(w, m)); C.apply(w, m); } }); return out.join(" "); }
	function render(keepAnal) {
		var s = viewState();
		root.classList.toggle("ch-incpu", S.opp === "cpu" && mode !== "online" && mode !== "hive");
		root.classList.toggle("ch-inlocal", mode === "local");
		root.classList.toggle("ch-3don", use3d());
		$("ch-status").innerHTML = statusText(s);
		if (!keepAnal) runAnalysis();
		board.hidden = use3d();
		box3.hidden = !use3d();
		if (use3d()) { ensure3d(); draw3d(); } else drawBoard();
		renderPlayers();
		renderMoves();
		renderEval();
		var on1 = mode === "online" || mode === "hive";
		$("ch-undo").disabled = on1 || !st.hist.length;
		$("ch-undo").hidden = on1;
		$("ch-new").hidden = on1;
		$("ch-hint").hidden = on1 || !!st.win;
		$("ch-hint").disabled = !canInput();
		$("ch-resign").hidden = on1 || !!st.win || !st.hist.length;
		var ob = function (k) { return root.querySelector('.ch-ob[data-o="' + k + '"]'); };
		ob("undo").hidden = on1; ob("undo").disabled = on1 || !st.hist.length;
		ob("hint").hidden = on1 || !!st.win; ob("hint").disabled = !canInput();
		applyShow();
		var canSave = st.win && (mode === "cpu" || mode === "local") && vi === null && ["mate", "stalemate", "fifty", "repeat", "material", "hill", "checks"].indexOf(st.win.why) >= 0;
		$("ch-hsave").hidden = !canSave;
		var savedKey = code + ":" + st.hist.join(".");
		var sv = S.saved[savedKey];
		$("ch-hsave").innerHTML = sv ? "⬢ Saved on Hive" : "⬢ Save result to Hive";
		$("ch-hsave").disabled = !!sv;
		$("ch-hsaved").innerHTML = sv && canSave ? 'Saved (self-reported): <a href="https://hivehub.dev/tx/' + esc(sv) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(sv) + '" target="_blank" rel="noopener">hiveblocks</a>' : "";
		$("ch-hpost").hidden = !(st.win && st.hist.length >= 2 && vi === null);
		renderObar();
		setupLock();
	}

	/* ---------- setup controls ---------- */
	function fillGameSelect() {
		var groups = {}, order = [];
		C.PRESETS.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
		$("ch-game").innerHTML = order.map(function (g) { return '<optgroup label="' + g + '">' + groups[g].map(function (p) { return '<option value="' + p.id + '">' + p.name + "</option>"; }).join("") + "</optgroup>"; }).join("");
		var R = window.CH3D ? window.CH3D.ROOMS : [{ id: "club", name: "Chess club" }], SE = window.CH3D ? window.CH3D.SETS : [{ id: "wood", name: "Wood" }];
		$("ch-room").innerHTML = R.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + "</option>"; }).join("");
		$("ch-set").innerHTML = SE.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + "</option>"; }).join("");
	}
	function syncSetup() {
		$("ch-game").value = C.preset(S.game) ? S.game : "standard";
		segSet("ch-opp", S.opp); segSet("ch-lv", S.lv); segSet("ch-me", S.me); segSet("ch-ofirst", S.ofirst); segSet("ch-dim", S.dim);
		$("ch-clock").value = S.clock || ""; $("ch-dots").checked = S.dots !== false; $("ch-anal").checked = !!S.anal; $("ch-autoflip").checked = !!S.autoflip; $("ch-sound").checked = S.sound !== false;
		$("ch-room").value = S.room; $("ch-set").value = S.set; $("ch-cam").value = S.cam; $("ch-theme").value = S.theme; $("ch-pcol").value = PCOL.hasOwnProperty(S.pcol) ? S.pcol : "auto";
		root.setAttribute("data-theme", S.theme);
		var p = C.preset(S.game) || C.PRESETS[0];
		$("ch-desc").textContent = p.desc + (S.opp === "cpu" ? " Computer: " + C.LEVELS[S.lv].name + " (about " + C.LEVELS[S.lv].elo + " strength)." : "");
		$("ch-ovar").textContent = p.name;
		$("ch-name").value = S.name || "";
		$("ch-opub").checked = S.opub !== false;
		$("ch-ht").value = String(S.ht || 5);
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === v ? "true" : "false"); }
	function segWire(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || b.disabled) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); }); }
	function setupLock() {
		var lock = mode === "online" || mode === "hive", els = $("ch-setup").querySelectorAll("select, input, button");
		for (var i = 0; i < els.length; i++) if (["ch-dots", "ch-anal", "ch-sound", "ch-autoflip"].indexOf(els[i].id) < 0) els[i].disabled = lock;
	}
	fillGameSelect();
	$("ch-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("ch-opp", function (v) { S.opp = v; save(); syncSetup(); newGame(); });
	segWire("ch-lv", function (v) { S.lv = v; save(); syncSetup(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next move."); render(true); });
	segWire("ch-me", function (v) { S.me = v; save(); newGame(); });
	segWire("ch-ofirst", function (v) { S.ofirst = v; save(); });
	segWire("ch-dim", function (v) { S.dim = v; save(); render(true); });
	$("ch-clock").addEventListener("change", function () { S.clock = this.value; save(); if (!st.hist.length || st.win) newGame(); else toast("The clock applies from the next game."); });
	$("ch-dots").addEventListener("change", function () { S.dots = this.checked; save(); render(true); });
	$("ch-anal").addEventListener("change", function () { S.anal = this.checked; save(); anal.key = ""; if (S.anal && mode === "cpu") assisted = true; render(); });
	$("ch-autoflip").addEventListener("change", function () { S.autoflip = this.checked; save(); render(true); });
	$("ch-sound").addEventListener("change", function () { S.sound = this.checked; save(); });
	$("ch-room").addEventListener("change", function () { S.room = this.value; save(); if (v3) v3.setRoom(S.room); });
	$("ch-set").addEventListener("change", function () { S.set = this.value; save(); if (v3) { v3.setSet(S.set); draw3d(true); } });
	$("ch-cam").addEventListener("change", function () { S.cam = this.value; save(); if (v3) v3.setCam(S.cam); });
	$("ch-pcol").addEventListener("change", function () { S.pcol = this.value; save(); applyPcol(); render(true); });
	$("ch-view3").addEventListener("click", function () { if (v3) v3.resetView(); });
	/* buttons on the board + what to show (the "Show" ticks sit in the view bar, so they are in the side panel too) */
	$("ch-otb").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b || b.disabled) return;
		var o = b.getAttribute("data-o");
		if (o === "undo") undo(); else if (o === "hint") hint(); else if (o === "view") { if (v3) v3.resetView(); } else if (o === "flip") $("ch-flip").click();
	});
	function inFill() { return $("ch-view").classList.contains("mes-pfill") || !!document.fullscreenElement; }
	function applyShow() {
		var sh = S.show;
		root.classList.toggle("ch-nonames", !sh.names);
		$("ch-otb").hidden = !sh.btns || !(use3d() || inFill());
		$("ch-moves").hidden = !sh.moves;
		$("ch-typebox").hidden = !sh.type;
		$("ch-otype").hidden = !sh.type;
		root.querySelectorAll("[data-sh]").forEach(function (c) { c.checked = !!sh[c.getAttribute("data-sh")]; });
	}
	root.querySelector(".ch-shows").addEventListener("change", function (e) {
		var c = e.target.closest("[data-sh]"); if (!c) return;
		S.show[c.getAttribute("data-sh")] = c.checked; save(); applyShow(); setTimeout(size3d, 30);
	});
	$("ch-theme").addEventListener("change", function () { S.theme = this.value; save(); root.setAttribute("data-theme", S.theme); });
	$("ch-flip").addEventListener("click", function () { S.flipX = !S.flipX; save(); render(true); });
	$("ch-new").addEventListener("click", newGame);
	$("ch-undo").addEventListener("click", undo);
	$("ch-hint").addEventListener("click", hint);
	$("ch-resign").addEventListener("click", resign);
	root.querySelector(".ch-rbtns").addEventListener("click", function (e) {
		var b = e.target.closest("[data-r]"); if (!b) return;
		var n = st.hist.length, at = vi === null ? n : vi, r = b.getAttribute("data-r");
		at = r === "first" ? 0 : r === "prev" ? at - 1 : r === "next" ? at + 1 : n;
		vi = at >= n ? null : Math.max(0, at); sel = -1;
		render();
	});
	$("ch-moves").addEventListener("click", function (e) {
		var b = e.target.closest("[data-mi]"); if (!b) return;
		var at = +b.getAttribute("data-mi");
		vi = at >= st.hist.length ? null : at; sel = -1;
		render();
	});
	function shareLink() {
		var at = vi === null ? st.hist.length : vi;
		return location.origin + location.pathname + "?v=" + encodeURIComponent(code) + (at ? "&m=" + st.hist.slice(0, at).join(".") : "");
	}
	$("ch-link").addEventListener("click", function () { copy(shareLink(), "Link copied: it opens this game at this move."); });
	function players() {
		var nm = function (p) { if (mode === "cpu") return p === human ? (hMe() ? "@" + hMe() : "You") : "MES Chess computer (" + C.LEVELS[S.lv].name + ")"; if (mode === "online" && on.g) return on.g.names[p] || "?"; if (mode === "hive" && hv.R) return hv.R.players[p] ? "@" + hv.R.players[p] : "?"; return C.playerName(cfg, p); };
		return { white: nm(0), black: nm(1) };
	}
	function pgnText() { var pl = players(); return C.pgn(st, { white: pl.white, black: pl.black, event: mode === "hive" ? "MES Chess on Hive" : mode === "online" ? "MES Chess online" : "MES Chess" }); }
	$("ch-pgn").addEventListener("click", function () { copy(pgnText(), "PGN copied."); });
	$("ch-dl").addEventListener("click", function () {
		var a = document.createElement("a"), blob = new Blob([pgnText()], { type: "application/x-chess-pgn" });
		a.href = URL.createObjectURL(blob); a.download = "mes-chess-" + new Date().toISOString().slice(0, 10) + ".pgn";
		document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	});
	$("ch-load").addEventListener("click", function () { var b = $("ch-loadbox"); b.hidden = !b.hidden; if (!b.hidden) $("ch-loadtxt").focus(); });
	$("ch-loadx").addEventListener("click", function () { $("ch-loadbox").hidden = true; });
	$("ch-loadfile").addEventListener("change", function () { var f = this.files && this.files[0]; if (!f) return; f.text().then(function (t) { $("ch-loadtxt").value = t; loadText(t); }); this.value = ""; });
	$("ch-loadgo").addEventListener("click", function () { loadText($("ch-loadtxt").value); });
	function loadText(t) {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		t = String(t || "").trim();
		if (!t) return toast("Paste a PGN or a FEN first.");
		var isFen = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]/.test(t), c, moves = [];
		if (isFen) {
			var err = C.validateFen(t);
			if (err) return toast("That FEN isn't valid: " + err);
			c = C.parseCode("X" + t.split(/\s+/).slice(0, 6).join("_"));
			if (!c) return toast("That position can't be used.");
		} else {
			var r = C.parsePgn(t);
			if (r.error && !r.moves.length && !r.cfg) return toast(r.error);
			c = r.cfg; moves = r.moves;
			if (r.error) toast(r.error);
		}
		$("ch-loadbox").hidden = true;
		mode = S.opp;
		var s0 = C.replay(c, moves);
		human = mode === "cpu" ? (s0 ? s0.turn : 0) : 0;
		setGame(c, moves, { human: human, keepMode: true });
		if (!/move/i.test(String((C.parsePgn(t) || {}).error || "")) || isFen) toast(isFen ? "Position loaded: " + C.playerName(c, st.turn) + " to move." : "Game loaded (" + moves.length + " half-moves).");
	}

	/* ---------- fill window / full screen (shared panel-view.js) ---------- */
	var view = $("ch-view");
	function addPanel() {
		if (window.MESPanel && !view.__mesPanel) window.MESPanel.add(view, { bar: $("ch-pbar"), stage: $("ch-stage"), onChange: function () { render(true); setTimeout(size3d, 60); } });
	}
	addPanel();
	if (!view.__mesPanel) document.addEventListener("DOMContentLoaded", addPanel);
	window.addEventListener("load", addPanel);
	function panelBtn(n) { var b = view.querySelectorAll(".mes-pbtn")[n]; if (b) b.click(); }
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("ch-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if (k === "n" && mode !== "online" && mode !== "hive") newGame();
		else if (k === "u") undo();
		else if (k === "h") hint();
		else if (k === "r") { S.flipX = !S.flipX; save(); render(true); }
		else if (k === "d") { S.dim = S.dim === "3d" ? "2d" : "3d"; save(); segSet("ch-dim", S.dim); render(true); }
		else if (k === "w") panelBtn(0);
		else if (k === "f") panelBtn(1);
		else if (t !== board && (e.key === "ArrowLeft" || e.key === "ArrowRight") && st.hist.length) {
			var n = st.hist.length, at = vi === null ? n : vi;
			at += e.key === "ArrowLeft" ? -1 : 1;
			vi = at >= n ? null : Math.max(0, at); sel = -1;
			render();
		}
	});

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".ch-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("ch-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") { loadLobby(); loadHiveLobby(); renderHiveCard(); loadRecent(); }
		if (name === "stats") renderStats();
		if (name === "play") setTimeout(size3d, 30);
		lobbyTimer(name === "online");
	}
	$("ch-tabs").addEventListener("click", function (e) { var b = e.target.closest(".ch-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("ch-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("ch-stats"), keys = Object.keys(S.stats);
		if (!keys.length) { box.innerHTML = '<p class="ch-sub">No finished games yet. Play one against the computer or online and it shows up here.</p>'; return; }
		var LV = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", expert: "Expert computer", online: "Online (guest)", hive: "On Hive" }, VN = { S: "Standard", F: "Chess960", K: "King of the Hill", T: "Three-check", X: "From a position" };
		var tot = [0, 0, 0];
		keys.sort();
		var rows = keys.map(function (k) {
			var a = S.stats[k], parts = k.split("|"), n = a[0] + a[1] + a[2];
			tot[0] += a[0]; tot[1] += a[1]; tot[2] += a[2];
			return "<tr><td>" + esc(VN[parts[0]] || parts[0]) + "</td><td>" + (LV[parts[1]] || esc(parts[1])) + "</td><td>" + n + '</td><td class="w">' + a[0] + "</td><td>" + a[1] + '</td><td class="l">' + a[2] + "</td><td>" + bar(a) + "</td></tr>";
		}).join("");
		box.innerHTML = '<div style="overflow-x:auto"><table class="ch-stbl"><thead><tr><th>Game</th><th>Against</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th></th></tr></thead><tbody>' + rows +
			'</tbody><tfoot><tr><th>All games</th><th></th><th style="text-align:right">' + (tot[0] + tot[1] + tot[2]) + '</th><th style="text-align:right">' + tot[0] + '</th><th style="text-align:right">' + tot[1] + '</th><th style="text-align:right">' + tot[2] + "</th><th>" + bar(tot) + "</th></tr></tfoot></table></div>" +
			'<p><button type="button" class="tu-btn" id="ch-sreset">Reset statistics</button></p>';
		$("ch-sreset").addEventListener("click", function () { if (confirm("Delete all your chess statistics in this browser?")) { S.stats = {}; save(); renderStats(); } });
	}
	function bar(a) { var n = a[0] + a[1] + a[2] || 1; return '<span class="ch-bar" title="' + Math.round(a[0] * 100 / n) + '% won"><i class="bw" style="width:' + a[0] * 100 / n + '%"></i><i class="bd" style="width:' + a[1] * 100 / n + '%"></i><i class="bl" style="width:' + a[2] * 100 / n + '%"></i></span>'; }

	/* ---------- rules ---------- */
	function renderRules() {
		var mv = [["K", "King", "One square in any direction. It may never move into check. Once per game it may castle: two squares towards a rook that hasn't moved, with the rook jumping to the square it crossed (not out of, through or into check, and with nothing in between)."],
			["Q", "Queen", "Any number of squares in a straight line: along ranks, files or diagonals."],
			["R", "Rook", "Any number of squares along a rank or a file."],
			["B", "Bishop", "Any number of squares diagonally, so it stays on its colour."],
			["N", "Knight", "An L shape: two squares one way and one to the side. The only piece that jumps over others."],
			["P", "Pawn", "One square forward (two from its starting square), capturing one square diagonally forward. En passant: a pawn that just moved two squares can be captured as if it had moved one. On the last rank it becomes a queen, rook, bishop or knight."]];
		$("ch-rules").innerHTML = '<div class="ch-rule"><h3>The goal</h3><p>Checkmate: attack the other king so that it can\'t escape. White moves first, then the players take turns. A player whose king is attacked (in check) must get out of check at once.</p></div>' +
			mv.map(function (r) { return '<div class="ch-rule ch-rulep"><svg viewBox="0 0 45 45" aria-hidden="true">' + pieceSvg(r[0]) + "</svg><div><h3>" + r[1] + "</h3><p>" + r[2] + "</p></div></div>"; }).join("") +
			'<div class="ch-rule"><h3>Draws</h3><p>Stalemate (the player to move has no legal move but isn\'t in check), the same position three times, 50 moves by each side with no capture and no pawn move, not enough material left to checkmate, or both players agreeing.</p></div>' +
			C.PRESETS.slice(1).map(function (p) { return '<div class="ch-rule"><h3>' + p.name + "</h3><p>" + p.desc + '</p><button type="button" class="ch-vb" data-play="' + p.id + '">Play this</button></div>'; }).join("");
	}
	$("ch-rules").addEventListener("click", function (e) {
		var b = e.target.closest("[data-play]"); if (!b) return;
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-play"); save(); syncSetup(); showTab("play"); newGame();
		window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
	});

	/* ---------- toast / copy ---------- */
	var toastT = null;
	function toast(msg, html) { var t = $("ch-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, html ? 6000 : 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, fails: 0 };
	var API = "/api/chess";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("ch-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("ch-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("ch-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("ch-ht").addEventListener("change", function () { S.ht = +this.value; save(); });
	$("ch-ochange").addEventListener("click", function () { showTab("play"); $("ch-game").focus(); });
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		setGame(C.parseCode(r.g.v), r.g.moves, { keepMode: true });
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("ch-ocreate").addEventListener("click", function () {
		if (mode === "online" || mode === "hive") return toast("You are already in an online game.");
		var c = setupCfg();
		S.name = ($("ch-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: C.cfgCode(c), name: myName(), pub: $("ch-opub").checked, first: S.ofirst }).then(function (r) {
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
			toast("You joined " + (r.g.names[1 - r.seat] || "the game") + ". You play " + C.playerName(cfg, r.seat) + ".");
		});
	}
	function leaveOnline() {
		clearTimeout(on.timer);
		on.id = null; on.g = null; S.online = null; save();
		mode = S.opp; newGame();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("ch-obar");
		if (mode === "hive") return renderHbar();
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="ch-dot"></span>Waiting for a player. Send them this link:</span><span class="ch-vbtns"><button type="button" class="ch-vb ch-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="ch-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="ch-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var away = g.status === "play" && st.turn !== on.seat && (g.idle || 0) > 180000;
			h = '<span><span class="ch-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b>" + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="ch-vbtns">';
			if (g.status === "play") {
				if (g.offer === 1 - on.seat) h += '<button type="button" class="ch-vb ch-vb--main" data-o="accept">½ Accept their draw offer</button>';
				else if (g.offer === on.seat) h += '<span class="ch-sub">Draw offered…</span>';
				else if (st.hist.length >= 2) h += '<button type="button" class="ch-vb" data-o="offer">½ Offer a draw</button>';
				if (away) h += '<button type="button" class="ch-vb ch-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="ch-vb" data-o="resign">Resign</button>';
			} else h += '<button type="button" class="ch-vb ch-vb--main" data-o="rematch">↺ Rematch</button>';
			h += '<button type="button" class="ch-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("ch-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play chess with me", text: "Join my chess game: " + C.describe(cfg), url: inviteLink() }).catch(function () {});
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
			if (a === "offer") toast("Draw offered.");
			sync(r.g);
		});
	});
	function onlineMove(m) {
		var n = st.hist.length;
		on.sending = true;
		C.apply(st, m); vi = null; animFor(); sound();
		render();
		api("POST", { act: "move", id: on.id, key: on.key, n: n, m: C.mstr(m) }).then(function (r) {
			on.sending = false;
			if (r.error) { toast(r.error); refetch(); return; }
			sync(r.g);
			if (st.win) finish();
		});
	}
	function refetch() { api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) sync(r.g); }); }
	function applyServerWin() {
		var g = on.g;
		if (g && g.status === "over" && g.win && !st.win) st.win = { p: g.win.p, line: null, lines: [], why: g.win.why };
	}
	function sync(g) {
		if (!g || !on.id || g.id !== on.id) return;
		var prev = on.g, wasOver = st.win;
		on.g = g;
		if (!prev || prev.round !== g.round || g.v !== code || g.moves.length < st.hist.length || g.moves.slice(0, st.hist.length).join() !== st.hist.join()) {
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! You play " + C.playerName(cfg, on.seat) + " now."); }
			cfg = C.parseCode(g.v) || cfg; code = C.cfgCode(cfg);
			st = C.replay(cfg, g.moves) || C.create(cfg);
			wasOver = null;
		} else {
			var grew = false;
			for (var i = st.hist.length; i < g.moves.length; i++) {
				if (!C.apply(st, g.moves[i])) { st = C.replay(cfg, g.moves) || st; break; }
				grew = true;
			}
			if (grew) { animFor(); sound(); }
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your move!" : "They play White."));
		if (prev && g.offer === 1 - on.seat && prev.offer !== g.offer) toast((g.names[1 - on.seat] || "They") + " offer a draw.");
		applyServerWin();
		render();
		if (st.win && !wasOver) finish();
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
				} else { var wasBad = on.fails > 2; on.fails = 0; sync(r.g); if (wasBad) renderObar(); }
				poll(nextDelay());
			});
		}, delay);
	}
	function nextDelay() {
		var g = on.g, hidden = document.hidden;
		if (!g) return 3000;
		if (g.status === "over") return hidden ? 10000 : 3000;
		var waitingOn = g.status === "wait" || st.turn !== on.seat;
		return hidden ? 6000 : waitingOn ? 1200 : 4000;
	}
	document.addEventListener("visibilitychange", function () { if (!document.hidden && on.id) poll(50); });

	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) { loadLobby(); loadHiveLobby(); } }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
	function firstText(f) { return f === "host" ? "you play Black" : f === "guest" ? "you play White" : "random colours"; }
	function codeName(v) { var c = C.parseCode(v); return c ? C.describe(c) : v; }
	function paceText(t) { return { 5: "5 min a move", 15: "15 min a move", 60: "1 hour a move", 1440: "1 day a move", 4320: "3 days a move" }[t] || ""; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("ch-lobby");
			if (r.error) { box.innerHTML = '<p class="ch-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="ch-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="ch-lob">' + list.map(function (o) {
				return '<li><span class="ch-lobn">' + esc(o.name || "Guest") + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · " + firstText(o.first) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("ch-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("ch-orefresh").addEventListener("click", loadLobby);

	/* ===================================================================== Hive games ===================================================================== */
	var H = C.hive;
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
			kc: function () { return M() ? M().keychain() : Promise.resolve(null); },
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
		function chain() { try { return JSON.parse(localStorage.getItem("mes-chess:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-chess:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-chess:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-chess:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			kc: function () { return Promise.resolve(null); },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12);
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19),
					op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-chess:hchain", JSON.stringify(c));
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
		var box = $("ch-hlogin"), me = hMe();
		$("ch-hmake").hidden = !me;
		$("ch-hvar").textContent = (C.preset(S.game) || C.PRESETS[0]).name;
		if (me) {
			box.innerHTML = '<p class="ch-hwho">Signed in as ' + (MOCK ? "" : '<img alt="" src="https://images.hive.blog/u/' + esc(me) + '/avatar/small">') + "<b>@" + esc(me) + '</b> <button type="button" class="tu-btn" id="ch-hlogout">Log out</button></p>';
			$("ch-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="ch-hrow"><input class="tu-input" id="ch-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="ch-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed (no Keychain on this local copy)." : "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them.") + "</p>";
			var go = function () {
				var b = $("ch-hlogin-b"); b.disabled = true; b.textContent = "Check Keychain…";
				HA.login($("ch-huser").value).then(function () { toast("Logged in."); }, function (e) {
					b.disabled = false; b.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test(e.message + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			$("ch-hlogin-b").addEventListener("click", go);
			$("ch-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("ch-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(true); });

	function hiveCreate() {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode === "online" || mode === "hive") return toast("Leave the game you are in first.");
		var c = setupCfg();
		var to = ($("ch-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast(to === me ? "You can't challenge yourself." : "That isn't a Hive username.");
		var obj = { a: "open", g: H.newGid(), v: C.cfgCode(c), f: S.ofirst, t: +$("ch-ht").value || 5 };
		if (to) obj.to = to;
		var b = $("ch-hcreate"); b.disabled = true;
		HA.send(obj, to ? "Challenge @" + to + " to a game of chess" : "Open a chess game").then(function (r) {
			b.disabled = false;
			hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: hMe(), g: obj.g });
			toast(obj.to ? "Challenge sent: copy the link above the board and send it to @" + obj.to + "." : "Your game is open: it will show up under Open Hive games.");
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
			HA.send(obj, "Join @" + host + "'s chess game").then(function (r) {
				hiveEnter(host, gid, [pend(obj, r.trx)]);
				register("hjoin", { host: host, g: gid, acct: me });
			}, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.joiners = []; hv.reOffer = null; hv.listed = false; hv.busy = false; hv.ops = {};
		S.hive = { host: host, gid: gid }; save();
		mode = "hive"; clk = null;
		showTab("play");
		hivePoll(0);
		render();
	}
	function hiveLeave() {
		clearTimeout(hv.timer);
		hv.host = null; hv.R = null; S.hive = null; save();
		mode = S.opp; newGame();
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
		if (R.status === "play") return R.turnAcct === hMe() ? 6000 : (R.open && R.open.t >= 1440 ? 20000 : 3000);
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
		var R = H.build(hv.host, hv.gid, all.concat(hv.pending), now);
		var prev = hv.R;
		hv.R = R;
		if (R.cfg && (!cfg || C.cfgCode(R.cfg) !== code)) { cfg = R.cfg; code = C.cfgCode(cfg); }
		var was = st && st.win;
		var sameGame = prev && prev.open && R.open && prev.open.g === R.open.g;
		var grew = sameGame && prev.s && R.s && R.s.hist.length > prev.s.hist.length;
		st = R.s ? R.s : C.create(cfg || { v: "S" });
		if (sameGame && was) st._fin = true;
		if (grew) { animFor(); sound(); }
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined. " + (R.turnAcct === hMe() ? "Your move!" : "They play White."));
		hv.reOffer = null;
		if (R.status === "over") {
			var other = R.players[0] === hMe() ? R.players[1] : R.players[0];
			var mine = H.myGames(other, hv.ops[other] || []).filter(function (g) { return g.re === hv.host + "/" + hv.gid && g.role === "host"; });
			if (mine.length) hv.reOffer = mine[0];
		}
		render();
		if (st.win && !st._fin) finish();
	}
	function hiveSend(obj, label) {
		hv.busy = true; render(true);
		return HA.send(obj, label).then(function (r) {
			hv.busy = false;
			hv.pending.push(pend(obj, r.trx));
			hiveRebuild();
			hivePoll(2500);
		}, function (e) { hv.busy = false; render(true); toast(e.message); throw e; });
	}
	function hiveMove(o) {
		hiveSend({ a: "mv", h: hv.host, g: hv.gid, n: st.hist.length, m: C.mstr(o) }, "Chess move " + C.san(st, o) + " vs @" + hiveOther()).catch(function () {});
	}
	function hiveOther() { var R = hv.R, me = hMe(); if (!R) return ""; return R.players[0] === me ? (R.players[1] || "") : (R.players[0] || R.open && R.open.to || ""); }
	function renderHbar() {
		var box = $("ch-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h, link = '<span class="ch-chain">On Hive · game <a href="https://hivehub.dev/@' + esc(hv.host) + '" target="_blank" rel="noopener">@' + esc(hv.host) + "</a>/" + esc(hv.gid) + (R && R.open ? " · " + paceText(R.open.t) : "") + "</span>";
		if (!R || !R.open) h = '<span><span class="ch-dot is-off"></span>Reading the game from Hive…</span><span class="ch-vbtns"><button type="button" class="ch-vb" data-h="leave">Leave</button></span>';
		else if (R.status === "wait") {
			h = '<span><span class="ch-dot"></span>' + (R.open.to ? "Waiting for @" + esc(R.open.to) + " to accept" : "Waiting for someone on Hive to join") + ".</span>" + link + '<span class="ch-vbtns">' +
				(me && me !== hv.host && (!R.open.to || R.open.to === me) ? '<button type="button" class="ch-vb ch-vb--main" data-h="join">Join this game</button>' : "") +
				'<button type="button" class="ch-vb' + (me === hv.host ? " ch-vb--main" : "") + '" data-h="copy">🔗 Copy invite link</button>' + (hv.host === me ? '<button type="button" class="ch-vb" data-h="cancel">Cancel game</button>' : "") + '<button type="button" class="ch-vb" data-h="leave">Leave</button></span>';
		} else if (R.status === "cancelled" || R.status === "expired") {
			h = "<span>This Hive game was " + (R.status === "cancelled" ? "cancelled" : "never joined (open games last an hour)") + '.</span><span class="ch-vbtns"><button type="button" class="ch-vb" data-h="leave">Close</button></span>';
		} else {
			var other = hiveOther(), seat = R.players.indexOf(me), mine = seat >= 0;
			h = '<span><span class="ch-dot' + (Date.now() - hv.lastErr < 10000 ? " is-off" : "") + '"></span>' + (mine ? "Hive game vs <b>@" + esc(other) + "</b>" : "Watching <b>@" + esc(R.players[0]) + "</b> vs <b>@" + esc(R.players[1]) + "</b>") + "</span>" + link + '<span class="ch-vbtns">';
			if (R.status === "play" && mine) {
				var offerOk = R.offer && R.s.hist.length <= R.offer.n + 1;
				if (offerOk && R.offer.seat !== seat) h += '<button type="button" class="ch-vb ch-vb--main" data-h="dra">½ Accept @' + esc(other) + "'s draw offer</button>";
				else if (offerOk && R.offer.seat === seat) h += '<span class="ch-sub">Draw offered…</span>';
				else if (R.s.hist.length >= 2) h += '<button type="button" class="ch-vb" data-h="dro">½ Offer a draw</button>';
				if (R.turnAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="ch-vb ch-vb--main" data-h="claim">Claim the win (out of time)</button>';
				h += '<button type="button" class="ch-vb" data-h="resign">Resign</button>';
			} else if (R.status === "over" && mine) {
				if (hv.reOffer) h += '<button type="button" class="ch-vb ch-vb--main" data-h="accept">Accept @' + esc(other) + "'s rematch</button>";
				else h += '<button type="button" class="ch-vb ch-vb--main" data-h="rematch">↺ Offer a rematch</button>';
			}
			h += '<button type="button" class="ch-vb" data-h="leave">Leave</button></span>';
			if (R.status === "over" && R.trx) {
				h += '<details class="ch-trx"><summary>On the chain (' + (R.trx.moves.length + 2) + ' transactions)</summary><ul>' +
					"<li>Open: " + txLinks(R.trx.open) + "</li><li>Join: " + txLinks(R.trx.join) + "</li>" +
					R.trx.moves.map(function (t, i) { return "<li>Move " + (i + 1) + " (" + esc(st.sans[i] || "") + "): " + txLinks(t) + "</li>"; }).join("") +
					(R.trx.end && R.trx.moves.indexOf(R.trx.end) < 0 ? "<li>End (" + esc(R.win ? R.win.why : "") + "): " + txLinks(R.trx.end) + "</li>" : "") + "</ul></details>";
			}
		}
		box.innerHTML = h;
	}
	$("ch-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h"), R = hv.R;
		if (a === "copy") return copy(hLink(hv.host, hv.gid), "Invite link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open chess game").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive game? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign chess vs @" + hiveOther()).catch(function () {}); return; }
		if (a === "claim") return hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win: @" + hiveOther() + " ran out of time").catch(function () {});
		if (a === "dro") return hiveSend({ a: "dro", h: hv.host, g: hv.gid, n: st.hist.length }, "Offer @" + hiveOther() + " a draw").catch(function () {});
		if (a === "dra") return hiveSend({ a: "dra", h: hv.host, g: hv.gid }, "Accept @" + hiveOther() + "'s draw offer").catch(function () {});
		if (a === "accept" && hv.reOffer) return hiveJoin(hv.reOffer.host, hv.reOffer.gid);
		if (a === "rematch" && R) {
			var other = hiveOther(), iWasWhite = R.players[0] === hMe();
			var obj = { a: "open", g: H.newGid(), v: R.open.v, f: iWasWhite ? "guest" : "host", t: R.open.t || 5, to: other, re: hv.host + "/" + hv.gid };
			HA.send(obj, "Offer @" + other + " a chess rematch").then(function (r) { hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]); toast("Rematch offered: @" + other + " sees an Accept button."); }, function (e2) { toast(e2.message); });
		}
	});

	/* self-reported results of games against the computer / on one device */
	$("ch-hsave").addEventListener("click", function () {
		if (!st.win) return;
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab) and press Save again on the Play tab."); return; }
		var obj = { a: "rec", g: H.newGid(), v: code, m: st.hist.join("."), o: mode === "cpu" ? S.lv : "local", s: mode === "cpu" ? human : -1, w: st.win.p };
		if (!H.clean(obj)) return toast("This game can't be saved (too long, or a variant code that can't be stored).");
		var key = code + ":" + st.hist.join("."), b = this;
		b.disabled = true;
		HA.send(obj, "Save a chess result (self-reported)").then(function (r) {
			S.saved[key] = r.trx || "?";
			var ks = Object.keys(S.saved); if (ks.length > 80) delete S.saved[ks[0]];
			save(); render(true);
			if (r.trx) toast("Saved on Hive: " + txLinks(r.trx), true); else toast("Saved on Hive.");
			register("hrec", { acct: me, g: obj.g });
		}, function (e) { b.disabled = false; toast(e.message); });
	});

	/* a Hive post about the game (Chess Brothers curate #chessbrothers) */
	function postDraft() {
		var pl = players(), res = C.resultText(st), why = st.win ? st.win.why : "";
		var desc = st.win ? (st.win.p < 0 ? "a draw" : (st.win.p === 0 ? "White" : "Black") + " won" + ({ mate: " by checkmate", resign: " by resignation", flag: " on time", hill: " (King of the Hill)", checks: " (three checks)" }[why] || "")) : "";
		var opp = mode === "cpu" ? "the " + C.LEVELS[S.lv].name + " computer" : mode === "hive" ? "@" + hiveOther() : mode === "online" ? (on.g && on.g.names[1 - on.seat]) || "an online player" : "a friend";
		var title = (mode === "local" ? "A game of " : "My game against " + opp + ": ") + C.describe(cfg).replace(/ \(.*/, "") + " (" + res + ")";
		var link = location.origin + location.pathname + "?v=" + encodeURIComponent(code) + "&m=" + st.hist.join(".");
		var body = "I just played a game of " + C.describe(cfg).toLowerCase().replace(/^standard chess$/, "chess") + " on [MES Chess](https://mes.fm/chess) against " + opp + ": " + desc + " after " + Math.ceil(st.hist.length / 2) + " moves.\n\n" +
			"**[Replay the game move by move](" + link + ")**\n\n## The moves\n\n" + C.moveText(st) + " " + res + "\n\n## PGN\n\nCopy it into any chess program to analyse it:\n\n```\n" + C.pgn(st, { white: pl.white, black: pl.black, event: "MES Chess" }) + "```\n\n" +
			"What would you have played differently? Let me know in the comments.\n\n---\n\n*Played on [mes.fm/chess](https://mes.fm/chess): free chess against the computer, a friend, online or on the Hive blockchain, in 2D or 3D.*";
		var tags = ["chessbrothers", "chess", "mesfm"];
		if (cfg.v === "F") tags.push("chess960");
		if (mode === "hive") tags.push("hive");
		return { title: title, body: body, tags: tags.join(" ") };
	}
	$("ch-hpost").addEventListener("click", function () {
		var d = postDraft(), box = $("ch-postbox");
		$("ch-ptitle").value = d.title; $("ch-pbody").value = d.body; $("ch-ptags").value = d.tags;
		box.hidden = false;
		box.scrollIntoView({ behavior: "smooth", block: "start" });
	});
	$("ch-px").addEventListener("click", function () { $("ch-postbox").hidden = true; });
	$("ch-pcopy").addEventListener("click", function () { copy("# " + $("ch-ptitle").value + "\n\n" + $("ch-pbody").value + "\n\nTags: " + $("ch-ptags").value, "Post text copied."); });
	function permlink(title) { return (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chess-game") + "-" + Date.now().toString(36); }
	$("ch-pgo").addEventListener("click", function () {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first (Play online tab), then come back to the Play tab."); return; }
		var title = $("ch-ptitle").value.trim(), body = $("ch-pbody").value.trim();
		var tags = $("ch-ptags").value.toLowerCase().split(/[\s,#]+/).filter(function (t) { return /^[a-z0-9][a-z0-9-]{0,23}$/.test(t); }).slice(0, 8);
		if (!title || !body) return toast("Give the post a title and some text.");
		if (!tags.length) tags = ["chessbrothers", "chess"];
		if (MOCK) return toast("Test mode: nothing is posted from this local copy.");
		if (!confirm("Publish this post from @" + me + "? Hive posts are public and can't be deleted.")) return;
		var b = this, pl = permlink(title), meta = JSON.stringify({ tags: tags, app: "mes.fm/chess", format: "markdown" });
		b.disabled = true; b.textContent = "Waiting for Keychain…";
		HA.kc().then(function (k) {
			if (!k) throw new Error("Hive Keychain is not installed in this browser.");
			return new Promise(function (ok, no) {
				k.requestPost(me, title, body, tags[0], "", meta, pl, "", function (r) { if (r && r.success) ok(r); else no(new Error((r && (r.message || r.error)) || "Cancelled in Keychain")); });
			});
		}).then(function () {
			b.disabled = false; b.textContent = "Publish on Hive";
			$("ch-postbox").hidden = true;
			toast('Published: <a href="https://peakd.com/@' + esc(me) + "/" + esc(pl) + '" target="_blank" rel="noopener">open it on PeakD</a>', true);
		}, function (e) { b.disabled = false; b.textContent = "Publish on Hive"; toast("Not published: " + e.message); });
	});

	/* lobby + my games + recent */
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("ch-hlobby"), me = hMe();
			if (r.error) { box.innerHTML = '<p class="ch-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			if (!list.length) { box.innerHTML = '<p class="ch-sub">No open Hive games right now.' + (me ? " Make one above." : " Log in to make one.") + "</p>"; return; }
			box.innerHTML = '<ul class="ch-lob">' + list.map(function (o) {
				return '<li><span class="ch-lobn">@' + esc(o.host) + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · " + paceText(o.t) + " · " + firstText(o.f) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>";
			}).join("") + "</ul>";
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 12), recs = H.records(ops).slice(0, 12), box = $("ch-hmine");
			$("ch-hminebox").hidden = !games.length && !recs.length;
			var OPP = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", expert: "Expert computer", local: "pass and play" };
			box.innerHTML = (games.length ? '<ul class="ch-lob">' + games.map(function (g) {
				return '<li><span class="ch-lobn">' + (g.role === "host" ? "You opened" + (g.to ? " (challenge to @" + esc(g.to) + ")" : "") : "You joined @" + esc(g.host)) + ' <span class="ch-lobv">· ' + (g.v ? esc(codeName(g.v)) + " · " : "") + new Date(g.ts).toLocaleString() + " · " + txLinks(g.trx) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>';
			}).join("") + "</ul>" : "") +
			(recs.length ? '<h4 class="ch-h4">Saved results (self-reported)</h4><ul class="ch-lob">' + recs.map(function (o) {
				var res = o.result === "w" ? "Won" : o.result === "l" ? "Lost" : o.result === "d" ? "Draw" : (o.w < 0 ? "Draw" : C.COLORS[o.w] + " won");
				var lk = location.pathname + "?v=" + encodeURIComponent(o.v) + "&m=" + o.moves.join(".");
				return '<li><span class="ch-lobn">' + esc(res) + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · vs " + esc(OPP[o.o] || o.o) + " · " + Math.ceil(o.moves.length / 2) + " moves · " + new Date(o.ts).toLocaleString() + " · " + txLinks(o.trx) + '</span></span><a class="tu-btn" href="' + esc(lk) + '">Replay</a></li>';
			}).join("") + "</ul>" : "");
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("ch-hrecent");
			if (!r || r.error || (!(r.games || []).length && !(r.recs || []).length)) { box.innerHTML = '<p class="ch-sub">' + (r && r.error ? esc(r.error) : "Nothing yet.") + "</p>"; return; }
			box.innerHTML = '<ul class="ch-lob">' + (r.games || []).map(function (o) {
				return '<li><span class="ch-lobn">@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · started " + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>';
			}).join("") + (r.recs || []).map(function (o) {
				return '<li><span class="ch-lobn">@' + esc(o.acct) + " saved a result" + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · " + esc(o.res) + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>";
			}).join("") + "</ul>";
		});
	}
	$("ch-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		var p = b.getAttribute("data-hjoin").split("/");
		var watching = mode === "hive" && hv.host === p[0] && hv.gid === p[1];
		if (watching && !(hMe() && hv.R && hv.R.status === "wait" && hv.host !== hMe())) return showTab("play");
		if (mode === "online") return toast("Leave the guest game first.");
		if (hMe()) hiveJoin(p[0], p[1]); else hiveEnter(p[0], p[1], []);
	});
	$("ch-hcreate").addEventListener("click", hiveCreate);
	$("ch-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* in-browser stand-in for /api/chess (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-chess:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-chess:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, names: g.names, moves: g.moves, status: g.status, win: g.win, offer: g.offer === undefined ? null : g.offer, round: g.round, pub: g.pub, first: g.first, idle: now - g.at }; };
		if (method === "GET" && /hlobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return !g.joiners.length && !g.cancelled && !g.to && now - g.ts < 3600000; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, f: g.f, t: g.t, age: now - g.ts }; }) };
		if (method === "GET" && /hrecent/.test(query)) return { games: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.joiners.length; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, guest: g.joiners[0], age: now - g.ts }; }), recs: (db._recs || []).map(function (o) { return { acct: o.acct, v: o.v, res: o.res, trx: o.trx, age: now - o.ts }; }) };
		if (method === "GET" && /hg=/.test(query)) { var hk = "h:" + decodeURIComponent((/hg=([^&]+)/.exec(query) || [])[1] || ""); return { joiners: db[hk] ? db[hk].joiners : [] }; }
		if (method === "POST" && b.act === "hrec") {
			return HA.ops(b.acct).then(function (ops) {
				var rec = H.records(ops).filter(function (o) { return o.g === b.g; })[0];
				if (!rec) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-chess:mock") || "{}"); } catch (e) { db2 = {}; }
				db2._recs = [{ acct: b.acct, v: rec.v, res: rec.w < 0 ? "draw" : C.COLORS[rec.w] + " won", trx: rec.trx, ts: rec.ts }].concat(db2._recs || []).slice(0, 20);
				localStorage.setItem("mes-chess:mock", JSON.stringify(db2));
				return { ok: true };
			});
		}
		if (method === "POST" && /^h(open|join|cancel)$/.test(b.act)) {
			var who = b.act === "hjoin" ? b.acct : b.host, want = b.act.slice(1);
			return HA.ops(who).then(function (ops) {
				var op = ops.filter(function (o) { return o.a === want && o.g === b.g && (want === "open" || o.h === b.host); })[0];
				if (!op) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-chess:mock") || "{}"); } catch (e) { db2 = {}; }
				var k2 = "h:" + b.host + "/" + b.g;
				if (want === "open") db2[k2] = db2[k2] || { host: b.host, g: b.g, v: op.v, f: op.f, t: op.t, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
				else if (db2[k2]) { if (want === "join" && db2[k2].joiners.indexOf(who) < 0) db2[k2].joiners.push(who); if (want === "cancel") db2[k2].cancelled = true; }
				localStorage.setItem("mes-chess:mock", JSON.stringify(db2));
				return { ok: true, joiners: db2[k2] ? db2[k2].joiners : [] };
			});
		}
		if (method === "GET") {
			if (/lobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return !/^h:|^_/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub && now - g.created < 1800000; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created }; }) };
			var id = (/id=([a-z0-9]+)/.exec(query) || [])[1], g0 = db[id];
			return g0 ? { g: pub(g0) } : { error: "Game not found (it may have expired)." };
		}
		var g = db[b.id], seat = g ? g.tok.indexOf(b.key) : -1;
		if (b.act === "new") {
			var c = C.onlineCode(b.v); if (!c) return { error: "Unknown game." };
			var nid = Math.random().toString(36).slice(2, 10), key = Math.random().toString(36).slice(2), hs = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0;
			var names = [null, null], tok = [null, null]; names[hs] = b.name; tok[hs] = key;
			db[nid] = { id: nid, v: b.v, names: names, tok: tok, moves: [], status: "wait", win: null, offer: null, round: 0, pub: !!b.pub, first: b.first, created: now, at: now };
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
		if (b.act === "move") {
			if (g.status !== "play") return { error: "The game isn't running." };
			if (b.n !== g.moves.length) return { error: "Out of step: the board was refreshed." };
			var s = C.replay(C.parseCode(g.v), g.moves);
			if (s.turn !== seat) return { error: "It's not your turn." };
			if (!C.apply(s, b.m)) return { error: "That move isn't allowed." };
			g.moves.push(b.m); g.at = now; g.offer = null;
			if (s.win) { g.status = "over"; g.win = { p: s.win.p, why: s.win.why }; }
			put(); return { g: pub(g) };
		}
		if (b.act === "offer") { if (g.status === "play") g.offer = seat; put(); return { g: pub(g) }; }
		if (b.act === "accept") { if (g.status === "play" && g.offer === 1 - seat) { g.status = "over"; g.win = { p: -1, why: "agreed" }; g.offer = null; } put(); return { g: pub(g) }; }
		if (b.act === "resign" || b.act === "leave") { if (g.status === "play") { g.status = "over"; g.win = { p: 1 - seat, why: b.act === "leave" ? "left" : "resign" }; } g.at = now; put(); return { g: pub(g) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		if (b.act === "claim") { g.status = "over"; g.win = { p: seat, why: "timeout" }; put(); return { g: pub(g) }; }
		if (b.act === "rematch") {
			if (g.status !== "over") return { error: "Finish this game first." };
			g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]]; g.moves = []; g.status = "play"; g.win = null; g.offer = null; g.round++; g.at = now; put();
			return { g: pub(g) };
		}
		return { error: "Unknown action." };
	}
	if (MOCK) $("ch-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	syncSetup();
	applyPcol();
	renderRules();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qh = q.get("hive"), qv = q.get("v");
	if (joinId || qh || qv) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	function blank() { cfg = { v: "S" }; code = "S"; st = C.create(cfg); mode = S.opp; render(); }
	if (qh && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qh)) {
		blank();
		var qp = qh.split("/");
		setTimeout(function () { if (hMe()) hiveJoin(qp[0], qp[1]); else hiveEnter(qp[0], qp[1], []); }, 300);
	} else if (joinId && /^[a-z0-9]{6,12}$/.test(joinId)) {
		blank();
		if (S.online && S.online.id === joinId) api("GET", null, "?id=" + joinId).then(function (r) { if (r.g) startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); });
		else { S.online = null; join(joinId); }
	} else if (qv && C.parseCode(qv)) {
		var c0 = C.parseCode(qv), mv = (q.get("m") || "").split(".").filter(Boolean);
		var pp = C.presetByCode(qv); if (pp) S.game = pp.id;
		S.online = null; S.hive = null;
		save(); syncSetup();
		var s0 = C.replay(c0, mv);
		mode = S.opp;
		setGame(c0, s0 ? mv : [], { human: s0 ? s0.turn : 0 });
		toast(s0 && mv.length ? "Game loaded from the link: step through it with ◀ ▶, or play on from here." : "Game loaded from the link.");
	} else if (S.hive && S.hive.host) {
		blank();
		var sh = S.hive;
		setTimeout(function () { hiveEnter(sh.host, sh.gid, []); }, 0);
	} else if (S.online && S.online.id) {
		blank();
		mode = "online"; on.id = S.online.id; on.key = S.online.key; on.seat = S.online.seat;
		api("GET", null, "?id=" + on.id).then(function (r) {
			if (r.g) startOnline({ g: r.g, key: on.key, seat: on.seat });
			else { on.id = null; S.online = null; save(); mode = S.opp; resumeOrNew(); }
		});
	} else resumeOrNew();
	renderHiveCard();
	function resumeOrNew() {
		var cc = S.cur && C.parseCode(S.cur.code);
		if (cc && !S.cur.done && S.cur.moves && S.cur.moves.length && C.replay(cc, S.cur.moves)) {
			mode = S.cur.mode === "local" ? "local" : "cpu";
			S.opp = mode;
			syncSetup();
			assisted = !!S.cur.as;
			setGame(cc, S.cur.moves, { human: S.cur.human || 0, keepMode: true, keepAssist: true });
			if (S.cur.clk && clk) { clk.t = S.cur.clk.t.slice(); clk.on = st.turn; clk.last = Date.now(); }
		} else newGame();
	}
	// for testing in a hidden pane: window.MESChessDebug.state()
	window.MESChessDebug = { state: function () { return { code: code, moves: st.hist.slice(), sans: st.sans.slice(), fen: C.fen(st), win: st.win, mode: mode, turn: st.turn, busy: busy, human: human, dim: S.dim, v3: !!v3, hive: hv.R ? { status: hv.R.status, players: hv.R.players } : null }; },
		move: function (str) { return humanMove(C.mparse(str)); }, click: chooseSquare, v3: function () { return v3; } };
})();
