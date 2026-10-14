/* MES Baby Growth UI. Maths = MESGrowth (WHO LMS) in lib.js + data.js (prepended). */
(function () {
	'use strict';
	var G = MESGrowth, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-growth:v1';
	var S = { sex: 'f', agemode: 'birth', birth: '', units: 'metric', early: 0, log: [] };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
	var toastT; function toast(m) { var t = $('gr-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function day(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; }
	function iso(d) { return new Date(d * 86400000).toISOString().slice(0, 10); }
	var today = (function () { var n = new Date(); return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); })();
	var kind = 'wfa', cur = null;
	function num(id) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : null; }
	function btnGroup(id, attr, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; Array.prototype.forEach.call($(id).querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); fn(b.getAttribute(attr)); }); }
	btnGroup('gr-sex', 'data-s', function (v) { S.sex = v; update(); });
	btnGroup('gr-agemode', 'data-m', function (v) { S.agemode = v; $('gr-birthrow').hidden = v !== 'birth'; $('gr-agerow').hidden = v !== 'age'; update(); });
	btnGroup('gr-units', 'data-u', function (v) { S.units = v; $('gr-w-kg').hidden = v !== 'metric'; $('gr-w-lb').hidden = v !== 'us'; $('gr-lu').textContent = $('gr-hu').textContent = v === 'us' ? 'in' : 'cm'; update(); });
	btnGroup('gr-kind', 'data-k', function (v) { kind = v; drawChart(); });
	['gr-birth', 'gr-on', 'gr-agev', 'gr-ageu', 'gr-early', 'gr-w', 'gr-lb', 'gr-oz', 'gr-l', 'gr-h'].forEach(function (id) { $(id).addEventListener('input', update); $(id).addEventListener('change', update); });

	function ageNow() {
		var early = Math.max(0, parseFloat($('gr-early').value) || 0), d;
		if (S.agemode === 'birth') { var b = day($('gr-birth').value), on = day($('gr-on').value); if (b == null || on == null) return { err: 'Enter the date of birth and the date of the measurement.' }; if (on < b) return { err: 'The measurement date is before the birth date.' }; d = on - b; S.birth = $('gr-birth').value; }
		else { var v = parseFloat($('gr-agev').value); if (!isFinite(v) || v < 0) return { err: 'Enter the baby\'s age.' }; var u = $('gr-ageu').value; d = Math.round(u === 'd' ? v : u === 'w' ? v * 7 : v * 30.4375); }
		var corr = G.ageDays(0, d, early); if (corr < 0) corr = 0;
		if (corr > G.MAXDAY) return { err: 'The WHO standards used here cover ages 0 to 5 years.' };
		return { days: d, corr: corr, early: early };
	}
	function measures() {
		var us = S.units === 'us', w = us ? ((num('gr-lb') || 0) + (num('gr-oz') || 0) / 16 > 0 ? G.lbOzToKg(num('gr-lb') || 0, num('gr-oz') || 0) : null) : num('gr-w'), l = num('gr-l'), h = num('gr-h');
		return { wfa: w, lhfa: l != null ? (us ? l * 2.54 : l) : null, hcfa: h != null ? (us ? h * 2.54 : h) : null };
	}
	function update() {
		S.sex = S.sex; S.early = parseFloat($('gr-early').value) || 0; save();
		var a = ageNow(), m = measures(), msg = $('gr-msg'), any = m.wfa || m.lhfa || m.hcfa;
		if (a.err) { msg.textContent = any ? a.err : ''; $('gr-out').hidden = true; cur = null; renderLog(); return; }
		if (!any) { msg.textContent = ''; $('gr-out').hidden = true; cur = null; renderLog(); return; }
		var sane = { wfa: [0.4, 40], lhfa: [20, 140], hcfa: [20, 65] }, bad = [];
		['wfa', 'lhfa', 'hcfa'].forEach(function (k) { if (m[k] != null && (m[k] < sane[k][0] || m[k] > sane[k][1])) bad.push(G.KINDS[k].label.toLowerCase()); });
		msg.textContent = bad.length ? 'Check the ' + bad.join(' and ') + ': that looks unlikely for a baby. Is the unit right?' : (a.early > 0 && a.days < 730 ? 'Using corrected age: ' + G.ageText(a.corr) + ' (actual age ' + G.ageText(a.days) + ').' : '');
		if (bad.length) { $('gr-out').hidden = true; cur = null; return; }
		cur = { a: a, m: m, z: {}, p: {} };
		var cards = '';
		['wfa', 'lhfa', 'hcfa'].forEach(function (k) {
			if (m[k] == null) return; var z = G.zscore(k, S.sex, a.corr, m[k]), p = G.cdf(z) * 100; cur.z[k] = z; cur.p[k] = p;
			var lo = G.valueAt(k, S.sex, a.corr, -1.8808), hi = G.valueAt(k, S.sex, a.corr, 1.8808), val = k === 'wfa' ? (S.units === 'us' ? G.kgToLbOz(m[k]).join(' lb ') + ' oz' : m[k] + ' kg') : (S.units === 'us' ? Math.round(m[k] / 2.54 * 10) / 10 + ' in' : m[k] + ' cm');
			function fmt(x) { return k === 'wfa' ? (S.units === 'us' ? G.kgToLbOz(x)[0] + ' lb ' + Math.round(G.kgToLbOz(x)[1]) + ' oz' : x.toFixed(2) + ' kg') : (S.units === 'us' ? (x / 2.54).toFixed(1) + ' in' : x.toFixed(1) + ' cm'); }
			cards += '<div class="tu-stat' + (k === 'wfa' ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + G.KINDS[k].label + ' · ' + esc(val) + '</div><div class="tu-stat__value gr-pct">' + G.ordinal(Math.round(p * 10) / 10 < 1 || p > 99 ? Math.round(p * 10) / 10 : Math.round(p)) + ' percentile</div><div class="tu-stat__sub">' + esc(G.describe(z)) + '<br>Usual range at this age (3rd to 97th): ' + fmt(lo) + ' to ' + fmt(hi) + '<br>z-score ' + (z >= 0 ? '+' : '') + z.toFixed(2) + '</div></div>';
		});
		$('gr-cards').innerHTML = cards; $('gr-out').hidden = false;
		if (!m[kind]) { var f = ['wfa', 'lhfa', 'hcfa'].filter(function (k) { return m[k] != null; })[0]; kind = f; Array.prototype.forEach.call($('gr-kind').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === kind)); }); }
		drawChart(); renderLog();
	}
	function drawChart() {
		if (!cur) return; var a = cur.a, maxX = a.corr > 700 || S.log.some(function (e) { return e.d > 730; }) ? G.MAXDAY : 730, W = 640, H = 340, L = 46, R = 44, T = 14, B = 34, zs = [-1.8808, -1.0364, 0, 1.0364, 1.8808], lab = ['3rd', '15th', '50th', '85th', '97th'];
		var lo = G.valueAt(kind, S.sex, maxX, -1.8808), lo0 = G.valueAt(kind, S.sex, 0, -1.8808), hi = G.valueAt(kind, S.sex, maxX, 1.8808), ymin = Math.min(lo0, lo) * 0.96, ymax = hi * 1.04, pts = [];
		var vals = [cur.m[kind]].concat(S.log.filter(function (e) { return e.s === S.sex && e[kind] != null; }).map(function (e) { return e[kind]; })).filter(function (v) { return v != null; }); vals.forEach(function (v) { ymin = Math.min(ymin, v * 0.97); ymax = Math.max(ymax, v * 1.03); });
		function X(d) { return L + (d / maxX) * (W - L - R); } function Y(v) { return T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B); }
		var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="WHO growth chart with your baby\'s measurement">', i, d;
		var xt = maxX > 730 ? [0, 12, 24, 36, 48, 60] : [0, 3, 6, 9, 12, 15, 18, 21, 24];
		xt.forEach(function (mo) { var x = X(mo * 30.4375); svg += '<line class="ax" x1="' + x + '" y1="' + T + '" x2="' + x + '" y2="' + (H - B) + '"/><text class="t" x="' + x + '" y="' + (H - B + 16) + '" text-anchor="middle">' + mo + '</text>'; });
		svg += '<text class="t" x="' + (W / 2) + '" y="' + (H - 2) + '" text-anchor="middle">age in months</text>';
		var step = (ymax - ymin) > 30 ? 10 : (ymax - ymin) > 12 ? 5 : (ymax - ymin) > 6 ? 2 : 1; for (var yv = Math.ceil(ymin / step) * step; yv <= ymax; yv += step) svg += '<line class="ax" x1="' + L + '" y1="' + Y(yv) + '" x2="' + (W - R) + '" y2="' + Y(yv) + '"/><text class="t" x="' + (L - 6) + '" y="' + (Y(yv) + 4) + '" text-anchor="end">' + yv + '</text>';
		zs.forEach(function (z, k) { var p = ''; for (d = 0; d <= maxX; d += 7) p += (d ? 'L' : 'M') + X(d).toFixed(1) + ' ' + Y(G.valueAt(kind, S.sex, d, z)).toFixed(1); svg += '<path class="l' + (z === 0 ? ' l50' : '') + '" d="' + p + '"/><text class="t" x="' + (W - R + 4) + '" y="' + (Y(G.valueAt(kind, S.sex, maxX, z)) + 4) + '">' + lab[k] + '</text>'; });
		var lg = S.log.filter(function (e) { return e.s === S.sex && e[kind] != null; }).sort(function (x, y) { return x.d - y.d; });
		if (lg.length > 1) svg += '<path class="tr" d="' + lg.map(function (e, j) { return (j ? 'L' : 'M') + X(e.d).toFixed(1) + ' ' + Y(e[kind]).toFixed(1); }).join('') + '"/>';
		lg.forEach(function (e) { svg += '<circle class="lp" cx="' + X(e.d) + '" cy="' + Y(e[kind]) + '" r="5"><title>' + esc(e.on) + ': ' + e[kind] + '</title></circle>'; });
		svg += '<circle class="pt" cx="' + X(a.corr) + '" cy="' + Y(cur.m[kind]) + '" r="7"><title>This measurement</title></circle></svg>';
		$('gr-chart').innerHTML = svg;
	}
	/* growth log */
	$('gr-save').onclick = function () {
		if (!cur) return; var on = S.agemode === 'birth' ? $('gr-on').value : iso(today); if (S.agemode === 'age') on = iso(today) + ' (age ' + G.ageText(cur.a.days) + ')';
		var e = { s: S.sex, d: cur.a.corr, on: on, wfa: cur.m.wfa, lhfa: cur.m.lhfa, hcfa: cur.m.hcfa }; S.log.push(e); S.log.sort(function (x, y) { return x.d - y.d; }); save(); renderLog(); drawChart(); toast('Saved to the growth log');
	};
	$('gr-copy').onclick = function () { if (!cur) return; var t = ['wfa', 'lhfa', 'hcfa'].filter(function (k) { return cur.p[k] != null; }).map(function (k) { return G.KINDS[k].label + ': ' + G.ordinal(Math.round(cur.p[k])) + ' percentile (z ' + cur.z[k].toFixed(2) + ')'; }).join('\n') + '\nAge: ' + G.ageText(cur.a.days) + '\n(WHO standards, mes.fm/baby-growth-percentile-calculator)'; if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }); };
	function renderLog() {
		var lg = S.log.filter(function (e) { return e.s === S.sex; }); $('gr-logbox').hidden = !S.log.length; if (!S.log.length) return;
		var t = '<tr><th>Date</th><th>Age</th><th>Weight</th><th>Length</th><th>Head</th><th></th></tr>';
		S.log.forEach(function (e, i) { function pc(k) { return e[k] != null ? e[k] + ' (' + G.ordinal(Math.round(G.percentile(k, e.s, e.d, e[k]))) + ')' : '—'; } t += '<tr><td>' + esc(e.on) + '</td><td>' + G.ageText(e.d) + '</td><td>' + pc('wfa') + '</td><td>' + pc('lhfa') + '</td><td>' + pc('hcfa') + '</td><td><button type="button" class="tu-chip" data-del="' + i + '">Remove</button></td></tr>'; });
		$('gr-log').innerHTML = t;
		var w = lg.filter(function (e) { return e.wfa != null; }), tr = '';
		if (w.length > 1) { var zs = w.map(function (e) { return G.zscore('wfa', e.s, e.d, e.wfa); }), c = G.crossing(zs); tr = 'Weight went from the <b>' + G.ordinal(Math.round(G.cdf(zs[0]) * 100)) + '</b> to the <b>' + G.ordinal(Math.round(G.cdf(zs[zs.length - 1]) * 100)) + '</b> percentile over ' + (w.length) + ' visits. ' + (Math.abs(c) >= 2 ? '<b class="warn">That is a move of ' + Math.abs(c) + ' main lines ' + (c < 0 ? 'down' : 'up') + ': worth mentioning to your doctor.</b>' : 'That is a steady curve.'); }
		$('gr-trend').innerHTML = tr;
	}
	$('gr-log').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; S.log.splice(+b.getAttribute('data-del'), 1); save(); renderLog(); if (cur) drawChart(); });
	$('gr-logclear').onclick = function () { if (!confirm('Remove all saved visits from this browser?')) return; S.log = []; save(); renderLog(); if (cur) drawChart(); };
	$('gr-logcopy').onclick = function () { var t = S.log.map(function (e) { return [e.on, G.ageText(e.d), e.wfa != null ? e.wfa + ' kg' : '', e.lhfa != null ? e.lhfa + ' cm' : '', e.hcfa != null ? e.hcfa + ' cm' : ''].join('\t'); }).join('\n'); if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Log copied'); }); };

	/* start */
	Array.prototype.forEach.call($('gr-sex').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-s') === S.sex)); });
	Array.prototype.forEach.call($('gr-agemode').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === S.agemode)); }); $('gr-birthrow').hidden = S.agemode !== 'birth'; $('gr-agerow').hidden = S.agemode !== 'age';
	Array.prototype.forEach.call($('gr-units').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-u') === S.units)); }); $('gr-w-kg').hidden = S.units !== 'metric'; $('gr-w-lb').hidden = S.units !== 'us'; $('gr-lu').textContent = $('gr-hu').textContent = S.units === 'us' ? 'in' : 'cm';
	$('gr-on').value = iso(today); if (S.birth) $('gr-birth').value = S.birth; $('gr-early').value = S.early || 0;
	var q = new URLSearchParams(location.search); if (q.get('sex')) { S.sex = q.get('sex') === 'm' ? 'm' : 'f'; } if (q.get('age')) { S.agemode = 'age'; $('gr-agev').value = q.get('age'); }
	update();
})();
