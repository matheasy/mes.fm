/* MES Watch: "Your YouTube playlists" (window.WTYouTube(api), called once by app.js).
   Sign in with Google (Google Identity Services token client, read-only scope youtube.readonly) and bring in the person's own
   playlists, private ones too, plus Liked videos and My uploads, through the YouTube Data API (1 quota unit per page of 50).
   The access token lives only in this browser (localStorage "mes-watch:v1:yt" = {a, e, name}); it lasts an hour, then Google
   asks again with one click. Nothing goes through mes.fm. Private videos come in marked (it.pv): YouTube never plays them on
   other sites, so the player offers "Open on YouTube" for them.
   Setup (Google Cloud project mes-copy-text, the same OAuth client as Copy Text's Google Drive sync, origin https://mes.fm):
   APIs & Services -> enable "YouTube Data API v3". The scope is "sensitive": until Google verifies the app, sign-in shows an
   "unverified app" warning and works for up to 100 people. window.MES_WATCH_YT overrides the client id (testing only). */
(function () {
	"use strict";
	window.WTYouTube = function (api) {
		var W = window.MESWatch, $ = function (id) { return document.getElementById(id); }, esc = api.esc, toast = api.toast;
		var CLIENT = window.MES_WATCH_YT || "604980806442-dlqf3ur1qohoe67sc5i70qu4is9sfva9.apps.googleusercontent.com";
		var SCOPE = "https://www.googleapis.com/auth/youtube.readonly", TK = "mes-watch:v1:yt", BASE = "https://www.googleapis.com/youtube/v3/";
		var box = $("wt-ytacct"); if (!box) return {};
		var lists = null, me = null, busy = "", err = "", gisP = null;
		function tok(v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(TK) || "null"); if (v === null) localStorage.removeItem(TK); else localStorage.setItem(TK, JSON.stringify(v)); } catch (e) { return null; } }
		function live() { var t = tok(); return t && t.a && t.e > Date.now() + 30000 ? t : null; }

		function gis() {
			if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
			return gisP || (gisP = new Promise(function (res, rej) {
				var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
				s.onload = function () { res(); }; s.onerror = function () { gisP = null; rej(new Error("Google's sign-in script did not load (a blocker may have stopped it).")); };
				document.head.appendChild(s);
			}));
		}
		/* a valid token; with ask, opens Google's window (must start inside a click) */
		function ready(ask) {
			var t = live(); if (t) return Promise.resolve(t.a);
			if (!ask) return Promise.reject(new Error("Google asks you to confirm again (once an hour)."));
			return gis().then(function () {
				return new Promise(function (res, rej) {
					var old = tok();
					var c = google.accounts.oauth2.initTokenClient({ client_id: CLIENT, scope: SCOPE,
						callback: function (j) {
							if (j.error || !j.access_token) return rej(new Error(j.error_description || j.error || "Google sign-in failed."));
							if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(j, SCOPE)) return rej(new Error("Google did not give access to your YouTube account. Sign in again and tick the YouTube box."));
							tok({ a: j.access_token, e: Date.now() + (+j.expires_in || 3600) * 1000, name: (old && old.name) || "" }); res(j.access_token);
						},
						error_callback: function (e) { rej(new Error(e && e.type === "popup_failed_to_open" ? "The browser blocked Google's window: allow pop-ups for mes.fm." : "The Google window was closed.")); } });
					c.requestAccessToken({ prompt: old ? "" : "consent" });
				});
			});
		}
		function call(path, params, ask) {
			return ready(ask).then(function (a) {
				var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
				return fetch(BASE + path + "?" + q, { headers: { Authorization: "Bearer " + a }, credentials: "omit" }).then(function (r) {
					return r.json().catch(function () { return {}; }).then(function (j) {
						if (r.ok) return j;
						if (r.status === 401) tok(null);
						throw new Error(W.ytApiError(r.status, j));
					});
				});
			});
		}
		function playlistItems(id, ask) {
			var out = [], skipped = 0;
			function page(pt) {
				var p = { part: "snippet,contentDetails,status", playlistId: id, maxResults: 50 }; if (pt) p.pageToken = pt;
				return call("playlistItems", p, ask).then(function (j) {
					(j.items || []).forEach(function (x) { var it = W.ytFromApi(x); if (it && W.indexOf(out, it.key) < 0) out.push(it); else if (!it) skipped++; });
					if (j.nextPageToken && out.length < W.MAX_LIST) return page(j.nextPageToken);
					return { items: out.slice(0, W.MAX_LIST), skipped: skipped, more: !!j.nextPageToken || out.length > W.MAX_LIST };
				});
			}
			return page("");
		}
		function loadLists(ask) {
			busy = "Getting your playlists from YouTube…"; err = ""; render();
			return call("channels", { part: "snippet,contentDetails", mine: "true" }, ask).then(function (c) {
				var ch = (c.items || [])[0], rel = (ch && ch.contentDetails && ch.contentDetails.relatedPlaylists) || {};
				me = ch ? { name: (ch.snippet && ch.snippet.title) || "", th: ((ch.snippet && ch.snippet.thumbnails && ch.snippet.thumbnails["default"]) || {}).url || "" } : { name: "" };
				var t = tok(); if (t) { t.name = me.name; tok(t); }
				var out = [], extra = [];
				if (rel.likes) extra.push({ id: rel.likes, name: "Liked videos", n: 0, privacy: "private", special: 1 });
				if (rel.uploads) extra.push({ id: rel.uploads, name: "My uploads" + (me.name ? " (" + me.name + ")" : ""), n: 0, privacy: "", special: 1 });
				function page(pt) {
					var p = { part: "snippet,contentDetails,status", mine: "true", maxResults: 50 }; if (pt) p.pageToken = pt;
					return call("playlists", p).then(function (j) { out = out.concat(W.ytListsFromApi(j)); if (j.nextPageToken && out.length < 500) return page(j.nextPageToken); });
				}
				return (ch ? page("") : Promise.resolve()).then(function () { lists = extra.concat(out); busy = ""; render(); });
			}).catch(function (e) { busy = ""; err = e.message; render(); });
		}
		function imported(id) { for (var i = 0; i < api.S.lists.length; i++) if (api.S.lists[i].src === id) return api.S.lists[i]; return null; }
		function bring(ps) {
			var done = 0, pv = 0, cut = 0, bad = [];
			busy = "Bringing in " + ps.length + " playlist" + (ps.length > 1 ? "s" : "") + "…"; err = ""; render();
			return ps.reduce(function (pr, p) {
				return pr.then(function () {
					return playlistItems(p.id, true).then(function (r) {
						api.upsertList(p.id, p.name, r.items); done++; pv += r.items.filter(function (x) { return x.pv; }).length; if (r.more) cut++;
					}, function (e) { bad.push(p.name + ": " + e.message); });
				});
			}, Promise.resolve()).then(function () {
				busy = ""; err = bad.join(" "); render(); api.changed();
				if (done) toast((done === 1 ? '"' + ps[0].name + '" is' : done + " playlists are") + " in My playlists" + (pv ? " (" + pv + " private: those open on YouTube)" : "") + (cut ? ". Only the first " + W.MAX_LIST + " videos of a list are kept." : ""));
			});
		}
		function render() {
			var t = tok(), on = !!(t && t.a), L = lists;
			var h = '<div class="wt-ythead"><b>▶&#xFE0E; Your YouTube playlists</b>';
			if (!on) {
				h += '<button type="button" class="tu-btn tu-btn--primary" data-yt="in">Sign in with Google</button></div>' +
					'<p class="wt-ytnote">Bring in your own playlists (private ones too), your liked videos and your uploads. Read-only: mes.fm can\'t change anything on your YouTube. The sign-in stays in this browser; nothing goes to mes.fm. Private videos only play on youtube.com, so they open there.</p>';
			} else {
				h += '<span class="wt-ytwho">' + (t.name || (me && me.name) ? "Signed in as <b>" + esc(t.name || me.name) + "</b>" : "Signed in") + '</span>' +
					'<button type="button" class="tu-btn tu-btn--ghost" data-yt="show">' + (L ? "↻ Refresh" : "Show my playlists") + '</button>' +
					'<button type="button" class="tu-btn tu-btn--ghost" data-yt="out">Sign out</button></div>';
			}
			if (busy) h += '<p class="wt-ytmsg" role="status">' + esc(busy) + '</p>';
			if (err) h += '<p class="wt-ytmsg wt-yterr" role="alert">' + esc(err) + (/sign in again|confirm again/i.test(err) ? ' <button type="button" class="wt-b" data-yt="in">Sign in</button>' : "") + '</p>';
			if (on && L) {
				if (!L.length) h += '<p class="wt-ytnote">No playlists on this YouTube account yet.</p>';
				else {
					h += '<div class="wt-ytrows">' + L.map(function (p, i) {
						var have = imported(p.id), pr = p.privacy === "private" ? "🔒&#xFE0E; private" : p.privacy === "unlisted" ? "unlisted" : p.special ? "" : "public";
						return '<div class="wt-ytrow"><span class="wt-ytname"><b>' + esc(p.name) + '</b><small>' + [p.n ? p.n + " video" + (p.n === 1 ? "" : "s") : "", pr, have ? "✓ in My playlists" : ""].filter(Boolean).join(" · ") + '</small></span>' +
							'<button type="button" class="wt-b" data-yi="' + i + '" title="' + (have ? "Get the newest version from YouTube" : "Add to My playlists") + '">' + (have ? "↻ Update" : "+ Add") + '</button></div>';
					}).join("") + '</div>' +
					'<div class="wt-ytfoot"><button type="button" class="tu-btn tu-btn--ghost" data-yt="all">+ Add all ' + L.length + '</button></div>';
				}
			}
			box.innerHTML = h;
		}
		box.addEventListener("click", function (e) {
			var b = e.target.closest("[data-yt],[data-yi]"); if (!b || busy) return;
			var a = b.getAttribute("data-yt");
			if (a === "in" || a === "show") { err = ""; ready(true).then(function () { return loadLists(true); }, function (x) { err = x.message; render(); }); return; }
			if (a === "out") {
				var t = tok(); if (t && t.a && window.google && google.accounts && google.accounts.oauth2) try { google.accounts.oauth2.revoke(t.a, function () {}); } catch (x) {}
				tok(null); lists = null; me = null; err = ""; render(); toast("Signed out of YouTube here. Your imported playlists stay."); return;
			}
			if (a === "all" && lists) { bring(lists.slice()); return; }
			var i = b.getAttribute("data-yi"); if (i != null && lists && lists[+i]) bring([lists[+i]]);
		});
		// load Google's script early, so the click that signs in can open its window at once (pop-up blockers)
		box.addEventListener("pointerenter", function () { gis().catch(function () {}); }, { once: true });
		box.addEventListener("focusin", function () { gis().catch(function () {}); }, { once: true });
		render();
		return {
			shown: function () { if (live() && !lists && !busy && !err) loadLists(false); }
		};
	};
})();
