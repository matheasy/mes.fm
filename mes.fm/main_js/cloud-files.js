/* MES Cloud Files (window.MESCloud): open a document from, and keep it saved to, the person's own cloud storage, written
 * straight from the browser (never through mes.fm). Used by mes.fm/excel and mes.fm/docx (and any page that can turn its
 * document into bytes). Same ideas as Copy Text's ☁ Sync (tool_apps_src/copy-text/sync.js), but for whole files:
 *   file      a file on this computer, e.g. inside the OneDrive / Dropbox / Google Drive / iCloud folder, which the service's
 *             desktop app uploads (File System Access API: Chrome, Edge, Opera on a computer; Brave behind its flag).
 *   dropbox / onedrive / gdrive   the account itself, with the SAME app registrations as Copy Text. Each page saves into
 *             its own folder, default "MES Apps/<App>" (cfg.folder), which the person can browse / change (prefs.dirs[p]).
 *             OneDrive = Files.ReadWrite (whole drive, so the folder is a normal one; token "mes-cloud:tok:onedrive"),
 *             Google = drive.file (only files this app made, shown in My Drive; token "mes-cloud:tok:gdrive"),
 *             Dropbox = its app folder Apps/MES Copy Text (the app's type can't change), folder inside it; token shared with Copy Text.
 *             Dropbox / Microsoft sign-in happens on the page itself, like Copy Text: the page goes to Dropbox / Microsoft and
 *             comes back to its own address (registered with them: HERE below). Before it leaves, the open document is kept in
 *             IndexedDB ("stash:<app>", as the bytes the page saves) and opened again on return, then the Cloud window opens on
 *             that service. A page whose address is not registered yet (HERE_READY false) falls back to the old pop-up that lands
 *             on /copy-text (the relay at the top of copy-text/sync.js). Google's sign-in is always Google's own small window.
 * Each linked document remembers {p, ref, name, ver}; a save sends the version it last saw, so a file changed on another
 * device is never overwritten without asking (Keep mine / Open theirs / Save mine as a copy). Auto-save after changes,
 * a check for changes elsewhere when the tab gets focus. Pure helpers are exported for node tests.
 */
(function () {
	"use strict";
	var H = {
		extOf: function (n) { var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(n || "")); return m ? m[1].toLowerCase() : ""; },
		baseName: function (n) { return String(n || "").replace(/\.[A-Za-z0-9]{1,8}$/, ""); },
		accepts: function (name, exts) { var e = H.extOf(name); return exts.some(function (x) { return x.replace(/^\./, "").toLowerCase() === e; }); },
		// a file name the services accept: no slashes / control characters / reserved Windows characters, not empty, <= 200 chars
		safeName: function (n, fallbackExt) {
			var s = String(n || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
			s = s.replace(/(\.[A-Za-z0-9]{1,8})\1+$/i, "$1");
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
	var RELAY = "https://mes.fm/copy-text", DIR = "MES Apps";
	/* Pages that sign in on themselves: each address must be in the Dropbox app's Redirect URIs and the Entra app's SPA redirect URIs.
	   Flip HERE_READY to true for a service once all of them are registered there. */
	var HERE = ["/pdf", "/excel", "/docx", "/text", "/photo", "/draw", "/3d-studio", "/video", "/watch"];
	var HERE_READY = Object.assign({ dropbox: false, onedrive: false }, window.MES_CLOUD_HERE || {});
	function hereUri() { var pth = location.pathname.replace(/\/(index\.html)?$/, "") || "/"; return HERE.indexOf(pth) >= 0 && /^https:\/\/mes\.fm$/.test(location.origin) ? location.origin + pth : ""; }
	function tokKey(p) { return p === "dropbox" ? "mes-copytext:v1:tok:dropbox" : "mes-cloud:tok:" + p; }
	function segs(f) { return String(f == null ? DIR : f).split("/").map(function (x) { return x.trim(); }).filter(Boolean); }
	function encPath(f) { return segs(f).map(encodeURIComponent).join("/"); }
	function gq(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
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

	/* ---------- sign-in ---------- */
	function tok(p, v) { return v === undefined ? ls(tokKey(p)) : ls(tokKey(p), v); }
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
	// Dropbox / Microsoft on the page itself: keep the document, go there, come back here (see the header)
	function hereSignIn(p, app, stash) {
		var ru = hereUri(), verifier = rnd(48), state = rnd(16);
		return Promise.resolve().then(function () { return stash ? stash() : null; }).catch(function () { return null; }).then(function (doc) {
			window.__mesCloudLeaving = doc !== false;              // kept: pages skip their "leave this page?" question
			return (doc ? hkv("put", "stash:" + app, doc).catch(function () { }) : hkv("del", "stash:" + app).catch(function () { })).then(function () {
				return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
			});
		}).then(function (h) {
			ls("mes-cloud:here:" + state, { p: p, app: app, v: verifier, ru: ru, t: Date.now() });
			location.assign(P[p].authUrl(b64url(h), state, ru));
			return new Promise(function () { });          // the page is going away
		});
	}
	// back from Dropbox / Microsoft: take ?code=&state= out of the address bar at once, then trade the code for a token
	var RETURN = null;
	function takeReturn() {
		try {
			var q = new URLSearchParams(location.search), st = q.get("state"); if (!st) return null;
			var info = ls("mes-cloud:here:" + st); if (!info) return null;
			ls("mes-cloud:here:" + st, null);
			var got = { info: info, code: q.get("code"), error: q.get("error"), desc: q.get("error_description") };
			["code", "state", "error", "error_description", "error_uri", "session_state", "client_info"].forEach(function (k) { q.delete(k); });
			var rest = q.toString(); history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
			if (Date.now() - (info.t || 0) > 900000) return null;      // older than 15 minutes: ignore
			if (MOCK && got.code) { got.token = Promise.resolve(ls("mes-cloud:mock:on:" + info.p, true)); return got; }   // ?cloudmock=1: a pretend return
			got.token = got.code ? P[info.p].exchange(got.code, info.v, info.ru).then(function (j) { saveTok(info.p, j); }) : Promise.reject(err("auth", (got.desc || got.error || "The sign-in was cancelled.")));
			got.token.catch(function () { });
			return got;
		} catch (e) { return null; }
	}

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
			name: "Dropbox", root: ["Apps", "MES Copy Text"], where: function (l) { return "Dropbox › Apps › MES Copy Text › " + segs(l && l.dir).join(" › ") + " › " + (l ? l.name : ""); },
			ok: function () { return !!CLOUD.dropbox; },
			authUrl: function (ch, st, ru) { return "https://www.dropbox.com/oauth2/authorize?" + form({ client_id: CLOUD.dropbox, response_type: "code", code_challenge: ch, code_challenge_method: "S256", redirect_uri: ru || RELAY, token_access_type: "offline", state: st }); },
			exchange: function (code, v, ru) { return tokenCall("https://api.dropboxapi.com/oauth2/token", { grant_type: "authorization_code", code: code, client_id: CLOUD.dropbox, code_verifier: v, redirect_uri: ru || RELAY }); },
			refresh: function (r) { return tokenCall("https://api.dropboxapi.com/oauth2/token", { grant_type: "refresh_token", refresh_token: r, client_id: CLOUD.dropbox }); },
			api: function (path, body) { return authed("dropbox", "https://api.dropboxapi.com/2/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); },
			kids: function (folder) {
				var f = segs(folder).join("/");
				return P.dropbox.api("files/list_folder", { path: f ? "/" + f : "", limit: 500 }).then(function (r) {
					if (r.status === 409) return [];
					if (!r.ok) return failed(r, "Reading Dropbox");
					return r.json().then(function (j) { return j.entries || []; });
				});
			},
			list: function (folder) { return P.dropbox.kids(folder).then(function (a) { return a.filter(function (e) { return e[".tag"] === "file"; }).map(function (e) { return { ref: e.id, name: e.name, size: e.size, mod: Date.parse(e.server_modified) || 0, ver: e.rev }; }); }); },
			dirs: function (folder) { return P.dropbox.kids(folder).then(function (a) { return a.filter(function (e) { return e[".tag"] === "folder"; }).map(function (e) { return e.name; }).sort(); }); },
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
			write: function (ref, name, bytes, ver, ask, folder) {
				if (bytes.length > 140e6) return Promise.reject(err("other", "Files over 140 MB can't be saved to Dropbox from here."));
				var mode = ref && ver ? { ".tag": "update", update: ver } : { ".tag": "add" };
				var arg = JSON.stringify({ path: ref || "/" + segs(folder).concat([name]).join("/"), mode: mode, autorename: false, mute: true }).replace(/[\u007f-￿]/g, function (c) { return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4); });
				return authed("dropbox", "https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": arg }, body: bytes }).then(function (r) {
					if (r.status === 409) throw err(ref ? "conflict" : "exists", ref ? "changed" : "A file called " + name + " is already there.");
					if (!r.ok) return failed(r, "Saving to Dropbox");
					return r.json().then(function (j) { return { ref: j.id, ver: j.rev, name: j.name }; });
				});
			}
		},
		onedrive: {
			name: "OneDrive", root: [], where: function (l) { return "OneDrive › " + segs(l && l.dir).join(" › ") + " › " + (l ? l.name : ""); },
			ok: function () { return !!CLOUD.onedrive; },
			ms: "https://login.microsoftonline.com/common/oauth2/v2.0/", scope: "Files.ReadWrite offline_access",
			g: "https://graph.microsoft.com/v1.0/me/drive/",
			authUrl: function (ch, st, ru) { return this.ms + "authorize?" + form({ client_id: CLOUD.onedrive, response_type: "code", redirect_uri: ru || RELAY, response_mode: "query", scope: this.scope, code_challenge: ch, code_challenge_method: "S256", state: st }); },
			exchange: function (code, v, ru) { return tokenCall(P.onedrive.ms + "token", { client_id: CLOUD.onedrive, grant_type: "authorization_code", code: code, redirect_uri: ru || RELAY, code_verifier: v, scope: P.onedrive.scope }); },
			refresh: function (r) { return tokenCall(P.onedrive.ms + "token", { client_id: CLOUD.onedrive, grant_type: "refresh_token", refresh_token: r, scope: P.onedrive.scope }); },
			at: function (folder) { var f = encPath(folder); return P.onedrive.g + (f ? "root:/" + f + ":" : "root"); },
			path: function (name, folder) { return P.onedrive.g + "root:/" + segs(folder).concat([name]).map(encodeURIComponent).join("/") + ":"; },
			kids: function (folder) {
				return authed("onedrive", P.onedrive.at(folder) + "/children?$select=id,name,size,eTag,lastModifiedDateTime,file,folder&$top=500").then(function (r) {
					if (r.status === 404) return [];
					if (!r.ok) return failed(r, "Reading OneDrive");
					return r.json().then(function (j) { return j.value || []; });
				});
			},
			list: function (folder) { return P.onedrive.kids(folder).then(function (a) { return a.filter(function (e) { return e.file; }).map(function (e) { return { ref: e.id, name: e.name, size: e.size, mod: Date.parse(e.lastModifiedDateTime) || 0, ver: e.eTag }; }); }); },
			dirs: function (folder) { return P.onedrive.kids(folder).then(function (a) { return a.filter(function (e) { return e.folder; }).map(function (e) { return e.name; }).sort(); }); },
			// make the folder (and its parents) if missing; 409 = already there
			mkdirs: function (folder) {
				var s = segs(folder), i = 0;
				function next() {
					if (i >= s.length) return Promise.resolve();
					var parent = s.slice(0, i), name = s[i++];
					return authed("onedrive", P.onedrive.at(parent.join("/")) + "/children", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) })
						.then(function (r) { if (!r.ok && r.status !== 409) return failed(r, "Making the folder"); }).then(next);
				}
				return next();
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
			write: function (ref, name, bytes, ver, ask, folder) {
				var me = P.onedrive, h = { "Content-Type": "application/octet-stream" };
				if (!ref) return me.mkdirs(folder).then(function () { return me.put(ref, name, bytes, ver, folder); });
				return me.put(ref, name, bytes, ver, folder);
			},
			put: function (ref, name, bytes, ver, folder) {
				var me = P.onedrive, h = { "Content-Type": "application/octet-stream" };
				if (ref && ver) h["If-Match"] = ver;
				if (bytes.length <= 4e6) {
					var url = ref ? me.g + "items/" + encodeURIComponent(ref) + "/content" : me.path(name, folder) + "/content?@microsoft.graph.conflictBehavior=fail";
					return authed("onedrive", url, { method: "PUT", headers: h, body: bytes }).then(me.done);
				}
				// bigger than 4 MB: an upload session, sent in 5 MB pieces (multiples of 320 KiB)
				var surl = ref ? me.g + "items/" + encodeURIComponent(ref) + "/createUploadSession" : me.path(name, folder) + "/createUploadSession";
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
			name: "Google Drive", root: [], where: function (l) { return "Google Drive › " + segs(l && l.dir).join(" › ") + " › " + (l ? l.name : ""); },
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
						var c = google.accounts.oauth2.initTokenClient({ client_id: CLOUD.gdrive, scope: "https://www.googleapis.com/auth/drive.file",
							callback: function (j) { if (j.error || !j.access_token) return rej(err("auth", j.error_description || j.error || "Google sign-in failed.")); res(saveTok("gdrive", j).a); },
							error_callback: function (e) { rej(err("auth", (e && e.message) || "The Google window was closed.")); } });
						c.requestAccessToken({ prompt: again ? "" : "consent" });
					});
				});
			},
			api: "https://www.googleapis.com/drive/v3/files", up: "https://www.googleapis.com/upload/drive/v3/files",
			FOLDER: "application/vnd.google-apps.folder", ids: {},
			q: function (q) {
				return authed("gdrive", P.gdrive.api + "?" + form({ q: q + " and trashed=false", fields: "files(id,name,size,version,modifiedTime,mimeType)", pageSize: 500, spaces: "drive" })).then(function (r) {
					if (!r.ok) return failed(r, "Reading Google Drive");
					return r.json().then(function (j) { return j.files || []; });
				});
			},
			// folder path -> id (only folders this app made are visible to it); create = make the missing ones
			dirId: function (folder, create) {
				var me = P.gdrive, s = segs(folder), key = s.join("/");
				if (me.ids[key]) return Promise.resolve(me.ids[key]);
				var parent = "root", i = 0;
				function next() {
					if (i >= s.length) { me.ids[key] = parent; return parent; }
					var nm = s[i++], sub = s.slice(0, i).join("/");
					if (me.ids[sub]) { parent = me.ids[sub]; return next(); }
					return me.q("name='" + gq(nm) + "' and '" + parent + "' in parents and mimeType='" + me.FOLDER + "'").then(function (a) {
						if (a.length) { parent = me.ids[sub] = a[0].id; return next(); }
						if (!create) return null;
						return authed("gdrive", me.api + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm, mimeType: me.FOLDER, parents: [parent] }) }).then(function (r) {
							if (!r.ok) return failed(r, "Making the folder");
							return r.json().then(function (j) { parent = me.ids[sub] = j.id; return next(); });
						});
					});
				}
				return Promise.resolve().then(next);
			},
			list: function (folder) {
				var me = P.gdrive;
				return me.dirId(folder, false).then(function (id) {
					if (!id) return [];
					return me.q("'" + id + "' in parents and mimeType!='" + me.FOLDER + "'").then(function (a) { return a.map(function (f) { return { ref: f.id, name: f.name, size: +f.size || 0, mod: Date.parse(f.modifiedTime) || 0, ver: f.id + ":" + f.version }; }); });
				});
			},
			dirs: function (folder) {
				var me = P.gdrive;
				return me.dirId(folder, false).then(function (id) { if (!id) return []; return me.q("'" + id + "' in parents and mimeType='" + me.FOLDER + "'").then(function (a) { return a.map(function (f) { return f.name; }).sort(); }); });
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
			write: function (ref, name, bytes, ver, ask, folder) {
				var me = P.gdrive, dir = null;
				var check = ref ? me.head(ref).then(function (now) { if (ver && now !== ver) throw err("conflict", "changed"); }) :
					me.list(folder).then(function (all) { if (all.some(function (f) { return f.name === name; })) throw err("exists", "A file called " + name + " is already there."); return me.dirId(folder, true).then(function (id) { dir = id; }); });
				return check.then(function () {
					// resumable upload: one code path for any size; metadata first, then the bytes to the address Google gives back
					var meta = ref ? {} : { name: name, parents: [dir] };
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
	RETURN = takeReturn();
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
			list: function (folder) { var o = all(), d = segs(folder).join("/"); return wait(Object.keys(o).filter(function (k) { return (o[k].dir || DIR) === d; }).map(function (k) { var f = o[k]; return { ref: k, name: f.name, size: f.size, mod: f.mod, ver: "v" + f.v }; })); },
			dirs: function (folder) { var o = all(), d = segs(folder).join("/"), out = {}; Object.keys(o).forEach(function (k) { var x = (o[k].dir || DIR) + "/"; if (x.indexOf(d ? d + "/" : "") === 0) { var rest = x.slice(d ? d.length + 1 : 0).split("/")[0]; if (rest) out[rest] = 1; } }); (ls(K + ":dirs") || []).forEach(function (x) { if (x.indexOf(d ? d + "/" : "") === 0) { var r2 = x.slice(d ? d.length + 1 : 0).split("/")[0]; if (r2) out[r2] = 1; } }); return wait(Object.keys(out).sort()); },
			head: function (ref) { var f = all()[ref]; return f ? wait("v" + f.v) : Promise.reject(err("gone", "The file is gone.")); },
			read: function (ref) { var f = all()[ref]; return f ? wait({ bytes: unb64(f.b), ver: "v" + f.v, name: f.name }) : Promise.reject(err("gone", "The file is gone.")); },
			write: function (ref, name, bytes, ver, ask, folder) {
				var o = all(), d = segs(folder).join("/");
				if (ref) { var f = o[ref]; if (!f) return Promise.reject(err("gone", "The file is gone.")); if (ver && "v" + f.v !== ver) return Promise.reject(err("conflict", "changed")); }
				else if (Object.keys(o).some(function (k) { return o[k].name === name && (o[k].dir || DIR) === d; })) return Promise.reject(err("exists", "A file called " + name + " is already there."));
				var id = ref || "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), g = o[id] || { v: 0, name: name, dir: d };
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
		"#mcl-dlg .mcl-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:.25em;font-size:.95em;margin:.2em 0 .4em}#mcl-dlg .mcl-cr{font:inherit;background:none;border:0;padding:.15em .3em;border-radius:5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}#mcl-dlg .mcl-cr:hover{background:#eef3fb}#mcl-dlg .mcl-cr.is-here{font-weight:700;text-decoration:none}#mcl-dlg .mcl-crx{opacity:.7}",
		"#mcl-dlg .mcl-subs{display:flex;flex-wrap:wrap;gap:.35em;margin:.2em 0 .3em}#mcl-dlg .mcl-sub{font:inherit;font-size:.88em;padding:.3em .6em;border:1px solid #d5dde8;border-radius:8px;background:none;cursor:pointer}#mcl-dlg .mcl-sub:hover{border-color:#3b6fd8}",
		"#mcl-dlg .mcl-acts--sm{margin-top:0}#mcl-dlg .mcl-acts--sm .mcl-b{font-size:.85em;padding:.25em .4em}#mcl-dlg .mcl-foot{display:flex;gap:.3em;justify-content:flex-end;margin-top:.4em}#mcl-dlg .mcl-foot .mcl-b{font-size:.82em;opacity:.8}",
		"#mcl-dlg .mcl-extra{margin-top:.9em;border-top:1px solid #d5dde8;padding-top:.7em}#mcl-dlg .mcl-extra p{margin:.25em 0}",
		"body.dark-mode #mcl-dlg .mcl-cr:hover{background:#2a3441}body.dark-mode #mcl-dlg .mcl-sub{border-color:#3b4654}body.dark-mode #mcl-dlg .mcl-extra{border-color:#3b4654}",
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
		var PREF = "mes-cloud:" + cfg.app, prefs = Object.assign({ auto: true, tab: "", dirs: {} }, ls(PREF) || {});
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
			var item = { p: l.p, ref: l.p === "file" ? "h:" + l.hid : l.ref, name: l.name, t: Date.now(), dir: l.dir };
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
		function openFrom(p, ref, name, replace, dir) {
			busy = "Opening " + name + "…"; lastErr = null; paint();
			return P[p].read(ref, true).then(function (r) {
				return Promise.resolve(cfg.open(r.bytes, r.name || name, replace)).then(function (d) {
					if (!d) throw err("other", "The page could not open " + (r.name || name) + ".");
					var wn = cfg.writeName ? cfg.writeName(r.name || name) : r.name || name;
					var l = { p: p, ref: ref, name: r.name || name, ver: r.ver, at: Date.now() };
					if (p !== "file") l.dir = dir != null ? dir : (replace && L(replace) && L(replace).dir) || dirOf(p);
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
			return Promise.resolve().then(function () { return cfg.bytes(d, name); }).then(function (bytes) { return P[p].write(null, name, u8of(bytes), null, false, dirOf(p)); }).then(function (w) {
				var l = { p: p, ref: w.ref, name: w.name || name, ver: w.ver, at: Date.now(), dir: dirOf(p) };
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
			return openFrom(r.p, r.ref, r.name, null, r.dir);
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
		function defDir(p) { var d = segs(cfg.folder || DIR + "/" + (cfg.title || cfg.what)); return p === "dropbox" ? d.slice(-1).join("/") : d.join("/"); }
		function dirOf(p) { var x = prefs.dirs && prefs.dirs[p]; return x != null ? x : defDir(p); }
		function setDir(p, d) { prefs.dirs = prefs.dirs || {}; prefs.dirs[p] = segs(d).join("/"); savePrefs(); listCache[p] = null; listErr[p] = null; }
		function curBox() {
			var d = cfg.doc(), l = L(d), h = "";
			if (!d) return "";
			if (!l) return '<div class="mcl-cur"><p><b>' + esc(cfg.name(d)) + "</b> · not saved to the cloud yet</p></div>";
			var cls = "", st;
			if (saving) st = "⟳ Saving…";
			else if (l.code === "conflict") { cls = "is-err"; st = "⚠ Changed somewhere else. Which one do you keep?"; }
			else if (l.code === "offline") { cls = "is-due"; st = "⚠ Offline: not saved yet"; }
			else if (l.code) { cls = "is-err"; st = "⚠ " + esc(l.err); }
			else if (l.remote) { cls = "is-due"; st = "⚠ A newer version is there"; }
			else if (cfg.dirty(d)) { cls = "is-due"; st = "● Not saved yet"; }
			else st = "✓ Saved" + (l.at ? " " + H.ago(l.at) : "");
			h += '<div class="mcl-cur ' + cls + '"><p>' + st + ' <span class="mcl-where">· ' + esc(P[l.p].where(l)) + "</span></p>";
			h += '<div class="mcl-acts">';
			if (l.code === "conflict") h += '<button type="button" class="mcl-b mcl-b--p" data-a="mine">Keep mine</button><button type="button" class="mcl-b" data-a="theirs">Open theirs</button><button type="button" class="mcl-b" data-a="copy">Save mine as a copy</button>';
			else if (l.code === "auth" && l.p !== "file") h += '<button type="button" class="mcl-b mcl-b--p" data-a="relog">Sign in again</button>';
			else if (l.remote && !cfg.dirty(d)) h += '<button type="button" class="mcl-b mcl-b--p" data-a="theirs">Open the newer one</button><button type="button" class="mcl-b" data-a="now">Save mine over it</button>';
			else h += '<button type="button" class="mcl-b mcl-b--p" data-a="now"' + (saving ? " disabled" : "") + ">Save now</button>";
			h += '<label class="mcl-tick"><input type="checkbox" data-a="auto"' + (prefs.auto ? " checked" : "") + "> Auto-save</label>";
			h += '<button type="button" class="mcl-b mcl-b--g" data-a="unlink">Unlink</button></div></div>';
			return h;
		}
		function provPane(p) {
			var d = cfg.doc(), h = "", nm = d ? H.safeName(cfg.writeName ? cfg.writeName(cfg.name(d)) : cfg.name(d), cfg.defExt) : "";
			if (p === "file") {
				if (!P.file.ok()) return '<p class="mcl-warn">' + esc(noFsText()) + "</p>";
				h += '<div class="mcl-acts"><button type="button" class="mcl-b mcl-b--p" data-a="fopen">Open…</button>' + (d ? '<button type="button" class="mcl-b" data-a="fsave">Save as…</button>' : "") + "</div>";
				h += '<p class="mcl-note">Save it inside your OneDrive, Dropbox or iCloud folder and it syncs by itself.</p>';
				return h;
			}
			var pr = P[p];
			if (!pr.ok()) return "<p>Not available.</p>";
			if (!signedIn(p)) {
				if (!MOCK && location.hostname !== "mes.fm" && p !== "gdrive") h += '<p class="mcl-warn">Signing in only works on mes.fm itself.</p>';
				return h + '<div class="mcl-acts"><button type="button" class="mcl-b mcl-b--p" data-a="connect" data-p="' + p + '">Connect ' + esc(pr.name) + "</button></div>";
			}
			var dir = dirOf(p), s = segs(dir), c = listCache[p], ok = c && c.dir === dir;
			// the folder: click a part to go up, a sub-folder to go in
			h += '<div class="mcl-crumbs"><span aria-hidden="true">📁</span> <button type="button" class="mcl-cr" data-a="cd" data-p="' + p + '" data-d="">' + esc(pr.name) + "</button>" + (pr.root || []).map(function (x) { return ' › <span class="mcl-crx">' + esc(x) + "</span>"; }).join("");
			s.forEach(function (x, i) { h += ' › <button type="button" class="mcl-cr' + (i === s.length - 1 ? " is-here" : "") + '" data-a="cd" data-p="' + p + '" data-d="' + esc(s.slice(0, i + 1).join("/")) + '">' + esc(x) + "</button>"; });
			h += "</div>";
			if (ok && c.dirs.length) h += '<div class="mcl-subs">' + c.dirs.map(function (x) { return '<button type="button" class="mcl-sub" data-a="cd" data-p="' + p + '" data-d="' + esc(s.concat([x]).join("/")) + '">📁 ' + esc(x) + "</button>"; }).join("") + "</div>";
			h += '<div class="mcl-acts mcl-acts--sm"><button type="button" class="mcl-b mcl-b--g" data-a="mkdir" data-p="' + p + '">+ New folder</button>' + (dir !== defDir(p) ? '<button type="button" class="mcl-b mcl-b--g" data-a="cd" data-p="' + p + '" data-d="' + esc(defDir(p)) + '">Back to ' + esc(defDir(p)) + "</button>" : "") + "</div>";
			if (d) h += '<div class="mcl-row"><input type="text" id="mcl-name" value="' + esc(nm) + '" aria-label="File name"><button type="button" class="mcl-b mcl-b--p" data-a="savehere" data-p="' + p + '">Save here</button></div>';
			if (listErr[p]) h += '<p class="mcl-err">' + esc(listErr[p]) + '</p><div class="mcl-acts"><button type="button" class="mcl-b" data-a="relist" data-p="' + p + '">Try again</button>' + (/sign|auth|ran out|confirm|401|403/i.test(listErr[p]) ? '<button type="button" class="mcl-b" data-a="connect" data-p="' + p + '">Sign in again</button>' : "") + "</div>";
			else if (!ok) h += '<p class="mcl-note">Loading…</p>';
			else {
				var fs = H.filesFor(c.files, cfg.exts);
				if (fs.length) h += '<ul class="mcl-list">' + fs.map(function (f) { return '<li><button type="button" class="mcl-item" data-a="openf" data-p="' + p + '" data-ref="' + esc(f.ref) + '" data-n="' + esc(f.name) + '"><b>' + esc(f.name) + "</b><small>" + esc(H.fmtBytes(f.size)) + (f.mod ? " · " + esc(new Date(f.mod).toLocaleString()) : "") + "</small></button></li>"; }).join("") + "</ul>";
				else h += '<p class="mcl-note">No ' + esc(cfg.what) + "s in this folder.</p>";
			}
			h += '<p class="mcl-foot"><button type="button" class="mcl-b mcl-b--g" data-a="relist" data-p="' + p + '">Refresh</button><button type="button" class="mcl-b mcl-b--g" data-a="disconnect" data-p="' + p + '">Disconnect ' + esc(pr.name) + "</button></p>";
			return h;
		}
		var TABS = [["onedrive", "OneDrive"], ["dropbox", "Dropbox"], ["gdrive", "Google Drive"], ["file", "This computer"]];
		function paintDlg() {
			if (dlg.hidden || dlg.__owner !== cfg.app) return;
			var tabs = TABS.filter(function (t) { return t[0] === "file" || P[t[0]].ok(); });
			if (!tabs.some(function (t) { return t[0] === prefs.tab; })) prefs.tab = tabs.filter(function (t) { return t[0] !== "file" && signedIn(t[0]); }).map(function (t) { return t[0]; })[0] || (P.file.ok() ? "file" : tabs[0][0]);
			var h = '<div class="mcl-box"><h2><span aria-hidden="true">☁</span> Cloud <button type="button" class="mcl-x" data-a="close" aria-label="Close">×</button></h2>' + curBox();
			if (busy) h += '<p class="mcl-note">⟳ ' + esc(busy) + (pending ? ' <button type="button" class="mcl-b mcl-b--g" data-a="cancel">Cancel</button>' : "") + "</p>";
			if (lastErr) h += '<p class="mcl-err">⚠ ' + esc(lastErr) + "</p>";
			h += '<div class="mcl-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" class="mcl-tab" role="tab" data-a="tab" data-p="' + t[0] + '" aria-selected="' + (t[0] === prefs.tab) + '">' + esc(t[1]) + (t[0] !== "file" && signedIn(t[0]) ? '<span class="mcl-dot" title="Connected"></span>' : "") + "</button>"; }).join("") + "</div>";
			h += '<div class="mcl-pane" role="tabpanel">' + provPane(prefs.tab) + "</div>";
			if (cfg.extra) { var ex = cfg.extra(); if (ex) h += '<div class="mcl-extra">' + ex + "</div>"; }
			var rc = recent();
			if (rc.length) h += "<h3>Recent</h3><ul class=\"mcl-list\">" + rc.slice(0, 6).map(function (r, i) { return '<li><button type="button" class="mcl-item" data-a="recent" data-i="' + i + '"><b>' + esc(r.name) + "</b><small>" + esc(r.p === "file" ? "this computer" : provName(r.p)) + " · " + esc(H.ago(r.t)) + '</small></button><button type="button" class="mcl-forget" data-a="forget" data-i="' + i + '" aria-label="Forget">×</button></li>'; }).join("") + "</ul>";
			h += "</div>";
			var fo = document.activeElement, fid = fo && dlg.contains(fo) ? fo.getAttribute("data-a") + "|" + (fo.getAttribute("data-p") || "") + "|" + (fo.id || "") : "";
			var nameVal = document.getElementById("mcl-name"); nameVal = nameVal ? nameVal.value : null;
			dlg.innerHTML = h;
			if (nameVal != null && document.getElementById("mcl-name")) document.getElementById("mcl-name").value = nameVal;
			if (fid) { var parts = fid.split("|"), el = parts[2] ? document.getElementById(parts[2]) : dlg.querySelector('[data-a="' + parts[0] + '"]' + (parts[1] ? '[data-p="' + parts[1] + '"]' : "")); if (el) el.focus(); }
			var tp = prefs.tab;
			if (tp !== "file" && signedIn(tp) && !(listCache[tp] && listCache[tp].dir === dirOf(tp)) && !listErr[tp]) loadList(tp);
		}
		function loadList(p) {
			var dir = dirOf(p), key = p + "|" + dir;
			if (loadList[key]) return; loadList[key] = 1;
			Promise.all([P[p].list(dir), P[p].dirs ? P[p].dirs(dir) : []]).then(function (a) { if (dirOf(p) === dir) { listCache[p] = { dir: dir, files: a[0], dirs: a[1] }; listErr[p] = null; } }, function (e) { listErr[p] = e.message || String(e); })
				.then(function () { loadList[key] = 0; paintDlg(); });
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
				connectFrom(p).then(function () { busy = ""; listCache[p] = null; listErr[p] = null; d = cfg.doc(); if (L(d) && L(d).p === p && L(d).code === "auth") { L(d).code = null; L(d).err = null; } paintDlg(); paint(); },
					function (x) { busy = ""; if (x.code !== "abort") lastErr = x.message; paintDlg(); });
			}
			else if (a === "cancel") { if (pending) pending.cancel(); }
			else if (a === "disconnect") { if (confirm("Disconnect " + provName(p) + " in this browser? Your files stay where they are.")) { P[p].disconnect(); listCache[p] = null; paintDlg(); paint(); } }
			else if (a === "cd") { setDir(p, b.getAttribute("data-d")); paintDlg(); }
			else if (a === "mkdir") { var nf = prompt("New folder name:"); nf = nf && H.safeName(nf).replace(/\./g, " ").trim(); if (nf) { setDir(p, dirOf(p) + "/" + nf); paintDlg(); } }
			else if (a === "x") { if (cfg.onExtra) cfg.onExtra(b.getAttribute("data-x"), b); }
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
		// sign in: on this page when its address is registered with the service, else the pop-up / Google's window
		function connectFrom(p) {
			if (p !== "gdrive" && !MOCK && HERE_READY[p] && hereUri()) return hereSignIn(p, cfg.app, function () {
				var d = cfg.doc(); if (!d) return null;
				var l = L(d), name = H.safeName(cfg.writeName ? cfg.writeName(cfg.name(d)) : cfg.name(d), cfg.defExt);
				return Promise.resolve(cfg.bytes(d, name)).then(function (bytes) {
					var u = u8of(bytes); if (u.length > 200 * 1048576) return false;     // too big to keep: the page asks before leaving as usual
					return { bytes: u, name: name, dirty: !!cfg.dirty(d), link: l && l.p !== "file" ? { p: l.p, ref: l.ref, name: l.name, ver: l.ver, dir: l.dir } : null, t: Date.now() };
				});
			});
			return P[p].connect();
		}
		// back from signing in on this page: open the kept document again, then the Cloud window on that service
		if (RETURN && RETURN.info.app === cfg.app) {
			var back = RETURN; RETURN = null;
			back.token.then(function () {
				return hkv("get", "stash:" + cfg.app).catch(function () { return null; }).then(function (st) {
					hkv("del", "stash:" + cfg.app).catch(function () { });
					if (!st || !st.bytes || Date.now() - st.t > 900000) return;
					return Promise.resolve(cfg.open(st.bytes, st.name, null)).then(function (d) {
						if (!d) return;
						if (st.link) setL(d, Object.assign({}, st.link, { code: null, err: null }));
						if (st.dirty && cfg.markDirty) cfg.markDirty(d);
					});
				});
			}).then(function () {
				prefs.tab = back.info.p; savePrefs(); listCache[back.info.p] = null; toast("Connected to " + provName(back.info.p)); paint(); open();
			}, function (e) {
				lastErr = e && e.message || String(e); prefs.tab = back.info.p; savePrefs();
				hkv("get", "stash:" + cfg.app).then(function (st) { hkv("del", "stash:" + cfg.app).catch(function () { }); if (st && st.bytes) return cfg.open(st.bytes, st.name, null); }).catch(function () { }).then(function () { paint(); open(); });
			});
		}
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
