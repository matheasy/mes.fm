/* MES EXIF viewer UI. Parsing = MESExif in lib.js (prepended above). The photo never leaves the browser. */
(function () {
	'use strict';
	var X = MESExif, $ = function (id) { return document.getElementById(id); }, cur = null, objUrl = null;
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('ex-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }
	function bytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }
	var drop = $('ex-drop'), inp = $('ex-file');
	drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
	inp.onchange = function () { if (inp.files[0]) load(inp.files[0]); inp.value = ''; };
	['dragenter', 'dragover'].forEach(function (n) { document.addEventListener(n, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); drop.classList.add('is-over'); } }); });
	['dragleave', 'drop'].forEach(function (n) { document.addEventListener(n, function () { drop.classList.remove('is-over'); }); });
	document.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); load(f); } });
	document.addEventListener('paste', function (e) { var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) { e.preventDefault(); load(f); } });

	function load(f) {
		var fr = new FileReader();
		fr.onload = function () {
			var r = X.parse(fr.result); cur = { file: f, r: r }; if (objUrl) URL.revokeObjectURL(objUrl); objUrl = URL.createObjectURL(f);
			var img = $('ex-img'); img.onload = function () { $('ex-fileinfo').textContent = f.name + ' · ' + r.format + ' · ' + bytes(f.size) + ' · ' + img.naturalWidth + ' × ' + img.naturalHeight + ' px'; cur.w = img.naturalWidth; cur.h = img.naturalHeight; }; img.onerror = function () { $('ex-fileinfo').textContent = f.name + ' · ' + r.format + ' · ' + bytes(f.size) + ' (this browser cannot show it)'; }; img.src = objUrl;
			render(r);
		};
		fr.onerror = function () { toast('Could not read that file'); }; fr.readAsArrayBuffer(f);
	}
	function pick(r, names) { return names.map(function (n) { var x = r.rows.filter(function (q) { return q.name === n; })[0]; return x ? x.value : null; }); }
	function card(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value" style="font-size:1.25em">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function render(r) {
		$('ex-out').hidden = false;
		var fl = r.flags.map(function (t) { return '<div class="ex-flag' + (/GPS location|serial number/.test(t) ? ' bad' : '') + '">' + (/GPS location/.test(t) ? '&#128205; ' : '&#9888;&#65039; ') + esc(t) + '</div>'; }).join('');
		if (r.unsupported) fl += '<div class="ex-flag">This looks like a ' + esc(r.format) + ' file. Browsers cannot read its metadata here yet: export the photo as JPEG from your phone, or use the image converter.</div>';
		else if (!r.rows.length && !r.flags.length) fl += '<div class="ex-flag">No EXIF metadata found in this ' + esc(r.format) + ' file. It may have been removed, or it was screenshotted, downloaded from a social site or compressed by an app.</div>';
		$('ex-flags').innerHTML = fl;
		var cam = pick(r, ['Camera make', 'Camera model', 'Lens model']), taken = pick(r, ['Date taken', 'Date digitized', 'Date modified']), s = pick(r, ['Exposure time', 'Aperture (f-number)', 'ISO', 'Focal length']);
		var c = '';
		c += card('Camera', esc(((cam[0] || '') + ' ' + (cam[1] || '')).trim() || '—'), cam[2] ? 'Lens: ' + esc(cam[2]) : '', true);
		c += card('Taken', esc(taken[0] || taken[1] || '—'), taken[0] ? 'by the camera clock, not checked' : (taken[2] ? 'last modified' : ''));
		c += card('Settings', esc(s.filter(Boolean).join(' · ') || '—'), 'exposure · aperture · ISO · focal length');
		c += card('Location', r.gps ? 'GPS present' : 'None', r.gps ? '' : 'no GPS data in this file');
		$('ex-cards').innerHTML = c;
		var loc = $('ex-loc');
		if (r.gps) { var la = r.gps.lat.toFixed(6), lo = r.gps.lon.toFixed(6); loc.hidden = false; loc.innerHTML = '<b>&#128205; ' + la + ', ' + lo + '</b>' + (r.gps.alt != null ? ' · altitude ' + Math.round(r.gps.alt) + ' m' : '') + '<br><a href="https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=16/' + la + '/' + lo + '" target="_blank" rel="noopener">Open in OpenStreetMap</a> · <a href="https://www.google.com/maps?q=' + la + ',' + lo + '" target="_blank" rel="noopener">Open in Google Maps</a> <span class="tu-note">(opening a map tells that site the place)</span>'; } else loc.hidden = true;
		fillTable(); $('ex-strip').disabled = r.unsupported;
	}
	function fillTable() {
		if (!cur) return; var q = $('ex-find').value.trim().toLowerCase(), rows = cur.r.rows.filter(function (x) { return !q || (x.group + ' ' + x.name + ' ' + x.value).toLowerCase().indexOf(q) >= 0; });
		$('ex-body').innerHTML = rows.map(function (x) { return '<tr' + (x.sensitive ? ' class="sens"' : '') + '><td>' + esc(x.group) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.value) + '</td></tr>'; }).join('');
		$('ex-tbl').hidden = !rows.length; $('ex-none').hidden = !!rows.length; $('ex-none').textContent = cur.r.rows.length ? 'No field matches that filter.' : 'No readable fields.';
	}
	$('ex-find').oninput = fillTable;
	$('ex-copy').onclick = function () {
		if (!cur) return; var t = cur.r.rows.map(function (x) { return x.group + ' / ' + x.name + ': ' + x.value; }).join('\n') || 'No metadata found.';
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Copy failed'); }); else toast('Copy needs a secure page');
	};
	$('ex-strip').onclick = function () {
		if (!cur) return; var img = $('ex-img'); if (!img.naturalWidth) return toast('This browser cannot re-save that picture');
		var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; var x = c.getContext('2d'), isPng = /png|webp|gif/i.test(cur.file.type) && cur.r.format !== 'JPEG';
		if (!isPng) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(img, 0, 0);
		c.toBlob(function (b) { if (!b) return toast('Could not make the copy'); var a = document.createElement('a'), u = URL.createObjectURL(b); a.href = u; a.download = (cur.file.name.replace(/\.[^.]+$/, '') || 'photo') + '-clean.' + (isPng ? 'png' : 'jpg'); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500); toast('Clean copy saved: no metadata'); }, isPng ? 'image/png' : 'image/jpeg', 0.95);
	};
})();
