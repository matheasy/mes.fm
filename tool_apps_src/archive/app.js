/* MES Archive UI. Engine table + URL building = MESArchive in lib.js (prepended). State in localStorage mes-archive:v1. */
(function () {
	'use strict';
	var M = MESArchive, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-archive:v1';
	var S = { sel: M.SETS[0][2].slice(), custom: [], strip: true, vars: {} };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { if (Array.isArray(sv.sel)) S.sel = sv.sel; if (Array.isArray(sv.custom)) S.custom = sv.custom; if (typeof sv.strip === 'boolean') S.strip = sv.strip; if (sv.vars && typeof sv.vars === 'object') S.vars = sv.vars; } } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('ar-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2400); }
	function all() { return M.ENGINES.concat(S.custom.map(function (c) { return { id: c.id, name: c.name, g: 'custom', badge: [c.name.slice(0, 2), '#64748b'], custom: c.tpl, note: 'Your own site.' }; })); }
	var url = '';
	$('ar-strip').checked = S.strip;
	function read() { url = M.cleanUrl($('ar-url').value, S.strip); $('ar-engines').hidden = !url; if (url) { renderList(); checkWayback(url); } else $('ar-avail').innerHTML = ''; }
	$('ar-url').addEventListener('input', read);
	$('ar-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { read(); openSelected(); } });
	$('ar-strip').onchange = function () { S.strip = this.checked; save(); read(); };
	$('ar-paste').onclick = function () { if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { $('ar-url').value = t; read(); }, function () { toast('Press Ctrl/⌘+V in the box'); $('ar-url').focus(); }); else { toast('Press Ctrl/⌘+V in the box'); $('ar-url').focus(); } };

	/* does the Wayback Machine already have it? (its availability API allows cross-site requests; silent on failure) */
	var wbT, wbFor = '';
	function checkWayback(u) {
		clearTimeout(wbT); wbFor = u; var box = $('ar-avail'); box.textContent = 'Checking the Wayback Machine…';
		wbT = setTimeout(function () {
			fetch('https://archive.org/wayback/available?url=' + encodeURIComponent(u)).then(function (r) { return r.json(); }).then(function (j) {
				if (wbFor !== u) return; var c = j && j.archived_snapshots && j.archived_snapshots.closest;
				if (c && c.available) { var t = c.timestamp, d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8))), days = Math.max(0, Math.round((Date.now() - d) / 86400000)); box.innerHTML = '&#10003; The Wayback Machine already has a copy from <b>' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) + '</b> (' + (days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago') + '): <a href="' + esc(c.url.replace(/^http:/, 'https:')) + '" target="_blank" rel="noopener">open it</a>.'; }
				else box.textContent = 'The Wayback Machine has no copy of this address yet. Save one below.';
			}).catch(function () { if (wbFor === u) box.textContent = ''; });
		}, 500);
	}

	function renderList() {
		var eng = all(), h = '', groups = M.GROUPS.concat(S.custom.length ? [['custom', 'Your own sites', '']] : []);
		groups.forEach(function (g) {
			var list = eng.filter(function (e) { return e.g === g[0]; }); if (!list.length) return;
			h += '<h3 class="ar-grp">' + esc(g[1]) + '</h3>' + (g[2] ? '<p class="tu-note ar-gdesc">' + esc(g[2]) + '</p>' : '');
			list.forEach(function (e) {
				var on = S.sel.indexOf(e.id) >= 0, b = e.badge, v = e.variants ? '<select class="tu-select ar-var" data-var="' + e.id + '" aria-label="Address for ' + esc(e.name) + '">' + e.variants.map(function (x) { return '<option value="' + x.v + '"' + ((S.vars[e.id] || e.variants[0].v) === x.v ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select>' : '';
				h += '<div class="ar-eng' + (on ? ' on' : '') + '"><input type="checkbox" data-id="' + e.id + '"' + (on ? ' checked' : '') + ' aria-label="Use ' + esc(e.name) + '"><span class="ar-badge" style="background:' + b[1] + '" aria-hidden="true">' + esc(b[0]) + '</span><div class="ar-eng__t"><div class="ar-eng__n">' + esc(e.name) + '</div><div class="ar-eng__d">' + esc(e.note || '') + (e.needs ? ' <b>Needs ' + esc(e.needs) + '.</b>' : '') + '</div></div>' + v + '<button type="button" class="tu-btn tu-btn--ghost ar-open" data-open="' + e.id + '">Open</button></div>';
			});
		});
		$('ar-list').innerHTML = h;
		var n = S.sel.filter(function (id) { return eng.some(function (e) { return e.id === id; }); }).length;
		$('ar-go').textContent = 'Open ' + n + ' selected'; $('ar-go').disabled = !n;
		$('ar-sets').innerHTML = M.SETS.map(function (s) { return '<button type="button" class="tu-chip" data-set="' + s[0] + '" aria-pressed="' + (s[2].length === S.sel.length && s[2].every(function (x) { return S.sel.indexOf(x) >= 0; })) + '">' + esc(s[1]) + '</button>'; }).join('') + '<button type="button" class="tu-chip" data-set="none">Clear</button>';
	}
	$('ar-sets').addEventListener('click', function (e) { var b = e.target.closest('[data-set]'); if (!b) return; var id = b.getAttribute('data-set'); if (id === 'none') S.sel = []; else M.SETS.forEach(function (s) { if (s[0] === id) S.sel = s[2].slice(); }); save(); renderList(); });
	$('ar-list').addEventListener('change', function (e) {
		var c = e.target.closest('input[data-id]'); if (c) { var id = c.getAttribute('data-id'), i = S.sel.indexOf(id); if (c.checked && i < 0) S.sel.push(id); else if (!c.checked && i >= 0) S.sel.splice(i, 1); save(); renderList(); return; }
		var v = e.target.closest('select[data-var]'); if (v) { S.vars[v.getAttribute('data-var')] = v.value; save(); }
	});
	$('ar-list').addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (!b) return; var en = all().filter(function (x) { return x.id === b.getAttribute('data-open'); })[0]; if (en) { $('ar-queue').hidden = true; var r = openOne(en); if (r && r !== true) queue([r]); } });
	$('ar-go').onclick = openSelected;
	function target(en) { return en.custom ? M.customUrl(en.custom, url) : M.build(en, url, S.vars[en.id]); }
	function openOne(en) { var u = target(en), w = window.open(u, '_blank'); if (w) { try { w.opener = null; } catch (e) {} return true; } return { en: en, url: u }; }
	function openSelected() {
		if (!url) return toast('Paste a web address first'); var list = all().filter(function (e) { return S.sel.indexOf(e.id) >= 0; }); if (!list.length) return toast('Tick at least one service');
		$('ar-queue').hidden = true; var blocked = []; list.forEach(function (e) { var r = openOne(e); if (r !== true) blocked.push(r); }); if (blocked.length) queue(blocked);
	}
	function queue(items) { var q = $('ar-queue'); q.hidden = false; q.innerHTML = '<b>Your browser blocked ' + (items.length === 1 ? 'a pop-up' : items.length + ' pop-ups') + '.</b> Click each link, or allow pop-ups for mes.fm and press Open again.<br>' + items.map(function (it) { return '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.en.name) + '</a>'; }).join(''); }

	function renderCustom() { $('ar-clist').innerHTML = S.custom.map(function (c) { return '<div class="ar-eng"><div class="ar-eng__t"><div class="ar-eng__n">' + esc(c.name) + '</div><div class="ar-eng__d">' + esc(c.tpl) + '</div></div><button type="button" class="tu-btn tu-btn--ghost" data-del="' + c.id + '">Remove</button></div>'; }).join(''); }
	$('ar-cadd').onclick = function () {
		var n = $('ar-cname').value.trim(), t = $('ar-ctpl').value.trim(); if (!n) return toast('Give the site a name'); if (!M.validTemplate(t)) return toast('The address must start with http(s):// and contain %s where the page address goes');
		var id = 'c' + Date.now().toString(36); S.custom.push({ id: id, name: n, tpl: t }); S.sel.push(id); save(); $('ar-cname').value = ''; $('ar-ctpl').value = ''; renderCustom(); if (url) renderList(); toast('Added ' + n);
	};
	$('ar-clist').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var id = b.getAttribute('data-del'); S.custom = S.custom.filter(function (c) { return c.id !== id; }); S.sel = S.sel.filter(function (x) { return x !== id; }); save(); renderCustom(); if (url) renderList(); });
	renderCustom();

	/* bookmarklet + extension version */
	$('ar-bm').setAttribute('href', "javascript:(function(){window.open('https://mes.fm/archive?u='+encodeURIComponent(location.href),'_blank')})()");
	$('ar-bm').addEventListener('click', function (e) { e.preventDefault(); toast('Drag it to your bookmarks bar instead of clicking'); });
	if (window.fetch) fetch('/archive/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { if (m && m.version) $('ar-ver').textContent = 'v' + m.version; }).catch(function () {});

	var q0 = new URLSearchParams(location.search), u0 = q0.get('u') || q0.get('url'); if (u0) { $('ar-url').value = u0; read(); }
})();
