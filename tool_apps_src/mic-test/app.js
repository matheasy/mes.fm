/* MES Mic Test UI. Maths = MESMic in lib.js (prepended above). Settings (chosen mic, processing ticks, test volume) in localStorage mes-mic-test:v1.
   Audio never leaves the browser: the mic goes into an AudioContext (analysers only, never to the speakers) and an optional 10 s MediaRecorder clip. */
(function () {
	'use strict';
	var M = MESMic, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-mic-test:v1';
	var S = { dev: '', agc: false, ns: false, ec: false, vol: 25 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
	var toastT; function toast(m) { var t = $('mk-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2400); }
	var AC = window.AudioContext || window.webkitAudioContext;

	var ctx = null, stream = null, src = null, split = null, an = [], chans = 1, raf = 0, last = 0, devices = [];
	var bufs = [], disp = [-Infinity, -Infinity], holds = [new M.Hold(1500, 20), new M.Hold(1500, 20)], rmsSm = [-Infinity, -Infinity];
	var hist = [], clipLit = false, floorDb = null, nfCollect = null, specAn = null, specBuf = null;
	$('mk-agc').checked = S.agc; $('mk-ns').checked = S.ns; $('mk-ec').checked = S.ec;

	function constraints() {
		var a = { echoCancellation: S.ec, noiseSuppression: S.ns, autoGainControl: S.agc, channelCount: { ideal: 2 } };
		if (S.dev) a.deviceId = { exact: S.dev };
		return { audio: a, video: false };
	}
	function startMic() {
		$('mk-err').textContent = '';
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !AC) { $('mk-err').textContent = 'This browser cannot use the microphone here. Try Chrome, Edge, Firefox or Safari over https.'; return; }
		stopMic();
		navigator.mediaDevices.getUserMedia(constraints()).catch(function (e) {
			/* a saved device that is gone: try the default one */
			if (S.dev && e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) { S.dev = ''; save(); return navigator.mediaDevices.getUserMedia(constraints()); }
			throw e;
		}).then(function (st) {
			stream = st;
			if (!ctx) ctx = new AC(); if (ctx.state === 'suspended') ctx.resume();
			var tr = st.getAudioTracks()[0], set = tr && tr.getSettings ? tr.getSettings() : {};
			chans = Math.min(2, set.channelCount || 1);
			src = ctx.createMediaStreamSource(st);
			/* the source may still give 2 channels when settings say nothing: trust channelCount when present, else check the node */
			if (!set.channelCount) chans = Math.min(2, src.channelCount || 1);
			split = ctx.createChannelSplitter(2); src.connect(split);
			an = []; bufs = [];
			for (var i = 0; i < chans; i++) { var a = ctx.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0; split.connect(a, i); an.push(a); bufs.push(new Float32Array(a.fftSize)); }
			specAn = ctx.createAnalyser(); specAn.fftSize = 2048; specAn.smoothingTimeConstant = 0.2; src.connect(specAn); specBuf = new Uint8Array(specAn.frequencyBinCount);
			if (tr) { S.dev = set.deviceId || S.dev; tr.onended = function () { $('mk-err').textContent = 'The microphone stopped (unplugged?). Press Start again.'; stopMic(); }; }
			info(tr, set);
			$('mk-go').textContent = '■ Stop the microphone'; $('mk-go').classList.add('mk-on');
			hist = []; clipLit = false; paintClip();
			listDevices();
			last = performance.now(); loop();
		}).catch(function (e) {
			var n = e && e.name;
			$('mk-err').textContent = n === 'NotAllowedError' ? 'The microphone is blocked. Click the lock or mic icon in the address bar, allow the microphone, then press Start again. On a Mac also check System Settings > Privacy & Security > Microphone for your browser.' :
				n === 'NotFoundError' ? 'No microphone found. Plug it in, then press Start again.' :
				n === 'NotReadableError' ? 'The microphone is busy or failed to start. Close other apps using it and try again.' : 'Could not start the microphone' + (e && e.message ? ': ' + e.message : '.');
		});
	}
	function stopMic() {
		cancelAnimationFrame(raf); raf = 0;
		if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
		try { src && src.disconnect(); } catch (e) {}
		stream = null; src = null; an = [];
		$('mk-go').textContent = '🎙 Start the microphone'; $('mk-go').classList.remove('mk-on');
		disp = [-Infinity, -Infinity]; rmsSm = [-Infinity, -Infinity]; holds = [new M.Hold(1500, 20), new M.Hold(1500, 20)]; drawMeter([]);
	}
	$('mk-go').onclick = function () { if (stream) stopMic(); else startMic(); };
	['agc', 'ns', 'ec'].forEach(function (k) { $('mk-' + k).onchange = function () { S[k] = this.checked; save(); if (stream) startMic(); }; });

	function info(tr, set) {
		var bits = [];
		if (tr && tr.label) bits.push('<b>' + esc(tr.label) + '</b>');
		bits.push((set.sampleRate || (ctx && ctx.sampleRate)) + ' Hz');
		bits.push(chans === 2 ? '2 channels (stereo)' : '1 channel (mono)');
		if (set.sampleSize) bits.push(set.sampleSize + '-bit');
		var proc = [];
		if (set.autoGainControl) proc.push('auto gain'); if (set.noiseSuppression) proc.push('noise suppression'); if (set.echoCancellation) proc.push('echo cancellation');
		bits.push(proc.length ? 'Browser is applying: ' + proc.join(', ') : 'No browser processing');
		if (set.latency) bits.push('latency ' + Math.round(set.latency * 1000) + ' ms');
		$('mk-info').innerHTML = bits.join(' · ');
	}
	function listDevices() {
		if (!navigator.mediaDevices.enumerateDevices) return;
		navigator.mediaDevices.enumerateDevices().then(function (ds) {
			devices = ds.filter(function (d) { return d.kind === 'audioinput'; });
			$('mk-dsearch').hidden = devices.length <= 6;
			fillDevices();
		});
	}
	function fillDevices() {
		var list = M.filterDevices(devices, $('mk-dsearch').value), cur = S.dev;
		if (cur && !list.some(function (d) { return d.deviceId === cur; })) { var c = devices.filter(function (d) { return d.deviceId === cur; })[0]; if (c) list.unshift(c); }
		$('mk-dev').innerHTML = list.length ? list.map(function (d, i) { return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' + esc(d.label || ('Microphone ' + (i + 1))) + (d.deviceId === 'default' ? '' : '') + '</option>'; }).join('') : '<option value="">No match</option>';
	}
	$('mk-dsearch').oninput = fillDevices;
	$('mk-dev').onchange = function () { S.dev = this.value; save(); startMic(); };
	if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function () { if (stream) listDevices(); });

	/* ---------- meter loop ---------- */
	function loop() {
		raf = requestAnimationFrame(loop);
		var now = performance.now(), dt = Math.min(200, now - last); last = now;
		var lv = [];
		for (var i = 0; i < an.length; i++) {
			an[i].getFloatTimeDomainData(bufs[i]);
			var p = M.linToDb(M.peak(bufs[i])), r = M.linToDb(M.rms(bufs[i]));
			disp[i] = M.decay(disp[i], p, dt, 20);
			rmsSm[i] = M.decay(rmsSm[i], r, dt, 30);
			var hv = holds[i].update(p, dt);
			if (p >= M.TARGET.clip) { clipLit = true; paintClip(); }
			lv.push({ p: p, r: r, d: disp[i], rs: rmsSm[i], h: hv });
		}
		if (!lv.length) return;
		var pk = Math.max.apply(null, lv.map(function (x) { return x.p; })), rm = M.linToDb(Math.sqrt(lv.reduce(function (s, x) { return s + Math.pow(10, x.r / 10); }, 0) / lv.length));
		hist.push({ t: now, p: pk, r: rm, clip: pk >= M.TARGET.clip });
		while (hist.length && hist[0].t < now - 4000) hist.shift();
		if (nfCollect) nfCollect.push(rm);
		drawMeter(lv);
		$('mk-pk').textContent = M.fmtDb(Math.max.apply(null, lv.map(function (x) { return x.d; })));
		$('mk-rms').textContent = M.fmtDb(Math.max.apply(null, lv.map(function (x) { return x.rs; })));
		$('mk-hold').textContent = M.fmtDb(Math.max.apply(null, lv.map(function (x) { return x.h; })));
		verdictTick(now);
		if (lv.length === 2 && now - stereoT > 500) { stereoT = now; stereo(); }
		drawSpec();
	}
	var verdictT = 0, stereoT = 0;
	function verdictTick(now) {
		if (now - verdictT < 250) return; verdictT = now;
		var pk = -Infinity, clips = 0; hist.forEach(function (h) { if (h.p > pk) pk = h.p; if (h.clip) clips++; });
		var sp = M.speechLevel(hist.map(function (h) { return h.r; }), floorDb);
		var spDb = sp.frames >= 8 ? sp.db : null;
		$('mk-sp').textContent = spDb == null ? '–' : M.fmtDb(spDb);
		var v = M.verdict({ peak: pk, speech: spDb, clips: clips });
		$('mk-verdict').className = 'mk-verdict mk-v--' + v.k; $('mk-vw').textContent = v.word;
		$('mk-vt').textContent = v.tip + (spDb != null && v.k !== 'clip' ? ' (talking about ' + M.fmtDb(spDb, 0) + ', peaks ' + M.fmtDb(pk, 0) + ' dBFS)' : '');
	}
	function stereo() {
		var l = M.linToDb(M.rms(bufs[0])), r = M.linToDb(M.rms(bufs[1])), c = M.correlation(bufs[0], bufs[1]);
		$('mk-stereo').textContent = M.stereoCheck(2, l, r, c).text;
	}
	function paintClip() { $('mk-clip').classList.toggle('on', clipLit); $('mk-clip').setAttribute('aria-pressed', String(clipLit)); }
	$('mk-clip').onclick = function () { clipLit = false; paintClip(); holds.forEach(function (h) { h.v = -Infinity; }); };

	var mc = $('mk-meter');
	function cssv(n, d) { var v = getComputedStyle($('mk')).getPropertyValue(n).trim(); return v || d; }
	function drawMeter(lv) {
		var W = mc.parentNode.clientWidth, rows = Math.max(1, lv.length || chans), barH = W < 500 ? 22 : 30, gap = 6, top = 18, H = top + rows * barH + (rows - 1) * gap + 22, dpr = window.devicePixelRatio || 1;
		if (!W) return;
		if (mc.width !== Math.round(W * dpr) || mc.height !== Math.round(H * dpr)) { mc.width = Math.round(W * dpr); mc.height = Math.round(H * dpr); mc.style.width = W + 'px'; mc.style.height = H + 'px'; }
		var c = mc.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
		var L = 18, Rr = 8, w = W - L - Rr, X = function (db) { return L + M.meterPos(db) * w; }, T = M.TARGET;
		var fg = cssv('--mk-fg', '#222'), muted = cssv('--mk-muted', '#5b6573');
		/* target band: average -18..-12 (solid) up to the -6 peak (lighter) */
		c.fillStyle = 'rgba(37,99,235,0.16)'; c.fillRect(X(T.rmsIdealLo), top - 14, X(T.peakIdeal) - X(T.rmsIdealLo), 10);
		c.fillStyle = 'rgba(37,99,235,0.45)'; c.fillRect(X(T.rmsIdealLo), top - 14, X(T.rmsIdealHi) - X(T.rmsIdealLo), 10);
		c.fillStyle = fg; c.font = '11px system-ui, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
		if (W > 420) c.fillText('target', X(T.peakIdeal) + 4, top - 9);
		var zones = [[M.FLOOR, -20, '#1f7a2e', '#4ade80'], [-20, -9, '#7a6a14', '#facc15'], [-9, 0, '#7a1f1f', '#ef4444']];
		for (var i = 0; i < rows; i++) {
			var y = top + i * (barH + gap), x = lv[i] || { d: -Infinity, rs: -Infinity, h: -Infinity };
			zones.forEach(function (z) { c.fillStyle = z[2]; c.fillRect(X(z[0]), y, X(z[1]) - X(z[0]), barH); });
			zones.forEach(function (z) { var a = X(z[0]), b = Math.min(X(z[1]), X(x.d)); if (b > a) { c.fillStyle = z[3]; c.fillRect(a, y, b - a, barH); } });
			/* RMS = a dark band through the middle of the bar, peak hold = a tick */
			if (isFinite(x.rs)) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(L, y + barH * 0.38, X(x.rs) - L, barH * 0.24); }
			if (isFinite(x.h) && x.h > M.FLOOR) { c.fillStyle = M.zone(x.h) === 'red' ? '#ff6b6b' : '#ffffff'; c.fillRect(X(x.h) - 1.5, y, 3, barH); }
			c.fillStyle = fg; c.textAlign = 'center'; c.font = 'bold 11px system-ui, sans-serif'; if (rows === 2) c.fillText(i ? 'R' : 'L', 8, y + barH / 2);
		}
		var yb = top + rows * barH + (rows - 1) * gap + 4;
		c.font = '11px system-ui, sans-serif'; c.textBaseline = 'top'; c.fillStyle = muted;
		for (var d = M.FLOOR; d <= 0; d += 5) { var xx = X(d); c.fillRect(Math.round(xx), yb, 1, 4); if (d % 10 === 0 || W > 700) { c.textAlign = d === 0 ? 'right' : d === M.FLOOR ? 'left' : 'center'; c.fillText(String(d), xx, yb + 5); } }
	}
	if (window.ResizeObserver) new ResizeObserver(function () { drawMeter([]); }).observe(mc.parentNode);

	/* ---------- noise floor ---------- */
	$('mk-nf').onclick = function () {
		if (!stream) { toast('Start the microphone first'); return; }
		var b = this, left = 3; b.disabled = true; nfCollect = [];
		$('mk-nfout').textContent = 'Stay quiet… 3';
		var iv = setInterval(function () {
			left--; if (left > 0) { $('mk-nfout').textContent = 'Stay quiet… ' + left; return; }
			clearInterval(iv); b.disabled = false;
			var d = nfCollect.slice(Math.floor(nfCollect.length * 0.15)); nfCollect = null;
			floorDb = M.noiseFloor(d);
			$('mk-nfout').innerHTML = floorDb == null ? 'No reading.' : '<b>' + M.fmtDb(floorDb) + ' dBFS</b>. ' + esc(M.floorWord(floorDb)) + spGap();
		}, 1000);
	};
	function spGap() { var sp = M.speechLevel(hist.map(function (h) { return h.r; }), floorDb); return sp.db != null && floorDb != null ? ' Your voice was ' + Math.round(sp.db - floorDb) + ' dB above it (30+ is good).' : ''; }

	/* ---------- record 10 s ---------- */
	var rec = null, recUrl = null;
	$('mk-rec').onclick = function () {
		if (!stream) { toast('Start the microphone first'); return; }
		if (rec && rec.state === 'recording') { rec.stop(); return; }
		if (!window.MediaRecorder) { $('mk-recst').textContent = 'This browser cannot record audio.'; return; }
		var chunks = [], t0 = Date.now(), btn = this;
		try { rec = new MediaRecorder(stream); } catch (e) { $('mk-recst').textContent = 'Could not start recording.'; return; }
		rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
		rec.onstop = function () {
			clearInterval(tick); btn.textContent = '● Record 10 s'; btn.classList.remove('mk-on');
			var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
			if (recUrl) URL.revokeObjectURL(recUrl); recUrl = URL.createObjectURL(blob);
			var au = $('mk-audio'); au.src = recUrl; au.hidden = false;
			$('mk-recst').textContent = 'Done. Press play (headphones help).';
			blob.arrayBuffer().then(function (ab) { return new Promise(function (ok, no) { var p = ctx.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); }); }).then(function (buf) {
				var chs = []; for (var i = 0; i < buf.numberOfChannels; i++) chs.push(buf.getChannelData(i));
				var a = M.analyse(chs, buf.sampleRate);
				$('mk-recinfo').textContent = a.seconds.toFixed(1) + ' s · loudest peak ' + M.fmtDb(a.peak) + ' dBFS · average ' + M.fmtDb(a.rms) + ' dBFS' + (a.clips ? ' · ' + a.clips + ' clipped samples' : ' · no clipping');
				drawWave(chs[0]);
			}).catch(function () { $('mk-recinfo').textContent = ''; $('mk-wave').hidden = true; });
		};
		rec.start(); btn.textContent = '■ Stop recording'; btn.classList.add('mk-on');
		var tick = setInterval(function () { var s = (Date.now() - t0) / 1000; $('mk-recst').textContent = 'Recording… ' + Math.max(0, 10 - s).toFixed(0) + ' s left'; if (s >= 10 && rec.state === 'recording') rec.stop(); }, 200);
	};
	function drawWave(d) {
		var cv = $('mk-wave'); cv.hidden = false;
		var W = cv.parentNode.clientWidth - 2, H = 110, dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
		var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
		c.fillStyle = cssv('--mk-wavebg', '#f1f4f8'); c.fillRect(0, 0, W, H);
		var mid = H / 2, env = M.envelope(d, W);
		c.fillStyle = 'rgba(239,68,68,0.15)'; c.fillRect(0, 0, W, mid * (1 - M.dbToLin(-3))); c.fillRect(0, H - mid * (1 - M.dbToLin(-3)), W, mid * (1 - M.dbToLin(-3)));
		c.fillStyle = cssv('--mk-wave', '#2563eb');
		env.forEach(function (e, x) { var y1 = mid - e[1] * mid, y2 = mid - e[0] * mid; c.fillRect(x, y1, 1, Math.max(1, y2 - y1)); });
	}

	/* ---------- spectrogram ---------- */
	var sc = $('mk-spec'), sctx = null;
	function drawSpec() {
		if (!specAn || $('mk-specsec').getBoundingClientRect().bottom < 0) return;
		var W = sc.clientWidth, H = sc.clientHeight, dpr = 1;
		if (!W || !H) return;
		if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; sctx = sc.getContext('2d'); sctx.fillStyle = '#000'; sctx.fillRect(0, 0, W, H); }
		sctx = sctx || sc.getContext('2d');
		specAn.getByteFrequencyData(specBuf);
		sctx.drawImage(sc, -2 * dpr, 0);
		var nyq = ctx.sampleRate / 2, lo = 40, hi = Math.min(16000, nyq), n = specBuf.length;
		for (var y = 0; y < H; y++) {
			var f = lo * Math.pow(hi / lo, 1 - y / H), bin = Math.min(n - 1, Math.round(f / nyq * n)), v = specBuf[bin] / 255;
			sctx.fillStyle = heat(v); sctx.fillRect(W - 2, y, 2, 1);
		}
	}
	function heat(v) { var r = Math.round(255 * Math.min(1, v * 1.8)), g = Math.round(255 * Math.max(0, Math.min(1, v * 1.8 - 0.6))), b = Math.round(255 * Math.max(0, 0.5 - v) * 1.2 + (v > 0.85 ? (v - 0.85) * 1500 : 0)); return 'rgb(' + r + ',' + g + ',' + Math.min(255, b) + ')'; }

	/* ---------- speaker test ---------- */
	var out = null, outNodes = [], sweepT = 0;
	$('mk-vol').value = S.vol; $('mk-volv').textContent = S.vol + '%';
	function outGain() { var v = S.vol / 100; return v * v * 0.5; }
	$('mk-vol').oninput = function () { S.vol = +this.value; $('mk-volv').textContent = S.vol + '%'; save(); outNodes.forEach(function (n) { if (n.g) n.g.gain.setTargetAtTime(outGain(), out.currentTime, 0.02); }); };
	function stopOut() { outNodes.forEach(function (n) { try { n.o.stop(); } catch (e) {} }); outNodes = []; cancelAnimationFrame(sweepT); $('mk-spkst').textContent = ''; }
	function tone(pan, freq, beeps) {
		var t = out.currentTime + 0.05;
		for (var i = 0; i < beeps; i++) {
			var o = out.createOscillator(), g = out.createGain(), p = out.createStereoPanner ? out.createStereoPanner() : null;
			o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0;
			var s = t + i * 0.45; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(outGain(), s + 0.02); g.gain.setValueAtTime(outGain(), s + 0.28); g.gain.linearRampToValueAtTime(0, s + 0.3);
			o.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(out.destination); } else g.connect(out.destination);
			o.start(s); o.stop(s + 0.32); outNodes.push({ o: o, g: null });
		}
	}
	$('mk-spk').addEventListener('click', function (e) {
		var b = e.target.closest('[data-spk]'); if (!b) return;
		var k = b.getAttribute('data-spk');
		if (!AC) { $('mk-spkst').textContent = 'This browser cannot play test sounds.'; return; }
		if (!out) out = ctx || new AC(); if (out.state === 'suspended') out.resume();
		stopOut();
		if (k === 'stop') return;
		if (k === 'left') { tone(-1, 440, 3); $('mk-spkst').textContent = 'Playing on the LEFT only. Hear it on the right? Your sides are swapped.'; }
		else if (k === 'right') { tone(1, 660, 3); $('mk-spkst').textContent = 'Playing on the RIGHT only (a higher beep).'; }
		else if (k === 'both') { tone(0, 523, 3); $('mk-spkst').textContent = 'Playing on both sides: it should sound centred.'; }
		else {
			var o = out.createOscillator(), g = out.createGain(), T = 12, t0 = out.currentTime + 0.05;
			o.type = 'sine'; o.frequency.setValueAtTime(20, t0); o.frequency.exponentialRampToValueAtTime(20000, t0 + T);
			g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(outGain(), t0 + 0.2); g.gain.setValueAtTime(outGain(), t0 + T - 0.2); g.gain.linearRampToValueAtTime(0, t0 + T);
			o.connect(g); g.connect(out.destination); o.start(t0); o.stop(t0 + T); outNodes.push({ o: o, g: g });
			(function upd() { var t = out.currentTime - t0; if (t > T) { $('mk-spkst').textContent = 'Sweep done. Most adults hear up to about 15-17 kHz; small speakers often go silent below 80-150 Hz.'; return; } $('mk-spkst').textContent = 'Now: ' + M.fmtHz(M.sweepFreq(20, 20000, T, Math.max(0, t))) + '. Note where you first and last hear it.'; sweepT = requestAnimationFrame(upd); })();
		}
	});

	/* fill window for the meter and spectrogram */
	function panels() {
		if (!window.MESPanel) { if (document.readyState !== 'complete') setTimeout(panels, 200); return; }
		window.MESPanel.add($('mk-metersec'), { bar: $('mk-mbtns'), onChange: function () { drawMeter([]); } });
		window.MESPanel.add($('mk-specsec'), { bar: $('mk-sbtns'), onChange: function () { sc.width = 0; } });
	}
	panels();
	document.addEventListener('visibilitychange', function () { if (document.hidden && rec && rec.state === 'recording') rec.stop(); });
	window.addEventListener('pagehide', function () { stopMic(); stopOut(); });
	drawMeter([]);
	if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'microphone' }).then(function (p) { if (p.state === 'granted') $('mk-go').textContent = '🎙 Start the microphone (already allowed)'; }, function () {});
})();
