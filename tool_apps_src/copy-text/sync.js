/* MES Copy Text -- ☁ Save online & sync.
 * Keeps ONE file, copy-text.json, up to date in the person's own cloud storage, written straight from the browser (never
 * through mes.fm). Two ways:
 *   file     a file in their OneDrive / Dropbox / Google Drive / iCloud folder on this computer (File System Access API:
 *            Chrome, Edge, Opera on a computer; Brave behind brave://flags/#file-system-access-api). The desktop app uploads it.
 *            The handle is kept in IndexedDB "mes-copytext" / "kv" / "file"; the browser asks again for permission after a restart.
 *   dropbox / onedrive / gdrive   the account itself, through each service's own OAuth (PKCE, no secret; Google: its token
 *            client). They only appear once an app key is filled in CLOUD below (each service wants an app registered by
 *            the site owner; see the comment there). Files live in each service's app folder.
 * Sync (CTLib.plan / merge3): after each change (2.5 s), when the tab gets focus, every 45 s while visible. The last synced
 * copy is kept (localStorage KEY + ":sync" .base) so deletes and edits made on two devices are merged, not lost.
 * The status line under the toolbar always says whether everything is saved online.
 * window.CTSync(app) is called by app.js; it returns { changed() }.
 */
(function () {
	"use strict";
	/* App keys (public client ids, not secrets). Leave "" to hide that button.
	   Set up 2026-11-06: Dropbox app "MES Copy Text" (admin console of the Dropbox account, additional users enabled = up to 500 before
	   Dropbox's production review); Google project "mes-copy-text" (admin@mes.fm, External, In production, drive.appdata = non-sensitive, no
	   logo on purpose: a logo would need Google's review). OneDrive: not set up (a personal Microsoft account can't register apps without a
	   work/school directory).
	   Dropbox:  dropbox.com/developers/apps -> Create app -> Scoped access, App folder, name "MES Copy Text"; Permissions: files.content.read +
	             files.content.write; Settings: Redirect URIs https://mes.fm/copy-text (and http://127.0.0.1:8430/copy-text/ to test); "App key" here.
	   OneDrive: entra.microsoft.com -> App registrations -> New (accounts in any org + personal Microsoft accounts) -> Platform "Single-page
	             application", redirect https://mes.fm/copy-text; API permissions: Microsoft Graph delegated Files.ReadWrite.AppFolder, offline_access;
	             "Application (client) ID" here.
	   Google:   console.cloud.google.com -> APIs: enable Google Drive API; OAuth consent screen (scope .../auth/drive.appdata); Credentials ->
	             OAuth client ID, Web application, Authorised JavaScript origin https://mes.fm; the client id here. */
	var CLOUD = Object.assign({ dropbox: "iii9nua0gtgi3t6", onedrive: "", gdrive: "604980806442-dlqf3ur1qohoe67sc5i70qu4is9sfva9.apps.googleusercontent.com" }, window.MES_CT_CLOUD || {});  // MES_CT_CLOUD: for testing only
	var FILE = "copy-text.json";

	window.CTSync = function (app) {
		var $ = function (id) { return document.getElementById(id); };
		var KEY = app.key, SKEY = KEY + ":sync", DEV_KEY = KEY + ":dev", OAUTH = KEY + ":oauth";
		var dev = (function () { try { var d = localStorage.getItem(DEV_KEY); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem(DEV_KEY, d); } return d; } catch (e) { return "x"; } })();
		function readRec() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
		function writeRec(r) {
			rec = r;
			try { if (r) localStorage.setItem(SKEY, JSON.stringify(r)); else localStorage.removeItem(SKEY); }
			catch (e) { try { var s = Object.assign({}, r); delete s.base; localStorage.setItem(SKEY, JSON.stringify(s)); } catch (x) {} }
		}
		var rec = readRec(), running = false, again = false, timer = null, lastErr = null, hidden = false;
		function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
		function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
		function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
		function redirectUri() { return location.origin + location.pathname.replace(/\/index\.html$/, ""); }

		/* ---------- IndexedDB (file handle) ---------- */
		function idb() {
			return new Promise(function (res, rej) {
				if (!window.indexedDB) return rej(err("other", "This browser has no IndexedDB."));
				var q = indexedDB.open("mes-copytext", 1);
				q.onupgradeneeded = function () { q.result.createObjectStore("kv"); };
				q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
			});
		}
		function kv(op, k, v) {
			return idb().then(function (db) {
				return new Promise(function (res, rej) {
					var tx = db.transaction("kv", op === "get" ? "readonly" : "readwrite"), st = tx.objectStore("kv");
					var q = op === "get" ? st.get(k) : op === "del" ? st.delete(k) : st.put(v, k);
					q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
				});
			});
		}

		/* ---------- token store + OAuth (PKCE) shared by Dropbox / OneDrive ---------- */
		function tok(p, v) {
			var k = KEY + ":tok:" + p;
			try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) { return null; }
		}
		function startOAuth(p) {
			var verifier = rnd(48), state = rnd(16);
			return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then(function (h) {
				try { sessionStorage.setItem(OAUTH, JSON.stringify({ p: p, v: verifier, s: state })); } catch (e) {}
				location.href = P[p].authUrl(b64url(h), state);
			});
		}
		function form(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&"); }
		function tokenCall(url, body) {
			return fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(body) }).then(function (r) {
				return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.access_token) throw err("auth", j.error_description || j.error || "Sign-in failed (" + r.status + ")."); return j; });
			});
		}
		function saveTok(p, j, old) { var t = { a: j.access_token, e: Date.now() + (j.expires_in || 3600) * 1000, r: j.refresh_token || (old && old.r) || "" }; tok(p, t); return t; }
		function bearer(p) {
			var t = tok(p);
			if (t && t.a && t.e > Date.now() + 60000) return Promise.resolve(t.a);
			if (t && t.r && P[p].refresh) return P[p].refresh(t.r).then(function (j) { return saveTok(p, j, t).a; }, function (e) { tok(p, null); throw err("auth", e.message); });
			return Promise.reject(err("auth", "Signed out."));
		}
		function authed(p, url, opt, retried) {
			return bearer(p).then(function (a) {
				opt = opt || {}; opt.headers = Object.assign({}, opt.headers, { Authorization: "Bearer " + a });
				return fetch(url, opt).then(function (r) {
					if (r.status === 401 && !retried) { var t = tok(p); if (t) { t.e = 0; tok(p, t); } return authed(p, url, opt, true); }
					if (r.status === 401) throw err("auth", "The sign-in ran out.");
					return r;
				});
			}, function (e) { throw e; });
		}
		function failed(r, what) { return r.text().then(function (t) { throw err(r.status === 429 || r.status >= 500 ? "offline" : "other", what + " failed (" + r.status + "): " + t.slice(0, 160)); }); }

		/* ---------- providers: ready(ask) / read() -> {text, ver} | null / write(text, ver) -> {ver} (conflict -> code "conflict") ---------- */
		var P = {
			file: {
				name: "your cloud folder", short: "the sync file",
				ok: function () { return !!window.showSaveFilePicker; },
				h: null,
				handle: function () { var me = this; return me.h ? Promise.resolve(me.h) : kv("get", "file").then(function (h) { if (!h) throw err("auth", "The sync file is not connected."); me.h = h; return h; }); },
				ready: function (ask) {
					return this.handle().then(function (h) {
						if (!h.queryPermission) return true;
						return h.queryPermission({ mode: "readwrite" }).then(function (s) {
							if (s === "granted") return true;
							if (!ask) throw err("perm", "The browser needs your OK to keep using " + h.name + ".");
							return h.requestPermission({ mode: "readwrite" }).then(function (s2) { if (s2 !== "granted") throw err("perm", "Access to " + h.name + " was not allowed."); return true; });
						});
					});
				},
				read: function () {
					return this.handle().then(function (h) {
						return h.getFile().then(function (f) { return f.text().then(function (t) { return t.trim() ? { text: t, ver: f.lastModified + ":" + f.size } : null; }); });
					}).catch(function (e) { if (e && e.name === "NotFoundError") throw err("other", "The sync file was moved or deleted. Connect it again (☁ Sync)."); throw e; });
				},
				write: function (text, ver) {
					return this.handle().then(function (h) {
						return h.getFile().then(function (f) {
							var now = f.size ? f.lastModified + ":" + f.size : null;
							if (ver !== undefined && now !== ver) throw err("conflict", "changed");
							return h.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); }).then(function () { return h.getFile(); })
								.then(function (g) { return { ver: g.lastModified + ":" + g.size }; });
						});
					});
				},
				label: function () { return this.h ? this.h.name : FILE; }
			},
			dropbox: {
				name: "Dropbox", short: "Dropbox", where: "Dropbox → Apps → MES Copy Text → " + FILE,
				ok: function () { return !!CLOUD.dropbox; },
				authUrl: function (ch, st) { return "https://www.dropbox.com/oauth2/authorize?" + form({ client_id: CLOUD.dropbox, response_type: "code", code_challenge: ch, code_challenge_method: "S256", redirect_uri: redirectUri(), token_access_type: "offline", state: st }); },
				exchange: function (code, v) { return tokenCall("https://api.dropboxapi.com/oauth2/token", { grant_type: "authorization_code", code: code, client_id: CLOUD.dropbox, code_verifier: v, redirect_uri: redirectUri() }); },
				refresh: function (r) { return tokenCall("https://api.dropboxapi.com/oauth2/token", { grant_type: "refresh_token", refresh_token: r, client_id: CLOUD.dropbox }); },
				ready: function () { return bearer("dropbox"); },
				read: function () {
					return authed("dropbox", "https://api.dropboxapi.com/2/files/get_metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: "/" + FILE }) }).then(function (r) {
						if (r.status === 409) return null;
						if (!r.ok) return failed(r, "Reading Dropbox");
						return r.json().then(function (m) {
							return authed("dropbox", "https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { "Dropbox-API-Arg": JSON.stringify({ path: "rev:" + m.rev }) } }).then(function (d) {
								if (!d.ok) return failed(d, "Downloading from Dropbox");
								return d.text().then(function (t) { return { text: t, ver: m.rev }; });
							});
						});
					});
				},
				write: function (text, ver) {
					var mode = ver ? { ".tag": "update", update: ver } : { ".tag": "add" };
					return authed("dropbox", "https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ path: "/" + FILE, mode: mode, autorename: false, mute: true }) }, body: text }).then(function (r) {
						if (r.status === 409) throw err("conflict", "changed");
						if (!r.ok) return failed(r, "Saving to Dropbox");
						return r.json().then(function (j) { return { ver: j.rev }; });
					});
				},
				disconnect: function () { var t = tok("dropbox"); if (t && t.a) fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: "Bearer " + t.a } }).catch(function () {}); tok("dropbox", null); },
				label: function () { return this.where; }
			},
			onedrive: {
				name: "OneDrive", short: "OneDrive", where: "OneDrive → Apps → MES Copy Text → " + FILE,
				ok: function () { return !!CLOUD.onedrive; },
				ms: "https://login.microsoftonline.com/common/oauth2/v2.0/", scope: "Files.ReadWrite.AppFolder offline_access",
				g: "https://graph.microsoft.com/v1.0/me/drive/special/approot:/" + FILE,
				authUrl: function (ch, st) { return this.ms + "authorize?" + form({ client_id: CLOUD.onedrive, response_type: "code", redirect_uri: redirectUri(), response_mode: "query", scope: this.scope, code_challenge: ch, code_challenge_method: "S256", state: st }); },
				exchange: function (code, v) { return tokenCall(this.ms + "token", { client_id: CLOUD.onedrive, grant_type: "authorization_code", code: code, redirect_uri: redirectUri(), code_verifier: v, scope: this.scope }); },
				refresh: function (r) { return tokenCall(P.onedrive.ms + "token", { client_id: CLOUD.onedrive, grant_type: "refresh_token", refresh_token: r, scope: P.onedrive.scope }); },
				ready: function () { return bearer("onedrive"); },
				read: function () {
					var me = this;
					return authed("onedrive", me.g + "?select=id,eTag").then(function (r) {
						if (r.status === 404) return null;
						if (!r.ok) return failed(r, "Reading OneDrive");
						return r.json().then(function (m) {
							return authed("onedrive", "https://graph.microsoft.com/v1.0/me/drive/items/" + m.id + "/content").then(function (d) {
								if (!d.ok) return failed(d, "Downloading from OneDrive");
								return d.text().then(function (t) { return { text: t, ver: m.eTag }; });
							});
						});
					});
				},
				write: function (text, ver) {
					var h = { "Content-Type": "text/plain" }; if (ver) h["If-Match"] = ver;
					return authed("onedrive", this.g + ":/content" + (ver ? "" : "?@microsoft.graph.conflictBehavior=fail"), { method: "PUT", headers: h, body: text }).then(function (r) {
						if (r.status === 412 || r.status === 409) throw err("conflict", "changed");
						if (!r.ok) return failed(r, "Saving to OneDrive");
						return r.json().then(function (j) { return { ver: j.eTag }; });
					});
				},
				disconnect: function () { tok("onedrive", null); },
				label: function () { return this.where; }
			},
			gdrive: {
				name: "Google Drive", short: "Google Drive", where: "Google Drive (hidden app data of MES Copy Text)",
				ok: function () { return !!CLOUD.gdrive; },
				lib: null,
				gis: function () {
					if (this.lib) return this.lib;
					return (this.lib = new Promise(function (res, rej) {
						if (window.google && google.accounts && google.accounts.oauth2) return res();
						var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
						s.onload = function () { res(); }; s.onerror = function () { P.gdrive.lib = null; rej(err("offline", "Google's sign-in script did not load.")); };
						document.head.appendChild(s);
					}));
				},
				ready: function (ask) {
					var t = tok("gdrive");
					if (t && t.a && t.e > Date.now() + 60000) return Promise.resolve(t.a);
					if (!ask) return Promise.reject(err("auth", "Google asks you to confirm again (once an hour)."));
					return this.gis().then(function () {
						return new Promise(function (res, rej) {
							var c = google.accounts.oauth2.initTokenClient({ client_id: CLOUD.gdrive, scope: "https://www.googleapis.com/auth/drive.appdata",
								callback: function (j) { if (j.error || !j.access_token) return rej(err("auth", j.error_description || j.error || "Google sign-in failed.")); res(saveTok("gdrive", j).a); },
								error_callback: function (e) { rej(err("auth", (e && e.message) || "The Google window was closed.")); } });
							c.requestAccessToken({ prompt: t ? "" : "consent" });
						});
					});
				},
				api: "https://www.googleapis.com/drive/v3/files", up: "https://www.googleapis.com/upload/drive/v3/files",
				find: function () {
					return authed("gdrive", this.api + "?" + form({ spaces: "appDataFolder", q: "name='" + FILE + "' and trashed=false", fields: "files(id,version)", pageSize: 5 })).then(function (r) {
						if (!r.ok) return failed(r, "Reading Google Drive");
						return r.json().then(function (j) { return (j.files || [])[0] || null; });
					});
				},
				read: function () {
					var me = this;
					return me.find().then(function (f) {
						if (!f) return null;
						return authed("gdrive", me.api + "/" + f.id + "?alt=media").then(function (d) {
							if (!d.ok) return failed(d, "Downloading from Google Drive");
							return d.text().then(function (t) { return { text: t, ver: f.id + ":" + f.version }; });
						});
					});
				},
				write: function (text, ver) {
					var me = this;
					return me.find().then(function (f) {
						var now = f ? f.id + ":" + f.version : null;
						if ((ver || null) !== now) throw err("conflict", "changed");
						if (f) return authed("gdrive", me.up + "/" + f.id + "?uploadType=media&fields=id,version", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: text });
						var b = "mesct" + rnd(9), body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ name: FILE, parents: ["appDataFolder"] }) +
							"\r\n--" + b + "\r\nContent-Type: application/json\r\n\r\n" + text + "\r\n--" + b + "--";
						return authed("gdrive", me.up + "?uploadType=multipart&fields=id,version", { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: body });
					}).then(function (r) {
						if (!r.ok) return failed(r, "Saving to Google Drive");
						return r.json().then(function (j) { return { ver: j.id + ":" + j.version }; });
					});
				},
				disconnect: function () { var t = tok("gdrive"); if (t && t.a && window.google && google.accounts) try { google.accounts.oauth2.revoke(t.a, function () {}); } catch (e) {} tok("gdrive", null); },
				label: function () { return this.where; }
			}
		};

		/* ---------- the sync itself ---------- */
		function lock(fn) { return navigator.locks && navigator.locks.request ? navigator.locks.request("mes-copytext-sync", fn) : fn(); }
		function syncNow(ask) {
			if (!rec || !rec.p || !P[rec.p]) return Promise.resolve();
			if (running) { again = true; return Promise.resolve(); }
			running = true; clearTimeout(timer); paint();
			return lock(function () {
				var r = readRec(); if (!r || !r.p) return;                 // disconnected in another tab
				rec = r;
				var prov = P[rec.p], tries = 0;
				function once() {
					return Promise.resolve(prov.ready(ask)).then(function () { return prov.read(); }).then(function (remote) {
						var rs = null;
						if (remote) { try { rs = CTLib.parseFile(remote.text); } catch (e) { throw err("other", (prov.short === "the sync file" ? P.file.label() : prov.name + "'s " + FILE) + " is not a Copy Text sync file. Pick another file, or disconnect."); } }
						var st = app.state(), local = CTLib.snapshot(st), lsig = CTLib.sig(local), rsig = rs ? CTLib.sig(rs.data) : null;
						var what = CTLib.plan(rec.bsig || null, lsig, rsig), next = null, write = null, apply = null;
						if (what === "same") next = local;
						else if (what === "push") { next = local; write = local; }
						else {
							var m = what === "pull" ? rs.data : CTLib.merge3(rec.base || null, local, rs.data);
							if (CTLib.sig(m) !== lsig) { apply = CTLib.fromSnap(m, st, app.uid); m = CTLib.snapshot(apply); }  // normalised as it will be stored here
							next = m; if (CTLib.sig(m) !== rsig) write = m;
						}
						if (apply && app.busy()) { again = true; apply = null; write = null; next = null; }  // a note is being edited: try again after
						var done = write ? prov.write(CTLib.fileText(write, dev), remote ? remote.ver : null) : Promise.resolve({ ver: remote ? remote.ver : null });
						return done.then(function (w) {
							// texts added while the file was being written: keep the old base so the next round merges them in
							if (CTLib.sig(CTLib.snapshot(app.state())) !== lsig) { again = true; return; }
							if (apply) {
								var before = CTLib.count(local);
								app.apply(apply);
								var d = CTLib.count(apply) - before;
								app.toast("Updated from " + prov.short + (d > 0 ? ": " + d + " new" : d < 0 ? ": " + (-d) + " removed" : ""));
							}
							if (!next) return;
							var nr = Object.assign({}, rec, { ver: w.ver, base: next, bsig: CTLib.sig(next), at: Date.now(), err: null, code: null });
							if (prov.label) nr.label = prov.label();
							writeRec(nr); lastErr = null;
						});
					}).catch(function (e) {
						if (e && e.code === "conflict" && ++tries < 4) return once();  // changed on another device in the meantime: read it again
						throw e;
					});
				}
				return once();
			}).catch(function (e) {
				var code = e && e.code || (navigator.onLine === false || (e && e.name === "TypeError") ? "offline" : "other");
				lastErr = { code: code, msg: code === "offline" ? "No connection" : (e && e.message) || String(e) };
				if (rec) { rec.err = lastErr.msg; rec.code = code; writeRec(rec); }
			}).then(function () {
				running = false; paint();
				if (again) { again = false; schedule(1500); }
			});
		}
		function schedule(ms) { clearTimeout(timer); if (rec && rec.p) timer = setTimeout(function () { syncNow(false); }, ms); }
		function dirty() { return !!(rec && rec.p && rec.bsig !== CTLib.sig(CTLib.snapshot(app.state()))); }

		/* ---------- status line + button ---------- */
		function provName() { return rec && P[rec.p] ? (rec.p === "file" ? (rec.label || FILE) : P[rec.p].name) : ""; }
		function paint() {
			var line = $("cp-syncstate"), btn = $("cp-syncbtn");
			if (!line || !btn) return;
			if (!rec || !rec.p) { line.hidden = true; btn.textContent = "☁ Sync"; btn.classList.remove("is-ok", "is-due", "is-err"); paintPanel(); return; }
			var d = dirty(), code = rec.code, name = provName(), html, cls, b;
			if (running) { html = "⟳ Saving to " + esc(name) + "…"; cls = "is-due"; b = "☁ Saving…"; }
			else if (code === "auth" && rec.p === "file") {
				html = "⚠ This browser no longer has the sync file <b>" + esc(name) + "</b>." + (d ? " Your latest changes are only in this browser." : "") + ' <button type="button" class="tu-chip" data-s="c-open">Open it again</button>';
				cls = "is-err"; b = "☁ Sync ⚠";
			} else if (code === "auth" || code === "perm") {
				html = "⚠ " + (code === "perm" ? "The browser needs your OK to keep saving to <b>" + esc(name) + "</b>." : "<b>" + esc(name) + "</b> needs you to sign in again.") +
					(d ? " Your latest changes are only in this browser." : "") + ' <button type="button" class="tu-chip" data-s="allow">' + (code === "perm" ? "Allow" : "Sign in") + "</button>";
				cls = "is-err"; b = "☁ Sync ⚠";
			} else if (code === "offline") { html = "⚠ Can't reach " + esc(name) + " right now" + (d ? ": your changes are saved here and will be saved online when the connection is back." : "."); cls = "is-due"; b = "☁ Sync •"; }
			else if (code) { html = "⚠ Sync problem: " + esc(rec.err || "unknown") + ' <button type="button" class="tu-chip" data-s="now">Try again</button>'; cls = "is-err"; b = "☁ Sync ⚠"; }
			else if (d) { html = "● Changes not saved to " + esc(name) + " yet…"; cls = "is-due"; b = "☁ Sync •"; }
			else { html = "✓ Everything is saved to <b>" + esc(name) + "</b>" + (rec.at ? " · synced " + CTLib.ago(rec.at) : ""); cls = "is-ok"; b = "☁ Synced ✓"; }
			line.innerHTML = html; line.className = "tu-note cp-syncstate " + cls; line.hidden = false;
			btn.textContent = b; btn.classList.remove("is-ok", "is-due", "is-err"); btn.classList.add(cls);
			btn.title = line.textContent;
			paintPanel();
		}
		function esc(s) { return app.esc(String(s)); }
		function paintPanel() {
			var box = $("cp-sync-body"); if (!box || $("cp-sync").hidden) return;
			var h = "";
			if (rec && rec.p && P[rec.p]) {
				var pr = P[rec.p];
				h += '<p class="cp-sync-on">Connected to <b>' + esc(rec.p === "file" ? "the file " + (rec.label || FILE) : pr.name) + "</b>" + (rec.p !== "file" ? ' <span class="cp-sync-where">(' + esc(pr.where) + ")</span>" : "") +
					". Every change is saved there automatically, a few seconds after you make it" + (rec.at ? "; last synced " + esc(new Date(rec.at).toLocaleString()) : "") + ".</p>" +
					'<div class="cp-sync-acts"><button type="button" class="tu-btn tu-btn--primary" data-s="now">Sync now</button> <button type="button" class="tu-btn" data-s="dl">⬇ Download a copy</button>' + (rec.p === "file" ? ' <button type="button" class="tu-btn" data-s="c-open">Use another file…</button>' : "") + '  <button type="button" class="tu-btn tu-btn--ghost" data-s="off">Disconnect</button></div>' +
					'<p class="tu-note">On another computer or phone: open mes.fm/copy-text, press ☁ Sync and ' + (rec.p === "file" ? "pick the same <b>" + esc(rec.label || FILE) + "</b> in that computer's synced folder (Open an existing sync file)." : "connect the same " + esc(pr.name) + " account.") +
					" Texts from both are combined; deleting or editing on one deletes or edits on the other.</p>" +
					(rec.p === "gdrive" ? '<p class="tu-note">Google only lets a web page keep access for an hour, so after that the status line asks for one click to carry on.</p>' : "") +
					(rec.p === "file" ? '<p class="tu-note">After you restart the browser it asks once for your OK to use the file again (the status line shows an <b>Allow</b> button).</p>' : "");
			} else {
				var any = false;
				h += '<p class="cp-sync-intro">Keep all your boards in one file, <b>' + FILE + "</b>, in your own cloud storage. It is saved automatically after every change, so the same texts are on every computer and phone where you connect it. Nothing goes through mes.fm: your browser writes the file itself.</p>";
				var direct = ["dropbox", "onedrive", "gdrive"].filter(function (p) { return P[p].ok(); });
				if (direct.length) {
					any = true;
					h += '<div class="cp-sync-opt"><h3>Connect your account</h3><p>Works on any device, phones too. The file goes in the service\'s own app folder.</p><div class="cp-sync-acts">' +
						direct.map(function (p) { return '<button type="button" class="tu-btn tu-btn--primary" data-s="c-' + p + '">Connect ' + P[p].name + "</button>"; }).join(" ") + "</div></div>";
				}
				h += '<div class="cp-sync-opt"><h3>A file in your OneDrive, Dropbox, Google Drive or iCloud folder</h3>' +
					"<p>If the service's app is installed on this computer, it has a folder that it keeps in sync (for example <i>OneDrive</i>, <i>Dropbox</i>, <i>Google Drive</i> or <i>iCloud Drive</i> in your Files / Finder). Create the sync file there and the app uploads every change.</p>";
				if (P.file.ok()) {
					any = true;
					h += '<div class="cp-sync-acts"><button type="button" class="tu-btn tu-btn--primary" data-s="c-new">Create the sync file…</button> <button type="button" class="tu-btn" data-s="c-open">Open an existing sync file…</button></div>';
				} else {
					var brave = navigator.brave || /Brave/.test(navigator.userAgent);
					h += '<p class="cp-hive-warn is-open">' + (brave ? "Brave hides this feature: turn on <b>brave://flags/#file-system-access-api</b> (copy it into the address bar), restart Brave and come back." :
						"This browser can't keep a file up to date (it works in Chrome, Edge and Opera on a computer; not in Firefox, Safari or on phones).") + "</p>";
				}
				h += "</div>";
				if (!any) h += '<p class="tu-note">Meanwhile you can use <b>More ▾ → Back up everything (.json)</b> and save that file in your cloud folder by hand, or the encrypted <b>☁ Hive backup</b>.</p>';
			}
			if (lastErr && lastErr.code !== "auth" && lastErr.code !== "perm") h += '<p class="tu-note cp-sync-err">⚠ ' + esc(lastErr.msg) + "</p>";
			box.innerHTML = h;
		}

		/* ---------- connecting ---------- */
		function connected(p, label) {
			writeRec({ p: p, label: label || "", at: 0, bsig: null, base: null, ver: null });
			lastErr = null;
			return syncNow(true).then(function () {
				if (rec && !rec.code) app.toast("Connected: everything is saved to " + provName());
				paint();
			});
		}
		function connectFile(open) {
			var pick = open ? window.showOpenFilePicker({ types: [{ description: "Copy Text sync file", accept: { "application/json": [".json"] } }], multiple: false }).then(function (a) { return a[0]; })
				: window.showSaveFilePicker({ suggestedName: FILE, types: [{ description: "Copy Text sync file", accept: { "application/json": [".json"] } }] });
			return pick.then(function (h) {
				var ok = h.requestPermission ? h.requestPermission({ mode: "readwrite" }) : Promise.resolve("granted");
				return ok.then(function (s) {
					if (s !== "granted") throw err("perm", "The browser was not allowed to write to " + h.name + ".");
					P.file.h = h;
					return kv("put", "file", h).catch(function () { app.toast("This browser can't remember the file: connect it again after a restart"); }).then(function () { return connected("file", h.name); });
				});
			}).catch(function (e) { if (e && e.name === "AbortError") return; lastErr = { code: "other", msg: e.message || String(e) }; paint(); });
		}
		function disconnect() {
			if (!rec) return;
			if (!confirm("Stop syncing with " + provName() + "?\n\nYour texts stay here, and the file stays where it is.")) return;
			var p = rec.p;
			if (P[p] && P[p].disconnect) P[p].disconnect();
			if (p === "file") { P.file.h = null; kv("del", "file").catch(function () {}); }
			writeRec(null); lastErr = null; paint();
			app.toast("Sync turned off");
		}
		function finishOAuth() { // back from Dropbox / Microsoft with ?code=&state=
			var q = new URLSearchParams(location.search), code = q.get("code"), st = q.get("state"), e = q.get("error");
			if (!code && !e) return false;
			var o = null; try { o = JSON.parse(sessionStorage.getItem(OAUTH) || "null"); sessionStorage.removeItem(OAUTH); } catch (x) {}
			history.replaceState(null, "", location.pathname + location.hash);    // never leave the code in the address bar
			if (!o || o.s !== st || !P[o.p]) return false;
			openPanel();
			if (e) { lastErr = { code: "other", msg: P[o.p].name + ": " + (q.get("error_description") || e) }; paint(); return true; }
			P[o.p].exchange(code, o.v).then(function (j) { saveTok(o.p, j); return connected(o.p); })
				.catch(function (x) { lastErr = { code: "other", msg: x.message || String(x) }; paint(); });
			return true;
		}

		/* ---------- panel + events ---------- */
		function openPanel() { $("cp-sync").hidden = false; $("cp-syncbtn").setAttribute("aria-expanded", "true"); paintPanel(); }
		function closePanel() { $("cp-sync").hidden = true; $("cp-syncbtn").setAttribute("aria-expanded", "false"); }
		$("cp-syncbtn").onclick = function () { if ($("cp-sync").hidden) { openPanel(); $("cp-sync").scrollIntoView({ block: "nearest", behavior: "smooth" }); } else closePanel(); };
		$("cp-sync-close").onclick = closePanel;
		function onClick(e) {
			var b = e.target.closest("[data-s]"); if (!b) return;
			var a = b.dataset.s;
			if (a === "now" || a === "allow") { lastErr = null; if (rec) { rec.code = null; rec.err = null; } if (a === "allow" && rec && rec.p !== "file" && rec.p !== "gdrive") { startOAuth(rec.p); return; } syncNow(true); }
			else if (a === "off") disconnect();
			else if (a === "dl") app.download(FILE, CTLib.fileText(CTLib.snapshot(app.state()), dev), "application/json");
			else if (a === "c-new" || a === "c-open") connectFile(a === "c-open");
			else if (a === "c-gdrive") { writeRec({ p: "gdrive", at: 0 }); P.gdrive.ready(true).then(function () { return connected("gdrive"); }, function (x) { writeRec(null); lastErr = { code: "other", msg: x.message }; paint(); }); }
			else if (/^c-/.test(a)) startOAuth(a.slice(2)).catch(function (x) { lastErr = { code: "other", msg: x.message }; paint(); });
		}
		$("cp-sync").addEventListener("click", onClick);
		$("cp-syncstate").addEventListener("click", onClick);
		window.addEventListener("storage", function (e) { if (e.key === SKEY) { rec = readRec(); paint(); } });
		document.addEventListener("visibilitychange", function () {
			hidden = document.hidden;
			if (!rec || !rec.p) return;
			if (hidden) { if (dirty()) syncNow(false); } else syncNow(false);
		});
		window.addEventListener("online", function () { if (rec && rec.p) syncNow(false); });
		window.addEventListener("beforeunload", function (e) { if (dirty() && rec && !rec.code) { syncNow(false); e.preventDefault(); e.returnValue = ""; } });
		setInterval(function () { if (!rec || !rec.p || hidden) return; if (!running && !rec.code) syncNow(false); else paint(); }, 45000);
		setInterval(function () { if (rec && rec.p && !hidden) paint(); }, 20000);
		if (/[?&]sync=1\b/.test(location.search) || location.hash === "#sync") openPanel();

		if (!finishOAuth() && rec && rec.p) { paint(); syncNow(false); } else paint();
		return {
			changed: function () { if (rec && rec.p) { paint(); schedule(2500); } },
			providers: P, syncNow: syncNow, rec: function () { return rec; }
		};
	};
})();
