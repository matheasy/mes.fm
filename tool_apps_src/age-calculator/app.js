/* MES Age Calculator UI. Maths = AG (lib.js) on top of the Days Between Dates library DC (prepended by build_tool_apps.py). */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-age-calculator:v1', DAY = AG.DAY;
	var st = { dob: '', order: '', rule: 'end', time: '', tz: '', live: false, people: [], pa: '', pb: '' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in st) st[k] = sv[k]; } catch (e) {}
	if (!Array.isArray(st.people)) st.people = [];
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	if (!st.order) { var lang = (navigator.language || 'en-US'); st.order = /^en-(US|PH)|^en$/i.test(lang) || /-(US|FM|PW|MH)$/i.test(lang) ? 'mdy' : 'dmy'; }
	var localTz = 'UTC'; try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}

	var toastT;
	function toast(msg, act) {
		var t = $('ag-toast'); t.innerHTML = esc(msg) + (act ? ' <button type="button" class="ag-undo">' + esc(act[0]) + '</button>' : ''); t.classList.add('tu-toast--show');
		if (act) { t.style.pointerEvents = 'auto'; t.querySelector('button').onclick = function () { act[1](); t.classList.remove('tu-toast--show'); }; }
		clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); t.style.pointerEvents = ''; }, act ? 5000 : 1600);
	}
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
	}
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function stat(label, value, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function n0(v) { return Math.floor(v).toLocaleString('en-US'); }
	function n2(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
	function pl(v, w) { return n0(v) + ' ' + w + (v === 1 ? '' : 's'); }
	function today() { var d = new Date(); return AG.dayNum(d.getFullYear(), d.getMonth(), d.getDate()); }
	function inDays(k) { return k === 0 ? 'today' : k === 1 ? 'tomorrow' : k === -1 ? 'yesterday' : k > 0 ? 'in ' + pl(k, 'day') : pl(-k, 'day') + ' ago'; }

	/* ---------- typed dates ---------- */
	function parse(s) {
		var r = AG.parseDate(s, st.order);
		if (r) return r;
		if (window.MESWhen && String(s || '').trim()) {          // words: "yesterday", "last friday", "Oct 28" ...
			try { var w = MESWhen.parse(s, { futureOnly: false, order: st.order }); if (w && w.ok && w.date) { r = AG.parseDate(w.date); if (r) return r; } } catch (e) {}
		}
		return null;
	}
	function showParsed(inp, out, r, emptyMsg) {
		var t = inp.value.trim();
		inp.classList.toggle('ag-bad', !!t && !r);
		inp.setAttribute('aria-invalid', t && !r ? 'true' : 'false');
		if (!t) { out.innerHTML = emptyMsg || ''; return; }
		if (!r) { out.innerHTML = '<span class="ag-err">Could not read that date. Try 1990-03-15 or March 15, 1990.</span>'; return; }
		out.innerHTML = '= <strong>' + esc(AG.text(r.n)) + '</strong>' + (r.ambiguous ? ' <span class="ag-warn">(read as ' + (st.order === 'dmy' ? 'day/month' : 'month/day') + ': change it below)</span>' : '') + (r.note ? ' <span class="tu-note">' + esc(r.note) + '</span>' : '');
	}
	function wirePick(inp, pick, after) {
		var btn = pick.previousElementSibling;
		pick.addEventListener('click', function () { try { if (pick.showPicker) pick.showPicker(); } catch (e) {} });
		pick.addEventListener('change', function () { if (pick.value) { var r = AG.parseDate(pick.value); if (r) { inp.value = AG.plain(r.n); after(); } } });
		void btn;
	}

	/* ---------- zones ---------- */
	var zones = [localTz]; try { if (Intl.supportedValuesOf) zones = zones.concat(Intl.supportedValuesOf('timeZone').filter(function (z) { return z !== localTz; })); } catch (e) {}
	if (zones.indexOf('UTC') < 0) zones.push('UTC');
	$('ag-tz').innerHTML = zones.map(function (z, i) { return '<option value="' + esc(z) + '">' + esc(z.replace(/_/g, ' ')) + (i === 0 ? ' (your time zone)' : '') + '</option>'; }).join('');

	/* ---------- current inputs ---------- */
	var Q = AG.fromQuery(location.search), onDay = null;
	if (Q.d != null) { st.dob = AG.iso(Q.d); }
	if (Q.t != null) { st.time = AG.pad(Math.floor(Q.t / 60)) + ':' + AG.pad(Q.t % 60); st.tz = Q.tz || st.tz; }
	if (Q.rule) st.rule = Q.rule;
	if (Q.on != null) onDay = Q.on;
	$('ag-order').value = st.order;
	if (st.dob) { var r0 = AG.parseDate(st.dob) || parse(st.dob); $('ag-dob').value = r0 ? AG.plain(r0.n) : st.dob; }
	if (onDay != null) $('ag-on').value = AG.plain(onDay);
	if (st.time) { $('ag-time').value = st.time; $('ag-timebox').open = true; }
	if (st.tz && zones.indexOf(st.tz) >= 0) $('ag-tz').value = st.tz;
	$('ag-live').checked = !!st.live;
	$('ag-pa').value = st.pa || ''; $('ag-pb').value = st.pb || '';

	function birthInstant(b) {                                   // UTC ms of the birth (time + zone), or local midnight of the birth day
		var p = AG.fromDay(b), t = AG.parseTime($('ag-time').value);
		if (t != null) return { ms: AG.wallToUtc(AG.utcMs(p.y, p.m, p.d, Math.floor(t / 60), t % 60, 0), $('ag-tz').value || localTz), exact: true, t: t };
		return { ms: new Date(p.y, p.m, p.d).getTime(), exact: false, t: null };
	}

	/* ---------- render ---------- */
	var cur = null, liveTimer = 0, showAllMiles = false;
	function render() {
		var dr = parse($('ag-dob').value), onT = $('ag-on').value.trim(), or = onT ? parse(onT) : null, td = today();
		showParsed($('ag-dob'), $('ag-dob-out'), dr);
		showParsed($('ag-on'), $('ag-on-out'), or, 'Today, <strong>' + esc(AG.text(td)) + '</strong>');
		var on = or ? or.n : td, isToday = on === td;
		$('ag-rulebox').hidden = !(dr && dr.d >= 29);
		[].forEach.call($('ag-rule').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-r') === st.rule)); });
		if (dr) { st.dob = AG.iso(dr.n); save(); }
		$('ag-empty').hidden = !!dr; $('ag-res').hidden = !dr;
		if (!dr) { cur = null; stopLive(); return; }
		var b = dr.n, rule = st.rule, a = AG.age(b, on, rule);
		cur = { b: b, on: on, isToday: isToday, rule: rule };
		var p = AG.fromDay(b);
		if (!a) {           // the "age on" date is before the birth
			$('ag-lead').textContent = 'Not born yet on that date';
			$('ag-big').textContent = AG.ymdText(AG.age(on, b, rule)) + ' to go';
			$('ag-sub').innerHTML = 'Born ' + esc(AG.text(b)) + '; the "Age on" date is ' + esc(AG.text(on)) + '.';
			['ag-totals', 'ag-bdays', 'ag-born'].forEach(function (id) { $(id).innerHTML = ''; });
			$('ag-leap').hidden = true; stopLive(); renderDiff(); renderPeople(); return;
		}
		$('ag-lead').textContent = isToday ? 'You are' : (on < td ? 'On ' + AG.plain(on) + ' you were' : 'On ' + AG.plain(on) + ' you will be');
		$('ag-big').innerHTML = '<span class="ag-y">' + pl(a.years, 'year') + '</span> <span class="ag-md">' + pl(a.months, 'month') + ', ' + pl(a.days, 'day') + '</span>';
		var nb = AG.nextBirthday(b, on, rule);
		$('ag-sub').innerHTML = 'Born on a <strong>' + AG.DAYS[p.dow] + '</strong>, ' + esc(AG.plain(b)) + '. ' + (nb.today ? '<strong>Happy birthday!</strong> ' + (isToday ? 'Today' : 'That day') + ' is birthday number ' + nb.turning + '.' : 'Next birthday ' + inDays(nb.days) + ', on a ' + AG.DAYS[nb.dow] + '.');
		renderLeap(b, on, rule);
		renderTotals();
		renderBirthdays(b, on, rule, a, nb);
		renderBorn(b, dr);
		renderMiles(b, on, rule);
		renderYear(); renderUnits(b, on, a);
		renderDiff(); renderPeople();
		history.replaceState(null, '', location.pathname + AG.toQuery({ d: b, on: isToday ? null : on, t: birthInstant(b).t, tz: $('ag-tz').value, rule: rule }) + location.hash);
		if ($('ag-live').checked && isToday) startLive(); else stopLive();
	}
	function renderLeap(b, on, rule) {
		var box = $('ag-leap'), p = AG.fromDay(b);
		if (!AG.isFeb29(b)) {
			if (p.d >= 29) { box.hidden = false; box.innerHTML = 'Born on the ' + p.d + 'th: in months with fewer days your month-birthday counts on <strong>' + (rule === 'next' ? 'the 1st of the next month' : 'the last day of the month') + '</strong> (you can switch that above). Your yearly birthday is not affected' + (p.m === 1 || [3, 5, 8, 10].indexOf(p.m) >= 0 ? '' : '') + '.'; }
			else box.hidden = true;
			return;
		}
		var y = AG.fromDay(on).y, ny = AG.nextBirthday(b, on, rule), real = AG.leapBirthdays(b, on), nextLeap = y; while (!DC.isLeap(nextLeap) || AG.dayNum(nextLeap, 1, 29) < on) nextLeap++;
		var e = AG.birthdayIn(b, AG.fromDay(ny.n).y, 'end'), x = AG.birthdayIn(b, AG.fromDay(ny.n).y, 'next');
		box.hidden = false;
		box.innerHTML = '<strong>A leap-day birthday.</strong> You have had <strong>' + pl(real, 'real 29 February') + '</strong> so far (a "leap age" of ' + real + '). ' +
			(e === x ? 'Your next birthday is a real 29 February: <strong>' + esc(AG.text(e)) + '</strong>.' :
				'Your next birthday is in a common year, so it is either <strong>' + esc(AG.text(e)) + '</strong> (last day of February) or <strong>' + esc(AG.text(x)) + '</strong> (the day after 28 February). Laws differ: Hong Kong, for example, counts 1 March; rules that count to the last day of the month give 28 February. The next real 29 February is ' + esc(AG.plain(AG.dayNum(nextLeap, 1, 29))) + '.') +
			' The ages here use <strong>' + (rule === 'next' ? '1 March' : '28 February') + '</strong>.';
	}
	function totalsAt() {                                        // elapsed ms for the hours / minutes / seconds tiles
		var bi = birthInstant(cur.b), end;
		if (cur.isToday) end = Date.now();
		else { var p = AG.fromDay(cur.on), t = bi.t || 0; end = bi.exact ? AG.wallToUtc(AG.utcMs(p.y, p.m, p.d, Math.floor(t / 60), t % 60, 0), $('ag-tz').value || localTz) : new Date(p.y, p.m, p.d).getTime(); }
		return { ms: Math.max(0, end - bi.ms), exact: bi.exact };
	}
	function renderTotals() {
		if (!cur) return;
		var a = AG.age(cur.b, cur.on, cur.rule); if (!a) return;
		var T = totalsAt(), s = T.ms / 1000, yrs = a.totalDays / AG.YEAR;
		$('ag-totals').innerHTML =
			stat('Years', n2(yrs), pl(a.years, 'whole year'), true) +
			stat('Months', n0(a.totalMonths), a.days ? 'and ' + pl(a.days, 'day') : 'exactly') +
			stat('Weeks', n0(a.weeks), a.weekDays ? 'and ' + pl(a.weekDays, 'day') : 'exactly') +
			stat('Days', n0(a.totalDays), 'counting ' + (cur.isToday ? 'to today' : 'to ' + AG.plain(cur.on))) +
			stat('Hours', n0(s / 3600), T.exact ? 'from your time of birth' : 'from midnight on your birth day') +
			stat('Minutes', n0(s / 60), '') +
			'<div class="tu-stat"><div class="tu-stat__label">Seconds</div><div class="tu-stat__value" id="ag-secs">' + n0(s) + '</div><div class="tu-stat__sub">about ' + n2(s / 1e9) + ' billion</div></div>';
		$('ag-tnote').textContent = T.exact ? 'Hours, minutes and seconds count real time from ' + $('ag-time').value + ' in ' + ($('ag-tz').value || localTz).replace(/_/g, ' ') + ', daylight saving included.'
			: 'Add your time of birth (above) for exact hours, minutes and seconds; for now they count from midnight at the start of your birth day in your time zone.';
		$('ag-live').parentNode.hidden = !cur.isToday;
	}
	function startLive() {
		if (liveTimer) return;
		liveTimer = setInterval(function () { if (!cur || document.hidden) return; var el = $('ag-secs'); if (el) el.textContent = n0(totalsAt().ms / 1000); }, 1000);
	}
	function stopLive() { clearInterval(liveTimer); liveTimer = 0; }
	function renderBirthdays(b, on, rule, a, nb) {
		var hb = AG.nextHalfBirthday(b, on, rule), last = AG.birthdayIn(b, AG.fromDay(nb.n).y - 1, rule);
		if (nb.today) last = nb.n;
		$('ag-bdays').innerHTML =
			stat('Next birthday', nb.today ? 'Today!' : pl(nb.days, 'day'), (nb.today ? 'Birthday number ' : 'Turning ') + nb.turning + ' on <strong>' + AG.DAYS[nb.dow] + '</strong>, ' + esc(AG.plain(nb.n)) + (nb.today ? '' : ' (' + pl(Math.floor(nb.days / 7), 'week') + ', ' + pl(nb.days % 7, 'day') + ')'), true) +
			stat('Half birthday', hb.days === 0 ? 'Today' : pl(hb.days, 'day'), n2(hb.age, 1) + ' on ' + AG.DAYS[AG.fromDay(hb.n).dow] + ', ' + esc(AG.plain(hb.n))) +
			stat('Birthdays so far', n0(a.years), 'plus the day you were born');
		var span = nb.today ? 1 : nb.n - last, done = nb.today ? 1 : (on - last) / span;
		$('ag-barfill').style.width = (done * 100).toFixed(1) + '%';
		$('ag-bar').setAttribute('aria-label', Math.round(done * 100) + '% of the way to the next birthday');
		$('ag-barnote').textContent = nb.today ? 'It is your birthday!' : Math.round(done * 100) + '% of the way from your last birthday (' + AG.plain(last) + ') to the next one.';
	}
	function renderBorn(b, dr) {
		var p = AG.fromDay(b), sg = AG.sunSign(p.m, p.d), cn = AG.chinese(b), gen = AG.generation(p.y), doy = b - AG.dayNum(p.y, 0, 1) + 1, yl = DC.isLeap(p.y) ? 366 : 365;
		$('ag-born').innerHTML =
			stat('Weekday', AG.DAYS[p.dow], 'Day ' + doy + ' of ' + yl + ' in ' + p.y + (DC.isLeap(p.y) ? ' (a leap year)' : '')) +
			stat('Star sign', '<span class="ag-glyph">' + sg.glyph + '︎</span> ' + sg.name, sg.cusp ? 'On the change between two signs: the exact sign depends on the year and time (see the birth chart).' : 'Western (tropical) zodiac, usual dates') +
			stat('Chinese zodiac', cn.element + ' ' + cn.animal, cn.exact ? (cn.beforeLny ? 'Born before Chinese New Year ' + p.y + ', so the animal of ' + cn.year : 'Year began ' + esc(AG.plain(cn.lny))) : 'By year only (New Year dates are known for 1900-2100)') +
			(gen ? stat('Generation', gen[2], gen[0] + '&ndash;' + gen[1] + ' (Pew Research ranges; others differ by a few years)') : '');
		var md = AG.pad(p.m + 1) + '-' + AG.pad(p.d);
		$('ag-bornlinks').innerHTML = '<a href="/zodiac?d=' + AG.iso(b) + '">Full birth chart</a><a href="/birthday-personality?m=' + (p.m + 1) + '&amp;d=' + p.d + '&amp;y=' + p.y + '">Birthday personality</a><a href="/birthday?d=' + md + '">Famous people born on ' + AG.MONTHS[p.m] + ' ' + p.d + '</a>';
		void dr;
	}
	function msText(ms) { var d = new Date(ms); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
	function renderMiles(b, on, rule) {
		var bi = birthInstant(b), L = AG.milestones(b, rule, bi.ms), td = today();
		var nextI = -1; L.forEach(function (m, i) { var dn = m.ms != null ? localDay(m.ms) : m.n; m.dn = dn; if (nextI < 0 && dn >= on) nextI = i; });
		var rows = L.map(function (m, i) {
			var show = showAllMiles || (i >= nextI - 2 && i < nextI + 6) || (nextI < 0 && i >= L.length - 4);
			if (!show) return '';
			var date = m.ms != null ? (bi.exact ? msText(m.ms) : AG.text(m.dn, true) + ' (around)') : AG.text(m.n, true);
			return '<tr' + (i === nextI ? ' class="is-active"' : '') + (m.dn < on ? ' class="ag-past"' : '') + '><td>' + esc(m.label) + '</td><td>' + esc(date) + '</td><td>' + (m.dn - td === 0 ? '<strong>today!</strong>' : inDays(m.dn - td)) + '</td></tr>';
		}).join('');
		$('ag-miles').querySelector('tbody').innerHTML = rows;
		$('ag-miles-all').textContent = showAllMiles ? 'Show fewer' : 'Show all ' + L.length + ' milestones';
		$('ag-miles-all').setAttribute('aria-expanded', String(showAllMiles));
	}
	function localDay(ms) { var d = new Date(ms); return AG.dayNum(d.getFullYear(), d.getMonth(), d.getDate()); }
	function renderYear() {
		if (!cur) return;
		var py = AG.fromDay(cur.b).y, ty = AG.fromDay(today()).y, v = $('ag-year').value.trim(), Y = /^\d{4}$/.test(v) ? +v : null;
		$('ag-years').innerHTML = [ty + 1, ty + 5, ty + 10, 2050, 2100].filter(function (y, i, a) { return y > py && a.indexOf(y) === i; }).map(function (y) { return '<button type="button" class="tu-chip" data-y="' + y + '">' + y + '</button>'; }).join('');
		if (Y == null) { $('ag-yearout').innerHTML = '<span class="tu-note">Type a year to see your age then.</span>'; return; }
		var r = AG.ageInYear(cur.b, Y, cur.rule);
		if (!r) { $('ag-yearout').textContent = Y === py ? 'That is the year you were born.' : 'That is before you were born.'; return; }
		var past = r.birthday < today();
		$('ag-yearout').innerHTML = 'In ' + Y + ' you ' + (past ? 'turned' : 'turn') + ' <strong>' + r.turning + '</strong> on ' + esc(AG.text(r.birthday)) + '. You ' + (past ? 'were' : 'will be') + ' ' + r.jan1 + ' on 1 January and ' + r.dec31 + ' on 31 December.';
	}
	function renderUnits(b, on, a) {
		var days = a.totalDays, yrs = days / AG.YEAR, td = today();
		$('ag-planets').querySelector('tbody').innerHTML = AG.planetAges(days, b).map(function (p) {
			var per = p.period < 1000 ? n2(p.period, 0) + ' Earth days' : n2(p.period / 365.25, 1) + ' Earth years';
			return '<tr' + (p.name === 'Earth' ? ' class="is-active"' : '') + '><td>' + p.name + '</td><td>' + per + '</td><td>' + n2(p.age, p.age < 10 ? 2 : 1) + '</td><td>' + (p.nextAge + ' on ' + esc(AG.plain(p.next))) + (p.next - td < 36600 ? ' <span class="tu-note">(' + inDays(p.next - td) + ')</span>' : '') + '</td></tr>';
		}).join('');
		var dog = yrs >= 31 ? AG.dogFromHuman(yrs) : null;
		$('ag-dog').innerHTML = '<p style="margin-top:0;">Old rule of thumb (1 dog year = 7 human years): a dog as "old" as you would be <strong>' + n2(yrs / 7, 1) + '</strong> years old.' +
			(dog ? ' With the newer formula <em>human age = 16 &times; ln(dog age) + 31</em> (Wang et al., 2019, fitted on Labradors, approximate) it would be about <strong>' + n2(dog, 1) + '</strong>.' : ' The newer formula (<em>human age = 16 &times; ln(dog age) + 31</em>) starts at 31 "human years" for a one-year-old dog, so it does not apply to ages under 31.') + '</p>';
		renderDog();
		void on;
	}
	function renderDog() {
		var v = parseFloat(String($('ag-dogage').value).replace(',', '.'));
		if (!(v > 0) || v > 40) { $('ag-dogout').innerHTML = '<span class="tu-note">Type your dog\'s age to convert it.</span>'; return; }
		var h = AG.humanFromDog(v);
		$('ag-dogout').innerHTML = v < 1 ? 'Under one year the formula is not reliable (puppies grow up very fast). Old rule: about <strong>' + n2(v * 7, 1) + '</strong> human years.' :
			'About <strong>' + n2(h, 0) + '</strong> in human years by the formula (16 &times; ln(' + n2(v, v % 1 ? 1 : 0) + ') + 31), or ' + n2(v * 7, 0) + ' by the old &times;7 rule.';
	}

	/* ---------- two people ---------- */
	function renderDiff() {
		var ra = parse($('ag-pa').value), rb = parse($('ag-pb').value), out = $('ag-diffout');
		showParsed($('ag-pa'), $('ag-pa-out'), ra); showParsed($('ag-pb'), $('ag-pb-out'), rb);
		st.pa = $('ag-pa').value; st.pb = $('ag-pb').value; save();
		if (!ra || !rb) { out.innerHTML = '<p class="tu-note">Enter two dates of birth (the first is filled in from yours when empty).' + (st.people.length ? ' Or press "Compare" next to someone in My people.' : '') + '</p>'; return; }
		var d = AG.difference(ra.n, rb.n, st.rule), td = today();
		if (d.same) { out.innerHTML = '<p class="ag-diffbig">Same birthday: exactly the same age.</p>'; return; }
		var who = d.older === 'a' ? 'The first person' : 'The second person';
		function row(label, n, extra) { return '<tr><td>' + label + '</td><td>' + esc(AG.text(n, true)) + '</td><td>' + inDays(n - td) + '</td><td>' + extra + '</td></tr>'; }
		var o = Math.min(ra.n, rb.n), y = Math.max(ra.n, rb.n);
		function ages(n) { var ao = AG.age(o, n, st.rule), ay = AG.age(y, n, st.rule); return ao.years + ' and ' + ay.years; }
		out.innerHTML = '<p class="ag-diffbig">' + who + ' is older by <strong>' + esc(AG.ymdText(d.gap)) + '</strong></p>' +
			'<p>That is ' + n0(d.days) + ' days, or ' + n0(Math.floor(d.days / 7)) + ' weeks and ' + pl(d.days % 7, 'day') + '. Together you have lived ' + n0((td - o) + Math.max(0, td - y)) + ' days.</p>' +
			'<div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Moment</th><th>Date</th><th>When</th><th>Ages then</th></tr></thead><tbody>' +
			row('Older one is 3&times; the younger\'s age', d.thrice, ages(d.thrice)) +
			row('Older one is twice the younger\'s age', d.twice, ages(d.twice)) +
			row('Older one is 1.5&times; the younger\'s age', d.half, ages(d.half)) +
			row('Combined age 100 years', d.together(100), ages(d.together(100))) +
			'</tbody></table></div><p class="tu-note">Ages are whole years on that day; "twice the age" is exact to the day.</p>';
	}

	/* ---------- my people ---------- */
	function renderPeople() {
		var td = today(), on = cur ? cur.on : td, tb = $('ag-ptable').querySelector('tbody');
		var list = st.people.map(function (p, i) { var r = AG.parseDate(p.d); return r ? { i: i, name: p.name, b: r.n } : null; }).filter(Boolean);
		list.forEach(function (p) { p.nb = AG.nextBirthday(p.b, td, st.rule); p.a = AG.age(p.b, on, st.rule); });
		list.sort(function (x, y) { return x.nb.days - y.nb.days; });
		$('ag-pempty').hidden = list.length > 0; $('ag-ptable').hidden = !list.length;
		tb.innerHTML = list.map(function (p) {
			return '<tr><td><strong>' + esc(p.name || 'No name') + '</strong></td><td>' + esc(AG.plain(p.b)) + '</td><td>' + (p.a ? esc(AG.ymdText(p.a)) : 'not born yet') + '</td><td>' + (p.nb.today ? '<strong>Today! (' + p.nb.turning + ')</strong>' : inDays(p.nb.days) + ', turning ' + p.nb.turning) + '</td>' +
				'<td class="ag-pact"><button type="button" class="tu-btn tu-btn--ghost" data-open="' + p.i + '">Open</button><button type="button" class="tu-btn tu-btn--ghost" data-cmp="' + p.i + '">Compare</button><button type="button" class="tu-btn tu-btn--ghost" data-del="' + p.i + '" aria-label="Delete ' + esc(p.name || 'this person') + '">&times;</button></td></tr>';
		}).join('');
	}
	function addPerson(name, r) {
		st.people.push({ name: String(name || '').trim().slice(0, 40), d: AG.iso(r.n) }); save(); renderPeople();
		toast('Saved ' + (name || 'this date'));
	}
	$('ag-padd').addEventListener('click', function () {
		var r = parse($('ag-pdob').value);
		if (!r) { showParsed($('ag-pdob'), $('ag-pdob-out'), r); $('ag-pdob').focus(); return; }
		addPerson($('ag-pname').value, r); $('ag-pname').value = ''; $('ag-pdob').value = ''; $('ag-pdob-out').innerHTML = ''; $('ag-pname').focus();
	});
	$('ag-pdob').addEventListener('input', function () { showParsed($('ag-pdob'), $('ag-pdob-out'), parse(this.value)); });
	[$('ag-pname'), $('ag-pdob')].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('ag-padd').click(); }); });
	$('ag-ptable').addEventListener('click', function (e) {
		var t = e.target.closest('button'); if (!t) return;
		if (t.hasAttribute('data-open')) { var p = st.people[+t.getAttribute('data-open')]; var r = AG.parseDate(p.d); $('ag-dob').value = AG.plain(r.n); render(); $('ag-res').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		else if (t.hasAttribute('data-cmp')) { var q = st.people[+t.getAttribute('data-cmp')]; var r2 = AG.parseDate(q.d); if (!$('ag-pa').value.trim() && cur) $('ag-pa').value = AG.plain(cur.b); if ($('ag-pa').value.trim()) $('ag-pb').value = AG.plain(r2.n); else $('ag-pa').value = AG.plain(r2.n); renderDiff(); $('ag-diff').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		else if (t.hasAttribute('data-del')) {
			var i = +t.getAttribute('data-del'), gone = st.people.splice(i, 1)[0]; save(); renderPeople();
			toast('Deleted ' + (gone.name || 'entry'), ['Undo', function () { st.people.splice(i, 0, gone); save(); renderPeople(); }]);
		}
	});

	/* ---------- events ---------- */
	var EX = [['March 15, 1990', 'March 15, 1990'], ['29 Feb 2000', 'Born on a leap day'], ['1/31/1985', 'Born Jan 31'], ['2000-01-01', 'Y2K baby']];
	$('ag-examples').innerHTML = EX.map(function (x) { return '<button type="button" class="tu-chip" data-ex="' + esc(x[0]) + '">' + esc(x[1]) + '</button>'; }).join('');
	$('ag-examples').addEventListener('click', function (e) { var t = e.target.closest('[data-ex]'); if (!t) return; var r = AG.parseDate(t.getAttribute('data-ex'), 'mdy'); $('ag-dob').value = AG.plain(r.n); render(); });
	var deb = 0; function soon() { clearTimeout(deb); deb = setTimeout(render, 180); }
	['ag-dob', 'ag-on'].forEach(function (id) { $(id).addEventListener('input', soon); $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(deb); render(); } }); $(id).addEventListener('blur', function () { var r = parse(this.value); if (r) this.value = AG.plain(r.n); }); });
	wirePick($('ag-dob'), $('ag-dob-pick'), render); wirePick($('ag-on'), $('ag-on-pick'), render);
	$('ag-dob-pick').addEventListener('focus', function () { var r = parse($('ag-dob').value); if (r) this.value = AG.iso(r.n); });
	$('ag-on-pick').addEventListener('focus', function () { var r = parse($('ag-on').value); this.value = AG.iso(r ? r.n : today()); });
	$('ag-today').addEventListener('click', function () { $('ag-on').value = ''; render(); });
	$('ag-order').addEventListener('change', function () { st.order = this.value; save(); render(); });
	$('ag-rule').addEventListener('click', function (e) { var t = e.target.closest('[data-r]'); if (!t) return; st.rule = t.getAttribute('data-r'); save(); render(); });
	function timeChanged() { st.time = $('ag-time').value; st.tz = $('ag-tz').value; save(); render(); }
	$('ag-time').addEventListener('change', timeChanged); $('ag-time').addEventListener('input', timeChanged); $('ag-tz').addEventListener('change', timeChanged);
	$('ag-time-clear').addEventListener('click', function () { $('ag-time').value = ''; timeChanged(); });
	$('ag-live').addEventListener('change', function () { st.live = this.checked; save(); if (this.checked && cur && cur.isToday) startLive(); else stopLive(); });
	$('ag-miles-all').addEventListener('click', function () { showAllMiles = !showAllMiles; if (cur) renderMiles(cur.b, cur.on, cur.rule); });
	$('ag-year').addEventListener('input', renderYear);
	$('ag-years').addEventListener('click', function (e) { var t = e.target.closest('[data-y]'); if (!t) return; $('ag-year').value = t.getAttribute('data-y'); renderYear(); });
	$('ag-dogage').addEventListener('input', renderDog);
	['ag-pa', 'ag-pb'].forEach(function (id) { $(id).addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(renderDiff, 180); }); $(id).addEventListener('blur', function () { var r = parse(this.value); if (r) this.value = AG.plain(r.n); }); });
	$('ag-pa').addEventListener('focus', function () { if (!this.value.trim() && cur) { this.value = AG.plain(cur.b); renderDiff(); this.select(); } });
	$('ag-copy').addEventListener('click', function () {
		if (!cur) return; var a = AG.age(cur.b, cur.on, cur.rule); if (!a) return; var nb = AG.nextBirthday(cur.b, cur.on, cur.rule);
		copy('Born ' + AG.text(cur.b) + '. Age' + (cur.isToday ? '' : ' on ' + AG.plain(cur.on)) + ': ' + AG.ymdText(a) + ' (' + n0(a.totalDays) + ' days, ' + n0(a.weeks) + ' weeks, ' + n0(a.totalMonths) + ' months). Next birthday: ' + AG.text(nb.n) + ', turning ' + nb.turning + '.', 'Result copied');
	});
	$('ag-link').addEventListener('click', function () { copy(location.href, 'Link copied'); });
	$('ag-save').addEventListener('click', function () {
		if (!cur) return; var name = ''; try { name = prompt('Name for this birthday (optional):', '') || ''; } catch (e) {}
		addPerson(name, { n: cur.b });
	});
	document.addEventListener('visibilitychange', function () { if (!document.hidden && cur) renderTotals(); });

	render();
})();
