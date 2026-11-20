/* MES AI Detector: pure logic (node-testable), exposed as MESAID. It never gives a yes / no verdict: every finding is a "signal" with a direction
   (ai = points to AI, real = points to a camera / a person, info = neutral) and a strength (strong / medium / weak), and the page lists them.
   Pictures: C2PA / Content Credentials, IPTC digital source type, generator text chunks (Stable Diffusion, ComfyUI, NovelAI, InvokeAI...), XMP / EXIF traces
   (MESExif from the EXIF viewer for camera data when it is loaded). Videos: container metadata + byte traces. Text: statistics + typical AI wording + LM numbers. */
var MESAID = (function () {
	'use strict';
	var A = {};
	function latin1(u8, from, to) { var s = '', i, end = Math.min(to == null ? u8.length : to, u8.length), CH = 8192; for (i = from || 0; i < end; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(end, i + CH))); return s; }
	function utf8(u8, from, to) { var b = u8.subarray(from, to); try { return typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }).decode(b) : Buffer.from(b).toString('utf8'); } catch (e) { return latin1(u8, from, to); } }
	A.latin1 = latin1;
	/* The part of a file we search: whole file up to 24 MB, else the first 16 MB + the last 4 MB (metadata sits at either end). */
	A.haystack = function (u8) { if (u8.length <= 24 << 20) return latin1(u8); return latin1(u8, 0, 16 << 20) + '\n' + latin1(u8, u8.length - (4 << 20)); };
	function sig(dir, strength, title, detail, src) { return { dir: dir, strength: strength, title: title, detail: detail || '', src: src || '' }; }
	A.sig = sig;

	/* ---- generator names (C2PA claim generators, XMP CreatorTool, Software fields, video encoders) ---- */
	var GEN = [
		[/Adobe\s*Firefly|firefly/i, 'Adobe Firefly'], [/DALL[·\.\- ]?E/i, 'OpenAI DALL·E'], [/gpt-image|ChatGPT|OpenAI/i, 'OpenAI (ChatGPT image)'], [/\bSora\b/i, 'OpenAI Sora'],
		[/Midjourney/i, 'Midjourney'], [/Stable[\s_-]?Diffusion|stability\.ai|\bSDXL\b|\bSD3\b/i, 'Stable Diffusion'], [/ComfyUI/i, 'ComfyUI'], [/Automatic1111|stable-diffusion-webui/i, 'Stable Diffusion web UI'],
		[/NovelAI/i, 'NovelAI'], [/InvokeAI/i, 'InvokeAI'], [/Fooocus/i, 'Fooocus'], [/Leonardo\.?ai/i, 'Leonardo.Ai'], [/ideogram/i, 'Ideogram'], [/\bFlux(\.1)?[\s-](dev|schnell|pro)/i, 'FLUX'],
		[/Imagen|Gemini|Nano Banana|Made with Google AI|SynthID/i, 'Google (Gemini / Imagen)'], [/\bVeo\b/i, 'Google Veo'], [/Microsoft Designer|Bing Image Creator|Image Creator from Microsoft/i, 'Microsoft Designer / Bing'],
		[/Meta AI|Imagined with AI|Emu\b/i, 'Meta AI'], [/grok|Aurora by xAI|xAI/i, 'xAI Grok'], [/Runway(ML)?|Gen-[234]\b/i, 'Runway'], [/\bPika\b/i, 'Pika'], [/\bKling\b/i, 'Kling'],
		[/Luma (AI|Dream)|Dream Machine/i, 'Luma'], [/HeyGen/i, 'HeyGen'], [/Synthesia/i, 'Synthesia'], [/Hailuo|MiniMax/i, 'Hailuo / MiniMax'], [/Canva (AI|Magic)|Magic Media/i, 'Canva AI'],
		[/Generative (Fill|Expand)/i, 'Photoshop Generative Fill'], [/craiyon/i, 'Craiyon'], [/NightCafe/i, 'NightCafe'], [/playground(ai)?\.com|Playground v/i, 'Playground'], [/Krea/i, 'Krea'], [/Wan2\.|Hunyuan/i, 'Wan / Hunyuan']
	];
	var CAMS = /\b(Canon|Nikon|NIKON|SONY|Sony|FUJIFILM|Fujifilm|OLYMPUS|OM Digital|Panasonic|LEICA|Leica|PENTAX|RICOH|Hasselblad|Apple|samsung|Samsung|Google|Pixel|HUAWEI|Xiaomi|OnePlus|motorola|GoPro|DJI|Insta360)\b/;
	A.genNames = function (s) { var out = []; GEN.forEach(function (g) { if (g[0].test(s) && out.indexOf(g[1]) < 0) out.push(g[1]); }); return out; };

	/* ---- PNG text chunks ---- */
	A.pngChunks = function (u8) {
		var out = [], i = 8;
		if (!(u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47)) return out;
		while (i + 8 <= u8.length && out.length < 200) {
			var len = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0, ty = latin1(u8, i + 4, i + 8), st = i + 8, en = st + len;
			if (en > u8.length) break;
			if (ty === 'tEXt') { var z = u8.indexOf(0, st); if (z > st && z < en) out.push({ type: ty, key: latin1(u8, st, z), text: latin1(u8, z + 1, en) }); }
			else if (ty === 'iTXt') {
				var z1 = u8.indexOf(0, st); if (z1 > st && z1 < en) {
					var key = latin1(u8, st, z1), comp = u8[z1 + 1], p = z1 + 3, z2 = u8.indexOf(0, p), z3 = z2 >= 0 ? u8.indexOf(0, z2 + 1) : -1;
					if (z3 >= 0 && z3 < en) out.push({ type: ty, key: key, text: comp ? '' : utf8(u8, z3 + 1, en), compressed: !!comp, raw: comp ? u8.subarray(z3 + 1, en) : null });
				}
			} else if (ty === 'zTXt') { var zz = u8.indexOf(0, st); if (zz > st && zz < en) out.push({ type: ty, key: latin1(u8, st, zz), text: '', compressed: true, raw: u8.subarray(zz + 2, en) }); }
			else if (ty === 'caBX') out.push({ type: ty, key: 'C2PA', text: '' });
			else if (ty === 'eXIf') out.push({ type: ty, key: 'EXIF', text: '' });
			if (ty === 'IEND') break;
			i = en + 4;
		}
		return out;
	};
	/* "parameters" written by the Stable Diffusion web UI / Forge: prompt, then "Negative prompt:", then "Steps: 20, Sampler: ..., Seed: ..., Model: ..." */
	A.parseA1111 = function (t) {
		var r = { prompt: '', negative: '', settings: {} }, m = /\n(Steps: [\s\S]*)$/.exec(t), head = m ? t.slice(0, m.index) : t;
		var ni = head.indexOf('\nNegative prompt:'); r.prompt = (ni >= 0 ? head.slice(0, ni) : head).trim(); if (ni >= 0) r.negative = head.slice(ni + 17).trim();
		if (m) m[1].split(/,\s*(?=[A-Z][\w ]{1,30}: )/).forEach(function (kv) { var j = kv.indexOf(':'); if (j > 0) r.settings[kv.slice(0, j).trim()] = kv.slice(j + 1).trim(); });
		return r;
	};
	function genFromPngText(ch, push) {
		var k = ch.key.toLowerCase(), t = ch.text || '';
		if (k === 'parameters' && /Steps:\s*\d+/.test(t)) { var p = A.parseA1111(t), st = p.settings; push(sig('ai', 'strong', 'Stable Diffusion settings are saved in this picture', 'The PNG has a "parameters" note with the prompt and the generator settings' + (st.Model ? ' (model ' + st.Model + ')' : '') + (st.Sampler ? ', sampler ' + st.Sampler : '') + (st.Seed ? ', seed ' + st.Seed : '') + '.', 'PNG text')); return { kind: 'a1111', prompt: p.prompt, negative: p.negative, settings: st }; }
		if ((k === 'prompt' || k === 'workflow') && /class_type|"nodes"\s*:|KSampler|CheckpointLoader/i.test(t)) { push(sig('ai', 'strong', 'A ComfyUI workflow is saved in this picture', 'The PNG carries the node graph ComfyUI used to make it (' + ch.key + ').', 'PNG text')); var pr = /"text"\s*:\s*"((?:[^"\\]|\\.){3,600})"/.exec(t); return { kind: 'comfy', prompt: pr ? pr[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '' }; }
		if ((k === 'software' || k === 'source') && /NovelAI/i.test(t)) { push(sig('ai', 'strong', 'Made with NovelAI', 'The PNG says Software / Source: ' + t.slice(0, 80) + '.', 'PNG text')); return { kind: 'novelai' }; }
		if (k === 'comment' && /"(steps|sampler|uc|scale|seed)"\s*:/.test(t)) { push(sig('ai', 'strong', 'Image-generator settings in the PNG comment', 'A JSON comment with sampler / seed / steps settings, as NovelAI and others write it.', 'PNG text')); return { kind: 'json' }; }
		if (k === 'dream' || k === 'sd-metadata' || k === 'invokeai_metadata' || k === 'invokeai_graph') { push(sig('ai', 'strong', 'InvokeAI settings are saved in this picture', 'PNG note "' + ch.key + '".', 'PNG text')); return { kind: 'invoke' }; }
		if (k === 'fooocus_scheme' || /fooocus/i.test(t.slice(0, 300))) { push(sig('ai', 'strong', 'Fooocus settings are saved in this picture', '', 'PNG text')); return { kind: 'fooocus' }; }
		return null;
	}

	/* ---- XMP ---- */
	A.xmpBlocks = function (hay) { var out = [], re = /<x:xmpmeta[\s\S]{0,400000}?<\/x:xmpmeta>/g, m; while ((m = re.exec(hay)) && out.length < 8) out.push(m[0]); return out; };
	function xmpVal(x, name) {
		var re = new RegExp('(?:' + name + ')\\s*=\\s*"([^"]{0,600})"|<(?:' + name + ')>\\s*([\\s\\S]{0,1200}?)\\s*</(?:' + name + ')>', 'i'), m = re.exec(x);
		if (!m) return ''; var v = m[1] != null ? m[1] : m[2]; return v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	}
	A.xmpVal = xmpVal;
	var DST = {
		trainedAlgorithmicMedia: ['ai', 'strong', 'The file says it was made by AI', 'IPTC digital source type "trained algorithmic media": generated by a trained AI model.'],
		compositeWithTrainedAlgorithmicMedia: ['ai', 'strong', 'The file says part of it was made with AI', 'IPTC digital source type "composite with trained algorithmic media": an edit that used generative AI (e.g. Generative Fill).'],
		algorithmicallyEnhanced: ['ai', 'medium', 'The file says it was enhanced by an algorithm', 'IPTC digital source type "algorithmically enhanced".'],
		algorithmicMedia: ['ai', 'medium', 'The file says it was made by a computer program', 'IPTC digital source type "algorithmic media": computer-generated, not necessarily with AI.'],
		compositeSynthetic: ['ai', 'medium', 'The file says it is a synthetic composite', 'IPTC digital source type "composite synthetic".'],
		virtualRecording: ['info', 'weak', 'Recorded from a screen or a game', 'IPTC digital source type "virtual recording".'],
		digitalCapture: ['real', 'medium', 'The file says it was captured by a camera', 'IPTC digital source type "digital capture". Like all metadata, it can be written by anyone.'],
		computationalCapture: ['real', 'medium', 'The file says it was captured by a phone camera', 'IPTC digital source type "computational capture" (phone processing such as HDR).'],
		negativeFilm: ['real', 'medium', 'Scanned from film', 'IPTC digital source type "negative film".'], positiveFilm: ['real', 'medium', 'Scanned from film', 'IPTC digital source type "positive film".'],
		print: ['real', 'weak', 'Scanned from a print', 'IPTC digital source type "print".'], minorHumanEdits: ['real', 'weak', 'Small human edits', 'IPTC digital source type "minor human edits".'],
		composite: ['info', 'weak', 'A composite of several pictures', 'IPTC digital source type "composite".'], digitalArt: ['info', 'medium', 'Made by a person with digital tools', 'IPTC digital source type "digital art".'],
		dataDrivenMedia: ['info', 'weak', 'Data-driven media', 'IPTC digital source type "data-driven media" (charts, maps...).']
	};
	A.DST = DST;
	A.sourceTypes = function (hay) { var out = [], re = /digitalsourcetype\/(\w+)/gi, m; while ((m = re.exec(hay))) { var k = m[1]; for (var d in DST) if (d.toLowerCase() === k.toLowerCase() && out.indexOf(d) < 0) out.push(d); } return out; };

	/* ---- C2PA ---- */
	A.c2pa = function (hay) {
		var at = hay.search(/c2pa\.(claim|signature|assertions|manifest)|\x00jumb[\s\S]{0,40}c2pa|caBX/);
		if (at < 0 && !/urn:(uuid|c2pa):[\s\S]{0,60}c2pa|contentauth/i.test(hay)) return null;
		var from = Math.max(0, (at < 0 ? 0 : at) - 2000), part = hay.slice(from, from + 600000), r = { gens: [], actions: [], issuer: '', camera: '', sourceTypes: A.sourceTypes(part), text: '' };
		var cg = part.match(/claim_generator(?:_info)?[\s\S]{0,12}?([\x20-\x7e]{3,120})/g) || [];
		cg.forEach(function (s) { var v = s.replace(/^claim_generator(_info)?[^\x20-\x7e]*/, '').replace(/[^\x20-\x7e]/g, ' ').trim(); if (v && r.text.length < 600) r.text += v + ' | '; });
		var names = part.match(/(?:\bname|\bsoftwareAgent)[^\x20-\x7e]{1,6}([\x20-\x7e]{3,80})/g) || []; names.slice(0, 40).forEach(function (s) { r.text += s.replace(/^(name|softwareAgent)[^\x20-\x7e]*/, '') + ' | '; });
		(part.match(/c2pa\.(created|opened|edited|placed|cropped|resized|color_adjustments|filtered|converted|drawing|published|transcoded|removed|repackaged)/g) || []).forEach(function (a) { if (r.actions.indexOf(a) < 0) r.actions.push(a); });
		var iss = /(?:O=|organizationName[^\x20-\x7e]{1,4})([\x20-\x7e]{3,60})/.exec(part); if (iss) r.issuer = iss[1].replace(/[,\/].*$/, '').trim();
		r.gens = A.genNames(r.text + ' ' + r.issuer);
		var cam = CAMS.exec(r.text + ' ' + r.issuer); if (cam && !r.gens.length) r.camera = cam[1];
		return r;
	};

	/* ---- dimensions often used by generators (weak hint only) ---- */
	var AI_SIZES = { '1024x1024': 1, '1024x1792': 1, '1792x1024': 1, '1536x1024': 1, '1024x1536': 1, '512x512': 1, '768x768': 1, '832x1216': 1, '1216x832': 1, '896x1152': 1, '1152x896': 1, '768x1344': 1, '1344x768': 1, '640x1536': 1, '1536x640': 1, '2048x2048': 1, '1408x768': 1, '768x1408': 1, '1184x864': 1, '864x1184': 1, '1248x832': 1, '832x1248': 1 };
	A.sizeHint = function (w, h) { if (!w || !h) return null; if (AI_SIZES[w + 'x' + h]) return 'list'; if (w % 64 === 0 && h % 64 === 0 && w <= 2048 && h <= 2048 && w >= 512 && h >= 512) return 'mult64'; return null; };

	/* ---- the whole picture check. exif = MESExif.parse(u8) result or null; w / h = decoded size or 0 ---- */
	A.scanImage = function (u8, opt) {
		opt = opt || {}; var hay = A.haystack(u8), S = [], push = function (s) { S.push(s); }, info = { format: fmt(u8), gens: [], prompt: '', settings: null, texts: [], xmp: [], c2pa: null, camera: '' };
		/* C2PA */
		var c = A.c2pa(hay); info.c2pa = c;
		if (c) {
			var aiType = c.sourceTypes.filter(function (t) { return DST[t][0] === 'ai'; });
			if (c.gens.length || aiType.length) push(sig('ai', 'strong', 'Content Credentials say this was made with AI' + (c.gens.length ? ': ' + c.gens.join(', ') : ''), 'A C2PA manifest is attached' + (c.actions.length ? ' (actions: ' + c.actions.map(function (a) { return a.replace('c2pa.', ''); }).join(', ') + ')' : '') + (aiType.length ? ', with digital source type ' + aiType.join(', ') : '') + '. This page reads it but does not check its signature: confirm at contentcredentials.org/verify.', 'C2PA'));
			else if (c.camera) push(sig('real', 'strong', 'Content Credentials from a camera / phone: ' + c.camera, 'A C2PA manifest signed by the device maker is attached. Check the signature at contentcredentials.org/verify.', 'C2PA'));
			else push(sig('info', 'medium', 'Content Credentials (C2PA) are attached', 'The file records how it was made or edited' + (c.text ? ' (' + c.text.replace(/\s*\|\s*$/, '').slice(0, 160) + ')' : '') + '. Open it at contentcredentials.org/verify to see every step.', 'C2PA'));
		}
		/* IPTC digital source type (XMP or C2PA) */
		A.sourceTypes(hay).forEach(function (t) { if (c && c.sourceTypes.indexOf(t) >= 0 && DST[t][0] === 'ai') return; var d = DST[t]; push(sig(d[0], d[1], d[2], d[3], 'IPTC')); });
		/* PNG text chunks */
		A.pngChunks(u8).forEach(function (ch) {
			if (ch.type === 'caBX' || ch.type === 'eXIf') return;
			info.texts.push(ch); var g = genFromPngText(ch, push); if (g) { info.prompt = info.prompt || g.prompt || ''; if (g.settings) info.settings = g.settings; }
		});
		/* XMP fields */
		A.xmpBlocks(hay).forEach(function (x) {
			var tool = xmpVal(x, 'xmp:CreatorTool|xmp:creatortool'), desc = xmpVal(x, 'dc:description'), credit = xmpVal(x, 'photoshop:Credit|Iptc4xmpCore:Credit'), hist = xmpVal(x, 'stEvt:softwareAgent');
			info.xmp.push({ tool: tool, desc: desc, credit: credit, hist: hist });
			var g = A.genNames([tool, credit, hist].join(' | '));
			if (g.length) push(sig('ai', 'medium', 'The XMP data names an AI tool: ' + g.join(', '), 'Creator tool / credit / history: ' + [tool, credit, hist].filter(Boolean).join(' · ').slice(0, 200), 'XMP'));
			if (/Job ID:\s*[0-9a-f-]{20,}/i.test(desc) || /midjourney/i.test(desc)) push(sig('ai', 'strong', 'Midjourney job details in the description', desc.slice(0, 200), 'XMP'));
		});
		/* EXIF */
		var ex = opt.exif;
		if (ex && ex.rows) {
			var get = function (n) { var r = ex.rows.filter(function (q) { return q.name === n; })[0]; return r ? r.value : ''; };
			var make = get('Camera make'), model = get('Camera model'), sw = get('Software'), expo = get('Exposure time'), iso = get('ISO'), fn = get('Aperture (f-number)');
			if (make || model) { info.camera = (make + ' ' + model).trim(); push(sig('real', expo || iso || fn ? 'medium' : 'weak', 'Camera data: ' + info.camera, (expo || iso || fn ? 'Exposure settings are recorded (' + [expo, fn, iso ? 'ISO ' + iso : ''].filter(Boolean).join(', ') + '). ' : '') + 'Camera EXIF is a good sign but can be copied from another photo or typed in.', 'EXIF')); }
			var sg = A.genNames(sw + ' ' + get('Description') + ' ' + get('Artist') + ' ' + get('User comment'));
			if (sg.length) push(sig('ai', 'strong', 'The EXIF names an AI tool: ' + sg.join(', '), 'Software / description field: ' + (sw || get('Description')).slice(0, 160), 'EXIF'));
			else if (sw && /photoshop|lightroom|gimp|affinity|snapseed|picsart|facetune|pixelmator|canva/i.test(sw)) push(sig('info', 'weak', 'Edited with ' + sw, 'Editing is normal for real photos too; it only tells you the file passed through an editor.', 'EXIF'));
			if (ex.gps) push(sig('real', 'weak', 'GPS location recorded', 'Phones add GPS when they take a photo. Generators don\'t, but it can be added later.', 'EXIF'));
		}
		/* loose byte traces (C2PA missing but names in the file) */
		if (!S.some(function (s) { return s.dir === 'ai' && s.strength === 'strong'; })) {
			var head = hay.length > 3000000 ? hay.slice(0, 2000000) + hay.slice(-1000000) : hay, lg = [];
			[[/Made with Google AI|Google Generative AI|SynthID/, 'Google AI label'], [/Imagined with AI/, 'Meta "Imagined with AI" label'], [/Generated by (DALL|OpenAI|ChatGPT)/i, 'OpenAI label'], [/Midjourney/i, 'Midjourney'], [/\bgpt-image-\d/i, 'OpenAI gpt-image']].forEach(function (p) { if (p[0].test(head)) lg.push(p[1]); });
			if (lg.length) push(sig('ai', 'medium', 'AI tool names found inside the file', lg.join(', ') + '. Found as text in the file, outside the standard fields.', 'bytes'));
		}
		/* size hint */
		var sh = A.sizeHint(opt.w, opt.h);
		if (sh === 'list') push(sig('ai', 'weak', 'A size image generators often use (' + opt.w + ' × ' + opt.h + ')', 'Many generators output exactly this size. Plenty of real pictures are cropped to it too, so this alone means little.', 'size'));
		else if (sh === 'mult64') push(sig('info', 'weak', 'Both sides are multiples of 64 px (' + opt.w + ' × ' + opt.h + ')', 'Diffusion models work in 64-pixel steps. Weak hint.', 'size'));
		/* nothing at all */
		if (!S.some(function (s) { return s.src !== 'size'; })) push(sig('info', 'medium', 'No metadata to go on', 'This file has no camera data, no Content Credentials and no generator notes. That is normal for screenshots and pictures saved from social sites, which remove them: it says nothing either way.', 'none'));
		info.gens = A.genNames(S.map(function (s) { return s.title + ' ' + s.detail; }).join(' '));
		return { info: info, signals: dedupe(S) };
	};
	function dedupe(S) { var seen = {}; return S.filter(function (s) { var k = s.dir + s.title; if (seen[k]) return false; seen[k] = 1; return true; }); }
	function fmt(u8) {
		if (u8[0] === 0xFF && u8[1] === 0xD8) return 'JPEG'; if (u8[0] === 0x89 && u8[1] === 0x50) return 'PNG';
		var a = latin1(u8, 0, 12); if (a.slice(0, 4) === 'RIFF' && a.slice(8, 12) === 'WEBP') return 'WebP'; if (a.slice(0, 3) === 'GIF') return 'GIF';
		if (a.slice(4, 8) === 'ftyp') { var b = a.slice(8, 12); return /avif/.test(b) ? 'AVIF' : /heic|heix|mif1|heif/.test(b) ? 'HEIC' : /qt/.test(b) ? 'MOV' : 'MP4'; }
		if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) return 'WebM / MKV';
		if (a.slice(0, 2) === 'II' || a.slice(0, 2) === 'MM') return 'TIFF'; return 'Unknown';
	}
	A.format = fmt;

	/* ---- video container: MP4 / MOV box walk (top levels) + byte traces ---- */
	A.mp4Boxes = function (u8, maxDepth) {
		var out = [], CONT = { moov: 1, udta: 1, meta: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, ilst: 1, keys: 0, edts: 1 };
		function walk(from, to, depth, path) {
			var i = from, n = 0;
			while (i + 8 <= to && n++ < 400) {
				var size = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0, ty = latin1(u8, i + 4, i + 8), hdr = 8;
				if (size === 1 && i + 16 <= to) { size = ((u8[i + 12] << 24) | (u8[i + 13] << 16) | (u8[i + 14] << 8) | u8[i + 15]) >>> 0; if (u8[i + 8] | u8[i + 9] | u8[i + 10] | u8[i + 11]) size = to - i; hdr = 16; }
				if (size === 0) size = to - i; if (size < hdr || i + size > to + 8) break;
				var end = Math.min(i + size, to), p = path ? path + '/' + ty : ty; out.push({ type: ty, path: p, start: i, hdr: hdr, end: end });
				if (CONT[ty] && depth < (maxDepth || 6)) walk(i + hdr + (ty === 'meta' && latin1(u8, i + hdr + 4, i + hdr + 8) !== 'hdlr' ? 4 : 0), end, depth + 1, p);
				i += size;
			}
		}
		walk(0, u8.length, 0, ''); return out;
	};
	A.scanVideo = function (u8, opt) {
		opt = opt || {}; var S = [], push = function (s) { S.push(s); }, info = { format: fmt(u8), encoder: '', make: '', model: '', software: '', created: '', location: '', brand: '', c2pa: null, size: opt.size || u8.length };
		if (/MP4|MOV/.test(info.format)) {
			info.brand = latin1(u8, 8, 12).trim();
			var boxes = A.mp4Boxes(u8), keys = [];
			boxes.forEach(function (b) {
				if (b.type === 'mvhd') { var o = b.start + b.hdr, u32 = function (q) { return ((u8[q] << 24) | (u8[q + 1] << 16) | (u8[q + 2] << 8) | u8[q + 3]) >>> 0; }, t = u8[o] === 1 ? u32(o + 4) * 4294967296 + u32(o + 8) : u32(o + 4); if (t > 0) { var d = new Date((t - 2082844800) * 1000); if (d.getUTCFullYear() > 1990 && d.getUTCFullYear() < 2100) info.created = d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC'; } }
				if (b.type === 'keys') { var n = (u8[b.start + 12] << 24 | u8[b.start + 13] << 16 | u8[b.start + 14] << 8 | u8[b.start + 15]) >>> 0, p = b.start + 16; for (var k = 0; k < n && k < 60 && p + 8 <= b.end; k++) { var ks = (u8[p] << 24 | u8[p + 1] << 16 | u8[p + 2] << 8 | u8[p + 3]) >>> 0; if (ks < 8) break; keys.push(latin1(u8, p + 8, p + ks)); p += ks; } }
				var parent = b.path.split('/').slice(-2, -1)[0];
				if (parent === 'ilst' || parent === 'udta') {
					var dat = A.findData(u8, b.start + b.hdr, b.end), ty = b.type;
					if (parent === 'ilst' && keys.length && /^\x00/.test(ty)) { var key = keys[((u8[b.start + 4] << 24 | u8[b.start + 5] << 16 | u8[b.start + 6] << 8 | u8[b.start + 7]) >>> 0) - 1] || ''; ty = /make$/.test(key) ? '\u00a9mak' : /model$/.test(key) ? '\u00a9mod' : /software$/.test(key) ? 'soft' : /ISO6709$/.test(key) ? '\u00a9xyz' : /creationdate$/.test(key) ? '\u00a9day' : /encoder|tool/i.test(key) ? '\u00a9too' : ty; }
					if (ty === '\u00a9too' || ty === '\u00a9enc' || ty === '\u00a9swr') info.encoder = info.encoder || dat;
					else if (ty === 'soft') info.software = dat; else if (ty === '\u00a9mak') info.make = dat; else if (ty === '\u00a9mod') info.model = dat; else if (ty === '\u00a9xyz') info.location = dat; else if (ty === '\u00a9day') info.created = dat || info.created;
				}
			});
		}
		var hay = A.haystack(u8), c = A.c2pa(hay); info.c2pa = c;
		if (!info.encoder) { var lv = /Lavf\d+\.\d+\.\d+|Lavc\d+\.\d+/.exec(hay); if (lv) info.encoder = lv[0]; }
		if (c) { var aiT = c.sourceTypes.filter(function (t) { return DST[t][0] === 'ai'; }); if (c.gens.length || aiT.length) push(sig('ai', 'strong', 'Content Credentials say this video was made with AI' + (c.gens.length ? ': ' + c.gens.join(', ') : ''), 'A C2PA manifest is attached. Check its signature at contentcredentials.org/verify.', 'C2PA')); else if (c.camera) push(sig('real', 'strong', 'Content Credentials from a camera / phone: ' + c.camera, '', 'C2PA')); else push(sig('info', 'medium', 'Content Credentials (C2PA) are attached', 'Open it at contentcredentials.org/verify to see every step.', 'C2PA')); }
		A.sourceTypes(hay).forEach(function (t) { if (c && c.sourceTypes.indexOf(t) >= 0) return; var d = DST[t]; push(sig(d[0], d[1], d[2], d[3], 'IPTC')); });
		var g = A.genNames([info.encoder, info.software, info.make, info.model].join(' | '));
		if (g.length) push(sig('ai', 'strong', 'The video metadata names an AI tool: ' + g.join(', '), 'Encoder / software: ' + (info.software || info.encoder), 'container'));
		if ((info.make || info.model) && !g.length) push(sig('real', 'medium', 'Recorded on: ' + (info.make + ' ' + info.model).trim(), 'Phones and cameras write their make and model into the video. It can be copied, but generators don\'t add it.', 'container'));
		if (info.location) push(sig('real', 'weak', 'A recording location is saved', info.location, 'container'));
		if (/^Lav/.test(info.encoder)) push(sig('info', 'weak', 'Re-encoded with FFmpeg (' + info.encoder + ')', 'The file was converted or downloaded by a tool, which usually removes the original camera / generator data.', 'container'));
		if (!g.length && !c) { var lg = A.genNames(hay.slice(0, 200000) + hay.slice(-200000)).filter(function (n) { return !/Google \(|Meta AI|xAI/.test(n); }); if (lg.length) push(sig('ai', 'medium', 'AI tool names found inside the file', lg.join(', '), 'bytes')); }
		if (!S.length) push(sig('info', 'medium', 'No metadata to go on', 'No camera make, no Content Credentials, no generator notes. Videos downloaded from YouTube, X, TikTok and others lose them, so this says nothing either way.', 'none'));
		return { info: info, signals: dedupe(S) };
	};
	A.findData = function (u8, from, to) { for (var i = from; i + 16 <= to; i++) if (u8[i + 4] === 0x64 && u8[i + 5] === 0x61 && u8[i + 6] === 0x74 && u8[i + 7] === 0x61) { var sz = (u8[i] << 24 | u8[i + 1] << 16 | u8[i + 2] << 8 | u8[i + 3]) >>> 0; return utf8(u8, i + 16, Math.min(i + sz, to)).replace(/\u0000/g, '').trim(); } var s = latin1(u8, from + 4, to).replace(/[^\x20-\x7e]/g, '').trim(); return s.slice(0, 200); };

	/* ---- classifier output -> P(AI) ---- */
	A.clsProb = function (out) {
		if (!out || !out.length) return null; var ai = 0, real = 0;
		out.forEach(function (o) { var l = String(o.label).toLowerCase(); if (/fake|artificial|ai|generated|synthetic/.test(l)) ai += o.score; else if (/real|human|natural/.test(l)) real += o.score; });
		return ai + real > 0 ? ai / (ai + real) : null;
	};
	A.clsSignal = function (p, frames) {
		if (p == null) return null; var pct = Math.round(p * 100), what = frames ? 'average over ' + frames + ' frames' : 'this picture';
		var d = 'A small open model (MIT, trained in 2024) scored ' + what + ' at ' + pct + '% "AI". These models are often wrong: they miss newer generators and can flag edited or compressed real photos. Treat it as one weak hint.';
		if (p >= 0.85) return sig('ai', 'weak', 'The model leans AI (' + pct + '%)', d, 'model');
		if (p <= 0.15) return sig('real', 'weak', 'The model leans real (' + (100 - pct) + '% real)', d, 'model');
		return sig('info', 'weak', 'The model is unsure (' + pct + '% AI)', d, 'model');
	};

	/* ---- summary: never a verdict, just what the evidence adds up to ---- */
	var W = { strong: 3, medium: 1.5, weak: 0.5 };
	A.summary = function (S) {
		var ai = 0, real = 0, strongAi = false, strongReal = false;
		S.forEach(function (s) { var w = W[s.strength] || 0; if (s.dir === 'ai') { ai += w; if (s.strength === 'strong') strongAi = true; } if (s.dir === 'real') { real += w; if (s.strength === 'strong') strongReal = true; } });
		var level, text;
		if (strongAi && !strongReal) { level = 'ai'; text = 'The file itself says it was made or edited with AI.'; }
		else if (strongAi && strongReal) { level = 'mixed'; text = 'The evidence points both ways. Look at each item below.'; }
		else if (strongReal) { level = 'real'; text = 'Content Credentials from a camera or phone are attached. Check the signature to be sure.'; }
		else if (ai >= 1.5 && ai > real * 1.5) { level = 'lean-ai'; text = 'Some hints point to AI, none of them conclusive.'; }
		else if (real >= 1.5 && real > ai * 1.5) { level = 'lean-real'; text = 'Some hints point to a real camera, none of them conclusive.'; }
		else if (ai + real === 0) { level = 'none'; text = 'Nothing in the file points either way.'; }
		else { level = 'unclear'; text = 'The hints are weak or mixed.'; }
		return { level: level, text: text, ai: ai, real: real };
	};

	/* ---- text ---- */
	A.sentences = function (t) { return String(t).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])["'”’)\]]*\s+(?=["'“‘(\[]?[A-Z0-9])/).map(function (s) { return s.trim(); }).filter(function (s) { return /[A-Za-z]{2}/.test(s); }); };
	A.words = function (t) { return (String(t).toLowerCase().match(/[a-z][a-z'’-]*/g) || []); };
	var PHRASES = [
		[/\bas an ai( language model)?\b|\bi('m| am) an ai\b|\bas a large language model\b/i, 'strong', '"As an AI language model"'],
		[/\b(certainly|sure|absolutely)!? here('s| is| are)\b/i, 'medium', '"Certainly! Here is..." (chat-reply opener)'], [/\[(your name|insert [^\]]{1,30}|name|company name|date)\]/i, 'medium', 'Placeholder like [Your Name]'],
		[/\bi hope this (email|message|helps|finds you well)\b/i, 'weak', '"I hope this helps / finds you well"'], [/\bknowledge cutoff\b|\bmy training data\b/i, 'strong', 'Mentions its training data / cutoff'],
		[/\bregenerate response\b/i, 'medium', '"Regenerate response" (copied chat button)']
	];
	var WORDS = ['delve', 'delves', 'delving', 'tapestry', 'testament', 'realm', 'intricate', 'multifaceted', 'pivotal', 'foster', 'fostering', 'seamless', 'seamlessly', 'leverage', 'leveraging', 'elevate', 'unlock', 'unleash', 'embark', 'navigate', 'navigating', 'landscape', 'showcasing', 'showcase', 'underscore', 'underscores', 'vibrant', 'bustling', 'meticulous', 'meticulously', 'commendable', 'invaluable', 'paramount', 'nuanced', 'holistic', 'robust', 'crucial', 'furthermore', 'moreover', 'additionally', 'ultimately', 'comprehensive', 'enhance', 'enhancing', 'harness', 'resonate', 'resonates', 'captivating', 'boasts', 'beacon', 'interplay', 'ever-evolving', 'game-changer', 'transformative'];
	var GRAMS = [/\bit('s| is) (important|worth|crucial) (to note|noting|to remember)\b/gi, /\bin today's (fast-paced|digital|ever-changing)\b/gi, /\bplays? a (crucial|pivotal|vital|key) role\b/gi, /\bin conclusion\b/gi, /\bnot only\b[^.]{3,80}\bbut also\b/gi, /\ba testament to\b/gi, /\bwhether you('re| are)\b/gi, /\bdive (deep|deeper|into)\b/gi, /\bthe world of\b/gi, /\bstands? as a\b/gi, /\bnavigat(e|ing) the (complexities|challenges|world)\b/gi, /\bwhen it comes to\b/gi, /\bin the realm of\b/gi, /\bembark on a journey\b/gi, /\bbelow is a\b|\bhere's a breakdown\b/gi];
	A.WORDS = WORDS;
	A.textStats = function (t) {
		t = String(t || ''); var sents = A.sentences(t), words = A.words(t), n = words.length, lens = sents.map(function (s) { return A.words(s).length; }).filter(function (x) { return x > 0; });
		var mean = lens.reduce(function (a, b) { return a + b; }, 0) / (lens.length || 1), sd = Math.sqrt(lens.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (lens.length || 1));
		var win = 100, ttr = 0, cnt = 0; if (n >= win) { for (var i = 0; i + win <= n; i += 25) { var set = {}; for (var j = i; j < i + win; j++) set[words[j]] = 1; ttr += Object.keys(set).length / win; cnt++; } ttr /= cnt; } else if (n) { var s0 = {}; words.forEach(function (w) { s0[w] = 1; }); ttr = Object.keys(s0).length / n; }
		var hits = {}, wcount = 0; words.forEach(function (w) { var ww = w.replace(/[’]/g, "'"); if (WORDS.indexOf(ww) >= 0) { hits[ww] = (hits[ww] || 0) + 1; wcount++; } });
		var grams = []; GRAMS.forEach(function (re) { var m = t.match(re); if (m) grams.push({ text: m[0].toLowerCase(), n: m.length }); });
		var phrases = []; PHRASES.forEach(function (p) { var m = p[0].exec(t); if (m) phrases.push({ text: m[0], strength: p[1], label: p[2] }); });
		var tri = {}, rep = 0; for (var k = 0; k + 2 < n; k++) { var key = words[k] + ' ' + words[k + 1] + ' ' + words[k + 2]; tri[key] = (tri[key] || 0) + 1; if (tri[key] === 2) rep++; }
		var em = (t.match(/—/g) || []).length, curly = (t.match(/[“”‘’]/g) || []).length, bullets = (t.match(/^\s*([-*•]|\d+\.)\s+/gm) || []).length, heads = (t.match(/^\s*#{1,4}\s|\*\*[^*\n]{2,60}\*\*:?/gm) || []).length;
		var starts = {}; sents.forEach(function (s) { var f = (A.words(s)[0] || ''); starts[f] = (starts[f] || 0) + 1; }); var topStart = Object.keys(starts).sort(function (a, b) { return starts[b] - starts[a]; })[0] || '';
		return { chars: t.length, words: n, sentences: sents.length, lens: lens, mean: mean, sd: sd, cv: mean ? sd / mean : 0, ttr: ttr, aiWords: hits, aiWordCount: wcount, aiWordRate: n ? wcount / n * 1000 : 0, grams: grams, phrases: phrases, repeats: rep, emDash: em, emRate: n ? em / n * 1000 : 0, curly: curly, bullets: bullets, heads: heads, topStart: topStart, topStartShare: sents.length ? (starts[topStart] || 0) / sents.length : 0 };
	};
	A.textSignals = function (st) {
		var S = [];
		if (st.words < 40) { S.push(sig('info', 'medium', 'Too short to judge', 'Paste at least 150 words for the statistics to mean anything. Even then they are weak.', 'stats')); }
		st.phrases.forEach(function (p) { S.push(sig('ai', p.strength, 'Chatbot leftover: ' + p.label, 'Found: "' + p.text + '". Text pasted straight from a chatbot often keeps these.', 'wording')); });
		if (st.words >= 40) {
			if (st.sentences >= 8 && st.cv < 0.33) S.push(sig('ai', 'weak', 'Very even sentence lengths', 'Sentence length varies by only ' + Math.round(st.cv * 100) + '% (people usually vary more, often 50%+). AI text tends to be even; so is careful formal writing.', 'stats'));
			else if (st.sentences >= 8 && st.cv > 0.62) S.push(sig('real', 'weak', 'Uneven sentence lengths', 'Sentence length varies by ' + Math.round(st.cv * 100) + '%, which is typical of people writing quickly. Easy to fake.', 'stats'));
			var hitList = Object.keys(st.aiWords).sort(function (a, b) { return st.aiWords[b] - st.aiWords[a]; }), gramN = st.grams.reduce(function (a, g) { return a + g.n; }, 0), rate = (st.aiWordCount + gramN * 2) / st.words * 1000;
			if (rate >= 12 && st.aiWordCount + gramN >= 3) S.push(sig('ai', rate >= 22 ? 'medium' : 'weak', 'Lots of words chatbots overuse', hitList.slice(0, 10).map(function (w) { return w + (st.aiWords[w] > 1 ? ' ×' + st.aiWords[w] : ''); }).concat(st.grams.map(function (g) { return '"' + g.text + '"'; })).join(', ') + ' (' + rate.toFixed(1) + ' per 1,000 words). People use these words too.', 'wording'));
			else if (st.words >= 150 && st.aiWordCount + gramN === 0) S.push(sig('real', 'weak', 'None of the words chatbots overuse', 'No "delve", "tapestry", "it\'s important to note"... A good sign, but easy to avoid on purpose.', 'wording'));
			if (st.emRate >= 6 && st.emDash >= 3) S.push(sig('ai', 'weak', 'Many em dashes (—)', st.emDash + ' em dashes. Chatbots use them a lot, and so do many good writers.', 'style'));
			if (st.heads >= 2 && st.bullets >= 3) S.push(sig('info', 'weak', 'Headings and bullet lists', 'Chat answers are often formatted like this; so are notes and articles.', 'style'));
			if (st.ttr && st.words >= 200 && st.ttr < 0.55) S.push(sig('ai', 'weak', 'Small range of words', 'Only ' + Math.round(st.ttr * 100) + '% different words in each 100 (often 60-75% for people).', 'stats'));
		}
		return S;
	};
	/* Language-model numbers. lp = log-probability (natural log) of each actual next token, rank = its rank among all tokens (1 = most likely). */
	A.lmStats = function (lp, rank) {
		var n = lp.length; if (!n) return null; var mean = 0, i; for (i = 0; i < n; i++) mean += lp[i]; mean /= n;
		var sd = 0; for (i = 0; i < n; i++) sd += (lp[i] - mean) * (lp[i] - mean); sd = Math.sqrt(sd / n);
		var top1 = 0, top10 = 0; for (i = 0; i < n; i++) { if (rank[i] <= 1) top1++; if (rank[i] <= 10) top10++; }
		return { tokens: n, ppl: Math.exp(-mean), sd: sd, top1: top1 / n, top10: top10 / n };
	};
	A.lmSignal = function (m) {
		if (!m) return null; var d = 'Measured with distilGPT-2, a small 2019 model, on the first ' + m.tokens + ' tokens: perplexity ' + m.ppl.toFixed(1) + ', ' + Math.round(m.top10 * 100) + '% of words were in its top-10 guesses. Low "surprise" is typical of AI text, but also of simple, formal or very common text (and of text written in a style the model knows). Newer chatbots fool it easily.';
		if (m.tokens < 40) return sig('info', 'weak', 'Too few words for the language model', d, 'model');
		if (m.ppl < 22 && m.top10 > 0.68) return sig('ai', 'weak', 'Very predictable to a language model', d, 'model');
		if (m.ppl > 70 || m.top10 < 0.5) return sig('real', 'weak', 'Surprising to a language model', d, 'model');
		return sig('info', 'weak', 'In between for the language model', d, 'model');
	};
	/* The prompt the page copies for a paid opinion from MES AI. */
	A.aiPrompt = function (text, signals) {
		var ev = (signals || []).filter(function (s) { return s.src !== 'none'; }).map(function (s) { return '- ' + s.title + ' (' + s.dir + ', ' + s.strength + ')'; }).join('\n');
		return 'Please judge whether the text below was written by a person, by an AI chatbot, or by a person with AI help. Give your honest opinion with the specific reasons (wording, structure, facts, tone) and say how sure you can be. Don\'t give a percentage you can\'t justify.' + (ev ? '\n\nSignals an automatic check found (weak on their own):\n' + ev : '') + '\n\n--- TEXT ---\n' + String(text).slice(0, 12000);
	};

	/* ---- image views (pure array maths; the page draws them) ---- */
	/* error level: |original - re-saved JPEG| amplified. a, b = RGBA arrays of the same size. */
	A.elaMap = function (a, b, gain) { var out = new Uint8ClampedArray(a.length), g = gain || 15, mx = 0; for (var i = 0; i < a.length; i += 4) { for (var c = 0; c < 3; c++) { var d = Math.abs(a[i + c] - b[i + c]) * g; out[i + c] = d; if (d > mx) mx = d; } out[i + 3] = 255; } return { data: out, max: Math.min(255, mx) }; };
	/* noise residual: luminance minus a 3x3 mean, amplified around grey; also returns per-block noise level spread (how even the noise is). */
	A.noiseMap = function (d, w, h, gain) {
		var g = gain || 8, L = new Float32Array(w * h), out = new Uint8ClampedArray(w * h * 4), i, x, y;
		for (i = 0; i < w * h; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
		var B = 16, bw = Math.ceil(w / B), bh = Math.ceil(h / B), bs = new Float64Array(bw * bh), bn = new Float64Array(bw * bh);
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
			var s = 0, c = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += L[yy * w + xx]; c++; } }
			var r = L[y * w + x] - s / c, v = 128 + r * g, o = (y * w + x) * 4; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
			var bi = ((y / B) | 0) * bw + ((x / B) | 0); bs[bi] += r * r; bn[bi]++;
		}
		var lv = []; for (i = 0; i < bs.length; i++) if (bn[i] > 32) lv.push(Math.sqrt(bs[i] / bn[i]));
		lv.sort(function (p, q) { return p - q; }); var med = lv.length ? lv[lv.length >> 1] : 0, p10 = lv.length ? lv[Math.floor(lv.length * 0.1)] : 0, p90 = lv.length ? lv[Math.floor(lv.length * 0.9)] : 0;
		return { data: out, median: med, p10: p10, p90: p90 };
	};
	/* frame times for a video: n evenly spread, avoiding the very start / end */
	A.frameTimes = function (dur, n) { if (!(dur > 0)) return [0]; n = Math.max(1, Math.min(n || 6, 24)); var out = []; for (var i = 0; i < n; i++) out.push(Math.round(dur * (i + 0.5) / n * 100) / 100); return out; };
	return A;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESAID;
