/* MES AI rich answers (2026-11-20) -- window.MESAIRich, used by app.js (a js_parts file, so it is in the same served script).
 *   render(markdown, {pending}) -> sanitised HTML: Markdown (marked + DOMPurify, loaded by app.js) with LaTeX kept out of Markdown's way:
 *     $...$ / \(...\) inline and $$...$$ / \[...\] display become <span|div class="ai-tex"> typeset later by MathJax 3 (cdnjs, on first use).
 *   enhance(el, {pending}) -> code blocks get a language tag + Copy, ```chart blocks become SVG charts, tables get filter / sort /
 *     column resize / Copy / "Show as chart", math is typeset (not while the answer is still streaming).
 *   openIn(kind, mdText, el) -> "latex" (/latex?tex=), "text" (/text, Markdown), "docx" (/docx, a .docx made here), "pdf" (/pdf, a PDF made here).
 *   Everything shown comes out of DOMPurify or is built with textContent / escaped strings. */
(function () {
	"use strict";
	var T = function (s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/* ---------- math kept out of Markdown ---------- */
	// splits off code (``` fences and `inline`), then pulls math out of the rest; returns {text with tokens, list:[{tex, d}]}
	function pullMath(src) {
		var list = [], tok = function (tex, d) { list.push({ tex: tex.trim(), d: d }); return "MESTEX" + (list.length - 1) + "Z"; };
		var parts = String(src).split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/);
		for (var i = 0; i < parts.length; i += 2) {
			parts[i] = parts[i]
				.replace(/\$\$([\s\S]+?)\$\$/g, function (m, t) { return tok(t, true); })
				.replace(/\\\[([\s\S]+?)\\\]/g, function (m, t) { return tok(t, true); })
				.replace(/\\\(([\s\S]+?)\\\)/g, function (m, t) { return tok(t, false); })
				// $x$ but not money: no space just inside the $ signs, no digit / letter right after the closing $
				.replace(/(^|[^\\$\w])\$(?![\s$])([^$\n]*?[^\s\\$])\$(?![\w$])/g, function (m, pre, t) { return pre + tok(t, false); });
		}
		return { text: parts.join(""), list: list };
	}
	function texHtml(x) { return x.d ? '<div class="ai-tex ai-texd" data-tex="' + esc(x.tex) + '">\\[' + esc(x.tex) + "\\]</div>" : '<span class="ai-tex ai-texi" data-tex="' + esc(x.tex) + '">\\(' + esc(x.tex) + "\\)</span>"; }
	function putMath(html, list) {
		return html.replace(/<p>\s*MESTEX(\d+)Z\s*<\/p>/g, function (m, n) { var x = list[+n]; return x ? texHtml({ tex: x.tex, d: true }) : m; })
			.replace(/MESTEX(\d+)Z/g, function (m, n) { var x = list[+n]; return x ? texHtml(x) : m; });
	}
	function texList(md) { return pullMath(md).list; }

	var MJ = null;
	function mathJax() {
		if (MJ) return MJ;
		if (window.MathJax && window.MathJax.typesetPromise) return (MJ = Promise.resolve(window.MathJax));
		window.MathJax = { tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]], processEscapes: true }, svg: { fontCache: "local" }, options: { processHtmlClass: "ai-tex", ignoreHtmlClass: ".*" }, startup: { typeset: false } };
		MJ = new Promise(function (res, rej) {
			var s = document.createElement("script"); s.async = true; s.src = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js";
			s.onload = function () { window.MathJax.startup.promise.then(function () { res(window.MathJax); }, rej); };
			s.onerror = function () { MJ = null; rej(new Error("MathJax did not load")); };
			document.head.appendChild(s);
		});
		return MJ;
	}
	function typeset(el) {
		// only shown, finished math: MathJax can't measure a detached / hidden element (NaN sizes), and a streaming answer is retyped each piece
		function pick() { return [].slice.call(el.querySelectorAll(".ai-tex:not(.is-done)")).filter(function (e) { return e.isConnected && e.offsetParent !== null && !e.closest("[data-pending]"); }); }
		var els = pick();
		if (!els.length) return Promise.resolve();
		return mathJax().then(function (M) { els = pick(); return els.length ? M.typesetPromise(els) : null; }).then(function () { els.forEach(function (e) { e.classList.add("is-done"); }); }).catch(function () {});
	}

	/* ---------- Markdown ---------- */
	function render(md, mdOn, plain) {
		var p = pullMath(md), html;
		if (mdOn && window.marked && window.DOMPurify) html = window.DOMPurify.sanitize(window.marked.parse(p.text, { gfm: true, breaks: false }), { ADD_ATTR: ["target"] });
		else html = plain(p.text);
		return putMath(html, p.list);
	}

	/* ---------- numbers in table cells ---------- */
	function num(s) {
		s = String(s).trim().replace(/[\s,\u00a0$€£¥%]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/^−/, "-");
		return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
	}

	/* ---------- charts (plain SVG, drawn at the box's real width) ---------- */
	var PAL = ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
	function normSpec(o) {
		if (!o || typeof o !== "object") return null;
		var type = String(o.type || (o.chart && o.chart.type) || "bar").toLowerCase(), labels = o.labels || o.x || o.categories, series = o.series || o.datasets;
		if (o.data && !Array.isArray(o.data) && typeof o.data === "object") { labels = labels || o.data.labels; series = series || o.data.datasets || o.data.series; }
		if (Array.isArray(o.data) && Array.isArray(o.data[0])) {
			var cols = o.columns || [];
			labels = o.data.map(function (r) { return r[0]; });
			series = o.data[0].slice(1).map(function (x, j) { return { name: cols[j + 1] || "", data: o.data.map(function (r) { return r[j + 1]; }) }; });
		} else if (Array.isArray(o.data) && o.data.length && typeof o.data[0] === "object" && o.data[0] && !Array.isArray(o.data[0]) && !series) {
			var keys = Object.keys(o.data[0]), lk = keys.filter(function (k) { return isNaN(num(o.data[0][k])); })[0] || keys[0];
			labels = o.data.map(function (r) { return r[lk]; });
			series = keys.filter(function (k) { return k !== lk; }).map(function (k) { return { name: k, data: o.data.map(function (r) { return r[k]; }) }; });
		} else if (Array.isArray(o.data) && !series) series = [{ name: o.name || "", data: o.data }];
		if (!Array.isArray(series)) return null;
		series = series.slice(0, 8).map(function (s) { return Array.isArray(s) ? { name: "", data: s } : { name: String((s && (s.name || s.label)) || ""), data: ((s && (s.data || s.values)) || []).slice(0, 300).map(function (v) { return typeof v === "number" ? v : num(v); }) }; });
		var n = Math.max.apply(null, series.map(function (s) { return s.data.length; }).concat([0]));
		if (!n) return null;
		labels = (Array.isArray(labels) ? labels : []).slice(0, n).map(String);
		while (labels.length < n) labels.push(String(labels.length + 1));
		type = /pie|doughnut|donut/.test(type) ? "pie" : /line|area|scatter/.test(type) ? "line" : "bar";
		return { type: type, title: String(o.title || (o.options && o.options.title && o.options.title.text) || "").slice(0, 120), labels: labels, series: series };
	}
	function nice(lo, hi) {
		if (lo === hi) { hi = lo + 1; lo = lo - (lo ? 1 : 0); }
		var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 5))), r = span / 5 / step;
		step *= r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1;
		var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
		for (var v = a; v <= b + step / 2; v += step) ticks.push(+v.toPrecision(12));
		return { lo: a, hi: b, ticks: ticks };
	}
	function fmt(v) { var a = Math.abs(v); return a >= 1e9 ? +(v / 1e9).toFixed(2) + "B" : a >= 1e6 ? +(v / 1e6).toFixed(2) + "M" : a >= 1e4 ? +(v / 1e3).toFixed(1) + "k" : String(+v.toPrecision(6)); }
	function chartSvg(sp, W) {
		W = Math.max(260, Math.round(W)); var fs = 12, top = sp.title ? 26 : 8, multi = sp.series.length > 1;
		var H = Math.round(Math.min(380, Math.max(220, W * 0.55))), o = [];
		var t = function (x, y, s, a, extra) { return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + fs + '" fill="currentColor"' + (a ? ' text-anchor="' + a + '"' : "") + (extra || "") + ">" + esc(s) + "</text>"; };
		if (sp.title) o.push('<text x="' + W / 2 + '" y="17" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">' + esc(sp.title) + "</text>");
		if (sp.type === "pie") {
			var d = sp.series[0].data.map(function (v) { return v > 0 ? v : 0; }), sum = d.reduce(function (a, b) { return a + b; }, 0) || 1;
			var legendW = W > 520 ? Math.min(220, W * 0.38) : 0, R = Math.min((W - legendW) / 2, (H - top) / 2) - 10, cx = (W - legendW) / 2, cy = top + (H - top) / 2, a0 = -Math.PI / 2;
			d.forEach(function (v, i) {
				var a1 = a0 + v / sum * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, c = PAL[i % PAL.length], tip = esc(sp.labels[i] + ": " + fmt(v) + " (" + Math.round(v / sum * 1000) / 10 + "%)");
				if (v / sum > 0.9999) o.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + c + '"><title>' + tip + "</title></circle>");
				else if (v > 0) o.push('<path d="M' + cx + " " + cy + "L" + (cx + R * Math.cos(a0)).toFixed(1) + " " + (cy + R * Math.sin(a0)).toFixed(1) + "A" + R + " " + R + " 0 " + big + " 1 " + (cx + R * Math.cos(a1)).toFixed(1) + " " + (cy + R * Math.sin(a1)).toFixed(1) + 'Z" fill="' + c + '" stroke="var(--ai-bot,#fff)" stroke-width="1.5"><title>' + tip + "</title></path>");
				a0 = a1;
			});
			var ly = legendW ? top + 10 : H + 6, lx = legendW ? W - legendW + 8 : 8;
			if (!legendW) H += Math.ceil(d.length / Math.max(1, Math.floor(W / 150))) * 18 + 6;
			d.forEach(function (v, i) {
				var x = legendW ? lx : 8 + (i % Math.max(1, Math.floor(W / 150))) * 150, y = legendW ? ly + i * 18 : ly + Math.floor(i / Math.max(1, Math.floor(W / 150))) * 18;
				o.push('<rect x="' + x + '" y="' + (y - 10) + '" width="11" height="11" rx="2" fill="' + PAL[i % PAL.length] + '"/>' + t(x + 16, y, (sp.labels[i] + " " + Math.round(v / sum * 1000) / 10 + "%").slice(0, 30)));
			});
			return '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(sp.title || "Chart") + '">' + o.join("") + "</svg>";
		}
		var all = []; sp.series.forEach(function (s) { s.data.forEach(function (v) { if (isFinite(v)) all.push(v); }); });
		if (!all.length) return "";
		var sc = nice(Math.min(0, Math.min.apply(null, all)), Math.max(0, Math.max.apply(null, all)));
		var lw = Math.max.apply(null, sc.ticks.map(function (v) { return fmt(v).length; })) * 7 + 12;
		if (multi) top += 22;
		var n = sp.labels.length, l = lw, r = 12, pw = W - l - r, maxLab = Math.max.apply(null, sp.labels.map(function (s) { return s.length; })), slot = pw / n;
		var rot = maxLab * 6.5 > slot * 0.95, b = rot ? Math.min(90, maxLab * 5 + 20) : 28, ph = H - top - b;
		var y = function (v) { return top + ph - (v - sc.lo) / (sc.hi - sc.lo) * ph; };
		sc.ticks.forEach(function (v) { o.push('<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="currentColor" stroke-opacity="' + (v === 0 ? 0.45 : 0.13) + '"/>' + t(l - 6, y(v) + 4, fmt(v), "end")); });
		var every = Math.max(1, Math.ceil((rot ? 14 : maxLab * 6.5 + 8) / slot));
		sp.labels.forEach(function (s, i) {
			if (i % every) return;
			var x = l + slot * (i + 0.5), lab = s.length > 24 ? s.slice(0, 23) + "…" : s;
			o.push(rot ? t(x, top + ph + 12, lab, "end", ' transform="rotate(-38 ' + x.toFixed(1) + " " + (top + ph + 12) + ')"') : t(x, top + ph + 17, lab, "middle"));
		});
		if (sp.type === "bar") {
			var gw = slot * 0.78, bw = gw / sp.series.length;
			sp.series.forEach(function (s, k) {
				s.data.forEach(function (v, i) {
					if (!isFinite(v)) return;
					var x = l + slot * i + (slot - gw) / 2 + bw * k, y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
					o.push('<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + Math.max(0.5, h).toFixed(1) + '" rx="2" fill="' + PAL[k % PAL.length] + '"><title>' + esc((s.name ? s.name + ", " : "") + sp.labels[i] + ": " + fmt(v)) + "</title></rect>");
				});
			});
		} else {
			sp.series.forEach(function (s, k) {
				var pts = [], c = PAL[k % PAL.length];
				s.data.forEach(function (v, i) { if (isFinite(v)) pts.push([l + slot * (i + 0.5), y(v), v, i]); });
				o.push('<polyline fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>');
				if (pts.length <= 80) pts.forEach(function (p) { o.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="' + c + '"><title>' + esc((s.name ? s.name + ", " : "") + sp.labels[p[3]] + ": " + fmt(p[2])) + "</title></circle>"); });
			});
		}
		if (multi) {
			var x = l;
			sp.series.forEach(function (s, k) {
				var nm = (s.name || T("Series {n}", { n: k + 1 })).slice(0, 24);
				o.push('<rect x="' + x + '" y="' + (top - 18) + '" width="11" height="11" rx="2" fill="' + PAL[k % PAL.length] + '"/>' + t(x + 15, top - 8, nm));
				x += nm.length * 7 + 30;
			});
		}
		return '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(sp.title || "Chart") + '">' + o.join("") + "</svg>";
	}
	var RO = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { var b = e.target; if (b.__sp && Math.abs((b.__w || 0) - b.clientWidth) > 4) drawChart(b); }); }) : null;
	function drawChart(box) { box.__w = box.clientWidth; box.querySelector(".ai-chsvg").innerHTML = chartSvg(box.__sp, box.clientWidth - 2); }
	function chartBox(sp, opts) {
		var box = document.createElement("div"); box.className = "ai-chart"; box.__sp = sp;
		var types = sp.series.length === 1 ? ["bar", "line", "pie"] : ["bar", "line"];
		box.innerHTML = '<div class="ai-chbar">' + types.map(function (k) { return '<button type="button" class="ai-mini" data-ct="' + k + '" aria-pressed="' + (k === sp.type) + '">' + esc({ bar: T("Bars"), line: T("Line"), pie: T("Pie") }[k]) + "</button>"; }).join("") +
			'<button type="button" class="ai-mini" data-cpng>' + esc(T("Save picture")) + "</button>" + (opts && opts.close ? '<button type="button" class="ai-mini" data-cclose>' + esc(T("Hide chart")) + "</button>" : "") + '</div><div class="ai-chsvg"></div>';
		box.addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.dataset.ct) { sp.type = b.dataset.ct; [].forEach.call(box.querySelectorAll("[data-ct]"), function (x) { x.setAttribute("aria-pressed", x === b); }); drawChart(box); }
			if (b.hasAttribute("data-cpng")) svgPng(box.querySelector("svg"), (sp.title || "chart").replace(/[^\w -]+/g, "").trim().slice(0, 40) || "chart");
			if (b.hasAttribute("data-cclose")) { box.remove(); if (opts.onClose) opts.onClose(); }
		});
		setTimeout(function () { drawChart(box); if (RO) RO.observe(box); }, 0);
		return box;
	}
	function svgText(svg) { // a stand-alone copy with real colours (for pictures and the PDF)
		var c = svg.cloneNode(true), dark = document.body.classList.contains("dark-mode");
		c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		return new XMLSerializer().serializeToString(c).replace(/currentColor/g, "#222").replace(/var\(--ai-bot,#fff\)/g, "#fff") + (dark ? "" : "");
	}
	function svgImage(svg, scale) {
		var w = svg.width.baseVal.value || svg.getBoundingClientRect().width, h = svg.height.baseVal.value || svg.getBoundingClientRect().height;
		return new Promise(function (res, rej) {
			var im = new Image(); im.onload = function () { var cv = document.createElement("canvas"); cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale); var x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height); res(cv); };
			im.onerror = rej; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText(svg));
		});
	}
	function svgPng(svg, name) { if (!svg) return; svgImage(svg, 2).then(function (cv) { cv.toBlob(function (b) { dl(b, name + ".png"); }); }); }
	function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }

	/* ---------- tables: filter, sort, resize, copy, chart ---------- */
	function tableData(t, onlyShown) {
		var rows = [].slice.call(t.rows).filter(function (r) { return !onlyShown || !r.hidden; });
		return rows.map(function (r) { return [].map.call(r.cells, function (c) { return c.innerText.replace(/\s+/g, " ").trim(); }); });
	}
	function tableSpec(t) {
		var d = tableData(t, true); if (d.length < 3 || d[0].length < 2) return null;
		var head = d[0], body = d.slice(1), cols = [];
		for (var j = 1; j < head.length; j++) { var ok = body.filter(function (r) { return isFinite(num(r[j])); }).length; if (ok >= Math.max(2, body.length * 0.6)) cols.push(j); }
		if (!cols.length) return null;
		return { type: body.length > 14 && cols.length < 3 ? "line" : "bar", title: "", labels: body.map(function (r) { return r[0]; }), series: cols.slice(0, 8).map(function (j) { return { name: head[j], data: body.map(function (r) { return num(r[j]); }) }; }) };
	}
	function enhanceTable(t, copy) {
		if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("ai-tscroll")) return;
		var head = t.tHead && t.tHead.rows[0], body = t.tBodies[0]; if (!head || !body) return;
		var wrap = document.createElement("div"), scroll = document.createElement("div"), bar = document.createElement("div");
		wrap.className = "ai-tbl"; scroll.className = "ai-tscroll"; bar.className = "ai-tbar";
		t.parentNode.insertBefore(wrap, t); scroll.appendChild(t); wrap.appendChild(bar); wrap.appendChild(scroll);
		var rows = [].slice.call(body.rows); rows.forEach(function (r, i) { r.__i = i; });
		var many = rows.length > 4, canChart = !!tableSpec(t);
		bar.innerHTML = (many ? '<input type="search" class="ai-tfilter" placeholder="' + esc(T("Filter rows")) + '" aria-label="' + esc(T("Filter rows")) + '"><span class="ai-tcount"></span>' : "") +
			'<button type="button" class="ai-mini" data-tcopy title="' + esc(T("Copy the table (pastes into Excel or Sheets)")) + '">' + esc(T("Copy table")) + "</button>" +
			(canChart ? '<button type="button" class="ai-mini" data-tchart>' + esc(T("📊 Show as chart")) + "</button>" : "");
		var fi = bar.querySelector(".ai-tfilter"), cnt = bar.querySelector(".ai-tcount");
		function count() { if (!cnt) return; var n = rows.filter(function (r) { return !r.hidden; }).length; cnt.textContent = n === rows.length ? "" : T("{n} of {all} rows", { n: n, all: rows.length }); }
		if (fi) fi.addEventListener("input", function () { var w = fi.value.toLowerCase().split(/\s+/).filter(Boolean); rows.forEach(function (r) { var s = r.innerText.toLowerCase(); r.hidden = !w.every(function (x) { return s.indexOf(x) >= 0; }); }); count(); });
		bar.addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.hasAttribute("data-tcopy")) copy(tableData(t, true).map(function (r) { return r.join("\t"); }).join("\n"), b);
			if (b.hasAttribute("data-tchart")) {
				var old = wrap.querySelector(".ai-chart"); if (old) { old.remove(); b.setAttribute("aria-pressed", "false"); return; }
				var sp = tableSpec(t); if (!sp) return;
				b.setAttribute("aria-pressed", "true");
				wrap.appendChild(chartBox(sp, { close: true, onClose: function () { b.setAttribute("aria-pressed", "false"); } }));
			}
		});
		[].forEach.call(head.cells, function (th, j) {
			th.classList.add("ai-th"); th.tabIndex = 0; th.setAttribute("aria-sort", "none"); th.title = T("Click to sort");
			var g = document.createElement("span"); g.className = "ai-rz"; g.setAttribute("aria-hidden", "true"); th.appendChild(g);
			function sort() {
				var st = th.getAttribute("aria-sort"), next = st === "none" ? "ascending" : st === "ascending" ? "descending" : "none";
				[].forEach.call(head.cells, function (x) { x.setAttribute("aria-sort", "none"); });
				th.setAttribute("aria-sort", next);
				var cell = function (r) { return r.cells[j] ? r.cells[j].innerText.trim() : ""; };
				var sorted = rows.slice().sort(function (a, b) {
					if (next === "none") return a.__i - b.__i;
					var x = cell(a), y = cell(b), nx = num(x), ny = num(y), c = isFinite(nx) && isFinite(ny) ? nx - ny : isFinite(nx) ? -1 : isFinite(ny) ? 1 : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
					return next === "ascending" ? c : -c;
				});
				sorted.forEach(function (r) { body.appendChild(r); });
			}
			th.addEventListener("click", function (e) { if (e.target === g) return; sort(); });
			th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
			g.addEventListener("pointerdown", function (e) {
				e.preventDefault(); e.stopPropagation();
				if (t.style.tableLayout !== "fixed") { var ws = [].map.call(head.cells, function (c) { return c.offsetWidth; }); [].forEach.call(head.cells, function (c, k) { c.style.width = ws[k] + "px"; }); t.style.width = ws.reduce(function (a, b2) { return a + b2; }, 0) + "px"; t.style.tableLayout = "fixed"; }
				var x0 = e.clientX, w0 = th.offsetWidth, tw0 = t.offsetWidth;
				g.setPointerCapture(e.pointerId); wrap.classList.add("is-rz");
				function mv(ev) { var w = Math.max(40, w0 + ev.clientX - x0); th.style.width = w + "px"; t.style.width = (tw0 + w - w0) + "px"; }
				function up() { g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); wrap.classList.remove("is-rz"); }
				g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
			});
			g.addEventListener("dblclick", function (e) { e.stopPropagation(); [].forEach.call(head.cells, function (c) { c.style.width = ""; }); t.style.width = ""; t.style.tableLayout = ""; });
		});
		count();
	}

	/* ---------- code blocks and chart blocks ---------- */
	function enhance(el, opts, copy) {
		opts = opts || {};
		el.querySelectorAll("pre > code").forEach(function (code) {
			var pre = code.parentNode, lang = ((code.className.match(/language-([\w+#-]+)/) || [])[1] || "").toLowerCase();
			if (lang === "chart" || lang === "json-chart") {
				if (opts.pending) return;
				var sp = null; try { sp = normSpec(JSON.parse(code.textContent)); } catch (e) { sp = null; }
				if (!sp) { pre.insertAdjacentHTML("beforebegin", '<p class="ai-note">' + esc(T("This chart could not be drawn (its data is not valid JSON).")) + "</p>"); }
				else {
					var box = chartBox(sp, {}); pre.parentNode.insertBefore(box, pre); pre.hidden = true;
					var tg = document.createElement("button"); tg.type = "button"; tg.className = "ai-mini"; tg.textContent = T("Data");
					tg.addEventListener("click", function () { pre.hidden = !pre.hidden; tg.setAttribute("aria-pressed", !pre.hidden); });
					box.querySelector(".ai-chbar").appendChild(tg);
				}
			}
			if (pre.querySelector(".ai-copy")) return;
			if (lang && lang !== "chart") { var lt = document.createElement("span"); lt.className = "ai-lang-tag"; lt.textContent = lang; pre.appendChild(lt); }
			var b = document.createElement("button"); b.type = "button"; b.className = "ai-copy"; b.textContent = T("Copy");
			b.addEventListener("click", function () { copy(code.innerText, b); });
			pre.appendChild(b);
		});
		el.querySelectorAll(".ai-md table").forEach(function (t) { enhanceTable(t, copy); });
	}

	/* ---------- hand-offs to /latex, /text, /docx, /pdf ---------- */
	function hput(file) { // same format as MESLinkOpen.sendTo / MESImg (IndexedDB "mes-handoff")
		return new Promise(function (res, rej) {
			var r = indexedDB.open("mes-handoff", 1);
			r.onupgradeneeded = function () { r.result.createObjectStore("h"); };
			r.onerror = function () { rej(r.error); };
			r.onsuccess = function () {
				var db = r.result, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10), tx = db.transaction("h", "readwrite");
				tx.objectStore("h").put({ t: Date.now(), files: [{ name: file.name, type: file.type, blob: file }], src: "" }, id);
				tx.oncomplete = function () { db.close(); res(id); }; tx.onerror = function () { db.close(); rej(tx.error); };
			};
		});
	}
	// a window is opened inside the click (pop-up blockers), the file is made, then the window goes to the page
	function sendFile(page, make) {
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) {}
		if (w) try { w.document.title = T("Opening…"); w.document.body.innerHTML = '<p style="font:16px system-ui;padding:2em">' + esc(T("Making the file…")) + "</p>"; } catch (e) {}
		return Promise.resolve().then(make).then(function (file) { return hput(file); }).then(function (id) {
			var url = page + "?handoff=" + encodeURIComponent(id);
			if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; } else location.href = url;
		}, function (e) { if (w) w.close(); throw e; });
	}
	function baseName(md) { var h = (String(md).match(/^#+\s*(.+)$/m) || [])[1] || String(md).replace(/[#*_`>$\\]/g, " ").trim().split(/\s+/).slice(0, 6).join(" "); return (h.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "mes-ai-answer"); }

	// the answer as blocks: {k: h|p|li|code|quote|table|tex|img, ...} read from the shown message (math as TeX, charts as pictures)
	function blocks(el) {
		var out = [];
		function inl(node) { // -> runs [{t, b, i, m (mono), u (link)}]
			var runs = [];
			(function walk(n, st) {
				if (n.nodeType === 3) { if (n.nodeValue) runs.push({ t: n.nodeValue, b: st.b, i: st.i, m: st.m, u: st.u }); return; }
				if (n.nodeType !== 1 || n.matches("button, .ai-rz, .ai-copy, .ai-lang-tag, .ai-tbar")) return;
				if (n.classList.contains("ai-tex")) { runs.push({ t: n.dataset.tex || "", i: true, m: false, b: st.b, tex: true }); return; }
				var s = { b: st.b || /^(B|STRONG|TH)$/.test(n.nodeName), i: st.i || /^(I|EM)$/.test(n.nodeName), m: st.m || n.nodeName === "CODE", u: st.u || (n.nodeName === "A" ? n.href : "") };
				if (n.nodeName === "BR") { runs.push({ t: "\n" }); return; }
				[].forEach.call(n.childNodes, function (c) { walk(c, s); });
			})(node, {});
			return runs;
		}
		(function walk(n, depth, listType) {
			[].forEach.call(n.children, function (c) {
				var tag = c.nodeName;
				if (c.hidden) return;
				if (/^H[1-6]$/.test(tag)) out.push({ k: "h", lv: +tag[1], runs: inl(c) });
				else if (tag === "P") out.push({ k: "p", runs: inl(c), d: depth });
				else if (tag === "UL" || tag === "OL") { var i = 0; [].forEach.call(c.children, function (li) { i++; var sub = [].filter.call(li.children, function (x) { return /^(UL|OL|PRE|TABLE)$/.test(x.nodeName); }); var cl = li.cloneNode(true); [].forEach.call(cl.querySelectorAll("ul, ol, pre, table"), function (x) { x.remove(); }); out.push({ k: "li", runs: inl(cl), d: depth, mark: tag === "OL" ? i + "." : "•" }); sub.forEach(function (s) { var tmp = document.createElement("div"); tmp.appendChild(s.cloneNode(true)); walk(tmp, depth + 1); }); }); }
				else if (tag === "PRE") { var code = c.querySelector("code") || c; out.push({ k: "code", text: code.innerText.replace(/\s+$/, "") }); }
				else if (tag === "BLOCKQUOTE") out.push({ k: "quote", runs: inl(c) });
				else if (tag === "TABLE") out.push({ k: "table", rows: tableData(c, false) });
				else if (c.classList.contains("ai-texd")) out.push({ k: "tex", tex: c.dataset.tex || "", svg: c.querySelector("svg") });
				else if (c.classList.contains("ai-chart")) { var sv = c.querySelector("svg"); if (sv) out.push({ k: "img", svg: sv }); }
				else if (tag === "HR") out.push({ k: "p", runs: [{ t: "" }] });
				else walk(c, depth, listType);
			});
		})(el, 0);
		return out;
	}

	// a small .docx (store-only zip, no library): headings, paragraphs with bold / italic / code, lists, code blocks, tables
	var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
	function crc32(u) { var c = 0xffffffff; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
	function zip(files) {
		var enc = new TextEncoder(), parts = [], cent = [], off = 0;
		files.forEach(function (f) {
			var name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
			var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
			parts.push(new Uint8Array(h.buffer), name, data);
			var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
			cent.push(new Uint8Array(c.buffer), name);
			off += 30 + name.length + data.length;
		});
		var csize = cent.reduce(function (a, b) { return a + b.length; }, 0), e = new DataView(new ArrayBuffer(22));
		e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
		return new Blob(parts.concat(cent, [new Uint8Array(e.buffer)]));
	}
	function x(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""); }
	function docx(el, title) {
		var B = blocks(el), body = [];
		function runXml(r, size) {
			if (r.t === "\n") return "<w:r><w:br/></w:r>";
			var pr = (r.b ? "<w:b/>" : "") + (r.i ? "<w:i/>" : "") + (r.m || r.tex ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : "") + (r.u ? '<w:color w:val="1F4FBF"/><w:u w:val="single"/>' : "") + (size ? '<w:sz w:val="' + size + '"/>' : "");
			var t = r.tex ? "$" + r.t + "$" : r.t;
			return "<w:r>" + (pr ? "<w:rPr>" + pr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + x(t) + "</w:t></w:r>" + (r.u && r.u.indexOf(r.t.trim()) < 0 && /^https?:/.test(r.u) ? '<w:r><w:rPr><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve"> (' + x(r.u) + ")</w:t></w:r>" : "");
		}
		function para(runs, ppr, size) { return "<w:p>" + (ppr ? "<w:pPr>" + ppr + "</w:pPr>" : "") + runs.map(function (r) { return runXml(r, size); }).join("") + "</w:p>"; }
		B.forEach(function (b) {
			if (b.k === "h") body.push(para(b.runs.map(function (r) { r.b = true; return r; }), '<w:spacing w:before="240" w:after="120"/>', [0, 36, 32, 28, 26, 24, 24][b.lv]));
			else if (b.k === "p") body.push(para(b.runs, b.d ? '<w:ind w:left="' + 360 * b.d + '"/>' : "", 0));
			else if (b.k === "li") body.push(para([{ t: b.mark + " " }].concat(b.runs), '<w:ind w:left="' + (360 + 360 * b.d) + '" w:hanging="300"/>', 0));
			else if (b.k === "quote") body.push(para(b.runs.map(function (r) { r.i = true; return r; }), '<w:ind w:left="567"/>', 0));
			else if (b.k === "code") b.text.split("\n").forEach(function (l) { body.push(para([{ t: l || " ", m: true }], '<w:shd w:val="clear" w:fill="F2F3F6"/><w:spacing w:after="0"/>', 19)); });
			else if (b.k === "tex") body.push(para([{ t: b.tex, tex: true }], '<w:jc w:val="center"/>', 0));
			else if (b.k === "table" && b.rows.length) {
				var bd = '<w:tblBorders>' + ["top", "left", "bottom", "right", "insideH", "insideV"].map(function (s) { return "<w:" + s + ' w:val="single" w:sz="4" w:color="BBBBBB"/>'; }).join("") + "</w:tblBorders>";
				body.push('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + bd + "</w:tblPr>" + b.rows.map(function (r, i) { return "<w:tr>" + r.map(function (c) { return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + (i ? "" : '<w:shd w:val="clear" w:fill="EEF0F6"/>') + "</w:tcPr>" + para([{ t: c, b: !i }], "", 0) + "</w:tc>"; }).join("") + "</w:tr>"; }).join("") + "</w:tbl>", "<w:p/>");
			} else if (b.k === "img") body.push(para([{ t: "[" + T("Chart: see the answer on mes.fm/ai") + "]", i: true }], "", 0));
		});
		var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join("") + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
		var blob = zip([
			{ name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
			{ name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
			{ name: "docProps/core.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x(title) + '</dc:title><dc:creator>MES AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, "Z") + "</dcterms:created></cp:coreProperties>" },
			{ name: "word/document.xml", data: doc }
		]);
		return new File([blob], title + ".docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
	}

	// a PDF made of page pictures drawn here (any script and symbol works; equations and charts as pictures), no library
	function pdf(el, title) {
		var B = blocks(el), PW = 595, PH = 842, S = 2, M = 50, pages = [], cv, cx, y;
		function page() { cv = document.createElement("canvas"); cv.width = PW * S; cv.height = PH * S; cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.scale(S, S); cx.textBaseline = "alphabetic"; pages.push(cv); y = M; }
		function room(h) { if (y + h > PH - M) page(); }
		function font(r, size) { return (r.i ? "italic " : "") + (r.b ? "700 " : "400 ") + size + "px " + (r.m || r.tex ? "Menlo, Consolas, monospace" : "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif"); }
		function flow(runs, size, left, color) { // word-wraps runs across lines
			var lh = size * 1.45, x0 = M + left, xr = PW - M, xp = x0, line = [];
			function flush() { room(lh); line.forEach(function (w) { cx.font = w.f; cx.fillStyle = w.c; cx.fillText(w.t, w.x, y + size); if (w.u) { cx.fillRect(w.x, y + size + 1.5, w.w, 0.6); } }); y += lh; line = []; xp = x0; }
			runs.forEach(function (r) {
				if (r.t === "\n") { flush(); return; }
				var f = font(r, size), c = r.u ? "#1f4fbf" : color || "#1f2430", t = r.tex ? r.t : r.t;
				cx.font = f;
				t.split(/(\s+)/).forEach(function (w) {
					if (!w) return;
					var ww = cx.measureText(w).width;
					if (/^\s+$/.test(w)) { if (xp > x0) xp += cx.measureText(" ").width; return; }
					if (xp + ww > xr && xp > x0) flush();
					while (ww > xr - x0 && w.length > 1) { var k = Math.floor(w.length * (xr - x0) / ww); line.push({ t: w.slice(0, k), x: xp, f: f, c: c, u: r.u, w: cx.measureText(w.slice(0, k)).width }); flush(); w = w.slice(k); ww = cx.measureText(w).width; }
					line.push({ t: w, x: xp, f: f, c: c, u: r.u, w: ww }); xp += ww;
				});
			});
			if (line.length) flush();
		}
		var imgs = B.filter(function (b) { return b.svg; }).map(function (b) { return svgImage(b.svg, 3).then(function (c) { b.cv = c; }, function () {}); });
		return Promise.all(imgs).then(function () {
			page();
			cx.font = "700 20px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
			B.forEach(function (b) {
				if (b.k === "h") { y += 6; flow(b.runs, [0, 19, 16.5, 14.5, 13, 12, 12][b.lv], 0); y += 2; }
				else if (b.k === "p") { flow(b.runs, 11, 18 * (b.d || 0)); y += 5; }
				else if (b.k === "li") { flow([{ t: b.mark + " " }].concat(b.runs), 11, 12 + 18 * b.d); y += 2; }
				else if (b.k === "quote") { var y0 = y; flow(b.runs, 11, 14, "#555"); cx.fillStyle = "#ccd"; cx.fillRect(M + 3, y0, 2.5, y - y0); y += 5; }
				else if (b.k === "code") {
					b.text.split("\n").forEach(function (l) { room(13); cx.fillStyle = "#f2f3f6"; cx.fillRect(M, y, PW - 2 * M, 13); cx.font = "9.5px Menlo, Consolas, monospace"; cx.fillStyle = "#1f2430"; var s = l; while (cx.measureText(s).width > PW - 2 * M - 10 && s.length > 1) s = s.slice(0, -1); cx.fillText(s, M + 5, y + 9.8); y += 13; });
					y += 7;
				} else if ((b.k === "tex" || b.k === "img") && b.cv) {
					var w = b.cv.width / 3, h = b.cv.height / 3, k = Math.min(1, (PW - 2 * M) / w); w *= k; h *= k;
					if (h > PH - 2 * M) { k = (PH - 2 * M) / h; w *= k; h *= k; }
					room(h + 8); cx.drawImage(b.cv, b.k === "tex" ? (PW - w) / 2 : M, y, w, h); y += h + 8;
				} else if (b.k === "tex") { flow([{ t: b.tex, tex: true }], 11, 30); y += 5; }
				else if (b.k === "table" && b.rows.length) {
					var n = Math.max.apply(null, b.rows.map(function (r) { return r.length; })), cw = (PW - 2 * M) / n;
					b.rows.forEach(function (r, i) {
						cx.font = (i ? "400 " : "700 ") + "9.5px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
						var lines = r.map(function (c) { var out = [], cur = ""; String(c).split(/\s+/).forEach(function (w) { var tst = cur ? cur + " " + w : w; if (cx.measureText(tst).width > cw - 8 && cur) { out.push(cur); cur = w; } else cur = tst; }); out.push(cur); return out; });
						var h = Math.max.apply(null, lines.map(function (l) { return l.length; })) * 12 + 6; room(h);
						if (!i) { cx.fillStyle = "#eef0f6"; cx.fillRect(M, y, PW - 2 * M, h); }
						cx.strokeStyle = "#c8ccd6"; cx.lineWidth = 0.6;
						for (var j = 0; j < n; j++) { cx.strokeRect(M + j * cw, y, cw, h); cx.fillStyle = "#1f2430"; (lines[j] || []).forEach(function (l, q) { cx.fillText(l, M + j * cw + 4, y + 12 + q * 12); }); }
						y += h;
					});
					y += 8;
				}
			});
			return Promise.all(pages.map(function (c) { return new Promise(function (res) { c.toBlob(function (bl) { bl.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }); }, "image/jpeg", 0.9); }); }));
		}).then(function (jpgs) {
			var enc = new TextEncoder(), parts = [], off = 0, xref = [], n = 2 + jpgs.length * 3;
			function add(s) { var u = typeof s === "string" ? enc.encode(s) : s; parts.push(u); off += u.length; }
			function obj(i, body) { xref[i] = off; add(i + " 0 obj\n"); body.forEach(add); add("\nendobj\n"); }
			add("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
			obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
			var kids = jpgs.map(function (j, i) { return (3 + i * 3) + " 0 R"; }).join(" ");
			obj(2, ["<< /Type /Pages /Kids [" + kids + "] /Count " + jpgs.length + " >>"]);
			jpgs.forEach(function (j, i) {
				var p = 3 + i * 3, im = p + 1, ct = p + 2, cmd = "q " + PW + " 0 0 " + PH + " 0 0 cm /Im0 Do Q";
				obj(p, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>"]);
				obj(im, ["<< /Type /XObject /Subtype /Image /Width " + PW * S + " /Height " + PH * S + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + j.length + " >>\nstream\n", j, "\nendstream"]);
				obj(ct, ["<< /Length " + cmd.length + " >>\nstream\n" + cmd + "\nendstream"]);
			});
			var info = n + 1; obj(info, ["<< /Title (" + title.replace(/[()\\]/g, "") + ") /Creator (MES AI, mes.fm/ai) >>"]);
			var xo = off; add("xref\n0 " + (info + 1) + "\n0000000000 65535 f \n");
			for (var i = 1; i <= info; i++) add(String(xref[i] || 0).padStart(10, "0") + " 00000 n \n");
			add("trailer\n<< /Size " + (info + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\nstartxref\n" + xo + "\n%%EOF\n");
			return new File([new Blob(parts)], title + ".pdf", { type: "application/pdf" });
		});
	}

	function openIn(kind, md, el) {
		var name = baseName(md);
		if (kind === "latex") {
			var L = texList(md), out = [], len = 0;
			L.forEach(function (t) { var s = t.d ? "$$\n" + t.tex + "\n$$" : "$" + t.tex + "$"; if (len + s.length < 6000) { out.push(s); len += s.length + 2; } });
			if (!out.length) return Promise.reject(new Error("This answer has no math to open."));
			window.open("/latex?tex=" + encodeURIComponent(out.join("\n\n")), "_blank", "noopener");
			return Promise.resolve(out.length < L.length ? "some" : "all");
		}
		if (kind === "text") return sendFile("/text", function () { return new File([md], name + ".md", { type: "text/markdown" }); });
		if (kind === "docx") return sendFile("/docx", function () { return docx(el, name); });
		if (kind === "pdf") return sendFile("/pdf", function () { return typeset(el).then(function () { return pdf(el, name); }); });
		return Promise.reject(new Error("unknown"));
	}

	window.MESAIRich = { setT: function (fn) { T = fn; }, render: render, enhance: enhance, typeset: typeset, texList: texList, pullMath: pullMath, normSpec: normSpec, chartSvg: chartSvg, num: num, openIn: openIn, blocks: blocks, docx: docx, pdf: pdf, zip: zip, crc32: crc32 };
	if (typeof module !== "undefined" && module.exports) module.exports = window.MESAIRich;
})();
