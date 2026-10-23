/* Generates MESPoker.CHART: pre-flop equity (x 1000, ties count half) of each of the 169 starting hands against ONE random hand.
   For each class one representative hand is used (suits don't matter against a random hand); every one of the 1,225 possible
   opponent hands is played against BOARDS random boards (seeded, so the output is reproducible).
   Usage: node tool_apps_src/poker/gen-chart.js [boards=1000]  -> prints the array; paste it into lib.js at var CHART = [...]. */
var P = require("./lib.js");
var BOARDS = +(process.argv[2] || 1000), r = P.rng(20261023), out = [];
var h = new Int32Array(7), t0 = Date.now();
for (var i = 0; i < 169; i++) {
	var a = Math.floor(i / 13), b = i % 13, ra = 12 - a, rb = 12 - b, c1, c2;
	if (a === b) { c1 = ra * 4; c2 = ra * 4 + 1; }
	else if (a < b) { c1 = ra * 4; c2 = (12 - b) * 4; }           // suited: both spades
	else { c1 = (12 - b) * 4; c2 = (12 - a) * 4 + 1; }            // offsuit
	if (P.handClass(c1, c2) !== i) throw new Error("class mismatch " + i);
	var rem = P.remainingDeck([c1, c2]), won = 0, n = 0;
	for (var x = 0; x < rem.length; x++) for (var y = x + 1; y < rem.length; y++) {
		var o1 = rem[x], o2 = rem[y], d = rem.filter(function (c) { return c !== o1 && c !== o2; }), m = d.length;
		for (var k = 0; k < BOARDS; k++) {
			for (var z = 0; z < 5; z++) { var j = z + Math.floor(r() * (m - z)), t = d[z]; d[z] = d[j]; d[j] = t; h[2 + z] = d[z]; }
			h[0] = c1; h[1] = c2; var v1 = P.evaluate(h, 7);
			h[0] = o1; h[1] = o2; var v2 = P.evaluate(h, 7);
			won += v1 > v2 ? 1 : v1 === v2 ? 0.5 : 0; n++;
		}
	}
	out.push(Math.round(won / n * 1000));
	if (process.stderr.isTTY) process.stderr.write("\r" + (i + 1) + "/169 " + P.classLabel(i) + " " + (won / n * 100).toFixed(2) + "%   ");
}
process.stderr.write("\ndone in " + ((Date.now() - t0) / 1000).toFixed(1) + " s\n");
console.log(JSON.stringify(out));
