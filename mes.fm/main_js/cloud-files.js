/* MES Cloud Files (window.MESCloud): open a document from, and keep it saved to, the person's own cloud storage, written
 * straight from the browser (never through mes.fm). Used by mes.fm/excel and mes.fm/docx (and any page that can turn its
 * document into bytes). Same ideas as Copy Text's ☁ Sync (tool_apps_src/copy-text/sync.js), but for whole files:
 *   file      a file on this computer, e.g. inside the OneDrive / Dropbox / Google Drive / iCloud folder, which the service's
 *             desktop app uploads (File System Access API: Chrome, Edge, Opera on a computer; Brave behind its flag).
 *   dropbox / onedrive / gdrive   the account itself, with the SAME app registrations and the SAME saved sign-in as Copy Text
 *             (tokens in localStorage "mes-copytext:v1:tok:<p>"): connecting once works on every page. Files live in the
 *             service's MES app folder, sub-folder "Documents" (Google: the hidden app-data space, seen only through MES pages).
 *             Those apps only allow https://mes.fm/copy-text as the sign-in return address, so Dropbox / Microsoft sign-in
 *             runs in a pop-up that lands on /copy-text, which hands the code back (localStorage "mes-cloud:code:<state>",
 *             the relay at the top of copy-text/sync.js) and closes. Google's token pop-up needs no relay.
 * Each linked document remembers {p, ref, name, ver}; a save sends the version it last saw, so a file changed on another
 * device is never overwritten without asking (Keep mine / Open theirs / Save mine as a copy). Auto-save after changes,
 * a check for changes elsewhere when the tab gets focus. Pure helpers are exported for node tests.
 */
(function () {
	"use strict";
	var H = {
		extOf: function (n) { var m = /\.([A-Za-z0-9]{1,6})$/.exec(String(n || "")); return m ? m[1].toLowerCase() : ""; },
		baseName: function (n) { return String(n || "").replace(/\.[A-Za-z0-9]{1,6}$/, ""); },
		accepts: function (name, exts) { var e = H.extOf(name); return exts.some(function (x) { return x.replace(/^\./, "").toLowerCase() === e; }); },
		// a file name the services accept: no slashes / control characters / reserved Windows characters, not empty, <= 200 chars
		safeName: function (n, fallbackExt) {
			var s = String(n || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
			if (!s) s = "Untitled";
			if (fallbackExt && !H.extOf(s)) s += "." + fallbackExt.replace(/^\./, "");
			if (s.length > 200) { var e = H.extOf(s); s = s.slice(0, 190).trim() + (e ? "." + e : ""); }
			return s;
		},
		copyName: function (n) { var b = H.baseName(n), e = H.extOf(n), d = new Date(), p = function (x) { return (x < 10 ? "0" : "") + x; }; return b + " (copy " + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + p(d.getMinutes()) + ")" + (e ? "." + e : ""); },
		fmtBytes: function (b) { b = +b || 0; return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB" : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + " MB"; },
		ago: function (t, now) { var s = Math.round(((now || Date.now()) - t) / 1000); if (s < 45) return "just now"; var m = Math.round(s / 60); if (m < 60) return m + " min ago"; var h = Math.round(m / 60); if (h < 24) return h + " h ago"; return Math.round(h / 24) + " d ago"; },
		// keep a recent list short: newest first, one entry per (provider, ref), at most n
		pushRecent: function (list, item, n) { var out = [item]; (list || []).forEach(function (r) { if (out.length < (n || 12) && !(r.p === item.p && r.ref === item.ref)) out.push(r); }); return out; },
		// what to do when a save comes back "conflict" while auto-saving: never overwrite by itself
		filesFor: function (list, exts) { return (list || []).filter(function (f) { return H.accepts(f.name, exts); }).sort(function (a, b) { return (b.mod || 0) - (a.mod || 0); }); }
	};
	if (typeof module === "object" && module.exports) module.exports = H;
	if (typeof window === "undefined" || typeof document === "undefined") return;

	var CLOUD = Object.assign({ dropbox: "iii9nua0gtgi3t6", onedrive: "294df2de-6d61-4c56-a0c1-c79cd09a2e8e", gdrive: "604980806442-dlqf3ur1qohoe67sc5i70qu4is9sfva9.apps.googleusercontent.com" }, window.MES_CT_CLOUD || {});
	var RELAY = "https://mes.fm/copy-text", TOK = "mes-copytext:v1:tok:", DIR = "Documents";
	var MOCK = /[?&]cloudmock=1\b/.test(location.search) || !!window.MES_CLOUD_MOCK;
	function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
	function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
	function form(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&"); }
	function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
	function u8of(x) { return x instanceof Uint8Array ? x : new Uint8Array(x); }

	/* ---------- IndexedDB: remembered file handles ---------- */
	var idbP = null;
	function idb() {
		if (idbP) return idbP;
		idbP = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(err("other", "no IndexedDB"));
			var q = indexedDB.open("mes-cloud", 1);
			q.onupgradeneeded = function () { q.result.createObjectStore("h"); };
			q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
		});
		idbP.catch(function () { idbP = null; });
		return idbP;
	}
	function hkv(op, k, v) {
		return idb().then(function (db) {
			return new Promise(function (res, rej) {
				var tx = db.transaction("h", op === "get" ? "readonly" : "readwrite"), st = tx.objectStore("h");
				var q = op === "get" ? st.get(k) : op === "del" ? st.delete(k) : st.put(v, k);
				q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
			});
		});
	}

	/* ---------- sign-in (tokens shared with Copy Text) ---------- */
	function tok(p, v) { return v === undefined ? ls(TOK + p) : ls(TOK + p, v); }
	function tokenCall(url, body) {
		return fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(body) }).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.access_token) throw err("auth", j.error_description || j.error || "Sign-in failed (" + r.status + ")."); return j; });
		});
	}
	function saveTok(p, j, old) { var t = { a: j.access_token, e: Date.now() + (j.expires_in || 3600) * 1000, r: j.refresh_token || (old && old.r) || "" }; tok(p, t); return t; }
	function bearer(p, ask) {
		var t = tok(p);
		if (t && t.a && t.e > Date.now() + 60000) return Promise.resolve(t.a);
		if (t && t.r && P[p].refresh) return P[p].refresh(t.r).then(function (j) { return saveTok(p, j, t).a; }, function (e) { tok(p, null); throw err("auth", e.message); });
		if (p === "gdrive" && ask) return P.gdrive.signIn(!!t);
		return Promise.reject(err("auth", p === "gdrive" && t ? "Google asks you to confirm again (once an hour)." : "Not signed in."));
	}
	function signedIn(p) { if (MOCK) return !!ls("mes-cloud:mock:on:" + p); var t = tok(p); return !!(t && (t.r || (t.a && (p === "gdrive" || t.e > Date.now())))); }
	function authed(p, url, opt, retried) {
		return bearer(p, false).then(function (a) {
			opt = Object.assign({}, opt || {}); opt.headers = Object.assign({}, opt.headers, { Authorization: "Bearer " + a });
			return fetch(url, opt).then(function (r) {
				if (r.status === 401 && !retried) { var t = tok(p); if (t) { t.e = 0; tok(p, t); } return authed(p, url, opt, true); }
				if (r.status === 401) throw err("auth", "The sign-in ran out.");
				return r;
			});
		});
	}
	function failed(r, what) { return r.text().then(function (t) { throw err(r.status === 429 || r.status >= 500 ? "offline" : "other", what + " failed (" + r.status + "): " + t.slice(0, 160)); }); }
	// Dropbox / Microsoft: PKCE in a pop-up that returns to https://mes.fm/copy-text (the address registered with them)
	function popupSignIn(p) {
		var w = window.open("", "mescloud", "width=520,height=700");      // opened inside the click, or the browser blocks it
		if (!w) return Promise.reject(err("other", "The sign-in window was blocked. Allow pop-ups for mes.fm and try again."));
		try { w.document.title = "Signing in…"; w.document.body.innerHTML = '<p style="font:16px system-ui;padding:2em">Opening ' + P[p].name + "…</p>"; } catch (e) { /* ignore */ }
		var verifier = rnd(48), state = rnd(16);
		return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then(function (h) {
			ls("mes-cloud:oauth:" + state, { p: p, t: Date.now() });
			w.location.href = P[p].authUrl(b64url(h), state);
			return new Promise(function (res, rej) {
				var t0 = Date.now(), timer = null;
				function look() {
					var got = ls("mes-cloud:code:" + state);
					if (got) { cleanup(); ls("mes-cloud:code:" + state, null); if (got.error || !got.code) return rej(err("auth", P[p].name + ": " + (got.desc || got.error || "sign-in was cancelled"))); return res(got.code); }
					if (Date.now() - t0 > 300000) { cleanup(); rej(err("auth", "The sign-in took too long. Try again.")); }
				}
				function onStore(e) { if (e.key === "mes-cloud:code:" + state) look(); }
				function cleanup() { clearInterval(timer); window.removeEventListener("storage", onStore); ls("mes-cloud:oauth:" + state, null); }
				pending = { cancel: function () { cleanup(); try { w.close(); } catch (e) { /* ignore */ } rej(err("abort", "Cancelled")); } };
				timer = setInterval(look, 600); window.addEventListener("storage", onStore);
			});
		}).then(function (code) { pending = null; return P[p].exchange(code, verifier); })
			.then(function (j) { saveTok(p, j); }, function (e) { pending = null; throw e; });
	}
	var pending = null;

	/* ---------- providers: list() / head(ref) -> ver / read(ref) -> {bytes, ver, name} / write(ref|null, name, bytes, ver) -> {ref, ver, name} ---------- */
	var P = {
		file: {
			name: "this computer", where: function (l) { return (l && l.name) || "a file"; },
			ok: function () { return !!window.showSaveFilePicker; },
			perm: function (h, ask) {
				if (!h.queryPermission) return Promise.resolve();
				return h.queryPermission({ mode: "readwrite" }).then(function (s) {
					if (s === "granted") return;
					if (!ask) throw err("perm", "The browser needs your OK to keep using " + h.name + ".");
					return h.requestPermission({ mode: "readwrite" }).then(function (s2) { if (s2 !== "granted") throw err("perm", "Access to " + h.name + " was not allowed."); });
				});
			},
			ver: function (f) { return f.lastModified + ":" + f.size; },
			head: function (h) { return h.getFile().then(P.file.ver, function (e) { throw e && e.name === "NotFoundError" ? err("gone", h.name + " was moved or deleted.") : e; }); },
			read: function (h, ask) {
				// ask for read + write while the click still counts, so later saves need no prompt; reading alone is enough to open
				var ok = ask && h.requestPermission ? h.requestPermission({ mode: "readwrite" }).catch(function () { }) : Promise.resolve();
				return ok.then(function () { return h.getFile(); }).then(function (f) { return f.arrayBuffer().then(function (b) { return { bytes: new Uint8Array(b), ver: P.file.ver(f), name: f.name }; }); });
			},
			write: function (h, name, bytes, ver, ask) {
				return P.file.perm(h, ask).then(function () { return h.getFile(); }).then(function (f) {
					if (ver && P.file.ver(f) !== ver && f.size) throw err("conflict", "changed");
					return h.createWritable().then(function (w) { return w.write(bytes).then(function () { return w.close(); }); }).then(function () { return h.getFile(); })
						.then(function (g) { return { ref: h, ver: P.file.ver(g), name: h.name }; });
				});
			}
		},
		dropbox: {
			name: "Dropbox", where: function (l) { return "Dropbox → Apps → MES Copy Text → " + DIR + " → " + (l ? l.name : ""); },
			ok: function () { return !!CLOUD.dropbox; },
			authUrl: function (ch, st) { return "https://www.dropbox.com/oauth2/authorize?" + form({ client_id: CLOUD.dropbox, response_type: "code", code_challenge: ch, code_challenge_method: "S256", redirect_uri: RELAY, token_access_type: "offline", state: st }); },
			exchange: function (code, v) { return tokenCall("https://api.dropboxapi.com/oauth2/token", { grant_type: "authorization_code", code: code, client_id: CLOUD.dropbox, code_verifier: v, redirect_uri: RELAY }); },
			refresh: function (r) { return tokenCall("https://api.dropboxapi.com/oauth2/token", { grant_type: "refresh_token", refresh_token: r, client_id: CLOUD.dropbox }); },
			api: function (path, body) { return authed("dropbox", "https://api.dropboxapi.com/2/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); },
			list: function () {
				return P.dropbox.api("files/list_folder", { path: "/" + DIR, limit: 500 }).then(function (r) {
					if (r.status === 409) return [];
					if (!r.ok) return failed(r, "Reading Dropbox");
					return r.json().then(function (j) { return (j.entries || []).filter(function (e) { return e[".tag"] === "file"; }).map(function (e) { return { ref: e.id, name: e.name, size: e.size, mod: Date.parse(e.server_modified) || 0, ver: e.rev }; }); });
				});
			},
			meta: function (ref) {
				return P.dropbox.api("files/get_metadata", { path: ref }).then(function (r) {
					if (r.status === 409) throw err("gone", "The file is no longer in Dropbox.");
					if (!r.ok) return failed(r, "Reading Dropbox");
					return r.json();
				});
			},
			head: function (ref) { return P.dropbox.meta(ref).then(function (m) { return m.rev; }); },
			read: function (ref) {
				return P.dropbox.meta(ref).then(function (m) {
					return authed("dropbox", "https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { "Dropbox-API-Arg": JSON.stringify({ path: "rev:" + m.rev }) } }).then(function (d) {
						if (!d.ok) return failed(d, "Downloading from Dropbox");
						return d.arrayBuffer().then(function (b) { return { bytes: new Uint8Array(b), ver: m.rev, name: m.name }; });
					});
				});
			},
			write: function (ref, name, bytes, ver) {
				if (bytes.length > 140e6) return Promise.reject(err("other", "Files over 140 MB can't be saved to Dropbox from here."));
				var mode = ref && ver ? { ".tag": "update", update: ver } : { ".tag": "add" };
				var arg = JSON.stringify({ path: ref || "/" + DIR + "/" + name, mode: mode, autorename: false, mute: true }).replace(/[\u007f-￿]/g, function (c) { return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4); });
				return authed("dropbox", "https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": arg }, body: bytes }).then(function (r) {
					if (r.status === 409) throw err(ref ? "conflict" : "exists", ref ? "changed" : "A file called " + name + " is already there.");
					if (!r.ok) return failed(r, "Saving to Dropbox");
					return r.json().then(function (j) { return { ref: j.id, ver: j.rev, name: j.name }; });
				});
			}
		},
		onedrive: {
			name: "OneDrive", where: function (l) { return "OneDrive → Apps → MES Copy Text → " + DIR + " → " + (l ? l.name : ""); },
			ok: function () { return !!CLOUD.onedrive; },
			ms: "https://login.microsoftonline.com/common/oauth2/v2.0/", scope: "Files.ReadWrite.AppFolder offline_access",
			g: "https://graph.microsoft.com/v1.0/me/drive/",
			authUrl: function (ch, st) { return this.ms + "authorize?" + form({ client_id: CLOUD.onedrive, response_type: "code", redirect_uri: RELAY, response_mode: "query", scope: this.scope, code_challenge: ch, code_challenge_method: "S256", state: st }); },
			exchange: function (code, v) { return tokenCall(P.onedrive.ms + "token", { client_id: CLOUD.onedrive, grant_type: "authorization_code", code: code, redirect_uri: RELAY, code_verifier: v, scope: P.onedrive.scope }); },
			refresh: function (r) { return tokenCall(P.onedrive.ms + "token", { client_id: CLOUD.onedrive, grant_type: "refresh_token", refresh_token: r, scope: P.onedrive.scope }); },
			path: function (name) { return P.onedrive.g + "special/approot:/" + DIR + "/" + encodeURIComponent(name) + ":"; },
			list: function () {
				return authed("onedrive", P.onedrive.g + "special/approot:/" + DIR + ":/children?$select=id,name,size,eTag,lastModifiedDateTime,file&$top=500").then(function (r) {
					if (r.status === 404) return [];
					if (!r.ok) return failed(r, "Reading OneDrive");
					return r.json().then(function (j) { return (j.value || []).filter(function (e) { return e.file; }).map(function (e) { return { ref: e.id, name: e.name, size: e.size, mod: Date.parse(e.lastModifiedDateTime) || 0, ver: e.eTag }; }); });
				});
			},
			meta: function (ref) {
				return authed("onedrive", P.onedrive.g + "items/" + encodeURIComponent(ref) + "?$select=id,name,eTag").then(function (r) {
					if (r.status === 404) throw err("gone", "The file is no longer in OneDrive.");
					if (!r.ok) return failed(r, "Reading OneDrive");
					return r.json();
				});
			},
			head: function (ref) { return P.onedrive.meta(ref).then(function (m) { return m.eTag; }); },
			read: function (ref) {
				return P.onedrive.meta(ref).then(function (m) {
					return authed("onedrive", P.onedrive.g + "items/" + encodeURIComponent(ref) + "/content").then(function (d) {
						if (!d.ok) return failed(d, "Downloading from OneDrive");
						return d.arrayBuffer().then(function (b) { return { bytes: new Uint8Array(b), ver: m.eTag, name: m.name }; });
					});
				});
			},
			done: function (r) {
				if (r.status === 412) throw err("conflict", "changed");
				if (r.status === 409) throw err("exists", "A file with that name is already there.");
				if (!r.ok) return failed(r, "Saving to OneDrive");
				return r.json().then(function (j) { return { ref: j.id, ver: j.eTag, name: j.name }; });
			},
			write: function (ref, name, bytes, ver) {
				var me = P.onedrive, h = { "Content-Type": "application/octet-stream" };
				if (ref && ver) h["If-Match"] = ver;
				if (bytes.length <= 4e6) {
					var url = ref ? me.g + "items/" + encodeURIComponent(ref) + "/content" : me.path(name) + "/content?@microsoft.graph.conflictBehavior=fail";
					return authed("onedrive", url, { method: "PUT", headers: h, body: bytes }).then(me.done);
				}
				// bigger than 4 MB: an upload session, sent in 5 MB pieces (multiples of 320 KiB)
				var surl = ref ? me.g + "items/" + encodeURIComponent(ref) + "/createUploadSession" : me.path(name) + "/createUploadSession";
				var sh = { "Content-Type": "application/json" }; if (ref && ver) sh["If-Match"] = ver;
				return authed("onedrive", surl, { method: "POST", headers: sh, body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": ref ? "replace" : "fail" } }) }).then(function (r) {
					if (r.status === 412) throw err("conflict", "changed");
					if (r.status === 409) throw err("exists", "A file with that name is already there.");
					if (!r.ok) return failed(r, "Saving to OneDrive");
					return r.json();
				}).then(function (s) {
					var CH = 16 * 327680, n = bytes.length;
					function part(at) {
						var end = Math.min(at + CH, n);
						return fetch(s.uploadUrl, { method: "PUT", headers: { "Content-Range": "bytes " + at + "-" + (end - 1) + "/" + n }, body: bytes.subarray(at, end) }).then(function (r) {
							if (end < n) { if (r.status !== 202) return failed(r, "Saving to OneDrive"); return part(end); }
							return me.done(r);
						});
					}
					return part(0);
				});
			}
		},
		gdrive: {
			name: "Google Drive", where: function (l) { return "Google Drive (MES app storage) → " + (l ? l.name : ""); },
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
			signIn: function (again) {
				return this.gis().then(function () {
					return new Promise(function (res, rej) {
						var c = google.accounts.oauth2.initTokenClient({ client_id: CLOUD.gdrive, scope: "https://www.googleapis.com/auth/drive.appdata",
							callback: function (j) { if (j.error || !j.access_token) return rej(err("auth", j.error_description || j.error || "Google sign-in failed.")); res(saveTok("gdrive", j).a); },
							error_callback: function (e) { rej(err("auth", (e && e.message) || "The Google window was closed.")); } });
						c.requestAccessToken({ prompt: again ? "" : "consent" });
					});
				});
			},
			api: "https://www.googleapis.com/drive/v3/files", up: "https://www.googleapis.com/upload/drive/v3/files",
			list: function () {
				return authed("gdrive", P.gdrive.api + "?" + form({ spaces: "appDataFolder", q: "'appDataFolder' in parents and trashed=false", fields: "files(id,name,size,version,modifiedTime)", pageSize: 500 })).then(function (r) {
					if (!r.ok) return failed(r, "Reading Google Drive");
					return r.json().then(function (j) { return (j.files || []).map(function (f) { return { ref: f.id, name: f.name, size: +f.size || 0, mod: Date.parse(f.modifiedTime) || 0, ver: f.id + ":" + f.version }; }); });
				});
			},
			meta: function (ref) {
				return authed("gdrive", P.gdrive.api + "/" + encodeURIComponent(ref) + "?fields=id,name,version,trashed").then(function (r) {
					if (r.status === 404) throw err("gone", "The file is no longer in Google Drive.");
					if (!r.ok) return failed(r, "Reading Google Drive");
					return r.json().then(function (m) { if (m.trashed) throw err("gone", "The file was deleted."); return m; });
				});
			},
			head: function (ref) { return P.gdrive.meta(ref).then(function (m) { return m.id + ":" + m.version; }); },
			read: function (ref) {
				return P.gdrive.meta(ref).then(function (m) {
					return authed("gdrive", P.gdrive.api + "/" + encodeURIComponent(ref) + "?alt=media").then(function (d) {
						if (!d.ok) return failed(d, "Downloading from Google Drive");
						return d.arrayBuffer().then(function (b) { return { bytes: new Uint8Array(b), ver: m.id + ":" + m.version, name: m.name }; });
					});
				});
			},
			write: function (ref, name, bytes, ver) {
				var me = P.gdrive;
				var check = ref ? me.head(ref).then(function (now) { if (ver && now !== ver) throw err("conflict", "changed"); }) :
					me.list().then(function (all) { if (all.some(function (f) { return f.name === name; })) throw err("exists", "A file called " + name + " is already there."); });
				return check.then(function () {
					// resumable upload: one code path for any size; metadata first, then the bytes to the address Google gives back
					var meta = ref ? {} : { name: name, parents: ["appDataFolder"] };
					return authed("gdrive", me.up + (ref ? "/" + encodeURIComponent(ref) : "") + "?uploadType=resumable&fields=id,name,version", { method: ref ? "PATCH" : "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/octet-stream" }, body: JSON.stringify(meta) });
				}).then(function (r) {
					if (!r.ok) return failed(r, "Saving to Google Drive");
					var loc = r.headers.get("Location");
					if (!loc) throw err("other", "Google Drive did not give an upload address.");
					return fetch(loc, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
				}).then(function (r) {
					if (!r.ok) return failed(r, "Saving to Google Drive");
					return r.json().then(function (j) { return { ref: j.id, ver: j.id + ":" + j.version, name: j.name }; });
				});
			}
		}
	};
	["dropbox", "onedrive", "gdrive"].forEach(function (p) {
		P[p].connect = function () { return p === "gdrive" ? P.gdrive.signIn(!!tok(p)) : popupSignIn(p); };
		P[p].disconnect = function () {
			var t = tok(p);
			if (p === "dropbox" && t && t.a) fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: "Bearer " + t.a } }).catch(function () { });
			if (p === "gdrive" && t && t.a && window.google && google.accounts) try { google.accounts.oauth2.revoke(t.a, function () { }); } catch (e) { /* ignore */ }
			tok(p, null);
		};
	});
	/* ?cloudmock=1: stand-in accounts kept in localStorage (for testing the page without real sign-ins) */
	if (MOCK) ["dropbox", "onedrive", "gdrive"].forEach(function (p) {
		var K = "mes-cloud:mock:" + p;
		function all() { return ls(K) || {}; }
		function put(o) { ls(K, o); }
		function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }
		function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
		var wait = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 150); }); };
		Object.assign(P[p], {
			ok: function () { return true; },
			connect: function () { ls("mes-cloud:mock:on:" + p, 1); return wait(); },
			disconnect: function () { ls("mes-cloud:mock:on:" + p, null); },
			list: function () { var o = all(); return wait(Object.keys(o).map(function (k) { var f = o[k]; return { ref: k, name: f.name, size: f.size, mod: f.mod, ver: "v" + f.v }; })); },
			head: function (ref) { var f = all()[ref]; return f ? wait("v" + f.v) : Promise.reject(err("gone", "The file is gone.")); },
			read: function (ref) { var f = all()[ref]; return f ? wait({ bytes: unb64(f.b), ver: "v" + f.v, name: f.name }) : Promise.reject(err("gone", "The file is gone.")); },
			write: function (ref, name, bytes, ver) {
				var o = all();
				if (ref) { var f = o[ref]; if (!f) return Promise.reject(err("gone", "The file is gone.")); if (ver && "v" + f.v !== ver) return Promise.reject(err("conflict", "changed")); }
				else if (Object.keys(o).some(function (k) { return o[k].name === name; })) return Promise.reject(err("exists", "A file called " + name + " is already there."));
				var id = ref || "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), g = o[id] || { v: 0, name: name };
				g.v++; g.b = b64(bytes); g.size = bytes.length; g.mod = Date.now(); o[id] = g;
				try { put(o); } catch (e) { return Promise.reject(err("other", "Mock storage is full.")); }
				return wait({ ref: id, ver: "v" + g.v, name: g.name });
			}
		});
	});

	/* ---------- styles (one block for every page) ---------- */
	var CSS = [
		".mcl-btn{display:inline-flex;align-items:center;gap:.35em;font:inherit;font-size:.92em;line-height:1.2;padding:.42em .8em;border-radius:8px;border:1px solid #9aa7b8;background:#fff;color:#1d2a3a;cursor:pointer;white-space:nowrap}",
		".mcl-btn:hover{border-color:#3b6fd8;color:#1d4fb8}.mcl-btn:focus-visible{outline:2px solid #3b6fd8;outline-offset:2px}",
		".mcl-chip{font:inherit;font-size:.8em;padding:.3em .6em;border-radius:999px;border:1px solid transparent;cursor:pointer;white-space:nowrap;max-width:22em;overflow:hidden;text-overflow:ellipsis}",
		".mcl-chip.is-ok{background:#e3f4e8;color:#155a2c;border-color:#b5dfc2}.mcl-chip.is-due{background:#fff4d6;color:#6b4a00;border-color:#efd58a}.mcl-chip.is-err{background:#fde4e2;color:#8a1c12;border-color:#f2b8b1}",
		"#mcl-dlg{position:fixed;inset:0;z-index:2147483646;background:rgba(10,18,30,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}",
		"#mcl-dlg[hidden]{display:none}",
		"#mcl-dlg .mcl-box{background:#fff;color:#1d2a3a;width:min(46em,100%);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:1.1em 1.25em 1.25em;font-size:15px;line-height:1.45;text-align:left}",
		"#mcl-dlg .mcl-box *{color:inherit;box-sizing:border-box}",
		"#mcl-dlg h2{font-size:1.25em;margin:0 0 .5em;font-weight:700;display:flex;align-items:center;gap:.4em}",
		"#mcl-dlg h3{font-size:1em;margin:1.1em 0 .45em;font-weight:700}",
		"#mcl-dlg p{margin:.35em 0}#mcl-dlg .mcl-x{margin-left:auto;font-size:1.4em;line-height:1;background:none;border:0;cursor:pointer;padding:.1em .35em;border-radius:6px}",
		"#mcl-dlg .mcl-cur{border:1px solid #d5dde8;background:#f6f9fc;border-radius:10px;padding:.7em .85em}",
		"#mcl-dlg .mcl-cur.is-err{border-color:#f2b8b1;background:#fff5f4}#mcl-dlg .mcl-cur.is-due{border-color:#efd58a;background:#fffbef}",
		"#mcl-dlg .mcl-acts{display:flex;flex-wrap:wrap;gap:.45em;margin-top:.55em;align-items:center}",
		"#mcl-dlg .mcl-b{font:inherit;font-size:.92em;padding:.45em .85em;border-radius:8px;border:1px solid #9aa7b8;background:#fff;cursor:pointer}",
		"#mcl-dlg .mcl-b:hover{border-color:#3b6fd8}#mcl-dlg .mcl-b--p{background:#2856c4;border-color:#2856c4;color:#fff}#mcl-dlg .mcl-b--p:hover{background:#1d47a8}",
		"#mcl-dlg .mcl-b--g{background:none;border-color:transparent;text-decoration:underline}",
		"#mcl-dlg .mcl-b:disabled{opacity:.55;cursor:default}",
		"#mcl-dlg .mcl-tabs{display:flex;flex-wrap:wrap;gap:.3em;border-bottom:1px solid #d5dde8;margin-top:.4em}",
		"#mcl-dlg .mcl-tab{font:inherit;font-size:.92em;padding:.5em .8em;border:1px solid transparent;border-bottom:0;border-radius:8px 8px 0 0;background:none;cursor:pointer;margin-bottom:-1px}",
		"#mcl-dlg .mcl-tab[aria-selected=true]{border-color:#d5dde8;background:#fff;font-weight:700}",
		"#mcl-dlg .mcl-tab .mcl-dot{display:inline-block;width:.5em;height:.5em;border-radius:50%;background:#2e9d55;margin-left:.35em;vertical-align:middle}",
		"#mcl-dlg .mcl-pane{padding:.75em .1em 0}",
		"#mcl-dlg .mcl-list{list-style:none;margin:.4em 0;padding:0;max-height:16em;overflow:auto;border:1px solid #d5dde8;border-radius:8px}",
		"#mcl-dlg .mcl-list li{display:flex;align-items:center;gap:.5em;border-top:1px solid #e6ebf2}#mcl-dlg .mcl-list li:first-child{border-top:0}",
		"#mcl-dlg .mcl-item{flex:1;min-width:0;text-align:left;font:inherit;background:none;border:0;padding:.5em .7em;cursor:pointer;display:flex;flex-direction:column}",
		"#mcl-dlg .mcl-item:hover{background:#eef3fb}#mcl-dlg .mcl-item b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mcl-dlg .mcl-item small{opacity:.72}",
		"#mcl-dlg .mcl-forget{font:inherit;font-size:.82em;background:none;border:0;text-decoration:underline;cursor:pointer;padding:.3em .7em;opacity:.8}",
		"#mcl-dlg .mcl-row{display:flex;flex-wrap:wrap;gap:.45em;align-items:center;margin:.5em 0}",
		"#mcl-dlg input[type=text]{font:inherit;padding:.42em .6em;border:1px solid #9aa7b8;border-radius:8px;min-width:0;flex:1 1 14em;background:#fff}",
		"#mcl-dlg label.mcl-tick{display:inline-flex;align-items:center;gap:.35em;font-size:.92em;cursor:pointer}",
		"#mcl-dlg .mcl-note{font-size:.86em;opacity:.8}#mcl-dlg .mcl-err{color:#a3271b;font-size:.9em}#mcl-dlg .mcl-warn{background:#fff4d6;border:1px solid #efd58a;border-radius:8px;padding:.5em .7em;font-size:.9em}",
		"#mcl-dlg .mcl-where{font-size:.86em;opacity:.8;word-break:break-word}",
		"body.dark-mode .mcl-btn{background:#232a33;color:#e6edf5;border-color:#56616f}body.dark-mode .mcl-btn:hover{border-color:#7aa2f0;color:#a9c4ff}",
		"body.dark-mode .mcl-chip.is-ok{background:#163522;color:#a8e3bb;border-color:#2b6b42}body.dark-mode .mcl-chip.is-due{background:#3a2f0f;color:#f2d68a;border-color:#6d5a1c}body.dark-mode .mcl-chip.is-err{background:#3d1714;color:#f6b4ac;border-color:#7a2b23}",
		"body.dark-mode #mcl-dlg .mcl-box{background:#1d232b;color:#e6edf5}",
		"body.dark-mode #mcl-dlg .mcl-cur{background:#252d37;border-color:#3b4654}body.dark-mode #mcl-dlg .mcl-cur.is-err{background:#3a1b18;border-color:#7a2b23}body.dark-mode #mcl-dlg .mcl-cur.is-due{background:#352c12;border-color:#6d5a1c}",
		"body.dark-mode #mcl-dlg .mcl-b,body.dark-mode #mcl-dlg input[type=text]{background:#252d37;border-color:#56616f;color:#e6edf5}body.dark-mode #mcl-dlg .mcl-b--p{background:#3b6fd8;border-color:#3b6fd8;color:#fff}",
		"body.dark-mode #mcl-dlg .mcl-b--g{background:none;border-color:transparent}",
		"body.dark-mode #mcl-dlg .mcl-tabs{border-color:#3b4654}body.dark-mode #mcl-dlg .mcl-tab[aria-selected=true]{background:#1d232b;border-color:#3b4654}",
		"body.dark-mode #mcl-dlg .mcl-list{border-color:#3b4654}body.dark-mode #mcl-dlg .mcl-list li{border-color:#2f3843}body.dark-mode #mcl-dlg .mcl-item:hover{background:#2a3441}",
		"body.dark-mode #mcl-dlg .mcl-err{color:#f6a39a}body.dark-mode #mcl-dlg .mcl-warn{background:#352c12;border-color:#6d5a1c}"
	].join("\n");
	function addCss() { if (document.getElementById("mcl-css")) return; var s = document.createElement("style"); s.id = "mcl-css"; s.textContent = CSS; document.head.appendChild(s); }

	/* ---------- attach to a page ---------- */
	/* cfg: app (key), what ("spreadsheet"), exts ([".xlsx", ...] that can be opened), accept (picker types), defExt ("xlsx"),
	   mount (element the ☁ button goes into, before cfg.before), doc() current document object or null, name(doc), bytes(doc, name) -> Promise<Uint8Array>,
	   open(bytes, name, replaceDoc) -> Promise<doc>, dirty(doc), saved(doc, name), writeName(name) -> name this page can write (e.g. .xls -> .xlsx), toast(msg) */
	function attach(cfg) {
		addCss();
		var PREF = "mes-cloud:" + cfg.app, prefs = Object.assign({ auto: true, tab: "" }, ls(PREF) || {});
		function savePrefs() { ls(PREF, prefs); }
		var btn = document.createElement("button"); btn.type = "button"; btn.className = cfg.btnClass || "mcl-btn"; btn.id = "mcl-btn-" + cfg.app;
		btn.innerHTML = '<span aria-hidden="true">☁</span> Cloud'; btn.title = "Open from or save to OneDrive, Dropbox, Google Drive or a synced folder";
		btn.setAttribute("aria-haspopup", "dialog");
		var chip = document.createElement("button"); chip.type = "button"; chip.className = "mcl-chip"; chip.hidden = true;
		if (cfg.before && cfg.before.parentNode) { cfg.before.parentNode.insertBefore(btn, cfg.before); cfg.before.parentNode.insertBefore(chip, cfg.before); }
		else { cfg.mount.appendChild(btn); cfg.mount.appendChild(chip); }
		var dlg = document.getElementById("mcl-dlg");
		if (!dlg) { dlg = document.createElement("div"); dlg.id = "mcl-dlg"; dlg.hidden = true; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-label", "Cloud files"); document.body.appendChild(dlg); }
		var lastErr = null, busy = "", listCache = {}, listErr = {}, saving = null, timer = null, conflictDoc = null, hidden = false;
		var toast = cfg.toast || function () { };
		function L(d) { return d && d.__mcl; }
		function setL(d, l) { if (d) d.__mcl = l; }
		function recent() { return ls(PREF + ":recent") || []; }
		function addRecent(l) {
			var item = { p: l.p, ref: l.p === "file" ? "h:" + l.hid : l.ref, name: l.name, t: Date.now() };
			ls(PREF + ":recent", H.pushRecent(recent(), item, 12));
		}
		function provName(p) { return P[p] ? P[p].name : p; }

		/* ----- saving ----- */
		function save(d, opts) {
			opts = opts || {};
			var l = L(d); if (!l) return Promise.resolve(false);
			if (saving) { saving.again = true; return saving.p; }
			clearTimeout(timer);
			var name = l.name, cur = { again: false };
			cur.p = Promise.resolve().then(function () { return cfg.bytes(d, name); }).then(function (bytes) {
				bytes = u8of(bytes);
				var ver = opts.force ? opts.force : l.ver;
				return P[l.p].write(l.ref, name, bytes, ver, !!opts.ask);
			}).then(function (w) {
				if (L(d) !== l) return true;       // unlinked meanwhile
				l.ver = w.ver; l.at = Date.now(); l.err = null; l.code = null; l.remote = null; listCache[l.p] = null;
				if (l.p !== "file") l.ref = w.ref;
				cfg.saved(d, name);
				lastErr = null;
				return true;
			}).catch(function (e) {
				l.code = e.code || (navigator.onLine === false || (e && e.name === "TypeError") ? "offline" : "other");
				l.err = l.code === "offline" ? "No connection" : e.message || String(e);
				if (l.code === "conflict") { conflictDoc = d; if (!opts.quiet || !dlg.hidden) open(); }
				return false;
			}).then(function (ok) {
				saving = null; paint();
				if (cur.again && cfg.dirty(d)) schedule(d, 1500);
				return ok;
			});
			saving = cur; paint();
			return cur.p;
		}
		function schedule(d, ms) {
			clearTimeout(timer);
			var l = L(d); if (!l || !prefs.auto || l.code === "conflict" || l.code === "perm" || l.code === "auth" || l.code === "gone") return;
			timer = setTimeout(function () { if (cfg.doc() === d && cfg.dirty(d)) save(d, { quiet: true }); }, ms);
		}
		// does the linked file still match what we last saw? (focus / every minute while visible)
		function check(d) {
			var l = L(d); if (!l || saving || l.code === "conflict" || !l.ver) return;
			if (l.p !== "file" && !signedIn(l.p)) return;
			Promise.resolve().then(function () { return P[l.p].head(l.ref); }).then(function (v) {
				if (L(d) !== l) return;
				if (v !== l.ver) { l.remote = v; if (l.code === "offline") { l.code = null; l.err = null; } }
				else if (l.code === "offline") { l.code = null; l.err = null; if (cfg.dirty(d)) schedule(d, 500); }
				paint();
			}, function (e) {
				if (e && e.code === "gone") { l.code = "gone"; l.err = e.message; paint(); }
			});
		}

		/* ----- opening ----- */
		function openFrom(p, ref, name, replace) {
			busy = "Opening " + name + "…"; lastErr = null; paint();
			return P[p].read(ref, true).then(function (r) {
				return Promise.resolve(cfg.open(r.bytes, r.name || name, replace)).then(function (d) {
					if (!d) throw err("other", "The page could not open " + (r.name || name) + ".");
					var wn = cfg.writeName ? cfg.writeName(r.name || name) : r.name || name;
					var l = { p: p, ref: ref, name: r.name || name, ver: r.ver, at: Date.now() };
					if (p === "file") l.hid = ref.__mclId || null;
					if (wn !== l.name) { l = null; toast("Opened " + (r.name || name) + ". This format can't be saved back, so saving will make " + wn + "."); }
					setL(d, l);
					if (l) addRecent(l);
					busy = ""; close(); paint();
					return d;
				});
			}).catch(function (e) { busy = ""; lastErr = e.message || String(e); paint(); });
		}
		function rememberHandle(h) {
			var id = h.__mclId || ("h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
			h.__mclId = id;
			return hkv("put", id, h).then(function () { return id; }, function () { return id; });
		}
		function pickOpen() {
			if (!window.showOpenFilePicker) { lastErr = noFsText(); paint(); return; }
			window.showOpenFilePicker({ types: cfg.accept, multiple: false }).then(function (a) {
				var h = a[0];
				return rememberHandle(h).then(function (id) { h.__mclId = id; return openFrom("file", h, h.name); });
			}).catch(function (e) { if (e && e.name !== "AbortError") { lastErr = e.message; paint(); } });
		}

		/* ----- linking the current document to a new place ----- */
		function saveNew(p, name) {
			var d = cfg.doc(); if (!d) return;
			name = H.safeName(cfg.writeName ? cfg.writeName(name) : name, cfg.defExt);
			busy = "Saving " + name + " to " + provName(p) + "…"; lastErr = null; paint();
			return Promise.resolve().then(function () { return cfg.bytes(d, name); }).then(function (bytes) { return P[p].write(null, name, u8of(bytes), null); }).then(function (w) {
				var l = { p: p, ref: w.ref, name: w.name || name, ver: w.ver, at: Date.now() };
				setL(d, l); addRecent(l); cfg.saved(d, l.name); listCache[p] = null;
				busy = ""; toast("Saved to " + provName(p) + ": " + l.name); paint();
			}).catch(function (e) {
				busy = "";
				lastErr = e.code === "exists" ? e.message + " Pick another name, or open that file first." : e.message || String(e);
				paint();
			});
		}
		function pickSave() {
			var d = cfg.doc(); if (!d) return;
			if (!window.showSaveFilePicker) { lastErr = noFsText(); paint(); return; }
			var name = H.safeName(cfg.writeName ? cfg.writeName(cfg.name(d)) : cfg.name(d), cfg.defExt);
			window.showSaveFilePicker({ suggestedName: name, types: cfg.accept.filter(function (t) { return Object.keys(t.accept).some(function (k) { return t.accept[k].indexOf("." + H.extOf(name)) >= 0; }); }).slice(0, 1).concat([]) }).then(function (h) {
				return rememberHandle(h).then(function (id) {
					busy = "Saving " + h.name + "…"; paint();
					return Promise.resolve().then(function () { return cfg.bytes(d, h.name); }).then(function (bytes) { return P.file.write(h, h.name, u8of(bytes), null, true); }).then(function (w) {
						var l = { p: "file", ref: h, hid: id, name: h.name, ver: w.ver, at: Date.now() };
						setL(d, l); addRecent(l); cfg.saved(d, h.name);
						busy = ""; toast("Saved " + h.name + ": every change is now saved there"); paint();
					});
				});
			}).catch(function (e) { busy = ""; if (e && e.name !== "AbortError") lastErr = e.message || String(e); paint(); });
		}
		function noFsText() {
			var brave = navigator.brave || /Brave/.test(navigator.userAgent);
			return brave ? "Brave hides this: turn on brave://flags/#file-system-access-api (copy it into the address bar), restart Brave and come back." :
				"This browser can't keep a file on your computer up to date (it works in Chrome, Edge and Opera on a computer). Use a cloud account instead.";
		}
		function openRecent(r) {
			if (r.p === "file") {
				var id = String(r.ref).slice(2);
				return hkv("get", id).then(function (h) {
					if (!h) throw err("gone", "This browser no longer has that file. Open it again with “Open a file on this computer”.");
					h.__mclId = id;
					return openFrom("file", h, r.name);
				}).catch(function (e) { lastErr = e.message; paint(); });
			}
			if (!signedIn(r.p)) { prefs.tab = r.p; savePrefs(); lastErr = "Connect " + provName(r.p) + " first, then open the file."; paint(); return; }
			return openFrom(r.p, r.ref, r.name);
		}

		/* ----- conflict ----- */
		function resolve(how) {
			var d = conflictDoc || cfg.doc(), l = L(d); if (!d || !l) return;
			conflictDoc = null;
			if (how === "mine") {
				busy = "Saving your version…"; paint();
				P[l.p].head(l.ref).then(function (v) { busy = ""; return save(d, { force: v, ask: true }); }, function (e) { busy = ""; l.err = e.message; paint(); });
			} else if (how === "theirs") {
				openFrom(l.p, l.ref, l.name, d);
			} else if (how === "copy") {
				var nm = H.copyName(l.name);
				l.code = null; l.err = null;
				if (l.p === "file") { setL(d, null); paint(); pickSave(); return; }
				saveNew(l.p, nm);
			}
		}

		/* ----- the dialog ----- */
		function curBox() {
			var d = cfg.doc(), l = L(d), h = "";
			if (!d) return '<div class="mcl-cur"><p>No ' + esc(cfg.what) + " open yet. Open one from your cloud below, or open a file on this page first and come back to save it.</p></div>";
			if (!l) {
				return '<div class="mcl-cur"><p><b>' + esc(cfg.name(d)) + "</b> is only on this device. Save it to one of the places below and every change is saved there" + (prefs.auto ? " automatically" : " when you press Save") + ".</p></div>";
			}
			var cls = "", st;
			if (saving) st = "⟳ Saving…";
			else if (l.code === "conflict") { cls = "is-err"; st = "⚠ This file was changed somewhere else since you opened it. What should happen?"; }
			else if (l.code === "gone") { cls = "is-err"; st = "⚠ " + esc(l.err); }
			else if (l.code === "auth" || l.code === "perm") { cls = "is-err"; st = "⚠ " + esc(l.err); }
			else if (l.code === "offline") { cls = "is-due"; st = "⚠ Can't reach " + esc(provName(l.p)) + " right now. Your changes are kept here; press Save now when you are back online."; }
			else if (l.code) { cls = "is-err"; st = "⚠ " + esc(l.err); }
			else if (l.remote) { cls = "is-due"; st = cfg.dirty(d) ? "⚠ Someone (or another device) changed this file too. Saving will ask what to keep." : "⚠ This file was changed somewhere else."; }
			else if (cfg.dirty(d)) { cls = "is-due"; st = "● Changes not saved yet" + (prefs.auto ? " (saving in a moment)" : ""); }
			else st = "✓ Saved" + (l.at ? " · " + H.ago(l.at) : "");
			h += '<div class="mcl-cur ' + cls + '"><p><b>' + esc(l.name) + "</b> is linked to " + esc(l.p === "file" ? "a file on this computer" : provName(l.p)) + '.</p><p class="mcl-where">' + esc(P[l.p].where(l)) + "</p><p>" + st + "</p>";
			h += '<div class="mcl-acts">';
			if (l.code === "conflict") h += '<button type="button" class="mcl-b mcl-b--p" data-a="mine">Keep mine (replace theirs)</button><button type="button" class="mcl-b" data-a="theirs">Open theirs</button><button type="button" class="mcl-b" data-a="copy">Save mine as a copy</button>';
			else if (l.code === "auth" && l.p !== "file") h += '<button type="button" class="mcl-b mcl-b--p" data-a="relog">Sign in again</button>';
			else if (l.remote && !cfg.dirty(d)) h += '<button type="button" class="mcl-b mcl-b--p" data-a="theirs">Open the newer version</button><button type="button" class="mcl-b" data-a="now">Save mine over it</button>';
			else h += '<button type="button" class="mcl-b mcl-b--p" data-a="now"' + (saving ? " disabled" : "") + ">Save now</button>";
			h += '<label class="mcl-tick"><input type="checkbox" data-a="auto"' + (prefs.auto ? " checked" : "") + "> Save automatically after each change</label>";
			h += '<button type="button" class="mcl-b mcl-b--g" data-a="unlink">Unlink</button></div></div>';
			return h;
		}
		function provPane(p) {
			var d = cfg.doc(), h = "", nm = d ? H.safeName(cfg.writeName ? cfg.writeName(cfg.name(d)) : cfg.name(d), cfg.defExt) : "";
			if (p === "file") {
				h += "<p>Use a file on this computer. Inside your <b>OneDrive</b>, <b>Dropbox</b>, <b>Google Drive</b> or <b>iCloud Drive</b> folder, the service's own app uploads every change, and the file stays exactly where you see it in that service.</p>";
				if (!P.file.ok()) return h + '<p class="mcl-warn">' + esc(noFsText()) + "</p>";
				h += '<div class="mcl-acts"><button type="button" class="mcl-b mcl-b--p" data-a="fopen">Open a file on this computer…</button>' + (d ? '<button type="button" class="mcl-b" data-a="fsave">Save this ' + esc(cfg.what) + " as a file…</button>" : "") + "</div>";
				h += '<p class="mcl-note">After a browser restart, the browser asks once more for your OK to use the file.</p>';
				return h;
			}
			var pr = P[p];
			if (!pr.ok()) return "<p>Not available.</p>";
			if (!signedIn(p)) {
				h += "<p>Connect your " + esc(pr.name) + " account to open and save " + esc(cfg.what) + "s on any device, phones too. " + (p === "gdrive" ? "Files go in MES's own private storage in your Google Drive (they don't show in your Drive's file list; open them here on any device)." : "Files go in <b>Apps → MES Copy Text → " + DIR + "</b> in your " + esc(pr.name) + ".") + "</p>";
				if (!MOCK && location.hostname !== "mes.fm" && p !== "gdrive") h += '<p class="mcl-warn">Signing in only works on mes.fm itself.</p>';
				h += '<div class="mcl-acts"><button type="button" class="mcl-b mcl-b--p" data-a="connect" data-p="' + p + '">Connect ' + esc(pr.name) + "</button></div>";
				h += '<p class="mcl-note">Already connected on the Copy Text page? Then this is connected too. The sign-in stays in this browser; mes.fm never sees your files.</p>';
				return h;
			}
			if (d) h += '<div class="mcl-row"><input type="text" id="mcl-name" value="' + esc(nm) + '" aria-label="File name"><button type="button" class="mcl-b mcl-b--p" data-a="savehere" data-p="' + p + '">Save this ' + esc(cfg.what) + " here</button></div>";
			h += "<h3>Open a " + esc(cfg.what) + " from " + esc(pr.name) + "</h3>";
			var lst = listCache[p];
			if (listErr[p]) h += '<p class="mcl-err">' + esc(listErr[p]) + '</p><div class="mcl-acts"><button type="button" class="mcl-b" data-a="relist" data-p="' + p + '">Try again</button>' + (/sign|auth|ran out|confirm/i.test(listErr[p]) ? '<button type="button" class="mcl-b" data-a="connect" data-p="' + p + '">Sign in again</button>' : "") + "</div>";
			else if (!lst) h += '<p class="mcl-note">Loading the list…</p>';
			else {
				var fs = H.filesFor(lst, cfg.exts);
				if (!fs.length) h += '<p class="mcl-note">No ' + esc(cfg.what) + "s here yet." + (d ? " Save this one with the button above." : "") + "</p>";
				else h += '<ul class="mcl-list">' + fs.map(function (f) { return '<li><button type="button" class="mcl-item" data-a="openf" data-p="' + p + '" data-ref="' + esc(f.ref) + '" data-n="' + esc(f.name) + '"><b>' + esc(f.name) + "</b><small>" + esc(H.fmtBytes(f.size)) + (f.mod ? " · " + esc(new Date(f.mod).toLocaleString()) : "") + "</small></button></li>"; }).join("") + "</ul>";
				h += '<div class="mcl-acts"><button type="button" class="mcl-b mcl-b--g" data-a="relist" data-p="' + p + '">Refresh</button></div>';
			}
			h += '<p class="mcl-where">Where: ' + esc(p === "gdrive" ? "Google Drive, MES's private app storage" : pr.name + " → Apps → MES Copy Text → " + DIR) + '. <button type="button" class="mcl-b mcl-b--g" data-a="disconnect" data-p="' + p + '">Disconnect ' + esc(pr.name) + "</button></p>";
			return h;
		}
		var TABS = [["onedrive", "OneDrive"], ["dropbox", "Dropbox"], ["gdrive", "Google Drive"], ["file", "Synced folder / this computer"]];
		function paintDlg() {
			if (dlg.hidden || dlg.__owner !== cfg.app) return;
			var tabs = TABS.filter(function (t) { return t[0] === "file" || P[t[0]].ok(); });
			if (!tabs.some(function (t) { return t[0] === prefs.tab; })) prefs.tab = tabs.filter(function (t) { return t[0] !== "file" && signedIn(t[0]); }).map(function (t) { return t[0]; })[0] || (P.file.ok() ? "file" : tabs[0][0]);
			var h = '<div class="mcl-box"><h2><span aria-hidden="true">☁</span> Cloud files <button type="button" class="mcl-x" data-a="close" aria-label="Close">×</button></h2>' + curBox();
			if (busy) h += '<p class="mcl-note">⟳ ' + esc(busy) + (pending ? ' <button type="button" class="mcl-b mcl-b--g" data-a="cancel">Cancel</button>' : "") + "</p>";
			if (lastErr) h += '<p class="mcl-err">⚠ ' + esc(lastErr) + "</p>";
			h += '<div class="mcl-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" class="mcl-tab" role="tab" data-a="tab" data-p="' + t[0] + '" aria-selected="' + (t[0] === prefs.tab) + '">' + esc(t[1]) + (t[0] !== "file" && signedIn(t[0]) ? '<span class="mcl-dot" title="Connected"></span>' : "") + "</button>"; }).join("") + "</div>";
			h += '<div class="mcl-pane" role="tabpanel">' + provPane(prefs.tab) + "</div>";
			var rc = recent();
			if (rc.length) h += "<h3>Recent cloud files</h3><ul class=\"mcl-list\">" + rc.map(function (r, i) { return '<li><button type="button" class="mcl-item" data-a="recent" data-i="' + i + '"><b>' + esc(r.name) + "</b><small>" + esc(r.p === "file" ? "this computer" : provName(r.p)) + " · " + esc(H.ago(r.t)) + '</small></button><button type="button" class="mcl-forget" data-a="forget" data-i="' + i + '">Forget</button></li>'; }).join("") + "</ul>";
			h += '<p class="mcl-note">Nothing goes through mes.fm: your browser reads and writes the file in your own storage. If the file is changed on another device, you are asked before anything is replaced.</p></div>';
			var fo = document.activeElement, fid = fo && dlg.contains(fo) ? fo.getAttribute("data-a") + "|" + (fo.getAttribute("data-p") || "") + "|" + (fo.id || "") : "";
			var nameVal = document.getElementById("mcl-name"); nameVal = nameVal ? nameVal.value : null;
			dlg.innerHTML = h;
			if (nameVal != null && document.getElementById("mcl-name")) document.getElementById("mcl-name").value = nameVal;
			if (fid) { var parts = fid.split("|"), el = parts[2] ? document.getElementById(parts[2]) : dlg.querySelector('[data-a="' + parts[0] + '"]' + (parts[1] ? '[data-p="' + parts[1] + '"]' : "")); if (el) el.focus(); }
			if (prefs.tab !== "file" && signedIn(prefs.tab) && !listCache[prefs.tab] && !listErr[prefs.tab]) loadList(prefs.tab);
		}
		function loadList(p) {
			if (loadList[p]) return; loadList[p] = 1;
			Promise.resolve().then(function () { return P[p].list(); }).then(function (a) { listCache[p] = a; listErr[p] = null; }, function (e) { listErr[p] = e.message || String(e); })
				.then(function () { loadList[p] = 0; paintDlg(); });
		}
		function open() { dlg.__owner = cfg.app; dlg.hidden = false; btn.setAttribute("aria-expanded", "true"); paintDlg(); var f = dlg.querySelector(".mcl-box .mcl-b--p, .mcl-box .mcl-tab"); if (f) f.focus(); }
		function close() { if (dlg.__owner !== cfg.app) return; dlg.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus({ preventScroll: true }); }
		dlg.addEventListener("click", function (e) {
			if (dlg.__owner !== cfg.app) return;
			if (e.target === dlg) { close(); return; }
			var b = e.target.closest("[data-a]"); if (!b || b.type === "checkbox") return;
			var a = b.getAttribute("data-a"), p = b.getAttribute("data-p"), d = cfg.doc();
			lastErr = null;
			if (a === "close") close();
			else if (a === "tab") { prefs.tab = p; savePrefs(); paintDlg(); }
			else if (a === "connect") {
				busy = "Signing in to " + provName(p) + "…"; paintDlg();
				P[p].connect().then(function () { busy = ""; listCache[p] = null; listErr[p] = null; d = cfg.doc(); if (L(d) && L(d).p === p && L(d).code === "auth") { L(d).code = null; L(d).err = null; } paintDlg(); paint(); },
					function (x) { busy = ""; if (x.code !== "abort") lastErr = x.message; paintDlg(); });
			}
			else if (a === "cancel") { if (pending) pending.cancel(); }
			else if (a === "disconnect") { if (confirm("Disconnect " + provName(p) + " in this browser?\n\nThis also disconnects it on the Copy Text page. Your files stay where they are.")) { P[p].disconnect(); listCache[p] = null; paintDlg(); paint(); } }
			else if (a === "relist") { listCache[p] = null; listErr[p] = null; paintDlg(); }
			else if (a === "openf") { if (!confirmLeave(d)) return; openFrom(p, b.getAttribute("data-ref"), b.getAttribute("data-n")); }
			else if (a === "savehere") { var nm = document.getElementById("mcl-name"); saveNew(p, nm ? nm.value : cfg.name(d)); }
			else if (a === "fopen") { if (confirmLeave(d)) pickOpen(); }
			else if (a === "fsave") pickSave();
			else if (a === "recent") { var r = recent()[+b.getAttribute("data-i")]; if (r && confirmLeave(d)) openRecent(r); }
			else if (a === "forget") { var all = recent(), gone = all.splice(+b.getAttribute("data-i"), 1)[0]; ls(PREF + ":recent", all); if (gone && gone.p === "file") hkv("del", String(gone.ref).slice(2)).catch(function () { }); paintDlg(); }
			else if (a === "now") { if (L(d)) { var l = L(d); if (l.remote && !l.code) { l.ver = l.remote; l.remote = null; } l.code = l.code === "conflict" ? "conflict" : null; save(d, { ask: true }); } }
			else if (a === "mine" || a === "theirs" || a === "copy") { if (a === "theirs" && cfg.dirty(d) && !confirm("Open the other version? Your changes here will be lost (unless you save them as a copy first).")) return; resolve(a); }
			else if (a === "relog") { var lp = L(d).p; if (lp === "gdrive") P.gdrive.signIn(true).then(function () { L(d).code = null; L(d).err = null; save(d, { ask: true }); }, function (x) { lastErr = x.message; paintDlg(); }); else { prefs.tab = lp; savePrefs(); b.setAttribute("data-p", lp); b.setAttribute("data-a", "connect"); b.click(); } }
			else if (a === "unlink") { if (confirm("Stop saving " + (L(d) ? L(d).name : "this file") + " to " + (L(d) ? provName(L(d).p) : "the cloud") + "?\n\nThe file stays where it is; this page keeps your copy.")) { setL(d, null); paint(); } }
		});
		dlg.addEventListener("change", function (e) { if (dlg.__owner !== cfg.app) return; if (e.target.getAttribute("data-a") === "auto") { prefs.auto = e.target.checked; savePrefs(); var d = cfg.doc(); if (prefs.auto && d && cfg.dirty(d)) schedule(d, 800); paint(); } });
		dlg.addEventListener("keydown", function (e) {
			if (dlg.__owner !== cfg.app) return;
			if (e.key === "Escape") { e.stopPropagation(); close(); }
			if (e.key === "Enter" && e.target.id === "mcl-name") { var b = dlg.querySelector('[data-a="savehere"]'); if (b) b.click(); }
		});
		function confirmLeave(d) { return !(cfg.replaces && d && cfg.dirty(d) && !L(d) && !confirm("You have changes here that are not saved. Open another file anyway?")); }
		btn.onclick = function () { if (dlg.hidden) open(); else close(); };
		chip.onclick = open;

		/* ----- the status chip next to the button ----- */
		function paint() {
			var d = cfg.doc(), l = L(d);
			if (!l) { chip.hidden = true; } else {
				var cls, t;
				if (saving) { cls = "is-due"; t = "⟳ Saving to " + provName(l.p) + "…"; }
				else if (l.code === "conflict") { cls = "is-err"; t = "⚠ Changed elsewhere: choose"; }
				else if (l.code === "auth" || l.code === "perm") { cls = "is-err"; t = l.code === "perm" ? "⚠ Allow saving" : "⚠ Sign in again"; }
				else if (l.code === "offline") { cls = "is-due"; t = "⚠ Offline: not saved"; }
				else if (l.code) { cls = "is-err"; t = "⚠ Not saved"; }
				else if (l.remote) { cls = "is-due"; t = "⚠ Newer version elsewhere"; }
				else if (cfg.dirty(d)) { cls = "is-due"; t = "● Not saved yet"; }
				else { cls = "is-ok"; t = "✓ Saved to " + (l.p === "file" ? l.name : provName(l.p)); }
				chip.hidden = false; chip.className = "mcl-chip " + cls; chip.textContent = t;
				chip.title = l.name + " · " + P[l.p].where(l) + (l.err ? " · " + l.err : "");
			}
			paintDlg();
		}
		document.addEventListener("visibilitychange", function () {
			hidden = document.hidden;
			var d = cfg.doc(), l = L(d); if (!l) return;
			if (hidden) { if (cfg.dirty(d) && prefs.auto && !l.code) save(d, { quiet: true }); } else check(d);
		});
		window.addEventListener("online", function () { var d = cfg.doc(); if (L(d) && L(d).code === "offline") { L(d).code = null; if (cfg.dirty(d)) schedule(d, 300); paint(); } });
		setInterval(function () { var d = cfg.doc(); if (!hidden && L(d)) { if (!cfg.dirty(d)) check(d); paint(); } }, 60000);

		return {
			linked: function (d) { return !!L(d || cfg.doc()); },
			link: function (d) { return L(d || cfg.doc()) || null; },
			changed: function (d) { d = d || cfg.doc(); if (L(d)) { paint(); schedule(d, 3000); } },
			// Ctrl+S: save a linked document now; returns false when not linked (the page does its usual download)
			save: function (d) { d = d || cfg.doc(); if (!L(d)) return false; var l = L(d); if (l.code === "conflict" || l.remote) { open(); return true; } l.code = null; save(d, { ask: true }).then(function (ok) { if (ok) toast("Saved to " + (l.p === "file" ? l.name : provName(l.p))); }); return true; },
			open: open, refresh: paint,
			unsaved: function (d) { d = d || cfg.doc(); return !!(L(d) && (cfg.dirty(d) || saving)); },
			providers: P
		};
	}
	window.MESCloud = { attach: attach, H: H, providers: P, signedIn: signedIn };
})();
