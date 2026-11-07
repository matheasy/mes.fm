/* MESConv: pure helpers for the MES Video Converter (mes.fm/convert-video) and the MES Video Editor (mes.fm/video).
 * AVI (RIFF / OpenDML) header + chunk parsing, H.264 Annex B -> MP4 (avcC, length-prefixed NAL units), SPS / slice-header reading
 * for key frames and B-frame order (picture order count), MP3 frame splitting, PCM conversion, ffmpeg log parsing and the
 * "which engine" decision. No DOM, no browser APIs: node-tested by tool_apps_src/convert-video-tests.js. */
(function (root) {
	"use strict";
	var C = {};

	/* ---------- names, sizes, formats ---------- */
	C.VIDEO_EXT = ["avi", "mkv", "wmv", "asf", "flv", "f4v", "mov", "qt", "mp4", "m4v", "webm", "mpg", "mpeg", "mpe", "m2v", "vob", "ts", "mts", "m2ts", "3gp", "3g2", "ogv", "divx", "xvid", "rm", "rmvb", "dv", "mxf", "y4m", "gif"];
	C.AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "wma", "aif", "aiff", "amr", "weba"];
	C.extOf = function (name) { var m = /\.([a-z0-9]+)$/i.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };
	C.isVideo = function (name, type) { return /^video\//.test(type || "") || C.VIDEO_EXT.indexOf(C.extOf(name)) >= 0; };
	C.isAudio = function (name, type) { return /^audio\//.test(type || "") || C.AUDIO_EXT.indexOf(C.extOf(name)) >= 0; };
	// "My clip.avi" -> "My clip.mp4"; a name already used gets " (2)", " (3)" ...
	C.outName = function (name, used, ext) {
		ext = ext || "mp4";
		var base = String(name || "video").replace(/\.[a-z0-9]+$/i, "") || "video", n = base + "." + ext, k = 2;
		used = used || {};
		while (used[n.toLowerCase()]) n = base + " (" + (k++) + ")." + ext;
		used[n.toLowerCase()] = 1;
		return n;
	};
	C.formatBytes = function (b) {
		if (!(b >= 0)) return "?";
		if (b < 1024) return b + " B";
		var u = ["KB", "MB", "GB", "TB"], i = -1;
		do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
		return (b >= 100 ? Math.round(b) : b >= 10 ? b.toFixed(1) : b.toFixed(2)) + " " + u[i];
	};
	C.formatTime = function (s) {
		if (!(s >= 0) || !isFinite(s)) return "?";
		s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
	};

	/* ---------- bytes ---------- */
	function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
	function u16le(b, o) { return b[o] | (b[o + 1] << 8); }
	function fourcc(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }
	C.u32le = u32le; C.u16le = u16le; C.fourcc = fourcc;

	/* ---------- AVI ---------- */
	C.H264_FOURCC = ["H264", "X264", "AVC1", "DAVC", "VSSH", "AVCB", "AI55", "AI5Q", "AI1Q"];
	C.AUDIO_TAGS = { 1: "pcm", 3: "pcmf", 0x55: "mp3", 0x50: "mp2", 0xff: "aac", 0x706d: "aac", 0x2000: "ac3", 0x2001: "dts", 0x161: "wma", 0x162: "wma", 0x11: "adpcm", 0x2: "adpcm" };
	// a chunk header at b[o]: { id, size, next } (next = offset of the following chunk, sizes are padded to an even length)
	C.chunkAt = function (b, o) { var size = u32le(b, o + 4); return { id: fourcc(b, o), size: size, next: o + 8 + size + (size & 1) }; };
	// parse the 'hdrl' LIST of an AVI. b = the first bytes of the file (enough to hold the header list).
	// Returns { ok, avih: {usPerFrame, frames, width, height}, streams: [...], moviOffset?, needBytes? }
	C.parseAviHeader = function (b) {
		if (b.length < 24 || fourcc(b, 0) !== "RIFF" || fourcc(b, 8) !== "AVI ") return { ok: false, error: "not an AVI file" };
		var o = 12, out = { ok: true, streams: [], avih: null, riffEnd: 8 + u32le(b, 4) };
		while (o + 8 <= b.length) {
			var ch = C.chunkAt(b, o);
			if (ch.id === "LIST") {
				var type = fourcc(b, o + 8);
				if (type === "hdrl") {
					if (o + 8 + ch.size > b.length) return { ok: false, needBytes: o + 8 + ch.size + 4096 };
					parseHdrl(b, o + 12, o + 8 + ch.size, out);
				} else if (type === "movi") { out.moviOffset = o; out.moviEnd = o + 8 + ch.size; break; }
			}
			if (ch.size === 0 && ch.id === "\0\0\0\0") break;
			o = ch.next;
		}
		if (!out.avih) return { ok: false, error: "no AVI header" };
		return out;
	};
	function parseHdrl(b, o, end, out) {
		while (o + 8 <= end) {
			var ch = C.chunkAt(b, o);
			if (ch.id === "avih") out.avih = { usPerFrame: u32le(b, o + 8), frames: u32le(b, o + 24), streams: u32le(b, o + 32), width: u32le(b, o + 40), height: u32le(b, o + 44) };
			else if (ch.id === "LIST" && fourcc(b, o + 8) === "strl") out.streams.push(parseStrl(b, o + 12, o + 8 + ch.size, out.streams.length));
			o = ch.next;
		}
	}
	function parseStrl(b, o, end, index) {
		var s = { index: index, type: "", handler: "", scale: 1, rate: 1, start: 0, length: 0, sampleSize: 0, fmt: null };
		while (o + 8 <= end) {
			var ch = C.chunkAt(b, o), d = o + 8;
			if (ch.id === "strh") {
				s.type = fourcc(b, d); s.handler = fourcc(b, d + 4).replace(/\0/g, "");
				s.scale = u32le(b, d + 20) || 1; s.rate = u32le(b, d + 24) || 1; s.start = u32le(b, d + 28); s.length = u32le(b, d + 32); s.sampleSize = u32le(b, d + 44);
			} else if (ch.id === "strf") {
				if (s.type === "vids") {
					var hb = (b[d + 8] | (b[d + 9] << 8) | (b[d + 10] << 16) | (b[d + 11] << 24));
					s.fmt = { width: u32le(b, d + 4), height: Math.abs(hb), compression: fourcc(b, d + 16), extra: ch.size > 40 ? b.slice(d + 40, d + ch.size) : null };
				} else if (s.type === "auds") {
					var tag = u16le(b, d), cb = ch.size >= 18 ? u16le(b, d + 16) : 0;
					s.fmt = { tag: tag, channels: u16le(b, d + 2), sampleRate: u32le(b, d + 4), avgBytes: u32le(b, d + 8), blockAlign: u16le(b, d + 12), bits: u16le(b, d + 14), extra: cb ? b.slice(d + 18, d + 18 + Math.min(cb, ch.size - 18)) : null };
					if (tag === 0xfffe && cb >= 22) s.fmt.tag = u16le(b, d + 18 + 6);   // WAVE_FORMAT_EXTENSIBLE: the real tag is the first 2 bytes of the sub-format GUID
				}
			}
			o = ch.next;
		}
		return s;
	}
	// stream number of a movi data chunk id: "00dc" -> 0, "01wb" -> 1; -1 = not a data chunk ("ix00", "JUNK", ...)
	C.streamOf = function (id) {
		if (!/^[0-9]{2}(dc|db|wb|pc|tx)$/.test(id)) return -1;
		return parseInt(id.slice(0, 2), 10);
	};
	// what the converter can do with an AVI: { videoStream, audioStream, h264, audioKind, reasons[] }
	C.describeAvi = function (hdr) {
		var v = null, a = null, r = { videoStream: -1, audioStream: -1, h264: false, audioKind: "none", width: 0, height: 0, fps: 0, duration: 0, reasons: [] };
		hdr.streams.forEach(function (s) { if (s.type === "vids" && !v) v = s; if (s.type === "auds" && !a) a = s; });
		if (!v) { r.reasons.push("no video stream"); return r; }
		r.videoStream = v.index; r.width = (v.fmt && v.fmt.width) || hdr.avih.width; r.height = (v.fmt && v.fmt.height) || hdr.avih.height;
		r.fps = v.rate / v.scale; r.frameDur = v.scale / v.rate;
		r.duration = (v.length || hdr.avih.frames) * r.frameDur;
		var comp = ((v.fmt && v.fmt.compression) || v.handler || "").toUpperCase();
		r.vcodec = comp; r.h264 = C.H264_FOURCC.indexOf(comp) >= 0;
		if (!r.h264) r.reasons.push("video is " + (comp || "unknown") + ", not H.264");
		if (a && a.fmt) {
			r.audioStream = a.index; r.audioKind = C.AUDIO_TAGS[a.fmt.tag] || ("tag 0x" + a.fmt.tag.toString(16));
			r.audio = { kind: r.audioKind, channels: a.fmt.channels, sampleRate: a.fmt.sampleRate, bits: a.fmt.bits, blockAlign: a.fmt.blockAlign, extra: a.fmt.extra, scale: a.scale, rate: a.rate, start: a.start, sampleSize: a.sampleSize };
			if (["mp3", "pcm", "pcmf", "aac"].indexOf(r.audioKind) < 0) r.reasons.push("sound is " + r.audioKind);
			if (r.audioKind === "pcm" && [8, 16, 24, 32].indexOf(a.fmt.bits) < 0) r.reasons.push("unusual PCM sound");
		}
		r.extra = v.fmt && v.fmt.extra;
		return r;
	};

	/* ---------- H.264 ---------- */
	// split Annex B (00 00 01 / 00 00 00 01 start codes) into NAL units (views into b)
	C.isAnnexB = function (b) { return b.length > 4 && b[0] === 0 && b[1] === 0 && (b[2] === 1 || (b[2] === 0 && b[3] === 1)); };
	C.splitAnnexB = function (b) {
		var out = [], i = 0, n = b.length, start = -1;
		while (i + 2 < n) {
			if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) {
				if (start >= 0) { var e = i; while (e > start && b[e - 1] === 0) e--; out.push(b.subarray(start, e)); }
				i += 3; start = i; continue;
			}
			i++;
		}
		if (start >= 0 && start < n) out.push(b.subarray(start, n));
		return out.filter(function (x) { return x.length > 0; });
	};
	// length-prefixed (AVCC) sample -> NAL units
	C.splitAvcc = function (b, lenSize) {
		lenSize = lenSize || 4; var out = [], o = 0;
		while (o + lenSize <= b.length) {
			var len = 0; for (var k = 0; k < lenSize; k++) len = len * 256 + b[o + k];
			o += lenSize; if (len <= 0 || o + len > b.length) break;
			out.push(b.subarray(o, o + len)); o += len;
		}
		return out;
	};
	C.toAvcc = function (nals) {
		var total = 0, j; for (j = 0; j < nals.length; j++) total += 4 + nals[j].length;
		var out = new Uint8Array(total), o = 0;
		for (j = 0; j < nals.length; j++) { var L = nals[j].length; out[o] = L >>> 24; out[o + 1] = (L >>> 16) & 255; out[o + 2] = (L >>> 8) & 255; out[o + 3] = L & 255; out.set(nals[j], o + 4); o += 4 + L; }
		return out;
	};
	C.avcC = function (spsList, ppsList) {
		var sps = spsList[0], len = 7 + 1, j;
		spsList.forEach(function (s) { len += 2 + s.length; }); ppsList.forEach(function (p) { len += 2 + p.length; });
		var out = new Uint8Array(len - 1), o = 0;
		out[o++] = 1; out[o++] = sps[1]; out[o++] = sps[2]; out[o++] = sps[3]; out[o++] = 0xff; out[o++] = 0xe0 | spsList.length;
		for (j = 0; j < spsList.length; j++) { out[o++] = spsList[j].length >> 8; out[o++] = spsList[j].length & 255; out.set(spsList[j], o); o += spsList[j].length; }
		out[o++] = ppsList.length;
		for (j = 0; j < ppsList.length; j++) { out[o++] = ppsList[j].length >> 8; out[o++] = ppsList[j].length & 255; out.set(ppsList[j], o); o += ppsList[j].length; }
		return out;
	};
	// read SPS / PPS out of an avcC box payload
	C.parseAvcC = function (b) {
		if (!b || b.length < 7 || b[0] !== 1) return null;
		var o = 6, sps = [], pps = [], n = b[5] & 31, j, L;
		for (j = 0; j < n && o + 2 <= b.length; j++) { L = (b[o] << 8) | b[o + 1]; sps.push(b.slice(o + 2, o + 2 + L)); o += 2 + L; }
		n = b[o++]; for (j = 0; j < n && o + 2 <= b.length; j++) { L = (b[o] << 8) | b[o + 1]; pps.push(b.slice(o + 2, o + 2 + L)); o += 2 + L; }
		return { lenSize: (b[4] & 3) + 1, sps: sps, pps: pps };
	};
	C.codecString = function (sps) { function h(x) { return (x < 16 ? "0" : "") + x.toString(16); } return "avc1." + h(sps[1]) + h(sps[2]) + h(sps[3]); };
	// remove emulation-prevention bytes (00 00 03 -> 00 00)
	C.unescape = function (b, max) {
		var n = Math.min(b.length, max || b.length), out = new Uint8Array(n), o = 0, z = 0;
		for (var i = 0; i < n; i++) { var x = b[i]; if (z >= 2 && x === 3) { z = 0; continue; } out[o++] = x; z = x === 0 ? z + 1 : 0; }
		return out.subarray(0, o);
	};
	function Bits(b) { this.b = b; this.p = 0; }
	Bits.prototype.u1 = function () { var v = (this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1; this.p++; if (this.p > this.b.length * 8) throw new Error("bits"); return v; };
	Bits.prototype.u = function (n) { var v = 0; for (var i = 0; i < n; i++) v = v * 2 + this.u1(); return v; };
	Bits.prototype.ue = function () { var z = 0; while (this.u1() === 0) { z++; if (z > 31) throw new Error("ue"); } return (Math.pow(2, z) - 1) + this.u(z); };
	Bits.prototype.se = function () { var k = this.ue(); return k & 1 ? (k + 1) / 2 : -k / 2; };
	C.Bits = Bits;
	var HIGH = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];
	function skipScaling(r, size) { var last = 8, next = 8; for (var j = 0; j < size; j++) { if (next !== 0) next = (last + r.se() + 256) % 256; last = next === 0 ? last : next; } }
	// SPS NAL (with its header byte) -> the fields we need
	C.parseSps = function (nal) {
		var r = new Bits(C.unescape(nal.subarray(1), 400)), s = { profile: r.u(8), constraints: r.u(8), level: r.u(8) };
		s.id = r.ue(); s.chroma = 1; s.sep = 0;
		if (HIGH.indexOf(s.profile) >= 0) {
			s.chroma = r.ue(); if (s.chroma === 3) s.sep = r.u1();
			s.bitDepth = r.ue() + 8; r.ue(); r.u1();
			if (r.u1()) for (var j = 0; j < (s.chroma !== 3 ? 8 : 12); j++) if (r.u1()) skipScaling(r, j < 6 ? 16 : 64);
		}
		s.log2MaxFrameNum = r.ue() + 4; s.pocType = r.ue();
		if (s.pocType === 0) s.log2MaxPocLsb = r.ue() + 4;
		else if (s.pocType === 1) { r.u1(); r.se(); r.se(); var nc = r.ue(); for (var k = 0; k < nc; k++) r.se(); }
		s.maxRefFrames = r.ue(); r.u1();
		var wmb = r.ue() + 1, hmu = r.ue() + 1; s.frameMbsOnly = r.u1();
		if (!s.frameMbsOnly) r.u1();
		r.u1();
		var cl = 0, cr = 0, ct = 0, cb = 0;
		if (r.u1()) { cl = r.ue(); cr = r.ue(); ct = r.ue(); cb = r.ue(); }
		var cux = s.chroma === 1 || s.chroma === 2 ? 2 : 1, cuy = (s.chroma === 1 ? 2 : 1) * (2 - s.frameMbsOnly);
		if (s.chroma === 0 || s.sep) { cux = 1; cuy = 2 - s.frameMbsOnly; }
		s.width = wmb * 16 - (cl + cr) * cux; s.height = hmu * 16 * (2 - s.frameMbsOnly) - (ct + cb) * cuy;
		return s;
	};
	// the start of a slice header: { type: 0..4 (P B I SP SI), idr, ref, frameNum, pocLsb }
	C.parseSlice = function (nal, sps) {
		var nt = nal[0] & 31, r = new Bits(C.unescape(nal.subarray(1), 64)), o = { idr: nt === 5, ref: (nal[0] >> 5) & 3 };
		r.ue(); o.type = r.ue() % 5; r.ue();
		if (sps) {
			if (sps.sep) r.u(2);
			o.frameNum = r.u(sps.log2MaxFrameNum);
			if (!sps.frameMbsOnly) { o.field = r.u1(); if (o.field) o.bottom = r.u1(); }
			if (o.idr) r.ue();
			if (sps.pocType === 0) o.pocLsb = r.u(sps.log2MaxPocLsb);
		}
		return o;
	};
	// picture order count for poc type 0 (8.2.1.1); state = {} kept between calls, frames in decode order
	C.pocType0 = function (state, sl, sps) {
		var max = Math.pow(2, sps.log2MaxPocLsb);
		if (sl.idr) { state.msb = 0; state.lsb = 0; }
		var pm = state.msb || 0, pl = state.lsb || 0, msb;
		if (sl.pocLsb < pl && pl - sl.pocLsb >= max / 2) msb = pm + max;
		else if (sl.pocLsb > pl && sl.pocLsb - pl > max / 2) msb = pm - max;
		else msb = pm;
		if (sl.ref) { state.msb = msb; state.lsb = sl.pocLsb; }
		return msb + sl.pocLsb;
	};
	// look at one access unit (array of NALs): { key, idr, vcl, sliceType, sps?, pps?, recovery }
	C.inspectAU = function (nals) {
		var r = { key: false, idr: false, vcl: null, sps: [], pps: [], recovery: false, aud: false };
		for (var j = 0; j < nals.length; j++) {
			var t = nals[j][0] & 31;
			if (t === 7) r.sps.push(nals[j]); else if (t === 8) r.pps.push(nals[j]);
			else if (t === 9) r.aud = true;
			else if (t === 6 && nals[j].length > 1 && nals[j][1] === 6) r.recovery = true;   // SEI payload type 6 = recovery point
			else if ((t === 5 || t === 1) && !r.vcl) { r.vcl = nals[j]; if (t === 5) r.idr = true; }
		}
		r.key = r.idr;
		return r;
	};
	// presentation order for frames in decode order. Feed {poc, idr} per frame (null for an empty/dropped slot);
	// returns display index (0-based over the whole stream) for frames once known, via out(decodeIndex, displayIndex).
	// lag = how many frames are held back (enough for any B-frame reordering).
	C.Reorder = function (out, lag) {
		this.out = out; this.lag = lag || 16; this.pend = []; this.seq = []; this.seqBase = 0; this.next = 0;
	};
	C.Reorder.prototype.push = function (dIdx, poc, idr) {
		if (idr && this.seq.length) this.flush();
		var f = { d: dIdx, poc: poc }; this.pend.push(f); this.seq.push(poc);
		while (this.pend.length > this.lag) this.emit();
	};
	C.Reorder.prototype.emit = function () {
		var f = this.pend.shift(), rank = 0;
		for (var j = 0; j < this.seq.length; j++) if (this.seq[j] < f.poc) rank++;
		this.out(f.d, this.seqBase + rank);
	};
	C.Reorder.prototype.flush = function () { while (this.pend.length) this.emit(); this.seqBase += this.seq.length; this.seq = []; };
	// largest (decode index - display index) over a list of pairs = how many frames video must start late so pts >= dts
	C.reorderDelay = function (pairs) { var d = 0; pairs.forEach(function (p) { d = Math.max(d, p[0] - p[1]); }); return d; };

	/* ---------- MP3 ---------- */
	var BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
	var SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
	// MP3 (layer III) frame header at b[o] -> { len, samples, sampleRate, channels } or null
	C.mp3Header = function (b, o) {
		if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
		var ver = (b[o + 1] >> 3) & 3, layer = (b[o + 1] >> 1) & 3, bri = b[o + 2] >> 4, sri = (b[o + 2] >> 2) & 3, pad = (b[o + 2] >> 1) & 1;
		if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null;
		var sr = SR[ver][sri], br = (ver === 3 ? BR1 : BR2)[bri] * 1000, mono = (b[o + 3] >> 6) === 3;
		var len = Math.floor((ver === 3 ? 144 : 72) * br / sr) + pad;
		return { len: len, samples: ver === 3 ? 1152 : 576, sampleRate: sr, channels: mono ? 1 : 2 };
	};
	// accumulates the bytes of an MP3 stream (cut into AVI chunks anywhere) and hands out whole frames
	C.Mp3Splitter = function () { this.buf = new Uint8Array(0); };
	C.Mp3Splitter.prototype.push = function (bytes) {
		var b = this.buf.length ? concat(this.buf, bytes) : bytes, o = 0, out = [];
		while (o + 4 <= b.length) {
			var h = C.mp3Header(b, o);
			if (!h) { o++; continue; }
			if (o + h.len > b.length) break;
			var nx = C.mp3Header(b, o + h.len);   // a real frame is followed by another (or the end of what we have)
			if (!nx && o + h.len + 4 <= b.length) { o++; continue; }
			out.push({ data: b.slice(o, o + h.len), h: h }); o += h.len;
		}
		this.buf = b.slice(o);
		return out;
	};
	function concat(a, b) { var c = new Uint8Array(a.length + b.length); c.set(a, 0); c.set(b, a.length); return c; }
	C.concat = concat;

	/* ---------- AAC ---------- */
	// one raw AAC access unit + its AudioSpecificConfig (2+ bytes) -> the same frame with a 7-byte ADTS header (so decodeAudioData can read a run of them)
	C.adtsFrame = function (au, asc) {
		var ot = Math.max(1, (asc && asc.length >= 2 ? asc[0] >> 3 : 2)), sri = asc && asc.length >= 2 ? ((asc[0] & 7) << 1) | (asc[1] >> 7) : 4, chc = asc && asc.length >= 2 ? (asc[1] >> 3) & 15 : 2;
		var len = au.length + 7, o = new Uint8Array(len);
		o[0] = 0xff; o[1] = 0xf1; o[2] = (((ot - 1) & 3) << 6) | ((sri & 15) << 2) | ((chc >> 2) & 1);
		o[3] = ((chc & 3) << 6) | ((len >> 11) & 3); o[4] = (len >> 3) & 0xff; o[5] = ((len & 7) << 5) | 0x1f; o[6] = 0xfc;
		o.set(au, 7); return o;
	};
	C.isAdts = function (d) { return d.length > 7 && d[0] === 0xff && (d[1] & 0xf6) === 0xf0; };
	// interleaved s16le of n channels -> planar Float32 (ffmpeg's -f s16le output)
	C.s16Planar = function (b, n) { return C.pcmToPlanar(b, n, 16, false); };

	/* ---------- PCM ---------- */
	// interleaved little-endian PCM bytes -> planar Float32 channels
	C.pcmToPlanar = function (b, channels, bits, float) {
		var bps = bits / 8, n = Math.floor(b.length / (bps * channels)), out = [], c, i;
		for (c = 0; c < channels; c++) out.push(new Float32Array(n));
		var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
		for (i = 0; i < n; i++) for (c = 0; c < channels; c++) {
			var o = (i * channels + c) * bps, v;
			if (float) v = bits === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
			else if (bits === 8) v = (b[o] - 128) / 128;
			else if (bits === 16) v = dv.getInt16(o, true) / 32768;
			else if (bits === 24) { var x = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
			else v = dv.getInt32(o, true) / 2147483648;
			out[c][i] = v;
		}
		return out;
	};

	/* ---------- ffmpeg ---------- */
	// parse "ffmpeg -i file" log lines -> { duration, streams: [{ index, type, codec, width, height, fps, sampleRate, channels }] }
	C.parseFfmpegLog = function (log) {
		var r = { duration: 0, streams: [] }, lines = String(log || "").split(/\r?\n/);
		lines.forEach(function (ln) {
			var m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(ln);
			if (m) r.duration = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
			m = /Stream #\d+:(\d+)[^:]*:\s*(Video|Audio|Subtitle|Data):\s*([a-z0-9_]+)(.*)$/i.exec(ln);
			if (!m) return;
			var s = { index: +m[1], type: m[2].toLowerCase(), codec: m[3].toLowerCase() }, rest = m[4];
			if (s.type === "video") {
				var d = /,\s*(\d{2,5})x(\d{2,5})/.exec(rest); if (d) { s.width = +d[1]; s.height = +d[2]; }
				var f = /([\d.]+)\s*fps/.exec(rest); if (f) s.fps = parseFloat(f[1]); else { f = /([\d.]+)\s*tbr/.exec(rest); if (f) s.fps = parseFloat(f[1]); }
				if (/attached pic/.test(rest)) s.cover = true;
				s.pix = (/,\s*(yuv[a-z0-9]+|nv12|rgb24|bgra|gray)\b/.exec(rest) || [])[1] || "";
			} else if (s.type === "audio") {
				var sr = /(\d{4,6})\s*Hz/.exec(rest); if (sr) s.sampleRate = +sr[1];
				s.channels = /\bmono\b/.test(rest) ? 1 : /\bstereo\b/.test(rest) ? 2 : (/(\d)\s*channels/.exec(rest) || [0, 2])[1] * 1;
			}
			r.streams.push(s);
		});
		return r;
	};
	// ffmpeg arguments that make an MP4 Camtasia (and phones) can read: copy H.264 when possible, otherwise x264;
	// AAC sound (copied when it already is AAC). opts: { quality: "high" | "balanced" | "small", speed: "fast" | "small" }
	C.ffmpegPlan = function (probe, inName, outName, opts) {
		opts = opts || {};
		var v = probe.streams.filter(function (s) { return s.type === "video" && !s.cover; })[0], a = probe.streams.filter(function (s) { return s.type === "audio"; })[0];
		if (!v) return { ok: false, error: "No video picture was found in this file." };
		var copyV = v.codec === "h264" && (!v.pix || /^(yuv420p|yuvj420p)$/.test(v.pix)) && !opts.reencode;
		var crf = { high: 18, balanced: 21, small: 25 }[opts.quality || "balanced"] || 21;
		var args = ["-hide_banner", "-i", inName, "-map", "0:" + v.index];
		if (a) args.push("-map", "0:" + a.index);
		if (copyV) args.push("-c:v", "copy");
		else args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
		if (a) { if (a.codec === "aac" && copyV) args.push("-c:a", "copy"); else args.push("-c:a", "aac", "-b:a", "192k"); }
		args.push("-movflags", "+faststart", "-y", outName);
		return { ok: true, copyVideo: copyV, copyAudio: !!a && a.codec === "aac" && copyV, hasAudio: !!a, video: v, audio: a || null, args: args, duration: probe.duration };
	};
	// "time=00:01:02.50" in an ffmpeg progress line -> seconds
	C.ffmpegTime = function (line) { var m = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line || ""); return m ? Math.max(0, (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])) : null; };

	/* ---------- which engine ---------- */
	// info = { container: "avi" | ..., avi?: describeAvi(), hasB?: bool, pocType? }
	// -> { engine: "native" | "ffmpeg", why }
	C.route = function (info) {
		if (info.container === "avi" && info.avi) {
			var a = info.avi;
			if (!a.h264) return { engine: "ffmpeg", why: a.reasons.join("; ") || "not H.264" };
			if (a.reasons.length) return { engine: "ffmpeg", why: a.reasons.join("; ") };
			if (info.hasB && info.pocType !== 0) return { engine: "ffmpeg", why: "B-frames this page cannot reorder" };
			return { engine: "native", why: "H.264 is copied as it is" + (a.audioKind === "aac" ? ", AAC sound copied" : a.audioKind === "none" ? "" : ", sound made AAC") };
		}
		return { engine: "ffmpeg", why: "read with ffmpeg" };
	};
	// ffmpeg.wasm keeps the result in memory (32-bit WebAssembly): warn past this
	C.FFMPEG_SAFE_BYTES = 1.6e9;

	if (typeof module !== "undefined" && module.exports) module.exports = C;
	root.MESConv = C;
})(typeof window !== "undefined" ? window : globalThis);

/* MESVed: pure maths of the MES Video Editor (mes.fm/video). The project model, clip timing (trim, split, speed, cross-fades),
 * placing clips on tracks without overlaps, snapping, ripple deletes, what is visible / audible at a time, audio envelopes and mixing with
 * resampling, EBU R128 loudness (for "Normalize loudness"), picture placement, time codes and undo history. No DOM: node-tested by
 * tool_apps_src/video-tests.js. */
(function (root) {
	"use strict";
	var V = {}, EPS = 1e-6;
	var n = 0; V.uid = function (p) { return (p || "x") + Date.now().toString(36) + (++n).toString(36) + Math.floor(Math.random() * 1296).toString(36); };
	V.clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

	/* ---------- project ---------- */
	V.TEXT_DEFAULT = { s: "Your title", font: "Arial, Helvetica, sans-serif", size: 0.09, color: "#ffffff", bgOn: true, bg: "#000000", bgOp: 0.55, bold: true, italic: false, align: "center", shadow: true, outline: 0, ocolor: "#000000" };
	V.newProject = function (o) {
		o = o || {};
		return { v: 1, name: o.name || "Untitled video", w: o.w || 1920, h: o.h || 1080, fps: o.fps || 30, bg: "#000000",
			tracks: [{ id: "v1", kind: "v", name: "Video 1" }, { id: "v2", kind: "v", name: "Video 2" }, { id: "a1", kind: "a", name: "Audio 1" }], clips: [], marks: { in: null, out: null } };
	};
	V.clipDefaults = function (c) {
		var d = { speed: 1, vol: 1, mute: false, fin: 0, fout: 0, xin: 0, x: 0.5, y: 0.5, scale: 1, op: 1, crop: { l: 0, t: 0, r: 0, b: 0 }, rot: 0, anims: null, clean: null, lufs: null, link: null, noAudio: false, afx: null };
		for (var k in d) if (c[k] == null) c[k] = typeof d[k] === "object" && d[k] ? JSON.parse(JSON.stringify(d[k])) : d[k];
		if (c.type === "text") { c.text = Object.assign({}, V.TEXT_DEFAULT, c.text || {}); }
		c.anims = V.cleanAnims(c.anims); c.rot = isFinite(+c.rot) ? +c.rot : 0;
		return c;
	};
	// a project read from a file / storage: fill in defaults, drop clips whose track is gone, keep numbers sane
	V.normalize = function (p) {
		if (!p || typeof p !== "object") throw new Error("Not a project.");
		var q = V.newProject(p);
		q.name = String(p.name || q.name).slice(0, 120); q.bg = /^#[0-9a-f]{6}$/i.test(p.bg || "") ? p.bg : "#000000";
		q.w = V.clamp(Math.round(+p.w || 1920), 16, 7680) & ~1; q.h = V.clamp(Math.round(+p.h || 1080), 16, 4320) & ~1; q.fps = V.clamp(+p.fps || 30, 1, 120);
		if (Array.isArray(p.tracks) && p.tracks.length) q.tracks = p.tracks.filter(function (t) { return t && t.id && (t.kind === "v" || t.kind === "a"); }).map(function (t) { var o = { id: String(t.id), kind: t.kind, name: String(t.name || "Track").slice(0, 40), mute: !!t.mute, hide: !!t.hide, lock: !!t.lock, mag: !!t.mag }; if (isFinite(t.h) && t.h > 0) o.h = V.clamp(Math.round(t.h), V.ROW_MIN, V.ROW_MAX); return o; });
		var ids = {}; q.tracks.forEach(function (t) { ids[t.id] = t; });
		q.clips = (Array.isArray(p.clips) ? p.clips : []).filter(function (c) { return c && c.id && ids[c.track] && isFinite(c.start) && isFinite(c.in) && isFinite(c.out) && c.out > c.in; }).map(function (c) { return V.clipDefaults(JSON.parse(JSON.stringify(c))); });
		q.marks = { in: p.marks && isFinite(p.marks.in) ? p.marks.in : null, out: p.marks && isFinite(p.marks.out) ? p.marks.out : null };
		return q;
	};
	V.ROW_MIN = 28; V.ROW_MAX = 420; V.ROW_DEFAULT = { v: 62, a: 84 };
	V.rowH = function (tr) { return tr && tr.h ? V.clamp(tr.h, V.ROW_MIN, V.ROW_MAX) : V.ROW_DEFAULT[tr && tr.kind === "a" ? "a" : "v"]; };
	V.track = function (p, id) { for (var j = 0; j < p.tracks.length; j++) if (p.tracks[j].id === id) return p.tracks[j]; return null; };
	V.clip = function (p, id) { for (var j = 0; j < p.clips.length; j++) if (p.clips[j].id === id) return p.clips[j]; return null; };
	V.kindFor = function (type) { return type === "audio" ? "a" : "v"; };

	/* ---------- clip timing ---------- */
	V.dur = function (c) { return (c.out - c.in) / (c.speed || 1); };
	V.end = function (c) { return c.start + V.dur(c); };
	V.srcAt = function (c, t) { return c.in + (t - c.start) * (c.speed || 1); };   // source time shown at timeline time t (before start = cross-fade pre-roll)
	V.timeAtSrc = function (c, s) { return c.start + (s - c.in) / (c.speed || 1); };
	V.onTrack = function (p, trackId, ignore) {
		return p.clips.filter(function (c) { return c.track === trackId && !(ignore && ignore[c.id]); }).sort(function (a, b) { return a.start - b.start; });
	};
	V.duration = function (p) { var d = 0; p.clips.forEach(function (c) { d = Math.max(d, V.end(c)); }); return d; };
	// can [start, start + dur) go on the track without touching another clip?
	V.canPlace = function (p, trackId, start, dur, ignore) {
		if (start < -EPS) return false;
		var cs = V.onTrack(p, trackId, ignore);
		for (var j = 0; j < cs.length; j++) if (start < V.end(cs[j]) - 1e-4 && start + dur > cs[j].start + 1e-4) return false;
		return true;
	};
	// the free start nearest to "want" where a clip of this length fits (null when the track has no such gap... it always has one after the last clip)
	V.fitOnTrack = function (p, trackId, want, dur, ignore) {
		var cs = V.onTrack(p, trackId, ignore), gaps = [], prev = 0, best = null, bd = Infinity;
		cs.forEach(function (c) { gaps.push([prev, c.start]); prev = Math.max(prev, V.end(c)); });
		gaps.push([prev, Infinity]);
		gaps.forEach(function (g) {
			if (g[1] - g[0] < dur - 1e-4) return;
			var s = V.clamp(want, g[0], g[1] - dur), d = Math.abs(s - want);
			if (d < bd) { bd = d; best = s; }
		});
		return best;
	};
	// snap t to the nearest point within tol; -> { t, snapped, point }
	V.snap = function (t, points, tol) {
		var best = null, bd = tol;
		for (var j = 0; j < points.length; j++) { var d = Math.abs(points[j] - t); if (d <= bd) { bd = d; best = points[j]; } }
		return best == null ? { t: t, snapped: false } : { t: best, snapped: true, point: best };
	};
	V.snapPoints = function (p, ignore, extra) {
		var pts = [0];
		p.clips.forEach(function (c) { if (ignore && ignore[c.id]) return; pts.push(c.start, V.end(c)); });
		if (p.marks) { if (p.marks.in != null) pts.push(p.marks.in); if (p.marks.out != null) pts.push(p.marks.out); }
		return pts.concat(extra || []);
	};
	// cut a clip in two at timeline time t: -> [left, right] (new objects, right gets newId) or null when t is not inside (min 1 frame each side)
	V.split = function (c, t, newId, minDur) {
		minDur = minDur || 1 / 60;
		if (t <= c.start + minDur || t >= V.end(c) - minDur) return null;
		var s = V.srcAt(c, t), L = JSON.parse(JSON.stringify(c)), R = JSON.parse(JSON.stringify(c));
		L.out = s; R.id = newId; R.in = s; R.start = t;
		if (c.type === "text" || c.type === "image") { L.in = 0; L.out = s - c.in; R.in = 0; R.out = c.out - s; }
		L.fout = 0; L.fin = Math.min(c.fin || 0, V.dur(L)); R.fin = 0; R.xin = 0; R.fout = Math.min(c.fout || 0, V.dur(R));
		if (c.anims && c.anims.length) { var sa = V.splitAnims(c, t - c.start); L.anims = sa.left; V.setBase(R, sa.base); R.anims = sa.right; }
		return [L, R];
	};
	// drag an edge: edge "l" moves the start (and the in point), "r" the end. t = wanted timeline time of that edge.
	// lim = { mediaDur (Infinity for stills / titles), lo, hi (neighbours on the track), minDur }
	V.trim = function (c, edge, t, lim) {
		var sp = c.speed || 1, min = lim.minDur || 1 / 30, still = !(lim.mediaDur < Infinity), o = { start: c.start, in: c.in, out: c.out };
		if (edge === "l" && lim.mag) {
			// magnetic track (Camtasia): the clip keeps its place and its left edge brings back (or hides) the start of its media; the
			// track is packed afterwards, so the clips after it move along. t = where the pointer asks the edge to be.
			var grow = c.start - t;
			if (still) o.out = Math.max(min * sp, c.out + grow * sp);
			else o.in = V.clamp(c.in - grow * sp, 0, c.out - min * sp);
			if (c.anims && c.anims.length) o.anims = V.shiftAnims(c.anims, still ? (o.out - c.out) / sp : (c.in - o.in) / sp);
			return o;
		}
		if (edge === "l") {
			var endT = V.end(c), lo = Math.max(lim.lo != null ? lim.lo : 0, still ? -Infinity : c.start - c.in / sp, 0);
			var s = V.clamp(t, lo, endT - min);
			if (still) { o.start = s; o.in = 0; o.out = (endT - s) * sp; }
			else { o.in = c.in + (s - c.start) * sp; o.start = s; }
		} else {
			var hi = Math.min(lim.hi != null ? lim.hi : Infinity, still ? Infinity : c.start + (lim.mediaDur - c.in) / sp);
			var e = V.clamp(t, c.start + min, hi);
			o.out = c.in + (e - c.start) * sp;
		}
		// animations keep their place on the timeline (they belong to the picture), so a left trim shifts them inside the clip
		if (c.anims && c.anims.length) o.anims = V.shiftAnims(c.anims, c.start - o.start);
		return o;
	};
	// remove clips; ripple = move the later clips of the same track left by the removed length
	V.removeClips = function (p, ids, ripple) {
		var del = {}; ids.forEach(function (i) { del[i] = 1; });
		var gone = p.clips.filter(function (c) { return del[c.id]; });
		p.clips = p.clips.filter(function (c) { return !del[c.id]; });
		if (ripple) gone.sort(function (a, b) { return b.start - a.start; }).forEach(function (g) {
			var d = V.dur(g), e = g.start + d;
			p.clips.forEach(function (c) { if (c.track === g.track && c.start >= e - 1e-4) c.start = Math.max(0, c.start - d); });
		});
		return p;
	};
	// cut the range [a, b) out of every unlocked track and close the gap (Camtasia's "ripple delete selection")
	V.removeRange = function (p, a, b, newId) {
		if (!(b > a)) return p;
		var locked = {}; p.tracks.forEach(function (t) { if (t.lock) locked[t.id] = 1; });
		var out = [];
		p.clips.forEach(function (c) {
			if (locked[c.track]) { out.push(c); return; }
			var s = c.start, e = V.end(c);
			if (e <= a + 1e-6) { out.push(c); return; }
			if (s >= b - 1e-6) { c.start = s - (b - a); out.push(c); return; }
			if (s < a) { var L = JSON.parse(JSON.stringify(c)); L.out = V.srcAt(c, a); L.fout = 0; if (c.type === "text" || c.type === "image") { L.in = 0; L.out = (a - s) * (c.speed || 1); } if (c.anims && c.anims.length) L.anims = V.splitAnims(c, a - s).left; out.push(L); }
			if (e > b) { var R = JSON.parse(JSON.stringify(c)); R.id = newId ? newId() : c.id + "r"; R.in = V.srcAt(c, b); R.start = a; R.fin = 0; R.xin = 0; if (c.type === "text" || c.type === "image") { R.in = 0; R.out = (e - b) * (c.speed || 1); } if (s >= a) R.id = c.id; if (c.anims && c.anims.length) { var sr = V.splitAnims(c, b - s); V.setBase(R, sr.base); R.anims = sr.right; } out.push(R); }
		});
		p.clips = out;
		return p;
	};
	// the clip right after c on its track when they touch (for cross-fades)
	V.nextTouching = function (p, c) {
		var e = V.end(c), cs = V.onTrack(p, c.track);
		for (var j = 0; j < cs.length; j++) if (cs[j] !== c && Math.abs(cs[j].start - e) < 2e-3) return cs[j];
		return null;
	};
	V.prevTouching = function (p, c) {
		var cs = V.onTrack(p, c.track);
		for (var j = 0; j < cs.length; j++) if (cs[j] !== c && Math.abs(V.end(cs[j]) - c.start) < 2e-3) return cs[j];
		return null;
	};

	/* ---------- what shows and what sounds at time t ---------- */
	// fade-in / fade-out / cross-fade envelope of a clip at timeline time t (0..1). Cross-fade: the clip starts showing xin seconds early
	// (its pre-roll) over the clip before it, fading in; the clip before keeps going to its end underneath.
	V.envelope = function (c, t) {
		var s = c.start, e = V.end(c), g = 1;
		if (c.xin > 0 && t < s) g *= V.clamp((t - (s - c.xin)) / c.xin, 0, 1);
		else if (t < s) return 0;
		if (t >= e) return 0;
		if (c.fin > 0 && t >= s) g *= V.clamp((t - s) / c.fin, 0, 1);
		if (c.fout > 0) g *= V.clamp((e - t) / c.fout, 0, 1);
		return g;
	};
	V.active = function (c, t) { return t >= c.start - (c.xin || 0) - EPS && t < V.end(c) - EPS; };
	// visible layers at t, bottom first: [{ clip, src, alpha }]. tracks[0] is the top track.
	V.layersAt = function (p, t) {
		var out = [];
		for (var j = p.tracks.length - 1; j >= 0; j--) {
			var tr = p.tracks[j]; if (tr.kind !== "v" || tr.hide) continue;
			var cs = V.onTrack(p, tr.id);
			for (var k = 0; k < cs.length; k++) {
				var c = cs[k]; if (!V.active(c, t)) continue;
				var pos = V.posAt(c, t), a = V.envelope(c, t) * pos.op; if (a <= 0.001) continue;
				out.push({ clip: c, src: Math.max(0, V.srcAt(c, t)), alpha: Math.min(1, a), pos: pos });
			}
		}
		return out;
	};
	// gain of a clip's sound at t (volume x fades x cross-fades in and out); 0 when silent
	V.gainAt = function (p, c, t) {
		var tr = V.track(p, c.track); if (!tr || tr.mute || c.mute) return 0;
		if ((c.type !== "audio" && c.type !== "video") || c.noAudio) return 0;
		var g = V.envelope(c, t) * (c.vol == null ? 1 : c.vol);
		var nx = V.nextTouching(p, c);
		if (nx && nx.xin > 0) { var e = V.end(c); if (t > e - nx.xin) g *= V.clamp((e - t) / nx.xin, 0, 1); }
		return g;
	};
	V.audibleAt = function (p, t, hasAudio) {
		return p.clips.filter(function (c) { return (c.type === "audio" || c.type === "video") && (!hasAudio || hasAudio(c)) && V.active(c, t) && V.gainAt(p, c, t) > 0; });
	};
	// gain for n output samples at rate starting at t0 (one value per sample)
	// extra(t) (optional) = a further gain at timeline time t (the clip's audio effects: leveler, compressor, ducking)
	V.gainCurve = function (p, c, t0, n, rate, extra) {
		var g = new Float32Array(n), step = Math.max(1, Math.floor(rate / 400));   // envelope sampled every 2.5 ms and held: smooth enough, cheap
		for (var i = 0; i < n; i += step) { var tt = t0 + i / rate, v = V.gainAt(p, c, tt); if (v > 0 && extra) v *= extra(tt); for (var k = i; k < Math.min(n, i + step); k++) g[k] = v; }
		return g;
	};

	/* ---------- audio maths ---------- */
	// add a clip's sound into out channels. buf = { start (source seconds of sample 0), rate, ch: [Float32Array] }; s0 = source time at out[i0];
	// ds = source seconds per output sample (speed / out rate); gain per output sample. Catmull-Rom interpolation.
	V.mixInto = function (out, i0, n, buf, s0, ds, gain) {
		var chs = buf.ch, len = chs[0].length;
		for (var c = 0; c < out.length; c++) {
			var src = chs[Math.min(c, chs.length - 1)], dst = out[c];
			for (var i = 0; i < n; i++) {
				var g = gain ? gain[i] : 1; if (g === 0) continue;
				var x = (s0 + i * ds - buf.start) * buf.rate, k = Math.floor(x), f = x - k;
				if (k < 0 || k >= len) continue;
				var y0 = src[k > 0 ? k - 1 : 0], y1 = src[k], y2 = src[k + 1 < len ? k + 1 : k], y3 = src[k + 2 < len ? k + 2 : len - 1];
				var v = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
				dst[i0 + i] += v * g;
			}
		}
	};
	V.resample = function (chs, from, to) {
		if (from === to) return chs.map(function (x) { return x.slice(); });
		var n = Math.floor(chs[0].length * to / from), out = chs.map(function () { return new Float32Array(n); });
		V.mixInto(out, 0, n, { start: 0, rate: from, ch: chs }, 0, 1 / to, null);
		return out;
	};
	V.peak = function (chs) { var m = 0; chs.forEach(function (c) { for (var i = 0; i < c.length; i++) { var a = Math.abs(c[i]); if (a > m) m = a; } }); return m; };
	// soft limiter so a mix never clips: |x| <= 1
	V.limit = function (chs) { chs.forEach(function (c) { for (var i = 0; i < c.length; i++) { var x = c[i]; if (x > 0.95) c[i] = 0.95 + 0.05 * Math.tanh((x - 0.95) / 0.05); else if (x < -0.95) c[i] = -0.95 - 0.05 * Math.tanh((-x - 0.95) / 0.05); } }); };
	// biquad coefficients of ITU-R BS.1770 K-weighting at any sample rate (Brecht De Man's bilinear design: equals the standard's 48 kHz table)
	function biquad(type, fs, f0, G, Q) {
		var K = Math.tan(Math.PI * f0 / fs), a0 = 1 + K / Q + K * K;
		if (type === "shelf") {
			var Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
			return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
		}
		return { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
	}
	// biquad over x; st (optional) carries the filter state between calls at st[o..o+3]
	function filt(x, f, st, o) {
		o = o || 0; var y = new Float32Array(x.length), x1 = st ? st[o] : 0, x2 = st ? st[o + 1] : 0, y1 = st ? st[o + 2] : 0, y2 = st ? st[o + 3] : 0, b = f.b, a = f.a;
		for (var i = 0; i < x.length; i++) { var v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
		if (st) { st[o] = x1; st[o + 1] = x2; st[o + 2] = y1; st[o + 3] = y2; }
		return y;
	}
	// integrated loudness in LUFS (EBU R128: 400 ms blocks, 75% overlap, -70 LUFS absolute and -10 LU relative gates). -Infinity for silence.
	// A meter so long clips can be measured window by window: push(channels) as often as needed, then result().
	V.LufsMeter = function (rate) {
		this.rate = rate; this.sh = biquad("shelf", rate, 1681.974450955533, 3.999843853973347, 0.7071752369554196); this.hp = biquad("hp", rate, 38.13547087602444, 0, 0.5003270373238773);
		this.st = []; this.q = Math.round(0.1 * rate); this.acc = 0; this.cnt = 0; this.sub = []; this.peak = 0;
	};
	V.LufsMeter.prototype.push = function (chs) {
		var n = chs[0].length, self = this;
		while (this.st.length < chs.length) this.st.push([0, 0, 0, 0, 0, 0, 0, 0]);
		var w = chs.map(function (x, c) { var s = self.st[c]; return filt(filt(x, self.sh, s, 0), self.hp, s, 4); });
		for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var k = 0; k < n; k++) { var a = x[k] < 0 ? -x[k] : x[k]; if (a > this.peak) this.peak = a; } }
		for (var i = 0; i < n; i++) {
			var e = 0; for (var c2 = 0; c2 < w.length; c2++) e += w[c2][i] * w[c2][i];
			this.acc += e; if (++this.cnt === this.q) { this.sub.push(this.acc / this.q); this.acc = 0; this.cnt = 0; }
		}
	};
	V.LufsMeter.prototype.result = function () {
		var z = [], s = this.sub; for (var j = 0; j + 4 <= s.length; j++) z.push((s[j] + s[j + 1] + s[j + 2] + s[j + 3]) / 4);
		var L = function (v) { return -0.691 + 10 * Math.log10(v); };
		var g1 = z.filter(function (v) { return L(v) > -70; }); if (!g1.length) return -Infinity;
		var m1 = g1.reduce(function (a, b) { return a + b; }, 0) / g1.length, rel = L(m1) - 10;
		var g2 = g1.filter(function (v) { return L(v) > rel; }); if (!g2.length) return -Infinity;
		return L(g2.reduce(function (a, b) { return a + b; }, 0) / g2.length);
	};
	V.lufs = function (chs, rate) { var m = new V.LufsMeter(rate); m.push(chs); return m.result(); };
	// volume (linear) that brings a clip to the target loudness without its peak going over ceilingDb
	V.normalizeGain = function (lufs, peak, target, ceilingDb) {
		if (!isFinite(lufs) || !(peak > 0)) return 1;
		var g = Math.pow(10, (target - lufs) / 20), cap = Math.pow(10, (ceilingDb == null ? -1 : ceilingDb) / 20) / peak;
		return V.clamp(Math.min(g, cap), 0.01, 16);
	};
	V.db = function (g) { return g > 0 ? 20 * Math.log10(g) : -Infinity; };
	V.fromDb = function (d) { return Math.pow(10, d / 20); };
	// planar Float32 channels -> 16-bit PCM WAV (ArrayBuffer); the preview plays noise-removed sound from it at other speeds with the pitch kept
	V.wav16 = function (ch, rate) {
		var n = ch[0].length, k = ch.length, buf = new ArrayBuffer(44 + n * k * 2), dv = new DataView(buf), i, c, o = 44;
		function str(p, s) { for (var j = 0; j < s.length; j++) dv.setUint8(p + j, s.charCodeAt(j)); }
		str(0, "RIFF"); dv.setUint32(4, 36 + n * k * 2, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, k, true);
		dv.setUint32(24, rate, true); dv.setUint32(28, rate * k * 2, true); dv.setUint16(32, k * 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, n * k * 2, true);
		for (i = 0; i < n; i++) for (c = 0; c < k; c++) { var v = Math.max(-1, Math.min(1, ch[c][i])); dv.setInt16(o, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true); o += 2; }
		return buf;
	};
	// waveform: max |x| per bin -> Uint8Array (0..255)
	V.peaks = function (chs, rate, perSec) {
		var bin = Math.max(1, Math.round(rate / perSec)), n = Math.ceil(chs[0].length / bin), out = new Uint8Array(n);
		for (var b = 0; b < n; b++) { var m = 0; for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var i = b * bin, e = Math.min(x.length, i + bin); i < e; i++) { var a = x[i] < 0 ? -x[i] : x[i]; if (a > m) m = a; } } out[b] = Math.min(255, Math.round(Math.sqrt(m) * 255)); }
		return out;
	};

	/* ---------- picture ---------- */
	// where a source picture lands on the W x H frame: fitted inside (contain), scaled about its centre, centred at (x, y) as fractions; crop as fractions
	V.place = function (sw, sh, c, W, H) {
		var cr = c.crop || { l: 0, t: 0, r: 0, b: 0 }, sx = sw * cr.l, sy = sh * cr.t, cw = sw * Math.max(0.01, 1 - cr.l - cr.r), ch = sh * Math.max(0.01, 1 - cr.t - cr.b);
		var k = Math.min(W / sw, H / sh) * (c.scale == null ? 1 : c.scale), dw = cw * k, dh = ch * k;
		// the crop keeps the remaining part where it was in the uncropped picture
		var fullW = sw * k, fullH = sh * k, left = (c.x == null ? 0.5 : c.x) * W - fullW / 2 + sx * k, top = (c.y == null ? 0.5 : c.y) * H - fullH / 2 + sy * k;
		return { sx: sx, sy: sy, sw: cw, sh: ch, dx: left, dy: top, dw: dw, dh: dh };
	};
	V.hit = function (r, x, y, pad) { pad = pad || 0; return x >= r.dx - pad && x <= r.dx + r.dw + pad && y >= r.dy - pad && y <= r.dy + r.dh + pad; };
	V.EXPORT_SIZES = [["project", "Same as the project"], ["2160", "4K (2160p)"], ["1440", "1440p"], ["1080", "1080p (Full HD)"], ["720", "720p"], ["480", "480p"]];
	// export size for a preset: the short side becomes the preset, aspect kept, even numbers
	V.exportSize = function (p, preset) {
		var w = p.w, h = p.h;
		if (preset && preset !== "project") { var k = (+preset) / Math.min(w, h); w = w * k; h = h * k; }
		return { w: Math.max(2, Math.round(w / 2) * 2), h: Math.max(2, Math.round(h / 2) * 2) };
	};
	V.QUALITY = { high: 0.14, balanced: 0.09, small: 0.055 };   // bits per pixel per frame
	V.bitrate = function (w, h, fps, q) { var bpp = V.QUALITY[q] || V.QUALITY.balanced; return Math.round(V.clamp(w * h * Math.min(fps, 60) * bpp * (fps > 30 ? 0.75 : 1), 400e3, 80e6)); };
	V.avcCodec = function (w, h, fps) {
		var mbs = Math.ceil(w / 16) * Math.ceil(h / 16), rate = mbs * fps, lv = [[11880, 396, "15"], [40500, 1620, "1e"], [108000, 3600, "1f"], [216000, 5120, "20"], [245760, 8192, "28"], [522240, 8704, "2a"], [589824, 22080, "32"], [983040, 36864, "33"], [2073600, 36864, "34"], [4177920, 139264, "3c"], [8355840, 139264, "3d"], [16711680, 139264, "3e"]];
		for (var j = 0; j < lv.length; j++) if (rate <= lv[j][0] && mbs <= lv[j][1]) return "avc1.6400" + lv[j][2];
		return "avc1.64003e";
	};


	/* ---------- animations (Camtasia-style: each one moves the clip from where it is to new values over a stretch of time) ---------- */
	// an animation: { id, t (start, seconds after the clip's start), d (length), ease, to: {props at its end}, from: {props at its start, optional},
	// kind (the preset it came from, for its name) }. Props: x, y (centre as a share of the frame), scale, rot (degrees), op (0..1), cl ct cr cb (crop).
	// The state before the first animation is the clip's own values; after an animation its "to" values hold. "from" values only apply while it
	// runs (a slide in starts off the frame and ends where the clip is). Preview and export both draw through posAt, so they always agree.
	V.ANIM_PROPS = ["x", "y", "scale", "rot", "op", "cl", "ct", "cr", "cb"];
	V.EASES = [["inout", "Smooth (ease in and out)"], ["linear", "Linear (steady)"], ["out", "Ease out (slows down at the end)"], ["in", "Ease in (speeds up)"], ["back", "Overshoot (bounces past, then settles)"]];
	V.ease = function (name, u) {
		u = V.clamp(u, 0, 1);
		switch (name) {
			case "linear": return u;
			case "in": return u * u * u;
			case "out": return 1 - Math.pow(1 - u, 3);
			case "back": var k = 1.70158, v = u - 1; return 1 + (k + 1) * v * v * v + k * v * v;
			default: return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
		}
	};
	function num(x, d) { x = +x; return isFinite(x) ? x : d; }
	function cleanProps(o) {
		if (!o || typeof o !== "object") return null;
		var r = {}, any = false;
		V.ANIM_PROPS.forEach(function (k) {
			if (o[k] == null || !isFinite(+o[k])) return;
			var v = +o[k];
			if (k === "scale") v = V.clamp(v, 0.01, 40); else if (k === "op") v = V.clamp(v, 0, 1); else if (k.length === 2 && k[0] === "c") v = V.clamp(v, 0, 0.95); else if (k === "rot") v = V.clamp(v, -36000, 36000); else v = V.clamp(v, -20, 20);
			r[k] = v; any = true;
		});
		return any ? r : null;
	}
	// animations read from a file / storage: keep only sane ones, sorted by start
	V.cleanAnims = function (arr) {
		if (!Array.isArray(arr) || !arr.length) return null;
		var out = arr.filter(function (a) { return a && typeof a === "object"; }).map(function (a) {
			var o = { id: String(a.id || V.uid("a")).slice(0, 40), t: num(a.t, 0), d: V.clamp(num(a.d, 1), 0.02, 3600), ease: V.EASES.some(function (e) { return e[0] === a.ease; }) ? a.ease : "inout", kind: String(a.kind || "custom").slice(0, 20) };
			var to = cleanProps(a.to), from = cleanProps(a.from); if (to) o.to = to; if (from) o.from = from;
			return o;
		}).filter(function (a) { return a.to || a.from; });
		out.sort(function (x, y) { return x.t - y.t; });
		return out.length ? out : null;
	};
	// the clip's own (un-animated) values
	V.baseState = function (c) {
		var cr = c.crop || {};
		return { x: c.x == null ? 0.5 : c.x, y: c.y == null ? 0.5 : c.y, scale: c.scale == null ? 1 : c.scale, rot: c.rot || 0, op: c.op == null ? 1 : c.op, cl: cr.l || 0, ct: cr.t || 0, cr: cr.r || 0, cb: cr.b || 0 };
	};
	V.setBase = function (c, s) { c.x = s.x; c.y = s.y; c.scale = s.scale; c.rot = s.rot; c.op = s.op; c.crop = { l: s.cl, t: s.ct, r: s.cr, b: s.cb }; return c; };
	function sortedAnims(c) { return (c.anims || []).slice().sort(function (a, b) { return a.t - b.t; }); }
	function lerpState(s, a, u) {
		var f = Object.assign({}, s, a.from || {}), g = Object.assign({}, s, a.to || {}), o = {};
		V.ANIM_PROPS.forEach(function (k) { o[k] = f[k] + (g[k] - f[k]) * u; });
		return o;
	}
	// state at rel seconds after the clip's start (flat props)
	V.stateAt = function (c, rel) {
		var s = V.baseState(c), L = sortedAnims(c);
		for (var j = 0; j < L.length; j++) {
			var a = L[j];
			if (rel >= a.t + a.d - EPS) { if (a.to) s = Object.assign(s, a.to); continue; }
			if (rel < a.t) break;
			s = lerpState(s, a, V.ease(a.ease, (rel - a.t) / a.d));
		}
		return s;
	};
	// what the compositor needs at timeline time t: { x, y, scale, rot, op, crop }
	V.posAt = function (c, t) {
		var s = c.anims && c.anims.length ? V.stateAt(c, t - c.start) : V.baseState(c);
		return { x: s.x, y: s.y, scale: s.scale, rot: s.rot, op: s.op, crop: { l: s.cl, t: s.ct, r: s.cr, b: s.cb } };
	};
	// the animation running at rel (strictly inside it, more than tol from both ends), or null
	V.animRunning = function (c, rel, tol) {
		tol = tol == null ? 1e-3 : tol; var L = c.anims || [];
		for (var j = 0; j < L.length; j++) if (rel > L[j].t + tol && rel < L[j].t + L[j].d - tol) return L[j];
		return null;
	};
	// who decides prop k at rel: the last animation that has ended by then and sets k in its "to" (edit that one's end value), else the clip itself
	V.propOwner = function (c, rel, k, tol) {
		tol = tol == null ? 1e-3 : tol; var L = sortedAnims(c), own = null;
		L.forEach(function (a) { if (a.t + a.d <= rel + tol && a.to && a.to[k] != null) { if (!own || a.t + a.d >= own.t + own.d) own = a; } });
		return own;
	};
	// set prop k to v as seen at rel: on the animation that decides it there, else on the clip (moving text at an animation's end moves that keyframe)
	// the animation that ends at rel (within tol), the latest-starting one when several do
	V.animEndingAt = function (c, rel, tol) {
		tol = tol == null ? 1e-3 : tol; var best = null;
		(c.anims || []).forEach(function (a) { if (Math.abs(a.t + a.d - rel) <= tol && (!best || a.t > best.t)) best = a; });
		return best;
	};
	// with the playhead at an animation's end, a change goes into that animation's end values (adding the prop if it had none: Camtasia's
	// "move it at the end of the arrow"); elsewhere it goes to whoever decides the value there
	V.setPropAt = function (c, rel, k, v, tol) {
		var e = V.animEndingAt(c, rel, tol); if (e) { e.to = e.to || {}; e.to[k] = v; return e; }
		var a = V.propOwner(c, rel, k, tol);
		if (a) { a.to[k] = v; return a; }
		var b = V.baseState(c); b[k] = v; V.setBase(c, b); return null;
	};
	// shift all animations by dt (seconds inside the clip)
	V.shiftAnims = function (anims, dt) { return (anims || []).map(function (a) { var o = JSON.parse(JSON.stringify(a)); o.t = Math.round((o.t + dt) * 1e6) / 1e6; return o; }); };
	// cut a clip's animations at rel: left = those starting before it, right = those still going (times from the cut; a running one keeps a
	// negative start so it carries on exactly), base = the right half's own values (everything that had ended by then)
	V.splitAnims = function (c, rel) {
		var L = sortedAnims(c), b = V.baseState(c), left = [], right = [];
		L.forEach(function (a) {
			if (a.t < rel - EPS) left.push(JSON.parse(JSON.stringify(a)));
			if (a.t + a.d <= rel + EPS) { if (a.to) Object.assign(b, a.to); }
			else { var o = JSON.parse(JSON.stringify(a)); o.t = Math.round((a.t - rel) * 1e6) / 1e6; right.push(o); }
		});
		return { left: left.length ? left : null, right: right.length ? right : null, base: b };
	};
	// zoom-n-pan: the values that make the frame show rect (frame pixels, as it looks with state s) filling the W x H frame
	V.zoomToRect = function (s, rect, W, H) {
		var z = Math.min(W / Math.max(1, rect.w), H / Math.max(1, rect.h)), rx = rect.x + rect.w / 2, ry = rect.y + rect.h / 2;
		return { x: (W / 2 + (s.x * W - rx) * z) / W, y: (H / 2 + (s.y * H - ry) * z) / H, scale: V.clamp(s.scale * z, 0.01, 40) };
	};
	// a rectangle of the frame's shape centred at (cx, cy), w wide, kept inside the frame where it fits
	V.frameRect = function (cx, cy, w, W, H) { w = V.clamp(w, 8, W); var h = w * H / W, x = V.clamp(cx - w / 2, 0, W - w), y = V.clamp(cy - h / 2, 0, H - h); return { x: x, y: y, w: w, h: h }; };
	V.ANIM_PRESETS = [
		{ id: "zoomin", name: "Zoom in", desc: "1.5× bigger", at: "here" }, { id: "zoomout", name: "Zoom out", desc: "Back to the full frame", at: "here" },
		{ id: "zoompan", name: "Zoom-n-pan", desc: "Draw a box on the preview", at: "here", rect: true },
		{ id: "slidein-l", name: "Slide in", desc: "From the left", at: "start" }, { id: "slidein-r", name: "Slide in", desc: "From the right", at: "start" },
		{ id: "slidein-b", name: "Slide in", desc: "From below", at: "start" }, { id: "slideout-l", name: "Slide out", desc: "To the left", at: "end" },
		{ id: "slideout-r", name: "Slide out", desc: "To the right", at: "end" }, { id: "fadein", name: "Fade in", desc: "From see-through", at: "start" },
		{ id: "fadeout", name: "Fade out", desc: "To see-through", at: "end" }, { id: "scaleup", name: "Scale up", desc: "1.25× bigger", at: "here" },
		{ id: "scaledown", name: "Scale down", desc: "0.8× smaller", at: "here" }, { id: "popin", name: "Pop in", desc: "Grows from nothing", at: "start" },
		{ id: "spin", name: "Spin", desc: "One full turn", at: "here" }, { id: "tilt", name: "Tilt", desc: "Turn 10°", at: "here" },
		{ id: "custom", name: "Custom", desc: "Then move it in the preview", at: "here" }
	];
	V.animPreset = function (id) { for (var j = 0; j < V.ANIM_PRESETS.length; j++) if (V.ANIM_PRESETS[j].id === id) return V.ANIM_PRESETS[j]; return null; };
	// make the animation for a preset: s = the clip's state where it starts, box = { w, h } of the clip on the frame (frame pixels), W x H frame,
	// o = { rect (zoom-n-pan) }. -> { to, from } (either may be missing)
	V.animValues = function (id, s, box, W, H, o) {
		o = o || {}; var bw = box ? box.w : W, bh = box ? box.h : H;
		switch (id) {
			case "zoomin": return { to: { scale: s.scale * 1.5 } };
			case "zoomout": return { to: { x: 0.5, y: 0.5, scale: 1, rot: 0 } };
			case "zoompan": return o.rect ? { to: V.zoomToRect(s, o.rect, W, H) } : null;
			case "scaleup": return { to: { scale: s.scale * 1.25 } };
			case "scaledown": return { to: { scale: s.scale * 0.8 } };
			case "slidein-l": return { from: { x: -(bw / 2) / W - 0.01 } };
			case "slidein-r": return { from: { x: 1 + (bw / 2) / W + 0.01 } };
			case "slidein-b": return { from: { y: 1 + (bh / 2) / H + 0.01 } };
			case "slideout-l": return { to: { x: -(bw / 2) / W - 0.01 } };
			case "slideout-r": return { to: { x: 1 + (bw / 2) / W + 0.01 } };
			case "fadein": return { from: { op: 0 } };
			case "fadeout": return { to: { op: 0 } };
			case "popin": return { from: { scale: Math.max(0.01, s.scale * 0.02), op: 0 } };
			case "spin": return { to: { rot: s.rot + 360 } };
			case "tilt": return { to: { rot: s.rot + 10 } };
			default: return { to: { x: s.x, y: s.y, scale: s.scale, rot: s.rot, op: s.op } };
		}
	};
	// where a new animation of length d goes inside a clip of length len: "start", "end", or at rel ("here"), kept inside the clip
	V.animSlot = function (at, rel, d, len) { d = Math.min(d, Math.max(0.05, len)); var t = at === "start" ? 0 : at === "end" ? len - d : V.clamp(rel, 0, Math.max(0, len - d)); return { t: Math.round(t * 1e6) / 1e6, d: d }; };
	V.animName = function (a) { var p = V.animPreset(a.kind); return p ? p.name + (/^slide/.test(p.id) ? " " + p.desc.toLowerCase() : "") : "Animation"; };

	/* ---------- preview view: zoom and pan of the canvas inside the stage ---------- */
	// fit the W x H frame into a cw x ch stage with margin pixels around it -> { k (stage px per frame px), ox, oy (frame origin) }
	V.viewFit = function (cw, ch, W, H, margin) {
		margin = margin == null ? 12 : margin; var k = Math.max(1e-4, Math.min((cw - 2 * margin) / W, (ch - 2 * margin) / H));
		return { k: k, ox: (cw - W * k) / 2, oy: (ch - H * k) / 2 };
	};
	// zoom to k2 keeping the stage point (px, py) over the same frame point
	V.viewZoomAt = function (v, k2, px, py) { var fx = (px - v.ox) / v.k, fy = (py - v.oy) / v.k; return { k: k2, ox: px - fx * k2, oy: py - fy * k2 }; };
	V.ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
	// rotate point (x, y) by deg degrees about (cx, cy)
	V.rotPt = function (x, y, cx, cy, deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }; };

	/* ---------- magnetic tracks (clips close up to the left, no gaps) ---------- */
	// lay the clips of one track end to end from 0, in their current order (by start; ties keep array order)
	V.pack = function (p, trackId) {
		var t = 0; V.onTrack(p, trackId).forEach(function (c) { c.start = t; t = V.end(c); });
		return p;
	};
	// put clip id on a magnetic track at the place nearest "want": the others are packed as if it were not there, it goes before the first
	// clip whose middle is after its own middle, then the track is packed again
	V.magnetInsert = function (p, trackId, id, want) {
		var c = V.clip(p, id); if (!c) return p;
		c.track = trackId;
		var ign = {}; ign[id] = 1;
		var others = V.onTrack(p, trackId, ign), t = 0, d = V.dur(c), mid = want + d / 2, k = others.length;
		others.forEach(function (o) { o.start = t; t = V.end(o); });
		for (var j = 0; j < others.length; j++) if (others[j].start + V.dur(others[j]) / 2 >= mid) { k = j; break; }
		var order = others.slice(0, k).concat([c], others.slice(k)); t = 0;
		order.forEach(function (o) { o.start = t; t = V.end(o); });
		return p;
	};
	// pack every magnetic track, then let linked partners follow (called on every edit)
	V.applyMagnets = function (p) {
		p.tracks.forEach(function (tr) { if (tr.mag) V.pack(p, tr.id); });
		V.syncLinks(p);
		return p;
	};

	/* ---------- linked clips (a video and its separated sound) ---------- */
	V.partners = function (p, c) { return c && c.link ? p.clips.filter(function (x) { return x !== c && x.link === c.link; }) : []; };
	// ids plus the ids of every clip linked to them
	V.withLinks = function (p, ids) {
		var set = {}, links = {}; ids.forEach(function (i) { set[i] = 1; var c = V.clip(p, i); if (c && c.link) links[c.link] = 1; });
		p.clips.forEach(function (c) { if (c.link && links[c.link]) set[c.id] = 1; });
		return Object.keys(set);
	};
	// partners keep the leader's timing: the leader is the video clip (else the first); a partner on a magnetic track is left where the track put it
	V.syncLinks = function (p) {
		var groups = {};
		p.clips.forEach(function (c) { if (c.link) (groups[c.link] = groups[c.link] || []).push(c); });
		Object.keys(groups).forEach(function (k) {
			var g = groups[k]; if (g.length < 2) { g[0].link = null; return; }
			var lead = g.filter(function (c) { return c.type === "video"; })[0] || g[0];
			g.forEach(function (c) {
				if (c === lead) return; var tr = V.track(p, c.track); if (tr && tr.mag && !(V.track(p, lead.track) || {}).mag) return;
				c.start = lead.start; c.in = lead.in; c.out = lead.out; c.speed = lead.speed; c.xin = lead.xin || 0;
			});
		});
		return p;
	};
	// "Separate video and audio": the video's sound becomes its own clip on an audio track (one where it fits, else makeTrack()), linked to it
	V.separateAudio = function (p, id, newId, linkId, makeTrack) {
		var c = V.clip(p, id); if (!c || c.type !== "video" || c.noAudio) return null;
		var d = V.dur(c), tr = null, as = p.tracks.filter(function (t) { return t.kind === "a" && !t.lock; });
		for (var j = 0; j < as.length; j++) if (as[j].mag ? !V.onTrack(p, as[j].id).length : V.canPlace(p, as[j].id, c.start, d)) { tr = as[j]; break; }
		if (!tr) tr = makeTrack ? makeTrack() : null; if (!tr) return null;
		var a = V.clipDefaults({ id: newId, type: "audio", media: c.media, track: tr.id, start: c.start, in: c.in, out: c.out, speed: c.speed, vol: c.vol, mute: c.mute, fin: c.fin, fout: c.fout, xin: c.xin,
			clean: c.clean ? JSON.parse(JSON.stringify(c.clean)) : null, lufs: c.lufs, afx: c.afx ? JSON.parse(JSON.stringify(c.afx)) : null, link: linkId });
		c.link = linkId; c.noAudio = true; c.clean = null; c.afx = null; c.lufs = null;
		p.clips.push(a);
		return a;
	};
	// put the sound back into the video clip (the separated audio clips of the group are removed)
	V.joinAudio = function (p, id) {
		var c = V.clip(p, id); if (!c) return null;
		var g = [c].concat(V.partners(p, c)), v = g.filter(function (x) { return x.type === "video"; })[0], a = g.filter(function (x) { return x.type === "audio" && x.media === (v && v.media); })[0];
		if (!v) return null;
		if (a) { v.vol = a.vol; v.mute = a.mute; v.clean = a.clean; v.afx = a.afx; v.lufs = a.lufs; p.clips = p.clips.filter(function (x) { return x !== a; }); }
		v.noAudio = false; if (!V.partners(p, v).length) v.link = null;
		return v;
	};
	V.unlink = function (p, id) { var c = V.clip(p, id); if (!c || !c.link) return p; var k = c.link; p.clips.forEach(function (x) { if (x.link === k) x.link = null; }); return p; };
	// split clips ids (and their partners) at t; a split pair gets a new link for its right halves. -> ids of the right halves
	V.splitAt = function (p, ids, t, newId, minDur) {
		var all = V.withLinks(p, ids), right = [], relink = {};
		all.forEach(function (id) {
			var c = V.clip(p, id); if (!c) return;
			var r = V.split(c, t, newId(), minDur); if (!r) return;
			if (c.link) { relink[c.link] = relink[c.link] || newId(); r[1].link = relink[c.link]; }
			p.clips.splice(p.clips.indexOf(c), 1, r[0], r[1]); right.push(r[1].id);
		});
		return right;
	};

	/* ---------- audio effects (non-destructive: a gain envelope worked out from the clip's own sound) ---------- */
	V.AFX_DEFAULT = {
		level: { on: false, target: -20, maxUp: 12, maxDown: 12, win: 3, gate: -50 },   // leveler: brings the loudness over a few seconds to the target (dBFS RMS)
		comp: { on: false, thr: -24, ratio: 3, knee: 6, att: 0.01, rel: 0.2, makeup: null },   // compressor (makeup null = automatic)
		duck: { on: false, amt: 12, gate: -45 }   // ducking: this clip is lowered while other clips have sound (music under a voice)
	};
	V.afxOf = function (c) {
		var a = (c && c.afx) || {}, o = {};
		Object.keys(V.AFX_DEFAULT).forEach(function (k) { o[k] = Object.assign({}, V.AFX_DEFAULT[k], a[k] || {}); });
		return o;
	};
	V.afxOn = function (c) { var a = c && c.afx; return !!(a && ((a.level && a.level.on) || (a.comp && a.comp.on) || (a.duck && a.duck.on))); };
	// streaming level meter: RMS and peak (dBFS) of every hop-second block of the (summed) channels
	V.LevelMeter = function (rate, hop) { this.rate = rate; this.hop = hop || 0.01; this.n = Math.max(1, Math.round(rate * this.hop)); this.acc = 0; this.pk = 0; this.cnt = 0; this.rms = []; this.peak = []; };
	V.LevelMeter.prototype.push = function (chs) {
		var nc = chs.length, len = chs[0].length;
		for (var i = 0; i < len; i++) {
			var e = 0, m = 0; for (var c = 0; c < nc; c++) { var x = chs[c][i]; e += x * x; if (x > m) m = x; else if (-x > m) m = -x; }
			this.acc += e / nc; if (m > this.pk) this.pk = m;
			if (++this.cnt === this.n) { this.rms.push(V.db(Math.sqrt(this.acc / this.n))); this.peak.push(V.db(this.pk)); this.acc = 0; this.pk = 0; this.cnt = 0; }
		}
	};
	V.LevelMeter.prototype.result = function (start) {
		var f = function (a) { var o = new Float32Array(a.length); for (var i = 0; i < a.length; i++) o[i] = isFinite(a[i]) ? Math.max(-120, a[i]) : -120; return o; };
		return { start: start || 0, hop: this.hop, rms: f(this.rms), peak: f(this.peak) };
	};
	V.levels = function (chs, rate, hop, start) { var m = new V.LevelMeter(rate, hop); m.push(chs); return m.result(start); };
	// compressor gain change (dB, <= 0) for an input level x (dB): threshold T, ratio R, soft knee W dB
	V.compStatic = function (x, T, R, W) {
		var s = 1 / R - 1, d = x - T; W = W || 0;
		if (2 * d < -W) return 0;
		if (W > 0 && 2 * Math.abs(d) <= W) return s * (d + W / 2) * (d + W / 2) / (2 * W);
		return s * d;
	};
	// automatic make-up gain: what the compressor takes off a sound at the reference level (the leveler's target, else -18 dBFS, a usual
	// speech level), so the average loudness stays about where it was and only the peaks come down
	V.compMakeup = function (o, ref) { return o.makeup != null && isFinite(o.makeup) ? o.makeup : -V.compStatic(ref == null ? -18 : ref, o.thr, o.ratio, o.knee); };
	// gain (dB) per block: static curve on the block level, smoothed with attack (gain going down) and release (gain coming back)
	V.compGain = function (lv, o, hop) {
		var n = lv.length, out = new Float32Array(n), aA = Math.exp(-hop / Math.max(1e-4, o.att)), aR = Math.exp(-hop / Math.max(1e-4, o.rel)), g = 0;
		for (var i = 0; i < n; i++) { var want = V.compStatic(lv[i], o.thr, o.ratio, o.knee), a = want < g ? aA : aR; g = a * g + (1 - a) * want; out[i] = g; }
		return out;
	};
	// leveler gain (dB) per block: target minus the loudness of the blocks above the gate within +-win/2 s (centred, so it looks ahead);
	// in silence the gain is held; then smoothed both ways (no lag) and limited to -maxDown..+maxUp
	V.levelGain = function (rms, o, hop) {
		var n = rms.length, E = new Float64Array(n + 1), N = new Float64Array(n + 1), w = Math.max(1, Math.round(o.win / 2 / hop)), raw = new Float32Array(n), last = 0, i;
		for (i = 0; i < n; i++) { var on = rms[i] > o.gate; E[i + 1] = E[i] + (on ? Math.pow(10, rms[i] / 10) : 0); N[i + 1] = N[i] + (on ? 1 : 0); }
		var have = false;
		for (i = 0; i < n; i++) {
			var a = Math.max(0, i - w), b = Math.min(n, i + w + 1), cnt = N[b] - N[a];
			if (cnt >= Math.max(1, 0.1 * (b - a))) { var L = 10 * Math.log10((E[b] - E[a]) / cnt); last = V.clamp(o.target - L, -o.maxDown, o.maxUp); if (!have) { for (var k = 0; k < i; k++) raw[k] = last; have = true; } }
			raw[i] = last;
		}
		var al = Math.exp(-hop / 0.25), y = 0;
		for (i = 0; i < n; i++) { y = i ? al * y + (1 - al) * raw[i] : raw[i]; raw[i] = y; }
		for (i = n - 1; i >= 0; i--) { y = i < n - 1 ? al * y + (1 - al) * raw[i] : raw[i]; raw[i] = y; }
		return raw;
	};
	// the whole envelope of a clip: { start, hop, g: linear gain per block } (leveler first, then the compressor on the levelled sound)
	V.fxEnvelope = function (lev, afx) {
		var n = lev.rms.length, tot = new Float32Array(n), A = afx, i;
		var lg = A.level && A.level.on ? V.levelGain(lev.rms, A.level, lev.hop) : null;
		if (A.comp && A.comp.on) {
			var x = new Float32Array(n); for (i = 0; i < n; i++) x[i] = lev.rms[i] + (lg ? lg[i] : 0);
			var cg = V.compGain(x, A.comp, lev.hop), mk = V.compMakeup(A.comp, A.level && A.level.on ? A.level.target : -18);
			for (i = 0; i < n; i++) tot[i] = (lg ? lg[i] : 0) + cg[i] + mk;
		} else if (lg) tot.set(lg);
		var g = new Float32Array(n); for (i = 0; i < n; i++) g[i] = Math.pow(10, Math.min(24, tot[i]) / 20);
		return { start: lev.start, hop: lev.hop, g: g };
	};
	// envelope value at source time s (linear between blocks; outside it the nearest end)
	V.envAt = function (env, s) {
		var g = env.g, n = g.length; if (!n) return 1;
		var x = (s - env.start) / env.hop - 0.5, k = Math.floor(x);
		if (k < 0) return g[0]; if (k >= n - 1) return g[n - 1];
		var f = x - k; return g[k] + (g[k + 1] - g[k]) * f;
	};
	// share (0..1) of the blocks within +-hw seconds of s that are above gate, doubled and capped: a smooth "is someone talking" signal
	V.activePrefix = function (lev, gate) { var r = lev.rms, a = new Uint32Array(r.length + 1); for (var i = 0; i < r.length; i++) a[i + 1] = a[i] + (r[i] > gate ? 1 : 0); return a; };
	V.presenceAt = function (lev, pre, s, hw) {
		var n = lev.rms.length, a = Math.max(0, Math.floor((s - hw - lev.start) / lev.hop)), b = Math.min(n, Math.ceil((s + hw - lev.start) / lev.hop));
		if (b <= a) return 0;
		return Math.min(1, 2 * (pre[b] - pre[a]) / (b - a));
	};

	/* ---------- waveform data ---------- */
	// levels stored as bytes: 0 = -96 dBFS or less, 255 = 0 dBFS (0.38 dB steps)
	V.encDb = function (a) { var d = V.db(a); return !isFinite(d) || d <= -96 ? 0 : Math.min(255, Math.round((d + 96) / 96 * 255)); };
	V.decDb = function (b) { return b <= 0 ? -Infinity : b / 255 * 96 - 96; };
	// peak and RMS per bin (perSec bins a second) -> { pk, rms, r } byte arrays (encDb). Bin edges are worked out from the exact sample
	// rate, so 44.1 kHz at 200 a second (220.5 samples) never drifts when 10 s windows are joined end to end
	V.WAVE_RATE = 200;
	V.wave = function (chs, rate, perSec) {
		perSec = perSec || V.WAVE_RATE;
		var len = chs[0].length, n = Math.max(1, Math.round(len * perSec / rate)), pk = new Uint8Array(n), rm = new Uint8Array(n), step = rate / perSec;
		for (var b = 0; b < n; b++) {
			var m = 0, e = 0, cnt = 0, i0 = Math.floor(b * step), i1 = Math.min(len, Math.max(i0 + 1, Math.floor((b + 1) * step)));
			for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var i = i0; i < i1; i++) { var v = x[i]; e += v * v; cnt++; if (v > m) m = v; else if (-v > m) m = -v; } }
			pk[b] = V.encDb(m); rm[b] = V.encDb(cnt ? Math.sqrt(e / cnt) : 0);
		}
		return { pk: pk, rms: rm, r: perSec };
	};
	// height (0..1) a level (dB) is drawn at: "db" = a -54..0 dB scale (quiet parts visible), "lin" = amplitude
	V.waveY = function (db, mode) {
		if (!isFinite(db)) return 0;
		if (mode === "lin") return V.clamp(Math.pow(10, db / 20), 0, 1);
		return V.clamp((db + 54) / 54, 0, 1);
	};

	/* ---------- canvas size ---------- */
	// [value, name, group]: the canvas size menu groups them
	V.CANVAS_PRESETS = [["854x480", "480p (854×480)", "16:9"], ["1280x720", "720p (1280×720)", "16:9"], ["1920x1080", "1080p Full HD (1920×1080)", "16:9"], ["2560x1440", "1440p (2560×1440)", "16:9"], ["3840x2160", "4K (3840×2160)", "16:9"],
		["1080x1920", "Vertical 9:16, 1080×1920 (Shorts, Reels, TikTok)", "Vertical and square"], ["720x1280", "Vertical 9:16, 720×1280", "Vertical and square"], ["1080x1080", "Square 1080×1080", "Vertical and square"], ["1080x1350", "Portrait 4:5, 1080×1350", "Vertical and square"],
		["640x480", "4:3, 640×480", "4:3"], ["1440x1080", "4:3, 1440×1080", "4:3"]];
	V.presetOf = function (w, h) { var k = w + "x" + h; for (var j = 0; j < V.CANVAS_PRESETS.length; j++) if (V.CANVAS_PRESETS[j][0] === k) return k; return "custom"; };
	// "1280x720", "1280 × 720", "1280,720" -> { w, h } (even, 16..7680 x 16..4320) or null
	V.parseSize = function (s) {
		var m = /^\s*(\d{2,5})\s*[x×*,: ]\s*(\d{2,5})\s*$/i.exec(String(s || "")); if (!m) return null;
		var w = +m[1], h = +m[2]; if (w < 16 || h < 16 || w > 7680 || h > 4320) return null;
		return { w: Math.round(w / 2) * 2, h: Math.round(h / 2) * 2 };
	};

	/* ---------- time ---------- */
	V.tc = function (t, fps) {   // 1:02:03;15 style (frames after the semicolon)
		if (!(t >= 0)) t = 0; fps = fps || 30;
		var f = Math.floor(t * fps + 1e-6), fr = f % Math.round(fps), s = Math.floor(f / Math.round(fps)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x + ";" + (fr < 10 ? "0" : "") + fr;
	};
	V.short = function (t) { if (!(t >= 0)) t = 0; var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
	V.parseTime = function (s, fps) {
		s = String(s || "").trim(); if (!s) return null;
		var fr = 0, m = /;(\d+)$/.exec(s); if (m) { fr = +m[1] / (fps || 30); s = s.slice(0, m.index); }
		var parts = s.split(":").map(Number); if (parts.some(function (x) { return !isFinite(x); })) return null;
		var t = 0; parts.forEach(function (x) { t = t * 60 + x; });
		return t + fr;
	};
	// the "go to" box: 4:23;13, 1:02:03.5, 263, 90s, 2m30s, 1h, ;15 (frames), +10 / -1:00 (from now). Returns seconds or null.
	V.parseGoto = function (s, fps, now) {
		s = String(s || "").trim().replace(/\s+/g, "").replace(/,/g, "."); if (!s) return null;
		fps = fps || 30;
		var rel = 0; if (/^[+-]/.test(s)) { rel = s[0] === "+" ? 1 : -1; s = s.slice(1); if (!s) return null; }
		var t = null, m;
		if ((m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)f)?$/i.exec(s)) && /[hmsf]/i.test(s)) t = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) + (+m[4] || 0) / fps;
		else if (/^;\d+$/.test(s)) t = +s.slice(1) / fps;
		else if (/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}(?:;\d+)?$/.test(s)) t = V.parseTime(s, fps);
		if (t == null || !isFinite(t)) return null;
		return rel ? (now || 0) + rel * t : t;
	};
	// every place something starts or ends (clips on shown / heard tracks, the I / O marks, 0), sorted: for "previous / next clip"
	V.editPoints = function (p) {
		var pts = [0];
		p.clips.forEach(function (c) { var tr = V.track(p, c.track); if (!tr) return; pts.push(c.start, V.end(c)); });
		if (p.marks) { if (p.marks.in != null) pts.push(p.marks.in); if (p.marks.out != null) pts.push(p.marks.out); }
		pts.sort(function (a, b) { return a - b; });
		return pts.filter(function (x, i) { return i === 0 || x - pts[i - 1] > 1e-6; });
	};
	V.nextEdit = function (p, t, dir, tol) {
		var pts = V.editPoints(p), e = tol == null ? 1e-3 : tol;
		if (dir > 0) { for (var i = 0; i < pts.length; i++) if (pts[i] > t + e) return pts[i]; return null; }
		for (var j = pts.length - 1; j >= 0; j--) if (pts[j] < t - e) return pts[j]; return null;
	};
	// ruler: a tick every "step" seconds so labels are at least minPx apart
	V.tickStep = function (pps, minPx) {
		var steps = [1 / 30, 1 / 10, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
		for (var j = 0; j < steps.length; j++) if (steps[j] * pps >= (minPx || 70)) return steps[j];
		return 7200;
	};
	V.frameSnap = function (t, fps) { return Math.round(t * fps) / fps; };

	/* ---------- AAC settings of a QuickTime (.mov) sound track ----------
	   OBS / QuickTime write a version-1 sound description with the esds box inside a "wave" box, which mp4box.js does not read
	   (codec comes back as plain "mp4a" with no description). bytes = the raw stsd entry (or any bytes holding an esds box).
	   -> { codec: "mp4a.40.2", desc: Uint8Array AudioSpecificConfig } or null. */
	V.esdsAac = function (bytes) {
		var b = bytes, n = b.length, i, p = -1;
		for (i = 4; i + 4 <= n; i++) if (b[i] === 0x65 && b[i + 1] === 0x73 && b[i + 2] === 0x64 && b[i + 3] === 0x73) { p = i + 8; break; } // "esds" + version/flags
		if (p < 0) return null;
		function len() { var l = 0, k = 0, c; do { c = b[p++]; l = (l << 7) | (c & 0x7f); k++; } while ((c & 0x80) && k < 4 && p < n); return l; }
		if (b[p++] !== 0x03) return null;
		len(); p += 2; var fl = b[p++];
		if (fl & 0x80) p += 2; if (fl & 0x40) p += 1 + b[p]; if (fl & 0x20) p += 2;
		if (b[p++] !== 0x04) return null;
		len(); var oti = b[p]; p += 13;
		if (b[p++] !== 0x05) return null;
		var l = len(); if (!l || p + l > n) return null;
		var desc = b.slice(p, p + l), aot = desc[0] >> 3;
		if (aot === 31 && l > 1) aot = 32 + (((desc[0] & 7) << 3) | (desc[1] >> 5));
		return { codec: "mp4a." + (oti || 0x40).toString(16) + "." + aot, desc: desc };
	};
	// no esds at all: an AAC-LC AudioSpecificConfig made from the rate and channel count
	V.aacConfig = function (rate, chs) {
		var R = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350], fi = R.indexOf(rate);
		if (fi < 0) return null;
		return { codec: "mp4a.40.2", desc: new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (Math.min(7, chs || 2) << 3)]) };
	};

	/* ---------- undo ---------- */
	V.History = function (max) { this.max = max || 200; this.stack = []; this.i = -1; };
	V.History.prototype.push = function (s) { if (this.i >= 0 && this.stack[this.i] === s) return; this.stack = this.stack.slice(0, this.i + 1); this.stack.push(s); if (this.stack.length > this.max) this.stack.shift(); this.i = this.stack.length - 1; };
	V.History.prototype.undo = function () { if (this.i <= 0) return null; this.i--; return this.stack[this.i]; };
	V.History.prototype.redo = function () { if (this.i >= this.stack.length - 1) return null; this.i++; return this.stack[this.i]; };
	V.History.prototype.canUndo = function () { return this.i > 0; };
	V.History.prototype.canRedo = function () { return this.i < this.stack.length - 1; };

	if (typeof module !== "undefined" && module.exports) module.exports = V;
	root.MESVed = V;
})(typeof window !== "undefined" ? window : globalThis);

/* MESConvEngine: turn any video file into an MP4 (H.264 + AAC). Shared by mes.fm/convert-video and the MES Video Editor (mes.fm/video).
 *  - "native": an AVI whose picture is already H.264 is re-packed (remuxed) without touching the picture: our own AVI reader (MESConv) walks the
 *    file once in big slices (OpenDML files over 1 GB too), H.264 is copied into MP4 (B-frames get their presentation order from the slice headers),
 *    MP3 / PCM sound is decoded and made AAC with WebCodecs, AAC is copied. mp4-muxer writes the MP4, straight to disk when given a file handle.
 *  - "ffmpeg": everything else (MKV, WMV, FLV, MPG, MOV, WebM, other AVIs) goes through ffmpeg.wasm (@ffmpeg/ffmpeg 0.12.15, self-hosted in
 *    /main_js/ffmpeg/ so its worker is same-origin; @ffmpeg/core 0.12.10 single-threaded from jsDelivr, ~31 MB, downloaded on first use).
 *    The input is mounted (WORKERFS: not copied into memory); H.264 is copied, anything else is encoded with x264; the result is held in memory.
 * Nothing is uploaded. */
(function () {
	"use strict";
	var C = window.MESConv; if (!C) return;
	var LIB = { mp4: "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js" };
	var FF_MOD = "/main_js/ffmpeg/0.12.15/index.js", FF_CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/";
	var scripts = {};
	function loadScript(u) { if (!scripts[u]) scripts[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a converter library. Check your connection and try again.")); }; document.head.appendChild(s); }); return scripts[u]; }
	function signal() { var w = []; return { wait: function (ms) { return new Promise(function (r) { var t = setTimeout(done, ms || 250); function done() { clearTimeout(t); r(); } w.push(done); }); }, wake: function () { var a = w; w = []; for (var j = 0; j < a.length; j++) a[j](); } }; }

	/* ---------- a sequential reader over a File with a big window ---------- */
	function Reader(file, win) { this.f = file; this.win = win || 16777216; this.base = 0; this.buf = new Uint8Array(0); }
	Reader.prototype.read = async function (off, len) {
		if (off >= this.base && off + len <= this.base + this.buf.length) return this.buf.subarray(off - this.base, off - this.base + len);
		if (len > this.win / 2) return new Uint8Array(await this.f.slice(off, off + len).arrayBuffer());
		var end = Math.min(this.f.size, off + Math.max(this.win, len));
		this.buf = new Uint8Array(await this.f.slice(off, end).arrayBuffer()); this.base = off;
		return this.buf.subarray(0, Math.min(len, this.buf.length));
	};

	/* ---------- probe ---------- */
	// -> { container, route: {engine, why}, avi?, hdr?, h264?, size, name }
	async function probe(file) {
		var ext = C.extOf(file.name), head = new Uint8Array(await file.slice(0, 1048576).arrayBuffer()), r = { name: file.name, size: file.size, container: ext };
		if (head.length >= 12 && C.fourcc(head, 0) === "RIFF" && C.fourcc(head, 8) === "AVI ") {
			r.container = "avi";
			var hdr = C.parseAviHeader(head);
			if (!hdr.ok && hdr.needBytes) hdr = C.parseAviHeader(new Uint8Array(await file.slice(0, hdr.needBytes).arrayBuffer()));
			if (hdr.ok) {
				r.hdr = hdr; r.avi = C.describeAvi(hdr);
				if (r.avi.h264 && !r.avi.reasons.length) {
					try { var sc = await scanH264(file, hdr, r.avi, 400); Object.assign(r, sc); } catch (e) { r.avi.reasons.push("the H.264 picture could not be read (" + (e.message || e) + ")"); }
					if (r.avi.audioKind === "mp3" || r.avi.audioKind === "pcm" || r.avi.audioKind === "pcmf") {
						var ok = await audioPathOk(r.avi.audio);
						if (!ok) r.avi.reasons.push("this browser cannot convert the sound");
					}
					if (r.hasB && r.pocType !== 0) r.avi.reasons.push("B-frames of a kind this page cannot reorder");
				}
			}
		}
		r.route = C.route(r);
		return r;
	}
	async function audioPathOk(a) {
		if (!window.AudioEncoder) return false;
		var ch = Math.min(2, a.channels || 2), sr = a.sampleRate || 48000;
		try { var e = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: ch, bitrate: 192000 }); if (!e || !e.supported) return false; } catch (x) { return false; }
		if (a.kind === "mp3") { try { var d = await AudioDecoder.isConfigSupported({ codec: "mp3", sampleRate: sr, numberOfChannels: ch }); return !!(d && d.supported); } catch (x) { return false; } }
		return true;
	}
	// walk every chunk of the movi lists (and the AVIX parts of an OpenDML file); cb(id, stream, offset, size) -> false to stop
	async function walk(file, hdr, cb, onBytes) {
		var rd = new Reader(file), pos = 12, n = file.size, guard = 0;
		while (pos + 8 <= n) {
			var h = await rd.read(pos, 12), id = C.fourcc(h, 0), size = C.u32le(h, 4);
			if (!/^[\x20-\x7e]{4}$/.test(id)) { pos++; if (++guard > 65536) break; continue; }   // damaged: look for the next chunk
			guard = 0;
			if (id === "RIFF") { pos += 12; continue; }
			if (id === "LIST") { var lt = C.fourcc(h, 8); if (lt === "movi" || lt === "rec ") { pos += 12; continue; } pos += 8 + size + (size & 1); continue; }
			var st = C.streamOf(id);
			if (st >= 0) {
				if (pos + 8 + size > n) break;   // a cut-off file: stop at the last whole chunk
				var go = await cb(id, st, pos + 8, size, rd);
				if (go === false) return;
			}
			pos += 8 + size + (size & 1);
			if (onBytes) onBytes(pos);
		}
	}
	function nalsOf(data, lenSize) { return C.isAnnexB(data) ? C.splitAnnexB(data) : C.splitAvcc(data, lenSize || 4); }
	// read the first frames: parameter sets, B-frames, how far frames are reordered
	async function scanH264(file, hdr, avi, max) {
		var r = { sps: null, spsList: [], ppsList: [], lenSize: 4, hasB: false, pocType: -1, delay: 0, firstKey: -1 }, ex = avi.extra, info = null;
		if (ex && ex.length) {
			var ac = C.parseAvcC(ex);
			if (ac) { r.spsList = ac.sps; r.ppsList = ac.pps; r.lenSize = ac.lenSize; }
			else if (C.isAnnexB(ex)) C.splitAnnexB(ex).forEach(function (n) { var t = n[0] & 31; if (t === 7) r.spsList.push(n.slice()); if (t === 8) r.ppsList.push(n.slice()); });
		}
		var count = 0, pocState = {}, pairs = [], dIdx = 0, ro = new C.Reorder(function (d, p) { pairs.push([d, p]); }, 16);
		await walk(file, hdr, async function (id, st, off, size, rd) {
			if (st !== avi.videoStream || !size) return true;
			var data = await rd.read(off, size), nals = nalsOf(data, r.lenSize), au = C.inspectAU(nals);
			if (au.sps.length && !r.spsList.length) r.spsList = au.sps.map(function (x) { return x.slice(); });
			if (au.pps.length && !r.ppsList.length) r.ppsList = au.pps.map(function (x) { return x.slice(); });
			if (!info && r.spsList.length) { info = C.parseSps(r.spsList[0]); r.sps = info; r.pocType = info.pocType; }
			if (au.vcl && info) {
				var sl = C.parseSlice(au.vcl, info);
				if (r.firstKey < 0 && (au.idr || sl.type === 2)) r.firstKey = count;
				if (sl.type === 1) r.hasB = true;
				if (info.pocType === 0 && r.firstKey >= 0) ro.push(dIdx++, C.pocType0(pocState, sl, info), au.idr);
			}
			return ++count < max;
		});
		ro.flush();
		if (!r.spsList.length || !r.ppsList.length) throw new Error("no SPS / PPS");
		r.delay = r.hasB ? C.reorderDelay(pairs) : 0;
		r.codedWidth = info.width; r.codedHeight = info.height; r.codec = C.codecString(r.spsList[0]); r.bitDepth = info.bitDepth || 8;
		return r;
	}

	/* ---------- native AVI (H.264) -> MP4 remux ---------- */
	async function remuxAvi(file, p, opts) {
		await loadScript(LIB.mp4);
		var avi = p.avi, dur = avi.frameDur, us = function (s) { return Math.round(s * 1e6); }, failed = null, notes = [];
		var writable = null, target;
		if (opts.handle) { writable = await opts.handle.createWritable(); target = new Mp4Muxer.FileSystemWritableFileStreamTarget(writable); } else target = new Mp4Muxer.ArrayBufferTarget();
		var a = avi.audio, kind = avi.audioKind, hasAudio = kind === "mp3" || kind === "pcm" || kind === "pcmf" || kind === "aac";
		var ach = a ? Math.min(2, a.channels || 2) : 2, asr = a ? a.sampleRate : 48000;
		var w = p.codedWidth || avi.width, h = p.codedHeight || avi.height, fpsInt = Math.abs(avi.fps - Math.round(avi.fps)) < 1e-6 ? Math.round(avi.fps) : 0;
		var vOpts = { codec: "avc", width: w, height: h }; if (fpsInt && !p.hasB) vOpts.frameRate = fpsInt;
		var mOpts = { target: target, video: vOpts, fastStart: opts.handle ? false : "in-memory", firstTimestampBehavior: "offset" };
		var aacAsc = null;
		if (hasAudio) mOpts.audio = { codec: "aac", numberOfChannels: ach, sampleRate: asr };
		var muxer = new Mp4Muxer.Muxer(mOpts), sig = signal();
		function fail(e) { if (!failed) failed = e instanceof Error ? e : new Error(String(e && e.message || e)); sig.wake(); }
		// sound
		var adec = null, aenc = null, aIdx = 0, aSamples = 0, mp3 = null, aStart = a ? a.start * a.scale / a.rate : 0;
		if (hasAudio && kind !== "aac") {
			aenc = new AudioEncoder({ output: function (c, m) { try { muxer.addAudioChunk(c, m); } catch (e) { fail(e); } }, error: fail });
			aenc.configure({ codec: "mp4a.40.2", sampleRate: asr, numberOfChannels: ach, bitrate: ach > 1 ? 192000 : 128000 });
			aenc.addEventListener("dequeue", sig.wake);
			if (kind === "mp3") {
				mp3 = new C.Mp3Splitter();
				adec = new AudioDecoder({ output: function (ad) { try { if (!failed) aenc.encode(downmix(ad, ach)); } catch (e) { fail(e); } ad.close(); }, error: fail });
				adec.configure({ codec: "mp3", sampleRate: asr, numberOfChannels: a.channels || 2 });
				adec.addEventListener("dequeue", sig.wake);
			}
		} else if (kind === "aac" && a.extra && a.extra.length >= 2) aacAsc = a.extra;
		function downmix(ad, ch) {
			if (ad.numberOfChannels <= ch && ad.format === "f32-planar") return ad;
			var n = ad.numberOfFrames, out = new Float32Array(n * ch), tmp = new Float32Array(n);
			for (var c = 0; c < ch; c++) { ad.copyTo(tmp, { planeIndex: Math.min(c, ad.numberOfChannels - 1), format: "f32-planar" }); out.set(tmp, c * n); }
			return new AudioData({ format: "f32-planar", sampleRate: ad.sampleRate, numberOfFrames: n, numberOfChannels: ch, timestamp: ad.timestamp, data: out });
		}
		async function waitQueues() {
			while (!failed && ((aenc && aenc.encodeQueueSize > 24) || (adec && adec.decodeQueueSize > 24))) await sig.wait(500);
		}
		async function onAudio(data) {
			if (kind === "aac") {
				var d = data;
				if (d.length > 7 && d[0] === 0xff && (d[1] & 0xf0) === 0xf0) {   // ADTS: take the config from the header, strip it
					if (!aacAsc) { var prof = ((d[2] >> 6) & 3) + 1, sri = (d[2] >> 2) & 15, chc = ((d[2] & 1) << 2) | (d[3] >> 6); aacAsc = new Uint8Array([(prof << 3) | (sri >> 1), ((sri & 1) << 7) | (chc << 3)]); }
					d = d.subarray((d[1] & 1) ? 7 : 9);
				}
				if (!aacAsc) { aacAsc = new Uint8Array([0x12, 0x10]); notes.push("(the AAC sound had no setup data; assumed 44.1 kHz stereo)"); }
				var ts = aStart + aIdx * 1024 / asr, meta = aIdx === 0 ? { decoderConfig: { codec: "mp4a.40.2", sampleRate: asr, numberOfChannels: ach, description: aacAsc } } : undefined;
				muxer.addAudioChunkRaw(d.slice(), "key", us(ts), us(1024 / asr), meta); aIdx++;
				return;
			}
			if (kind === "mp3") {
				var frames = mp3.push(data);
				for (var j = 0; j < frames.length; j++) {
					var fr = frames[j];
					adec.decode(new EncodedAudioChunk({ type: "key", timestamp: us(aStart + aSamples / fr.h.sampleRate), duration: us(fr.h.samples / fr.h.sampleRate), data: fr.data }));
					aSamples += fr.h.samples;
				}
				await waitQueues(); return;
			}
			var bits = a.bits || 16, planar = C.pcmToPlanar(data, a.channels || 2, bits, kind === "pcmf");
			if (!planar[0].length) return;
			var n = planar[0].length, buf = new Float32Array(n * ach);
			for (var c = 0; c < ach; c++) buf.set(planar[Math.min(c, planar.length - 1)], c * n);
			aenc.encode(new AudioData({ format: "f32-planar", sampleRate: asr, numberOfFrames: n, numberOfChannels: ach, timestamp: us(aStart + aSamples / asr), data: buf }));
			aSamples += n; await waitQueues();
		}
		// picture
		var spsKey = p.spsList.map(function (x) { return x.join(","); }).join("|"), avcc = C.avcC(p.spsList, p.ppsList), first = true, slot = -1, dIdx = 0, seen = false, skipped = 0;
		var pend = [], ro = null, vStart = 0, D = p.delay || 0, info = p.sps, pocState = {};
		var vs = p.hdr.streams[avi.videoStream]; if (vs) vStart = vs.start * vs.scale / vs.rate;
		if (p.hasB) ro = new C.Reorder(function (d, disp) {
			var f = pend.shift();   // frames come out in decode order: the oldest pending one is d
			var pts = (disp + D) * dur, dts = d * dur; if (pts < dts) pts = dts;
			addVideo(f.data, f.key, pts, dts);
		}, 16);
		function addVideo(data, key, pts, dts) {
			var meta = first ? { decoderConfig: { codec: p.codec, codedWidth: w, codedHeight: h, description: avcc } } : undefined; first = false;
			try { muxer.addVideoChunkRaw(data, key ? "key" : "delta", us(vStart + pts), us(dur), meta, ro ? us(pts - dts) : undefined); } catch (e) { fail(e); }
		}
		function onVideo(data) {
			slot++;
			if (!data.length) return;   // a dropped / repeated frame: the previous one stays on screen longer
			var nals = nalsOf(data, p.lenSize), au = C.inspectAU(nals), sl = au.vcl && info ? C.parseSlice(au.vcl, info) : null;
			var key = au.idr || (!seen && sl && sl.type === 2) || (au.recovery && sl && sl.type === 2);
			if (!seen) { if (!key) { skipped++; return; } seen = true; }
			// parameter sets live in the MP4 header (avcC); keep them in the frame only when they change mid-stream
			var newPs = au.sps.length > 0 && au.sps.map(function (x) { return x.join(","); }).join("|") !== spsKey;
			var keep = nals.filter(function (n) { var t = n[0] & 31; if (t === 9 || t === 12) return false; if (t === 7 || t === 8) return newPs; return true; });
			var out = C.toAvcc(keep);
			if (ro) { pend.push({ data: out, key: key }); ro.push(dIdx++, C.pocType0(pocState, sl, info), au.idr); }
			else addVideo(out, key, (slot - firstSlot()) * dur, 0);
		}
		var fs = -1; function firstSlot() { if (fs < 0) fs = slot; return fs; }
		var lastPct = -1;
		await walk(file, p.hdr, async function (id, st, off, size, rd) {
			if (failed || (opts.cancelled && opts.cancelled())) return false;
			if (st === avi.videoStream) onVideo(size ? (await rd.read(off, size)).slice() : new Uint8Array(0));
			else if (hasAudio && st === avi.audioStream && size) await onAudio((await rd.read(off, size)).slice());
			return true;
		}, function (pos) { var pc = Math.floor(pos / file.size * 1000); if (pc !== lastPct) { lastPct = pc; opts.onProgress && opts.onProgress(pos / file.size); } });
		if (ro) ro.flush();
		if (opts.cancelled && opts.cancelled()) { try { if (writable) await writable.abort(); } catch (e) { /* ignore */ } throw new Error("Cancelled."); }
		if (adec) { if (mp3) { /* the last frame left in the splitter */ var tail = mp3.push(new Uint8Array(0)); tail.forEach(function (fr) { adec.decode(new EncodedAudioChunk({ type: "key", timestamp: us(aStart + aSamples / fr.h.sampleRate), data: fr.data })); aSamples += fr.h.samples; }); } await adec.flush(); }
		if (aenc) await aenc.flush();
		if (failed) { try { if (writable) await writable.abort(); } catch (e) { /* ignore */ } throw failed; }
		if (first) throw new Error("No picture frames were found in this AVI.");
		muxer.finalize();
		if (skipped) notes.push("(" + skipped + " frame" + (skipped > 1 ? "s" : "") + " before the first key frame could not be shown and were left out)");
		if (p.hasB) notes.push("(B-frames reordered)");
		if (writable) { await writable.close(); var fh = await opts.handle.getFile(); return { size: fh.size, handle: opts.handle, note: notes.join(" "), engine: "native" }; }
		var blob = new Blob([target.buffer], { type: "video/mp4" });
		return { blob: blob, size: blob.size, note: notes.join(" "), engine: "native" };
	}

	/* ---------- ffmpeg.wasm ---------- */
	var ff = null, ffLoading = null, ffLog = [], ffJob = 0;
	function ffmpeg(onStatus) {
		if (ff) return Promise.resolve(ff);
		if (!ffLoading) ffLoading = (async function () {
			var mod = await import(FF_MOD), inst = new mod.FFmpeg();
			inst.on("log", function (e) { ffLog.push(e.message); if (ffLog.length > 4000) ffLog.splice(0, 2000); if (ffmpeg.onLog) ffmpeg.onLog(e.message); });
			// the 31 MB core, with a progress bar (the browser keeps it in its cache for next time)
			var res = await fetch(FF_CORE + "ffmpeg-core.wasm"); if (!res.ok) throw new Error("Could not download the converter (" + res.status + ").");
			var total = +res.headers.get("content-length") || 32232419, got = 0, parts = [], rdr = res.body.getReader();
			while (true) { var x = await rdr.read(); if (x.done) break; parts.push(x.value); got += x.value.length; if (onStatus) onStatus("Downloading the converter, once: " + Math.min(99, Math.round(got / total * 100)) + "% of about 31 MB", got / total); }
			var wasmURL = URL.createObjectURL(new Blob(parts, { type: "application/wasm" }));
			if (onStatus) onStatus("Starting the converter...", 1);
			await inst.load({ coreURL: FF_CORE + "ffmpeg-core.js", wasmURL: wasmURL });
			ff = inst; return inst;
		})().catch(function (e) { ffLoading = null; throw e; });
		return ffLoading;
	}
	async function ffProbe(file, dir) {
		ffLog = []; await ff.exec(["-hide_banner", "-i", dir + "/" + file.name]);
		return C.parseFfmpegLog(ffLog.join("\n"));
	}
	async function convertFfmpeg(file, p, opts) {
		var inst = await ffmpeg(opts.onStatus), dir = "/in" + (++ffJob), out = "/out" + ffJob + ".mp4", cancelled = false, tick = null;
		await inst.createDir(dir); await inst.mount("WORKERFS", { files: [file] }, dir);
		try {
			var probe = await ffProbe(file, dir), plan = C.ffmpegPlan(probe, dir + "/" + file.name, out, { quality: opts.quality, reencode: opts.reencode });
			if (!plan.ok) throw new Error(plan.error);
			if (opts.onPlan) opts.onPlan(plan);
			ffmpeg.onLog = function (line) { var t = C.ffmpegTime(line); if (t != null && plan.duration && opts.onProgress) opts.onProgress(Math.min(0.99, t / plan.duration)); };
			if (opts.cancelled) tick = setInterval(function () { if (opts.cancelled() && !cancelled) { cancelled = true; try { inst.terminate(); } catch (e) { /* ignore */ } ff = null; ffLoading = null; } }, 300);
			ffLog = [];
			var code = await inst.exec(plan.args);
			if (cancelled) throw new Error("Cancelled.");
			if (code !== 0) { var errLine = ffLog.filter(function (l) { return /error|invalid|not supported|could not/i.test(l); }).slice(-2).join(" "); throw new Error("ffmpeg could not convert this file" + (errLine ? ": " + errLine : ".")); }
			var data = await inst.readFile(out); try { await inst.deleteFile(out); } catch (e) { /* ignore */ }
			var note = plan.copyVideo ? "(picture copied as it is" + (plan.hasAudio ? plan.copyAudio ? ", sound copied)" : ", sound made AAC)" : ")") : "(picture re-encoded with x264" + (plan.video ? " from " + plan.video.codec : "") + ")";
			var res = { size: data.length, note: note, engine: "ffmpeg", plan: plan };
			if (opts.handle) { var wr = await opts.handle.createWritable(); await wr.write(data); await wr.close(); res.handle = opts.handle; }
			else res.blob = new Blob([data], { type: "video/mp4" });
			return res;
		} catch (e) {
			if (cancelled) throw new Error("Cancelled.");
			if (/memory|OOM|Aborted/i.test(String(e && e.message))) { ff = null; ffLoading = null; throw new Error("The converter ran out of memory. ffmpeg in a web page can only hold about 1.5 GB: try a smaller file."); }
			throw e;
		} finally {
			clearInterval(tick); ffmpeg.onLog = null;
			if (ff) { try { await inst.unmount(dir); await inst.deleteDir(dir); } catch (e) { /* ignore */ } }
		}
	}

	/* ---------- sound only (for the Audio Editor and the Video Editor) ---------- */
	// -> { channels: Float32Array[], sampleRate } (PCM, ffmpeg) or { encoded: ArrayBuffer, kind } (MP3 / ADTS AAC bytes for decodeAudioData).
	// opts: { onStatus(text, f), onProgress(f) }. AVI with MP3 / PCM / AAC sound: our own reader, no download. Anything else: ffmpeg.wasm.
	async function extractAudio(file, opts) {
		opts = opts || {};
		var p = null;
		try { p = await probe(file); } catch (e) { p = null; }
		var avi = p && p.avi, kind = avi && avi.audioKind;
		if (p && p.container === "avi" && p.hdr) {
			if (kind === "none") throw new Error("this video has no sound track");
			if (["mp3", "pcm", "pcmf", "aac"].indexOf(kind) >= 0) {
				try { return await aviAudio(file, p, opts); }
				catch (e) { if (window.console) console.warn("[audio] AVI reader failed, trying ffmpeg", e); }
			}
		}
		return ffAudio(file, opts);
	}
	async function aviAudio(file, p, opts) {
		var avi = p.avi, a = avi.audio, kind = avi.audioKind, parts = [], total = 0, lastPct = -1;
		await walk(file, p.hdr, async function (id, st, off, size, rd) {
			if (st !== avi.audioStream || !size) return;
			var d = (await rd.read(off, size)).slice();
			if (kind === "aac" && !C.isAdts(d)) d = C.adtsFrame(d, a.extra && a.extra.length >= 2 ? a.extra : null);
			parts.push(d); total += d.length;
		}, function (pos) { var pc = Math.floor(pos / file.size * 100); if (pc !== lastPct) { lastPct = pc; if (opts.onProgress) opts.onProgress(pos / file.size); } });
		if (!total) throw new Error("this video has no sound track");
		var all = new Uint8Array(total), o = 0; parts.forEach(function (x) { all.set(x, o); o += x.length; });
		if (kind === "pcm" || kind === "pcmf") return { channels: C.pcmToPlanar(all, a.channels || 2, a.bits || 16, kind === "pcmf"), sampleRate: a.sampleRate, engine: "avi" };
		return { encoded: all.buffer, kind: kind, engine: "avi" };
	}
	async function ffAudio(file, opts) {
		var inst = await ffmpeg(opts.onStatus), dir = "/in" + (++ffJob), out = "/aud" + ffJob + ".raw";
		await inst.createDir(dir); await inst.mount("WORKERFS", { files: [file] }, dir);
		try {
			var info = await ffProbe(file, dir), dur = info.duration;
			if (!info.streams.some(function (s) { return s.type === "audio"; })) throw new Error("this file has no sound track");
			if (opts.onStatus) opts.onStatus("Reading the sound with ffmpeg", 0);
			ffmpeg.onLog = function (line) { var t = C.ffmpegTime(line); if (t != null && dur && opts.onProgress) opts.onProgress(Math.min(0.99, t / dur)); };
			ffLog = [];
			var code = await inst.exec(["-hide_banner", "-i", dir + "/" + file.name, "-vn", "-sn", "-dn", "-ac", "2", "-ar", "48000", "-f", "s16le", "-c:a", "pcm_s16le", out]);
			if (code !== 0) { var errLine = ffLog.filter(function (l) { return /error|invalid|not supported|could not/i.test(l); }).slice(-2).join(" "); throw new Error("ffmpeg could not read the sound" + (errLine ? ": " + errLine : ".")); }
			var data = await inst.readFile(out); try { await inst.deleteFile(out); } catch (e) { /* ignore */ }
			return { channels: C.s16Planar(data, 2), sampleRate: 48000, engine: "ffmpeg" };
		} catch (e) {
			if (/memory|OOM|Aborted/i.test(String(e && e.message))) { ff = null; ffLoading = null; throw new Error("the converter ran out of memory (ffmpeg in a web page holds about 1.5 GB)"); }
			throw e;
		} finally {
			ffmpeg.onLog = null;
			if (ff) { try { await inst.unmount(dir); await inst.deleteDir(dir); } catch (e) { /* ignore */ } }
		}
	}

	/* ---------- public ---------- */
	// opts: { handle (FileSystemFileHandle to write to), quality, reencode, onProgress(0..1), onStatus(text, pct), onPlan(plan), cancelled() }
	async function convert(file, opts) {
		opts = opts || {};
		var p = opts.probe || await probe(file);
		if (p.route.engine === "native" && !opts.reencode) {
			try { return await remuxAvi(file, p, opts); }
			catch (e) { if (/Cancelled/.test(e.message)) throw e; if (window.console) console.warn("[converter] native remux failed, trying ffmpeg", e); }
		}
		if (file.size > C.FFMPEG_SAFE_BYTES && opts.onStatus) opts.onStatus("This is a big file for ffmpeg in a web page (about 1.5 GB at most); it may run out of memory.", 0);
		return convertFfmpeg(file, p, opts);
	}
	window.MESConvEngine = { probe: probe, convert: convert, extractAudio: extractAudio, ffmpeg: ffmpeg, loadScript: loadScript, Reader: Reader };
})();

/* MES Video Editor core: state, storage (IndexedDB), importing media (anything the converter reads), MP4 sample tables (mp4box.js),
 * thumbnails, waveforms, sound access by time range (WebCodecs AudioDecoder, cached in 10 s windows) and the compositor that draws a frame
 * (used by the preview and by the export). Shares window.VE with preview.js / timeline.js / export.js / app.js. */
(function () {
	"use strict";
	var V = window.MESVed, C = window.MESConv, E = window.MESConvEngine; if (!V || !document.getElementById("vd")) return;
	var VE = window.VE = { V: V };
	VE.LIB = { box: "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js", mp4: "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js" };
	VE.loadScript = E.loadScript;
	VE.P = V.newProject(); VE.bin = []; VE.sel = []; VE.t = 0; VE.pps = 60; VE.hist = new V.History(200);
	VE.esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
	VE.media = function (id) { for (var j = 0; j < VE.bin.length; j++) if (VE.bin[j].id === id) return VE.bin[j]; return null; };
	VE.signal = function () { var w = []; return { wait: function (ms) { return new Promise(function (r) { var t = setTimeout(done, ms || 250); function done() { clearTimeout(t); r(); } w.push(done); }); }, wake: function () { var a = w; w = []; for (var j = 0; j < a.length; j++) a[j](); } }; };
	var listeners = {};
	VE.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
	VE.emit = function (ev, a) { (listeners[ev] || []).forEach(function (fn) { try { fn(a); } catch (e) { if (window.console) console.error(e); } }); };

	/* ---------- edits + undo ---------- */
	// every change to the project goes through commit(): it records an undo step, saves (debounced) and redraws
	VE.commit = function (label) {
		V.applyMagnets(VE.P);
		VE.hist.push(JSON.stringify(VE.P)); VE.dirty = true; VE.lastLabel = label || "";
		VE.save(); VE.emit("change", label);
	};
	VE.undo = function () { var s = VE.hist.undo(); if (s) { VE.P = JSON.parse(s); VE.sel = VE.sel.filter(function (id) { return V.clip(VE.P, id); }); VE.save(); VE.emit("change", "undo"); } };
	VE.redo = function () { var s = VE.hist.redo(); if (s) { VE.P = JSON.parse(s); VE.save(); VE.emit("change", "redo"); } };
	VE.selected = function () { return VE.sel.map(function (id) { return V.clip(VE.P, id); }).filter(Boolean); };

	/* ---------- IndexedDB ---------- */
	var dbp = null;
	function db() {
		if (!dbp) dbp = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(new Error("no IndexedDB"));
			var r = indexedDB.open("mes-video-editor", 1);
			r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs"); };
			r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
		});
		return dbp;
	}
	function tx(store, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = t.onabort = function () { rej(t.error); }; }); }); }
	VE.idbGet = function (store, k) { return db().then(function (d) { return new Promise(function (res, rej) { var r = d.transaction(store).objectStore(store).get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); };
	VE.idbPut = function (store, k, v) { return tx(store, "readwrite", function (s) { s.put(v, k); }); };
	VE.idbDel = function (store, k) { return tx(store, "readwrite", function (s) { s.delete(k); }); };
	function binMeta() {
		return VE.bin.filter(function (m) { return m.state === "ready" || m.state === "working"; }).map(function (m) {
			return { id: m.id, name: m.name, size: m.size, kind: m.kind, dur: m.dur, w: m.w, h: m.h, fps: m.fps, rot: m.rot || 0, hasAudio: !!m.hasAudio, converted: !!m.converted, note: m.note || "", peaks: m.peaks || null, wave: m.wave || null, thumbTimes: m.thumbTimes || null, thumbW: m.thumbW || 0, thumbH: m.thumbH || 0, origName: m.origName || "" };
		});
	}
	var saveTimer = null;
	VE.save = function () {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () {
			VE.idbPut("kv", "project", JSON.stringify(VE.P)).then(function () { return VE.idbPut("kv", "bin", binMeta()); }).then(function () { VE.savedAt = Date.now(); VE.emit("saved"); }).catch(function (e) { VE.emit("saveError", e); });
		}, 900);
	};

	/* ---------- importing ---------- */
	var uidN = 0;
	VE.addFiles = function (files) {
		var out = [];
		files.forEach(function (f) {
			var kind = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(f.name) ? "image" : C.isAudio(f.name, f.type) && !/\.(mp4|m4v|webm|mov)$/i.test(f.name) ? "audio" : C.isVideo(f.name, f.type) ? "video" : null;
			if (!kind) { VE.emit("notice", f.name + " was skipped: not a video, sound or picture."); return; }
			var m = { id: V.uid("m"), name: f.name, size: f.size, kind: kind, state: "working", pct: 0, status: "Reading...", file: f };
			VE.bin.push(m); out.push(m);
		});
		VE.emit("bin");
		var chain = Promise.resolve();
		out.forEach(function (m) { chain = chain.then(function () { return VE.prepare(m, true); }); });
		return chain.then(function () { return out; });
	};
	function status(m, s, pct) { m.status = s; if (pct != null) m.pct = pct; VE.emit("binItem", m); }
	// make a media item usable: decode / analyse / convert. fresh = it came from the user just now (store its file)
	VE.prepare = async function (m, fresh) {
		try {
			if (m.kind === "image") {
				var bmp = await createImageBitmap(m.file); m.bitmap = bmp; m.w = bmp.width; m.h = bmp.height; m.dur = Infinity;
			} else if (m.kind === "audio") {
				status(m, "Decoding the sound...");
				var buf = await m.file.arrayBuffer(), ctx = new OfflineAudioContext(2, 1, 48000), ab = await ctx.decodeAudioData(buf);
				m.pcm = { start: 0, rate: ab.sampleRate, ch: [] }; for (var c = 0; c < Math.min(2, ab.numberOfChannels); c++) m.pcm.ch.push(ab.getChannelData(c));
				m.dur = ab.duration; m.hasAudio = true; m.peaks = V.peaks(m.pcm.ch, m.pcm.rate, 50); m.wave = V.wave(m.pcm.ch, m.pcm.rate, V.WAVE_RATE);
			} else {
				await VE.loadScript(VE.LIB.box);
				var info = /\.(mp4|m4v|mov|3gp)$/i.test(m.file.name) || /mp4|quicktime/.test(m.file.type) || m.converted ? await VE.analyzeMp4(m.file).catch(function () { return null; }) : null;
				if (!info || !info.ok) {
					var why = info && info.why ? info.why : "";
					status(m, "Converting to MP4" + (why ? " (" + why + ")" : "") + "...", 0);
					var res = await E.convert(m.file, { onProgress: function (x) { status(m, "Converting to MP4... " + Math.round(x * 100) + "%", x); }, onStatus: function (s, x) { status(m, s, x); } });
					m.origName = m.file.name; m.file = new File([res.blob], C.outName(m.file.name), { type: "video/mp4" }); m.converted = true; m.note = res.note || "";
					info = await VE.analyzeMp4(m.file);
					if (!info.ok) throw new Error(info.why || "The converted file could not be read.");
				}
				Object.assign(m, { dur: info.dur, w: info.w, h: info.h, fps: info.fps, rot: info.rot, hasAudio: !!info.at, vt: info.vt, at: info.at });
			}
			if (fresh) { m.size = m.file.size; VE.idbPut("blobs", "m:" + m.id, m.file).catch(function (e) { VE.emit("notice", "This browser could not keep " + m.name + " for next time (" + (e && e.message || e) + "). It works until you close the tab."); }); }
			m.url = m.url || URL.createObjectURL(m.file);
			m.state = "ready"; m.status = ""; delete m.err;
			VE.emit("binItem", m); VE.emit("mediaReady", m); VE.save();
			if (m.kind === "video" && !m.thumbTimes) VE.makeThumbs(m).catch(function () { /* thumbnails are optional */ });
			else if (m.kind === "video" && m.thumbTimes) VE.loadThumbs(m);
			if (m.kind === "video" && m.hasAudio && (!m.peaks || !m.wave || m.wave.r !== V.WAVE_RATE)) VE.makePeaks(m).catch(function () { /* optional */ });
		} catch (e) {
			m.state = "error"; m.status = (e && e.message) || "This file could not be used."; if (window.console) console.error("[video editor]", e);
			VE.emit("binItem", m);
		}
	};
	// mp4box: sample tables of the first video and audio tracks -> { ok, dur, w, h, fps, rot, vt, at } (vt / at hold codec, description, and per-sample arrays in decode order)
	VE.analyzeMp4 = function (file) {
		return new Promise(function (resolve, reject) {
			var mp4 = MP4Box.createFile(), off = 0, CH = 4194304, done = false;
			mp4.onError = function (e) { if (!done) { done = true; resolve({ ok: false, why: "not an MP4" }); } };
			mp4.onReady = async function (i) {
				if (done) return; done = true;
				try {
					var vt = i.videoTracks[0], at = i.audioTracks[0]; if (!vt) return resolve({ ok: false, why: "no picture" });
					var vtr = mp4.getTrackById(vt.id), desc = descOf(vtr), sup = null;
					try { sup = await VideoDecoder.isConfigSupported({ codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description: desc }); } catch (e) { /* ignore */ }
					if (!sup || !sup.supported) return resolve({ ok: false, why: "the picture format cannot be decoded here" });
					var dur = (i.duration || vt.movie_duration) / (i.timescale || vt.movie_timescale || 1);
					var V1 = tableOf(vtr.samples || []); V1.codec = vt.codec; V1.desc = desc; V1.cw = vt.video.width; V1.ch = vt.video.height;
					var ds = Array.prototype.slice.call(V1.dur, 0, Math.min(V1.n, 600)).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; }), md = ds.length ? ds[ds.length >> 1] : 1 / 30;
					var fps = Math.round(1000 / md) / 1000; if (Math.abs(fps - Math.round(fps)) < 0.02) fps = Math.round(fps);
					var A = null;
					if (at && window.AudioDecoder) {
						var atr = mp4.getTrackById(at.id), ad = audioDescOf(atr), as = null;
						if (!ad && /^mp4a/.test(at.codec)) { // .mov: the AAC settings hide in a QuickTime "wave" box mp4box skips
							var ent = atr.mdia.minf.stbl.stsd.entries[0], qa = null;
							try { if (ent && ent.start >= 0 && ent.size > 0 && ent.size < 65536) qa = V.esdsAac(new Uint8Array(await file.slice(ent.start, ent.start + ent.size).arrayBuffer())); } catch (e) { /* ignore */ }
							qa = qa || V.aacConfig(at.audio.sample_rate, at.audio.channel_count);
							if (qa) { ad = qa.desc; at.codec = qa.codec; }
						}
						try { as = await AudioDecoder.isConfigSupported({ codec: at.codec, sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count, description: ad }); } catch (e) { /* ignore */ }
						if (as && as.supported) { A = tableOf(atr.samples || []); A.codec = at.codec; A.desc = ad; A.rate = at.audio.sample_rate; A.chs = at.audio.channel_count; }
					}
					if (at && !A) return resolve({ ok: false, why: "the sound format cannot be decoded here" });
					var rot = rotOf(vt.matrix), w = vt.video.width, h = vt.video.height;
					if (rot === 90 || rot === 270) { var tmp = w; w = h; h = tmp; }
					resolve({ ok: true, dur: dur, w: Math.round(w), h: Math.round(h), fps: Math.min(120, Math.max(1, fps)), rot: rot, vt: V1, at: A });
				} catch (e) { resolve({ ok: false, why: e.message }); }
			};
			(async function () {
				try {
					while (!done && off < file.size) {
						var end = Math.min(file.size, off + CH), buf = await file.slice(off, end).arrayBuffer(); buf.fileStart = off;
						var next = mp4.appendBuffer(buf, end >= file.size); off = typeof next === "number" && next > off ? next : end;
					}
					if (!done) { mp4.flush(); setTimeout(function () { if (!done) { done = true; resolve({ ok: false, why: "not an MP4" }); } }, 600); }
				} catch (e) { if (!done) { done = true; reject(e); } }
			})();
		});
	};
	function rotOf(m) { if (!m) return 0; var a = m[0] / 65536, b = m[1] / 65536; var deg = Math.round(Math.atan2(b, a) * 180 / Math.PI); return ((deg % 360) + 360) % 360; }
	function tableOf(ss) {
		var n = ss.length, t = { n: n, cts: new Float64Array(n), dts: new Float64Array(n), dur: new Float64Array(n), off: new Float64Array(n), size: new Uint32Array(n), key: new Uint8Array(n) };
		for (var j = 0; j < n; j++) { var s = ss[j], ts = s.timescale; t.cts[j] = s.cts / ts; t.dts[j] = s.dts / ts; t.dur[j] = s.duration / ts; t.off[j] = s.offset; t.size[j] = s.size; t.key[j] = s.is_sync ? 1 : 0; }
		return t;
	}
	function descOf(trak) {
		var es = trak.mdia.minf.stbl.stsd.entries;
		for (var j = 0; j < es.length; j++) { var b = es[j].avcC || es[j].hvcC || es[j].vpcC || es[j].av1C; if (b) { var ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); b.write(ds); return new Uint8Array(ds.buffer, 8); } }
		return undefined;
	}
	function audioDescOf(trak) { var e = trak.mdia.minf.stbl.stsd.entries[0]; try { return new Uint8Array(e.esds.esd.descs[0].descs[0].data); } catch (x) { return undefined; } }
	// index of the last key frame (decode order) whose presentation time is <= t
	VE.keyBefore = function (vt, t) { var best = 0; for (var j = 0; j < vt.n; j++) { if (vt.key[j] && vt.cts[j] <= t + 1e-4) best = j; else if (vt.key[j] && vt.cts[j] > t + 1e-4) break; } return best; };
	// read sample bytes [i, j) with as few file reads as possible
	VE.readSamples = async function (file, tb, i, j) {
		var lo = Infinity, hi = 0, k; for (k = i; k < j; k++) { lo = Math.min(lo, tb.off[k]); hi = Math.max(hi, tb.off[k] + tb.size[k]); }
		var out = [];
		if (hi - lo < 64 * 1048576) { var big = new Uint8Array(await file.slice(lo, hi).arrayBuffer()); for (k = i; k < j; k++) out.push(big.subarray(tb.off[k] - lo, tb.off[k] - lo + tb.size[k])); }
		else for (k = i; k < j; k++) out.push(new Uint8Array(await file.slice(tb.off[k], tb.off[k] + tb.size[k]).arrayBuffer()));
		return out;
	};

	/* ---------- thumbnails ---------- */
	VE.THUMB_H = 72;
	VE.makeThumbs = async function (m) {
		var vt = m.vt, count = Math.max(2, Math.min(80, Math.ceil(m.dur / 2))), want = [], seen = {}, j;
		for (j = 0; j < count; j++) { var k = VE.keyBefore(vt, (j + 0.5) * m.dur / count); if (!seen[k]) { seen[k] = 1; want.push(k); } }
		var th = VE.THUMB_H, tw = Math.max(16, Math.round(th * m.w / m.h)), sprite = document.createElement("canvas"); sprite.width = tw * want.length; sprite.height = th;
		var sx = sprite.getContext("2d"), times = [], got = 0, err = null;
		var dec = new VideoDecoder({ output: function (fr) { try { drawFrame(sx, fr, m.rot || 0, got * tw, 0, tw, th); times.push(fr.timestamp / 1e6); got++; } finally { fr.close(); } }, error: function (e) { err = e; } });
		dec.configure({ codec: vt.codec, codedWidth: vt.cw, codedHeight: vt.ch, description: vt.desc, optimizeForLatency: true });
		for (j = 0; j < want.length && !err; j++) {
			var data = (await VE.readSamples(m.file, vt, want[j], want[j] + 1))[0];
			dec.decode(new EncodedVideoChunk({ type: "key", timestamp: Math.round(vt.cts[want[j]] * 1e6), data: data }));
			if (dec.decodeQueueSize > 4) await dec.flush();
		}
		await dec.flush(); dec.close();
		if (!got) return;
		var c2 = document.createElement("canvas"); c2.width = tw * got; c2.height = th; c2.getContext("2d").drawImage(sprite, 0, 0);
		var blob = await new Promise(function (r) { c2.toBlob(r, "image/jpeg", 0.72); });
		m.thumbTimes = times; m.thumbW = tw; m.thumbH = th; m.thumbImg = await createImageBitmap(blob);
		VE.idbPut("blobs", "t:" + m.id, blob).catch(function () { /* fine */ }); VE.save();
		VE.emit("thumbs", m);
	};
	VE.loadThumbs = function (m) { VE.idbGet("blobs", "t:" + m.id).then(function (b) { if (b) return createImageBitmap(b).then(function (bmp) { m.thumbImg = bmp; VE.emit("thumbs", m); }); }).catch(function () { }); };
	// draw a decoded frame (unrotated) into a box, turned by rot degrees
	function drawFrame(ctx, fr, rot, x, y, w, h) {
		if (!rot) { ctx.drawImage(fr, x, y, w, h); return; }
		ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot * Math.PI / 180);
		var sw = rot % 180 ? h : w, sh = rot % 180 ? w : h; ctx.drawImage(fr, -sw / 2, -sh / 2, sw, sh); ctx.restore();
	}
	VE.drawFrame = drawFrame;

	/* ---------- sound by time range ---------- */
	var WIN = 10;
	// -> { start, rate, ch } covering at least [s0, s1] of the media's sound (source seconds); null when it has none
	VE.pcm = async function (m, s0, s1) {
		if (m.pcm) return m.pcm;
		if (!m.at) return null;
		var w0 = Math.floor(Math.max(0, s0) / WIN), w1 = Math.floor(Math.max(0, s1) / WIN);
		if (w0 === w1) return win(m, w0);
		var parts = []; for (var w = w0; w <= w1; w++) parts.push(await win(m, w));
		var rate = parts[0].rate, step = Math.round(WIN * rate), out = { start: w0 * WIN, rate: rate, ch: [] };
		for (var c = 0; c < parts[0].ch.length; c++) { var a = new Float32Array(step * parts.length); parts.forEach(function (p, k) { a.set(p.ch[c].subarray(0, step), k * step); }); out.ch.push(a); }
		return out;
	};
	// one 10 s window of decoded sound, cached (a few per media)
	function win(m, w) {
		m.wins = m.wins || {}; m.winOrder = m.winOrder || [];
		if (m.wins[w]) { m.winOrder = m.winOrder.filter(function (x) { return x !== w; }).concat([w]); return m.wins[w]; }
		var p = decodeWin(m, w); m.wins[w] = p; m.winOrder.push(w); m.winData = m.winData || {};
		while (m.winOrder.length > 8) { var old = m.winOrder.shift(); delete m.wins[old]; delete m.winData[old]; }
		p.then(function (d) { if (m.wins[w] === p) m.winData[w] = d; }, function () { delete m.wins[w]; });
		return p;
	}
	// decoded sound around source time s right now (no waiting), or null and it starts decoding (then fires "pcmReady" with the media)
	VE.pcmNow = function (m, s) {
		if (m.pcm) return m.pcm;
		if (!m.at || s < 0 || s > m.dur + 0.05) return null;
		var w = Math.floor(s / WIN); if (m.winData && m.winData[w]) return m.winData[w];
		if (!m.wins || !m.wins[w]) win(m, w).then(function () { VE.emit("pcmReady", m); }, function (e) { if (!m.pcmErr && window.console) console.warn("[video editor] sound of " + m.name + " could not be decoded for the zoomed waveform", e); m.pcmErr = 1; });
		return null;
	};
	async function decodeWin(m, w) {
		var at = m.at, t0 = w * WIN, t1 = t0 + WIN, i = 0, j = at.n;
		while (i < at.n && at.cts[i] + at.dur[i] < t0 - 0.05) i++;
		j = i; while (j < at.n && at.cts[j] < t1 + 0.05) j++;
		var rate = at.rate, nch = Math.min(2, at.chs || 2), len = Math.round(WIN * rate), out = { start: t0, rate: rate, ch: [] };
		for (var c = 0; c < nch; c++) out.ch.push(new Float32Array(len));
		if (j <= i) return out;
		var data = await VE.readSamples(m.file, at, i, j), err = null, tmp = null;
		var dec = new AudioDecoder({ output: function (ad) {
			try {
				var n = ad.numberOfFrames, pos = Math.round((ad.timestamp / 1e6 - t0) * rate);
				if (!tmp || tmp.length < n) tmp = new Float32Array(n);
				for (var c = 0; c < nch; c++) {
					ad.copyTo(tmp, { planeIndex: Math.min(c, ad.numberOfChannels - 1), format: "f32-planar" });
					var a = Math.max(0, -pos), b = Math.min(n, len - pos); if (b > a) out.ch[c].set(tmp.subarray(a, b), pos + a);
				}
			} catch (e) { err = e; } finally { ad.close(); }
		}, error: function (e) { err = e; } });
		dec.configure({ codec: at.codec, sampleRate: at.rate, numberOfChannels: at.chs, description: at.desc });
		for (var k = 0; k < data.length; k++) dec.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(at.cts[i + k] * 1e6), duration: Math.round(at.dur[i + k] * 1e6), data: data[k] }));
		await dec.flush(); dec.close();
		if (err) throw err;
		return out;
	}
	// a whole source range at 48 kHz (for noise removal / loudness): -> [Float32Array per channel]
	VE.pcmRange = async function (m, s0, s1, onProgress) {
		var rate = 48000, n = Math.max(1, Math.round((s1 - s0) * rate)), nch = m.pcm ? m.pcm.ch.length : Math.min(2, (m.at && m.at.chs) || 2), out = [];
		for (var c = 0; c < nch; c++) out.push(new Float32Array(n));
		for (var s = s0; s < s1; s += WIN) {
			var e = Math.min(s1, s + WIN), buf = await VE.pcm(m, s, e), i0 = Math.round((s - s0) * rate), cnt = Math.min(n - i0, Math.round((e - s) * rate));
			if (buf && cnt > 0) V.mixInto(out, i0, cnt, buf, s, 1 / rate, null);
			if (onProgress) onProgress((e - s0) / (s1 - s0));
		}
		return out;
	};
	VE.makePeaks = async function (m) {
		var parts = [], wp = [], total = 0, wt = 0;
		for (var w = 0; w * WIN < m.dur; w++) { var p = await win(m, w); var pk = V.peaks(p.ch, p.rate, 50); parts.push(pk); wp.push(V.wave(p.ch, p.rate, V.WAVE_RATE)); total += pk.length; wt += wp[wp.length - 1].pk.length; }
		var out = new Uint8Array(total), wpk = new Uint8Array(wt), wrm = new Uint8Array(wt), o = 0, o2 = 0;
		parts.forEach(function (p, k) { out.set(p, o); o += p.length; wpk.set(wp[k].pk, o2); wrm.set(wp[k].rms, o2); o2 += wp[k].pk.length; });
		m.peaks = out; m.wave = { pk: wpk, rms: wrm, r: V.WAVE_RATE }; VE.save(); VE.emit("thumbs", m);
	};

	/* ---------- noise-removed sound ---------- */
	VE.cleanCache = {};
	VE.cleanPcm = async function (key) {
		if (VE.cleanCache[key]) return VE.cleanCache[key];
		var v = await VE.idbGet("blobs", "c:" + key); if (!v) return null;
		var r = { start: v.a, rate: v.rate, ch: v.ch.map(function (b) { return new Float32Array(b); }) }; VE.cleanCache[key] = r; return r;
	};
	// the sound buffer a clip plays at source time s: noise-removed when it has one covering s
	VE.clipPcm = async function (c, s0, s1) {
		var m = VE.media(c.media); if (!m) return null;
		if (c.clean && c.clean.key) { var cp = await VE.cleanPcm(c.clean.key); if (cp && s0 >= cp.start - 0.01 && s1 <= cp.start + cp.ch[0].length / cp.rate + 0.35) return cp; }   // a little past the end = silence (the decoded sound can be a few frames shorter than the clip)
		return VE.pcm(m, s0, s1);
	};


	/* ---------- audio effects: sound levels (10 ms blocks) per media / noise-removed version, and the gain envelopes made from them ---------- */
	VE.levelCache = {}; var levelJobs = {}, envCache = {}, preCache = {};
	function lkey(c) { return c.media + "|" + (c.clean && c.clean.key ? c.clean.key : "o"); }
	VE.levelsFor = function (c) { return VE.levelCache[lkey(c)] || null; };
	// work out (once, then from IndexedDB) the levels of the sound a clip plays; resolves to them (null when there is no sound)
	VE.ensureLevels = function (c, onProgress) {
		var k = lkey(c); if (VE.levelCache[k]) return Promise.resolve(VE.levelCache[k]);
		if (levelJobs[k]) return levelJobs[k];
		var job = levelJobs[k] = (async function () {
			var saved = await VE.idbGet("blobs", "l:" + k).catch(function () { return null; });
			var lev = null;
			if (saved && saved.rms) lev = { start: saved.start, hop: saved.hop, rms: new Float32Array(saved.rms), peak: new Float32Array(saved.peak) };
			else {
				var m = VE.media(c.media); if (!m || !m.hasAudio) return null;
				var meter = new V.LevelMeter(48000, 0.01), start = 0, cp = c.clean && c.clean.key ? await VE.cleanPcm(c.clean.key) : null;
				if (cp) {
					start = cp.start; var n = cp.ch[0].length, step = 480000;
					for (var i = 0; i < n; i += step) { meter.push(cp.ch.map(function (x) { return x.subarray(i, Math.min(n, i + step)); })); if (onProgress) onProgress(i / n); await new Promise(function (r) { setTimeout(r, 0); }); }
				} else {
					for (var s = 0; s < m.dur; s += 10) { meter.push(await VE.pcmRange(m, s, Math.min(m.dur, s + 10))); if (onProgress) onProgress(s / m.dur); }
				}
				lev = meter.result(start);
				VE.idbPut("blobs", "l:" + k, { start: lev.start, hop: lev.hop, rms: lev.rms.buffer, peak: lev.peak.buffer }).catch(function () { /* kept in memory only */ });
			}
			VE.levelCache[k] = lev; VE.emit("levels", k);
			return lev;
		})();
		job.then(function () { delete levelJobs[k]; }, function () { delete levelJobs[k]; });
		return job;
	};
	// make sure every clip that needs levels has them (clips with effects on, and the clips a ducked clip listens to)
	VE.ensureAllFx = async function (onProgress) {
		var p = VE.P, need = [], duck = p.clips.some(function (c) { return VE.hasSound(c) && c.afx && c.afx.duck && c.afx.duck.on; });
		p.clips.forEach(function (c) { if (VE.hasSound(c) && (V.afxOn(c) || duck)) need.push(c); });
		for (var j = 0; j < need.length; j++) { try { await VE.ensureLevels(need[j], onProgress ? function (x) { onProgress((j + x) / need.length); } : null); } catch (e) { if (window.console) console.warn("[video editor] levels", e); } }
	};
	VE.fxBusy = function () { return Object.keys(levelJobs).length > 0; };
	VE.fxEnv = function (c) {
		var lev = VE.levelsFor(c); if (!lev) return null;
		var A = V.afxOf(c), key = lkey(c) + JSON.stringify([A.level.on ? A.level : 0, A.comp.on ? A.comp : 0]);
		if (envCache[key]) return envCache[key];
		var ks = Object.keys(envCache); if (ks.length > 60) envCache = {};
		return (envCache[key] = V.fxEnvelope(lev, A));
	};
	function prefixFor(o, lev, gate) { var k = lkey(o) + "@" + gate; return preCache[k] || (preCache[k] = V.activePrefix(lev, gate)); }
	// the effects' gain for clip c at timeline time t (1 when it has none, or its levels are not ready yet)
	VE.fxGainAt = function (c, t) {
		if (!V.afxOn(c)) return 1;
		var A = V.afxOf(c), g = 1, p = VE.P;
		if (A.level.on || A.comp.on) { var env = VE.fxEnv(c); if (env) g *= V.envAt(env, V.srcAt(c, t)); }
		if (A.duck.on) {
			var pres = 0;
			for (var j = 0; j < p.clips.length; j++) {
				var o = p.clips[j]; if (o === c || !VE.hasSound(o) || (o.afx && o.afx.duck && o.afx.duck.on) || !V.active(o, t)) continue;
				var lv = VE.levelsFor(o); if (!lv || V.gainAt(p, o, t) <= 0) continue;
				pres = Math.max(pres, V.presenceAt(lv, prefixFor(o, lv, A.duck.gate), V.srcAt(o, t), 0.25));
			}
			if (pres > 0) g *= V.fromDb(-A.duck.amt * pres);
		}
		return g;
	};
	VE.fxFn = function (c) { return V.afxOn(c) ? function (t) { return VE.fxGainAt(c, t); } : null; };

	/* ---------- the compositor ---------- */
	// draw the frame at t onto ctx (W x H). src(clip) -> { img, w, h, rot } for video / image clips (rot only for raw decoded frames)
	VE.draw = function (ctx, W, H, t, src, opt) {
		opt = opt || {};
		ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = VE.P.bg || "#000"; ctx.fillRect(0, 0, W, H);
		if (opt.clip) { ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); }
		var L = V.layersAt(VE.P, t);
		for (var j = 0; j < L.length; j++) {
			var c = L[j].clip, pos = L[j].pos || V.posAt(c, t); ctx.globalAlpha = L[j].alpha;
			if (c.type === "text") { drawText(ctx, c, W, H, pos); continue; }
			var s = src(c, L[j].src); if (!s || !s.img) continue;
			var r = V.place(s.w, s.h, pos, W, H), turned = !!pos.rot;
			if (turned) { ctx.save(); ctx.translate(r.dx + r.dw / 2, r.dy + r.dh / 2); ctx.rotate(pos.rot * Math.PI / 180); ctx.translate(-(r.dx + r.dw / 2), -(r.dy + r.dh / 2)); }
			try {
				if (s.rot) {   // a raw decoded frame of a turned phone video: crop in the turned picture, then draw
					var tmp = VE.tmpCanvas("rot", s.w, s.h); tmp.ctx.setTransform(1, 0, 0, 1, 0, 0); tmp.ctx.clearRect(0, 0, s.w, s.h); drawFrame(tmp.ctx, s.img, s.rot, 0, 0, s.w, s.h);
					ctx.drawImage(tmp.canvas, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
				} else ctx.drawImage(s.img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
			} catch (e) { /* a frame that is not ready yet */ }
			if (turned) ctx.restore();
		}
		ctx.restore();
		return L;
	};
	var tmps = {};
	VE.tmpCanvas = function (k, w, h) {
		var t = tmps[k]; if (!t) { var cv = document.createElement("canvas"); t = tmps[k] = { canvas: cv, ctx: cv.getContext("2d") }; }
		if (t.canvas.width !== w || t.canvas.height !== h) { t.canvas.width = w; t.canvas.height = h; }
		return t;
	};
	// a title: lines of text in a rounded box, centred at (x, y); returns its rectangle on the frame
	function textBox(ctx, c, W, H, pos) {
		pos = pos || c;
		var T = c.text || V.TEXT_DEFAULT, px = Math.max(4, T.size * H * (pos.scale || 1)), lines = String(T.s || "").split("\n");
		ctx.font = (T.italic ? "italic " : "") + (T.bold ? "700 " : "400 ") + px + "px " + (T.font || "Arial, sans-serif");
		var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, ctx.measureText(l).width); });
		var lh = px * 1.22, pad = px * 0.4, bw = wmax + pad * 2, bh = lines.length * lh + pad * 1.2;
		return { px: px, lines: lines, lh: lh, pad: pad, dx: pos.x * W - bw / 2, dy: pos.y * H - bh / 2, dw: bw, dh: bh, T: T };
	}
	function drawText(ctx, c, W, H, pos) {
		var b = textBox(ctx, c, W, H, pos), T = b.T, rot = pos && pos.rot;
		if (rot) { ctx.save(); ctx.translate(b.dx + b.dw / 2, b.dy + b.dh / 2); ctx.rotate(rot * Math.PI / 180); ctx.translate(-(b.dx + b.dw / 2), -(b.dy + b.dh / 2)); }
		if (T.bgOn) { ctx.save(); ctx.globalAlpha *= T.bgOp == null ? 0.55 : T.bgOp; ctx.fillStyle = T.bg || "#000"; roundRect(ctx, b.dx, b.dy, b.dw, b.dh, b.px * 0.25); ctx.fill(); ctx.restore(); }
		ctx.textBaseline = "middle"; ctx.textAlign = T.align || "center";
		var x = T.align === "left" ? b.dx + b.pad : T.align === "right" ? b.dx + b.dw - b.pad : b.dx + b.dw / 2;
		b.lines.forEach(function (l, k) {
			var y = b.dy + b.pad * 0.6 + b.lh * (k + 0.5);
			if (T.shadow) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = b.px * 0.12; ctx.shadowOffsetY = b.px * 0.05; ctx.fillStyle = T.color; ctx.fillText(l, x, y); ctx.restore(); }
			if (T.outline > 0) { ctx.lineWidth = T.outline * b.px * 0.08; ctx.strokeStyle = T.ocolor || "#000"; ctx.lineJoin = "round"; ctx.strokeText(l, x, y); }
			ctx.fillStyle = T.color || "#fff"; ctx.fillText(l, x, y);
		});
		if (rot) ctx.restore();
		return b;
	}
	function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
	// rectangle of a clip on a W x H frame (for selecting / dragging in the preview)
	// pos = the animated position to use (default: the one at the playhead); the result carries .rot (degrees, about its centre)
	VE.rectOf = function (ctx, c, W, H, pos) {
		pos = pos || V.posAt(c, VE.t);
		var r;
		if (c.type === "text") r = textBox(ctx, c, W, H, pos);
		else { var m = VE.media(c.media); if (!m || !m.w) return null; r = V.place(m.w, m.h, pos, W, H); }
		r.rot = pos.rot || 0; r.pos = pos;
		return r;
	};
	VE.mediaDur = function (c) { if (c.type === "text") return Infinity; var m = VE.media(c.media); return !m ? Infinity : m.kind === "image" ? Infinity : m.dur; };
	VE.hasSound = function (c) { if ((c.type !== "video" && c.type !== "audio") || c.noAudio) return false; var m = VE.media(c.media); return !!(m && m.hasAudio); };

	/* ---------- restore the last session ---------- */
	VE.restore = async function () {
		try {
			var pj = await VE.idbGet("kv", "project"), meta = await VE.idbGet("kv", "bin");
			if (!pj) return false;
			VE.P = V.normalize(JSON.parse(pj));
			VE.bin = (meta || []).map(function (x) { return Object.assign({}, x, { state: "working", status: "Opening..." }); });
			VE.hist = new V.History(200); VE.hist.push(JSON.stringify(VE.P));
			VE.emit("change", "restore"); VE.emit("bin");
			for (var j = 0; j < VE.bin.length; j++) {
				var m = VE.bin[j], f = await VE.idbGet("blobs", "m:" + m.id);
				if (!f) { m.state = "missing"; m.status = "Missing: add " + (m.origName || m.name) + " again to relink it."; VE.emit("binItem", m); continue; }
				m.file = f instanceof File ? f : new File([f], m.name, { type: f.type });
				VE.prepare(m, false);
			}
			return true;
		} catch (e) { if (window.console) console.warn("[video editor] restore", e); return false; }
	};
	// a dropped file that matches a missing media item (same name + size) fills it in
	VE.relink = function (file) {
		var m = VE.bin.filter(function (x) { return x.state === "missing" && (x.name === file.name || x.origName === file.name); })[0];
		if (!m) return false;
		m.file = file; m.state = "working"; m.status = "Opening..."; m.size = file.size; if (m.origName === file.name) { m.converted = false; m.thumbTimes = null; }
		VE.prepare(m, true); return true;
	};
	VE.clearAll = async function () {
		VE.bin.forEach(function (m) { if (m.url) try { URL.revokeObjectURL(m.url); } catch (e) { /* ignore */ } });
		VE.bin = []; VE.P = V.newProject(); VE.sel = []; VE.t = 0; VE.hist = new V.History(200); VE.hist.push(JSON.stringify(VE.P)); VE.cleanCache = {}; VE.levelCache = {}; envCache = {}; preCache = {};
		try { await tx("blobs", "readwrite", function (s) { s.clear(); }); await tx("kv", "readwrite", function (s) { s.clear(); }); } catch (e) { /* ignore */ }
		VE.emit("bin"); VE.emit("change", "new");
	};
})();

/* MES Video Editor preview: one <video> / <audio> element per clip near the playhead (kept in step with the timeline clock), drawn through
 * the shared compositor onto a canvas; their sound goes through Web Audio gain nodes (volume, fades, cross-fades, mute). Noise-removed sound
 * plays from AudioBuffers. Drag a picture or title in the preview to move it, its corner to resize it. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, $ = function (id) { return document.getElementById(id); };
	var P = VE.preview = { playing: false, rate: 1, rev: false, t0: 0, p0: 0, speed: 1 };   // speed = the "Playback speed" menu (preview only)
	var cv = $("vd-canvas"), ctx = cv.getContext("2d"), wrap = $("vd-stagewrap"), els = {}, ac = null, cleanNodes = [], cleanBufs = {}, raf = 0, needDraw = true;

	function audio() {
		if (!ac) {
			try { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" }); } catch (e) { return null; }
			Object.keys(els).forEach(function (k) { connect(els[k]); });
		}
		if (ac.state === "suspended") ac.resume();
		return ac;
	}
	function connect(e) { if (!ac || e.gain) return; try { e.node = ac.createMediaElementSource(e.el); e.gain = ac.createGain(); e.gain.gain.value = 0; e.node.connect(e.gain).connect(ac.destination); } catch (x) { /* already connected */ } }
	function elFor(c) {
		var e = els[c.id], m = VE.media(c.media);
		if (e && e.media === c.media) { e.used = performance.now(); return e; }
		if (e) release(c.id);
		if (!m || !m.url) return null;
		var el = document.createElement(c.type === "audio" ? "audio" : "video");
		el.preload = "auto"; el.playsInline = true; el.muted = false; el.preservesPitch = false; el.src = m.url;
		el.addEventListener("seeked", draw); el.addEventListener("loadeddata", draw);
		e = els[c.id] = { el: el, media: c.media, used: performance.now() };
		connect(e);
		return e;
	}
	// a video element that was just told to go somewhere has no picture of that place yet (drawing it then can give a black frame):
	// until the browser shows the new frame, the preview uses the last frame it gave
	function setTime(e, t) {
		e.el.currentTime = t; e.fresh = false;
		var done = function () { e.fresh = true; draw(); };
		if (e.el.requestVideoFrameCallback) { var n = e.vfc = (e.vfc || 0) + 1; e.el.requestVideoFrameCallback(function () { if (e.vfc === n) done(); }); setTimeout(function () { if (e.vfc === n && !e.el.seeking) done(); }, 400); }
		else e.el.addEventListener("seeked", done, { once: true });
	}
	function release(id) { var e = els[id]; delete frames[id]; if (!e) return; try { e.el.pause(); e.el.removeAttribute("src"); e.el.load(); if (e.node) e.node.disconnect(); if (e.gain) e.gain.disconnect(); } catch (x) { /* ignore */ } delete els[id]; }

	/* ---------- clock ---------- */
	P.time = function () { return P.playing ? P.t0 + (performance.now() - P.p0) / 1000 * P.rate * (P.rev ? -1 : 1) : VE.t; };
	P.play = function (rate) {
		var d = V.duration(VE.P); if (!d) return;
		if (VE.t >= d - 1e-3) VE.t = 0;
		audio(); P.rate = rate || 1; P.rev = false; P.t0 = VE.t; P.p0 = performance.now(); P.playing = true;
		scheduleClean(); VE.emit("play"); loop();
	};
	P.reverse = function (rate) { P.pause(); P.rate = rate || 1; P.rev = true; P.t0 = VE.t; P.p0 = performance.now(); P.playing = true; muteAll(); VE.emit("play"); loop(); };
	P.pause = function () {
		if (!P.playing) return;
		VE.t = Math.max(0, P.time()); P.playing = false; P.rev = false;
		Object.keys(els).forEach(function (k) { var e = els[k]; e.el.pause(); if (e.gain && ac) e.gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); });
		stopClean(); VE.emit("pause"); sync(); draw();
	};
	P.toggle = function () { if (P.playing && !P.rev) P.pause(); else P.play(P.speed); };
	// preview playback speed (0.25x-4x): the edit and the export are not changed; video / audio elements keep their pitch at this speed
	P.SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
	P.setSpeed = function (s) {
		s = Math.max(0.25, Math.min(4, +s || 1)); P.speed = s;
		if (P.playing && !P.rev) { P.pause(); P.play(s); }
		VE.emit("speed", s);
	};
	P.stepSpeed = function (dir) { var L = P.SPEEDS, i = 0; while (i < L.length - 1 && L[i] < P.speed - 1e-9) i++; P.setSpeed(L[Math.max(0, Math.min(L.length - 1, i + dir))]); };
	P.seek = function (t) {
		var was = P.playing && !P.rev; if (P.playing) P.pause();
		VE.t = Math.max(0, Math.min(t, Math.max(V.duration(VE.P), 0)));
		VE.emit("time", VE.t); sync(); draw();
		if (was) P.play(P.rate);
	};
	P.restart = function () { if (P.playing && !P.rev) { var r = P.rate; P.pause(); P.play(r); } else { sync(); draw(); } };
	function muteAll() { Object.keys(els).forEach(function (k) { var e = els[k]; e.el.pause(); if (e.gain && ac) e.gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); }); stopClean(); }
	function loop() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(function step() {
			if (!P.playing) return;
			var t = P.time(), d = V.duration(VE.P);
			if ((!P.rev && t >= d) || (P.rev && t <= 0)) { P.t0 = P.rev ? 0 : d; P.p0 = performance.now(); P.pause(); VE.emit("time", VE.t); return; }
			VE.t = t; sync(); draw(); VE.emit("time", t);
			raf = requestAnimationFrame(step);
		});
	}

	/* ---------- keeping the elements in step ---------- */
	function sync() {
		var t = VE.t, p = VE.P, playing = P.playing && !P.rev, want = {}, now = performance.now();
		if (playing && ac && ac.state !== "running" && ac.state !== "closed" && now - (P.resumeAt || 0) > 1000) { P.resumeAt = now; ac.resume().catch(function () { }); }
		p.clips.forEach(function (c) {
			if (c.type !== "video" && c.type !== "audio") return;
			var tr = V.track(p, c.track); if (!tr) return;
			var visible = c.type === "video" && !tr.hide, audible = VE.hasSound(c) && !tr.mute && !c.mute;
			if (!visible && !audible) return;
			var s0 = c.start - (c.xin || 0), e1 = V.end(c), near = t >= s0 - (playing ? 2.5 : 0.05) && t < e1 + 0.05;
			if (!near) return;
			var e = elFor(c); if (!e) return; want[c.id] = 1;
			var m = VE.media(c.media), active = V.active(c, t), src = V.srcAt(c, Math.max(t, s0));
			if (src < 0) src = 0; if (m && m.dur && src > m.dur - 0.01) src = m.dur - 0.01;
			if (playing && active) {
				var pr = Math.max(0.0625, Math.min(16, (c.speed || 1) * P.rate));
				if (Math.abs(e.el.playbackRate - pr) > 1e-3) e.el.playbackRate = pr;
				var keep = Math.abs(P.rate - 1) > 1e-3 && Math.abs(P.rate - P.speed) < 1e-3;   // the speed menu: keep the voice's pitch (J / L shuttle and clip speed do not)
				if (e.el.preservesPitch !== keep) e.el.preservesPitch = keep;
				if (e.el.paused) { if (Math.abs(e.el.currentTime - src) > 0.02) setTime(e, src); var pp = e.el.play(); if (pp && pp.catch) pp.catch(function () { }); }
				else if (Math.abs(e.el.currentTime - src) > 0.3 * Math.max(1, P.rate)) setTime(e, src);
			} else {
				if (!e.el.paused) e.el.pause();
				var fps = (m && m.fps) || 30;
				if (Math.abs(e.el.currentTime - src) > 0.5 / fps && !e.el.seeking) setTime(e, src);
			}
			if (e.gain && ac) { var g = playing && active && !cleanCovers(c, t) ? V.gainAt(p, c, t) * VE.fxGainAt(c, t + 0.015) : 0; e.gain.gain.setTargetAtTime(g, ac.currentTime, 0.012); }
		});
		Object.keys(els).forEach(function (k) { if (!want[k] && now - els[k].used > 4000) release(k); else if (!want[k]) { els[k].el.pause(); if (els[k].gain && ac) els[k].gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); } });
		cleanNodes.forEach(function (n) { var c = V.clip(p, n.id); if (!c || !ac) return; n.gain.gain.setTargetAtTime(V.gainAt(p, c, t) * VE.fxGainAt(c, t + 0.015), ac.currentTime, 0.012); });
	}
	P.sync = sync;
	P.seeking = function () { return Object.keys(els).some(function (k) { return els[k].el.seeking; }); };
	// the noise-removed copy plays instead of the clip's own sound only where it exists (a clip trimmed wider than the cleaned part plays the
	// original outside it) and only once its source is really scheduled (while it is being restarted the original keeps playing: never silence)
	function cleanCovers(c, t) {
		if (!c.clean || !c.clean.key) return false;
		var buf = cleanBufs[c.clean.key], cp = VE.cleanCache[c.clean.key]; if (!buf || !cp) return false;
		if (!cleanNodes.some(function (n) { return n.id === c.id; })) return false;
		var s = V.srcAt(c, t); return s >= cp.start - 0.01 && s < cp.start + buf.duration - 0.03;
	}
	// noise-removed sound: AudioBuffer sources scheduled from the playhead
	var cleanGen = 0;
	async function scheduleClean() {
		stopClean();
		var gen = ++cleanGen, p = VE.P, t = VE.t, a = audio(); if (!a) return;
		var list = p.clips.filter(function (c) { return c.clean && c.clean.key && VE.hasSound(c) && V.end(c) > t; });
		for (var j = 0; j < list.length; j++) {
			var c = list[j], cp = await VE.cleanPcm(c.clean.key); if (gen !== cleanGen || !P.playing || P.rev) return; if (!cp) continue;
			var buf = cleanBufs[c.clean.key];
			if (!buf) { buf = a.createBuffer(cp.ch.length, cp.ch[0].length, cp.rate); cp.ch.forEach(function (x, k) { buf.copyToChannel(x, k); }); cleanBufs[c.clean.key] = buf; }
			var now = P.time(), from = Math.max(now, c.start - (c.xin || 0)), src = V.srcAt(c, from), off = src - cp.start;
			if (off < 0) { from += -off / (c.speed || 1); off = 0; }
			var len = (V.end(c) - from) * (c.speed || 1); if (len <= 0 || off >= buf.duration) continue;
			if (Math.abs(P.rate - 1) > 1e-3 && Math.abs(P.rate - P.speed) < 1e-3 && window.HTMLMediaElement) { cleanEl(a, c, cp, from, now, off, len); continue; }
			var node = a.createBufferSource(), gain = a.createGain(); node.buffer = buf; node.playbackRate.value = (c.speed || 1) * P.rate; gain.gain.value = 0;
			node.connect(gain).connect(a.destination);
			node.start(a.currentTime + Math.max(0, (from - now) / P.rate), off, Math.min(len, buf.duration - off));
			cleanNodes.push({ id: c.id, node: node, gain: gain });
		}
		sync();
	}
	// at a menu speed other than 1x the noise-removed sound plays from an <audio> element (a WAV of it) so the voice keeps its pitch
	var cleanUrls = {};
	function cleanEl(a, c, cp, from, now, off, len) {
		var url = cleanUrls[c.clean.key] || (cleanUrls[c.clean.key] = URL.createObjectURL(new Blob([V.wav16(cp.ch, cp.rate)], { type: "audio/wav" })));
		var el = new Audio(); el.preload = "auto"; el.src = url; el.preservesPitch = true; el.playbackRate = Math.max(0.0625, Math.min(16, (c.speed || 1) * P.rate));
		var sn = a.createMediaElementSource(el), gain = a.createGain(); gain.gain.value = 0; sn.connect(gain).connect(a.destination);
		var timer = setTimeout(function () { el.currentTime = off; var pp = el.play(); if (pp && pp.catch) pp.catch(function () { }); }, Math.max(0, (from - now) / P.rate * 1000));
		cleanNodes.push({ id: c.id, gain: gain, node: { stop: function () { clearTimeout(timer); el.pause(); el.removeAttribute("src"); }, disconnect: function () { sn.disconnect(); } } });
		void len;
	}
	function stopClean() { cleanGen++; cleanNodes.forEach(function (n) { try { n.node.stop(); n.node.disconnect(); n.gain.disconnect(); } catch (e) { /* ignore */ } }); cleanNodes = []; }
	P.forgetClean = function (key) { delete cleanBufs[key]; if (cleanUrls[key]) { URL.revokeObjectURL(cleanUrls[key]); delete cleanUrls[key]; } };

	/* ---------- drawing: the frame on a zoomable, movable pasteboard ---------- */
	// The canvas covers the whole stage. view = { k (canvas px per frame px), ox, oy (frame origin in canvas px) }; fit = keep the frame
	// fitted with a margin. Parts of clips that hang outside the frame are drawn on the pasteboard, dimmed, so it is obvious what is cut off.
	function source(c) {
		var m = VE.media(c.media); if (!m) return null;
		if (m.kind === "image") return m.bitmap ? { img: m.bitmap, w: m.w, h: m.h } : null;
		var e = els[c.id], fc = frames[c.id];
		// while a video element seeks (frame steps, a jump, the start of playback) it has no picture for a moment: show the last
		// frame it gave instead of a black flash
		if (!e || e.el.readyState < 2 || e.el.seeking || e.fresh === false) return fc && fc.media === c.media ? { img: fc.cv, w: m.w, h: m.h } : P.lastFrame(c);
		keepFrame(c, e.el);
		return { img: e.el, w: m.w, h: m.h };
	}
	var frames = {};
	function keepFrame(c, el) {
		var fc = frames[c.id], now = performance.now(), w = el.videoWidth, h = el.videoHeight; if (!w || !h) return;
		if (fc && fc.media === c.media && fc.at === el.currentTime) return;
		if (fc && P.playing && now - fc.t < 300) return;   // while playing a copy now and then is enough (a seek during playback is rare)
		if (!fc || fc.media !== c.media) { fc = frames[c.id] = { cv: document.createElement("canvas"), media: c.media }; }
		if (fc.cv.width !== w || fc.cv.height !== h) { fc.cv.width = w; fc.cv.height = h; }
		try { fc.cv.getContext("2d").drawImage(el, 0, 0, w, h); fc.at = el.currentTime; fc.t = now; } catch (x) { /* not ready */ }
	}
	P.lastFrame = function () { return null; };
	var VKEY = "mes-video-editor:view", VS = { guides: false, dim: true };
	try { Object.assign(VS, JSON.parse(localStorage.getItem(VKEY)) || {}); } catch (e) { /* ignore */ }
	function saveVS() { try { localStorage.setItem(VKEY, JSON.stringify({ guides: VS.guides, dim: VS.dim })); } catch (e) { /* ignore */ } }
	var view = { k: 1, ox: 0, oy: 0 }, isFit = true, dpr = 1, pattern = null, pick = null;
	P.view = function () { return { k: view.k, ox: view.ox, oy: view.oy, fit: isFit, dpr: dpr, pct: Math.round(view.k / dpr * 1000) / 10 }; };
	function draw() { needDraw = true; if (!P.playing) requestAnimationFrame(paint); else paint(); }
	P.draw = draw;
	function pasteboard() {
		if (pattern && pattern.d === dpr) return pattern.p;
		var s = Math.round(10 * dpr), t = document.createElement("canvas"); t.width = t.height = s * 2; var g = t.getContext("2d");
		g.fillStyle = "#14181f"; g.fillRect(0, 0, s * 2, s * 2); g.fillStyle = "#1b2029"; g.fillRect(0, 0, s, s); g.fillRect(s, s, s, s);
		pattern = { d: dpr, p: ctx.createPattern(t, "repeat") }; return pattern.p;
	}
	// the 4 corners of a clip's rectangle (frame px), turned by its rotation, in canvas px
	function corners(r) {
		var cx = r.dx + r.dw / 2, cy = r.dy + r.dh / 2;
		return [[r.dx, r.dy], [r.dx + r.dw, r.dy], [r.dx + r.dw, r.dy + r.dh], [r.dx, r.dy + r.dh]].map(function (q) { var p = V.rotPt(q[0], q[1], cx, cy, r.rot || 0); return { x: view.ox + p.x * view.k, y: view.oy + p.y * view.k }; });
	}
	function rotHandle(r) { var cx = r.dx + r.dw / 2, cy = r.dy + r.dh / 2, p = V.rotPt(cx, r.dy - 28 * dpr / view.k, cx, cy, r.rot || 0); return { x: view.ox + p.x * view.k, y: view.oy + p.y * view.k }; }
	function paint() {
		if (!needDraw) return; needDraw = false;
		var CW = cv.width, CH = cv.height, PW = VE.P.w, PH = VE.P.h, k = view.k, fx = view.ox, fy = view.oy, fw = PW * k, fh = PH * k;
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = pasteboard(); ctx.fillRect(0, 0, CW, CH);
		ctx.setTransform(k, 0, 0, k, fx, fy); ctx.imageSmoothingQuality = k < 0.6 ? "medium" : "high";
		VE.draw(ctx, PW, PH, VE.t, source);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		// dim everything outside the frame: what hangs over the edge is still visible, but clearly not in the video
		ctx.save(); ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.rect(fx, fy, fw, fh); ctx.fillStyle = VS.dim ? "rgba(6,8,12,0.66)" : "rgba(6,8,12,0.25)"; ctx.fill("evenodd");
		// frame edge: a thin light line with a dark line outside it, so it shows on any picture
		ctx.lineWidth = Math.max(1, dpr); ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeRect(Math.round(fx) - 1.5 * dpr, Math.round(fy) - 1.5 * dpr, Math.round(fw) + 3 * dpr, Math.round(fh) + 3 * dpr);
		ctx.strokeStyle = "rgba(226,232,240,0.85)"; ctx.strokeRect(Math.round(fx) - 0.5 * dpr, Math.round(fy) - 0.5 * dpr, Math.round(fw) + dpr, Math.round(fh) + dpr);
		if (VS.guides) {
			ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.lineWidth = dpr;
			[[0.05, "rgba(250,204,21,0.8)"], [0.1, "rgba(56,189,248,0.8)"]].forEach(function (q) { ctx.strokeStyle = q[1]; ctx.strokeRect(fx + fw * q[0], fy + fh * q[0], fw * (1 - 2 * q[0]), fh * (1 - 2 * q[0])); });
			ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath();
			var mx = fx + fw / 2, my = fy + fh / 2, a = 12 * dpr; ctx.moveTo(mx - a, my); ctx.lineTo(mx + a, my); ctx.moveTo(mx, my - a); ctx.lineTo(mx, my + a);
			for (var g = 1; g < 3; g++) { ctx.moveTo(fx + fw * g / 3, fy); ctx.lineTo(fx + fw * g / 3, fy + fh); ctx.moveTo(fx, fy + fh * g / 3); ctx.lineTo(fx + fw, fy + fh * g / 3); }
			ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.stroke();
			ctx.font = Math.round(10 * dpr) + "px Arial, sans-serif"; ctx.fillStyle = "rgba(250,204,21,0.9)"; ctx.textBaseline = "top"; ctx.fillText("action safe 90%", fx + fw * 0.05 + 4 * dpr, fy + fh * 0.05 + 3 * dpr);
			ctx.fillStyle = "rgba(56,189,248,0.95)"; ctx.fillText("title safe 80%", fx + fw * 0.1 + 4 * dpr, fy + fh * 0.1 + 3 * dpr);
		}
		ctx.restore();
		// selection frame (turned with the clip), corner handles and the turn handle
		var sel = VE.selected().filter(function (c) { return c.type !== "audio" && V.active(c, VE.t); });
		if (sel.length && !P.playing && !pick) {
			var c = sel[0], r = VE.rectOf(ctx, c, PW, PH);
			if (r) {
				var cs = corners(r), rh = rotHandle(r), top = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 }, hs = 6 * dpr;
				ctx.save(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = "#38bdf8"; ctx.setLineDash([6 * dpr, 4 * dpr]);
				ctx.beginPath(); cs.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
				ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rh.x, rh.y); ctx.stroke();
				ctx.fillStyle = "#38bdf8"; cs.forEach(function (q) { ctx.fillRect(q.x - hs, q.y - hs, hs * 2, hs * 2); });
				ctx.beginPath(); ctx.arc(rh.x, rh.y, hs, 0, Math.PI * 2); ctx.fillStyle = "#0c4a6e"; ctx.fill(); ctx.stroke();
				var rel = VE.t - c.start, run = c.anims && V.animRunning(c, rel, 0.5 / VE.P.fps), own = c.anims && !run && V.animEndingAt(c, rel, 0.5 / VE.P.fps);
				if (run || own) { ctx.font = "700 " + Math.round(11 * dpr) + "px Arial, sans-serif"; ctx.textBaseline = "bottom"; var tx = run ? "Inside an animation: move the playhead to its start or end to change it" : "At the end of \u201c" + V.animName(own) + "\u201d: moving it sets where the animation ends"; var tw = ctx.measureText(tx).width; var bx = 10 * dpr, by = CH - 8 * dpr; /* bottom left of the stage, clear of the zoom bar */ ctx.fillStyle = "rgba(2,6,23,0.85)"; ctx.fillRect(bx - 4 * dpr, by - 15 * dpr, tw + 8 * dpr, 17 * dpr); ctx.fillStyle = run ? "#fca5a5" : "#fde68a"; ctx.fillText(tx, bx, by); }
				ctx.restore();
			}
		}
		if (pick) {
			ctx.save(); ctx.fillStyle = "rgba(2,6,23,0.35)"; ctx.fillRect(fx, fy, fw, fh);
			if (pick.r) { var R = pick.r; ctx.clearRect(0, 0, 0, 0); ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2 * dpr; ctx.setLineDash([8 * dpr, 5 * dpr]); ctx.strokeRect(fx + R.x * k, fy + R.y * k, R.w * k, R.h * k); }
			ctx.font = "700 " + Math.round(13 * dpr) + "px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top"; var msg = "Drag a box over the part to zoom to · Esc cancels", mw = ctx.measureText(msg).width;
			ctx.fillStyle = "rgba(2,6,23,0.85)"; ctx.fillRect(CW / 2 - mw / 2 - 8 * dpr, 8 * dpr, mw + 16 * dpr, 22 * dpr); ctx.fillStyle = "#fde68a"; ctx.fillText(msg, CW / 2, 12 * dpr); ctx.restore();
		}
		if (!VE.P.clips.length) {
			ctx.save(); ctx.fillStyle = "#94a3b8"; ctx.font = Math.round(Math.min(fh / 18, 22 * dpr)) + "px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
			ctx.fillText("Add videos, sound or pictures, then drag them onto the timeline", fx + fw / 2, fy + fh / 2); ctx.restore();
		}
		VE.emit("view");
	}
	// the canvas covers the stage; the frame is fitted (with a margin) or kept where it was, zoomed
	function fit() {
		var bw = Math.max(2, wrap.clientWidth || 640), bh = Math.max(2, wrap.clientHeight || 360), d = Math.min(2, window.devicePixelRatio || 1);
		var pw = Math.round(bw * d), ph = Math.round(bh * d), ow = cv.width, oh = cv.height;
		var cxF = ow ? (ow / 2 - view.ox) / view.k : 0, cyF = oh ? (oh / 2 - view.oy) / view.k : 0;
		cv.style.width = bw + "px"; cv.style.height = bh + "px";
		if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
		if (isFit || !ow) view = V.viewFit(pw, ph, VE.P.w, VE.P.h, Math.round(14 * d));
		else { view.k = view.k / dpr * d; view.ox = pw / 2 - cxF * view.k; view.oy = ph / 2 - cyF * view.k; }
		dpr = d; draw();
	}
	P.fit = fit;
	if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap); else window.addEventListener("resize", fit);
	P.zoomFit = function () { isFit = true; fit(); };
	// zoom to pct (100 = one frame pixel per screen pixel) around a stage point (canvas px; default the middle)
	P.zoomTo = function (pct, px, py) {
		var k2 = V.clamp(pct / 100 * dpr, 0.02, 40); isFit = false;
		view = V.viewZoomAt(view, k2, px == null ? cv.width / 2 : px, py == null ? cv.height / 2 : py); draw();
	};
	P.zoomStep = function (dir, px, py) {
		var cur = view.k / dpr, L = V.ZOOM_STEPS, n = dir > 0 ? L.filter(function (z) { return z > cur * 1.01; })[0] : L.filter(function (z) { return z < cur / 1.01; }).pop();
		if (n) P.zoomTo(n * 100, px, py);
	};
	P.guides = function (on) { if (on != null) { VS.guides = !!on; saveVS(); draw(); } return VS.guides; };
	P.dimOutside = function (on) { if (on != null) { VS.dim = !!on; saveVS(); draw(); } return VS.dim; };
	// zoom-n-pan: let the person draw a box of the frame's shape on the preview; cb(rect in frame px) or cb(null) when cancelled
	P.pickRect = function (cb) { if (P.playing) P.pause(); pick = { cb: cb, r: null }; cv.style.cursor = "crosshair"; draw(); };
	P.picking = function () { return !!pick; };
	P.cancelPick = function () { if (!pick) return; var cb = pick.cb; pick = null; cv.style.cursor = ""; draw(); cb(null); };

	/* ---------- pointer: move / resize / turn clips, pan (middle button, Space, empty pasteboard, two fingers), pinch and Ctrl+wheel zoom ---------- */
	var drag = null, touches = {}, pinch = null;
	function canvasPt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / Math.max(1, b.width), y: (e.clientY - b.top) * cv.height / Math.max(1, b.height) }; }
	function toFrame(e) { var q = canvasPt(e); return { x: (q.x - view.ox) / view.k, y: (q.y - view.oy) / view.k, cx: q.x, cy: q.y }; }
	// is frame point pt inside clip rect r (turned about its centre)?
	function inside(r, pt) { var p = V.rotPt(pt.x, pt.y, r.dx + r.dw / 2, r.dy + r.dh / 2, -(r.rot || 0)); return V.hit(r, p.x, p.y); }
	P.hover = false; P.space = null;
	wrap.addEventListener("pointerenter", function () { P.hover = true; }); wrap.addEventListener("pointerleave", function () { P.hover = false; });
	P.spaceDown = function () { if (!P.space) { P.space = { used: false }; cv.style.cursor = "grab"; } };
	document.addEventListener("keyup", function (e) { if (e.key !== " " || !P.space) return; var used = P.space.used; P.space = null; cv.style.cursor = ""; if (!used) P.toggle(); });
	function startPan(e) { drag = { pan: true, x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; isFit = false; cv.style.cursor = "grabbing"; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
	cv.addEventListener("pointerdown", function (e) {
		if (e.pointerType === "touch") { touches[e.pointerId] = canvasPt(e); var ids = Object.keys(touches); if (ids.length === 2) { if (drag && drag.c && drag.moved) VE.commit(drag.corner ? "Resize" : "Move"); drag = null; var a = touches[ids[0]], b = touches[ids[1]]; pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: Object.assign({}, view) }; isFit = false; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; } }
		if (e.button === 1 || (P.space && e.button === 0)) { if (P.space) P.space.used = true; startPan(e); return; }
		if (e.button > 0) return;
		var pt = toFrame(e);
		if (pick) { pick.p0 = pt; pick.r = null; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
		if (P.playing) P.pause();
		var PW = VE.P.w, PH = VE.P.h, L = V.layersAt(VE.P, VE.t), hitC = null, mode = "move", sel = VE.selected()[0], tol = 9 * dpr;
		if (sel && sel.type !== "audio" && V.active(sel, VE.t)) {
			var r0 = VE.rectOf(ctx, sel, PW, PH);
			if (r0) {
				var rh = rotHandle(r0); if (Math.hypot(pt.cx - rh.x, pt.cy - rh.y) < tol * 1.4) { hitC = sel; mode = "turn"; }
				if (!hitC) corners(r0).forEach(function (q) { if (Math.abs(pt.cx - q.x) < tol && Math.abs(pt.cy - q.y) < tol) { hitC = sel; mode = "corner"; } });
			}
		}
		if (!hitC) for (var j = L.length - 1; j >= 0; j--) { var c = L[j].clip, tr = V.track(VE.P, c.track); if (tr && tr.lock) continue; var r = VE.rectOf(ctx, c, PW, PH, L[j].pos); if (r && inside(r, pt)) { hitC = c; break; } }
		if (!hitC) {
			VE.sel = []; VE.emit("select"); draw();
			if (pt.x < 0 || pt.y < 0 || pt.x > PW || pt.y > PH || !isFit) startPan(e);   // drag the empty pasteboard (or a zoomed view) to move it
			return;
		}
		if (VE.sel.indexOf(hitC.id) < 0) { VE.sel = [hitC.id]; VE.emit("select"); }
		var rel = VE.t - hitC.start, fpsTol = 0.5 / VE.P.fps;
		if (hitC.anims && V.animRunning(hitC, rel, fpsTol)) { VE.emit("notice", "The playhead is inside an animation. Move it to the animation's start or end (double-click its arrow on the timeline) to move the clip there."); draw(); return; }
		var pos = V.posAt(hitC, VE.t), cxp = pos.x * PW, cyp = pos.y * PH;
		drag = { c: hitC, mode: mode, rel: rel, tol: fpsTol, x0: pos.x, y0: pos.y, s0: pos.scale, r0: pos.rot, p0: pt, d0: Math.max(4, Math.hypot(pt.x - cxp, pt.y - cyp)), a0: Math.atan2(pt.y - cyp, pt.x - cxp), cx: cxp, cy: cyp, moved: false };
		cv.setPointerCapture(e.pointerId); e.preventDefault(); draw();
	});
	cv.addEventListener("pointermove", function (e) {
		if (e.pointerType === "touch" && touches[e.pointerId]) touches[e.pointerId] = canvasPt(e);
		if (pinch) {
			var ids = Object.keys(touches); if (ids.length < 2) return; var a = touches[ids[0]], b = touches[ids[1]], d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			view = V.viewZoomAt(pinch.v, V.clamp(pinch.v.k * d / pinch.d, 0.02, 40), pinch.m.x, pinch.m.y); view.ox += m.x - pinch.m.x; view.oy += m.y - pinch.m.y; draw(); return;
		}
		if (pick && pick.p0) {
			var q = toFrame(e), W = VE.P.w, H = VE.P.h, w = Math.max(Math.abs(q.x - pick.p0.x), Math.abs(q.y - pick.p0.y) * W / H);
			pick.r = V.frameRect(Math.min(q.x, pick.p0.x) + Math.abs(q.x - pick.p0.x) / 2, Math.min(q.y, pick.p0.y) + Math.abs(q.y - pick.p0.y) / 2, Math.max(8, w), W, H); draw(); return;
		}
		if (!drag) { if (!P.playing && !pick) cv.style.cursor = P.space ? "grab" : ""; return; }
		if (drag.pan) { var b2 = cv.getBoundingClientRect(), sx = cv.width / Math.max(1, b2.width); view.ox = drag.ox + (e.clientX - drag.x) * sx; view.oy = drag.oy + (e.clientY - drag.y) * sx; draw(); return; }
		var pt = toFrame(e), c = drag.c, rel = drag.rel, tol = drag.tol; drag.moved = true;
		if (drag.mode === "corner") V.setPropAt(c, rel, "scale", V.clamp(Math.round(drag.s0 * Math.hypot(pt.x - drag.cx, pt.y - drag.cy) / drag.d0 * 1000) / 1000, 0.02, 20), tol);
		else if (drag.mode === "turn") { var ang = drag.r0 + (Math.atan2(pt.y - drag.cy, pt.x - drag.cx) - drag.a0) * 180 / Math.PI; if (!e.shiftKey) ang = Math.round(ang / 5) * 5; if (!e.shiftKey && Math.abs(ang % 90) < 3) ang = Math.round(ang / 90) * 90; V.setPropAt(c, rel, "rot", Math.round(ang * 100) / 100, tol); }
		else {
			var nx = drag.x0 + (pt.x - drag.p0.x) / VE.P.w, ny = drag.y0 + (pt.y - drag.p0.y) / VE.P.h;
			if (!e.altKey) { if (Math.abs(nx - 0.5) < 0.012) nx = 0.5; if (Math.abs(ny - 0.5) < 0.012) ny = 0.5; }
			V.setPropAt(c, rel, "x", Math.round(nx * 10000) / 10000, tol); V.setPropAt(c, rel, "y", Math.round(ny * 10000) / 10000, tol);
		}
		VE.emit("live"); draw();
	});
	function end(e) {
		if (e && e.pointerType === "touch") { delete touches[e.pointerId]; if (pinch && Object.keys(touches).length < 2) pinch = null; }
		if (pick && pick.p0) { var r = pick.r, cb = pick.cb; pick = null; cv.style.cursor = ""; draw(); cb(r && r.w > 8 ? r : null); return; }
		if (drag && drag.pan) { drag = null; cv.style.cursor = P.space ? "grab" : ""; return; }
		if (drag && drag.moved) { var a = V.animEndingAt(drag.c, drag.rel, drag.tol) || V.propOwner(drag.c, drag.rel, drag.mode === "corner" ? "scale" : drag.mode === "turn" ? "rot" : "x", drag.tol); VE.commit((drag.mode === "corner" ? "Resize" : drag.mode === "turn" ? "Turn" : "Move") + (a ? " (animation end)" : "")); }
		drag = null;
	}
	cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
	cv.addEventListener("dblclick", function () { var c = VE.selected()[0]; if (c && c.type === "text") VE.emit("editText", c); });
	cv.addEventListener("wheel", function (e) {
		var q = canvasPt(e);
		if (e.ctrlKey || e.metaKey) { e.preventDefault(); isFit = false; view = V.viewZoomAt(view, V.clamp(view.k * Math.pow(1.0018, -e.deltaY), 0.02, 40), q.x, q.y); draw(); return; }   // trackpad pinch arrives as Ctrl + wheel
		if (isFit) return;   // fitted: the page scrolls as usual
		e.preventDefault(); var s = cv.width / Math.max(1, cv.getBoundingClientRect().width); view.ox -= e.deltaX * s; view.oy -= e.deltaY * s; draw();
	}, { passive: false });
	cv.addEventListener("auxclick", function (e) { if (e.button === 1) e.preventDefault(); });

	VE.on("change", function () { if (P.playing && !P.rev) { stopClean(); scheduleClean(); } fit(); sync(); draw(); });
	VE.on("select", draw); VE.on("mediaReady", function () { sync(); draw(); }); VE.on("thumbs", function () { });
	document.addEventListener("visibilitychange", function () { if (document.hidden && P.playing) P.pause(); });
})();

/* MES Video Editor timeline: tracks (video above, audio below), clips with thumbnails / waveforms, drag to move (snapping, no overlaps),
 * drag an edge to trim, click / drag the ruler to move the playhead, Ctrl + wheel or the slider to zoom, I / O marks, drop media from the bin. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, $ = function (id) { return document.getElementById(id); };
	var HEAD = 150, RULER = 26;
	var sc = $("vd-tlscroll"), inner = $("vd-tlinner"), rulerC = $("vd-ruler"), rows = $("vd-rows"), ph = $("vd-playhead"), markEl = $("vd-markzone");
	var T = VE.tl = { snap: true, wave: "db" };
	function x2t(clientX) { var b = sc.getBoundingClientRect(); return Math.max(0, (clientX - b.left + sc.scrollLeft - HEAD) / VE.pps); }
	function t2x(t) { return HEAD + t * VE.pps; }
	T.x2t = x2t;

	/* ---------- render ---------- */
	T.render = function () {
		var p = VE.P, dur = V.duration(p), total = Math.max(dur + 20, (sc.clientWidth - HEAD) / VE.pps + 5);
		inner.style.width = (HEAD + total * VE.pps) + "px";
		var html = "", sel = {}; VE.sel.forEach(function (i) { sel[i] = 1; });
		var nV = p.tracks.filter(function (t) { return t.kind === "v"; }).length, nA = p.tracks.length - nV;
		p.tracks.forEach(function (tr) {
			var h = V.rowH(tr), canDel = (tr.kind === "v" ? nV : nA) > 1 && !p.clips.some(function (c) { return c.track === tr.id; });
			html += '<div class="vd-trow vd-trow--' + tr.kind + (tr.hide || tr.mute ? " is-off" : "") + (tr.lock ? " is-lock" : "") + (tr.mag ? " is-mag" : "") + '" data-track="' + tr.id + '" style="height:' + h + 'px">' +
				'<div class="vd-thead"><span class="vd-tname" title="Double-click to rename">' + VE.esc(tr.name) + "</span><span class=\"vd-tbtns\">" +
				(tr.kind === "v" ? '<button type="button" data-tact="hide" aria-pressed="' + !!tr.hide + '" title="' + (tr.hide ? "Show" : "Hide") + ' this track">' + (tr.hide ? "&#128065;&#824;" : "&#128065;") + "</button>" : "") +
				'<button type="button" data-tact="mute" aria-pressed="' + !!tr.mute + '" title="' + (tr.mute ? "Unmute" : "Mute") + ' this track">' + (tr.mute ? "&#128263;" : "&#128266;") + "</button>" +
				'<button type="button" data-tact="lock" aria-pressed="' + !!tr.lock + '" title="' + (tr.lock ? "Unlock" : "Lock") + ' this track">' + (tr.lock ? "&#128274;" : "&#128275;") + "</button>" +
				'<button type="button" data-tact="mag" aria-pressed="' + !!tr.mag + '" title="' + (tr.mag ? "Magnetic track: clips close up with no gaps (click to turn off)" : "Make this track magnetic: clips close up to the left with no gaps") + '"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2h3v6a2 2 0 0 0 4 0V2h3v6a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M3 2h3v2H3zM10 2h3v2h-3z" fill="#f87171"/></svg></button>' +
				(canDel ? '<button type="button" data-tact="del" title="Delete this empty track">&times;</button>' : "") + "</span>" + (h >= 70 && tr.kind === "a" ? '<span class="vd-tsub">' + (T.wave === "db" ? "dB scale" : "linear scale") + "</span>" : "") + "</div><div class=\"vd-lane\">";
			V.onTrack(p, tr.id).forEach(function (c) {
				var m = VE.media(c.media), x = c.start * VE.pps, w = Math.max(4, V.dur(c) * VE.pps), label = c.type === "text" ? "T  " + (c.text && c.text.s || "").split("\n")[0] : m ? m.name : "(missing)";
				var badges = (c.link ? "🔗 " : "") + (c.speed && c.speed !== 1 ? c.speed + "×  " : "") + (c.clean && c.clean.key ? "✓ clean  " : "") + (V.afxOn(c) ? "fx  " : "") + (c.mute ? "muted  " : "") + (c.type === "video" && c.noAudio ? "no sound  " : "");
				html += '<div class="vd-clip vd-clip--' + c.type + (sel[c.id] ? " is-sel" : "") + (m && m.state === "missing" ? " is-missing" : "") + '" data-id="' + c.id + '" style="left:' + x + "px;width:" + w + 'px" title="' + VE.esc(label) + " · " + V.short(V.dur(c)) + '">' +
					(c.xin > 0 ? '<i class="vd-xf" style="width:' + c.xin * VE.pps + 'px"></i>' : "") +
					'<canvas class="vd-cc" data-h="' + (h - 4) + '"></canvas><span class="vd-cl">' + VE.esc(badges + label) + "</span>" +
					(c.fin > 0 ? '<i class="vd-fade vd-fade--in" style="width:' + c.fin * VE.pps + 'px"></i>' : "") + (c.fout > 0 ? '<i class="vd-fade vd-fade--out" style="width:' + c.fout * VE.pps + 'px"></i>' : "") + animMarks(c, w) + "</div>";
			});
			html += '</div><i class="vd-rgrip" data-rgrip="' + tr.id + '" title="Drag to make this track taller or shorter (double-click: normal height)"></i></div>';
		});
		rows.innerHTML = html;
		rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el, true); });
		var mk = p.marks || {};
		if (mk.in != null && mk.out != null && mk.out > mk.in) { markEl.hidden = false; markEl.style.left = t2x(mk.in) + "px"; markEl.style.width = (mk.out - mk.in) * VE.pps + "px"; }
		else markEl.hidden = true;
		drawRuler(); T.playhead();
	};
	// each animation is an arrow along the top of its clip: a dot at its start, an arrowhead at its end
	function animMarks(c, w) {
		if (!c.anims || c.type === "audio") return "";
		return c.anims.map(function (a, i) {
			var x = a.t * VE.pps, aw = Math.max(10, a.d * VE.pps); if (x + aw < 0 || x > w) return "";
			return '<i class="vd-an-mk' + (VE.animSel === a.id ? " is-sel" : "") + '" data-aid="' + VE.esc(a.id) + '" style="left:' + x + "px;width:" + aw + "px;top:" + (2 + (i % 2) * 13) + 'px" title="' + VE.esc(V.animName(a)) + " · " + (Math.round(a.d * 100) / 100) + ' s. Drag to move, drag an end to change its length, click to jump to its end."><u></u><s></s><b></b></i>';
		}).join("");
	}
	// the canvas only covers the part of the clip that is on screen (plus a screen on each side), drawn at real size: a long clip zoomed
	// in is never one huge stretched picture. Scrolling repaints a clip when the view leaves the part it has painted.
	function view() { var m = sc.clientWidth || 800; return { v0: sc.scrollLeft - HEAD - m, v1: sc.scrollLeft - HEAD + 2 * m }; }
	function paintClip(el, force) {
		var c = V.clip(VE.P, el.getAttribute("data-id")); if (!c) return;
		var cv = el.querySelector("canvas"), m = VE.media(c.media), x0 = c.start * VE.pps, w = Math.max(4, V.dur(c) * VE.pps), vw = view();
		var a = Math.max(0, Math.floor(vw.v0 - x0)), b = Math.min(Math.ceil(w), Math.ceil(vw.v1 - x0));
		if (!force && cv._a != null && cv._a <= Math.max(0, sc.scrollLeft - HEAD - x0) && cv._b >= Math.min(w, sc.scrollLeft - HEAD + sc.clientWidth - x0)) return;
		if (b <= a) { cv.style.display = "none"; cv._a = cv._b = null; return; }
		var dpr = Math.min(2, window.devicePixelRatio || 1), H = +cv.getAttribute("data-h") || el.clientHeight, W = b - a;
		cv.style.display = ""; cv.style.left = a + "px"; cv.style.width = W + "px"; cv.style.right = "auto";
		cv.width = Math.min(16384, Math.round(W * dpr)); cv.height = Math.round(H * dpr); cv._a = a; cv._b = b;
		var g = cv.getContext("2d"); g.setTransform(cv.width / W, 0, 0, dpr, -a * cv.width / W, 0); g.clearRect(a, 0, W, H);
		if (c.type === "video" && m && m.thumbImg && m.thumbTimes) {
			var th = H - (VE.hasSound(c) ? 18 : 0), tw = Math.max(8, th * m.thumbW / m.thumbH);
			for (var x = Math.floor(a / tw) * tw; x < b; x += tw) {
				var s = V.srcAt(c, c.start + (x + tw / 2) / VE.pps), idx = nearest(m.thumbTimes, s);
				g.drawImage(m.thumbImg, idx * m.thumbW, 0, m.thumbW, m.thumbH, x, 0, tw, th);
			}
		} else if (c.type === "image" && m && m.bitmap) {
			var ih = H, iw = ih * m.w / m.h; for (var x2 = Math.floor(a / (iw + 6)) * (iw + 6); x2 < b; x2 += iw + 6) g.drawImage(m.bitmap, x2, 0, iw, ih);
		}
		if (VE.hasSound(c) && m && (m.wave || m.peaks)) {
			var big = c.type === "audio", hh = big ? H : 18, top = big ? 0 : H - 18;
			if (!big) { g.fillStyle = "rgba(2,6,23,0.6)"; g.fillRect(a, top, W, hh); }
			paintWave(g, c, m, a, b, top, hh, big);
		}
	}
	var scrollRaf = 0;
	function repaintVisible() { scrollRaf = 0; rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el); }); }
	// peak (light) and RMS (solid) of the clip's sound, mirrored; dB scale by default so quiet parts show too. With audio effects on, the
	// original is drawn faint and the processed sound over it; red ticks where it would clip
	function paintWave(g, c, m, A, B, top, hh, big) {
		var mode = T.wave, mid = top + hh / 2, half = hh / 2 - 1, vdb = V.db(c.vol == null ? 1 : c.vol), env = V.afxOn(c) ? VE.fxEnv(c) : null, w = m.wave, wr = (m.wave && m.wave.r) || 50, dim = c.mute ? 0.35 : 1;
		if (!isFinite(vdb)) vdb = -120;
		if (big && hh >= 56) {
			g.save(); g.font = "9px Arial, sans-serif"; g.textBaseline = "middle";
			(mode === "db" ? [0, -6, -12, -24, -48] : [0, -6, -12]).forEach(function (d) {
				var y = V.waveY(d, mode) * half; g.fillStyle = d === 0 ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.10)";
				g.fillRect(A, Math.round(mid - y), B - A, 1); g.fillRect(A, Math.round(mid + y), B - A, 1);
				if (d < 0 && y > 9 && y < half - 4) { g.fillStyle = "rgba(255,255,255,0.5)"; g.fillText(String(d), Math.max(3, sc.scrollLeft - HEAD - c.start * VE.pps + 3), mid - y + 6); }
			});
			g.restore();
		}
		g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(A, Math.round(mid), B - A, 1);
		var cols = env ? ["rgba(255,255,255,0.16)", "rgba(110,231,183,0.75)", "#d1fae5"] : big ? [null, "rgba(110,231,183,0.62)", "#a7f3d0"] : [null, "rgba(125,211,252,0.55)", "#7dd3fc"];
		// zoomed in past the stored 200-a-second levels: work each pixel out from the decoded sound itself, so it stays sharp
		var fine = Math.abs(V.srcAt(c, c.start + (A + 1) / VE.pps) - V.srcAt(c, c.start + A / VE.pps)) < 1 / 160;
		for (var px = A; px < B; px++) {
			var s0 = V.srcAt(c, c.start + px / VE.pps), s1 = V.srcAt(c, c.start + (px + 1) / VE.pps), i0 = Math.max(0, Math.floor(s0 * (w ? wr : 50))), i1 = Math.max(i0 + 1, Math.floor(s1 * (w ? wr : 50))), pk = -Infinity, rm = -Infinity;
			var buf = fine ? VE.pcmNow(m, s0) : null;
			if (buf) {
				var j0 = Math.max(0, Math.floor((s0 - buf.start) * buf.rate)), j1 = Math.max(j0 + 1, Math.ceil((s1 - buf.start) * buf.rate)), mx = 0, e = 0, cnt = 0;
				for (var ch = 0; ch < buf.ch.length; ch++) { var xs = buf.ch[ch]; for (var j = j0, je = Math.min(xs.length, j1); j < je; j++) { var v = xs[j]; e += v * v; cnt++; if (v > mx) mx = v; else if (-v > mx) mx = -v; } }
				if (!cnt) continue;
				pk = V.db(mx); rm = V.db(Math.sqrt(e / cnt));
			} else if (w) { for (var i = i0; i < i1 && i < w.pk.length; i++) { var a = V.decDb(w.pk[i]), b = V.decDb(w.rms[i]); if (a > pk) pk = a; if (b > rm) rm = b; } }
			else { var mx = 0; for (var i2 = i0; i2 < i1 && i2 < m.peaks.length; i2++) if (m.peaks[i2] > mx) mx = m.peaks[i2]; pk = V.db(Math.pow(mx / 255, 2)); rm = pk - 9; }
			if (!isFinite(pk)) continue;
			pk += vdb; rm += vdb;
			var eg = env ? V.db(V.envAt(env, (s0 + s1) / 2)) : 0, ph = V.waveY(pk + eg, mode) * half * dim, rh = V.waveY(rm + eg, mode) * half * dim;
			if (env) { var oh = V.waveY(pk, mode) * half * dim; g.fillStyle = cols[0]; g.fillRect(px, mid - oh, 1, oh * 2); }
			if (ph > 0.3) { g.fillStyle = cols[1]; g.fillRect(px, mid - ph, 1, ph * 2); }
			if (rh > 0.3) { g.fillStyle = cols[2]; g.fillRect(px, mid - rh, 1, rh * 2); }
			if (big && pk + eg > -0.5) { g.fillStyle = "#ef4444"; g.fillRect(px, top, 1, 3); g.fillRect(px, top + hh - 3, 1, 3); }
		}
	}
	function nearest(arr, v) { var lo = 0, hi = arr.length - 1; while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; } if (lo > 0 && Math.abs(arr[lo - 1] - v) < Math.abs(arr[lo] - v)) lo--; return lo; }
	function drawRuler() {
		var w = sc.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
		rulerC.width = Math.round(w * dpr); rulerC.height = Math.round(RULER * dpr); rulerC.style.width = w + "px"; rulerC.style.left = sc.scrollLeft + "px";
		var g = rulerC.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, RULER);
		var step = V.tickStep(VE.pps, 80), t0 = Math.max(0, (sc.scrollLeft - HEAD) / VE.pps), t1 = t0 + w / VE.pps, sub = step / 5;
		g.fillStyle = getComputedStyle(rulerC).color || "#cbd5e1"; g.font = "11px Arial, sans-serif"; g.textBaseline = "top";
		for (var t = Math.floor(t0 / sub) * sub; t <= t1 + step; t += sub) {
			var x = t2x(t) - sc.scrollLeft; if (x < HEAD - 1) continue;
			var major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
			g.fillRect(Math.round(x), major ? 12 : 19, 1, major ? 14 : 7);
			if (major) g.fillText(step < 1 ? V.tc(t, VE.P.fps) : V.short(t).replace(/\.0$/, ""), x + 3, 1);
		}
		var mk = VE.P.marks || {};
		[["in", "I"], ["out", "O"]].forEach(function (q) { var v = mk[q[0]]; if (v == null) return; var x = t2x(v) - sc.scrollLeft; if (x < HEAD) return; g.fillStyle = "#facc15"; g.fillRect(x - 1, 0, 2, RULER); g.fillText(q[1], x + 3, 13); });
	}
	T.playhead = function () {
		var x = t2x(VE.t); ph.style.left = x + "px";
		if (VE.preview && VE.preview.playing) { var v0 = sc.scrollLeft + HEAD, v1 = sc.scrollLeft + sc.clientWidth; if (x > v1 - 40 || x < v0) sc.scrollLeft = Math.max(0, x - HEAD - 60); }
	};
	// scroll the timeline so time t is on screen (keyboard / button jumps)
	T.reveal = function (t) { var x = t2x(t), v0 = sc.scrollLeft + HEAD, v1 = sc.scrollLeft + sc.clientWidth; if (x < v0 + 20 || x > v1 - 20) sc.scrollLeft = Math.max(0, x - HEAD - (sc.clientWidth - HEAD) / 3); };
	sc.addEventListener("scroll", function () { drawRuler(); if (!scrollRaf) scrollRaf = requestAnimationFrame(repaintVisible); });
	T.zoom = function (pps, aroundClientX) {
		var old = VE.pps, b = sc.getBoundingClientRect(), ax = aroundClientX == null ? b.left + HEAD + (sc.clientWidth - HEAD) / 2 : aroundClientX, at = x2t(ax);
		VE.pps = V.clamp(pps, 1, 600); T.render();
		sc.scrollLeft = Math.max(0, HEAD + at * VE.pps - (ax - b.left));
		VE.emit("zoom", VE.pps); if (old !== VE.pps) { /* slider follows */ }
	};
	T.fit = function () { var d = V.duration(VE.P) || 10; T.zoom((sc.clientWidth - HEAD - 30) / d); sc.scrollLeft = 0; };
	sc.addEventListener("wheel", function (e) {
		if (!(e.ctrlKey || e.metaKey)) return;
		e.preventDefault(); T.zoom(VE.pps * Math.pow(1.0015, -e.deltaY), e.clientX);
	}, { passive: false });

	/* ---------- pointer: playhead, select, move, trim, track height ---------- */
	var drag = null;
	function snapPts(ignore) { return V.snapPoints(VE.P, ignore, [VE.t]); }
	function unlocked(c) { var q = V.track(VE.P, c.track); return !(q && q.lock); }
	inner.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		var tb = e.target.closest("[data-tact]"); if (tb) return trackAction(tb);
		var rg = e.target.closest("[data-rgrip]");
		if (rg) { var rtr = V.track(VE.P, rg.getAttribute("data-rgrip")); drag = { mode: "rowh", tr: rtr, y0: e.clientY, h0: V.rowH(rtr), moved: false }; inner.setPointerCapture(e.pointerId); e.preventDefault(); return; }
		if (e.target.closest(".vd-thead")) return;
		var mk = e.target.closest(".vd-an-mk");
		if (mk) {
			var mc = V.clip(VE.P, mk.closest(".vd-clip").getAttribute("data-id")), ma = mc && (mc.anims || []).filter(function (x) { return x.id === mk.getAttribute("data-aid"); })[0];
			if (ma) {
				VE.sel = [mc.id]; VE.animSel = ma.id; VE.emit("select");
				var mr = mk.getBoundingClientRect(), medge = mr.width >= 18 && e.clientX - mr.left < 6 ? "l" : mr.width >= 18 && mr.right - e.clientX < 7 ? "r" : null, mtr = V.track(VE.P, mc.track);
				drag = { mode: "anim", c: mc, a: ma, edge: medge, x0: e.clientX, t0: ma.t, d0: ma.d, moved: false, locked: !!(mtr && mtr.lock) };
				inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
			}
		}
		var clipEl = e.target.closest(".vd-clip"), t = x2t(e.clientX);
		if (e.target.closest("#vd-rulerwrap") || !clipEl) {
			if (!e.target.closest("#vd-rulerwrap") && !e.shiftKey) { VE.sel = []; VE.emit("select"); }
			drag = { mode: "scrub" }; VE.preview.seek(t); inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
		}
		var c = V.clip(VE.P, clipEl.getAttribute("data-id")); if (!c) return;
		var tr = V.track(VE.P, c.track);
		if (e.shiftKey || e.ctrlKey || e.metaKey) { var i = VE.sel.indexOf(c.id); if (i >= 0) VE.sel.splice(i, 1); else VE.sel.push(c.id); }
		else if (VE.sel.indexOf(c.id) < 0) VE.sel = [c.id];
		VE.emit("select"); markSel();
		if (tr && tr.lock) return;
		var r = clipEl.getBoundingClientRect(), edge = e.clientX - r.left < 7 ? "l" : r.right - e.clientX < 7 ? "r" : null;
		if (r.width < 22) edge = null;
		var prim = VE.selected().filter(unlocked), ids = e.altKey ? prim.map(function (x) { return x.id; }) : V.withLinks(VE.P, prim.map(function (x) { return x.id; }));   // linked partners move along (Alt: just this clip)
		var group = ids.map(function (id) { return V.clip(VE.P, id); }).filter(function (x) { return x && unlocked(x); });
		drag = { mode: edge ? "trim" : "move", edge: edge, c: c, x0: e.clientX, t0: t, snap: JSON.stringify(VE.P), prim: prim.length, orig: group.map(function (x) { return { c: x, start: x.start, in: x.in, out: x.out, track: x.track, anims: x.anims ? JSON.stringify(x.anims) : null }; }), moved: false, el: clipEl };
		inner.setPointerCapture(e.pointerId); e.preventDefault();
	});
	function mag(id) { var q = V.track(VE.P, id); return !!(q && q.mag); }
	inner.addEventListener("pointermove", function (e) {
		if (!drag) { var ce = e.target.closest && e.target.closest(".vd-clip"); if (ce) { var r = ce.getBoundingClientRect(); ce.style.cursor = (r.width >= 22 && (e.clientX - r.left < 7 || r.right - e.clientX < 7)) ? "ew-resize" : "grab"; } return; }
		if (drag.mode === "scrub") { VE.preview.seek(x2t(e.clientX)); return; }
		if (drag.mode === "anim") {
			var ddx = e.clientX - drag.x0; if (drag.locked || (!drag.moved && Math.abs(ddx) < 3)) return; drag.moved = true;
			var ac = drag.c, aa = drag.a, len = V.dur(ac), dta = ddx / VE.pps, lo = Math.min(0, drag.t0), sn = T.snap && !e.altKey ? 8 / VE.pps : 0;
			function snapRel(r) { if (!sn) return r; var pts = [VE.t - ac.start, 0, len]; (ac.anims || []).forEach(function (o) { if (o !== aa) pts.push(o.t, o.t + o.d); }); return V.snap(r, pts, sn).t; }
			if (drag.edge === "l") { var end = drag.t0 + drag.d0, nt = V.clamp(snapRel(drag.t0 + dta), lo, end - 0.05); aa.t = nt; aa.d = end - nt; }
			else if (drag.edge === "r") { var ne = V.clamp(snapRel(drag.t0 + drag.d0 + dta), drag.t0 + 0.05, Math.max(len, drag.t0 + drag.d0)); aa.d = ne - drag.t0; }
			else { var st = drag.t0 + dta, s1 = snapRel(st), s2 = snapRel(st + drag.d0) - drag.d0; st = Math.abs(s1 - st) <= Math.abs(s2 - st) ? s1 : s2; aa.t = V.clamp(st, lo, Math.max(lo, len - drag.d0)); }
			aa.t = Math.round(aa.t * 1e4) / 1e4; aa.d = Math.round(aa.d * 1e4) / 1e4;
			T.render(); VE.preview.draw(); VE.emit("live"); return;
		}
		if (drag.mode === "rowh") { drag.moved = true; drag.tr.h = V.clamp(Math.round(drag.h0 + e.clientY - drag.y0), V.ROW_MIN, V.ROW_MAX); T.render(); return; }
		var dx = e.clientX - drag.x0; if (!drag.moved && Math.abs(dx) < 3 && drag.mode === "move" && !rowAt(e.clientY, drag.c)) return;
		drag.moved = true; var dt = dx / VE.pps, ign = {}; drag.orig.forEach(function (o) { ign[o.c.id] = 1; });
		if (drag.mode === "trim") {
			var c = drag.c, o = drag.orig.filter(function (q) { return q.c === c; })[0] || { start: c.start, in: c.in, out: c.out, anims: c.anims ? JSON.stringify(c.anims) : null };
			Object.assign(c, { start: o.start, in: o.in, out: o.out, anims: o.anims ? JSON.parse(o.anims) : null });
			var want = (drag.edge === "l" ? o.start : V.end(c)) + dt, isMag = mag(c.track);
			if (T.snap && !e.altKey) want = V.snap(want, snapPts(ign), 8 / VE.pps).t;
			var nb = V.onTrack(VE.P, c.track).filter(function (x) { return x !== c; }), lo = 0, hi = Infinity;
			if (!isMag) nb.forEach(function (x) { if (V.end(x) <= o.start + 1e-4) lo = Math.max(lo, V.end(x)); if (x.start >= V.end(c) - 1e-4) hi = Math.min(hi, x.start); });
			if (isMag && drag.edge === "l") want = o.start + dt;   // magnetic: the edge follows the pointer, no snapping
			Object.assign(c, V.trim(c, drag.edge, want, { mediaDur: VE.mediaDur(c), lo: lo, hi: hi, minDur: 1 / VE.P.fps, mag: isMag }));
			// linked partners get the same trim
			var grow = V.dur(c) - (o.out - o.in) / (c.speed || 1);
			if (isMag) {   // put the other clips back where they were, then let the partners' (non-magnetic) tracks ripple by the same amount
				var keep0 = JSON.parse(drag.snap), was = {}; keep0.clips.forEach(function (x) { was[x.id] = x; });
				VE.P.clips.forEach(function (x) { if (!ign[x.id] && was[x.id]) x.start = was[x.id].start; });
			}
			drag.orig.forEach(function (q) {
				if (q.c === c || !c.link || q.c.link !== c.link) return;
				q.c.start = c.start; q.c.in = c.in; q.c.out = c.out;
				if (isMag && !mag(q.c.track)) V.onTrack(VE.P, q.c.track).forEach(function (x) { if (!ign[x.id] && x.start >= q.start + (q.out - q.in) / (q.c.speed || 1) - 1e-4) x.start = Math.max(0, x.start + grow); });
			});
			drag.bad = drag.orig.some(function (q) { return q.c !== c && !mag(q.c.track) && !V.canPlace(VE.P, q.c.track, q.c.start, V.dur(q.c), ign); });
			if (isMag) V.pack(VE.P, c.track);
			V.syncLinks(VE.P);
		} else {
			// move: the clip under the pointer snaps, the others keep their distance; the clip under the pointer may change track
			var p0 = drag.orig.filter(function (q) { return q.c === drag.c; })[0], ns = Math.max(0, p0.start + dt);
			if (T.snap && !e.altKey) { var d = V.dur(drag.c), pts = snapPts(ign), a = V.snap(ns, pts, 8 / VE.pps), b = V.snap(ns + d, pts, 8 / VE.pps); if (a.snapped) ns = a.t; else if (b.snapped) ns = b.t - d; }
			var shift = ns - p0.start; drag.orig.forEach(function (o) { if (o.start + shift < 0) shift = -o.start; });
			var newTrack = drag.prim === 1 ? rowAt(e.clientY, drag.c) : null;
			// magnetic tracks: start from the state before the drag so their clips do not drift while the pointer moves
			var keep = JSON.parse(drag.snap), byId = {}; keep.clips.forEach(function (x) { byId[x.id] = x; });
			VE.P.clips.forEach(function (x) { if (!ign[x.id] && byId[x.id] && mag(x.track)) x.start = byId[x.id].start; });
			drag.orig.forEach(function (o) { o.c.start = o.start + shift; o.c.track = o.c === drag.c && newTrack ? newTrack : o.track; });
			var touched = {};
			drag.orig.forEach(function (o) { touched[o.track] = 1; touched[o.c.track] = 1; });
			Object.keys(touched).forEach(function (tid) { if (!mag(tid)) return; var ms = drag.orig.filter(function (o) { return o.c.track === tid; }); if (ms.length === 1) V.magnetInsert(VE.P, tid, ms[0].c.id, ms[0].c.start); else V.pack(VE.P, tid); });
			if (drag.orig.some(function (o) { return mag(o.c.track); })) V.syncLinks(VE.P);
			drag.bad = drag.orig.some(function (o) { return !mag(o.c.track) && !V.canPlace(VE.P, o.c.track, o.c.start, V.dur(o.c), ign); });
			if (drag.bad && drag.orig.length === 1) { var f = V.fitOnTrack(VE.P, drag.c.track, drag.c.start, V.dur(drag.c), ign); if (f != null && Math.abs(f - drag.c.start) < 2.5 * Math.max(1, V.dur(drag.c))) { drag.c.start = f; drag.bad = false; } }
		}
		T.render(); var el = rows.querySelector('.vd-clip[data-id="' + drag.c.id + '"]'); if (el && drag.bad) el.classList.add("is-bad");
		VE.emit("live");
	});
	function rowAt(clientY, c) {
		var row = null; rows.querySelectorAll(".vd-trow").forEach(function (r) { var b = r.getBoundingClientRect(); if (clientY >= b.top && clientY < b.bottom) row = r; });
		if (!row) return null; var tr = V.track(VE.P, row.getAttribute("data-track"));
		return tr && !tr.lock && tr.kind === V.kindFor(c.type) ? tr.id : null;
	}
	function finish() {
		if (!drag) return;
		var d = drag; drag = null;
		if (d.mode === "rowh") { if (d.moved) VE.commit("Track height"); return; }
		if (d.mode === "anim") {
			if (d.moved) { d.c.anims = V.cleanAnims(d.c.anims); VE.commit(d.edge ? "Animation length" : "Move animation"); }
			else VE.preview.seek(Math.min(V.end(d.c) - 1e-3, d.c.start + d.a.t + d.a.d));   // a click jumps to its end, ready to drag the clip there in the preview
			return;
		}
		if (d.mode === "scrub" || !d.moved) { T.render(); return; }
		if (d.bad) { VE.P = JSON.parse(d.snap); T.render(); VE.emit("live"); VE.emit("notice", "There is no room there: clips on one track cannot overlap (turn on the magnet of a track to have clips close up instead)."); return; }
		VE.commit(d.mode === "trim" ? "Trim" : "Move");
	}
	inner.addEventListener("pointerup", finish); inner.addEventListener("pointercancel", finish);
	function markSel() { var s = {}; VE.sel.forEach(function (i) { s[i] = 1; }); rows.querySelectorAll(".vd-clip").forEach(function (el) { el.classList.toggle("is-sel", !!s[el.getAttribute("data-id")]); }); rows.querySelectorAll(".vd-an-mk").forEach(function (el) { el.classList.toggle("is-sel", el.getAttribute("data-aid") === VE.animSel); }); }
	T.markSel = markSel;
	function trackAction(b) {
		var row = b.closest(".vd-trow"), tr = V.track(VE.P, row.getAttribute("data-track")), a = b.getAttribute("data-tact");
		if (a === "del") { VE.P.tracks = VE.P.tracks.filter(function (x) { return x !== tr; }); VE.commit("Delete track"); return; }
		tr[a] = !tr[a];
		if (a === "mag" && tr.mag) VE.emit("notice", tr.name + " is magnetic: its clips close up to the left with no gaps.");
		VE.commit(a === "hide" ? "Hide track" : a === "mute" ? "Mute track" : a === "mag" ? (tr.mag ? "Magnetic track on" : "Magnetic track off") : "Lock track");
	}
	rows.addEventListener("dblclick", function (e) {
		var rg = e.target.closest("[data-rgrip]"); if (rg) { var gt = V.track(VE.P, rg.getAttribute("data-rgrip")); delete gt.h; VE.commit("Track height"); return; }
		var n = e.target.closest(".vd-tname"); if (n) { var tr = V.track(VE.P, n.closest(".vd-trow").getAttribute("data-track")), nm = window.prompt("Track name", tr.name); if (nm) { tr.name = nm.slice(0, 40); VE.commit("Rename track"); } return; }
		var ce = e.target.closest(".vd-clip"); if (ce) { var c = V.clip(VE.P, ce.getAttribute("data-id")); if (c && c.type === "text") VE.emit("editText", c); }
	});

	/* ---------- dropping media from the bin ---------- */
	// place media m at the time under clientX on the row under clientY (or the first fitting track); returns the new clip
	T.placeMedia = function (m, clientX, clientY, atTime) {
		var type = m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "video", kind = V.kindFor(type);
		var t = atTime != null ? atTime : clientX != null ? x2t(clientX) : VE.t, tr = null;
		if (clientY != null) { var row = null; rows.querySelectorAll(".vd-trow").forEach(function (r) { var b = r.getBoundingClientRect(); if (clientY >= b.top && clientY < b.bottom) row = r; }); if (row) { var q = V.track(VE.P, row.getAttribute("data-track")); if (q && q.kind === kind && !q.lock) tr = q; } }
		var dur = type === "image" ? 5 : m.dur;
		var tracks = tr ? [tr] : VE.P.tracks.filter(function (x) { return x.kind === kind && !x.lock; });
		if (kind === "v" && !tr) tracks = tracks.slice().reverse();   // pictures go on the lowest free video track first
		var c = V.clipDefaults({ id: V.uid("c"), type: type, media: m.id, track: null, start: 0, in: 0, out: dur });
		for (var j = 0; j < tracks.length; j++) {
			if (tracks[j].mag) { c.track = tracks[j].id; c.start = Math.max(0, t); break; }
			var s = V.fitOnTrack(VE.P, tracks[j].id, Math.max(0, t), dur); if (s != null && (tr || Math.abs(s - t) < 1e-6)) { c.track = tracks[j].id; c.start = s; break; }
		}
		if (!c.track) { var nt = VE.addTrack(kind); c.track = nt.id; c.start = Math.max(0, t); }
		if (type === "image" && m.w && m.h) c.scale = Math.min(1, 1 / Math.min(VE.P.w / m.w, VE.P.h / m.h));   // a picture comes in at its own pixel size (at most the frame)
		VE.P.clips.push(c); VE.sel = [c.id];
		if (V.track(VE.P, c.track).mag) V.magnetInsert(VE.P, c.track, c.id, c.start);
		if (VE.P.clips.length === 1 && type === "video" && m.w) setProjectFromMedia(m);
		VE.commit("Add " + m.name);
		return c;
	};
	// append clips one after another at the end of a track (merging many videos in order)
	T.appendAll = function (list) {
		var vid = list.filter(function (m) { return m.kind !== "audio"; }), aud = list.filter(function (m) { return m.kind === "audio"; });
		var vtr = VE.P.tracks.filter(function (x) { return x.kind === "v" && !x.lock; }).slice(-1)[0], atr = VE.P.tracks.filter(function (x) { return x.kind === "a" && !x.lock; })[0];
		[[vid, vtr], [aud, atr]].forEach(function (q) {
			if (!q[0].length) return; var tr = q[1] || VE.addTrack(q[0][0].kind === "audio" ? "a" : "v");
			var at = V.onTrack(VE.P, tr.id).reduce(function (a, c) { return Math.max(a, V.end(c)); }, 0);
			q[0].forEach(function (m) {
				var type = m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "video", dur = type === "image" ? 5 : m.dur;
				var c = V.clipDefaults({ id: V.uid("c"), type: type, media: m.id, track: tr.id, start: at, in: 0, out: dur }); VE.P.clips.push(c); at += dur;
				if (VE.P.clips.length === 1 && type === "video" && m.w) setProjectFromMedia(m);
			});
		});
		VE.commit("Add " + list.length + " clips");
	};
	function setProjectFromMedia(m) { VE.P.w = Math.max(2, Math.round(m.w / 2) * 2); VE.P.h = Math.max(2, Math.round(m.h / 2) * 2); VE.P.fps = Math.round((m.fps || 30) * 100) / 100 > 59 ? 60 : Math.abs(m.fps - 29.97) < 0.005 ? 29.97 : Math.max(10, Math.round(m.fps || 30)); VE.emit("notice", "The project took the size of the first video: " + VE.P.w + "×" + VE.P.h + ", " + VE.P.fps + " fps (change it under Project)."); }
	VE.addTrack = function (kind) {
		var n = VE.P.tracks.filter(function (t) { return t.kind === kind; }).length + 1, tr = { id: V.uid(kind), kind: kind, name: (kind === "v" ? "Video " : "Audio ") + n };
		if (kind === "v") { var i = 0; VE.P.tracks.splice(i, 0, tr); } else VE.P.tracks.push(tr);
		return tr;
	};
	T.dragHint = function (clientX, clientY, on) {
		inner.classList.toggle("is-drop", !!on);
		if (on && clientX != null) { var t = x2t(clientX); $("vd-dropline").hidden = false; $("vd-dropline").style.left = t2x(t) + "px"; } else $("vd-dropline").hidden = true;
	};
	T.inside = function (clientX, clientY) { var b = sc.getBoundingClientRect(); return clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom; };

	VE.on("change", function () { T.render(); });
	var pcmRaf = {};
	VE.on("pcmReady", function (m) { if (pcmRaf[m.id]) return; pcmRaf[m.id] = requestAnimationFrame(function () { pcmRaf[m.id] = 0; rows.querySelectorAll(".vd-clip").forEach(function (el) { var c = V.clip(VE.P, el.getAttribute("data-id")); if (c && c.media === m.id) paintClip(el, true); }); }); });
	VE.on("thumbs", function (m) { rows.querySelectorAll(".vd-clip").forEach(function (el) { var c = V.clip(VE.P, el.getAttribute("data-id")); if (c && c.media === m.id) paintClip(el, true); }); });
	VE.on("time", function () { T.playhead(); });
	VE.on("select", markSel);
	if (window.ResizeObserver) new ResizeObserver(function () { drawRuler(); rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el, true); }); }).observe(sc);
})();

/* MES Video Editor export: every frame is drawn by the compositor from frames decoded with WebCodecs (one VideoDecoder per visible clip,
 * read straight from the file's sample table), encoded to H.264 with VideoEncoder; the sound is mixed in 48 kHz blocks (volume, fades,
 * cross-fades, speed, noise-removed versions) and encoded to AAC; mp4-muxer writes the MP4, straight to disk when a file was chosen. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V;

	/* ---------- frames of one clip, in order ---------- */
	function VReader(m) { this.m = m; this.vt = m.vt; this.frames = []; this.sig = VE.signal(); this.dec = null; this.lastReq = -1; }
	VReader.prototype.start = function (s) {
		this.close(); var self = this, vt = this.vt;
		this.next = VE.keyBefore(vt, s); this.done = false; this.flushing = false; this.err = null;
		this.dec = new VideoDecoder({ output: function (f) { self.frames.push(f); self.sig.wake(); }, error: function (e) { self.err = e; self.sig.wake(); } });
		this.dec.configure({ codec: vt.codec, codedWidth: vt.cw, codedHeight: vt.ch, description: vt.desc });
		this.dec.addEventListener("dequeue", this.sig.wake);
	};
	VReader.prototype.feed = async function () {
		var vt = this.vt, i = this.next, j = Math.min(vt.n, i + 8), data = await VE.readSamples(this.m.file, vt, i, j);
		for (var k = 0; k < data.length; k++) this.dec.decode(new EncodedVideoChunk({ type: vt.key[i + k] ? "key" : "delta", timestamp: Math.round(vt.cts[i + k] * 1e6), duration: Math.round(vt.dur[i + k] * 1e6), data: data[k] }));
		this.next = j;
	};
	VReader.prototype.frameAt = async function (s) {
		var eps = 1e-4, vt = this.vt;
		if (!this.dec || s < this.lastReq - 1e-3) this.start(s);
		else { var kb = VE.keyBefore(vt, s); if (kb > this.next + 2 && this.frames.length && s > this.frames[this.frames.length - 1].timestamp / 1e6 + 1) this.start(s); }
		this.lastReq = s;
		while (true) {
			while (this.frames.length >= 2 && this.frames[1].timestamp / 1e6 <= s + eps) this.frames.shift().close();
			var last = this.frames.length ? this.frames[this.frames.length - 1].timestamp / 1e6 : -Infinity;
			if (last > s + eps || this.done) break;
			if (this.err) throw this.err;
			if (this.next < vt.n && this.dec.decodeQueueSize < 10) { await this.feed(); continue; }
			if (this.next >= vt.n && !this.flushing) { var self = this; this.flushing = true; this.dec.flush().then(function () { self.done = true; self.sig.wake(); }, function (e) { self.err = self.err || e; self.sig.wake(); }); continue; }
			await this.sig.wait(250);
		}
		return this.frames[0] || null;
	};
	VReader.prototype.close = function () { this.frames.forEach(function (f) { try { f.close(); } catch (e) { /* ignore */ } }); this.frames = []; if (this.dec) { try { this.dec.close(); } catch (e) { /* ignore */ } } this.dec = null; };

	/* ---------- sound ---------- */
	var RATE = 48000;
	async function mix(t0, n) {
		var out = [new Float32Array(n), new Float32Array(n)], p = VE.P, t1 = t0 + n / RATE;
		for (var j = 0; j < p.clips.length; j++) {
			var c = p.clips[j]; if (!VE.hasSound(c)) continue;
			if (t1 <= c.start - (c.xin || 0) || t0 >= V.end(c)) continue;
			var g = V.gainCurve(p, c, t0, n, RATE, VE.fxFn(c)), any = false; for (var k = 0; k < n; k += 64) if (g[k] > 0) { any = true; break; }
			if (!any) continue;
			var sp = c.speed || 1, s0 = V.srcAt(c, t0), s1 = V.srcAt(c, t1), buf = await VE.clipPcm(c, Math.max(0, s0 - 0.02), Math.max(0, s1) + 0.02);
			if (buf) V.mixInto(out, 0, n, buf, s0, sp / RATE, g);
		}
		V.limit(out);
		return out;
	}
	VE.mixAudio = mix;

	/* ---------- export ---------- */
	// o: { w, h, fps, quality, a, b (timeline range), handle (FileSystemFileHandle), onProgress(frac, text), cancelled() }
	VE.exportVideo = async function (o) {
		await VE.loadScript(VE.LIB.mp4);
		var p = VE.P, W = o.w, H = o.h, fps = o.fps, a = o.a || 0, b = o.b || V.duration(p), N = Math.max(1, Math.round((b - a) * fps)), failed = null, t00 = performance.now();
		if (!(b > a)) throw new Error("There is nothing to export: the timeline is empty.");
		if (o.onProgress) o.onProgress(0, "Analysing the sound for the audio effects..."); await VE.ensureAllFx();
		var missing = p.clips.filter(function (c) { if (c.type === "text") return false; var m = VE.media(c.media); return !m || m.state !== "ready"; });
		if (missing.length) throw new Error("Some clips' media is missing or still being prepared (" + missing.map(function (c) { var m = VE.media(c.media); return m ? m.name : "?"; }).filter(function (x, i, s) { return s.indexOf(x) === i; }).slice(0, 3).join(", ") + "). Wait for it, or add the file again.");
		var cfg = { codec: V.avcCodec(W, H, fps), width: W, height: H, bitrate: V.bitrate(W, H, fps, o.quality), bitrateMode: "variable", framerate: fps, latencyMode: "quality", avc: { format: "avc" } }, sup = null;
		var hws = ["prefer-hardware", "no-preference", "prefer-software"];
		for (var q = 0; q < hws.length; q++) { cfg.hardwareAcceleration = hws[q]; try { sup = await VideoEncoder.isConfigSupported(cfg); } catch (e) { sup = null; } if (sup && sup.supported) break; }
		if (!sup || !sup.supported) throw new Error("This browser cannot make H.264 video at " + W + "×" + H + ". Choose a smaller size.");
		var hasSound = p.clips.some(function (c) { return VE.hasSound(c); }), aOk = false;
		if (hasSound && window.AudioEncoder) { try { var as = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 }); aOk = !!(as && as.supported); } catch (e) { aOk = false; } }
		var writable = null, target;
		if (o.handle) { writable = await o.handle.createWritable(); target = new Mp4Muxer.FileSystemWritableFileStreamTarget(writable); } else target = new Mp4Muxer.ArrayBufferTarget();
		var mopt = { target: target, video: { codec: "avc", width: W, height: H }, fastStart: o.handle ? false : "in-memory", firstTimestampBehavior: "offset" };
		if (Math.abs(fps - Math.round(fps)) < 1e-6) mopt.video.frameRate = Math.round(fps);
		if (aOk) mopt.audio = { codec: "aac", numberOfChannels: 2, sampleRate: RATE };
		var muxer = new Mp4Muxer.Muxer(mopt), sig = VE.signal();
		function fail(e) { if (!failed) failed = e instanceof Error ? e : new Error(String(e && e.message || e)); sig.wake(); }
		var venc = new VideoEncoder({ output: function (ch, meta) { try { muxer.addVideoChunk(ch, meta); } catch (e) { fail(e); } }, error: fail });
		venc.configure(sup.config || cfg); venc.addEventListener("dequeue", sig.wake);
		var aenc = null;
		if (aOk) { aenc = new AudioEncoder({ output: function (ch, meta) { try { muxer.addAudioChunk(ch, meta); } catch (e) { fail(e); } }, error: fail }); aenc.configure({ codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 }); }
		var canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
		var ctx = canvas.getContext("2d", { alpha: false }); ctx.imageSmoothingQuality = "high";
		var readers = {}, audioPos = 0, total = b - a, keyEvery = Math.max(1, Math.round(fps * 2));
		async function audioUpTo(tt) {
			if (!aenc) return;
			while (!failed && audioPos < Math.min(tt, total) - 1e-9) {
				var n = Math.min(RATE, Math.round((Math.min(tt + 1, total) - audioPos) * RATE)); if (n <= 0) break;
				var L = await mix(a + audioPos, n), buf = new Float32Array(n * 2); buf.set(L[0], 0); buf.set(L[1], n);
				aenc.encode(new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(audioPos * 1e6), data: buf }));
				audioPos += n / RATE;
				while (!failed && aenc.encodeQueueSize > 8) await sig.wait(200);
			}
		}
		try {
			for (var i = 0; i < N; i++) {
				if (failed) throw failed;
				if (o.cancelled && o.cancelled()) throw new Error("Cancelled.");
				var t = a + i / fps, layers = V.layersAt(p, t), frames = {};
				for (var j = 0; j < layers.length; j++) {
					var c = layers[j].clip; if (c.type !== "video") continue;
					var m = VE.media(c.media), rd = readers[c.id] || (readers[c.id] = new VReader(m));
					frames[c.id] = await rd.frameAt(Math.min(layers[j].src, Math.max(0, m.dur - 1e-3)));
				}
				VE.draw(ctx, W, H, t, function (cl) {
					var m2 = VE.media(cl.media); if (!m2) return null;
					if (m2.kind === "image") return { img: m2.bitmap, w: m2.w, h: m2.h };
					var f = frames[cl.id]; return f ? { img: f, w: m2.w, h: m2.h, rot: m2.rot || 0 } : null;
				});
				var vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
				venc.encode(vf, { keyFrame: i % keyEvery === 0 }); vf.close();
				while (!failed && venc.encodeQueueSize > 4) await sig.wait(200);
				// readers of clips that are over
				Object.keys(readers).forEach(function (id) { var cc = V.clip(p, id); if (!cc || V.end(cc) < t - 0.2) { readers[id].close(); delete readers[id]; } });
				await audioUpTo((i + 1) / fps);
				if (o.onProgress && (i % 3 === 0 || i === N - 1)) {
					var el = (performance.now() - t00) / 1000, fr = (i + 1) / N;
					o.onProgress(fr, "Frame " + (i + 1) + " of " + N + (fr > 0.02 ? " · about " + V.short(el / fr - el).replace(/\.\d$/, "") + " left" : "") + " · " + (el > 0.5 ? ((i + 1) / el).toFixed(1) + " fps" : ""));
				}
			}
			await audioUpTo(total);
			await venc.flush(); if (aenc) await aenc.flush();
			if (failed) throw failed;
			muxer.finalize();
		} catch (e) {
			try { if (writable) await writable.abort(); } catch (x) { /* ignore */ }
			throw e;
		} finally {
			Object.keys(readers).forEach(function (id) { readers[id].close(); });
			try { venc.close(); } catch (e) { /* ignore */ } try { if (aenc) aenc.close(); } catch (e) { /* ignore */ }
		}
		var secs = (performance.now() - t00) / 1000;
		if (writable) { await writable.close(); var f = await o.handle.getFile(); return { size: f.size, handle: o.handle, secs: secs, sound: aOk }; }
		var blob = new Blob([target.buffer], { type: "video/mp4" });
		return { blob: blob, size: blob.size, secs: secs, sound: aOk };
	};
	// one frame at project size from the preview's current state (PNG "snapshot")
	VE.snapshot = async function () {
		var p = VE.P, c = document.createElement("canvas"); c.width = p.w; c.height = p.h;
		var layers = V.layersAt(p, VE.t), frames = {}, readers = [];
		for (var j = 0; j < layers.length; j++) { var cl = layers[j].clip; if (cl.type !== "video") continue; var m = VE.media(cl.media); if (!m || !m.vt) continue; var rd = new VReader(m); readers.push(rd); frames[cl.id] = await rd.frameAt(layers[j].src); }
		VE.draw(c.getContext("2d"), p.w, p.h, VE.t, function (cl) { var m = VE.media(cl.media); if (!m) return null; if (m.kind === "image") return { img: m.bitmap, w: m.w, h: m.h }; var f = frames[cl.id]; return f ? { img: f, w: m.w, h: m.h, rot: m.rot || 0 } : null; });
		readers.forEach(function (r) { r.close(); });
		return new Promise(function (r) { c.toBlob(r, "image/png"); });
	};
})();

/* MES Video Editor (mes.fm/video): the media bin, the inspector, menus, keyboard shortcuts, sound clean-up (noise removal through
 * window.MESDenoise from /main_js/denoise.js, loudness normalising with MESVed's R128 meter), project files and the export dialog.
 * The model / timeline maths are in lib.js (MESVed), the engine in core.js / preview.js / timeline.js / export.js. Nothing is uploaded. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, C = window.MESConv, $ = function (id) { return document.getElementById(id); }, app = $("vd-app"), esc = VE.esc;
	var KEY = "mes-video-editor:v1", UI = { win: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) Object.assign(UI, sv); } catch (e) { /* ignore */ }
	function saveUI() { try { localStorage.setItem(KEY, JSON.stringify(UI)); } catch (e) { /* ignore */ } }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
	var toastT = 0;
	function toast(msg, ms) { var t = $("vd-toast"); t.textContent = msg; t.hidden = !msg; clearTimeout(toastT); if (msg) toastT = setTimeout(function () { t.hidden = true; }, ms || 4200); }
	VE.on("notice", function (m) { toast(m, 6000); });
	var support = { webcodecs: !!(window.VideoEncoder && window.VideoDecoder && window.AudioDecoder) };
	if (!support.webcodecs) toast("This browser cannot edit video here (no WebCodecs). Use Chrome, Edge or Brave on a computer.", 15000);

	/* ---------- media bin ---------- */
	var binSel = {};
	function binRow(m) {
		var meta = m.kind === "image" ? (m.w ? m.w + "×" + m.h : "picture") : (m.dur ? V.short(m.dur).replace(/\.\d$/, "") : "") + (m.w ? " · " + m.w + "×" + m.h : "") + (m.kind === "audio" ? " · sound" : "");
		var st = m.state === "ready" ? (m.converted ? "converted from " + esc(m.origName || "") : "") : m.state === "error" ? '<span class="vd-bad">' + esc(m.status) + "</span>" : m.state === "missing" ? '<span class="vd-bad">' + esc(m.status) + "</span>" : esc(m.status || "") + (m.pct ? '<i class="vd-mbar"><i style="width:' + Math.round(m.pct * 100) + '%"></i></i>' : "");
		var used = VE.P.clips.filter(function (c) { return c.media === m.id; }).length;
		return '<div class="vd-mi' + (binSel[m.id] ? " is-sel" : "") + (m.state !== "ready" ? " is-wait" : "") + '" role="option" aria-selected="' + !!binSel[m.id] + '" data-mid="' + m.id + '" tabindex="0">' +
			'<canvas class="vd-mth" width="96" height="54" data-th="' + m.id + '"></canvas><div class="vd-mt"><div class="vd-mn" title="' + esc(m.name) + '">' + esc(m.name) + "</div><div class=\"vd-mm\">" + esc(meta) + (used ? " · on timeline" + (used > 1 ? " ×" + used : "") : "") + "</div><div class=\"vd-mm\">" + st + "</div></div>" +
			'<span class="vd-mact"><button type="button" class="vd-btn vd-ico vd-sm" data-madd="' + m.id + '" title="Put it at the playhead" aria-label="Add ' + esc(m.name) + ' at the playhead"' + (m.state !== "ready" ? " disabled" : "") + '>+</button><button type="button" class="vd-btn vd-ico vd-sm" data-mrm="' + m.id + '" title="Remove from the project" aria-label="Remove ' + esc(m.name) + '">&times;</button></span></div>';
	}
	function renderBin() {
		var q = ($("vd-binsearch").value || "").toLowerCase().trim(), list = VE.bin.filter(function (m) { return !q || m.name.toLowerCase().indexOf(q) >= 0; });
		$("vd-binlist").innerHTML = list.length ? list.map(binRow).join("") : '<p class="vd-empty">' + (VE.bin.length ? "Nothing matches." : "No media yet.") + "</p>";
		list.forEach(paintThumb);
		$("vd-addsel").disabled = !Object.keys(binSel).some(function (id) { var m = VE.media(id); return m && m.state === "ready"; });
		$("vd-binhint").hidden = VE.bin.length > 2;
	}
	function paintThumb(m) {
		var cv = $("vd-binlist").querySelector('canvas[data-th="' + m.id + '"]'); if (!cv) return;
		var g = cv.getContext("2d"); g.fillStyle = "#1e293b"; g.fillRect(0, 0, 96, 54);
		var img = m.kind === "image" ? m.bitmap : m.thumbImg, iw = m.kind === "image" ? m.w : m.thumbW, ih = m.kind === "image" ? m.h : m.thumbH;
		if (img && iw) { var k = Math.min(96 / iw, 54 / ih); g.drawImage(img, 0, 0, iw, ih, (96 - iw * k) / 2, (54 - ih * k) / 2, iw * k, ih * k); }
		else if (m.kind === "audio" && m.peaks) { g.fillStyle = "#7dd3fc"; for (var x = 0; x < 96; x++) { var v = m.peaks[Math.floor(x / 96 * m.peaks.length)] / 255 * 24; g.fillRect(x, 27 - v, 1, v * 2 + 1); } }
		else { g.fillStyle = "#94a3b8"; g.font = "bold 12px Arial"; g.textAlign = "center"; g.fillText(m.kind === "audio" ? "SOUND" : (C.extOf(m.name) || "").toUpperCase(), 48, 31); }
	}
	VE.on("bin", renderBin);
	VE.on("binItem", function (m) { var el = $("vd-binlist").querySelector('[data-mid="' + m.id + '"]'); if (!el) return renderBin(); var tmp = document.createElement("div"); tmp.innerHTML = binRow(m); el.replaceWith(tmp.firstChild); paintThumb(m); $("vd-addsel").disabled = !Object.keys(binSel).length; });
	VE.on("thumbs", function (m) { paintThumb(m); });
	$("vd-binsearch").addEventListener("input", renderBin);
	$("vd-binlist").addEventListener("click", function (e) {
		var b = e.target.closest("button"), id;
		if (b && (id = b.getAttribute("data-madd"))) { var m = VE.media(id); if (m && m.state === "ready") VE.tl.placeMedia(m, null, null, VE.t); return; }
		if (b && (id = b.getAttribute("data-mrm"))) { removeMedia(id); return; }
		var it = e.target.closest(".vd-mi"); if (!it) return; id = it.getAttribute("data-mid");
		if (!(e.ctrlKey || e.metaKey || e.shiftKey)) binSel = {};
		if (binSel[id]) delete binSel[id]; else binSel[id] = 1;
		renderBin();
	});
	$("vd-binlist").addEventListener("dblclick", function (e) { var it = e.target.closest(".vd-mi"); if (!it || e.target.closest("button")) return; var m = VE.media(it.getAttribute("data-mid")); if (m && m.state === "ready") VE.tl.placeMedia(m, null, null, VE.t); });
	$("vd-binlist").addEventListener("keydown", function (e) { var it = e.target.closest(".vd-mi"); if (!it) return; if (e.key === "Enter") { var m = VE.media(it.getAttribute("data-mid")); if (m && m.state === "ready") VE.tl.placeMedia(m, null, null, VE.t); e.preventDefault(); } });
	function removeMedia(id) {
		var m = VE.media(id); if (!m) return; var n = VE.P.clips.filter(function (c) { return c.media === id; }).length;
		if (n && !window.confirm(m.name + " is used by " + n + " clip" + (n > 1 ? "s" : "") + " on the timeline. Remove it and those clips?")) return;
		VE.P.clips = VE.P.clips.filter(function (c) { return c.media !== id; }); VE.bin = VE.bin.filter(function (x) { return x !== m; }); delete binSel[id];
		VE.idbDel("blobs", "m:" + id).catch(function () { }); VE.idbDel("blobs", "t:" + id).catch(function () { });
		if (m.url) try { URL.revokeObjectURL(m.url); } catch (x) { /* ignore */ }
		VE.commit("Remove media"); renderBin();
	}
	$("vd-addsel").onclick = function () { var list = VE.bin.filter(function (m) { return binSel[m.id] && m.state === "ready"; }); if (list.length) VE.tl.appendAll(list); binSel = {}; renderBin(); };
	// drag a bin item onto the timeline (pointer events: works with mouse, touch and pen)
	var bdrag = null;
	$("vd-binlist").addEventListener("pointerdown", function (e) {
		var it = e.target.closest(".vd-mi"); if (!it || e.target.closest("button") || e.button > 0) return;
		var m = VE.media(it.getAttribute("data-mid")); if (!m || m.state !== "ready") return;
		bdrag = { m: m, x: e.clientX, y: e.clientY, on: false, id: e.pointerId };
	});
	document.addEventListener("pointermove", function (e) {
		if (!bdrag || e.pointerId !== bdrag.id) return;
		if (!bdrag.on && Math.hypot(e.clientX - bdrag.x, e.clientY - bdrag.y) < 6) return;
		if (!bdrag.on) { bdrag.on = true; var g = bdrag.ghost = document.createElement("div"); g.className = "vd-ghost"; g.textContent = bdrag.m.name; app.appendChild(g); }
		bdrag.ghost.style.left = e.clientX + 12 + "px"; bdrag.ghost.style.top = e.clientY + 8 + "px";
		var over = VE.tl.inside(e.clientX, e.clientY); VE.tl.dragHint(e.clientX, e.clientY, over);
	});
	document.addEventListener("pointerup", function (e) {
		if (!bdrag || e.pointerId !== bdrag.id) return;
		var d = bdrag; bdrag = null; if (d.ghost) d.ghost.remove(); VE.tl.dragHint(null, null, false);
		if (d.on && VE.tl.inside(e.clientX, e.clientY)) VE.tl.placeMedia(d.m, e.clientX, e.clientY);
	});

	/* ---------- importing ---------- */
	function importFiles(list) {
		list = [].slice.call(list || []); if (!list.length) return Promise.resolve([]);
		var rest = list.filter(function (f) { return !VE.relink(f); });
		if (rest.length < list.length) toast("Relinked " + (list.length - rest.length) + " missing file" + (list.length - rest.length > 1 ? "s" : "") + ".");
		return rest.length ? VE.addFiles(rest) : Promise.resolve([]);
	}
	$("vd-import").onclick = function () { $("vd-file").click(); };
	$("vd-file").onchange = function () { importFiles(this.files); this.value = ""; };
	app.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); app.classList.add("is-over"); VE.tl.dragHint(e.clientX, e.clientY, VE.tl.inside(e.clientX, e.clientY)); } });
	app.addEventListener("dragleave", function (e) { if (!e.relatedTarget || !app.contains(e.relatedTarget)) { app.classList.remove("is-over"); VE.tl.dragHint(null, null, false); } });
	app.addEventListener("drop", function (e) {
		if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
		e.preventDefault(); app.classList.remove("is-over"); VE.tl.dragHint(null, null, false);
		var all = [].slice.call(e.dataTransfer.files), proj = all.filter(isProjectFile), media = all.filter(function (f) { return !isProjectFile(f); });
		if (proj.length) {
			if (proj.length > 1) toast("Only one project can be open: opening " + proj[0].name + ".");
			if (media.length) toast("Opening the project first; drop the media files again afterwards to relink or add them.", 7000);
			askOpenProject(proj[0]); return;
		}
		var x = e.clientX, y = e.clientY, onTl = VE.tl.inside(x, y), t = onTl ? VE.tl.x2t(x) : null;
		importFiles(media).then(function (ms) {
			if (!onTl) return; var at = t;
			ms.forEach(function (m) { if (m.state === "ready") { var c = VE.tl.placeMedia(m, null, y, at); at = V.end(c); } });
		});
	});
	document.addEventListener("paste", function (e) {
		if (/input|textarea|select/i.test((document.activeElement || {}).tagName || "")) return;
		var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); importFiles(fs); }
	});

	/* ---------- clip operations ---------- */
	function targets() { var s = VE.selected(); return s; }
	VE.split = function () {
		var t = VE.t, list = targets().filter(function (c) { return V.active(c, t) && t > c.start; });
		if (!list.length) list = VE.P.clips.filter(function (c) { var tr = V.track(VE.P, c.track); return tr && !tr.lock && t > c.start && t < V.end(c); });
		var selTr = VE.selected().map(function (c) { return c.track; }), newSel = V.splitAt(VE.P, list.map(function (c) { return c.id; }), t, function () { return V.uid("c"); }, 1 / VE.P.fps);
		if (!newSel.length) { toast("Put the playhead inside a clip to split it."); return; }
		VE.sel = newSel.filter(function (id) { var c = V.clip(VE.P, id); return c && selTr.indexOf(c.track) >= 0; });
		if (!VE.sel.length) VE.sel = newSel.slice();
		VE.commit("Split");
	};
	VE.del = function (ripple) {
		var ids = V.withLinks(VE.P, targets().map(function (c) { return c.id; })).filter(function (id) { var c = V.clip(VE.P, id), tr = c && V.track(VE.P, c.track); return c && !(tr && tr.lock); });
		if (!ids.length) { toast("Select a clip first."); return; }
		V.removeClips(VE.P, ids, ripple); VE.sel = []; VE.commit(ripple ? "Ripple delete" : "Delete");
	};
	VE.duplicate = function () {
		var list = V.withLinks(VE.P, targets().map(function (c) { return c.id; })).map(function (id) { return V.clip(VE.P, id); }).filter(Boolean); if (!list.length) return; var ns = [], links = {};
		var a0 = Math.min.apply(null, list.map(function (c) { return c.start; })), shift = Math.max.apply(null, list.map(V.end)) - a0;
		list.forEach(function (c) { var d = JSON.parse(JSON.stringify(c)); d.id = V.uid("c"); if (d.link) d.link = links[d.link] || (links[d.link] = V.uid("L")); var st = V.canPlace(VE.P, c.track, c.start + shift, V.dur(c)) ? c.start + shift : V.fitOnTrack(VE.P, c.track, V.end(c), V.dur(c)); d.start = st == null ? V.end(c) : st; VE.P.clips.push(d); ns.push(d.id); });
		VE.sel = ns; VE.commit("Duplicate");
	};
	VE.addTitle = function (preset, at, trackId) {
		var pr = preset || {}, t0 = at != null ? at : VE.t, vt = VE.P.tracks.filter(function (t) { return t.kind === "v" && !t.lock && !t.mag; }), tr = trackId ? V.track(VE.P, trackId) : null, dur = pr.dur || 4;
		if (tr && (tr.lock || tr.kind !== "v" || (!tr.mag && !V.canPlace(VE.P, tr.id, t0, dur)))) tr = null;
		for (var j = 0; !tr && j < vt.length; j++) if (V.canPlace(VE.P, vt[j].id, t0, dur)) tr = vt[j];
		if (!tr) tr = VE.addTrack("v");
		var c = V.clipDefaults({ id: V.uid("c"), type: "text", track: tr.id, start: t0, in: 0, out: dur, fin: 0.3, fout: 0.3, x: pr.x != null ? pr.x : 0.5, y: pr.y != null ? pr.y : 0.82, text: Object.assign({}, pr.text || {}) });
		if (tr.mag) { VE.P.clips.push(c); V.magnetInsert(VE.P, tr.id, c.id, t0); VE.sel = [c.id]; VE.commit("Add title"); return; }
		VE.P.clips.push(c); VE.sel = [c.id]; VE.commit("Add title");
		setTimeout(function () { var ta = $("vd-ttext"); if (ta) { ta.focus(); ta.select(); } }, 50);
	};
	function mark(which) {
		VE.P.marks = VE.P.marks || {}; VE.P.marks[which] = VE.t;
		if (VE.P.marks.in != null && VE.P.marks.out != null && VE.P.marks.out < VE.P.marks.in) { var x = VE.P.marks.in; VE.P.marks.in = VE.P.marks.out; VE.P.marks.out = x; }
		VE.commit("Mark " + which);
	}
	function marksOk() { var m = VE.P.marks || {}; return m.in != null && m.out != null && m.out - m.in > 1e-3; }
	$("vd-split").onclick = VE.split; $("vd-del").onclick = function () { VE.del(false); }; $("vd-ripple").onclick = function () { VE.del(true); };
	$("vd-in").onclick = function () { mark("in"); }; $("vd-out").onclick = function () { mark("out"); };
	$("vd-clearmarks").onclick = function () { VE.P.marks = { in: null, out: null }; VE.commit("Clear marks"); };
	$("vd-cutrange").onclick = function () { if (!marksOk()) return; var m = VE.P.marks; V.removeRange(VE.P, m.in, m.out, function () { return V.uid("c"); }); VE.P.marks = { in: null, out: null }; VE.preview.seek(m.in); VE.commit("Cut out marked part"); };
	$("vd-addv").onclick = function () { VE.addTrack("v"); VE.commit("Add video track"); };
	$("vd-adda").onclick = function () { VE.addTrack("a"); VE.commit("Add audio track"); };
	$("vd-addtitle").onclick = function () { VE.addTitle(); };
	$("vd-undo").onclick = VE.undo; $("vd-redo").onclick = VE.redo;
	$("vd-snapchk").onchange = function () { VE.tl.snap = this.checked; };

	/* ---------- zoom ---------- */
	var zr = $("vd-zoom");
	function z2s(v) { return Math.pow(10, v / 1000 * Math.log10(600) * 1); }
	function s2z(p) { return Math.round(Math.log10(Math.max(1, p)) / Math.log10(600) * 1000); }
	zr.value = s2z(VE.pps);
	zr.addEventListener("input", function () { VE.tl.zoom(z2s(+zr.value)); });
	VE.on("zoom", function (p) { zr.value = s2z(p); });
	$("vd-zin").onclick = function () { VE.tl.zoom(VE.pps * 1.5); }; $("vd-zout").onclick = function () { VE.tl.zoom(VE.pps / 1.5); }; $("vd-zfit").onclick = function () { VE.tl.fit(); };

	/* ---------- transport ---------- */
	var P = VE.preview;
	$("vd-play").onclick = function () { P.toggle(); };
	var spSel = $("vd-speed");
	if (spSel) { spSel.value = String(UI.speed || 1); P.speed = +spSel.value || 1; spSel.onchange = function () { P.setSpeed(+spSel.value); }; }
	VE.on("speed", function (s) { UI.speed = s; saveUI(); if (spSel) { spSel.value = String(s); spSel.classList.toggle("is-on", s !== 1); } if (s !== 1) toast("Preview speed " + s + "× (the exported video is not changed)"); });
	if (spSel) spSel.classList.toggle("is-on", P.speed !== 1);
	// previous / next clip edge (Camtasia: Ctrl+Alt+Left / Right)
	VE.goEdit = function (dir) { if (P.playing) P.pause(); var t = V.nextEdit(VE.P, VE.t, dir, 0.5 / VE.P.fps); if (t == null) t = dir > 0 ? V.duration(VE.P) : 0; P.seek(t); VE.tl.reveal(t); };
	// one frame back / forward; pressing and holding keeps stepping, waiting for each frame to show so it never runs ahead of the picture
	VE.stepFrame = function (dir, big) { if (P.playing) P.pause(); P.seek(VE.t + dir * (big ? 1 : 1 / VE.P.fps)); VE.tl.reveal(VE.t); };
	var hold = null;
	function stopHold() { if (hold) { clearTimeout(hold.timer); hold = null; } }
	document.querySelectorAll("[data-tp]").forEach(function (b) {
		var a = b.getAttribute("data-tp");
		if (a === "back" || a === "fwd") {
			var dir = a === "fwd" ? 1 : -1;
			b.addEventListener("pointerdown", function (e) {
				if (e.button > 0) return; e.preventDefault(); stopHold(); VE.stepFrame(dir, e.shiftKey);
				var big = e.shiftKey, h = hold = { last: performance.now() };
				(function next(delay) { h.timer = setTimeout(function () { if (hold !== h) return; if (P.seeking() && performance.now() - h.last < 400) return next(15); h.last = performance.now(); VE.stepFrame(dir, big); next(big ? 120 : 1000 / Math.min(30, VE.P.fps)); }, delay); })(380);
				try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			});
			["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { b.addEventListener(ev, stopHold); });
			b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); VE.stepFrame(dir, e.shiftKey); } });
			return;
		}
		b.onclick = function () { if (a === "start") P.seek(0); else if (a === "end") P.seek(V.duration(VE.P)); else if (a === "prevclip") VE.goEdit(-1); else if (a === "nextclip") VE.goEdit(1); };
	});
	// the time under the preview is a box: type a time (4:23;13, 1:02:03, 263, 2m30s, +10, -5) and press Enter to go there
	var tin = $("vd-tin");
	function timeText() { if (document.activeElement !== tin) tin.value = V.tc(VE.t, VE.P.fps); tin.style.width = Math.max(7, tin.value.length + 1) + "ch"; $("vd-tdur").textContent = V.tc(V.duration(VE.P), VE.P.fps); }
	tin.addEventListener("focus", function () { if (P.playing) P.pause(); tin.value = V.tc(VE.t, VE.P.fps); tin.select(); });
	// the first click selects the whole time (so typing replaces it); a click while it has focus places the caret as usual
	tin.addEventListener("mousedown", function (e) { if (document.activeElement !== tin) { e.preventDefault(); tin.focus(); } });
	tin.addEventListener("input", function () { tin.style.width = Math.max(7, tin.value.length + 1) + "ch"; tin.classList.toggle("is-bad", tin.value.trim() !== "" && V.parseGoto(tin.value, VE.P.fps, VE.t) == null); });
	tin.addEventListener("keydown", function (e) {
		if (e.key === "Enter") {
			e.preventDefault(); var t = V.parseGoto(tin.value, VE.P.fps, VE.t);
			if (t == null) { tin.classList.add("is-bad"); toast("Type a time like 4:23;13, 1:02:03, 263 (seconds), 2m30s, or +10 / -5 to move from here."); return; }
			var d = V.duration(VE.P); if (t > d) toast("That is after the end (" + V.tc(d, VE.P.fps) + "): went to the end.");
			tin.classList.remove("is-bad"); P.seek(Math.max(0, Math.min(t, d))); VE.tl.reveal(VE.t); tin.blur();
		} else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); tin.classList.remove("is-bad"); tin.blur(); }
		e.stopPropagation();
	});
	tin.addEventListener("blur", function () { tin.classList.remove("is-bad"); timeText(); });
	VE.on("time", timeText); VE.on("change", timeText);
	/* ---------- seek bar (Camtasia-style scrubber above the play buttons; also in Fill window / Full screen) ---------- */
	(function () {
		var bar = $("vd-seek"), fill = $("vd-seek-fill"), th = $("vd-seek-th"), tip = $("vd-seek-tip"), mk = $("vd-seek-mk"), ticks = $("vd-seek-ticks"), drag = false, wasPlay = false, tickKey = "";
		if (!bar) return;
		function dur() { return Math.max(0, V.duration(VE.P)); }
		function tAt(x) { var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * dur(); }
		function pct(t) { var d = dur(); return d > 0 ? Math.max(0, Math.min(100, t / d * 100)) : 0; }
		function show() {
			var p = pct(VE.t) + "%"; fill.style.width = p; th.style.left = p;
			bar.setAttribute("aria-valuemax", String(Math.round(dur() * 100) / 100)); bar.setAttribute("aria-valuenow", String(Math.round(VE.t * 100) / 100)); bar.setAttribute("aria-valuetext", V.tc(VE.t, VE.P.fps));
		}
		function marks() {
			var m = VE.P.marks || {};
			if (m.in != null && m.out != null && m.out > m.in) { mk.style.display = "block"; mk.style.left = pct(m.in) + "%"; mk.style.width = (pct(m.out) - pct(m.in)) + "%"; } else mk.style.display = "none";
			// thin ticks at clip edges, so you can see where the cuts are
			var d = dur(), ts = {}; VE.P.clips.forEach(function (c) { var a = c.start, b = c.start + V.dur(c); if (a > 0.01 && a < d - 0.01) ts[a.toFixed(3)] = 1; if (b > 0.01 && b < d - 0.01) ts[b.toFixed(3)] = 1; });
			var keys = Object.keys(ts).slice(0, 400), key = d.toFixed(3) + "|" + keys.join(",");
			if (key !== tickKey) { tickKey = key; ticks.innerHTML = keys.map(function (k) { return '<i style="left:' + pct(+k) + '%"></i>'; }).join(""); }
		}
		function tipAt(x) { var r = bar.getBoundingClientRect(), t = tAt(x); tip.hidden = false; tip.textContent = V.tc(t, VE.P.fps); tip.style.left = Math.max(30, Math.min(r.width - 30, x - r.left)) + "px"; }
		bar.addEventListener("pointerdown", function (e) {
			if (e.button !== 0 || !dur()) return; e.preventDefault(); bar.focus({ preventScroll: true });
			drag = true; wasPlay = P.playing && !P.rev; if (P.playing) P.pause(); bar.classList.add("is-drag");
			try { bar.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			P.seek(tAt(e.clientX)); tipAt(e.clientX);
		});
		bar.addEventListener("pointermove", function (e) { if (!dur()) return; tipAt(e.clientX); if (drag) P.seek(tAt(e.clientX)); });
		function end(e) { if (!drag) return; drag = false; bar.classList.remove("is-drag"); VE.tl.reveal(VE.t); if (wasPlay) P.play(P.rate); if (e.pointerType !== "mouse") tip.hidden = true; }
		bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
		bar.addEventListener("pointerleave", function () { if (!drag) tip.hidden = true; });
		bar.addEventListener("keydown", function (e) {
			var f = 1 / VE.P.fps, st = e.shiftKey ? 1 : f, t = null;
			if (e.key === "ArrowLeft" || e.key === "ArrowDown") t = VE.t - st; else if (e.key === "ArrowRight" || e.key === "ArrowUp") t = VE.t + st;
			else if (e.key === "PageUp") t = VE.t - 10; else if (e.key === "PageDown") t = VE.t + 10; else if (e.key === "Home") t = 0; else if (e.key === "End") t = dur();
			if (t == null) return; e.preventDefault(); e.stopPropagation(); if (P.playing) P.pause(); P.seek(t); VE.tl.reveal(VE.t);
		});
		VE.on("time", show); VE.on("change", function () { show(); marks(); }); show(); marks();
	})();
	VE.on("play", function () { $("vd-play").innerHTML = '<svg class="vd-ti" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3.2" height="11" rx="0.6"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="0.6"/></svg>'; $("vd-play").setAttribute("aria-label", "Pause"); });
	VE.on("pause", function () { $("vd-play").innerHTML = '<svg class="vd-ti" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13.5 8z"/></svg>'; $("vd-play").setAttribute("aria-label", "Play"); timeText(); });
	$("vd-fs").onclick = function () { var w = $("vd-stagewrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not allowed here."); }); };
	function snapshot() { VE.snapshot().then(function (b) { download(b, (VE.P.name || "frame").replace(/[\\/:*?"<>|]+/g, "-") + " " + V.tc(VE.t, VE.P.fps).replace(/[:;]/g, "-") + ".png"); }).catch(function (e) { toast("Could not save the frame: " + e.message); }); }
	$("vd-snap").onclick = snapshot;

	/* ---------- fill window ---------- */
	function setWin(on) { UI.win = on; saveUI(); app.classList.toggle("vd-winmode", on); document.documentElement.classList.toggle("vd-noscroll", on); $("vd-win").setAttribute("aria-pressed", on); $("vd-win").innerHTML = on ? "&#10006; Leave window" : "&#10530; Fill window"; setTimeout(function () { P.fit(); VE.tl.render(); }, 30); }
	$("vd-win").onclick = function () { setWin(!UI.win); };
	if (UI.win) setWin(true);
	$("vd-help").onclick = function () { var k = $("vd-keys"); k.hidden = !k.hidden; this.setAttribute("aria-expanded", !k.hidden); };

	/* ---------- file menu ---------- */
	var fm = $("vd-filemenu");
	$("vd-filebtn").onclick = function (e) { e.stopPropagation(); fm.hidden = !fm.hidden; this.setAttribute("aria-expanded", !fm.hidden); };
	document.addEventListener("click", function (e) { if (!fm.hidden && !e.target.closest(".vd-menu")) { fm.hidden = true; $("vd-filebtn").setAttribute("aria-expanded", "false"); } });
	fm.addEventListener("click", function (e) {
		var b = e.target.closest("[data-act]"); if (!b) return; fm.hidden = true; var a = b.getAttribute("data-act");
		if (a === "import") $("vd-file").click(); else if (a === "title") VE.addTitle(); else if (a === "saveproj") saveProject(); else if (a === "openproj") $("vd-projfile").click();
		else if (a === "new") { if (window.confirm("Start a new, empty project? The current one and its media are removed from this browser (save a project file first if you want it).")) { P.pause(); VE.clearAll(); } }
		else if (a === "snapshot") snapshot(); else if (a === "export") openExport();
	});
	function saveProject() {
		var data = { format: "mes-video", v: 1, saved: new Date().toISOString(), project: VE.P, media: VE.bin.map(function (m) { return { id: m.id, name: m.name, origName: m.origName || "", size: m.size, kind: m.kind, dur: m.dur }; }) };
		download(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), (VE.P.name || "video").replace(/[\\/:*?"<>|]+/g, "-") + ".mesvideo");
		toast("Project file saved. It holds the edit, not the media: keep the video files, and add them again when you open it on another computer.");
	}
	$("vd-projfile").onchange = function () { var f = this.files[0]; this.value = ""; if (f) askOpenProject(f); };
	function isProjectFile(f) { return /\.mesvideo$/i.test(f.name || ""); }
	// another project is open (clips or media in it): say so before replacing it
	function askOpenProject(f) {
		var n = VE.P.clips.length, nm = VE.bin.length;
		if (!n && !nm) return openProject(f);
		dialog("<h3>Open " + esc(f.name) + "?</h3><p class=\"vd-dtxt\">A project is already open: <b>" + esc(VE.P.name || "Untitled video") + "</b> (" + n + " clip" + (n === 1 ? "" : "s") + ", " + nm + " media file" + (nm === 1 ? "" : "s") + "). Opening the new one replaces it in this browser. Its media files stay in the library only if the new project uses them.</p>" +
			"<p class=\"vd-dtxt\">Save a project file of the current one first if you want to come back to it.</p>" +
			"<div class=\"vd-dlgact\"><button type=\"button\" class=\"vd-btn vd-primary\" id=\"vd-op-save\">Save current, then open</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-op-go\">Open without saving</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-op-no\">Cancel</button></div>");
		$("vd-op-save").onclick = function () { saveProject(); closeDialog(); openProject(f); };
		$("vd-op-go").onclick = function () { closeDialog(); openProject(f); };
		$("vd-op-no").onclick = closeDialog;
	}
	function openProject(f) {
		f.text().then(async function (txt) {
			var d = JSON.parse(txt); if (!d || d.format !== "mes-video") throw new Error("This is not a MES Video Editor project file.");
			P.pause(); var p = V.normalize(d.project), keep = {};
			VE.bin.forEach(function (m) { keep[m.id] = m; });
			var bin = [];
			for (var j = 0; j < (d.media || []).length; j++) {
				var x = d.media[j]; if (keep[x.id]) { bin.push(keep[x.id]); continue; }
				var blob = await VE.idbGet("blobs", "m:" + x.id).catch(function () { return null; });
				var m = Object.assign({}, x, { state: blob ? "working" : "missing", status: blob ? "Opening..." : "Missing: add " + (x.origName || x.name) + " to relink it." });
				if (blob) m.file = blob instanceof File ? blob : new File([blob], x.name);
				bin.push(m);
			}
			VE.bin = bin; VE.P = p; VE.sel = []; VE.hist = new V.History(200); VE.hist.push(JSON.stringify(p));
			VE.bin.forEach(function (m) { if (m.state === "working" && m.file && !m.url) VE.prepare(m, false); });
			VE.emit("bin"); VE.commit("Open project");
			var miss = VE.bin.filter(function (m) { return m.state === "missing"; }).length;
			toast(miss ? miss + " media file" + (miss > 1 ? "s are" : " is") + " missing: drop them in (same names) to relink." : "Project opened.", 8000);
		}).catch(function (e) { toast("Could not open it: " + e.message); });
	}

	/* ---------- inspector ---------- */
	var insp = $("vd-insp");
	function num(id, label, val, step, min, max, unit, title) { return '<label class="vd-f" title="' + esc(title || "") + '"><span>' + label + '</span><input type="number" id="' + id + '" value="' + val + '" step="' + step + '"' + (min != null ? ' min="' + min + '"' : "") + (max != null ? ' max="' + max + '"' : "") + ">" + (unit ? "<em>" + unit + "</em>" : "") + "</label>"; }
	function r1(x) { return Math.round(x * 100) / 100; }
	function renderInsp() {
		var sel = VE.selected();
		if (!sel.length) return renderProject();
		if (sel.length > 1) return renderMulti(sel);
		var c = sel[0], m = VE.media(c.media), h = '<h3>' + esc(c.type === "text" ? "Title" : m ? m.name : "Clip") + '</h3><p class="vd-sub">' + ({ video: "Video clip", audio: "Sound clip", image: "Picture", text: "Title" })[c.type] + " · " + V.short(V.dur(c)) + "</p>";
		h += '<div class="vd-sec"><b>Time</b><div class="vd-grid">' + num("vd-i-start", "Starts at", r1(c.start), 0.01, 0, null, "s") + num("vd-i-dur", "Length", r1(V.dur(c)), 0.01, 0.05, null, "s") + "</div>";
		if (c.type === "video" || c.type === "audio") h += '<p class="vd-sub">From ' + V.short(c.in) + " to " + V.short(c.out) + " of the file.</p>";
		h += '<div class="vd-grid">' + num("vd-i-fin", "Fade in", r1(c.fin || 0), 0.1, 0, 30, "s") + num("vd-i-fout", "Fade out", r1(c.fout || 0), 0.1, 0, 30, "s") + "</div>";
		var prev = V.prevTouching(VE.P, c);
		h += num("vd-i-xin", "Cross-fade from the clip before", r1(c.xin || 0), 0.1, 0, 10, "s", prev ? "The clip starts showing this long before its start, fading in over the clip before it" : "Put this clip right after another one on the same track to cross-fade");
		if (!prev) h += '<p class="vd-sub">Cross-fades work when this clip starts exactly where another clip on its track ends.</p>';
		if (c.type === "video" || c.type === "audio") h += '<label class="vd-f"><span>Speed</span><select id="vd-i-speed">' + [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(function (s) { return '<option value="' + s + '"' + (Math.abs((c.speed || 1) - s) < 1e-6 ? " selected" : "") + ">" + s + "×</option>"; }).join("") + "</select></label>";
		h += "</div>";
		if (c.type === "text") {
			var T = c.text;
			h += '<div class="vd-sec"><b>Text</b><textarea id="vd-ttext" rows="3" aria-label="Title text">' + esc(T.s) + "</textarea>";
			h += '<div class="vd-grid"><label class="vd-f"><span>Font</span><select id="vd-t-font">' + [["Arial, Helvetica, sans-serif", "Arial"], ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times"], ["Verdana, sans-serif", "Verdana"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Impact, sans-serif", "Impact"], ["'Courier New', monospace", "Courier"], ["system-ui, sans-serif", "System"]].map(function (f) { return '<option value="' + esc(f[0]) + '"' + (T.font === f[0] ? " selected" : "") + ">" + f[1] + "</option>"; }).join("") + "</select></label>" +
				num("vd-t-size", "Size", Math.round(T.size * 1000) / 10, 0.5, 1, 60, "%", "Height of the letters as a share of the picture height") + '<label class="vd-f"><span>Colour</span><input type="color" id="vd-t-color" value="' + esc(T.color) + '"></label>' +
				'<label class="vd-f"><span>Align</span><select id="vd-t-align">' + ["left", "center", "right"].map(function (a) { return '<option' + (T.align === a ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label></div>";
			h += '<div class="vd-checks"><label><input type="checkbox" id="vd-t-bold"' + (T.bold ? " checked" : "") + "> Bold</label><label><input type=\"checkbox\" id=\"vd-t-italic\"" + (T.italic ? " checked" : "") + "> Italic</label><label><input type=\"checkbox\" id=\"vd-t-shadow\"" + (T.shadow ? " checked" : "") + "> Shadow</label><label><input type=\"checkbox\" id=\"vd-t-bgon\"" + (T.bgOn ? " checked" : "") + "> Box behind</label></div>";
			h += '<div class="vd-grid"><label class="vd-f"><span>Box colour</span><input type="color" id="vd-t-bg" value="' + esc(T.bg) + '"></label>' + num("vd-t-bgop", "Box opacity", Math.round((T.bgOp == null ? 0.55 : T.bgOp) * 100), 5, 0, 100, "%") + num("vd-t-outline", "Outline", T.outline || 0, 0.5, 0, 10) + '<label class="vd-f"><span>Outline colour</span><input type="color" id="vd-t-ocolor" value="' + esc(T.ocolor || "#000000") + '"></label></div></div>';
		}
		if (c.type !== "audio") {
			var rel = VE.t - c.start, ptol = 0.5 / VE.P.fps, run = c.anims && V.active(c, VE.t) ? V.animRunning(c, rel, ptol) : null, st = V.active(c, VE.t) ? V.stateAt(c, rel) : V.baseState(c);
			var ownA = !run && c.anims && V.active(c, VE.t) ? V.animEndingAt(c, rel, ptol) || ["x", "y", "scale", "rot", "op"].map(function (k) { return V.propOwner(c, rel, k, ptol); }).filter(Boolean)[0] : null;
			h += '<div class="vd-sec"><b>Position</b><p class="vd-sub">' + (run ? "The playhead is inside the animation &ldquo;" + esc(V.animName(run)) + "&rdquo;: move it to the animation's start or end to change these." : ownA ? "At the playhead: the end of &ldquo;" + esc(V.animName(ownA)) + "&rdquo;. Changes here (or dragging in the preview) move where that animation ends." : "Or drag it in the preview: a corner resizes, the round handle turns it.") + '</p><fieldset class="vd-fs"' + (run ? " disabled" : "") + '><div class="vd-grid">' + num("vd-i-x", "Left / right", Math.round(st.x * 1000) / 10, 0.5, -500, 500, "%") + num("vd-i-y", "Up / down", Math.round(st.y * 1000) / 10, 0.5, -500, 500, "%") + num("vd-i-scale", "Size", Math.round(st.scale * 1000) / 10, 1, 1, 4000, "%") + num("vd-i-rot", "Turn", Math.round(st.rot * 10) / 10, 1, -3600, 3600, "°") + num("vd-i-op", "Opacity", Math.round(st.op * 100), 5, 0, 100, "%") + "</div>";
			if (c.type !== "text") h += '<div class="vd-grid">' + num("vd-i-cl", "Crop left", Math.round(st.cl * 1000) / 10, 0.5, 0, 95, "%") + num("vd-i-cr", "Crop right", Math.round(st.cr * 1000) / 10, 0.5, 0, 95, "%") + num("vd-i-ct", "Crop top", Math.round(st.ct * 1000) / 10, 0.5, 0, 95, "%") + num("vd-i-cb", "Crop bottom", Math.round(st.cb * 1000) / 10, 0.5, 0, 95, "%") + "</div>";
			h += "</fieldset>";
			h += '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-pos="center">Centre</button><button type="button" class="vd-btn vd-sm" data-pos="fit">Fit the frame</button>' + (c.type !== "text" ? '<button type="button" class="vd-btn vd-sm" data-pos="fill">Fill the frame</button><button type="button" class="vd-btn vd-sm" data-pos="pip">Corner (picture in picture)</button>' : "") + "</div></div>";
		}
		if (c.type !== "audio") h += animSection(c);
		h += linkSection(c);
		if (VE.hasSound(c)) h += soundSection([c]);
		h += '<div class="vd-row vd-acts"><button type="button" class="vd-btn vd-sm" data-ca="split">Split at playhead</button><button type="button" class="vd-btn vd-sm" data-ca="dup">Duplicate</button><button type="button" class="vd-btn vd-sm" data-ca="del">Delete</button></div>';
		insp.innerHTML = h; bindInsp(c); bindLink(c); bindAnims(c);
	}
	function soundSection(list) {
		var c = list[0], db = Math.round(V.db(c.vol == null ? 1 : c.vol) * 10) / 10;
		var h = '<div class="vd-sec"><b>Sound</b>';
		if (list.length === 1) h += '<label class="vd-f vd-wide"><span>Volume <output id="vd-volout">' + (isFinite(db) ? (db > 0 ? "+" : "") + db + " dB" : "off") + '</output></span><input type="range" id="vd-i-vol" min="-40" max="20" step="0.5" value="' + (isFinite(db) ? db : -40) + '"></label><div class="vd-checks"><label><input type="checkbox" id="vd-i-mute"' + (c.mute ? " checked" : "") + "> Mute this clip</label></div>";
		h += "</div>" + fxSection(list) + '<div class="vd-sec"><b>Clean up</b>';
		var cleaned = list.filter(function (x) { return x.clean && x.clean.key; }).length;
		h += '<div class="vd-clean"><div class="vd-grid"><label class="vd-f"><span>Noise removal</span><select id="vd-dn-model"><option value="auto">Automatic (best available)</option><option value="deepfilter">DeepFilterNet (AI, best)</option><option value="rnnoise">RNNoise (AI, fast)</option><option value="spectral">Spectral (no download)</option></select></label>' + num("vd-dn-str", "Strength", Math.round((UI.dnStr == null ? 1 : UI.dnStr) * 100), 5, 0, 100, "%") + "</div>" +
			'<div class="vd-row"><button type="button" class="vd-btn vd-sm vd-primary" id="vd-dn-go">Remove noise' + (list.length > 1 ? " (" + list.length + " clips)" : "") + "</button>" + (cleaned ? '<button type="button" class="vd-btn vd-sm" id="vd-dn-off">Use the original sound</button>' : "") + '</div><p class="vd-sub" id="vd-dn-st">' + (cleaned ? (list.length > 1 ? cleaned + " of " + list.length + " clips have" : "This clip has") + " noise removed (" + esc((c.clean && c.clean.model) || "") + ")." : "Takes out hum, hiss and room noise. The first time, the AI model downloads (a few MB).") + "</p></div>";
		h += '<div class="vd-clean"><div class="vd-grid"><label class="vd-f"><span>Normalize loudness to</span><select id="vd-ln-tgt">' + [[-14, "-14 LUFS (YouTube, loud)"], [-16, "-16 LUFS (videos, podcasts)"], [-19, "-19 LUFS (quieter)"], [-23, "-23 LUFS (TV, EBU R128)"]].map(function (q) { return '<option value="' + q[0] + '"' + ((UI.lnTgt || -16) === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + '</select></label></div><div class="vd-row"><button type="button" class="vd-btn vd-sm" id="vd-ln-go">Normalize loudness' + (list.length > 1 ? " (" + list.length + " clips)" : "") + '</button></div><p class="vd-sub" id="vd-ln-st">' + (c.lufs != null ? "Set to " + c.lufs + " LUFS." : "Sets the volume so the clip is as loud as the target, never clipping.") + "</p></div>" + (list.length === 1 ? '<div class="vd-row"><button type="button" class="vd-btn vd-sm" id="vd-cmp-go" title="See and hear the original and the edited sound one above the other (C)">&#8645; Compare before / after</button></div>' : "") + "</div>";
		return h;
	}
	function renderMulti(sel) {
		var snd = sel.filter(VE.hasSound);
		var h = "<h3>" + sel.length + ' clips selected</h3><p class="vd-sub">Shift- or Ctrl-click clips to add or remove them.</p>';
		if (snd.length) h += soundSection(snd);
		h += '<div class="vd-row vd-acts"><button type="button" class="vd-btn vd-sm" data-ca="split">Split at playhead</button><button type="button" class="vd-btn vd-sm" data-ca="dup">Duplicate</button><button type="button" class="vd-btn vd-sm" data-ca="del">Delete</button></div>';
		insp.innerHTML = h; bindSound(snd); bindActs();
	}
	function renderProject() {
		var p = VE.P, d = V.duration(p);
		var h = '<h3>Project</h3><p class="vd-sub">' + p.clips.length + " clip" + (p.clips.length === 1 ? "" : "s") + " · " + V.tc(d, p.fps) + "</p>";
		h += '<div class="vd-sec"><b>Picture size</b><div class="vd-grid">' + num("vd-p-w", "Width", p.w, 2, 16, 7680, "px") + num("vd-p-h", "Height", p.h, 2, 16, 4320, "px") + "</div>";
		var bin0 = VE.bin.filter(function (m) { return m.kind === "video" && m.w; })[0];
		h += '<div class="vd-row vd-wrap">' + V.CANVAS_PRESETS.map(function (s) { return '<button type="button" class="vd-btn vd-sm" data-size="' + s[0] + '"' + (p.w + "x" + p.h === s[0] ? ' aria-pressed="true"' : "") + ">" + s[1] + "</button>"; }).join("") + (bin0 ? '<button type="button" class="vd-btn vd-sm" data-size="' + (Math.round(bin0.w / 2) * 2) + "x" + (Math.round(bin0.h / 2) * 2) + '">Like ' + esc(bin0.name.slice(0, 18)) + " (" + bin0.w + "×" + bin0.h + ")</button>" : "") + "</div>";
		h += '<div class="vd-grid"><label class="vd-f"><span>Frame rate</span><select id="vd-p-fps">' + [24, 25, 29.97, 30, 50, 60].map(function (f) { return '<option value="' + f + '"' + (Math.abs(p.fps - f) < 0.01 ? " selected" : "") + ">" + f + " fps</option>"; }).join("") + (([24, 25, 29.97, 30, 50, 60].some(function (f) { return Math.abs(p.fps - f) < 0.01; })) ? "" : '<option selected value="' + p.fps + '">' + p.fps + " fps</option>") + '</select></label><label class="vd-f"><span>Background</span><input type="color" id="vd-p-bg" value="' + esc(p.bg) + '"></label></div></div>';
		h += '<div class="vd-sec"><b>Start here</b><ol class="vd-steps"><li>Import videos, sound and pictures (or drop them in).</li><li>Drag them onto the timeline, or select several and press <i>Add selected in order</i> to join them.</li><li>Click a clip to trim, split (S), fade, move or clean up its sound here.</li><li>Press <i>Export MP4</i>.</li></ol><p class="vd-sub">Your work is saved in this browser as you go.</p></div>';
		insp.innerHTML = h;
		function setSize(w, hh) { VE.setCanvas(w, hh); }
		$("vd-p-w").onchange = function () { setSize(+this.value || p.w, p.h); }; $("vd-p-h").onchange = function () { setSize(p.w, +this.value || p.h); };
		insp.querySelectorAll("[data-size]").forEach(function (b) { b.onclick = function () { var s = b.getAttribute("data-size").split("x"); setSize(+s[0], +s[1]); }; });
		$("vd-p-fps").onchange = function () { p.fps = +this.value; VE.commit("Frame rate"); };
		$("vd-p-bg").onchange = function () { p.bg = this.value; VE.commit("Background"); };
	}
	function bindInsp(c) {
		function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
		on("vd-cmp-go", "click", function () { VE.compareSound(c); });
		function setNum(id, fn, label) { on(id, "change", function () { var v = parseFloat(this.value); if (!isFinite(v)) return renderInsp(); fn(v); VE.commit(label); }); }
		setNum("vd-i-start", function (v) { var s = Math.max(0, v); if (V.canPlace(VE.P, c.track, s, V.dur(c), (function () { var o = {}; o[c.id] = 1; return o; })())) c.start = s; else toast("There is no room there on this track."); }, "Move");
		setNum("vd-i-dur", function (v) { var r = V.trim(c, "r", c.start + Math.max(0.05, v), { mediaDur: VE.mediaDur(c), hi: nextStart(c), minDur: 1 / VE.P.fps }); Object.assign(c, r); }, "Length");
		setNum("vd-i-fin", function (v) { c.fin = V.clamp(v, 0, V.dur(c)); }, "Fade in"); setNum("vd-i-fout", function (v) { c.fout = V.clamp(v, 0, V.dur(c)); }, "Fade out");
		setNum("vd-i-xin", function (v) { var prev = V.prevTouching(VE.P, c); c.xin = prev ? V.clamp(v, 0, Math.min(V.dur(prev), V.dur(c))) : 0; if (!prev && v > 0) toast("Put this clip right after another clip on the same track first."); }, "Cross-fade");
		on("vd-i-speed", "change", function () { var s = +this.value, d = V.dur(c), endS = c.in + d * s; c.speed = s; var md = VE.mediaDur(c); c.out = Math.min(md, endS); var ign = {}; ign[c.id] = 1; if (!V.canPlace(VE.P, c.track, c.start, V.dur(c), ign)) { var hi = nextStart(c); if (hi < Infinity) c.out = c.in + (hi - c.start) * s; } VE.commit("Speed"); });
		// position values are the ones seen at the playhead: at an animation's end they change that animation, else the clip itself
		function setP(k, v) { if (V.active(c, VE.t)) V.setPropAt(c, VE.t - c.start, k, v, 0.5 / VE.P.fps); else { var b = V.baseState(c); b[k] = v; V.setBase(c, b); } }
		setNum("vd-i-x", function (v) { setP("x", v / 100); }, "Position"); setNum("vd-i-y", function (v) { setP("y", v / 100); }, "Position"); setNum("vd-i-scale", function (v) { setP("scale", V.clamp(v / 100, 0.01, 40)); }, "Size"); setNum("vd-i-op", function (v) { setP("op", V.clamp(v / 100, 0, 1)); }, "Opacity");
		setNum("vd-i-rot", function (v) { setP("rot", V.clamp(v, -3600, 3600)); }, "Turn");
		["l", "r", "t", "b"].forEach(function (k) { setNum("vd-i-c" + k, function (v) { setP("c" + k, V.clamp(v / 100, 0, 0.95)); }, "Crop"); });
		insp.querySelectorAll("[data-pos]").forEach(function (b) { b.onclick = function () { var a = b.getAttribute("data-pos"), m = VE.media(c.media); c.x = 0.5; c.y = 0.5; if (a === "fit") c.scale = 1; if (a === "fill" && m && m.w) c.scale = Math.max(VE.P.w / m.w, VE.P.h / m.h) / Math.min(VE.P.w / m.w, VE.P.h / m.h); if (a === "pip") { c.scale = 0.3; c.x = 0.82; c.y = 0.8; } if (a === "center" && c.type === "text") c.y = 0.5; VE.commit("Position"); }; });
		if (c.type === "text") {
			var T = c.text, live = function () { VE.preview.draw(); };
			on("vd-ttext", "input", function () { T.s = this.value; live(); }); on("vd-ttext", "change", function () { VE.commit("Title text"); });
			on("vd-t-font", "change", function () { T.font = this.value; VE.commit("Font"); }); setNum("vd-t-size", function (v) { T.size = V.clamp(v / 100, 0.01, 0.6); }, "Text size");
			on("vd-t-color", "input", function () { T.color = this.value; live(); }); on("vd-t-color", "change", function () { VE.commit("Text colour"); });
			on("vd-t-align", "change", function () { T.align = this.value; VE.commit("Align"); });
			["bold", "italic", "shadow"].forEach(function (k) { on("vd-t-" + k, "change", function () { T[k] = this.checked; VE.commit("Text style"); }); });
			on("vd-t-bgon", "change", function () { T.bgOn = this.checked; VE.commit("Text box"); });
			on("vd-t-bg", "input", function () { T.bg = this.value; live(); }); on("vd-t-bg", "change", function () { VE.commit("Box colour"); });
			setNum("vd-t-bgop", function (v) { T.bgOp = V.clamp(v / 100, 0, 1); }, "Box opacity"); setNum("vd-t-outline", function (v) { T.outline = V.clamp(v, 0, 10); }, "Outline");
			on("vd-t-ocolor", "change", function () { T.ocolor = this.value; VE.commit("Outline colour"); });
		}
		if (VE.hasSound(c)) {
			on("vd-i-vol", "input", function () { var d = +this.value; c.vol = d <= -40 ? 0 : V.fromDb(d); c.lufs = null; $("vd-volout").textContent = d <= -40 ? "off" : (d > 0 ? "+" : "") + d + " dB"; VE.preview.sync(); });
			on("vd-i-vol", "change", function () { VE.commit("Volume"); });
			on("vd-i-mute", "change", function () { c.mute = this.checked; VE.commit(c.mute ? "Mute" : "Unmute"); });
			bindSound([c]);
		}
		bindActs();
	}
	function bindActs() { insp.querySelectorAll("[data-ca]").forEach(function (b) { b.onclick = function () { var a = b.getAttribute("data-ca"); if (a === "split") VE.split(); else if (a === "dup") VE.duplicate(); else VE.del(false); }; }); }
	function nextStart(c) { var hi = Infinity; V.onTrack(VE.P, c.track).forEach(function (x) { if (x !== c && x.start >= c.start + 1e-4) hi = Math.min(hi, x.start); }); return hi; }
	function bindSound(list) {
		var m = $("vd-dn-model"); if (m) m.value = UI.dnModel || "auto";
		if (m) m.onchange = function () { UI.dnModel = m.value; saveUI(); };
		var st = $("vd-dn-str"); if (st) st.onchange = function () { UI.dnStr = V.clamp((st.value === "" ? 100 : +st.value) / 100, 0, 1); saveUI(); };
		var go = $("vd-dn-go"); if (go) go.onclick = function () { denoise(list); };
		var off = $("vd-dn-off"); if (off) off.onclick = function () { list.forEach(function (c) { c.clean = null; }); VE.commit("Original sound"); };
		var lt = $("vd-ln-tgt"); if (lt) lt.onchange = function () { UI.lnTgt = +lt.value; saveUI(); };
		var lg = $("vd-ln-go"); if (lg) lg.onclick = function () { normalize(list); };
		bindFx(list);
	}
	var inspTimer = 0;
	VE.on("select", function () { renderInsp(); VE.tl.markSel(); });
	VE.on("change", function () { if (!insp.contains(document.activeElement) || document.activeElement.type === "button") renderInsp(); updateButtons(); timeText(); });
	VE.on("live", function () { clearTimeout(inspTimer); inspTimer = setTimeout(function () { if (!insp.contains(document.activeElement)) renderInsp(); }, 120); });
	var tInsp = 0;
	VE.on("time", function () { if (VE.preview.playing) return; var c = VE.selected()[0]; if (!c || c.type === "audio" || !c.anims) return; clearTimeout(tInsp); tInsp = setTimeout(function () { if (!insp.contains(document.activeElement) || document.activeElement.type === "button") renderInsp(); }, 90); });
	VE.on("editText", function (c) { VE.sel = [c.id]; renderInsp(); var ta = $("vd-ttext"); if (ta) { ta.focus(); ta.select(); } });
	function updateButtons() {
		$("vd-undo").disabled = !VE.hist.canUndo(); $("vd-redo").disabled = !VE.hist.canRedo();
		$("vd-cutrange").disabled = !marksOk(); $("vd-clearmarks").disabled = !(VE.P.marks && (VE.P.marks.in != null || VE.P.marks.out != null));
		var nm = $("vd-name"); if (document.activeElement !== nm) nm.value = VE.P.name;
		$("vd-sep").disabled = !VE.selected().some(function (c) { return c.type === "video" && VE.hasSound(c); });
		$("vd-status").textContent = VE.P.clips.length + " clip" + (VE.P.clips.length === 1 ? "" : "s") + " · " + VE.P.w + "×" + VE.P.h + " · " + VE.P.fps + " fps" + (VE.lastLabel ? " · " + VE.lastLabel : "");
	}
	$("vd-name").addEventListener("change", function () { VE.P.name = this.value.trim() || "Untitled video"; VE.commit("Rename"); });
	VE.on("saved", function () { $("vd-saved").textContent = "Saved in this browser"; });
	VE.on("saveError", function () { $("vd-saved").textContent = "Could not save in this browser"; });

	/* ---------- sound clean-up ---------- */
	function loadDenoise() {
		if (window.MESDenoise) return Promise.resolve(window.MESDenoise);
		return new Promise(function (res) {
			var s = document.createElement("script"); s.src = "/main_js/denoise.js?v=2"; s.onload = function () { res(window.MESDenoise || null); }; s.onerror = function () { res(null); }; document.head.appendChild(s);
		});
	}
	var cleaning = false;
	async function denoise(list) {
		if (cleaning) return; var stEl = function (t) { var e = $("vd-dn-st"); if (e) e.textContent = t; };
		var D = await loadDenoise();
		if (!D || typeof D.process !== "function") { stEl("Noise removal is not available yet: it is being added to mes.fm (the MES Audio Editor's engine). Normalize loudness works now."); return; }
		cleaning = true; var model = UI.dnModel || "auto", strength = UI.dnStr == null ? 1 : UI.dnStr, done = 0;
		try {
			if (D.load) { stEl("Loading the noise-removal model..."); await D.load({ model: model, onProgress: function (x) { stEl("Loading the noise-removal model... " + Math.round((x && x.progress != null ? x.progress : x) * 100) + "%"); } }); }
			for (var j = 0; j < list.length; j++) {
				var c = list[j], m = VE.media(c.media); if (!m) continue;
				var a = Math.max(0, c.in - (c.xin || 0) * (c.speed || 1) - 0.25), b = Math.min(m.dur, c.out + 0.25), tag = list.length > 1 ? "Clip " + (j + 1) + " of " + list.length + ": " : "";
				stEl(tag + "reading the sound...");
				var pcm = await VE.pcmRange(m, a, b, function (x) { stEl(tag + "reading the sound... " + Math.round(x * 100) + "%"); });
				stEl(tag + "removing noise...");
				var out = await D.process(pcm, 48000, { model: model, strength: strength, onProgress: function (x) { stEl(tag + "removing noise... " + Math.round((x && x.progress != null ? x.progress : x) * 100) + "%"); } });
				if (!out || !out.length) throw new Error("the noise remover returned no sound");
				var key = V.uid("k"); await VE.idbPut("blobs", "c:" + key, { a: a, rate: 48000, ch: out.map(function (x) { return x.buffer.byteLength === x.length * 4 ? x.buffer : x.slice().buffer; }) });
				VE.cleanCache[key] = { start: a, rate: 48000, ch: out };
				c.clean = { key: key, a: a, b: b, model: (D.lastModel || model), strength: strength }; done++;
			}
			VE.commit("Remove noise"); toast("Noise removed from " + done + " clip" + (done > 1 ? "s" : "") + ". Press Play to hear it, or Compare before / after to see it.");
		} catch (e) { stEl("Noise removal failed: " + (e && e.message || e)); if (window.console) console.error(e); }
		cleaning = false;
	}
	async function normalize(list) {
		var target = UI.lnTgt || -16, stEl = function (t) { var e = $("vd-ln-st"); if (e) e.textContent = t; }, n = 0;
		try {
			for (var j = 0; j < list.length; j++) {
				var c = list[j], m = VE.media(c.media); if (!m) continue;
				var meter = new V.LufsMeter(48000), tag = list.length > 1 ? "Clip " + (j + 1) + " of " + list.length + ": " : "";
				for (var s = c.in; s < c.out; s += 10) {
					var e2 = Math.min(c.out, s + 10), buf = await VE.clipPcm(c, s, e2), cnt = Math.round((e2 - s) * 48000);
					if (!buf || cnt <= 0) continue;
					var part = buf.ch.slice(0, 2).map(function () { return new Float32Array(cnt); }); V.mixInto(part, 0, cnt, buf, s, 1 / 48000, null); meter.push(part);
					stEl(tag + "measuring... " + Math.round((e2 - c.in) / (c.out - c.in) * 100) + "%");
				}
				var L = meter.result(); if (!isFinite(L)) { stEl(tag + "this clip is silent."); continue; }
				c.vol = V.normalizeGain(L, meter.peak, target, -1); c.lufs = target; n++;
				stEl(tag + "was " + L.toFixed(1) + " LUFS, volume now " + (V.db(c.vol) >= 0 ? "+" : "") + V.db(c.vol).toFixed(1) + " dB.");
			}
			if (n) { VE.commit("Normalize loudness"); toast(n + " clip" + (n > 1 ? "s" : "") + " set to " + target + " LUFS."); }
		} catch (e) { stEl("Could not measure: " + (e && e.message || e)); }
	}

	/* ---------- compare a clip's sound before / after its edits ---------- */
	// Original (the media's own sound) above Edited (noise removed, volume, fades, audio effects: what the export plays), on the same time and
	// level scale, plus "What was taken out" when noise was removed. Play keeps going when you switch Before / After (B), so you hear the
	// exact same words both ways. "Match levels" turns the edited sound up / down to the original's level so only the clean-up is compared.
	VE.compareSound = function (c) {
		var m = VE.media(c.media); if (!m || !VE.hasSound(c)) { toast("This clip has no sound to compare."); return; }
		var RATE = 48000, cl = { len: UI.cmpLen || 10, t0: 0, mode: "b", match: !!UI.cmpMatch, loop: UI.cmpLoop !== false, pos: 0, data: null, tok: 0 };
		var ac = null, srcs = [], gB = null, gA = null, playAt = 0, playFrom = 0, raf = 0;
		function cs() { return c.start; } function ce() { return V.end(c); }
		function place(t) { var L = Math.min(cl.len, ce() - cs()); cl.t0 = Math.max(cs(), Math.min(ce() - L, t)); cl.t1 = cl.t0 + L; }
		place(VE.t - cl.len / 2);
		dialog('<h3>Compare the sound: before and after</h3>' +
			'<div class="vd-cmp-bar"><button type="button" class="vd-btn vd-primary" id="vd-cmp-play" title="Play / pause (Space)">&#9654; Play</button>' +
			'<span class="vd-cmp-ab" role="radiogroup" aria-label="Listen to"><button type="button" class="vd-btn" data-ab="b" role="radio">Before (original)</button><button type="button" class="vd-btn" data-ab="a" role="radio">After (edited)</button></span>' +
			'<span class="vd-sub">B switches without stopping</span><span class="vd-sp"></span>' +
			'<label class="vd-cmp-ck"><input type="checkbox" id="vd-cmp-match"' + (cl.match ? " checked" : "") + '> Match levels</label><label class="vd-cmp-ck"><input type="checkbox" id="vd-cmp-loop"' + (cl.loop ? " checked" : "") + '> Loop</label>' +
			'<label class="vd-cmp-ck">Show <select id="vd-cmp-len">' + [5, 10, 30, 60].map(function (x) { return '<option value="' + x + '"' + (x === cl.len ? " selected" : "") + ">" + x + " s</option>"; }).join("") + '</select></label>' +
			'<button type="button" class="vd-btn vd-sm" id="vd-cmp-prev" title="Earlier part of the clip">&#8249; Earlier</button><button type="button" class="vd-btn vd-sm" id="vd-cmp-next" title="Later part of the clip">Later &#8250;</button></div>' +
			'<div class="vd-cmp-rows" id="vd-cmp-rows"><p class="vd-sub">Reading the sound...</p></div>' +
			'<p class="vd-sub" id="vd-cmp-note">Click or drag on a waveform to move. Both waveforms use the same scale (' + (VE.tl.wave === "db" ? "dB" : "linear") + '), so a quieter background shows as a thinner band between the words.</p>' +
			'<div class="vd-dlgact"><button type="button" class="vd-btn" id="vd-cmp-close">Close</button></div>');
		$("vd-dlg").classList.add("vd-dlg--cmp");
		dlgClose = function () { stop(); cl.tok++; if (ac) { try { ac.close(); } catch (e) { /* ignore */ } ac = null; } UI.cmpLen = cl.len; UI.cmpMatch = cl.match; UI.cmpLoop = cl.loop; saveUI(); };
		function abBtns() { $("vd-dlg").querySelectorAll("[data-ab]").forEach(function (b) { var on = b.getAttribute("data-ab") === cl.mode; b.classList.toggle("vd-primary", on); b.setAttribute("aria-checked", on ? "true" : "false"); }); }
		abBtns();
		function stats(ch) {
			var n = ch[0].length, blk = Math.round(RATE * 0.05), rms = [], pk = 0, e = 0;
			for (var i = 0; i < n; i += blk) { var be = 0, cnt = 0; for (var k = 0; k < ch.length; k++) { var x = ch[k]; for (var j = i, je = Math.min(n, i + blk); j < je; j++) { var v = x[j]; be += v * v; cnt++; if (v > pk) pk = v; else if (-v > pk) pk = -v; } } e += be; if (cnt) rms.push(be / cnt); }
			var sorted = rms.slice().sort(function (a, b) { return a - b; }), fl = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
			return { peak: V.db(pk), rms: V.db(Math.sqrt(e / Math.max(1, n * ch.length))), floor: V.db(Math.sqrt(fl)) };
		}
		function f1(d) { return isFinite(d) ? d.toFixed(1) + " dB" : "silent"; }
		async function load() {
			var tok = ++cl.tok; stop(); $("vd-cmp-rows").innerHTML = '<p class="vd-sub">Reading the sound...</p>';
			try {
				var sp = c.speed || 1, sa = V.srcAt(c, cl.t0), sb = V.srcAt(c, cl.t1), n = Math.max(1, Math.round((sb - sa) * RATE));
				var orig = await VE.pcmRange(m, Math.max(0, sa), sb); if (tok !== cl.tok) return;
				var nch = orig.length, cleaned = null;
				if (c.clean && c.clean.key) { var cp = await VE.cleanPcm(c.clean.key); if (cp) { cleaned = []; for (var k = 0; k < nch; k++) cleaned.push(new Float32Array(n)); V.mixInto(cleaned, 0, n, cp, sa, 1 / RATE, null); } }
				if (tok !== cl.tok) return;
				var base = cleaned || orig, after = [], blk = 480;
				for (var k2 = 0; k2 < nch; k2++) after.push(new Float32Array(n));
				for (var i = 0; i < n; i += blk) {
					var t = cl.t0 + (i + blk / 2) / RATE / sp, g = V.gainAt(VE.P, c, t) * VE.fxGainAt(c, t);
					for (var k3 = 0; k3 < nch; k3++) { var src = base[k3] || base[0], dst = after[k3]; for (var j = i, je = Math.min(n, i + blk); j < je; j++) dst[j] = src[j] * g; }
				}
				var removed = null;
				if (cleaned) { removed = []; for (var k4 = 0; k4 < nch; k4++) { var r = new Float32Array(n), o = orig[k4], cc = cleaned[k4]; for (var j2 = 0; j2 < n; j2++) r[j2] = o[j2] - cc[j2]; removed.push(r); } }
				var sB = stats(orig), sA = stats(after), match = isFinite(sB.rms) && isFinite(sA.rms) ? V.fromDb(Math.max(-30, Math.min(30, sB.rms - sA.rms))) : 1;
				cl.data = { n: n, sp: sp, orig: orig, after: after, removed: removed, sB: sB, sA: sA, sR: removed ? stats(removed) : null, match: match };
				cl.pos = Math.max(0, Math.min(n / RATE / sp, VE.t - cl.t0));
				build(); bufs = null;
			} catch (e) { if (tok === cl.tok) $("vd-cmp-rows").innerHTML = '<p class="vd-sub">Could not read the sound: ' + esc(e && e.message || String(e)) + "</p>"; }
		}
		function row(id, label, info) { return '<div class="vd-cmp-row"><div class="vd-cmp-lab"><b>' + label + '</b><span>' + info + '</span></div><div class="vd-cmp-cv"><canvas id="' + id + '"></canvas><i class="vd-cmp-ph"></i></div></div>'; }
		function build() {
			var D = cl.data, eg = D.match !== 1 && cl.match ? " (shown " + (V.db(D.match) > 0 ? "+" : "") + V.db(D.match).toFixed(1) + " dB to match)" : "";
			var h = '<div class="vd-cmp-time" id="vd-cmp-time"></div>' +
				row("vd-cmp-b", "Before: the original", "Peak " + f1(D.sB.peak) + " · average " + f1(D.sB.rms) + " · background " + f1(D.sB.floor)) +
				row("vd-cmp-a", "After: what the export plays", "Peak " + f1(D.sA.peak) + " · average " + f1(D.sA.rms) + " · background " + f1(D.sA.floor) + eg);
			if (D.removed) h += row("vd-cmp-r", "What was taken out", "Average " + f1(D.sR.rms) + ". Mostly noise is good; words here mean the clean-up was too strong.");
			var diff = D.sA.floor - D.sB.floor;
			h += '<p class="vd-cmp-sum">' + (isFinite(diff) ? "Background between the words: " + f1(D.sB.floor) + " &rarr; " + f1(D.sA.floor) + " (" + (diff <= 0 ? diff.toFixed(1) : "+" + diff.toFixed(1)) + " dB" + (cl.match ? "" : ", volume change included") + ")." : "") + "</p>";
			$("vd-cmp-rows").innerHTML = h; draw();
			$("vd-cmp-rows").querySelectorAll(".vd-cmp-cv").forEach(function (box) {
				function at(e) { var r = box.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * D.n / RATE / D.sp; }
				var down = false;
				box.addEventListener("pointerdown", function (e) { down = true; try { box.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } seekTo(at(e)); });
				box.addEventListener("pointermove", function (e) { if (down) seekTo(at(e)); });
				box.addEventListener("pointerup", function () { down = false; }); box.addEventListener("pointercancel", function () { down = false; });
			});
			marker();
		}
		function paint(cv, ch, color, color2, gain) {
			var box = cv.parentNode, W = Math.max(50, box.clientWidth), H = box.clientHeight || 90, dpr = Math.min(2, window.devicePixelRatio || 1);
			cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
			var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
			var mode = VE.tl.wave, mid = H / 2, half = H / 2 - 2, n = ch[0].length, gdb = V.db(gain || 1);
			g.font = "9px Arial, sans-serif"; g.textBaseline = "middle";
			(mode === "db" ? [0, -12, -24, -48] : [0, -6, -12]).forEach(function (d) { var y = V.waveY(d, mode) * half; g.fillStyle = d === 0 ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.09)"; g.fillRect(0, Math.round(mid - y), W, 1); g.fillRect(0, Math.round(mid + y), W, 1); if (d < 0 && y > 8) { g.fillStyle = "rgba(255,255,255,0.45)"; g.fillText(String(d), 3, mid - y + 6); } });
			g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(0, Math.round(mid), W, 1);
			for (var x = 0; x < W; x++) {
				var a = Math.floor(x * n / W), b = Math.max(a + 1, Math.floor((x + 1) * n / W)), mx = 0, e = 0, cnt = 0;
				for (var k = 0; k < ch.length; k++) { var xs = ch[k]; for (var j = a; j < b && j < n; j++) { var v = xs[j]; e += v * v; cnt++; if (v > mx) mx = v; else if (-v > mx) mx = -v; } }
				if (!cnt) continue;
				var ph = V.waveY(V.db(mx) + gdb, mode) * half, rh = V.waveY(V.db(Math.sqrt(e / cnt)) + gdb, mode) * half;
				if (ph > 0.3) { g.fillStyle = color; g.fillRect(x, mid - ph, 1, ph * 2); }
				if (rh > 0.3) { g.fillStyle = color2; g.fillRect(x, mid - rh, 1, rh * 2); }
			}
		}
		function draw() {
			var D = cl.data; if (!D) return;
			paint($("vd-cmp-b"), D.orig, "rgba(147,197,253,0.6)", "#bfdbfe", 1);
			paint($("vd-cmp-a"), D.after, "rgba(110,231,183,0.62)", "#a7f3d0", cl.match ? D.match : 1);
			if (D.removed) paint($("vd-cmp-r"), D.removed, "rgba(251,191,36,0.55)", "#fde68a", 1);
		}
		function dur() { var D = cl.data; return D ? D.n / RATE / D.sp : 0; }
		function marker() {
			var D = cl.data; if (!D) return; var p = dur() ? cl.pos / dur() * 100 : 0;
			$("vd-cmp-rows").querySelectorAll(".vd-cmp-ph").forEach(function (el) { el.style.left = p + "%"; });
			var tm = $("vd-cmp-time"); if (tm) tm.textContent = V.tc(cl.t0 + cl.pos, VE.P.fps) + "   (" + V.tc(cl.t0, VE.P.fps) + " to " + V.tc(cl.t1, VE.P.fps) + ")";
		}
		var bufs = null;
		function mkBuf(ch, gain) { var b = ac.createBuffer(Math.max(1, ch.length), ch[0].length, RATE); for (var k = 0; k < ch.length; k++) { var d = b.getChannelData(k), s = ch[k]; if (gain === 1) d.set(s); else for (var j = 0; j < s.length; j++) d[j] = s[j] * gain; } return b; }
		function play() {
			var D = cl.data; if (!D) return;
			if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { toast("This browser cannot play sound here."); return; } }
			if (ac.state === "suspended") ac.resume();
			if (!bufs || bufs.match !== cl.match) bufs = { b: mkBuf(D.orig, 1), a: mkBuf(D.after, cl.match ? D.match : 1), match: cl.match };
			stop(true); if (cl.pos >= dur() - 0.02) cl.pos = 0;
			gB = ac.createGain(); gA = ac.createGain(); gB.gain.value = cl.mode === "b" ? 1 : 0; gA.gain.value = cl.mode === "a" ? 1 : 0; gB.connect(ac.destination); gA.connect(ac.destination);
			var when = ac.currentTime + 0.03, off = cl.pos * D.sp;
			[[bufs.b, gB], [bufs.a, gA]].forEach(function (q) { var s = ac.createBufferSource(); s.buffer = q[0]; s.playbackRate.value = D.sp; s.connect(q[1]); s.start(when, off); srcs.push(s); });
			srcs[0].onended = function () { if (!srcs.length) return; if (cl.loop) { cl.pos = 0; play(); } else { stop(); cl.pos = dur(); marker(); } };
			playAt = when; playFrom = cl.pos; $("vd-cmp-play").innerHTML = "&#10074;&#10074; Pause";
			cancelAnimationFrame(raf); (function tick() { if (!srcs.length) return; cl.pos = Math.max(0, Math.min(dur(), playFrom + (ac.currentTime - playAt))); marker(); raf = requestAnimationFrame(tick); })();
		}
		function stop(keep) {
			cancelAnimationFrame(raf); var list = srcs; srcs = [];
			list.forEach(function (s) { s.onended = null; try { s.stop(); } catch (e) { /* ignore */ } });
			if (!keep) { var b = $("vd-cmp-play"); if (b) b.innerHTML = "&#9654; Play"; }
		}
		function seekTo(t) { cl.pos = t; marker(); if (srcs.length) play(); }
		function setMode(md) { cl.mode = md; abBtns(); if (gB && ac) { var now = ac.currentTime; gB.gain.setTargetAtTime(md === "b" ? 1 : 0, now, 0.01); gA.gain.setTargetAtTime(md === "a" ? 1 : 0, now, 0.01); } }
		$("vd-cmp-play").onclick = function () { if (srcs.length) stop(); else play(); };
		$("vd-dlg").querySelectorAll("[data-ab]").forEach(function (b) { b.onclick = function () { setMode(b.getAttribute("data-ab")); }; });
		$("vd-cmp-match").onchange = function () { cl.match = this.checked; if (cl.data) { build(); if (srcs.length) play(); } };
		$("vd-cmp-loop").onchange = function () { cl.loop = this.checked; };
		$("vd-cmp-len").onchange = function () { cl.len = +this.value; place(cl.t0 + cl.pos - cl.len / 2); load(); };
		$("vd-cmp-prev").onclick = function () { place(cl.t0 - (cl.t1 - cl.t0)); load(); };
		$("vd-cmp-next").onclick = function () { place(cl.t1); load(); };
		$("vd-cmp-close").onclick = closeDialog;
		$("vd-dlg").addEventListener("keydown", function (e) {
			if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
			if (e.key === " ") { e.preventDefault(); e.stopPropagation(); $("vd-cmp-play").click(); }
			else if (e.key === "b" || e.key === "B") { e.preventDefault(); e.stopPropagation(); setMode(cl.mode === "b" ? "a" : "b"); }
		});
		var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null; if (ro) ro.observe($("vd-cmp-rows"));
		var prevClose = dlgClose; dlgClose = function () { if (ro) ro.disconnect(); prevClose(); };
		load();
	};

	/* ---------- export dialog ---------- */
	var exporting = null;
	function openExport() {
		var p = VE.P, d = V.duration(p);
		if (!d) { toast("The timeline is empty: add a clip first."); return; }
		if (!window.VideoEncoder) { toast("This browser cannot export video. Use Chrome, Edge or Brave on a computer."); return; }
		P.pause();
		var mk = p.marks || {}, hasMarks = marksOk();
		var sizes = V.EXPORT_SIZES.map(function (s) { var z = V.exportSize(p, s[0]); return '<option value="' + s[0] + '"' + ((UI.exSize || "project") === s[0] ? " selected" : "") + ">" + s[1] + " · " + z.w + "×" + z.h + "</option>"; }).join("");
		var h = '<h3>Export MP4</h3><div class="vd-grid"><label class="vd-f"><span>Size</span><select id="vd-x-size">' + sizes + '</select></label><label class="vd-f"><span>Frame rate</span><select id="vd-x-fps">' + [p.fps].concat([24, 25, 30, 60].filter(function (f) { return Math.abs(f - p.fps) > 0.01; })).map(function (f, k) { return '<option value="' + f + '">' + f + " fps" + (k ? "" : " (project)") + "</option>"; }).join("") + '</select></label>' +
			'<label class="vd-f"><span>Quality</span><select id="vd-x-q"><option value="high">High (bigger file)</option><option value="balanced">Balanced</option><option value="small">Smaller file</option></select></label>' +
			'<label class="vd-f"><span>What</span><select id="vd-x-range"><option value="all">The whole video (' + V.tc(d, p.fps) + ')</option>' + (hasMarks ? '<option value="marks">Only the marked part (' + V.tc(mk.out - mk.in, p.fps) + ")</option>" : "") + "</select></label></div>" +
			'<label class="vd-f vd-wide"><span>File name</span><input type="text" id="vd-x-name" value="' + esc((p.name || "video").replace(/[\\/:*?"<>|]+/g, "-")) + '.mp4"></label>' +
			(window.showSaveFilePicker ? '<div class="vd-checks"><label><input type="checkbox" id="vd-x-disk"' + (UI.exDisk !== false ? " checked" : "") + "> Write it straight to a file I choose (best for long videos)</label></div>" : '<p class="vd-sub">The MP4 is made in memory and downloaded at the end.' + (navigator.brave ? " Brave can write straight to disk if you turn on brave://flags/#file-system-access-api." : "") + "</p>") +
			'<p class="vd-sub" id="vd-x-est"></p><div class="vd-xprog" id="vd-x-prog" hidden><div class="vd-bar"><i id="vd-x-bar"></i></div><p id="vd-x-txt" aria-live="polite"></p></div>' +
			'<div class="vd-row vd-end"><button type="button" class="vd-btn" id="vd-x-cancel">Close</button><button type="button" class="vd-btn vd-primary" id="vd-x-go">Export</button></div>';
		dialog(h);
		$("vd-x-q").value = UI.exQ || "balanced";
		function est() { var z = V.exportSize(p, $("vd-x-size").value), f = +$("vd-x-fps").value, len = $("vd-x-range").value === "marks" ? mk.out - mk.in : d, br = V.bitrate(z.w, z.h, f, $("vd-x-q").value) + 192000; $("vd-x-est").textContent = "About " + C.formatBytes(br * len / 8) + " (" + (br / 1e6).toFixed(1) + " Mbit/s)."; }
		["vd-x-size", "vd-x-fps", "vd-x-q", "vd-x-range"].forEach(function (id) { $(id).onchange = est; }); est();
		$("vd-x-cancel").onclick = function () { if (exporting) { exporting.cancel = true; return; } closeDialog(); };
		$("vd-x-go").onclick = async function () {
			var size = $("vd-x-size").value, z = V.exportSize(p, size), fps = +$("vd-x-fps").value, q = $("vd-x-q").value, range = $("vd-x-range").value, name = ($("vd-x-name").value || "video.mp4").replace(/[\\/:*?"<>|]+/g, "-"); if (!/\.mp4$/i.test(name)) name += ".mp4";
			var disk = $("vd-x-disk") && $("vd-x-disk").checked; UI.exSize = size; UI.exQ = q; UI.exDisk = disk; saveUI();
			var handle = null;
			if (disk) { try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }] }); } catch (e) { return; } }
			var go = $("vd-x-go"); go.disabled = true; $("vd-x-cancel").textContent = "Cancel"; $("vd-x-prog").hidden = false;
			exporting = { cancel: false };
			try {
				var res = await VE.exportVideo({ w: z.w, h: z.h, fps: fps, quality: q, a: range === "marks" ? mk.in : 0, b: range === "marks" ? mk.out : d, handle: handle,
					cancelled: function () { return exporting && exporting.cancel; },
					onProgress: function (f, txt) { $("vd-x-bar").style.width = Math.round(f * 100) + "%"; $("vd-x-txt").textContent = Math.round(f * 100) + "% · " + txt; } });
				var url = res.blob ? URL.createObjectURL(res.blob) : null;
				$("vd-x-txt").innerHTML = "<b>Done</b>: " + esc(name) + ", " + C.formatBytes(res.size) + " in " + V.short(res.secs).replace(/\.\d$/, "") + (res.sound ? "" : " (without sound)") + "." + (url ? ' <a class="vd-btn vd-primary" href="' + url + '" download="' + esc(name) + '">Download</a>' : " Saved where you chose.");
				$("vd-x-bar").style.width = "100%";
				if (url) { var v = document.createElement("video"); v.controls = true; v.src = url; v.className = "vd-xvid"; $("vd-x-prog").appendChild(v); }
			} catch (e) { $("vd-x-txt").textContent = /Cancelled/.test(e.message) ? "Export cancelled." : "Export failed: " + e.message; if (window.console) console.error(e); }
			exporting = null; go.disabled = false; $("vd-x-cancel").textContent = "Close";
		};
	}
	var dlgClose = null;
	function dialog(h) { if (dlgClose) { var f0 = dlgClose; dlgClose = null; f0(); } $("vd-dlg").className = "vd-dlg"; $("vd-dlg").innerHTML = h; $("vd-modal").hidden = false; setTimeout(function () { var f = $("vd-dlg").querySelector("select, input, button"); if (f) f.focus(); }, 30); }
	function closeDialog() { if (exporting) return; $("vd-modal").hidden = true; if (dlgClose) { var f0 = dlgClose; dlgClose = null; f0(); } }
	$("vd-modal").addEventListener("click", function (e) { if (e.target === this) closeDialog(); });
	$("vd-export").onclick = openExport;

	/* ---------- keyboard ---------- */
	document.addEventListener("keydown", function (e) {
		var tg = e.target, tn = (tg && tg.tagName) || "";
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(tn) && !(e.key === "Escape")) { if (!((e.ctrlKey || e.metaKey) && /^[sez]$/i.test(e.key) && tn !== "TEXTAREA" && tn !== "INPUT")) return; }
		if (!app.contains(tg) && tg !== document.body && !UI.win && !app.classList.contains("vd-pvfill")) return;
		var k = e.key, mod = e.ctrlKey || e.metaKey, f = 1 / VE.P.fps;
		if (!$("vd-modal").hidden) { if (k === "Escape") closeDialog(); return; }
		if (mod && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) VE.redo(); else VE.undo(); return; }
		if (mod && (k === "y" || k === "Y")) { e.preventDefault(); VE.redo(); return; }
		if (mod && (k === "s" || k === "S")) { e.preventDefault(); saveProject(); return; }
		if (mod && (k === "e" || k === "E")) { e.preventDefault(); openExport(); return; }
		if (mod && (k === "i" || k === "I")) { e.preventDefault(); $("vd-file").click(); return; }
		if (mod && (k === "d" || k === "D")) { e.preventDefault(); VE.duplicate(); return; }
		if (mod && e.shiftKey && (k === "a" || k === "A")) { e.preventDefault(); VE.separate(VE.selected()); return; }
		if (mod && (k === "a" || k === "A")) { e.preventDefault(); VE.sel = VE.P.clips.map(function (c) { return c.id; }); VE.emit("select"); return; }
		if ((mod || e.ctrlKey) && e.altKey && (k === "ArrowLeft" || k === "ArrowRight")) { e.preventDefault(); VE.goEdit(k === "ArrowRight" ? 1 : -1); return; }
		if (mod && (k === "g" || k === "G")) { e.preventDefault(); tin.focus(); return; }
		if (mod && (k === "Home" || k === "End")) { e.preventDefault(); P.seek(k === "Home" ? 0 : V.duration(VE.P)); VE.tl.reveal(VE.t); return; }
		if (mod || e.altKey) return;
		var h = true;
		switch (k) {
			case " ": if (e.repeat) break; if (P.hover && !P.playing) P.spaceDown(); else P.toggle(); break;   // over the preview: hold Space and drag to move the view
			case "g": case "G": $("vd-vzguide").click(); break;
			case "k": case "K": P.pause(); break;
			case "<": case ",": if (k === "<" || e.shiftKey) P.stepSpeed(-1); else VE.stepFrame(-1); break;
			case ">": case ".": if (k === ">" || e.shiftKey) P.stepSpeed(1); else VE.stepFrame(1); break;
			case "ArrowUp": VE.goEdit(-1); break; case "ArrowDown": VE.goEdit(1); break;
			case "l": case "L": if (P.playing && !P.rev) P.play(Math.min(8, P.rate * 2)); else P.play(1); break;
			case "j": case "J": if (P.playing && P.rev) P.reverse(Math.min(8, P.rate * 2)); else P.reverse(1); break;
			case "ArrowLeft": VE.stepFrame(-1, e.shiftKey); break;
			case "ArrowRight": VE.stepFrame(1, e.shiftKey); break;
			case "Home": P.seek(0); VE.tl.reveal(0); break; case "End": P.seek(V.duration(VE.P)); VE.tl.reveal(VE.t); break;
			case "s": case "S": VE.split(); break;
			case "Delete": case "Backspace": VE.del(e.shiftKey); break;
			case "i": case "I": mark("in"); break; case "o": case "O": mark("out"); break;
			case "t": case "T": VE.addTitle(); break;
			case "f": case "F": if (e.shiftKey) $("vd-fs").click(); else setPv(!app.classList.contains("vd-pvfill")); break;
			case "+": case "=": VE.tl.zoom(VE.pps * 1.5); break; case "-": case "_": VE.tl.zoom(VE.pps / 1.5); break;
			case "w": case "W": setWin(!UI.win); break;
			case "Escape": if (P.picking()) P.cancelPick(); else if (app.classList.contains("vd-pvfill")) setPv(false); else if (UI.win) setWin(false); else { VE.sel = []; VE.emit("select"); } break;
			default: h = false;
		}
		if (h) e.preventDefault();
	});
	window.addEventListener("beforeunload", function (e) { if (exporting || VE.bin.some(function (m) { return m.state === "working" && m.status && /Convert/.test(m.status); })) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- separate video and audio ---------- */
	VE.separate = function (list) {
		var vids = (list || []).filter(function (c) { return c.type === "video" && VE.hasSound(c) && !(V.track(VE.P, c.track) || {}).lock; });
		if (!vids.length) { toast("Select a video clip that has sound first."); return; }
		var made = [];
		vids.forEach(function (c) { var a = V.separateAudio(VE.P, c.id, V.uid("c"), V.uid("L"), function () { return VE.addTrack("a"); }); if (a) made.push(a.id); });
		VE.sel = made; VE.commit("Separate video and audio");
		toast("The sound is now its own clip on an audio track, linked to the video: moving, trimming, splitting or deleting one does the other too (Alt + drag moves just one). Drag the bottom edge of the track to make the waveform taller.", 9000);
	};
	$("vd-sep").onclick = function () { VE.separate(VE.selected()); };
	function linkSection(c) {
		var h = "", parts = V.partners(VE.P, c);
		if (c.link && parts.length) {
			var o = parts[0], ot = V.track(VE.P, o.track);
			h += '<div class="vd-linkrow">&#128279; Linked to its ' + (o.type === "audio" ? "sound" : "video") + " on " + esc(ot ? ot.name : "another track") + '. Moving, trimming, splitting and deleting one does the other too (Alt + drag moves just this one).<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="unlink">Unlink</button>' +
				(c.type === "video" || o.type === "video" ? '<button type="button" class="vd-btn vd-sm" data-lk="join">Put the sound back into the video</button>' : "") + "</div></div>";
		} else if (c.type === "video" && c.noAudio) {
			h += '<div class="vd-linkrow">This clip plays no sound (it was separated).<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="sndon">Play its own sound again</button></div></div>';
		} else if (c.type === "video" && VE.hasSound(c)) {
			h += '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="sep" title="Ctrl+Shift+A">Separate video and audio</button></div>';
		}
		return h;
	}
	function bindLink(c) {
		insp.querySelectorAll("[data-lk]").forEach(function (b) {
			b.onclick = function () {
				var a = b.getAttribute("data-lk");
				if (a === "sep") VE.separate([c]);
				else if (a === "unlink") { V.unlink(VE.P, c.id); VE.commit("Unlink"); }
				else if (a === "join") { var v = V.joinAudio(VE.P, c.id); VE.sel = v ? [v.id] : []; VE.commit("Put the sound back"); }
				else if (a === "sndon") { c.noAudio = false; VE.commit("Sound on"); }
			};
		});
	}

	/* ---------- audio effects (properties) ---------- */
	var WINS = [[1, "Quick (1 s)"], [3, "Normal (3 s)"], [6, "Slow (6 s)"]], RATIOS = [1.5, 2, 3, 4, 6, 10];
	function fxSection(list) {
		var A = V.afxOf(list[0]), L = A.level, Cm = A.comp, D = A.duck;
		function chk(id, on, label) { return '<label><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "> " + label + "</label>"; }
		var h = '<div class="vd-sec"><b>Audio effects</b><p class="vd-sub">Worked out from the sound as you play and export; your files are not changed.</p>';
		h += '<div class="vd-fx' + (L.on ? " is-on" : "") + '">' + chk("vd-fx-lev", L.on, "Leveler (auto-level)") + '<p class="vd-sub">Brings quiet and loud parts to the same loudness over a few seconds.</p>' +
			(L.on ? '<div class="vd-grid">' + num("vd-fx-lt", "Target loudness", L.target, 1, -40, -6, "dB", "Average level (RMS, dBFS) the leveler aims for; -20 suits speech") + num("vd-fx-lu", "Most boost", L.maxUp, 1, 0, 30, "dB") + num("vd-fx-ld", "Most cut", L.maxDown, 1, 0, 30, "dB") +
				'<label class="vd-f"><span>Speed</span><select id="vd-fx-lw">' + WINS.map(function (w) { return '<option value="' + w[0] + '"' + (Math.abs(L.win - w[0]) < 1e-6 ? " selected" : "") + ">" + w[1] + "</option>"; }).join("") + "</select></label></div>" : "") + "</div>";
		h += '<div class="vd-fx' + (Cm.on ? " is-on" : "") + '">' + chk("vd-fx-cmp", Cm.on, "Compressor") + '<p class="vd-sub">Turns down the loudest moments (above the threshold) so peaks and shouts sit closer to the rest.</p>' +
			(Cm.on ? '<div class="vd-grid">' + num("vd-fx-ct", "Threshold", Cm.thr, 1, -60, 0, "dB") + '<label class="vd-f"><span>Ratio</span><select id="vd-fx-cr">' + RATIOS.map(function (r) { return '<option value="' + r + '"' + (Math.abs(Cm.ratio - r) < 1e-6 ? " selected" : "") + ">" + r + ":1</option>"; }).join("") + "</select></label>" +
				num("vd-fx-ca", "Attack", Math.round(Cm.att * 1000), 5, 10, 500, "ms") + num("vd-fx-cl", "Release", Math.round(Cm.rel * 1000), 10, 20, 3000, "ms") +
				'<label class="vd-f" title="Empty = automatic (' + V.compMakeup(Object.assign({}, Cm, { makeup: null }), L.on ? L.target : -18).toFixed(1) + ' dB)"><span>Make-up gain</span><input type="number" id="vd-fx-cm" step="0.5" min="-12" max="24" placeholder="auto ' + V.compMakeup(Object.assign({}, Cm, { makeup: null }), L.on ? L.target : -18).toFixed(1) + '" value="' + (Cm.makeup == null ? "" : Cm.makeup) + '"><em>dB</em></label></div>' : "") + "</div>";
		h += '<div class="vd-fx' + (D.on ? " is-on" : "") + '">' + chk("vd-fx-dk", D.on, "Ducking (lower it under other sound)") + '<p class="vd-sub">For music: it goes quieter by itself while another clip (a voice) is speaking.</p>' +
			(D.on ? '<div class="vd-grid">' + num("vd-fx-da", "Lower by", D.amt, 1, 1, 40, "dB") + num("vd-fx-dg", "Voice above", D.gate, 1, -70, -10, "dB", "Sound on other clips louder than this counts as speaking") + "</div>" : "") + "</div>";
		h += '<p class="vd-sub" id="vd-fx-st">' + fxStatus(list) + "</p></div>";
		return h;
	}
	function fxStatus(list) {
		if (!list.some(V.afxOn)) return "";
		var wait = list.some(function (c) { return V.afxOn(c) && !VE.levelsFor(c); });
		return wait ? "Analysing the sound..." : "Effects on: they play in the preview and go into the export. The waveform shows the result (bright) over the original (faint).";
	}
	function bindFx(list) {
		function set(group, patch, label) {
			list.forEach(function (c) { var A = V.afxOf(c); c.afx = c.afx || {}; c.afx[group] = Object.assign(A[group], patch); });
			VE.commit(label);
		}
		function on(id, fn) { var el = $(id); if (el) el.addEventListener("change", function () { fn(el); }); }
		function n(el) { return parseFloat(el.value); }
		on("vd-fx-lev", function (el) { set("level", { on: el.checked }, el.checked ? "Leveler on" : "Leveler off"); });
		on("vd-fx-lt", function (el) { if (isFinite(n(el))) set("level", { target: V.clamp(n(el), -40, -6) }, "Leveler target"); });
		on("vd-fx-lu", function (el) { if (isFinite(n(el))) set("level", { maxUp: V.clamp(n(el), 0, 30) }, "Leveler boost"); });
		on("vd-fx-ld", function (el) { if (isFinite(n(el))) set("level", { maxDown: V.clamp(n(el), 0, 30) }, "Leveler cut"); });
		on("vd-fx-lw", function (el) { set("level", { win: +el.value }, "Leveler speed"); });
		on("vd-fx-cmp", function (el) { set("comp", { on: el.checked }, el.checked ? "Compressor on" : "Compressor off"); });
		on("vd-fx-ct", function (el) { if (isFinite(n(el))) set("comp", { thr: V.clamp(n(el), -60, 0) }, "Compressor threshold"); });
		on("vd-fx-cr", function (el) { set("comp", { ratio: +el.value }, "Compressor ratio"); });
		on("vd-fx-ca", function (el) { if (isFinite(n(el))) set("comp", { att: V.clamp(n(el), 10, 500) / 1000 }, "Compressor attack"); });
		on("vd-fx-cl", function (el) { if (isFinite(n(el))) set("comp", { rel: V.clamp(n(el), 20, 3000) / 1000 }, "Compressor release"); });
		on("vd-fx-cm", function (el) { set("comp", { makeup: el.value === "" || !isFinite(n(el)) ? null : V.clamp(n(el), -12, 24) }, "Make-up gain"); });
		on("vd-fx-dk", function (el) { set("duck", { on: el.checked }, el.checked ? "Ducking on" : "Ducking off"); });
		on("vd-fx-da", function (el) { if (isFinite(n(el))) set("duck", { amt: V.clamp(n(el), 1, 40) }, "Ducking amount"); });
		on("vd-fx-dg", function (el) { if (isFinite(n(el))) set("duck", { gate: V.clamp(n(el), -70, -10) }, "Ducking voice level"); });
	}
	// work out the sound levels the effects need, then redraw the waveforms and update the preview
	var fxRun = null, fxAgain = false;
	function fxKick() {
		var need = VE.P.clips.some(function (c) { return VE.hasSound(c) && V.afxOn(c) && !VE.levelsFor(c); }) || (VE.P.clips.some(function (c) { return VE.hasSound(c) && c.afx && c.afx.duck && c.afx.duck.on; }) && VE.P.clips.some(function (c) { return VE.hasSound(c) && !VE.levelsFor(c); }));
		if (!need) return;
		if (fxRun) { fxAgain = true; return; }
		fxRun = VE.ensureAllFx(function (x) { var e = $("vd-fx-st"); if (e) e.textContent = "Analysing the sound... " + Math.round(x * 100) + "%"; }).then(function () {
			fxRun = null; var e = $("vd-fx-st"); if (e) e.textContent = fxStatus(VE.selected());
			if (fxAgain) { fxAgain = false; fxKick(); }
		});
	}
	var lvT = 0;
	VE.on("levels", function () { clearTimeout(lvT); lvT = setTimeout(function () { VE.tl.render(); VE.preview.sync(); }, 150); });
	VE.on("change", fxKick); VE.on("mediaReady", fxKick);

	/* ---------- canvas size ---------- */
	// size of the first video or picture on the timeline (else in the media list), even numbers
	function firstClipSize() {
		var cs = VE.P.clips.filter(function (c) { return c.type === "video" || c.type === "image"; }).sort(function (a, b) { return a.start - b.start; }), m = null;
		for (var j = 0; j < cs.length && !m; j++) { var q = VE.media(cs[j].media); if (q && q.w) m = q; }
		if (!m) m = VE.bin.filter(function (q) { return (q.kind === "video" || q.kind === "image") && q.w; })[0];
		return m ? { w: V.clamp(Math.round(m.w / 2) * 2, 16, 7680), h: V.clamp(Math.round(m.h / 2) * 2, 16, 4320), name: m.name } : null;
	}
	VE.on("mediaReady", function () { renderCvs(); });
	VE.setCanvas = function (w, h) { VE.P.w = V.clamp(Math.round(w / 2) * 2, 16, 7680); VE.P.h = V.clamp(Math.round(h / 2) * 2, 16, 4320); VE.commit("Canvas size"); };
	function renderCvs() {
		var sel = $("vd-cvsize"), pre = V.presetOf(VE.P.w, VE.P.h);
		var groups = [], first = firstClipSize();
		V.CANVAS_PRESETS.forEach(function (o) { var g = groups.filter(function (x) { return x.n === o[2]; })[0]; if (!g) groups.push(g = { n: o[2], o: [] }); g.o.push(o); });
		sel.innerHTML = groups.map(function (g) { return '<optgroup label="' + esc(g.n) + '">' + g.o.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</optgroup>"; }).join("") +
			'<optgroup label="Other">' + (pre === "custom" ? '<option value="cur">' + VE.P.w + "×" + VE.P.h + " (custom)</option>" : "") + (first ? '<option value="match">Match first clip (' + first.w + "×" + first.h + ")</option>" : '<option value="match" disabled>Match first clip (add a video or picture first)</option>') + '<option value="custom">Custom size&hellip;</option></optgroup>';
		sel.value = pre === "custom" ? "cur" : pre;
	}
	$("vd-cvsize").onchange = function () {
		var v = this.value;
		if (v === "cur") return;
		if (v === "match") { var f = firstClipSize(); if (f) { VE.setCanvas(f.w, f.h); toast("The canvas is now " + f.w + "×" + f.h + ", like " + f.name + "."); } renderCvs(); return; }
		if (v === "custom") { var r = V.parseSize(window.prompt("Canvas size in pixels, width × height (for example 1280x720):", VE.P.w + "x" + VE.P.h)); if (r) VE.setCanvas(r.w, r.h); else { toast("Type it as width x height, for example 1280x720 (16 to 7680 by 16 to 4320)."); } renderCvs(); return; }
		var q = V.parseSize(v); if (q) VE.setCanvas(q.w, q.h);
	};
	VE.on("change", renderCvs);

	/* ---------- preview filling the window ---------- */
	var pvT = 0;
	function setPv(on) {
		app.classList.toggle("vd-pvfill", on); document.documentElement.classList.toggle("vd-noscroll", on || UI.win);
		$("vd-pvwin").setAttribute("aria-pressed", on); $("vd-pvwin").innerHTML = on ? "&#10006; Leave" : "&#10530; Fill window";
		setTimeout(function () { P.fit(); }, 30);
		if (on) toast("The preview fills the window. Space plays, Esc leaves.", 3000);
	}
	$("vd-pvwin").onclick = function () { setPv(!app.classList.contains("vd-pvfill")); };
	app.querySelector(".vd-center").addEventListener("pointermove", function () { if (!app.classList.contains("vd-pvfill")) return; app.classList.add("vd-pvshow"); clearTimeout(pvT); pvT = setTimeout(function () { app.classList.remove("vd-pvshow"); }, 2200); });

	/* ---------- layout: library rail, panel widths, timeline height ---------- */
	function applyLayout() {
		app.style.setProperty("--vd-lw", V.clamp(UI.lw || 250, 170, 560) + "px"); app.style.setProperty("--vd-rw", V.clamp(UI.rw || 290, 200, 600) + "px");
		if (UI.tlh) app.style.setProperty("--vd-tlh", UI.tlh + "px"); else app.style.removeProperty("--vd-tlh");
		app.classList.toggle("vd-noleft", !!UI.noLeft); app.classList.toggle("vd-noright", !!UI.noRight);
		$("vd-tgl-left").setAttribute("aria-pressed", !UI.noLeft); $("vd-tgl-right").setAttribute("aria-pressed", !UI.noRight);
		var cat = UI.cat || "media";
		app.querySelectorAll("#vd-rail [data-cat]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-cat") === cat && !UI.noLeft); });
		app.querySelectorAll("#vd-left [data-pane]").forEach(function (s) { s.hidden = s.getAttribute("data-pane") !== cat; });
	}
	function relayout() { applyLayout(); saveUI(); setTimeout(function () { P.fit(); VE.tl.render(); }, 20); }
	$("vd-rail").addEventListener("click", function (e) {
		var b = e.target.closest("[data-cat]"); if (!b) return; var c = b.getAttribute("data-cat");
		if (c === (UI.cat || "media") && !UI.noLeft) UI.noLeft = true; else { UI.cat = c; UI.noLeft = false; }
		relayout();
	});
	$("vd-rail").addEventListener("keydown", function (e) {
		if (!/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.key)) return;
		var bs = [].slice.call(this.querySelectorAll("[data-cat]")), i = bs.indexOf(document.activeElement); if (i < 0) return;
		var j = (i + (/Down|Right/.test(e.key) ? 1 : -1) + bs.length) % bs.length; bs[j].focus(); UI.cat = bs[j].getAttribute("data-cat"); UI.noLeft = false; relayout(); e.preventDefault(); e.stopPropagation();
	});
	$("vd-tgl-left").onclick = function () { UI.noLeft = !UI.noLeft; relayout(); };
	$("vd-tgl-right").onclick = function () { UI.noRight = !UI.noRight; relayout(); };
	// a draggable divider: get() = size now, set(v) = new size (px), step for the arrow keys, reset on double-click
	function grip(el, axis, get, set, reset) {
		var d = null;
		el.addEventListener("pointerdown", function (e) { if (e.button > 0) return; d = { p: axis === "x" ? e.clientX : e.clientY, v: get() }; el.setPointerCapture(e.pointerId); el.classList.add("is-on"); e.preventDefault(); });
		el.addEventListener("pointermove", function (e) { if (!d) return; set(d.v, (axis === "x" ? e.clientX : e.clientY) - d.p); applyLayout(); });
		function up() { if (!d) return; d = null; el.classList.remove("is-on"); relayout(); }
		el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
		el.addEventListener("dblclick", function () { reset(); relayout(); });
		el.addEventListener("keydown", function (e) { var k = e.key, s = e.shiftKey ? 64 : 16, dd = { ArrowLeft: -s, ArrowRight: s, ArrowUp: -s, ArrowDown: s }[k]; if (dd == null) return; set(get(), dd); relayout(); e.preventDefault(); e.stopPropagation(); });
	}
	grip($("vd-lgrip"), "x", function () { return UI.lw || 250; }, function (v, dx) { UI.lw = V.clamp(Math.round(v + dx), 170, 560); }, function () { delete UI.lw; });
	grip($("vd-rgrip"), "x", function () { return UI.rw || 290; }, function (v, dx) { UI.rw = V.clamp(Math.round(v - dx), 200, 600); }, function () { delete UI.rw; });
	grip($("vd-tlgrip"), "y", function () { return UI.tlh || Math.round($("vd-tl").getBoundingClientRect().height); }, function (v, dy) {
		var max = Math.max(160, (app.clientHeight || 800) - 240); if (window.matchMedia("(max-width:900px)").matches && !UI.win) max = 1200;
		UI.tlh = V.clamp(Math.round(v - dy), 80, max);
	}, function () { delete UI.tlh; });

	/* ---------- waveform scale ---------- */
	VE.tl.wave = UI.wave || "db";
	function waveBtn() { $("vd-wavemode").textContent = "Waveform: " + (VE.tl.wave === "db" ? "dB" : "linear"); }
	$("vd-wavemode").onclick = function () { VE.tl.wave = UI.wave = VE.tl.wave === "db" ? "lin" : "db"; saveUI(); waveBtn(); VE.tl.render(); };
	waveBtn();

	/* ---------- library cards: titles, transitions, audio and visual effects ---------- */
	var TITLES = [
		{ id: "title", name: "Title", desc: "Text in a box", y: 0.82, text: {} },
		{ id: "headline", name: "Big headline", desc: "Large, outlined, no box", y: 0.45, text: { s: "Big headline", size: 0.14, bgOn: false, outline: 1.5 } },
		{ id: "lower", name: "Lower third", desc: "Name and role", x: 0.24, y: 0.84, text: { s: "Your Name\nWhat you do", size: 0.05, align: "left", bg: "#0f172a", bgOp: 0.82 } },
		{ id: "caption", name: "Caption", desc: "A subtitle line", y: 0.9, text: { s: "Caption text", size: 0.048, bold: false, bgOp: 0.6 } },
		{ id: "callout", name: "Callout", desc: "Coloured note", x: 0.76, y: 0.2, text: { s: "Look here!", size: 0.06, bg: "#e11d48", bgOp: 0.95 } },
		{ id: "step", name: "Step label", desc: "Top left corner", x: 0.14, y: 0.1, text: { s: "Step 1", size: 0.055, bg: "#1d4ed8", bgOp: 0.95 } },
		{ id: "end", name: "End card", desc: "Centred, 5 s", y: 0.5, dur: 5, text: { s: "Thanks for watching!\nmes.fm", size: 0.08, bgOp: 0.7 } }
	];
	var ANIM_ICO = { zoomin: "&#8853;", zoomout: "&#8854;", zoompan: "&#11034;", "slidein-l": "&#8680;", "slidein-r": "&#8678;", "slidein-b": "&#8679;", "slideout-l": "&#8678;", "slideout-r": "&#8680;", fadein: "&#9680;", fadeout: "&#9681;", scaleup: "&#10530;", scaledown: "&#10529;", popin: "&#10040;", spin: "&#10227;", tilt: "&#8635;", custom: "&#10148;" };
	var CARDS = {
		titles: TITLES.map(function (t) { return { id: t.id, name: t.name, desc: t.desc, title: t }; }),
		trans: [
			{ id: "fin", ico: "&#9698;", name: "Fade in", desc: "From black / silence" }, { id: "fout", ico: "&#9699;", name: "Fade out", desc: "To black / silence" },
			{ id: "fboth", ico: "&#9670;", name: "Fade in and out", desc: "Both ends" }, { id: "xfade", ico: "&#10697;", name: "Cross-fade", desc: "From the clip right before" },
			{ id: "nofade", ico: "&#9634;", name: "No fades", desc: "Remove fades and cross-fades" }
		],
		afx: [
			{ id: "voice", ico: "&#127897;", name: "Even out a voice", desc: "Leveler + compressor", snd: 1 }, { id: "level", ico: "&#8660;", name: "Leveler", desc: "Auto-level over time", snd: 1 },
			{ id: "comp", ico: "&#9636;", name: "Compressor", desc: "Tames the loud peaks", snd: 1 }, { id: "noise", ico: "&#10024;", name: "Remove noise", desc: "Hum, hiss, room noise (AI)", snd: 1 },
			{ id: "duck", ico: "&#127925;", name: "Ducking", desc: "Music dips under a voice", snd: 1 }, { id: "norm", ico: "&#128266;", name: "Normalize loudness", desc: "To -16 LUFS (or your choice)", snd: 1 },
			{ id: "afin", ico: "&#9698;", name: "Fade in", desc: "Sound and picture", snd: 1 }, { id: "afout", ico: "&#9699;", name: "Fade out", desc: "Sound and picture", snd: 1 },
			{ id: "sep", ico: "&#9986;", name: "Separate video and audio", desc: "Sound on its own track" }, { id: "off", ico: "&#10006;", name: "Remove audio effects", desc: "Leveler, compressor, ducking", snd: 1 }
		],
		vfx: [
			{ id: "fit", ico: "&#9634;", name: "Fit the frame", desc: "Whole picture, bars if needed" }, { id: "fill", ico: "&#9635;", name: "Fill the frame", desc: "No bars, edges cut" },
			{ id: "pip", ico: "&#9703;", name: "Picture in picture", desc: "Small, bottom right" }, { id: "pipl", ico: "&#9702;", name: "Picture in picture", desc: "Small, bottom left" },
			{ id: "centre", ico: "&#10753;", name: "Centre", desc: "Back to the middle" }, { id: "half", ico: "&#9681;", name: "Half see-through", desc: "Opacity 50%" },
			{ id: "solid", ico: "&#9679;", name: "Solid", desc: "Opacity 100%" }, { id: "nocrop", ico: "&#8862;", name: "Reset crop", desc: "Show it all again" }
		],
		anim: V.ANIM_PRESETS.map(function (q) { return { id: q.id, name: q.name, desc: q.desc, ico: ANIM_ICO[q.id] || "&#10148;" }; })
	};
	function cardHtml(cat, c) {
		var vis = cat === "titles" ? '<span style="font:' + (c.title.text.bold === false ? "400" : "700") + " " + Math.round(10 + (c.title.text.size || 0.09) * 70) + "px Arial,sans-serif;color:#fff;padding:0 0.3em;border-radius:3px;" + (c.title.text.bgOn === false ? "text-shadow:0 0 3px #000,0 0 1px #000;" : "background:" + (c.title.text.bg || "#000") + ";") + '">' + esc(c.name.split(" ")[0]) + "</span>" : c.ico;
		return '<button type="button" class="vd-card" data-card="' + cat + ":" + c.id + '" title="' + esc(c.desc) + '"><span class="vd-cv" aria-hidden="true">' + vis + "</span><b>" + esc(c.name) + "</b><small>" + esc(c.desc) + "</small></button>";
	}
	app.querySelectorAll("[data-cards]").forEach(function (box) { var cat = box.getAttribute("data-cards"); box.innerHTML = CARDS[cat].map(function (c) { return cardHtml(cat, c); }).join(""); });
	var trd = $("vd-trdur"); trd.value = String(UI.trDur || 1); trd.onchange = function () { UI.trDur = +trd.value; saveUI(); };
	function cardOf(key) { var k = key.split(":"); return { cat: k[0], c: CARDS[k[0]].filter(function (x) { return x.id === k[1]; })[0] }; }
	// use a card on clips (the selected ones, or the clip it was dropped on); a title card makes a title (at the drop place)
	function applyCard(key, clips, drop) {
		var q = cardOf(key), cat = q.cat, cd = q.c; if (!cd) return;
		if (cat === "titles") { VE.addTitle(cd.title, drop ? drop.t : null, drop ? drop.track : null); return; }
		if (cat === "anim") {
			var tgt = (clips || VE.selected()).filter(function (c) { var tr = V.track(VE.P, c.track); return c.type !== "audio" && !(tr && tr.lock); })[0];
			if (!tgt) { toast("Select a video, picture or title first (or drag the animation onto one)."); return; }
			VE.addAnim(cd.id, tgt, drop && drop.t != null ? drop.t : null); return;
		}
		var list = (clips || VE.selected()).filter(function (c) { var tr = V.track(VE.P, c.track); return !(tr && tr.lock); });
		if (cd.snd) list = list.filter(VE.hasSound);
		if (cat === "vfx") list = list.filter(function (c) { return c.type !== "audio"; });
		if (cd.id === "sep") { VE.separate(list); return; }
		if (!list.length) { toast(cd.snd ? "Select a clip with sound first (or drag the card onto one)." : cat === "vfx" ? "Select a video, picture or title first (or drag the card onto one)." : "Select a clip first (or drag the card onto one)."); return; }
		VE.sel = list.map(function (c) { return c.id; }); VE.emit("select");
		var d = UI.trDur || 1;
		function fx(c, g, patch) { var A = V.afxOf(c); c.afx = c.afx || {}; c.afx[g] = Object.assign(A[g], patch); }
		if (cd.id === "noise") { denoise(list); return; }
		if (cd.id === "norm") { normalize(list); return; }
		list.forEach(function (c) {
			var len = V.dur(c), m = VE.media(c.media);
			switch (cd.id) {
				case "fin": case "afin": c.fin = Math.min(d, len); break;
				case "fout": case "afout": c.fout = Math.min(d, len); break;
				case "fboth": c.fin = Math.min(d, len / 2); c.fout = Math.min(d, len / 2); break;
				case "xfade": var pv = V.prevTouching(VE.P, c); if (pv) c.xin = Math.min(d, V.dur(pv), len); break;
				case "nofade": c.fin = 0; c.fout = 0; c.xin = 0; break;
				case "voice": fx(c, "level", { on: true, target: -20 }); fx(c, "comp", { on: true, thr: -26, ratio: 3 }); break;
				case "level": fx(c, "level", { on: true }); break;
				case "comp": fx(c, "comp", { on: true }); break;
				case "duck": fx(c, "duck", { on: true }); break;
				case "off": c.afx = null; break;
				case "fit": c.scale = 1; c.x = 0.5; c.y = 0.5; break;
				case "fill": if (m && m.w) { c.scale = Math.max(VE.P.w / m.w, VE.P.h / m.h) / Math.min(VE.P.w / m.w, VE.P.h / m.h); c.x = 0.5; c.y = 0.5; } break;
				case "pip": c.scale = 0.3; c.x = 0.82; c.y = 0.8; break;
				case "pipl": c.scale = 0.3; c.x = 0.18; c.y = 0.8; break;
				case "centre": c.x = 0.5; c.y = 0.5; break;
				case "half": c.op = 0.5; break; case "solid": c.op = 1; break;
				case "nocrop": c.crop = { l: 0, t: 0, r: 0, b: 0 }; break;
			}
		});
		if (cd.id === "xfade" && !list.some(function (c) { return c.xin > 0; })) toast("A cross-fade needs the clip to start right where another clip on its track ends.");
		VE.commit(cd.name);
		if (cd.snd && cd.id !== "off" && !/^af/.test(cd.id)) { if (UI.noRight) { UI.noRight = false; relayout(); } toast(cd.name + " is on for " + list.length + " clip" + (list.length > 1 ? "s" : "") + ". Change its settings in the properties on the right.", 5000); }
	}
	var cdrag = null;
	app.addEventListener("pointerdown", function (e) {
		var cb = e.target.closest(".vd-card"); if (!cb || e.button > 0) return;
		cdrag = { key: cb.getAttribute("data-card"), x: e.clientX, y: e.clientY, on: false, id: e.pointerId }; e.preventDefault(); cb.focus();
	});
	document.addEventListener("pointermove", function (e) {
		if (!cdrag || e.pointerId !== cdrag.id) return;
		if (!cdrag.on && Math.hypot(e.clientX - cdrag.x, e.clientY - cdrag.y) < 6) return;
		if (!cdrag.on) { cdrag.on = true; var g = cdrag.ghost = document.createElement("div"); g.className = "vd-ghost"; g.textContent = cardOf(cdrag.key).c.name; app.appendChild(g); }
		cdrag.ghost.style.left = e.clientX + 12 + "px"; cdrag.ghost.style.top = e.clientY + 8 + "px";
		var el = document.elementFromPoint(e.clientX, e.clientY), ce = el && el.closest && el.closest(".vd-clip");
		app.querySelectorAll(".vd-clip.is-target").forEach(function (x) { if (x !== ce) x.classList.remove("is-target"); }); if (ce) ce.classList.add("is-target");
		VE.tl.dragHint(e.clientX, e.clientY, cdrag.key.indexOf("titles:") === 0 && VE.tl.inside(e.clientX, e.clientY));
	});
	document.addEventListener("pointerup", function (e) {
		if (!cdrag || e.pointerId !== cdrag.id) return;
		var d = cdrag; cdrag = null; if (d.ghost) d.ghost.remove(); VE.tl.dragHint(null, null, false);
		app.querySelectorAll(".vd-clip.is-target").forEach(function (x) { x.classList.remove("is-target"); });
		if (!d.on) { applyCard(d.key); return; }
		var el = document.elementFromPoint(e.clientX, e.clientY), ce = el && el.closest && el.closest(".vd-clip");
		if (d.key.indexOf("titles:") === 0) { if (VE.tl.inside(e.clientX, e.clientY)) { var row = el && el.closest && el.closest(".vd-trow"); applyCard(d.key, null, { t: VE.tl.x2t(e.clientX), track: row ? row.getAttribute("data-track") : null }); } return; }
		if (ce) { var c = V.clip(VE.P, ce.getAttribute("data-id")); if (c) applyCard(d.key, [c], d.key.indexOf("anim:") === 0 ? { t: VE.tl.x2t(e.clientX) } : null); }
	});
	app.addEventListener("keydown", function (e) { var cb = e.target.closest && e.target.closest(".vd-card"); if (cb && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); applyCard(cb.getAttribute("data-card")); } }, true);
	applyLayout();

	/* ---------- animations ---------- */
	var ad = $("vd-andur"), ae = $("vd-anease");
	ae.innerHTML = V.EASES.map(function (q) { return '<option value="' + q[0] + '">' + q[1] + "</option>"; }).join("");
	ad.value = String(UI.anDur || 1); ae.value = UI.anEase || "inout";
	ad.onchange = function () { UI.anDur = +ad.value; saveUI(); }; ae.onchange = function () { UI.anEase = ae.value; saveUI(); };
	var measure = document.createElement("canvas").getContext("2d"), anStop = null;
	VE.on("time", function () { if (anStop != null && P.playing && VE.t >= anStop) { anStop = null; P.pause(); } });
	VE.on("pause", function () { anStop = null; });
	function posOf(s) { return { x: s.x, y: s.y, scale: s.scale, rot: s.rot, op: s.op, crop: { l: s.cl, t: s.ct, r: s.cr, b: s.cb } }; }
	// add preset id to clip c (at timeline time "at", else the playhead); zoom-n-pan first asks for a box on the preview. Then it plays the new
	// animation once (custom / zoom-n-pan leave the playhead at its end instead, ready to drag the clip there)
	VE.addAnim = function (id, c, at) {
		var pre = V.animPreset(id); if (!pre || !c) return;
		var len = V.dur(c), d = UI.anDur || 1, here = (at != null ? at : VE.t) - c.start, slot = V.animSlot(pre.at, here, d, len);
		VE.sel = [c.id]; VE.emit("select");
		function make(rect) {
			var s = V.stateAt(c, slot.t), r = VE.rectOf(measure, c, VE.P.w, VE.P.h, posOf(s)), vals = V.animValues(id, s, r ? { w: r.dw, h: r.dh } : null, VE.P.w, VE.P.h, { rect: rect });
			if (!vals) return;
			var a = { id: V.uid("a"), t: slot.t, d: slot.d, ease: UI.anEase || "inout", kind: id }; if (vals.to) a.to = vals.to; if (vals.from) a.from = vals.from;
			c.anims = V.cleanAnims((c.anims || []).concat([a])); VE.animSel = a.id;
			VE.commit("Animation: " + V.animName(a));
			if (id === "custom" || id === "zoompan") { P.seek(Math.min(V.end(c) - 1e-3, c.start + slot.t + slot.d)); toast(id === "custom" ? "The playhead is at the end of the new animation: drag the clip in the preview (a corner resizes, the round handle turns it) to where it should end up." : "Zoom-n-pan added. The playhead is at its end: drag or resize the clip in the preview to fine-tune the framing.", 7000); }
			else { P.seek(c.start + slot.t); anStop = c.start + slot.t + slot.d + 0.3; P.play(1); }
		}
		if (pre.rect) {
			if (P.picking()) return;
			P.seek(c.start + slot.t); toast("Drag a box on the preview over the part to zoom to. Esc cancels.", 6000);
			P.pickRect(function (r) { if (r) make(r); });
		} else make(null);
	};
	function animSection(c) {
		var L = (c.anims || []).slice().sort(function (a, b) { return a.t - b.t; }), rel = VE.t - c.start, tol = 0.5 / VE.P.fps;
		var h = '<div class="vd-sec"><b>Animations</b>';
		if (!L.length) return h + '<p class="vd-sub">None yet. Open <i>Animations</i> in the library on the left: zoom in, zoom-n-pan, slide in, fade, spin&hellip;</p><div class="vd-row"><button type="button" class="vd-btn vd-sm" data-an-open>Show the animations</button></div></div>';
		var NAMES = { x: "left/right", y: "up/down", scale: "size", rot: "turn", op: "opacity", cl: "crop left", ct: "crop top", cr: "crop right", cb: "crop bottom" };
		L.forEach(function (a) {
			var at = Math.abs(rel - (a.t + a.d)) <= tol ? "end" : Math.abs(rel - a.t) <= tol ? "start" : rel > a.t && rel < a.t + a.d ? "in" : "", keys = Object.keys(a.to || {});
			h += '<div class="vd-an' + (VE.animSel === a.id ? " is-sel" : "") + '" data-aid="' + esc(a.id) + '"><div class="vd-anh"><b>' + esc(V.animName(a)) + '</b><small>' + (at === "end" ? "playhead at its end" : at === "start" ? "playhead at its start" : at === "in" ? "playhead inside it" : "") + '</small><span class="vd-sp"></span><button type="button" class="vd-btn vd-sm vd-ico" data-anact="start" title="Playhead to its start" aria-label="Playhead to its start">&#8676;</button><button type="button" class="vd-btn vd-sm vd-ico" data-anact="end" title="Playhead to its end (then drag the clip in the preview to change where it ends up)" aria-label="Playhead to its end">&#8677;</button><button type="button" class="vd-btn vd-sm vd-ico" data-anact="del" title="Delete this animation" aria-label="Delete this animation">&times;</button></div>' +
				'<div class="vd-grid">' + num("vd-an-t-" + a.id, "Starts", Math.round(a.t * 100) / 100, 0.05, null, null, "s", "Seconds after the clip starts") + num("vd-an-d-" + a.id, "Takes", Math.round(a.d * 100) / 100, 0.05, 0.05, 600, "s") +
				'<label class="vd-f vd-wide"><span>Easing</span><select data-anease aria-label="Easing">' + V.EASES.map(function (q) { return '<option value="' + q[0] + '"' + (a.ease === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + "</select></label></div>" +
				(keys.length ? '<p class="vd-sub">Ends with ' + keys.map(function (k) { var v = a.to[k]; return NAMES[k] + " " + (k === "rot" ? Math.round(v * 10) / 10 + "°" : Math.round(v * 1000) / 10 + "%"); }).join(", ") + ".</p>" : "") +
				(a.from ? '<p class="vd-sub">Starts from ' + Object.keys(a.from).map(function (k) { var v = a.from[k]; return k === "op" ? "opacity " + Math.round(v * 100) + "%" : k === "x" ? (v < 0.5 ? "off the left" : "off the right") : k === "y" ? (v > 0.5 ? "below the frame" : "above the frame") : k === "scale" ? "tiny" : NAMES[k]; }).join(", ") + ".</p>" : "") + "</div>";
		});
		return h + '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-an-open>+ Add an animation</button><button type="button" class="vd-btn vd-sm" data-an-clear>Remove all</button></div></div>';
	}
	function bindAnims(c) {
		insp.querySelectorAll("[data-an-open]").forEach(function (b) { b.onclick = function () { UI.cat = "anim"; UI.noLeft = false; relayout(); }; });
		var cl = insp.querySelector("[data-an-clear]"); if (cl) cl.onclick = function () { c.anims = null; VE.animSel = null; VE.commit("Remove animations"); };
		insp.querySelectorAll(".vd-an").forEach(function (box) {
			var id = box.getAttribute("data-aid"), a = (c.anims || []).filter(function (x) { return x.id === id; })[0]; if (!a) return;
			box.addEventListener("focusin", function () { if (VE.animSel !== id) { VE.animSel = id; insp.querySelectorAll(".vd-an").forEach(function (x) { x.classList.toggle("is-sel", x === box); }); VE.tl.markSel(); } });
			box.querySelectorAll("[data-anact]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-anact"); VE.animSel = id; if (k === "del") { c.anims = V.cleanAnims(c.anims.filter(function (x) { return x !== a; })); VE.animSel = null; VE.commit("Delete animation"); } else { P.seek(Math.min(V.end(c) - 1e-3, Math.max(c.start, c.start + a.t + (k === "end" ? a.d : 0)))); renderInsp(); VE.tl.markSel(); } }; });
			var ti = $("vd-an-t-" + id), di = $("vd-an-d-" + id), es = box.querySelector("[data-anease]");
			if (ti) ti.onchange = function () { var v = parseFloat(ti.value); if (!isFinite(v)) return renderInsp(); a.t = V.clamp(v, -a.d + 0.02, V.dur(c)); c.anims = V.cleanAnims(c.anims); VE.commit("Animation timing"); };
			if (di) di.onchange = function () { var v = parseFloat(di.value); if (!isFinite(v)) return renderInsp(); a.d = V.clamp(v, 0.05, 600); VE.commit("Animation length"); };
			if (es) es.onchange = function () { a.ease = es.value; VE.commit("Easing"); };
		});
	}

	/* ---------- preview zoom ---------- */
	var vzs = $("vd-vzsel");
	function vzRender() {
		var v = P.view(), opts = V.ZOOM_STEPS.map(function (z) { return z * 100; }), cur = v.pct, near = opts.filter(function (z) { return Math.abs(z - cur) < 0.6; })[0];
		var html = '<option value="fit">Fit' + (v.fit ? " (" + Math.round(cur) + "%)" : "") + "</option>" + (!v.fit && near == null ? '<option value="cur">' + Math.round(cur) + "%</option>" : "") + opts.map(function (z) { return '<option value="' + z + '">' + Math.round(z) + "%</option>"; }).join("");
		if (vzs.getAttribute("data-h") !== html) { vzs.innerHTML = html; vzs.setAttribute("data-h", html); }
		vzs.value = v.fit ? "fit" : near != null ? String(near) : "cur";
		$("vd-vzfit").setAttribute("aria-pressed", v.fit); $("vd-vzguide").setAttribute("aria-pressed", P.guides()); $("vd-vzdim").setAttribute("aria-pressed", P.dimOutside());
	}
	var vzLast = "";
	VE.on("view", function () { var v = P.view(), k = v.fit + "|" + v.pct; if (k !== vzLast) { vzLast = k; vzRender(); } });
	vzs.onchange = function () { if (vzs.value === "fit") P.zoomFit(); else if (vzs.value !== "cur") P.zoomTo(+vzs.value); };
	$("vd-vzfit").onclick = function () { P.zoomFit(); };
	$("vd-vzin").onclick = function () { P.zoomStep(1); }; $("vd-vzout").onclick = function () { P.zoomStep(-1); };
	$("vd-vzguide").onclick = function () { P.guides(!P.guides()); vzRender(); };
	$("vd-vzdim").onclick = function () { P.dimOutside(!P.dimOutside()); vzRender(); };
	vzRender();

	/* ---------- start ---------- */
	VE.hist.push(JSON.stringify(VE.P));
	VE.restore().then(function (had) {
		renderBin(); renderInsp(); updateButtons(); VE.tl.render(); VE.preview.fit(); timeText();
		if (had) { toast("Your last project is back."); setTimeout(function () { if (V.duration(VE.P)) VE.tl.fit(); }, 400); }
	});
	window.MESVideoEditor = VE;   // for testing from the console
})();
