/* MES 3D Studio: "Photo to 3D". Turns a picture into a printable relief, coin, lithophane or cut-out figure, all in the browser.
 * Heights come from an AI depth model (Depth Anything V2 Small, Apache-2.0, onnx-community/depth-anything-v2-small) or from the picture's brightness;
 * "Subject only" uses the picture's own transparency, else IS-Net (Apache-2.0, Ko033/isnet-general-use-onnx, the Photo Editor's background remover).
 * transformers.js 3.7.6 from jsDelivr loads on first use; the models come from huggingface.co once and stay in the browser's cache. Nothing is uploaded.
 * The mesh maths (resample, mask clean-up, heights, watertight mesh) is MES3D in lib.js. Started by app.js: window.TDPhoto3D(api). */
(function () {
	'use strict';
	var LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js', TF = null, models = {};
	var DEPTH = { id: 'onnx-community/depth-anything-v2-small', mb: function (g) { return g ? 50 : 27; } };
	var SEG = { id: 'Ko033/isnet-general-use-onnx', mb: function (g) { return g ? 88 : 46; } };
	var KEY = 'mes-3d-studio:photo3d';
	function loadLib() { return TF ? Promise.resolve(TF) : new Function('u', 'return import(u)')(LIB).then(function (m) { TF = m; return m; }); }
	var f16 = null;
	function gpuF16() { if (f16) return f16; f16 = navigator.gpu ? navigator.gpu.requestAdapter().then(function (a) { return !!(a && a.features.has('shader-f16')); }).catch(function () { return false; }) : Promise.resolve(false); return f16; }

	window.TDPhoto3D = function (api) {
		var L = api.L, esc = api.esc;
		var st = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
		var P = Object.assign({ preset: 'relief', detail: 60000 }, L.RELIEF_PRESETS.relief, st);
		function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
		var pic = null; // {name, canvas (<= 1024 px), w, h, rgba, alpha (Float32 or null), depth: {d,w,h} | null, seg: {d,w,h} | null}

		function getModel(which, prog) {
			return Promise.all([loadLib(), gpuF16()]).then(function (r) {
				var gpu = r[1], key = which + (gpu ? ':gpu' : ':cpu'); if (models[key]) return models[key];
				var M = which === 'depth' ? DEPTH : SEG, opt = { progress_callback: prog, dtype: gpu ? 'fp16' : 'q8', device: gpu ? 'webgpu' : 'wasm' };
				function load(o) {
					if (which === 'depth') return TF.pipeline('depth-estimation', M.id, o).then(function (p) { return { run: p, gpu: o.device === 'webgpu' }; });
					return Promise.all([TF.AutoModel.from_pretrained(M.id, o), TF.AutoProcessor.from_pretrained(M.id)]).then(function (a) { return { model: a[0], proc: a[1], gpu: o.device === 'webgpu' }; });
				}
				return (models[key] = load(opt).catch(function (e) { if (!gpu) throw e; return load({ progress_callback: prog, dtype: 'q8', device: 'wasm' }); }));
			});
		}
		function tensorGrid(t) { var dims = t.dims, h = dims[dims.length - 2], w = dims[dims.length - 1]; return Promise.resolve(t.data).then(function (d) { return { d: Float32Array.from(d), w: w, h: h }; }); }
		function runDepth(prog) {
			return getModel('depth', prog).then(function (m) { return TF.RawImage.fromCanvas(pic.canvas); }).then(function (img) {
				return getModel('depth', prog).then(function (m) { return m.run(img); });
			}).then(function (out) { return tensorGrid(out.predicted_depth); });
		}
		function runSeg(prog) {
			return getModel('seg', prog).then(function (m) {
				return Promise.resolve(TF.RawImage.fromCanvas(pic.canvas)).then(function (img) { return m.proc(img); }).then(function (inp) {
					var s = m.model.sessions.model, feed = {}; feed[s.inputNames[0]] = inp.pixel_values;
					return m.model(feed).then(function (res) { return tensorGrid(res[s.outputNames[0]]); });
				});
			}).then(function (g) { // min-max normalise to 0..1
				var mn = Infinity, mx = -Infinity, i; for (i = 0; i < g.d.length; i++) { if (g.d[i] < mn) mn = g.d[i]; if (g.d[i] > mx) mx = g.d[i]; }
				var r = mx - mn || 1; for (i = 0; i < g.d.length; i++) g.d[i] = (g.d[i] - mn) / r; return g;
			});
		}

		// ---------- reading a picture ----------
		function loadPicture(file) {
			return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); }).then(function (bmp) {
				var s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height)), w = Math.max(2, Math.round(bmp.width * s)), h = Math.max(2, Math.round(bmp.height * s));
				var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d', { willReadFrequently: true });
				x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
				var rgba = x.getImageData(0, 0, w, h).data, alpha = null, see = 0;
				for (var i = 0; i < w * h; i++) if (rgba[i * 4 + 3] < 250) see++;
				if (see > w * h * 0.02) { alpha = new Float32Array(w * h); for (i = 0; i < w * h; i++) alpha[i] = rgba[i * 4 + 3] / 255; }
				// the AI models want a solid picture: paint transparent parts white
				if (alpha) { var c2 = document.createElement('canvas'); c2.width = w; c2.height = h; var x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, w, h); x2.drawImage(c, 0, 0); c = c2; rgba = x2.getImageData(0, 0, w, h).data; }
				pic = { name: api.baseName(file.name || 'picture'), canvas: c, w: w, h: h, rgba: rgba, alpha: alpha, depth: null, seg: null };
				return pic;
			});
		}

		// ---------- the dialog ----------
		var d = null, busy = false, token = 0;
		function presetChips() { return Object.keys(L.RELIEF_PRESETS).map(function (k) { return '<button type="button" class="td-b td-p3-pre" data-pre="' + k + '" aria-pressed="' + (P.preset === k) + '">' + esc(L.RELIEF_PRESETS[k].name) + '</button>'; }).join(''); }
		function num(id, label, v, step, hint) { return '<label class="td-f" title="' + esc(hint || '') + '">' + label + '<input class="td-in" type="number" inputmode="decimal" step="' + step + '" min="0" id="td-p3-' + id + '" value="' + v + '"></label>'; }
		function open(file) {
			d = api.dialog('<h3>Photo to 3D</h3>'
				+ '<p class="td-hint">Turn a photo or drawing into a model you can print: a raised picture, a coin, a lithophane or a cut-out figure. Everything happens in your browser: the picture is never uploaded.</p>'
				+ '<div class="td-p3">'
				+ '<div class="td-p3-l">'
				+ '<div class="td-p3-drop" id="td-p3-drop" tabindex="0" role="button" aria-label="Choose a picture"><canvas id="td-p3-pic" hidden></canvas><span id="td-p3-dt">📷 <b>Choose a picture</b><br><small>or drop it here, or paste it (Ctrl+V)</small></span></div>'
				+ '<input type="file" id="td-p3-file" accept="image/*" hidden>'
				+ '<div class="td-p3-prevw"><canvas id="td-p3-prev" aria-label="Preview of the 3D shape (lit from the top left)"></canvas><div class="td-p3-ph" id="td-p3-ph">The 3D preview appears here</div></div>'
				+ '<div class="td-p3-bar" id="td-p3-bar" hidden><i></i></div><p class="td-hint" id="td-p3-st" aria-live="polite"></p>'
				+ '</div>'
				+ '<div class="td-p3-r">'
				+ '<div class="td-p3-pres">' + presetChips() + '</div>'
				+ '<div class="td-p3-grid">'
				+ '<label class="td-f td-f--w">Height comes from<select id="td-p3-source"><option value="depth">AI depth: near things stick out (3D from a photo)</option><option value="dark">Brightness: darker = higher</option><option value="light">Brightness: lighter = higher</option></select></label>'
				+ '<label class="td-f td-f--w">Shape<select id="td-p3-shape"><option value="rect">Rectangle (whole picture)</option><option value="circle">Circle (coin)</option><option value="oval">Oval</option><option value="subject">Subject only (background removed)</option></select></label>'
				+ num('width', 'Width (mm)', P.width, 1, 'Width of the model; the depth follows the picture') + num('height', 'Relief height (mm)', P.height, 0.1, 'How far the highest point rises above the base')
				+ num('base', 'Base (mm)', P.base, 0.1, 'Solid thickness under the relief (lithophane: the thinnest part)') + num('border', 'Frame (mm)', P.border, 0.5, 'A raised rim round the edge; 0 = none')
				+ num('round', 'Round the edges (mm)', P.round || 0, 0.5, 'Lowers the relief near the outline so cut-outs get soft edges')
				+ '<label class="td-f">Smoothness<input type="range" min="0" max="8" step="1" id="td-p3-blur" value="' + P.blur + '"></label>'
				+ '<label class="td-f">Contrast<input type="range" min="0.4" max="2.5" step="0.05" id="td-p3-gamma" value="' + P.gamma + '" title="Left = more of the relief rises; right = only the highest parts stand out"></label>'
				+ '<label class="td-f">Detail<select id="td-p3-detail"><option value="20000">Low (fast)</option><option value="60000">Normal</option><option value="120000">High</option><option value="200000">Very high (big file)</option></select></label>'
				+ '<label class="td-chk td-f--w"><input type="checkbox" id="td-p3-two"> Both sides (puffy: the relief is mirrored underneath)</label>'
				+ '<label class="td-chk td-f--w"><input type="checkbox" id="td-p3-inv"> Flip the heights (high becomes low)</label>'
				+ '</div>'
				+ '<p class="td-hint" id="td-p3-info"></p>'
				+ '<p class="td-hint td-p3-ai">AI depth guesses shape from one photo: it is a relief (like a carving), not a full model you can walk round. First use downloads a small AI model (about ' + DEPTH.mb(!!navigator.gpu) + ' MB, + ' + SEG.mb(!!navigator.gpu) + ' MB for "Subject only") from huggingface.co and keeps it in this browser.</p>'
				+ '<div class="td-btns"><button type="button" class="td-b td-b--pri" id="td-p3-add" disabled>➕ Add to my model</button><button type="button" class="td-b" data-close>Cancel</button></div>'
				+ '</div></div>', 'td-dlg--wide td-dlg--p3', function () { token++; d = null; document.removeEventListener('paste', onPaste); });
			setForm(); bind(); document.addEventListener('paste', onPaste);
			if (file) choose(file); else if (pic) { showPic(); update(); }
		}
		function $(id) { return d && d.querySelector('#td-p3-' + id); }
		function setForm() {
			$('source').value = P.source; $('shape').value = P.shape; $('detail').value = String(P.detail);
			['width', 'height', 'base', 'border'].forEach(function (k) { $(k).value = P[k]; }); $('round').value = P.round || 0; $('blur').value = P.blur; $('gamma').value = P.gamma;
			$('two').checked = !!P.two; $('inv').checked = !!P.invert;
			d.querySelectorAll('.td-p3-pre').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pre === P.preset)); });
		}
		function readForm() {
			function n(id, dflt, lo, hi) { var v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }
			P.source = $('source').value; P.shape = $('shape').value; P.detail = +$('detail').value;
			P.width = n('width', 100, 5, 1000); P.height = n('height', 4, 0, 200); P.base = n('base', 1, 0, 100); P.border = n('border', 0, 0, 100); P.round = n('round', 0, 0, 100);
			P.blur = +$('blur').value; P.gamma = +$('gamma').value; P.two = $('two').checked; P.invert = $('inv').checked;
		}
		var timer = 0;
		function bind() {
			var drop = $('drop'), fi = $('file');
			drop.addEventListener('click', function () { fi.click(); });
			drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
			fi.addEventListener('change', function () { if (fi.files[0]) choose(fi.files[0]); fi.value = ''; });
			drop.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('on'); });
			drop.addEventListener('dragleave', function () { drop.classList.remove('on'); });
			drop.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('on'); var f = e.dataTransfer.files[0]; if (f) choose(f); });
			d.addEventListener('click', function (e) {
				var b = e.target.closest('[data-pre]'); if (!b) return;
				P.preset = b.dataset.pre; Object.assign(P, L.RELIEF_PRESETS[P.preset]); P.round = P.shape === 'subject' && !P.two ? 2 : P.two ? 3 : 0; setForm(); save(); update();
			});
			d.addEventListener('input', function (e) { if (!e.target.id || e.target.id.indexOf('td-p3-') !== 0 || e.target.id === 'td-p3-file') return; readForm(); save(); clearTimeout(timer); timer = setTimeout(update, e.target.type === 'range' ? 60 : 250); });
			d.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') { readForm(); save(); update(); } });
			$('add').addEventListener('click', add);
		}
		function onPaste(e) {
			var it = Array.prototype.find.call((e.clipboardData && e.clipboardData.items) || [], function (i) { return i.type.indexOf('image/') === 0; });
			if (it) { e.preventDefault(); choose(it.getAsFile()); }
		}
		function status(t, frac) {
			if (!d) return; $('st').textContent = t || '';
			var bar = $('bar'); bar.hidden = frac == null; if (frac != null) bar.firstChild.style.width = Math.round(frac * 100) + '%';
		}
		function choose(file) {
			if (!file || !/^image\//.test(file.type || 'image/')) return status('That is not a picture. Use a JPG, PNG or WebP.');
			status('Reading the picture…');
			token++; loadPicture(file).then(function () { showPic(); update(); }).catch(function (e) { status('Could not read that picture (' + (e && e.message || e) + '). Try a JPG, PNG or WebP.'); });
		}
		function showPic() {
			var c = $('pic'), dt = $('dt'); c.hidden = false; dt.hidden = true; c.width = pic.w; c.height = pic.h; c.getContext('2d').drawImage(pic.canvas, 0, 0);
		}
		function progress(label) {
			var files = {};
			return function (p) {
				if (!p || p.status !== 'progress' || !(p.total > 1e6)) return; files[p.file] = p; var l = 0, t = 0;
				for (var k in files) { l += files[k].loaded; t += files[k].total; }
				status('Downloading the ' + label + ' model… ' + Math.round(l / 1e6) + ' of ' + Math.round(t / 1e6) + ' MB (only the first time)', t ? l / t : 0);
			};
		}
		// make sure the AI results this setting needs exist, then build
		var built = null;
		function update() {
			if (!d || !pic) return; readForm();
			var my = ++token, needDepth = P.source === 'depth' && !pic.depth, needSeg = P.shape === 'subject' && !pic.alpha && !pic.seg;
			var steps = Promise.resolve();
			if (needDepth) steps = steps.then(function () { status('Loading the AI depth model…', 0); return runDepth(progress('depth')).then(function (g) { pic.depth = g; }); });
			if (needSeg) steps = steps.then(function () { status('Loading the AI background remover…', 0); return runSeg(progress('background')).then(function (g) { pic.seg = g; }); });
			if (needDepth || needSeg) { busy = true; $('add').disabled = true; }
			steps.then(function () { if (my !== token || !d) return; busy = false; status(needDepth || needSeg ? 'Done. Change any setting: the preview follows at once.' : ''); build(); })
				.catch(function (e) { if (my !== token || !d) return; busy = false; console.warn(e); status('The AI model could not run: ' + (e && e.message || e) + (/fetch|network|load|Failed/i.test(String(e && e.message)) ? ' (check your connection)' : '') + '. Brightness still works without it.'); });
		}
		function build() {
			var g = L.reliefGrid(pic.w, pic.h, P.detail), gw = g.w, gh = g.h, src;
			if (P.source === 'depth') src = L.resampleGrid(pic.depth.d, pic.depth.w, pic.depth.h, gw, gh);
			else { var lum = L.luminance(pic.rgba, pic.w * pic.h); if (P.source === 'dark') for (var i = 0; i < lum.length; i++) lum[i] = 1 - lum[i]; src = L.resampleGrid(lum, pic.w, pic.h, gw, gh); }
			var alpha = P.shape === 'subject' ? (pic.alpha ? L.resampleGrid(pic.alpha, pic.w, pic.h, gw, gh) : L.resampleGrid(pic.seg.d, pic.seg.w, pic.seg.h, gw, gh)) : null;
			var mask = L.cleanMask(L.shapeMask(P.shape, gw, gh, alpha), gw, gh, { largest: P.shape === 'subject', holes: P.shape === 'subject' ? Math.round(gw * gh / 400) : 0 });
			var cells = 0; for (var k = 0; k < mask.length; k++) cells += mask[k];
			if (cells < 4) { built = null; $('add').disabled = true; $('info').textContent = 'Nothing is left to print: the subject was not found. Try another shape.'; return; }
			var H = L.normHeights(src, mask, gw, gh, { blur: P.blur, gamma: P.gamma, invert: P.invert });
			var x0 = gw, x1 = -1; for (var yy = 0; yy < gh; yy++) for (var xx = 0; xx < gw; xx++) if (mask[yy * gw + xx]) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; }
			var cell = P.width / (x1 - x0 + 1), soup = L.reliefMesh(H, mask, gw, gh, { cell: cell, base: P.base, height: P.height, twoSided: P.two, border: P.border, smoothEdge: P.round });
			built = { soup: soup, H: H, mask: mask, gw: gw, gh: gh, cell: cell };
			drawPreview(); var bb = L.bboxOf(soup), sz = bb.size;
			$('info').textContent = 'Size ' + L.fmtNum(sz[0], 1) + ' × ' + L.fmtNum(sz[1], 1) + ' × ' + L.fmtNum(sz[2], 1) + ' mm · ' + (soup.length / 9).toLocaleString() + ' triangles · watertight, ready to print';
			$('add').disabled = busy;
		}
		function drawPreview() { // hill-shaded picture of the heights, lit from the top left
			var b = built, c = $('prev'), gw = b.gw, gh = b.gh; c.width = gw; c.height = gh; $('ph').hidden = true;
			var x = c.getContext('2d'), id = x.createImageData(gw, gh), a = id.data, zs = Math.max(b.gw, b.gh) * 0.35 * Math.min(1.5, Math.max(0.3, (P.height + 0.01) / P.width * 10)), lx = -0.55, ly = -0.55, lz = 0.63;
			function hv(i, j) { i = Math.max(0, Math.min(gw - 1, i)); j = Math.max(0, Math.min(gh - 1, j)); var k = j * gw + i; return b.mask[k] ? b.H[k] : 0; }
			for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
				var k = j * gw + i, o = k * 4; if (!b.mask[k]) { a[o + 3] = 0; continue; }
				var nx = (hv(i - 1, j) - hv(i + 1, j)) * zs / 2, ny = (hv(i, j - 1) - hv(i, j + 1)) * zs / 2, nl = Math.hypot(nx, ny, 1), s = Math.max(0, (nx * lx + ny * ly + lz) / nl);
				var v = 40 + 200 * s; a[o] = v * 0.86; a[o + 1] = v * 0.92; a[o + 2] = v; a[o + 3] = 255;
			}
			x.putImageData(id, 0, 0);
		}
		function add() {
			if (!built || busy) return;
			var name = pic.name + ' (' + L.RELIEF_PRESETS[P.preset].name.replace(/ \(.*/, '').toLowerCase() + ')';
			api.addMesh(built.soup, name, P.preset === 'litho' ? '#F5F5F0' : null);
			api.closeDlg(); api.toast('Added ' + name + '. Check it in the Print tab, then export STL or 3MF.' + (P.preset === 'litho' ? ' Print lithophanes standing up, in white, at 100% infill.' : ''));
		}
		return { open: open, isImage: function (f) { return /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name); } };
	};
})();
