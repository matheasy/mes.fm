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

	/* ---------- ☁ Sync (one copy-text.json file in a cloud folder / account) ----------
	   fileText() = what is written; parseFile() reads it back (a plain .json backup works too); sig() = a fingerprint of a
	   snapshot; plan() decides what a sync does from the fingerprints of the last synced copy (base), this browser (local) and
	   the cloud copy (remote); merge3() combines two sides that both changed: deletes and edits on either side are kept,
	   new texts on both sides are kept, same board name = same board, a note is its title + text. */
	function sig(snap) { return hash({ title: "", text: JSON.stringify(snap && snap.boards || []) }); }
	function fileText(snap, dev, time) {
		return JSON.stringify({ app: "mes-copy-text", v: 1, saved: +time || Date.now(), dev: dev || "", data: snap }, null, 1);
	}
	function parseFile(text) {
		if (text == null || !String(text).trim()) return null;
		var o = JSON.parse(text);
		var snap = o && o.app === "mes-copy-text" ? o.data : o;
		valid(snap);
		return { data: snapshot({ boards: snap.boards.filter(function (b) { return b && Array.isArray(b.notes); }).map(function (b) {
			return { name: String(b.name || "My texts").slice(0, 40), notes: b.notes.filter(function (n) { return n && typeof n.text === "string"; }) };
		}) }), saved: o && +o.saved || 0, dev: o && o.dev || "" };
	}
	function plan(bsig, lsig, rsig) {
		if (rsig == null) return "push";            // no cloud copy yet
		if (lsig === rsig) return "same";
		if (bsig == null) return "merge";           // first sync on this browser with an existing file
		if (rsig === bsig) return "push";           // only this browser changed
		if (lsig === bsig) return "pull";           // only the cloud copy changed
		return "merge";
	}
	function attrs(n) { return (n.c || "") + "|" + (n.pin ? 1 : 0); }
	function merge3(base, local, remote) {
		base = base || { boards: [] };
		function byName(s) { var m = {}; (s.boards || []).forEach(function (b) { if (!m[b.name]) m[b.name] = b; }); return m; }
		function keyed(b) { var m = {}; (b ? b.notes : []).forEach(function (n) { var k = hash(n); if (!m[k]) m[k] = n; }); return m; }
		var B = byName(base), L = byName(local), R = byName(remote), names = [];
		(remote.boards || []).forEach(function (b) { if (names.indexOf(b.name) < 0) names.push(b.name); });
		(local.boards || []).forEach(function (b, i) { if (names.indexOf(b.name) < 0) names.splice(Math.min(i, names.length), 0, b.name); });
		var out = [];
		names.forEach(function (name) {
			var b = B[name], l = L[name], r = R[name], kb = keyed(b), kl = keyed(l), kr = keyed(r);
			var newL = l ? l.notes.filter(function (n) { return !kb[hash(n)]; }) : [], newR = r ? r.notes.filter(function (n) { return !kb[hash(n)]; }) : [];
			if (b && !l && !newR.length) return;    // board deleted here, nothing new on the other side
			if (b && !r && !newL.length) return;    // board deleted on the other side
			var notes = [], seen = {};
			(r ? r.notes : []).forEach(function (n) {
				var k = hash(n); if (seen[k]) return;
				if (kb[k] && l && !kl[k]) return;       // deleted (or edited) here
				var ln = kl[k], bn = kb[k], use = n;
				if (ln && bn && attrs(ln) !== attrs(bn)) use = ln; // colour / pin changed here
				notes.push(use); seen[k] = 1;
			});
			if (l) l.notes.forEach(function (n, i) {
				var k = hash(n); if (seen[k]) return;
				if (kb[k] && r && !kr[k]) return;       // deleted on the other side
				if (kb[k] && !r) { notes.push(n); seen[k] = 1; return; }
				if (!kb[k]) { notes.splice(Math.min(i, notes.length), 0, n); seen[k] = 1; }
			});
			out.push({ name: name, notes: notes });
		});
		if (!out.length) out.push({ name: "My texts", notes: [] });
		return snapshot({ boards: out });
	}
	function fromSnap(snap, state, uid) {   // a full state from a snapshot, keeping the open board when it still exists
		var curName = null; (state && state.boards || []).forEach(function (b) { if (b.id === state.cur) curName = b.name; });
		var st = replace(snap, uid);
		st.boards.forEach(function (b) { if (b.name === curName) st.cur = b.id; });
		return st;
	}
	/* ---------- which boards are backed up / synced (chosen per browser, by board name; off = {name: 1}) ---------- */
	function anyOff(off) { return !!off && Object.keys(off).length > 0; }
	function pickBoards(snap, off) {   // a backup / first sync file: only the ticked boards (part: 1 = not everything)
		if (!anyOff(off)) return snap;
		var o = snapshot({ boards: (snap.boards || []).filter(function (b) { return !off[b.name]; }) }); o.part = 1; return o;
	}
	function maskBoards(target, source, off) {   // left-out boards come from source (the other copy), so a sync never touches them
		if (!anyOff(off)) return target;
		var src = {}, seen = {}, out = [];
		(source && source.boards || []).forEach(function (b) { if (!src[b.name]) src[b.name] = b; });
		(target.boards || []).forEach(function (b) { seen[b.name] = 1; if (!off[b.name]) out.push(b); else if (src[b.name]) out.push(src[b.name]); });
		(source && source.boards || []).forEach(function (b) { if (!seen[b.name] && off[b.name]) { out.push(b); seen[b.name] = 1; } });
		return snapshot({ boards: out });
	}
	function replacePart(mine, data) {   // "Replace" with a backup of only some boards: boards it doesn't have stay as they are
		if (!data.part) return data;
		var have = {}; (data.boards || []).forEach(function (b) { have[b.name] = 1; });
		return snapshot({ boards: (data.boards || []).concat((mine.boards || []).filter(function (b) { return !have[b.name]; })) });
	}
	function ago(ms, now) {
		var s = Math.max(0, Math.round(((now || Date.now()) - ms) / 1000));
		if (s < 45) return "just now";
		if (s < 3600) { var m = Math.round(s / 60); return m + (m === 1 ? " minute ago" : " minutes ago"); }
		if (s < 86400) { var h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
		var d = Math.round(s / 86400); return d + (d === 1 ? " day ago" : " days ago");
	}
	var api = { hash: hash, record: record, status: status, COLORS: COLORS, snapshot: snapshot, merge: merge, replace: replace, count: count,
		sig: sig, fileText: fileText, parseFile: parseFile, plan: plan, merge3: merge3, fromSnap: fromSnap, ago: ago, pickBoards: pickBoards, maskBoards: maskBoards, replacePart: replacePart, anyOff: anyOff };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.CTLib = api;
})(typeof window !== "undefined" ? window : globalThis);
