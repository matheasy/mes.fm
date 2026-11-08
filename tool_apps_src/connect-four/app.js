/* MES Connect Four: the page (setup, board, computer, analysis, replay, guest online games via /api/c4, Hive games, statistics, rules).
   The same served file is also started as a Web Worker that runs the computer's thinking (see the top).
   Online: /api/c4 on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in localStorage
   "mes-c4:mock" is used instead, and Hive play uses a stand-in chain ("mes-c4:hchain") + a per-tab account, so two tabs can play. */
(function () {
	"use strict";
	var C = (typeof self !== "undefined" ? self : window).MESC4;

	function compute(q) {
		var s = C.replay(C.parseCode(q.code), q.moves);
		if (!s) return null;
		if (q.type === "analyze") { var a = C.analyze(s, q.ms); return { depth: a.depth, vals: a.vals.map(function (o) { return { m: C.mstr(o.m), v: o.v, ply: o.ply }; }) }; }
		var r = C.think(s, q.level, { ms: q.ms });
		return r ? { m: C.mstr(r.m), how: r.how, depth: r.depth } : null;
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
	var root = document.getElementById("c4");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-connect-four:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var COLS = "abcdefghijkl";

	/* ---------- saved settings ---------- */
	var S = { game: "classic", custom: { w: 7, h: 6, k: 4, pop: false, mis: false, three: false }, opp: "cpu", lv: "medium", me: "first", alt: 0,
		name: "", ofirst: "host", opub: true, cur: null, stats: {}, online: null, orec: {}, marks: false, anal: false, hive: null, saved: {} };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) {}
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
	var cfg, code, st, mode = "cpu", human = 0, vi = null, busy = false, gen = 0, cur = -1, kbd = false, anim = null;
	var score = { w: 0, d: 0, l: 0, p: [0, 0, 0] };
	var LV_MS = { easy: 0, medium: 300, hard: 1000, expert: 3000 };
	var anal = { key: "", vals: null, busy: false };

	function setupCfg() {
		if (S.game === "custom") {
			var c = S.custom;
			return C.parseCode(C.cfgCode({ w: +c.w, h: +c.h, k: +c.k, pop: !!c.pop, mis: !!c.mis, np: c.three ? 3 : 2 }));
		}
		var p = C.preset(S.game) || C.PRESETS[0];
		return C.parseCode(p.code);
	}
	function setGame(newCfg, moves, opts) {
		opts = opts || {};
		cfg = newCfg; code = C.cfgCode(cfg);
		st = C.replay(cfg, moves || []) || C.create(cfg);
		vi = null; busy = false; gen++; cur = -1; anim = null;
		if (!opts.keepMode) mode = effOpp();
		if (opts.human !== undefined) human = opts.human;
		storeCur();
		render();
		maybeCpu();
	}
	function effOpp() { return cfg && cfg.np === 3 ? "local" : S.opp; }
	function newGame() {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first (button above the board).");
		var c = setupCfg();
		if (!c) return toast("That board doesn't work: check the custom settings.");
		cfg = c;
		mode = effOpp();
		if (mode === "cpu") {
			if (S.me === "first") human = 0;
			else if (S.me === "second") human = 1;
			else { human = S.alt % 2; S.alt++; }
		}
		setGame(c, [], { human: human });
	}
	function storeCur() {
		if (mode === "online" || mode === "hive") return;
		S.cur = { code: code, moves: st.hist.slice(), mode: mode, human: human, done: !!st.win };
		save();
	}
	function viewState() { return vi === null ? st : C.replay(cfg, st.hist.slice(0, vi)); }
	function isHumanTurn() {
		if (mode === "local") return true;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		if (mode === "hive") return hv.R && hv.R.status === "play" && hv.R.turnAcct === hMe();
		return false;
	}
	function canInput() { return !st.win && vi === null && !busy && isHumanTurn() && !(mode === "online" && on.sending) && !(mode === "hive" && (hv.busy || hv.pending.some(function (p) { return p.a === "mv"; }))); }

	/* ---------- the computer ---------- */
	function maybeCpu() {
		if (mode !== "cpu" || st.win || st.turn === human || busy) return;
		busy = true;
		var g = gen, t0 = Date.now();
		render();
		ask({ code: code, moves: st.hist.slice(), level: S.lv, ms: LV_MS[S.lv] }).then(function (r) {
			var wait = Math.max(0, 450 - (Date.now() - t0));
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
			return;
		}
		if (!C.isLegal(st, m)) { toast(m.t === "p" ? "You can only pop out one of your own discs from the bottom row." : "That column is full."); return; }
		if (mode === "online") return onlineMove(m);
		if (mode === "hive") return hiveMove(m);
		commit(m);
	}
	function commit(m) {
		C.apply(st, m);
		vi = null;
		animFor(m);
		storeCur();
		render();
		if (st.win) finish(); else maybeCpu();
	}
	/** remember what to animate on the next draw (the falling disc, or the popped column sliding down) */
	function animFor(m) { anim = m ? { t: m.t, x: m.x, n: st.hist.length, t0: Date.now() } : null; }
	function finish() {
		if (st._fin) return;
		st._fin = true;
		var w = st.win, msg;
		if (mode === "local") {
			if (w.p < 0) score.d++; else score.p[w.p]++;
			msg = w.p < 0 ? "Draw." : C.playerName(cfg, w.p) + " wins!";
		} else {
			var me = mode === "cpu" ? human : mode === "hive" ? (hv.R ? hv.R.players.indexOf(hMe()) : -1) : on.seat, res = w.p < 0 ? "d" : w.p === me ? "w" : "l";
			if (me < 0) { toast(w.p < 0 ? "Draw." : C.playerName(cfg, w.p) + " wins."); return; }
			score[res]++;
			var key = code + "|" + (mode === "cpu" ? S.lv : mode);
			var rec = true;
			if (mode === "online" || mode === "hive") { var tag = mode === "hive" ? "h:" + hv.host + "/" + hv.gid : on.id + ":" + (on.g ? on.g.round : 0); if (S.orec[tag]) rec = false; else S.orec[tag] = 1; pruneOrec(); }
			if (rec) { var a = S.stats[key] || [0, 0, 0]; a[res === "w" ? 0 : res === "d" ? 1 : 2]++; S.stats[key] = a; }
			msg = res === "w" ? "You win! 🎉" : res === "d" ? "Draw." : (mode === "cpu" ? "The computer wins." : "You lost this one.");
			save();
		}
		toast(msg);
		renderScore();
		renderStats();
	}
	function pruneOrec() { var k = Object.keys(S.orec); if (k.length > 60) k.slice(0, k.length - 60).forEach(function (x) { delete S.orec[x]; }); }
	function undo() {
		if (mode === "online" || mode === "hive" || busy || !st.hist.length) return;
		var h = st.hist.slice();
		if (mode === "cpu") {
			h.pop();
			var t = C.replay(cfg, h);
			while (h.length && t && t.turn !== human) { h.pop(); t = C.replay(cfg, h); }
		} else h.pop();
		gen++; busy = false;
		setGame(cfg, h, { human: human, keepMode: true });
	}

	/* ---------- analysis (the Hard engine's score of every column) ---------- */
	function wantAnalysis() { return S.anal && !st.win && vi === null && (mode === "local" || (mode === "cpu" && st.turn === human)); }
	function runAnalysis() {
		if (!wantAnalysis()) { anal.vals = null; return; }
		var key = code + ":" + st.hist.join(".");
		if (anal.key === key) return;
		anal.key = key; anal.vals = null; anal.busy = true;
		ask({ type: "analyze", code: code, moves: st.hist.slice(), ms: cfg.w * cfg.h > 60 ? 2200 : 1500 }).then(function (r) {
			if (anal.key !== key) return;
			anal.busy = false;
			anal.vals = r ? r.vals : [];
			anal.depth = r ? r.depth : 0;
			render(true);
		});
	}

	/* ---------- board ---------- */
	var CS = 100;   // cell size in SVG units
	function discMark(p, cx, cy) {
		if (!S.marks) return "";
		var r = CS * 0.14;
		if (p === 0) return '<circle class="c4-mk" cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke-width="7" fill="none"/>';
		if (p === 1) return '<path class="c4-mk" stroke-width="8" stroke-linecap="round" d="M' + (cx - r) + " " + (cy - r) + "L" + (cx + r) + " " + (cy + r) + "M" + (cx + r) + " " + (cy - r) + "L" + (cx - r) + " " + (cy + r) + '"/>';
		return '<path class="c4-mk" stroke-width="7" stroke-linejoin="round" fill="none" d="M' + cx + " " + (cy - r * 1.15) + "L" + (cx + r * 1.1) + " " + (cy + r * 0.75) + "L" + (cx - r * 1.1) + " " + (cy + r * 0.75) + 'Z"/>';
	}
	function disc(p, cx, cy, extra) { return '<circle class="c4-d p' + p + '" cx="' + cx + '" cy="' + cy + '" r="' + CS * 0.4 + '"/><circle class="c4-dh" cx="' + cx + '" cy="' + cy + '" r="' + CS * 0.3 + '"/>' + discMark(p, cx, cy) + (extra || ""); }
	function drawBoard(s) {
		var c = cfg, w = c.w, h = c.h, W = w * CS, Hb = h * CS, top = CS, popRow = c.pop ? CS * 0.8 : 0, live = canInput();
		var out = [], i, x, y;
		var vbY = -top, vbH = top + Hb + popRow + 10;
		var winSet = {};
		if (s.win && s.win.lines) s.win.lines.forEach(function (l) { l.forEach(function (j) { winSet[j] = 1; }); });
		// a redraw while a disc is still falling continues its animation (negative delay) instead of restarting or cutting it
		var el = anim ? Date.now() - anim.t0 : 1e9, doAnim = anim && vi === null && anim.n === s.hist.length && el < 900, dl = doAnim ? "animation-delay:-" + el + "ms;" : "";
		// discs (behind the panel); the new one falls, a popped column slides down one row
		var discs = [];
		for (i = 0; i < s.cells.length; i++) {
			var v = s.cells[i]; if (v < 0) continue;
			x = i % w; y = (i / w) | 0;
			var cx = x * CS + CS / 2, cy = y * CS + CS / 2, d = disc(v, cx, cy);
			if (doAnim && anim.t === "d" && i === s.last) d = '<g class="c4-fall" style="' + dl + '--fy:' + (-(y + 1) * CS - 10) + 'px;--ft:' + (0.22 + 0.05 * y).toFixed(2) + 's">' + d + "</g>";
			else if (doAnim && anim.t === "p" && x === anim.x) d = '<g class="c4-slide" style="' + dl + '--fy:' + (-CS) + 'px">' + d + "</g>";
			discs.push(d);
		}
		var holes = [], rims = [];
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
			holes.push('<circle cx="' + (x * CS + CS / 2) + '" cy="' + (y * CS + CS / 2) + '" r="' + CS * 0.41 + '" fill="#000"/>');
			rims.push('<circle class="c4-rim" cx="' + (x * CS + CS / 2) + '" cy="' + (y * CS + CS / 2) + '" r="' + CS * 0.41 + '"/>');
		}
		out.push('<defs><mask id="c4-mask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="' + (W + 40) + '" height="' + (Hb + 40) + '"><rect x="-20" y="-20" width="' + (W + 40) + '" height="' + (Hb + 40) + '" fill="#fff"/>' + holes.join("") + "</mask></defs>");
		out.push('<rect class="c4-back" x="0" y="0" width="' + W + '" height="' + Hb + '"/>');
		out.push(discs.join(""));
		out.push('<rect class="c4-panel" x="-8" y="-8" width="' + (W + 16) + '" height="' + (Hb + 16) + '" rx="18" mask="url(#c4-mask)"/>');
		out.push(rims.join(""));
		// win rings, last-move dot
		Object.keys(winSet).forEach(function (j) { j = +j; out.push('<circle class="c4-wr" cx="' + ((j % w) * CS + CS / 2) + '" cy="' + (((j / w) | 0) * CS + CS / 2) + '" r="' + CS * 0.36 + '"/>'); });
		if (s.win && s.win.lines) s.win.lines.forEach(function (l) {
			var a = l[0], e = l[l.length - 1];
			var dd = 'x1="' + ((a % w) * CS + CS / 2) + '" y1="' + (((a / w) | 0) * CS + CS / 2) + '" x2="' + ((e % w) * CS + CS / 2) + '" y2="' + (((e / w) | 0) * CS + CS / 2) + '"';
			out.push('<line class="c4-wl" ' + dd + "/>");
		});
		if (s.last >= 0 && !winSet[s.last]) out.push('<circle class="c4-ld" cx="' + ((s.last % w) * CS + CS / 2) + '" cy="' + (((s.last / w) | 0) * CS + CS / 2) + '" r="' + CS * 0.08 + '"/>');
		if (s.lastPop >= 0) out.push('<path class="c4-lp" d="M' + (s.lastPop * CS + CS / 2 - 14) + " " + (Hb + 14) + "l14 14l14 -14" + '"/>');
		// analysis scores in the top row
		var showA = anal.vals && wantAnalysis() && anal.key === code + ":" + st.hist.join(".");
		var aMap = {};
		if (showA) {
			var best = -Infinity; anal.vals.forEach(function (o) { if (o.v > best) best = o.v; });
			anal.vals.forEach(function (o) { aMap[o.m] = { v: o.v, ply: o.ply, best: o.v === best }; });
		}
		// columns: hit area + hover preview of the disc to drop
		for (x = 0; x < w; x++) {
			var okDrop = live && s.hts[x] < h;
			var cls = "c4-col" + (okDrop ? "" : " is-off") + (kbd && cur === x ? " is-cur" : "");
			var pv = okDrop ? '<g class="c4-pv">' + disc(s.turn, x * CS + CS / 2, -CS / 2) + "</g>" : "";
			var dc = C.dropCell(s, x), ghost = okDrop && dc >= 0 ? '<circle class="c4-gh p' + s.turn + '" cx="' + (x * CS + CS / 2) + '" cy="' + (((dc / w) | 0) * CS + CS / 2) + '" r="' + CS * 0.38 + '"/>' : "";
			out.push('<g class="' + cls + '" data-x="' + x + '"><rect class="c4-hit" x="' + (x * CS) + '" y="' + (-top) + '" width="' + CS + '" height="' + (top + Hb) + '"/>' + ghost + pv + "</g>");
			var a1 = aMap[String(x)];
			if (a1) out.push('<text class="c4-av' + (a1.ply ? (a1.v > 0 ? " is-win" : " is-lose") : "") + (a1.best ? " is-best" : "") + '" x="' + (x * CS + CS / 2) + '" y="' + (-CS * 0.12) + '">' + esc(C.valueLabel(a1.v, a1.ply)) + "</text>");
		}
		// pop buttons under the board
		if (c.pop) for (x = 0; x < w; x++) {
			if (!C.canPop(s, x)) continue;
			var ok = live, a2 = aMap["p" + x];
			out.push('<g class="c4-popb' + (ok ? "" : " is-off") + '" data-pop="' + x + '"><rect x="' + (x * CS + 10) + '" y="' + (Hb + 12) + '" width="' + (CS - 20) + '" height="' + (popRow - 18) + '" rx="12"/><text x="' + (x * CS + CS / 2) + '" y="' + (Hb + 12 + (popRow - 18) / 2) + '">' + (a2 ? esc(C.valueLabel(a2.v, a2.ply)) : "⏏ pop") + "</text></g>");
		}
		var bd = $("c4-board");
		bd.style.setProperty("--c4-ar", (W + 20) / vbH);
		bd.innerHTML = '<svg viewBox="-10 ' + vbY + " " + (W + 20) + " " + vbH + '" role="img" aria-label="' + esc(boardLabel(s)) + '">' + out.join("") + "</svg>";
	}
	function boardLabel(s) {
		var n = 0; for (var i = 0; i < s.cells.length; i++) if (s.cells[i] >= 0) n++;
		return C.describe(cfg) + " board, " + n + " discs. Columns a to " + COLS[cfg.w - 1] + ".";
	}

	/* ---------- render ---------- */
	function nameOf(p) {
		var base = C.playerName(cfg, p);
		if (mode === "cpu") return (p === human ? "You" : "Computer") + " (" + base + ")";
		if (mode === "online" && on.g) { var nm = on.g.names[p] || "waiting…"; return (p === on.seat ? "You" : esc(nm)) + " (" + base + ")"; }
		if (mode === "hive" && hv.R) { var hn = hv.R.players[p]; return (hn && hn === hMe() ? "You" : hn ? "@" + esc(hn) : "waiting…") + " (" + base + ")"; }
		return base;
	}
	function youAre(p) { return (mode === "cpu" && p === human) || (mode === "online" && p === on.seat) || (mode === "hive" && hv.R && hv.R.players[p] === hMe()); }
	function chip(p) { return '<span class="c4-chip p' + p + '" aria-hidden="true"></span>'; }
	function sym(p) { return chip(p) + '<span class="c4-pn p' + p + '">' + nameOf(p) + "</span>"; }
	function statusText(s) {
		if (mode === "online" && on.g && on.g.status === "wait") return "Waiting for someone to join…";
		if (mode === "hive") {
			if (!hv.R || !hv.R.open) return "Reading the game from Hive…";
			if (hv.R.status === "wait") return "Waiting for a player (Hive game)…";
			if (hv.busy) return "Approve it in Hive Keychain…";
			if (!s.win && hv.pending.length) return "Sent: waiting for the next Hive block…";
		}
		if (s.win) {
			var why = s.win.why;
			if (s.win.p < 0) return { full: "Draw: the board is full.", repeat: "Draw: the same position came up three times.", long: "Draw: " + C.MAX_POP_MOVES + " moves without a winner.", stuck: "Draw: no move left." }[why] || "Draw.";
			var W = function (p) { return youAre(p) ? chip(p) + "<b>You win</b>" : sym(p) + " wins"; };
			var other = function (p) { return youAre(p) ? "you" : mode === "cpu" ? "the computer" : C.playerName(cfg, p); };
			if (why === "resign") return W(s.win.p) + " (" + other(1 - s.win.p) + " resigned).";
			if (why === "timeout") return W(s.win.p) + " (" + other(1 - s.win.p) + (youAre(1 - s.win.p) ? " were" : " was") + " away too long).";
			if (why === "left") return W(s.win.p) + " (" + other(1 - s.win.p) + " left).";
			if (why === "line-lose") return W(s.win.p) + ": " + other(s.win.by) + " made four in a row.";
			if (why === "pop-gift") return W(s.win.p) + ": the pop made their line.";
			if (why === "pop-both") return W(s.win.p) + ": the pop made lines for both, and the player who popped wins.";
			return W(s.win.p) + (youAre(s.win.p) ? "! 🎉" : "!");
		}
		if (vi !== null) return "Looking back: move " + vi + " of " + st.hist.length + ".";
		if (busy) return chip(s.turn) + "The computer is thinking…";
		return sym(s.turn) + " to play: " + (cfg.pop ? "drop a disc or pop one of yours." : "pick a column.");
	}
	function renderMoves() {
		var ol = $("c4-moves"), h = st.hist, at = vi === null ? h.length : vi, np = cfg.np;
		ol.innerHTML = h.map(function (mv, i) {
			var m = C.mparse(mv);
			var tx = mode === "hive" && hv.R && hv.R.trx.moves[i] ? ' title="Hive transaction ' + esc(hv.R.trx.moves[i]) + '"' : "";
			return '<li><button type="button" data-mi="' + (i + 1) + '" class="m' + (i % np) + (i + 1 === at ? " is-cur" : "") + '"' + tx + ">" + (i + 1) + ". " + (m.t === "p" ? "⏏" : "") + COLS[m.x] + "</button></li>";
		}).join("");
		$("c4-rpos").textContent = h.length ? (at === h.length ? "Move " + at + " (now)" : "Move " + at + " of " + h.length) : "No moves yet";
		var bs = root.querySelectorAll("[data-r]");
		for (var i = 0; i < bs.length; i++) { var r = bs[i].getAttribute("data-r"); bs[i].disabled = r === "first" || r === "prev" ? at === 0 : at === h.length; }
		var li = ol.querySelector(".is-cur");
		if (li && ol.scrollHeight > ol.clientHeight) li.scrollIntoView({ block: "nearest" });
	}
	function renderScore() {
		var el = $("c4-score");
		if (mode === "local") el.innerHTML = "This session: " + [0, 1, 2].slice(0, cfg.np).map(function (p) { return "<span>" + chip(p) + "<b>" + score.p[p] + "</b> " + C.playerName(cfg, p) + "</span>"; }).join("") + "<span><b>" + score.d + "</b> draws</span>";
		else el.innerHTML = "This session: <span><b>" + score.w + "</b> won</span><span><b>" + score.d + "</b> drawn</span><span><b>" + score.l + "</b> lost</span>";
	}
	function render(keepAnal) {
		var s = viewState();
		root.classList.toggle("c4-incpu", effOpp() === "cpu" && (!cfg || cfg.np === 2));
		root.classList.toggle("c4-marks", !!S.marks);
		root.classList.toggle("c4-three", !!cfg && cfg.np === 3);
		$("c4-status").innerHTML = statusText(s);
		if (!keepAnal) runAnalysis();
		drawBoard(s);
		renderMoves();
		renderScore();
		var on1 = mode === "online" || mode === "hive";
		$("c4-undo").disabled = on1 || busy || !st.hist.length;
		$("c4-undo").hidden = on1;
		$("c4-new").hidden = on1;
		$("c4-link").hidden = on1 && !st.win;
		var canSave = st.win && st.win.p !== undefined && (mode === "cpu" || mode === "local") && vi === null;
		$("c4-hsave").hidden = !canSave;
		var savedKey = code + ":" + st.hist.join(".");
		var sv = S.saved[savedKey];
		$("c4-hsave").innerHTML = sv ? "⬢ Saved on Hive" : "⬢ Save result to Hive";
		$("c4-hsave").disabled = !!sv;
		$("c4-hsaved").innerHTML = sv && canSave ? 'Saved (self-reported): <a href="https://hivehub.dev/tx/' + esc(sv) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(sv) + '" target="_blank" rel="noopener">hiveblocks</a>' : "";
		$("c4-anote").textContent = S.anal ? (st.win || vi !== null ? "" : mode === "cpu" && st.turn !== human ? "" : anal.busy ? "Working out the scores…" : anal.vals ? "Scores from the Hard computer (looked " + anal.depth + " moves ahead): Win / Lose in N = forced; numbers = who stands better." : "") : "";
		renderObar();
		setupLock();
	}

	/* ---------- setup controls ---------- */
	function fillGameSelect() {
		var sel1 = $("c4-game"), groups = {}, order = [];
		C.PRESETS.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
		sel1.innerHTML = order.map(function (gname) {
			return '<optgroup label="' + gname + '">' + groups[gname].map(function (p) { return '<option value="' + p.id + '">' + p.name + "</option>"; }).join("") + "</optgroup>";
		}).join("") + '<optgroup label="Your own"><option value="custom">Custom board…</option></optgroup>';
	}
	function syncSetup() {
		$("c4-game").value = C.preset(S.game) || S.game === "custom" ? S.game : "classic";
		$("c4-custom").hidden = S.game !== "custom";
		var c = S.custom;
		$("c4-cw").value = c.w; $("c4-ch").value = c.h; $("c4-ck").value = c.k;
		$("c4-cp").checked = !!c.pop; $("c4-cm").checked = !!c.mis; $("c4-ct").checked = !!c.three;
		segSet("c4-opp", S.opp); segSet("c4-lv", S.lv); segSet("c4-me", S.me); segSet("c4-ofirst", S.ofirst);
		$("c4-marks").checked = !!S.marks; $("c4-anal").checked = !!S.anal;
		var p = C.preset(S.game), cc = setupCfg();
		$("c4-desc").textContent = p ? p.desc : cc ? "Your board: " + C.describe(cc) + "." : "";
		$("c4-cnote").textContent = S.game === "custom" && !cc ? customProblem() : "";
		var three = cc && cc.np === 3;
		$("c4-3note").hidden = !three;
		$("c4-ovar").textContent = cc ? C.describe(cc) : "—";
		$("c4-name").value = S.name || "";
		$("c4-opub").checked = S.opub !== false;
	}
	function customProblem() {
		var c = S.custom;
		if (+c.k > Math.max(+c.w, +c.h)) return "The line can't be longer than the board.";
		if (c.three && (c.pop || c.mis)) return "Three players can't be combined with Pop Out or misère.";
		if (c.pop && c.mis) return "Pop Out and misère can't be combined.";
		return "Columns 4 to 12, rows 4 to 10, a line of 3 to 7.";
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === v ? "true" : "false"); }
	function segWire(id, fn) {
		$(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || b.disabled) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); });
	}
	function setupLock() {
		var lock = mode === "online" || mode === "hive", els = $("c4-setup").querySelectorAll("select, input, button");
		for (var i = 0; i < els.length; i++) if (els[i].id !== "c4-marks" && els[i].id !== "c4-anal") els[i].disabled = lock;
	}
	fillGameSelect();
	$("c4-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("c4-opp", function (v) { S.opp = v; save(); newGame(); });
	segWire("c4-lv", function (v) { S.lv = v; save(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next move."); render(); });
	segWire("c4-me", function (v) { S.me = v; save(); newGame(); });
	segWire("c4-ofirst", function (v) { S.ofirst = v; save(); });
	$("c4-marks").addEventListener("change", function () { S.marks = this.checked; save(); render(true); });
	$("c4-anal").addEventListener("change", function () { S.anal = this.checked; save(); anal.key = ""; render(); });
	var custT = null;
	["c4-cw", "c4-ch", "c4-ck", "c4-cp", "c4-cm", "c4-ct"].forEach(function (id) {
		$(id).addEventListener($(id).type === "checkbox" ? "change" : "input", function () {
			S.custom = { w: clampN($("c4-cw").value, 4, 12, 7), h: clampN($("c4-ch").value, 4, 10, 6), k: clampN($("c4-ck").value, 3, 7, 4),
				pop: $("c4-cp").checked, mis: $("c4-cm").checked, three: $("c4-ct").checked };
			save();
			var cc = setupCfg();
			$("c4-cnote").textContent = cc ? "" : customProblem();
			$("c4-desc").textContent = cc ? "Your board: " + C.describe(cc) + "." : "";
			$("c4-ovar").textContent = cc ? C.describe(cc) : "—";
			$("c4-3note").hidden = !(cc && cc.np === 3);
			clearTimeout(custT);
			if (cc) custT = setTimeout(newGame, 450);
		});
	});
	function clampN(v, a, b, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(a, Math.min(b, v)); }

	/* ---------- board events ---------- */
	var board = $("c4-board");
	board.addEventListener("click", function (e) {
		var pb = e.target.closest("[data-pop]");
		if (pb) { kbd = false; cur = +pb.getAttribute("data-pop"); humanMove({ t: "p", x: cur }); return; }
		var col = e.target.closest("[data-x]");
		if (!col) return;
		kbd = false;
		cur = +col.getAttribute("data-x");
		humanMove({ t: "d", x: cur });
	});
	board.addEventListener("keydown", function (e) {
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault(); kbd = true;
			if (cur < 0) cur = (cfg.w - 1) >> 1;
			else cur = Math.max(0, Math.min(cfg.w - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
			render(true);
		} else if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
			e.preventDefault(); kbd = true;
			if (cur < 0) cur = (cfg.w - 1) >> 1;
			humanMove({ t: "d", x: cur });
		} else if ((e.key === "p" || e.key === "P" || e.key === "ArrowUp") && cfg.pop) {
			e.preventDefault(); kbd = true;
			if (cur >= 0) humanMove({ t: "p", x: cur });
		}
	});
	board.addEventListener("focus", function () { if (cur < 0) cur = (cfg.w - 1) >> 1; kbd = true; render(true); });
	board.addEventListener("blur", function () { if (kbd) { kbd = false; render(true); } });
	$("c4-new").addEventListener("click", newGame);
	$("c4-undo").addEventListener("click", undo);
	root.querySelector(".c4-rbtns").addEventListener("click", function (e) {
		var b = e.target.closest("[data-r]"); if (!b) return;
		var n = st.hist.length, at = vi === null ? n : vi, r = b.getAttribute("data-r");
		at = r === "first" ? 0 : r === "prev" ? at - 1 : r === "next" ? at + 1 : n;
		vi = at >= n ? null : Math.max(0, at);
		render();
	});
	$("c4-moves").addEventListener("click", function (e) {
		var b = e.target.closest("[data-mi]"); if (!b) return;
		var at = +b.getAttribute("data-mi");
		vi = at >= st.hist.length ? null : at;
		render();
	});
	function shareLink() {
		var at = vi === null ? st.hist.length : vi;
		var p = C.presetByCode(code);
		return location.origin + location.pathname + "?v=" + encodeURIComponent(p ? p.id : code) + (at ? "&m=" + st.hist.slice(0, at).join(".") : "");
	}
	$("c4-link").addEventListener("click", function () {
		copy(shareLink(), "Link copied: it opens this game at move " + (vi === null ? st.hist.length : vi) + ".");
	});

	/* ---------- fill window / full screen (shared panel-view.js) ---------- */
	var view = $("c4-view");
	function addPanel() {
		if (window.MESPanel && !view.__mesPanel) window.MESPanel.add(view, { bar: $("c4-pbar"), stage: $("c4-stage"), onChange: function () { render(true); } });
	}
	addPanel();
	if (!view.__mesPanel) document.addEventListener("DOMContentLoaded", addPanel);
	window.addEventListener("load", addPanel);
	function panelBtn(n) { var b = view.querySelectorAll(".mes-pbtn")[n]; if (b) b.click(); }
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("c4-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if (/^[0-9]$/.test(e.key) && cfg) {
			var x = e.key === "0" ? 9 : +e.key - 1;
			if (x < cfg.w) { e.preventDefault(); cur = x; humanMove({ t: e.shiftKey ? "p" : "d", x: x }); }
			return;
		}
		if (k === "n" && mode !== "online" && mode !== "hive") newGame();
		else if (k === "u") undo();
		else if (k === "w") panelBtn(0);
		else if (k === "f") panelBtn(1);
		else if (t !== board && (e.key === "ArrowLeft" || e.key === "ArrowRight") && st.hist.length) {
			var n = st.hist.length, at = vi === null ? n : vi;
			at += e.key === "ArrowLeft" ? -1 : 1;
			vi = at >= n ? null : Math.max(0, at);
			render();
		}
	});

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".c4-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("c4-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") { loadLobby(); loadHiveLobby(); renderHiveCard(); loadRecent(); }
		if (name === "stats") renderStats();
		lobbyTimer(name === "online");
	}
	$("c4-tabs").addEventListener("click", function (e) { var b = e.target.closest(".c4-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("c4-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("c4-stats"), keys = Object.keys(S.stats);
		if (!keys.length) { box.innerHTML = '<p class="c4-sub">No finished games yet. Play one against the computer or online and it shows up here.</p>'; return; }
		var LV = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert", online: "Online (guest)", hive: "On Hive" };
		var tot = [0, 0, 0];
		keys.sort();
		var rows = keys.map(function (k) {
			var a = S.stats[k], parts = k.split("|"), c = C.parseCode(parts[0]), n = a[0] + a[1] + a[2];
			tot[0] += a[0]; tot[1] += a[1]; tot[2] += a[2];
			return "<tr><td>" + esc(c ? C.describe(c) : parts[0]) + "</td><td>" + (LV[parts[1]] || esc(parts[1])) + "</td><td>" + n + '</td><td class="w">' + a[0] + "</td><td>" + a[1] + '</td><td class="l">' + a[2] + "</td><td>" + bar(a) + "</td></tr>";
		}).join("");
		box.innerHTML = '<div style="overflow-x:auto"><table class="c4-stbl"><thead><tr><th>Game</th><th>Against</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th></th></tr></thead><tbody>' + rows +
			'</tbody><tfoot><tr><th>All games</th><th></th><th style="text-align:right">' + (tot[0] + tot[1] + tot[2]) + '</th><th style="text-align:right">' + tot[0] + '</th><th style="text-align:right">' + tot[1] + '</th><th style="text-align:right">' + tot[2] + "</th><th>" + bar(tot) + "</th></tr></tfoot></table></div>" +
			'<p><button type="button" class="tu-btn" id="c4-sreset">Reset statistics</button></p>';
		$("c4-sreset").addEventListener("click", function () { if (confirm("Delete all your Connect Four statistics in this browser?")) { S.stats = {}; save(); renderStats(); } });
	}
	function bar(a) { var n = a[0] + a[1] + a[2] || 1; return '<span class="c4-bar" title="' + Math.round(a[0] * 100 / n) + '% won"><i class="bw" style="width:' + a[0] * 100 / n + '%"></i><i class="bd" style="width:' + a[1] * 100 / n + '%"></i><i class="bl" style="width:' + a[2] * 100 / n + '%"></i></span>'; }

	/* ---------- rules ---------- */
	var RULES = {
		classic: "Two players, red and yellow, take turns dropping a disc into one of the seven columns. The disc falls to the lowest empty space. The first to line up four of their own discs across, up and down, or diagonally wins; if the board fills up first it is a draw. Red goes first. With perfect play the first player wins by starting in the middle column, so play it whenever you can.",
		popout: "Like the classic game, but on your turn you may also pop out one of your OWN discs from the bottom row (press ⏏ under the column): the whole column falls down one space. If a pop makes four in a row for you, you win; if it only makes a line for the other player, they win; if it makes lines for both, the player who popped wins. The board can't fill up for good, so the game is a draw when the same position comes up three times (or after " + C.MAX_POP_MOVES + " moves).",
		misere: "Same board and moves, but making four in a row of your own colour LOSES. Keep your discs scattered and try to leave the other player only columns where any disc completes a line for them.",
		c3: "Three in a row on a 5 × 4 board. Quick and good for children; the first player has a strong advantage.",
		c5: "Five in a row on a 9 × 6 board. Four in a row means nothing here: build two lines at once so the other player can't block both.",
		c6: "Six in a row on a big 12 × 10 board.",
		"6x5": "Four in a row on a smaller board (6 columns, 5 rows).",
		"8x7": "Four in a row on an 8 × 7 board.",
		"9x7": "Four in a row on a 9 × 7 board.",
		"10x8": "Four in a row on a 10 × 8 board.",
		three: "Three players (red, then yellow, then green) take turns on a 9 × 7 board. The first to get four in a row wins. Two players can gang up on the leader, so watch every colour. Pass and play on one device."
	};
	function renderRules() {
		$("c4-rules").innerHTML = C.PRESETS.map(function (p) {
			return '<div class="c4-rule"><h3>' + p.name + "</h3><p>" + (RULES[p.id] || p.desc) + '</p><button type="button" class="c4-vb" data-play="' + p.id + '">Play this</button></div>';
		}).join("") + '<div class="c4-rule"><h3>Your own board</h3><p>Choose "Custom board…" in the Game list: 4 to 12 columns, 4 to 10 rows, a line of 3 to 7, and switch on Pop Out, misère or three players. Discs always fall to the bottom. The computer plays every one of them.</p><button type="button" class="c4-vb" data-play="custom">Make one</button></div>';
	}
	$("c4-rules").addEventListener("click", function (e) {
		var b = e.target.closest("[data-play]"); if (!b) return;
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-play"); save(); syncSetup(); showTab("play"); newGame();
		window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
	});

	/* ---------- toast / copy ---------- */
	var toastT = null;
	function toast(msg, html) { var t = $("c4-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, html ? 6000 : 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, fails: 0 };
	var API = "/api/c4";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("c4-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("c4-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("c4-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("c4-ochange").addEventListener("click", function () { showTab("play"); $("c4-game").focus(); });

	function twoPlayerCfg() {
		var c = setupCfg();
		if (!c) { toast("Fix the custom board first."); return null; }
		if (c.np !== 2) { toast("Online games are for two players: pick another game on the Play tab."); return null; }
		return c;
	}
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		var c = C.parseCode(r.g.v);
		setGame(c, r.g.moves, { keepMode: true });
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("c4-ocreate").addEventListener("click", function () {
		if (mode === "online" || mode === "hive") return toast("You are already in an online game.");
		var c = twoPlayerCfg(); if (!c) return;
		S.name = ($("c4-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: C.cfgCode(c), name: myName(), pub: $("c4-opub").checked, first: S.ofirst }).then(function (r) {
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
		mode = S.opp; newGame();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("c4-obar");
		if (mode === "hive") return renderHbar();
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="c4-dot"></span>Waiting for a player. Send them this link:</span><span class="c4-vbtns"><button type="button" class="c4-vb c4-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="c4-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="c4-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var away = g.status === "play" && st.turn !== on.seat && (g.idle || 0) > 180000;
			h = '<span><span class="c4-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b>" + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="c4-vbtns">';
			if (g.status === "play") {
				if (away) h += '<button type="button" class="c4-vb c4-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="c4-vb" data-o="resign">Resign</button>';
			} else h += '<button type="button" class="c4-vb c4-vb--main" data-o="rematch">↺ Rematch</button>';
			h += '<button type="button" class="c4-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("c4-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play Connect Four with me", text: "Join my game: " + C.describe(cfg), url: inviteLink() }).catch(function () {});
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
	function onlineMove(m) {
		var n = st.hist.length;
		on.sending = true;
		C.apply(st, m); vi = null; animFor(m);
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
		if (!prev || prev.round !== g.round || g.moves.length < st.hist.length || g.moves.slice(0, st.hist.length).join() !== st.hist.join()) {
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! You are " + C.playerName(cfg, on.seat) + " now."); }
			st = C.replay(cfg, g.moves) || C.create(cfg);
			wasOver = null;
		} else {
			for (var i = st.hist.length; i < g.moves.length; i++) {
				var m = C.mparse(g.moves[i]);
				if (!C.isLegal(st, m)) { st = C.replay(cfg, g.moves) || st; break; }
				C.apply(st, m); animFor(m);
			}
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your move!" : "They go first."));
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

	/* lobby */
	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) { loadLobby(); loadHiveLobby(); } }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
	function firstText(f) { return f === "host" ? "they go first" : f === "guest" ? "you go first" : "random start"; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("c4-lobby");
			if (r.error) { box.innerHTML = '<p class="c4-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="c4-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="c4-lob">' + list.map(function (o) {
				var c = C.parseCode(o.v);
				return '<li><span class="c4-lobn">' + esc(o.name || "Guest") + ' <span class="c4-lobv">· ' + esc(c ? C.describe(c) : o.v) + " · " + firstText(o.first) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("c4-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("c4-orefresh").addEventListener("click", loadLobby);

	/* ===================================================================== Hive games =====================================================================
	   Moves are custom_json operations (id mes_c4) signed with the player's posting key through main_js/hive.js (MESHive). The game is worked
	   out from both players' account histories with MESC4.hive.build(); /api/c4 only keeps a short list of open games. On localhost (MOCK) a
	   stand-in chain in localStorage "mes-c4:hchain" + a per-tab account (sessionStorage "mes-c4:hacct") let two tabs play with no Keychain. */
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
		function chain() { try { return JSON.parse(localStorage.getItem("mes-c4:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-c4:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-c4:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-c4:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12);
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19),
					op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-c4:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) {
				var cut = Math.floor(Date.now() / 3000);   // a block every 3 seconds: newer operations are not visible yet
				return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct));
			}
		};
	}
	function hMe() { return HA.user(); }
	function hLink(host, gid) { return location.origin + location.pathname + "?hive=" + host + "/" + gid; }
	function txLinks(trx) { return trx ? '<a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(trx) + '" target="_blank" rel="noopener">hiveblocks</a>' : ""; }

	function renderHiveCard() {
		var box = $("c4-hlogin"), me = hMe();
		$("c4-hmake").hidden = !me;
		var cc = setupCfg();
		$("c4-hvar").textContent = cc ? C.describe(cc) : "—";
		if (me) {
			box.innerHTML = '<p class="c4-hwho">Signed in as ' + (MOCK ? "" : '<img alt="" src="https://images.hive.blog/u/' + esc(me) + '/avatar/small">') + "<b>@" + esc(me) + '</b> <button type="button" class="tu-btn" id="c4-hlogout">Log out</button></p>';
			$("c4-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="c4-hrow"><input class="tu-input" id="c4-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="c4-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed (no Keychain on this local copy)." : "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them.") + "</p>";
			var go = function () {
				var b = $("c4-hlogin-b"); b.disabled = true; b.textContent = "Check Keychain…";
				HA.login($("c4-huser").value).then(function () { toast("Logged in."); }, function (e) {
					b.disabled = false; b.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test(e.message + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			$("c4-hlogin-b").addEventListener("click", go);
			$("c4-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("c4-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(true); });

	function hiveCreate() {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode === "online" || mode === "hive") return toast("Leave the game you are in first.");
		var c = twoPlayerCfg(); if (!c) return;
		var to = ($("c4-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast(to === me ? "You can't challenge yourself." : "That isn't a Hive username.");
		var obj = { a: "open", g: H.newGid(), v: C.cfgCode(c), f: S.ofirst };
		if (to) obj.to = to;
		var b = $("c4-hcreate"); b.disabled = true;
		HA.send(obj, to ? "Challenge @" + to + " to Connect Four" : "Open a Connect Four game").then(function (r) {
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
			HA.send(obj, "Join @" + host + "'s Connect Four game").then(function (r) {
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
		var R = H.build(hv.host, hv.gid, all.concat(hv.pending), now);
		var prev = hv.R;
		hv.R = R;
		if (R.cfg && (!cfg || C.cfgCode(R.cfg) !== code)) { cfg = R.cfg; code = C.cfgCode(cfg); }
		var was = st && st.win;
		var sameGame = prev && prev.open && R.open && prev.open.g === R.open.g;
		var grew = sameGame && prev.s && R.s && R.s.hist.length > prev.s.hist.length;
		st = R.s ? R.s : C.create(cfg || C.parseCode("C7x6k4"));
		if (sameGame && was) st._fin = true;
		if (grew) animFor(C.mparse(st.hist[st.hist.length - 1]));
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined. " + (R.turnAcct === hMe() ? "Your move!" : "They go first."));
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
	function hiveMove(m) {
		hiveSend({ a: "mv", h: hv.host, g: hv.gid, n: st.hist.length, m: C.mstr(m) }, "Connect Four move " + (st.hist.length + 1) + " vs @" + hiveOther()).catch(function () {});
	}
	function hiveOther() { var R = hv.R, me = hMe(); if (!R) return ""; return R.players[0] === me ? (R.players[1] || "") : (R.players[0] || R.open && R.open.to || ""); }
	function renderHbar() {
		var box = $("c4-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h, link = '<span class="c4-chain">On Hive · game <a href="https://hivehub.dev/@' + esc(hv.host) + '" target="_blank" rel="noopener">@' + esc(hv.host) + "</a>/" + esc(hv.gid) + "</span>";
		if (!R || !R.open) h = '<span><span class="c4-dot is-off"></span>Reading the game from Hive…</span><span class="c4-vbtns"><button type="button" class="c4-vb" data-h="leave">Leave</button></span>';
		else if (R.status === "wait") {
			h = '<span><span class="c4-dot"></span>' + (R.open.to ? "Waiting for @" + esc(R.open.to) + " to accept" : "Waiting for someone on Hive to join") + ".</span>" + link + '<span class="c4-vbtns">' +
				(me && me !== hv.host && (!R.open.to || R.open.to === me) ? '<button type="button" class="c4-vb c4-vb--main" data-h="join">Join this game</button>' : "") +
				'<button type="button" class="c4-vb' + (me === hv.host ? " c4-vb--main" : "") + '" data-h="copy">🔗 Copy invite link</button>' + (hv.host === me ? '<button type="button" class="c4-vb" data-h="cancel">Cancel game</button>' : "") + '<button type="button" class="c4-vb" data-h="leave">Leave</button></span>';
		} else if (R.status === "cancelled" || R.status === "expired") {
			h = "<span>This Hive game was " + (R.status === "cancelled" ? "cancelled" : "never joined (open games last an hour)") + '.</span><span class="c4-vbtns"><button type="button" class="c4-vb" data-h="leave">Close</button></span>';
		} else {
			var other = hiveOther(), mine = R.players.indexOf(me) >= 0;
			h = '<span><span class="c4-dot' + (Date.now() - hv.lastErr < 10000 ? " is-off" : "") + '"></span>' + (mine ? "Hive game vs <b>@" + esc(other) + "</b>" : "Watching <b>@" + esc(R.players[0]) + "</b> vs <b>@" + esc(R.players[1]) + "</b>") + "</span>" + link + '<span class="c4-vbtns">';
			if (R.status === "play" && mine) {
				if (R.turnAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="c4-vb c4-vb--main" data-h="claim">Claim the win (away 5 min)</button>';
				h += '<button type="button" class="c4-vb" data-h="resign">Resign</button>';
			} else if (R.status === "over" && mine) {
				if (hv.reOffer) h += '<button type="button" class="c4-vb c4-vb--main" data-h="accept">Accept @' + esc(other) + "'s rematch</button>";
				else h += '<button type="button" class="c4-vb c4-vb--main" data-h="rematch">↺ Offer a rematch</button>';
			}
			h += '<button type="button" class="c4-vb" data-h="leave">Leave</button></span>';
			if (R.status === "over" && R.trx) {
				h += '<details class="c4-trx"><summary>On the chain (' + (R.trx.moves.length + 2) + ' transactions)</summary><ul>' +
					"<li>Open: " + txLinks(R.trx.open) + "</li><li>Join: " + txLinks(R.trx.join) + "</li>" +
					R.trx.moves.map(function (t, i) { return "<li>Move " + (i + 1) + ": " + txLinks(t) + "</li>"; }).join("") +
					(R.trx.end && R.trx.moves.indexOf(R.trx.end) < 0 ? "<li>End (" + esc(R.win ? R.win.why : "") + "): " + txLinks(R.trx.end) + "</li>" : "") + "</ul></details>";
			}
		}
		box.innerHTML = h;
	}
	$("c4-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h"), R = hv.R;
		if (a === "copy") return copy(hLink(hv.host, hv.gid), "Invite link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open Connect Four game").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive game? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign Connect Four vs @" + hiveOther()).catch(function () {}); return; }
		if (a === "claim") return hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win: @" + hiveOther() + " is away").catch(function () {});
		if (a === "accept" && hv.reOffer) return hiveJoin(hv.reOffer.host, hv.reOffer.gid);
		if (a === "rematch" && R) {
			var other = hiveOther(), iWasFirst = R.players[0] === hMe();
			var obj = { a: "open", g: H.newGid(), v: R.open.v, f: iWasFirst ? "guest" : "host", to: other, re: hv.host + "/" + hv.gid };
			HA.send(obj, "Offer @" + other + " a Connect Four rematch").then(function (r) { hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]); toast("Rematch offered: @" + other + " sees an Accept button."); }, function (e2) { toast(e2.message); });
		}
	});

	/* self-reported results of games against the computer / on one device */
	$("c4-hsave").addEventListener("click", function () {
		if (!st.win) return;
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab) and press Save again on the Play tab."); return; }
		var w = st.win.p;
		if (st.win.why === "resign" || st.win.why === "timeout" || st.win.why === "left") return toast("Only games that ended on the board can be saved.");
		var obj = { a: "rec", g: H.newGid(), v: code, m: st.hist.join("."), o: mode === "cpu" ? S.lv : "local", s: mode === "cpu" ? human : -1, w: w };
		if (!H.clean(obj)) return toast("This game can't be saved (too long or a preset code).");
		var key = code + ":" + st.hist.join("."), b = this;
		b.disabled = true;
		HA.send(obj, "Save a Connect Four result (self-reported)").then(function (r) {
			S.saved[key] = r.trx || "?";
			var ks = Object.keys(S.saved); if (ks.length > 80) delete S.saved[ks[0]];
			save(); render(true);
			if (r.trx) toast("Saved on Hive: " + txLinks(r.trx), true); else toast("Saved on Hive.");
			register("hrec", { acct: me, g: obj.g });
		}, function (e) { b.disabled = false; toast(e.message); });
	});

	/* lobby + my games + recent */
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("c4-hlobby"), me = hMe();
			if (r.error) { box.innerHTML = '<p class="c4-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			if (!list.length) { box.innerHTML = '<p class="c4-sub">No open Hive games right now.' + (me ? " Make one above." : " Log in to make one.") + "</p>"; return; }
			box.innerHTML = '<ul class="c4-lob">' + list.map(function (o) {
				var c = C.parseCode(o.v);
				return '<li><span class="c4-lobn">@' + esc(o.host) + ' <span class="c4-lobv">· ' + esc(c ? C.describe(c) : o.v) + " · " + firstText(o.f) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>";
			}).join("") + "</ul>";
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 12), recs = H.records(ops).slice(0, 12), box = $("c4-hmine");
			$("c4-hminebox").hidden = !games.length && !recs.length;
			var OPP = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", expert: "Expert computer", local: "pass and play" };
			box.innerHTML = (games.length ? '<ul class="c4-lob">' + games.map(function (g) {
				var c = g.v && C.parseCode(g.v);
				return '<li><span class="c4-lobn">' + (g.role === "host" ? "You opened" + (g.to ? " (challenge to @" + esc(g.to) + ")" : "") : "You joined @" + esc(g.host)) + ' <span class="c4-lobv">· ' + (c ? esc(C.describe(c)) + " · " : "") + new Date(g.ts).toLocaleString() + " · " + txLinks(g.trx) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>';
			}).join("") + "</ul>" : "") +
			(recs.length ? '<h4 class="c4-h4">Saved results (self-reported)</h4><ul class="c4-lob">' + recs.map(function (o) {
				var c = C.parseCode(o.v), res = o.result === "w" ? "Won" : o.result === "l" ? "Lost" : o.result === "d" ? "Draw" : (o.w < 0 ? "Draw" : C.playerName(c, o.w) + " won");
				var lk = location.pathname + "?v=" + encodeURIComponent(o.v) + "&m=" + o.moves.join(".");
				return '<li><span class="c4-lobn">' + esc(res) + ' <span class="c4-lobv">· ' + esc(C.describe(c)) + " · vs " + esc(OPP[o.o] || o.o) + " · " + o.moves.length + " moves · " + new Date(o.ts).toLocaleString() + " · " + txLinks(o.trx) + '</span></span><a class="tu-btn" href="' + esc(lk) + '">Replay</a></li>';
			}).join("") + "</ul>" : "");
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("c4-hrecent");
			if (!r || r.error || (!(r.games || []).length && !(r.recs || []).length)) { box.innerHTML = '<p class="c4-sub">' + (r && r.error ? esc(r.error) : "Nothing yet.") + "</p>"; return; }
			box.innerHTML = '<ul class="c4-lob">' + (r.games || []).map(function (o) {
				var c = C.parseCode(o.v);
				return '<li><span class="c4-lobn">@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="c4-lobv">· ' + esc(c ? C.describe(c) : o.v) + " · started " + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>';
			}).join("") + (r.recs || []).map(function (o) {
				var c = C.parseCode(o.v);
				return '<li><span class="c4-lobn">@' + esc(o.acct) + " saved a result" + ' <span class="c4-lobv">· ' + esc(c ? C.describe(c) : o.v) + " · " + esc(o.res) + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>";
			}).join("") + "</ul>";
		});
	}
	$("c4-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		var p = b.getAttribute("data-hjoin").split("/");
		var watching = mode === "hive" && hv.host === p[0] && hv.gid === p[1];
		if (watching && !(hMe() && hv.R && hv.R.status === "wait" && hv.host !== hMe())) return showTab("play");
		if (mode === "online") return toast("Leave the guest game first.");
		if (hMe()) hiveJoin(p[0], p[1]); else { hiveEnter(p[0], p[1], []); }
	});
	$("c4-hcreate").addEventListener("click", hiveCreate);
	$("c4-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* in-browser stand-in for /api/c4 (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-c4:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-c4:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, names: g.names, moves: g.moves, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, idle: now - g.at }; };
		if (method === "GET" && /hlobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return !g.joiners.length && !g.cancelled && !g.to && now - g.ts < 3600000; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, f: g.f, age: now - g.ts }; }) };
		if (method === "GET" && /hrecent/.test(query)) return { games: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.joiners.length; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, guest: g.joiners[0], age: now - g.ts }; }), recs: (db._recs || []).map(function (o) { return { acct: o.acct, v: o.v, res: o.res, trx: o.trx, age: now - o.ts }; }) };
		if (method === "GET" && /hg=/.test(query)) { var hk = "h:" + decodeURIComponent((/hg=([^&]+)/.exec(query) || [])[1] || ""); return { joiners: db[hk] ? db[hk].joiners : [] }; }
		if (method === "POST" && b.act === "hrec") {
			return HA.ops(b.acct).then(function (ops) {
				var rec = H.records(ops).filter(function (o) { return o.g === b.g; })[0];
				if (!rec) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-c4:mock") || "{}"); } catch (e) { db2 = {}; }
				db2._recs = [{ acct: b.acct, v: rec.v, res: rec.w < 0 ? "draw" : C.playerName(C.parseCode(rec.v), rec.w) + " won", trx: rec.trx, ts: rec.ts }].concat(db2._recs || []).slice(0, 20);
				localStorage.setItem("mes-c4:mock", JSON.stringify(db2));
				return { ok: true };
			});
		}
		if (method === "POST" && /^h(open|join|cancel)$/.test(b.act)) {
			var who = b.act === "hjoin" ? b.acct : b.host, want = b.act.slice(1);
			return HA.ops(who).then(function (ops) {
				var op = ops.filter(function (o) { return o.a === want && o.g === b.g && (want === "open" || o.h === b.host); })[0];
				if (!op) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-c4:mock") || "{}"); } catch (e) { db2 = {}; }
				var k2 = "h:" + b.host + "/" + b.g;
				if (want === "open") db2[k2] = db2[k2] || { host: b.host, g: b.g, v: op.v, f: op.f, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
				else if (db2[k2]) { if (want === "join" && db2[k2].joiners.indexOf(who) < 0) db2[k2].joiners.push(who); if (want === "cancel") db2[k2].cancelled = true; }
				localStorage.setItem("mes-c4:mock", JSON.stringify(db2));
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
			var c = C.parseCode(b.v); if (!c || c.np !== 2) return { error: "Unknown game." };
			var nid = Math.random().toString(36).slice(2, 10), key = Math.random().toString(36).slice(2), hs = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0;
			var names = [null, null], tok = [null, null]; names[hs] = b.name; tok[hs] = key;
			db[nid] = { id: nid, v: b.v, names: names, tok: tok, moves: [], status: "wait", win: null, round: 0, pub: !!b.pub, first: b.first, created: now, at: now };
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
			var m = C.mparse(b.m); if (!C.isLegal(s, m)) return { error: "That move isn't allowed." };
			C.apply(s, m); g.moves.push(b.m); g.at = now;
			if (s.win) { g.status = "over"; g.win = { p: s.win.p, why: s.win.why }; }
			put(); return { g: pub(g) };
		}
		if (b.act === "resign" || b.act === "leave") { if (g.status === "play") { g.status = "over"; g.win = { p: 1 - seat, why: b.act === "leave" ? "left" : "resign" }; } g.at = now; put(); return { g: pub(g) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		if (b.act === "claim") { g.status = "over"; g.win = { p: seat, why: "timeout" }; put(); return { g: pub(g) }; }
		if (b.act === "rematch") {
			if (g.status !== "over") return { error: "Finish this game first." };
			g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]]; g.moves = []; g.status = "play"; g.win = null; g.round++; g.at = now; put();
			return { g: pub(g) };
		}
		return { error: "Unknown action." };
	}
	if (MOCK) $("c4-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	syncSetup();
	renderRules();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qh = q.get("hive"), qv = q.get("v") || q.get("g");
	if (joinId || qh || qv) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	function blank() { cfg = setupCfg() || C.parseCode("C7x6k4"); code = C.cfgCode(cfg); st = C.create(cfg); mode = effOpp(); render(); }
	function adoptCfg(c) {
		var p = C.presetByCode(C.cfgCode(c));
		if (p) S.game = p.id; else { S.game = "custom"; S.custom = { w: c.w, h: c.h, k: c.k, pop: c.pop, mis: c.mis, three: c.np === 3 }; }
	}
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
		adoptCfg(c0);
		S.online = null; S.hive = null;
		save(); syncSetup();
		var s0 = C.replay(c0, mv);
		cfg = c0;
		mode = effOpp();
		setGame(c0, s0 ? mv : [], { human: s0 ? s0.turn % 2 : 0 });
		toast(s0 && mv.length ? "Position loaded from the link." : "Game loaded from the link.");
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
			adoptCfg(cc);
			cfg = cc;
			mode = S.cur.mode === "local" || cc.np === 3 ? "local" : "cpu";
			if (cc.np === 2) S.opp = mode;
			syncSetup();
			setGame(cc, S.cur.moves, { human: S.cur.human || 0, keepMode: true });
		} else newGame();
	}
	// for testing in a hidden pane: window.MESC4Debug.state()
	window.MESC4Debug = { state: function () { return { code: code, moves: st.hist.slice(), win: st.win, mode: mode, turn: st.turn, busy: busy, human: human, hive: hv.R ? { status: hv.R.status, players: hv.R.players } : null }; }, move: function (str) { humanMove(C.mparse(str)); } };
})();
