/* MES Watch -- mes.fm/watch. Pure helpers (node-testable): what a pasted link is (uses MESYA.parseLink from the YouTube Audio Analyzer),
   how the page plays it, the queue / saved / history lists, resume points and share links. */
(function (root) {
	"use strict";
	var W = {}, Y = root.MESYA || (typeof require === "function" ? require("../youtube-audio/lib.js") : null);
	W.MAX_HIST = 300; W.MAX_LIST = 500;

	/* how a link plays: yt = YouTube IFrame API, hls = 3Speak stream in our own <video>, odysee = Odysee file in our own <video>,
	   file = a direct media file, embed = the site's own player (no speed / resume), open = can only be opened on the site */
	W.mode = function (it) {
		if (!it) return "open";
		if (it.k === "youtube") return "yt";
		if (it.k === "3speak") return "hls";
		if (it.k === "odysee") return it.id ? "odysee" : "open";
		if (it.k === "direct") return "file";
		if (it.e) return "embed";
		return "open";
	};
	W.canSpeed = function (it) { var m = W.mode(it); return m === "yt" || m === "hls" || m === "odysee" || m === "file"; };
	W.SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
	W.ytSpeed = function (r) { return Math.max(0.25, Math.min(2, r)); };   // YouTube's player stops at 2x

	/* one link -> item {k, id, u (link to open), e (embed url), s (start s), key, t (title), th (thumbnail)} or {err} */
	W.item = function (text) {
		var L = Y.parseLink(text);
		if (!L.ok) return { err: L.reason };
		try { if (!/\./.test(new URL(L.watch).hostname)) return { err: "That is not a web link." }; } catch (e) { return { err: "That is not a web link." }; }
		var it = { k: L.kind, id: L.id || null, u: L.watch, e: L.embed || null, s: L.start || 0, t: "", th: "" };
		if (L.kind === "direct") { it.id = L.watch; it.t = L.file || "Media file"; }
		it.key = W.key(it);
		if (it.k === "youtube") it.th = "https://i.ytimg.com/vi/" + it.id + "/mqdefault.jpg";
		return it;
	};
	W.key = function (it) { return it.k + ":" + (it.id || it.u); };
	/* text with any number of links (lines, spaces, commas) -> {items, errors}; duplicates dropped */
	W.parseMany = function (text) {
		var parts = String(text || "").split(/[\s,]+/).filter(function (x) { return /[./]/.test(x) || /^@[A-Za-z0-9._-]{3,30}$/.test(x); }), seen = {}, items = [], errors = [], lists = [];
		var chans = [];
		parts.forEach(function (p) {
			var ch = W.channelRef(p); if (ch) { if (chans.indexOf(ch) < 0) chans.push(ch); return; }
			var pl = W.playlistId(p);
			if (pl && lists.indexOf(pl) < 0) lists.push(pl);
			if (pl && !/[?&]v=|youtu\.be\/[\w-]{6}/.test(p)) return;   // a playlist page: its videos come from YouTube later
			var it = W.item(p); if (it.err) { errors.push({ text: p, reason: it.err }); return; } if (seen[it.key]) return; seen[it.key] = 1; items.push(it);
		});
		return { items: items, errors: errors, playlists: lists, channels: chans };
	};
	/* a YouTube channel in a link or as @handle -> the key /api/yt-latest takes ("@name" or "UC..."), else "" */
	W.channelRef = function (text) {
		var t = String(text || "").trim(), m;
		if ((m = /^@([A-Za-z0-9._-]{3,30})$/.exec(t))) return "@" + m[1];
		if (!/^(https?:\/\/)?([\w-]+\.)?youtube\.com\//i.test(t)) return "";
		if ((m = /youtube\.com\/@([A-Za-z0-9._-]{3,30})(?:[\/?#]|$)/i.exec(t))) return "@" + m[1];
		if ((m = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})(?:[\/?#]|$)/i.exec(t))) return m[1];
		return "";
	};
	/* YouTube playlist id in a link (list=PL..., OLAK..., UU...), or "" (radio mixes RD... are endless, so left out) */
	W.playlistId = function (text) {
		var t = String(text || ""); if (!/^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(t)) return "";
		var m = /[?&#]list=([A-Za-z0-9_-]{10,64})/.exec(t);
		if (!m || /^RD/.test(m[1])) return "";
		return m[1];
	};
	/* ---------- YouTube Data API answers (signed in with Google: the person's own playlists) ---------- */
	/* a playlistItems entry -> a list item (pv = private: YouTube never plays those on other sites; ul = unlisted), or null for a deleted video */
	W.ytFromApi = function (pi) {
		if (!pi) return null;
		var sn = pi.snippet || {}, vid = (pi.contentDetails && pi.contentDetails.videoId) || (sn.resourceId && sn.resourceId.videoId) || "";
		if (!/^[\w-]{11}$/.test(vid)) return null;
		var ps = (pi.status && pi.status.privacyStatus) || "", title = String(sn.title || "");
		if (title === "Deleted video" || ps === "privacyStatusUnspecified") return null;
		var it = W.item("https://www.youtube.com/watch?v=" + vid); if (it.err) return null;
		if (title && title !== "Private video") it.t = title.slice(0, 200);
		var th = sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.high || sn.thumbnails["default"]);
		if (th && /^https:\/\//.test(th.url || "")) it.th = th.url;
		if (ps === "private" || title === "Private video") it.pv = 1; else if (ps === "unlisted") it.ul = 1;
		return it;
	};
	/* a playlists answer -> [{id, name, n, privacy, th}] */
	W.ytListsFromApi = function (j) {
		return ((j && j.items) || []).map(function (p) {
			var sn = p.snippet || {}, th = sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails["default"]);
			return { id: p.id, name: String(sn.title || "Playlist").slice(0, 80), n: (p.contentDetails && p.contentDetails.itemCount) || 0, privacy: (p.status && p.status.privacyStatus) || "", th: (th && th.url) || "" };
		}).filter(function (p) { return /^[A-Za-z0-9_-]{10,64}$/.test(p.id || ""); });
	};
	/* a Google API error answer -> a plain sentence */
	W.ytApiError = function (status, j) {
		var e = (j && j.error) || {}, r = ((e.errors && e.errors[0]) || {}).reason || (e.details && e.details[0] && e.details[0].reason) || e.status || "";
		if (status === 401) return "Google asks you to sign in again.";
		if (/accessNotConfigured|SERVICE_DISABLED/i.test(r) || /has not been used|is disabled/i.test(e.message || "")) return "YouTube's API is not switched on for mes.fm yet.";
		if (/quota/i.test(r)) return "YouTube's daily limit for mes.fm is used up. Try again tomorrow.";
		if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(r)) return "Google did not give access to your YouTube account. Sign in again and tick the YouTube box.";
		if (/playlistNotFound|notFound/i.test(r)) return "YouTube could not find that playlist.";
		if (/youtubeSignupRequired|channelNotFound/i.test(r)) return "This Google account has no YouTube channel yet.";
		return "YouTube did not answer" + (status ? " (" + status + ")" : "") + ".";
	};
	/* ---------- my own named lists ---------- */
	W.newList = function (name, items, now) { return { id: "l" + (now || Date.now()).toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: String(name || "My list").slice(0, 80), items: (items || []).slice(0, W.MAX_LIST) }; };
	W.findList = function (lists, id) { for (var i = 0; i < lists.length; i++) if (lists[i].id === id) return lists[i]; return null; };
	/* zoom: clamp scale 1..4 and keep the picture covering the box (no empty edges while zoomed in) */
	W.clampZoom = function (z, w, h) {
		var k = Math.max(1, Math.min(4, +z.k || 1)), mx = (k - 1) * w / 2, my = (k - 1) * h / 2;
		return { k: k, x: Math.max(-mx, Math.min(mx, +z.x || 0)), y: Math.max(-my, Math.min(my, +z.y || 0)) };
	};
	/* scale that makes a 16:9 picture fill a w x h box (crops the sides or top / bottom) */
	W.fillZoom = function (w, h, ar) { ar = ar || 16 / 9; if (!w || !h) return 1; var box = w / h; return Math.round(Math.max(box / ar, ar / box) * 100) / 100; };
	W.siteName = function (it) { return (Y.SITES && Y.SITES[it.k]) || "Video"; };
	W.label = function (it) { if (it.t) return it.t; if (it.k === "youtube") return "YouTube video " + it.id; if (it.id) return W.siteName(it) + ": " + it.id; try { var u = new URL(it.u); return W.siteName(it) + " link: " + u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""); } catch (e) { return it.u; } };

	/* ---------- lists (plain arrays of items, newest / first wins) ---------- */
	W.add = function (list, items, atFront) {
		var keys = {}; list.forEach(function (x) { keys[x.key] = 1; });
		var fresh = items.filter(function (x) { if (keys[x.key]) return false; keys[x.key] = 1; return true; });
		var out = atFront ? fresh.concat(list) : list.concat(fresh);
		return out.slice(0, W.MAX_LIST);
	};
	W.remove = function (list, key) { return list.filter(function (x) { return x.key !== key; }); };
	W.move = function (list, from, to) {
		var a = list.slice(); if (from < 0 || from >= a.length) return a;
		to = Math.max(0, Math.min(a.length - 1, to)); var x = a.splice(from, 1)[0]; a.splice(to, 0, x); return a;
	};
	W.indexOf = function (list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return i; return -1; };

	/* ---------- history + resume ---------- */
	W.touch = function (hist, it, pos, dur, now) {
		var h = W.remove(hist, it.key), rec = {}; for (var k in it) rec[k] = it[k];
		rec.pos = Math.max(0, +pos || 0); rec.dur = Math.max(0, +dur || 0); rec.at = now || Date.now();
		if (W.done(rec)) rec.pos = rec.dur;
		h.unshift(rec); return h.slice(0, W.MAX_HIST);
	};
	W.done = function (r) { return r.dur > 0 && (r.dur - r.pos < Math.max(15, r.dur * 0.04)); };
	/* where to start: the link's own ?t= wins, else the saved spot (only when it is worth it), else 0 */
	W.resumeAt = function (it, rec) {
		if (it.s) return it.s;
		if (!rec || !rec.pos || rec.pos < 20 || W.done(rec)) return 0;
		return Math.floor(rec.pos - 3);
	};
	W.pct = function (r) { return r && r.dur ? Math.max(0, Math.min(100, r.pos / r.dur * 100)) : 0; };

	/* ---------- share links ---------- */
	W.shareUrl = function (base, items, at, name) {
		var u = items.map(function (x) { return x.u; });
		var q = u.length === 1 && !name ? "v=" + encodeURIComponent(u[0]) + (at ? "&t=" + Math.floor(at) : "") : "l=" + u.map(encodeURIComponent).join("|");
		return base + "?" + q + (name ? "&n=" + encodeURIComponent(String(name).slice(0, 80)) : "");
	};
	/* query string -> {links: [...], t} */
	W.fromQuery = function (search) {
		var q = new URLSearchParams(String(search || "").replace(/^\?/, "")), links = [];
		if (q.get("v")) links.push(q.get("v"));
		if (q.get("l")) q.get("l").split("|").forEach(function (x) { if (x) links.push(x); });
		return { links: links, t: Math.max(0, parseInt(q.get("t") || "0", 10) || 0), name: (q.get("n") || "").slice(0, 80) };
	};
	/* the same video at a time: the site's own link with ?t= where the site has one */
	W.atTime = function (it, t) {
		t = Math.floor(t || 0);
		if (it.k === "youtube") return "https://www.youtube.com/watch?v=" + it.id + (t ? "&t=" + t + "s" : "");
		return it.u;
	};
	W.fmt = function (s) {
		s = Math.max(0, Math.floor(+s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
	};
	W.ago = function (ms, now) {
		var d = Math.max(0, ((now || Date.now()) - ms) / 1000);
		if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + " min ago"; if (d < 86400) return Math.floor(d / 3600) + " h ago";
		var n = Math.floor(d / 86400); return n === 1 ? "yesterday" : n + " days ago";
	};
	/* ---------- sync (own cloud file) + Hive backup ---------- */
	// what is shared between devices: the lists, not per-device settings (speed, zoom, ticks) or the playing position in Up next
	var IT = ["k", "id", "u", "e", "s", "t", "th", "key"];
	function slim(it, extra) { var o = {}; IT.concat(extra || []).forEach(function (f) { if (it[f] != null && it[f] !== "") o[f] = it[f]; }); return o; }
	W.snap = function (S, withHist) {
		var o = { v: 1, q: (S.q || []).map(function (x) { return slim(x); }), saved: (S.saved || []).map(function (x) { return slim(x); }),
			lists: (S.lists || []).map(function (l) { var r = { id: l.id, name: l.name, items: (l.items || []).map(function (x) { return slim(x); }) }; if (l.src) r.src = l.src; return r; }),
			chans: (S.chans || []).map(function (c) { return { k: c.k, n: c.n || "" }; }) };
		if (withHist) o.hist = (S.hist || []).map(function (x) { return slim(x, ["pos", "dur", "at"]); });
		return o;
	};
	W.snapCount = function (d) { d = d || {}; var n = (d.q || []).length + (d.saved || []).length + (d.chans || []).length; (d.lists || []).forEach(function (l) { n += (l.items || []).length; }); return n; };
	function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
	function idx(list, kf) { var m = {}; (list || []).forEach(function (x) { m[kf(x)] = x; }); return m; }
	// three-way merge of a keyed list: an item deleted on one side stays deleted, new items from both sides are kept,
	// the other side's order wins and this side's new items are put back after the item they followed here
	W.merge3List = function (base, mine, theirs, kf, pick) {
		base = base || []; mine = mine || []; theirs = theirs || [];
		if (same(mine, base)) return theirs.slice(); if (same(theirs, base)) return mine.slice();
		var b = idx(base, kf), m = idx(mine, kf), t = idx(theirs, kf), out = [], seen = {};
		theirs.forEach(function (x) { var k = kf(x); if (b[k] && !m[k]) return; out.push(m[k] && pick ? pick(m[k], x, b[k]) : m[k] || x); seen[k] = 1; });
		var prev = null;
		mine.forEach(function (x) {
			var k = kf(x);
			if (!seen[k] && !(b[k] && !t[k])) {
				var at = 0; if (prev != null) { for (var i = 0; i < out.length; i++) if (kf(out[i]) === prev) { at = i + 1; break; } }
				out.splice(at, 0, x); seen[k] = 1;
			}
			if (seen[k]) prev = k;
		});
		return out;
	};
	function itemPick(m, t) { var o = {}; for (var f in t) o[f] = t[f]; for (var g in m) if (m[g] != null && m[g] !== "") o[g] = m[g]; return o; }
	function key(x) { return x.key; }
	W.merge3 = function (base, mine, theirs) {
		base = base || {}; mine = mine || {}; theirs = theirs || {};
		var out = { v: 1 };
		out.q = W.merge3List(base.q, mine.q, theirs.q, key, itemPick);
		out.saved = W.merge3List(base.saved, mine.saved, theirs.saved, key, itemPick);
		out.chans = W.merge3List(base.chans, mine.chans, theirs.chans, function (c) { return c.k; }, function (m, t) { return { k: m.k, n: m.n || t.n || "" }; });
		var bl = idx(base.lists, function (l) { return l.id; });
		out.lists = W.merge3List(base.lists, mine.lists, theirs.lists, function (l) { return l.id; }, function (m, t, b) {
			var r = { id: m.id, name: b && m.name !== b.name ? m.name : t.name, items: W.merge3List(b ? b.items : [], m.items, t.items, key, itemPick) };
			if (m.src || t.src) r.src = m.src || t.src; return r;
		});
		if (mine.hist || theirs.hist) {
			var bh = idx(base.hist, key), mh = idx(mine.hist, key), th = idx(theirs.hist, key), h = [], ks = {};
			(mine.hist || []).concat(theirs.hist || []).forEach(function (x) { ks[x.key] = 1; });
			Object.keys(ks).forEach(function (k) {
				var a = mh[k], c = th[k], b0 = bh[k];
				if (b0 && (!a || !c)) { var left = a || c; if (!left || (left.at || 0) <= (b0.at || 0)) return; }   // removed on one side, untouched on the other
				h.push(!a ? c : !c ? a : (a.at || 0) >= (c.at || 0) ? a : c);
			});
			h.sort(function (x, y) { return (y.at || 0) - (x.at || 0); });
			out.hist = h.slice(0, W.MAX_HIST);
		}
		void bl; return out;
	};
	// a Hive backup loaded with "Add to mine": everything new is added, nothing of mine is removed
	W.mergeAdd = function (mine, other) {
		var r = W.merge3({ q: [], saved: [], lists: [], chans: [] }, mine, other), added = W.snapCount(r) - W.snapCount(mine);
		r.hist = mine.hist; return { data: r, added: Math.max(0, added) };
	};
	W.fileText = function (data, dev) { return JSON.stringify({ app: "mes-watch", v: 1, saved: new Date().toISOString(), dev: dev || "", data: data }); };
	W.readFile = function (text) {
		if (!text || !String(text).trim()) return null;
		var j = JSON.parse(text);
		if (j && j.app === "mes-watch" && j.data) return j.data;
		if (j && (j.q || j.saved || j.lists)) return j;
		throw new Error("That file is not a MES Watch file.");
	};
	root.MESWatch = W;
	if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof window !== "undefined" ? window : globalThis);
