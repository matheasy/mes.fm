/* MES Galleries core (= MESGal): private client galleries (photos + videos) and e-signed contracts.
 * Byte-identical copy at mes.fm/api/_galleries-lib.js (cp after editing; tests check).
 * The SAME handle() runs on the server (Upstash + Cloudflare R2 + Resend) and in the page's test mode (localStorage + IndexedDB),
 * so the rules are written once. ctx = {db, blob, mail, now(), rand(n) -> hex, sha(s) -> hex hex, ip, owner: bool, base}.
 *   db:   get(k) / set(k, v, ttlSec?) / del(k) / incr(k, ttlSec?) / sadd(k, m) / srem(k, m) / smembers(k)
 *   blob: putUrl(path, size, type) -> url | {mock}, getUrl(path) -> url, del(path)
 *   mail: send({to, subject, text, html}) -> {ok, id?, mock?}
 * Files are encrypted in the OWNER'S browser (AES-256-GCM, one key per gallery: object = 12-byte IV + ciphertext), so R2 only holds
 * scrambled bytes. The key lives in the gallery record and is handed to a client only after the one-time email code. */
(function (root) {
	"use strict";
	var G = {};
	G.V = 1;
	G.CHUNK = 8 * 1024 * 1024;           // video pieces (plain bytes per piece)
	G.WEB = 2048;                        // web-size long side
	G.THUMB = 480;
	G.CODE_TTL = 15 * 60;                // seconds
	G.TOKEN_TTL = 30 * 86400;
	G.MAX_ITEMS = 2000;
	G.MAX_FILE = 8 * 1024 * 1024 * 1024; // 8 GB per original
	G.DL = ["none", "web", "full"];
	G.ID_RE = /^[a-z0-9]{10}$/;
	G.ITEM_RE = /^[a-z0-9]{10}$/;
	G.EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

	G.normEmail = function (e) { return String(e || "").trim().toLowerCase(); };
	G.validEmail = function (e) { e = G.normEmail(e); return e.length <= 200 && G.EMAIL_RE.test(e); };
	G.text = function (v, max, lines) {
		if (v == null) return "";
		var s = String(v).replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ");
		s = lines ? s.replace(/[ \t]+/g, " ").replace(/\n{4,}/g, "\n\n\n").trim() : s.replace(/\s+/g, " ").trim();
		return s.slice(0, max);
	};
	G.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/** the paths an item's encrypted pieces live at */
	G.paths = function (gid, it) {
		var b = "g/" + gid + "/" + it.id + "/", p = { thumb: b + "t", web: b + "w", full: [] };
		if (it.kind === "vid") { for (var i = 0; i < (it.chunks || 1); i++) p.full.push(b + "c" + i); }
		else p.full.push(b + "f");
		return p;
	};
	G.chunkCount = function (size) { return Math.max(1, Math.ceil(size / G.CHUNK)); };
	G.fitSize = function (w, h, max) { if (w <= max && h <= max) return [w, h]; var k = max / Math.max(w, h); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; };
	G.fmtBytes = function (n) { n = +n || 0; var u = ["B", "KB", "MB", "GB", "TB"], i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + " " + u[i]; };
	G.gallerySize = function (g) { return (g.items || []).reduce(function (a, it) { return a + (it.size || 0) + (it.wsize || 0) + (it.tsize || 0); }, 0); };
	G.expired = function (g, now) { return !!(g.expires && now > g.expires); };
	G.isOpen = function (g, now) { return !!g && g.active && !G.expired(g, now); };

	/** contract templates: {{field}} placeholders; fields = [{k, label}] found in order */
	G.fields = function (body) {
		var seen = {}, out = [], re = /\{\{\s*([a-z][a-z0-9_ ]{0,40}?)\s*\}\}/gi, m;
		while ((m = re.exec(String(body || "")))) { var k = m[1].toLowerCase().replace(/\s+/g, "_"); if (!seen[k]) { seen[k] = 1; out.push(k); } }
		return out;
	};
	G.fill = function (body, vals) {
		return String(body || "").replace(/\{\{\s*([a-z][a-z0-9_ ]{0,40}?)\s*\}\}/gi, function (all, k) {
			k = k.toLowerCase().replace(/\s+/g, "_");
			return vals && vals[k] != null && vals[k] !== "" ? String(vals[k]) : "____";
		});
	};
	G.DEFAULT_TEMPLATE = {
		id: "photo-basic", name: "Photography agreement",
		body: "PHOTOGRAPHY AGREEMENT\n\nThis agreement is between {{photographer}} (\"Photographer\") and {{client_name}} (\"Client\").\n\n" +
			"1. Session. Date: {{date}}. Location: {{location}}. Package: {{package}}.\n" +
			"2. Fee. The total fee is {{price}}. A non-refundable retainer of {{retainer}} is due on signing to hold the date; the balance is due by {{balance_due}}.\n" +
			"3. Delivery. Edited images are delivered in a private online gallery within {{delivery_time}} of the session. The gallery stays open for {{gallery_time}}.\n" +
			"4. Cancellation. If the Client cancels, the retainer is kept. If the Photographer cannot attend because of illness or emergency, all payments are refunded.\n" +
			"5. Copyright and use. The Photographer keeps the copyright. The Client may print and share the images for personal use. The Photographer may use selected images in a portfolio and online unless the Client opts out here: {{portfolio_opt_out}}.\n" +
			"6. Liability. The Photographer's liability is limited to the fees paid.\n\n" +
			"By signing, both parties agree to these terms. Electronic signatures count as original signatures."
	};
	/** a stable fingerprint of the exact text signed (shown in the audit trail) */
	G.textHash = function (sha, title, body) { return sha("mes-gal-contract|" + title + "\n" + body); };

	function ok(v) { v = v || {}; v.ok = true; return v; }
	function err(code, msg) { return { ok: false, status: code, error: msg }; }
	function pubGallery(g) { return { id: g.id, title: g.title, date: g.date, active: !!g.active, expires: g.expires || 0, by: g.by || "" }; }
	function mailWrap(title, lines, btn) {
		var html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222;line-height:1.5">' +
			'<h2 style="font-weight:600;color:#3a3a3a">' + G.esc(title) + '</h2>' +
			lines.map(function (l) { return "<p>" + G.esc(l) + "</p>"; }).join("") +
			(btn ? '<p><a href="' + G.esc(btn[1]) + '" style="display:inline-block;background:#5b4a3a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">' + G.esc(btn[0]) + "</a></p>" : "") + "</div>";
		return { html: html, text: title + "\n\n" + lines.join("\n\n") + (btn ? "\n\n" + btn[0] + ": " + btn[1] : "") };
	}
	G.mailWrap = mailWrap;

	async function getGal(ctx, gid) { return G.ID_RE.test(gid || "") ? await ctx.db.get("gal:g:" + gid) : null; }
	async function session(ctx, tok) {
		if (!/^[a-f0-9]{40}$/.test(tok || "")) return null;
		var s = await ctx.db.get("gal:tok:" + tok); if (!s) return null;
		var g = await getGal(ctx, s.gid); if (!g) return null;
		if (!G.isOpen(g, ctx.now())) return { g: g, closed: true, s: s };
		if ((g.emails || []).indexOf(s.email) < 0) return null;
		return { g: g, s: s };
	}
	async function rate(ctx, key, max, sec) { var n = await ctx.db.incr("gal:rl:" + key, sec); return n <= max; }

	/** one entry point for every request; b = JSON body */
	G.handle = async function (b, ctx) {
		b = b || {};
		var op = String(b.op || ""), now = ctx.now(), ipk = ctx.sha("ip|" + (ctx.ip || "x")).slice(0, 24);
		if (ctx.owner && OWNER[op]) return OWNER[op](b, ctx, now);
		if (!PUBLIC[op]) return err(400, "unknown op");
		if (!(await rate(ctx, "a:" + ipk, 600, 3600))) return err(429, "Too many requests. Try again in an hour.");
		return PUBLIC[op](b, ctx, now, ipk);
	};

	var PUBLIC = {
		/** what the email box needs to know */
		info: async function (b, ctx, now) {
			var g = await getGal(ctx, b.gid);
			if (!g) return err(404, "This gallery link is not right, or the gallery was deleted.");
			return ok({ gallery: pubGallery(g), open: G.isOpen(g, now), brand: (await ctx.db.get("gal:brand")) || {} });
		},
		code: async function (b, ctx, now, ipk) {
			var g = await getGal(ctx, b.gid), email = G.normEmail(b.email);
			if (!g) return err(404, "Gallery not found.");
			if (!G.validEmail(email)) return err(400, "Type a full email address.");
			if (!G.isOpen(g, now)) return err(403, "This gallery is not open right now. Please contact your photographer.");
			if (!(await rate(ctx, "c:" + ipk, 20, 3600)) || !(await rate(ctx, "ce:" + ctx.sha(email).slice(0, 20), 6, 3600))) return err(429, "Too many codes asked for. Try again later.");
			// same answer whether or not the email is on the list, so the list can't be guessed
			if ((g.emails || []).indexOf(email) < 0) return ok({ sent: true });
			var code = String(parseInt(ctx.rand(4), 16) % 1000000).padStart(6, "0");
			await ctx.db.set("gal:code:" + g.id + ":" + ctx.sha(email).slice(0, 24), { h: ctx.sha("code|" + code), n: 0 }, G.CODE_TTL);
			var brand = (await ctx.db.get("gal:brand")) || {};
			var m = mailWrap("Your code for " + g.title, ["Your code is: " + code, "Type it on the gallery page within 15 minutes. If you did not ask for it, you can ignore this email."]);
			var r = await ctx.mail.send({ to: email, subject: code + " is your gallery code" + (brand.name ? " (" + brand.name + ")" : ""), text: m.text, html: m.html });
			return ok({ sent: true, mock: r && r.mock ? code : undefined });
		},
		verify: async function (b, ctx, now) {
			var g = await getGal(ctx, b.gid), email = G.normEmail(b.email);
			if (!g || !G.isOpen(g, now)) return err(403, "This gallery is not open right now.");
			var k = "gal:code:" + g.id + ":" + ctx.sha(email).slice(0, 24), c = await ctx.db.get(k);
			if (!c) return err(400, "That code ran out. Ask for a new one.");
			if (c.h !== ctx.sha("code|" + String(b.code || "").replace(/\D/g, ""))) {
				c.n = (c.n || 0) + 1;
				if (c.n >= 5) await ctx.db.del(k); else await ctx.db.set(k, c, G.CODE_TTL);
				return err(400, c.n >= 5 ? "Too many wrong codes. Ask for a new one." : "That code is not right.");
			}
			await ctx.db.del(k);
			var tok = ctx.rand(20);
			await ctx.db.set("gal:tok:" + tok, { gid: g.id, email: email, at: now }, G.TOKEN_TTL);
			return ok({ token: tok });
		},
		open: async function (b, ctx, now) {
			var se = await session(ctx, b.token);
			if (!se) return err(401, "Please sign in again.");
			if (se.closed) return err(403, "This gallery is not open right now.");
			var g = se.g, email = se.s.email, eh = ctx.sha(email).slice(0, 24);
			var day = new Date(now).toISOString().slice(0, 10);
			await ctx.db.incr("gal:v:" + g.id + ":" + eh + ":" + day, 400 * 86400);
			var log = (await ctx.db.get("gal:vl:" + g.id)) || {};
			log[email] = { n: ((log[email] || {}).n || 0) + 1, last: now };
			await ctx.db.set("gal:vl:" + g.id, log);
			var items = [];
			for (var i = 0; i < (g.items || []).length; i++) {
				var it = g.items[i], p = G.paths(g.id, it);
				items.push({ id: it.id, kind: it.kind, name: it.name, w: it.w, h: it.h, type: it.type, size: it.size, dur: it.dur || 0, chunks: it.chunks || 1, thumb: await ctx.blob.getUrl(p.thumb) });
			}
			return ok({ gallery: pubGallery(g), key: g.key, dl: g.dl, wm: !!g.wm, wmText: g.wmText || "", items: items, favs: (await ctx.db.get("gal:fav:" + g.id + ":" + eh)) || [], email: email, brand: (await ctx.db.get("gal:brand")) || {} });
		},
		urls: async function (b, ctx) {
			var se = await session(ctx, b.token); if (!se || se.closed) return err(401, "Please sign in again.");
			var g = se.g, want = b.want === "full" ? "full" : "web", out = {};
			if (want === "full" && g.dl !== "full") want = "web";
			var ids = Array.isArray(b.ids) ? b.ids.slice(0, 60) : [];
			for (var i = 0; i < ids.length; i++) {
				var it = (g.items || []).find(function (x) { return x.id === ids[i]; }); if (!it) continue;
				var p = G.paths(g.id, it), list = it.kind === "vid" || want === "full" ? p.full : [p.web];
				if (it.kind === "img" && want === "web" && !it.wsize) list = p.full;
				var u = []; for (var j = 0; j < list.length; j++) u.push(await ctx.blob.getUrl(list[j]));
				out[it.id] = u;
			}
			return ok({ urls: out, want: want });
		},
		fav: async function (b, ctx) {
			var se = await session(ctx, b.token); if (!se || se.closed) return err(401, "Please sign in again.");
			var ids = (Array.isArray(b.favs) ? b.favs : []).filter(function (x) { return G.ITEM_RE.test(x); }).slice(0, G.MAX_ITEMS);
			await ctx.db.set("gal:fav:" + se.g.id + ":" + ctx.sha(se.s.email).slice(0, 24), ids);
			var all = (await ctx.db.get("gal:fl:" + se.g.id)) || {}; all[se.s.email] = ids.length; await ctx.db.set("gal:fl:" + se.g.id, all);
			return ok({ n: ids.length });
		},
		/** a client opens a contract from the emailed link */
		contract: async function (b, ctx) {
			var c = /^[a-z0-9]{10}$/.test(b.cid || "") ? await ctx.db.get("gal:c:" + b.cid) : null;
			if (!c || c.t !== ctx.sha("ct|" + String(b.t || ""))) return err(404, "This contract link is not right, or it was withdrawn.");
			var brand = (await ctx.db.get("gal:brand")) || {};
			return ok({ contract: clientContract(c), brand: brand });
		},
		sign: async function (b, ctx, now, ipk) {
			var c = /^[a-z0-9]{10}$/.test(b.cid || "") ? await ctx.db.get("gal:c:" + b.cid) : null;
			if (!c || c.t !== ctx.sha("ct|" + String(b.t || ""))) return err(404, "This contract link is not right.");
			if (c.status === "signed") return err(409, "This contract is already signed.");
			var name = G.text(b.name, 120), sig = String(b.sig || "");
			if (name.length < 2) return err(400, "Type your full name.");
			if (b.agree !== true) return err(400, "Tick the box to agree.");
			if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{100,200000}$/.test(sig)) return err(400, "Draw your signature in the box.");
			if (b.hash !== c.hash) return err(409, "The contract changed while you were reading it. Reload the page.");
			c.status = "signed";
			c.signed = { name: name, sig: sig, at: now, email: c.email, ip: ctx.sha("sigip|" + (ctx.ip || "")).slice(0, 16), ua: G.text(b.ua, 200), tz: G.text(b.tz, 60) };
			c.log = (c.log || []).concat([{ at: now, ev: "signed", by: c.email }]);
			await ctx.db.set("gal:c:" + c.id, c);
			var brand = (await ctx.db.get("gal:brand")) || {}, link = ctx.base + "/galleries?c=" + c.id + "&t=" + b.t;
			var m1 = mailWrap("Signed: " + c.title, ["Thank you, " + name + ". You signed \"" + c.title + "\". Keep this email: the link below shows the signed agreement and lets you download it as a PDF."], ["View and download the signed agreement", link]);
			await ctx.mail.send({ to: c.email, subject: "Signed: " + c.title, text: m1.text, html: m1.html });
			if (brand.email) {
				var m2 = mailWrap(name + " signed " + c.title, ["Signed by " + name + " (" + c.email + ") on " + new Date(now).toUTCString() + ".", "Open MES Galleries to download the signed PDF."], ["View it", link]);
				await ctx.mail.send({ to: brand.email, subject: "Signed: " + c.title + " (" + name + ")", text: m2.text, html: m2.html });
			}
			return ok({ contract: clientContract(c) });
		}
	};
	function clientContract(c) { return { id: c.id, title: c.title, body: c.body, hash: c.hash, status: c.status, email: c.email, client: c.client, created: c.created, sent: c.sent, signed: c.signed || null, log: c.log || [], by: c.by || "" }; }

	var OWNER = {
		list: async function (b, ctx) {
			var ids = await ctx.db.smembers("gal:all"), out = [];
			for (var i = 0; i < ids.length; i++) { var g = await ctx.db.get("gal:g:" + ids[i]); if (g) out.push(g); }
			out.sort(function (a, c) { return (c.created || 0) - (a.created || 0); });
			var cids = await ctx.db.smembers("gal:call"), cons = [];
			for (i = 0; i < cids.length; i++) { var c = await ctx.db.get("gal:c:" + cids[i]); if (c) cons.push(c); }
			cons.sort(function (a, c) { return (c.created || 0) - (a.created || 0); });
			return ok({ galleries: out, contracts: cons, templates: (await ctx.db.get("gal:tpl")) || [G.DEFAULT_TEMPLATE], brand: (await ctx.db.get("gal:brand")) || {} });
		},
		brand: async function (b, ctx) {
			var br = { name: G.text(b.name, 80), email: G.validEmail(b.email) ? G.normEmail(b.email) : "", site: G.text(b.site, 120), color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "" };
			await ctx.db.set("gal:brand", br); return ok({ brand: br });
		},
		save: async function (b, ctx, now) {
			var g = b.gallery || {}, old = G.ID_RE.test(g.id || "") ? await ctx.db.get("gal:g:" + g.id) : null;
			var id = old ? old.id : idOf(ctx);
			if (!old && !/^[A-Za-z0-9+/=]{43,44}$/.test(g.key || "")) return err(400, "missing key");
			var emails = (Array.isArray(g.emails) ? g.emails : []).map(G.normEmail).filter(G.validEmail);
			emails = emails.filter(function (e, i) { return emails.indexOf(e) === i; }).slice(0, 200);
			var items = (Array.isArray(g.items) ? g.items : (old && old.items) || []).filter(function (it) { return it && G.ITEM_RE.test(it.id) && (it.kind === "img" || it.kind === "vid"); }).slice(0, G.MAX_ITEMS).map(function (it) {
				return { id: it.id, kind: it.kind, name: G.text(it.name, 160), w: +it.w || 0, h: +it.h || 0, type: G.text(it.type, 60), size: +it.size || 0, wsize: +it.wsize || 0, tsize: +it.tsize || 0, chunks: Math.min(2000, +it.chunks || 1), dur: +it.dur || 0, at: +it.at || now };
			});
			var rec = {
				id: id, title: G.text(g.title, 120) || "Untitled gallery", date: G.text(g.date, 20), active: !!g.active,
				expires: +g.expires || 0, emails: emails, dl: G.DL.indexOf(g.dl) >= 0 ? g.dl : "web", wm: !!g.wm, wmText: G.text(g.wmText, 60),
				key: old ? old.key : g.key, items: items, cover: G.ITEM_RE.test(g.cover || "") ? g.cover : "", notes: G.text(g.notes, 2000, true),
				by: G.text(g.by, 80), created: old ? old.created : now, updated: now
			};
			// removed items: delete their files
			if (old) for (var i = 0; i < (old.items || []).length; i++) {
				var it = old.items[i]; if (items.some(function (x) { return x.id === it.id; })) continue;
				var p = G.paths(id, it); await ctx.blob.del(p.thumb); await ctx.blob.del(p.web); for (var j = 0; j < p.full.length; j++) await ctx.blob.del(p.full[j]);
			}
			await ctx.db.set("gal:g:" + id, rec); await ctx.db.sadd("gal:all", id);
			return ok({ gallery: rec });
		},
		del: async function (b, ctx) {
			var g = await getGal(ctx, b.gid); if (!g) return err(404, "not found");
			for (var i = 0; i < (g.items || []).length; i++) { var p = G.paths(g.id, g.items[i]); await ctx.blob.del(p.thumb); await ctx.blob.del(p.web); for (var j = 0; j < p.full.length; j++) await ctx.blob.del(p.full[j]); }
			await ctx.db.del("gal:g:" + g.id); await ctx.db.srem("gal:all", g.id); await ctx.db.del("gal:vl:" + g.id); await ctx.db.del("gal:fl:" + g.id);
			return ok();
		},
		/** presigned PUT addresses for one item's pieces */
		upload: async function (b, ctx) {
			var g = await getGal(ctx, b.gid); if (!g) return err(404, "Save the gallery first.");
			var it = b.item || {};
			if (!G.ITEM_RE.test(it.id || "") || (it.kind !== "img" && it.kind !== "vid")) return err(400, "bad item");
			if (!(it.size > 0 && it.size <= G.MAX_FILE)) return err(400, "File too big (8 GB at most).");
			it.chunks = it.kind === "vid" ? G.chunkCount(it.size) : 1;
			var p = G.paths(g.id, it), out = { thumb: await ctx.blob.putUrl(p.thumb), web: await ctx.blob.putUrl(p.web), full: [] };
			for (var i = 0; i < p.full.length; i++) out.full.push(await ctx.blob.putUrl(p.full[i]));
			return ok({ urls: out, chunks: it.chunks });
		},
		/** the owner's own read addresses (previews in her list) */
		ourls: async function (b, ctx) {
			var g = await getGal(ctx, b.gid); if (!g) return err(404, "not found");
			var out = {}, ids = Array.isArray(b.ids) ? b.ids.slice(0, 200) : [];
			for (var i = 0; i < ids.length; i++) {
				var it = (g.items || []).find(function (x) { return x.id === ids[i]; }); if (!it) continue;
				var p = G.paths(g.id, it), w = b.want === "full" ? p.full : b.want === "web" ? [p.web] : [p.thumb], u = [];
				for (var j = 0; j < w.length; j++) u.push(await ctx.blob.getUrl(w[j]));
				out[it.id] = u;
			}
			return ok({ urls: out });
		},
		stats: async function (b, ctx) {
			var g = await getGal(ctx, b.gid); if (!g) return err(404, "not found");
			var favs = {}, fl = (await ctx.db.get("gal:fl:" + g.id)) || {};
			for (var e in fl) favs[e] = (await ctx.db.get("gal:fav:" + g.id + ":" + ctx.sha(e).slice(0, 24))) || [];
			return ok({ views: (await ctx.db.get("gal:vl:" + g.id)) || {}, favs: favs });
		},
		/** send the gallery link to every client email (or one) */
		invite: async function (b, ctx) {
			var g = await getGal(ctx, b.gid); if (!g) return err(404, "not found");
			var to = b.email ? [G.normEmail(b.email)].filter(function (e) { return g.emails.indexOf(e) >= 0; }) : g.emails;
			if (!to.length) return err(400, "Add a client email first.");
			var brand = (await ctx.db.get("gal:brand")) || {}, link = ctx.base + "/galleries?g=" + g.id, sent = 0;
			var note = G.text(b.message, 1000, true);
			for (var i = 0; i < to.length; i++) {
				var m = mailWrap(g.title, [(brand.name || "Your photographer") + " shared a private gallery with you.", note, "Open the link and type this email address (" + to[i] + "); we will email you a code to get in."].filter(Boolean), ["Open the gallery", link]);
				var r = await ctx.mail.send({ to: to[i], subject: (brand.name ? brand.name + ": " : "") + g.title, text: m.text, html: m.html }); if (r && r.ok !== false) sent++;
			}
			return ok({ sent: sent, link: link });
		},
		templates: async function (b, ctx) {
			var t = (Array.isArray(b.templates) ? b.templates : []).slice(0, 30).map(function (x) { return { id: /^[a-z0-9-]{1,40}$/.test(x.id || "") ? x.id : idOf(ctx), name: G.text(x.name, 100) || "Template", body: G.text(x.body, 30000, true) }; });
			await ctx.db.set("gal:tpl", t); return ok({ templates: t });
		},
		/** make a contract from a template + values and email the client a link */
		csend: async function (b, ctx, now) {
			var email = G.normEmail(b.email), body = G.text(b.body, 30000, true), title = G.text(b.title, 120) || "Agreement";
			if (!G.validEmail(email)) return err(400, "Type the client's email.");
			if (body.length < 20) return err(400, "The contract text is empty.");
			if (/\{\{/.test(body)) return err(400, "Fill in every field first ({{...}} left).");
			var id = idOf(ctx), t = ctx.rand(16);
			var c = { id: id, title: title, body: body, hash: G.textHash(ctx.sha, title, body), email: email, client: G.text(b.client, 120), status: "sent", t: ctx.sha("ct|" + t), created: now, sent: now, by: G.text(b.by, 80), log: [{ at: now, ev: "sent", by: "owner" }] };
			await ctx.db.set("gal:c:" + id, c); await ctx.db.sadd("gal:call", id);
			var brand = (await ctx.db.get("gal:brand")) || {}, link = ctx.base + "/galleries?c=" + id + "&t=" + t;
			var m = mailWrap((brand.name || "Your photographer") + " sent you an agreement to sign", [title, G.text(b.message, 1000, true), "Read it, type your name, draw your signature and tick to agree. It takes about a minute."].filter(Boolean), ["Read and sign", link]);
			var r = await ctx.mail.send({ to: email, subject: "Please sign: " + title, text: m.text, html: m.html });
			return ok({ contract: c, link: link, mock: r && r.mock ? true : undefined });
		},
		cdel: async function (b, ctx) { await ctx.db.del("gal:c:" + b.cid); await ctx.db.srem("gal:call", b.cid); return ok(); }
	};
	function idOf(ctx) { var abc = "abcdefghijkmnpqrstuvwxyz23456789", h = ctx.rand(10), s = ""; for (var i = 0; i < 10; i++) s += abc[parseInt(h.substr(i * 2, 2), 16) % abc.length]; return s; }
	G.OWNER_OPS = Object.keys(OWNER); G.PUBLIC_OPS = Object.keys(PUBLIC);

	/* ---- browser-side crypto (Web Crypto; also works in node 20) ---- */
	var subtle = function () { return (typeof crypto !== "undefined" && crypto.subtle) || (root.crypto && root.crypto.subtle); };
	G.b64 = function (u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return typeof btoa !== "undefined" ? btoa(s) : Buffer.from(u8).toString("base64"); };
	G.unb64 = function (s) { if (typeof atob === "undefined") return new Uint8Array(Buffer.from(s, "base64")); var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
	G.newKey = async function () { var k = new Uint8Array(32); crypto.getRandomValues(k); return G.b64(k); };
	G.importKey = function (b64) { return subtle().importKey("raw", G.unb64(b64), "AES-GCM", false, ["encrypt", "decrypt"]); };
	G.encrypt = async function (key, bytes) { var iv = new Uint8Array(12); crypto.getRandomValues(iv); var ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv }, key, bytes)); var out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; };
	G.decrypt = async function (key, bytes) { bytes = new Uint8Array(bytes); return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12))); };

	if (typeof module !== "undefined" && module.exports) module.exports = G;
	root.MESGal = G;
})(typeof self !== "undefined" ? self : this);

/* MES Galleries page. #gl[data-mode] = "client" (mes.fm/galleries: ?g=<gallery> or ?c=<contract>&t=<token>) or "studio" (owner, behind the login).
 * On localhost / 127.0.0.1 or ?mock=1 the page runs MESGal.handle itself on an in-browser stand-in (localStorage + IndexedDB, emails shown on screen). */
(function () {
	"use strict";
	var G = window.MESGal, root = document.getElementById("gl"); if (!root || !G) return;
	var MODE = root.getAttribute("data-mode") || "client";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var Q = new URLSearchParams(location.search);
	var $ = function (s, el) { return (el || root).querySelector(s); };
	var esc = G.esc;
	function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
	function toast(t) { var el = $("#gl-toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3800); }

	/* ---------- test mode stand-in ---------- */
	var idbP = null;
	function idb() { return idbP || (idbP = new Promise(function (ok, no) { var r = indexedDB.open("mes-galleries-mock", 1); r.onupgradeneeded = function () { r.result.createObjectStore("b"); }; r.onsuccess = function () { ok(r.result); }; r.onerror = no; })); }
	function idbDo(mode, fn) { return idb().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction("b", mode), q = fn(t.objectStore("b")); t.oncomplete = function () { ok(q && q.result); }; t.onerror = no; }); }); }
	function mockSha(s) { // small sync hash for the stand-in only (not security)
		var h1 = 0x811c9dc5, h2 = 0x1234567, out = ""; s = String(s);
		for (var r = 0; r < 4; r++) { for (var i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 + s.charCodeAt(i) + r, 2246822519) ^ (h2 >>> 13); } out += ("00000000" + (h1 >>> 0).toString(16)).slice(-8) + ("00000000" + (h2 >>> 0).toString(16)).slice(-8); }
		return out;
	}
	var mockCtx = {
		db: {
			_r: function () { try { return JSON.parse(localStorage.getItem("mes-galleries:mock") || "{}"); } catch (e) { return {}; } },
			_w: function (o) { localStorage.setItem("mes-galleries:mock", JSON.stringify(o)); },
			get: async function (k) { var o = this._r(), v = o[k]; if (!v) return null; if (v.e && v.e < Date.now()) return null; return v.v; },
			set: async function (k, v, ttl) { var o = this._r(); o[k] = { v: v, e: ttl ? Date.now() + ttl * 1000 : 0 }; this._w(o); },
			del: async function (k) { var o = this._r(); delete o[k]; this._w(o); },
			incr: async function (k, ttl) { var n = ((await this.get(k)) || 0) + 1; await this.set(k, n, ttl); return n; },
			sadd: async function (k, m) { var s = (await this.get(k)) || []; if (s.indexOf(m) < 0) s.push(m); await this.set(k, s); },
			srem: async function (k, m) { var s = ((await this.get(k)) || []).filter(function (x) { return x !== m; }); await this.set(k, s); },
			smembers: async function (k) { return (await this.get(k)) || []; }
		},
		blob: { putUrl: async function (p) { return "idb:" + p; }, getUrl: async function (p) { return "idb:" + p; }, del: async function (p) { await idbDo("readwrite", function (s) { return s.delete(p); }); } },
		mail: { send: async function (m) { var box = JSON.parse(localStorage.getItem("mes-galleries:outbox") || "[]"); box.unshift({ at: Date.now(), to: m.to, subject: m.subject, text: m.text }); localStorage.setItem("mes-galleries:outbox", JSON.stringify(box.slice(0, 30))); showOutbox(); return { ok: true, mock: true }; } },
		sha: mockSha, ip: "127.0.0.1", now: function () { return Date.now(); },
		rand: function (n) { var u = new Uint8Array(n); crypto.getRandomValues(u); return Array.prototype.map.call(u, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
	};
	function api(body, owner) {
		if (MOCK) { var c = Object.assign({}, mockCtx, { owner: !!owner, base: location.origin + location.pathname.replace(/\/galleries-studio.*|\/galleries.*/, "") }); return G.handle(body, c); }
		return fetch(owner ? "/api/galleries-admin" : "/api/galleries", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
			.then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server error (" + r.status + ")" }; }); });
	}
	function putBytes(url, bytes) {
		if (url.indexOf("idb:") === 0) return idbDo("readwrite", function (s) { return s.put(bytes, url.slice(4)); });
		return fetch(url, { method: "PUT", body: bytes }).then(function (r) { if (!r.ok) throw new Error("Upload failed (" + r.status + "). Check the R2 CORS rule."); });
	}
	function getBytes(url) {
		if (url.indexOf("idb:") === 0) return idbDo("readonly", function (s) { return s.get(url.slice(4)); }).then(function (v) { if (!v) throw new Error("missing"); return new Uint8Array(v); });
		return fetch(url).then(function (r) { if (!r.ok) throw new Error("Download failed (" + r.status + ")"); return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); });
	}
	function showOutbox() {
		if (!MOCK) return; var el = $("#gl-outbox"); if (!el) return; var box = JSON.parse(localStorage.getItem("mes-galleries:outbox") || "[]");
		el.hidden = !box.length;
		el.innerHTML = "<strong>Test mode: emails that would have been sent</strong>" + box.slice(0, 6).map(function (m) { return '<div class="gl-mail"><b>To ' + esc(m.to) + ":</b> " + esc(m.subject) + "<pre>" + esc(m.text) + "</pre></div>"; }).join("");
	}

	/* ---------- shared helpers ---------- */
	var keyCache = {};
	function keyFor(b64) { return keyCache[b64] || (keyCache[b64] = G.importKey(b64)); }
	async function decryptUrls(keyB64, urls, onProg) {
		var key = await keyFor(keyB64), parts = [];
		for (var i = 0; i < urls.length; i++) { parts.push(await G.decrypt(key, await getBytes(urls[i]))); if (onProg) onProg((i + 1) / urls.length); }
		return parts;
	}
	function blobUrl(parts, type) { return URL.createObjectURL(new Blob(parts, { type: type || "application/octet-stream" })); }
	function download(name, url) { var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
	function fmtDate(ms) { return ms ? new Date(ms).toLocaleString() : ""; }

	/* ---------- contract view (client signs; also the signed copy) ---------- */
	function sigPad(cv) {
		var ctx = cv.getContext("2d"), drawing = false, used = false, last = null;
		function fit() { var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); ctx.scale(d, d); ctx.lineWidth = 2.4; ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = "#111"; }
		fit();
		function pt(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
		cv.addEventListener("pointerdown", function (e) { drawing = true; used = true; last = pt(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last[0], last[1], 1.1, 0, 7); ctx.fillStyle = "#111"; ctx.fill(); });
		cv.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; });
		["pointerup", "pointercancel"].forEach(function (t) { cv.addEventListener(t, function () { drawing = false; }); });
		return { clear: function () { ctx.clearRect(0, 0, cv.width, cv.height); used = false; }, used: function () { return used; }, png: function () { return cv.toDataURL("image/png"); } };
	}
	var pdfLibP = null;
	function pdfLib() { return pdfLibP || (pdfLibP = new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"; s.onload = function () { ok(window.PDFLib); }; s.onerror = function () { no(new Error("Could not load the PDF maker.")); }; document.head.appendChild(s); })); }
	async function contractPdf(c, brand) {
		var P = await pdfLib(), doc = await P.PDFDocument.create(), font = await doc.embedFont(P.StandardFonts.Helvetica), bold = await doc.embedFont(P.StandardFonts.HelveticaBold);
		doc.setTitle(c.title); doc.setAuthor(brand.name || ""); doc.setSubject("Signed agreement"); doc.setProducer("MES Galleries (mes.fm/galleries)");
		var W = 612, H = 792, M = 56, page = doc.addPage([W, H]), y = H - M;
		function clean(s) { return String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x09\x0a\x20-\x7e\xa0-\xff]/g, "?"); }
		function line(t, f, size, gap) {
			f = f || font; size = size || 10.5; var words = clean(t).split(" "), cur = "";
			function flush() { if (y < M + size) { page = doc.addPage([W, H]); y = H - M; } page.drawText(cur, { x: M, y: y, size: size, font: f }); y -= size * 1.45; cur = ""; }
			for (var i = 0; i < words.length; i++) { var nx = cur ? cur + " " + words[i] : words[i]; if (f.widthOfTextAtSize(nx, size) > W - 2 * M && cur) { flush(); cur = words[i]; } else cur = nx; }
			flush(); y -= gap || 0;
		}
		line(c.title, bold, 16, 8);
		String(c.body).split("\n").forEach(function (p) { if (!p.trim()) { y -= 6; return; } line(p); });
		if (c.signed) {
			y -= 14; line("Signed by the client", bold, 12, 4);
			var png = await doc.embedPng(c.signed.sig), sw = 220, sh = sw * png.height / png.width;
			if (y - sh < M + 140) { page = doc.addPage([W, H]); y = H - M; }
			page.drawImage(png, { x: M, y: y - sh, width: sw, height: sh }); y -= sh + 8;
			line("Name typed: " + c.signed.name);
			y -= 10; line("Audit trail", bold, 12, 4);
			line("Document ID: " + c.id + "   Text fingerprint (SHA-256): " + c.hash, font, 8.5);
			(c.log || []).forEach(function (l) { line(new Date(l.at).toISOString() + "  " + l.ev + (l.by ? "  (" + l.by + ")" : ""), font, 9); });
			line("Signed " + new Date(c.signed.at).toISOString() + " UTC by " + c.signed.email + " (email address confirmed by the emailed link). Network ID (hashed IP): " + c.signed.ip + ". Browser: " + c.signed.ua + (c.signed.tz ? ". Time zone: " + c.signed.tz : "") + ". The client ticked \"I agree\" and drew the signature above.", font, 9);
		}
		return doc.save();
	}
	function contractHtml(c) { return '<div class="gl-ctext">' + esc(c.body).replace(/\n/g, "<br>") + "</div>"; }
	async function clientContract() {
		var box = $("#gl-main"); box.innerHTML = '<p class="tu-note">Loading the agreement…</p>';
		var r = await api({ op: "contract", cid: Q.get("c"), t: Q.get("t") });
		if (!r.ok) { box.innerHTML = '<div class="tu-card"><p>' + esc(r.error) + "</p></div>"; return; }
		var c = r.contract, brand = r.brand || {};
		function render() {
			box.innerHTML = "";
			var card = h('<section class="tu-card gl-contract"><p class="gl-from">' + esc(brand.name || "") + '</p><h2>' + esc(c.title) + "</h2>" + contractHtml(c) + "</section>");
			box.appendChild(card);
			if (c.status === "signed") {
				card.appendChild(h('<div class="gl-signed"><p><strong>✓ Signed</strong> by ' + esc(c.signed.name) + " on " + esc(fmtDate(c.signed.at)) + '.</p><img class="gl-sigimg" alt="Signature" src="' + c.signed.sig + '"><p><button type="button" class="tu-btn tu-btn--primary" id="gl-pdf">⬇ Download the signed PDF</button></p></div>'));
				$("#gl-pdf").onclick = async function () { try { var b = await contractPdf(c, brand); download(c.title.replace(/[^\w -]+/g, "") + " (signed).pdf", blobUrl([b], "application/pdf")); } catch (e) { toast(e.message); } };
				return;
			}
			var f = h('<form class="gl-sign"><h3>Sign</h3><label class="tu-label">Your full name<input class="tu-input" id="gl-sname" autocomplete="name" required maxlength="120"></label>' +
				'<p class="tu-label">Draw your signature (finger, pen or mouse)</p><canvas class="gl-pad" id="gl-pad" aria-label="Signature box"></canvas><p><button type="button" class="tu-btn tu-btn--ghost" id="gl-pclear">Clear</button></p>' +
				'<label class="gl-agree"><input type="checkbox" id="gl-agree"> I have read this agreement and I agree to it. I agree to sign electronically, and my electronic signature counts as my handwritten signature.</label>' +
				'<p><button type="submit" class="tu-btn tu-btn--primary">Sign the agreement</button></p><p class="tu-note">Signing for: ' + esc(c.email) + '. We record the time, this email address, your browser and a scrambled form of your network address as proof. Both of you get the signed copy by email.</p></form>');
			card.appendChild(f);
			var pad = sigPad($("#gl-pad")); $("#gl-pclear").onclick = pad.clear;
			f.onsubmit = async function (e) {
				e.preventDefault();
				if (!pad.used()) return toast("Draw your signature in the box.");
				if (!$("#gl-agree").checked) return toast("Tick the box to agree.");
				var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (x) { }
				var res = await api({ op: "sign", cid: c.id, t: Q.get("t"), name: $("#gl-sname").value, sig: pad.png(), agree: true, hash: c.hash, ua: navigator.userAgent.slice(0, 200), tz: tz });
				if (!res.ok) return toast(res.error);
				c = res.contract; render(); toast("Signed. A copy is on its way to your email.");
			};
		}
		render();
	}

	/* ---------- client gallery ---------- */
	var CL = { tok: null, d: null, favs: [], only: false };
	function tokKey() { return "mes-galleries:tok:" + Q.get("g"); }
	async function clientGallery() {
		var box = $("#gl-main"), gid = Q.get("g");
		if (!gid) { box.innerHTML = '<div class="tu-card"><p>Open the gallery with the link your photographer sent you.</p></div>'; return; }
		try { CL.tok = localStorage.getItem(tokKey()); } catch (e) { }
		if (CL.tok) { var r = await api({ op: "open", token: CL.tok }); if (r.ok) return showGallery(r); try { localStorage.removeItem(tokKey()); } catch (e) { } }
		var info = await api({ op: "info", gid: gid });
		if (!info.ok) { box.innerHTML = '<div class="tu-card"><p>' + esc(info.error) + "</p></div>"; return; }
		var g = info.gallery, brand = info.brand || {};
		box.innerHTML = "";
		var card = h('<section class="tu-card gl-gate"><p class="gl-from">' + esc(brand.name || "") + "</p><h2>" + esc(g.title) + "</h2>" + (g.date ? '<p class="tu-note">' + esc(g.date) + "</p>" : "") + "</section>");
		box.appendChild(card);
		if (!info.open) { card.appendChild(h('<p>This gallery is not open right now. Please contact your photographer.</p>')); return; }
		var f = h('<form class="gl-gform"><label class="tu-label">Your email address<input class="tu-input" type="email" id="gl-em" autocomplete="email" required></label><p><button class="tu-btn tu-btn--primary" type="submit">Email me a code</button></p><p class="tu-note">Only the email addresses your photographer added can open this gallery.</p></form>');
		card.appendChild(f);
		f.onsubmit = async function (e) {
			e.preventDefault(); var em = $("#gl-em").value, r = await api({ op: "code", gid: gid, email: em });
			if (!r.ok) return toast(r.error);
			f.innerHTML = '<p>If <strong>' + esc(em) + '</strong> is on this gallery\'s list, a 6-digit code is on its way. Check spam too.</p><label class="tu-label">Code<input class="tu-input gl-code" id="gl-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label><p><button class="tu-btn tu-btn--primary" type="submit">Open the gallery</button> <button class="tu-btn tu-btn--ghost" type="button" id="gl-back">Use another email</button></p>';
			if (r.mock) $("#gl-code").value = r.mock;
			$("#gl-back").onclick = clientGallery;
			f.onsubmit = async function (e2) {
				e2.preventDefault(); var v = await api({ op: "verify", gid: gid, email: em, code: $("#gl-code").value });
				if (!v.ok) return toast(v.error);
				CL.tok = v.token; try { localStorage.setItem(tokKey(), v.token); } catch (x) { }
				var o = await api({ op: "open", token: v.token }); if (!o.ok) return toast(o.error); showGallery(o);
			};
		};
	}
	function wmDraw(img, text) {
		var cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight; var c = cv.getContext("2d"); c.drawImage(img, 0, 0);
		var s = Math.max(18, cv.width / 22); c.font = "600 " + s + "px sans-serif"; c.fillStyle = "rgba(255,255,255,0.38)"; c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = s / 18;
		c.save(); c.translate(cv.width / 2, cv.height / 2); c.rotate(-0.42);
		for (var y = -cv.height; y < cv.height; y += s * 4) for (var x = -cv.width; x < cv.width; x += c.measureText(text).width + s * 2) { c.strokeText(text, x, y); c.fillText(text, x, y); }
		c.restore(); return cv.toDataURL("image/jpeg", 0.88);
	}
	function showGallery(d) {
		CL.d = d; CL.favs = d.favs || [];
		var box = $("#gl-main"), g = d.gallery, brand = d.brand || {};
		box.innerHTML = "";
		box.appendChild(h('<section class="gl-head"><p class="gl-from">' + esc(brand.name || "") + "</p><h2>" + esc(g.title) + '</h2><div class="gl-bar"><span class="tu-note">' + d.items.length + " items · signed in as " + esc(d.email) +
			'</span><span class="gl-chips"><button type="button" class="tu-btn tu-btn--ghost" id="gl-all">All</button><button type="button" class="tu-btn tu-btn--ghost" id="gl-only">♥ Favourites (<span id="gl-fn">' + CL.favs.length + '</span>)</button>' +
			(d.dl !== "none" ? '<button type="button" class="tu-btn" id="gl-dlall">⬇ Download ' + (d.dl === "full" ? "all (full size)" : "all (web size)") + "</button>" : "") + '<button type="button" class="tu-btn tu-btn--ghost" id="gl-out">Sign out</button></span></div></section>'));
		var grid = h('<div class="gl-grid" id="gl-grid"></div>'); box.appendChild(grid);
		d.items.forEach(function (it, i) {
			var t = h('<figure class="gl-tile" data-id="' + it.id + '"><button type="button" class="gl-open" aria-label="Open ' + esc(it.name) + '"><img alt="" loading="lazy"></button>' + (it.kind === "vid" ? '<span class="gl-vbadge">▶ Video</span>' : "") + '<button type="button" class="gl-fav" aria-label="Favourite">♥</button></figure>');
			t.querySelector(".gl-fav").classList.toggle("on", CL.favs.indexOf(it.id) >= 0);
			t.querySelector(".gl-fav").onclick = function () { toggleFav(it.id, this); };
			t.querySelector(".gl-open").onclick = function () { viewer(i); };
			grid.appendChild(t);
			decryptUrls(d.key, [it.thumb]).then(function (p) { t.querySelector("img").src = blobUrl(p, "image/jpeg"); }).catch(function () { t.classList.add("gl-bad"); });
		});
		$("#gl-only").onclick = function () { CL.only = true; filt(); }; $("#gl-all").onclick = function () { CL.only = false; filt(); };
		$("#gl-out").onclick = function () { try { localStorage.removeItem(tokKey()); } catch (e) { } location.reload(); };
		if ($("#gl-dlall")) $("#gl-dlall").onclick = dlAll;
	}
	function filt() { root.querySelectorAll(".gl-tile").forEach(function (t) { t.hidden = CL.only && CL.favs.indexOf(t.getAttribute("data-id")) < 0; }); }
	var favT = null;
	function toggleFav(id, btn) {
		var i = CL.favs.indexOf(id); if (i >= 0) CL.favs.splice(i, 1); else CL.favs.push(id);
		root.querySelectorAll('.gl-tile[data-id="' + id + '"] .gl-fav, .gl-vfav[data-id="' + id + '"]').forEach(function (b) { b.classList.toggle("on", i < 0); });
		$("#gl-fn").textContent = CL.favs.length;
		clearTimeout(favT); favT = setTimeout(function () { api({ op: "fav", token: CL.tok, favs: CL.favs }); }, 600);
	}
	async function itemUrl(it, want, prog) {
		var r = await api({ op: "urls", token: CL.tok, ids: [it.id], want: want }); if (!r.ok) throw new Error(r.error);
		var parts = await decryptUrls(CL.d.key, r.urls[it.id], prog);
		return blobUrl(parts, it.kind === "vid" ? it.type : (want === "full" ? it.type : "image/jpeg"));
	}
	async function dlAll() {
		var d = CL.d, list = d.items.filter(function (it) { return !CL.only || CL.favs.indexOf(it.id) >= 0; });
		if (!confirm("Download " + list.length + " files? Your browser may ask once to allow several downloads.")) return;
		for (var i = 0; i < list.length; i++) { toast("Downloading " + (i + 1) + " of " + list.length + "…"); var it = list[i]; download(it.kind === "img" && d.dl !== "full" ? it.name.replace(/\.[^.]+$/, "") + " (web).jpg" : it.name, await itemUrl(it, d.dl)); }
	}
	function viewer(i) {
		var d = CL.d, it = d.items[i], ov = $("#gl-view"); ov.hidden = false; document.body.classList.add("gl-viewing");
		ov.innerHTML = '<div class="gl-vbar"><span>' + (i + 1) + " / " + d.items.length + " · " + esc(it.name) + '</span><span><button type="button" class="gl-vbtn gl-vfav" data-id="' + it.id + '">♥</button>' + (d.dl !== "none" ? '<button type="button" class="gl-vbtn" id="gl-vdl">⬇</button>' : "") + '<button type="button" class="gl-vbtn" id="gl-vx" aria-label="Close">✕</button></span></div><div class="gl-vbody"><p class="gl-vload">Loading…</p></div><button class="gl-vnav gl-vprev" aria-label="Previous">‹</button><button class="gl-vnav gl-vnext" aria-label="Next">›</button>';
		ov.querySelector(".gl-vfav").classList.toggle("on", CL.favs.indexOf(it.id) >= 0);
		ov.querySelector(".gl-vfav").onclick = function () { toggleFav(it.id); };
		function close() { ov.hidden = true; ov.innerHTML = ""; document.body.classList.remove("gl-viewing"); document.removeEventListener("keydown", key); }
		function key(e) { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); }
		function go(s) { document.removeEventListener("keydown", key); viewer((i + s + d.items.length) % d.items.length); }
		document.addEventListener("keydown", key);
		$("#gl-vx").onclick = close; ov.querySelector(".gl-vprev").onclick = function () { go(-1); }; ov.querySelector(".gl-vnext").onclick = function () { go(1); };
		var body = ov.querySelector(".gl-vbody"), load = ov.querySelector(".gl-vload");
		itemUrl(it, it.kind === "vid" ? "full" : "web", function (f) { load.textContent = "Loading… " + Math.round(f * 100) + "%"; }).then(function (u) {
			if (ov.hidden) return;
			if (it.kind === "vid") { body.innerHTML = '<video controls autoplay playsinline src="' + u + '"></video>'; }
			else {
				var img = new Image(); img.onload = function () { if (d.wm && d.wmText) img.src = wmDraw(img, d.wmText), img.onload = null; body.innerHTML = ""; body.appendChild(img); }; img.src = u;
				img.oncontextmenu = function (e) { if (d.dl === "none") e.preventDefault(); };
			}
			if ($("#gl-vdl")) $("#gl-vdl").onclick = async function () { download(it.kind === "img" && d.dl !== "full" ? it.name.replace(/\.[^.]+$/, "") + " (web).jpg" : it.name, d.dl === "full" || it.kind === "vid" ? await itemUrl(it, "full") : u); };
		}).catch(function (e) { load.textContent = "Could not load this one: " + e.message; });
	}

	/* ---------- owner studio ---------- */
	var ST = { d: null, cur: null };
	async function studio() {
		var box = $("#gl-main"); box.innerHTML = '<p class="tu-note">Loading…</p>';
		if (!MOCK) { var s = await fetch("/api/galleries-admin").then(function (r) { return r.json(); }).catch(function () { return {}; }); if (s && s.setup === false) $("#gl-setup").hidden = false, $("#gl-miss").textContent = (s.missing || []).join(", "); }
		var r = await api({ op: "list" }, true);
		if (!r.ok) { box.innerHTML = '<div class="tu-card"><p>' + esc(r.error || "Could not load.") + "</p></div>"; return; }
		ST.d = r; renderStudio();
	}
	function renderStudio() {
		var box = $("#gl-main"), d = ST.d; box.innerHTML = "";
		var tabs = h('<div class="gl-tabs" role="tablist"><button type="button" data-t="g" class="on">Galleries (' + d.galleries.length + ')</button><button type="button" data-t="c">Contracts (' + d.contracts.length + ')</button><button type="button" data-t="s">Settings</button></div>');
		box.appendChild(tabs); var pane = h('<div id="gl-pane"></div>'); box.appendChild(pane);
		tabs.onclick = function (e) { var b = e.target.closest("button"); if (!b) return; tabs.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); ({ g: galList, c: conList, s: settings })[b.getAttribute("data-t")](pane); };
		galList(pane);
	}
	function galList(pane) {
		var d = ST.d; pane.innerHTML = "";
		pane.appendChild(h('<p><button type="button" class="tu-btn tu-btn--primary" id="gl-new">＋ New gallery</button></p>'));
		$("#gl-new").onclick = async function () { var k = await G.newKey(); editGallery({ title: "", date: new Date().toISOString().slice(0, 10), active: true, emails: [], dl: "web", wm: false, wmText: (d.brand && d.brand.name) || "", items: [], key: k, by: (d.brand && d.brand.name) || "" }); };
		if (!d.galleries.length) pane.appendChild(h('<p class="tu-note">No galleries yet.</p>'));
		var list = h('<div class="gl-glist"></div>'); pane.appendChild(list);
		d.galleries.forEach(function (g) {
			var row = h('<div class="tu-card gl-grow"><div><strong>' + esc(g.title) + '</strong> <span class="gl-pill ' + (G.isOpen(g, Date.now()) ? "on" : "") + '">' + (g.active ? (G.expired(g, Date.now()) ? "Expired" : "Active") : "Inactive") + '</span><br><span class="tu-note">' + esc(g.date || "") + " · " + g.items.length + " items · " + G.fmtBytes(G.gallerySize(g)) + " · " + g.emails.length + ' clients</span></div><div><button type="button" class="tu-btn" data-a="edit">Open</button> <button type="button" class="tu-btn tu-btn--ghost" data-a="tog">' + (g.active ? "Make inactive" : "Make active") + "</button></div></div>");
			row.onclick = async function (e) { var a = e.target.getAttribute("data-a"); if (a === "edit") editGallery(g); else if (a === "tog") { g.active = !g.active; var r = await api({ op: "save", gallery: g }, true); if (r.ok) { Object.assign(g, r.gallery); galList(pane); } else toast(r.error); } };
			list.appendChild(row);
		});
		var tot = d.galleries.reduce(function (a, g) { return a + G.gallerySize(g); }, 0);
		pane.appendChild(h('<p class="tu-note">Storage used: ' + G.fmtBytes(tot) + " (Cloudflare R2: first 10 GB free, then about US$0.015 per GB a month).</p>"));
	}
	function editGallery(g) {
		var pane = $("#gl-pane"); pane.innerHTML = "";
		var link = location.origin + "/galleries?g=" + (g.id || "");
		var f = h('<section class="tu-card gl-edit"><p><button type="button" class="tu-btn tu-btn--ghost" id="gl-eback">‹ All galleries</button></p>' +
			'<div class="gl-erow"><label class="tu-label">Title<input class="tu-input" id="gl-etitle"></label><label class="tu-label">Date<input class="tu-input" type="date" id="gl-edate"></label></div>' +
			'<div class="gl-erow"><label class="gl-agree"><input type="checkbox" id="gl-eact"> Active (clients can open it)</label><label class="tu-label">Closes on (optional)<input class="tu-input" type="date" id="gl-eexp"></label></div>' +
			'<label class="tu-label">Client emails (one per line or comma)<textarea class="tu-input" id="gl-eem" rows="3"></textarea></label>' +
			'<div class="gl-erow"><label class="tu-label">Clients may download<select class="tu-input" id="gl-edl"><option value="none">Nothing (view only)</option><option value="web">Web size (2048 px)</option><option value="full">Full size originals</option></select></label>' +
			'<label class="gl-agree"><input type="checkbox" id="gl-ewm"> Watermark on view</label><label class="tu-label">Watermark text<input class="tu-input" id="gl-ewmt"></label></div>' +
			'<p><button type="button" class="tu-btn tu-btn--primary" id="gl-esave">Save</button> <button type="button" class="tu-btn" id="gl-einv"' + (g.id ? "" : " disabled") + '>✉ Email the link to the clients</button> <button type="button" class="tu-btn tu-btn--ghost" id="gl-ecopy"' + (g.id ? "" : " disabled") + '>🔗 Copy link</button> <button type="button" class="tu-btn tu-btn--ghost gl-danger" id="gl-edel"' + (g.id ? "" : " hidden") + ">Delete gallery</button></p>" +
			'<div class="gl-drop" id="gl-drop" tabindex="0"><strong>Drop photos and videos here</strong> or <button type="button" class="tu-btn" id="gl-pick">choose files</button><input type="file" id="gl-file" multiple accept="image/*,video/*" hidden><p class="tu-note">Each file is encrypted in this browser before it is uploaded. Previews are made here too.</p></div>' +
			'<div id="gl-up"></div><div class="gl-grid gl-ogrid" id="gl-ogrid"></div><div id="gl-estats"></div></section>');
		pane.appendChild(f);
		$("#gl-etitle").value = g.title || ""; $("#gl-edate").value = g.date || ""; $("#gl-eact").checked = !!g.active; $("#gl-eexp").value = g.expires ? new Date(g.expires).toISOString().slice(0, 10) : "";
		$("#gl-eem").value = (g.emails || []).join("\n"); $("#gl-edl").value = g.dl || "web"; $("#gl-ewm").checked = !!g.wm; $("#gl-ewmt").value = g.wmText || "";
		function read() {
			g.title = $("#gl-etitle").value; g.date = $("#gl-edate").value; g.active = $("#gl-eact").checked;
			var ex = $("#gl-eexp").value; g.expires = ex ? new Date(ex + "T23:59:59").getTime() : 0;
			g.emails = $("#gl-eem").value.split(/[\s,;]+/).filter(Boolean); g.dl = $("#gl-edl").value; g.wm = $("#gl-ewm").checked; g.wmText = $("#gl-ewmt").value;
		}
		async function save(quiet) {
			read(); var bad = g.emails.filter(function (e) { return !G.validEmail(e); }); if (bad.length) toast("Left out (not an email): " + bad.join(", "));
			var r = await api({ op: "save", gallery: g }, true); if (!r.ok) { toast(r.error); return false; }
			var isNew = !g.id; Object.assign(g, r.gallery); if (isNew) ST.d.galleries.unshift(g); if (!quiet) toast("Saved."); if (isNew) editGallery(g); return true;
		}
		$("#gl-eback").onclick = function () { galList(pane); };
		$("#gl-esave").onclick = function () { save(); };
		$("#gl-ecopy").onclick = function () { navigator.clipboard.writeText(location.origin + "/galleries?g=" + g.id).then(function () { toast("Link copied. Clients also need their email to get in."); }); };
		$("#gl-einv").onclick = async function () { if (!(await save(true))) return; var msg = prompt("A short note for the email (optional):", "") ; if (msg === null) return; var r = await api({ op: "invite", gid: g.id, message: msg }, true); toast(r.ok ? "Sent to " + r.sent + " client(s)." : r.error); };
		$("#gl-edel").onclick = async function () { if (!confirm("Delete \"" + g.title + "\" and every photo and video in it? This cannot be undone.")) return; var r = await api({ op: "del", gid: g.id }, true); if (!r.ok) return toast(r.error); ST.d.galleries = ST.d.galleries.filter(function (x) { return x.id !== g.id; }); galList(pane); };
		var drop = $("#gl-drop"), fi = $("#gl-file");
		$("#gl-pick").onclick = function () { fi.click(); };
		fi.onchange = function () { addFiles(g, [].slice.call(fi.files)); fi.value = ""; };
		drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
		drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
		drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(g, [].slice.call(e.dataTransfer.files)); });
		ownerGrid(g);
		if (g.id) api({ op: "stats", gid: g.id }, true).then(function (r) {
			if (!r.ok) return; var rows = Object.keys(r.views).map(function (e) { return "<tr><td>" + esc(e) + "</td><td>" + r.views[e].n + "</td><td>" + esc(fmtDate(r.views[e].last)) + "</td><td>" + ((r.favs[e] || []).length) + "</td></tr>"; });
			$("#gl-estats").innerHTML = "<h3>Who opened it</h3>" + (rows.length ? '<table class="gl-tbl"><tr><th>Client</th><th>Visits</th><th>Last visit</th><th>Favourites</th></tr>' + rows.join("") + "</table>" : '<p class="tu-note">Nobody yet.</p>') +
				(Object.keys(r.favs).length ? '<p><button type="button" class="tu-btn tu-btn--ghost" id="gl-favcopy">Copy favourite file names</button></p>' : "");
			if ($("#gl-favcopy")) $("#gl-favcopy").onclick = function () { var t = Object.keys(r.favs).map(function (e) { return e + ":\n" + r.favs[e].map(function (id) { var it = g.items.find(function (x) { return x.id === id; }); return it ? it.name : id; }).join("\n"); }).join("\n\n"); navigator.clipboard.writeText(t); toast("Copied."); };
		});
	}
	function ownerGrid(g) {
		var grid = $("#gl-ogrid"); if (!grid) return; grid.innerHTML = "";
		if (!g.id || !g.items.length) return;
		g.items.forEach(function (it) {
			var t = h('<figure class="gl-tile"><img alt=""><figcaption>' + esc(it.name) + " · " + G.fmtBytes(it.size) + '</figcaption>' + (it.kind === "vid" ? '<span class="gl-vbadge">▶</span>' : "") + '<button type="button" class="gl-x" title="Remove">✕</button></figure>');
			t.querySelector(".gl-x").onclick = async function () { if (!confirm("Remove " + it.name + "?")) return; g.items = g.items.filter(function (x) { return x !== it; }); var r = await api({ op: "save", gallery: g }, true); if (r.ok) { Object.assign(g, r.gallery); ownerGrid(g); } else toast(r.error); };
			grid.appendChild(t);
		});
		api({ op: "ourls", gid: g.id, ids: g.items.map(function (x) { return x.id; }) }, true).then(function (r) {
			if (!r.ok) return; grid.querySelectorAll("img").forEach(function (img, i) { var u = r.urls[g.items[i].id]; if (u) decryptUrls(g.key, u).then(function (p) { img.src = blobUrl(p, "image/jpeg"); }).catch(function () { }); });
		});
	}
	function newItemId() { var a = "abcdefghijkmnpqrstuvwxyz23456789", u = new Uint8Array(10), s = ""; crypto.getRandomValues(u); for (var i = 0; i < 10; i++) s += a[u[i] % a.length]; return s; }
	function toJpeg(src, w, h, q) { var cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(src, 0, 0, w, h); return new Promise(function (ok) { cv.toBlob(function (b) { b.arrayBuffer().then(function (a) { ok(new Uint8Array(a)); }); }, "image/jpeg", q); }); }
	function videoFrame(file) {
		return new Promise(function (ok, no) {
			var v = document.createElement("video"), u = URL.createObjectURL(file); v.muted = true; v.preload = "auto"; v.src = u; v.playsInline = true;
			v.onloadedmetadata = function () { v.currentTime = Math.min(2, (v.duration || 4) / 3); };
			v.onseeked = function () { ok({ src: v, w: v.videoWidth, h: v.videoHeight, dur: v.duration, done: function () { URL.revokeObjectURL(u); } }); };
			v.onerror = function () { URL.revokeObjectURL(u); no(new Error("This browser can't read that video (try MP4).")); };
		});
	}
	var busy = false, queue = [];
	async function addFiles(g, files) {
		files = files.filter(function (f) { return /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|heic|mp4|mov|m4v|webm)$/i.test(f.name); });
		if (!files.length) return;
		if (!g.id && !(await (async function () { var r = await api({ op: "save", gallery: Object.assign(g, { title: $("#gl-etitle").value || "New gallery" }) }, true); if (!r.ok) { toast(r.error); return false; } Object.assign(g, r.gallery); ST.d.galleries.unshift(g); return true; })())) return;
		queue = queue.concat(files.map(function (f) { return { f: f, g: g }; })); if (busy) return; busy = true;
		var up = $("#gl-up"), key = await keyFor(g.key), done = 0, total = queue.length;
		while (queue.length) {
			var job = queue.shift(), f = job.f; done++;
			if (up) up.innerHTML = '<p class="gl-prog">Uploading ' + done + " of " + total + ": " + esc(f.name) + ' <span id="gl-pp"></span></p>';
			var pp = function (t) { var el = document.getElementById("gl-pp"); if (el) el.textContent = t; };
			try {
				var isVid = /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name), it = { id: newItemId(), kind: isVid ? "vid" : "img", name: f.name, size: f.size, type: f.type || (isVid ? "video/mp4" : "image/jpeg"), at: Date.now() }, src;
				if (isVid) { src = await videoFrame(f); it.dur = Math.round(src.dur || 0); }
				else { var bmp = await createImageBitmap(f, { imageOrientation: "from-image" }); src = { src: bmp, w: bmp.width, h: bmp.height, done: function () { bmp.close(); } }; }
				it.w = src.w; it.h = src.h;
				var ts = G.fitSize(src.w, src.h, G.THUMB), ws = G.fitSize(src.w, src.h, G.WEB);
				var thumb = await G.encrypt(key, await toJpeg(src.src, ts[0], ts[1], 0.8)), web = isVid ? null : await G.encrypt(key, await toJpeg(src.src, ws[0], ws[1], 0.86)); src.done();
				it.tsize = thumb.length; it.wsize = web ? web.length : 0;
				var r = await api({ op: "upload", gid: job.g.id, item: it }, true); if (!r.ok) throw new Error(r.error);
				it.chunks = r.chunks;
				await putBytes(r.urls.thumb, thumb); if (web) await putBytes(r.urls.web, web);
				for (var c = 0; c < r.urls.full.length; c++) {
					var part = new Uint8Array(await f.slice(c * G.CHUNK, (c + 1) * G.CHUNK).arrayBuffer());
					await putBytes(r.urls.full[c], await G.encrypt(key, part)); pp(Math.round((c + 1) / r.urls.full.length * 100) + "%");
				}
				job.g.items.push(it);
				var s = await api({ op: "save", gallery: job.g }, true); if (s.ok) Object.assign(job.g, s.gallery);
				if (ST.cur !== job.g) ownerGrid(job.g);
			} catch (e) { toast(f.name + ": " + e.message); }
		}
		busy = false; if (up) up.innerHTML = '<p class="tu-note">All uploaded.</p>'; ownerGrid(g);
	}
	function conList(pane) {
		var d = ST.d; pane.innerHTML = "";
		pane.appendChild(h('<p><button type="button" class="tu-btn tu-btn--primary" id="gl-cnew">＋ Send a contract</button> <button type="button" class="tu-btn tu-btn--ghost" id="gl-ctpl">Edit templates</button></p>'));
		$("#gl-cnew").onclick = function () { newContract(pane); }; $("#gl-ctpl").onclick = function () { editTemplates(pane); };
		if (!d.contracts.length) pane.appendChild(h('<p class="tu-note">No contracts yet.</p>'));
		d.contracts.forEach(function (c) {
			var row = h('<div class="tu-card gl-grow"><div><strong>' + esc(c.title) + '</strong> <span class="gl-pill ' + (c.status === "signed" ? "on" : "") + '">' + (c.status === "signed" ? "Signed" : "Waiting") + '</span><br><span class="tu-note">' + esc(c.client || "") + " " + esc(c.email) + " · sent " + esc(fmtDate(c.sent)) + (c.signed ? " · signed " + esc(fmtDate(c.signed.at)) : "") + '</span></div><div>' + (c.status === "signed" ? '<button type="button" class="tu-btn" data-a="pdf">⬇ PDF</button> ' : "") + '<button type="button" class="tu-btn tu-btn--ghost gl-danger" data-a="del">Delete</button></div></div>');
			row.onclick = async function (e) {
				var a = e.target.getAttribute("data-a");
				if (a === "pdf") { try { var b = await contractPdf(c, d.brand || {}); download(c.title.replace(/[^\w -]+/g, "") + " - " + (c.signed.name || "") + ".pdf", blobUrl([b], "application/pdf")); } catch (x) { toast(x.message); } }
				if (a === "del" && confirm("Delete this contract record? Download the PDF first if it is signed.")) { await api({ op: "cdel", cid: c.id }, true); d.contracts = d.contracts.filter(function (x) { return x !== c; }); conList(pane); }
			};
			pane.appendChild(row);
		});
	}
	function newContract(pane) {
		var d = ST.d, tpls = d.templates; pane.innerHTML = "";
		var f = h('<section class="tu-card"><p><button type="button" class="tu-btn tu-btn--ghost" id="gl-cback">‹ Contracts</button></p><label class="tu-label">Template<select class="tu-input" id="gl-ctsel">' + tpls.map(function (t, i) { return '<option value="' + i + '">' + esc(t.name) + "</option>"; }).join("") + '</select></label>' +
			'<div class="gl-erow"><label class="tu-label">Client name<input class="tu-input" id="gl-ccli"></label><label class="tu-label">Client email<input class="tu-input" type="email" id="gl-cem"></label></div><label class="tu-label">Title<input class="tu-input" id="gl-ctitle"></label><div id="gl-cflds" class="gl-flds"></div><h3>Preview</h3><div id="gl-cprev" class="gl-ctext"></div><label class="tu-label">Note in the email (optional)<textarea class="tu-input" id="gl-cmsg" rows="2"></textarea></label><p><button type="button" class="tu-btn tu-btn--primary" id="gl-csend">✉ Send for signing</button></p></section>');
		pane.appendChild(f);
		var vals = {};
		function load() {
			var t = tpls[+$("#gl-ctsel").value]; $("#gl-ctitle").value = t.name;
			var fl = G.fields(t.body); $("#gl-cflds").innerHTML = fl.map(function (k) { return '<label class="tu-label">' + esc(k.replace(/_/g, " ")) + '<input class="tu-input" data-k="' + k + '"></label>'; }).join("");
			if (d.brand && d.brand.name) vals.photographer = vals.photographer || d.brand.name;
			$("#gl-cflds").querySelectorAll("input").forEach(function (i) { i.value = vals[i.getAttribute("data-k")] || ""; });
			prev();
		}
		function prev() { var t = tpls[+$("#gl-ctsel").value]; vals.client_name = $("#gl-ccli").value || vals.client_name; $("#gl-cflds").querySelectorAll("input").forEach(function (i) { vals[i.getAttribute("data-k")] = i.value; }); $("#gl-cprev").innerHTML = esc(G.fill(t.body, vals)).replace(/\n/g, "<br>"); }
		$("#gl-ctsel").onchange = load; f.addEventListener("input", prev); $("#gl-cback").onclick = function () { conList(pane); };
		$("#gl-ccli").addEventListener("input", function () { var i = $('#gl-cflds input[data-k="client_name"]'); if (i) i.value = this.value; prev(); });
		load();
		$("#gl-csend").onclick = async function () {
			prev(); var body = G.fill(tpls[+$("#gl-ctsel").value].body, vals);
			if (/____/.test(body) && !confirm("Some fields are empty (shown as ____). Send anyway?")) return;
			var r = await api({ op: "csend", email: $("#gl-cem").value, client: $("#gl-ccli").value, title: $("#gl-ctitle").value, body: body, message: $("#gl-cmsg").value, by: (d.brand && d.brand.name) || "" }, true);
			if (!r.ok) return toast(r.error); d.contracts.unshift(r.contract); toast("Sent. You will get an email when it is signed."); if (MOCK) console.log("Contract link:", r.link); conList(pane);
		};
	}
	function editTemplates(pane) {
		var d = ST.d, t = JSON.parse(JSON.stringify(d.templates)); pane.innerHTML = "";
		var f = h('<section class="tu-card"><p><button type="button" class="tu-btn tu-btn--ghost" id="gl-tback">‹ Contracts</button></p><p class="tu-note">Put a field in double curly brackets, e.g. {{date}} or {{price}}; you fill them in when you send. Check your contract with a lawyer once.</p><div id="gl-tl"></div><p><button type="button" class="tu-btn" id="gl-tadd">＋ Template</button> <button type="button" class="tu-btn tu-btn--primary" id="gl-tsave">Save templates</button></p></section>');
		pane.appendChild(f);
		function draw() { $("#gl-tl").innerHTML = t.map(function (x, i) { return '<div class="gl-tpl"><input class="tu-input" data-i="' + i + '" data-f="name" value="' + esc(x.name) + '"><textarea class="tu-input" rows="12" data-i="' + i + '" data-f="body">' + esc(x.body) + '</textarea><button type="button" class="tu-btn tu-btn--ghost gl-danger" data-del="' + i + '">Remove</button></div>'; }).join(""); }
		draw();
		f.addEventListener("input", function (e) { var i = e.target.getAttribute("data-i"); if (i != null) t[+i][e.target.getAttribute("data-f")] = e.target.value; });
		f.addEventListener("click", function (e) { var i = e.target.getAttribute("data-del"); if (i != null && confirm("Remove this template?")) { t.splice(+i, 1); draw(); } });
		$("#gl-tadd").onclick = function () { t.push({ id: "", name: "New template", body: G.DEFAULT_TEMPLATE.body }); draw(); };
		$("#gl-tback").onclick = function () { conList(pane); };
		$("#gl-tsave").onclick = async function () { var r = await api({ op: "templates", templates: t }, true); if (!r.ok) return toast(r.error); d.templates = r.templates; toast("Saved."); conList(pane); };
	}
	function settings(pane) {
		var b = ST.d.brand || {}; pane.innerHTML = "";
		var f = h('<section class="tu-card"><h3>Your business</h3><label class="tu-label">Business name (shown to clients)<input class="tu-input" id="gl-bn"></label><label class="tu-label">Your email (signed contracts are sent here)<input class="tu-input" type="email" id="gl-be"></label><label class="tu-label">Website<input class="tu-input" id="gl-bs"></label><p><button type="button" class="tu-btn tu-btn--primary" id="gl-bsave">Save</button></p></section>');
		pane.appendChild(f); $("#gl-bn").value = b.name || ""; $("#gl-be").value = b.email || ""; $("#gl-bs").value = b.site || "";
		$("#gl-bsave").onclick = async function () { var r = await api({ op: "brand", name: $("#gl-bn").value, email: $("#gl-be").value, site: $("#gl-bs").value }, true); if (!r.ok) return toast(r.error); ST.d.brand = r.brand; toast("Saved."); };
	}

	/* ---------- start ---------- */
	if (MOCK) root.insertAdjacentHTML("afterbegin", '<p class="tu-note gl-mocknote">Test mode: everything is kept in this browser, emails are shown at the bottom of the page instead of being sent.' + (MODE === "client" ? ' <a href="galleries-studio">Owner page</a>' : ' <a href="galleries">Client page</a>') + "</p>");
	showOutbox();
	window.MESGalleriesDebug = { api: api, ST: ST, CL: CL };
	if (MODE === "studio") studio();
	else if (Q.get("c")) clientContract();
	else clientGallery();
})();
