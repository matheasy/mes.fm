// node tool_apps_src/ping-tests.js -- MES Ping Test maths (tool_apps_src/ping/lib.js)
var P = require('./ping/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
function near(a, b, m, tol) { n++; if (a == null || Math.abs(a - b) > (tol || 1e-9)) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
function S(arr) { return arr.map(function (v, i) { return { t: i * 1000, ms: v }; }); }
var s = P.stats([{ t: 0, ms: 300, warm: true }].concat(S([10, 20, 30, null, 20])));
eq(s.sent, 5, 'warm-up not counted as sent'); eq(s.received, 4, 'received'); eq(s.lost, 1, 'lost'); near(s.lossPct, 20, 'loss %');
eq(s.min, 10, 'min skips warm-up'); eq(s.max, 30, 'max skips warm-up'); near(s.avg, 20, 'avg'); near(s.median, 20, 'median');
near(s.jitter, (10 + 10 + 10) / 3, 'jitter = mean abs diff of consecutive replies (lost one skipped)');
near(s.stdev, Math.sqrt(50), 'stdev');
var e = P.stats([]); eq(e.sent, 0, 'empty sent'); eq(e.avg, null, 'empty avg'); eq(e.lossPct, 0, 'empty loss 0'); eq(e.jitter, null, 'empty jitter');
var allLost = P.stats(S([null, null, null, null, null])); eq(allLost.lossPct, 100, 'all lost'); eq(allLost.avg, null, 'no avg when all lost');
near(P.quant([1, 2, 3, 4], 0.5), 2.5, 'quantile interpolates'); near(P.stats(S([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).p95, 9.55, 'p95');
var game = P.USES[0], call = P.USES[1];
eq(P.verdict(P.stats(S([10, 12, 11])), game).level, null, 'too few replies');
eq(P.verdict(P.stats(S([20, 22, 21, 20, 23, 22])), game).level, 3, 'steady 21 ms = good for games');
eq(P.verdict(P.stats(S([80, 82, 81, 80, 83, 82])), game).level, 2, '80 ms = okay for games');
eq(P.verdict(P.stats(S([80, 82, 81, 80, 83, 82])), call).level, 3, '80 ms = good for calls');
eq(P.verdict(P.stats(S([20, 120, 20, 120, 20, 120])), game).level, 1, 'jitter 100 ms = poor for games');
eq(P.verdict(P.stats(S([20, 20, null, 20, 20, 20, 20, null, 20, 20])), call).level, 1, '20% loss = poor for calls');
eq(P.verdict(P.stats(S([null, null, null, null, null])), call).word, 'Not working', 'no replies');
eq(/lost/.test(P.verdict(P.stats(S([20, 20, null, 20, 20, 20, 20, null, 20, 20])), call).why), true, 'verdict says why');
eq(P.parseTarget('example.com').url, 'https://example.com/favicon.ico', 'bare host gets https + favicon');
eq(P.parseTarget('https://Example.com/x.png?a=1').url, 'https://example.com/x.png?a=1', 'full url kept, host lowercased');
eq(P.parseTarget('http://1.2.3.4:8080').host, '1.2.3.4', 'ip with port');
eq(!!P.parseTarget('ftp://x.com').error, true, 'ftp refused');
eq(!!P.parseTarget('exa mple.com').error, true, 'spaces refused');
eq(!!P.parseTarget('example').error, true, 'needs a dot');
eq(!!P.parseTarget('').error, true, 'empty');
eq(!!P.parseTarget('user@evil.com').error, true, 'userinfo refused');
eq(P.bust('https://a.com/x', 5), 'https://a.com/x?mesping=5', 'bust adds ?'); eq(P.bust('https://a.com/x?q=1', 5), 'https://a.com/x?q=1&mesping=5', 'bust adds &');
eq(P.line('1.1.1.1', { ms: 14.2 }), 'Reply from 1.1.1.1: time=14 ms', 'ping line');
eq(P.line('1.1.1.1', { ms: 4.25 }), 'Reply from 1.1.1.1: time=4.3 ms', 'sub-10 ms keeps a decimal');
eq(P.line('x', { ms: null, err: 'timeout' }), 'Request timed out.', 'timeout line');
eq(/warm-up/.test(P.line('x', { ms: 90, warm: true })), true, 'warm-up flagged');
eq(P.summaryLines('a', s)[2].indexOf('Lost = 1 (20%') > 0, true, 'summary like ping');
var csv = P.toCSV([{ target: 'a,b', at: 0, ms: 12.34 }, { target: 'c', at: 0, ms: null, err: 'timeout' }]).split('\n');
eq(csv.length, 3, 'csv rows'); eq(csv[1], '1970-01-01T00:00:00.000Z,"a,b",12.3,reply', 'csv quoting'); eq(csv[2].slice(-7), 'timeout', 'csv timeout');
eq(P.niceMax(37), 50, 'nice 37'); eq(P.niceMax(120), 200, 'nice 120'); eq(P.niceMax(0), 50, 'nice 0');
eq(P.clampInterval(0.1), 0.5, 'interval min'); eq(P.clampInterval(99), 10, 'interval max'); eq(P.clampInterval(1.3), 1.5, 'interval step');
eq(P.fmtPct(0), '0%', 'pct 0'); eq(P.fmtPct(0.5), '0.50%', 'pct small'); eq(P.fmtMs(null), '–', 'ms null');
eq(P.since(S([1, 2, 3, 4]), 3000, 1.5).length, 2, 'since');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
