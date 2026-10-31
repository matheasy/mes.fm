// Tests for MES Stream Chat (tool_apps_src/stream-chat/lib.js). Run: node tool_apps_src/stream-chat-tests.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const C = require('./stream-chat/lib.js');
let n = 0; const t = (name, f) => { f(); n++; };

t('lib copy for the API is identical', () => {
	assert.strictEqual(fs.readFileSync(path.join(__dirname, 'stream-chat/lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../mes.fm/api/_stream-chat-lib.js'), 'utf8'), 'run: cp tool_apps_src/stream-chat/lib.js mes.fm/api/_stream-chat-lib.js');
});

t('sources', () => {
	assert.deepStrictEqual(C.ytSource('@mestruth'), { ch: '@mestruth' });
	assert.deepStrictEqual(C.ytSource('mestruth'), { ch: '@mestruth' });
	assert.deepStrictEqual(C.ytSource('https://www.youtube.com/watch?v=3F_dpWjc-TU&t=4'), { v: '3F_dpWjc-TU' });
	assert.deepStrictEqual(C.ytSource('https://youtube.com/live/3F_dpWjc-TU?si=x'), { v: '3F_dpWjc-TU' });
	assert.deepStrictEqual(C.ytSource('https://www.youtube.com/channel/UCUUBq1GPBvvGNz7dpgO14Ow'), { ch: 'UCUUBq1GPBvvGNz7dpgO14Ow' });
	assert.strictEqual(C.ytSource('<script>'), null);
	assert.strictEqual(C.twChannel('https://www.twitch.tv/popout/matheasysolutions/chat?popout='), 'matheasysolutions');
	assert.strictEqual(C.twChannel('#MathEasySolutions'), 'matheasysolutions');
	assert.strictEqual(C.twChannel('a b'), null);
	assert.strictEqual(C.odChannel('https://odysee.com/$/popout/@mestruth:9/livestream'), '@mestruth:9');
	assert.strictEqual(C.odChannel('@mestruth#9'), '@mestruth:9');
	assert.strictEqual(C.odChannel('nope'), null);
	assert.deepStrictEqual(C.list('@a, @b\n@c'), ['@a', '@b', '@c']);
});

t('YouTube recorded chat', () => {
	const a = C.ytActions(JSON.parse(fs.readFileSync(path.join(__dirname, 'stream-chat/fixtures/yt-actions.json'), 'utf8')));
	assert.ok(a.msgs.length >= 70, 'messages: ' + a.msgs.length);
	assert.strictEqual(a.removed.length, 1);
	const m = a.msgs.find((x) => x.kind === 'chat');
	assert.ok(m.name && m.parts.length && /^yt:/.test(m.id) && /^https:\/\//.test(m.avatar));
	assert.ok(a.msgs.some((x) => x.kind === 'gift' && x.note));
});

t('YouTube Super Chat, sticker, member', () => {
	const sc = C.ytItem({ liveChatPaidMessageRenderer: { id: 'a1', authorName: { simpleText: 'Bob' }, purchaseAmountText: { simpleText: 'CA$5.00' }, bodyBackgroundColor: 4280150454, message: { runs: [{ text: 'great ' }, { emoji: { emojiId: '😀', shortcuts: [':grin:'] } }] }, authorBadges: [{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'MODERATOR' } } }] } });
	assert.strictEqual(sc.kind, 'super'); assert.strictEqual(sc.amount, 'CA$5.00'); assert.strictEqual(sc.color, '#1de9b6'); assert.ok(sc.mod);
	assert.strictEqual(C.plain(sc), 'great 😀'); assert.ok(C.isPaid(sc));
	const st = C.ytItem({ liveChatPaidStickerRenderer: { id: 'a2', authorName: { simpleText: 'Al' }, purchaseAmountText: { simpleText: '$2.00' }, sticker: { thumbnails: [{ url: 'https://x/s.png' }] } } });
	assert.strictEqual(st.kind, 'sticker'); assert.strictEqual(st.parts[0].img, 'https://x/s.png');
	const mb = C.ytItem({ liveChatMembershipItemRenderer: { id: 'a3', authorName: { simpleText: 'Cy' }, headerSubtext: { runs: [{ text: 'Welcome to ' }, { text: 'MES' }] } } });
	assert.strictEqual(mb.kind, 'member'); assert.strictEqual(mb.note, 'Welcome to MES');
	assert.strictEqual(C.ytItem({ somethingNew: {} }), null);
});

t('YouTube pages', () => {
	const live = '<link rel="canonical" href="https://www.youtube.com/watch?v=3F_dpWjc-TU"><meta name="title" content="MES Livestream 143: 9/11 &amp; more">"isUpcoming":true';
	assert.deepStrictEqual(C.ytLivePage(live), { v: '3F_dpWjc-TU', live: false, upcoming: true, title: 'MES Livestream 143: 9/11 & more' });
	assert.deepStrictEqual(C.ytLivePage('<link rel="canonical" href="https://www.youtube.com/channel/UC1">'), { v: null });
	const page = '<script>window["ytInitialData"] = {"contents":{"liveChatRenderer":{"continuations":[{"timedContinuationData":{"continuation":"abc","timeoutMs":4000}}],"actions":[]}}};</script>"INNERTUBE_API_KEY":"KEY1234567890123456789012","INNERTUBE_CLIENT_VERSION":"2.20261029.11.00"';
	const p = C.ytChatPage(page);
	assert.deepStrictEqual(p.cont, { c: 'abc', wait: 4000 }); assert.strictEqual(p.key, 'KEY1234567890123456789012'); assert.strictEqual(p.ver, '2.20261029.11.00');
	assert.strictEqual(C.ytChatPage('<html>no chat</html>'), null);
});

t('Twitch IRC', () => {
	const pm = C.twLine('@badge-info=subscriber/3;badges=subscriber/3,moderator/1;color=#0000FF;display-name=GrimsReaper_666;emotes=425618:0-2,4-6;id=6ff4;tmi-sent-ts=1793472894011 :grimsreaper_666!grimsreaper_666@x.tmi.twitch.tv PRIVMSG #jynxzi :LUL LUL hi');
	assert.strictEqual(pm.msg.name, 'GrimsReaper_666'); assert.strictEqual(pm.msg.color, '#0000FF'); assert.ok(pm.msg.mod && pm.msg.member);
	assert.strictEqual(pm.msg.parts.length, 4); assert.strictEqual(pm.msg.parts[0].alt, 'LUL'); assert.strictEqual(pm.msg.parts[3].t, ' hi');
	assert.ok(/emoticons\/v2\/425618\//.test(pm.msg.parts[0].img)); assert.strictEqual(pm.msg.ts, 1793472894011);
	const bits = C.twLine('@bits=100;display-name=Ann;id=b1 :ann!ann@x PRIVMSG #m :Cheer100 nice');
	assert.strictEqual(bits.msg.kind, 'bits'); assert.strictEqual(bits.msg.amount, '100 bits');
	const sub = C.twLine('@display-name=Ben;id=s1;msg-id=resub;system-msg=Ben\\ssubscribed\\sat\\sTier\\s1. :tmi.twitch.tv USERNOTICE #m :love it');
	assert.strictEqual(sub.msg.kind, 'sub'); assert.strictEqual(sub.msg.note, 'Ben subscribed at Tier 1.'); assert.strictEqual(C.plain(sub.msg), 'love it');
	assert.deepStrictEqual(C.twLine('@target-msg-id=6ff4 :tmi.twitch.tv CLEARMSG #m :x'), { removed: 'tw:6ff4' });
	assert.deepStrictEqual(C.twLine(':tmi.twitch.tv CLEARCHAT #m'), { clear: true });
	assert.strictEqual(C.twLine('PING :tmi.twitch.tv'), null);
	assert.strictEqual(C.plain(C.twLine('@display-name=A;id=x :a!a@x PRIVMSG #m :\u0001ACTION waves\u0001').msg), 'waves');
});

t('Odysee', () => {
	const d = C.odSocket(JSON.stringify({ type: 'delta', data: { comment: { comment_id: 'c1', comment: 'hello', channel_name: '@bob', support_amount: 0, timestamp: 1793472000 } } }));
	assert.strictEqual(d.msg.name, '@bob'); assert.strictEqual(d.msg.kind, 'chat'); assert.strictEqual(d.msg.ts, 1793472000000);
	const tip = C.odComment({ comment_id: 'c2', comment: 'tip!', channel_name: '@al', support_amount: 25, is_fiat: false });
	assert.strictEqual(tip.kind, 'tip'); assert.strictEqual(tip.amount, '25 LBC');
	assert.strictEqual(C.odComment({ comment_id: 'c3', comment: 'x', support_amount: 5, is_fiat: true }).amount, '$5.00');
	assert.deepStrictEqual(C.odSocket('{"type":"removed","data":{"comment":{"comment_id":"c1"}}}'), { removed: 'od:c1' });
	assert.deepStrictEqual(C.odSocket('{"type":"viewers","data":{"connected":7}}'), { viewers: 7 });
	assert.strictEqual(C.odSocket('not json'), null);
});

t('feed + totals', () => {
	const f = new C.Feed(3);
	assert.ok(f.add({ id: 'a' })); assert.ok(!f.add({ id: 'a' }));
	f.add({ id: 'b' }); f.add({ id: 'c' }); f.add({ id: 'd' });
	assert.deepStrictEqual(f.items.map((x) => x.id), ['b', 'c', 'd']);
	assert.ok(f.add({ id: 'a' }), 'dropped ids can come back'); assert.ok(f.remove('c')); assert.ok(!f.remove('zz'));
	assert.deepStrictEqual(C.totals([{ amount: '$5.00' }, { amount: '$1,000.50' }, { amount: 'CA$2.00' }, { amount: '100 bits' }, { amount: '1 bit' }, { amount: '25 LBC' }, { amount: '€3,50' }, { amount: '' }]),
		{ '$': 1005.5, 'CA$': 2, bits: 101, LBC: 25, '€': 3.5 });
});

console.log('stream-chat: ' + n + ' groups passed');
