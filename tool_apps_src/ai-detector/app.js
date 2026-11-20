/* MES AI Detector UI (mes.fm/ai-detector). Logic = MESAID (lib.js) + MESExif (exif-viewer lib, via lib_from). Nothing is uploaded; the optional models
   (onnx-community/ai-image-detect-distilled-ONNX, MIT; Xenova/distilgpt2, Apache 2.0) run in the browser through transformers.js 3.7.6. Debug: window.MESAIDDebug. */
(function () {
	'use strict';
	var A = MESAID, $ = function (id) { return document.getElementById(id); }, root = $('aid');
	if (!root) return;
	var LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js', T = null, cls = null, lm = null, tok = null;
	var IMG_MODEL = 'onnx-community/ai-image-detect-distilled-ONNX', IMG_REV = '7f067e23521eeb6d6525221af82c613fb746aaff', LM_MODEL = 'Xenova/distilgpt2';
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('aid-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2600); }
	function bytes(n) { return n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
	function loadLib() { return T ? Promise.resolve(T) : new Function('u', 'return import(u)')(LIB).then(function (m) { T = m; m.env.allowLocalModels = false; return m; }); }
	function progress(box, label) {
		var el = $(box); el.hidden = false; var bar = el.querySelector('i'), txt = el.querySelector('span'), files = {};
		function set(f, t) { bar.style.width = Math.round(f * 100) + '%'; txt.textContent = t; }
		set(0, label);
		return { cb: function (p) { if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; var l = 0, t = 0; for (var k in files) { l += files[k][0]; t += files[k][1]; } set(l / t, 'Downloading ' + bytes(l) + ' of ' + bytes(t) + '…'); } }, set: set, done: function () { el.hidden = true; } };
	}

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll('.aid-tabs [role=tab]');
	function showTab(id, push) {
		tabs.forEach(function (b) { var on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; $('aid-p-' + b.dataset.tab).hidden = !on; });
		if (push) try { var u = new URL(location.href); u.searchParams.set('tab', id); history.replaceState(null, '', u); } catch (e) {}
	}
	tabs.forEach(function (b, i) {
		b.onclick = function () { showTab(b.dataset.tab, true); };
		b.onkeydown = function (e) { var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); var nb = tabs[(i + d + tabs.length) % tabs.length]; nb.focus(); nb.click(); };
	});
	var qt = /[?&]tab=(img|vid|text)\b/.exec(location.search); if (qt) showTab(qt[1]);
	function curTab() { var t = 'img'; tabs.forEach(function (b) { if (b.getAttribute('aria-selected') === 'true') t = b.dataset.tab; }); return t; }

	/* ---------- shared rendering ---------- */
	var LV = { ai: ['&#9888;&#65039;', 'Strong AI evidence'], real: ['&#128247;&#65038;', 'Strong camera evidence'], mixed: ['&#9878;&#65038;', 'Evidence both ways'], 'lean-ai': ['&#8599;&#65038;', 'Leans AI (weak)'], 'lean-real': ['&#8600;&#65038;', 'Leans real (weak)'], none: ['&#10067;&#65038;', 'No evidence either way'], unclear: ['&#10067;&#65038;', 'Unclear'] };
	function renderSum(id, S) { var s = A.summary(S), l = LV[s.level]; $(id).className = 'aid-sum aid-sum--' + s.level; $(id).innerHTML = '<span class="aid-sum__ic">' + l[0] + '</span><div><b>' + l[1] + '</b><span>' + esc(s.text) + ' Not a verdict: read the clues below.</span></div>'; }
	var DIR = { ai: ['Points to AI', '&#9650;'], real: ['Points to real', '&#9660;'], info: ['Neutral', '&#9679;'] };
	function renderSigs(id, S) {
		var order = { strong: 0, medium: 1, weak: 2 }, dirO = { ai: 0, real: 1, info: 2 };
		S = S.slice().sort(function (a, b) { return order[a.strength] - order[b.strength] || dirO[a.dir] - dirO[b.dir]; });
		$(id).innerHTML = S.map(function (s) { return '<div class="aid-sig aid-sig--' + s.dir + '"><div class="aid-sig__top"><span class="aid-sig__dir">' + DIR[s.dir][1] + ' ' + DIR[s.dir][0] + '</span><span class="aid-str aid-str--' + s.strength + '">' + s.strength + '</span>' + (s.src && s.src !== 'none' ? '<span class="aid-src">' + esc(s.src) + '</span>' : '') + '</div><div class="aid-sig__t">' + esc(s.title) + '</div>' + (s.detail ? '<div class="aid-sig__d">' + esc(s.detail) + '</div>' : '') + '</div>'; }).join('');
	}
	function dropzone(dropId, inputId, onFile, accept) {
		var drop = $(dropId), inp = $(inputId);
		drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
		inp.onchange = function () { if (inp.files[0]) onFile(inp.files[0]); inp.value = ''; };
		drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
		drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
		drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); var f = e.dataTransfer.files[0]; if (f) onFile(f); });
	}
	document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
	document.addEventListener('drop', function (e) {
		if (e.defaultPrevented || !e.dataTransfer || !e.dataTransfer.files[0]) return; e.preventDefault(); routeFile(e.dataTransfer.files[0]);
	});
	document.addEventListener('paste', function (e) {
		if (/^(TEXTAREA|INPUT)$/.test((document.activeElement || {}).tagName || '')) return;
		var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) { e.preventDefault(); routeFile(f); return; }
		var t = e.clipboardData && e.clipboardData.getData('text'); if (t && t.length > 40 && !/^https?:\/\//.test(t.trim())) { e.preventDefault(); showTab('text', true); $('aid-text').value = t; checkText(); }
	});
	function routeFile(f) {
		if (/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) { showTab('vid', true); loadVideo(f); }
		else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|heic|tiff?)$/i.test(f.name)) { showTab('img', true); loadImage(f, f.name); }
		else if (/^text\//.test(f.type) || /\.(txt|md|html?|csv|srt)$/i.test(f.name)) { showTab('text', true); f.text().then(function (t) { $('aid-text').value = t; checkText(); }); }
		else toast('That kind of file can\'t be checked here');
	}

	/* ---------- PICTURE ---------- */
	var img = { file: null, bmp: null, u8: null, S: [], view: 'orig', ela: null, noise: null, cls: null };
	dropzone('aid-idrop', 'aid-ifile', function (f) { loadImage(f, f.name); });
	$('aid-iurlf').onsubmit = function (e) {
		e.preventDefault(); var u = $('aid-iurl').value.trim(); if (!/^https?:\/\//i.test(u)) return toast('Paste a link that starts with https://');
		toast('Downloading…');
		fetch(u, { mode: 'cors' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).catch(function () { return fetch('/api/image-fetch?url=' + encodeURIComponent(u)).then(function (r) { if (!r.ok) throw new Error('Could not download that picture (' + r.status + ')'); return r.blob(); }); })
			.then(function (b) { loadImage(b, u.split(/[?#]/)[0].split('/').pop() || 'picture'); }).catch(function (er) { toast(er && er.message ? er.message : 'Could not download that picture'); });
	};
	function loadImage(file, name) {
		img = { file: file, name: name || 'picture', bmp: null, u8: null, S: [], view: 'orig', ela: null, noise: null, cls: null };
		file.arrayBuffer().then(function (buf) {
			img.u8 = new Uint8Array(buf);
			return createImageBitmap(file).catch(function () { return null; });
		}).then(function (bmp) {
			img.bmp = bmp; var ex = null; try { ex = typeof MESExif !== 'undefined' ? MESExif.parse(img.u8) : null; } catch (e) {}
			var r = A.scanImage(img.u8, { exif: ex, w: bmp ? bmp.width : 0, h: bmp ? bmp.height : 0 }); img.r = r; img.S = r.signals;
			$('aid-iout').hidden = false; $('aid-ifinfo').textContent = img.name + ' · ' + r.info.format + ' · ' + bytes(img.u8.length) + (bmp ? ' · ' + bmp.width + ' × ' + bmp.height + ' px' : ' · this browser can\'t show it');
			renderImg(); setView('orig'); renderPrompt(r.info);
			$('aid-imodel').disabled = !bmp; $('aid-imodel').textContent = 'Run the AI-picture model';
			if (cls && bmp) runImgModel();
		}).catch(function () { toast('Could not read that file'); });
	}
	function renderImg() { var S = img.S.slice(); if (img.cls) S.push(img.cls); renderSum('aid-isum', S); renderSigs('aid-isigs', S); }
	function renderPrompt(info) {
		var el = $('aid-iprompt'); if (!info.prompt && !info.settings) { el.hidden = true; return; }
		var st = info.settings ? Object.keys(info.settings).map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + esc(info.settings[k]) + '</td></tr>'; }).join('') : '';
		el.hidden = false; el.innerHTML = '<h3 class="aid-h">The prompt saved in the file</h3>' + (info.prompt ? '<blockquote class="aid-q">' + esc(info.prompt) + '</blockquote>' : '') + (st ? '<div class="tu-table-wrap"><table class="tu-table aid-kv"><tbody>' + st + '</tbody></table></div>' : '');
	}
	var NOTES = { orig: '', ela: 'Error level: the picture saved again as a JPEG and compared with itself. Areas that were pasted in or saved fewer times can look brighter or flatter than the rest. Edges and fine detail are always brighter. A visual aid only.', noise: 'Noise: what is left after smoothing. Real camera photos have fine grain everywhere; generated or retouched areas are often too smooth or have a repeating texture. A visual aid only.' };
	function maxCanvas(w, h, m) { var k = Math.min(1, m / Math.max(w, h)); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; }
	function setView(v) {
		if (!img.bmp) return; img.view = v;
		$('aid-iview').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); });
		$('aid-ivnote').textContent = NOTES[v];
		var cv = $('aid-icv'), sz = maxCanvas(img.bmp.width, img.bmp.height, 1600), x;
		cv.width = sz[0]; cv.height = sz[1]; x = cv.getContext('2d'); x.drawImage(img.bmp, 0, 0, sz[0], sz[1]);
		if (v === 'orig') return;
		var d = x.getImageData(0, 0, sz[0], sz[1]);
		if (v === 'noise') { var nm = img.noise || (img.noise = A.noiseMap(d.data, sz[0], sz[1], 8)); x.putImageData(new ImageData(nm.data, sz[0], sz[1]), 0, 0); $('aid-ivnote').textContent = NOTES.noise + ' Noise level across the picture: ' + nm.p10.toFixed(1) + ' (calm 10%) to ' + nm.p90.toFixed(1) + ' (busy 10%).'; return; }
		if (img.ela) { x.putImageData(new ImageData(img.ela, sz[0], sz[1]), 0, 0); return; }
		cv.toBlob(function (b) {
			createImageBitmap(b).then(function (bm) {
				var c2 = document.createElement('canvas'); c2.width = sz[0]; c2.height = sz[1]; var y = c2.getContext('2d'); y.drawImage(bm, 0, 0);
				var e = A.elaMap(d.data, y.getImageData(0, 0, sz[0], sz[1]).data, 15); img.ela = e.data; if (img.view === 'ela') x.putImageData(new ImageData(e.data, sz[0], sz[1]), 0, 0);
			});
		}, 'image/jpeg', 0.9);
	}
	$('aid-iview').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setView(b.dataset.v); });
	/* fill window */
	function fill(on) { var st = $('aid-istage'); st.classList.toggle('is-fill', on); document.body.classList.toggle('aid-filling', on); $('aid-iclose').hidden = !on; $('aid-ifill').setAttribute('aria-pressed', on ? 'true' : 'false'); }
	$('aid-ifill').onclick = function () { fill(!$('aid-istage').classList.contains('is-fill')); };
	$('aid-iclose').onclick = function () { fill(false); };
	document.addEventListener('keydown', function (e) {
		if (/^(TEXTAREA|INPUT|SELECT)$/.test((e.target || {}).tagName || '')) return;
		if (e.key === 'Escape' && $('aid-istage').classList.contains('is-fill')) fill(false);
		else if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && curTab() === 'img' && img.bmp) fill(!$('aid-istage').classList.contains('is-fill'));
	});

	/* image model */
	function getCls(p) {
		if (cls) return Promise.resolve(cls);
		return loadLib().then(function (m) { return m.pipeline('image-classification', IMG_MODEL, { dtype: 'q8', revision: IMG_REV, progress_callback: p.cb }); }).then(function (c) { cls = c; return c; });
	}
	function canvasUrl(src, w, h) { return new Promise(function (res) { var c = document.createElement('canvas'), sz = maxCanvas(w, h, 512); c.width = sz[0]; c.height = sz[1]; c.getContext('2d').drawImage(src, 0, 0, sz[0], sz[1]); c.toBlob(function (b) { res(URL.createObjectURL(b)); }, 'image/png'); }); }
	function classify(src, w, h) { return canvasUrl(src, w, h).then(function (u) { return cls(u, { top_k: 2 }).then(function (o) { URL.revokeObjectURL(u); return A.clsProb(o); }); }); }
	function runImgModel() {
		if (!img.bmp) return; var p = progress('aid-iprog', 'Loading the model…'), b = $('aid-imodel'); b.disabled = true;
		getCls(p).then(function () { p.set(1, 'Looking at the picture…'); return classify(img.bmp, img.bmp.width, img.bmp.height); }).then(function (prob) {
			p.done(); img.cls = A.clsSignal(prob); renderImg(); b.disabled = false; b.textContent = 'Run it again';
		}).catch(function (e) { p.done(); b.disabled = false; toast('The model could not run here: ' + (e && e.message || e)); });
	}
	$('aid-imodel').onclick = runImgModel;

	/* ---------- VIDEO ---------- */
	var vid = { file: null, S: [], frames: [], cls: null, url: null };
	dropzone('aid-vdrop', 'aid-vfile', loadVideo);
	function readSlice(f, a, b) { return f.slice(a, b).arrayBuffer().then(function (x) { return new Uint8Array(x); }); }
	/* MP4 / MOV: walk the top-level boxes with small reads, keep everything but the media data (so a 4 GB file costs a few MB). */
	function containerBytes(f) {
		var head = readSlice(f, 0, 12);
		return head.then(function (h) {
			if (A.latin1(h, 4, 8) !== 'ftyp') return f.size <= 48 << 20 ? readSlice(f, 0, f.size) : Promise.all([readSlice(f, 0, 16 << 20), readSlice(f, f.size - (8 << 20), f.size)]).then(function (p) { var o = new Uint8Array(p[0].length + p[1].length); o.set(p[0]); o.set(p[1], p[0].length); return o; });
			var parts = [], pos = 0, n = 0;
			function step() {
				if (pos + 8 > f.size || n++ > 500) return finish();
				return readSlice(f, pos, pos + 16).then(function (b) {
					var size = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0, ty = A.latin1(b, 4, 8);
					if (size === 1) size = (((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) >>> 0) * 4294967296 + (((b[12] << 24) | (b[13] << 16) | (b[14] << 8) | b[15]) >>> 0);
					if (size === 0) size = f.size - pos; if (size < 8) return finish();
					var keep = ty !== 'mdat' && ty !== 'free' && ty !== 'skip' && size <= 96 << 20, at = pos; pos += size;
					return (keep ? readSlice(f, at, at + size).then(function (x) { parts.push(x); }) : Promise.resolve()).then(step);
				});
			}
			function finish() { var len = parts.reduce(function (a, p) { return a + p.length; }, 0), o = new Uint8Array(len), k = 0; parts.forEach(function (p) { o.set(p, k); k += p.length; }); return o; }
			return step();
		});
	}
	function loadVideo(f) {
		if (vid.url) URL.revokeObjectURL(vid.url);
		vid = { file: f, S: [], frames: [], cls: null, url: URL.createObjectURL(f) };
		$('aid-vout').hidden = false; $('aid-vfinfo').textContent = f.name + ' · ' + bytes(f.size); $('aid-frames').innerHTML = '<span class="tu-note">Reading frames…</span>'; $('aid-fstage').hidden = true;
		$('aid-vmodel').textContent = 'Run the AI-picture model on the frames'; $('aid-vmodel').disabled = true;
		containerBytes(f).then(function (u8) {
			var r = A.scanVideo(u8, { size: f.size }); vid.r = r; vid.S = r.signals; renderVid();
			var i = r.info, rows = [['Format', i.format + (i.brand ? ' (' + i.brand + ')' : '')], ['Size', bytes(f.size)], ['Created', i.created], ['Encoder', i.encoder], ['Software', i.software], ['Make', i.make], ['Model', i.model], ['Location', i.location], ['Content Credentials', i.c2pa ? 'Yes' : 'None found']];
			$('aid-vkv').querySelector('tbody').innerHTML = rows.filter(function (x) { return x[1]; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('');
		}).catch(function () { toast('Could not read the video file'); });
		var v = $('aid-vid'); v.src = vid.url;
		v.onloadedmetadata = function () { $('aid-vfinfo').textContent = f.name + ' · ' + bytes(f.size) + ' · ' + v.videoWidth + ' × ' + v.videoHeight + ' · ' + fmtTime(v.duration); grabFrames(v); };
		v.onerror = function () { $('aid-frames').innerHTML = '<span class="tu-note">This browser can\'t play this video, so no frames. The metadata check above still works.</span>'; };
	}
	function fmtTime(s, fine) { if (!isFinite(s)) return '?'; if (fine && s < 60) return s.toFixed(1) + ' s'; s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
	function grabFrames(v) {
		var times = A.frameTimes(v.duration, 8), out = [], token = vid;
		var w = v.videoWidth, h = v.videoHeight; if (!w) return;
		function next(i) {
			if (token !== vid) return;
			if (i >= times.length) { vid.frames = out; drawFrames(); v.currentTime = 0; $('aid-vmodel').disabled = !out.length; return; }
			var done = false, onS = function () { if (done) return; done = true; v.removeEventListener('seeked', onS); var c = document.createElement('canvas'), sz = maxCanvas(w, h, 960); c.width = sz[0]; c.height = sz[1]; c.getContext('2d').drawImage(v, 0, 0, sz[0], sz[1]); out.push({ t: times[i], c: c, p: null }); next(i + 1); };
			v.addEventListener('seeked', onS); setTimeout(onS, 4000); v.currentTime = times[i];
		}
		next(0);
	}
	function drawFrames() {
		$('aid-frames').innerHTML = vid.frames.map(function (fr, i) { return '<button type="button" class="aid-frame" data-i="' + i + '"><img src="' + fr.c.toDataURL('image/jpeg', 0.7) + '" alt="Frame at ' + fmtTime(fr.t) + '"><span>' + fmtTime(fr.t) + (fr.p != null ? ' · ' + Math.round(fr.p * 100) + '% AI' : '') + '</span></button>'; }).join('');
	}
	$('aid-frames').addEventListener('click', function (e) {
		var b = e.target.closest('.aid-frame'); if (!b) return; var fr = vid.frames[+b.dataset.i]; $('aid-fstage').hidden = false;
		var cv = $('aid-fcv'), x; cv.width = fr.c.width; cv.height = fr.c.height; x = cv.getContext('2d'); var d = fr.c.getContext('2d').getImageData(0, 0, cv.width, cv.height), nm = A.noiseMap(d.data, cv.width, cv.height, 8); x.putImageData(new ImageData(nm.data, cv.width, cv.height), 0, 0);
		root.querySelectorAll('.aid-frame').forEach(function (q) { q.classList.toggle('is-on', q === b); });
	});
	function renderVid() { var S = vid.S.slice(); if (vid.cls) S.push(vid.cls); renderSum('aid-vsum', S); renderSigs('aid-vsigs', S); }
	$('aid-vmodel').onclick = function () {
		if (!vid.frames.length) return; var p = progress('aid-vprog', 'Loading the model…'), b = $('aid-vmodel'); b.disabled = true;
		getCls(p).then(function () {
			var i = 0, sum = 0;
			function one() { if (i >= vid.frames.length) return; p.set(i / vid.frames.length, 'Frame ' + (i + 1) + ' of ' + vid.frames.length + '…'); var fr = vid.frames[i]; return classify(fr.c, fr.c.width, fr.c.height).then(function (pr) { fr.p = pr; sum += pr || 0; i++; return one(); }); }
			return one().then(function () { return sum / vid.frames.length; });
		}).then(function (avg) { p.done(); vid.cls = A.clsSignal(avg, vid.frames.length); drawFrames(); renderVid(); b.disabled = false; b.textContent = 'Run it again'; })
			.catch(function (e) { p.done(); b.disabled = false; toast('The model could not run here: ' + (e && e.message || e)); });
	};

	/* ---------- TEXT ---------- */
	var txt = { st: null, S: [], lmSig: null, toks: null, view: 'words' };
	var ta = $('aid-text');
	function count() { var w = A.words(ta.value).length; $('aid-tcount').textContent = w ? w.toLocaleString() + ' words' : ''; }
	ta.addEventListener('input', count);
	try { var dr = localStorage.getItem('mes-ai-detector:draft'); if (dr && !ta.value) ta.value = dr; } catch (e) {}
	ta.addEventListener('input', function () { try { if (ta.value.length < 60000) localStorage.setItem('mes-ai-detector:draft', ta.value); } catch (e) {} });
	count();
	$('aid-tgo').onclick = checkText;
	$('aid-tclear').onclick = function () { ta.value = ''; count(); $('aid-tout').hidden = true; try { localStorage.removeItem('mes-ai-detector:draft'); } catch (e) {} ta.focus(); };
	$('aid-topen').onclick = function () { $('aid-tfile').click(); };
	$('aid-tfile').onchange = function () { var f = this.files[0]; if (f) f.text().then(function (t) { if (/\.html?$/i.test(f.name)) { var d = new DOMParser().parseFromString(t, 'text/html'); t = d.body ? d.body.innerText || d.body.textContent : t; } ta.value = t; count(); checkText(); }); this.value = ''; };
	ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); checkText(); } });
	function checkText() {
		var t = ta.value; if (!t.trim()) { toast('Paste some text first'); return; }
		txt = { st: A.textStats(t), S: [], lmSig: null, toks: null, view: 'words', text: t }; txt.S = A.textSignals(txt.st);
		$('aid-tout').hidden = false; renderText(); setTView('words');
		var lb = $('aid-tview').querySelector('[data-v=lm]'); lb.disabled = true; $('aid-tlm').disabled = false; $('aid-tlm').textContent = 'Measure with a language model';
		if (lm) runLM();
	}
	function renderText() {
		var st = txt.st, S = txt.S.slice(); if (txt.lmSig) S.push(txt.lmSig);
		renderSum('aid-tsum', S); renderSigs('aid-tsigs', S);
		var card = function (k, v, sub) { return '<div class="tu-stat"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; };
		var c = card('Words', st.words.toLocaleString(), st.sentences + ' sentences') + card('Average sentence', st.mean.toFixed(1), 'words') + card('Length variety', Math.round(st.cv * 100) + '%', 'people: often 50%+') + card('Word variety', st.ttr ? Math.round(st.ttr * 100) + '%' : '—', 'different words per 100') + card('Chatbot words', st.aiWordRate.toFixed(1), 'per 1,000 words');
		if (txt.lmStats) c += card('Perplexity', txt.lmStats.ppl.toFixed(1), 'lower = more predictable');
		$('aid-tstats').innerHTML = c;
		var mx = Math.max.apply(null, st.lens.concat([1])), lens = st.lens.slice(0, 300);
		$('aid-tbars').innerHTML = lens.map(function (l, i) { return '<i style="height:' + Math.max(4, Math.round(l / mx * 100)) + '%" title="Sentence ' + (i + 1) + ': ' + l + ' words"></i>'; }).join('') || '<span class="tu-note">No sentences found.</span>';
	}
	function setTView(v) {
		txt.view = v; $('aid-tview').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); });
		var t = txt.text.length > 20000 ? txt.text.slice(0, 20000) : txt.text, html;
		if (v === 'lm' && txt.toks) {
			html = txt.toks.map(function (k) { var cl = !k.r ? '' : k.r <= 10 ? 'k10' : k.r <= 100 ? 'k100' : k.r <= 1000 ? 'k1000' : 'kmore'; return (cl ? '<span class="' + cl + '" title="Guess #' + k.r + '">' : '<span>') + esc(k.s) + '</span>'; }).join('') + (txt.toks.cut ? '<span class="aid-cut"> … (only the first ' + txt.toks.length + ' tokens were measured)</span>' : '');
			$('aid-tlegend').innerHTML = '<span class="k10">top 10 guess</span><span class="k100">top 100</span><span class="k1000">top 1,000</span><span class="kmore">rarer</span> <span class="tu-note">Mostly green = very predictable text (typical of AI, and of simple writing).</span>';
		} else {
			var words = A.WORDS.slice().sort(function (a, b) { return b.length - a.length; }).map(function (w) { return w.replace(/[-]/g, '\\-'); });
			var re = new RegExp("\\b(" + words.join('|') + ")\\b|((?:it(?:'|’)s|it is) (?:important|worth|crucial) (?:to note|noting|to remember)|in today(?:'|’)s (?:fast-paced|digital|ever-changing)|plays? a (?:crucial|pivotal|vital|key) role|in conclusion|a testament to|navigat(?:e|ing) the (?:complexities|challenges)|as an ai(?: language model)?|(?:certainly|sure)! here(?:'s|’s| is| are)|\\u2014)", 'gi');
			html = esc(t).replace(/&#39;|&amp;#39;/g, "'").replace(re, function (m) { return '<mark>' + m + '</mark>'; }) + (t.length < txt.text.length ? '<span class="aid-cut"> … (first 20,000 characters shown)</span>' : '');
			$('aid-tlegend').innerHTML = '<mark>highlighted</mark> <span class="tu-note">words and phrases chatbots overuse (people use them too).</span>';
		}
		$('aid-trender').innerHTML = html.replace(/\n/g, '<br>');
	}
	$('aid-tview').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) setTView(b.dataset.v); });
	function getLM(p) {
		if (lm) return Promise.resolve();
		return loadLib().then(function (m) { return Promise.all([m.AutoTokenizer.from_pretrained(LM_MODEL, { progress_callback: p.cb }), m.AutoModelForCausalLM.from_pretrained(LM_MODEL, { dtype: 'q8', model_file_name: 'decoder_model_merged', progress_callback: p.cb })]); }).then(function (r) { tok = r[0]; lm = r[1]; });
	}
	function runLM() {
		var p = progress('aid-tprog', 'Loading the language model…'), b = $('aid-tlm'); b.disabled = true;
		getLM(p).then(function () {
			p.set(1, 'Reading the text…');
			var enc = tok(txt.text, { truncation: true, max_length: 400 }), ids = Array.from(enc.input_ids.data, Number), cut = A.words(txt.text).length * 1.25 > ids.length + 5;
			return lm({ input_ids: enc.input_ids, attention_mask: enc.attention_mask }).then(function (out) {
				var L = out.logits, V = L.dims[2], data = L.data, lp = [], rank = [], toks = [{ s: tok.decode([ids[0]]), r: 0 }];
				for (var i = 0; i + 1 < ids.length; i++) {
					var off = i * V, mx = -Infinity, j; for (j = 0; j < V; j++) if (data[off + j] > mx) mx = data[off + j];
					var se = 0; for (j = 0; j < V; j++) se += Math.exp(data[off + j] - mx);
					var tv = data[off + ids[i + 1]], r = 1; for (j = 0; j < V; j++) if (data[off + j] > tv) r++;
					lp.push(tv - mx - Math.log(se)); rank.push(r); toks.push({ s: tok.decode([ids[i + 1]]), r: r });
				}
				toks.cut = cut; return { m: A.lmStats(lp, rank), toks: toks };
			});
		}).then(function (res) {
			p.done(); txt.lmStats = res.m; txt.lmSig = A.lmSignal(res.m); txt.toks = res.toks; renderText();
			var lb = $('aid-tview').querySelector('[data-v=lm]'); lb.disabled = false; setTView('lm'); b.disabled = false; b.textContent = 'Measure again';
		}).catch(function (e) { p.done(); b.disabled = false; toast('The language model could not run here: ' + (e && e.message || e)); });
	}
	$('aid-tlm').onclick = function () { if (!txt.text) return; runLM(); };
	$('aid-task').onclick = function () {
		var q = A.aiPrompt(txt.text || ta.value, txt.S.concat(txt.lmSig ? [txt.lmSig] : []));
		var go = function () { window.open('/ai?tab=chat', '_blank', 'noopener'); };
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(q).then(function () { toast('Copied: paste it into MES AI'); go(); }, function () { toast('Copy failed'); go(); });
		else { toast('Copy needs a secure page'); go(); }
	};

	window.MESAIDDebug = { img: function () { return img; }, vid: function () { return vid; }, txt: function () { return txt; }, loadImage: loadImage, loadVideo: loadVideo, checkText: checkText, showTab: showTab };
})();
