/* MES LaTeX Render -- mes.fm/latex
 *
 * Turns pasted LaTeX into rendered HTML + math. Math ($...$, $$...$$, \[..\],
 * \(..\) and the common amsmath environments) is handed to MathJax verbatim;
 * the surrounding text gets a lightweight LaTeX-ish -> HTML pass (sections,
 * lists, \textbf/\emph/..., a stripped \documentclass preamble). Everything
 * runs in the browser -- nothing is uploaded.
 */
(function () {
	"use strict";

	var source = document.getElementById("latex-source");
	var output = document.getElementById("latex-output");
	var errorBox = document.getElementById("latex-error");
	var statusEl = document.getElementById("latex-status");
	var STORAGE_KEY = "mes-latex-source";
	var PLACEHOLDER = '<span class="latex-tool__placeholder">Rendered LaTeX will appear here.</span>';

	var MATH_ENVS = "equation|align|aligned|alignat|flalign|gather|gathered|multline|" +
		"eqnarray|cases|split|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix";

	var STRIP_CMDS = /\\(maketitle|tableofcontents|newpage|clearpage|cleardoublepage|bigskip|medskip|smallskip|noindent|indent|centering|raggedright|raggedleft|par|hfill|vfill|hrulefill|dotfill|newline|linebreak|nolinebreak|pagebreak|nopagebreak|footnotesize|scriptsize|tiny|small|large|Large|LARGE|huge|Huge|normalsize|normalfont|rmfamily|itshape|slshape|scshape|upshape|mdseries|bfseries|sffamily|ttfamily|boldmath|unboldmath|displaystyle|textstyle|protect|sloppy|frenchspacing)\b\s?/g;

	var EXAMPLES = {
		quadratic:
			"The solutions of $ax^2 + bx + c = 0$ are given by the quadratic formula:\n\n" +
			"$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
		matrix:
			"$$A =\n\\begin{pmatrix}\n1 & 2 & 3 \\\\\n4 & 5 & 6 \\\\\n7 & 8 & 9\n\\end{pmatrix}\n\\qquad\n\\det(A) = 0$$",
		align:
			"\\begin{align}\n(a+b)^2 &= a^2 + 2ab + b^2 \\\\\n(a-b)^2 &= a^2 - 2ab + b^2 \\\\\na^2 - b^2 &= (a+b)(a-b)\n\\end{align}",
		cases:
			"$$f(x) =\n\\begin{cases}\n  x^2 & \\text{if } x \\ge 0 \\\\\n  -x  & \\text{if } x < 0\n\\end{cases}$$",
		integral:
			"A classic result:\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$\n\n" +
			"and the Basel sum:\n\n$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$$",
		doc:
			"\\documentclass{article}\n\\usepackage{amsmath}\n\n\\title{A Short Note}\n\\author{Math Easy Solutions}\n\\date{}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\nThis renderer skips the preamble and shows the body. Inline math such as\n$\\nabla \\cdot \\mathbf{E} = \\dfrac{\\rho}{\\varepsilon_0}$ works, and so do\ndisplay equations:\n\n\\begin{equation}\n  \\oint_{\\partial \\Omega} \\mathbf{B} \\cdot d\\mathbf{S} = 0\n\\end{equation}\n\n\\subsection{A list}\n\\begin{itemize}\n  \\item First point with \\textbf{bold} text.\n  \\item Second point with \\emph{emphasis}.\n\\end{itemize}\n\n\\end{document}",
		bare:
			"Paste math straight out of an AI chat reply and this still renders, even though the $ delimiters never made it into the clipboard \u2014 a formula-only paragraph like this one is detected automatically:\n\n" +
			"\\boxed{E = mc^2 = \\int_0^\\infty \\frac{\\hbar\\omega^3}{\\pi^2c^3}\\,\\frac{d\\omega}{e^{\\hbar\\omega/kT}-1}}\n\n" +
			"A boxed formula dropped into an ordinary sentence, like the Pythagorean theorem \\boxed{a^2+b^2=c^2} right here, gets rescued too even though the rest of this paragraph is plain prose."
	};

	/* ---- LaTeX -> HTML ------------------------------------------------------ */

	function escapeHtml(s) {
		return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	// one level of {...} without nested braces
	function replaceBraced(s, name, open, close) {
		var re = new RegExp("\\\\" + name + "\\s*\\{([^{}]*)\\}", "g");
		return s.replace(re, open + "$1" + close);
	}

	// index just past the '}' matching the '{' at s[i], at any nesting depth
	function braceEnd(s, i) {
		var depth = 0;
		for (var j = i; j < s.length; j++) {
			if (s[j] === "{") depth++;
			else if (s[j] === "}") { depth--; if (depth === 0) return j + 1; }
		}
		return s.length;
	}

	// count "real English" words (3+ letters, not a command name) in a block --
	// used to tell a bare equation apart from an ordinary sentence that just
	// happens to contain one LaTeX token
	function proseWordCount(block) {
		return (block.match(/(^|[^\\])\b[A-Za-z]{3,}\b/g) || []).length;
	}

	// people very often paste LaTeX straight out of an AI chat reply, where the
	// $ / \[ \] delimiters never made it into the clipboard even though the
	// commands themselves (\frac, \boxed, \mathcal, ...) did. If a whole
	// paragraph is basically bare LaTeX -- it contains a control sequence and
	// has hardly any real English words -- render it as one display equation
	// even though nothing marks it as math. Ordinary prose paragraphs (even
	// ones that mention a stray \command) are left alone.
	function autoWrapBareFormulaBlocks(src, stash) {
		var parts = src.split(/(\n[ \t]*\n+)/); // odd indices are the blank-line separators
		for (var i = 0; i < parts.length; i += 2) {
			var b = parts[i];
			if (!b || !/\\[a-zA-Z]/.test(b) || /\u0000M\d+\u0000/.test(b)) continue;
			if (proseWordCount(b) > 3) continue;
			parts[i] = stash("\\[" + b.trim() + "\\]");
		}
		return parts.join("");
	}

	// second, narrower pass for a \boxed{...} left stranded inside a paragraph
	// that had too much real prose to qualify for the whole-block wrap above --
	// rescue just the boxed formula itself rather than leaving it as raw text
	function wrapBareBoxed(src, stash) {
		var out = "", i = 0, idx;
		while ((idx = src.indexOf("\\boxed{", i)) !== -1) {
			out += src.slice(i, idx);
			var end = braceEnd(src, idx + "\\boxed".length);
			out += stash("\\[" + src.slice(idx, end) + "\\]");
			i = end;
		}
		return out + src.slice(i);
	}

	function convert(raw) {
		var src = String(raw).replace(/\r\n?/g, "\n");

		// title/author/date pulled from anywhere (usually the preamble)
		var header = "";
		var m = src.match(/\\title\s*\{([^{}]*)\}/);
		var titleTxt = m ? m[1].trim() : "";
		m = src.match(/\\author\s*\{([^{}]*)\}/);
		var authorTxt = m ? m[1].replace(/\\\\/g, ", ").replace(/\\and/g, ", ").trim() : "";
		m = src.match(/\\date\s*\{([^{}]*)\}/);
		var dateTxt = m ? m[1].trim() : "";

		// body only, if this is a full document
		var docStart = src.indexOf("\\begin{document}");
		if (docStart !== -1) {
			src = src.slice(docStart + "\\begin{document}".length);
			var docEnd = src.indexOf("\\end{document}");
			if (docEnd !== -1) src = src.slice(0, docEnd);
		}

		// drop line comments (but keep \%)
		src = src.replace(/(^|[^\\])%.*$/gm, "$1");

		/* protect math: swap every math span for an @@MATHn@@ token so the text
		   pass below can't mangle it, then splice the originals back at the end */
		var math = [];
		function stash(tex) {
			math.push(tex);
			return "\u0000M" + (math.length - 1) + "\u0000";
		}
		// amsmath / matrix environments -- keep begin+end so MathJax sees them
		src = src.replace(
			new RegExp("\\\\begin\\{(" + MATH_ENVS + ")(\\*?)\\}([\\s\\S]*?)\\\\end\\{\\1\\2\\}", "g"),
			function (full) { return stash(full); }
		);
		src = src.replace(/\$\$([\s\S]+?)\$\$/g, function (_, x) { return stash("\\[" + x + "\\]"); });
		src = src.replace(/\\\[([\s\S]+?)\\\]/g, function (_, x) { return stash("\\[" + x + "\\]"); });
		src = src.replace(/\\\(([\s\S]+?)\\\)/g, function (_, x) { return stash("\\(" + x + "\\)"); });
		src = src.replace(/(^|[^\\$])\$(?!\$)([^\n$]*?[^\\\n$])\$(?!\$)/g, function (_, pre, x) {
			return pre + stash("\\(" + x + "\\)");
		});
		// bare LaTeX with no $ / \[ \] at all -- common when pasting straight out
		// of an AI chat reply, where the delimiters get lost in the copy
		src = autoWrapBareFormulaBlocks(src, stash);
		src = wrapBareBoxed(src, stash);

		// now safe to HTML-escape the prose
		var s = escapeHtml(src);

		// environments we understand structurally
		s = s.replace(/\\begin\{(itemize|compactitem)\}/g, "\n<ul>\n")
			 .replace(/\\end\{(itemize|compactitem)\}/g, "\n</ul>\n")
			 .replace(/\\begin\{(enumerate|compactenum)\}/g, "\n<ol>\n")
			 .replace(/\\end\{(enumerate|compactenum)\}/g, "\n</ol>\n")
			 .replace(/\\begin\{(quote|quotation|verse)\}/g, "\n<blockquote>\n")
			 .replace(/\\end\{(quote|quotation|verse)\}/g, "\n</blockquote>\n")
			 .replace(/\\begin\{(center|flushleft|flushright)\}/g, "\n")
			 .replace(/\\end\{(center|flushleft|flushright)\}/g, "\n")
			 .replace(/\\begin\{(verbatim|lstlisting)\}\n?([\s\S]*?)\\end\{(verbatim|lstlisting)\}/g,
				 function (_, a, code) { return "\n<pre>" + code.replace(/\n$/, "") + "</pre>\n"; })
			 .replace(/\\(begin|end)\{[^{}]*\}/g, ""); // any other env: drop the markers, keep contents

		// list items (browsers auto-close <li>, so no closing tag needed)
		s = s.replace(/\\item\s+/g, "<li>");

		// sectioning
		s = s.replace(/\\(sub)?paragraph\*?\s*\{([^{}]*)\}/g, "\n\n<h5>$2</h5>\n\n")
			 .replace(/\\subsubsection\*?\s*\{([^{}]*)\}/g, "\n\n<h4>$1</h4>\n\n")
			 .replace(/\\subsection\*?\s*\{([^{}]*)\}/g, "\n\n<h3>$1</h3>\n\n")
			 .replace(/\\section\*?\s*\{([^{}]*)\}/g, "\n\n<h2>$1</h2>\n\n")
			 .replace(/\\(chapter|part)\*?\s*\{([^{}]*)\}/g, "\n\n<h1>$2</h1>\n\n");

		// inline text formatting (twice, for one level of nesting)
		for (var pass = 0; pass < 2; pass++) {
			s = replaceBraced(s, "textbf", "<strong>", "</strong>");
			s = replaceBraced(s, "textmd", "", "");
			s = replaceBraced(s, "mathbf", "<strong>", "</strong>");
			s = replaceBraced(s, "textit", "<em>", "</em>");
			s = replaceBraced(s, "textsl", "<em>", "</em>");
			s = replaceBraced(s, "emph", "<em>", "</em>");
			s = replaceBraced(s, "underline", "<u>", "</u>");
			s = replaceBraced(s, "texttt", "<code>", "</code>");
			s = replaceBraced(s, "textsc", "<span style=\"font-variant:small-caps\">", "</span>");
			s = replaceBraced(s, "textrm", "", "");
			s = replaceBraced(s, "textsf", "", "");
			s = replaceBraced(s, "textnormal", "", "");
			s = replaceBraced(s, "text", "", "");
			s = replaceBraced(s, "mbox", "", "");
			s = replaceBraced(s, "href", "", ""); // drop; keep visible text of \href{url}{text} via next line
		}
		s = s.replace(/\\url\s*\{([^{}]*)\}/g, "$1");
		s = s.replace(/\\footnote\s*\{([^{}]*)\}/g, " ($1)");
		s = s.replace(/\\(label|ref|eqref|pageref|cite|citep|citet|index|hypertarget|hyperlink)\s*\{[^{}]*\}/g, "");

		// spacing / punctuation niceties (math is already stashed away)
		s = s.replace(/\\\\(\[[^\]]*\])?/g, "<br>\n")
			 .replace(/\\(,|;|:|!|>|<)/g, " ")
			 .replace(/\\ /g, " ")
			 .replace(/\\@/g, "")
			 .replace(/~/g, "&nbsp;")
			 .replace(/``/g, "&ldquo;").replace(/''/g, "&rdquo;")
			 .replace(/---/g, "&mdash;").replace(/--/g, "&ndash;")
			 .replace(/\\([%$&#_{}])/g, "$1")
			 .replace(/\\(LaTeX|TeX)\b/g, function (_, w) { return w; });

		s = s.replace(STRIP_CMDS, "");

		/* paragraphs: blank line separates blocks; wrap loose prose in <p>,
		   leave anything that is already a block element (or a lone display-math
		   token) alone */
		var blocks = s.split(/\n[ \t]*\n+/);
		var htmlParts = [];
		for (var i = 0; i < blocks.length; i++) {
			var b = blocks[i].trim();
			if (!b) continue;
			var loneToken = b.match(/^\u0000M(\d+)\u0000$/);
			if (loneToken && /^\\\[/.test(math[+loneToken[1]])) {
				htmlParts.push(b);
			} else if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div|table|p)\b/i.test(b) ||
					   /^<\/(ul|ol|blockquote|pre|div|table)>/i.test(b)) {
				htmlParts.push(b);
			} else {
				htmlParts.push("<p>" + b.replace(/\n/g, " ") + "</p>");
			}
		}
		var body = htmlParts.join("\n");

		// tidy stray list wrappers
		body = body.replace(/<(ul|ol)>\s*(<\/li>)?/g, "<$1>")
				   .replace(/(<li>[\s\S]*?)(?=<\/(ul|ol)>)/g, function (mm) { return mm; });

		if (titleTxt) {
			header = '<h1>' + escapeHtml(titleTxt) + "</h1>";
			var sub = [];
			if (authorTxt) sub.push(escapeHtml(authorTxt));
			if (dateTxt) sub.push(escapeHtml(dateTxt));
			if (sub.length) header += '<p style="color:#666;margin-top:-0.3em">' + sub.join(" &middot; ") + "</p>";
			header += "<hr>";
		}

		var out = header + body;
		// restore math -- looped, since a bare-formula block (or a \boxed{...})
		// can itself contain an already-stashed environment, i.e. a placeholder
		// nested inside another placeholder's value
		var guard = 0;
		while (/\u0000M\d+\u0000/.test(out) && guard++ < 20) {
			out = out.replace(/\u0000M(\d+)\u0000/g, function (_, n) { return math[+n] || ""; });
		}
		return out;
	}

	/* ---- render loop ------------------------------------------------------- */

	var mathjaxReady = false;
	function whenMathJax(cb) {
		if (mathjaxReady) return cb();
		if (window.MathJax && window.MathJax.typesetPromise && window.MathJax.startup) {
			window.MathJax.startup.promise.then(function () { mathjaxReady = true; cb(); });
			return;
		}
		var tries = 0;
		var t = setInterval(function () {
			tries++;
			if (window.MathJax && window.MathJax.typesetPromise) {
				clearInterval(t);
				window.MathJax.startup.promise.then(function () { mathjaxReady = true; cb(); });
			} else if (tries > 150) {
				clearInterval(t);
				showError("MathJax failed to load (check your connection / ad blocker). Text is still shown, but equations are not typeset.");
			}
		}, 100);
	}

	function showError(msg) {
		if (!msg) { errorBox.className = "latex-tool__error hide"; errorBox.textContent = ""; return; }
		errorBox.textContent = msg;
		errorBox.className = "latex-tool__error";
	}

	function setStatus(txt) { if (statusEl) statusEl.textContent = txt; }

	function render() {
		var raw = source.value;
		try { localStorage.setItem(STORAGE_KEY, raw); } catch (e) {}
		showError("");

		if (!raw.trim()) {
			output.innerHTML = PLACEHOLDER;
			setStatus("Auto-renders as you type");
			if (window.MathJax && MathJax.typesetClear) MathJax.typesetClear([output]);
			return;
		}

		var html;
		try {
			html = convert(raw);
		} catch (e) {
			showError("Could not parse the LaTeX: " + e.message);
			return;
		}
		output.innerHTML = html;
		setStatus("Typesetting\u2026");

		whenMathJax(function () {
			try { MathJax.typesetClear([output]); } catch (e) {}
			MathJax.typesetPromise([output])
				.then(function () { setStatus("Rendered \u2713"); })
				.catch(function (err) {
					showError("MathJax error: " + (err && err.message ? err.message : err));
					setStatus("Rendered with errors");
				});
		});
	}

	var debounceTimer;
	function scheduleRender() {
		clearTimeout(debounceTimer);
		setStatus("\u2026");
		debounceTimer = setTimeout(render, 350);
	}

	/* ---- wire up --------------------------------------------------------- */

	source.addEventListener("input", scheduleRender);

	document.getElementById("latex-render").addEventListener("click", render);

	document.getElementById("latex-clear").addEventListener("click", function () {
		source.value = "";
		source.focus();
		render();
	});

	document.getElementById("latex-copy").addEventListener("click", function () {
		var btn = this;
		function done() {
			var old = btn.textContent;
			btn.textContent = "Copied \u2713";
			btn.classList.add("latex-tool__copied");
			setTimeout(function () { btn.textContent = old; btn.classList.remove("latex-tool__copied"); }, 1500);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(source.value).then(done, function () { source.select(); document.execCommand("copy"); done(); });
		} else {
			source.select();
			document.execCommand("copy");
			done();
		}
	});

	document.getElementById("latex-print").addEventListener("click", function () {
		window.print();
	});

	document.getElementById("latex-examples").addEventListener("click", function (e) {
		var b = e.target.closest("[data-ex]");
		if (!b) return;
		var ex = EXAMPLES[b.getAttribute("data-ex")];
		if (ex == null) return;
		source.value = ex;
		render();
		output.scrollIntoView({ block: "nearest" });
	});

	/* ---- expand / zoom ----------------------------------------------------- */

	var zoom = document.getElementById("latex-zoom");
	var zoomStage = document.getElementById("latex-zoom-stage");
	var zoomSizes = document.querySelectorAll(".latex-zoom__size");
	var lastFocused = null;

	function openZoom() {
		if (!output.textContent.trim() || output.querySelector(".latex-tool__placeholder")) return;
		zoomStage.innerHTML = output.innerHTML;
		var active = document.querySelector(".latex-zoom__size--active");
		zoomStage.style.fontSize = (active ? active.getAttribute("data-zoom") : "4") + "em";
		zoom.classList.remove("hide");
		document.body.style.overflow = "hidden";
		lastFocused = document.activeElement;
		document.getElementById("latex-zoom-close").focus();
	}

	function closeZoom() {
		zoom.classList.add("hide");
		document.body.style.overflow = "";
		zoomStage.innerHTML = "";
		if (lastFocused && lastFocused.focus) lastFocused.focus();
	}

	document.getElementById("latex-expand").addEventListener("click", openZoom);
	document.getElementById("latex-zoom-close").addEventListener("click", closeZoom);
	zoom.addEventListener("click", function (e) { if (e.target === zoom) closeZoom(); });
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !zoom.classList.contains("hide")) closeZoom();
	});

	for (var zi = 0; zi < zoomSizes.length; zi++) {
		zoomSizes[zi].addEventListener("click", function () {
			for (var j = 0; j < zoomSizes.length; j++) zoomSizes[j].classList.remove("latex-zoom__size--active");
			this.classList.add("latex-zoom__size--active");
			zoomStage.style.fontSize = this.getAttribute("data-zoom") + "em";
		});
	}

	// restore last session, else seed with a friendly example
	var saved = "";
	try { saved = localStorage.getItem(STORAGE_KEY) || ""; } catch (e) {}
	source.value = saved || EXAMPLES.quadratic;
	render();
})();
