/* MES Site Traffic & Rank UI. Data = /api/site-traffic (Tranco rank, Wayback history, opt-in tech) + /api/domain-lookup (RDAP age, DNS, hosting); findings = MESTraffic (lib.js) and MESDomain (domain-lookup lib). Rank only, never visit counts. */
(function () {
	'use strict';
	var T = MESTraffic, D = MESDomain, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-site-traffic:v1', cur = null, recent = [];
	try { recent = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) {}
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('st-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function copy(t, m) { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(m); }, function () { toast('Copy failed'); }); else toast('Copy needs a secure page'); }
	function dateOnly(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
	function status(msg, err) { var s = $('st-status'); s.hidden = !msg; s.className = 'st-status' + (err ? ' err' : ''); s.innerHTML = msg || ''; }
	function saveRecent(d) { recent = [d].concat(recent.filter(function (x) { return x !== d; })).slice(0, 8); try { localStorage.setItem(KEY, JSON.stringify(recent)); } catch (e) {} drawRecent(); }
	function drawRecent() { $('st-recent').innerHTML = recent.map(function (d) { return '<button type="button" class="tu-chip" data-d="' + esc(d) + '">' + esc(d) + '</button>'; }).join('') + (recent.length ? '<button type="button" class="tu-chip" data-clear="1">Clear history</button>' : ''); }
	$('st-recent').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.getAttribute('data-clear')) { recent = []; try { localStorage.removeItem(KEY); } catch (x) {} drawRecent(); return; } $('st-q').value = b.getAttribute('data-d'); go(); });
	$('st-go').onclick = go; $('st-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
	function jget(u) { return fetch(u).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
	var busy = false;
	function go() {
		var q = $('st-q').value.trim(); if (!q) return status('Type a website or domain name first.', true); if (busy) return;
		busy = true; $('st-go').disabled = true; $('st-out').hidden = true; status('Checking <b>' + esc(q) + '</b>&hellip;');
		jget('/api/site-traffic?d=' + encodeURIComponent(q)).then(function (x) {
			busy = false; $('st-go').disabled = false;
			if (!x.ok) return status(esc(x.j && x.j.error || 'The check failed. Try again.'), true);
			status(''); cur = { api: x.j, lookup: undefined, wayback: undefined, tech: undefined }; var me = cur;
			saveRecent(x.j.domain); try { history.replaceState(null, '', '?d=' + encodeURIComponent(x.j.domain)); } catch (e) {}
			render(me);
			jget('/api/domain-lookup?d=' + encodeURIComponent(x.j.domain)).then(function (l) { if (cur === me) { me.lookup = l.ok ? l.j : null; render(me); } }).catch(function () { if (cur === me) { me.lookup = null; render(me); } });
			jget('/api/site-traffic?d=' + encodeURIComponent(x.j.domain) + '&only=wayback').then(function (w) { if (cur === me) { me.wayback = w.ok ? w.j.wayback : { unavailable: true }; render(me); } }).catch(function () { if (cur === me) { me.wayback = { unavailable: true }; render(me); } });
		}).catch(function () { busy = false; $('st-go').disabled = false; status('Could not reach the service. Check your connection and try again.', true); });
	}
	function card(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value" style="font-size:1.2em">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function chart(r) {
		var hist = r && r.ranked ? r.history : null, svg = $('st-chart'), box = $('st-chartcard');
		if (!hist || hist.length < 2) { box.hidden = true; return; }
		box.hidden = false; $('st-days').textContent = hist.length;
		var W = 640, H = 200, s = T.spark(hist, W, H, 14), area = s.path + ' L' + s.pts[s.pts.length - 1].x.toFixed(1) + ' ' + H + ' L' + s.pts[0].x.toFixed(1) + ' ' + H + ' Z';
		svg.innerHTML = '<line class="st-grid" x1="0" x2="' + W + '" y1="14" y2="14"></line><line class="st-grid" x1="0" x2="' + W + '" y1="' + (H - 14) + '" y2="' + (H - 14) + '"></line><path class="st-area" d="' + area + '"></path><path class="st-line" d="' + s.path + '"></path><circle class="st-dot" id="st-dot" r="5" cx="-20" cy="-20"></circle>';
		var tip = $('st-tip'), dot = $('st-dot'), wrap = svg.parentNode;
		function at(ev) { var b = svg.getBoundingClientRect(), f = Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)), i = Math.round(f * (s.pts.length - 1)), p = s.pts[i]; dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); tip.hidden = false; tip.textContent = p.date + ': #' + T.fmt(p.rank); tip.style.left = Math.min(Math.max(p.x / W * b.width, 60), b.width - 60) + 'px'; tip.style.top = Math.max(0, p.y / H * b.height - 34) + 'px'; }
		svg.onpointermove = at; svg.onpointerdown = at; svg.onpointerleave = function () { tip.hidden = true; dot.setAttribute('cx', -20); };
	}
	function render(c) {
		var a = c.api, r = a.rank, lk = c.lookup, now = Date.now(); $('st-out').hidden = false;
		$('st-host').textContent = a.domain + (a.apex !== a.domain ? ' (ranked as ' + a.apex + ')' : '');
		if (r.ranked) { var t = T.tier(r.rank); $('st-rank').textContent = '#' + T.fmt(r.rank); $('st-tier').innerHTML = '<b>' + esc(t.label) + '</b> of the Internet &middot; Tranco list of ' + esc(r.date); }
		else if (r.unavailable) { $('st-rank').textContent = '?'; $('st-tier').textContent = 'The rank service is busy. Try again in a minute.'; }
		else { $('st-rank').textContent = 'Unranked'; $('st-tier').textContent = 'Not in the Tranco list of the few million most visited domains.'; }
		$('st-sig').innerHTML = T.signals(a, lk, now).map(function (s) { return '<li class="' + s.level + '">' + (s.level === 'warn' ? '&#9888;&#65039; ' : s.level === 'good' ? '&#10003; ' : '&#8505;&#65039; ') + esc(s.text) + '</li>'; }).join('');
		chart(r);
		var tr = r.ranked ? T.trend(r.history) : null, cards = '';
		if (r.ranked) cards += card('Best rank (' + (tr ? tr.days : 1) + ' days)', '#' + T.fmt(tr ? tr.best.rank : r.rank), tr ? esc(tr.best.date) : '', true) + card('Lowest rank', '#' + T.fmt(tr ? tr.worst.rank : r.rank), tr ? esc(tr.worst.date) : '') + card('Trend', tr ? (tr.dir === 'rising' ? 'Rising &#9650;' : tr.dir === 'falling' ? 'Falling &#9660;' : 'Steady') : '—', tr ? (tr.pct > 0 ? '+' : '') + tr.pct.toFixed(0) + '% rank change' : '');
		if (lk === undefined) cards += card('Domain age', 'Checking…', '');
		else if (lk) {
			var an = D.analyze(lk, now), h = an.hosting.length ? an.hosting.map(function (x) { return esc(x.name); }).join(', ') : '—', rd = lk.rdap;
			cards += card('Domain age', esc(an.age || 'Unknown'), rd && rd.created ? 'Registered ' + esc(dateOnly(rd.created)) : 'No registration date published') + card('Registrar', esc(rd && rd.registrar || '—'), rd && rd.expires ? 'Expires ' + esc(dateOnly(rd.expires)) : '') + card('Hosted by', h, an.hosting.length ? esc(an.hosting[0].country || '') : '') + card('DNS by', esc(an.dnsProviders.join(', ') || '—'), 'who answers for the domain') + card('Email by', esc(an.mail.join(', ') || 'No email'), '');
		} else cards += card('Domain age', 'Unavailable', 'The registry did not answer');
		$('st-cards').innerHTML = cards;
		var w = c.wayback, ar = $('st-arch');
		if (w === undefined) ar.innerHTML = '<span class="tu-note">Checking the Internet Archive&hellip;</span>';
		else if (w.unavailable) ar.innerHTML = '<span class="tu-note">The Internet Archive did not answer. <a href="https://web.archive.org/web/*/' + esc(a.domain) + '" target="_blank" rel="noopener">Open it directly</a>.</span>';
		else if (!w.captured) ar.innerHTML = '<span class="tu-note">The Internet Archive has no saved copy of ' + esc(a.domain) + '. It may be new, blocked from archiving, or very small.</span>';
		else ar.innerHTML = '<p>First saved <b>' + esc(w.first ? dateOnly(w.first) : '—') + '</b>' + (w.firstUrl ? ' &middot; <a href="' + esc(w.firstUrl) + '" target="_blank" rel="noopener">see that copy</a>' : '') + '. Latest saved <b>' + esc(w.last ? dateOnly(w.last) : '—') + '</b>' + (w.lastUrl ? ' &middot; <a href="' + esc(w.lastUrl) + '" target="_blank" rel="noopener">see it</a>' : '') + '.</p><div class="tu-note">Years with at least one saved copy (' + esc(T.yearsText(w.years)) + '):</div><div class="st-years">' + (w.years || []).map(function (y) { return '<span>' + y + '</span>'; }).join('') + '</div>';
		$('st-links').innerHTML = T.links(a.domain).map(function (l) { var ext = l[1].charAt(0) !== '/'; return '<li><a href="' + esc(l[1]) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[0]) + '<small>' + esc(l[2]) + '</small></a></li>'; }).join('');
		drawTech(c);
	}
	function drawTech(c) {
		var el = $('st-tech'), t = c.tech;
		if (t === undefined) { if (!el.querySelector('#st-techgo')) el.innerHTML = el.getAttribute('data-orig'); bindTech(); return; }
		if (t === 'loading') { $('st-techgo').disabled = true; $('st-techgo').textContent = 'Checking the home page…'; return; }
		if (t.error) { el.innerHTML = '<p class="tu-note">' + esc(t.error) + '</p>'; return; }
		var by = {}; t.tech.forEach(function (x) { (by[x.category] = by[x.category] || []).push(x.name); });
		var list = t.tech.map(function (x) { return '<span>' + esc(x.name) + '<small>' + esc(x.category) + '</small></span>'; }).join('');
		el.innerHTML = '<p>' + (t.title ? '<b>' + esc(t.title) + '</b><br>' : '') + (t.description ? '<span class="tu-note">' + esc(t.description) + '</span><br>' : '') + '<span class="tu-note">Answered ' + t.status + (t.https ? ' over HTTPS' : ' <b>without HTTPS</b>') + (t.finalHost ? ' at ' + esc(t.finalHost) : '') + (t.lang ? ' &middot; language ' + esc(t.lang) : '') + (t.generator ? ' &middot; built with ' + esc(t.generator) : '') + '</span></p>' + (list ? '<div class="st-techlist">' + list + '</div>' : '<p class="tu-note">No known technology was recognised. Many modern sites hide it, or load everything from scripts.</p>');
	}
	function bindTech() { var b = $('st-techgo'); if (b) b.onclick = function () { if (!cur) return; var me = cur; me.tech = 'loading'; drawTech(me); jget('/api/site-traffic?d=' + encodeURIComponent(me.api.domain) + '&only=tech').then(function (x) { if (cur === me) { me.tech = x.ok ? x.j.tech : { error: x.j && x.j.error || 'The check failed.' }; drawTech(me); } }).catch(function () { if (cur === me) { me.tech = { error: 'Could not reach the service.' }; drawTech(me); } }); }; }
	$('st-tech').setAttribute('data-orig', $('st-tech').innerHTML); bindTech();
	$('st-copy').onclick = function () { if (!cur) return; var a = cur.api, r = a.rank, lk = cur.lookup, an = lk ? D.analyze(lk, Date.now()) : null; copy([a.domain, r.ranked ? 'Rank: #' + T.fmt(r.rank) + ' (' + T.tier(r.rank).label + ', Tranco ' + r.date + ')' : 'Rank: not in the Tranco list', an && an.age ? 'Domain age: ' + an.age : '', an && an.hosting.length ? 'Hosted by: ' + an.hosting.map(function (x) { return x.name; }).join(', ') : '', cur.wayback && cur.wayback.first ? 'First archived: ' + cur.wayback.first : '', '(mes.fm/site-traffic)'].filter(Boolean).join('\n'), 'Summary copied'); };
	$('st-link').onclick = function () { if (cur) copy(location.origin + location.pathname + '?d=' + encodeURIComponent(cur.api.domain), 'Link copied'); };
	drawRecent();
	var q0 = new URLSearchParams(location.search).get('d'); if (q0) { $('st-q').value = q0; go(); }
})();
