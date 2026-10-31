/* MES Stream Chat: shared, pure helpers (MESChat). Served to the page AND required by mes.fm/api/yt-chat.js as
   mes.fm/api/_stream-chat-lib.js, a byte-identical copy: after editing run
     cp tool_apps_src/stream-chat/lib.js mes.fm/api/_stream-chat-lib.js
   (the tests check). Tests: node tool_apps_src/stream-chat-tests.js

   One message shape for every platform:
     { id, p: 'yt'|'tw'|'od', name, color, avatar, parts: [{t: text} | {img, alt}],
       kind: 'chat'|'super'|'sticker'|'member'|'gift'|'bits'|'sub'|'raid'|'tip'|'info',
       amount: '$5.00' | '100 bits' | '25 LBC' | '', note: '', mod, owner, member, ts } */
(function (root) {
	'use strict';
	var C = {};

	C.PLATFORMS = {
		yt: { name: 'YouTube', color: '#ff0033' },
		tw: { name: 'Twitch', color: '#9146ff' },
		od: { name: 'Odysee', color: '#e50054' }
	};
	C.PAID = { super: 1, sticker: 1, member: 1, gift: 1, bits: 1, sub: 1, tip: 1 };
	C.isPaid = function (m) { return !!(m && C.PAID[m.kind]); };

	/* ---------- inputs ---------- */
	/* A YouTube source: @handle, a UC... channel id, or a video address / id. */
	C.ytSource = function (s) {
		s = String(s || '').trim();
		if (!s) return null;
		var m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
		if (m) return { v: m[1] };
		m = s.match(/youtube\.com\/(@[A-Za-z0-9._-]{3,30})/); if (m) return { ch: m[1] };
		m = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/); if (m) return { ch: m[1] };
		if (/^@[A-Za-z0-9._-]{3,30}$/.test(s)) return { ch: s };
		if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return { ch: s };
		if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { v: s };
		if (/^[A-Za-z0-9._-]{3,30}$/.test(s)) return { ch: '@' + s };
		return null;
	};
	C.twChannel = function (s) {
		s = String(s || '').trim().replace(/^#/, '').replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\/(popout\/)?/i, '').replace(/[\/?#].*$/, '').toLowerCase();
		return /^[a-z0-9_]{3,25}$/.test(s) ? s : null;
	};
	/* Odysee channel: @name or @name:claim (also an odysee.com link). */
	C.odChannel = function (s) {
		s = String(s || '').trim().replace(/^https?:\/\/odysee\.com\/(\$\/popout\/)?/i, '').replace(/^lbry:\/\//, '');
		var m = s.match(/^(@[^\/:#?\s]{1,64})(?:[:#]([0-9a-f]{1,40}))?/i);
		return m ? m[1] + (m[2] ? ':' + m[2].toLowerCase() : '') : null;
	};
	C.list = function (s) { return String(s || '').split(/[,\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); };

	/* ---------- YouTube ---------- */
	function runsText(r) {
		if (!r) return '';
		if (r.simpleText != null) return r.simpleText;
		if (r.content != null) return r.content;
		return (r.runs || []).map(function (x) { return x.text != null ? x.text : (x.emoji ? (x.emoji.shortcuts || [''])[0] : ''); }).join('');
	}
	function runsParts(r) {
		if (!r) return [];
		if (r.simpleText != null) return [{ t: r.simpleText }];
		if (r.content != null) return [{ t: r.content }];
		var out = [];
		(r.runs || []).forEach(function (x) {
			if (x.text != null) out.push({ t: x.text });
			else if (x.emoji) {
				var th = (x.emoji.image && x.emoji.image.thumbnails) || [], alt = (x.emoji.shortcuts || [])[0] || x.emoji.emojiId || '';
				if (x.emoji.isCustomEmoji && th.length) out.push({ img: th[th.length - 1].url, alt: alt });
				else out.push({ t: x.emoji.emojiId && !/^UC/.test(x.emoji.emojiId) ? x.emoji.emojiId : alt });
			}
		});
		return out;
	}
	function thumb(o) { var t = o && o.thumbnails; return t && t.length ? t[0].url : ''; }
	function argb(n) { if (typeof n !== 'number') return ''; var h = (n >>> 0).toString(16); while (h.length < 8) h = '0' + h; return '#' + h.slice(2); }
	function ytBadges(r, m) {
		(r.authorBadges || []).forEach(function (b) {
			var x = b.liveChatAuthorBadgeRenderer || {}, ic = x.icon && x.icon.iconType;
			if (ic === 'OWNER') m.owner = true; else if (ic === 'MODERATOR') m.mod = true; else if (x.customThumbnail) m.member = true;
		});
	}
	C.ytItem = function (item) {
		if (!item) return null;
		var k = Object.keys(item)[0], r = item[k] || {}, m;
		var base = function (kind) {
			var o = { id: 'yt:' + (r.id || Math.random()), p: 'yt', name: runsText(r.authorName).trim(), avatar: thumb(r.authorPhoto) || '', parts: runsParts(r.message), kind: kind, amount: '', note: '', ts: r.timestampUsec ? Math.round(+r.timestampUsec / 1000) : Date.now() };
			ytBadges(r, o); return o;
		};
		switch (k) {
			case 'liveChatTextMessageRenderer': return base('chat');
			case 'liveChatPaidMessageRenderer':
				m = base('super'); m.amount = runsText(r.purchaseAmountText); m.color = argb(r.bodyBackgroundColor); return m;
			case 'liveChatPaidStickerRenderer':
				m = base('sticker'); m.amount = runsText(r.purchaseAmountText); m.color = argb(r.backgroundColor);
				var st = r.sticker && r.sticker.thumbnails; if (st && st.length) m.parts = [{ img: st[st.length - 1].url, alt: (r.sticker.accessibility && r.sticker.accessibility.accessibilityData && r.sticker.accessibility.accessibilityData.label) || 'Super Sticker' }];
				return m;
			case 'liveChatMembershipItemRenderer':
				m = base('member'); m.note = runsText(r.headerPrimaryText) || runsText(r.headerSubtext) || 'New member'; return m;
			case 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer':
				var h = (r.header && r.header.liveChatSponsorshipsHeaderRenderer) || {};
				m = { id: 'yt:' + (r.id || Math.random()), p: 'yt', name: runsText(h.authorName).trim(), avatar: thumb(h.authorPhoto), parts: [], kind: 'gift', amount: '', note: runsText(h.primaryText) || 'Gifted memberships', ts: r.timestampUsec ? Math.round(+r.timestampUsec / 1000) : Date.now() };
				return m;
			case 'giftMessageViewModel':
				return { id: 'yt:' + (r.id || Math.random()), p: 'yt', name: runsText(r.authorName).trim(), avatar: '', parts: [], kind: 'gift', amount: '', note: runsText(r.text), ts: Date.now() };
			default: return null;
		}
	};
	/* actions from ytInitialData / get_live_chat -> { msgs, removed: [ids] } */
	C.ytActions = function (actions) {
		var msgs = [], removed = [];
		(actions || []).forEach(function (a) {
			if (a.addChatItemAction) { var m = C.ytItem(a.addChatItemAction.item); if (m && (m.parts.length || m.note || m.amount)) msgs.push(m); }
			else if (a.removeChatItemAction) removed.push('yt:' + a.removeChatItemAction.targetItemId);
			else if (a.markChatItemAsDeletedAction) removed.push('yt:' + a.markChatItemAsDeletedAction.targetItemId);
		});
		return { msgs: msgs, removed: removed };
	};
	/* the live chat page (HTML) -> {cont, key, ver, title, actions} */
	C.ytChatPage = function (html) {
		html = String(html || '');
		var m = html.match(/(?:window\["ytInitialData"\]|var ytInitialData)\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
		if (!m) return null;
		var d; try { d = JSON.parse(m[1]); } catch (e) { return null; }
		var lcr = d && d.contents && d.contents.liveChatRenderer;
		if (!lcr) return null;
		var key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1] || '', ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || '';
		return { cont: C.ytCont(lcr.continuations), key: key, ver: ver, actions: lcr.actions || [] };
	};
	C.ytCont = function (conts) {
		var c = (conts || [])[0]; if (!c) return null;
		var v = c[Object.keys(c)[0]] || {};
		return v.continuation ? { c: v.continuation, wait: v.timeoutMs || 5000 } : null;
	};
	/* a channel's /live page -> { v, live, upcoming, title } */
	C.ytLivePage = function (html) {
		html = String(html || '');
		var v = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/) || [])[1];
		if (!v) return { v: null };
		var title = (html.match(/<meta name="title" content="([^"]*)"/) || [])[1] || '';
		return { v: v, live: /"isLiveNow":true/.test(html), upcoming: /"isUpcoming":true/.test(html) && !/"isLiveNow":true/.test(html), title: C.unescapeHtml(title) };
	};
	C.unescapeHtml = function (s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); };

	/* ---------- Twitch (anonymous IRC) ---------- */
	function unTag(s) { return String(s || '').replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\').replace(/\\r/g, '').replace(/\\n/g, ''); }
	C.ircLine = function (line) {
		var o = { tags: {}, prefix: '', cmd: '', params: [] }, i = 0;
		if (line[0] === '@') { var sp = line.indexOf(' '); line.slice(1, sp).split(';').forEach(function (kv) { var e = kv.indexOf('='); o.tags[e < 0 ? kv : kv.slice(0, e)] = e < 0 ? '' : unTag(kv.slice(e + 1)); }); line = line.slice(sp + 1); }
		if (line[0] === ':') { i = line.indexOf(' '); o.prefix = line.slice(1, i); line = line.slice(i + 1); }
		var t = line.indexOf(' :'), head = t < 0 ? line : line.slice(0, t);
		o.params = head.split(' ').filter(Boolean); o.cmd = o.params.shift() || '';
		if (t >= 0) o.params.push(line.slice(t + 2));
		return o;
	};
	/* emotes tag "25:0-4,12-16/1902:6-10" -> parts */
	C.twParts = function (text, emotes) {
		var list = [];
		String(emotes || '').split('/').forEach(function (e) {
			var c = e.indexOf(':'); if (c < 0) return;
			var id = e.slice(0, c);
			e.slice(c + 1).split(',').forEach(function (r) { var ab = r.split('-'); list.push({ a: +ab[0], b: +ab[1], id: id }); });
		});
		list.sort(function (x, y) { return x.a - y.a; });
		var chars = Array.from(text), out = [], pos = 0;
		list.forEach(function (e) {
			if (e.a < pos || e.b >= chars.length) return;
			if (e.a > pos) out.push({ t: chars.slice(pos, e.a).join('') });
			out.push({ img: 'https://static-cdn.jtvnw.net/emoticons/v2/' + e.id + '/default/dark/1.0', alt: chars.slice(e.a, e.b + 1).join('') });
			pos = e.b + 1;
		});
		if (pos < chars.length) out.push({ t: chars.slice(pos).join('') });
		return out;
	};
	/* one IRC line -> { msg } | { removed: id } | { clear: true } | null */
	C.twLine = function (line) {
		var o = C.ircLine(line), g = o.tags, name = g['display-name'] || (o.prefix.split('!')[0] || '');
		var badges = g.badges || '', base = function (kind, text) {
			var text2 = text || '', act = /^\u0001ACTION (.*)\u0001$/.exec(text2); if (act) text2 = act[1];
			return { id: 'tw:' + (g.id || Math.random()), p: 'tw', name: name, color: g.color || '', avatar: '', parts: text2 ? C.twParts(text2, g.emotes) : [], kind: kind, amount: '', note: '',
				mod: /(^|,)(moderator)\//.test(badges), owner: /(^|,)broadcaster\//.test(badges), member: /(^|,)(subscriber|founder)\//.test(badges), ts: +g['tmi-sent-ts'] || Date.now() };
		};
		if (o.cmd === 'PRIVMSG') {
			var m = base(g.bits ? 'bits' : 'chat', o.params[1]);
			if (g.bits) m.amount = g.bits + (g.bits === '1' ? ' bit' : ' bits');
			return { msg: m };
		}
		if (o.cmd === 'USERNOTICE') {
			var id = g['msg-id'] || '', k = /^(sub|resub)$/.test(id) ? 'sub' : /gift/.test(id) ? 'gift' : id === 'raid' ? 'raid' : 'info';
			var u = base(k, o.params[1] || ''); u.note = g['system-msg'] || id;
			return { msg: u };
		}
		if (o.cmd === 'CLEARMSG') return { removed: 'tw:' + g['target-msg-id'] };
		if (o.cmd === 'CLEARCHAT' && o.params.length < 2) return { clear: true };
		return null;
	};

	/* ---------- Odysee ---------- */
	C.odComment = function (c) {
		if (!c || !c.comment_id) return null;
		var amt = +c.support_amount || 0;
		return { id: 'od:' + c.comment_id, p: 'od', name: c.channel_name || 'Anonymous', avatar: '', parts: [{ t: String(c.comment || '') }],
			kind: amt > 0 ? 'tip' : 'chat', amount: amt > 0 ? (c.is_fiat ? '$' + amt.toFixed(2) : C.lbc(amt)) : '', note: '', ts: c.timestamp ? c.timestamp * 1000 : Date.now() };
	};
	C.lbc = function (n) { return (n >= 100 ? Math.round(n) : +n.toFixed(2)) + ' LBC'; };
	/* websocket message text -> { msg } | { removed } | { viewers } | null */
	C.odSocket = function (txt) {
		var d; try { d = JSON.parse(txt); } catch (e) { return null; }
		if (!d || !d.type) return null;
		if (d.type === 'delta' && d.data && d.data.comment) { var m = C.odComment(d.data.comment); return m ? { msg: m } : null; }
		if (d.type === 'removed' && d.data && d.data.comment) return { removed: 'od:' + d.data.comment.comment_id };
		if (d.type === 'viewers' && d.data) return { viewers: d.data.connected };
		return null;
	};

	/* ---------- feed helpers ---------- */
	C.plain = function (m) { return (m.parts || []).map(function (p) { return p.t != null ? p.t : (p.alt || ''); }).join(''); };
	/* keep the newest n, drop duplicate ids */
	C.Feed = function (max) {
		this.max = max || 300; this.items = []; this.seen = {};
	};
	C.Feed.prototype.add = function (m) {
		if (!m || this.seen[m.id]) return false;
		this.seen[m.id] = 1; this.items.push(m);
		if (this.items.length > this.max) { var x = this.items.shift(); delete this.seen[x.id]; }
		return true;
	};
	C.Feed.prototype.remove = function (id) {
		for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) { this.items.splice(i, 1); return true; }
		return false;
	};
	/* totals of paid messages, per currency text, e.g. {"$": 15, "CA$": 5, "bits": 300} */
	C.totals = function (items) {
		var t = {};
		items.forEach(function (m) {
			if (!m.amount) return;
			var a = String(m.amount).replace(/ /g, ' ').trim(), mm = a.match(/^([^\d.,-]*)\s*([\d.,]+)\s*([^\d.,]*)$/);
			if (!mm) return;
			var unit = (mm[1] || mm[3] || '').trim() || '?', n = parseFloat(mm[2].replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
			if (!isFinite(n)) return;
			if (/^bits?$/.test(unit)) unit = 'bits';
			t[unit] = Math.round(((t[unit] || 0) + n) * 100) / 100;
		});
		return t;
	};

	if (typeof module !== 'undefined' && module.exports) module.exports = C;
	else root.MESChat = C;
})(this);
