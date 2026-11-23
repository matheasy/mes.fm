/* MES Audio Editor (mes.fm/audio): multi-track timeline, editing, effects, AI noise removal (window.MESDenoise, /main_js/denoise.js), A/B preview,
 * recording, export (WAV, MP3 via lamejs, M4A via WebCodecs + mp4-muxer), IndexedDB autosave. Pure model + DSP = lib.js (MESAudio). Nothing is uploaded. */
(function () {
	"use strict";
	var A = window.MESAudio, DN = window.MESDenoise, D = DN && DN.dsp, root = document.getElementById("au");
	if (!root || !A) return;
	/* translations: language pages set window.AU_I18N = {code, name, locale, dir, s: {"English": "translation"}} before this script; English = the key itself */
	var L = window.AU_I18N || null;
	function T(s, v) { var t = L && L.s && L.s[s]; if (typeof t !== "string" || !t) t = s; return v ? t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : t; }
	function shortName(fx) { var n = fx.name.replace(/ \(.*\)$/, ""); return L ? n : n.toLowerCase(); }
	/* the noise report of lib.js (A.noiseReport) in the page's language */
	function repText(r) { if (!r) return ""; if (!isFinite(r.b)) return T("This part is silent: there is no noise to remove."); var v = { before: r.b.toFixed(0), after: r.a.toFixed(0), d: r.db.toFixed(0) }; return r.db < 3 ? T("Background noise {before} dB → {after} dB: almost no steady noise was found to remove.", v) : T("Background noise {before} dB → {after} dB ({d} dB quieter).", v); }
	var LAME = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js", MUXER = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js";
	function $(id) { return document.getElementById(id); }
	function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("mes-audio:" + k)); localStorage.setItem("mes-audio:" + k, JSON.stringify(v)); } catch (e) { return null; } }
	function loadScript(u) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { rej(new Error(T("Could not load {host}", { host: u.split("/")[2] }))); }; document.head.appendChild(s); }); }
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+";

	/* ---------------- state ---------------- */
	var S = { sr: 48000, tracks: [], markers: [], sel: null, selT: [], cursor: 0, start: 0, spp: 400, spec: false, name: "", laneH: 112 };
	var H = new A.History(1.5e9), clipboard = null, dirty = false;
	function snap() { return A.snapshot(S); }
	function commit(label) { if (cmp) endCompare(true); H.push(label, snap()); dirty = true; afterChange(); schedSave(); }
	function restore(e) { S.tracks = e.snap.tracks.map(function (t) { var o = {}, k; for (k in t) o[k] = t[k]; o.clips = t.clips.slice(); return o; }); S.markers = e.snap.markers.map(function (m) { return { id: m.id, t: m.t, name: m.name }; }); S.selT = S.selT.filter(function (id) { return trackById(id); }); afterChange(); schedSave(); }
	function undo() { stopAll(); endCompare(true); var e = H.undo(); if (e) { restore(e); toast(T("Undid {what}", { what: H.stack[H.pos + 1].label })); var r = $("au-result"); if (r && !r.hidden) { r.innerHTML = '<span class="au-ok">' + T("↶ Undone: the track is back to how it was.") + '</span>'; } } else toast(T("Nothing to undo")); }
	function redo() { stopAll(); endCompare(true); var e = H.redo(); if (e) { restore(e); toast(T("Redid {what}", { what: e.label })); } else toast(T("Nothing to redo")); }
	function trackById(id) { for (var i = 0; i < S.tracks.length; i++) if (S.tracks[i].id === id) return S.tracks[i]; return null; }
	function setTrack(t) { S.tracks = S.tracks.map(function (x) { return x.id === t.id ? t : x; }); }
	function projEnd() { return A.projectEnd(S.tracks); }
	function sec(n) { return n / S.sr; }
	function fmt(n, d) { return A.fmtTime(n / S.sr, d); }

	/* ---------------- compare after an effect: the track keeps the cleaned audio; playback / drawing can show the original ---------------- */
	var cmp = null;   // { label, before: tracks before, after: tracks after, ids, a, b, report, show: "after" | "before" | "noise", noise: tracks (made on first use) }
	/* "Noise only" (like the Video Editor's "Taken out"): original minus cleaned = what the effect removed. Hiss / hum there is good; words mean it is too strong.
	   Match levels plays it as loud as the original on average, so even quiet noise is easy to hear. */
	var cmpMatch = store("cmpMatch") !== false;
	function setMatch(on) { cmpMatch = !!on; store("cmpMatch", cmpMatch); if (cmp && cmp.show === "noise") { if (playing) playFrom(playPos(), playEnd); draw(); } if (preview && preview.gn) preview.gn.gain.setTargetAtTime(preview.which === "N" ? nGain() : 0, ctx.currentTime, 0.012); document.querySelectorAll("#au [data-act=match], #au-pmatch").forEach(function (b) { b.checked = cmpMatch; }); }
	function isClean(label) { return /noise|enhance|hum/i.test(label || ""); }
	function rmsOf(ch) { var e = 0, n = 0; ch.forEach(function (c) { for (var i = 0; i < c.length; i++) e += c[i] * c[i]; n += c.length; }); return n ? Math.sqrt(e / n) : 0; }
	function diffOf(orig, proc) { return orig.map(function (o, k) { var p = proc[k] || proc[0], d = new Float32Array(o.length); for (var i = 0; i < o.length; i++) d[i] = o[i] - p[i]; return d; }); }
	function matchDb(ref, x) { var a = rmsOf(ref), b = rmsOf(x); return a > 0 && b > 0 ? Math.max(-6, Math.min(40, A.gainToDb(a / b))) : 0; }
	function noiseTracks() {
		if (cmp.noise) return cmp.noise;
		var out = [];
		cmp.ids.forEach(function (id) {
			var bt = versionOf(cmp.before, id), at = versionOf(cmp.after, id); if (!bt || !at) return;
			var ob = A.renderTrack(bt, cmp.a, cmp.b), d = diffOf(ob, A.renderTrack(at, cmp.a, cmp.b)), t = A.withClips(bt, [A.clip(cmp.a, d)]);
			t.matchDb = matchDb(ob, d); out.push(t);
		});
		return (cmp.noise = out);
	}
	function vt() {
		if (!cmp || cmp.show === "after") return S.tracks; if (cmp.show === "before") return cmp.before;
		return noiseTracks().map(function (t) { var n = A.withClips(t, t.clips); n.gain = (t.gain || 0) + (cmpMatch ? t.matchDb : 0); n.mute = false; n.solo = false; return n; });
	}
	function versionOf(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
	function startCompare(c) { cmp = c; cmp.show = "after"; renderCmpBar(); draw(); }
	function endCompare(silent) { if (!cmp) return; var was = cmp.show; cmp = null; $("au-cmpbar").hidden = true; if (was !== "after" && playing) playFrom(playPos(), playEnd); if (!silent) toast(T("Keeping the result")); draw(); }
	function setCompare(w) {
		if (!cmp || cmp.show === w) return; if (w === "noise" && !isClean(cmp.fid)) return; var p = playing ? playPos() : null, end = playEnd; cmp.show = w;
		if (p != null) playFrom(p, end); renderCmpBar(); draw();
	}
	function renderCmpBar() {
		var bar = $("au-cmpbar"); if (!cmp) { bar.hidden = true; return; } bar.hidden = false;
		var nice = cmp.label.replace(/ \(.*\)$/, "");
		var cl = isClean(cmp.fid);
		bar.innerHTML = '<span class="au-cmp-t">' + T("Compare <b>{what}</b>:", { what: esc(nice) }) + '</span><div class="au-ab au-ab--bar" role="group" aria-label="' + esc(T("Hear the track before or after {what}", { what: nice })) + '"><button type="button" data-w="before" aria-pressed="' + (cmp.show === "before") + '">' + T("Original") + '</button><button type="button" data-w="after" aria-pressed="' + (cmp.show === "after") + '">' + (cl ? T("Cleaned") : T("After")) + '</button>' +
			(cl ? '<button type="button" data-w="noise" aria-pressed="' + (cmp.show === "noise") + '" title="' + esc(T("Only what was removed (key N)")) + '">' + T("Noise only") + '</button>' : "") + '</div>' +
			(cl ? '<label class="au-cmp-ck" title="' + esc(T("Play Noise only as loud as the original on average, so quiet noise is easy to hear")) + '"><input type="checkbox" data-act="match"' + (cmpMatch ? " checked" : "") + '> ' + T("Match levels") + '</label>' : "") +
			'<span class="au-cmp-n">' + (cmp.report ? esc(repText(cmp.report)) + " " : "") + (cl ? T("Press Space to play, <kbd>B</kbd> to switch, <kbd>N</kbd> for noise only.") : T("Press Space to play, <kbd>B</kbd> to switch.")) + '</span><span class="au-cmp-r"><button type="button" class="au-btn au-btn--sm" data-act="undo" title="' + esc(T("Undo")) + ' (' + MOD + 'Z)">' + T("↶ Undo") + '</button><button type="button" class="au-btn au-btn--sm" data-act="keep">' + T("✓ Keep it") + '</button></span>';
		bar.querySelectorAll("[data-w]").forEach(function (b) { b.onclick = function () { setCompare(b.getAttribute("data-w")); }; });
		bar.querySelector("[data-act=undo]").onclick = undo; bar.querySelector("[data-act=keep]").onclick = function () { endCompare(); };
		var mk = bar.querySelector("[data-act=match]"); if (mk) mk.onchange = function () { setMatch(mk.checked); };
	}
	/* before (grey, behind) and after (bright, in front) waveforms, min / max per pixel of the mono mix */
	function drawCompare(c, before, after, num, noise) {
		if (!c) return; var wrap = c.parentNode; wrap.hidden = false;
		var w = Math.max(200, Math.round(c.clientWidth || 300)), h = 150, r = window.devicePixelRatio || 1; c.width = w * r; c.height = h * r;
		var g = c.getContext("2d"); g.setTransform(r, 0, 0, r, 0, 0); g.fillStyle = "#0b0d11"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(0, h / 2, w, 1);
		function mono(ch) { if (ch.length === 1) return ch[0]; var m = new Float32Array(ch[0].length); for (var i = 0; i < m.length; i++) m[i] = 0.5 * (ch[0][i] + ch[1][i]); return m; }
		/* decibel scale (0 to -54 dB below the loudest peak) so quiet background noise is visible, like the spectral editors do */
		var pk = Math.max(1e-4, A.peak(before), A.peak(after)), half = h / 2 - 3, RANGE = 54;
		function yOf(v) { var a = Math.abs(v) / pk; if (a <= 0) return 0; var d = 20 * Math.log10(a); return Math.max(0, (d + RANGE) / RANGE) * half; }
		var layers = [[mono(before), "#6b7280"]]; if (noise) layers.push([mono(noise), "#f87171"]); layers.push([mono(after), "#5eead4"]);   // noise behind the cleaned wave: it shows in the pauses
		layers.forEach(function (L) {
			var d = L[0], n = d.length, step = n / w; g.fillStyle = L[1];
			for (var x = 0; x < w; x++) { var i0 = Math.floor(x * step), i1 = Math.max(i0 + 1, Math.floor((x + 1) * step)), m = 0; for (var i = i0; i < i1 && i < n; i++) { var v = Math.abs(d[i]); if (v > m) m = v; } var yy = yOf(m); g.fillRect(x, h / 2 - yy, 1, Math.max(1, 2 * yy)); }
		});
		g.fillStyle = "rgba(231,233,238,0.55)"; g.font = "10px system-ui,sans-serif"; g.fillText(T("dB scale: quiet noise shows"), 6, 12);
		var nb = $("au-cmpnum"); if (nb && num !== undefined) nb.textContent = num || "";
	}
	function showResult(fx, rep) {
		var r = $("au-result"); if (!r || !curFx || curFx.id !== fx.id) return; r.hidden = false;
		var low = rep && rep.db < 3 && fx.id === "noise";
		r.innerHTML = '<div class="au-ok">' + T("✓ Applied {what}.", { what: esc(shortName(fx)) }) + "</div>" + (rep ? '<div class="au-note"><b>' + esc(repText(rep)) + "</b></div>" : "") +
			(low ? '<div class="au-note au-warnnote">' + T("If you still hear noise, it is probably not steady background noise (another voice, music, echo of the room). Try the Spectral gate with a noise sample, or Hum removal for a buzz.") + '</div>' : "") +
			'<div class="au-row"><button type="button" class="au-btn au-btn--sm" data-act="undo">' + T("↶ Undo") + ' (' + MOD + 'Z)</button><span class="au-note">' + T("Use <b>Compare</b> above the tracks to hear Original and Cleaned, then export.") + '</span></div>' +
			'<div class="au-note">' + T("Using it in a video editor (Camtasia, Premiere, CapCut…)? Mute or delete the video's own sound there, or you will still hear the noisy original under the cleaned file.") + '</div>';
		r.querySelector("[data-act=undo]").onclick = undo;
		if (cmp && $("au-cmpcv")) { var keep = cmp, b0 = keep.before.filter(function (t) { return keep.ids.indexOf(t.id) >= 0; }), a0 = keep.after.filter(function (t) { return keep.ids.indexOf(t.id) >= 0; }); var mb = A.mix(b0, keep.a, keep.b, 1), ma = A.mix(a0, keep.a, keep.b, 1); drawCompare($("au-cmpcv"), mb, ma, T("Whole applied part"), isClean(keep.label) ? diffOf(mb, ma) : null); }
	}

	/* ---------------- toast / busy ---------------- */
	var toastT = null;
	function toast(msg, action) {
		var t = root.querySelector(".au-toast"); if (t) t.remove();
		t = el("div", { class: "au-toast", role: "status" }, esc(msg)); if (action) { var b = el("button", { type: "button", class: "au-btn au-btn--sm" }, esc(action.label)); b.onclick = function () { t.remove(); action.fn(); }; t.appendChild(b); }
		root.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, action ? 7000 : 2600);
	}
	var busyAbort = null;
	function busy(title) {
		var o = el("div", { class: "au-busy" }, '<div class="au-busy-in"><div class="au-busy-t">' + esc(title) + '</div><div class="au-prog"><i></i></div><div class="au-busy-m">' + T("Starting…") + '</div><div><button type="button" class="au-btn au-btn--sm">' + T("Cancel") + '</button></div></div>');
		root.appendChild(o); var ac = window.AbortController ? new AbortController() : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } };
		busyAbort = ac; o.querySelector("button").onclick = function () { ac.abort(); o.querySelector(".au-busy-m").textContent = T("Stopping…"); };
		var tp = window.MESTabProgress ? window.MESTabProgress.task(title) : null;   // shows in the browser tab once the job has run a couple of seconds
		return { signal: ac.signal, set: function (f, m) { o.querySelector("i").style.width = Math.round(f * 100) + "%"; if (m) o.querySelector(".au-busy-m").textContent = T(m) + " · " + Math.round(f * 100) + "%"; if (tp) tp.set(f); }, done: function () { o.remove(); busyAbort = null; if (tp) { if (ac.signal.aborted) tp.fail(T("Cancelled")); else tp.done(); } } };
	}
	function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

	/* ---------------- audio context / decoding ---------------- */
	var ctx = null, master = null, analyser = null;
	function actx() {
		if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; ctx = new C(); master = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser); analyser.connect(ctx.destination); master.gain.value = +$("au-vol").value; }
		if (ctx.state === "suspended") ctx.resume();
		return ctx;
	}
	function decode(buf) {
		var O = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new O(2, 1, S.sr);
		return new Promise(function (res, rej) { var p = oc.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
	}
	function abToCh(ab) { var o = [], k; for (k = 0; k < ab.numberOfChannels; k++) o.push(new Float32Array(ab.getChannelData(k))); if (o.length > 2) o = [o[0], o[1]]; if (o.length === 2 && D && D.sameChannels(o)) o = [o[0]]; return o; }
	function addTrackFrom(ch, name, at, top) {
		var t = A.track({ name: name, nch: ch.length, clips: [A.clip(at || 0, ch)] });
		if (top) S.tracks.unshift(t); else S.tracks.push(t); return t;
	}
	function openFiles(files) {
		files = Array.prototype.slice.call(files || []).filter(function (f) { return f && f.size; }); if (!files.length) return;
		stopAll(); var b = busy(files.length === 1 ? T("Opening {name}", { name: files[0].name }) : T("Opening {n} files", { n: files.length })), i = 0, added = 0, firstEmpty = !S.tracks.length;
		function next() {
			if (i >= files.length || b.signal.aborted) {
				b.done(); if (added) { if (firstEmpty) { S.name = files[0].name.replace(/\.[^.]+$/, ""); zoomFit(); } commit(added > 1 ? T("Open {n} files", { n: added }) : T("Open {name}", { name: files[0].name })); }
				return;
			}
			var f = files[i++]; b.set((i - 1) / files.length, T("Decoding {name}", { name: f.name }));
			if (/\.mesaudio$|\.json$/i.test(f.name)) { toast(T("Project files are not supported yet: the project is kept in this browser automatically")); return next(); }
			var viaConv = /\.(avi|mkv|wmv|asf|flv|mpg|mpeg|vob|ts|mts|m2ts|3gp|3g2|divx|xvid|rm|rmvb|ogv|dv)$/i.test(f.name);
			return (viaConv ? Promise.reject(new Error("container")) : f.arrayBuffer().then(decode).then(abToCh)).catch(function (e0) {
				/* the browser cannot read it (AVI, MKV, WMV, FLV ... or an odd codec): the Video Converter's engine pulls the sound out */
				var E = window.MESConvEngine; if (!E || !E.extractAudio) throw e0;
				b.set((i - 1) / files.length, T("Reading the sound of {name}", { name: f.name }));
				return E.extractAudio(f, { onStatus: function (m, x) { b.set(x || 0, m); }, onProgress: function (x) { b.set(x, T("Reading the sound of {name}", { name: f.name })); } }).then(function (r) {
					if (r.encoded) return decode(r.encoded).then(abToCh);
					var ch = r.channels.slice(0, 2); if (r.sampleRate !== S.sr && D) ch = ch.map(function (c) { return D.resample(c, r.sampleRate, S.sr); });
					if (ch.length === 2 && D && D.sameChannels(ch)) ch = [ch[0]];
					return ch;
				});
			}).then(function (ch) {
				if (!ch || !ch[0] || !ch[0].length) throw new Error(T("no sound found in it"));
				addTrackFrom(ch, f.name.replace(/\.[^.]+$/, ""), 0); added++;
			}).catch(function (e) { toast(T("Could not open {name}: {why}", { name: f.name, why: e && e.message ? T(e.message) : T("not an audio or video file") })); }).then(tick).then(next);
		}
		next();
	}

	/* ---------------- view ---------------- */
	var cv = $("au-cv"), over = $("au-over"), ruler = $("au-ruler"), lanes = $("au-lanes"), heads = $("au-heads"), scrollBox = $("au-scroll"), W = 800, dpr = 1;
	function laneW() { /* the ruler is always shown; the lanes are hidden (display:none) while the editor is empty */ return Math.max(100, lanes.clientWidth || ruler.clientWidth); }
	function xOf(n) { return (n - S.start) / S.spp; }
	function nOf(x) { return Math.round(S.start + x * S.spp); }
	function clampView() { var end = Math.max(projEnd(), S.sr * 10), maxStart = Math.max(0, end - laneW() * S.spp * 0.5); S.spp = Math.max(1 / 16, Math.min(S.spp, end / 50 + S.sr)); S.start = Math.max(0, Math.min(S.start, maxStart)); }
	function zoomAt(f, x) { var n = S.start + x * S.spp; S.spp = Math.max(1 / 16, Math.min(S.sr * 60, S.spp / f)); S.start = n - x * S.spp; clampView(); draw(); }
	function zoomFit() { var end = projEnd() || S.sr * 10; S.spp = Math.max(1 / 16, end / (laneW() - 20)); S.start = 0; clampView(); draw(); }
	function zoomSel() { if (!S.sel) return zoomFit(); var len = S.sel.b - S.sel.a; S.spp = Math.max(1 / 16, len / (laneW() * 0.9)); S.start = S.sel.a - len * 0.05; clampView(); draw(); }

	var peaksCache = new WeakMap();
	function peaksOf(c) { var key = c.ch[0], p = peaksCache.get(key); if (!p) { p = A.peakSet(c.ch); peaksCache.set(key, p); } return p; }
	var COLORS = ["#2dd4bf", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#4ade80", "#fb923c", "#38bdf8"];
	function trackColor(i) { return COLORS[i % COLORS.length]; }

	var raf = 0;
	function draw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawNow(); }); }
	function sizeCanvas(c, w, h) { if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); } c.style.width = w + "px"; c.style.height = h + "px"; }
	function drawNow() {
		dpr = window.devicePixelRatio || 1; W = laneW(); clampView();
		var nT = S.tracks.length, h = Math.max(1, nT) * S.laneH;
		sizeCanvas(cv, W, h); sizeCanvas(over, W, h); sizeCanvas(ruler, W, 28);
		lanes.style.height = h + "px";
		var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, h);
		S.tracks.forEach(function (t, ti) { drawLane(g, t, ti); });
		/* selection */
		if (S.sel) {
			var x0 = Math.max(-2, xOf(S.sel.a)), x1 = Math.min(W + 2, xOf(S.sel.b));
			S.tracks.forEach(function (t, ti) { if (S.selT.indexOf(t.id) < 0) return; g.fillStyle = "rgba(56,189,248,0.2)"; g.fillRect(x0, ti * S.laneH, Math.max(1, x1 - x0), S.laneH); g.fillStyle = "#7dd3fc"; g.fillRect(x0, ti * S.laneH, 1, S.laneH); g.fillRect(x1 - 1, ti * S.laneH, 1, S.laneH); });
		}
		/* markers */
		S.markers.forEach(function (m) { var x = xOf(m.t); if (x < -1 || x > W + 1) return; g.strokeStyle = "rgba(244,114,182,0.7)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); g.setLineDash([]); });
		drawRuler(); drawOver(); syncUi();
	}
	function drawLane(g, t0, ti) {
		/* while comparing: draw the version that plays in colour, the other one in grey behind it */
		var inCmp = cmp && cmp.ids.indexOf(t0.id) >= 0, t = inCmp ? (versionOf(vt(), t0.id) || t0) : t0, ghost = inCmp ? versionOf(cmp.show === "before" ? cmp.after : cmp.show === "noise" ? cmp.after : cmp.before, t0.id) : null;
		var y0 = ti * S.laneH, lh = S.laneH, col = inCmp && cmp.show === "noise" ? "#f87171" : trackColor(ti), sel = S.selT.indexOf(t.id) >= 0;
		g.fillStyle = sel ? "#161d24" : "#14161b"; g.fillRect(0, y0, W, lh);
		g.fillStyle = "#333948"; g.fillRect(0, y0 + lh - 1, W, 1);
		t.clips.forEach(function (c) {
			var cs = c.start, ce = cs + A.clipLen(c), x0 = xOf(cs), x1 = xOf(ce); if (x1 < 0 || x0 > W) return;
			var cx0 = Math.max(0, x0), cx1 = Math.min(W, x1);
			g.fillStyle = t.mute ? "#1d2027" : "#1b2b31"; g.fillRect(cx0, y0 + 2, Math.max(1, cx1 - cx0), lh - 4);
			g.fillStyle = t.mute ? "#2b2f38" : "#264a52"; g.fillRect(cx0, y0 + 2, Math.max(1, cx1 - cx0), 13);
			g.strokeStyle = "#2d5560"; g.strokeRect(x0 + 0.5, y0 + 2.5, Math.max(1, x1 - x0 - 1), lh - 5);
			if (x1 - x0 > 50) { g.fillStyle = "#cfe9ee"; g.font = "11px system-ui,sans-serif"; g.fillText(fmt(A.clipLen(c), 1), Math.max(cx0, x0) + 5, y0 + 12); }
			var top = y0 + 16, avail = lh - 20, nch = c.ch.length, chH = avail / nch;
			if (S.spec) { drawSpec(g, t, c, cx0, cx1, top, avail); return; }
			if (ghost) ghost.clips.forEach(function (gc) {
				var gx0 = Math.max(cx0, xOf(gc.start)), gx1 = Math.min(cx1, xOf(gc.start + A.clipLen(gc))); if (gx1 <= gx0) return;
				for (var kk = 0; kk < Math.min(nch, gc.ch.length); kk++) drawWave(g, gc, kk, gx0, gx1, top + kk * chH, chH, "rgba(148,160,180,0.45)");
			});
			for (var k = 0; k < nch; k++) drawWave(g, c, k, cx0, cx1, top + k * chH, chH, t.mute ? "#5b6472" : col);
		});
		if (inCmp) { g.font = "bold 11px system-ui,sans-serif"; var lab = cmp.show === "before" ? T("ORIGINAL (playing)") : cmp.show === "noise" ? T("NOISE ONLY (playing) · grey = cleaned") + (cmpMatch ? " · " + T("levels matched") : "") : isClean(cmp.fid) ? T("CLEANED (playing) · grey = original") : T("AFTER (playing) · grey = original"); var tw = g.measureText(lab).width; g.fillStyle = "rgba(11,13,17,0.75)"; g.fillRect(W - tw - 16, y0 + lh - 20, tw + 12, 16); g.fillStyle = cmp.show === "before" ? "#fbbf24" : cmp.show === "noise" ? "#f87171" : "#5eead4"; g.fillText(lab, W - tw - 10, y0 + lh - 8); }
	}
	function drawWave(g, c, k, cx0, cx1, top, hh, col) {
		var mid = top + hh / 2, amp = hh / 2 - 1, data = c.ch[k], len = data.length;
		g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(cx0, mid, cx1 - cx0, 1);
		g.fillStyle = col; g.strokeStyle = col;
		if (S.spp < 2) {
			g.beginPath(); var first = true;
			for (var x = Math.floor(cx0); x <= Math.ceil(cx1); x++) { var n = S.start + x * S.spp - c.start, i = Math.floor(n); if (i < 0 || i >= len) continue; var v = data[i]; if (first) { g.moveTo(x, mid - v * amp); first = false; } else g.lineTo(x, mid - v * amp); }
			g.stroke();
			if (S.spp < 0.25) for (x = Math.floor(cx0); x <= cx1; x++) { var n2 = S.start + x * S.spp - c.start; if (Math.abs(n2 - Math.round(n2)) < S.spp / 2) { var j = Math.round(n2); if (j >= 0 && j < len) g.fillRect(x - 1.5, mid - data[j] * amp - 1.5, 3, 3); } }
			return;
		}
		var P = peaksOf(c)[k], lvl = P[0];
		for (var L = 2; L >= 0; L--) if (P[L].block <= S.spp) { lvl = P[L]; break; }
		for (var xx = Math.floor(cx0); xx < cx1; xx++) {
			var a = S.start + xx * S.spp - c.start, b = a + S.spp; if (b <= 0 || a >= len) continue;
			var lo = 0, hi = 0, init = false;
			if (S.spp < 64) { var ia = Math.max(0, Math.floor(a)), ib = Math.min(len, Math.ceil(b)); for (var q = ia; q < ib; q++) { var vv = data[q]; if (!init) { lo = hi = vv; init = true; } else { if (vv < lo) lo = vv; if (vv > hi) hi = vv; } } }
			else { var pa = Math.max(0, Math.floor(a / lvl.block)), pb = Math.min(lvl.min.length, Math.ceil(b / lvl.block)); for (var p = pa; p < pb; p++) { if (!init) { lo = lvl.min[p]; hi = lvl.max[p]; init = true; } else { if (lvl.min[p] < lo) lo = lvl.min[p]; if (lvl.max[p] > hi) hi = lvl.max[p]; } } }
			if (!init) continue;
			var y1 = mid - Math.min(1, hi) * amp, y2 = mid - Math.max(-1, lo) * amp; g.fillRect(xx, y1, 1, Math.max(1, y2 - y1));
		}
	}
	/* spectrogram: 1024-point FFT per pixel column, log frequency 40 Hz .. Nyquist, -100 .. -20 dB */
	var specCache = new Map(), specPlan = null, specWin = null;
	function cmap(v) { v = Math.max(0, Math.min(1, v)); var r = Math.round(255 * Math.min(1, Math.max(0, 1.6 * v - 0.25))), gg = Math.round(255 * Math.max(0, Math.min(1, 2.2 * (v - 0.45)))), b = Math.round(255 * Math.max(0, Math.min(1, v < 0.5 ? 0.25 + v * 1.2 : 1.6 - 1.6 * v))); return [r, gg, b]; }
	function drawSpec(g, t, c, cx0, cx1, top, hh) {
		if (!D) return; var N = 1024; if (!specPlan) { specPlan = D.fftPlan(N); specWin = new Float64Array(N); for (var i = 0; i < N; i++) specWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); }
		var w = Math.max(1, Math.round(cx1 - cx0)), h = Math.max(1, Math.round(hh)), key = c.ch[0].length + "|" + S.start + "|" + S.spp + "|" + Math.round(cx0) + "|" + w + "|" + h, cache = specCache.get(c.ch[0]);
		if (!cache || cache.key !== key) {
			var img = g.createImageData(w * 1, h), re = new Float64Array(N), im = new Float64Array(N), data = c.ch[0], d2 = c.ch[1], len = data.length, nyq = S.sr / 2, lmin = Math.log(40), lmax = Math.log(nyq), rows = new Int32Array(h);
			for (var y = 0; y < h; y++) { var fr = Math.exp(lmax - (y + 0.5) / h * (lmax - lmin)); rows[y] = Math.min(N / 2, Math.max(1, Math.round(fr / nyq * N / 2))); }
			for (var x = 0; x < w; x++) {
				var center = Math.round(S.start + (Math.round(cx0) + x + 0.5) * S.spp - c.start);
				for (var k = 0; k < N; k++) { var n = center - N / 2 + k, v = n >= 0 && n < len ? (d2 ? 0.5 * (data[n] + d2[n]) : data[n]) : 0; re[k] = v * specWin[k]; im[k] = 0; }
				specPlan.fwd(re, im);
				for (y = 0; y < h; y++) { var bin = rows[y], m = re[bin] * re[bin] + im[bin] * im[bin], db = 10 * Math.log10(m / (N * N / 16) + 1e-12), rgb = cmap((db + 100) / 80), o = (y * w + x) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255; }
			}
			cache = { key: key, img: img }; specCache.set(c.ch[0], cache);
		}
		g.putImageData(cache.img, Math.round(cx0) * dpr, Math.round(top) * dpr);
		if (dpr !== 1) { /* putImageData ignores the transform: redraw scaled */ var tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h; tmp.getContext("2d").putImageData(cache.img, 0, 0); g.clearRect(Math.round(cx0), Math.round(top), w, h); g.drawImage(tmp, Math.round(cx0), Math.round(top), w, h); }
	}
	function niceStep(spp) { var secPerPx = spp / S.sr, target = secPerPx * 90, steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]; for (var i = 0; i < steps.length; i++) if (steps[i] >= target) return steps[i]; return 7200; }
	function drawRuler() {
		var g = ruler.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#1c1f26"; g.fillRect(0, 0, W, 28);
		var st = niceStep(S.spp), t0 = Math.floor(sec(S.start) / st) * st, t1 = sec(S.start + W * S.spp), dg = st < 0.01 ? 3 : st < 0.1 ? 2 : st < 1 ? 1 : 0;
		g.fillStyle = "#a3aab8"; g.font = "11px system-ui,sans-serif"; g.strokeStyle = "#4b5263";
		for (var t = t0; t <= t1 + st; t += st) { var x = xOf(t * S.sr); if (x < -60) continue; g.beginPath(); g.moveTo(x + 0.5, 16); g.lineTo(x + 0.5, 28); g.stroke(); g.fillText(A.fmtTime(t, dg), x + 3, 13); for (var s = 1; s < 5; s++) { var xs = xOf((t + st * s / 5) * S.sr); g.beginPath(); g.moveTo(xs + 0.5, 23); g.lineTo(xs + 0.5, 28); g.stroke(); } }
		if (S.sel) { g.fillStyle = "rgba(56,189,248,0.35)"; g.fillRect(xOf(S.sel.a), 22, xOf(S.sel.b) - xOf(S.sel.a), 6); }
		S.markers.forEach(function (m) { var x = xOf(m.t); if (x < -80 || x > W) return; g.fillStyle = "#f472b6"; g.beginPath(); g.moveTo(x, 28); g.lineTo(x - 5, 18); g.lineTo(x + 5, 18); g.closePath(); g.fill(); g.font = "bold 10px system-ui,sans-serif"; g.fillText(m.name.slice(0, 24), x + 6, 25); });
	}
	function drawOver() {
		var g = over.getContext("2d"), h = over.height / dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, h);
		var p = playing ? playPos() : S.cursor, x = xOf(p);
		if (x >= -1 && x <= W + 1) { g.fillStyle = playing ? "#fbbf24" : "#e7e9ee"; g.fillRect(Math.round(x), 0, 1.5, h); }
		$("au-time").textContent = fmt(p);
	}

	/* ---------------- track headers ---------------- */
	function renderHeads() {
		heads.innerHTML = "";
		S.tracks.forEach(function (t, ti) {
			var h = el("div", { class: "au-head" + (S.selT.indexOf(t.id) >= 0 ? " is-sel" : ""), "data-id": t.id }); h.style.height = S.laneH + "px"; h.style.borderLeft = "3px solid " + trackColor(ti);
			h.innerHTML = '<input class="au-tname" type="text" aria-label="' + esc(T("Track name")) + '" spellcheck="false"><div class="au-head-r"><button type="button" class="au-ib au-ms" aria-pressed="' + t.mute + '" title="' + esc(T("Mute")) + '">M</button><button type="button" class="au-ib au-ms au-solo" aria-pressed="' + t.solo + '" title="' + esc(T("Solo")) + '">S</button><span style="flex:1"></span><button type="button" class="au-ib au-ms au-del" title="' + esc(T("Delete track")) + '" aria-label="' + esc(T("Delete track")) + '">🗑</button></div>' +
				'<label title="' + esc(T("Track volume")) + '">' + T("Vol") + '<input type="range" min="-30" max="12" step="0.5" aria-label="' + esc(T("Track volume")) + '"><span class="au-gv"></span></label><label class="au-pan" title="' + esc(T("Pan")) + '">' + T("Pan") + '<input type="range" min="-1" max="1" step="0.05" aria-label="' + esc(T("Pan")) + '"></label>';
			var nm = h.querySelector(".au-tname"); nm.value = t.name;
			nm.onchange = function () { var o = Object.assign({}, trackById(t.id), { name: nm.value || T("Track") }); setTrack(o); commit(T("Rename track")); };
			var bs = h.querySelectorAll("button");
			bs[0].onclick = function () { var o = Object.assign({}, trackById(t.id)); o.mute = !o.mute; setTrack(o); commit(o.mute ? T("Mute") : T("Unmute")); liveMix(); };
			bs[1].onclick = function () { var o = Object.assign({}, trackById(t.id)); o.solo = !o.solo; setTrack(o); commit(o.solo ? T("Solo") : T("Unsolo")); liveMix(); };
			bs[2].onclick = function () { deleteTrack(t.id); };
			var rs = h.querySelectorAll("input[type=range]"), gv = h.querySelector(".au-gv");
			rs[0].value = t.gain; gv.textContent = (t.gain > 0 ? "+" : "") + t.gain + " dB"; rs[1].value = t.pan;
			rs[0].oninput = function () { var o = Object.assign({}, trackById(t.id)); o.gain = +rs[0].value; setTrack(o); gv.textContent = (o.gain > 0 ? "+" : "") + o.gain + " dB"; liveMix(); };
			rs[0].onchange = function () { commit(T("Track volume")); };
			rs[1].oninput = function () { var o = Object.assign({}, trackById(t.id)); o.pan = +rs[1].value; setTrack(o); liveMix(); };
			rs[1].onchange = function () { commit(T("Pan")); };
			var hg = el("div", { class: "au-hgrip", role: "separator", "aria-orientation": "horizontal", tabindex: "0", title: T("Drag to make the tracks taller or shorter (double-click: back to normal)"), "aria-label": T("Track height: drag, or use the up and down arrow keys") }, "<span></span>"); h.appendChild(hg); gripLane(hg);
			h.addEventListener("pointerdown", function (e) { if (e.target.closest("input,button,.au-hgrip")) return; selectTracks(e.shiftKey || e.metaKey || e.ctrlKey ? toggle(S.selT, t.id) : [t.id]); });
			heads.appendChild(h);
		});
	}
	/* ---- resizing: track height (grip under each track header) and the whole track area (grip under the tracks) ---- */
	var LANE_MIN = 56, LANE_MAX = 420, LANE_DEF = window.innerWidth < 600 ? 92 : 112;
	function setLaneH(v, save) { S.laneH = Math.round(Math.max(LANE_MIN, Math.min(LANE_MAX, v))); if (save) store("laneH", S.laneH); Array.prototype.forEach.call(heads.children, function (h) { h.style.height = S.laneH + "px"; }); draw(); }
	function dragGrip(g, get, set, done, reset) {
		g.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); try { g.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ } var y0 = e.clientY, v0 = get(); g.classList.add("is-drag");
			function mv(ev) { set(v0 + ev.clientY - y0); } function up() { g.classList.remove("is-drag"); g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); done(); }
			g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up); });
		g.addEventListener("dblclick", function (e) { e.stopPropagation(); reset(); });
		g.addEventListener("keydown", function (e) { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); set(get() + (e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 40 : 10)); done(); } });
	}
	function gripLane(g) { dragGrip(g, function () { return S.laneH; }, function (v) { setLaneH(v); }, function () { store("laneH", S.laneH); }, function () { setLaneH(LANE_DEF, true); }); }
	var areaH = store("areaH") || 0;
	function setAreaH(v, save) { var sb = scrollBox; if (v) { areaH = Math.round(Math.max(120, Math.min(Math.max(240, window.innerHeight - 120), v))); sb.style.maxHeight = areaH + "px"; sb.style.height = areaH + "px"; } else { areaH = 0; sb.style.maxHeight = ""; sb.style.height = ""; } if (save) store("areaH", areaH); draw(); }
	function toggle(arr, id) { var a = arr.slice(), i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); return a; }
	function selectTracks(ids) { S.selT = ids; if (!S.sel && ids.length) { /* selecting a whole track */ } afterSel(); }
	function deleteTrack(id) { stopAll(); var t = trackById(id); S.tracks = S.tracks.filter(function (x) { return x.id !== id; }); S.selT = S.selT.filter(function (x) { return x !== id; }); commit(T("Delete track {name}", { name: t ? t.name : "" })); }

	/* ---------------- UI sync ---------------- */
	function afterChange() { renderHeads(); updateEmpty(); syncUi(); draw(); simpleSync(); }
	function afterSel() { renderHeads(); draw(); simpleSync(); }
	function updateEmpty() { $("au-empty").hidden = S.tracks.length > 0; }
	function syncUi() {
		$("au-undo").disabled = !H.canUndo(); $("au-redo").disabled = !H.canRedo();
		var end = projEnd(); $("au-st-len").textContent = S.tracks.length ? T(S.tracks.length > 1 ? "{n} tracks" : "{n} track", { n: S.tracks.length }) + " · " + fmt(end, 1) : T("No audio");
		$("au-st-rate").textContent = S.sr + " Hz";
		$("au-st-sel").textContent = S.sel ? T(S.selT.length === 1 ? "Selection {len} on {n} track" : "Selection {len} on {n} tracks", { len: fmt(S.sel.b - S.sel.a), n: S.selT.length }) : "";
		if (document.activeElement !== $("au-sa")) $("au-sa").value = S.sel ? fmt(S.sel.a) : "";
		if (document.activeElement !== $("au-sb")) $("au-sb").value = S.sel ? fmt(S.sel.b) : "";
		$("au-slen").textContent = S.sel ? "(" + fmt(S.sel.b - S.sel.a, 2) + ")" : "";
		var tot = Math.max(end, S.sr * 10), vis = W * S.spp, hs = $("au-hs"); hs.max = 1000; hs.value = tot > vis ? Math.round(S.start / Math.max(1, tot - vis * 0.5) * 1000) : 0; hs.disabled = tot <= vis;
		$("au-vrange").textContent = fmt(S.start, 1) + " – " + fmt(S.start + vis, 1);
		$("au-zoomlab").textContent = S.spp < 1 ? Math.round(1 / S.spp) + " px/sample" : (S.sr / S.spp).toFixed(S.sr / S.spp < 10 ? 1 : 0) + " px/s";
		$("au-spec").setAttribute("aria-pressed", S.spec); $("au-loop").setAttribute("aria-pressed", loop);
	}

	/* ---------------- pointer: select / move clips / seek ---------------- */
	var drag = null;
	function laneAt(y) { var i = Math.floor(y / S.laneH); return i >= 0 && i < S.tracks.length ? i : -1; }
	function clipAt(t, n) { for (var i = t.clips.length - 1; i >= 0; i--) { var c = t.clips[i]; if (n >= c.start && n < c.start + A.clipLen(c)) return c; } return null; }
	var pointers = new Map(), pinch = null;
	cv.addEventListener("pointerdown", function (e) {
		if (e.button === 2) return; cv.focus({ preventScroll: true }); actx();
		pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pointers.size === 2) { var ps = Array.from(pointers.values()); pinch = { d: Math.abs(ps[0].x - ps[1].x) || 1, spp: S.spp, x: (ps[0].x + ps[1].x) / 2, start: S.start }; drag = null; return; }
		var ti = laneAt(e.offsetY); if (ti < 0) { setCursor(nOf(e.offsetX)); S.sel = null; afterSel(); return; }
		var t = S.tracks[ti], n = nOf(e.offsetX), yIn = e.offsetY - ti * S.laneH, c = clipAt(t, n);
		cv.setPointerCapture(e.pointerId);
		if (c && yIn < 16) { drag = { kind: "move", t: t, c: c, n0: n, s0: c.start, ti: ti, moved: false }; return; }
		if (e.shiftKey && S.sel) { var a0 = Math.abs(n - S.sel.a) < Math.abs(n - S.sel.b) ? S.sel.b : S.sel.a; drag = { kind: "sel", anchor: a0, ti0: ti, ids: S.selT.length ? S.selT : [t.id] }; moveSel(n, ti); return; }
		drag = { kind: "sel", anchor: n, ti0: ti, x0: e.offsetX, ids: (e.ctrlKey || e.metaKey) ? toggle(S.selT, t.id) : [t.id], moved: false };
	});
	function moveSel(n, ti) {
		var a = Math.max(0, Math.min(drag.anchor, n)), b = Math.max(0, Math.max(drag.anchor, n)), lo = Math.min(drag.ti0, ti), hi = Math.max(drag.ti0, ti), ids = [];
		for (var i = Math.max(0, lo); i <= Math.min(S.tracks.length - 1, hi); i++) ids.push(S.tracks[i].id);
		if (drag.ids && drag.ids.length > 1 && lo === hi) ids = drag.ids;
		S.selT = ids; S.sel = b - a > 0 ? { a: a, b: b } : null; draw(); renderHeadsLight();
	}
	function renderHeadsLight() { Array.prototype.forEach.call(heads.children, function (h) { h.classList.toggle("is-sel", S.selT.indexOf(h.getAttribute("data-id")) >= 0); }); }
	cv.addEventListener("pointermove", function (e) {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pinch && pointers.size === 2) { var ps = Array.from(pointers.values()), d = Math.abs(ps[0].x - ps[1].x) || 1, mx = (ps[0].x + ps[1].x) / 2; S.spp = Math.max(1 / 16, pinch.spp * pinch.d / d); S.start = pinch.start + pinch.x * pinch.spp - mx * S.spp; clampView(); draw(); return; }
		if (!drag) { var ti0 = laneAt(e.offsetY); cv.style.cursor = ti0 >= 0 && clipAt(S.tracks[ti0], nOf(e.offsetX)) && e.offsetY - ti0 * S.laneH < 16 ? "grab" : "text"; return; }
		var n = nOf(e.offsetX), ti = Math.max(0, Math.min(S.tracks.length - 1, laneAt(Math.max(0, e.offsetY))));
		if (drag.kind === "move") {
			var ns = Math.max(0, drag.s0 + n - drag.n0); if (Math.abs(n - drag.n0) > 2 * S.spp) drag.moved = true;
			/* snap to other clips' edges / the cursor within 8 px */
			var best = 8 * S.spp, len = A.clipLen(drag.c);
			S.tracks.forEach(function (tt) { tt.clips.forEach(function (o) { if (o === drag.c) return; [o.start, o.start + A.clipLen(o)].forEach(function (edge) { [edge - ns, edge - (ns + len)].forEach(function (dd, i2) { if (Math.abs(dd) < best) { best = Math.abs(dd); drag.snap = i2 === 0 ? edge : edge - len; } }); }); }); });
			var start = drag.snap != null && Math.abs(drag.snap - ns) <= 8 * S.spp ? drag.snap : ns; drag.snap = null;
			var tsrc = trackById(drag.t.id), moved = { id: drag.c.id, start: start, ch: drag.c.ch };
			var others = tsrc.clips.filter(function (o) { return o.id !== drag.c.id; }); others.push(moved); setTrack(A.withClips(tsrc, others)); drag.c = moved; drag.toTi = ti; draw(); return;
		}
		if (!drag.moved && Math.abs(e.offsetX - drag.x0) < 3) return;
		drag.moved = true; moveSel(n, ti); autoEdgeScroll(e.offsetX);
	});
	function autoEdgeScroll(x) { if (x > W - 20) { S.start += S.spp * 12; draw(); } else if (x < 20 && S.start > 0) { S.start -= S.spp * 12; draw(); } }
	function endPointer(e) {
		pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
		if (!drag) return; var d = drag; drag = null;
		if (d.kind === "move") {
			if (d.toTi != null && d.toTi !== d.ti) { var src = trackById(d.t.id), dst = S.tracks[d.toTi]; setTrack(A.withClips(src, src.clips.filter(function (o) { return o.id !== d.c.id; }))); dst = trackById(dst.id); setTrack(A.withClips(dst, dst.clips.concat([{ id: d.c.id, start: d.c.start, ch: A.conform(d.c.ch, dst.nch) }]))); }
			if (d.moved || d.toTi !== d.ti) commit("Move clip"); else { S.sel = { a: d.c.start, b: d.c.start + A.clipLen(d.c) }; S.selT = [d.t.id]; afterSel(); }
			return;
		}
		if (!d.moved) { setCursor(d.anchor); S.sel = null; S.selT = d.ids; afterSel(); if (playing) playFrom(d.anchor); }
		else afterSel();
	}
	cv.addEventListener("pointerup", endPointer); cv.addEventListener("pointercancel", endPointer);
	cv.addEventListener("dblclick", function (e) { var ti = laneAt(e.offsetY); if (ti < 0) return; var t = S.tracks[ti], c = clipAt(t, nOf(e.offsetX)); if (c) { S.sel = { a: c.start, b: c.start + A.clipLen(c) }; S.selT = [t.id]; afterSel(); } });
	function onWheel(e) {
		if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0025), e.offsetX); return; }
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); S.start += (e.shiftKey ? e.deltaY : e.deltaX) * S.spp; draw(); }
	}
	cv.addEventListener("wheel", onWheel, { passive: false }); ruler.addEventListener("wheel", onWheel, { passive: false });
	/* ruler: click = seek, drag = select on all tracks */
	var rdrag = null;
	ruler.addEventListener("pointerdown", function (e) { actx(); ruler.setPointerCapture(e.pointerId); rdrag = { a: nOf(e.offsetX), x0: e.offsetX, moved: false }; });
	ruler.addEventListener("pointermove", function (e) { if (!rdrag) return; if (Math.abs(e.offsetX - rdrag.x0) > 3) rdrag.moved = true; if (!rdrag.moved) return; var n = nOf(e.offsetX), a = Math.max(0, Math.min(rdrag.a, n)), b = Math.max(rdrag.a, n); S.sel = b > a ? { a: a, b: b } : null; S.selT = S.tracks.map(function (t) { return t.id; }); draw(); });
	ruler.addEventListener("pointerup", function (e) { if (!rdrag) return; var d = rdrag; rdrag = null; if (!d.moved) { var n = Math.max(0, nOf(e.offsetX)), mk = S.markers.filter(function (m) { return Math.abs(xOf(m.t) - e.offsetX) < 6; })[0]; setCursor(mk ? mk.t : n); if (playing) playFrom(S.cursor); } afterSel(); });
	$("au-hs").addEventListener("input", function () { var tot = Math.max(projEnd(), S.sr * 10), vis = W * S.spp; S.start = (+this.value / 1000) * Math.max(0, tot - vis * 0.5); draw(); });
	function setCursor(n) { S.cursor = Math.max(0, Math.round(n)); draw(); }
	function parseSelInputs() {
		var a = A.parseTime($("au-sa").value), b = A.parseTime($("au-sb").value);
		if (isFinite(a) && isFinite(b) && b > a) { S.sel = { a: Math.round(a * S.sr), b: Math.round(b * S.sr) }; if (!S.selT.length) S.selT = S.tracks.map(function (t) { return t.id; }); draw(); }
		else { toast(T("Type times like 1:02.5 or 75")); syncUi(); }
	}
	$("au-sa").addEventListener("change", parseSelInputs); $("au-sb").addEventListener("change", parseSelInputs);

	/* ---------------- playback ---------------- */
	var playing = false, loop = !!store("loop"), sources = [], tnodes = {}, playT0 = 0, playN0 = 0, playEnd = 0, playRaf = 0, abufCache = new WeakMap();
	function abufOf(c) { var b = abufCache.get(c.ch[0]); if (!b) { b = ctx.createBuffer(c.ch.length, A.clipLen(c), S.sr); c.ch.forEach(function (d, k) { b.copyToChannel ? b.copyToChannel(d, k) : b.getChannelData(k).set(d); }); abufCache.set(c.ch[0], b); } return b; }
	function playPos() { return playing ? playN0 + (ctx.currentTime - playT0) * S.sr : S.cursor; }
	function liveMix() {
		if (!playing) return; var anySolo = S.tracks.some(function (t) { return t.solo; });
		S.tracks.forEach(function (t) { var n = tnodes[t.id]; if (!n) return; var on = !t.mute && (!anySolo || t.solo); n.g.gain.setTargetAtTime(on ? A.dbToGain(t.gain) : 0, ctx.currentTime, 0.015); if (n.p) n.p.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.015); });
	}
	function stopSources() { sources.forEach(function (s) { try { s.stop(); } catch (e) {} }); sources = []; Object.keys(tnodes).forEach(function (k) { try { tnodes[k].g.disconnect(); } catch (e) {} }); tnodes = {}; }
	function playFrom(n, end) {
		actx(); stopPreview(); stopSources(); if (!S.tracks.length) return;
		var from = Math.max(0, Math.round(n)), stop = end != null ? end : projEnd(); if (from >= stop) from = 0;
		var t0 = ctx.currentTime + 0.04, anySolo = S.tracks.some(function (t) { return t.solo; });
		vt().forEach(function (t) {
			var g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, on = !t.mute && (!anySolo || t.solo);
			g.gain.value = on ? A.dbToGain(t.gain) : 0; if (p) { p.pan.value = t.pan; g.connect(p); p.connect(master); } else g.connect(master);
			tnodes[t.id] = { g: g, p: p };
			t.clips.forEach(function (c) {
				var cs = c.start, ce = cs + A.clipLen(c); if (ce <= from || cs >= stop) return;
				var s = ctx.createBufferSource(); s.buffer = abufOf(c); s.connect(g);
				var when = t0 + Math.max(0, cs - from) / S.sr, off = Math.max(0, from - cs) / S.sr, dur = (Math.min(ce, stop) - Math.max(cs, from)) / S.sr;
				s.start(when, off, dur); sources.push(s);
			});
		});
		playing = true; playT0 = t0; playN0 = from; playEnd = stop; $("au-play").textContent = "⏸"; $("au-play").setAttribute("aria-label", T("Pause"));
		cancelAnimationFrame(playRaf); playRaf = requestAnimationFrame(playLoop);
	}
	function playLoop() {
		if (!playing) return; var p = playPos();
		if (p >= playEnd) { if (loop && S.sel) { playFrom(S.sel.a, S.sel.b); return; } stopPlay(true); return; }
		var x = xOf(p); if (x > W - 10 || x < 0) { S.start = p - W * S.spp * 0.05; draw(); }
		drawOver(); meter(); playRaf = requestAnimationFrame(playLoop);
	}
	function stopPlay(keepCursor) { if (!playing) return; var p = playPos(); playing = false; stopSources(); cancelAnimationFrame(playRaf); $("au-play").textContent = "▶"; $("au-play").setAttribute("aria-label", T("Play")); setTimeout(simpleSync, 0); if (keepCursor === "here") S.cursor = Math.round(p); drawOver(); meterClear(); }
	function togglePlay() {
		if (preview && preview.playing) { stopPreview(); return; }
		if (playing) { stopPlay("here"); return; }
		if (S.sel && S.sel.b - S.sel.a > 0 && (S.cursor <= S.sel.a || S.cursor >= S.sel.b)) playFrom(S.sel.a, S.sel.b); else playFrom(S.cursor, S.sel && S.cursor < S.sel.b ? S.sel.b : null);
	}
	function stopAll() { stopPlay(); stopPreview(); }
	var mBuf = null;
	function meter() {
		var c = $("au-meter"), g = c.getContext("2d"); if (!analyser) return; mBuf = mBuf || new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(mBuf);
		var pk = 0; for (var i = 0; i < mBuf.length; i++) { var v = Math.abs(mBuf[i]); if (v > pk) pk = v; }
		var db = pk > 0 ? 20 * Math.log10(pk) : -90, f = Math.max(0, Math.min(1, (db + 60) / 60));
		meterClear(); g.fillStyle = db > -1 ? "#ef4444" : db > -9 ? "#fbbf24" : "#4ade80"; g.fillRect(0, 2, f * c.width, c.height - 4);
	}
	/* empty meter = a faint dB scale (-60 .. 0, coloured zones), so it reads as a meter while nothing plays */
	function meterClear() {
		var c = $("au-meter"), g = c.getContext("2d"), w = c.width, h = c.height;
		g.fillStyle = "#0b0d11"; g.fillRect(0, 0, w, h);
		g.fillStyle = "rgba(74,222,128,.16)"; g.fillRect(0, 2, w * 51 / 60, h - 4);
		g.fillStyle = "rgba(251,191,36,.2)"; g.fillRect(w * 51 / 60, 2, w * 8 / 60, h - 4);
		g.fillStyle = "rgba(239,68,68,.24)"; g.fillRect(w * 59 / 60, 2, w / 60 + 1, h - 4);
		g.fillStyle = "rgba(231,233,238,.35)"; for (var d = -48; d < 0; d += 12) g.fillRect(Math.round(w * (d + 60) / 60), h - 5, 1, 3);
	}

	/* ---------------- edit commands ---------------- */
	function targets() { var ids = S.selT.length ? S.selT : S.tracks.map(function (t) { return t.id; }); return S.tracks.filter(function (t) { return ids.indexOf(t.id) >= 0; }); }
	function needSel() { if (!S.sel) { toast(T("Select some audio first: drag across a track")); return false; } return true; }
	function doCopy() { if (!needSel()) return false; clipboard = targets().map(function (t) { return A.copyRange(t, S.sel.a, S.sel.b); }); toast(T("Copied {len}", { len: fmt(S.sel.b - S.sel.a, 2) })); return true; }
	function doDelete(label) { if (!needSel()) return; stopAll(); var a = S.sel.a, b = S.sel.b; targets().forEach(function (t) { setTrack(A.deleteRange(t, a, b, true)); }); S.sel = null; S.cursor = a; commit(label || T("Delete")); }
	function doCut() { if (doCopy()) doDelete(T("Cut")); }
	function doPaste() {
		if (!clipboard) { toast(T("Nothing copied yet")); return; } stopAll();
		var at = S.sel ? S.sel.a : S.cursor, tt = targets();
		if (S.sel) { var a = S.sel.a, b = S.sel.b; tt.forEach(function (t) { setTrack(A.deleteRange(t, a, b, true)); }); tt = targets(); }
		if (!tt.length) { clipboard.forEach(function (blk, i) { var t = A.track({ name: T("Pasted {n}", { n: i + 1 }), nch: blk.nch }); S.tracks.push(A.insert(t, at, blk)); }); }
		else tt.forEach(function (t, i) { setTrack(A.insert(t, at, clipboard[Math.min(i, clipboard.length - 1)])); });
		var len = clipboard[0].len; S.sel = { a: at, b: at + len }; S.selT = (tt.length ? tt : S.tracks.slice(-clipboard.length)).map(function (t) { return t.id; }); commit(T("Paste"));
	}
	function doSplit() { stopAll(); var at = S.sel ? [S.sel.a, S.sel.b] : [S.cursor], n = 0; targets().forEach(function (t) { var o = t; at.forEach(function (p) { o = A.split(o, p); }); if (o.clips.length !== t.clips.length) n++; setTrack(o); }); if (n) commit(T("Split")); else toast(T("Put the cursor inside a clip to split it")); }
	function doTrim() { if (!needSel()) return; stopAll(); var a = S.sel.a, b = S.sel.b; targets().forEach(function (t) { setTrack(A.trim(t, a, b)); }); commit(T("Trim")); }
	function doSilence() { if (!needSel()) return; stopAll(); var a = S.sel.a, b = S.sel.b; targets().forEach(function (t) { setTrack(A.mapRange(t, a, b, A.silence)); }); commit(T("Silence")); }
	function doInsertSilence() {
		var s = prompt(T("Insert how much silence at the cursor? (seconds, or like 1:30)"), "2"); if (s == null) return; var d = A.parseTime(s); if (!(d > 0)) return toast(T("Type a duration like 2 or 0:05"));
		stopAll(); var n = Math.round(d * S.sr), at = S.sel ? S.sel.a : S.cursor; targets().forEach(function (t) { setTrack(A.insert(t, at, { len: n, nch: t.nch, clips: [{ start: 0, ch: A.zeros(t.nch, n) }] })); }); commit(T("Insert silence"));
	}
	function doDuplicate() { if (!needSel()) return; var a = S.sel.a; targets().forEach(function (t) { var blk = A.copyRange(t, S.sel.a, S.sel.b); var nt = A.track({ name: T("{name} (copy)", { name: t.name }), nch: t.nch }); S.tracks.push(A.insert(nt, a, blk)); }); commit(T("Duplicate to new track")); }
	function selectAll() { S.sel = { a: 0, b: projEnd() }; S.selT = S.tracks.map(function (t) { return t.id; }); if (S.sel.b <= 0) S.sel = null; afterSel(); }
	function addTrack() { S.tracks.push(A.track({ name: T("Track {n}", { n: S.tracks.length + 1 }), nch: 1 })); commit(T("Add track")); }
	function addMarker() { var t = playing ? Math.round(playPos()) : S.cursor; S.markers.push({ id: A.uid("m"), t: t, name: T("Marker {n}", { n: S.markers.length + 1 }) }); S.markers.sort(function (a, b) { return a.t - b.t; }); commit(T("Add marker")); toast(T("Marker at {t}", { t: fmt(t, 2) })); if (panel === "markers") openMarkers(); }
	function jumpMarker(dir) { var p = playing ? playPos() : S.cursor, list = S.markers.map(function (m) { return m.t; }).concat([0, projEnd()]).sort(function (a, b) { return a - b; }), t = dir > 0 ? list.filter(function (x) { return x > p + 1; })[0] : list.filter(function (x) { return x < p - S.sr * 0.05; }).pop(); if (t == null) return; setCursor(t); if (playing) playFrom(t); }

	/* ---------------- effects ---------------- */
	var FX_LS = store("fx") || {};
	var EQ_KEYS = Object.keys(A.EQ_PRESETS);
	var EFFECTS = [
		{ id: "noise", name: T("Noise removal (AI)"), icon: "✨", keys: "denoise background hiss fan hum deepfilternet rnnoise clean voice", desc: T("Remove fans, hiss, traffic, room noise"),
			params: [
				{ k: "model", type: "select", label: T("Method"), def: "deepfilter", help: T("<b>Which tool cleans the sound.</b><br><b>DeepFilterNet 3</b> is an AI trained on thousands of hours of speech: it keeps the voice and removes almost everything else (fans, air conditioning, traffic, hiss, keyboard, room noise). Best choice for talking, podcasts and videos.<br><b>RNNoise</b> is a smaller AI: faster, a little gentler.<br><b>Spectral gate</b> is the classic method: it learns what the noise sounds like from a few seconds with no voice, then turns that sound down. Use it for music or for one steady sound (hiss, a hum, a fridge)."), opts: [["deepfilter", T("DeepFilterNet 3 (AI, best for speech)")], ["rnnoise", T("RNNoise (AI, faster, gentler)")], ["spectral", T("Spectral gate (classic, uses a noise sample)")]] },
				{ k: "strength", type: "range", label: T("Strength"), def: 100, min: 0, max: 100, step: 1, unit: "%", cheap: true, help: T("<b>How far the noise is pushed down.</b> 100% removes as much as the AI can (often 40 dB or more: the noise is gone). 50% turns it down by about 20 dB (a quarter of its loudness is a lot of difference, but some room sound stays, which can sound more natural). 0% changes nothing. Move it while the preview plays to hear the difference.") },
				{ k: "hum", type: "select", label: T("Mains hum (after the noise removal)"), def: "0", cheap: true, help: T("<b>Mains hum</b> is a low, steady buzz at the frequency of the electricity in the walls: <b>60 Hz</b> in North America and parts of South America, <b>50 Hz</b> in Europe, Asia, Africa and Australia. It comes from power cables near the microphone, cheap power adapters, lights, or a <b>ground loop</b> (two devices plugged into different sockets). It sounds like a deep \"hmmm\" that is there even when nobody talks.<br><b>Remove (detect)</b> finds which one it is and notches exactly that frequency and its overtones, leaving the voice alone. Choose <b>Leave</b> if you hear no buzz."), opts: [["0", T("Leave")], ["auto", T("Remove (detect 50 / 60 Hz)")], ["50", T("Remove 50 Hz")], ["60", T("Remove 60 Hz")]] }
			],
			note: function (v) { return v.model === "spectral" ? (noiseProfile ? T("Noise sample: <b>{len}</b> learned.", { len: fmt(noiseProfile[0].length, 1) }) : T("Select a few seconds of <b>noise only</b> (no voice) and press Learn; otherwise the quietest moments are used.")) + ' <button type="button" class="au-btn au-btn--sm" data-act="learn">' + T("Learn noise from selection") + '</button>' : (v.model === "deepfilter" ? T("Runs on this device. First use downloads the 8.6 MB model (kept by the browser). Speech models can remove music too: preview first.") : T("Runs on this device (4.8 MB download the first time).")); },
			run: function (buf, v, ctl) { return denoiseRun(buf, v, ctl); } },
		{ id: "enhance", name: T("Enhance speech (one click)"), icon: "🎙️", keys: "podcast voice clean chain improve auto", desc: T("Noise removal + low cut + voice EQ + compressor + loudness"),
			params: [{ k: "denoise", type: "check", label: T("AI noise removal"), def: true }, { k: "lowcut", type: "check", label: T("Low cut (80 Hz)"), def: true }, { k: "eq", type: "check", label: T("Voice clarity EQ"), def: true }, { k: "comp", type: "check", label: T("Gentle compressor"), def: true }, { k: "lufs", type: "select", label: T("Loudness"), def: "-16", opts: [["-14", T("−14 LUFS (YouTube, Spotify)")], ["-16", T("−16 LUFS (podcasts)")], ["-19", T("−19 LUFS (quieter)")], ["none", T("Leave")]] }],
			run: function (buf, v, ctl) {
				var p = v.denoise ? denoiseRun(buf, { model: "deepfilter", strength: 90, hum: "auto" }, ctl) : Promise.resolve(buf);
				return p.then(function (x) {
					if (v.lowcut) x = A.eq(x, S.sr, A.EQ_PRESETS.lowcut.bands); if (v.eq) x = A.eq(x, S.sr, A.EQ_PRESETS.voice.bands.slice(1));
					if (v.comp) x = A.compress(x, S.sr, { threshold: -24, ratio: 3, knee: 8, attack: 8, release: 150, makeup: 0 });
					if (v.lufs !== "none") x = A.loudnessNormalize(x, S.sr, +v.lufs, -1).ch; return x;
				});
			}, whole: true },
		{ id: "loud", name: T("Normalize / loudness"), icon: "📏", keys: "lufs loudness normalize normalise volume youtube podcast peak true peak ebu r128", desc: T("Set LUFS loudness or peak level"),
			params: [{ k: "mode", type: "select", label: T("Mode"), def: "lufs", opts: [["lufs", T("Loudness (LUFS)")], ["peak", T("Peak")]] }, { k: "lufs", type: "select", label: T("Target"), def: "-16", show: { mode: "lufs" }, opts: [["-14", T("−14 LUFS (YouTube, Spotify)")], ["-16", T("−16 LUFS (podcasts, Apple)")], ["-19", T("−19 LUFS (mono podcast)")], ["-23", T("−23 LUFS (EBU R128 broadcast)")], ["-24", T("−24 LUFS (US TV, ATSC)")]] }, { k: "tp", type: "select", label: T("True-peak ceiling"), def: "-1", show: { mode: "lufs" }, opts: [["-1", T("−1 dBTP")], ["-2", T("−2 dBTP")], ["-0.1", T("−0.1 dBTP")]] }, { k: "peak", type: "range", label: T("Peak level"), def: -1, min: -12, max: 0, step: 0.1, unit: " dBFS", show: { mode: "peak" } }],
			analyse: true, whole: true,
			run: function (buf, v) { if (v.mode === "peak") return A.gain(buf, A.normalizePeakGain(buf, v.peak)); return A.loudnessNormalize(buf, S.sr, +v.lufs, +v.tp).ch; } },
		{ id: "gain", name: T("Amplify / gain"), icon: "🔊", keys: "volume louder quieter amplify gain", desc: T("Make it louder or quieter"), params: [{ k: "db", type: "range", label: T("Gain"), def: 3, min: -24, max: 24, step: 0.5, unit: " dB" }], run: function (buf, v) { return A.gain(buf, v.db); } },
		{ id: "fadein", name: T("Fade in"), icon: "◢", keys: "fade in", desc: T("Over the selection"), params: [{ k: "curve", type: "select", label: T("Curve"), def: "equal", opts: [["linear", T("Linear")], ["equal", T("Equal power")], ["exp", T("Logarithmic (slow start)")], ["s", T("S-curve")]] }], run: function (buf, v) { return A.fade(buf, "in", v.curve); }, needSel: true },
		{ id: "fadeout", name: T("Fade out"), icon: "◣", keys: "fade out", desc: T("Over the selection"), params: [{ k: "curve", type: "select", label: T("Curve"), def: "equal", opts: [["linear", T("Linear")], ["equal", T("Equal power")], ["exp", T("Logarithmic")], ["s", T("S-curve")]] }], run: function (buf, v) { return A.fade(buf, "out", v.curve); }, needSel: true },
		{ id: "comp", name: T("Compressor"), icon: "🗜️", keys: "compressor dynamics even out level", desc: T("Even out loud and quiet parts"),
			params: [{ k: "preset", type: "select", label: T("Preset"), def: "voice", opts: [["voice", T("Gentle voice (3:1)")], ["podcast", T("Podcast (4:1)")], ["heavy", T("Heavy (8:1)")], ["custom", T("Custom")]], presets: { voice: { threshold: -24, ratio: 3, attack: 8, release: 150 }, podcast: { threshold: -20, ratio: 4, attack: 5, release: 120 }, heavy: { threshold: -28, ratio: 8, attack: 3, release: 80 } } },
				{ k: "threshold", type: "range", label: T("Threshold"), def: -24, min: -60, max: 0, step: 1, unit: " dB" }, { k: "ratio", type: "range", label: T("Ratio"), def: 3, min: 1, max: 20, step: 0.5, unit: ":1" }, { k: "attack", type: "range", label: T("Attack"), def: 8, min: 0.5, max: 100, step: 0.5, unit: " ms" }, { k: "release", type: "range", label: T("Release"), def: 150, min: 10, max: 1000, step: 10, unit: " ms" }, { k: "makeup", type: "range", label: T("Make-up gain"), def: 0, min: 0, max: 24, step: 0.5, unit: " dB" }],
			run: function (buf, v) { return A.compress(buf, S.sr, { threshold: v.threshold, ratio: v.ratio, knee: 6, attack: v.attack, release: v.release, makeup: v.makeup }); } },
		{ id: "limit", name: T("Limiter"), icon: "⛔", keys: "limiter peak ceiling clip", desc: T("Nothing goes above the ceiling"), params: [{ k: "ceil", type: "range", label: T("Ceiling"), def: -1, min: -12, max: 0, step: 0.1, unit: " dBFS" }, { k: "release", type: "range", label: T("Release"), def: 80, min: 10, max: 500, step: 10, unit: " ms" }], run: function (buf, v) { return A.limiter(buf, S.sr, v.ceil, v.release, 5); } },
		{ id: "eq", name: T("EQ"), icon: "🎚️", keys: "equalizer eq voice clarity low cut high pass bass treble muddy telephone", desc: T("Voice clarity, low cut, presets"),
			params: [{ k: "preset", type: "select", label: T("Preset"), def: "voice", opts: EQ_KEYS.map(function (k) { return [k, T(A.EQ_PRESETS[k].name)]; }) }], curve: true,
			run: function (buf, v) { return A.eq(buf, S.sr, A.EQ_PRESETS[v.preset].bands); } },
		{ id: "hum", name: T("Hum removal"), icon: "〰️", keys: "hum buzz mains 50 60 hz notch ground loop", desc: T("50 / 60 Hz mains hum and harmonics"), params: [{ k: "base", type: "select", label: T("Hum"), def: "auto", help: T("A low, steady buzz from the electricity: 60 Hz in North America, 50 Hz in Europe, Asia, Africa and Australia. Detect finds which one your recording has."), opts: [["auto", T("Detect 50 or 60 Hz")], ["50", T("50 Hz (Europe, Asia, Africa)")], ["60", T("60 Hz (Americas)")]] }, { k: "harm", type: "range", label: T("Harmonics"), def: 8, min: 1, max: 20, step: 1, unit: "" }],
			run: function (buf, v) { if (!D) return buf; var base = v.base === "auto" ? D.detectHum(buf, S.sr).base : +v.base; if (!base) { toast(T("No mains hum found")); return buf; } return D.humRemove(buf, S.sr, { base: base, harmonics: v.harm }); } },
		{ id: "declick", name: T("De-click"), icon: "✂", keys: "click pop crackle declick vinyl mouth", desc: T("Repair short clicks and pops"), params: [{ k: "sens", type: "range", label: T("Sensitivity"), def: 50, min: 0, max: 100, step: 1, unit: "%" }], run: function (buf, v) { var o = A.declick(buf, S.sr, v.sens / 100); toast(T(o.fixed === 1 ? "{n} click repaired" : "{n} clicks repaired", { n: o.fixed })); return o.slice(); } },
		{ id: "reverse", name: T("Reverse"), icon: "⇆", keys: "reverse backwards", desc: T("Play it backwards"), params: [], run: function (buf) { return A.reverse(buf); } }
	];
	function fxById(id) { for (var i = 0; i < EFFECTS.length; i++) if (EFFECTS[i].id === id) return EFFECTS[i]; return null; }
	var noiseProfile = null, wetCache = null;
	function denoiseRun(buf, v, ctl) {
		if (!DN) return Promise.reject(new Error(T("Noise removal did not load")));
		var hum = v.hum && v.hum !== "0" ? v.hum : 0, s = (v.strength == null ? 100 : v.strength) / 100;
		function deHum(x) { return hum ? D.humRemove(x, S.sr, { base: hum === "auto" ? "auto" : +hum }) : x; }
		if (v.model === "spectral") return DN.process(buf, S.sr, { model: "spectral", strength: s, noise: noiseProfile, onProgress: ctl && ctl.prog, signal: ctl && ctl.signal }).then(deHum);
		var key = v.model + "|" + (ctl && ctl.key);
		if (ctl && ctl.key && wetCache && wetCache.key === key) return Promise.resolve(deHum(buf.map(function (c, k) { return D.mix(wetCache.wet[k], c, s); })));
		return DN.process(buf, S.sr, { model: v.model === "rnnoise" ? "rnnoise" : "auto", strength: 1, onProgress: ctl && ctl.prog, signal: ctl && ctl.signal }).then(function (wet) {
			if (DN.used && DN.used !== v.model && v.model === "deepfilter") toast(T("DeepFilterNet could not run here ({why}), used {model}", { why: DN.fallbackReason || "error", model: DN.used }));
			if (ctl && ctl.key) wetCache = { key: key, wet: wet };
			return deHum(buf.map(function (c, k) { return D.mix(wet[k], c, s); }));
		});
	}

	/* effect panel */
	var panel = null, curFx = null, vals = {};
	function openPanel(title, body) { $("au-side").hidden = false; $("au-ptitle").textContent = title; var pb = $("au-pbody"); pb.innerHTML = ""; if (typeof body === "string") pb.innerHTML = body; else pb.appendChild(body); draw(); return pb; }
	function closePanel() { stopPreview(); $("au-side").hidden = true; panel = null; curFx = null; draw(); }
	$("au-pclose").onclick = closePanel;
	function rangeText() {
		var tt = targets(); if (!tt.length) return T("Nothing to apply to yet");
		var r = S.sel ? fmt(S.sel.a, 2) + " – " + fmt(S.sel.b, 2) + " (" + fmt(S.sel.b - S.sel.a, 2) + ")" : T("the whole project ({len})", { len: fmt(projEnd(), 1) });
		return T("Applies to <b>{range}</b> on {tracks}", { range: r, tracks: tt.length === S.tracks.length && S.tracks.length > 1 ? T("all tracks") : tt.map(function (t) { return esc(t.name); }).join(", ") });
	}
	function openFx(id) {
		var fx = fxById(id); if (!fx) return; panel = "fx"; curFx = fx; vals = Object.assign({}, defaultsOf(fx), FX_LS[id] || {});
		var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		var tg = el("div", { class: "au-target" }, rangeText()); box.appendChild(tg);
		var form = el("div", { class: "au-pb" }); form.style.padding = "0"; box.appendChild(form);
		function build() {
			form.innerHTML = "";
			fx.params.forEach(function (p) {
				if (p.show) { var okShow = Object.keys(p.show).every(function (k) { return vals[k] === p.show[k]; }); if (!okShow) return; }
				var f;
				if (p.type === "check") { f = el("label", { class: "au-chk" }, '<input type="checkbox"><span>' + esc(p.label) + "</span>"); var cb = f.querySelector("input"); cb.checked = !!vals[p.k]; cb.onchange = function () { vals[p.k] = cb.checked; changed(p); }; }
				else if (p.type === "select") { f = el("label", { class: "au-f" }, "<span>" + esc(p.label) + "</span><select></select>"); var se = f.querySelector("select"); p.opts.forEach(function (o) { se.appendChild(el("option", { value: o[0] }, esc(o[1]))); }); se.value = vals[p.k]; se.onchange = function () { vals[p.k] = se.value; if (p.presets && p.presets[se.value]) Object.assign(vals, p.presets[se.value]); changed(p, true); }; }
				else { f = el("label", { class: "au-f" }, "<span>" + esc(p.label) + " <b></b></span><input type=range>"); var r = f.querySelector("input"), bv = f.querySelector("b"); r.min = p.min; r.max = p.max; r.step = p.step; r.value = vals[p.k]; bv.textContent = vals[p.k] + p.unit; r.oninput = function () { vals[p.k] = +r.value; bv.textContent = r.value + p.unit; if (fx.id === "comp" && p.k !== "preset") vals.preset = "custom"; changed(p); }; }
				form.appendChild(f);
				if (p.help) helpFor(f, p.label, p.help, "au-p-" + p.k);
			});
			if (fx.curve) { var cvs = el("canvas", { class: "au-eqcv", width: 600, height: 220, "aria-label": T("EQ curve") }); form.appendChild(cvs); drawEq(cvs); }
			if (fx.note) { var nt = el("div", { class: "au-note" }, fx.note(vals)); form.appendChild(nt); var lb = nt.querySelector("[data-act=learn]"); if (lb) lb.onclick = learnNoise; }
		}
		function changed(p, rebuild) { FX_LS[fx.id] = vals; store("fx", FX_LS); if (rebuild || p.type === "select") build(); if (preview) previewParams(p && p.cheap); }
		build();
		if (fx.analyse) { var an = el("div", { class: "au-stats" }); an.id = "au-anal"; box.appendChild(el("div", { class: "au-row" }, '<button type="button" class="au-btn au-btn--sm" id="au-measure">' + T("Measure loudness") + '</button>')); box.appendChild(an); }
		if (!fx.noPreview) {
			box.appendChild(el("div", { class: "au-step" }, T("<b>1. Try it first</b> (nothing changes yet)")));
			box.appendChild(el("div", { class: "au-row" }, '<button type="button" class="au-btn" id="au-pv">' + T("▶ Preview") + '</button><span class="au-note" id="au-pvn">' + (S.sel ? T("Plays up to 30 s of the selection on a loop") : T("Plays up to 30 s of your audio on a loop")) + '</span>'));
			var ab = el("div", { class: "au-listen" }, '<span class="au-listen-l">' + T("Listen:") + '</span><div class="au-ab" role="group" aria-label="' + esc(T("Listen to the sound before or after the effect")) + '"><button type="button" id="au-pa" aria-pressed="false" title="' + esc(T("Your original sound (key B switches)")) + '">' + T("Before") + '</button><button type="button" id="au-pb2" aria-pressed="true" title="' + esc(T("With the effect (key B switches)")) + '">' + T("After") + '</button>' + (isClean(fx.id) ? '<button type="button" id="au-pn" aria-pressed="false" title="' + esc(T("Only what the effect removes (key N)")) + '">' + T("Noise only") + '</button>' : "") + '</div>');
			box.appendChild(ab);
			if (isClean(fx.id)) box.appendChild(el("div", { class: "au-row au-matchrow" }, '<label class="au-cmp-ck" for="au-pmatch"><input type="checkbox" id="au-pmatch"' + (cmpMatch ? " checked" : "") + '> ' + T("Match levels") + '</label><span class="au-note">' + T("plays <b>Noise only</b> as loud as your original on average, so quiet noise is easy to hear") + '</span>'));
			box.appendChild(el("div", { class: "au-note" }, isClean(fx.id) ? T("Switch between <b>Before</b> (your original) and <b>After</b> (with {fx}) or <b>Noise only</b> (just what is taken out) while it plays; key <kbd>B</kbd> switches Before / After, <kbd>N</kbd> Noise only. They stay in sync, so you hear exactly what changes. In <b>Noise only</b>, hiss, hum and room noise is good; if you hear words, lower the strength until they are gone.", { fx: esc(shortName(fx)) }) : T("Switch between <b>Before</b> (your original) and <b>After</b> (with {fx}) while it plays; key <kbd>B</kbd> switches Before / After. They stay in sync, so you hear exactly what changes.", { fx: esc(shortName(fx)) })));
			var cmpWrap = el("div", { class: "au-cmpwrap" }, '<canvas class="au-cmpcv" id="au-cmpcv" width="640" height="150" aria-label="' + esc(T("Waveform before (grey, behind) and after (bright, in front)")) + '"></canvas><div class="au-cmpleg"><span class="au-lg au-lg--b">' + T("Before") + '</span><span class="au-lg au-lg--a">' + T("After") + '</span>' + (isClean(fx.id) ? '<span class="au-lg au-lg--n">' + T("Noise only") + '</span>' : "") + '<span id="au-cmpnum"></span></div>');
			cmpWrap.hidden = true; box.appendChild(cmpWrap);
			box.appendChild(el("div", { class: "au-step" }, S.sel ? T("<b>2. Apply it</b> to the selection") : targets().length > 1 ? T("<b>2. Apply it</b> to the whole project") : T("<b>2. Apply it</b> to the whole track")));
		}
		box.appendChild(el("div", { class: "au-row" }, '<button type="button" class="au-btn au-btn--primary" id="au-apply">' + T("Apply") + '</button><button type="button" class="au-btn" id="au-cancel">' + T("Close") + '</button>'));
		box.appendChild(el("div", { class: "au-result", id: "au-result", hidden: "" }));
		openPanel(fx.icon + " " + fx.name, box);
		$("au-apply").onclick = function () { applyFx(fx, Object.assign({}, vals)); };
		$("au-cancel").onclick = closePanel;
		if ($("au-pv")) { $("au-pv").onclick = function () { if (preview && preview.playing) stopPreview(); else startPreview(); }; $("au-pa").onclick = function () { setAB("A"); }; $("au-pb2").onclick = function () { setAB("B"); }; if ($("au-pn")) $("au-pn").onclick = function () { setAB("N"); }; if ($("au-pmatch")) $("au-pmatch").onchange = function () { setMatch(this.checked); }; }
		if ($("au-measure")) $("au-measure").onclick = measure;
		wetCache = null;
	}
	/* a small "?" next to an option's name; the explanation opens under it (plain-English help for beginners) */
	function helpFor(f, label, html, id) {
		var ctl = f.querySelector("input,select"); if (ctl && id) { ctl.id = id; f.setAttribute("for", id); }
		var sp = f.querySelector("span"), q = el("button", { type: "button", class: "au-q", "aria-expanded": "false", "aria-label": T("What is {what}?", { what: label }), title: T("What is this?") }, "?");
		var pop = el("div", { class: "au-qpop", role: "note" }, html); pop.hidden = true;
		if (sp) { var tn = sp.firstChild; if (tn && tn.nextSibling) sp.insertBefore(q, tn.nextSibling); else sp.appendChild(q); } else f.appendChild(q);
		f.parentNode.insertBefore(pop, f.nextSibling);
		q.onclick = function (e) { e.preventDefault(); e.stopPropagation(); pop.hidden = !pop.hidden; q.setAttribute("aria-expanded", !pop.hidden); };
		return q;
	}
	function defaultsOf(fx) { var o = {}; fx.params.forEach(function (p) { o[p.k] = p.def; }); return o; }
	function drawEq(c) {
		var g = c.getContext("2d"), w = c.width, h = c.height, bands = A.EQ_PRESETS[vals.preset].bands; g.fillStyle = "#14161b"; g.fillRect(0, 0, w, h);
		g.strokeStyle = "#333948"; g.fillStyle = "#a3aab8"; g.font = "18px system-ui"; [-12, -6, 0, 6, 12].forEach(function (db) { var y = h / 2 - db * h / 30; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillText(db + " dB", 4, y - 3); });
		[100, 1000, 10000].forEach(function (f) { var x = Math.log(f / 20) / Math.log(1000) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.fillText(f >= 1000 ? f / 1000 + "k" : f, x + 3, h - 6); });
		g.strokeStyle = "#38bdf8"; g.lineWidth = 3; g.beginPath(); for (var x = 0; x <= w; x += 2) { var f = 20 * Math.pow(1000, x / w), db = A.eqResponse(bands, S.sr, f), y = h / 2 - Math.max(-15, Math.min(15, db)) * h / 30; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.lineWidth = 1;
	}
	function learnNoise() {
		if (!S.sel) return toast(T("Select a few seconds where there is only noise, then press Learn"));
		var t = targets()[0]; noiseProfile = A.renderTrack(t, S.sel.a, S.sel.b); toast(T("Learned {len} of noise. Now select what to clean (or nothing = everything) and Apply.", { len: fmt(S.sel.b - S.sel.a, 1) })); if (curFx) openFx(curFx.id);
	}
	function measure() {
		var tt = targets(); if (!tt.length) return; var a = S.sel ? S.sel.a : 0, b = S.sel ? S.sel.b : projEnd(), mix = A.mix(tt, a, b, tt.some(function (t) { return t.nch === 2 || t.pan; }) ? 2 : 1);
		var m = A.loudness(mix, S.sr), tp = A.truePeak(mix), f = function (x, u) { return isFinite(x) ? x.toFixed(1) + u : "–"; };
		$("au-anal").innerHTML = "<span>" + T("Integrated") + "</span><span>" + f(m.integrated, " LUFS") + "</span><span>" + T("Loudness range") + "</span><span>" + f(m.range, " LU") + "</span><span>" + T("Max short-term") + "</span><span>" + f(m.shortTermMax, " LUFS") + "</span><span>" + T("True peak") + "</span><span>" + f(tp, " dBTP") + "</span><span>" + T("Sample peak") + "</span><span>" + f(A.gainToDb(A.peak(mix)), " dBFS") + "</span>";
	}
	/* apply: per target track, render [a, b), process, write back */
	function applyFx(fx, v, quiet) {
		var tt = targets(); if (!tt.length) return toast(T("Open some audio first"));
		if (fx.needSel && !S.sel) return toast(T("Select the part to {what} first", { what: shortName(fx) }));
		stopAll(); var a = S.sel ? S.sel.a : 0, b = S.sel ? S.sel.b : projEnd(); if (b <= a) return;
		var bz = busy(fx.name), i = 0, out = [], beforeTracks = S.tracks, measure = fx.id === "noise" || fx.id === "enhance" || fx.id === "hum", fl = null;
		function next() {
			if (i >= tt.length) {
				bz.done(); out.forEach(function (t) { setTrack(t); }); commit(fx.name);
				var rep = fl ? A.noiseReport(fl.b, fl.a) : null;
				startCompare({ label: fx.name, fid: fx.id, before: beforeTracks, after: S.tracks, a: a, b: b, ids: tt.map(function (t) { return t.id; }), report: rep });
				if (!quiet) toast(T("{what} applied.", { what: fx.name }) + (rep ? " " + repText(rep) : "") + " " + T("Press B to compare."), { label: T("Undo"), fn: undo });
				showResult(fx, rep);
				return;
			}
			var t = trackById(tt[i].id), buf = A.renderTrack(t, a, b), base = i / tt.length;
			bz.set(base, T("Processing {name}", { name: t.name }));
			return tick().then(function () { return fx.run(buf, v, { prog: function (f, m) { bz.set(base + f / tt.length, m || T("Processing {name}", { name: t.name })); }, signal: bz.signal }); }).then(function (res) {
				if (bz.signal.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
				if (!res || !res[0] || res[0].length !== buf[0].length) throw new Error(T("the effect returned the wrong length"));
				if (measure && i === 0) fl = { b: A.noiseFloor(buf, S.sr), a: A.noiseFloor(res, S.sr) };
				out.push(A.writeRange(t, a, b, res)); i++; return tick().then(next);
			});
		}
		Promise.resolve().then(next).catch(function (e) { bz.done(); toast(e.name === "AbortError" ? T("Cancelled: nothing changed") : T("Could not apply: {why}", { why: e.message || e })); });
	}

	/* A/B preview: mixdown of up to 30 s, original vs processed, both playing in sync */
	var preview = null, pvWant = null;
	function previewRange() { var a = S.sel ? S.sel.a : (playing ? Math.round(playPos()) : S.cursor), b = S.sel ? S.sel.b : projEnd(); if (b - a < S.sr * 0.5) { a = 0; b = projEnd(); } return { a: a, b: Math.min(b, a + S.sr * 30) }; }
	function startPreview() {
		var fx = curFx; if (!fx) return; var tt = targets(); if (!tt.length) return; stopPlay(); actx();
		var r = previewRange(), ids = tt.map(function (t) { return t.id; }), bz = busy(T("Preparing the preview")), proc = {}, i = 0;
		var nOut = S.tracks.some(function (t) { return t.nch === 2 || t.pan; }) ? 2 : 1;
		function next() {
			if (i >= tt.length) {
				bz.done(); var orig = A.mix(S.tracks, r.a, r.b, nOut), procTracks = S.tracks.map(function (t) { return proc[t.id] ? proc[t.id] : t; });
				preview = { a: r.a, b: r.b, ids: ids, raw: proc.__raw, fx: fx, which: (preview && preview.which) || pvWant || "B" };
				var procMix = A.mix(procTracks, r.a, r.b, nOut); setPvBufs(orig, procMix); playPreview(0); previewCompare(orig, procMix); return;
			}
			var t = tt[i], buf = A.renderTrack(t, r.a, r.b);
			return Promise.resolve(fx.run(buf, Object.assign({}, vals), { prog: function (f, m) { bz.set((i + f) / tt.length, m); }, signal: bz.signal, key: "pv" + t.id + r.a + "-" + r.b })).then(function (res) { proc[t.id] = A.writeRange(t, r.a, r.b, res); i++; return tick().then(next); });
		}
		wetCache = wetCache && wetCache.key.indexOf("pv" + tt[0].id + r.a + "-" + r.b) >= 0 ? wetCache : wetCache;
		Promise.resolve().then(next).catch(function (e) { bz.done(); toast(e.name === "AbortError" ? T("Preview cancelled") : T("Preview failed: {why}", { why: e.message || e })); });
	}
	function previewCompare(orig, proc) {
		var c = $("au-cmpcv"); if (!c) return; var nf = curFx && /noise|enhance|hum/.test(curFx.id) ? repText(A.noiseReport(A.noiseFloor(orig, S.sr), A.noiseFloor(proc, S.sr))) : "";
		drawCompare(c, orig, proc, T("Preview") + (nf ? ": " + nf : ""), nf ? diffOf(orig, proc) : null);
	}
	function setPvBufs(orig, proc) {
		preview.orig = toAbuf(orig); preview.proc = toAbuf(proc);
		if (isClean(preview.fx && preview.fx.id)) { var d = diffOf(orig, proc); preview.noise = toAbuf(d); preview.nDb = matchDb(orig, d); } else { preview.noise = null; if (preview.which === "N") preview.which = "B"; }
	}
	function nGain() { return preview && preview.nDb != null && cmpMatch ? A.dbToGain(preview.nDb) : 1; }
	function toAbuf(ch) { var b = ctx.createBuffer(ch.length, Math.max(1, ch[0].length), S.sr); ch.forEach(function (d, k) { b.getChannelData(k).set(d); }); return b; }
	function playPreview(offset) {
		stopPreviewSources(); var t0 = ctx.currentTime + 0.05;
		preview.ga = ctx.createGain(); preview.gb = ctx.createGain(); preview.ga.connect(master); preview.gb.connect(master);
		preview.ga.gain.value = preview.which === "A" ? 1 : 0; preview.gb.gain.value = preview.which === "B" ? 1 : 0;
		preview.sa = ctx.createBufferSource(); preview.sa.buffer = preview.orig; preview.sa.loop = true; preview.sa.connect(preview.ga);
		preview.sb = ctx.createBufferSource(); preview.sb.buffer = preview.proc; preview.sb.loop = true; preview.sb.connect(preview.gb);
		if (preview.noise) { preview.gn = ctx.createGain(); preview.gn.connect(master); preview.gn.gain.value = preview.which === "N" ? nGain() : 0; preview.sn = ctx.createBufferSource(); preview.sn.buffer = preview.noise; preview.sn.loop = true; preview.sn.connect(preview.gn); preview.sn.start(t0, offset || 0); } else preview.gn = preview.sn = null;
		preview.sa.start(t0, offset || 0); preview.sb.start(t0, offset || 0); preview.t0 = t0 - (offset || 0); preview.playing = true;
		if ($("au-pv")) $("au-pv").textContent = T("⏹ Stop preview"); syncAB(); cancelAnimationFrame(playRaf); playRaf = requestAnimationFrame(pvLoop);
	}
	function pvLoop() { if (!preview || !preview.playing) return; var dur = preview.orig.duration, p = preview.a + (((ctx.currentTime - preview.t0) % dur + dur) % dur) * S.sr; var x = xOf(p), g = over.getContext("2d"), h = over.height / dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, h); g.fillStyle = preview.which === "A" ? "#e7e9ee" : preview.which === "N" ? "#f87171" : "#a78bfa"; g.fillRect(Math.round(x), 0, 2, h); $("au-time").textContent = fmt(p) + " " + (preview.which === "N" ? T("noise") : preview.which); meter(); playRaf = requestAnimationFrame(pvLoop); }
	function stopPreviewSources() { if (!preview) return; ["sa", "sb", "sn"].forEach(function (k) { if (preview[k]) try { preview[k].stop(); } catch (e) {} }); ["ga", "gb", "gn"].forEach(function (k) { if (preview[k]) try { preview[k].disconnect(); } catch (e) {} }); }
	function stopPreview() { if (!preview) return; stopPreviewSources(); preview.playing = false; cancelAnimationFrame(playRaf); if ($("au-pv")) $("au-pv").textContent = T("▶ Preview"); drawOver(); meterClear(); }
	function abPressed(w) { if (!$("au-pa")) return; $("au-pa").setAttribute("aria-pressed", w === "A"); $("au-pb2").setAttribute("aria-pressed", w === "B"); if ($("au-pn")) $("au-pn").setAttribute("aria-pressed", w === "N"); }
	function setAB(w) {
		if (w === "N" && !$("au-pn")) return;
		if (!preview) { pvWant = w; abPressed(w); return; }
		if (w === "N" && !preview.noise) w = "B"; preview.which = w;
		if (preview.playing) { var t = ctx.currentTime; preview.ga.gain.setTargetAtTime(w === "A" ? 1 : 0, t, 0.012); preview.gb.gain.setTargetAtTime(w === "B" ? 1 : 0, t, 0.012); if (preview.gn) preview.gn.gain.setTargetAtTime(w === "N" ? nGain() : 0, t, 0.012); }
		syncAB();
	}
	function syncAB() { if (preview) abPressed(preview.which); }
	var pvT = null;
	function previewParams(cheap) {
		if (!preview || !preview.playing) return; clearTimeout(pvT);
		pvT = setTimeout(function () {
			var off = ((ctx.currentTime - preview.t0) % preview.orig.duration + preview.orig.duration) % preview.orig.duration, r = { a: preview.a, b: preview.b }, nOut = preview.orig.numberOfChannels, tt = targets(), proc = {}, i = 0;
			var bz = cheap ? null : busy(T("Updating the preview"));
			function next() {
				if (i >= tt.length) { if (bz) bz.done(); var pm = A.mix(S.tracks.map(function (t) { return proc[t.id] || t; }), r.a, r.b, nOut); setPvBufs(A.mix(S.tracks, r.a, r.b, nOut), pm); playPreview(off); previewCompare(A.mix(S.tracks, r.a, r.b, nOut), pm); return; }
				var t = tt[i], buf = A.renderTrack(t, r.a, r.b);
				return Promise.resolve(curFx.run(buf, Object.assign({}, vals), { key: "pv" + t.id + r.a + "-" + r.b, prog: function (f, m) { if (bz) bz.set(f, m); }, signal: bz ? bz.signal : null })).then(function (res) { proc[t.id] = A.writeRange(t, r.a, r.b, res); i++; return next(); });
			}
			Promise.resolve().then(next).catch(function (e) { if (bz) bz.done(); toast(T("Preview failed: {why}", { why: e.message })); });
		}, cheap ? 60 : 350);
	}

	/* effects list (searchable) */
	function openFxList() {
		panel = "fxlist"; var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		box.innerHTML = '<input type="search" placeholder="' + esc(T("Filter effects…")) + '" aria-label="' + esc(T("Filter effects")) + '" id="au-fxq"><div class="au-fxlist" id="au-fxl"></div>';
		openPanel(T("Effects"), box); var q = $("au-fxq"), l = $("au-fxl");
		function list() { l.innerHTML = ""; A.match(EFFECTS, q.value).forEach(function (fx) { var b = el("button", { type: "button" }, "<span>" + fx.icon + "</span><span>" + esc(fx.name) + "<small>" + esc(fx.desc || "") + "</small></span>"); b.onclick = function () { openFx(fx.id); }; l.appendChild(b); }); }
		q.oninput = list; list(); q.focus();
	}
	function openMarkers() {
		panel = "markers"; var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		box.innerHTML = '<div class="au-row"><button type="button" class="au-btn au-btn--sm" id="au-mkadd">' + T("+ Marker at cursor (M)") + '</button><button type="button" class="au-btn au-btn--sm" id="au-mkexp">' + T("Export as labels (.txt)") + '</button></div><div class="au-marks" id="au-mkl"></div><div class="au-note">' + T("[ and ] jump between markers. The text file imports into Audacity (File → Import → Labels).") + '</div>';
		openPanel(T("Markers"), box); $("au-mkadd").onclick = addMarker; $("au-mkexp").onclick = exportLabels;
		var l = $("au-mkl"); if (!S.markers.length) l.innerHTML = '<div class="au-note">' + T("No markers yet.") + '</div>';
		S.markers.forEach(function (m) {
			var r = el("div", { class: "au-mk" }, '<button type="button" class="au-mt" title="' + esc(T("Go there")) + '">' + fmt(m.t, 2) + '</button><input type="text" aria-label="' + esc(T("Marker name")) + '"><button type="button" class="au-btn au-btn--sm" title="' + esc(T("Delete marker")) + '" aria-label="' + esc(T("Delete marker")) + '">✕</button>');
			var inp = r.querySelector("input"); inp.value = m.name; inp.onchange = function () { m.name = inp.value; commit(T("Rename marker")); };
			r.querySelector(".au-mt").onclick = function () { setCursor(m.t); if (playing) playFrom(m.t); };
			r.querySelector(".au-btn").onclick = function () { S.markers = S.markers.filter(function (x) { return x !== m; }); commit(T("Delete marker")); openMarkers(); };
			l.appendChild(r);
		});
	}
	function exportLabels() { var txt = S.markers.map(function (m) { var s = (m.t / S.sr).toFixed(6); return s + "\t" + s + "\t" + m.name; }).join("\n") + "\n"; download(new Blob([txt], { type: "text/plain" }), A.fileName((S.name || "audio") + "-markers", "txt")); }
	function showHelp() {
		var k = [["Space", T("Play / pause")], ["Home / End", T("Start / end")], ["← / →", T("Move 1 s (Shift = extend selection)")], [MOD + "Z", T("Undo")], [MOD + "Shift+Z", T("Redo")], [MOD + "X / C / V", T("Cut, copy, paste")], ["Delete", T("Delete selection")], [MOD + "I", T("Split")], [MOD + "T", T("Trim to selection")], [MOD + "L", T("Silence selection")], [MOD + "D", T("Duplicate to new track")], [MOD + "A", T("Select all")], ["Esc", T("Clear selection / close")], ["M", T("Add marker")], ["[ / ]", T("Previous / next marker")], ["R", T("Record")], ["Backspace", T("Start the recording over")], ["L", T("Loop on / off")], ["+ / −", T("Zoom in / out")], ["0", T("Fit project")], [MOD + "3", T("Zoom to selection")], ["S", T("Spectrogram")], ["N", T("Noise removal")], ["E", T("Effects list")], ["B", T("A / B while previewing")], [MOD + "E", T("Export")], [MOD + "K", T("Search commands")], ["F", T("Fill window")], ["Shift+F", T("Full screen")], ["?", T("This list")]];
		openPanel(T("Keyboard shortcuts"), '<div class="au-help">' + k.map(function (x) { return "<div><kbd>" + esc(x[0]) + "</kbd><span>" + esc(x[1]) + "</span></div>"; }).join("") + '</div><div class="au-note">' + T("Ctrl+wheel or pinch zooms; Shift+wheel scrolls sideways. Drag a clip by its title bar to move it (also to another track).") + '</div>');
		panel = "help";
	}

	/* ---------------- recording ---------------- */
	var rec = null;
	function toggleRec() { if (rec) return stopRec(); startRec(); }
	function startRec() {
		if (window.MESAudioNative && window.MESAudioNative.rec) return startNativeRec();
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast(T("Recording needs a secure (https) page and a microphone"));
		stopAll(); actx();
		navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }).then(function (stream) {
			var src = ctx.createMediaStreamSource(stream), sp = ctx.createScriptProcessor(4096, 1, 1), chunks = [], zero = ctx.createGain(); zero.gain.value = 0;
			sp.onaudioprocess = function (e) { var d = new Float32Array(e.inputBuffer.getChannelData(0)); chunks.push(d); rec.n += d.length; var pk = 0; for (var i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]); rec.pk = pk; };
			src.connect(sp); sp.connect(zero); zero.connect(ctx.destination);
			rec = { stream: stream, src: src, sp: sp, chunks: chunks, n: 0, pk: 0, rate: ctx.sampleRate, at: S.sel ? S.sel.a : S.cursor, t0: Date.now() };
			$("au-recbar").hidden = false; $("au-rec").setAttribute("aria-pressed", "true"); $("au-empty").hidden = true;
			(function loopRec() { if (!rec) return; var s = (Date.now() - rec.t0) / 1000; $("au-rect").textContent = A.fmtTime(s, 0); var c = $("au-recmeter"), g = c.getContext("2d"), db = rec.pk > 0 ? 20 * Math.log10(rec.pk) : -90, f = Math.max(0, Math.min(1, (db + 60) / 60)); g.fillStyle = "#0b0d11"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = db > -1 ? "#ef4444" : db > -9 ? "#fbbf24" : "#4ade80"; g.fillRect(0, 2, f * c.width, c.height - 4); requestAnimationFrame(loopRec); })();
		}).catch(function (e) { toast(T("No microphone access: {why}", { why: e.message || e.name })); });
	}
	// Start over: throw away what was recorded so far and keep recording from the same spot
	function redoRec() {
		if (rec && rec.native) { var NR = window.MESAudioNative.rec; NR.stop().then(function (r) { if (r && r.discard) r.discard(); return NR.start(); }).then(function () { rec.t0 = Date.now(); toast(T("Take thrown away. Recording again from the start.")); }).catch(function (e) { toast(T("Could not restart: {why}", { why: e.message || e })); }); return; }
		if (!rec) return; rec.chunks.length = 0; rec.n = 0; rec.pk = 0; rec.t0 = Date.now(); toast(T("Take thrown away. Recording again from the start."));
	}
	function stopRec() {
		if (rec && rec.native) return stopNativeRec();
		if (!rec) return; var r = rec; rec = null; try { r.sp.disconnect(); r.src.disconnect(); } catch (e) {} r.stream.getTracks().forEach(function (t) { t.stop(); });
		$("au-recbar").hidden = true; $("au-rec").setAttribute("aria-pressed", "false");
		if (!r.n) { updateEmpty(); return; }
		var x = new Float32Array(r.n), p = 0; r.chunks.forEach(function (c) { x.set(c, p); p += c.length; });
		if (r.rate !== S.sr && D) x = D.resample(x, r.rate, S.sr);
		var first = !S.tracks.length; addTrackFrom([x], T("Recording {time}", { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }), r.at, true);
		if (first) { S.name = T("Recording"); zoomFit(); }
		commit(T("Record")); toast(T("Recorded {len}. Tip: ✨ Remove noise cleans it up.", { len: fmt(x.length, 1) }));
	}

	/* the phone app records natively (keeps going with the screen off); window.MESAudioNative.rec = { start(), stop() -> { buf: ArrayBuffer }, level() -> { db } } */
	function startNativeRec() {
		var NR = window.MESAudioNative.rec; stopAll();
		NR.start().then(function () {
			rec = { native: true, pk: 0, at: S.sel ? S.sel.a : S.cursor, t0: Date.now() };
			$("au-recbar").hidden = false; $("au-rec").setAttribute("aria-pressed", "true"); $("au-empty").hidden = true; simpleSync();
			(function loopRec() {
				if (!rec || !rec.native) return; var s = (Date.now() - rec.t0) / 1000; $("au-rect").textContent = A.fmtTime(s, 0); simpleSync();
				NR.level().then(function (l) { if (!rec) return; var db = l && isFinite(l.db) ? l.db : -90, c = $("au-recmeter"), g = c.getContext("2d"), f = Math.max(0, Math.min(1, (db + 60) / 60)); g.fillStyle = "#0b0d11"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = db > -1 ? "#ef4444" : db > -9 ? "#fbbf24" : "#4ade80"; g.fillRect(0, 2, f * c.width, c.height - 4); }).catch(function () {});
				setTimeout(loopRec, 150);
			})();
		}).catch(function (e) { toast(T("No microphone access: {why}", { why: e.message || e })); });
	}
	function stopNativeRec() {
		var r = rec; rec = null; $("au-recbar").hidden = true; $("au-rec").setAttribute("aria-pressed", "false"); simpleSync();
		var bz = busy(T("Saving the recording"));
		window.MESAudioNative.rec.stop().then(function (o) { if (!o || !o.buf) throw new Error(T("nothing was recorded")); return decode(o.buf).then(function (ab) { if (o.discard) o.discard(); return ab; }); }).then(function (ab) {
			bz.done(); var ch = abToCh(ab), first = !S.tracks.length;
			addTrackFrom(ch, T("Recording {time}", { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }), r.at, true);
			if (first) { S.name = T("Recording"); zoomFit(); }
			commit(T("Record")); toast(T("Recorded {len}. Tip: ✨ Remove noise cleans it up.", { len: fmt(ch[0].length, 1) }));
		}).catch(function (e) { bz.done(); updateEmpty(); toast(T("Could not read the recording: {why}", { why: e.message || e })); });
	}

	/* ---------------- simple mode (phones, <= 600px): record / open / trim / clean / compare / save, the full editor one tap away ---------------- */
	var simpleLen = -1, simpleMQ = window.matchMedia ? matchMedia("(max-width: 600px)") : null, simpleOn = false;
	function simpleWanted() { var p = store("simple"); if (window.MESAudioNative) return p !== false; return !!(simpleMQ && simpleMQ.matches) && p !== false; }
	function setSimple(on, save) {
		simpleOn = on; root.classList.toggle("au-simple-on", on); $("au-simple").hidden = !on;
		$("aus-back").hidden = on || !(window.MESAudioNative || (simpleMQ && simpleMQ.matches));
		if (save) store("simple", on); if (on) closePanel(); simpleSync(); setTimeout(draw, 30);
	}
	function simpleSync() {
		if (!simpleOn) return; var has = S.tracks.length > 0; root.classList.toggle("au-s-empty", !has && !rec); $("aus-tone").hidden = has; var pe = projEnd(); if (pe !== simpleLen) { simpleLen = pe; if (has) setTimeout(zoomFit, 40); }
		$("aus-tools").hidden = !has; $("aus-undo").disabled = !H.canUndo(); $("aus-trim").disabled = $("aus-del").disabled = !S.sel;
		var rb = $("aus-rec"); rb.setAttribute("aria-pressed", rec ? "true" : "false");
		$("aus-rect").textContent = rec ? T("Stop") + "  " + A.fmtTime((Date.now() - rec.t0) / 1000, 0) : (has ? T("Record more") : T("Record"));
		$("aus-play").textContent = playing ? "⏸" : "▶"; $("aus-play").setAttribute("aria-label", playing ? T("Pause") : T("Play"));
		$("aus-hint").textContent = S.sel ? T("Selected {len}. Effects apply to the selection; tap outside it to clear.", { len: fmt(S.sel.b - S.sel.a, 1) }) : T("Drag across the waveform to select a part, then keep it or delete it. Effects apply to everything.");
		var t = playing ? playPos() : S.cursor; $("aus-time").textContent = fmt(t, 1) + " / " + fmt(projEnd(), 1);
	}
	function simpleSave(mode) {
		if (!S.tracks.length) return toast(T("Record or open some audio first")); if (cmp) endCompare(true);
		var f = $("aus-fmt").value; store("sfmt", f); stopAll(); var bz = busy(mode === "share" ? T("Preparing to share") : T("Saving"));
		var o = { f: f, a: 0, b: projEnd(), kbps: f === "mp3" ? 192 : 160, name: S.name || "audio", lufs: "none" };
		makeExport(o, bz).catch(function (e) { if (f !== "m4a") throw e; o.f = "mp3"; o.kbps = 192; return makeExport(o, bz); }).then(function (r) { bz.done(); deliver(r.blob, r.name, mode); })
			.catch(function (e) { bz.done(); toast(T("Could not save: {why}", { why: e.message || e })); });
	}
	(function () {
		if (typeof window.AudioEncoder !== "function") { var mo = $("aus-fmt").querySelector('option[value="m4a"]'); if (mo) mo.remove(); }
		var sf = store("sfmt"); if (sf && $("aus-fmt").querySelector('option[value="' + sf + '"]')) $("aus-fmt").value = sf;
		$("aus-share").hidden = !(window.MESAudioNative || canShareFiles()); if (window.MESAudioNative) $("aus-save").textContent = window.MESAudioNative.saveLabel || T("⬇ Save to Files");
		$("aus-rec").onclick = toggleRec; $("aus-open").onclick = function () { $("au-file").click(); };
		$("aus-play").onclick = function () { togglePlay(); simpleSync(); };
		$("aus-undo").onclick = function () { undo(); simpleSync(); };
		$("aus-trim").onclick = doTrim; $("aus-del").onclick = function () { doDelete(); };
		$("aus-all").onclick = function () { selectAll(); simpleSync(); };
		$("aus-noise").onclick = function () { if (!S.tracks.length) return; applyFx(fxById("noise"), { model: "deepfilter", strength: 100, hum: "auto" }); };
		$("aus-enh").onclick = function () { var fx = fxById("enhance"); applyFx(fx, defaultsOf(fx)); };
		$("aus-save").onclick = function () { simpleSave("save"); }; $("aus-share").onclick = function () { simpleSave("share"); };
		$("aus-tone").onclick = testClip; $("aus-full").onclick = function () { setSimple(false, true); }; $("aus-back").onclick = function () { setSimple(true, true); };
		if (simpleMQ && simpleMQ.addEventListener) simpleMQ.addEventListener("change", function () { setSimple(simpleWanted(), false); });
		setInterval(function () { if (simpleOn && playing) simpleSync(); }, 200);
	})();

	/* ---------------- test clip ---------------- */
	function testClip() {
		var b = busy(T("Loading the test clip"));
		fetch("/audio/sample-speech.mp3").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(decode).then(function (ab) {
			var x = abToCh(ab)[0], n = x.length, y = new Float32Array(n), s = 7, br = 0, p1 = 0, e = 0, en = 0, nz = new Float32Array(n), i;
			for (i = 0; i < n; i++) { s = (s * 16807) % 2147483647; var w = s / 2147483647 * 2 - 1; br = 0.995 * br + 0.05 * w; p1 = 0.9 * p1 + 0.1 * w; var hum = 0; for (var h = 1; h <= 5; h++) hum += Math.sin(2 * Math.PI * 60 * h * i / S.sr + h) / h; nz[i] = br + 0.3 * p1 + 0.25 * w + 0.4 * hum; e += x[i] * x[i]; en += nz[i] * nz[i]; }
			var g = Math.sqrt(e / en / Math.pow(10, 0.5)); for (i = 0; i < n; i++) y[i] = x[i] + g * nz[i];
			b.done(); addTrackFrom([y], T("Noisy test clip")); S.name = "noisy-test-clip"; zoomFit(); commit(T("Open test clip"));
			toast(T("Speech (LibriVox, public domain) + fan, hiss and 60 Hz hum. Press ✨ Remove noise, then Preview and switch A / B."));
		}).catch(function (e) { b.done(); toast(T("Could not load the test clip: {why}", { why: e.message })); });
	}

	/* ---------------- export ---------------- */
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 30000); }
	var EX_LS = store("export") || { fmt: "mp3", bits: "16", kbps: "192", rate: "same", ch: "auto", range: "all", lufs: "none" };
	function openExport() {
		if (!S.tracks.length) return toast(T("Open or record some audio first")); if (cmp) endCompare(true); panel = "export";
		var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		var aac = typeof window.AudioEncoder === "function";
		box.innerHTML = '<label class="au-f"><span>' + T("Format") + '</span><select id="ex-fmt"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="m4a"' + (aac ? "" : " disabled") + '>M4A (AAC)' + (aac ? "" : " – " + T("not in this browser")) + '</option></select></label>' +
			'<label class="au-f" id="ex-bitsw"><span>' + T("WAV depth") + '</span><select id="ex-bits"><option value="16">16-bit</option><option value="24">24-bit</option><option value="32">' + T("32-bit float") + '</option></select></label>' +
			'<label class="au-f" id="ex-kbpsw"><span>' + T("Bitrate") + '</span><select id="ex-kbps"><option value="64">' + T("64 kbps (speech, small)") + '</option><option value="96">96 kbps</option><option value="128">128 kbps</option><option value="192">192 kbps</option><option value="256">256 kbps</option><option value="320">' + T("320 kbps (MP3 best)") + '</option></select></label>' +
			'<label class="au-f"><span>' + T("Sample rate") + '</span><select id="ex-rate"><option value="same">' + T("Project ({rate} Hz)", { rate: S.sr }) + '</option><option value="44100">44,100 Hz</option><option value="48000">48,000 Hz</option><option value="22050">22,050 Hz</option></select></label>' +
			'<label class="au-f"><span>' + T("Channels") + '</span><select id="ex-ch"><option value="auto">' + T("Automatic") + '</option><option value="1">' + T("Mono") + '</option><option value="2">' + T("Stereo") + '</option></select></label>' +
			'<label class="au-f"><span>' + T("Range") + '</span><select id="ex-range"><option value="all">' + T("Whole project") + '</option><option value="sel"' + (S.sel ? "" : " disabled") + '>' + T("Selection only") + '</option></select></label>' +
			'<label class="au-f"><span>' + T("Loudness on export") + '</span><select id="ex-lufs"><option value="none">' + T("Leave as it is") + '</option><option value="-14">' + T("−14 LUFS, −1 dBTP (YouTube, Spotify)") + '</option><option value="-16">' + T("−16 LUFS, −1 dBTP (podcasts)") + '</option><option value="-23">' + T("−23 LUFS, −1 dBTP (broadcast)") + '</option></select></label>' +
			'<label class="au-f"><span>' + T("File name") + '</span><input type="text" id="ex-name" spellcheck="false"></label>' +
			'<div class="au-row"><button type="button" class="au-btn au-btn--primary" id="ex-go">' + T("⬇ Export") + '</button> ' + '<label class="mes-tp" title="' + esc(T("While this runs, the browser tab shows the percent done and the time left, so you can work in other tabs. Remembered for every MES tool.")) + '"><input type="checkbox" class="mes-tp-ck"' + (!window.MESTabProgress || window.MESTabProgress.enabled() ? " checked" : "") + '> ' + T("Show progress in the browser tab") + '</label>' + '</div><div class="au-note" id="ex-note">' + T("Muted tracks are left out; track volume and pan are applied. Encoding happens in this browser.") + '</div>';
		openPanel(T("Export"), box);
		["fmt", "bits", "kbps", "rate", "ch", "range", "lufs"].forEach(function (k) { var s = $("ex-" + k); if (EX_LS[k] && s.querySelector('option[value="' + EX_LS[k] + '"]:not([disabled])')) s.value = EX_LS[k]; s.onchange = function () { EX_LS[k] = s.value; store("export", EX_LS); vis(); }; });
		$("ex-name").value = S.name || "audio";
		function vis() { var f = $("ex-fmt").value; $("ex-bitsw").hidden = f !== "wav"; $("ex-kbpsw").hidden = f === "wav"; }
		vis(); $("ex-go").onclick = doExport;
	}
	function doExport() {
		var f = $("ex-fmt").value, a = $("ex-range").value === "sel" && S.sel ? S.sel.a : 0, b = $("ex-range").value === "sel" && S.sel ? S.sel.b : projEnd();
		var nch = $("ex-ch").value === "auto" ? null : +$("ex-ch").value;
		var rate = $("ex-rate").value === "same" ? S.sr : +$("ex-rate").value;
		stopAll(); var bz = busy(T("Exporting"));
		makeExport({ f: f, a: a, b: b, nch: nch, rate: rate, name: $("ex-name").value || "audio", lufs: $("ex-lufs").value, bits: +$("ex-bits").value, kbps: +$("ex-kbps").value }, bz).then(function (r) {
			bz.done(); deliver(r.blob, r.name, "save");
		}).catch(function (e) { bz.done(); toast(T("Export failed: {why}", { why: e.message || e })); });
	}
	/* mix + encode; o = { f: wav | mp3 | m4a, a, b, nch (null = automatic), rate, name, lufs ("none" or a target), bits, kbps } */
	function makeExport(o, bz) {
		var f = o.f, rate = o.rate || S.sr, nch = o.nch || (S.tracks.some(function (t) { return !t.mute && (t.nch === 2 || Math.abs(t.pan) > 0.01); }) ? 2 : 1);
		if (f === "mp3") rate = A.mp3Rate(rate);
		return tick().then(function () {
			var mix = A.mix(S.tracks, o.a || 0, o.b == null ? projEnd() : o.b, nch);
			if (o.lufs && o.lufs !== "none") { bz.set(0.1, "Setting loudness"); mix = A.loudnessNormalize(mix, S.sr, +o.lufs, -1).ch; }
			if (rate !== S.sr && D) mix = mix.map(function (c) { return D.resample(c, S.sr, rate); });
			if (f === "wav") return new Blob([A.wav(mix, rate, o.bits || 16)], { type: "audio/wav" });
			if (f === "mp3") return encMp3(mix, rate, o.kbps || 192, bz);
			return encM4a(mix, rate, o.kbps || 192, bz);
		}).then(function (blob) { return { blob: blob, name: A.fileName(o.name || "audio", f) }; });
	}
	/* hand a finished file to the person: the app's native save / share (window.MESAudioNative), the Web Share sheet, or a download */
	function canShareFiles() { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.m4a", { type: "audio/mp4" })] })); } catch (e) { return false; } }
	function deliver(blob, name, mode) {
		var N = window.MESAudioNative, mb = (blob.size / 1048576).toFixed(1) + " MB";
		if (N && N.save) return N.save(blob, name, mode).then(function (r) { toast(r && r.msg ? r.msg : T("Saved {name} ({size})", { name: name, size: mb })); }).catch(function (e) { if (!/cancel/i.test(e && e.message || "")) toast(T("Could not save: {why}", { why: e.message || e })); });
		if (mode === "share" && canShareFiles()) {
			var file = new File([blob], name, { type: blob.type || "application/octet-stream" });
			return navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== "AbortError") { download(blob, name); toast(T("Saved {name} ({size})", { name: name, size: mb })); } });
		}
		download(blob, name); toast(T("Saved {name} ({size})", { name: name, size: mb }));
	}
	function encMp3(ch, rate, kbps, bz) {
		return (window.lamejs ? Promise.resolve() : loadScript(LAME)).then(function () {
			var enc = new window.lamejs.Mp3Encoder(ch.length, rate, kbps), out = [], BLK = 1152 * 40, n = ch[0].length, i = 0;
			return new Promise(function (res, rej) {
				function step() {
					if (bz.signal.aborted) return rej(new Error("Cancelled"));
					var e = Math.min(n, i + BLK * 8);
					for (; i < e; i += BLK) { var j = Math.min(n, i + BLK), l = A.toInt16(ch[0], i, j), r = ch.length > 1 ? A.toInt16(ch[1], i, j) : null, m = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l); if (m.length) out.push(new Uint8Array(m)); }
					bz.set(i / n, "Encoding MP3");
					if (i < n) return setTimeout(step, 0);
					var f = enc.flush(); if (f.length) out.push(new Uint8Array(f)); res(new Blob(out, { type: "audio/mpeg" }));
				}
				step();
			});
		});
	}
	function encM4a(ch, rate, kbps, bz) {
		return (window.Mp4Muxer ? Promise.resolve() : loadScript(MUXER)).then(function () {
			var cfg = { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: ch.length, bitrate: Math.min(320, Math.max(64, kbps)) * 1000 };
			return AudioEncoder.isConfigSupported(cfg).then(function (s) {
				if (!s.supported) throw new Error(T("this browser has no AAC encoder at {rate} Hz; try WAV or MP3", { rate: rate }));
				var M = window.Mp4Muxer, target = new M.ArrayBufferTarget(), mux = new M.Muxer({ target: target, audio: { codec: "aac", numberOfChannels: ch.length, sampleRate: rate }, fastStart: "in-memory" }), err = null;
				var enc = new AudioEncoder({ output: function (c, m) { mux.addAudioChunk(c, m); }, error: function (e) { err = e; } });
				enc.configure(cfg); var n = ch[0].length, B = 4096 * 4, i = 0;
				return new Promise(function (res, rej) {
					function step() {
						if (err) return rej(err); if (bz.signal.aborted) return rej(new Error("Cancelled"));
						var e2 = Math.min(n, i + B * 16);
						for (; i < e2; i += B) { var j = Math.min(n, i + B), len = j - i, buf = new Float32Array(len * ch.length); ch.forEach(function (c, k) { buf.set(c.subarray(i, j), k * len); }); var ad = new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: len, numberOfChannels: ch.length, timestamp: Math.round(i / rate * 1e6), data: buf }); enc.encode(ad); ad.close(); }
						bz.set(i / n, "Encoding AAC");
						if (i < n) return setTimeout(step, 0);
						enc.flush().then(function () { mux.finalize(); res(new Blob([target.buffer], { type: "audio/mp4" })); }, rej);
					}
					step();
				});
			});
		});
	}

	/* ---------------- autosave (IndexedDB) ---------------- */
	var DB = null, saveT = null;
	function db() { return DB = DB || new Promise(function (res, rej) { if (!window.indexedDB) return rej(new Error("no IndexedDB")); var r = indexedDB.open("mes-audio", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function idb(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction("kv", mode), st = tx.objectStore("kv"), q = fn(st); tx.oncomplete = function () { res(q && q.result); }; tx.onerror = function () { rej(tx.error); }; }); }); }
	function schedSave() { clearTimeout(saveT); saveT = setTimeout(save, 2500); }
	function save() {
		if (!S.tracks.length) { idb("readwrite", function (s) { return s.delete("auto"); }).catch(function () {}); return; }
		var data = { v: 1, t: Date.now(), sr: S.sr, name: S.name, markers: S.markers, tracks: S.tracks.map(function (t) { return { id: t.id, name: t.name, nch: t.nch, gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo, clips: t.clips.map(function (c) { return { id: c.id, start: c.start, ch: c.ch }; }) }; }) };
		idb("readwrite", function (s) { return s.put(data, "auto"); }).then(function () { dirty = false; }).catch(function (e) { toast(T("Could not autosave ({why})", { why: e && e.name || T("storage full?") })); });
	}
	function offerRestore() {
		idb("readonly", function (s) { return s.get("auto"); }).then(function (d) {
			if (!d || !d.tracks || !d.tracks.length || S.tracks.length) return;
			var len = d.tracks.reduce(function (m, t) { return Math.max(m, t.clips.reduce(function (mm, c) { return Math.max(mm, c.start + c.ch[0].length); }, 0)); }, 0), ago = Math.round((Date.now() - d.t) / 60000);
			var box = $("au-restore"); box.hidden = false; box.innerHTML = '<button type="button" class="au-btn">' + T("↺ Restore last session") + '</button> <span class="au-note">' + esc(d.name || T("Untitled")) + " · " + T(d.tracks.length > 1 ? "{n} tracks" : "{n} track", { n: d.tracks.length }) + " · " + A.fmtTime(len / d.sr, 0) + " · " + (ago < 1 ? T("saved just now") : ago < 120 ? T("saved {n} min ago", { n: ago }) : T("saved {n} h ago", { n: Math.round(ago / 60) })) + ' </span><button type="button" class="au-btn au-btn--sm" title="' + esc(T("Delete the saved session")) + '">' + T("Forget") + '</button>';
			var bs = box.querySelectorAll("button");
			bs[0].onclick = function () { S.sr = d.sr; S.name = d.name || ""; S.markers = d.markers || []; S.tracks = d.tracks.map(function (t) { return A.track(t); }); H = new A.History(1.5e9); H.push(T("Restore"), snap()); box.hidden = true; afterChange(); zoomFit(); toast(T("Session restored")); };
			bs[1].onclick = function () { idb("readwrite", function (s) { return s.delete("auto"); }); box.hidden = true; };
		}).catch(function () {});
	}
	window.addEventListener("beforeunload", function () { if (dirty) save(); });

	/* ---------------- menus + command search ---------------- */
	var CMDS = [
		{ m: "File", name: T("Open audio or video…"), kb: MOD + "O", fn: function () { $("au-file").click(); } },
		{ m: "File", name: T("Record from microphone"), kb: "R", fn: toggleRec },
		{ m: "File", name: T("Export…"), kb: MOD + "E", fn: openExport },
		{ m: "File", name: T("Export markers as labels (.txt)"), fn: exportLabels },
		{ m: "File", name: T("Load the noisy test clip"), fn: testClip },
		{ m: "File", name: T("Screen Recorder (record screen, camera, voice)…"), fn: function () { window.open("/screen-recorder", "_blank", "noopener"); } },
		{ m: "File", name: T("New project (clear everything)"), fn: function () { if (S.tracks.length && !confirm(T("Clear the whole project? (Undo can bring it back)"))) return; stopAll(); S.tracks = []; S.markers = []; S.sel = null; S.selT = []; S.cursor = 0; commit(T("New project")); } },
		{ m: "Edit", name: T("Undo"), kb: MOD + "Z", fn: undo }, { m: "Edit", name: T("Redo"), kb: MOD + "Shift+Z", fn: redo }, { sep: "Edit" },
		{ m: "Edit", name: T("Cut"), kb: MOD + "X", fn: doCut }, { m: "Edit", name: T("Copy"), kb: MOD + "C", fn: doCopy }, { m: "Edit", name: T("Paste"), kb: MOD + "V", fn: doPaste },
		{ m: "Edit", name: T("Delete"), kb: "Del", keys: "remove", fn: function () { doDelete(); } }, { m: "Edit", name: T("Silence selection"), kb: MOD + "L", keys: "mute", fn: doSilence },
		{ m: "Edit", name: T("Trim to selection"), kb: MOD + "T", keys: "crop keep", fn: doTrim }, { m: "Edit", name: T("Split at cursor / selection"), kb: MOD + "I", keys: "cut clip", fn: doSplit },
		{ m: "Edit", name: T("Insert silence…"), fn: doInsertSilence }, { m: "Edit", name: T("Duplicate selection to a new track"), kb: MOD + "D", fn: doDuplicate }, { sep: "Edit" },
		{ m: "Edit", name: T("Select all"), kb: MOD + "A", fn: selectAll }, { m: "Edit", name: T("Clear selection"), kb: "Esc", fn: function () { S.sel = null; afterSel(); } },
		{ m: "Edit", name: T("Add track"), fn: addTrack }, { m: "Edit", name: T("Add marker"), kb: "M", fn: addMarker }, { m: "Edit", name: T("Markers…"), fn: openMarkers },
		{ m: "Effects", name: T("Effects list…"), kb: "E", fn: openFxList }
	].concat(EFFECTS.map(function (fx) { return { m: "Effects", name: fx.icon + " " + fx.name, keys: fx.keys, kb: fx.id === "noise" ? "N" : "", fn: function () { openFx(fx.id); } }; })).concat([
		{ m: "View", name: T("Zoom in"), kb: "+", fn: function () { zoomAt(2, W / 2); } }, { m: "View", name: T("Zoom out"), kb: "−", fn: function () { zoomAt(0.5, W / 2); } },
		{ m: "View", name: T("Fit project"), kb: "0", fn: zoomFit }, { m: "View", name: T("Zoom to selection"), kb: MOD + "3", fn: zoomSel },
		{ m: "View", name: T("Spectrogram on / off"), kb: "S", fn: function () { S.spec = !S.spec; store("spec", S.spec); draw(); } },
		{ m: "View", name: T("Taller tracks"), keys: "track height bigger resize", fn: function () { setLaneH(S.laneH + 30, true); } }, { m: "View", name: T("Shorter tracks"), keys: "track height smaller resize", fn: function () { setLaneH(S.laneH - 30, true); } },
		{ m: "View", name: T("Fill window"), kb: "F", fn: toggleWin }, { m: "View", name: T("Full screen"), kb: "Shift+F", fn: toggleFs },
		{ m: "Help", name: T("Keyboard shortcuts"), kb: "?", fn: showHelp }, { m: "Help", name: T("About the noise removal"), fn: function () { openPanel(T("About the noise removal"), '<div class="au-note">' + DN.models.map(function (m) { return "<p><b>" + esc(m.name) + "</b> · " + esc(m.licence) + " · " + esc(m.size) + "<br>" + esc(m.note) + "</p>"; }).join("") + "<p>" + T("Everything runs on this device; nothing is uploaded. DeepFilterNet runs on the processor with WebAssembly (one thread).") + "</p></div>"); panel = "about"; } }
	]);
	function buildMenus() {
		var bar = $("au-menus"); bar.innerHTML = "";
		["File", "Edit", "Effects", "View", "Help"].forEach(function (m) {
			var wrap = el("div", { class: "au-menu" }), b = el("button", { type: "button", "aria-haspopup": "true", "aria-expanded": "false" }, esc(T(m))), list = el("div", { class: "au-mlist", role: "menu" }); list.hidden = true;
			CMDS.forEach(function (c) { if (c.sep === m) { list.appendChild(el("hr")); return; } if (c.m !== m) return; var it = el("button", { type: "button", role: "menuitem" }, "<span>" + esc(c.name) + "</span><kbd>" + esc(c.kb || "") + "</kbd>"); it.onclick = function () { closeMenus(); c.fn(); }; list.appendChild(it); });
			b.onclick = function (e) { e.stopPropagation(); var open = list.hidden; closeMenus(); list.hidden = !open; b.setAttribute("aria-expanded", open); if (open) { var f = list.querySelector("button"); if (f) f.focus(); } };
			list.addEventListener("keydown", function (e) { var items = Array.prototype.slice.call(list.querySelectorAll("button")), i = items.indexOf(document.activeElement); if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); } if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } if (e.key === "Escape") { closeMenus(); b.focus(); } });
			wrap.appendChild(b); wrap.appendChild(list); bar.appendChild(wrap);
		});
	}
	function closeMenus() { root.querySelectorAll(".au-mlist").forEach(function (l) { l.hidden = true; }); root.querySelectorAll(".au-menu > button").forEach(function (b) { b.setAttribute("aria-expanded", "false"); }); }
	document.addEventListener("click", function (e) { if (!e.target.closest(".au-menu")) closeMenus(); if (!e.target.closest(".au-search")) $("au-sres").hidden = true; });
	var sq = $("au-search"), sres = $("au-sres"), sIdx = 0, sList = [];
	function searchRender() {
		sList = A.match(CMDS.filter(function (c) { return c.name; }).map(function (c) { return { name: c.name.replace(/^\S+ (?=[A-Z])/, function (x) { return /[A-Za-z]/.test(x[0]) ? x : x; }), keys: (c.keys || "") + " " + c.m, c: c }; }), sq.value).slice(0, 12);
		sres.innerHTML = ""; sIdx = Math.min(sIdx, sList.length - 1);
		sList.forEach(function (it, i) { var b = el("button", { type: "button", role: "option", "aria-selected": i === sIdx }, "<span>" + esc(it.c.name) + ' <small style="opacity:.6">' + esc(T(it.c.m)) + "</small></span><kbd>" + esc(it.c.kb || "") + "</kbd>"); b.onclick = function () { runSearch(i); }; sres.appendChild(b); });
		sres.hidden = !sList.length;
	}
	function runSearch(i) { var it = sList[i]; if (!it) return; sres.hidden = true; sq.value = ""; sq.blur(); it.c.fn(); }
	sq.addEventListener("input", function () { sIdx = 0; searchRender(); }); sq.addEventListener("focus", searchRender);
	sq.addEventListener("keydown", function (e) { if (e.key === "ArrowDown") { e.preventDefault(); sIdx = Math.min(sList.length - 1, sIdx + 1); searchRender(); } else if (e.key === "ArrowUp") { e.preventDefault(); sIdx = Math.max(0, sIdx - 1); searchRender(); } else if (e.key === "Enter") { e.preventDefault(); runSearch(sIdx); } else if (e.key === "Escape") { sres.hidden = true; sq.blur(); } });

	/* ---------------- fill window / full screen ---------------- */
	function toggleWin() { var on = !root.classList.contains("au-win"); if (document.fullscreenElement) document.exitFullscreen(); root.classList.toggle("au-win", on); document.body.classList.toggle("au-noscroll", on); $("au-winbtn").setAttribute("aria-pressed", on); setTimeout(draw, 30); }
	function toggleFs() { if (document.fullscreenElement) return document.exitFullscreen(); if (root.requestFullscreen) root.requestFullscreen().then(function () { setTimeout(draw, 60); }).catch(function () { toggleWin(); }); else toggleWin(); }
	document.addEventListener("fullscreenchange", function () { setTimeout(draw, 60); });

	/* ---------------- keyboard ---------------- */
	document.addEventListener("keydown", function (e) {
		if (!root.isConnected) return; var tg = e.target, typing = tg && (tg.tagName === "INPUT" && !/range|checkbox|button/.test(tg.type) || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable);
		var inEditor = root.contains(tg) || tg === document.body || root.classList.contains("au-win");
		var mod = e.ctrlKey || e.metaKey, k = e.key;
		if (mod && (k === "k" || k === "K")) { if (!inEditor && !root.contains(document.activeElement)) return; e.preventDefault(); sq.focus(); sq.select(); return; }
		/* undo / redo work everywhere in the editor except while typing text (also right after choosing a menu option or moving a slider) */
		var textEntry = tg && ((tg.tagName === "INPUT" && /^(text|search|number|email|url|tel|password)$/i.test(tg.type || "text")) || tg.tagName === "TEXTAREA" || tg.isContentEditable);
		if (mod && /^[zy]$/i.test(k) && !textEntry && inEditor) { e.preventDefault(); (k.toLowerCase() === "y" || e.shiftKey ? redo : undo)(); return; }
		if (typing || !inEditor) return;
		if (k === " ") { e.preventDefault(); togglePlay(); return; }
		if (mod) {
			var lk = k.toLowerCase(), map = { z: e.shiftKey ? redo : undo, y: redo, x: doCut, c: doCopy, v: doPaste, a: selectAll, i: doSplit, t: doTrim, l: doSilence, d: doDuplicate, e: openExport, o: function () { $("au-file").click(); }, 3: zoomSel };
			if (map[lk]) { e.preventDefault(); map[lk](); } return;
		}
		if (e.altKey) return;
		var step = S.sr * (e.shiftKey ? 1 : 1);
		switch (k) {
			case "Delete": case "Backspace": e.preventDefault(); if (rec && e.key === "Backspace") redoRec(); else doDelete(); break;
			case "Escape": if (root.classList.contains("au-win") && !S.sel && !panel) toggleWin(); else if (panel) closePanel(); else { S.sel = null; afterSel(); } break;
			case "Home": e.preventDefault(); setCursor(0); S.start = 0; if (playing) playFrom(0); draw(); break;
			case "End": e.preventDefault(); setCursor(projEnd()); S.start = projEnd() - W * S.spp * 0.9; draw(); break;
			case "ArrowRight": case "ArrowLeft": e.preventDefault(); var d = (k === "ArrowRight" ? 1 : -1) * step;
				if (e.shiftKey) { var a0 = S.sel ? S.sel.a : S.cursor, b0 = S.sel ? S.sel.b : S.cursor; b0 = Math.max(a0, b0 + d); S.sel = b0 > a0 ? { a: a0, b: b0 } : null; if (!S.selT.length) S.selT = S.tracks.map(function (t) { return t.id; }); afterSel(); }
				else { setCursor(Math.max(0, (playing ? playPos() : S.cursor) + d)); if (playing) playFrom(S.cursor); } break;
			case "+": case "=": zoomAt(2, W / 2); break; case "-": case "_": zoomAt(0.5, W / 2); break; case "0": zoomFit(); break;
			case "m": case "M": addMarker(); break; case "[": jumpMarker(-1); break; case "]": jumpMarker(1); break;
			case "r": case "R": toggleRec(); break;
			case "l": case "L": loop = !loop; store("loop", loop); syncUi(); toast(loop ? T("Loop on") : T("Loop off")); break;
			case "s": case "S": S.spec = !S.spec; store("spec", S.spec); draw(); break;
			case "e": case "E": openFxList(); break;
			case "b": case "B": if (preview && preview.playing) setAB(preview.which === "B" ? "A" : "B"); else if (cmp) setCompare(cmp.show === "after" ? "before" : "after"); break;
			case "n": case "N": if (preview && preview.playing && preview.noise) setAB(preview.which === "N" ? "B" : "N"); else if (cmp && isClean(cmp.fid)) setCompare(cmp.show === "noise" ? "after" : "noise"); else openFx("noise"); break;
			case "f": if (!e.shiftKey) toggleWin(); break; case "F": toggleFs(); break;
			case "?": showHelp(); break;
			default: return;
		}
	});

	/* ---------------- drop / buttons ---------------- */
	var dragDepth = 0, dropEl = null;
	root.addEventListener("dragenter", function (e) { if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") < 0) return; e.preventDefault(); dragDepth++; if (!dropEl) { dropEl = el("div", { class: "au-drop" }, esc(T("Drop audio or video to add it as a track"))); root.appendChild(dropEl); } });
	root.addEventListener("dragover", function (e) { if (dropEl) e.preventDefault(); });
	root.addEventListener("dragleave", function () { if (--dragDepth <= 0 && dropEl) { dropEl.remove(); dropEl = null; dragDepth = 0; } });
	root.addEventListener("drop", function (e) { if (!dropEl) return; e.preventDefault(); dropEl.remove(); dropEl = null; dragDepth = 0; openFiles(e.dataTransfer.files); });
	$("au-file").addEventListener("change", function () { openFiles(this.files); this.value = ""; });
	$("au-e-open").onclick = function () { $("au-file").click(); }; $("au-e-rec").onclick = toggleRec; $("au-e-tone").onclick = testClip;
	$("au-undo").onclick = undo; $("au-redo").onclick = redo; $("au-winbtn").onclick = toggleWin; $("au-fsbtn").onclick = toggleFs;
	$("au-noisebtn").onclick = function () { if (!S.tracks.length) { toast(T("Open, record or load the test clip first")); return; } openFx("noise"); };
	$("au-export").onclick = openExport;
	$("au-play").onclick = togglePlay; $("au-stop").onclick = function () { stopAll(); drawOver(); };
	$("au-home").onclick = function () { setCursor(0); S.start = 0; if (playing) playFrom(0); draw(); };
	$("au-end").onclick = function () { setCursor(projEnd()); draw(); };
	$("au-rec").onclick = toggleRec; $("au-recstop").onclick = stopRec; $("au-recredo").onclick = redoRec;
	$("au-loop").onclick = function () { loop = !loop; store("loop", loop); syncUi(); };
	$("au-zin").onclick = function () { zoomAt(2, W / 2); }; $("au-zout").onclick = function () { zoomAt(0.5, W / 2); }; $("au-zfit").onclick = zoomFit; $("au-zsel").onclick = zoomSel;
	$("au-spec").onclick = function () { S.spec = !S.spec; store("spec", S.spec); draw(); };
	$("au-addtrack").onclick = addTrack;
	$("au-vol").oninput = function () { if (master) master.gain.value = +this.value; };
	if (window.ResizeObserver) { var ro = new ResizeObserver(function () { draw(); }); ro.observe(lanes); ro.observe(ruler); } else window.addEventListener("resize", draw);

	/* ---------------- start ---------------- */
	S.spec = !!store("spec"); S.laneH = Math.max(LANE_MIN, Math.min(LANE_MAX, store("laneH") || LANE_DEF));
	dragGrip($("au-agrip"), function () { return areaH || scrollBox.clientHeight; }, function (v) { setAreaH(v); }, function () { store("areaH", areaH); }, function () { setAreaH(0, true); });
	if (areaH) setAreaH(areaH);
	buildMenus(); H.push(T("Start"), snap()); setSimple(simpleWanted(), false); afterChange(); meterClear(); offerRestore(); receiveHandoff();
	/* files handed over by another MES page (MES Screen Recorder's "Open in Audio Editor"): IndexedDB "mes-handoff", same format as MESImg.handoffSend */
	function receiveHandoff() {
		var m = /[?&]handoff=([\w-]+)/.exec(location.search); if (!m || !window.indexedDB) return;
		try { var u = new URL(location.href); u.searchParams.delete("handoff"); history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash); } catch (e) { /* ignore */ }
		var got = null, r = indexedDB.open("mes-handoff", 1);
		r.onupgradeneeded = function () { r.result.createObjectStore("h"); };
		r.onsuccess = function () {
			var db = r.result, t = db.transaction("h", "readwrite"), st = t.objectStore("h"), g = st.get(m[1]);
			g.onsuccess = function () { got = g.result || null; if (got) st.delete(m[1]); };
			t.oncomplete = function () { db.close(); if (!got || !got.files || !got.files.length) { toast(T("The handed-over file was not found (it is kept for an hour).")); return; } openFiles(got.files.filter(function (f) { return f.blob; }).map(function (f) { return new File([f.blob], f.name || "recording.webm", { type: f.type || f.blob.type || "" }); })); };
		};
	}
	window.MESAudioEditor = { state: S, openFiles: openFiles, applyFx: applyFx, effects: EFFECTS, commit: commit, testClip: testClip, makeExport: makeExport, setSimple: setSimple, stopRec: stopRec, isRecording: function () { return !!rec; } };
})();
