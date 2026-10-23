/* MES Backgammon: the page (board, turns, cube, statistics, rules and odds tabs).
   The same served file is also started as a Web Worker that runs the computer's thinking (see the top). */
(function () {
	"use strict";
	var BG = (typeof self !== "undefined" ? self : window).MESBG;

	function compute(q) {
		if (q.type === "play") { var p = BG.choosePlay(q.b, q.s, q.dice, q.level); return { s: p.s }; }
		if (q.type === "double") return BG.shouldDouble(q.b, q.s, q.ctx);
		if (q.type === "take") return BG.shouldTake(q.b, q.s, q.ctx);
		if (q.type === "prob") return BG.winProbOnRoll(q.b, q.s, q.level);
		return null;
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
	var root = document.getElementById("bgm");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-backgammon:v1";

	/* ---------- worker ---------- */
	var worker = null, wid = 0, waiting = {};
	try {
		if (SCRIPT && typeof Worker !== "undefined" && !/noworker/.test(location.search)) {   // ?noworker=1: think on the page (testing)
			worker = new Worker(SCRIPT);
			worker.onmessage = function (e) { var f = waiting[e.data.id]; if (f) { delete waiting[e.data.id]; f(e.data.r); } };
			worker.onerror = function () { worker = null; Object.keys(waiting).forEach(function (k) { var f = waiting[k]; delete waiting[k]; f(undefined); }); };
		}
	} catch (e) { worker = null; }
	function ask(q) {
		return new Promise(function (res) {
			var local = function () { setTimeout(function () { res(compute(q)); }, 0); };
			if (!worker) return local();
			var id = ++wid;
			waiting[id] = function (r) { if (r === undefined) local(); else res(r); };
			try { worker.postMessage(Object.assign({ id: id }, q)); } catch (e) { delete waiting[id]; local(); }
		});
	}

	/* ---------- saved state ---------- */
	var DEF = { level: "medium", type: "0", cube: true, jacoby: false, autoRoll: false, autoConfirm: false, oneClick: false, speed: "normal", flip: false, nums: true, odds: true };
	function blankLv() { return { g: 0, w: 0, l: 0, gw: 0, gl: 0, bw: 0, bl: 0, pw: 0, pl: 0 }; }
	function blankStats() {
		return { lv: { easy: blankLv(), medium: blankLv(), hard: blankLv() },
			cube: { youD: 0, cpuTook: 0, cpuDrop: 0, cpuD: 0, youTook: 0, youDrop: 0 },
			streak: 0, best: 0, worst: 0, luck: [{ r: 0, d: 0, p: 0 }, { r: 0, d: 0, p: 0 }],
			matches: { p: 0, w: 0 }, endL: { n: 0, s: 0 }, endW: { n: 0, s: 0 } };
	}
	var S = { set: Object.assign({}, DEF), stats: blankStats(), g: null, tab: "play" };
	try {
		var raw = JSON.parse(localStorage.getItem(KEY) || "null");
		if (raw && typeof raw === "object") {
			S.set = Object.assign({}, DEF, raw.set || {});
			if (raw.stats && raw.stats.lv) S.stats = Object.assign(blankStats(), raw.stats);
			if (raw.g && raw.g.b && BG.valid(raw.g.b)) S.g = raw.g;
			if (raw.tab) S.tab = raw.tab;
		}
	} catch (e) {}
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify({ set: S.set, stats: S.stats, g: S.g, tab: S.tab })); } catch (e) {}
	}
	var G = S.g;

	/* ---------- helpers ---------- */
	function rollDie() {
		try { var a = new Uint32Array(1); for (;;) { crypto.getRandomValues(a); if (a[0] < 4294967292) return 1 + (a[0] % 6); } }
		catch (e) { return 1 + Math.floor(Math.random() * 6); }
	}
	function delay() { return { slow: 900, normal: 480, fast: 170, instant: 0 }[S.set.speed] || 480; }
	function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "–"; }
	function frac(n) { return n + "/36 (" + (100 * n / 36).toFixed(1) + "%)"; }
	var LVN = { easy: "Easy", medium: "Medium", hard: "Hard" };
	var toast = (function () { var t; return function (msg) {
		var el = $("bgm-toast"); el.textContent = msg; el.classList.add("tu-toast--show");
		clearTimeout(t); t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 2200); }; })();

	/* ---------- game flow ---------- */
	function newMatch() {
		var to = parseInt(S.set.type, 10) || 0;
		G = S.g = { b: BG.newBoard(), turn: 0, phase: "opening", dice: null, steps: [], snaps: [], cube: { v: 1, owner: -1 },
			match: { to: to, score: [0, 0], crawford: false, postCrawford: false, crawfordUsed: false },
			level: S.set.level, cubeOn: !!S.set.cube, jacoby: !!S.set.jacoby, last: null, msg: "", hint: null, opening: null, game: 1 };
		startGame();
	}
	function startGame() {
		G.b = BG.newBoard(); G.turn = 0; G.phase = "opening"; G.dice = null; G.steps = []; G.snaps = []; G.cube = { v: 1, owner: -1 };
		G.last = null; G.hint = null; G.opening = null; G.level = S.set.level; G.result = null;
		G.msg = G.match.crawford ? "Crawford game: no doubling this game. Roll to see who starts." : "Roll to see who starts.";
		save(); render();
	}
	function ctx() {
		var m = G.match;
		return { level: G.level, cube: G.cube, jacoby: G.jacoby, noCube: !G.cubeOn,
			match: { to: m.to, score: m.score, crawford: m.crawford, postCrawford: m.postCrawford } };
	}
	function luck(s, d1, d2) {
		var L = S.stats.luck[s];
		L.r++; if (d1 === d2) { L.d++; L.p += 4 * d1; } else L.p += d1 + d2;
	}

	function openingRoll() {
		var h, c;
		do { h = rollDie(); c = rollDie(); } while (h === c);
		G.opening = [h, c];
		G.turn = h > c ? 0 : 1;
		G.dice = [h, c].sort(function (a, b) { return b - a; });
		G.msg = "You rolled " + h + ", the computer " + c + ": " + (G.turn === 0 ? "you start with " + h + "-" + c + "." : "the computer starts with " + c + "-" + h + ".");
		if (G.turn === 0) beginHumanMove(); else { G.phase = "cpuRolled"; save(); render(); setTimeout(cpuPlay, Math.max(600, delay() * 2)); }
	}

	function humanTurnStart() {
		G.turn = 0; G.dice = null; G.steps = []; G.snaps = []; G.hint = null;
		var canD = BG.canDouble(0, ctx());
		G.phase = "roll";
		G.msg = canD ? "Your turn: roll, or offer the computer a double." : "Your turn: roll the dice.";
		save(); render();
		if (S.set.autoRoll) setTimeout(function () { if (G.phase === "roll" && G.turn === 0) humanRoll(); }, Math.max(250, delay()));
	}
	function humanRoll() {
		if (G.phase !== "roll") return;
		var d1 = rollDie(), d2 = rollDie();
		G.dice = [Math.max(d1, d2), Math.min(d1, d2)];
		luck(0, d1, d2);
		G.last = null;
		beginHumanMove();
	}
	function diceList() { return BG.diceList(G.dice[0], G.dice[1]); }
	var seqCache = null;
	function seqs() {
		var k = JSON.stringify([G.turnStart, G.dice]);
		if (!seqCache || seqCache.k !== k) seqCache = { k: k, v: BG.sequences(G.turnStart, 0, diceList()) };
		return seqCache.v;
	}
	function beginHumanMove() {
		G.phase = "move"; G.steps = []; G.snaps = []; G.turnStart = BG.clone(G.b); G.hint = null; sel = null;
		var max = seqs()[0] ? seqs()[0].length : 0;
		if (!max) {
			G.msg = "You rolled " + G.dice[0] + "-" + G.dice[1] + ": no legal move, so your turn passes.";
			G.phase = "pass"; save(); render();
			setTimeout(function () { if (G.phase === "pass") endHumanTurn(); }, 1800);
			return;
		}
		G.msg = "You rolled " + G.dice[0] + "-" + G.dice[1] + ". Pick a checker, then a lit point" + (max < diceList().length ? " (only " + max + " of your dice can be played)." : ".");
		save(); render();
	}
	function allowedAfter(prefix) {
		var out = [], seen = {};
		seqs().forEach(function (q) {
			if (q.length <= prefix.length) return;
			for (var i = 0; i < prefix.length; i++) if (q[i][0] !== prefix[i][0] || q[i][2] !== prefix[i][2]) return;
			var st = q[prefix.length], k = st[0] + ":" + st[2];
			if (!seen[k]) { seen[k] = 1; out.push(st); }
		});
		return out;
	}
	function nextSteps() { return G.phase === "move" ? allowedAfter(G.steps) : []; }
	function usedDice() { return G.steps.map(function (s) { return s[2]; }); }
	function remainingDice() {
		var r = diceList().slice();
		usedDice().forEach(function (d) { var i = r.indexOf(d); if (i >= 0) r.splice(i, 1); });
		return r;
	}
	/* destinations from point f: one step, or several steps of the same checker */
	function destsFrom(f) {
		var res = {}, queue = [{ pt: f, path: [] }];
		while (queue.length) {
			var n = queue.shift();
			allowedAfter(G.steps.concat(n.path)).forEach(function (st) {
				if (st[0] !== n.pt) return;
				var path = n.path.concat([st]);
				if (!res[st[1]] || res[st[1]].length > path.length) res[st[1]] = path;
				if (st[1] > 0) queue.push({ pt: st[1], path: path });
			});
		}
		return res;
	}
	function doSteps(path) {
		path.forEach(function (st) {
			G.snaps.push(BG.clone(G.b));
			var r = BG.applyStep(G.b, 0, st);
			G.b = r.b;
			G.steps.push([st[0], st[1], st[2], r.hit ? 1 : 0]);
		});
		sel = null; G.hint = null;
		afterStep();
	}
	function afterStep() {
		if (BG.winnerOf(G.b) === 0) { G.msg = "All your checkers are off!"; save(); render(); setTimeout(endHumanTurn, 500); return; }
		if (!nextSteps().length) {
			G.msg = "Move done: " + BG.notation(G.steps) + ". Press Confirm (Enter), or Undo to change it.";
			save(); render();
			if (S.set.autoConfirm) setTimeout(function () { if (G.phase === "move" && !nextSteps().length) endHumanTurn(); }, Math.max(300, delay()));
			return;
		}
		G.msg = "Dice left: " + remainingDice().join(", ") + ".";
		save(); render();
	}
	function undo(all) {
		if (G.phase !== "move" || !G.steps.length) return;
		do { G.b = G.snaps.pop(); G.steps.pop(); } while (all && G.steps.length);
		sel = null;
		G.msg = "Dice left: " + remainingDice().join(", ") + ".";
		save(); render();
	}
	function autoMove(pt) {
		var opts = nextSteps().filter(function (s) { return s[0] === pt; });
		if (!opts.length) return false;
		opts.sort(function (a, b) { return b[2] - a[2]; });
		doSteps([opts[0]]);
		return true;
	}
	function endHumanTurn() {
		if (G.phase !== "move" && G.phase !== "pass") return;
		if (G.phase === "move" && nextSteps().length && BG.winnerOf(G.b) < 0) return;
		G.last = { s: 0, seq: G.steps.slice() };
		if (BG.winnerOf(G.b) === 0) return gameOver(0, BG.resultKind(G.b, 0));
		cpuTurn();
	}

	/* the computer's steps written in the board's (your) point numbers */
	function mirror(seq) { return seq.map(function (st) { return [st[0] === 25 ? 25 : 25 - st[0], st[1] === 0 ? 0 : 25 - st[1], st[2], st[3]]; }); }

	/* the computer's turn */
	function cpuTurn() {
		G.turn = 1; G.phase = "cpuPre"; G.dice = null; G.steps = []; G.hint = null; sel = null;
		G.msg = "The computer is thinking…";
		save(); render();
		var t0 = Date.now();
		ask({ type: "double", b: G.b, s: 1, ctx: ctx() }).then(function (dbl) {
			if (G.phase !== "cpuPre") return;
			return wait(Math.max(0, Math.min(400, delay()) - (Date.now() - t0))).then(function () {
				if (dbl) {
					S.stats.cube.cpuD++;
					G.phase = "offer";
					G.msg = "The computer doubles: take (play on for " + G.cube.v * 2 + " points) or drop (lose " + G.cube.v + ")?";
					save(); render();
				} else cpuRoll();
			});
		});
	}
	function cpuRoll() {
		var d1 = rollDie(), d2 = rollDie();
		G.dice = [Math.max(d1, d2), Math.min(d1, d2)];
		luck(1, d1, d2);
		G.phase = "cpuRolled";
		G.msg = "The computer rolled " + G.dice[0] + "-" + G.dice[1] + ".";
		save(); render();
		setTimeout(cpuPlay, Math.max(200, delay()));
	}
	function cpuPlay() {
		if (G.phase !== "cpuRolled") return;
		var start = BG.clone(G.b), t0 = Date.now();
		G.phase = "cpuThink"; save(); render();
		ask({ type: "play", b: start, s: 1, dice: diceList(), level: G.level }).then(function (r) {
			var seq = (r && r.s) || [];
			// double check it is legal (it always should be)
			var ok = BG.plays(start, 1, diceList()).some(function (p) { return JSON.stringify(p.b) === JSON.stringify(BG.applySeq(start, 1, seq)); });
			if (!ok) seq = BG.choosePlay(start, 1, diceList(), "medium").s;
			G.b = BG.applySeq(start, 1, seq);
			G.phase = "cpuAnim"; G.cpuSeq = seq; G.cpuStart = start;
			save();
			var i = 0, view = BG.clone(start);
			var stepFn = function () {
				if (G.phase !== "cpuAnim") return;
				if (i >= seq.length || !delay()) { finishCpu(); return; }
				view = BG.applyStep(view, 1, seq[i]).b; i++;
				G.view = view; G.last = { s: 1, seq: seq.slice(0, i) };
				render();
				setTimeout(stepFn, delay());
			};
			setTimeout(stepFn, Math.max(0, Math.min(delay(), 600) - (Date.now() - t0)));
		});
	}
	function finishCpu() {
		G.view = null;
		G.last = { s: 1, seq: G.cpuSeq || [] };
		var dice = G.dice;
		G.msg = (G.cpuSeq && G.cpuSeq.length ? "The computer played " + dice[0] + "-" + dice[1] + ": " + BG.notation(mirror(G.cpuSeq)) + " (your point numbers)." : "The computer rolled " + dice[0] + "-" + dice[1] + " and cannot move.");
		if (BG.winnerOf(G.b) === 1) return gameOver(1, BG.resultKind(G.b, 1));
		var m = G.msg;
		humanTurnStart();
		G.msg = m + " " + G.msg;
		save(); render();
	}

	/* the cube */
	function humanDouble() {
		if (G.phase !== "roll" || !BG.canDouble(0, ctx())) return;
		S.stats.cube.youD++;
		G.phase = "asking"; G.msg = "You offer a double… the computer is deciding.";
		save(); render();
		ask({ type: "take", b: G.b, s: 1, ctx: ctx() }).then(function (take) {
			setTimeout(function () {
				if (G.phase !== "asking") return;
				if (take) {
					S.stats.cube.cpuTook++;
					G.cube.v *= 2; G.cube.owner = 1;
					G.phase = "roll"; G.msg = "The computer takes. The cube is now " + G.cube.v + ". Roll the dice.";
					save(); render();
				} else {
					S.stats.cube.cpuDrop++;
					gameOver(0, "drop");
				}
			}, Math.min(600, delay() + 150));
		});
	}
	function humanAnswer(take) {
		if (G.phase !== "offer") return;
		if (take) {
			S.stats.cube.youTook++;
			G.cube.v *= 2; G.cube.owner = 0;
			G.msg = "You take. The cube is now " + G.cube.v + " and it is yours.";
			cpuRoll();
		} else { S.stats.cube.youDrop++; gameOver(1, "drop"); }
	}

	function gameOver(w, kind) {
		var mult = kind === "drop" ? 1 : kind;
		if (kind !== "drop" && G.match.to === 0 && G.jacoby && G.cube.v === 1) mult = 1;
		var pts = G.cube.v * mult;
		var st = S.stats, L = st.lv[G.level] || (st.lv[G.level] = blankLv());
		L.g++;
		if (w === 0) {
			L.w++; L.pw += pts; if (kind === 2) L.gw++; if (kind === 3) L.bw++;
			st.streak = st.streak > 0 ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak);
			if (kind !== "drop") { st.endW.n++; st.endW.s += BG.pips(G.b[1]); }
		} else {
			L.l++; L.pl += pts; if (kind === 2) L.gl++; if (kind === 3) L.bl++;
			st.streak = st.streak < 0 ? st.streak - 1 : -1; st.worst = Math.min(st.worst || 0, st.streak);
			if (kind !== "drop") { st.endL.n++; st.endL.s += BG.pips(G.b[0]); }
		}
		var name = kind === "drop" ? (w === 0 ? "The computer drops" : "You drop") : ["", "a single game", "a gammon", "a backgammon"][kind];
		var who = w === 0 ? "You win" : "The computer wins";
		G.result = { w: w, kind: kind, pts: pts };
		var m = G.match;
		m.score[w] += pts;
		var msg = kind === "drop" ? name + ": " + (w === 0 ? "you win " : "the computer wins ") + pts + " point" + (pts > 1 ? "s" : "") + "."
			: who + " " + name + (pts > 1 ? " worth " + pts + " points" : " (1 point)") + (G.cube.v > 1 ? " (cube " + G.cube.v + ")" : "") + ".";
		if (m.to > 0) {
			if (m.score[w] >= m.to) {
				st.matches.p++; if (w === 0) st.matches.w++;
				G.phase = "matchOver";
				msg += " " + (w === 0 ? "You win the match " : "The computer wins the match ") + m.score[0] + "-" + m.score[1] + "!";
			} else {
				G.phase = "over";
				if (m.crawford) { m.crawford = false; m.postCrawford = true; }
				else if (!m.crawfordUsed && (m.score[0] === m.to - 1 || m.score[1] === m.to - 1)) { m.crawford = true; m.crawfordUsed = true; }
				msg += " Score " + m.score[0] + "-" + m.score[1] + " (match to " + m.to + ")" + (m.crawford ? ". Next is the Crawford game." : ".");
			}
		} else { G.phase = "over"; msg += " Total: you " + m.score[0] + ", computer " + m.score[1] + "."; }
		G.msg = msg;
		save(); render(); renderStats();
	}
	function nextGame() { if (G.phase === "over") { G.game++; startGame(); } else if (G.phase === "matchOver") newMatch(); }

	/* hint */
	function hint() {
		if (G.phase === "move") {
			G.msg = "Asking the Hard engine…"; render();
			ask({ type: "play", b: G.turnStart, s: 0, dice: diceList(), level: "hard" }).then(function (r) {
				if (G.phase !== "move") return;
				G.hint = r && r.s || [];
				G.msg = "Hint (Hard engine): " + BG.notation(G.hint) + ". The arrows show it; press Play hint to make it.";
				render();
			});
		} else if (G.phase === "roll") {
			ask({ type: "prob", b: G.b, s: 0, level: "hard" }).then(function (p) {
				var c = ctx(), can = BG.canDouble(0, c), dbl = can && BG.shouldDouble(G.b, 0, Object.assign(c, { level: "hard" }));
				G.msg = "The engine gives you about " + Math.round(p * 100) + "% to win from here. " + (can ? (dbl ? "It would double now." : "It would not double yet: just roll.") : "Roll the dice.");
				render();
			});
		} else if (G.phase === "offer") {
			var tk = BG.shouldTake(G.b, 0, Object.assign(ctx(), { level: "hard" }));
			var p = 1 - BG.winProbOnRoll(G.b, 1, "hard");
			G.msg = "You have about " + Math.round(p * 100) + "% to win. The engine would " + (tk ? "take" : "drop") + " (a take is right from about 25%).";
			render();
		}
	}
	function playHint() {
		if (G.phase !== "move" || !G.hint) return;
		var h = G.hint;
		while (G.steps.length) { G.b = G.snaps.pop(); G.steps.pop(); }
		G.hint = null;
		if (h.length) doSteps(h); else render();
	}

	/* ---------- board drawing ---------- */
	var W = 760, H = 520, R = 22;
	function mx(x) { return S.set.flip ? W - x : x; }
	function ptX(k) {
		if (k <= 6) return 660 - 25 - (k - 1) * 50;
		if (k <= 12) return 320 - 25 - (k - 7) * 50;
		if (k <= 18) return 20 + 25 + (k - 13) * 50;
		return 360 + 25 + (k - 19) * 50;
	}
	function anchor(k, side, top) {      // a spot for arrows; k in human numbering, 25 = bar, 0 = off
		if (k === 25) return [mx(340), side === 0 ? 170 : 350];
		if (k === 0) return [mx(715), side === 0 ? 420 : 100];
		return [mx(ptX(k)), k >= 13 ? 110 : 410];
	}
	function ptAt(x, y) {
		if (S.set.flip) x = W - x;
		if (x >= 672) return 0;
		if (x >= 320 && x < 360) return 25;
		var top = y < 260, col;
		if (x >= 20 && x < 320) { col = Math.floor((x - 20) / 50); return top ? 13 + col : 12 - col; }
		if (x >= 360 && x < 660) { col = Math.floor((x - 360) / 50); return top ? 19 + col : 6 - col; }
		return -1;
	}
	function dieSvg(x, y, s, v, used, side) {
		var P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
		var o = '<g class="bgm-die bgm-die' + side + (used ? " is-used" : "") + '"><rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="' + s * 0.18 + '"/>';
		P[v].forEach(function (p) { o += '<circle cx="' + (x + s * (0.25 + p[0] * 0.25)) + '" cy="' + (y + s * (0.25 + p[1] * 0.25)) + '" r="' + s * 0.09 + '"/>'; });
		return o + "</g>";
	}
	function checker(cx, cy, side, extra) {
		return '<circle class="bgm-ck bgm-ck' + side + (extra || "") + '" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>' +
			'<circle class="bgm-ckin bgm-ckin' + side + '" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.62) + '"/>';
	}
	/* opts: {dice, used, diceSide, arrows:[{seq, side, cls}], sel, dests, sources, cube, nums, small} */
	function boardSvg(b, o) {
		o = o || {};
		var s = '<svg class="bgm-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(o.label || "Backgammon board") + '">';
		s += '<rect class="bgm-frame" x="0" y="0" width="' + W + '" height="' + H + '" rx="14"/>';
		s += '<rect class="bgm-felt" x="' + Math.min(mx(20), mx(660)) + '" y="20" width="640" height="480"/>';
		s += '<rect class="bgm-bar" x="' + Math.min(mx(320), mx(360)) + '" y="10" width="40" height="500"/>';
		s += '<rect class="bgm-tray" x="' + Math.min(mx(675), mx(752)) + '" y="20" width="77" height="480" rx="6"/>';
		s += '<line class="bgm-traymid" x1="' + Math.min(mx(675), mx(752)) + '" x2="' + Math.max(mx(675), mx(752)) + '" y1="260" y2="260"/>';
		for (var k = 1; k <= 24; k++) {
			var x = mx(ptX(k)), top = k >= 13, base = top ? 20 : 500, tip = top ? 222 : 298;
			var cls = "bgm-pt " + ((k % 2) ? "bgm-pta" : "bgm-ptb");
			if (o.dests && o.dests[k]) cls += " is-dest";
			s += '<polygon class="' + cls + '" points="' + (x - 24) + "," + base + " " + (x + 24) + "," + base + " " + x + "," + tip + '"/>';
			if (o.nums !== false) s += '<text class="bgm-num" x="' + x + '" y="' + (top ? 14 : 514) + '">' + k + "</text>";
		}
		// checkers
		var drawPt = function (k, n, side) {
			var x = mx(ptX(k)), top = k >= 13, shown = Math.min(n, 5);
			for (var i = 0; i < shown; i++) {
				var cy = top ? 20 + R + 1 + i * (2 * R + 1) : 500 - R - 1 - i * (2 * R + 1);
				var extra = (o.sel === k && side === 0 && i === shown - 1) ? " is-sel" : "";
				if (o.sources && o.sources[k] && side === 0 && i === shown - 1 && o.sel !== k) extra += " is-src";
				s += checker(x, cy, side, extra);
			}
			if (n > 5) { var ly = top ? 20 + R + 1 + 4 * (2 * R + 1) : 500 - R - 1 - 4 * (2 * R + 1); s += '<text class="bgm-cnt bgm-cnt' + side + '" x="' + x + '" y="' + (ly + 6) + '">' + n + "</text>"; }
		};
		for (k = 1; k <= 24; k++) {
			if (b[0][k]) drawPt(k, b[0][k], 0);
			if (b[1][25 - k]) drawPt(k, b[1][25 - k], 1);
		}
		// bar
		[0, 1].forEach(function (side) {
			var n = b[side][25];
			for (var i = 0; i < Math.min(n, 4); i++) {
				var cy = side === 0 ? 210 - i * 44 : 310 + i * 44;
				s += checker(mx(340), cy, side, (side === 0 && o.sel === 25 && i === Math.min(n, 4) - 1) ? " is-sel" : (side === 0 && o.sources && o.sources[25] && i === Math.min(n, 4) - 1 ? " is-src" : ""));
			}
			if (n > 4) s += '<text class="bgm-cnt bgm-cnt' + side + '" x="' + mx(340) + '" y="' + ((side === 0 ? 210 - 3 * 44 : 310 + 3 * 44) + 6) + '">' + n + "</text>";
		});
		// borne off
		var tx = Math.min(mx(675), mx(752)) + 8;
		for (var i = 0; i < b[0][0]; i++) s += '<rect class="bgm-off bgm-off0" x="' + tx + '" y="' + (494 - (i + 1) * 10.6) + '" width="61" height="9" rx="2"/>';
		for (i = 0; i < b[1][0]; i++) s += '<rect class="bgm-off bgm-off1" x="' + tx + '" y="' + (26 + i * 10.6) + '" width="61" height="9" rx="2"/>';
		if (o.dests && o.dests[0] !== undefined) s += '<rect class="bgm-offdest" x="' + (tx - 4) + '" y="262" width="69" height="234" rx="6"/>';
		// cube
		if (o.cube) {
			var cyv = o.cube.owner === 0 ? 275 : o.cube.owner === 1 ? 205 : 240;
			s += '<g class="bgm-cube"><rect x="' + (tx + 11) + '" y="' + cyv + '" width="40" height="40" rx="6"/><text x="' + (tx + 31) + '" y="' + (cyv + 27) + '">' + (o.cube.v === 1 ? 64 : o.cube.v) + "</text></g>";
		}
		// dice
		if (o.dice) {
			var ds = o.dice.length === 4 ? 36 : 44, gap = 8, tot = o.dice.length * ds + (o.dice.length - 1) * gap;
			var cx0 = o.diceSide === 0 ? 510 : 170, x0 = mx(cx0) - tot / 2;
			o.dice.forEach(function (v, i) { s += dieSvg(x0 + i * (ds + gap), 260 - ds / 2, ds, v, o.used && o.used[i], o.diceSide); });
		}
		if (o.opening) {
			s += dieSvg(mx(510) - 22, 238, 44, o.opening[0], false, 0);
			s += dieSvg(mx(170) - 22, 238, 44, o.opening[1], false, 1);
		}
		// arrows
		(o.arrows || []).forEach(function (a) {
			a.seq.forEach(function (st) {
				var f = a.side === 0 ? st[0] : (st[0] === 25 ? 25 : 25 - st[0]);
				var t = a.side === 0 ? st[1] : (st[1] === 0 ? 0 : 25 - st[1]);
				var p = anchor(f, a.side), q = anchor(t, a.side);
				var cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2;
				if (Math.abs(p[1] - q[1]) < 5) cy += (cy < 260 ? 1 : -1) * Math.min(90, 12 + Math.abs(p[0] - q[0]) * 0.3);   // same row: bow towards the middle
				s += '<path class="bgm-arrow ' + a.cls + '" d="M' + p[0] + "," + p[1] + " Q" + cx + "," + cy + " " + q[0] + "," + q[1] + '" marker-end="url(#bgm-ah-' + a.cls + ')"/>';
			});
		});
		if (o.dests) Object.keys(o.dests).forEach(function (kk) {
			kk = +kk; if (!kk) return;
			var top = kk >= 13, n = b[0][kk] + b[1][25 - kk], i2 = Math.min(b[0][kk], 4);
			if (b[1][25 - kk]) i2 = 0;
			var cy = top ? 20 + R + 1 + i2 * (2 * R + 1) : 500 - R - 1 - i2 * (2 * R + 1);
			s += '<circle class="bgm-ghost" cx="' + mx(ptX(kk)) + '" cy="' + cy + '" r="' + (R - 2) + '"/>';
			void n;
		});
		s += '<defs><marker id="bgm-ah-last" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="bgm-ahp-last" d="M0,0 L10,5 L0,10 z"/></marker>' +
			'<marker id="bgm-ah-hint" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="bgm-ahp-hint" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
		// hit areas (interactive board only)
		if (o.hits) {
			for (k = 1; k <= 24; k++) {
				var hx = mx(ptX(k)) - 25, hy = k >= 13 ? 20 : 260, act = o.hits[k];
				s += '<rect class="bgm-hit" data-pt="' + k + '" x="' + hx + '" y="' + hy + '" width="50" height="240"' + (act ? ' tabindex="0" role="button" aria-label="' + esc(act) + '"' : "") + "/>";
			}
			s += '<rect class="bgm-hit" data-pt="25" x="' + (mx(340) - 20) + '" y="10" width="40" height="500"' + (o.hits[25] ? ' tabindex="0" role="button" aria-label="' + esc(o.hits[25]) + '"' : "") + "/>";
			s += '<rect class="bgm-hit" data-pt="0" x="' + Math.min(mx(672), mx(760)) + '" y="0" width="88" height="520"' + (o.hits[0] ? ' tabindex="0" role="button" aria-label="' + esc(o.hits[0]) + '"' : "") + "/>";
			s += '<circle id="bgm-float" class="bgm-ck bgm-ck0 is-float" cx="-100" cy="-100" r="' + R + '"/>';
		}
		return s + "</svg>";
	}

	/* ---------- play tab rendering ---------- */
	var sel = null, dests = null;
	function render() {
		if (!G) return;
		var b = G.view || G.b, o = { cube: G.cubeOn ? G.cube : null, nums: S.set.nums, arrows: [], label: "Backgammon board. " + boardText(b) };
		if (G.phase === "opening" && G.opening) o.opening = G.opening;
		if (G.dice && G.phase !== "opening" && G.phase !== "roll" && G.phase !== "cpuPre" && G.phase !== "offer" && G.phase !== "asking") {
			o.dice = diceList(); o.diceSide = G.turn;
			if (G.turn === 0 && G.phase === "move") {
				var used = usedDice().slice(); o.used = o.dice.map(function (d) { var i = used.indexOf(d); if (i >= 0) { used.splice(i, 1); return true; } return false; });
			}
			if (G.turn === 1 && G.phase === "cpuAnim" && G.last) { var u = G.last.seq.map(function (x) { return x[2]; }); o.used = o.dice.map(function (d) { var i = u.indexOf(d); if (i >= 0) { u.splice(i, 1); return true; } return false; }); }
		} else if (G.phase === "roll" && G.last && G.last.s === 1 && G.dice) { o.dice = diceList(); o.diceSide = 1; o.used = o.dice.map(function () { return true; }); }
		if (G.last && G.last.seq.length && (G.phase !== "move" || !G.steps.length)) o.arrows.push({ seq: G.last.seq, side: G.last.s, cls: "last" });
		if (G.hint && G.hint.length) o.arrows.push({ seq: G.hint, side: 0, cls: "hint" });
		var hits = {};
		if (G.phase === "move") {
			var ns = nextSteps(), src = {};
			ns.forEach(function (st) { src[st[0]] = 1; });
			o.sources = src;
			if (sel !== null && !src[sel]) sel = null;
			dests = sel !== null ? destsFrom(sel) : null;
			o.sel = sel; o.dests = dests;
			Object.keys(src).forEach(function (k) { hits[k] = (k === "25" ? "Your checker on the bar" : "Point " + k + ", " + b[0][k] + " of your checkers") + ": select"; });
			if (dests) Object.keys(dests).forEach(function (k) { hits[k] = (k === "0" ? "Bear off" : "Move to point " + k); });
		} else { dests = null; sel = null; }
		o.hits = hits;
		$("bgm-board").innerHTML = boardSvg(b, o);
		$("bgm-msg").textContent = G.msg || "";
		renderTop(); renderActions(); renderInfo();
	}
	function boardText(b) {
		var parts = [];
		for (var k = 24; k >= 1; k--) { if (b[0][k]) parts.push("point " + k + ": " + b[0][k] + " yours"); if (b[1][25 - k]) parts.push("point " + k + ": " + b[1][25 - k] + " computer's"); }
		if (b[0][25]) parts.push(b[0][25] + " of yours on the bar"); if (b[1][25]) parts.push(b[1][25] + " of the computer's on the bar");
		parts.push("you have borne off " + b[0][0] + ", the computer " + b[1][0]);
		return parts.join("; ");
	}
	function renderTop() {
		var m = G.match, t = [];
		t.push("<b>" + LVN[G.level] + "</b>");
		t.push(m.to ? "Match to " + m.to + ": you <b>" + m.score[0] + "</b> – computer <b>" + m.score[1] + "</b>" + (m.crawford ? " · <b>Crawford game</b>" : "") : "Money game · you <b>" + m.score[0] + "</b> – computer <b>" + m.score[1] + "</b>");
		if (G.cubeOn) t.push("Cube <b>" + G.cube.v + "</b>" + (G.cube.owner === 0 ? " (yours)" : G.cube.owner === 1 ? " (computer's)" : " (centre)"));
		$("bgm-top").innerHTML = t.join(" · ");
	}
	function btn(id, label, cls, title) { return '<button type="button" class="tu-btn ' + (cls || "") + '" data-a="' + id + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + label + "</button>"; }
	function renderActions() {
		var h = "", p = G.phase;
		if (p === "opening") h += btn("open", "Roll to start", "tu-btn--primary", "R");
		if (p === "roll") {
			h += btn("roll", "Roll dice", "tu-btn--primary", "R");
			if (BG.canDouble(0, ctx())) h += btn("double", "Double to " + G.cube.v * 2, "", "D");
			h += btn("hint", "Hint", "tu-btn--ghost", "H");
		}
		if (p === "move") {
			var done = !nextSteps().length;
			h += '<button type="button" class="tu-btn ' + (done ? "tu-btn--primary" : "") + '" data-a="confirm"' + (done ? "" : " disabled") + ' title="Enter">Confirm move</button>';
			h += '<button type="button" class="tu-btn" data-a="undo"' + (G.steps.length ? "" : " disabled") + ' title="U">Undo</button>';
			h += '<button type="button" class="tu-btn tu-btn--ghost" data-a="undoall"' + (G.steps.length > 1 ? "" : " disabled") + ">Undo all</button>";
			h += btn("hint", "Hint", "tu-btn--ghost", "H");
			if (G.hint) h += btn("playhint", "Play hint", "tu-btn--ghost");
		}
		if (p === "offer") { h += btn("take", "Take", "tu-btn--primary", "T"); h += btn("drop", "Drop", "", "P"); h += btn("hint", "Hint", "tu-btn--ghost", "H"); }
		if (p === "over") h += btn("next", "Next game", "tu-btn--primary", "N");
		if (p === "matchOver") h += btn("next", "New match", "tu-btn--primary", "N");
		$("bgm-act").innerHTML = h;
	}
	function renderInfo() {
		var b = G.view || G.b, h = "";
		var p0 = BG.pips(b[0]), p1 = BG.pips(b[1]);
		h += '<div class="bgm-pips"><span>Your pips <b>' + p0 + "</b></span><span>Computer <b>" + p1 + "</b></span><span>" +
			(p0 === p1 ? "Even race" : p0 < p1 ? "You lead by <b>" + (p1 - p0) + "</b>" : "You trail by <b>" + (p0 - p1) + "</b>") + "</span>" +
			"<span>Off: you " + b[0][0] + ", computer " + b[1][0] + "</span></div>";
		if (S.set.odds && G.phase !== "opening" && G.phase.indexOf("cpu") !== 0) {
			var lines = [];
			try {
				if (G.phase === "roll") {
					var ho = BG.hitOdds(b, 0), ks = Object.keys(ho.by);
					if (b[0][25]) { var closed = 0; for (var k = 1; k <= 6; k++) if (b[1][k] >= 2) closed++; lines.push("Chance to come in from the bar: " + frac(BG.enterCount(closed)) + (closed ? " (" + closed + " closed point" + (closed > 1 ? "s" : "") + ")" : "")); }
					if (ks.length) {
						lines.push("Chance you can hit a computer blot next roll: <b>" + frac(ho.any) + "</b>");
						ks.sort(function (a, c) { return c - a; }).forEach(function (k) { lines.push("· the blot on your point " + (25 - k) + ": " + frac(ho.by[k])); });
					} else lines.push("The computer has no blots to hit.");
					var wp = 1 - BG.evaluate(b, 1);
					lines.push('Rough engine estimate: you win about <b>' + Math.round(100 * wp) + "%</b>");
				} else if (G.phase === "move" || G.phase === "pass" || G.phase === "offer") {
					var hc = BG.hitOdds(b, 1), kc = Object.keys(hc.by);
					if (kc.length) {
						lines.push((G.phase === "move" ? "After this move, the computer" : "The computer") + " can hit one of your blots with <b>" + frac(hc.any) + "</b>");
						kc.sort(function (a, c) { return a - c; }).forEach(function (k) { lines.push("· your blot on point " + k + ": " + frac(hc.by[k])); });
					} else lines.push("You have no blots the computer can hit.");
				}
			} catch (e) {}
			if (lines.length) h += '<div class="bgm-odds" aria-live="polite">' + lines.join("<br>") + "</div>";
		}
		$("bgm-info").innerHTML = h;
	}

	/* ---------- input ---------- */
	var boardEl = $("bgm-board"), drag = null, lastTap = { pt: -2, t: 0 };
	function svgPoint(e) {
		var svg = boardEl.querySelector("svg");
		if (!svg) return null;
		var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
		var m = svg.getScreenCTM(); if (!m) return null;
		return pt.matrixTransform(m.inverse());
	}
	function tap(pt, viaKey) {
		if (G.phase !== "move" || pt < 0) return;
		var now = Date.now();
		var isSrc = nextSteps().some(function (s) { return s[0] === pt; });
		if (!viaKey && isSrc && lastTap.pt === pt && now - lastTap.t < 380 && G.steps.length === lastTap.n) { lastTap = { pt: -2, t: 0 }; if (autoMove(pt)) return; }
		lastTap = { pt: pt, t: now, n: G.steps.length };
		if (sel !== null && dests && dests[pt] !== undefined && !(pt === sel)) { var path = dests[pt]; doSteps(path); lastTap = { pt: -2, t: 0 }; return; }
		if (isSrc) {
			if (S.set.oneClick && !viaKey) { autoMove(pt); lastTap = { pt: -2, t: 0 }; return; }
			sel = sel === pt ? null : pt;
		} else sel = null;
		render();
		if (viaKey) { var el = boardEl.querySelector('[data-pt="' + pt + '"]'); if (el) el.focus(); }
	}
	boardEl.addEventListener("pointerdown", function (e) {
		if (!G || G.phase !== "move") return;
		var p = svgPoint(e); if (!p) return;
		var pt = ptAt(p.x, p.y);
		drag = { pt: pt, x: e.clientX, y: e.clientY, on: false, id: e.pointerId };
		var isSrc = nextSteps().some(function (s) { return s[0] === pt; });
		if (!isSrc) drag.noDrag = true;
	});
	boardEl.addEventListener("pointermove", function (e) {
		if (!drag || drag.noDrag || e.pointerId !== drag.id) return;
		if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
			drag.on = true; sel = drag.pt; render();
			try { boardEl.setPointerCapture(e.pointerId); } catch (er) {}
		}
		if (drag.on) {
			var p = svgPoint(e), f = $("bgm-float");
			if (p && f) { f.setAttribute("cx", p.x); f.setAttribute("cy", p.y); }
			e.preventDefault();
		}
	});
	boardEl.addEventListener("pointerup", function (e) {
		if (!drag || e.pointerId !== drag.id) return;
		var d = drag; drag = null;
		var p = svgPoint(e); if (!p) return;
		var pt = ptAt(p.x, p.y);
		if (d.on) {
			if (dests && dests[pt] !== undefined && pt !== d.pt) doSteps(dests[pt]);
			else { sel = null; render(); }
			return;
		}
		tap(d.pt === pt ? pt : pt);
	});
	boardEl.addEventListener("pointercancel", function () { if (drag && drag.on) { sel = null; render(); } drag = null; });
	boardEl.addEventListener("keydown", function (e) {
		var t = e.target;
		if (t && t.getAttribute && t.getAttribute("data-pt") !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tap(+t.getAttribute("data-pt"), true); }
	});
	$("bgm-act").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-a]"); if (!b || b.disabled) return;
		action(b.getAttribute("data-a"));
	});
	function action(a) {
		if (a === "open" && G.phase === "opening") openingRoll();
		else if (a === "roll") humanRoll();
		else if (a === "double") humanDouble();
		else if (a === "confirm") endHumanTurn();
		else if (a === "undo") undo(false);
		else if (a === "undoall") undo(true);
		else if (a === "hint") hint();
		else if (a === "playhint") playHint();
		else if (a === "take") humanAnswer(true);
		else if (a === "drop") humanAnswer(false);
		else if (a === "next") nextGame();
	}
	document.addEventListener("keydown", function (e) {
		if (S.tab !== "play" || !G || e.ctrlKey || e.metaKey || e.altKey) return;
		var tg = e.target; if (tg && /INPUT|SELECT|TEXTAREA/.test(tg.tagName)) return;
		if (tg && tg.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
		if (tg && tg.getAttribute && tg.getAttribute("data-pt") !== null && (e.key === "Enter" || e.key === " ")) return;
		var k = e.key.toLowerCase(), map = { r: G.phase === "opening" ? "open" : "roll", d: "double", u: "undo", backspace: "undo", h: "hint", t: "take", p: "drop", n: "next", enter: "confirm", escape: "esc" };
		var a = map[k]; if (!a) return;
		if (a === "esc") { if (sel !== null) { sel = null; render(); } return; }
		e.preventDefault();
		action(a);
	});

	/* ---------- settings ---------- */
	function syncSettings() {
		root.querySelectorAll("#bgm-level button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S.set.level ? "true" : "false"); });
		$("bgm-type").value = S.set.type;
		$("bgm-speed").value = S.set.speed;
		["cube", "jacoby", "autoRoll", "autoConfirm", "oneClick", "flip", "nums", "odds"].forEach(function (k) { var el = $("bgm-o-" + k); if (el) el.checked = !!S.set[k]; });
		$("bgm-lvnote").hidden = !G || G.level === S.set.level;
	}
	$("bgm-level").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-v]"); if (!b) return;
		S.set.level = b.getAttribute("data-v"); save(); syncSettings();
		if (G && G.phase === "opening" && !G.match.score[0] && !G.match.score[1]) { G.level = S.set.level; save(); render(); syncSettings(); }
	});
	$("bgm-type").addEventListener("change", function () { S.set.type = this.value; save(); toast("Starts with your next new game."); });
	$("bgm-speed").addEventListener("change", function () { S.set.speed = this.value; save(); });
	["cube", "jacoby", "autoRoll", "autoConfirm", "oneClick", "flip", "nums", "odds"].forEach(function (k) {
		var el = $("bgm-o-" + k); if (!el) return;
		el.addEventListener("change", function () {
			S.set[k] = el.checked; save();
			if ((k === "cube" || k === "jacoby") && G) toast("Starts with your next new game.");
			render(); renderRules();
		});
	});
	$("bgm-new").addEventListener("click", function () {
		if (G && ["over", "matchOver", "opening"].indexOf(G.phase) < 0 && !confirm("Start a new game? The game in progress is not counted.")) return;
		newMatch(); syncSettings();
	});

	/* ---------- tabs ---------- */
	function showTab(t) {
		S.tab = t; save();
		root.querySelectorAll(".bgm-tab").forEach(function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
		["play", "stats", "rules", "odds"].forEach(function (x) { $("bgm-p-" + x).hidden = x !== t; });
		if (t === "stats") renderStats();
	}
	$("bgm-tabs").addEventListener("click", function (e) { var b = e.target.closest(".bgm-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("bgm-tabs").addEventListener("keydown", function (e) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		var tabs = [].slice.call(root.querySelectorAll(".bgm-tab")), i = tabs.indexOf(document.activeElement);
		if (i < 0) return;
		var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); showTab(n.getAttribute("data-t"));
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var st = S.stats, h = "", all = blankLv();
		["easy", "medium", "hard"].forEach(function (l) { var L = st.lv[l] || blankLv(); Object.keys(all).forEach(function (k) { all[k] += L[k] || 0; }); });
		var row = function (name, L) {
			return "<tr><td>" + name + "</td><td>" + L.g + "</td><td>" + L.w + "</td><td>" + L.l + "</td><td>" + pct(L.w, L.g) + "</td><td>" + L.gw + " / " + L.gl + "</td><td>" + L.bw + " / " + L.bl + "</td><td>" + (L.pw - L.pl >= 0 ? "+" : "") + (L.pw - L.pl) + "</td></tr>";
		};
		h += '<h2>Games against the computer</h2><div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Level</th><th>Games</th><th>Won</th><th>Lost</th><th>Win %</th><th>Gammons won / lost</th><th>Backgammons won / lost</th><th>Points</th></tr></thead><tbody>';
		h += row("Easy", st.lv.easy) + row("Medium", st.lv.medium) + row("Hard", st.lv.hard) + row("<b>All</b>", all) + "</tbody></table></div>";
		var sk = st.streak;
		h += '<div class="tu-stats">' +
			stat("Current streak", sk > 0 ? sk + " win" + (sk > 1 ? "s" : "") : sk < 0 ? (-sk) + " loss" + (sk < -1 ? "es" : "") : "–", "Best winning streak: " + (st.best || 0)) +
			stat("Matches won", st.matches.w + " of " + st.matches.p, "Match play only") +
			stat("Computer's pips left when you won", st.endW.n ? Math.round(st.endW.s / st.endW.n) : "–", "Average, games played to the end") +
			stat("Your pips left when you lost", st.endL.n ? Math.round(st.endL.s / st.endL.n) : "–", "Average, games played to the end") + "</div>";
		var c = st.cube;
		h += '<h2>The doubling cube</h2><div class="tu-table-wrap"><table class="tu-table"><tbody>' +
			"<tr><td>You doubled</td><td>" + c.youD + "</td><td>computer took " + c.cpuTook + ", dropped " + c.cpuDrop + "</td></tr>" +
			"<tr><td>The computer doubled</td><td>" + c.cpuD + "</td><td>you took " + c.youTook + ", dropped " + c.youDrop + "</td></tr></tbody></table></div>";
		var L0 = st.luck[0], L1 = st.luck[1];
		var lrow = function (name, L) {
			return "<tr><td>" + name + "</td><td>" + L.r + "</td><td>" + L.d + " (" + pct(L.d, L.r) + ")</td><td>" + (L.r ? (L.d / L.r * 6).toFixed(2) + "×" : "–") + "</td><td>" + L.p + "</td><td>" + (L.r ? (L.p / L.r).toFixed(2) : "–") + "</td></tr>";
		};
		h += '<h2>Dice luck</h2><p class="tu-note">Doubles should come up 1 time in 6 (16.7%), and a roll is worth 8.17 pips on average (doubles count four times). Opening rolls are not counted.</p>' +
			'<div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Player</th><th>Rolls</th><th>Doubles</th><th>vs expected</th><th>Pips rolled</th><th>Per roll</th></tr></thead><tbody>' +
			lrow("You", L0) + lrow("Computer", L1) + "</tbody></table></div>";
		if (L0.r && L1.r) h += '<p class="tu-note">Pips rolled per roll: you ' + (L0.p / L0.r).toFixed(2) + ", computer " + (L1.p / L1.r).toFixed(2) + ". Over a few dozen games luck evens out; over a few games it can swing a lot.</p>";
		h += '<p><button type="button" class="tu-btn tu-btn--ghost" id="bgm-reset">Reset statistics</button></p>';
		$("bgm-stats").innerHTML = h;
		$("bgm-reset").onclick = function () { if (confirm("Reset all your backgammon statistics on this device?")) { S.stats = blankStats(); save(); renderStats(); toast("Statistics reset."); } };
	}
	function stat(l, v, sub) { return '<div class="tu-stat"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + sub + "</div></div>"; }

	/* ---------- rules diagrams ---------- */
	function pos(spec) {      // spec: {me:{pt:n}, op:{pt(in human numbering):n}}
		var b = [[], []];
		for (var i = 0; i < 26; i++) { b[0].push(0); b[1].push(0); }
		var t0 = 0, t1 = 0;
		Object.keys(spec.me || {}).forEach(function (k) { b[0][+k] = spec.me[k]; t0 += spec.me[k]; });
		Object.keys(spec.op || {}).forEach(function (k) { var kk = +k; b[1][kk === 25 ? 25 : 25 - kk] = spec.op[k]; t1 += spec.op[k]; });
		b[0][0] += 15 - t0; b[1][0] += 15 - t1;
		return b;
	}
	function renderRules() {
		var D = {
			start: { b: BG.newBoard(), label: "The starting position" },
			move: { b: BG.applySeq(BG.newBoard(), 0, [[24, 18, 6, 0], [18, 14, 4, 0]]), dice: [6, 4], arrows: [{ seq: [[24, 18, 6, 0], [18, 14, 4, 0]], side: 0, cls: "hint" }], label: "Rolling 6-4: one checker moves 6 then 4 (24 to 14)" },
			hit: { b: pos({ me: { 13: 5, 8: 3, 6: 5, 24: 2 }, op: { 10: 1, 12: 5, 17: 3, 19: 5, 1: 1 } }), dice: [3, 1], arrows: [{ seq: [[13, 10, 3, 1]], side: 0, cls: "hint" }], label: "The computer's lone checker on point 10 is a blot: 13 to 10 hits it" },
			bar: { b: pos({ me: { 25: 1, 13: 5, 8: 3, 6: 5, 24: 1 }, op: { 19: 2, 21: 2, 23: 2, 12: 4, 17: 3, 1: 2 } }), dice: [5, 2], arrows: [{ seq: [[25, 20, 5, 0]], side: 0, cls: "hint" }], label: "On the bar: with 5-2 you can come in on point 20 (5); point 23 (2) is blocked" },
			off: { b: pos({ me: { 6: 2, 5: 3, 3: 2, 2: 4, 1: 2 }, op: { 20: 3, 22: 4, 24: 3 } }), dice: [6, 4], arrows: [{ seq: [[6, 0, 6, 0], [5, 1, 4, 0]], side: 0, cls: "hint" }], label: "Bearing off with 6-4: the 6 takes a checker off point 6; the 4 cannot bear off (point 4 is empty and points 5 and 6 still have checkers), so a checker moves 4 pips, here 5 to 1" }
		};
		root.querySelectorAll(".bgm-dia").forEach(function (el) {
			var d = D[el.getAttribute("data-dia")]; if (!d) return;
			el.innerHTML = boardSvg(d.b, { dice: d.dice, diceSide: 0, arrows: d.arrows, nums: true, label: d.label, cube: el.getAttribute("data-dia") === "start" ? { v: 1, owner: -1 } : null }) + '<p class="bgm-cap">' + esc(d.label) + "</p>";
		});
	}

	/* ---------- odds tab ---------- */
	function renderOdds() {
		var h = '<h2>Chance to hit a blot (one checker, nothing in the way)</h2><p class="tu-note">Rolls out of 36 in which one checker can hit a blot that many pips away, when no points in between are blocked. "Direct" counts only the rolls that contain the number itself (1 to 6). Blocked points lower the indirect shots; the live odds under the board count blocks exactly.</p>';
		h += '<div class="tu-table-wrap"><table class="tu-table bgm-oddtab"><thead><tr><th>Distance</th><th>Rolls that hit</th><th>Chance</th><th>Direct only</th></tr></thead><tbody>';
		for (var d = 1; d <= 24; d++) {
			var n = BG.shotCount(d); if (!n) continue;
			h += "<tr><td>" + d + "</td><td>" + n + "/36</td><td>" + (100 * n / 36).toFixed(1) + '%<span class="bgm-bar2" style="width:' + (n / 17 * 100).toFixed(0) + '%"></span></td><td>' + (d <= 6 ? BG.directCount(d) + "/36" : "–") + "</td></tr>";
		}
		h += '</tbody></table></div><p class="tu-note">Distances not listed (13, 14, 17, 19, 21-23) cannot be hit with one roll. A double moves four times, which is why 16, 20 and 24 can still be hit (4-4, 5-5, 6-6).</p>';
		h += '<h2>Coming in from the bar</h2><div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Closed points in the home board</th><th>One checker comes in</th><th>Two checkers both come in</th></tr></thead><tbody>';
		for (var k = 0; k <= 6; k++) {
			var two = (6 - k) * (6 - k);
			h += "<tr><td>" + k + "</td><td>" + (36 - k * k) + "/36 (" + (100 * (36 - k * k) / 36).toFixed(1) + "%)</td><td>" + two + "/36 (" + (100 * two / 36).toFixed(1) + "%)</td></tr>";
		}
		h += "</tbody></table></div>";
		h += '<h2>Bearing off in one roll: your last two checkers</h2><p class="tu-note">Chance to take both off with one roll, by the points they are on (other side: no effect, this is a pure race).</p><div class="tu-table-wrap"><table class="tu-table bgm-grid"><thead><tr><th>Points</th>';
		for (var a = 1; a <= 6; a++) h += "<th>" + a + "</th>";
		h += "</tr></thead><tbody>";
		for (a = 1; a <= 6; a++) {
			h += "<tr><td>" + a + "</td>";
			for (var c = 1; c <= 6; c++) {
				var me = []; for (var i = 0; i < 26; i++) me.push(0); me[0] = 13; me[a]++; me[c]++;
				var nn = BG.bearOffCount(me);
				h += '<td title="' + nn + '/36">' + Math.round(100 * nn / 36) + "%</td>";
			}
			h += "</tr>";
		}
		h += "</tbody></table></div>";
		h += '<h2>One checker left</h2><div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Point</th><th>Off in one roll</th></tr></thead><tbody>';
		for (k = 1; k <= 12; k++) { var m1 = []; for (i = 0; i < 26; i++) m1.push(0); m1[0] = 14; m1[k] = 1; var n1 = BG.bearOffCount(m1); h += "<tr><td>" + k + "</td><td>" + n1 + "/36 (" + (100 * n1 / 36).toFixed(1) + "%)</td></tr>"; }
		h += "</tbody></table></div>";
		h += '<h2>Handy numbers</h2><ul class="bgm-list"><li>Any one number you need (say a 6): 11/36 = 30.6%.</li><li>Any double: 6/36 = 16.7%; one particular double: 1/36 = 2.8%.</li><li>A particular roll like 6-5: 2/36 = 5.6% (6-5 or 5-6).</li><li>An average roll is worth 8.17 pips; that is why a 10% lead in a long race is a lot.</li><li>The doubling cube: take when you win at least about 25% of the time (money game, no gammons).</li></ul>';
		$("bgm-odds").innerHTML = h;
	}

	/* ---------- start ---------- */
	renderRules(); renderOdds(); syncSettings();
	if (!G) newMatch();
	else {
		// resume a saved game
		G.view = null; drag = null;
		if (G.phase === "cpuAnim") finishCpu();
		else if (G.phase === "cpuThink") { G.phase = "cpuRolled"; cpuPlay(); }
		else if (G.phase === "cpuRolled") setTimeout(cpuPlay, 300);
		else if (G.phase === "cpuPre") cpuTurn();
		else if (G.phase === "asking") { G.phase = "roll"; humanDouble(); }
		else if (G.phase === "pass") endHumanTurn();
		else render();
	}
	showTab(S.tab || "play");
	syncSettings();
})();
