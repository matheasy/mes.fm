/* MES Stream Chat: type a message and send it to YouTube live chat from the page / OBS dock (2026-11-18, YouTube only for now).
   Sign in with Google (Google Identity Services token client, scope youtube.force-ssl: the scope YouTube asks for to post chat
   messages), then liveChatMessages.insert (50 quota units a message; the free 10,000 a day = about 200 messages) on every chosen
   live stream the chat is reading. The live chat id comes from videos.list liveStreamingDetails.activeLiveChatId (1 unit, cached).
   The token stays in this browser only (localStorage mes-stream-chat:yt, about one hour, then one click again); nothing goes
   through mes.fm. Client id = the same Google OAuth client as MES Watch / Copy Text (project mes-copy-text).
   Twitch / Odysee / Rumble / 3Speak: not yet (Twitch would need its own sign-in; the others have no way to post from another site).
   window.SCSend(api) is called by app.js with {root, el, add, live: () => [{v, label, title}], mode, mock}. */
(function () {
	'use strict';
	window.SCSend = function (api) {
		var root = api.root, el = api.el;
		var CLIENT = window.MES_STREAMCHAT_YT || '604980806442-dlqf3ur1qohoe67sc5i70qu4is9sfva9.apps.googleusercontent.com';
		var SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl', TK = 'mes-stream-chat:yt', PK = 'mes-stream-chat:send';
		var BASE = 'https://www.googleapis.com/youtube/v3/', MAX = 200;
		var mock = !!api.mock, gisP = null, chatIds = {}, busy = false;
		var P = { open: true, to: 'all' };
		try { var sv = JSON.parse(localStorage.getItem(PK) || 'null'); if (sv) { if ('open' in sv) P.open = !!sv.open; if (sv.to) P.to = sv.to; } } catch (e) {}
		function saveP() { try { localStorage.setItem(PK, JSON.stringify(P)); } catch (e) {} }
		function tok(v) {
			try {
				if (v === undefined) return JSON.parse(localStorage.getItem(TK) || 'null');
				if (v === null) localStorage.removeItem(TK); else localStorage.setItem(TK, JSON.stringify(v));
			} catch (e) { return null; }
		}
		function live() { var t = tok(); return t && t.a && t.e > Date.now() + 30000 ? t : null; }

		/* ---------- Google sign-in ---------- */
		function gis() {
			if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
			return gisP || (gisP = new Promise(function (res, rej) {
				var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
				s.onload = function () { res(); };
				s.onerror = function () { gisP = null; rej(new Error("Google's sign-in script did not load (a blocker may have stopped it).")); };
				document.head.appendChild(s);
			}));
		}
		/* a valid token; with ask, opens Google's window (must start inside a click) */
		function ready(ask, pick) {
			if (mock) { if (!tok()) tok({ a: 'mock', e: Date.now() + 3600e3, name: 'MES (test)' }); return Promise.resolve('mock'); }
			var t = live(); if (t && !pick) return Promise.resolve(t.a);
			if (!ask) return Promise.reject(Object.assign(new Error('Sign in with Google again to send (Google asks once an hour).'), { relog: true }));
			return gis().then(function () {
				return new Promise(function (res, rej) {
					var old = tok();
					var c = google.accounts.oauth2.initTokenClient({ client_id: CLIENT, scope: SCOPE,
						callback: function (j) {
							if (j.error || !j.access_token) return rej(new Error(j.error_description || j.error || 'Google sign-in failed.'));
							if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(j, SCOPE)) return rej(new Error('Google did not give access to your YouTube account. Sign in again and tick the YouTube box.'));
							tok({ a: j.access_token, e: Date.now() + (+j.expires_in || 3600) * 1000, name: (old && !pick && old.name) || '' }); res(j.access_token);
						},
						error_callback: function (e) { rej(new Error(e && e.type === 'popup_failed_to_open' ? "The browser blocked Google's window: allow pop-ups for mes.fm." : 'The Google window was closed.')); } });
					c.requestAccessToken({ prompt: pick ? 'select_account consent' : old ? '' : 'consent' });
				});
			});
		}
		function errText(status, j) {
			var e = j && j.error, r = e && e.errors && e.errors[0] && e.errors[0].reason || '';
			if (status === 401) return 'Google signed you out: sign in again.';
			if (r === 'quotaExceeded' || r === 'dailyLimitExceeded') return "Today's YouTube sending allowance is used up. It resets at midnight Pacific time.";
			if (r === 'rateLimitExceeded') return 'You are sending too fast for YouTube. Wait a few seconds.';
			if (r === 'liveChatDisabled' || r === 'liveChatNotFound' || r === 'liveChatEnded') return 'The chat of this stream is closed or not found.';
			if (r === 'forbidden' || r === 'insufficientLivePermissions') return 'YouTube did not allow this account to post in that chat (slow mode, members-only, or the account is blocked there).';
			if (r === 'accessNotConfigured' || /has not been used|disabled/i.test(e && e.message || '')) return 'The YouTube Data API is not switched on for this sign-in yet.';
			if (r === 'youtubeSignupRequired') return 'This Google account has no YouTube channel. Pick the account / channel you stream with.';
			return (e && e.message) || ('YouTube answered ' + status + '.');
		}
		function call(method, path, params, body) {
			return ready(false).then(function (a) {
				var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
				return fetch(BASE + path + '?' + q, { method: method, credentials: 'omit',
					headers: Object.assign({ Authorization: 'Bearer ' + a }, body ? { 'Content-Type': 'application/json' } : {}),
					body: body ? JSON.stringify(body) : undefined
				}).then(function (r) {
					return r.json().catch(function () { return {}; }).then(function (j) {
						if (r.ok) return j;
						if (r.status === 401) tok(null);
						throw new Error(errText(r.status, j));
					});
				});
			});
		}
		function whoAmI() {
			if (mock) return Promise.resolve();
			return call('GET', 'channels', { part: 'snippet', mine: 'true' }).then(function (j) {
				var c = j.items && j.items[0], t = tok();
				if (t) { t.name = c ? c.snippet.title : '(no channel)'; tok(t); }
				paint();
			}).catch(function () {});
		}
		function chatIdFor(v) {
			if (chatIds[v]) return Promise.resolve(chatIds[v]);
			if (mock) return Promise.resolve(chatIds[v] = 'mockchat-' + v);
			return call('GET', 'videos', { part: 'liveStreamingDetails', id: v }).then(function (j) {
				var it = j.items && j.items[0], id = it && it.liveStreamingDetails && it.liveStreamingDetails.activeLiveChatId;
				if (!id) throw new Error('That stream has no open chat right now.');
				return (chatIds[v] = id);
			});
		}
		function postTo(v, text) {
			if (mock) return new Promise(function (res) { setTimeout(function () { api.add({ id: 'yt:mock' + Date.now() + v, p: 'yt', uid: 'yt:me', name: (tok() || {}).name || 'You', owner: true, parts: [{ t: text }], kind: 'chat', ts: Date.now() }); res(); }, 300); });
			return chatIdFor(v).then(function (cid) {
				return call('POST', 'liveChat/messages', { part: 'snippet' }, { snippet: { liveChatId: cid, type: 'textMessageEvent', textMessageDetails: { messageText: text } } });
			});
		}

		/* ---------- the box ---------- */
		var box = el('div', 'sc-send'); box.id = 'sc-send';
		box.innerHTML = [
			'<div class="sc-sendhd"><button type="button" class="sc-btn sc-sendtog" id="sc-sendtog" aria-expanded="true">💬 Send a message</button>',
			'<span class="sc-sp"></span><span class="sc-sendwho" id="sc-sendwho"></span></div>',
			'<div class="sc-sendbody" id="sc-sendbody">',
			' <div class="sc-sendrow"><label class="sc-sendto"><span class="sc-pf sc-pf--yt"></span><select id="sc-sendto" aria-label="Send to which YouTube chat"></select></label></div>',
			' <div class="sc-sendrow"><textarea id="sc-sendin" class="sc-in sc-sendin" rows="1" maxlength="' + MAX + '" placeholder="Type a message for your YouTube chat… (Enter sends)" aria-label="Message"></textarea>',
			' <button type="button" class="sc-btn sc-btn--go" id="sc-sendgo">Send</button></div>',
			' <div class="sc-sendnote" id="sc-sendnote" aria-live="polite"></div>',
			'</div>'
		].join('');
		var foot = root.querySelector('.sc-foot');
		root.insertBefore(box, foot);
		var $ = function (id) { return document.getElementById(id); };
		var sel = $('sc-sendto'), inp = $('sc-sendin'), go = $('sc-sendgo'), note = $('sc-sendnote');

		function note1(t, kind) { note.textContent = t || ''; note.className = 'sc-sendnote' + (kind ? ' sc-sendnote--' + kind : ''); }
		function targets() {
			var L = api.live();
			if (P.to === 'all') return L;
			return L.filter(function (x) { return x.v === P.to; });
		}
		function fillSel() {
			var L = api.live(), cur = P.to, html = '';
			if (!L.length) html = '<option value="all">No live YouTube chat yet (it appears when your stream is live)</option>';
			else {
				html = (L.length > 1 ? '<option value="all">All ' + L.length + ' live YouTube chats</option>' : '<option value="all">' + esc(L[0].label + (L[0].title ? ' · ' + L[0].title : '')) + '</option>');
				if (L.length > 1) L.forEach(function (x) { html += '<option value="' + esc(x.v) + '">' + esc(x.label + (x.title ? ' · ' + x.title : '')) + '</option>'; });
			}
			if (sel.innerHTML !== html) sel.innerHTML = html;
			sel.value = L.some(function (x) { return x.v === cur; }) ? cur : 'all';
		}
		function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
		function paint() {
			var t = tok(), who = $('sc-sendwho');
			who.innerHTML = '';
			if (t && (mock || t.a)) {
				who.appendChild(document.createTextNode('YouTube: ' + (t.name || 'signed in') + ' '));
				var sw = el('button', 'sc-link', 'Switch'); sw.type = 'button'; sw.title = 'Send as another channel (Brand Account)';
				sw.onclick = function () { note1('Opening Google…'); ready(true, true).then(function () { note1(''); whoAmI(); paint(); }, function (e) { note1(e.message, 'err'); }); };
				var so = el('button', 'sc-link', 'Sign out'); so.type = 'button';
				so.onclick = function () {
					var a = (tok() || {}).a; tok(null); chatIds = {};
					try { if (a && a !== 'mock' && window.google && google.accounts) google.accounts.oauth2.revoke(a, function () {}); } catch (e) {}
					paint(); note1('Signed out.');
				};
				who.appendChild(sw); who.appendChild(document.createTextNode(' · ')); who.appendChild(so);
				go.textContent = 'Send';
			} else {
				var si = el('button', 'sc-btn', 'Sign in with Google'); si.type = 'button';
				si.onclick = signIn;
				who.appendChild(si);
				go.textContent = 'Sign in and send';
			}
			$('sc-sendbody').hidden = !P.open;
			$('sc-sendtog').setAttribute('aria-expanded', P.open ? 'true' : 'false');
			fillSel();
		}
		function signIn() {
			note1('Opening Google…');
			return ready(true).then(function () { note1('Signed in. Your messages go out as the channel you picked.', 'ok'); paint(); whoAmI(); }, function (e) { note1(e.message, 'err'); throw e; });
		}
		function grow() { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight + 2, 140) + 'px'; }
		function send() {
			if (busy) return;
			var text = inp.value.replace(/\s*\n\s*/g, ' ').trim();
			if (!text) { inp.focus(); return; }
			if (text.length > MAX) { note1('YouTube allows ' + MAX + ' characters a message.', 'err'); return; }
			var T = targets();
			if (!T.length) { note1('No live YouTube chat is connected yet. It shows up here once your stream is live (or scheduled with chat open).', 'err'); return; }
			var start = live() || mock ? Promise.resolve() : signIn();
			busy = true; go.disabled = true; note1('Sending…');
			start.then(function () {
				return Promise.all(T.map(function (x) { return postTo(x.v, text).then(function () { return null; }, function (e) { return x.label + ': ' + e.message; }); }));
			}).then(function (errs) {
				errs = errs.filter(Boolean);
				if (errs.length === T.length) { note1(errs.join(' · '), 'err'); return; }
				inp.value = ''; grow();
				note1(errs.length ? 'Sent, but: ' + errs.join(' · ') : 'Sent' + (T.length > 1 ? ' to ' + T.length + ' chats' : '') + '. It shows up in the chat in a few seconds.', errs.length ? 'err' : 'ok');
				clearTimeout(send._t); send._t = setTimeout(function () { if (/^Sent/.test(note.textContent)) note1(''); }, 5000);
			}, function () {}).then(function () { busy = false; go.disabled = false; inp.focus(); });
		}
		go.onclick = send;
		inp.addEventListener('input', grow);
		inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
		sel.onchange = function () { P.to = sel.value; saveP(); };
		$('sc-sendtog').onclick = function () { P.open = !P.open; saveP(); paint(); if (P.open) inp.focus(); };
		paint();
		setInterval(fillSel, 3000);
		if (live() && !tok().name) whoAmI();
		return { paint: paint, send: send };
	};
})();
