/* MES Party -- mes.fm/party. Pure core shared by the page (window.MESParty) and the server (mes.fm/api/party.js).
 * The server requires a BYTE-IDENTICAL copy at mes.fm/api/_party-lib.js: after editing run
 *   cp tool_apps_src/party/lib.js mes.fm/api/_party-lib.js
 * (tool_apps_src/party-tests.js checks they match).
 *
 * Everything that decides what a request may do and what a viewer may see lives here, so the in-browser test
 * stand-in (localhost / ?mock=1) and the real server behave the same:
 *   cleanEvent(body, now, prev)    -> {ev} | {error}            validate a new / edited event
 *   act(state, body, ctx)          -> {code, error?, w:[ops]}    decide one request; ops are written by the caller
 *   apply(state, w)                -> state                      the same ops applied in memory
 *   view(id, state, ctx)           -> what this viewer may see
 * state = {ev, r: {guestKey: rsvp}, i: {itemKey: claim}, ip: {ipHash: n}}
 * ctx   = {now, owner (bool: the edit key matched), bid (this browser's guest key or ""), ipH, rand()}
 * ops   = ["ev", ev] | ["r", key, rsvp|null] | ["i", key, claim|null] | ["ip", ipH, +n] | ["del"]
 */
(function (root) {
	"use strict";
	var DAY = 864e5, HOUR = 36e5;
	var LIMITS = { guests: 500, ipEvent: 12, updates: 20, items: 30, questions: 3, claimsEach: 5, plus: 10, cap: 5000 };
	var KEEP = 60 * DAY;          // data kept this long after the event ends
	var MIN_MS = 1500;            // ms on the page before an RSVP counts

	/* themes: id -> look of the invitation card (fg = text colour on the cover) */
	var THEMES = [
		{ id: "confetti", name: "Confetti", bg: "linear-gradient(135deg,#ff5f8f 0%,#ffb347 55%,#ffe66d 100%)", fg: "#2a0a18", ac: "#d6246e", em: ["🎉", "🎊", "✨", "🥳"] },
		{ id: "birthday", name: "Birthday", bg: "linear-gradient(135deg,#7b2ff7 0%,#f107a3 100%)", fg: "#ffffff", ac: "#f107a3", em: ["🎂", "🎈", "🎁", "🕯️"] },
		{ id: "dinner", name: "Dinner party", bg: "linear-gradient(160deg,#1f1c2c 0%,#6b4f2a 100%)", fg: "#fbefd9", ac: "#c8963e", em: ["🍷", "🕯️", "🍝", "🥂"] },
		{ id: "bbq", name: "BBQ & picnic", bg: "linear-gradient(135deg,#f12711 0%,#f5af19 100%)", fg: "#2b0d00", ac: "#c2410c", em: ["🍔", "🌭", "🔥", "🌽"] },
		{ id: "game", name: "Game night", bg: "linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)", fg: "#e6fbff", ac: "#22d3ee", em: ["🎲", "🃏", "🎮", "♟️"] },
		{ id: "pool", name: "Pool & beach", bg: "linear-gradient(160deg,#00c6ff 0%,#0072ff 100%)", fg: "#ffffff", ac: "#0072ff", em: ["🏖️", "🌊", "🍉", "🕶️"] },
		{ id: "neon", name: "Neon night", bg: "linear-gradient(135deg,#0d0221 0%,#3a0ca3 60%,#f72585 100%)", fg: "#fdf0ff", ac: "#f72585", em: ["🪩", "🎶", "💜", "⚡"] },
		{ id: "garden", name: "Garden", bg: "linear-gradient(160deg,#d4fc79 0%,#96e6a1 100%)", fg: "#123d1a", ac: "#2f855a", em: ["🌸", "🌿", "🦋", "🌼"] },
		{ id: "baby", name: "Baby shower", bg: "linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)", fg: "#2b2350", ac: "#7c6fd6", em: ["🍼", "🧸", "👶", "🎀"] },
		{ id: "wedding", name: "Wedding", bg: "linear-gradient(160deg,#fdfbfb 0%,#ebedee 100%)", fg: "#3b3226", ac: "#a8833d", em: ["💍", "🤍", "🥂", "💐"] },
		{ id: "halloween", name: "Halloween", bg: "linear-gradient(160deg,#1a1a1a 0%,#ff7518 140%)", fg: "#fff3e6", ac: "#ff7518", em: ["🎃", "👻", "🦇", "🕸️"] },
		{ id: "winter", name: "Holidays", bg: "linear-gradient(160deg,#0b3d2e 0%,#1d6b4f 60%,#b91c1c 140%)", fg: "#fff8f0", ac: "#e11d48", em: ["🎄", "❄️", "🎁", "⛄"] },
		{ id: "sunset", name: "Sunset", bg: "linear-gradient(170deg,#ff9a8b 0%,#ff6a88 45%,#ff99ac 100%)", fg: "#3a0d1c", ac: "#e0345d", em: ["🌅", "🍹", "🌴", "☀️"] },
		{ id: "sports", name: "Game day", bg: "linear-gradient(135deg,#134e5e 0%,#71b280 100%)", fg: "#f2fff6", ac: "#16a34a", em: ["🏈", "🏀", "⚽", "🏆"] },
		{ id: "minimal", name: "Minimal", bg: "linear-gradient(160deg,#ffffff 0%,#eef1f5 100%)", fg: "#1c2430", ac: "#2563eb", em: [] },
		{ id: "midnight", name: "Midnight", bg: "linear-gradient(160deg,#141e30 0%,#243b55 100%)", fg: "#eef4ff", ac: "#7aa2ff", em: ["🌙", "⭐", "✨"] }
	];
	var FONTS = [
		{ id: "sans", name: "Bold", css: "'Helvetica Neue', Arial, sans-serif", w: 800 },
		{ id: "serif", name: "Elegant", css: "'Playfair Display', Georgia, serif", w: 700, g: "Playfair+Display:wght@700" },
		{ id: "script", name: "Script", css: "'Pacifico', 'Brush Script MT', cursive", w: 400, g: "Pacifico" },
		{ id: "poster", name: "Poster", css: "'Bebas Neue', Impact, sans-serif", w: 400, g: "Bebas+Neue", up: 1 },
		{ id: "hand", name: "Handwritten", css: "'Caveat', 'Comic Sans MS', cursive", w: 700, g: "Caveat:wght@700" },
		{ id: "mono", name: "Typewriter", css: "'Courier Prime', 'Courier New', monospace", w: 700, g: "Courier+Prime:wght@700" }
	];
	var GL = ["all", "count", "host"];        // who sees the guest list: everyone / only the numbers / only the host

	function themeOf(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return THEMES[0]; }
	function fontOf(id) { for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i]; return FONTS[0]; }

	/* ---------- text ---------- */
	/** plain text: no control characters (new lines kept when lines), spaces squeezed, trimmed; null when too long or not a string */
	function text(v, max, lines) {
		if (v === undefined || v === null) v = "";
		if (typeof v !== "string") return null;
		var s = v.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ").replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
		s = lines ? s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
		return s.length <= max ? s : null;
	}
	/** an http(s) link, or "" ; null when it is not one */
	function link(v, max) {
		var s = text(v, max || 400, false);
		if (s === null) return null;
		if (!s) return "";
		if (!/^https?:\/\//i.test(s)) s = "https://" + s;
		if (!/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d{2,5})?([\/?#][^\s<>"]*)?$/i.test(s)) return null;
		return s;
	}
	function validZone(z) {
		if (typeof z !== "string" || !/^[A-Za-z_+\-\/0-9]{1,64}$/.test(z)) return false;
		try { new Intl.DateTimeFormat("en", { timeZone: z }).format(0); return true; } catch (e) { return false; }
	}
	function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }

	/** validate a new or edited event. prev = the stored event when editing (keeps its updates, flags, creation time). */
	function cleanEvent(b, now, prev) {
		var allowed = ["act", "id", "key", "t", "d", "hn", "s", "e", "z", "l", "lh", "o", "th", "f", "em", "po", "cap", "dl", "q", "br", "mb", "gl"];
		if (!b || typeof b !== "object") return { error: "bad request" };
		for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k) && allowed.indexOf(k) < 0) return { error: "unknown field " + String(k).slice(0, 20) };
		var t = text(b.t, 120, false);
		if (!t) return { error: t === "" ? "give the event a name" : "the name is too long (120 characters at most)" };
		var d = text(b.d, 3000, true); if (d === null) return { error: "the description is too long (3,000 characters at most)" };
		var hn = text(b.hn, 60, false); if (hn === null) return { error: "the host name is too long (60 characters at most)" };
		if (!isInt(b.s)) return { error: "pick a date and time" };
		var s = b.s;
		if (s < now - (prev ? 400 * DAY : DAY)) return { error: "that date is in the past" };
		if (s > now + 3 * 365 * DAY) return { error: "the date must be within three years" };
		var e = b.e === undefined || b.e === null || b.e === 0 ? 0 : b.e;
		if (!isInt(e) || (e && (e <= s || e > s + 31 * DAY))) return { error: "the end must be after the start (and within a month of it)" };
		if (!validZone(b.z)) return { error: "unknown time zone" };
		var l = text(b.l, 200, false); if (l === null) return { error: "the place is too long (200 characters at most)" };
		var o = link(b.o, 400); if (o === null) return { error: "the online link is not a web address" };
		var th = typeof b.th === "string" && themeOf(b.th).id === b.th ? b.th : "confetti";
		var f = typeof b.f === "string" && fontOf(b.f).id === b.f ? b.f : "sans";
		var em = text(b.em, 16, false); if (em === null) return { error: "the emoji is too long" };
		var po = b.po === undefined ? 0 : b.po;
		if (!isInt(po) || po < 0 || po > LIMITS.plus) return { error: "guests can bring 0 to " + LIMITS.plus + " others" };
		var cap = b.cap === undefined ? 0 : b.cap;
		if (!isInt(cap) || cap < 0 || cap > LIMITS.cap) return { error: "the guest limit must be 0 (no limit) to " + LIMITS.cap };
		var dl = b.dl === undefined || b.dl === null ? 0 : b.dl;
		if (!isInt(dl) || (dl && dl > s + DAY)) return { error: "the reply-by date must be before the event" };
		var q = [], br = [], seen = {};
		if (b.q !== undefined && !Array.isArray(b.q)) return { error: "bad questions" };
		(b.q || []).forEach(function (x) { var v = text(x, 120, false); if (v === null) q.push(null); else if (v) q.push(v); });
		if (q.indexOf(null) >= 0) return { error: "a question is too long (120 characters at most)" };
		if (q.length > LIMITS.questions) return { error: LIMITS.questions + " questions at most" };
		if (b.br !== undefined && !Array.isArray(b.br)) return { error: "bad list of things to bring" };
		for (var i = 0; i < (b.br || []).length; i++) {
			var v = text(b.br[i], 80, false);
			if (v === null) return { error: "an item to bring is too long (80 characters at most)" };
			if (!v) continue;
			if (seen[v.toLowerCase()]) return { error: "this item is listed twice: " + v };
			seen[v.toLowerCase()] = 1; br.push(v);
		}
		if (br.length > LIMITS.items) return { error: LIMITS.items + " items to bring at most" };
		var gl = GL.indexOf(b.gl) >= 0 ? b.gl : "all";
		var ev = { t: t, d: d, hn: hn, s: s, e: e, z: b.z, l: l, lh: !!b.lh, o: o, th: th, f: f, em: em, po: po, cap: cap, dl: dl, q: q, br: br, mb: b.mb !== false, gl: gl };
		if (prev) { ev.u = prev.u || []; ev.x = prev.x || 0; ev.cl = !!prev.cl; ev.c = prev.c; ev.kh = prev.kh; ev.m = now; }
		else { ev.u = []; ev.x = 0; ev.cl = false; ev.c = now; ev.m = now; }
		return { ev: ev };
	}

	/* ---------- time ---------- */
	function endOf(ev) { return ev.e || ev.s + 4 * HOUR; }
	/** Redis expiry (unix seconds): two months after the event ends */
	function expiresSec(ev) { return Math.ceil((endOf(ev) + KEEP) / 1000); }
	/** replies taken now? returns "" or why not */
	function closedWhy(ev, now) {
		if (ev.x) return "cancelled";
		if (ev.cl) return "closed";
		if (ev.dl && now > ev.dl) return "deadline";
		if (now > endOf(ev)) return "past";
		return "";
	}

	/* ---------- guests ---------- */
	function people(r) { return r && r.s === "y" ? 1 + (r.p || 0) : 0; }
	/** going replies in arrival order; marks waitlist positions when a guest limit is set. returns {map key->pos (0 = in), going, wait} */
	function waitlist(ev, r) {
		var keys = Object.keys(r).filter(function (k) { return r[k] && r[k].s === "y"; });
		keys.sort(function (a, b) { return (r[a].ty || r[a].t || 0) - (r[b].ty || r[b].t || 0) || (a < b ? -1 : 1); });
		var pos = {}, sum = 0, going = 0, wait = 0, n = 0;
		keys.forEach(function (k) {
			var p = people(r[k]);
			if (!ev.cap || sum + p <= ev.cap) { sum += p; going += p; pos[k] = 0; }
			else { n++; wait += p; pos[k] = n; }
		});
		return { pos: pos, going: going, wait: wait };
	}
	function tally(ev, r) {
		var w = waitlist(ev, r), c = { y: w.going, w: w.wait, yr: 0, m: 0, mr: 0, n: 0, total: 0 };
		Object.keys(r).forEach(function (k) {
			var x = r[k]; if (!x) return;
			c.total++;
			if (x.s === "y") { if (!w.pos[k]) c.yr++; }
			else if (x.s === "m") { c.mr++; c.m += 1 + (x.p || 0); }
			else if (x.s === "n") c.n++;
		});
		c.spots = ev.cap ? Math.max(0, ev.cap - w.going) : null;
		return c;
	}
	function itemKey(s) { return String(s).toLowerCase().slice(0, 80); }

	/** what this viewer may see */
	function view(id, st, ctx) {
		var ev = st.ev, r = st.r || {}, now = ctx.now, owner = !!ctx.owner;
		var mineR = ctx.bid && r[ctx.bid] ? r[ctx.bid] : null;
		var guest = !!mineR && (mineR.s === "y" || mineR.s === "m");
		var wl = waitlist(ev, r);
		var hideLoc = ev.lh && !owner && !guest;
		var pub = {};
		["t", "d", "hn", "s", "e", "z", "th", "f", "em", "po", "cap", "dl", "q", "br", "mb", "gl", "u", "x", "cl", "c", "m", "lh"].forEach(function (k) { pub[k] = ev[k]; });
		pub.l = hideLoc ? "" : ev.l; pub.o = hideLoc ? "" : ev.o;
		pub.hasL = !!ev.l; pub.hasO = !!ev.o;
		var out = { id: id, ev: pub, now: now, owner: owner, why: closedWhy(ev, now), hidLoc: hideLoc && (!!ev.l || !!ev.o) };
		out.open = !out.why;
		var showCounts = owner || ev.gl !== "host";
		out.counts = showCounts ? tally(ev, r) : null;
		if (owner || ev.gl === "all") {
			var g = [];
			Object.keys(r).forEach(function (k) {
				var x = r[k]; if (!x) return;
				var o = { s: x.s, n: x.n, p: x.p || 0, c: x.c || "", w: x.s === "y" ? wl.pos[k] || 0 : 0, t: x.ty || x.t, me: k === ctx.bid };
				if (owner) { o.k = k; o.a = x.a || []; o.h = !!x.h; o.u = x.u || x.t; }
				g.push(o);
			});
			g.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
			out.guests = g;
		} else out.guests = null;
		out.mine = mineR ? { s: mineR.s, n: mineR.n, p: mineR.p || 0, c: mineR.c || "", a: mineR.a || [], w: mineR.s === "y" ? wl.pos[ctx.bid] || 0 : 0, t: mineR.t } : null;
		var claims = st.i || {};
		out.bring = (ev.br || []).map(function (it) {
			var c = claims[itemKey(it)];
			var o = { it: it, taken: !!c, mine: !!(c && ctx.bid && c.k === ctx.bid) };
			if (c && (owner || ev.gl === "all" || o.mine)) o.by = c.n;
			return o;
		});
		return out;
	}

	/* ---------- requests ---------- */
	function err(code, msg) { return { code: code, error: msg, w: [] }; }
	function cleanRsvp(ev, b, prev) {
		var st = b.s;
		if (["y", "m", "n"].indexOf(st) < 0) return { error: "choose going, maybe or can't go" };
		if (st === "m" && !ev.mb) return { error: "the host asked for a yes or a no" };
		var n = text(b.n, 60, false);
		if (!n) return { error: n === "" ? "type your name" : "your name is too long (60 characters at most)" };
		var p = b.p === undefined ? 0 : b.p;
		if (st === "n") p = 0;
		if (!isInt(p) || p < 0 || p > (ev.po || 0)) return { error: ev.po ? "you can bring up to " + ev.po + (ev.po === 1 ? " other person" : " other people") : "this invitation is just for you" };
		var c = text(b.c, 400, true); if (c === null) return { error: "your note is too long (400 characters at most)" };
		var a = [];
		if (b.a !== undefined && !Array.isArray(b.a)) return { error: "bad answers" };
		for (var i = 0; i < (ev.q || []).length; i++) {
			var v = text((b.a || [])[i], 200, false);
			if (v === null) return { error: "an answer is too long (200 characters at most)" };
			a.push(v);
		}
		var r = { s: st, n: n, p: p, c: c, a: a, t: prev ? prev.t : 0, ty: prev ? prev.ty || 0 : 0 };
		if (prev && prev.h) r.h = 1;
		return { r: r };
	}

	/** decide one request. Returns {code, error?, w}. "new" is handled by the caller with cleanEvent. */
	function act(st, b, ctx) {
		var ev = st.ev, now = ctx.now, r = st.r || {}, i = st.i || {};
		var a = b.act;
		if (a === "view") return { code: 200, w: [] };

		if (a === "rsvp") {
			if (b.hp) return { code: 200, w: [], fake: true };                       // honeypot: pretend it worked
			if (!ctx.bid) return err(400, "bad browser id");
			if (!(Number(b.t) >= MIN_MS)) return err(400, "too fast, try again");
			var why = closedWhy(ev, now);
			if (why) return err(409, why === "cancelled" ? "this event was cancelled" : why === "past" ? "this event is over" : "replies are closed for this event");
			var prev = r[ctx.bid] || null;
			if (b.s === "x") { if (!prev) return { code: 200, w: [] }; return { code: 200, w: [["r", ctx.bid, null]].concat(dropClaims(i, ctx.bid)) }; }
			var c = cleanRsvp(ev, b, prev);
			if (c.error) return err(400, c.error);
			var w = [];
			if (!prev) {
				if (Object.keys(r).length >= LIMITS.guests) return err(409, "this event already has " + LIMITS.guests + " replies");
				if ((st.ip && st.ip[ctx.ipH] || 0) >= LIMITS.ipEvent) return err(409, "this event already has " + LIMITS.ipEvent + " replies from your network");
				c.r.t = now; w.push(["ip", ctx.ipH, 1]);
			} else c.r.u = now;
			if (c.r.s === "y" && (!prev || prev.s !== "y")) c.r.ty = now;
			if (c.r.s !== "y") delete c.r.ty;
			w.unshift(["r", ctx.bid, c.r]);
			if (c.r.s === "n") w = w.concat(dropClaims(i, ctx.bid));
			return { code: 200, w: w };
		}

		if (a === "claim") {
			if (!ctx.bid) return err(400, "bad browser id");
			var me = r[ctx.bid];
			if (!me || me.s === "n") return err(409, "reply going or maybe first, then pick what you'll bring");
			var it = text(b.it, 80, false), found = null;
			(ev.br || []).forEach(function (x) { if (x === it) found = x; });
			if (!found) return err(404, "that item is not on the list any more");
			var k = itemKey(found), cur = i[k];
			if (b.on) {
				if (cur && cur.k !== ctx.bid) return err(409, (cur.n || "someone") + " is already bringing that");
				if (cur) return { code: 200, w: [] };
				var mineN = Object.keys(i).filter(function (x) { return i[x] && i[x].k === ctx.bid; }).length;
				if (mineN >= LIMITS.claimsEach) return err(409, "you can pick up to " + LIMITS.claimsEach + " things");
				return { code: 200, w: [["i", k, { n: me.n, k: ctx.bid, t: now }]] };
			}
			if (!cur) return { code: 200, w: [] };
			if (cur.k !== ctx.bid && !ctx.owner) return err(403, "only the person bringing it can take it off");
			return { code: 200, w: [["i", k, null]] };
		}

		/* the host's actions */
		if (["edit", "post", "unpost", "hadd", "hedit", "hdel", "close", "cancel", "del", "hclaim"].indexOf(a) < 0) return err(400, "unknown action");
		if (!ctx.owner) return err(403, "only the host can do that");
		if (a === "del") return { code: 200, w: [["del"]] };
		if (a === "edit") {
			var body = {}; for (var key in b) if (key !== "act" && key !== "id" && key !== "key") body[key] = b[key];
			var ce = cleanEvent(body, now, ev);
			if (ce.error) return err(400, ce.error);
			var w2 = [["ev", ce.ev]], keep = {};
			ce.ev.br.forEach(function (x) { keep[itemKey(x)] = 1; });
			Object.keys(i).forEach(function (x) { if (!keep[x]) w2.push(["i", x, null]); });
			return { code: 200, w: w2 };
		}
		var nev = JSON.parse(JSON.stringify(ev));
		if (a === "post") {
			var m = text(b.m, 600, true);
			if (!m) return err(400, m === "" ? "type a message" : "the message is too long (600 characters at most)");
			nev.u = [{ t: now, m: m }].concat(nev.u || []).slice(0, LIMITS.updates);
			return { code: 200, w: [["ev", nev]] };
		}
		if (a === "unpost") {
			if (!isInt(b.ti)) return err(400, "bad update");
			nev.u = (nev.u || []).filter(function (x) { return x.t !== b.ti; });
			return { code: 200, w: [["ev", nev]] };
		}
		if (a === "close") { nev.cl = !!b.on; return { code: 200, w: [["ev", nev]] }; }
		if (a === "cancel") { nev.x = b.on ? now : 0; return { code: 200, w: [["ev", nev]] }; }
		if (a === "hadd" || a === "hedit") {
			var pk = a === "hedit" ? String(b.k || "") : "h" + ctx.rand();
			var old = a === "hedit" ? r[pk] : null;
			if (a === "hedit" && !old) return err(404, "that reply is gone");
			if (a === "hadd" && Object.keys(r).length >= LIMITS.guests) return err(409, "this event already has " + LIMITS.guests + " replies");
			var save = ev.mb; ev.mb = true;                           // the host may record a maybe even when guests can't
			var savePo = ev.po; ev.po = LIMITS.plus;                  // and any number of plus-ones
			var hc = cleanRsvp(ev, b, old || { h: 1 });
			ev.mb = save; ev.po = savePo;
			if (hc.error) return err(400, hc.error);
			hc.r.h = old ? old.h || 0 : 1;
			hc.r.t = old ? old.t : now; if (old) hc.r.u = now;
			if (hc.r.s === "y" && (!old || old.s !== "y")) hc.r.ty = now;
			if (hc.r.s !== "y") delete hc.r.ty;
			if (old && !old.h) { hc.r.a = old.a || []; }                // the host doesn't overwrite a guest's own answers
			if (!hc.r.h) delete hc.r.h;
			var w3 = [["r", pk, hc.r]];
			if (hc.r.s === "n") w3 = w3.concat(dropClaims(i, pk));
			return { code: 200, w: w3 };
		}
		if (a === "hdel") {
			var dk = String(b.k || "");
			if (!r[dk]) return { code: 200, w: [] };
			return { code: 200, w: [["r", dk, null]].concat(dropClaims(i, dk)) };
		}
		if (a === "hclaim") {                                      // the host frees an item
			var ik = itemKey(text(b.it, 80, false) || "");
			return { code: 200, w: i[ik] ? [["i", ik, null]] : [] };
		}
		return err(400, "unknown action");
	}
	function dropClaims(i, k) { return Object.keys(i).filter(function (x) { return i[x] && i[x].k === k; }).map(function (x) { return ["i", x, null]; }); }

	function apply(st, w) {
		st.r = st.r || {}; st.i = st.i || {}; st.ip = st.ip || {};
		w.forEach(function (op) {
			if (op[0] === "ev") st.ev = op[1];
			else if (op[0] === "r") { if (op[2]) st.r[op[1]] = op[2]; else delete st.r[op[1]]; }
			else if (op[0] === "i") { if (op[2]) st.i[op[1]] = op[2]; else delete st.i[op[1]]; }
			else if (op[0] === "ip") st.ip[op[1]] = (st.ip[op[1]] || 0) + op[2];
			else if (op[0] === "del") st.ev = null;
		});
		return st;
	}

	/* ---------- page helpers (formatting, calendar, sharing) ---------- */
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	/** wall-clock parts of ms in zone z */
	function partsIn(ms, z) {
		var f = new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
		var o = {}; f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
		return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
	}
	function offsetMin(ms, z) { var p = partsIn(ms, z); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 6e4); }
	/** wall-clock date "YYYY-MM-DD" + time "HH:MM" in zone z -> ms (handles daylight saving; a time in the spring-forward gap moves forward) */
	function fromLocal(date, time, z) {
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""), t = /^(\d{1,2}):(\d{2})/.exec(time || "");
		if (!m || !t) return NaN;
		var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
		var ms = guess - offsetMin(guess, z) * 6e4;
		ms = guess - offsetMin(ms, z) * 6e4;
		return ms;
	}
	function toLocal(ms, z) { var p = partsIn(ms, z); return { date: p.y + "-" + pad(p.mo) + "-" + pad(p.d), time: pad(p.h) + ":" + pad(p.mi) }; }
	function icsDate(ms) { var d = new Date(ms); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"; }
	function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
	function icsFold(line) { var out = [], s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); }
	/** an .ics file for the event (url = its page) */
	function ics(ev, id, url, now) {
		var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MES//Party//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
			"UID:party-" + id + "@mes.fm", "DTSTAMP:" + icsDate(now || Date.now()), "DTSTART:" + icsDate(ev.s), "DTEND:" + icsDate(endOf(ev)),
			"SUMMARY:" + icsText(ev.t), "DESCRIPTION:" + icsText((ev.d ? ev.d + "\n\n" : "") + (ev.o ? "Join online: " + ev.o + "\n" : "") + "Invitation: " + url),
			"URL:" + url];
		if (ev.l) lines.push("LOCATION:" + icsText(ev.l));
		if (ev.x) lines.push("STATUS:CANCELLED");
		lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(ev.t), "TRIGGER:-PT2H", "END:VALARM", "END:VEVENT", "END:VCALENDAR");
		return lines.map(icsFold).join("\r\n") + "\r\n";
	}
	function googleCal(ev, url) {
		var q = "action=TEMPLATE&text=" + encodeURIComponent(ev.t) + "&dates=" + icsDate(ev.s) + "/" + icsDate(endOf(ev)) +
			"&details=" + encodeURIComponent((ev.d ? ev.d.slice(0, 900) + "\n\n" : "") + (ev.o ? "Join online: " + ev.o + "\n" : "") + "Invitation: " + url) +
			(ev.l ? "&location=" + encodeURIComponent(ev.l) : "") + "&ctz=" + encodeURIComponent(ev.z);
		return "https://calendar.google.com/calendar/render?" + q;
	}
	function outlookCal(ev, url) {
		return "https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=" + encodeURIComponent(ev.t) +
			"&startdt=" + encodeURIComponent(new Date(ev.s).toISOString()) + "&enddt=" + encodeURIComponent(new Date(endOf(ev)).toISOString()) +
			"&body=" + encodeURIComponent((ev.d ? ev.d.slice(0, 900) + "\n\n" : "") + "Invitation: " + url) + (ev.l ? "&location=" + encodeURIComponent(ev.l) : "");
	}
	function mapLink(place) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place); }
	/** "in 3 days" / "in 5 hours" / "happening now" / "2 days ago" */
	function fromNow(ms, now, end) {
		var d = ms - now;
		if (d <= 0 && now < (end || ms)) return "happening now";
		var a = Math.abs(d), u;
		if (a < HOUR) u = Math.max(1, Math.round(a / 6e4)) + " min";
		else if (a < 2 * DAY) { var h = Math.round(a / HOUR); u = h + (h === 1 ? " hour" : " hours"); }
		else if (a < 60 * DAY) { var dd = Math.round(a / DAY); u = dd + " days"; }
		else { var mo = Math.round(a / (30.4 * DAY)); u = mo + (mo === 1 ? " month" : " months"); }
		return d > 0 ? "in " + u : u + " ago";
	}
	/** d / h / m / s left */
	function countdown(ms, now) { var d = Math.max(0, ms - now); return { d: Math.floor(d / DAY), h: Math.floor(d % DAY / HOUR), m: Math.floor(d % HOUR / 6e4), s: Math.floor(d % 6e4 / 1000) }; }
	/** the text of an invitation message */
	function inviteText(ev, url, when, to) {
		var s = (to ? to + ", you're" : "You're") + " invited: " + (ev.em ? ev.em + " " : "") + ev.t + "\n" + when;
		if (ev.l && !ev.lh) s += "\n" + ev.l;
		s += "\nRSVP here: " + url;
		return s;
	}
	/** CSV of the guest list (host view) */
	function guestCsv(v) {
		var qs = v.ev.q || [];
		var head = ["Name", "Reply", "Plus-ones", "Total people", "Waitlist", "Note"].concat(qs).concat(["Replied", "Added by host"]);
		var word = { y: "Going", m: "Maybe", n: "Can't go" };
		function cell(x) { x = String(x == null ? "" : x); return /[",\n\r]/.test(x) || /^[=+\-@]/.test(x) ? '"' + (/^[=+\-@]/.test(x) ? "'" : "") + x.replace(/"/g, '""') + '"' : x; }
		var rows = [head].concat((v.guests || []).map(function (g) {
			return [g.n, word[g.s] || g.s, g.p, g.s === "n" ? 0 : 1 + g.p, g.w ? "#" + g.w : "", g.c].concat(qs.map(function (_, i) { return (g.a || [])[i] || ""; }))
				.concat([new Date(g.t || 0).toISOString().slice(0, 16).replace("T", " "), g.h ? "yes" : ""]);
		}));
		return rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n") + "\r\n";
	}
	/** what is wrong with a draft before sending (page side) */
	function problems(b, now) { var c = cleanEvent(b, now, null); return c.error ? [c.error] : []; }

	var api = {
		THEMES: THEMES, FONTS: FONTS, GL: GL, LIMITS: LIMITS, KEEP: KEEP, MIN_MS: MIN_MS,
		themeOf: themeOf, fontOf: fontOf, text: text, link: link, validZone: validZone,
		cleanEvent: cleanEvent, cleanRsvp: cleanRsvp, act: act, apply: apply, view: view, tally: tally, waitlist: waitlist,
		closedWhy: closedWhy, endOf: endOf, expiresSec: expiresSec, itemKey: itemKey,
		partsIn: partsIn, offsetMin: offsetMin, fromLocal: fromLocal, toLocal: toLocal, ics: ics, googleCal: googleCal, outlookCal: outlookCal,
		mapLink: mapLink, fromNow: fromNow, countdown: countdown, inviteText: inviteText, guestCsv: guestCsv, problems: problems
	};
	if (typeof module === "object" && module.exports) module.exports = api;
	else root.MESParty = api;
})(typeof window !== "undefined" ? window : this);
