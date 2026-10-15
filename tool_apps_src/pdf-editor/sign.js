/* MES PDF Editor: signatures (type, draw, upload), saved in this browser only. Uses PD. */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, SKEY = "mes-pdf-editor:sigs";
	var FONTS = ["Great Vibes", "Dancing Script", "Sacramento", "Mrs Saint Delafield", "Homemade Apple", "Caveat"], INK = [["#111111", "Black"], ["#1a2f8a", "Blue"], ["#b3261e", "Red"]];
	function load() { try { var a = JSON.parse(localStorage.getItem(SKEY) || "[]"); return Array.isArray(a) ? a.filter(function (s) { return s && /^data:image\/png;base64,/.test(s.data || ""); }).slice(0, 8) : []; } catch (e) { return []; } }
	function save(list) { try { localStorage.setItem(SKEY, JSON.stringify(list.slice(0, 8))); return true; } catch (e) { PD.toast("Could not save the signature in this browser (storage is full or blocked)"); return false; } }
	var fontsLinked = false; function linkFonts() { if (fontsLinked) return; fontsLinked = true; var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Homemade+Apple&family=Mrs+Saint+Delafield&family=Sacramento&display=swap"; document.head.appendChild(l); }
	function arm(s) { if (!s.imgId || !PD.images[s.imgId]) s.imgId = PD.addImageData(s.data, s.w, s.h); PD.armed = { kind: "sig", id: s.imgId, w: s.w, h: s.h }; }
	PD.signOptions = function (o, add, button) {
		var list = load(); add(button("Create signature...", function () { PD.signDialog(); }, true));
		var wrap = document.createElement("span"); wrap.className = "pd-sigs-bar"; wrap.style.cssText = "display:inline-flex;gap:0.4em;align-items:center;flex-wrap:wrap";
		list.forEach(function (s, i) { var b = document.createElement("button"); b.type = "button"; b.className = "pd-btn"; b.style.cssText = "background:#fff;padding:0.15em 0.4em;border-radius:0.4em;height:2.4em;" + (PD.armed && PD.armed.sigIndex === i ? "outline:2px solid var(--pd-on);" : ""); b.title = "Use this signature"; b.innerHTML = '<img alt="Saved signature ' + (i + 1) + '" style="height:1.9em;display:block" src="' + s.data + '">'; b.onclick = function () { arm(s); PD.armed.sigIndex = i; PD.toast("Click on the page where the signature should go"); PD.buildOpts(); }; wrap.appendChild(b); });
		add(wrap); if (list.length) add(button("Manage...", function () { PD.manageSigs(); })); else { var n = document.createElement("span"); n.className = "pd-note"; n.textContent = "No saved signatures yet."; add(n); }
		if (PD.armed && PD.armed.kind === "sig") { var h = document.createElement("span"); h.className = "pd-note pd-warn"; h.textContent = "Click on the page where it should go."; add(h); }
	};
	PD.manageSigs = function () {
		var list = load(); PD.dialog('<h3>Saved signatures</h3><p class="pd-note">They are stored only in this browser. Delete any you no longer want.</p><div class="pd-sigs" id="pd-sg"></div><div class="pd-end"><button type="button" class="pd-btn pd-btn--primary" id="pd-sg-done">Done</button></div>', function () { PD.buildOpts(); });
		function draw() { var g = $("pd-sg"); g.innerHTML = ""; list.forEach(function (s, i) { var c = document.createElement("div"); c.className = "pd-sigc"; c.innerHTML = '<img alt="Saved signature ' + (i + 1) + '" src="' + s.data + '"><button type="button" aria-label="Delete this signature">✕</button>'; c.querySelector("button").onclick = function () { list.splice(i, 1); save(list); PD.armed = null; draw(); }; g.appendChild(c); }); if (!list.length) g.innerHTML = '<span class="pd-note">None saved.</span>'; }
		draw(); $("pd-sg-done").onclick = PD.closeDialog;
	};
	// trim transparent margins, return { data, w, h }
	function finish(canvas) {
		var ctx = canvas.getContext("2d"), d = ctx.getImageData(0, 0, canvas.width, canvas.height), b = M.alphaBounds(d.data, canvas.width, canvas.height, 10); if (!b) return null; var pad = Math.round(Math.max(b.w, b.h) * 0.03) + 2, x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad), w = Math.min(canvas.width - x, b.w + pad * 2), h = Math.min(canvas.height - y, b.h + pad * 2), out = document.createElement("canvas"); out.width = w; out.height = h; out.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
		var max = 900; if (w > max) { var o2 = document.createElement("canvas"); o2.width = max; o2.height = Math.round(h * max / w); o2.getContext("2d").drawImage(out, 0, 0, o2.width, o2.height); return { data: o2.toDataURL("image/png"), w: o2.width, h: o2.height }; }
		return { data: out.toDataURL("image/png"), w: w, h: h };
	}
	PD.signDialog = function () {
		linkFonts(); var tab = "type", ink = INK[0][0], fontIdx = 0, name = "", result = null, strokes = [], upImg = null, removeBg = true, saveIt = true;
		PD.noBackdropClose = true;
		PD.dialog('<h3>Create your signature</h3><div class="pd-tabs" role="tablist"><button type="button" role="tab" data-tab="type" aria-selected="true">Type</button><button type="button" role="tab" data-tab="draw" aria-selected="false">Draw</button><button type="button" role="tab" data-tab="upload" aria-selected="false">Upload</button></div><div id="pd-sg-body"></div><div class="pd-row"><span class="pd-note">Ink</span><span class="pd-sw" id="pd-sg-ink"></span></div><label class="pd-chk"><input type="checkbox" id="pd-sg-save" checked> <span>Save it in this browser for next time (it never leaves your device)</span></label><div class="pd-end"><button type="button" class="pd-btn" id="pd-sg-cancel">Cancel</button><button type="button" class="pd-btn pd-btn--primary" id="pd-sg-use" disabled>Use this signature</button></div>', function () { PD.noBackdropClose = false; });
		var body = $("pd-sg-body"), useBtn = $("pd-sg-use");
		function setResult(r) { result = r; useBtn.disabled = !r; }
		function drawInk() { var box = $("pd-sg-ink"); box.innerHTML = ""; INK.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.style.background = c[0]; b.title = c[1]; b.setAttribute("aria-label", c[1]); b.setAttribute("aria-pressed", String(c[0] === ink)); b.onclick = function () { ink = c[0]; drawInk(); render(); }; box.appendChild(b); }); }
		function typeRender() {
			var txt = name.trim(); if (!txt) { setResult(null); var pv = body.querySelector(".pd-sigprev"); if (pv) pv.innerHTML = '<span class="pd-note" style="color:#666">Your signature appears here</span>'; return; }
			var f = FONTS[fontIdx]; document.fonts.load('96px "' + f + '"', txt).then(function () { var c = document.createElement("canvas"), ctx = c.getContext("2d"), sz = 120; ctx.font = sz + 'px "' + f + '", cursive'; var w = Math.ceil(ctx.measureText(txt).width) + 60; c.width = Math.min(3000, w); c.height = sz * 2; ctx.font = sz + 'px "' + f + '", cursive'; ctx.fillStyle = ink; ctx.textBaseline = "middle"; ctx.fillText(txt, 30, sz); var r = finish(c); setResult(r); var pv = body.querySelector(".pd-sigprev"); if (pv && r) pv.innerHTML = '<img alt="Signature preview" style="max-width:100%;max-height:6em" src="' + r.data + '">'; });
		}
		function typeUI() {
			body.innerHTML = '<div class="pd-row"><input type="text" id="pd-sg-name" placeholder="Type your name" maxlength="60" autocomplete="off" aria-label="Your name" value="' + M.esc(name) + '"></div><div class="pd-fonts" id="pd-sg-fonts"></div><div class="pd-sigprev"></div>';
			var fb = $("pd-sg-fonts"); function fonts() { fb.innerHTML = ""; FONTS.forEach(function (f, i) { var d = document.createElement("div"); d.className = "pd-fontc" + (i === fontIdx ? " is-on" : ""); d.style.fontFamily = '"' + f + '", cursive'; d.style.color = '#111'; d.textContent = name.trim() || "Your name"; d.title = f; d.onclick = function () { fontIdx = i; fonts(); typeRender(); }; fb.appendChild(d); }); } fonts();
			$("pd-sg-name").addEventListener("input", function () { name = this.value; fonts(); typeRender(); }); $("pd-sg-name").focus(); typeRender();
		}
		function drawUI() {
			body.innerHTML = '<canvas class="pd-pad" id="pd-pad" width="1200" height="360" aria-label="Draw your signature here"></canvas><div class="pd-row"><button type="button" class="pd-btn" id="pd-pad-undo">Undo</button><button type="button" class="pd-btn" id="pd-pad-clear">Clear</button><span class="pd-note">Draw with a mouse, trackpad, finger or pen.</span></div>';
			var cv = $("pd-pad"), ctx = cv.getContext("2d"), cur = null;
			function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); ctx.strokeStyle = ink; ctx.lineCap = ctx.lineJoin = "round"; strokes.forEach(function (s) { ctx.lineWidth = 7; ctx.beginPath(); var p = s.pts; if (p.length === 1) { ctx.arc(p[0][0], p[0][1], 3.5, 0, 7); ctx.fillStyle = ink; ctx.fill(); return; } ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length - 1; i++) { var mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my); } ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); ctx.stroke(); }); setResult(strokes.length ? finish(cv) : null); }
			function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
			cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); cur = { pts: [pt(e)] }; strokes.push(cur); redraw(); e.preventDefault(); });
			cv.addEventListener("pointermove", function (e) { if (!cur) return; cur.pts.push(pt(e)); redraw(); }); ["pointerup", "pointercancel"].forEach(function (n) { cv.addEventListener(n, function () { cur = null; }); });
			$("pd-pad-undo").onclick = function () { strokes.pop(); redraw(); }; $("pd-pad-clear").onclick = function () { strokes = []; redraw(); }; redraw(); cv._redraw = redraw;
		}
		function uploadUI() {
			body.innerHTML = '<div class="pd-row"><input type="file" id="pd-sg-file" accept="image/*" aria-label="Choose a picture of your signature"></div><label class="pd-chk"><input type="checkbox" id="pd-sg-bg" ' + (removeBg ? "checked" : "") + '> <span>Remove the white background</span></label><div class="pd-sigprev"><span class="pd-note" style="color:#666">Choose a photo or scan of your signature on white paper</span></div>';
			function proc() { if (!upImg) return; var c = document.createElement("canvas"), s = Math.min(1, 1000 / upImg.naturalWidth); c.width = Math.max(1, Math.round(upImg.naturalWidth * s)); c.height = Math.max(1, Math.round(upImg.naturalHeight * s)); var x = c.getContext("2d"); x.drawImage(upImg, 0, 0, c.width, c.height); if (removeBg) { var d = x.getImageData(0, 0, c.width, c.height); M.whiteToAlpha(d.data, 190, 240); x.putImageData(d, 0, 0); } var r = finish(c); setResult(r); var pv = body.querySelector(".pd-sigprev"); if (pv && r) pv.innerHTML = '<img alt="Signature preview" style="max-width:100%;max-height:7em" src="' + r.data + '">'; }
			$("pd-sg-file").addEventListener("change", function () { var f = this.files[0]; if (!f) return; var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () { upImg = im; proc(); }; im.src = fr.result; }; fr.readAsDataURL(f); }); $("pd-sg-bg").addEventListener("change", function () { removeBg = this.checked; proc(); });
		}
		function render() { if (tab === "type") typeUI(); else if (tab === "draw") drawUI(); else uploadUI(); }
		[].forEach.call(PD.$("pd-dlg").querySelectorAll(".pd-tabs button"), function (b) { b.onclick = function () { tab = b.dataset.tab; [].forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-selected", String(x === b)); }); setResult(null); render(); }; });
		$("pd-sg-save").onchange = function () { saveIt = this.checked; }; $("pd-sg-cancel").onclick = PD.closeDialog;
		useBtn.onclick = function () { if (!result) return; var s = { id: M.newId("s"), data: result.data, w: result.w, h: result.h }; if (saveIt) { var list = load(); list.unshift({ id: s.id, data: s.data, w: s.w, h: s.h }); save(list); } PD.closeDialog(); arm(s); PD.armed.sigIndex = saveIt ? 0 : -1; PD.setTool("sign"); arm(s); PD.buildOpts(); PD.toast("Click on the page where the signature should go", 3500); };
		drawInk(); render();
	};
})();
