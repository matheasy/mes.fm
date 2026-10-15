/* MES Reverse Image Search: engine table + URL builder (no DOM; node-testable via require). Exposed as window.MESImgSearch.
 * An engine: { id, name, g (group), badge: [text, bg, fg?], home: the site's own page, opened when the image is pasted there, url: template with {u} (the URL-encoded image link), up: { action, field } when the site accepts a file POSTed
 * straight from another page (only sites verified to do so), note }. Sites that block cross-site uploads (Google Lens answers 403, TinEye 405) take a link, or the
 * image pasted with Ctrl+V after the page opens: the app copies the image to the clipboard for that. */
(function (root) {
	"use strict";
	var GROUPS = [
		["general", "General reverse image search", "Find where a picture appears, bigger versions, and what it shows."],
		["original", "Find the original & check copies", "Who posted it first, and where else it has been reused."],
		["art", "Art, anime & illustration", "Sources for artwork, anime screenshots and fan art."],
		["info", "Metadata", "Camera, date and location data hidden inside a photo."]
	];
	var ENGINES = [
		{ id: "lens", home: "https://lens.google.com/", g: "general", name: "Google Lens", badge: ["G", "#4285f4"], url: "https://lens.google.com/uploadbyurl?url={u}", note: "Matches, objects, text, products and places. Also reads text in the picture." },
		{ id: "bing", home: "https://www.bing.com/visualsearch", g: "general", name: "Bing Visual Search", badge: ["B", "#008373"], url: "https://www.bing.com/images/search?view=detailv2&iss=sbi&FORM=SBIHMP&sbisrc=UrlPaste&q=imgurl:{u}", note: "Good for products, landmarks and similar pictures." },
		{ id: "yandex", home: "https://yandex.com/images/", g: "general", name: "Yandex Images", badge: ["Ya", "#fc3f1d"], url: "https://yandex.com/images/search?rpt=imageview&url={u}", note: "Often the best for finding the same picture on other sites. May ask for a captcha." },
		{ id: "baidu", home: "https://graph.baidu.com/pcpage/index?tpl_from=pc", g: "general", name: "Baidu", badge: ["百", "#2932e1"], url: "https://graph.baidu.com/details?isfromtusoupc=1&tn=pc&carousel=0&promotion_name=pc_image_shituindex&image={u}", note: "Strong for pictures that appear on Chinese-language sites." },
		{ id: "sogou", home: "https://pic.sogou.com/", g: "general", name: "Sogou", badge: ["So", "#fb6c00"], url: "https://pic.sogou.com/ris?query={u}&flag=1&drag=0", note: "Another Chinese search engine with image matching." },
		{ id: "tineye", home: "https://tineye.com/", g: "original", name: "TinEye", badge: ["Ti", "#1a8fbf"], url: "https://tineye.com/search?url={u}", note: "The classic: exact and edited copies, oldest and biggest versions. Sort by 'Oldest' to find the original." },
		{ id: "saucenao", home: "https://saucenao.com/", g: "art", name: "SauceNAO", badge: ["Sa", "#6a4c93"], url: "https://saucenao.com/search.php?url={u}", up: { action: "https://saucenao.com/search.php", field: "file" }, note: "Artwork, manga and anime. Accepts a file directly from this page." },
		{ id: "iqdb", home: "https://iqdb.org/", g: "art", name: "IQDB", badge: ["Iq", "#d24d57"], url: "https://iqdb.org/?url={u}", up: { action: "https://iqdb.org/", field: "file" }, note: "Searches Danbooru, Gelbooru, Pixiv and others at once. Accepts a file directly." },
		{ id: "tracemoe", home: "https://trace.moe/", g: "art", name: "trace.moe", badge: ["Tm", "#2e86de"], url: "https://trace.moe/?url={u}", note: "Which anime episode and minute a screenshot is from." },
		{ id: "ascii2d", home: "https://ascii2d.net/", g: "art", name: "ascii2d", badge: ["A2", "#3d3d3d"], url: "https://ascii2d.net/search/url/{u}", note: "Finds Pixiv / Twitter artwork even when it is cropped or recoloured." },
		{ id: "exif", home: "https://exif.regex.info/exif.cgi", g: "info", name: "Jeffrey's Exif Viewer", badge: ["Ex", "#5b7c99"], url: "http://exif.regex.info/exif.cgi?imgurl={u}", note: "Camera model, date taken and GPS location, if the file still has it." }
	];
	var SETS = [
		["popular", "Popular", ["lens", "bing", "yandex", "tineye"]],
		["original", "Find the original", ["tineye", "yandex", "lens", "baidu"]],
		["art", "Art & anime", ["saucenao", "iqdb", "tracemoe", "ascii2d", "yandex"]],
		["all", "Everything", ENGINES.map(function (e) { return e.id; })]
	];
	function isImageUrl(s) { return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test((s || "").trim()); }
	/* Turn what a person pasted into a clean link: trims, adds https:// to a bare "example.com/a.jpg", unwraps a Google / Bing "imgurl=" redirect. */
	function cleanLink(s) {
		s = (s || "").trim().replace(/^["'<]+|["'>]+$/g, "");
		if (!s) return "";
		if (/^\/\//.test(s)) s = "https:" + s;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[^\s/]+\.[^\s/]{2,}\//.test(s)) s = "https://" + s;
		var m = /[?&](?:imgurl|mediaurl|image_url)=([^&]+)/i.exec(s);
		if (m) { try { var d = decodeURIComponent(m[1]); if (/^https?:\/\//i.test(d)) s = d; } catch (e) {} }
		return s;
	}
	function build(engine, link) { return engine.url.replace(/\{u\}/g, encodeURIComponent(link)); }
	/* A custom engine's template may use {u} (encoded link), {raw} (as typed) or %s (encoded link). */
	function customUrl(tpl, link) { return tpl.replace(/\{u\}|%s/g, encodeURIComponent(link)).replace(/\{raw\}/g, link); }
	function validTemplate(t) { return /^https?:\/\//i.test(t || "") && /\{u\}|%s|\{raw\}/.test(t); }
	function byId(id) { for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].id === id) return ENGINES[i]; return null; }
	root.MESImgSearch = { GROUPS: GROUPS, ENGINES: ENGINES, SETS: SETS, isImageUrl: isImageUrl, cleanLink: cleanLink, build: build, customUrl: customUrl, validTemplate: validTemplate, byId: byId };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESImgSearch;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Reverse Image Search UI. Engine table and URL building = MESImgSearch in lib.js (prepended above). */
(function () {
	'use strict';
	var M = MESImgSearch, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-image-search:v1';
	var S = { sel: M.SETS[0][2].slice(), custom: [] };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { if (Array.isArray(sv.sel)) S.sel = sv.sel; if (Array.isArray(sv.custom)) S.custom = sv.custom; } } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var mode = 'link', link = '', ok = false;
	var base = null, rot = 0, flip = false, crop = null, blobPng = null, blobJpg = null, fileName = 'image', rebuildT;
	var toastT;
	function toast(m) { var t = $('ri-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2600); }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function all() { return M.ENGINES.concat(S.custom.map(function (c) { return { id: c.id, name: c.name, g: 'custom', badge: [c.name.slice(0, 2), '#64748b'], custom: c.tpl, note: 'Your own site.' }; })); }

	/* ---------- mode ---------- */
	function setMode(m) {
		mode = m; Array.prototype.forEach.call($('ri-mode').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === m)); });
		$('ri-linkbox').hidden = m !== 'link'; $('ri-filebox').hidden = m !== 'file'; $('ri-stage').setAttribute('data-m', m); refresh();
	}
	$('ri-mode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setMode(b.getAttribute('data-m')); });

	/* ---------- link ---------- */
	function readLink() {
		link = M.cleanLink($('ri-link').value); ok = M.isImageUrl(link);
		var img = $('ri-img');
		if (ok) { if (img.getAttribute('data-src') !== link) { img.setAttribute('data-src', link); $('ri-info').textContent = 'Checking the picture…'; img.src = link; } }
		else { img.removeAttribute('src'); img.removeAttribute('data-src'); }
		refresh();
	}
	$('ri-img').addEventListener('load', function () { if (mode !== 'link') return; $('ri-info').textContent = this.naturalWidth + ' × ' + this.naturalHeight + ' px'; $('ri-hint').textContent = 'Every ticked site opens already searching for this picture.'; });
	$('ri-img').addEventListener('error', function () { if (mode !== 'link' || !ok) return; $('ri-info').textContent = 'No preview'; $('ri-hint').textContent = 'The picture could not be shown here (the site may block it, or the link is not a direct image link). The search sites may still be able to load it: try Open.'; });
	$('ri-link').addEventListener('input', readLink);
	$('ri-link').addEventListener('keydown', function (e) { if (e.key === 'Enter') { readLink(); openSelected(); } });
	$('ri-pastelink').onclick = function () {
		if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { $('ri-link').value = t; readLink(); }, function () { toast('Press Ctrl/⌘+V in the box instead'); $('ri-link').focus(); });
		else { toast('Press Ctrl/⌘+V in the box'); $('ri-link').focus(); }
	};

	/* ---------- file ---------- */
	var drop = $('ri-drop'), fileIn = $('ri-file');
	drop.onclick = function () { fileIn.click(); };
	drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } };
	fileIn.onchange = function () { if (fileIn.files[0]) loadFile(fileIn.files[0]); fileIn.value = ''; };
	['dragenter', 'dragover'].forEach(function (n) { document.addEventListener(n, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); drop.classList.add('is-over'); } }); });
	['dragleave', 'drop'].forEach(function (n) { document.addEventListener(n, function () { drop.classList.remove('is-over'); }); });
	document.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) { e.preventDefault(); loadFile(f); } else if (e.dataTransfer && e.dataTransfer.getData('text/uri-list')) { e.preventDefault(); setMode('link'); $('ri-link').value = e.dataTransfer.getData('text/uri-list').split('\n')[0]; readLink(); } });
	document.addEventListener('paste', function (e) {
		var cd = e.clipboardData; if (!cd) return; var i, f;
		for (i = 0; i < (cd.files || []).length; i++) if (/^image\//.test(cd.files[i].type)) { f = cd.files[i]; break; }
		if (f) { e.preventDefault(); loadFile(f); return; }
		var t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
		var txt = cd.getData('text'); if (txt && M.isImageUrl(M.cleanLink(txt))) { e.preventDefault(); setMode('link'); $('ri-link').value = txt; readLink(); }
	});
	function loadFile(f) {
		if (!/^image\//.test(f.type)) return toast('That is not a picture file');
		var url = URL.createObjectURL(f), im = new Image();
		im.onload = function () {
			var max = 4096, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
			c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
			base = c; rot = 0; flip = false; crop = null; fileName = (f.name || 'image').replace(/\.[^.]+$/, '') || 'image'; setMode('file'); drawBase(); refresh(); scheduleBlobs();
		};
		im.onerror = function () { URL.revokeObjectURL(url); toast('Could not read that picture. Try a JPG or PNG.'); };
		im.src = url;
	}

	/* the working picture (rotated / flipped copy of base) and the cropped output */
	var work = null;
	function makeWork() {
		var w = base.width, h = base.height, q = rot % 2 === 1, c = document.createElement('canvas'); c.width = q ? h : w; c.height = q ? w : h;
		var x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 2); if (flip) x.scale(-1, 1); x.drawImage(base, -w / 2, -h / 2); work = c;
	}
	function drawBase() {
		makeWork(); var cv = $('ri-cv'); cv.width = work.width; cv.height = work.height; cv.getContext('2d').drawImage(work, 0, 0);
		$('ri-prev').hidden = false; $('ri-edit').hidden = false; $('ri-stage').setAttribute('data-m', 'file'); showSel(); updateInfo();
	}
	function outCanvas() { if (!work) return null; if (!crop) return work; var c = document.createElement('canvas'); c.width = crop.w; c.height = crop.h; c.getContext('2d').drawImage(work, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h); return c; }
	function updateInfo() {
		if (!work) return; var o = crop ? crop : { w: work.width, h: work.height };
		$('ri-info').textContent = (crop ? 'Selected area: ' : '') + o.w + ' × ' + o.h + ' px';
		$('ri-nosel').hidden = !crop;
		$('ri-hint').textContent = crop ? 'Only the selected area is searched.' : 'Tip: drag a box on the picture to search just one object, person or logo.';
	}
	function scheduleBlobs() {
		blobPng = blobJpg = null; clearTimeout(rebuildT); rebuildT = setTimeout(function () {
			var c = outCanvas(); if (!c) return;
			c.toBlob(function (b) { blobPng = b; }, 'image/png');
			var j = document.createElement('canvas'); j.width = c.width; j.height = c.height; var x = j.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, j.width, j.height); x.drawImage(c, 0, 0); j.toBlob(function (b) { blobJpg = b; }, 'image/jpeg', 0.92);
		}, 120);
	}
	$('ri-edit').addEventListener('click', function (e) {
		var b = e.target.closest('[data-op]'); if (!b || !base) return; var op = b.getAttribute('data-op');
		if (op === 'rl') rot = (rot + 3) % 4; else if (op === 'rr') rot = (rot + 1) % 4; else if (op === 'fh') flip = !flip;
		crop = null; drawBase(); scheduleBlobs(); refresh();
	});
	/* drag a selection on the canvas */
	var cvEl = $('ri-cv'), drag = null;
	function pt(e) { var r = cvEl.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
	cvEl.addEventListener('pointerdown', function (e) { if (!work) return; cvEl.setPointerCapture(e.pointerId); drag = pt(e); });
	cvEl.addEventListener('pointermove', function (e) { if (!drag) return; var p = pt(e); setCrop(drag, p, false); });
	cvEl.addEventListener('pointerup', function (e) { if (!drag) return; var p = pt(e); setCrop(drag, p, true); drag = null; });
	cvEl.addEventListener('pointercancel', function () { drag = null; });
	function setCrop(a, b, done) {
		var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), w = work.width, h = work.height;
		var c = { x: Math.round(x0 * w), y: Math.round(y0 * h), w: Math.round((x1 - x0) * w), h: Math.round((y1 - y0) * h) };
		if (c.w < 24 || c.h < 24) { if (done) { crop = null; showSel(); updateInfo(); scheduleBlobs(); refresh(); } else showTmp(x0, y0, x1, y1); return; }
		if (!done) { showTmp(x0, y0, x1, y1); return; }
		crop = c; showSel(); updateInfo(); scheduleBlobs(); refresh();
	}
	function showTmp(x0, y0, x1, y1) { var s = $('ri-sel'); s.hidden = false; s.style.left = x0 * 100 + '%'; s.style.top = y0 * 100 + '%'; s.style.width = (x1 - x0) * 100 + '%'; s.style.height = (y1 - y0) * 100 + '%'; }
	function showSel() { var s = $('ri-sel'); if (!crop || !work) { s.hidden = true; return; } showTmp(crop.x / work.width, crop.y / work.height, (crop.x + crop.w) / work.width, (crop.y + crop.h) / work.height); }
	$('ri-nosel').onclick = function () { crop = null; showSel(); updateInfo(); scheduleBlobs(); refresh(); };
	/* let the preview be dragged onto a search site's own drop zone (file mode) */
	$('ri-img').addEventListener('dragstart', function (e) { if (mode === 'link' && ok) { e.dataTransfer.setData('text/uri-list', link); } });

	/* ---------- engines ---------- */
	function ready() { return mode === 'link' ? ok : !!work; }
	function refresh() {
		var show = ready(); $('ri-engines').hidden = !show; if (mode === 'link') $('ri-prev').hidden = !ok; else $('ri-prev').hidden = !work;
		if ($('ri-edit')) $('ri-edit').hidden = mode !== 'file';
		if (!show) return; renderList();
	}
	function renderList() {
		var eng = all(), h = '', groups = M.GROUPS.concat(S.custom.length ? [['custom', 'Your own sites', '']] : []);
		groups.forEach(function (g) {
			var list = eng.filter(function (e) { return e.g === g[0]; }); if (!list.length) return;
			h += '<h3 class="ri-grp">' + esc(g[1]) + '</h3>' + (g[2] ? '<p class="tu-note ri-gdesc">' + esc(g[2]) + '</p>' : '');
			list.forEach(function (e) {
				var on = S.sel.indexOf(e.id) >= 0, b = e.badge, direct = mode === 'file' && e.up;
				h += '<div class="ri-eng' + (on ? ' on' : '') + '"><input type="checkbox" data-id="' + e.id + '"' + (on ? ' checked' : '') + ' aria-label="Use ' + esc(e.name) + '"><span class="ri-badge" style="background:' + b[1] + (b[2] ? ';color:' + b[2] : '') + '" aria-hidden="true">' + esc(b[0]) + '</span><div class="ri-eng__t"><div class="ri-eng__n">' + esc(e.name) + (direct ? '<span class="ri-tag">file sent directly</span>' : '') + '</div><div class="ri-eng__d">' + esc(e.note || '') + '</div></div><button type="button" class="tu-btn tu-btn--ghost ri-open" data-open="' + e.id + '">Open</button></div>';
			});
		});
		$('ri-list').innerHTML = h;
		var n = S.sel.filter(function (id) { return eng.some(function (e) { return e.id === id; }); }).length;
		$('ri-go').textContent = 'Open ' + n + ' selected'; $('ri-go').disabled = !n;
		$('ri-sets').innerHTML = M.SETS.map(function (s) { return '<button type="button" class="tu-chip" data-set="' + s[0] + '" aria-pressed="' + (sameSet(s[2]) ? 'true' : 'false') + '">' + esc(s[1]) + '</button>'; }).join('') + '<button type="button" class="tu-chip" data-set="none">Clear</button>';
		$('ri-modenote').innerHTML = mode === 'link' ? 'Each site opens in a new tab and starts searching for your link.' : 'Your picture is copied to the clipboard when you open a site: <b>press Ctrl/⌘+V on the page that opens</b>. Sites marked <i>file sent directly</i> need no pasting.';
	}
	function sameSet(a) { return a.length === S.sel.length && a.every(function (x) { return S.sel.indexOf(x) >= 0; }); }
	$('ri-sets').addEventListener('click', function (e) { var b = e.target.closest('[data-set]'); if (!b) return; var id = b.getAttribute('data-set'); if (id === 'none') S.sel = []; else M.SETS.forEach(function (s) { if (s[0] === id) S.sel = s[2].slice(); }); save(); renderList(); });
	$('ri-list').addEventListener('change', function (e) { var c = e.target.closest('input[data-id]'); if (!c) return; var id = c.getAttribute('data-id'), i = S.sel.indexOf(id); if (c.checked && i < 0) S.sel.push(id); else if (!c.checked && i >= 0) S.sel.splice(i, 1); save(); renderList(); });
	$('ri-list').addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (!b) return; var en = all().filter(function (x) { return x.id === b.getAttribute('data-open'); })[0]; if (en) { clearQueue(); openOne(en, true); } });
	$('ri-go').onclick = function () { openSelected(); };

	/* ---------- opening ---------- */
	function copyImage() {
		if (!blobPng) { toast('Still preparing the picture, press Open again in a second'); return false; }
		if (navigator.clipboard && window.ClipboardItem) { try { navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPng })]).catch(function () { toast('Could not copy the picture: drag the preview onto the site instead'); }); return true; } catch (e) {} }
		toast('Your browser cannot copy pictures: drag the preview onto the site, or save it and use the site\'s upload button'); return true;
	}
	function postFile(en) {
		if (!blobJpg) { toast('Still preparing the picture, press Open again in a second'); return null; }
		var f = new File([blobJpg], fileName + '.jpg', { type: 'image/jpeg' }), form = document.createElement('form'), inp = document.createElement('input'), dt = new DataTransfer();
		form.method = 'POST'; form.enctype = 'multipart/form-data'; form.action = en.up.action; form.target = '_blank'; form.style.display = 'none'; inp.type = 'file'; inp.name = en.up.field; dt.items.add(f); inp.files = dt.files; form.appendChild(inp);
		document.body.appendChild(form); form.submit(); setTimeout(function () { form.remove(); }, 1000); return true;
	}
	/* returns the opened window / true, or a link to offer when the popup was blocked, or null on a problem */
	function openOne(en, single) {
		if (mode === 'link') {
			var url = en.custom ? M.customUrl(en.custom, link) : M.build(en, link), w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch (e) {} return true; } return single ? (queueLinks([{ en: en, url: url }]), false) : { en: en, url: url };
		}
		if (en.up) return postFile(en) ? true : null;
		if (single) copyImage();
		var home = en.custom ? en.custom.replace(/\{u\}|%s|\{raw\}/g, '') : en.home, w2 = window.open(home, '_blank'); if (w2) { try { w2.opener = null; } catch (e) {} if (single) toast('Picture copied: press Ctrl/⌘+V on the ' + en.name + ' page'); return true; }
		return single ? (queueLinks([{ en: en, url: home }]), false) : { en: en, url: home };
	}
	function openSelected() {
		if (!ready()) return toast(mode === 'link' ? 'Paste an image link first' : 'Choose a picture first');
		var list = all().filter(function (e) { return S.sel.indexOf(e.id) >= 0; }); if (!list.length) return toast('Tick at least one site');
		clearQueue(); var blocked = [], needCopy = mode === 'file' && list.some(function (e) { return !e.up; });
		if (needCopy) copyImage();
		list.forEach(function (e) { var r = openOne(e, false); if (r && r !== true) blocked.push(r); });
		if (blocked.length) queueLinks(blocked); else if (needCopy) toast('Picture copied: press Ctrl/⌘+V on each page that opened');
	}
	function queueLinks(items) {
		var q = $('ri-queue'); q.hidden = false;
		q.innerHTML = '<b>Your browser blocked ' + (items.length === 1 ? 'a pop-up' : items.length + ' pop-ups') + '.</b> Click each link to open it' + (mode === 'file' ? ' (the picture is still on your clipboard)' : '') + ', or allow pop-ups for mes.fm and press Open again.<br>' + items.map(function (it) { return '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.en.name) + '</a>'; }).join('');
	}
	function clearQueue() { $('ri-queue').hidden = true; }

	/* ---------- custom engines ---------- */
	function renderCustom() {
		$('ri-clist').innerHTML = S.custom.map(function (c) { return '<div class="ri-eng"><div class="ri-eng__t"><div class="ri-eng__n">' + esc(c.name) + '</div><div class="ri-eng__d">' + esc(c.tpl) + '</div></div><button type="button" class="tu-btn tu-btn--ghost" data-del="' + c.id + '">Remove</button></div>'; }).join('');
	}
	$('ri-cadd').onclick = function () {
		var n = $('ri-cname').value.trim(), t = $('ri-ctpl').value.trim();
		if (!n) return toast('Give the site a name'); if (!M.validTemplate(t)) return toast('The address must start with http(s):// and contain %s where the image link goes');
		var id = 'c' + Date.now().toString(36); S.custom.push({ id: id, name: n, tpl: t }); S.sel.push(id); save(); $('ri-cname').value = ''; $('ri-ctpl').value = ''; renderCustom(); refresh(); toast('Added ' + n);
	};
	$('ri-clist').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var id = b.getAttribute('data-del'); S.custom = S.custom.filter(function (c) { return c.id !== id; }); S.sel = S.sel.filter(function (x) { return x !== id; }); save(); renderCustom(); refresh(); });
	renderCustom();

	/* ---------- start: ?u=<image link> opens it ready to search ---------- */
	var q = new URLSearchParams(location.search), u = q.get('u') || q.get('url') || q.get('image');
	if (u) { $('ri-link').value = u; readLink(); }
	setMode('link');
})();
