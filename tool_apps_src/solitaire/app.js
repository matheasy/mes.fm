/* MES Solitaire page (mes.fm/solitaire). Rules / deals / solver / records: lib.js (window.MESSolitaire).
   Settings, statistics and the game in progress: localStorage "mes-solitaire:v1". Hive: main_js/hive.js (window.MESHive) signs one
   custom_json (id "mes_solitaire") per saved win; /api/solitaire replays it and keeps the leaderboard. On localhost (no /api) an
   in-browser stand-in (localStorage "mes-solitaire:mocklb") replays the record itself. Offline: /solitaire-sw.js (this page only). */
(function () {
	"use strict";
	var M = window.MESSolitaire;
	var root = document.getElementById("sl");
	if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-solitaire:v1";
	var LEVELS = { k: ["k1", "k3", "k3p"], s: ["s1", "s2", "s4"], f: ["f4", "f3", "f2"] };

	/* ---------- settings + stats ---------- */
	var S = { v: "k1", deal: "r", win: true, auto: true, back: "b", stats: {}, daily: {}, cur: null, last: null, lbk: "d", lbv: "k1" };
	try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved && typeof saved === "object") for (var k in S) if (saved[k] !== undefined) S[k] = saved[k]; } catch (e) {}
	if (!M.VARIANTS[S.v]) S.v = "k1";
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
	var urlDeal = null;
	(function fromQuery() {
		var q = new URLSearchParams(location.search);
		var v = q.get("v"), s = q.get("s");
		if (v && M.VARIANTS[v]) S.v = v;
		if (q.get("daily") === "1") S.deal = "d";
		if (s && s.length <= 24) urlDeal = s;
		if (v || s || q.get("daily")) try { history.replaceState(null, "", location.pathname); } catch (e) {}
	})();

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	var toastT;
	function toast(msg) { var t = $("sl-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3400); }
	function status(msg) { $("sl-status").textContent = msg || ""; }
	function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

	/* ---------- game state ---------- */
	var G = null;          // lib Game
	var cur = null;        // {v, seed, d (daily date or ""), list [[f,n,t,dt]], groups [start index of each user action], u, h, carry, won}
	var lastAt = 0;        // performance time of the last move (or of resuming)
	var tick = null, busy = false, genToken = 0;
	var els = {}, slots = {}, where = {}, L = null;   // card elements by id, slot elements by pile, card id -> [pile, index], layout
	var sel = null, kbCur = null, tapMemo = null, hintT = null, finishing = false;

	function gameOf(v) { return M.VARIANTS[v].g; }
	function elapsed() {
		if (!cur) return 0;
		var t = cur.carry || 0;
		cur.list.forEach(function (m) { t += m[3]; });
		if (cur.list.length && !cur.won && lastAt) t += now() - lastAt;
		return t;
	}

	function newDeal(seed, opt) {
		opt = opt || {};
		genToken++;
		var tok = genToken, v = S.v, daily = S.deal === "d" && !opt.seed;
		if (daily && M.DAILY.indexOf(v) < 0) { v = S.v = LEVELS[gameOf(v)][0]; save(); syncSetup(); }
		if (daily) {
			var date = M.utcDate(), dk = date + "|" + v;
			var known = S.daily[dk] && S.daily[dk].seed;
			if (known) return start(v, known, date);
			showBusy("Finding today's deal…");
			setTimeout(function () { if (tok !== genToken) return; var c = M.dailyCanon(date, v); (S.daily[dk] = S.daily[dk] || {}).seed = c.seed; save(); start(v, c.seed, date); }, 30);
			return;
		}
		if (seed != null) return start(v, String(seed), "");
		var g = gameOf(v);
		function rnd() { return g === "f" ? String(1 + Math.floor(Math.random() * 1000000)) : Math.random().toString(36).slice(2, 10); }
		if (!S.win || g === "s" || (g === "f" && v !== "f4")) return start(v, rnd(), "");
		if (g === "f") { var n; do { n = rnd(); } while (M.FC_UNSOLVABLE.indexOf(+n) >= 0); return start(v, n, ""); }
		showBusy("Finding a winnable deal…");
		var tries = 0;
		(function next() {
			if (tok !== genToken) return;
			var s = rnd(), r = M.solve(v, s, 40000);
			tries++;
			if (r.win || tries >= 25) return start(v, s, "", r.win ? "" : "No winnable deal found quickly: this one may not be winnable.");
			setTimeout(next, 0);
		})();
	}
	function start(v, seed, date, note) {
		hideBusy();
		abandon();
		S.v = v;
		cur = { v: v, seed: seed, d: date || "", list: [], groups: [], u: 0, h: 0, carry: 0, won: false };
		G = M.newGame(v, seed);
		sel = null; kbCur = null; tapMemo = null; finishing = false; lastAt = 0;
		$("sl-after").hidden = true; $("sl-after").innerHTML = "";
		build(true);
		persist();
		updateInfo();
		var V = M.VARIANTS[v];
		status(note || (date ? "Today's " + V.name + " deal (" + date + ", UTC): the same cards for everyone." : V.name + ", deal " + seed + "."));
		describe();
		syncSetup();
		if (date) dailyPlayers();
	}
	/** a game left unfinished counts as a loss (it breaks the win streak) */
	function abandon() {
		if (!cur || cur.won || !cur.list.length) return;
		var st = stat(cur.v); st.cur = 0; save();
	}
	function persist() {
		if (!cur) return;
		S.cur = { v: cur.v, seed: cur.seed, d: cur.d, mv: M.encMoves(cur.list), groups: cur.groups, u: cur.u, h: cur.h, carry: cur.carry, won: cur.won };
		save();
	}
	function resume() {
		var c = S.cur;
		if (!c || c.won || !M.VARIANTS[c.v]) return false;
		if (c.d && c.d !== M.utcDate()) return false;
		var list = M.decMoves(c.mv || "");
		if (!list) return false;
		var rp = M.replay(c.v, c.seed, list);
		if (!rp.ok) return false;
		S.v = c.v; if (c.d) S.deal = "d";
		cur = { v: c.v, seed: c.seed, d: c.d || "", list: list, groups: c.groups || [], u: c.u | 0, h: c.h | 0, carry: c.carry || 0, won: false };
		G = rp.game;
		lastAt = list.length ? now() : 0;
		build(false);
		updateInfo();
		if (list.length) startTimer();
		status("Your game is back where you left it. " + (c.d ? "(Today's daily deal.)" : ""));
		describe(); syncSetup();
		return true;
	}

	/* ---------- moves ---------- */
	function apply(m, userStart) {
		if (!G.move(m[0], m[1], m[2])) return false;
		var t = now(), dt = cur.list.length ? (lastAt ? t - lastAt : 0) : 0;
		if (!cur.list.length) startTimer();
		dt += cur.carry || 0; cur.carry = 0;
		lastAt = t;
		if (userStart) cur.groups.push(cur.list.length);
		cur.list.push([m[0], m[1], m[2], Math.round(dt)]);
		return true;
	}
	function act(m) {
		if (busy || finishing || !cur || cur.won) return false;
		var why = G.why(m[0], m[1], m[2]);
		if (why) { status(why); return false; }
		apply(m, true);
		sel = null;
		autoPlay();
		after();
		return true;
	}
	function autoPlay() {
		if (!S.auto) return;
		var m, guard = 0;
		while ((m = G.safeAuto()) && guard++ < 60) apply(m, false);
	}
	function after() {
		render();
		updateInfo();
		persist();
		if (G.won()) return win();
		var fin = canFinish();
		$("sl-finish").hidden = !fin;
		if (fin && S.auto && G.g === "k" && !G.p[0].length && !G.p[1].length) finish();
	}
	function canFinish() { return G && !G.won() && G.g !== "s" && !!M.autoFinish(G); }
	function finish() {
		var moves = M.autoFinish(G);
		if (!moves || finishing) return;
		finishing = true;
		var i = 0, first = true;
		(function step() {
			if (!cur || cur.won) { finishing = false; return; }
			if (i >= moves.length) { finishing = false; after(); return; }
			apply(moves[i++], first); first = false;
			render(); updateInfo();
			setTimeout(step, 70);
		})();
	}
	function undo() {
		if (busy || finishing || !cur || cur.won || !cur.groups.length) return;
		var at = cur.groups.pop(), gone = cur.list.slice(at);
		gone.forEach(function (m) { cur.carry = (cur.carry || 0) + m[3]; });
		cur.list = cur.list.slice(0, at);
		cur.u++;
		G = M.replay(cur.v, cur.seed, cur.list).game;
		sel = null;
		status("Undone.");
		render(); updateInfo(); persist();
		$("sl-finish").hidden = !canFinish();
	}
	function restart() {
		if (!cur) return;
		if (cur.list.length && !cur.won && !confirm("Start this deal again from the beginning?")) return;
		start(cur.v, cur.seed, cur.d);
	}
	function hint() {
		if (!G || cur.won) return;
		var m = G.hint();
		clearHint();
		if (!m) { status(G.g === "f" ? "No useful moves left: undo a few moves or start a new deal." : "No useful moves: undo, or start a new deal."); return; }
		cur.h++; persist();
		if (m[0] === 0 && m[1] === 0 && m[2] === 0) { markHint([], 0); status(G.g === "s" ? "Deal a new row from the stock." : "Turn a card from the stock."); return; }
		var a = G.p[m[0]], ids = a.slice(a.length - m[1]);
		markHint(ids, m[2]);
		status("Move " + M.name(ids[0], G.suitOf.bind(G)) + (m[1] > 1 ? " (and the " + (m[1] - 1) + " card" + (m[1] > 2 ? "s" : "") + " on it)" : "") + " to " + pileName(m[2]) + ".");
	}
	function markHint(ids, pile) {
		ids.forEach(function (id) { if (els[id]) els[id].classList.add("is-hint"); });
		var top = G.top(pile);
		if (top !== null && top >= 0 && els[top] && ids.length) els[top].classList.add("is-hint");
		else if (slots[pile]) slots[pile].classList.add("is-hint");
		hintT = setTimeout(clearHint, 2200);
	}
	function clearHint() {
		clearTimeout(hintT);
		Array.prototype.forEach.call(root.querySelectorAll(".is-hint"), function (e) { e.classList.remove("is-hint"); });
	}
	function pileName(i) {
		var k = G.kind(i);
		if (k === "found") return G.g === "s" ? "the finished runs" : "the " + M.SUIT_NAMES[G.foundSuit(i)] + " foundation";
		if (k === "cell") return "a free cell";
		if (k === "waste") return "the waste";
		if (k === "stock") return "the stock";
		var t = G.tab()[0];
		return (G.p[i].length ? "column " : "the empty column ") + (i - t + 1);
	}

	/* ---------- win ---------- */
	function win() {
		cur.won = true;
		stopTimer();
		$("sl-finish").hidden = true;
		var t = elapsed(), st = stat(cur.v);
		st.w++; st.cur++; st.best = Math.max(st.best, st.cur);
		if (!st.bt || t < st.bt) st.bt = Math.round(t);
		if (!st.bm || cur.list.length < st.bm) st.bm = cur.list.length;
		if (G.g !== "f" && (st.bs == null || G.score > st.bs)) st.bs = G.score;
		if (cur.d) { var dk = cur.d + "|" + cur.v, dd = S.daily[dk] = S.daily[dk] || {}; if (!dd.best || t < dd.best) dd.best = Math.round(t); }
		var rec = M.record(cur.v, cur.seed, cur.list, { d: cur.d || undefined, u: cur.u, h: cur.h });
		S.last = { won: true, rec: rec };
		persist();
		celebrate();
		var box = $("sl-after");
		box.innerHTML = "<h3>You won!</h3><p>" + esc(M.VARIANTS[cur.v].name) + (cur.d ? " · today's daily deal" : " · deal " + esc(cur.seed)) + "</p><p>Time <b>" + M.fmtTime(t) + "</b> · " + cur.list.length + " moves" + (G.g !== "f" ? " · score <b>" + G.score + "</b>" : "") + (cur.u ? " · " + cur.u + " undo" + (cur.u > 1 ? "s" : "") : "") + "</p>" +
			'<p><button type="button" class="tu-btn tu-btn--primary" id="sl-again">Deal again</button> <button type="button" class="tu-btn" id="sl-hivego">Save to Hive</button></p><div id="sl-hbox"></div>';
		box.hidden = false;
		$("sl-again").addEventListener("click", function () { newDeal(); });
		$("sl-hivego").addEventListener("click", function () { this.hidden = true; hiveBox(); });
		status("Solved in " + M.fmtTime(t) + ".");
		renderStats();
	}
	function celebrate() {
		if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		var ids = Object.keys(els), i = 0, W = L.W, H = L.H;
		var timer = setInterval(function () {
			for (var k = 0; k < 4 && i < ids.length; k++, i++) {
				var e = els[ids[i]], x = Math.random() * (W - L.cw), y = H * 0.25 + Math.random() * H * 0.6;
				e.style.transition = "transform 0.9s cubic-bezier(.2,.7,.3,1)";
				e.style.transform = "translate(" + x + "px," + y + "px) rotate(" + (Math.random() * 60 - 30) + "deg)";
			}
			if (i >= ids.length) clearInterval(timer);
		}, 40);
	}
	function stat(v) {
		var s = S.stats[v] = S.stats[v] || {};
		["p", "w", "cur", "best"].forEach(function (k) { if (typeof s[k] !== "number") s[k] = 0; });
		return s;
	}

	/* ---------- timer + info ---------- */
	function startTimer() { if (!tick) tick = setInterval(updateInfo, 500); if (cur && cur.list.length === 1) { stat(cur.v).p++; save(); } }
	function stopTimer() { clearInterval(tick); tick = null; }
	function updateInfo() {
		$("sl-time").textContent = M.fmtTime(elapsed());
		$("sl-moves").textContent = cur ? cur.list.length : 0;
		$("sl-scorebox").hidden = !G || G.g === "f";
		if (G) $("sl-score").textContent = G.score;
		$("sl-undo").disabled = !cur || cur.won || !cur.groups.length;
	}

	/* ---------- drawing ---------- */
	function cardHtml(id) {
		var r = M.rank(id), s = G.suitOf(id), sym = M.SUITS[s] + "︎", rk = M.RANKS[r];
		var mid = r > 10 ? '<span class="mid fc">' + rk + "</span>" : '<span class="mid">' + sym + "</span>";
		return '<div class="f"><span class="c1">' + rk + "<i>" + sym + '</i></span>' + mid + '<span class="c2">' + rk + "<i>" + sym + "</i></span></div><div class=\"bk\"></div>";
	}
	function build(dealAnim) {
		var tb = $("sl-table");
		tb.innerHTML = ""; els = {}; slots = {};
		root.setAttribute("data-back", S.back);
		for (var i = 0; i < G.p.length; i++) {
			if (!showSlot(i)) continue;
			var sd = document.createElement("div");
			sd.className = "sl-slot";
			sd.setAttribute("data-pile", i);
			tb.appendChild(sd); slots[i] = sd;
		}
		var n = G.g === "s" ? 104 : 52;
		for (var id = 0; id < n; id++) {
			var e = document.createElement("div");
			e.className = "sl-card" + (M.red(G.suitOf(id)) ? " red" : "");
			e.setAttribute("data-id", id);
			e.innerHTML = cardHtml(id);
			tb.appendChild(e); els[id] = e;
		}
		layout();
		if (dealAnim && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
			var sp = stockPoint();
			Object.keys(els).forEach(function (id) { var e = els[id]; e.style.transition = "none"; e.style.transform = "translate(" + sp[0] + "px," + sp[1] + "px)"; });
			void tb.offsetWidth;
			var order = 0;
			for (var p = 0; p < G.p.length; p++) G.p[p].forEach(function (c) { var e = els[c < 0 ? ~c : c]; e.style.transition = ""; e.style.transitionDelay = G.isTab(p) ? (order++ * 12) + "ms" : "0ms"; });
			render();
			setTimeout(function () { Object.keys(els).forEach(function (id) { els[id].style.transitionDelay = ""; }); }, 1500);
		} else render();
	}
	function showSlot(i) {
		var k = G.kind(i);
		if (k === "none") return false;
		if (G.g === "s" && k === "found") return i === 1;
		return true;
	}
	function stockPoint() { return G.g === "f" ? [L.W / 2 - L.cw / 2, -L.ch * 1.4] : [colX(G.g === "s" ? 9 : 0), L.top]; }
	function colX(c) { return L.x0 + c * (L.cw + L.gap); }
	function layout() {
		var stage = $("sl-stage"), W = Math.max(280, stage.clientWidth), cols = G.g === "k" ? 7 : G.g === "s" ? 10 : 8;
		var gap = Math.max(4, Math.round(W * 0.012)), cw = Math.floor((W - gap * (cols + 1)) / cols);
		var fill = root.querySelector(".sl-view.mes-pfill") !== null || document.fullscreenElement;
		var maxCw = fill ? 200 : 128;
		var availH = fill ? stage.clientHeight : Math.max(380, Math.min(window.innerHeight - 90, 1100));
		cw = Math.min(cw, maxCw, Math.floor((availH - gap * 3) / 1.4 / 3.2));
		cw = Math.max(cw, 34);
		var ch = Math.round(cw * 1.4), used = cols * cw + (cols - 1) * gap;
		L = { W: W, cw: cw, ch: ch, gap: gap, x0: Math.round((W - used) / 2), top: gap, cols: cols, availH: availH, fill: fill };
		L.tabTop = L.top + ch + gap * 1.6;
		var fs = Math.max(10, Math.round(cw * 0.22));
		$("sl-table").style.fontSize = fs + "px";
		Object.keys(els).forEach(function (id) { var e = els[id]; e.style.width = cw + "px"; e.style.height = ch + "px"; e.style.borderRadius = Math.round(cw * 0.08) + "px"; });
		Array.prototype.forEach.call(root.querySelectorAll(".sl-card .mid"), function (m) { m.style.fontSize = (m.classList.contains("fc") ? cw * 0.42 : cw * 0.5) + "px"; });
	}
	/** where each card goes: {x, y} per pile and index; also sets the table height */
	function positions() {
		var P = G.p, pos = [], i, j, t = G.tab();
		var hMax = L.availH - L.gap;
		for (i = 0; i < P.length; i++) {
			var a = P[i], out = [], k = G.kind(i), x, y;
			if (G.isTab(i)) {
				x = colX(i - t[0]); y = L.tabTop;
				var dn = L.ch * 0.11, up = L.ch * 0.27, need = 0;
				for (j = 0; j < a.length - 1; j++) need += a[j] < 0 ? dn : up;
				var room = Math.max(L.ch * 1.2, hMax - L.tabTop - L.ch), sc = need > room ? room / need : 1;
				for (j = 0; j < a.length; j++) { out.push({ x: x, y: y }); y += (a[j] < 0 ? dn : up) * sc; }
			} else if (G.g === "k") {
				if (k === "stock") { for (j = 0; j < a.length; j++) out.push({ x: colX(0) - Math.floor(j / 8) * 1.5, y: L.top - Math.floor(j / 8) * 1.5 }); }
				else if (k === "waste") {
					var fan = G.V.draw === 3 ? L.cw * 0.24 : 0, vis = Math.min(3, a.length);
					for (j = 0; j < a.length; j++) { var off = j >= a.length - vis ? (j - (a.length - vis)) * fan : 0; out.push({ x: colX(1) + off, y: L.top }); }
				} else for (j = 0; j < a.length; j++) out.push({ x: colX(1 + i), y: L.top });   // foundations 2-5 -> columns 3-6
			} else if (G.g === "s") {
				if (k === "stock") { for (j = 0; j < a.length; j++) out.push({ x: colX(9) - Math.floor(j / 10) * L.cw * 0.18, y: L.top }); }
				else for (j = 0; j < a.length; j++) out.push({ x: colX(0) + (i - 1) * L.cw * 0.3, y: L.top });
			} else {
				for (j = 0; j < a.length; j++) out.push({ x: colX(i), y: L.top });   // cells 0-3, foundations 4-7
			}
			pos.push(out);
		}
		return pos;
	}
	function slotRect(i) {
		var t = G.tab();
		if (G.isTab(i)) return { x: colX(i - t[0]), y: L.tabTop };
		if (G.g === "k") return { x: colX(i === 0 ? 0 : i === 1 ? 1 : 1 + i), y: L.top };
		if (G.g === "s") return { x: i === 0 ? colX(9) : colX(0), y: L.top };
		return { x: colX(i), y: L.top };
	}
	function render() {
		if (!G) return;
		var pos = positions(), maxY = L.tabTop + L.ch, z = 1;
		where = {};
		for (var i = 0; i < G.p.length; i++) {
			var a = G.p[i];
			for (var j = 0; j < a.length; j++) {
				var c = a[j], id = c < 0 ? ~c : c, e = els[id], p = pos[i][j];
				where[id] = [i, j];
				e.classList.toggle("up", c >= 0);
				if (!e.classList.contains("is-drag")) e.style.transform = "translate(" + p.x + "px," + p.y + "px)";
				var zz = G.g === "s" && G.kind(i) === "found" ? 100 + i * 20 + (13 - j) : z + j;
				e.style.zIndex = e.classList.contains("is-drag") ? 5000 + j : zz;
				e.classList.toggle("can", c >= 0 && a.length - j <= G.movable(i));
				e.classList.toggle("is-pick", !!(sel && sel.pile === i && j >= a.length - sel.n));
				if (p.y + L.ch > maxY) maxY = p.y + L.ch;
			}
			z += 60;
		}
		// cards no longer on the table (none in these games, but keep hidden ones out of the way)
		Object.keys(slots).forEach(function (pi) {
			var s = slots[pi], r = slotRect(+pi), i2 = +pi, k = G.kind(i2);
			s.style.left = r.x + "px"; s.style.top = r.y + "px"; s.style.width = L.cw + "px"; s.style.height = L.ch + "px"; s.style.borderRadius = Math.round(L.cw * 0.08) + "px";
			var label = "";
			if (k === "found") label = G.g === "s" ? "K→A" : "A" + M.SUITS[G.foundSuit(i2)] + "︎";
			else if (k === "stock") label = G.g === "k" ? (G.p[1].length && !(G.V.passes && G.passes >= G.V.passes - 1) ? "↻" : "") : "";
			else if (k === "tab" && G.g === "k") label = "K";
			s.textContent = label;
			s.style.fontSize = Math.round(L.cw * (label.length > 2 ? 0.2 : 0.32)) + "px";
			s.classList.toggle("is-click", k === "stock");
			s.classList.toggle("is-cur", !!(kbCur && kbCur.pile === i2 && !G.p[i2].length));
		});
		if (kbCur) { var top = G.top(kbCur.pile), a2 = G.p[kbCur.pile]; Object.keys(els).forEach(function (id) { els[id].classList.remove("is-cur"); }); if (a2.length) { var cid = a2[Math.max(0, a2.length - kbCur.n)]; els[cid < 0 ? ~cid : cid].classList.add("is-cur"); } void top; }
		var H = Math.max(Math.ceil(maxY + L.gap), L.fill ? $("sl-stage").clientHeight : 0, Math.round(L.tabTop + L.ch * 3.4));
		L.H = H;
		$("sl-table").style.height = H + "px";
		$("sl-table").style.width = "100%";
	}

	/* ---------- pointer: drag and tap ---------- */
	var drag = null;
	$("sl-table").addEventListener("pointerdown", function (e) {
		if (e.button > 0 || busy || !G || cur.won || finishing) return;
		var ce = e.target.closest(".sl-card"), se = e.target.closest(".sl-slot");
		clearHint();
		if (!ce) {
			if (se && G.kind(+se.getAttribute("data-pile")) === "stock") { e.preventDefault(); act([0, 0, 0]); return; }
			if (se && sel) { e.preventDefault(); tryMove(sel.pile, sel.n, +se.getAttribute("data-pile")); return; }
			return;
		}
		var id = +ce.getAttribute("data-id"), w = where[id];
		if (!w) return;
		var pile = w[0], idx = w[1], a = G.p[pile], n = a.length - idx;
		if (G.kind(pile) === "stock") { e.preventDefault(); act([0, 0, 0]); return; }
		if (sel && !(sel.pile === pile)) { e.preventDefault(); tryMove(sel.pile, sel.n, pile); return; }
		if (a[idx] < 0 || n > G.movable(pile)) { ce.classList.add("shake"); setTimeout(function () { ce.classList.remove("shake"); }, 320); return; }
		e.preventDefault();
		var ids = a.slice(idx).map(function (c) { return c; });
		var rect = $("sl-table").getBoundingClientRect(), p0 = positions()[pile][idx];
		drag = { pile: pile, n: n, ids: ids, x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId, base: positions()[pile].slice(idx), off: [e.clientX - rect.left - p0.x, e.clientY - rect.top - p0.y] };
		try { ce.setPointerCapture(e.pointerId); } catch (er) {}
	});
	$("sl-table").addEventListener("pointermove", function (e) {
		if (!drag || e.pointerId !== drag.pid) return;
		var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
		if (!drag.moved && dx * dx + dy * dy < 36) return;
		if (!drag.moved) { drag.moved = true; drag.ids.forEach(function (id) { els[id].classList.add("is-drag"); }); }
		drag.ids.forEach(function (id, k) { var e2 = els[id], b = drag.base[k]; e2.style.zIndex = 5000 + k; e2.style.transform = "translate(" + (b.x + dx) + "px," + (b.y + dy) + "px)"; });
		drag.dx = dx; drag.dy = dy;
	});
	function endDrag(e, cancel) {
		if (!drag || (e && e.pointerId !== drag.pid)) return;
		var d = drag; drag = null;
		d.ids.forEach(function (id) { els[id].classList.remove("is-drag"); });
		if (cancel) { render(); return; }
		if (!d.moved) return tap(d.pile, d.n);
		var x = d.base[0].x + d.dx, y = d.base[0].y + d.dy, best = null, bestA = 0, bestBad = null, bestBadA = 0;
		for (var i = 0; i < G.p.length; i++) {
			if (i === d.pile) continue;
			var k = G.kind(i);
			if (k === "stock" || k === "waste" || k === "none") continue;
			var r = dropRect(i), ov = Math.max(0, Math.min(x + L.cw, r.x + r.w) - Math.max(x, r.x)) * Math.max(0, Math.min(y + L.ch, r.y + r.h) - Math.max(y, r.y));
			if (ov <= 0) continue;
			if (G.legal(d.pile, d.n, i)) { if (ov > bestA) { bestA = ov; best = i; } }
			else if (ov > bestBadA) { bestBadA = ov; bestBad = i; }
		}
		if (best !== null) { act([d.pile, d.n, best]); return; }
		if (bestBad !== null) status(G.why(d.pile, d.n, bestBad));
		render();
	}
	$("sl-table").addEventListener("pointerup", function (e) { endDrag(e, false); });
	$("sl-table").addEventListener("pointercancel", function (e) { endDrag(e, true); });
	function dropRect(i) {
		var a = G.p[i], s = slotRect(i);
		if (G.isTab(i)) { var pos = positions()[i], ly = a.length ? pos[a.length - 1].y : s.y; return { x: s.x - L.gap / 2, y: s.y, w: L.cw + L.gap, h: ly - s.y + L.ch + L.ch * 0.4 }; }
		if (G.g === "s") return { x: 0, y: 0, w: 0, h: 0 };
		return { x: s.x - L.gap / 2, y: s.y - L.gap / 2, w: L.cw + L.gap, h: L.ch + L.gap };
	}
	/** tap a card: send it to the best place; tap the same card again soon to try the next place */
	function tap(pile, n) {
		var dests = destinations(pile, n);
		if (!dests.length) {
			status(G.g === "f" || n === 1 ? "That card has nowhere to go." : "Those cards have nowhere to go.");
			var a = G.p[pile], c = a[a.length - n], e = els[c < 0 ? ~c : c];
			if (e) { e.classList.add("shake"); setTimeout(function () { e.classList.remove("shake"); }, 320); }
			return;
		}
		var a2 = G.p[pile], cardId = a2[a2.length - n], nowT = Date.now();
		// tapping the card just moved again: try the next place, never straight back where it came from
		if (tapMemo && tapMemo.id === cardId && nowT - tapMemo.at < 2500) {
			var other = dests.filter(function (d) { return tapMemo.seen.indexOf(d) < 0; });
			if (other.length) dests = other;
		} else tapMemo = null;
		var to = dests[0], seen = tapMemo ? tapMemo.seen : [pile];
		if (act([pile, n, to])) { seen.push(to); tapMemo = { id: cardId, at: nowT, seen: seen }; }
	}
	function destinations(pile, n) {
		var out = [], fnd = [], tabsFull = [], tabsEmpty = [], cells = [], i;
		for (i = 0; i < G.p.length; i++) {
			if (i === pile || !G.legal(pile, n, i)) continue;
			var k = G.kind(i);
			if (k === "found") fnd.push(i);
			else if (k === "cell") cells.push(i);
			else if (k === "tab") (G.p[i].length ? tabsFull : tabsEmpty).push(i);
		}
		if (G.kind(pile) === "found") fnd = [];
		// spider: prefer columns whose top card has the same suit
		if (G.g === "s") {
			var a = G.p[pile], c = a[a.length - n];
			tabsFull.sort(function (x, y) { return sameSuit(y, c) - sameSuit(x, c); });
		}
		out = fnd.concat(tabsFull, tabsEmpty.slice(0, 1), cells.slice(0, 1));
		return out;
	}
	function sameSuit(p, c) { var t = G.top(p); return t !== null && t >= 0 && G.suitOf(t) === G.suitOf(c) ? 1 : 0; }
	function tryMove(f, n, t) {
		if (f === t) { sel = null; render(); return; }
		if (!act([f, n, t])) { sel = null; render(); }
	}

	/* ---------- keyboard ---------- */
	function kbPiles() {
		var out = [], i, t = G.tab();
		if (G.g === "k") out.push(0, 1, 2, 3, 4, 5);
		else if (G.g === "s") out.push(0);
		else { for (i = 0; i < G.V.cells; i++) out.push(i); out.push(4, 5, 6, 7); }
		for (i = t[0]; i < t[1]; i++) out.push(i);
		return out;
	}
	$("sl-table").addEventListener("keydown", function (e) {
		if (!G || e.ctrlKey || e.metaKey || e.altKey) return;
		var piles = kbPiles();
		if (!kbCur) kbCur = { pile: G.tab()[0], n: 1 };
		var idx = piles.indexOf(kbCur.pile), key = e.key, a;
		if (key === "ArrowRight" || key === "ArrowLeft") {
			idx = (idx + (key === "ArrowRight" ? 1 : piles.length - 1)) % piles.length;
			kbCur = { pile: piles[idx], n: 1 };
		} else if (key === "ArrowUp" || key === "ArrowDown") {
			a = G.p[kbCur.pile];
			var mx = Math.max(1, G.movable(kbCur.pile));
			kbCur.n = Math.max(1, Math.min(mx, kbCur.n + (key === "ArrowUp" ? 1 : -1)));
			void a;
		} else if (key === "Enter" || key === " ") {
			var k2 = G.kind(kbCur.pile);
			if (k2 === "stock") act([0, 0, 0]);
			else if (sel) { if (sel.pile === kbCur.pile) { var s0 = sel; sel = null; tap(s0.pile, s0.n); } else tryMove(sel.pile, sel.n, kbCur.pile); }
			else if (G.movable(kbCur.pile)) { sel = { pile: kbCur.pile, n: Math.min(kbCur.n, G.movable(kbCur.pile)) }; status("Picked up " + sel.n + " card" + (sel.n > 1 ? "s" : "") + ": choose where to put " + (sel.n > 1 ? "them" : "it") + " and press Enter (Enter again on the same pile = best place)."); }
		} else if (key === "Escape") { sel = null; }
		else return;
		e.preventDefault();
		render();
	});
	document.addEventListener("keydown", function (e) {
		var tag = (e.target && e.target.tagName) || "";
		if (/INPUT|TEXTAREA|SELECT/.test(tag) || $("sl-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); undo(); return; }
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (k === "u") undo();
		else if (k === "h") hint();
		else if (k === "n") newDeal();
		else if (k === "f" && !$("sl-finish").hidden) finish();
		else if (k === "d" || k === "s") { if (G && G.g !== "f") act([0, 0, 0]); }
		else return;
		e.preventDefault();
	});

	/* ---------- busy overlay ---------- */
	function showBusy(msg) { busy = true; var b = root.querySelector(".sl-busy"); if (!b) { b = document.createElement("div"); b.className = "sl-busy"; $("sl-stage").appendChild(b); } b.textContent = msg; }
	function hideBusy() { busy = false; var b = root.querySelector(".sl-busy"); if (b) b.remove(); }

	/* ---------- setup controls ---------- */
	function seg(id, val) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === val ? "true" : "false"); }); }
	function wireSeg(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (b) fn(b.getAttribute("data-v")); }); }
	var LEVEL_NAMES = { k: ["Easy: draw 1", "Medium: draw 3", "Hard: 3 passes"], s: ["Easy: 1 suit", "Medium: 2 suits", "Hard: 4 suits"], f: ["Easy: 4 cells", "Medium: 3 cells", "Hard: 2 cells"] };
	function syncSetup() {
		var g = gameOf(S.v), lv = LEVELS[g].indexOf(S.v);
		seg("sl-g", g); seg("sl-lv", String(lv)); seg("sl-dl", S.deal);
		Array.prototype.forEach.call($("sl-lv").querySelectorAll("button"), function (b, i) { b.textContent = LEVEL_NAMES[g][i]; b.disabled = S.deal === "d" && i > 0; });
		$("sl-win").checked = S.win; $("sl-auto").checked = S.auto; $("sl-back").value = S.back;
		$("sl-win").disabled = S.deal === "d" || g === "s";
		$("sl-seed").placeholder = g === "f" ? "1 to 1000000" : "any number or word";
		if (cur) $("sl-seed").value = cur.d ? "" : cur.seed;
	}
	function describe() {
		var V = M.VARIANTS[S.v], g = V.g, txt = "";
		if (g === "k") txt = "Build Ace to King on the four foundations; in the columns, red on black going down. " + (V.draw === 1 ? "One card at a time from the stock." : "Three cards at a time from the stock" + (V.passes ? ", only three passes." : "."));
		else if (g === "s") txt = "Build King to Ace in one suit to clear a run. Any card goes on one rank higher, but only same-suit runs move together. " + V.suits + " suit" + (V.suits > 1 ? "s" : "") + ".";
		else txt = "Every card is face up. Use the " + V.cells + " free cells, build down in alternating colours, and send everything to the foundations.";
		if (S.deal === "d") txt += " The daily deal is the same for everyone today" + (g === "k" ? " and always winnable." : ".");
		else if (S.win && g === "k") txt += " Winnable deals only: the computer has won this deal itself first.";
		else if (S.win && g === "f" && V.cells === 4) txt += " Every FreeCell deal you get can be won.";
		else if (g === "s") txt += V.suits === 1 ? " One-suit deals can almost always be won." : " Not every " + V.suits + "-suit deal can be won.";
		var st = S.stats[S.v];
		if (st && st.w) txt += " Your best: " + M.fmtTime(st.bt) + ", " + st.w + " win" + (st.w > 1 ? "s" : "") + " of " + st.p + ".";
		var dd = S.deal === "d" && S.daily[M.utcDate() + "|" + S.v];
		if (dd && dd.best) txt += " Your best on today's deal: " + M.fmtTime(dd.best) + ".";
		$("sl-desc").textContent = txt;
	}
	function confirmLeave() { return !cur || cur.won || !cur.list.length || confirm("Leave this game? It will count as a loss."); }
	wireSeg("sl-g", function (g) { if (gameOf(S.v) === g || !confirmLeave()) return; S.v = LEVELS[g][S.deal === "d" ? 0 : Math.max(0, LEVELS[gameOf(S.v)].indexOf(S.v))]; save(); newDeal(); });
	wireSeg("sl-lv", function (i) { var v = LEVELS[gameOf(S.v)][+i]; if (v === S.v || !confirmLeave()) return; S.v = v; save(); newDeal(); });
	wireSeg("sl-dl", function (d) { if (d === S.deal || !confirmLeave()) return; S.deal = d; save(); newDeal(); });
	$("sl-win").addEventListener("change", function () { S.win = this.checked; save(); describe(); });
	$("sl-auto").addEventListener("change", function () { S.auto = this.checked; save(); if (S.auto && cur && !cur.won && cur.list.length) { autoPlay(); after(); } });
	$("sl-back").addEventListener("change", function () { S.back = this.value; save(); root.setAttribute("data-back", S.back); });
	function playSeed() {
		var s = ($("sl-seed").value || "").trim();
		if (!s) return toast("Type a deal number or word first.");
		if (gameOf(S.v) === "f" && !(/^\d+$/.test(s) && +s >= 1 && +s <= 1000000)) return toast("FreeCell deals are numbered 1 to 1,000,000.");
		if (!confirmLeave()) return;
		S.deal = "r"; save(); newDeal(s, { seed: true });
	}
	$("sl-seedgo").addEventListener("click", playSeed);
	$("sl-seed").addEventListener("keydown", function (e) { if (e.key === "Enter") playSeed(); });
	$("sl-share").addEventListener("click", function () {
		if (!cur) return;
		var url = location.origin + "/solitaire?v=" + cur.v + (cur.d ? "&daily=1" : "&s=" + encodeURIComponent(cur.seed));
		(navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link to this deal copied."); }, function () { prompt("Copy this link:", url); });
	});
	$("sl-new").addEventListener("click", function () { if (confirmLeave()) newDeal(); });
	$("sl-restart").addEventListener("click", restart);
	$("sl-undo").addEventListener("click", undo);
	$("sl-hint").addEventListener("click", hint);
	$("sl-finish").addEventListener("click", finish);

	/* tabs */
	$("sl-tabs").addEventListener("click", function (e) {
		var b = e.target.closest(".sl-tab"); if (!b) return;
		showTab(b.getAttribute("data-t"));
	});
	function showTab(t) {
		Array.prototype.forEach.call($("sl-tabs").children, function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
		["play", "lb", "stats"].forEach(function (x) { $("sl-p-" + x).hidden = x !== t; });
		if (t === "lb") { renderLogin(); loadLb(); }
		if (t === "stats") renderStats();
		if (t === "play") { layout(); render(); }
	}

	/* resize */
	var rT;
	function relayout() { if (!G) return; clearTimeout(rT); rT = setTimeout(function () { layout(); render(); }, 60); }
	window.addEventListener("resize", relayout);
	if (window.ResizeObserver) new ResizeObserver(relayout).observe($("sl-stage"));
	function wirePanel() {
		if (!window.MESPanel || $("sl-view").__mesPanel) return;
		window.MESPanel.add($("sl-view"), { bar: $("sl-vbar").querySelector(".sl-vbtns"), stage: $("sl-stage"), onChange: function () { setTimeout(function () { layout(); render(); }, 40); } });
		$("sl-view").__mesPanel = true;
	}
	if (document.readyState === "complete") wirePanel(); else window.addEventListener("load", wirePanel);
	document.addEventListener("visibilitychange", function () {
		// time away from the page is not counted
		if (!cur || cur.won || !cur.list.length) return;
		if (document.hidden) { cur.carry = (cur.carry || 0) + (now() - lastAt); lastAt = 0; persist(); }
		else lastAt = now();
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var html = '<div class="sl-sgrid">', any = false;
		Object.keys(M.VARIANTS).forEach(function (v) {
			var s = S.stats[v];
			if (!s || !s.p) return;
			any = true;
			html += '<div class="sl-sbox"><h3>' + esc(M.VARIANTS[v].name) + "</h3><dl><dt>Played</dt><dd>" + s.p + "</dd><dt>Won</dt><dd>" + (s.w | 0) + " (" + Math.round((s.w | 0) / s.p * 100) + "%)</dd><dt>Win streak</dt><dd>" + (s.cur | 0) + "</dd><dt>Best streak</dt><dd>" + (s.best | 0) + "</dd>" +
				"<dt>Fastest win</dt><dd>" + (s.bt ? M.fmtTime(s.bt) : "—") + "</dd><dt>Fewest moves</dt><dd>" + (s.bm || "—") + "</dd>" + (v[0] !== "f" ? "<dt>Best score</dt><dd>" + (s.bs != null ? s.bs : "—") + "</dd>" : "") + "</dl></div>";
		});
		html += "</div>";
		$("sl-stats").innerHTML = any ? html : '<p class="sl-sub">No games yet.</p>';
	}
	$("sl-sreset").addEventListener("click", function () {
		if (!confirm("Clear all your Solitaire statistics in this browser?")) return;
		S.stats = {}; S.daily = {}; save(); renderStats(); toast("Statistics cleared.");
	});

	/* ---------- Hive ---------- */
	var HV = window.MESHive || null;
	function me() { var u = HV && HV.user && HV.user(); return u ? u.name : (MOCK ? (sessionStorage.getItem("mes-solitaire:mockacct") || "") : ""); }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function loginHtml() {
		var u = me();
		if (u) return '<p class="sl-who">Signed in as ' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b> <button type="button" class="tu-btn" data-h="out">Log out</button></p>';
		return '<div class="sl-hrow"><input class="tu-input" data-h="user" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" data-h="in">Log in with Hive</button></div>' +
			'<p class="tu-note">' + (MOCK ? "Test copy: any username works here and nothing is signed (no Keychain on a local copy)." : "Hive Keychain (the extension, or the Keychain phone app) proves you own the account by signing a message with your posting key. Your keys never leave Keychain.") + "</p>";
	}
	function wireLogin(box, done) {
		box.innerHTML = loginHtml();
		var out = box.querySelector('[data-h="out"]'), inb = box.querySelector('[data-h="in"]'), user = box.querySelector('[data-h="user"]');
		if (out) out.addEventListener("click", function () { if (MOCK && !(HV && HV.user && HV.user())) sessionStorage.removeItem("mes-solitaire:mockacct"); else if (HV) HV.logout(); refreshLogins(); });
		if (inb) {
			var go = function () {
				var n = (user.value || "").trim().replace(/^@/, "").toLowerCase();
				if (MOCK) { if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) return toast("That is not a Hive username."); sessionStorage.setItem("mes-solitaire:mockacct", n); refreshLogins(); if (done) done(); return; }
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
	function renderLogin() { wireLogin($("sl-hlogin")); }
	function refreshLogins() { renderLogin(); if ($("sl-hbox") && $("sl-hbox").childNodes.length) hiveBox(); }
	if (HV && HV.onChange) HV.onChange(function () { refreshLogins(); });
	function hiveBox() {
		var box = $("sl-hbox"); if (!box || !S.last || !S.last.won) return;
		var rec = S.last.rec, u = me();
		box.innerHTML = '<p class="tu-note">Saves one public, permanent message (custom_json id <code>mes_solitaire</code>) from your Hive account with this deal, your time, moves and score and the list of your moves. It uses only your posting key, through Keychain, and costs no HIVE.</p><div class="sl-hl"></div>';
		var hl = box.querySelector(".sl-hl");
		if (!u) { wireLogin(hl, hiveBox); return; }
		hl.innerHTML = '<p class="sl-who">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b></p><p><button type="button" class="tu-btn tu-btn--primary" data-h="send">Sign and save this win</button></p><p class="sl-sub" data-h="msg"></p>';
		hl.querySelector('[data-h="send"]').addEventListener("click", function () { sendHive(rec, u, this, hl.querySelector('[data-h="msg"]')); });
	}
	function sendHive(rec, u, btn, msg) {
		var json = M.json(rec);
		if (json.length > 8000) { msg.textContent = "This game has too many moves to fit in one Hive message."; return; }
		btn.disabled = true; msg.textContent = "Waiting for Keychain…";
		var p = MOCK && !(HV && HV.user && HV.user()) ? Promise.resolve({ trx: "mock" + Date.now().toString(16) }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, M.ID, "Posting", json, "Save a Solitaire win (" + M.VARIANTS[rec.k].short + ", " + M.fmtTime(rec.t) + ")", function (r) {
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
			if (r.ok) msg.innerHTML = "On the leaderboard: <b>#" + r.rank + "</b> of " + r.count + " (" + esc(boardName(r.board)) + ")." + (r.best === false ? " Your earlier result there was better, so it stays." : "");
			else if (r.code === 404 && tries < 8) { msg.textContent = "Waiting for the next Hive block… (" + (tries + 1) + ")"; setTimeout(function () { submit(u, trx, rec, msg, tries + 1); }, 3500); }
			else msg.textContent = "Saved on Hive, but not added to the leaderboard: " + (r.error || "unknown problem") + ".";
		});
	}
	function boardName(key) {
		var p = String(key).split(":"), v = p[p.length - 1], n = M.VARIANTS[v] ? M.VARIANTS[v].name : v;
		return p[0] === "d" ? "daily " + n + ", " + p[1] : "all-time " + n;
	}

	/* ---------- API (or the local stand-in) ---------- */
	function api(method, body, query, rec) {
		if (MOCK) return Promise.resolve(mockApi(method, body, query, rec));
		var url = "/api/solitaire" + (query ? "?" + new URLSearchParams(query).toString() : "");
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(url, opt).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j.code = r.status; if (!r.ok && !j.error) j.error = "HTTP " + r.status; j.ok = r.ok && j.ok !== false; return j; });
		}, function () { return { ok: false, code: 0, error: "Could not reach mes.fm" }; });
	}
	function mockLoad() { try { return JSON.parse(localStorage.getItem("mes-solitaire:mocklb") || "{}"); } catch (e) { return {}; } }
	function mockApi(method, body, query, rec) {
		var db = mockLoad();
		if (method === "POST") {
			var v = M.verify(rec, {});
			if (!v.ok) return { ok: false, code: 422, error: v.why };
			var sc = function (x) { return x.t * 1000 + x.c; };
			var lst = (db[v.board] || []).filter(function (x) { return x.acct !== body.acct; }), old = (db[v.board] || []).filter(function (x) { return x.acct === body.acct; })[0], best = true;
			var row = { acct: body.acct, t: v.t, c: v.c, sc: v.sc, u: rec.u | 0, trx: body.trx, ts: Date.now() };
			if (old && sc(old) <= sc(row)) { best = false; lst.push(old); } else lst.push(row);
			lst.sort(function (a, b) { return sc(a) - sc(b); });
			db[v.board] = lst;
			localStorage.setItem("mes-solitaire:mocklb", JSON.stringify(db));
			return { ok: true, board: v.board, rank: 1 + lst.findIndex(function (x) { return x.acct === body.acct; }), count: lst.length, best: best };
		}
		if (query.daily) { var o = { ok: true }; M.DAILY.forEach(function (v2) { o[v2] = (db["d:" + query.daily + ":" + v2] || []).length; }); return o; }
		var top = (db[query.board] || []).slice(0, +query.n || 25);
		return { ok: true, top: top, count: (db[query.board] || []).length };
	}

	/* ---------- leaderboard ---------- */
	function fillLbv() {
		var sel2 = $("sl-lbv"), list = S.lbk === "d" ? M.DAILY : Object.keys(M.VARIANTS);
		if (list.indexOf(S.lbv) < 0) S.lbv = list[0];
		sel2.innerHTML = list.map(function (v) { return '<option value="' + v + '"' + (v === S.lbv ? " selected" : "") + ">" + esc(M.VARIANTS[v].name) + "</option>"; }).join("");
	}
	function lbKey() { return S.lbk === "d" ? "d:" + M.utcDate() + ":" + S.lbv : "a:" + S.lbv; }
	function loadLb() {
		seg("sl-lbk", S.lbk); fillLbv();
		var key = lbKey();
		$("sl-lbnote").textContent = (MOCK ? "Local test copy: this list is kept in this browser only. The real leaderboard works on mes.fm. " : "") +
			(S.lbk === "d" ? "Today's daily deal (" + M.utcDate() + ", UTC; a new deal starts at midnight UTC). Fastest time first, then fewest moves." : "Any deal of this game, all time. Fastest time first, then fewest moves.");
		$("sl-lb").innerHTML = '<p class="sl-sub">Loading…</p>';
		api("GET", null, { board: key, n: 50 }).then(function (r) {
			if (key !== lbKey()) return;
			if (!r.ok) { $("sl-lb").innerHTML = '<p class="sl-sub">' + esc(r.code === 404 || r.code === 0 ? "The leaderboard works on mes.fm (it could not be reached from here)." : r.error || "Could not load the leaderboard.") + "</p>"; return; }
			var top = r.top || [], u = me();
			if (!top.length) { $("sl-lb").innerHTML = '<p class="sl-sub">No wins yet. Win a game, press "Save to Hive", and yours can be the first.</p>'; return; }
			var showSc = S.lbv[0] !== "f";
			var html = '<div class="sl-twrap"><table class="sl-tbl"><thead><tr><th>#</th><th>Player</th><th class="r">Time</th><th class="r">Moves</th>' + (showSc ? '<th class="r">Score</th>' : "") + '<th class="r">Undos</th><th>Proof</th></tr></thead><tbody>';
			top.forEach(function (x, i) {
				html += '<tr class="' + (x.acct === u ? "me" : "") + '"><td>' + (i + 1) + '</td><td><img alt="" loading="lazy" src="' + esc(avatar(x.acct)) + '"><a href="https://peakd.com/@' + esc(x.acct) + '" target="_blank" rel="noopener">@' + esc(x.acct) + '</a></td><td class="r">' + M.fmtTime(x.t) + '</td><td class="r">' + x.c + "</td>" + (showSc ? '<td class="r">' + x.sc + "</td>" : "") + '<td class="r">' + (x.u | 0) + "</td><td>" +
					(x.trx && !/^mock/.test(x.trx) ? '<a href="https://hivehub.dev/tx/' + esc(x.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "—") + "</td></tr>";
			});
			html += "</tbody></table></div>";
			if (r.count > top.length) html += '<p class="sl-sub">' + r.count + " players in all.</p>";
			$("sl-lb").innerHTML = html;
		});
	}
	wireSeg("sl-lbk", function (v) { S.lbk = v; save(); loadLb(); });
	$("sl-lbv").addEventListener("change", function () { S.lbv = this.value; save(); loadLb(); });
	$("sl-lbref").addEventListener("click", loadLb);
	function dailyPlayers() {
		var d = M.utcDate(), v = S.v;
		if (!navigator.onLine) return;
		api("GET", null, { daily: d }).then(function (r) {
			if (!r.ok || !cur || cur.d !== d || cur.v !== v) return;
			var n = r[v] | 0;
			$("sl-desc").textContent += " " + (n ? n + (n === 1 ? " player has" : " players have") + " a verified time on today's deal." : "No verified times on today's deal yet.");
		});
	}

	/* ---------- offline ---------- */
	function offline() {
		var note = $("sl-offline");
		if (!("serviceWorker" in navigator) || MOCK) { note.textContent = ""; return; }
		navigator.serviceWorker.register("/solitaire-sw.js", { scope: "/solitaire" }).then(function (reg) {
			var done = function () { note.textContent = "✓ Works offline: this page is saved in your browser, so you can open mes.fm/solitaire with no connection."; };
			if (reg.active) done(); else { note.textContent = "Saving the page for offline play…"; navigator.serviceWorker.ready.then(done); }
		}, function () { note.textContent = ""; });
		window.addEventListener("offline", function () { status("You are offline: the game keeps working. The leaderboard and Save to Hive need a connection."); });
	}

	/* ---------- start ---------- */
	syncSetup();
	if (urlDeal) { S.deal = "r"; newDeal(urlDeal, { seed: true }); }
	else if (!resume()) newDeal();
	offline();
	window.MESSolitaireDebug = { game: function () { return G; }, cur: function () { return cur; }, act: act, undo: undo, hint: hint, finish: finish, newDeal: newDeal, S: S, render: render };
})();
