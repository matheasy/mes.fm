/* MES Ping Test maths (pure; runs in the browser and in node: require('./tool_apps_src/ping/lib.js')).
   A sample is { t: ms since the test started, ms: round-trip time in ms, or null when the request was lost (timed out / failed),
   warm: true for a request that also had to open the connection (DNS + TCP + TLS); warm-up samples are kept out of the stats. */
var MESPing = (function () {
	'use strict';
	function num(x) { return typeof x === 'number' && isFinite(x); }
	/* stats over a list of samples (warm-up ones skipped). jitter = mean absolute difference between back-to-back replies
	   (the RFC 3550 idea without the smoothing); lost counts null replies. */
	function stats(list) {
		var s = (list || []).filter(function (x) { return x && !x.warm; }), ok = [], lost = 0, jsum = 0, jn = 0, prev = null;
		s.forEach(function (x) {
			if (num(x.ms)) { ok.push(x.ms); if (prev != null) { jsum += Math.abs(x.ms - prev); jn++; } prev = x.ms; }
			else lost++;
		});
		var sent = ok.length + lost, out = { sent: sent, received: ok.length, lost: lost, lossPct: sent ? lost / sent * 100 : 0,
			min: null, max: null, avg: null, median: null, p95: null, jitter: jn ? jsum / jn : null, stdev: null };
		if (!ok.length) return out;
		var so = ok.slice().sort(function (a, b) { return a - b; }), sum = 0;
		ok.forEach(function (v) { sum += v; });
		out.min = so[0]; out.max = so[so.length - 1]; out.avg = sum / ok.length;
		out.median = quant(so, 0.5); out.p95 = quant(so, 0.95);
		var v2 = 0; ok.forEach(function (v) { v2 += (v - out.avg) * (v - out.avg); }); out.stdev = Math.sqrt(v2 / ok.length);
		return out;
	}
	function quant(sorted, q) { if (!sorted.length) return null; var i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
	/* the last n samples, or the samples within the last `sec` seconds of `now` */
	function lastN(list, n) { return list.slice(Math.max(0, list.length - n)); }
	function since(list, now, sec) { return list.filter(function (x) { return x.t >= now - sec * 1000; }); }

	/* plain-word verdicts. Thresholds are the usual rules of thumb (gaming: under 50 ms feels instant; calls: ITU-T G.114 says
	   one-way delay under 150 ms is fine, so a round trip under ~150-250 ms; streaming buffers, so only loss and very high delay hurt).
	   level: 3 good, 2 okay, 1 poor; null = not enough replies yet. */
	var USES = [
		{ k: 'game', name: 'Online gaming', good: [50, 10, 0.5], ok: [100, 25, 2] },
		{ k: 'call', name: 'Video and voice calls', good: [150, 30, 1], ok: [250, 50, 3] },
		{ k: 'stream', name: 'Streaming video', good: [300, 100, 2], ok: [600, 200, 5] },
		{ k: 'web', name: 'Browsing', good: [200, 100, 2], ok: [500, 300, 5] }
	];
	function verdict(st, use) {
		if (!st || st.sent < 5 || st.avg == null && st.lost < 5) return { level: null, word: 'Waiting', why: 'Needs a few more replies.' };
		if (st.received === 0) return { level: 1, word: 'Not working', why: 'No replies at all.' };
		var j = st.jitter || 0, a = st.avg, l = st.lossPct, g = use.good, o = use.ok;
		if (a <= g[0] && j <= g[1] && l <= g[2]) return { level: 3, word: 'Good', why: 'Fast, steady replies.' };
		var why = [];
		if (a > o[0]) why.push('slow replies (' + Math.round(a) + ' ms)'); else if (a > g[0]) why.push('replies a bit slow');
		if (j > o[1]) why.push('very uneven timing (jitter ' + Math.round(j) + ' ms)'); else if (j > g[1]) why.push('some jitter');
		if (l > o[2]) why.push(fmtPct(l) + ' lost'); else if (l > g[2]) why.push('a little loss');
		var poor = a > o[0] || j > o[1] || l > o[2];
		return { level: poor ? 1 : 2, word: poor ? 'Poor' : 'Okay', why: cap(why.join(', ')) + '.' };
	}
	function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

	function fmtMs(v) { if (!num(v)) return '–'; return v < 10 ? v.toFixed(1) : String(Math.round(v)); }
	function fmtPct(v) { if (!num(v)) return '–'; return (v === 0 ? '0' : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v))) + '%'; }

	/* what the user typed -> { url (the address that is fetched, cache-busted later), host (shown), error }.
	   A bare host gets https:// and /favicon.ico (small, usually there; a 404 still answers, which is all we time). */
	function parseTarget(text) {
		var t = String(text || '').trim();
		if (!t) return { error: 'Type a website or address, like example.com' };
		if (/\s/.test(t)) return { error: 'No spaces, please.' };
		if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t;
		var m = /^(https?):\/\/([^\/?#@]+)(\/[^#]*)?$/i.exec(t);
		if (!m) return { error: 'Only http:// or https:// addresses.' };
		var host = m[2].toLowerCase(), path = m[3] && m[3] !== '/' ? m[3] : '/favicon.ico';
		var hn = host.replace(/:\d+$/, '');
		if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/.test(hn) || hn.indexOf('..') >= 0) return { error: 'That does not look like a web address.' };
		if (hn.indexOf('.') < 0 && hn.charAt(0) !== '[' && hn !== 'localhost') return { error: 'Add the ending, like .com' };
		return { url: m[1].toLowerCase() + '://' + host + path, host: hn };
	}
	function bust(url, n) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'mesping=' + n; }

	/* one line of ping-style output */
	function line(name, s) {
		if (num(s.ms)) return 'Reply from ' + name + ': time=' + fmtMs(s.ms) + ' ms' + (s.warm ? ' (connection warm-up, not counted)' : '');
		return s.err === 'fail' ? 'Reply from ' + name + ': unreachable.' : 'Request timed out.';
	}
	function summaryLines(name, st) {
		return ['', 'Ping statistics for ' + name + ':',
			'    Requests: Sent = ' + st.sent + ', Received = ' + st.received + ', Lost = ' + st.lost + ' (' + fmtPct(st.lossPct) + ' loss),',
			'Approximate round trip times in milli-seconds:',
			'    Minimum = ' + fmtMs(st.min) + 'ms, Maximum = ' + fmtMs(st.max) + 'ms, Average = ' + fmtMs(st.avg) + 'ms, Jitter = ' + fmtMs(st.jitter) + 'ms'];
	}
	function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
	/* rows: [{ target, at (epoch ms), ms, warm, err }] */
	function toCSV(rows) {
		var out = ['time,target,ms,result'];
		rows.forEach(function (r) { out.push([new Date(r.at).toISOString(), csvCell(r.target), num(r.ms) ? r.ms.toFixed(1) : '', num(r.ms) ? (r.warm ? 'warm-up' : 'reply') : (r.err === 'fail' ? 'unreachable' : 'timeout')].join(',')); });
		return out.join('\n');
	}
	/* a "nice" upper bound for the chart's y axis */
	function niceMax(v) { if (!num(v) || v <= 0) return 50; var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
	function clampInterval(v) { v = Number(v); if (!num(v)) return 1; return Math.min(10, Math.max(0.5, Math.round(v * 2) / 2)); }
	return { stats: stats, quant: quant, lastN: lastN, since: since, USES: USES, verdict: verdict, fmtMs: fmtMs, fmtPct: fmtPct,
		parseTarget: parseTarget, bust: bust, line: line, summaryLines: summaryLines, toCSV: toCSV, niceMax: niceMax, clampInterval: clampInterval };
})();
if (typeof module !== 'undefined') module.exports = MESPing;
