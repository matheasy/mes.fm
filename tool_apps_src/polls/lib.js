/* MES Polls -- pure helpers for mes.fm/polls (global MESPoll; node: require). The server (mes.fm/api/poll.js) does its own checks. */
(function (root) {
	"use strict";
	var P = {};
	P.MAX_OPTIONS = 20; P.MAX_Q = 200; P.MAX_D = 600; P.MAX_O = 100;

	/** whole-number (or `dec` decimals) percentages that add up to exactly 100 (largest remainder); all zeros when nobody voted */
	P.percents = function (n, dec) {
		var k = Math.pow(10, dec || 0), tot = 0, i;
		for (i = 0; i < n.length; i++) tot += n[i];
		if (!tot) return n.map(function () { return 0; });
		var raw = n.map(function (x) { return x * 100 * k / tot; }), fl = raw.map(Math.floor), left = 100 * k - fl.reduce(function (a, b) { return a + b; }, 0);
		var order = raw.map(function (x, j) { return [x - fl[j], j]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
		for (i = 0; i < left; i++) fl[order[i][1]]++;
		return fl.map(function (x) { return Math.round(x) / k; });
	};
	/** indexes of the options with the most votes (none when nobody voted) */
	P.leaders = function (n) {
		var mx = Math.max.apply(null, n.concat([0]));
		if (!mx) return [];
		var out = []; n.forEach(function (x, i) { if (x === mx) out.push(i); }); return out;
	};
	function pl(x, w) { return x + " " + w + (x === 1 ? "" : "s"); }
	/** "2 days 3 hours", "1 hour 5 min", "4 min 10 s", "12 s" */
	P.left = function (ms) {
		var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
		if (d) return pl(d, "day") + (h ? " " + pl(h, "hour") : "");
		if (h) return pl(h, "hour") + (m ? " " + m + " min" : "");
		if (m) return m + " min" + (sec && m < 10 ? " " + sec + " s" : "");
		return sec + " s";
	};
	P.UNITS = { min: 60000, hour: 3600000, day: 86400000, week: 604800000 };
	P.durMs = function (x, unit) { return Math.round(Number(x) * (P.UNITS[unit] || 0)); };
	/** a pasted list -> options (one per line, bullets / numbers dropped; a single line splits at commas) */
	P.optionsFromText = function (t) {
		var lines = String(t || "").split(/\r?\n/);
		if (lines.filter(function (l) { return l.trim(); }).length === 1 && /[,;]/.test(t)) lines = String(t).split(/[,;]/);
		return lines.map(function (l) { return l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim(); }).filter(Boolean).slice(0, P.MAX_OPTIONS);
	};
	/** a poll id out of a link or a bare id */
	P.idFromText = function (t) {
		var m = String(t || "").trim().match(/(?:\/v\/|[?&]p=)([a-z0-9]{8})(?![a-z0-9])/i) || String(t || "").trim().match(/^([a-z0-9]{8})$/i);
		return m ? m[1].toLowerCase() : null;
	};
	/** what is wrong with a draft, in plain words (empty = fine) */
	P.problems = function (d) {
		var out = [], q = String(d.q || "").trim(), seen = {}, o = (d.o || []).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
		if (!q) out.push("Type a question.");
		if (q.length > P.MAX_Q) out.push("The question is too long (" + P.MAX_Q + " characters at most).");
		if (String(d.d || "").length > P.MAX_D) out.push("The description is too long.");
		if (o.length < 2) out.push("Add at least two options.");
		if (o.length > P.MAX_OPTIONS) out.push(P.MAX_OPTIONS + " options at most.");
		o.forEach(function (x) { var k = x.toLowerCase(); if (seen[k]) out.push("Two options are the same: " + x); seen[k] = 1; if (x.length > P.MAX_O) out.push("An option is too long: " + x.slice(0, 30) + "…"); });
		if (d.cl && d.cl < Date.now() + 60000) out.push("The closing time has to be at least a minute from now.");
		if (d.cl && d.cl > Date.now() + 366 * 86400000) out.push("A poll can be open for a year at most.");
		return out;
	};
	/** donut slices for counts: [{i, a0, a1}] in radians from the top, clockwise */
	P.slices = function (n) {
		var tot = n.reduce(function (a, b) { return a + b; }, 0), a = 0, out = [];
		if (!tot) return out;
		n.forEach(function (x, i) { if (!x) return; var a1 = a + x / tot * Math.PI * 2; out.push({ i: i, a0: a, a1: a1 }); a = a1; });
		return out;
	};
	if (typeof module !== "undefined" && module.exports) module.exports = P; else root.MESPoll = P;
})(this);
