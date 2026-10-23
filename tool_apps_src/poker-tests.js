/* node tool_apps_src/poker-tests.js : tests for tool_apps_src/poker/lib.js (MESPoker) */
"use strict";
var P = require("./poker/lib.js");
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + ", want " + b + " +- " + tol + ")"); }
var C = P.parseCards;
var t0 = Date.now();

/* 1. every 5-card hand: the known category counts */
(function () {
	var counts = new Array(9).fill(0), h = new Int32Array(5), royal = 0;
	for (var a = 0; a < 48; a++) for (var b = a + 1; b < 49; b++) for (var c = b + 1; c < 50; c++) for (var d = c + 1; d < 51; d++) for (var e = d + 1; e < 52; e++) {
		h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
		var v = P.evaluate(h, 5); counts[v >> 20]++;
		if (v >> 20 === 8 && ((v >> 16) & 15) === 12) royal++;
	}
	var want = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
	for (var i = 0; i < 9; i++) eq(counts[i], want[i], "5-card count " + P.CATS[i]);
	eq(royal, 4, "royal flushes");
	eq(counts.reduce(function (x, y) { return x + y; }), 2598960, "all 5-card hands");
})();

/* 2. ordering and names */
(function () {
	var E = function (s) { return P.evaluate(C(s)); };
	ok(E("Ah 2d 3c 4s 5h") < E("2h 3d 4c 5s 6h"), "wheel loses to six-high straight");
	eq(P.handName(E("Ah 2d 3c 4s 5h")), "Straight, Five high", "wheel name");
	eq(P.handName(E("Ah Kh Qh Jh Th")), "Royal flush", "royal name");
	eq(P.handName(E("Kh Kd Ks 7c 7h 2d 2c")), "Full house, Kings full of Sevens", "full house picks the higher pair");
	eq(P.handName(E("Kh Kd Ks Qc Qh Qd 2c")), "Full house, Kings full of Queens", "two trips make a full house");
	ok(E("Ah Ad Kc Kd Qs Qh 2c") > E("Ah Ad Kc Kd Js Jh Tc"), "two pair kicker comes from the third pair");
	eq(E("Ah 9h 7h 4h 2h Ad As") >> 20, 5, "trips + flush = flush (no pair for a full house)");
	eq(E("Ah 9h 7h 4h 2h Ad As 9c") >> 20, 6, "8 cards evaluated too");
	ok(E("7h 7d 7c 7s 2h 3d 4c") > E("Ah Kh Qh Jh 9h 9d 9c"), "quads beat a flush");
	ok(E("5h 6h 7h 8h 9h Td Jc") > E("Th Jh Qh Kh 2c 2d 2s"), "straight flush beats quad-less hands");
	ok(E("Ac Kc 2d 3d 4h 7s 9s") > E("Kc Qc 2d 3d 4h 7s 9s"), "high card ace beats king");
	eq(E("Ac Ad Kh Ks 5c 5d 9h"), E("9h 5d Kh Ac 5c Ks Ad"), "order of cards does not matter");
	eq(P.cardStr(P.parseCard("10h")), "Th", "parse 10h");
	eq(P.parseCards("A♠ K♥").map(P.cardStr).join(" "), "As Kh", "parse suit symbols");
})();

/* 3. 7-card hands: the evaluator equals the best of the 21 five-card subsets; category frequencies on a sample */
(function () {
	var r = P.rng(7), cnt = new Array(9).fill(0), N = 300000, mism = 0;
	for (var i = 0; i < N; i++) {
		var d = P.shuffled(r).slice(0, 7), v = P.evaluate(d, 7);
		cnt[v >> 20]++;
		if (i < 20000 && P.best5(d).value !== v) mism++;
	}
	eq(mism, 0, "7-card value == best 5-card subset (20,000 hands)");
	var want = [0.1741, 0.4383, 0.2350, 0.0483, 0.0462, 0.0303, 0.0260, 0.00168, 0.000311];
	for (var k = 0; k < 9; k++) { var se = Math.sqrt(want[k] * (1 - want[k]) / N); near(cnt[k] / N, want[k], 4.5 * se + 1e-4, "7-card frequency " + P.CATS[k]); }
	var b = P.best5(C("Ah Kh Qh Jh Th 2c 3d"));
	eq(b.cards.map(P.cardStr).sort().join(" "), "Ah Jh Kh Qh Th", "best5 picks the royal flush cards");
})();

/* 4. equity */
(function () {
	var AA = C("Ah Ad"), KK = C("Ks Kc");
	var mc = P.equity({ hands: [AA, KK], board: [] }, { forceMC: true, iters: 60000, rng: P.rng(3) });
	near(mc.players[0].equity, 0.82, 0.01, "AA vs KK pre-flop Monte Carlo ~82%");
	ok(mc.mode === "mc" && mc.players[0].se > 0 && mc.players[0].se < 0.003, "Monte Carlo reports a standard error");
	var t = Date.now(), ex = P.equity({ hands: [AA, KK], board: [] });
	eq(ex.mode, "exact", "heads-up pre-flop is exact");
	eq(ex.done, 1712304, "exact pre-flop enumerates 1,712,304 boards");
	near(ex.players[0].equity, mc.players[0].equity, 4 * mc.players[0].se, "exact and Monte Carlo agree");
	// averaged over the suit combinations (2, 1 or 0 shared suits, weights 1 : 4 : 1) AA vs KK is the textbook 81.9%
	var e2 = P.equity({ hands: [C("Ah Ad"), C("Kh Kd")], board: [] }).players[0].equity, e1 = P.equity({ hands: [C("Ah Ad"), C("Kh Ks")], board: [] }).players[0].equity;
	near((e2 + 4 * e1 + ex.players[0].equity) / 6, 0.8195, 0.0006, "AA vs KK exact, all suit combinations: 81.9%");
	near(ex.players[0].equity + ex.players[1].equity, 1, 1e-9, "equities add to 1");
	console.log("  exact heads-up pre-flop: " + (Date.now() - t) + " ms");
	// exact on a flop, checked against a plain brute force
	var board = C("2c 7d 9h"), j = P.equity({ hands: [AA, KK], board: board }), used = AA.concat(KK, board), rem = P.remainingDeck(used), w = 0, n = 0;
	for (var a = 0; a < rem.length; a++) for (var b = a + 1; b < rem.length; b++) {
		var bd = board.concat([rem[a], rem[b]]), v1 = P.evaluate(AA.concat(bd)), v2 = P.evaluate(KK.concat(bd));
		w += v1 > v2 ? 1 : v1 === v2 ? 0.5 : 0; n++;
	}
	eq(j.done, 990, "flop: 990 turn+river pairs");
	near(j.players[0].equity, w / n, 1e-12, "flop equity matches brute force");
	var outs = P.outsVsKnown([KK, AA], board, [], 0);
	eq(outs.win.length, 2, "KK has 2 outs against AA on 2-7-9 rainbow");
	// one random opponent with a flop: exact
	var rnd = P.equity({ hands: [AA, null], board: board });
	eq(rnd.mode, "exact", "one random hand on the flop is exact");
	eq(rnd.done, P.choose(47, 2) * P.choose(45, 2), "random-hand enumeration count");
	// split: a royal flush on the board
	var sp = P.equity({ hands: [C("2c 3c"), C("4d 5d")], board: C("Ah Kh Qh Jh Th") });
	near(sp.players[0].tie, 1, 1e-12, "board royal flush: always a tie"); near(sp.players[0].equity, 0.5, 1e-12, "tie equity is half");
	// three-way exact with dead cards
	var three = P.equity({ hands: [AA, KK, C("Qs Qh")], board: C("2c 7d 9h 3s"), dead: C("Kd") });
	eq(three.done, 52 - 2 - 2 - 2 - 4 - 1, "turn: one card per remaining card with a dead card removed");
	// outs while playing
	var oi = P.outsImprove(C("Ah Kh"), C("2h 7h 9c"));
	ok(oi.groups.some(function (g) { return g.cat === 5 && g.cards.length === 9; }), "flush draw: 9 flush outs");
	var re = P.rangeEquity(AA, [], [1], 4000, P.rng(9));
	near(re, 0.852, 0.02, "AA vs one random hand ~85%");
	var narrow = P.rangeEquity(C("Qh Jh"), [], [0.05], 3000, P.rng(9));
	ok(narrow < 0.40, "QJs does worse against a tight range (" + narrow.toFixed(3) + ")");
})();

/* 5. pots */
(function () {
	var pots = P.buildPots([100, 300, 600, 600], [false, false, false, false]);
	eq(JSON.stringify(pots), JSON.stringify([{ amount: 400, eligible: [0, 1, 2, 3] }, { amount: 600, eligible: [1, 2, 3] }, { amount: 600, eligible: [2, 3] }]), "three side pots");
	var p2 = P.buildPots([50, 200, 200, 120], [true, false, false, true]);
	eq(JSON.stringify(p2), JSON.stringify([{ amount: 570, eligible: [1, 2] }]), "folded chips go into the pot they were bet in");
	var s = P.splitPot(101, [1, 3], 2, 4);
	eq(s[3], 51, "odd chip to the first winner left of the button"); eq(s[1], 50, "other winner");
	var s3 = P.splitPot(100, [0, 1, 2], 0, 3);
	eq(s3[1] + s3[2] + s3[0], 100, "three-way split keeps every chip"); eq(s3[1], 34, "seat 1 (left of button) gets the odd chip");
})();

/* deck builder: give seat i the hole cards holes[i] (deal order starts left of the button, one card per round), then burn/board */
function deckFor(holes, button, board) {
	var n = holes.length, order = [];
	for (var k = 1; k <= n; k++) order.push((button + k) % n);
	var d = [];
	for (var r = 0; r < 2; r++) order.forEach(function (i) { d.push(holes[i][r]); });
	var bd = board || [];
	var fill = P.remainingDeck(d.concat(bd)), take = function () { return fill.shift(); };
	d.push(take(), bd[0], bd[1], bd[2], take(), bd[3], take(), bd[4]);
	return d.concat(fill);
}

/* 6. betting: three all-ins of different sizes + a covering stack */
(function () {
	var holes = [C("Ah Ad"), C("Kh Kd"), C("Qh Qd"), C("2c 7s")], board = C("Ac Kc Qc 3s 4s");   // seat 0 makes trips aces
	var S = P.startHand({ stacks: [100, 300, 600, 1000], button: 3, sb: 10, bb: 20, deck: deckFor(holes, 3, board) });
	eq(S.toAct, 2, "4-handed: first to act is left of the big blind (seat 2 = UTG)");
	P.act(S, { type: "allin" });           // seat 2: 600
	P.act(S, { type: "call" });            // seat 3 (button) calls 600
	P.act(S, { type: "allin" });           // seat 0 (SB) all-in 100 (short: cannot reopen)
	P.act(S, { type: "allin" });           // seat 1 (BB) all-in 300
	ok(S.done, "all-in: hand runs out to the river");
	eq(S.board.length, 5, "board dealt out");
	var r = S.result;
	eq(r.pots.length, 3, "main pot + two side pots");
	eq(r.pots[0].amount, 400, "main pot 4 x 100"); eq(r.pots[1].amount, 600, "side pot 1: 3 x 200"); eq(r.pots[2].amount, 600, "side pot 2: 2 x 300");
	eq(r.pots[0].winners.join(), "0", "aces win the main pot");
	eq(r.pots[1].winners.join(), "1", "kings (set) win side pot 1");
	eq(r.pots[2].winners.join(), "2", "queens (set) win side pot 2");
	eq(S.seats.map(function (s) { return s.stack; }).join(), "400,600,600,400", "stacks after the showdown");
	eq(S.seats.reduce(function (t, s) { return t + s.stack; }, 0), 2000, "chips conserved");
})();

/* 7. min-raise rules and the short all-in that does not reopen betting */
(function () {
	var S = P.startHand({ stacks: [2000, 2000, 2000, 150], button: 0, sb: 10, bb: 20, rng: P.rng(1) });
	// button 0, SB 1, BB 2, UTG 3 (150 chips)
	eq(S.toAct, 3, "UTG first");
	var L = P.legal(S);
	eq(L.minTo, 40, "min raise pre-flop is to 2 big blinds");
	var threw = false; try { P.act(S, { type: "raise", to: 30 }); } catch (e) { threw = true; }
	ok(threw, "raise to 30 (less than a full raise) is refused");
	P.act(S, { type: "call" });                       // UTG limps 20
	P.act(S, { type: "raise", to: 100 });             // BTN raises to 100 (raise of 80)
	L = P.legal(S); eq(L.minTo, 180, "next min raise: 100 + 80");
	P.act(S, { type: "fold" });                       // SB folds
	P.act(S, { type: "raise", to: 180 });             // BB re-raises to 180 (+80)
	L = P.legal(S); eq(L.seat, 3, "back to UTG"); eq(L.maxTo, 150, "UTG can only go all-in for 150"); ok(!L.canRaise, "UTG has fewer chips than the call: no raise possible");
	P.act(S, { type: "allin" });                      // UTG all-in 150 (< 180: just a call for less)
	L = P.legal(S); eq(L.seat, 0, "BTN to act"); eq(L.toCall, 80, "BTN owes 80");
	ok(L.canRaise, "BTN faced a full raise (BB's re-raise) so may raise again");
	P.act(S, { type: "call" });
	eq(S.street, 1, "flop dealt after the calls");
	// incomplete raise: A bets 100, B all-in to 150 (raise of 50 < 100); A, who already acted, may only call or fold
	var T = P.startHand({ stacks: [2000, 2000, 170], button: 0, sb: 10, bb: 20, rng: P.rng(2) });
	P.act(T, { type: "call" }); P.act(T, { type: "call" }); P.act(T, { type: "check" });   // limp to the flop
	eq(T.street, 1, "flop");
	eq(T.toAct, 1, "post-flop the first player left of the button acts first");
	P.act(T, { type: "bet", to: 100 });                // seat 1 bets 100
	P.act(T, { type: "allin" });                       // seat 2 all-in for 150 total (incomplete raise)
	var L2 = P.legal(T); eq(L2.seat, 0, "seat 0 next"); ok(L2.canRaise, "seat 0 has not acted on this street: may raise"); eq(L2.minTo, 250, "min raise stays a full 100 over 150");
	P.act(T, { type: "call" });
	var L3 = P.legal(T); eq(L3.seat, 1, "back to the original bettor"); ok(!L3.canRaise, "an incomplete all-in raise does not reopen the betting"); eq(L3.toCall, 50, "must call 50 more");
	// heads-up: the button is the small blind, acts first pre-flop and last after the flop
	var H = P.startHand({ stacks: [1000, 1000], button: 1, sb: 10, bb: 20, rng: P.rng(5) });
	eq(H.sbSeat, 1, "heads-up: button posts the small blind"); eq(H.toAct, 1, "heads-up: button acts first pre-flop");
	P.act(H, { type: "call" }); P.act(H, { type: "check" });
	eq(H.toAct, 0, "heads-up: big blind acts first after the flop");
	// big blind all-in for less than the blind: the small blind only has to match it, the extra comes back
	var B = P.startHand({ stacks: [1000, 15], button: 0, sb: 10, bb: 20, rng: P.rng(6) });
	var LB = P.legal(B); eq(LB.toCall, 5, "SB calls only up to the short all-in"); ok(!LB.canRaise, "no raising against an all-in player");
	P.act(B, { type: "call" });
	ok(B.done, "runs out"); eq(B.seats[0].stack + B.seats[1].stack, 1015, "chips conserved (short BB)");
	// everybody folds to the big blind
	var F = P.startHand({ stacks: [500, 500, 500], button: 0, sb: 5, bb: 10, rng: P.rng(8) });
	P.act(F, { type: "fold" }); P.act(F, { type: "fold" });
	ok(F.done && !F.result.showdown, "folds end the hand without a showdown"); eq(F.seats[2].stack, 505, "big blind wins the small blind");
	// split pot with an odd chip
	var holes = [C("2c 3d"), C("4h 5s"), C("Kd Kc")], board = C("Ah Kh Qh Jh Th");
	var Sp = P.startHand({ stacks: [1001, 1001, 1001], button: 0, sb: 5, bb: 10, deck: deckFor(holes, 0, board) });
	P.act(Sp, { type: "allin" }); P.act(Sp, { type: "call" }); P.act(Sp, { type: "call" });
	eq(Sp.result.pots[0].winners.length, 3, "royal on board: three-way split");
	eq(Sp.seats.map(function (s) { return s.stack; }).join(), "1001,1001,1001", "split pot: every chip back");
	var holes2 = [C("2c 3d"), C("4h 5s"), C("7d 8c")], board2 = C("Ah Ad Kc Ks 9s");
	var Sq = P.startHand({ stacks: [1000, 1000, 1001], button: 2, sb: 5, bb: 10, deck: deckFor(holes2, 2, board2) });
	P.act(Sq, { type: "fold" });     // seat 2 (button, UTG 3-handed) folds
	P.act(Sq, { type: "raise", to: 300 }); P.act(Sq, { type: "call" });   // SB seat 0 raises, BB seat 1 calls
	P.act(Sq, { type: "check" }); P.act(Sq, { type: "check" }); P.act(Sq, { type: "check" }); P.act(Sq, { type: "check" }); P.act(Sq, { type: "check" }); P.act(Sq, { type: "check" });
	eq(Sq.result.pots[0].winners.length, 2, "board plays: seats 0 and 1 split");
	ok(Sq.result.pots[0].amount === 600, "pot 600");
	eq(P.positionName(Sq, 2), "BTN", "position names");
})();

/* 8. odd pot split through a full hand: 3 equal winners of 1000 + ante-free pot that is not divisible */
(function () {
	var holes = [C("2c 3d"), C("4h 5s"), C("6d 7c"), C("8s 9h")], board = C("Ah Kh Qh Jh Th");
	var S = P.startHand({ stacks: [1000, 1000, 1000, 333], button: 3, sb: 10, bb: 20, deck: deckFor(holes, 3, board) });
	// seat 2 UTG, seat 3 BTN, seat 0 SB, seat 1 BB
	P.act(S, { type: "allin" }); P.act(S, { type: "allin" }); P.act(S, { type: "call" }); P.act(S, { type: "fold" });
	// contributions: seat2 1000, seat3 333, seat0 1000, seat1 20 (folded): main pot 333*3+20 = 1019 split 3 ways (odd chip)
	var mp = S.result.pots[0];
	eq(mp.amount, 1019, "main pot with the folded blind");
	var sh = mp.shares, ks = Object.keys(sh).map(Number);
	eq(ks.length, 3, "three winners");
	eq(sh[0], 340, "seat 0 (first left of the button) gets an odd chip"); eq(sh[2], 340, "seat 2 gets the second odd chip"); eq(sh[3], 339, "seat 3 (the button) gets none");
	eq(S.result.pots[1].amount, 1334, "side pot between the two big stacks");
})();

/* 9. stress: random hands with the computer players never lose or create chips */
(function () {
	var r = P.rng(11), styles = Object.keys(P.STYLES), errors = 0, hands = 0;
	for (var g = 0; g < 300; g++) {
		var n = 2 + Math.floor(r() * 8), stacks = [];
		for (var i = 0; i < n; i++) stacks.push(r() < 0.3 ? 20 + Math.floor(r() * 300) : 1000 + Math.floor(r() * 3000));
		var tot = stacks.reduce(function (a, b) { return a + b; }), S;
		try {
			S = P.startHand({ stacks: stacks, button: Math.floor(r() * n), sb: 10, bb: 20, rng: r });
			var guard = 0;
			while (!S.done && guard++ < 400) {
				var a = r() < 0.15 ? randomAction(S, r) : P.botDecide(S, S.toAct, styles[S.toAct % styles.length], r, 40);
				P.act(S, a);
			}
			if (!S.done) throw new Error("hand did not finish");
			var after = S.seats.reduce(function (t, s) { return t + s.stack; }, 0);
			if (after !== tot) throw new Error("chips " + tot + " -> " + after);
			if (S.seats.some(function (s) { return s.stack < 0; })) throw new Error("negative stack");
			hands++;
		} catch (e) { errors++; if (errors < 4) console.log("  stress error: " + e.message); }
	}
	eq(errors, 0, "300 random hands (2-9 players, bots + random actions): no errors, chips conserved");
	function randomAction(S, r) {
		var L = P.legal(S), x = r();
		if (x < 0.2) return { type: "fold" };
		if (x < 0.6 || !L.canRaise) return L.canCheck ? { type: "check" } : { type: "call" };
		if (x < 0.75) return { type: "allin" };
		return { type: "raise", to: L.minTo + Math.floor(r() * (L.maxTo - L.minTo + 1)) };
	}
})();

/* 10. starting-hand chart */
(function () {
	eq(P.CHART.length, 169, "169 starting hands");
	eq(P.classLabel(P.handClass(P.parseCard("As"), P.parseCard("Ks"))), "AKs", "AKs label");
	eq(P.classLabel(P.handClass(P.parseCard("7d"), P.parseCard("2c"))), "72o", "72o label");
	near(P.CHART[0] / 1000, 0.852, 0.004, "AA ~85.2% vs a random hand");
	near(P.CHART[P.handClass(P.parseCard("7d"), P.parseCard("2c"))] / 1000, 0.346, 0.005, "72o ~34.6%");
	var tot = 0; for (var i = 0; i < 169; i++) tot += P.classCombos(i); eq(tot, 1326, "1,326 two-card combos");
	ok(P.holePercentile(C("Ah Ad")) < 0.005, "AA is in the top 0.5%");
})();

console.log(pass + " passed, " + fail + " failed (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
process.exit(fail ? 1 : 0);
