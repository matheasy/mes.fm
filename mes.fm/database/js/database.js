/* MES Video Database: pure helpers (runs in the browser and in node: require('./tool_apps_src/database/lib.js')).
   A record (one video, from mes.fm/database/data.json written by update_video_database.py):
     y  YouTube id ("" when the video is no longer on YouTube)      t  title
     d  upload date "YYYY-MM-DD" (or "")                              u  length in seconds (0 = unknown)
     v  YouTube views at the snapshot (-1 = unknown)                  c  channel key ("mes", "mestruth", ...)
     s  series / topic keys (data.series gives the labels)           n  number in the MES list (the spreadsheet's running count), 0 = none
     x  short description (may be "")                                 k  1 = livestream, 2 = upcoming livestream
     L  links: {h: "@mes/permlink" (Hive), sp: "mes/abc" (3Speak), r: "v7fd0nc-title.html" (Rumble), o: "@mes:8/Name:7" (Odysee),
               b: "RNOey5ZBYzMt" (BitChute), tg: "meslinks/35489" (Telegram), m: "slug" (mes.fm page), pdf: "https://..." (notes)} */
var MESVDB = (function () {
	'use strict';
	var PLAT = [
		{ k: 'm', name: 'MES.fm', url: function (v) { return 'https://mes.fm/' + v; } },
		{ k: 'y', name: 'YouTube', url: function (v) { return 'https://youtu.be/' + v; } },
		{ k: 'h', name: 'Hive', url: function (v) { return 'https://peakd.com/' + v; } },
		{ k: 'sp', name: '3Speak', url: function (v) { return 'https://3speak.tv/watch?v=' + v; } },
		{ k: 'r', name: 'Rumble', url: function (v) { return 'https://rumble.com/' + v; } },
		{ k: 'o', name: 'Odysee', url: function (v) { return 'https://odysee.com/' + v; } },
		{ k: 'b', name: 'BitChute', url: function (v) { return 'https://www.bitchute.com/video/' + v + '/'; } },
		{ k: 'tg', name: 'Telegram', url: function (v) { return 'https://t.me/' + v; } },
		{ k: 'pdf', name: 'Notes', url: function (v) { return /^https?:\/\//.test(v) ? v : 'https://' + v; } }
	];
	var PMAP = {}; PLAT.forEach(function (p) { PMAP[p.k] = p; });

	function val(r, k) { return k === 'y' ? (r.y || '') : ((r.L || {})[k] || ''); }
	function has(r, k) { return !!val(r, k); }
	function linkUrl(r, k) { var v = val(r, k); return v && PMAP[k] ? PMAP[k].url(v) : ''; }
	/* every link of a record, in PLAT order */
	function links(r) {
		var out = [];
		PLAT.forEach(function (p) { var v = val(r, p.k); if (v) out.push({ k: p.k, name: p.name, url: p.url(v) }); });
		return out;
	}
	/* the main link a card opens: the mes.fm page if there is one, else YouTube, else the first link */
	function mainUrl(r) { var l = links(r); return l.length ? l[0].url : ''; }
	function thumb(r, big) { return r.y ? 'https://i.ytimg.com/vi/' + r.y + '/' + (big ? 'hqdefault' : 'mqdefault') + '.jpg' : ''; }
	function copyText(r) {
		return [r.t].concat(links(r).map(function (l) { return l.name + ': ' + l.url; })).join('\n');
	}

	function norm(s) {
		s = String(s == null ? '' : s).toLowerCase();
		if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
		return s.replace(/[’']/g, '').replace(/[^a-z0-9#/]+/g, ' ').trim();
	}
	function words(q) { var n = norm(q); return n ? n.split(' ') : []; }
	/* the searchable text of a record (cached on it) */
	function hay(r, labels) {
		if (r._h == null) {
			var parts = [r.t, r.x, r.y, r.n ? '#' + r.n : '', r.d];
			(r.s || []).forEach(function (s) { parts.push(labels && labels[s] ? labels[s] : s); });
			r._h = ' ' + norm(parts.join(' ')) + ' ';
		}
		return r._h;
	}
	/* every word must appear (as the start of a word in the text, or anywhere for words of 4+ letters) */
	function matches(r, ws, labels) {
		if (!ws.length) return true;
		var h = hay(r, labels);
		for (var i = 0; i < ws.length; i++) {
			var w = ws[i];
			if (h.indexOf(' ' + w) < 0 && (w.length < 4 || h.indexOf(w) < 0)) return false;
		}
		return true;
	}

	var SORTS = {
		date: function (a, b) { return (a.d || '').localeCompare(b.d || '') || (a.n || 0) - (b.n || 0); },
		title: function (a, b) { return norm(a.t).localeCompare(norm(b.t)); },
		views: function (a, b) { return (a.v || 0) - (b.v || 0); },
		length: function (a, b) { return (a.u || 0) - (b.u || 0); }
	};
	var DEF_DIR = { date: 'desc', title: 'asc', views: 'desc', length: 'desc' };
	function sortRecs(list, key, dir) {
		var f = SORTS[key] || SORTS.date, d = (dir || DEF_DIR[key] || 'desc') === 'asc' ? 1 : -1;
		var unknownLast = key === 'date' ? function (r) { return !r.d; } : key === 'views' ? function (r) { return !(r.v >= 0); } : key === 'length' ? function (r) { return !r.u; } : function () { return false; };
		return list.slice().sort(function (a, b) {
			var ua = unknownLast(a), ub = unknownLast(b);
			if (ua !== ub) return ua ? 1 : -1;
			return d * f(a, b) || norm(a.t).localeCompare(norm(b.t));
		});
	}

	/* state: {q, s: series key or '', p: [platform keys, all required], yr: 'YYYY' or '', live: '' | 'only' | 'hide', sort, dir} */
	function filter(list, st, labels, skip) {
		var ws = words(st.q), p = st.p || [];
		return list.filter(function (r) {
			if (skip !== 's' && st.s && (r.s || []).indexOf(st.s) < 0) return false;
			if (skip !== 'p') for (var i = 0; i < p.length; i++) if (!has(r, p[i])) return false;
			if (skip !== 'yr' && st.yr && (r.d || '').slice(0, 4) !== st.yr) return false;
			if (st.live === 'only' && !r.k) return false;
			if (st.live === 'hide' && r.k) return false;
			return matches(r, ws, labels);
		});
	}
	/* counts per series / platform / year for the chips, each counted with the other filters applied */
	function counts(list, st, labels) {
		var s = {}, p = {}, yr = {};
		filter(list, st, labels, 's').forEach(function (r) { (r.s || []).forEach(function (k) { s[k] = (s[k] || 0) + 1; }); });
		filter(list, st, labels, 'p').forEach(function (r) { PLAT.forEach(function (pl) { if (has(r, pl.k)) p[pl.k] = (p[pl.k] || 0) + 1; }); });
		filter(list, st, labels, 'yr').forEach(function (r) { var y = (r.d || '').slice(0, 4); if (y) yr[y] = (yr[y] || 0) + 1; });
		return { s: s, p: p, yr: yr };
	}

	var DEF = { q: '', s: '', p: [], yr: '', live: '', sort: 'date', dir: '', view: 'grid', pg: 1 };
	function parseQuery(qs) {
		var st = JSON.parse(JSON.stringify(DEF)), sp;
		try { sp = new URLSearchParams(String(qs || '').replace(/^\?/, '')); } catch (e) { return st; }
		if (sp.get('q')) st.q = sp.get('q').slice(0, 200);
		if (/^[a-z0-9-]{1,30}$/.test(sp.get('s') || '')) st.s = sp.get('s');
		if (sp.get('p')) st.p = sp.get('p').split(',').filter(function (k) { return !!PMAP[k]; });
		if (/^\d{4}$/.test(sp.get('yr') || '')) st.yr = sp.get('yr');
		if (/^(only|hide)$/.test(sp.get('live') || '')) st.live = sp.get('live');
		if (SORTS[sp.get('sort')]) st.sort = sp.get('sort');
		if (/^(asc|desc)$/.test(sp.get('dir') || '')) st.dir = sp.get('dir');
		if (/^(grid|list|table)$/.test(sp.get('view') || '')) st.view = sp.get('view');
		var pg = parseInt(sp.get('pg'), 10); if (pg > 1 && pg < 10000) st.pg = pg;
		return st;
	}
	function toQuery(st) {
		var a = [];
		function add(k, v) { a.push(k + '=' + encodeURIComponent(v).replace(/%2C/g, ',')); }
		if (st.q) add('q', st.q);
		if (st.s) add('s', st.s);
		if (st.p && st.p.length) add('p', st.p.join(','));
		if (st.yr) add('yr', st.yr);
		if (st.live) add('live', st.live);
		if (st.sort && st.sort !== 'date') add('sort', st.sort);
		if (st.dir && st.dir !== DEF_DIR[st.sort || 'date']) add('dir', st.dir);
		if (st.view && st.view !== 'grid') add('view', st.view);
		if (st.pg > 1) add('pg', st.pg);
		return a.length ? '?' + a.join('&') : '';
	}

	function fmtDur(s) {
		s = Math.round(s || 0); if (!s) return '';
		var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
		return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
	}
	function fmtViews(v) {
		if (!(v >= 0)) return '';
		if (v < 1000) return String(v);
		if (v < 1e6) return (v < 1e4 ? (Math.round(v / 100) / 10) : Math.round(v / 1000)) + 'K';
		return (Math.round(v / 1e5) / 10) + 'M';
	}
	var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function fmtDate(d) {
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return '';
		return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
	}
	function totalLength(list) { var t = 0; list.forEach(function (r) { t += r.u || 0; }); return t; }
	function fmtHours(s) { var h = s / 3600; return h >= 10 ? Math.round(h).toLocaleString('en-US') + ' hours' : (Math.round(h * 10) / 10) + ' hours'; }

	/* CSV of the shown records (Excel-friendly: quoted, CRLF) */
	function csv(list, labels) {
		var head = ['Number', 'Title', 'Date', 'Length', 'Views', 'Series'].concat(PLAT.map(function (p) { return p.name; }));
		function q(v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
		var rows = [head.map(q).join(',')];
		list.forEach(function (r) {
			rows.push([r.n || '', r.t, r.d, fmtDur(r.u), r.v >= 0 ? r.v : '', (r.s || []).map(function (s) { return labels && labels[s] || s; }).join('; ')]
				.concat(PLAT.map(function (p) { return linkUrl(r, p.k); })).map(q).join(','));
		});
		return rows.join('\r\n') + '\r\n';
	}
	function page(list, pg, per) { var n = Math.max(1, Math.ceil(list.length / per)); pg = Math.min(Math.max(1, pg || 1), n); return { items: list.slice((pg - 1) * per, pg * per), pg: pg, pages: n }; }

	return { PLAT: PLAT, PMAP: PMAP, DEF: DEF, DEF_DIR: DEF_DIR, val: val, has: has, linkUrl: linkUrl, links: links, mainUrl: mainUrl, thumb: thumb, copyText: copyText,
		norm: norm, words: words, matches: matches, sortRecs: sortRecs, filter: filter, counts: counts, parseQuery: parseQuery, toQuery: toQuery,
		fmtDur: fmtDur, fmtViews: fmtViews, fmtDate: fmtDate, totalLength: totalLength, fmtHours: fmtHours, csv: csv, page: page };
})();
if (typeof module !== 'undefined') module.exports = MESVDB;

/* MES Video Database page (mes.fm/database). Data: /database/data.json (update_video_database.py). Helpers: MESVDB (lib.js). */
(function () {
	'use strict';
	var V = window.MESVDB, root = document.getElementById('vdb');
	if (!V || !root) return;
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	var KEY = 'mes-database:v1', PER = { grid: 48, list: 100, table: 100 };
	var data = null, all = [], labels = {}, groups = {}, st = V.parseQuery(location.search), shown = [];
	try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!/[?&]view=/.test(location.search) && saved.view) st.view = saved.view; } catch (e) { }

	function toast(msg) { var t = $('vdb-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); } ta.remove(); }
	}

	function syncUrl(push) {
		var q = V.toQuery(st), u = location.pathname + q + location.hash;
		if (u !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', u);
		try { localStorage.setItem(KEY, JSON.stringify({ view: st.view })); } catch (e) { }
	}

	function chip(k, label, n, on, cls) {
		return '<button type="button" class="tu-chip' + (cls ? ' ' + cls : '') + '" data-k="' + esc(k) + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (n === 0 && !on ? ' disabled' : '') + '>' + esc(label) + (n != null ? ' <span class="vdb-n">' + n.toLocaleString('en-US') + '</span>' : '') + '</button>';
	}
	function drawChips() {
		var c = V.counts(all, st, labels), ser = [], mat = [];
		data.series.forEach(function (s) { (s[2] === 'math' ? mat : ser).push(s); });
		var allN = V.filter(all, Object.assign({}, st, { s: '' }), labels).length;
		$('vdb-series').innerHTML = chip('', 'All', allN, !st.s) + ser.filter(function (s) { return c.s[s[0]] || st.s === s[0]; }).map(function (s) { return chip(s[0], s[1], c.s[s[0]] || 0, st.s === s[0]); }).join('');
		$('vdb-math').innerHTML = mat.filter(function (s) { return c.s[s[0]] || st.s === s[0]; }).map(function (s) { return chip(s[0], s[1], c.s[s[0]] || 0, st.s === s[0]); }).join('');
		$('vdb-plat').innerHTML = V.PLAT.map(function (p) { return chip(p.k, p.name, c.p[p.k] || 0, st.p.indexOf(p.k) >= 0, 'vdb-pc vdb-p-' + p.k); }).join('');
		var yrs = Object.keys(c.yr).sort().reverse(), sel = $('vdb-yr');
		if (st.yr && yrs.indexOf(st.yr) < 0) yrs.unshift(st.yr);
		sel.innerHTML = '<option value="">All years</option>' + yrs.map(function (y) { return '<option value="' + y + '"' + (y === st.yr ? ' selected' : '') + '>' + y + ' (' + (c.yr[y] || 0) + ')</option>'; }).join('');
	}

	function linkPills(r) {
		return V.links(r).map(function (l) { return '<a class="vdb-pl vdb-p-' + l.k + '" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>'; }).join('');
	}
	function meta(r) {
		var a = [];
		if (r.n) a.push('#' + r.n);
		if (r.d) a.push(V.fmtDate(r.d));
		if (r.v >= 0) a.push(V.fmtViews(r.v) + ' views');
		if (r.k === 2) a.push('upcoming'); else if (r.k) a.push('livestream');
		if (!r.y) a.push('removed from YouTube');
		return a.map(esc).join(' · ');
	}
	function tags(r) {
		return (r.s || []).map(function (k) { return '<button type="button" class="vdb-tag" data-s="' + esc(k) + '">' + esc(labels[k] || k) + '</button>'; }).join('');
	}
	function thumb(r, cls) {
		var u = V.mainUrl(r), img = r.y ? '<img src="' + V.thumb(r) + '" alt="" loading="lazy" decoding="async" width="320" height="180">' : '<span class="vdb-noimg">No thumbnail</span>';
		return '<a class="' + cls + '" href="' + esc(u) + '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">' + img + (r.u ? '<span class="vdb-dur">' + V.fmtDur(r.u) + '</span>' : '') + '</a>';
	}
	function copyBtn(i) { return '<button type="button" class="vdb-copy" data-i="' + i + '" title="Copy the title and every link">⧉ Copy links</button>'; }

	function render() {
		shown = V.sortRecs(V.filter(all, st, labels), st.sort, st.dir);
		var per = PER[st.view] || 48, p = V.page(shown, st.pg, per);
		st.pg = p.pg;
		var h = '';
		if (!shown.length) h = '<p class="vdb-empty">No video matches. <button type="button" class="tu-btn tu-btn--ghost" id="vdb-clear2">Clear the filters</button></p>';
		else if (st.view === 'table') {
			h = '<div class="tu-table-wrap"><table class="tu-table vdb-tbl"><thead><tr><th>#</th><th>Title</th><th>Date</th><th>Length</th><th>Views</th><th>Watch on</th><th></th></tr></thead><tbody>' +
				p.items.map(function (r, i) {
					return '<tr><td class="vdb-num">' + (r.n || '') + '</td><td class="vdb-tt"><a href="' + esc(V.mainUrl(r)) + '" target="_blank" rel="noopener">' + esc(r.t) + '</a><div class="vdb-tags">' + tags(r) + '</div></td><td class="vdb-nw">' + esc(r.d || '') + '</td><td class="vdb-num">' + V.fmtDur(r.u) + '</td><td class="vdb-num">' + (r.v >= 0 ? r.v.toLocaleString('en-US') : '') + '</td><td><div class="vdb-pls">' + linkPills(r) + '</div></td><td>' + copyBtn(i) + '</td></tr>';
				}).join('') + '</tbody></table></div>';
		} else {
			h = '<div class="vdb-' + st.view + '">' + p.items.map(function (r, i) {
				return '<article class="vdb-item">' + thumb(r, 'vdb-th') + '<div class="vdb-body"><h3 class="vdb-title"><a href="' + esc(V.mainUrl(r)) + '" target="_blank" rel="noopener">' + esc(r.t) + '</a></h3><div class="vdb-meta">' + meta(r) + '</div>' +
					(st.view === 'list' && r.x ? '<p class="vdb-x">' + esc(r.x) + '</p>' : '') + '<div class="vdb-tags">' + tags(r) + '</div><div class="vdb-pls">' + linkPills(r) + copyBtn(i) + '</div></div></article>';
			}).join('') + '</div>';
		}
		$('vdb-res').innerHTML = h;
		$('vdb-res').dataset.page = p.pg;
		var pg = '';
		if (p.pages > 1) {
			pg = '<button type="button" class="tu-btn tu-btn--ghost" data-pg="' + (p.pg - 1) + '"' + (p.pg === 1 ? ' disabled' : '') + '>‹ Previous</button><span class="vdb-pgn">Page ' + p.pg + ' of ' + p.pages + '</span><button type="button" class="tu-btn tu-btn--ghost" data-pg="' + (p.pg + 1) + '"' + (p.pg === p.pages ? ' disabled' : '') + '>Next ›</button>';
		}
		$('vdb-pager').innerHTML = pg;
		var tl = V.totalLength(shown);
		$('vdb-sum').innerHTML = '<b>' + shown.length.toLocaleString('en-US') + '</b> of ' + all.length.toLocaleString('en-US') + ' videos' + (tl ? ' · ' + esc(V.fmtHours(tl)) : '') +
			(shown.length > per ? ' · showing ' + ((p.pg - 1) * per + 1) + '-' + Math.min(p.pg * per, shown.length) : '') + ' · <span class="vdb-upd">list updated ' + esc(V.fmtDate(data.generated)) + '</span>';
		// controls
		$('vdb-q').value !== st.q && document.activeElement !== $('vdb-q') && ($('vdb-q').value = st.q);
		$('vdb-sort').value = st.sort;
		var dir = st.dir || V.DEF_DIR[st.sort];
		$('vdb-dir').textContent = { date: { desc: '↓ Newest first', asc: '↑ Oldest first' }, title: { asc: '↓ A to Z', desc: '↑ Z to A' }, views: { desc: '↓ Most first', asc: '↑ Fewest first' }, length: { desc: '↓ Longest first', asc: '↑ Shortest first' } }[st.sort][dir];
		$('vdb-live').value = st.live;
		[].forEach.call($('vdb-views').children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === st.view ? 'true' : 'false'); });
		drawChips();
	}
	function update(push, keepPage) { if (!keepPage) st.pg = 1; syncUrl(push); render(); }

	// events
	var qt;
	$('vdb-q').addEventListener('input', function () { clearTimeout(qt); var v = this.value; qt = setTimeout(function () { st.q = v; update(false); }, 160); });
	$('vdb-sort').addEventListener('change', function () { st.sort = this.value; st.dir = ''; update(true); });
	$('vdb-dir').addEventListener('click', function () { var d = st.dir || V.DEF_DIR[st.sort]; st.dir = d === 'asc' ? 'desc' : 'asc'; update(true); });
	$('vdb-yr').addEventListener('change', function () { st.yr = this.value; update(true); });
	$('vdb-live').addEventListener('change', function () { st.live = this.value; update(true); });
	$('vdb-views').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var first = (st.pg - 1) * (PER[st.view] || 48); st.view = b.dataset.v; st.pg = Math.floor(first / PER[st.view]) + 1; update(true, true); });
	function chipClick(kind) {
		return function (e) {
			var b = e.target.closest('button'); if (!b || b.disabled) return;
			var k = b.dataset.k;
			if (kind === 'p') { var i = st.p.indexOf(k); if (i >= 0) st.p.splice(i, 1); else st.p.push(k); }
			else st.s = st.s === k ? '' : k;
			update(true);
		};
	}
	$('vdb-series').addEventListener('click', chipClick('s'));
	$('vdb-math').addEventListener('click', chipClick('s'));
	$('vdb-plat').addEventListener('click', chipClick('p'));
	$('vdb-share').addEventListener('click', function () { st.pg = 1; syncUrl(false); copy(location.origin + location.pathname + V.toQuery(st), 'Link to this list copied'); });
	$('vdb-csv').addEventListener('click', function () {
		var blob = new Blob(['﻿' + V.csv(shown, labels)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
		a.href = URL.createObjectURL(blob); a.download = 'mes-videos.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	});
	function reset() { var v = st.view; st = V.parseQuery(''); st.view = v; $('vdb-q').value = ''; update(true); }
	$('vdb-reset').addEventListener('click', reset);
	$('vdb-res').addEventListener('click', function (e) {
		var t = e.target.closest('.vdb-tag');
		if (t) { st.s = t.dataset.s; update(true); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
		var c = e.target.closest('.vdb-copy');
		if (c) { var per = PER[st.view] || 48, r = shown[(st.pg - 1) * per + +c.dataset.i]; if (r) copy(V.copyText(r), 'Links copied'); return; }
		if (e.target.id === 'vdb-clear2') reset();
	});
	$('vdb-pager').addEventListener('click', function (e) {
		var b = e.target.closest('button[data-pg]'); if (!b || b.disabled) return;
		st.pg = +b.dataset.pg; update(true, true);
		var top = root.querySelector('.vdb-res').getBoundingClientRect().top + window.scrollY - 80;
		window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
	});
	window.addEventListener('popstate', function () { var v = st.view; st = V.parseQuery(location.search); if (!/[?&]view=/.test(location.search)) st.view = v; if (data) render(); });
	document.addEventListener('keydown', function (e) {
		if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('vdb-q').focus(); }
	});

	$('vdb-q').value = st.q;
	fetch('/database/data.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
		data = d; all = d.videos || [];
		d.series.forEach(function (s) { labels[s[0]] = s[1]; groups[s[0]] = s[2]; });
		if (st.s && !labels[st.s]) st.s = '';
		render();
	}).catch(function () { $('vdb-sum').textContent = 'Could not load the video list. Please reload the page.'; });
})();
