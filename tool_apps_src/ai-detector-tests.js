/* Tests for the MES AI Detector logic (tool_apps_src/ai-detector/lib.js). Run: node tool_apps_src/ai-detector-tests.js */
'use strict';
var A = require('./ai-detector/lib.js'), X = require('./exif-viewer/lib.js'), zlib = require('zlib'), fail = 0, n = 0;
function ok(c, m) { n++; if (!c) { fail++; console.log('FAIL', m); } }
function has(r, dir, re) { return r.signals.some(function (s) { return s.dir === dir && re.test(s.title + ' ' + s.detail); }); }
function u32(v) { return Buffer.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
function crc(b) { var c, t = [], k, i; for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } c = 0xFFFFFFFF; for (i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { var td = Buffer.concat([Buffer.from(type, 'latin1'), data]); return Buffer.concat([u32(data.length), td, u32(crc(td))]); }
function png(w, h, extra) {
	var ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([8, 2, 0, 0, 0])]), raw = Buffer.alloc((w * 3 + 1) * h);
	return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr)].concat(extra || []).concat([chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])));
}
function tEXt(k, v) { return chunk('tEXt', Buffer.concat([Buffer.from(k, 'latin1'), Buffer.from([0]), Buffer.from(v, 'latin1')])); }
function iTXt(k, v) { return chunk('iTXt', Buffer.concat([Buffer.from(k, 'latin1'), Buffer.from([0, 0, 0, 0, 0]), Buffer.from(v, 'utf8')])); }
function jpeg(segs) { return new Uint8Array(Buffer.concat([Buffer.from([0xFF, 0xD8])].concat(segs.map(function (s) { return Buffer.concat([Buffer.from([0xFF, s[0]]), Buffer.from([(s[1].length + 2) >> 8, (s[1].length + 2) & 255]), s[1]]); })).concat([Buffer.from([0xFF, 0xDA, 0, 2, 0xFF, 0xD9])]))); }
function xmpSeg(body) { return [0xE1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description ' + body + '</rdf:RDF></x:xmpmeta>', 'latin1')]; }

/* Stable Diffusion web UI PNG */
var params = 'a cat astronaut, highly detailed\nNegative prompt: blurry, ugly\nSteps: 30, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 12345, Size: 1024x1024, Model: sd_xl_base_1.0';
var p1 = png(16, 16, [tEXt('parameters', params)]), r1 = A.scanImage(p1, { w: 1024, h: 1024 });
ok(has(r1, 'ai', /Stable Diffusion settings/), 'A1111 parameters detected');
ok(/sd_xl_base/.test(r1.signals[0].detail), 'model named');
ok(r1.info.prompt === 'a cat astronaut, highly detailed', 'prompt parsed: ' + r1.info.prompt);
ok(r1.info.settings.Seed === '12345' && r1.info.settings.Sampler === 'DPM++ 2M Karras', 'settings parsed');
ok(A.summary(r1.signals).level === 'ai', 'summary ai');
ok(has(r1, 'ai', /size image generators/), 'size hint');
var pa = A.parseA1111(params); ok(pa.negative === 'blurry, ugly', 'negative prompt');
/* ComfyUI */
var r2 = A.scanImage(png(8, 8, [tEXt('prompt', '{"3":{"class_type":"KSampler","inputs":{}},"6":{"class_type":"CLIPTextEncode","inputs":{"text":"a red fox in snow"}}}')]));
ok(has(r2, 'ai', /ComfyUI/), 'ComfyUI'); ok(r2.info.prompt === 'a red fox in snow', 'comfy prompt');
/* NovelAI + iTXt */
ok(has(A.scanImage(png(8, 8, [tEXt('Software', 'NovelAI')])), 'ai', /NovelAI/), 'NovelAI');
ok(A.pngChunks(png(8, 8, [iTXt('Description', 'héllo')]))[0].text === 'héllo', 'iTXt utf8');
/* plain PNG: no evidence */
var r3 = A.scanImage(png(20, 30)); ok(r3.signals.length === 1 && r3.signals[0].src === 'none', 'plain png = no metadata'); ok(A.summary(r3.signals).level === 'none', 'summary none');
/* JPEG with IPTC digital source type */
var j1 = jpeg([xmpSeg('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" xmp:CreatorTool="Adobe Firefly"/>')]), r4 = A.scanImage(j1, { exif: X.parse(j1) });
ok(has(r4, 'ai', /made by AI/), 'IPTC trained algorithmic media'); ok(has(r4, 'ai', /Adobe Firefly/), 'XMP creator tool'); ok(r4.info.format === 'JPEG', 'jpeg format');
var j2 = jpeg([xmpSeg('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia"/>')]);
ok(has(A.scanImage(j2), 'ai', /part of it/), 'composite with AI');
ok(has(A.scanImage(jpeg([xmpSeg('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"/>')])), 'real', /camera/), 'digital capture = real');
/* Midjourney description */
ok(has(A.scanImage(jpeg([xmpSeg('><dc:description><rdf:Alt><rdf:li>a castle --ar 16:9 Job ID: 0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b</rdf:li></rdf:Alt></dc:description></rdf:Description>')])), 'ai', /Midjourney/), 'Midjourney job id');
/* C2PA (fake JUMBF: only the markers we read) */
var c2 = Buffer.from('JP\0\0\0\0\0\x01jumb\0\0\0\x1ejumdc2pa\0\x11\0\x10c2pa.claim\0claim_generator\x78Adobe_Photoshop/25.0 Adobe Firefly c2pa.actions c2pa.created digitalsourcetype/trainedAlgorithmicMedia', 'latin1');
var r5 = A.scanImage(jpeg([[0xEB, c2]]));
ok(has(r5, 'ai', /Content Credentials say/), 'C2PA ai'); ok(r5.info.c2pa && r5.info.c2pa.actions.indexOf('c2pa.created') >= 0, 'c2pa actions');
ok(r5.signals.filter(function (s) { return /made by AI/.test(s.title); }).length === 0, 'no double IPTC signal when in C2PA');
var c3 = Buffer.from('jumb\0\0jumdc2pa\0c2pa.claim\0claim_generator\x60Leica M11-P firmware 2.0 c2pa.actions c2pa.opened', 'latin1');
ok(has(A.scanImage(jpeg([[0xEB, c3]])), 'real', /Leica/), 'C2PA camera = real');
var c4 = Buffer.from('jumb\0\0jumdc2pa\0c2pa.claim\0claim_generator\x60SomeApp 1.2 c2pa.actions c2pa.edited', 'latin1');
ok(has(A.scanImage(jpeg([[0xEB, c4]])), 'info', /attached/), 'C2PA neutral');
/* loose byte label */
ok(has(A.scanImage(jpeg([[0xFE, Buffer.from('Made with Google AI', 'latin1')]])), 'ai', /Google AI label/), 'google label in comment');
/* size hints */
ok(A.sizeHint(1024, 1792) === 'list' && A.sizeHint(640, 448) === null && A.sizeHint(1280, 768) === 'mult64' && A.sizeHint(4032, 3024) === null, 'size hints');
/* generator names */
ok(A.genNames('Made by DALL·E 3 and Midjourney v6').join() === 'OpenAI DALL·E,Midjourney', 'genNames: ' + A.genNames('Made by DALL·E 3 and Midjourney v6'));
ok(A.genNames('Canon EOS R5').length === 0, 'camera not a generator');
/* classifier */
ok(Math.abs(A.clsProb([{ label: 'fake', score: 0.9 }, { label: 'real', score: 0.1 }]) - 0.9) < 1e-9, 'clsProb fake');
ok(Math.abs(A.clsProb([{ label: 'REAL', score: 0.7 }, { label: 'FAKE', score: 0.3 }]) - 0.3) < 1e-9, 'clsProb caps');
ok(A.clsSignal(0.95).dir === 'ai' && A.clsSignal(0.05).dir === 'real' && A.clsSignal(0.5).dir === 'info' && A.clsSignal(0.9).strength === 'weak', 'clsSignal always weak');
ok(A.summary([A.clsSignal(0.99)]).level === 'unclear', 'model alone never decides');
/* summary */
ok(A.summary([A.sig('ai', 'strong', 'x'), A.sig('real', 'strong', 'y')]).level === 'mixed', 'mixed');
ok(A.summary([A.sig('real', 'medium', 'x'), A.sig('real', 'weak', 'y')]).level === 'lean-real', 'lean real');

/* MP4 with udta ©too + mvhd */
function box(t, d) { return Buffer.concat([u32(8 + d.length), Buffer.from(t, 'latin1'), d]); }
function ilstItem(t, s) { return box(t, box('data', Buffer.concat([u32(1), u32(0), Buffer.from(s, 'utf8')]))); }
var mvhd = box('mvhd', Buffer.concat([Buffer.alloc(4), u32(3786825600), u32(3786825600), Buffer.alloc(88)]));
var meta = box('meta', Buffer.concat([Buffer.alloc(4), box('hdlr', Buffer.alloc(25)), box('ilst', ilstItem('©too', 'OpenAI Sora'))]));
var mp4 = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\x01isomavc1', 'latin1')), box('moov', Buffer.concat([mvhd, box('udta', meta)])), box('mdat', Buffer.alloc(64))]));
var v1 = A.scanVideo(mp4);
ok(v1.info.format === 'MP4', 'mp4 format'); ok(v1.info.encoder === 'OpenAI Sora', 'encoder read: ' + v1.info.encoder); ok(has(v1, 'ai', /Sora/), 'Sora detected');
ok(/^2023-12-31/.test(v1.info.created), 'mvhd date: ' + v1.info.created);
/* Apple keys make/model */
var keys = box('keys', Buffer.concat([Buffer.alloc(4), u32(2), u32(8 + 'com.apple.quicktime.make'.length), Buffer.from('mdta'), Buffer.from('com.apple.quicktime.make'), u32(8 + 'com.apple.quicktime.model'.length), Buffer.from('mdta'), Buffer.from('com.apple.quicktime.model')]));
var ilst = box('ilst', Buffer.concat([ilstItem('\0\0\0\x01', 'Apple'), ilstItem('\0\0\0\x02', 'iPhone 15 Pro')]));
var mp4b = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('qt  \0\0\0\0qt  ', 'latin1')), box('moov', Buffer.concat([mvhd, box('meta', Buffer.concat([box('hdlr', Buffer.alloc(25)), keys, ilst]))]))]));
var v2 = A.scanVideo(mp4b); ok(v2.info.make === 'Apple' && v2.info.model === 'iPhone 15 Pro', 'apple keys: ' + v2.info.make + '/' + v2.info.model); ok(has(v2, 'real', /iPhone 15 Pro/), 'phone video = real hint'); ok(v2.info.format === 'MOV', 'mov');
var v3 = A.scanVideo(new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom', 'latin1')), box('free', Buffer.from('Lavf60.16.100'))]))); ok(has(v3, 'info', /FFmpeg/), 'ffmpeg note');
ok(A.frameTimes(10, 5).join() === '1,3,5,7,9' && A.frameTimes(0, 5).join() === '0', 'frame times');

/* text */
var human = 'ok so yesterday i went to the store. Forgot my wallet. Had to walk all the way back home in the rain, which honestly was kind of funny when I think about it now, because the cashier just stared at me like I was nuts. Whatever. Got home, got the wallet, went back. They were closed. Classic me! Tomorrow I will try again I guess, maybe in the morning when it is not so busy and the bus is on time for once.';
var ai = 'Certainly! Here is an overview. In today\'s fast-paced world, technology plays a crucial role in our daily lives. It is important to note that innovation fosters growth. Furthermore, digital tools enhance productivity in many ways. Moreover, they unlock new opportunities for businesses. Additionally, they help people navigate the complexities of modern life. Ultimately, technology is a testament to human creativity. In conclusion, we must embrace this transformative landscape. This journey is truly pivotal for everyone.';
var sh = A.textStats(human), sa = A.textStats(ai);
ok(sh.sentences >= 8 && sa.sentences >= 9, 'sentences ' + sh.sentences + ' ' + sa.sentences);
ok(sa.cv < sh.cv, 'AI sample more even: ' + sa.cv.toFixed(2) + ' vs ' + sh.cv.toFixed(2));
var ga = A.textSignals(sa), gh = A.textSignals(sh);
ok(ga.some(function (s) { return s.dir === 'ai' && /overuse/.test(s.title); }), 'AI words found'); ok(ga.some(function (s) { return /Certainly/.test(s.title); }), 'chat opener');
ok(!gh.some(function (s) { return s.dir === 'ai'; }), 'human sample: no AI signals');
ok(A.textSignals(A.textStats('Too short.'))[0].title === 'Too short to judge', 'short');
ok(A.textSignals(A.textStats('As an AI language model, I cannot browse the web. ' + human)).some(function (s) { return s.strength === 'strong'; }), 'as an AI = strong');
ok(A.sentences('Dr. Smith went home. He slept! Then? Yes.').length >= 3, 'sentence split');
var lm = A.lmStats([-1, -2, -0.5, -3], [1, 3, 1, 40]); ok(Math.abs(lm.ppl - Math.exp(1.625)) < 1e-9 && lm.top1 === 0.5 && lm.top10 === 0.75, 'lmStats');
ok(A.lmSignal({ tokens: 200, ppl: 12, top10: 0.8, sd: 1 }).dir === 'ai' && A.lmSignal({ tokens: 200, ppl: 120, top10: 0.4, sd: 1 }).dir === 'real' && A.lmSignal({ tokens: 10, ppl: 5, top10: 0.9 }).dir === 'info', 'lmSignal');
var pr = A.aiPrompt('hello there', ga); ok(/--- TEXT ---\nhello there$/.test(pr) && /overuse/.test(pr), 'ai prompt');

/* image maps */
var a = new Uint8ClampedArray([10, 20, 30, 255, 100, 100, 100, 255]), b = new Uint8ClampedArray([12, 20, 25, 255, 100, 100, 100, 255]), e = A.elaMap(a, b, 10);
ok(e.data[0] === 20 && e.data[2] === 50 && e.data[4] === 0 && e.data[3] === 255, 'ela');
var W = 32, H = 32, img = new Uint8ClampedArray(W * H * 4); for (var i = 0; i < W * H; i++) { var v = (i * 7919) % 255; img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = v; img[i * 4 + 3] = 255; }
var nm = A.noiseMap(img, W, H); ok(nm.data.length === W * H * 4 && nm.median > 0, 'noise map');
var flat = new Uint8ClampedArray(W * H * 4).fill(128); ok(A.noiseMap(flat, W, H).median === 0, 'flat = no noise');


/* post links */
var L = A.parsePostLink;
ok(JSON.stringify(L('https://peakd.com/hive-167922/@mes/mes-ai-use-claude-chatgpt-grok-with-hive-jea#@gwajnberg/re-mes-tp2v9q')) === '{"kind":"hive","author":"gwajnberg","permlink":"re-mes-tp2v9q"}', 'peakd comment link = the comment');
ok(L('https://peakd.com/hive-167922/@mes/abc-def').permlink === 'abc-def' && L('https://ecency.com/hive-1/@a.b/x-1').author === 'a.b', 'peakd / ecency post');
ok(L('https://inleo.io/threads/view/mes/re-leothreads-abc').permlink === 're-leothreads-abc' && L('https://inleo.io/@mes/my-post').permlink === 'my-post', 'inleo thread + post');
var s3 = L('https://3speak.tv/watch?v=mes/ta0jgic7'); ok(s3.kind === 'hive' && s3.author === 'mes' && s3.video, '3speak watch');
ok(L('@mes/hello-world').kind === 'hive' && L('mes/hello-world').permlink === 'hello-world', 'bare author/permlink');
ok(L('https://youtu.be/dQw4w9WgXcQ').id === 'dQw4w9WgXcQ' && L('https://www.youtube.com/shorts/dQw4w9WgXcQ').id === 'dQw4w9WgXcQ' && L('https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ').kind === 'youtube', 'youtube links');
ok(L('https://example.com/news/story').kind === 'web' && L('example.com/a/b').kind === 'web', 'web article');
ok(L('peakd.com') === null && L('') === null && L('hello there') === null, 'not a link');
ok(L('https://peakd.com/trending').kind === 'web', 'a peakd page that is not a post falls back to web');
ok(A.isImageLink('https://files.peakd.com/file/peakd-hive/mes/23x/pic.jpg') && A.isImageLink('https://images.hive.blog/DQmabc/x') && !A.isImageLink('https://peakd.com/@mes/x'), 'image links');
/* markdown -> text, pictures */
var body = '# Title\n\nHello **world**, see [my site](https://mes.fm).\n\n![a cat](https://files.peakd.com/file/peakd-hive/mes/23tGabcdefghijklmnopqrstuvwxyz/cat.jpg)\n<center><img src="https://images.hive.blog/DQmZ9vZ7mDqVQf1wN1y3e1tP3Xb5k2y9R8qKxW4aA7nBcD1/dog.png"></center>\nhttps://example.com/x/bird.webp and https://example.com/page\n```code here```';
var tx = A.mdToText(body); ok(/Hello world, see my site\./.test(tx) && !/https?:|cat\]|code here|\*\*/.test(tx), 'mdToText: ' + JSON.stringify(tx));
var meta = { image: ['https://files.peakd.com/file/peakd-hive/mes/23tGabcdefghijklmnopqrstuvwxyz/cat.jpg', 'https://images.hive.blog/0x0/https://example.com/x/bird.webp'] };
var im = A.postImages(body, meta); ok(im.length === 3 && /cat\.jpg$/.test(im[0]) && im.some(function (u) { return /dog\.png$/.test(u); }), 'postImages dedupes proxies: ' + im.join(' '));
ok(A.imageOrigin('https://images.hive.blog/640x0/https://a.com/b.jpg') === 'https://a.com/b.jpg', 'imageOrigin');
var hi = A.hiveImageInfo(im[0]); ok(hi.uploader === 'mes' && hi.hash === '23tGabcdefghijklmnopqrstuvwxyz', 'peakd uploader + hash');
ok(A.hiveImageInfo('https://images.hive.blog/DQmZ9vZ7mDqVQf1wN1y3e1tP3Xb5k2y9R8qKxW4aA7nBcD1/dog.png').hash.indexOf('DQm') === 0 && !A.hiveImageInfo('https://a.com/b.jpg').hash, 'images.hive.blog hash');
/* hivePost */
var hp = A.hivePost({ author: 'bob', permlink: 'p1', title: 'My trip', created: '2026-11-20T10:00:00', depth: 0, body: body, json_metadata: JSON.stringify({ app: 'peakd/2026', tags: ['travel'], image: meta.image }) });
ok(hp.app === 'peakd' && hp.tags[0] === 'travel' && hp.images.length === 3 && /Hello world/.test(hp.text) && !hp.video, 'hivePost');
var hv = A.hivePost({ author: 'bob', permlink: 'v1', body: 'watch https://www.youtube.com/watch?v=dQw4w9WgXcQ', json_metadata: '{}' }); ok(hv.video && hv.video.kind === 'youtube' && hv.video.id === 'dQw4w9WgXcQ', 'youtube video in a post');
var h3 = A.hivePost({ author: 'bob', permlink: 'v2', body: 'x', json_metadata: { video: { info: { author: 'bob', permlink: 'abc', snaphash: 'QmSnap' } } } }); ok(h3.video.kind === '3speak' && /QmSnap$/.test(h3.video.thumb), '3speak metadata');
ok(A.hivePost({ author: 'z', permlink: 'c', depth: 2, body: 'hi', json_metadata: 'not json' }).title === 'Comment by @z', 'comment title + bad metadata');
/* copy clues */
var cs = A.copySignals(Object.assign({}, hp, { author: 'mes' })); ok(A.copySignals(hp).some(function (s) { return s.dir === 'look'; }), 'bob posting @mes uploads = worth checking'); ok(cs.some(function (s) { return s.dir === 'look' && /another account/.test(s.title); }) === false && cs.some(function (s) { return s.dir === 'ok'; }), 'own upload = small good sign, not a warning');
var cs2 = A.copySignals({ author: 'alice', text: 'Nice view', images: [im[0], im[0].replace('/mes/', '/carol/')] });
ok(cs2.some(function (s) { return s.dir === 'look' && /@carol/.test(s.detail) && /@mes/.test(s.detail); }), 'other uploaders flagged');
ok(cs2.every(function (s) { return s.dir !== 'ai' && s.dir !== 'real'; }), 'copy clues never claim AI / real');
ok(A.copySignals({ author: 'a', text: 'Photo by Jane on Unsplash', images: ['https://a.com/b.jpg'] }).some(function (s) { return /mentions a source/.test(s.title); }), 'credit line noticed');
ok(A.copySignals({ author: 'a', text: 'x', images: [] }).length === 0, 'no pictures, no picture clues');
/* distinctive sentences + phrase links */
var art = 'Hi. This is short. The volcanic archipelago supports endemic flightless cormorants that evolved remarkable diving adaptations over millennia. I went there. ' +
	'It was a lot of fun and we had a good time with all of the people there. Researchers documented unusual thermoregulation behaviour among juvenile marine iguanas during extended El Niño droughts. ' +
	'Visit https://example.com for the photos and the full story of the long trip we made. "This quoted sentence is long enough to be picked but it is a quote from someone." ' +
	'Geothermal vents beneath the caldera continuously reshape the surrounding mangrove ecosystems and lagoons. Bye.';
var ds = A.distinctiveSentences(art, 3);
ok(ds.length === 3 && ds.every(function (s) { return !/https?:|^"/.test(s) && s.split(' ').length >= 9; }), 'distinctive sentences: ' + JSON.stringify(ds));
ok(ds.some(function (s) { return /cormorants/.test(s); }) && !ds.some(function (s) { return /lot of fun/.test(s); }), 'unusual words beat plain ones');
ok(A.distinctiveSentences('Short one. Another.', 3).length === 0, 'nothing to search in short text');
var pl = A.phraseLinks('He said "hi" to me'); ok(pl.length === 4 && /%22He%20said%20hi%20to%20me%22/.test(pl[0].url) && /site%3Apeakd\.com/.test(pl[3].url), 'phrase links quote the sentence');
ok(A.hashLinks('DQmX').length === 1 && A.hashLinks('').length === 0, 'hash links');
/* page-text pictures (shared with api/page-text.js) */
var PT = require('../mes.fm/api/_page-text-lib.js'), pics = PT.pictures('<meta property="og:image" content="/og.jpg"><body><article>' + 'x'.repeat(500) + '<img src="a.png"><img src="data:x"><img data-src="https://c.com/d.webp"><img src="/icons/logo.svg"><img src="a.png"></article></body>', 'https://e.com/p/q');
ok(pics.join(' ') === 'https://e.com/og.jpg https://e.com/p/a.png https://c.com/d.webp', 'page-text pictures: ' + pics.join(' '));

console.log(fail ? fail + ' of ' + n + ' failed' : 'all ' + n + ' passed'); process.exit(fail ? 1 : 0);
