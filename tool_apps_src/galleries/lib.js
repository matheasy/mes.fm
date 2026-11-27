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
	/** how a client gets in: code = email + emailed 6-digit code; email = an email on the list, no code; any = anyone who types an email (each one logged) */
	G.ACCESS = ["code", "email", "any"];
	G.access = function (g) { return g && G.ACCESS.indexOf(g.access) >= 0 ? g.access : "code"; };
	G.allowed = function (g, email) { return G.access(g) === "any" ? G.validEmail(email) : (g.emails || []).indexOf(G.normEmail(email)) >= 0; };
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
	function pubGallery(g) { return { id: g.id, title: g.title, date: g.date, active: !!g.active, expires: g.expires || 0, by: g.by || "", access: G.access(g) }; }
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
		if (!G.allowed(g, s.email)) return null;
		if (s.nc && G.access(g) === "code") return null; // she turned codes back on: no-code sign-ins end
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
			// no-code galleries: an allowed email gets straight in (the photographer chose to skip the code)
			if (G.access(g) !== "code") {
				if (!G.allowed(g, email)) return err(403, "That email is not on this gallery's list. Use the email your photographer has, or contact them.");
				var t0 = ctx.rand(20);
				await ctx.db.set("gal:tok:" + t0, { gid: g.id, email: email, at: now, nc: 1 }, G.TOKEN_TTL);
				return ok({ token: t0 });
			}
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
			if (G.access(g) !== "code") return err(400, "This gallery does not use codes. Go back and type your email.");
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
			log[email] = { n: ((log[email] || {}).n || 0) + 1, last: now, nc: !!se.s.nc };
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
				id: id, title: G.text(g.title, 120) || "Untitled gallery", date: G.text(g.date, 20), active: !!g.active, access: G.access(g),
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
			var how = G.access(g) === "code" ? "; we will email you a code to get in." : " to get in.";
			if (!to.length) return err(400, "Add a client email first.");
			var brand = (await ctx.db.get("gal:brand")) || {}, link = ctx.base + "/galleries?g=" + g.id, sent = 0;
			var note = G.text(b.message, 1000, true);
			for (var i = 0; i < to.length; i++) {
				var m = mailWrap(g.title, [(brand.name || "Your photographer") + " shared a private gallery with you.", note, "Open the link and type this email address (" + to[i] + ")" + how].filter(Boolean), ["Open the gallery", link]);
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
