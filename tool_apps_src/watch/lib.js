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
	root.MESWatch = W;
	if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof window !== "undefined" ? window : globalThis);
