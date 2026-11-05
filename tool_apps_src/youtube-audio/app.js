/* MES YouTube Audio Analyzer UI. Maths = MESYA in lib.js (prepended above); formats the browser can't decode go through
   MESConvEngine.extractAudio (the Video Converter's engine, ffmpeg.wasm on demand).
   Three sources: a dropped file, a direct media link (fetched by the browser when the other site allows it), and tab audio shared with
   getDisplayMedia while the video plays in the site's own player (embedded on this page, or in another tab). Only measurements are kept.
   Settings (silence threshold, lanes, waveform scale) in localStorage mes-youtube-audio:v1. ?u=<link> pre-fills the link box. */
(function () {
	'use strict';
	var Y = MESYA, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-youtube-audio:v1';
	var S = { thr: -45, min: 0.5, lanes: { wave: true, loud: true, spec: true }, ws: 'lin', split: false, tab: 'link', quiet: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('ya-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2600); }
	var AC = window.AudioContext || window.webkitAudioContext;
	var root = $('ya');

	/* ---------- state ---------- */
	var Z = null, SUM = null, SER = null, SRC = null, view = null, cap = null, busy = null, specImg = null, specCols = -1, sil = [], userZoom = false, link = null;

	/* ---------- tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll('.ya-tabs [role=tab]'));
	function setTab(id, focus) {
		tabs.forEach(function (b) { var on = b.getAttribute('data-tab') === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; $(b.getAttribute('aria-controls')).hidden = !on; if (on && focus) b.focus(); });
		S.tab = id; save();
	}
	tabs.forEach(function (b, i) {
		b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
		b.addEventListener('keydown', function (e) {
			var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
			if (j < 0) return; e.preventDefault(); j = (j + tabs.length) % tabs.length; setTab(tabs[j].getAttribute('data-tab'), true);
		});
	});
	setTab(S.tab === 'file' || S.tab === 'tab' ? S.tab : 'link');

	/* ---------- progress ---------- */
	function prog(text, f) { $('ya-prog').hidden = false; if (text != null) $('ya-progtext').textContent = text; $('ya-progbar').style.width = (f == null ? 0 : Math.round(f * 100)) + '%'; }
	function progOff() { $('ya-prog').hidden = true; }
	$('ya-cancel').addEventListener('click', function () { if (busy) busy.cancel = true; progOff(); });
	function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

	/* ---------- analysing decoded audio ---------- */
	async function analyseChannels(ch, sr, src, job) {
		ch = ch.slice(0, 2);
		Z = new Y.Analyzer(sr, ch.length); SRC = src; userZoom = false; view = null;
		var n = ch[0].length, step = Math.round(sr * 2), t0 = Date.now();
		for (var i = 0; i < n; i += step) {
			if (job.cancel) throw new Error('Cancelled');
			Z.feed(ch.map(function (c) { return c.subarray(i, Math.min(n, i + step)); }));
			if (Date.now() - t0 > 120) { prog('Measuring… ' + Y.fmtTime(i / sr) + ' of ' + Y.fmtTime(n / sr), i / n); await yieldUI(); t0 = Date.now(); }
		}
		finish();
	}
	var dctx = null;
	async function decode(buf, file, job, name) {
		if (!AC) throw new Error('This browser cannot decode audio.');
		if (!dctx) dctx = new AC();
		prog('Decoding ' + name + '…', 0);
		try {
			var ab = await new Promise(function (res, rej) { var p = dctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
			var ch = []; for (var c = 0; c < ab.numberOfChannels; c++) ch.push(ab.getChannelData(c));
			if (ab.numberOfChannels > 2) toast('Only the first two of ' + ab.numberOfChannels + ' channels are measured.');
			return { channels: ch, sampleRate: ab.sampleRate };
		} catch (e) {
			if (job.cancel) throw new Error('Cancelled');
			return viaEngine(file, job, name);
		}
	}
	async function viaEngine(file, job, name) {
		var E = window.MESConvEngine;
		if (!file || !E || !E.extractAudio) throw new Error('The browser could not read the sound of this file.');
		prog('The browser can\'t read ' + name + ' itself: loading the converter (about 30 MB, once)…', 0);
		var r = await E.extractAudio(file, { onStatus: function (m, x) { prog(m, x || 0); }, onProgress: function (x) { prog('Reading the sound of ' + name + '…', x); } });
		if (job.cancel) throw new Error('Cancelled');
		if (r.channels) return { channels: r.channels, sampleRate: r.sampleRate };
		if (!dctx) dctx = new AC();
		var ab = await dctx.decodeAudioData(r.encoded);
		var ch = []; for (var c = 0; c < ab.numberOfChannels; c++) ch.push(ab.getChannelData(c));
		return { channels: ch, sampleRate: ab.sampleRate };
	}
	async function openFile(file) {
		if (!file) return;
		stopCapture(true);
		var job = busy = { cancel: false };
		setPlayback(null);
		try {
			var d;
			if (file.size > 700e6) d = await viaEngine(file, job, file.name);
			else { prog('Reading ' + file.name + '…', 0); d = await decode(await file.arrayBuffer(), file, job, file.name); }
			await analyseChannels(d.channels, d.sampleRate, { kind: 'file', title: file.name, size: file.size }, job);
			setPlayback(URL.createObjectURL(file), true);
		} catch (e) { if (!/Cancelled/.test(e.message)) { toast(e.message); $('ya-linkmsg').textContent = ''; } } finally { if (busy === job) busy = null; progOff(); }
	}
	$('ya-file').addEventListener('change', function () { openFile(this.files[0]); this.value = ''; });
	var drop = $('ya-drop');
	['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('ya-over'); }); });
	['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('ya-over'); }); });
	drop.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f); });
	/* a file dropped anywhere on the tool */
	root.addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
	root.addEventListener('drop', function (e) { if (e.defaultPrevented) return; var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); setTab('file'); openFile(f); } });

	/* ---------- links ---------- */
	function msg(id, html) { $(id).innerHTML = html || ''; }
	/* whole file in 8 MB pieces (servers such as Odysee's drop one long download part way); plain download when ranges aren't offered */
	async function fetchWhole(url, job, name) {
		var CH = 8 << 20, parts = [], got = 0, total = 0, type = '', r, tries;
		var show = function () { prog('Downloading ' + name + '… ' + (got / 1e6).toFixed(1) + (total ? ' of ' + (total / 1e6).toFixed(0) : '') + ' MB', total ? got / total : 0); };
		var get = async function (range) {
			for (tries = 0; ; tries++) {
				try { var x = await fetch(url, { mode: 'cors', credentials: 'omit', headers: range ? { Range: range } : {} }); if (x.ok) return x; if ((x.status === 401 || x.status === 403) && got) throw new Error('stopped'); if (tries >= 2 || x.status < 500) throw new Error('The other site answered ' + x.status + '.'); }
				catch (e) { if (job.cancel) throw new Error('Cancelled'); if (e.message === 'stopped') throw e; if (e instanceof TypeError && !got && !tries) throw new Error('cors'); if (tries >= 2) throw got ? new Error('stopped') : e; }
				await new Promise(function (res) { setTimeout(res, 800 * (tries + 1)); });
			}
		};
		r = await get('bytes=0-' + (CH - 1));
		type = r.headers.get('content-type') || '';
		if (r.status === 206) {
			var cr = (r.headers.get('content-range') || '').match(/\/(\d+)\s*$/); total = cr ? +cr[1] : 0;
			parts.push(new Uint8Array(await r.arrayBuffer())); got = parts[0].length; show();
			while (!total || got < total) {
				if (job.cancel) throw new Error('Cancelled');
				var x = await get('bytes=' + got + '-' + (got + CH - 1));
				if (x.status !== 206) throw new Error('The download was interrupted. Try again.');
				var u = new Uint8Array(await x.arrayBuffer()); if (!u.length) break;
				parts.push(u); got += u.length; show();
				if (!total && u.length < CH) break;
			}
		} else {
			total = +r.headers.get('content-length') || 0;
			if (r.body && r.body.getReader) { var rd = r.body.getReader(); for (;;) { var y = await rd.read(); if (y.done) break; if (job.cancel) { try { rd.cancel(); } catch (e) {} throw new Error('Cancelled'); } parts.push(y.value); got += y.value.length; show(); } }
			else { parts.push(new Uint8Array(await r.arrayBuffer())); got = parts[0].length; }
		}
		var all = new Uint8Array(got), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; });
		return { buf: all.buffer, type: type };
	}
	async function openDirect(L) {
		var job = busy = { cancel: false }, name = L.file || 'the file';
		stopCapture(true);
		prog('Downloading ' + name + '…', 0);
		try {
			var dl = await fetchWhole(L.watch, job, name), buf = dl.buf, r = { headers: { get: function () { return dl.type; } } };
			var file = null; try { file = new File([buf.slice(0)], name, { type: r.headers.get('content-type') || '' }); } catch (e) {}
			var d = await decode(buf, file, job, name);
			await analyseChannels(d.channels, d.sampleRate, { kind: L.odysee ? 'odysee' : 'direct', title: name, link: L.page || L.watch }, job);
			setPlayback(L.watch, true);
			msg('ya-linkmsg', '');
		} catch (e) {
			if (/Cancelled/.test(e.message)) return;
			if (e.message === 'stopped') msg('ya-linkmsg', (L.odysee ? 'Odysee stopped the download part way: it only lets other web pages read the first 32 MB of some videos.' : 'The other site stopped the download part way.') + ' Try again in a minute, or play the video and use <b>Start listening</b> (tick <b>Keep my speakers silent</b>).');
			else if (e.message === 'cors') msg('ya-linkmsg', 'That site doesn\'t let other web pages read its files. <a href="' + esc(L.watch) + '" target="_blank" rel="noopener">Download the file</a> and drop it on the <b>Drop a file</b> tab, or play it in another tab and use <b>Listen to another tab</b>.');
			else msg('ya-linkmsg', esc(e.message));
		} finally { if (busy === job) busy = null; progOff(); }
	}
	function openLink(text) {
		var L = Y.parseLink(text);
		msg('ya-linkmsg', '');
		if (!L.ok) { msg('ya-linkmsg', esc(L.reason)); return; }
		link = L;
		if (L.kind === 'direct') { stopHls(); $('ya-player').hidden = true; openDirect(L); return; }
		var pl = $('ya-player'), fr = $('ya-frame');
		pl.hidden = false; fr.innerHTML = '';
		$('ya-open').href = L.watch;
		$('ya-open').textContent = 'Open on ' + (L.kind === 'other' ? 'that site' : L.name) + ' ↗';
		stopHls(); $('ya-fullbtn').hidden = false; $('ya-or').hidden = false; $('ya-fullnote').textContent = L.kind === 'odysee' ? 'No playing needed: the page downloads the video file from Odysee and measures all of its sound (Odysee sometimes stops other sites part way through a long video: then use Start listening).' : 'No playing needed: the page reads the video\'s sound track straight from the site and measures all of it.'; $('ya-full').hidden = !(L.kind === '3speak' || (L.kind === 'odysee' && L.embed));
		if (L.kind === '3speak') {
			$('ya-ptitle').textContent = 'Play the 3Speak video here';
			fr.className = 'ya-frame'; play3speak(L, fr);
			$('ya-steps').hidden = false;
			$('ya-cap').setAttribute('data-cap', 'self'); $('ya-cap').textContent = '● Start listening';
		} else if (L.embed) {
			$('ya-ptitle').textContent = 'Play the ' + L.name + ' video here';
			var f = document.createElement('iframe');
			f.src = L.embed; f.title = L.name + ' player'; f.setAttribute('allowfullscreen', '');
			f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.referrerPolicy = 'strict-origin-when-cross-origin';
			fr.className = 'ya-frame' + (L.kind === 'x' ? ' ya-frame--tall' : '');
			fr.appendChild(f);
			$('ya-steps').hidden = false;
			$('ya-cap').setAttribute('data-cap', 'self'); $('ya-cap').textContent = '● Start listening';
		} else {
			var why = L.kind === 'rumble' ? 'A normal Rumble link can\'t be played here (only rumble.com/embed/… links can).'
				: L.kind === 'substack' ? 'Substack videos can\'t be played inside other pages.'
				: L.kind === 'odysee' || L.kind === 'bitchute' || L.kind === 'x' ? 'That link doesn\'t point at one video.'
				: 'This page can\'t play that site\'s video itself.';
			$('ya-ptitle').textContent = L.kind === 'other' ? 'Play it in its own tab' : 'Play it on ' + L.name;
			fr.className = 'ya-frame ya-frame--none';
			fr.innerHTML = '<p>' + esc(why) + ' Open it in a new tab, start it playing, then press <b>Choose a tab to listen to</b> and pick that tab.</p>';
			$('ya-steps').hidden = true;
			$('ya-cap').setAttribute('data-cap', 'other'); $('ya-cap').textContent = '🔊 Choose a tab to listen to';
		}
		try { var u = new URL(location.href); u.searchParams.set('u', L.watch); history.replaceState(null, '', u); } catch (e) {}
		pl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	$('ya-form').addEventListener('submit', function (e) { e.preventDefault(); openLink($('ya-url').value); });
	$('ya-url').addEventListener('paste', function () { var me = this; setTimeout(function () { if (Y.parseLink(me.value).ok) openLink(me.value); }, 0); });

	/* ---------- 3Speak: our own player (their embed is a whole page) + reading the whole sound track ---------- */
	var hls = null, pageVid = null, HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
	function stopHls() { pageVid = null; if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } }
	function loadScript(u) { return new Promise(function (res, rej) { if (window.Hls) return res(); var x = document.createElement('script'); x.src = u; x.onload = res; x.onerror = function () { rej(new Error('Could not load the video player.')); }; document.head.appendChild(x); }); }
	async function speakInfo(L) {
		var r = await fetch('https://play.3speak.tv/api/embed?v=' + encodeURIComponent(L.id).replace('%2F', '/'), { credentials: 'omit' });
		if (!r.ok) throw new Error('3Speak answered ' + r.status + '.');
		var j = await r.json();
		var u = j && (j.videoUrl || j.videoUrlFallback1 || j.videoUrlFallback2);
		if (!u) throw new Error('3Speak has no video for that link' + (j && j.status ? ' (status: ' + j.status + ')' : '') + '.');
		return { url: u, title: j.title || L.id };
	}
	async function play3speak(L, fr) {
		fr.innerHTML = '<p class="ya-loading">Loading the 3Speak video…</p>';
		try {
			var info = await speakInfo(L);
			if (link !== L) return;
			var v = document.createElement('video'); v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.title = info.title;
			fr.innerHTML = ''; fr.appendChild(v); pageVid = v; watchVid(v);
			sizeNote3speak(L, info);
			if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = info.url;
			else { await loadScript(HLS_URL); if (link !== L) return; if (!window.Hls || !Hls.isSupported()) throw new Error('This browser can\'t play 3Speak videos here.'); hls = new Hls(); hls.loadSource(info.url); hls.attachMedia(v); }
		} catch (e) { if (link === L) { fr.className = 'ya-frame ya-frame--none'; fr.innerHTML = '<p>' + esc(e.message) + ' <a href="' + esc(L.watch) + '" target="_blank" rel="noopener">Open it on 3Speak ↗</a></p>'; } }
	}
	async function sizeNote3speak(L, info) {
		try {
			var pl = Y.parseM3U8(await (await fetch(info.url, { credentials: 'omit' })).text(), info.url), bw = 0;
			if (pl.variants.length) { var vv = Y.lightest(pl.variants); bw = vv.bw; pl = Y.parseM3U8(await (await fetch(vv.url, { credentials: 'omit' })).text(), vv.url); }
			if (link !== L || !pl.total) return;
			var mb = bw ? bw * pl.total / 8 / 1e6 : 0;
			$('ya-fullnote').textContent = 'No playing needed: the page reads the sound track of all ' + Y.fmtTime(pl.total) + ' straight from 3Speak and measures it.' + (mb ? ' 3Speak keeps the sound inside the video, so this downloads up to about ' + (mb >= 1000 ? (mb / 1000).toFixed(1) + ' GB' : Math.max(1, Math.round(mb)) + ' MB') + '.' : '');
		} catch (e) {}
	}
	function batchDecode(bytes, sr, nch) {
		var oc = new OfflineAudioContext(Math.max(1, Math.min(2, nch || 2)), 1, sr);
		return new Promise(function (res, rej) { var p = oc.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), res, rej); if (p && p.then) p.then(res, rej); });
	}
	async function measure3speak(L) {
		var job = busy = { cancel: false };
		stopCapture(true); msg('ya-linkmsg', ''); $('ya-capmsg').textContent = '';
		prog('Finding the video\'s sound track on 3Speak…', 0);
		try {
			var info = await speakInfo(L);
			var get = async function (u) { var r = await fetch(u, { credentials: 'omit' }); if (!r.ok) throw new Error('3Speak answered ' + r.status + '.'); return r; };
			var pl = Y.parseM3U8(await (await get(info.url)).text(), info.url);
			if (pl.variants.length) { var vv = Y.lightest(pl.variants); pl = Y.parseM3U8(await (await get(vv.url)).text(), vv.url); }
			var segs = pl.segments; if (!segs.length) throw new Error('That 3Speak video has no parts to read.');
			var st = {}, keepLen = 0, pend = [], pendLen = 0, sr = 0, nch = 0, tail = null, got = 0, t0 = Date.now(), OV = 8, BATCH = 300;
			Z = null; SRC = { kind: '3speak', title: info.title, link: L.watch }; userZoom = false; view = null; setPlayback(null);
			var feedAll = async function (ab, skip) {
				if (!Z) Z = new Y.Analyzer(ab.sampleRate, Math.min(2, ab.numberOfChannels));
				var ch = []; for (var c = 0; c < Math.min(2, ab.numberOfChannels); c++) ch.push(ab.getChannelData(c).subarray(skip));
				var n = ch[0].length, step = Math.round(ab.sampleRate * 2);
				for (var i = 0; i < n; i += step) { Z.feed(ch.map(function (x) { return x.subarray(i, Math.min(n, i + step)); })); if (Date.now() - t0 > 120) { await yieldUI(); t0 = Date.now(); } }
			};
			var flush = async function (final) {
				if (!pendLen) return;
				var all = new Uint8Array(pendLen), o = 0; pend.forEach(function (x) { all.set(x, o); o += x.length; });
				var A = Y.adtsFrames(all); if (!A.frames.length) return;
				sr = sr || A.sr; nch = nch || A.ch;
				var cut = final ? A.frames.length : A.frames.length - 1, last = A.frames[cut - 1], body = all.subarray(0, last.o + last.l);
				var head = tail ? tail : new Uint8Array(0), buf = new Uint8Array(head.length + body.length); buf.set(head, 0); buf.set(body, head.length);
				var ab = await batchDecode(buf, sr, nch), want = cut * 1024;
				await feedAll(ab, Math.max(0, ab.length - want));
				var tf = A.frames.slice(Math.max(0, cut - OV), cut); tail = all.slice(tf[0].o, last.o + last.l);
				var rest = all.subarray(last.o + last.l); pend = rest.length ? [rest.slice()] : []; pendLen = rest.length;
			};
			var fetches = [], ahead = 3, seconds = 0;
			for (var k = 0; k < Math.min(ahead, segs.length); k++) fetches.push(get(segs[k].url).then(function (r) { return r.arrayBuffer(); }));
			for (var i = 0; i < segs.length; i++) {
				if (job.cancel) throw new Error('Cancelled');
				var b = new Uint8Array(await fetches[i]); got += b.length;
				if (i + ahead < segs.length) fetches.push(get(segs[i + ahead].url).then(function (r) { return r.arrayBuffer(); }));
				var a = Y.tsAudio(b, st);
				if (a) { keepLen += a.length; pend.push(a); pendLen += a.length; }
				seconds += segs[i].dur || 0;
				prog('Reading the sound of “' + info.title + '”… ' + Y.fmtTime(seconds) + ' of ' + Y.fmtTime(pl.total) + ' (' + (got / 1e6).toFixed(0) + ' MB downloaded)', (i + 1) / segs.length);
				if (sr ? pendLen > sr * BATCH / 1024 * 380 : pendLen > 6e6) await flush(false);
			}
			if (!keepLen) throw new Error('That 3Speak video has no sound track.');
			await flush(true);
			if (!Z || Z.n < 1) throw new Error('The sound track could not be read.');
			finish();
			setPlayback(null); $('ya-seekhint').hidden = !pageVid;
		} catch (e) {
			if (!/Cancelled/.test(e.message)) msg('ya-linkmsg', esc(e.message || String(e)) + ' You can still play the video and use <b>Start listening</b>.');
		} finally { if (busy === job) busy = null; progOff(); }
	}
	/* Odysee: its own API gives a plain MP4 that other pages may read */
	async function measureOdysee(L) {
		prog('Finding the video file on Odysee…', 0);
		var u;
		try {
			var r = await fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=get', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'get', params: { uri: Y.lbryUrl(L.id), save_file: false }, id: 1 }) });
			var j = await r.json(); u = j && j.result && j.result.streaming_url;
			if (!u) throw new Error((j && j.error && j.error.message) || 'Odysee did not give a file for that video (it may be members-only or a livestream).');
		} catch (e) { progOff(); msg('ya-linkmsg', esc(e.message || String(e)) + ' You can still play the video and use <b>Start listening</b>.'); return; }
		progOff();
		await openDirect({ watch: u, file: decodeURIComponent((L.id.split('/').pop() || 'video').replace(/:[0-9a-f]+$/i, '')) + '.mp4', page: L.watch, odysee: true });
	}
	$('ya-fullbtn').addEventListener('click', function () { if (!link || busy) return; if (link.kind === '3speak') measure3speak(link); else if (link.kind === 'odysee') measureOdysee(link); });
	/* "keep my speakers silent" (both copies of the tick box) */
	var quietBoxes = [].slice.call(document.querySelectorAll('.ya-quietbox'));
	quietBoxes.forEach(function (q) { q.checked = !!S.quiet; q.addEventListener('change', function () { S.quiet = q.checked; quietBoxes.forEach(function (o) { o.checked = S.quiet; }); save(); }); });

	/* ---------- tab audio ---------- */
	var TAP = 'class T extends AudioWorkletProcessor{constructor(){super();this.b=null;this.n=0;this.N=4096}process(i){var x=i[0];if(!x||!x.length)return true;var c=Math.min(2,x.length),k;if(!this.b||this.b.length!==c){this.b=[];for(k=0;k<c;k++)this.b.push(new Float32Array(this.N));this.n=0}for(k=0;k<c;k++)this.b[k].set(x[k],this.n);this.n+=x[0].length;if(this.n>=this.N){this.port.postMessage(this.b,this.b.map(function(a){return a.buffer}));this.b=null}return true}}registerProcessor("ya-tap",T);';
	async function startCapture(self) {
		var M = $('ya-capmsg'); M.textContent = '';
		var say = function (t) { M.textContent = t; if ($('ya-player').hidden) toast(t); };
		if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !AC || !window.AudioWorkletNode) { say('This browser can\'t share a tab\'s sound with a page. Use Chrome, Edge, Brave or Opera on a computer, or drop a file instead.'); return; }
		stopCapture(true);
		var stream;
		try {
			stream = await navigator.mediaDevices.getDisplayMedia({
				video: { displaySurface: 'browser', frameRate: 1 },
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: !!S.quiet },
				preferCurrentTab: !!self, selfBrowserSurface: self ? 'include' : 'exclude', surfaceSwitching: 'include', systemAudio: 'exclude', monitorTypeSurfaces: 'exclude'
			});
		} catch (e) { say(e && e.name === 'NotAllowedError' ? 'Sharing was cancelled.' : 'Could not start: ' + (e && e.message || e)); return; }
		var at = stream.getAudioTracks()[0];
		if (!at) { stream.getTracks().forEach(function (t) { t.stop(); }); say('No sound was shared. Try again and switch on "Also share tab audio" (pick a browser tab, not a window or the screen).'); return; }
		stream.getVideoTracks().forEach(function (t) { t.stop(); });
		var ctx = new AC(), url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
		try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
		var srcN = ctx.createMediaStreamSource(new MediaStream([at])), tap = new AudioWorkletNode(ctx, 'ya-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }), mute = ctx.createGain();
		mute.gain.value = 0; srcN.connect(tap); tap.connect(mute); mute.connect(ctx.destination);
		if (ctx.state === 'suspended') ctx.resume();
		Z = null; SUM = null; SER = null; SRC = { kind: 'capture', self: !!self, title: self && link ? link.name + ' video' : 'Tab audio', link: self && link ? link.watch : '', yt: !!(self && link && link.kind === 'youtube') };
		userZoom = false; view = null; setPlayback(null);
		cap = { stream: stream, ctx: ctx, tap: tap, t0: Date.now(), timer: 0 };
		tap.port.onmessage = function (e) { if (!cap) return; if (!Z) Z = new Y.Analyzer(ctx.sampleRate, e.data.length); Z.feed(e.data); };
		at.addEventListener('ended', function () { stopCapture(); });
		var live = $('ya-live');
		if (self && !$('ya-player').hidden) $('ya-player').appendChild(live); else root.insertBefore(live, $('ya-prog'));
		live.hidden = false; $('ya-cap').hidden = true; $('ya-res').hidden = true;
		var n = 0;
		cap.timer = setInterval(function () { if (!cap) return; liveTick(++n % 4 === 0); }, 250);
		liveTick(false);
		live.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	function stopCapture(silent) {
		if (!cap) return;
		var c = cap; cap = null;
		clearInterval(c.timer);
		try { c.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
		try { c.tap.port.onmessage = null; c.ctx.close(); } catch (e) {}
		$('ya-live').hidden = true; $('ya-cap').hidden = false;
		if (silent) return;
		if (!Z || Z.n < Z.sr * 0.5) { $('ya-capmsg').textContent = 'Nothing was heard. Was the video playing, with the tab\'s sound shared?'; return; }
		finish();
	}
	$('ya-stop').addEventListener('click', function () { stopCapture(); });
	[].forEach.call(document.querySelectorAll('[data-cap]'), function (b) { b.addEventListener('click', function () { startCapture(b.getAttribute('data-cap') === 'self'); }); });
	window.addEventListener('beforeunload', function () { stopCapture(true); });

	function liveTick(full) {
		var el = (Date.now() - cap.t0) / 1000;
		$('ya-el').textContent = Y.fmtTime(el);
		if (!Z) return;
		var k = Z.kblk.view(), n = k.length;
		$('ya-lm').textContent = Y.fmtDb(Y.lufsOf(k, Math.max(0, n - 4), n));
		$('ya-ls').textContent = Y.fmtDb(Y.lufsOf(k, Math.max(0, n - 30), n));
		$('ya-lt').textContent = Y.fmtDb(Y.db(Math.max(Z.tp, Z.pmax)));
		drawLiveSpec();
		if (full) { $('ya-li').textContent = Y.fmtDb(Z.loudness().integrated); if (n > 20) finish(true); }
	}
	function drawLiveSpec() {
		var cv = $('ya-livespec'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, C = colors(), NB = Z.NB;
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
		var bw = W / NB;
		for (var b = 0; b < NB; b++) { var v = Math.max(0, Math.min(1, (Z.last[b] + 100) / 100)), h = v * (H - 14); g.fillStyle = specColor(v); g.fillRect(b * bw, H - 14 - h, Math.ceil(bw), h); }
		freqTicks(g, W, H, C, function (f) { return Math.log(f / 30) / Math.log(Math.min(20000, Z.sr / 2) / 30) * W; });
	}

	/* ---------- results ---------- */
	function finish(live) {
		SUM = Z.summary(); SER = Z.series();
		if (!live) { view = null; userZoom = false; }
		$('ya-res').hidden = false;
		renderSummary(live);
		sil = Y.silences(SER.rms, S.thr, S.min); renderSil();
		renderMoments();
		renderTargets();
		specCols = -1;
		drawAll();
		drawLtas();
		if (!live) $('ya-res').scrollIntoView({ block: 'start', behavior: 'smooth' });
	}
	function tile(label, value, unit, sub, cls) { return '<div class="tu-stat' + (cls ? ' ' + cls : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + (unit ? ' <span class="ya-unit">' + unit + '</span>' : '') + '</div><div class="tu-stat__sub">' + (sub || '') + '</div></div>'; }
	function renderSummary(live) {
		var s = SUM, v = Y.verdict(s), d = Y.fmtDb;
		var vd = $('ya-verdict'); vd.className = 'ya-verdict ya-v--' + v.cls;
		$('ya-vh').textContent = (live ? 'So far: ' : '') + v.head; $('ya-vt').textContent = v.text;
		$('ya-vsrc').innerHTML = esc(SRC ? SRC.title : '') + ' · ' + Y.fmtTime(s.duration) + (SRC && SRC.kind === 'capture' ? ' heard from the tab' : '') + ' · ' + (s.channels === 2 ? 'stereo' : 'mono') + ', ' + s.sampleRate + ' Hz';
		var tpWarn = s.truePeak > -1 ? '<b class="ya-bad">Above −1:</b> may distort after the site re-encodes it.' : 'At or below −1: safe.';
		var plr = isFinite(s.plr) ? s.plr : NaN;
		var html = tile('Integrated loudness', d(s.integrated), 'LUFS', 'YouTube plays at about −14.', 'tu-stat--hero')
			+ tile('True peak', d(s.truePeak), 'dBTP', tpWarn + ' <button type="button" class="ya-seek" data-t="' + s.truePeakAt + '">at ' + Y.fmtTime(s.truePeakAt) + '</button>')
			+ tile('Loudness range', isFinite(s.range) ? s.range.toFixed(1) : '–', 'LU', s.range < 4 ? 'Very even.' : s.range < 9 ? 'Typical for speech.' : s.range < 15 ? 'Fairly wide.' : 'Very wide: quiet and loud parts far apart.')
			+ tile('Loudest 3 s', d(s.shortTermMax), 'LUFS', 'Max momentary ' + d(s.momentaryMax) + ' LUFS')
			+ tile('Sample peak', d(s.samplePeak), 'dBFS', s.channels === 2 ? 'Left ' + d(s.channelPeaks[0]) + ', right ' + d(s.channelPeaks[1]) : '')
			+ tile('Average level (RMS)', d(s.rms), 'dBFS', 'Crest factor ' + (isFinite(s.crest) ? s.crest.toFixed(1) + ' dB' : '–'))
			+ tile('Peak to loudness', isFinite(plr) ? plr.toFixed(1) : '–', 'dB', !isFinite(plr) ? '' : plr < 8 ? 'Very squashed (heavy limiting).' : plr < 12 ? 'Punchy, compressed.' : 'Plenty of dynamics.')
			+ tile('Noise floor', d(s.noiseFloor), 'dBFS', s.noiseFloor > -45 ? '<b class="ya-bad">Noisy:</b> hiss or room noise is easy to hear.' : s.noiseFloor > -60 ? 'Some background noise.' : 'Quiet background.')
			+ tile('Clipping', String(s.clips), s.clips === 1 ? 'spot' : 'spots', s.clips ? '<b class="ya-bad">Distorted</b> where the wave was cut flat.' : 'None found.')
			+ tile('Stereo', s.channels === 2 && isFinite(s.correlation) ? s.correlation.toFixed(2) : 'Mono', s.channels === 2 ? 'correlation' : '', esc(s.stereo.text) + (s.channels === 2 && isFinite(s.balance) && Math.abs(s.balance) >= 0.5 ? ' Balance ' + (s.balance > 0 ? 'L +' : 'R +') + Math.abs(s.balance).toFixed(1) + ' dB.' : ''));
		var dcMax = Math.max.apply(null, s.dc.map(Math.abs));
		if (dcMax > 0.002) html += tile('DC offset', (dcMax * 100).toFixed(2), '%', '<b class="ya-bad">The wave is shifted off centre.</b> A low-cut filter fixes it.');
		if (s.digitalSilence >= 1) html += tile('Digital silence', Y.fmtTime(s.digitalSilence, 1), '', 'Stretches of exact zero (nothing recorded).');
		$('ya-stats').innerHTML = html;
		$('ya-ytfix').hidden = !(SRC && SRC.yt); clFix();
		$('ya-seekhint').hidden = !canSeek();
	}
	function clFix() {
		var v = parseFloat(String($('ya-cl').value).replace(',', '.').replace('−', '-'));
		if (!SUM || !isFinite(v) || !isFinite(SUM.integrated)) { $('ya-clout').textContent = ''; return; }
		var up = SUM.integrated + Math.max(0, v);
		$('ya-clout').innerHTML = v > 0 ? 'The upload itself ≈ <b>' + Y.fmtDb(up) + ' LUFS</b> (YouTube turned it down ' + v.toFixed(1) + ' dB).' : 'Not turned down: the upload ≈ <b>' + Y.fmtDb(SUM.integrated) + ' LUFS</b> (YouTube never turns quiet videos up).';
	}
	$('ya-cl').addEventListener('input', clFix);
	function renderTargets() {
		var rows = Y.targets(SUM.integrated, SUM.truePeak).map(function (t) {
			var c = t.change, txt = !isFinite(t.diff) ? '–' : c === 0 ? 'No change' : (c > 0 ? 'Up ' : 'Down ') + Math.abs(c).toFixed(1) + ' dB';
			return '<tr><td><b>' + esc(t.name) + '</b>' + (t.note ? '<div class="ya-tnote">' + esc(t.note) + '</div>' : '') + '</td><td>' + t.lufs + ' LUFS</td><td class="' + (c < -0.05 ? 'ya-down' : c > 0.05 ? 'ya-up' : '') + '">' + txt + '</td></tr>';
		});
		$('ya-targets').tBodies[0].innerHTML = rows.join('');
	}
	function seekBtn(t, label) { return '<button type="button" class="ya-seek" data-t="' + t + '">' + label + '</button>'; }
	function renderSil() {
		var tot = sil.reduce(function (a, s) { return a + s.b - s.a; }, 0), longest = sil.reduce(function (m, s) { return Math.max(m, s.b - s.a); }, 0);
		$('ya-thrv').textContent = Y.fmtDb(S.thr, 0); $('ya-minv').textContent = S.min.toFixed(1);
		$('ya-silsum').textContent = !SUM ? '' : sil.length ? sil.length + ' quiet stretch' + (sil.length === 1 ? '' : 'es') + ', ' + Y.fmtTime(tot, 1) + ' in all (' + (tot / Math.max(0.1, SUM.duration) * 100).toFixed(0) + '% of the time). Longest ' + longest.toFixed(1) + ' s.' : 'No quiet stretches at these settings.';
		$('ya-sillist').innerHTML = sil.slice(0, 300).map(function (s) { return '<li>' + seekBtn(s.a, Y.fmtTime(s.a, 1) + ' – ' + Y.fmtTime(s.b, 1)) + ' <span class="ya-dim">' + (s.b - s.a).toFixed(1) + ' s</span></li>'; }).join('') + (sil.length > 300 ? '<li class="ya-dim">… and ' + (sil.length - 300) + ' more (Copy the list for all)</li>' : '');
	}
	function renderMoments() {
		var lo = Y.loudest(SER.shortTerm, 8, Math.max(5, SUM.duration / 40));
		$('ya-loudlist').innerHTML = lo.length ? lo.map(function (m) { return '<li>' + seekBtn(m.t, Y.fmtTime(m.t) + ' – ' + Y.fmtTime(m.t + 3)) + ' <span class="ya-dim">' + Y.fmtDb(m.lufs) + ' LUFS</span></li>'; }).join('') : '<li class="ya-dim">Needs at least 3 seconds of sound.</li>';
		var cl = [], at = SUM.clipAt; at.forEach(function (t) { var last = cl[cl.length - 1]; if (last && t - last.b < 0.5) { last.b = t; last.n++; } else cl.push({ a: t, b: t, n: 1 }); });
		$('ya-clipsum').textContent = SUM.clips ? SUM.clips + ' clipped spot' + (SUM.clips === 1 ? '' : 's') + (SUM.clips > at.length ? ' (the first ' + at.length + ' are listed)' : '') + '.' : 'No clipping found: the wave never sits flat at full scale.';
		$('ya-cliplist').innerHTML = cl.slice(0, 60).map(function (c) { return '<li>' + seekBtn(c.a, Y.fmtTime(c.a, 1)) + (c.n > 1 ? ' <span class="ya-dim">' + c.n + ' spots</span>' : '') + '</li>'; }).join('');
	}
	$('ya-thr').value = S.thr; $('ya-min').value = S.min;
	function silChange() { S.thr = +$('ya-thr').value; S.min = +$('ya-min').value; save(); if (!SER) { renderSil(); return; } sil = Y.silences(SER.rms, S.thr, S.min); renderSil(); drawAll(); }
	$('ya-thr').addEventListener('input', silChange); $('ya-min').addEventListener('input', silChange);
	$('ya-silcopy').addEventListener('click', function () { if (!sil.length) { toast('No quiet stretches to copy.'); return; } copy(sil.map(function (s) { return Y.fmtTime(s.a, 1) + ' - ' + Y.fmtTime(s.b, 1) + ' (' + (s.b - s.a).toFixed(1) + ' s)'; }).join('\n') + '\n', 'Copied ' + sil.length + ' quiet stretches.'); });

	/* ---------- playback ---------- */
	var audio = $('ya-audio'), audioURL = null;
	function canSeek() { return (!audio.hidden && !!audio.src) || !!(pageVid && SRC && SRC.kind === '3speak' && document.contains(pageVid)); }
	function setPlayback(url, show) {
		if (audioURL && audioURL.indexOf('blob:') === 0) URL.revokeObjectURL(audioURL);
		audioURL = url; audio.hidden = !url || !show;
		if (url) audio.src = url; else { audio.removeAttribute('src'); try { audio.load(); } catch (e) {} }
		$('ya-seekhint').hidden = !canSeek();
	}
	audio.addEventListener('error', function () { if (audio.src) { audio.hidden = true; $('ya-seekhint').hidden = true; } });
	function seek(t) {
		if (pageVid && SRC && SRC.kind === '3speak' && document.contains(pageVid)) { try { pageVid.currentTime = t; pageVid.play(); } catch (e) {} }
		else if (canSeek()) { try { audio.currentTime = t; audio.play(); } catch (e) {} }
		else toast('Jump to ' + Y.fmtTime(t) + ' in the player.');
		if (view && (t < view.a || t > view.b)) { var w = view.b - view.a; setView(t - w * 0.25, t + w * 0.75); }
	}
	root.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.ya-seek'); if (b) seek(+b.getAttribute('data-t')); });
	var phRaf = 0;
	function playEl() { return pageVid && SRC && SRC.kind === '3speak' && document.contains(pageVid) ? pageVid : audio; }
	function phLoop() { phRaf = 0; drawPlayhead(); if (!playEl().paused) phRaf = requestAnimationFrame(phLoop); }
	function watchVid(v) { v.addEventListener('play', function () { if (!phRaf) phRaf = requestAnimationFrame(phLoop); }); v.addEventListener('seeked', drawPlayhead); v.addEventListener('pause', drawPlayhead); }
	audio.addEventListener('play', function () { if (!phRaf) phRaf = requestAnimationFrame(phLoop); });
	audio.addEventListener('seeked', drawPlayhead); audio.addEventListener('pause', drawPlayhead);

	/* ---------- drawing helpers ---------- */
	function colors() {
		var cs = getComputedStyle(root), g = function (n, f) { return (cs.getPropertyValue(n) || '').trim() || f; };
		return { bg: g('--ya-cbg', '#f4f6f9'), grid: g('--ya-grid', 'rgba(0,0,0,.08)'), text: g('--ya-ctext', '#4b5563'), wave: g('--ya-wave', '#2563eb'), wave2: g('--ya-wave2', '#93b4f5'),
			m: g('--ya-m', '#94a3b8'), s: g('--ya-s', '#0f766e'), i: g('--ya-i', '#b91c1c'), t: g('--ya-t', 'rgba(22,163,74,.16)'), q: g('--ya-q', 'rgba(100,116,139,.18)'), c: g('--ya-c', '#dc2626'), fill: g('--ya-fill', 'rgba(37,99,235,.25)') };
	}
	function sizeCanvas(cv) {
		var w = cv.clientWidth, h = cv.clientHeight, r = Math.min(2, window.devicePixelRatio || 1);
		if (!w || !h) return null;
		if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
		var g = cv.getContext('2d'); g.setTransform(r, 0, 0, r, 0, 0); return g;
	}
	/* magma-like colour map */
	var STOPS = [[0, 4, 4, 18], [0.2, 50, 16, 98], [0.4, 125, 36, 130], [0.6, 205, 64, 113], [0.8, 251, 136, 97], [1, 252, 253, 191]], LUT = [];
	for (var li = 0; li < 256; li++) { var x = li / 255, j = 1; while (j < STOPS.length - 1 && STOPS[j][0] < x) j++; var a = STOPS[j - 1], b = STOPS[j], f = (x - a[0]) / (b[0] - a[0]); LUT.push([Math.round(a[1] + f * (b[1] - a[1])), Math.round(a[2] + f * (b[2] - a[2])), Math.round(a[3] + f * (b[3] - a[3]))]); }
	function specColor(v) { var c = LUT[Math.max(0, Math.min(255, Math.round(v * 255)))]; return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
	function freqTicks(g, W, H, C, xOf) {
		g.font = '11px system-ui, sans-serif'; g.fillStyle = C.text; g.textBaseline = 'bottom';
		[50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (f) { var x = xOf(f); if (x < 4 || x > W - 4) return; g.fillStyle = C.grid; g.fillRect(x, 0, 1, H - 14); g.fillStyle = C.text; g.fillText(Y.fmtHz(f).replace(' ', ''), x + 2, H); });
	}

	/* ---------- the timeline ---------- */
	function dur() { return Z ? Z.n / Z.sr : 0; }
	function setView(a, b) {
		var D = dur(); if (!D) return;
		var w = Math.max(Math.min(1, D), Math.min(D, b - a));
		if (a < 0) a = 0; if (a + w > D) a = D - w;
		view = { a: Math.max(0, a), b: Math.max(0, a) + w };
		drawAll();
	}
	function lanesOn() { return ['wave', 'loud', 'spec'].filter(function (l) { return S.lanes[l]; }); }
	function drawAll() {
		if (!Z || $('ya-res').hidden) return;
		var D = dur();
		if (!userZoom || !view) view = { a: 0, b: D }; else if (view.b > D) view = { a: Math.max(0, D - (view.b - view.a)), b: D };
		var on = lanesOn();
		[].forEach.call(root.querySelectorAll('.ya-lane'), function (el) { el.hidden = on.indexOf(el.getAttribute('data-l')) < 0; });
		$('ya-lanesbox').style.setProperty('--nl', String(Math.max(1, on.length)));
		$('ya-lanesbox').classList.toggle('ya-split', S.split && Z.nch === 2);
		var C = colors();
		if (S.lanes.wave) drawWave(C); if (S.lanes.loud) drawLoud(C); if (S.lanes.spec) drawSpec(C);
		drawAxis(C); drawPlayhead();
	}
	function xOfT(t, W) { return (t - view.a) / (view.b - view.a) * W; }
	function shade(g, W, H, C) {
		g.fillStyle = C.q; sil.forEach(function (s) { if (s.b < view.a || s.a > view.b) return; var x0 = xOfT(s.a, W), x1 = xOfT(s.b, W); g.fillRect(x0, 0, Math.max(1, x1 - x0), H); });
	}
	function grid(g, W, H, C) { var t = ticks(); g.fillStyle = C.grid; t.forEach(function (s) { var x = Math.round(xOfT(s, W)); g.fillRect(x, 0, 1, H); }); }
	function ticks() {
		var span = view.b - view.a, steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600], want = span / 8, st = steps[steps.length - 1];
		for (var i = 0; i < steps.length; i++) if (steps[i] >= want) { st = steps[i]; break; }
		var out = [], t = Math.ceil(view.a / st) * st; for (; t <= view.b + 1e-9; t += st) out.push(+t.toFixed(3));
		out.step = st; return out;
	}
	function drawWave(C) {
		var cv = $('ya-wave'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, nch = Z.nch, split = S.split && nch === 2, lanes = split ? 2 : 1, lh = H / lanes, db = S.ws === 'db';
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H); shade(g, W, H, C); grid(g, W, H, C);
		var bps = Z.sr / Z.WB, mins = Z.wmin.map(function (x) { return x.view(); }), maxs = Z.wmax.map(function (x) { return x.view(); }), nb = mins[0].length;
		var map = function (v) { if (!db) return v; var a = Math.abs(v); if (a < 1e-6) return 0; var d = Math.max(0, 1 + Y.db(a) / 60); return v < 0 ? -d : d; };
		for (var L = 0; L < lanes; L++) {
			var y0 = L * lh, mid = y0 + lh / 2, amp = lh / 2 - 2, chs = split ? [L] : (nch === 2 ? [0, 1] : [0]);
			g.fillStyle = C.grid; g.fillRect(0, Math.round(mid), W, 1);
			g.fillStyle = C.wave;
			for (var x = 0; x < W; x++) {
				var t0 = view.a + x / W * (view.b - view.a), t1 = view.a + (x + 1) / W * (view.b - view.a), i0 = Math.floor(t0 * bps), i1 = Math.max(i0 + 1, Math.floor(t1 * bps));
				if (i0 >= nb) break;
				var lo = 1, hi = -1;
				for (var c = 0; c < chs.length; c++) { var mn = mins[chs[c]], mx = maxs[chs[c]]; for (var i = i0; i < i1 && i < nb; i++) { if (mn[i] < lo) lo = mn[i]; if (mx[i] > hi) hi = mx[i]; } }
				if (hi < lo) continue;
				var ya = mid - map(hi) * amp, yb = mid - map(lo) * amp;
				g.fillRect(x, ya, 1, Math.max(1, yb - ya));
			}
			if (split) { g.fillStyle = C.text; g.font = '11px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText(L ? 'R' : 'L', 4, y0 + 3); }
		}
		/* clipping marks */
		g.fillStyle = C.c; SUM && SUM.clipAt.forEach(function (t) { if (t < view.a || t > view.b) return; g.fillRect(Math.round(xOfT(t, W)), 0, 2, 6); });
		if (db) { g.fillStyle = C.text; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText('0 dB', W - 30, 2); }
	}
	function drawLoud(C) {
		var cv = $('ya-loud'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, top = 0, bot = -60, yOf = function (v) { return (top - Math.max(bot, Math.min(top, v))) / (top - bot) * (H - 4) + 2; };
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H); shade(g, W, H, C); grid(g, W, H, C);
		g.fillStyle = C.t; g.fillRect(0, yOf(-13), W, yOf(-15) - yOf(-13));
		g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
		for (var v = -10; v > bot; v -= 10) { g.fillStyle = C.grid; g.fillRect(0, Math.round(yOf(v)), W, 1); g.fillStyle = C.text; g.fillText(String(v), 3, yOf(v) - 6); }
		var step = SER.step, n = SER.momentary.length;
		function line(arr, from, col, wdt) {
			g.strokeStyle = col; g.lineWidth = wdt; g.beginPath(); var pen = false;
			for (var x = 0; x <= W; x++) {
				var t0 = view.a + x / W * (view.b - view.a), t1 = view.a + (x + 1) / W * (view.b - view.a), i0 = Math.max(from, Math.round(t0 / step) - 1), i1 = Math.max(i0 + 1, Math.round(t1 / step) - 1), m = -Infinity;
				for (var i = i0; i < i1 && i < n; i++) if (arr[i] > m) m = arr[i];
				if (i0 >= n || m < bot - 1) { pen = false; continue; }
				var y = yOf(m); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
			}
			g.stroke();
		}
		line(SER.momentary, 3, C.m, 1.2);
		line(SER.shortTerm, 29, C.s, 2);
		if (isFinite(SUM.integrated)) { g.strokeStyle = C.i; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, yOf(SUM.integrated)); g.lineTo(W, yOf(SUM.integrated)); g.stroke(); g.setLineDash([]); g.fillStyle = C.i; g.fillText('Integrated ' + Y.fmtDb(SUM.integrated) + ' LUFS', 34, yOf(SUM.integrated) + (SUM.integrated > -8 ? 9 : -8)); }
	}
	function buildSpec() {
		if (specCols === Z.cols && specImg) return;
		var cols = Z.cols, NB = Z.NB, f = Math.max(1, Math.ceil(cols / 8192)), w = Math.max(1, Math.ceil(cols / f)), data = Z.spec.view();
		var cv = specImg || document.createElement('canvas'); cv.width = w; cv.height = NB;
		var g = cv.getContext('2d'), im = g.createImageData(w, NB), p = im.data;
		for (var x = 0; x < w; x++) for (var b = 0; b < NB; b++) {
			var m = 0; for (var k = x * f; k < Math.min(cols, (x + 1) * f); k++) { var v = data[k * NB + b]; if (v > m) m = v; }
			var c = LUT[m], o = ((NB - 1 - b) * w + x) * 4; p[o] = c[0]; p[o + 1] = c[1]; p[o + 2] = c[2]; p[o + 3] = 255;
		}
		g.putImageData(im, 0, 0); specImg = cv; specCols = cols; specImg.f = f;
	}
	function drawSpec(C) {
		var cv = $('ya-spec'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight; g.fillStyle = '#04040f'; g.fillRect(0, 0, W, H);
		if (!Z.cols) return; buildSpec();
		var colDur = Z.FN / Z.sr * specImg.f, sx = view.a / colDur, sw = (view.b - view.a) / colDur;
		g.imageSmoothingEnabled = sw > W; g.drawImage(specImg, sx, 0, Math.max(0.01, sw), specImg.height, 0, 0, W, H);
		g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
		var hi = Math.min(20000, Z.sr / 2);
		[100, 1000, 10000].forEach(function (f) { var y = H - Math.log(f / 30) / Math.log(hi / 30) * H; g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, Math.round(y), W, 1); g.fillStyle = '#e5e7eb'; g.fillText(Y.fmtHz(f), 3, y - 7); });
	}
	function drawAxis(C) {
		var cv = $('ya-axis'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, t = ticks(); g.clearRect(0, 0, W, H);
		g.font = '11px system-ui, sans-serif'; g.fillStyle = C.text; g.textBaseline = 'top';
		t.forEach(function (s) { var x = xOfT(s, W); g.fillRect(x, 0, 1, 4); var lab = Y.fmtTime(s, t.step < 1 ? 1 : 0), w = g.measureText(lab).width; g.fillText(lab, Math.max(0, Math.min(W - w, x - w / 2)), 6); });
	}
	var ph = document.createElement('div'); ph.className = 'ya-ph'; $('ya-lanesbox').appendChild(ph);
	var cross = document.createElement('div'); cross.className = 'ya-cross'; $('ya-lanesbox').appendChild(cross);
	function drawPlayhead() {
		if (!view || !canSeek()) { ph.hidden = true; return; }
		var m = playEl(), t = m.currentTime || 0, W = $('ya-lanesbox').clientWidth;
		if (!m.paused && (t > view.b || t < view.a) && userZoom) { var w = view.b - view.a; setView(t - w * 0.05, t + w * 0.95); }
		ph.hidden = t < view.a || t > view.b; ph.style.left = xOfT(t, W) + 'px';
	}

	/* hover, drag, zoom */
	var box = $('ya-lanesbox'), drag = null;
	function tAt(e) { var r = box.getBoundingClientRect(); return view.a + (e.clientX - r.left) / r.width * (view.b - view.a); }
	function readout(e) {
		if (!view || !Z) return;
		var r = box.getBoundingClientRect(), t = tAt(e), parts = ['<b>' + Y.fmtTime(t, 1) + '</b>'], i = Math.floor(t / SER.step);
		if (i >= 0 && i < SER.momentary.length) {
			parts.push('momentary ' + Y.fmtDb(SER.momentary[i]) + ' LUFS'); if (i >= 29) parts.push('short-term ' + Y.fmtDb(SER.shortTerm[i]) + ' LUFS');
			parts.push('RMS ' + Y.fmtDb(SER.rms[i]) + ' dBFS');
		}
		var sp = $('ya-spec'); if (S.lanes.spec && !sp.closest('.ya-lane').hidden) { var sr = sp.getBoundingClientRect(); if (e.clientY >= sr.top && e.clientY <= sr.bottom) { var fy = (sr.bottom - e.clientY) / sr.height, hi = Math.min(20000, Z.sr / 2); parts.push('≈ ' + Y.fmtHz(30 * Math.pow(hi / 30, fy))); } }
		$('ya-read').innerHTML = parts.join(' · ');
		cross.hidden = false; cross.style.left = (e.clientX - r.left) + 'px';
	}
	box.addEventListener('pointermove', function (e) {
		if (drag) {
			var r = box.getBoundingClientRect(), dt = (e.clientX - drag.x) / r.width * (drag.b - drag.a);
			if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
			if (drag.moved) { userZoom = true; setView(drag.a - dt, drag.b - dt); }
		}
		readout(e);
	});
	box.addEventListener('pointerleave', function () { cross.hidden = true; });
	box.addEventListener('pointerdown', function (e) { if (!view || e.button > 0) return; drag = { x: e.clientX, a: view.a, b: view.b, moved: false, id: e.pointerId }; try { box.setPointerCapture(e.pointerId); } catch (x) {} });
	box.addEventListener('pointerup', function (e) { var d = drag; drag = null; if (d && !d.moved && view) { if (canSeek()) seek(Math.max(0, tAt(e))); } });
	box.addEventListener('pointercancel', function () { drag = null; });
	function zoomAt(t, f) { if (!view) return; userZoom = true; var a = t - (t - view.a) * f, b = t + (view.b - t) * f; if (b - a >= dur() - 1e-6) { userZoom = false; view = null; drawAll(); return; } setView(a, b); }
	box.addEventListener('wheel', function (e) {
		if (!view) return;
		var filled = $('ya-tl').classList.contains('mes-pfill');
		if (!(e.ctrlKey || e.metaKey || filled)) return;
		e.preventDefault();
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { var w = view.b - view.a; userZoom = true; setView(view.a + e.deltaX / box.clientWidth * w, view.b + e.deltaX / box.clientWidth * w); return; }
		zoomAt(tAt(e), Math.exp(e.deltaY * 0.0025));
	}, { passive: false });
	box.addEventListener('dblclick', function () { userZoom = false; view = null; drawAll(); });
	$('ya-zin').addEventListener('click', function () { if (view) zoomAt((view.a + view.b) / 2, 0.5); });
	$('ya-zout').addEventListener('click', function () { if (view) zoomAt((view.a + view.b) / 2, 2); });
	$('ya-zall').addEventListener('click', function () { userZoom = false; view = null; drawAll(); });

	/* lanes / scale / split */
	function paintSeg() {
		[].forEach.call(root.querySelectorAll('#ya-lanes button'), function (b) { b.setAttribute('aria-pressed', S.lanes[b.getAttribute('data-lane')] ? 'true' : 'false'); });
		[].forEach.call(root.querySelectorAll('#ya-wscale button'), function (b) { b.setAttribute('aria-pressed', S.ws === b.getAttribute('data-ws') ? 'true' : 'false'); });
		$('ya-split').checked = !!S.split;
	}
	root.querySelector('#ya-lanes').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var l = b.getAttribute('data-lane'); S.lanes[l] = !S.lanes[l]; if (!lanesOn().length) S.lanes[l] = true; save(); paintSeg(); drawAll(); });
	root.querySelector('#ya-wscale').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.ws = b.getAttribute('data-ws'); save(); paintSeg(); drawAll(); });
	$('ya-split').addEventListener('change', function () { S.split = this.checked; save(); drawAll(); });
	paintSeg();

	/* ---------- average spectrum ---------- */
	function drawLtas() {
		var cv = $('ya-ltas'), g = sizeCanvas(cv); if (!g || !Z || !Z.ltasN) return;
		var W = cv.clientWidth, H = cv.clientHeight, C = colors(), N = Z.FN, sr = Z.sr, hi = Math.min(20000, sr / 2), lo = 20, P = Z.ltas, n = Z.ltasN;
		var xOf = function (f) { return Math.log(f / lo) / Math.log(hi / lo) * W; }, fOf = function (x) { return lo * Math.pow(hi / lo, x / W); };
		var vals = [], mx = -Infinity;
		for (var x = 0; x < W; x++) {
			var b0 = Math.floor(fOf(x) * N / sr), b1 = Math.max(b0 + 1, Math.floor(fOf(x + 1) * N / sr)), s = 0, c = 0;
			for (var b = b0; b < b1 && b <= N / 2; b++) { s += P[b]; c++; }
			var v = c ? Y.pdb(s / c / n) : -Infinity; vals.push(v); if (v > mx) mx = v;
		}
		var top = isFinite(mx) ? Math.ceil(mx / 10) * 10 : 0, bot = top - 80, PH = H - 30, yOf = function (v) { return 4 + (top - Math.max(bot, Math.min(top, v))) / (top - bot) * (PH - 4); };
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
		g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
		for (var d = top - 10; d >= bot; d -= 20) { g.fillStyle = C.grid; g.fillRect(0, Math.round(yOf(d)), W, 1); g.fillStyle = C.text; g.fillText(d + ' dB', 3, yOf(d) - 6); }
		var regions = [[20, 60, 'Rumble'], [60, 250, 'Bass'], [250, 2000, 'Mids'], [2000, 6000, 'Presence'], [6000, 20000, 'Air']];
		g.textBaseline = 'bottom';
		regions.forEach(function (r, i) { var a = xOf(r[0]), b2 = Math.min(W, xOf(Math.min(r[1], hi))); if (b2 <= a) return; if (i % 2) { g.fillStyle = C.q; g.fillRect(a, 0, b2 - a, PH); } g.fillStyle = C.text; var tw = g.measureText(r[2]).width; if (b2 - a > tw + 4) g.fillText(r[2], (a + b2) / 2 - tw / 2, H - 15); });
		g.beginPath(); g.moveTo(0, PH);
		vals.forEach(function (v, x) { g.lineTo(x, isFinite(v) ? yOf(v) : PH); }); g.lineTo(W, PH); g.closePath();
		g.fillStyle = C.fill; g.fill();
		g.beginPath(); vals.forEach(function (v, x) { var y = isFinite(v) ? yOf(v) : PH; if (x) g.lineTo(x, y); else g.moveTo(x, y); }); g.strokeStyle = C.wave; g.lineWidth = 1.5; g.stroke();
		g.textBaseline = 'bottom'; g.fillStyle = C.text;
		[50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(function (f) { var xx = xOf(f); if (xx > W - 20) return; g.fillStyle = C.grid; g.fillRect(xx, 0, 1, PH); g.fillStyle = C.text; g.fillText(Y.fmtHz(f).replace(' ', ''), xx + 2, H); });
		/* energy share: bass / mids / highs */
		var sh = [0, 0, 0], all = 0; for (var k = 1; k <= N / 2; k++) { var f = k * sr / N, p = P[k]; if (f < 20) continue; all += p; sh[f < 250 ? 0 : f < 4000 ? 1 : 2] += p; }
		$('ya-spnote').textContent = all > 0 ? 'Where the energy is: bass (under 250 Hz) ' + Math.round(sh[0] / all * 100) + '%, mids (250 Hz – 4 kHz) ' + Math.round(sh[1] / all * 100) + '%, highs ' + Math.round(sh[2] / all * 100) + '%. Speech usually has most in the mids; music more in the bass.' : '';
	}

	/* ---------- export ---------- */
	function copy(text, done) {
		var ok = function () { toast(done || 'Copied.'); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
		function fallback() { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Copy failed.'); } t.remove(); }
	}
	function baseName() { return String(SRC && SRC.title || 'audio').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'audio'; }
	function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
	$('ya-copy').addEventListener('click', function () { if (!SUM) return; copy(Y.reportText(SUM, SRC && (SRC.title + (SRC.link ? ' (' + SRC.link + ')' : ''))), 'Summary copied.'); });
	$('ya-csv').addEventListener('click', function () { if (!SER) return; download(new Blob([Y.csv(SER)], { type: 'text/csv' }), baseName() + '-loudness.csv'); });
	$('ya-png').addEventListener('click', function () {
		if (!SUM) return;
		var cvs = ['ya-wave', 'ya-loud', 'ya-spec', 'ya-axis'].map($).filter(function (c) { return !c.closest('.ya-lane') || !c.closest('.ya-lane').hidden; });
		var r = cvs[0].width / cvs[0].clientWidth, W = cvs[0].width, pad = Math.round(14 * r), head = Math.round(46 * r), H = head + cvs.reduce(function (s, c) { return s + c.height + pad / 2; }, 0) + pad;
		var out = document.createElement('canvas'); out.width = W + pad * 2; out.height = H;
		var g = out.getContext('2d'), C = colors(), dark = document.body.classList.contains('dark-mode');
		g.fillStyle = dark ? '#1a1a1a' : '#ffffff'; g.fillRect(0, 0, out.width, H);
		g.fillStyle = dark ? '#e5e7eb' : '#111827'; g.font = 'bold ' + Math.round(15 * r) + 'px system-ui, sans-serif'; g.textBaseline = 'top';
		g.fillText((SRC && SRC.title || 'Audio') + ' · ' + Y.fmtDb(SUM.integrated) + ' LUFS · true peak ' + Y.fmtDb(SUM.truePeak) + ' dBTP · LRA ' + (SUM.range || 0).toFixed(1) + ' LU', pad, pad);
		g.font = Math.round(11 * r) + 'px system-ui, sans-serif'; g.fillStyle = C.text; g.fillText('mes.fm/youtube-audio', pad, pad + Math.round(20 * r));
		var y = head; cvs.forEach(function (c) { g.drawImage(c, pad, y); y += c.height + pad / 2; });
		out.toBlob(function (b) { if (b) download(b, baseName() + '-audio.png'); }, 'image/png');
	});

	/* ---------- Fill window / Full screen, resize, theme ---------- */
	function redraw() { drawAll(); drawLtas(); if (cap && Z) drawLiveSpec(); }
	function addPanels() {
		if (!window.MESPanel) return;
		MESPanel.add($('ya-tl'), { bar: $('ya-tlbtns'), onChange: function () { setTimeout(redraw, 30); } });
		MESPanel.add($('ya-sp'), { bar: $('ya-spbtns'), onChange: function () { setTimeout(drawLtas, 30); } });
		MESPanel.add($('ya-player'), { bar: $('ya-pbtns'), onChange: function () { setTimeout(redraw, 30); } });
	}
	if (window.MESPanel) addPanels(); else window.addEventListener('load', addPanels);
	var rt = 0; function later() { clearTimeout(rt); rt = setTimeout(redraw, 60); }
	if (window.ResizeObserver) { var ro = new ResizeObserver(later); ro.observe($('ya-lanesbox')); ro.observe($('ya-ltas')); } else window.addEventListener('resize', later);
	new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* phones and Firefox / Safari can't share a tab's sound: say so up front instead of after a click */
	var canCap = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && AC && window.AudioWorkletNode) && !/Firefox\//.test(navigator.userAgent) && !(/Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)\//.test(navigator.userAgent));
	if (!canCap) [].forEach.call(document.querySelectorAll('[data-cap]'), function (b) {
		b.disabled = true;
		var p = document.createElement('p'); p.className = 'ya-nocap';
		p.textContent = 'This browser can\'t share a tab\'s sound with a page (phones, Firefox and Safari can\'t). Open this page in Chrome, Edge, Brave or Opera on a computer, or download the video and drop the file.';
		b.parentNode.parentNode.insertBefore(p, b.parentNode.nextSibling);
	});
	/* ---------- start ---------- */
	try { var q = new URL(location.href).searchParams.get('u'); if (q) { $('ya-url').value = q; setTab('link'); openLink(q); } } catch (e) {}
	window.MESYADebug = { analyse: function (ch, sr, title) { return analyseChannels(ch, sr, { kind: 'file', title: title || 'test' }, { cancel: false }); }, state: function () { return { Z: Z, SUM: SUM, view: view }; } };
})();
