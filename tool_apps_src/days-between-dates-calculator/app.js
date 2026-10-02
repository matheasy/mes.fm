/* MES Days Between Dates UI (date maths = DC in lib.js, holidays = MESCal from the calendar engine; both prepended above) */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-days:v1';
	var UNITS = [['y', 'Years'], ['m', 'Months'], ['w', 'Weeks'], ['d', 'Days'], ['h', 'Hours'], ['n', 'Minutes'], ['s', 'Seconds']];
	var PRESETS = [['Y · M · D', 'ymd'], ['M · D', 'md'], ['W · D', 'wd'], ['Days', 'd'], ['Weeks', 'w'], ['Months', 'm'], ['D · H · M · S', 'dhns'], ['Hours', 'h'], ['H · M · S', 'hns'], ['Minutes', 'n'], ['Seconds', 's']];
	var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	var state = { units: 'ymd', incl: false, time: false, weekend: [0, 6], region: '', hol: '', zone: 'local' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in state) state[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
	var toastTimer;
	function toast(msg) { var t = $('db-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
		function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
	}
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	function stat(label, value, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	var N = DC.num, DAY = DC.DAY;
	function fmtDate(ms, withTime) {
		var p = DC.parts(ms), s = WDL[p.dow] + ', ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.m] + ' ' + p.d + ', ' + p.y;
		if (withTime) s += ' at ' + ('0' + p.h).slice(-2) + ':' + ('0' + p.mi).slice(-2) + ':' + ('0' + p.s).slice(-2);
		return s;
	}
	function todayMs() { var n = new Date(); return DC.utcMs(n.getFullYear(), n.getMonth(), n.getDate()); }

	/* ---------- static UI ---------- */
	$('db-units').innerHTML = UNITS.map(function (u) { return '<label class="db-check"><input type="checkbox" data-u="' + u[0] + '"> ' + u[1] + '</label>'; }).join('');
	$('db-presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="tu-chip" data-p="' + p[1] + '" aria-pressed="false">' + p[0] + '</button>'; }).join('');
	$('db-wk').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<label class="db-check"><input type="checkbox" data-wd="' + d + '"> ' + WD[d] + '</label>'; }).join('');
	var zones = ['local', 'UTC']; try { if (Intl.supportedValuesOf) zones = zones.concat(Intl.supportedValuesOf('timeZone').filter(function (z) { return z !== 'UTC'; })); } catch (e) {}
	$('db-zone').innerHTML = zones.map(function (z) { return '<option value="' + z + '">' + (z === 'local' ? 'Your time zone (' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local') + ')' : z.replace(/_/g, ' ')) + '</option>'; }).join('');
	function quickRanges() {
		var t = DC.parts(todayMs()), y = t.y, now = todayMs();
		var xmas = DC.utcMs(t.m === 11 && t.d > 25 ? y + 1 : y, 11, 25), ny = DC.utcMs(y + 1, 0, 1);
		return [['Days until Christmas', now, xmas], ['Days until New Year', now, ny], ['Days since Jan 1', DC.utcMs(y, 0, 1), now], ['Next 30 days', now, now + 30 * DAY], ['Next 90 days', now, now + 90 * DAY], ['This year', DC.utcMs(y, 0, 1), DC.utcMs(y + 1, 0, 1)], ['This month', DC.utcMs(y, t.m, 1), DC.addMonths(DC.utcMs(y, t.m, 1), 1)]];
	}
	var QR = quickRanges();
	$('db-quick').innerHTML = QR.map(function (q, i) { return '<button type="button" class="tu-chip" data-q="' + i + '">' + q[0] + '</button>'; }).join('');

	/* ---------- inputs ---------- */
	function readMs(dateId, timeId) {
		var d = DC.parseISO($(dateId).value); if (!d) return null;
		var t = state.time ? DC.parseTime($(timeId).value) : { h: 0, mi: 0, s: 0 };
		return DC.utcMs(d.y, d.m, d.d, t.h, t.mi, t.s);
	}
	function selUnits() { var sel = {}; Array.prototype.forEach.call($('db-units').querySelectorAll('input'), function (i) { if (i.checked) sel[i.dataset.u] = true; }); return sel; }
	function setUnits(code) { Array.prototype.forEach.call($('db-units').querySelectorAll('input'), function (i) { i.checked = code.indexOf(i.dataset.u) >= 0; }); }
	function holidaySet(a, b) {
		var set = {}, list = [];
		if (state.region && typeof MESCal !== 'undefined') {
			var y0 = DC.parts(a).y, y1 = DC.parts(b).y;
			for (var y = y0; y <= Math.min(y1, y0 + 150); y++) {
				var m = MESCal.buildYear(y);
				Object.keys(m).forEach(function (k) { m[k].forEach(function (e) { if (e.g === state.region && e.k === 'holiday') { var p = DC.parseISO(k); if (p) { var dn = DC.utcMs(p.y, p.m, p.d) / DAY; if (!set[dn]) { set[dn] = e.t; } } } }); });
			}
		}
		(state.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).forEach(function (s) { var p = DC.parseISO(s); if (p) set[DC.utcMs(p.y, p.m, p.d) / DAY] = 'Day off'; });
		return set;
	}

	/* ---------- main ---------- */
	var last = null;
	function update() {
		var A = readMs('db-a', 'db-ta'), B = readMs('db-b', 'db-tb');
		if (A == null || B == null) { $('db-big').textContent = '—'; $('db-sub').textContent = 'Pick a start and an end date.'; ['db-breakdown', 'db-totals', 'db-work', 'db-info-a', 'db-info-b', 'db-mile'].forEach(function (i) { $(i).innerHTML = ''; }); $('db-bar').hidden = true; last = null; return; }
		var swapped = B < A; if (swapped) { var t = A; A = B; B = t; }
		var incl = state.incl && !state.time, Beff = incl ? B + DAY : B, D = Beff - A, sel = selUnits();
		var totalDays = D / DAY, wholeDays = Math.floor(totalDays), time = state.time;
		var bd = DC.breakdown(A, Beff, sel);
		// hero
		var heroText = time ? DC.breakdown(A, Beff, { d: true, h: true, n: true, s: true }).text : N(wholeDays) + (wholeDays === 1 ? ' day' : ' days');
		$('db-big').textContent = heroText;
		var dirNote = '';
		var today = todayMs() + (time ? 0 : 0);
		$('db-sub').innerHTML = esc(fmtDate(A, time)) + '<br>to ' + esc(fmtDate(B, time)) + '<br><span class="tu-note">' + (incl ? 'End date included (both days counted)' : time ? 'Clock difference' : 'End date not counted') + (swapped ? ' &middot; the dates were in reverse order' : '') + '</span>';
		var span = Beff - A;
		if (span > 0 && today >= A && today <= Beff) { var pct = Math.min(100, Math.max(0, (today - A) / span * 100)); $('db-bar').hidden = false; $('db-barfill').style.width = pct + '%'; $('db-sub').innerHTML += '<br>Today is ' + N(pct) + '% of the way (' + N((Beff - today) / DAY) + ' days left)'; } else $('db-bar').hidden = true;
		// breakdown
		$('db-breakdown').textContent = bd.text;
		// totals
		var months = DC.wholeMonths(A, Beff), baseM = DC.addMonths(A, months), mfrac = months + (Beff - baseM) / (DC.addMonths(baseM, 1) - baseM);
		var h = stat('Days', N(totalDays), '', true) + stat('Weeks', N(totalDays / 7), N(Math.floor(totalDays / 7)) + ' weeks ' + N(totalDays - Math.floor(totalDays / 7) * 7) + ' days') + stat('Months', N(mfrac), 'calendar months') + stat('Years', N(mfrac / 12), 'about ' + N(totalDays / 365.25) + ' by 365.25-day years');
		h += stat('Hours', N(D / 3600000)) + stat('Minutes', N(D / 60000)) + stat('Seconds', N(D / 1000));
		$('db-totals').innerHTML = h;
		// business days
		var startDay = Math.floor(A / DAY), n = Math.max(0, Math.floor(Beff / DAY) - startDay + (time && Beff % DAY ? 1 : 0)), hol = holidaySet(A, Beff);
		var wc = DC.workCount(startDay, n, state.weekend, hol);
		$('db-work').innerHTML = stat('Business days', N(wc.work), 'days that are not a weekend or holiday', true) + stat('Weekend days', N(wc.weekend), state.weekend.map(function (d) { return WD[d]; }).join(' + ') || 'none selected') + stat('Holidays skipped', N(wc.holidays.length), state.region || state.hol ? 'on working days' : 'none selected');
		$('db-hol-list').innerHTML = wc.holidays.length ? '<strong>Skipped:</strong> ' + wc.holidays.slice(0, 40).map(function (dn) { return esc(DC.iso(dn * DAY) + ' ' + hol[dn]); }).join(' &middot; ') + (wc.holidays.length > 40 ? ' …' : '') : '';
		// details
		function info(ms) {
			var p = DC.parts(ms), w = DC.isoWeek(ms), left = (DC.isLeap(p.y) ? 366 : 365) - DC.dayOfYear(ms);
			return '<div class="db-info"><div><span>Date</span><span>' + esc(fmtDate(ms, time)) + '</span></div><div><span>Day of the year</span><span>' + DC.dayOfYear(ms) + ' of ' + (DC.isLeap(p.y) ? 366 : 365) + '</span></div><div><span>ISO week</span><span>Week ' + w.week + ', ' + w.year + '</span></div><div><span>Days left in the year</span><span>' + left + '</span></div><div><span>Leap year</span><span>' + (DC.isLeap(p.y) ? 'Yes' : 'No') + '</span></div></div>';
		}
		$('db-info-a').innerHTML = info(A); $('db-info-b').innerHTML = info(B);
		var wcnt = DC.weekdayCounts(startDay, n);
		$('db-wdays').querySelector('thead tr').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<th>' + WD[d] + '</th>'; }).join('');
		$('db-wdays').querySelector('tbody tr').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<td>' + N(wcnt[d]) + '</td>'; }).join('');
		var mid = A + Math.floor(span / 2 / DAY) * DAY;
		var ms = [['Halfway point', mid], ['100 days after the start', A + 100 * DAY], ['1,000 days after the start', A + 1000 * DAY], ['10,000 days after the start', A + 10000 * DAY], ['One year after the end', DC.addMonths(B, 12)]];
		$('db-mile').innerHTML = ms.map(function (m) { return '<li><span>' + m[0] + '</span><strong>' + esc(fmtDate(m[1], false)) + '</strong></li>'; }).join('');
		// DST note
		var dst = $('db-dst');
		if (time) {
			try { var el = DC.wallToUtc(Beff, state.zone) - DC.wallToUtc(A, state.zone), diff = el - D; dst.textContent = diff ? 'A daylight-saving change falls inside this period: the real elapsed time is ' + DC.breakdown(0, el, { d: true, h: true, n: true, s: true }).text + ' (' + (diff > 0 ? '+' : '−') + N(Math.abs(diff) / 3600000) + ' h versus the clock difference).' : 'No daylight-saving change falls inside this period, so the clock difference equals the real elapsed time.'; } catch (e) {}
		} else dst.textContent = 'Turn on “Include time of day” to compare clock time with real elapsed time across daylight-saving changes.';
		last = { text: heroText + ' (' + bd.text + ') from ' + fmtDate(A, time) + ' to ' + fmtDate(B, time) + (incl ? ', end date included' : '') };
	}

	/* ---------- wiring ---------- */
	function sync() {
		$('db-ta-wrap').hidden = $('db-tb-wrap').hidden = !state.time; $('db-incl').disabled = state.time; $('db-time').checked = state.time; $('db-incl').checked = state.incl && !state.time;
		var cur = Object.keys(selUnits()).sort().join('');
		Array.prototype.forEach.call($('db-presets').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.p.split('').sort().join('') === cur)); });
	}
	function changed() { var u = Object.keys(selUnits()); state.units = u.length ? UNITS.map(function (x) { return x[0]; }).filter(function (c) { return u.indexOf(c) >= 0; }).join('') : 'd'; sync(); update(); save(); }
	['db-a', 'db-b', 'db-ta', 'db-tb'].forEach(function (id) { $(id).addEventListener('input', changed); $(id).addEventListener('change', changed); });
	$('db-incl').addEventListener('change', function () { state.incl = this.checked; changed(); });
	$('db-time').addEventListener('change', function () { state.time = this.checked; changed(); });
	$('db-units').addEventListener('change', changed);
	$('db-presets').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setUnits(b.dataset.p); changed(); });
	$('db-wk').addEventListener('change', function () { state.weekend = Array.prototype.filter.call($('db-wk').querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return +i.dataset.wd; }); changed(); });
	$('db-region').addEventListener('change', function () { state.region = this.value; changed(); });
	$('db-hol').addEventListener('input', function () { state.hol = this.value; changed(); });
	$('db-zone').addEventListener('change', function () { state.zone = this.value; changed(); });
	function setDate(id, ms) { $(id).value = DC.iso(ms); }
	$('db-a-today').addEventListener('click', function () { setDate('db-a', todayMs()); changed(); });
	$('db-b-today').addEventListener('click', function () { setDate('db-b', todayMs()); changed(); });
	$('db-swap').addEventListener('click', function () { var a = $('db-a').value, b = $('db-b').value, ta = $('db-ta').value, tb = $('db-tb').value; $('db-a').value = b; $('db-b').value = a; $('db-ta').value = tb; $('db-tb').value = ta; changed(); });
	$('db-quick').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var q = QR[+b.dataset.q]; setDate('db-a', q[1]); setDate('db-b', q[2]); changed(); });
	function wallNow(z) {
		var n = new Date();
		if (z === 'local') return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate(), h: n.getHours(), mi: n.getMinutes(), s: n.getSeconds() };
		var f = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }), o = {};
		f.formatToParts(n).forEach(function (q) { o[q.type] = +q.value; });
		return { y: o.year, m: o.month - 1, d: o.day, h: o.hour, mi: o.minute, s: o.second };
	}
	$('db-now').addEventListener('click', function () {
		var p; try { p = wallNow(state.zone); } catch (e) { return; }
		state.time = true; setDate('db-a', DC.utcMs(p.y, p.m, p.d)); $('db-ta').value = ('0' + p.h).slice(-2) + ':' + ('0' + p.mi).slice(-2) + ':' + ('0' + p.s).slice(-2); changed();
	});
	$('db-copy').addEventListener('click', function () { if (last) copy(last.text, 'Result copied'); });
	$('db-link').addEventListener('click', function () {
		var q = new URLSearchParams(); q.set('start', $('db-a').value); q.set('end', $('db-b').value);
		if (state.incl) q.set('incl', '1'); if (state.time) { q.set('st', $('db-ta').value); q.set('et', $('db-tb').value); }
		q.set('u', state.units); if (state.region) q.set('region', state.region); if (state.weekend.slice().sort().join() !== '0,6') q.set('wk', state.weekend.join(''));
		copy(location.origin + location.pathname + '?' + q.toString(), 'Link copied');
	});

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search), today = todayMs(), t0 = DC.parts(today);
	var a0 = DC.parseISO(q.get('start')), b0 = DC.parseISO(q.get('end'));
	setDate('db-a', a0 ? DC.utcMs(a0.y, a0.m, a0.d) : today);
	setDate('db-b', b0 ? DC.utcMs(b0.y, b0.m, b0.d) : DC.utcMs(t0.y + 1, 0, 1));
	if (q.get('incl') === '1') state.incl = true;
	if (q.get('st') || q.get('et')) { state.time = true; $('db-ta').value = q.get('st') || '00:00:00'; $('db-tb').value = q.get('et') || '00:00:00'; }
	if (q.get('u') && /^[ymwdhns]+$/.test(q.get('u'))) state.units = q.get('u');
	if (q.get('region') && /^(ca|us|uk|au|vn)$/.test(q.get('region'))) state.region = q.get('region');
	if (q.get('wk') && /^[0-6]+$/.test(q.get('wk'))) state.weekend = q.get('wk').split('').map(Number);
	setUnits(state.units); Array.prototype.forEach.call($('db-wk').querySelectorAll('input'), function (i) { i.checked = state.weekend.indexOf(+i.dataset.wd) >= 0; });
	$('db-region').value = state.region; $('db-hol').value = state.hol; if ($('db-zone').querySelector('option[value="' + state.zone + '"]')) $('db-zone').value = state.zone;
	sync(); update();
})();
