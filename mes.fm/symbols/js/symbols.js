/* MES Symbol Copier -- mes.fm/symbols
 *
 * Click a tile, it's copied. No dependencies, nothing leaves the browser.
 * Each entry: c = character, n = display name (also searched), k = extra
 * search keywords (optional), l = LaTeX command to copy in "LaTeX" mode
 * (optional -- falls back to the character itself when omitted, which is
 * the right thing for symbols with no real LaTeX macro of their own).
 */
(function () {
	"use strict";

	var $ = function (id) { return document.getElementById(id); };
	var RECENT_KEY = "mes-symbols-recent-v1";
	var MAX_RECENT = 14;
	var COLLAPSE_KEY = "mes-symbols-collapsed-v1";

	var CATEGORIES = [
		{
			name: "Greek Letters (Lowercase)",
			items: [
				{ c: "α", n: "alpha", l: "\\alpha" },
				{ c: "β", n: "beta", l: "\\beta" },
				{ c: "γ", n: "gamma", l: "\\gamma" },
				{ c: "δ", n: "delta", l: "\\delta" },
				{ c: "ε", n: "epsilon", l: "\\epsilon" },
				{ c: "ζ", n: "zeta", l: "\\zeta" },
				{ c: "η", n: "eta", l: "\\eta" },
				{ c: "θ", n: "theta", l: "\\theta" },
				{ c: "ι", n: "iota", l: "\\iota" },
				{ c: "κ", n: "kappa", l: "\\kappa" },
				{ c: "λ", n: "lambda", l: "\\lambda" },
				{ c: "μ", n: "mu", l: "\\mu" },
				{ c: "ν", n: "nu", l: "\\nu" },
				{ c: "ξ", n: "xi", l: "\\xi" },
				{ c: "ο", n: "omicron", l: "o" },
				{ c: "π", n: "pi", l: "\\pi" },
				{ c: "ρ", n: "rho", l: "\\rho" },
				{ c: "σ", n: "sigma", l: "\\sigma" },
				{ c: "τ", n: "tau", l: "\\tau" },
				{ c: "υ", n: "upsilon", l: "\\upsilon" },
				{ c: "φ", n: "phi", l: "\\phi" },
				{ c: "ϕ", n: "phi (variant)", k: "varphi", l: "\\varphi" },
				{ c: "χ", n: "chi", l: "\\chi" },
				{ c: "ψ", n: "psi", l: "\\psi" },
				{ c: "ω", n: "omega", l: "\\omega" }
			]
		},
		{
			name: "Greek Letters (Uppercase)",
			items: [
				{ c: "Γ", n: "Gamma", l: "\\Gamma" },
				{ c: "Δ", n: "Delta", l: "\\Delta" },
				{ c: "Θ", n: "Theta", l: "\\Theta" },
				{ c: "Λ", n: "Lambda", l: "\\Lambda" },
				{ c: "Ξ", n: "Xi", l: "\\Xi" },
				{ c: "Π", n: "Pi", l: "\\Pi" },
				{ c: "Σ", n: "Sigma", l: "\\Sigma" },
				{ c: "Φ", n: "Phi", l: "\\Phi" },
				{ c: "Ψ", n: "Psi", l: "\\Psi" },
				{ c: "Ω", n: "Omega", l: "\\Omega" }
			]
		},
		{
			name: "Math Operators & Relations",
			items: [
				{ c: "±", n: "plus-minus", l: "\\pm" },
				{ c: "∓", n: "minus-plus", l: "\\mp" },
				{ c: "×", n: "times", k: "multiply cross", l: "\\times" },
				{ c: "÷", n: "divide", k: "division", l: "\\div" },
				{ c: "·", n: "middle dot", k: "multiply dot product", l: "\\cdot" },
				{ c: "≈", n: "approximately equal", k: "almost equal tilde", l: "\\approx" },
				{ c: "≠", n: "not equal", k: "unequal", l: "\\neq" },
				{ c: "≤", n: "less than or equal", l: "\\leq" },
				{ c: "≥", n: "greater than or equal", l: "\\geq" },
				{ c: "≪", n: "much less than", l: "\\ll" },
				{ c: "≫", n: "much greater than", l: "\\gg" },
				{ c: "∞", n: "infinity", l: "\\infty" },
				{ c: "√", n: "square root", k: "radical", l: "\\sqrt{}" },
				{ c: "∛", n: "cube root", l: "\\sqrt[3]{}" },
				{ c: "∜", n: "fourth root", l: "\\sqrt[4]{}" },
				{ c: "∫", n: "integral", l: "\\int" },
				{ c: "∬", n: "double integral", l: "\\iint" },
				{ c: "∮", n: "contour integral", l: "\\oint" },
				{ c: "∑", n: "summation", k: "sigma sum", l: "\\sum" },
				{ c: "∏", n: "product", k: "capital pi", l: "\\prod" },
				{ c: "∂", n: "partial derivative", l: "\\partial" },
				{ c: "∇", n: "nabla", k: "del gradient", l: "\\nabla" },
				{ c: "∴", n: "therefore", l: "\\therefore" },
				{ c: "∵", n: "because", l: "\\because" },
				{ c: "∝", n: "proportional to", l: "\\propto" },
				{ c: "≡", n: "identical to", k: "equivalent", l: "\\equiv" },
				{ c: "≅", n: "congruent to", l: "\\cong" },
				{ c: "∅", n: "empty set", k: "null set", l: "\\emptyset" },
				{ c: "⊥", n: "perpendicular", l: "\\perp" },
				{ c: "∥", n: "parallel", l: "\\parallel" },
				{ c: "∠", n: "angle", l: "\\angle" },
				{ c: "′", n: "prime", l: "'" },
				{ c: "″", n: "double prime", l: "''" }
			]
		},
		{
			name: "Superscript",
			items: [
				{ c: "⁰", n: "superscript 0", l: "^0" },
				{ c: "¹", n: "superscript 1", l: "^1" },
				{ c: "²", n: "superscript 2", k: "squared", l: "^2" },
				{ c: "³", n: "superscript 3", k: "cubed", l: "^3" },
				{ c: "⁴", n: "superscript 4", l: "^4" },
				{ c: "⁵", n: "superscript 5", l: "^5" },
				{ c: "⁶", n: "superscript 6", l: "^6" },
				{ c: "⁷", n: "superscript 7", l: "^7" },
				{ c: "⁸", n: "superscript 8", l: "^8" },
				{ c: "⁹", n: "superscript 9", l: "^9" },
				{ c: "ⁿ", n: "superscript n", l: "^n" },
				{ c: "ⁱ", n: "superscript i", l: "^i" },
				{ c: "⁺", n: "superscript plus", l: "^+" },
				{ c: "⁻", n: "superscript minus", l: "^-" },
				{ c: "⁽", n: "superscript (", l: "^(" },
				{ c: "⁾", n: "superscript )", l: "^)" }
			]
		},
		{
			name: "Subscript",
			items: [
				{ c: "₀", n: "subscript 0", l: "_0" },
				{ c: "₁", n: "subscript 1", l: "_1" },
				{ c: "₂", n: "subscript 2", l: "_2" },
				{ c: "₃", n: "subscript 3", l: "_3" },
				{ c: "₄", n: "subscript 4", l: "_4" },
				{ c: "₅", n: "subscript 5", l: "_5" },
				{ c: "₆", n: "subscript 6", l: "_6" },
				{ c: "₇", n: "subscript 7", l: "_7" },
				{ c: "₈", n: "subscript 8", l: "_8" },
				{ c: "₉", n: "subscript 9", l: "_9" },
				{ c: "ₐ", n: "subscript a", l: "_a" },
				{ c: "ᵢ", n: "subscript i", l: "_i" },
				{ c: "ⱼ", n: "subscript j", l: "_j" },
				{ c: "ₖ", n: "subscript k", l: "_k" },
				{ c: "ₗ", n: "subscript l", l: "_l" },
				{ c: "ₘ", n: "subscript m", l: "_m" },
				{ c: "ₙ", n: "subscript n", l: "_n" },
				{ c: "ₓ", n: "subscript x", l: "_x" },
				{ c: "₊", n: "subscript plus", l: "_+" },
				{ c: "₋", n: "subscript minus", l: "_-" },
				{ c: "₍", n: "subscript (", l: "_(" },
				{ c: "₎", n: "subscript )", l: "_)" }
			]
		},
		{
			name: "Fractions",
			items: [
				{ c: "½", n: "one half", l: "\\frac{1}{2}" },
				{ c: "⅓", n: "one third", l: "\\frac{1}{3}" },
				{ c: "⅔", n: "two thirds", l: "\\frac{2}{3}" },
				{ c: "¼", n: "one quarter", l: "\\frac{1}{4}" },
				{ c: "¾", n: "three quarters", l: "\\frac{3}{4}" },
				{ c: "⅕", n: "one fifth", l: "\\frac{1}{5}" },
				{ c: "⅖", n: "two fifths", l: "\\frac{2}{5}" },
				{ c: "⅗", n: "three fifths", l: "\\frac{3}{5}" },
				{ c: "⅘", n: "four fifths", l: "\\frac{4}{5}" },
				{ c: "⅙", n: "one sixth", l: "\\frac{1}{6}" },
				{ c: "⅚", n: "five sixths", l: "\\frac{5}{6}" },
				{ c: "⅛", n: "one eighth", l: "\\frac{1}{8}" },
				{ c: "⅜", n: "three eighths", l: "\\frac{3}{8}" },
				{ c: "⅝", n: "five eighths", l: "\\frac{5}{8}" },
				{ c: "⅞", n: "seven eighths", l: "\\frac{7}{8}" }
			]
		},
		{
			name: "Arrows",
			items: [
				{ c: "→", n: "right arrow", l: "\\rightarrow" },
				{ c: "←", n: "left arrow", l: "\\leftarrow" },
				{ c: "↑", n: "up arrow", l: "\\uparrow" },
				{ c: "↓", n: "down arrow", l: "\\downarrow" },
				{ c: "↔", n: "left-right arrow", l: "\\leftrightarrow" },
				{ c: "↕", n: "up-down arrow", l: "\\updownarrow" },
				{ c: "⇒", n: "implies", k: "right double arrow", l: "\\Rightarrow" },
				{ c: "⇐", n: "implied by", k: "left double arrow", l: "\\Leftarrow" },
				{ c: "⇔", n: "if and only if", k: "iff double arrow", l: "\\Leftrightarrow" },
				{ c: "↦", n: "maps to", l: "\\mapsto" }
			]
		},
		{
			name: "Sets & Logic",
			items: [
				{ c: "∈", n: "element of", k: "belongs to", l: "\\in" },
				{ c: "∉", n: "not an element of", l: "\\notin" },
				{ c: "∋", n: "contains as member", l: "\\ni" },
				{ c: "⊂", n: "subset of", l: "\\subset" },
				{ c: "⊆", n: "subset of or equal to", l: "\\subseteq" },
				{ c: "⊃", n: "superset of", l: "\\supset" },
				{ c: "⊇", n: "superset of or equal to", l: "\\supseteq" },
				{ c: "∪", n: "union", l: "\\cup" },
				{ c: "∩", n: "intersection", l: "\\cap" },
				{ c: "∀", n: "for all", k: "universal quantifier", l: "\\forall" },
				{ c: "∃", n: "there exists", k: "existential quantifier", l: "\\exists" },
				{ c: "∄", n: "does not exist", l: "\\nexists" },
				{ c: "¬", n: "logical not", l: "\\neg" },
				{ c: "∧", n: "logical and", l: "\\land" },
				{ c: "∨", n: "logical or", l: "\\lor" },
				{ c: "⊕", n: "xor", k: "direct sum", l: "\\oplus" },
				{ c: "ℵ", n: "aleph", l: "\\aleph" }
			]
		},
		{
			name: "Degrees & Units",
			items: [
				{ c: "°", n: "degree", l: "^\\circ" },
				{ c: "℃", n: "degrees Celsius", k: "centigrade" },
				{ c: "℉", n: "degrees Fahrenheit" },
				{ c: "µ", n: "micro sign", k: "micron" },
				{ c: "Ω", n: "ohm sign", l: "\\Omega" },
				{ c: "‰", n: "per mille", k: "per thousand" }
			]
		},
		{
			name: "Currency",
			items: [
				{ c: "$", n: "dollar", l: "\\$" },
				{ c: "€", n: "euro" },
				{ c: "£", n: "pound sterling" },
				{ c: "¥", n: "yen / yuan" },
				{ c: "¢", n: "cent" },
				{ c: "₹", n: "rupee" },
				{ c: "₩", n: "won" },
				{ c: "₽", n: "ruble" },
				{ c: "₿", n: "bitcoin" },
				{ c: "₴", n: "hryvnia" }
			]
		},
		{
			name: "Punctuation & Misc",
			items: [
				{ c: "©", n: "copyright", l: "\\copyright" },
				{ c: "®", n: "registered trademark" },
				{ c: "™", n: "trademark" },
				{ c: "§", n: "section sign", l: "\\S" },
				{ c: "¶", n: "pilcrow", k: "paragraph sign", l: "\\P" },
				{ c: "†", n: "dagger", l: "\\dagger" },
				{ c: "‡", n: "double dagger", l: "\\ddagger" },
				{ c: "•", n: "bullet point" },
				{ c: "…", n: "ellipsis", k: "dot dot dot", l: "\\ldots" },
				{ c: "—", n: "em dash" },
				{ c: "–", n: "en dash" },
				{ c: "‘", n: "left single quote" },
				{ c: "’", n: "right single quote" },
				{ c: "“", n: "left double quote" },
				{ c: "”", n: "right double quote" }
			]
		}
	];

	var modesEl = $("sym-modes"), searchEl = $("sym-search"), catsEl = $("sym-categories");
	var noResultsEl = $("sym-no-results"), noResultsQueryEl = $("sym-no-results-query");
	var recentBox = $("sym-recent"), recentList = $("sym-recent-list");
	var builderInput = $("sym-builder-input"), toastEl = $("sym-toast");
	var mode = "symbol";
	var builderChars = []; // raw characters clicked, independent of `mode` -- see renderBuilder()

	function htmlEntity(ch) {
		var cp = ch.codePointAt(0);
		return "&#" + cp + ";";
	}
	function copyTextFor(item) {
		if (mode === "latex") return item.l || item.c;
		if (mode === "html") return htmlEntity(item.c);
		return item.c;
	}
	function esc(s) {
		return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	function tileHtml(item) {
		return '<button type="button" class="sym__tile" data-char="' + esc(item.c) + '"' +
			' data-name="' + esc(item.n) + '" title="' + esc(item.n) + (item.l ? " — " + esc(item.l) : "") + '">' +
			'<span class="sym__tile-glyph">' + esc(item.c) + '</span>' +
			'<span class="sym__tile-name">' + esc(item.n) + '</span></button>';
	}

	// per-category collapsed state, keyed by category NAME (not index) so it
	// survives the CATEGORIES list being reordered/edited later; remembered
	// per device, unlike the site's other collapsible-section patterns
	var collapsedCats = (function () {
		try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); }
		catch (e) { return new Set(); }
	})();
	function saveCollapsed() {
		try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(collapsedCats))); } catch (e) {}
	}

	function renderCategories() {
		catsEl.innerHTML = CATEGORIES.map(function (cat, i) {
			var collapsed = collapsedCats.has(cat.name);
			return '<section class="sym__category' + (collapsed ? " sym__category--collapsed" : "") + '" id="sym-cat-' + i + '">' +
				'<h2 role="button" tabindex="0" aria-expanded="' + !collapsed + '" data-cat="' + esc(cat.name) + '">' +
				esc(cat.name) + ' <span class="arrow-icon">' + (collapsed ? "▸" : "▾") + '</span></h2>' +
				'<div class="sym__grid">' + cat.items.map(tileHtml).join("") + '</div></section>';
		}).join("");
	}

	function setCategoryCollapsed(section, collapsed) {
		var h2 = section.querySelector("h2");
		var name = h2.getAttribute("data-cat");
		section.classList.toggle("sym__category--collapsed", collapsed);
		h2.setAttribute("aria-expanded", String(!collapsed));
		h2.querySelector(".arrow-icon").textContent = collapsed ? "▸" : "▾";
		if (collapsed) collapsedCats.add(name); else collapsedCats.delete(name);
		saveCollapsed();
	}

	function toggleCategoryFromEvent(e) {
		var h2 = e.target.closest ? e.target.closest("h2") : null;
		if (!h2 || !catsEl.contains(h2)) return;
		var section = h2.closest(".sym__category");
		setCategoryCollapsed(section, !section.classList.contains("sym__category--collapsed"));
	}
	catsEl.addEventListener("click", toggleCategoryFromEvent);
	catsEl.addEventListener("keydown", function (e) {
		if (e.key !== "Enter" && e.key !== " ") return;
		if (!e.target.closest || !e.target.closest("h2")) return;
		e.preventDefault();
		toggleCategoryFromEvent(e);
	});

	$("sym-collapse-all").addEventListener("click", function () {
		var sections = document.querySelectorAll(".sym__category");
		var anyExpanded = Array.prototype.some.call(sections, function (s) {
			return !s.classList.contains("sym__category--collapsed");
		});
		Array.prototype.forEach.call(sections, function (s) { setCategoryCollapsed(s, anyExpanded); });
		this.textContent = anyExpanded ? "Expand all sections" : "Collapse all sections";
	});

	function findItem(ch) {
		for (var i = 0; i < CATEGORIES.length; i++) {
			for (var j = 0; j < CATEGORIES[i].items.length; j++) {
				if (CATEGORIES[i].items[j].c === ch) return CATEGORIES[i].items[j];
			}
		}
		return null;
	}

	/* ---- search ------------------------------------------------------ */

	function norm(s) { return s.toLowerCase().trim(); }

	function applySearch() {
		var q = norm(searchEl.value);
		var anyVisible = false;
		CATEGORIES.forEach(function (cat, i) {
			var section = $("sym-cat-" + i);
			var grid = section.querySelector(".sym__grid");
			var tiles = grid.children;
			var catHasMatch = false;
			for (var j = 0; j < cat.items.length; j++) {
				var item = cat.items[j];
				var hay = norm(item.n + " " + (item.k || ""));
				var match = !q || hay.indexOf(q) !== -1;
				tiles[j].hidden = !match;
				if (match) catHasMatch = true;
			}
			section.classList.toggle("sym__category--hide", !catHasMatch);
			// a live search always shows matches, even inside a collapsed
			// section -- doesn't touch the underlying remembered collapse state
			section.classList.toggle("sym__category--force-open", !!q);
			if (catHasMatch) anyVisible = true;
		});
		noResultsEl.classList.toggle("hide", anyVisible || !q);
		noResultsQueryEl.textContent = searchEl.value;
	}

	/* ---- recently copied ---------------------------------------------- */

	function loadRecent() {
		try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { return []; }
	}
	function saveRecent(list) {
		try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
	}
	function pushRecent(ch) {
		var list = loadRecent().filter(function (c) { return c !== ch; });
		list.unshift(ch);
		list = list.slice(0, MAX_RECENT);
		saveRecent(list);
		renderRecent(list);
	}
	function renderRecent(list) {
		list = list || loadRecent();
		if (!list.length) { recentBox.classList.add("hide"); return; }
		recentBox.classList.remove("hide");
		recentList.innerHTML = list.map(function (ch) {
			var item = findItem(ch);
			return item ? tileHtml(item) : "";
		}).join("");
	}

	/* ---- toast + copy -------------------------------------------------- */

	var toastTimer;
	function toast(msg) {
		toastEl.textContent = msg;
		toastEl.classList.add("sym__toast--show");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { toastEl.classList.remove("sym__toast--show"); }, 1400);
	}

	// legacy execCommand fallback -- also what the async Clipboard API falls
	// back to if it rejects (e.g. "Document is not focused", denied permission)
	function execCommandCopy(text) {
		var ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		var ok = false;
		try { ok = document.execCommand("copy"); } catch (e) {}
		document.body.removeChild(ta);
		return ok;
	}
	function copyToClipboard(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).catch(function () {
				return execCommandCopy(text) ? Promise.resolve() : Promise.reject();
			});
		}
		return execCommandCopy(text) ? Promise.resolve() : Promise.reject();
	}

	function flash(tile) {
		tile.classList.add("sym__tile--flash");
		setTimeout(function () { tile.classList.remove("sym__tile--flash"); }, 220);
	}

	// the builder box always shows -- and "Copy all" always copies -- the
	// SAME format the mode toggle currently selects, not just raw glyphs
	function renderBuilder() {
		builderInput.value = builderChars.map(function (ch) {
			var item = findItem(ch);
			return item ? copyTextFor(item) : ch;
		}).join("");
	}

	// tile subtitles double as a live preview of what a click will copy --
	// the symbol's name in Symbol mode, the actual LaTeX/HTML code otherwise
	function refreshTileLabels() {
		document.querySelectorAll(".sym__tile").forEach(function (tile) {
			var item = findItem(tile.getAttribute("data-char"));
			var nameEl = tile.querySelector(".sym__tile-name");
			if (item && nameEl) nameEl.textContent = mode === "symbol" ? item.n : copyTextFor(item);
		});
	}

	function handleTileClick(tile) {
		var ch = tile.getAttribute("data-char");
		var item = findItem(ch);
		if (!item) return;
		var text = copyTextFor(item);
		copyToClipboard(text).then(function () {
			toast("Copied " + text);
		}, function () {
			toast("Couldn't copy — press Ctrl/Cmd+C");
		});
		flash(tile);
		builderChars.push(item.c);
		renderBuilder();
		pushRecent(item.c);
	}

	document.addEventListener("click", function (e) {
		var tile = e.target.closest ? e.target.closest(".sym__tile") : null;
		if (tile) handleTileClick(tile);
	});

	/* ---- mode toggle ---------------------------------------------------- */

	modesEl.addEventListener("click", function (e) {
		var btn = e.target.closest("[data-mode]");
		if (!btn) return;
		mode = btn.getAttribute("data-mode");
		Array.prototype.forEach.call(modesEl.children, function (b) {
			b.classList.toggle("sym__mode--active", b === btn);
		});
		refreshTileLabels();
		renderBuilder();
	});

	/* ---- search + builder wiring ---------------------------------------- */

	searchEl.addEventListener("input", applySearch);

	$("sym-builder-copy").addEventListener("click", function () {
		if (!builderInput.value) return;
		copyToClipboard(builderInput.value).then(function () {
			toast("Copied " + builderInput.value);
		}, function () {
			builderInput.select();
			toast("Couldn't copy — press Ctrl/Cmd+C");
		});
	});
	$("sym-builder-clear").addEventListener("click", function () {
		builderChars = [];
		renderBuilder();
		builderInput.focus();
	});

	/* ---- boot -------------------------------------------------------- */

	renderCategories();
	renderRecent();
	applySearch();
})();
