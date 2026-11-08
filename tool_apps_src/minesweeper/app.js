/* MES Minesweeper page (mes.fm/minesweeper). Rules / generator / solver / records: lib.js (window.MESMines).
   Settings + statistics: localStorage "mes-minesweeper:v1". Hive: main_js/hive.js (window.MESHive) signs one custom_json
   (id "mes_mines") per saved win; /api/mines replays it and keeps the leaderboard. On localhost (no /api) an in-browser stand-in
   (localStorage "mes-minesweeper:mocklb") replays the record itself, so the whole flow can be tried without Keychain. */
(function () {
	"use strict";
	var M = window.MESMines;
	var root = document.getElementById("ms");
	if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-minesweeper:v1";
	var COARSE = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

	/* ---------- settings + stats ---------- */
	var S = { lv: "b", bd: "r", ng: false, q: false, cw: 20, ch: 12, cm: 40, cs: 0, stats: {}, daily: {}, last: null, lbk: "d", lbl: "b" };
	try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved && typeof saved === "object") for (var k in S) if (saved[k] !== undefined) S[k] = saved[k]; } catch (e) {}
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
	(function fromQuery() {
		var q = new URLSearchParams(location.search);
		var l = q.get("l") || q.get("level");
		if (l && /^[bice]$/.test(l)) S.lv = l;
		if (q.get("daily") === "1") S.bd = "d";
		if (q.get("ng") === "1") S.ng = true;
	})();

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	var toastT;
	function toast(msg) { var t = $("ms-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3400); }

	/* ---------- game state ---------- */
	var G = null;          /* the lib Game, once the first cell is opened */
	var B = null;          /* board size of the current game {w, h, m, l, daily, date, first} */
	var cells = [];        /* cell elements */
	var t0 = 0, tick = null, assisted = false, startedAt = 0, building = false, kb = -1, flagMode = false, hintT = null;
	var dailyCache = {};   /* date|l -> {board, g, ok} */
	var genToken = 0;

	function size() {
		if (S.lv === "c") { var c = M.custom(S.cw, S.ch, S.cm); return { w: c.w, h: c.h, m: c.m }; }
		var L = M.LEVELS[S.lv]; return { w: L.w, h: L.h, m: L.m };
	}
	function isDaily() { return S.bd === "d" && S.lv !== "c"; }
	function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

	var FLAG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect class="po" x="6.8" y="2" width="1.6" height="10.5"/><path class="fl" d="M8.4 2.2 L13.6 4.9 L8.4 7.7z"/><rect class="po" x="3.5" y="12.2" width="8.4" height="1.8" rx="0.4"/></svg>';
	var MINE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="mk" d="M8 1.6v12.8M1.6 8h12.8M3.5 3.5l9 9M12.5 3.5l-9 9"/><circle class="mn" cx="8" cy="8" r="4.6"/><circle class="sh" cx="6.4" cy="6.4" r="1.2"/></svg>';
	var WRONG = FLAG.replace("</svg>", '<path class="xx" d="M2.5 2.5l11 11M13.5 2.5l-11 11"/></svg>');

	/* ---------- new game ---------- */
	function newGame() {
		genToken++;
		stopTimer();
		var sz = size();
		B = { w: sz.w, h: sz.h, m: sz.m, l: S.lv === "c" ? M.levelOf(sz.w, sz.h, sz.m) : S.lv, daily: isDaily(), ng: isDaily() || S.ng };
		if (B.daily) { B.date = M.utcDate(); B.first = M.dailyFirst(B.date, B.l); }
		G = null; assisted = false; building = false; startedAt = 0;
		kb = B.daily ? B.first : Math.floor(B.h / 2) * B.w + Math.floor(B.w / 2);
		$("ms-after").hidden = true; $("ms-after").innerHTML = "";
		$("ms-face").textContent = "🙂";
		buildBoard();
		setTime(0); updateLeft();
		status(B.daily ? "Today's " + M.LEVELS[B.l].name + " board (" + B.date + ", UTC). Start on the marked cell." : (B.ng ? "No-guess board: open any cell to start." : "Open any cell to start: the first click is always safe."));
		if (B.daily) prepDaily();
		describe();
		if (B.daily) dailyPlayers();
	}
	function describe() {
		var sz = size(), txt = sz.w + " × " + sz.h + ", " + sz.m + " mines (" + Math.round(sz.m / (sz.w * sz.h) * 1000) / 10 + "% of the cells).";
		if (isDaily()) txt += " The daily board is the same for everyone today and always no-guess.";
		else if (S.ng) txt += " No-guess: logic alone can clear it from your first click.";
		var d = isDaily() && S.daily[M.utcDate() + "|" + S.lv];
		if (d && d.best) txt += " Your best on today's board: " + M.fmtTime(d.best) + ".";
		$("ms-desc").textContent = txt;
		$("ms-ng").checked = S.ng || isDaily(); $("ms-ng").disabled = isDaily();
	}
	function prepDaily() {
		var key = B.date + "|" + B.l;
		if (dailyCache[key]) return;
		var L = M.LEVELS[B.l], tok = genToken, from = 0, seed = M.dailySeed(B.date, B.l);
		(function step() {
			if (dailyCache[key]) return;
			var r = M.noGuess(seed, L.w, L.h, L.m, B.first, from, Math.min(M.NG_CAP, from + 40));
			if (r.ok) { dailyCache[key] = r; return; }
			from = r.next;
			if (from >= M.NG_CAP) { dailyCache[key] = { board: null, g: -1, ok: false }; return; }
			setTimeout(step, 0);
			void tok;
		})();
	}

	function buildBoard() {
		var b = $("ms-board"), html = "", n = B.w * B.h;
		b.style.gridTemplateColumns = "repeat(" + B.w + ", var(--cs))";
		for (var i = 0; i < n; i++) html += '<div class="ms-c" data-i="' + i + '"></div>';
		b.innerHTML = html;
		b.classList.remove("won", "lost", "busy");
		cells = Array.prototype.slice.call(b.children);
		if (B.daily) cells[B.first].classList.add("st");
		drawKb();
		fit();
	}
	function status(t, cls) { var s = $("ms-status"); s.textContent = t; s.className = "ms-status" + (cls ? " " + cls : ""); }
	function lcd(n) { var neg = n < 0; n = Math.min(999, Math.abs(n)); var s = String(n); while (s.length < 3) s = "0" + s; return neg ? "-" + s.slice(1) : s; }
	function updateLeft() { $("ms-left").textContent = lcd(B.m - (G ? G.flags : 0)); }
	function setTime(ms) { $("ms-time").textContent = lcd(Math.min(999, Math.floor(ms / 1000))); }
	function startTimer() { stopTimer(); tick = setInterval(function () { if (G && !G.over) setTime(now() - t0); }, 250); }
	function stopTimer() { if (tick) clearInterval(tick); tick = null; }
	function ms() { return Math.max(0, Math.round(now() - t0)); }

	/* ---------- drawing ---------- */
	function paint(i) {
		var el = cells[i]; if (!el) return;
		var st = G ? G.st[i] : 0, cls = "ms-c", inner = "";
		if (B.daily && i === B.first && !G) cls += " st";
		if (st === 1) {
			if (G.b.mine[i]) { cls += " o mine" + (i === G.boom ? " boom" : ""); inner = MINE; }
			else { var n = G.b.num[i]; cls += " o" + (n ? " n" + n : ""); inner = n ? String(n) : ""; }
		} else if (G && G.over && G.lost && G.b.mine[i] && st !== 2) { cls += " o mine"; inner = MINE; }
		else if (G && G.over && G.lost && st === 2 && !G.b.mine[i]) { cls += " o wrong"; inner = WRONG; }
		else if (st === 2 || (G && G.won && G.b.mine[i])) { cls += " f"; inner = FLAG; }
		else if (st === 3) { cls += " q"; inner = "?"; }
		if (i === kb) cls += " kb";
		if (el.className !== cls) el.className = cls;
		if (el.innerHTML !== inner) el.innerHTML = inner;
		el.setAttribute("aria-label", label(i));
	}
	function label(i) {
		var x = i % B.w + 1, y = Math.floor(i / B.w) + 1, st = G ? G.st[i] : 0, t = "row " + y + ", column " + x + ": ";
		if (st === 1) return t + (G.b.mine[i] ? "mine" : G.b.num[i] ? G.b.num[i] : "empty");
		return t + (st === 2 ? "flag" : st === 3 ? "question mark" : "hidden");
	}
	function paintAll() { for (var i = 0; i < cells.length; i++) paint(i); }
	function drawKb() { cells.forEach(function (c, i) { c.classList.toggle("kb", i === kb && document.activeElement === $("ms-board")); }); }

	/* ---------- cell size ---------- */
	function fit() {
		var box = $("ms-scroll"), view = $("ms-view"), cs;
		var full = view.classList.contains("mes-pfill") || document.fullscreenElement === view;
		if (S.cs) cs = S.cs;
		else {
			var avail = box.clientWidth - 8;
			cs = Math.floor(avail / B.w);
			if (full) { var ah = box.clientHeight - 8; if (ah > 100) cs = Math.min(cs, Math.floor(ah / B.h)); }
			cs = Math.max(COARSE ? 26 : 18, Math.min(full ? 64 : 40, cs));
		}
		$("ms-board").style.setProperty("--cs", cs + "px");
		$("ms-zlab").textContent = cs + " px";
		$("ms-zfit").setAttribute("aria-pressed", S.cs ? "false" : "true");
	}
	function zoom(d) {
		var cur = parseInt($("ms-board").style.getPropertyValue("--cs"), 10) || 28;
		S.cs = Math.max(12, Math.min(72, cur + d)); save(); fit();
	}
	window.addEventListener("resize", function () { if (B) fit(); });

	/* ---------- actions ---------- */
	function afterMove(changed) {
		if (!changed) return;
		changed.forEach(paint);
		updateLeft();
		if (G.over) end();
	}
	function startAt(i) {
		if (building) return;
		if (B.daily && i !== B.first) { toast("Today's board starts on the marked cell (the blue ring)."); kb = B.first; drawKb(); return; }
		var w = B.w, h = B.h, m = B.m;
		function go(board, note) {
			G = new M.Game(board);
			t0 = now(); startedAt = Date.now();
			var ch = G.reveal(i, 0);
			countStart();
			startTimer();
			$("ms-face").textContent = "🙂";
			status(note || (B.daily ? "Go!" : ""));
			paintAll();
			if (G.over) end(); else updateLeft();
		}
		if (B.daily) {
			var key = B.date + "|" + B.l, c = dailyCache[key];
			if (c) {
				if (!c.ok) return toast("Today's board could not be made in this browser: try a random board.");
				return go(M.board({ s: M.dailySeed(B.date, B.l), w: w, h: h, m: m, f: B.first, n: 1, g: c.g }));
			}
			building = true; $("ms-board").classList.add("busy"); status("Getting today's board ready…");
			var waitTok = genToken;
			(function wait() {
				if (waitTok !== genToken) return;
				var c2 = dailyCache[key];
				if (!c2) return setTimeout(wait, 30);
				building = false; $("ms-board").classList.remove("busy");
				if (!c2.ok) return toast("Today's board could not be made in this browser: try a random board.");
				go(M.board({ s: M.dailySeed(B.date, B.l), w: w, h: h, m: m, f: B.first, n: 1, g: c2.g }));
			})();
			return;
		}
		var seed = M.newSeed();
		if (!B.ng) return go(M.place(seed, w, h, m, i, 0));
		building = true; $("ms-board").classList.add("busy"); status("Making a no-guess board…");
		var tok = genToken, from = 0, t1 = Date.now();
		(function step() {
			if (tok !== genToken) return;
			var r = M.noGuess(seed, w, h, m, i, from, Math.min(M.NG_CAP, from + 30));
			if (r.ok) { building = false; $("ms-board").classList.remove("busy"); return go(r.board); }
			from = r.next;
			if (from >= M.NG_CAP || Date.now() - t1 > 8000) {
				building = false; $("ms-board").classList.remove("busy"); B.ng = false;
				return go(M.place(seed, w, h, m, i, 0), "No no-guess board turned up quickly for this size, so this is a normal board (you may have to guess).");
			}
			status("Making a no-guess board… (" + from + " tried)");
			setTimeout(step, 0);
		})();
	}
	function reveal(i) {
		if (!G) return startAt(i);
		if (G.over) return;
		if (G.st[i] === 1) return chord(i);
		afterMove(G.reveal(i, ms()));
	}
	function chord(i) {
		if (!G || G.over) return;
		if (G.st[i] !== 1) return;
		afterMove(G.chord(i, ms()));
	}
	function flag(i) {
		if (!G) { if (!building) toast("Open a cell first."); return; }
		if (G.over || G.st[i] === 1) return;
		if (G.st[i] === 2 && S.q) { G.flag(i, ms()); G.question(i); paint(i); updateLeft(); return; }
		if (G.st[i] === 3) { G.question(i); paint(i); return; }
		G.flag(i, ms()); paint(i); updateLeft();
	}
	function hint() {
		if (!G || G.over) return toast(G ? "The game is over." : "Open a cell first.");
		var h = M.hint(G.b, G.st);
		if (!h) return toast("Nothing can be proved from what you see right now: you would have to guess here.");
		if (!assisted) { assisted = true; status("Hint used: this game counts as assisted."); }
		var el = cells[h.cell];
		el.classList.add(h.kind === "safe" ? "hs" : "hm");
		kb = h.cell; drawKb();
		try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
		toast(h.kind === "safe" ? "The green cell is safe to open." : "The red cell must be a mine.");
		clearTimeout(hintT);
		hintT = setTimeout(function () { el.classList.remove("hs", "hm"); }, 2600);
	}

	/* ---------- end of a game ---------- */
	function end() {
		stopTimer();
		var t = G.time();
		setTime(t);
		var board = $("ms-board");
		board.classList.remove("won", "lost"); void board.offsetWidth;
		paintAll();
		if (G.won) {
			board.classList.add("won");
			$("ms-face").textContent = "😎";
			$("ms-left").textContent = lcd(0);
			status("Cleared in " + M.fmtTime(t) + (assisted ? " (assisted)" : "") + "!", "is-win");
		} else {
			board.classList.add("lost");
			$("ms-face").textContent = "😵";
			var wf = G.wrongFlags().length;
			status("Boom. " + (wf ? wf + " flag" + (wf > 1 ? "s were" : " was") + " wrong (crossed out). " : "") + "Press the face or N for a new game.", "is-lose");
		}
		var rec = record();
		S.last = { rec: rec, won: G.won, l: B.l };
		addStats(rec);
		save();
		after(rec);
	}
	function record() {
		var r = M.record(G, { l: B.l === "c" ? "c" : B.l, d: B.daily ? B.date : null, a: assisted });
		return r;
	}
	function after(rec) {
		var box = $("ms-after"), bv = rec.b, eff = G.won ? (bv / Math.max(1, rec.t) * 1000) : 0;
		var html = '<div class="ms-nums"><span>Time <b>' + (G.won ? M.fmtTime(rec.t) : "—") + "</b></span><span>3BV <b>" + bv + "</b></span>" +
			(G.won ? "<span>3BV/s <b>" + eff.toFixed(2) + "</b></span>" : "") + "<span>Clicks <b>" + rec.c + "</b></span>" +
			(G.won ? "<span>Efficiency <b>" + Math.round(bv / rec.c * 100) + "%</b></span>" : "") + "</div>";
		var btns = '<div class="ms-hrow" style="margin-top:0.5em"><button type="button" class="tu-btn tu-btn--primary" data-a="new">New game</button><button type="button" class="tu-btn" data-a="replay">▶ Watch replay</button>';
		if (G.won) btns += '<button type="button" class="tu-btn" data-a="hive">⬢ Save to Hive</button>';
		btns += "</div>";
		html += btns;
		if (G.won) {
			if (rec.a) html += '<p class="tu-note">You used a hint, so this win is not ranked (you can still save it to Hive).</p>';
			else if (!rec.mv) html += '<p class="tu-note">This board is too big to save every click, so a Hive save could not be checked or ranked.</p>';
			else if (B.l === "c") html += '<p class="tu-note">Custom sizes are not ranked, but you can still save the win to Hive.</p>';
		}
		html += '<div id="ms-hbox"></div>';
		box.innerHTML = html;
		box.className = "ms-after" + (G.won ? " is-win" : "");
		box.hidden = false;
	}
	$("ms-after").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-a]"); if (!b) return;
		var a = b.getAttribute("data-a");
		if (a === "new") newGame();
		else if (a === "replay") replay();
		else if (a === "hive") hiveBox();
	});

	/* ---------- replay of the last game ---------- */
	var replayT = null;
	function replay() {
		if (!S.last || !S.last.rec || !S.last.rec.mv) return toast("No replay saved for this game.");
		var r = S.last.rec, mv = M.decMoves(r.mv);
		if (!mv || !mv.length) return;
		var board = M.board({ s: r.s, w: r.w, h: r.h, m: r.m, f: mv[0][1], n: r.n, g: r.g });
		genToken++; stopTimer(); clearTimeout(replayT);
		B = { w: r.w, h: r.h, m: r.m, l: r.l, daily: false, ng: !!r.n };
		G = null; buildBoard();
		var g = new M.Game(board), k = 0, start = Date.now(), tok = genToken;
		G = g; paintAll();
		status("Replay at double speed…");
		$("ms-after").hidden = true;
		(function step() {
			if (tok !== genToken) return;
			var el = (Date.now() - start) * 2;
			while (k < mv.length && mv[k][2] <= el) { g.apply(mv[k]); k++; }
			paintAll(); updateLeft(); setTime(Math.min(el, g.time()));
			if (k >= mv.length) { status("End of the replay: " + (g.won ? "cleared in " + M.fmtTime(g.time()) : "boom") + ". Press the face for a new game."); $("ms-face").textContent = g.won ? "😎" : "😵"; return; }
			replayT = setTimeout(step, 60);
		})();
	}

	/* ---------- input: mouse ---------- */
	var board = $("ms-board"), btns = 0, chordMode = false, pressCell = -1, lastTouch = 0;
	function cellOf(e) { var t = e.target && e.target.closest ? e.target.closest(".ms-c") : null; return t ? +t.getAttribute("data-i") : -1; }
	function pressPreview(i, on) {
		if (!G || G.over || i < 0) return;
		var list = chordMode ? [i].concat(G.b.nb[i]) : [i];
		list.forEach(function (c) { if (G.st[c] === 0 || G.st[c] === 3) cells[c].classList.toggle("pr", on); });
	}
	function clearPreview() { cells.forEach(function (c) { c.classList.remove("pr"); }); }
	board.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	board.addEventListener("mousedown", function (e) {
		if (Date.now() - lastTouch < 800) return;
		var i = cellOf(e); if (i < 0) return;
		e.preventDefault();
		try { board.focus({ preventScroll: true }); } catch (x) {}
		kb = i; drawKb();
		btns = e.buttons || (1 << e.button);
		if (e.button === 1 || (btns & 3) === 3) chordMode = true;
		else if (e.button === 2) { flag(i); }
		pressCell = i; clearPreview();
		if (e.button !== 2 || chordMode) pressPreview(i, true);
		if (!G || !G.over) $("ms-face").textContent = "😮";
	});
	board.addEventListener("mouseover", function (e) {
		if (!btns) return;
		var i = cellOf(e); if (i < 0 || i === pressCell) return;
		clearPreview(); pressCell = i;
		if (chordMode || (btns & 1)) pressPreview(i, true);
	});
	document.addEventListener("mouseup", function (e) {
		if (!btns) return;
		var i = pressCell, left = e.buttons || 0;
		var released = e.button;
		btns = left;
		if (G && !G.over) $("ms-face").textContent = "🙂"; else if (!G) $("ms-face").textContent = "🙂";
		if (chordMode) {
			if (!left) { chordMode = false; clearPreview(); if (i >= 0 && e.target.closest && board.contains(e.target)) chord(i); }
			return;
		}
		clearPreview();
		if (released === 0 && i >= 0 && board.contains(e.target)) { if (flagMode) { if (G && G.st[i] === 1) chord(i); else flag(i); } else reveal(i); }
		if (!left) pressCell = -1;
	});

	/* ---------- input: touch / pen (tap opens, press and hold flags; the board still scrolls) ---------- */
	var tp = null;
	board.addEventListener("pointerdown", function (e) {
		if (e.pointerType === "mouse") return;
		lastTouch = Date.now();
		var i = cellOf(e); if (i < 0) return;
		tp = { id: e.pointerId, i: i, x: e.clientX, y: e.clientY, done: false };
		var me = tp;
		tp.timer = setTimeout(function () {
			if (tp !== me) return;
			me.done = true;
			if (flagMode) reveal(i); else { if (G && G.st[i] === 1) chord(i); else flag(i); }
			if (navigator.vibrate) try { navigator.vibrate(25); } catch (x) {}
		}, 380);
	});
	board.addEventListener("pointermove", function (e) {
		if (!tp || e.pointerId !== tp.id) return;
		if (Math.abs(e.clientX - tp.x) > 9 || Math.abs(e.clientY - tp.y) > 9) { clearTimeout(tp.timer); tp = null; }
	});
	function tpEnd(e, cancel) {
		if (!tp || e.pointerId !== tp.id) return;
		lastTouch = Date.now();
		clearTimeout(tp.timer);
		var t = tp; tp = null;
		if (cancel || t.done) return;
		kb = t.i; drawKb();
		if (flagMode) { if (G && G.st[t.i] === 1) chord(t.i); else flag(t.i); }
		else reveal(t.i);
	}
	board.addEventListener("pointerup", function (e) { tpEnd(e, false); });
	board.addEventListener("pointercancel", function (e) { tpEnd(e, true); });

	/* ---------- input: keyboard ---------- */
	board.addEventListener("focus", drawKb);
	board.addEventListener("blur", drawKb);
	board.addEventListener("keydown", function (e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		var x = kb % B.w, y = Math.floor(kb / B.w), k = e.key;
		var mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
		if (mv) {
			e.preventDefault();
			x = Math.max(0, Math.min(B.w - 1, x + mv[0])); y = Math.max(0, Math.min(B.h - 1, y + mv[1]));
			kb = y * B.w + x; drawKb();
			try { cells[kb].scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x2) {}
			return;
		}
		if (k === " " || k === "Enter") { e.preventDefault(); if (flagMode) flag(kb); else reveal(kb); }
		else if (k === "f" || k === "F") { e.preventDefault(); flag(kb); }
		else if (k === "d" || k === "D") { e.preventDefault(); chord(kb); }
	});
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("ms-p-play").hidden) return;
		var k = e.key;
		if (k === "n" || k === "N") newGame();
		else if (k === "h" || k === "H") hint();
		else if (k === "+" || k === "=") zoom(2);
		else if (k === "-" || k === "_") zoom(-2);
		else if (k === "0") { S.cs = 0; save(); fit(); }
	});

	/* ---------- controls ---------- */
	function seg(id, val) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === val ? "true" : "false"); }); }
	function wireSeg(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (b) fn(b.getAttribute("data-v")); }); }
	function syncSetup() {
		seg("ms-lv", S.lv); seg("ms-bd", S.lv === "c" ? "r" : S.bd);
		$("ms-bd").querySelector('[data-v="d"]').disabled = S.lv === "c";
		$("ms-custom").hidden = S.lv !== "c";
		$("ms-q").checked = !!S.q;
		$("ms-cw").value = S.cw; $("ms-ch").value = S.ch; $("ms-cm").value = S.cm;
		var c = M.custom(S.cw, S.ch, S.cm);
		$("ms-cnote").textContent = "5 to 50 columns, 5 to 30 rows, up to " + M.maxMines(c.w, c.h) + " mines for this size.";
	}
	wireSeg("ms-lv", function (v) { S.lv = v; save(); syncSetup(); newGame(); });
	wireSeg("ms-bd", function (v) { S.bd = v; save(); syncSetup(); newGame(); });
	$("ms-ng").addEventListener("change", function () { S.ng = this.checked; save(); newGame(); });
	$("ms-q").addEventListener("change", function () { S.q = this.checked; save(); });
	["ms-cw", "ms-ch", "ms-cm"].forEach(function (id) {
		$(id).addEventListener("change", function () {
			var c = M.custom($("ms-cw").value, $("ms-ch").value, $("ms-cm").value);
			S.cw = c.w; S.ch = c.h; S.cm = c.m; save(); syncSetup(); newGame();
		});
	});
	$("ms-face").addEventListener("click", newGame);
	$("ms-hint").addEventListener("click", hint);
	$("ms-flagmode").addEventListener("click", function () {
		flagMode = !flagMode;
		this.setAttribute("aria-pressed", flagMode ? "true" : "false");
		toast(flagMode ? "Flag mode: taps place flags (press and hold opens)." : "Flag mode off: taps open cells.");
	});
	$("ms-zin").addEventListener("click", function () { zoom(2); });
	$("ms-zout").addEventListener("click", function () { zoom(-2); });
	$("ms-zfit").addEventListener("click", function () { S.cs = 0; save(); fit(); });

	/* tabs */
	$("ms-tabs").addEventListener("click", function (e) {
		var b = e.target.closest(".ms-tab"); if (!b) return;
		showTab(b.getAttribute("data-t"));
	});
	function showTab(t) {
		Array.prototype.forEach.call($("ms-tabs").children, function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
		$("ms-p-play").hidden = t !== "play"; $("ms-p-lb").hidden = t !== "lb"; $("ms-p-stats").hidden = t !== "stats";
		if (t === "lb") { renderLogin(); loadLb(); }
		if (t === "stats") renderStats();
		if (t === "play") fit();
	}

	/* fill window / full screen */
	function panelInit() {
		if (!window.MESPanel || $("ms-view").__mesPanel) return;
		window.MESPanel.add($("ms-view"), { bar: $("ms-vbar").querySelector(".ms-vbtns"), stage: $("ms-scroll"), onChange: function () { setTimeout(fit, 30); } });
	}
	panelInit();
	window.addEventListener("load", panelInit);
	document.addEventListener("DOMContentLoaded", panelInit);

	/* ---------- statistics ---------- */
	function stat(l) {
		var s = S.stats[l];
		if (!s) s = S.stats[l] = { g: 0, w: 0, cur: 0, best: 0, top: [] };
		return s;
	}
	function countStart() { /* counted at the end (a game counts once a cell is opened) */ }
	function addStats(rec) {
		var s = stat(B.l === "c" ? "c" : B.l);
		s.g++;
		if (G.won) {
			s.w++; s.cur++; s.best = Math.max(s.best, s.cur);
			if (!rec.a) {
				s.top.push({ t: rec.t, b: rec.b, e: Math.round(rec.b / Math.max(1, rec.t) * 100000) / 100, d: new Date().toISOString().slice(0, 10), x: (B.daily ? "daily" : B.ng ? "no-guess" : "") + (B.l === "c" ? (B.w + "×" + B.h + "/" + B.m) : "") });
				s.top.sort(function (a, b) { return a.t - b.t; });
				s.top = s.top.slice(0, 10);
			}
		} else s.cur = 0;
		if (B.daily) {
			var k = B.date + "|" + B.l, d = S.daily[k] || (S.daily[k] = { tries: 0, best: 0 });
			d.tries++;
			if (G.won && !rec.a && (!d.best || rec.t < d.best)) d.best = rec.t;
			var ks = Object.keys(S.daily).sort();
			while (ks.length > 120) delete S.daily[ks.shift()];
		}
	}
	function renderStats() {
		var html = '<div class="ms-sgrid">';
		["b", "i", "e", "c"].forEach(function (l) {
			var s = S.stats[l] || { g: 0, w: 0, cur: 0, best: 0, top: [] };
			var name = l === "c" ? "Custom" : M.LEVELS[l].name;
			html += '<div class="ms-scard"><h3>' + name + '</h3><div class="ms-kv"><span>Games <b>' + s.g + "</b></span><span>Wins <b>" + s.w + "</b></span><span>Win rate <b>" + (s.g ? Math.round(s.w / s.g * 100) : 0) + "%</b></span><span>Streak <b>" + s.cur + "</b></span><span>Best streak <b>" + s.best + "</b></span></div>";
			if (s.top.length) {
				html += '<div class="ms-twrap"><table class="ms-tbl"><thead><tr><th>#</th><th class="r">Time</th><th class="r">3BV</th><th class="r">3BV/s</th><th>Date</th></tr></thead><tbody>';
				s.top.forEach(function (r, i) { html += "<tr><td>" + (i + 1) + '</td><td class="r">' + M.fmtTime(r.t) + '</td><td class="r">' + r.b + '</td><td class="r">' + r.e.toFixed(2) + "</td><td>" + esc(r.d) + (r.x ? " <small>" + esc(r.x) + "</small>" : "") + "</td></tr>"; });
				html += "</tbody></table></div>";
			} else html += '<p class="ms-sub">No wins yet.</p>';
			html += "</div>";
		});
		html += "</div>";
		$("ms-stats").innerHTML = html;
	}
	$("ms-sreset").addEventListener("click", function () {
		if (!confirm("Clear all your Minesweeper statistics in this browser?")) return;
		S.stats = {}; S.daily = {}; save(); renderStats(); toast("Statistics cleared.");
	});

	/* ---------- Hive ---------- */
	var HV = window.MESHive || null;
	function me() { var u = HV && HV.user && HV.user(); return u ? u.name : (MOCK ? (sessionStorage.getItem("mes-minesweeper:mockacct") || "") : ""); }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function loginHtml() {
		var u = me();
		if (u) return '<p class="ms-who">Signed in as ' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b> <button type="button" class="tu-btn" data-h="out">Log out</button></p>';
		return '<div class="ms-hrow"><input class="tu-input" data-h="user" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" data-h="in">Log in with Hive</button></div>' +
			'<p class="tu-note">' + (MOCK ? "Test copy: any username works here and nothing is signed (no Keychain on a local copy)." : "Hive Keychain (the extension, or the Keychain phone app) proves you own the account by signing a message with your posting key. Your keys never leave Keychain.") + "</p>";
	}
	function wireLogin(box, done) {
		box.innerHTML = loginHtml();
		var out = box.querySelector('[data-h="out"]'), inb = box.querySelector('[data-h="in"]'), user = box.querySelector('[data-h="user"]');
		if (out) out.addEventListener("click", function () { if (MOCK && !(HV && HV.user && HV.user())) sessionStorage.removeItem("mes-minesweeper:mockacct"); else if (HV) HV.logout(); refreshLogins(); });
		if (inb) {
			var go = function () {
				var n = (user.value || "").trim().replace(/^@/, "").toLowerCase();
				if (MOCK) { if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) return toast("That is not a Hive username."); sessionStorage.setItem("mes-minesweeper:mockacct", n); refreshLogins(); if (done) done(); return; }
				if (!HV) return toast("The Hive helpers did not load: reload the page.");
				inb.disabled = true; inb.textContent = "Check Keychain…";
				HV.login(n).then(function () { toast("Logged in."); refreshLogins(); if (done) done(); }, function (e) {
					inb.disabled = false; inb.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test((e.message || "") + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HV.helpHtml ? HV.helpHtml() : ""; box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			inb.addEventListener("click", go);
			user.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
		}
	}
	function renderLogin() { wireLogin($("ms-hlogin")); }
	function refreshLogins() { renderLogin(); if ($("ms-hbox") && $("ms-hbox").childNodes.length) hiveBox(); }
	if (HV && HV.onChange) HV.onChange(function () { refreshLogins(); });

	function hiveBox() {
		var box = $("ms-hbox"); if (!box || !S.last || !S.last.won) return;
		var rec = S.last.rec, u = me();
		var html = '<p class="tu-note">Saves one public, permanent message (custom_json id <code>mes_mines</code>) from your Hive account with this board\'s seed, your time, 3BV and clicks. It uses only your posting key, through Keychain, and costs no HIVE.</p>';
		box.innerHTML = html + '<div class="ms-hl"></div>';
		var hl = box.querySelector(".ms-hl");
		if (!u) { wireLogin(hl, hiveBox); return; }
		hl.innerHTML = '<p class="ms-who">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b></p><p><button type="button" class="tu-btn tu-btn--primary" data-h="send">Sign and save this win</button></p><p class="ms-sub" data-h="msg"></p>';
		hl.querySelector('[data-h="send"]').addEventListener("click", function () { sendHive(rec, u, this, hl.querySelector('[data-h="msg"]')); });
	}
	function sendHive(rec, u, btn, msg) {
		btn.disabled = true; msg.textContent = "Waiting for Keychain…";
		var json = M.json(rec);
		var p = MOCK && !(HV && HV.user && HV.user()) ? Promise.resolve({ trx: "mock" + Date.now().toString(16), mockRec: rec }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, M.ID, "Posting", json, "Save a Minesweeper win (" + M.fmtTime(rec.t) + ")", function (r) {
					if (r && r.success) { var x = r.result || {}; ok({ trx: x.id || x.tx_id || x.trx_id || "" }); }
					else no(new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled in Keychain"));
				});
			});
		});
		p.then(function (res) {
			msg.innerHTML = "Saved on Hive" + (res.trx && !/^mock/.test(res.trx) ? ' (<a href="https://hivehub.dev/tx/' + esc(res.trx) + '" target="_blank" rel="noopener">transaction</a>)' : "") + ". Checking it for the leaderboard…";
			S.last.trx = res.trx; save();
			submit(u, res.trx, rec, msg, 0);
		}, function (e) {
			btn.disabled = false;
			msg.textContent = (e && e.message) || "Not saved.";
			if (e && e.code === "nokeychain" && HV && HV.helpHtml) { var d = document.createElement("div"); d.innerHTML = HV.helpHtml(); msg.appendChild(d); }
		});
	}
	function submit(u, trx, rec, msg, tries) {
		api("POST", { act: "submit", acct: u, trx: trx }, null, rec).then(function (r) {
			if (r.ok) msg.innerHTML = r.board ? "On the leaderboard: <b>#" + r.rank + "</b> of " + r.count + " (" + esc(boardName(r.board)) + ")." + (r.best === false ? " Your earlier time there was faster, so it stays." : "") : "Checked and saved. " + esc(r.note || "");
			else if (r.code === 404 && tries < 8) { msg.textContent = "Waiting for the next Hive block… (" + (tries + 1) + ")"; setTimeout(function () { submit(u, trx, rec, msg, tries + 1); }, 3500); }
			else msg.textContent = "Saved on Hive, but not added to the leaderboard: " + (r.error || "unknown problem") + ".";
		});
	}
	function boardName(key) {
		var p = String(key).split(":"), l = p[p.length - 1], n = M.LEVELS[l] ? M.LEVELS[l].name : l;
		return p[0] === "d" ? "daily " + n + " " + p[1] : p[0] === "n" ? "no-guess " + n : "all-time " + n;
	}

	/* ---------- API (or the local stand-in) ---------- */
	function api(method, body, query, rec) {
		if (MOCK) return Promise.resolve(mockApi(method, body, query, rec));
		var url = "/api/mines" + (query ? "?" + new URLSearchParams(query).toString() : "");
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(url, opt).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j.code = r.status; if (!r.ok && !j.error) j.error = "HTTP " + r.status; j.ok = r.ok && j.ok !== false; return j; });
		}, function () { return { ok: false, code: 0, error: "Could not reach mes.fm" }; });
	}
	function mockLoad() { try { return JSON.parse(localStorage.getItem("mes-minesweeper:mocklb") || "{}"); } catch (e) { return {}; } }
	function mockApi(method, body, query, rec) {
		var db = mockLoad();
		if (method === "POST") {
			var v = M.verify(rec, {});
			if (!v.ok) return { ok: false, code: 422, error: v.why };
			if (!v.board) return { ok: true, note: "Not ranked (assisted or custom size)." };
			var lst = db[v.board] || (db[v.board] = []), old = lst.filter(function (x) { return x.acct === body.acct; })[0], best = true;
			if (old && old.t <= v.t) best = false;
			else { lst = db[v.board] = lst.filter(function (x) { return x.acct !== body.acct; }); lst.push({ acct: body.acct, t: v.t, b: v.b, eff: v.eff, trx: body.trx, ts: Date.now() }); }
			db[v.board].sort(function (a, b) { return a.t - b.t; });
			localStorage.setItem("mes-minesweeper:mocklb", JSON.stringify(db));
			var rank = 1 + db[v.board].findIndex(function (x) { return x.acct === body.acct; });
			return { ok: true, board: v.board, rank: rank, count: db[v.board].length, best: best };
		}
		if (query.daily) { var o = { ok: true }; ["b", "i", "e"].forEach(function (l) { o[l] = (db["d:" + query.daily + ":" + l] || []).length; }); return o; }
		var top = (db[query.board] || []).slice(0, +query.n || 25);
		return { ok: true, top: top, count: (db[query.board] || []).length };
	}

	/* ---------- leaderboard ---------- */
	function lbKey() { return S.lbk === "d" ? "d:" + M.utcDate() + ":" + S.lbl : S.lbk + ":" + S.lbl; }
	function loadLb() {
		seg("ms-lbk", S.lbk); seg("ms-lbl", S.lbl);
		var key = lbKey();
		$("ms-lbnote").textContent = (MOCK ? "Local test copy: this list is kept in this browser only. The real leaderboard works on mes.fm. " : "") +
			(S.lbk === "d" ? "Today's " + M.LEVELS[S.lbl].name + " board (" + M.utcDate() + ", UTC; a new board starts at midnight UTC)." : S.lbk === "a" ? "Random boards, " + M.LEVELS[S.lbl].name + " size, all time." : "Random no-guess boards, " + M.LEVELS[S.lbl].name + " size, all time.");
		$("ms-lb").innerHTML = '<p class="ms-sub">Loading…</p>';
		api("GET", null, { board: key, n: 50 }).then(function (r) {
			if (key !== lbKey()) return;
			if (!r.ok) { $("ms-lb").innerHTML = '<p class="ms-sub">' + esc(r.code === 404 || r.code === 0 ? "The leaderboard works on mes.fm (it could not be reached from here)." : r.error || "Could not load the leaderboard.") + "</p>"; return; }
			var top = r.top || [], u = me();
			if (!top.length) { $("ms-lb").innerHTML = '<p class="ms-sub">No times yet. Win a game, press "Save to Hive", and yours can be the first.</p>'; return; }
			var html = '<div class="ms-twrap"><table class="ms-tbl ms-lbt"><thead><tr><th>#</th><th>Player</th><th class="r">Time</th><th class="r">3BV</th><th class="r">3BV/s</th><th>Proof</th></tr></thead><tbody>';
			top.forEach(function (x, i) {
				html += '<tr class="' + (x.acct === u ? "me" : "") + '"><td>' + (i + 1) + '</td><td><img alt="" loading="lazy" src="' + esc(avatar(x.acct)) + '"><a href="https://peakd.com/@' + esc(x.acct) + '" target="_blank" rel="noopener">@' + esc(x.acct) + '</a></td><td class="r">' + M.fmtTime(x.t) + '</td><td class="r">' + x.b + '</td><td class="r">' + Number(x.eff).toFixed(2) + "</td><td>" +
					(x.trx && !/^mock/.test(x.trx) ? '<a href="https://hivehub.dev/tx/' + esc(x.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "—") + "</td></tr>";
			});
			html += "</tbody></table></div>";
			if (r.count > top.length) html += '<p class="ms-sub">' + r.count + " players in all.</p>";
			$("ms-lb").innerHTML = html;
		});
	}
	wireSeg("ms-lbk", function (v) { S.lbk = v; save(); loadLb(); });
	wireSeg("ms-lbl", function (v) { S.lbl = v; save(); loadLb(); });
	$("ms-lbref").addEventListener("click", loadLb);
	function dailyPlayers() {
		var d = M.utcDate(), l = B.l;
		api("GET", null, { daily: d }).then(function (r) {
			if (!r.ok || !B || !B.daily || B.l !== l) return;
			var n = r[l] | 0;
			$("ms-desc").textContent += " " + (n ? n + (n === 1 ? " player has" : " players have") + " a verified time on today's board." : "No verified times on today's board yet.");
		});
	}

	/* ---------- start ---------- */
	syncSetup();
	newGame();
	window.MESMinesDebug = { game: function () { return G; }, B: function () { return B; }, reveal: reveal, flag: flag, chord: chord, hint: hint, newGame: newGame, cells: function () { return cells; }, S: S };
})();
