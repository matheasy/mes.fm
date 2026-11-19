/* MES Mail page (mes.fm/email). Core maths in lib.js (window.MESMail); Hive login / signing through /main_js/hive.js (MESHive).
   On localhost / 127.0.0.1 or with ?mock=1 the page runs on a pretend chain in localStorage ("mes-email:mockchain") so two tabs can
   write to each other without Keychain. */
(function () {
	"use strict";
	var M = window.MESMail;
	var $ = function (id) { return document.getElementById(id); };
	var root = $("em");
	if (!root || !M) return;

	var NOBLE = "https://cdn.jsdelivr.net/npm/@noble/post-quantum@0.7.1/hybrid.js/+esm";
	var NOBLE2 = "https://esm.sh/@noble/post-quantum@0.7.1/hybrid.js";
	var MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-email:";
	var TX_GAP = 3500;

	function ls(k, v) {
		try {
			if (v === undefined) { var s = localStorage.getItem(LS + k); return s ? JSON.parse(s) : null; }
			if (v === null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, JSON.stringify(v));
		} catch (e) { return null; }
	}
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function toast(msg) { var t = $("em-toast"); if (!t) { t = el("div", "tu-toast"); t.id = "em-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3200); }
	function status(msg, bad) { var s = $("em-status"); s.textContent = msg || ""; s.classList.toggle("is-bad", !!bad); }
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	function when(t) {
		if (!t) return "";
		var d = new Date(t + (/Z$/.test(t) ? "" : "Z")), now = new Date();
		if (isNaN(d)) return t;
		if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		if (now - d < 300 * 864e5) return d.toLocaleDateString([], { month: "short", day: "numeric" });
		return d.toLocaleDateString();
	}
	function whenLong(t) { var d = new Date(t + (/Z$/.test(t) ? "" : "Z")); return isNaN(d) ? t : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
	function avatar(n) { return '<img class="em-av" alt="" loading="lazy" src="https://images.hive.blog/u/' + encodeURIComponent(n) + '/avatar/small" onerror="this.style.visibility=\'hidden\'">'; }
	/* message text -> safe HTML: escaped, links made clickable (no images: they could track who opened a message), > quotes */
	function renderBody(text) {
		var lines = String(text || "").split("\n"), out = [], q = [];
		function flushQ() { if (q.length) { out.push('<blockquote>' + q.join("<br>") + '</blockquote>'); q = []; } }
		lines.forEach(function (l) {
			var h = esc(l).replace(/(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="nofollow noopener noreferrer">$1</a>')
				.replace(/(^|[\s(])@([a-z][a-z0-9.-]{2,15})\b/g, '$1<a href="https://peakd.com/@$2" target="_blank" rel="noopener">@$2</a>')
				.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
			if (/^&gt;\s?/.test(h)) q.push(h.replace(/^&gt;\s?/, "")); else { flushQ(); out.push(h); }
		});
		flushQ();
		return out.join("<br>").replace(/(<br>){3,}/g, "<br><br>");
	}

	/* ================= Hive access (real or pretend) ================= */
	var H;
	if (!MOCK) {
		var MH = window.MESHive;
		var kc = function (fn) {
			return MH.keychain().then(function (k) {
				if (!k) throw new Error("Hive Keychain was not found. Install it, or use the Keychain phone app.");
				return new Promise(function (res, rej) { fn(k, function (r) { if (r && r.success) res(r); else rej(MH.kcError(r)); }); });
			});
		};
		H = {
			user: function () { var u = MH.user(); return u && u.name; },
			login: function (n) { return MH.login(n).then(function (u) { return u.name; }); },
			logout: function () { MH.logout(); },
			call: function (m, p) { return MH.call(m, p, { timeout: 15000 }); },
			broadcast: function (ops, key, title) { var a = H.user(); return kc(function (k, d) { k.requestBroadcast(a, ops, key, d, null, title); }); },
			classicSend: function (to, text, cur) { var a = H.user(); return kc(function (k, d) { k.requestTransfer(a, to, "0.001", "#" + text, cur, d, true); }); },
			decodeMemo: function (memo) { var a = H.user(); return kc(function (k, d) { k.requestVerifyKey(a, memo, "Memo", d); }).then(function (r) { return String(r.result || ""); }); },
			memoOk: function () { return MH.memoOk(); },
			onChange: function (fn) { MH.onChange(fn); }
		};
	} else {
		/* ---------- pretend chain ---------- */
		var chain = function () { return ls("mockchain") || { acc: {}, h: {}, n: 0 }; };
		var save = function (c) { ls("mockchain", c); };
		var hpush = function (c, acc, op) {
			c.n++;
			(c.h[acc] = c.h[acc] || []).push([c.h[acc].length, { trx_id: "mock" + c.n, block: c.n, timestamp: new Date().toISOString().slice(0, 19), op: op }]);
		};
		var ensure = function (c, n) { if (!c.acc[n]) { c.acc[n] = { meta: "", hbd: 5 }; } };
		var mu = function () { try { return sessionStorage.getItem(LS + "mockuser"); } catch (e) { return null; } };
		var listeners = [];
		H = {
			user: function () { return mu(); },
			login: function (n) { n = M.cleanName(n); if (!M.validName(n)) return Promise.reject(new Error("That is not a valid Hive username.")); var c = chain(); ensure(c, n); save(c); try { sessionStorage.setItem(LS + "mockuser", n); } catch (e) {} return Promise.resolve(n); },
			logout: function () { try { sessionStorage.removeItem(LS + "mockuser"); } catch (e) {} },
			call: function (m, p) {
				var c = chain();
				return sleep(60).then(function () {
					if (m === "condenser_api.get_accounts") return p[0].filter(function (n) { return c.acc[n]; }).map(function (n) { return { name: n, posting_json_metadata: c.acc[n].meta, hbd_balance: c.acc[n].hbd.toFixed(3) + " HBD" }; });
					if (m === "condenser_api.get_account_history") {
						var h = c.h[p[0]] || [], start = p[1], lim = p[2], f = p[3];
						h = h.filter(function (e) { var t = e[1].op[0]; return (f & M.F_TRANSFER && t === "transfer") || (f & M.F_CUSTOM && t === "custom_json"); });
						var end = start < 0 ? h.length - 1 : h.reduce(function (a, e, i) { return e[0] <= start ? i : a; }, -1);
						return h.slice(Math.max(0, end - lim + 1), end + 1);
					}
					throw new Error("mock: " + m);
				});
			},
			broadcast: function (ops) {
				if (!confirm("Test mode: pretend to sign " + ops.length + " operation(s) (" + ops.map(function (o) { return o[0]; }).join(", ") + ")?")) return Promise.reject(new Error("You cancelled in Keychain."));
				var c = chain(), me = mu();
				ops.forEach(function (o) {
					var d = o[1];
					if (o[0] === "custom_json") hpush(c, me, o);
					else if (o[0] === "transfer") { ensure(c, d.to); hpush(c, d.from, o); if (d.to !== d.from) hpush(c, d.to, o); }
					else if (o[0] === "account_update2") c.acc[me].meta = d.posting_json_metadata;
				});
				save(c);
				return sleep(200).then(function () { return { success: true, result: { id: "mock" + c.n } }; });
			},
			classicSend: function (to, text, cur) { return H.broadcast([["transfer", { from: mu(), to: to, amount: "0.001 " + cur, memo: "#mock-memo-key-encrypted-stand-in:" + M.b64(M.utf8(text)) }]]); },
			decodeMemo: function (memo) { return Promise.resolve("#" + new TextDecoder().decode(M.unb64(memo.replace(/^#mock-memo-key-encrypted-stand-in:/, "")))); },
			memoOk: function () { return true; },
			onChange: function (fn) { listeners.push(fn); }
		};
		window.addEventListener("storage", function (e) { if (e.key === LS + "mockchain" && S.keys) refresh(true); });
	}

	/* ================= state ================= */
	var S = {
		me: null, keys: null, published: null, folder: "inbox", th: null, q: "",
		cache: null, open: {}, threads: [], keyCache: {}, busy: false
	};
	var prefs = ls("v1") || { cur: "HBD" };
	function savePrefs() { ls("v1", prefs); }

	var kemP = null;
	function loadKem() {
		if (kemP) return kemP;
		var imp = new Function("u", "return import(u)");
		kemP = imp(NOBLE).catch(function () { return imp(NOBLE2); }).then(function (mod) {
			if (!mod || !mod.ml_kem768_x25519) throw new Error("bad module");
			M.setKem(mod.ml_kem768_x25519);
		}).catch(function (e) { kemP = null; throw new Error("The encryption library could not be loaded. Check your connection and reload the page."); });
		return kemP;
	}

	function show(id) { ["em-login", "em-setup", "em-unlock", "em-app"].forEach(function (x) { $(x).hidden = x !== id; }); }
	function paintWho() {
		var w = $("em-who");
		if (!S.me) { w.innerHTML = '<span class="em-brand">📧 MES Mail</span>'; }
		else w.innerHTML = avatar(S.me) + '<span><b>@' + esc(S.me) + '</b><small>' + (S.keys ? '🔓 unlocked' : S.published ? '🔒 locked' : 'not set up yet') + '</small></span>';
		$("em-logout").hidden = !S.me;
		$("em-lock").hidden = !S.keys;
		$("em-refresh").hidden = !S.keys;
	}

	/* ================= accounts and keys ================= */
	function getAccounts(names) {
		var need = names.filter(function (n) { return !(n in S.keyCache); });
		if (!need.length) return Promise.resolve();
		return H.call("condenser_api.get_accounts", [need]).then(function (r) {
			var found = {};
			(r || []).forEach(function (a) { found[a.name] = 1; S.keyCache[a.name] = { exists: true, key: M.profileKey(a.posting_json_metadata), meta: a.posting_json_metadata || "" }; });
			need.forEach(function (n) { if (!found[n]) S.keyCache[n] = { exists: false, key: null }; });
		});
	}
	function start() {
		S.me = H.user();
		S.keys = null; S.published = null; S.cache = null; S.open = {}; S.threads = []; S.th = null; S.folder = "inbox"; S.q = ""; S.memoTxt = {}; S.cls = null;
		root.classList.remove("em-reading"); $("em-cf").hidden = true; $("em-thread").hidden = true; $("em-classicv").hidden = true; $("em-empty").hidden = false;
		paintWho();
		$("em-mock").hidden = !MOCK;
		if (!S.me) { show("em-login"); $("em-kchelp").innerHTML = MOCK || !window.MESHive ? "" : MESHive.helpHtml(); status(""); return; }
		status("Reading your account…");
		delete S.keyCache[S.me];
		getAccounts([S.me]).then(function () {
			var a = S.keyCache[S.me];
			if (!a.exists) { status("Hive account @" + S.me + " was not found.", true); return; }
			S.published = a.key;
			paintWho();
			var saved = ls("seed:" + S.me);
			if (S.published && saved) {
				status("Unlocking…");
				return loadKem().then(function () { return useSeed(M.unb64(saved), false); }).catch(function (e) { status(e.message, true); show("em-unlock"); });
			}
			status("");
			if (S.published) { show("em-unlock"); setTimeout(function () { $("em-up").focus(); }, 50); }
			else { show("em-setup"); resetSetup(); }
			loadKem().catch(function (e) { status(e.message, true); });
		}).catch(function (e) { status("Could not reach a Hive node: " + e.message, true); });
	}
	function useSeed(seed, remember) {
		var k = M.keysFromSeed(seed);
		if (S.published && M.hex(k.pub) !== M.hex(S.published.pub)) {
			ls("seed:" + S.me, null);
			throw new Error("That passphrase doesn't match the mail key on your account.");
		}
		if (remember) ls("seed:" + S.me, M.b64(seed));
		S.keys = k;
		S.cache = ls("c:" + S.me) || { top: null, notices: [], classic: [], env: {}, pend: [], nf: {} };
		S.read = ls("read:" + S.me) || {};
		show("em-app"); S.showLow = false; paintFilter();
		paintWho();
		M.fingerprint(k.pub).then(function (fp) {
			$("em-keybox").innerHTML = '<b>Your mail key</b><code>' + esc(fp) + '</code><small>Quantum-safe X-Wing (ML-KEM-768 + X25519). People who write to you see the same code.</small>';
		});
		decryptAll().then(function () { paint(); refresh(); });
	}

	/* ---------- setup ---------- */
	function resetSetup() { $("em-p1").value = $("em-p2").value = ""; $("em-wrote").checked = false; checkSetup(); }
	function checkSetup() {
		var p = $("em-p1").value, bits = M.passBits(p), okLen = p.length >= 12 && bits >= 60;
		var pct = Math.min(100, Math.round(bits / 1.3));
		$("em-bar").style.width = pct + "%";
		$("em-bar").className = bits >= 100 ? "is-good" : bits >= 60 ? "is-ok" : "is-weak";
		$("em-bits").textContent = p ? "About " + bits + " bits. " + (bits >= 100 ? "Strong." : bits >= 60 ? "OK, longer is safer." : "Too weak: use at least 12 characters, or press Make one for me.") : "Use at least 12 characters. Make one for me gives a random ~149-bit passphrase.";
		var same = p && p === $("em-p2").value;
		$("em-publish").disabled = !(okLen && same && $("em-wrote").checked);
		$("em-setupnote").textContent = p && $("em-p2").value && !same ? "The two passphrases are not the same." : "";
	}
	["em-p1", "em-p2"].forEach(function (id) { $(id).addEventListener("input", checkSetup); });
	$("em-wrote").addEventListener("change", checkSetup);
	$("em-gen").onclick = function () { var g = M.generatePass(); $("em-p1").value = $("em-p2").value = g; $("em-p1").type = $("em-p2").type = "text"; $("em-show").textContent = "Hide"; checkSetup(); };
	$("em-show").onclick = function () { var t = $("em-p1").type === "password" ? "text" : "password"; $("em-p1").type = $("em-p2").type = t; this.textContent = t === "text" ? "Hide" : "Show"; };
	$("em-publish").onclick = function () {
		var btn = this, pass = $("em-p1").value;
		btn.disabled = true;
		$("em-setupnote").textContent = "Making your keys…";
		var seed, keys;
		loadKem().then(function () { return M.deriveSeed(pass, S.me); }).then(function (s) {
			seed = s; keys = M.keysFromSeed(s);
			delete S.keyCache[S.me];
			return getAccounts([S.me]);
		}).then(function () {
			var meta = M.mergeProfile(S.keyCache[S.me].meta, keys.pub);
			if (meta.length > 60000) throw new Error("Your profile data is too big to add the key.");
			$("em-setupnote").textContent = "Approve in Keychain (Posting key)…";
			return H.broadcast([["account_update2", { account: S.me, json_metadata: "", posting_json_metadata: meta, extensions: [] }]], "Posting", "Publish your MES Mail key");
		}).then(function () {
			S.published = { pub: keys.pub };
			S.keyCache[S.me] = { exists: true, key: S.published };
			toast("Your mail key is published. You can receive mail now.");
			useSeed(seed, $("em-rem1").checked);
		}).catch(function (e) { $("em-setupnote").textContent = e.message; btn.disabled = false; checkSetup(); });
	};
	$("em-unlockf").onsubmit = function (ev) {
		ev.preventDefault();
		var p = $("em-up").value;
		if (!p) return;
		$("em-unlocknote").textContent = "Unlocking…";
		loadKem().then(function () { return M.deriveSeed(p, S.me); }).then(function (seed) {
			useSeed(seed, $("em-rem2").checked);
			$("em-up").value = ""; $("em-unlocknote").textContent = "";
		}).catch(function (e) { $("em-unlocknote").textContent = e.message; });
	};
	$("em-rekey").onclick = function () {
		if (!confirm("Make a new mail key? Messages sent to your old key can never be opened again.")) return;
		S.published = null; ls("seed:" + S.me, null); show("em-setup"); resetSetup(); paintWho();
	};
	$("em-loginf").onsubmit = function (ev) {
		ev.preventDefault();
		var n = $("em-user").value;
		status("Logging in…");
		H.login(n).then(function () { start(); }).catch(function (e) { status(e.message, true); });
	};
	$("em-logout").onclick = function () { H.logout(); start(); };
	$("em-lock").onclick = function () { ls("seed:" + S.me, null); S.keys = null; start(); };
	$("em-refresh").onclick = function () { refresh(); };
	H.onChange(function () { if (H.user() !== S.me) start(); });

	/* ================= reading ================= */
	function saveCache() {
		var c = S.cache, keys = Object.keys(c.env);
		if (keys.length > 400) keys.sort(function (a, b) { return c.env[a].t < c.env[b].t ? -1 : 1; }).slice(0, keys.length - 400).forEach(function (k) { delete c.env[k]; });
		c.notices = c.notices.slice(-600); c.classic = c.classic.slice(-300); c.pend = c.pend.slice(-60);
		ls("c:" + S.me, c);
	}
	function decryptAll() {
		var c = S.cache, jobs = [];
		Object.keys(c.env).forEach(function (k) {
			if (S.open[k]) return;
			var e = c.env[k];
			jobs.push(M.open(e.env, e.msgId, S.me, S.keys.sk).then(function (p) { S.open[k] = p; }, function (er) { S.open[k] = { err: er.message }; }));
		});
		return Promise.all(jobs).then(buildThreads);
	}
	function buildThreads() {
		var c = S.cache, msgs = [], amts = {};
		(c.notices || []).forEach(function (n) { if (n.amount) amts[n.from + "/" + n.msgId] = n.amount; });
		Object.keys(c.env).forEach(function (k) {
			var e = c.env[k], p = S.open[k];
			if (!p) return;
			msgs.push({ key: k, amt: e.from === S.me ? (c.sentAmt && c.sentAmt[k]) || null : amts[k] || null, from: e.from, to: e.env.to, msgId: e.msgId, t: e.t, trx: e.trx, payload: p.err ? { s: "(could not be opened)", b: p.err, th: e.msgId } : p, err: p.err });
		});
		S.threads = M.threads(msgs, S.me);
	}
	var refreshing = false;
	function refresh(quiet) {
		if (refreshing || !S.keys) return;
		refreshing = true;
		if (!quiet) status("Checking for mail…");
		var c = S.cache, me = S.me;
		M.scanMine(H.call, me, { top: c.top }).then(function (r) {
			c.top = r.top;
			var seenN = {}; c.notices.forEach(function (n) { seenN[n.from + "/" + n.msgId] = 1; });
			r.notices.forEach(function (n) { if (!seenN[n.from + "/" + n.msgId]) { c.notices.push({ from: n.from, msgId: n.msgId, t: n.t, trx: n.trx, amount: n.amount }); seenN[n.from + "/" + n.msgId] = 1; } });
			var seenC = {}; c.classic.forEach(function (x) { seenC[x.trx + x.memo.slice(1, 12)] = 1; });
			r.classic.forEach(function (x) { var k = x.trx + x.memo.slice(1, 12); if (!seenC[k]) { c.classic.push({ from: x.from, to: x.to, memo: x.memo, amount: x.amount, t: x.t, trx: x.trx }); seenC[k] = 1; } });
			var asm = M.assemble(c.pend.concat(r.pieces));
			var done = {};
			Object.keys(asm).forEach(function (k) { if (!c.env[k]) c.env[k] = asm[k]; done[asm[k].msgId] = 1; });
			c.pend = c.pend.concat(r.pieces).filter(function (p) { return !done[p.m]; });
			/* messages announced to me that we don't have yet, grouped by sender */
			var want = {};
			c.notices.forEach(function (n) {
				var k = n.from + "/" + n.msgId;
				if (c.env[k] || (c.miss && c.miss[k] > 2)) return;
				(want[n.from] = want[n.from] || []).push(n);
			});
			var senders = Object.keys(want);
			if (senders.length && !quiet) status("Fetching " + Object.values(want).reduce(function (a, l) { return a + l.length; }, 0) + " new message(s)…");
			return senders.reduce(function (p, s) {
				return p.then(function () {
					var list = want[s], oldest = list.reduce(function (a, n) { return !a || n.t < a ? n.t : a; }, "");
					return M.fetchFrom(H.call, s, list.map(function (n) { return n.msgId; }), oldest).then(function (got) {
						list.forEach(function (n) {
							var k = s + "/" + n.msgId;
							if (got[k]) c.env[k] = got[k];
							else { c.miss = c.miss || {}; c.miss[k] = (c.miss[k] || 0) + 1; }
						});
					}, function () {});
				});
			}, Promise.resolve());
		}).then(function () {
			saveCache();
			return decryptAll();
		}).then(function () {
			refreshing = false;
			paint();
			status(quiet ? "" : "Up to date · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
		}).catch(function (e) { refreshing = false; status("Could not check for mail: " + e.message, true); });
	}
	setInterval(function () { if (S.keys && !document.hidden) refresh(true); }, 90000);
	document.addEventListener("visibilitychange", function () { if (!document.hidden && S.keys) refresh(true); });

	/* ================= painting ================= */
	function unread(th) { return th.msgs.some(function (m) { return m.from !== S.me && !S.read[m.key]; }); }
	function inFolder(th, f) { return f === "inbox" ? th.inbox : f === "sent" ? th.sent : true; }
	function fkey() { return "fl:" + S.me; }
	function fset() { return ls(fkey()) || { mode: "off", min: "" }; }
	/* a thread is low-paid when it has mail from others and every piece of it paid under my minimum, and I never wrote in it */
	function lowThread(th) {
		var f = fset();
		if (f.mode === "off" || th.msgs.some(function (m) { return m.from === S.me; })) return false;
		return th.msgs.length > 0 && th.msgs.every(function (m) { return M.lowPaid(m.amt, f); });
	}
	function payText(th) {
		var best = null;
		th.msgs.forEach(function (m) { var a = M.parseAmount(m.amt); if (a && (!best || a.n > best.n)) best = m; });
		return best ? (best.from === S.me ? "sent with " : "paid ") + best.amt : "";
	}
	function paintFilter() {
		var f = fset();
		$("em-fmode").value = f.mode; $("em-fmin").value = f.min;
		$("em-fsum").textContent = "Spam filter: " + (f.mode === "off" || !f.min ? "off" : (f.mode === "hide" ? "hiding" : "marking") + " mail under " + f.min);
	}
	function saveFilter() {
		var f = { mode: $("em-fmode").value, min: $("em-fmin").value.trim().replace(",", ".") };
		if (f.min && !(parseFloat(f.min) > 0)) f.min = "";
		if (!f.min) f.mode = "off";
		ls(fkey(), f); paintFilter(); paintList();
	}
	function matches(th) {
		if (!S.q) return true;
		var q = S.q.toLowerCase();
		return th.people.join(" ").indexOf(q) >= 0 || th.msgs.some(function (m) { return (m.payload.s + " " + m.payload.b + " " + m.from).toLowerCase().indexOf(q) >= 0; });
	}
	function paint() {
		var ni = S.threads.filter(function (t) { return t.inbox && unread(t); }).length;
		$("em-ninbox").textContent = ni ? ni : "";
		$("em-nsent").textContent = "";
		$("em-nclassic").textContent = S.cache && S.cache.classic.length ? S.cache.classic.length : "";
		document.title = (ni ? "(" + ni + ") " : "") + document.title.replace(/^\(\d+\) /, "");
		Array.prototype.forEach.call(document.querySelectorAll(".em-fold"), function (b) { b.classList.toggle("is-on", b.dataset.f === S.folder); b.setAttribute("aria-current", b.dataset.f === S.folder ? "page" : "false"); });
		paintList();
		if (S.folder === "classic") paintClassic();
		else if (S.th && $("em-cf").hidden) paintThread();
	}
	function paintList() {
		var box = $("em-list");
		$("em-q").hidden = S.folder === "classic";
		if (S.folder === "classic") {
			var cl = S.cache.classic.slice().reverse();
			box.innerHTML = cl.length ? "" : '<p class="em-none">No encrypted Hive memos found in your recent history.</p>';
			cl.forEach(function (x, i) {
				var out = x.from === S.me;
				var b = el("button", "em-item" + (S.cls === x.trx ? " is-on" : ""));
				b.type = "button";
				b.innerHTML = avatar(out ? x.to : x.from) + '<span class="em-it"><span class="em-ip"><b>' + (out ? "To @" + esc(x.to) : "@" + esc(x.from)) + '</b><time>' + esc(when(x.t)) + '</time></span><span class="em-is">' + esc(x.amount) + '</span><span class="em-ib">🔑 Encrypted memo' + (S.memoTxt && S.memoTxt[x.trx] ? ": " + esc(S.memoTxt[x.trx].slice(0, 80)) : "") + '</span></span>';
				b.onclick = function () { S.cls = x.trx; paintList(); paintClassic(); narrow(true); };
				box.appendChild(b);
			});
			return;
		}
		$("em-filter").hidden = S.folder === "sent";
		var f = fset(), hid = 0;
		var list = S.threads.filter(function (t) {
			if (!inFolder(t, S.folder) || !matches(t)) return false;
			if (S.folder === "inbox" && f.mode === "hide" && lowThread(t) && !S.showLow) { hid++; return false; }
			return true;
		});
		$("em-fhid").innerHTML = hid ? hid + " hidden. " : "";
		if (hid) { var sb = el("button", "tu-btn tu-btn--ghost"); sb.type = "button"; sb.textContent = "Show them"; sb.onclick = function () { S.showLow = true; paintList(); }; $("em-fhid").appendChild(sb); }
		else if (S.showLow && f.mode === "hide") { var hb = el("button", "tu-btn tu-btn--ghost"); hb.type = "button"; hb.textContent = "Hide low-payment mail again"; hb.onclick = function () { S.showLow = false; paintList(); }; $("em-fhid").appendChild(hb); }
		box.innerHTML = list.length ? "" : '<p class="em-none">' + (S.q ? "Nothing matches." : S.folder === "sent" ? "You haven't sent anything yet." : "No mail yet. Messages people send you show up here.") + '</p>';
		list.forEach(function (th) {
			var last = th.last, u = unread(th);
			var who = th.people.length ? th.people.map(function (p) { return "@" + p; }).join(", ") : "@" + S.me;
			var b = el("button", "em-item" + (u ? " is-unread" : "") + (S.th === th.th ? " is-on" : ""));
			b.type = "button";
			b.innerHTML = avatar(th.people[0] || S.me) + '<span class="em-it"><span class="em-ip"><b>' + esc(who) + (th.msgs.length > 1 ? ' <small>' + th.msgs.length + '</small>' : '') + '</b><time>' + esc(when(last.t)) + '</time></span>' +
				'<span class="em-is">' + esc(th.subject || "(no subject)") + (lowThread(th) ? ' <span class="em-low" title="Paid less than your minimum">low payment</span>' : '') + (payText(th) ? ' <span class="em-pay">' + esc(payText(th)) + '</span>' : '') + '</span><span class="em-ib">' + (last.from === S.me ? "You: " : "") + esc(String(last.payload.b || "").replace(/\s+/g, " ").slice(0, 120)) + '</span></span>';
			b.onclick = function () { openThread(th.th); };
			box.appendChild(b);
		});
	}
	function threadOf(id) { return S.threads.filter(function (t) { return t.th === id; })[0]; }
	function openThread(id) {
		S.th = id; S.cls = null;
		$("em-cf").hidden = true; $("em-classicv").hidden = true;
		var th = threadOf(id);
		if (th) { th.msgs.forEach(function (m) { S.read[m.key] = 1; }); ls("read:" + S.me, S.read); }
		paint(); paintThread(); narrow(true);
	}
	function paintThread() {
		var th = threadOf(S.th), box = $("em-thread");
		$("em-empty").hidden = !!th; box.hidden = !th;
		if (!th) return;
		var html = '<div class="em-cfhead"><button type="button" class="tu-btn tu-btn--ghost em-back" data-back>‹ Back</button><h2>' + esc(th.subject || "(no subject)") + '</h2></div>' +
			'<p class="em-people">With ' + (th.people.length ? th.people.map(function (p) { return '<a href="https://peakd.com/@' + esc(p) + '" target="_blank" rel="noopener">@' + esc(p) + '</a>'; }).join(", ") : "yourself") + ' · <span class="em-lockt">🔒 end-to-end encrypted, quantum-safe</span></p>';
		th.msgs.forEach(function (m, i) {
			var nf = S.cache.nf && S.cache.nf[m.key];
			html += '<article class="em-msg' + (m.err ? " is-err" : "") + '" data-k="' + esc(m.key) + '"><header>' + avatar(m.from) + '<div><b>@' + esc(m.from) + '</b><small>to ' + m.to.map(function (t) { return "@" + esc(t); }).join(", ") + (m.amt ? ' · ' + (m.from === S.me ? 'sent with ' : 'paid ') + esc(m.amt) : '') + '</small></div><time title="' + esc(m.t) + ' UTC">' + esc(whenLong(m.t)) + '</time></header>' +
				(m.payload.s && i > 0 ? '<p class="em-msubj">' + esc(m.payload.s) + '</p>' : '') +
				'<div class="em-mbody">' + renderBody(m.payload.b) + '</div>' +
				'<footer>' + (nf ? '<button type="button" class="tu-btn" data-act="notice">⚠ Send the delivery notice again</button>' : '') +
				'<button type="button" class="tu-btn tu-btn--ghost" data-act="reply">↩ Reply</button>' + (M.replyAll(m, S.me).length > 1 ? '<button type="button" class="tu-btn tu-btn--ghost" data-act="all">↩↩ Reply all</button>' : '') +
				'<button type="button" class="tu-btn tu-btn--ghost" data-act="fwd">→ Forward</button><button type="button" class="tu-btn tu-btn--ghost" data-act="copy">Copy text</button>' +
				(m.trx && !MOCK ? '<a class="em-trx" href="https://hivehub.dev/tx/' + esc(m.trx) + '" target="_blank" rel="noopener" title="The signed operation on the Hive blockchain">on chain ↗</a>' : '') + '</footer></article>';
		});
		box.innerHTML = html;
	}
	$("em-thread").addEventListener("click", function (ev) {
		var b = ev.target.closest("[data-act]"); if (!b) return;
		var art = b.closest(".em-msg"), th = threadOf(S.th);
		var m = th && th.msgs.filter(function (x) { return x.key === art.dataset.k; })[0];
		if (!m) return;
		var a = b.dataset.act;
		if (a === "copy") { navigator.clipboard.writeText(m.payload.b).then(function () { toast("Copied."); }); return; }
		if (a === "notice") { resendNotice(m); return; }
		if (a === "fwd") compose({ subject: "Fwd: " + (th.subject || ""), body: "\n\n---------- Forwarded message ----------\nFrom: @" + m.from + "\nDate: " + m.t.replace("T", " ") + " UTC\n\n" + m.payload.b });
		else compose({ to: a === "all" ? M.replyAll(m, S.me) : [m.from === S.me ? m.to[0] : m.from], subject: M.replySubject(th.subject), body: M.quote(m.payload.b, m.from, m.t), th: m.payload.th || m.msgId, re: m.msgId });
	});
	root.addEventListener("click", function (ev) { if (ev.target.closest("[data-back]")) { narrow(false); } });
	function narrow(reading) { root.classList.toggle("em-reading", !!reading); if (reading && root.classList.contains("em-w1")) $("em-read").scrollIntoView({ block: "start", behavior: "smooth" }); }

	Array.prototype.forEach.call(document.querySelectorAll(".em-fold"), function (b) {
		b.onclick = function () { S.folder = b.dataset.f; S.th = null; S.cls = null; $("em-thread").hidden = true; $("em-classicv").hidden = true; $("em-cf").hidden = true; $("em-empty").hidden = false; narrow(false); paint(); };
	});
	$("em-q").addEventListener("input", function () { S.q = this.value.trim(); paintList(); });

	/* ---------- classic memos ---------- */
	function paintClassic() {
		var box = $("em-classicv"), x = S.cache.classic.filter(function (c) { return c.trx === S.cls; })[0];
		$("em-thread").hidden = true; $("em-cf").hidden = true;
		$("em-empty").hidden = !!x; box.hidden = !x;
		if (!x) return;
		S.memoTxt = S.memoTxt || {};
		var txt = S.memoTxt[x.trx], out = x.from === S.me;
		box.innerHTML = '<div class="em-cfhead"><button type="button" class="tu-btn tu-btn--ghost em-back" data-back>‹ Back</button><h2>Classic memo</h2></div>' +
			'<article class="em-msg"><header>' + avatar(x.from) + '<div><b>@' + esc(x.from) + '</b><small>to @' + esc(x.to) + ' · ' + esc(x.amount) + '</small></div><time>' + esc(whenLong(x.t)) + '</time></header>' +
			(txt != null ? '<div class="em-mbody">' + renderBody(txt.replace(/^#/, "")) + '</div>' :
				H.memoOk() ? '<p>This memo is encrypted with Hive memo keys. Keychain can open it with your memo key.</p><button type="button" class="tu-btn tu-btn--primary" id="em-dec">🔑 Decrypt with Keychain</button>' :
				'<p>You are logged in with the Keychain phone app (HiveAuth), which can\'t open memos. Use the Keychain browser extension to read it.</p>') +
			'<footer><button type="button" class="tu-btn tu-btn--ghost" id="em-creply">↩ Reply with MES Mail</button></footer></article>' +
			'<p class="tu-note">Classic memos are locked with elliptic-curve keys, which a future quantum computer could break. MES Mail messages are not.</p>';
		var d = $("em-dec");
		if (d) d.onclick = function () {
			d.disabled = true;
			H.decodeMemo(x.memo).then(function (t) { S.memoTxt[x.trx] = t; paintClassic(); paintList(); }).catch(function (e) { d.disabled = false; toast(e.message); });
		};
		$("em-creply").onclick = function () { compose({ to: [out ? x.to : x.from] }); };
	}

	/* ================= compose / send ================= */
	var draft = { th: null, re: null };
	function compose(o) {
		o = o || {};
		S.folder = S.folder === "classic" ? "inbox" : S.folder;
		draft = { th: o.th || null, re: o.re || null };
		$("em-cft").textContent = o.re ? "Reply" : "New message";
		$("em-to").value = (o.to || []).map(function (n) { return "@" + n; }).join(", ");
		$("em-subj").value = o.subject || "";
		$("em-body").value = o.body || "";
		$("em-sendnote").textContent = "";
		$("em-curr").value = prefs.cur || "HBD"; $("em-amt").value = prefs.amt || "0.001";
		$("em-thread").hidden = true; $("em-classicv").hidden = true; $("em-empty").hidden = true; $("em-cf").hidden = false;
		narrow(true);
		checkTo();
		setTimeout(function () { (o.to && o.to.length ? $("em-body") : $("em-to")).focus(); if (o.re) { $("em-body").setSelectionRange(0, 0); $("em-body").scrollTop = 0; } }, 30);
	}
	$("em-new").onclick = function () { var d = ls("draft"); compose(d && !d.re ? { to: M.parseTo(d.to).names, subject: d.s, body: d.b } : {}); };
	var toT;
	function checkTo() {
		clearTimeout(toT);
		toT = setTimeout(function () {
			var p = M.parseTo($("em-to").value), box = $("em-tochips");
			estimate();
			if (!p.names.length && !p.bad.length) { box.innerHTML = ""; $("em-classic").hidden = true; return; }
			getAccounts(p.names).then(function () {
				var contacts = ls("contacts") || {};
				var html = p.bad.map(function (b) { return '<span class="em-chip is-bad">' + esc(b) + ' · not a Hive name</span>'; }).join("");
				var jobs = p.names.map(function (n) {
					var a = S.keyCache[n];
					if (!a.exists) return Promise.resolve('<span class="em-chip is-bad">@' + esc(n) + ' · no such account</span>');
					if (!a.key) return Promise.resolve('<span class="em-chip is-warn" title="This account has not set up MES Mail yet">@' + esc(n) + ' · no mail key yet</span>');
					return M.fingerprint(a.key.pub).then(function (fp) {
						var changed = contacts[n] && contacts[n] !== fp;
						return '<span class="em-chip ' + (changed ? "is-bad" : "is-good") + '" title="Key ' + esc(fp) + '">🔒 @' + esc(n) + (changed ? " · key changed since you last wrote!" : "") + '</span>';
					});
				});
				return Promise.all(jobs).then(function (parts) {
					var noKey = p.names.filter(function (n) { return S.keyCache[n].exists && !S.keyCache[n].key; });
					box.innerHTML = html + parts.join("") + (noKey.length ? '<p class="em-nokey">' + noKey.map(function (n) { return "@" + esc(n); }).join(", ") + (noKey.length > 1 ? " haven't" : " hasn't") +
						' set up MES Mail. <button type="button" class="em-link" id="em-invite">Copy an invite</button>' + (p.names.length === 1 ? ' or send a classic memo (not quantum-safe, about 1,400 characters).' : '.') + '</p>' : "");
					$("em-classic").hidden = !(p.names.length === 1 && noKey.length === 1);
					var inv = $("em-invite");
					if (inv) inv.onclick = function () { navigator.clipboard.writeText("I'd like to send you an encrypted message. MES Mail is free, uses your Hive account and is quantum-safe: https://mes.fm/email").then(function () { toast("Invite copied: paste it in a DM or comment."); }); };
				});
			}).catch(function () {});
		}, 350);
	}
	function estimate() {
		var p = M.parseTo($("em-to").value), n = p.names.filter(function (x) { return x !== S.me; }).length;
		if (!S.me || !p.names.length) { $("em-est").textContent = ""; return; }
		var e = M.estimate(p.names, S.me, $("em-body").value, $("em-subj").value);
		var cur = $("em-curr").value, amt = M.cleanAmount($("em-amt").value);
		Array.prototype.forEach.call(document.querySelectorAll(".em-pre"), function (b) { b.classList.toggle("is-on", parseFloat(b.dataset.a) === amt); });
		$("em-est").textContent = "About " + (e.bytes / 1000).toFixed(1) + " KB encrypted · Keychain: " + e.txs + " Posting approval" + (e.txs > 1 ? "s" : "") + (n ? " + 1 Active approval for the payment (" + M.fmtAmount(amt, cur) + " to each of " + n + " = " + (amt * n).toFixed(3) + " " + cur + " in all, the recipients keep it; a bigger amount helps your mail pass their spam filters)" : "") + "." +
			(e.pieces > M.MAX_PIECES ? " Too long: shorten the message." : "");
	}
	$("em-to").addEventListener("input", function () { checkTo(); saveDraft(); });
	$("em-subj").addEventListener("input", function () { estimate(); saveDraft(); });
	$("em-body").addEventListener("input", function () { estimate(); saveDraft(); });
	$("em-curr").addEventListener("change", function () { prefs.cur = this.value; savePrefs(); estimate(); });
	$("em-amt").addEventListener("input", function () { estimate(); });
	$("em-amt").addEventListener("change", function () { this.value = M.cleanAmount(this.value); prefs.amt = this.value; savePrefs(); estimate(); });
	Array.prototype.forEach.call(document.querySelectorAll(".em-pre"), function (b) { b.onclick = function () { $("em-amt").value = b.dataset.a; prefs.amt = b.dataset.a; savePrefs(); estimate(); }; });
	$("em-fmode").addEventListener("change", saveFilter);
	$("em-fmin").addEventListener("change", saveFilter);
	var dT;
	function saveDraft() { clearTimeout(dT); dT = setTimeout(function () { ls("draft", { to: $("em-to").value, s: $("em-subj").value, b: $("em-body").value, re: draft.re }); }, 400); }

	$("em-cf").onsubmit = function (ev) {
		ev.preventDefault();
		if (S.busy) return;
		var p = M.parseTo($("em-to").value), note = $("em-sendnote"), btn = $("em-send");
		if (p.bad.length) { note.textContent = "Fix these names: " + p.bad.join(", "); return; }
		if (!p.names.length) { note.textContent = "Add at least one recipient."; return; }
		if (p.names.length > M.MAX_TO) { note.textContent = "At most " + M.MAX_TO + " recipients."; return; }
		S.busy = true; btn.disabled = true;
		var cur = $("em-curr").value, amt = M.cleanAmount($("em-amt").value), sealed, key;
		p.names.forEach(function (n) { if (n !== S.me) delete S.keyCache[n]; });
		note.textContent = "Checking the recipients' keys…";
		getAccounts(p.names).then(function () {
			var pubs = {};
			pubs[S.me] = S.keys.pub;
			p.names.forEach(function (n) {
				var a = S.keyCache[n];
				if (!a.exists) throw new Error("@" + n + " is not a Hive account.");
				if (!a.key) throw new Error("@" + n + " hasn't set up MES Mail yet, so a quantum-safe message can't be sent to them.");
				pubs[n] = a.key.pub;
			});
			note.textContent = "Encrypting…";
			return M.seal({ from: S.me, to: p.names, pubs: pubs, payload: { s: $("em-subj").value, b: $("em-body").value, th: draft.th, re: draft.re } });
		}).then(function (r) {
			sealed = r; key = S.me + "/" + r.msgId;
			var batches = M.batches(M.split(r.env, r.msgId));
			return batches.reduce(function (pr, b, i) {
				return pr.then(function () {
					note.textContent = "Saving the encrypted message on Hive" + (batches.length > 1 ? " (" + (i + 1) + " of " + batches.length + ")" : "") + ": approve in Keychain (Posting key)…";
					return (i ? sleep(TX_GAP) : Promise.resolve()).then(function () {
						return H.broadcast(b.map(function (pc) { return M.customOp(S.me, pc); }), "Posting", "Save an encrypted MES Mail message");
					});
				});
			}, Promise.resolve());
		}).then(function () {
			/* it is on chain now: keep it in Sent whatever happens with the notice */
			S.cache.env[key] = { from: S.me, msgId: sealed.msgId, env: sealed.env, t: new Date().toISOString().slice(0, 19), trx: "" };
			(S.cache.sentAmt = S.cache.sentAmt || {})[key] = M.fmtAmount(amt, cur);
			S.open[key] = sealed.payload;
			var contacts = ls("contacts") || {};
			return Promise.all(p.names.map(function (n) { return M.fingerprint(S.keyCache[n].key.pub).then(function (fp) { contacts[n] = fp; }); })).then(function () { ls("contacts", contacts); });
		}).then(function () {
			var ops = M.noticeOps(S.me, p.names, sealed.msgId, cur, amt);
			if (!ops.length) return;
			note.textContent = "Sending the delivery notice: approve in Keychain (Active key)…";
			return H.broadcast(ops, "Active", "MES Mail delivery notice").catch(function (e) {
				S.cache.nf = S.cache.nf || {}; S.cache.nf[key] = { to: p.names, cur: cur, amt: amt };
				toast("Saved, but the delivery notice was not sent: " + e.message);
			});
		}).then(function () {
			saveCache(); ls("draft", null);
			buildThreads();
			note.textContent = "";
			S.busy = false; btn.disabled = false;
			toast("Sent 🔒");
			S.folder = draft.re ? S.folder : "sent";
			openThread(sealed.payload.th);
		}).catch(function (e) {
			S.busy = false; btn.disabled = false;
			note.textContent = e.message;
			if (sealed && S.cache.env[key]) { saveCache(); buildThreads(); paint(); }
		});
	};
	function resendNotice(m) {
		var nf = S.cache.nf[m.key];
		H.broadcast(M.noticeOps(S.me, nf.to, m.msgId, nf.cur, nf.amt), "Active", "MES Mail delivery notice").then(function () {
			delete S.cache.nf[m.key]; saveCache(); paintThread(); toast("Notice sent.");
		}).catch(function (e) { toast(e.message); });
	}
	$("em-classic").onclick = function () {
		var p = M.parseTo($("em-to").value), to = p.names[0], text = ($("em-subj").value ? $("em-subj").value + "\n\n" : "") + $("em-body").value;
		if (!to) return;
		if (!H.memoOk()) { $("em-sendnote").textContent = "The Keychain phone app (HiveAuth) can't encrypt memos. Use the Keychain browser extension."; return; }
		if (new TextEncoder().encode(text).length > 1400) { $("em-sendnote").textContent = "Too long for a memo: about 1,400 characters at most."; return; }
		if (!confirm("Send a classic encrypted memo to @" + to + " with 0.001 " + $("em-curr").value + "? It is locked with Hive memo keys, which are NOT quantum-safe.")) return;
		H.classicSend(to, text, $("em-curr").value).then(function () {
			toast("Memo sent."); ls("draft", null); S.folder = "classic"; refresh(); paint(); narrow(false);
			$("em-cf").hidden = true; $("em-empty").hidden = false;
		}).catch(function (e) { $("em-sendnote").textContent = e.message; });
	};

	/* width classes from the box itself, not the window */
	function fit() { var w = root.clientWidth; root.classList.toggle("em-w2", w < 1000 && w >= 640); root.classList.toggle("em-w1", w < 640); }
	if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else window.addEventListener("resize", fit);
	fit();

	/* ?to=name opens a new message */
	var qTo = (location.search.match(/[?&]to=([^&]+)/) || [])[1];
	start();
	if (qTo) {
		var tries = 0, w = setInterval(function () { if (S.keys) { clearInterval(w); compose({ to: M.parseTo(decodeURIComponent(qTo)).names }); } else if (++tries > 40) clearInterval(w); }, 300);
	}
	window.MESMailDebug = { S: S, H: H, refresh: refresh, compose: compose };
})();
