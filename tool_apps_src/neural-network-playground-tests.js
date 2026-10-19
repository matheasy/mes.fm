// node tool_apps_src/neural-network-playground-tests.js
const N = require("./neural-network-playground/lib.js"), assert = require("assert"); let n = 0;
function t(name, f) { try { f(); n++; } catch (e) { console.log("FAIL " + name + ": " + e.message); process.exitCode = 1; } }
t("backprop gradient equals the numeric gradient (sigmoid output, tanh)", () => {
	const net = new N.Net([3, 4, 3, 1], { act: "tanh", seed: 5, l2: 0.01 }), r = N.rng(2), X = [], Y = []; for (let i = 0; i < 6; i++) { X.push([r() - 0.5, r() - 0.5, r() - 0.5]); Y.push(i % 2); }
	const g = net.grads(X, Y); let worst = 0;
	for (let l = 0; l < net.W.length; l++) for (const [P, G] of [[net.W[l], g.gW[l]], [net.b[l], g.gb[l]]]) for (let i = 0; i < P.length; i += 3) { const o = P[i], h = 1e-5; P[i] = o + h; const lp = net.grads(X, Y).loss; P[i] = o - h; const lm = net.grads(X, Y).loss; P[i] = o; const num = (lp - lm) / (2 * h); worst = Math.max(worst, Math.abs(num - G[i]) / (1e-8 + Math.abs(num) + Math.abs(G[i]))); }
	assert.ok(worst < 1e-5, "worst relative error " + worst);
});
t("gradient check: softmax + relu", () => {
	const net = new N.Net([2, 5, 3], { act: "relu", seed: 9 }), X = [[0.3, -0.2], [-0.5, 0.7], [0.9, 0.1], [-0.1, -0.9]], Y = [0, 1, 2, 1]; const g = net.grads(X, Y); let worst = 0;
	for (let l = 0; l < net.W.length; l++) for (let i = 0; i < net.W[l].length; i++) { const o = net.W[l][i], h = 1e-6; net.W[l][i] = o + h; const lp = net.grads(X, Y).loss; net.W[l][i] = o - h; const lm = net.grads(X, Y).loss; net.W[l][i] = o; const num = (lp - lm) / (2 * h); worst = Math.max(worst, Math.abs(num - g.gW[l][i]) / (1e-7 + Math.abs(num) + Math.abs(g.gW[l][i]))); }
	assert.ok(worst < 1e-4, "worst " + worst);
});
t("softmax outputs sum to 1; sigmoid in (0,1)", () => { const a = new N.Net([2, 4, 5], { seed: 1 }).forward([0.2, -0.4]); assert.ok(Math.abs(a.reduce((s, v) => s + v, 0) - 1) < 1e-12); const b = new N.Net([2, 4, 1], { seed: 1 }).forward([5, -7]); assert.ok(b[0] > 0 && b[0] < 1); });
t("XOR is learned (tanh, 4 hidden)", () => { const X = [[0, 0], [0, 1], [1, 0], [1, 1]].map(p => p.map(v => v * 2 - 1)), Y = [0, 1, 1, 0], net = new N.Net([2, 4, 1], { act: "tanh", seed: 3 }), rand = N.rng(1); for (let e = 0; e < 600; e++) net.train(X, Y, { lr: 0.05, batch: 4, rand }); assert.strictEqual(net.accuracy(X, Y), 1); });
t("circle dataset: a [8,8] network separates it; a linear one cannot", () => {
	const D = N.makeData("circle", 200, 0.1, 4), S = N.split(D, 0.7, 1), F = ["x", "y", "x2", "y2"], tr = N.featurize(S.train.X, ["x", "y"]), te = N.featurize(S.test.X, ["x", "y"]);
	const lin = new N.Net([2, 1], { seed: 1 }), deep = new N.Net([2, 8, 8, 1], { act: "tanh", seed: 2 }), r = N.rng(5);
	for (let e = 0; e < 250; e++) { lin.train(tr, S.train.y, { lr: 0.03, rand: r }); deep.train(tr, S.train.y, { lr: 0.03, rand: r }); }
	assert.ok(deep.accuracy(te, S.test.y) > 0.92, "deep " + deep.accuracy(te, S.test.y)); assert.ok(lin.accuracy(te, S.test.y) < 0.8, "linear " + lin.accuracy(te, S.test.y));
	const sq = N.featurize(S.train.X, ["x2", "y2"]), net2 = new N.Net([2, 1], { seed: 3 }); for (let e = 0; e < 250; e++) net2.train(sq, S.train.y, { lr: 0.1, rand: r }); assert.ok(net2.accuracy(N.featurize(S.test.X, ["x2", "y2"]), S.test.y) > 0.9, "x² and y² features make it linearly separable");
});
t("three clusters with softmax", () => { const r = N.rng(8), X = [], Y = []; const C = [[-0.6, -0.5], [0.6, -0.4], [0, 0.7]]; for (let i = 0; i < 150; i++) { const c = i % 3; X.push([C[c][0] + N.gauss(r) * 0.12, C[c][1] + N.gauss(r) * 0.12]); Y.push(c); } const net = new N.Net([2, 6, 3], { seed: 2 }); for (let e = 0; e < 80; e++) net.train(X, Y, { lr: 0.03, rand: r }); assert.ok(net.accuracy(X, Y) > 0.97); });
t("datasets: sizes, ranges, balance, determinism", () => { for (const [k] of N.DATASETS) { const D = N.makeData(k, 100, 0.2, 1), E = N.makeData(k, 100, 0.2, 1); assert.strictEqual(D.X.length, 100); assert.deepStrictEqual(D, E); assert.ok(D.X.every(p => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1), k); const ones = D.y.reduce((s, v) => s + v, 0); assert.ok(ones > 25 && ones < 75, k + " balance " + ones); } });
t("save and load a network", () => { const a = new N.Net([2, 3, 1], { seed: 4 }), b = N.Net.fromJSON(JSON.parse(JSON.stringify(a.toJSON()))); assert.deepStrictEqual(Array.from(a.forward([0.1, 0.2])), Array.from(b.forward([0.1, 0.2]))); assert.strictEqual(a.paramCount(), 2 * 3 + 3 + 3 + 1); });
t("adam and momentum reduce the loss", () => { const D = N.makeData("gauss", 120, 0.1, 2); for (const optim of ["adam", "sgd"]) { const net = new N.Net([2, 4, 1], { seed: 1 }), r = N.rng(1), l0 = net.loss(D.X, D.y); for (let e = 0; e < 60; e++) net.train(D.X, D.y, { lr: optim === "adam" ? 0.02 : 0.2, optim, momentum: 0.5, rand: r }); assert.ok(net.loss(D.X, D.y) < l0 * 0.5, optim); } });
console.log(n + " neural network checks passed");
