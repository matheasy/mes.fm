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
		/* 3Speak: 3speak.tv/watch?v=user/permlink, 3speak.tv/@user/permlink (new site), play.3speak.tv/watch|embed?v=user/permlink */
		if (/(^|\.)3speak\.(tv|co|online)$/.test(h)) {
			var v3 = q.get("v") || ((m = p.match(/^\/(?:(?:watch|embed|video|v)\/)?@?([a-z0-9.-]{3,16}\/[a-z0-9-]+)\/?$/i)) ? m[1] : "");
			if (!/^[a-z0-9.-]{3,16}\/[a-z0-9-]{1,255}$/i.test(v3)) return { ok: false, reason: "That 3Speak link has no video in it (it should look like 3speak.tv/@user/video or end in ?v=user/permlink)." };
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
	/* 3Speak's embed API (Nov 2026) answers with its relay play.3speak.tv/hls?u=<real manifest>; newer Chrome tries to play HLS itself and
	   fails on that relay, so use the real (CORS-open) address inside it; anything else is returned as it is */
	Y.speakUrl = function (u) {
		var m = /^https:\/\/play\.3speak\.tv\/hls\?u=([^&#]+)/.exec(String(u || ""));
		if (!m) return u;
		try { var d = decodeURIComponent(m[1]); return /^https:\/\/[a-z0-9.-]+\/[^\s"'<>]+\.m3u8(\?[^\s"'<>]*)?$/i.test(d) ? d : u; } catch (e) { return u; }
	};
	/* play HLS with hls.js wherever Media Source exists (native HLS only where it doesn't: iPhone Safari); Chrome now says "maybe" to HLS
	   but fails on some streams */
	Y.hlsNative = function (v, w) { w = w || (typeof window !== "undefined" ? window : {}); return !(w.MediaSource || w.ManagedMediaSource) && !!(v && v.canPlayType && v.canPlayType("application/vnd.apple.mpegurl")); };
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
