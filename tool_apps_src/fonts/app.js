/* MES Font Preview and Finder (mes.fm/fonts). Fonts the browser really has (canvas width test) + optional Google Fonts / local font access / a font file; live preview with effects,
 * big preview with PNG + CSS, compare, favourites, and a picture matcher (binarise -> crop to the ink -> grid -> compare with each font). Pure helpers in lib.js (MESFont). */
(function () {
	"use strict";
	var F = window.MESFont, $ = function (id) { return document.getElementById(id); }, root = $("fn"); if (!root || !F) return;
	var KEY = "mes-fonts:v1", S = Object.assign({}, F.DEFAULT), st = { cat: "all", q: "", favOnly: false, fav: [], cmp: [], big: null, tab: "browse", google: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (sv.S) Object.assign(S, sv.S); if (Array.isArray(sv.fav)) st.fav = sv.fav; } } catch (e) { /* ignore */ }
	var qp = new URLSearchParams(location.search); if (qp.get("t")) { S.text = qp.get("t").slice(0, 300); S.runs = null; } var startFont = qp.get("f") || "";
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ S: S, fav: st.fav })); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	var toastT; function toast(m) { var t = $("fn-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }

	/* ---------- which fonts exist ---------- */
	var fonts = [], names = {};
	function addFont(name, cat, src) { if (names[name]) return false; names[name] = 1; fonts.push({ name: name, cat: cat, src: src }); return true; }
	var mctx = document.createElement("canvas").getContext("2d"), SAMPLE = "mmmmmmmmmmlli0Oo", BASES = ["monospace", "sans-serif", "serif"];
	function width(f) { mctx.font = f; return mctx.measureText(SAMPLE).width; }
	var baseW = BASES.map(function (b) { return width("72px " + b); });
	function installed(name) { for (var i = 0; i < BASES.length; i++) if (Math.abs(width("72px '" + name + "', " + BASES[i]) - baseW[i]) > 0.01) return true; return false; }
	F.LOCAL.forEach(function (x) { if (installed(x[0])) addFont(x[0], x[1], "local"); });
	["serif", "sans-serif", "monospace", "cursive"].forEach(function (g) { addFont(g, g === "serif" ? "serif" : g === "monospace" ? "mono" : g === "cursive" ? "hand" : "sans", "generic"); });
	function fam(f) { return F.ffam(f.name); }

	/* ---------- style -> CSS variables on the grids ---------- */
	function lum(h) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ""); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 : 0; }
	/* ---------- rich text: the box keeps runs of {t, b, i, u}; S.text is the plain text ---------- */
	function runsOf(root) {
		var runs = [], atStart = true;
		function push(t, st) { if (!t) return; var l = runs[runs.length - 1]; if (l && l.b === st.b && l.i === st.i && l.u === st.u) l.t += t; else runs.push({ t: t, b: st.b, i: st.i, u: st.u }); atStart = false; }
		function walk(n, st) {
			if (n.nodeType === 3) { push(n.nodeValue.replace(/\u00a0/g, " "), st); return; }
			if (n.nodeType !== 1) return; var tag = n.tagName, cs = n.style || {}, nx = { b: st.b, i: st.i, u: st.u };
			if (tag === "B" || tag === "STRONG" || cs.fontWeight === "bold" || +cs.fontWeight >= 600) nx.b = true; if (tag === "I" || tag === "EM" || cs.fontStyle === "italic") nx.i = true; if (tag === "U" || /underline/.test(cs.textDecoration || cs.textDecorationLine || "")) nx.u = true;
			if (tag === "BR") { push("\n", st); return; }
			var block = tag === "DIV" || tag === "P" || tag === "LI"; if (block && !atStart && !/\n$/.test(runs.length ? runs[runs.length - 1].t : "")) push("\n", st);
			for (var c = n.firstChild; c; c = c.nextSibling) walk(c, nx);
		}
		walk(root, { b: false, i: false, u: false });
		while (runs.length && /\n$/.test(runs[runs.length - 1].t)) { runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\n+$/, ""); if (!runs[runs.length - 1].t) runs.pop(); }
		return runs;
	}
	function runsHtml(runs) { return runs.map(function (r) { var h = esc(r.t); if (r.u) h = "<u>" + h + "</u>"; if (r.i) h = "<i>" + h + "</i>"; if (r.b) h = "<b>" + h + "</b>"; return h; }).join(""); }
	function sampleHtml() { return S.runs && S.runs.length ? runsHtml(S.runs) : esc(S.text); }
	function setRuns(runs) { S.runs = runs.some(function (r) { return r.b || r.i || r.u; }) ? runs : null; S.text = runs.map(function (r) { return r.t; }).join("").slice(0, 600); }
	function fillBox() { $("fn-text").innerHTML = sampleHtml(); }
	function applyVars(el) {
		var o = S, sh = []; if (o.shadowOn) sh.push(o.shX + "px " + o.shY + "px " + o.shBlur + "px " + o.shadow); if (o.glowOn) { sh.push("0 0 " + o.glowBlur + "px " + o.glow, "0 0 " + o.glowBlur * 2 + "px " + o.glow); }
		var s = el.style; s.setProperty("--fs", o.size + "px"); s.setProperty("--fw", o.weight); s.setProperty("--fst", o.italic ? "italic" : "normal"); s.setProperty("--ls", o.ls + "px"); s.setProperty("--lh", o.lh); s.setProperty("--al", o.align); s.setProperty("--tf", o.tf);
		s.setProperty("--fg", o.gradOn ? "transparent" : o.color); s.setProperty("--fgd", o.gradOn ? "transparent" : (!o.bgOn && lum(o.color) < 0.4 ? "#f1f1f1" : o.color));   /* dark page: the cards are dark, so a dark colour is shown light there (the PNG and CSS keep the chosen colour) */ s.setProperty("--bgi", o.gradOn ? "linear-gradient(" + o.gAng + "deg," + o.g1 + "," + o.g2 + ")" : (o.bgOn ? o.bg : "transparent")); s.setProperty("--clip", o.gradOn ? "text" : "border-box");
		s.setProperty("--sh", sh.length ? sh.join(",") : "none"); s.setProperty("--stk", o.strokeOn ? o.strokeW + "px " + o.stroke : "0 transparent");
	}
	function sample(f, txt) { var d = document.createElement("div"); d.className = "fn-sample"; d.style.fontFamily = fam(f) + "," + (f.cat === "serif" ? "serif" : f.cat === "mono" ? "monospace" : "sans-serif"); if (txt == null) d.innerHTML = sampleHtml(); else d.textContent = txt; return d; }

	/* ---------- browse grid ---------- */
	var fontByName = function (n) { for (var i = 0; i < fonts.length; i++) if (fonts[i].name === n) return fonts[i]; return null; };
	function visible() { var q = st.q.trim().toLowerCase(); return fonts.filter(function (f) { return (st.cat === "all" || f.cat === st.cat) && (!q || f.name.toLowerCase().indexOf(q) >= 0) && (!st.favOnly || st.fav.indexOf(f.name) >= 0); }); }
	function renderGrid() {
		var g = $("fn-grid"); applyVars(g); var list = visible(); g.innerHTML = ""; var frag = document.createDocumentFragment();
		list.forEach(function (f) {
			var c = document.createElement("div"); c.className = "fn-card" + (st.big === f.name ? " is-on" : ""); var isFav = st.fav.indexOf(f.name) >= 0, inCmp = st.cmp.indexOf(f.name) >= 0;
			var h = document.createElement("div"); h.className = "fn-chead"; h.innerHTML = '<span class="fn-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span><span class="fn-acts"><button type="button" class="fn-ib' + (isFav ? " on" : "") + '" data-a="fav" title="' + (isFav ? "Remove from favourites" : "Add to favourites") + '" aria-label="Favourite">' + (isFav ? "★" : "☆") + '</button><button type="button" class="fn-ib' + (inCmp ? " on" : "") + '" data-a="cmp" title="Add to Compare (up to four)">⇆</button></span>';
			c.appendChild(h); var s = sample(f); s.setAttribute("data-a", "big"); c.appendChild(s); c.setAttribute("data-f", f.name); frag.appendChild(c);
		});
		g.appendChild(frag); $("fn-count").textContent = list.length + " of " + fonts.length + " fonts shown";
		if (!list.length) g.innerHTML = '<p class="tu-note">No fonts match. Clear the search or the filter, or press “Add 80 popular Google Fonts”.</p>';
	}
	$("fn-grid").addEventListener("click", function (e) {
		var c = e.target.closest(".fn-card"); if (!c) return; var name = c.getAttribute("data-f"), a = e.target.closest("[data-a]"); a = a && a.getAttribute("data-a");
		if (a === "fav") { var i = st.fav.indexOf(name); if (i >= 0) st.fav.splice(i, 1); else st.fav.push(name); save(); renderGrid(); return; }
		if (a === "cmp") { var j = st.cmp.indexOf(name); if (j >= 0) st.cmp.splice(j, 1); else if (st.cmp.length >= 4) { toast("Compare shows up to four fonts: remove one first"); return; } else st.cmp.push(name); renderGrid(); renderCompare(); toast(st.cmp.length + " font" + (st.cmp.length === 1 ? "" : "s") + " in Compare"); return; }
		openBig(name);
	});
	$("fn-cats").innerHTML = F.CATS.map(function (c) { return '<button type="button" class="tu-chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === "all") + '">' + c[1] + "</button>"; }).join("");
	$("fn-cats").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; st.cat = b.getAttribute("data-c"); Array.prototype.forEach.call($("fn-cats").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderGrid(); });
	$("fn-q").addEventListener("input", function () { st.q = this.value; renderGrid(); }); $("fn-favonly").addEventListener("change", function () { st.favOnly = this.checked; renderGrid(); });

	/* ---------- big preview, CSS, PNG ---------- */
	function openBig(name) {
		var f = fontByName(name); if (!f) return; st.big = name; $("fn-big").hidden = false; $("fn-bigname").textContent = f.name + (f.src === "google" ? " (Google Font)" : "");
		var p = $("fn-bigprev"); applyVars(p); p.innerHTML = ""; p.appendChild(sample(f)); $("fn-css").textContent = F.css(f.name, f.cat, S); renderGrid(); $("fn-big").scrollIntoView({ block: "nearest", behavior: "smooth" });
	}
	$("fn-bigx").onclick = function () { st.big = null; $("fn-big").hidden = true; renderGrid(); };
	$("fn-csscopy").onclick = function () { copyText($("fn-css").textContent, "CSS copied"); };
	$("fn-share").onclick = function () { var u = location.origin + location.pathname + "?t=" + encodeURIComponent(S.text) + "&f=" + encodeURIComponent(st.big || ""); copyText(u, "Link copied"); };
	function copyText(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Select the text and press Ctrl+C"); } ta.remove(); }); }
	function renderPng(f) {
		var o = S, scale = 2, runs = S.runs && S.runs.length ? S.runs : [{ t: S.text, b: false, i: false, u: false }];
		function tfm(t) { return o.tf === "uppercase" ? t.toUpperCase() : o.tf === "lowercase" ? t.toLowerCase() : o.tf === "capitalize" ? t.replace(/\b(\w)/g, function (m) { return m.toUpperCase(); }) : t; }
		var lines = [[]]; runs.forEach(function (r) { tfm(r.t).split("\n").forEach(function (part, k) { if (k) lines.push([]); if (part) lines[lines.length - 1].push({ t: part, b: r.b, i: r.i, u: r.u }); }); });
		function fontOf(g) { var w = g.b ? (+o.weight >= 600 ? 900 : 700) : o.weight; return ((o.italic || g.i) ? "italic " : "") + w + " " + o.size * scale + "px " + fam(f); }
		var m = document.createElement("canvas").getContext("2d"); function wOf(g) { m.font = fontOf(g); if ("letterSpacing" in m) m.letterSpacing = o.ls * scale + "px"; return m.measureText(g.t).width; }
		var lw = lines.map(function (ln) { return ln.reduce(function (a, g) { return a + wOf(g); }, 0); });
		var mw = Math.max.apply(null, lw.concat([10])), lhp = o.size * o.lh * scale, pad = (20 + Math.max(o.shadowOn ? o.shBlur + Math.abs(o.shX) + Math.abs(o.shY) : 0, o.glowOn ? o.glowBlur * 2 : 0, o.strokeOn ? o.strokeW : 0)) * scale;
		var W = Math.ceil(mw + pad * 2), H = Math.ceil(lhp * lines.length + pad * 2 + o.size * 0.3 * scale), c = document.createElement("canvas"); c.width = Math.min(W, 8000); c.height = Math.min(H, 8000); var x = c.getContext("2d");
		if (o.bgOn) { x.fillStyle = o.bg; x.fillRect(0, 0, c.width, c.height); }
		x.textBaseline = "alphabetic"; x.textAlign = "left"; x.lineJoin = "round"; var fill = o.color;
		if (o.gradOn) { var a = (o.gAng - 90) * Math.PI / 180, cx = c.width / 2, cy = c.height / 2, r = Math.hypot(c.width, c.height) / 2, gr = x.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); gr.addColorStop(0, o.g1); gr.addColorStop(1, o.g2); fill = gr; }
		lines.forEach(function (ln, i) {
			var py = pad + lhp * i + o.size * scale * 0.92, px = o.align === "center" ? (c.width - lw[i]) / 2 : o.align === "right" ? c.width - pad - lw[i] : pad;
			ln.forEach(function (g) {
				var gw = wOf(g); x.font = fontOf(g); if ("letterSpacing" in x) x.letterSpacing = o.ls * scale + "px";
				if (o.glowOn) { x.save(); x.shadowColor = o.glow; x.shadowBlur = o.glowBlur * scale; x.fillStyle = fill; x.fillText(g.t, px, py); x.fillText(g.t, px, py); x.restore(); }
				if (o.shadowOn) { x.save(); x.shadowColor = o.shadow; x.shadowBlur = o.shBlur * scale; x.shadowOffsetX = o.shX * scale; x.shadowOffsetY = o.shY * scale; x.fillStyle = fill; x.fillText(g.t, px, py); x.restore(); }
				if (o.strokeOn) { x.strokeStyle = o.stroke; x.lineWidth = o.strokeW * scale * 2; x.strokeText(g.t, px, py); }
				x.fillStyle = fill; x.fillText(g.t, px, py);
				if (g.u) { var th = Math.max(1, o.size * scale * 0.06); x.fillRect(px, py + o.size * scale * 0.1, gw, th); }
				px += gw;
			});
		});
		return c;
	}
	$("fn-png").onclick = function () { var f = fontByName(st.big); if (!f) return; renderPng(f).toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (f.name.replace(/[^\w-]+/g, "-") + "-text.png").toLowerCase(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000); toast("Saved a PNG" + (S.bgOn ? "" : " with a transparent background")); }); };
	$("fn-pngcopy").onclick = function () { var f = fontByName(st.big); if (!f) return; renderPng(f).toBlob(function (b) { try { navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).then(function () { toast("Copied as an image"); }, function () { toast("Your browser would not copy the image: use Download PNG"); }); } catch (e) { toast("Your browser cannot copy images: use Download PNG"); } }); };

	/* ---------- compare ---------- */
	function renderCompare() {
		var b = $("fn-cmp"); applyVars(b); b.innerHTML = ""; if (!st.cmp.length) { b.innerHTML = '<p class="tu-note">Nothing here yet: press the ⇆ button on a font card.</p>'; return; }
		st.cmp.forEach(function (n) { var f = fontByName(n); if (!f) return; var c = document.createElement("div"); c.className = "fn-card"; c.innerHTML = '<div class="fn-chead"><span class="fn-name">' + esc(f.name) + '</span><span class="fn-acts"><button type="button" class="fn-ib" data-n="' + esc(n) + '" title="Remove from Compare">×</button></span></div>'; c.appendChild(sample(f)); b.appendChild(c); });
	}
	$("fn-cmp").addEventListener("click", function (e) { var x = e.target.closest("[data-n]"); if (!x) return; st.cmp.splice(st.cmp.indexOf(x.getAttribute("data-n")), 1); renderCompare(); renderGrid(); });

	/* ---------- controls ---------- */
	function bind(id, key, num, valFn) {
		var el = $(id), pair = $(id + "n"); function set(v) { S[key] = valFn ? valFn(v) : v; if (el.type === "checkbox") el.checked = !!S[key]; else if (el.value !== String(S[key])) el.value = S[key]; if (pair && pair.value !== String(S[key])) pair.value = S[key]; }
		set(S[key]);
		el.addEventListener("input", function () { var v = el.type === "checkbox" ? el.checked : (num ? parseFloat(el.value) : el.value); if (num && isNaN(v)) return; set(v); changed(); }); el.addEventListener("change", function () { var v = el.type === "checkbox" ? el.checked : (num ? parseFloat(el.value) : el.value); if (num && isNaN(v)) return; set(v); changed(); });
		if (pair) pair.addEventListener("input", function () { var v = parseFloat(pair.value); if (isNaN(v)) return; S[key] = v; el.value = v; changed(); });
	}
	var CTL = [["fn-size", "size", 1], ["fn-weight", "weight"], ["fn-italic", "italic"], ["fn-tf", "tf"], ["fn-align", "align"], ["fn-color", "color"], ["fn-bgon", "bgOn"], ["fn-bg", "bg"], ["fn-ls", "ls", 1], ["fn-lh", "lh", 1], ["fn-shon", "shadowOn"], ["fn-sh", "shadow"], ["fn-shblur", "shBlur", 1], ["fn-shx", "shX", 1], ["fn-shy", "shY", 1], ["fn-stron", "strokeOn"], ["fn-str", "stroke"], ["fn-strw", "strokeW", 1], ["fn-glon", "glowOn"], ["fn-gl", "glow"], ["fn-glb", "glowBlur", 1], ["fn-grad", "gradOn"], ["fn-g1", "g1"], ["fn-g2", "g2"], ["fn-gang", "gAng", 1]];
	CTL.forEach(function (c) { bind(c[0], c[1], c[2]); });
	var richBox = $("fn-text"); fillBox();
	richBox.addEventListener("input", function () { setRuns(runsOf(richBox)); changed(); });
	richBox.addEventListener("paste", function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });
	Array.prototype.forEach.call(document.querySelectorAll("[data-fmt]"), function (b) {
		b.addEventListener("mousedown", function (e) { e.preventDefault(); });   /* keep the selection in the richBox */
		b.addEventListener("click", function () { richBox.focus(); document.execCommand(b.getAttribute("data-fmt")); setRuns(runsOf(richBox)); changed(); });
	});
	$("fn-fmtclear").addEventListener("click", function () { setRuns([{ t: S.text, b: false, i: false, u: false }]); fillBox(); changed(); });
	var ct = 0; function changed() { clearTimeout(ct); ct = setTimeout(function () { save(); renderGrid(); renderCompare(); if (st.big) { var f = fontByName(st.big); if (f) { applyVars($("fn-bigprev")); $("fn-bigprev").firstChild.innerHTML = sampleHtml(); $("fn-css").textContent = F.css(f.name, f.cat, S); } } }, 60); }
	var pr = $("fn-presets"); F.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = p[0]; b.addEventListener("click", function () { var keep = S.text, keepR = S.runs; S = Object.assign({}, F.DEFAULT, p[1], { text: keep, runs: keepR }); CTL.forEach(function (c) { var el = $(c[0]), v = S[c[1]]; if (el.type === "checkbox") el.checked = !!v; else el.value = v; var pair = $(c[0] + "n"); if (pair) pair.value = v; }); save(); changed(); toast(p[0] + " look applied"); }); pr.appendChild(b); });

	/* ---------- more fonts ---------- */
	var gbtn = $("fn-google");
	gbtn.onclick = function () {
		if (st.google) return; st.google = true; gbtn.disabled = true; var todo = F.GOOGLE.filter(function (x) { return !names[x[0]]; }), done = 0, added = 0; gbtn.textContent = "Loading Google Fonts… 0 / " + todo.length;
		function one(x) {
			return new Promise(function (res) {
				var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(x[0]).replace(/%20/g, "+") + "&display=swap"; l.onerror = function () { res(); }; document.head.appendChild(l);
				var to = setTimeout(res, 9000); l.onload = function () { document.fonts.load("40px '" + x[0] + "'").then(function () { clearTimeout(to); if (document.fonts.check("40px '" + x[0] + "'")) { addFont(x[0], x[1], "google"); added++; } res(); }, function () { clearTimeout(to); res(); }); };
			}).then(function () { done++; gbtn.textContent = "Loading Google Fonts… " + done + " / " + todo.length; });
		}
		var i = 0; function pump() { var batch = todo.slice(i, i + 8); i += 8; if (!batch.length) { gbtn.textContent = added ? "Google Fonts added (" + added + ")" : "Could not reach Google Fonts"; if (!added) { gbtn.disabled = false; st.google = false; } renderGrid(); return; } Promise.all(batch.map(one)).then(function () { renderGrid(); pump(); }); } pump();
	};
	if (window.queryLocalFonts) { $("fn-localfonts").hidden = false; $("fn-localfonts").onclick = function () { window.queryLocalFonts().then(function (list) { var seen = {}, added = 0; list.forEach(function (x) { if (seen[x.family]) return; seen[x.family] = 1; var cat = /mono|code|courier|consol/i.test(x.family) ? "mono" : /script|hand|brush|marker/i.test(x.family) ? "hand" : /serif/i.test(x.family) && !/sans/i.test(x.family) ? "serif" : "sans"; if (addFont(x.family, cat, "local")) added++; }); renderGrid(); toast(added + " more fonts added from this computer"); }, function () { toast("Permission was not given"); }); }; }
	$("fn-file").onclick = function () { $("fn-fileinp").click(); };
	$("fn-fileinp").onchange = function () { var f = this.files[0]; this.value = ""; if (!f) return; var nm = f.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]/g, "") || "My font"; f.arrayBuffer().then(function (ab) { var ff = new FontFace(nm, ab); return ff.load().then(function () { document.fonts.add(ff); if (addFont(nm, "display", "user")) toast("Added " + nm); st.q = ""; $("fn-q").value = ""; renderGrid(); openBig(nm); }); }).catch(function () { toast("Could not read that font file"); }); };

	/* ---------- tabs ---------- */
	function tab(t) { st.tab = t; ["browse", "compare", "find"].forEach(function (k) { $("fn-p-" + k).hidden = k !== t; $("fn-t-" + k).setAttribute("aria-pressed", String(k === t)); }); if (t === "compare") renderCompare(); }
	["browse", "compare", "find"].forEach(function (k) { $("fn-t-" + k).onclick = function () { tab(k); }; });

	/* ---------- find a font from a picture ---------- */
	var src = null, box = null, drag = null, cv = $("fn-cv"), cx = cv.getContext("2d");
	var drop = $("fn-drop"), inp = $("fn-img");
	drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
	inp.onchange = function () { if (inp.files[0]) loadPic(inp.files[0]); inp.value = ""; };
	["dragover", "dragenter"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); }); ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove("is-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) loadPic(f); });
	document.addEventListener("paste", function (e) { if (st.tab !== "find") return; var it = (e.clipboardData && e.clipboardData.files) || []; for (var i = 0; i < it.length; i++) if (/^image\//.test(it[i].type)) { e.preventDefault(); loadPic(it[i]); return; } });
	function loadPic(f) {
		var u = URL.createObjectURL(f), im = new Image(); im.onload = function () { var s = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); src = document.createElement("canvas"); src.width = Math.round(im.naturalWidth * s); src.height = Math.round(im.naturalHeight * s); src.getContext("2d").drawImage(im, 0, 0, src.width, src.height); URL.revokeObjectURL(u); box = null; $("fn-pic").hidden = false; $("fn-matchrow").hidden = false; $("fn-results").innerHTML = ""; $("fn-matchnote").textContent = "Drag a box around one line of text in the picture (or leave it empty to use the whole picture), then type what it says."; drawPic(); };
		im.onerror = function () { URL.revokeObjectURL(u); toast("Could not read that picture"); }; im.src = u;
	}
	function drawPic() { var maxW = Math.min(src.width, 720), s = maxW / src.width; cv.width = Math.round(src.width * s); cv.height = Math.round(src.height * s); cx.drawImage(src, 0, 0, cv.width, cv.height); showSel(); }
	function pt(e) { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
	function showSel() { var s = $("fn-sel"); if (!box) { s.hidden = true; return; } s.hidden = false; s.style.left = box.x0 * 100 + "%"; s.style.top = box.y0 * 100 + "%"; s.style.width = (box.x1 - box.x0) * 100 + "%"; s.style.height = (box.y1 - box.y0) * 100 + "%"; }
	cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); drag = pt(e); });
	cv.addEventListener("pointermove", function (e) { if (!drag) return; var p = pt(e); box = { x0: Math.min(drag.x, p.x), y0: Math.min(drag.y, p.y), x1: Math.max(drag.x, p.x), y1: Math.max(drag.y, p.y) }; showSel(); });
	cv.addEventListener("pointerup", function () { drag = null; if (box && (box.x1 - box.x0 < 0.02 || box.y1 - box.y0 < 0.02)) { box = null; showSel(); } });
	var GW = 96, GH = 24, matchTok = 0;
	function targetGrid() {
		var bx = box ? { x: Math.floor(box.x0 * src.width), y: Math.floor(box.y0 * src.height), w: Math.max(4, Math.ceil((box.x1 - box.x0) * src.width)), h: Math.max(4, Math.ceil((box.y1 - box.y0) * src.height)) } : { x: 0, y: 0, w: src.width, h: src.height };
		var id = src.getContext("2d").getImageData(bx.x, bx.y, bx.w, bx.h), gray = new Array(bx.w * bx.h); for (var i = 0; i < gray.length; i++) gray[i] = id.data[i * 4] * 0.299 + id.data[i * 4 + 1] * 0.587 + id.data[i * 4 + 2] * 0.114;
		var b = F.binarise(gray), ib = F.inkBox(b, bx.w, bx.h); if (!ib) return null; return { g: F.grid(b, bx.w, bx.h, ib, GW, GH), asp: ib.w / ib.h, crop: { x: bx.x + ib.x, y: bx.y + ib.y, w: ib.w, h: ib.h } };
	}
	var rc = document.createElement("canvas"), rx = rc.getContext("2d", { willReadFrequently: true });
	function candGrid(f, text, weight, italic) {
		var size = 96; rx.font = (italic ? "italic " : "") + weight + " " + size + "px " + fam(f); var w = Math.ceil(rx.measureText(text).width) + 40, h = size * 2; rc.width = Math.min(w, 3000); rc.height = h; rx.fillStyle = "#fff"; rx.fillRect(0, 0, rc.width, h); rx.fillStyle = "#000"; rx.font = (italic ? "italic " : "") + weight + " " + size + "px " + fam(f); rx.textBaseline = "alphabetic"; rx.fillText(text, 20, size * 1.2);
		var id = rx.getImageData(0, 0, rc.width, h), b = new Uint8Array(rc.width * h); for (var i = 0; i < b.length; i++) b[i] = id.data[i * 4] < 128 ? 1 : 0; var ib = F.inkBox(b, rc.width, h); if (!ib) return null; return { g: F.grid(b, rc.width, h, ib, GW, GH), asp: ib.w / ib.h };
	}
	$("fn-match").onclick = function () {
		var text = $("fn-says").value.trim(); if (!src) return; if (!text) { toast("Type the words that appear in the picture"); $("fn-says").focus(); return; }
		var T = targetGrid(); if (!T) { toast("No text found in that area: choose a clearer part of the picture"); return; } var my = ++matchTok, out = [], i = 0, combos = [];
		fonts.forEach(function (f) { combos.push([f, "400", false]); combos.push([f, "700", false]); if (f.cat !== "mono") combos.push([f, "400", true]); }); $("fn-results").innerHTML = ""; $("fn-match").disabled = true;
		function step() {
			if (my !== matchTok) return; var t0 = Date.now(); while (i < combos.length && Date.now() - t0 < 14) { var c = combos[i++], g = candGrid(c[0], text, c[1], c[2]); if (g) out.push({ f: c[0], w: c[1], it: c[2], s: F.similarity(T.g, g.g, GW, GH, T.asp, g.asp) }); }
			$("fn-matchnote").textContent = "Comparing… " + Math.round(i / combos.length * 100) + "%";
			if (i < combos.length) { setTimeout(step, 0); return; }
			$("fn-match").disabled = false; var seen = {}, best = out.sort(function (a, b) { return b.s - a.s; }).filter(function (r) { var k = r.f.name; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 12);
			$("fn-matchnote").textContent = best.length ? "Closest fonts among the " + fonts.length + " this page can draw. A high score means the letter shapes and proportions agree; if nothing scores well, your font is probably not in the list: try “Add 80 popular Google Fonts”, or the other identifiers below." : "Nothing to compare.";
			var wrap = $("fn-results"); wrap.innerHTML = ""; best.forEach(function (r, k) {
				var d = document.createElement("div"); d.className = "fn-res"; var pic = document.createElement("canvas"); pic.width = 300; pic.height = 70; var px = pic.getContext("2d"); px.fillStyle = "#fff"; px.fillRect(0, 0, 300, 70); var s = Math.min(280 / T.crop.w, 56 / T.crop.h); px.drawImage(src, T.crop.x, T.crop.y, T.crop.w, T.crop.h, 10, (70 - T.crop.h * s) / 2, T.crop.w * s, T.crop.h * s);
				var smp = document.createElement("div"); smp.className = "fn-res-s"; smp.style.fontFamily = fam(r.f); smp.style.fontWeight = r.w; smp.style.fontStyle = r.it ? "italic" : "normal"; smp.textContent = text;
				var meta = document.createElement("div"); meta.className = "fn-res-m"; meta.innerHTML = "<b>" + (k + 1) + ". " + esc(r.f.name) + "</b> " + (r.w === "700" ? "bold " : "") + (r.it ? "italic " : "") + '<span class="fn-score">' + Math.round(r.s * 100) + "% match</span>";
				var use = document.createElement("button"); use.type = "button"; use.className = "tu-btn tu-btn--ghost"; use.textContent = "Use this font"; use.onclick = function () { S.text = text; S.runs = null; fillBox(); S.weight = r.w; $("fn-weight").value = r.w; S.italic = r.it; $("fn-italic").checked = r.it; save(); tab("browse"); changed(); openBig(r.f.name); };
				d.appendChild(meta); d.appendChild(pic); d.appendChild(smp); d.appendChild(use); wrap.appendChild(d);
			});
		}
		step();
	};

	/* ---------- start ---------- */
	renderGrid(); if (startFont && fontByName(startFont)) openBig(startFont);
})();
