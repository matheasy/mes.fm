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

/* MES YouTube Audio Analyzer: pure maths (window.MESYA; node: require('./lib.js')). No DOM here.
 *
 * MESYA.parseLink(text)        -> what a pasted link is (YouTube, 3Speak, Rumble, Odysee, BitChute, X, Substack, a direct media file ...),
 *                                 with the site's own embed player address where the site offers one.
 * new MESYA.Analyzer(sr, nch)  -> a STREAMING analyzer: feed(channels) any number of times (a decoded file in chunks, or live tab audio),
 *                                 then summary() / series. Everything the page draws comes from what it keeps, so the raw audio never has
 *                                 to stay in memory: loudness per 100 ms (ITU-R BS.1770-4 K-weighting, EBU R128 gating, LRA per EBU Tech 3342),
 *                                 true peak (4x oversampling), sample peaks per 10 ms for the waveform, plain RMS per 100 ms, clipping,
 *                                 DC offset, stereo correlation / balance, a log-frequency spectrogram and the long-term average spectrum.
 * MESYA.silences(...)          -> quiet stretches from the 100 ms RMS series, MESYA.loudest(...) -> the loudest moments,
 * MESYA.targets(lufs, tp)      -> what YouTube / Spotify / Apple / podcasts / broadcast would do to this loudness.
 */
(function (root) {
	"use strict";
	var Y = {};
	var LOG10 = Math.log(10);
	function db(x) { return x > 0 ? 20 * Math.log(x) / LOG10 : -Infinity; }
	function pdb(p) { return p > 0 ? 10 * Math.log(p) / LOG10 : -Infinity; }
	Y.db = db; Y.pdb = pdb;

	/* ---------- links ---------- */
	var MEDIA = /\.(mp3|m4a|aac|wav|wave|flac|ogg|oga|opus|weba|mp4|m4v|webm|mov|mkv|3gp)$/i;
	function tParam(v) {
		if (!v) return 0; v = String(v).toLowerCase();
		if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(+v);
		var m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/); if (!m || !m[0]) return 0;
		return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
	}
	Y.tParam = tParam;
	Y.SITES = {
		youtube: "YouTube", "3speak": "3Speak", rumble: "Rumble", odysee: "Odysee", bitchute: "BitChute", x: "X", substack: "Substack",
		direct: "Media file", other: "Web page"
	};
	/* -> {ok, kind, name, id, embed (iframe URL or null), watch (link to open), start (s), reason} */
	Y.parseLink = function (text) {
		var s = String(text == null ? "" : text).trim();
		if (!s) return { ok: false, reason: "Paste a link first." };
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
		var u; try { u = new URL(s); } catch (e) { return { ok: false, reason: "That is not a web link." }; }
		if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "Only http:// and https:// links work here." };
		var h = u.hostname.toLowerCase().replace(/^(www|m|music)\./, ""), p = u.pathname, q = u.searchParams, m;
		var out = function (kind, id, embed, extra) { var o = { ok: true, kind: kind, name: Y.SITES[kind], id: id || null, embed: embed || null, watch: u.toString(), start: 0 }; for (var k in extra || {}) o[k] = extra[k]; return o; };
		/* YouTube */
		var yt = null;
		if (h === "youtu.be") yt = p.split("/")[1];
		else if (h === "youtube.com" || h === "youtube-nocookie.com") {
			if (p === "/watch") yt = q.get("v");
			else if ((m = p.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/))) yt = m[1];
		}
		if (yt != null) {
			if (!/^[A-Za-z0-9_-]{11}$/.test(yt)) return { ok: false, reason: "That YouTube link has no video id in it." };
			var st = tParam(q.get("t") || q.get("start") || (u.hash.match(/t=([0-9hms.]+)/) || [])[1]);
			return out("youtube", yt, "https://www.youtube-nocookie.com/embed/" + yt + "?rel=0&playsinline=1&autoplay=0" + (st ? "&start=" + st : ""),
				{ watch: "https://www.youtube.com/watch?v=" + yt + (st ? "&t=" + st + "s" : ""), start: st });
		}
		/* 3Speak: 3speak.tv/watch?v=user/permlink, play.3speak.tv/watch|embed?v=user/permlink */
		if (/(^|\.)3speak\.(tv|co|online)$/.test(h)) {
			var v3 = q.get("v") || ((m = p.match(/^\/(?:watch|embed)\/([a-z0-9.-]{3,16}\/[a-z0-9-]+)/i)) ? m[1] : "");
			if (!/^[a-z0-9.-]{3,16}\/[a-z0-9-]{1,255}$/i.test(v3)) return { ok: false, reason: "That 3Speak link has no video in it (it should end in ?v=user/permlink)." };
			return out("3speak", v3, "https://play.3speak.tv/embed?v=" + v3, { watch: "https://3speak.tv/watch?v=" + v3 });
		}
		/* Rumble: only /embed/<id>/ links can be embedded (the id in a normal rumble.com/v... page link is a different one) */
		if (h === "rumble.com") {
			if ((m = p.match(/^\/embed\/([a-z0-9]+)\/?/i))) return out("rumble", m[1], "https://rumble.com/embed/" + m[1] + "/");
			return out("rumble", null, null);
		}
		/* Odysee: odysee.com/@channel:x/video:y or odysee.com/video:y */
		if (h === "odysee.com") {
			var op = p.replace(/^\/\$\/embed/, "").replace(/^\/+/, "");
			try { op = decodeURIComponent(op); } catch (e) { /* keep as is */ }
			if (!op || /^\$\//.test(op) || !/[^/]+(:[0-9a-f]+)?$/i.test(op) || /^@[^/]+\/?$/.test(op)) return out("odysee", null, null);
			var enc = op.split("/").map(encodeURIComponent).join("/");
			return out("odysee", op, "https://odysee.com/$/embed/" + enc);
		}
		/* BitChute */
		if (h === "bitchute.com" || h === "old.bitchute.com") {
			if ((m = p.match(/^\/(?:video|embed)\/([A-Za-z0-9_-]{6,32})\/?/))) return out("bitchute", m[1], "https://www.bitchute.com/embed/" + m[1] + "/", { watch: "https://www.bitchute.com/video/" + m[1] + "/" });
			return out("bitchute", null, null);
		}
		/* X / Twitter: the tweet's own embed page plays its video */
		if (h === "x.com" || h === "twitter.com" || h === "mobile.twitter.com" || h === "fxtwitter.com" || h === "vxtwitter.com") {
			if ((m = p.match(/\/status(?:es)?\/(\d{5,25})/))) return out("x", m[1], "https://platform.twitter.com/embed/Tweet.html?id=" + m[1] + "&dnt=true", { watch: "https://x.com/i/status/" + m[1] });
			return out("x", null, null);
		}
		if (h === "substack.com" || /\.substack\.com$/.test(h)) return out("substack", null, null);
		if (MEDIA.test(p)) return out("direct", null, null, { file: decodeURIComponent(p.split("/").pop() || "audio") });
		return out("other", null, null);
	};

	/* ---------- reading a whole video's sound without playing it (3Speak HLS, Odysee MP4) ---------- */
	/* HLS playlist -> {variants: [{bw, res, url}], segments: [{url, dur}], total} (urls made absolute against base) */
	Y.parseM3U8 = function (text, base) {
		var lines = String(text || "").split(/\r?\n/), out = { variants: [], segments: [], total: 0 }, pend = null, dur = null;
		var abs = function (x) { try { return new URL(x, base).toString(); } catch (e) { return x; } };
		for (var i = 0; i < lines.length; i++) {
			var l = lines[i].trim(); if (!l) continue;
			if (/^#EXT-X-STREAM-INF:/i.test(l)) { var bw = l.match(/BANDWIDTH=(\d+)/i), rs = l.match(/RESOLUTION=(\d+x\d+)/i); pend = { bw: bw ? +bw[1] : 0, res: rs ? rs[1] : "" }; continue; }
			if (/^#EXTINF:/i.test(l)) { dur = parseFloat(l.slice(8)) || 0; continue; }
			if (l[0] === "#") continue;
			if (pend) { pend.url = abs(l); out.variants.push(pend); pend = null; }
			else { out.segments.push({ url: abs(l), dur: dur || 0 }); out.total += dur || 0; dur = null; }
		}
		return out;
	};
	/* the rendition with the smallest bandwidth (the sound is the same in every one) */
	Y.lightest = function (vs) { return (vs || []).slice().sort(function (a, b) { return (a.bw || 9e15) - (b.bw || 9e15); })[0] || null; };
	/* MPEG-TS bytes -> the AAC (ADTS) bytes of its first audio stream, or null when it has none */
	Y.tsAudio = function (u8, st) {
		st = st || {}; var n = u8.length, parts = [], len = 0, i;
		for (i = 0; i + 188 <= n; i += 188) {
			if (u8[i] !== 0x47) { var j = u8.indexOf(0x47, i + 1); if (j < 0) break; i = j - 188; continue; }
			var pusi = u8[i + 1] & 0x40, pid = ((u8[i + 1] & 0x1f) << 8) | u8[i + 2], afc = (u8[i + 3] >> 4) & 3, p = i + 4;
			if (afc === 2) continue;
			if (afc === 3) p += 1 + u8[i + 4];
			if (p >= i + 188) continue;
			if (pid === 0 && pusi) { p += 1 + u8[p]; st.pmt = ((u8[p + 10] & 0x1f) << 8) | u8[p + 11]; continue; }
			if (st.pmt != null && pid === st.pmt && pusi) {
				p += 1 + u8[p];
				var secLen = ((u8[p + 1] & 0x0f) << 8) | u8[p + 2], end = Math.min(i + 188, p + 3 + secLen - 4), info = ((u8[p + 10] & 0x0f) << 8) | u8[p + 11], q = p + 12 + info;
				while (q + 5 <= end) { var type = u8[q], epid = ((u8[q + 1] & 0x1f) << 8) | u8[q + 2], el = ((u8[q + 3] & 0x0f) << 8) | u8[q + 4]; if (type === 0x0f && st.apid == null) st.apid = epid; q += 5 + el; }
				continue;
			}
			if (st.apid == null || pid !== st.apid) continue;
			if (pusi) { if (u8[p] !== 0 || u8[p + 1] !== 0 || u8[p + 2] !== 1) continue; p += 9 + u8[p + 8]; }
			if (p < i + 188) { parts.push(u8.subarray(p, i + 188)); len += i + 188 - p; }
		}
		if (!len) return null;
		var out = new Uint8Array(len), o = 0; parts.forEach(function (x) { out.set(x, o); o += x.length; });
		return out;
	};
	/* ADTS bytes -> [{o: offset, l: length}] whole frames, plus {sr, ch} from the first header */
	Y.ADTS_SR = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
	Y.adtsFrames = function (u8) {
		var fr = [], i = 0, n = u8.length, sr = 0, ch = 0;
		while (i + 7 <= n) {
			if (u8[i] !== 0xff || (u8[i + 1] & 0xf6) !== 0xf0) { i++; continue; }
			var l = ((u8[i + 3] & 3) << 11) | (u8[i + 4] << 3) | (u8[i + 5] >> 5);
			if (l < 7 || i + l > n) break;
			if (!sr) { sr = Y.ADTS_SR[(u8[i + 2] >> 2) & 15] || 0; ch = ((u8[i + 2] & 1) << 2) | (u8[i + 3] >> 6); }
			fr.push({ o: i, l: l }); i += l;
		}
		return { frames: fr, sr: sr, ch: ch, used: i };
	};
	/* odysee.com/@chan:x/name:y path -> lbry://@chan#x/name#y */
	Y.lbryUrl = function (path) { return "lbry://" + String(path || "").split("/").map(function (s) { return s.replace(/:([0-9a-f]+)$/i, "#$1"); }).join("/"); };

	/* ---------- small DSP ---------- */
	/* BS.1770 K-weighting: high shelf (+4 dB, ~1.5 kHz) then high pass (~38 Hz), coefficients for any rate */
	Y.kCoefs = function (sr) {
		var G = 3.999843853973347, f1 = 1681.974450955533, Q1 = 0.7071752369554196, K = Math.tan(Math.PI * f1 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
		var a0 = 1 + K / Q1 + K * K, s1 = { b0: (Vh + Vb * K / Q1 + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q1 + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0 };
		var f2 = 38.13547087602444, Q2 = 0.5003270373238773, K2 = Math.tan(Math.PI * f2 / sr), a02 = 1 + K2 / Q2 + K2 * K2;
		var s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K2 * K2 - 1) / a02, a2: (1 - K2 / Q2 + K2 * K2) / a02 };
		return [s1, s2];
	};
	/* in-place radix-2 FFT on re / im (length a power of two) */
	Y.fft = function (re, im) {
		var n = re.length, i, j, k, l;
		for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
		for (l = 2; l <= n; l <<= 1) {
			var ang = -2 * Math.PI / l, wr = Math.cos(ang), wi = Math.sin(ang), h2 = l >> 1;
			for (i = 0; i < n; i += l) {
				var cr = 1, ci = 0;
				for (k = 0; k < h2; k++) {
					var a = i + k, b = a + h2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
					re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
					var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
				}
			}
		}
	};
	/* 4x oversampling taps (windowed sinc, 12 taps either side), phases 1/4, 2/4, 3/4 */
	var TP_H = 12, TP = (function () {
		var t = [], ph, j;
		for (ph = 1; ph < 4; ph++) { var row = new Float64Array(2 * TP_H), fr = ph / 4; for (j = -TP_H + 1; j <= TP_H; j++) { var d = j - fr, s = Math.sin(Math.PI * d) / (Math.PI * d), w = 0.5 + 0.5 * Math.cos(Math.PI * d / TP_H); row[j + TP_H - 1] = s * w; } t.push(row); }
		return t;
	})();

	/* growable typed arrays */
	function Grow(T, n) { this.T = T; this.a = new T(n || 1024); this.n = 0; }
	Grow.prototype.push = function (v) { if (this.n === this.a.length) { var b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; };
	Grow.prototype.view = function () { return this.a.subarray(0, this.n); };
	Y.Grow = Grow;

	/* spectrogram bands: NB log-spaced bands from 30 Hz to the Nyquist frequency (top 20 kHz) */
	Y.SPEC_N = 2048; Y.SPEC_BANDS = 192;
	Y.bandEdges = function (sr, n, nb) {
		var lo = 30, hi = Math.min(20000, sr / 2), e = [], i;
		for (i = 0; i <= nb; i++) { var f = lo * Math.pow(hi / lo, i / nb); e.push(Math.max(1, Math.min(n / 2, Math.round(f * n / sr)))); }
		return e;
	};
	Y.bandFreq = function (sr, nb, i) { var lo = 30, hi = Math.min(20000, sr / 2); return lo * Math.pow(hi / lo, (i + 0.5) / nb); };

	/* ---------- the streaming analyzer ---------- */
	function Analyzer(sr, nch, opts) {
		opts = opts || {};
		this.sr = sr; this.nch = Math.max(1, Math.min(2, nch || 1)); this.n = 0;
		var kc = Y.kCoefs(sr); this.k1 = kc[0]; this.k2 = kc[1];
		this.kst = []; for (var c = 0; c < this.nch; c++) this.kst.push(new Float64Array(8));   // x1 x2 y1 y2 (stage 1), x1 x2 y1 y2 (stage 2)
		this.SB = Math.max(1, Math.round(sr / 10));     // 100 ms sub-block
		this.WB = Math.max(1, Math.round(sr / 100));    // 10 ms waveform block
		this.kblk = new Grow(Float64Array);             // K-weighted mean square per 100 ms (channels summed)
		this.rblk = new Grow(Float32Array);             // plain mean square per 100 ms (channel mean)
		this.zblk = new Grow(Uint8Array);               // 1 = the whole 100 ms is exact digital zero
		this.wmin = []; this.wmax = []; for (c = 0; c < this.nch; c++) { this.wmin.push(new Grow(Float32Array)); this.wmax.push(new Grow(Float32Array)); }
		this.ka = 0; this.ra = 0; this.za = true; this.sbi = 0;
		this.wlo = []; this.whi = []; this.wbi = 0; for (c = 0; c < this.nch; c++) { this.wlo.push(Infinity); this.whi.push(-Infinity); }
		this.peak = []; this.sum = []; this.sq = []; for (c = 0; c < this.nch; c++) { this.peak.push(0); this.sum.push(0); this.sq.push(0); }
		this.peakAt = 0; this.pmax = 0; this.lr = 0; this.mid = 0; this.side = 0;
		/* true peak: history of the last 2*TP_H samples per channel */
		this.tph = []; for (c = 0; c < this.nch; c++) this.tph.push(new Float64Array(4 * TP_H));   // each sample written twice: the window is always h[p+1 .. p+2H]
		this.tpi = 0; this.tp = 0; this.tpAt = 0;
		/* clipping: runs of 3+ samples at full scale */
		this.clipRun = []; for (c = 0; c < this.nch; c++) this.clipRun.push(0);
		this.clips = 0; this.clipAt = []; this.clipLim = opts.clipLevel || 0.9995;
		/* spectrogram */
		this.FN = opts.fftSize || Y.SPEC_N; this.NB = opts.bands || Y.SPEC_BANDS;
		this.edges = Y.bandEdges(sr, this.FN, this.NB);
		this.win = new Float64Array(this.FN); for (var i = 0; i < this.FN; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / this.FN);
		this.wsum = 0; for (i = 0; i < this.FN; i++) this.wsum += this.win[i];
		this.fbuf = new Float64Array(this.FN); this.fi = 0;
		this.re = new Float64Array(this.FN); this.im = new Float64Array(this.FN);
		this.spec = new Grow(Uint8Array, this.NB * 256); this.cols = 0;
		this.ltas = new Float64Array(this.FN / 2 + 1); this.ltasN = 0;
		this.last = new Float32Array(this.NB);          // newest column in dB (live spectrum)
	}
	Y.SPEC_FLOOR = -110;                                  // dBFS mapped to 0 in the spectrogram bytes; 0 dBFS -> 255
	Analyzer.prototype.feed = function (ch) {
		var nch = this.nch, len = ch[0].length, i, c, x;
		var A = ch[0], B = nch > 1 ? (ch[1] || ch[0]) : null, k1 = this.k1, k2 = this.k2, SB = this.SB, WB = this.WB;
		var thr = this.clipLim, tph = this.tph, H2 = 2 * TP_H;
		for (i = 0; i < len; i++) {
			var kz = 0, rz = 0, mono = 0;
			for (c = 0; c < nch; c++) {
				x = c === 0 ? A[i] : B[i];
				if (x !== x) x = 0;
				/* K-weighting */
				var s = this.kst[c];
				var y1 = k1.b0 * x + k1.b1 * s[0] + k1.b2 * s[1] - k1.a1 * s[2] - k1.a2 * s[3]; s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y1;
				var y2 = y1 - 2 * s[4] + s[5] - k2.a1 * s[6] - k2.a2 * s[7]; s[5] = s[4]; s[4] = y1; s[7] = s[6]; s[6] = y2;
				kz += y2 * y2; rz += x * x; mono += x;
				var ax = x < 0 ? -x : x;
				if (ax > this.peak[c]) this.peak[c] = ax; if (ax > this.pmax) { this.pmax = ax; this.peakAt = this.n; }
				this.sum[c] += x; this.sq[c] += x * x;
				if (x < this.wlo[c]) this.wlo[c] = x; if (x > this.whi[c]) this.whi[c] = x;
				if (x !== 0) this.za = false;
				/* clipping */
				if (ax >= thr) { if (++this.clipRun[c] === 3) { this.clips++; if (this.clipAt.length < 400) this.clipAt.push(this.n / this.sr); } } else this.clipRun[c] = 0;
				/* true peak: the sample TP_H back sits between h[TP_H-1] and h[TP_H]; only work it out where it could beat the max so far */
				var h = tph[c], p0 = this.tpi; h[p0] = x; h[p0 + H2] = x; var o = p0 + 1;     // window h[o .. o+H2-1], oldest first
				var mid = h[o + TP_H - 1], nb = h[o + TP_H];
				var near = (mid < 0 ? -mid : mid) > this.tp * 0.6 || (nb < 0 ? -nb : nb) > this.tp * 0.6;
				if (near) {
					var am = mid < 0 ? -mid : mid; if (am > this.tp) { this.tp = am; this.tpAt = this.n - TP_H; }
					for (var ph = 0; ph < 3; ph++) { var row = TP[ph], acc = 0; for (var j = 0; j < H2; j++) acc += row[j] * h[o + j]; if (acc < 0) acc = -acc; if (acc > this.tp) { this.tp = acc; this.tpAt = this.n - TP_H; } }
				}
			}
			if (++this.tpi === H2) this.tpi = 0;
			if (nch === 2) { var L = A[i], R = B[i]; this.lr += L * R; var md = (L + R) * 0.5, sd = (L - R) * 0.5; this.mid += md * md; this.side += sd * sd; }
			this.ka += kz; this.ra += rz / nch;
			/* spectrogram input: mono mix */
			this.fbuf[this.fi++] = mono / nch;
			if (this.fi === this.FN) { this._col(); this.fi = 0; }
			this.n++;
			if (++this.sbi === SB) { this.kblk.push(this.ka / SB); this.rblk.push(this.ra / SB); this.zblk.push(this.za ? 1 : 0); this.ka = 0; this.ra = 0; this.za = true; this.sbi = 0; }
			if (++this.wbi === WB) { for (c = 0; c < nch; c++) { this.wmin[c].push(this.wlo[c]); this.wmax[c].push(this.whi[c]); this.wlo[c] = Infinity; this.whi[c] = -Infinity; } this.wbi = 0; }
		}
	};
	Analyzer.prototype._col = function () {
		var N = this.FN, re = this.re, im = this.im, i, b, w = this.win, f = this.fbuf, e = this.edges, NB = this.NB;
		for (i = 0; i < N; i++) { re[i] = f[i] * w[i]; im[i] = 0; }
		Y.fft(re, im);
		var norm = 4 / (this.wsum * this.wsum);         // a full-scale sine reads 0 dB in its bin
		var lt = this.ltas;
		for (i = 0; i <= N / 2; i++) lt[i] += (re[i] * re[i] + im[i] * im[i]) * norm;
		this.ltasN++;
		var span = 255 / -Y.SPEC_FLOOR;
		for (b = 0; b < NB; b++) {
			var lo = e[b], hi = Math.max(lo + 1, e[b + 1]), mx = 0;
			for (i = lo; i < hi; i++) { var p = (re[i] * re[i] + im[i] * im[i]) * norm; if (p > mx) mx = p; }
			var d = pdb(mx); this.last[b] = d;
			var v = Math.round((d - Y.SPEC_FLOOR) * span); this.spec.push(v < 0 ? 0 : v > 255 ? 255 : v);
		}
		this.cols++;
	};
	Analyzer.prototype.duration = function () { return this.n / this.sr; };

	/* loudness of one block range: mean of K-weighted sub-blocks [a, b) -> LUFS */
	function lufsOf(k, a, b) { var s = 0; for (var i = a; i < b; i++) s += k[i]; return b > a ? -0.691 + pdb(s / (b - a)) : -Infinity; }
	Y.lufsOf = lufsOf;
	/* momentary (400 ms) and short-term (3 s) loudness at each 100 ms step (value at the END of each window) */
	Analyzer.prototype.series = function () {
		var k = this.kblk.view(), n = k.length, mom = new Float32Array(n), st = new Float32Array(n), cs = new Float64Array(n + 1), i;
		for (i = 0; i < n; i++) cs[i + 1] = cs[i] + k[i];
		for (i = 0; i < n; i++) {
			var a4 = Math.max(0, i - 3), a30 = Math.max(0, i - 29);
			mom[i] = -0.691 + pdb((cs[i + 1] - cs[a4]) / (i + 1 - a4));
			st[i] = -0.691 + pdb((cs[i + 1] - cs[a30]) / (i + 1 - a30));
		}
		var r = this.rblk.view(), rms = new Float32Array(r.length); for (i = 0; i < r.length; i++) rms[i] = pdb(r[i]);
		return { step: 0.1, momentary: mom, shortTerm: st, rms: rms };
	};
	/* integrated loudness (gated), LRA, maxima */
	Analyzer.prototype.loudness = function () {
		var k = this.kblk.view(), n = k.length, i, blocks = [], st = [];
		var cs = new Float64Array(n + 1); for (i = 0; i < n; i++) cs[i + 1] = cs[i] + k[i];
		for (i = 0; i + 4 <= n; i++) blocks.push((cs[i + 4] - cs[i]) / 4);           // 400 ms, 75 % overlap
		for (i = 0; i + 30 <= n; i++) st.push((cs[i + 30] - cs[i]) / 30);           // 3 s, 100 ms hop
		var Lz = function (z) { return -0.691 + pdb(z); };
		var out = { integrated: -Infinity, range: 0, momentaryMax: -Infinity, shortTermMax: -Infinity };
		if (!blocks.length && n) { out.integrated = out.momentaryMax = Lz(cs[n] / n); return out; }
		var abs = blocks.filter(function (z) { return z > 0 && Lz(z) > -70; });
		blocks.forEach(function (z) { var l = Lz(z); if (l > out.momentaryMax) out.momentaryMax = l; });
		st.forEach(function (z) { var l = Lz(z); if (l > out.shortTermMax) out.shortTermMax = l; });
		if (abs.length) {
			var mean = abs.reduce(function (a, b) { return a + b; }, 0) / abs.length, rel = Lz(mean) - 10;
			var g = abs.filter(function (z) { return Lz(z) > rel; });
			out.integrated = Lz(g.reduce(function (a, b) { return a + b; }, 0) / g.length);
		}
		var sa = st.filter(function (z) { return z > 0 && Lz(z) > -70; });
		if (sa.length > 1) {
			var sm = Lz(sa.reduce(function (a, b) { return a + b; }, 0) / sa.length) - 20, sg = sa.filter(function (z) { return Lz(z) > sm; }).map(Lz).sort(function (a, b) { return a - b; });
			if (sg.length > 1) { out.range = Y.percentile(sg, 0.95) - Y.percentile(sg, 0.10); out.rangeLow = Y.percentile(sg, 0.10); out.rangeHigh = Y.percentile(sg, 0.95); }
		}
		return out;
	};
	/* linear-interpolated percentile of a sorted array */
	Y.percentile = function (a, p) { if (!a.length) return NaN; var x = p * (a.length - 1), i = Math.floor(x), f = x - i; return i + 1 < a.length ? a[i] + f * (a[i + 1] - a[i]) : a[i]; };

	/* everything in one object (dB values may be -Infinity for silence) */
	Analyzer.prototype.summary = function () {
		var nch = this.nch, n = this.n, c, L = this.loudness();
		var peak = Math.max.apply(null, this.peak), rmsP = 0; for (c = 0; c < nch; c++) rmsP += n ? this.sq[c] / n : 0; rmsP /= nch;
		var tp = Math.max(this.tp, peak);
		var s = {
			duration: n / this.sr, sampleRate: this.sr, channels: nch,
			integrated: L.integrated, range: L.range, rangeLow: L.rangeLow, rangeHigh: L.rangeHigh, momentaryMax: L.momentaryMax, shortTermMax: L.shortTermMax,
			samplePeak: db(peak), peakAt: this.peakAt / this.sr, truePeak: db(tp), truePeakAt: Math.max(0, this.tpAt) / this.sr,
			channelPeaks: this.peak.map(db), rms: pdb(rmsP),
			dc: this.sum.map(function (v) { return n ? v / n : 0; }),
			clips: this.clips, clipAt: this.clipAt.slice()
		};
		s.plr = s.truePeak - s.integrated;                // peak-to-loudness ratio
		s.crest = s.samplePeak - s.rms;                   // crest factor in dB
		var r = this.rblk.view(), z = this.zblk.view(), v = [], i, zero = 0;
		for (i = 0; i < r.length; i++) { if (z[i]) zero++; else v.push(r[i]); }
		v.sort(function (a, b) { return a - b; });
		var m = Math.max(1, Math.floor(v.length * 0.1)), sm = 0; for (i = 0; i < Math.min(m, v.length); i++) sm += v[i];
		s.noiseFloor = v.length ? pdb(sm / Math.min(m, v.length)) : -Infinity;
		s.digitalSilence = zero * 0.1;
		if (nch === 2 && n) {
			var dl = this.sq[0], dr = this.sq[1];
			s.correlation = dl > 0 && dr > 0 ? this.lr / Math.sqrt(dl * dr) : 0;
			s.balance = pdb(dl / n) - pdb(dr / n);           // + = left louder
			s.width = this.mid > 0 ? pdb(this.side / this.mid) : (this.side > 0 ? Infinity : -Infinity);   // side vs mid energy (dB)
			s.stereo = Y.stereoKind(s, dl / n, dr / n);
		} else s.stereo = { kind: "mono", text: "Mono (one channel)." };
		return s;
	};
	/* plain words for the stereo picture */
	Y.stereoKind = function (s, pl, pr) {
		var lq = pdb(pl), rq = pdb(pr);
		if (lq < -90 && rq < -90) return { kind: "silent", text: "Both channels are silent." };
		if (lq < -80 && rq > -80) return { kind: "oneside", text: "Only the right channel has sound: viewers with headphones hear it on one side." };
		if (rq < -80 && lq > -80) return { kind: "oneside", text: "Only the left channel has sound: viewers with headphones hear it on one side." };
		if (s.correlation < -0.3) return { kind: "phase", text: "The channels are out of phase: the sound can cancel out on a phone speaker or in mono." };
		if (s.width < -60) return { kind: "dualmono", text: "Stereo file, but both channels are the same (mono sound)." };
		if (s.correlation < 0) return { kind: "phase", text: "The channels are out of phase: the sound can cancel out on a phone speaker or in mono." };
		if (Math.abs(s.balance) > 3) return { kind: "unbalanced", text: (s.balance > 0 ? "Left" : "Right") + " is " + Math.abs(s.balance).toFixed(1) + " dB louder than the other side." };
		if (s.width < -20) return { kind: "narrow", text: "Almost mono (a narrow stereo picture)." };
		return { kind: "stereo", text: "Stereo, well balanced." };
	};

	/* ---------- silences, loud moments ---------- */
	/* rms = 100 ms RMS series in dB. -> [{a, b}] in seconds, each at least minLen long, below thrDb */
	Y.silences = function (rms, thrDb, minLen, step) {
		step = step || 0.1; var out = [], st = -1, i, n = rms.length;
		for (i = 0; i <= n; i++) {
			var q = i < n && !(rms[i] > thrDb);
			if (q && st < 0) st = i;
			else if (!q && st >= 0) { if ((i - st) * step >= minLen - 1e-9) out.push({ a: st * step, b: i * step }); st = -1; }
		}
		return out;
	};
	/* the n loudest short-term moments, at least `gap` seconds apart -> [{t, lufs}] (t = start of the 3 s window) */
	Y.loudest = function (st, n, gap, step) {
		step = step || 0.1; var idx = [], i, g = Math.round((gap || 10) / step);
		for (i = 29; i < st.length; i++) if (isFinite(st[i])) idx.push(i);
		idx.sort(function (a, b) { return st[b] - st[a]; });
		var pick = [];
		for (i = 0; i < idx.length && pick.length < n; i++) { var k = idx[i]; if (pick.every(function (p) { return Math.abs(p - k) >= g; })) pick.push(k); }
		return pick.map(function (k) { return { t: Math.max(0, (k - 29) * step), lufs: st[k] }; });
	};

	/* ---------- platform targets ---------- */
	Y.TARGETS = [
		{ id: "youtube", name: "YouTube", lufs: -14, down: true, note: "Turns loud videos down to about -14. Quieter videos are left as they are." },
		{ id: "spotify", name: "Spotify", lufs: -14, up: true, note: "Turns loud tracks down; turns quiet ones up only as far as the peaks allow (1 dB below full scale)." },
		{ id: "apple", name: "Apple Music", lufs: -16, up: true, note: "Sound Check aims at about -16." },
		{ id: "amazon", name: "Amazon Music", lufs: -14, down: true, note: "" },
		{ id: "podcast", name: "Podcasts (Apple)", lufs: -16, mix: true, note: "Apple's recommendation for podcasts: -16, peaks no higher than -1 dBTP." },
		{ id: "ebu", name: "TV, Europe (EBU R128)", lufs: -23, mix: true, note: "Broadcast target, peaks at most -1 dBTP." },
		{ id: "atsc", name: "TV, North America (ATSC A/85)", lufs: -24, mix: true, note: "Broadcast target, peaks at most -2 dBTP." }
	];
	/* -> [{...target, change (dB the platform would apply, 0 = none), diff (lufs - target)}] */
	Y.targets = function (lufs, tp) {
		return Y.TARGETS.map(function (t) {
			var diff = lufs - t.lufs, ch = 0;
			if (!isFinite(lufs)) return Object.assign({}, t, { diff: NaN, change: 0 });
			if (t.mix) ch = -diff;
			else if (diff > 0) ch = -diff;
			else if (t.up) ch = Math.max(0, Math.min(-diff, isFinite(tp) ? -1 - tp : -diff));
			return Object.assign({}, t, { diff: diff, change: Math.abs(ch) < 0.05 ? 0 : ch });
		});
	};
	/* one-line verdict for YouTube */
	Y.verdict = function (s) {
		var L = s.integrated;
		if (!isFinite(L)) return { cls: "none", head: "No sound", text: "The audio is silent." };
		if (s.clips > 0) return { cls: "clip", head: "Clipping", text: "The sound hits full scale " + s.clips + " time" + (s.clips === 1 ? "" : "s") + ": those spots are distorted." };
		if (L > -13) return { cls: "loud", head: "Louder than YouTube plays", text: "YouTube will turn it down by about " + (L + 14).toFixed(1) + " dB, so the extra loudness only costs dynamics." };
		if (L >= -15.5) return { cls: "good", head: "Right on target", text: "About -14 LUFS: what YouTube plays at. Nothing will be turned up or down much." };
		if (L >= -19) return { cls: "ok", head: "A little quiet", text: "YouTube does not turn quiet videos up, so this plays " + (-14 - L).toFixed(1) + " dB quieter than most videos." };
		return { cls: "quiet", head: "Quiet", text: "About " + (-14 - L).toFixed(0) + " dB quieter than most YouTube videos; viewers will turn their volume up. Aim for about -14 LUFS." };
	};

	/* ---------- formatting ---------- */
	Y.fmtTime = function (sec, dec) {
		if (!isFinite(sec)) sec = 0; sec = Math.max(0, sec); dec = dec || 0;
		var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec - Math.floor(sec / 60) * 60, ss = s.toFixed(dec);
		if (+ss >= 60) { ss = (0).toFixed(dec); m++; if (m === 60) { m = 0; h++; } }
		if (+ss < 10) ss = "0" + ss;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + ss;
	};
	Y.fmtDb = function (v, dec) { return isFinite(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dec == null ? 1 : dec) : "−∞"; };
	Y.fmtHz = function (f) { return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1).replace(/\.0$/, "") + " kHz" : Math.round(f) + " Hz"; };
	/* CSV of the 100 ms series */
	Y.csv = function (ser) {
		var rows = ["time_s,momentary_lufs,short_term_lufs,rms_dbfs"], f = function (v) { return isFinite(v) ? v.toFixed(2) : ""; };
		for (var i = 0; i < ser.momentary.length; i++) rows.push((i * ser.step + ser.step).toFixed(1) + "," + f(ser.momentary[i]) + "," + (i >= 29 ? f(ser.shortTerm[i]) : "") + "," + f(ser.rms[i]));
		return rows.join("\n") + "\n";
	};
	/* summary as plain text (Copy) */
	Y.reportText = function (s, title) {
		var L = [];
		if (title) L.push(title);
		L.push("Length " + Y.fmtTime(s.duration) + ", " + s.sampleRate + " Hz, " + (s.channels === 2 ? "stereo" : "mono"));
		L.push("Integrated loudness " + Y.fmtDb(s.integrated) + " LUFS");
		L.push("True peak " + Y.fmtDb(s.truePeak) + " dBTP, sample peak " + Y.fmtDb(s.samplePeak) + " dBFS");
		L.push("Loudness range " + (s.range || 0).toFixed(1) + " LU, max short-term " + Y.fmtDb(s.shortTermMax) + " LUFS, max momentary " + Y.fmtDb(s.momentaryMax) + " LUFS");
		L.push("RMS " + Y.fmtDb(s.rms) + " dBFS, noise floor " + Y.fmtDb(s.noiseFloor) + " dBFS, clipped spots " + s.clips);
		L.push(s.stereo.text);
		return L.join("\n") + "\n(measured with mes.fm/youtube-audio)\n";
	};

	Y.Analyzer = Analyzer;
	root.MESYA = Y;
	if (typeof module === "object" && module.exports) module.exports = Y;
})(typeof window !== "undefined" ? window : this);

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

/* MES YouTube Audio Analyzer UI. Maths = MESYA in lib.js (prepended above); formats the browser can't decode go through
   MESConvEngine.extractAudio (the Video Converter's engine, ffmpeg.wasm on demand).
   Three sources: a dropped file, a direct media link (fetched by the browser when the other site allows it), and tab audio shared with
   getDisplayMedia while the video plays in the site's own player (embedded on this page, or in another tab). Only measurements are kept.
   Settings (silence threshold, lanes, waveform scale) in localStorage mes-youtube-audio:v1. ?u=<link> pre-fills the link box. */
(function () {
	'use strict';
	var Y = MESYA, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-youtube-audio:v1';
	var S = { thr: -45, min: 0.5, lanes: { wave: true, loud: true, spec: true }, ws: 'lin', split: false, tab: 'link', quiet: true, keep: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('ya-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2600); }
	var AC = window.AudioContext || window.webkitAudioContext;
	var root = $('ya');

	/* ---------- state ---------- */
	var Z = null, SUM = null, SER = null, SRC = null, view = null, cap = null, busy = null, specImg = null, specCols = -1, sil = [], userZoom = false, link = null;

	/* ---------- tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll('.ya-tabs [role=tab]'));
	function setTab(id, focus) {
		tabs.forEach(function (b) { var on = b.getAttribute('data-tab') === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; $(b.getAttribute('aria-controls')).hidden = !on; if (on && focus) b.focus(); });
		S.tab = id; save();
	}
	tabs.forEach(function (b, i) {
		b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
		b.addEventListener('keydown', function (e) {
			var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
			if (j < 0) return; e.preventDefault(); j = (j + tabs.length) % tabs.length; setTab(tabs[j].getAttribute('data-tab'), true);
		});
	});
	setTab(S.tab === 'file' || S.tab === 'tab' ? S.tab : 'link');

	/* ---------- progress ---------- */
	function prog(text, f) { $('ya-prog').hidden = false; if (text != null) $('ya-progtext').textContent = text; $('ya-progbar').style.width = (f == null ? 0 : Math.round(f * 100)) + '%'; }
	function progOff() { $('ya-prog').hidden = true; }
	$('ya-cancel').addEventListener('click', function () { if (busy) busy.cancel = true; progOff(); });
	function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

	/* ---------- analysing decoded audio ---------- */
	async function analyseChannels(ch, sr, src, job) {
		ch = ch.slice(0, 2);
		Z = new Y.Analyzer(sr, ch.length); SRC = src; userZoom = false; view = null;
		var n = ch[0].length, step = Math.round(sr * 2), t0 = Date.now();
		for (var i = 0; i < n; i += step) {
			if (job.cancel) throw new Error('Cancelled');
			Z.feed(ch.map(function (c) { return c.subarray(i, Math.min(n, i + step)); }));
			if (Date.now() - t0 > 120) { prog('Measuring… ' + Y.fmtTime(i / sr) + ' of ' + Y.fmtTime(n / sr), i / n); await yieldUI(); t0 = Date.now(); }
		}
		finish();
	}
	var dctx = null;
	async function decode(buf, file, job, name) {
		if (!AC) throw new Error('This browser cannot decode audio.');
		if (!dctx) dctx = new AC();
		prog('Decoding ' + name + '…', 0);
		try {
			var ab = await new Promise(function (res, rej) { var p = dctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
			var ch = []; for (var c = 0; c < ab.numberOfChannels; c++) ch.push(ab.getChannelData(c));
			if (ab.numberOfChannels > 2) toast('Only the first two of ' + ab.numberOfChannels + ' channels are measured.');
			return { channels: ch, sampleRate: ab.sampleRate };
		} catch (e) {
			if (job.cancel) throw new Error('Cancelled');
			return viaEngine(file, job, name);
		}
	}
	async function viaEngine(file, job, name) {
		var E = window.MESConvEngine;
		if (!file || !E || !E.extractAudio) throw new Error('The browser could not read the sound of this file.');
		prog('The browser can\'t read ' + name + ' itself: loading the converter (about 30 MB, once)…', 0);
		var r = await E.extractAudio(file, { onStatus: function (m, x) { prog(m, x || 0); }, onProgress: function (x) { prog('Reading the sound of ' + name + '…', x); } });
		if (job.cancel) throw new Error('Cancelled');
		if (r.channels) return { channels: r.channels, sampleRate: r.sampleRate };
		if (!dctx) dctx = new AC();
		var ab = await dctx.decodeAudioData(r.encoded);
		var ch = []; for (var c = 0; c < ab.numberOfChannels; c++) ch.push(ab.getChannelData(c));
		return { channels: ch, sampleRate: ab.sampleRate };
	}
	async function openFile(file) {
		if (!file) return;
		stopCapture(true);
		var job = busy = { cancel: false };
		setPlayback(null);
		try {
			var d;
			if (file.size > 700e6) d = await viaEngine(file, job, file.name);
			else { prog('Reading ' + file.name + '…', 0); d = await decode(await file.arrayBuffer(), file, job, file.name); }
			await analyseChannels(d.channels, d.sampleRate, { kind: 'file', title: file.name, size: file.size }, job);
			setPlayback(URL.createObjectURL(file), true);
		} catch (e) { if (!/Cancelled/.test(e.message)) { toast(e.message); $('ya-linkmsg').textContent = ''; } } finally { if (busy === job) busy = null; progOff(); }
	}
	$('ya-file').addEventListener('change', function () { openFile(this.files[0]); this.value = ''; });
	var drop = $('ya-drop');
	['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('ya-over'); }); });
	['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('ya-over'); }); });
	drop.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f); });
	/* a file dropped anywhere on the tool */
	root.addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
	root.addEventListener('drop', function (e) { if (e.defaultPrevented) return; var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); setTab('file'); openFile(f); } });

	/* ---------- links ---------- */
	function msg(id, html) { $(id).innerHTML = html || ''; }
	/* whole file in 8 MB pieces (servers such as Odysee's drop one long download part way); plain download when ranges aren't offered */
	async function fetchWhole(url, job, name) {
		var CH = 8 << 20, parts = [], got = 0, total = 0, type = '', r, tries;
		var show = function () { prog('Downloading ' + name + '… ' + (got / 1e6).toFixed(1) + (total ? ' of ' + (total / 1e6).toFixed(0) : '') + ' MB', total ? got / total : 0); };
		var get = async function (range) {
			for (tries = 0; ; tries++) {
				try { var x = await fetch(url, { mode: 'cors', credentials: 'omit', headers: range ? { Range: range } : {} }); if (x.ok) return x; if ((x.status === 401 || x.status === 403) && got) throw new Error('stopped'); if (tries >= 2 || x.status < 500) throw new Error('The other site answered ' + x.status + '.'); }
				catch (e) { if (job.cancel) throw new Error('Cancelled'); if (e.message === 'stopped') throw e; if (e instanceof TypeError && !got && !tries) throw new Error('cors'); if (tries >= 2) throw got ? new Error('stopped') : e; }
				await new Promise(function (res) { setTimeout(res, 800 * (tries + 1)); });
			}
		};
		r = await get('bytes=0-' + (CH - 1));
		type = r.headers.get('content-type') || '';
		if (r.status === 206) {
			var cr = (r.headers.get('content-range') || '').match(/\/(\d+)\s*$/); total = cr ? +cr[1] : 0;
			parts.push(new Uint8Array(await r.arrayBuffer())); got = parts[0].length; show();
			while (!total || got < total) {
				if (job.cancel) throw new Error('Cancelled');
				var x = await get('bytes=' + got + '-' + (got + CH - 1));
				if (x.status !== 206) throw new Error('The download was interrupted. Try again.');
				var u = new Uint8Array(await x.arrayBuffer()); if (!u.length) break;
				parts.push(u); got += u.length; show();
				if (!total && u.length < CH) break;
			}
		} else {
			total = +r.headers.get('content-length') || 0;
			if (r.body && r.body.getReader) { var rd = r.body.getReader(); for (;;) { var y = await rd.read(); if (y.done) break; if (job.cancel) { try { rd.cancel(); } catch (e) {} throw new Error('Cancelled'); } parts.push(y.value); got += y.value.length; show(); } }
			else { parts.push(new Uint8Array(await r.arrayBuffer())); got = parts[0].length; }
		}
		var all = new Uint8Array(got), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; });
		return { buf: all.buffer, type: type };
	}
	async function openDirect(L) {
		var job = busy = { cancel: false }, name = L.file || 'the file';
		stopCapture(true);
		prog('Downloading ' + name + '…', 0);
		try {
			var dl = await fetchWhole(L.watch, job, name), buf = dl.buf, r = { headers: { get: function () { return dl.type; } } };
			var file = null; try { file = new File([buf.slice(0)], name, { type: r.headers.get('content-type') || '' }); } catch (e) {}
			var d = await decode(buf, file, job, name);
			await analyseChannels(d.channels, d.sampleRate, { kind: L.odysee ? 'odysee' : 'direct', title: name, link: L.page || L.watch }, job);
			setPlayback(L.watch, true);
			msg('ya-linkmsg', '');
		} catch (e) {
			if (/Cancelled/.test(e.message)) return;
			if (e.message === 'stopped') msg('ya-linkmsg', (L.odysee ? 'Odysee stopped the download part way: it only lets other web pages read the first 32 MB of some videos.' : 'The other site stopped the download part way.') + ' Try again in a minute, or play the video and use <b>Start listening</b> (tick <b>Keep my speakers silent</b>).');
			else if (e.message === 'cors') msg('ya-linkmsg', 'That site doesn\'t let other web pages read its files. <a href="' + esc(L.watch) + '" target="_blank" rel="noopener">Download the file</a> and drop it on the <b>Drop a file</b> tab, or play it in another tab and use <b>Listen to another tab</b>.');
			else msg('ya-linkmsg', esc(e.message));
		} finally { if (busy === job) busy = null; progOff(); }
	}
	function openLink(text) {
		var L = Y.parseLink(text);
		msg('ya-linkmsg', '');
		if (!L.ok) { msg('ya-linkmsg', esc(L.reason)); return; }
		link = L;
		if (L.kind === 'direct') { stopHls(); $('ya-player').hidden = true; openDirect(L); return; }
		var pl = $('ya-player'), fr = $('ya-frame');
		pl.hidden = false; fr.innerHTML = '';
		$('ya-open').href = L.watch;
		$('ya-open').textContent = 'Open on ' + (L.kind === 'other' ? 'that site' : L.name) + ' ↗';
		stopHls(); $('ya-fullbtn').hidden = false; $('ya-or').hidden = false; $('ya-fullnote').textContent = L.kind === 'odysee' ? 'No playing needed: the page downloads the video file from Odysee and measures all of its sound (Odysee sometimes stops other sites part way through a long video: then use Start listening).' : 'No playing needed: the page reads the video\'s sound track straight from the site and measures all of it.'; $('ya-full').hidden = !(L.kind === '3speak' || (L.kind === 'odysee' && L.embed));
		if (L.kind === '3speak') {
			$('ya-ptitle').textContent = 'Play the 3Speak video here';
			fr.className = 'ya-frame'; play3speak(L, fr);
			$('ya-steps').hidden = false;
			$('ya-cap').setAttribute('data-cap', 'self'); $('ya-cap').textContent = '● Start listening';
		} else if (L.embed) {
			$('ya-ptitle').textContent = 'Play the ' + L.name + ' video here';
			var f = document.createElement('iframe');
			f.src = L.embed; f.title = L.name + ' player'; f.setAttribute('allowfullscreen', '');
			f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.referrerPolicy = 'strict-origin-when-cross-origin';
			fr.className = 'ya-frame' + (L.kind === 'x' ? ' ya-frame--tall' : '');
			fr.appendChild(f);
			$('ya-steps').hidden = false;
			$('ya-cap').setAttribute('data-cap', 'self'); $('ya-cap').textContent = '● Start listening';
		} else {
			var why = L.kind === 'rumble' ? 'A normal Rumble link can\'t be played here (only rumble.com/embed/… links can).'
				: L.kind === 'substack' ? 'Substack videos can\'t be played inside other pages.'
				: L.kind === 'odysee' || L.kind === 'bitchute' || L.kind === 'x' ? 'That link doesn\'t point at one video.'
				: 'This page can\'t play that site\'s video itself.';
			$('ya-ptitle').textContent = L.kind === 'other' ? 'Play it in its own tab' : 'Play it on ' + L.name;
			fr.className = 'ya-frame ya-frame--none';
			fr.innerHTML = '<p>' + esc(why) + ' Open it in a new tab, start it playing, then press <b>Choose a tab to listen to</b> and pick that tab.</p>';
			$('ya-steps').hidden = true;
			$('ya-cap').setAttribute('data-cap', 'other'); $('ya-cap').textContent = '🔊 Choose a tab to listen to';
		}
		try { var u = new URL(location.href); u.searchParams.set('u', L.watch); history.replaceState(null, '', u); } catch (e) {}
		pl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	$('ya-form').addEventListener('submit', function (e) { e.preventDefault(); openLink($('ya-url').value); });
	$('ya-url').addEventListener('paste', function () { var me = this; setTimeout(function () { if (Y.parseLink(me.value).ok) openLink(me.value); }, 0); });

	/* ---------- 3Speak: our own player (their embed is a whole page) + reading the whole sound track ---------- */
	var hls = null, pageVid = null, HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
	function stopHls() { pageVid = null; if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } }
	function loadScript(u) { return new Promise(function (res, rej) { if (window.Hls) return res(); var x = document.createElement('script'); x.src = u; x.onload = res; x.onerror = function () { rej(new Error('Could not load the video player.')); }; document.head.appendChild(x); }); }
	async function speakInfo(L) {
		var r = await fetch('https://play.3speak.tv/api/embed?v=' + encodeURIComponent(L.id).replace('%2F', '/'), { credentials: 'omit' });
		if (!r.ok) throw new Error('3Speak answered ' + r.status + '.');
		var j = await r.json();
		var u = j && (j.videoUrl || j.videoUrlFallback1 || j.videoUrlFallback2);
		if (!u) throw new Error('3Speak has no video for that link' + (j && j.status ? ' (status: ' + j.status + ')' : '') + '.');
		return { url: u, title: j.title || L.id };
	}
	async function play3speak(L, fr) {
		fr.innerHTML = '<p class="ya-loading">Loading the 3Speak video…</p>';
		try {
			var info = await speakInfo(L);
			if (link !== L) return;
			var v = document.createElement('video'); v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.title = info.title;
			fr.innerHTML = ''; fr.appendChild(v); pageVid = v; watchVid(v);
			sizeNote3speak(L, info);
			if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = info.url;
			else { await loadScript(HLS_URL); if (link !== L) return; if (!window.Hls || !Hls.isSupported()) throw new Error('This browser can\'t play 3Speak videos here.'); hls = new Hls(); hls.loadSource(info.url); hls.attachMedia(v); }
		} catch (e) { if (link === L) { fr.className = 'ya-frame ya-frame--none'; fr.innerHTML = '<p>' + esc(e.message) + ' <a href="' + esc(L.watch) + '" target="_blank" rel="noopener">Open it on 3Speak ↗</a></p>'; } }
	}
	async function sizeNote3speak(L, info) {
		try {
			var pl = Y.parseM3U8(await (await fetch(info.url, { credentials: 'omit' })).text(), info.url), bw = 0;
			if (pl.variants.length) { var vv = Y.lightest(pl.variants); bw = vv.bw; pl = Y.parseM3U8(await (await fetch(vv.url, { credentials: 'omit' })).text(), vv.url); }
			if (link !== L || !pl.total) return;
			var mb = bw ? bw * pl.total / 8 / 1e6 : 0;
			$('ya-fullnote').textContent = 'No playing needed: the page reads the sound track of all ' + Y.fmtTime(pl.total) + ' straight from 3Speak and measures it.' + (mb ? ' 3Speak keeps the sound inside the video, so this downloads up to about ' + (mb >= 1000 ? (mb / 1000).toFixed(1) + ' GB' : Math.max(1, Math.round(mb)) + ' MB') + '.' : '');
		} catch (e) {}
	}
	function batchDecode(bytes, sr, nch) {
		var oc = new OfflineAudioContext(Math.max(1, Math.min(2, nch || 2)), 1, sr);
		return new Promise(function (res, rej) { var p = oc.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), res, rej); if (p && p.then) p.then(res, rej); });
	}
	async function measure3speak(L) {
		var job = busy = { cancel: false };
		stopCapture(true); msg('ya-linkmsg', ''); $('ya-capmsg').textContent = '';
		prog('Finding the video\'s sound track on 3Speak…', 0);
		try {
			var info = await speakInfo(L);
			var get = async function (u) { var r = await fetch(u, { credentials: 'omit' }); if (!r.ok) throw new Error('3Speak answered ' + r.status + '.'); return r; };
			var pl = Y.parseM3U8(await (await get(info.url)).text(), info.url);
			if (pl.variants.length) { var vv = Y.lightest(pl.variants); pl = Y.parseM3U8(await (await get(vv.url)).text(), vv.url); }
			var segs = pl.segments; if (!segs.length) throw new Error('That 3Speak video has no parts to read.');
			var st = {}, keepLen = 0, pend = [], pendLen = 0, sr = 0, nch = 0, tail = null, got = 0, t0 = Date.now(), OV = 8, BATCH = 300;
			Z = null; SRC = { kind: '3speak', title: info.title, link: L.watch }; userZoom = false; view = null; setPlayback(null);
			var feedAll = async function (ab, skip) {
				if (!Z) Z = new Y.Analyzer(ab.sampleRate, Math.min(2, ab.numberOfChannels));
				var ch = []; for (var c = 0; c < Math.min(2, ab.numberOfChannels); c++) ch.push(ab.getChannelData(c).subarray(skip));
				var n = ch[0].length, step = Math.round(ab.sampleRate * 2);
				for (var i = 0; i < n; i += step) { Z.feed(ch.map(function (x) { return x.subarray(i, Math.min(n, i + step)); })); if (Date.now() - t0 > 120) { await yieldUI(); t0 = Date.now(); } }
			};
			var flush = async function (final) {
				if (!pendLen) return;
				var all = new Uint8Array(pendLen), o = 0; pend.forEach(function (x) { all.set(x, o); o += x.length; });
				var A = Y.adtsFrames(all); if (!A.frames.length) return;
				sr = sr || A.sr; nch = nch || A.ch;
				var cut = final ? A.frames.length : A.frames.length - 1, last = A.frames[cut - 1], body = all.subarray(0, last.o + last.l);
				var head = tail ? tail : new Uint8Array(0), buf = new Uint8Array(head.length + body.length); buf.set(head, 0); buf.set(body, head.length);
				var ab = await batchDecode(buf, sr, nch), want = cut * 1024;
				await feedAll(ab, Math.max(0, ab.length - want));
				var tf = A.frames.slice(Math.max(0, cut - OV), cut); tail = all.slice(tf[0].o, last.o + last.l);
				var rest = all.subarray(last.o + last.l); pend = rest.length ? [rest.slice()] : []; pendLen = rest.length;
			};
			var fetches = [], ahead = 3, seconds = 0;
			for (var k = 0; k < Math.min(ahead, segs.length); k++) fetches.push(get(segs[k].url).then(function (r) { return r.arrayBuffer(); }));
			for (var i = 0; i < segs.length; i++) {
				if (job.cancel) throw new Error('Cancelled');
				var b = new Uint8Array(await fetches[i]); got += b.length;
				if (i + ahead < segs.length) fetches.push(get(segs[i + ahead].url).then(function (r) { return r.arrayBuffer(); }));
				var a = Y.tsAudio(b, st);
				if (a) { keepLen += a.length; pend.push(a); pendLen += a.length; }
				seconds += segs[i].dur || 0;
				prog('Reading the sound of “' + info.title + '”… ' + Y.fmtTime(seconds) + ' of ' + Y.fmtTime(pl.total) + ' (' + (got / 1e6).toFixed(0) + ' MB downloaded)', (i + 1) / segs.length);
				if (sr ? pendLen > sr * BATCH / 1024 * 380 : pendLen > 6e6) await flush(false);
			}
			if (!keepLen) throw new Error('That 3Speak video has no sound track.');
			await flush(true);
			if (!Z || Z.n < 1) throw new Error('The sound track could not be read.');
			finish();
			setPlayback(null); $('ya-seekhint').hidden = !pageVid;
		} catch (e) {
			if (!/Cancelled/.test(e.message)) msg('ya-linkmsg', esc(e.message || String(e)) + ' You can still play the video and use <b>Start listening</b>.');
		} finally { if (busy === job) busy = null; progOff(); }
	}
	/* Odysee: its own API gives a plain MP4 that other pages may read */
	async function measureOdysee(L) {
		prog('Finding the video file on Odysee…', 0);
		var u;
		try {
			var r = await fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=get', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'get', params: { uri: Y.lbryUrl(L.id), save_file: false }, id: 1 }) });
			var j = await r.json(); u = j && j.result && j.result.streaming_url;
			if (!u) throw new Error((j && j.error && j.error.message) || 'Odysee did not give a file for that video (it may be members-only or a livestream).');
		} catch (e) { progOff(); msg('ya-linkmsg', esc(e.message || String(e)) + ' You can still play the video and use <b>Start listening</b>.'); return; }
		progOff();
		await openDirect({ watch: u, file: decodeURIComponent((L.id.split('/').pop() || 'video').replace(/:[0-9a-f]+$/i, '')) + '.mp4', page: L.watch, odysee: true });
	}
	$('ya-fullbtn').addEventListener('click', function () { if (!link || busy) return; if (link.kind === '3speak') measure3speak(link); else if (link.kind === 'odysee') measureOdysee(link); });
	/* "keep my speakers silent" (both copies of the tick box) */
	var quietBoxes = [].slice.call(document.querySelectorAll('.ya-quietbox'));
	quietBoxes.forEach(function (q) { q.checked = !!S.quiet; q.addEventListener('change', function () { S.quiet = q.checked; quietBoxes.forEach(function (o) { o.checked = S.quiet; }); save(); }); });

	/* the kept copy of a tab's sound: MediaRecorder WebM has no duration, so ask for the end once to make it seekable */
	var recBlob = null;
	function recDone() {
		if (!recBlob || !SRC || SRC.kind !== 'capture') return;
		setPlayback(URL.createObjectURL(recBlob), true);
		$('ya-dlrec').hidden = false;
		var fix = function () { if (audio.duration === Infinity) { audio.currentTime = 1e101; audio.addEventListener('timeupdate', function f() { audio.removeEventListener('timeupdate', f); audio.currentTime = 0; }); } };
		if (audio.readyState >= 1) fix(); else audio.addEventListener('loadedmetadata', fix, { once: true });
	}
	$('ya-dlrec').addEventListener('click', function () { if (recBlob) download(recBlob, baseName() + (/mp4/.test(recBlob.type) ? '.m4a' : '.webm')); });
	var keepBoxes = [].slice.call(document.querySelectorAll('.ya-keepbox'));
	keepBoxes.forEach(function (q) { q.checked = !!S.keep; q.addEventListener('change', function () { S.keep = q.checked; keepBoxes.forEach(function (o) { o.checked = S.keep; }); save(); }); });
	/* ---------- tab audio ---------- */
	var TAP = 'class T extends AudioWorkletProcessor{constructor(){super();this.b=null;this.n=0;this.N=4096}process(i){var x=i[0];if(!x||!x.length)return true;var c=Math.min(2,x.length),k;if(!this.b||this.b.length!==c){this.b=[];for(k=0;k<c;k++)this.b.push(new Float32Array(this.N));this.n=0}for(k=0;k<c;k++)this.b[k].set(x[k],this.n);this.n+=x[0].length;if(this.n>=this.N){this.port.postMessage(this.b,this.b.map(function(a){return a.buffer}));this.b=null}return true}}registerProcessor("ya-tap",T);';
	async function startCapture(self) {
		var M = $('ya-capmsg'); M.textContent = '';
		var say = function (t) { M.textContent = t; if ($('ya-player').hidden) toast(t); };
		if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !AC || !window.AudioWorkletNode) { say('This browser can\'t share a tab\'s sound with a page. Use Chrome, Edge, Brave or Opera on a computer, or drop a file instead.'); return; }
		stopCapture(true);
		var stream;
		try {
			stream = await navigator.mediaDevices.getDisplayMedia({
				video: { displaySurface: 'browser', frameRate: 1 },
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: !!S.quiet },
				preferCurrentTab: !!self, selfBrowserSurface: self ? 'include' : 'exclude', surfaceSwitching: 'include', systemAudio: 'exclude', monitorTypeSurfaces: 'exclude'
			});
		} catch (e) { say(e && e.name === 'NotAllowedError' ? 'Sharing was cancelled.' : 'Could not start: ' + (e && e.message || e)); return; }
		var at = stream.getAudioTracks()[0];
		if (!at) { stream.getTracks().forEach(function (t) { t.stop(); }); say('No sound was shared. Try again and switch on "Also share tab audio" (pick a browser tab, not a window or the screen).'); return; }
		stream.getVideoTracks().forEach(function (t) { t.stop(); });
		var ctx = new AC(), url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
		try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
		var srcN = ctx.createMediaStreamSource(new MediaStream([at])), tap = new AudioWorkletNode(ctx, 'ya-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }), mute = ctx.createGain();
		mute.gain.value = 0; srcN.connect(tap); tap.connect(mute); mute.connect(ctx.destination);
		if (ctx.state === 'suspended') ctx.resume();
		Z = null; SUM = null; SER = null; SRC = { kind: 'capture', self: !!self, title: self && link ? link.name + ' video' : 'Tab audio', link: self && link ? link.watch : '', yt: !!(self && link && link.kind === 'youtube') };
		userZoom = false; view = null; setPlayback(null);
		cap = { stream: stream, ctx: ctx, tap: tap, t0: Date.now(), timer: 0, rec: null };
		recBlob = null; $('ya-dlrec').hidden = true;
		if (S.keep && window.MediaRecorder) {
			try {
				var mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].filter(function (x) { return MediaRecorder.isTypeSupported(x); })[0];
				var rec = new MediaRecorder(new MediaStream([at]), mt ? { mimeType: mt, audioBitsPerSecond: 128000 } : {}), parts = [];
				rec.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
				rec.onstop = function () { if (!parts.length) return; recBlob = new Blob(parts, { type: rec.mimeType || mt || 'audio/webm' }); recDone(); };
				rec.start(1000); cap.rec = rec;
			} catch (e) {}
		}
		tap.port.onmessage = function (e) { if (!cap) return; if (!Z) Z = new Y.Analyzer(ctx.sampleRate, e.data.length); Z.feed(e.data); };
		at.addEventListener('ended', function () { stopCapture(); });
		var live = $('ya-live');
		if (self && !$('ya-player').hidden) $('ya-player').appendChild(live); else root.insertBefore(live, $('ya-prog'));
		live.hidden = false; $('ya-cap').hidden = true; $('ya-res').hidden = true;
		var n = 0;
		cap.timer = setInterval(function () { if (!cap) return; liveTick(++n % 4 === 0); }, 250);
		liveTick(false);
		live.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	function stopCapture(silent) {
		if (!cap) return;
		var c = cap; cap = null;
		clearInterval(c.timer);
		var keepIt = !silent && c.rec;
		try { if (c.rec && c.rec.state !== 'inactive') { if (!keepIt) c.rec.onstop = null; c.rec.stop(); } } catch (e) {}
		try { c.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
		try { c.tap.port.onmessage = null; c.ctx.close(); } catch (e) {}
		$('ya-live').hidden = true; $('ya-cap').hidden = false;
		if (silent) return;
		if (!Z || Z.n < Z.sr * 0.5) { $('ya-capmsg').textContent = 'Nothing was heard. Was the video playing, with the tab\'s sound shared?'; return; }
		finish();
	}
	$('ya-stop').addEventListener('click', function () { stopCapture(); });
	[].forEach.call(document.querySelectorAll('[data-cap]'), function (b) { b.addEventListener('click', function () { startCapture(b.getAttribute('data-cap') === 'self'); }); });
	window.addEventListener('beforeunload', function () { stopCapture(true); });

	function liveTick(full) {
		var el = (Date.now() - cap.t0) / 1000;
		$('ya-el').textContent = Y.fmtTime(el);
		if (!Z) return;
		var k = Z.kblk.view(), n = k.length;
		$('ya-lm').textContent = Y.fmtDb(Y.lufsOf(k, Math.max(0, n - 4), n));
		$('ya-ls').textContent = Y.fmtDb(Y.lufsOf(k, Math.max(0, n - 30), n));
		$('ya-lt').textContent = Y.fmtDb(Y.db(Math.max(Z.tp, Z.pmax)));
		drawLiveSpec();
		if (full) { $('ya-li').textContent = Y.fmtDb(Z.loudness().integrated); if (n > 20) finish(true); }
	}
	function drawLiveSpec() {
		var cv = $('ya-livespec'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, C = colors(), NB = Z.NB;
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
		var bw = W / NB;
		for (var b = 0; b < NB; b++) { var v = Math.max(0, Math.min(1, (Z.last[b] + 100) / 100)), h = v * (H - 14); g.fillStyle = specColor(v); g.fillRect(b * bw, H - 14 - h, Math.ceil(bw), h); }
		freqTicks(g, W, H, C, function (f) { return Math.log(f / 30) / Math.log(Math.min(20000, Z.sr / 2) / 30) * W; });
	}

	/* ---------- results ---------- */
	function finish(live) {
		SUM = Z.summary(); SER = Z.series();
		if (!live) { view = null; userZoom = false; }
		$('ya-res').hidden = false;
		renderSummary(live);
		sil = Y.silences(SER.rms, S.thr, S.min); renderSil();
		renderMoments();
		renderTargets();
		specCols = -1;
		drawAll();
		drawLtas();
		if (!live) $('ya-res').scrollIntoView({ block: 'start', behavior: 'smooth' });
	}
	function tile(label, value, unit, sub, cls) { return '<div class="tu-stat' + (cls ? ' ' + cls : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + (unit ? ' <span class="ya-unit">' + unit + '</span>' : '') + '</div><div class="tu-stat__sub">' + (sub || '') + '</div></div>'; }
	function renderSummary(live) {
		var s = SUM, v = Y.verdict(s), d = Y.fmtDb;
		var vd = $('ya-verdict'); vd.className = 'ya-verdict ya-v--' + v.cls;
		$('ya-vh').textContent = (live ? 'So far: ' : '') + v.head; $('ya-vt').textContent = v.text;
		$('ya-vsrc').innerHTML = esc(SRC ? SRC.title : '') + ' · ' + Y.fmtTime(s.duration) + (SRC && SRC.kind === 'capture' ? ' heard from the tab' : '') + ' · ' + (s.channels === 2 ? 'stereo' : 'mono') + ', ' + s.sampleRate + ' Hz';
		var tpWarn = s.truePeak > -1 ? '<b class="ya-bad">Above −1:</b> may distort after the site re-encodes it.' : 'At or below −1: safe.';
		var plr = isFinite(s.plr) ? s.plr : NaN;
		var html = tile('Integrated loudness', d(s.integrated), 'LUFS', 'YouTube plays at about −14.', 'tu-stat--hero')
			+ tile('True peak', d(s.truePeak), 'dBTP', tpWarn + ' <button type="button" class="ya-seek" data-t="' + s.truePeakAt + '">at ' + Y.fmtTime(s.truePeakAt) + '</button>')
			+ tile('Loudness range', isFinite(s.range) ? s.range.toFixed(1) : '–', 'LU', s.range < 4 ? 'Very even.' : s.range < 9 ? 'Typical for speech.' : s.range < 15 ? 'Fairly wide.' : 'Very wide: quiet and loud parts far apart.')
			+ tile('Loudest 3 s', d(s.shortTermMax), 'LUFS', 'Max momentary ' + d(s.momentaryMax) + ' LUFS')
			+ tile('Sample peak', d(s.samplePeak), 'dBFS', s.channels === 2 ? 'Left ' + d(s.channelPeaks[0]) + ', right ' + d(s.channelPeaks[1]) : '')
			+ tile('Average level (RMS)', d(s.rms), 'dBFS', 'Crest factor ' + (isFinite(s.crest) ? s.crest.toFixed(1) + ' dB' : '–'))
			+ tile('Peak to loudness', isFinite(plr) ? plr.toFixed(1) : '–', 'dB', !isFinite(plr) ? '' : plr < 8 ? 'Very squashed (heavy limiting).' : plr < 12 ? 'Punchy, compressed.' : 'Plenty of dynamics.')
			+ tile('Noise floor', d(s.noiseFloor), 'dBFS', s.noiseFloor > -45 ? '<b class="ya-bad">Noisy:</b> hiss or room noise is easy to hear.' : s.noiseFloor > -60 ? 'Some background noise.' : 'Quiet background.')
			+ tile('Clipping', String(s.clips), s.clips === 1 ? 'spot' : 'spots', s.clips ? '<b class="ya-bad">Distorted</b> where the wave was cut flat.' : 'None found.')
			+ tile('Stereo', s.channels === 2 && isFinite(s.correlation) ? s.correlation.toFixed(2) : 'Mono', s.channels === 2 ? 'correlation' : '', esc(s.stereo.text) + (s.channels === 2 && isFinite(s.balance) && Math.abs(s.balance) >= 0.5 ? ' Balance ' + (s.balance > 0 ? 'L +' : 'R +') + Math.abs(s.balance).toFixed(1) + ' dB.' : ''));
		var dcMax = Math.max.apply(null, s.dc.map(Math.abs));
		if (dcMax > 0.002) html += tile('DC offset', (dcMax * 100).toFixed(2), '%', '<b class="ya-bad">The wave is shifted off centre.</b> A low-cut filter fixes it.');
		if (s.digitalSilence >= 1) html += tile('Digital silence', Y.fmtTime(s.digitalSilence, 1), '', 'Stretches of exact zero (nothing recorded).');
		$('ya-stats').innerHTML = html;
		$('ya-ytfix').hidden = !(SRC && SRC.yt); clFix();
		$('ya-seekhint').hidden = !canSeek();
	}
	function clFix() {
		var v = parseFloat(String($('ya-cl').value).replace(',', '.').replace('−', '-'));
		if (!SUM || !isFinite(v) || !isFinite(SUM.integrated)) { $('ya-clout').textContent = ''; return; }
		var up = SUM.integrated + Math.max(0, v);
		$('ya-clout').innerHTML = v > 0 ? 'The upload itself ≈ <b>' + Y.fmtDb(up) + ' LUFS</b> (YouTube turned it down ' + v.toFixed(1) + ' dB).' : 'Not turned down: the upload ≈ <b>' + Y.fmtDb(SUM.integrated) + ' LUFS</b> (YouTube never turns quiet videos up).';
	}
	$('ya-cl').addEventListener('input', clFix);
	function renderTargets() {
		var rows = Y.targets(SUM.integrated, SUM.truePeak).map(function (t) {
			var c = t.change, txt = !isFinite(t.diff) ? '–' : c === 0 ? 'No change' : (c > 0 ? 'Up ' : 'Down ') + Math.abs(c).toFixed(1) + ' dB';
			return '<tr><td><b>' + esc(t.name) + '</b>' + (t.note ? '<div class="ya-tnote">' + esc(t.note) + '</div>' : '') + '</td><td>' + t.lufs + ' LUFS</td><td class="' + (c < -0.05 ? 'ya-down' : c > 0.05 ? 'ya-up' : '') + '">' + txt + '</td></tr>';
		});
		$('ya-targets').tBodies[0].innerHTML = rows.join('');
	}
	function seekBtn(t, label) { return '<button type="button" class="ya-seek" data-t="' + t + '">' + label + '</button>'; }
	function renderSil() {
		var tot = sil.reduce(function (a, s) { return a + s.b - s.a; }, 0), longest = sil.reduce(function (m, s) { return Math.max(m, s.b - s.a); }, 0);
		$('ya-thrv').textContent = Y.fmtDb(S.thr, 0); $('ya-minv').textContent = S.min.toFixed(1);
		$('ya-silsum').textContent = !SUM ? '' : sil.length ? sil.length + ' quiet stretch' + (sil.length === 1 ? '' : 'es') + ', ' + Y.fmtTime(tot, 1) + ' in all (' + (tot / Math.max(0.1, SUM.duration) * 100).toFixed(0) + '% of the time). Longest ' + longest.toFixed(1) + ' s.' : 'No quiet stretches at these settings.';
		$('ya-sillist').innerHTML = sil.slice(0, 300).map(function (s) { return '<li>' + seekBtn(s.a, Y.fmtTime(s.a, 1) + ' – ' + Y.fmtTime(s.b, 1)) + ' <span class="ya-dim">' + (s.b - s.a).toFixed(1) + ' s</span></li>'; }).join('') + (sil.length > 300 ? '<li class="ya-dim">… and ' + (sil.length - 300) + ' more (Copy the list for all)</li>' : '');
	}
	function renderMoments() {
		var lo = Y.loudest(SER.shortTerm, 8, Math.max(5, SUM.duration / 40));
		$('ya-loudlist').innerHTML = lo.length ? lo.map(function (m) { return '<li>' + seekBtn(m.t, Y.fmtTime(m.t) + ' – ' + Y.fmtTime(m.t + 3)) + ' <span class="ya-dim">' + Y.fmtDb(m.lufs) + ' LUFS</span></li>'; }).join('') : '<li class="ya-dim">Needs at least 3 seconds of sound.</li>';
		var cl = [], at = SUM.clipAt; at.forEach(function (t) { var last = cl[cl.length - 1]; if (last && t - last.b < 0.5) { last.b = t; last.n++; } else cl.push({ a: t, b: t, n: 1 }); });
		$('ya-clipsum').textContent = SUM.clips ? SUM.clips + ' clipped spot' + (SUM.clips === 1 ? '' : 's') + (SUM.clips > at.length ? ' (the first ' + at.length + ' are listed)' : '') + '.' : 'No clipping found: the wave never sits flat at full scale.';
		$('ya-cliplist').innerHTML = cl.slice(0, 60).map(function (c) { return '<li>' + seekBtn(c.a, Y.fmtTime(c.a, 1)) + (c.n > 1 ? ' <span class="ya-dim">' + c.n + ' spots</span>' : '') + '</li>'; }).join('');
	}
	$('ya-thr').value = S.thr; $('ya-min').value = S.min;
	function silChange() { S.thr = +$('ya-thr').value; S.min = +$('ya-min').value; save(); if (!SER) { renderSil(); return; } sil = Y.silences(SER.rms, S.thr, S.min); renderSil(); drawAll(); }
	$('ya-thr').addEventListener('input', silChange); $('ya-min').addEventListener('input', silChange);
	$('ya-silcopy').addEventListener('click', function () { if (!sil.length) { toast('No quiet stretches to copy.'); return; } copy(sil.map(function (s) { return Y.fmtTime(s.a, 1) + ' - ' + Y.fmtTime(s.b, 1) + ' (' + (s.b - s.a).toFixed(1) + ' s)'; }).join('\n') + '\n', 'Copied ' + sil.length + ' quiet stretches.'); });

	/* ---------- playback ---------- */
	var audio = $('ya-audio'), audioURL = null;
	function canSeek() { return (!audio.hidden && !!audio.src) || !!(pageVid && SRC && SRC.kind === '3speak' && document.contains(pageVid)); }
	function setPlayback(url, show) {
		if (audioURL && audioURL.indexOf('blob:') === 0) URL.revokeObjectURL(audioURL);
		$('ya-dlrec').hidden = true;
		audioURL = url; audio.hidden = !url || !show;
		if (url) audio.src = url; else { audio.removeAttribute('src'); try { audio.load(); } catch (e) {} }
		$('ya-seekhint').hidden = !canSeek();
	}
	audio.addEventListener('error', function () { if (audio.src) { audio.hidden = true; $('ya-seekhint').hidden = true; } });
	function seek(t) {
		if (pageVid && SRC && SRC.kind === '3speak' && document.contains(pageVid)) { try { pageVid.currentTime = t; pageVid.play(); } catch (e) {} }
		else if (canSeek()) { try { audio.currentTime = t; audio.play(); } catch (e) {} }
		else toast('Jump to ' + Y.fmtTime(t) + ' in the player.');
		if (view && (t < view.a || t > view.b)) { var w = view.b - view.a; setView(t - w * 0.25, t + w * 0.75); }
	}
	root.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.ya-seek'); if (b) seek(+b.getAttribute('data-t')); });
	var phRaf = 0;
	function playEl() { return pageVid && SRC && SRC.kind === '3speak' && document.contains(pageVid) ? pageVid : audio; }
	function phLoop() { phRaf = 0; drawPlayhead(); if (!playEl().paused) phRaf = requestAnimationFrame(phLoop); }
	function watchVid(v) { v.addEventListener('play', function () { if (!phRaf) phRaf = requestAnimationFrame(phLoop); }); v.addEventListener('seeked', drawPlayhead); v.addEventListener('pause', drawPlayhead); }
	audio.addEventListener('play', function () { if (!phRaf) phRaf = requestAnimationFrame(phLoop); });
	audio.addEventListener('seeked', drawPlayhead); audio.addEventListener('pause', drawPlayhead);

	/* ---------- drawing helpers ---------- */
	function colors() {
		var cs = getComputedStyle(root), g = function (n, f) { return (cs.getPropertyValue(n) || '').trim() || f; };
		return { bg: g('--ya-cbg', '#f4f6f9'), grid: g('--ya-grid', 'rgba(0,0,0,.08)'), text: g('--ya-ctext', '#4b5563'), wave: g('--ya-wave', '#2563eb'), wave2: g('--ya-wave2', '#93b4f5'),
			m: g('--ya-m', '#94a3b8'), s: g('--ya-s', '#0f766e'), i: g('--ya-i', '#b91c1c'), t: g('--ya-t', 'rgba(22,163,74,.16)'), q: g('--ya-q', 'rgba(100,116,139,.18)'), c: g('--ya-c', '#dc2626'), fill: g('--ya-fill', 'rgba(37,99,235,.25)') };
	}
	function sizeCanvas(cv) {
		var w = cv.clientWidth, h = cv.clientHeight, r = Math.min(2, window.devicePixelRatio || 1);
		if (!w || !h) return null;
		if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
		var g = cv.getContext('2d'); g.setTransform(r, 0, 0, r, 0, 0); return g;
	}
	/* magma-like colour map */
	var STOPS = [[0, 4, 4, 18], [0.2, 50, 16, 98], [0.4, 125, 36, 130], [0.6, 205, 64, 113], [0.8, 251, 136, 97], [1, 252, 253, 191]], LUT = [];
	for (var li = 0; li < 256; li++) { var x = li / 255, j = 1; while (j < STOPS.length - 1 && STOPS[j][0] < x) j++; var a = STOPS[j - 1], b = STOPS[j], f = (x - a[0]) / (b[0] - a[0]); LUT.push([Math.round(a[1] + f * (b[1] - a[1])), Math.round(a[2] + f * (b[2] - a[2])), Math.round(a[3] + f * (b[3] - a[3]))]); }
	function specColor(v) { var c = LUT[Math.max(0, Math.min(255, Math.round(v * 255)))]; return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
	function freqTicks(g, W, H, C, xOf) {
		g.font = '11px system-ui, sans-serif'; g.fillStyle = C.text; g.textBaseline = 'bottom';
		[50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (f) { var x = xOf(f); if (x < 4 || x > W - 4) return; g.fillStyle = C.grid; g.fillRect(x, 0, 1, H - 14); g.fillStyle = C.text; g.fillText(Y.fmtHz(f).replace(' ', ''), x + 2, H); });
	}

	/* ---------- the timeline ---------- */
	function dur() { return Z ? Z.n / Z.sr : 0; }
	function setView(a, b) {
		var D = dur(); if (!D) return;
		var w = Math.max(Math.min(1, D), Math.min(D, b - a));
		if (a < 0) a = 0; if (a + w > D) a = D - w;
		view = { a: Math.max(0, a), b: Math.max(0, a) + w };
		drawAll();
	}
	function lanesOn() { return ['wave', 'loud', 'spec'].filter(function (l) { return S.lanes[l]; }); }
	function drawAll() {
		if (!Z || $('ya-res').hidden) return;
		var D = dur();
		if (!userZoom || !view) view = { a: 0, b: D }; else if (view.b > D) view = { a: Math.max(0, D - (view.b - view.a)), b: D };
		var on = lanesOn();
		[].forEach.call(root.querySelectorAll('.ya-lane'), function (el) { el.hidden = on.indexOf(el.getAttribute('data-l')) < 0; });
		$('ya-lanesbox').style.setProperty('--nl', String(Math.max(1, on.length)));
		$('ya-lanesbox').classList.toggle('ya-split', S.split && Z.nch === 2);
		var C = colors();
		if (S.lanes.wave) drawWave(C); if (S.lanes.loud) drawLoud(C); if (S.lanes.spec) drawSpec(C);
		drawAxis(C); drawPlayhead();
	}
	function xOfT(t, W) { return (t - view.a) / (view.b - view.a) * W; }
	function shade(g, W, H, C) {
		g.fillStyle = C.q; sil.forEach(function (s) { if (s.b < view.a || s.a > view.b) return; var x0 = xOfT(s.a, W), x1 = xOfT(s.b, W); g.fillRect(x0, 0, Math.max(1, x1 - x0), H); });
	}
	function grid(g, W, H, C) { var t = ticks(); g.fillStyle = C.grid; t.forEach(function (s) { var x = Math.round(xOfT(s, W)); g.fillRect(x, 0, 1, H); }); }
	function ticks() {
		var span = view.b - view.a, steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600], want = span / 8, st = steps[steps.length - 1];
		for (var i = 0; i < steps.length; i++) if (steps[i] >= want) { st = steps[i]; break; }
		var out = [], t = Math.ceil(view.a / st) * st; for (; t <= view.b + 1e-9; t += st) out.push(+t.toFixed(3));
		out.step = st; return out;
	}
	function drawWave(C) {
		var cv = $('ya-wave'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, nch = Z.nch, split = S.split && nch === 2, lanes = split ? 2 : 1, lh = H / lanes, db = S.ws === 'db';
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H); shade(g, W, H, C); grid(g, W, H, C);
		var bps = Z.sr / Z.WB, mins = Z.wmin.map(function (x) { return x.view(); }), maxs = Z.wmax.map(function (x) { return x.view(); }), nb = mins[0].length;
		var map = function (v) { if (!db) return v; var a = Math.abs(v); if (a < 1e-6) return 0; var d = Math.max(0, 1 + Y.db(a) / 60); return v < 0 ? -d : d; };
		for (var L = 0; L < lanes; L++) {
			var y0 = L * lh, mid = y0 + lh / 2, amp = lh / 2 - 2, chs = split ? [L] : (nch === 2 ? [0, 1] : [0]);
			g.fillStyle = C.grid; g.fillRect(0, Math.round(mid), W, 1);
			g.fillStyle = C.wave;
			for (var x = 0; x < W; x++) {
				var t0 = view.a + x / W * (view.b - view.a), t1 = view.a + (x + 1) / W * (view.b - view.a), i0 = Math.floor(t0 * bps), i1 = Math.max(i0 + 1, Math.floor(t1 * bps));
				if (i0 >= nb) break;
				var lo = 1, hi = -1;
				for (var c = 0; c < chs.length; c++) { var mn = mins[chs[c]], mx = maxs[chs[c]]; for (var i = i0; i < i1 && i < nb; i++) { if (mn[i] < lo) lo = mn[i]; if (mx[i] > hi) hi = mx[i]; } }
				if (hi < lo) continue;
				var ya = mid - map(hi) * amp, yb = mid - map(lo) * amp;
				g.fillRect(x, ya, 1, Math.max(1, yb - ya));
			}
			if (split) { g.fillStyle = C.text; g.font = '11px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText(L ? 'R' : 'L', 4, y0 + 3); }
		}
		/* clipping marks */
		g.fillStyle = C.c; SUM && SUM.clipAt.forEach(function (t) { if (t < view.a || t > view.b) return; g.fillRect(Math.round(xOfT(t, W)), 0, 2, 6); });
		if (db) { g.fillStyle = C.text; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText('0 dB', W - 30, 2); }
	}
	function drawLoud(C) {
		var cv = $('ya-loud'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, top = 0, bot = -60, yOf = function (v) { return (top - Math.max(bot, Math.min(top, v))) / (top - bot) * (H - 4) + 2; };
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H); shade(g, W, H, C); grid(g, W, H, C);
		g.fillStyle = C.t; g.fillRect(0, yOf(-13), W, yOf(-15) - yOf(-13));
		g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
		for (var v = -10; v > bot; v -= 10) { g.fillStyle = C.grid; g.fillRect(0, Math.round(yOf(v)), W, 1); g.fillStyle = C.text; g.fillText(String(v), 3, yOf(v) - 6); }
		var step = SER.step, n = SER.momentary.length;
		function line(arr, from, col, wdt) {
			g.strokeStyle = col; g.lineWidth = wdt; g.beginPath(); var pen = false;
			for (var x = 0; x <= W; x++) {
				var t0 = view.a + x / W * (view.b - view.a), t1 = view.a + (x + 1) / W * (view.b - view.a), i0 = Math.max(from, Math.round(t0 / step) - 1), i1 = Math.max(i0 + 1, Math.round(t1 / step) - 1), m = -Infinity;
				for (var i = i0; i < i1 && i < n; i++) if (arr[i] > m) m = arr[i];
				if (i0 >= n || m < bot - 1) { pen = false; continue; }
				var y = yOf(m); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
			}
			g.stroke();
		}
		line(SER.momentary, 3, C.m, 1.2);
		line(SER.shortTerm, 29, C.s, 2);
		if (isFinite(SUM.integrated)) { g.strokeStyle = C.i; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, yOf(SUM.integrated)); g.lineTo(W, yOf(SUM.integrated)); g.stroke(); g.setLineDash([]); g.fillStyle = C.i; g.fillText('Integrated ' + Y.fmtDb(SUM.integrated) + ' LUFS', 34, yOf(SUM.integrated) + (SUM.integrated > -8 ? 9 : -8)); }
	}
	function buildSpec() {
		if (specCols === Z.cols && specImg) return;
		var cols = Z.cols, NB = Z.NB, f = Math.max(1, Math.ceil(cols / 8192)), w = Math.max(1, Math.ceil(cols / f)), data = Z.spec.view();
		var cv = specImg || document.createElement('canvas'); cv.width = w; cv.height = NB;
		var g = cv.getContext('2d'), im = g.createImageData(w, NB), p = im.data;
		for (var x = 0; x < w; x++) for (var b = 0; b < NB; b++) {
			var m = 0; for (var k = x * f; k < Math.min(cols, (x + 1) * f); k++) { var v = data[k * NB + b]; if (v > m) m = v; }
			var c = LUT[m], o = ((NB - 1 - b) * w + x) * 4; p[o] = c[0]; p[o + 1] = c[1]; p[o + 2] = c[2]; p[o + 3] = 255;
		}
		g.putImageData(im, 0, 0); specImg = cv; specCols = cols; specImg.f = f;
	}
	function drawSpec(C) {
		var cv = $('ya-spec'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight; g.fillStyle = '#04040f'; g.fillRect(0, 0, W, H);
		if (!Z.cols) return; buildSpec();
		var colDur = Z.FN / Z.sr * specImg.f, sx = view.a / colDur, sw = (view.b - view.a) / colDur;
		g.imageSmoothingEnabled = sw > W; g.drawImage(specImg, sx, 0, Math.max(0.01, sw), specImg.height, 0, 0, W, H);
		g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
		var hi = Math.min(20000, Z.sr / 2);
		[100, 1000, 10000].forEach(function (f) { var y = H - Math.log(f / 30) / Math.log(hi / 30) * H; g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, Math.round(y), W, 1); g.fillStyle = '#e5e7eb'; g.fillText(Y.fmtHz(f), 3, y - 7); });
	}
	function drawAxis(C) {
		var cv = $('ya-axis'), g = sizeCanvas(cv); if (!g) return;
		var W = cv.clientWidth, H = cv.clientHeight, t = ticks(); g.clearRect(0, 0, W, H);
		g.font = '11px system-ui, sans-serif'; g.fillStyle = C.text; g.textBaseline = 'top';
		t.forEach(function (s) { var x = xOfT(s, W); g.fillRect(x, 0, 1, 4); var lab = Y.fmtTime(s, t.step < 1 ? 1 : 0), w = g.measureText(lab).width; g.fillText(lab, Math.max(0, Math.min(W - w, x - w / 2)), 6); });
	}
	var ph = document.createElement('div'); ph.className = 'ya-ph'; $('ya-lanesbox').appendChild(ph);
	var cross = document.createElement('div'); cross.className = 'ya-cross'; $('ya-lanesbox').appendChild(cross);
	function drawPlayhead() {
		if (!view || !canSeek()) { ph.hidden = true; return; }
		var m = playEl(), t = m.currentTime || 0, W = $('ya-lanesbox').clientWidth;
		if (!m.paused && (t > view.b || t < view.a) && userZoom) { var w = view.b - view.a; setView(t - w * 0.05, t + w * 0.95); }
		ph.hidden = t < view.a || t > view.b; ph.style.left = xOfT(t, W) + 'px';
	}

	/* hover, drag, zoom */
	var box = $('ya-lanesbox'), drag = null;
	function tAt(e) { var r = box.getBoundingClientRect(); return view.a + (e.clientX - r.left) / r.width * (view.b - view.a); }
	function readout(e) {
		if (!view || !Z) return;
		var r = box.getBoundingClientRect(), t = tAt(e), parts = ['<b>' + Y.fmtTime(t, 1) + '</b>'], i = Math.floor(t / SER.step);
		if (i >= 0 && i < SER.momentary.length) {
			parts.push('momentary ' + Y.fmtDb(SER.momentary[i]) + ' LUFS'); if (i >= 29) parts.push('short-term ' + Y.fmtDb(SER.shortTerm[i]) + ' LUFS');
			parts.push('RMS ' + Y.fmtDb(SER.rms[i]) + ' dBFS');
		}
		var sp = $('ya-spec'); if (S.lanes.spec && !sp.closest('.ya-lane').hidden) { var sr = sp.getBoundingClientRect(); if (e.clientY >= sr.top && e.clientY <= sr.bottom) { var fy = (sr.bottom - e.clientY) / sr.height, hi = Math.min(20000, Z.sr / 2); parts.push('≈ ' + Y.fmtHz(30 * Math.pow(hi / 30, fy))); } }
		$('ya-read').innerHTML = parts.join(' · ');
		cross.hidden = false; cross.style.left = (e.clientX - r.left) + 'px';
	}
	box.addEventListener('pointermove', function (e) {
		if (drag) {
			var r = box.getBoundingClientRect(), dt = (e.clientX - drag.x) / r.width * (drag.b - drag.a);
			if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
			if (drag.moved) { userZoom = true; setView(drag.a - dt, drag.b - dt); }
		}
		readout(e);
	});
	box.addEventListener('pointerleave', function () { cross.hidden = true; });
	box.addEventListener('pointerdown', function (e) { if (!view || e.button > 0) return; drag = { x: e.clientX, a: view.a, b: view.b, moved: false, id: e.pointerId }; try { box.setPointerCapture(e.pointerId); } catch (x) {} });
	box.addEventListener('pointerup', function (e) { var d = drag; drag = null; if (d && !d.moved && view) { if (canSeek()) seek(Math.max(0, tAt(e))); } });
	box.addEventListener('pointercancel', function () { drag = null; });
	function zoomAt(t, f) { if (!view) return; userZoom = true; var a = t - (t - view.a) * f, b = t + (view.b - t) * f; if (b - a >= dur() - 1e-6) { userZoom = false; view = null; drawAll(); return; } setView(a, b); }
	box.addEventListener('wheel', function (e) {
		if (!view) return;
		var filled = $('ya-tl').classList.contains('mes-pfill');
		if (!(e.ctrlKey || e.metaKey || filled)) return;
		e.preventDefault();
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { var w = view.b - view.a; userZoom = true; setView(view.a + e.deltaX / box.clientWidth * w, view.b + e.deltaX / box.clientWidth * w); return; }
		zoomAt(tAt(e), Math.exp(e.deltaY * 0.0025));
	}, { passive: false });
	box.addEventListener('dblclick', function () { userZoom = false; view = null; drawAll(); });
	$('ya-zin').addEventListener('click', function () { if (view) zoomAt((view.a + view.b) / 2, 0.5); });
	$('ya-zout').addEventListener('click', function () { if (view) zoomAt((view.a + view.b) / 2, 2); });
	$('ya-zall').addEventListener('click', function () { userZoom = false; view = null; drawAll(); });

	/* lanes / scale / split */
	function paintSeg() {
		[].forEach.call(root.querySelectorAll('#ya-lanes button'), function (b) { b.setAttribute('aria-pressed', S.lanes[b.getAttribute('data-lane')] ? 'true' : 'false'); });
		[].forEach.call(root.querySelectorAll('#ya-wscale button'), function (b) { b.setAttribute('aria-pressed', S.ws === b.getAttribute('data-ws') ? 'true' : 'false'); });
		$('ya-split').checked = !!S.split;
	}
	root.querySelector('#ya-lanes').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var l = b.getAttribute('data-lane'); S.lanes[l] = !S.lanes[l]; if (!lanesOn().length) S.lanes[l] = true; save(); paintSeg(); drawAll(); });
	root.querySelector('#ya-wscale').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.ws = b.getAttribute('data-ws'); save(); paintSeg(); drawAll(); });
	$('ya-split').addEventListener('change', function () { S.split = this.checked; save(); drawAll(); });
	paintSeg();

	/* ---------- average spectrum ---------- */
	function drawLtas() {
		var cv = $('ya-ltas'), g = sizeCanvas(cv); if (!g || !Z || !Z.ltasN) return;
		var W = cv.clientWidth, H = cv.clientHeight, C = colors(), N = Z.FN, sr = Z.sr, hi = Math.min(20000, sr / 2), lo = 20, P = Z.ltas, n = Z.ltasN;
		var xOf = function (f) { return Math.log(f / lo) / Math.log(hi / lo) * W; }, fOf = function (x) { return lo * Math.pow(hi / lo, x / W); };
		var vals = [], mx = -Infinity;
		for (var x = 0; x < W; x++) {
			var b0 = Math.floor(fOf(x) * N / sr), b1 = Math.max(b0 + 1, Math.floor(fOf(x + 1) * N / sr)), s = 0, c = 0;
			for (var b = b0; b < b1 && b <= N / 2; b++) { s += P[b]; c++; }
			var v = c ? Y.pdb(s / c / n) : -Infinity; vals.push(v); if (v > mx) mx = v;
		}
		var top = isFinite(mx) ? Math.ceil(mx / 10) * 10 : 0, bot = top - 80, PH = H - 30, yOf = function (v) { return 4 + (top - Math.max(bot, Math.min(top, v))) / (top - bot) * (PH - 4); };
		g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
		g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
		for (var d = top - 10; d >= bot; d -= 20) { g.fillStyle = C.grid; g.fillRect(0, Math.round(yOf(d)), W, 1); g.fillStyle = C.text; g.fillText(d + ' dB', 3, yOf(d) - 6); }
		var regions = [[20, 60, 'Rumble'], [60, 250, 'Bass'], [250, 2000, 'Mids'], [2000, 6000, 'Presence'], [6000, 20000, 'Air']];
		g.textBaseline = 'bottom';
		regions.forEach(function (r, i) { var a = xOf(r[0]), b2 = Math.min(W, xOf(Math.min(r[1], hi))); if (b2 <= a) return; if (i % 2) { g.fillStyle = C.q; g.fillRect(a, 0, b2 - a, PH); } g.fillStyle = C.text; var tw = g.measureText(r[2]).width; if (b2 - a > tw + 4) g.fillText(r[2], (a + b2) / 2 - tw / 2, H - 15); });
		g.beginPath(); g.moveTo(0, PH);
		vals.forEach(function (v, x) { g.lineTo(x, isFinite(v) ? yOf(v) : PH); }); g.lineTo(W, PH); g.closePath();
		g.fillStyle = C.fill; g.fill();
		g.beginPath(); vals.forEach(function (v, x) { var y = isFinite(v) ? yOf(v) : PH; if (x) g.lineTo(x, y); else g.moveTo(x, y); }); g.strokeStyle = C.wave; g.lineWidth = 1.5; g.stroke();
		g.textBaseline = 'bottom'; g.fillStyle = C.text;
		[50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(function (f) { var xx = xOf(f); if (xx > W - 20) return; g.fillStyle = C.grid; g.fillRect(xx, 0, 1, PH); g.fillStyle = C.text; g.fillText(Y.fmtHz(f).replace(' ', ''), xx + 2, H); });
		/* energy share: bass / mids / highs */
		var sh = [0, 0, 0], all = 0; for (var k = 1; k <= N / 2; k++) { var f = k * sr / N, p = P[k]; if (f < 20) continue; all += p; sh[f < 250 ? 0 : f < 4000 ? 1 : 2] += p; }
		$('ya-spnote').textContent = all > 0 ? 'Where the energy is: bass (under 250 Hz) ' + Math.round(sh[0] / all * 100) + '%, mids (250 Hz – 4 kHz) ' + Math.round(sh[1] / all * 100) + '%, highs ' + Math.round(sh[2] / all * 100) + '%. Speech usually has most in the mids; music more in the bass.' : '';
	}

	/* ---------- export ---------- */
	function copy(text, done) {
		var ok = function () { toast(done || 'Copied.'); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
		function fallback() { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Copy failed.'); } t.remove(); }
	}
	function baseName() { return String(SRC && SRC.title || 'audio').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'audio'; }
	function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
	$('ya-copy').addEventListener('click', function () { if (!SUM) return; copy(Y.reportText(SUM, SRC && (SRC.title + (SRC.link ? ' (' + SRC.link + ')' : ''))), 'Summary copied.'); });
	$('ya-csv').addEventListener('click', function () { if (!SER) return; download(new Blob([Y.csv(SER)], { type: 'text/csv' }), baseName() + '-loudness.csv'); });
	$('ya-png').addEventListener('click', function () {
		if (!SUM) return;
		var cvs = ['ya-wave', 'ya-loud', 'ya-spec', 'ya-axis'].map($).filter(function (c) { return !c.closest('.ya-lane') || !c.closest('.ya-lane').hidden; });
		var r = cvs[0].width / cvs[0].clientWidth, W = cvs[0].width, pad = Math.round(14 * r), head = Math.round(46 * r), H = head + cvs.reduce(function (s, c) { return s + c.height + pad / 2; }, 0) + pad;
		var out = document.createElement('canvas'); out.width = W + pad * 2; out.height = H;
		var g = out.getContext('2d'), C = colors(), dark = document.body.classList.contains('dark-mode');
		g.fillStyle = dark ? '#1a1a1a' : '#ffffff'; g.fillRect(0, 0, out.width, H);
		g.fillStyle = dark ? '#e5e7eb' : '#111827'; g.font = 'bold ' + Math.round(15 * r) + 'px system-ui, sans-serif'; g.textBaseline = 'top';
		g.fillText((SRC && SRC.title || 'Audio') + ' · ' + Y.fmtDb(SUM.integrated) + ' LUFS · true peak ' + Y.fmtDb(SUM.truePeak) + ' dBTP · LRA ' + (SUM.range || 0).toFixed(1) + ' LU', pad, pad);
		g.font = Math.round(11 * r) + 'px system-ui, sans-serif'; g.fillStyle = C.text; g.fillText('mes.fm/youtube-audio', pad, pad + Math.round(20 * r));
		var y = head; cvs.forEach(function (c) { g.drawImage(c, pad, y); y += c.height + pad / 2; });
		out.toBlob(function (b) { if (b) download(b, baseName() + '-audio.png'); }, 'image/png');
	});

	/* ---------- Fill window / Full screen, resize, theme ---------- */
	function redraw() { drawAll(); drawLtas(); if (cap && Z) drawLiveSpec(); }
	function addPanels() {
		if (!window.MESPanel) return;
		MESPanel.add($('ya-tl'), { bar: $('ya-tlbtns'), onChange: function () { setTimeout(redraw, 30); } });
		MESPanel.add($('ya-sp'), { bar: $('ya-spbtns'), onChange: function () { setTimeout(drawLtas, 30); } });
		MESPanel.add($('ya-player'), { bar: $('ya-pbtns'), onChange: function () { setTimeout(redraw, 30); } });
	}
	if (window.MESPanel) addPanels(); else window.addEventListener('load', addPanels);
	var rt = 0; function later() { clearTimeout(rt); rt = setTimeout(redraw, 60); }
	if (window.ResizeObserver) { var ro = new ResizeObserver(later); ro.observe($('ya-lanesbox')); ro.observe($('ya-ltas')); } else window.addEventListener('resize', later);
	new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* phones and Firefox / Safari can't share a tab's sound: say so up front instead of after a click */
	var canCap = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && AC && window.AudioWorkletNode) && !/Firefox\//.test(navigator.userAgent) && !(/Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)\//.test(navigator.userAgent));
	if (!canCap) [].forEach.call(document.querySelectorAll('[data-cap]'), function (b) {
		b.disabled = true;
		var p = document.createElement('p'); p.className = 'ya-nocap';
		p.textContent = 'This browser can\'t share a tab\'s sound with a page (phones, Firefox and Safari can\'t). Open this page in Chrome, Edge, Brave or Opera on a computer, or download the video and drop the file.';
		b.parentNode.parentNode.insertBefore(p, b.parentNode.nextSibling);
	});
	/* ---------- start ---------- */
	try { var q = new URL(location.href).searchParams.get('u'); if (q) { $('ya-url').value = q; setTab('link'); openLink(q); } } catch (e) {}
	window.MESYADebug = { analyse: function (ch, sr, title) { return analyseChannels(ch, sr, { kind: 'file', title: title || 'test' }, { cancel: false }); }, state: function () { return { Z: Z, SUM: SUM, view: view }; } };
})();
