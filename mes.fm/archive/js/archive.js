/* MES Archive: the table of web-archive services and the URL builder (no DOM; node-testable). Exposed as MESArchive. Also copied to the browser extension (extension/engines.js).
 * An engine: { id, name, g (group), badge: [text, bg], url: template, variants?: [{id,label,v}], note, needs? }. Template tokens: {u} = the page address URL-encoded, {raw} = as is, {v} = the chosen variant. */
(function (root) {
	"use strict";
	var GROUPS = [
		["save", "Save a new copy", "Take a snapshot of the page as it is right now."],
		["find", "Find copies that already exist", "Look for snapshots other people (or you, earlier) already saved."],
		["read", "Read without a paywall", "Open a readable version of an article."],
		["chain", "On a blockchain", "A permanent, tamper-evident copy."]
	];
	var AT = [{ id: "ph", label: "archive.ph", v: "ph" }, { id: "is", label: "archive.is", v: "is" }, { id: "today", label: "archive.today", v: "today" }, { id: "md", label: "archive.md", v: "md" }, { id: "vn", label: "archive.vn", v: "vn" }, { id: "li", label: "archive.li", v: "li" }, { id: "fo", label: "archive.fo", v: "fo" }];
	var ENGINES = [
		{ id: "wb-save", g: "save", name: "Wayback Machine: Save Page Now", badge: ["IA", "#0d5c8c"], url: "https://web.archive.org/save/{raw}", note: "The Internet Archive. Takes a fresh snapshot (can take a minute) and gives you a permanent link." },
		{ id: "at-save", g: "save", name: "archive.today (archive.ph)", badge: ["AT", "#c0392b"], url: "https://archive.{v}/?run=1&url={u}", variants: AT, note: "Saves a full copy, including pages the Wayback Machine cannot. If one address is blocked or slow in your country, pick another." },
		{ id: "ghost", g: "save", name: "Ghostarchive", badge: ["Gh", "#4a4a6a"], url: "https://ghostarchive.org/search?term={u}", note: "Independent archive, good for social media and videos. Press the archive button on the page it opens." },
		{ id: "mega", g: "save", name: "Megalodon (Japan)", badge: ["Me", "#2e7d32"], url: "https://megalodon.jp/?url={u}", note: "A Japanese archive with its own copy of the page. Press the button on the page it opens." },
		{ id: "wb-view", g: "find", name: "Wayback Machine: newest copy", badge: ["IA", "#0d5c8c"], url: "https://web.archive.org/web/{raw}", note: "Opens the most recent snapshot, or tells you there is none." },
		{ id: "wb-all", g: "find", name: "Wayback Machine: all dates (calendar)", badge: ["IA", "#0d5c8c"], url: "https://web.archive.org/web/*/{raw}", note: "A calendar of every snapshot of this address, back to the first." },
		{ id: "at-find", g: "find", name: "archive.today: newest copy", badge: ["AT", "#c0392b"], url: "https://archive.{v}/newest/{raw}", variants: AT, note: "Opens the newest copy saved on archive.today, if any." },
		{ id: "arq", g: "find", name: "Arquivo.pt (Portuguese web archive)", badge: ["Ar", "#b5651d"], url: "https://arquivo.pt/wayback/{raw}", note: "National archive of Portugal: also holds a lot of the wider web." },
		{ id: "rp", g: "read", name: "RemovePaywall", badge: ["RP", "#6a1b9a"], url: "https://www.removepaywall.com/search?url={u}", note: "Tries to show an article without the subscription wall." },
		{ id: "hive", g: "chain", name: "ArcHive: Hive blockchain", badge: ["Hv", "#e31337"], url: "https://dhenz14.github.io/archive/?url={u}", needs: "Hive Keychain", link: ["Get the ArcHive bookmarklet", "https://dhenz14.github.io/archive/"], note: "A third-party tool (ArcHive by dhenz14) that stores the page text on the Hive blockchain with a cryptographic hash. The link opens it with your address and checks whether the page is already archived. To publish a NEW copy from a computer, ArcHive needs the page read inside your browser: use the MES Archive extension (it does this for you) or ArcHive's own bookmarklet. On Android the link alone works. You sign with Hive Keychain or HiveAuth." }
	];
	var SETS = [
		["save", "Save now", ["wb-save", "at-save", "ghost"]],
		["find", "Find existing", ["wb-view", "at-find", "arq"]],
		["both", "Save and check", ["wb-save", "at-save", "ghost", "wb-all", "at-find"]],
		["forever", "Save + Hive", ["wb-save", "at-save", "hive"]],
		["all", "Everything", ENGINES.map(function (e) { return e.id; })]
	];
	var TRACK = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src|ref_url|si|feature|spm|share_id)$/i;
	/* what a person pasted -> a clean http(s) address, or "" */
	function cleanUrl(s, stripTracking) {
		s = String(s || "").trim().replace(/^["'<]+|["'>]+$/g, "");
		if (!s) return "";
		if (/^\/\//.test(s)) s = "https:" + s;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { if (/^[^\s/?#]+\.[^\s/?#]{2,}([/?#].*)?$/.test(s)) s = "https://" + s; else return ""; }
		if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s)) return "";
		try {
			var u = new URL(s);
			if (!/\./.test(u.hostname) && u.hostname !== "localhost") return "";
			if (stripTracking) { Array.from(u.searchParams.keys()).forEach(function (k) { if (TRACK.test(k)) u.searchParams.delete(k); }); }
			return u.href;
		} catch (e) { return ""; }
	}
	function build(engine, url, variant) {
		var v = variant || (engine.variants && engine.variants[0].v) || "";
		return engine.url.replace(/\{u\}/g, encodeURIComponent(url)).replace(/\{raw\}/g, url).replace(/\{v\}/g, v);
	}
	function customUrl(tpl, url) { return tpl.replace(/\{u\}|%s/g, encodeURIComponent(url)).replace(/\{raw\}/g, url); }
	function validTemplate(t) { return /^https?:\/\//i.test(t || "") && /\{u\}|%s|\{raw\}/.test(t); }
	function byId(id) { for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].id === id) return ENGINES[i]; return null; }
	root.MESArchive = { GROUPS: GROUPS, ENGINES: ENGINES, SETS: SETS, AT: AT, cleanUrl: cleanUrl, build: build, customUrl: customUrl, validTemplate: validTemplate, byId: byId };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESArchive;
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : globalThis));

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
				h += '<div class="ar-eng' + (on ? ' on' : '') + '"><input type="checkbox" data-id="' + e.id + '"' + (on ? ' checked' : '') + ' aria-label="Use ' + esc(e.name) + '"><span class="ar-badge" style="background:' + b[1] + '" aria-hidden="true">' + esc(b[0]) + '</span><div class="ar-eng__t"><div class="ar-eng__n">' + esc(e.name) + '</div><div class="ar-eng__d">' + esc(e.note || '') + (e.needs ? ' <b>Needs ' + esc(e.needs) + '.</b>' : '') + (e.link ? ' <a href="' + esc(e.link[1]) + '" target="_blank" rel="noopener">' + esc(e.link[0]) + '</a>' : '') + '</div></div>' + v + '<button type="button" class="tu-btn tu-btn--ghost ar-open" data-open="' + e.id + '">Open</button></div>';
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
