/* MES Screen Recorder: pure helpers (no DOM). Layout of the captures on the output picture, dragging / resizing them, crop boxes, the
 * pause-aware timer, recorder format choice and file names. Node: require('./tool_apps_src/screen-recorder/lib.js'); tests in
 * tool_apps_src/screen-recorder-tests.js. Rectangles are {x, y, w, h} in output pixels unless said otherwise. */
var MESRec = (function () {
	"use strict";
	var R = {};
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	R.clamp = clamp;

	/* ---------- output sizes ---------- */
	R.SIZES = [
		["auto", "Match the first screen"], ["1920x1080", "1080p (1920 × 1080)"], ["1280x720", "720p (1280 × 720)"], ["2560x1440", "1440p (2560 × 1440)"],
		["3840x2160", "4K (3840 × 2160)"], ["1080x1920", "Phone, upright (1080 × 1920)"], ["1080x1080", "Square (1080 × 1080)"]
	];
	/* "1920x1080" -> {w, h}; "auto" -> the first video source's own size (even numbers, at most 3840 wide), else 1920x1080 */
	R.outSize = function (pref, first) {
		var m = /^(\d+)x(\d+)$/.exec(pref || "");
		if (m) return { w: +m[1], h: +m[2] };
		if (first && first.w > 0 && first.h > 0) {
			var k = Math.min(1, 3840 / Math.max(first.w, first.h));
			return { w: Math.max(2, Math.round(first.w * k / 2) * 2), h: Math.max(2, Math.round(first.h * k / 2) * 2) };
		}
		return { w: 1920, h: 1080 };
	};

	/* box of size (sw, sh) fitted into r: contain = whole picture shows (bars), cover = fills r (edges cut). Returns {x, y, w, h} of the drawn picture. */
	R.fit = function (sw, sh, r, mode) {
		if (!(sw > 0 && sh > 0)) return { x: r.x, y: r.y, w: r.w, h: r.h };
		var k = mode === "cover" ? Math.max(r.w / sw, r.h / sh) : Math.min(r.w / sw, r.h / sh), w = sw * k, h = sh * k;
		return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w: w, h: h };
	};

	/* ---------- layouts ----------
	 * srcs = [{kind: "screen"|"camera"|"image", w, h}] in drawing order (first = bottom). Returns one rect per source.
	 * pip: first screen fills the picture, other screens / cameras are small boxes along the bottom right, cameras round.
	 * side: all video sources side by side in one row (or column on an upright picture). grid: a square-ish grid. full: first fills, others hidden. */
	R.LAYOUTS = [["pip", "Screen + small boxes"], ["side", "Side by side"], ["grid", "Grid"], ["full", "First one only"]];
	R.layout = function (srcs, W, H, mode) {
		var n = srcs.length, out = [], i;
		if (!n) return out;
		var main = 0; for (i = 0; i < n; i++) if (srcs[i].kind === "screen") { main = i; break; }
		if (mode === "full") {
			for (i = 0; i < n; i++) out.push(i === main ? { x: 0, y: 0, w: W, h: H, hide: false } : { x: 0, y: 0, w: W / 4, h: H / 4, hide: true });
			return out;
		}
		if (mode === "side" || mode === "grid") {
			var cols, rows;
			if (mode === "side") { if (W >= H) { cols = n; rows = 1; } else { cols = 1; rows = n; } }
			else { cols = Math.ceil(Math.sqrt(n * W / H / (16 / 9))); cols = clamp(cols, 1, n); rows = Math.ceil(n / cols); }
			var cw = W / cols, ch = H / rows;
			for (i = 0; i < n; i++) {
				var c = i % cols, rw = Math.floor(i / cols), cell = { x: c * cw, y: rw * ch, w: cw, h: ch }, f = R.fit(srcs[i].w || 16, srcs[i].h || 9, cell, "contain");
				out.push({ x: f.x, y: f.y, w: f.w, h: f.h, hide: false });
			}
			return out;
		}
		// pip
		var small = Math.round(Math.min(W, H) * 0.28), pad = Math.round(Math.min(W, H) * 0.03), x = W - pad;
		for (i = n - 1; i >= 0; i--) {
			if (i === main) continue;
			var s = srcs[i], bw, bh;
			if (s.kind === "camera") { bw = bh = small; }
			else { var ar = (s.w || 16) / (s.h || 9); bh = small; bw = Math.round(bh * ar); if (bw > W * 0.4) { bw = Math.round(W * 0.4); bh = Math.round(bw / ar); } }
			x -= bw; out[i] = { x: x, y: H - pad - bh, w: bw, h: bh, hide: false }; x -= pad;
			if (x < W * 0.15) x = W - pad;   // wrap back: never runs off the left edge
		}
		var m = srcs[main], mf = R.fit(m.w || W, m.h || H, { x: 0, y: 0, w: W, h: H }, "contain");
		out[main] = { x: mf.x, y: mf.y, w: mf.w, h: mf.h, hide: false };
		return out;
	};

	/* ---------- picking, moving, resizing on the preview ---------- */
	/* topmost visible rect containing (px, py); rects in drawing order. -1 = none */
	R.hit = function (rects, px, py) {
		for (var i = rects.length - 1; i >= 0; i--) { var r = rects[i]; if (r && !r.hide && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i; }
		return -1;
	};
	/* which corner handle of r is under (px, py) within tol: "nw" | "ne" | "sw" | "se" | null */
	R.handleAt = function (r, px, py, tol) {
		var cs = { nw: [r.x, r.y], ne: [r.x + r.w, r.y], sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h] };
		for (var k in cs) if (Math.abs(px - cs[k][0]) <= tol && Math.abs(py - cs[k][1]) <= tol) return k;
		return null;
	};
	/* moved by (dx, dy), kept at least `keep` px inside the picture */
	R.move = function (r, dx, dy, W, H, keep) {
		keep = keep == null ? 24 : keep;
		return { x: clamp(r.x + dx, keep - r.w, W - keep), y: clamp(r.y + dy, keep - r.h, H - keep), w: r.w, h: r.h, hide: r.hide };
	};
	/* resized by dragging corner `h` by (dx, dy), the opposite corner stays put; aspect kept unless free; min size `min` px */
	R.resize = function (r, h, dx, dy, opt) {
		opt = opt || {}; var min = opt.min || 40, ar = r.w / r.h;
		var x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
		if (h.indexOf("w") >= 0) x0 += dx; else x1 += dx;
		if (h.indexOf("n") >= 0) y0 += dy; else y1 += dy;
		var w = Math.max(min, x1 - x0), hh = Math.max(min, y1 - y0);
		if (!opt.free) { if (Math.abs(dx) * r.h >= Math.abs(dy) * r.w) hh = w / ar; else w = hh * ar; if (w < min) { w = min; hh = w / ar; } if (hh < min) { hh = min; w = hh * ar; } }
		var nx = h.indexOf("w") >= 0 ? r.x + r.w - w : r.x, ny = h.indexOf("n") >= 0 ? r.y + r.h - hh : r.y;
		return { x: nx, y: ny, w: w, h: hh, hide: r.hide };
	};
	/* snap a rect's edges to the picture edges / centre lines within tol; returns the snapped rect and the lines it used */
	R.snap = function (r, W, H, tol) {
		var o = { x: r.x, y: r.y, w: r.w, h: r.h, hide: r.hide }, lines = [];
		var xs = [[0, 0], [W - r.w, W], [(W - r.w) / 2, W / 2]], ys = [[0, 0], [H - r.h, H], [(H - r.h) / 2, H / 2]], i;
		for (i = 0; i < 3; i++) if (Math.abs(r.x - xs[i][0]) <= tol) { o.x = xs[i][0]; lines.push(["v", xs[i][1]]); break; }
		for (i = 0; i < 3; i++) if (Math.abs(r.y - ys[i][0]) <= tol) { o.y = ys[i][0]; lines.push(["h", ys[i][1]]); break; }
		return { r: o, lines: lines };
	};

	/* ---------- crop boxes ---------- */
	/* a crop is stored in source fractions {x, y, w, h} (0..1). From a drag between two points given in fractions; tiny drags = null (no crop) */
	R.cropFromDrag = function (ax, ay, bx, by, minFrac) {
		minFrac = minFrac || 0.02;
		var x0 = clamp(Math.min(ax, bx), 0, 1), y0 = clamp(Math.min(ay, by), 0, 1), x1 = clamp(Math.max(ax, bx), 0, 1), y1 = clamp(Math.max(ay, by), 0, 1);
		if (x1 - x0 < minFrac || y1 - y0 < minFrac) return null;
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	};
	/* source pixel rect for a crop (whole source when none); even sizes so encoders are happy */
	R.cropPx = function (crop, sw, sh) {
		if (!crop) return { x: 0, y: 0, w: sw, h: sh };
		var x = Math.round(crop.x * sw), y = Math.round(crop.y * sh), w = Math.max(2, Math.round(crop.w * sw / 2) * 2), h = Math.max(2, Math.round(crop.h * sh / 2) * 2);
		if (x + w > sw) x = Math.max(0, sw - w); if (y + h > sh) y = Math.max(0, sh - h);
		return { x: x, y: y, w: Math.min(w, sw), h: Math.min(h, sh) };
	};
	/* the crop moved / resized by a drag inside the crop editor ("move" or a corner), kept inside 0..1 */
	R.cropEdit = function (c, mode, dx, dy) {
		var x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h, m = 0.02;
		if (mode === "move") { var nx = clamp(x0 + dx, 0, 1 - c.w), ny = clamp(y0 + dy, 0, 1 - c.h); return { x: nx, y: ny, w: c.w, h: c.h }; }
		if (mode.indexOf("w") >= 0) x0 = clamp(x0 + dx, 0, x1 - m); else x1 = clamp(x1 + dx, x0 + m, 1);
		if (mode.indexOf("n") >= 0) y0 = clamp(y0 + dy, 0, y1 - m); else y1 = clamp(y1 + dy, y0 + m, 1);
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	};

	/* ---------- timer that knows about pauses ---------- */
	R.Timer = function () { this.acc = 0; this.t0 = 0; this.state = "idle"; };
	R.Timer.prototype.start = function (now) { this.acc = 0; this.t0 = now; this.state = "rec"; };
	R.Timer.prototype.pause = function (now) { if (this.state === "rec") { this.acc += now - this.t0; this.state = "paused"; } };
	R.Timer.prototype.resume = function (now) { if (this.state === "paused") { this.t0 = now; this.state = "rec"; } };
	R.Timer.prototype.stop = function (now) { if (this.state === "rec") this.acc += now - this.t0; this.state = "idle"; return this.acc; };
	R.Timer.prototype.elapsed = function (now) { return this.state === "rec" ? this.acc + (now - this.t0) : this.acc; };

	/* 83500 -> "1:23", 3723000 -> "1:02:03" */
	R.fmtTime = function (ms) {
		var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
	};

	/* ---------- recorder format ----------
	 * pref "mp4" | "webm"; video false = sound only. Returns the first type the browser can record, with its file ending, or null. */
	var VID = {
		mp4: ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4"],
		webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=h264,opus", "video/webm"]
	};
	var AUD = { mp4: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"], webm: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"] };
	R.pickType = function (pref, video, ok) {
		var t = video ? VID : AUD, order = pref === "webm" ? ["webm", "mp4"] : ["mp4", "webm"];
		for (var o = 0; o < order.length; o++) { var list = t[order[o]]; for (var i = 0; i < list.length; i++) if (ok(list[i])) return { type: list[i], ext: R.extOf(list[i]), fallback: o > 0 }; }
		return null;
	};
	R.extOf = function (type) { type = String(type || "").toLowerCase(); if (type.indexOf("video/mp4") === 0) return "mp4"; if (type.indexOf("audio/mp4") === 0) return "m4a"; if (type.indexOf("audio/ogg") === 0) return "ogg"; if (type.indexOf("audio/") === 0) return "webm"; return "webm"; };
	/* bits per second for a picture of w x h at fps: ~0.1 bit per pixel per frame (screen text stays sharp), 2-40 Mbps; quality 0.5 / 1 / 2 */
	R.bitrate = function (w, h, fps, q) { return Math.round(clamp(w * h * (fps || 30) * 0.1 * (q || 1), 1.5e6, 40e6)); };

	/* ---------- names ---------- */
	function two(n) { return (n < 10 ? "0" : "") + n; }
	/* "Screen recording 2026-11-20 at 14.05.09.mp4" */
	R.fileName = function (what, d, ext) {
		return what + " " + d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " at " + two(d.getHours()) + "." + two(d.getMinutes()) + "." + two(d.getSeconds()) + "." + ext;
	};
	/* a name that is not in `used` (array of names): "x.mp4" -> "x (2).mp4" */
	R.unique = function (name, used) {
		if (used.indexOf(name) < 0) return name;
		var dot = name.lastIndexOf("."), b = dot > 0 ? name.slice(0, dot) : name, e = dot > 0 ? name.slice(dot) : "";
		for (var i = 2; i < 1e4; i++) { var n = b + " (" + i + ")" + e; if (used.indexOf(n) < 0) return n; }
		return name;
	};

	/* ---------- meter ---------- */
	/* rms 0..1 -> fraction of the meter (-60 dB .. 0 dB) */
	R.meter = function (rms) { if (!(rms > 0)) return 0; var db = 20 * Math.log10(rms); return clamp((db + 60) / 60, 0, 1); };
	/* slider 0..200 (%) -> gain; 100 = 1 */
	R.gain = function (pct) { return clamp(+pct || 0, 0, 400) / 100; };

	/* ---------- what can this browser do ---------- */
	R.caps = function (nav, win) {
		var md = nav && nav.mediaDevices, ua = (nav && nav.userAgent) || "";
		var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua), firefox = /Firefox\//.test(ua), safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
		var chromium = /Chrome|Chromium|Edg\//.test(ua) && !firefox, win32 = /Windows/.test(ua);
		return {
			screen: !!(md && md.getDisplayMedia) && !mobile, cam: !!(md && md.getUserMedia), rec: !!(win && win.MediaRecorder),
			tabAudio: chromium && !mobile, systemAudio: chromium && win32, folder: !!(win && win.showDirectoryPicker), pip: !!(win && win.documentPictureInPicture),
			firefox: firefox, safari: safari, chromium: chromium, mobile: mobile
		};
	};

	if (typeof module !== "undefined" && module.exports) module.exports = R;
	return R;
})();
