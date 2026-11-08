/* MES Site Traffic & Rank UI. Data = /api/site-traffic (Tranco rank, Wayback history, opt-in tech) + /api/domain-lookup (RDAP age, DNS, hosting); findings = MESTraffic (lib.js) and MESDomain (domain-lookup lib). Visits are a rough range estimated from the rank (MESTraffic.estimate); Chrome UX Report + Cloudflare Radar sections appear once their free keys are set. */
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
			status(''); cur = { api: x.j, lookup: undefined, wayback: undefined, tech: undefined, crux: undefined, radar: undefined }; var me = cur;
			saveRecent(x.j.domain); try { history.replaceState(null, '', '?d=' + encodeURIComponent(x.j.domain)); } catch (e) {}
			render(me);
			jget('/api/domain-lookup?d=' + encodeURIComponent(x.j.domain)).then(function (l) { if (cur === me) { me.lookup = l.ok ? l.j : null; render(me); } }).catch(function () { if (cur === me) { me.lookup = null; render(me); } });
			['crux', 'radar'].forEach(function (k) { jget('/api/site-traffic?d=' + encodeURIComponent(x.j.domain) + '&only=' + k).then(function (y) { if (cur === me) { me[k] = y.ok ? y.j[k] : { unavailable: true }; render(me); } }).catch(function () { if (cur === me) { me[k] = { unavailable: true }; render(me); } }); });
			jget('/api/site-traffic?d=' + encodeURIComponent(x.j.domain) + '&only=wayback').then(function (w) { if (cur === me) { me.wayback = w.ok ? w.j.wayback : { unavailable: true }; render(me); } }).catch(function () { if (cur === me) { me.wayback = { unavailable: true }; render(me); } });
		}).catch(function () { busy = false; $('st-go').disabled = false; status('Could not reach the service. Check your connection and try again.', true); });
	}
	function card(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value" style="font-size:1.2em">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	var chartMode = 'visits'; try { chartMode = localStorage.getItem(KEY + ':chart') || 'visits'; } catch (e) {}
	/* x by date (the kept history can have gaps), y = rank (1 at the top) or log10 of the estimated visits (more at the top) */
	function chart(r) {
		var hist = r && r.ranked ? (r.longHistory || r.history) : null, svg = $('st-chart'), box = $('st-chartcard');
		if (!hist || hist.length < 2) { box.hidden = true; return; }
		box.hidden = false;
		var d0 = Date.parse(hist[0].date), d1 = Date.parse(hist[hist.length - 1].date), days = Math.round((d1 - d0) / 86400000) + 1;
		$('st-days').textContent = days >= 120 ? Math.round(days / 30.4) + ' months' : days + ' days';
		Array.prototype.forEach.call(document.querySelectorAll('#st-cmode button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === chartMode ? 'true' : 'false'); });
		var vis = chartMode === 'visits', W = 640, H = 200, P = 14;
		var ys = hist.map(function (h) { return vis ? Math.log10(T.estimate(h.rank).raw) : h.rank; });
		var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys); if (hi - lo < (vis ? 0.02 : 1)) { var m = (hi + lo) / 2, g = vis ? 0.05 : Math.max(1, m * 0.05); lo = m - g; hi = m + g; }
		var pts = hist.map(function (h, i) { var f = (ys[i] - lo) / (hi - lo); return { x: P + (W - 2 * P) * (d1 > d0 ? (Date.parse(h.date) - d0) / (d1 - d0) : i / (hist.length - 1)), y: vis ? H - P - (H - 2 * P) * f : P + (H - 2 * P) * f, h: h }; });
		var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' '), area = path + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + H + ' L' + pts[0].x.toFixed(1) + ' ' + H + ' Z';
		svg.innerHTML = '<line class="st-grid" x1="0" x2="' + W + '" y1="' + P + '" y2="' + P + '"></line><line class="st-grid" x1="0" x2="' + W + '" y1="' + (H - P) + '" y2="' + (H - P) + '"></line><path class="st-area" d="' + area + '"></path><path class="st-line" d="' + path + '"></path><line class="st-cur" id="st-cur" x1="-20" x2="-20" y1="0" y2="' + H + '"></line>';
		var top = vis ? T.big(T.estimate(Math.round(hist.reduce(function (m, h) { return Math.min(m, h.rank); }, Infinity))).mid) + ' / month' : '#' + T.fmt(Math.ceil(lo));
		var bot = vis ? T.big(T.estimate(Math.round(hist.reduce(function (m, h) { return Math.max(m, h.rank); }, 0))).mid) + ' / month' : '#' + T.fmt(Math.floor(hi));
		$('st-ytop').textContent = top; $('st-ybot').textContent = bot; $('st-x0').textContent = hist[0].date; $('st-x1').textContent = hist[hist.length - 1].date;
		$('st-cnote').textContent = vis ? 'Estimated from the rank (middle of the range). Real sites can be up to ~3x either side.' : 'Higher on the chart = better rank (closer to #1).';
		var tip = $('st-tip'), cur = $('st-cur');
		function at(ev) {
			var b = svg.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * W, p = pts[0];
			pts.forEach(function (q) { if (Math.abs(q.x - x) < Math.abs(p.x - x)) p = q; });
			cur.setAttribute('x1', p.x); cur.setAttribute('x2', p.x); tip.hidden = false;
			var e = T.estimate(p.h.rank); tip.textContent = p.h.date + ': #' + T.fmt(p.h.rank) + ' · ~' + T.big(e.mid) + ' visits/mo (' + T.estText(e) + ')';
			tip.style.left = Math.min(Math.max(p.x / W * b.width, 110), b.width - 110) + 'px'; tip.style.top = Math.max(0, p.y / H * b.height - 34) + 'px';
		}
		svg.onpointermove = at; svg.onpointerdown = at; svg.onpointerleave = function () { tip.hidden = true; cur.setAttribute('x1', -20); cur.setAttribute('x2', -20); };
	}
	$('st-cmode').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; chartMode = b.getAttribute('data-m'); try { localStorage.setItem(KEY + ':chart', chartMode); } catch (x) {} if (cur) chart(cur.api.rank); });
	function pct(x) { return x == null || isNaN(x) ? '—' : Math.round(x * 100) + '%'; }
	function ms(x) { return x == null ? '—' : x >= 1000 ? (x / 1000).toFixed(1) + ' s' : Math.round(x) + ' ms'; }
	function cwvRate(k, v) { if (v == null) return ''; var t = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], ttfb: [800, 1800] }[k]; return v <= t[0] ? 'good' : v <= t[1] ? 'ok' : 'poor'; }
	function drawCrux(c) {
		var el = $('st-crux'), x = c.crux; if (!el) return;
		if (x === undefined) { el.innerHTML = '<span class="tu-note">Asking Google&rsquo;s Chrome UX Report&hellip;</span>'; return; }
		if (x.setup) { el.closest('section').hidden = true; return; }
		el.closest('section').hidden = false;
		if (x.unavailable) { el.innerHTML = '<span class="tu-note">' + (x.keyProblem ? 'The Chrome UX Report key is not working yet.' : 'Google did not answer. Try again in a minute.') + '</span>'; return; }
		if (!x.found) { el.innerHTML = '<span class="tu-note">Google has no Chrome data for ' + esc(c.api.domain) + '. Chrome only publishes sites with enough real visitors, so this usually means a small site (or one that most people reach through an app).</span>'; return; }
		var ff = x.ff || {}, h = x.history, bar = ['phone', 'desktop', 'tablet'].filter(function (k) { return ff[k] > 0; }).map(function (k) { return '<span class="st-ff st-ff--' + k + '" style="flex:' + ff[k] + '">' + k.charAt(0).toUpperCase() + k.slice(1) + ' ' + pct(ff[k]) + '</span>'; }).join('');
		var cw = x.cwv || {}, names = { lcp: ['Loading (LCP)', ms], inp: ['Response to taps (INP)', ms], cls: ['Layout shift (CLS)', function (v) { return v == null ? '—' : (+v).toFixed(2); }], ttfb: ['Server reply (TTFB)', ms] };
		var vit = Object.keys(names).filter(function (k) { return cw[k]; }).map(function (k) { var v = cw[k].p75, r = cwvRate(k, v); return '<div class="tu-stat"><div class="tu-stat__label">' + names[k][0] + '</div><div class="tu-stat__value st-cw st-cw--' + r + '" style="font-size:1.2em">' + names[k][1](v) + '</div><div class="tu-stat__sub">' + (cw[k].good != null ? pct(cw[k].good) + ' of visits fast' : '') + '</div></div>'; }).join('');
		var nav = x.nav ? Object.keys(x.nav).filter(function (k) { return x.nav[k] > 0.005; }).sort(function (a, b) { return x.nav[b] - x.nav[a]; }).map(function (k) { return esc(({ navigate: 'typed or clicked', reload: 'reloads', back_forward: 'back / forward', back_forward_cache: 'back / forward (instant)', prerender: 'pre-loaded', restore: 'restored tabs', navigate_cache: 'from cache' })[k] || k) + ' ' + pct(x.nav[k]); }).join(' · ') : '';
		var spark = '';
		if (h && h.ff && h.ff.phone && h.dates.length > 2) {
			var W = 640, H = 120, n = h.dates.length, lines = ['phone', 'desktop', 'tablet'].map(function (k) { var a = h.ff[k]; if (!a) return ''; return '<path class="st-ffl st-ffl--' + k + '" d="' + a.map(function (v, i) { return v == null ? '' : ((i && a[i - 1] != null ? 'L' : 'M') + (8 + (W - 16) * i / (n - 1)).toFixed(1) + ' ' + (H - 8 - (H - 16) * v).toFixed(1)); }).join(' ') + '"></path>'; }).join('');
			spark = '<div class="st-charthead"><b>Device share, week by week (' + esc(h.dates[0]) + ' to ' + esc(h.dates[n - 1]) + ')</b><span class="st-leg"><i class="st-ff--phone"></i>Phone <i class="st-ff--desktop"></i>Desktop <i class="st-ff--tablet"></i>Tablet</span></div><svg class="st-ffchart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Device share over time">' + lines + '</svg>';
		}
		el.innerHTML = '<p class="tu-note" style="margin-top:0">Real Chrome visitors to <b>' + esc(x.origin) + '</b>' + (x.period ? ', ' + esc(x.period.first) + ' to ' + esc(x.period.last) : '') + '. Being in this report at all means the site has a steady stream of real visitors.</p><div class="st-ffbar">' + bar + '</div>' + (nav ? '<p class="tu-note">How visits start: ' + nav + '</p>' : '') + spark + (vit ? '<div class="tu-stats" style="margin-top:0.8em">' + vit + '</div><p class="tu-note">Speed numbers are what 3 out of 4 visits get or better (Google&rsquo;s Core Web Vitals: green = good, amber = needs work, red = poor).</p>' : '');
	}
	function drawRadar(c) {
		var el = $('st-radar'), x = c.radar; if (!el) return;
		if (x === undefined) { el.innerHTML = '<span class="tu-note">Asking Cloudflare Radar&hellip;</span>'; return; }
		if (x.setup) { el.closest('section').hidden = true; return; }
		el.closest('section').hidden = false;
		if (x.unavailable) { el.innerHTML = '<span class="tu-note">' + (x.keyProblem ? 'The Cloudflare Radar token is not working yet.' : 'Cloudflare did not answer. Try again in a minute.') + '</span>'; return; }
		if (!x.found) { el.innerHTML = '<span class="tu-note">' + esc(c.api.apex) + ' is not in Cloudflare&rsquo;s ranking (its list covers about the top million domains seen by its 1.1.1.1 DNS service).</span>'; return; }
		var head = x.rank ? '#' + T.fmt(x.rank) : x.bucket ? 'Top ' + T.fmt(x.bucket) : '—';
		var loc = (x.locations || []).map(function (l) { return '<span>' + esc(l.name || l.code) + (l.rank ? ' <small>#' + T.fmt(l.rank) + '</small>' : '') + '</span>'; }).join('');
		el.innerHTML = '<div class="tu-stats"><div class="tu-stat tu-stat--hero"><div class="tu-stat__label">Cloudflare rank</div><div class="tu-stat__value" style="font-size:1.3em">' + head + '</div><div class="tu-stat__sub">' + (x.rank ? 'exact (top 100 only)' : 'Cloudflare gives exact ranks only for the top 100') + '</div></div>' + (x.categories.length ? '<div class="tu-stat"><div class="tu-stat__label">Category</div><div class="tu-stat__value" style="font-size:1em">' + esc(x.categories.join(', ')) + '</div></div>' : '') + '</div>' + (loc ? '<p class="tu-note">Countries where it ranks highest:</p><div class="st-techlist">' + loc + '</div>' : '');
	}
	function render(c) {
		var a = c.api, r = a.rank, lk = c.lookup, now = Date.now(); $('st-out').hidden = false;
		$('st-host').textContent = a.domain + (a.apex !== a.domain ? ' (ranked as ' + a.apex + ')' : '');
		if (r.ranked) { var t = T.tier(r.rank); $('st-rank').textContent = '#' + T.fmt(r.rank); $('st-tier').innerHTML = '<b>' + esc(t.label) + '</b> of the Internet &middot; Tranco list of ' + esc(r.date); var e = T.estimate(r.rank); $('st-est').hidden = false; $('st-estv').textContent = T.estText(e); $('st-ests').textContent = 'about ' + T.big(e.mid) + ' a month (' + T.big(e.perDay) + ' a day)' + (a.apex !== a.domain ? ', for all of ' + a.apex : ''); }
		else if (r.unavailable) { $('st-rank').textContent = '?'; $('st-tier').textContent = 'The rank service is busy. Try again in a minute.'; }
		else { $('st-rank').textContent = 'Unranked'; $('st-tier').textContent = 'Not in the Tranco list of the few million most visited domains.'; }
		if (!r.ranked) $('st-est').hidden = true;
		$('st-sig').innerHTML = T.signals(a, lk, now).map(function (s) { return '<li class="' + s.level + '">' + (s.level === 'warn' ? '&#9888;&#65039; ' : s.level === 'good' ? '&#10003; ' : '&#8505;&#65039; ') + esc(s.text) + '</li>'; }).join('');
		chart(r);
		var tr = r.ranked ? T.trend(r.history) : null, cards = '';
		if (r.ranked) { var es = T.estimate(r.rank); cards += card('Estimated visits a month', T.estText(es), 'rough range worked out from the rank', true); }
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
		drawTech(c); drawCrux(c); drawRadar(c);
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
	$('st-copy').onclick = function () { if (!cur) return; var a = cur.api, r = a.rank, lk = cur.lookup, an = lk ? D.analyze(lk, Date.now()) : null; copy([a.domain, r.ranked ? 'Rank: #' + T.fmt(r.rank) + ' (' + T.tier(r.rank).label + ', Tranco ' + r.date + ')' : 'Rank: not in the Tranco list', r.ranked ? 'Estimated visits a month: ' + T.estText(T.estimate(r.rank)) + ' (rough, from the rank)' : '', an && an.age ? 'Domain age: ' + an.age : '', an && an.hosting.length ? 'Hosted by: ' + an.hosting.map(function (x) { return x.name; }).join(', ') : '', cur.wayback && cur.wayback.first ? 'First archived: ' + cur.wayback.first : '', '(mes.fm/site-traffic)'].filter(Boolean).join('\n'), 'Summary copied'); };
	$('st-link').onclick = function () { if (cur) copy(location.origin + location.pathname + '?d=' + encodeURIComponent(cur.api.domain), 'Link copied'); };
	if (window.fetch) fetch('/site-traffic/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { if (m && m.version && $('st-ver')) $('st-ver').textContent = 'v' + m.version; }).catch(function () {});
	drawRecent();
	var q0 = new URLSearchParams(location.search).get('d'); if (q0) { $('st-q').value = q0; go(); }
})();
