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
