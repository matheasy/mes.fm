/* MES Contraction Timer UI. Maths = MESContr in lib.js (prepended above). Everything is stored in localStorage mes-contractions:v1. */
(function () {
	'use strict';
	var C = MESContr, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-contractions:v1';
	var S = { list: [], rule: '511', wake: false, buzz: false, undo: null, alerted: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ list: S.list, rule: S.rule, wake: S.wake, buzz: S.buzz, alerted: S.alerted })); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
	var toastT; function toast(m) { var t = $('ct-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }
	function clock(ms) { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
	function active() { var l = C.sorted(S.list); return l.length && l[l.length - 1].e == null ? l[l.length - 1] : null; }
	function buzz() { if (!S.buzz) return; try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.09); } catch (e) {} }

	var wl = null;
	function wake() { if (!S.wake || !navigator.wakeLock) return; navigator.wakeLock.request('screen').then(function (l) { wl = l; }, function () {}); }
	document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.wake) wake(); });
	$('ct-wake').checked = S.wake; $('ct-buzz').checked = S.buzz; $('ct-rule').value = S.rule;
	$('ct-wake').onchange = function () { S.wake = this.checked; save(); if (S.wake) { if (navigator.wakeLock) wake(); else toast('Your browser cannot keep the screen on'); } else if (wl) { wl.release(); wl = null; } };
	$('ct-buzz').onchange = function () { S.buzz = this.checked; save(); };
	$('ct-rule').onchange = function () { S.rule = this.value; S.alerted = false; save(); render(); };
	if (S.wake) wake();

	$('ct-btn').onclick = function () {
		var a = active(), now = Date.now(); buzz();
		if (a) { a.e = now; if (now - a.s < 3000) { S.list = S.list.filter(function (x) { return x !== a; }); toast('That was under 3 seconds, so it was not saved'); } }
		else S.list.push({ s: now, e: null });
		S.undo = null; save(); render();
	};
	$('ct-add').onclick = function () {
		var def = new Date(Date.now() - 5 * 60000), hh = ('0' + def.getHours()).slice(-2) + ':' + ('0' + def.getMinutes()).slice(-2);
		var t = prompt('When did the contraction START today? (24-hour time, like 14:35)', hh); if (!t) return;
		var m = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); if (!m) return toast('Use a time like 14:35');
		var d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
		var s = prompt('How long did it last, in seconds?', '60'); var len = parseInt(s, 10); if (!len || len < 3 || len > 600) return toast('Enter the length in seconds (3 to 600)');
		S.list.push({ s: d.getTime(), e: d.getTime() + len * 1000 }); save(); render();
	};
	$('ct-undo').onclick = function () { if (!S.undo) return; S.list = S.undo; S.undo = null; save(); render(); };
	$('ct-body').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var s = +b.getAttribute('data-del'); S.undo = S.list.slice(); S.list = S.list.filter(function (x) { return x.s !== s; }); save(); render(); });
	$('ct-clear').onclick = function () { if (!S.list.length) return; if (!confirm('Clear all ' + S.list.length + ' contractions and start a new session?')) return; S.undo = S.list.slice(); S.list = []; S.alerted = false; save(); render(); };
	function text() { var l = C.sorted(S.list), g = C.gaps(l); return l.map(function (x, i) { return (i + 1) + '. ' + clock(x.s) + ' · ' + (x.e != null ? C.fmtDur(C.dur(x, x.e)) : 'ongoing') + (g[i] != null ? ' · ' + C.fmtDur(g[i]) + ' since previous' : ''); }).join('\n') + '\n(mes.fm/contraction-timer)'; }
	$('ct-copy').onclick = function () { if (!S.list.length) return toast('Nothing to copy yet'); var t = text(); if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Log copied'); }, function () { toast('Copy failed'); }); else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Log copied'); } catch (e) { toast('Copy failed'); } ta.remove(); } };
	$('ct-csv').onclick = function () { if (!S.list.length) return toast('Nothing to download yet'); var a = document.createElement('a'), u = URL.createObjectURL(new Blob([C.toCSV(S.list)], { type: 'text/csv' })); a.href = u; a.download = 'contractions.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500); };

	function render() {
		var now = Date.now(), a = active(), l = C.sorted(S.list), g = C.gaps(l), last = l.length ? l[l.length - 1] : null;
		var btn = $('ct-btn'); btn.classList.toggle('on', !!a); btn.setAttribute('aria-label', a ? 'Stop the contraction' : 'Start a contraction');
		if (a) { $('ct-t').textContent = C.fmtDur(C.dur(a, now)); $('ct-s').textContent = 'tap to stop'; $('ct-status').innerHTML = 'Contraction in progress…'; }
		else { $('ct-t').textContent = 'Start'; $('ct-s').textContent = 'contraction'; $('ct-status').innerHTML = last ? 'Last one lasted <b>' + C.fmtDur(C.dur(last, last.e)) + '</b>. Tap <b>Start</b> for the next.' : 'Tap <b>Start</b> when a contraction begins.'; }
		$('ct-since').textContent = last && !a ? 'Next gap so far: ' + C.fmtDur((now - last.s) / 1000) + ' since the last one started' : (a && l.length > 1 ? 'Gap before this one: ' + C.fmtDur(g[g.length - 1]) : '');
		$('ct-undo').hidden = !S.undo;
		var sum = C.summary(l, now, 60), r = C.rule(l, now, S.rule);
		function tile(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
		$('ct-stats').innerHTML = l.length ? tile('Last hour', sum.count + ' contraction' + (sum.count === 1 ? '' : 's'), sum.count < 2 ? 'keep timing' : '', true) + tile('Average length', sum.avgDur != null ? C.fmtDur(sum.avgDur) : '—', 'minutes:seconds') + tile('Average gap', sum.avgGap != null ? C.fmtDur(sum.avgGap) : '—', sum.minGap != null ? 'shortest ' + C.fmtDur(sum.minGap) + ', longest ' + C.fmtDur(sum.maxGap) : 'start to start') + tile(r.rule.label + ' rule', r.met ? 'Met' : (r.run > 1 ? Math.round(r.spanMin) + ' of ' + r.needMin + ' min' : 'Not yet'), r.met ? 'time to call your provider' : (r.run > 1 ? r.run + ' qualifying in a row' : 'every ' + r.rule.gap + ' min, ' + r.rule.dur + ' s long')) : '';
		var al = $('ct-alert'); if (r.met) { al.hidden = false; al.innerHTML = '&#9888;&#65039; Your contractions have been about every ' + r.rule.gap + ' minutes or closer, lasting a minute or more, for ' + Math.round(r.spanMin) + ' minutes. <u>Time to call your doctor, midwife or hospital</u> and ask what to do. If anything feels wrong, call sooner.'; if (!S.alerted) { S.alerted = true; save(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} } } else { al.hidden = true; if (S.alerted && r.run < 2) { S.alerted = false; save(); } }
		var rows = '', i; for (i = l.length - 1; i >= 0; i--) rows += '<tr><td>' + (i + 1) + '</td><td>' + clock(l[i].s) + '</td><td>' + (l[i].e != null ? C.fmtDur(C.dur(l[i], l[i].e)) : 'ongoing') + '</td><td>' + (g[i] != null ? C.fmtDur(g[i]) : '—') + '</td><td>' + (l[i].e != null ? '<button type="button" data-del="' + l[i].s + '" aria-label="Remove this row">Remove</button>' : '') + '</td></tr>';
		$('ct-body').innerHTML = rows; $('ct-empty').hidden = !!l.length; $('ct-tbl').hidden = !l.length;
		var rec = l.slice(-24), mx = Math.max.apply(null, g.slice(-24).filter(function (x) { return x != null; }).concat([60])), ch = ''; var gg = g.slice(-24);
		rec.forEach(function (x, j) { var gv = gg[j]; if (gv == null) return; ch += '<div class="ct-bar' + (gv <= C.RULES[S.rule].gap * 75 ? ' ok' : '') + '" style="height:' + Math.max(6, Math.round(gv / mx * 100)) + '%" title="' + C.fmtDur(gv) + ' since the previous"></div>'; });
		$('ct-chart').innerHTML = ch;
	}
	render(); var tk = 0;
	setInterval(function () { if (document.hidden) return; tk++; var a = active(); if (a) { $('ct-t').textContent = C.fmtDur(C.dur(a, Date.now())); if (tk % 15 === 0) render(); } else if (tk % 5 === 0) render(); }, 1000);
})();
