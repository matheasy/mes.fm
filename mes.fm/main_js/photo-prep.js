/* MES Photo Prep (mes.fm/main_js/photo-prep.js): a small, self-contained picture editor for getting a photo ready before it is
   read (OCR) or used. No jQuery, injects its own CSS, light + dark (body.dark-mode), mouse + touch + pen, fills the window on phones.

   API:  MESPhotoPrep.open(source, opts) -> Promise<{blob, canvas, edited} | null>   (null = Cancel / Esc)
         source = File | Blob | HTMLImageElement | HTMLCanvasElement | ImageBitmap
         opts   = {title: "Edit picture", done: "Use this picture", mime: "image/png" | "image/jpeg", quality: 0.92, maxSide: 4000}
   Tools: move / zoom (pinch, wheel), crop (free, 1:1, 4:3, 16:9, portrait switch, auto-crop to text), rotate 90 both ways,
   straighten (-45..45), flip, pen, highlighter, eraser (only your own drawing), white-out box, brightness / contrast /
   greyscale / "Make text clearer" (auto levels + sharpen), undo / redo / reset.
   Drawings are stored in the source picture's own coordinates, so they turn with it. Photos are drawn upright from EXIF.
   The pure maths is MESPhotoPrep.math (node-tested: tool_apps_src/photo-prep-tests.js). */
(function (G) {
  "use strict";

  // ======================================================================== pure maths
  var M = {};
  var clamp = M.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rad = function (d) { return d * Math.PI / 180; };
  function tidy(v) { var r = Math.round(v); return Math.abs(v - r) < 1e-6 ? r : v; }

  // bounding box of a w x h rectangle turned by deg
  M.rotBounds = function (w, h, deg) {
    var r = rad(deg), c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    return { w: tidy(w * c + h * s), h: tidy(w * s + h * c) };
  };
  // largest axis-aligned rectangle (centred) that fits inside a w x h rectangle turned by deg: the crop that leaves no empty corners
  M.innerRect = function (w, h, deg) {
    if (w <= 0 || h <= 0) return { w: 0, h: 0 };
    var a = rad(((deg % 180) + 180) % 180);
    var sa = Math.abs(Math.sin(a)), ca = Math.abs(Math.cos(a));
    if (sa < 1e-12) return { w: w, h: h };
    if (ca < 1e-12) return { w: h, h: w };
    var wl = w >= h, L = wl ? w : h, S = wl ? h : w, wr, hr;
    if (S <= 2 * sa * ca * L || Math.abs(sa - ca) < 1e-10) {
      var x = 0.5 * S;
      if (wl) { wr = x / sa; hr = x / ca; } else { wr = x / ca; hr = x / sa; }
    } else {
      var c2 = ca * ca - sa * sa;
      wr = (w * ca - h * sa) / c2; hr = (h * ca - w * sa) / c2;
    }
    return { w: tidy(wr), h: tidy(hr) };
  };
  // canvas-style matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
  M.mul = function (p, q) {
    return [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
  };
  M.apply = function (m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
  M.invert = function (m) {
    var det = m[0] * m[3] - m[1] * m[2];
    if (!det) return [1, 0, 0, 1, 0, 0];
    var a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
  };
  M.angleOf = function (st) { return ((st.rot || 0) * 90 + (st.str || 0)); };
  // base picture (bw x bh) -> "frame" (the turned picture's bounding box): flips about the centre, then rotation
  M.geom = function (bw, bh, st) {
    var deg = M.angleOf(st), fb = M.rotBounds(bw, bh, deg), r = rad(deg), c = Math.cos(r), s = Math.sin(r);
    var m = [1, 0, 0, 1, -bw / 2, -bh / 2];
    m = M.mul([st.fx ? -1 : 1, 0, 0, st.fy ? -1 : 1, 0, 0], m);
    m = M.mul([c, s, -s, c, 0, 0], m);
    m = M.mul([1, 0, 0, 1, fb.w / 2, fb.h / 2], m);
    return { fw: fb.w, fh: fb.h, m: m, inv: M.invert(m) };
  };
  // the default crop for a geometry: the empty-corner-free rectangle, centred in the frame
  M.autoCrop = function (bw, bh, st) {
    var g = M.geom(bw, bh, st), ir = M.innerRect(bw, bh, M.angleOf(st));
    var w = Math.min(ir.w, g.fw), h = Math.min(ir.h, g.fh);
    return { x: (g.fw - w) / 2, y: (g.fh - h) / 2, w: w, h: h };
  };
  M.clampCrop = function (r, fw, fh, min) {
    min = Math.min(min || 8, fw, fh);
    var w = clamp(r.w, min, fw), h = clamp(r.h, min, fh);
    return { x: clamp(r.x, 0, fw - w), y: clamp(r.y, 0, fh - h), w: w, h: h };
  };
  // the largest rectangle of aspect (w / h) inside r, centred on r, kept inside the frame
  M.fitAspect = function (r, aspect, fw, fh) {
    if (!aspect) return M.clampCrop(r, fw, fh);
    var w = r.w, h = w / aspect;
    if (h > r.h) { h = r.h; w = h * aspect; }
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    return M.clampCrop({ x: cx - w / 2, y: cy - h / 2, w: w, h: h }, fw, fh);
  };
  // drag a crop handle ("n", "se", ... or "move") by dx, dy; aspect 0 = free
  M.resizeCrop = function (r, hd, dx, dy, aspect, fw, fh, min) {
    min = min || 8;
    if (hd === "move") return { x: clamp(r.x + dx, 0, Math.max(0, fw - r.w)), y: clamp(r.y + dy, 0, Math.max(0, fh - r.h)), w: r.w, h: r.h };
    var W = hd.indexOf("w") >= 0, E = hd.indexOf("e") >= 0, N = hd.indexOf("n") >= 0, S = hd.indexOf("s") >= 0;
    var x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    if (!aspect) {
      if (W) x0 = clamp(x0 + dx, 0, x1 - min); if (E) x1 = clamp(x1 + dx, x0 + min, fw);
      if (N) y0 = clamp(y0 + dy, 0, y1 - min); if (S) y1 = clamp(y1 + dy, y0 + min, fh);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    var ax = W ? x1 : E ? x0 : (x0 + x1) / 2, ay = N ? y1 : S ? y0 : (y0 + y1) / 2;
    var w = r.w + (W ? -dx : E ? dx : 0), h = r.h + (N ? -dy : S ? dy : 0);
    if ((N || S) && !(W || E)) w = h * aspect;
    else if ((W || E) && !(N || S)) h = w / aspect;
    else if (Math.abs(w / r.w) >= Math.abs(h / r.h)) h = w / aspect; else w = h * aspect;
    if (w < min) { w = min; h = w / aspect; }
    if (h < min) { h = min; w = h * aspect; }
    var maxW = W ? ax : E ? fw - ax : 2 * Math.min(ax, fw - ax);
    var maxH = N ? ay : S ? fh - ay : 2 * Math.min(ay, fh - ay);
    var k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k;
    return { x: W ? ax - w : E ? ax : ax - w / 2, y: N ? ay - h : S ? ay : ay - h / 2, w: w, h: h };
  };
  M.otsu = function (hist) {
    var total = 0, sum = 0, i;
    for (i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
    var sB = 0, wB = 0, best = 0, t = 127;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      var wF = total - wB; if (!wF) break;
      sB += i * hist[i];
      var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  };
  // grey values below lo % and above hi % of the pixels (auto levels)
  M.levels = function (hist, loPct, hiPct) {
    var total = 0, i; for (i = 0; i < 256; i++) total += hist[i];
    var lo = 0, hi = 255, acc = 0, a = total * (loPct == null ? 0.01 : loPct), b = total * (hiPct == null ? 0.99 : hiPct);
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > a) { lo = i; break; } }
    acc = 0; for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= b) { hi = i; break; } }
    if (hi - lo < 16) { var m = (lo + hi) / 2; lo = Math.max(0, Math.round(m - 8)); hi = Math.min(255, lo + 16); }
    return [lo, hi];
  };
  M.lut = function (adj, lv) {
    var t = new Uint8ClampedArray(256), b = (adj.b || 0) * 2.55, c = clamp(adj.c || 0, -100, 100) * 2.55;
    var f = (259 * (c + 255)) / (255 * (259 - c)), lo = lv ? lv[0] : 0, hi = lv ? lv[1] : 255;
    for (var v = 0; v < 256; v++) {
      var x = lv ? (v - lo) * 255 / (hi - lo) : v;
      x = x + b; x = f * (x - 128) + 128;
      t[v] = x;
    }
    return t;
  };
  M.isPlainAdj = function (a) { return !a || (!a.b && !a.c && !a.g && !a.t); };
  // brightness b, contrast c (-100..100), greyscale g, "make text clearer" t: grey -> levels + LUT -> sharpen. Mutates data (RGBA).
  M.adjustPixels = function (data, w, h, adj) {
    if (M.isPlainAdj(adj)) return data;
    var n = w * h, i, p, lv = null;
    if (adj.g) for (i = 0; i < n; i++) { p = i * 4; var L = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000; data[p] = data[p + 1] = data[p + 2] = L; }
    if (adj.t) {
      var hist = new Uint32Array(256), step = n > 400000 ? Math.floor(n / 400000) : 1;
      for (i = 0; i < n; i += step) { p = i * 4; hist[(data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000 | 0]++; }
      lv = M.levels(hist, 0.01, 0.99);
    }
    var t = M.lut(adj, lv);
    for (i = 0; i < n; i++) { p = i * 4; data[p] = t[data[p]]; data[p + 1] = t[data[p + 1]]; data[p + 2] = t[data[p + 2]]; }
    if (adj.t && w > 2 && h > 2) M.sharpen(data, w, h, 0.6);
    return data;
  };
  M.sharpen = function (data, w, h, amt) {
    var src = new Uint8ClampedArray(data), row = w * 4;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var p = (y * w + x) * 4;
      for (var k = 0; k < 3; k++) {
        var v = src[p + k], e = 4 * v - src[p + k - 4] - src[p + k + 4] - src[p + k - row] - src[p + k + row];
        data[p + k] = v + amt * e;
      }
    }
    return data;
  };
  // bounding box of the text in a grey image, or null. Works on cells: a cell is "texty" when it has many strong edges in BOTH directions
  // (letters do; the straight edge of a table, a coloured band or a turned photo's corner has them in one direction only), and it is
  // kept only next to another texty cell. Light text on dark works the same way.
  M.inkBounds = function (gray, w, h) {
    var cs = Math.max(8, Math.round(Math.min(w, h) / 40)), cw = Math.ceil(w / cs), ch = Math.ceil(h / cs), T = 36;
    var ex = new Uint32Array(cw * ch), ey = new Uint32Array(cw * ch), x, y, i;
    for (y = 0; y < h - 1; y++) for (x = 0; x < w - 1; x++) {
      var p = y * w + x, c = ((y / cs) | 0) * cw + ((x / cs) | 0);
      if (Math.abs(gray[p + 1] - gray[p]) > T) ex[c]++;
      if (Math.abs(gray[p + w] - gray[p]) > T) ey[c]++;
    }
    var tx = new Uint8Array(cw * ch), min = 0.04 * cs * cs;
    for (i = 0; i < cw * ch; i++) { var a = ex[i], b = ey[i]; if (a + b > min && Math.min(a, b) > 0.3 * Math.max(a, b)) tx[i] = 1; }
    var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) {
      if (!tx[y * cw + x]) continue;
      var nb = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < cw && Y < ch && tx[Y * cw + X]) nb++; }
      if (!nb) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    var m = Math.round(Math.max(w, h) * 0.02);
    var r = { x: Math.max(0, x0 * cs - m), y: Math.max(0, y0 * cs - m) };
    r.w = Math.min(w, (x1 + 1) * cs + m) - r.x; r.h = Math.min(h, (y1 + 1) * cs + m) - r.y;
    if (r.w * r.h > 0.96 * w * h || r.w < 8 || r.h < 8) return null;
    return r;
  };
  M.initial = function (bw, bh) {
    var st = { rot: 0, fx: false, fy: false, str: 0, adj: { b: 0, c: 0, g: false, t: false }, strokes: [] };
    st.crop = M.autoCrop(bw, bh, st);
    return st;
  };
  M.clone = function (s) { return { rot: s.rot, fx: s.fx, fy: s.fy, str: s.str, crop: { x: s.crop.x, y: s.crop.y, w: s.crop.w, h: s.crop.h }, adj: { b: s.adj.b, c: s.adj.c, g: s.adj.g, t: s.adj.t }, strokes: s.strokes.slice() }; };
  M.same = function (a, b) {
    var near = function (p, q) { return Math.abs(p - q) < 0.5; };
    return a.rot % 4 === b.rot % 4 && !a.fx === !b.fx && !a.fy === !b.fy && a.str === b.str && a.strokes.length === b.strokes.length &&
      a.strokes.every(function (s, i) { return s === b.strokes[i]; }) &&
      a.adj.b === b.adj.b && a.adj.c === b.adj.c && !a.adj.g === !b.adj.g && !a.adj.t === !b.adj.t &&
      near(a.crop.x, b.crop.x) && near(a.crop.y, b.crop.y) && near(a.crop.w, b.crop.w) && near(a.crop.h, b.crop.h);
  };
  M.fitSide = function (w, h, maxSide) { var k = Math.min(1, maxSide / Math.max(w, h)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), k: k }; };
  M.History = function (limit) { this.list = []; this.i = -1; this.limit = limit || 80; };
  M.History.prototype = {
    push: function (s) { this.list = this.list.slice(0, this.i + 1); this.list.push(s); if (this.list.length > this.limit) this.list.shift(); this.i = this.list.length - 1; return s; },
    cur: function () { return this.list[this.i]; },
    canUndo: function () { return this.i > 0; },
    canRedo: function () { return this.i < this.list.length - 1; },
    undo: function () { if (this.i > 0) this.i--; return this.list[this.i]; },
    redo: function () { if (this.i < this.list.length - 1) this.i++; return this.list[this.i]; }
  };
  // flip what you SEE left-right (h) or upside down: a screen flip F turns R(a) into R(-a) F, so the angle changes sign and the base flip toggles
  M.flip = function (st, horizontal) {
    return { fx: horizontal ? !st.fx : !!st.fx, fy: horizontal ? !!st.fy : !st.fy, rot: (4 - (st.rot || 0)) % 4, str: st.str ? -st.str : 0 };
  };
  M.ASPECTS = { free: 0, "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9 };
  // frame region (rw x rh) -> screen (sw x sh): scale and offsets that fit it inside the screen with `pad` css px all round (zoom z, pan px/py)
  M.fitView = function (sw, sh, R, pad, z, px, py) {
    pad = Math.max(0, Math.min(pad || 0, sw / 4, sh / 4));
    var k = Math.max(1e-6, Math.min((sw - 2 * pad) / R.w, (sh - 2 * pad) / R.h)) * (z || 1);
    return { k: k, ox: sw / 2 - (R.x + R.w / 2) * k + (px || 0), oy: sh / 2 - (R.y + R.h / 2) * k + (py || 0) };
  };
  // the margin around the picture: room for the crop handles (finger-sized on touch screens), a little air otherwise
  M.viewPad = function (tool, sw, sh, touch) {
    if (tool === "crop" || tool === "rotate") return touch ? 28 : 20;
    return Math.round(Math.min(sw, sh) * 0.04);
  };
  // the visible part of the page (visualViewport) when it differs from the layout viewport (pinch-zoomed page, keyboard open): {x, y, w, h}, else null
  M.visibleBox = function (vv, lw, lh) {
    if (!vv || !vv.width || !vv.height) return null;
    if (Math.abs(vv.width - lw) < 2 && Math.abs(vv.height - lh) < 2 && Math.abs(vv.offsetLeft || 0) < 1 && Math.abs(vv.offsetTop || 0) < 1) return null;
    return { x: Math.round(vv.offsetLeft || 0), y: Math.round(vv.offsetTop || 0), w: Math.round(vv.width), h: Math.round(vv.height) };
  };
  M.zoomLabel = function (z) { return (Math.round(z * 10) / 10 || 0.1) + "×"; };   // times the fitted size (a "100%" here was read as real pixels)

  var API = { math: M, version: "1.0", open: open };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (G) G.MESPhotoPrep = API;
  if (typeof document === "undefined") return;

  // ======================================================================== editor
  var CSS = "" +
    "html.mpp-locked,html.mpp-locked body{overflow:hidden!important}" +
    "#mes-pp{--pp-bg:#eef2f5;--pp-panel:#ffffff;--pp-ink:#1d232b;--pp-mut:#56606d;--pp-line:#cdd5dd;--pp-acc:#0b7285;--pp-accink:#ffffff;--pp-tint:#dff1f4;--pp-stage:#dde3e9;--pp-hover:#eef3f6;" +
    "position:fixed;inset:0;z-index:2147483000;background:rgba(10,14,18,.62);font:15px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:var(--pp-ink);-webkit-text-size-adjust:100%}" +
    "body.dark-mode #mes-pp{--pp-bg:#16191d;--pp-panel:#202429;--pp-ink:#e8ecf1;--pp-mut:#aab3bf;--pp-line:#3f464f;--pp-acc:#38bdd2;--pp-accink:#062a30;--pp-tint:#123a42;--pp-stage:#0e1013;--pp-hover:#2a2f35}" +
    "#mes-pp *{box-sizing:border-box}" +
    "#mes-pp :is(div,span,p,b,label,small,output,strong){color:inherit}" +
    "#mes-pp .mpp-win{position:absolute;inset:3vh 3vw;max-width:1400px;margin:0 auto;background:var(--pp-bg);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45)}" +
    "@media (max-width:760px),(max-height:620px){#mes-pp .mpp-win{inset:0;border-radius:0}}" +
    "#mes-pp .mpp-top{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--pp-panel);border-bottom:1px solid var(--pp-line);flex-wrap:nowrap;min-width:0}" +
    "#mes-pp .mpp-top>button{flex:0 0 auto}" +
    "#mes-pp .mpp-ds{display:none}" +
    "#mes-pp .mpp-title{font-weight:800;font-size:1.05em;margin-right:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 0}" +
    "#mes-pp button{font:inherit;color:var(--pp-ink);background:var(--pp-panel);border:1px solid var(--pp-line);border-radius:9px;min-height:40px;min-width:40px;padding:0 10px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;line-height:1.1;touch-action:manipulation}" +
    "#mes-pp button:hover{background:var(--pp-hover)}" +
    "#mes-pp button:focus-visible,#mes-pp input:focus-visible{outline:3px solid var(--pp-acc);outline-offset:1px}" +
    "#mes-pp button:disabled{opacity:.45;cursor:default}" +
    "#mes-pp button.mpp-pri{background:var(--pp-acc);color:var(--pp-accink);border-color:var(--pp-acc);font-weight:700}" +
    "#mes-pp button[aria-pressed=true]{background:var(--pp-tint);border-color:var(--pp-acc);color:var(--pp-ink)}" +
    "#mes-pp svg.mpp-i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}" +
    "#mes-pp .mpp-tools{display:flex;gap:6px;padding:8px 10px;background:var(--pp-panel);border-bottom:1px solid var(--pp-line);overflow-x:auto;scrollbar-width:thin}" +
    "#mes-pp .mpp-tools button{flex:0 0 auto;flex-direction:column;gap:2px;min-width:62px;min-height:52px;padding:4px 6px;font-size:.8em}" +
    "#mes-pp .mpp-opts{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:8px 12px;background:var(--pp-panel);border-bottom:1px solid var(--pp-line);min-height:52px}" +
    "#mes-pp .mpp-opts label{display:inline-flex;align-items:center;gap:6px;font-size:.92em;white-space:nowrap}" +
    "#mes-pp .mpp-opts input[type=range]{width:min(42vw,200px);accent-color:var(--pp-acc);min-height:32px}" +
    "#mes-pp .mpp-opts input[type=checkbox]{width:20px;height:20px;accent-color:var(--pp-acc)}" +
    "#mes-pp .mpp-hint{color:var(--pp-mut);font-size:.88em}" +
    "#mes-pp .mpp-sw{width:34px;min-width:34px;height:34px;min-height:34px;padding:0;border-radius:50%;border:2px solid var(--pp-line)}" +
    "#mes-pp .mpp-sw[aria-pressed=true]{outline:3px solid var(--pp-acc);outline-offset:1px}" +
    "#mes-pp .mpp-grp{display:inline-flex;gap:4px;flex-wrap:wrap}" +
    "#mes-pp .mpp-stage{position:relative;flex:1 1 auto;min-height:160px;background:var(--pp-stage);overflow:hidden}" +
    "#mes-pp .mpp-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}" +
    "#mes-pp .mpp-stage[data-tool=move] canvas{cursor:grab}" +
    "#mes-pp .mpp-zoom{position:absolute;right:8px;bottom:8px;display:flex;gap:4px;align-items:center;background:var(--pp-panel);border:1px solid var(--pp-line);border-radius:10px;padding:3px}" +
    "#mes-pp .mpp-zoom button{min-height:36px;min-width:36px;border:0}" +
    "#mes-pp .mpp-zoom output{min-width:3.4em;text-align:center;font-size:.85em;color:var(--pp-mut)}" +
    "#mes-pp .mpp-size{position:absolute;left:8px;bottom:8px;background:var(--pp-panel);border:1px solid var(--pp-line);border-radius:8px;padding:3px 8px;font-size:.8em;color:var(--pp-mut)}" +
    "#mes-pp .mpp-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--pp-ink)}" +
    "#mes-pp .mpp-sp{flex:1 1 auto}" +
    "@media (max-width:760px){#mes-pp .mpp-win{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto}#mes-pp .mpp-win>*{min-width:0}#mes-pp .mpp-top{order:0}#mes-pp .mpp-stage{order:1}#mes-pp .mpp-opts{order:2;border-top:1px solid var(--pp-line);border-bottom:0;max-height:34vh;overflow:auto}#mes-pp .mpp-tools{order:3;border-top:1px solid var(--pp-line);border-bottom:0}#mes-pp .mpp-lbl-long{display:none}#mes-pp .mpp-top button{padding:0 8px}}" +
    "@media (max-width:520px){#mes-pp{font-size:14px}#mes-pp .mpp-top{gap:4px;padding:6px}#mes-pp .mpp-top .mpp-reset,#mes-pp .mpp-title{display:none}#mes-pp .mpp-top .mpp-pri{margin-left:auto}#mes-pp .mpp-dl{display:none}#mes-pp .mpp-ds{display:inline}" +
    "#mes-pp .mpp-tools{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;padding:5px 4px;overflow:visible}#mes-pp .mpp-tools button{min-width:0;min-height:50px;padding:3px 1px;font-size:.72em;border-radius:8px}#mes-pp .mpp-tools button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#mes-pp .mpp-opts{gap:6px 8px;padding:6px 8px}#mes-pp .mpp-opts input[type=range]{width:min(52vw,200px)}#mes-pp .mpp-zoom{right:6px;bottom:6px}#mes-pp .mpp-size{display:none}}" +
    "@media (max-width:340px){#mes-pp .mpp-cancel .mpp-lbl{display:none}}";

  var IC = {
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    crop: '<path d="M6 2v16h16M2 6h16v16"/>',
    rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    adjust: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    hl: '<path d="M9 14l-4 4h5l1-1"/><path d="M9 14l7-9 4 3-7 9z"/><path d="M3 21h18" opacity=".55"/>',
    er: '<path d="M8 20h12"/><path d="M4.5 14.5l8-8a2 2 0 0 1 3 0l2.9 2.9a2 2 0 0 1 0 3L12 19H8z"/><path d="M9 10l5 5"/>',
    box: '<rect x="3" y="6" width="18" height="12" rx="1" fill="currentColor" opacity=".25"/><rect x="3" y="6" width="18" height="12" rx="1"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    rl: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 4v7h7"/>',
    rr: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    fh: '<path d="M12 3v18"/><path d="M9 7L4 12l5 5z"/><path d="M15 7l5 5-5 5z"/>',
    fv: '<path d="M3 12h18"/><path d="M7 9l5-5 5 5z"/><path d="M7 15l5 5 5-5z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  function ic(n) { return '<svg class="mpp-i" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + "</svg>"; }
  var TOOLS = [["move", "Move", "Move and zoom"], ["crop", "Crop", "Crop"], ["rotate", "Rotate", "Rotate and straighten"], ["adjust", "Adjust", "Brightness, contrast and clearer text"],
    ["pen", "Pen", "Draw"], ["hl", "Marker", "Highlighter"], ["er", "Erase", "Erase your drawing"], ["box", "Cover", "White-out: cover a part with a box"]];
  var PEN_COLORS = ["#111111", "#ffffff", "#e11d48", "#2563eb", "#16a34a", "#f59e0b"];
  var HL_COLORS = ["#fde047", "#86efac", "#f9a8d4", "#93c5fd"];

  function injectCss() {
    if (document.getElementById("mes-pp-css")) return;
    var s = document.createElement("style"); s.id = "mes-pp-css"; s.textContent = CSS; document.head.appendChild(s);
  }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  function decode(src) {
    if (src && typeof Blob !== "undefined" && src instanceof Blob) {
      var viaImg = function () {
        return new Promise(function (res, rej) {
          var url = URL.createObjectURL(src), im = new Image();
          im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(url); }, 2000); };
          im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("This picture can't be opened in this browser.")); };
          im.src = url;
        });
      };
      if (G.createImageBitmap) return createImageBitmap(src, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(src); }).catch(viaImg);
      return viaImg();
    }
    if (src && src.tagName === "IMG" && !src.complete) return new Promise(function (res, rej) { src.onload = function () { res(src); }; src.onerror = rej; });
    return Promise.resolve(src);
  }
  function sizeOf(s) { return { w: s.naturalWidth || s.videoWidth || s.width, h: s.naturalHeight || s.videoHeight || s.height }; }

  var openNow = null;
  function open(source, opts) {
    opts = opts || {};
    if (openNow) openNow.cancel();
    injectCss();
    return new Promise(function (resolve) { openNow = new Editor(source, opts, resolve); });
  }

  function Editor(source, opts, resolve) {
    var ed = this, maxSide = Math.max(64, opts.maxSide || 4000), mime = opts.mime === "image/jpeg" ? "image/jpeg" : (opts.mime === "image/webp" ? "image/webp" : "image/png");
    var lastFocus = document.activeElement, finished = false;
    var root = mk("div"); root.id = "mes-pp"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", opts.title || "Edit picture");
    root.innerHTML =
      '<div class="mpp-win">' +
        '<div class="mpp-top">' +
          '<button type="button" data-a="cancel" class="mpp-cancel" title="Cancel (Esc)" aria-label="Cancel">' + ic("x") + '<span class="mpp-lbl">Cancel</span></button>' +
          '<span class="mpp-title"></span>' +
          '<button type="button" data-a="undo" title="Undo (Ctrl+Z)" aria-label="Undo">' + ic("undo") + "</button>" +
          '<button type="button" data-a="redo" title="Redo (Ctrl+Y)" aria-label="Redo">' + ic("redo") + "</button>" +
          '<button type="button" data-a="reset" class="mpp-reset" title="Back to the picture as it came">Reset</button>' +
          '<button type="button" data-a="done" class="mpp-pri">' + ic("ok") + '<span class="mpp-dl"></span><span class="mpp-ds">Done</span></button></div>' +
        '<div class="mpp-tools" role="toolbar" aria-label="Tools"></div>' +
        '<div class="mpp-opts" aria-live="polite"></div>' +
        '<div class="mpp-stage"><canvas aria-label="The picture you are editing"></canvas>' +
          '<span class="mpp-size"></span>' +
          '<div class="mpp-zoom"><button type="button" data-a="zout" aria-label="Zoom out">&minus;</button><output>Fit</output><button type="button" data-a="zin" aria-label="Zoom in">+</button><button type="button" data-a="zfit">Fit</button></div>' +
          '<div class="mpp-wait">Opening the picture&hellip;</div></div>' +
      "</div>";
    var q = function (s) { return root.querySelector(s); };
    q(".mpp-title").textContent = opts.title || "Edit picture";
    q('[data-a="done"] .mpp-dl').textContent = opts.done || "Use this picture";
    q('[data-a="done"]').setAttribute("aria-label", opts.done || "Use this picture");
    var toolsEl = q(".mpp-tools"), optsEl = q(".mpp-opts"), stage = q(".mpp-stage"), cv = q(".mpp-stage canvas"), zoomOut = q(".mpp-zoom output");
    TOOLS.forEach(function (t) {
      var b = mk("button", "", ic(t[0]) + "<span>" + t[1] + "</span>"); b.type = "button"; b.setAttribute("data-tool", t[0]); b.title = t[2]; b.setAttribute("aria-pressed", "false");
      toolsEl.appendChild(b);
    });
    document.body.appendChild(root);
    document.documentElement.classList.add("mpp-locked");
    // a page zoomed in on a phone: position:fixed covers the (bigger) layout viewport, so the right side of the editor would sit off screen.
    // Pin the editor to what is actually visible.
    var vv = G.visualViewport;
    function fitVV() {
      if (!vv) return;
      var R = M.visibleBox(vv, document.documentElement.clientWidth, document.documentElement.clientHeight);
      if (!R) { root.style.left = root.style.top = root.style.width = root.style.height = ""; root.style.inset = ""; return; }
      root.style.inset = "auto"; root.style.left = R.x + "px"; root.style.top = R.y + "px"; root.style.width = R.w + "px"; root.style.height = R.h + "px";
    }
    if (vv) { vv.addEventListener("resize", fitVV); vv.addEventListener("scroll", fitVV); fitVV(); }

    // ---- state ----
    var base = null, bw = 0, bh = 0, vs = 1, viewBase = null, st = null, init = null, hist = new M.History(80);
    var tool = "move", view = { z: 1, px: 0, py: 0 }, aspect = 0, portrait = false;
    var pen = { pen: { c: PEN_COLORS[2], s: 6 }, hl: { c: HL_COLORS[0], s: 26 }, er: { s: 30 }, box: { c: "#ffffff" } };
    var cache = { adjKey: null, adj: null, inkN: -1, ink: null, frameKey: null, frame: null, fs: 1 }, live = null;
    var dpr = 1, sw = 1, sh = 1, raf = 0, coarse = !!(G.matchMedia && G.matchMedia("(pointer: coarse)").matches);

    function finish(result) {
      if (finished) return; finished = true;
      if (openNow === ed) openNow = null;
      document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("resize", sched);
      if (ro) ro.disconnect();
      if (vv) { vv.removeEventListener("resize", fitVV); vv.removeEventListener("scroll", fitVV); }
      root.remove(); document.documentElement.classList.remove("mpp-locked");
      try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {}
      resolve(result);
    }
    ed.cancel = function () { finish(null); };

    decode(source).then(function (img) {
      var sz = sizeOf(img); if (!sz.w || !sz.h) throw new Error("This picture is empty.");
      var f = M.fitSide(sz.w, sz.h, maxSide);
      base = canvas(f.w, f.h); var g = base.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, f.w, f.h);
      if (img.close && img !== source) try { img.close(); } catch (e) {}
      bw = base.width; bh = base.height;
      vs = Math.min(1, 1600 / Math.max(bw, bh));
      viewBase = vs < 1 ? canvas(bw * vs, bh * vs) : base;
      if (vs < 1) { var vg = viewBase.getContext("2d"); vg.imageSmoothingQuality = "high"; vg.drawImage(base, 0, 0, viewBase.width, viewBase.height); }
      st = M.initial(bw, bh); init = M.clone(st); hist.push(M.clone(st));
      q(".mpp-wait").remove();
      setTool(opts.tool || "move"); resize(); updButtons();
      var first = q('[data-a="done"]'); if (first) first.focus({ preventScroll: true });
    }).catch(function (e) {
      var w = q(".mpp-wait"); if (w) w.textContent = String(e && e.message || e) + " Press Cancel.";
    });

    // ---- geometry helpers ----
    function geo() { return M.geom(bw, bh, st); }
    function region() { var g = geo(); return (tool === "crop" || tool === "rotate") ? { x: 0, y: 0, w: g.fw, h: g.fh } : st.crop; }
    function xf() {   // frame -> screen (css px)
      return M.fitView(sw, sh, region(), M.viewPad(tool, sw, sh, coarse), view.z, view.px, view.py);
    }
    function toFrame(sx, sy) { var t = xf(); return [(sx - t.ox) / t.k, (sy - t.oy) / t.k]; }
    function toBase(sx, sy) { var f = toFrame(sx, sy); return M.apply(geo().inv, f[0], f[1]); }

    // ---- rendering ----
    function adjCanvas() {
      var key = JSON.stringify(st.adj);
      if (cache.adjKey === key) return cache.adj;
      cache.adjKey = key;
      if (M.isPlainAdj(st.adj)) { cache.adj = viewBase; return viewBase; }
      var c = canvas(viewBase.width, viewBase.height), g = c.getContext("2d");
      g.drawImage(viewBase, 0, 0);
      var d = g.getImageData(0, 0, c.width, c.height); M.adjustPixels(d.data, c.width, c.height, st.adj); g.putImageData(d, 0, 0);
      cache.adj = c; return c;
    }
    function drawStrokes(g, list, scale) {
      g.save(); g.setTransform(scale, 0, 0, scale, 0, 0); g.lineCap = "round"; g.lineJoin = "round";
      list.forEach(function (s) {
        var p = s.p;
        g.globalCompositeOperation = s.k === "er" ? "destination-out" : "source-over";
        g.globalAlpha = s.k === "hl" ? 0.4 : 1;
        if (s.k === "box") {
          g.fillStyle = s.c; g.beginPath(); g.moveTo(p[0], p[1]); for (var j = 2; j < p.length; j += 2) g.lineTo(p[j], p[j + 1]); g.closePath(); g.fill(); return;
        }
        g.strokeStyle = s.k === "er" ? "#000" : s.c; g.lineWidth = s.s;
        g.beginPath(); g.moveTo(p[0], p[1]);
        if (p.length === 2) g.lineTo(p[0] + 0.01, p[1]);
        for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
        g.stroke();
      });
      g.restore();
    }
    function allStrokes() { return live ? st.strokes.concat([live]) : st.strokes; }
    function inkCanvas() {
      var list = allStrokes();
      if (!list.length) return null;
      if (!cache.ink) cache.ink = canvas(viewBase.width, viewBase.height);
      var g = cache.ink.getContext("2d"); g.clearRect(0, 0, cache.ink.width, cache.ink.height);
      drawStrokes(g, list, vs);
      return cache.ink;
    }
    function frameCanvas() {
      var g0 = geo(), s = vs, fc = cache.frame;
      if (!fc || fc.width !== Math.round(g0.fw * s) || fc.height !== Math.round(g0.fh * s)) fc = cache.frame = canvas(g0.fw * s, g0.fh * s);
      var g = fc.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fc.width, fc.height);
      var m = g0.m; g.setTransform(m[0], m[1], m[2], m[3], m[4] * s, m[5] * s);
      g.imageSmoothingQuality = "high";
      g.drawImage(adjCanvas(), 0, 0);
      var ink = inkCanvas(); if (ink) g.drawImage(ink, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return fc;
    }
    function sched() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }
    function resize() {
      var r = stage.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1);
      sw = Math.max(1, r.width); sh = Math.max(1, r.height);
      cv.width = Math.round(sw * dpr); cv.height = Math.round(sh * dpr);
      render();
    }
    var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sched) : null;
    if (ro) ro.observe(stage); else window.addEventListener("resize", sched);
    function stageColor() { return getComputedStyle(stage).backgroundColor || "#ddd"; }
    function render() {
      if (!st) return;
      var g = cv.getContext("2d"), t = xf(), fc = frameCanvas(), g0 = geo(), c = st.crop;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, sw, sh);
      var full = tool === "crop" || tool === "rotate";
      g.save();
      if (!full) { g.beginPath(); g.rect(c.x * t.k + t.ox, c.y * t.k + t.oy, c.w * t.k, c.h * t.k); g.clip(); }
      // white under the picture (corners outside a turned photo come out white)
      g.fillStyle = "#fff";
      if (full) { g.save(); var mm = M.mul([t.k, 0, 0, t.k, t.ox, t.oy], g0.m); g.setTransform(dpr * mm[0], dpr * mm[1], dpr * mm[2], dpr * mm[3], dpr * mm[4], dpr * mm[5]); g.fillRect(0, 0, bw, bh); g.restore(); }
      else g.fillRect(c.x * t.k + t.ox, c.y * t.k + t.oy, c.w * t.k, c.h * t.k);
      g.imageSmoothingEnabled = t.k / vs < 2.5;
      g.drawImage(fc, t.ox, t.oy, g0.fw * t.k, g0.fh * t.k);
      g.restore();
      if (full) {
        var x = c.x * t.k + t.ox, y = c.y * t.k + t.oy, w = c.w * t.k, h = c.h * t.k;
        g.fillStyle = "rgba(0,0,0,0.5)"; g.beginPath(); g.rect(0, 0, sw, sh); g.rect(x, y, w, h); g.fill("evenodd");
        g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(x, y, w, h);
        g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1; g.beginPath();
        var n = tool === "rotate" ? 6 : 3;
        for (var i = 1; i < n; i++) { g.moveTo(x + w * i / n, y); g.lineTo(x + w * i / n, y + h); g.moveTo(x, y + h * i / n); g.lineTo(x + w, y + h * i / n); }
        g.stroke();
        if (tool === "crop") handles().forEach(function (hd) {
          var R0 = coarse ? 11 : 8;
          g.fillStyle = "#fff"; g.strokeStyle = "#0b7285"; g.lineWidth = 2;
          g.beginPath();
          if (hd.h.length === 1) { var hz = hd.h === "n" || hd.h === "s", L = R0 * 1.7; if (g.roundRect) g.roundRect(hd.x - (hz ? L : R0 * 0.55), hd.y - (hz ? R0 * 0.55 : L), hz ? 2 * L : R0 * 1.1, hz ? R0 * 1.1 : 2 * L, R0 * 0.55); else g.rect(hd.x - (hz ? L : R0 * 0.55), hd.y - (hz ? R0 * 0.55 : L), hz ? 2 * L : R0 * 1.1, hz ? R0 * 1.1 : 2 * L); }
          else g.arc(hd.x, hd.y, R0, 0, Math.PI * 2);
          g.fill(); g.stroke();
        });
      }
      if (tool === "box" && boxDrag) {
        var a = boxDrag.a, b = boxDrag.b;
        g.strokeStyle = "#0b7285"; g.setLineDash([5, 4]); g.lineWidth = 2;
        g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); g.setLineDash([]);
      }
      if (brushAt && (tool === "pen" || tool === "hl" || tool === "er") && !drag) {
        g.strokeStyle = "rgba(127,127,127,0.9)"; g.lineWidth = 1; g.beginPath(); g.arc(brushAt[0], brushAt[1], pen[tool].s / 2, 0, Math.PI * 2); g.stroke();
      }
      zoomOut.textContent = M.zoomLabel(view.z);
      var out = outSize(); q(".mpp-size").textContent = out.w + " × " + out.h + " px";
    }
    function outSize() { var f = M.fitSide(st.crop.w, st.crop.h, maxSide); return f; }
    function handles() {
      var t = xf(), c = st.crop, x = c.x * t.k + t.ox, y = c.y * t.k + t.oy, w = c.w * t.k, h = c.h * t.k;
      return [["nw", x, y], ["n", x + w / 2, y], ["ne", x + w, y], ["e", x + w, y + h / 2], ["se", x + w, y + h], ["s", x + w / 2, y + h], ["sw", x, y + h], ["w", x, y + h / 2]]
        .map(function (a) { return { h: a[0], x: a[1], y: a[2] }; });
    }

    // ---- history ----
    function commit() { hist.push(M.clone(st)); updButtons(); }
    function restore(s) { st = M.clone(s); cache.frameKey = null; updOpts(); updButtons(); render(); }
    function updButtons() {
      q('[data-a="undo"]').disabled = !hist.canUndo();
      q('[data-a="redo"]').disabled = !hist.canRedo();
      q('[data-a="reset"]').disabled = !st || M.same(st, init);
    }
    function regeo() { st.crop = M.autoCrop(bw, bh, st); if (aspect) st.crop = M.fitAspect(st.crop, curAspect(), geo().fw, geo().fh); }
    function curAspect() { return aspect ? (portrait ? 1 / aspect : aspect) : 0; }

    // ---- tools + options ----
    function setTool(tn) {
      tool = tn; stage.setAttribute("data-tool", tn);
      Array.prototype.forEach.call(toolsEl.querySelectorAll("[data-tool]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tool") === tn ? "true" : "false"); });
      view = { z: 1, px: 0, py: 0 };
      buildOpts(); render();
    }
    function chips(name, list, cur) {
      return '<span class="mpp-grp" role="group">' + list.map(function (l) { return '<button type="button" data-' + name + '="' + l[0] + '" aria-pressed="' + (l[0] === cur) + '">' + l[1] + "</button>"; }).join("") + "</span>";
    }
    function swatches(kind, list) {
      return '<span class="mpp-grp" role="group" aria-label="Colour">' + list.map(function (c) { return '<button type="button" class="mpp-sw" data-col="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (pen[kind].c === c) + '"></button>'; }).join("") + "</span>";
    }
    function sizeRange(kind, lo, hi) { return '<label>Size <input type="range" data-size min="' + lo + '" max="' + hi + '" value="' + pen[kind].s + '"></label>'; }
    function buildOpts() {
      var h = "";
      if (tool === "move") h = '<span class="mpp-hint">Drag to move around. Pinch, scroll or use + / &minus; to zoom. Choose a tool below to crop, turn, brighten or write on the picture.</span>';
      else if (tool === "crop") h = chips("asp", [["free", "Free"], ["1:1", "1:1"], ["4:3", "4:3"], ["16:9", "16:9"]], Object.keys(M.ASPECTS).filter(function (k) { return M.ASPECTS[k] === aspect; })[0] || "free") +
        '<button type="button" data-a="portrait" aria-pressed="' + portrait + '" title="Swap to tall / wide">&#8645; Tall</button>' +
        '<button type="button" data-a="autotext" title="Crop close around the text it finds">Auto-crop to text</button>' +
        '<button type="button" data-a="wholecrop">Whole picture</button><span class="mpp-hint">Drag the corners or the edges; drag inside to move.</span>';
      else if (tool === "rotate") h = '<span class="mpp-grp"><button type="button" data-a="rl" title="Turn left 90°">' + ic("rl") + '<span class="mpp-lbl-long">Left</span></button>' +
        '<button type="button" data-a="rr" title="Turn right 90°">' + ic("rr") + '<span class="mpp-lbl-long">Right</span></button>' +
        '<button type="button" data-a="fh" title="Flip left to right">' + ic("fh") + '<span class="mpp-lbl-long">Flip</span></button>' +
        '<button type="button" data-a="fv" title="Flip upside down">' + ic("fv") + '<span class="mpp-lbl-long">Flip down</span></button></span>' +
        '<label>Straighten <input type="range" data-str min="-45" max="45" step="0.5" value="' + st.str + '"><output data-strv>' + fmtDeg(st.str) + "</output></label>" +
        '<button type="button" data-a="str0">0°</button>';
      else if (tool === "adjust") h = '<label>Brightness <input type="range" data-adj="b" min="-100" max="100" value="' + st.adj.b + '"></label>' +
        '<label>Contrast <input type="range" data-adj="c" min="-100" max="100" value="' + st.adj.c + '"></label>' +
        '<label><input type="checkbox" data-adjc="g"' + (st.adj.g ? " checked" : "") + "> Greyscale</label>" +
        '<label><input type="checkbox" data-adjc="t"' + (st.adj.t ? " checked" : "") + '> Make text clearer</label>' +
        '<button type="button" data-a="adj0">Normal</button>';
      else if (tool === "pen") h = swatches("pen", PEN_COLORS) + sizeRange("pen", 1, 40);
      else if (tool === "hl") h = swatches("hl", HL_COLORS) + sizeRange("hl", 8, 80);
      else if (tool === "er") h = sizeRange("er", 6, 120) + '<span class="mpp-hint">Rubs out only what you drew, never the photo.</span>';
      else if (tool === "box") h = chips("boxc", [["#ffffff", "White"], ["#000000", "Black"]], pen.box.c) + '<span class="mpp-hint">Drag a box over anything you want hidden (it won&rsquo;t be read).</span>';
      optsEl.innerHTML = h;
    }
    function fmtDeg(v) { return (v > 0 ? "+" : "") + v + "°"; }
    function updOpts() {
      var s = optsEl.querySelector("[data-str]"); if (s) { s.value = st.str; optsEl.querySelector("[data-strv]").textContent = fmtDeg(st.str); }
      Array.prototype.forEach.call(optsEl.querySelectorAll("[data-adj]"), function (r) { r.value = st.adj[r.getAttribute("data-adj")]; });
      Array.prototype.forEach.call(optsEl.querySelectorAll("[data-adjc]"), function (r) { r.checked = !!st.adj[r.getAttribute("data-adjc")]; });
    }
    toolsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-tool]"); if (b && st) setTool(b.getAttribute("data-tool")); });
    toolsEl.addEventListener("keydown", function (e) {   // roving arrows across the tool buttons
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var bs = Array.prototype.slice.call(toolsEl.querySelectorAll("[data-tool]")), i = bs.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length].focus();
    });
    optsEl.addEventListener("input", function (e) {
      var t = e.target;
      if (t.hasAttribute("data-str")) { st.str = +t.value; optsEl.querySelector("[data-strv]").textContent = fmtDeg(st.str); regeo(); sched(); }
      else if (t.hasAttribute("data-adj")) { st.adj[t.getAttribute("data-adj")] = +t.value; sched(); }
      else if (t.hasAttribute("data-size")) { pen[tool].s = +t.value; }
    });
    optsEl.addEventListener("change", function (e) {
      var t = e.target;
      if (t.hasAttribute("data-str") || t.hasAttribute("data-adj")) commit();
      else if (t.hasAttribute("data-adjc")) { st.adj[t.getAttribute("data-adjc")] = t.checked; commit(); sched(); }
    });
    optsEl.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !st) return;
      var g0 = geo();
      if (b.hasAttribute("data-col")) { pen[tool].c = b.getAttribute("data-col"); buildOpts(); return; }
      if (b.hasAttribute("data-boxc")) { pen.box.c = b.getAttribute("data-boxc"); buildOpts(); return; }
      if (b.hasAttribute("data-asp")) { aspect = M.ASPECTS[b.getAttribute("data-asp")]; if (aspect) st.crop = M.fitAspect(st.crop, curAspect(), g0.fw, g0.fh); commit(); buildOpts(); render(); return; }
      var a = b.getAttribute("data-a");
      if (a === "portrait") { portrait = !portrait; if (aspect) { st.crop = M.fitAspect(M.autoCrop(bw, bh, st), curAspect(), g0.fw, g0.fh); commit(); } buildOpts(); render(); }
      else if (a === "wholecrop") { aspect = 0; st.crop = M.autoCrop(bw, bh, st); commit(); buildOpts(); render(); }
      else if (a === "autotext") autoText();
      else if (a === "rl" || a === "rr") { st.rot = (st.rot + (a === "rr" ? 1 : 3)) % 4; regeo(); commit(); render(); }
      else if (a === "fh" || a === "fv") { var fl = M.flip(st, a === "fh"); st.fx = fl.fx; st.fy = fl.fy; st.rot = fl.rot; st.str = fl.str; regeo(); commit(); updOpts(); render(); }
      else if (a === "str0") { st.str = 0; regeo(); commit(); updOpts(); render(); }
      else if (a === "adj0") { st.adj = { b: 0, c: 0, g: false, t: false }; commit(); updOpts(); render(); }
    });
    function autoText() {
      var g0 = geo(), fc = frameCanvas(), k = Math.min(1, 700 / Math.max(fc.width, fc.height));
      var c = canvas(fc.width * k, fc.height * k), g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(fc, 0, 0, c.width, c.height);
      var d = g.getImageData(0, 0, c.width, c.height).data, gray = new Uint8Array(c.width * c.height);
      for (var i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
      var r = M.inkBounds(gray, c.width, c.height);
      if (!r) { flash("No clear block of text found to crop to."); return; }
      var s = g0.fw / c.width;
      st.crop = M.clampCrop({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }, g0.fw, g0.fh); aspect = 0; commit(); buildOpts(); render();
    }
    function flash(text) { var h = optsEl.querySelector(".mpp-hint"); if (!h) { h = mk("span", "mpp-hint"); optsEl.appendChild(h); } h.textContent = text; }

    // ---- pointer input ----
    var pts = {}, drag = null, pinch = null, boxDrag = null, brushAt = null, spaceDown = false;
    function rel(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function npts() { return Object.keys(pts).length; }
    cv.addEventListener("pointerdown", function (e) {
      if (!st) return;
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      var p = rel(e); pts[e.pointerId] = p; e.preventDefault();
      if (npts() === 2) {   // two fingers: pinch-zoom and pan, drop whatever one finger started
        if (drag && drag.kind === "draw") live = null;
        if (drag && drag.kind === "crop" && drag.st0) st.crop = drag.st0;
        drag = null; boxDrag = null;
        var a = Object.keys(pts).map(function (k) { return pts[k]; });
        pinch = { d: dist(a[0], a[1]), c: mid(a[0], a[1]), z: view.z, px: view.px, py: view.py };
        sched(); return;
      }
      if (npts() > 2) return;
      var panBtn = e.button === 1 || e.button === 2 || spaceDown || tool === "move" || tool === "adjust";
      if (!panBtn && tool === "crop") {
        var hd = hitHandle(p, e.pointerType === "touch" || coarse ? 30 : 16);
        if (hd) { drag = { kind: "crop", h: hd, f0: toFrame(p[0], p[1]), c0: { x: st.crop.x, y: st.crop.y, w: st.crop.w, h: st.crop.h }, st0: st.crop }; return; }
      }
      if (!panBtn && tool === "rotate") panBtn = true;
      if (!panBtn && (tool === "pen" || tool === "hl" || tool === "er")) {
        var b = toBase(p[0], p[1]), t = xf();
        live = { k: tool, c: pen[tool].c, s: pen[tool].s / t.k, p: [b[0], b[1]] };
        drag = { kind: "draw" }; sched(); return;
      }
      if (!panBtn && tool === "box") { boxDrag = { a: p, b: p }; drag = { kind: "box" }; return; }
      drag = { kind: "pan", s: p, px: view.px, py: view.py };
    });
    cv.addEventListener("pointermove", function (e) {
      var p = rel(e);
      if (!(e.pointerId in pts)) { brushAt = p; if (tool === "pen" || tool === "hl" || tool === "er") sched(); return; }
      pts[e.pointerId] = p;
      if (pinch && npts() >= 2) {
        var a = Object.keys(pts).map(function (k) { return pts[k]; }), c = mid(a[0], a[1]);
        zoomAt(pinch.c, clamp(pinch.z * dist(a[0], a[1]) / Math.max(1, pinch.d), 0.3, 12), pinch);
        view.px += c[0] - pinch.c[0]; view.py += c[1] - pinch.c[1];
        sched(); return;
      }
      if (!drag) return;
      if (drag.kind === "pan") { view.px = drag.px + p[0] - drag.s[0]; view.py = drag.py + p[1] - drag.s[1]; sched(); }
      else if (drag.kind === "crop") {
        var f = toFrame(p[0], p[1]), g0 = geo();
        st.crop = M.resizeCrop(drag.c0, drag.h, f[0] - drag.f0[0], f[1] - drag.f0[1], curAspect(), g0.fw, g0.fh, 12);
        sched();
      } else if (drag.kind === "draw" && live) {
        var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs = [e];
        evs.forEach(function (ev) { var q2 = rel(ev), b = toBase(q2[0], q2[1]); live.p.push(b[0], b[1]); });
        brushAt = p; sched();
      } else if (drag.kind === "box") { boxDrag.b = p; sched(); }
    });
    function up(e) {
      if (!(e.pointerId in pts)) return;
      delete pts[e.pointerId];
      if (pinch) { if (npts() < 2) pinch = null; drag = null; return; }
      if (!drag) return;
      var d = drag; drag = null;
      if (d.kind === "crop") { if (st.crop !== d.st0) commit(); }
      else if (d.kind === "draw" && live) { st.strokes = st.strokes.concat([live]); live = null; commit(); }
      else if (d.kind === "box" && boxDrag) {
        var a = boxDrag.a, b = boxDrag.b; boxDrag = null;
        if (Math.abs(a[0] - b[0]) > 3 && Math.abs(a[1] - b[1]) > 3) {
          var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), poly = [];
          [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function (c) { var q2 = toBase(c[0], c[1]); poly.push(q2[0], q2[1]); });
          st.strokes = st.strokes.concat([{ k: "box", c: pen.box.c, p: poly }]); commit();
        }
      }
      sched();
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", function (e) { if (drag && drag.kind === "draw") live = null; up(e); });
    cv.addEventListener("pointerleave", function () { brushAt = null; sched(); });
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    cv.addEventListener("wheel", function (e) {
      if (!st) return; e.preventDefault();
      zoomAt(rel(e), clamp(view.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), 0.3, 12));
      sched();
    }, { passive: false });
    function hitHandle(p, r) {
      var hs = handles(), best = null, bd = r * r;
      hs.forEach(function (h) { var dd = (h.x - p[0]) * (h.x - p[0]) + (h.y - p[1]) * (h.y - p[1]); if (dd <= bd) { bd = dd; best = h.h; } });
      if (best) return best;
      var t = xf(), c = st.crop, x = c.x * t.k + t.ox, y = c.y * t.k + t.oy;
      return p[0] > x && p[0] < x + c.w * t.k && p[1] > y && p[1] < y + c.h * t.k ? "move" : null;
    }
    function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    // zoom to z keeping the screen point S where it is (from = view to start from)
    function zoomAt(S, z, from) {
      from = from || view;
      view.z = from.z; view.px = from.px; view.py = from.py;
      var t0 = xf(), f = [(S[0] - t0.ox) / t0.k, (S[1] - t0.oy) / t0.k];
      view.z = z; view.px = 0; view.py = 0;
      var t1 = xf();
      view.px = S[0] - (f[0] * t1.k + t1.ox); view.py = S[1] - (f[1] * t1.k + t1.oy);
    }

    // ---- top bar, zoom, keys ----
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]"); if (!b || !root.contains(b) || b.closest(".mpp-opts")) return;
      var a = b.getAttribute("data-a");
      if (a === "cancel") finish(null);
      else if (a === "done") done();
      else if (a === "undo" && hist.canUndo()) restore(hist.undo());
      else if (a === "redo" && hist.canRedo()) restore(hist.redo());
      else if (a === "reset" && st) { st = M.clone(init); aspect = 0; commit(); updOpts(); render(); }
      else if (a === "zin") { zoomAt([sw / 2, sh / 2], clamp(view.z * 1.25, 0.3, 12)); sched(); }
      else if (a === "zout") { zoomAt([sw / 2, sh / 2], clamp(view.z / 1.25, 0.3, 12)); sched(); }
      else if (a === "zfit") { view = { z: 1, px: 0, py: 0 }; sched(); }
    });
    root.addEventListener("pointerdown", function (e) { if (e.target === root) e.preventDefault(); });
    function onKey(e) {
      if (finished) return;
      var tag = (e.target && e.target.tagName) || "";
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); return; }
      if (e.key === " " && tag !== "BUTTON" && tag !== "INPUT") { spaceDown = e.type === "keydown"; e.preventDefault(); return; }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) { if (hist.canRedo()) restore(hist.redo()); } else if (hist.canUndo()) restore(hist.undo()); }
      else if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); if (hist.canRedo()) restore(hist.redo()); }
      else if (!mod && tag !== "INPUT" && (e.key === "+" || e.key === "=")) { zoomAt([sw / 2, sh / 2], clamp(view.z * 1.25, 0.3, 12)); sched(); }
      else if (!mod && tag !== "INPUT" && e.key === "-") { zoomAt([sw / 2, sh / 2], clamp(view.z / 1.25, 0.3, 12)); sched(); }
      else if (!mod && tag !== "INPUT" && e.key === "0") { view = { z: 1, px: 0, py: 0 }; sched(); }
      else if (e.key === "Tab") {   // keep the focus inside the editor
        var f = Array.prototype.filter.call(root.querySelectorAll("button, input"), function (x) { return !x.disabled && x.offsetParent; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener("keydown", onKey, true);
    function onKeyUp(e) { if (e.key === " ") spaceDown = false; }
    document.addEventListener("keyup", onKeyUp, true);

    // ---- export at full size ----
    function done() {
      if (!st) return;
      var g0 = geo(), c = st.crop, img = base;
      if (!M.isPlainAdj(st.adj)) {
        img = canvas(bw, bh); var ig = img.getContext("2d"); ig.drawImage(base, 0, 0);
        var d = ig.getImageData(0, 0, bw, bh); M.adjustPixels(d.data, bw, bh, st.adj); ig.putImageData(d, 0, 0);
      }
      var ink = null;
      if (st.strokes.length) { ink = canvas(bw, bh); drawStrokes(ink.getContext("2d"), st.strokes, 1); }
      var f = M.fitSide(c.w, c.h, maxSide), out = canvas(f.w, f.h), g = out.getContext("2d"), m = g0.m, k = f.w / c.w;
      g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height);
      var T = M.mul([k, 0, 0, k, -c.x * k, -c.y * k], m);
      g.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]); g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0); if (ink) g.drawImage(ink, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      var edited = !M.same(st, init);
      var btn = q('[data-a="done"]'); btn.disabled = true; btn.textContent = "Saving…";
      out.toBlob(function (blob) { finish({ blob: blob, canvas: out, edited: edited }); }, mime, opts.quality || 0.92);
    }
  }
})(typeof window !== "undefined" ? window : null);
