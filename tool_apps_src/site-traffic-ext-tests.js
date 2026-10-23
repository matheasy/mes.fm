var S = require('../mes.fm/site-traffic/extension/shared.js'), fs = require('fs'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
eq(S.hostFromUrl('https://www.Example.com/a/b?c=1#d'), 'www.example.com', 'host only'); eq(S.hostFromUrl('http://example.co.uk:8080/x'), 'example.co.uk', 'port dropped');
['chrome://extensions', 'brave://settings', 'about:blank', 'file:///etc/passwd', 'ftp://example.com', 'http://localhost:3000', 'http://127.0.0.1/', 'http://192.168.0.1/', 'http://[::1]/', 'https://nas.local/', 'https://intranet/', 'https://app.internal/', 'not a url', ''].forEach(function (u) { eq(S.hostFromUrl(u), null, 'rejected ' + u); });
eq(S.tier(500).label, 'Top 1,000', 'tier'); eq(S.tier(2436887).label, 'Top 5 million', 'tier mes'); eq(S.tier(9e9).label, 'Outside the list', 'tier outside');
eq(S.compact(2436887), '2.4M', 'compact M'); eq(S.compact(131), '131', 'compact small'); eq(S.compact(15000), '15k', 'compact k'); eq(S.compact(1500), '1.5k', 'compact 1.5k');
var b = S.badge({ apex: 'a.com', rank: { ranked: true, rank: 2436887 } }); eq(b.text, '2.4M', 'badge text'); eq(b.text.length <= 4, true, 'badge fits'); eq(/#2,436,887/.test(b.title), true, 'badge title');
eq(S.badge({ apex: 'a.com', rank: { ranked: false } }).text, '-', 'unranked dash'); eq(S.badge({ rank: { unavailable: true } }), null, 'unavailable no badge'); eq(S.badge(null), null, 'null');
eq(S.trend([{ rank: 200 }, { rank: 100 }]).dir, 'rising', 'rising'); eq(S.trend([{ rank: 100 }, { rank: 101 }]).dir, 'steady', 'steady'); eq(S.trend([{ rank: 1 }]), null, 'one point');
eq(S.spark([{ rank: 10 }, { rank: 20 }], 100, 50, 5), 'M5.0 5.0 L95.0 45.0', 'spark'); eq(S.spark([], 1, 1, 0), '', 'spark empty');
var m = JSON.parse(fs.readFileSync(__dirname + '/../mes.fm/site-traffic/extension/manifest.json', 'utf8'));
eq(m.manifest_version, 3, 'mv3'); eq(m.permissions.join(), 'storage,activeTab', 'no broad permissions by default'); eq(m.optional_permissions.join(), 'tabs', 'tabs is optional'); eq(m.host_permissions.join(), 'https://mes.fm/*', 'one host');
['popup.html', 'popup.js', 'background.js', 'shared.js', 'popup.css'].forEach(function (f) { eq(fs.existsSync(__dirname + '/../mes.fm/site-traffic/extension/' + f), true, 'file ' + f); });
eq(/visit/i.test(Object.keys(S).join()), false, 'no visit estimator');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
