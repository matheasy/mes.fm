/* MES Timer -- pure helpers (no DOM). Browser global `TM`; node: require('./tool_apps_src/timer/lib.js'); tests: node tool_apps_src/timer-tests.js */
(function (root) {
	"use strict";
	function pad(n, w) { n = String(Math.floor(n)); while (n.length < (w || 2)) n = "0" + n; return n; }
	// ms -> { h, m, s, t (tenths), ms }  (a countdown rounds UP so 0.2 s left still reads 00:00:01; a stopwatch rounds down)
	function parts(ms, up) {
		ms = Math.max(0, ms);
		var total = up ? Math.ceil(ms / 1000) : Math.floor(ms / 1000), h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
		return { h: h, m: m, s: s, t: Math.floor(ms % 1000 / 100), ms: Math.floor(ms % 1000) };
	}
	// 3725000 -> "1:02:05" ; 125000 -> "02:05" (hours shown only when needed unless alwaysH)
	function clock(ms, up, alwaysH) { var p = parts(ms, up); return (p.h || alwaysH ? p.h + ":" + pad(p.m) : pad(p.m)) + ":" + pad(p.s); }
	// stopwatch / lap time with centiseconds: "1:02:05.37" / "02:05.37"
	function precise(ms) { var p = parts(ms, false); return (p.h ? p.h + ":" + pad(p.m) : pad(p.m)) + ":" + pad(p.s) + "." + pad(Math.floor(p.ms / 10)); }
	// "25", "25m", "1h 30m", "90s", "1:30" (m:s), "1:30:00" (h:m:s), "1.5h" -> ms or null.  A bare number is minutes.
	function parseDuration(str) {
		var t = String(str == null ? "" : str).trim().toLowerCase().replace(/,/g, ".");
		if (!t) return null;
		var m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
		if (m) return m[3] != null ? ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 : ((+m[1]) * 60 + (+m[2])) * 1000;
		if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60000);
		var total = 0, any = false, rx = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g, left = t, mm;
		while ((mm = rx.exec(t))) { any = true; var v = parseFloat(mm[1]), u = mm[2].charAt(0); total += u === "h" ? v * 3600000 : u === "m" ? v * 60000 : v * 1000; left = left.replace(mm[0], ""); }
		return any && !/[a-z0-9]/.test(left.replace(/\s/g, "")) ? Math.round(total) : null;
	}
	function hmsToMs(h, m, s) { return (Math.max(0, +h || 0) * 3600 + Math.max(0, +m || 0) * 60 + Math.max(0, +s || 0)) * 1000; }
	// "in 3 h 20 min" style
	function human(ms) {
		var tot = Math.round(Math.max(0, ms) / 1000), h = Math.floor(tot / 3600), m = Math.floor(tot % 3600 / 60), s = tot % 60, o = [];
		if (h) o.push(h + " h"); if (m) o.push(m + " min"); if (!h && !m) o.push(s + " s"); else if (!h && s >= 30) o.push("");
		return o.join(" ").trim();
	}
	// stopwatch laps: totals [ms...] -> [{n, lap, total}] + fastest / slowest index (needs 3+ laps to mark)
	function laps(totals) {
		var out = totals.map(function (t, i) { return { n: i + 1, total: t, lap: t - (i ? totals[i - 1] : 0) }; }), fast = -1, slow = -1;
		if (out.length >= 3) out.forEach(function (l, i) { if (fast < 0 || l.lap < out[fast].lap) fast = i; if (slow < 0 || l.lap > out[slow].lap) slow = i; });
		return { rows: out, fast: fast, slow: slow };
	}
	// next time "HH:MM" occurs after `now` (a Date): -> timestamp ms
	function nextAlarm(hhmm, now) {
		var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); if (!m) return null;
		var d = new Date(now.getTime()); d.setHours(+m[1], +m[2], 0, 0);
		if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
		return d.getTime();
	}
	// days / hours / minutes / seconds until (or since) a moment: ms may be negative (-> past: true)
	function dhms(ms) {
		var past = ms < 0, t = Math.floor(Math.abs(ms) / 1000), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
		return { d: d, h: h, m: m, s: s, past: past };
	}
	// local "YYYY-MM-DD" + optional "HH:MM" -> timestamp (local time) or null
	function parseDateTime(date, time) {
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""); if (!m) return null;
		var t = /^(\d{1,2}):(\d{2})$/.exec(time || "") || [0, 0, 0], d = new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], 0, 0);
		return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d.getTime() : null;
	}
	// Pomodoro: which phase follows. round = the focus session just done / being done (1..rounds)
	function pomoNext(phase, round, rounds) {
		if (phase === "focus") return { phase: round >= rounds ? "long" : "short", round: round };
		if (phase === "short") return { phase: "focus", round: round + 1 };
		return { phase: "focus", round: 1 };
	}
	// Interval training: a list of segments { phase: "prep" | "work" | "rest", round, ms } (no rest after the last round) and helpers
	function itvPlan(c) {
		var out = [], prep = Math.max(0, +c.prep || 0) * 1000, work = Math.max(1, +c.work || 1) * 1000, rest = Math.max(0, +c.rest || 0) * 1000, rounds = Math.max(1, Math.min(99, Math.floor(+c.rounds || 1)));
		if (prep) out.push({ phase: "prep", round: 0, ms: prep });
		for (var r = 1; r <= rounds; r++) { out.push({ phase: "work", round: r, ms: work }); if (rest && r < rounds) out.push({ phase: "rest", round: r, ms: rest }); }
		return out;
	}
	function itvTotal(plan) { return plan.reduce(function (a, s) { return a + s.ms; }, 0); }
	// where `elapsed` ms into the plan we are: { idx, seg, into, left, done }
	function itvAt(plan, elapsed) {
		var acc = 0;
		for (var i = 0; i < plan.length; i++) { if (elapsed < acc + plan[i].ms) return { idx: i, seg: plan[i], into: elapsed - acc, left: acc + plan[i].ms - elapsed, done: false }; acc += plan[i].ms; }
		return { idx: plan.length, seg: null, into: 0, left: 0, done: true };
	}
	var TM = { dhms: dhms, parseDateTime: parseDateTime, pomoNext: pomoNext, itvPlan: itvPlan, itvTotal: itvTotal, itvAt: itvAt, pad: pad, parts: parts, clock: clock, precise: precise, parseDuration: parseDuration, hmsToMs: hmsToMs, human: human, laps: laps, nextAlarm: nextAlarm };
	if (typeof module !== "undefined" && module.exports) module.exports = TM; else root.TM = TM;
})(typeof window !== "undefined" ? window : globalThis);
