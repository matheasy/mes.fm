// node tool_apps_src/backgammon-tests.js : rules, odds and engine-vs-engine games for MES Backgammon (lib.js = MESBG)
"use strict";
var B = require("./backgammon/lib.js");
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + " (got " + a + ", expected " + b + ")"); }
function empty() { var a = []; for (var i = 0; i < 26; i++) a.push(0); return a; }
function board(me, op) {   // me / op: {point: n} in each side's own numbering; the rest is borne off
	var b = [empty(), empty()], t = [0, 0];
	[me, op].forEach(function (m, s) { Object.keys(m).forEach(function (k) { b[s][+k] = m[k]; t[s] += m[k]; }); b[s][0] += 15 - t[s]; });
	return b;
}

// --- starting position and move counts
var st = B.newBoard();
ok(B.valid(st), "start position valid");
eq(B.pips(st[0]), 167, "start pip count");
eq(B.plays(st, 0, [3, 1]).length, 16, "opening 3-1 has 16 distinct legal plays");
eq(B.plays(st, 1, [3, 1]).length, 16, "same for the other side");
eq(B.plays(st, 0, [2, 1]).length, 15, "opening 2-1: 15 plays");
eq(B.plays(st, 0, [6, 5]).length, 7, "opening 6-5: 7 plays");
// every 3-1 play uses both dice and every ordered sequence ends in one of the plays
ok(B.plays(st, 0, [3, 1]).every(function (p) { return p.s.length === 2; }), "3-1 plays use both dice");
var keys = {};
B.plays(st, 0, [3, 1]).forEach(function (p) { keys[JSON.stringify(p.b)] = 1; });
ok(B.sequences(st, 0, [3, 1]).every(function (q) { return keys[JSON.stringify(B.applySeq(st, 0, q))]; }), "every step order ends in a listed play");
// doubles: four moves
ok(B.plays(st, 0, [6, 6, 6, 6]).every(function (p) { return p.s.length === 4; }), "6-6 plays four moves");
eq(B.plays(st, 0, [6, 6, 6, 6]).length, 11, "opening 6-6: 11 plays (regression value from enumeration)");
var seqKeys = {};
B.sequences(st, 0, [4, 4, 4, 4]).forEach(function (q) { seqKeys[JSON.stringify(B.applySeq(st, 0, q))] = 1; });
eq(Object.keys(seqKeys).length, B.plays(st, 0, [4, 4, 4, 4]).length, "4-4: canonical plays cover every ordered sequence");

// --- must use both dice when possible: 20/14/13 is the only full play (the 1 first is blocked on 19)
var b1 = board({ 20: 1, 1: 14 }, { 6: 2 });                  // the other side's 6 point = my 19
ok(B.valid(b1), "test board 1 valid");
var p1 = B.plays(b1, 0, [6, 1]);
ok(p1.length === 1 && p1[0].s.length === 2 && p1[0].b[0][13] === 1, "both dice used when one order allows it (20/13)");

// --- only one die can be played: must play the larger
// my lone checker on 3, all others borne off... choose a non-home case: one checker on 10, rest home on 1
// op blocks 10-2=8 and 10-5-2 ... set dice 5-2: 10-5 = 5 open, then 5-2 = 3 blocked; 10-2 = 8 blocked. Only the 5 can be played.
var b2 = board({ 10: 1, 1: 14 }, { 17: 2, 22: 2 });   // op 17 = my 8, op 22 = my 3
var p2 = B.plays(b2, 0, [5, 2]);
eq(p2.length, 1, "only one die playable -> one play");
ok(p2[0].s.length === 1 && p2[0].s[0][2] === 5, "the larger die (5) is the one played");
// either die alone is playable but not both: must play the larger
var b3 = board({ 10: 1 }, { 22: 2, 23: 2 });      // my 3 and 2 blocked: 10/4 then 4/3 blocked; 10/9 then 9/3 blocked
var p3 = B.plays(b3, 0, [6, 1]);
ok(p3.length === 1 && p3[0].s.length === 1 && p3[0].s[0][2] === 6, "either die alone, not both: the larger (6) must be played");
// no legal move
var b4 = board({ 25: 1, 6: 14 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 24: 3 });   // op home closed: my 19..24 blocked
var p4 = B.plays(b4, 0, [6, 5]);
ok(p4.length === 1 && p4[0].s.length === 0, "closed board: no move");

// --- bar entry first
var b5 = board({ 25: 1, 13: 5, 6: 9 }, { 6: 5, 8: 3, 13: 5, 24: 2 });
var p5 = B.plays(b5, 0, [6, 3]);
ok(p5.every(function (p) { return p.s[0][0] === 25; }), "the checker on the bar enters first");
ok(B.target(b5[0], b5[1], 13, 3) === -1, "nothing else may move while on the bar");
ok(p5.some(function (p) { return p.s[0][1] === 22; }), "enters with the 3 on point 22");
ok(!p5.some(function (p) { return p.s[0][1] === 19; }), "point 19 (the other side's 6 point) is blocked");
// two on the bar, a double
var b6 = board({ 25: 2, 6: 13 }, { 6: 5, 13: 10 });
var p6 = B.plays(b6, 0, [4, 4, 4, 4]);
ok(p6.every(function (p) { return p.s[0][0] === 25 && p.s[1][0] === 25 && p.s.length === 4; }), "two on the bar: both come in, then two more 4s");

// --- bearing off
var b7 = board({ 6: 1, 4: 2, 2: 12 }, { 24: 15 });
ok(B.target(b7[0], b7[1], 4, 6) === -1, "a 6 cannot bear off from 4 while a checker is on 6");
eq(B.target(b7[0], b7[1], 6, 6), 0, "exact 6 bears off from 6");
var b8 = board({ 4: 2, 2: 13 }, { 24: 15 });
eq(B.target(b8[0], b8[1], 4, 6), 0, "a 6 bears off from the highest point (4)");
ok(B.target(b8[0], b8[1], 2, 6) === -1, "but not from a lower point (2) while 4 is occupied");
var b9 = board({ 7: 1, 3: 14 }, { 24: 15 });
ok(B.target(b9[0], b9[1], 3, 3) === -1, "no bearing off while a checker is outside home");
var p9 = B.plays(b9, 0, [4, 3]);
ok(p9.some(function (p) { return p.b[0][0] === 1; }), "bring the last checker in, then bear off in the same turn");
eq(B.bearOffCount(board({ 6: 2 }, { 24: 15 })[0]), 4, "two checkers on 6: off in one roll with 4 doubles (3-3..6-6)");
eq(B.bearOffCount(board({ 1: 2 }, { 24: 15 })[0]), 36, "two on the 1 point: always off");
eq(B.bearOffCount(board({ 3: 1 }, { 24: 15 })[0]), 36, "one checker on 3: always off");
eq(B.bearOffCount(board({ 6: 1 }, { 24: 15 })[0]), 27, "one checker on 6: 27/36 (misses 2-1, 3-1, 4-1, 3-2 and 1-1)");
eq(B.bearOffCount(board({ 12: 1 }, { 24: 15 })[0]), 4, "one checker on 12: only 3-3, 4-4, 5-5, 6-6");

// --- hitting
var b10 = board({ 13: 5, 8: 3, 6: 5, 24: 2 }, { 15: 1, 13: 4, 8: 3, 6: 5, 24: 2 });   // op blot on op 15 = my 10
var p10 = B.plays(b10, 0, [3, 1]);
var hits = p10.filter(function (p) { return p.b[1][25] === 1; });
ok(hits.length > 0, "a blot can be hit");
ok(hits.every(function (p) { return p.b[1][15] === 0 && B.valid(p.b); }), "the hit checker goes to the bar");

// --- scoring
function lost(op) { var b = board({}, op); b[1][0] = 0; return b; }
eq(B.resultKind(lost({ 6: 15 }), 0), 2, "loser has borne off none: gammon");
eq(B.resultKind(lost({ 6: 14, 19: 1 }), 0), 3, "loser still in the winner's home board: backgammon");
eq(B.resultKind(lost({ 25: 1, 6: 14 }), 0), 3, "loser on the bar: backgammon");
eq(B.resultKind(board({}, { 6: 5 }), 0), 1, "loser has borne off some: single game");

// --- shot table (no blocks): the standard numbers
var SHOT = { 1: 11, 2: 12, 3: 14, 4: 15, 5: 15, 6: 17, 7: 6, 8: 6, 9: 5, 10: 3, 11: 2, 12: 3, 13: 0, 14: 0, 15: 1, 16: 1, 17: 0, 18: 1, 19: 0, 20: 1, 21: 0, 22: 0, 23: 0, 24: 1 };
Object.keys(SHOT).forEach(function (d) { eq(B.shotCount(+d), SHOT[d], "shot at distance " + d); });
eq(B.directCount(6), 11, "direct 6 = 11/36");
// cross-check the exact hit odds of the real move generator on an empty board
for (var d = 1; d <= 18; d++) {
	var me = {}; me[20] = 1; me[1] = 0;
	var op = {}; op[25 - (20 - d)] = 1;
	var bb = board(me, op);
	var ho = B.hitOdds(bb, 0);
	eq(ho.any, SHOT[d], "move generator agrees on distance " + d);
}
// blocks lower indirect shots: distance 8 = 6-2, 2-6, 5-3, 3-5, 4-4, 2-2; block the 6 and 2 landing points
var bb2 = board({ 20: 1, 1: 0 }, { 13: 1, 11: 2, 7: 2 });   // target op 13 = my 12 (distance 8); op 11 = my 14 (20-6), op 7 = my 18 (20-2)
var ho2 = B.hitOdds(bb2, 0);
eq(ho2.any, 3, "distance 8 with 6 and 2 points blocked: only 5-3, 3-5 and 4-4 (2-2 lands on 18)");

// --- notation
eq(B.notation([[13, 10, 3, 0], [10, 9, 1, 0]]), "13/9", "a chained move is merged");
eq(B.notation([[8, 5, 3, 0], [6, 5, 1, 1]]), "8/5 6/5*", "hits are marked");
eq(B.notation([[13, 9, 4, 0], [13, 9, 4, 0], [6, 2, 4, 0], [6, 2, 4, 0]]), "13/9(2) 6/2(2)", "repeats counted");
eq(B.notation([[25, 22, 3, 0]]), "bar/22", "bar");

// --- cube rules
var c0 = { level: "medium", cube: { v: 1, owner: -1 }, match: { to: 0, score: [0, 0] } };
ok(B.canDouble(0, c0), "centred cube: either may double");
ok(!B.canDouble(0, { cube: { v: 2, owner: 1 }, match: { to: 0, score: [0, 0] } }), "cannot double when the other side owns the cube");
ok(!B.canDouble(0, { cube: { v: 1, owner: -1 }, match: { to: 5, score: [4, 2], crawford: true } }), "no doubling in the Crawford game");
ok(!B.canDouble(0, { cube: { v: 2, owner: 0 }, match: { to: 5, score: [3, 1] } }), "dead cube: 3 + 2 already wins the match");
var crushing = board({ 6: 3, 5: 3, 4: 3, 3: 3, 2: 3 }, { 25: 2, 13: 5, 8: 3, 6: 5 });
ok(B.shouldDouble(crushing, 0, { level: "hard", cube: { v: 1, owner: -1 }, match: { to: 0, score: [0, 0] }, jacoby: true }), "doubles a crushing position");
ok(!B.shouldTake(crushing, 1, { level: "hard", cube: { v: 1, owner: -1 }, match: { to: 0, score: [0, 0] } }), "drops a crushing position");
ok(!B.shouldDouble(st, 0, Object.assign({}, c0, { level: "hard" })), "no double in the starting position");
ok(B.shouldTake(st, 1, c0), "takes in the starting position");

// --- engine vs engine: 1000 games end correctly
var rnd = B.rng(12345), lv = ["easy", "medium"], games = 0, bad = 0, wins = [0, 0], kinds = [0, 0, 0, 0], maxTurns = 0;
for (var g = 0; g < 1000; g++) {
	var b = B.newBoard(), s = g % 2, n = 0;
	while (B.winnerOf(b) < 0 && n < 3000) {
		var d1 = 1 + Math.floor(rnd() * 6), d2 = 1 + Math.floor(rnd() * 6), dice = B.diceList(d1, d2);
		var legal = B.plays(b, s, dice);
		var pick = B.choosePlay(b, s, dice, lv[(g >> 1) % 2 ? s : 1 - s], rnd);
		var nb = B.applySeq(b, s, pick.s);
		var key = JSON.stringify(nb);
		if (!B.valid(nb) || !legal.some(function (p) { return JSON.stringify(p.b) === key; })) { bad++; break; }
		b = nb; s = 1 - s; n++;
	}
	var w = B.winnerOf(b);
	if (w < 0 || b[w][0] !== 15 || b[1 - w][0] === 15) bad++;
	else { wins[w]++; kinds[B.resultKind(b, w)]++; games++; }
	if (n > maxTurns) maxTurns = n;
}
eq(bad, 0, "1000 engine games: no illegal or unfinished game");
eq(games, 1000, "1000 games finished");
console.log("  games: single " + kinds[1] + ", gammon " + kinds[2] + ", backgammon " + kinds[3] + ", longest " + maxTurns + " turns");
// Hard is quick enough
var t0 = Date.now(); B.choosePlay(st, 0, [5, 2], "hard"); var t1 = Date.now() - t0;
ok(t1 < 1500, "Hard picks an opening move in " + t1 + " ms");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
