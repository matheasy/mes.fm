/* MES Tic-Tac-Toe: the page (setup, board, computer, replay, online games via /api/ttt, statistics, rules).
   The same served file is also started as a Web Worker that runs the computer's thinking (see the top).
   Online: /api/ttt on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in
   localStorage "mes-ttt:mock" is used instead, so two tabs of the page can play each other. */
(function () {
	"use strict";
	var T = (typeof self !== "undefined" ? self : window).MESTTT;

	function compute(q) {
		var s = T.replay(T.parseCode(q.code), q.moves);
		if (!s) return null;
		var r = T.think(s, q.level, { ms: q.ms });
		return r ? { m: T.mstr(r.m), how: r.how } : null;
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
	var root = document.getElementById("tt");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-tic-tac-toe:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/* ---------- saved settings ---------- */
	var S = { game: "classic", custom: { w: 5, h: 5, d: 1, k: 4, g: false, m: false, x: false }, opp: "cpu", lv: "medium", me: "first", alt: 0,
		name: "", ofirst: "host", opub: true, cur: null, stats: {}, online: null, orec: {} };
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
			worker.postMessage({ id: id, code: q.code, moves: q.moves, level: q.level, ms: q.ms });
		});
	}

	/* ---------- game state ---------- */
	var cfg, code, st, mode = "cpu", human = 0, vi = null, busy = false, gen = 0, hint = null, cur = -1, kbd = false;
	var sel = { sym: 0, num: 0 };
	var score = { w: 0, d: 0, l: 0, a: 0, b: 0 };
	var LV_MS = { easy: 300, medium: 400, hard: 1100 };

	function setupCfg() {
		if (S.game === "custom") {
			var c = S.custom;
			return T.parseCode(T.cfgCode({ t: "line", w: +c.w, h: +c.h, d: +c.d || 1, k: +c.k, mis: !!c.m, grav: !!c.g, wild: !!c.x }));
		}
		var p = T.preset(S.game) || T.PRESETS[0];
		return T.parseCode(p.code);
	}
	function setGame(newCfg, moves, opts) {
		opts = opts || {};
		cfg = newCfg; code = T.cfgCode(cfg);
		st = T.replay(cfg, moves || []) || T.create(cfg);
		vi = null; hint = null; busy = false; gen++; cur = -1;
		sel.sym = 0; sel.num = 0;
		if (!opts.keepMode) mode = S.opp;
		if (opts.human !== undefined) human = opts.human;
		storeCur();
		render();
		maybeCpu();
	}
	function newGame() {
		if (mode === "online") return toast("Leave the online game first (button above the board).");
		var c = setupCfg();
		if (!c) return toast("That board doesn't work: check the custom settings.");
		mode = S.opp;
		if (mode === "cpu") {
			if (S.me === "first") human = 0;
			else if (S.me === "second") human = 1;
			else { human = S.alt % 2; S.alt++; }
		}
		setGame(c, [], { human: human });
	}
	function storeCur() {
		if (mode === "online") return;
		S.cur = { code: code, moves: st.hist.slice(), mode: mode, human: human, done: !!st.win };
		save();
	}
	function viewState() { return vi === null ? st : T.replay(cfg, st.hist.slice(0, vi)); }
	function isHumanTurn() {
		if (mode === "local") return true;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		return false;
	}
	function canInput() { return !st.win && vi === null && !busy && isHumanTurn() && !(mode === "online" && on.sending); }

	/* ---------- the computer ---------- */
	function maybeCpu() {
		if (mode !== "cpu" || st.win || st.turn === human || busy) return;
		busy = true;
		var g = gen, t0 = Date.now();
		render();
		ask({ code: code, moves: st.hist.slice(), level: S.lv, ms: LV_MS[S.lv] }).then(function (r) {
			var wait = Math.max(0, (S.lv === "hard" ? 250 : 450) - (Date.now() - t0));
			setTimeout(function () {
				if (g !== gen) return;
				busy = false;
				var m = r && T.mparse(r.m);
				if (!m || !T.isLegal(st, m)) { var L = T.legal(st); m = L[(Math.random() * L.length) | 0]; }
				if (m) commit(m);
			}, wait);
		});
	}

	/* ---------- moves ---------- */
	function buildMove(i) {
		var c = cfg, m = { c: i };
		if (c.t === "line" && c.grav) { var g = T.geo(c); m.c = T.dropCell(st, i % g.w); if (m.c < 0) return null; }
		if ((c.t === "line" && c.wild) || c.t === "oc") m.s = sel.sym;
		if (c.t === "num") {
			var mine = T.numbersOf(st.turn).filter(function (v) { return !(st.used & (1 << v)); });
			if (mine.indexOf(sel.num) < 0) sel.num = mine[0];
			m.n = sel.num;
		}
		return m;
	}
	function humanMove(i) {
		if (!canInput()) {
			if (vi !== null) toast("You are looking back at an earlier move: press ⏭ to return.");
			return;
		}
		var m = buildMove(i);
		if (!m || !T.isLegal(st, m)) {
			if (cfg.t === "ult" && st.cells[i] < 0) toast(st.next >= 0 ? "You have to play in the highlighted board." : "That board is already decided.");
			else if (cfg.t === "notakto" && st.dead[(i / 9) | 0]) toast("That board is dead: play on another one.");
			else if (cfg.grav) toast("That column is full.");
			return;
		}
		if (mode === "online") return onlineMove(m);
		commit(m);
	}
	function commit(m) {
		T.apply(st, m);
		vi = null; hint = null;
		if (cfg.t === "num") sel.num = 0;
		storeCur();
		render(true);
		if (st.win) finish(); else maybeCpu();
	}
	function finish() {
		if (st._fin) return;
		st._fin = true;
		var w = st.win, msg;
		if (mode === "local") {
			if (w.p < 0) score.d++; else if (w.p === 0) score.a++; else score.b++;
			msg = w.p < 0 ? "Draw." : T.playerName(cfg, w.p) + " wins!";
		} else {
			var me = mode === "cpu" ? human : on.seat, res = w.p < 0 ? "d" : w.p === me ? "w" : "l";
			score[res]++;
			var key = code + "|" + (mode === "cpu" ? S.lv : "online");
			var rec = true;
			if (mode === "online") { var tag = on.id + ":" + (on.g ? on.g.round : 0); if (S.orec[tag]) rec = false; else S.orec[tag] = 1; pruneOrec(); }
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
		if (mode === "online" || busy || !st.hist.length) return;
		var h = st.hist.slice();
		if (mode === "cpu") {
			h.pop();
			var t = T.replay(cfg, h);
			while (h.length && t && t.turn !== human) { h.pop(); t = T.replay(cfg, h); }
			if (!t || t.turn !== human) { // the computer moved first and nothing of mine to undo
				if (!h.length && human === 1) { setGame(cfg, [], { human: human, keepMode: true }); return; }
			}
		} else h.pop();
		gen++; busy = false;
		setGame(cfg, h, { human: human, keepMode: true });
	}
	function doHint() {
		if (!canInput()) return;
		var g = gen;
		$("tt-hint").disabled = true;
		ask({ code: code, moves: st.hist.slice(), level: "hard", ms: 700 }).then(function (r) {
			$("tt-hint").disabled = false;
			if (g !== gen || !r) return;
			var m = T.mparse(r.m);
			hint = m.c;
			if (m.s !== undefined) sel.sym = m.s;
			if (m.n) sel.num = m.n;
			render();
			var desc = m.s !== undefined ? " (play " + (m.s ? "O" : "X") + ")" : m.n ? " (play " + m.n + ")" : "";
			toast("Hint: the orange cell" + desc + ".");
			setTimeout(function () { if (hint === m.c && g === gen) { hint = null; render(); } }, 3500);
		});
	}

	/* ---------- board layout ---------- */
	function wideView() { return (root.clientWidth || 800) >= 640 || $("tt-view").classList.contains("tt-fill"); }
	/** cells: [{i, x, y, s, gx, gy}] in SVG units, plus width / height and per-board frames */
	function layout() {
		var c = cfg, cells = [], frames = [], W, H, S0 = 100, i, x, y;
		if (c.t === "line" || c.t === "oc" || c.t === "num") {
			var g = T.geo(c);
			if (g.d === 1) {
				for (i = 0; i < g.N; i++) { x = i % g.w; y = (i / g.w) | 0; cells.push({ i: i, x: x * S0, y: y * S0, s: S0, gx: x, gy: y }); }
				W = g.w * S0; H = g.h * S0;
			} else {
				var cols = wideView() ? g.d : 2, gap = 50, top = 34, lw = g.w * S0, lh = g.h * S0;
				for (var z = 0; z < g.d; z++) {
					var lc = z % cols, lr = (z / cols) | 0, ox = lc * (lw + gap), oy = lr * (lh + gap + top) + top;
					frames.push({ x: ox, y: oy, w: lw, h: lh, label: "Layer " + (z + 1), lx: ox + lw / 2, ly: oy - 10 });
					for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) {
						i = z * g.w * g.h + y * g.w + x;
						cells.push({ i: i, x: ox + x * S0, y: oy + y * S0, s: S0, gx: lc * (g.w + 1) + x, gy: lr * (g.h + 1) + y });
					}
				}
				var rows = Math.ceil(g.d / cols);
				W = cols * lw + (cols - 1) * gap; H = rows * (lh + top) + (rows - 1) * gap;
			}
		} else if (c.t === "ult") {
			var gp = 26;
			for (var b = 0; b < 9; b++) {
				var bx = (b % 3) * (3 * S0 + gp), by = ((b / 3) | 0) * (3 * S0 + gp);
				frames.push({ x: bx, y: by, w: 3 * S0, h: 3 * S0, b: b });
				for (var ci = 0; ci < 9; ci++) cells.push({ i: b * 9 + ci, x: bx + (ci % 3) * S0, y: by + ((ci / 3) | 0) * S0, s: S0, gx: (b % 3) * 3 + ci % 3, gy: ((b / 3) | 0) * 3 + ((ci / 3) | 0) });
			}
			W = H = 9 * S0 + 2 * gp;
		} else if (c.t === "notakto") {
			var nc = Math.min(c.nb, wideView() ? 5 : 3), gp2 = 50;
			for (var n = 0; n < c.nb; n++) {
				var ox2 = (n % nc) * (3 * S0 + gp2), oy2 = ((n / nc) | 0) * (3 * S0 + gp2);
				frames.push({ x: ox2, y: oy2, w: 3 * S0, h: 3 * S0, b: n });
				for (var cj = 0; cj < 9; cj++) cells.push({ i: n * 9 + cj, x: ox2 + (cj % 3) * S0, y: oy2 + ((cj / 3) | 0) * S0, s: S0, gx: (n % nc) * 4 + cj % 3, gy: ((n / nc) | 0) * 4 + ((cj / 3) | 0) });
			}
			W = nc * 3 * S0 + (nc - 1) * gp2; var nr = Math.ceil(c.nb / nc); H = nr * 3 * S0 + (nr - 1) * gp2;
		}
		var byI = {};
		cells.forEach(function (o) { byI[o.i] = o; });
		return { W: W, H: H, cells: cells, frames: frames, byI: byI };
	}
	function pieceX(o, cls) {
		var p = o.s * 0.24, a = o.x + p, b = o.y + p, e = o.x + o.s - p, f = o.y + o.s - p, sw = o.s * 0.11;
		return '<path class="' + (cls || "tt-x") + '" stroke-width="' + sw + '" d="M' + a + " " + b + "L" + e + " " + f + "M" + e + " " + b + "L" + a + " " + f + '"/>';
	}
	function pieceO(o) { return '<circle class="tt-o" stroke-width="' + o.s * 0.1 + '" cx="' + (o.x + o.s / 2) + '" cy="' + (o.y + o.s / 2) + '" r="' + o.s * 0.29 + '"/>'; }

	function drawBoard(s, popCell) {
		var c = cfg, Lo = layout(), out = [], pad = 8, live = canInput();
		var legalSet = {};
		if (live) T.legal(s).forEach(function (m) { legalSet[m.c] = 1; });
		var winSet = {};
		if (s.win && s.win.line && !s.win.sub) s.win.line.forEach(function (i) { winSet[i] = 1; });
		out.push('<rect class="tt-bgr" x="' + (-pad) + '" y="' + (-pad) + '" width="' + (Lo.W + 2 * pad) + '" height="' + (Lo.H + 2 * pad) + '" rx="12"/>');
		var gw = c.t === "line" && c.grav ? T.geo(c).w : 0, cols = {};
		Lo.cells.forEach(function (o) {
			var v = s.cells[o.i], cls = "tt-c";
			var dead = c.t === "notakto" && s.dead[(o.i / 9) | 0];
			if (dead) cls += " is-dead";
			else if (winSet[o.i]) cls += " is-win";
			else if (hint === o.i) cls += " is-hint";
			else if (o.i === s.last) cls += " is-last";
			if (!live || (v >= 0) || (!legalSet[o.i] && !gw)) cls += " is-off";
			var r = '<rect class="' + cls + '" data-i="' + o.i + '" x="' + o.x + '" y="' + o.y + '" width="' + o.s + '" height="' + o.s + '"/>';
			if (gw) { var col = o.i % gw; (cols[col] = cols[col] || []).push(r); } else out.push(r);
		});
		if (gw) Object.keys(cols).forEach(function (col) { out.push('<g class="tt-col">' + cols[col].join("") + "</g>"); });
		// frames: thick lines round small boards, the boards you may play in, won boards
		Lo.frames.forEach(function (f) {
			if (f.label) out.push('<text class="tt-lbl" x="' + f.lx + '" y="' + f.ly + '">' + f.label + "</text>");
			out.push('<rect class="tt-sub" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="4"/>');
		});
		// pieces
		Lo.cells.forEach(function (o) {
			var v = s.cells[o.i];
			if (v < 0) return;
			var pc;
			if (c.t === "num") pc = '<text class="tt-num p' + (v % 2 ? 0 : 1) + '" x="' + (o.x + o.s / 2) + '" y="' + (o.y + o.s / 2 + 2) + '" font-size="' + o.s * 0.56 + '">' + v + "</text>";
			else if (c.t === "notakto") pc = pieceX(o, "tt-xn");
			else pc = v === 0 ? pieceX(o) : pieceO(o);
			if (o.i === popCell) pc = '<g class="tt-pop">' + pc + "</g>";
			out.push(pc);
		});
		if (c.t === "ult") {
			Lo.frames.forEach(function (f) {
				var sv = s.sub[f.b];
				if (sv === 2) out.push('<rect class="tt-drawn" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="4"/>');
				else if (sv >= 0) {
					var big = { x: f.x, y: f.y, s: f.w };
					out.push('<rect class="tt-bgr" opacity="0.72" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '"/>');
					out.push('<g class="tt-big">' + (sv === 0 ? pieceX(big) : pieceO(big)) + "</g>");
				}
				if (live && sv < 0 && (s.next < 0 || s.next === f.b)) out.push('<rect class="tt-okframe" x="' + (f.x - 4) + '" y="' + (f.y - 4) + '" width="' + (f.w + 8) + '" height="' + (f.h + 8) + '" rx="8"/>');
				if (s.win && s.win.sub && s.win.line.indexOf(f.b) >= 0) out.push('<rect class="tt-okframe" style="stroke:var(--tt-win)" x="' + (f.x - 4) + '" y="' + (f.y - 4) + '" width="' + (f.w + 8) + '" height="' + (f.h + 8) + '" rx="8"/>');
			});
		}
		// win line through the cells (flat boards)
		if (s.win && s.win.line && !s.win.sub && c.t !== "notakto") {
			var a = Lo.byI[s.win.line[0]], e = Lo.byI[s.win.line[s.win.line.length - 1]];
			var flat = cfg.t !== "line" || T.geo(cfg).d === 1;
			if (a && e && flat) {
				var d = 'x1="' + (a.x + a.s / 2) + '" y1="' + (a.y + a.s / 2) + '" x2="' + (e.x + e.s / 2) + '" y2="' + (e.y + e.s / 2) + '"';
				out.push("<line class=\"tt-wl\" " + d + "/><line class=\"tt-wl2\" " + d + "/>");
			}
		}
		if (kbd && cur >= 0 && Lo.byI[cur]) { var q = Lo.byI[cur]; out.push('<rect class="tt-cur" x="' + (q.x + 4) + '" y="' + (q.y + 4) + '" width="' + (q.s - 8) + '" height="' + (q.s - 8) + '" rx="8"/>'); }
		var bd = $("tt-board");
		bd.classList.toggle("is-wide", Lo.W > Lo.H * 1.25);
		bd.innerHTML = '<svg viewBox="' + (-pad) + " " + (-pad) + " " + (Lo.W + 2 * pad) + " " + (Lo.H + 2 * pad) + '" role="img" aria-label="' + esc(boardLabel(s)) + '">' + out.join("") + "</svg>";
		bd._lo = Lo;
	}
	function boardLabel(s) {
		var n = 0; for (var i = 0; i < s.cells.length; i++) if (s.cells[i] >= 0) n++;
		return T.describe(cfg) + " board, " + n + " pieces placed";
	}

	/* ---------- render ---------- */
	function nameOf(p) {
		var base = T.playerName(cfg, p);
		if (mode === "cpu") return (p === human ? "You" : "Computer") + " (" + base + ")";
		if (mode === "online" && on.g) { var nm = on.g.names[p] || "waiting…"; return (p === on.seat ? "You" : esc(nm)) + " (" + base + ")"; }
		return base;
	}
	function youAre(p) { return (mode === "cpu" && p === human) || (mode === "online" && p === on.seat); }
	function sym(p) { var cls = cfg.t === "notakto" || cfg.t === "num" ? "" : (p === 0 ? "tt-sx" : "tt-so"); return '<span class="' + cls + '">' + nameOf(p) + "</span>"; }
	function statusText(s) {
		if (mode === "online" && on.g && on.g.status === "wait") return "Waiting for someone to join…";
		if (s.win) {
			var why = { resign: " (resigned)", timeout: " (the other player ran out of time)", left: " (the other player left)" }[s.win.why] || "";
			if (s.win.p < 0) return s.win.why === "full" ? "Draw: the board is full." : "Draw.";
			var W = function (p) { return youAre(p) ? "<b>You win</b>" : sym(p) + " wins"; };
			if (why) return W(s.win.p) + why + ".";
			if (cfg.t === "oc") return s.win.p === 0 ? W(0) + ": five in a row!" : W(1) + ": the board filled up with no five in a row.";
			if (cfg.t === "notakto") return W(s.win.p) + ": " + (youAre(1 - s.win.p) ? "you" : mode === "cpu" ? "the computer" : "the other player") + " killed the last board.";
			if (cfg.t === "line" && cfg.mis && s.win.why === "line-lose") return W(s.win.p) + ": " + (youAre(1 - s.win.p) ? "you" : mode === "cpu" ? "the computer" : "the other player") + " made a line.";
			if (youAre(s.win.p)) return '<span class="' + (cfg.t === "notakto" || cfg.t === "num" ? "" : s.win.p === 0 ? "tt-sx" : "tt-so") + '">You win' + why + "!</span> 🎉";
			return sym(s.win.p) + " wins" + why + "!";
		}
		if (vi !== null) return "Looking back: move " + vi + " of " + st.hist.length + ".";
		if (busy) return "The computer is thinking…";
		var t = sym(s.turn) + (mode === "cpu" && !isHumanTurn() ? " is thinking…" : " to play");
		if (cfg.t === "ult") t += s.next >= 0 ? " in the green board." : " anywhere (green boards).";
		else if (cfg.t === "num") t += ": choose a number below, then a cell.";
		else if ((cfg.t === "line" && cfg.wild) || cfg.t === "oc") t += ": choose X or O, then a cell.";
		else if (cfg.grav) t += ": click a column.";
		return t;
	}
	function renderPick(s) {
		var box = $("tt-pick"), live = !s.win && vi === null;
		if ((cfg.t === "line" && cfg.wild) || cfg.t === "oc") {
			box.hidden = false;
			box.innerHTML = '<span class="tt-pl">Place:</span><button type="button" class="tt-pk tt-sx" data-sym="0" aria-pressed="' + (sel.sym === 0) + '">X</button><button type="button" class="tt-pk tt-so" data-sym="1" aria-pressed="' + (sel.sym === 1) + '">O</button>';
		} else if (cfg.t === "num") {
			box.hidden = false;
			var p = s.turn, all = T.numbersOf(p), mine = all.filter(function (v) { return !(s.used & (1 << v)); });
			if (mine.indexOf(sel.num) < 0) sel.num = mine[0] || 0;
			box.innerHTML = '<span class="tt-pl">' + (p === 0 ? "Odd" : "Even") + " numbers:</span>" + all.map(function (v) {
				var used = mine.indexOf(v) < 0;
				return '<button type="button" class="tt-pk ' + (p === 0 ? "tt-sx" : "tt-so") + '" data-num="' + v + '" aria-pressed="' + (v === sel.num && !used) + '"' + (used || !live ? " disabled" : "") + ">" + v + "</button>";
			}).join("");
		} else box.hidden = true;
	}
	function renderMoves() {
		var ol = $("tt-moves"), h = st.hist, at = vi === null ? h.length : vi;
		ol.innerHTML = h.map(function (mv, i) {
			var m = T.mparse(mv), lab = cellName(m);
			return '<li><button type="button" data-mi="' + (i + 1) + '" class="m' + (i % 2) + (i + 1 === at ? " is-cur" : "") + '">' + (i + 1) + ". " + lab + "</button></li>";
		}).join("");
		$("tt-rpos").textContent = h.length ? (at === h.length ? "Move " + at + " (now)" : "Move " + at + " of " + h.length) : "No moves yet";
		var bs = root.querySelectorAll("[data-r]");
		for (var i = 0; i < bs.length; i++) { var r = bs[i].getAttribute("data-r"); bs[i].disabled = r === "first" || r === "prev" ? at === 0 : at === h.length; }
		var li = ol.querySelector(".is-cur");
		if (li && ol.scrollHeight > ol.clientHeight) li.scrollIntoView({ block: "nearest" });
	}
	function cellName(m) {
		var c = cfg, i = m.c, s = "";
		if (c.t === "ult") s = "B" + ((i / 9 | 0) + 1) + "·" + (i % 9 + 1);
		else if (c.t === "notakto") s = (c.nb > 1 ? "B" + ((i / 9 | 0) + 1) + "·" : "") + (i % 9 + 1);
		else {
			var g = T.geo(c), x = i % g.w, y = ((i / g.w) | 0) % g.h, z = (i / (g.w * g.h)) | 0;
			s = String.fromCharCode(97 + x) + (g.h - y) + (g.d > 1 ? "·L" + (z + 1) : "");
		}
		if (m.s !== undefined) s += (m.s ? " O" : " X");
		if (m.n) s += " = " + m.n;
		return s;
	}
	function renderScore() {
		var el = $("tt-score");
		if (mode === "local") el.innerHTML = "This session: <span><b>" + score.a + "</b> " + T.playerName(cfg, 0) + "</span><span><b>" + score.b + "</b> " + T.playerName(cfg, 1) + "</span><span><b>" + score.d + "</b> draws</span>";
		else el.innerHTML = "This session: <span><b>" + score.w + "</b> won</span><span><b>" + score.d + "</b> drawn</span><span><b>" + score.l + "</b> lost</span>";
	}
	function render(pop) {
		var s = viewState();
		root.classList.toggle("tt-incpu", S.opp === "cpu");
		$("tt-status").innerHTML = statusText(s);
		renderPick(s);
		drawBoard(s, pop && vi === null ? s.last : -1);
		renderMoves();
		renderScore();
		var on1 = mode === "online";
		$("tt-undo").disabled = on1 || busy || !st.hist.length;
		$("tt-hint").disabled = !canInput();
		$("tt-undo").hidden = on1;
		$("tt-new").hidden = on1;
		$("tt-link").hidden = on1 && !st.win;
		renderObar();
		setupLock();
	}

	/* ---------- setup controls ---------- */
	function fillGameSelect() {
		var sel1 = $("tt-game"), groups = {}, order = [];
		T.PRESETS.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
		sel1.innerHTML = order.map(function (gname) {
			return '<optgroup label="' + gname + '">' + groups[gname].map(function (p) { return '<option value="' + p.id + '">' + p.name + "</option>"; }).join("") + "</optgroup>";
		}).join("") + '<optgroup label="Your own"><option value="custom">Custom board…</option></optgroup>';
		sel1.value = T.preset(S.game) || S.game === "custom" ? S.game : "classic";
	}
	function syncSetup() {
		$("tt-game").value = S.game;
		$("tt-custom").hidden = S.game !== "custom";
		var c = S.custom;
		$("tt-cw").value = c.w; $("tt-ch").value = c.h; $("tt-cd").value = c.d; $("tt-ck").value = c.k;
		$("tt-cg").checked = !!c.g; $("tt-cm").checked = !!c.m; $("tt-cx").checked = !!c.x;
		segSet("tt-opp", S.opp); segSet("tt-lv", S.lv); segSet("tt-me", S.me); segSet("tt-ofirst", S.ofirst);
		var p = T.preset(S.game), cc = setupCfg();
		$("tt-desc").textContent = p ? p.desc : cc ? "Your board: " + T.describe(cc) + "." : "";
		$("tt-cnote").textContent = S.game === "custom" && !cc ? customProblem() : "";
		$("tt-ovar").textContent = cc ? T.describe(cc) : "—";
		$("tt-name").value = S.name || "";
		$("tt-opub").checked = S.opub !== false;
	}
	function customProblem() {
		var c = S.custom;
		if (+c.k > Math.max(+c.w, +c.h, +c.d)) return "The line can't be longer than the board.";
		if (+c.d > 1 && c.g) return "Gravity only works on flat boards (1 layer).";
		if (+c.d > 1 && (+c.w > 6 || +c.h > 6)) return "3D boards can be at most 6 × 6 per layer.";
		return "Width and height 3 to 19, layers 1 to 4, line 3 to 7.";
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === v ? "true" : "false"); }
	function segWire(id, fn) {
		$(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); });
	}
	function setupLock() {
		var lock = mode === "online", els = $("tt-setup").querySelectorAll("select, input, button");
		for (var i = 0; i < els.length; i++) els[i].disabled = lock;
	}
	fillGameSelect();
	$("tt-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("tt-opp", function (v) { S.opp = v; save(); newGame(); });
	segWire("tt-lv", function (v) { S.lv = v; save(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next move."); render(); });
	segWire("tt-me", function (v) { S.me = v; save(); newGame(); });
	segWire("tt-ofirst", function (v) { S.ofirst = v; save(); });
	var custT = null;
	["tt-cw", "tt-ch", "tt-cd", "tt-ck", "tt-cg", "tt-cm", "tt-cx"].forEach(function (id) {
		$(id).addEventListener(id === "tt-cg" || id === "tt-cm" || id === "tt-cx" ? "change" : "input", function () {
			S.custom = { w: clampN($("tt-cw").value, 3, 19, 5), h: clampN($("tt-ch").value, 3, 19, 5), d: clampN($("tt-cd").value, 1, 4, 1), k: clampN($("tt-ck").value, 3, 7, 4),
				g: $("tt-cg").checked, m: $("tt-cm").checked, x: $("tt-cx").checked };
			save();
			var cc = setupCfg();
			$("tt-cnote").textContent = cc ? "" : customProblem();
			$("tt-desc").textContent = cc ? "Your board: " + T.describe(cc) + "." : "";
			$("tt-ovar").textContent = cc ? T.describe(cc) : "—";
			clearTimeout(custT);
			if (cc) custT = setTimeout(newGame, 450);
		});
	});
	function clampN(v, a, b, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(a, Math.min(b, v)); }

	/* ---------- board events ---------- */
	var board = $("tt-board");
	board.addEventListener("click", function (e) {
		var r = e.target.closest("[data-i]");
		if (!r) return;
		kbd = false;
		var i = +r.getAttribute("data-i");
		cur = i;
		humanMove(i);
	});
	board.addEventListener("keydown", function (e) {
		var Lo = board._lo; if (!Lo) return;
		var dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		if (dirs[e.key]) {
			e.preventDefault(); kbd = true;
			if (cur < 0 || !Lo.byI[cur]) { var mid = Lo.cells[(Lo.cells.length / 2) | 0]; cur = mid.i; }
			else {
				var o = Lo.byI[cur], d = dirs[e.key], best = null, bd = Infinity;
				Lo.cells.forEach(function (q) {
					var dx = q.gx - o.gx, dy = q.gy - o.gy;
					if (d[0] && (Math.sign(dx) !== d[0] || Math.abs(dy) > Math.abs(dx))) return;
					if (d[1] && (Math.sign(dy) !== d[1] || Math.abs(dx) > Math.abs(dy))) return;
					var dist = dx * dx + dy * dy * 1.01 + (d[0] ? dy * dy * 3 : dx * dx * 3);
					if (dist > 0 && dist < bd) { bd = dist; best = q; }
				});
				if (best) cur = best.i;
			}
			render();
		} else if ((e.key === "Enter" || e.key === " ") && cur >= 0) { e.preventDefault(); kbd = true; humanMove(cur); }
	});
	board.addEventListener("blur", function () { if (kbd) { kbd = false; render(); } });
	$("tt-pick").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b || b.disabled) return;
		if (b.hasAttribute("data-sym")) sel.sym = +b.getAttribute("data-sym");
		if (b.hasAttribute("data-num")) sel.num = +b.getAttribute("data-num");
		render();
	});
	$("tt-new").addEventListener("click", newGame);
	$("tt-undo").addEventListener("click", undo);
	$("tt-hint").addEventListener("click", doHint);
	root.querySelector(".tt-rbtns").addEventListener("click", function (e) {
		var b = e.target.closest("[data-r]"); if (!b) return;
		var n = st.hist.length, at = vi === null ? n : vi, r = b.getAttribute("data-r");
		at = r === "first" ? 0 : r === "prev" ? at - 1 : r === "next" ? at + 1 : n;
		vi = at >= n ? null : Math.max(0, at);
		render();
	});
	$("tt-moves").addEventListener("click", function (e) {
		var b = e.target.closest("[data-mi]"); if (!b) return;
		var at = +b.getAttribute("data-mi");
		vi = at >= st.hist.length ? null : at;
		render();
	});
	$("tt-link").addEventListener("click", function () {
		var at = vi === null ? st.hist.length : vi;
		var url = location.origin + location.pathname + "?g=" + encodeURIComponent(code) + (at ? "&m=" + st.hist.slice(0, at).join(".") : "");
		copy(url, "Link copied: it opens this game at move " + at + ".");
	});

	/* ---------- fill window / full screen ---------- */
	var view = $("tt-view");
	function setFill(on1) {
		view.classList.toggle("tt-fill", on1);
		document.body.classList.toggle("tt-filling", on1);
		$("tt-fill").setAttribute("aria-pressed", on1 ? "true" : "false");
		$("tt-fill").textContent = on1 ? "✕ Close" : "⤢ Fill window";
		render();
	}
	$("tt-fill").addEventListener("click", function () { setFill(!view.classList.contains("tt-fill")); });
	$("tt-fs").addEventListener("click", function () {
		if (document.fullscreenElement) document.exitFullscreen();
		else if (view.requestFullscreen) view.requestFullscreen().catch(function () { toast("Full screen isn't allowed here: try Fill window."); });
		else toast("This browser has no full screen for pages: try Fill window.");
	});
	document.addEventListener("fullscreenchange", function () { $("tt-fs").textContent = document.fullscreenElement ? "✕ Leave full screen" : "⛶ Full screen"; render(); });
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("tt-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if (e.key === "Escape" && view.classList.contains("tt-fill")) { setFill(false); return; }
		if (k === "n" && mode !== "online") newGame();
		else if (k === "u") undo();
		else if (k === "h") doHint();
		else if (k === "w") setFill(!view.classList.contains("tt-fill"));
		else if (k === "f") $("tt-fs").click();
		else if (t !== board && (e.key === "ArrowLeft" || e.key === "ArrowRight") && st.hist.length) {
			var n = st.hist.length, at = vi === null ? n : vi;
			at += e.key === "ArrowLeft" ? -1 : 1;
			vi = at >= n ? null : Math.max(0, at);
			render();
		}
	});
	var rsT = null;
	window.addEventListener("resize", function () { clearTimeout(rsT); rsT = setTimeout(function () { if (cfg && (cfg.t === "notakto" || (cfg.t === "line" && cfg.d > 1))) render(); }, 200); });

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".tt-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("tt-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") loadLobby();
		if (name === "stats") renderStats();
		lobbyTimer(name === "online");
	}
	$("tt-tabs").addEventListener("click", function (e) { var b = e.target.closest(".tt-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("tt-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("tt-stats"), keys = Object.keys(S.stats);
		if (!keys.length) { box.innerHTML = '<p class="tt-sub">No finished games yet. Play one against the computer or online and it shows up here.</p>'; return; }
		var LV = { easy: "Easy", medium: "Medium", hard: "Hard", online: "Online" };
		var tot = [0, 0, 0];
		keys.sort();
		var rows = keys.map(function (k) {
			var a = S.stats[k], parts = k.split("|"), c = T.parseCode(parts[0]), n = a[0] + a[1] + a[2];
			tot[0] += a[0]; tot[1] += a[1]; tot[2] += a[2];
			return "<tr><td>" + esc(c ? T.describe(c) : parts[0]) + "</td><td>" + (LV[parts[1]] || esc(parts[1])) + "</td><td>" + n + '</td><td class="w">' + a[0] + "</td><td>" + a[1] + '</td><td class="l">' + a[2] + "</td><td>" + bar(a) + "</td></tr>";
		}).join("");
		box.innerHTML = '<div style="overflow-x:auto"><table class="tt-stbl"><thead><tr><th>Game</th><th>Against</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th></th></tr></thead><tbody>' + rows +
			'</tbody><tfoot><tr><th>All games</th><th></th><th style="text-align:right">' + (tot[0] + tot[1] + tot[2]) + '</th><th style="text-align:right">' + tot[0] + '</th><th style="text-align:right">' + tot[1] + '</th><th style="text-align:right">' + tot[2] + "</th><th>" + bar(tot) + "</th></tr></tfoot></table></div>" +
			'<p><button type="button" class="tu-btn" id="tt-sreset">Reset statistics</button></p>';
		$("tt-sreset").addEventListener("click", function () { if (confirm("Delete all your tic-tac-toe statistics in this browser?")) { S.stats = {}; save(); renderStats(); } });
	}
	function bar(a) { var n = a[0] + a[1] + a[2] || 1; return '<span class="tt-bar" title="' + Math.round(a[0] * 100 / n) + '% won"><i class="bw" style="width:' + a[0] * 100 / n + '%"></i><i class="bd" style="width:' + a[1] * 100 / n + '%"></i><i class="bl" style="width:' + a[2] * 100 / n + '%"></i></span>'; }

	/* ---------- rules ---------- */
	var RULES = {
		classic: "Players take turns putting their mark (X goes first) in an empty square. Three in a row across, down or diagonally wins; a full board with no line is a draw. Good players never lose it: take the centre or a corner, always block an open two, and look for a fork (two threats at once).",
		misere: "Same moves as the classic game, but whoever completes a line of three loses. The first player should take the centre and then copy the other player's moves through the centre (mirror image): that can never lose.",
		wild: "On each turn you choose whether to place an X or an O. The player who completes three of the same symbol in a row (either symbol) wins. The first player can always force a win: start in the centre.",
		num: "The first player owns the odd numbers 1, 3, 5, 7, 9 and the second the even numbers 2, 4, 6, 8. Each number can be used once. Place one of your numbers in an empty cell; the player who completes a line of three numbers (any mix of odd and even) that adds up to exactly 15 wins.",
		"4x4k3": "Three in a row on a 4 × 4 board. There is so much room that the first player can always force a win by making two threats at once, so the second player has to be very careful from the first move.",
		"4x4k4": "You must fill a whole row, column or long diagonal. One mark in a line is enough to block it, so games between careful players are draws.",
		"5x5k4": "Four in a row on a 5 × 5 board. Look for an open three (three in a row with both ends free): it can't be blocked at both ends.",
		"6x6k5": "Five in a row on a 6 × 6 board.",
		gomoku: "Gomoku (five in a row): 15 × 15 board, X goes first, five or more in a row wins. An open four, or two open threes at once, usually decides the game.",
		drop4: "Choose a column; your piece falls to the lowest empty spot in it. Four in a row across, down or diagonally wins. The middle column is the strongest start.",
		ult: "The big board is made of nine small boards. Where you play inside a small board decides which small board the other player must play in next (top-right cell sends them to the top-right board). Win a small board with three in a row in it; win the game with three small boards in a row. If you are sent to a board that is already decided, you may play in any open board.",
		qubic: "Four layers of 4 × 4. Four in a row wins in any straight line: in one layer, straight down through the four layers, or diagonally through them, including the four long diagonals through the middle of the cube. There are 76 lines in all.",
		notakto: "Both players place X marks. A board that gets three in a row is dead: nobody may play in it any more. The player who kills the last live board loses. Keep the number of 'safe' moves in your favour.",
		notakto1: "Notakto on one board: both players play X, and whoever completes three in a row loses. The first player wins by starting in the centre and then playing a knight's move away from the other player's mark.",
		oc: "Order plays first. On each turn the player places either an X or an O in any empty cell. Order wins as soon as five of the same symbol stand in a row (rows, columns, diagonals). Chaos wins if the board fills up without that."
	};
	function renderRules() {
		$("tt-rules").innerHTML = T.PRESETS.map(function (p) {
			return '<div class="tt-rule"><h3>' + p.name + "</h3><p>" + (RULES[p.id] || p.desc) + '</p><button type="button" class="tt-vb" data-play="' + p.id + '">Play this</button></div>';
		}).join("") + '<div class="tt-rule"><h3>Your own board</h3><p>Choose "Custom board…" in the Game list: any width and height from 3 to 19, up to 4 layers for 3D (at most 6 × 6 each), a line of 3 to 7, and switch on gravity, misère or wild. The computer plays every one of them.</p><button type="button" class="tt-vb" data-play="custom">Make one</button></div>';
	}
	$("tt-rules").addEventListener("click", function (e) {
		var b = e.target.closest("[data-play]"); if (!b) return;
		if (mode === "online") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-play"); save(); syncSetup(); showTab("play"); newGame();
		window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
	});

	/* ---------- toast / copy ---------- */
	var toastT = null;
	function toast(msg) { var t = $("tt-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, lastSeen: 0, fails: 0 };
	var API = "/api/ttt";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("tt-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("tt-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("tt-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("tt-ochange").addEventListener("click", function () { showTab("play"); $("tt-game").focus(); });

	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		var c = T.parseCode(r.g.v);
		setGame(c, r.g.moves, { keepMode: true });
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("tt-ocreate").addEventListener("click", function () {
		if (mode === "online") return toast("You are already in an online game.");
		var c = setupCfg();
		if (!c) return toast("Fix the custom board first.");
		S.name = ($("tt-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: T.cfgCode(c), name: myName(), pub: $("tt-opub").checked, first: S.ofirst }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			startOnline(r);
		});
	});
	function join(id) {
		if (mode === "online" && on.id === id) { showTab("play"); return; }
		if (mode === "online") return toast("Leave your current online game first.");
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) {
			if (r.error) { toast(r.error); loadLobby(); return; }
			startOnline(r);
			toast("You joined " + (r.g.names[1 - r.seat] || "the game") + ".");
		});
	}
	function leaveOnline(silent) {
		clearTimeout(on.timer);
		on.id = null; on.g = null; S.online = null; save();
		mode = S.opp;
		if (!silent) newGame(); else render();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("tt-obar");
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="tt-dot"></span>Waiting for a player. Send them this link:</span><span class="tt-vbtns"><button type="button" class="tt-vb tt-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="tt-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="tt-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var idle = g.idle || 0, oppTurn = g.status === "play" && st.turn !== on.seat;
			var away = oppTurn && idle > 180000;
			h = '<span><span class="tt-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b>" + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="tt-vbtns">';
			if (g.status === "play") {
				if (away) h += '<button type="button" class="tt-vb tt-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="tt-vb" data-o="resign">Resign</button>';
			} else {
				h += '<button type="button" class="tt-vb tt-vb--main" data-o="rematch">↺ Rematch</button>';
			}
			h += '<button type="button" class="tt-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("tt-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play tic-tac-toe with me", text: "Join my game: " + T.describe(cfg), url: inviteLink() }).catch(function () {});
		if (a === "cancel" || a === "leave") {
			if (a === "leave" && on.g && on.g.status === "play" && !confirm("Leave the game? It counts as resigning.")) return;
			var id = on.id, key = on.key;
			api("POST", { act: a === "cancel" ? "cancel" : "leave", id: id, key: key });
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
		T.apply(st, m); vi = null; hint = null;
		render(true);
		api("POST", { act: "move", id: on.id, key: on.key, n: n, m: T.mstr(m) }).then(function (r) {
			on.sending = false;
			if (r.error) { toast(r.error); refetch(); return; }
			sync(r.g);
			if (st.win) finish();
		});
	}
	function refetch() { api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) sync(r.g); }); }
	function applyServerWin() {
		var g = on.g;
		if (g && g.status === "over" && g.win && !st.win) st.win = { p: g.win.p, line: null, why: g.win.why };
	}
	/** bring the board in line with the server's copy of the game */
	function sync(g) {
		if (!g || !on.id || g.id !== on.id) return;
		var prev = on.g, wasOver = st.win;
		on.g = g;
		if (!prev || prev.round !== g.round || g.moves.length < st.hist.length || g.moves.slice(0, st.hist.length).join() !== st.hist.join()) {
			// new round (rematch: seats swapped) or a different history: rebuild
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! You are " + T.playerName(cfg, on.seat) + " now."); }
			st = T.replay(cfg, g.moves) || T.create(cfg);
			wasOver = null;
		} else {
			for (var i = st.hist.length; i < g.moves.length; i++) {
				var m = T.mparse(g.moves[i]);
				if (!T.isLegal(st, m)) { st = T.replay(cfg, g.moves) || st; break; }
				T.apply(st, m);
				if (i === g.moves.length - 1) render(true);
			}
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your move!" : "They go first."));
		applyServerWin();
		render(prev && prev.moves.length !== g.moves.length);
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
		var waiting = g.status === "wait" || st.turn !== on.seat;
		return hidden ? 6000 : waiting ? 1200 : 4000;
	}
	document.addEventListener("visibilitychange", function () { if (!document.hidden && on.id) poll(50); });

	/* lobby */
	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) loadLobby(); }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : Math.round(s / 60) + " min ago"; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("tt-lobby");
			if (r.error) { box.innerHTML = '<p class="tt-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="tt-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="tt-lob">' + list.map(function (o) {
				var c = T.parseCode(o.v);
				return '<li><span class="tt-lobn">' + esc(o.name || "Guest") + ' <span class="tt-lobv">· ' + esc(c ? T.describe(c) : o.v) + " · " + (o.first === "host" ? "they go first" : o.first === "guest" ? "you go first" : "random start") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("tt-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("tt-orefresh").addEventListener("click", loadLobby);

	/* in-browser stand-in for /api/ttt (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-ttt:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-ttt:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, names: g.names, moves: g.moves, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, idle: now - g.at }; };
		if (method === "GET") {
			if (/lobby/.test(query)) return { open: Object.keys(db).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub && now - g.created < 1800000; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created }; }) };
			var id = (/id=([a-z0-9]+)/.exec(query) || [])[1], g0 = db[id];
			return g0 ? { g: pub(g0) } : { error: "Game not found (it may have expired)." };
		}
		var g = db[b.id], seat = g ? g.tok.indexOf(b.key) : -1;
		if (b.act === "new") {
			var c = T.parseCode(b.v); if (!c) return { error: "Unknown game." };
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
			var s = T.replay(T.parseCode(g.v), g.moves);
			if (s.turn !== seat) return { error: "It's not your turn." };
			var m = T.mparse(b.m); if (!T.isLegal(s, m)) return { error: "That move isn't allowed." };
			T.apply(s, m); g.moves.push(b.m); g.at = now;
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
	if (MOCK) $("tt-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	syncSetup();
	renderRules();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qg = q.get("g");
	if (joinId || qg || q.get("v")) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	if (q.get("v") && T.preset(q.get("v"))) { S.game = q.get("v"); syncSetup(); }
	if (S.online && S.online.id && !joinId) {
		// back to the online game we were in
		mode = "online"; on.id = S.online.id; on.key = S.online.key; on.seat = S.online.seat;
		api("GET", null, "?id=" + on.id).then(function (r) {
			if (r.g) { cfg = T.parseCode(r.g.v); startOnline({ g: r.g, key: on.key, seat: on.seat }); }
			else { on.id = null; S.online = null; save(); mode = S.opp; resumeOrNew(); }
		});
		cfg = setupCfg() || T.parseCode("L3x3k3"); code = T.cfgCode(cfg); st = T.create(cfg); render();
	} else if (joinId && /^[a-z0-9]{6,12}$/.test(joinId)) {
		cfg = setupCfg() || T.parseCode("L3x3k3"); code = T.cfgCode(cfg); st = T.create(cfg); mode = S.opp; render();
		if (S.online && S.online.id === joinId) { on.id = joinId; on.key = S.online.key; on.seat = S.online.seat; refetch(); mode = "online"; api("GET", null, "?id=" + joinId).then(function (r) { if (r.g) startOnline({ g: r.g, key: on.key, seat: on.seat }); }); }
		else { S.online = null; join(joinId); }
	} else if (qg && T.parseCode(qg)) {
		var c = T.parseCode(qg), mv = (q.get("m") || "").split(".").filter(Boolean);
		var p = T.presetByCode(qg);
		if (p) S.game = p.id; else { S.game = "custom"; S.custom = { w: c.w, h: c.h, d: c.d, k: c.k, g: c.grav, m: c.mis, x: c.wild }; }
		save(); syncSetup();
		var s0 = T.replay(c, mv);
		mode = S.opp;
		setGame(c, s0 ? mv : [], { human: s0 ? s0.turn : 0 });
		toast("Game loaded from the link.");
	} else resumeOrNew();
	function resumeOrNew() {
		var cc = S.cur && T.parseCode(S.cur.code);
		if (cc && !S.cur.done && S.cur.moves && S.cur.moves.length && T.replay(cc, S.cur.moves)) {
			var pp = T.presetByCode(S.cur.code);
			if (pp) S.game = pp.id; else { S.game = "custom"; S.custom = { w: cc.w, h: cc.h, d: cc.d, k: cc.k, g: cc.grav, m: cc.mis, x: cc.wild }; }
			mode = S.cur.mode === "local" ? "local" : "cpu";
			S.opp = mode; syncSetup();
			setGame(cc, S.cur.moves, { human: S.cur.human || 0, keepMode: true });
		} else newGame();
	}
})();
