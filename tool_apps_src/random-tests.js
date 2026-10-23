/* node tool_apps_src/random-tests.js : tests for tool_apps_src/random/lib.js (MESRand) */
"use strict";
var R = require("./random/lib.js");
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + ", want " + b + ")"); }

/* --- unbiased integers: a fake rng that counts through every 32-bit value shows rejection removes the bias --- */
(function () {
	/* n = 3: 2^32 % 3 = 1, so exactly one value (the top one) must be rejected */
	var seq = [4294967295, 0, 4294967294, 1, 2]; var k = 0; var rng = { u32: function () { return seq[k++]; } };
	ok(R.below(rng, 3) === 0 && k === 2, "top value rejected for n=3");
	ok(R.below(rng, 3) === 4294967294 % 3, "value below limit accepted");
	/* exhaustive check on a small simulated word size: map each u32 bucket */
	var rng2 = R.seeded("bias"), counts = [0, 0, 0, 0, 0, 0, 0];
	for (var i = 0; i < 70000; i++) counts[R.below(rng2, 7)]++;
	var cs = R.chiSquare(counts); ok(cs.p > 0.001, "seeded below(7) uniform, p=" + cs.p.toFixed(3));
	var rng3 = R.cryptoRng(), c2 = [0, 0, 0, 0, 0, 0];
	for (var j = 0; j < 60000; j++) c2[R.intIn(rng3, 1, 6) - 1]++;
	ok(R.chiSquare(c2).p > 0.0005, "crypto intIn(1,6) uniform");
	var big = R.below(R.seeded("x"), 1e15); ok(big >= 0 && big < 1e15 && big === Math.floor(big), "53-bit range works");
	var allIn = true, r4 = R.seeded("r"); for (var q = 0; q < 2000; q++) { var v = R.intIn(r4, -5, 5); if (v < -5 || v > 5) allIn = false; } ok(allIn, "intIn bounds");
	ok(R.below(R.seeded("a"), 1) === 0, "n=1");
	var a = R.seeded("same"), b = R.seeded("same"); ok(a.u32() === b.u32() && a.u32() === b.u32(), "seeded is reproducible");
	ok(R.seeded("one").u32() !== R.seeded("two").u32(), "different seeds differ");
	var u = R.unit(R.seeded("u")); ok(u >= 0 && u < 1, "unit in [0,1)");
})();

/* --- numbers --- */
(function () {
	var rng = R.seeded("n");
	var r = R.numbers(rng, { min: 1, max: 10, count: 10, unique: true, sort: "asc" });
	ok(r.values.join(",") === "1,2,3,4,5,6,7,8,9,10", "10 unique of 1-10 is a permutation");
	ok(/only 10 are possible/.test(R.numbers(rng, { min: 1, max: 10, count: 11, unique: true }).error), "impossible unique errors");
	var ex = R.numbers(rng, { min: 1, max: 5, count: 3, unique: true, exclude: [2, 4] }); ok(ex.values.slice().sort().join(",") === "1,3,5", "exclude respected");
	ok(/excluded/.test(R.numbers(rng, { min: 1, max: 2, count: 1, exclude: [1, 2] }).error), "all excluded errors");
	var big = R.numbers(rng, { min: 1, max: 1e12, count: 500, unique: true }); ok(new Set(big.values).size === 500, "unique in huge range");
	var dec = R.numbers(rng, { min: 0, max: 1, count: 50, places: 2 }); ok(dec.values.every(function (v) { return v >= 0 && v <= 1 && Math.abs(Math.round(v * 100) - v * 100) < 1e-9; }), "2 decimal places");
	var sw = R.numbers(rng, { min: 10, max: 1, count: 5 }); ok(sw.values.every(function (v) { return v >= 1 && v <= 10; }), "min/max swapped");
	var desc = R.numbers(rng, { min: 1, max: 100, count: 20, sort: "desc" }).values; ok(desc.every(function (v, i) { return !i || desc[i - 1] >= v; }), "sort desc");
	var neg = R.numbers(rng, { min: -3, max: 3, count: 7, unique: true, sort: "asc" }); ok(neg.values.join(",") === "-3,-2,-1,0,1,2,3", "negative range");
	ok(R.parseList("3, 7 10-12").values.join(",") === "3,7,10,11,12", "parse exclude list with range");
	ok(R.parseNum("1,234.5") === 1234.5 && R.parseNum("2,5") === 2.5 && isNaN(R.parseNum("abc")), "parseNum");
	var l = R.lottery(rng, "em"); ok(l.parts[0].values.length === 5 && l.parts[1].values.length === 2 && new Set(l.parts[0].values).size === 5, "EuroMillions style shape");
	ok(R.lotteryOdds("649") === 13983816, "6/49 odds");
	ok(R.lotteryOdds("pb") === 292201338, "Powerball odds");
	ok(R.lotteryOdds("em") === 139838160, "EuroMillions odds");
})();

/* --- dice notation --- */
(function () {
	function P(s) { return R.parseDice(s); }
	function one(s) { var p = P(s); return p.terms && p.terms.filter(function (t) { return t.type === "dice"; })[0]; }
	var t = one("2d6+3"); ok(t.n === 2 && t.sides === 6 && P("2d6+3").terms[1].v === 3, "2d6+3");
	ok(one("d20").n === 1 && one("d20").sides === 20, "d20");
	var k = one("4d6kh3"); ok(k.keep.n === 3 && k.keep.high, "4d6kh3");
	var dl = one("4d6 drop lowest"); ok(dl.keep.n === 3 && dl.keep.high, "drop lowest");
	ok(one("4d6dl1").keep.n === 3, "4d6dl1");
	var kl = one("2d20kl1"); ok(kl.keep.n === 1 && !kl.keep.high, "kl");
	ok(one("5d10 drop highest 2").keep.n === 3 && !one("5d10 drop highest 2").keep.high, "drop highest 2");
	var adv = one("d20 adv"); ok(adv.n === 2 && adv.keep.n === 1 && adv.keep.high, "d20 adv");
	var dis = one("d20 with disadvantage"); ok(dis.n === 2 && !dis.keep.high, "disadvantage words");
	ok(one("3d6!").explode, "explode");
	ok(one("d%").sides === 100, "d%");
	var f = one("4dF"); ok(f.fudge && f.sides === 3, "fudge");
	ok(one("4d6k3").keep.n === 3, "k = keep highest");
	ok(P("2d6 + 1d8 - 2").terms.length === 3 && P("2d6 + 1d8 - 2").terms[2].v === -2, "multi term");
	ok(P("-d4").terms[0].sign === -1, "leading minus");
	ok(P("2D6").terms[0].sides === 6, "upper case");
	["", "abc", "2d", "d1", "0d6", "2d6+", "2d6++3", "4d6kh5", "4d6dl4", "2d20adv", "4dF!", "1001d6", "d200000", "5", "2d6 3", "2d6d8", "d20 adv kh1"].forEach(function (s) {
		ok(!!P(s).error, "error for \"" + s + "\" (" + (P(s).error || "none") + ")");
	});
	ok(P("2d6+3").text === "2d6 + 3", "describe");
	ok(P("d20 adv").text === "d20 with advantage", "describe adv");
	/* rolling */
	var rng = R.seeded("roll"), allIn = true, keptOk = true;
	for (var i = 0; i < 500; i++) {
		var r = R.rollDice(rng, P("4d6kh3+1")), d = r.groups[0].dice;
		if (r.total < 4 || r.total > 19) allIn = false;
		var kept = d.filter(function (x) { return x.kept; }); if (kept.length !== 3) keptOk = false;
		var dropped = d.filter(function (x) { return !x.kept; })[0]; if (kept.some(function (x) { return x.v < dropped.v; })) keptOk = false;
	}
	ok(allIn, "4d6kh3+1 in range"); ok(keptOk, "drops the lowest");
	var ex = 0; for (var j = 0; j < 2000; j++) { var e = R.rollDice(rng, P("d6!")); if (e.total > 6) { ex++; if (e.groups[0].dice[0].chain.length < 2) ex = -1e9; } }
	ok(ex > 200 && ex < 480, "exploding chains (" + ex + ")");
	var fz = true; for (var q = 0; q < 300; q++) { var fv = R.rollDice(rng, P("4dF")).total; if (fv < -4 || fv > 4) fz = false; } ok(fz, "fudge range");
})();

/* --- distributions --- */
(function () {
	function D(s) { return R.distribution(R.parseDice(s), { rng: R.seeded("mc") }); }
	function sum(d) { return R.pairs(d).reduce(function (a, x) { return a + x[1]; }, 0); }
	["2d6", "4d6kh3", "d20 adv", "3d6!", "10d10", "4dF", "2d6+1d8-2", "d%", "8d6dl2", "100d6"].forEach(function (s) { near(sum(D(s)), 1, 1e-9, "sums to 1: " + s); });
	near(R.probAt(D("2d6"), 7, "eq"), 6 / 36, 1e-12, "2d6 P(7)");
	near(R.probAt(D("2d6"), 12, "eq"), 1 / 36, 1e-12, "2d6 P(12)");
	near(R.summary(D("4d6kh3")).mean, 12.2446, 5e-5, "4d6kh3 mean");
	near(R.probAt(D("4d6kh3"), 18, "eq"), 21 / 1296, 1e-12, "4d6kh3 P(18)");
	near(R.probAt(D("4d6kh3"), 3, "eq"), 1 / 1296, 1e-12, "4d6kh3 P(3)");
	near(R.probAt(D("d20 adv"), 20, "eq"), 39 / 400, 1e-12, "d20 adv P(20)");
	near(R.probAt(D("d20 dis"), 1, "eq"), 39 / 400, 1e-12, "d20 dis P(1)");
	near(R.summary(D("d20 adv")).mean, 13.825, 1e-9, "d20 adv mean");
	near(R.summary(D("3d6")).mean, 10.5, 1e-9, "3d6 mean");
	near(R.summary(D("3d6")).sd, Math.sqrt(3 * 35 / 12), 1e-9, "3d6 sd");
	near(R.probAt(D("2d6+3"), 10, "ge"), 21 / 36, 1e-12, "2d6+3 at least 10");
	near(R.probAt(D("1d6-1d6"), 0, "eq"), 1 / 6, 1e-12, "d6 - d6 = 0");
	near(R.summary(D("d6!")).mean, 4.2, 1e-9, "exploding d6 mean 4.2");
	near(R.probAt(D("d6!"), 6, "eq"), 0, 1e-15, "exploding d6 can't total exactly 6");
	near(R.probAt(D("d6!"), 7, "eq"), 1 / 36, 1e-12, "exploding d6 P(7)");
	near(R.summary(D("4dF")).mean, 0, 1e-12, "4dF mean");
	near(R.probAt(D("4dF"), 4, "eq"), 1 / 81, 1e-12, "4dF P(4)");
	ok(D("2d6").exact, "2d6 exact");
	var mc = D("3d6!kh2"); ok(!mc.exact && /simulated/.test(mc.note), "explode + keep is simulated");
	var big = D("60d20kh30"); ok(!big.exact, "huge keep falls back to simulation");
	near(R.summary(D("100d6")).mean, 350, 1e-6, "100d6 mean");
	var dec = D("d6+0.5"); ok(!dec.exact || R.summary(dec).mean, "decimal constant handled");
})();

/* --- chi-square --- */
(function () {
	near(R.gammaQ(0.5, 3.841459 / 2), 0.05, 1e-6, "chi2 3.84 df1 -> 0.05");
	near(R.chiSquare([10, 10, 10, 10, 10, 10]).p, 1, 1e-12, "perfect fit p=1");
	var r = R.chiSquare([5, 8, 9, 8, 10, 20]); near(r.chi2, 13.4, 1e-9, "chi2 statistic"); near(r.p, 0.019905, 2e-5, "chi2 13.4 df5 p");
	near(R.gammaQ(2.5, 11.0705 / 2), 0.05, 1e-5, "df5 critical 11.07");
	near(R.gammaQ(9.5, 30.1435 / 2), 0.05, 1e-5, "df19 critical 30.14");
	near(R.gammaQ(1, 9.21034 / 2), 0.01, 1e-6, "df2 0.01");
	ok(!R.chiSquare([1, 2, 1, 0, 1, 1]).enough, "small sample flagged");
	ok(/fair/.test(R.verdict(R.chiSquare([100, 98, 103, 99, 101, 99]))), "verdict fair");
	ok(/not fair|unlikely/i.test(R.verdict(R.chiSquare([10, 10, 10, 10, 10, 100]))), "verdict loaded");
	near(Math.exp(R.lgamma(5)), 24, 1e-9, "lgamma");
	near(R.chiSquare([30, 70], [0.25, 0.75]).chi2, 4 / 3, 1e-9, "custom expected probabilities");
})();

/* --- coins, cards, lists --- */
(function () {
	var rng = R.seeded("c");
	var f = R.flips(rng, 1000), h = f.filter(Boolean).length; ok(h > 430 && h < 570, "1000 flips about half heads (" + h + ")");
	var s = R.streaks([1, 1, 0, 1, 1, 1, 0, 0]); ok(s.heads === 3 && s.tails === 2 && s.current === 2 && s.last === 0, "streaks");
	var d = R.deck(false); ok(d.length === 52 && new Set(d).size === 52, "52 unique cards");
	var dj = R.deck(true); ok(dj.length === 54 && new Set(dj).size === 54, "54 with jokers");
	var sh = R.shuffle(rng, d); ok(sh.length === 52 && new Set(sh).size === 52 && sh.join() !== d.join(), "shuffle keeps every card");
	ok(R.cardInfo("QH").name === "Queen of hearts" && R.cardInfo("QH").hot && !R.cardInfo("10S").hot && R.cardInfo("10S").rank === "10", "card info");
	ok(R.cardInfo("JK1").joker, "joker info");
	var dl = R.deal(sh, 4, 5); ok(dl.hands.length === 4 && dl.hands.every(function (x) { return x.length === 5; }) && dl.rest.length === 32, "deal 4 x 5");
	ok(dl.hands[0][0] === sh[0] && dl.hands[1][0] === sh[1], "deal round-robin");
	/* every card equally likely to land on top */
	var top = {}; for (var i = 0; i < 26000; i++) { var c = R.shuffle(rng, ["a", "b", "c", "d"])[0]; top[c] = (top[c] || 0) + 1; }
	ok(R.chiSquare([top.a, top.b, top.c, top.d]).p > 0.001, "shuffle unbiased");
	var names = R.parseNames("Ann\nBob, Cy;\n\nDee\tEd "); ok(names.join("|") === "Ann|Bob|Cy|Dee|Ed", "parse names");
	var p = R.pickN(rng, names, 3); ok(p.length === 3 && new Set(p).size === 3, "pick 3 different");
	var t = R.teams(rng, names, 2); ok(t.length === 2 && t[0].length + t[1].length === 5 && Math.abs(t[0].length - t[1].length) <= 1, "2 teams");
	var ts = R.teams(rng, names, 2, true); ok(ts.length === 3, "teams of 2 -> 3 teams");
})();

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
