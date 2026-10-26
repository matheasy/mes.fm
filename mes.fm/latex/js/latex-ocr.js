/* MES LaTeX Render -- "Picture to LaTeX" panel (mes.fm/latex)
 *
 * A picture (file, paste, drop, camera, or a link) is read IN THE BROWSER:
 *  - math: Pix2Text MFR 1.5 (breezedeus/pix2text-mfr-1.5 on Hugging Face, MIT licence; a TrOCR-style
 *    DeiT encoder + TrOCR decoder exported to ONNX, ~120 MB) run with onnxruntime-web 1.22.0 (WebGPU, else
 *    wasm). The files are not in the layout transformers.js expects (no onnx/ folder, no merged decoder),
 *    so the greedy decoding loop and the byte-level BPE detokeniser are written here. Model files are kept
 *    with the Cache API ("mes-latex-ocr-models"), pinned to one Hugging Face commit.
 *  - ordinary text: Tesseract.js 6.0.1 (same as mes.fm/image-to-text).
 * A link is fetched by the browser first; if the other site blocks that (CORS), by mes.fm/api/image-fetch.
 * Optional picture editing through window.MESPhotoPrep (main_js/photo-prep.js) when it is on the page.
 * The pure helpers (MESLxOcr: detokenise, tidy, line bands, aligned) also run in node:
 *   node tool_apps_src/latex-ocr-tests.js
 */
(function (root) {
	"use strict";

	/* ================= pure helpers ================= */

	// GPT-2 byte-level BPE: token characters -> bytes
	function byteDecoder() {
		var bs = [], cs, n = 0, b, map = {};
		for (b = 33; b <= 126; b++) bs.push(b);
		for (b = 161; b <= 172; b++) bs.push(b);
		for (b = 174; b <= 255; b++) bs.push(b);
		cs = bs.slice();
		for (b = 0; b < 256; b++) if (bs.indexOf(b) < 0) { bs.push(b); cs.push(256 + n); n++; }
		bs.forEach(function (x, i) { map[String.fromCharCode(cs[i])] = x; });
		return map;
	}
	var BYTES = null;
	function utf8(bytes) {
		if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(new Uint8Array(bytes));
		return Buffer.from(bytes).toString("utf8");
	}
	// ids -> text; inv[id] = token string; ids <= 4 are <pad> <s> </s> <unk> <mask>
	function detok(ids, inv) {
		BYTES = BYTES || byteDecoder();
		var s = ids.filter(function (i) { return i > 4 && inv[i] != null; }).map(function (i) { return inv[i]; }).join("");
		var out = [];
		for (var i = 0; i < s.length; i++) { var v = BYTES[s[i]]; out.push(v == null ? 63 : v); }
		return utf8(out);
	}

	// The model writes every token with a space ("x ^ { 2 }"). Keep a space only where TeX needs one:
	// after a command name (\pm, \alpha) when a letter follows.
	function collapseSpaces(s) {
		var out = "", i, c;
		s = String(s).replace(/\s+/g, " ").trim();
		for (i = 0; i < s.length; i++) {
			c = s[i];
			if (c !== " ") { out += c; continue; }
			var next = s[i + 1] || "";
			if (/[A-Za-z]/.test(next) && /\\[A-Za-z]+$/.test(out)) out += " ";
		}
		return out;
	}

	// index of the brace that closes the one at i (s[i] === "{"), or -1
	function closeBrace(s, i) {
		var d = 0;
		for (var j = i; j < s.length; j++) {
			if (s[j] === "\\") { j++; continue; }
			if (s[j] === "{") d++;
			else if (s[j] === "}") { d--; if (!d) return j; }
		}
		return -1;
	}
	function unwrapWhole(cell) {
		var t = cell.trim();
		while (t.length > 1 && t[0] === "{" && closeBrace(t, 0) === t.length - 1) t = t.slice(1, -1).trim();
		return t;
	}
	// split an environment body at top-level & and \\  -> rows of cells
	function splitCells(body) {
		var rows = [[]], cur = "", d = 0, i;
		for (i = 0; i < body.length; i++) {
			var c = body[i];
			if (c === "\\" && body[i + 1] === "\\" && !d) { rows[rows.length - 1].push(cur); rows.push([]); cur = ""; i++; continue; }
			if (c === "\\") { cur += c + (body[i + 1] || ""); i++; continue; }
			if (c === "{") d++; else if (c === "}") d--;
			if (c === "&" && !d) { rows[rows.length - 1].push(cur); cur = ""; continue; }
			cur += c;
		}
		rows[rows.length - 1].push(cur);
		// a trailing \\ leaves an empty last row
		while (rows.length > 1 && rows[rows.length - 1].join("").trim() === "") rows.pop();
		return rows;
	}
	var CELL_ENVS = "matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|aligned|array|cases|gathered|split";
	function tidyEnvs(s) {
		var re = new RegExp("\\\\begin\\{(" + CELL_ENVS + ")\\}", "g"), m, out = "", last = 0;
		while ((m = re.exec(s))) {
			var env = m[1], start = m.index, head = m[0];
			// array's column spec {cc|c} belongs to the head, not to the first cell
			if (env === "array" && s[start + head.length] === "{") { var ce = closeBrace(s, start + head.length); if (ce > 0) head = s.slice(start, ce + 1); }
			var bodyStart = start + head.length;
			var endTag = "\\end{" + env + "}", depth = 1, j = bodyStart, openTag = "\\begin{" + env + "}";
			while (depth && j < s.length) {
				var a = s.indexOf(openTag, j), b = s.indexOf(endTag, j);
				if (b < 0) { j = -1; break; }
				if (a >= 0 && a < b) { depth++; j = a + openTag.length; } else { depth--; j = b + (depth ? endTag.length : 0); }
			}
			if (j < 0) break;
			var body = tidyEnvs(s.slice(bodyStart, j));
			var rows = splitCells(body).map(function (r) { return r.map(unwrapWhole); });
			var rebuilt;
			if (env === "aligned" && rows.length === 1) {
				// one row: the alignment is pointless, "A & {}=B" -> "A=B"
				rebuilt = null;
				out += s.slice(last, start) + rows[0].map(function (c, k) { return k ? c.replace(/^\{\}(?=\s*(=|<|>|\\le|\\ge|\\approx|\\equiv|\\neq|\\to))/, "") : c; }).join("");
			} else {
				rebuilt = head + " " + rows.map(function (r) { return r.join(" & "); }).join(" \\\\ ") + " " + endTag;
				out += s.slice(last, start) + rebuilt;
			}
			last = j + endTag.length;
			re.lastIndex = last;
		}
		return out + s.slice(last);
	}
	var DELIM = { "(": ["(", ")", "pmatrix"], "[": ["[", "]", "bmatrix"], "|": ["|", "|", "vmatrix"], "\\{": ["\\{", "\\}", "Bmatrix"], "\\|": ["\\|", "\\|", "Vmatrix"] };
	function tidy(raw) {
		var s = String(raw || "");
		// medium / thick spaces the training data put around + - = \pm ... (not \, which is meaningful in "\,dx")
		s = s.replace(/\\[:;]\s*(?=[+\-=<>]|\\pm|\\mp|\\times|\\cdot|\\div)/g, " ")
			.replace(/([+\-=<>]|\\pm|\\mp|\\times|\\cdot|\\div)\s*\\[:;]/g, "$1 ");
		s = collapseSpaces(s);
		// \left( \begin{matrix} ... \end{matrix} \right) -> pmatrix (and [ ] | | \{ \})
		s = s.replace(/\\left(\(|\[|\||\\\{|\\\|)\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\\right(\)|\]|\||\\\}|\\\|)/g, function (all, l, body, r) {
			var d = DELIM[l];
			if (!d || d[1] !== r) return all;
			return "\\begin{" + d[2] + "}" + body + "\\end{" + d[2] + "}";
		});
		// ^{2} -> ^2, _{0} -> _0, ^{\pi} -> ^\pi (a space when a letter follows the command)
		s = s.replace(/([_^])\{([A-Za-z0-9]|\\[A-Za-z]+)\}(?=(.?))/g, function (all, op, x, nx) {
			return op + x + (x[0] === "\\" && /[A-Za-z]/.test(nx) ? " " : "");
		});
		// a stray one-letter group right after an exponent: \sum_{k=1}^n{k} -> \sum_{k=1}^nk
		s = s.replace(/([_^](?:[A-Za-z0-9]|\\[A-Za-z]+))\{([A-Za-z0-9])\}/g, function (all, a, b) { return a + (/[A-Za-z]$/.test(a) && a[1] === "\\" && /[A-Za-z]/.test(b) ? " " : "") + b; });
		s = s.replace(/\\(?:operatorname|mathrm)\{(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|det|sinh|cosh|tanh|arcsin|arccos|arctan)\}(?=(.?))/g, function (all, f, nx) {
			return "\\" + f + (/[A-Za-z]/.test(nx) ? " " : "");
		});
		s = collapseSpaces(s);
		// \underset{x\to0}{\operatorname*{lim}} -> \lim_{x\to0}; \operatorname*{max} -> \max
		s = s.replace(/\\operatorname\*?\{(lim|max|min|sup|inf|limsup|liminf|arg\s?max|arg\s?min)\}/g, function (all, f) { return /^(lim|max|min|sup|inf|limsup|liminf)$/.test(f) ? "\\" + f : "\\operatorname*{" + f + "}"; });
		s = s.replace(/\\underset\{((?:[^{}]|\{[^{}]*\})*)\}\{\\(lim|max|min|sup|inf|limsup|liminf)\}/g, "\\$2_{$1}");
		s = s.replace(/\\cfrac(?![A-Za-z])/g, "\\frac");
		// a brace with an aligned block of condition columns is a piecewise function: cases
		s = s.replace(/\\left\\\{\\begin\{(aligned|array)\}(\{[^{}]*\})?([\s\S]*?)\\end\{\1\}\\right\./g, function (all, env, spec, body) {
			if (/\\begin\{/.test(body)) return all;
			var rows = splitCells(body).map(function (r) {
				return r.map(function (c) { return unwrapWhole(c).replace(/^\{\}/, "").trim(); }).filter(Boolean).join(" & ");
			});
			return "\\begin{cases} " + rows.join(" \\\\ ") + " \\end{cases}";
		});
		s = collapseSpaces(s);
		s = tidyEnvs(s);
		// readable spacing around = and the arrows (purely cosmetic, TeX ignores it)
		s = s.replace(/\s*(=|\\(?:le|ge|neq|approx|equiv|Rightarrow|Leftrightarrow|to)(?![A-Za-z]))\s*/g, " $1 ").replace(/\s{2,}/g, " ").trim();
		return s;
	}

	// several recognised lines -> one aligned block, lined up at the first top-level relation of each line
	function aligned(lines) {
		lines = lines.map(function (l) { return String(l || "").trim(); }).filter(Boolean);
		if (lines.length < 2) return lines[0] || "";
		var rel = /(^|[^<>!\\])(=|\\le(?![a-z])|\\ge(?![a-z])|<|>|\\approx|\\equiv)/;
		var withRel = lines.filter(function (l) { return rel.test(topLevel(l)); }).length;
		var body = lines.map(function (l) {
			if (withRel < lines.length) return l;
			var t = topLevel(l), m = rel.exec(t);
			if (!m) return l;
			var at = m.index + m[1].length;
			return l.slice(0, at).trim() + " & " + l.slice(at).trim();
		});
		return "\\begin{aligned}\n" + body.join(" \\\\\n") + "\n\\end{aligned}";
	}
	// the string with everything inside braces blanked out (same length), for finding top-level symbols
	function topLevel(s) {
		var out = "", d = 0;
		for (var i = 0; i < s.length; i++) {
			var c = s[i];
			if (c === "{") d++;
			out += d ? " " : c;
			if (c === "}") d = Math.max(0, d - 1);
		}
		return out;
	}

	// rows of a picture with ink -> line bands [{y0, y1}] (y1 exclusive).
	// rowInk[y] = number of ink pixels in row y, w = width. Small gaps (inside a fraction, between a letter and
	// its superscript) are bridged; a band much shorter than the others (a fraction bar, a stray dot) joins its neighbour.
	function lineBands(rowInk, w, opts) {
		opts = opts || {};
		var h = rowInk.length, minInk = Math.max(1, Math.round(w * 0.002)), raw = [], y, s = -1;
		for (y = 0; y <= h; y++) {
			var on = y < h && rowInk[y] >= minInk;
			if (on && s < 0) s = y;
			if (!on && s >= 0) { raw.push({ y0: s, y1: y }); s = -1; }
		}
		if (raw.length < 2) return raw;
		var hs = raw.map(function (b) { return b.y1 - b.y0; }).sort(function (a, b) { return a - b; });
		var big = hs[hs.length - 1];
		// tiny bits first: bars, dots, accents (< 25% of the tallest piece) merge into the nearer neighbour
		var bands = raw.slice(), changed = true;
		while (changed && bands.length > 1) {
			changed = false;
			for (var i = 0; i < bands.length; i++) {
				var b = bands[i];
				if (b.y1 - b.y0 >= big * 0.25) continue;
				var gu = i > 0 ? b.y0 - bands[i - 1].y1 : 1e9, gd = i < bands.length - 1 ? bands[i + 1].y0 - b.y1 : 1e9;
				var k = gu <= gd ? i - 1 : i + 1;
				bands[k] = { y0: Math.min(bands[k].y0, b.y0), y1: Math.max(bands[k].y1, b.y1) };
				bands.splice(i, 1); changed = true; break;
			}
		}
		// then bridge gaps that are small next to the lines' own height
		var gapK = opts.gapK || 0.45, out = [bands[0]];
		for (i = 1; i < bands.length; i++) {
			var p = out[out.length - 1], c = bands[i], gap = c.y0 - p.y1;
			var hh = Math.min(p.y1 - p.y0, c.y1 - c.y0);
			if (gap < Math.max(3, hh * gapK)) out[out.length - 1] = { y0: p.y0, y1: c.y1 };
			else out.push(c);
		}
		return out;
	}

	// picture link check (same rules as mes.fm/translate's MESTr.imageLink)
	function imageLink(text) {
		var s = String(text == null ? "" : text).trim();
		if (!s || s.length > 2048 || /\s/.test(s)) return null;
		if (/^\/\//.test(s)) s = "https:" + s;
		if (!/^https?:\/\//i.test(s)) return null;
		var u;
		try { u = new URL(s); } catch (e) { return null; }
		if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password || !u.hostname) return null;
		u.hash = "";
		return u.toString();
	}
	function fmtMB(bytes) { return (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0) + " MB"; }

	var LIB = { byteDecoder: byteDecoder, detok: detok, collapseSpaces: collapseSpaces, tidy: tidy, splitCells: splitCells, unwrapWhole: unwrapWhole,
		aligned: aligned, topLevel: topLevel, lineBands: lineBands, imageLink: imageLink, fmtMB: fmtMB };
	if (typeof module !== "undefined" && module.exports) module.exports = LIB;
	root.MESLxOcr = LIB;
	if (typeof document === "undefined" || !document.getElementById("lxo")) return;

	/* ================= the page ================= */

	var REV = "1cef9f0bdcd6a4c63df7de1311fb0894593340cc";   // pinned Hugging Face commit of breezedeus/pix2text-mfr-1.5
	var HF = "https://huggingface.co/breezedeus/pix2text-mfr-1.5/resolve/" + REV + "/";
	var FILES = [["encoder_model.onnx", 87510770], ["decoder_model.onnx", 32026253]];
	var ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js";
	var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
	var CACHE = "mes-latex-ocr-models", KEY = "mes-latex-ocr:v1", SIZE = 384, MAX_TOK = 400;

	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var panel = $("lxo"), canvas = $("lxo-canvas"), status = $("lxo-status"), progWrap = $("lxo-prog"), progBar = $("lxo-progbar");
	var out = $("lxo-out"), preview = $("lxo-preview"), resNote = $("lxo-resnote");

	var S = { mode: "math", lines: "auto", where: "cursor", tidy: true, display: true, autoedit: true, lang: "eng", open: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in S) if (k in sv) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

	var pic = null;           // {canvas (full picture, upright), name}
	var sel = null;           // selection in picture pixels {x, y, w, h}
	var busy = false, gen = 0, lastIns = null;

	// ---------- settings UI ----------
	if (S.open) panel.open = true;
	panel.addEventListener("toggle", function () { S.open = panel.open; save(); if (panel.open) draw(); });
	function setMode(m) {
		S.mode = m; save();
		Array.prototype.forEach.call(panel.querySelectorAll(".lxo__mode"), function (b) {
			var on = b.getAttribute("data-mode") === m; b.classList.toggle("lxo__mode--on", on); b.setAttribute("aria-checked", on ? "true" : "false");
		});
		Array.prototype.forEach.call(panel.querySelectorAll(".lxo__opt--math"), function (e) { e.hidden = m !== "math"; });
		Array.prototype.forEach.call(panel.querySelectorAll(".lxo__opt--text"), function (e) { e.hidden = m !== "text"; });
		$("lxo-outlab").textContent = m === "math" ? "Recognised LaTeX (you can fix it here)" : "Recognised text (you can fix it here)";
		$("lxo-read").textContent = m === "math" ? "Read the formula" : "Read the text";
	}
	panel.querySelector(".lxo__modes").addEventListener("click", function (e) { var b = e.target.closest(".lxo__mode"); if (b) setMode(b.getAttribute("data-mode")); });
	function bindSel(id, key) { var el = $(id); el.value = S[key]; el.addEventListener("change", function () { S[key] = el.value; save(); }); }
	function bindChk(id, key) { var el = $(id); el.checked = !!S[key]; el.addEventListener("change", function () { S[key] = el.checked; save(); }); }
	bindSel("lxo-lines", "lines"); bindSel("lxo-where", "where"); bindSel("lxo-lang", "lang");
	bindChk("lxo-tidy", "tidy"); bindChk("lxo-display", "display"); bindChk("lxo-autoedit", "autoedit");
	setMode(S.mode);

	var hasPrep = function () { return !!(window.MESPhotoPrep && typeof window.MESPhotoPrep.open === "function"); };
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	if (coarse) $("lxo-cam").hidden = false;
	function prepUI() { $("lxo-autoedit").parentNode.hidden = !hasPrep(); $("lxo-edit").hidden = !pic || !hasPrep(); }
	prepUI();
	window.addEventListener("load", prepUI);

	function msg(t) { status.textContent = t || ""; }
	function prog(f) {
		if (f == null) { progWrap.hidden = true; return; }
		progWrap.hidden = false; progBar.style.width = Math.max(2, Math.min(100, f * 100)).toFixed(1) + "%";
	}
	function loadScript(url) {
		return new Promise(function (res, rej) {
			var s = document.createElement("script"); s.src = url; s.async = true;
			s.onload = res; s.onerror = function () { rej(new Error("Could not load " + url.split("/")[2] + ". Check your connection or ad blocker.")); };
			document.head.appendChild(s);
		});
	}

	// ---------- getting a picture ----------
	var fileIn = $("lxo-file"), camIn = $("lxo-camfile"), drop = $("lxo-drop");
	$("lxo-pick").addEventListener("click", function (e) { e.stopPropagation(); fileIn.click(); });
	$("lxo-cam").addEventListener("click", function (e) { e.stopPropagation(); camIn.click(); });
	drop.addEventListener("click", function (e) { if (!e.target.closest("button")) fileIn.click(); });
	drop.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === drop) { e.preventDefault(); fileIn.click(); } });
	fileIn.addEventListener("change", function () { if (fileIn.files[0]) loadFile(fileIn.files[0], { edit: true }); fileIn.value = ""; });
	camIn.addEventListener("change", function () { if (camIn.files[0]) loadFile(camIn.files[0], { edit: true, photo: true }); camIn.value = ""; });
	["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("lxo__drop--over"); }); });
	["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("lxo__drop--over"); }); });
	drop.addEventListener("drop", function (e) {
		var dt = e.dataTransfer; if (!dt) return;
		var f = dt.files && dt.files[0];
		if (f) { loadFile(f, { edit: true }); return; }
		var l = imageLink((dt.getData("text/uri-list") || "").split(/\r?\n/).filter(function (x) { return x && x[0] !== "#"; })[0] || dt.getData("text/plain"));
		if (l) { $("lxo-url").value = l; loadUrl(l); }
	});
	// a pasted picture anywhere on the page opens the panel; a pasted link only outside text boxes (or in the link box)
	document.addEventListener("paste", function (e) {
		var items = (e.clipboardData && e.clipboardData.items) || [];
		for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) {
			e.preventDefault(); openPanel(); loadFile(items[i].getAsFile(), { edit: false, pasted: true }); return;
		}
		var t = e.target, inBox = t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.id !== "lxo-url") || t.isContentEditable);
		if (inBox || !panel.open) return;
		var l = imageLink(e.clipboardData && e.clipboardData.getData("text/plain"));
		if (l) { e.preventDefault(); $("lxo-url").value = l; loadUrl(l); }
	});
	function openPanel() { if (!panel.open) panel.open = true; }

	// link: the browser first, then mes.fm/api/image-fetch (the other site blocks cross-site loading)
	var urlNote = $("lxo-urlnote"), urlGen = 0;
	function urlMsg(html, warn) { if (!html) { urlNote.hidden = true; return; } urlNote.hidden = false; urlNote.className = "lxo__note" + (warn ? " lxo__note--warn" : ""); urlNote.innerHTML = html; }
	function timed(url, opts, ms) {
		var ctl = window.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, ms);
		return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts)).finally(function () { clearTimeout(tm); });
	}
	function okType(t) { return /^image\//.test(t) && t !== "image/svg+xml"; }
	function direct(url) {
		return timed(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" }, 9000).then(function (r) {
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.blob();
		}).then(function (b) {
			var ty = (b.type || "").split(";")[0].toLowerCase();
			if (!okType(ty) && !(ty === "" || ty === "application/octet-stream")) throw new Error("not a picture");
			return b;
		});
	}
	function viaMes(url) {
		return timed("/api/image-fetch?url=" + encodeURIComponent(url), { credentials: "omit" }, 12000).then(function (r) {
			if (r.ok) return r.blob();
			return r.json().then(function (j) { throw new Error(j && j.error || ("mes.fm answered " + r.status)); }, function () { throw new Error(r.status === 404 ? "The mes.fm link fetcher is not available here." : "mes.fm answered " + r.status); });
		});
	}
	function loadUrl(raw) {
		var url = imageLink(raw);
		if (!url) { urlMsg("That is not a web link to a picture (it should start with https://).", true); return Promise.resolve(); }
		var my = ++urlGen, how = "direct", host = "";
		try { host = new URL(url).hostname; } catch (e) {}
		urlMsg("Opening the picture from " + esc(host) + "\u2026");
		$("lxo-urlgo").disabled = true;
		return direct(url).catch(function () {
			if (my !== urlGen) throw new Error("stale");
			how = "mes";
			urlMsg(esc(host) + " doesn't let other sites load its pictures directly, so mes.fm is fetching it for you\u2026");
			return viaMes(url);
		}).then(function (b) {
			if (my !== urlGen) return;
			var ty = (b.type || "").split(";")[0].toLowerCase();
			if (ty === "application/pdf") throw new Error("that link is a PDF; take a screenshot of the formula instead.");
			urlMsg(how === "mes"
				? "Fetched through mes.fm because " + esc(host) + " doesn't allow pictures to be loaded straight into other sites. mes.fm passed the file on and kept no copy; the picture itself is still read only in your browser."
				: "Opened straight from " + esc(host) + " in your browser.");
			return loadFile(b, { edit: false, name: (url.split("/").pop() || "picture").split("?")[0] });
		}).catch(function (e) {
			if (my !== urlGen || String(e && e.message) === "stale") return;
			urlMsg("Could not open that link: " + esc(e && e.message || e) + " You can save the picture and drop the file here instead.", true);
		}).then(function () { if (my === urlGen) $("lxo-urlgo").disabled = false; });
	}
	$("lxo-urlform").addEventListener("submit", function (e) { e.preventDefault(); loadUrl($("lxo-url").value); });

	function decode(blob) {
		if (window.createImageBitmap) {
			return createImageBitmap(blob, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(blob); }).catch(viaImg);
		}
		return viaImg();
		function viaImg() {
			return new Promise(function (res, rej) {
				var u = URL.createObjectURL(blob), im = new Image();
				im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
				im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("This picture can't be opened in this browser (HEIC pictures open only in Safari).")); };
				im.src = u;
			});
		}
	}
	// upright picture on a canvas, largest side at most 3000 px (enough for any formula, keeps memory small on phones)
	function toCanvas(src) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, k = Math.min(1, 3000 / Math.max(w, h));
		var c = document.createElement("canvas");
		c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
		var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
		g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
		return c;
	}
	function loadFile(blob, o) {
		o = o || {};
		if (!blob) return Promise.resolve();
		if (blob.type && !/^image\//.test(blob.type)) { msg("That file is not a picture."); return Promise.resolve(); }
		openPanel();
		msg("Opening the picture\u2026");
		return decode(blob).then(function (im) {
			var c = toCanvas(im);
			if (im.close) try { im.close(); } catch (e) {}
			setPicture(c, o.name || blob.name || "picture");
			msg(o.pasted ? "Picture pasted." : "");
			if (o.edit && S.autoedit && hasPrep()) return editPicture();
		}).catch(function (e) { msg(e && e.message || String(e)); });
	}
	function setPicture(c, name) {
		pic = { canvas: c, name: name }; sel = null;
		$("lxo-work").hidden = false;
		prepUI();
		$("lxo-unsel").hidden = true;
		draw();
	}
	function editPicture() {
		if (!pic || !hasPrep()) return Promise.resolve();
		var src = sel ? cropCanvas(pic.canvas, sel) : pic.canvas;
		return Promise.resolve(window.MESPhotoPrep.open(src, { title: "Edit the picture", done: "Use this picture", mime: "image/png", maxSide: 3000 })).then(function (r) {
			if (!r) return;
			var c = r.canvas;
			if (!c && r.blob) return decode(r.blob).then(function (im) { setPicture(toCanvas(im), pic.name); });
			if (c) setPicture(c, pic.name);
		}).catch(function (e) { msg("The picture editor failed: " + (e && e.message || e)); });
	}
	$("lxo-edit").addEventListener("click", editPicture);
	$("lxo-remove").addEventListener("click", function () { pic = null; sel = null; $("lxo-work").hidden = true; setFill(false); msg(""); });
	$("lxo-unsel").addEventListener("click", function () { sel = null; $("lxo-unsel").hidden = true; draw(); });

	// ---------- preview + selection ----------
	var stage = $("lxo-stage");
	function draw() {
		if (!pic) return;
		var c = pic.canvas, wrap = canvas.parentNode, fill = stage.classList.contains("lxo__stage--fill");
		var maxW = Math.max(100, wrap.clientWidth || 600), maxH = fill ? Math.max(120, window.innerHeight - stage.querySelector(".lxo__stagebar").offsetHeight - 24) : 420;
		var k = Math.min(fill ? 4 : 1, maxW / c.width, maxH / c.height), dpr = window.devicePixelRatio || 1;
		var cw = Math.max(1, Math.round(c.width * k)), ch = Math.max(1, Math.round(c.height * k));
		canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
		canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
		var g = canvas.getContext("2d");
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.imageSmoothingQuality = "high";
		g.drawImage(c, 0, 0, cw, ch);
		canvas._k = k;
		if (sel) {
			var x = sel.x * k, y = sel.y * k, w = sel.w * k, h = sel.h * k;
			g.fillStyle = "rgba(0,0,0,0.45)";
			g.fillRect(0, 0, cw, y); g.fillRect(0, y + h, cw, ch - y - h); g.fillRect(0, y, x, h); g.fillRect(x + w, y, cw - x - w, h);
			g.strokeStyle = "#1a9e6e"; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2)); g.setLineDash([]);
		}
		$("lxo-hint").textContent = sel ? "Only the part in the box is read" : "Drag on the picture to pick one formula (optional)";
	}
	window.addEventListener("resize", function () { if (pic && panel.open) draw(); });
	var dragFrom = null;
	function pt(e) { var r = canvas.getBoundingClientRect(), k = canvas._k || 1; return { x: Math.max(0, Math.min(pic.canvas.width, (e.clientX - r.left) / k)), y: Math.max(0, Math.min(pic.canvas.height, (e.clientY - r.top) / k)) }; }
	canvas.addEventListener("pointerdown", function (e) { if (!pic) return; dragFrom = pt(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
	canvas.addEventListener("pointermove", function (e) {
		if (!dragFrom) return;
		var p = pt(e), x = Math.min(p.x, dragFrom.x), y = Math.min(p.y, dragFrom.y);
		sel = { x: x, y: y, w: Math.abs(p.x - dragFrom.x), h: Math.abs(p.y - dragFrom.y) };
		draw();
	});
	function endDrag() {
		if (!dragFrom) return; dragFrom = null;
		var k = canvas._k || 1;
		if (!sel || sel.w * k < 8 || sel.h * k < 8) sel = null;
		else sel = { x: Math.round(sel.x), y: Math.round(sel.y), w: Math.round(sel.w), h: Math.round(sel.h) };
		$("lxo-unsel").hidden = !sel;
		draw();
	}
	canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);

	// fill window
	function setFill(on) {
		stage.classList.toggle("lxo__stage--fill", on);
		document.documentElement.classList.toggle("lxo-filling", on);
		$("lxo-fill").setAttribute("aria-pressed", on ? "true" : "false");
		$("lxo-fill").innerHTML = on ? "&times; Close" : "&#10530; Fill window";
		draw();
	}
	$("lxo-fill").addEventListener("click", function () { setFill(!stage.classList.contains("lxo__stage--fill")); });
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && stage.classList.contains("lxo__stage--fill")) setFill(false); });

	// ---------- picture -> model input ----------
	function cropCanvas(src, r) {
		var c = document.createElement("canvas"); c.width = Math.max(1, r.w); c.height = Math.max(1, r.h);
		c.getContext("2d").drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
		return c;
	}
	// grey levels at most 1000 px wide, the background level (most common), and whether the picture is light-on-dark
	function analyse(c) {
		var k = Math.min(1, 1000 / Math.max(c.width, c.height)), w = Math.max(1, Math.round(c.width * k)), h = Math.max(1, Math.round(c.height * k));
		var t = document.createElement("canvas"); t.width = w; t.height = h;
		var g = t.getContext("2d"); g.drawImage(c, 0, 0, w, h);
		var d = g.getImageData(0, 0, w, h).data, grey = new Uint8Array(w * h), hist = new Uint32Array(32), i;
		for (i = 0; i < w * h; i++) { var v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; grey[i] = v; hist[v >> 3]++; }
		var best = 0; for (i = 1; i < 32; i++) if (hist[i] > hist[best]) best = i;
		var bg = best * 8 + 4, thr = Math.max(40, Math.min(90, (bg < 128 ? 255 - bg : bg) * 0.3));
		return { w: w, h: h, k: k, grey: grey, bg: bg, dark: bg < 110, thr: thr };
	}
	function inkBox(a, y0, y1) {
		var x0 = a.w, x1 = -1, top = y1, bot = y0 - 1, x, y;
		for (y = y0; y < y1; y++) for (x = 0; x < a.w; x++) if (Math.abs(a.grey[y * a.w + x] - a.bg) > a.thr) {
			if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < top) top = y; if (y > bot) bot = y;
		}
		return x1 < 0 ? null : { x: x0, y: top, w: x1 - x0 + 1, h: bot - top + 1 };
	}
	function rowInk(a) {
		var r = new Array(a.h), x, y;
		for (y = 0; y < a.h; y++) { var n = 0; for (x = 0; x < a.w; x++) if (Math.abs(a.grey[y * a.w + x] - a.bg) > a.thr) n++; r[y] = n; }
		return r;
	}
	// one piece of the picture (in analysis pixels) -> Float32 pixel_values [1,3,384,384], dark-on-light, tightly cropped
	function modelInput(src, a, box) {
		var k = a.k, pad = Math.max(6, box.h * 0.12);
		var sx = Math.max(0, (box.x - pad) / k), sy = Math.max(0, (box.y - pad) / k);
		var sw = Math.min(src.width - sx, (box.w + 2 * pad) / k), sh = Math.min(src.height - sy, (box.h + 2 * pad) / k);
		var c = document.createElement("canvas"); c.width = c.height = SIZE;
		var g = c.getContext("2d");
		g.fillStyle = a.dark ? "#000" : "#fff"; g.fillRect(0, 0, SIZE, SIZE);
		g.imageSmoothingQuality = "high";
		g.drawImage(src, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
		var d = g.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE, f = new Float32Array(3 * n);
		for (var i = 0; i < n; i++) for (var ch = 0; ch < 3; ch++) {
			var v = d[i * 4 + ch] / 255; if (a.dark) v = 1 - v;
			f[ch * n + i] = (v - 0.5) / 0.5;
		}
		return f;
	}

	// ---------- the math model ----------
	var model = null, modelP = null;
	function ortLoad() { return window.ort ? Promise.resolve(window.ort) : loadScript(ORT_URL).then(function () { if (!window.ort) throw new Error("The AI engine did not start."); try { window.ort.env.logLevel = "error"; } catch (e) {} return window.ort; }); }
	function fetchCached(url, size, onBytes) {
		var cp = window.caches ? caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null);
		return cp.then(function (cache) {
			return (cache ? cache.match(url) : Promise.resolve(null)).then(function (hit) {
				if (hit) return hit.arrayBuffer().then(function (b) { onBytes(b.byteLength, true); return b; });
				return fetch(url, { credentials: "omit" }).then(function (r) {
					if (!r.ok) throw new Error("Model download failed (" + r.status + ")");
					if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (b) { onBytes(b.byteLength); return b; });
					var rd = r.body.getReader(), parts = [], got = 0;
					function pump() { return rd.read().then(function (x) { if (x.done) return; parts.push(x.value); got += x.value.length; onBytes(got); return pump(); }); }
					return pump().then(function () {
						var buf = new Uint8Array(got), p = 0; parts.forEach(function (a) { buf.set(a, p); p += a.length; });
						if (cache) cache.put(url, new Response(buf, { headers: { "content-type": "application/octet-stream" } })).catch(function () {});
						return buf.buffer;
					});
				});
			});
		});
	}
	function loadModel() {
		if (model) return Promise.resolve(model);
		if (modelP) return modelP;
		var total = FILES.reduce(function (a, f) { return a + f[1]; }, 0), got = [0, 0], cached = [false, false];
		function show() {
			var g = got[0] + got[1];
			if (cached[0] && cached[1]) { msg("Starting the formula reader\u2026"); return; }
			msg("Downloading the formula reader: " + fmtMB(g) + " of " + fmtMB(total) + " (only the first time)\u2026");
			prog(g / total);
		}
		show();
		modelP = Promise.all([ortLoad(), Promise.all([0, 1].map(function (i) {
			return fetchCached(HF + FILES[i][0], FILES[i][1], function (n, c) { got[i] = n; if (c) cached[i] = true; show(); });
		})), fetch(HF + "tokenizer.json", { credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error("Tokenizer download failed (" + r.status + ")"); return r.json(); })])
			.then(function (r) {
				var ort = r[0], bufs = r[1], tok = r[2], inv = [];
				Object.keys(tok.model.vocab).forEach(function (t) { inv[tok.model.vocab[t]] = t; });
				msg("Starting the formula reader\u2026"); prog(1);
				function sessions(ep) {
					return Promise.all(bufs.map(function (b) { return ort.InferenceSession.create(b, { executionProviders: [ep] }); }))
						.then(function (ss) { return { ort: ort, enc: ss[0], dec: ss[1], ep: ep, inv: inv, bufs: bufs }; });
				}
				var first = navigator.gpu ? sessions("webgpu").catch(function () { return sessions("wasm"); }) : sessions("wasm");
				return first;
			})
			.then(function (m) { model = m; return m; })
			.catch(function (e) { modelP = null; throw e; });
		return modelP;
	}
	function toWasm() {
		if (!model || model.ep === "wasm") return Promise.reject(new Error("no fallback"));
		var ort = model.ort, b = model.bufs;
		return Promise.all(b.map(function (x) { return ort.InferenceSession.create(x, { executionProviders: ["wasm"] }); })).then(function (ss) {
			model = { ort: ort, enc: ss[0], dec: ss[1], ep: "wasm", inv: model.inv, bufs: b }; return model;
		});
	}
	function recognise(pixels, my) {
		function go(m) {
			var ort = m.ort;
			return m.enc.run({ pixel_values: new ort.Tensor("float32", pixels, [1, 3, SIZE, SIZE]) }).then(function (eo) {
				var hidden = eo.last_hidden_state, ids = [1];
				function step() {
					if (my !== gen) return Promise.reject(new Error("stopped"));
					if (ids.length > MAX_TOK) return Promise.resolve(ids);
					var t = new ort.Tensor("int64", BigInt64Array.from(ids.map(function (x) { return BigInt(x); })), [1, ids.length]);
					return m.dec.run({ input_ids: t, encoder_hidden_states: hidden }).then(function (o) {
						var L = o.logits, V = L.dims[2], off = (ids.length - 1) * V, a = L.data, bi = 0, bv = -Infinity;
						for (var j = 0; j < V; j++) if (a[off + j] > bv) { bv = a[off + j]; bi = j; }
						if (bi === 2) return ids;
						ids.push(bi);
						// stuck in a loop (the same 8 tokens over and over): stop
						if (ids.length > 60 && ids.slice(-8).join() === ids.slice(-16, -8).join() && ids.slice(-8).join() === ids.slice(-24, -16).join()) return ids.slice(0, -16);
						return step();
					});
				}
				return step();
			}).then(function (ids) { return detok(ids, m.inv); });
		}
		return go(model).catch(function (e) {
			if (String(e && e.message) === "stopped" || model.ep === "wasm") throw e;
			return toWasm().then(go);   // some GPUs can't run every kernel: try again on the processor
		});
	}

	// ---------- text (Tesseract) ----------
	var tess = null, tessLang = "";
	function readText(c, my) {
		var p = window.Tesseract ? Promise.resolve() : loadScript(TESS_URL);
		return p.then(function () {
			if (tess && tessLang === S.lang) return tess;
			var old = tess; tess = null; if (old) old.terminate().catch(function () {});
			msg("Downloading the text reader (cached after the first time)\u2026");
			return window.Tesseract.createWorker(S.lang, 1, {
				logger: function (m) {
					if (my !== gen) return;
					if (m.status === "recognizing text") { msg("Reading the text\u2026 " + Math.round((m.progress || 0) * 100) + "%"); prog(0.3 + (m.progress || 0) * 0.7); }
					else if (/loading|initializ/i.test(m.status)) prog((m.progress || 0) * 0.3);
				}, errorHandler: function () {}
			}).then(function (w) { tess = w; tessLang = S.lang; return w; });
		}).then(function (w) { return w.recognize(c); }).then(function (r) {
			return String(r.data.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
		});
	}

	// ---------- read ----------
	var readBtn = $("lxo-read"), cancelBtn = $("lxo-cancel");
	function setBusy(b) { busy = b; readBtn.disabled = b; cancelBtn.hidden = !b; if (!b) prog(null); }
	cancelBtn.addEventListener("click", function () {
		gen++; setBusy(false); msg("Stopped.");
		if (S.mode === "text" && tess) { tess.terminate().catch(function () {}); tess = null; }
	});
	readBtn.addEventListener("click", function () { read(); });
	function read() {
		if (!pic || busy) return;
		var my = ++gen, src = sel ? cropCanvas(pic.canvas, sel) : pic.canvas, t0 = Date.now();
		setBusy(true);
		var job;
		if (S.mode === "text") {
			job = readText(src, my).then(function (txt) {
				if (my !== gen) return;
				if (!txt) { msg("No text was found in the picture."); return; }
				showResult(txt, "text");
				msg("Read in " + ((Date.now() - t0) / 1000).toFixed(1) + " s.");
			});
		} else {
			job = loadModel().then(function () {
				if (my !== gen) return;
				var a = analyse(src), boxes = [];
				if (S.lines !== "one") {
					var bands = lineBands(rowInk(a), a.w);
					if (bands.length > 1 && (S.lines === "split" || bands.length <= 12)) bands.forEach(function (b) { var bx = inkBox(a, b.y0, b.y1); if (bx) boxes.push(bx); });
				}
				if (boxes.length < 2) { var all = inkBox(a, 0, a.h); boxes = all ? [all] : []; }
				if (!boxes.length) { msg("The picture looks empty: no formula found."); return; }
				var res = [], i = 0;
				t0 = Date.now();
				function next() {
					if (my !== gen) return Promise.resolve();
					if (i >= boxes.length) return Promise.resolve();
					msg(boxes.length > 1 ? "Reading line " + (i + 1) + " of " + boxes.length + "\u2026" : "Reading the formula\u2026");
					prog(boxes.length > 1 ? i / boxes.length : null);
					return recognise(modelInput(src, a, boxes[i]), my).then(function (tex) { res.push(S.tidy ? tidy(tex) : tex.trim()); i++; return next(); });
				}
				return next().then(function () {
					if (my !== gen) return;
					var tex = res.length > 1 ? aligned(res) : res[0] || "";
					if (!tex) { msg("No formula was recognised. Try selecting just the formula, or a sharper picture."); return; }
					showResult(tex, "math");
					msg("Read in " + ((Date.now() - t0) / 1000).toFixed(1) + " s" + (boxes.length > 1 ? " (" + boxes.length + " lines)" : "") + " on the " + (model.ep === "webgpu" ? "graphics card" : "processor") + ". Check it: the reader can make mistakes.");
				});
			});
		}
		job.catch(function (e) {
			if (my !== gen || String(e && e.message) === "stopped") return;
			msg("Could not read the picture: " + (e && e.message || e));
		}).then(function () { if (my === gen) setBusy(false); });
	}

	// ---------- result: into the editor, preview, copy, fix ----------
	var resKind = "math";
	function wrapped(text, kind, src, at) {
		if (kind !== "math") return text;
		var inside = window.MESLatex && window.MESLatex.inMath ? window.MESLatex.inMath(src.value, at) : false;
		if (inside || !S.display) return inside ? text : "$" + text + "$";
		return "$$\n" + text + "\n$$";
	}
	function insert(text, kind) {
		var src = window.MESLatex && window.MESLatex.source || $("latex-source");
		if (!src || S.where === "none") return null;
		var v = src.value, start, end, ins;
		if (S.where === "replace") { start = 0; end = v.length; ins = wrapped(text, kind, { value: "" }, 0); }
		else {
			start = src.selectionStart == null ? v.length : src.selectionStart; end = src.selectionEnd == null ? start : src.selectionEnd;
			ins = wrapped(text, kind, src, start);
			// keep blocks on their own lines
			if (kind === "math" && /^\$\$/.test(ins)) { if (start > 0 && v[start - 1] !== "\n") ins = "\n\n" + ins; if (end < v.length && v[end] !== "\n") ins += "\n\n"; }
		}
		src.value = v.slice(0, start) + ins + v.slice(end);
		src.setSelectionRange(start + ins.length, start + ins.length);
		if (window.MESLatex && window.MESLatex.render) window.MESLatex.render(); else src.dispatchEvent(new Event("input"));
		return { start: start, text: ins };
	}
	function showResult(text, kind) {
		resKind = kind;
		$("lxo-res").hidden = false;
		out.value = text; autosize();
		renderPreview();
		lastIns = insert(text, kind);
		resNote.textContent = lastIns ? (S.where === "replace" ? "Put in the editor in place of what was there." : "Added to the editor.") : "";
		$("lxo-put").textContent = lastIns ? "Put the fixed version in the editor" : "Put it in the editor";
	}
	function autosize() { out.style.height = "auto"; out.style.height = Math.min(320, out.scrollHeight + 4) + "px"; }
	var pvT = 0;
	function renderPreview() {
		var t = out.value.trim();
		if (resKind !== "math") { preview.hidden = true; return; }
		preview.hidden = !t;
		preview.textContent = t ? "\\[" + t + "\\]" : "";
		if (t && window.MathJax && MathJax.typesetPromise) {
			try { MathJax.typesetClear([preview]); } catch (e) {}
			MathJax.typesetPromise([preview]).catch(function () {});
		}
	}
	out.addEventListener("input", function () { autosize(); clearTimeout(pvT); pvT = setTimeout(renderPreview, 300); });
	$("lxo-put").addEventListener("click", function () {
		var src = window.MESLatex && window.MESLatex.source || $("latex-source"), text = out.value.trim();
		if (!text || !src) return;
		var save0 = S.where;
		if (lastIns && src.value.substr(lastIns.start, lastIns.text.length) === lastIns.text) {
			// swap the earlier insert for the fixed one
			var ins = lastIns.text.replace(/^(\s*\$\$\n|\s*\$)[\s\S]*?(\n\$\$\s*|\$)$/, function (all, a, b) { return a + text + b; });
			if (ins === lastIns.text && !/^\s*\$/.test(lastIns.text)) ins = text;
			src.value = src.value.slice(0, lastIns.start) + ins + src.value.slice(lastIns.start + lastIns.text.length);
			lastIns = { start: lastIns.start, text: ins };
			if (window.MESLatex && window.MESLatex.render) window.MESLatex.render(); else src.dispatchEvent(new Event("input"));
			resNote.textContent = "Updated in the editor.";
		} else {
			if (S.where === "none") S.where = "cursor";
			lastIns = insert(text, resKind); S.where = save0;
			resNote.textContent = "Added to the editor.";
		}
	});
	$("lxo-copy").addEventListener("click", function () {
		var t = out.value;
		function ok() { resNote.textContent = "Copied."; }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { out.select(); document.execCommand("copy"); ok(); });
		else { out.select(); document.execCommand("copy"); ok(); }
	});
})(typeof window !== "undefined" ? window : globalThis);
