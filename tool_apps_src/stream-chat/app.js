/* MES Stream Chat UI (mes.fm/stream-chat, /stream-chat/dock, /stream-chat/overlay). Parsing = MESChat in lib.js (prepended above).
   Sources, read straight from the page (no extension, no third-party tool):
     YouTube  via mes.fm/api/yt-chat (the page can't read youtube.com itself)
     Twitch   anonymous IRC WebSocket (wss://irc-ws.chat.twitch.tv)
     Odysee   its own comment WebSocket + comment.List as a backup poll
   #sc[data-mode] = page | dock | overlay. Settings in localStorage mes-stream-chat:v1 (per browser: OBS keeps its own copy).
   Clicking a message "features" it: BroadcastChannel mes-stream-chat (+ localStorage mes-stream-chat:feat) tells the overlay, which must
   run in the same browser (the OBS panel and the OBS overlay share OBS's browser). */
(function () {
	'use strict';
	var C = MESChat, root = document.getElementById('sc');
	if (!root) return;
	var MODE = root.getAttribute('data-mode') || 'page', KEY = 'mes-stream-chat:v1', FKEY = 'mes-stream-chat:feat';
	var Q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { Q[k] = v; }); } catch (e) {}
	var S = { yt: 'UCmYl-9bhOOotXaNpS-liNiQ, UCUUBq1GPBvvGNz7dpgO14Ow', tw: 'matheasysolutions', od: '@mestruth:9', on: { yt: true, tw: true, od: true }, show: { yt: true, tw: true, od: true },
		paidOnly: false, size: 1, avatars: true, times: false, ding: true, setup: MODE === 'page' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	['yt', 'tw', 'od'].forEach(function (p) { if (Q[p] != null) { S[p] = Q[p]; S.on[p] = !!Q[p]; } });
	if (Q.size) S.size = Math.min(3, Math.max(0.6, +Q.size || 1));
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
	function $(id) { return document.getElementById(id); }
	var IMG_OK = /^https:\/\/(yt\d\.ggpht\.com|yt\d\.googleusercontent\.com|lh\d\.googleusercontent\.com|static-cdn\.jtvnw\.net|www\.gstatic\.com|fonts\.gstatic\.com)\//;

	/* Twitch lets people pick dark name colours: mix those with white until they read on the dark chat (relative luminance >= 0.3) */
	function readable(hex) {
		var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '';
		var n = parseInt(m[1], 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255];
		var lum = function (v) { return v.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce(function (a, x, i) { return a + x * [0.2126, 0.7152, 0.0722][i]; }, 0); };
		for (var k = 0; k < 10 && lum(c) < 0.3; k++) c = c.map(function (x) { return Math.round(x + (255 - x) * 0.18); });
		return 'rgb(' + c.join(',') + ')';
	}

	/* ---------- one message ---------- */
	function badge(p) { var b = el('span', 'sc-pf sc-pf--' + p); b.title = C.PLATFORMS[p].name; b.setAttribute('aria-label', C.PLATFORMS[p].name); return b; }
	function body(m, box) {
		(m.parts || []).forEach(function (x) {
			if (x.img && IMG_OK.test(x.img)) { var i = el('img', m.kind === 'sticker' ? 'sc-stk' : 'sc-emo'); i.src = x.img; i.alt = x.alt || ''; i.title = x.alt || ''; i.loading = 'lazy'; box.appendChild(i); }
			else box.appendChild(document.createTextNode(x.t != null ? x.t : (x.alt || '')));
		});
	}
	function render(m, big) {
		var paid = C.isPaid(m), li = el('div', 'sc-m sc-m--' + m.p + (paid ? ' sc-m--paid sc-k--' + m.kind : '') + (big ? ' sc-m--big' : ''));
		li.setAttribute('data-id', m.id);
		if (paid && m.p === 'yt' && m.color && /^#[0-9a-f]{6}$/i.test(m.color)) li.style.setProperty('--sc-paid', m.color);
		var head = el('div', 'sc-mh');
		head.appendChild(badge(m.p));
		if (S.avatars && m.avatar && IMG_OK.test(m.avatar)) { var av = el('img', 'sc-av'); av.src = m.avatar; av.alt = ''; av.loading = 'lazy'; head.appendChild(av); }
		var nm = el('span', 'sc-nm', m.name || '?');
		if (m.color && m.p === 'tw' && !paid) nm.style.color = readable(m.color);
		if (m.owner) nm.classList.add('sc-nm--owner'); else if (m.mod) nm.classList.add('sc-nm--mod');
		head.appendChild(nm);
		if (m.member && !paid) head.appendChild(el('span', 'sc-mb', '★'));
		if (m.amount) head.appendChild(el('span', 'sc-amt', m.amount));
		if (S.times && !big) head.appendChild(el('span', 'sc-tm', new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
		li.appendChild(head);
		if (m.note) li.appendChild(el('div', 'sc-note', m.note));
		if (m.parts && m.parts.length) { var tx = el('div', 'sc-tx'); body(m, tx); li.appendChild(tx); }
		return li;
	}

	/* ---------- overlay (on-screen card) ---------- */
	var chan = null; try { chan = new BroadcastChannel('mes-stream-chat'); } catch (e) {}
	function feature(m) {
		var pkt = { type: m ? 'feature' : 'clear', m: m || null, at: Date.now() };
		try { localStorage.setItem(FKEY, JSON.stringify(pkt)); } catch (e) {}
		if (chan) chan.postMessage(pkt);
		showFeatured(pkt);
	}
	var featId = null;
	function showFeatured(pkt) {
		featId = pkt && pkt.m ? pkt.m.id : null;
		[].forEach.call(document.querySelectorAll('.sc-m--on'), function (x) { x.classList.remove('sc-m--on'); });
		if (featId) { var on = document.querySelector('#sc-list [data-id="' + CSS.escape(featId) + '"]'); if (on) on.classList.add('sc-m--on'); }
		var box = $('sc-feat'); if (!box) return;
		box.innerHTML = '';
		if (pkt && pkt.m) { box.appendChild(render(pkt.m, true)); box.classList.add('sc-feat--on'); }
		else box.classList.remove('sc-feat--on');
		var cb = $('sc-unfeat'); if (cb) cb.hidden = !featId;
	}
	if (chan) chan.onmessage = function (e) { if (e.data && (e.data.type === 'feature' || e.data.type === 'clear')) showFeatured(e.data); };
	window.addEventListener('storage', function (e) { if (e.key === FKEY && e.newValue) { try { showFeatured(JSON.parse(e.newValue)); } catch (x) {} } });

	/* ---------- feed ---------- */
	var feed = new C.Feed(MODE === 'overlay' ? 60 : 400), list, pinned = true, unseen = 0, booted = {};
	function visible(m) { return S.show[m.p] && (!S.paidOnly || C.isPaid(m)); }
	function add(m, quiet) {
		if (!feed.add(m)) return;
		if (!list || !visible(m)) return;
		var node = render(m);
		if (!quiet) node.classList.add('sc-m--new');
		list.appendChild(node);
		while (list.children.length > feed.max) list.removeChild(list.firstChild);
		if (MODE === 'overlay') { var keep = +Q.n || 6; while (list.children.length > keep) list.removeChild(list.firstChild); }
		if (C.isPaid(m) && !quiet) { ding(); totals(); }
		if (pinned) toBottom(); else { unseen++; newPill(); }
	}
	function removeId(id) { feed.remove(id); var n = list && list.querySelector('[data-id="' + CSS.escape(id) + '"]'); if (n) n.remove(); }
	function redraw() {
		if (!list) return;
		list.innerHTML = '';
		feed.items.forEach(function (m) { if (visible(m)) list.appendChild(render(m)); });
		if (featId) showFeatured({ m: feed.items.filter(function (x) { return x.id === featId; })[0] || null });
		toBottom(); totals();
	}
	function toBottom() { if (list) list.scrollTop = list.scrollHeight; unseen = 0; newPill(); }
	function newPill() { var p = $('sc-newpill'); if (p) { p.hidden = !unseen; p.textContent = unseen + ' new ↓'; } }
	function totals() {
		var t = $('sc-totals'); if (!t) return;
		var x = C.totals(feed.items.filter(C.isPaid)), keys = Object.keys(x);
		t.textContent = keys.length ? 'Tips so far: ' + keys.map(function (u) { return u === 'bits' || u === 'LBC' ? x[u] + ' ' + u : u + (x[u] % 1 ? x[u].toFixed(2) : x[u]); }).join(' · ') : '';
	}
	var actx = null;
	function ding() {
		if (!S.ding || MODE === 'overlay') return;
		try {
			actx = actx || new (window.AudioContext || window.webkitAudioContext)();
			[880, 1320].forEach(function (f, i) { var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.12; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.3); });
		} catch (e) {}
	}

	/* ---------- status ---------- */
	var ST = {};
	function status(key, p, txt, state) {
		ST[key] = { p: p, txt: txt, state: state || 'wait' };
		var box = $('sc-status'); if (!box) return;
		box.innerHTML = '';
		Object.keys(ST).sort().forEach(function (k) {
			var s = ST[k], d = el('span', 'sc-st sc-st--' + s.state); d.appendChild(badge(s.p)); d.appendChild(document.createTextNode(s.txt)); box.appendChild(d);
		});
	}
	function clearStatus() { ST = {}; var b = $('sc-status'); if (b) b.innerHTML = ''; }

	/* ---------- YouTube ---------- */
	var gen = 0, timers = [], sockets = [];
	function later(f, ms) { var g = gen, t = setTimeout(function () { if (g === gen) f(); }, ms); timers.push(t); }
	function getJSON(url, opt) {
		var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 15000);
		return fetch(url, Object.assign({ signal: ctl && ctl.signal }, opt || {})).then(function (r) { if (t) clearTimeout(t); return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || 'HTTP ' + r.status); return j; }); });
	}
	var ytVideos = {};
	function ytRun(src, label) {
		var key = 'yt:' + label, g = gen, st = null;
		function apply(j, first) {
			(j.removed || []).forEach(removeId);
			(j.msgs || []).forEach(function (m) { add(m, first); });
		}
		function poll() {
			if (g !== gen) return;
			if (!st) {
				var q = src.v ? 'v=' + src.v : 'ch=' + encodeURIComponent(src.ch);
				getJSON('/api/yt-chat?' + q).then(function (j) {
					if (g !== gen) return;
					if (src.ch && !j.live && !j.upcoming) { status(key, 'yt', label + ': not live, checking every minute' + (j.why === 'no-channel-id' ? ' (tip: use the channel ID, UC…)' : ''), 'off'); later(poll, 60000); return; }
					if (j.ended || !j.c) { status(key, 'yt', label + ': no chat on this video', 'off'); later(poll, 60000); return; }
					if (ytVideos[j.v] && ytVideos[j.v] !== key) { status(key, 'yt', label + ': same stream as ' + ytVideos[j.v].slice(3), 'off'); later(poll, 120000); return; }
					ytVideos[j.v] = key;
					st = { c: j.c, k: j.k, ver: j.ver, v: j.v };
					status(key, 'yt', label + (j.upcoming ? ': scheduled stream, chat open' : ': live') + (j.title ? ' · ' + j.title : ''), 'on');
					apply(j, true); later(poll, clampWait(j.wait));
				}).catch(function (e) { status(key, 'yt', label + ': ' + e.message + ', retrying', 'err'); later(poll, 15000); });
				return;
			}
			getJSON('/api/yt-chat?c=' + encodeURIComponent(st.c) + '&k=' + encodeURIComponent(st.k) + '&ver=' + encodeURIComponent(st.ver)).then(function (j) {
				if (g !== gen) return;
				apply(j, false);
				if (j.ended || !j.c) { delete ytVideos[st.v]; st = null; status(key, 'yt', label + ': chat ended, checking again', 'off'); later(poll, 30000); return; }
				st.c = j.c; later(poll, clampWait(j.wait));
			}).catch(function (e) { status(key, 'yt', label + ': ' + e.message + ', retrying', 'err'); later(poll, 8000); });
		}
		status(key, 'yt', label + ': connecting…'); poll();
	}
	function clampWait(w) { return Math.min(6000, Math.max(1500, +w || 4000)); }

	/* ---------- Twitch ---------- */
	function twRun(ch) {
		var key = 'tw:' + ch, g = gen, ws;
		function open() {
			if (g !== gen) return;
			try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); } catch (e) { later(open, 10000); return; }
			sockets.push(ws);
			ws.onopen = function () {
				ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands'); ws.send('PASS SCHMOOPIIE');
				ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 89999)); ws.send('JOIN #' + ch);
				status(key, 'tw', ch + ': connected', 'on');
			};
			ws.onmessage = function (e) {
				String(e.data).split('\r\n').forEach(function (line) {
					if (!line) return;
					if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); return; }
					var r = C.twLine(line); if (!r) return;
					if (r.msg) add(r.msg); else if (r.removed) removeId(r.removed);
				});
			};
			ws.onclose = function () { if (g !== gen) return; status(key, 'tw', ch + ': reconnecting…', 'err'); later(open, 5000); };
		}
		status(key, 'tw', ch + ': connecting…'); open();
	}

	/* ---------- Odysee ---------- */
	var OD_API = 'https://api.na-backend.odysee.com/api/v1/proxy', OD_LIVE = 'https://api.odysee.live/livestream/is_live?channel_claim_id=', OD_COM = 'https://comments.odysee.tv/api/v2?m=comment.List';
	/* the SDK proxy rejects the CORS pre-check that a JSON content type causes, so it gets text/plain; the comment server wants JSON (and allows it) */
	function rpc(url, method, params) { return getJSON(url, { method: 'POST', headers: { 'Content-Type': url === OD_COM ? 'application/json' : 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) }); }
	function odRun(chan) {
		var key = 'od:' + chan, g = gen, chanId = null, claim = null, ws = null;
		function resolve() {
			rpc(OD_API + '?m=resolve', 'resolve', { urls: ['lbry://' + chan.replace(':', '#')] }).then(function (j) {
				var r = j.result && j.result[Object.keys(j.result)[0]];
				if (!r || !r.claim_id) throw new Error('channel not found');
				chanId = r.claim_id; check();
			}).catch(function (e) { status(key, 'od', chan + ': ' + e.message + ', retrying', 'err'); later(resolve, 30000); });
		}
		function check() {
			if (g !== gen) return;
			getJSON(OD_LIVE + chanId).then(function (j) {
				var d = j.data || {}, ac = d.ActiveClaim && d.ActiveClaim.ClaimID;
				if (!ac) { status(key, 'od', chan + ': no livestream, checking every 2 minutes', 'off'); later(check, 120000); return; }
				if (ac !== claim) { claim = ac; connect(); backfill(true); }
				status(key, 'od', chan + (d.Live ? ': live' : ': scheduled stream, chat open'), 'on');
				later(check, 180000);
			}).catch(function (e) { status(key, 'od', chan + ': ' + e.message + ', retrying', 'err'); later(check, 30000); });
		}
		function connect() {
			if (ws) try { ws.onclose = null; ws.close(); } catch (e) {}
			var c = claim;
			try { ws = new WebSocket('wss://sockety.odysee.tv/ws/commentron?id=' + c + '&category=' + c + '&sub_category=viewer'); } catch (e) { later(connect, 10000); return; }
			sockets.push(ws);
			ws.onmessage = function (e) { var r = C.odSocket(e.data); if (!r) return; if (r.msg) add(r.msg); else if (r.removed) removeId(r.removed); };
			ws.onclose = function () { if (g !== gen || c !== claim) return; later(connect, 5000); };
		}
		function backfill(first) {
			if (g !== gen || !claim) return;
			var c = claim;
			rpc(OD_COM, 'comment.List', { claim_id: c, page: 1, page_size: 30 }).then(function (j) {
				var items = (j.result && j.result.items) || [];
				items.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); }).forEach(function (x) { var m = C.odComment(x); if (m) add(m, first); });
			}).catch(function () {}).then(function () { if (c === claim) later(function () { backfill(false); }, 20000); });
		}
		status(key, 'od', chan + ': connecting…'); resolve();
	}

	/* ---------- start / stop ---------- */
	function stop() {
		gen++; timers.forEach(clearTimeout); timers = [];
		sockets.forEach(function (w) { try { w.onclose = null; w.close(); } catch (e) {} }); sockets = []; ytVideos = {};
		clearStatus();
	}
	function start() {
		stop();
		if (MODE === 'overlay' && !Q.chat) return;
		var any = false;
		if (S.on.yt) C.list(S.yt).forEach(function (s) { var src = C.ytSource(s); if (src) { any = true; ytRun(src, ({ 'UCmYl-9bhOOotXaNpS-liNiQ': '@mestruth', 'UCUUBq1GPBvvGNz7dpgO14Ow': '@mes' })[src.ch] || src.ch || src.v); } });
		if (S.on.tw) C.list(S.tw).forEach(function (s) { var c = C.twChannel(s); if (c) { any = true; twRun(c); } });
		if (S.on.od) C.list(S.od).forEach(function (s) { var c = C.odChannel(s); if (c) { any = true; odRun(c); } });
		if (!any) status('x', 'yt', 'Add a channel in Settings to start.', 'off');
	}

	/* ---------- build the UI ---------- */
	function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
	root.style.setProperty('--sc-size', S.size);
	if (MODE === 'overlay') {
		document.documentElement.classList.add('sc-overlay-html');
		root.appendChild(el('div', 'sc-ovlist' + (Q.chat ? '' : ' sc-ovlist--off'))).id = 'sc-list';
		list = $('sc-list');
		var f = el('div', 'sc-feat'); f.id = 'sc-feat'; root.appendChild(f);
		try { var last = JSON.parse(localStorage.getItem(FKEY) || 'null'); if (last && last.m && Date.now() - last.at < 3600000) showFeatured(last); } catch (e) {}
		start();
		return;
	}
	root.innerHTML = [
		'<div class="sc-bar">',
		' <span class="sc-chips" id="sc-pfs"></span>',
		' <button type="button" class="sc-btn" id="sc-paid" aria-pressed="false" title="Show only Super Chats, stickers, memberships, bits, subs and tips">$ Tips only</button>',
		' <span class="sc-sp"></span>',
		' <button type="button" class="sc-btn" id="sc-sm" title="Smaller text">A-</button><button type="button" class="sc-btn" id="sc-lg" title="Bigger text">A+</button>',
		' <button type="button" class="sc-btn" id="sc-gear" aria-expanded="false" title="Settings">⚙</button>',
		'</div>',
		'<div class="sc-setup" id="sc-setup" hidden>',
		' <label class="sc-src"><input type="checkbox" id="sc-on-yt"><span class="sc-pf sc-pf--yt"></span> YouTube <input class="sc-in" id="sc-yt" spellcheck="false" placeholder="@channel, channel ID or video link"></label>',
		' <label class="sc-src"><input type="checkbox" id="sc-on-tw"><span class="sc-pf sc-pf--tw"></span> Twitch <input class="sc-in" id="sc-tw" spellcheck="false" placeholder="channel name"></label>',
		' <label class="sc-src"><input type="checkbox" id="sc-on-od"><span class="sc-pf sc-pf--od"></span> Odysee <input class="sc-in" id="sc-od" spellcheck="false" placeholder="@channel:claim"></label>',
		' <p class="sc-hint">Several channels? Separate them with commas. YouTube finds the live (or scheduled) stream by itself; a video link reads that video only.</p>',
		' <div class="sc-opts"><label><input type="checkbox" id="sc-o-av"> Pictures</label><label><input type="checkbox" id="sc-o-tm"> Times</label><label><input type="checkbox" id="sc-o-dg"> Sound on tips</label>',
		' <button type="button" class="sc-btn sc-btn--go" id="sc-apply">Save and reconnect</button></div>',
		'</div>',
		'<div class="sc-status" id="sc-status" aria-live="polite"></div>',
		'<div class="sc-feedwrap"><div class="sc-list" id="sc-list" role="log" aria-label="Chat"></div><button type="button" class="sc-newpill" id="sc-newpill" hidden></button></div>',
		'<div class="sc-foot"><span id="sc-totals" class="sc-totals"></span><span class="sc-sp"></span><button type="button" class="sc-btn" id="sc-unfeat" hidden>Take off screen</button><span class="sc-tip">Click a message to show it on screen.</span></div>',
		MODE === 'page' ? '<div class="sc-featwrap"><div class="sc-flabel">On screen now (overlay preview)</div><div class="sc-feat sc-feat--preview" id="sc-feat"></div></div>' : ''
	].join('');
	list = $('sc-list');
	function pfChips() {
		var box = $('sc-pfs'); box.innerHTML = '';
		['yt', 'tw', 'od'].forEach(function (p) {
			if (!S.on[p]) return;
			var b = el('button', 'sc-btn sc-btn--pf'); b.type = 'button'; b.appendChild(badge(p)); b.appendChild(document.createTextNode(C.PLATFORMS[p].name));
			b.setAttribute('aria-pressed', S.show[p] ? 'true' : 'false'); b.title = 'Show or hide ' + C.PLATFORMS[p].name + ' messages';
			b.onclick = function () { S.show[p] = !S.show[p]; save(); pfChips(); redraw(); };
			box.appendChild(b);
		});
	}
	function fillSetup() {
		['yt', 'tw', 'od'].forEach(function (p) { $('sc-' + p).value = S[p]; $('sc-on-' + p).checked = !!S.on[p]; });
		$('sc-o-av').checked = S.avatars; $('sc-o-tm').checked = S.times; $('sc-o-dg').checked = S.ding;
	}
	function setupOpen(o) { $('sc-setup').hidden = !o; $('sc-gear').setAttribute('aria-expanded', o ? 'true' : 'false'); S.setup = o; save(); }
	$('sc-gear').onclick = function () { setupOpen($('sc-setup').hidden); };
	$('sc-apply').onclick = function () {
		['yt', 'tw', 'od'].forEach(function (p) { S[p] = $('sc-' + p).value.trim(); S.on[p] = $('sc-on-' + p).checked; });
		S.avatars = $('sc-o-av').checked; S.times = $('sc-o-tm').checked; S.ding = $('sc-o-dg').checked;
		save(); pfChips(); redraw(); start();
	};
	$('sc-paid').onclick = function () { S.paidOnly = !S.paidOnly; this.setAttribute('aria-pressed', S.paidOnly ? 'true' : 'false'); save(); redraw(); };
	$('sc-paid').setAttribute('aria-pressed', S.paidOnly ? 'true' : 'false');
	function size(d) { S.size = Math.round(Math.min(2.2, Math.max(0.7, S.size + d)) * 10) / 10; root.style.setProperty('--sc-size', S.size); save(); if (pinned) toBottom(); }
	$('sc-sm').onclick = function () { size(-0.1); }; $('sc-lg').onclick = function () { size(0.1); };
	list.addEventListener('scroll', function () { pinned = list.scrollHeight - list.scrollTop - list.clientHeight < 40; if (pinned) { unseen = 0; newPill(); } });
	$('sc-newpill').onclick = function () { pinned = true; toBottom(); };
	list.addEventListener('click', function (e) {
		if (e.target.closest('a')) return;
		var n = e.target.closest('.sc-m'); if (!n) return;
		var id = n.getAttribute('data-id'), m = feed.items.filter(function (x) { return x.id === id; })[0];
		if (!m) return;
		feature(featId === id ? null : m);
	});
	$('sc-unfeat').onclick = function () { feature(null); };
	fillSetup(); pfChips(); setupOpen(!!S.setup);
	try { var lf = JSON.parse(localStorage.getItem(FKEY) || 'null'); if (lf && lf.m && Date.now() - lf.at < 3600000) showFeatured(lf); } catch (e) {}

	/* copy buttons on the page's OBS card */
	[].forEach.call(document.querySelectorAll('[data-sc-copy]'), function (b) {
		b.addEventListener('click', function () {
			var t = b.getAttribute('data-sc-copy'), done = function () { var o = b.textContent; b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = o; }, 1500); };
			if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { prompt('Copy this:', t); }); else prompt('Copy this:', t);
		});
	});
	window.MESStreamChat = { add: add, feature: feature, feed: feed };
	start();
})();
