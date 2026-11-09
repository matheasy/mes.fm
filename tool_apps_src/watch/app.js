/* MES Watch -- mes.fm/watch. A plain player for YouTube (IFrame API, nocookie), 3Speak (HLS in our own <video>), Odysee (file in our own <video>),
   direct media files, and the own embed players of Rumble / BitChute / X. Lists (Up next, Saved, History with resume points) live in
   localStorage mes-watch:v1; nothing is sent to MES. */
(function () {
	'use strict';
	var W = window.MESWatch, $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-watch:v1', HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
	var S = { q: [], i: -1, saved: [], hist: [], lists: [], chans: [], shorts: false, rate: 1, tab: 'q', auto: true, priv: true, histOn: true, cm: false, pz: true, pzHint: 0, zoom: { k: 1, x: 0, y: 0 } };
	var openList = null;
	try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) for (var k in S) if (raw[k] != null) S[k] = raw[k]; } catch (e) {}
	var saveHooks = [];
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} saveHooks.forEach(function (f) { try { f(); } catch (x) {} }); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function toast(t, undo) {
		var x = $('wt-toast'); x.textContent = t;
		if (undo) { var b = document.createElement('button'); b.type = 'button'; b.className = 'wt-tundo'; b.textContent = 'Undo'; b.onclick = function () { x.classList.remove('tu-toast--show'); undo(); }; x.appendChild(document.createTextNode(' ')); x.appendChild(b); }
		x.classList.add('tu-toast--show'); clearTimeout(x._t); x._t = setTimeout(function () { x.classList.remove('tu-toast--show'); }, undo ? 6000 : 2200);
	}
	function msg(t) { $('wt-msg').textContent = t || ''; }
	function copy(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Link copied'); }, function () { window.prompt('Copy this link:', t); }); }
	function loadScript(u) { return new Promise(function (res, rej) { var x = document.createElement('script'); x.src = u; x.onload = res; x.onerror = function () { rej(new Error('Could not load the player.')); }; document.head.appendChild(x); }); }

	/* ---------- titles / thumbnails (filled in lazily, shared by all lists) ---------- */
	var META = {}, metaBusy = 0, metaQ = [];
	function setMeta(key, t, th) {
		if (!t && !th) return; META[key] = { t: t, th: th };
		[S.q, S.saved, S.hist].concat(S.lists.map(function (l) { return l.items; })).forEach(function (L) { L.forEach(function (x) { if (x.key === key) { if (t && !x.t) x.t = t; if (th && !x.th) x.th = th; } }); });
		if (cur && cur.key === key) { if (t && !cur.t) cur.t = t; if (th && !cur.th) cur.th = th; showMeta(); }
		save(); renderListSoon();
	}
	function needMeta(it) {
		if ((it.t && it.th) || META[it.key] || metaQ.some(function (x) { return x.key === it.key; })) return;
		if (!/^(youtube|3speak|odysee)$/.test(it.k)) return;
		META[it.key] = { pending: 1 }; metaQ.push(it); pumpMeta();
	}
	function pumpMeta() {
		while (metaBusy < 3 && metaQ.length) {
			var it = metaQ.shift(); metaBusy++;
			fetchMeta(it).then(function (r) { if (r) setMeta(r.key, r.t, r.th); }, function () {}).then(function () { metaBusy--; pumpMeta(); });
		}
	}
	function fetchMeta(it) {
		if (it.k === 'youtube') return fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + it.id), { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && { key: it.key, t: j.title, th: it.th }; });
		if (it.k === '3speak') return speakInfo(it).then(function (i) { return { key: it.key, t: i.title, th: i.thumb }; });
		if (it.k === 'odysee') return odyseeGet(it).then(function (i) { return { key: it.key, t: i.title, th: i.thumb }; });
		return Promise.resolve(null);
	}
	function speakInfo(it) {
		return fetch('https://play.3speak.tv/api/embed?v=' + encodeURIComponent(it.id).replace('%2F', '/'), { credentials: 'omit' }).then(function (r) {
			if (!r.ok) throw new Error('3Speak answered ' + r.status + '.'); return r.json();
		}).then(function (j) {
			var u = j && (j.videoUrl || j.videoUrlFallback1 || j.videoUrlFallback2);
			if (!u) throw new Error('3Speak has no video for that link.');
			return { url: u, title: j.title || '', thumb: j.thumbnail || j.thumbnailUrl || '', owner: j.owner || '', hive: j.hivePermlink || j.permlink || '' };
		});
	}
	function odyseeInfo(uri) {
		return fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=resolve', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'resolve', params: { urls: [uri] }, id: 1 }) })
			.then(function (r) { return r.json(); }).then(function (j) { var c = j && j.result && j.result[uri], v = (c && c.value) || {}; return { title: v.title || '', thumb: (v.thumbnail && v.thumbnail.url) || '' }; });
	}
	var odyCache = {};
	function odyseeGet(it) {
		if (odyCache[it.key]) return odyCache[it.key];
		var uri = 'lbry://' + String(it.id).split('/').map(function (s) { return s.replace(/:([0-9a-f]+)$/i, '#$1'); }).join('/');
		var p = fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=get', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'get', params: { uri: uri, save_file: false }, id: 1 }) })
			.then(function (r) { return r.json(); }).then(function (j) {
				var res = j && j.result; if (!res || !res.streaming_url) throw new Error('Odysee could not find that video.');
				return odyseeInfo(uri).then(function (i) { return { url: res.streaming_url, title: i.title, thumb: i.thumb }; }, function () { return { url: res.streaming_url, title: '', thumb: '' }; });
			});
		odyCache[it.key] = p; p.catch(function () { delete odyCache[it.key]; });
		return p;
	}

	/* ---------- the player ---------- */
	var cur = null, gen = 0, yt = null, vid = null, hls = null, saveT = 0, rateNote = 0;
	function histRec(it) { var i = W.indexOf(S.hist, it.key); return i < 0 ? null : S.hist[i]; }
	function teardown() {
		clearInterval(saveT); saveT = 0;
		if (yt) { try { yt.destroy(); } catch (e) {} yt = null; }
		if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
		if (vid) { try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (e) {} vid = null; }
		setStage('');
	}
	function setStage(h) { $('wt-stage').innerHTML = h; zoomLayer(); }
	function position() {
		try { if (yt && yt.getCurrentTime) return { pos: yt.getCurrentTime() || 0, dur: yt.getDuration() || 0 }; } catch (e) {}
		if (vid) return { pos: vid.currentTime || 0, dur: isFinite(vid.duration) ? vid.duration : 0 };
		return null;
	}
	function remember() {
		if (!cur || S.histOn === false) return; var p = position(); if (!p || (!p.pos && !p.dur)) return;
		S.hist = W.touch(S.hist, cur, p.pos, p.dur); save(); if (S.tab === 'hist') renderListSoon();
	}
	window.addEventListener('pagehide', remember);
	document.addEventListener('visibilitychange', function () { if (document.hidden) remember(); });

	function play(it, opts) {
		opts = opts || {};
		remember();
		var j = W.indexOf(S.q, it.key);
		if (j < 0) { S.q = S.q.slice(); S.q.splice(Math.max(0, S.i + 1), 0, it); j = Math.max(0, S.i + 1); }
		S.i = j; cur = S.q[j]; save();
		var g = ++gen; teardown();
		var stage = $('wt-stage'), mode = W.mode(cur), start = opts.t != null ? opts.t : W.resumeAt(cur, histRec(cur));
		showMeta(); renderList(); needMeta(cur);
		if (S.histOn !== false) { S.hist = W.touch(S.hist, cur, start, (histRec(cur) || {}).dur || 0); save(); }
		if (mode === 'yt') {
			var holder;
			if (S.priv) {
				// our own frame, loaded without the person's cookies (credentialless: Chromium browsers), so nothing reaches their YouTube history
				holder = document.createElement('iframe'); holder.id = 'wt-yt'; holder.setAttribute('credentialless', ''); try { holder.credentialless = true; } catch (e) {}
				holder.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'; holder.allowFullscreen = true; holder.title = W.label(cur);
				holder.referrerPolicy = 'strict-origin-when-cross-origin';
				holder.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(cur.id) + '?enablejsapi=1&rel=0&playsinline=1&iv_load_policy=3&autoplay=1&start=' + (start || 0) + '&origin=' + encodeURIComponent(location.origin);
			} else { holder = document.createElement('div'); holder.id = 'wt-yt'; }
			stage.appendChild(holder);
			ensureYT().then(function () {
				if (g !== gen) return;
				yt = new YT.Player('wt-yt', { host: S.priv ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com', videoId: cur.id, width: '100%', height: '100%',
					playerVars: { rel: 0, playsinline: 1, modestbranding: 1, autoplay: 1, start: start || 0, iv_load_policy: 3 },
					events: {
						onReady: function (e) { if (g !== gen) return; try { e.target.setPlaybackRate(W.ytSpeed(S.rate)); e.target.playVideo(); var d = e.target.getVideoData(); if (d && d.title) setMeta(cur.key, d.title, cur.th); } catch (x) {} syncSpeed(); },
						onStateChange: function (e) { if (g === gen && e.data === 0) ended(); },
						onError: function (e) { if (g === gen) failed(e && (e.data === 100 || e.data === 5) ? 'YouTube says this video is unavailable (removed or private).' : 'YouTube would not play this video here (the owner may have turned off playing on other sites).'); }
					} });
				saveT = setInterval(remember, 5000);
			}, function (e) { if (g === gen) failed(e.message); });
		} else if (mode === 'hls' || mode === 'odysee' || mode === 'file') {
			setStage('<p class="wt-loading">Loading the video…</p>');
			var src = mode === 'hls' ? speakInfo(cur) : mode === 'odysee' ? odyseeGet(cur) : Promise.resolve({ url: cur.u, title: cur.t });
			src.then(function (info) {
				if (g !== gen) return;
				if (info.title || info.thumb) setMeta(cur.key, info.title, info.thumb);
				var v = document.createElement('video'); v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.autoplay = true; v.preload = 'auto';
				if (info.thumb) v.poster = info.thumb;
				setStage(''); stage.appendChild(v); vid = v;
				v.addEventListener('loadedmetadata', function () { if (start && start < (v.duration || 1e9) - 5) v.currentTime = start; v.playbackRate = S.rate; }, { once: true });
				v.addEventListener('ended', function () { if (g === gen) ended(); });
				v.addEventListener('ratechange', function () { if (g === gen && Math.abs(v.playbackRate - S.rate) > 0.001) { S.rate = v.playbackRate; save(); syncSpeed(); } });
				v.addEventListener('error', function () { if (g === gen) failed('This browser could not play the video file.'); });
				if (mode === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
					return (window.Hls ? Promise.resolve() : loadScript(HLS_URL)).then(function () {
						if (g !== gen) return; if (!window.Hls || !Hls.isSupported()) throw new Error('This browser can\'t play 3Speak videos here.');
						hls = new Hls(); hls.loadSource(info.url); hls.attachMedia(v);
						hls.on(Hls.Events.ERROR, function (ev, d) { if (d && d.fatal && g === gen) failed('3Speak stopped sending the video.'); });
					});
				}
				v.src = info.url;
				var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
			}).catch(function (e) { if (g === gen) failed(e.message); });
			saveT = setInterval(remember, 5000);
		} else if (mode === 'embed') {
			var f = document.createElement('iframe'); if (S.priv) { f.setAttribute('credentialless', ''); try { f.credentialless = true; } catch (e) {} } f.src = cur.e; f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = W.label(cur);
			stage.appendChild(f);
		} else {
			setStage('<div class="wt-empty"><b>This link can\'t be played here.</b><span>' + (cur.k === 'rumble' ? 'Rumble only lets other sites play its <em>Embed</em> link (on Rumble: Share, then Embed). ' : cur.k === 'odysee' ? 'That is an Odysee channel, not a video. ' : '') +
				'</span><a class="tu-btn tu-btn--primary" href="' + esc(cur.u) + '" target="_blank" rel="noopener">Open it on ' + esc(W.siteName(cur)) + ' ↗&#xFE0E;</a></div>');
		}
		syncSpeed();
		if (S.cm) loadComments();
		if (S.pz !== false && !S.pzHint && !(finePtr && finePtr.matches) && /^(yt|hls|odysee|file)$/.test(mode)) { S.pzHint = 1; save(); setTimeout(function () { toast('Tap the video to play / pause · pinch or double-tap to zoom'); }, 1500); }
	}
	function failed(text) {
		var stage = $('wt-stage');
		setStage('<div class="wt-empty"><b>' + esc(text) + '</b><a class="tu-btn tu-btn--ghost" href="' + esc(cur.u) + '" target="_blank" rel="noopener">Open it on ' + esc(W.siteName(cur)) + ' ↗&#xFE0E;</a>' +
			(S.i < S.q.length - 1 ? '<button type="button" class="tu-btn tu-btn--primary" data-act="next">Play the next one ⏭&#xFE0E;</button>' : '') + '</div>');
	}
	function ended() {
		if (cur && S.histOn !== false) { var p = position(); S.hist = W.touch(S.hist, cur, p ? p.dur : 0, p ? p.dur : 0); save(); }
		if (S.auto && S.i < S.q.length - 1) go(1);
		else { renderList(); toast(S.i < S.q.length - 1 ? 'Finished. Press ⏭ for the next one.' : 'That was the last one in Up next.'); }
	}
	function go(d) {
		var j = S.i + d; if (j < 0 || j >= S.q.length) { toast(d > 0 ? 'Nothing more in Up next' : 'This is the first one'); return; }
		play(S.q[j]);
	}
	var ytLoading = null;
	function ensureYT() {
		if (window.YT && window.YT.Player) return Promise.resolve();
		if (ytLoading) return ytLoading;
		ytLoading = new Promise(function (res, rej) {
			var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} res(); };
			loadScript('https://www.youtube.com/iframe_api').catch(function () { ytLoading = null; rej(new Error('YouTube\'s player could not be loaded (a blocker may be stopping it).')); });
		});
		return ytLoading;
	}
	function showMeta() {
		var has = !!cur;
		$('wt-title').textContent = has ? W.label(cur) : '';
		$('wt-sub').textContent = has ? W.siteName(cur) + (S.q.length > 1 ? ' · ' + (S.i + 1) + ' of ' + S.q.length + ' in Up next' : '') : '';
		var o = $('wt-open'); o.hidden = !has; if (has) o.href = cur.u;
		$('wt-copy').hidden = !has; $('wt-star').hidden = !has;
		if (has) { var st = W.indexOf(S.saved, cur.key) >= 0; $('wt-star').textContent = st ? '★' : '☆'; $('wt-star').setAttribute('aria-pressed', String(st)); $('wt-star').title = st ? 'Remove from Saved' : 'Save for later'; }
		$('wt-prev').disabled = !has || S.i <= 0; $('wt-next').disabled = !has || S.i >= S.q.length - 1;
		if (has) document.title = W.label(cur) + ' · MES Watch';
	}

	/* ---------- speed ---------- */
	function setRate(r) {
		r = Math.round(Math.max(0.25, Math.min(4, r)) * 100) / 100; S.rate = r; save();
		if (vid) vid.playbackRate = r;
		if (yt && yt.setPlaybackRate) { try { yt.setPlaybackRate(W.ytSpeed(r)); } catch (e) {} if (r > 2 && Date.now() - rateNote > 4000) { rateNote = Date.now(); toast('YouTube\'s player goes up to 2×'); } }
		syncSpeed();
	}
	function step(dir) {
		var L = W.SPEEDS, r = S.rate, i;
		if (dir > 0) { for (i = 0; i < L.length && L[i] <= r + 0.001; i++); setRate(L[Math.min(i, L.length - 1)]); }
		else { for (i = L.length - 1; i >= 0 && L[i] >= r - 0.001; i--); setRate(L[Math.max(i, 0)]); }
	}
	function syncSpeed() {
		var ok = cur && W.canSpeed(cur), shown = cur && W.mode(cur) === 'yt' ? W.ytSpeed(S.rate) : S.rate;
		$('wt-sv').textContent = (+shown.toFixed(2)) + '×'; $('wt-speed').classList.toggle('wt-off', !ok);
		['wt-slower', 'wt-faster', 'wt-sv'].forEach(function (id) { $(id).disabled = !ok; });
		$('wt-speed').title = ok ? 'Speed: S slower, D faster, R normal' : 'This site\'s own player has its own speed setting';
	}
	$('wt-slower').onclick = function () { step(-1); };
	$('wt-faster').onclick = function () { step(1); };
	$('wt-sv').onclick = function () { setRate(1); };

	/* ---------- adding links ---------- */
	var taking = false;
	function take(then) {
		if (taking) return;
		var r = W.parseMany($('wt-in').value);
		if (r.channels.length) { r.channels.forEach(function (ch, i) { addChannel(ch, i === r.channels.length - 1); }); if (!r.items.length && !r.playlists.length) { $('wt-in').value = ''; grow(); msg(r.channels.length === 1 ? 'Channel added: its newest videos are below.' : r.channels.length + ' channels added.'); return; } }
		if (!r.items.length && !r.playlists.length) { msg(r.errors.length ? r.errors[0].reason : 'Paste a video link first.'); return; }
		var skipped = r.errors.length ? r.errors.length + ' link' + (r.errors.length > 1 ? 's' : '') + ' skipped (not a web link).' : '';
		msg(skipped); $('wt-in').value = ''; grow();
		if (!r.playlists.length) { then(r.items); return; }
		taking = true; msg('Getting the playlist from YouTube…');
		var all = r.items.slice(), bad = 0, made = [];
		r.playlists.reduce(function (pr, id) {
			return pr.then(function () { return ytPlaylist(id).then(function (pl) {
				all = W.add(all, pl.items);
				// keep it under My playlists (refresh the one imported before, if any)
				var old = S.lists.filter(function (l) { return l.src === id; })[0];
				if (old) { old.items = pl.items; if (pl.title) old.name = pl.title; } else { var nl = W.newList(pl.title || 'YouTube playlist', pl.items); nl.src = id; S.lists.unshift(nl); }
				made.push(pl.title || 'playlist');
			}, function () { bad++; }); });
		}, Promise.resolve()).then(function () {
			taking = false; save();
			msg((made.length ? 'Added "' + made.join('", "') + '" to My playlists. ' : '') + (bad ? bad + ' playlist' + (bad > 1 ? 's' : '') + ' could not be read (private, or a blocker stopped YouTube). ' : '') + skipped);
			if (all.length) then(all); else renderList();
		});
	}
	/* a YouTube playlist's video ids, from YouTube's own player (getPlaylist: up to 200), title from oEmbed */
	function ytPlaylist(id) {
		return ensureYT().then(function () {
			return new Promise(function (res, rej) {
				var box = document.createElement('div'), h = document.createElement('div'), done = false, pl;
				box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;overflow:hidden;'; box.setAttribute('aria-hidden', 'true');
				box.appendChild(h); document.body.appendChild(box);
				var to = setTimeout(function () { fin(null); }, 20000);
				function fin(ids) {
					if (done) return; done = true; clearTimeout(to); try { pl.destroy(); } catch (e) {} box.remove();
					if (!ids || !ids.length) { rej(new Error('no list')); return; }
					var items = ids.map(function (v) { return W.item('https://www.youtube.com/watch?v=' + v); }).filter(function (x) { return !x.err; });
					fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/playlist?list=' + id), { credentials: 'omit' })
						.then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
						.then(function (j) { res({ title: (j && j.title) || '', items: items }); });
				}
				pl = new YT.Player(h, { host: 'https://www.youtube-nocookie.com', width: 320, height: 180,
					playerVars: { listType: 'playlist', list: id, autoplay: 0, mute: 1, playsinline: 1 },
					events: {
						onReady: function () { var n = 0; (function poll() { var ids = null; try { ids = pl.getPlaylist(); } catch (e) {} if (ids && ids.length) return fin(ids); if (++n > 60) return fin(null); setTimeout(poll, 250); })(); },
						onError: function () { fin(null); }
					} });
			});
		});
	}
	$('wt-form').addEventListener('submit', function (e) {
		e.preventDefault();
		take(function (items) {
			var at = Math.max(0, S.i + 1), fresh = items.filter(function (x) { return W.indexOf(S.q, x.key) < 0; });
			S.q = S.q.slice(); Array.prototype.splice.apply(S.q, [at, 0].concat(fresh));
			play(items[0]); setTab('q');
		});
	});
	$('wt-qadd').onclick = function () { take(function (items) { S.q = W.add(S.q, items); save(); setTab('q'); showMeta(); toast(items.length + ' added to Up next'); }); };
	$('wt-sadd').onclick = function () { take(function (items) { S.saved = W.add(S.saved, items, true); save(); setTab('saved'); toast(items.length === 1 ? 'Saved for later' : items.length + ' saved for later'); }); };
	function grow() { var t = $('wt-in'); t.style.height = ''; if (!t.value) return; t.style.height = 'auto'; t.style.height = Math.min(Math.max(t.scrollHeight + 2, t.offsetHeight), 200) + 'px'; }
	$('wt-in').addEventListener('input', grow);
	$('wt-in').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('wt-form').requestSubmit ? $('wt-form').requestSubmit() : $('wt-play').click(); } });

	/* ---------- Latest from: the two MES channels + the person's own (any YouTube channel, through /api/yt-latest) ---------- */
	var latestCh = null, latestCache = {};
	function latestOf(ch) {
		return latestCache[ch] || (latestCache[ch] = fetch('/api/yt-latest?ch=' + encodeURIComponent(ch)).then(function (r) { if (!r.ok) throw new Error(r.status === 400 ? 'That is not a YouTube channel link.' : 'YouTube did not answer.'); return r.json(); }));
	}
	function chPath(ch, id) { return ch === 'mes' || ch === 'mestruth' ? '@' + ch : /^@/.test(ch) ? ch : 'channel/' + (id || ch); }
	function renderChans() {
		$('wt-mychans').innerHTML = S.chans.map(function (c) {
			return '<span class="wt-chipw"><button type="button" class="wt-chip" data-ch="' + esc(c.k) + '" aria-pressed="' + (latestCh === c.k) + '">' + esc(c.n || c.k) + '</button><button type="button" class="wt-chipx" data-chx="' + esc(c.k) + '" title="Remove ' + esc(c.n || c.k) + '" aria-label="Remove ' + esc(c.n || c.k) + '">×</button></span>';
		}).join('');
		document.querySelectorAll('#wt-chans .wt-chip[data-ch]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.ch === latestCh)); });
	}
	function addChannel(ch, open) {
		var known = ch === 'mes' || ch === 'mestruth' || S.chans.some(function (c) { return c.k === ch; });
		if (!known) { S.chans = S.chans.concat([{ k: ch, n: '' }]).slice(-30); save(); }
		renderChans();
		if (open) showLatest(ch, true);
	}
	function showLatest(ch, force) {
		var box = $('wt-latest');
		if (latestCh === ch && !force) { latestCh = null; box.hidden = true; renderChans(); return; }
		latestCh = ch; box.hidden = false; box.innerHTML = '<p class="wt-loading">Loading…</p>'; renderChans();
		latestOf(ch).then(function (j) {
			if (latestCh !== ch) return;
			var c = S.chans.filter(function (x) { return x.k === ch; })[0];
			if (c && j.title && c.n !== j.title) { c.n = j.title; save(); renderChans(); }
			var name = j.title || (c && c.n) || ch, all = j.items || [], nShort = all.filter(function (v) { return v.short; }).length;
			var items = all.filter(function (v) { return S.shorts || !v.short; }).map(function (v) { var it = W.item('https://www.youtube.com/watch?v=' + v.id); it.t = v.title; return it; });
			box.innerHTML = '<div class="wt-lhead"><b>' + esc(name) + ' · ' + items.length + ' newest</b><span class="wt-lbtns">' +
				(nShort ? '<label class="wt-check"><input type="checkbox" data-lshorts' + (S.shorts ? ' checked' : '') + '> Shorts (' + nShort + ')</label>' : '') +
				(items.length ? '<button type="button" class="tu-btn tu-btn--ghost" data-lall>+ Add all to Up next</button><button type="button" class="tu-btn tu-btn--ghost" data-lsave>Save as a playlist</button>' : '') +
				'<a class="tu-btn tu-btn--ghost" href="https://www.youtube.com/' + esc(chPath(ch, j.id)) + '/videos" target="_blank" rel="noopener">All videos ↗&#xFE0E;</a></span></div>' +
				(items.length ? '<div class="wt-lgrid">' + items.map(function (it, i) { return '<button type="button" class="wt-lcard" data-li="' + i + '"><img alt="" loading="lazy" src="' + esc(it.th) + '"><span>' + esc(it.t) + '</span></button>'; }).join('') + '</div>' : '<p class="wt-loading">' + (nShort ? 'Only Shorts lately: tick Shorts to see them.' : 'No videos found.') + '</p>');
			box.onclick = function (e) {
				var cd = e.target.closest('[data-li]'); if (cd) { play(items[+cd.dataset.li]); setTab('q'); $('wt-player').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
				if (e.target.closest('[data-lall]')) { S.q = W.add(S.q, items); save(); setTab('q'); showMeta(); toast(items.length + ' added to Up next'); }
				if (e.target.closest('[data-lsave]')) { var l = W.newList(name + ' (newest)', items); S.lists.unshift(l); save(); openList = l.id; setTab('lists'); toast('Saved under My playlists'); }
			};
			box.onchange = function (e) { if (e.target.matches('[data-lshorts]')) { S.shorts = e.target.checked; save(); showLatest(ch, true); } };
		}).catch(function (e) { delete latestCache[ch]; if (latestCh === ch) box.innerHTML = '<p class="wt-loading">' + esc((e && e.message) || 'Could not load the list right now.') + '</p>'; });
	}
	$('wt-chans').addEventListener('click', function (e) {
		var x = e.target.closest('[data-chx]');
		if (x) { var k = x.dataset.chx; S.chans = S.chans.filter(function (c) { return c.k !== k; }); save(); if (latestCh === k) { latestCh = null; $('wt-latest').hidden = true; } renderChans(); return; }
		var b = e.target.closest('.wt-chip[data-ch]'); if (b) showLatest(b.dataset.ch);
	});
	$('wt-chadd').onclick = function () {
		var t = prompt('Paste a YouTube channel link, or its @handle:', '@'); if (!t) return;
		var ch = W.channelRef(t.trim()) || W.channelRef('@' + t.trim().replace(/^@/, ''));
		if (!ch) { toast('That is not a YouTube channel link or @handle'); return; }
		addChannel(ch, true);
	};
	renderChans();

	/* ---------- lists ---------- */
	function setTab(t) { if (t !== 'lists') openList = null; S.tab = t; save(); document.querySelectorAll('.wt-tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); }); renderList(); }
	document.querySelectorAll('.wt-tab').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function listOf(t) { if (t === 'lists') { var l = openList && W.findList(S.lists, openList); return l ? l.items : S.lists; } return t === 'saved' ? S.saved : t === 'hist' ? S.hist : S.q; }
	function inList() { return S.tab === 'lists' && openList && W.findList(S.lists, openList); }
	var rlT = 0; function renderListSoon() { clearTimeout(rlT); rlT = setTimeout(renderList, 60); }
	function renderList() {
		$('wt-nq').textContent = S.q.length; $('wt-ns').textContent = S.saved.length; $('wt-nh').textContent = S.hist.length; $('wt-nl').textContent = S.lists.length;
		var L = listOf(S.tab), box = $('wt-list'), now = Date.now(), ol = inList();
		$('wt-lnew').hidden = S.tab !== 'lists' || !!ol; $('wt-histwrap').hidden = S.tab !== 'hist'; $('wt-histon').checked = S.histOn !== false;
		if (S.tab === 'lists' && !ol) {
			$('wt-share').hidden = true; $('wt-clear').hidden = true;
			box.innerHTML = !S.lists.length ? '<p class="wt-none">No playlists yet. Paste a YouTube playlist link above, press <b>+ List</b> under a video, or make one from Up next.</p>' :
				S.lists.map(function (l, i) {
					var th = (l.items.filter(function (x) { return x.th; })[0] || {}).th;
					return '<div class="wt-row" data-i="' + i + '"><button type="button" class="wt-rmain" data-act="lopen" aria-label="Open ' + esc(l.name) + '">' +
						'<span class="wt-th">' + (th ? '<img alt="" loading="lazy" src="' + esc(th) + '">' : '<span class="wt-thx">Playlist</span>') + '<span class="wt-lcount">' + l.items.length + '</span></span>' +
						'<span class="wt-rtx"><b>' + esc(l.name) + '</b><small>' + l.items.length + ' video' + (l.items.length === 1 ? '' : 's') + (l.src ? ' · from YouTube' : '') + '</small></span></button>' +
						'<span class="wt-racts"><button type="button" class="wt-b" data-act="lplay" title="Play all (replaces Up next)" aria-label="Play all">▶&#xFE0E;</button>' +
						'<button type="button" class="wt-b" data-act="lqueue" title="Add all to Up next" aria-label="Add all to Up next">+</button>' +
						'<button type="button" class="wt-b" data-act="lren" title="Rename" aria-label="Rename">✎&#xFE0E;</button>' +
						'<button type="button" class="wt-b" data-act="lshare" title="Copy a link to this playlist" aria-label="Copy link">🔗&#xFE0E;</button>' +
						'<button type="button" class="wt-b" data-act="ldel" title="Delete this playlist" aria-label="Delete">✕</button></span></div>';
				}).join('');
			return;
		}
		var head = ol ? '<div class="wt-lback"><button type="button" class="wt-b" data-lback>← My playlists</button><b>' + esc(ol.name) + '</b><button type="button" class="wt-b" data-lplayall>▶&#xFE0E; Play all</button></div>' : '';
		if (!L.length) { box.innerHTML = head + '<p class="wt-none">' + (ol ? 'This playlist is empty. Press <b>+ List</b> under a video to add it here.' : S.tab === 'q' ? 'Up next is empty. Paste links above and press <b>+ Up next</b>.' : S.tab === 'saved' ? 'Nothing saved yet. Press ☆ on a video to keep it for later.' : 'Videos you watch show up here, with where you stopped.') + '</p>'; $('wt-share').hidden = $('wt-clear').hidden = true; return; }
		$('wt-share').hidden = S.tab === 'hist'; $('wt-clear').hidden = false;
		var movable = S.tab === 'q' || !!ol;
		box.innerHTML = head + L.map(function (it, i) {
			needMeta(it);
			var h = S.tab === 'hist' ? it : histRec(it), p = W.pct(h), isCur = cur && cur.key === it.key, stared = W.indexOf(S.saved, it.key) >= 0;
			var sub = [W.siteName(it)];
			if (h && h.dur) sub.push(W.done(h) ? 'watched' : W.fmt(h.pos) + ' of ' + W.fmt(h.dur));
			if (S.tab === 'hist') sub.push(W.ago(it.at, now));
			return '<div class="wt-row' + (isCur ? ' wt-cur' : '') + '" data-i="' + i + '">' +
				'<button type="button" class="wt-rmain" data-act="play" aria-label="Play ' + esc(W.label(it)) + '">' +
				'<span class="wt-th">' + (it.th ? '<img alt="" loading="lazy" src="' + esc(it.th) + '">' : '<span class="wt-thx">' + esc(W.siteName(it)) + '</span>') + (p ? '<span class="wt-prog"><i style="width:' + p.toFixed(1) + '%"></i></span>' : '') + (isCur ? '<span class="wt-now">▶&#xFE0E; Playing</span>' : '') + '</span>' +
				'<span class="wt-rtx"><b>' + esc(W.label(it)) + '</b><small>' + esc(sub.join(' · ')) + '</small></span></button>' +
				'<span class="wt-racts">' +
				(movable ? (ol ? '<button type="button" class="wt-b" data-act="queue" title="Add to Up next" aria-label="Add to Up next">+</button>' : '') + '<button type="button" class="wt-b" data-act="up" title="Move up" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="wt-b" data-act="down" title="Move down" aria-label="Move down"' + (i < L.length - 1 ? '' : ' disabled') + '>↓</button>' : '<button type="button" class="wt-b" data-act="queue" title="Add to Up next" aria-label="Add to Up next">+</button>') +
				(S.tab !== 'saved' ? '<button type="button" class="wt-b" data-act="star" title="' + (stared ? 'Remove from Saved' : 'Save for later') + '" aria-pressed="' + stared + '">' + (stared ? '★' : '☆') + '</button>' : '') +
				'<button type="button" class="wt-b" data-act="del" title="Remove from this list" aria-label="Remove">✕</button></span></div>';
		}).join('');
	}
	function loadList(l, replace) {
		if (!l.items.length) { toast('That playlist is empty'); return; }
		if (replace) { S.q = l.items.slice(); S.i = -1; play(S.q[0]); setTab('q'); $('wt-player').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		else { S.q = W.add(S.q, l.items); save(); showMeta(); toast(l.items.length + ' added to Up next'); renderList(); }
	}
	$('wt-list').addEventListener('click', function (e) {
		if (e.target.closest('[data-lback]')) { openList = null; renderList(); return; }
		if (e.target.closest('[data-lplayall]')) { var ol0 = inList(); if (ol0) loadList(ol0, true); return; }
		var b = e.target.closest('[data-act]'), row = e.target.closest('.wt-row'); if (!b || !row) return;
		var L = listOf(S.tab), i = +row.dataset.i, it = L[i], a = b.dataset.act; if (!it) return;
		if (/^l(open|play|queue|ren|share|del)$/.test(a)) {
			if (a === 'lopen') { openList = it.id; renderList(); return; }
			if (a === 'lplay') { loadList(it, true); return; }
			if (a === 'lqueue') { loadList(it, false); return; }
			if (a === 'lren') { var nm = prompt('Name of this playlist:', it.name); if (nm && nm.trim()) it.name = nm.trim().slice(0, 80); }
			if (a === 'lshare') { if (it.items.length) copy(W.shareUrl(location.origin + '/watch', it.items.slice(0, 50), 0, it.name)); return; }
			if (a === 'ldel') { if (!confirm('Delete the playlist "' + it.name + '"? (The videos stay in your other lists.)')) return; S.lists = S.lists.filter(function (x) { return x.id !== it.id; }); }
			save(); renderList(); return;
		}
		var ol = inList();
		if (a === 'play') { if (S.tab !== 'q' && W.indexOf(S.q, it.key) < 0) { var c = {}; for (var k in it) if (!/^(pos|dur|at)$/.test(k)) c[k] = it[k]; it = c; } else if (S.tab !== 'q') it = S.q[W.indexOf(S.q, it.key)]; play(it); $('wt-player').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
		if (ol && (a === 'up' || a === 'down' || a === 'del')) {
			if (a === 'del') ol.items = W.remove(ol.items, it.key); else ol.items = W.move(ol.items, i, i + (a === 'up' ? -1 : 1));
			save(); renderList(); return;
		}
		if (a === 'up' || a === 'down') { var curKey = cur && cur.key; S.q = W.move(S.q, i, i + (a === 'up' ? -1 : 1)); S.i = curKey ? W.indexOf(S.q, curKey) : -1; }
		else if (a === 'queue') { S.q = W.add(S.q, [it]); toast('Added to Up next'); }
		else if (a === 'star') { if (W.indexOf(S.saved, it.key) >= 0) S.saved = W.remove(S.saved, it.key); else S.saved = W.add(S.saved, [it], true); }
		else if (a === 'del') {
			if (S.tab === 'q') { var ck = cur && cur.key; S.q = W.remove(S.q, it.key); S.i = ck ? W.indexOf(S.q, ck) : -1; }
			else if (S.tab === 'saved') S.saved = W.remove(S.saved, it.key); else S.hist = W.remove(S.hist, it.key);
		}
		save(); renderList(); showMeta();
	});
	$('wt-clear').onclick = function () {
		var names = { q: 'Up next', saved: 'Saved', hist: 'History' }, ol = inList();
		if (ol) { if (!confirm('Remove every video from "' + ol.name + '"?')) return; ol.items = []; save(); renderList(); return; }
		if (!confirm('Clear ' + names[S.tab] + '?')) return;
		if (S.tab === 'q') { S.q = cur ? [cur] : []; S.i = cur ? 0 : -1; } else if (S.tab === 'saved') S.saved = []; else S.hist = [];
		save(); renderList(); showMeta();
	};
	$('wt-share').onclick = function () { var L = listOf(S.tab), ol = inList(); if (L.length) copy(W.shareUrl(location.origin + '/watch', L.slice(0, 50), 0, ol ? ol.name : '')); };
	$('wt-lnew').onclick = function () {
		var nm = prompt('Name of the new playlist:', 'My playlist ' + (S.lists.length + 1)); if (!nm || !nm.trim()) return;
		var l = W.newList(nm.trim(), S.q.map(strip)); S.lists.unshift(l); openList = l.id; save(); renderList(); toast(l.items.length ? 'Playlist made from Up next' : 'Empty playlist made: press + List under a video to fill it');
	};
	$('wt-histon').onchange = function () { S.histOn = this.checked; save(); toast(this.checked ? 'History is on' : 'History is off: nothing new is kept'); };
	$('wt-priv').checked = S.priv !== false;
	$('wt-priv').onchange = function () { S.priv = this.checked; save(); toast(this.checked ? 'Private: players load without your sign-in (from the next video)' : 'Players can now see your sign-in, so views count in your history'); if (cur && W.mode(cur) !== 'hls' && W.mode(cur) !== 'odysee' && W.mode(cur) !== 'file') { var p = position(); play(cur, p ? { t: Math.floor(p.pos) } : {}); } };
	function strip(it) { var c = {}; for (var k in it) if (!/^(pos|dur|at)$/.test(k)) c[k] = it[k]; return c; }

	/* "+ List": add the playing video to one of my playlists */
	function closeMenu() { $('wt-lmenu').hidden = true; document.removeEventListener('pointerdown', menuOut, true); }
	function menuOut(e) { if (!e.target.closest('#wt-lmenu') && !e.target.closest('#wt-addl')) closeMenu(); }
	$('wt-addl').onclick = function () {
		var m = $('wt-lmenu'); if (!m.hidden) { closeMenu(); return; } if (!cur) return;
		m.innerHTML = '<b>Add to a playlist</b>' + S.lists.map(function (l) { var has = W.indexOf(l.items, cur.key) >= 0; return '<button type="button" role="menuitem" data-l="' + esc(l.id) + '"' + (has ? ' aria-checked="true"' : '') + '>' + (has ? '✓ ' : '') + esc(l.name) + ' <small>' + l.items.length + '</small></button>'; }).join('') +
			'<button type="button" role="menuitem" data-l="new">+ New playlist…</button>';
		var r = this.getBoundingClientRect(), fs = document.fullscreenElement;
		(fs && fs.contains(this) ? fs : document.body).appendChild(m);
		m.hidden = false; m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
		m.style.top = (r.bottom + m.offsetHeight + 8 < window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - m.offsetHeight - 4)) + 'px';
		setTimeout(function () { document.addEventListener('pointerdown', menuOut, true); }, 0);
	};
	$('wt-lmenu').addEventListener('click', function (e) {
		var b = e.target.closest('[data-l]'); if (!b || !cur) return; var id = b.dataset.l, l;
		if (id === 'new') { var nm = prompt('Name of the new playlist:', 'My playlist ' + (S.lists.length + 1)); if (!nm || !nm.trim()) return; l = W.newList(nm.trim(), []); S.lists.unshift(l); }
		else l = W.findList(S.lists, id);
		if (!l) return;
		if (W.indexOf(l.items, cur.key) >= 0) { l.items = W.remove(l.items, cur.key); toast('Removed from "' + l.name + '"'); }
		else { l.items = W.add(l.items, [strip(cur)]); toast('Added to "' + l.name + '"'); }
		save(); closeMenu(); renderList();
	});

	/* ---------- zoom: scale / move the picture inside its box (pinch, drag, wheel, + / −) ---------- */
	var zMode = false, zPtr = {}, zStart = null;
	function stageBox() { var st = $('wt-stage'); return { w: st.clientWidth, h: st.clientHeight }; }
	function zoomLayer() {
		var st = $('wt-stage'); if (!st || st.querySelector('.wt-zov')) { applyZoom(); return; }
		var ov = document.createElement('div'); ov.className = 'wt-zov'; ov.hidden = !zMode;
		ov.innerHTML = '<div class="wt-zpill" role="toolbar" aria-label="Zoom">' +
			'<button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" class="wt-zv" title="Back to 100%">100%</button><button type="button" data-z="in" aria-label="Zoom in">+</button>' +
			'<button type="button" data-z="fill" title="Fill the box (crops the black bars)">Fill</button><button type="button" data-z="done" class="wt-zdone">✓ Done</button></div>' +
			'<p class="wt-zhint">Pinch or drag to zoom and move · double-tap = Fill / 100%</p>';
		st.appendChild(ov); wireZoom(ov);
		// mouse computers: no layer over the player at 100% (so YouTube's own clicks, double-click full screen and caption dragging
		// work as on youtube.com); a small zoom strip shows on the right while the pointer is over the video instead
		var mini = document.createElement('div'); mini.className = 'wt-zmini'; mini.setAttribute('role', 'toolbar'); mini.setAttribute('aria-label', 'Zoom');
		mini.innerHTML = '<button type="button" data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button><button type="button" data-z="reset" class="wt-zv" title="Back to 100% (0)">100%</button><button type="button" data-z="out" title="Zoom out (−)" aria-label="Zoom out">−</button><button type="button" data-z="fill" title="Fill the box (crops the black bars)">Fill</button>';
		mini.addEventListener('click', function (e) { var b = e.target.closest('[data-z]'); if (!b) return; var z = b.dataset.z, k = (S.zoom || {}).k || 1; if (z === 'in') zoomTo(k * 1.25); else if (z === 'out') zoomTo(k / 1.25); else if (z === 'reset') zoomTo(1); else zoomTo(fillK()); });
		mini.addEventListener('wheel', function (e) { e.preventDefault(); zoomTo(((S.zoom || {}).k || 1) * Math.pow(1.0015, -e.deltaY)); }, { passive: false });
		st.appendChild(mini); applyZoom();
	}
	var finePtr = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
	if (finePtr && finePtr.addEventListener) finePtr.addEventListener('change', function () { applyZoom(); });
	function applyZoom() {
		var st = $('wt-stage'), b = stageBox(), z = W.clampZoom(S.zoom || {}, b.w, b.h); S.zoom = z;
		st.style.setProperty('--zk', z.k); st.style.setProperty('--zx', z.x + 'px'); st.style.setProperty('--zy', z.y + 'px');
		st.classList.toggle('wt-zoomed', z.k > 1.001);
		var pct = Math.round(z.k * 100) + '%'; st.querySelectorAll('.wt-zv').forEach(function (v) { v.textContent = pct; });
		var zb = $('wt-zoom'); zb.innerHTML = '🔍&#xFE0E; ' + (z.k > 1.001 ? pct : 'Zoom'); zb.setAttribute('aria-pressed', String(zMode));
		// the layer is always over a playing video (pinch / drag / double-tap zoom, tap = play / pause); it leaves the player's
		// own control bar at the bottom free, except in zoom mode. Not over Rumble / BitChute / X: their play button is inside
		// their own player, which a page can't press for you.
		var ov = st.querySelector('.wt-zov'), touch = touchOn(), fill = $('wt-player').classList.contains('mes-pfill');
		if (ov) {
			ov.hidden = !(zMode || touch);
			ov.classList.toggle('wt-zfull', zMode);
			ov.style.touchAction = zMode || fill || z.k > 1.001 ? 'none' : 'pan-y';   // a swipe over the video still scrolls the page
		}
		st.classList.toggle('wt-ztouch', touch && !zMode);
	}
	function touchOn() {
		if (S.pz === false || !cur) return false;
		var m = W.mode(cur); if (!/^(yt|hls|odysee|file)$/.test(m)) return false;
		if (finePtr && finePtr.matches && ((S.zoom || {}).k || 1) <= 1.001) return false;   // mouse at 100%: leave the player alone
		return !!$('wt-stage').querySelector('iframe#wt-yt, video');
	}
	var zSave = 0; function zoomTo(k, px, py) {
		// keep the point (px, py) (from the box centre) still while the scale changes
		var z = S.zoom || { k: 1, x: 0, y: 0 }; k = Math.max(1, Math.min(4, k)); px = px || 0; py = py || 0;
		S.zoom = { k: k, x: px - (px - z.x) / z.k * k, y: py - (py - z.y) / z.k * k }; applyZoom();
		clearTimeout(zSave); zSave = setTimeout(save, 400);
	}
	function fillK() { var b = stageBox(), ar = vid && vid.videoWidth ? vid.videoWidth / vid.videoHeight : 16 / 9; return W.fillZoom(b.w, b.h, ar); }
	function setZMode(on) { zMode = on; if (on) toast('Pinch or drag on the picture · + / − · Done when finished'); applyZoom(); }
	function wireZoom(ov) {
		ov.querySelector('.wt-zpill').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		ov.addEventListener('click', function (e) {
			var b = e.target.closest('[data-z]'); if (!b) return; var z = b.dataset.z, k = (S.zoom || {}).k || 1;
			if (z === 'in') zoomTo(k * 1.25); else if (z === 'out') zoomTo(k / 1.25); else if (z === 'reset') zoomTo(1); else if (z === 'fill') zoomTo(fillK()); else if (z === 'done') setZMode(false);
		});
		function rel(e) { var r = ov.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; }
		var lastTap = null, tapT = 0, g = null;   // g = this gesture: start time / place, moved, more than one finger
		ov.addEventListener('pointerdown', function (e) {
			try { ov.setPointerCapture(e.pointerId); } catch (x) {} zPtr[e.pointerId] = rel(e);
			var ids = Object.keys(zPtr), z = S.zoom || { k: 1, x: 0, y: 0 };
			if (ids.length === 1) {
				g = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false, multi: false };
				zStart = { p: zPtr[ids[0]], z: z };
			} else if (ids.length === 2) {
				if (g) g.multi = true;
				var a = zPtr[ids[0]], c = zPtr[ids[1]];
				zStart = { mid: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, d: Math.hypot(a.x - c.x, a.y - c.y) || 1, z: z };
			}
		});
		ov.addEventListener('pointermove', function (e) {
			if (!zPtr[e.pointerId] || !zStart) return; zPtr[e.pointerId] = rel(e);
			if (g && !g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.moved = true;
			if (g && !g.moved) return;
			var ids = Object.keys(zPtr), z0 = zStart.z;
			if (ids.length === 1 && zStart.p) { var p = zPtr[ids[0]]; S.zoom = { k: z0.k, x: z0.x + p.x - zStart.p.x, y: z0.y + p.y - zStart.p.y }; }
			else if (ids.length >= 2 && zStart.mid) {
				var a = zPtr[ids[0]], c = zPtr[ids[1]], mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, k = Math.max(1, Math.min(4, z0.k * (Math.hypot(a.x - c.x, a.y - c.y) || 1) / zStart.d));
				S.zoom = { k: k, x: mid.x - (zStart.mid.x - z0.x) / z0.k * k, y: mid.y - (zStart.mid.y - z0.y) / z0.k * k };
			}
			applyZoom();
		});
		function up(e) {
			if (e.type === 'pointerup' && g && !g.moved && !g.multi && Date.now() - g.t < 400 && Object.keys(zPtr).length === 1) tap(e);
			delete zPtr[e.pointerId];
			if (!Object.keys(zPtr).length) g = null; var ids = Object.keys(zPtr); zStart = ids.length === 1 ? { p: zPtr[ids[0]], z: S.zoom } : null; clearTimeout(zSave); zSave = setTimeout(save, 400); }
		ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
		// one tap = play / pause (after a moment, in case a second tap follows); two taps = Fill / back to 100%
		function tap(e) {
			var now = Date.now(), p = rel(e);
			if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
				clearTimeout(tapT); lastTap = null;
				var k = (S.zoom || {}).k || 1; if (k > 1.05) zoomTo(1); else zoomTo(fillK(), p.x, p.y);
				return;
			}
			lastTap = { t: now, x: e.clientX, y: e.clientY };
			clearTimeout(tapT); tapT = setTimeout(function () { lastTap = null; if (!zMode) togglePlay(); }, 300);
		}
		ov.addEventListener('wheel', function (e) {
			// plain wheel scrolls the page, unless the video fills the window or zoom mode is on; Ctrl + wheel / trackpad pinch always zooms
			if (!(zMode || e.ctrlKey || $('wt-player').classList.contains('mes-pfill'))) return;
			e.preventDefault(); var p = rel(e); zoomTo(((S.zoom || {}).k || 1) * Math.pow(1.0015, -e.deltaY), p.x, p.y); }, { passive: false });
	}
	$('wt-zoom').onclick = function () { setZMode(!zMode); };
	if (window.ResizeObserver) new ResizeObserver(function () { applyZoom(); }).observe($('wt-stage'));
	if (window.MutationObserver) new MutationObserver(function () { applyZoom(); }).observe($('wt-stage'), { childList: true });
	$('wt-pz').checked = S.pz !== false;
	$('wt-pz').onchange = function () { S.pz = this.checked; save(); applyZoom(); };

	/* ---------- player bar ---------- */
	$('wt-prev').onclick = function () { go(-1); };
	$('wt-next').onclick = function () { go(1); };
	$('wt-stage').addEventListener('click', function (e) { if (e.target.closest('[data-act=next]')) go(1); });
	$('wt-star').onclick = function () { if (!cur) return; if (W.indexOf(S.saved, cur.key) >= 0) { S.saved = W.remove(S.saved, cur.key); toast('Removed from Saved'); } else { S.saved = W.add(S.saved, [cur], true); toast('Saved for later'); } save(); showMeta(); renderList(); };
	$('wt-copy').onclick = function () { if (!cur) return; var p = position(); copy(W.shareUrl(location.origin + '/watch', [cur], p && W.mode(cur) !== 'embed' ? p.pos : 0)); };
	$('wt-auto').checked = S.auto !== false;
	$('wt-auto').onchange = function () { S.auto = this.checked; save(); };

	/* ---------- keys ---------- */
	function togglePlay() {
		if (yt && yt.getPlayerState) { try { if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo(); } catch (e) {} return true; }
		if (vid) { if (vid.paused) vid.play().catch(function () {}); else vid.pause(); return true; }
		return false;
	}
	function seekBy(d) {
		var p = position(); if (!p) return;
		var t = Math.max(0, Math.min((p.dur || 1e9) - 0.5, p.pos + d));
		if (yt && yt.seekTo) yt.seekTo(t, true); else if (vid) vid.currentTime = t;
		toast((d > 0 ? '+' : '−') + Math.abs(d) + ' s · ' + W.fmt(t));
	}
	document.addEventListener('keydown', function (e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		var tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
		if (tg && tg.tagName === 'VIDEO' && /^(\s|ArrowLeft|ArrowRight)$/.test(e.key)) return;   // the video's own controls handle these
		var k = e.key.toLowerCase(), used = true;
		if (k === ' ' || k === 'k') used = togglePlay();
		else if (k === 'j') seekBy(-10); else if (k === 'l') seekBy(10);
		else if (e.key === 'ArrowLeft' && cur) seekBy(-5); else if (e.key === 'ArrowRight' && cur) seekBy(5);
		else if (k === 's' && cur && W.canSpeed(cur)) step(-1); else if (k === 'd' && cur && W.canSpeed(cur)) step(1); else if (k === 'r' && cur && W.canSpeed(cur)) setRate(1);
		else if (k === 'n') go(e.shiftKey ? -1 : 1);
		else if (k === 'z') setZMode(!zMode);
		else if (k === 'c') $('wt-cmbtn').click();
		else if ((e.key === '+' || e.key === '=') && cur) zoomTo(((S.zoom || {}).k || 1) * 1.25);
		else if ((e.key === '-' || e.key === '_') && cur) zoomTo(((S.zoom || {}).k || 1) / 1.25);
		else if (k === '0' && cur) zoomTo(1);
		else if (e.key === 'Escape' && zMode) setZMode(false);
		else if (k === 'w') { var fb = $('wt-pbtns').querySelector('button'); if (fb) fb.click(); }
		else used = false;
		if (used) e.preventDefault();
	});

	/* ---------- start ---------- */
	function boot() {
		// phones with a camera notch: without viewport-fit=cover the full-screen picture is pushed off centre by the notch's width
		var vp = document.querySelector('meta[name=viewport]'); if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';
		if (window.MESPanel) window.MESPanel.add($('wt-player'), { bar: $('wt-pbtns'), stage: $('wt-stage'), onChange: function () { setTimeout(applyZoom, 60); } });
		zoomLayer();
		renderList(); showMeta(); syncSpeed(); setTab(S.tab || 'q'); paintCmBtn();
		if (/[?&]debug=1/.test(location.search)) window.MESWatchDebug = { S: S, play: play, go: go, position: position, cur: function () { return cur; } };
		var Q = W.fromQuery(location.search);
		if (Q.links.length) {
			var r = W.parseMany(Q.links.join(' '));
			if (r.items.length) {
				S.q = W.add(r.items, S.q.filter(function (x) { return !r.items.some(function (y) { return y.key === x.key; }); }));
				S.i = -1;
				if (Q.name) { var nl = W.newList(Q.name, r.items); S.lists.unshift(nl); toast('Saved under My playlists: ' + Q.name); }
				save();
				// browsers only allow sound after a click, so the first video waits for the press of its own play button
				play(S.q[0], Q.t ? { t: Q.t } : {});
			}
			try { history.replaceState(null, '', location.pathname); } catch (e) {}
		} else if (S.i >= 0 && S.q[S.i]) {
			cur = S.q[S.i]; showMeta(); renderList();
			setStage('<div class="wt-empty"><b>' + esc(W.label(cur)) + '</b><span>' + (histRec(cur) && histRec(cur).pos > 20 && !W.done(histRec(cur)) ? 'You stopped at ' + W.fmt(histRec(cur).pos) + '.' : 'Ready to play.') + '</span><button type="button" class="tu-btn tu-btn--primary" id="wt-resume">▶&#xFE0E; ' + (histRec(cur) && histRec(cur).pos > 20 && !W.done(histRec(cur)) ? 'Continue' : 'Play') + '</button></div>');
			$('wt-resume').onclick = function () { play(cur); };
		}
		if (S.cm && cur && !$('wt-cm').innerHTML) loadComments();
	}
	/* ---------- comments (off by default; S.cm) ---------- */
	var cmGen = 0, cmState = null;
	function paintCmBtn() { var b = $('wt-cmbtn'); b.setAttribute('aria-pressed', String(!!S.cm)); b.innerHTML = '💬&#xFE0E; ' + (S.cm ? 'Hide comments' : 'Comments'); $('wt-cm').hidden = !S.cm; }
	$('wt-cmbtn').onclick = function () { S.cm = !S.cm; save(); paintCmBtn(); if (S.cm) loadComments(); else { cmGen++; $('wt-cm').innerHTML = ''; } };
	function cmText(t, md) {
		t = String(t || '');
		if (md) t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '[picture]').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/[*_`#>]+/g, '');
		t = t.trim(); var long = t.length > 900;
		return { html: esc(long ? t.slice(0, 900) + '…' : t).replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>'), long: long };
	}
	function cmRow(c, site) {
		var tx = cmText(c.text, c.md);
		return '<li class="wt-cmi"><div class="wt-cmh"><b>' + esc(c.author || 'Someone') + '</b>' + (c.creator ? ' <span class="wt-cmc">creator</span>' : '') + (c.when ? ' <span class="wt-cmw">' + esc(c.when) + '</span>' : '') + '</div>' +
			'<div class="wt-cmt">' + tx.html + '</div><div class="wt-cmf">' + [
				c.likes ? '♥ ' + c.likes.toLocaleString() : '',
				c.replies ? (c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">' : '') + c.replies + (c.replies === 1 ? ' reply' : ' replies') + (c.url ? ' ↗&#xFE0E;</a>' : '') : '',
				tx.long && c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">Read all on ' + esc(site) + ' ↗&#xFE0E;</a>' : ''
			].filter(Boolean).join(' · ') + '</div></li>';
	}
	function cmPaint() {
		var box = $('wt-cm'), c = cmState; if (!c) return;
		var head = '<div class="wt-cmhead"><b>Comments' + (c.count != null ? ' (' + Number(c.count).toLocaleString() + ')' : '') + '</b><span class="wt-cmsrc">from ' + esc(c.site) + '</span>' +
			(cur ? '<a class="wt-cmopen" href="' + esc(cur.u) + '" target="_blank" rel="noopener">Reply on ' + esc(c.site) + ' ↗&#xFE0E;</a>' : '') + '</div>';
		box.innerHTML = head + (c.msg ? '<p class="wt-cmmsg">' + c.msg + '</p>' : '') + (c.items.length ? '<ul class="wt-cml">' + c.items.map(function (x) { return cmRow(x, c.site); }).join('') + '</ul>' : '') +
			(c.more ? '<button type="button" class="tu-btn tu-btn--ghost wt-cmmore" data-cmmore' + (c.busy ? ' disabled' : '') + '>' + (c.busy ? 'Loading…' : 'Load more') + '</button>' : (c.busy ? '<p class="wt-cmmsg">Loading…</p>' : ''));
	}
	$('wt-cm').addEventListener('click', function (e) { if (e.target.closest('[data-cmmore]') && cmState && cmState.more && !cmState.busy) cmState.more(); });
	function hivePost(author, permlink) {
		var nodes = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'];
		function tryN(i) {
			return fetch(nodes[i], { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'bridge.get_discussion', params: { author: author, permlink: permlink }, id: 1 }) })
				.then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.result) throw new Error('no answer'); return j.result; })
				.catch(function (e) { if (i + 1 < nodes.length) return tryN(i + 1); throw e; });
		}
		return tryN(0);
	}
	function loadComments() {
		var g = ++cmGen, it = cur, box = $('wt-cm'); if (!it) { box.innerHTML = '<p class="wt-cmmsg">Play a video to see its comments.</p>'; return; }
		var mode = W.mode(it), site = W.siteName(it);
		cmState = { site: site, items: [], count: null, msg: '', more: null, busy: true }; cmPaint();
		function done() { if (g === cmGen) { cmState.busy = false; cmPaint(); } }
		function fail(t) { if (g !== cmGen) return; cmState.msg = esc(t); done(); }
		if (it.k === 'youtube') {
			var ytPage = function (c, ver) {
				cmState.busy = true; cmPaint();
				fetch('/api/yt-comments?v=' + encodeURIComponent(it.id) + (c ? '&c=' + encodeURIComponent(c) + '&ver=' + encodeURIComponent(ver) : '')).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (j) {
					if (g !== cmGen) return;
					if (j.count != null) cmState.count = j.count;
					cmState.items = cmState.items.concat((j.items || []).map(function (x) { return { author: x.author, creator: x.creator, when: x.when, text: x.text, likes: x.likes, replies: x.replies, url: 'https://www.youtube.com/watch?v=' + it.id + '&lc=' + x.id }; }));
					cmState.more = j.next ? function () { ytPage(j.next, j.ver); } : null;
					if (!cmState.items.length) cmState.msg = j.off ? 'Comments are turned off for this video.' : 'No comments yet.';
					done();
				}).catch(function () { fail('Could not load the comments right now.'); });
			};
			ytPage();
		} else if (it.k === '3speak') {
			var ap = String(it.id).split('/');
			// newer 3Speak uploads sit on a Hive post with another address (the embed answer's hivePermlink)
			speakInfo(it).then(function (i) { if (i.owner) ap[0] = i.owner; if (i.hive) ap[1] = i.hive; }, function () {}).then(function () { return hivePost(ap[0], ap[1]); }).then(function (all) {
				if (g !== cmGen) return;
				var top = Object.keys(all).map(function (k) { return all[k]; }).filter(function (p) { return p.depth === 1 && p.parent_author === ap[0] && p.parent_permlink === ap[1]; })
					.sort(function (a, b) { return (b.net_votes || (b.stats || {}).total_votes || 0) - (a.net_votes || (a.stats || {}).total_votes || 0) || String(b.created).localeCompare(String(a.created)); });
				cmState.count = top.length; cmState.site = '3Speak (Hive)';
				cmState.items = top.map(function (p) { return { author: '@' + p.author, creator: p.author === ap[0], when: W.ago(Date.parse(p.created + 'Z')), text: p.body, md: true, likes: (p.stats || {}).total_votes || 0, replies: p.children || 0, url: 'https://peakd.com/@' + p.author + '/' + p.permlink }; });
				if (!top.length) cmState.msg = 'No comments yet.';
				done();
			}).catch(function () { fail('Could not reach Hive for the comments right now.'); });
		} else if (it.k === 'odysee' && it.id) {
			var uri = 'lbry://' + String(it.id).split('/').map(function (x) { return x.replace(/:([0-9a-f]+)$/i, '#$1'); }).join('/');
			fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=resolve', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'resolve', params: { urls: [uri] }, id: 1 }) })
				.then(function (r) { return r.json(); }).then(function (j) {
					var c = j && j.result && j.result[uri]; if (!c || !c.claim_id) throw new Error();
					var pg = 0, odPage = function () {
						pg++; cmState.busy = true; cmPaint();
						fetch('https://comments.odysee.tv/api/v2?m=comment.List', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'comment.List', params: { claim_id: c.claim_id, page: pg, page_size: 20, sort_by: 3, top_level: true } }) })
							.then(function (r) { return r.json(); }).then(function (k) {
								if (g !== cmGen) return; var r = (k && k.result) || {};
								if (r.total_items != null) cmState.count = r.total_items;
								cmState.items = cmState.items.concat((r.items || []).map(function (x) { return { author: x.channel_name || 'Anonymous', creator: !!x.is_creator, when: x.timestamp ? W.ago(x.timestamp * 1000) : '', text: x.comment, md: true, likes: 0, replies: x.replies || 0, url: it.u + '?lc=' + x.comment_id }; }));
								cmState.more = r.total_pages && pg < r.total_pages ? odPage : null;
								if (!cmState.items.length) cmState.msg = 'No comments yet.';
								done();
							}).catch(function () { fail('Could not load the comments right now.'); });
					};
					odPage();
				}).catch(function () { fail('Could not find this video on Odysee.'); });
		} else {
			cmState.msg = esc(site) + ' comments can only be read on ' + esc(site) + ': <a href="' + esc(it.u) + '" target="_blank" rel="noopener">open the video there ↗&#xFE0E;</a>'; done();
		}
	}

	/* ☁ Sync & backup (sync.js): it reads / replaces the shared lists through this */
	function applySnap(d) {
		var ck = cur && cur.key;
		S.q = d.q || []; S.saved = d.saved || []; S.lists = d.lists || []; S.chans = d.chans || []; if (d.hist) S.hist = d.hist;
		S.i = ck ? W.indexOf(S.q, ck) : -1; if (S.i >= 0) cur = S.q[S.i];
		if (openList && !W.findList(S.lists, openList)) openList = null;
		save(); renderList(); renderChans(); showMeta();
	}
	if (window.WTSync) window.WTSync({ S: S, esc: esc, toast: toast, apply: applySnap, onSave: function (f) { saveHooks.push(f); } });
	if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
