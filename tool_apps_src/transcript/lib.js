/* MES Transcript & Timestamps (mes.fm/transcript): pure helpers, no DOM. Runs in node for the tests (require).
   A cue is [start seconds, duration seconds, text]. */
(function (root) {
	"use strict";
	var X = {};

	/* ---------- time ---------- */
	X.fmt = function (sec, hours) {
		sec = Math.max(0, Math.floor(+sec || 0));
		var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
		var ss = (s < 10 ? "0" : "") + s;
		return h || hours ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
	};
	function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
	X.stamp = function (sec, sep) { /* 00:01:02,345 (SRT) or 00:01:02.345 (VTT) */
		var ms = Math.max(0, Math.round((+sec || 0) * 1000));
		return pad(Math.floor(ms / 3600000), 2) + ":" + pad(Math.floor(ms / 60000) % 60, 2) + ":" + pad(Math.floor(ms / 1000) % 60, 2) + (sep || ",") + pad(ms % 1000, 3);
	};
	X.parseTime = function (s) { /* "1:02:03", "62:03", "3.5", "01:02:03,500", "1h2m3s" -> seconds or NaN */
		s = String(s == null ? "" : s).trim().replace(",", ".");
		var m = s.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i);
		if (m && m[0] && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
		if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) return NaN;
		return s.split(":").reduce(function (a, p) { return a * 60 + +p; }, 0);
	};

	/* ---------- cues ---------- */
	/* sorted, trimmed, no empty text; each cue ends no later than the next starts (auto captions overlap by design) */
	X.norm = function (cues) {
		var c = (cues || []).filter(function (x) { return x && isFinite(x[0]) && String(x[2] || "").trim(); })
			.map(function (x) { return [Math.max(0, +x[0]), Math.max(0, +x[1] || 0), String(x[2]).replace(/\s+/g, " ").trim()]; })
			.sort(function (a, b) { return a[0] - b[0]; });
		for (var i = 0; i < c.length; i++) {
			var nx = c[i + 1] ? c[i + 1][0] : Infinity;
			if (!c[i][1]) c[i][1] = isFinite(nx) ? Math.min(nx - c[i][0], 6) : 3;
			if (c[i][0] + c[i][1] > nx) c[i][1] = Math.max(0.01, nx - c[i][0]);
			c[i][1] = Math.round(c[i][1] * 1000) / 1000;
		}
		return c;
	};
	X.end = function (cues) { var l = cues[cues.length - 1]; return l ? l[0] + l[1] : 0; };
	X.text = function (cues) { return cues.map(function (c) { return c[2]; }).join(" ").replace(/\s+/g, " ").trim(); };
	X.wordCount = function (cues) { var t = X.text(cues); return t ? t.split(" ").length : 0; };
	X.hasPunct = function (cues) { var t = X.text(cues), n = (t.match(/[.?!](\s|$)/g) || []).length; return n >= Math.max(2, t.length / 600); };

	/* paragraphs: break at a pause >= gap s, or after maxSec at a sentence end (or at maxSec*1.6 when captions have no punctuation) */
	X.paragraphs = function (cues, o) {
		o = o || {}; var gap = o.gap || 2.2, maxSec = o.maxSec || 45, out = [], cur = null, punct = X.hasPunct(cues);
		cues.forEach(function (c, i) {
			var prev = cues[i - 1];
			var brk = !cur || (prev && c[0] - (prev[0] + prev[1]) >= gap && c[0] - cur.t > 8) ||
				(c[0] - cur.t >= maxSec && (punct ? /[.?!]["')\]]?$/.test(cur.text) : true) && (punct || c[0] - cur.t >= maxSec * 1.6 || (prev && c[0] - (prev[0] + prev[1]) > 0.6)));
			if (brk) { cur = { t: c[0], text: c[2], i: i }; out.push(cur); } else cur.text += " " + c[2];
		});
		out.forEach(function (p) { p.text = p.text.replace(/\s+/g, " ").trim(); if (!punct && p.text) p.text = p.text.charAt(0).toUpperCase() + p.text.slice(1); });
		return out;
	};

	/* ---------- reading pasted / dropped caption text ---------- */
	X.parseText = function (text) {
		var s = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
		if (!s) return { cues: [], kind: "empty" };
		if (/^\s*[\[{]/.test(s)) { try { var j = JSON.parse(s); var arr = Array.isArray(j) ? j : (j.cues || j.chunks || j.segments || []); var cj = arr.map(function (x) { if (Array.isArray(x)) return x; var st = x.start != null ? x.start : (x.timestamp ? x.timestamp[0] : x.t); var en = x.end != null ? x.end : (x.timestamp ? x.timestamp[1] : null); return [+st, en != null ? en - st : +(x.dur || x.duration || 0), x.text || ""]; }); if (cj.length) return { cues: X.norm(cj), kind: "json" }; } catch (e) { /* not JSON */ } }
		var lines = s.split("\n"), cues = [], m, i;
		/* SRT / VTT: "00:00:01,000 --> 00:00:04,000" */
		var ARROW = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
		if (lines.some(function (l) { return ARROW.test(l); })) {
			for (i = 0; i < lines.length; i++) {
				if (!(m = lines[i].match(ARROW))) continue;
				var st2 = X.parseTime(m[1]), en2 = X.parseTime(m[2]), body = [];
				for (i++; i < lines.length && lines[i].trim() && !ARROW.test(lines[i]); i++) body.push(lines[i]);
				if (body.length && /^\d+$/.test(body[body.length - 1].trim()) && lines[i] && ARROW.test(lines[i])) body.pop();
				i--;
				var tx = body.join(" ").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
				if (tx) cues.push([st2, en2 - st2, tx]);
			}
			/* VTT rolling captions repeat the previous line: keep only the new part */
			for (i = 1; i < cues.length; i++) { var a = cues[i - 1][2], b = cues[i][2]; if (b.indexOf(a) === 0 && b.length > a.length) cues[i][2] = b.slice(a.length).trim(); else if (a === b) cues[i][2] = ""; }
			return { cues: X.norm(cues), kind: s.indexOf("WEBVTT") === 0 ? "vtt" : "srt" };
		}
		/* YouTube's "Show transcript" panel copied: "0:01" on its own line, then the words (also "0:01 words" on one line, "[0:01] words") */
		var STAMP = /^\s*\[?(\d{1,2}(?::\d{2}){1,2})\]?\s*(?:[-–—:]\s*)?(.*)$/, pend = null;
		for (i = 0; i < lines.length; i++) {
			var L = lines[i].trim(); if (!L) continue;
			if ((m = L.match(STAMP)) && isFinite(X.parseTime(m[1]))) {
				if (pend && pend.text) cues.push([pend.t, 0, pend.text]);
				pend = { t: X.parseTime(m[1]), text: m[2].trim() };
				continue;
			}
			if (/^\d+ (seconds?|minutes?|hours?)(, \d+ (seconds?|minutes?))*$/i.test(L)) continue; /* the panel's screen-reader duplicate */
			if (pend) pend.text += (pend.text ? " " : "") + L;
		}
		if (pend && pend.text) cues.push([pend.t, 0, pend.text]);
		if (cues.length >= 2) return { cues: X.norm(cues), kind: "stamps" };
		/* plain text: one cue, no times */
		return { cues: [[0, 0, s.replace(/\s+/g, " ")]], kind: "plain" };
	};

	/* ---------- export ---------- */
	X.toSRT = function (cues) { return cues.map(function (c, i) { return (i + 1) + "\n" + X.stamp(c[0]) + " --> " + X.stamp(c[0] + c[1]) + "\n" + c[2] + "\n"; }).join("\n"); };
	X.toVTT = function (cues) { return "WEBVTT\n\n" + cues.map(function (c) { return X.stamp(c[0], ".") + " --> " + X.stamp(c[0] + c[1], ".") + "\n" + c[2] + "\n"; }).join("\n"); };
	X.toTXT = function (cues, o) {
		o = o || {}; var long = X.end(cues) >= 3600;
		if (o.paras) return X.paragraphs(cues).map(function (p) { return (o.stamps ? "[" + X.fmt(p.t, long) + "] " : "") + p.text; }).join("\n\n");
		if (o.stamps) return cues.map(function (c) { return X.fmt(c[0], long) + " " + c[2]; }).join("\n");
		return X.text(cues);
	};
	X.toJSON = function (cues, meta) { return JSON.stringify(Object.assign({}, meta || {}, { cues: cues.map(function (c) { return { start: c[0], end: Math.round((c[0] + c[1]) * 1000) / 1000, text: c[2] }; }) }), null, 1); };

	/* ---------- chapters ---------- */
	/* chapter lines already in a description: "0:00 Intro", "1:02:03 - Part two", "(4:05) Title" */
	X.descChapters = function (desc) {
		var out = [], m, RE = /^\s*[\[(]?(\d{1,2}(?::\d{2}){1,2})[\])]?\s*[-–—:|]?\s*(.{2,120}?)\s*$/;
		String(desc || "").split(/\n/).forEach(function (l) {
			if ((m = l.match(RE))) { var t = X.parseTime(m[1]); if (isFinite(t) && !/^\d/.test(m[2])) out.push({ t: t, title: m[2].replace(/^[-–—:|]\s*/, "") }); }
			else if ((m = l.match(/^\s*(.{2,120}?)\s*[-–—:|]\s*(\d{1,2}(?::\d{2}){1,2})\s*$/))) { var t2 = X.parseTime(m[2]); if (isFinite(t2)) out.push({ t: t2, title: m[1] }); }
		});
		out.sort(function (a, b) { return a.t - b.t; });
		return out.length >= 2 ? out : [];
	};
	/* YouTube's rules for chapters in a description: first at 0:00, at least 3, each at least 10 seconds, in order */
	X.checkChapters = function (ch, len) {
		var why = [];
		if (!ch.length) return ["No chapters yet."];
		if (ch[0].t !== 0) why.push("The first chapter must start at 0:00.");
		if (ch.length < 3) why.push("YouTube needs at least 3 chapters.");
		for (var i = 1; i < ch.length; i++) { if (ch[i].t <= ch[i - 1].t) why.push("Chapter " + (i + 1) + " is not after chapter " + i + "."); else if (ch[i].t - ch[i - 1].t < 10) why.push("Chapter " + i + " is shorter than 10 seconds."); }
		if (len && ch.length && len - ch[ch.length - 1].t < 10) why.push("The last chapter is shorter than 10 seconds.");
		return why;
	};
	X.fmtChapters = function (ch, o) {
		o = o || {}; var long = !!o.hours;
		return ch.map(function (c) { return (o.brackets ? "(" + X.fmt(c.t, long) + ")" : X.fmt(c.t, long)) + (o.dash ? " - " : " ") + c.title; }).join("\n");
	};

	var STOP = {};
	("a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further get got gonna gotta had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just know let's like me more most mustn't my myself no nor not now of off oh ok okay on once one only or other ought our ours ourselves out over own really right same say see shan't she she'd she'll she's should shouldn't so some something such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've thing things think this those though through to too uh um under until up us very want wanna was wasn't way we we'd we'll we're we've well were weren't what what's when when's where where's which while who who's whom why why's will with won't would wouldn't yeah yes you you'd you'll you're you've your yours yourself yourselves go going gone actually basically kind sort lot lots mean means maybe even still back also just much many make made take two three first next another every pretty quite little bit look looking talk talking guess sure thank thanks hey hi alright anyway per due via").split(" ").forEach(function (w) { STOP[w] = 1; });
	X.STOP = STOP;
	function stem(w) { return w.length > 4 ? w.replace(/(ies)$/, "y").replace(/(ing|edly|ed|es|ly)$/, "").replace(/s$/, "") : w; }
	function tokens(t) { return (String(t).toLowerCase().match(/[a-z0-9][a-z0-9'’-]*[a-z0-9]|[a-z]/g) || []).map(function (w) { return w.replace(/[’]/g, "'"); }); }
	X.tokens = tokens;

	/* blocks of ~blockSec seconds -> TextTiling-style similarity of the k blocks before and after each gap -> depth -> best boundaries
	   n = number of chapters wanted (0 = automatic, about one per 2-5 minutes); min = shortest chapter in seconds */
	X.chapters = function (cues, o) {
		o = o || {}; var len = X.end(cues); if (!cues.length || len < 30) return [];
		var blockSec = o.blockSec || Math.max(15, Math.min(40, len / 60)), nb = Math.ceil(len / blockSec), B = [];
		for (var i = 0; i < nb; i++) B.push({ t: i * blockSec, words: [], raw: [] });
		cues.forEach(function (c) { var b = B[Math.min(nb - 1, Math.floor(c[0] / blockSec))]; tokens(c[2]).forEach(function (w) { b.raw.push(w); if (!STOP[w] && w.length > 2 && !/^\d+$/.test(w)) b.words.push(stem(w)); }); });
		var df = {}; B.forEach(function (b) { var seen = {}; b.words.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
		var idf = function (w) { return Math.log((nb + 1) / ((df[w] || 0) + 0.5)); };
		var vec = function (a, b) { var v = {}; for (var j = Math.max(0, a); j < Math.min(nb, b); j++) B[j].words.forEach(function (w) { v[w] = (v[w] || 0) + idf(w); }); return v; };
		var cos = function (p, q) { var d = 0, np = 0, nq = 0, k; for (k in p) { np += p[k] * p[k]; if (q[k]) d += p[k] * q[k]; } for (k in q) nq += q[k] * q[k]; return np && nq ? d / Math.sqrt(np * nq) : 0; };
		var K = o.k || 3, sim = [];
		for (i = 1; i < nb; i++) sim.push(cos(vec(i - K, i), vec(i, i + K)));
		/* smooth, then depth = how far the valley sits below the peaks on each side */
		var sm = sim.map(function (s, j) { var a = sim[j - 1], b = sim[j + 1]; return (s * 2 + (a == null ? s : a) + (b == null ? s : b)) / 4; });
		var depth = sm.map(function (s, j) {
			var l = s, r = s, x;
			for (x = j - 1; x >= 0 && sm[x] >= l; x--) l = sm[x];
			for (x = j + 1; x < sm.length && sm[x] >= r; x++) r = sm[x];
			return (l - s) + (r - s);
		});
		var minLen = o.min || Math.max(30, Math.min(120, len / 25));
		var want = o.n > 0 ? o.n : Math.max(3, Math.min(30, Math.round(len / Math.max(120, Math.min(300, len / 8)))));
		var order = depth.map(function (d, j) { return j; }).sort(function (a, b) { return depth[b] - depth[a]; });
		var picks = [0];
		/* a boundary snaps to the nearest pause (cue start with the biggest gap) within half a block */
		var snap = function (t) {
			var best = t, bestGap = -1;
			cues.forEach(function (c, k) { if (Math.abs(c[0] - t) <= blockSec * 0.6) { var p = cues[k - 1], g = p ? c[0] - (p[0] + p[1]) : 0; if (g > bestGap) { bestGap = g; best = c[0]; } } });
			return Math.floor(best);
		};
		for (i = 0; i < order.length && picks.length < want; i++) {
			var t = snap((order[i] + 1) * blockSec);
			if (t < minLen * 0.8 || len - t < minLen * 0.6) continue;
			if (picks.every(function (p) { return Math.abs(p - t) >= minLen; })) picks.push(t);
		}
		picks.sort(function (a, b) { return a - b; });
		var used = {};
		return picks.map(function (t, j) {
			var e = picks[j + 1] != null ? picks[j + 1] : len + 1;
			var seg = cues.filter(function (c) { return c[0] >= t - 0.01 && c[0] < e; });
			var title = X.label(seg, df, nb, blockSec, used);
			return { t: t, title: j === 0 && t === 0 && o.introWord !== false && (e - t) < len * 0.15 ? "Intro" + (title ? ": " + title : "") : title || "Part " + (j + 1) };
		});
	};
	/* a short title from the words that are frequent in this stretch and rare elsewhere; two-word phrases preferred */
	X.label = function (seg, df, nb, blockSec, used) {
		var raw = []; seg.forEach(function (c) { tokens(c[2]).forEach(function (w) { raw.push(w); }); });
		if (!raw.length) return "";
		var segBlocks = Math.max(1, Math.round((X.end(seg) - (seg[0] ? seg[0][0] : 0)) / blockSec));
		var score = {}, show = {}, add = function (key, disp, s) { score[key] = (score[key] || 0) + s; if (!show[key]) show[key] = {}; show[key][disp] = (show[key][disp] || 0) + 1; };
		for (var i = 0; i < raw.length; i++) {
			var w = raw[i]; if (STOP[w] || w.length < 3 || /^\d+$/.test(w)) continue;
			var sw = stem(w), rare = Math.log((nb + 1) / ((df[sw] || 0) + 0.5 - Math.min(segBlocks, df[sw] || 0) * 0.5 + 0.5));
			add(sw, w, Math.max(0.2, rare));
			var n = raw[i + 1]; if (n && !STOP[n] && n.length > 2 && !/^\d+$/.test(n)) add(sw + " " + stem(n), w + " " + n, Math.max(0.2, rare) * 1.6);
		}
		var keys = Object.keys(score).filter(function (k) { return !used[k]; }).sort(function (a, b) { return score[b] - score[a]; });
		var disp = function (k) { var d = show[k]; return Object.keys(d).sort(function (a, b) { return d[b] - d[a]; })[0]; };
		var bis = keys.filter(function (k) { return k.indexOf(" ") > 0 && score[k] >= 3; }), words = [];
		if (bis.length) {
			/* one or two phrases, never a phrase plus a stray word */
			words.push(disp(bis[0])); used[bis[0]] = 1;
			var b2 = bis.slice(1).filter(function (k) { return k.split(" ").every(function (w) { return bis[0].split(" ").indexOf(w) < 0; }); })[0];
			if (b2 && score[b2] >= score[bis[0]] * 0.6) { words.push(disp(b2)); used[b2] = 1; }
		} else {
			for (i = 0; i < keys.length && words.length < 2; i++) { if (keys[i].indexOf(" ") < 0) { words.push(disp(keys[i])); used[keys[i]] = 1; } }
		}
		var t = words.join(" and ");
		return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
	};

	/* the transcript squeezed for a chatbot: one line per ~interval seconds, "[m:ss] words" */
	X.compact = function (cues, interval) {
		interval = interval || 20; var out = [], cur = null, long = X.end(cues) >= 3600;
		cues.forEach(function (c) { if (!cur || c[0] - cur.t >= interval) { cur = { t: c[0], w: [] }; out.push(cur); } cur.w.push(c[2]); });
		return out.map(function (x) { return "[" + X.fmt(x.t, long) + "] " + x.w.join(" ").replace(/\s+/g, " "); }).join("\n");
	};
	X.prompt = function (cues, o) {
		o = o || {}; var n = o.n ? "about " + o.n : "a sensible number of";
		return "Make YouTube chapter timestamps for this video" + (o.title ? " (\"" + o.title + "\")" : "") + ". Use " + n + " chapters. " +
			"Rules: the first line is 0:00, each chapter is at least 10 seconds long, times come from the transcript below, and each title is short (2-7 words) and says what happens there. " +
			"Answer with only the lines, one per chapter, like:\n0:00 Intro\n1:23 Title\n\nTranscript:\n" + X.compact(cues, o.interval || 20);
	};
	/* "0:00 Intro" lines pasted back from a chatbot (or typed) -> chapters */
	X.parseChapters = function (text) { var c = X.descChapters(text); if (c.length) return c; var one = X.descChapters(text + "\n99:59:59 x"); return one.slice(0, -1); };

	/* ---------- search ---------- */
	X.search = function (cues, q) {
		q = String(q || "").toLowerCase().trim(); if (!q) return [];
		var out = []; cues.forEach(function (c, i) { if (c[2].toLowerCase().indexOf(q) >= 0) out.push(i); });
		/* a phrase split over two cues */
		if (q.indexOf(" ") > 0) for (var i = 0; i + 1 < cues.length; i++) { var j = (cues[i][2] + " " + cues[i + 1][2]).toLowerCase(); if (j.indexOf(q) >= 0 && out.indexOf(i) < 0 && out.indexOf(i + 1) < 0) out.push(i); }
		return out.sort(function (a, b) { return a - b; });
	};
	X.cueAt = function (cues, t) { var lo = 0, hi = cues.length - 1, r = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (cues[m][0] <= t + 0.05) { r = m; lo = m + 1; } else hi = m - 1; } return r; };

	/* ---------- speech-to-text pieces (Whisper) ---------- */
	/* long audio is run in blocks with an overlap; a chunk belongs to the block whose middle-of-overlap rule claims its start */
	X.blocks = function (total, size, overlap) {
		var out = [], s = 0; size = size || 300; overlap = overlap || 5;
		while (s < total) { var e = Math.min(total, s + size); out.push({ s: Math.max(0, s - (out.length ? overlap : 0)), e: e, keepFrom: out.length ? s - overlap / 2 : 0, keepTo: e >= total ? Infinity : e - overlap / 2 }); s = e; }
		return out;
	};
	X.whisperCues = function (chunks, offset, keepFrom, keepTo) {
		var out = [];
		(chunks || []).forEach(function (c) {
			var ts = c.timestamp || [0, null], st = (ts[0] || 0) + offset, en = ts[1] != null ? ts[1] + offset : st + 3, tx = String(c.text || "").trim();
			if (!tx || /^\[?(music|blank_audio|silence)\]?$/i.test(tx) || st < keepFrom || st >= keepTo) return;
			out.push([Math.round(st * 100) / 100, Math.max(0.1, Math.round((en - st) * 100) / 100), tx]);
		});
		return out;
	};
	X.MODELS = {
		tiny: { id: "onnx-community/whisper-tiny", mb: [40, 120], name: "Fast (tiny)" },
		base: { id: "onnx-community/whisper-base", mb: [80, 200], name: "Better (base)" },
		small: { id: "onnx-community/whisper-small", mb: [250, 600], name: "Best (small, slow)" }
	};
	X.LANGS = [["", "Detect automatically"], ["english", "English"], ["spanish", "Spanish"], ["french", "French"], ["german", "German"], ["portuguese", "Portuguese"], ["italian", "Italian"], ["dutch", "Dutch"], ["russian", "Russian"], ["ukrainian", "Ukrainian"], ["polish", "Polish"], ["turkish", "Turkish"], ["arabic", "Arabic"], ["hindi", "Hindi"], ["vietnamese", "Vietnamese"], ["indonesian", "Indonesian"], ["chinese", "Chinese"], ["japanese", "Japanese"], ["korean", "Korean"], ["tagalog", "Tagalog"]];

	if (typeof module !== "undefined" && module.exports) module.exports = X;
	root.MESTx = X;
})(typeof window !== "undefined" ? window : this);
