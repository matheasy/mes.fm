/* MES OMML (2026-11-23): Word equations <-> MathML, no library. Used by MES AI (its .docx answers get real Word equations: TeX ->
   MathJax.tex2mml -> fromMathML) and the Word Viewer (Edit mode keeps / previews / inserts equations).
     MESOmml.parse(xml) -> {name, attrs, kids:[node|string]}      tiny XML reader (elements, attributes, text, entities, CDATA)
     MESOmml.fromMathML(mml, display) -> "<m:oMath>..</m:oMath>" ("<m:oMathPara><m:oMath>..</m:oMath></m:oMathPara>" when display)
     MESOmml.toMathML(omml) -> "<math ...>..</math>" (any oMath / oMathPara string; the browser draws MathML itself)
     MESOmml.NS = the xmlns:m declaration to add to <w:document>.
   Also node: require("mes.fm/main_js/omml.js"). Tests: node tool_apps_src/omml-tests.js. */
(function (root) {
	"use strict";
	var NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
	var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", minus: "−", times: "×", InvisibleTimes: "⁢", ApplyFunction: "⁡", af: "⁡", it: "⁢" };
	function unent(s) {
		return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, function (m, e) {
			if (e[0] === "#") { var n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1); return isFinite(n) ? String.fromCodePoint(n) : m; }
			return ENT[e] != null ? ENT[e] : m;
		});
	}
	function parse(xml) {
		var s = String(xml), i = 0, top = { name: "#root", attrs: {}, kids: [] }, stack = [top];
		while (i < s.length) {
			var lt = s.indexOf("<", i);
			if (lt < 0) { pushText(s.slice(i)); break; }
			if (lt > i) pushText(s.slice(i, lt));
			if (s.startsWith("<!--", lt)) { i = s.indexOf("-->", lt); i = i < 0 ? s.length : i + 3; continue; }
			if (s.startsWith("<![CDATA[", lt)) { var ce = s.indexOf("]]>", lt); var cd = s.slice(lt + 9, ce < 0 ? s.length : ce); stack[stack.length - 1].kids.push(cd); i = ce < 0 ? s.length : ce + 3; continue; }
			if (s[lt + 1] === "?" || s[lt + 1] === "!") { i = s.indexOf(">", lt); i = i < 0 ? s.length : i + 1; continue; }
			var gt = lt + 1, q = null;
			for (; gt < s.length; gt++) { var c = s[gt]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === ">") break; }
			var tag = s.slice(lt + 1, gt); i = gt + 1;
			if (tag[0] === "/") { var nm = tag.slice(1).trim(); for (var k = stack.length - 1; k > 0; k--) if (stack[k].name === nm) { stack.length = k; break; } continue; }
			var self = /\/\s*$/.test(tag); if (self) tag = tag.replace(/\/\s*$/, "");
			var mm = /^([^\s]+)/.exec(tag), el = { name: mm ? mm[1] : "", attrs: {}, kids: [] }, re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g, a;
			while ((a = re.exec(tag.slice(el.name.length)))) el.attrs[a[1]] = unent(a[3] != null ? a[3] : a[4]);
			stack[stack.length - 1].kids.push(el);
			if (!self) stack.push(el);
		}
		return top;
		function pushText(t) { if (t) stack[stack.length - 1].kids.push(unent(t)); }
	}
	function x(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function local(n) { return n.name.replace(/^.*:/, ""); }
	function els(n) { return n.kids.filter(function (k) { return typeof k !== "string"; }); }
	function text(n) { return typeof n === "string" ? n : n.kids.map(text).join(""); }

	/* ---------------- MathML -> OMML ---------------- */
	var LARGE = /^[∑∏∐∫∬∭∮∯∰⋀⋁⋂⋃⨀⨁⨂⨄⨆]$/;
	function run(t, pr) { if (t === "") return ""; return "<m:r>" + (pr ? "<m:rPr>" + pr + "</m:rPr>" : "") + "<m:t" + (/^\s|\s$/.test(t) ? ' xml:space="preserve"' : "") + ">" + x(t) + "</m:t></m:r>"; }
	function wrap(tag, inner) { return "<m:" + tag + ">" + inner + "</m:" + tag + ">"; }
	function e(inner) { return inner ? wrap("e", inner) : "<m:e/>"; }
	function arg(tag, n) { var s = n ? conv(n) : ""; return s ? wrap(tag, s) : "<m:" + tag + "/>"; }
	function isOp(n) { return n && typeof n !== "string" && local(n) === "mo"; }
	function opChar(n) { return isOp(n) ? text(n).trim() : ""; }
	function varPr(n) {
		var v = n.attrs.mathvariant || "", tag = local(n);
		var sty = { bold: "b", italic: "i", "bold-italic": "bi", normal: "p" }[v];
		var scr = { "double-struck": "double-struck", fraktur: "fraktur", script: "script", "bold-script": "script", "bold-fraktur": "fraktur", "sans-serif": "sans-serif", monospace: "monospace" }[v];
		if (/^bold-/.test(v)) sty = "b";
		if (!v && tag === "mi" && text(n).trim().length > 1) sty = "p";   // sin, log, lim: upright
		if (tag === "mn" && !v) sty = "p";
		return (scr ? '<m:scr m:val="' + scr + '"/>' : "") + (sty ? '<m:sty m:val="' + sty + '"/>' : "");
	}
	function seq(list) {   // children of an mrow: absorbs the operand after a large operator, finds \left ... \right pairs
		var out = "";
		for (var i = 0; i < list.length; i++) {
			var n = list[i];
			var nm = local(n), base = nm === "msubsup" || nm === "munderover" || nm === "msub" || nm === "msup" || nm === "munder" || nm === "mover" ? els(n)[0] : null;
			if (base && LARGE.test(opChar(base))) { var next = list[i + 1]; out += nary(n, next ? conv(next) : ""); if (next) i++; continue; }
			if (nm === "mo" && LARGE.test(opChar(n))) { var nx = list[i + 1]; out += wrap("nary", '<m:naryPr><m:chr m:val="' + x(opChar(n)) + '"/><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/>' + e(nx ? conv(nx) : "")); if (nx) i++; continue; }
			out += conv(n);
		}
		return out;
	}
	function nary(n, operand) {
		var k = els(n), nm = local(n), ch = opChar(k[0]), lo = "", hi = "", loc = nm === "munderover" || nm === "munder" || nm === "mover" ? "undOvr" : "subSup";
		if (nm === "msubsup" || nm === "munderover") { lo = k[1] ? conv(k[1]) : ""; hi = k[2] ? conv(k[2]) : ""; }
		else if (nm === "msub" || nm === "munder") lo = k[1] ? conv(k[1]) : "";
		else hi = k[1] ? conv(k[1]) : "";
		return wrap("nary", '<m:naryPr><m:chr m:val="' + x(ch) + '"/><m:limLoc m:val="' + loc + '"/>' + (lo ? "" : '<m:subHide m:val="1"/>') + (hi ? "" : '<m:supHide m:val="1"/>') + "</m:naryPr>" +
			(lo ? wrap("sub", lo) : "<m:sub/>") + (hi ? wrap("sup", hi) : "<m:sup/>") + e(operand));
	}
	function fenced(kids) {   // [mo open, ..., mo close] -> m:d
		var o = opChar(kids[0]), c = opChar(kids[kids.length - 1]), mid = kids.slice(1, -1);
		var inner = mid.length === 1 && local(mid[0]) === "mtable" ? table(mid[0], true) : seq(mid);   // pmatrix / bmatrix ...: a real matrix
		return wrap("d", '<m:dPr><m:begChr m:val="' + x(o) + '"/><m:endChr m:val="' + x(c) + '"/></m:dPr>' + e(inner));
	}
	function isFence(n, which) { return isOp(n) && (n.attrs.fence === "true" || n.attrs["data-mjx-texclass"] === which || n.attrs.stretchy === "true") && n.attrs.stretchy !== "false"; }
	function table(n, matrix) {
		var rows = els(n).filter(function (r) { return /^(mtr|mlabeledtr)$/.test(local(r)); });
		if (matrix) {
			var cols = Math.max.apply(null, rows.map(function (r) { return els(r).length; }).concat([1]));
			return wrap("m", '<m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="' + cols + '"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>' + rows.map(function (r) { var cs = els(r); var out = ""; for (var j = 0; j < cols; j++) out += e(cs[j] ? conv(cs[j]) : ""); return wrap("mr", out); }).join(""));
		}
		return wrap("eqArr", rows.map(function (r) {   // aligned / gathered: one row per line, an alignment mark before the 2nd cell
			var cs = els(r).filter(function (c) { return local(c) === "mtd"; });
			return e(cs.map(function (c, j) { var s = conv(c); return j === 1 ? "<m:r><m:rPr><m:aln/></m:rPr><m:t></m:t></m:r>" + s : s; }).join(""));
		}).join(""));
	}
	function conv(n) {
		if (typeof n === "string") return n.trim() ? run(n.replace(/\s+/g, " ")) : "";
		var k = els(n), nm = local(n);
		switch (nm) {
			case "math": case "mrow": case "mstyle": case "mpadded": case "mtd": case "#root": case "maction": case "merror": case "mlabeledtr":
				if (nm === "mrow" && k.length >= 2 && isFence(k[0], "OPEN") && isFence(k[k.length - 1], "CLOSE")) return fenced(k);
				if (nm === "mrow" && k.length === 3 && isOp(k[0]) && isOp(k[2]) && local(k[1]) === "mtable") return wrap("d", '<m:dPr><m:begChr m:val="' + x(opChar(k[0])) + '"/><m:endChr m:val="' + x(opChar(k[2])) + '"/></m:dPr>' + e(table(k[1], true)));
				return seq(k);
			case "semantics": return k[0] ? conv(k[0]) : "";
			case "annotation": case "annotation-xml": case "mphantom": case "none": case "mprescripts": return "";
			case "mi": case "mn": case "mo": case "ms": { var t = text(n).replace(/[⁡⁢⁣⁤]/g, ""); return run(t, nm === "mo" ? (/[A-Za-z]{2,}/.test(t) ? '<m:sty m:val="p"/>' : "") : varPr(n)); }
			case "mtext": return run(text(n).replace(/\s+/g, " "), "<m:nor/>");
			case "mspace": { var w = parseFloat(n.attrs.width || "0"); return w >= 0.8 ? run(" ") : w >= 0.25 ? run(" ") : w > 0 ? run(" ") : ""; }
			case "mfrac": return wrap("f", (n.attrs.linethickness === "0" || n.attrs.linethickness === "0px" ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : "") + arg("num", k[0]) + arg("den", k[1]));
			case "msqrt": return wrap("rad", '<m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' + e(seq(k)));
			case "mroot": return wrap("rad", arg("deg", k[1]) + e(k[0] ? conv(k[0]) : ""));
			case "msup": return wrap("sSup", e(k[0] ? conv(k[0]) : "") + arg("sup", k[1]));
			case "msub": return wrap("sSub", e(k[0] ? conv(k[0]) : "") + arg("sub", k[1]));
			case "msubsup": return wrap("sSubSup", e(k[0] ? conv(k[0]) : "") + arg("sub", k[1]) + arg("sup", k[2]));
			case "mover": {
				if ((n.attrs.accent === "true" || isOp(k[1])) && isOp(k[1]) && text(k[1]).trim().length === 1) return wrap("acc", '<m:accPr><m:chr m:val="' + x(accentChar(text(k[1]).trim())) + '"/></m:accPr>' + e(k[0] ? conv(k[0]) : ""));
				return wrap("limUpp", e(k[0] ? conv(k[0]) : "") + arg("lim", k[1]));
			}
			case "munder": {
				if (isOp(k[1]) && /^[‾_̲⏟―—]$/.test(text(k[1]).trim())) return wrap("groupChr", '<m:groupChrPr><m:chr m:val="' + x(text(k[1]).trim()) + '"/><m:pos m:val="bot"/></m:groupChrPr>' + e(k[0] ? conv(k[0]) : ""));
				return wrap("limLow", e(k[0] ? conv(k[0]) : "") + arg("lim", k[1]));
			}
			case "munderover": return wrap("limUpp", e(wrap("limLow", e(k[0] ? conv(k[0]) : "") + arg("lim", k[1]))) + arg("lim", k[2]));
			case "mtable": return table(n, false);
			case "mtr": return seq(k);
			case "menclose": return /box|roundedbox/.test(n.attrs.notation || "box") ? wrap("borderBox", e(seq(k))) : seq(k);
			case "mfenced": { var o = n.attrs.open != null ? n.attrs.open : "(", c = n.attrs.close != null ? n.attrs.close : ")"; return wrap("d", '<m:dPr><m:begChr m:val="' + x(o) + '"/><m:endChr m:val="' + x(c) + '"/></m:dPr>' + k.map(function (z) { return e(conv(z)); }).join("")); }
			case "mmultiscripts": return wrap("sSubSup", e(k[0] ? conv(k[0]) : "") + arg("sub", k[1]) + arg("sup", k[2]));
			default: return seq(k);
		}
	}
	function accentChar(c) { return { "^": "̂", "ˆ": "̂", "~": "̃", "˜": "̃", "¯": "̅", "‾": "̅", "→": "⃗", "˙": "̇", "¨": "̈", "ˇ": "̌", "˘": "̆", "´": "́", "`": "̀" }[c] || c; }
	function fromMathML(mml, display) {
		var r = parse(mml), m = els(r).filter(function (n) { return local(n) === "math"; })[0] || r;
		var body = conv(m) || run(" ");
		var om = "<m:oMath>" + body + "</m:oMath>";
		return display || (m.attrs && m.attrs.display === "block" && display !== false) ? "<m:oMathPara>" + om + "</m:oMathPara>" : om;
	}

	/* ---------------- OMML -> MathML (previews) ---------------- */
	function mk(tag, inner, attrs) { return "<" + tag + (attrs || "") + ">" + inner + "</" + tag + ">"; }
	function child(n, name) { for (var i = 0; i < n.kids.length; i++) { var k = n.kids[i]; if (typeof k !== "string" && local(k) === name) return k; } return null; }
	function val(n, name) { var c = n && child(n, name); return c ? (c.attrs["m:val"] != null ? c.attrs["m:val"] : c.attrs.val) : null; }
	function back(n) {
		if (typeof n === "string") return "";
		var nm = local(n), k = els(n);
		var kids = function (name) { var c = child(n, name); return c ? mk("mrow", c.kids.map(back).join("")) : "<mrow></mrow>"; };
		switch (nm) {
			case "oMathPara": case "oMath": case "e": case "num": case "den": case "sub": case "sup": case "deg": case "lim": case "fName": return k.map(back).join("");
			case "r": {
				var t = k.filter(function (z) { return local(z) === "t"; }).map(text).join(""), pr = child(n, "rPr"), nor = pr && child(pr, "nor"), sty = val(pr, "sty"), scr = val(pr, "scr");
				if (!t) return "";
				if (nor) return mk("mtext", x(t));
				var out = "", re = /(\d+(?:\.\d+)?)|([A-Za-z\u0370-\u03ff\u{1D400}-\u{1D7FF}])|(\s+)|([\s\S])/gu, m, mv = scr === "double-struck" ? ' mathvariant="double-struck"' : sty === "b" ? ' mathvariant="bold"' : sty === "p" ? ' mathvariant="normal"' : "";
				if (sty === "p" && /^[A-Za-z]{2,}$/.test(t)) return mk("mi", x(t));
				while ((m = re.exec(t))) { if (m[1]) out += mk("mn", m[1]); else if (m[2]) out += mk("mi", x(m[2]), mv); else if (m[3]) out += mk("mspace", "", ' width="0.25em"'); else out += mk("mo", x(m[4])); }
				return out;
			}
			case "f": return val(child(n, "fPr"), "type") === "lin" ? kids("num") + "<mo>/</mo>" + kids("den") : mk("mfrac", kids("num") + kids("den"), val(child(n, "fPr"), "type") === "noBar" ? ' linethickness="0"' : "");
			case "rad": { var hide = val(child(n, "radPr"), "degHide"); return hide === "1" || hide === "on" || hide === "true" || !child(n, "deg") || !els(child(n, "deg")).length ? mk("msqrt", kids("e")) : mk("mroot", kids("e") + kids("deg")); }
			case "sSup": return mk("msup", kids("e") + kids("sup"));
			case "sSub": return mk("msub", kids("e") + kids("sub"));
			case "sSubSup": return mk("msubsup", kids("e") + kids("sub") + kids("sup"));
			case "sPre": return mk("mmultiscripts", kids("e") + "<mprescripts/>" + kids("sub") + kids("sup"));
			case "nary": {
				var pr2 = child(n, "naryPr"), ch = val(pr2, "chr") || "∫", sh = val(pr2, "subHide") === "1", ph = val(pr2, "supHide") === "1", und = val(pr2, "limLoc") === "undOvr" || (!val(pr2, "limLoc") && /[∑∏⋃⋂]/.test(ch));
				var op = mk("mo", x(ch), ' largeop="true"'), lo = sh ? "" : kids("sub"), hi = ph ? "" : kids("sup");
				var head = lo && hi ? mk(und ? "munderover" : "msubsup", op + lo + hi) : lo ? mk(und ? "munder" : "msub", op + lo) : hi ? mk(und ? "mover" : "msup", op + hi) : op;
				return head + kids("e");
			}
			case "d": {
				var dp = child(n, "dPr"), b = val(dp, "begChr"), en = val(dp, "endChr"), sep = val(dp, "sepChr") || "|", es = k.filter(function (z) { return local(z) === "e"; });
				if (b == null) b = "("; if (en == null) en = ")";
				return mk("mrow", (b ? mk("mo", x(b), ' fence="true" stretchy="true"') : "") + es.map(function (z) { return mk("mrow", back(z)); }).join(mk("mo", x(sep))) + (en ? mk("mo", x(en), ' fence="true" stretchy="true"') : ""));
			}
			case "m": return mk("mtable", k.filter(function (z) { return local(z) === "mr"; }).map(function (r) { return mk("mtr", els(r).filter(function (z) { return local(z) === "e"; }).map(function (c) { return mk("mtd", back(c)); }).join("")); }).join(""));
			case "eqArr": return mk("mtable", k.filter(function (z) { return local(z) === "e"; }).map(function (r) { return mk("mtr", mk("mtd", back(r))); }).join(""), ' columnalign="left"');
			case "acc": return mk("mover", kids("e") + mk("mo", x(val(child(n, "accPr"), "chr") || "̂")), ' accent="true"');
			case "bar": return val(child(n, "barPr"), "pos") === "bot" ? mk("munder", kids("e") + "<mo>_</mo>") : mk("mover", kids("e") + "<mo>‾</mo>", ' accent="true"');
			case "limLow": return mk("munder", kids("e") + kids("lim"));
			case "limUpp": return mk("mover", kids("e") + kids("lim"));
			case "groupChr": { var gp = child(n, "groupChrPr"), gc = val(gp, "chr") || "⏟"; return val(gp, "pos") === "top" ? mk("mover", kids("e") + mk("mo", x(gc))) : mk("munder", kids("e") + mk("mo", x(gc))); }
			case "func": return kids("fName") + "<mo>⁡</mo>" + kids("e");
			case "borderBox": return mk("menclose", kids("e"), ' notation="box"');
			case "box": case "phant": return kids("e");
			case "rPr": case "fPr": case "radPr": case "naryPr": case "dPr": case "accPr": case "mPr": case "ctrlPr": case "oMathParaPr": case "eqArrPr": case "sSupPr": case "sSubPr": case "sSubSupPr": case "limLowPr": case "limUppPr": case "funcPr": case "barPr": case "groupChrPr": case "borderBoxPr": case "boxPr": case "argPr": return "";
			default: return k.map(back).join("");
		}
	}
	function toMathML(omml) {
		var r = parse(omml), para = /oMathPara/.test(String(omml).slice(0, 400));
		return '<math xmlns="http://www.w3.org/1998/Math/MathML"' + (para ? ' display="block"' : "") + ">" + mk("mrow", els(r).map(back).join("")) + "</math>";
	}
	var api = { NS: NS, parse: parse, fromMathML: fromMathML, toMathML: toMathML, text: text };
	if (typeof module === "object" && module.exports) module.exports = api; else root.MESOmml = api;
})(typeof window !== "undefined" ? window : this);
