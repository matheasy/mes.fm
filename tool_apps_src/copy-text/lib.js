/* MESCopyText (CTLib): pure helpers shared by the JSON restore and the Hive backup of Copy Text. Node-testable
   (tool_apps_src/hive-store-tests.js). snapshot() = what goes into a backup (no ids, no UI state); merge() adds what is new
   (same board name = same board; a note with the same title + text is a duplicate); replace() builds a fresh state. */
(function (root) {
	"use strict";
	var COLORS = ["", "y", "g", "b", "p", "r"];
	function cleanNote(n, uid) {
		return { id: uid(), title: String(n.title || "").slice(0, 80), text: n.text, c: COLORS.indexOf(n.c) >= 0 ? n.c : "", pin: !!n.pin, t: +n.t || Date.now(), m: +n.m || 0 };
	}
	function valid(s) { if (!s || !Array.isArray(s.boards)) throw new Error("not a Copy Text backup"); return s; }
	function snapshot(state) {
		return { v: 1, boards: state.boards.map(function (b) {
			return { name: b.name, notes: b.notes.map(function (n) { var o = { title: n.title || "", text: n.text }; if (n.c) o.c = n.c; if (n.pin) o.pin = 1; if (n.t) o.t = n.t; if (n.m) o.m = n.m; return o; }) };
		}) };
	}
	function merge(state, incoming, uid) {
		valid(incoming);
		var added = 0, boards = 0;
		incoming.boards.forEach(function (ib) {
			if (!ib || !Array.isArray(ib.notes)) return;
			var b = null; state.boards.forEach(function (x) { if (x.name === ib.name) b = x; });
			if (!b) { b = { id: uid(), name: String(ib.name || "Imported").slice(0, 40), notes: [] }; state.boards.push(b); boards++; }
			ib.notes.forEach(function (n) {
				if (!n || typeof n.text !== "string") return;
				if (b.notes.some(function (x) { return x.text === n.text && (x.title || "") === (n.title || ""); })) return;
				b.notes.push(cleanNote(n, uid)); added++;
			});
		});
		return { added: added, boards: boards };
	}
	function replace(incoming, uid) {
		valid(incoming);
		var st = { v: 1, boards: [], cur: null };
		merge(st, incoming, uid);
		if (!st.boards.length) st.boards.push({ id: uid(), name: "My texts", notes: [] });
		st.cur = st.boards[0].id;
		return st;
	}
	function count(s) { var n = 0; (s && s.boards || []).forEach(function (b) { n += Array.isArray(b.notes) ? b.notes.length : 0; }); return n; }
	/* Hive backup status (kept per browser, never on the chain): rec = {t: backup time ms, acct, h: [hashes of title + text]}.
	   A note is "on" Hive when its title + text is in the last backup, "off" otherwise. */
	function hash(n) {
		var s = (n.title || "") + "\u0000" + (n.text || ""), h1 = 0x811c9dc5, h2 = 0x01000193;
		for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
		return h1.toString(36) + h2.toString(36);
	}
	function record(data, time, acct) {
		var h = [];
		(data && data.boards || []).forEach(function (b) { (b.notes || []).forEach(function (n) { if (n && typeof n.text === "string") { var x = hash(n); if (h.indexOf(x) < 0) h.push(x); } }); });
		return { t: +time || Date.now(), acct: acct || "", h: h };
	}
	function status(state, rec) {
		var on = {}, set = {}, out = { rec: rec || null, on: 0, off: 0, gone: 0, by: {} };
		if (!rec || !Array.isArray(rec.h)) { (state.boards || []).forEach(function (b) { out.off += b.notes.length; }); return out; }
		rec.h.forEach(function (x) { set[x] = 1; });
		state.boards.forEach(function (b) { b.notes.forEach(function (n) { var x = hash(n); if (set[x]) { out.by[n.id] = "on"; out.on++; on[x] = 1; } else { out.by[n.id] = "off"; out.off++; } }); });
		rec.h.forEach(function (x) { if (!on[x]) out.gone++; });
		return out;
	}
	var api = { hash: hash, record: record, status: status, COLORS: COLORS, snapshot: snapshot, merge: merge, replace: replace, count: count };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.CTLib = api;
})(typeof window !== "undefined" ? window : globalThis);
