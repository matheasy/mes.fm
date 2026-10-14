/* MES Baby Feeding Log UI. Maths = MESFeed in lib.js (prepended). State in localStorage mes-feedlog:v1. */
(function () {
	'use strict';
	var F = MESFeed, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-feedlog:v1';
	var S = { list: [], units: 'ml', wake: false, run: null, undo: null };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ list: S.list, units: S.units, wake: S.wake, run: S.run })); } catch (e) {} }
	var NAMES = { bl: 'Left breast', br: 'Right breast', bt: 'Bottle', pm: 'Pumping', wet: 'Wet diaper', dirty: 'Dirty diaper' };
	var toastT; function toast(m) { var t = $('fl-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function clock(ms) { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
	function amt(ml) { return S.units === 'oz' ? (Math.round(F.mlToOz(ml) * 10) / 10) + ' oz' : Math.round(ml) + ' ml'; }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
	function running() { return S.run && S.list.filter(function (x) { return x.s === S.run.s && x.t === S.run.t && x.e == null; })[0]; }
	var wl = null; function wake() { if (S.wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wl = l; }, function () {}); }
	document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.wake) wake(); });
	$('fl-wake').checked = S.wake; $('fl-wake').onchange = function () { S.wake = this.checked; save(); if (S.wake) { if (navigator.wakeLock) wake(); else toast('Your browser cannot keep the screen on'); } else if (wl) { wl.release(); wl = null; } }; if (S.wake) wake();

	function side(t) {
		var r = running(), now = Date.now();
		if (r) { r.e = now; var was = r.t; S.run = null; if (now - r.s < 5000) { S.list = S.list.filter(function (x) { return x !== r; }); toast('Under 5 seconds: not saved'); } if (was === t) { S.undo = null; save(); return render(); } }
		S.list.push({ t: t, s: now, e: null }); S.run = { s: now, t: t }; S.undo = null; save(); render();
	}
	$('fl-l').onclick = function () { side('bl'); }; $('fl-r').onclick = function () { side('br'); };
	function quick(entry) { entry.s = entry.s || Date.now(); S.list.push(entry); S.undo = null; save(); render(); }
	$('fl-bt').onclick = function () { var v = parseFloat($('fl-ml').value); if (!(v > 0)) return toast('Enter the amount first'); quick({ t: 'bt', s: Date.now(), e: Date.now(), ml: S.units === 'oz' ? F.ozToMl(v) : v }); $('fl-ml').value = ''; toast('Bottle saved'); };
	$('fl-pm').onclick = function () { var v = parseFloat($('fl-pml').value); quick({ t: 'pm', s: Date.now(), e: Date.now(), ml: v > 0 ? (S.units === 'oz' ? F.ozToMl(v) : v) : null }); $('fl-pml').value = ''; toast('Pumping saved'); };
	document.querySelector('.fl-dia').addEventListener('click', function (e) { var b = e.target.closest('[data-d]'); if (!b) return; var d = b.getAttribute('data-d'), now = Date.now(); if (d === 'both') { S.list.push({ t: 'wet', s: now, e: now }, { t: 'dirty', s: now, e: now }); S.undo = null; save(); render(); } else quick({ t: d, s: now, e: now }); toast('Diaper logged'); });
	$('fl-amts').addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (b) $('fl-ml').value = b.getAttribute('data-a'); });
	function chips() { var a = S.units === 'oz' ? [1, 2, 3, 4, 5, 6] : [30, 60, 90, 120, 150, 180]; $('fl-amts').innerHTML = a.map(function (x) { return '<button type="button" class="tu-chip" data-a="' + x + '">' + x + '</button>'; }).join(''); $('fl-mlu').textContent = S.units; }
	$('fl-units').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.units = b.getAttribute('data-u'); Array.prototype.forEach.call($('fl-units').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); save(); chips(); render(); });
	Array.prototype.forEach.call($('fl-units').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-u') === S.units)); });
	$('fl-add').onclick = function () {
		var kinds = { l: 'bl', r: 'br', b: 'bt', w: 'wet', d: 'dirty', p: 'pm' }, k = prompt('What was it? l = left breast, r = right breast, b = bottle, w = wet diaper, d = dirty diaper, p = pumping', 'l'); if (!k || !kinds[k.trim().toLowerCase()]) return; var t = kinds[k.trim().toLowerCase()];
		var def = new Date(Date.now() - 30 * 60000), hh = ('0' + def.getHours()).slice(-2) + ':' + ('0' + def.getMinutes()).slice(-2), tm = prompt('What time did it START today? (24-hour, like 14:35)', hh); var m = tm && /^(\d{1,2}):(\d{2})$/.exec(tm.trim()); if (!m) return;
		var d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1); var e = { t: t, s: d.getTime(), e: d.getTime() };
		if (t === 'bl' || t === 'br') { var mins = parseFloat(prompt('How many minutes?', '10')); if (!(mins > 0)) return; e.e = e.s + mins * 60000; } else if (t === 'bt' || t === 'pm') { var a = parseFloat(prompt('Amount in ' + S.units + '?', S.units === 'oz' ? '3' : '90')); if (t === 'bt' && !(a > 0)) return; e.ml = a > 0 ? (S.units === 'oz' ? F.ozToMl(a) : a) : null; }
		S.list.push(e); S.undo = null; save(); render(); toast('Added');
	};
	$('fl-undo').onclick = function () { if (S.undo) { S.list = S.undo; S.undo = null; save(); render(); } };
	$('fl-body').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var s = +b.getAttribute('data-del'), t = b.getAttribute('data-t'); S.undo = S.list.slice(); S.list = S.list.filter(function (x) { return !(x.s === s && x.t === t); }); if (S.run && S.run.s === s) S.run = null; save(); render(); });
	$('fl-clear').onclick = function () { if (!S.list.length) return; if (!confirm('Remove all ' + S.list.length + ' entries from this browser?')) return; S.undo = S.list.slice(); S.list = []; S.run = null; save(); render(); };
	function line(x) { return clock(x.s) + ' ' + NAMES[x.t] + (x.t === 'bl' || x.t === 'br' ? ' ' + F.fmtDur(F.dur(x, x.e || Date.now())) : '') + (x.ml ? ' ' + amt(x.ml) : ''); }
	$('fl-copy').onclick = function () { var from = Date.now() - 86400000, t = F.sorted(S.list).filter(function (x) { return x.s >= from; }).map(line).join('\n'); if (!t) return toast('Nothing in the last 24 hours'); if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t + '\n(mes.fm/baby-feeding-log)').then(function () { toast('Copied'); }); };
	$('fl-csv').onclick = function () { if (!S.list.length) return toast('Nothing to download'); var a = document.createElement('a'), u = URL.createObjectURL(new Blob([F.toCSV(S.list)], { type: 'text/csv' })); a.href = u; a.download = 'feeding-log.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500); };

	function render() {
		var now = Date.now(), r = running(), l = F.sorted(S.list), ns = F.nextSide(l), lf = F.lastFeed(l);
		[['fl-l', 'fl-lt', 'fl-ls', 'bl', 'Left'], ['fl-r', 'fl-rt', 'fl-rs', 'br', 'Right']].forEach(function (c) { var on = r && r.t === c[3]; $(c[0]).classList.toggle('on', !!on); $(c[0]).classList.toggle('sug', !r && ns === c[3]); $(c[1]).textContent = on ? F.fmtDur(F.dur(r, now)) : c[4]; $(c[2]).textContent = on ? 'tap to stop' : (!r && ns === c[3] ? 'next side' : 'tap to start'); });
		$('fl-next').textContent = r ? 'Feeding on the ' + (r.t === 'bl' ? 'left' : 'right') + '…' : (ns ? 'Last breast: ' + (ns === 'br' ? 'left' : 'right') + '. Offer the ' + (ns === 'bl' ? 'left' : 'right') + ' next.' : 'Tap a side when the baby starts feeding.');
		var lfend = lf ? lf.start : null; $('fl-since').textContent = lf ? 'Last feed started ' + F.fmtAgo((now - lf.start) / 60000) + ' (' + clock(lf.start) + ')' : '';
		var a = F.dayStart(now), s = F.summary(l, a, a + 86400000, now), s24 = F.summary(l, now - 86400000, now + 1, now);
		function tile(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
		$('fl-stats').innerHTML = tile('Feeds today', s.feeds, s24.feeds + ' in the last 24 hours', true) + tile('Breastfeeding', F.fmtDur(s.breastSec), 'minutes:seconds today') + tile('Bottles', s.bottleMl ? amt(s.bottleMl) : '0', s.bottles + ' bottle' + (s.bottles === 1 ? '' : 's')) + tile('Diapers', s.wet + ' wet · ' + s.dirty + ' dirty', 'since midnight') + (s24.avgGapMin ? tile('Average gap', Math.floor(s24.avgGapMin / 60) + ' h ' + Math.round(s24.avgGapMin % 60) + ' min', 'start to start, last 24 h') : '') + (s.pumpMl ? tile('Pumped', amt(s.pumpMl), 'today') : '');
		var rows = '', lastDay = null, i; for (i = l.length - 1; i >= 0 && i > l.length - 200; i--) { var x = l[i], dk = new Date(x.s).toDateString(); if (dk !== lastDay) { rows += '<tr class="fl-day"><td colspan="4">' + new Date(x.s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '</td></tr>'; lastDay = dk; } rows += '<tr><td>' + clock(x.s) + '</td><td>' + NAMES[x.t] + '</td><td>' + ((x.t === 'bl' || x.t === 'br') ? (x.e != null ? F.fmtDur(F.dur(x, x.e)) : 'in progress') : (x.ml ? amt(x.ml) : '')) + '</td><td><button type="button" data-del="' + x.s + '" data-t="' + x.t + '" aria-label="Remove">Remove</button></td></tr>'; }
		$('fl-body').innerHTML = rows; $('fl-empty').hidden = !!l.length; $('fl-tbl').hidden = !l.length; $('fl-undo').hidden = !S.undo;
	}
	chips(); render(); var tk = 0; setInterval(function () { if (document.hidden) return; tk++; var r = running(); if (r) { var c = r.t === 'bl' ? 'fl-lt' : 'fl-rt'; $(c).textContent = F.fmtDur(F.dur(r, Date.now())); if (tk % 20 === 0) render(); } else if (tk % 15 === 0) render(); }, 1000);
})();
