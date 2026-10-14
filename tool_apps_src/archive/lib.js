/* MES Archive: the table of web-archive services and the URL builder (no DOM; node-testable). Exposed as MESArchive. Also copied to the browser extension (extension/engines.js).
 * An engine: { id, name, g (group), badge: [text, bg], url: template, variants?: [{id,label,v}], note, needs? }. Template tokens: {u} = the page address URL-encoded, {raw} = as is, {v} = the chosen variant. */
(function (root) {
	"use strict";
	var GROUPS = [
		["save", "Save a new copy", "Take a snapshot of the page as it is right now."],
		["find", "Find copies that already exist", "Look for snapshots other people (or you, earlier) already saved."],
		["read", "Read without a paywall", "Open a readable version of an article."],
		["chain", "On a blockchain", "A permanent, tamper-evident copy."]
	];
	var AT = [{ id: "ph", label: "archive.ph", v: "ph" }, { id: "is", label: "archive.is", v: "is" }, { id: "today", label: "archive.today", v: "today" }, { id: "md", label: "archive.md", v: "md" }, { id: "vn", label: "archive.vn", v: "vn" }, { id: "li", label: "archive.li", v: "li" }, { id: "fo", label: "archive.fo", v: "fo" }];
	var ENGINES = [
		{ id: "wb-save", g: "save", name: "Wayback Machine: Save Page Now", badge: ["IA", "#0d5c8c"], url: "https://web.archive.org/save/{raw}", note: "The Internet Archive. Takes a fresh snapshot (can take a minute) and gives you a permanent link." },
		{ id: "at-save", g: "save", name: "archive.today (archive.ph)", badge: ["AT", "#c0392b"], url: "https://archive.{v}/?run=1&url={u}", variants: AT, note: "Saves a full copy, including pages the Wayback Machine cannot. If one address is blocked or slow in your country, pick another." },
		{ id: "ghost", g: "save", name: "Ghostarchive", badge: ["Gh", "#4a4a6a"], url: "https://ghostarchive.org/search?term={u}", note: "Independent archive, good for social media and videos. Press the archive button on the page it opens." },
		{ id: "mega", g: "save", name: "Megalodon (Japan)", badge: ["Me", "#2e7d32"], url: "https://megalodon.jp/?url={u}", note: "A Japanese archive with its own copy of the page. Press the button on the page it opens." },
		{ id: "wb-view", g: "find", name: "Wayback Machine: newest copy", badge: ["IA", "#0d5c8c"], url: "https://web.archive.org/web/{raw}", note: "Opens the most recent snapshot, or tells you there is none." },
		{ id: "wb-all", g: "find", name: "Wayback Machine: all dates (calendar)", badge: ["IA", "#0d5c8c"], url: "https://web.archive.org/web/*/{raw}", note: "A calendar of every snapshot of this address, back to the first." },
		{ id: "at-find", g: "find", name: "archive.today: newest copy", badge: ["AT", "#c0392b"], url: "https://archive.{v}/newest/{raw}", variants: AT, note: "Opens the newest copy saved on archive.today, if any." },
		{ id: "arq", g: "find", name: "Arquivo.pt (Portuguese web archive)", badge: ["Ar", "#b5651d"], url: "https://arquivo.pt/wayback/{raw}", note: "National archive of Portugal: also holds a lot of the wider web." },
		{ id: "rp", g: "read", name: "RemovePaywall", badge: ["RP", "#6a1b9a"], url: "https://www.removepaywall.com/search?url={u}", note: "Tries to show an article without the subscription wall." },
		{ id: "hive", g: "chain", name: "ArcHive: Hive blockchain", badge: ["Hv", "#e31337"], url: "https://dhenz14.github.io/archive/?url={u}", needs: "Hive Keychain", link: ["Get the ArcHive bookmarklet", "https://dhenz14.github.io/archive/"], note: "A third-party tool (ArcHive by dhenz14) that stores the page text on the Hive blockchain with a cryptographic hash. The link opens it with your address and checks whether the page is already archived. To publish a NEW copy from a computer, ArcHive needs the page read inside your browser: use the MES Archive extension (it does this for you) or ArcHive's own bookmarklet. On Android the link alone works. You sign with Hive Keychain or HiveAuth." }
	];
	var SETS = [
		["save", "Save now", ["wb-save", "at-save", "ghost"]],
		["find", "Find existing", ["wb-view", "at-find", "arq"]],
		["both", "Save and check", ["wb-save", "at-save", "ghost", "wb-all", "at-find"]],
		["forever", "Save + Hive", ["wb-save", "at-save", "hive"]],
		["all", "Everything", ENGINES.map(function (e) { return e.id; })]
	];
	var TRACK = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src|ref_url|si|feature|spm|share_id)$/i;
	/* what a person pasted -> a clean http(s) address, or "" */
	function cleanUrl(s, stripTracking) {
		s = String(s || "").trim().replace(/^["'<]+|["'>]+$/g, "");
		if (!s) return "";
		if (/^\/\//.test(s)) s = "https:" + s;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { if (/^[^\s/?#]+\.[^\s/?#]{2,}([/?#].*)?$/.test(s)) s = "https://" + s; else return ""; }
		if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s)) return "";
		try {
			var u = new URL(s);
			if (!/\./.test(u.hostname) && u.hostname !== "localhost") return "";
			if (stripTracking) { Array.from(u.searchParams.keys()).forEach(function (k) { if (TRACK.test(k)) u.searchParams.delete(k); }); }
			return u.href;
		} catch (e) { return ""; }
	}
	function build(engine, url, variant) {
		var v = variant || (engine.variants && engine.variants[0].v) || "";
		return engine.url.replace(/\{u\}/g, encodeURIComponent(url)).replace(/\{raw\}/g, url).replace(/\{v\}/g, v);
	}
	function customUrl(tpl, url) { return tpl.replace(/\{u\}|%s/g, encodeURIComponent(url)).replace(/\{raw\}/g, url); }
	function validTemplate(t) { return /^https?:\/\//i.test(t || "") && /\{u\}|%s|\{raw\}/.test(t); }
	function byId(id) { for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].id === id) return ENGINES[i]; return null; }
	root.MESArchive = { GROUPS: GROUPS, ENGINES: ENGINES, SETS: SETS, AT: AT, cleanUrl: cleanUrl, build: build, customUrl: customUrl, validTemplate: validTemplate, byId: byId };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESArchive;
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : globalThis));
