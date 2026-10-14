/* MES ovulation / period / due date UI. The maths is MESCycle in lib.js (prepended above). One script serves three pages: <div id="cy" data-views="ov|per|due">. */
(function () {
	'use strict';
	var C = MESCycle, root = document.getElementById('cy'); if (!root) return;
	var VIEW = root.getAttribute('data-views') || 'ov', $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-cycle:v1';
	var S = { lmp: null, cycle: 28, vary: false, short: 26, long: 32, plen: 5, luteal: 14, lh: null, mon: false, starts: [], dm: 'lmp', dd: null, dcycle: 28, demb: 5, dgw: 8, dgd: 0 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var TODAY = C.today();

	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	var toastT;
	function toast(m) { var t = $('cy-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1900); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
	}
	function download(name, text, type) { var a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: type || 'text/calendar' })); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500); }
	function stat(label, value, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
	function rel(day) { var d = day - TODAY; return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : d > 0 ? 'in ' + plural(d, 'day') : plural(-d, 'day') + ' ago'; }
	function num(id, lo, hi, def) { var v = parseInt($(id).value, 10); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); }

	/* ---------- view switching ---------- */
	Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (el) { var v = el.getAttribute('data-view').split(' '); if (v.indexOf(VIEW) < 0) el.parentNode.removeChild(el); });
	Array.prototype.forEach.call(root.querySelectorAll('[data-tab]'), function (a) { if (a.getAttribute('data-tab') === VIEW) { a.classList.add('is-on'); a.setAttribute('aria-current', 'page'); } });

	/* ---------- model ---------- */
	function eff() {   // cycle length to use
		var c = S.cycle; return Math.max(18, Math.min(60, c || 28));
	}
	/* the cycle row (from lmp, repeated) that is current or next: first one whose next period is today or later */
	function build() {
		if (S.lmp == null) return null;
		var cycle = eff(), rows = C.project({ lmp: S.lmp, cycle: cycle, luteal: S.luteal, periodLen: S.plen, lh: S.lh }, 40), i, cur = 0;
		for (i = 0; i < rows.length; i++) if (rows[i].next >= TODAY) { cur = i; break; }
		if (i === rows.length) cur = rows.length - 1;
		return { rows: rows, cur: cur, cycle: cycle };
	}

	/* ---------- inputs ---------- */
	function readInputs() {
		var d = $('cy-lmp').value ? C.parseISO($('cy-lmp').value) : null, msg = '';
		S.lmp = d; S.cycle = num('cy-cycle', 18, 60, 28); S.vary = $('cy-vary').checked; S.short = num('cy-short', 18, 60, 26); S.long = num('cy-long', 18, 60, 32);
		if (S.short > S.long) { var t = S.short; S.short = S.long; S.long = t; }
		S.plen = num('cy-plen', 1, 12, 5); S.luteal = num('cy-luteal', 8, 18, 14); S.mon = $('cy-mon').checked;
		S.lh = $('cy-lh').value ? C.parseISO($('cy-lh').value) : null;
		if (d != null) {
			if (d > TODAY + 1) msg = 'That date is in the future: the first day of your <b>last</b> period is the most recent one that has already started.';
			else if (TODAY - d > 400) msg = 'That was over a year ago. Enter the first day of your most recent period for the best estimate.';
		}
		if (S.cycle < 21 || S.cycle > 38) msg = (msg ? msg + ' ' : '') + 'A cycle outside 21&ndash;38 days is worth mentioning to a doctor. The calculator still works, but ovulation timing is less predictable.';
		$('cy-msg').innerHTML = msg; $('cy-vary-row').hidden = !S.vary; $('cy-lh-clear').hidden = S.lh == null;
		save();
	}
	function writeInputs() {
		if (S.lmp != null) $('cy-lmp').value = C.iso(S.lmp);
		$('cy-cycle').value = S.cycle; $('cy-vary').checked = S.vary; $('cy-short').value = S.short; $('cy-long').value = S.long; $('cy-plen').value = S.plen; $('cy-luteal').value = S.luteal; $('cy-mon').checked = S.mon;
		if (S.lh != null) $('cy-lh').value = C.iso(S.lh); $('cy-vary-row').hidden = !S.vary; $('cy-lh-clear').hidden = S.lh == null;
		if (S.lh != null || S.plen !== 5 || S.luteal !== 14 || S.mon) { var d = root.querySelector('.cy-adv'); if (d) d.open = true; }
	}

	/* ---------- calendar ---------- */
	var calStart = null;   // first of the 3 shown months, as {y,m}
	function dayClasses(model, rangeInfo) {
		var map = {}, r;
		function add(d, c, txt) { if (!map[d]) map[d] = { c: [], t: [] }; if (map[d].c.indexOf(c) < 0) map[d].c.push(c); if (txt) map[d].t.push(txt); }
		model.rows.forEach(function (r, i) {
			var d;
			for (d = r.start; d <= r.periodEnd; d++) add(d, i === 0 ? 'per' : 'perp', (i === 0 ? 'Period' : (r.start < TODAY ? 'Estimated period' : 'Expected period')) + (d === r.start ? ' (day 1)' : ''));
			for (d = r.fertileStart; d <= r.fertileEnd; d++) add(d, d >= r.ovulation - 2 ? 'peak' : 'fert', d === r.ovulation ? 'Estimated ovulation' : (d >= r.ovulation - 2 ? 'Most fertile day' : 'Fertile window'));
			add(r.ovulation, 'ov');
		});
		S.starts.forEach(function (st) { var d; for (d = st; d < st + S.plen; d++) add(d, 'per', 'Logged period' + (d === st ? ' (day 1)' : '')); });
		return map;
	}
	var CAL = {};
	function monthHTML(y, m, map) {
		var first = C.toDay(y, m, 1), dow = C.parts(first).dow, lead = S.mon ? (dow + 6) % 7 : dow, days = C.parts(C.toDay(y, m + 1, 0)).d, h = '<div class="cy-m"><div class="cy-m__t">' + C.MONTHS[m - 1] + ' ' + y + '</div><div class="cy-g">', i, d, x, cls, wd = S.mon ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
		wd.forEach(function (w) { h += '<b>' + C.WDAYS[w].slice(0, 2) + '</b>'; });
		for (i = 0; i < lead; i++) h += '<span></span>';
		for (d = 1; d <= days; d++) {
			var day = C.toDay(y, m, d); x = map[day]; cls = 'cy-d' + (x ? ' ' + x.c.join(' ') : '') + (day === TODAY ? ' today' : '');
			h += '<button type="button" class="' + cls + '" data-day="' + day + '" aria-label="' + C.fmt(day) + (x ? ', ' + x.t.join(', ') : '') + '">' + d + '</button>';
		}
		return h + '</div></div>';
	}
	function renderCal(model) {
		if (!$('cy-cal')) return;
		var map = dayClasses(model); CAL = map;
		if (!calStart) { var tp = C.parts(model.rows[model.cur].start); calStart = TODAY >= model.rows[model.cur].start && TODAY <= model.rows[model.cur].next ? C.parts(TODAY) : tp; }
		var y = calStart.y, m = calStart.m, h = '', i;
		for (i = 0; i < 3; i++) { h += monthHTML(y, m, map); m++; if (m > 12) { m = 1; y++; } }
		$('cy-cal').innerHTML = h;
		var lg = [['per', 'Period'], ['perp', 'Expected period'], ['fert', 'Fertile'], ['peak', 'Most fertile'], ['ov', 'Ovulation']];
		if (VIEW === 'per') lg = [['per', 'Period'], ['perp', 'Expected period'], ['fert', 'Fertile'], ['peak', 'Most fertile'], ['ov', 'Ovulation']];
		$('cy-legend').innerHTML = lg.map(function (l) { return '<span><i class="cy-d ' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '<span><i class="cy-d today"></i>Today</span>';
	}
	function shiftCal(n) { if (!calStart) return; var m = calStart.m - 1 + n; calStart = { y: calStart.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 + 1 }; var b = build(); if (b) renderCal(b); }
	if ($('cy-cal-prev')) {
		$('cy-cal-prev').onclick = function () { shiftCal(-3); }; $('cy-cal-next').onclick = function () { shiftCal(3); };
		$('cy-cal-now').onclick = function () { calStart = C.parts(TODAY); var b = build(); if (b) renderCal(b); };
		$('cy-cal').addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('[data-day]'); if (!b) return; var day = +b.getAttribute('data-day'), x = CAL[day], p = [];
			p.push('<b>' + C.fmt(day) + '</b> (' + rel(day) + ')');
			if (x) { var seen = {}; x.t.forEach(function (t) { if (!seen[t]) { seen[t] = 1; p.push(t); } }); }
			var mdl = build(); if (mdl) { var best = null; mdl.rows.forEach(function (r) { if (day >= r.start && day < r.next) best = r; }); if (best) { var cd = day - best.start + 1; p.push('cycle day ' + cd); var off = day - best.ovulation; if (off >= -5 && off <= 1) p.push('about ' + Math.round(C.chanceOn(off) * 100) + '% chance of pregnancy from sex today (typical couple)'); } }
			$('cy-daydetail').innerHTML = p.join(' · ');
		});
	}

	/* ---------- ovulation page ---------- */
	function renderOv() {
		var m = build(), out = $('cy-ov-out'); if (!m) { out.hidden = true; $('cy-cal-sec').hidden = true; return; }
		out.hidden = false; $('cy-cal-sec').hidden = false;
		var r = m.rows[m.cur], p = C.predict({ lmp: r.start, cycle: m.cycle, luteal: S.luteal, periodLen: S.plen, lh: m.cur === 0 ? S.lh : null }), status = '';
		var range = S.vary && !(m.cur === 0 && S.lh != null) ? C.predictRange({ lmp: r.start, shortest: S.short, longest: S.long, luteal: S.luteal }) : null;
		$('cy-ov-k').textContent = p.ovulation < TODAY ? 'Ovulation this cycle was around' : 'Estimated ovulation';
		$('cy-ov-big').textContent = range ? C.fmtShort(range.ovEarliest) + ' – ' + C.fmtShort(range.ovLatest) : C.fmt(p.ovulation);
		var fs = range ? range.fertileStart : p.fertileStart, fe = range ? range.fertileEnd : p.fertileEnd;
		$('cy-ov-sub').innerHTML = 'Fertile window <b>' + C.fmtShort(fs) + ' – ' + C.fmtShort(fe) + '</b>' + (range ? '' : ' · best days <b>' + C.fmtShort(p.peakStart) + ' – ' + C.fmtShort(p.ovulation) + '</b>') + (p.lhBased ? '<br>Based on your positive LH test on ' + C.fmtShort(S.lh) : '');
		if (TODAY >= fs && TODAY <= fe) status = '&#127793; You are in your fertile window today' + (!range && TODAY >= p.peakStart ? ' (peak days)' : '') + '.';
		else if (TODAY < fs) status = 'Your fertile window starts ' + rel(fs) + '.';
		else status = 'Your fertile window ended ' + rel(fe).replace(/^in /, '') + '. Next period ' + rel(p.nextPeriod) + '.';
		if (m.cur > 0) status += ' <span class="tu-note">(Counting forward ' + plural(m.cur, 'cycle') + ' from the last period you entered.)</span>';
		$('cy-ov-status').innerHTML = status;
		var due = C.dueFromConception(p.ovulation);
		$('cy-ov-stats').innerHTML =
			stat('Next period', C.fmt(p.nextPeriod, true), (range ? 'between ' + C.fmtShort(range.nextEarliest) + ' and ' + C.fmtShort(range.nextLatest) + ' · ' : '') + rel(p.nextPeriod), false) +
			stat('Pregnancy test', C.fmt(p.testDay, true), 'Reliable from the first day of a missed period. Earlier tests can read negative.', false) +
			stat('If you conceive this cycle', C.fmt(due, true), 'your due date (conception on the ovulation day)', false) +
			stat('Cycle length', S.cycle + ' days', 'luteal phase ' + S.luteal + ' days · period ' + S.plen + ' days', false);
		// chance bars
		var h = '', mx = 0.33, o;
		for (o = -5; o <= 1; o++) { var ch = C.chanceOn(o), day = p.ovulation + o, hh = Math.round(ch / mx * 100); h += '<div class="cy-bar' + (day === TODAY ? ' is-today' : '') + (o === 0 ? ' is-ov' : '') + '"><div class="cy-bar__v">' + Math.round(ch * 100) + '%</div><div class="cy-bar__b" style="height:' + hh + '%"></div><div class="cy-bar__l">' + C.fmtShort(day) + (o === 0 ? '<br>ovulation' : '') + '</div></div>'; }
		$('cy-chance').innerHTML = h;
		// table
		var rows = m.rows.slice(m.cur, m.cur + 6), t = '<tr><th>Cycle starts</th><th>Fertile window</th><th>Ovulation</th><th>Next period</th></tr>';
		rows.forEach(function (x, i) { var pp = i === 0 ? p : null; t += '<tr' + (i === 0 ? ' class="is-active"' : '') + '><td>' + C.fmt(x.start, true) + '</td><td>' + C.fmtShort(i === 0 ? fs : x.fertileStart) + ' – ' + C.fmtShort(i === 0 ? fe : x.fertileEnd) + '</td><td>' + C.fmtShort(i === 0 ? p.ovulation : x.ovulation) + '</td><td>' + C.fmtShort(i === 0 ? p.nextPeriod : x.next) + '</td></tr>'; });
		$('cy-tbl').innerHTML = t;
		renderCal(m);
		return { m: m, p: p, fs: fs, fe: fe, rows: rows };
	}
	function ovEvents() {
		var m = build(); if (!m) return [];
		var ev = [], rows = m.rows.slice(m.cur, m.cur + 6);
		rows.forEach(function (x, i) {
			var o = (i === 0 && m.cur === 0 && S.lh != null) ? S.lh + 1 : x.ovulation;
			ev.push({ start: x.fertileStart, end: x.fertileEnd, title: 'Fertile window', note: 'Estimated fertile window (6 days ending on ovulation). An estimate from mes.fm/ovulation-calculator, not medical advice.' });
			ev.push({ start: o, title: 'Estimated ovulation', note: 'Estimated ovulation day from mes.fm/ovulation-calculator.' });
			ev.push({ start: x.next, end: x.next + S.plen - 1, title: 'Expected period', note: 'Expected period from mes.fm/ovulation-calculator.' });
		});
		return ev;
	}
	function ovText() {
		var m = build(); if (!m) return ''; var r = m.rows[m.cur], p = C.predict({ lmp: r.start, cycle: m.cycle, luteal: S.luteal, periodLen: S.plen, lh: m.cur === 0 ? S.lh : null });
		return 'Ovulation: ' + C.fmt(p.ovulation) + '\nFertile window: ' + C.fmtShort(p.fertileStart) + ' – ' + C.fmtShort(p.fertileEnd) + '\nNext period: ' + C.fmt(p.nextPeriod) + '\n(Estimate from mes.fm/ovulation-calculator)';
	}

	/* ---------- period page ---------- */
	function logStats() { return C.stats(S.starts); }
	function renderLog() {
		var el = $('cy-log'); if (!el) return;
		var s = C.sortStarts(S.starts).reverse(), h = '', st = logStats();
		if (!s.length) h = '<p class="tu-note">Nothing logged yet.</p>';
		else { h = '<ul class="cy-loglist">'; s.forEach(function (d, i) { var prev = s[i + 1], len = prev != null ? d - prev : null; h += '<li><span>' + C.fmt(d) + '</span><span class="tu-note">' + (len ? 'after a ' + len + '-day cycle' : 'first logged') + '</span><button type="button" class="tu-chip" data-del="' + d + '" aria-label="Remove ' + C.fmt(d) + '">Remove</button></li>'; }); h += '</ul>'; }
		el.innerHTML = h;
		var sh = '';
		if (st) {
			var verdict = st.regular === 'regular' ? 'Regular: cycles within a week of each other' : st.regular === 'varies' ? 'Varies by ' + st.range + ' days: some irregularity' : 'Irregular: cycles differ by ' + st.range + ' days';
			sh = stat('Average cycle', st.avg.toFixed(1) + ' days', 'last ' + Math.min(6, st.count) + ' cycles' + (st.count > 6 ? ' (of ' + st.count + ')' : ''), true) + stat('Shortest – longest', st.min + ' – ' + st.max + ' days', verdict) + (st.sd ? stat('Typical swing', '± ' + st.sd.toFixed(1) + ' days', 'standard deviation') : '');
			if (st.outside) sh += stat('Worth a mention', plural(st.outside, 'cycle') + ' outside 21–38 days', 'A single odd cycle is common; a pattern is worth discussing with a doctor.');
		}
		$('cy-log-stats').innerHTML = sh; $('cy-log-use').hidden = !st; $('cy-log-csv').hidden = !s.length; $('cy-log-clear').hidden = !s.length;
		if (st) $('cy-log-use').textContent = 'Use my average (' + st.avgRound + ' days)';
	}
	function renderPer() {
		var m = build(), out = $('cy-per-out'); renderLog();
		if (!m) { out.hidden = true; $('cy-cal-sec').hidden = true; return; }
		out.hidden = false; $('cy-cal-sec').hidden = false;
		var st = logStats(), ci = m.cur;
		if (m.rows[0].next < TODAY && TODAY - m.rows[0].next <= 14) ci = 0;   /* a period only a little overdue: keep showing it as expected, not skip to the next one */
		var r = m.rows[ci], p = C.predict({ lmp: r.start, cycle: m.cycle, luteal: S.luteal, periodLen: S.plen, lh: ci === 0 ? S.lh : null });
		var lo = S.vary ? S.short : (st && st.count > 1 ? st.min : null), hi = S.vary ? S.long : (st && st.count > 1 ? st.max : null);
		var late = TODAY - p.nextPeriod;
		$('cy-per-k').textContent = p.nextPeriod < TODAY ? 'Your period was expected' : 'Your next period';
		$('cy-per-big').textContent = C.fmt(p.nextPeriod);
		$('cy-per-sub').innerHTML = 'Lasts about ' + S.plen + ' days (until ' + C.fmtShort(p.periodEnd) + ')' + (lo && hi && lo !== hi ? '<br>Likely between <b>' + C.fmtShort(r.start + lo) + '</b> and <b>' + C.fmtShort(r.start + hi) + '</b> based on your ' + (S.vary ? 'shortest and longest cycles' : 'logged cycles') : '');
		$('cy-per-status').innerHTML = late > 0 ? 'Expected ' + rel(p.nextPeriod) + '.' : 'That is ' + rel(p.nextPeriod) + '. Fertile window ' + C.fmtShort(p.fertileStart) + ' – ' + C.fmtShort(p.fertileEnd) + '.';
		var lt = $('cy-late');
		if (late >= 1 && ci === 0) { lt.hidden = false; lt.innerHTML = '<b>Your period is ' + plural(late, 'day') + ' late.</b> Stress, travel, illness and changes in routine can delay a period. If you could be pregnant, a home test is reliable from the first day of a missed period. <a href="/due-date-calculator">Due date calculator</a>'; } else lt.hidden = true;
		var t = '<tr><th>Period</th><th>Starts</th><th>Ends</th>' + (lo && hi ? '<th>Possible range</th>' : '') + '<th>Fertile window</th></tr>';
		var proj = m.rows;
		proj.filter(function (x) { return x.start >= r.next; }).slice(0, 12).forEach(function (x, n) {
			var k = Math.round((x.start - r.start) / m.cycle);
			t += '<tr' + (n === 0 ? ' class="is-active"' : '') + '><td>' + (n === 0 ? (p.nextPeriod < TODAY ? 'Expected' : 'Next') : '#' + (n + 1)) + '</td><td>' + C.fmt(x.start, true) + '</td><td>' + C.fmtShort(x.periodEnd) + '</td>' + (lo && hi ? '<td>' + (k > 0 && k <= 3 ? C.fmtShort(r.start + lo * k) + ' – ' + C.fmtShort(r.start + hi * k) : '') + '</td>' : '') + '<td>' + C.fmtShort(x.fertileStart) + ' – ' + C.fmtShort(x.fertileEnd) + '</td></tr>';
		});
		$('cy-per-table').innerHTML = t;
		$('cy-tbl-h').textContent = 'Next six cycles';
		var rr = m.rows.slice(ci, ci + 6), tt = '<tr><th>Cycle starts</th><th>Fertile window</th><th>Ovulation</th><th>Next period</th></tr>';
		rr.forEach(function (x, i2) { tt += '<tr' + (i2 === 0 ? ' class="is-active"' : '') + '><td>' + C.fmt(x.start, true) + '</td><td>' + C.fmtShort(x.fertileStart) + ' – ' + C.fmtShort(x.fertileEnd) + '</td><td>' + C.fmtShort(x.ovulation) + '</td><td>' + C.fmtShort(x.next) + '</td></tr>'; });
		$('cy-tbl').innerHTML = tt;
		renderCal(m);
	}
	function perEvents() {
		var m = build(), ev = []; if (!m) return ev;
		m.rows.slice(m.cur, m.cur + 12).forEach(function (x, i) { var s = i === 0 ? x.next : x.next; ev.push({ start: s, end: s + S.plen - 1, title: 'Expected period', note: 'Expected period from mes.fm/period-calculator. An estimate.' }); });
		return ev;
	}

	/* ---------- due date page ---------- */
	function dueModel() {
		var d = S.dd, edd = null, how = '';
		if (S.dm === 'lmp') { if (d == null) return null; edd = C.dueFromLMP(d, S.dcycle); how = 'first day of last period ' + C.fmtShort(d) + (S.dcycle !== 28 ? ', ' + S.dcycle + '-day cycle' : ''); }
		else if (S.dm === 'conc') { if (d == null) return null; edd = C.dueFromConception(d); how = 'conception on ' + C.fmtShort(d); }
		else if (S.dm === 'ivf') { if (d == null) return null; edd = C.dueFromTransfer(d, S.demb); how = S.demb + '-day embryo transfer on ' + C.fmtShort(d); }
		else if (S.dm === 'scan') { if (d == null) return null; edd = C.dueFromUltrasound(d, S.dgw, S.dgd); how = 'scan on ' + C.fmtShort(d) + ' at ' + S.dgw + 'w' + S.dgd + 'd'; }
		else { if (d == null) return null; edd = d; how = 'the due date you entered'; }
		return { edd: edd, how: how };
	}
	function renderDue() {
		var mdl = dueModel(), out = $('cy-due-out'), msg = '';
		var lab = { lmp: 'First day of your last period', conc: 'Date of conception', ivf: 'Embryo transfer date', scan: 'Date of the scan', due: 'Your due date' }[S.dm];
		$('cy-d-date-l').textContent = lab; $('cy-d-lmp-row').hidden = S.dm !== 'lmp'; $('cy-d-ivf-row').hidden = S.dm !== 'ivf'; $('cy-d-scan-row').hidden = S.dm !== 'scan';
		if (!mdl) { out.hidden = true; return; }
		var edd = mdl.edd, g = C.gestation(edd, TODAY), lmpEq = C.lmpFromDue(edd);
		if (S.dm === 'lmp' && S.dd > TODAY + 1) msg = 'That date is in the future. Enter the first day of your last period.';
		else if (g.days < -7 || g.days > 300) msg = g.days < 0 ? 'This is a future pregnancy: today is before the start date.' : 'That date is more than 42 weeks ago, so this is not a current pregnancy. The dates below still show the full timeline.';
		$('cy-d-msg').innerHTML = msg; out.hidden = false;
		$('cy-due-big').textContent = C.fmt(edd);
		var tri = ['', 'first', 'second', 'third'][g.trimester], pregnant = g.days >= 0 && g.days <= 300;
		$('cy-due-sub').innerHTML = pregnant ? (g.days <= 280 ? 'You are <b>' + g.weeks + ' weeks ' + plural(g.rem, 'day') + '</b> pregnant · ' + tri + ' trimester<br>' + (g.toGo > 0 ? plural(g.toGo, 'day') + ' to go (' + Math.floor(g.toGo / 7) + ' weeks ' + plural(g.toGo % 7, 'day') + ')' : 'Today is your due date') : 'Your due date was ' + rel(edd)) : 'Based on ' + esc(mdl.how);
		$('cy-prog-fill').style.width = Math.round(g.pct * 100) + '%';
		var cw = C.conceptionWindow(edd);
		$('cy-due-stats').innerHTML =
			stat('Pregnant for', pregnant ? g.weeks + 'w ' + g.rem + 'd' : '—', pregnant ? Math.round(g.days / 30.44 * 10) / 10 + ' months' : '', true) +
			stat('Trimester', pregnant ? g.trimester + ' of 3' : '—', 'Second begins ' + C.fmtShort(lmpEq + 98) + ', third ' + C.fmtShort(lmpEq + 196)) +
			stat('Conceived around', C.fmt(cw.likely, true), 'sex between ' + C.fmtShort(cw.from) + ' and ' + C.fmtShort(cw.to) + ' is possible') +
			stat('Counts as full term', C.fmtShort(lmpEq + 259) + ' – ' + C.fmtShort(edd + 6), '37 weeks to 40 weeks 6 days');
		var ms = C.milestones(edd), t = '<tr><th>Week</th><th>Date</th><th>What happens</th></tr>';
		ms.forEach(function (x) { t += '<tr' + (x.w === 40 ? ' class="is-active"' : '') + '><td>' + x.w + '</td><td>' + C.fmt(x.day, true) + (pregnant && x.day < TODAY ? ' ✓' : '') + '</td><td class="cy-wrap">' + esc(x.label) + '</td></tr>'; });
		$('cy-ms').innerHTML = t;
		var w = '<tr><th>Week</th><th>Starts</th><th>Ends</th></tr>', i; for (i = 1; i <= 42; i++) w += '<tr' + (pregnant && g.weeks + 1 === i ? ' class="is-active"' : '') + '><td>' + i + '</td><td>' + C.fmt(lmpEq + (i - 1) * 7, true) + '</td><td>' + C.fmt(lmpEq + i * 7 - 1, true) + '</td></tr>';
		$('cy-weeks').innerHTML = w;
	}
	function dueEvents() { var mdl = dueModel(); if (!mdl) return []; return C.milestones(mdl.edd).map(function (x) { return { start: x.day, title: (x.w === 40 ? 'Due date' : 'Week ' + x.w) + ': ' + x.label.split(':')[0].replace(/ \(.*/, ''), note: x.label + '. An estimate from mes.fm/due-date-calculator, not medical advice.' }; }); }

	/* ---------- wiring ---------- */
	function setLmp(day) { $('cy-lmp').value = C.iso(day); readInputs(); calStart = null; renderAll(); }
	function renderAll() { if (VIEW === 'ov') renderOv(); else if (VIEW === 'per') renderPer(); else renderDue(); }
	function curLink(extra) { var q = []; if (VIEW === 'due') { q.push('m=' + S.dm); if (S.dd != null) q.push('d=' + C.iso(S.dd)); if (S.dm === 'lmp') q.push('c=' + S.dcycle); if (S.dm === 'ivf') q.push('e=' + S.demb); if (S.dm === 'scan') q.push('gw=' + S.dgw, 'gd=' + S.dgd); } else { if (S.lmp != null) q.push('lmp=' + C.iso(S.lmp)); q.push('cycle=' + S.cycle); if (S.luteal !== 14) q.push('luteal=' + S.luteal); if (S.plen !== 5) q.push('plen=' + S.plen); if (S.lh != null) q.push('lh=' + C.iso(S.lh)); if (S.vary) q.push('min=' + S.short, 'max=' + S.long); } return location.origin + location.pathname + '?' + q.join('&'); }

	if (VIEW !== 'due') {
		['cy-lmp', 'cy-cycle', 'cy-vary', 'cy-short', 'cy-long', 'cy-plen', 'cy-luteal', 'cy-lh', 'cy-mon'].forEach(function (id) { $(id).addEventListener('input', function () { readInputs(); if (id === 'cy-lmp') calStart = null; renderAll(); }); $(id).addEventListener('change', function () { readInputs(); renderAll(); }); });
		$('cy-lmp-today').onclick = function () { setLmp(TODAY); }; $('cy-lmp-7').onclick = function () { setLmp(TODAY - 7); }; $('cy-lmp-14').onclick = function () { setLmp(TODAY - 14); }; $('cy-lmp-28').onclick = function () { setLmp(TODAY - 28); };
		$('cy-cm').onclick = function () { $('cy-cycle').value = Math.max(18, num('cy-cycle', 18, 60, 28) - 1); readInputs(); renderAll(); };
		$('cy-cp').onclick = function () { $('cy-cycle').value = Math.min(60, num('cy-cycle', 18, 60, 28) + 1); readInputs(); renderAll(); };
		$('cy-lh-clear').onclick = function () { $('cy-lh').value = ''; readInputs(); renderAll(); };
		root.querySelector('.cy-adv').addEventListener('toggle', function () {});
	}
	if (VIEW === 'ov') {
		$('cy-ov-ics').onclick = function () { var e = ovEvents(); if (!e.length) return toast('Enter your last period first'); download('fertile-window-and-ovulation.ics', C.ics(e, 'Fertile window and ovulation'), 'text/calendar'); toast('Calendar file downloaded'); };
		$('cy-ov-copy').onclick = function () { copy(ovText(), 'Result copied'); };
		$('cy-ov-link').onclick = function () { copy(curLink(), 'Link copied (it contains your dates)'); };
	}
	if (VIEW === 'per') {
		$('cy-per-ics').onclick = function () { var e = perEvents(); if (!e.length) return toast('Enter your last period first'); download('expected-periods.ics', C.ics(e, 'Expected periods'), 'text/calendar'); toast('Calendar file downloaded'); };
		$('cy-per-copy').onclick = function () { var m = build(); if (!m) return; var r = m.rows[m.cur]; copy('Next period: ' + C.fmt(r.next) + '\nFertile window: ' + C.fmtShort(r.fertileStart) + ' – ' + C.fmtShort(r.fertileEnd) + '\n(Estimate from mes.fm/period-calculator)', 'Result copied'); };
		function addLog(day) { if (day == null) return toast('Pick a date first'); if (day > TODAY + 1) return toast('That date is in the future'); if (S.starts.indexOf(day) >= 0) return toast('Already in your log'); S.starts = C.sortStarts(S.starts.concat([day])); applyLog(true); save(); }
		function applyLog(adopt) {
			var st = logStats(), last = S.starts.length ? S.starts[S.starts.length - 1] : null;
			if (last != null && (adopt || S.lmp == null)) { S.lmp = last; $('cy-lmp').value = C.iso(last); calStart = null; }
			if (st && st.count >= 2 && adopt) { S.cycle = st.avgRound; $('cy-cycle').value = S.cycle; $('cy-cycle-hint').textContent = 'Set from your log (average of the last ' + Math.min(6, st.count) + ' cycles). You can still change it.'; }
			readInputs(); renderAll();
		}
		$('cy-log-add').onclick = function () { addLog($('cy-log-d').value ? C.parseISO($('cy-log-d').value) : null); $('cy-log-d').value = ''; };
		$('cy-log-cur').onclick = function () { addLog(S.lmp); };
		$('cy-log').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-del]'); if (!b) return; var d = +b.getAttribute('data-del'); S.starts = S.starts.filter(function (x) { return x !== d; }); save(); applyLog(true); });
		$('cy-log-use').onclick = function () { var st = logStats(); if (!st) return; $('cy-cycle').value = st.avgRound; readInputs(); renderAll(); toast('Using ' + st.avgRound + ' days'); };
		$('cy-log-csv').onclick = function () { copy(C.sortStarts(S.starts).map(C.iso).join('\n'), 'Log copied'); };
		$('cy-log-clear').onclick = function () { if (!confirm('Remove all ' + S.starts.length + ' logged periods from this browser?')) return; S.starts = []; save(); renderAll(); };
	}
	if (VIEW === 'due') {
		var inputs = ['cy-method', 'cy-d-date', 'cy-d-cycle', 'cy-d-emb', 'cy-d-gw', 'cy-d-gd'];
		function readDue() { S.dm = $('cy-method').value; S.dd = $('cy-d-date').value ? C.parseISO($('cy-d-date').value) : null; S.dcycle = num('cy-d-cycle', 18, 60, 28); S.demb = num('cy-d-emb', 3, 6, 5); S.dgw = num('cy-d-gw', 4, 42, 8); S.dgd = num('cy-d-gd', 0, 6, 0); save(); }
		inputs.forEach(function (id) { $(id).addEventListener('input', function () { readDue(); renderDue(); }); $(id).addEventListener('change', function () { readDue(); renderDue(); }); });
		$('cy-d-today').onclick = function () { $('cy-d-date').value = C.iso(TODAY); readDue(); renderDue(); };
		$('cy-due-ics').onclick = function () { var e = dueEvents(); if (!e.length) return toast('Enter a date first'); download('pregnancy-milestones.ics', C.ics(e, 'Pregnancy milestones'), 'text/calendar'); toast('Calendar file downloaded'); };
		$('cy-due-copy').onclick = function () { var mdl = dueModel(); if (!mdl) return; var g = C.gestation(mdl.edd, TODAY); copy('Due date: ' + C.fmt(mdl.edd) + (g.days >= 0 && g.days <= 294 ? '\nToday: ' + g.weeks + ' weeks ' + g.rem + ' days' : '') + '\n(Estimate from mes.fm/due-date-calculator)', 'Result copied'); };
		$('cy-due-link').onclick = function () { copy(curLink(), 'Link copied (it contains your dates)'); };
	}

	/* ---------- start: saved state, then ?query overrides ---------- */
	var q = new URLSearchParams(location.search), pd = function (k) { return q.get(k) ? C.parseISO(q.get(k)) : null; };
	if (VIEW === 'due') {
		var qd = pd('d'); if (q.get('m') || qd != null) { S.dm = ['lmp', 'conc', 'ivf', 'scan', 'due'].indexOf(q.get('m')) >= 0 ? q.get('m') : S.dm; if (qd != null) S.dd = qd; if (q.get('c')) S.dcycle = +q.get('c') || 28; if (q.get('e')) S.demb = +q.get('e') || 5; if (q.get('gw')) S.dgw = +q.get('gw') || 8; if (q.get('gd')) S.dgd = +q.get('gd') || 0; }
		$('cy-method').value = S.dm; if (S.dd != null) $('cy-d-date').value = C.iso(S.dd); $('cy-d-cycle').value = S.dcycle; $('cy-d-emb').value = String(S.demb); $('cy-d-gw').value = S.dgw; $('cy-d-gd').value = S.dgd;
		if (S.dd == null && S.lmp != null && S.dm === 'lmp') { S.dd = S.lmp; $('cy-d-date').value = C.iso(S.dd); S.dcycle = S.cycle; $('cy-d-cycle').value = S.dcycle; }
		renderDue();
	} else {
		if (pd('lmp') != null) S.lmp = pd('lmp'); if (q.get('cycle')) S.cycle = Math.max(18, Math.min(60, +q.get('cycle') || 28)); if (q.get('luteal')) S.luteal = Math.max(8, Math.min(18, +q.get('luteal') || 14)); if (q.get('plen')) S.plen = Math.max(1, Math.min(12, +q.get('plen') || 5)); if (pd('lh') != null) S.lh = pd('lh');
		if (q.get('min') && q.get('max')) { S.vary = true; S.short = +q.get('min') || 26; S.long = +q.get('max') || 32; }
		if (VIEW === 'per' && S.starts.length && (S.lmp == null || S.lmp < S.starts[S.starts.length - 1])) S.lmp = S.starts[S.starts.length - 1];
		writeInputs(); readInputs(); renderAll();
		if (VIEW === 'per' && S.starts.length >= 2 && S.cycle === 28 && !q.get('cycle')) { var st0 = logStats(); if (st0) { S.cycle = st0.avgRound; $('cy-cycle').value = S.cycle; readInputs(); renderAll(); } }
	}
})();
