/* MES Narration (mes.fm/narration): script -> voice-over with Kokoro stock voices or a Chatterbox copy of the visitor's own voice.
 * The engine (workers, splitting, encoders, saved voices) is /main_js/narrate.js (window.MESNarrate), shared with the Video Editor. */
(function () {
	"use strict";
	var N = window.MESNarrate, $ = function (id) { return document.getElementById(id); };
	if (!N || !$("nr")) return;
	var KEY = "mes-narration:v1", S = { eng: "kokoro", voice: "af_heart", cvoice: null, speed: 1, exag: 0.5, gap: 0.25, pgap: 0.7, gpu: false, text: "", fmt: "mp3", kbps: "128", fname: "narration" };
	try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function toast(m) { if (window.MESToast) return window.MESToast(m); var t = document.querySelector(".tu-toast"); if (!t) { t = document.createElement("div"); t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = m; t.classList.add("is-on"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("is-on"); }, 4500); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmtT(s) { var m = Math.floor(s / 60), r = Math.round(s - m * 60); if (r === 60) { m++; r = 0; } return m + ":" + (r < 10 ? "0" : "") + r; }

	/* ---------- voice controls ---------- */
	var vs = $("nr-voice");
	vs.innerHTML = [["US", "American English"], ["UK", "British English"]].map(function (g) {
		return '<optgroup label="' + g[1] + '">' + N.VOICES.filter(function (v) { return v[2].indexOf(g[0]) === 0; }).map(function (v) { return '<option value="' + v[0] + '">' + v[1] + " (" + v[2].split("· ")[1] + ")</option>"; }).join("") + "</optgroup>";
	}).join("");
	vs.value = S.voice; if (!vs.value) vs.value = "af_heart";
	vs.onchange = function () { S.voice = vs.value; save(); madeLabel(); };
	if (window.MESVoicePicker) try { window.MESVoicePicker.enhance(vs); } catch (e) { /* plain select */ }
	function slider(id, key, fmt) { var el = $(id), out = $(id + "v"); el.value = S[key]; function show() { out.textContent = fmt(+el.value); } show(); el.oninput = function () { S[key] = +el.value; show(); save(); }; }
	slider("nr-speed", "speed", function (v) { return v.toFixed(2) + "×"; });
	slider("nr-exag", "exag", function (v) { return v.toFixed(2); });
	slider("nr-gap", "gap", function (v) { return v.toFixed(2) + " s"; });
	slider("nr-pgap", "pgap", function (v) { return v.toFixed(2) + " s"; });
	$("nr-gpu").checked = !!S.gpu; $("nr-gpu").onchange = function () { S.gpu = this.checked; save(); if (N.isLoaded("kokoro")) toast("Reload the page to switch the voice model to " + (S.gpu ? "the graphics chip" : "the processor") + "."); };

	function setEng(e) {
		S.eng = e; save();
		["stock", "clone"].forEach(function (k) { var on = (k === "clone") === (e === "clone"); $("nr-tab-" + k).setAttribute("aria-selected", on); $("nr-pane-" + k).hidden = !on; });
		if (e === "clone") { checkGpu(); renderVoices(); }
		madeLabel();
	}
	$("nr-tab-stock").onclick = function () { setEng("kokoro"); }; $("nr-tab-clone").onclick = function () { setEng("clone"); };

	var gpu = null;
	function checkGpu() {
		if (gpu) return show();
		var p = navigator.gpu ? navigator.gpu.requestAdapter().then(function (a) { return { gpu: !!a }; }, function () { return { gpu: false }; }) : Promise.resolve({ gpu: false });
		p.then(function (g) { gpu = g; show(); });
		function show() {
			var w = $("nr-cwarn");
			w.className = "nr-warn" + (gpu.gpu ? "" : " is-bad");
			w.innerHTML = N.isLoaded("clone") ? "✓ The voice-copying model is loaded." :
				gpu.gpu ? "The voice-copying model is a <b>one-time download of about 1.5 GB</b> (kept by the browser afterwards). It runs on your graphics chip: on a recent computer a sentence takes a few seconds." :
				"⚠ This browser has no WebGPU, so copying a voice would run on the processor and be <b>very slow</b> (minutes per sentence), after a 1.5 GB download. Use Chrome, Edge, Brave or Opera on a computer for this part, or use the ready-made voices.";
		}
	}

	/* ---------- my voices ---------- */
	var voices = [];
	function renderVoices() {
		return N.listVoices().then(function (l) {
			voices = l; var box = $("nr-voices");
			if (!l.length) { box.innerHTML = '<p class="tu-note">No voice saved yet: add one below.</p>'; $("nr-add").open = true; return; }
			if (!l.some(function (v) { return v.id === S.cvoice; })) S.cvoice = l[0].id;
			box.innerHTML = l.map(function (v) {
				return '<div class="nr-vrow' + (v.id === S.cvoice ? " is-on" : "") + '"><label><input type="radio" name="nr-cv" value="' + v.id + '"' + (v.id === S.cvoice ? " checked" : "") + "> <b>" + esc(v.name) + "</b> <small>" + (v.samples.length / N.SR).toFixed(1) + " s</small></label>" +
					'<button type="button" class="tu-btn tu-btn--ghost nr-sm" data-play="' + v.id + '" title="Play the sample">▶</button><button type="button" class="tu-btn tu-btn--ghost nr-sm" data-del="' + v.id + '" title="Delete this voice" aria-label="Delete ' + esc(v.name) + '">×</button></div>';
			}).join("");
			rowIcons(); madeLabel();
		});
	}
	$("nr-voices").addEventListener("change", function (e) { if (e.target.name === "nr-cv") { S.cvoice = e.target.value; save(); renderVoices(); } });
	$("nr-voices").addEventListener("click", function (e) {
		var p = e.target.closest("[data-play]"), d = e.target.closest("[data-del]");
		if (p) {
			var id = p.getAttribute("data-play");
			if (tmpAudio.dataset.vid === id && tmpAudio.src) { if (tmpAudio.paused || tmpAudio.ended) { if (tmpAudio.ended) tmpAudio.currentTime = 0; tmpAudio.play().catch(function () {}); pv.el.hidden = false; } else tmpAudio.pause(); }
			else { var v = voices.filter(function (x) { return x.id === id; })[0]; if (v) playBlob(new Blob([N.wav(v.samples, N.SR)], { type: "audio/wav" }), "Sample: " + v.name, $("nr-voices"), id); }
		}
		if (d) { var dv = voices.filter(function (x) { return x.id === d.getAttribute("data-del"); })[0]; if (dv && confirm("Delete the voice “" + dv.name + "” from this browser?")) N.deleteVoice(dv.id).then(renderVoices); }
	});
	/* ---------- players: play / pause, seek, speed (one speed for all of them, S.rate) ---------- */
	var RATES = [0.75, 1, 1.25, 1.5, 2], players = [];
	if (RATES.indexOf(S.rate) < 0) S.rate = 1;
	function player(au, host, extra) {
		au.controls = false; au.preload = "metadata"; au.playbackRate = S.rate;
		var el = document.createElement("div"); el.className = "nr-pl";
		el.innerHTML = (extra && extra.label ? '<span class="nr-pl-lab"></span>' : "") +
			'<button type="button" class="tu-btn tu-btn--ghost nr-pl-pp" aria-label="Play">▶\uFE0E</button>' +
			'<span class="nr-pl-t">0:00 / 0:00</span>' +
			'<input type="range" class="nr-pl-seek" min="0" max="1000" step="1" value="0" aria-label="Position">' +
			'<span class="nr-pl-sp" role="group" aria-label="Playback speed">' + RATES.map(function (r) { return '<button type="button" class="nr-pl-r" data-r="' + r + '" aria-pressed="false">' + (r === 1 ? "1×" : r + "×") + "</button>"; }).join("") + "</span>" +
			(extra && extra.close ? '<button type="button" class="tu-btn tu-btn--ghost nr-sm nr-pl-x" aria-label="Close">×</button>' : "");
		host.appendChild(el);
		var pp = el.querySelector(".nr-pl-pp"), tt = el.querySelector(".nr-pl-t"), sk = el.querySelector(".nr-pl-seek"), drag = false, raf = 0;
		function dur() { return isFinite(au.duration) ? au.duration : 0; }
		function paint() {
			var d = dur(), c = au.currentTime || 0; tt.textContent = fmtT(c) + " / " + fmtT(d);
			if (!drag) sk.value = d ? Math.round(c / d * 1000) : 0;
			var on = !au.paused && !au.ended; pp.textContent = on ? "❚❚" : "▶\uFE0E"; pp.setAttribute("aria-label", on ? "Pause" : "Play"); el.classList.toggle("is-on", on);
		}
		function loop() { paint(); if (!au.paused) raf = requestAnimationFrame(loop); }
		function rates() { el.querySelectorAll(".nr-pl-r").forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-r") === S.rate ? "true" : "false"); }); }
		pp.onclick = function () { if (au.paused || au.ended) { if (au.ended) au.currentTime = 0; au.play().catch(function () {}); } else au.pause(); };
		sk.oninput = function () { drag = true; var d = dur(); if (d) { au.currentTime = sk.value / 1000 * d; tt.textContent = fmtT(au.currentTime) + " / " + fmtT(d); } };
		sk.onchange = function () { drag = false; paint(); };
		el.querySelector(".nr-pl-sp").onclick = function (e) { var b = e.target.closest("[data-r]"); if (!b) return; S.rate = +b.getAttribute("data-r"); save(); players.forEach(function (q) { q.au.playbackRate = S.rate; q.rates(); }); };
		["play", "pause", "ended", "loadedmetadata", "durationchange", "seeked", "emptied"].forEach(function (ev) { au.addEventListener(ev, function () { au.playbackRate = S.rate; cancelAnimationFrame(raf); if (!au.paused) loop(); else paint(); }); });
		var x = el.querySelector(".nr-pl-x"); if (x) x.onclick = function () { au.pause(); el.hidden = true; };
		rates(); paint();
		var api = { el: el, au: au, rates: rates, paint: paint, label: function (t) { var l = el.querySelector(".nr-pl-lab"); if (l) l.textContent = t; } };
		players.push(api); return api;
	}
	// one preview player for voice samples and "Hear this voice"; it moves next to whatever started it
	var tmpAudio = new Audio(), pv = player(tmpAudio, document.createElement("div"), { label: true, close: true }); pv.el.classList.add("nr-pl--pv"); pv.el.hidden = true;
	function playBlob(b, label, after, vid) {
		try { URL.revokeObjectURL(tmpAudio.src); } catch (e) {}
		tmpAudio.src = URL.createObjectURL(b); tmpAudio.dataset.vid = vid || "";
		pv.label(label || "Preview"); if (after) after.insertAdjacentElement("afterend", pv.el); pv.el.hidden = false;
		tmpAudio.play().catch(function () {});
	}
	// the ▶ on a saved voice's row shows ❚❚ while its sample plays, and pauses / resumes it
	function rowIcons() {
		var on = !tmpAudio.paused && !tmpAudio.ended ? tmpAudio.dataset.vid : "";
		document.querySelectorAll("#nr-voices [data-play]").forEach(function (b) { var me = b.getAttribute("data-play") === on; b.textContent = me ? "❚❚" : "▶\uFE0E"; b.title = me ? "Pause the sample" : "Play the sample"; });
	}
	["play", "pause", "ended", "emptied"].forEach(function (ev) { tmpAudio.addEventListener(ev, rowIcons); });
	player($("nr-sampleplay"), $("nr-sampleplay").parentNode).el.classList.add("nr-pl--sample");
	$("nr-sampleplay").insertAdjacentElement("afterend", players[players.length - 1].el);

	var sample = null, rec = null;
	function gotSample(blob) {
		$("nr-rect").textContent = "Reading the recording…";
		N.decodeSample(blob).then(function (a) {
			var sec = a.length / N.SR;
			if (sec < 3) { $("nr-rect").textContent = "That is only " + sec.toFixed(1) + " s of sound: record at least 10 seconds."; return; }
			sample = a; $("nr-sample").hidden = false; $("nr-sampleplay").src = URL.createObjectURL(new Blob([N.wav(a, N.SR)], { type: "audio/wav" }));
			$("nr-rect").textContent = sec.toFixed(1) + " s" + (sec < 8 ? " (a bit short: 10 to 20 s copies the voice better)" : sec >= 24.9 ? " (the first 25 s are used)" : "") + ". Listen, then save it.";
		}, function (e) { $("nr-rect").textContent = e.message; });
	}
	$("nr-upload").onchange = function () { if (this.files[0]) gotSample(this.files[0]); this.value = ""; };
	$("nr-rec").onclick = function () {
		var b = this;
		if (rec) { rec.stop(); return; }
		if (!navigator.mediaDevices || !window.MediaRecorder) return toast("This browser cannot record here: upload a clip instead.");
		navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } }).then(function (st) {
			var chunks = [], t0 = Date.now(), tm;
			rec = new MediaRecorder(st); rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
			rec.onstop = function () { clearInterval(tm); st.getTracks().forEach(function (t) { t.stop(); }); rec = null; b.textContent = "● Record again"; b.classList.remove("is-rec"); gotSample(new Blob(chunks, { type: chunks[0] ? chunks[0].type : "audio/webm" })); };
			rec.start(); b.textContent = "■ Stop"; b.classList.add("is-rec");
			tm = setInterval(function () { var s = (Date.now() - t0) / 1000; $("nr-rect").textContent = "Recording… " + s.toFixed(0) + " s" + (s < 10 ? " (keep going to about 15 s)" : s < 20 ? " (good: stop whenever you like)" : ""); if (s >= 25 && rec) rec.stop(); }, 250);
		}, function () { toast("The microphone was not allowed: allow it in the address bar, or upload a clip."); });
	};
	$("nr-vsave").onclick = function () {
		if (!sample) return; if (!$("nr-consent").checked) { toast("Tick the box to confirm it is your own voice (or that you have permission)."); $("nr-consent").focus(); return; }
		N.saveVoice({ name: ($("nr-vname").value || "My voice").slice(0, 40), samples: sample, sr: N.SR }).then(function (v) {
			S.cvoice = v.id; save(); sample = null; $("nr-sample").hidden = true; $("nr-rect").textContent = ""; $("nr-add").open = false; renderVoices(); toast("Saved “" + v.name + "”. Type a script and press Make the narration.");
		}, function (e) { toast("Could not save: " + e.message); });
	};

	/* ---------- script ---------- */
	var ta = $("nr-text");
	ta.value = S.text || "Welcome back to MES. In this video we will solve three problems step by step.\n\nFirst, let's write down what we know. [pause 1] Then we will pick the right formula and check the answer at the end.";
	function count() { var t = ta.value, words = (t.match(/\S+/g) || []).length; $("nr-count").textContent = t.length.toLocaleString() + " characters · " + words.toLocaleString() + " words · about " + fmtT(words / 2.5) + " spoken"; }
	ta.oninput = function () { S.text = ta.value; save(); count(); }; count();

	function opts() { return { engine: S.eng, voice: S.eng === "clone" ? S.cvoice : S.voice, speed: S.speed, exaggeration: S.exag, gap: S.gap, paraGap: S.pgap, gpu: S.gpu }; }
	function progress(on, frac, txt, busyBar) {
		$("nr-prog").hidden = !on; $("nr-prog").classList.toggle("is-busy", !!busyBar);
		$("nr-barfill").style.width = busyBar ? "" : Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + "%"; $("nr-progt").textContent = txt || "";
	}
	/* Time estimates, learned on this computer (localStorage): how long getting the model ready takes after the download, and how long a line
	   takes = a + b x letters, scaled by k (the ratio of real to estimated time, averaged over the last lines). */
	var EKEY = KEY + ":eta", E = { prep: { clone: 25, kokoro: 4 }, k: { clone: 1, kokoro: 1 } };
	try { var e0 = JSON.parse(localStorage.getItem(EKEY)); if (e0 && e0.prep && e0.k) E = e0; } catch (e) { /* ignore */ }
	function saveE() { try { localStorage.setItem(EKEY, JSON.stringify(E)); } catch (e) { /* ignore */ } }
	var LINE = { clone: [1.4, 0.065], kokoro: [0.15, 0.012] };
	function lineEst(eng, text, gpu) { var c = LINE[eng] || LINE.kokoro, f = eng === "kokoro" && !gpu ? 2.5 : 1; return (c[0] + c[1] * String(text).length) * f * (E.k[eng] || 1); }
	function left(sec) { sec = Math.max(1, Math.round(sec)); return sec < 60 ? "about " + sec + " s left" : "about " + fmtT(sec) + " left"; }
	function loadMsg(f, L, T) { return "Downloading the voice model, one time only: " + (T ? Math.round(L / 1048576) + " of " + Math.round(T / 1048576) + " MB" : Math.round(f * 100) + "%"); }

	var busy = false, ctrl = null, last = null;
	function run() {
		if (busy) return; var text = ta.value.trim(); if (!text) { toast("Type a script first."); ta.focus(); return; }
		var o = opts(); if (S.eng === "clone" && !o.voice) { toast("Add and save your voice first (My own voice → Add a voice)."); setEng("clone"); return; }
		busy = true; ctrl = new AbortController(); o.signal = ctrl.signal; $("nr-go").disabled = true; $("nr-stop").hidden = false;
		var t0 = performance.now(), tp = window.MESTabProgress ? window.MESTabProgress.task("Narration") : null, eng = o.engine;
		// what is happening now: "dl" downloading, "prep" model being set up on the graphics chip (no progress events), "speak" making lines
		var P = { ph: N.isLoaded(eng) ? "speak" : "dl", f: 0, L: 0, T: 0, lastEv: performance.now(), dlT0: performance.now(), dlL0: 0, prepT0: 0,
			lines: N.split(text, eng === "clone" ? 150 : 260, eng === "clone").filter(function (x) { return x.text; }), i: 0, lineT0: 0, inLine: false };
		P.est = P.lines.map(function (x) { return lineEst(eng, x.text, o.gpu); });
		function sum(a, b) { return a + b; }
		function tick() {
			var now = performance.now(), sec = (now - t0) / 1000, tag = " · " + fmtT(sec) + " so far";
			if (P.ph === "dl") {
				if (P.T && P.f >= 0.995 || P.L && now - P.lastEv > 4000) { P.ph = "prep"; P.prepT0 = now; }
				else {
					var spd = (P.L - P.dlL0) / Math.max(0.5, (now - P.dlT0) / 1000), rest = P.T && spd > 0 ? (P.T - P.L) / spd : 0;
					progress(true, P.f, (P.L ? loadMsg(P.f, P.L, P.T) + (rest > 2 ? " · " + left(rest + E.prep[eng]) : "") : "Opening the voice model…") + tag);
					if (tp) tp.set(P.f * 0.6); return;
				}
			}
			if (P.ph === "prep") {
				var w = (now - P.prepT0) / 1000, ex = E.prep[eng] || 20;
				progress(true, 0, "Getting the voice model ready on your " + (eng === "clone" || o.gpu ? "graphics chip" : "processor") + " (this can take " + (ex < 60 ? Math.round(ex) + " s" : fmtT(ex)) + ", the page is not stuck): " +
					(w < ex ? left(ex - w) : "almost there…") + tag, true);
				return;
			}
			// speaking: finished lines + the share of the current line that has probably been done
			var tot = P.est.reduce(sum, 0), done = P.est.slice(0, P.i).reduce(sum, 0), cur = P.est[P.i] || 0, inl = P.inLine ? Math.min(cur * 0.95, (now - P.lineT0) / 1000) : 0;
			var frac = tot ? (done + inl) / tot : 1, it = P.lines[P.i];
			progress(true, frac, (it ? "Speaking line " + (P.i + 1) + " of " + P.lines.length + ": “" + it.text.slice(0, 50) + (it.text.length > 50 ? "…" : "") + "” · " + left(tot - done - inl) : "Joining the lines…") + tag);
			if (tp) tp.set(frac);
		}
		var timer = setInterval(tick, 250);
		o.onProgress = function (f, L, T) { if (P.ph === "prep" && f < 0.99 && L > P.L) P.ph = "dl"; P.f = f; P.L = L; P.T = T; P.lastEv = performance.now(); if (!P.dlL0 && L) { P.dlL0 = L; P.dlT0 = performance.now(); } tick(); };
		o.onPiece = function (i, n, it) {
			var now = performance.now();
			if (P.ph !== "speak") { if (P.ph === "prep") { E.prep[eng] = Math.round((E.prep[eng] * 0.4 + (now - P.prepT0) / 1000 * 0.6) * 10) / 10; saveE(); } P.ph = "speak"; }
			if (!P.inLine) { P.i = i; P.inLine = true; P.lineT0 = now; }
			else {   // a line finished: learn from it (cached lines come back at once and teach nothing)
				var took = (now - P.lineT0) / 1000, est = P.est[P.i] || 0;
				if (took > 0.3 && est) { E.k[eng] = Math.max(0.2, Math.min(6, (E.k[eng] || 1) * 0.6 + (E.k[eng] || 1) * (took / est) * 0.4)); saveE(); for (var j = P.i + 1; j < P.est.length; j++) P.est[j] = lineEst(eng, P.lines[j].text, o.gpu); }
				P.est[P.i] = took; P.inLine = false; P.i = i;
			}
			tick();
		};
		tick();
		N.speak(text, o).then(function (r) {
			last = { r: r, o: o, text: text }; showResult(); progress(false);
			if (tp) tp.done("Narration ready");
			toast("Done in " + ((performance.now() - t0) / 1000).toFixed(1) + " s: " + fmtT(r.audio.length / r.sr) + " of speech.");
		}, function (e) {
			progress(false); if (tp) tp.fail(e.message);
			if (!/Stopped/.test(e.message)) toast("Could not make the narration: " + e.message + (o.engine === "clone" ? " (try a shorter script, or the ready-made voices)" : ""));
		}).then(function () { clearInterval(timer); busy = false; $("nr-go").disabled = false; $("nr-stop").hidden = true; });
	}
	$("nr-go").onclick = run;
	$("nr-stop").onclick = function () { if (ctrl) ctrl.abort(); progress(true, 0, "Stopping after this line…"); };
	$("nr-hear").onclick = function () {
		var b = this; b.disabled = true; var v = N.VOICES.filter(function (x) { return x[0] === vs.value; })[0];
		N.load("kokoro", { gpu: S.gpu, onProgress: function (f, L, T) { progress(true, f, loadMsg(f, L, T)); } }).then(function () {
			progress(true, 0, "Making the sample…", true); return N.speakOne("Hi, I'm " + (v ? v[1] : "this voice") + ". This is how I sound reading your script.", { engine: "kokoro", voice: vs.value, speed: S.speed });
		}).then(function (a) { progress(false); playBlob(new Blob([N.wav(a, N.SR)], { type: "audio/wav" }), "Voice: " + (v ? v[1] : vs.value), b.closest(".nr-row") || b, ""); }, function (e) { progress(false); toast("Could not load the voice: " + e.message); }).then(function () { b.disabled = false; });
	};

	/* ---------- result ---------- */
	var outUrl = null, resP = player($("nr-play"), $("nr-out")); resP.el.classList.add("nr-pl--big"); $("nr-play").insertAdjacentElement("afterend", resP.el);
	// which voice the result was made with, and a warning when the picked voice / tab is now a different one
	function voiceName(o) {
		if (o.engine === "clone") { var v = voices.filter(function (x) { return x.id === o.voice; })[0]; return (v ? v.name : "your voice") + " (my own voice)"; }
		var k = N.VOICES.filter(function (x) { return x[0] === o.voice; })[0]; return (k ? k[1] : o.voice) + " (ready-made voice)";
	}
	function madeLabel() {
		var el = $("nr-made"); if (!el || !last) return;
		var now = opts(), same = now.engine === last.o.engine && now.voice === last.o.voice;
		el.className = "nr-made" + (same ? "" : " is-other");
		el.innerHTML = "Made with <b>" + esc(voiceName(last.o)) + "</b>." + (same ? "" : " You have picked <b>" + esc(now.voice ? voiceName(now) : "My own voice") + "</b> now: press Make the narration to hear the script in that voice.");
	}
	function showResult() {
		var r = last.r; $("nr-out").hidden = false; $("nr-dur").textContent = fmtT(r.audio.length / r.sr); madeLabel();
		if (outUrl) URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(new Blob([N.wav(r.audio, r.sr)], { type: "audio/wav" })); $("nr-play").src = outUrl;
		$("nr-pieces").innerHTML = r.pieces.map(function (p, i) {
			return '<li><button type="button" class="tu-btn tu-btn--ghost nr-sm" data-at="' + i + '" title="Play from here">▶ ' + fmtT(p.start) + '</button><span class="nr-ptext">' + esc(p.text) + '</span>' + (last.o.engine === "clone" ? '<button type="button" class="tu-btn tu-btn--ghost nr-sm" data-redo="' + i + '" title="Say this line again (a new take)">↻ Again</button>' : "") + "</li>";
		}).join("");
		$("nr-out").scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
	$("nr-pieces").addEventListener("click", function (e) {
		var a = e.target.closest("[data-at]"), rd = e.target.closest("[data-redo]");
		if (a) { var p = last.r.pieces[+a.getAttribute("data-at")], au = $("nr-play"); au.currentTime = p.start; au.play().catch(function () {}); }
		if (rd && !busy) { var q = last.r.pieces[+rd.getAttribute("data-redo")]; N.forget(last.o, q.text); ta.value = last.text; run(); }
	});
	var fmt = $("nr-fmt"), kb = $("nr-kbps"), fn = $("nr-fname");
	fmt.value = S.fmt; kb.value = S.kbps; fn.value = S.fname;
	if (typeof window.AudioEncoder !== "function") { fmt.querySelector('[value="m4a"]').disabled = true; if (fmt.value === "m4a") fmt.value = "mp3"; }
	function vis() { kb.parentNode.hidden = fmt.value === "wav"; }
	fmt.onchange = function () { S.fmt = fmt.value; save(); vis(); }; kb.onchange = function () { S.kbps = kb.value; save(); }; fn.oninput = function () { S.fname = fn.value; save(); }; vis();
	function fileName() { return ((fn.value || "narration").replace(/[\\/:*?"<>|]+/g, "-").replace(/\.(mp3|m4a|wav)$/i, "") || "narration") + "." + fmt.value; }
	function download(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000); }
	$("nr-dl").onclick = function () {
		if (!last) return; var b = this; b.disabled = true;
		N.encode(last.r.audio, last.r.sr, fmt.value, +kb.value).then(function (blob) { download(blob, fileName()); toast("Saved " + fileName() + " (" + (blob.size / 1048576).toFixed(2) + " MB)"); }, function (e) { toast(e.message); }).then(function () { b.disabled = false; });
	};
	// hand the narration to the Video Editor (IndexedDB "mes-handoff", like the photo tools): the editor adds it at the playhead
	$("nr-tovideo").onclick = function () {
		if (!last) return; var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) { /* blocked */ }
		var blob = new Blob([N.wav(last.r.audio, last.r.sr)], { type: "audio/wav" }), name = (fn.value || "narration").replace(/\.(mp3|m4a|wav)$/i, "") + ".wav";
		var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
		new Promise(function (res, rej) { var r = indexedDB.open("mes-handoff", 1); r.onupgradeneeded = function () { r.result.createObjectStore("h"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }).then(function (db) {
			return new Promise(function (res, rej) { var t = db.transaction("h", "readwrite"); t.objectStore("h").put({ t: Date.now(), files: [{ name: name, type: "audio/wav", blob: blob }] }, id); t.oncomplete = function () { db.close(); res(); }; t.onerror = function () { rej(t.error); }; });
		}).then(function () { var url = "/video?handoff=" + id; if (w && !w.closed) w.location.href = url; else location.href = url; }, function (e) { if (w) w.close(); toast("Could not hand it over: " + e.message); });
	};

	setEng(S.eng);
})();
