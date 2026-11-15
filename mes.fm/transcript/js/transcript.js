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
		youtube: "YouTube", "3speak": "3Speak", rumble: "Rumble", odysee: "Odysee", bitchute: "BitChute", vimeo: "Vimeo", x: "X", substack: "Substack",
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
		/* Vimeo: vimeo.com/<id>[/<hash>], vimeo.com/channels|groups|showcase/.../<id>, player.vimeo.com/video/<id>?h=<hash>
		   (the hash is what lets an unlisted video play; kept in the embed link) */
		if (h === "vimeo.com" || h === "player.vimeo.com") {
			var vm = null, vh = q.get("h") || "";
			if ((m = p.match(/^\/(?:video\/)?(\d{5,12})(?:\/([0-9a-f]{6,20}))?\/?$/i))) { vm = m[1]; if (m[2]) vh = m[2]; }
			else if ((m = p.match(/^\/(?:channels\/[^/]+|groups\/[^/]+\/videos|showcase\/\d+\/video|album\/\d+\/video)\/(\d{5,12})\/?$/i))) vm = m[1];
			if (!vm) return out("vimeo", null, null);
			if (!/^[0-9a-f]{0,20}$/i.test(vh)) vh = "";
			var vst = tParam((u.hash.match(/t=([0-9hms.]+)/) || [])[1] || q.get("t"));
			return out("vimeo", vm, "https://player.vimeo.com/video/" + vm + "?" + (vh ? "h=" + vh + "&" : "") + "dnt=1&playsinline=1" + (vst ? "#t=" + vst + "s" : ""),
				{ watch: "https://vimeo.com/" + vm + (vh ? "/" + vh : "") + (vst ? "#t=" + vst + "s" : ""), start: vst, hash: vh || "" });
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

/* MESConv: pure helpers for the MES Video Converter (mes.fm/convert-video) and the MES Video Editor (mes.fm/video).
 * AVI (RIFF / OpenDML) header + chunk parsing, H.264 Annex B -> MP4 (avcC, length-prefixed NAL units), SPS / slice-header reading
 * for key frames and B-frame order (picture order count), MP3 frame splitting, PCM conversion, ffmpeg log parsing and the
 * "which engine" decision. No DOM, no browser APIs: node-tested by tool_apps_src/convert-video-tests.js. */
(function (root) {
	"use strict";
	var C = {};

	/* ---------- names, sizes, formats ---------- */
	C.VIDEO_EXT = ["avi", "mkv", "wmv", "asf", "flv", "f4v", "mov", "qt", "mp4", "m4v", "webm", "mpg", "mpeg", "mpe", "m2v", "vob", "ts", "mts", "m2ts", "3gp", "3g2", "ogv", "divx", "xvid", "rm", "rmvb", "dv", "mxf", "y4m", "gif", "trec"];
	// Camtasia 2019+ recordings (.trec) are QuickTime files with TechSmith TSCC2 video + AAC; ffmpeg reads them.
	// The mouse cursor is kept apart in TechSmith's own TSCM data, so the converted picture has no cursor.
	C.isTrec = function (name) { return C.extOf(name) === "trec"; };
	C.TREC_NOTE = "Camtasia recording: the mouse cursor is not in the picture (Camtasia keeps it apart and draws it when you edit). Export an MP4 from Camtasia if you need the cursor.";
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
			if (C.isTrec(file.name)) note += " " + C.TREC_NOTE;
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

/* MES Transcript & Timestamps (mes.fm/transcript). YouTube captions through /api/yt-transcript; 3Speak / Odysee / files through Whisper in the
   browser (transformers.js); chapters + exports from MESTx (lib.js). MESYA (youtube-audio lib) parses links and reads 3Speak's sound. */
(function () {
	"use strict";
	var X = window.MESTx, Y = window.MESYA, root = document.getElementById("tx");
	if (!root || !X || !Y) return;
	var $ = function (id) { return document.getElementById(id); };
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var KEY = "mes-transcript:v1", S = { model: "base", lang: "", mode: "paras", showt: true, follow: true, fmt: "paras", chhead: false, chdash: false };
	try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
	var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
	var TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6", HLS = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js";
	var dynImport = new Function("u", "return import(u)");
	var D = null;      /* {cues, title, sub, src: {kind, id, watch, file}, tracks, lang, desc, len} */
	var CH = [];       /* chapters [{t, title}] */
	var job = null, link = null, player = null;

	function toast(m) { var t = document.querySelector(".tu-toast"); if (!t) { t = document.createElement("div"); t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(text, what) {
		var ok = function () { toast((what || "Text") + " copied"); };
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fall); else fall();
		function fall() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Could not copy"); } ta.remove(); }
	}
	function msg(html, err) { var m = $("tx-linkmsg"); m.innerHTML = html || ""; m.classList.toggle("tx-err", !!err); }
	function prog(text, f) { $("tx-prog").hidden = false; $("tx-progtext").textContent = text; $("tx-bar").style.width = Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + "%"; }
	function progOff() { $("tx-prog").hidden = true; }
	function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

	/* ---------- source tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll(".tx-tabs [role=tab]"));
	function setTab(name) {
		tabs.forEach(function (b) { var on = b.dataset.tab === name; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; $("tx-p-" + b.dataset.tab).hidden = !on; });
	}
	tabs.forEach(function (b, i) {
		b.addEventListener("click", function () { setTab(b.dataset.tab); });
		b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); setTab(n.dataset.tab); } });
	});

	/* ---------- Whisper options ---------- */
	Object.keys(X.MODELS).forEach(function (k) { var m = X.MODELS[k], o = document.createElement("option"); o.value = k; o.textContent = m.name + " · about " + m.mb[0] + " MB"; $("tx-model").appendChild(o); });
	X.LANGS.forEach(function (l) { var o = document.createElement("option"); o.value = l[0]; o.textContent = l[1]; $("tx-lang").appendChild(o); });
	$("tx-model").value = X.MODELS[S.model] ? S.model : "base"; $("tx-lang").value = S.lang || "";
	$("tx-model").addEventListener("change", function () { S.model = this.value; save(); });
	$("tx-lang").addEventListener("change", function () { S.lang = this.value; save(); });
	var asrSource = null; /* function () -> Promise<{audio Float32Array 16 kHz, title, player?}> */
	function offerAsr(why, getAudio) { asrSource = getAudio; $("tx-asrwhy").innerHTML = why; $("tx-asr").hidden = false; }
	function hideAsr() { $("tx-asr").hidden = true; asrSource = null; }
	$("tx-asrgo").addEventListener("click", function () { if (asrSource && !job) runAsr(asrSource); });
	$("tx-cancel").addEventListener("click", function () { if (job) job.cancel = true; });

	/* ---------- links ---------- */
	$("tx-form").addEventListener("submit", function (e) { e.preventDefault(); openLink($("tx-url").value); });
	async function openLink(text) {
		hideAsr(); msg("");
		var L = Y.parseLink(text); link = L;
		if (!L.ok) return msg(esc(L.reason), true);
		if (L.kind === "youtube") return openYouTube(L, "", "");
		if (L.kind === "3speak") return offerAsr("3Speak has no captions to read, so the transcript is made from the sound. The page reads the video's sound track straight from 3Speak (no playing needed).", function (j) { return speakAudio(L, j); });
		if (L.kind === "odysee" && L.id) return offerAsr("Odysee has no captions to read, so the transcript is made from the sound. The page downloads the video file from Odysee first.", function (j) { return odyseeAudio(L, j); });
		if (L.kind === "direct") return offerAsr("The transcript is made from the sound of that file. The page downloads it first (if that site allows other pages to read it).", function (j) { return urlAudio(L.watch, L.file || "audio", j, L.watch); });
		var name = Y.SITES[L.kind] || "That site";
		msg(esc(name) + " doesn't let other pages read its videos. Download the video (or its sound), then drop the file in the <b>File</b> tab: the transcript is made right here." + (L.kind === "other" ? " If this is a page with a video, look for a direct .mp4 or .mp3 link instead." : ""), true);
	}

	async function openYouTube(L, lang, kind) {
		msg("Reading the captions from YouTube…");
		try {
			var r = await fetch("/api/yt-transcript?v=" + L.id + (lang ? "&lang=" + encodeURIComponent(lang) : "") + (kind ? "&kind=" + kind : ""), { credentials: "omit" });
			var j = await r.json().catch(function () { return {}; });
			if (!r.ok && !j.title) throw new Error(j.error || ("The transcript service answered " + r.status + "."));
			if (!j.cues || !j.cues.length) {
				msg((j.title ? "<b>" + esc(j.title) + "</b> has no captions" : "That video has no captions") + (j.error ? " (" + esc(j.error) + ")" : "") + ". If it's your own video, download it in YouTube Studio (Content → ⋮ → Download) and drop the file in the <b>File</b> tab to make a transcript with speech recognition.", true);
				return;
			}
			msg("");
			show({ cues: X.norm(j.cues), title: j.title, sub: [j.author, X.fmt(j.len, j.len >= 3600), (j.auto ? "YouTube's automatic captions" : "Captions") + " (" + j.lang + ")"], src: { kind: "youtube", id: L.id, watch: L.watch, start: L.start }, tracks: j.tracks, lang: j.lang, auto: j.auto, desc: j.desc, len: j.len });
		} catch (e) {
			var local = /^(localhost|127\.)/.test(location.hostname);
			if (!local && /sign in|not a bot|confirm you/i.test(e.message || "")) return botMsg(L);
			msg(esc(local ? "The caption reader only runs on mes.fm itself (this is a local copy)." : (e.message || String(e))) + " You can still copy YouTube's own transcript (under the video: …more → Show transcript) and paste it in the <b>Paste captions</b> tab.", true);
		}
	}

	/* YouTube sometimes answers our server (a data-centre address) with "Sign in to confirm you're not a bot". That is about the server,
	   not the visitor, and signing in to anything here would not help, so say so and offer the two ways that do work. */
	function botMsg(L) {
		var w = L.watch || ("https://www.youtube.com/watch?v=" + L.id);
		msg("<b>YouTube is blocking our caption reader right now.</b> It asked mes.fm's server to prove it isn't a robot. This is not about you: you don't need an account or to sign in anywhere. Get the transcript from YouTube yourself in 3 steps:" +
			'<ol class="tx-steps"><li>Open the video on YouTube (button below).</li><li>Under the video tap <b>…more</b>, scroll down and tap <b>Show transcript</b>. Select all of it and copy.</li><li>Come back and paste it in the <b>Paste captions</b> tab.</li></ol>' +
			'<span class="tx-acts"><a class="tu-btn tu-btn--primary" href="' + esc(w) + '" target="_blank" rel="noopener">▶ Open the video on YouTube</a> ' +
			'<button type="button" class="tu-btn" id="tx-gopaste">📋 Go to Paste captions</button> <button type="button" class="tu-btn" id="tx-retry">↻ Try again</button></span>', true);
		$("tx-gopaste").addEventListener("click", function () { setTab("paste"); $("tx-paste").focus(); });
		$("tx-retry").addEventListener("click", function () { openLink($("tx-url").value); });
	}

	/* ---------- getting 16 kHz mono sound ---------- */
	var AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
	function mono(ab) { var n = ab.length, out = new Float32Array(n), c, k = ab.numberOfChannels; for (c = 0; c < k; c++) { var d = ab.getChannelData(c); for (var i = 0; i < n; i++) out[i] += d[i] / k; } return out; }
	function decode16(bytes) {
		if (!OAC) return Promise.reject(new Error("This browser can't decode audio."));
		var oc = new OAC(1, 1, 16000), buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		return new Promise(function (res, rej) { var p = oc.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); }).then(mono);
	}
	async function fileAudio(file, j) {
		prog("Reading the sound of " + file.name + "…", 0);
		if (file.size < 700e6) { try { return await decode16(await file.arrayBuffer()); } catch (e) { if (j.cancel) throw new Error("Cancelled"); } }
		var E = window.MESConvEngine;
		if (!E || !E.extractAudio) throw new Error("The browser could not read the sound of this file.");
		prog("The browser can't read " + file.name + " itself: loading the converter (about 30 MB, once)…", 0);
		var r = await E.extractAudio(file, { onStatus: function (m, x) { prog(m, x || 0); }, onProgress: function (x) { prog("Reading the sound of " + file.name + "…", x); } });
		if (j.cancel) throw new Error("Cancelled");
		if (r.encoded) return decode16(r.encoded);
		/* raw channels at r.sampleRate -> resample through an offline context */
		var n = r.channels[0].length, oc = new OAC(1, Math.ceil(n * 16000 / r.sampleRate), 16000), b = oc.createBuffer(r.channels.length, n, r.sampleRate);
		r.channels.forEach(function (c, i) { b.copyToChannel(c, i); });
		var s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start();
		return (await oc.startRendering()).getChannelData(0);
	}
	async function fetchBytes(url, name, j) {
		var r;
		try { r = await fetch(url, { credentials: "omit", mode: "cors" }); } catch (e) { throw new Error("That site doesn't let other pages download its files. Download it yourself and drop it in the File tab."); }
		if (!r.ok) throw new Error("The other site answered " + r.status + ".");
		var total = +r.headers.get("content-length") || 0, parts = [], got = 0;
		if (r.body && r.body.getReader) {
			var rd = r.body.getReader();
			for (;;) { var y = await rd.read(); if (y.done) break; if (j.cancel) { try { rd.cancel(); } catch (e) {} throw new Error("Cancelled"); } parts.push(y.value); got += y.value.length; prog("Downloading " + name + "… " + (got / 1e6).toFixed(1) + (total ? " of " + (total / 1e6).toFixed(0) : "") + " MB", total ? got / total : 0); }
			var all = new Uint8Array(got), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; }); return all;
		}
		return new Uint8Array(await r.arrayBuffer());
	}
	async function urlAudio(url, name, j, page) {
		var bytes = await fetchBytes(url, name, j);
		prog("Reading the sound…", 1);
		var audio = await decode16(bytes).catch(function () { throw new Error("The browser could not read the sound of that file."); });
		return { audio: audio, title: name, player: { kind: "media", url: url }, page: page };
	}
	async function odyseeAudio(L, j) {
		prog("Finding the video file on Odysee…", 0);
		var r = await fetch("https://api.na-backend.odysee.com/api/v1/proxy?m=get", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ jsonrpc: "2.0", method: "get", params: { uri: Y.lbryUrl(L.id), save_file: false }, id: 1 }) });
		var o = await r.json(), u = o && o.result && o.result.streaming_url;
		if (!u) throw new Error((o && o.error && o.error.message) || "Odysee did not give a file for that video.");
		var name = decodeURIComponent((L.id.split("/").pop() || "video").replace(/:[0-9a-f]+$/i, ""));
		var res = await urlAudio(u, name, j, L.watch);
		res.title = (o.result.metadata && o.result.metadata.title) || name;
		return res;
	}
	async function speakAudio(L, j) {
		prog("Finding the video's sound track on 3Speak…", 0);
		var r = await fetch("https://play.3speak.tv/api/embed?v=" + encodeURIComponent(L.id).replace("%2F", "/"), { credentials: "omit" });
		if (!r.ok) throw new Error("3Speak answered " + r.status + ".");
		var info = await r.json(), u0 = info && (info.videoUrl || info.videoUrlFallback1 || info.videoUrlFallback2);
		if (!u0) throw new Error("3Speak has no video for that link.");
		var url = Y.speakUrl(u0), get = async function (u) { var x = await fetch(u, { credentials: "omit" }); if (!x.ok) throw new Error("3Speak answered " + x.status + "."); return x; };
		var pl = Y.parseM3U8(await (await get(url)).text(), url);
		if (pl.variants.length) { var vv = Y.lightest(pl.variants); pl = Y.parseM3U8(await (await get(vv.url)).text(), vv.url); }
		var segs = pl.segments; if (!segs.length) throw new Error("That 3Speak video has no parts to read.");
		var st = {}, parts = [], len = 0, got = 0, secs = 0, fetches = [], ahead = 3;
		for (var k = 0; k < Math.min(ahead, segs.length); k++) fetches.push(get(segs[k].url).then(function (x) { return x.arrayBuffer(); }));
		for (var i = 0; i < segs.length; i++) {
			if (j.cancel) throw new Error("Cancelled");
			var b = new Uint8Array(await fetches[i]); got += b.length;
			if (i + ahead < segs.length) fetches.push(get(segs[i + ahead].url).then(function (x) { return x.arrayBuffer(); }));
			var a = Y.tsAudio(b, st); if (a) { parts.push(a); len += a.length; }
			secs += segs[i].dur || 0;
			prog("Reading the sound of “" + (info.title || L.id) + "”… " + X.fmt(secs) + " of " + X.fmt(pl.total) + " (" + (got / 1e6).toFixed(0) + " MB)", (i + 1) / segs.length * 0.9);
		}
		if (!len) throw new Error("That 3Speak video has no sound track.");
		var all = new Uint8Array(len), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; });
		/* AAC frames decoded in batches (a whole hour at once can run out of memory), resampled to 16 kHz by the offline context */
		var A = Y.adtsFrames(all), n = A.frames.length, sr = A.sr || 44100, BATCH = 2600, OV = 8, out = new Float32Array(Math.ceil(n * 1024 * 16000 / sr) + 16000), pos = 0;
		for (var f = 0; f < n; f += BATCH) {
			if (j.cancel) throw new Error("Cancelled");
			var from = Math.max(0, f - OV), to = Math.min(n, f + BATCH), last = A.frames[to - 1];
			var pcm = await decode16(all.subarray(A.frames[from].o, last.o + last.l));
			var want = Math.min(pcm.length, Math.round((to - f) * 1024 * 16000 / sr));
			out.set(pcm.subarray(pcm.length - want), pos); pos += want;
			prog("Decoding the sound…", 0.9 + 0.1 * to / n);
		}
		return { audio: out.subarray(0, pos), title: info.title || L.id, player: { kind: "3speak", url: url }, page: L.watch };
	}

	/* ---------- Whisper ---------- */
	var asr = null, asrKey = "";
	async function loadAsr(model, j) {
		var M = X.MODELS[model] || X.MODELS.base;
		var gpu = false;
		try { gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) {}
		var key = M.id + (gpu ? "|gpu" : "|cpu");
		if (asr && asrKey === key) return asr;
		prog("Loading speech recognition…", 0);
		var T = await dynImport(TF + "/dist/transformers.min.js").catch(function () { return dynImport("https://unpkg.com/@huggingface/transformers@3.7.6/dist/transformers.min.js"); });
		var files = {};
		var cb = function (p) {
			if (j.cancel) return;
			if (p.status === "progress" && p.file) { files[p.file] = [p.loaded || 0, p.total || 0]; var a = 0, b = 0; for (var k in files) { a += files[k][0]; b += files[k][1]; } prog("Downloading the " + M.name.toLowerCase() + " speech model (once; your browser keeps it)… " + (a / 1e6).toFixed(0) + (b ? " of " + (b / 1e6).toFixed(0) : "") + " MB", b ? a / b : 0); }
		};
		var opts = gpu ? { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback: cb } : { device: "wasm", dtype: "q8", progress_callback: cb };
		try { asr = await T.pipeline("automatic-speech-recognition", M.id, opts); }
		catch (e) { if (!gpu) throw e; asr = await T.pipeline("automatic-speech-recognition", M.id, { device: "wasm", dtype: "q8", progress_callback: cb }); key = M.id + "|cpu"; }
		asrKey = key; asr.__gpu = /gpu/.test(key);
		return asr;
	}
	async function runAsr(getAudio) {
		var j = job = { cancel: false };
		$("tx-asrgo").disabled = true;
		try {
			var src = await getAudio(j);
			if (src instanceof Float32Array) src = { audio: src };
			var audio = src.audio, total = audio.length / 16000;
			if (total < 1) throw new Error("There is almost no sound in that file.");
			var p = await loadAsr(S.model, j);
			if (j.cancel) throw new Error("Cancelled");
			var blocks = X.blocks(total, 120, 5), cues = [], t0 = Date.now(), lang = S.lang || null;
			var model = X.MODELS[S.model] || X.MODELS.base;
			for (var i = 0; i < blocks.length; i++) {
				if (j.cancel) throw new Error("Cancelled");
				var b = blocks[i], el = (Date.now() - t0) / 1000, done = b.s / total;
				var left = i && done > 0 ? el / done * (1 - done) : 0;
				prog("Listening (" + (p.__gpu ? "graphics card" : "processor") + ", " + model.name.toLowerCase() + ")… " + X.fmt(b.s) + " of " + X.fmt(total) + (left ? " · about " + X.fmt(left) + " left" : ""), done);
				await yieldUI();
				var o = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
				if (lang && !/\.en$/.test(model.id)) { o.language = lang; o.task = "transcribe"; }
				var r = await p(audio.subarray(Math.floor(b.s * 16000), Math.floor(b.e * 16000)), o);
				cues = cues.concat(X.whisperCues(r.chunks, b.s, b.keepFrom, b.keepTo));
				if (cues.length) show(Object.assign(baseFrom(src, total), { cues: X.norm(cues), partial: true }), true);
			}
			if (!cues.length) throw new Error("No speech was found.");
			show(Object.assign(baseFrom(src, total), { cues: X.norm(cues) }), true);
			toast("Transcript ready: " + X.fmt((Date.now() - t0) / 1000) + " for " + X.fmt(total));
			hideAsr();
		} catch (e) {
			if (!/Cancelled/.test(e.message)) msg(esc(e.message || String(e)), true);
		} finally { job = null; $("tx-asrgo").disabled = false; progOff(); }
	}
	function baseFrom(src, total) {
		return { title: src.title || "Transcript", sub: [X.fmt(total, total >= 3600), "Made with Whisper (" + (X.MODELS[S.model] || X.MODELS.base).name + ")"], src: { kind: src.player ? src.player.kind : "none", url: src.player && src.player.url, watch: src.page }, len: total };
	}

	/* ---------- files and pasted text ---------- */
	var CAPS = /\.(srt|vtt|sbv|txt|json)$/i;
	function openFile(file) {
		if (!file) return;
		hideAsr(); msg("");
		if (CAPS.test(file.name) || /^text\//.test(file.type)) {
			file.text().then(function (t) { openText(t, file.name.replace(/\.[^.]+$/, "")); });
			return;
		}
		var url = URL.createObjectURL(file);
		offerAsr("<b>" + esc(file.name) + "</b> (" + (file.size / 1e6).toFixed(1) + " MB): press Start to turn its speech into text.", async function (j) {
			var audio = await fileAudio(file, j);
			return { audio: audio, title: file.name.replace(/\.[^.]+$/, ""), player: { kind: /^audio\//.test(file.type) ? "audio" : "media", url: url } };
		});
	}
	function openText(t, title) {
		var p = X.parseText(t);
		if (!p.cues.length) return toast("No captions found in that text.");
		if (p.kind === "plain") toast("No times found: showing it as plain text.");
		show({ cues: p.cues, title: title || "Pasted captions", sub: [X.fmt(X.end(p.cues)), ({ srt: "SRT", vtt: "WebVTT", json: "JSON", stamps: "Times + text", plain: "Plain text" })[p.kind] || p.kind], src: { kind: "none" }, len: X.end(p.cues) });
	}
	$("tx-file").addEventListener("change", function () { openFile(this.files[0]); this.value = ""; });
	var drop = $("tx-drop");
	["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("tx-over"); }); });
	["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("tx-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); openFile(e.dataTransfer && e.dataTransfer.files[0]); });
	root.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
	root.addEventListener("drop", function (e) { if (e.defaultPrevented) return; var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); setTab("file"); openFile(f); } });
	$("tx-pastego").addEventListener("click", function () { openText($("tx-paste").value); });

	/* ---------- player ---------- */
	var ytReady = null;
	function loadYT() {
		if (ytReady) return ytReady;
		ytReady = new Promise(function (res) {
			if (window.YT && window.YT.Player) return res();
			var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} res(); };
			var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
		});
		return ytReady;
	}
	var curPlayerKey = "";
	function setPlayer(src) {
		var box = $("tx-player"), key = src.kind + "|" + (src.id || src.url || "");
		if (key === curPlayerKey) return;
		curPlayerKey = key; box.innerHTML = ""; player = null;
		if (src.kind === "youtube") {
			var d = document.createElement("div"); d.className = "tx-yt"; box.appendChild(d);
			loadYT().then(function () {
				if (curPlayerKey !== key) return;
				var yp = new YT.Player(d, { videoId: src.id, host: "https://www.youtube-nocookie.com", playerVars: { rel: 0, playsinline: 1, start: src.start || 0 } });
				player = { time: function () { try { return yp.getCurrentTime() || 0; } catch (e) { return 0; } }, seek: function (t) { try { yp.seekTo(t, true); yp.playVideo(); } catch (e) {} }, playing: function () { try { return yp.getPlayerState() === 1; } catch (e) { return false; } } };
			});
		} else if (src.kind === "media" || src.kind === "audio" || src.kind === "3speak") {
			var v = document.createElement(src.kind === "audio" ? "audio" : "video"); v.controls = true; v.playsInline = true; v.preload = "metadata"; box.appendChild(v);
			if (src.kind === "3speak" && !Y.hlsNative(v)) {
				var x = document.createElement("script"); x.src = HLS; x.onload = function () { if (window.Hls && Hls.isSupported()) { var h = new Hls(); h.loadSource(src.url); h.attachMedia(v); } }; document.head.appendChild(x);
			} else v.src = src.url;
			player = { time: function () { return v.currentTime || 0; }, seek: function (t) { v.currentTime = t; var p = v.play(); if (p && p.catch) p.catch(function () {}); }, playing: function () { return !v.paused; } };
		}
		$("tx-followl").hidden = src.kind === "none";
	}

	/* ---------- showing a transcript ---------- */
	function show(d, keepCh) {
		var first = !D || D.title !== d.title || !keepCh;
		D = d;
		$("tx-res").hidden = false;
		$("tx-title").textContent = d.title || "Transcript";
		var words = X.wordCount(d.cues);
		$("tx-sub").textContent = (d.sub || []).filter(Boolean).concat([words.toLocaleString() + " words", d.partial ? "still listening…" : ""]).filter(Boolean).join(" · ");
		setPlayer(d.src || { kind: "none" });
		/* caption tracks */
		var tr = d.tracks || [];
		$("tx-trackrow").hidden = tr.length < 2;
		if (tr.length >= 2) {
			$("tx-track").innerHTML = tr.map(function (t, i) { return '<option value="' + i + '"' + (t.code === d.lang && !!t.auto === !!d.auto ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("");
		}
		$("tx-autonote").textContent = d.auto ? "Automatic captions: names and technical words may be wrong." : "";
		related();
		renderList();
		if (first || !CH.length) makeChapters(true);
		renderExport();
		var dc = d.desc ? X.descChapters(d.desc) : [];
		$("tx-descch").hidden = !dc.length;
		if (dc.length) { $("tx-descch").innerHTML = "This video's description already has <b>" + dc.length + " chapters</b>. <button type='button' class='tu-btn tu-btn--ghost' id='tx-usedesc'>Show them here</button>"; $("tx-usedesc").onclick = function () { setChapters(dc); }; }
		$("tx-ailen").textContent = "The request is about " + Math.round(X.prompt(d.cues, { title: d.title }).length / 1000) + "k characters" + (X.end(d.cues) > 5400 ? ": long videos may need a chatbot with a big context (Claude, Gemini, ChatGPT)." : ".");
		var q = X.text(d.cues).slice(0, 1800);
		$("tx-tolate").href = "/translate?q=" + encodeURIComponent(q);
		if (first && d.src && d.src.kind !== "none") { try { $("tx-res").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
	}
	$("tx-track").addEventListener("change", function () { var t = (D.tracks || [])[+this.value]; if (t && link) openYouTube(link, t.code, t.auto ? "asr" : ""); });
	function related() {
		var s = D.src || {}, u = s.watch;
		var h = [];
		if (u) {
			var q = encodeURIComponent(u);
			h.push('<a href="' + esc(u) + '" target="_blank" rel="noopener">Open the video ↗</a>');
			if (/youtube|3speak|odysee|rumble/.test(u)) h.push('<a href="/youtube-thumbnail?url=' + q + '">Get the thumbnail</a>');
			h.push('<a href="/youtube-audio?u=' + q + '">Measure its loudness</a>');
			h.push('<a href="/watch?v=' + q + '">Watch it on MES Watch</a>');
			$("tx-x-thumb").href = "/youtube-thumbnail?url=" + q; $("tx-x-audio").href = "/youtube-audio?u=" + q; $("tx-x-watch").href = "/watch?v=" + q;
		}
		$("tx-related").innerHTML = h.join("");
	}

	/* transcript list */
	var segs = [], hits = [], hitAt = -1;
	function segments() {
		if (S.mode === "paras") return X.paragraphs(D.cues).map(function (p) { return { t: p.t, text: p.text }; });
		return D.cues.map(function (c) { return { t: c[0], text: c[2] }; });
	}
	function hl(text, q) {
		if (!q) return esc(text);
		var low = text.toLowerCase(), out = "", i = 0, k;
		while ((k = low.indexOf(q, i)) >= 0) { out += esc(text.slice(i, k)) + "<mark>" + esc(text.slice(k, k + q.length)) + "</mark>"; i = k + q.length; }
		return out + esc(text.slice(i));
	}
	function renderList() {
		segs = segments();
		var q = $("tx-q").value.trim().toLowerCase(), long = X.end(D.cues) >= 3600;
		root.classList.toggle("tx-not", !S.showt);
		$("tx-list").innerHTML = segs.map(function (s, i) { return '<div class="tx-ln' + (S.mode === "paras" ? " tx-para" : "") + '" data-i="' + i + '"><a class="tx-t" href="#t=' + Math.floor(s.t) + '" tabindex="-1">' + X.fmt(s.t, long) + "</a><span>" + hl(s.text, q) + "</span></div>"; }).join("");
		hits = [].slice.call($("tx-list").querySelectorAll("mark")); hitAt = -1;
		$("tx-qn").textContent = q ? (hits.length ? hits.length + " found" : "none found") : "";
		nowI = -1;
	}
	[].forEach.call($("tx-mode").querySelectorAll("button"), function (b) {
		b.addEventListener("click", function () { S.mode = b.dataset.m; save(); modeUI(); renderList(); });
	});
	function modeUI() { [].forEach.call($("tx-mode").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.m === S.mode); b.classList.toggle("is-on", b.dataset.m === S.mode); }); }
	$("tx-showt").checked = !!S.showt; $("tx-follow").checked = !!S.follow;
	$("tx-showt").addEventListener("change", function () { S.showt = this.checked; save(); root.classList.toggle("tx-not", !S.showt); });
	$("tx-follow").addEventListener("change", function () { S.follow = this.checked; save(); });
	var qt = null;
	$("tx-q").addEventListener("input", function () { clearTimeout(qt); qt = setTimeout(function () { renderList(); if (hits.length) step(1); }, 160); });
	$("tx-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === "Escape") { this.value = ""; renderList(); } });
	$("tx-qx").addEventListener("click", function () { step(1); });
	$("tx-qp").addEventListener("click", function () { step(-1); });
	function step(d) {
		if (!hits.length) return;
		if (hits[hitAt]) hits[hitAt].classList.remove("tx-cur");
		hitAt = (hitAt + d + hits.length) % hits.length;
		var m = hits[hitAt]; m.classList.add("tx-cur"); scrollInto(m.closest(".tx-ln"));
		$("tx-qn").textContent = (hitAt + 1) + " of " + hits.length;
	}
	function scrollInto(el) { var L = $("tx-list"); if (!el) return; L.scrollTop = el.offsetTop - L.offsetTop - L.clientHeight / 3; }
	$("tx-list").addEventListener("click", function (e) {
		var ln = e.target.closest(".tx-ln"); if (!ln) return; e.preventDefault();
		if (window.getSelection && String(window.getSelection()).length > 2) return; /* selecting text, not seeking */
		var s = segs[+ln.dataset.i]; if (s && player) player.seek(s.t);
		else if (s && D.src && D.src.watch && D.src.kind === "youtube") window.open("https://www.youtube.com/watch?v=" + D.src.id + "&t=" + Math.floor(s.t) + "s", "_blank", "noopener");
	});
	/* follow the playing video */
	var nowI = -1;
	setInterval(function () {
		if (!D || !player || $("tx-res").hidden) return;
		var t = player.time(), i = -1;
		for (var k = 0; k < segs.length; k++) { if (segs[k].t <= t + 0.2) i = k; else break; }
		if (i === nowI) return;
		var L = $("tx-list"), old = L.querySelector(".tx-now"); if (old) old.classList.remove("tx-now");
		nowI = i; var el = L.querySelector('[data-i="' + i + '"]');
		if (el) { el.classList.add("tx-now"); if (S.follow && player.playing() && !$("tx-q").value) scrollInto(el); }
	}, 300);
	$("tx-copyall").addEventListener("click", function () { copy(S.mode === "paras" ? X.toTXT(D.cues, { paras: true }) : X.text(D.cues), "Transcript"); });
	$("tx-copyt").addEventListener("click", function () { copy(X.toTXT(D.cues, { stamps: true, paras: S.mode === "paras" }), "Transcript with times"); });

	/* ---------- results tabs ---------- */
	var vtabs = [].slice.call(root.querySelectorAll(".tx-vtabs [role=tab]"));
	function setView(v) { vtabs.forEach(function (b) { var on = b.dataset.v === v; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; $("tx-v-" + b.dataset.v).hidden = !on; }); if (v === "ex") renderExport(); }
	vtabs.forEach(function (b, i) {
		b.addEventListener("click", function () { setView(b.dataset.v); });
		b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { var n = vtabs[(i + d + vtabs.length) % vtabs.length]; n.focus(); setView(n.dataset.v); } });
	});

	/* ---------- chapters ---------- */
	for (var n = 3; n <= 40; n++) { var o = document.createElement("option"); o.value = n; o.textContent = n + " chapters"; $("tx-chn").appendChild(o); }
	$("tx-chhead").checked = !!S.chhead; $("tx-chdash").checked = !!S.chdash;
	function makeChapters(quiet) { if (!D) return; setChapters(X.chapters(D.cues, { n: +$("tx-chn").value || 0 })); if (!quiet) toast("New draft: " + CH.length + " chapters"); }
	$("tx-chmake").addEventListener("click", function () { makeChapters(false); });
	$("tx-chn").addEventListener("change", function () { makeChapters(false); });
	$("tx-chadd").addEventListener("click", function () {
		var t = player ? Math.floor(player.time()) : (CH.length ? CH[CH.length - 1].t + 60 : 0);
		CH.push({ t: t, title: "New chapter" }); CH.sort(function (a, b) { return a.t - b.t; }); renderChapters();
	});
	function setChapters(c) { CH = c.map(function (x) { return { t: x.t, title: x.title }; }); renderChapters(); }
	function renderChapters() {
		var long = X.end(D.cues) >= 3600;
		$("tx-chlist").innerHTML = CH.map(function (c, i) {
			return '<li data-i="' + i + '"><button type="button" class="tx-chgo" title="Play from here" aria-label="Play from ' + X.fmt(c.t, long) + '">▶</button><input class="tx-cht" value="' + X.fmt(c.t, long) + '" aria-label="Time of chapter ' + (i + 1) + '"><input class="tx-chti" value="' + esc(c.title) + '" aria-label="Title of chapter ' + (i + 1) + '"><button type="button" class="tx-ib tx-chdel" title="Delete" aria-label="Delete chapter ' + (i + 1) + '">✕</button></li>';
		}).join("");
		chOut();
	}
	function chOut() {
		var why = X.checkChapters(CH, D ? X.end(D.cues) : 0), el = $("tx-chcheck");
		el.className = "tx-chcheck " + (why.length ? "tx-no" : "tx-ok");
		el.textContent = why.length ? "⚠ " + why.join(" ") : "✓ Follows YouTube's rules for chapters (" + CH.length + " chapters).";
		$("tx-chout").value = (S.chhead ? "Timestamps:\n" : "") + X.fmtChapters(CH, { dash: S.chdash });
	}
	$("tx-chlist").addEventListener("input", function (e) {
		var li = e.target.closest("li"); if (!li) return; var c = CH[+li.dataset.i];
		if (e.target.classList.contains("tx-chti")) c.title = e.target.value;
		else { var t = X.parseTime(e.target.value); e.target.classList.toggle("tx-bad", !isFinite(t)); if (isFinite(t)) c.t = Math.floor(t); }
		chOut();
	});
	$("tx-chlist").addEventListener("change", function (e) { if (e.target.classList.contains("tx-cht")) { CH.sort(function (a, b) { return a.t - b.t; }); renderChapters(); } });
	$("tx-chlist").addEventListener("click", function (e) {
		var li = e.target.closest("li"); if (!li) return; var i = +li.dataset.i;
		if (e.target.classList.contains("tx-chdel")) { CH.splice(i, 1); renderChapters(); }
		else if (e.target.classList.contains("tx-chgo") && player) player.seek(CH[i].t);
	});
	$("tx-chout").addEventListener("change", function () { var c = X.parseChapters(this.value); if (c.length) setChapters(c); });
	$("tx-chhead").addEventListener("change", function () { S.chhead = this.checked; save(); chOut(); });
	$("tx-chdash").addEventListener("change", function () { S.chdash = this.checked; save(); chOut(); });
	$("tx-chcopy").addEventListener("click", function () { copy($("tx-chout").value, "Chapters"); });
	$("tx-aicopy").addEventListener("click", function () { copy(X.prompt(D.cues, { title: D.title, n: +$("tx-chn").value || 0 }), "Request"); });
	$("tx-aiuse").addEventListener("click", function () {
		var c = X.parseChapters($("tx-aians").value);
		if (!c.length) return toast("No \"0:00 Title\" lines found in that answer.");
		setChapters(c); toast(c.length + " chapters from the AI");
	});
	/* Chrome's built-in model (Prompt API), when the browser has it */
	var LM = window.LanguageModel;
	if (LM && LM.availability) LM.availability().then(function (a) { $("tx-nano").hidden = a === "unavailable"; }).catch(function () {});
	$("tx-nanogo").addEventListener("click", async function () {
		var btn = this; btn.disabled = true;
		try {
			var s = await LM.create({ initialPrompts: [{ role: "system", content: "You write short YouTube chapter titles (2 to 6 words, no quotes, no time) from a piece of a video transcript." }] });
			for (var i = 0; i < CH.length; i++) {
				var e = CH[i + 1] ? CH[i + 1].t : Infinity;
				var text = D.cues.filter(function (c) { return c[0] >= CH[i].t && c[0] < e; }).map(function (c) { return c[2]; }).join(" ").slice(0, 3500);
				btn.textContent = "🧠 Writing title " + (i + 1) + " of " + CH.length + "…";
				var t = (await s.prompt("Transcript piece:\n" + text + "\n\nChapter title:")).split("\n")[0].replace(/^["'*\s]+|["'*\s.]+$/g, "").slice(0, 80);
				if (t) { CH[i].title = t; renderChapters(); }
			}
			toast("Titles written on this computer");
		} catch (err) { toast("The browser's AI said: " + (err.message || err)); }
		finally { btn.disabled = false; btn.textContent = "🧠 Write titles with the AI built into this browser"; }
	});

	/* ---------- export ---------- */
	$("tx-fmt").value = S.fmt;
	$("tx-fmt").addEventListener("change", function () { S.fmt = this.value; save(); renderExport(); });
	function exportText() {
		var c = D.cues, f = S.fmt;
		if (f === "srt") return X.toSRT(c);
		if (f === "vtt") return X.toVTT(c);
		if (f === "json") return X.toJSON(c, { title: D.title, source: D.src && D.src.watch || "" });
		if (f === "lines") return X.toTXT(c, { stamps: true });
		if (f === "paras") return X.toTXT(c, { paras: true });
		if (f === "parast") return X.toTXT(c, { paras: true, stamps: true });
		if (f === "md") {
			var long = X.end(c) >= 3600, out = "# " + (D.title || "Transcript") + "\n\n" + (D.src && D.src.watch ? D.src.watch + "\n\n" : "");
			var paras = X.paragraphs(c), chs = CH.length ? CH : [{ t: 0, title: "Transcript" }];
			chs.forEach(function (ch, i) {
				var e = chs[i + 1] ? chs[i + 1].t : Infinity;
				out += "## " + X.fmt(ch.t, long) + " " + ch.title + "\n\n" + paras.filter(function (p) { return p.t >= ch.t - 0.5 && p.t < e - 0.5; }).map(function (p) { return p.text; }).join("\n\n") + "\n\n";
			});
			return out.trim() + "\n";
		}
		return X.text(c);
	}
	function renderExport() { if (!D) return; var t = exportText(); $("tx-exout").value = t; $("tx-exinfo").textContent = t.length.toLocaleString() + " characters"; }
	$("tx-excopy").addEventListener("click", function () { copy($("tx-exout").value, "Text"); });
	$("tx-exdl").addEventListener("click", function () {
		var ext = { srt: "srt", vtt: "vtt", json: "json", md: "md" }[S.fmt] || "txt";
		var name = String(D.title || "transcript").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || "transcript";
		var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([$("tx-exout").value], { type: "text/plain;charset=utf-8" })); a.download = name + "." + ext;
		document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
	});

	modeUI();
	/* Fill window / Full screen for the results */
	window.addEventListener("load", function () { if (window.MESPanel) window.MESPanel.add($("tx-res"), { bar: $("tx-head") }); });
	/* ?v=<link> (or ?url=) opens straight away */
	try {
		var sp = new URLSearchParams(location.search), pre = sp.get("v") || sp.get("url") || sp.get("u");
		if (pre) { if (/^[A-Za-z0-9_-]{11}$/.test(pre)) pre = "https://www.youtube.com/watch?v=" + pre; $("tx-url").value = pre; openLink(pre); }
	} catch (e) {}
	window.MESTranscriptDebug = { show: show, openText: openText, get D() { return D; }, get CH() { return CH; } };
})();
