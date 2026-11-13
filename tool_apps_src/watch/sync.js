/* MES Watch: ☁ Sync & backup (window.WTSync(api), called once by app.js).
   1. Sync = ONE file, mes-watch.json, kept up to date in the person's own cloud, written by the browser (never through mes.fm):
      a file on this computer (File System Access: e.g. inside the OneDrive / Dropbox / Google Drive / iCloud folder, whose desktop app
      uploads it) or the Dropbox / OneDrive / Google Drive account itself, through /main_js/cloud-files.js (MESCloud.providers), so it
      uses Copy Text's app registrations AND its saved sign-in (connect once, works on both pages). Files live in the app folder,
      sub-folder Documents (Google: the hidden app-data space). Every sync reads the file, three-way merges it with what this browser
      has (MESWatch.merge3: the last synced copy is the base, so a delete on one device stays deleted) and writes it back with the
      version it read; a write that lost the race (another device wrote first) reads again and retries. Lists, playlists, channels
      and history (with where you stopped) are synced; per-device settings (speed, zoom, ticks) are not.
   2. Hive backup = MESHiveStore (custom_json "mes_store", app "watch", name "lists"): lists, playlists and channels, NOT history
      (it changes every few seconds). Encrypted to the person's own memo key by default. Restore = Add to mine / Replace.
   State: localStorage "mes-watch:v1:sync" = {p, ref (cloud file id), name, ver, base, at, err, code}; the file handle (this computer)
   in IndexedDB "mes-watch" / "kv" / "file"; Hive encrypt choice "mes-watch:v1:hiveenc". */
(function () {
	"use strict";
	window.WTSync = function (api) {
		var W = window.MESWatch, $ = function (id) { return document.getElementById(id); }, esc = api.esc, toast = api.toast;
		var SK = "mes-watch:v1:sync", FNAME = "mes-watch.json", ENC = "mes-watch:v1:hiveenc";
		var NAMES = { file: "a file on this computer", dropbox: "Dropbox", onedrive: "OneDrive", gdrive: "Google Drive" };
		function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
		var st = ls(SK) || null, busy = false, again = false, timer = 0, handle = null, P = function () { return window.MESCloud && window.MESCloud.providers; };
		function keep() { ls(SK, st); }
		function dev() { var u = navigator.userAgent; return /iPhone|iPad/.test(u) ? "iPhone / iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "browser"; }

		/* ---------- IndexedDB for the file handle ---------- */
		var dbp = null;
		function db() { return dbp || (dbp = new Promise(function (res, rej) { var q = indexedDB.open("mes-watch", 1); q.onupgradeneeded = function () { q.result.createObjectStore("kv"); }; q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; })); }
		function kv(op, k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", op === "get" ? "readonly" : "readwrite"), s = t.objectStore("kv"), q = op === "get" ? s.get(k) : op === "del" ? s.delete(k) : s.put(v, k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }); }

		/* ---------- one sync round ---------- */
		function ref() { return st.p === "file" ? handle : st.ref; }
		function round(ask, tries) {
			tries = tries || 0;
			var prov = P()[st.p], full = W.snap(api.S, true), sel = api.S.bk, local = full;
			if (st.p === "file" && !handle) return Promise.reject(Object.assign(new Error("Open the file again."), { code: "perm" }));
			return prov.read(ref(), ask).then(function (r) {
				var text = new TextDecoder().decode(r.bytes), remote = W.readFile(text);
				local = remote ? W.mask(full, remote, sel) : W.pick(full, sel); delete local.part;   // left-out parts: the other copy is never touched
				var merged = remote ? W.merge3(st.base || (remote ? { q: [], saved: [], lists: [], chans: [], hist: [] } : null), local, remote) : local;
				var write = !remote || JSON.stringify(merged) !== JSON.stringify(remote);
				var done = function (ver) { st.ver = ver; st.base = merged; st.at = Date.now(); st.err = ""; st.code = ""; keep(); var back = W.mask(merged, full, sel); if (JSON.stringify(back) !== JSON.stringify(full)) api.apply(back); paint(); };
				if (!write) { done(r.ver); return; }
				var bytes = new TextEncoder().encode(W.fileText(merged, dev()));
				return prov.write(ref(), st.name || FNAME, bytes, r.ver, ask).then(function (w) { if (w && w.ref && st.p !== "file") st.ref = w.ref; done(w.ver); }, function (e) {
					if (e && e.code === "conflict" && tries < 3) return round(ask, tries + 1);   // another device wrote first: read again
					throw e;
				});
			});
		}
		function sync(ask) {
			if (!st || !st.p) return Promise.resolve();
			if (busy) { again = true; return Promise.resolve(); }
			busy = true; paint();
			return round(ask).catch(function (e) {
				st.code = e && e.code || "other"; st.err = e && e.message || String(e); keep();
			}).then(function () { busy = false; paint(); if (again) { again = false; later(1500); } });
		}
		function later(ms) { clearTimeout(timer); timer = setTimeout(function () { if (!document.hidden) sync(false); }, ms); }
		var lastSig = "";
		api.onSave(function () {
			if (!st || !st.p) return;
			var sig = JSON.stringify(W.snap(api.S, false));   // lists changed: soon; only history / resume points moved: with the minute check
			if (sig !== lastSig) { lastSig = sig; later(4000); }
		});
		document.addEventListener("visibilitychange", function () { if (!document.hidden && st && st.p) later(800); });
		window.addEventListener("focus", function () { if (st && st.p) later(800); });
		setInterval(function () { if (st && st.p && !document.hidden) sync(false); }, 60000);
		window.addEventListener("pagehide", function () { if (st && st.p && st.p !== "file") sync(false); });

		/* ---------- connecting ---------- */
		function start(p, h, r, name) {
			st = { p: p, ref: r || null, name: name || FNAME, ver: "", base: null, at: 0, err: "", code: "" }; handle = h || null; keep(); lastSig = JSON.stringify(W.snap(api.S, false));
			return sync(true).then(function () { if (!st.err) toast("Syncing with " + NAMES[p]); });
		}
		function connectCloud(p) {
			var prov = P()[p], go = function () {
				msg("Looking for " + FNAME + " in " + NAMES[p] + "…");
				var WDIR = p === "dropbox" ? "Watch" : "MES Apps/Watch";
				return prov.list(WDIR).then(function (files) {
					var f = files.filter(function (x) { return x.name === FNAME; })[0];
					if (f) return start(p, null, f.ref, f.name);
					// no file yet: write this browser's lists as the first copy
					var first = W.pick(W.snap(api.S, true), api.S.bk); delete first.part;
					return prov.write(null, FNAME, new TextEncoder().encode(W.fileText(first, dev())), "", false, WDIR).then(function (w) {
						st = { p: p, ref: w.ref, name: w.name || FNAME, ver: w.ver, base: first, at: Date.now(), err: "", code: "" }; keep(); paint(); toast("Syncing with " + NAMES[p]);
					});
				}).then(function () { msg(""); }, function (e) { msg(e.message || String(e), "err"); });
			};
			if (window.MESCloud.signedIn(p)) return go();
			var c = prov.connect();   // opens the sign-in pop-up inside this click
			msg("Sign in to " + NAMES[p] + " in the window that opened…");
			return c.then(go, function (e) { msg(e.message || String(e), "err"); });
		}
		function connectFile() {
			if (!window.showSaveFilePicker) { msg("This browser can't keep a file up to date (Chrome, Edge and Opera on a computer can; Brave after switching on brave://flags/#file-system-access-api). Use Dropbox, OneDrive or Google Drive instead.", "err"); return; }
			window.showSaveFilePicker({ suggestedName: FNAME, types: [{ description: "MES Watch lists", accept: { "application/json": [".json"] } }] }).then(function (h) {
				return kv("put", "file", h).catch(function () {}).then(function () { return start("file", h, null, h.name); });
			}, function (e) { if (e && e.name !== "AbortError") msg(e.message, "err"); });
		}
		function stop() {
			if (!confirm("Stop syncing in this browser? The file stays where it is, and nothing here is deleted.")) return;
			st = null; keep(); handle = null; kv("del", "file").catch(function () {}); paint();
		}

		/* ---------- panel ---------- */
		function msg(t, cls) { var m = $("wt-sync-msg"); if (m) { m.textContent = t || ""; m.className = "wt-smsg" + (cls ? " is-" + cls : ""); } }
		function paint() {
			var b = $("wt-syncbtn"), s = $("wt-sync-state"), acts = $("wt-sync-acts");
			if (!b) return;
			if (!st || !st.p) {
				b.textContent = "☁ Sync & backup";
				s.innerHTML = "Not syncing yet. Pick where to keep your lists, and they stay the same on every computer and phone where you pick the same place.";
				var pr = P() || {};
				acts.innerHTML = (window.showSaveFilePicker ? '<button type="button" class="tu-btn" data-s="file">📁 A file on this computer</button>' : "") +
					["dropbox", "onedrive", "gdrive"].filter(function (p) { return pr[p] && pr[p].ok(); }).map(function (p) { return '<button type="button" class="tu-btn" data-s="' + p + '">' + NAMES[p] + (window.MESCloud.signedIn(p) ? " ✓" : "") + "</button>"; }).join("");
				if (!window.MESCloud) acts.innerHTML = '<p class="wt-smsg is-err">The sync script did not load (blocked or offline). Reload to try again.</p>';
				return;
			}
			var where = st.p === "file" ? (st.name || FNAME) + " (on this computer)" : NAMES[st.p] + " → MES app folder → Documents → " + FNAME;
			var line = busy ? "⟳ Syncing…" : st.code === "perm" ? "⚠ The browser needs your OK to keep using the file." : st.code === "auth" ? "⚠ " + NAMES[st.p] + " needs you to sign in again." :
				st.code ? "⚠ Can't sync right now: " + (st.err || "") : st.at ? "✓ Synced " + W.ago(st.at) : "Not synced yet";
			b.textContent = "☁ " + (st.code ? "Sync ⚠" : "Synced ✓");
			s.innerHTML = "<b>" + esc(line) + "</b><br><span class=\"wt-ssmall\">Where: " + esc(where) + "</span>";
			acts.innerHTML = (st.code === "perm" ? '<button type="button" class="tu-btn tu-btn--primary" data-s="allow">Allow</button>' : "") +
				(st.code === "auth" ? '<button type="button" class="tu-btn tu-btn--primary" data-s="relog">Sign in again</button>' : "") +
				'<button type="button" class="tu-btn" data-s="now"' + (busy ? " disabled" : "") + ">Sync now</button>" +
				'<button type="button" class="tu-btn tu-btn--ghost" data-s="stop">Stop syncing</button>';
		}
		/* ---------- what to back up (both the cloud file and Hive) ---------- */
		function paintSel() {
			var box = $("wt-bkrows"); if (!box) return;
			var S = api.S, sel = S.bk || {}, row = function (key, label, n, on, note) {
				return '<label class="wt-check wt-bkrow"><input type="checkbox" data-bk="' + esc(key) + '"' + (on ? " checked" : "") + "> " + esc(label) + ' <small>' + n + "</small>" + (note ? ' <em class="wt-ssmall">' + esc(note) + "</em>" : "") + "</label>";
			};
			box.innerHTML = '<div class="wt-bkgrp">' + row("q", "Up next", S.q.length, W.selOn(sel, "q")) + row("saved", "Saved", S.saved.length, W.selOn(sel, "saved")) +
				row("chans", "My channels", S.chans.length, W.selOn(sel, "chans")) + row("hist", "History and where I stopped", S.hist.length, W.selOn(sel, "hist"), "(cloud sync only)") + "</div>" +
				(S.lists.length ? '<div class="wt-bkgrp"><b>Playlists</b>' + S.lists.map(function (l) { return row("l:" + l.id, l.name, l.items.length, W.listOn(sel, l.id)); }).join("") + "</div>" : '<p class="wt-ssmall">No playlists yet.</p>') +
				'<div class="wt-sacts"><button type="button" class="tu-btn tu-btn--ghost" data-bkall="1">Tick all</button><button type="button" class="tu-btn tu-btn--ghost" data-bkall="0">Untick all</button></div>';
			$("wt-bknote").textContent = W.partial(sel) ? "Only the ticked parts are synced and backed up. What you untick stays as it is in the other copy." : "Everything is synced and backed up. Untick what you want to keep on this device only.";
		}
		$("wt-bkrows") && $("wt-bkrows").addEventListener("change", function (e) {
			var c = e.target.closest("[data-bk]"); if (!c) return; var S = api.S, k = c.dataset.bk, sel = S.bk = S.bk || {};
			if (k.indexOf("l:") === 0) { sel.off = sel.off || {}; if (c.checked) delete sel.off[k.slice(2)]; else sel.off[k.slice(2)] = 1; }
			else if (c.checked) delete sel[k]; else sel[k] = false;
			api.save(); paintSel(); if (st && st.p) later(800);
		});
		$("wt-bkrows") && $("wt-bkrows").addEventListener("click", function (e) {
			var b = e.target.closest("[data-bkall]"); if (!b) return; var S = api.S;
			if (b.dataset.bkall === "1") S.bk = {}; else { S.bk = { q: false, saved: false, chans: false, hist: false, off: {} }; S.lists.forEach(function (l) { S.bk.off[l.id] = 1; }); }
			api.save(); paintSel(); if (st && st.p) later(800);
		});
		$("wt-syncbtn").onclick = function () { var p = $("wt-sync"), open = p.hidden; p.hidden = !open; this.setAttribute("aria-expanded", String(open)); if (open) { paintSel(); paint(); paintHive(); p.scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
		$("wt-sync-close").onclick = function () { $("wt-sync").hidden = true; $("wt-syncbtn").setAttribute("aria-expanded", "false"); };
		$("wt-sync").addEventListener("click", function (e) {
			var b = e.target.closest("[data-s]"); if (!b) return; var a = b.dataset.s;
			if (a === "file") connectFile();
			else if (NAMES[a]) connectCloud(a);
			else if (a === "now") sync(true);
			else if (a === "stop") stop();
			else if (a === "allow") { if (handle) sync(true); else kv("get", "file").then(function (h) { if (!h) { msg("Pick the file again.", "err"); return; } handle = h; sync(true); }); }
			else if (a === "relog") { var p = st.p, c = P()[p].connect(); c.then(function () { st.code = ""; sync(true); }, function (x) { msg(x.message, "err"); }); }
		});
		// the file handle survives a reload, but the browser asks again before writing to it
		if (st && st.p === "file") kv("get", "file").then(function (h) {
			handle = h || null; if (!h) { st.code = "perm"; keep(); paint(); return; }
			(h.queryPermission ? h.queryPermission({ mode: "readwrite" }) : Promise.resolve("granted")).then(function (s) { if (s === "granted") sync(false); else { st.code = "perm"; keep(); paint(); } });
		}).catch(function () {});
		else if (st && st.p) later(1200);

		/* ---------- Hive backup ---------- */
		var HAPP = "watch", HNAME = "lists", hiveList = null, hbusy = false;
		var HV = function () { return window.MESHive; }, HS = function () { return window.MESHiveStore; };
		function hmsg(t, cls) { var m = $("wt-hive-msg"); m.textContent = t || ""; m.className = "wt-smsg" + (cls ? " is-" + cls : ""); }
		function encOn() { return $("wt-hive-enc").checked; }
		function kb(n) { return n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB"; }
		function when(t) { var d = new Date(/Z$/.test(t) ? t : t + "Z"); return isNaN(d) ? t : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
		function paintHive() {
			var box = $("wt-hive-user"), u = HV() && HV().user();
			if (!HV() || !HS()) { box.innerHTML = '<p class="wt-smsg is-err">The Hive scripts did not load (blocked or offline). Reload the page to try again.</p>'; $("wt-hive-main").hidden = true; return; }
			try { $("wt-hive-enc").checked = localStorage.getItem(ENC) !== "0"; } catch (e) {}
			if (u) {
				box.innerHTML = '<span class="wt-hwho"><img src="' + HV().avatar(u.name) + '" alt="" width="24" height="24" loading="lazy"> Logged in as <b>@' + esc(u.name) + '</b></span> <button type="button" class="tu-btn tu-btn--ghost" data-h="logout">Log out</button>';
				$("wt-hive-main").hidden = false;
				var can = !HS().canEncrypt || HS().canEncrypt(); if (!can) $("wt-hive-enc").checked = false; $("wt-hive-enc").disabled = !can;
			} else {
				box.innerHTML = '<div class="wt-hlogin"><input class="tu-input" id="wt-hive-name" type="text" placeholder="Your Hive username" aria-label="Your Hive username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="17"><button type="button" class="tu-btn tu-btn--primary" data-h="login">Log in with Keychain</button></div>';
				$("wt-hive-main").hidden = true;
			}
			paintWarn();
		}
		function paintWarn() {
			var w = $("wt-hive-warn");
			if (HS() && HS().canEncrypt && !HS().canEncrypt()) { w.innerHTML = "⚠ <b>Logged in with the Keychain phone app:</b> it can't use your memo key (pick <b>🛡 Passphrase</b> under the Encrypt tick to encrypt anyway), so a backup made here is <b>public</b> on the Hive blockchain, readable by anyone, forever."; w.className = "wt-hwarn is-open"; return; }
			if (encOn()) { w.innerHTML = (HS().lockMode && HS().lockMode() === "pass" ? "🛡 Locked with your passphrase (quantum-safe): only the passphrase opens it." : "🔒 Encrypted: only your memo key can open it.") + " Others can still see that a backup exists, when, and its size. Saved permanently."; w.className = "wt-hwarn"; }
			else { w.innerHTML = "⚠ <b>Not encrypted:</b> every video link, playlist name and channel will be <b>public on the Hive blockchain, readable by anyone, forever</b>."; w.className = "wt-hwarn is-open"; }
		}
		function hbusyOn(on) { hbusy = on; ["wt-hive-save", "wt-hive-load"].forEach(function (id) { $(id).disabled = on; }); }
		function errText(e) { return (e && (e.message || e.error)) || String(e); }
		function hiveSave() {
			if (hbusy) return;
			var data = W.pick(W.snap(api.S, false), api.S.bk), n = W.snapCount(data);
			if (!n) { hmsg(W.partial(api.S.bk) ? "Nothing is ticked under \u201cWhat to back up\u201d (or the ticked lists are empty)." : "There is nothing to back up yet.", "err"); return; }
			var enc = encOn();
			if (!enc && !confirm("Back up WITHOUT encryption?\n\nAll your video links, playlists and channels will be public on the Hive blockchain, readable by anyone, and can never be deleted.")) return;
			hbusyOn(true);
			var u = HV().user();
			HS().rcPercent(u.name).catch(function () { return null; }).then(function (rc) {
				if (rc != null && rc < 3) throw new Error("Your account's Resource Credits are at " + rc.toFixed(0) + "%. They refill over about five days; try again later.");
				return HS().save(HAPP, HNAME, data, { encrypt: enc, onProgress: function (m) { hmsg(m); } }).then(function (r) {
					hmsg("Backed up " + n + " items to @" + u.name + " on Hive (" + kb(r.bytes) + (enc ? (r.header && r.header.e === 2 ? ", locked with your passphrase (quantum-safe)" : ", encrypted") : ", NOT encrypted") + "). It shows up in the list within a few seconds.", "ok");
					toast("Backed up to Hive"); hiveList = null; setTimeout(function () { hiveLoad(true); }, 4000);
				});
			}).catch(function (e) { hmsg(errText(e), "err"); }).then(function () { hbusyOn(false); });
		}
		function hiveLoad(quiet) {
			if (hbusy && !quiet) return;
			var u = HV().user(); if (!u) return;
			hbusyOn(true); if (!quiet) hmsg("Looking for your backups on Hive…");
			HS().list(u.name, { app: HAPP, name: HNAME, pages: 30 }).then(function (saves) {
				hiveList = saves.slice(0, 12); paintList();
				if (!quiet) hmsg(saves.length ? "Found " + saves.length + (saves.length === 1 ? " backup" : " backups") + "." : "No MES Watch backups on @" + u.name + " yet.", saves.length ? "" : "err");
			}).catch(function (e) { hmsg("Could not read from Hive: " + errText(e), "err"); }).then(function () { hbusyOn(false); });
		}
		function paintList() {
			var box = $("wt-hive-list");
			if (!hiveList || !hiveList.length) { box.innerHTML = ""; return; }
			box.innerHTML = '<table class="tu-table wt-htbl"><thead><tr><th scope="col">Saved</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col"><span class="wt-sr">Actions</span></th></tr></thead><tbody>' +
				hiveList.map(function (e, i) {
					return "<tr><td>" + esc(when(e.time)) + "</td><td>" + HS().lockLabel(e) + "</td><td>" + esc(kb(e.bytes)) + (e.complete ? "" : " (incomplete)") + "</td><td class=\"wt-hacts\">" +
						(e.complete ? '<button type="button" class="tu-btn tu-btn--primary" data-h="merge" data-i="' + i + '" title="Add what you don\'t have yet; keeps yours">Add to mine</button> <button type="button" class="tu-btn" data-h="replace" data-i="' + i + '" title="Replace your lists here with this backup">Replace</button> ' : "") +
						'<button type="button" class="tu-btn tu-btn--ghost" data-h="forget" data-i="' + i + '" title="Hide this backup from the list (it stays on the blockchain)">Hide</button>' +
						(e.trx ? ' <a href="' + HS().explorer(e.trx) + '" target="_blank" rel="noopener">on chain</a>' : "") + "</td></tr>";
				}).join("") + "</tbody></table>";
		}
		function restore(i, mode) {
			var e = hiveList && hiveList[i]; if (!e || hbusy) return;
			hbusyOn(true); hmsg(e.lock === "pass" ? "Unlocking with your passphrase…" : e.encrypted ? "Confirm in Keychain: open the backup with your memo key…" : "Opening the backup…");
			HS().load(e).then(function (data) {
				var mine = W.snap(api.S, true), undo = JSON.stringify(mine);
				if (mode === "replace") {
					if (!confirm("Replace your Up next, Saved, playlists and channels here with this backup (" + W.snapCount(data) + " items)? History stays. You can undo right after.")) { hmsg(""); return; }
					api.apply(W.replaceWith(mine, data));
					toast("Replaced with the Hive backup", function () { api.apply(JSON.parse(undo)); });
					hmsg("Loaded the backup.", "ok");
				} else {
					var r = W.mergeAdd(mine, data); api.apply(r.data);
					toast(r.added ? "Added " + r.added + " from Hive" : "Nothing new in that backup", r.added ? function () { api.apply(JSON.parse(undo)); } : null);
					hmsg(r.added ? "Added " + r.added + (r.added === 1 ? " item" : " items") + " you didn't have. Yours were kept." : "You already have everything in that backup.", "ok");
				}
			}).catch(function (x) { hmsg(errText(x), "err"); }).then(function () { hbusyOn(false); });
		}
		$("wt-hive").addEventListener("click", function (e) {
			var b = e.target.closest("[data-h]"); if (!b) return; var a = b.dataset.h;
			if (a === "login") {
				var name = ($("wt-hive-name").value || "").trim().replace(/^@/, "").toLowerCase();
				if (!name) { $("wt-hive-name").focus(); hmsg("Type your Hive username first.", "err"); return; }
				hmsg("Confirm the login in Keychain…");
				HV().login(name).then(function () { hmsg(""); paintHive(); hiveLoad(true); }).catch(function (x) { hmsg(errText(x), "err"); });
			} else if (a === "logout") { HV().logout(); hiveList = null; paintList(); hmsg(""); paintHive(); }
			else if (a === "merge" || a === "replace") restore(+b.dataset.i, a);
			else if (a === "forget") { var it = hiveList[+b.dataset.i]; if (!confirm("Hide this backup from the list? (It stays on the blockchain.)")) return; HS().forget(HAPP, HNAME, it.s).then(function () { hiveList.splice(+b.dataset.i, 1); paintList(); hmsg("Hidden from the list.", "ok"); }).catch(function (x) { hmsg(errText(x), "err"); }); }
		});
		$("wt-hive").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "wt-hive-name") { e.preventDefault(); $("wt-hive").querySelector('[data-h="login"]').click(); } });
		$("wt-hive-enc").onchange = function () { try { localStorage.setItem(ENC, this.checked ? "1" : "0"); } catch (x) {} paintWarn(); };
		if (HS() && HS().encModeUI) HS().encModeUI($("wt-hive-enc"), function () { paintHive(); });
		$("wt-hive-save").onclick = hiveSave;
		$("wt-hive-load").onclick = function () { hiveLoad(false); };
		if (window.MESHive && MESHive.onChange) MESHive.onChange(function () { if (!$("wt-sync").hidden) { hiveList = null; paintList(); paintHive(); } });
		paint();
		if (/[?&]sync=1\b/.test(location.search) || location.hash === "#sync") $("wt-syncbtn").click();
		return { sync: sync };
	};
})();
