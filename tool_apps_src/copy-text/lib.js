/* MESCopyText (CTLib): pure helpers shared by the JSON restore and the Hive backup of Copy Text. Node-testable
   (tool_apps_src/hive-store-tests.js). snapshot() = what goes into a backup (no ids, no UI state); merge() adds what is new
   (same board name = same board; a note with the same title + text is a duplicate); replace() builds a fresh state. */
(function (root) {
	"use strict";
	var COLORS = ["", "y", "g", "b", "p", "r"];
	function cleanNote(n, uid) {
		return { id: uid(), title: String(n.title || "").slice(0, 80), text: n.text, c: COLORS.indexOf(n.c) >= 0 ? n.c : "", pin: !!n.pin, t: +n.t || Date.now() };
	}
	function valid(s) { if (!s || !Array.isArray(s.boards)) throw new Error("not a Copy Text backup"); return s; }
	function snapshot(state) {
		return { v: 1, boards: state.boards.map(function (b) {
			return { name: b.name, notes: b.notes.map(function (n) { var o = { title: n.title || "", text: n.text }; if (n.c) o.c = n.c; if (n.pin) o.pin = 1; if (n.t) o.t = n.t; return o; }) };
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
	var api = { COLORS: COLORS, snapshot: snapshot, merge: merge, replace: replace, count: count };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.CTLib = api;
})(typeof window !== "undefined" ? window : globalThis);
