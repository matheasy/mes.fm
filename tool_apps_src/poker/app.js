/* MES Poker page (mes.fm/poker): Play / Odds calculator / Hand rankings / My stats. Logic lives in lib.js (MESPoker). */
(function () {
	"use strict";
	var P = window.MESPoker, root = document.getElementById("pk");
	if (!P || !root) return;
	var KEY = "mes-poker:v1";
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
	function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + "%"; }
	var toastT = 0;
	function toast(msg) { var t = $("pk-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }

	/* ---------- saved state ---------- */
	var ST = { v: 1, settings: { speed: "normal", four: false, showOdds: false, auto: false, setup: { opps: 5, mix: "mixed", stack: 100, rise: 12, mode: "tour" } }, game: null, stats: null, calc: null };
	try { var raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw && raw.v === 1) { ST.settings = Object.assign(ST.settings, raw.settings || {}); ST.game = raw.game || null; ST.stats = raw.stats || null; ST.calc = raw.calc || null; } } catch (e) { }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { } }
	function blankStats() { return { hands: 0, vpip: 0, pfr: 0, sd: 0, sdWon: 0, won: 0, biggest: 0, best: 0, profitBB: 0, cum: [], pos: {} }; }
	if (!ST.stats) ST.stats = blankStats();

	/* ---------- cards ---------- */
	var RD = { 8: "10" };
	function rankTxt(c) { var r = c >> 2; return RD[r] || P.RANKS[r]; }
	function cardName(c) { return P.RANK_NAMES[c >> 2] + " of " + ["spades", "hearts", "diamonds", "clubs"][c & 3]; }
	function cardHTML(c, cls) {
		if (c === "back") return '<span class="pk-card pk-back' + (cls ? " " + cls : "") + '" role="img" aria-label="face-down card"></span>';
		return '<span class="pk-card pk-cs' + (c & 3) + (cls ? " " + cls : "") + '" role="img" aria-label="' + cardName(c) + '"><span class="pk-r">' + rankTxt(c) + '</span><span class="pk-s" aria-hidden="true">' + P.SUIT_SYM[c & 3] + "</span></span>";
	}
	function mini(c) { return '<span class="pk-mini pk-cs' + (c & 3) + '" title="' + cardName(c) + '">' + rankTxt(c) + P.SUIT_SYM[c & 3] + "</span>"; }
	function minis(cs) { return cs.map(mini).join(" "); }
	function applyFour() { root.classList.toggle("pk-four", !!ST.settings.four); }
	applyFour();

	/* ---------- tabs ---------- */
	var TABS = ["play", "odds", "ranks", "stats"], tab = "play";
	function setTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "play";
		tab = t;
		root.querySelectorAll(".pk-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		root.querySelectorAll("section[data-panel]").forEach(function (s) { s.hidden = s.getAttribute("data-panel") !== t; });
		if (t === "odds") ocRender(true);
		if (t === "ranks") rkRender();
		if (t === "stats") stRender();
		if (t === "play") playRender();
		if (push) { try { var u = new URL(location.href); u.search = t === "play" ? "" : "?tab=" + t; history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) { } }
	}
	root.querySelector(".pk-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-tab]"); if (b) setTab(b.getAttribute("data-tab"), true); });
	root.querySelector(".pk-tabs").addEventListener("keydown", function (e) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		var i = TABS.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1); i = (i + TABS.length) % TABS.length;
		setTab(TABS[i], true); root.querySelector('.pk-tabs button[data-tab="' + TABS[i] + '"]').focus();
	});
	function segInit(id, val, cb) {
		var el = $(id);
		function paint(v) { el.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === String(v) ? "true" : "false"); }); }
		paint(val);
		el.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; paint(b.getAttribute("data-v")); cb(b.getAttribute("data-v")); });
		return paint;
	}

	/* =====================================================================
	   PLAY
	   ===================================================================== */
	var NAMES = ["Ana", "Ben", "Chen", "Dara", "Eli", "Femi", "Gia", "Hugo", "Ines", "Jun", "Kofi", "Lena", "Milo", "Nadia", "Omar", "Priya"];
	var LEVELS = [[10, 20], [15, 30], [25, 50], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [5000, 10000]];
	var SPEED = { slow: 1500, normal: 850, fast: 380, instant: 40 };
	var G = ST.game, timer = 0, oddsCache = { key: "", html: "" };
	var su = ST.settings.setup;
	$("pk-opps").value = String(su.opps); $("pk-mix").value = su.mix; $("pk-stack").value = String(su.stack); $("pk-rise").value = String(su.rise);
	segInit("pk-mode", su.mode, function (v) { su.mode = v; save(); });
	segInit("pk-speed", ST.settings.speed, function (v) { ST.settings.speed = v; save(); });
	$("pk-showodds").checked = !!ST.settings.showOdds; $("pk-four").checked = !!ST.settings.four; $("pk-auto").checked = !!ST.settings.auto;
	$("pk-showodds").addEventListener("change", function () { ST.settings.showOdds = this.checked; save(); oddsCache.key = ""; playRender(); });
	$("pk-four").addEventListener("change", function () { ST.settings.four = this.checked; applyFour(); save(); });
	$("pk-auto").addEventListener("change", function () { ST.settings.auto = this.checked; save(); if (this.checked && G && G.hand && G.hand.done && !G.over) scheduleNext(); });
	["pk-opps", "pk-mix", "pk-stack", "pk-rise"].forEach(function (id) { $(id).addEventListener("change", function () { su.opps = +$("pk-opps").value; su.mix = $("pk-mix").value; su.stack = +$("pk-stack").value; su.rise = +$("pk-rise").value; save(); }); });

	function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
	function newGame() {
		var n = su.opps, start = su.stack * LEVELS[0][1], names = shuffleArr(NAMES.slice()), mixes = shuffleArr(["tag", "lp", "lag", "tp", "tag", "lp", "lag", "tag"]);
		var players = [{ name: "You", hero: true, stack: start, out: false, rebuys: 0 }];
		for (var i = 0; i < n; i++) players.push({ name: names[i], style: su.mix === "mixed" ? mixes[i % mixes.length] : su.mix, stack: start, out: false, rebuys: 0 });
		G = ST.game = { cfg: { n: n + 1, start: start, rise: su.rise, mode: su.mode }, players: players, button: Math.floor(Math.random() * (n + 1)), handNo: 0, over: false, finish: [], hand: null, logSeen: 0, log: [] };
		G._show = true;
		$("pk-log").innerHTML = "";
		startNextHand();
	}
	function levelOf() { return G.cfg.rise ? Math.min(LEVELS.length - 1, Math.floor((G.handNo - 1) / G.cfg.rise)) : 0; }
	function aliveIdx() { var o = []; G.players.forEach(function (p, i) { if (!p.out && p.stack > 0) o.push(i); }); return o; }
	function startNextHand() {
		clearTimeout(timer);
		if (!G || G.over) return;
		var alive = aliveIdx();
		if (alive.length < 2 || (G.cfg.mode === "tour" && G.players[0].out)) { gameOver(); return; }
		if (G.cfg.mode === "cash" && G.players[0].stack <= 0) { playRender(); return; }
		G.handNo++;
		var lv = LEVELS[levelOf()], b = G.button;
		for (var k = 1; k <= G.players.length; k++) { var i = (b + k) % G.players.length; if (alive.indexOf(i) >= 0) { b = i; break; } }
		G.button = b;
		var stacks = G.players.map(function (p) { return p.out ? 0 : p.stack; });
		G.hand = P.startHand({ stacks: stacks, button: b, sb: lv[0], bb: lv[1] });
		G.hand.level = levelOf();
		G.logSeen = 0;
		addLog("Hand #" + G.handNo + " · blinds " + fmt(lv[0]) + " / " + fmt(lv[1]), "pk-lh");
		flushLog();
		oddsCache.key = "";
		save(); playRender(); schedule();
	}
	function gameOver() {
		G.over = true; G.hand = G.hand || null;
		var alive = aliveIdx(), msg;
		if (G.cfg.mode === "tour") {
			if (!G.players[0].out && alive.length === 1) msg = "You won the tournament! Every other player is out of chips.";
			else msg = "You are out in " + ordinal(G.heroPlace || alive.length + 1) + " place of " + G.players.length + ".";
		} else msg = "Game over.";
		G.overMsg = msg; addLog(msg, "pk-lw"); save(); playRender();
	}
	function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
	function schedule() {
		clearTimeout(timer);
		var S = G && G.hand;
		if (!S || G.over) return;
		if (S.done) { if (!S._ended) endHand(); return; }
		if (S.toAct === 0) { playRender(); return; }
		var heroIn = S.seats[0].inHand && !S.seats[0].folded;
		var d = SPEED[ST.settings.speed] || 850;
		if (!heroIn) d = Math.min(d, 260);
		timer = setTimeout(function () {
			var seat = S.toAct, a;
			try { a = P.botDecide(S, seat, G.players[seat].style); } catch (e) { a = null; }
			doAct(a);
		}, d);
	}
	function doAct(a) {
		var S = G.hand, L = P.legal(S);
		if (!L) return;
		try { if (!a) throw 0; P.act(S, a); }
		catch (e) { P.act(S, L.canCheck ? { type: "check" } : { type: "fold" }); }
		flushLog(); save(); playRender(); schedule();
	}
	function heroAct(type) {
		var S = G && G.hand;
		if (!S || S.done || S.toAct !== 0) return;
		var L = P.legal(S);
		if (type === "raise") {
			if (!L.canRaise) return;
			var to = clampTo(parseAmt($("pk-amt").value), L);
			doAct({ type: "raise", to: to });
		} else if (type === "call") doAct(L.canCheck ? { type: "check" } : { type: "call" });
		else doAct({ type: "fold" });
	}
	function parseAmt(s) { var n = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
	function clampTo(x, L) { return Math.max(L.minTo, Math.min(L.maxTo, Math.round(x))); }
	function presetTo(p, L, S) {
		if (p === "min") return L.minTo;
		if (p === "all") return L.maxTo;
		var f = +p, pot = L.pot;
		return clampTo(L.isBet ? f * pot : S.currentBet + f * (pot + L.toCall), L);
	}
	$("pk-fold").addEventListener("click", function () { heroAct("fold"); });
	$("pk-call").addEventListener("click", function () { heroAct("call"); });
	$("pk-raise").addEventListener("click", function () { heroAct("raise"); });
	$("pk-presets").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-p]"), S = G && G.hand; if (!b || !S || S.toAct !== 0) return;
		var L = P.legal(S); if (!L.canRaise) return;
		setAmt(presetTo(b.getAttribute("data-p"), L, S), L);
	});
	function setAmt(to, L) {
		$("pk-amt").value = fmt(to);
		var r = $("pk-amt-r"); r.value = L.maxTo > L.minTo ? Math.round((to - L.minTo) / (L.maxTo - L.minTo) * 1000) : 1000;
		paintRaiseBtn(L, to);
	}
	$("pk-amt-r").max = 1000;
	$("pk-amt-r").addEventListener("input", function () {
		var S = G && G.hand; if (!S || S.toAct !== 0) return; var L = P.legal(S);
		var f = +this.value / 1000, to = L.minTo + f * f * (L.maxTo - L.minTo);   // squared: finer steps at the small end
		var bb = S.bb / 2; to = Math.round(to / bb) * bb;
		to = clampTo(f >= 1 ? L.maxTo : to, L);
		$("pk-amt").value = fmt(to); paintRaiseBtn(L, to);
	});
	$("pk-amt").addEventListener("input", function () { var S = G && G.hand; if (!S || S.toAct !== 0) return; var L = P.legal(S); paintRaiseBtn(L, clampTo(parseAmt(this.value), L)); });
	$("pk-amt").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); heroAct("raise"); } });
	$("pk-amt").addEventListener("blur", function () { var S = G && G.hand; if (!S || S.toAct !== 0) return; var L = P.legal(S); if (L.canRaise) setAmt(clampTo(parseAmt(this.value), L), L); });
	function paintRaiseBtn(L, to) {
		var b = $("pk-raise");
		if (!L || !L.canRaise) { b.innerHTML = "Raise <kbd>R</kbd>"; return; }
		var all = to >= L.maxTo;
		b.innerHTML = (all ? "All-in " + fmt(to) : (L.isBet ? "Bet " : "Raise to ") + fmt(to)) + " <kbd>R</kbd>";
	}
	$("pk-start").addEventListener("click", function () {
		if (G && !G.over && G.handNo > 0 && !confirm("Start a new game? The game in progress will be lost.")) return;
		newGame(); setTab("play");
		var t = $("pk-table"); if (t.scrollIntoView) t.scrollIntoView({ block: "center", behavior: "smooth" });
	});
	$("pk-continue").addEventListener("click", function () { $("pk-setup").hidden = true; $("pk-game").hidden = false; G._show = true; playRender(); if (G.hand && !G.hand.done) schedule(); else if (G.hand && G.hand.done && !G.hand._ended) endHand(); });
	$("pk-quit").addEventListener("click", function () { clearTimeout(timer); G._show = false; $("pk-game").hidden = true; $("pk-setup").hidden = false; playRender(); });
	$("pk-next").addEventListener("click", function () { if (G && G.over) newGame(); else startNextHand(); });
	$("pk-rebuy").addEventListener("click", function () { var h = G.players[0]; h.stack = G.cfg.start; h.rebuys++; addLog("You rebuy for " + fmt(G.cfg.start) + " play chips."); flushLog(); save(); startNextHand(); });
	document.addEventListener("keydown", function (e) {
		if (tab !== "play" || !G || $("pk-game").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
		var t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && t.id !== "pk-amt-r") return;
		var k = e.key.toLowerCase();
		if (k === "n" && G.hand && G.hand.done && !$("pk-nextbox").hidden && !$("pk-next").disabled) { e.preventDefault(); startNextHand(); return; }
		if (!G.hand || G.hand.toAct !== 0 || G.hand.done) return;
		if (k === "f") { e.preventDefault(); heroAct("fold"); } else if (k === "c" || k === "k") { e.preventDefault(); heroAct("call"); } else if (k === "r") { e.preventDefault(); heroAct("raise"); }
	});

	function endHand() {
		var S = G.hand; S._ended = true;
		S.seats.forEach(function (s, i) { G.players[i].stack = s.stack; });
		var r = S.result;
		r.pots.forEach(function (pt, k) {
			var label = r.pots.length > 1 ? (k === 0 ? " (main pot)" : " (side pot " + k + ")") : "";
			pt.winners.forEach(function (w) {
				var hv = r.showdown && r.values[w] ? " with " + P.handName(r.values[w].value) : "";
				if (pt.returned) addLog(G.players[w].name + " gets " + fmt(pt.shares[w]) + " back (nobody called it)");
				else addLog(G.players[w].name + (w === 0 ? " win " : " wins ") + fmt(pt.shares[w]) + label + hv, "pk-lw");
			});
		});
		if (r.showdown) r.alive.forEach(function (i) { if (i !== 0) addLog(G.players[i].name + " shows " + S.seats[i].hole.map(function (c) { return rankTxt(c) + P.SUIT_SYM[c & 3]; }).join(" ")); });
		recordStats(S);
		// busts
		G.players.forEach(function (p, i) {
			if (p.out || p.stack > 0) return;
			if (G.cfg.mode === "cash") { if (i !== 0) { p.stack = G.cfg.start; p.rebuys++; addLog(p.name + " rebuys for " + fmt(G.cfg.start) + "."); } }
			else { p.out = true; G.finish.unshift(i); if (i === 0) G.heroPlace = aliveIdx().length + 1; addLog((i === 0 ? "You are" : p.name + " is") + " out of chips."); }
		});
		flushLog();
		if (G.cfg.mode === "tour" && (G.players[0].out || aliveIdx().length < 2)) { gameOver(); return; }
		save(); playRender();
		if (ST.settings.auto && !(G.cfg.mode === "cash" && G.players[0].stack <= 0)) scheduleNext();
	}
	function scheduleNext() { clearTimeout(timer); timer = setTimeout(startNextHand, Math.max(1400, (SPEED[ST.settings.speed] || 850) * 3.2)); }

	/* ---------- log ---------- */
	function addLog(text, cls) { G.log.push([text, cls || ""]); if (G.log.length > 220) G.log.splice(0, G.log.length - 220); }
	var STREETS = ["Pre-flop", "Flop", "Turn", "River"];
	function flushLog() {
		var S = G.hand;
		if (S) {
			for (; G.logSeen < S.log.length; G.logSeen++) {
				var e = S.log[G.logSeen], nm = e.seat >= 0 ? G.players[e.seat].name : "", you = e.seat === 0, ai = e.allIn ? " (all-in)" : "";
				if (e.type === "deal") { addLog(STREETS[e.street] + ": " + e.cards.map(function (c) { return rankTxt(c) + P.SUIT_SYM[c & 3]; }).join(" "), "pk-lh"); continue; }
				var t = e.type === "small blind" || e.type === "big blind" || e.type === "ante" ? nm + (you ? " post " : " posts ") + "the " + e.type + " (" + fmt(e.amount) + ")"
					: e.type === "fold" ? nm + (you ? " fold" : " folds") : e.type === "check" ? nm + (you ? " check" : " checks")
					: e.type === "call" ? nm + (you ? " call " : " calls ") + fmt(e.amount) + ai
					: e.type === "bet" ? nm + (you ? " bet " : " bets ") + fmt(e.to) + ai : nm + (you ? " raise to " : " raises to ") + fmt(e.to) + ai;
				addLog(t);
			}
		}
		var ol = $("pk-log");
		ol.innerHTML = G.log.map(function (x) { return '<li class="' + x[1] + '">' + esc(x[0]) + "</li>"; }).join("");
		ol.scrollTop = ol.scrollHeight;
	}

	/* ---------- render ---------- */
	function seatXY(i, n, phone) {
		var a = (90 + i * 360 / n) * Math.PI / 180, rx = phone ? 37 : 42, ry = phone ? 41 : 41;
		return [50 + rx * Math.cos(a), 50 + ry * Math.sin(a), a];
	}
	function bubbleFor(S, i) {
		if (S.done) {
			var won = S.result.payouts[i];
			if (won > 0) return "Wins " + fmt(won);
			return S.seats[i].folded && S.seats[i].inHand ? "Fold" : "";
		}
		var last = null;
		S.log.forEach(function (e) { if (e.seat === i && e.street === S.street) last = e; });
		if (!last) return S.seats[i].folded && S.seats[i].inHand ? "Fold" : "";
		var m = { fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise", "small blind": "SB", "big blind": "BB", ante: "Ante" }[last.type] || "";
		return last.allIn ? "All-in" : m;
	}
	function playRender() {
		var showGame = G && (G._show || (G.handNo > 0 && $("pk-setup").hidden));
		var resumable = G && !G.over && G.handNo > 0;
		$("pk-resume").hidden = !resumable || !$("pk-game").hidden;
		if (resumable) $("pk-resume-text").textContent = "You have a game in progress: hand #" + G.handNo + ", " + aliveIdx().length + " players with chips, you have " + fmt(G.players[0].stack) + " play chips.";
		if (!G || !G._show) { $("pk-game").hidden = true; $("pk-setup").hidden = false; return; }
		$("pk-setup").hidden = true; $("pk-game").hidden = false;
		var S = G.hand, n = G.players.length, phone = window.matchMedia("(max-width: 640px)").matches;
		var lvI = S ? S.level : levelOf(), lv = LEVELS[lvI];
		var info = "Hand #" + G.handNo + " · Blinds " + fmt(lv[0]) + " / " + fmt(lv[1]);
		if (G.cfg.rise && lvI < LEVELS.length - 1) { var left = G.cfg.rise - ((G.handNo - 1) % G.cfg.rise); info += " (up in " + left + (left === 1 ? " hand)" : " hands)"); }
		info += " · " + (G.cfg.mode === "tour" ? aliveIdx().length + " of " + n + " left" : "Cash game");
		$("pk-info").textContent = info;
		var html = "", bestCards = {}, winners = {};
		if (S && S.done && S.result.showdown) {
			var mp = S.result.pots[0];
			S.result.pots.forEach(function (pt) { pt.winners.forEach(function (w) { winners[w] = 1; }); });
			mp.winners.forEach(function (w) { var b = S.result.values[w]; if (b) b.cards.forEach(function (c) { bestCards[c] = 1; }); });
		} else if (S && S.done) S.result.pots.forEach(function (pt) { pt.winners.forEach(function (w) { winners[w] = 1; }); });
		var showdown = S && S.done && S.result.showdown;
		for (var i = 0; i < n; i++) {
			var p = G.players[i], s = S ? S.seats[i] : null, xy = seatXY(i, n, phone), cls = "pk-seat";
			if (i === 0) cls += " is-hero";
			if (S && !S.done && S.toAct === i) cls += " is-turn";
			if (s && s.folded && s.inHand) cls += " is-folded";
			if (p.out || (s && !s.inHand)) cls += " is-out";
			if (winners[i]) cls += " is-winner";
			var cards = "";
			if (s && s.inHand && !(s.folded && i !== 0)) {
				var faceUp = i === 0 || (showdown && S.result.alive.indexOf(i) >= 0);
				cards = s.hole.map(function (c) { return faceUp ? cardHTML(c, showdown ? (bestCards[c] ? "is-best" : "is-dim") : "") : cardHTML("back"); }).join("");
			}
			var bub = S ? bubbleFor(S, i) : "";
			var stackTxt = p.out ? "Out" : fmt(s ? s.stack : p.stack);
			var sty = i === 0 ? (S && s && s.inHand ? P.positionName(S, i) : "") : P.STYLES[p.style].short;
			if (i !== 0 && S && s && s.inHand) sty = P.positionName(S, i) + " · " + sty;
			html += '<div class="' + cls + '" style="left:' + xy[0].toFixed(2) + "%;top:" + xy[1].toFixed(2) + '%"><div class="pk-cards">' + cards + "</div>" +
				'<div class="pk-plate">' + (bub ? '<span class="pk-bubble">' + esc(bub) + "</span>" : "") + '<span class="pk-name">' + esc(p.name) + '</span><span class="pk-stk">' + stackTxt + "</span>" + (sty ? '<span class="pk-sty">' + esc(sty) + "</span>" : "") + "</div></div>";
			var bx = 50 + (xy[0] - 50) * 0.6, by = 50 + (xy[1] - 50) * (phone ? 0.62 : 0.56);
			if (s && s.bet > 0) html += '<div class="pk-bet" style="left:' + bx.toFixed(2) + "%;top:" + by.toFixed(2) + '%"><span class="pk-chip"></span>' + fmt(s.bet) + "</div>";
			if (S && S.button === i) {
				var ang = xy[2] + (phone ? 0.3 : 0.2), dx = 50 + (phone ? 25 : 28) * Math.cos(ang), dy = 50 + (phone ? 28 : 24) * Math.sin(ang);
				html += '<div class="pk-dealer" style="left:' + dx.toFixed(2) + "%;top:" + dy.toFixed(2) + '%" title="Dealer button">D</div>';
			}
		}
		$("pk-seats").innerHTML = html;
		var board = "";
		for (var b = 0; b < 5; b++) board += S && S.board[b] !== undefined ? cardHTML(S.board[b], showdown ? (bestCards[S.board[b]] ? "is-best" : "is-dim") : "") : '<span class="pk-slot"></span>';
		$("pk-board").innerHTML = board;
		$("pk-pot").textContent = S ? "Pot " + fmt(P.potTotal(S)) : "";
		var msg = "";
		if (G.over) msg = G.overMsg || "Game over.";
		else if (S && S.done) {
			var r = S.result, w = r.pots[0].winners;
			msg = w.map(function (x) { return G.players[x].name; }).join(" and ") + (w.length > 1 ? " split the pot" : (w[0] === 0 ? " win" : " wins")) + (r.showdown && r.values[w[0]] ? " with " + P.handName(r.values[w[0]].value) : "");
			if (r.pots.length > 1 && r.pots.some(function (pt, k) { return k > 0 && !pt.returned; })) msg += " (and side pots)";
		} else if (S && S.toAct === 0) msg = "Your turn";
		else if (S && S.toAct >= 0) msg = G.players[S.toAct].name + " is thinking…";
		$("pk-msg").textContent = msg;
		renderControls(S);
		renderOdds(S);
		if (G.log.length && !$("pk-log").children.length) flushLog();
	}
	function renderControls(S) {
		var my = S && !S.done && S.toAct === 0 && !G.over, L = my ? P.legal(S) : null;
		$("pk-fold").disabled = !my; $("pk-call").disabled = !my; $("pk-raise").disabled = !my || !L.canRaise;
		$("pk-raisebox").classList.toggle("is-off", !my || !L || !L.canRaise);
		if (my) {
			$("pk-call").innerHTML = (L.canCheck ? "Check" : "Call " + fmt(L.callAmt) + (L.allInCall ? " (all-in)" : "")) + " <kbd>C</kbd>";
			if (L.canRaise) {
				var cur = parseAmt($("pk-amt").value);
				if (!$("pk-amt").dataset.k || $("pk-amt").dataset.k !== G.handNo + ":" + S.log.length) { cur = L.isBet ? presetTo("0.5", L, S) : L.minTo; $("pk-amt").dataset.k = G.handNo + ":" + S.log.length; }
				setAmt(clampTo(cur, L), L);
			} else paintRaiseBtn(null);
		} else { $("pk-call").innerHTML = "Check <kbd>C</kbd>"; paintRaiseBtn(null); }
		var done = S && S.done;
		$("pk-nextbox").hidden = !(done || G.over);
		root.querySelector(".pk-btns").hidden = !!(done || G.over); $("pk-raisebox").hidden = !!(done || G.over);
		var broke = G.cfg.mode === "cash" && G.players[0].stack <= 0;
		$("pk-rebuy").hidden = !broke || G.over; $("pk-next").disabled = broke;
		$("pk-next").innerHTML = G.over ? "Play again" : "Deal next hand <kbd>N</kbd>";
		if (my && document.activeElement === document.body) { /* keep focus where it is */ }
	}

	/* "show my odds" panel */
	function renderOdds(S) {
		var box = $("pk-odds");
		if (!ST.settings.showOdds || !S || !S.seats[0].inHand || S.seats[0].folded || G.over) { box.hidden = true; return; }
		var opp = P.inPlay(S).filter(function (i) { return i !== 0; }), hole = S.seats[0].hole, L = S.toAct === 0 && !S.done ? P.legal(S) : null;
		var key = G.handNo + ":" + S.board.length + ":" + opp.length + ":" + (L ? S.currentBet + "/" + L.toCall : "w") + ":" + S.done;
		if (oddsCache.key !== key) {
			var h = "";
			if (S.board.length >= 3) h += "<h3>You have: " + esc(P.handName(P.evaluate(hole.concat(S.board)))) + "</h3>";
			else {
				var ci = P.handClass(hole[0], hole[1]);
				h += "<h3>Your starting hand: " + P.classLabel(ci) + "</h3><p>Top " + pct(P.classPercentile(ci), 0) + " of starting hands; wins " + pct(P.CHART[ci] / 1000) + " against one random hand.</p>";
			}
			if (opp.length && !S.done) {
				var eR = P.rangeEquity(hole, S.board, opp.map(function () { return 1; }), 2500), eG = P.rangeEquity(hole, S.board, opp.map(function (i) { return P.guessWidth(S, i); }), 2500);
				h += "<p>Chance to win against " + opp.length + " random hand" + (opp.length > 1 ? "s" : "") + ": <b>" + pct(eR, 0) + "</b></p><div class=\"pk-eqbar\"><span style=\"width:" + (eR * 100).toFixed(1) + '%"></span></div>';
				h += "<p>Against the hands their betting suggests (an estimate): <b>" + pct(eG, 0) + "</b></p>";
				if (L && L.toCall > 0) {
					var need = L.callAmt / (L.pot + L.callAmt);
					h += "<p>Pot odds: call " + fmt(L.callAmt) + " to win " + fmt(L.pot) + ", so you need at least <b>" + pct(need) + "</b> equity.</p>";
					h += '<p class="pk-verdict ' + (eG >= need ? "is-good" : "is-bad") + '">' + (eG >= need ? "Calling is worth it in the long run (against that estimate)." : "Calling loses chips in the long run, unless you can win more later or make them fold.") + "</p>";
				}
			}
			if (S.board.length === 3 || S.board.length === 4) {
				var o = P.outsImprove(hole, S.board);
				if (o.cards.length) {
					var unseen = 52 - 2 - S.board.length, k = 5 - S.board.length, miss = P.choose(unseen - o.cards.length, k) / P.choose(unseen, k);
					h += "<p><b>" + o.cards.length + " out" + (o.cards.length > 1 ? "s" : "") + "</b> (cards that improve you): " + o.groups.map(function (g) { return g.name + " " + minis(g.cards); }).join("; ") + ". Chance to hit one by the river: <b>" + pct(1 - miss, 0) + "</b>.</p>";
				} else h += "<p>No clean outs to a better hand.</p>";
			}
			oddsCache = { key: key, html: h };
		}
		box.innerHTML = oddsCache.html; box.hidden = false;
	}
	window.addEventListener("resize", function () { if (tab === "play" && G && G._show) playRender(); });

	/* ---------- stats recording ---------- */
	function recordStats(S) {
		if (!S.seats[0].inHand) return;
		var st = ST.stats, pre = S.log.filter(function (e) { return e.seat === 0 && e.street === 0; }), bb = S.bb;
		var vp = pre.some(function (e) { return e.type === "call" || e.type === "raise" || e.type === "bet"; }), pr = pre.some(function (e) { return e.type === "raise" || e.type === "bet"; });
		var won = S.result.payouts[0], profit = S.seats[0].stack - S.startStacks[0], pos = P.positionName(S, 0);
		st.hands++; if (vp) st.vpip++; if (pr) st.pfr++;
		var sd = S.result.showdown && S.result.alive.indexOf(0) >= 0;
		if (sd) { st.sd++; if (won > 0) st.sdWon++; var v = S.result.values[0]; if (v && v.value > st.best) { st.best = v.value; st.bestCards = v.cards; } }
		if (profit > 0) { st.won++; st.biggest = Math.max(st.biggest, won); }
		var pb = profit / bb;
		st.profitBB += pb;
		st.cum.push(Math.round(st.profitBB * 10) / 10); if (st.cum.length > 4000) st.cum = st.cum.filter(function (x, i) { return i % 2 === 0; });
		var ps = st.pos[pos] || (st.pos[pos] = { h: 0, v: 0, p: 0, w: 0 });
		ps.h++; if (vp) ps.v++; ps.p += pb; if (profit > 0) ps.w++;
	}

	/* =====================================================================
	   ODDS CALCULATOR
	   ===================================================================== */
	var OC = ST.calc;
	function ocDefault() { return { players: [{ c: [P.parseCard("Ah"), P.parseCard("Ad")], r: false }, { c: [P.parseCard("Ks"), P.parseCard("Kc")], r: false }], board: [-1, -1, -1, -1, -1], dead: [-1, -1, -1, -1] }; }
	if (!OC || !OC.players) OC = ST.calc = ocDefault();
	var ocSel = { k: "p", i: 0, j: 0 }, ocWorker = null, ocId = 0, ocTimer = 0, ocBuilt = false;
	function ocUsed() {
		var u = {};
		OC.players.forEach(function (p) { if (!p.r) p.c.forEach(function (c) { if (c >= 0) u[c] = 1; }); });
		OC.board.forEach(function (c) { if (c >= 0) u[c] = 1; }); OC.dead.forEach(function (c) { if (c >= 0) u[c] = 1; });
		return u;
	}
	function slotHTML(c, k, i, j, label) {
		var on = ocSel.k === k && ocSel.i === i && ocSel.j === j;
		return '<button type="button" class="pk-sl' + (on ? " is-on" : "") + '" data-k="' + k + '" data-i="' + i + '" data-j="' + j + '" aria-label="' + esc(label) + (c >= 0 ? ": " + cardName(c) : ": empty") + '"' + (on ? ' aria-pressed="true"' : "") + ">" + (c >= 0 ? cardHTML(c) : "+") + "</button>";
	}
	function ocRender(full) {
		if (!ocBuilt) { ocBuildGrid(); ocBuilt = true; }
		var h = "";
		OC.players.forEach(function (p, i) {
			h += '<div class="pk-oc-p"><span class="pk-oc-lab">Player ' + (i + 1) + "</span>";
			if (p.r) h += '<span class="tu-note" style="margin:0 0.4em;">any two cards</span>';
			else h += '<span class="pk-slots">' + slotHTML(p.c[0], "p", i, 0, "Player " + (i + 1) + " card 1") + slotHTML(p.c[1], "p", i, 1, "Player " + (i + 1) + " card 2") + "</span>";
			h += '<button type="button" class="pk-oc-rnd" data-rnd="' + i + '" aria-pressed="' + (p.r ? "true" : "false") + '">Random</button>';
			if (OC.players.length > 2) h += '<button type="button" class="pk-oc-x" data-del="' + i + '" aria-label="Remove player ' + (i + 1) + '">×</button>';
			h += "</div>";
		});
		$("pk-oc-players").innerHTML = h;
		$("pk-oc-board").innerHTML = OC.board.map(function (c, j) { return slotHTML(c, "b", 0, j, ["Flop card 1", "Flop card 2", "Flop card 3", "Turn", "River"][j]); }).join("");
		$("pk-oc-dead").innerHTML = OC.dead.map(function (c, j) { return slotHTML(c, "d", 0, j, "Dead card " + (j + 1)); }).join("");
		$("pk-oc-add").disabled = OC.players.length >= 9;
		var u = ocUsed();
		$("pk-grid").querySelectorAll("button[data-c]").forEach(function (b) { b.disabled = !!u[+b.getAttribute("data-c")]; });
		if (full !== false) ocQueue();
	}
	function ocBuildGrid() {
		var h = "";
		for (var s = 0; s < 4; s++) {
			h += '<div class="pk-grow">';
			for (var r = 12; r >= 0; r--) { var c = r * 4 + s; h += '<button type="button" class="pk-gc pk-cs' + s + '" data-c="' + c + '" aria-label="' + cardName(c) + '">' + rankTxt(c) + "<br>" + P.SUIT_SYM[s] + "</button>"; }
			h += "</div>";
		}
		$("pk-grid").innerHTML = h;
	}
	function ocGet(sel) { return sel.k === "p" ? OC.players[sel.i].c[sel.j] : sel.k === "b" ? OC.board[sel.j] : OC.dead[sel.j]; }
	function ocSet(sel, c) { if (sel.k === "p") OC.players[sel.i].c[sel.j] = c; else if (sel.k === "b") OC.board[sel.j] = c; else OC.dead[sel.j] = c; }
	function ocAdvance() {   // move the selection to the next empty slot
		var list = [];
		OC.players.forEach(function (p, i) { if (!p.r) { list.push({ k: "p", i: i, j: 0 }); list.push({ k: "p", i: i, j: 1 }); } });
		for (var j = 0; j < 5; j++) list.push({ k: "b", i: 0, j: j });
		for (var d = 0; d < OC.dead.length; d++) list.push({ k: "d", i: 0, j: d });
		var at = list.findIndex(function (x) { return x.k === ocSel.k && x.i === ocSel.i && x.j === ocSel.j; });
		for (var t = 1; t <= list.length; t++) { var x = list[(at + t) % list.length]; if (ocGet(x) < 0) { ocSel = x; return; } }
	}
	root.querySelector('section[data-panel="odds"]').addEventListener("click", function (e) {
		var sl = e.target.closest(".pk-sl");
		if (sl) {
			var sel = { k: sl.getAttribute("data-k"), i: +sl.getAttribute("data-i"), j: +sl.getAttribute("data-j") };
			if (ocSel.k === sel.k && ocSel.i === sel.i && ocSel.j === sel.j && ocGet(sel) >= 0) { ocSet(sel, -1); save(); ocRender(); }
			else { ocSel = sel; ocRender(false); }
			return;
		}
		var gc = e.target.closest(".pk-gc");
		if (gc && !gc.disabled) {
			if (ocSel.k === "p" && OC.players[ocSel.i] && OC.players[ocSel.i].r) ocAdvance();
			ocSet(ocSel, +gc.getAttribute("data-c")); ocAdvance(); save(); ocRender();
			return;
		}
		var rb = e.target.closest("[data-rnd]");
		if (rb) { var p = OC.players[+rb.getAttribute("data-rnd")]; p.r = !p.r; if (p.r) p.c = [-1, -1]; else ocSel = { k: "p", i: +rb.getAttribute("data-rnd"), j: 0 }; save(); ocRender(); return; }
		var del = e.target.closest("[data-del]");
		if (del) { OC.players.splice(+del.getAttribute("data-del"), 1); ocSel = { k: "b", i: 0, j: 0 }; ocAdvance(); save(); ocRender(); }
	});
	$("pk-oc-add").addEventListener("click", function () { if (OC.players.length >= 9) return; OC.players.push({ c: [-1, -1], r: true }); save(); ocRender(); });
	$("pk-oc-clear").addEventListener("click", function () { OC.players = [{ c: [-1, -1], r: false }, { c: [-1, -1], r: true }]; OC.board = [-1, -1, -1, -1, -1]; OC.dead = [-1, -1, -1, -1]; ocSel = { k: "p", i: 0, j: 0 }; save(); ocRender(); });
	$("pk-oc-copy").addEventListener("click", function () {
		var cs = function (a) { return a.filter(function (c) { return c >= 0; }).map(P.cardStr).join(""); };
		var q = "?tab=odds&h=" + OC.players.map(function (p) { return p.r ? "r" : cs(p.c) || "r"; }).join("-") + (cs(OC.board) ? "&b=" + cs(OC.board) : "") + (cs(OC.dead) ? "&d=" + cs(OC.dead) : "");
		var url = location.origin + location.pathname + q;
		(navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", url); });
	});
	function ocSpec() {
		var hands = [], err = "";
		OC.players.forEach(function (p, i) {
			if (p.r) hands.push(null);
			else { var k = p.c.filter(function (c) { return c >= 0; }); if (k.length !== 2) err = err || "Player " + (i + 1) + " needs two cards (or tap Random)."; hands.push(k); }
		});
		var board = OC.board.filter(function (c) { return c >= 0; }), dead = OC.dead.filter(function (c) { return c >= 0; });
		if (board.length === 1 || board.length === 2) err = err || "The board needs 3 cards (the flop), 4 or 5.";
		if (!err && hands.every(function (x) { return !x; })) err = "Give at least one player two cards.";
		return { err: err, spec: { hands: hands, board: board, dead: dead } };
	}
	function ocQueue() { clearTimeout(ocTimer); ocTimer = setTimeout(ocRun, 180); }
	function workerSrc() {
		return "var MESPoker=(" + P._factory.toString() + ")();\nself.onmessage=function(e){var d=e.data,job=MESPoker.equityJob(d.spec,{}),t0=Date.now();" +
			"function loop(){var fin=job.step(job.mode==='exact'?150000:25000),r=job.result(),se=0;r.players.forEach(function(p){se=Math.max(se,p.se);});" +
			"var stop=fin||(job.mode==='mc'&&(r.done>=3e6||Date.now()-t0>d.maxMs||(r.done>=40000&&se<d.se)));self.postMessage({id:d.id,res:r,final:stop});if(!stop)setTimeout(loop,0);}loop();};";
	}
	var workerURL = null;
	function ocRun() {
		var sp = ocSpec(), st = $("pk-oc-status");
		if (ocWorker) { try { ocWorker.terminate(); } catch (e) { } ocWorker = null; }
		ocId++;
		if (sp.err) { st.textContent = sp.err; $("pk-oc-prog").hidden = true; $("pk-oc-table").innerHTML = ""; $("pk-oc-cats").innerHTML = ""; $("pk-oc-outs").innerHTML = ""; return; }
		var msg = { id: ocId, spec: sp.spec, maxMs: 5000, se: 0.0012 }, id = ocId;
		st.textContent = "Calculating…";
		var onres = function (d) { if (d.id !== id) return; ocShow(d.res, d.final, sp.spec); };
		try {
			if (!workerURL) workerURL = URL.createObjectURL(new Blob([workerSrc()], { type: "text/javascript" }));
			ocWorker = new Worker(workerURL);
			ocWorker.onmessage = function (e) { onres(e.data); };
			ocWorker.onerror = function () { ocWorker = null; mainThread(msg, onres); };
			ocWorker.postMessage(msg);
		} catch (e) { mainThread(msg, onres); }
	}
	function mainThread(d, cb) {   // fallback when Web Workers are not available: same loop in small chunks
		var job = P.equityJob(d.spec, {}), t0 = Date.now();
		(function loop() {
			if (d.id !== ocId) return;
			var fin = job.step(job.mode === "exact" ? 60000 : 8000), r = job.result(), se = 0;
			r.players.forEach(function (p) { se = Math.max(se, p.se); });
			var stop = fin || (job.mode === "mc" && (r.done >= 1e6 || Date.now() - t0 > d.maxMs || (r.done >= 40000 && se < d.se)));
			cb({ id: d.id, res: r, final: stop });
			if (!stop) setTimeout(loop, 0);
		})();
	}
	function ocShow(r, final, spec) {
		var st = $("pk-oc-status"), pr = $("pk-oc-prog");
		if (r.mode === "exact") {
			st.textContent = (final ? "Exact: " : "Working: ") + fmt(r.done) + (final ? "" : " of " + fmt(r.total)) + " possible deal" + (r.done === 1 ? "" : "s") + (final ? " counted." : "…");
			pr.hidden = final; pr.firstChild.style.width = (r.done / r.total * 100).toFixed(1) + "%";
		} else {
			var se = Math.max.apply(null, r.players.map(function (p) { return p.se; }));
			st.textContent = (final ? "Simulated " : "Simulating… ") + fmt(r.done) + " random deals · margin of error ±" + (se * 100).toFixed(2) + "% (one standard error)";
			pr.hidden = final; pr.firstChild.style.width = Math.min(100, r.done / 400000 * 100).toFixed(1) + "%";
		}
		var h = "<thead><tr><th>Player</th><th>Cards</th><th>Win</th><th>Tie</th><th class=\"pk-eqcell\">Equity</th></tr></thead><tbody>";
		r.players.forEach(function (p, i) {
			var hd = spec.hands[i];
			h += "<tr><td>Player " + (i + 1) + "</td><td>" + (hd ? minis(hd) : "random") + "</td><td>" + pct(p.win, 2) + "</td><td>" + pct(p.tie, 2) + '</td><td class="pk-eqcell"><b>' + pct(p.equity, 2) + '</b><span class="pk-bar"><i style="width:' + (p.equity * 100).toFixed(2) + '%"></i></span></td></tr>';
		});
		$("pk-oc-table").innerHTML = h + "</tbody>";
		var c = "<thead><tr><th>Hand</th>" + r.players.map(function (p, i) { return "<th>P" + (i + 1) + "</th>"; }).join("") + "</tr></thead><tbody>";
		for (var k = 8; k >= 0; k--) c += "<tr><td>" + P.CATS[k] + "</td>" + r.players.map(function (p) { var v = p.cats[k]; return "<td>" + (v ? (v < 0.001 ? "<0.1%" : pct(v)) : "–") + "</td>"; }).join("") + "</tr>";
		$("pk-oc-cats").innerHTML = c + "</tbody>";
		if (final) ocOuts(spec);
	}
	function ocOuts(spec) {
		var box = $("pk-oc-outs"), b = spec.board, h = "";
		if (b.length === 3 || b.length === 4) {
			var next = b.length === 3 ? "turn" : "river";
			if (spec.hands.every(function (x) { return x; })) {
				spec.hands.forEach(function (hd, i) {
					var o = P.outsVsKnown(spec.hands, b, spec.dead, i);
					if (!o || o.ahead) return;
					h += "<p><b>Player " + (i + 1) + "</b> is " + (o.tied ? "tied" : "behind") + " right now: " + (o.win.length ? o.win.length + " card" + (o.win.length > 1 ? "s" : "") + " on the " + next + " put them ahead: " + minis(o.win.map(function (x) { return x.card; })) : "no single " + next + " card puts them ahead") +
						(o.tie.length ? "; " + o.tie.length + " more make a tie: " + minis(o.tie.map(function (x) { return x.card; })) : "") + ".</p>";
				});
			} else {
				spec.hands.forEach(function (hd, i) {
					if (!hd) return;
					var o = P.outsImprove(hd, b);
					h += "<p><b>Player " + (i + 1) + "</b>: " + (o.cards.length ? o.cards.length + " card" + (o.cards.length > 1 ? "s" : "") + " improve the hand: " + o.groups.map(function (g) { return g.name + " " + minis(g.cards); }).join("; ") : "no cards make a better hand category") + ".</p>";
				});
			}
			if (h) h = '<div class="pk-outs"><h3 class="pk-h3" style="margin-top:0;">Outs on the ' + next + "</h3>" + h + "</div>";
		}
		box.innerHTML = h;
	}

	/* =====================================================================
	   HAND RANKINGS + CHART
	   ===================================================================== */
	var RK = [
		[8, "Royal flush", "Ah Kh Qh Jh Th", "A, K, Q, J, 10 of one suit.", "4", "0.0032%"],
		[8, "Straight flush", "9s 8s 7s 6s 5s", "Five in a row, all one suit.", "36", "0.028%"],
		[7, "Four of a kind", "Qc Qd Qh Qs 7d", "Four cards of the same rank.", "624", "0.17%"],
		[6, "Full house", "Kh Kd Ks 4c 4h", "Three of one rank plus a pair.", "3,744", "2.6%"],
		[5, "Flush", "Ad Jd 8d 6d 2d", "Any five of one suit; the highest card decides between flushes.", "5,108", "3.0%"],
		[4, "Straight", "Tc 9d 8h 7s 6c", "Five in a row, mixed suits.", "10,200", "4.6%"],
		[3, "Three of a kind", "7h 7c 7s Kd 2c", "Three cards of the same rank.", "54,912", "4.8%"],
		[2, "Two pair", "Jh Jc 5d 5s Ac", "Two different pairs.", "123,552", "23.5%"],
		[1, "One pair", "Td Th Ks 6c 3d", "Two cards of the same rank.", "1,098,240", "43.8%"],
		[0, "High card", "Ac Qd 9h 6s 3c", "Nothing else: the highest card plays.", "1,302,540", "17.4%"]
	];
	var rkBuilt = false, hmMode = "eq", hmSel = -1;
	function rkRender() {
		if (!rkBuilt) {
			rkBuilt = true;
			$("pk-rk").innerHTML = "<thead><tr><th>#</th><th>Hand</th><th>Example</th><th>5 cards</th><th>With 7 cards</th></tr></thead><tbody>" + RK.map(function (r, i) {
				return "<tr><td>" + (i + 1) + "</td><td><b>" + r[1] + "</b><br><span class=\"tu-note\">" + r[3] + '</span></td><td><span class="pk-ex">' + P.parseCards(r[2]).map(function (c) { return cardHTML(c); }).join("") + "</span></td><td>" + r[4] + "</td><td>" + r[5] + "</td></tr>";
			}).join("") + "</tbody>";
			segInit("pk-hm-mode", "eq", function (v) { hmMode = v; hmPaint(); });
			$("pk-hm").addEventListener("click", function (e) { var b = e.target.closest("button[data-i]"); if (b) { hmSel = +b.getAttribute("data-i"); hmPaint(); hmInfo(); } });
		}
		hmPaint();
	}
	function hmColor(e) {   // 0.30 .. 0.86 -> red .. yellow .. green
		var t = Math.max(0, Math.min(1, (e - 0.31) / 0.54));
		return "hsl(" + Math.round(t * 125) + ",68%," + (64 - 6 * Math.abs(t - 0.5)) + "%)";
	}
	function hmPaint() {
		var h = "";
		for (var i = 0; i < 169; i++) {
			var e = P.CHART[i] / 1000, lab = P.classLabel(i), sub = hmMode === "eq" ? (e * 100).toFixed(1) : "top " + Math.max(1, Math.round(P.classPercentile(i) * 100)) + "%";
			h += '<button type="button" role="gridcell" data-i="' + i + '" class="' + (i === hmSel ? "is-sel" : "") + '" style="background:' + hmColor(e) + '" aria-label="' + lab + ": " + (e * 100).toFixed(1) + '% against a random hand"><b>' + lab + "</b><small>" + sub + "</small></button>";
		}
		var el = $("pk-hm"); el.innerHTML = h; el.classList.toggle("is-top", hmMode === "top");
	}
	function hmInfo() {
		var i = hmSel, lab = P.classLabel(i), a = Math.floor(i / 13), b = i % 13, kind = a === b ? "a pocket pair" : a < b ? "suited" : "offsuit";
		var r1 = 12 - Math.min(a, b), r2 = 12 - Math.max(a, b), c1 = r1 * 4, c2 = a === b ? r1 * 4 + 1 : a < b ? r2 * 4 : r2 * 4 + 1;
		$("pk-hm-info").innerHTML = "<b>" + lab + "</b> (" + kind + ", " + P.classCombos(i) + " ways to be dealt it): wins <b>" + pct(P.CHART[i] / 1000) + "</b> against one random hand, in the top " + pct(P.classPercentile(i), 0) + " of starting hands. " +
			'<button type="button" class="tu-btn tu-btn--ghost pk-sm" id="pk-hm-try">Try it in the odds calculator</button>';
		$("pk-hm-try").addEventListener("click", function () {
			OC.players = [{ c: [c1, c2], r: false }, { c: [-1, -1], r: true }]; OC.board = [-1, -1, -1, -1, -1]; OC.dead = [-1, -1, -1, -1]; ocSel = { k: "b", i: 0, j: 0 }; save();
			setTab("odds", true);
		});
	}

	/* =====================================================================
	   STATS
	   ===================================================================== */
	function stRender() {
		var s = ST.stats, n = s.hands || 0, rate = function (a, b) { return b ? pct(a / b, 0) : "–"; };
		var tiles = [["Hands played", fmt(n), ""], ["Profit", (s.profitBB >= 0 ? "+" : "") + s.profitBB.toFixed(1) + " BB", n ? (s.profitBB / n * 100).toFixed(1) + " BB per 100 hands" : ""],
			["VPIP", rate(s.vpip, n), "hands you put chips in before the flop"], ["PFR", rate(s.pfr, n), "hands you raised before the flop"],
			["Won at showdown", rate(s.sdWon, s.sd), fmt(s.sd) + " showdowns"], ["Hands won", rate(s.won, n), fmt(s.won) + " hands"],
			["Biggest pot won", fmt(s.biggest), "play chips"], ["Best hand shown", s.best ? P.handName(s.best) : "–", s.bestCards ? minis(s.bestCards) : ""]];
		$("pk-st-tiles").innerHTML = tiles.map(function (t, i) { return '<div class="tu-stat' + (i === 1 ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + t[0] + '</div><div class="tu-stat__value">' + esc(t[1]) + '</div><div class="tu-stat__sub">' + t[2] + "</div></div>"; }).join("");
		// graph
		var c = [0].concat(s.cum), W = 640, H = 220, pl = 46, pr = 10, pt = 12, pb = 26;
		if (c.length < 2) $("pk-st-graph").innerHTML = '<p class="tu-note">Play a few hands to see your graph.</p>';
		else {
			var mn = Math.min.apply(null, c), mx = Math.max.apply(null, c); if (mx - mn < 10) { mx += 5; mn -= 5; }
			var X = function (i) { return pl + i / (c.length - 1) * (W - pl - pr); }, Y = function (v) { return pt + (mx - v) / (mx - mn) * (H - pt - pb); };
			var step = Math.max(1, Math.floor(c.length / 500)), d = "";
			for (var i = 0; i < c.length; i += step) d += (d ? "L" : "M") + X(i).toFixed(1) + "," + Y(c[i]).toFixed(1);
			d += "L" + X(c.length - 1).toFixed(1) + "," + Y(c[c.length - 1]).toFixed(1);
			var g = "";
			[mx, (mx + mn) / 2, mn].forEach(function (v) { g += '<line class="pk-gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v) + "</text>"; });
			if (mn < 0 && mx > 0) g += '<line class="pk-gz" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
			g += '<text x="' + pl + '" y="' + (H - 6) + '">hand 1</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">hand ' + fmt(s.hands) + "</text>";
			$("pk-st-graph").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Profit in big blinds over ' + s.hands + ' hands, now ' + s.profitBB.toFixed(1) + '">' + g + '<path class="pk-gp" d="' + d + '"/></svg>';
		}
		var order = ["BTN", "CO", "HJ", "LJ", "MP", "UTG+1", "UTG", "BB", "SB"], rows = "";
		order.forEach(function (k) { var p = s.pos[k]; if (!p) return; rows += "<tr><td>" + k + "</td><td>" + fmt(p.h) + "</td><td>" + pct(p.v / p.h, 0) + "</td><td>" + pct(p.w / p.h, 0) + "</td><td>" + (p.p >= 0 ? "+" : "") + p.p.toFixed(1) + "</td></tr>"; });
		$("pk-st-pos").innerHTML = rows ? "<thead><tr><th>Position</th><th>Hands</th><th>VPIP</th><th>Won</th><th>Profit (BB)</th></tr></thead><tbody>" + rows + "</tbody>" : "";
	}
	$("pk-st-reset").addEventListener("click", function () { if (!confirm("Reset all your poker stats?")) return; ST.stats = blankStats(); save(); stRender(); toast("Stats reset"); });

	/* ---------- start ---------- */
	var q = new URLSearchParams(location.search), qt = q.get("tab");
	if (q.get("h")) {   // shared odds link: ?tab=odds&h=AhAd-KsKc-r&b=2c7d9h&d=Kd
		var pl = q.get("h").split("-").slice(0, 9).map(function (x) { var cs = P.parseCards(x); return cs.length >= 2 ? { c: cs.slice(0, 2), r: false } : { c: [-1, -1], r: true }; });
		while (pl.length < 2) pl.push({ c: [-1, -1], r: true });
		var bd = P.parseCards(q.get("b") || "").slice(0, 5), dd = P.parseCards(q.get("d") || "").slice(0, 4), seen = {}, okq = true;
		pl.forEach(function (p) { p.c.forEach(function (c) { if (c >= 0) { if (seen[c]) okq = false; seen[c] = 1; } }); });
		bd.concat(dd).forEach(function (c) { if (seen[c]) okq = false; seen[c] = 1; });
		if (okq) { OC.players = pl; OC.board = [0, 1, 2, 3, 4].map(function (i) { return bd[i] !== undefined ? bd[i] : -1; }); OC.dead = [0, 1, 2, 3].map(function (i) { return dd[i] !== undefined ? dd[i] : -1; }); }
		qt = qt || "odds";
		try { history.replaceState(null, "", location.pathname + "?tab=odds"); } catch (e) { }
	}
	if (G) { G._show = false; if (G.over) G = ST.game = null; }
	setTab(qt || "play");
})();
