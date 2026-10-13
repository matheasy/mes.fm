/* Typesets the equation boxes of the simulator pages: elements with class "mes-tex" hold TeX in \( ... \) and are rendered with MathJax 3 (SVG, loaded once, only on pages that have such elements). */
(function () {
	'use strict';
	function run() {
		var els = document.querySelectorAll('.mes-tex'); if (!els.length) return;
		window.MathJax = { loader: {}, tex: { inlineMath: [['\\(', '\\)']], processEscapes: true }, svg: { fontCache: 'global', displayAlign: 'left' }, options: { processHtmlClass: 'mes-tex', ignoreHtmlClass: '.*' }, startup: { typeset: false } };
		var s = document.createElement('script'); s.async = true; s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js';
		s.onload = function () { window.MathJax.startup.promise.then(function () { return window.MathJax.typesetPromise(Array.prototype.slice.call(els)); }).then(function () { Array.prototype.forEach.call(els, function (e) { e.classList.add('mes-tex--done'); }); }).catch(function () {}); };
		document.head.appendChild(s);
	}
	if (document.readyState === 'complete') setTimeout(run, 0); else window.addEventListener('load', function () { setTimeout(run, 0); });
})();
