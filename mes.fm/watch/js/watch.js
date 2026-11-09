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

/* MES Watch -- mes.fm/watch. Pure helpers (node-testable): what a pasted link is (uses MESYA.parseLink from the YouTube Audio Analyzer),
   how the page plays it, the queue / saved / history lists, resume points and share links. */
(function (root) {
	"use strict";
	var W = {}, Y = root.MESYA || (typeof require === "function" ? require("../youtube-audio/lib.js") : null);
	W.MAX_HIST = 300; W.MAX_LIST = 500;

	/* how a link plays: yt = YouTube IFrame API, hls = 3Speak stream in our own <video>, odysee = Odysee file in our own <video>,
	   file = a direct media file, embed = the site's own player (no speed / resume), open = can only be opened on the site */
	W.mode = function (it) {
		if (!it) return "open";
		if (it.k === "youtube") return "yt";
		if (it.k === "3speak") return "hls";
		if (it.k === "odysee") return it.id ? "odysee" : "open";
		if (it.k === "direct") return "file";
		if (it.e) return "embed";
		return "open";
	};
	W.canSpeed = function (it) { var m = W.mode(it); return m === "yt" || m === "hls" || m === "odysee" || m === "file"; };
	W.SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
	W.ytSpeed = function (r) { return Math.max(0.25, Math.min(2, r)); };   // YouTube's player stops at 2x

	/* one link -> item {k, id, u (link to open), e (embed url), s (start s), key, t (title), th (thumbnail)} or {err} */
	W.item = function (text) {
		var L = Y.parseLink(text);
		if (!L.ok) return { err: L.reason };
		try { if (!/\./.test(new URL(L.watch).hostname)) return { err: "That is not a web link." }; } catch (e) { return { err: "That is not a web link." }; }
		var it = { k: L.kind, id: L.id || null, u: L.watch, e: L.embed || null, s: L.start || 0, t: "", th: "" };
		if (L.kind === "direct") { it.id = L.watch; it.t = L.file || "Media file"; }
		it.key = W.key(it);
		if (it.k === "youtube") it.th = "https://i.ytimg.com/vi/" + it.id + "/mqdefault.jpg";
		return it;
	};
	W.key = function (it) { return it.k + ":" + (it.id || it.u); };
	/* text with any number of links (lines, spaces, commas) -> {items, errors}; duplicates dropped */
	W.parseMany = function (text) {
		var parts = String(text || "").split(/[\s,]+/).filter(function (x) { return /[./]/.test(x) || /^@[A-Za-z0-9._-]{3,30}$/.test(x); }), seen = {}, items = [], errors = [], lists = [];
		var chans = [];
		parts.forEach(function (p) {
			var ch = W.channelRef(p); if (ch) { if (chans.indexOf(ch) < 0) chans.push(ch); return; }
			var pl = W.playlistId(p);
			if (pl && lists.indexOf(pl) < 0) lists.push(pl);
			if (pl && !/[?&]v=|youtu\.be\/[\w-]{6}/.test(p)) return;   // a playlist page: its videos come from YouTube later
			var it = W.item(p); if (it.err) { errors.push({ text: p, reason: it.err }); return; } if (seen[it.key]) return; seen[it.key] = 1; items.push(it);
		});
		return { items: items, errors: errors, playlists: lists, channels: chans };
	};
	/* a YouTube channel in a link or as @handle -> the key /api/yt-latest takes ("@name" or "UC..."), else "" */
	W.channelRef = function (text) {
		var t = String(text || "").trim(), m;
		if ((m = /^@([A-Za-z0-9._-]{3,30})$/.exec(t))) return "@" + m[1];
		if (!/^(https?:\/\/)?([\w-]+\.)?youtube\.com\//i.test(t)) return "";
		if ((m = /youtube\.com\/@([A-Za-z0-9._-]{3,30})(?:[\/?#]|$)/i.exec(t))) return "@" + m[1];
		if ((m = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})(?:[\/?#]|$)/i.exec(t))) return m[1];
		return "";
	};
	/* YouTube playlist id in a link (list=PL..., OLAK..., UU...), or "" (radio mixes RD... are endless, so left out) */
	W.playlistId = function (text) {
		var t = String(text || ""); if (!/^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(t)) return "";
		var m = /[?&#]list=([A-Za-z0-9_-]{10,64})/.exec(t);
		if (!m || /^RD/.test(m[1])) return "";
		return m[1];
	};
	/* ---------- my own named lists ---------- */
	W.newList = function (name, items, now) { return { id: "l" + (now || Date.now()).toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: String(name || "My list").slice(0, 80), items: (items || []).slice(0, W.MAX_LIST) }; };
	W.findList = function (lists, id) { for (var i = 0; i < lists.length; i++) if (lists[i].id === id) return lists[i]; return null; };
	/* zoom: clamp scale 1..4 and keep the picture covering the box (no empty edges while zoomed in) */
	W.clampZoom = function (z, w, h) {
		var k = Math.max(1, Math.min(4, +z.k || 1)), mx = (k - 1) * w / 2, my = (k - 1) * h / 2;
		return { k: k, x: Math.max(-mx, Math.min(mx, +z.x || 0)), y: Math.max(-my, Math.min(my, +z.y || 0)) };
	};
	/* scale that makes a 16:9 picture fill a w x h box (crops the sides or top / bottom) */
	W.fillZoom = function (w, h, ar) { ar = ar || 16 / 9; if (!w || !h) return 1; var box = w / h; return Math.round(Math.max(box / ar, ar / box) * 100) / 100; };
	W.siteName = function (it) { return (Y.SITES && Y.SITES[it.k]) || "Video"; };
	W.label = function (it) { if (it.t) return it.t; if (it.k === "youtube") return "YouTube video " + it.id; if (it.id) return W.siteName(it) + ": " + it.id; try { var u = new URL(it.u); return W.siteName(it) + " link: " + u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""); } catch (e) { return it.u; } };

	/* ---------- lists (plain arrays of items, newest / first wins) ---------- */
	W.add = function (list, items, atFront) {
		var keys = {}; list.forEach(function (x) { keys[x.key] = 1; });
		var fresh = items.filter(function (x) { if (keys[x.key]) return false; keys[x.key] = 1; return true; });
		var out = atFront ? fresh.concat(list) : list.concat(fresh);
		return out.slice(0, W.MAX_LIST);
	};
	W.remove = function (list, key) { return list.filter(function (x) { return x.key !== key; }); };
	W.move = function (list, from, to) {
		var a = list.slice(); if (from < 0 || from >= a.length) return a;
		to = Math.max(0, Math.min(a.length - 1, to)); var x = a.splice(from, 1)[0]; a.splice(to, 0, x); return a;
	};
	W.indexOf = function (list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return i; return -1; };

	/* ---------- history + resume ---------- */
	W.touch = function (hist, it, pos, dur, now) {
		var h = W.remove(hist, it.key), rec = {}; for (var k in it) rec[k] = it[k];
		rec.pos = Math.max(0, +pos || 0); rec.dur = Math.max(0, +dur || 0); rec.at = now || Date.now();
		if (W.done(rec)) rec.pos = rec.dur;
		h.unshift(rec); return h.slice(0, W.MAX_HIST);
	};
	W.done = function (r) { return r.dur > 0 && (r.dur - r.pos < Math.max(15, r.dur * 0.04)); };
	/* where to start: the link's own ?t= wins, else the saved spot (only when it is worth it), else 0 */
	W.resumeAt = function (it, rec) {
		if (it.s) return it.s;
		if (!rec || !rec.pos || rec.pos < 20 || W.done(rec)) return 0;
		return Math.floor(rec.pos - 3);
	};
	W.pct = function (r) { return r && r.dur ? Math.max(0, Math.min(100, r.pos / r.dur * 100)) : 0; };

	/* ---------- share links ---------- */
	W.shareUrl = function (base, items, at, name) {
		var u = items.map(function (x) { return x.u; });
		var q = u.length === 1 && !name ? "v=" + encodeURIComponent(u[0]) + (at ? "&t=" + Math.floor(at) : "") : "l=" + u.map(encodeURIComponent).join("|");
		return base + "?" + q + (name ? "&n=" + encodeURIComponent(String(name).slice(0, 80)) : "");
	};
	/* query string -> {links: [...], t} */
	W.fromQuery = function (search) {
		var q = new URLSearchParams(String(search || "").replace(/^\?/, "")), links = [];
		if (q.get("v")) links.push(q.get("v"));
		if (q.get("l")) q.get("l").split("|").forEach(function (x) { if (x) links.push(x); });
		return { links: links, t: Math.max(0, parseInt(q.get("t") || "0", 10) || 0), name: (q.get("n") || "").slice(0, 80) };
	};
	/* the same video at a time: the site's own link with ?t= where the site has one */
	W.atTime = function (it, t) {
		t = Math.floor(t || 0);
		if (it.k === "youtube") return "https://www.youtube.com/watch?v=" + it.id + (t ? "&t=" + t + "s" : "");
		return it.u;
	};
	W.fmt = function (s) {
		s = Math.max(0, Math.floor(+s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
	};
	W.ago = function (ms, now) {
		var d = Math.max(0, ((now || Date.now()) - ms) / 1000);
		if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + " min ago"; if (d < 86400) return Math.floor(d / 3600) + " h ago";
		var n = Math.floor(d / 86400); return n === 1 ? "yesterday" : n + " days ago";
	};
	root.MESWatch = W;
	if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Watch -- mes.fm/watch. A plain player for YouTube (IFrame API, nocookie), 3Speak (HLS in our own <video>), Odysee (file in our own <video>),
   direct media files, and the own embed players of Rumble / BitChute / X. Lists (Up next, Saved, History with resume points) live in
   localStorage mes-watch:v1; nothing is sent to MES. */
(function () {
	'use strict';
	var W = window.MESWatch, $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-watch:v1', HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
	var S = { q: [], i: -1, saved: [], hist: [], lists: [], chans: [], shorts: false, rate: 1, tab: 'q', auto: true, priv: true, histOn: true, pz: true, pzHint: 0, zoom: { k: 1, x: 0, y: 0 } };
	var openList = null;
	try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) for (var k in S) if (raw[k] != null) S[k] = raw[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function toast(t) { var x = $('wt-toast'); x.textContent = t; x.classList.add('tu-toast--show'); clearTimeout(x._t); x._t = setTimeout(function () { x.classList.remove('tu-toast--show'); }, 2200); }
	function msg(t) { $('wt-msg').textContent = t || ''; }
	function copy(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Link copied'); }, function () { window.prompt('Copy this link:', t); }); }
	function loadScript(u) { return new Promise(function (res, rej) { var x = document.createElement('script'); x.src = u; x.onload = res; x.onerror = function () { rej(new Error('Could not load the player.')); }; document.head.appendChild(x); }); }

	/* ---------- titles / thumbnails (filled in lazily, shared by all lists) ---------- */
	var META = {}, metaBusy = 0, metaQ = [];
	function setMeta(key, t, th) {
		if (!t && !th) return; META[key] = { t: t, th: th };
		[S.q, S.saved, S.hist].concat(S.lists.map(function (l) { return l.items; })).forEach(function (L) { L.forEach(function (x) { if (x.key === key) { if (t && !x.t) x.t = t; if (th && !x.th) x.th = th; } }); });
		if (cur && cur.key === key) { if (t && !cur.t) cur.t = t; if (th && !cur.th) cur.th = th; showMeta(); }
		save(); renderListSoon();
	}
	function needMeta(it) {
		if ((it.t && it.th) || META[it.key] || metaQ.some(function (x) { return x.key === it.key; })) return;
		if (!/^(youtube|3speak|odysee)$/.test(it.k)) return;
		META[it.key] = { pending: 1 }; metaQ.push(it); pumpMeta();
	}
	function pumpMeta() {
		while (metaBusy < 3 && metaQ.length) {
			var it = metaQ.shift(); metaBusy++;
			fetchMeta(it).then(function (r) { if (r) setMeta(r.key, r.t, r.th); }, function () {}).then(function () { metaBusy--; pumpMeta(); });
		}
	}
	function fetchMeta(it) {
		if (it.k === 'youtube') return fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + it.id), { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && { key: it.key, t: j.title, th: it.th }; });
		if (it.k === '3speak') return speakInfo(it).then(function (i) { return { key: it.key, t: i.title, th: i.thumb }; });
		if (it.k === 'odysee') return odyseeGet(it).then(function (i) { return { key: it.key, t: i.title, th: i.thumb }; });
		return Promise.resolve(null);
	}
	function speakInfo(it) {
		return fetch('https://play.3speak.tv/api/embed?v=' + encodeURIComponent(it.id).replace('%2F', '/'), { credentials: 'omit' }).then(function (r) {
			if (!r.ok) throw new Error('3Speak answered ' + r.status + '.'); return r.json();
		}).then(function (j) {
			var u = j && (j.videoUrl || j.videoUrlFallback1 || j.videoUrlFallback2);
			if (!u) throw new Error('3Speak has no video for that link.');
			return { url: u, title: j.title || '', thumb: j.thumbnail || j.thumbnailUrl || '' };
		});
	}
	function odyseeInfo(uri) {
		return fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=resolve', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'resolve', params: { urls: [uri] }, id: 1 }) })
			.then(function (r) { return r.json(); }).then(function (j) { var c = j && j.result && j.result[uri], v = (c && c.value) || {}; return { title: v.title || '', thumb: (v.thumbnail && v.thumbnail.url) || '' }; });
	}
	var odyCache = {};
	function odyseeGet(it) {
		if (odyCache[it.key]) return odyCache[it.key];
		var uri = 'lbry://' + String(it.id).split('/').map(function (s) { return s.replace(/:([0-9a-f]+)$/i, '#$1'); }).join('/');
		var p = fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=get', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'get', params: { uri: uri, save_file: false }, id: 1 }) })
			.then(function (r) { return r.json(); }).then(function (j) {
				var res = j && j.result; if (!res || !res.streaming_url) throw new Error('Odysee could not find that video.');
				return odyseeInfo(uri).then(function (i) { return { url: res.streaming_url, title: i.title, thumb: i.thumb }; }, function () { return { url: res.streaming_url, title: '', thumb: '' }; });
			});
		odyCache[it.key] = p; p.catch(function () { delete odyCache[it.key]; });
		return p;
	}

	/* ---------- the player ---------- */
	var cur = null, gen = 0, yt = null, vid = null, hls = null, saveT = 0, rateNote = 0;
	function histRec(it) { var i = W.indexOf(S.hist, it.key); return i < 0 ? null : S.hist[i]; }
	function teardown() {
		clearInterval(saveT); saveT = 0;
		if (yt) { try { yt.destroy(); } catch (e) {} yt = null; }
		if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
		if (vid) { try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (e) {} vid = null; }
		setStage('');
	}
	function setStage(h) { $('wt-stage').innerHTML = h; zoomLayer(); }
	function position() {
		try { if (yt && yt.getCurrentTime) return { pos: yt.getCurrentTime() || 0, dur: yt.getDuration() || 0 }; } catch (e) {}
		if (vid) return { pos: vid.currentTime || 0, dur: isFinite(vid.duration) ? vid.duration : 0 };
		return null;
	}
	function remember() {
		if (!cur || S.histOn === false) return; var p = position(); if (!p || (!p.pos && !p.dur)) return;
		S.hist = W.touch(S.hist, cur, p.pos, p.dur); save(); if (S.tab === 'hist') renderListSoon();
	}
	window.addEventListener('pagehide', remember);
	document.addEventListener('visibilitychange', function () { if (document.hidden) remember(); });

	function play(it, opts) {
		opts = opts || {};
		remember();
		var j = W.indexOf(S.q, it.key);
		if (j < 0) { S.q = S.q.slice(); S.q.splice(Math.max(0, S.i + 1), 0, it); j = Math.max(0, S.i + 1); }
		S.i = j; cur = S.q[j]; save();
		var g = ++gen; teardown();
		var stage = $('wt-stage'), mode = W.mode(cur), start = opts.t != null ? opts.t : W.resumeAt(cur, histRec(cur));
		showMeta(); renderList(); needMeta(cur);
		if (S.histOn !== false) { S.hist = W.touch(S.hist, cur, start, (histRec(cur) || {}).dur || 0); save(); }
		if (mode === 'yt') {
			var holder;
			if (S.priv) {
				// our own frame, loaded without the person's cookies (credentialless: Chromium browsers), so nothing reaches their YouTube history
				holder = document.createElement('iframe'); holder.id = 'wt-yt'; holder.setAttribute('credentialless', ''); try { holder.credentialless = true; } catch (e) {}
				holder.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'; holder.allowFullscreen = true; holder.title = W.label(cur);
				holder.referrerPolicy = 'strict-origin-when-cross-origin';
				holder.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(cur.id) + '?enablejsapi=1&rel=0&playsinline=1&iv_load_policy=3&autoplay=1&start=' + (start || 0) + '&origin=' + encodeURIComponent(location.origin);
			} else { holder = document.createElement('div'); holder.id = 'wt-yt'; }
			stage.appendChild(holder);
			ensureYT().then(function () {
				if (g !== gen) return;
				yt = new YT.Player('wt-yt', { host: S.priv ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com', videoId: cur.id, width: '100%', height: '100%',
					playerVars: { rel: 0, playsinline: 1, modestbranding: 1, autoplay: 1, start: start || 0, iv_load_policy: 3 },
					events: {
						onReady: function (e) { if (g !== gen) return; try { e.target.setPlaybackRate(W.ytSpeed(S.rate)); e.target.playVideo(); var d = e.target.getVideoData(); if (d && d.title) setMeta(cur.key, d.title, cur.th); } catch (x) {} syncSpeed(); },
						onStateChange: function (e) { if (g === gen && e.data === 0) ended(); },
						onError: function (e) { if (g === gen) failed(e && (e.data === 100 || e.data === 5) ? 'YouTube says this video is unavailable (removed or private).' : 'YouTube would not play this video here (the owner may have turned off playing on other sites).'); }
					} });
				saveT = setInterval(remember, 5000);
			}, function (e) { if (g === gen) failed(e.message); });
		} else if (mode === 'hls' || mode === 'odysee' || mode === 'file') {
			setStage('<p class="wt-loading">Loading the video…</p>');
			var src = mode === 'hls' ? speakInfo(cur) : mode === 'odysee' ? odyseeGet(cur) : Promise.resolve({ url: cur.u, title: cur.t });
			src.then(function (info) {
				if (g !== gen) return;
				if (info.title || info.thumb) setMeta(cur.key, info.title, info.thumb);
				var v = document.createElement('video'); v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.autoplay = true; v.preload = 'auto';
				if (info.thumb) v.poster = info.thumb;
				setStage(''); stage.appendChild(v); vid = v;
				v.addEventListener('loadedmetadata', function () { if (start && start < (v.duration || 1e9) - 5) v.currentTime = start; v.playbackRate = S.rate; }, { once: true });
				v.addEventListener('ended', function () { if (g === gen) ended(); });
				v.addEventListener('ratechange', function () { if (g === gen && Math.abs(v.playbackRate - S.rate) > 0.001) { S.rate = v.playbackRate; save(); syncSpeed(); } });
				v.addEventListener('error', function () { if (g === gen) failed('This browser could not play the video file.'); });
				if (mode === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
					return (window.Hls ? Promise.resolve() : loadScript(HLS_URL)).then(function () {
						if (g !== gen) return; if (!window.Hls || !Hls.isSupported()) throw new Error('This browser can\'t play 3Speak videos here.');
						hls = new Hls(); hls.loadSource(info.url); hls.attachMedia(v);
						hls.on(Hls.Events.ERROR, function (ev, d) { if (d && d.fatal && g === gen) failed('3Speak stopped sending the video.'); });
					});
				}
				v.src = info.url;
				var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
			}).catch(function (e) { if (g === gen) failed(e.message); });
			saveT = setInterval(remember, 5000);
		} else if (mode === 'embed') {
			var f = document.createElement('iframe'); if (S.priv) { f.setAttribute('credentialless', ''); try { f.credentialless = true; } catch (e) {} } f.src = cur.e; f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = W.label(cur);
			stage.appendChild(f);
		} else {
			setStage('<div class="wt-empty"><b>This link can\'t be played here.</b><span>' + (cur.k === 'rumble' ? 'Rumble only lets other sites play its <em>Embed</em> link (on Rumble: Share, then Embed). ' : cur.k === 'odysee' ? 'That is an Odysee channel, not a video. ' : '') +
				'</span><a class="tu-btn tu-btn--primary" href="' + esc(cur.u) + '" target="_blank" rel="noopener">Open it on ' + esc(W.siteName(cur)) + ' ↗&#xFE0E;</a></div>');
		}
		syncSpeed();
		if (S.pz !== false && !S.pzHint && /^(yt|hls|odysee|file)$/.test(mode)) { S.pzHint = 1; save(); setTimeout(function () { toast('Tap the video to play / pause · pinch or double-tap to zoom'); }, 1500); }
	}
	function failed(text) {
		var stage = $('wt-stage');
		setStage('<div class="wt-empty"><b>' + esc(text) + '</b><a class="tu-btn tu-btn--ghost" href="' + esc(cur.u) + '" target="_blank" rel="noopener">Open it on ' + esc(W.siteName(cur)) + ' ↗&#xFE0E;</a>' +
			(S.i < S.q.length - 1 ? '<button type="button" class="tu-btn tu-btn--primary" data-act="next">Play the next one ⏭&#xFE0E;</button>' : '') + '</div>');
	}
	function ended() {
		if (cur && S.histOn !== false) { var p = position(); S.hist = W.touch(S.hist, cur, p ? p.dur : 0, p ? p.dur : 0); save(); }
		if (S.auto && S.i < S.q.length - 1) go(1);
		else { renderList(); toast(S.i < S.q.length - 1 ? 'Finished. Press ⏭ for the next one.' : 'That was the last one in Up next.'); }
	}
	function go(d) {
		var j = S.i + d; if (j < 0 || j >= S.q.length) { toast(d > 0 ? 'Nothing more in Up next' : 'This is the first one'); return; }
		play(S.q[j]);
	}
	var ytLoading = null;
	function ensureYT() {
		if (window.YT && window.YT.Player) return Promise.resolve();
		if (ytLoading) return ytLoading;
		ytLoading = new Promise(function (res, rej) {
			var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} res(); };
			loadScript('https://www.youtube.com/iframe_api').catch(function () { ytLoading = null; rej(new Error('YouTube\'s player could not be loaded (a blocker may be stopping it).')); });
		});
		return ytLoading;
	}
	function showMeta() {
		var has = !!cur;
		$('wt-title').textContent = has ? W.label(cur) : '';
		$('wt-sub').textContent = has ? W.siteName(cur) + (S.q.length > 1 ? ' · ' + (S.i + 1) + ' of ' + S.q.length + ' in Up next' : '') : '';
		var o = $('wt-open'); o.hidden = !has; if (has) o.href = cur.u;
		$('wt-copy').hidden = !has; $('wt-star').hidden = !has;
		if (has) { var st = W.indexOf(S.saved, cur.key) >= 0; $('wt-star').textContent = st ? '★' : '☆'; $('wt-star').setAttribute('aria-pressed', String(st)); $('wt-star').title = st ? 'Remove from Saved' : 'Save for later'; }
		$('wt-prev').disabled = !has || S.i <= 0; $('wt-next').disabled = !has || S.i >= S.q.length - 1;
		if (has) document.title = W.label(cur) + ' · MES Watch';
	}

	/* ---------- speed ---------- */
	function setRate(r) {
		r = Math.round(Math.max(0.25, Math.min(4, r)) * 100) / 100; S.rate = r; save();
		if (vid) vid.playbackRate = r;
		if (yt && yt.setPlaybackRate) { try { yt.setPlaybackRate(W.ytSpeed(r)); } catch (e) {} if (r > 2 && Date.now() - rateNote > 4000) { rateNote = Date.now(); toast('YouTube\'s player goes up to 2×'); } }
		syncSpeed();
	}
	function step(dir) {
		var L = W.SPEEDS, r = S.rate, i;
		if (dir > 0) { for (i = 0; i < L.length && L[i] <= r + 0.001; i++); setRate(L[Math.min(i, L.length - 1)]); }
		else { for (i = L.length - 1; i >= 0 && L[i] >= r - 0.001; i--); setRate(L[Math.max(i, 0)]); }
	}
	function syncSpeed() {
		var ok = cur && W.canSpeed(cur), shown = cur && W.mode(cur) === 'yt' ? W.ytSpeed(S.rate) : S.rate;
		$('wt-sv').textContent = (+shown.toFixed(2)) + '×'; $('wt-speed').classList.toggle('wt-off', !ok);
		['wt-slower', 'wt-faster', 'wt-sv'].forEach(function (id) { $(id).disabled = !ok; });
		$('wt-speed').title = ok ? 'Speed: S slower, D faster, R normal' : 'This site\'s own player has its own speed setting';
	}
	$('wt-slower').onclick = function () { step(-1); };
	$('wt-faster').onclick = function () { step(1); };
	$('wt-sv').onclick = function () { setRate(1); };

	/* ---------- adding links ---------- */
	var taking = false;
	function take(then) {
		if (taking) return;
		var r = W.parseMany($('wt-in').value);
		if (r.channels.length) { r.channels.forEach(function (ch, i) { addChannel(ch, i === r.channels.length - 1); }); if (!r.items.length && !r.playlists.length) { $('wt-in').value = ''; grow(); msg(r.channels.length === 1 ? 'Channel added: its newest videos are below.' : r.channels.length + ' channels added.'); return; } }
		if (!r.items.length && !r.playlists.length) { msg(r.errors.length ? r.errors[0].reason : 'Paste a video link first.'); return; }
		var skipped = r.errors.length ? r.errors.length + ' link' + (r.errors.length > 1 ? 's' : '') + ' skipped (not a web link).' : '';
		msg(skipped); $('wt-in').value = ''; grow();
		if (!r.playlists.length) { then(r.items); return; }
		taking = true; msg('Getting the playlist from YouTube…');
		var all = r.items.slice(), bad = 0, made = [];
		r.playlists.reduce(function (pr, id) {
			return pr.then(function () { return ytPlaylist(id).then(function (pl) {
				all = W.add(all, pl.items);
				// keep it under My playlists (refresh the one imported before, if any)
				var old = S.lists.filter(function (l) { return l.src === id; })[0];
				if (old) { old.items = pl.items; if (pl.title) old.name = pl.title; } else { var nl = W.newList(pl.title || 'YouTube playlist', pl.items); nl.src = id; S.lists.unshift(nl); }
				made.push(pl.title || 'playlist');
			}, function () { bad++; }); });
		}, Promise.resolve()).then(function () {
			taking = false; save();
			msg((made.length ? 'Added "' + made.join('", "') + '" to My playlists. ' : '') + (bad ? bad + ' playlist' + (bad > 1 ? 's' : '') + ' could not be read (private, or a blocker stopped YouTube). ' : '') + skipped);
			if (all.length) then(all); else renderList();
		});
	}
	/* a YouTube playlist's video ids, from YouTube's own player (getPlaylist: up to 200), title from oEmbed */
	function ytPlaylist(id) {
		return ensureYT().then(function () {
			return new Promise(function (res, rej) {
				var box = document.createElement('div'), h = document.createElement('div'), done = false, pl;
				box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;overflow:hidden;'; box.setAttribute('aria-hidden', 'true');
				box.appendChild(h); document.body.appendChild(box);
				var to = setTimeout(function () { fin(null); }, 20000);
				function fin(ids) {
					if (done) return; done = true; clearTimeout(to); try { pl.destroy(); } catch (e) {} box.remove();
					if (!ids || !ids.length) { rej(new Error('no list')); return; }
					var items = ids.map(function (v) { return W.item('https://www.youtube.com/watch?v=' + v); }).filter(function (x) { return !x.err; });
					fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/playlist?list=' + id), { credentials: 'omit' })
						.then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
						.then(function (j) { res({ title: (j && j.title) || '', items: items }); });
				}
				pl = new YT.Player(h, { host: 'https://www.youtube-nocookie.com', width: 320, height: 180,
					playerVars: { listType: 'playlist', list: id, autoplay: 0, mute: 1, playsinline: 1 },
					events: {
						onReady: function () { var n = 0; (function poll() { var ids = null; try { ids = pl.getPlaylist(); } catch (e) {} if (ids && ids.length) return fin(ids); if (++n > 60) return fin(null); setTimeout(poll, 250); })(); },
						onError: function () { fin(null); }
					} });
			});
		});
	}
	$('wt-form').addEventListener('submit', function (e) {
		e.preventDefault();
		take(function (items) {
			var at = Math.max(0, S.i + 1), fresh = items.filter(function (x) { return W.indexOf(S.q, x.key) < 0; });
			S.q = S.q.slice(); Array.prototype.splice.apply(S.q, [at, 0].concat(fresh));
			play(items[0]); setTab('q');
		});
	});
	$('wt-qadd').onclick = function () { take(function (items) { S.q = W.add(S.q, items); save(); setTab('q'); showMeta(); toast(items.length + ' added to Up next'); }); };
	$('wt-sadd').onclick = function () { take(function (items) { S.saved = W.add(S.saved, items, true); save(); setTab('saved'); toast(items.length === 1 ? 'Saved for later' : items.length + ' saved for later'); }); };
	function grow() { var t = $('wt-in'); t.style.height = ''; if (!t.value) return; t.style.height = 'auto'; t.style.height = Math.min(Math.max(t.scrollHeight + 2, t.offsetHeight), 200) + 'px'; }
	$('wt-in').addEventListener('input', grow);
	$('wt-in').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('wt-form').requestSubmit ? $('wt-form').requestSubmit() : $('wt-play').click(); } });

	/* ---------- Latest from: the two MES channels + the person's own (any YouTube channel, through /api/yt-latest) ---------- */
	var latestCh = null, latestCache = {};
	function latestOf(ch) {
		return latestCache[ch] || (latestCache[ch] = fetch('/api/yt-latest?ch=' + encodeURIComponent(ch)).then(function (r) { if (!r.ok) throw new Error(r.status === 400 ? 'That is not a YouTube channel link.' : 'YouTube did not answer.'); return r.json(); }));
	}
	function chPath(ch, id) { return ch === 'mes' || ch === 'mestruth' ? '@' + ch : /^@/.test(ch) ? ch : 'channel/' + (id || ch); }
	function renderChans() {
		$('wt-mychans').innerHTML = S.chans.map(function (c) {
			return '<span class="wt-chipw"><button type="button" class="wt-chip" data-ch="' + esc(c.k) + '" aria-pressed="' + (latestCh === c.k) + '">' + esc(c.n || c.k) + '</button><button type="button" class="wt-chipx" data-chx="' + esc(c.k) + '" title="Remove ' + esc(c.n || c.k) + '" aria-label="Remove ' + esc(c.n || c.k) + '">×</button></span>';
		}).join('');
		document.querySelectorAll('#wt-chans .wt-chip[data-ch]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.ch === latestCh)); });
	}
	function addChannel(ch, open) {
		var known = ch === 'mes' || ch === 'mestruth' || S.chans.some(function (c) { return c.k === ch; });
		if (!known) { S.chans = S.chans.concat([{ k: ch, n: '' }]).slice(-30); save(); }
		renderChans();
		if (open) showLatest(ch, true);
	}
	function showLatest(ch, force) {
		var box = $('wt-latest');
		if (latestCh === ch && !force) { latestCh = null; box.hidden = true; renderChans(); return; }
		latestCh = ch; box.hidden = false; box.innerHTML = '<p class="wt-loading">Loading…</p>'; renderChans();
		latestOf(ch).then(function (j) {
			if (latestCh !== ch) return;
			var c = S.chans.filter(function (x) { return x.k === ch; })[0];
			if (c && j.title && c.n !== j.title) { c.n = j.title; save(); renderChans(); }
			var name = j.title || (c && c.n) || ch, all = j.items || [], nShort = all.filter(function (v) { return v.short; }).length;
			var items = all.filter(function (v) { return S.shorts || !v.short; }).map(function (v) { var it = W.item('https://www.youtube.com/watch?v=' + v.id); it.t = v.title; return it; });
			box.innerHTML = '<div class="wt-lhead"><b>' + esc(name) + ' · ' + items.length + ' newest</b><span class="wt-lbtns">' +
				(nShort ? '<label class="wt-check"><input type="checkbox" data-lshorts' + (S.shorts ? ' checked' : '') + '> Shorts (' + nShort + ')</label>' : '') +
				(items.length ? '<button type="button" class="tu-btn tu-btn--ghost" data-lall>+ Add all to Up next</button><button type="button" class="tu-btn tu-btn--ghost" data-lsave>Save as a playlist</button>' : '') +
				'<a class="tu-btn tu-btn--ghost" href="https://www.youtube.com/' + esc(chPath(ch, j.id)) + '/videos" target="_blank" rel="noopener">All videos ↗&#xFE0E;</a></span></div>' +
				(items.length ? '<div class="wt-lgrid">' + items.map(function (it, i) { return '<button type="button" class="wt-lcard" data-li="' + i + '"><img alt="" loading="lazy" src="' + esc(it.th) + '"><span>' + esc(it.t) + '</span></button>'; }).join('') + '</div>' : '<p class="wt-loading">' + (nShort ? 'Only Shorts lately: tick Shorts to see them.' : 'No videos found.') + '</p>');
			box.onclick = function (e) {
				var cd = e.target.closest('[data-li]'); if (cd) { play(items[+cd.dataset.li]); setTab('q'); $('wt-player').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
				if (e.target.closest('[data-lall]')) { S.q = W.add(S.q, items); save(); setTab('q'); showMeta(); toast(items.length + ' added to Up next'); }
				if (e.target.closest('[data-lsave]')) { var l = W.newList(name + ' (newest)', items); S.lists.unshift(l); save(); openList = l.id; setTab('lists'); toast('Saved under My playlists'); }
			};
			box.onchange = function (e) { if (e.target.matches('[data-lshorts]')) { S.shorts = e.target.checked; save(); showLatest(ch, true); } };
		}).catch(function (e) { delete latestCache[ch]; if (latestCh === ch) box.innerHTML = '<p class="wt-loading">' + esc((e && e.message) || 'Could not load the list right now.') + '</p>'; });
	}
	$('wt-chans').addEventListener('click', function (e) {
		var x = e.target.closest('[data-chx]');
		if (x) { var k = x.dataset.chx; S.chans = S.chans.filter(function (c) { return c.k !== k; }); save(); if (latestCh === k) { latestCh = null; $('wt-latest').hidden = true; } renderChans(); return; }
		var b = e.target.closest('.wt-chip[data-ch]'); if (b) showLatest(b.dataset.ch);
	});
	$('wt-chadd').onclick = function () {
		var t = prompt('Paste a YouTube channel link, or its @handle:', '@'); if (!t) return;
		var ch = W.channelRef(t.trim()) || W.channelRef('@' + t.trim().replace(/^@/, ''));
		if (!ch) { toast('That is not a YouTube channel link or @handle'); return; }
		addChannel(ch, true);
	};
	renderChans();

	/* ---------- lists ---------- */
	function setTab(t) { if (t !== 'lists') openList = null; S.tab = t; save(); document.querySelectorAll('.wt-tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); }); renderList(); }
	document.querySelectorAll('.wt-tab').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function listOf(t) { if (t === 'lists') { var l = openList && W.findList(S.lists, openList); return l ? l.items : S.lists; } return t === 'saved' ? S.saved : t === 'hist' ? S.hist : S.q; }
	function inList() { return S.tab === 'lists' && openList && W.findList(S.lists, openList); }
	var rlT = 0; function renderListSoon() { clearTimeout(rlT); rlT = setTimeout(renderList, 60); }
	function renderList() {
		$('wt-nq').textContent = S.q.length; $('wt-ns').textContent = S.saved.length; $('wt-nh').textContent = S.hist.length; $('wt-nl').textContent = S.lists.length;
		var L = listOf(S.tab), box = $('wt-list'), now = Date.now(), ol = inList();
		$('wt-lnew').hidden = S.tab !== 'lists' || !!ol; $('wt-histwrap').hidden = S.tab !== 'hist'; $('wt-histon').checked = S.histOn !== false;
		if (S.tab === 'lists' && !ol) {
			$('wt-share').hidden = true; $('wt-clear').hidden = true;
			box.innerHTML = !S.lists.length ? '<p class="wt-none">No playlists yet. Paste a YouTube playlist link above, press <b>+ List</b> under a video, or make one from Up next.</p>' :
				S.lists.map(function (l, i) {
					var th = (l.items.filter(function (x) { return x.th; })[0] || {}).th;
					return '<div class="wt-row" data-i="' + i + '"><button type="button" class="wt-rmain" data-act="lopen" aria-label="Open ' + esc(l.name) + '">' +
						'<span class="wt-th">' + (th ? '<img alt="" loading="lazy" src="' + esc(th) + '">' : '<span class="wt-thx">Playlist</span>') + '<span class="wt-lcount">' + l.items.length + '</span></span>' +
						'<span class="wt-rtx"><b>' + esc(l.name) + '</b><small>' + l.items.length + ' video' + (l.items.length === 1 ? '' : 's') + (l.src ? ' · from YouTube' : '') + '</small></span></button>' +
						'<span class="wt-racts"><button type="button" class="wt-b" data-act="lplay" title="Play all (replaces Up next)" aria-label="Play all">▶&#xFE0E;</button>' +
						'<button type="button" class="wt-b" data-act="lqueue" title="Add all to Up next" aria-label="Add all to Up next">+</button>' +
						'<button type="button" class="wt-b" data-act="lren" title="Rename" aria-label="Rename">✎&#xFE0E;</button>' +
						'<button type="button" class="wt-b" data-act="lshare" title="Copy a link to this playlist" aria-label="Copy link">🔗&#xFE0E;</button>' +
						'<button type="button" class="wt-b" data-act="ldel" title="Delete this playlist" aria-label="Delete">✕</button></span></div>';
				}).join('');
			return;
		}
		var head = ol ? '<div class="wt-lback"><button type="button" class="wt-b" data-lback>← My playlists</button><b>' + esc(ol.name) + '</b><button type="button" class="wt-b" data-lplayall>▶&#xFE0E; Play all</button></div>' : '';
		if (!L.length) { box.innerHTML = head + '<p class="wt-none">' + (ol ? 'This playlist is empty. Press <b>+ List</b> under a video to add it here.' : S.tab === 'q' ? 'Up next is empty. Paste links above and press <b>+ Up next</b>.' : S.tab === 'saved' ? 'Nothing saved yet. Press ☆ on a video to keep it for later.' : 'Videos you watch show up here, with where you stopped.') + '</p>'; $('wt-share').hidden = $('wt-clear').hidden = true; return; }
		$('wt-share').hidden = S.tab === 'hist'; $('wt-clear').hidden = false;
		var movable = S.tab === 'q' || !!ol;
		box.innerHTML = head + L.map(function (it, i) {
			needMeta(it);
			var h = S.tab === 'hist' ? it : histRec(it), p = W.pct(h), isCur = cur && cur.key === it.key, stared = W.indexOf(S.saved, it.key) >= 0;
			var sub = [W.siteName(it)];
			if (h && h.dur) sub.push(W.done(h) ? 'watched' : W.fmt(h.pos) + ' of ' + W.fmt(h.dur));
			if (S.tab === 'hist') sub.push(W.ago(it.at, now));
			return '<div class="wt-row' + (isCur ? ' wt-cur' : '') + '" data-i="' + i + '">' +
				'<button type="button" class="wt-rmain" data-act="play" aria-label="Play ' + esc(W.label(it)) + '">' +
				'<span class="wt-th">' + (it.th ? '<img alt="" loading="lazy" src="' + esc(it.th) + '">' : '<span class="wt-thx">' + esc(W.siteName(it)) + '</span>') + (p ? '<span class="wt-prog"><i style="width:' + p.toFixed(1) + '%"></i></span>' : '') + (isCur ? '<span class="wt-now">▶&#xFE0E; Playing</span>' : '') + '</span>' +
				'<span class="wt-rtx"><b>' + esc(W.label(it)) + '</b><small>' + esc(sub.join(' · ')) + '</small></span></button>' +
				'<span class="wt-racts">' +
				(movable ? (ol ? '<button type="button" class="wt-b" data-act="queue" title="Add to Up next" aria-label="Add to Up next">+</button>' : '') + '<button type="button" class="wt-b" data-act="up" title="Move up" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="wt-b" data-act="down" title="Move down" aria-label="Move down"' + (i < L.length - 1 ? '' : ' disabled') + '>↓</button>' : '<button type="button" class="wt-b" data-act="queue" title="Add to Up next" aria-label="Add to Up next">+</button>') +
				(S.tab !== 'saved' ? '<button type="button" class="wt-b" data-act="star" title="' + (stared ? 'Remove from Saved' : 'Save for later') + '" aria-pressed="' + stared + '">' + (stared ? '★' : '☆') + '</button>' : '') +
				'<button type="button" class="wt-b" data-act="del" title="Remove from this list" aria-label="Remove">✕</button></span></div>';
		}).join('');
	}
	function loadList(l, replace) {
		if (!l.items.length) { toast('That playlist is empty'); return; }
		if (replace) { S.q = l.items.slice(); S.i = -1; play(S.q[0]); setTab('q'); $('wt-player').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		else { S.q = W.add(S.q, l.items); save(); showMeta(); toast(l.items.length + ' added to Up next'); renderList(); }
	}
	$('wt-list').addEventListener('click', function (e) {
		if (e.target.closest('[data-lback]')) { openList = null; renderList(); return; }
		if (e.target.closest('[data-lplayall]')) { var ol0 = inList(); if (ol0) loadList(ol0, true); return; }
		var b = e.target.closest('[data-act]'), row = e.target.closest('.wt-row'); if (!b || !row) return;
		var L = listOf(S.tab), i = +row.dataset.i, it = L[i], a = b.dataset.act; if (!it) return;
		if (/^l(open|play|queue|ren|share|del)$/.test(a)) {
			if (a === 'lopen') { openList = it.id; renderList(); return; }
			if (a === 'lplay') { loadList(it, true); return; }
			if (a === 'lqueue') { loadList(it, false); return; }
			if (a === 'lren') { var nm = prompt('Name of this playlist:', it.name); if (nm && nm.trim()) it.name = nm.trim().slice(0, 80); }
			if (a === 'lshare') { if (it.items.length) copy(W.shareUrl(location.origin + '/watch', it.items.slice(0, 50), 0, it.name)); return; }
			if (a === 'ldel') { if (!confirm('Delete the playlist "' + it.name + '"? (The videos stay in your other lists.)')) return; S.lists = S.lists.filter(function (x) { return x.id !== it.id; }); }
			save(); renderList(); return;
		}
		var ol = inList();
		if (a === 'play') { if (S.tab !== 'q' && W.indexOf(S.q, it.key) < 0) { var c = {}; for (var k in it) if (!/^(pos|dur|at)$/.test(k)) c[k] = it[k]; it = c; } else if (S.tab !== 'q') it = S.q[W.indexOf(S.q, it.key)]; play(it); $('wt-player').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
		if (ol && (a === 'up' || a === 'down' || a === 'del')) {
			if (a === 'del') ol.items = W.remove(ol.items, it.key); else ol.items = W.move(ol.items, i, i + (a === 'up' ? -1 : 1));
			save(); renderList(); return;
		}
		if (a === 'up' || a === 'down') { var curKey = cur && cur.key; S.q = W.move(S.q, i, i + (a === 'up' ? -1 : 1)); S.i = curKey ? W.indexOf(S.q, curKey) : -1; }
		else if (a === 'queue') { S.q = W.add(S.q, [it]); toast('Added to Up next'); }
		else if (a === 'star') { if (W.indexOf(S.saved, it.key) >= 0) S.saved = W.remove(S.saved, it.key); else S.saved = W.add(S.saved, [it], true); }
		else if (a === 'del') {
			if (S.tab === 'q') { var ck = cur && cur.key; S.q = W.remove(S.q, it.key); S.i = ck ? W.indexOf(S.q, ck) : -1; }
			else if (S.tab === 'saved') S.saved = W.remove(S.saved, it.key); else S.hist = W.remove(S.hist, it.key);
		}
		save(); renderList(); showMeta();
	});
	$('wt-clear').onclick = function () {
		var names = { q: 'Up next', saved: 'Saved', hist: 'History' }, ol = inList();
		if (ol) { if (!confirm('Remove every video from "' + ol.name + '"?')) return; ol.items = []; save(); renderList(); return; }
		if (!confirm('Clear ' + names[S.tab] + '?')) return;
		if (S.tab === 'q') { S.q = cur ? [cur] : []; S.i = cur ? 0 : -1; } else if (S.tab === 'saved') S.saved = []; else S.hist = [];
		save(); renderList(); showMeta();
	};
	$('wt-share').onclick = function () { var L = listOf(S.tab), ol = inList(); if (L.length) copy(W.shareUrl(location.origin + '/watch', L.slice(0, 50), 0, ol ? ol.name : '')); };
	$('wt-lnew').onclick = function () {
		var nm = prompt('Name of the new playlist:', 'My playlist ' + (S.lists.length + 1)); if (!nm || !nm.trim()) return;
		var l = W.newList(nm.trim(), S.q.map(strip)); S.lists.unshift(l); openList = l.id; save(); renderList(); toast(l.items.length ? 'Playlist made from Up next' : 'Empty playlist made: press + List under a video to fill it');
	};
	$('wt-histon').onchange = function () { S.histOn = this.checked; save(); toast(this.checked ? 'History is on' : 'History is off: nothing new is kept'); };
	$('wt-priv').checked = S.priv !== false;
	$('wt-priv').onchange = function () { S.priv = this.checked; save(); toast(this.checked ? 'Private: players load without your sign-in (from the next video)' : 'Players can now see your sign-in, so views count in your history'); if (cur && W.mode(cur) !== 'hls' && W.mode(cur) !== 'odysee' && W.mode(cur) !== 'file') { var p = position(); play(cur, p ? { t: Math.floor(p.pos) } : {}); } };
	function strip(it) { var c = {}; for (var k in it) if (!/^(pos|dur|at)$/.test(k)) c[k] = it[k]; return c; }

	/* "+ List": add the playing video to one of my playlists */
	function closeMenu() { $('wt-lmenu').hidden = true; document.removeEventListener('pointerdown', menuOut, true); }
	function menuOut(e) { if (!e.target.closest('#wt-lmenu') && !e.target.closest('#wt-addl')) closeMenu(); }
	$('wt-addl').onclick = function () {
		var m = $('wt-lmenu'); if (!m.hidden) { closeMenu(); return; } if (!cur) return;
		m.innerHTML = '<b>Add to a playlist</b>' + S.lists.map(function (l) { var has = W.indexOf(l.items, cur.key) >= 0; return '<button type="button" role="menuitem" data-l="' + esc(l.id) + '"' + (has ? ' aria-checked="true"' : '') + '>' + (has ? '✓ ' : '') + esc(l.name) + ' <small>' + l.items.length + '</small></button>'; }).join('') +
			'<button type="button" role="menuitem" data-l="new">+ New playlist…</button>';
		var r = this.getBoundingClientRect(), fs = document.fullscreenElement;
		(fs && fs.contains(this) ? fs : document.body).appendChild(m);
		m.hidden = false; m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
		m.style.top = (r.bottom + m.offsetHeight + 8 < window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - m.offsetHeight - 4)) + 'px';
		setTimeout(function () { document.addEventListener('pointerdown', menuOut, true); }, 0);
	};
	$('wt-lmenu').addEventListener('click', function (e) {
		var b = e.target.closest('[data-l]'); if (!b || !cur) return; var id = b.dataset.l, l;
		if (id === 'new') { var nm = prompt('Name of the new playlist:', 'My playlist ' + (S.lists.length + 1)); if (!nm || !nm.trim()) return; l = W.newList(nm.trim(), []); S.lists.unshift(l); }
		else l = W.findList(S.lists, id);
		if (!l) return;
		if (W.indexOf(l.items, cur.key) >= 0) { l.items = W.remove(l.items, cur.key); toast('Removed from "' + l.name + '"'); }
		else { l.items = W.add(l.items, [strip(cur)]); toast('Added to "' + l.name + '"'); }
		save(); closeMenu(); renderList();
	});

	/* ---------- zoom: scale / move the picture inside its box (pinch, drag, wheel, + / −) ---------- */
	var zMode = false, zPtr = {}, zStart = null;
	function stageBox() { var st = $('wt-stage'); return { w: st.clientWidth, h: st.clientHeight }; }
	function zoomLayer() {
		var st = $('wt-stage'); if (!st || st.querySelector('.wt-zov')) { applyZoom(); return; }
		var ov = document.createElement('div'); ov.className = 'wt-zov'; ov.hidden = !zMode;
		ov.innerHTML = '<div class="wt-zpill" role="toolbar" aria-label="Zoom">' +
			'<button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" class="wt-zv" title="Back to 100%">100%</button><button type="button" data-z="in" aria-label="Zoom in">+</button>' +
			'<button type="button" data-z="fill" title="Fill the box (crops the black bars)">Fill</button><button type="button" data-z="done" class="wt-zdone">✓ Done</button></div>' +
			'<p class="wt-zhint">Pinch or drag to zoom and move · double-tap = Fill / 100%</p>';
		st.appendChild(ov); wireZoom(ov); applyZoom();
	}
	function applyZoom() {
		var st = $('wt-stage'), b = stageBox(), z = W.clampZoom(S.zoom || {}, b.w, b.h); S.zoom = z;
		st.style.setProperty('--zk', z.k); st.style.setProperty('--zx', z.x + 'px'); st.style.setProperty('--zy', z.y + 'px');
		st.classList.toggle('wt-zoomed', z.k > 1.001);
		var pct = Math.round(z.k * 100) + '%', v = st.querySelector('.wt-zv'); if (v) v.textContent = pct;
		var zb = $('wt-zoom'); zb.innerHTML = '🔍&#xFE0E; ' + (z.k > 1.001 ? pct : 'Zoom'); zb.setAttribute('aria-pressed', String(zMode));
		// the layer is always over a playing video (pinch / drag / double-tap zoom, tap = play / pause); it leaves the player's
		// own control bar at the bottom free, except in zoom mode. Not over Rumble / BitChute / X: their play button is inside
		// their own player, which a page can't press for you.
		var ov = st.querySelector('.wt-zov'), touch = touchOn(), fill = $('wt-player').classList.contains('mes-pfill');
		if (ov) {
			ov.hidden = !(zMode || touch);
			ov.classList.toggle('wt-zfull', zMode);
			ov.style.touchAction = zMode || fill || z.k > 1.001 ? 'none' : 'pan-y';   // a swipe over the video still scrolls the page
		}
		st.classList.toggle('wt-ztouch', touch && !zMode);
	}
	function touchOn() {
		if (S.pz === false || !cur) return false;
		var m = W.mode(cur); if (!/^(yt|hls|odysee|file)$/.test(m)) return false;
		return !!$('wt-stage').querySelector('iframe#wt-yt, video');
	}
	var zSave = 0; function zoomTo(k, px, py) {
		// keep the point (px, py) (from the box centre) still while the scale changes
		var z = S.zoom || { k: 1, x: 0, y: 0 }; k = Math.max(1, Math.min(4, k)); px = px || 0; py = py || 0;
		S.zoom = { k: k, x: px - (px - z.x) / z.k * k, y: py - (py - z.y) / z.k * k }; applyZoom();
		clearTimeout(zSave); zSave = setTimeout(save, 400);
	}
	function fillK() { var b = stageBox(), ar = vid && vid.videoWidth ? vid.videoWidth / vid.videoHeight : 16 / 9; return W.fillZoom(b.w, b.h, ar); }
	function setZMode(on) { zMode = on; if (on) toast('Pinch or drag on the picture · + / − · Done when finished'); applyZoom(); }
	function wireZoom(ov) {
		ov.querySelector('.wt-zpill').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		ov.addEventListener('click', function (e) {
			var b = e.target.closest('[data-z]'); if (!b) return; var z = b.dataset.z, k = (S.zoom || {}).k || 1;
			if (z === 'in') zoomTo(k * 1.25); else if (z === 'out') zoomTo(k / 1.25); else if (z === 'reset') zoomTo(1); else if (z === 'fill') zoomTo(fillK()); else if (z === 'done') setZMode(false);
		});
		function rel(e) { var r = ov.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; }
		var lastTap = null, tapT = 0, g = null;   // g = this gesture: start time / place, moved, more than one finger
		ov.addEventListener('pointerdown', function (e) {
			try { ov.setPointerCapture(e.pointerId); } catch (x) {} zPtr[e.pointerId] = rel(e);
			var ids = Object.keys(zPtr), z = S.zoom || { k: 1, x: 0, y: 0 };
			if (ids.length === 1) {
				g = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false, multi: false };
				zStart = { p: zPtr[ids[0]], z: z };
			} else if (ids.length === 2) {
				if (g) g.multi = true;
				var a = zPtr[ids[0]], c = zPtr[ids[1]];
				zStart = { mid: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, d: Math.hypot(a.x - c.x, a.y - c.y) || 1, z: z };
			}
		});
		ov.addEventListener('pointermove', function (e) {
			if (!zPtr[e.pointerId] || !zStart) return; zPtr[e.pointerId] = rel(e);
			if (g && !g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.moved = true;
			if (g && !g.moved) return;
			var ids = Object.keys(zPtr), z0 = zStart.z;
			if (ids.length === 1 && zStart.p) { var p = zPtr[ids[0]]; S.zoom = { k: z0.k, x: z0.x + p.x - zStart.p.x, y: z0.y + p.y - zStart.p.y }; }
			else if (ids.length >= 2 && zStart.mid) {
				var a = zPtr[ids[0]], c = zPtr[ids[1]], mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, k = Math.max(1, Math.min(4, z0.k * (Math.hypot(a.x - c.x, a.y - c.y) || 1) / zStart.d));
				S.zoom = { k: k, x: mid.x - (zStart.mid.x - z0.x) / z0.k * k, y: mid.y - (zStart.mid.y - z0.y) / z0.k * k };
			}
			applyZoom();
		});
		function up(e) {
			if (e.type === 'pointerup' && g && !g.moved && !g.multi && Date.now() - g.t < 400 && Object.keys(zPtr).length === 1) tap(e);
			delete zPtr[e.pointerId];
			if (!Object.keys(zPtr).length) g = null; var ids = Object.keys(zPtr); zStart = ids.length === 1 ? { p: zPtr[ids[0]], z: S.zoom } : null; clearTimeout(zSave); zSave = setTimeout(save, 400); }
		ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
		// one tap = play / pause (after a moment, in case a second tap follows); two taps = Fill / back to 100%
		function tap(e) {
			var now = Date.now(), p = rel(e);
			if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
				clearTimeout(tapT); lastTap = null;
				var k = (S.zoom || {}).k || 1; if (k > 1.05) zoomTo(1); else zoomTo(fillK(), p.x, p.y);
				return;
			}
			lastTap = { t: now, x: e.clientX, y: e.clientY };
			clearTimeout(tapT); tapT = setTimeout(function () { lastTap = null; if (!zMode) togglePlay(); }, 300);
		}
		ov.addEventListener('wheel', function (e) {
			// plain wheel scrolls the page, unless the video fills the window or zoom mode is on; Ctrl + wheel / trackpad pinch always zooms
			if (!(zMode || e.ctrlKey || $('wt-player').classList.contains('mes-pfill'))) return;
			e.preventDefault(); var p = rel(e); zoomTo(((S.zoom || {}).k || 1) * Math.pow(1.0015, -e.deltaY), p.x, p.y); }, { passive: false });
	}
	$('wt-zoom').onclick = function () { setZMode(!zMode); };
	if (window.ResizeObserver) new ResizeObserver(function () { applyZoom(); }).observe($('wt-stage'));
	if (window.MutationObserver) new MutationObserver(function () { applyZoom(); }).observe($('wt-stage'), { childList: true });
	$('wt-pz').checked = S.pz !== false;
	$('wt-pz').onchange = function () { S.pz = this.checked; save(); applyZoom(); };

	/* ---------- player bar ---------- */
	$('wt-prev').onclick = function () { go(-1); };
	$('wt-next').onclick = function () { go(1); };
	$('wt-stage').addEventListener('click', function (e) { if (e.target.closest('[data-act=next]')) go(1); });
	$('wt-star').onclick = function () { if (!cur) return; if (W.indexOf(S.saved, cur.key) >= 0) { S.saved = W.remove(S.saved, cur.key); toast('Removed from Saved'); } else { S.saved = W.add(S.saved, [cur], true); toast('Saved for later'); } save(); showMeta(); renderList(); };
	$('wt-copy').onclick = function () { if (!cur) return; var p = position(); copy(W.shareUrl(location.origin + '/watch', [cur], p && W.mode(cur) !== 'embed' ? p.pos : 0)); };
	$('wt-auto').checked = S.auto !== false;
	$('wt-auto').onchange = function () { S.auto = this.checked; save(); };

	/* ---------- keys ---------- */
	function togglePlay() {
		if (yt && yt.getPlayerState) { try { if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo(); } catch (e) {} return true; }
		if (vid) { if (vid.paused) vid.play().catch(function () {}); else vid.pause(); return true; }
		return false;
	}
	function seekBy(d) {
		var p = position(); if (!p) return;
		var t = Math.max(0, Math.min((p.dur || 1e9) - 0.5, p.pos + d));
		if (yt && yt.seekTo) yt.seekTo(t, true); else if (vid) vid.currentTime = t;
		toast((d > 0 ? '+' : '−') + Math.abs(d) + ' s · ' + W.fmt(t));
	}
	document.addEventListener('keydown', function (e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		var tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
		if (tg && tg.tagName === 'VIDEO' && /^(\s|ArrowLeft|ArrowRight)$/.test(e.key)) return;   // the video's own controls handle these
		var k = e.key.toLowerCase(), used = true;
		if (k === ' ' || k === 'k') used = togglePlay();
		else if (k === 'j') seekBy(-10); else if (k === 'l') seekBy(10);
		else if (e.key === 'ArrowLeft' && cur) seekBy(-5); else if (e.key === 'ArrowRight' && cur) seekBy(5);
		else if (k === 's' && cur && W.canSpeed(cur)) step(-1); else if (k === 'd' && cur && W.canSpeed(cur)) step(1); else if (k === 'r' && cur && W.canSpeed(cur)) setRate(1);
		else if (k === 'n') go(e.shiftKey ? -1 : 1);
		else if (k === 'z') setZMode(!zMode);
		else if ((e.key === '+' || e.key === '=') && cur) zoomTo(((S.zoom || {}).k || 1) * 1.25);
		else if ((e.key === '-' || e.key === '_') && cur) zoomTo(((S.zoom || {}).k || 1) / 1.25);
		else if (k === '0' && cur) zoomTo(1);
		else if (e.key === 'Escape' && zMode) setZMode(false);
		else if (k === 'w') { var fb = $('wt-pbtns').querySelector('button'); if (fb) fb.click(); }
		else used = false;
		if (used) e.preventDefault();
	});

	/* ---------- start ---------- */
	function boot() {
		// phones with a camera notch: without viewport-fit=cover the full-screen picture is pushed off centre by the notch's width
		var vp = document.querySelector('meta[name=viewport]'); if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';
		if (window.MESPanel) window.MESPanel.add($('wt-player'), { bar: $('wt-pbtns'), stage: $('wt-stage'), onChange: function () { setTimeout(applyZoom, 60); } });
		zoomLayer();
		renderList(); showMeta(); syncSpeed(); setTab(S.tab || 'q');
		if (/[?&]debug=1/.test(location.search)) window.MESWatchDebug = { S: S, play: play, go: go, position: position, cur: function () { return cur; } };
		var Q = W.fromQuery(location.search);
		if (Q.links.length) {
			var r = W.parseMany(Q.links.join(' '));
			if (r.items.length) {
				S.q = W.add(r.items, S.q.filter(function (x) { return !r.items.some(function (y) { return y.key === x.key; }); }));
				S.i = -1;
				if (Q.name) { var nl = W.newList(Q.name, r.items); S.lists.unshift(nl); toast('Saved under My playlists: ' + Q.name); }
				save();
				// browsers only allow sound after a click, so the first video waits for the press of its own play button
				play(S.q[0], Q.t ? { t: Q.t } : {});
			}
			try { history.replaceState(null, '', location.pathname); } catch (e) {}
		} else if (S.i >= 0 && S.q[S.i]) {
			cur = S.q[S.i]; showMeta(); renderList();
			setStage('<div class="wt-empty"><b>' + esc(W.label(cur)) + '</b><span>' + (histRec(cur) && histRec(cur).pos > 20 && !W.done(histRec(cur)) ? 'You stopped at ' + W.fmt(histRec(cur).pos) + '.' : 'Ready to play.') + '</span><button type="button" class="tu-btn tu-btn--primary" id="wt-resume">▶&#xFE0E; ' + (histRec(cur) && histRec(cur).pos > 20 && !W.done(histRec(cur)) ? 'Continue' : 'Play') + '</button></div>');
			$('wt-resume').onclick = function () { play(cur); };
		}
	}
	if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
