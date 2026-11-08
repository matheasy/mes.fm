/* MES Party -- mes.fm/party (UI; shared core in lib.js = MESParty; server = mes.fm/api/party.js).
 * An invitation is opened with /party?e=<id> (the public short address mes.fm/p/<id> is a vercel.json rewrite to it); the host link adds #k=<key>;
 * ?to=<name> = a personal invitation ("Sarah, you're invited", name filled in).
 * localStorage "mes-party:v1" = {gid: random browser id, name, mine: [{id, key, t, s, th, em}], went: [{id, t, s, th, em, r}]}; the maker's draft is "mes-party:draft".
 * On localhost / 127.0.0.1 (no /api) or with ?mock=1 the page uses an in-browser stand-in ("mes-party:mock") built on the same lib.js rules.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pa"), P = window.MESParty;
	if (!root || !P) return;
	var KEY = "mes-party:v1", DKEY = "mes-party:draft", T0 = Date.now();
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var ZONE = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
	var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

	function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
	function toast(msg) { var t = $("pa-toast"); if (!t) { t = el("div", "tu-toast"); t.id = "pa-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2800); }
	function copy(text, done) {
		function fb() { var ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(done || "Copied"); } catch (e) { toast("Could not copy: select the text and copy it yourself"); } ta.remove(); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(done || "Copied"); }, fb); else fb();
	}
	function download(name, text, type) { var a = el("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
	function msg(text, kind) { var m = $("pa-msg"); if (!text) { m.hidden = true; return; } m.textContent = text; m.className = "tu-card pa-msg" + (kind ? " pa-msg--" + kind : ""); m.hidden = false; }
	/** text with http(s) links made clickable (DOM only, never innerHTML) */
	function linkify(box, s) {
		String(s || "").split(/(https?:\/\/[^\s<>"]+)/g).forEach(function (part, i) {
			if (i % 2) { var a = el("a", null, part.replace(/[.,!?)]+$/, "")); a.href = a.textContent; a.target = "_blank"; a.rel = "noopener nofollow ugc"; box.appendChild(a); var rest = part.slice(a.textContent.length); if (rest) box.appendChild(document.createTextNode(rest)); }
			else box.appendChild(document.createTextNode(part));
		});
	}

	/* ---------- saved state ---------- */
	var S = { gid: "", name: "", mine: [], went: [] };
	function rnd() { var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null");
			if (s) {
				if (/^[a-f0-9]{32}$/.test(s.gid)) S.gid = s.gid;
				if (typeof s.name === "string") S.name = s.name.slice(0, 60);
				if (Array.isArray(s.mine)) S.mine = s.mine.filter(function (m) { return m && /^[a-z0-9]{8}$/.test(m.id) && /^[a-f0-9]{32}$/.test(m.key); }).slice(0, 100);
				if (Array.isArray(s.went)) S.went = s.went.filter(function (m) { return m && /^[a-z0-9]{8}$/.test(m.id); }).slice(0, 100);
			}
		} catch (e) {}
		if (!S.gid) S.gid = rnd();
	}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	load(); save();
	function mineOf(id) { for (var i = 0; i < S.mine.length; i++) if (S.mine[i].id === id) return S.mine[i]; return null; }
	function remember(list, id, info) {
		var arr = S[list].filter(function (m) { return m.id !== id; });
		var old = S[list].filter(function (m) { return m.id === id; })[0] || {};
		arr.unshift(Object.assign(old, info, { id: id }));
		S[list] = arr.slice(0, 100); save();
	}

	/* ---------- server (or the local stand-in) ---------- */
	function api(body) {
		if (MOCK) return Promise.resolve(mockApi(body));
		return fetch("/api/party", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j._code = r.status; return j; });
		}, function () { return { _code: 0, error: "Could not reach mes.fm. Check your connection and try again." }; });
	}
	function mockApi(b) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-party:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-party:mock", JSON.stringify(db)); };
		var ipH = "local";
		if (b.act === "new") {
			var body = Object.assign({}, b); delete body.act;
			var c = P.cleanEvent(body, now, null);
			if (c.error) return { _code: 400, error: c.error };
			var id = rnd().replace(/[^a-z0-9]/g, "").slice(0, 8), key = rnd();
			c.ev.kh = key;
			db[id] = { ev: c.ev, r: {}, i: {}, ip: {} }; put();
			return Object.assign({ _code: 200, key: key }, P.view(id, db[id], { now: now, owner: true, bid: "" }));
		}
		var st = db[b.id];
		if (!st) return { _code: 404, error: "event not found" };
		var ctx = { now: now, owner: !!b.key && b.key === st.ev.kh, bid: b.gid || "", ipH: ipH, rand: function () { return rnd().slice(0, 16); } };
		var d = P.act(st, b, ctx);
		if (d.error) return { _code: d.code, error: d.error, view: P.view(b.id, st, ctx) };
		P.apply(st, d.w);
		if (!st.ev) { delete db[b.id]; put(); return { _code: 200, ok: true, deleted: true }; }
		st.ip = {};            // the stand-in has one "network": don't let the per-network limit get in the way of testing
		put();
		return Object.assign({ _code: 200, ok: true }, P.view(b.id, st, ctx));
	}
	var BASE = /^\/p\//.test(location.pathname) ? "/party" : location.pathname;
	function shareUrl(id) { return MOCK ? location.origin + location.pathname + "?e=" + id : "https://mes.fm/p/" + id; }
	function hostUrl(id, key) { return (MOCK ? location.origin + location.pathname : "https://mes.fm/party") + "?e=" + id + "#k=" + key; }

	/* ---------- dates ---------- */
	function fmtDate(ms, z, opts) { try { return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: z }, opts)).format(new Date(ms)); } catch (e) { return new Date(ms).toString(); } }
	function zoneShort(ms, z) { try { var p = new Intl.DateTimeFormat(undefined, { timeZone: z, timeZoneName: "short" }).formatToParts(new Date(ms)); for (var i = 0; i < p.length; i++) if (p[i].type === "timeZoneName") return p[i].value; } catch (e) {} return z; }
	function sameDay(a, b, z) { return P.toLocal(a, z).date === P.toLocal(b, z).date; }
	/** "Saturday, December 5 · 7:00 – 11:00 PM PST" in zone z */
	function whenText(ev, z) {
		z = z || ZONE;
		var day = fmtDate(ev.s, z, { weekday: "long", month: "long", day: "numeric", year: new Date(ev.s).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
		var t1 = fmtDate(ev.s, z, { hour: "numeric", minute: "2-digit" });
		var s = day + " · " + t1;
		if (ev.e) s += " – " + (sameDay(ev.s, ev.e, z) ? fmtDate(ev.e, z, { hour: "numeric", minute: "2-digit" }) : fmtDate(ev.e, z, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
		return s + " " + zoneShort(ev.s, z);
	}
	function shortDate(ms, z) { return fmtDate(ms, z || ZONE, { weekday: "short", month: "short", day: "numeric" }); }

	/* ---------- the invitation card (event page + maker preview) ---------- */
	var fontLoaded = {};
	function loadFont(f) {
		if (!f.g || fontLoaded[f.id]) return;
		fontLoaded[f.id] = 1;
		var l = el("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + f.g + "&display=swap"; document.head.appendChild(l);
	}
	function seeded(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
	function cover(ev, seed, opts) {
		opts = opts || {};
		var th = P.themeOf(ev.th), f = P.fontOf(ev.f);
		loadFont(f);
		var c = el("div", "pa-cover pa-th-" + th.id);
		c.style.background = th.bg; c.style.color = th.fg;
		c.style.setProperty("--pa-cfg", th.fg); c.style.setProperty("--pa-cac", th.ac);
		var pat = el("div", "pa-pat"); pat.setAttribute("aria-hidden", "true");
		var rand = seeded(seed || "x"), emo = th.em.length ? th.em : [];
		for (var i = 0; i < (emo.length ? 14 : 0); i++) {
			var s = el("span", null, emo[i % emo.length]);
			s.style.left = (rand() * 96).toFixed(1) + "%"; s.style.top = (rand() * 92).toFixed(1) + "%";
			s.style.transform = "rotate(" + Math.round(rand() * 60 - 30) + "deg)"; s.style.fontSize = (1.1 + rand() * 1.6).toFixed(2) + "em";
			pat.appendChild(s);
		}
		c.appendChild(pat);
		var inner = el("div", "pa-cin");
		if (ev.em) inner.appendChild(el("div", "pa-cem", ev.em));
		inner.appendChild(el("div", "pa-cinv", opts.to ? opts.to + ", you're invited to" : "You're invited to"));
		var h = el(opts.h1 ? "h2" : "div", "pa-ct", ev.t || "Your event name");
		h.style.fontFamily = f.css; h.style.fontWeight = f.w; if (f.up) h.style.textTransform = "uppercase";
		if ((ev.t || "").length > 40) h.classList.add("pa-ct--long");
		inner.appendChild(h);
		if (ev.hn) inner.appendChild(el("div", "pa-chost", "Hosted by " + ev.hn));
		var meta = el("div", "pa-cmeta");
		if (ev.s) meta.appendChild(el("div", "pa-cwhen", "📅 " + whenText(ev)));
		var place = ev.l || (ev.o ? "Online" : "");
		if (place) meta.appendChild(el("div", "pa-cwhere", "📍 " + place));
		else if (opts.hidLoc) meta.appendChild(el("div", "pa-cwhere", "📍 Place shown after you reply"));
		inner.appendChild(meta);
		if (opts.countdown && ev.s) { var cd = el("div", "pa-cd"); cd.id = "pa-cd"; inner.appendChild(cd); }
		c.appendChild(inner);
		return c;
	}
	function tickCountdown() {
		var box = $("pa-cd"); if (!box || !V) return;
		var ev = V.ev, now = Date.now() + skew;
		if (ev.x) { box.textContent = "Cancelled"; return; }
		if (now >= P.endOf(ev)) { box.textContent = "This event has ended"; return; }
		if (now >= ev.s) { box.textContent = "🎉 Happening now"; return; }
		var c = P.countdown(ev.s, now);
		box.textContent = "";
		[[c.d, "days"], [c.h, "hrs"], [c.m, "min"], [c.s, "sec"]].forEach(function (x, i) {
			if (i === 0 && !x[0]) return;
			var u = el("span", "pa-cdu"); u.appendChild(el("b", null, String(x[0]))); u.appendChild(el("small", null, x[1])); box.appendChild(u);
		});
	}

	/* ---------- event page ---------- */
	var V = null, EID = "", KEYH = "", skew = 0, timer = 0, choice = "", plus = 0, editing = false;
	var qs = new URLSearchParams(location.search);
	var TO = (qs.get("to") || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);

	function setView(v) {
		V = v; skew = v.now ? v.now - Date.now() : 0;
		if (v.owner && !mineOf(EID) && KEYH) remember("mine", EID, { key: KEYH, t: v.ev.t, s: v.ev.s, th: v.ev.th, em: v.ev.em });
		var m = mineOf(EID); if (m) { m.t = v.ev.t; m.s = v.ev.s; m.th = v.ev.th; m.em = v.ev.em; save(); }
		if (v.mine) remember("went", EID, { t: v.ev.t, s: v.ev.s, th: v.ev.th, em: v.ev.em, r: v.mine.s });
		renderEvent();
	}
	function refresh(quiet) {
		var key = mineOf(EID) ? mineOf(EID).key : KEYH;
		return api({ act: "view", id: EID, gid: S.gid, key: key || undefined }).then(function (j) {
			if (j._code === 200) { setView(j); if (!quiet) msg(""); }
			else if (!quiet) { $("pa-event").hidden = true; msg(j._code === 404 ? "This invitation was not found. It may have been deleted, or the event ended more than two months ago." : (j.error || "Could not load the invitation."), "err"); }
			return j;
		});
	}
	function hostKey() { var m = mineOf(EID); return m ? m.key : KEYH; }
	function hostAct(body, okMsg) {
		body.id = EID; body.key = hostKey();
		return api(body).then(function (j) {
			if (j._code === 200 && j.deleted) return j;
			if (j._code === 200) { setView(j); if (okMsg) toast(okMsg); } else toast(j.error || "Something went wrong");
			return j;
		});
	}

	function renderEvent() {
		var v = V, ev = v.ev;
		document.title = ev.t + " | MES Party"; document.body.classList.add("pa-ev");
		$("pa-start").hidden = true; $("pa-event").hidden = false;
		$("pa-hostbar").hidden = !v.owner;
		var cw = $("pa-card"); cw.textContent = "";
		cw.appendChild(cover(ev, EID, { h1: true, countdown: true, to: v.mine ? "" : TO, hidLoc: v.hidLoc }));
		tickCountdown();
		// banner
		var bn = $("pa-banner"), why = v.why;
		bn.hidden = !why; bn.className = "pa-banner pa-banner--" + why;
		bn.textContent = why === "cancelled" ? "This event has been cancelled." : why === "closed" ? "The host has closed replies." : why === "deadline" ? "Replies closed on " + shortDate(ev.dl) + "." : why === "past" ? "This event is over. Thanks for coming!" : "";
		renderRsvp(); renderDetails(); renderUpdates(); renderBring(); renderGuests(); renderShare(); renderHost();
		root.classList.toggle("pa-is-owner", !!v.owner);
	}

	function renderRsvp() {
		var v = V, ev = v.ev, box = $("pa-rsvp");
		var to = $("pa-to"); to.hidden = !(TO && !v.mine); to.textContent = TO ? "Hi " + TO + "! Let " + (ev.hn || "the host") + " know if you can make it." : "";
		$("pa-choices").querySelector('[data-s="m"]').hidden = !ev.mb;
		var c = v.counts;
		Array.prototype.forEach.call($("pa-choices").children, function (b) {
			var s = b.getAttribute("data-s"); b.classList.toggle("is-on", !!(choice ? choice === s : v.mine && v.mine.s === s));
			b.disabled = !v.open;
		});
		if (!editing) {
			$("pa-form").hidden = true;
			var done = $("pa-done"); done.textContent = "";
			if (v.mine) {
				var word = { y: v.mine.w ? "You're on the waitlist" : "You're going!", m: "You might come", n: "You can't make it" }[v.mine.s];
				var em = { y: v.mine.w ? "⏳" : "🎉", m: "🤔", n: "💌" }[v.mine.s];
				done.hidden = false;
				var top = el("div", "pa-donetop"); top.appendChild(el("span", "pa-doneem", em)); var tx = el("div");
				tx.appendChild(el("strong", null, word));
				var sub = v.mine.s === "y" ? (v.mine.w ? "Number " + v.mine.w + " in line. You'll move up by yourself if someone drops out." : (v.mine.p ? "You + " + v.mine.p + (v.mine.p === 1 ? " guest" : " guests") + ". See you there!" : "See you there!")) : v.mine.s === "m" ? "Change your reply when you know." : "Thanks for letting " + (ev.hn || "the host") + " know.";
				tx.appendChild(el("div", "pa-donesub", "Replied as " + v.mine.n + " · " + sub)); top.appendChild(tx); done.appendChild(top);
				if (v.open) { var ch = el("button", "tu-btn", "Change my reply"); ch.type = "button"; ch.addEventListener("click", function () { openForm(v.mine.s); }); done.appendChild(ch); }
				$("pa-choices").hidden = true;
				$("pa-rsvp-h").textContent = "Your reply";
			} else {
				done.hidden = true; $("pa-choices").hidden = !v.open;
				$("pa-rsvp-h").textContent = v.open ? "Are you coming?" : "Replies are closed";
			}
		}
		box.hidden = !v.open && !v.mine;
	}
	function openForm(s) {
		var v = V, ev = v.ev;
		editing = true; choice = s;
		$("pa-choices").hidden = false; $("pa-done").hidden = true;
		Array.prototype.forEach.call($("pa-choices").children, function (b) { b.classList.toggle("is-on", b.getAttribute("data-s") === s); b.setAttribute("aria-pressed", b.getAttribute("data-s") === s ? "true" : "false"); });
		var f = $("pa-form"); f.hidden = false;
		var name = $("pa-name"); if (!name.value) name.value = (v.mine && v.mine.n) || TO || S.name || "";
		plus = v.mine ? v.mine.p : 0; if (plus > ev.po) plus = ev.po;
		$("pa-pluswrap").hidden = !ev.po || s === "n"; $("pa-plus").value = plus; $("pa-plus").textContent = plus;
		var pn = $("pa-plusnote"); pn.hidden = !ev.po || s === "n"; pn.textContent = ev.po ? "You can bring up to " + ev.po + (ev.po === 1 ? " other person." : " other people.") : "";
		var q = $("pa-qs"); q.textContent = "";
		(s === "n" ? [] : ev.q || []).forEach(function (text, i) {
			var fd = el("div", "tu-field pa-qf"), l = el("label", null, text), inp = el("input", "tu-input");
			inp.id = "pa-a" + i; l.htmlFor = inp.id; inp.maxLength = 200; inp.value = (v.mine && v.mine.a && v.mine.a[i]) || "";
			fd.appendChild(l); fd.appendChild(inp); q.appendChild(fd);
		});
		if (v.mine && !$("pa-note").value) $("pa-note").value = v.mine.c || "";
		$("pa-send").textContent = s === "y" ? "Count me in 🎉" : s === "m" ? "Send maybe" : "Send my reply";
		(name.value ? $("pa-send") : name).focus({ preventScroll: true });
		f.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
	}
	$("pa-choices").addEventListener("click", function (e) { var b = e.target.closest(".pa-choice"); if (b && !b.disabled) openForm(b.getAttribute("data-s")); });
	$("pa-cancelform").addEventListener("click", function () { editing = false; choice = ""; renderRsvp(); });
	$("pa-form").addEventListener("click", function (e) {
		var b = e.target.closest(".pa-stepb"); if (!b) return;
		plus = Math.max(0, Math.min(V.ev.po, plus + Number(b.getAttribute("data-d")))); $("pa-plus").value = plus; $("pa-plus").textContent = plus;
	});
	$("pa-form").addEventListener("submit", function (e) {
		e.preventDefault();
		var name = $("pa-name").value.trim(); if (!name) { toast("Type your name"); $("pa-name").focus(); return; }
		var a = (V.ev.q || []).map(function (_, i) { var x = $("pa-a" + i); return x ? x.value : ""; });
		var btn = $("pa-send"); btn.disabled = true;
		api({ act: "rsvp", id: EID, gid: S.gid, key: hostKey() || undefined, s: choice, n: name, p: choice === "n" ? 0 : plus, c: $("pa-note").value, a: a, t: Date.now() - T0 + P.MIN_MS * (MOCK ? 1 : 0), hp: $("pa-hp").value }).then(function (j) {
			btn.disabled = false;
			if (j._code !== 200) { toast(j.error || "Could not send your reply"); if (j.view) setView(j.view); return; }
			S.name = name; save();
			var s = choice; editing = false; choice = "";
			setView(j);
			if (s === "y" && !(j.mine && j.mine.w)) confetti();
			toast(s === "y" ? "You're going! 🎉" : s === "m" ? "Maybe sent" : "Reply sent");
		});
	});

	function row(icon, label, body) { var r = el("div", "pa-drow"); r.appendChild(el("span", "pa-dic", icon)); var b = el("div", "pa-dbody"); if (label) b.appendChild(el("div", "pa-dlab", label)); if (typeof body === "string") b.appendChild(el("div", null, body)); else b.appendChild(body); r.appendChild(b); return r; }
	function renderDetails() {
		var v = V, ev = v.ev, box = $("pa-details"); box.textContent = "";
		var when = el("div"); when.appendChild(el("div", "pa-dmain", whenText(ev)));
		if (ev.z !== ZONE && P.offsetMin(ev.s, ev.z) !== P.offsetMin(ev.s, ZONE)) when.appendChild(el("div", "pa-dsub", "That's " + whenText(ev, ev.z) + " where it happens."));
		when.appendChild(el("div", "pa-dsub", P.fromNow(ev.s, Date.now() + skew, P.endOf(ev))));
		box.appendChild(row("📅", "When", when));
		if (ev.l) { var w = el("div"); w.appendChild(el("div", "pa-dmain", ev.l)); var ml = el("a", null, "Open in Maps"); ml.href = P.mapLink(ev.l); ml.target = "_blank"; ml.rel = "noopener"; w.appendChild(ml); box.appendChild(row("📍", "Where", w)); }
		if (ev.o) { var oa = el("a", "pa-dmain", ev.o.replace(/^https?:\/\//, "")); oa.href = ev.o; oa.target = "_blank"; oa.rel = "noopener nofollow"; box.appendChild(row("💻", "Online", oa)); }
		if (v.hidLoc) box.appendChild(row("🔒", "Where", "The host shares the place with guests who reply Going or Maybe."));
		if (ev.hn) box.appendChild(row("👤", "Host", ev.hn));
		if (ev.dl) box.appendChild(row("⏳", "Reply by", shortDate(ev.dl)));
		if (ev.cap) box.appendChild(row("🎟️", "Spots", ev.cap + " people" + (v.counts && v.counts.spots !== null ? " · " + (v.counts.spots ? v.counts.spots + " left" : "full, waitlist open") : "")));
		if (ev.d) { var d = el("div", "pa-desc"); linkify(d, ev.d); box.appendChild(d); }
	}
	function renderUpdates() {
		var u = V.ev.u || [], box = $("pa-updates"), ol = $("pa-uplist");
		box.hidden = !u.length; ol.textContent = "";
		u.forEach(function (x) {
			var li = el("li", "pa-up"); var t = el("div", "pa-upt", P.fromNow(x.t, Date.now() + skew) + " · " + shortDate(x.t)); li.appendChild(t);
			var m = el("div", "pa-upm"); linkify(m, x.m); li.appendChild(m);
			if (V.owner) { var d = el("button", "pa-x", "Remove"); d.type = "button"; d.addEventListener("click", function () { if (confirm("Remove this update?")) hostAct({ act: "unpost", ti: x.t }, "Update removed"); }); li.appendChild(d); }
			ol.appendChild(li);
		});
	}
	function renderBring() {
		var v = V, br = v.bring || [], box = $("pa-bring"), ul = $("pa-brlist");
		box.hidden = !br.length; ul.textContent = "";
		var can = v.mine && v.mine.s !== "n";
		$("pa-brnote").textContent = can ? "Tap an item to say you'll bring it (up to 5)." : "Reply Going or Maybe, then pick something to bring.";
		var left = br.filter(function (b) { return !b.taken; }).length;
		$("pa-br-h").textContent = "What to bring (" + left + " of " + br.length + " still needed)";
		br.forEach(function (b) {
			var li = el("li", "pa-bri" + (b.taken ? " is-taken" : "") + (b.mine ? " is-mine" : ""));
			li.appendChild(el("span", "pa-brn", b.it));
			li.appendChild(el("span", "pa-brby", b.mine ? "You're bringing it" : b.taken ? (b.by ? b.by + " is bringing it" : "Taken") : "Needed"));
			if (can && (!b.taken || b.mine)) {
				var btn = el("button", "tu-btn" + (b.mine ? "" : " tu-btn--primary"), b.mine ? "Undo" : "I'll bring it"); btn.type = "button";
				btn.addEventListener("click", function () {
					btn.disabled = true;
					api({ act: "claim", id: EID, gid: S.gid, key: hostKey() || undefined, it: b.it, on: !b.mine }).then(function (j) { if (j._code === 200) setView(j); else { toast(j.error || "Could not save"); btn.disabled = false; if (j.view) setView(j.view); } });
				});
				li.appendChild(btn);
			} else if (v.owner && b.taken) {
				var fr = el("button", "pa-x", "Free it"); fr.type = "button";
				fr.addEventListener("click", function () { hostAct({ act: "hclaim", it: b.it }, "Item freed"); }); li.appendChild(fr);
			}
			ul.appendChild(li);
		});
	}

	var gtab = "y";
	var COLORS = ["#e11d48", "#7c3aed", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#ea580c", "#db2777", "#4f46e5", "#0d9488"];
	function avatar(name) { var a = el("span", "pa-av"), w = String(name || "?").trim().split(/\s+/); a.textContent = ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; a.style.background = COLORS[h % COLORS.length]; a.setAttribute("aria-hidden", "true"); return a; }
	function renderGuests() {
		var v = V, c = v.counts, box = $("pa-guests"), stats = $("pa-stats");
		stats.textContent = "";
		box.hidden = !c && !v.owner;
		if (!c) return;
		[["y", c.y, c.y === 1 ? "person going" : "people going"], ["m", c.mr, "maybe"], ["n", c.n, "can't go"]].concat(c.w ? [["w", c.w, "on waitlist"]] : []).concat(c.spots !== null ? [["s", c.spots, "spots left"]] : []).forEach(function (x) {
			var t = el("div", "pa-stat pa-stat--" + x[0]); t.appendChild(el("b", null, String(x[1]))); t.appendChild(el("span", null, x[2])); stats.appendChild(t);
		});
		var tabs = $("pa-gtabs"), ul = $("pa-glist"), note = $("pa-glnote");
		tabs.textContent = ""; ul.textContent = "";
		if (!v.guests) { tabs.hidden = true; note.textContent = v.ev.gl === "count" ? "The host shows only the numbers." : ""; return; }
		tabs.hidden = false;
		var g = v.guests, groups = { y: g.filter(function (x) { return x.s === "y" && !x.w; }), m: g.filter(function (x) { return x.s === "m"; }), n: g.filter(function (x) { return x.s === "n"; }), w: g.filter(function (x) { return x.s === "y" && x.w; }).sort(function (a, b) { return a.w - b.w; }) };
		var labels = { y: "Going", m: "Maybe", n: "Can't go", w: "Waitlist" };
		if (!groups[gtab].length) { var first = ["y", "m", "w", "n"].filter(function (k) { return groups[k].length; })[0]; if (first) gtab = first; }
		["y", "m", "n", "w"].forEach(function (k) {
			if (k === "w" && !groups.w.length) return;
			if (k === "m" && !v.ev.mb && !groups.m.length) return;
			var b = el("button", "pa-tab", labels[k] + " " + groups[k].length); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", k === gtab ? "true" : "false");
			b.addEventListener("click", function () { gtab = k; renderGuests(); }); tabs.appendChild(b);
		});
		var list = groups[gtab];
		if (!list.length) ul.appendChild(el("li", "pa-gempty", gtab === "y" ? "Nobody yet. Be the first!" : "Nobody here."));
		list.forEach(function (x) {
			var li = el("li", "pa-g" + (x.me ? " is-me" : ""));
			li.appendChild(avatar(x.n));
			var b = el("div", "pa-gb"), top = el("div", "pa-gn");
			top.appendChild(el("strong", null, x.n));
			if (x.p) top.appendChild(el("span", "pa-gplus", "+" + x.p));
			if (x.me) top.appendChild(el("span", "pa-gme", "you"));
			if (x.w) top.appendChild(el("span", "pa-gw", "#" + x.w + " in line"));
			if (x.h) top.appendChild(el("span", "pa-gh", "added by host"));
			b.appendChild(top);
			if (x.c) { var cm = el("div", "pa-gc"); linkify(cm, x.c); b.appendChild(cm); }
			if (v.owner && x.a && x.a.some(Boolean)) { var ans = el("div", "pa-ga"); (v.ev.q || []).forEach(function (q, i) { if (x.a[i]) { var p = el("div"); p.appendChild(el("span", "pa-gaq", q + ": ")); p.appendChild(document.createTextNode(x.a[i])); ans.appendChild(p); } }); b.appendChild(ans); }
			b.appendChild(el("div", "pa-gt", P.fromNow(x.u || x.t, Date.now() + skew)));
			li.appendChild(b);
			if (v.owner) {
				var ed = el("div", "pa-gact");
				[["y", "Going"], ["m", "Maybe"], ["n", "Can't"]].forEach(function (o) {
					if (o[0] === x.s) return;
					var bt = el("button", "pa-x", o[1]); bt.type = "button"; bt.title = "Change " + x.n + "'s reply to " + o[1];
					bt.addEventListener("click", function () { hostAct({ act: "hedit", k: x.k, s: o[0], n: x.n, p: o[0] === "n" ? 0 : x.p, c: x.c }, x.n + ": " + o[1]); });
					ed.appendChild(bt);
				});
				var rm = el("button", "pa-x pa-danger", "Remove"); rm.type = "button";
				rm.addEventListener("click", function () { if (confirm("Remove " + x.n + " from the guest list?")) hostAct({ act: "hdel", k: x.k }, "Removed"); });
				ed.appendChild(rm); li.appendChild(ed);
			}
			ul.appendChild(li);
		});
		note.textContent = v.ev.gl === "host" && v.owner ? "Only you see this list (and the numbers)." : v.ev.gl === "count" && v.owner ? "Guests see only the numbers, not the names." : "";
	}

	/* ---------- share ---------- */
	function inviteMsg(to) { var url = shareUrl(EID) + (to ? "?to=" + encodeURIComponent(to) : ""); return P.inviteText(V.ev, url, whenText(V.ev, V.ev.z), to); }
	function renderShare() {
		var url = shareUrl(EID), m = inviteMsg("");
		$("pa-link").value = url;
		$("pa-sh-sms").href = "sms:?&body=" + encodeURIComponent(m);
		$("pa-sh-wa").href = "https://wa.me/?text=" + encodeURIComponent(m);
		$("pa-sh-mail").href = "mailto:?subject=" + encodeURIComponent("You're invited: " + V.ev.t) + "&body=" + encodeURIComponent(m);
		$("pa-sh-native").hidden = !navigator.share;
		$("pa-share").hidden = !!V.ev.x && !V.owner;
		$("pa-cal").hidden = !!V.ev.x || V.why === "past";
		$("pa-cal-g").href = P.googleCal(V.ev, url); $("pa-cal-o").href = P.outlookCal(V.ev, url);
		$("pa-sh-h").textContent = V.owner ? "Invite people" : "Share this invitation"; $("pa-personal").hidden = !V.owner;
	}
	$("pa-copy").addEventListener("click", function () { copy($("pa-link").value, "Link copied"); });
	$("pa-link").addEventListener("focus", function () { this.select(); });
	$("pa-sh-msg").addEventListener("click", function () { copy(inviteMsg(""), "Invitation message copied"); });
	$("pa-sh-native").addEventListener("click", function () { navigator.share({ title: V.ev.t, text: inviteMsg("").replace(/\nRSVP here: .*$/, ""), url: shareUrl(EID) }).catch(function () {}); });
	$("pa-pcopy").addEventListener("click", function () { var n = $("pa-pname").value.trim(); if (!n) { toast("Type their name first"); $("pa-pname").focus(); return; } copy(inviteMsg(n), "Message for " + n + " copied"); });
	$("pa-cal-ics").addEventListener("click", function () { download((V.ev.t.replace(/[^\w\- ]+/g, "").trim() || "event").slice(0, 60) + ".ics", P.ics(V.ev, EID, shareUrl(EID), Date.now()), "text/calendar"); });
	var qrLib = null;
	$("pa-sh-qr").addEventListener("click", function () {
		var box = $("pa-qr"); if (!box.hidden) { box.hidden = true; return; }
		box.hidden = false; box.textContent = "Loading…";
		if (!qrLib) qrLib = window.qrcode ? Promise.resolve(window.qrcode) : new Promise(function (ok, no) { var s = el("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"; s.onload = function () { ok(window.qrcode); }; s.onerror = function () { qrLib = null; no(); }; document.head.appendChild(s); });
		qrLib.then(function (qrcode) {
			var q = qrcode(0, "M"); q.addData(shareUrl(EID)); q.make();
			box.textContent = "";
			var img = el("img"); img.src = q.createDataURL(8, 2); img.alt = "QR code for the invitation"; img.width = 200; img.height = 200; box.appendChild(img);
			var dl = el("a", null, "Download the QR code"); dl.href = img.src; dl.download = "invitation-qr.gif"; box.appendChild(dl);
		}, function () { box.textContent = "Could not load the QR code maker."; });
	});

	/* ---------- host ---------- */
	function renderHost() {
		var v = V, on = !!v.owner; $("pa-host").hidden = !on; if (!on) return;
		$("pa-h-close").textContent = v.ev.cl ? "🔓 Open replies" : "🔒 Close replies";
		$("pa-h-cancel").textContent = v.ev.x ? "↩ Un-cancel event" : "🚫 Cancel event";
	}
	function panel(id) { ["pa-hpost", "pa-hadd"].forEach(function (p) { $(p).hidden = p !== id || !$(p).hidden; }); var f = $(id).querySelector("textarea,input"); if (!$(id).hidden && f) f.focus(); }
	$("pa-host").addEventListener("click", function (e) { var c = e.target.closest("[data-close]"); if (c) $(c.getAttribute("data-close")).hidden = true; });
	$("pa-h-post").addEventListener("click", function () { panel("pa-hpost"); });
	$("pa-h-add").addEventListener("click", function () { panel("pa-hadd"); });
	$("pa-upsend").addEventListener("click", function () { hostAct({ act: "post", m: $("pa-upmsg").value }, "Update posted").then(function (j) { if (j._code === 200) { $("pa-upmsg").value = ""; $("pa-hpost").hidden = true; } }); });
	var addS = "y";
	$("pa-hadd").querySelector(".pa-aseg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; addS = b.getAttribute("data-s"); Array.prototype.forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
	$("pa-asend").addEventListener("click", function () {
		hostAct({ act: "hadd", s: addS, n: $("pa-an").value, p: addS === "n" ? 0 : Math.max(0, Math.min(10, parseInt($("pa-ap").value, 10) || 0)), c: $("pa-ac").value }, "Added to the list").then(function (j) { if (j._code === 200) { $("pa-an").value = ""; $("pa-ap").value = 0; $("pa-ac").value = ""; $("pa-an").focus(); } });
	});
	$("pa-h-csv").addEventListener("click", function () { download((V.ev.t.replace(/[^\w\- ]+/g, "").trim() || "guests").slice(0, 60) + " guest list.csv", "﻿" + P.guestCsv(V), "text/csv"); });
	$("pa-h-names").addEventListener("click", function () {
		var g = (V.guests || []).filter(function (x) { return x.s === "y" && !x.w; });
		if (!g.length) { toast("Nobody is going yet"); return; }
		copy(g.map(function (x) { return x.n + (x.p ? " +" + x.p : ""); }).join("\n") + "\n\nTotal: " + V.counts.y, g.length + " names copied");
	});
	$("pa-h-remind").addEventListener("click", function () { copy("Reminder: " + (V.ev.em ? V.ev.em + " " : "") + V.ev.t + " is " + P.fromNow(V.ev.s, Date.now()) + "!\n" + whenText(V.ev, V.ev.z) + (V.ev.l ? "\n" + V.ev.l : "") + "\nDetails and replies: " + shareUrl(EID), "Reminder message copied: paste it in your group chat"); });
	$("pa-h-close").addEventListener("click", function () { hostAct({ act: "close", on: !V.ev.cl }, V.ev.cl ? "Replies are open again" : "Replies closed"); });
	$("pa-h-cancel").addEventListener("click", function () {
		if (!V.ev.x && !confirm("Cancel this event? Guests will see that it was cancelled. You can undo it.")) return;
		hostAct({ act: "cancel", on: !V.ev.x }, V.ev.x ? "Event is back on" : "Event cancelled");
	});
	$("pa-h-mgr").addEventListener("click", function () { copy(hostUrl(EID, hostKey()), "Host link copied. Keep it private: anyone with it can change your event."); });
	$("pa-h-del").addEventListener("click", function () {
		if (!confirm("Delete this event and every reply for good? This cannot be undone.")) return;
		hostAct({ act: "del" }).then(function (j) { if (j.deleted) { S.mine = S.mine.filter(function (m) { return m.id !== EID; }); save(); location.href = BASE; } });
	});
	$("pa-h-edit").addEventListener("click", function () { startMaker(V.ev); });

	/* ---------- confetti ---------- */
	function confetti() {
		if (REDUCED) return;
		var box = el("div", "pa-confetti"); box.setAttribute("aria-hidden", "true");
		var cols = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#facc15"];
		for (var i = 0; i < 90; i++) {
			var s = el("i"); s.style.left = (Math.random() * 100) + "%"; s.style.background = cols[i % cols.length];
			s.style.animationDelay = (Math.random() * 0.5).toFixed(2) + "s"; s.style.animationDuration = (2.2 + Math.random() * 1.6).toFixed(2) + "s";
			s.style.setProperty("--x", (Math.random() * 240 - 120).toFixed(0) + "px"); s.style.setProperty("--r", (Math.random() * 900 - 450).toFixed(0) + "deg");
			if (i % 3 === 0) s.style.borderRadius = "50%";
			box.appendChild(s);
		}
		document.body.appendChild(box); setTimeout(function () { box.remove(); }, 4500);
	}

	/* ---------- the maker ---------- */
	var M = { th: "confetti", f: "sans", gl: "all", editId: "" };
	var TPL = [
		{ n: "🎂 Birthday", t: "'s Birthday Party", th: "birthday", f: "script", em: "🎂", br: ["Drinks", "Snacks", "Ice", "Plates & cups"], q: [] },
		{ n: "🍝 Dinner party", t: "Dinner at Our Place", th: "dinner", f: "serif", em: "🍷", br: ["Wine", "Dessert", "Bread", "Salad"], q: ["Any food allergies?"] },
		{ n: "🍔 BBQ", t: "Backyard BBQ", th: "bbq", f: "poster", em: "🔥", br: ["Burgers", "Buns", "Chips", "Drinks", "Watermelon", "Ice"], q: [] },
		{ n: "🎲 Game night", t: "Game Night", th: "game", f: "sans", em: "🎲", br: ["Snacks", "Drinks", "A favourite game"], q: [] },
		{ n: "🏈 Watch party", t: "Watch Party", th: "sports", f: "poster", em: "🏆", br: ["Wings", "Chips & dip", "Drinks"], q: ["Who are you cheering for?"] },
		{ n: "🍼 Baby shower", t: "Baby Shower", th: "baby", f: "script", em: "🍼", br: [], q: ["Guess the due date!"] },
		{ n: "🎄 Holiday party", t: "Holiday Party", th: "winter", f: "serif", em: "🎄", br: ["Cookies", "Eggnog", "A $20 gift for the swap"], q: [] },
		{ n: "🎃 Halloween", t: "Halloween Party", th: "halloween", f: "hand", em: "🎃", br: ["Candy", "Spooky snacks"], q: ["What's your costume?"] },
		{ n: "🏖️ Pool party", t: "Pool Party", th: "pool", f: "poster", em: "🏖️", br: ["Towels", "Sunscreen", "Drinks"], q: [] },
		{ n: "💍 Wedding / engagement", t: "Engagement Party", th: "wedding", f: "serif", em: "💍", br: [], q: ["Any dietary needs?"] },
		{ n: "🪩 Night out", t: "Night Out", th: "neon", f: "poster", em: "🪩", br: [], q: [] },
		{ n: "📋 Meeting", t: "Team Meeting", th: "minimal", f: "sans", em: "📋", br: [], q: [] }
	];
	var EMOJI = ["🎉", "🥳", "🎂", "🎈", "🍕", "🍔", "🍷", "🥂", "🍻", "🎲", "🎮", "🏈", "⚽", "🏀", "🎤", "🎶", "🪩", "🌮", "🍣", "☕", "🎄", "🎃", "💍", "🍼", "🏖️", "⛺", "🎓", "💼", "🙏", "❤️"];

	function fillZones() {
		var dl = $("pa-zones"); if (dl.children.length) return;
		var list = []; try { list = Intl.supportedValuesOf("timeZone"); } catch (e) { list = ["America/Vancouver", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Toronto", "America/Halifax", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Ho_Chi_Minh", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney", "UTC"]; }
		if (list.indexOf(ZONE) < 0) list.unshift(ZONE);
		list.forEach(function (z) { var o = el("option"); o.value = z; dl.appendChild(o); });
	}
	function buildMakerUi() {
		var th = $("pa-themes"); th.textContent = "";
		P.THEMES.forEach(function (t) {
			var b = el("button", "pa-sw"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("data-th", t.id); b.title = t.name; b.setAttribute("aria-label", t.name);
			b.style.background = t.bg; b.appendChild(el("span", "pa-swem", t.em[0] || "Aa")); var sn = el("span", "pa-swn", t.name); sn.style.color = t.fg; if (/^#[ef]/i.test(t.fg)) sn.classList.add("pa-swn--lt"); b.appendChild(sn);
			th.appendChild(b);
		});
		var fo = $("pa-fonts"); fo.textContent = "";
		P.FONTS.forEach(function (f) { loadFont(f); var b = el("button", "pa-font", f.name); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("data-f", f.id); b.style.fontFamily = f.css; b.style.fontWeight = f.w; if (f.up) b.style.textTransform = "uppercase"; fo.appendChild(b); });
		var es = $("pa-emsug"); es.textContent = "";
		EMOJI.forEach(function (x) { var b = el("button", "pa-emb", x); b.type = "button"; b.setAttribute("aria-label", "Use " + x); es.appendChild(b); });
		var tp = $("pa-tpl"); tp.textContent = "";
		TPL.forEach(function (t, i) { var b = el("button", "tu-chip", t.n); b.type = "button"; b.setAttribute("data-i", i); tp.appendChild(b); });
		fillZones();
	}
	function setSel(boxId, attr, val) { Array.prototype.forEach.call($(boxId).children, function (b) { var on = b.getAttribute(attr) === val; b.setAttribute("aria-checked", on ? "true" : "false"); b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("is-on", on); }); }
	function draftBody() {
		var z = $("pa-z").value.trim() || ZONE, date = $("pa-date").value, t1 = $("pa-time").value, t2 = $("pa-etime").value;
		var s = P.fromLocal(date, t1, z), e = 0;
		if (t2 && isFinite(s)) { e = P.fromLocal(date, t2, z); if (e <= s) e += 864e5; }      // an end time earlier than the start = after midnight
		var dl = $("pa-dl").value ? P.fromLocal($("pa-dl").value, "23:59", z) : 0;
		return {
			t: $("pa-t").value, d: $("pa-d").value, hn: $("pa-hn").value, s: isFinite(s) ? Math.round(s) : NaN, e: isFinite(e) ? Math.round(e) : 0, z: z,
			l: $("pa-l").value, lh: $("pa-lh").checked, o: $("pa-o").value, th: M.th, f: M.f, em: $("pa-em").value.trim(),
			po: parseInt($("pa-po").value, 10) || 0, cap: Math.max(0, parseInt($("pa-cap").value, 10) || 0), dl: isFinite(dl) ? Math.round(dl) : 0,
			q: [$("pa-q0").value, $("pa-q1").value, $("pa-q2").value].filter(function (x) { return x.trim(); }),
			br: $("pa-br").value.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean), mb: $("pa-mb").checked, gl: M.gl
		};
	}
	function saveDraft() { if (M.editId) return; try { var b = draftBody(); b.date = $("pa-date").value; b.time = $("pa-time").value; b.etime = $("pa-etime").value; b.dld = $("pa-dl").value; localStorage.setItem(DKEY, JSON.stringify(b)); } catch (e) {} }
	function preview() {
		var b = draftBody(), w = $("pa-prev"); w.textContent = "";
		var ev = Object.assign({}, b); if (!isFinite(ev.s)) ev.s = 0;
		w.appendChild(cover(ev, "preview", {}));
		var po = el("div", "pa-prevfoot");
		po.textContent = [b.po ? "+" + b.po + " each" : "", b.cap ? "limit " + b.cap : "", b.q.length ? b.q.length + (b.q.length === 1 ? " question" : " questions") : "", b.br.length ? b.br.length + " things to bring" : "", b.lh ? "place private" : ""].filter(Boolean).join(" · ");
		if (po.textContent) w.appendChild(po);
		var nt = $("pa-whennote");
		if (isFinite(b.s)) { var ev2 = { s: b.s, e: b.e, z: b.z }; nt.textContent = whenText(ev2, b.z) + (b.z !== ZONE ? " (" + whenText(ev2, ZONE) + " for you)" : ""); } else nt.textContent = "";
	}
	function fillMaker(src) {
		src = src || {};
		var z = src.z && P.validZone(src.z) ? src.z : ZONE;
		$("pa-t").value = src.t || ""; $("pa-d").value = src.d || ""; $("pa-hn").value = src.hn || S.name || "";
		var tomorrow = P.toLocal(Date.now() + 7 * 864e5, z);
		if (src.s) { var lo = P.toLocal(src.s, z); $("pa-date").value = lo.date; $("pa-time").value = lo.time; $("pa-etime").value = src.e ? P.toLocal(src.e, z).time : ""; }
		else { $("pa-date").value = src.date || tomorrow.date; $("pa-time").value = src.time || "19:00"; $("pa-etime").value = src.etime || ""; }
		$("pa-z").value = z;
		$("pa-l").value = src.l || ""; $("pa-o").value = src.o || ""; $("pa-lh").checked = !!src.lh;
		M.th = P.themeOf(src.th).id; M.f = P.fontOf(src.f).id; M.gl = P.GL.indexOf(src.gl) >= 0 ? src.gl : "all";
		$("pa-em").value = src.em != null ? src.em : "🎉";
		var po = String(src.po != null ? src.po : 1); if (!$("pa-po").querySelector('option[value="' + po + '"]')) { var o = el("option", null, po + " others"); o.value = po; $("pa-po").appendChild(o); } $("pa-po").value = po;
		$("pa-cap").value = src.cap || 0;
		$("pa-dl").value = src.dld || (src.dl ? P.toLocal(src.dl, z).date : "");
		var q = src.q || []; $("pa-q0").value = q[0] || ""; $("pa-q1").value = q[1] || ""; $("pa-q2").value = q[2] || "";
		$("pa-br").value = (src.br || []).join("\n");
		$("pa-mb").checked = src.mb !== false;
		if (q.length || (src.br || []).length) $("pa-more").open = true;
		setSel("pa-themes", "data-th", M.th); setSel("pa-fonts", "data-f", M.f);
		Array.prototype.forEach.call($("pa-gl").children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === M.gl ? "true" : "false"); });
		preview();
	}
	function startMaker(ev) {
		buildMakerUi();
		$("pa-event").hidden = true; $("pa-start").hidden = false; $("pa-hero").hidden = !!ev; document.body.classList.remove("pa-ev"); $("pa-mine-sec").hidden = !!ev || !S.mine.length && !S.went.length;
		if (ev) { M.editId = EID; fillMaker(ev); $("pa-make-h").textContent = "Edit your invitation"; $("pa-create").textContent = "Save changes"; $("pa-reset").textContent = "Back to the event"; $("pa-tpl").hidden = true; }
		else { M.editId = ""; var d = null; try { d = JSON.parse(localStorage.getItem(DKEY) || "null"); } catch (e) {} fillMaker(d); }
		$("pa-make-h").scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
	}
	$("pa-make").addEventListener("input", function () { preview(); saveDraft(); $("pa-makeerr").textContent = ""; });
	$("pa-make").addEventListener("change", function () { preview(); saveDraft(); });
	$("pa-themes").addEventListener("click", function (e) { var b = e.target.closest("[data-th]"); if (!b) return; M.th = b.getAttribute("data-th"); setSel("pa-themes", "data-th", M.th); var t = P.themeOf(M.th); if (t.em[0] && EMOJI.indexOf($("pa-em").value) >= 0) $("pa-em").value = t.em[0]; preview(); saveDraft(); });
	$("pa-fonts").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; M.f = b.getAttribute("data-f"); setSel("pa-fonts", "data-f", M.f); preview(); saveDraft(); });
	$("pa-emsug").addEventListener("click", function (e) { var b = e.target.closest(".pa-emb"); if (!b) return; $("pa-em").value = b.textContent; preview(); saveDraft(); });
	$("pa-gl").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; M.gl = b.getAttribute("data-v"); Array.prototype.forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); saveDraft(); });
	$("pa-tpl").addEventListener("click", function (e) {
		var b = e.target.closest("[data-i]"); if (!b) return;
		var t = TPL[+b.getAttribute("data-i")], cur = draftBody();
		var title = t.t.charAt(0) === "'" ? ((cur.hn || "My").split(" ")[0] + t.t) : t.t;
		fillMaker(Object.assign({}, cur, { date: $("pa-date").value, time: $("pa-time").value, etime: $("pa-etime").value, dld: $("pa-dl").value, s: 0, dl: 0, t: title, th: t.th, f: t.f, em: t.em, br: t.br, q: t.q }));
		saveDraft(); $("pa-t").focus(); $("pa-t").select();
	});
	$("pa-reset").addEventListener("click", function () {
		if (M.editId) { M.editId = ""; renderEvent(); window.scrollTo(0, 0); return; }
		if (!confirm("Clear the form and start over?")) return;
		try { localStorage.removeItem(DKEY); } catch (e) {} fillMaker(null);
	});
	$("pa-start-btn").addEventListener("click", function () { $("pa-make-h").scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" }); setTimeout(function () { $("pa-t").focus({ preventScroll: true }); }, REDUCED ? 0 : 400); });
	$("pa-make").addEventListener("submit", function (e) {
		e.preventDefault();
		var b = draftBody(), err = $("pa-makeerr");
		if (!b.t.trim()) { err.textContent = "Give the event a name."; $("pa-t").focus(); return; }
		if (!isFinite(b.s)) { err.textContent = "Pick a date and start time."; $("pa-date").focus(); return; }
		if (!P.validZone(b.z)) { err.textContent = "Pick a time zone from the list."; $("pa-z").focus(); return; }
		var probs = P.problems(b, Date.now() - (M.editId ? 400 * 864e5 : 0)); if (probs.length) { err.textContent = probs[0].charAt(0).toUpperCase() + probs[0].slice(1) + "."; return; }
		var btn = $("pa-create"); btn.disabled = true;
		if (b.hn) { S.name = S.name || b.hn; save(); }
		if (M.editId) {
			hostAct(Object.assign({ act: "edit" }, b), "Saved. Everyone sees the new details on the same link.").then(function (j) { btn.disabled = false; if (j._code === 200) { M.editId = ""; window.scrollTo(0, 0); } else err.textContent = j.error || ""; });
			return;
		}
		api(Object.assign({ act: "new" }, b)).then(function (j) {
			btn.disabled = false;
			if (j._code !== 200) { err.textContent = (j.error || "Could not create the invitation").replace(/^./, function (c) { return c.toUpperCase(); }); return; }
			remember("mine", j.id, { key: j.key, t: j.ev.t, s: j.ev.s, th: j.ev.th, em: j.ev.em, c: Date.now() });
			try { localStorage.removeItem(DKEY); } catch (e2) {}
			EID = j.id; KEYH = j.key;
			history.pushState(null, "", BASE + "?e=" + j.id);   // never the key: people copy the address bar
			setView(j); window.scrollTo(0, 0); confetti();
			toast("Your invitation is ready. Copy the link and send it!");
		});
	});

	/* ---------- my events ---------- */
	function renderMine() {
		var box = $("pa-mine"), sec = $("pa-mine-sec"); box.textContent = "";
		var items = S.mine.map(function (m) { return Object.assign({ host: true }, m); }).concat(S.went.filter(function (w) { return !mineOf(w.id); }));
		sec.hidden = !items.length;
		var now = Date.now();
		items.sort(function (a, b) { var ua = (a.s || 0) < now - 864e5, ub = (b.s || 0) < now - 864e5; return ua !== ub ? (ua ? 1 : -1) : ua ? (b.s || 0) - (a.s || 0) : (a.s || 0) - (b.s || 0); });
		items.forEach(function (m) {
			var a = el("a", "pa-mi"); a.href = BASE + "?e=" + m.id + (m.host ? "#k=" + m.key : "");
			var th = P.themeOf(m.th); var sw = el("span", "pa-mism", m.em || th.em[0] || "🎉"); sw.style.background = th.bg; a.appendChild(sw);
			var b = el("span", "pa-mib"); b.appendChild(el("strong", null, m.t || "Event"));
			b.appendChild(el("span", "pa-mis", (m.s ? shortDate(m.s) + " · " + P.fromNow(m.s, now) : "") + (m.host ? " · you host" : m.r ? " · " + { y: "going", m: "maybe", n: "can't go" }[m.r] : "")));
			a.appendChild(b); box.appendChild(a);
		});
	}

	/* ---------- start ---------- */
	function route() {
		// mes.fm/p/<id> is a rewrite to /party?e=<id>, so the address bar keeps /p/<id>: read the id from the path too
		var pm = /^\/p\/([A-Za-z0-9]{8})\/?$/.exec(location.pathname);
		EID = (qs.get("e") || (pm ? pm[1] : "")).toLowerCase();
		var h = /[#&]k=([a-f0-9]{32})/.exec(location.hash); KEYH = h ? h[1] : "";
		clearInterval(timer);
		if (/^[a-z0-9]{8}$/.test(EID)) {
			msg("");
			$("pa-start").hidden = true;
			var cw = $("pa-card"); cw.innerHTML = '<div class="pa-cover pa-loading"><div class="pa-cin"><div class="pa-cinv">Opening your invitation…</div></div></div>'; $("pa-event").hidden = false;
			refresh().then(function (j) {
				if (j._code === 200 && KEYH && j.owner && location.hash) history.replaceState(null, "", location.pathname + location.search);   // keep the key out of the address bar (it is saved in this browser)
			});
			timer = setInterval(function () { tickCountdown(); }, 1000);
			setInterval(function () { if (!document.hidden && !editing && $("pa-start").hidden && EID) refresh(true); }, 20000);
			document.addEventListener("visibilitychange", function () { if (!document.hidden && EID && !editing && $("pa-start").hidden) refresh(true); });
		} else {
			buildMakerUi(); renderMine();
			var d = null; try { d = JSON.parse(localStorage.getItem(DKEY) || "null"); } catch (e) {}
			fillMaker(d);
		}
	}
	window.addEventListener("popstate", function () { qs = new URLSearchParams(location.search); route(); });
	window.addEventListener("storage", function (e) { if (e.key === KEY) { load(); if (!EID) renderMine(); } });
	if (MOCK) root.insertAdjacentHTML("afterbegin", '<p class="tu-note pa-mocknote">Test mode: this copy of the page keeps invitations in this browser only (no server here).</p>');
	route();
	window.MESPartyDebug = { get V() { return V; }, S: S, api: api };
})();
